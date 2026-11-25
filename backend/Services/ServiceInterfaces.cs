using RestaurantSystem.Api.DTOs;
using RestaurantSystem.Api.Models;

namespace RestaurantSystem.Api.Services;

public interface IAuthService
{
    Task<AuthResponse> RegisterAsync(RegisterRequest request);
    Task<AuthResponse> LoginAsync(LoginRequest request);
    Task<AuthResponse> DemoLoginAsync(string role, Guid? restaurantId = null);
    Task<UserDto?> GetUserByIdAsync(Guid userId);
    Task<AuthResponse> UpdateProfileAsync(Guid userId, UpdateProfileRequest request);
    Task<(bool Success, StaffDto? Staff, string Message)> CreateStaffAsync(CreateStaffRequest request);
    Task<(bool Success, StaffDto? Manager, string Message)> CreateManagerAsync(CreateManagerRequest request);
    Task<List<StaffDto>> GetStaffAsync(Guid? restaurantId = null);
    Task<(bool Success, string Message)> UpdateStaffStatusAsync(Guid staffUserId, string status);
    Task<CurrentUserContextDto?> GetCurrentUserContextAsync();
}

public interface IOrderService
{
    Task<OrderDto> CreateOrderAsync(CreateOrderRequest request);
    Task<OrderDto?> GetOrderByIdAsync(Guid orderId, Guid? requestingUserId, string userRole, Guid? requestingRestaurantId);
    Task<List<OrderDto>> GetOrdersAsync(Guid restaurantId, string? source, string? status, string? search);
    Task<bool> UpdateOrderStatusAsync(Guid orderId, string newStatus, string? reason, string operatorRole);
    Task<(bool Success, string Message)> CancelOrderAsync(Guid orderId, Guid? userId, string userRole, string? reason);
    Task<bool> DeleteOrderAsync(string idOrNumber);
    Task<bool> ConfirmCustomerOrderReceiptAsync(Guid orderId, bool confirmed);
    Task<bool> UpdateOrderItemStatusAsync(Guid orderItemId, string status);
    Task<List<TimeBudgetMenuDto>> GetTimeBudgetMenuAsync(Guid restaurantId, int maxMinutes);
    Task<List<PortionAvailabilityDto>> GetPortionsRemainingAsync(Guid restaurantId);
}

public interface IReservationService
{
    Task<List<AvailabilitySlotDto>> GetAvailabilityAsync(Guid restaurantId, DateOnly date, int guestCount);
    Task<(bool Success, ReservationDto? Reservation, string Message)> CreateReservationAsync(CreateReservationRequest request);
    Task<List<ReservationDto>> GetReservationsAsync(Guid restaurantId, DateOnly? date, string? status);
    Task<bool> UpdateReservationStatusAsync(Guid reservationId, string newStatus, Guid? assignedTableId);
    Task<ReservationDto?> RescheduleReservationAsync(Guid reservationId, RescheduleReservationRequest request);
    Task<ReservationDto?> LookupReservationAsync(string query);
    Task<ReservationDto> PlanEventAsync(Guid reservationId, EventPlanDto dto);
    Task<KitchenPrepSheetDto> GetKitchenPrepSheetAsync(Guid reservationId);
}

public interface ITableService
{
    Task<List<TableDto>> GetTablesAsync(Guid restaurantId);
    Task<TableDto?> GetTableByIdAsync(Guid tableId);
    Task<QrValidationResponse> ValidateQrAsync(string qrIdentifier);
    Task<bool> UpdateTableStatusAsync(Guid tableId, UpdateTableStatusRequest request);
    Task<bool> UpdateTablePositionAsync(Guid tableId, UpdateTablePositionDto request);
    Task<DiningSessionDto?> GetOrCreateActiveSessionAsync(Guid tableId);
    Task<bool> CloseSessionAsync(Guid tableId);
}

public interface IInventoryService
{
    Task<List<InventoryItemDto>> GetInventoryAsync(Guid restaurantId);
    Task<InventoryItemDto> CreateItemAsync(CreateInventoryItemDto request);
    Task<bool> UpdateStockAsync(Guid itemId, decimal quantityChange, string? reason);
    Task<bool> ReportShortageAsync(ReportShortageDto request);
}

public interface IHelpRequestService
{
    Task<HelpRequestDto> CreateHelpRequestAsync(CreateHelpRequestDto request);
    Task<List<HelpRequestDto>> GetActiveHelpRequestsAsync(Guid restaurantId);
    Task<bool> AssignHelpRequestAsync(Guid requestId, AssignHelpRequestDto dto);
    Task<bool> ResolveHelpRequestAsync(Guid requestId);
}

public interface IPaymentService
{
    Task<PaymentDto> InitiatePaymentAsync(InitiatePaymentRequest request);
    Task<PaymentDto> RecordPaymentAsync(InitiatePaymentRequest request);
    Task<bool> VerifyPaymentAsync(VerifyPaymentRequest request);
    Task<bool> ProcessWebhookAsync(WebhookPayloadDto payload, string? headerSignature = null);
    Task<SplitCalculationDto> CalculateSplitAsync(CalculateSplitRequest request);
    Task<bool> ConfirmCashPaymentAsync(Guid paymentId, Guid? staffUserId);
}

public interface IEmailReceiptService
{
    Task<(bool Success, string Message)> SendReceiptEmailAsync(Guid orderId, string email);
}

public interface IWaitlistService
{
    Task<List<WalkInWaitlistDto>> GetWaitlistAsync(Guid restaurantId);
    Task<WalkInWaitlistDto> AddWalkInAsync(AddWalkInDto dto);
    Task<bool> NotifyGuestAsync(Guid waitlistId);
    Task<bool> SeatGuestAsync(Guid waitlistId, Guid tableId);
    Task<bool> CancelWaitlistEntryAsync(Guid waitlistId);
    Task<WaitEstimateDto> GetWaitEstimateAsync(Guid restaurantId, int partySize);
}

public interface INotificationService
{
    Task NotifyRoleAsync(Guid restaurantId, string targetRole, string type, string title, string message, object? payload = null);
    Task NotifyTableAsync(Guid restaurantId, Guid tableId, string type, string title, string message, object? payload = null);
    Task NotifyUserAsync(Guid userId, string type, string title, string message, object? payload = null);
}

public interface IAuditLogService
{
    Task LogAsync(Guid? restaurantId, Guid? userId, string? userRole, string action, string resource, object? metadata = null, string? ipAddress = null);
}

public interface ILoyaltyService
{
    Task<CustomerLoyaltyDto?> GetLoyaltyByPhoneAsync(Guid restaurantId, string phone);
    Task<CustomerLoyaltyDto> EarnPointsAsync(EarnLoyaltyPointsDto request);
    Task<(bool Success, CustomerLoyaltyDto? Loyalty, decimal DiscountAmount, string Message)> RedeemPointsAsync(RedeemLoyaltyPointsDto request);
}

public interface IFeedbackService
{
    Task<CustomerFeedbackDto> CreateFeedbackAsync(CreateFeedbackDto request);
    Task<List<CustomerFeedbackDto>> GetFeedbacksAsync(Guid restaurantId);
}
