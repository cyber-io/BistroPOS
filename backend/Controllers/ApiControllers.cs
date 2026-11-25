using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
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

    public AuthController(IAuthService auth)
    {
        _auth = auth;
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
        if (restaurant == null) return NotFound();
        return Ok(restaurant);
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
            m.CustomizationOptions
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

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Manager}")]
    [HttpPost("items")]
    public async Task<IActionResult> CreateMenuItem([FromBody] CreateMenuItemRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest(new { message = "Item name is required." });

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

        var category = await _db.MenuCategories.FindAsync(request.CategoryId);
        if (category == null || category.RestaurantId != targetRestaurantId)
        {
            return BadRequest(new { message = "Selected category does not exist for this restaurant." });
        }

        var item = new MenuItem
        {
            MenuItemId = Guid.NewGuid(),
            RestaurantId = targetRestaurantId,
            CategoryId = request.CategoryId,
            Name = request.Name.Trim(),
            Description = request.Description?.Trim(),
            Price = request.Price,
            Image = string.IsNullOrWhiteSpace(request.Image) ? "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80" : request.Image.Trim(),
            VegNonVeg = string.Equals(request.VegNonVeg, "NON_VEG", StringComparison.OrdinalIgnoreCase) ? "NON_VEG" : "VEG",
            Availability = request.Availability ?? true,
            SpiceLevel = request.SpiceLevel ?? "NONE",
            IsSweet = request.IsSweet ?? false,
            CustomizationOptions = request.CustomizationOptions ?? "[]",
            AddOns = request.AddOns ?? "[]",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _db.MenuItems.Add(item);
        await _db.SaveChangesAsync();

        return Created($"/api/menu/items/{item.MenuItemId}", item);
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Manager}")]
    [HttpPut("items/{id:guid}")]
    public async Task<IActionResult> UpdateMenuItem(Guid id, [FromBody] UpdateMenuItemRequest updated)
    {
        var existing = await _db.MenuItems.FindAsync(id);
        if (existing == null) return NotFound(new { message = "Item not found." });

        if (_tenant.IsManager && existing.RestaurantId != _tenant.GetRequiredRestaurantId())
            return Forbid();

        if (updated.CategoryId.HasValue)
        {
            var cat = await _db.MenuCategories.FindAsync(updated.CategoryId.Value);
            if (cat != null && cat.RestaurantId == existing.RestaurantId)
            {
                existing.CategoryId = updated.CategoryId.Value;
            }
        }

        existing.Name = updated.Name.Trim();
        existing.Description = updated.Description?.Trim();
        existing.Price = updated.Price;
        if (!string.IsNullOrWhiteSpace(updated.Image)) existing.Image = updated.Image.Trim();
        if (!string.IsNullOrWhiteSpace(updated.VegNonVeg)) existing.VegNonVeg = updated.VegNonVeg.ToUpper();
        if (updated.Availability.HasValue) existing.Availability = updated.Availability.Value;
        if (!string.IsNullOrWhiteSpace(updated.SpiceLevel)) existing.SpiceLevel = updated.SpiceLevel;
        if (updated.IsSweet.HasValue) existing.IsSweet = updated.IsSweet.Value;
        if (!string.IsNullOrWhiteSpace(updated.CustomizationOptions)) existing.CustomizationOptions = updated.CustomizationOptions;
        if (!string.IsNullOrWhiteSpace(updated.AddOns)) existing.AddOns = updated.AddOns;
        existing.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return Ok(existing);
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Manager}")]
    [HttpDelete("items/{id:guid}")]
    public async Task<IActionResult> DeleteMenuItem(Guid id)
    {
        var existing = await _db.MenuItems.FindAsync(id);
        if (existing == null) return NotFound(new { message = "Item not found." });

        if (_tenant.IsManager && existing.RestaurantId != _tenant.GetRequiredRestaurantId())
            return Forbid();

        _db.MenuItems.Remove(existing);
        await _db.SaveChangesAsync();
        return Ok(new { success = true, message = "Menu item deleted successfully." });
    }
}

