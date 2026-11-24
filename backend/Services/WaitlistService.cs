using Microsoft.EntityFrameworkCore;
using RestaurantSystem.Api.DTOs;
using RestaurantSystem.Api.Models;
using RestaurantSystem.Api.Repositories;

namespace RestaurantSystem.Api.Services;

public class WaitlistService : IWaitlistService
{
    private readonly RestaurantDbContext _db;
    private readonly INotificationService _notifications;
    private readonly IAuditLogService _audit;
    private readonly ILogger<WaitlistService> _logger;

    public WaitlistService(
        RestaurantDbContext db,
        INotificationService notifications,
        IAuditLogService audit,
        ILogger<WaitlistService> logger)
    {
        _db = db;
        _notifications = notifications;
        _audit = audit;
        _logger = logger;
    }

    public async Task<List<WalkInWaitlistDto>> GetWaitlistAsync(Guid restaurantId)
    {
        var entries = await _db.WalkInWaitlists
            .Include(w => w.SeatedTable)
            .Where(w => w.RestaurantId == restaurantId && w.Status != "SEATED" && w.Status != "CANCELLED")
            .OrderBy(w => w.CreatedAt)
            .ToListAsync();

        return entries.Select(e => new WalkInWaitlistDto(
            e.WaitlistId,
            e.RestaurantId,
            e.CustomerName,
            e.CustomerPhone,
            e.PartySize,
            e.Status,
            e.EstimatedWaitMinutes,
            e.EstimatedReadyAt,
            e.NotifiedAt,
            e.SeatedTableId,
            e.SeatedTable?.TableNumber,
            e.Notes,
            e.CreatedAt
        )).ToList();
    }

    public async Task<WaitEstimateDto> GetWaitEstimateAsync(Guid restaurantId, int partySize)
    {
        var suitableTables = await _db.Tables
            .Where(t => t.RestaurantId == restaurantId && t.Capacity >= partySize && t.Status != TableStatuses.OutOfService)
            .OrderBy(t => t.Capacity)
            .ToListAsync();

        if (!suitableTables.Any())
        {
            return new WaitEstimateDto(
                partySize,
                0,
                0,
                0,
                0,
                "No tables in the restaurant accommodate this party size."
            );
        }

        var waitingAhead = await _db.WalkInWaitlists
            .CountAsync(w => w.RestaurantId == restaurantId && (w.Status == "WAITING" || w.Status == "NOTIFIED"));

        var availableNow = suitableTables.Count(t => t.Status == TableStatuses.Available);
        var cleaningTables = suitableTables.Count(t => t.Status == TableStatuses.WaitingForCleaning || t.Status == TableStatuses.Cleaning);
        var occupiedTables = suitableTables.Where(t => t.Status == TableStatuses.Occupied).ToList();

        int estMin = 15;
        int estMax = 25;

        if (waitingAhead == 0 && availableNow > 0)
        {
            estMin = 0;
            estMax = 5;
        }
        else if (waitingAhead == 0 && cleaningTables > 0)
        {
            estMin = 3;
            estMax = 8;
        }
        else
        {
            // Estimate based on occupied turnover and waiting queue
            estMin = Math.Max(10, 10 + (waitingAhead * 8));
            estMax = estMin + 12;
        }

        return new WaitEstimateDto(
            partySize,
            estMin,
            estMax,
            waitingAhead,
            suitableTables.Count,
            estMin <= 5 ? "Tables are available immediately or within 5 minutes." : $"Estimated wait is approximately {estMin} - {estMax} minutes based on current dining pace."
        );
    }

