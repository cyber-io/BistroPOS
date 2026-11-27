using System.ComponentModel.DataAnnotations;
using RestaurantSystem.Api.Models;

namespace RestaurantSystem.Api.DTOs;

// --- AUTH DTOS ---
public record RegisterRequest(
    [Required, MaxLength(255)] string Name,
    [Required, EmailAddress, MaxLength(255)] string Email,
    [MaxLength(30)] string? Phone,
    [Required, MinLength(8)] string Password,
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
    string? SpecialInstruction,
    string? Course = "MAIN"
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
    string? SpecialInstruction,
    string Course = "MAIN",
    string Station = "MAIN",
    string PreparationStatus = "PENDING"
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
    string? AssignedWaiterName,
    int PositionX = 0,
    int PositionY = 0,
    string Shape = "SQUARE",
    string DiningArea = "everyday"
)
{
    // Capture display metadata before a public response removes its private QR identifier.
    public string AreaName { get; init; } = DiningLayoutCatalog.Area(Capacity, QrIdentifier, TableNumber);
    public string DisplayName { get; init; } = DiningLayoutCatalog.DisplayName(TableNumber, QrIdentifier);
    public string SeatingStyle { get; init; } = DiningLayoutCatalog.SeatingStyle(Capacity, QrIdentifier, TableNumber);
}

public record UpdateTablePositionDto(
    int PositionX,
    int PositionY,
    string? Shape = "SQUARE",
    string? DiningArea = "everyday"
);

public record InventoryItemDto(
    Guid ItemId,
    Guid RestaurantId,
    string Name,
    string Category,
    string Unit,
    decimal CurrentStock,
    decimal MinThreshold,
    decimal CostPerUnit,
    string Status,
    DateTime UpdatedAt
);

public record CreateInventoryItemDto(
    Guid RestaurantId,
    [Required] string Name,
    string? Category,
    [Required] string Unit,
    decimal CurrentStock,
    decimal MinThreshold,
    decimal CostPerUnit
);

public record UpdateStockDto(
    decimal QuantityChange,
    string? Reason
);

public record ReportShortageDto(
    Guid RestaurantId,
    string ItemType, // 'DISH' | 'INGREDIENT'
    Guid? MenuItemId,
    string? IngredientName,
    string ShortageStatus, // 'OUT_OF_STOCK' | 'LOW_STOCK'
    string UrgencyLevel, // 'HIGH' | 'CRITICAL'
    bool MarkDishSoldOut
);

public record UpdateTableStatusRequest(
    [Required] string Status,
    string? CustomerName,
    Guid? AssignedWaiterId
);

public record CreateTableRequest(
    int? TableNumber,
    int? Capacity,
    string? Area,
    Guid? RestaurantId
);

