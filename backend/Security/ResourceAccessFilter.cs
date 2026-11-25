using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;
using RestaurantSystem.Api.DTOs;
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

        // Enforce immediate session revocation against live database user status (DISABLED / INACTIVE / deleted).
        if (user.Identity?.IsAuthenticated == true && userId != Guid.Empty)
        {
            var dbStatus = await db.Users.AsNoTracking()
                .Where(u => u.UserId == userId)
                .Select(u => u.Status)
                .FirstOrDefaultAsync();

            if (string.IsNullOrEmpty(dbStatus) ||
                string.Equals(dbStatus, "DISABLED", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(dbStatus, "INACTIVE", StringComparison.OrdinalIgnoreCase))
            {
                context.Result = new ObjectResult(new { message = "Your account is inactive or has been disabled by management." }) { StatusCode = 401 };
                return;
            }
        }
        else if (string.Equals(user.FindFirstValue("status"), "DISABLED", StringComparison.OrdinalIgnoreCase) ||
                 string.Equals(user.FindFirstValue("status"), "INACTIVE", StringComparison.OrdinalIgnoreCase))
        {
            context.Result = new ObjectResult(new { message = "Your account has been disabled by management." }) { StatusCode = 401 };
            return;
        }

        var token = http.Request.Query["accessToken"].FirstOrDefault() ?? http.Request.Headers["X-Resource-Token"].FirstOrDefault();
        Guid? entityTenant = null;
        Guid? owner = null;
        Guid? resourceId = null;
        string? resource = null;

        Guid? routeGuid = null;
        if (context.ActionArguments.TryGetValue("id", out var idVal) && idVal is Guid idGuid)
            routeGuid = idGuid;
        else if (context.ActionArguments.TryGetValue("orderId", out var ordIdVal) && ordIdVal is Guid ordIdGuid)
            routeGuid = ordIdGuid;
        else if (context.ActionArguments.TryGetValue("paymentId", out var payIdVal) && payIdVal is Guid payIdGuid)
            routeGuid = payIdGuid;
        else if (context.ActionArguments.TryGetValue("orderItemId", out var itemIdVal) && itemIdVal is Guid itemIdGuid)
            routeGuid = itemIdGuid;

        if (routeGuid is Guid targetId)
        {
            resourceId = targetId;
            switch (controller)
            {
                case "Orders" when context.ActionArguments.ContainsKey("orderItemId"):
                    resource = "order";
                    var orderItem = await db.OrderItems.AsNoTracking()
                        .Include(oi => oi.Order)
                        .FirstOrDefaultAsync(oi => oi.OrderItemId == targetId);
                    if (orderItem?.Order != null)
                    {
                        entityTenant = orderItem.Order.RestaurantId;
                        owner = orderItem.Order.CustomerId;
                        resourceId = orderItem.Order.OrderId;
                    }
                    break;
                case "Orders":
                    resource = "order";
                    var order = await db.Orders.AsNoTracking().FirstOrDefaultAsync(x => x.OrderId == targetId);
                    if (order != null) { entityTenant = order.RestaurantId; owner = order.CustomerId; }
                    break;
                case "Payments":
                    var payment = await db.Payments.AsNoTracking().FirstOrDefaultAsync(x => x.PaymentId == targetId);
                    if (payment != null) { entityTenant = payment.RestaurantId; }
                    break;
                case "Reservations":
                    entityTenant = (await db.Reservations.AsNoTracking().FirstOrDefaultAsync(x => x.ReservationId == targetId))?.RestaurantId;
                    break;
                case "Tables":
                    entityTenant = (await db.Tables.AsNoTracking().FirstOrDefaultAsync(x => x.TableId == targetId))?.RestaurantId;
                    break;
                case "Restaurants" when !HttpMethods.IsGet(http.Request.Method):
                    entityTenant = targetId;
                    break;
                case "Menu" when action is "UpdateCategory" or "DeleteCategory":
                    entityTenant = (await db.MenuCategories.AsNoTracking().FirstOrDefaultAsync(x => x.CategoryId == targetId))?.RestaurantId;
                    break;
                case "Menu":
                    entityTenant = (await db.MenuItems.AsNoTracking().FirstOrDefaultAsync(x => x.MenuItemId == targetId))?.RestaurantId;
                    break;
                case "Inventory":
                    entityTenant = (await db.InventoryItems.AsNoTracking().FirstOrDefaultAsync(x => x.ItemId == targetId))?.RestaurantId;
                    break;
                case "Waitlist":
                    entityTenant = (await db.WalkInWaitlists.AsNoTracking().FirstOrDefaultAsync(x => x.WaitlistId == targetId))?.RestaurantId;
                    break;
                case "Help":
                    resource = "help";
                    var help = await db.HelpRequests.AsNoTracking().FirstOrDefaultAsync(x => x.RequestId == targetId);
                    if (help != null) { entityTenant = help.RestaurantId; owner = help.CustomerId; }
                    break;
                case "Issues":
                    entityTenant = (await db.CustomerIssues.AsNoTracking().FirstOrDefaultAsync(x => x.IssueId == targetId))?.RestaurantId;
                    break;
                case "Users":
                case "Auth" when action is "UpdateStaffStatus":
                    var targetUser = await db.Users.AsNoTracking().FirstOrDefaultAsync(x => x.UserId == targetId);
                    if (targetUser != null) entityTenant = targetUser.RestaurantId;
                    break;
            }
        }
        else if (controller == "Orders" && context.ActionArguments.TryGetValue("idOrNumber", out var idOrNumObj) && idOrNumObj is string idOrNumber && !string.IsNullOrWhiteSpace(idOrNumber))
        {
            var matchedOrder = Guid.TryParse(idOrNumber, out var parsedOrderId)
                ? await db.Orders.AsNoTracking().FirstOrDefaultAsync(x => x.OrderId == parsedOrderId)
                : await db.Orders.AsNoTracking().FirstOrDefaultAsync(x => x.OrderNumber == idOrNumber);
            if (matchedOrder != null)
            {
                entityTenant = matchedOrder.RestaurantId;
                owner = matchedOrder.CustomerId;
                resourceId = matchedOrder.OrderId;
                resource = "order";
            }
        }

        foreach (var arg in context.ActionArguments.Values.Where(x => x != null))
        {
            var property = arg!.GetType().GetProperty("RestaurantId");
            if (property?.GetValue(arg) is Guid requested && requested != Guid.Empty) entityTenant ??= requested;
        }
        if (Guid.TryParse(http.Request.Query["restaurantId"], out var queryTenant) && queryTenant != Guid.Empty) entityTenant ??= queryTenant;

        if (staff && role != UserRoles.SuperAdmin && entityTenant.HasValue && entityTenant != tenantId)
        {
            context.Result = new ObjectResult(new { message = "This resource belongs to another restaurant." }) { StatusCode = 403 };
            return;
        }

        if (resource != null && !staff)
        {
            var owns = userId != Guid.Empty && owner == userId;
            var permittedCapability = resourceId.HasValue && tokens.Validate(resource, resourceId.Value, token);
            if (!owns && !permittedCapability)
            {
                context.Result = new ObjectResult(new { message = "The access token for this resource is required." }) { StatusCode = 403 };
                return;
            }
        }

        // Guest payment actions require ownership or a valid capability token for the associated order.
        if (controller == "Payments" && action is "Initiate" or "Verify" && !staff)
        {
            Order? order = null;
            if (context.ActionArguments.Values.OfType<InitiatePaymentRequest>().FirstOrDefault() is { OrderId: Guid initOrderId })
            {
                order = await db.Orders.AsNoTracking().FirstOrDefaultAsync(x => x.OrderId == initOrderId);
            }
            else if (context.ActionArguments.Values.OfType<VerifyPaymentRequest>().FirstOrDefault() is { } verifyReq)
            {
                var payment = await db.Payments.AsNoTracking().FirstOrDefaultAsync(p => p.PaymentId == verifyReq.PaymentId);
                if (payment?.OrderId is Guid payOrderId)
                {
                    order = await db.Orders.AsNoTracking().FirstOrDefaultAsync(x => x.OrderId == payOrderId);
                }
            }

            if (order == null || (!(order.CustomerId == userId && userId != Guid.Empty) && !tokens.Validate("order", order.OrderId, token)))
            {
                context.Result = new ObjectResult(new { message = "Order access token required to initiate or verify payment." }) { StatusCode = 403 };
                return;
            }
        }

        await next();
    }
}