    public async Task<WalkInWaitlistDto> AddWalkInAsync(AddWalkInDto dto)
    {
        var estimate = await GetWaitEstimateAsync(dto.RestaurantId, dto.PartySize);
        var readyAt = DateTime.UtcNow.AddMinutes(estimate.EstimatedWaitMinutesMin);

        var entry = new WalkInWaitlist
        {
            RestaurantId = dto.RestaurantId,
            CustomerName = dto.CustomerName.Trim(),
            CustomerPhone = dto.CustomerPhone.Trim(),
            PartySize = dto.PartySize > 0 ? dto.PartySize : 2,
            Status = "WAITING",
            EstimatedWaitMinutes = estimate.EstimatedWaitMinutesMin,
            EstimatedReadyAt = readyAt,
            Notes = dto.Notes
        };

        _db.WalkInWaitlists.Add(entry);
        await _db.SaveChangesAsync();

        await _notifications.NotifyRoleAsync(
            dto.RestaurantId,
            UserRoles.Receptionist,
            "WAITLIST_UPDATED",
            "New Walk-in Waitlist Party",
            $"{entry.CustomerName} ({entry.PartySize} guests) added to waitlist. Est. wait: {estimate.EstimatedWaitMinutesMin}-{estimate.EstimatedWaitMinutesMax} mins.",
            new { entry.WaitlistId, entry.CustomerName, entry.PartySize, EstWait = estimate.EstimatedWaitMinutesMin }
        );

        await _audit.LogAsync(
            dto.RestaurantId,
            null,
            UserRoles.Receptionist,
            "WAITLIST_ADD",
            "walk_in_waitlist",
            new { entry.WaitlistId, entry.CustomerName, entry.PartySize }
        );

        return new WalkInWaitlistDto(
            entry.WaitlistId,
            entry.RestaurantId,
            entry.CustomerName,
            entry.CustomerPhone,
            entry.PartySize,
            entry.Status,
            entry.EstimatedWaitMinutes,
            entry.EstimatedReadyAt,
            entry.NotifiedAt,
            entry.SeatedTableId,
            null,
            entry.Notes,
            entry.CreatedAt
        );
    }

    public async Task<bool> NotifyGuestAsync(Guid waitlistId)
    {
        var entry = await _db.WalkInWaitlists.FindAsync(waitlistId);
        if (entry == null || entry.Status == "SEATED" || entry.Status == "CANCELLED") return false;

        entry.Status = "NOTIFIED";
        entry.NotifiedAt = DateTime.UtcNow;
        entry.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        await _notifications.NotifyRoleAsync(
            entry.RestaurantId,
            UserRoles.Receptionist,
            "WAITLIST_GUEST_NOTIFIED",
            "Guest Notified: Table Ready",
            $"{entry.CustomerName} has been alerted that their table is ready.",
            new { entry.WaitlistId, entry.CustomerName }
        );

        _logger.LogInformation("Guest {Name} ({Phone}) alerted that table is ready for party size {Size}.",
            entry.CustomerName, entry.CustomerPhone, entry.PartySize);

        return true;
    }

    public async Task<bool> SeatGuestAsync(Guid waitlistId, Guid tableId)
    {
        var entry = await _db.WalkInWaitlists.FindAsync(waitlistId);
        if (entry == null) return false;

        var table = await _db.Tables.FindAsync(tableId);
        if (table == null || table.Status == TableStatuses.OutOfService) return false;

        entry.Status = "SEATED";
        entry.SeatedTableId = tableId;
        entry.UpdatedAt = DateTime.UtcNow;

        table.Status = TableStatuses.Occupied;
        table.CurrentCustomerName = entry.CustomerName;
        table.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        await _notifications.NotifyRoleAsync(
            entry.RestaurantId,
            UserRoles.Receptionist,
            "WAITLIST_GUEST_SEATED",
            "Guest Seated",
            $"{entry.CustomerName} seated at Table A{table.TableNumber}.",
            new { entry.WaitlistId, TableNumber = table.TableNumber }
        );

        return true;
    }

    public async Task<bool> CancelWaitlistEntryAsync(Guid waitlistId)
    {
        var entry = await _db.WalkInWaitlists.FindAsync(waitlistId);
        if (entry == null) return false;

        entry.Status = "CANCELLED";
        entry.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        return true;
    }
}
