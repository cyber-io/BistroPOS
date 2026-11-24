using Microsoft.EntityFrameworkCore;
using RestaurantSystem.Api.Models;
using RestaurantSystem.Api.Repositories;

namespace RestaurantSystem.Api.Services;

public static class UserProvisioning
{
    public static readonly Guid DefaultRestaurantId = Guid.Parse("a0000000-0000-0000-0000-000000000001");
    public static readonly Guid RoyalPalaceRestaurantId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    public static readonly Guid CityRestaurantId = Guid.Parse("22222222-2222-2222-2222-222222222222");

    // BCrypt hash for 'Password@123'
    public const string DefaultPasswordHash = "$2a$11$w8/q3m2eA8zJ5m7nB3r9TuG4h.8Z.u2v8kP.vYg/H8K1.p2wEa2XW";

    public static async Task EnsureDefaultDataAsync(RestaurantDbContext db)
    {
        try
        {
            if (db.Database.IsNpgsql())
            {
                try
                {
                    await db.Database.ExecuteSqlRawAsync(@"
                        DO $$
                        DECLARE
                            r RECORD;
                        BEGIN
                            FOR r IN (
                                SELECT n.nspname AS schemaname, c.conname
                                FROM pg_constraint c
                                JOIN pg_namespace n ON n.oid = c.connamespace
                                WHERE c.conname = 'users_role_check'
                            ) LOOP
                                EXECUTE 'ALTER TABLE ' || quote_ident(r.schemaname) || '.users DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
                            END LOOP;

                            BEGIN
                                ALTER TABLE restaurant_pos.users DROP CONSTRAINT IF EXISTS users_role_check;
                            EXCEPTION WHEN OTHERS THEN NULL;
                            END;

                            BEGIN
                                ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
                            EXCEPTION WHEN OTHERS THEN NULL;
                            END;
                        END $$;
                    ");
                }
                catch { /* Ignore if offline */ }
            }

            var restaurantsToSeed = new[]
            {
                new Restaurant
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
                },
                new Restaurant
                {
                    RestaurantId = RoyalPalaceRestaurantId,
                    Name = "Royal Palace",
                    Logo = "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=300&q=80",
                    Address = "Heritage Mile, Civil Lines, Jaipur, RJ - 302006",
                    Phone = "+91 98000 00001",
                    Email = "contact@royalpalace.com",
                    Status = "ACTIVE",
                    OpeningHours = "{\"monday\": {\"open\": \"11:00\", \"close\": \"23:30\"}}",
                    Settings = "{\"tax_rate\": 0.05, \"delivery_fee\": 50.00, \"currency\": \"INR\"}"
                },
                new Restaurant
                {
                    RestaurantId = CityRestaurantId,
                    Name = "City Restaurant",
                    Logo = "https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=300&q=80",
                    Address = "Inner Circle, Connaught Place, New Delhi, DL - 110001",
                    Phone = "+91 98000 00002",
                    Email = "contact@cityrestaurant.com",
                    Status = "ACTIVE",
                    OpeningHours = "{\"monday\": {\"open\": \"10:00\", \"close\": \"23:00\"}}",
                    Settings = "{\"tax_rate\": 0.05, \"delivery_fee\": 40.00, \"currency\": \"INR\"}"
                }
            };

            foreach (var r in restaurantsToSeed)
            {
                if (!await db.Restaurants.AnyAsync(x => x.RestaurantId == r.RestaurantId))
                {
                    db.Restaurants.Add(r);
                }
            }
            await db.SaveChangesAsync();

            var defaultUsers = new[]
            {
                new User
                {
                    UserId = Guid.Parse("b0000000-0000-0000-0000-000000000001"),
                    RestaurantId = null, // Super Admin is platform-wide
                    Name = "Super Admin",
                    Email = "superadmin@sunrisecafe.com",
                    Phone = "+91 99999 00001",
                    PasswordHash = DefaultPasswordHash,
                    Role = UserRoles.SuperAdmin,
                    Status = "ACTIVE",
                    EmailVerified = true
                },
                new User
                {
                    UserId = Guid.Parse("b0000000-0000-0000-0000-000000000010"),
                    RestaurantId = DefaultRestaurantId,
                    Name = "Rohit Mehta (Manager)",
                    Email = "manager@sunrisecafe.com",
                    Phone = "+91 99999 00010",
                    PasswordHash = DefaultPasswordHash,
                    Role = UserRoles.Manager,
                    Status = "ACTIVE",
                    EmailVerified = true
                },
                new User
                {
                    UserId = Guid.Parse("a1111111-0000-0000-0000-000000000001"),
                    RestaurantId = RoyalPalaceRestaurantId,
                    Name = "Rahul Sharma (Manager)",
                    Email = "manager.rahul@royalpalace.com",
                    Phone = "+91 98111 00001",
                    PasswordHash = DefaultPasswordHash,
                    Role = UserRoles.Manager,
                    Status = "ACTIVE",
                    EmailVerified = true
                },
                new User
                {
                    UserId = Guid.Parse("b2222222-0000-0000-0000-000000000001"),
                    RestaurantId = CityRestaurantId,
                    Name = "Amit Patel (Manager)",
                    Email = "manager.amit@cityrestaurant.com",
                    Phone = "+91 98222 00001",
                    PasswordHash = DefaultPasswordHash,
                    Role = UserRoles.Manager,
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
                    existing.Role = user.Role;
                    existing.RestaurantId = user.RestaurantId;
                    existing.Status = "ACTIVE";
                    existing.EmailVerified = true;
                }
            }

            await db.SaveChangesAsync();

            await EnsureRestaurantDataAsync(db);
        }
        catch (Exception ex)
        {
            // Fallback for migrations / constrained environments
            Console.WriteLine($"[UserProvisioning] Note: {ex.Message}");
        }
    }

