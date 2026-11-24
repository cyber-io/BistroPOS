using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using FluentValidation;
using FluentValidation.AspNetCore;
using RestaurantSystem.Api.Validators;
using RestaurantSystem.Api.Security;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using RestaurantSystem.Api.Configuration;
using RestaurantSystem.Api.Hubs;
using RestaurantSystem.Api.Middleware;
using RestaurantSystem.Api.Models;
using RestaurantSystem.Api.Repositories;
using RestaurantSystem.Api.Services;

var builder = WebApplication.CreateBuilder(args);
if (string.IsNullOrEmpty(builder.Configuration["urls"])) builder.WebHost.UseUrls("http://127.0.0.1:5050");

// 1. Strongly Typed Configuration Options
builder.Services.Configure<SupabaseOptions>(builder.Configuration.GetSection(SupabaseOptions.SectionName));
builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection(JwtOptions.SectionName));
builder.Services.Configure<BusinessRulesOptions>(builder.Configuration.GetSection(BusinessRulesOptions.SectionName));
builder.Services.Configure<PaymentGatewayOptions>(builder.Configuration.GetSection(PaymentGatewayOptions.SectionName));

var jwtOptions = builder.Configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>() ?? new JwtOptions();

// 2. Database Connection (PostgreSQL / Supabase)
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
builder.Services.AddDbContext<RestaurantDbContext>(options =>
{
    if (!string.IsNullOrEmpty(connectionString))
    {
        options.UseNpgsql(connectionString);
    }
    else
    {
        options.UseInMemoryDatabase("RestaurantSystemInMemoryDb");
    }
});

// 3. Authentication & Authorization (ASP.NET Core RBAC)
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.RequireHttpsMetadata = false;
    options.SaveToken = true;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOptions.SecretKey.PadRight(32))),
        ValidateIssuer = !string.IsNullOrEmpty(jwtOptions.Issuer),
        ValidIssuer = jwtOptions.Issuer,
        ValidateAudience = !string.IsNullOrEmpty(jwtOptions.Audience),
        ValidAudience = jwtOptions.Audience,
        ValidateLifetime = true,
        ClockSkew = TimeSpan.Zero
    };

    // Allow SignalR to read access token from query string
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var accessToken = context.Request.Query["access_token"];
            var path = context.HttpContext.Request.Path;
            if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs"))
            {
                context.Token = accessToken;
            }
            return Task.CompletedTask;
        }
    };
});

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("SuperAdminOnly", policy => policy.RequireRole(UserRoles.SuperAdmin));
    options.AddPolicy("ReceptionistOrAdmin", policy => policy.RequireRole(UserRoles.SuperAdmin, UserRoles.Receptionist));
    options.AddPolicy("KitchenStaff", policy => policy.RequireRole(UserRoles.SuperAdmin, UserRoles.Kitchen));
    options.AddPolicy("WaiterStaff", policy => policy.RequireRole(UserRoles.SuperAdmin, UserRoles.Waiter));
    options.AddPolicy("CustomerAccess", policy => policy.RequireRole(UserRoles.Customer, UserRoles.SuperAdmin));
});

// 4. SignalR Real-Time Communications
builder.Services.AddSignalR();
builder.Services.AddHostedService<WorkflowExpiryService>();

// 5. Application Services Dependency Injection
builder.Services.AddHttpClient();
builder.Services.AddHttpContextAccessor();
builder.Services.AddSingleton<ResourceTokens>();
builder.Services.AddScoped<ResourceAccessFilter>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IOrderService, OrderService>();
builder.Services.AddScoped<IReservationService, ReservationService>();
builder.Services.AddScoped<ITableService, TableService>();
builder.Services.AddScoped<IHelpRequestService, HelpRequestService>();
builder.Services.AddScoped<IInventoryService, InventoryService>();
builder.Services.AddScoped<ILoyaltyService, LoyaltyService>();
builder.Services.AddScoped<IFeedbackService, FeedbackService>();
builder.Services.AddScoped<IPaymentService, PaymentService>();
builder.Services.AddScoped<INotificationService, NotificationService>();
builder.Services.AddScoped<IAuditLogService, AuditLogService>();
builder.Services.AddScoped<IEmailReceiptService, EmailReceiptService>();
builder.Services.AddScoped<IWaitlistService, WaitlistService>();

// 6. Controllers and OpenAPI Documentation
builder.Services.AddControllers(options => options.Filters.AddService<ResourceAccessFilter>());
builder.Services.AddFluentValidationAutoValidation();
builder.Services.AddValidatorsFromAssemblyContaining<CreateOrderRequestValidator>();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Complete Restaurant & Café Management API",
        Version = "v1",
        Description = ".NET 8 Web API powering Customer QR Dine-In, Kitchen KDS, Waiter, Receptionist, and Public Website."
    });

    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "JWT Authorization header using the Bearer scheme. Enter 'Bearer' [space] and then your token.",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.ApiKey,
        Scheme = "Bearer"
    });

    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

// 7. CORS Configuration
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontendApp", policy =>
    {
        policy.WithOrigins("http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

var app = builder.Build();

// 8. Middleware Pipeline
app.UseMiddleware<ExceptionHandlingMiddleware>();
app.UseMiddleware<MemoryRateLimitingMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("AllowFrontendApp");

app.UseAuthentication();
app.UseAuthorization();

app.UseMiddleware<TenantSecurityMiddleware>();

app.MapGet("/api/health", async (RestaurantDbContext db) => {
    try { var connected = await db.Database.CanConnectAsync(); return Results.Json(new { status = connected ? "ok" : "database-unavailable", environment = app.Environment.EnvironmentName, database = "PostgreSQL", schema = "restaurant_pos" }, statusCode: connected ? 200 : 503); }
    catch { return Results.Json(new { status = "database-unavailable" }, statusCode: 503); }
});
app.MapControllers();
app.MapHub<NotificationHub>("/hubs/notifications");

// Ensure PostgreSQL versioned migrations are applied cleanly & report failures
try
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<RestaurantDbContext>();
    await DatabaseMigrationService.ApplyMigrationsAsync(db, app.Logger);
}
catch (Exception ex)
{
    app.Logger.LogError(ex, "Database schema migration encountered an error during startup: {Message}", ex.Message);
}

try
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<RestaurantDbContext>();
    await UserProvisioning.EnsureDefaultDataAsync(db);
    await DiningAreaProvisioning.EnsureDefaultDiningAreasAsync(db);
}
catch (Exception exception)
{
    app.Logger.LogError(exception, "Could not provision default users or dining areas.");
}

app.Run();
