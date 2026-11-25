using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using RestaurantSystem.Api.Models;

namespace RestaurantSystem.Api.Security;

public class TenantContext : ITenantContext
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public TenantContext(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    private ClaimsPrincipal? User => _httpContextAccessor.HttpContext?.User;

    public bool IsAuthenticated => User?.Identity?.IsAuthenticated == true;

    public Guid? CurrentUserId
    {
        get
        {
            var claim = User?.FindFirstValue(ClaimTypes.NameIdentifier);
            return Guid.TryParse(claim, out var id) ? id : null;
        }
    }

    public Guid? AuthUserId
    {
        get
        {
            var claim = User?.FindFirstValue("auth_user_id");
            return Guid.TryParse(claim, out var id) ? id : null;
        }
    }

    public string CurrentRole => User?.FindFirstValue(ClaimTypes.Role) ?? UserRoles.Customer;

    public Guid? RestaurantId
    {
        get
        {
            var claim = User?.FindFirstValue("restaurant_id");
            return Guid.TryParse(claim, out var id) ? id : null;
        }
    }

    public bool IsSuperAdmin => string.Equals(CurrentRole, UserRoles.SuperAdmin, StringComparison.OrdinalIgnoreCase);

    public bool IsManager => string.Equals(CurrentRole, UserRoles.Manager, StringComparison.OrdinalIgnoreCase);

    public bool IsStaff => IsSuperAdmin || IsManager ||
                           string.Equals(CurrentRole, UserRoles.Receptionist, StringComparison.OrdinalIgnoreCase) ||
                           string.Equals(CurrentRole, UserRoles.Kitchen, StringComparison.OrdinalIgnoreCase) ||
                           string.Equals(CurrentRole, UserRoles.Waiter, StringComparison.OrdinalIgnoreCase);

    public void EnforceTenantAccess(Guid? targetRestaurantId)
    {
        if (IsSuperAdmin)
        {
            // Super Admin has global platform-wide access
            return;
        }

        if (IsStaff)
        {
            if (!RestaurantId.HasValue)
            {
                throw new TenantIsolationException("Staff user account is not associated with any restaurant.");
            }

            if (targetRestaurantId.HasValue && targetRestaurantId.Value != RestaurantId.Value)
            {
                throw new TenantIsolationException("Cross-restaurant access is strictly prohibited. Your account is isolated to your assigned restaurant.");
            }
        }
    }

    public Guid GetRequiredRestaurantId()
    {
        if (RestaurantId.HasValue)
        {
            return RestaurantId.Value;
        }

        if (IsSuperAdmin)
        {
            throw new InvalidOperationException("Super Admin must explicitly specify a target restaurant ID for restaurant-scoped operations.");
        }

        throw new TenantIsolationException("Tenant context is required but missing from authenticated credentials.");
    }
}
