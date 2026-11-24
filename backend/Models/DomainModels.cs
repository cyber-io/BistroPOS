using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json;

namespace RestaurantSystem.Api.Models;

public static class UserRoles
{
    public const string SuperAdmin = "SUPER_ADMIN";
    public const string Manager = "MANAGER";
    public const string Receptionist = "RECEPTIONIST";
    public const string Kitchen = "KITCHEN";
    public const string Waiter = "WAITER";
    public const string Customer = "CUSTOMER";
}

public static class TableStatuses
{
    public const string Available = "AVAILABLE";
    public const string Reserved = "RESERVED";
    public const string Occupied = "OCCUPIED";
    public const string WaitingForCleaning = "WAITING_FOR_CLEANING";
    public const string Cleaning = "CLEANING";
    public const string OutOfService = "OUT_OF_SERVICE";
}

public static class OrderSources
{
    public const string DineInQr = "DINE_IN_QR";
    public const string Delivery = "DELIVERY";
    public const string Takeaway = "TAKEAWAY";
}

public static class OrderStatuses
{
    public const string New = "NEW";
    public const string Accepted = "ACCEPTED";
    public const string Preparing = "PREPARING";
    public const string Ready = "READY";
    public const string PendingConfirmation = "PENDING_CONFIRMATION";
    public const string Delivered = "DELIVERED";
    public const string Cancelled = "CANCELLED";
    public const string OutForDelivery = "OUT_FOR_DELIVERY";
    public const string ReadyForPickup = "READY_FOR_PICKUP";
    public const string PickedUp = "PICKED_UP";
    public const string ConfirmationTimeout = "CONFIRMATION_TIMEOUT";
}

public static class ReservationStatuses
{
    public const string Pending = "PENDING";
    public const string Confirmed = "CONFIRMED";
    public const string Arrived = "ARRIVED";
    public const string Seated = "SEATED";
    public const string Completed = "COMPLETED";
    public const string Cancelled = "CANCELLED";
    public const string NoShow = "NO_SHOW";
    public const string Rescheduled = "RESCHEDULED";
    public const string Expired = "EXPIRED";
}

public static class PaymentStatuses
{
    public const string Pending = "PENDING";
    public const string Processing = "PROCESSING";
    public const string Paid = "PAID";
    public const string Failed = "FAILED";
    public const string Refunded = "REFUNDED";
}

[Table("restaurants")]
public class Restaurant
{
    [Key]
    public Guid RestaurantId { get; set; } = Guid.NewGuid();
    [Required, MaxLength(255)]
    public string Name { get; set; } = string.Empty;
    public string? Logo { get; set; }
    [Required]
    public string Address { get; set; } = string.Empty;
    [Required, MaxLength(30)]
    public string Phone { get; set; } = string.Empty;
    [Required, MaxLength(255)]
    public string Email { get; set; } = string.Empty;
    public string OpeningHours { get; set; } = "{}";
    public string Settings { get; set; } = "{}";
    [MaxLength(50)]
    public string Status { get; set; } = "ACTIVE";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<TableEntity> Tables { get; set; } = new List<TableEntity>();
    public ICollection<MenuCategory> Categories { get; set; } = new List<MenuCategory>();

    [NotMapped]
    public string? WifiSsid
    {
        get => GetSettingString("wifi_ssid", "Bistro-HighSpeed-Guest");
        set => SetSetting("wifi_ssid", value);
    }

    [NotMapped]
    public string? WifiPassword
    {
        get => GetSettingString("wifi_password", "Bistro@2026");
        set => SetSetting("wifi_password", value);
    }

    [NotMapped]
    public bool WifiEnabled
    {
        get => GetSettingBool("wifi_enabled", true);
        set => SetSetting("wifi_enabled", value);
    }

    [NotMapped]
    public string? GoogleReviewUrl
    {
        get => GetSettingString("google_review_url", "https://maps.google.com");
        set => SetSetting("google_review_url", value);
    }

    [NotMapped]
    public string? SubscriptionTier
    {
        get => GetSettingString("subscription_tier", "PRO");
        set => SetSetting("subscription_tier", value);
    }

