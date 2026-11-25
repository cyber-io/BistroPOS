using System.IdentityModel.Tokens.Jwt;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using RestaurantSystem.Api.Configuration;
using RestaurantSystem.Api.DTOs;
using RestaurantSystem.Api.Models;
using RestaurantSystem.Api.Repositories;
using RestaurantSystem.Api.Security;

namespace RestaurantSystem.Api.Services;

public class AuthService(
    RestaurantDbContext db,
    IOptions<JwtOptions> jwt,
    IOptions<SupabaseOptions> supabase,
    IOptions<FeaturesOptions> features,
    IHostEnvironment env,
    IHttpClientFactory clients,
    IAuditLogService audit,
    ITenantContext tenant) : IAuthService
{
    public async Task<AuthResponse> RegisterAsync(RegisterRequest request)
    {
        if (!string.IsNullOrEmpty(request.Role) && request.Role != UserRoles.Customer)
            return new(false, "", null, "Staff accounts can only be provisioned by a restaurant administrator.");

        var email = request.Email.Trim().ToLowerInvariant();
        if (await db.Users.AnyAsync(u => u.Email.ToLower() == email))
            return new(false, "", null, "An account already exists with this email.");

        Guid userId = Guid.NewGuid();
        try
        {
            using var response = await SendAuth("signup", new { email, password = request.Password, data = new { name = request.Name.Trim() } });
            if (response.IsSuccessStatusCode)
            {
                using var result = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
                var root = result.RootElement;
                var authUser = root.TryGetProperty("user", out var nested) ? nested : root;
                if (authUser.TryGetProperty("id", out var id) && Guid.TryParse(id.GetString(), out var parsedId))
                {
                    userId = parsedId;
                }
            }
        }
        catch
        {
            // Supabase auth service offline - continue with direct database registration
        }

        var restaurantId = request.RestaurantId ?? await db.Restaurants.Select(x => x.RestaurantId).FirstOrDefaultAsync();
        var user = new User
        {
            UserId = userId,
            RestaurantId = restaurantId == Guid.Empty ? null : restaurantId,
            Name = request.Name.Trim(),
            Email = email,
            Phone = request.Phone?.Trim(),
            Role = UserRoles.Customer,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            EmailVerified = true
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var dto = ToDto(user);
        return new(true, GenerateJwtToken(user), dto, "Registration successful.");
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest request)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var user = await db.Users.FirstOrDefaultAsync(x => x.Email.ToLower() == email);

        if (user != null)
        {
            bool passwordValid = false;
            try
            {
                if (!string.IsNullOrEmpty(user.PasswordHash) && user.PasswordHash != "SUPABASE_MANAGED")
                {
                    passwordValid = BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash);
                }
            }
            catch
            {
                // Invalid or non-standard hash format fails closed
            }

            if (passwordValid)
            {
                return await SignedIn(user, "Login successful.");
            }
        }

        // Optional fallback to Supabase GoTrue Auth service
        try
        {
            using var response = await SendAuth("token?grant_type=password", new { email, password = request.Password });
            if (response.IsSuccessStatusCode)
            {
                using var result = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
                var authUser = result.RootElement.GetProperty("user");
                var authId = authUser.GetProperty("id").GetGuid();
                if (user == null)
                {
                    var restaurantId = await db.Restaurants.Select(x => x.RestaurantId).FirstOrDefaultAsync();
                    user = new User
                    {
                        UserId = authId,
                        Email = email,
                        Name = email.Split('@')[0],
                        Role = UserRoles.Customer,
                        RestaurantId = restaurantId == Guid.Empty ? null : restaurantId,
                        PasswordHash = "SUPABASE_MANAGED",
                        EmailVerified = true
                    };
                    db.Users.Add(user);
                    await db.SaveChangesAsync();
                }
                else if (user.UserId != authId && user.Role != UserRoles.Customer)
                {
                    return new(false, "", null, "This staff profile must be linked to its verified Supabase account by an administrator.");
                }

                if (string.Equals(user.Status, "DISABLED", StringComparison.OrdinalIgnoreCase))
                {
                    return new(false, "", null, "This account has been disabled by management.");
                }

                return await SignedIn(user, "Login successful.");
            }
        }
        catch
        {
            // Supabase service offline or unreachable
        }

        return new(false, "", null, "Invalid email or password.");
    }

    public async Task<AuthResponse> DemoLoginAsync(string role, Guid? restaurantId = null)
    {
        if (!env.IsDevelopment() || !features.Value.EnableDemoLogin)
        {
            return new(false, "", null, "Demonstration login is disabled in this environment.");
        }

        var targetRole = role.Trim().ToUpperInvariant();
        if (targetRole is not (UserRoles.SuperAdmin or UserRoles.Manager or UserRoles.Receptionist or UserRoles.Kitchen or UserRoles.Waiter or UserRoles.Customer))
            return new(false, "", null, "Unknown demo role.");

        if (!UserProvisioning.IsInitialized)
        {
            await UserProvisioning.EnsureDefaultDataAsync(db, allowDevSeedCredentials: true);
        }

        User? user = null;
        if (restaurantId.HasValue && targetRole != UserRoles.SuperAdmin)
        {
            user = await db.Users.FirstOrDefaultAsync(u => u.Role == targetRole && u.RestaurantId == restaurantId.Value);
        }

        if (user == null)
        {
            if (targetRole == UserRoles.Manager)
            {
                // Prefer the default restaurant manager (Rohit Mehta at Bistro & Bloom) matching Receptionist demo experience
                user = await db.Users.FirstOrDefaultAsync(u => u.Role == targetRole && u.RestaurantId == UserProvisioning.DefaultRestaurantId)
                    ?? await db.Users.FirstOrDefaultAsync(u => u.Role == targetRole);
            }
            else
            {
                user = await db.Users.FirstOrDefaultAsync(u => u.Role == targetRole);
            }
        }

        var devSecret = Environment.GetEnvironmentVariable("DEV_DEMO_SEED_PASSWORD") ?? "Password@123";
        if (user == null && targetRole == UserRoles.Manager)
        {
            var firstRestaurant = restaurantId.HasValue
                ? await db.Restaurants.FindAsync(restaurantId.Value)
                : await db.Restaurants.FirstOrDefaultAsync();

            var existingByEmail = await db.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == "manager.rahul@royalpalace.com" || u.Email.ToLower() == "manager@sunrisecafe.com");
            if (existingByEmail != null)
            {
                existingByEmail.Role = UserRoles.Manager;
                existingByEmail.Status = "ACTIVE";
                user = existingByEmail;
            }
            else
            {
                user = new User
                {
                    UserId = Guid.NewGuid(),
                    RestaurantId = firstRestaurant?.RestaurantId,
                    Name = "Rahul Sharma (Manager)",
                    Email = "manager.rahul@royalpalace.com",
                    Phone = "+91 98000 00010",
                    Role = UserRoles.Manager,
                    Status = "ACTIVE",
                    PasswordHash = BCrypt.Net.BCrypt.HashPassword(devSecret),
                    EmailVerified = true
                };
                db.Users.Add(user);
            }

            await db.SaveChangesAsync();
        }

        return user == null
            ? new(false, "", null, "User account not found for this role.")
            : await SignedIn(user, "Local demonstration account.");
    }

    public async Task<UserDto?> GetUserByIdAsync(Guid userId)
    {
        var user = await db.Users.FindAsync(userId);
        return user == null ? null : ToDto(user);
    }

    public async Task<AuthResponse> UpdateProfileAsync(Guid userId, UpdateProfileRequest request)
    {
        var user = await db.Users.FindAsync(userId);
        if (user == null) return new(false, "", null, "User account not found.");
        if (!string.IsNullOrWhiteSpace(request.Name)) user.Name = request.Name.Trim();
        if (request.Phone != null) user.Phone = request.Phone.Trim();
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        await audit.LogAsync(user.RestaurantId, user.UserId, user.Role, "USER_PROFILE_UPDATE", "users");
        return new(true, GenerateJwtToken(user), ToDto(user), "Profile updated successfully.");
    }

    public async Task<(bool Success, StaffDto? Staff, string Message)> CreateStaffAsync(CreateStaffRequest request)
    {
        if (!tenant.IsStaff)
            return (false, null, "Authentication required.");

        var normalizedRole = request.Role.Trim().ToUpperInvariant();

        // Security rule 10: Role restrictions for staff creation
        if (tenant.IsManager)
        {
            if (normalizedRole is not (UserRoles.Receptionist or UserRoles.Kitchen or UserRoles.Waiter))
            {
                return (false, null, "Managers can only create RECEPTIONIST, KITCHEN, or WAITER staff.");
            }
        }
        else if (!tenant.IsSuperAdmin)
        {
            return (false, null, "Only Managers and Super Admins have permission to create staff.");
        }

        // Security rule 10: Automatic tenant inheritance
        Guid targetRestaurantId;
        if (tenant.IsManager)
        {
            targetRestaurantId = tenant.GetRequiredRestaurantId(); // Never trust client-supplied restaurantId
        }
        else // Super Admin
        {
            if (!request.RestaurantId.HasValue && !tenant.RestaurantId.HasValue)
            {
                return (false, null, "A restaurant ID is required when Super Admin creates staff.");
            }
            targetRestaurantId = request.RestaurantId ?? tenant.RestaurantId!.Value;
        }

        var email = request.Email.Trim().ToLowerInvariant();
        if (await db.Users.AnyAsync(u => u.Email.ToLower() == email))
        {
            return (false, null, "An account already exists with this email address.");
        }

        var newUserId = Guid.NewGuid();
        var user = new User
        {
            UserId = newUserId,
            RestaurantId = targetRestaurantId,
            Name = request.Name.Trim(),
            Email = email,
            Phone = request.Phone?.Trim(),
            Role = normalizedRole,
            Status = "ACTIVE",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            EmailVerified = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        db.Users.Add(user);
        await db.SaveChangesAsync();

        await audit.LogAsync(targetRestaurantId, user.UserId, tenant.CurrentRole, "STAFF_CREATED", "users");

        var dto = new StaffDto(user.UserId, user.UserId, user.RestaurantId, user.Name, user.Email, user.Phone, user.Role, user.Status, user.CreatedAt);
        return (true, dto, "Staff account created successfully.");
    }

    public async Task<(bool Success, StaffDto? Manager, string Message)> CreateManagerAsync(CreateManagerRequest request)
    {
        // Security rule: Only SUPER_ADMIN can create a MANAGER
        if (!tenant.IsSuperAdmin)
        {
            return (false, null, "Only SUPER_ADMIN can create a Restaurant Manager.");
        }

        var restaurant = await db.Restaurants.FindAsync(request.RestaurantId);
        if (restaurant == null)
        {
            return (false, null, "Target restaurant not found.");
        }

        var email = request.Email.Trim().ToLowerInvariant();
        if (await db.Users.AnyAsync(u => u.Email.ToLower() == email))
        {
            return (false, null, "An account already exists with this email address.");
        }

        var managerId = Guid.NewGuid();
        var managerUser = new User
        {
            UserId = managerId,
            RestaurantId = request.RestaurantId,
            Name = request.Name.Trim(),
            Email = email,
            Phone = request.Phone?.Trim(),
            Role = UserRoles.Manager,
            Status = "ACTIVE",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            EmailVerified = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        db.Users.Add(managerUser);
        await db.SaveChangesAsync();

        await audit.LogAsync(request.RestaurantId, managerUser.UserId, tenant.CurrentRole, "MANAGER_CREATED", "users");

        var dto = new StaffDto(managerUser.UserId, managerUser.UserId, managerUser.RestaurantId, managerUser.Name, managerUser.Email, managerUser.Phone, managerUser.Role, managerUser.Status, managerUser.CreatedAt);
        return (true, dto, "Restaurant Manager created successfully.");
    }

    public async Task<List<StaffDto>> GetStaffAsync(Guid? restaurantId = null)
    {
        IQueryable<User> query = db.Users.Where(u => u.Role != UserRoles.Customer);

        if (tenant.IsManager)
        {
            var managerTenantId = tenant.GetRequiredRestaurantId();
            query = query.Where(u => u.RestaurantId == managerTenantId);
        }
        else if (tenant.IsSuperAdmin)
        {
            if (restaurantId.HasValue)
            {
                query = query.Where(u => u.RestaurantId == restaurantId.Value);
            }
        }
        else if (tenant.IsStaff)
        {
            var staffTenantId = tenant.GetRequiredRestaurantId();
            query = query.Where(u => u.RestaurantId == staffTenantId);
        }
        else
        {
            return [];
        }

        var staffList = await query
            .OrderBy(u => u.Role)
            .ThenBy(u => u.Name)
            .ToListAsync();

        return staffList.Select(u => new StaffDto(
            u.UserId,
            u.UserId,
            u.RestaurantId,
            u.Name,
            u.Email,
            u.Phone,
            u.Role,
            u.Status,
            u.CreatedAt
        )).ToList();
    }

    public async Task<(bool Success, string Message)> UpdateStaffStatusAsync(Guid staffUserId, string status)
    {
        var normalizedStatus = status.Trim().ToUpperInvariant();
        if (normalizedStatus is not ("ACTIVE" or "DISABLED" or "INACTIVE"))
        {
            return (false, "Status must be ACTIVE or DISABLED.");
        }

        var user = await db.Users.FindAsync(staffUserId);
        if (user == null || user.Role == UserRoles.Customer)
        {
            return (false, "Staff member not found.");
        }

        if (tenant.IsManager)
        {
            var managerTenantId = tenant.GetRequiredRestaurantId();
            if (user.RestaurantId != managerTenantId)
            {
                throw new TenantIsolationException("Cross-restaurant staff modification is strictly prohibited.");
            }

            if (user.Role is UserRoles.SuperAdmin or UserRoles.Manager)
            {
                return (false, "Managers cannot modify status of other Manager or Super Admin accounts.");
            }
        }
        else if (!tenant.IsSuperAdmin)
        {
            return (false, "Insufficient permissions to change staff status.");
        }

        user.Status = normalizedStatus;
        user.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();

        await audit.LogAsync(user.RestaurantId, user.UserId, tenant.CurrentRole, $"STAFF_STATUS_{normalizedStatus}", "users");

        return (true, $"Staff status successfully updated to {normalizedStatus}.");
    }

    public async Task<CurrentUserContextDto?> GetCurrentUserContextAsync()
    {
        if (!tenant.IsAuthenticated || !tenant.CurrentUserId.HasValue)
            return null;

        var user = await db.Users.FindAsync(tenant.CurrentUserId.Value);
        if (user == null) return null;

        return new CurrentUserContextDto(
            user.UserId,
            user.RestaurantId,
            user.Name,
            user.Email,
            user.Role,
            user.Status,
            tenant.IsSuperAdmin,
            tenant.IsManager
        );
    }

    private async Task<AuthResponse> SignedIn(User user, string message)
    {
        if (string.Equals(user.Status, "DISABLED", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(user.Status, "INACTIVE", StringComparison.OrdinalIgnoreCase))
        {
            return new(false, "", null, "This account has been disabled by management.");
        }

        await audit.LogAsync(user.RestaurantId, user.UserId, user.Role, "USER_LOGIN", "users");
        return new(true, GenerateJwtToken(user), ToDto(user), message);
    }

    private async Task<HttpResponseMessage> SendAuth(string path, object body)
    {
        var client = clients.CreateClient();
        client.Timeout = TimeSpan.FromSeconds(8);
        client.DefaultRequestHeaders.Add("apikey", supabase.Value.AnonKey);
        try
        {
            return await client.PostAsJsonAsync($"{supabase.Value.Url.TrimEnd('/')}/auth/v1/{path}", body);
        }
        catch (HttpRequestException)
        {
            throw new InvalidOperationException("Supabase Authentication is unavailable. Start the Supabase gateway or configure Supabase:Url and Supabase:AnonKey.");
        }
        catch (TaskCanceledException)
        {
            throw new InvalidOperationException("Supabase Authentication timed out. Check the configured provider.");
        }
    }

    private static UserDto ToDto(User u) => new(u.UserId, u.RestaurantId, u.Name, u.Email, u.Phone, u.Role, u.Status);

    private string GenerateJwtToken(User user)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.UserId.ToString()),
            new("auth_user_id", user.UserId.ToString()),
            new(ClaimTypes.Name, user.Name),
            new(ClaimTypes.Email, user.Email),
            new(ClaimTypes.Role, user.Role),
            new("status", user.Status)
        };

        if (user.RestaurantId.HasValue)
        {
            claims.Add(new("restaurant_id", user.RestaurantId.Value.ToString()));
        }

        if (string.IsNullOrWhiteSpace(jwt.Value.SecretKey) || jwt.Value.SecretKey.Length < 32)
        {
            throw new InvalidOperationException("Jwt:SecretKey must be configured with at least 32 characters.");
        }

        return new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(
            jwt.Value.Issuer,
            jwt.Value.Audience,
            claims,
            expires: DateTime.UtcNow.AddMinutes(jwt.Value.ExpiryMinutes),
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.Value.SecretKey)),
                SecurityAlgorithms.HmacSha256
            )
        ));
    }
}
