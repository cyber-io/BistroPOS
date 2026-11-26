using Microsoft.EntityFrameworkCore;
using RestaurantSystem.Api.Models;
using RestaurantSystem.Api.Repositories;

namespace RestaurantSystem.Api.Services;

public static class UserProvisioning
{
    public static readonly Guid DefaultRestaurantId = Guid.Parse("a0000000-0000-0000-0000-000000000001");

    private static readonly SemaphoreSlim _initLock = new(1, 1);
    private static int _initialized;
    public static bool IsInitialized => Volatile.Read(ref _initialized) == 1;

    public const string DefaultAdminEmail = "admin@bistropos.com";
    public const string DefaultAdminPassword = "Admin@12345";

    public static async Task EnsureDefaultDataAsync(RestaurantDbContext db, bool allowDevSeedCredentials = false)
    {
        if (IsInitialized) return;
        await _initLock.WaitAsync();
        try
        {
            if (IsInitialized) return;
            if (db.Database.IsRelational() && !await db.Database.CanConnectAsync())
                return;

            if (db.Database.IsNpgsql())
            {
                try
                {
                    await db.Database.ExecuteSqlRawAsync(@"
                        DO $$
                        BEGIN
                            ALTER TABLE restaurant_pos.users DROP CONSTRAINT IF EXISTS users_role_check;
                            ALTER TABLE restaurant_pos.users ADD CONSTRAINT users_role_check CHECK (role IN ('SUPER_ADMIN', 'MANAGER', 'RECEPTIONIST', 'KITCHEN', 'WAITER', 'CUSTOMER'));
                        EXCEPTION WHEN OTHERS THEN NULL;
                        END $$;
                    ");
                }
                catch { /* Ignore if offline */ }
            }

            const string standardOpeningHours = "{\"monday\": {\"open\": \"10:00\", \"close\": \"23:00\"}, \"tuesday\": {\"open\": \"10:00\", \"close\": \"23:00\"}, \"wednesday\": {\"open\": \"10:00\", \"close\": \"23:00\"}, \"thursday\": {\"open\": \"10:00\", \"close\": \"23:00\"}, \"friday\": {\"open\": \"10:00\", \"close\": \"23:30\"}, \"saturday\": {\"open\": \"10:00\", \"close\": \"23:30\"}, \"sunday\": {\"open\": \"10:00\", \"close\": \"23:00\"}}";

            // 1. Ensure primary active restaurant shell exists
            var primaryRestaurant = await db.Restaurants.FirstOrDefaultAsync(r => r.RestaurantId == DefaultRestaurantId);
            if (primaryRestaurant == null)
            {
                primaryRestaurant = new Restaurant
                {
                    RestaurantId = DefaultRestaurantId,
                    Name = "Bistro & Bloom",
                    Logo = "/favicon.svg",
                    Address = "Plot 42, Gourmet Boulevard, Cyber Hub, Gurugram, HR - 122002",
                    Phone = "+91 98765 43210",
                    Email = "contact@bistropos.com",
                    Status = "ACTIVE",
                    OpeningHours = standardOpeningHours,
                    Settings = "{\"tax_rate\": 0.05, \"delivery_fee\": 40.00, \"currency\": \"INR\"}"
                };
                db.Restaurants.Add(primaryRestaurant);
            }
            else
            {
                if (string.IsNullOrWhiteSpace(primaryRestaurant.OpeningHours))
                {
                    primaryRestaurant.OpeningHours = standardOpeningHours;
                }
            }

            // 2. Clean up any dummy/demo restaurants from previous seeds (Royal Palace, City Restaurant)
            var dummyRestaurantIds = new[]
            {
                Guid.Parse("11111111-1111-1111-1111-111111111111"),
                Guid.Parse("22222222-2222-2222-2222-222222222222")
            };
            var demoRestaurants = await db.Restaurants.Where(r => dummyRestaurantIds.Contains(r.RestaurantId)).ToListAsync();
            if (demoRestaurants.Any())
            {
                db.Restaurants.RemoveRange(demoRestaurants);
            }

            // 3. Clean up any old dummy demo accounts (receptionists, waiters, kitchen, demo managers)
            var dummyEmails = new[]
            {
                "superadmin@sunrisecafe.com",
                "manager@sunrisecafe.com",
                "manager.rahul@royalpalace.com",
                "manager.amit@cityrestaurant.com",
                "receptionist@sunrisecafe.com",
                "kitchen@sunrisecafe.com",
                "waiter.kunal@sunrisecafe.com",
                "waiter@sunrisecafe.com",
                "waiter.priya@sunrisecafe.com",
                "customer.rahul@example.com"
            };
            var demoUsers = await db.Users.Where(u => dummyEmails.Contains(u.Email.ToLower())).ToListAsync();
            if (demoUsers.Any())
            {
                db.Users.RemoveRange(demoUsers);
            }

            await db.SaveChangesAsync();

            // 4. Ensure single, secure Super Admin account exists
            var targetAdminEmail = (Environment.GetEnvironmentVariable("ADMIN_INITIAL_EMAIL") ?? DefaultAdminEmail).Trim().ToLowerInvariant();
            var targetAdminPassword = Environment.GetEnvironmentVariable("ADMIN_INITIAL_PASSWORD") ?? DefaultAdminPassword;

            var existingAdmin = await db.Users.FirstOrDefaultAsync(u => u.Role == UserRoles.SuperAdmin || u.Email.ToLower() == targetAdminEmail);
            if (existingAdmin == null)
            {
                db.Users.Add(new User
                {
                    UserId = Guid.Parse("b0000000-0000-0000-0000-000000000001"),
                    RestaurantId = null, // Platform-wide Super Admin
                    Name = "Super Admin",
                    Email = targetAdminEmail,
                    Phone = "+91 99999 00001",
                    PasswordHash = BCrypt.Net.BCrypt.HashPassword(targetAdminPassword),
                    Role = UserRoles.SuperAdmin,
                    Status = "ACTIVE",
                    EmailVerified = true,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                });
            }
            else
            {
                // Always sync admin credentials to ensure access
                existingAdmin.Email = targetAdminEmail;
                existingAdmin.Role = UserRoles.SuperAdmin;
                existingAdmin.RestaurantId = null;
                existingAdmin.Status = "ACTIVE";
                existingAdmin.EmailVerified = true;
                existingAdmin.PasswordHash = BCrypt.Net.BCrypt.HashPassword(targetAdminPassword);
                existingAdmin.UpdatedAt = DateTime.UtcNow;
            }

            await db.SaveChangesAsync();

            // 5. Ensure table infrastructure for dining operations
            await EnsureRestaurantTablesAsync(db);

            Volatile.Write(ref _initialized, 1);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[UserProvisioning] Note: {ex.Message}");
        }
        finally
        {
            _initLock.Release();
        }
    }

    private static async Task EnsureRestaurantTablesAsync(RestaurantDbContext db)
    {
        var activeRestaurants = await db.Restaurants.Where(r => r.Status == "ACTIVE").ToListAsync();
        if (!activeRestaurants.Any()) return;

        var defaultCapacities = new[] { 2, 2, 4, 4, 4, 6, 6, 8, 2, 4, 4, 8 };

        foreach (var r in activeRestaurants)
        {
            var hasTables = await db.Tables.AnyAsync(t => t.RestaurantId == r.RestaurantId);
            if (!hasTables)
            {
                for (int i = 1; i <= 12; i++)
                {
                    db.Tables.Add(new TableEntity
                    {
                        TableId = Guid.NewGuid(),
                        RestaurantId = r.RestaurantId,
                        TableNumber = i,
                        Capacity = defaultCapacities[i - 1],
                        Status = TableStatuses.Available,
                        QrIdentifier = $"QR_{r.RestaurantId:N}_TBL{i:D02}",
                        DiningArea = (i == 6 || i == 7 || i == 8 || i == 12) ? "group" : "everyday",
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    });
                }
                await db.SaveChangesAsync();
            }
        }
    }
}
