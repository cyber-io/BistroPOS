using System.ComponentModel.DataAnnotations;
using RestaurantSystem.Api.Models;

namespace RestaurantSystem.Api.DTOs;

// --- AUTH DTOS ---
public record RegisterRequest(
    [Required, MaxLength(255)] string Name,
    [Required, EmailAddress, MaxLength(255)] string Email,
    [MaxLength(30)] string? Phone,
    [Required, MinLength(6)] string Password,
    string? Role,
    Guid? RestaurantId
);

public record LoginRequest(
    [Required, EmailAddress] string Email,
    [Required] string Password
);

public record AuthResponse(
    bool Success,
    string Token,
    UserDto? User,
    string? Message
);

public record UserDto(
    Guid UserId,
    Guid? RestaurantId,
    string Name,
    string Email,
    string? Phone,
    string Role,
    string Status
);

public record UpdateProfileRequest(
    [MaxLength(255)] string? Name,
    [MaxLength(30)] string? Phone
);

// --- ORDER DTOS ---
public record CreateOrderItemRequest(
    Guid MenuItemId,
    int Quantity,
    string? CustomizationJson,
    string? SpecialInstruction
);

public record CreateOrderRequest(
    Guid RestaurantId,
    Guid? CustomerId,
    Guid? TableId,
    [Required] string Source, // DINE_IN_QR, DELIVERY, TAKEAWAY
    [Required] List<CreateOrderItemRequest> Items,
    string? SpecialInstructions,
    string? DeliveryAddressJson,
    DateTime? TakeawayPickupTime,
    string? IdempotencyKey,
    string? CustomerName = null,
    string? CustomerPhone = null,
    Guid? SessionId = null
);

public record OrderItemDto(
    Guid OrderItemId,
    Guid MenuItemId,
    string ItemName,
    decimal PriceSnapshot,
    int Quantity,
    decimal LineTotal,
    string? CustomizationJson,
    string? SpecialInstruction
);

public record OrderDto(
    Guid OrderId,
    string OrderNumber,
    Guid RestaurantId,
    Guid? CustomerId,
    Guid? TableId,
    int? TableNumber,
    string Source,
    string Status,
    decimal Subtotal,
    decimal Tax,
    decimal Discount,
    decimal DeliveryFee,
    decimal Total,
    string? SpecialInstructions,
    string? RejectionReason,
    string? CancellationReason,
    string? CancelledBy,
    DateTime CreatedAt,
    List<OrderItemDto> Items,
    string? AccessToken = null,
    string PaymentStatus = "UNPAID",
    decimal PaidAmount = 0,
    string? CustomerName = null,
    string? CustomerPhone = null,
    string? DeliveryAddressJson = null,
    DateTime? TakeawayPickupTime = null,
    DateTime? ConfirmationRequestedAt = null,
    int EstimatedPrepTimeMinutes = 15,
    DateTime? EstimatedReadyAt = null,
    Guid? SessionId = null
);

public record UpdateOrderStatusRequest(
    [Required] string NewStatus,
    string? Reason
);

public record CancelOrderRequest(
    string? Reason
);

public record RejectOrderRequest(
    [Required] string Reason
);

// --- RESERVATION DTOS ---
public record CheckAvailabilityRequest(
    Guid RestaurantId,
    DateOnly Date,
    TimeOnly Time,
    int GuestCount
);

public record AvailabilitySlotDto(
    string TimeSlot,
    bool IsAvailable,
    string? Reason
);

public record CreateReservationRequest(
    Guid RestaurantId,
    Guid? CustomerId,
    [Required, MaxLength(255)] string CustomerName,
    [Required, MaxLength(30)] string CustomerPhone,
    [Required, EmailAddress] string CustomerEmail,
    DateOnly ReservationDate,
    TimeOnly ReservationTime,
    [Range(1, 70)] int GuestCount,
    string? SpecialRequest
);

public record ReservationDto(
    Guid ReservationId,
    string BookingId,
    Guid RestaurantId,
    Guid? TableId,
    int? TableNumber,
    string CustomerName,
    string CustomerPhone,
    string CustomerEmail,
    DateOnly ReservationDate,
    TimeOnly ReservationTime,
    int GuestCount,
    string Status,
    int GracePeriodMinutes,
    string? SpecialRequest,
    DateTime CreatedAt
);

