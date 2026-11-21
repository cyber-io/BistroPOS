using Microsoft.EntityFrameworkCore;
using RestaurantSystem.Api.DTOs;
using RestaurantSystem.Api.Models;
using RestaurantSystem.Api.Repositories;
using RestaurantSystem.Api.Security;

namespace RestaurantSystem.Api.Services;

public class TableService : ITableService
{
    private readonly RestaurantDbContext _db;
    private readonly IAuditLogService _audit;
    private readonly INotificationService _notifications;

    public TableService(RestaurantDbContext db, IAuditLogService audit, INotificationService notifications)
    {
        _db = db;
        _audit = audit;
        _notifications = notifications;
    }

    public async Task<List<TableDto>> GetTablesAsync(Guid restaurantId)
    {
        var tables = await _db.Tables
            .Include(t => t.AssignedWaiter)
            .Where(t => t.RestaurantId == restaurantId)
            .OrderBy(t => t.TableNumber)
            .ToListAsync();

        return tables.Select(t => new TableDto(
            t.TableId,
            t.RestaurantId,
            t.TableNumber,
            t.Capacity,
            t.Status,
            t.QrIdentifier,
            t.CurrentCustomerName,
            t.AssignedWaiterId,
            t.AssignedWaiter?.Name,
            t.PositionX,
            t.PositionY,
            t.Shape ?? "SQUARE",
            t.DiningArea ?? "everyday"
        )).ToList();
    }

    public async Task<TableDto?> GetTableByIdAsync(Guid tableId)
    {
        var t = await _db.Tables
            .Include(t => t.AssignedWaiter)
            .FirstOrDefaultAsync(t => t.TableId == tableId);

        if (t == null) return null;

        return new TableDto(
            t.TableId,
            t.RestaurantId,
            t.TableNumber,
            t.Capacity,
            t.Status,
            t.QrIdentifier,
            t.CurrentCustomerName,
            t.AssignedWaiterId,
            t.AssignedWaiter?.Name,
            t.PositionX,
            t.PositionY,
            t.Shape ?? "SQUARE",
            t.DiningArea ?? "everyday"
        );
    }

    public async Task<QrValidationResponse> ValidateQrAsync(string qrIdentifier)
    {
        var table = await _db.Tables
            .Include(t => t.Restaurant)
            .FirstOrDefaultAsync(t => t.QrIdentifier == qrIdentifier);

        if (table == null)
        {
            return new QrValidationResponse(false, null, null, null, null, null, "Invalid or unrecognized QR code.");
        }

        if (table.Status == TableStatuses.OutOfService)
        {
            return new QrValidationResponse(false, table.RestaurantId, table.Restaurant?.Name, table.TableId, table.TableNumber, table.Status, "This table is currently out of service.");
        }

        return new QrValidationResponse(
            true,
            table.RestaurantId,
            table.Restaurant?.Name,
            table.TableId,
            table.TableNumber,
            table.Status,
            "Table verified successfully."
        );
    }

    public async Task<bool> UpdateTableStatusAsync(Guid tableId, UpdateTableStatusRequest request)
    {
        var table = await _db.Tables.FindAsync(tableId);
        if (table == null) return false;
        var displayName = DiningLayoutCatalog.DisplayName(table.TableNumber, table.QrIdentifier);
        var tableLabel = displayName == "Party hall" ? displayName : $"Table {displayName}";

        if (request.Status is not (TableStatuses.Available or TableStatuses.Reserved or TableStatuses.Occupied or TableStatuses.WaitingForCleaning or TableStatuses.Cleaning or TableStatuses.OutOfService)) throw new ArgumentException("Unknown table status.");
        if (request.AssignedWaiterId.HasValue && !await _db.Users.AnyAsync(u => u.UserId == request.AssignedWaiterId && u.RestaurantId == table.RestaurantId && u.Role == UserRoles.Waiter)) throw new ArgumentException("Choose a waiter assigned to this restaurant.");
        table.Status = request.Status;
        if (request.Status == TableStatuses.Available)
        {
            table.CurrentCustomerName = null;
            table.AssignedWaiterId = null;
            var activeRes = await _db.Reservations
                .Where(r => r.TableId == table.TableId && (r.Status == ReservationStatuses.Seated || r.Status == ReservationStatuses.Arrived))
                .ToListAsync();
            foreach (var r in activeRes)
            {
                r.Status = ReservationStatuses.Completed;
                r.UpdatedAt = DateTime.UtcNow;
            }
        }
        if (request.CustomerName != null)
        {
            table.CurrentCustomerName = request.CustomerName;
        }
        if (request.AssignedWaiterId.HasValue)
        {
            table.AssignedWaiterId = request.AssignedWaiterId.Value;
        }
        table.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        await _notifications.NotifyRoleAsync(
            table.RestaurantId,
            UserRoles.Waiter,
            "TABLE_STATUS_CHANGED",
            $"{tableLabel} status changed",
            $"{tableLabel} is now {request.Status}.",
            new { TableId = table.TableId, TableNumber = table.TableNumber, Status = request.Status }
        );
        await _notifications.NotifyRoleAsync(
            table.RestaurantId,
            UserRoles.Receptionist,
            "TABLE_STATUS_CHANGED",
            $"{tableLabel} status changed",
            $"{tableLabel} is now {request.Status}.",
            new { TableId = table.TableId, TableNumber = table.TableNumber, Status = request.Status }
        );

        await _audit.LogAsync(
            table.RestaurantId,
            null,
            "RECEPTIONIST",
            "TABLE_STATUS_UPDATED",
            "tables",
            new { table.TableNumber, request.Status }
        );

        return true;
    }

