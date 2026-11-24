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

public class PaymentService(
    RestaurantDbContext db,
    IAuditLogService audit,
    INotificationService notifications,
    IOptions<PaymentGatewayOptions> gatewayOptions,
    ILogger<PaymentService> logger) : IPaymentService
{
    public async Task<PaymentDto> InitiatePaymentAsync(InitiatePaymentRequest request)
    {
        var method = request.Method?.ToUpperInvariant() ?? "CASH";
        if (method is "NETBANKING") method = "NET_BANKING";
        if (method is not ("CASH" or "UPI" or "CARD" or "ONLINE" or "NET_BANKING" or "WALLET"))
            throw new ArgumentException($"Unsupported payment method '{request.Method}'.");

        // Keep UPI, card, and other online payments pending until backend confirms provider capture
        var payment = await CreatePayment(request, collected: false);

        if (method == "CASH" && request.OrderId.HasValue)
        {
            try
            {
                var order = await db.Orders.FindAsync(request.OrderId.Value);
                var tableNum = order?.TableId.HasValue == true ? (await db.Tables.FindAsync(order.TableId.Value))?.TableNumber : null;
                var helpReq = new HelpRequest
                {
                    RestaurantId = payment.RestaurantId,
                    TableId = order?.TableId ?? Guid.Empty,
                    Message = $"Cash payment requested for Table A{tableNum} (Order {order?.OrderNumber}): ₹{payment.Amount:F2}. PaymentId: {payment.PaymentId}",
                    Status = "PENDING",
                    CreatedAt = DateTime.UtcNow
                };
                if (order?.TableId.HasValue == true)
                {
                    db.HelpRequests.Add(helpReq);
                    await db.SaveChangesAsync();
                    await notifications.NotifyRoleAsync(
                        payment.RestaurantId,
                        UserRoles.Waiter,
                        "CASH_PAYMENT_REQUESTED",
                        $"Cash Payment Table A{tableNum}",
                        $"Cash payment of ₹{payment.Amount:F2} requested. Please collect and confirm receipt.",
                        new { helpReq.RequestId, PaymentId = payment.PaymentId, TableNumber = tableNum, Amount = payment.Amount }
                    );
                }
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to create cash payment help request");
            }
        }

        return payment;
    }

    public Task<PaymentDto> RecordPaymentAsync(InitiatePaymentRequest request) => CreatePayment(request, true);

    private async Task<PaymentDto> CreatePayment(InitiatePaymentRequest request, bool collected)
    {
        if (!request.OrderId.HasValue) throw new ArgumentException("An order is required for payment.");
        var normalizedMethod = request.Method?.ToUpperInvariant() ?? "CASH";
        if (normalizedMethod is "NETBANKING") normalizedMethod = "NET_BANKING";
        if (normalizedMethod is not ("CASH" or "UPI" or "CARD" or "ONLINE" or "NET_BANKING" or "WALLET"))
            throw new ArgumentException($"Unsupported payment method '{request.Method}'.");
        await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync() : null;
        if (db.Database.IsRelational())
        {
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtext({request.OrderId.ToString()}))");
        }
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

                    // Preserve tomorrow's booking! Auto-complete only TODAY's active reservation for this table (SEATED or ARRIVED)
                    var today = DateOnly.FromDateTime(DateTime.UtcNow);
                    var activeReservations = await db.Reservations
                        .Where(r => r.RestaurantId == restaurantId 
                                 && r.TableId == order.TableId.Value 
                                 && r.ReservationDate == today
                                 && (r.Status == ReservationStatuses.Seated || r.Status == ReservationStatuses.Arrived))
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
        if (transaction != null) await transaction.CommitAsync();

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

    public async Task<bool> VerifyPaymentAsync(VerifyPaymentRequest request)
    {
        var payment = await db.Payments.FindAsync(request.PaymentId);
        if (payment == null) return false;

        // Idempotent duplicate check: already paid returns true immediately without double credit
        if (payment.Status == PaymentStatuses.Paid) return true;

        if (request.Status?.ToUpperInvariant() is "FAILED" or "CANCELLED")
        {
            payment.Status = PaymentStatuses.Failed;
            payment.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            await audit.LogAsync(payment.RestaurantId, null, "PAYMENT_GATEWAY", "PAYMENT_FAILED", "payments", new { payment.PaymentId, request.TransactionId });
            return false;
        }

        // Validate HMAC signature if gateway secret is configured
        var secret = gatewayOptions.Value.SecretKey;
        if (!string.IsNullOrEmpty(secret) && secret != "dev-secret-change-in-production")
        {
            var expectedPayload = $"{payment.PaymentId}|{request.TransactionId}";
            using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
            var hash = Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes(expectedPayload)));
            if (!string.Equals(hash, request.Signature, StringComparison.OrdinalIgnoreCase))
            {
                logger.LogWarning("Invalid payment signature for PaymentId {PaymentId}", payment.PaymentId);
                return false;
            }
        }

        payment.Status = PaymentStatuses.Paid;
        payment.TransactionId = string.IsNullOrWhiteSpace(request.TransactionId) ? payment.TransactionId : request.TransactionId;
        payment.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();

        if (payment.OrderId.HasValue)
        {
            await CompleteTableIfOrderPaidAsync(payment.OrderId.Value, payment.RestaurantId);
        }

        await audit.LogAsync(payment.RestaurantId, null, UserRoles.Customer, "PAYMENT_VERIFIED", "payments", new { payment.PaymentId, payment.OrderId, payment.Amount, payment.Method, payment.TransactionId });
        return true;
    }

    public async Task<bool> ProcessWebhookAsync(WebhookPayloadDto payload)
    {
        Payment? payment = null;
        if (Guid.TryParse(payload.PaymentId, out var paymentGuid))
        {
            payment = await db.Payments.FindAsync(paymentGuid);
        }
        if (payment == null && !string.IsNullOrWhiteSpace(payload.TransactionId))
        {
            payment = await db.Payments.FirstOrDefaultAsync(p => p.TransactionId == payload.TransactionId);
        }
        if (payment == null) return false;

        // Idempotent duplicate callback check
        if (payment.Status == PaymentStatuses.Paid) return true;

        if (payload.Event is "payment.failed" or "PAYMENT_FAILED")
        {
            payment.Status = PaymentStatuses.Failed;
            payment.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return true;
        }

        if (payload.Event is "payment.captured" or "PAYMENT_SUCCESS" or "charge.successful")
        {
            if (Math.Abs(payload.Amount - payment.Amount) > 0.05m)
            {
                logger.LogWarning("Webhook amount mismatch for Payment {PaymentId}: got {Amount}, expected {Expected}", payment.PaymentId, payload.Amount, payment.Amount);
                return false;
            }

            payment.Status = PaymentStatuses.Paid;
            if (!string.IsNullOrWhiteSpace(payload.TransactionId)) payment.TransactionId = payload.TransactionId;
            payment.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();

            if (payment.OrderId.HasValue)
            {
                await CompleteTableIfOrderPaidAsync(payment.OrderId.Value, payment.RestaurantId);
            }

            await audit.LogAsync(payment.RestaurantId, null, "WEBHOOK", "PAYMENT_COLLECTED", "payments", new { payment.PaymentId, payment.OrderId, payment.Amount });
            return true;
        }

        return true;
    }

    public async Task<bool> ConfirmCashPaymentAsync(Guid paymentId, Guid? staffUserId)
    {
        var payment = await db.Payments.FindAsync(paymentId);
        if (payment == null) return false;

        // Idempotent duplicate confirmation
        if (payment.Status == PaymentStatuses.Paid) return true;

        if (payment.Method != "CASH")
            throw new ArgumentException("Only cash payments can be confirmed through the cash confirmation flow.");

        payment.Status = PaymentStatuses.Paid;
        payment.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        // Resolve waiter-call help request for this cash payment if present
        var helpReq = await db.HelpRequests
            .Where(h => h.RestaurantId == payment.RestaurantId && h.Status == "PENDING" && h.Message.Contains(payment.PaymentId.ToString()))
            .FirstOrDefaultAsync();

        if (helpReq != null)
        {
            helpReq.Status = "RESOLVED";
            helpReq.ResolvedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
        }

        if (payment.OrderId.HasValue)
        {
            await CompleteTableIfOrderPaidAsync(payment.OrderId.Value, payment.RestaurantId);
        }

        await audit.LogAsync(payment.RestaurantId, staffUserId, UserRoles.Waiter, "CASH_PAYMENT_CONFIRMED", "payments", new { payment.PaymentId, payment.OrderId, payment.Amount });
        return true;
    }

    public async Task<SplitCalculationDto> CalculateSplitAsync(CalculateSplitRequest request)
    {
        Order? order = null;
        if (request.OrderId.HasValue)
        {
            order = await db.Orders.Include(o => o.Items).FirstOrDefaultAsync(o => o.OrderId == request.OrderId.Value);
        }
        else if (request.TableId.HasValue)
        {
            order = await db.Orders.Include(o => o.Items)
                .Where(o => o.RestaurantId == request.RestaurantId && o.TableId == request.TableId.Value && o.Status != OrderStatuses.Cancelled)
                .OrderByDescending(o => o.CreatedAt)
                .FirstOrDefaultAsync();
        }

        if (order == null) throw new ArgumentException("Active order not found for split calculation.");

        var subtotal = order.Subtotal;
        var tax = order.Tax;
        var tip = request.TipAmount > 0 
            ? request.TipAmount 
            : (request.TipPercent > 0 ? Math.Round(subtotal * request.TipPercent / 100m, 2) : 0m);
        var discount = request.LoyaltyDiscount;
        var totalBill = Math.Round(Math.Max(0, subtotal + tax + tip - discount), 2);

        var existingPaid = await db.Payments
            .Where(p => p.OrderId == order.OrderId && p.Status == PaymentStatuses.Paid)
            .SumAsync(p => (decimal?)p.Amount) ?? 0;

        var remainingBalance = Math.Round(Math.Max(0, totalBill - existingPaid), 2);
        var shares = new List<DinerShareDto>();

        var existingPayments = await db.Payments
            .Where(p => p.OrderId == order.OrderId)
            .OrderBy(p => p.CreatedAt)
            .ToListAsync();

        if (string.Equals(request.SplitType, "ITEMIZED", StringComparison.OrdinalIgnoreCase) && request.ItemShares != null && request.ItemShares.Any())
        {
            var dinerItemGroups = request.ItemShares.GroupBy(s => s.DinerIndex).OrderBy(g => g.Key).ToList();
            var totalDinerSubtotal = request.ItemShares.Sum(s =>
            {
                var item = order.Items.FirstOrDefault(i => i.OrderItemId == s.OrderItemId);
                return (item?.PriceSnapshot ?? 0m) * s.Quantity;
            });

            foreach (var group in dinerItemGroups)
            {
                var dinerSubtotal = group.Sum(s =>
                {
                    var item = order.Items.FirstOrDefault(i => i.OrderItemId == s.OrderItemId);
                    return (item?.PriceSnapshot ?? 0m) * s.Quantity;
                });

                var proportion = totalDinerSubtotal > 0 ? dinerSubtotal / totalDinerSubtotal : 1m / dinerItemGroups.Count;
                var dinerAmount = Math.Round(totalBill * proportion, 2);

                var matchPayment = existingPayments.FirstOrDefault(p => Math.Abs(p.Amount - dinerAmount) <= 0.05m);
                shares.Add(new DinerShareDto(
                    group.Key,
                    $"Diner {group.Key + 1}",
                    dinerAmount,
                    matchPayment?.Status ?? "UNPAID",
                    matchPayment?.PaymentId
                ));
            }
        }
        else
        {
            // Equal Split
            int count = Math.Max(1, request.SplitCount);
            decimal baseShare = Math.Round(totalBill / count, 2);
            decimal roundingDifference = totalBill - (baseShare * count);

            decimal runningPaid = existingPaid;
            for (int i = 0; i < count; i++)
            {
                decimal dinerAmount = baseShare + (i == count - 1 ? roundingDifference : 0m);
                string status = "UNPAID";
                Guid? paymentId = null;

                if (runningPaid >= dinerAmount - 0.05m)
                {
                    status = "PAID";
                    runningPaid -= dinerAmount;
                    var match = existingPayments.FirstOrDefault(p => p.Status == PaymentStatuses.Paid && Math.Abs(p.Amount - dinerAmount) <= 0.05m);
                    paymentId = match?.PaymentId;
                }
                else
                {
                    var pendingMatch = existingPayments.FirstOrDefault(p => p.Status == PaymentStatuses.Pending && Math.Abs(p.Amount - dinerAmount) <= 0.05m);
                    if (pendingMatch != null)
                    {
                        status = "PENDING";
                        paymentId = pendingMatch.PaymentId;
                    }
                }

                shares.Add(new DinerShareDto(
                    i,
                    $"Diner {i + 1}",
                    dinerAmount,
                    status,
                    paymentId
                ));
            }
        }

        return new SplitCalculationDto(
            order.OrderId,
            order.TableId,
            subtotal,
            tax,
            tip,
            discount,
            totalBill,
            existingPaid,
            remainingBalance,
            shares.Count,
            request.SplitType ?? "EQUAL",
            shares
        );
    }

    private async Task CompleteTableIfOrderPaidAsync(Guid orderId, Guid restaurantId)
    {
        var order = await db.Orders.FindAsync(orderId);
        if (order == null) return;

        var paid = await db.Payments.Where(p => p.OrderId == orderId && p.Status == PaymentStatuses.Paid).SumAsync(p => (decimal?)p.Amount) ?? 0;
        if (paid < order.Total - 0.05m) return;

        if (order.TableId.HasValue)
        {
            try
            {
                var tableToClean = await db.Tables.FindAsync(order.TableId.Value);
                if (tableToClean != null && tableToClean.Status != TableStatuses.OutOfService)
                {
                    tableToClean.Status = TableStatuses.WaitingForCleaning;
                    tableToClean.CurrentCustomerName = null;
                    tableToClean.AssignedWaiterId = null;
                    tableToClean.UpdatedAt = DateTime.UtcNow;

                    var cleaningReq = new HelpRequest
                    {
                        RestaurantId = restaurantId,
                        TableId = tableToClean.TableId,
                        Message = $"Payment completed for Table A{tableToClean.TableNumber} (Order {order.OrderNumber}). Table automatically marked for cleaning (2-min auto-release).",
                        Status = "PENDING",
                        CreatedAt = DateTime.UtcNow
                    };
                    db.HelpRequests.Add(cleaningReq);
                    await db.SaveChangesAsync();

                    await notifications.NotifyRoleAsync(
                        restaurantId,
                        UserRoles.Waiter,
                        "CUSTOMER_HELP_REQUEST",
                        $"Table A{tableToClean.TableNumber} needs cleaning",
                        $"Payment completed for Table A{tableToClean.TableNumber}. Table marked for cleaning.",
                        new { cleaningReq.RequestId, TableNumber = tableToClean.TableNumber, TableId = tableToClean.TableId, IsCleaning = true, Status = TableStatuses.WaitingForCleaning }
                    );

                    await notifications.NotifyRoleAsync(
                        restaurantId,
                        UserRoles.Receptionist,
                        "TABLE_STATUS_CHANGED",
                        $"Table A{tableToClean.TableNumber} waiting for cleaning",
                        $"Payment recorded. Table A{tableToClean.TableNumber} is waiting for cleaning.",
                        new { TableId = tableToClean.TableId, Status = TableStatuses.WaitingForCleaning, TableNumber = tableToClean.TableNumber }
                    );
                }

                // Preserve tomorrow's booking! Only complete today's Seated / Arrived reservations
                var today = DateOnly.FromDateTime(DateTime.UtcNow);
                var activeReservations = await db.Reservations
                    .Where(r => r.RestaurantId == restaurantId 
                             && r.TableId == order.TableId.Value 
                             && r.ReservationDate == today
                             && (r.Status == ReservationStatuses.Seated || r.Status == ReservationStatuses.Arrived))
                    .ToListAsync();

                foreach (var res in activeReservations)
                {
                    res.Status = ReservationStatuses.Completed;
                    res.UpdatedAt = DateTime.UtcNow;
                    await notifications.NotifyRoleAsync(
                        restaurantId,
                        UserRoles.Receptionist,
                        "RESERVATION_STATUS_CHANGED",
                        $"Reservation Completed: {res.CustomerName}",
                        $"Reservation {res.BookingId} for {res.CustomerName} automatically completed after bill payment.",
                        new { ReservationId = res.ReservationId, Status = ReservationStatuses.Completed, BookingId = res.BookingId }
                    );
                }

                await db.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error completing table/reservation for order {OrderId}", orderId);
            }
        }
    }

    public static PaymentDto Map(Payment p) => new(p.PaymentId,p.RestaurantId,p.OrderId,p.Amount,p.Currency,p.Method,p.Status,p.TransactionId,p.CreatedAt,p.TipAmount,p.SplitCount,p.SplitType);
}
