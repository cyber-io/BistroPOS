using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using RestaurantSystem.Api.DTOs;

namespace RestaurantSystem.Api.Services;

public interface IInventoryService
{
    Task<List<InventoryItemDto>> GetInventoryAsync(Guid restaurantId);

    Task<InventoryItemDto> CreateItemAsync(CreateInventoryItemDto request);

    Task<bool> UpdateStockAsync(Guid itemId, decimal quantityChange, string? reason);

    Task<bool> ReportShortageAsync(ReportShortageDto request);
}