    private static async Task EnsureRestaurantDataAsync(RestaurantDbContext db)
    {
        var activeRestaurants = await db.Restaurants.Where(r => r.Status == "ACTIVE").ToListAsync();
        if (!activeRestaurants.Any()) return;

        var defaultCapacities = new[] { 2, 2, 4, 4, 4, 6, 6, 8, 2, 4, 4, 8 };

        // 1. Ensure 12 tables for every active restaurant
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
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    });
                }
                await db.SaveChangesAsync();
            }
        }

        // 2. Ensure menu categories & items for every active restaurant
        var defaultCats = await db.MenuCategories
            .Where(c => c.RestaurantId == DefaultRestaurantId)
            .OrderBy(c => c.SortOrder)
            .ToListAsync();

        var defaultItems = await db.MenuItems
            .Where(m => m.RestaurantId == DefaultRestaurantId)
            .ToListAsync();

        foreach (var r in activeRestaurants)
        {
            if (r.RestaurantId == DefaultRestaurantId) continue;

            var hasCategories = await db.MenuCategories.AnyAsync(c => c.RestaurantId == r.RestaurantId);
            if (!hasCategories && defaultCats.Any())
            {
                var categoryMap = new Dictionary<Guid, Guid>();
                foreach (var cat in defaultCats)
                {
                    var newCatId = Guid.NewGuid();
                    categoryMap[cat.CategoryId] = newCatId;
                    db.MenuCategories.Add(new MenuCategory
                    {
                        CategoryId = newCatId,
                        RestaurantId = r.RestaurantId,
                        Name = cat.Name,
                        Description = cat.Description,
                        SortOrder = cat.SortOrder,
                        Status = "ACTIVE",
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    });
                }
                await db.SaveChangesAsync();

                foreach (var item in defaultItems)
                {
                    if (categoryMap.TryGetValue(item.CategoryId, out var newCatId))
                    {
                        db.MenuItems.Add(new MenuItem
                        {
                            MenuItemId = Guid.NewGuid(),
                            RestaurantId = r.RestaurantId,
                            CategoryId = newCatId,
                            Name = item.Name,
                            Description = item.Description,
                            Price = item.Price,
                            Image = item.Image,
                            VegNonVeg = item.VegNonVeg,
                            Availability = true,
                            SpiceLevel = item.SpiceLevel,
                            IsSweet = item.IsSweet,
                            CustomizationOptions = item.CustomizationOptions,
                            AddOns = item.AddOns,
                            CreatedAt = DateTime.UtcNow,
                            UpdatedAt = DateTime.UtcNow
                        });
                    }
                }
                await db.SaveChangesAsync();
            }
        }
    }
}