public record UpdateTableRequest(
    int? TableNumber,
    int? Capacity,
    string? Area,
    string? Status
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

public record CreateMenuCategoryRequest(
    Guid? RestaurantId,
    [Required] string Name,
    string? Description,
    int? SortOrder
);

public record UpdateMenuCategoryRequest(
    [Required] string Name,
    string? Description,
    int? SortOrder,
    string? Status
);

public record CreateMenuItemRequest(
    Guid? RestaurantId,
    [Required] Guid CategoryId,
    [Required] string Name,
    string? Description,
    [Required] decimal Price,
    string? Image,
    string? VegNonVeg,
    bool? Availability,
    string? SpiceLevel,
    bool? IsSweet,
    string? CustomizationOptions,
    string? AddOns
);

public record UpdateMenuItemRequest(
    Guid? CategoryId,
    [Required] string Name,
    string? Description,
    [Required] decimal Price,
    string? Image,
    string? VegNonVeg,
    bool? Availability,
    string? SpiceLevel,
    bool? IsSweet,
    string? CustomizationOptions,
    string? AddOns
);

// --- PAYMENT DTOS ---
public record InitiatePaymentRequest(
    Guid RestaurantId,
    Guid? OrderId,
    Guid? ReservationId,
    decimal Amount,
    string Method,
    string? IdempotencyKey,
    decimal TipAmount = 0,
    int SplitCount = 1,
    string SplitType = "FULL",
    string? CustomerName = null,
    string? CustomerPhone = null
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
    DateTime CreatedAt,
    decimal TipAmount = 0,
    int SplitCount = 1,
    string SplitType = "FULL",
    string? MockSignature = null
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

// --- RESTAURANT & STAFF MANAGEMENT DTOS (PHASE 2 RBAC) ---
public record CreateRestaurantDto(
    [Required, MaxLength(255)] string Name,
    [Required, MaxLength(255)] string Address,
    [Required, MaxLength(30)] string Phone,
    [Required, EmailAddress, MaxLength(255)] string Email,
    string? Logo = null,
    string? OpeningHours = null,
    decimal? TaxRate = null,
    int? InitialTableCount = null
);

public record UpdateRestaurantStatusDto(
    [Required] string Status
);

public record UpdateRestaurantSettingsDto(
    string? Name,
    string? Phone,
    string? Email,
    string? Address,
    string? OpeningHours,
    string? Settings
);

public record CreateStaffRequest(
    [Required, MaxLength(150)] string Name,
    [Required, EmailAddress, MaxLength(255)] string Email,
    [MaxLength(30)] string? Phone,
    [Required, MaxLength(50)] string Role,
    [Required, MinLength(8)] string Password,
    Guid? RestaurantId = null
);

public record CreateStaffDto(
    [Required] string Name,
    [Required, EmailAddress] string Email,
    string? Phone,
    string? Role,
    string? Password,
    Guid? RestaurantId = null
);

public record UpdateStaffDto(
    [Required] string Name,
    [Required, EmailAddress] string Email,
    string? Phone,
    string? Status,
    Guid? RestaurantId = null,
    string? Password = null
);

public record CreateManagerRequest(
    [Required] Guid RestaurantId,
    [Required, MaxLength(150)] string Name,
    [Required, EmailAddress, MaxLength(255)] string Email,
    [MaxLength(30)] string? Phone,
    [Required, MinLength(8)] string Password
);

public record StaffDto(
    Guid UserId,
    Guid? AuthUserId,
    Guid? RestaurantId,
    string Name,
    string Email,
    string? Phone,
    string Role,
    string Status,
    DateTime CreatedAt
);

public record UpdateStaffStatusRequest(
    [Required, MaxLength(50)] string Status
);

public record CurrentUserContextDto(
    Guid UserId,
    Guid? RestaurantId,
    string Name,
    string Email,
    string Role,
    string Status,
    bool IsSuperAdmin,
    bool IsManager
);

// --- LOYALTY, FEEDBACK & SAAS DTOS ---
public record CustomerLoyaltyDto(
    Guid LoyaltyId,
    Guid RestaurantId,
    string CustomerPhone,
    string? CustomerName,
    string? CustomerEmail,
    int PointsBalance,
    int LifetimePoints,
    string Tier
);

public record EarnLoyaltyPointsDto(
    Guid RestaurantId,
    [Required] string CustomerPhone,
    string? CustomerName,
    decimal OrderAmount
);

public record RedeemLoyaltyPointsDto(
    Guid RestaurantId,
    [Required] string CustomerPhone,
    int PointsToRedeem,
    Guid? OrderId = null
);

public record CustomerFeedbackDto(
    Guid FeedbackId,
    Guid RestaurantId,
    Guid? OrderId,
    string? CustomerName,
    string? CustomerPhone,
    int Rating,
    int FoodRating,
    int ServiceRating,
    int AmbianceRating,
    string? Comment,
    bool GoogleReviewClicked,
    DateTime CreatedAt
);

public record CreateFeedbackDto(
    Guid RestaurantId,
    Guid? OrderId,
    string? CustomerName,
    string? CustomerPhone,
    int Rating,
    int? FoodRating,
    int? ServiceRating,
    int? AmbianceRating,
    string? Comment,
    bool? GoogleReviewClicked
);

public record UpdateRestaurantWifiDto(
    string? WifiSsid,
    string? WifiPassword,
    bool? WifiEnabled,
    string? GoogleReviewUrl
);

// --- PHASE 1 & 2 EXTENDED DTOS ---

public record CalculateSplitRequest(
    Guid RestaurantId,
    Guid? OrderId,
    Guid? TableId,
    int SplitCount = 1,
    string SplitType = "EQUAL",
    decimal TipAmount = 0,
    int TipPercent = 0,
    decimal LoyaltyDiscount = 0,
    List<ItemizedShareRequest>? ItemShares = null
);

public record ItemizedShareRequest(
    Guid OrderItemId,
    int DinerIndex,
    int Quantity = 1
);

public record SplitCalculationDto(
    Guid? OrderId,
    Guid? TableId,
    decimal Subtotal,
    decimal Tax,
    decimal TipAmount,
    decimal LoyaltyDiscount,
    decimal TotalBill,
    decimal TotalPaid,
    decimal RemainingBalance,
    int SplitCount,
    string SplitType,
    List<DinerShareDto> Shares
);

public record DinerShareDto(
    int DinerIndex,
    string DinerLabel,
    decimal Amount,
    string PaymentStatus,
    Guid? PaymentId
);

public record ConfirmCashPaymentRequest(
    Guid? StaffUserId
);

public record EmailReceiptRequest(
    [Required, EmailAddress] string Email
);

public record UpdateOrderItemStatusRequest(
    [Required] string Status
);

public record PortionAvailabilityDto(
    Guid MenuItemId,
    string Name,
    int PortionsRemaining,
    bool IsAvailable,
    string Status
);

public record TimeBudgetMenuDto(
    Guid MenuItemId,
    string Name,
    string? Description,
    decimal Price,
    string CategoryName,
    int PrepTimeMinutes,
    int EstimatedTotalPrepMinutes,
    int EstimatedMinMinutes,
    int EstimatedMaxMinutes,
    string KitchenStation,
    string? Image,
    string? VegNonVeg
);

public record EventPlanDto(
    int ConfirmedHeadcount,
    List<string>? MealChoices,
    string? DietaryRequests,
    decimal DepositAmount,
    decimal DepositPaid,
    decimal EstimatedTotalCost,
    string? PrepSheetNotes
);

public record KitchenPrepSheetDto(
    Guid ReservationId,
    string BookingId,
    string CustomerName,
    int Headcount,
    DateOnly ReservationDate,
    TimeOnly ReservationTime,
    decimal DepositPaid,
    decimal OutstandingBalance,
    string? DietaryRequests,
    List<PrepTaskDto> Timeline
);

public record PrepTaskDto(
    string TimeOffset,
    string Course,
    string Description,
    string Station,
    string Status
);

public record WalkInWaitlistDto(
    Guid WaitlistId,
    Guid RestaurantId,
    string CustomerName,
    string CustomerPhone,
    int PartySize,
    string Status,
    int EstimatedWaitMinutes,
    DateTime? EstimatedReadyAt,
    DateTime? NotifiedAt,
    Guid? SeatedTableId,
    int? SeatedTableNumber,
    string? Notes,
    DateTime CreatedAt
);

public record AddWalkInDto(
    Guid RestaurantId,
    [Required] string CustomerName,
    [Required] string CustomerPhone,
    int PartySize = 2,
    string? Notes = null
);

public record WaitEstimateDto(
    int PartySize,
    int EstimatedWaitMinutesMin,
    int EstimatedWaitMinutesMax,
    int WaitingPartiesCount,
    int SuitableTablesCount,
    string Message
);

public record TextBeeConfigDto(
    bool Enabled,
    string BaseUrl,
    bool HasApiKey,
    string MaskedApiKey,
    string DeviceId,
    string DefaultCountryCode,
    int? SimSlotIndex
);

public record UpdateTextBeeConfigDto(
    bool? Enabled,
    string? BaseUrl,
    string? ApiKey,
    string? DeviceId,
    string? DefaultCountryCode,
    int? SimSlotIndex
);

public record SendTestSmsDto(
    [Required] string Phone,
    string? Message
);

public record SmsReceiptRequest(
    [Required] string Phone
);

public record SmsLogDto(
    Guid SmsLogId,
    Guid? RestaurantId,
    string EventType,
    string RecipientPhone,
    string MessageBody,
    string? ProviderMessageId,
    string Status,
    int Attempts,
    string? ErrorMessage,
    string? ReferenceId,
    DateTime CreatedAt,
    DateTime? SentAt,
    DateTime? DeliveredAt
);

public record SmsPreferenceDto(
    Guid RestaurantId,
    bool OrderConfirmationEnabled,
    bool OrderStatusEnabled,
    bool DigitalReceiptEnabled,
    bool ReservationEnabled,
    bool PaymentConfirmationEnabled,
    bool StaffShiftEnabled,
    bool InventoryAlertEnabled,
    bool LoyaltyEnabled,
    bool PromotionalEnabled,
    string? ManagerAlertPhone,
    Dictionary<string, string> Templates
);

public record UpdateSmsPreferenceDto(
    bool? OrderConfirmationEnabled,
    bool? OrderStatusEnabled,
    bool? DigitalReceiptEnabled,
    bool? ReservationEnabled,
    bool? PaymentConfirmationEnabled,
    bool? StaffShiftEnabled,
    bool? InventoryAlertEnabled,
    bool? LoyaltyEnabled,
    bool? PromotionalEnabled,
    string? ManagerAlertPhone,
    Dictionary<string, string>? Templates
);

public record SmsConnectivityDto(
    bool Connected,
    string StatusMessage,
    int DeviceCount,
    List<TextBeeDeviceDto> Devices
);

public record TextBeeDeviceDto(
    string Id,
    string Name,
    bool Enabled,
    string? LastSeen
);

public record TextBeeWebhookDto(
    string? Event,
    string? SmsId,
    string? SmsBatchId,
    string? Status,
    string? Error,
    string? Recipient
);

public record SmsConsentDto(
    [Required] string Phone,
    bool PromotionalOptIn,
    bool OptedOut = false
);