    public async Task<bool> UpdateTablePositionAsync(Guid tableId, UpdateTablePositionDto request)
    {
        var table = await _db.Tables.FindAsync(tableId);
        if (table == null) return false;

        table.PositionX = request.PositionX;
        table.PositionY = request.PositionY;
        if (!string.IsNullOrWhiteSpace(request.Shape)) table.Shape = request.Shape.Trim().ToUpperInvariant();
        if (!string.IsNullOrWhiteSpace(request.DiningArea)) table.DiningArea = request.DiningArea.Trim().ToLowerInvariant();
        table.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        await _notifications.NotifyRoleAsync(
            table.RestaurantId,
            UserRoles.Receptionist,
            "TABLE_POSITION_UPDATED",
            "Table layout updated",
            $"Table {table.TableNumber} position updated on floor map.",
            new { TableId = table.TableId, TableNumber = table.TableNumber, PositionX = table.PositionX, PositionY = table.PositionY }
        );

        return true;
    }

    public async Task<DiningSessionDto?> GetOrCreateActiveSessionAsync(Guid tableId)
    {
        var table = await _db.Tables.FindAsync(tableId);
        if (table == null) return null;

        var session = await _db.DiningSessions
            .Where(s => s.TableId == tableId && s.Status == "ACTIVE")
            .OrderByDescending(s => s.CreatedAt)
            .FirstOrDefaultAsync();

        if (session == null)
        {
            var earliestActiveOrder = await _db.Orders
                .Where(o => o.TableId == tableId && o.Status != OrderStatuses.Cancelled && o.CreatedAt >= DateTime.UtcNow.AddHours(-6))
                .OrderBy(o => o.CreatedAt)
                .FirstOrDefaultAsync();

            session = new DiningSession
            {
                RestaurantId = table.RestaurantId,
                TableId = tableId,
                SessionCode = $"SES-{table.TableNumber}-{DateTime.UtcNow:MMddHHmm}",
                Status = "ACTIVE",
                CreatedAt = earliestActiveOrder != null ? earliestActiveOrder.CreatedAt.AddSeconds(-1) : DateTime.UtcNow
            };
            _db.DiningSessions.Add(session);
            await _db.SaveChangesAsync();
        }

        var orders = await _db.Orders
            .Include(o => o.Items)
            .Where(o => o.TableId == tableId && 
                       (o.SessionId == session.SessionId || 
                        o.CreatedAt >= session.CreatedAt ||
                        (o.Status != OrderStatuses.Cancelled && o.CreatedAt >= DateTime.UtcNow.AddHours(-6))))
            .OrderByDescending(o => o.CreatedAt)
            .ToListAsync();

        var anySessionMissing = false;
        foreach (var ord in orders)
        {
            if (!ord.SessionId.HasValue)
            {
                ord.SessionId = session.SessionId;
                anySessionMissing = true;
            }
        }
        if (anySessionMissing)
        {
            await _db.SaveChangesAsync();
        }

        var orderDtos = orders.Select(o => new OrderDto(
            o.OrderId,
            o.OrderNumber,
            o.RestaurantId,
            o.CustomerId,
            o.TableId,
            table.TableNumber,
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
            SessionId: session.SessionId
        )).ToList();

        return new DiningSessionDto(
            session.SessionId,
            session.RestaurantId,
            session.TableId,
            table.TableNumber,
            session.SessionCode,
            session.Status,
            session.CreatedAt,
            orderDtos
        );
    }

