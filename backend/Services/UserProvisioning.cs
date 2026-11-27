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
                            ALTER TABLE restaurant_pos.users ADD COLUMN IF NOT EXISTS employee_code VARCHAR(50);
                            ALTER TABLE restaurant_pos.restaurants ADD COLUMN IF NOT EXISTS restaurant_code VARCHAR(50);
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
                    RestaurantCode = "RST-100",
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
                primaryRestaurant.RestaurantCode ??= "RST-100";
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
                    EmployeeCode = "ADM-1000",
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
                existingAdmin.EmployeeCode ??= "ADM-1000";
                existingAdmin.PasswordHash = BCrypt.Net.BCrypt.HashPassword(targetAdminPassword);
                existingAdmin.UpdatedAt = DateTime.UtcNow;
            }

            await db.SaveChangesAsync();

            // 4.2 Ensure primary Restaurant Manager exists
            const string defaultManagerEmail = "kunalsugandhi007@gmail.com";
            var existingManager = await db.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == defaultManagerEmail);
            if (existingManager == null)
            {
                db.Users.Add(new User
                {
                    UserId = Guid.Parse("9d54a9de-4516-4df7-ad2d-9c96d033d7bc"),
                    RestaurantId = DefaultRestaurantId,
                    Name = "Kunal Sugandhi",
                    Email = defaultManagerEmail,
                    Phone = "9575264633",
                    PasswordHash = BCrypt.Net.BCrypt.HashPassword("Admin@12345"),
                    Role = UserRoles.Manager,
                    EmployeeCode = "MGR-1000",
                    Status = "ACTIVE",
                    EmailVerified = true,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                });
                await db.SaveChangesAsync();
            }
            else
            {
                existingManager.RestaurantId = DefaultRestaurantId;
                existingManager.Role = UserRoles.Manager;
                existingManager.EmployeeCode ??= "MGR-1000";
                existingManager.Status = "ACTIVE";
                await db.SaveChangesAsync();
            }

            // 4.1 Backfill any staff without employee codes sequentially
            var staffWithoutCodes = await db.Users
                .Where(u => u.Role != UserRoles.Customer && (u.EmployeeCode == null || u.EmployeeCode == ""))
                .OrderBy(u => u.CreatedAt)
                .ToListAsync();
            foreach (var staffMember in staffWithoutCodes)
            {
                staffMember.EmployeeCode = await AuthService.GenerateEmployeeCodeAsync(db, staffMember.Role);
                await db.SaveChangesAsync();
            }

            // 4.3 Backfill any restaurants without restaurant codes sequentially
            var restaurantsWithoutCodes = await db.Restaurants
                .Where(r => r.RestaurantCode == null || r.RestaurantCode == "")
                .OrderBy(r => r.CreatedAt)
                .ToListAsync();
            foreach (var rest in restaurantsWithoutCodes)
            {
                rest.RestaurantCode = await GenerateRestaurantCodeAsync(db);
                await db.SaveChangesAsync();
            }

            // 5. Ensure table infrastructure for dining operations
            await EnsureRestaurantTablesAsync(db);

            // 6. Ensure baseline menu categories & dishes if menu is currently empty
            await EnsureRestaurantMenuAsync(db);

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

    private static async Task EnsureRestaurantMenuAsync(RestaurantDbContext db)
    {
        var hasCategories = await db.MenuCategories.AnyAsync(c => c.RestaurantId == DefaultRestaurantId);
        if (hasCategories) return;

        var catPizza = new MenuCategory { CategoryId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, Name = "Pizza", Description = "Wood-fired artisan pizzas", SortOrder = 1, Status = "ACTIVE", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
        var catBurger = new MenuCategory { CategoryId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, Name = "Burger", Description = "Handcrafted burgers on brioche buns", SortOrder = 2, Status = "ACTIVE", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
        var catChinese = new MenuCategory { CategoryId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, Name = "Chinese", Description = "Wok-tossed noodles and appetizers", SortOrder = 3, Status = "ACTIVE", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
        var catIndian = new MenuCategory { CategoryId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, Name = "Indian", Description = "Rich curries, dal makhani and tandoori specials", SortOrder = 4, Status = "ACTIVE", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
        var catSouthIndian = new MenuCategory { CategoryId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, Name = "South Indian", Description = "Crisp dosas and fluffy idlis", SortOrder = 5, Status = "ACTIVE", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
        var catDesserts = new MenuCategory { CategoryId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, Name = "Desserts", Description = "Artisanal desserts and warm sweets", SortOrder = 6, Status = "ACTIVE", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
        var catBeverages = new MenuCategory { CategoryId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, Name = "Beverages", Description = "Signature cold brews, mocktails and teas", SortOrder = 7, Status = "ACTIVE", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };

        db.MenuCategories.AddRange(catPizza, catBurger, catChinese, catIndian, catSouthIndian, catDesserts, catBeverages);
        await db.SaveChangesAsync();

        var items = new List<MenuItem>
        {
            new() { MenuItemId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, CategoryId = catPizza.CategoryId, Name = "Margherita Supreme Pizza", Description = "San Marzano tomato sauce, fresh buffalo mozzarella, organic basil, extra virgin olive oil", Price = 399.00m, Image = "https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?auto=format&fit=crop&w=400&q=80", VegNonVeg = "VEG", Availability = true, SpiceLevel = "NONE", IsSweet = false, CustomizationOptions = "[{\"name\": \"Crust\", \"choices\": [\"Thin Crust\", \"Cheese Burst (+₹60)\"]}]", AddOns = "[{\"name\": \"Extra Mozzarella\", \"price\": 50}]", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new() { MenuItemId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, CategoryId = catPizza.CategoryId, Name = "Spicy Paneer Tikka Pizza", Description = "Tandoori spiced paneer cubes, capsicum, red onions, mozzarella, spicy drizzle", Price = 469.00m, Image = "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=400&q=80", VegNonVeg = "VEG", Availability = true, SpiceLevel = "SPICY", IsSweet = false, CustomizationOptions = "[{\"name\": \"Crust\", \"choices\": [\"Regular\", \"Cheese Burst (+₹60)\"]}]", AddOns = "[{\"name\": \"Extra Paneer\", \"price\": 60}]", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new() { MenuItemId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, CategoryId = catPizza.CategoryId, Name = "BBQ Chicken Feast Pizza", Description = "Smoked BBQ chicken chunks, caramelized onions, smoked gouda & mozzarella", Price = 529.00m, Image = "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=400&q=80", VegNonVeg = "NON_VEG", Availability = true, SpiceLevel = "MEDIUM", IsSweet = false, CustomizationOptions = "[{\"name\": \"Crust\", \"choices\": [\"Thin Crust\", \"Cheese Burst (+₹70)\"]}]", AddOns = "[{\"name\": \"Extra Chicken\", \"price\": 80}]", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new() { MenuItemId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, CategoryId = catBurger.CategoryId, Name = "Crispy Veggie Crunch Burger", Description = "Crispy spiced potato-corn patty, lettuce, tomatoes, secret house chipotle sauce", Price = 219.00m, Image = "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80", VegNonVeg = "VEG", Availability = true, SpiceLevel = "MILD", IsSweet = false, CustomizationOptions = "[{\"name\": \"Bun\", \"choices\": [\"Brioche\", \"Gluten Free (+₹40)\"]}]", AddOns = "[{\"name\": \"Cheddar Cheese Slice\", \"price\": 30}]", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new() { MenuItemId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, CategoryId = catBurger.CategoryId, Name = "Smokey Grilled Chicken Burger", Description = "Tender grilled chicken breast, sharp cheddar, gherkins, caramelized onions, garlic aioli", Price = 319.00m, Image = "https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=400&q=80", VegNonVeg = "NON_VEG", Availability = true, SpiceLevel = "MEDIUM", IsSweet = false, CustomizationOptions = "[{\"name\": \"Bun\", \"choices\": [\"Brioche\", \"Multi-grain\"]}]", AddOns = "[{\"name\": \"Bacon Rashers (Chicken)\", \"price\": 60}]", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new() { MenuItemId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, CategoryId = catChinese.CategoryId, Name = "Chilli Paneer Dry", Description = "Crispy cottage cheese cubes tossed with bell peppers, spring onions, and spicy soy-chilli glaze", Price = 299.00m, Image = "https://images.unsplash.com/photo-1541832676-9b763b0239ab?auto=format&fit=crop&w=400&q=80", VegNonVeg = "VEG", Availability = true, SpiceLevel = "SPICY", IsSweet = false, CustomizationOptions = "[]", AddOns = "[]", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new() { MenuItemId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, CategoryId = catChinese.CategoryId, Name = "Hakka Noodles Wok Special", Description = "Fresh wok-tossed noodles with shredded cabbage, carrots, scallions and aromatic sesame", Price = 249.00m, Image = "https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=400&q=80", VegNonVeg = "VEG", Availability = true, SpiceLevel = "MILD", IsSweet = false, CustomizationOptions = "[{\"name\": \"Variation\", \"choices\": [\"Veg\", \"Egg (+₹30)\", \"Chicken (+₹70)\"]}]", AddOns = "[]", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new() { MenuItemId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, CategoryId = catIndian.CategoryId, Name = "Dal Makhani Bukhara", Description = "Slow-cooked black lentils simmered overnight with butter, cream, and Kashmiri spices", Price = 349.00m, Image = "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=400&q=80", VegNonVeg = "VEG", Availability = true, SpiceLevel = "MILD", IsSweet = false, CustomizationOptions = "[]", AddOns = "[{\"name\": \"Garlic Naan\", \"price\": 60}]", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new() { MenuItemId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, CategoryId = catIndian.CategoryId, Name = "Paneer Butter Masala", Description = "Fresh malai paneer steeped in a rich, buttery, velvety tomato and cashew gravy", Price = 379.00m, Image = "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=400&q=80", VegNonVeg = "VEG", Availability = true, SpiceLevel = "MEDIUM", IsSweet = false, CustomizationOptions = "[]", AddOns = "[{\"name\": \"Butter Roti (2 pcs)\", \"price\": 50}]", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new() { MenuItemId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, CategoryId = catIndian.CategoryId, Name = "Butter Chicken Delhi Special", Description = "Chargrilled boneless chicken tikkas simmered in satin smooth butter tomato sauce", Price = 449.00m, Image = "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=400&q=80", VegNonVeg = "NON_VEG", Availability = true, SpiceLevel = "MEDIUM", IsSweet = false, CustomizationOptions = "[]", AddOns = "[{\"name\": \"Butter Naan (2 pcs)\", \"price\": 80}]", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new() { MenuItemId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, CategoryId = catSouthIndian.CategoryId, Name = "Mysore Masala Dosa", Description = "Golden crispy rice crepe smeared with fiery red garlic-lentil chutney, stuffed with spiced potato mash", Price = 229.00m, Image = "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=400&q=80", VegNonVeg = "VEG", Availability = true, SpiceLevel = "SPICY", IsSweet = false, CustomizationOptions = "[]", AddOns = "[{\"name\": \"Extra Sambar\", \"price\": 25}]", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new() { MenuItemId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, CategoryId = catDesserts.CategoryId, Name = "Warm Gulab Jamun with Rabri", Description = "Two soft golden dumplings soaked in rose-cardamom syrup, crowned with chilled rabri", Price = 179.00m, Image = "https://images.unsplash.com/photo-1593798603546-b302636a0d0d?auto=format&fit=crop&w=400&q=80", VegNonVeg = "VEG", Availability = true, SpiceLevel = "NONE", IsSweet = true, CustomizationOptions = "[]", AddOns = "[{\"name\": \"Pistachio Topping\", \"price\": 20}]", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new() { MenuItemId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, CategoryId = catDesserts.CategoryId, Name = "Belgian Chocolate Lava Cake", Description = "Warm molten chocolate cake with gooey center, served with vanilla gelato", Price = 249.00m, Image = "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=400&q=80", VegNonVeg = "VEG", Availability = true, SpiceLevel = "NONE", IsSweet = true, CustomizationOptions = "[]", AddOns = "[{\"name\": \"Extra Scoop Gelato\", \"price\": 60}]", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new() { MenuItemId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, CategoryId = catBeverages.CategoryId, Name = "Fresh Mint Mojito", Description = "Fresh garden mint, crushed lime, cane sugar, and sparkling soda over ice", Price = 159.00m, Image = "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=400&q=80", VegNonVeg = "VEG", Availability = true, SpiceLevel = "NONE", IsSweet = true, CustomizationOptions = "[]", AddOns = "[]", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new() { MenuItemId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, CategoryId = catBeverages.CategoryId, Name = "Cold Brew Coffee", Description = "18-hour steeped single-origin Arabica cold brew with vanilla cream froth", Price = 199.00m, Image = "https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?auto=format&fit=crop&w=400&q=80", VegNonVeg = "VEG", Availability = true, SpiceLevel = "NONE", IsSweet = false, CustomizationOptions = "[{\"name\": \"Milk\", \"choices\": [\"Whole Milk\", \"Oat Milk (+₹40)\"]}]", AddOns = "[]", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow }
        };

        db.MenuItems.AddRange(items);
        await db.SaveChangesAsync();
    }

    public static async Task<string> GenerateRestaurantCodeAsync(RestaurantDbContext db)
    {
        const string prefix = "RST";
        const string prefixWithDash = "RST-";
        var existingCodes = await db.Restaurants
            .Where(r => r.RestaurantCode != null && r.RestaurantCode.StartsWith(prefixWithDash))
            .Select(r => r.RestaurantCode!)
            .ToListAsync();

        int maxNumber = 99; // Sequence starts from 100 (99 + 1)
        foreach (var code in existingCodes)
        {
            var numPart = code.Substring(prefixWithDash.Length);
            if (int.TryParse(numPart, out var n) && n > maxNumber)
            {
                maxNumber = n;
            }
        }

        return $"{prefix}-{maxNumber + 1}";
    }

    public static async Task<Guid> ResolveRestaurantIdAsync(RestaurantDbContext db, string? idOrCode)
    {
        if (string.IsNullOrWhiteSpace(idOrCode))
            return DefaultRestaurantId;

        if (Guid.TryParse(idOrCode, out var guid) && guid != Guid.Empty)
            return guid;

        var clean = idOrCode.Trim().ToUpperInvariant();
        if (!clean.StartsWith("RST-") && int.TryParse(clean, out _))
            clean = $"RST-{clean}";

        var rest = await db.Restaurants.FirstOrDefaultAsync(r => r.RestaurantCode == clean);
        if (rest != null) return rest.RestaurantId;

        // Support lookup by restaurant name or slug: e.g. "nacl" or "bistro-bloom"
        var rawId = idOrCode.Trim();
        var normalizedSlug = rawId.ToLowerInvariant().Replace("-", " ");
        var normalizedCompact = rawId.ToLowerInvariant().Replace("-", "").Replace(" ", "").Replace("&", "and");

        var allRestaurants = await db.Restaurants.Where(r => r.Status == "ACTIVE").ToListAsync();
        var byName = allRestaurants.FirstOrDefault(r =>
            string.Equals(r.RestaurantCode, rawId, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(r.Name, rawId, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(r.Name.Replace("&", "and").Replace(" ", ""), normalizedCompact, StringComparison.OrdinalIgnoreCase) ||
            r.Name.ToLowerInvariant().Contains(normalizedSlug) ||
            (!string.IsNullOrWhiteSpace(r.Settings) && (
                r.Settings.Contains($"\"subdomain\":\"{rawId}\"", StringComparison.OrdinalIgnoreCase) ||
                r.Settings.Contains($"\"customDomain\":\"{rawId}\"", StringComparison.OrdinalIgnoreCase)
            ))
        );
        if (byName != null) return byName.RestaurantId;

        var activeFallback = await db.Restaurants.Where(r => r.Status == "ACTIVE").Select(r => (Guid?)r.RestaurantId).FirstOrDefaultAsync();
        return activeFallback ?? DefaultRestaurantId;
    }
}