    private string? GetSettingString(string key, string? defaultValue)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(Settings) || Settings == "{}") return defaultValue;
            using var doc = JsonDocument.Parse(Settings);
            if (doc.RootElement.TryGetProperty(key, out var el))
            {
                if (el.ValueKind == JsonValueKind.String)
                    return el.GetString() ?? defaultValue;
                return el.ToString();
            }
            return defaultValue;
        }
        catch
        {
            return defaultValue;
        }
    }

    private bool GetSettingBool(string key, bool defaultValue)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(Settings) || Settings == "{}") return defaultValue;
            using var doc = JsonDocument.Parse(Settings);
            if (doc.RootElement.TryGetProperty(key, out var el))
            {
                if (el.ValueKind == JsonValueKind.True) return true;
                if (el.ValueKind == JsonValueKind.False) return false;
            }
            return defaultValue;
        }
        catch
        {
            return defaultValue;
        }
    }

    private void SetSetting(string key, object? value)
    {
        try
        {
            var dict = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            if (!string.IsNullOrWhiteSpace(Settings) && Settings.Trim().StartsWith("{"))
            {
                try
                {
                    using var doc = JsonDocument.Parse(Settings);
                    foreach (var prop in doc.RootElement.EnumerateObject())
                    {
                        if (prop.Value.ValueKind == JsonValueKind.String)
                            dict[prop.Name] = prop.Value.GetString();
                        else if (prop.Value.ValueKind == JsonValueKind.True)
                            dict[prop.Name] = true;
                        else if (prop.Value.ValueKind == JsonValueKind.False)
                            dict[prop.Name] = false;
                        else if (prop.Value.ValueKind == JsonValueKind.Number && prop.Value.TryGetDecimal(out var d))
                            dict[prop.Name] = d;
                        else
                            dict[prop.Name] = prop.Value.GetRawText();
                    }
                }
                catch { }
            }
            dict[key] = value;
            Settings = JsonSerializer.Serialize(dict);
        }
        catch { }
    }
}