    public async Task<bool> CloseSessionAsync(Guid tableId)
    {
        var session = await _db.DiningSessions
            .Where(s => s.TableId == tableId && s.Status == "ACTIVE")
            .FirstOrDefaultAsync();

        if (session == null) return false;

        session.Status = "CLOSED";
        session.ClosedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return true;
    }
}

public class HelpRequestService : IHelpRequestService
{
    private readonly RestaurantDbContext _db;
    private readonly INotificationService _notifications;
    private readonly IAuditLogService _audit;
    private readonly ResourceTokens _tokens;

    public HelpRequestService(RestaurantDbContext db, INotificationService notifications, IAuditLogService audit, ResourceTokens tokens)
    {
        _db = db;
        _notifications = notifications;
        _audit = audit;
        _tokens = tokens;
    }

    public async Task<HelpRequestDto> CreateHelpRequestAsync(CreateHelpRequestDto request)
    {
        var table = await _db.Tables.FindAsync(request.TableId);
        if (table == null || table.RestaurantId != request.RestaurantId || table.Status == TableStatuses.OutOfService) throw new ArgumentException("Invalid table.");
        if (string.IsNullOrWhiteSpace(request.Message) || request.Message.Length > 1000) throw new ArgumentException("Enter a help request up to 1,000 characters.");
        var tableNum = table.TableNumber;

        var helpReq = new HelpRequest
        {
            RestaurantId = request.RestaurantId,
            TableId = request.TableId,
            CustomerId = request.CustomerId,
            Message = request.Message,
            RequestType = string.IsNullOrWhiteSpace(request.RequestType) ? "CUSTOM" : request.RequestType,
            Status = "PENDING",
            CreatedAt = DateTime.UtcNow
        };

        _db.HelpRequests.Add(helpReq);
        await _db.SaveChangesAsync();

        // Customer -> Waiter: TABLE 1 IS CALLING FOR HELP (Section 7 & 47)
        await _notifications.NotifyRoleAsync(
            request.RestaurantId,
            UserRoles.Waiter,
            "CUSTOMER_HELP_REQUEST",
            $"Table {tableNum} needs assistance",
            $"TABLE {tableNum} IS CALLING FOR HELP ({helpReq.RequestType}): \"{request.Message}\"",
            new { helpReq.RequestId, TableNumber = tableNum, request.Message, helpReq.RequestType }
        );

        await _audit.LogAsync(
            request.RestaurantId,
            request.CustomerId,
            "CUSTOMER",
            "HELP_REQUEST_CREATED",
            "help_requests",
            new { helpReq.RequestId, TableNumber = tableNum, request.Message, helpReq.RequestType }
        );

        return new HelpRequestDto(
            helpReq.RequestId,
            helpReq.RestaurantId,
            helpReq.TableId,
            tableNum,
            helpReq.Message,
            helpReq.Status,
            null,
            null,
            helpReq.CreatedAt,
            null,
            _tokens.Create("help", helpReq.RequestId),
            helpReq.RequestType
        );
    }

    public async Task<List<HelpRequestDto>> GetActiveHelpRequestsAsync(Guid restaurantId)
    {
        var list = await _db.HelpRequests
            .Include(h => h.Table)
            .Where(h => h.RestaurantId == restaurantId && h.Status != "RESOLVED")
            .OrderByDescending(h => h.CreatedAt)
            .ToListAsync();

        return list.Select(h => new HelpRequestDto(
            h.RequestId,
            h.RestaurantId,
            h.TableId,
            h.Table?.TableNumber ?? 0,
            h.Message,
            h.Status,
            h.AssignedWaiterId,
            h.AssignedWaiterName,
            h.CreatedAt,
            h.AcceptedAt,
            null,
            h.RequestType
        )).ToList();
    }

    public async Task<bool> AssignHelpRequestAsync(Guid requestId, AssignHelpRequestDto dto)
    {
        await using var transaction = await _db.Database.BeginTransactionAsync();
        await _db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtext({requestId.ToString()}))");
        // Concurrency lock: Only the first waiter who accepts is assigned! (Section 7 & 18)
        var req = await _db.HelpRequests
            .Include(h => h.Table)
            .FirstOrDefaultAsync(h => h.RequestId == requestId);

