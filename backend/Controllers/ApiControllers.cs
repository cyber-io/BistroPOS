using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RestaurantSystem.Api.DTOs;
using RestaurantSystem.Api.Models;
using RestaurantSystem.Api.Repositories;
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
        var result = await _auth.DemoLoginAsync(request.Role);
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
        var restaurants = await _db.Restaurants.Where(r => r.Status == "ACTIVE").ToListAsync();
        return Ok(restaurants);
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

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Receptionist}")]
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

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Receptionist}")]
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

    public TablesController(ITableService tables)
    {
        _tables = tables;
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

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Receptionist}")]
    [HttpPut("{id:guid}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdateTableStatusRequest request)
    {
        var success = await _tables.UpdateTableStatusAsync(id, request);
        if (!success) return NotFound();
        return Ok(new { success = true, message = "Table status updated successfully." });
    }

    [HttpGet("{id:guid}/session")]
    public async Task<IActionResult> GetTableSession(Guid id)
    {
        var session = await _tables.GetOrCreateActiveSessionAsync(id);
        if (session == null) return NotFound();
        return Ok(session);
    }

    [HttpPost("{id:guid}/session/close")]
    public async Task<IActionResult> CloseTableSession(Guid id)
    {
        var success = await _tables.CloseSessionAsync(id);
        return Ok(new { success });
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Receptionist}")]
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

    public InventoryController(IInventoryService inventory)
    {
        _inventory = inventory;
    }

    [HttpGet]
    public async Task<IActionResult> GetInventory([FromQuery] Guid? restaurantId)
    {
        var targetId = restaurantId ?? UserProvisioning.DefaultRestaurantId;
        var items = await _inventory.GetInventoryAsync(targetId);
        return Ok(items);
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Kitchen}")]
    [HttpPost]
    public async Task<IActionResult> CreateItem([FromBody] CreateInventoryItemDto request)
    {
        var created = await _inventory.CreateItemAsync(request);
        return CreatedAtAction(nameof(GetInventory), new { restaurantId = created.RestaurantId }, created);
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Kitchen},{UserRoles.Receptionist}")]
    [HttpPatch("{id:guid}/stock")]
    public async Task<IActionResult> UpdateStock(Guid id, [FromBody] UpdateStockDto request)
    {
        var success = await _inventory.UpdateStockAsync(id, request.QuantityChange, request.Reason);
        if (!success) return NotFound();
        return Ok(new { success = true, message = "Stock updated successfully." });
    }

    [HttpPost("shortage")]
    public async Task<IActionResult> ReportShortage([FromBody] ReportShortageDto request)
    {
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
    private readonly IOrderService _orders;

    public MenuController(RestaurantDbContext db, INotificationService notifications, IOrderService orders)
    {
        _db = db;
        _notifications = notifications;
        _orders = orders;
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

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Receptionist},{UserRoles.Kitchen}")]
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

    [HttpGet("time-budget")]
    public async Task<IActionResult> GetTimeBudgetMenu([FromQuery] Guid restaurantId, [FromQuery] int minutes = 25)
    {
        var items = await _orders.GetTimeBudgetMenuAsync(restaurantId, minutes);
        return Ok(items);
    }

    [HttpGet("portions-remaining")]
    public async Task<IActionResult> GetPortionsRemaining([FromQuery] Guid restaurantId)
    {
        var portions = await _orders.GetPortionsRemainingAsync(restaurantId);
        return Ok(portions);
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

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Receptionist},{UserRoles.Kitchen},{UserRoles.Waiter}")]
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

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Receptionist}")]
    [HttpDelete("{idOrNumber}")]
    public async Task<IActionResult> DeleteOrder(string idOrNumber)
    {
        var success = await _orders.DeleteOrderAsync(idOrNumber);
        if (!success) return NotFound(new { success = false, message = "Order not found." });
        return Ok(new { success = true, message = $"Order {idOrNumber} removed successfully." });
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Receptionist},{UserRoles.Kitchen},{UserRoles.Waiter}")]
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

    [HttpPost]
    public async Task<IActionResult> CreateReservation([FromBody] CreateReservationRequest request)
    {
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var customerId);
        request = request with { CustomerId = customerId == Guid.Empty ? null : customerId };
        var (success, reservation, message) = await _reservations.CreateReservationAsync(request);
        if (!success) return Conflict(new { success = false, message });
        return Ok(reservation);
    }

    [Authorize(Roles = "SUPER_ADMIN,RECEPTIONIST,WAITER,KITCHEN")]
    [HttpGet]
    public async Task<IActionResult> GetReservations([FromQuery] Guid restaurantId, [FromQuery] DateOnly? date, [FromQuery] string? status)
    {
        var list = await _reservations.GetReservationsAsync(restaurantId, date, status);
        return Ok(list);
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Receptionist}")]
    [HttpPatch("{id:guid}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromQuery] string newStatus, [FromQuery] Guid? tableId)
    {
        var success = await _reservations.UpdateReservationStatusAsync(id, newStatus, tableId);
        if (!success) return NotFound();
        return Ok(new { success = true, status = newStatus });
    }

    [Authorize(Roles = "SUPER_ADMIN,RECEPTIONIST")]
    [HttpPatch("{id:guid}/reschedule")]
    public async Task<IActionResult> Reschedule(Guid id, [FromBody] RescheduleReservationRequest request)
    {
        var success = await _reservations.RescheduleReservationAsync(id, request);
        if (!success) return NotFound();
        return Ok(new { success = true, message = "Reservation rescheduled successfully." });
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Receptionist}")]
    [HttpPost("{id:guid}/event-plan")]
    public async Task<IActionResult> PlanEvent(Guid id, [FromBody] EventPlanDto dto)
    {
        var updated = await _reservations.PlanEventAsync(id, dto);
        return Ok(updated);
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Receptionist},{UserRoles.Kitchen}")]
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
    [Authorize(Roles = "SUPER_ADMIN,RECEPTIONIST")]
    [HttpGet]
    public async Task<IActionResult> GetPayments([FromQuery] Guid restaurantId) => Ok((await _db.Payments.Where(p => p.RestaurantId == restaurantId).OrderByDescending(p => p.CreatedAt).ToListAsync()).Select(PaymentService.Map));
    [Authorize(Roles = "SUPER_ADMIN,RECEPTIONIST")]
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

    [HttpPost("calculate-split")]
    public async Task<IActionResult> CalculateSplit([FromBody] CalculateSplitRequest request)
    {
        var result = await _payments.CalculateSplitAsync(request);
        return Ok(result);
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Receptionist},{UserRoles.Waiter}")]
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
    public WaitlistController(IWaitlistService waitlist) { _waitlist = waitlist; }

    [HttpGet]
    public async Task<IActionResult> GetWaitlist([FromQuery] Guid restaurantId)
    {
        return Ok(await _waitlist.GetWaitlistAsync(restaurantId));
    }

    [HttpPost]
    public async Task<IActionResult> AddWalkIn([FromBody] AddWalkInDto dto)
    {
        var entry = await _waitlist.AddWalkInAsync(dto);
        return Ok(entry);
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Receptionist}")]
    [HttpPost("{id:guid}/notify")]
    public async Task<IActionResult> Notify(Guid id)
    {
        var success = await _waitlist.NotifyGuestAsync(id);
        return success ? Ok(new { success = true }) : NotFound();
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Receptionist}")]
    [HttpPost("{id:guid}/seat")]
    public async Task<IActionResult> Seat(Guid id, [FromQuery] Guid tableId)
    {
        var success = await _waitlist.SeatGuestAsync(id, tableId);
        return success ? Ok(new { success = true }) : BadRequest();
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Receptionist}")]
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

    [Authorize(Roles = "SUPER_ADMIN,RECEPTIONIST,WAITER")]
    [HttpGet]
    public async Task<IActionResult> GetActiveHelpRequests([FromQuery] Guid restaurantId)
    {
        var list = await _help.GetActiveHelpRequestsAsync(restaurantId);
        return Ok(list);
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Waiter},{UserRoles.Receptionist}")]
    [HttpPost("{id:guid}/assign")]
    public async Task<IActionResult> AssignHelp(Guid id, [FromBody] AssignHelpRequestDto dto)
    {
        Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var waiterId);
        dto = dto with { WaiterId = waiterId, WaiterName = User.Identity?.Name ?? "Waiter" };
        var success = await _help.AssignHelpRequestAsync(id, dto);
        if (!success) return Conflict(new { success = false, message = "Request already assigned to another waiter." });
        return Ok(new { success = true, message = $"Assigned to {dto.WaiterName}" });
    }

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Waiter}")]
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

    [Authorize(Roles = "SUPER_ADMIN,RECEPTIONIST")]
    [HttpGet]
    public async Task<IActionResult> GetIssues([FromQuery] Guid restaurantId)
    {
        var issues = await _db.CustomerIssues
            .Where(i => i.RestaurantId == restaurantId)
            .OrderByDescending(i => i.CreatedAt)
            .ToListAsync();
        return Ok(issues);
    }

    [Authorize(Roles = "SUPER_ADMIN,RECEPTIONIST")]
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

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Receptionist}")]
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

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Receptionist}")]
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

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Receptionist}")]
    [HttpPost]
    public async Task<IActionResult> CreateStaff([FromBody] CreateStaffDto dto, [FromQuery] Guid restaurantId)
    {
        if (string.IsNullOrWhiteSpace(dto.Name) || string.IsNullOrWhiteSpace(dto.Email))
            return BadRequest(new { message = "Staff name and email are required." });

        var normalizedEmail = dto.Email.Trim().ToLowerInvariant();
        var existing = await _db.Users.AnyAsync(u => u.Email.ToLower() == normalizedEmail);
        if (existing)
            return BadRequest(new { message = "A user with this email address already exists." });

        var validRoles = new[] { UserRoles.SuperAdmin, UserRoles.Receptionist, UserRoles.Kitchen, UserRoles.Waiter };
        var role = (dto.Role ?? UserRoles.Waiter).ToUpperInvariant();
        if (!validRoles.Contains(role))
            role = UserRoles.Waiter;

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

    [Authorize(Roles = $"{UserRoles.SuperAdmin},{UserRoles.Receptionist}")]
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

[ApiController]
[Route("api/[controller]")]
public class LoyaltyController : ControllerBase
{
    private readonly ILoyaltyService _loyalty;

    public LoyaltyController(ILoyaltyService loyalty)
    {
        _loyalty = loyalty;
    }

    [HttpGet("balance")]
    public async Task<IActionResult> GetBalance([FromQuery] Guid restaurantId, [FromQuery] string phone)
    {
        if (string.IsNullOrWhiteSpace(phone)) return BadRequest("Phone number is required.");
        var loyalty = await _loyalty.GetLoyaltyByPhoneAsync(restaurantId, phone);
        if (loyalty == null)
        {
            return Ok(new CustomerLoyaltyDto(Guid.Empty, restaurantId, phone, null, null, 0, 0, "BRONZE"));
        }
        return Ok(loyalty);
    }

    [HttpPost("earn")]
    public async Task<IActionResult> EarnPoints([FromBody] EarnLoyaltyPointsDto request)
    {
        var result = await _loyalty.EarnPointsAsync(request);
        return Ok(result);
    }

    [HttpPost("redeem")]
    public async Task<IActionResult> RedeemPoints([FromBody] RedeemLoyaltyPointsDto request)
    {
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

    public FeedbackController(IFeedbackService feedback)
    {
        _feedback = feedback;
    }

    [HttpPost]
    public async Task<IActionResult> SubmitFeedback([FromBody] CreateFeedbackDto request)
    {
        var result = await _feedback.CreateFeedbackAsync(request);
        return Ok(result);
    }

    [HttpGet]
    public async Task<IActionResult> GetFeedbacks([FromQuery] Guid restaurantId)
    {
        var list = await _feedback.GetFeedbacksAsync(restaurantId);
        return Ok(list);
    }
}
