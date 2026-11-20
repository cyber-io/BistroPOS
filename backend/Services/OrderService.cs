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

    public OrderService(
        RestaurantDbContext db,
        IOptions<BusinessRulesOptions> rules,
        INotificationService notifications,
        IAuditLogService audit, ResourceTokens tokens, IHttpContextAccessor http)
    {
        _db = db;
        _rules = rules.Value;
        _notifications = notifications;
        _audit = audit;
        _tokens = tokens;
        _http = http;
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
            var table = request.TableId.HasValue ? await _db.Tables.FindAsync(request.TableId.Value) : null;
            if (table == null || table.RestaurantId != request.RestaurantId || table.Status == TableStatuses.OutOfService)
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
                LineTotal = lineTotal
            });
        }

        var tax = Math.Round(subtotal * _rules.TaxRate, 2);
        var deliveryFee = request.Source == OrderSources.Delivery ? _rules.StandardDeliveryFee : 0m;
        var total = subtotal + tax + deliveryFee;

        // Check for an active unpaid dine-in order on this table (running table session)
        Order? existingActiveOrder = null;
        if (request.Source == OrderSources.DineInQr && request.TableId.HasValue)
        {
            var candidates = await _db.Orders
                .Include(o => o.Items)
                .Include(o => o.Table)
                .Where(o => o.RestaurantId == request.RestaurantId
                         && o.TableId == request.TableId.Value
                         && o.Source == OrderSources.DineInQr
                         && o.Status != OrderStatuses.Cancelled
                         && o.Status != OrderStatuses.ConfirmationTimeout)
                .OrderByDescending(o => o.CreatedAt)
                .ToListAsync();

            foreach (var cand in candidates)
            {
                var paidSum = await _db.Payments
                    .Where(p => p.OrderId == cand.OrderId && p.Status == PaymentStatuses.Paid)
                    .SumAsync(p => (decimal?)p.Amount) ?? 0;

                if (paidSum < cand.Total - 0.05m)
                {
                    existingActiveOrder = cand;
                    break;
                }
            }
        }

        if (existingActiveOrder != null)
        {
            // Append new items to the existing running order for this table
            foreach (var item in orderItems)
            {
                item.OrderId = existingActiveOrder.OrderId;
                _db.OrderItems.Add(item);
                existingActiveOrder.Items.Add(item);
            }

            existingActiveOrder.Subtotal += subtotal;
            existingActiveOrder.Tax = Math.Round(existingActiveOrder.Subtotal * _rules.TaxRate, 2);
            existingActiveOrder.Total = existingActiveOrder.Subtotal + existingActiveOrder.Tax + existingActiveOrder.DeliveryFee;

            if (!string.IsNullOrWhiteSpace(request.CustomerName))
            {
                existingActiveOrder.CustomerName = request.CustomerName;
            }
            if (!string.IsNullOrWhiteSpace(request.CustomerPhone))
            {
                existingActiveOrder.CustomerPhone = request.CustomerPhone;
            }
            if (!string.IsNullOrWhiteSpace(request.SpecialInstructions))
            {
                existingActiveOrder.SpecialInstructions = string.IsNullOrWhiteSpace(existingActiveOrder.SpecialInstructions)
                    ? request.SpecialInstructions
                    : $"{existingActiveOrder.SpecialInstructions} | Extra note: {request.SpecialInstructions}";
            }

            // Reset status so Kitchen receives and prepares the new items
            existingActiveOrder.Status = OrderStatuses.New;
            existingActiveOrder.UpdatedAt = DateTime.UtcNow;

            var tableToUpdate = request.TableId.HasValue ? await _db.Tables.FindAsync(request.TableId.Value) : null;
            if (tableToUpdate != null)
            {
                tableToUpdate.Status = TableStatuses.Occupied;
                if (!string.IsNullOrWhiteSpace(existingActiveOrder.CustomerName))
                {
                    tableToUpdate.CurrentCustomerName = existingActiveOrder.CustomerName;
                }
                tableToUpdate.UpdatedAt = DateTime.UtcNow;
            }

            await _db.SaveChangesAsync();
            await transaction.CommitAsync();

            var activeTableNum = tableToUpdate?.TableNumber;

            // Trigger notification to kitchen and receptionist
            await _notifications.NotifyRoleAsync(
                request.RestaurantId,
                UserRoles.Kitchen,
                "ORDER_UPDATED",
                $"Additional Items for Table #{activeTableNum}",
                $"New items added to Order #{existingActiveOrder.OrderNumber}. Total: ₹{existingActiveOrder.Total}",
                new { existingActiveOrder.OrderId, existingActiveOrder.OrderNumber, existingActiveOrder.Source, TableNumber = activeTableNum }
            );

            await _notifications.NotifyRoleAsync(
                request.RestaurantId,
                UserRoles.Receptionist,
                "ORDER_UPDATED",
                $"Table #{activeTableNum} Order Updated",
                $"New items added to Order #{existingActiveOrder.OrderNumber}.",
                new { existingActiveOrder.OrderId, existingActiveOrder.OrderNumber, existingActiveOrder.Source, TableNumber = activeTableNum }
            );

            await _audit.LogAsync(
                existingActiveOrder.RestaurantId,
                existingActiveOrder.CustomerId,
                "CUSTOMER",
                "ORDER_ITEMS_ADDED",
                "orders",
                new { existingActiveOrder.OrderId, existingActiveOrder.OrderNumber, existingActiveOrder.Total, existingActiveOrder.Source }
            );

            return await MapWithPaymentAsync(existingActiveOrder, activeTableNum);
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
        Guid? activeSessionId = request.SessionId;
        if (request.TableId.HasValue && request.Source == OrderSources.DineInQr && !activeSessionId.HasValue)
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
            activeSessionId = currentSession.SessionId;
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
            CustomerName = request.CustomerName,
            CustomerPhone = request.CustomerPhone,
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
                if (!string.IsNullOrWhiteSpace(request.CustomerName))
                {
                    table.CurrentCustomerName = request.CustomerName;
                }
                table.UpdatedAt = DateTime.UtcNow;
            }
        }

        await _db.SaveChangesAsync();

        await transaction.CommitAsync();
        // 4. Trigger Real-Time Notification (Website -> Kitchen: NEW ONLINE ORDER / Customer -> Kitchen)
        var tableEntity = request.TableId.HasValue ? await _db.Tables.FindAsync(request.TableId.Value) : null;
        var tableNum = tableEntity?.TableNumber;

        await _notifications.NotifyRoleAsync(
            request.RestaurantId,
            UserRoles.Kitchen,
            "NEW_ORDER",
            $"New Order #{order.OrderNumber}",
            $"New {order.Source} order #{order.OrderNumber} received. Total: ₹{order.Total}",
            new { order.OrderId, order.OrderNumber, order.Source, TableNumber = tableNum }
        );

        await _notifications.NotifyRoleAsync(
            request.RestaurantId,
            UserRoles.Receptionist,
            "NEW_ORDER",
            $"New Order #{order.OrderNumber}",
            $"New {order.Source} order #{order.OrderNumber} received. Sent to kitchen.",
            new { order.OrderId, order.OrderNumber, order.Source, TableNumber = tableNum }
        );

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
            new { order.OrderId, order.OrderNumber, order.Total, order.Source }
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
            await _notifications.NotifyTableAsync(
                order.RestaurantId,
                order.TableId.Value,
                "ORDER_STATUS_CHANGED",
                "Table Order Status: DELIVERED",
                $"Order #{order.OrderNumber} status changed to DELIVERED.",
                new { order.OrderId, order.OrderNumber, TableId = order.TableId.Value, Status = OrderStatuses.Delivered }
            );
        }
        return true;
    }

    private static decimal PriceWithCustomization(MenuItem item, string? customizationJson)
    {
        var price = item.Price;
        if (string.IsNullOrWhiteSpace(customizationJson)) return price;
        using var selected = JsonDocument.Parse(customizationJson);
        if (selected.RootElement.ValueKind != JsonValueKind.Object) throw new ArgumentException("Customizations must be an object.");
        using var addOns = JsonDocument.Parse(item.AddOns);
        if (selected.RootElement.TryGetProperty("addOns", out var requested))
        {
            if (requested.ValueKind != JsonValueKind.Array) throw new ArgumentException("Add-ons must be a list.");
            var seen = new HashSet<string>();
            foreach (var addOn in requested.EnumerateArray())
            {
                var name = addOn.GetString() ?? "";
                if (!seen.Add(name)) throw new ArgumentException("Duplicate add-on selected.");
                var catalog = addOns.RootElement.EnumerateArray().FirstOrDefault(x => x.GetProperty("name").GetString() == name);
                if (catalog.ValueKind == JsonValueKind.Undefined) throw new ArgumentException("Unknown add-on selected.");
                price += catalog.GetProperty("price").GetDecimal();
            }
        }
        using var options = JsonDocument.Parse(item.CustomizationOptions);
        foreach (var choice in selected.RootElement.EnumerateObject().Where(x => x.Name != "addOns"))
        {
            var option = options.RootElement.EnumerateArray().FirstOrDefault(x => x.GetProperty("name").GetString() == choice.Name);
            if (option.ValueKind == JsonValueKind.Undefined || choice.Value.ValueKind != JsonValueKind.String) throw new ArgumentException("Unknown customization selected.");
            var text = choice.Value.GetString()!;
            if (!option.GetProperty("choices").EnumerateArray().Any(x => x.GetString() == text)) throw new ArgumentException("Unknown customization choice.");
            var charge = System.Text.RegularExpressions.Regex.Match(text, @"\(\+₹?(\d+(?:\.\d+)?)\)");
            if (charge.Success) price += decimal.Parse(charge.Groups[1].Value, System.Globalization.CultureInfo.InvariantCulture);
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
        var paid = await _db.Payments.Where(p => p.OrderId == order.OrderId && p.Status == PaymentStatuses.Paid).SumAsync(p => (decimal?)p.Amount) ?? 0;
        var principal = _http.HttpContext?.User;
        var staff = principal?.Identity?.IsAuthenticated == true && !principal.IsInRole(UserRoles.Customer);
        return MapToDto(order, tableNumber) with { AccessToken = staff ? null : _tokens.Create("order", order.OrderId), PaidAmount = paid,
            PaymentStatus = paid >= order.Total ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID",
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
                                     (current == OrderStatuses.PendingConfirmation && next == OrderStatuses.ConfirmationTimeout),

            OrderSources.Delivery => (current == OrderStatuses.New && next == OrderStatuses.Accepted) ||
                                     (current == OrderStatuses.Accepted && next == OrderStatuses.Preparing) ||
                                     (current == OrderStatuses.New && next == OrderStatuses.Preparing) ||
                                     (current == OrderStatuses.Preparing && next == OrderStatuses.Ready) ||
                                     (current == OrderStatuses.Ready && next == OrderStatuses.OutForDelivery) ||
                                     (current == OrderStatuses.OutForDelivery && next == OrderStatuses.Delivered),

            OrderSources.Takeaway => (current == OrderStatuses.New && next == OrderStatuses.Accepted) ||
                                     (current == OrderStatuses.Accepted && next == OrderStatuses.Preparing) ||
                                     (current == OrderStatuses.New && next == OrderStatuses.Preparing) ||
                                     (current == OrderStatuses.Preparing && next == OrderStatuses.ReadyForPickup) ||
                                     (current == OrderStatuses.ReadyForPickup && next == OrderStatuses.PickedUp),

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
                i.SpecialInstruction
            )).ToList(),
            EstimatedPrepTimeMinutes: o.EstimatedPrepTimeMinutes,
            EstimatedReadyAt: o.EstimatedReadyAt,
            SessionId: o.SessionId
        );
}