        if (req == null) return false;

        if (req.Status != "PENDING")
        {
            // Already taken by another waiter
            return false;
        }

        req.Status = "ASSIGNED";
        req.AssignedWaiterId = dto.WaiterId;
        req.AssignedWaiterName = dto.WaiterName;
        req.AcceptedAt = DateTime.UtcNow;

        if (req.Table != null)
        {
            req.Table.Status = TableStatuses.Cleaning;
            req.Table.AssignedWaiterId = dto.WaiterId;
            req.Table.UpdatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();
        await transaction.CommitAsync();

        if (req.Table != null)
        {
            await _notifications.NotifyRoleAsync(
                req.RestaurantId,
                UserRoles.Waiter,
                "TABLE_STATUS_CHANGED",
                $"Table A{req.Table.TableNumber} is being cleaned",
                $"{dto.WaiterName} accepted cleaning for Table A{req.Table.TableNumber}.",
                new { TableId = req.TableId, Status = TableStatuses.Cleaning, Waiter = dto.WaiterName }
            );
            await _notifications.NotifyRoleAsync(
                req.RestaurantId,
                UserRoles.Receptionist,
                "TABLE_STATUS_CHANGED",
                $"Table A{req.Table.TableNumber} is being cleaned",
                $"{dto.WaiterName} accepted cleaning for Table A{req.Table.TableNumber}.",
                new { TableId = req.TableId, Status = TableStatuses.Cleaning, Waiter = dto.WaiterName }
            );
        }

        // Customer receives: The Waiter Kunal Is Coming. (Section 7 & 18)
        await _notifications.NotifyTableAsync(
            req.RestaurantId,
            req.TableId,
            "WAITER_ASSIGNED",
            "Assistance is on the way",
            $"The Waiter {dto.WaiterName} Is Coming.",
            new { req.RequestId, dto.WaiterName }
        );

        await _audit.LogAsync(
            req.RestaurantId,
            dto.WaiterId,
            UserRoles.Waiter,
            "HELP_REQUEST_ASSIGNED",
            "help_requests",
            new { req.RequestId, TableNumber = req.Table?.TableNumber, Waiter = dto.WaiterName }
        );

        return true;
    }

    public async Task<bool> ResolveHelpRequestAsync(Guid requestId)
    {
        var req = await _db.HelpRequests.Include(h => h.Table).FirstOrDefaultAsync(h => h.RequestId == requestId);
        if (req == null) return false;

        req.Status = "RESOLVED";
        req.ResolvedAt = DateTime.UtcNow;

        if (req.Table != null && (req.Table.Status == TableStatuses.Cleaning || req.Table.Status == TableStatuses.WaitingForCleaning))
        {
            req.Table.Status = TableStatuses.Available;
            req.Table.CurrentCustomerName = null;
            req.Table.AssignedWaiterId = null;
            req.Table.UpdatedAt = DateTime.UtcNow;

            var activeRes = await _db.Reservations
                .Where(r => r.TableId == req.Table.TableId && (r.Status == ReservationStatuses.Seated || r.Status == ReservationStatuses.Arrived))
                .ToListAsync();
            foreach (var r in activeRes)
            {
                r.Status = ReservationStatuses.Completed;
                r.UpdatedAt = DateTime.UtcNow;
            }
        }

        await _db.SaveChangesAsync();

        if (req.Table != null)
        {
            await _notifications.NotifyRoleAsync(
                req.RestaurantId,
                UserRoles.Waiter,
                "TABLE_STATUS_CHANGED",
                $"Table A{req.Table.TableNumber} is now available",
                $"Table A{req.Table.TableNumber} has been cleaned and is ready for guests.",
                new { TableId = req.Table.TableId, Status = TableStatuses.Available }
            );
            await _notifications.NotifyRoleAsync(
                req.RestaurantId,
                UserRoles.Receptionist,
                "TABLE_STATUS_CHANGED",
                $"Table A{req.Table.TableNumber} is now available",
                $"Table A{req.Table.TableNumber} has been cleaned and is ready for guests.",
                new { TableId = req.Table.TableId, Status = TableStatuses.Available }
            );
        }

        return true;
    }
}
