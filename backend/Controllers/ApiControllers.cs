using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using RestaurantSystem.Api.Configuration;
using RestaurantSystem.Api.DTOs;
using RestaurantSystem.Api.Models;
using RestaurantSystem.Api.Repositories;
using RestaurantSystem.Api.Security;
using RestaurantSystem.Api.Services;

namespace RestaurantSystem.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _auth;
    private readonly IHostEnvironment _env;
    private readonly FeaturesOptions _features;

    public AuthController(IAuthService auth, IHostEnvironment env, IOptions<FeaturesOptions> features)
    {
        _auth = auth;
        _env = env;
        _features = features.Value;
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request)
    {
        var result = await _auth.RegisterAsync(request);
        if (!result.Success) return BadRequest(result);
        return Ok(result);
    }

    [HttpPost("demo-login")]
    public async Task<IActionResult> DemoLogin([FromBody] DemoLoginRequest request)
    {
        if (!_env.IsDevelopment() || !_features.EnableDemoLogin)
        {
            return NotFound(new { message = "Demonstration login is disabled." });
        }

        var result = await _auth.DemoLoginAsync(request.Role, request.RestaurantId);
        return result.Success ? Ok(result) : BadRequest(result);
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var result = await _auth.LoginAsync(request);
        if (!result.Success) return Unauthorized(result);
        return Ok(result);
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> GetCurrentUser()
    {
        var userIdStr = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdStr) || !Guid.TryParse(userIdStr, out var userId))
        {
            return Unauthorized();
        }

        var user = await _auth.GetUserByIdAsync(userId);
        if (user == null) return NotFound();
        return Ok(user);
    }

    [Authorize]
    [HttpGet("context")]
    public async Task<IActionResult> GetCurrentContext()
    {
        var context = await _auth.GetCurrentUserContextAsync();
        return context != null ? Ok(context) : Unauthorized();
    }

    [Authorize]
    [HttpPatch("profile")]
    public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileRequest request)
    {
        var userIdStr = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdStr) || !Guid.TryParse(userIdStr, out var userId))
        {
            return Unauthorized();
        }

        var result = await _auth.UpdateProfileAsync(userId, request);
        if (!result.Success) return BadRequest(result);
        return Ok(result);
    }

    [Authorize(Policy = "ManagerOrAdmin")]
    [HttpPost("staff")]
    public async Task<IActionResult> CreateStaff([FromBody] CreateStaffRequest request)
    {
        var result = await _auth.CreateStaffAsync(request);
        if (!result.Success) return BadRequest(new { message = result.Message });
        return Created($"/api/auth/staff/{result.Staff!.UserId}", result.Staff);
    }

    [Authorize(Policy = "ManagerOrAdmin")]
    [HttpGet("staff")]
    public async Task<IActionResult> GetStaff([FromQuery] Guid? restaurantId)
    {
        var staffList = await _auth.GetStaffAsync(restaurantId);
        return Ok(staffList);
    }

    [Authorize(Policy = "ManagerOrAdmin")]
    [HttpPatch("staff/{id:guid}/status")]
    public async Task<IActionResult> UpdateStaffStatus(Guid id, [FromBody] UpdateStaffStatusRequest request)
    {
        var result = await _auth.UpdateStaffStatusAsync(id, request.Status);
        if (!result.Success) return BadRequest(new { message = result.Message });
        return Ok(new { success = true, message = result.Message });
    }

    [Authorize(Policy = "SuperAdminOnly")]
    [HttpPost("managers")]
    public async Task<IActionResult> CreateManager([FromBody] CreateManagerRequest request)
    {
        var result = await _auth.CreateManagerAsync(request);
        if (!result.Success) return BadRequest(new { message = result.Message });
        return Created($"/api/auth/staff/{result.Manager!.UserId}", result.Manager);
    }
}

[ApiController]
[Route("api/[controller]")]
public class RestaurantsController : ControllerBase
{
    private readonly RestaurantDbContext _db;

