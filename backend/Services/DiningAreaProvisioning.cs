using Microsoft.EntityFrameworkCore;
using RestaurantSystem.Api.Models;
using RestaurantSystem.Api.Repositories;

namespace RestaurantSystem.Api.Services;

public static class DiningAreaProvisioning
{
    public static async Task<int> EnsureDefaultDiningAreasAsync(RestaurantDbContext db)
    {
        var restaurantId = DiningLayoutCatalog.DefaultRestaurantId;
        if (!await db.Restaurants.AnyAsync(restaurant => restaurant.RestaurantId == restaurantId)) return 0;

        // Concurrent app instances must not both try to provision the same real table identities.
        await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync() : null;
        if (db.Database.IsNpgsql())
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtext({"dining-layout:" + restaurantId}))");

        var ids = DiningLayoutCatalog.Definitions.Select(definition => definition.TableId).ToArray();
        var numbers = DiningLayoutCatalog.Definitions.Select(definition => definition.TableNumber).ToArray();
        var qrIdentifiers = DiningLayoutCatalog.Definitions.Select(DiningLayoutCatalog.QrIdentifier).ToArray();
        var existing = await db.Tables.Where(table => ids.Contains(table.TableId)
            || (table.RestaurantId == restaurantId && numbers.Contains(table.TableNumber))
            || qrIdentifiers.Contains(table.QrIdentifier)).ToListAsync();

        var added = 0;
        foreach (var definition in DiningLayoutCatalog.Definitions)
        {
            var qrIdentifier = DiningLayoutCatalog.QrIdentifier(definition);
            var matching = existing.FirstOrDefault(table => table.TableId == definition.TableId);
            if (matching != null)
            {
                if (matching.RestaurantId != restaurantId || matching.TableNumber != definition.TableNumber || matching.QrIdentifier != qrIdentifier)
                    throw new InvalidOperationException($"Dining layout identity {definition.DisplayName} is already used by another table.");
                // Never reset an existing table's status, capacity, customer or waiter during startup.
                continue;
            }
            if (existing.Any(table => table.QrIdentifier == qrIdentifier || (table.RestaurantId == restaurantId && table.TableNumber == definition.TableNumber)))
                throw new InvalidOperationException($"Dining layout table number {definition.TableNumber} or QR identity is already in use.");

            db.Tables.Add(new TableEntity
            {
                TableId = definition.TableId,
                RestaurantId = restaurantId,
                TableNumber = definition.TableNumber,
                Capacity = definition.Capacity,
                Status = TableStatuses.Available,
                QrIdentifier = qrIdentifier,
            });
            added++;
        }
        if (added > 0) await db.SaveChangesAsync();
        if (transaction != null) await transaction.CommitAsync();
        return added;
    }
}
