using System.Collections.Concurrent;
using System.Net;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using RestaurantSystem.Api.Security;

namespace RestaurantSystem.Api.Middleware;

public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled server exception occurred: {Message}", ex.Message);
            await HandleExceptionAsync(context, ex);
        }
    }

    private static Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        context.Response.ContentType = "application/problem+json";

        var (statusCode, title, message) = exception switch
        {
            TenantIsolationException =>
                (HttpStatusCode.Forbidden, "Tenant Isolation Violation", exception.Message),

            ArgumentException or FormatException or JsonException =>
                (HttpStatusCode.BadRequest, "Bad Request", exception.Message),

            UnauthorizedAccessException =>
                (HttpStatusCode.Unauthorized, "Unauthorized", "Access denied. Authentication required."),

            KeyNotFoundException =>
                (HttpStatusCode.NotFound, "Not Found", exception.Message),

            InvalidOperationException =>
                (HttpStatusCode.Conflict, "Conflict", exception.Message),

            Microsoft.EntityFrameworkCore.DbUpdateException dbEx =>
                (HttpStatusCode.BadRequest, "Database Error", dbEx.InnerException?.Message ?? dbEx.Message),

            _ => (HttpStatusCode.InternalServerError, "Internal Server Error", exception.Message)
        };

        context.Response.StatusCode = (int)statusCode;

        var problemDetails = new ProblemDetails
        {
            Status = (int)statusCode,
            Title = title,
            Detail = message,
            Instance = context.Request.Path
        };

        // Note: Secrets, connection strings, and raw stack traces are NEVER exposed in response! (Section 62)
        var json = JsonSerializer.Serialize(problemDetails, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        });
        return context.Response.WriteAsync(json);
    }
}

public class TenantSecurityMiddleware
{
    private readonly RequestDelegate _next;

    public TenantSecurityMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // 1. Check disabled status claim in token
        var statusClaim = context.User?.FindFirst("status")?.Value;
        if (string.Equals(statusClaim, "DISABLED", StringComparison.OrdinalIgnoreCase))
        {
            context.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
            await context.Response.WriteAsJsonAsync(new ProblemDetails
            {
                Status = 401,
                Title = "Account Deactivated",
                Detail = "Your staff account has been disabled by management."
            });
            return;
        }

        // 2. Extract restaurant_id claim if user is authenticated staff
        var restaurantClaim = context.User?.FindFirst("restaurant_id")?.Value;
        if (!string.IsNullOrEmpty(restaurantClaim) && Guid.TryParse(restaurantClaim, out var claimRestaurantId))
        {
            context.Items["TenantRestaurantId"] = claimRestaurantId;

            // Check if header specifies another restaurant
            if (context.Request.Headers.TryGetValue("X-Restaurant-Id", out var headerResId) &&
                Guid.TryParse(headerResId, out var requestedHeaderResId) &&
                requestedHeaderResId != claimRestaurantId &&
                !(context.User?.IsInRole("SUPER_ADMIN") ?? false))
            {
                context.Response.StatusCode = (int)HttpStatusCode.Forbidden;
                await context.Response.WriteAsJsonAsync(new ProblemDetails
                {
                    Status = 403,
                    Title = "Tenant Isolation Violation",
                    Detail = "Cross-restaurant access is strictly prohibited."
                });
                return;
            }

            // Check if query string specifies another restaurant
            if (context.Request.Query.TryGetValue("restaurantId", out var queryResId) &&
                Guid.TryParse(queryResId, out var requestedQueryResId) &&
                requestedQueryResId != claimRestaurantId &&
                !(context.User?.IsInRole("SUPER_ADMIN") ?? false))
            {
                context.Response.StatusCode = (int)HttpStatusCode.Forbidden;
                await context.Response.WriteAsJsonAsync(new ProblemDetails
                {
                    Status = 403,
                    Title = "Tenant Isolation Violation",
                    Detail = "Cross-restaurant access is strictly prohibited."
                });
                return;
            }
        }

        await _next(context);
    }
}

public class MemoryRateLimitingMiddleware
{
    private readonly RequestDelegate _next;
    private static readonly ConcurrentDictionary<string, (int Count, DateTime WindowStart)> RequestCounters = new();
    private const int MaxRequestsPerMinute = 120;
    private const int MaxAuthRequestsPerMinute = 20;

    public MemoryRateLimitingMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var ip = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var path = context.Request.Path.Value?.ToLowerInvariant() ?? "";
        var key = $"{ip}:{path}";

        var limit = path.Contains("/api/auth") ? MaxAuthRequestsPerMinute : MaxRequestsPerMinute;
        var now = DateTime.UtcNow;

        var entry = RequestCounters.AddOrUpdate(
            key,
            _ => (1, now),
            (_, old) =>
            {
                if ((now - old.WindowStart).TotalMinutes >= 1)
                {
                    return (1, now);
                }
                return (old.Count + 1, old.WindowStart);
            }
        );

        if (entry.Count > limit)
        {
            context.Response.StatusCode = (int)HttpStatusCode.TooManyRequests;
            context.Response.Headers.RetryAfter = "60";
            await context.Response.WriteAsJsonAsync(new ProblemDetails
            {
                Status = 429,
                Title = "Too Many Requests",
                Detail = "Rate limit exceeded. Please wait a moment before trying again."
            });
            return;
        }

        await _next(context);
    }
}
