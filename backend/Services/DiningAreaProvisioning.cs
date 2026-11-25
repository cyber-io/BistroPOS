using Microsoft.EntityFrameworkCore;
using RestaurantSystem.Api.Models;
using RestaurantSystem.Api.Repositories;

namespace RestaurantSystem.Api.Services;

public static class DiningAreaProvisioning
{
    public static async Task<int> EnsureDefaultDiningAreasAsync(RestaurantDbContext db)
    {
        var restaurants = await db.Restaurants.ToListAsync();
        if (restaurants.Count == 0) return 0;

        var totalAdded = 0;

        foreach (var restaurant in restaurants)
        {
            var restaurantId = restaurant.RestaurantId;

            var existingTables = await db.Tables
                .Where(t => t.RestaurantId == restaurantId)
                .ToListAsync();

            // 1. Ensure existing standard tables have correct group/everyday dining area
            foreach (var t in existingTables)
            {
                var correctArea = DiningLayoutCatalog.Area(t.Capacity, t.QrIdentifier, t.TableNumber);
                if (string.IsNullOrEmpty(t.DiningArea) || t.DiningArea == "everyday")
                {
                    if (correctArea != "everyday")
                    {
                        t.DiningArea = correctArea;
                    }
                }
            }

            // 2. Ensure Family (101-104) and Party Hall (201) are provisioned
            foreach (var definition in DiningLayoutCatalog.Definitions)
            {
                var existing = existingTables.FirstOrDefault(t => t.TableNumber == definition.TableNumber);
                if (existing != null)
                {
                    var expectedArea = definition.SeatingStyle == "hall" ? "party" : "family";
                    if (existing.DiningArea != expectedArea)
                    {
                        existing.DiningArea = expectedArea;
                    }
                    continue;
                }

                var qrIdentifier = DiningLayoutCatalog.QrIdentifier(restaurantId, definition);
                Guid newTableId;
                if (restaurantId == DiningLayoutCatalog.DefaultRestaurantId)
                {
                    newTableId = definition.TableId;
                }
                else
                {
                    var idSeed = $"{restaurantId:N}"[..24] + $"{definition.TableNumber:D8}";
                    newTableId = Guid.TryParse(idSeed, out var parsed) ? parsed : Guid.NewGuid();
                }

                // If newTableId is already taken by another restaurant, generate a new Guid
                if (await db.Tables.AnyAsync(t => t.TableId == newTableId))
                {
                    newTableId = Guid.NewGuid();
                }

                db.Tables.Add(new TableEntity
                {
                    TableId = newTableId,
                    RestaurantId = restaurantId,
                    TableNumber = definition.TableNumber,
                    Capacity = definition.Capacity,
                    Status = TableStatuses.Available,
                    QrIdentifier = qrIdentifier,
                    DiningArea = definition.SeatingStyle == "hall" ? "party" : "family",
                    Shape = definition.SeatingStyle == "hall" ? "HALL" : "RECTANGLE",
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                });
                totalAdded++;
            }
        }

        try
        {
            if (totalAdded > 0 || db.ChangeTracker.HasChanges())
            {
                await db.SaveChangesAsync();
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[DiningAreaProvisioning] Warning: {ex.Message}");
        }

        return totalAdded;
    }
}
