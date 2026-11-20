using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using RestaurantSystem.Api.Repositories;
using RestaurantSystem.Api.Models;

namespace RestaurantSystem.Api.Hubs;

public interface INotificationClient
{
    Task ReceiveNotification(string type, string title, string message, object? payload);
    Task OrderStatusUpdated(string orderId, string newStatus, object? payload);
    Task HelpRequestCreated(string requestId, int tableNumber, string message);
    Task HelpRequestAssigned(string requestId, string waiterName);
    Task FoodAvailabilityChanged(string menuItemId, bool isAvailable);
}

[Authorize]
public class NotificationHub(RestaurantDbContext db) : Hub<INotificationClient>
{
    public override async Task OnConnectedAsync()
    {
        var restaurantId = Context.User?.FindFirst("restaurant_id")?.Value;
        var role = Context.User?.FindFirst(ClaimTypes.Role)?.Value;
        var userId = Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        // Group membership strictly isolated by tenant and role
        if (!string.IsNullOrEmpty(restaurantId))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, $"tenant_{restaurantId}");

            if (!string.IsNullOrEmpty(role))
            {
                await Groups.AddToGroupAsync(Context.ConnectionId, $"tenant_{restaurantId}_{role.ToLower()}");
            }
        }

        if (!string.IsNullOrEmpty(userId))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, $"user_{userId}");
        }

        await base.OnConnectedAsync();
    }

    public async Task JoinTableGroup(string restaurantId, string tableId)
    {
        if (!Guid.TryParse(restaurantId, out var restaurant) || !Guid.TryParse(tableId, out var table)) throw new HubException("Invalid table.");
        Guid.TryParse(Context.User?.FindFirstValue(ClaimTypes.NameIdentifier), out var user);
        var role = Context.User?.FindFirstValue(ClaimTypes.Role);
        var tenant = Context.User?.FindFirstValue("restaurant_id");
        var staff = role is UserRoles.SuperAdmin || (role is UserRoles.Receptionist or UserRoles.Kitchen or UserRoles.Waiter && tenant == restaurantId);
        var customer = await db.Orders.AnyAsync(o => o.RestaurantId == restaurant && o.TableId == table && o.CustomerId == user && o.Status != OrderStatuses.Cancelled);
        if (!staff && !customer) throw new HubException("This table is outside your session.");
        await Groups.AddToGroupAsync(Context.ConnectionId, $"table_{restaurantId}_{tableId}");
    }

    public async Task LeaveTableGroup(string restaurantId, string tableId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"table_{restaurantId}_{tableId}");
    }
}