[ApiController]
[Route("api/[controller]")]
public class OrdersController : ControllerBase
{
    private readonly IOrderService _orders;
    private readonly IAuthService _auth;

    public OrdersController(IOrderService orders, IAuthService auth)
    {
        _orders = orders;
        _auth = auth;
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
        if (string.IsNullOrWhiteSpace(query)) return BadRequest(new { message = "Booking ID or phone number is required." });
        var reservation = await _reservations.LookupReservationAsync(query);
        if (reservation == null) return NotFound(new { message = "No reservation found matching this booking ID or phone number." });
        return Ok(reservation);
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
        var success = await _payments.ProcessWebhookAsync(payload);
        if (!success) return BadRequest();
        return Ok(new { received = true });
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
        return h == null ? NotFound() : Ok(new HelpRequestDto(h.RequestId,h.RestaurantId,h.TableId,h.Table?.TableNumber??0,h.Message,h.Status,h.AssignedWaiterId,h.AssignedWaiterName,h.CreatedAt,h.AcceptedAt,_tokens.Create("help",h.RequestId)));
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

    [Authorize(Roles = "SUPER_ADMIN,MANAGER,RECEPTIONIST")]
    [HttpGet]
    public async Task<IActionResult> GetIssues([FromQuery] Guid restaurantId)
    {
        var issues = await _db.CustomerIssues
            .Where(i => i.RestaurantId == restaurantId)
            .OrderByDescending(i => i.CreatedAt)
            .ToListAsync();
        return Ok(issues);
    }

    [Authorize(Roles = "SUPER_ADMIN,MANAGER,RECEPTIONIST")]
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

    public UsersController(RestaurantDbContext db)
    {
        _db = db;
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Manager}")]
    [HttpGet]
    public async Task<IActionResult> GetUsers([FromQuery] Guid restaurantId, [FromQuery] string? role)
    {
        var query = _db.Users.Where(u => u.RestaurantId == restaurantId);
        if (!string.IsNullOrEmpty(role))
        {
            query = query.Where(u => u.Role == role.ToUpper());
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
    public async Task<IActionResult> CreateStaff([FromBody] CreateStaffDto dto, [FromQuery] Guid restaurantId)
    {
        if (string.IsNullOrWhiteSpace(dto.Name) || string.IsNullOrWhiteSpace(dto.Email))
            return BadRequest(new { message = "Staff name and email are required." });

        var normalizedEmail = dto.Email.Trim().ToLowerInvariant();
        var existing = await _db.Users.AnyAsync(u => u.Email.ToLower() == normalizedEmail);
        if (existing)
            return BadRequest(new { message = "A user with this email address already exists." });

        var isSuperAdmin = User.IsInRole(UserRoles.SuperAdmin);
        var role = (dto.Role ?? UserRoles.Waiter).ToUpperInvariant();

        // Manager cannot create another Manager or Super Admin
        if (!isSuperAdmin && role is UserRoles.SuperAdmin or UserRoles.Manager)
        {
            return Forbid();
        }

        var user = new User
        {
            RestaurantId = restaurantId,
            Name = dto.Name.Trim(),
            Email = normalizedEmail,
            Phone = dto.Phone?.Trim(),
            Role = role,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(string.IsNullOrWhiteSpace(dto.Password) ? "bistro123" : dto.Password),
            Status = "ACTIVE",
            EmailVerified = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        return Ok(new UserDto(user.UserId, user.RestaurantId, user.Name, user.Email, user.Phone, user.Role, user.Status));
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Manager}")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteStaff(Guid id)
    {
        var user = await _db.Users.FindAsync(id);
        if (user == null) return NotFound(new { message = "User not found." });

        _db.Users.Remove(user);
        await _db.SaveChangesAsync();
        return Ok(new { message = "Staff member removed successfully." });
    }
}