[Table("users")]
public class User
{
    [Key]
    public Guid UserId { get; set; } = Guid.NewGuid();
    public Guid? RestaurantId { get; set; }
    [ForeignKey(nameof(RestaurantId))]
    public Restaurant? Restaurant { get; set; }
    [Required, MaxLength(255)]
    public string Name { get; set; } = string.Empty;
    [Required, EmailAddress, MaxLength(255)]
    public string Email { get; set; } = string.Empty;
    [MaxLength(30)]
    public string? Phone { get; set; }
    [Required]
    public string PasswordHash { get; set; } = string.Empty;
    [Required, MaxLength(50)]
    public string Role { get; set; } = UserRoles.Customer;
    [MaxLength(50)]
    public string Status { get; set; } = "ACTIVE";
    public bool EmailVerified { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

[Table("tables")]
public class TableEntity
{
    [Key]
    public Guid TableId { get; set; } = Guid.NewGuid();
    [Required]
    public Guid RestaurantId { get; set; }
    [ForeignKey(nameof(RestaurantId))]
    public Restaurant? Restaurant { get; set; }
    public int TableNumber { get; set; }
    public int Capacity { get; set; }
    [Required, MaxLength(50)]
    public string Status { get; set; } = TableStatuses.Available;
    [Required, MaxLength(100)]
    public string QrIdentifier { get; set; } = string.Empty;
    public string? CurrentCustomerName { get; set; }
    public Guid? AssignedWaiterId { get; set; }
    [ForeignKey(nameof(AssignedWaiterId))]
    public User? AssignedWaiter { get; set; }
    public int PositionX { get; set; } = 0;
    public int PositionY { get; set; } = 0;
    [MaxLength(50)]
    public string Shape { get; set; } = "SQUARE";
    [MaxLength(50)]
    public string DiningArea { get; set; } = "everyday";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

[Table("menu_categories")]
public class MenuCategory
{
    [Key]
    public Guid CategoryId { get; set; } = Guid.NewGuid();
    [Required]
    public Guid RestaurantId { get; set; }
    [Required, MaxLength(100)]
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int SortOrder { get; set; } = 0;
    [MaxLength(50)]
    public string Status { get; set; } = "ACTIVE";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<MenuItem> Items { get; set; } = new List<MenuItem>();
}

[Table("menu_items")]
public class MenuItem
{
    [Key]
    public Guid MenuItemId { get; set; } = Guid.NewGuid();
    [Required]
    public Guid RestaurantId { get; set; }
    [Required]
    public Guid CategoryId { get; set; }
    [ForeignKey(nameof(CategoryId))]
    public MenuCategory? Category { get; set; }
    [Required, MaxLength(255)]
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    [Column(TypeName = "numeric(10,2)")]
    public decimal Price { get; set; }
    public string? Image { get; set; }
    [Required, MaxLength(20)]
    public string VegNonVeg { get; set; } = "VEG"; // VEG, NON_VEG
    public bool Availability { get; set; } = true;
    public string SpiceLevel { get; set; } = "MEDIUM";
    public bool IsSweet { get; set; } = false;
    public string AddOns { get; set; } = "[]";
    public string CustomizationOptions { get; set; } = "[]";
    public string Allergens { get; set; } = "[]";
    public string? Ingredients { get; set; }
    public string Portions { get; set; } = "[]"; // e.g. [{"name":"Half","price":140},{"name":"Full","price":240}]
    public string DietaryTags { get; set; } = "[]"; // e.g. ["Vegan","Gluten-Free"]
    public bool IsSpecial { get; set; } = false;
    public int PrepTimeMinutes { get; set; } = 15;
    [MaxLength(50)]
    public string KitchenStation { get; set; } = "MAIN"; // MAIN, GRILL, BEVERAGES, DESSERTS
    public string Recipe { get; set; } = "[]"; // e.g. [{"itemId":"...","name":"Paneer","quantity":0.15,"unit":"kg"}]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

[Table("dining_sessions")]
public class DiningSession
{
    [Key]
    public Guid SessionId { get; set; } = Guid.NewGuid();
    [Required]
    public Guid RestaurantId { get; set; }
    [Required]
    public Guid TableId { get; set; }
    [ForeignKey(nameof(TableId))]
    public TableEntity? Table { get; set; }
    [NotMapped]
    public string SessionCode { get; set; } = string.Empty;
    [Required, MaxLength(50)]
    public string Status { get; set; } = "ACTIVE"; // ACTIVE, CLOSED
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ClosedAt { get; set; }
    [NotMapped]
    public DateTime? ExpiresAt { get; set; }
}

[Table("orders")]
public class Order
{
    [Key]
    public Guid OrderId { get; set; } = Guid.NewGuid();
    [Required, MaxLength(50)]
    public string OrderNumber { get; set; } = string.Empty;
    [Required]
    public Guid RestaurantId { get; set; }
    public Guid? CustomerId { get; set; }
    [ForeignKey(nameof(CustomerId))]
    public User? Customer { get; set; }
    public Guid? TableId { get; set; }
    [ForeignKey(nameof(TableId))]
    public TableEntity? Table { get; set; }
    public Guid? SessionId { get; set; }
    [ForeignKey(nameof(SessionId))]
    public DiningSession? Session { get; set; }
    [Required, MaxLength(50)]
    public string Source { get; set; } = OrderSources.DineInQr;
    [Required, MaxLength(50)]
    public string Status { get; set; } = OrderStatuses.New;
    [Column(TypeName = "numeric(10,2)")]
    public decimal Subtotal { get; set; }
    [Column(TypeName = "numeric(10,2)")]
    public decimal Tax { get; set; }
    [Column(TypeName = "numeric(10,2)")]
    public decimal Discount { get; set; }
    [Column(TypeName = "numeric(10,2)")]
    public decimal DeliveryFee { get; set; }
    [Column(TypeName = "numeric(10,2)")]
    public decimal Total { get; set; }
    public int EstimatedPrepTimeMinutes { get; set; } = 15;
    public DateTime? EstimatedReadyAt { get; set; }
    public string? DeliveryAddress { get; set; }
    public string? CustomerName { get; set; }
    public string? CustomerPhone { get; set; }
    public string? IdempotencyKey { get; set; }
    public DateTime? TakeawayPickupTime { get; set; }
    public string? RejectionReason { get; set; }
    public string? CancellationReason { get; set; }
    public string? CancelledBy { get; set; }
    public string? SpecialInstructions { get; set; }
    public DateTime? ServedAt { get; set; }
    public DateTime? ConfirmationRequestedAt { get; set; }
    public DateTime? CustomerConfirmedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<OrderItem> Items { get; set; } = new List<OrderItem>();
}

[Table("order_items")]
public class OrderItem
{
    [Key]
    public Guid OrderItemId { get; set; } = Guid.NewGuid();
    [Required]
    public Guid OrderId { get; set; }
    [ForeignKey(nameof(OrderId))]
    public Order? Order { get; set; }
    [Required]
    public Guid MenuItemId { get; set; }
    [ForeignKey(nameof(MenuItemId))]
    public MenuItem? MenuItem { get; set; }
    [Required, MaxLength(255)]
    public string ItemNameSnapshot { get; set; } = string.Empty;
    [Column(TypeName = "numeric(10,2)")]
    public decimal PriceSnapshot { get; set; }
    public int Quantity { get; set; }
    public string Customization { get; set; } = "{}";
    public string? SpecialInstruction { get; set; }
    [Column(TypeName = "numeric(10,2)")]
    public decimal LineTotal { get; set; }
    [MaxLength(50)]
    public string Course { get; set; } = "MAIN"; // STARTER, MAIN, DESSERT, BEVERAGE
    [MaxLength(50)]
    public string Station { get; set; } = "MAIN"; // MAIN, GRILL, BEVERAGES, DESSERTS
    [MaxLength(50)]
    public string PreparationStatus { get; set; } = "PENDING"; // PENDING, PREPARING, READY
    public DateTime? PreparedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

[Table("reservations")]
public class Reservation
{
    [Key]
    public Guid ReservationId { get; set; } = Guid.NewGuid();
    [Required, MaxLength(50)]
    public string BookingId { get; set; } = string.Empty;
    [Required]
    public Guid RestaurantId { get; set; }
    public Guid? CustomerId { get; set; }
    public Guid? TableId { get; set; }
    [ForeignKey(nameof(TableId))]
    public TableEntity? Table { get; set; }
    [Required, MaxLength(255)]
    public string CustomerName { get; set; } = string.Empty;
    [Required, MaxLength(30)]
    public string CustomerPhone { get; set; } = string.Empty;
    [Required, EmailAddress, MaxLength(255)]
    public string CustomerEmail { get; set; } = string.Empty;
    public DateOnly ReservationDate { get; set; }
    public TimeOnly ReservationTime { get; set; }
    public int GuestCount { get; set; }
    [Required, MaxLength(50)]
    public string Status { get; set; } = ReservationStatuses.Pending;
    public int GracePeriodMinutes { get; set; } = 10;
    public string? SpecialRequest { get; set; }
    public int? ConfirmedHeadcount { get; set; }
    public string EventMealChoices { get; set; } = "{}";
    public string? DietaryRequests { get; set; }
    [Column(TypeName = "numeric(10,2)")]
    public decimal DepositAmount { get; set; } = 0;
    [Column(TypeName = "numeric(10,2)")]
    public decimal DepositPaid { get; set; } = 0;
    [Column(TypeName = "numeric(10,2)")]
    public decimal EstimatedTotalCost { get; set; } = 0;
    public string? PrepSheetNotes { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

[Table("payments")]
public class Payment
{
    [Key]
    public Guid PaymentId { get; set; } = Guid.NewGuid();
    [Required]
    public Guid RestaurantId { get; set; }
    public Guid? OrderId { get; set; }
    [ForeignKey(nameof(OrderId))]
    public Order? Order { get; set; }
    public Guid? ReservationId { get; set; }
    [ForeignKey(nameof(ReservationId))]
    public Reservation? Reservation { get; set; }
    [Column(TypeName = "numeric(10,2)")]
    public decimal Amount { get; set; }
    [Column(TypeName = "numeric(10,2)")]
    public decimal TipAmount { get; set; } = 0;
    public int SplitCount { get; set; } = 1;
    [MaxLength(50)]
    public string SplitType { get; set; } = "FULL";
    [MaxLength(10)]
    public string Currency { get; set; } = "INR";
    [Required, MaxLength(50)]
    public string Method { get; set; } = "ONLINE"; // CASH, UPI, CARD, ONLINE, NET_BANKING, WALLET
    [Required, MaxLength(50)]
    public string Status { get; set; } = PaymentStatuses.Pending;
    public string? TransactionId { get; set; }
    [MaxLength(100)]
    public string? IdempotencyKey { get; set; }
    public string? GatewaySignature { get; set; }
    public string? ProviderResponse { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

[Table("help_requests")]
public class HelpRequest
{
    [Key]
    public Guid RequestId { get; set; } = Guid.NewGuid();
    [Required]
    public Guid RestaurantId { get; set; }
    [Required]
    public Guid TableId { get; set; }
    [ForeignKey(nameof(TableId))]
    public TableEntity? Table { get; set; }
    public Guid? CustomerId { get; set; }
    public Guid? AssignedWaiterId { get; set; }
    [ForeignKey(nameof(AssignedWaiterId))]
    public User? AssignedWaiter { get; set; }
    public string? AssignedWaiterName { get; set; }
    [Required]
    public string Message { get; set; } = string.Empty;
    [MaxLength(50)]
    public string RequestType { get; set; } = "CUSTOM";
    [Required, MaxLength(50)]
    public string Status { get; set; } = "PENDING"; // PENDING, ASSIGNED, RESOLVED
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? AcceptedAt { get; set; }
    public DateTime? ResolvedAt { get; set; }
}

[Table("customer_issues")]
public class CustomerIssue
{
    [Key]
    public Guid IssueId { get; set; } = Guid.NewGuid();
    [Required]
    public Guid RestaurantId { get; set; }
    public Guid? OrderId { get; set; }
    public Guid? TableId { get; set; }
    [Required]
    public string Description { get; set; } = string.Empty;
    [Required, MaxLength(50)]
    public string Status { get; set; } = "PENDING"; // PENDING, INVESTIGATING, RESOLVED, ESCALATED
    public Guid? AssignedStaffId { get; set; }
    public string? Resolution { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ResolvedAt { get; set; }
}

[Table("notifications")]
public class NotificationEntity
{
    [Key]
    public Guid NotificationId { get; set; } = Guid.NewGuid();
    [Required]
    public Guid RestaurantId { get; set; }
    public Guid? RecipientId { get; set; }
    public string? TargetRole { get; set; }
    [Required, MaxLength(100)]
    public string Type { get; set; } = string.Empty;
    [Required]
    public string Message { get; set; } = string.Empty;
    public Guid? RelatedEntityId { get; set; }
    public bool ReadStatus { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

[Table("delivery_addresses")]
public class DeliveryAddressEntity
{
    [Key]
    public Guid AddressId { get; set; } = Guid.NewGuid();
    [Required]
    public Guid CustomerId { get; set; }
    [Required, MaxLength(255)]
    public string Name { get; set; } = string.Empty;
    [Required, MaxLength(30)]
    public string Mobile { get; set; } = string.Empty;
    [Required]
    public string Address { get; set; } = string.Empty;
    public string? Landmark { get; set; }
    [Required, MaxLength(20)]
    public string Pincode { get; set; } = string.Empty;
    public string? DeliveryInstructions { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

[Table("audit_logs")]
public class AuditLog
{
    [Key]
    public Guid LogId { get; set; } = Guid.NewGuid();
    public Guid? RestaurantId { get; set; }
    public Guid? UserId { get; set; }
    public string? UserRole { get; set; }
    [Required, MaxLength(100)]
    public string Action { get; set; } = string.Empty;
    [Required, MaxLength(100)]
    public string Resource { get; set; } = string.Empty;
    public string? Metadata { get; set; }
    public string? IpAddress { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