public record RescheduleReservationRequest(
    DateOnly NewDate,
    TimeOnly NewTime,
    int? GuestCount
);

// --- TABLE & QR DTOS ---
public record TableDto(
    Guid TableId,
    Guid RestaurantId,
    int TableNumber,
    int Capacity,
    string Status,
    string QrIdentifier,
    string? CurrentCustomerName,
    Guid? AssignedWaiterId,
    string? AssignedWaiterName
)
{
    // Capture display metadata before a public response removes its private QR identifier.
    public string DiningArea { get; init; } = DiningLayoutCatalog.Area(Capacity, QrIdentifier);
    public string DisplayName { get; init; } = DiningLayoutCatalog.DisplayName(TableNumber, QrIdentifier);
    public string SeatingStyle { get; init; } = DiningLayoutCatalog.SeatingStyle(Capacity, QrIdentifier);
}

public record UpdateTableStatusRequest(
    [Required] string Status,
    string? CustomerName,
    Guid? AssignedWaiterId
);

public record QrValidationResponse(
    bool IsValid,
    Guid? RestaurantId,
    string? RestaurantName,
    Guid? TableId,
    int? TableNumber,
    string? TableStatus,
    string? Message
);

// --- MENU DTOS ---
public record MenuCategoryDto(
    Guid CategoryId,
    string Name,
    string? Description,
    int SortOrder,
    List<MenuItemDto> Items
);

public record MenuItemDto(
    Guid MenuItemId,
    Guid CategoryId,
    string CategoryName,
    string Name,
    string? Description,
    decimal Price,
    string? Image,
    string VegNonVeg,
    bool Availability,
    string SpiceLevel,
    bool IsSweet,
    string? AddOnsJson,
    string? CustomizationOptionsJson,
    string? AllergensJson = "[]",
    string? Ingredients = null,
    string? PortionsJson = "[]",
    string? DietaryTagsJson = "[]",
    bool IsSpecial = false,
    int PrepTimeMinutes = 15
);

public record DiningSessionDto(
    Guid SessionId,
    Guid RestaurantId,
    Guid TableId,
    int TableNumber,
    string SessionCode,
    string Status,
    DateTime CreatedAt,
    List<OrderDto> Orders
);

public record UpdateItemAvailabilityRequest(
    bool Availability
);

// --- PAYMENT DTOS ---
public record InitiatePaymentRequest(
    Guid RestaurantId,
    Guid? OrderId,
    Guid? ReservationId,
    decimal Amount,
    string Method,
    string? IdempotencyKey
);

public record VerifyPaymentRequest(
    Guid PaymentId,
    string TransactionId,
    string Signature,
    string Status
);

public record PaymentDto(
    Guid PaymentId,
    Guid RestaurantId,
    Guid? OrderId,
    decimal Amount,
    string Currency,
    string Method,
    string Status,
    string? TransactionId,
    DateTime CreatedAt
);

public record WebhookPayloadDto(
    string Event,
    string PaymentId,
    string TransactionId,
    decimal Amount,
    string Signature
);

// --- HELP & ISSUES DTOS ---
public record CreateHelpRequestDto(
    Guid RestaurantId,
    Guid TableId,
    Guid? CustomerId,
    [Required] string Message,
    string? RequestType = "CUSTOM"
);

public record AssignHelpRequestDto(
    Guid WaiterId,
    string WaiterName
);

public record HelpRequestDto(
    Guid RequestId,
    Guid RestaurantId,
    Guid TableId,
    int TableNumber,
    string Message,
    string Status,
    Guid? AssignedWaiterId,
    string? AssignedWaiterName,
    DateTime CreatedAt,
    DateTime? AcceptedAt,
    string? AccessToken = null,
    string RequestType = "CUSTOM"
);

public record CreateIssueDto(
    Guid RestaurantId,
    Guid? OrderId,
    Guid? TableId,
    [Required] string Description
);

public record ResolveIssueDto(
    [Required] string Resolution,
    bool Escalate
);

public record DemoLoginRequest(string Role);

// --- RESTAURANT & STAFF MANAGEMENT DTOS ---
public record UpdateRestaurantSettingsDto(
    string? Name,
    string? Phone,
    string? Email,
    string? Address,
    string? OpeningHours,
    string? Settings
);

public record CreateStaffDto(
    [Required] string Name,
    [Required, EmailAddress] string Email,
    string? Phone,
    string? Role,
    string? Password
);
