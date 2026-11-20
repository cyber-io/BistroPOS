using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using RestaurantSystem.Api.Configuration;
using RestaurantSystem.Api.DTOs;
using RestaurantSystem.Api.Hubs;
using RestaurantSystem.Api.Models;
using RestaurantSystem.Api.Repositories;

namespace RestaurantSystem.Api.Services;

public class NotificationService : INotificationService
{
    private readonly IHubContext<NotificationHub, INotificationClient> _hubContext;
    private readonly RestaurantDbContext _db;

    public NotificationService(IHubContext<NotificationHub, INotificationClient> hubContext, RestaurantDbContext db)
    {
        _hubContext = hubContext;
        _db = db;
    }

    public async Task NotifyRoleAsync(Guid restaurantId, string targetRole, string type, string title, string message, object? payload = null)
    {
        var groupName = $"tenant_{restaurantId}_{targetRole.ToLower()}";
        await _hubContext.Clients.Group(groupName).ReceiveNotification(type, title, message, payload);
        if (targetRole != UserRoles.SuperAdmin)
        {
            await _hubContext.Clients.Group($"tenant_{restaurantId}_super_admin").ReceiveNotification(type, title, message, payload);
        }

        // Store notification record
        _db.Notifications.Add(new NotificationEntity
        {
            RestaurantId = restaurantId,
            TargetRole = targetRole.ToUpper(),
            Type = type,
            Message = message,
            CreatedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync();
    }

    public async Task NotifyTableAsync(Guid restaurantId, Guid tableId, string type, string title, string message, object? payload = null)
    {
        var groupName = $"table_{restaurantId}_{tableId}";
        await _hubContext.Clients.Group(groupName).ReceiveNotification(type, title, message, payload);
    }

    public async Task NotifyUserAsync(Guid userId, string type, string title, string message, object? payload = null)
    {
        var groupName = $"user_{userId}";
        await _hubContext.Clients.Group(groupName).ReceiveNotification(type, title, message, payload);
    }
}

public class AuditLogService : IAuditLogService
{
    private readonly RestaurantDbContext _db;

    public AuditLogService(RestaurantDbContext db)
    {
        _db = db;
    }

    public async Task LogAsync(Guid? restaurantId, Guid? userId, string? userRole, string action, string resource, object? metadata = null, string? ipAddress = null)
    {
        try
        {
            var log = new AuditLog
            {
                RestaurantId = restaurantId,
                UserId = userId,
                UserRole = userRole,
                Action = action,
                Resource = resource,
                Metadata = metadata != null ? JsonSerializer.Serialize(metadata) : null,
                IpAddress = ipAddress,
                CreatedAt = DateTime.UtcNow
            };
            _db.AuditLogs.Add(log);
            await _db.SaveChangesAsync();
        }
        catch
        {
            // Logging should never throw unhandled error into critical path
        }
    }
}

public class PaymentService(RestaurantDbContext db, IAuditLogService audit, INotificationService notifications) : IPaymentService
{
    public async Task<PaymentDto> InitiatePaymentAsync(InitiatePaymentRequest request)
    {
        var method = request.Method?.ToUpperInvariant() ?? "CASH";
        if (method is "NETBANKING") method = "NET_BANKING";
        if (method is not ("CASH" or "UPI" or "CARD" or "ONLINE" or "NET_BANKING" or "WALLET"))
            throw new ArgumentException($"Unsupported payment method '{request.Method}'.");
        return await CreatePayment(request, method != "CASH");
    }
    public Task<PaymentDto> RecordPaymentAsync(InitiatePaymentRequest request) => CreatePayment(request, true);
    private async Task<PaymentDto> CreatePayment(InitiatePaymentRequest request, bool collected)
    {
        if (!request.OrderId.HasValue) throw new ArgumentException("An order is required for payment.");
        var normalizedMethod = request.Method?.ToUpperInvariant() ?? "CASH";
        if (normalizedMethod is "NETBANKING") normalizedMethod = "NET_BANKING";
        if (normalizedMethod is not ("CASH" or "UPI" or "CARD" or "ONLINE" or "NET_BANKING" or "WALLET"))
            throw new ArgumentException($"Unsupported payment method '{request.Method}'.");
        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtext({request.OrderId.ToString()}))");
        var order = await db.Orders.FindAsync(request.OrderId.Value) ?? throw new ArgumentException("Order not found.");
        
        // Ensure tenant ID matches order
        var restaurantId = order.RestaurantId;
        if (request.RestaurantId != Guid.Empty && request.RestaurantId != order.RestaurantId)
        {
            request = request with { RestaurantId = order.RestaurantId };
        }

        if (order.Status == OrderStatuses.Cancelled) throw new InvalidOperationException("A cancelled order cannot be charged.");
        if (!string.IsNullOrWhiteSpace(request.IdempotencyKey)) {
            var previous = await db.Payments.FirstOrDefaultAsync(p => p.RestaurantId == restaurantId && p.IdempotencyKey == request.IdempotencyKey);
            if (previous != null) {
                if(previous.OrderId != request.OrderId || Math.Abs(previous.Amount - request.Amount) > 0.05m) throw new InvalidOperationException("The payment key was already used for another request.");
                return Map(previous);
            }
        }
        var paid = await db.Payments.Where(p => p.OrderId == order.OrderId && p.Status == PaymentStatuses.Paid).SumAsync(p => (decimal?)p.Amount) ?? 0;
        
        var remaining = Math.Round(order.Total - paid, 2);
        var reqAmount = Math.Round(request.Amount, 2);
        if (remaining <= 0)
            throw new InvalidOperationException("This order has already been fully paid.");
        if (reqAmount <= 0)
            throw new ArgumentException("Amount must be positive.");
        if (reqAmount > remaining)
        {
            if (reqAmount - remaining <= 1.0m)
                reqAmount = remaining;
            else
                throw new ArgumentException($"Amount cannot exceed the order balance of ₹{remaining:F2}.");
        }

        var payment = new Payment { 
            RestaurantId = restaurantId, 
            OrderId = order.OrderId, 
            Amount = reqAmount,
            TipAmount = request.TipAmount,
            SplitCount = request.SplitCount > 0 ? request.SplitCount : 1,
            SplitType = string.IsNullOrWhiteSpace(request.SplitType) ? "FULL" : request.SplitType,
            Method = normalizedMethod, 
            Status = collected ? PaymentStatuses.Paid : PaymentStatuses.Pending,
            IdempotencyKey = request.IdempotencyKey, 
            TransactionId = "TXN-" + Guid.NewGuid().ToString("N")[..12].ToUpperInvariant() 
        };
        db.Payments.Add(payment);

        HelpRequest? cleaningReq = null;
        TableEntity? tableToClean = null;
        List<Reservation> autoCompletedReservations = new();

        // After payment, if order is fully paid and tied to a table, directly send table for cleaning and complete active reservation
        if (collected && (paid + reqAmount >= order.Total - 0.05m))
        {
            if (order.TableId.HasValue)
            {
                try
                {
                    tableToClean = await db.Tables.FindAsync(order.TableId.Value);
                    if (tableToClean != null && tableToClean.Status != TableStatuses.OutOfService)
                    {
                        tableToClean.Status = TableStatuses.WaitingForCleaning;
                        tableToClean.CurrentCustomerName = null;
                        tableToClean.AssignedWaiterId = null;
                        tableToClean.UpdatedAt = DateTime.UtcNow;

                        cleaningReq = new HelpRequest
                        {
                            RestaurantId = restaurantId,
                            TableId = tableToClean.TableId,
                            Message = $"Payment completed for Table A{tableToClean.TableNumber} (Order {order.OrderNumber}). Table automatically marked for cleaning (2-min auto-release).",
                            Status = "PENDING",
                            CreatedAt = DateTime.UtcNow
                        };
                        db.HelpRequests.Add(cleaningReq);
                    }

                    // Auto-complete any active reservation for this dining table (SEATED or ARRIVED)
                    var activeReservations = await db.Reservations
                        .Where(r => r.RestaurantId == restaurantId 
                                 && r.TableId == order.TableId.Value 
                                 && (r.Status == ReservationStatuses.Seated || r.Status == ReservationStatuses.Arrived || r.Status == ReservationStatuses.Confirmed))
                        .ToListAsync();

                    foreach (var res in activeReservations)
                    {
                        res.Status = ReservationStatuses.Completed;
                        res.UpdatedAt = DateTime.UtcNow;
                        autoCompletedReservations.Add(res);
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[PaymentService] Table cleaning / reservation auto-complete notice: {ex.Message}");
                }
            }

            if (request.ReservationId.HasValue)
            {
                try
                {
                    var directRes = await db.Reservations.FindAsync(request.ReservationId.Value);
                    if (directRes != null && directRes.Status != ReservationStatuses.Completed && directRes.Status != ReservationStatuses.Cancelled)
                    {
                        directRes.Status = ReservationStatuses.Completed;
                        directRes.UpdatedAt = DateTime.UtcNow;
                        if (!autoCompletedReservations.Contains(directRes)) autoCompletedReservations.Add(directRes);
                    }
                }
                catch { }
            }
        }

        await db.SaveChangesAsync();
        await transaction.CommitAsync();

        // Realtime notifications for automatically completed reservations
        foreach (var res in autoCompletedReservations)
        {
            try
            {
                await notifications.NotifyRoleAsync(
                    restaurantId,
                    UserRoles.Receptionist,
                    "RESERVATION_STATUS_CHANGED",
                    $"Reservation Completed: {res.CustomerName}",
                    $"Reservation {res.BookingId} for {res.CustomerName} (Table A{tableToClean?.TableNumber}) automatically completed after bill payment.",
                    new { ReservationId = res.ReservationId, Status = ReservationStatuses.Completed, BookingId = res.BookingId }
                );
                await audit.LogAsync(restaurantId, null, UserRoles.Receptionist, "RESERVATION_COMPLETED", "reservations", new { res.BookingId, res.ReservationId, OrderId = order.OrderId });
            }
            catch { /* non-critical notification */ }
        }

        if (cleaningReq != null && tableToClean != null)
        {
            try
            {
                // Realtime notification to Floor Staff (Waiters)
                await notifications.NotifyRoleAsync(
                    restaurantId,
                    UserRoles.Waiter,
                    "CUSTOMER_HELP_REQUEST",
                    $"Table A{tableToClean.TableNumber} needs cleaning",
                    $"Payment completed for Table A{tableToClean.TableNumber}. Table marked for cleaning. Will be available automatically in 2 mins after acceptance.",
                    new { cleaningReq.RequestId, TableNumber = tableToClean.TableNumber, TableId = tableToClean.TableId, IsCleaning = true, Status = TableStatuses.WaitingForCleaning }
                );
                // Realtime notification to Receptionist / POS
                await notifications.NotifyRoleAsync(
                    restaurantId,
                    UserRoles.Receptionist,
                    "TABLE_STATUS_CHANGED",
                    $"Table A{tableToClean.TableNumber} waiting for cleaning",
                    $"Payment recorded. Table A{tableToClean.TableNumber} is waiting for cleaning.",
                    new { TableId = tableToClean.TableId, Status = TableStatuses.WaitingForCleaning, TableNumber = tableToClean.TableNumber }
                );
            }
            catch { /* non-critical realtime dispatch */ }
        }

        await audit.LogAsync(payment.RestaurantId, null, collected ? UserRoles.Receptionist : UserRoles.Customer, collected ? "PAYMENT_COLLECTED" : "PAYMENT_PENDING", "payments", new { payment.PaymentId, payment.OrderId, payment.Amount, payment.Method });
        return Map(payment);
    }
    public Task<bool> VerifyPaymentAsync(VerifyPaymentRequest request) => throw new InvalidOperationException("A verified online payment gateway has not been configured.");
    public Task<bool> ProcessWebhookAsync(WebhookPayloadDto payload) => throw new InvalidOperationException("A verified online payment gateway has not been configured.");
    public static PaymentDto Map(Payment p) => new(p.PaymentId,p.RestaurantId,p.OrderId,p.Amount,p.Currency,p.Method,p.Status,p.TransactionId,p.CreatedAt,p.TipAmount,p.SplitCount,p.SplitType);
}
