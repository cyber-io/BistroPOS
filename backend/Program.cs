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

// Ensure PostgreSQL tables_status_check allows CLEANING status & purge requested stale orders
try
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<RestaurantDbContext>();
    if (db.Database.IsNpgsql())
    {
        var migrations = new[]
        {
            "ALTER TABLE restaurant_pos.tables DROP CONSTRAINT IF EXISTS tables_status_check;",
            "ALTER TABLE restaurant_pos.tables ADD CONSTRAINT tables_status_check CHECK (status IN ('AVAILABLE', 'RESERVED', 'OCCUPIED', 'WAITING_FOR_CLEANING', 'CLEANING', 'OUT_OF_SERVICE'));",

            // Phase 1 Schema extensions
            "ALTER TABLE restaurant_pos.menu_items ADD COLUMN IF NOT EXISTS allergens JSONB DEFAULT '[]'::jsonb;",
            "ALTER TABLE restaurant_pos.menu_items ADD COLUMN IF NOT EXISTS ingredients TEXT;",
            "ALTER TABLE restaurant_pos.menu_items ADD COLUMN IF NOT EXISTS portions JSONB DEFAULT '[]'::jsonb;",
            "ALTER TABLE restaurant_pos.menu_items ADD COLUMN IF NOT EXISTS dietary_tags JSONB DEFAULT '[]'::jsonb;",
            "ALTER TABLE restaurant_pos.menu_items ADD COLUMN IF NOT EXISTS is_special BOOLEAN DEFAULT FALSE;",
            "ALTER TABLE restaurant_pos.menu_items ADD COLUMN IF NOT EXISTS prep_time_minutes INT DEFAULT 15;",

            @"CREATE TABLE IF NOT EXISTS restaurant_pos.dining_sessions (
                session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                restaurant_id UUID NOT NULL REFERENCES restaurant_pos.restaurants(restaurant_id) ON DELETE CASCADE,
                table_id UUID NOT NULL REFERENCES restaurant_pos.tables(table_id) ON DELETE CASCADE,
                session_code VARCHAR(50) NOT NULL,
                status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CLOSED')),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                closed_at TIMESTAMPTZ
            );",
            "CREATE INDEX IF NOT EXISTS idx_dining_sessions_table ON restaurant_pos.dining_sessions(table_id, status);",

            "ALTER TABLE restaurant_pos.orders ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES restaurant_pos.dining_sessions(session_id) ON DELETE SET NULL;",
            "ALTER TABLE restaurant_pos.orders ADD COLUMN IF NOT EXISTS estimated_prep_time_minutes INT DEFAULT 15;",
            "ALTER TABLE restaurant_pos.orders ADD COLUMN IF NOT EXISTS estimated_ready_at TIMESTAMPTZ;",

            "ALTER TABLE restaurant_pos.help_requests ADD COLUMN IF NOT EXISTS request_type VARCHAR(50) DEFAULT 'CUSTOM';",

            // Phase 2 Schema extensions
            "ALTER TABLE restaurant_pos.tables ADD COLUMN IF NOT EXISTS position_x INT DEFAULT 0;",
            "ALTER TABLE restaurant_pos.tables ADD COLUMN IF NOT EXISTS position_y INT DEFAULT 0;",
            "ALTER TABLE restaurant_pos.tables ADD COLUMN IF NOT EXISTS shape VARCHAR(50) DEFAULT 'SQUARE';",
            "ALTER TABLE restaurant_pos.tables ADD COLUMN IF NOT EXISTS dining_area VARCHAR(50) DEFAULT 'everyday';",

            @"CREATE TABLE IF NOT EXISTS restaurant_pos.inventory_items (
                item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                restaurant_id UUID NOT NULL REFERENCES restaurant_pos.restaurants(restaurant_id) ON DELETE CASCADE,
                name VARCHAR(150) NOT NULL,
                category VARCHAR(100) DEFAULT 'GENERAL',
                unit VARCHAR(50) NOT NULL,
                current_stock NUMERIC(10,2) NOT NULL DEFAULT 0,
                min_threshold NUMERIC(10,2) NOT NULL DEFAULT 5,
                cost_per_unit NUMERIC(10,2) NOT NULL DEFAULT 0,
                status VARCHAR(50) NOT NULL DEFAULT 'IN_STOCK',
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );",
            "CREATE INDEX IF NOT EXISTS idx_inventory_restaurant ON restaurant_pos.inventory_items(restaurant_id, status);",

            @"CREATE TABLE IF NOT EXISTS restaurant_pos.customer_loyalty (
                loyalty_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                restaurant_id UUID NOT NULL REFERENCES restaurant_pos.restaurants(restaurant_id) ON DELETE CASCADE,
                customer_phone VARCHAR(20) NOT NULL,
                customer_name VARCHAR(100),
                customer_email VARCHAR(100),
                points_balance INT NOT NULL DEFAULT 0,
                lifetime_points INT NOT NULL DEFAULT 0,
                tier VARCHAR(20) NOT NULL DEFAULT 'BRONZE',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                CONSTRAINT uq_customer_loyalty_phone UNIQUE (restaurant_id, customer_phone)
            );",

            @"CREATE TABLE IF NOT EXISTS restaurant_pos.customer_feedbacks (
                feedback_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                restaurant_id UUID NOT NULL REFERENCES restaurant_pos.restaurants(restaurant_id) ON DELETE CASCADE,
                order_id UUID REFERENCES restaurant_pos.orders(order_id) ON DELETE SET NULL,
                customer_name VARCHAR(100),
                customer_phone VARCHAR(20),
                rating INT NOT NULL DEFAULT 5,
                food_rating INT DEFAULT 5,
                service_rating INT DEFAULT 5,
                ambiance_rating INT DEFAULT 5,
                comment TEXT,
                google_review_clicked BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );",

            "ALTER TABLE restaurant_pos.restaurants ADD COLUMN IF NOT EXISTS wifi_ssid VARCHAR(100) DEFAULT 'Bistro-HighSpeed-Guest';",
            "ALTER TABLE restaurant_pos.restaurants ADD COLUMN IF NOT EXISTS wifi_password VARCHAR(100) DEFAULT 'Bistro@2026';",
            "ALTER TABLE restaurant_pos.restaurants ADD COLUMN IF NOT EXISTS wifi_enabled BOOLEAN DEFAULT TRUE;",
            "ALTER TABLE restaurant_pos.restaurants ADD COLUMN IF NOT EXISTS google_review_url VARCHAR(255) DEFAULT 'https://maps.google.com';",
            "ALTER TABLE restaurant_pos.restaurants ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(50) DEFAULT 'PRO';",

            "ALTER TABLE restaurant_pos.payments ADD COLUMN IF NOT EXISTS tip_amount NUMERIC(10,2) DEFAULT 0.00;",
            "ALTER TABLE restaurant_pos.payments ADD COLUMN IF NOT EXISTS split_count INT DEFAULT 1;",
            "ALTER TABLE restaurant_pos.payments ADD COLUMN IF NOT EXISTS split_type VARCHAR(50) DEFAULT 'FULL';",

            // Public schema fallbacks
            "ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS google_review_url VARCHAR(255) DEFAULT 'https://maps.google.com';",
            "ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS wifi_ssid VARCHAR(100) DEFAULT 'Bistro-HighSpeed-Guest';",
            "ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS wifi_password VARCHAR(100) DEFAULT 'Bistro@2026';",
            "ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS wifi_enabled BOOLEAN DEFAULT TRUE;",
            "ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(50) DEFAULT 'PRO';"
        };

        foreach (var sql in migrations)
        {
            try
            {
                await db.Database.ExecuteSqlRawAsync(sql);
            }
            catch
            {
                // Continue with next statement even if table/schema doesn't exist
            }
        }
    }

    var targetOrderNumbers = new[] { "ORD-0D10DC7FC6", "ORD-66A6B8C8CB" };
    var targetOrders = await db.Orders.Where(o => targetOrderNumbers.Contains(o.OrderNumber)).ToListAsync();
    if (targetOrders.Any())
    {
        var targetIds = targetOrders.Select(o => o.OrderId).ToList();
        var targetItems = await db.OrderItems.Where(i => targetIds.Contains(i.OrderId)).ToListAsync();
        db.OrderItems.RemoveRange(targetItems);
        var targetPayments = await db.Payments.Where(p => p.OrderId.HasValue && targetIds.Contains(p.OrderId.Value)).ToListAsync();
        db.Payments.RemoveRange(targetPayments);
        var targetIssues = await db.CustomerIssues.Where(i => i.OrderId.HasValue && targetIds.Contains(i.OrderId.Value)).ToListAsync();
        db.CustomerIssues.RemoveRange(targetIssues);
        db.Orders.RemoveRange(targetOrders);
        await db.SaveChangesAsync();
    }
}
catch { /* Database initialization or mock environment */ }

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
