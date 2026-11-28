using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using RestaurantSystem.Api.Configuration;
using RestaurantSystem.Api.DTOs;
using RestaurantSystem.Api.Models;
using RestaurantSystem.Api.Repositories;
using RestaurantSystem.Api.Security;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace RestaurantSystem.Api.Services;

public class OrderService : IOrderService
{
    private readonly RestaurantDbContext _db;
    private readonly BusinessRulesOptions _rules;
    private readonly INotificationService _notifications;
    private readonly IAuditLogService _audit;
    private readonly ResourceTokens _tokens;
    private readonly IHttpContextAccessor _http;
    private readonly ITextBeeSmsService _sms;

    public OrderService(
        RestaurantDbContext db,
        IOptions<BusinessRulesOptions> rules,
        INotificationService notifications,
        IAuditLogService audit, ResourceTokens tokens, IHttpContextAccessor http,
        ITextBeeSmsService sms)
    {
        _db = db;
        _rules = rules.Value;
        _notifications = notifications;
        _audit = audit;
        _tokens = tokens;
        _http = http;
        _sms = sms;
    }

    public async Task<OrderDto> CreateOrderAsync(CreateOrderRequest request)
    {
        if (request.Source is not (OrderSources.DineInQr or OrderSources.Delivery or OrderSources.Takeaway))
            throw new ArgumentException("Invalid order source.");
        if (!await _db.Restaurants.AnyAsync(r => r.RestaurantId == request.RestaurantId))
            throw new ArgumentException("Restaurant not found.");
        await using var transaction = await _db.Database.BeginTransactionAsync();
        await _db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtext({request.RestaurantId.ToString()}))");
        if (!string.IsNullOrWhiteSpace(request.IdempotencyKey))
        {
            var existing = await _db.Orders.Include(o => o.Items).Include(o => o.Table).FirstOrDefaultAsync(o => o.RestaurantId == request.RestaurantId && o.IdempotencyKey == request.IdempotencyKey);
            if (existing != null)
            {
                var remaining = existing.Items.ToList();
                var sameItems = remaining.Count == request.Items.Count;
                foreach (var line in request.Items)
                {
                    var match = remaining.FirstOrDefault(e => e.MenuItemId == line.MenuItemId && e.Quantity == line.Quantity && JsonNode.DeepEquals(JsonNode.Parse(e.Customization), JsonNode.Parse(line.CustomizationJson ?? "{}")));
                    if (match == null) { sameItems = false; break; }
                    remaining.Remove(match);
                }
                if (existing.CustomerId != request.CustomerId || existing.Source != request.Source || existing.TableId != request.TableId || existing.CustomerName != request.CustomerName || existing.CustomerPhone != request.CustomerPhone || existing.SpecialInstructions != request.SpecialInstructions || !JsonNode.DeepEquals(JsonNode.Parse(existing.DeliveryAddress ?? "null"), JsonNode.Parse(request.DeliveryAddressJson ?? "null")) || !sameItems) throw new InvalidOperationException("This order key was already used for a different request.");
                return await MapWithPaymentAsync(existing, existing.Table?.TableNumber);
            }
        }
        if (request.Source == OrderSources.DineInQr)
        {
            var tableCheck = request.TableId.HasValue ? await _db.Tables.FindAsync(request.TableId.Value) : null;
            if (tableCheck == null || tableCheck.RestaurantId != request.RestaurantId || tableCheck.Status == TableStatuses.OutOfService)
                throw new ArgumentException("A valid restaurant table is required for dine-in ordering.");
        }
        else if (request.TableId.HasValue) throw new ArgumentException("Only dine-in orders can be assigned a table.");
        if (request.Source == OrderSources.Delivery)
        {
            if (string.IsNullOrWhiteSpace(request.DeliveryAddressJson)) throw new ArgumentException("Delivery address is required.");
            using var address = JsonDocument.Parse(request.DeliveryAddressJson);
            if (address.RootElement.ValueKind != JsonValueKind.Object) throw new ArgumentException("Delivery address must be an object.");
            foreach (var field in new[] { "name", "mobile", "address", "pincode" })
                if (!address.RootElement.TryGetProperty(field, out var value) || value.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(value.GetString()))
                    throw new ArgumentException($"Delivery {field} is required.");
            if (!System.Text.RegularExpressions.Regex.IsMatch(address.RootElement.GetProperty("pincode").GetString()!, @"^\d{6}$")) throw new ArgumentException("Enter a valid 6-digit delivery pincode.");
        }
        if (request.Items == null || !request.Items.Any())
        {
            throw new ArgumentException("Order must contain at least one item.");
        }

        // 1. Verify item availability again at submission time (Section 15)
        var itemIds = request.Items.Select(i => i.MenuItemId).Distinct().ToList();
        var menuItems = await _db.MenuItems
            .Where(m => itemIds.Contains(m.MenuItemId) && m.RestaurantId == request.RestaurantId)
            .ToDictionaryAsync(m => m.MenuItemId);

        foreach (var itemReq in request.Items)
        {
            if (itemReq.Quantity < 1 || itemReq.Quantity > 50) throw new ArgumentException("Quantity must be between 1 and 50.");
            if (!menuItems.TryGetValue(itemReq.MenuItemId, out var item))
            {
                throw new InvalidOperationException($"Menu item {itemReq.MenuItemId} not found in this restaurant.");
            }
            if (!item.Availability)
            {
                throw new InvalidOperationException($"Sorry, '{item.Name}' is currently unavailable.");
            }
        }

        // 2. Compute pricing with price snapshots (Section 48)
        decimal subtotal = 0;
        var orderItems = new List<OrderItem>();

