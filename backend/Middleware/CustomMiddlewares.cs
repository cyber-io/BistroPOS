using System.Collections.Concurrent;
using System.Net;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using RestaurantSystem.Api.Models;
using RestaurantSystem.Api.Repositories;
using RestaurantSystem.Api.Security;

namespace RestaurantSystem.Api.Middleware;

public class SecurityHeadersMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context)
    {
        context.Response.OnStarting(() =>
        {
            var headers = context.Response.Headers;
            headers.TryAdd("X-Content-Type-Options", "nosniff");
            headers.TryAdd("X-Frame-Options", "DENY");
            headers.TryAdd("Referrer-Policy", "strict-origin-when-cross-origin");
            headers.TryAdd("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
            headers.TryAdd("X-Permitted-Cross-Domain-Policies", "none");

            if (context.Request.Path.StartsWithSegments("/api"))
            {
                headers.TryAdd("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
            }

            return Task.CompletedTask;
        });

        await next(context);
    }
}

public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;
    private readonly IHostEnvironment _env;

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger, IHostEnvironment env)
    {
        _next = next;
        _logger = logger;
        _env = env;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled server exception occurred (TraceId {TraceId}): {Message}", context.TraceIdentifier, ex.Message);
            await HandleExceptionAsync(context, ex, _env.IsDevelopment());
        }
    }

    private static bool IsDatabaseUnavailableException(Exception exception)
    {
        for (Exception? current = exception; current != null; current = current.InnerException)
        {
            if (current is Npgsql.PostgresException pgEx)
            {
                return pgEx.IsTransient || (pgEx.SqlState?.StartsWith("08", StringComparison.Ordinal) ?? false);
            }

            if (current is Npgsql.NpgsqlException ||
                current is System.Net.Sockets.SocketException ||
                current is TimeoutException)
            {
                return true;
            }
        }

        return false;
    }

    private static Task HandleExceptionAsync(HttpContext context, Exception exception, bool isDevelopment)
    {
        context.Response.ContentType = "application/problem+json";

        var (statusCode, title, message) = IsDatabaseUnavailableException(exception)
            ? (HttpStatusCode.ServiceUnavailable, "Service Unavailable", "Database connection unavailable. Please try again later.")
            : exception switch
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
                    (HttpStatusCode.BadRequest, "Database Error", isDevelopment
                        ? (dbEx.InnerException?.Message ?? dbEx.Message)
                        : "The request violated a data integrity rule."),

                _ => (HttpStatusCode.InternalServerError, "Internal Server Error", isDevelopment
                        ? exception.Message
                        : "An unexpected error occurred. Please contact support with your trace ID.")
            };

        context.Response.StatusCode = (int)statusCode;

        var problemDetails = new ProblemDetails
        {
            Status = (int)statusCode,
            Title = title,
            Detail = message,
            Instance = context.Request.Path
        };
        problemDetails.Extensions["traceId"] = context.TraceIdentifier;

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
        // 1. Check disabled or inactive status claim in token
        var statusClaim = context.User?.FindFirst("status")?.Value;
        if (string.Equals(statusClaim, "DISABLED", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(statusClaim, "INACTIVE", StringComparison.OrdinalIgnoreCase))
        {
            context.Response.StatusCode = (int)HttpStatusCode.Unauthorized;
            await context.Response.WriteAsJsonAsync(new ProblemDetails
            {
                Status = 401,
                Title = "Account Deactivated",
                Detail = "Your account is inactive or has been disabled by management."
            });
            return;
        }

        // 2. Extract restaurant_id claim if user is authenticated staff
        var restaurantClaim = context.User?.FindFirst("restaurant_id")?.Value;
        if (!string.IsNullOrEmpty(restaurantClaim) && Guid.TryParse(restaurantClaim, out var claimRestaurantId))
        {
            context.Items["TenantRestaurantId"] = claimRestaurantId;

            // Inactive restaurant check: Block all non-superadmin staff requests if the restaurant is inactive
            if (!(context.User?.IsInRole(UserRoles.SuperAdmin) ?? false))
            {
                var db = context.RequestServices.GetService<RestaurantDbContext>();
                if (db != null)
                {
                    var restaurant = await db.Restaurants.FindAsync(claimRestaurantId);
                    if (restaurant != null && string.Equals(restaurant.Status, "INACTIVE", StringComparison.OrdinalIgnoreCase))
                    {
                        context.Response.StatusCode = (int)HttpStatusCode.Forbidden;
                        await context.Response.WriteAsJsonAsync(new ProblemDetails
                        {
                            Status = 403,
                            Title = "Restaurant Inactive",
                            Detail = $"The restaurant '{restaurant.Name}' has been deactivated or suspended by platform administration. Access to POS, kitchen, waiter, and receptionist workspaces is suspended."
                        });
                        return;
                    }
                }
            }

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
    private static long _requestTick;
    private const int MaxRequestsPerMinute = 1200;
    private const int MaxAuthRequestsPerMinute = 60;
    private const int MaxTrackedKeys = 10000;

    public MemoryRateLimitingMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path.Value?.ToLowerInvariant() ?? "";

        // Rely on ASP.NET Connection.RemoteIpAddress (populated safely by UseForwardedHeaders only for known proxies)
        var ip = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var isLoopback = ip is "127.0.0.1" or "::1" or "::ffff:127.0.0.1";
        var isReadPollingEndpoint = path.Contains("/api/menu/items") || path.Contains("/api/tables") || path.Contains("/api/health");

        if (isLoopback && isReadPollingEndpoint)
        {
            await _next(context);
            return;
        }

        var now = DateTime.UtcNow;

        // Periodically prune expired rate-limit entries to prevent unbounded memory growth
        var tick = Interlocked.Increment(ref _requestTick);
        if (tick % 500 == 0 || RequestCounters.Count > MaxTrackedKeys)
        {
            foreach (var kvp in RequestCounters)
            {
                if ((now - kvp.Value.WindowStart).TotalMinutes >= 2)
                {
                    RequestCounters.TryRemove(kvp.Key, out _);
                }
            }
        }

        var key = $"{ip}:{path}";
        var limit = path.Contains("/api/auth") ? MaxAuthRequestsPerMinute : MaxRequestsPerMinute;

        var entry = RequestCounters.AddOrUpdate(
            key,
            _ => (1, now),
            (_, old) => (now - old.WindowStart).TotalMinutes >= 1 ? (1, now) : (old.Count + 1, old.WindowStart)
        );

        if (entry.Count > limit)
        {
            context.Response.StatusCode = (int)HttpStatusCode.TooManyRequests;
            context.Response.Headers.RetryAfter = "30";
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
