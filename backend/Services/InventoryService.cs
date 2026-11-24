using Microsoft.EntityFrameworkCore;
using RestaurantSystem.Api.DTOs;
using RestaurantSystem.Api.Models;
using RestaurantSystem.Api.Repositories;

namespace RestaurantSystem.Api.Services;

public class InventoryService : IInventoryService
{
    private readonly RestaurantDbContext _db;
    private readonly INotificationService _notifications;
    private readonly IAuditLogService _audit;

    public InventoryService(RestaurantDbContext db, INotificationService notifications, IAuditLogService audit)
    {
        _db = db;
        _notifications = notifications;
        _audit = audit;
    }

    public async Task<List<InventoryItemDto>> GetInventoryAsync(Guid restaurantId)
    {
        var items = await _db.InventoryItems
            .Where(i => i.RestaurantId == restaurantId)
            .OrderBy(i => i.Category)
            .ThenBy(i => i.Name)
            .ToListAsync();

        return items.Select(i => new InventoryItemDto(
            i.ItemId,
            i.RestaurantId,
            i.Name,
            i.Category,
            i.Unit,
            i.CurrentStock,
            i.MinThreshold,
            i.CostPerUnit,
            i.Status,
            i.UpdatedAt
        )).ToList();
    }

    public async Task<InventoryItemDto> CreateItemAsync(CreateInventoryItemDto request)
    {
        var status = request.CurrentStock <= 0 ? "OUT_OF_STOCK" :
                     request.CurrentStock <= request.MinThreshold ? "LOW_STOCK" : "IN_STOCK";

        var item = new InventoryItem
        {
            RestaurantId = request.RestaurantId,
            Name = request.Name,
            Category = string.IsNullOrWhiteSpace(request.Category) ? "GENERAL" : request.Category.Trim().ToUpperInvariant(),
            Unit = request.Unit,
            CurrentStock = request.CurrentStock,
            MinThreshold = request.MinThreshold,
            CostPerUnit = request.CostPerUnit,
            Status = status,
            UpdatedAt = DateTime.UtcNow
        };

        _db.InventoryItems.Add(item);
        await _db.SaveChangesAsync();

        return new InventoryItemDto(
            item.ItemId,
            item.RestaurantId,
            item.Name,
            item.Category,
            item.Unit,
            item.CurrentStock,
            item.MinThreshold,
            item.CostPerUnit,
            item.Status,
            item.UpdatedAt
        );
    }

    public async Task<bool> UpdateStockAsync(Guid itemId, decimal quantityChange, string? reason)
    {
        var item = await _db.InventoryItems.FindAsync(itemId);
        if (item == null) return false;

        item.CurrentStock = Math.Max(0, item.CurrentStock + quantityChange);
        item.Status = item.CurrentStock <= 0 ? "OUT_OF_STOCK" :
                      item.CurrentStock <= item.MinThreshold ? "LOW_STOCK" : "IN_STOCK";
        item.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        if (item.Status == "LOW_STOCK" || item.Status == "OUT_OF_STOCK")
        {
            await _notifications.NotifyRoleAsync(
                item.RestaurantId,
                UserRoles.Kitchen,
                "INVENTORY_SHORTAGE_ALERT",
                $"Low Stock: {item.Name}",
                $"{item.Name} stock has fallen to {item.CurrentStock} {item.Unit} (Threshold: {item.MinThreshold} {item.Unit}).",
                new { ItemId = item.ItemId, Name = item.Name, CurrentStock = item.CurrentStock, Status = item.Status }
            );

            await _notifications.NotifyRoleAsync(
                item.RestaurantId,
                UserRoles.SuperAdmin,
                "INVENTORY_SHORTAGE_ALERT",
                $"Low Stock: {item.Name}",
                $"{item.Name} stock has fallen to {item.CurrentStock} {item.Unit}.",
                new { ItemId = item.ItemId, Name = item.Name, CurrentStock = item.CurrentStock, Status = item.Status }
            );
        }

        await _audit.LogAsync(
            item.RestaurantId,
            null,
            "STAFF",
            "INVENTORY_STOCK_UPDATED",
            "inventory_items",
            new { item.Name, quantityChange, NewStock = item.CurrentStock, reason }
        );

        return true;
    }

    public async Task<bool> ReportShortageAsync(ReportShortageDto request)
    {
        if (request.ItemType == "DISH" && request.MenuItemId.HasValue && request.MarkDishSoldOut)
        {
            var menuItem = await _db.MenuItems.FindAsync(request.MenuItemId.Value);
            if (menuItem != null)
            {
                menuItem.Availability = false;
                menuItem.UpdatedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync();
            }
        }
        else if (request.ItemType == "INGREDIENT" && !string.IsNullOrWhiteSpace(request.IngredientName))
        {
            var match = await _db.InventoryItems
                .FirstOrDefaultAsync(i => i.RestaurantId == request.RestaurantId &&
                                         EF.Functions.ILike(i.Name, $"%{request.IngredientName.Trim()}%"));
            if (match != null)
            {
                match.Status = request.ShortageStatus == "OUT_OF_STOCK" ? "OUT_OF_STOCK" : "LOW_STOCK";
                if (request.ShortageStatus == "OUT_OF_STOCK") match.CurrentStock = 0;
                match.UpdatedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync();
            }
        }

        await _notifications.NotifyRoleAsync(
            request.RestaurantId,
            UserRoles.Kitchen,
            "SHORTAGE_REPORTED",
            "Kitchen Shortage Reported",
            $"Shortage reported: {request.IngredientName ?? "Dish"} ({request.ShortageStatus}, Urgency: {request.UrgencyLevel}).",
            request
        );

        return true;
    }
}