    public RestaurantsController(RestaurantDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> GetRestaurants()
    {
        var isSuperAdmin = User.IsInRole(UserRoles.SuperAdmin);
        var query = isSuperAdmin ? _db.Restaurants.AsQueryable() : _db.Restaurants.Where(r => r.Status == "ACTIVE");
        var restaurants = await query.OrderByDescending(r => r.CreatedAt).ToListAsync();
        return Ok(restaurants);
    }

    [Authorize(Roles = UserRoles.SuperAdmin)]
    [HttpGet("summary")]
    public async Task<IActionResult> GetPlatformSummary()
    {
        var totalRestaurants = await _db.Restaurants.CountAsync();
        var activeRestaurants = await _db.Restaurants.CountAsync(r => r.Status == "ACTIVE");
        var totalTables = await _db.Tables.CountAsync();
        var totalManagers = await _db.Users.CountAsync(u => u.Role == UserRoles.Manager);
        var totalOrders = await _db.Orders.CountAsync();
        return Ok(new
        {
            totalRestaurants,
            activeRestaurants,
            totalTables,
            totalManagers,
            totalOrders
        });
    }

    [Authorize(Roles = UserRoles.SuperAdmin)]
    [HttpPut("{id:guid}/status")]
    public async Task<IActionResult> UpdateRestaurantStatus(Guid id, [FromBody] UpdateRestaurantStatusDto dto)
    {
        var restaurant = await _db.Restaurants.FindAsync(id);
        if (restaurant == null) return NotFound();
        restaurant.Status = dto.Status.ToUpperInvariant();
        restaurant.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(restaurant);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetRestaurantById(Guid id)
    {
        var restaurant = await _db.Restaurants.FindAsync(id);
        if (restaurant == null)
        {
            var fallback = await _db.Restaurants.FirstOrDefaultAsync(r => r.Status == "ACTIVE");
            if (fallback != null) return Ok(fallback);
            return NotFound();
        }
        return Ok(restaurant);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetRestaurantByString(string id)
    {
        if (Guid.TryParse(id, out var guid))
        {
            return await GetRestaurantById(guid);
        }
        var match = System.Text.RegularExpressions.Regex.Match(id, @"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");
        if (match.Success && Guid.TryParse(match.Value, out var extractedGuid))
        {
            return await GetRestaurantById(extractedGuid);
        }
        var fallback = await _db.Restaurants.FirstOrDefaultAsync(r => r.Status == "ACTIVE");
        if (fallback != null) return Ok(fallback);
        return NotFound();
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Manager}")]
    [HttpPatch("{id:guid}/settings")]
    public async Task<IActionResult> UpdateSettings(Guid id, [FromBody] UpdateRestaurantSettingsDto dto)
    {
        var restaurant = await _db.Restaurants.FindAsync(id);
        if (restaurant == null) return NotFound();

        if (dto.OpeningHours != null) restaurant.OpeningHours = dto.OpeningHours;
        if (dto.Settings != null) restaurant.Settings = dto.Settings;
        if (!string.IsNullOrWhiteSpace(dto.Name)) restaurant.Name = dto.Name.Trim();
        if (!string.IsNullOrWhiteSpace(dto.Phone)) restaurant.Phone = dto.Phone.Trim();
        if (!string.IsNullOrWhiteSpace(dto.Email)) restaurant.Email = dto.Email.Trim();
        if (!string.IsNullOrWhiteSpace(dto.Address)) restaurant.Address = dto.Address.Trim();

        restaurant.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(restaurant);
    }

    [Authorize(Roles = UserRoles.SuperAdmin)]
    [HttpPost]
    public async Task<IActionResult> CreateRestaurant([FromBody] CreateRestaurantDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Name))
            return BadRequest(new { message = "Restaurant name is required." });
        if (string.IsNullOrWhiteSpace(dto.Address))
            return BadRequest(new { message = "Restaurant address is required." });
        if (string.IsNullOrWhiteSpace(dto.Phone))
            return BadRequest(new { message = "Contact phone is required." });
        if (string.IsNullOrWhiteSpace(dto.Email))
            return BadRequest(new { message = "Contact email is required." });

        var restaurant = new Restaurant
        {
            RestaurantId = Guid.NewGuid(),
            Name = dto.Name.Trim(),
            Address = dto.Address.Trim(),
            Phone = dto.Phone.Trim(),
            Email = dto.Email.Trim().ToLowerInvariant(),
            Logo = dto.Logo?.Trim(),
            OpeningHours = dto.OpeningHours ?? "{\"mon\":\"09:00 - 22:00\",\"tue\":\"09:00 - 22:00\",\"wed\":\"09:00 - 22:00\",\"thu\":\"09:00 - 22:00\",\"fri\":\"09:00 - 23:00\",\"sat\":\"09:00 - 23:00\",\"sun\":\"09:00 - 22:00\"}",
            Settings = System.Text.Json.JsonSerializer.Serialize(new { taxRate = dto.TaxRate ?? 0.05m, currency = "INR" }),
            Status = "ACTIVE",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _db.Restaurants.Add(restaurant);

        // Auto-seed initial tables if specified
        var tableCount = dto.InitialTableCount ?? 10;
        if (tableCount > 0)
        {
            for (int i = 1; i <= Math.Min(tableCount, 50); i++)
            {
                _db.Tables.Add(new TableEntity
                {
                    TableId = Guid.NewGuid(),
                    RestaurantId = restaurant.RestaurantId,
                    TableNumber = i,
                    Capacity = (i % 4 == 0) ? 6 : (i % 2 == 0) ? 2 : 4,
                    Status = TableStatuses.Available,
                    QrIdentifier = $"rest_{restaurant.RestaurantId.ToString("N")[..8]}_tbl_{i:D2}",
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                });
            }
        }

        // Auto-seed starter menu categories
        var defaultCategories = new[] { "Starters & Appetizers", "Main Course", "Breads & Rice", "Desserts", "Beverages" };
        int sort = 0;
        foreach (var catName in defaultCategories)
        {
            _db.MenuCategories.Add(new MenuCategory
            {
                CategoryId = Guid.NewGuid(),
                RestaurantId = restaurant.RestaurantId,
                Name = catName,
                SortOrder = sort++,
                Status = "ACTIVE",
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            });
        }

        await _db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetRestaurantById), new { id = restaurant.RestaurantId }, restaurant);
    }

    [HttpGet("{id:guid}/wifi")]
    public async Task<IActionResult> GetWifi(Guid id)
    {
        var restaurant = await _db.Restaurants.FindAsync(id);
        if (restaurant == null) return NotFound();
        return Ok(new
        {
            restaurantId = restaurant.RestaurantId,
            wifiSsid = restaurant.WifiSsid ?? "Bistro-HighSpeed-Guest",
            wifiPassword = restaurant.WifiEnabled ? (restaurant.WifiPassword ?? "Bistro@2026") : null,
            wifiEnabled = restaurant.WifiEnabled,
            googleReviewUrl = restaurant.GoogleReviewUrl ?? "https://maps.google.com",
            subscriptionTier = restaurant.SubscriptionTier ?? "PRO"
        });
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Manager},{UserRoles.Receptionist}")]
    [HttpPatch("{id:guid}/wifi")]
    public async Task<IActionResult> UpdateWifi(Guid id, [FromBody] UpdateRestaurantWifiDto dto)
    {
        var restaurant = await _db.Restaurants.FindAsync(id);
        if (restaurant == null) return NotFound();
        if (dto.WifiSsid != null) restaurant.WifiSsid = dto.WifiSsid;
        if (dto.WifiPassword != null) restaurant.WifiPassword = dto.WifiPassword;
        if (dto.WifiEnabled.HasValue) restaurant.WifiEnabled = dto.WifiEnabled.Value;
        if (dto.GoogleReviewUrl != null) restaurant.GoogleReviewUrl = dto.GoogleReviewUrl;
        restaurant.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(restaurant);
    }
}

[ApiController]
[Route("api/[controller]")]
public class TablesController : ControllerBase
{
    private readonly ITableService _tables;
    private readonly ITenantContext _tenant;

    public TablesController(ITableService tables, ITenantContext tenant)
    {
        _tables = tables;
        _tenant = tenant;
    }