        foreach (var itemReq in request.Items)
        {
            var item = menuItems[itemReq.MenuItemId];
            var unitPrice = PriceWithCustomization(item, itemReq.CustomizationJson);
            var lineTotal = unitPrice * itemReq.Quantity;
            subtotal += lineTotal;

            orderItems.Add(new OrderItem
            {
                MenuItemId = item.MenuItemId,
                ItemNameSnapshot = item.Name,
                PriceSnapshot = unitPrice,
                Quantity = itemReq.Quantity,
                Customization = itemReq.CustomizationJson ?? "{}",
                SpecialInstruction = itemReq.SpecialInstruction,
                LineTotal = lineTotal,
                Course = string.IsNullOrWhiteSpace(itemReq.Course) ? "MAIN" : itemReq.Course.ToUpperInvariant(),
                Station = string.IsNullOrWhiteSpace(item.KitchenStation) ? "MAIN" : item.KitchenStation.ToUpperInvariant(),
                PreparationStatus = "PENDING"
            });
        }

        var tax = Math.Round(subtotal * _rules.TaxRate, 2);
        var deliveryFee = request.Source == OrderSources.Delivery ? _rules.StandardDeliveryFee : 0m;
        var total = subtotal + tax + deliveryFee;

        // Check for an active running dining session / previous orders on this table
        bool isAddOnOrder = false;
        Guid? existingSessionId = request.SessionId;
        var customerName = request.CustomerName;
        var customerPhone = request.CustomerPhone;
        if (request.Source == OrderSources.DineInQr && request.TableId.HasValue)
        {
            var activeSession = await _db.DiningSessions
                .Where(s => s.TableId == request.TableId.Value && s.Status == "ACTIVE")
                .OrderByDescending(s => s.CreatedAt)
                .FirstOrDefaultAsync();

            if (activeSession != null)
            {
                var existingActiveOrder = await _db.Orders
                    .Include(o => o.Table)
                    .Where(o => o.RestaurantId == request.RestaurantId
                             && o.TableId == request.TableId.Value
                             && o.SessionId == activeSession.SessionId
                             && o.Source == OrderSources.DineInQr
                             && o.Status != OrderStatuses.Cancelled
                             && o.Status != OrderStatuses.ConfirmationTimeout)
                    .OrderByDescending(o => o.CreatedAt)
                    .FirstOrDefaultAsync();

                if (existingActiveOrder != null)
                {
                    var paidSum = await _db.Payments
                        .Where(p => p.OrderId == existingActiveOrder.OrderId && p.Status == PaymentStatuses.Paid)
                        .SumAsync(p => (decimal?)(p.Amount - p.TipAmount)) ?? 0;

                    // Only treat as an add-on if the existing order in this session is unpaid or actively being prepared
                    if (paidSum < existingActiveOrder.Total - 0.05m || existingActiveOrder.Status != OrderStatuses.Delivered)
                    {
                        isAddOnOrder = true;
                        existingSessionId = activeSession.SessionId;
                        if (string.IsNullOrWhiteSpace(customerName))
                        {
                            customerName = existingActiveOrder.CustomerName;
                        }
                        if (string.IsNullOrWhiteSpace(customerPhone))
                        {
                            customerPhone = existingActiveOrder.CustomerPhone;
                        }
                    }
                }
            }
        }

        // 3. Generate unique order number (New Table Session)
        var orderNumber = "ORD-" + Guid.NewGuid().ToString("N")[..10].ToUpperInvariant();

        // Calculate dynamic prep time estimate
        var maxPrep = 15;
        if (menuItems.Values.Any()) maxPrep = menuItems.Values.Max(m => m.PrepTimeMinutes > 0 ? m.PrepTimeMinutes : 15);
        var activeKitchenTickets = await _db.Orders.CountAsync(o => o.RestaurantId == request.RestaurantId && (o.Status == OrderStatuses.New || o.Status == OrderStatuses.Preparing));
        var prepMinutes = maxPrep + Math.Min(30, activeKitchenTickets * 2);
        var readyAt = DateTime.UtcNow.AddMinutes(prepMinutes);

        // Associate with active shared dining session for dine-in orders
        Guid? activeSessionId = request.SessionId ?? existingSessionId;
        if (request.TableId.HasValue && request.Source == OrderSources.DineInQr && !activeSessionId.HasValue)
        {
            try
            {
                var currentSession = await _db.DiningSessions
                    .Where(s => s.TableId == request.TableId.Value && s.Status == "ACTIVE")
                    .OrderByDescending(s => s.CreatedAt)
                    .FirstOrDefaultAsync();

                if (currentSession == null)
                {
                    var tableForSession = await _db.Tables.FindAsync(request.TableId.Value);
                    currentSession = new DiningSession
                    {
                        RestaurantId = request.RestaurantId,
                        TableId = request.TableId.Value,
                        SessionCode = $"SES-{tableForSession?.TableNumber ?? 1}-{DateTime.UtcNow:MMddHHmm}",
                        Status = "ACTIVE",
                        CreatedAt = DateTime.UtcNow
                    };
                    _db.DiningSessions.Add(currentSession);
                    await _db.SaveChangesAsync();
                }
                activeSessionId = currentSession?.SessionId;
            }
            catch
            {
                // Gracefully detach and continue without session ID if dining_sessions table has any DB discrepancy
                _db.ChangeTracker.Clear();
                activeSessionId = null;
            }
        }

