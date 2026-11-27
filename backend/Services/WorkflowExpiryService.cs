using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using RestaurantSystem.Api.Configuration;
using RestaurantSystem.Api.Models;
using RestaurantSystem.Api.Repositories;

namespace RestaurantSystem.Api.Services;

public sealed class WorkflowExpiryService(IServiceScopeFactory scopes, ILogger<WorkflowExpiryService> logger) : BackgroundService
{
    private static TimeZoneInfo GetLocalTimeZone()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata"); }
        catch
        {
            try { return TimeZoneInfo.FindSystemTimeZoneById("India Standard Time"); }
            catch { return TimeZoneInfo.Local; }
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(15));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<RestaurantDbContext>();
                if (db.Database.IsRelational() && !await db.Database.CanConnectAsync(stoppingToken))
                    continue;
                if (!UserProvisioning.IsInitialized)
                {
                    await UserProvisioning.EnsureDefaultDataAsync(db);
                    await DiningAreaProvisioning.EnsureDefaultDiningAreasAsync(db);
                }
                var rules = scope.ServiceProvider.GetRequiredService<IOptions<BusinessRulesOptions>>().Value;
                var cutoff = DateTime.UtcNow.AddMinutes(-rules.OrderConfirmationTimeoutMinutes);
                if (db.Database.IsNpgsql() || db.Database.IsRelational())
                {
                    await db.Orders.Where(o => o.Status == OrderStatuses.PendingConfirmation && o.ConfirmationRequestedAt < cutoff)
                        .ExecuteUpdateAsync(setters => setters.SetProperty(o => o.Status, OrderStatuses.ConfirmationTimeout).SetProperty(o => o.UpdatedAt, DateTime.UtcNow), stoppingToken);
                }
                else
                {
                    var timedOutOrders = await db.Orders
                        .Where(o => o.Status == OrderStatuses.PendingConfirmation && o.ConfirmationRequestedAt < cutoff)
                        .ToListAsync(stoppingToken);
                    foreach (var o in timedOutOrders)
                    {
                        o.Status = OrderStatuses.ConfirmationTimeout;
                        o.UpdatedAt = DateTime.UtcNow;
                    }
                    if (timedOutOrders.Any()) await db.SaveChangesAsync(stoppingToken);
                }
                
                var localNow = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, GetLocalTimeZone());
                var date = DateOnly.FromDateTime(localNow);
                
                var bookings = await db.Reservations
                    .Include(r => r.Table)
                    .Where(r => r.ReservationDate <= date && (r.Status == ReservationStatuses.Confirmed || r.Status == ReservationStatuses.Rescheduled || r.Status == ReservationStatuses.Arrived))
                    .ToListAsync(stoppingToken);

                foreach (var booking in bookings)
                {
                    var arrivalDateTime = booking.ReservationDate.ToDateTime(booking.ReservationTime);
                    var tenMinutesBefore = arrivalDateTime.AddMinutes(-10);
                    var expiryTime = arrivalDateTime.AddMinutes(booking.GracePeriodMinutes);

                    // 1. Expiration check: Grace period passed without arrival
                    if (localNow > expiryTime && (booking.Status == ReservationStatuses.Confirmed || booking.Status == ReservationStatuses.Rescheduled))
                    {
                        booking.Status = ReservationStatuses.NoShow;
                        booking.UpdatedAt = DateTime.UtcNow;
                        if (booking.Table != null && booking.Table.Status == TableStatuses.Reserved && booking.Table.CurrentCustomerName == booking.CustomerName)
                        {
                            booking.Table.Status = TableStatuses.Available;
                            booking.Table.CurrentCustomerName = null;
                            booking.Table.UpdatedAt = DateTime.UtcNow;
                        }
                    }
                    // 2. Auto-disable table 10 minutes before customer arrival
                    else if (localNow >= tenMinutesBefore && localNow <= expiryTime && (booking.Status == ReservationStatuses.Confirmed || booking.Status == ReservationStatuses.Rescheduled || booking.Status == ReservationStatuses.Arrived))
                    {
                        if (booking.Table != null && booking.Table.Status == TableStatuses.Available)
                        {
                            booking.Table.Status = TableStatuses.Reserved;
                            booking.Table.CurrentCustomerName = booking.CustomerName;
                            booking.Table.UpdatedAt = DateTime.UtcNow;
                            logger.LogInformation("Table A{TableNumber} automatically marked RESERVED 10 min before arrival for {CustomerName} ({BookingId}).", booking.Table.TableNumber, booking.CustomerName, booking.BookingId);
                        }
                    }
                }

                // 3. Auto-release for tables in CLEANING status after 2 minutes
                var cleaningCutoff = DateTime.UtcNow.AddMinutes(-2);
                var staleCleaningTables = await db.Tables
                    .Where(t => (t.Status == TableStatuses.Cleaning || t.Status == TableStatuses.WaitingForCleaning) && t.UpdatedAt < cleaningCutoff)
                    .ToListAsync(stoppingToken);

                if (staleCleaningTables.Count > 0)
                {
                    var notificationsService = scope.ServiceProvider.GetService<INotificationService>();
                    foreach (var table in staleCleaningTables)
                    {
                        table.Status = TableStatuses.Available;
                        table.CurrentCustomerName = null;
                        table.AssignedWaiterId = null;
                        table.UpdatedAt = DateTime.UtcNow;
                        logger.LogInformation("Table A{TableNumber} automatically marked AVAILABLE after 2 minutes of cleaning.", table.TableNumber);

                        var helpReqs = await db.HelpRequests
                            .Where(h => h.TableId == table.TableId && h.Status != "RESOLVED")
                            .ToListAsync(stoppingToken);
                        foreach (var h in helpReqs)
                        {
                            h.Status = "RESOLVED";
                            h.ResolvedAt = DateTime.UtcNow;
                        }

                        if (notificationsService != null)
                        {
                            await notificationsService.NotifyRoleAsync(
                                table.RestaurantId,
                                UserRoles.Receptionist,
                                "TABLE_STATUS_CHANGED",
                                $"Table A{table.TableNumber} is now available",
                                $"Table A{table.TableNumber} 2-minute cleaning period has completed. Table is ready for guests.",
                                new { TableId = table.TableId, Status = TableStatuses.Available, TableNumber = table.TableNumber }
                            );
                            await notificationsService.NotifyRoleAsync(
                                table.RestaurantId,
                                UserRoles.Waiter,
                                "TABLE_STATUS_CHANGED",
                                $"Table A{table.TableNumber} is now available",
                                $"Table A{table.TableNumber} 2-minute cleaning period has completed.",
                                new { TableId = table.TableId, Status = TableStatuses.Available, TableNumber = table.TableNumber }
                            );
                        }
                    }
                }

                await db.SaveChangesAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex) { logger.LogWarning(ex, "Unable to process workflow expiry; the next cycle will retry."); }
        }
    }
}