    [HttpGet]
    public async Task<IActionResult> GetTables([FromQuery] Guid restaurantId)
    {
        var list = await _tables.GetTablesAsync(restaurantId);
        if (User.Identity?.IsAuthenticated != true || User.IsInRole(UserRoles.Customer))
            list = list.Select(t => t with { CurrentCustomerName = null, AssignedWaiterId = null, AssignedWaiterName = null, QrIdentifier = "" }).ToList();
        return Ok(list);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetTableById(Guid id)
    {
        var table = await _tables.GetTableByIdAsync(id);
        if (table == null) return NotFound();
        if (User.Identity?.IsAuthenticated != true || User.IsInRole(UserRoles.Customer)) table = table with { CurrentCustomerName = null, AssignedWaiterId = null, AssignedWaiterName = null, QrIdentifier = "" };
        return Ok(table);
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Manager},{UserRoles.Receptionist}")]
    [HttpPut("{id:guid}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdateTableStatusRequest request)
    {
        var success = await _tables.UpdateTableStatusAsync(id, request);
        if (!success) return NotFound();
        return Ok(new { success = true, message = "Table status updated successfully." });
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Manager}")]
    [HttpPost]
    public async Task<IActionResult> CreateTable([FromBody] CreateTableRequest request, [FromQuery] Guid? restaurantId)
    {
        Guid targetRestaurantId;
        if (_tenant.IsManager)
        {
            targetRestaurantId = _tenant.GetRequiredRestaurantId();
        }
        else if (_tenant.IsSuperAdmin)
        {
            targetRestaurantId = request.RestaurantId ?? restaurantId ?? _tenant.RestaurantId ?? UserProvisioning.DefaultRestaurantId;
        }
        else
        {
            return Forbid();
        }

        var created = await _tables.CreateTableAsync(request, targetRestaurantId);
        return CreatedAtAction(nameof(GetTableById), new { id = created.TableId }, created);
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Manager}")]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> UpdateTable(Guid id, [FromBody] UpdateTableRequest request)
    {
        var updated = await _tables.UpdateTableAsync(id, request);
        if (updated == null) return NotFound();
        return Ok(updated);
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Manager}")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteTable(Guid id)
    {
        try
        {
            var success = await _tables.DeleteTableAsync(id);
            if (!success) return NotFound();
            return Ok(new { success = true, message = "Table deleted successfully." });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
    }

    [HttpGet("{id:guid}/session")]
    public async Task<IActionResult> GetTableSession(Guid id)
    {
        var session = await _tables.GetOrCreateActiveSessionAsync(id);
        if (session == null) return NotFound();
        return Ok(session);
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Manager},{UserRoles.Receptionist}")]
    [HttpPost("{id:guid}/session/close")]
    public async Task<IActionResult> CloseTableSession(Guid id)
    {
        var success = await _tables.CloseSessionAsync(id);
        return Ok(new { success });
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Manager},{UserRoles.Receptionist}")]
    [HttpPatch("{id:guid}/position")]
    public async Task<IActionResult> UpdatePosition(Guid id, [FromBody] UpdateTablePositionDto request)
    {
        var success = await _tables.UpdateTablePositionAsync(id, request);
        if (!success) return NotFound();
        return Ok(new { success = true, message = "Table floor position updated successfully." });
    }
}

[ApiController]
[Route("api/[controller]")]
public class InventoryController : ControllerBase
{
    private readonly IInventoryService _inventory;
    private readonly ITenantContext _tenant;

    public InventoryController(IInventoryService inventory, ITenantContext tenant)
    {
        _inventory = inventory;
        _tenant = tenant;
    }

    [Authorize(Policy = "OperationalStaff")]
    [HttpGet]
    public async Task<IActionResult> GetInventory([FromQuery] Guid? restaurantId)
    {
        var targetId = _tenant.IsSuperAdmin
            ? (restaurantId ?? _tenant.RestaurantId ?? UserProvisioning.DefaultRestaurantId)
            : _tenant.GetRequiredRestaurantId();
        var items = await _inventory.GetInventoryAsync(targetId);
        return Ok(items);
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Manager},{UserRoles.Kitchen}")]
    [HttpPost]
    public async Task<IActionResult> CreateItem([FromBody] CreateInventoryItemDto request)
    {
        _tenant.EnforceTenantAccess(request.RestaurantId);
        var created = await _inventory.CreateItemAsync(request);
        return CreatedAtAction(nameof(GetInventory), new { restaurantId = created.RestaurantId }, created);
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Manager},{UserRoles.Kitchen},{UserRoles.Receptionist}")]
    [HttpPatch("{id:guid}/stock")]
    public async Task<IActionResult> UpdateStock(Guid id, [FromBody] UpdateStockDto request)
    {
        var success = await _inventory.UpdateStockAsync(id, request.QuantityChange, request.Reason);
        if (!success) return NotFound();
        return Ok(new { success = true, message = "Stock updated successfully." });
    }

    [Authorize(Policy = "OperationalStaff")]
    [HttpPost("shortage")]
    public async Task<IActionResult> ReportShortage([FromBody] ReportShortageDto request)
    {
        _tenant.EnforceTenantAccess(request.RestaurantId);
        var success = await _inventory.ReportShortageAsync(request);
        return Ok(new { success = true, message = "Shortage alert processed." });
    }
}

[ApiController]
[Route("api/[controller]")]
public class MenuController : ControllerBase
{
    private readonly RestaurantDbContext _db;
    private readonly INotificationService _notifications;
    private readonly ITenantContext _tenant;

    public MenuController(RestaurantDbContext db, INotificationService notifications, ITenantContext tenant)
    {
        _db = db;
        _notifications = notifications;
        _tenant = tenant;
    }

    [HttpGet("categories")]
    public async Task<IActionResult> GetCategories([FromQuery] Guid restaurantId)
    {
        var categories = await _db.MenuCategories
            .Where(c => c.RestaurantId == restaurantId && c.Status == "ACTIVE")
            .OrderBy(c => c.SortOrder)
            .ToListAsync();
        return Ok(categories);
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Manager}")]
    [HttpPost("categories")]
    public async Task<IActionResult> CreateCategory([FromBody] CreateMenuCategoryRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { message = "Category name is required." });

        Guid targetRestaurantId;
        if (_tenant.IsManager)
        {
            targetRestaurantId = _tenant.GetRequiredRestaurantId();
        }
        else if (_tenant.IsSuperAdmin)
        {
            targetRestaurantId = request.RestaurantId ?? _tenant.RestaurantId ?? UserProvisioning.DefaultRestaurantId;
        }
        else
        {
            return Forbid();
        }

        var maxSortOrder = await _db.MenuCategories
            .Where(c => c.RestaurantId == targetRestaurantId)
            .MaxAsync(c => (int?)c.SortOrder) ?? 0;

        var category = new MenuCategory
        {
            CategoryId = Guid.NewGuid(),
            RestaurantId = targetRestaurantId,
            Name = request.Name.Trim(),
            Description = request.Description?.Trim(),
            SortOrder = request.SortOrder ?? (maxSortOrder + 1),
            Status = "ACTIVE",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _db.MenuCategories.Add(category);
        await _db.SaveChangesAsync();

        return Created($"/api/menu/categories/{category.CategoryId}", category);
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Manager}")]
    [HttpPut("categories/{id:guid}")]
    public async Task<IActionResult> UpdateCategory(Guid id, [FromBody] UpdateMenuCategoryRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { message = "Category name is required." });

        var category = await _db.MenuCategories.FindAsync(id);
        if (category == null) return NotFound(new { message = "Category not found." });

        if (_tenant.IsManager && category.RestaurantId != _tenant.GetRequiredRestaurantId())
            return Forbid();

        category.Name = request.Name.Trim();
        if (request.Description != null) category.Description = request.Description.Trim();
        if (request.SortOrder.HasValue) category.SortOrder = request.SortOrder.Value;
        if (!string.IsNullOrWhiteSpace(request.Status)) category.Status = request.Status.Trim().ToUpperInvariant();
        category.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(category);
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Manager}")]
    [HttpDelete("categories/{id:guid}")]
    public async Task<IActionResult> DeleteCategory(Guid id)
    {
        var category = await _db.MenuCategories.FindAsync(id);
        if (category == null) return NotFound(new { message = "Category not found." });

        if (_tenant.IsManager && category.RestaurantId != _tenant.GetRequiredRestaurantId())
            return Forbid();

        var hasItems = await _db.MenuItems.AnyAsync(m => m.CategoryId == id);
        if (hasItems)
        {
            category.Status = "INACTIVE";
            category.UpdatedAt = DateTime.UtcNow;
        }
        else
        {
            _db.MenuCategories.Remove(category);
        }

        await _db.SaveChangesAsync();
        return Ok(new { success = true, message = "Category deleted successfully." });
    }

    [HttpGet("items")]
    public async Task<IActionResult> GetMenuItems([FromQuery] Guid restaurantId, [FromQuery] Guid? categoryId, [FromQuery] string? vegFilter)
    {
        var query = _db.MenuItems.Include(m => m.Category).Where(m => m.RestaurantId == restaurantId);

        if (categoryId.HasValue)
        {
            query = query.Where(m => m.CategoryId == categoryId.Value);
        }

        if (!string.IsNullOrEmpty(vegFilter))
        {
            query = query.Where(m => m.VegNonVeg == vegFilter.ToUpper());
        }

        var items = await query.ToListAsync();
        var dtos = items.Select(m => new MenuItemDto(
            m.MenuItemId,
            m.CategoryId,
            m.Category?.Name ?? "",
            m.Name,
            m.Description,
            m.Price,
            m.Image,
            m.VegNonVeg,
            m.Availability,
            m.SpiceLevel,
            m.IsSweet,
            m.AddOns,
            m.CustomizationOptions,
            m.Allergens,
            m.Ingredients,
            m.Portions,
            m.DietaryTags,
            m.IsSpecial,
            m.PrepTimeMinutes
        )).ToList();

        return Ok(dtos);
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Manager},{UserRoles.Receptionist},{UserRoles.Kitchen}")]
    [HttpPatch("items/{id:guid}/availability")]
    public async Task<IActionResult> UpdateItemAvailability(Guid id, [FromBody] UpdateItemAvailabilityRequest request)
    {
        var item = await _db.MenuItems.FindAsync(id);
        if (item == null) return NotFound();

        item.Availability = request.Availability;
        item.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        // Broadcast to all clients immediately (Section 15)
        await _notifications.NotifyRoleAsync(
            item.RestaurantId,
            UserRoles.Kitchen,
            "FOOD_AVAILABILITY_CHANGED",
            "Menu Updated",
            $"{item.Name} marked {(request.Availability ? "AVAILABLE" : "UNAVAILABLE")}",
            new { item.MenuItemId, request.Availability }
        );

        return Ok(new { success = true, availability = request.Availability });
    }
}

[ApiController]
[Route("api/[controller]")]
public class OrdersController : ControllerBase
{
    private readonly IOrderService _orders;
    private readonly IAuthService _auth;
    private readonly IEmailReceiptService _emailReceipts;

    public OrdersController(IOrderService orders, IAuthService auth, IEmailReceiptService emailReceipts)
    {
        _orders = orders;
        _auth = auth;
        _emailReceipts = emailReceipts;
    }

    [HttpPost]
    public async Task<IActionResult> CreateOrder([FromBody] CreateOrderRequest request)
    {
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var customerId);
        request = request with { CustomerId = customerId == Guid.Empty ? null : customerId };
        var order = await _orders.CreateOrderAsync(request);
        return CreatedAtAction(nameof(GetOrderById), new { id = order.OrderId }, order);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetOrderById(Guid id)
    {
        var userIdStr = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        Guid? userId = Guid.TryParse(userIdStr, out var uid) ? uid : null;
        var role = User.FindFirst(ClaimTypes.Role)?.Value ?? UserRoles.Customer;
        var resIdStr = User.FindFirst("restaurant_id")?.Value;
        Guid? resId = Guid.TryParse(resIdStr, out var rId) ? rId : null;

        var order = await _orders.GetOrderByIdAsync(id, userId, role, resId);
        if (order == null) return NotFound();
        return Ok(order);
    }

    [Authorize]
    [HttpGet]
    public async Task<IActionResult> GetOrders([FromQuery] Guid restaurantId, [FromQuery] string? source, [FromQuery] string? status, [FromQuery] string? search)
    {
        var list = await _orders.GetOrdersAsync(restaurantId, source, status, search);
        if (User.IsInRole(UserRoles.Customer))
        {
            Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId);
            var user = await _auth.GetUserByIdAsync(userId);
            list = list.Where(o => o.CustomerId == userId ||
                                   (user != null && !string.IsNullOrEmpty(user.Phone) && o.CustomerPhone == user.Phone) ||
                                   (user != null && !string.IsNullOrEmpty(user.Name) && o.CustomerName == user.Name)).ToList();
        }
        return Ok(list);
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Manager},{UserRoles.Receptionist},{UserRoles.Kitchen},{UserRoles.Waiter}")]
    [HttpPatch("{id:guid}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdateOrderStatusRequest request)
    {
        var role = User.FindFirst(ClaimTypes.Role)?.Value ?? UserRoles.Kitchen;
        var success = await _orders.UpdateOrderStatusAsync(id, request.NewStatus, request.Reason, role);
        if (!success) return BadRequest(new { success = false, message = "Failed to update order status." });
        return Ok(new { success = true, newStatus = request.NewStatus });
    }

    [HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> CancelOrder(Guid id, [FromBody] CancelOrderRequest request)
    {
        var userIdStr = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        Guid? userId = Guid.TryParse(userIdStr, out var uid) ? uid : null;
        var role = User.FindFirst(ClaimTypes.Role)?.Value ?? UserRoles.Customer;

        var (success, message) = await _orders.CancelOrderAsync(id, userId, role, request?.Reason);
        if (!success) return BadRequest(new { success = false, message });
        return Ok(new { success = true, message });
    }

    [HttpPost("{id:guid}/confirmation-timeout")]
    public async Task<IActionResult> ConfirmationTimeout(Guid id)
    {
        var order = await _orders.GetOrderByIdAsync(id, null, UserRoles.Customer, null);
        return order == null ? NotFound() : Ok(new { success = order.Status == OrderStatuses.ConfirmationTimeout, order.Status });
    }

    [HttpPost("{id:guid}/confirm-receipt")]
    public async Task<IActionResult> ConfirmReceipt(Guid id, [FromQuery] bool confirmed)
    {
        var success = await _orders.ConfirmCustomerOrderReceiptAsync(id, confirmed);
        if (!success) return NotFound();
        return Ok(new { success = true, confirmed });
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Manager},{UserRoles.Receptionist}")]
    [HttpDelete("{idOrNumber}")]
    public async Task<IActionResult> DeleteOrder(string idOrNumber)
    {
        var success = await _orders.DeleteOrderAsync(idOrNumber);
        if (!success) return NotFound(new { success = false, message = "Order not found." });
        return Ok(new { success = true, message = $"Order {idOrNumber} removed successfully." });
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Manager},{UserRoles.Receptionist},{UserRoles.Kitchen},{UserRoles.Waiter}")]
    [HttpPatch("items/{orderItemId:guid}/status")]
    public async Task<IActionResult> UpdateItemStatus(Guid orderItemId, [FromBody] UpdateOrderItemStatusRequest request)
    {
        var success = await _orders.UpdateOrderItemStatusAsync(orderItemId, request.Status);
        if (!success) return NotFound();
        return Ok(new { success = true, status = request.Status });
    }

    [HttpPost("{orderId:guid}/email-receipt")]
    public async Task<IActionResult> EmailReceipt(Guid orderId, [FromBody] EmailReceiptRequest request)
    {
        var (success, message) = await _emailReceipts.SendReceiptEmailAsync(orderId, request.Email);
        if (!success) return BadRequest(new { success = false, message });
        return Ok(new { success = true, message });
    }
}

[ApiController]
[Route("api/[controller]")]
public class ReservationsController : ControllerBase
{
    private readonly IReservationService _reservations;

    public ReservationsController(IReservationService reservations)
    {
        _reservations = reservations;
    }

    [HttpGet("availability")]
    public async Task<IActionResult> CheckAvailability([FromQuery] Guid restaurantId, [FromQuery] DateOnly date, [FromQuery] int guestCount)
    {
        var slots = await _reservations.GetAvailabilityAsync(restaurantId, date, guestCount);
        return Ok(slots);
    }

    [AllowAnonymous]
    [HttpGet("lookup")]
    public async Task<IActionResult> LookupReservation([FromQuery] string query)
    {
        if (string.IsNullOrWhiteSpace(query) || query.Trim().Length < 6)
            return BadRequest(new { message = "Enter a valid Booking ID (e.g. RES-XXXX) or 10-digit mobile number." });

        var reservation = await _reservations.LookupReservationAsync(query);
        if (reservation == null) return NotFound(new { message = "No reservation found matching this booking ID or phone number." });

        var isStaff = User.Identity?.IsAuthenticated == true && !User.IsInRole(UserRoles.Customer);
        if (!isStaff)
        {
            reservation = reservation with
            {
                CustomerEmail = MaskEmail(reservation.CustomerEmail),
                CustomerPhone = MaskPhone(reservation.CustomerPhone),
                SpecialRequest = null
            };
        }

        return Ok(reservation);
    }

    private static string MaskPhone(string? phone)
    {
        if (string.IsNullOrWhiteSpace(phone)) return string.Empty;
        var digits = new string(phone.Where(char.IsDigit).ToArray());
        return digits.Length >= 4 ? new string('*', Math.Max(4, digits.Length - 4)) + digits[^4..] : "****";
    }

    private static string MaskEmail(string? email)
    {
        if (string.IsNullOrWhiteSpace(email) || !email.Contains('@')) return string.Empty;
        var parts = email.Split('@', 2);
        var prefix = parts[0].Length > 1 ? $"{parts[0][0]}***" : "*";
        return $"{prefix}@{parts[1]}";
    }

    [HttpPost]
    public async Task<IActionResult> CreateReservation([FromBody] CreateReservationRequest request)
    {
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var customerId);
        request = request with { CustomerId = customerId == Guid.Empty ? null : customerId };
        var (success, reservation, message) = await _reservations.CreateReservationAsync(request);
        if (!success) return Conflict(new { success = false, message });
        return Ok(reservation);
    }

    [Authorize(Roles = "SUPER_ADMIN,MANAGER,RECEPTIONIST,WAITER,KITCHEN")]
    [HttpGet]
    public async Task<IActionResult> GetReservations([FromQuery] Guid restaurantId, [FromQuery] DateOnly? date, [FromQuery] string? status)
    {
        var list = await _reservations.GetReservationsAsync(restaurantId, date, status);
        return Ok(list);
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Manager},{UserRoles.Receptionist}")]
    [HttpPatch("{id:guid}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromQuery] string newStatus, [FromQuery] Guid? tableId)
    {
        var success = await _reservations.UpdateReservationStatusAsync(id, newStatus, tableId);
        if (!success) return NotFound();
        return Ok(new { success = true, status = newStatus });
    }

    [Authorize(Roles = "SUPER_ADMIN,MANAGER,RECEPTIONIST")]
    [HttpPatch("{id:guid}/reschedule")]
    public async Task<IActionResult> Reschedule(Guid id, [FromBody] RescheduleReservationRequest request)
    {
        var reservation = await _reservations.RescheduleReservationAsync(id, request);
        if (reservation == null) return NotFound();
        return Ok(new { success = true, message = "Reservation rescheduled successfully.", reservation });
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Manager},{UserRoles.Receptionist}")]
    [HttpPost("{id:guid}/event-plan")]
    public async Task<IActionResult> PlanEvent(Guid id, [FromBody] EventPlanDto dto)
    {
        var updated = await _reservations.PlanEventAsync(id, dto);
        return Ok(updated);
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Manager},{UserRoles.Receptionist},{UserRoles.Kitchen}")]
    [HttpGet("{id:guid}/prep-sheet")]
    public async Task<IActionResult> GetPrepSheet(Guid id)
    {
        var sheet = await _reservations.GetKitchenPrepSheetAsync(id);
        return Ok(sheet);
    }
}

[ApiController]
[Route("api/[controller]")]
public class PaymentsController : ControllerBase
{
    private readonly IPaymentService _payments;
    private readonly RestaurantDbContext _db;
    public PaymentsController(IPaymentService payments, RestaurantDbContext db) { _payments = payments; _db = db; }
    [Authorize(Roles = "SUPER_ADMIN,MANAGER,RECEPTIONIST")]
    [HttpGet]
    public async Task<IActionResult> GetPayments([FromQuery] Guid restaurantId) => Ok((await _db.Payments.Where(p => p.RestaurantId == restaurantId).OrderByDescending(p => p.CreatedAt).ToListAsync()).Select(PaymentService.Map));
    [Authorize(Roles = "SUPER_ADMIN,MANAGER,RECEPTIONIST")]
    [HttpPost("record")]
    public async Task<IActionResult> Record([FromBody] InitiatePaymentRequest request) => Ok(await _payments.RecordPaymentAsync(request));

    [HttpPost("initiate")]
    public async Task<IActionResult> Initiate([FromBody] InitiatePaymentRequest request)
    {
        var payment = await _payments.InitiatePaymentAsync(request);
        return Ok(payment);
    }

    [HttpPost("verify")]
    public async Task<IActionResult> Verify([FromBody] VerifyPaymentRequest request)
    {
        var success = await _payments.VerifyPaymentAsync(request);
        if (!success) return BadRequest(new { success = false, message = "Payment verification failed or invalid signature." });
        return Ok(new { success = true, message = "Payment verified successfully." });
    }

    [HttpPost("webhook")]
    public async Task<IActionResult> Webhook([FromBody] WebhookPayloadDto payload)
    {
        var headerSig = Request.Headers["X-Razorpay-Signature"].FirstOrDefault()
                     ?? Request.Headers["X-Webhook-Signature"].FirstOrDefault();
        var success = await _payments.ProcessWebhookAsync(payload, headerSig);
        if (!success) return Unauthorized(new { received = false, message = "Invalid webhook signature." });
        return Ok(new { received = true });
    }

    [HttpPost("calculate-split")]
    public async Task<IActionResult> CalculateSplit([FromBody] CalculateSplitRequest request)
    {
        var result = await _payments.CalculateSplitAsync(request);
        return Ok(result);
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Manager},{UserRoles.Receptionist},{UserRoles.Waiter}")]
    [HttpPost("{paymentId:guid}/confirm-cash")]
    public async Task<IActionResult> ConfirmCash(Guid paymentId, [FromBody] ConfirmCashPaymentRequest? request)
    {
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var staffId);
        var success = await _payments.ConfirmCashPaymentAsync(paymentId, request?.StaffUserId ?? (staffId == Guid.Empty ? null : staffId));
        if (!success) return BadRequest(new { success = false, message = "Could not confirm cash payment." });
        return Ok(new { success = true, message = "Cash payment confirmed and recorded." });
    }
}

[ApiController]
[Route("api/[controller]")]
public class WaitlistController : ControllerBase
{
    private readonly IWaitlistService _waitlist;
    private readonly ITenantContext _tenant;

    public WaitlistController(IWaitlistService waitlist, ITenantContext tenant)
    {
        _waitlist = waitlist;
        _tenant = tenant;
    }

    [Authorize(Policy = "ReceptionistOrManagerOrAdmin")]
    [HttpGet]
    public async Task<IActionResult> GetWaitlist([FromQuery] Guid? restaurantId)
    {
        var targetId = _tenant.IsSuperAdmin ? (restaurantId ?? _tenant.RestaurantId ?? UserProvisioning.DefaultRestaurantId) : _tenant.GetRequiredRestaurantId();
        return Ok(await _waitlist.GetWaitlistAsync(targetId));
    }

    [Authorize(Policy = "ReceptionistOrManagerOrAdmin")]
    [HttpPost]
    public async Task<IActionResult> AddWalkIn([FromBody] AddWalkInDto dto)
    {
        _tenant.EnforceTenantAccess(dto.RestaurantId);
        var entry = await _waitlist.AddWalkInAsync(dto);
        return Ok(entry);
    }

    [Authorize(Policy = "ReceptionistOrManagerOrAdmin")]
    [HttpPost("{id:guid}/notify")]
    public async Task<IActionResult> Notify(Guid id)
    {
        var success = await _waitlist.NotifyGuestAsync(id);
        return success ? Ok(new { success = true }) : NotFound();
    }

    [Authorize(Policy = "ReceptionistOrManagerOrAdmin")]
    [HttpPost("{id:guid}/seat")]
    public async Task<IActionResult> Seat(Guid id, [FromQuery] Guid tableId)
    {
        var success = await _waitlist.SeatGuestAsync(id, tableId);
        return success ? Ok(new { success = true }) : BadRequest();
    }

    [Authorize(Policy = "ReceptionistOrManagerOrAdmin")]
    [HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id)
    {
        var success = await _waitlist.CancelWaitlistEntryAsync(id);
        return success ? Ok(new { success = true }) : NotFound();
    }

    [HttpGet("estimate")]
    public async Task<IActionResult> GetEstimate([FromQuery] Guid restaurantId, [FromQuery] int partySize)
    {
        return Ok(await _waitlist.GetWaitEstimateAsync(restaurantId, partySize));
    }
}

[ApiController]
[Route("api/[controller]")]
public class HelpController : ControllerBase
{
    private readonly IHelpRequestService _help;
    private readonly RestaurantDbContext _db;
    private readonly RestaurantSystem.Api.Security.ResourceTokens _tokens;
    public HelpController(IHelpRequestService help, RestaurantDbContext db, RestaurantSystem.Api.Security.ResourceTokens tokens) { _help = help; _db = db; _tokens = tokens; }
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetHelpById(Guid id)
    {
        var h = await _db.HelpRequests.Include(x => x.Table).FirstOrDefaultAsync(x => x.RequestId == id);
        return h == null ? NotFound() : Ok(new HelpRequestDto(h.RequestId,h.RestaurantId,h.TableId,h.Table?.TableNumber??0,h.Message,h.Status,h.AssignedWaiterId,h.AssignedWaiterName,h.CreatedAt,h.AcceptedAt,_tokens.Create("help",h.RequestId),h.RequestType));
    }

    [HttpPost]
    public async Task<IActionResult> RequestHelp([FromBody] CreateHelpRequestDto request)
    {
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var customerId);
        request = request with { CustomerId = customerId == Guid.Empty ? null : customerId };
        var result = await _help.CreateHelpRequestAsync(request);
        return Ok(result);
    }

    [Authorize(Roles = "SUPER_ADMIN,MANAGER,RECEPTIONIST,WAITER")]
    [HttpGet]
    public async Task<IActionResult> GetActiveHelpRequests([FromQuery] Guid restaurantId)
    {
        var list = await _help.GetActiveHelpRequestsAsync(restaurantId);
        return Ok(list);
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Manager},{UserRoles.Waiter},{UserRoles.Receptionist}")]
    [HttpPost("{id:guid}/assign")]
    public async Task<IActionResult> AssignHelp(Guid id, [FromBody] AssignHelpRequestDto dto)
    {
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var waiterId);
        dto = dto with { WaiterId = waiterId, WaiterName = User.Identity?.Name ?? "Waiter" };
        var success = await _help.AssignHelpRequestAsync(id, dto);
        if (!success) return Conflict(new { success = false, message = "Request already assigned to another waiter." });
        return Ok(new { success = true, message = $"Assigned to {dto.WaiterName}" });
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Manager},{UserRoles.Waiter},{UserRoles.Receptionist}")]
    [HttpPost("{id:guid}/resolve")]
    public async Task<IActionResult> ResolveHelp(Guid id)
    {
        var success = await _help.ResolveHelpRequestAsync(id);
        if (!success) return NotFound();
        return Ok(new { success = true });
    }
}

[ApiController]
[Route("api/[controller]")]
public class IssuesController : ControllerBase
{
    private readonly RestaurantDbContext _db;

    public IssuesController(RestaurantDbContext db)
    {
        _db = db;
    }

    [Authorize(Roles = "SUPER_ADMIN,MANAGER,RECEPTIONIST,KITCHEN,WAITER")]
    [HttpGet]
    public async Task<IActionResult> GetIssues([FromQuery] Guid restaurantId)
    {
        var issues = await _db.CustomerIssues
            .Where(i => i.RestaurantId == restaurantId)
            .OrderByDescending(i => i.CreatedAt)
            .ToListAsync();
        return Ok(issues);
    }

    [Authorize(Roles = "SUPER_ADMIN,MANAGER,RECEPTIONIST,KITCHEN,WAITER")]
    [HttpPost]
    public async Task<IActionResult> CreateIssue([FromBody] CreateIssueDto dto)
    {
        var issue = new CustomerIssue
        {
            RestaurantId = dto.RestaurantId,
            OrderId = dto.OrderId,
            TableId = dto.TableId,
            Description = dto.Description,
            Status = "PENDING",
            CreatedAt = DateTime.UtcNow
        };
        _db.CustomerIssues.Add(issue);
        await _db.SaveChangesAsync();
        return Ok(issue);
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Manager},{UserRoles.Receptionist}")]
    [HttpPatch("{id:guid}/resolve")]
    public async Task<IActionResult> ResolveIssue(Guid id, [FromBody] ResolveIssueDto dto)
    {
        var issue = await _db.CustomerIssues.FindAsync(id);
        if (issue == null) return NotFound();

        issue.Resolution = dto.Resolution;
        issue.Status = dto.Escalate ? "ESCALATED" : "RESOLVED";
        issue.ResolvedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(issue);
    }
}

[ApiController]
[Route("api/[controller]")]
public class QrController : ControllerBase
{
    private readonly ITableService _tables;

    public QrController(ITableService tables)
    {
        _tables = tables;
    }

    [HttpGet("validate/{qrCode}")]
    public async Task<IActionResult> ValidateQr(string qrCode)
    {
        var response = await _tables.ValidateQrAsync(qrCode);
        if (!response.IsValid) return BadRequest(response);
        return Ok(response);
    }
}

[ApiController]
[Route("api/[controller]")]
public class UsersController : ControllerBase
{
    private readonly RestaurantDbContext _db;
    private readonly ITenantContext _tenant;
    private readonly IAuditLogService _audit;

    public UsersController(RestaurantDbContext db, ITenantContext tenant, IAuditLogService audit)
    {
        _db = db;
        _tenant = tenant;
        _audit = audit;
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Manager}")]
    [HttpGet]
    public async Task<IActionResult> GetUsers([FromQuery] Guid? restaurantId, [FromQuery] string? role)
    {
        if (restaurantId.HasValue) _tenant.EnforceTenantAccess(restaurantId.Value);
        var targetRestaurantId = _tenant.IsSuperAdmin
            ? (restaurantId ?? _tenant.RestaurantId)
            : _tenant.GetRequiredRestaurantId();

        var query = _db.Users.Where(u => u.Role != UserRoles.Customer);
        if (targetRestaurantId.HasValue)
        {
            query = query.Where(u => u.RestaurantId == targetRestaurantId.Value);
        }
        if (!string.IsNullOrEmpty(role))
        {
            var upperRole = role.ToUpperInvariant();
            query = query.Where(u => u.Role == upperRole);
        }

        var users = await query.ToListAsync();
        var dtos = users.Select(u => new UserDto(u.UserId, u.RestaurantId, u.Name, u.Email, u.Phone, u.Role, u.Status)).ToList();
        return Ok(dtos);
    }

    [Authorize(Roles = UserRoles.SuperAdmin)]
    [HttpGet("managers")]
    public async Task<IActionResult> GetAllManagers()
    {
        var managers = await _db.Users
            .Include(u => u.Restaurant)
            .Where(u => u.Role == UserRoles.Manager)
            .OrderBy(u => u.Name)
            .Select(u => new
            {
                u.UserId,
                u.RestaurantId,
                RestaurantName = u.Restaurant != null ? u.Restaurant.Name : "Unassigned",
                u.Name,
                u.Email,
                u.Phone,
                u.Role,
                u.Status,
                u.CreatedAt
            })
            .ToListAsync();
        return Ok(managers);
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Manager}")]
    [HttpPost]
    public async Task<IActionResult> CreateStaff([FromBody] CreateStaffDto dto, [FromQuery] Guid? restaurantId)
    {
        if (string.IsNullOrWhiteSpace(dto.Name) || string.IsNullOrWhiteSpace(dto.Email))
            return BadRequest(new { message = "Staff name and email are required." });

        if (string.IsNullOrWhiteSpace(dto.Password) || dto.Password.Length < 8 ||
            !dto.Password.Any(char.IsLetter) || !dto.Password.Any(char.IsDigit))
        {
            return BadRequest(new { message = "Password must be at least 8 characters and include letters and numbers." });
        }

        var isSuperAdmin = User.IsInRole(UserRoles.SuperAdmin);
        Guid targetRestaurantId;
        if (isSuperAdmin)
        {
            targetRestaurantId = restaurantId ?? _tenant.RestaurantId ?? Guid.Empty;
            if (targetRestaurantId == Guid.Empty) return BadRequest(new { message = "Target restaurant ID is required." });
        }
        else
        {
            targetRestaurantId = _tenant.GetRequiredRestaurantId();
            if (restaurantId.HasValue) _tenant.EnforceTenantAccess(restaurantId.Value);
        }

        var normalizedEmail = dto.Email.Trim().ToLowerInvariant();
        var existing = await _db.Users.AnyAsync(u => u.Email.ToLower() == normalizedEmail);
        if (existing)
            return BadRequest(new { message = "A user with this email address already exists." });

        var role = (dto.Role ?? UserRoles.Waiter).Trim().ToUpperInvariant();
        if (role is not (UserRoles.Manager or UserRoles.Receptionist or UserRoles.Kitchen or UserRoles.Waiter))
        {
            return BadRequest(new { message = "Invalid staff role." });
        }

        // Manager cannot create another Manager or Super Admin
        if (!isSuperAdmin && role == UserRoles.Manager)
        {
            return Forbid();
        }

        var user = new User
        {
            RestaurantId = targetRestaurantId,
            Name = dto.Name.Trim(),
            Email = normalizedEmail,
            Phone = dto.Phone?.Trim(),
            Role = role,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(dto.Password),
            Status = "ACTIVE",
            EmailVerified = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync();
        await _audit.LogAsync(targetRestaurantId, _tenant.CurrentUserId, _tenant.CurrentRole, "STAFF_CREATED", "users", new { user.UserId, user.Role });

        return Ok(new UserDto(user.UserId, user.RestaurantId, user.Name, user.Email, user.Phone, user.Role, user.Status));
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Manager}")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteStaff(Guid id)
    {
        var user = await _db.Users.FindAsync(id);
        if (user == null || user.Role == UserRoles.Customer) return NotFound(new { message = "Staff member not found." });

        _tenant.EnforceTenantAccess(user.RestaurantId);

        if (_tenant.CurrentUserId == user.UserId)
        {
            return BadRequest(new { message = "You cannot delete your own account." });
        }

        if (!User.IsInRole(UserRoles.SuperAdmin) && user.Role is UserRoles.SuperAdmin or UserRoles.Manager)
        {
            return Forbid();
        }

        _db.Users.Remove(user);
        await _db.SaveChangesAsync();
        await _audit.LogAsync(user.RestaurantId, _tenant.CurrentUserId, _tenant.CurrentRole, "STAFF_DELETED", "users", new { DeletedUserId = user.UserId, user.Role });
        return Ok(new { message = "Staff member removed successfully." });
    }
}

[ApiController]
[Route("api/[controller]")]
public class LoyaltyController : ControllerBase
{
    private readonly ILoyaltyService _loyalty;
    private readonly ITenantContext _tenant;
    private readonly RestaurantDbContext _db;
    private readonly ResourceTokens _tokens;

    public LoyaltyController(ILoyaltyService loyalty, ITenantContext tenant, RestaurantDbContext db, ResourceTokens tokens)
    {
        _loyalty = loyalty;
        _tenant = tenant;
        _db = db;
        _tokens = tokens;
    }

    [HttpGet("balance")]
    public async Task<IActionResult> GetBalance([FromQuery] Guid restaurantId, [FromQuery] string phone)
    {
        if (string.IsNullOrWhiteSpace(phone)) return BadRequest("Phone number is required.");
        if (_tenant.IsStaff) _tenant.EnforceTenantAccess(restaurantId);

        var loyalty = await _loyalty.GetLoyaltyByPhoneAsync(restaurantId, phone);
        if (loyalty == null)
        {
            return Ok(new CustomerLoyaltyDto(Guid.Empty, restaurantId, phone, null, null, 0, 0, "BRONZE"));
        }

        // Mask customer PII (name/email) for unauthenticated/guest balance checks.
        if (!_tenant.IsStaff)
        {
            loyalty = loyalty with { CustomerName = null, CustomerEmail = null };
        }
        return Ok(loyalty);
    }

    [Authorize(Policy = "OperationalStaff")]
    [HttpPost("earn")]
    public async Task<IActionResult> EarnPoints([FromBody] EarnLoyaltyPointsDto request)
    {
        _tenant.EnforceTenantAccess(request.RestaurantId);
        var result = await _loyalty.EarnPointsAsync(request);
        return Ok(result);
    }

    [HttpPost("redeem")]
    public async Task<IActionResult> RedeemPoints([FromBody] RedeemLoyaltyPointsDto request)
    {
        if (_tenant.IsStaff)
        {
            _tenant.EnforceTenantAccess(request.RestaurantId);
        }
        else
        {
            var token = Request.Query["accessToken"].FirstOrDefault() ?? Request.Headers["X-Resource-Token"].FirstOrDefault();
            var authorizedGuest = false;
            if (request.OrderId is Guid orderId)
            {
                var order = await _db.Orders.AsNoTracking().FirstOrDefaultAsync(o => o.OrderId == orderId && o.RestaurantId == request.RestaurantId);
                var userId = _tenant.CurrentUserId;
                var ownsOrder = userId.HasValue && order?.CustomerId == userId.Value;
                if (order != null && (ownsOrder || _tokens.Validate("order", order.OrderId, token)))
                {
                    authorizedGuest = true;
                }
            }

            if (!authorizedGuest)
            {
                return StatusCode(403, new { message = "Staff authentication or a valid order access token is required to redeem loyalty points." });
            }
        }

        var result = await _loyalty.RedeemPointsAsync(request);
        if (!result.Success) return BadRequest(new { message = result.Message });
        return Ok(new { loyalty = result.Loyalty, discountAmount = result.DiscountAmount, message = result.Message });
    }
}

[ApiController]
[Route("api/[controller]")]
public class FeedbackController : ControllerBase
{
    private readonly IFeedbackService _feedback;
    private readonly ITenantContext _tenant;

    public FeedbackController(IFeedbackService feedback, ITenantContext tenant)
    {
        _feedback = feedback;
        _tenant = tenant;
    }

    [HttpPost]
    public async Task<IActionResult> SubmitFeedback([FromBody] CreateFeedbackDto request)
    {
        var result = await _feedback.CreateFeedbackAsync(request);
        return Ok(result);
    }

    [Authorize(Policy = "OperationalStaff")]
    [HttpGet]
    public async Task<IActionResult> GetFeedbacks([FromQuery] Guid? restaurantId)
    {
        var targetId = _tenant.IsSuperAdmin
            ? (restaurantId ?? _tenant.RestaurantId ?? UserProvisioning.DefaultRestaurantId)
            : _tenant.GetRequiredRestaurantId();
        var list = await _feedback.GetFeedbacksAsync(targetId);
        return Ok(list);
    }
}