        var order = new Order
        {
            OrderNumber = orderNumber,
            RestaurantId = request.RestaurantId,
            CustomerId = request.CustomerId,
            TableId = request.TableId,
            SessionId = activeSessionId,
            Source = request.Source,
            Status = OrderStatuses.New,
            Subtotal = subtotal,
            Tax = tax,
            DeliveryFee = deliveryFee,
            Total = total,
            EstimatedPrepTimeMinutes = prepMinutes,
            EstimatedReadyAt = readyAt,
            DeliveryAddress = request.DeliveryAddressJson,
            CustomerName = customerName,
            CustomerPhone = customerPhone,
            IdempotencyKey = request.IdempotencyKey,
            TakeawayPickupTime = request.TakeawayPickupTime,
            SpecialInstructions = request.SpecialInstructions,
            Items = orderItems,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _db.Orders.Add(order);

        // If dine-in, update table status to OCCUPIED and set guest name
        if (request.TableId.HasValue)
        {
            var table = await _db.Tables.FindAsync(request.TableId.Value);
            if (table != null)
            {
                table.Status = TableStatuses.Occupied;
                if (!string.IsNullOrWhiteSpace(customerName))
                {
                    table.CurrentCustomerName = customerName;
                }
                table.UpdatedAt = DateTime.UtcNow;
            }
        }

        await _db.SaveChangesAsync();
        await transaction.CommitAsync();

        // 4. Trigger Real-Time Notification (Kitchen receives separate ticket for each order placed)
        var tableEntity = request.TableId.HasValue ? await _db.Tables.FindAsync(request.TableId.Value) : null;
        var tableNum = tableEntity?.TableNumber;

        await _notifications.NotifyRoleAsync(
            request.RestaurantId,
            UserRoles.Kitchen,
            "NEW_ORDER",
            isAddOnOrder && tableNum.HasValue ? $"New Add-on Ticket #{order.OrderNumber} (Table {tableNum})" : $"New Order #{order.OrderNumber}",
            tableNum.HasValue ? (isAddOnOrder ? $"Additional items ticket #{order.OrderNumber} for Table {tableNum} ({order.Items.Count} item(s)). Total: ₹{order.Total}" : $"New dine-in order #{order.OrderNumber} for Table {tableNum}. Total: ₹{order.Total}") : $"New {order.Source} order #{order.OrderNumber} received. Total: ₹{order.Total}",
            new { order.OrderId, order.OrderNumber, order.Source, TableNumber = tableNum, IsAddOn = isAddOnOrder }
        );

        await _notifications.NotifyRoleAsync(
            request.RestaurantId,
            UserRoles.Receptionist,
            "NEW_ORDER",
            isAddOnOrder && tableNum.HasValue ? $"Table {tableNum} Add-on Order #{order.OrderNumber}" : $"New Order #{order.OrderNumber}",
            tableNum.HasValue ? (isAddOnOrder ? $"New add-on order #{order.OrderNumber} placed for Table {tableNum}." : $"New dine-in order #{order.OrderNumber} for Table {tableNum}.") : $"New {order.Source} order #{order.OrderNumber}.",
            new { order.OrderId, order.OrderNumber, order.Source, TableNumber = tableNum, IsAddOn = isAddOnOrder }
        );

        if (!string.IsNullOrWhiteSpace(order.CustomerPhone))
        {
            await _sms.EnqueueEventSmsAsync(order.RestaurantId, "ORDER_CONFIRMED", order.CustomerPhone, new Dictionary<string, string>
            {
                ["orderNumber"] = order.OrderNumber,
                ["total"] = order.Total.ToString("F2")
            }, order.OrderId.ToString());
        }

        if (request.TableId.HasValue)
        {
            await _notifications.NotifyTableAsync(
                request.RestaurantId,
                request.TableId.Value,
                "NEW_ORDER",
                $"New Table Order #{order.OrderNumber}",
                $"A new order #{order.OrderNumber} was placed for this table.",
                new { order.OrderId, order.OrderNumber, order.Source, TableId = request.TableId.Value, TableNumber = tableNum }
            );
        }

        await _audit.LogAsync(
            order.RestaurantId,
            order.CustomerId,
            "CUSTOMER",
            "ORDER_CREATED",
            "orders",
            new { order.OrderId, order.OrderNumber, order.Total, order.Source, TableNumber = tableNum }
        );

        return await MapWithPaymentAsync(order, tableNum);
    }

    public async Task<OrderDto?> GetOrderByIdAsync(Guid orderId, Guid? requestingUserId, string userRole, Guid? requestingRestaurantId)
    {
        var order = await _db.Orders
            .Include(o => o.Items)
            .Include(o => o.Table)
            .FirstOrDefaultAsync(o => o.OrderId == orderId);

        if (order == null) return null;

        // Multi-tenant check
        if (requestingRestaurantId.HasValue && order.RestaurantId != requestingRestaurantId.Value)
        {
            return null; // Deny cross-tenant access
        }

        // Customer can only view own order
        if (userRole == UserRoles.Customer && requestingUserId.HasValue && order.CustomerId.HasValue && order.CustomerId.Value != requestingUserId.Value)
        {
            return null;
        }

                await ExpireConfirmationAsync(order);
        return await MapWithPaymentAsync(order, order.Table?.TableNumber);
    }

    public async Task<List<OrderDto>> GetOrdersAsync(Guid restaurantId, string? source, string? status, string? search)
    {
        var query = _db.Orders
            .Include(o => o.Items)
            .Include(o => o.Table)
            .Where(o => o.RestaurantId == restaurantId);

        if (!string.IsNullOrEmpty(source))
        {
            query = query.Where(o => o.Source == source);
        }

        if (!string.IsNullOrEmpty(status))
        {
            query = query.Where(o => o.Status == status);
        }

        if (!string.IsNullOrEmpty(search))
        {
            var s = search.ToLower();
            query = query.Where(o => o.OrderNumber.ToLower().Contains(s) ||
                                     (o.Table != null && o.Table.TableNumber.ToString().Contains(s)));
        }

        var orders = await query.OrderByDescending(o => o.CreatedAt).ToListAsync();
        var result = new List<OrderDto>();
        foreach (var order in orders) { await ExpireConfirmationAsync(order); result.Add(await MapWithPaymentAsync(order, order.Table?.TableNumber)); }
        return result;
    }

