using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;
using RestaurantSystem.Api.Models;
using RestaurantSystem.Api.Repositories;

namespace RestaurantSystem.Api.Security;

public sealed class ResourceAccessFilter(RestaurantDbContext db, ResourceTokens tokens) : IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var http = context.HttpContext;
        var user = http.User;
        var controller = context.RouteData.Values["controller"]?.ToString() ?? "";
        var action = context.RouteData.Values["action"]?.ToString() ?? "";
        var role = user.FindFirstValue(ClaimTypes.Role) ?? UserRoles.Customer;
        var staff = user.Identity?.IsAuthenticated == true && role != UserRoles.Customer;
        Guid.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var userId);
        Guid.TryParse(user.FindFirstValue("restaurant_id"), out var tenantId);
        var token = http.Request.Query["accessToken"].FirstOrDefault() ?? http.Request.Headers["X-Resource-Token"].FirstOrDefault();
        Guid? entityTenant = null;
        Guid? owner = null;
        Guid? resourceId = null;
        string? resource = null;
        if (context.ActionArguments.TryGetValue("id", out var value) && value is Guid id)
        {
            resourceId = id;
            switch (controller)
            {
                case "Orders":
                    var order = await db.Orders.AsNoTracking().FirstOrDefaultAsync(x => x.OrderId == id);
                    if (order != null) { entityTenant = order.RestaurantId; owner = order.CustomerId; resource = "order"; }
                    break;
                case "Reservations": entityTenant = (await db.Reservations.AsNoTracking().FirstOrDefaultAsync(x => x.ReservationId == id))?.RestaurantId; break;
                case "Tables": entityTenant = (await db.Tables.AsNoTracking().FirstOrDefaultAsync(x => x.TableId == id))?.RestaurantId; break;
                case "Menu": entityTenant = (await db.MenuItems.AsNoTracking().FirstOrDefaultAsync(x => x.MenuItemId == id))?.RestaurantId; break;
                case "Help":
                    var help = await db.HelpRequests.AsNoTracking().FirstOrDefaultAsync(x => x.RequestId == id);
                    if (help != null) { entityTenant = help.RestaurantId; owner = help.CustomerId; resource = "help"; }
                    break;
                case "Issues": entityTenant = (await db.CustomerIssues.AsNoTracking().FirstOrDefaultAsync(x => x.IssueId == id))?.RestaurantId; break;
            }
        }
        foreach (var arg in context.ActionArguments.Values.Where(x => x != null))
        {
            var property = arg!.GetType().GetProperty("RestaurantId");
            if (property?.GetValue(arg) is Guid requested) entityTenant ??= requested;
        }
        if (Guid.TryParse(http.Request.Query["restaurantId"], out var queryTenant)) entityTenant ??= queryTenant;
        if (staff && role != UserRoles.SuperAdmin && entityTenant.HasValue && entityTenant != tenantId)
        {
            context.Result = new ObjectResult(new { message = "This resource belongs to another restaurant." }) { StatusCode = 403 }; return;
        }
        if (resource != null && !staff)
        {
            var owns = userId != Guid.Empty && owner == userId;
            var permittedCapability = resourceId.HasValue && tokens.Validate(resource, resourceId.Value, token);
            if (!owns && !permittedCapability)
            {
                context.Result = new ObjectResult(new { message = "The access token for this resource is required." }) { StatusCode = 403 }; return;
            }
        }
        // Guest payment initiation requires the capability of the associated order.
        if (controller == "Payments" && action == "Initiate" && !staff)
        {
            var request = context.ActionArguments.Values.OfType<RestaurantSystem.Api.DTOs.InitiatePaymentRequest>().FirstOrDefault();
            var order = request?.OrderId is Guid orderId ? await db.Orders.AsNoTracking().FirstOrDefaultAsync(x => x.OrderId == orderId) : null;
            if (order == null || !(order.CustomerId == userId && userId != Guid.Empty) && !tokens.Validate("order", order.OrderId, token))
            {
                context.Result = new ObjectResult(new { message = "Order access token required to start payment." }) { StatusCode = 403 }; return;
            }
        }
        await next();
    }
}
