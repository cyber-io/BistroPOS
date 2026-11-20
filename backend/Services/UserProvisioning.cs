using Microsoft.EntityFrameworkCore;
using RestaurantSystem.Api.Models;
using RestaurantSystem.Api.Repositories;

namespace RestaurantSystem.Api.Services;

public static class UserProvisioning
{
    public static readonly Guid DefaultRestaurantId = Guid.Parse("a0000000-0000-0000-0000-000000000001");
    // BCrypt hash for 'Password@123'
    public const string DefaultPasswordHash = "$2a$11$w8/q3m2eA8zJ5m7nB3r9TuG4h.8Z.u2v8kP.vYg/H8K1.p2wEa2XW";

    public static async Task EnsureDefaultDataAsync(RestaurantDbContext db)
    {
        try
        {
            if (!await db.Restaurants.AnyAsync(r => r.RestaurantId == DefaultRestaurantId))
            {
                var restaurant = new Restaurant
                {
                    RestaurantId = DefaultRestaurantId,
                    Name = "Bistro & Bloom",
                    Logo = "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=300&q=80",
                    Address = "Plot 42, Gourmet Boulevard, Cyber Hub, Gurugram, HR - 122002",
                    Phone = "+91 98765 43210",
                    Email = "contact@sunrisecafe.com",
                    Status = "ACTIVE",
                    OpeningHours = "{\"monday\": {\"open\": \"10:00\", \"close\": \"23:00\"}}",
                    Settings = "{\"tax_rate\": 0.05, \"delivery_fee\": 40.00, \"currency\": \"INR\"}"
                };
                db.Restaurants.Add(restaurant);
                await db.SaveChangesAsync();
            }

            var defaultUsers = new[]
            {
                new User
                {
                    UserId = Guid.Parse("b0000000-0000-0000-0000-000000000001"),
                    RestaurantId = DefaultRestaurantId,
                    Name = "Super Admin Admin",
                    Email = "superadmin@sunrisecafe.com",
                    Phone = "+91 99999 00001",
                    PasswordHash = DefaultPasswordHash,
                    Role = UserRoles.SuperAdmin,
                    Status = "ACTIVE",
                    EmailVerified = true
                },
                new User
                {
                    UserId = Guid.Parse("b0000000-0000-0000-0000-000000000002"),
                    RestaurantId = DefaultRestaurantId,
                    Name = "Ananya Sharma (Receptionist)",
                    Email = "receptionist@sunrisecafe.com",
                    Phone = "+91 99999 00002",
                    PasswordHash = DefaultPasswordHash,
                    Role = UserRoles.Receptionist,
                    Status = "ACTIVE",
                    EmailVerified = true
                },
                new User
                {
                    UserId = Guid.Parse("b0000000-0000-0000-0000-000000000003"),
                    RestaurantId = DefaultRestaurantId,
                    Name = "Chef Vikram (Kitchen Head)",
                    Email = "kitchen@sunrisecafe.com",
                    Phone = "+91 99999 00003",
                    PasswordHash = DefaultPasswordHash,
                    Role = UserRoles.Kitchen,
                    Status = "ACTIVE",
                    EmailVerified = true
                },
                new User
                {
                    UserId = Guid.Parse("b0000000-0000-0000-0000-000000000004"),
                    RestaurantId = DefaultRestaurantId,
                    Name = "Waiter Kunal",
                    Email = "waiter.kunal@sunrisecafe.com",
                    Phone = "+91 99999 00004",
                    PasswordHash = DefaultPasswordHash,
                    Role = UserRoles.Waiter,
                    Status = "ACTIVE",
                    EmailVerified = true
                },
                new User
                {
                    UserId = Guid.Parse("b0000000-0000-0000-0000-000000000007"),
                    RestaurantId = DefaultRestaurantId,
                    Name = "Waiter",
                    Email = "waiter@sunrisecafe.com",
                    Phone = "+91 99999 00004",
                    PasswordHash = DefaultPasswordHash,
                    Role = UserRoles.Waiter,
                    Status = "ACTIVE",
                    EmailVerified = true
                },
                new User
                {
                    UserId = Guid.Parse("b0000000-0000-0000-0000-000000000005"),
                    RestaurantId = DefaultRestaurantId,
                    Name = "Waiter Priya",
                    Email = "waiter.priya@sunrisecafe.com",
                    Phone = "+91 99999 00005",
                    PasswordHash = DefaultPasswordHash,
                    Role = UserRoles.Waiter,
                    Status = "ACTIVE",
                    EmailVerified = true
                },
                new User
                {
                    UserId = Guid.Parse("b0000000-0000-0000-0000-000000000006"),
                    RestaurantId = DefaultRestaurantId,
                    Name = "Rahul Verma (Customer)",
                    Email = "customer.rahul@example.com",
                    Phone = "+91 98888 77777",
                    PasswordHash = DefaultPasswordHash,
                    Role = UserRoles.Customer,
                    Status = "ACTIVE",
                    EmailVerified = true
                }
            };

            foreach (var user in defaultUsers)
            {
                var existing = await db.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == user.Email.ToLower());
                if (existing == null)
                {
                    db.Users.Add(user);
                }
                else
                {
                    if (string.IsNullOrEmpty(existing.PasswordHash) || existing.PasswordHash == "SUPABASE_MANAGED")
                    {
                        existing.PasswordHash = DefaultPasswordHash;
                    }
                    existing.Status = "ACTIVE";
                    existing.EmailVerified = true;
                }
            }

            await db.SaveChangesAsync();
        }
        catch
        {
            // Fallback for migrations / constrained environments
        }
    }
}