    public async Task<bool> UpdateOrderStatusAsync(Guid orderId, string newStatus, string? reason, string operatorRole)
    {
        await using var transaction = await _db.Database.BeginTransactionAsync();
        await _db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtext({orderId.ToString()}))");
        var order = await _db.Orders.Include(o => o.Table).FirstOrDefaultAsync(o => o.OrderId == orderId);
        if (order == null) return false;
        if (operatorRole == UserRoles.Waiter && newStatus is not (OrderStatuses.PendingConfirmation or OrderStatuses.OutForDelivery or OrderStatuses.Delivered or OrderStatuses.PickedUp))
            throw new UnauthorizedAccessException("Waiters can collect and serve ready orders only.");
        if (operatorRole == UserRoles.Kitchen && newStatus is not (OrderStatuses.Accepted or OrderStatuses.Preparing or OrderStatuses.Ready or OrderStatuses.ReadyForPickup or OrderStatuses.Cancelled))
            throw new UnauthorizedAccessException("Kitchen staff can manage preparation only.");
        if (newStatus == OrderStatuses.Cancelled && string.IsNullOrWhiteSpace(reason)) throw new ArgumentException("A rejection reason is required.");
        if (newStatus == OrderStatuses.Cancelled && await _db.Payments.AnyAsync(p => p.OrderId == orderId && p.Status == PaymentStatuses.Paid)) throw new InvalidOperationException("A collected payment must be refunded before this order can be cancelled.");
        // Validate state transitions
        if (!IsValidTransition(order.Status, newStatus, order.Source))
        {
            throw new InvalidOperationException($"Invalid status transition from {order.Status} to {newStatus} for {order.Source}.");
        }

        order.Status = newStatus;
        order.UpdatedAt = DateTime.UtcNow;

        if (newStatus == OrderStatuses.Cancelled)
        {
            order.CancellationReason = reason ?? "Cancelled by staff";
            order.CancelledBy = operatorRole;
        }
        else if (newStatus == OrderStatuses.Ready)
        {
            // Kitchen -> Waiter: TABLE NO 1 ORDER IS READY (Section 47)
            if (order.TableId.HasValue && order.Table != null)
            {
                await _notifications.NotifyRoleAsync(
                    order.RestaurantId,
                    UserRoles.Waiter,
                    "ORDER_READY",
                    $"Table {order.Table.TableNumber} Order is Ready",
                    $"TABLE NO {order.Table.TableNumber} ORDER IS READY (Order #{order.OrderNumber})",
                    new { order.OrderId, order.OrderNumber, TableNumber = order.Table.TableNumber }
                );
            }
        }
        else if (newStatus == OrderStatuses.PendingConfirmation)
        {
            order.ConfirmationRequestedAt = DateTime.UtcNow;
            if (order.TableId.HasValue)
            {
                await _notifications.NotifyTableAsync(
                    order.RestaurantId,
                    order.TableId.Value,
                    "ORDER_CONFIRMATION_PROMPT",
                    "Order Delivered",
                    "Have you received your complete order?",
                    new { order.OrderId, order.OrderNumber }
                );
            }
        }
        else if (newStatus == OrderStatuses.Delivered || newStatus == OrderStatuses.PickedUp)
        {
            await _notifications.NotifyRoleAsync(
                order.RestaurantId,
                UserRoles.Receptionist,
                "ORDER_STATUS_CHANGED",
                $"Order #{order.OrderNumber} Delivered",
                $"Order #{order.OrderNumber} has been delivered.",
                new { order.OrderId, order.OrderNumber, Status = newStatus, TableNumber = order.Table?.TableNumber }
            );

            if (order.TableId.HasValue)
            {
                await _notifications.NotifyTableAsync(
                    order.RestaurantId,
                    order.TableId.Value,
                    "ORDER_STATUS_CHANGED",
                    "Order Delivered",
                    $"Your order #{order.OrderNumber} has been served.",
                    new { order.OrderId, order.OrderNumber, Status = newStatus }
                );
            }
        }

        await _db.SaveChangesAsync();
        await transaction.CommitAsync();

        if (order.TableId.HasValue)
        {
            await _notifications.NotifyTableAsync(
                order.RestaurantId,
                order.TableId.Value,
                "ORDER_STATUS_CHANGED",
                $"Table Order Status: {newStatus}",
                $"Order #{order.OrderNumber} status changed to {newStatus}.",
                new { order.OrderId, order.OrderNumber, TableId = order.TableId.Value, Status = newStatus }
            );
        }

        if (!string.IsNullOrWhiteSpace(order.CustomerPhone) && newStatus is (OrderStatuses.Ready or OrderStatuses.ReadyForPickup or OrderStatuses.OutForDelivery or OrderStatuses.Cancelled))
        {
            var evt = newStatus switch
            {
                OrderStatuses.ReadyForPickup => "ORDER_READY_FOR_PICKUP",
                OrderStatuses.Ready => "ORDER_READY",
                OrderStatuses.OutForDelivery => "ORDER_OUT_FOR_DELIVERY",
                OrderStatuses.Cancelled => "ORDER_CANCELLED",
                _ => null
            };
            if (evt != null)
            {
                await _sms.EnqueueEventSmsAsync(order.RestaurantId, evt, order.CustomerPhone, new Dictionary<string, string>
                {
                    ["orderNumber"] = order.OrderNumber,
                    ["reason"] = order.CancellationReason ?? "Cancelled by restaurant"
                }, $"{order.OrderId}:{newStatus}");
            }
        }

        await _audit.LogAsync(
            order.RestaurantId,
            null,
            operatorRole,
            $"ORDER_STATUS_{newStatus}",
            "orders",
            new { order.OrderId, order.OrderNumber, newStatus, reason }
        );

