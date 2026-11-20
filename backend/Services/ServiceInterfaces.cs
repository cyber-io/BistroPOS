using RestaurantSystem.Api.DTOs;
using RestaurantSystem.Api.Models;

namespace RestaurantSystem.Api.Services;

public interface IAuthService
{
    Task<AuthResponse> RegisterAsync(RegisterRequest request);
    Task<AuthResponse> LoginAsync(LoginRequest request);
    Task<AuthResponse> DemoLoginAsync(string role);
    Task<UserDto?> GetUserByIdAsync(Guid userId);
    Task<AuthResponse> UpdateProfileAsync(Guid userId, UpdateProfileRequest request);
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
}

public interface IReservationService
{
    Task<List<AvailabilitySlotDto>> GetAvailabilityAsync(Guid restaurantId, DateOnly date, int guestCount);
    Task<(bool Success, ReservationDto? Reservation, string Message)> CreateReservationAsync(CreateReservationRequest request);
    Task<List<ReservationDto>> GetReservationsAsync(Guid restaurantId, DateOnly? date, string? status);
    Task<bool> UpdateReservationStatusAsync(Guid reservationId, string newStatus, Guid? assignedTableId);
    Task<bool> RescheduleReservationAsync(Guid reservationId, RescheduleReservationRequest request);
}

public interface ITableService
{
    Task<List<TableDto>> GetTablesAsync(Guid restaurantId);
    Task<TableDto?> GetTableByIdAsync(Guid tableId);
    Task<QrValidationResponse> ValidateQrAsync(string qrIdentifier);
    Task<bool> UpdateTableStatusAsync(Guid tableId, UpdateTableStatusRequest request);
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
    Task<bool> ProcessWebhookAsync(WebhookPayloadDto payload);
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
