namespace RestaurantSystem.Api.Security;

public class TenantIsolationException : Exception
{
    public TenantIsolationException(string message) : base(message) { }
}

public interface ITenantContext
{
    Guid? CurrentUserId { get; }
    Guid? AuthUserId { get; }
    string CurrentRole { get; }
    Guid? RestaurantId { get; }
    bool IsAuthenticated { get; }
    bool IsSuperAdmin { get; }
    bool IsManager { get; }
    bool IsStaff { get; }
    
    void EnforceTenantAccess(Guid? targetRestaurantId);
    Guid GetRequiredRestaurantId();
}