        return true;
    }

    public async Task<(bool Success, string Message)> CancelOrderAsync(Guid orderId, Guid? userId, string userRole, string? reason)
    {
        await using var transaction = await _db.Database.BeginTransactionAsync();
        await _db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtext({orderId.ToString()}))");
        var order = await _db.Orders.FindAsync(orderId);
        if (order == null) return (false, "Order not found.");

        if (order.Status is OrderStatuses.Delivered or OrderStatuses.Cancelled or OrderStatuses.PickedUp) return (false, "Completed orders cannot be cancelled.");
        if (userRole == UserRoles.Customer && order.CustomerId.HasValue && userId.HasValue && order.CustomerId != userId) return (false, "This order belongs to another customer.");
        if (await _db.Payments.AnyAsync(p => p.OrderId == orderId && p.Status == PaymentStatuses.Paid)) return (false, "A collected payment must be refunded before cancellation.");
        // Strict 1-Minute Rule for Customer Cancellation (Section 5)
        if (userRole == UserRoles.Customer)
        {
            if (order.Status != OrderStatuses.New)
            {
                return (false, "Order has already been processed by the kitchen and cannot be cancelled.");
            }

            var elapsedSeconds = (DateTime.UtcNow - order.CreatedAt).TotalSeconds;
            if (elapsedSeconds >= _rules.OrderCancellationLimitSeconds)
            {
                return (false, $"Cancellation limit exceeded ({Math.Round(elapsedSeconds)}s). Orders can only be cancelled within 1 minute of creation.");
            }
        }

        order.Status = OrderStatuses.Cancelled;
        order.CancellationReason = reason ?? "Cancelled by customer";
        order.CancelledBy = userRole;
        order.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        await transaction.CommitAsync();

        if (order.TableId.HasValue)
        {
            await _notifications.NotifyTableAsync(
                order.RestaurantId,
                order.TableId.Value,
                "ORDER_STATUS_CHANGED",
                "Table Order Status: CANCELLED",
                $"Order #{order.OrderNumber} status changed to CANCELLED.",
                new { order.OrderId, order.OrderNumber, TableId = order.TableId.Value, Status = OrderStatuses.Cancelled }
            );
        }

        await _notifications.NotifyRoleAsync(
            order.RestaurantId,
            UserRoles.Kitchen,
            "ORDER_CANCELLED",
            $"Order #{order.OrderNumber} Cancelled",
            $"Order #{order.OrderNumber} was cancelled ({order.CancellationReason}).",
            new { order.OrderId, order.OrderNumber }
        );

        await _audit.LogAsync(
            order.RestaurantId,
            userId,
            userRole,
            "ORDER_CANCELLED",
            "orders",
            new { order.OrderId, order.OrderNumber, ElapsedSeconds = (DateTime.UtcNow - order.CreatedAt).TotalSeconds }
        );

        return (true, "Order cancelled successfully.");
    }

    public async Task<bool> DeleteOrderAsync(string idOrNumber)
    {
        Order? order = null;
        if (Guid.TryParse(idOrNumber, out var orderId))
        {
            order = await _db.Orders.FindAsync(orderId);
        }
        if (order == null)
        {
            var normalized = idOrNumber.Trim().ToUpperInvariant();
            order = await _db.Orders.FirstOrDefaultAsync(o => o.OrderNumber.ToUpper() == normalized);
        }
        if (order == null) return false;

        var items = await _db.OrderItems.Where(i => i.OrderId == order.OrderId).ToListAsync();
        _db.OrderItems.RemoveRange(items);

        var payments = await _db.Payments.Where(p => p.OrderId == order.OrderId).ToListAsync();
        _db.Payments.RemoveRange(payments);

        var issues = await _db.CustomerIssues.Where(i => i.OrderId == order.OrderId).ToListAsync();
        _db.CustomerIssues.RemoveRange(issues);

        _db.Orders.Remove(order);
        await _db.SaveChangesAsync();

        await _notifications.NotifyRoleAsync(
            order.RestaurantId,
            UserRoles.Kitchen,
            "ORDER_DELETED",
            $"Order #{order.OrderNumber} Removed",
            $"Order #{order.OrderNumber} was removed from the system.",
            new { order.OrderId, order.OrderNumber }
        );

        return true;
    }

    public async Task<bool> ConfirmCustomerOrderReceiptAsync(Guid orderId, bool confirmed)
    {
        await using var transaction = await _db.Database.BeginTransactionAsync();
        await _db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtext({orderId.ToString()}))");
        var order = await _db.Orders
            .Include(o => o.Table)
            .FirstOrDefaultAsync(o => o.OrderId == orderId);

        if (order == null) return false;

        await ExpireConfirmationAsync(order);
        if (order.Status != OrderStatuses.PendingConfirmation) throw new InvalidOperationException("Only a served order awaiting confirmation can be confirmed.");
        if (confirmed)
        {
            // Section 8: YES -> PENDING_CONFIRMATION -> DELIVERED
            order.Status = OrderStatuses.Delivered;
            order.CustomerConfirmedAt = DateTime.UtcNow;
            order.UpdatedAt = DateTime.UtcNow;
        }
        else
        {
            // Section 8: NO -> Receptionist receives: TABLE 1 CUSTOMER HAS NOT RECEIVED ORDER #1001
            var tblNum = order.Table?.TableNumber ?? 0;
            var alertMsg = $"TABLE {tblNum} CUSTOMER HAS NOT RECEIVED ORDER #{order.OrderNumber}";

            await _notifications.NotifyRoleAsync(
                order.RestaurantId,
                UserRoles.Receptionist,
                "ORDER_ISSUE_NOT_RECEIVED",
                "Customer Order Delivery Issue",
                alertMsg,
                new { order.OrderId, order.OrderNumber, TableNumber = tblNum }
            );

            // Record as customer issue for investigation
            _db.CustomerIssues.Add(new CustomerIssue
            {
                RestaurantId = order.RestaurantId,
                OrderId = order.OrderId,
                TableId = order.TableId,
                Description = alertMsg,
                Status = "PENDING",
                CreatedAt = DateTime.UtcNow
            });
        }

        await _db.SaveChangesAsync();
        await transaction.CommitAsync();

        if (order.TableId.HasValue)
        {
            if (confirmed)
            {
                await _notifications.NotifyTableAsync(
                    order.RestaurantId,
                    order.TableId.Value,
                    "ORDER_STATUS_CHANGED",
                    "Table Order Status: DELIVERED",
                    $"Order #{order.OrderNumber} status changed to DELIVERED.",
                    new { order.OrderId, order.OrderNumber, TableId = order.TableId.Value, Status = OrderStatuses.Delivered }
                );
            }
            else
            {
                await _notifications.NotifyTableAsync(
                    order.RestaurantId,
                    order.TableId.Value,
                    "ORDER_ISSUE_REPORTED",
                    "Delivery Issue Reported",
                    $"We notified reception regarding Order #{order.OrderNumber}.",
                    new { order.OrderId, order.OrderNumber, TableId = order.TableId.Value, Status = order.Status }
                );
            }
        }
        return true;
    }

    private static decimal PriceWithCustomization(MenuItem item, string? customizationJson)
    {
        var price = item.Price;
        if (string.IsNullOrWhiteSpace(customizationJson)) return price;

        try
        {
            using var selected = JsonDocument.Parse(customizationJson);
            if (selected.RootElement.ValueKind != JsonValueKind.Object) return price;

            // 1. Authoritative portion price resolution from database catalog (Section Phase 1.5)
            if (selected.RootElement.TryGetProperty("portion", out var portionElem))
            {
                string? targetPortionName = null;
                if (portionElem.ValueKind == JsonValueKind.Object && portionElem.TryGetProperty("name", out var pName))
                {
                    targetPortionName = pName.GetString();
                }
                else if (portionElem.ValueKind == JsonValueKind.String)
                {
                    targetPortionName = portionElem.GetString();
                }

                if (!string.IsNullOrWhiteSpace(targetPortionName) && !string.IsNullOrWhiteSpace(item.Portions))
                {
                    try
                    {
                        using var portionsDoc = JsonDocument.Parse(item.Portions);
                        if (portionsDoc.RootElement.ValueKind == JsonValueKind.Array)
                        {
                            var matched = portionsDoc.RootElement.EnumerateArray()
                                .FirstOrDefault(p => p.TryGetProperty("name", out var pn) && string.Equals(pn.GetString(), targetPortionName, StringComparison.OrdinalIgnoreCase));
                            if (matched.ValueKind != JsonValueKind.Undefined && matched.TryGetProperty("price", out var mp) && mp.TryGetDecimal(out var catalogPrice))
                            {
                                price = catalogPrice;
                            }
                        }
                    }
                    catch { }
                }
            }

            // 2. Add-Ons additions
            if (selected.RootElement.TryGetProperty("addOns", out var requested) && requested.ValueKind == JsonValueKind.Array)
            {
                if (!string.IsNullOrWhiteSpace(item.AddOns))
                {
                    try
                    {
                        using var addOns = JsonDocument.Parse(item.AddOns);
                        if (addOns.RootElement.ValueKind == JsonValueKind.Array)
                        {
                            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                            foreach (var addOn in requested.EnumerateArray())
                            {
                                var name = addOn.ValueKind == JsonValueKind.String ? addOn.GetString() ?? "" : "";
                                if (!string.IsNullOrEmpty(name) && seen.Add(name))
                                {
                                    var catalog = addOns.RootElement.EnumerateArray()
                                        .FirstOrDefault(x => x.TryGetProperty("name", out var n) && string.Equals(n.GetString(), name, StringComparison.OrdinalIgnoreCase));
                                    if (catalog.ValueKind != JsonValueKind.Undefined && catalog.TryGetProperty("price", out var ap))
                                    {
                                        price += ap.GetDecimal();
                                    }
                                }
                            }
                        }
                    }
                    catch { }
                }
            }

            // 3. Customization Options (exclude portion, addOns, specialInstructions, notes)
            var optRaw = string.IsNullOrWhiteSpace(item.CustomizationOptions) ? "[]" : item.CustomizationOptions;
            try
            {
                using var options = JsonDocument.Parse(optRaw);
                if (options.RootElement.ValueKind == JsonValueKind.Array)
                {
                    foreach (var choice in selected.RootElement.EnumerateObject().Where(x =>
                        !string.Equals(x.Name, "addOns", StringComparison.OrdinalIgnoreCase) &&
                        !string.Equals(x.Name, "portion", StringComparison.OrdinalIgnoreCase) &&
                        !string.Equals(x.Name, "specialInstruction", StringComparison.OrdinalIgnoreCase) &&
                        !string.Equals(x.Name, "specialInstructions", StringComparison.OrdinalIgnoreCase) &&
                        !string.Equals(x.Name, "notes", StringComparison.OrdinalIgnoreCase)))
                    {
                        var option = options.RootElement.EnumerateArray()
                            .FirstOrDefault(x => x.TryGetProperty("name", out var n) && string.Equals(n.GetString(), choice.Name, StringComparison.OrdinalIgnoreCase));

                        if (option.ValueKind == JsonValueKind.Undefined) continue; // Skip non-option keys gracefully
                        if (choice.Value.ValueKind != JsonValueKind.String) continue;

                        var text = choice.Value.GetString()!;
                        if (option.TryGetProperty("choices", out var choicesProp) && choicesProp.ValueKind == JsonValueKind.Array)
                        {
                            var matchChoice = choicesProp.EnumerateArray()
                                .FirstOrDefault(x => string.Equals(x.GetString(), text, StringComparison.OrdinalIgnoreCase));
                            if (matchChoice.ValueKind != JsonValueKind.Undefined)
                            {
                                var charge = System.Text.RegularExpressions.Regex.Match(text, @"\(\+₹?(\d+(?:\.\d+)?)\)");
                                if (charge.Success) price += decimal.Parse(charge.Groups[1].Value, System.Globalization.CultureInfo.InvariantCulture);
                            }
                        }
                    }
                }
            }
            catch { }
        }
        catch
        {
            return item.Price;
        }

        return price;
    }

    private async Task ExpireConfirmationAsync(Order order)
    {
        if (order.Status == OrderStatuses.PendingConfirmation && order.ConfirmationRequestedAt.HasValue &&
            DateTime.UtcNow >= order.ConfirmationRequestedAt.Value.AddMinutes(_rules.OrderConfirmationTimeoutMinutes))
        {
            order.Status = OrderStatuses.ConfirmationTimeout; order.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
        }
    }
    private async Task<OrderDto> MapWithPaymentAsync(Order order, int? tableNumber)
    {
        var paid = await _db.Payments.Where(p => p.OrderId == order.OrderId && p.Status == PaymentStatuses.Paid).SumAsync(p => (decimal?)(p.Amount - p.TipAmount)) ?? 0;
        var principal = _http.HttpContext?.User;
        var staff = principal?.Identity?.IsAuthenticated == true && !principal.IsInRole(UserRoles.Customer);
        return MapToDto(order, tableNumber) with { AccessToken = staff ? null : _tokens.Create("order", order.OrderId), PaidAmount = Math.Max(0, paid),
            PaymentStatus = paid >= order.Total - 0.05m ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID",
            CustomerName=order.CustomerName, CustomerPhone=order.CustomerPhone, DeliveryAddressJson=order.DeliveryAddress,
            TakeawayPickupTime=order.TakeawayPickupTime, ConfirmationRequestedAt=order.ConfirmationRequestedAt };
    }

    private static bool IsValidTransition(string current, string next, string source)
    {
        if (current == OrderStatuses.New && next == OrderStatuses.Cancelled) return true;

        return source switch
        {
            OrderSources.DineInQr => (current == OrderStatuses.New && next == OrderStatuses.Accepted) ||
                                     (current == OrderStatuses.Accepted && next == OrderStatuses.Preparing) ||
                                     (current == OrderStatuses.New && next == OrderStatuses.Preparing) ||
                                     (current == OrderStatuses.Preparing && next == OrderStatuses.Ready) ||
                                     (current == OrderStatuses.Ready && next == OrderStatuses.PendingConfirmation) ||
                                     (current == OrderStatuses.PendingConfirmation && next == OrderStatuses.Delivered) ||
                                     (current == OrderStatuses.PendingConfirmation && next == OrderStatuses.ConfirmationTimeout) ||
                                     ((current is OrderStatuses.Ready or OrderStatuses.Preparing or OrderStatuses.Accepted or OrderStatuses.New) && next == OrderStatuses.Delivered),

            OrderSources.Delivery => (current == OrderStatuses.New && next == OrderStatuses.Accepted) ||
                                     (current == OrderStatuses.Accepted && next == OrderStatuses.Preparing) ||
                                     (current == OrderStatuses.New && next == OrderStatuses.Preparing) ||
                                     (current == OrderStatuses.Preparing && next == OrderStatuses.Ready) ||
                                     (current == OrderStatuses.Ready && next == OrderStatuses.OutForDelivery) ||
                                     (current == OrderStatuses.OutForDelivery && next == OrderStatuses.Delivered) ||
                                     ((current is OrderStatuses.Ready or OrderStatuses.Preparing or OrderStatuses.Accepted or OrderStatuses.New) && next == OrderStatuses.Delivered),

            OrderSources.Takeaway => (current == OrderStatuses.New && next == OrderStatuses.Accepted) ||
                                     (current == OrderStatuses.Accepted && next == OrderStatuses.Preparing) ||
                                     (current == OrderStatuses.New && next == OrderStatuses.Preparing) ||
                                     (current == OrderStatuses.Preparing && next == OrderStatuses.ReadyForPickup) ||
                                     (current == OrderStatuses.ReadyForPickup && next == OrderStatuses.PickedUp) ||
                                     ((current is OrderStatuses.Ready or OrderStatuses.ReadyForPickup or OrderStatuses.Preparing or OrderStatuses.Accepted or OrderStatuses.New) && (next == OrderStatuses.PickedUp || next == OrderStatuses.Delivered)),

            _ => false
        };
    }

    private static OrderDto MapToDto(Order o, int? tableNumber) =>
        new(
            o.OrderId,
            o.OrderNumber,
            o.RestaurantId,
            o.CustomerId,
            o.TableId,
            tableNumber,
            o.Source,
            o.Status,
            o.Subtotal,
            o.Tax,
            o.Discount,
            o.DeliveryFee,
            o.Total,
            o.SpecialInstructions,
            o.RejectionReason,
            o.CancellationReason,
            o.CancelledBy,
            o.CreatedAt,
            o.Items.Select(i => new OrderItemDto(
                i.OrderItemId,
                i.MenuItemId,
                i.ItemNameSnapshot,
                i.PriceSnapshot,
                i.Quantity,
                i.LineTotal,
                i.Customization,
                i.SpecialInstruction,
                i.Course ?? "MAIN",
                i.Station ?? "MAIN",
                i.PreparationStatus ?? "PENDING"
            )).ToList(),
            EstimatedPrepTimeMinutes: o.EstimatedPrepTimeMinutes,
            EstimatedReadyAt: o.EstimatedReadyAt,
            SessionId: o.SessionId
        );

    public async Task<bool> UpdateOrderItemStatusAsync(Guid orderItemId, string status)
    {
        var item = await _db.OrderItems.Include(i => i.Order).FirstOrDefaultAsync(i => i.OrderItemId == orderItemId);
        if (item == null) return false;

        var normalizedStatus = status.ToUpperInvariant();
        item.PreparationStatus = normalizedStatus;
        if (normalizedStatus == "READY")
        {
            item.PreparedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();

        var order = item.Order;
        if (order != null)
        {
            var courseItems = await _db.OrderItems
                .Where(i => i.OrderId == order.OrderId && i.Course == item.Course)
                .ToListAsync();

            bool allCourseReady = courseItems.All(i => i.PreparationStatus == "READY" || i.PreparationStatus == "SERVED");
            if (allCourseReady)
            {
                var table = order.TableId.HasValue ? await _db.Tables.FindAsync(order.TableId.Value) : null;
                var tableNum = table?.TableNumber;

                await _notifications.NotifyRoleAsync(
                    order.RestaurantId,
                    UserRoles.Waiter,
                    "COURSE_READY",
                    $"Course Ready: Table A{tableNum}",
                    $"All items for course '{item.Course}' in Order #{order.OrderNumber} (Table A{tableNum}) are ready to be served!",
                    new { order.OrderId, order.OrderNumber, TableNumber = tableNum, Course = item.Course }
                );
            }

            var allItems = await _db.OrderItems.Where(i => i.OrderId == order.OrderId).ToListAsync();
            if (allItems.All(i => i.PreparationStatus == "READY" || i.PreparationStatus == "SERVED"))
            {
                if (order.Status == OrderStatuses.Preparing || order.Status == OrderStatuses.New || order.Status == OrderStatuses.Accepted)
                {
                    order.Status = OrderStatuses.Ready;
                    order.UpdatedAt = DateTime.UtcNow;
                    await _db.SaveChangesAsync();

                    await _notifications.NotifyRoleAsync(
                        order.RestaurantId,
                        UserRoles.Waiter,
                        "ORDER_READY",
                        $"Order #{order.OrderNumber} Ready",
                        $"All items for Order #{order.OrderNumber} are ready.",
                        new { order.OrderId, order.OrderNumber }
                    );
                }
            }
        }

        return true;
    }

    public async Task<List<TimeBudgetMenuDto>> GetTimeBudgetMenuAsync(Guid restaurantId, int maxMinutes)
    {
        var items = await _db.MenuItems.Include(m => m.Category)
            .Where(m => m.RestaurantId == restaurantId && m.Availability)
            .ToListAsync();

        var activeQueuedItems = await _db.OrderItems
            .Where(oi => oi.Order.RestaurantId == restaurantId && (oi.PreparationStatus == "PENDING" || oi.PreparationStatus == "PREPARING"))
            .ToListAsync();

        var stationQueues = activeQueuedItems
            .GroupBy(oi => string.IsNullOrWhiteSpace(oi.Station) ? "MAIN" : oi.Station.ToUpperInvariant())
            .ToDictionary(g => g.Key, g => g.Count());

        var result = new List<TimeBudgetMenuDto>();

        foreach (var item in items)
        {
            var station = string.IsNullOrWhiteSpace(item.KitchenStation) ? "MAIN" : item.KitchenStation.ToUpperInvariant();
            var queueCount = stationQueues.GetValueOrDefault(station, 0);

            var basePrep = item.PrepTimeMinutes > 0 ? item.PrepTimeMinutes : 15;
            var queueLag = Math.Min(20, queueCount * 2);
            var totalEst = basePrep + queueLag;

            var minEst = Math.Max(5, totalEst - 3);
            var maxEst = totalEst + 4;

            if (maxEst <= maxMinutes || (maxMinutes >= 20 && totalEst <= maxMinutes))
            {
                result.Add(new TimeBudgetMenuDto(
                    item.MenuItemId,
                    item.Name,
                    item.Description,
                    item.Price,
                    item.Category?.Name ?? "Main",
                    basePrep,
                    totalEst,
                    minEst,
                    maxEst,
                    station,
                    item.Image,
                    item.VegNonVeg
                ));
            }
        }

        return result.OrderBy(r => r.EstimatedTotalPrepMinutes).ThenBy(r => r.Price).ToList();
    }

    public async Task<List<PortionAvailabilityDto>> GetPortionsRemainingAsync(Guid restaurantId)
    {
        var items = await _db.MenuItems
            .Where(m => m.RestaurantId == restaurantId)
            .ToListAsync();

        var inventory = await _db.InventoryItems
            .Where(i => i.RestaurantId == restaurantId)
            .ToListAsync();

        var activeOrderItems = await _db.OrderItems
            .Where(oi => oi.Order.RestaurantId == restaurantId && (oi.Order.Status == OrderStatuses.New || oi.Order.Status == OrderStatuses.Accepted || oi.Order.Status == OrderStatuses.Preparing))
            .ToListAsync();

        var reservedCount = activeOrderItems
            .GroupBy(oi => oi.MenuItemId)
            .ToDictionary(g => g.Key, g => g.Sum(x => x.Quantity));

        var result = new List<PortionAvailabilityDto>();

        foreach (var item in items)
        {
            int maxPortions = 50;

            if (!string.IsNullOrWhiteSpace(item.Recipe) && item.Recipe != "[]")
            {
                try
                {
                    using var doc = JsonDocument.Parse(item.Recipe);
                    if (doc.RootElement.ValueKind == JsonValueKind.Array)
                    {
                        int limitingFactor = 999;
                        foreach (var el in doc.RootElement.EnumerateArray())
                        {
                            var ingName = el.TryGetProperty("name", out var np) ? np.GetString() : null;
                            var qty = el.TryGetProperty("quantity", out var qp) ? qp.GetDecimal() : 0m;
                            if (!string.IsNullOrWhiteSpace(ingName) && qty > 0)
                            {
                                var stockItem = inventory.FirstOrDefault(i => 
                                    string.Equals(i.Name, ingName, StringComparison.OrdinalIgnoreCase));
                                if (stockItem != null)
                                {
                                    var possible = (int)Math.Floor(stockItem.CurrentStock / qty);
                                    if (possible < limitingFactor) limitingFactor = possible;
                                }
                            }
                        }
                        if (limitingFactor < 999) maxPortions = Math.Max(0, limitingFactor);
                    }
                }
                catch { }
            }

            var reserved = reservedCount.GetValueOrDefault(item.MenuItemId, 0);
            var remaining = Math.Max(0, maxPortions - reserved);

            if (!item.Availability) remaining = 0;

            var status = remaining <= 0 ? "SOLD_OUT" : (remaining <= 5 ? "LOW_STOCK" : "AVAILABLE");

            result.Add(new PortionAvailabilityDto(
                item.MenuItemId,
                item.Name,
                remaining,
                remaining > 0,
                status
            ));
        }

        return result;
    }
}
