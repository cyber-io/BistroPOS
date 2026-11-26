using Microsoft.EntityFrameworkCore;
using RestaurantSystem.Api.Models;
using RestaurantSystem.Api.Repositories;

namespace RestaurantSystem.Api.Services;

public static class UserProvisioning
{
    public static readonly Guid DefaultRestaurantId = Guid.Parse("a0000000-0000-0000-0000-000000000001");
    public static readonly Guid RoyalPalaceRestaurantId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    public static readonly Guid CityRestaurantId = Guid.Parse("22222222-2222-2222-2222-222222222222");

    private static readonly SemaphoreSlim _initLock = new(1, 1);
    private static int _initialized;
    public static bool IsInitialized => Volatile.Read(ref _initialized) == 1;

    private const string LegacyPlaceholderHash = "$2a$11$w8/q3m2eA8zJ5m7nB3r9TuG4h.8Z.u2v8kP.vYg/H8K1.p2wEa2XW";

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

            if (!allowDevSeedCredentials)
            {
                await EnsureRestaurantDataAsync(db);
                Volatile.Write(ref _initialized, 1);
                return;
            }

            var devPasswordHash = BCrypt.Net.BCrypt.HashPassword(
                Environment.GetEnvironmentVariable("DEV_DEMO_SEED_PASSWORD") ?? "Password@123");

            const string fullOpeningHours = "{\"monday\": {\"open\": \"10:00\", \"close\": \"23:00\"}, \"tuesday\": {\"open\": \"10:00\", \"close\": \"23:00\"}, \"wednesday\": {\"open\": \"10:00\", \"close\": \"23:00\"}, \"thursday\": {\"open\": \"10:00\", \"close\": \"23:00\"}, \"friday\": {\"open\": \"10:00\", \"close\": \"23:30\"}, \"saturday\": {\"open\": \"10:00\", \"close\": \"23:30\"}, \"sunday\": {\"open\": \"10:00\", \"close\": \"23:00\"}}";
            const string palaceOpeningHours = "{\"monday\": {\"open\": \"11:00\", \"close\": \"23:30\"}, \"tuesday\": {\"open\": \"11:00\", \"close\": \"23:30\"}, \"wednesday\": {\"open\": \"11:00\", \"close\": \"23:30\"}, \"thursday\": {\"open\": \"11:00\", \"close\": \"23:30\"}, \"friday\": {\"open\": \"11:00\", \"close\": \"23:30\"}, \"saturday\": {\"open\": \"11:00\", \"close\": \"23:30\"}, \"sunday\": {\"open\": \"11:00\", \"close\": \"23:30\"}}";

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
                    OpeningHours = fullOpeningHours,
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
                    OpeningHours = palaceOpeningHours,
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
                    OpeningHours = fullOpeningHours,
                    Settings = "{\"tax_rate\": 0.05, \"delivery_fee\": 40.00, \"currency\": \"INR\"}"
                }
            };

            foreach (var r in restaurantsToSeed)
            {
                var existing = await db.Restaurants.FirstOrDefaultAsync(x => x.RestaurantId == r.RestaurantId);
                if (existing == null)
                {
                    db.Restaurants.Add(r);
                }
                else if (string.IsNullOrWhiteSpace(existing.OpeningHours) || !existing.OpeningHours.Contains("sunday"))
                {
                    existing.OpeningHours = r.OpeningHours;
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
                    PasswordHash = devPasswordHash,
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
                    PasswordHash = devPasswordHash,
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
                    PasswordHash = devPasswordHash,
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
                    PasswordHash = devPasswordHash,
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
                    PasswordHash = devPasswordHash,
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
                    PasswordHash = devPasswordHash,
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
                    PasswordHash = devPasswordHash,
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
                    PasswordHash = devPasswordHash,
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
                    PasswordHash = devPasswordHash,
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
                    PasswordHash = devPasswordHash,
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
                    if (string.IsNullOrEmpty(existing.PasswordHash) ||
                        existing.PasswordHash == "SUPABASE_MANAGED" ||
                        existing.PasswordHash == LegacyPlaceholderHash)
                    {
                        existing.PasswordHash = devPasswordHash;
                    }
                    existing.Role = user.Role;
                    existing.RestaurantId = user.RestaurantId;
                    existing.Status = "ACTIVE";
                    existing.EmailVerified = true;
                }
            }

            await db.SaveChangesAsync();
            await EnsureRestaurantDataAsync(db);
            Volatile.Write(ref _initialized, 1);
        }
        catch (Exception ex)
        {
            // Fallback for migrations / constrained environments
            Console.WriteLine($"[UserProvisioning] Note: {ex.Message}");
        }
        finally
        {
            _initLock.Release();
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
                        DiningArea = (i == 6 || i == 7 || i == 8 || i == 12) ? "group" : "everyday",
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    });
                }
                await db.SaveChangesAsync();
            }
        }

        // 2. Ensure menu categories & items for every active restaurant
        if (!await db.MenuCategories.AnyAsync(c => c.RestaurantId == DefaultRestaurantId))
        {
            await SeedDefaultMenuForDefaultRestaurantAsync(db);
        }

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

    public static async Task EnsurePhase1MenuDataAsync(RestaurantDbContext db)
    {
        var items = await db.MenuItems.ToListAsync();
        if (!items.Any()) return;

        var changed = false;
        foreach (var item in items)
        {
            var name = item.Name.ToLowerInvariant();
            if (string.IsNullOrEmpty(item.Ingredients) || item.Allergens == "[]" || string.IsNullOrEmpty(item.Portions) || item.Portions == "[]")
            {
                changed = true;
                if (name.Contains("margherita"))
                {
                    item.Allergens = "[\"Dairy\", \"Gluten\"]";
                    item.Ingredients = "San Marzano tomatoes, fresh buffalo mozzarella, handpicked basil, cold-pressed olive oil, wheat flour";
                    item.Portions = "[{\"name\": \"Regular (8 inch)\", \"price\": 399.00}, {\"name\": \"Large (12 inch)\", \"price\": 599.00}]";
                    item.DietaryTags = "[\"Vegetarian\", \"Classic\"]";
                    item.IsSpecial = false;
                    item.PrepTimeMinutes = 15;
                }
                else if (name.Contains("paneer tikka pizza"))
                {
                    item.Allergens = "[\"Dairy\", \"Gluten\"]";
                    item.Ingredients = "Tandoori marinated cottage cheese, bell peppers, red onions, mozzarella, house spicy makhani drizzle";
                    item.Portions = "[{\"name\": \"Regular (8 inch)\", \"price\": 469.00}, {\"name\": \"Large (12 inch)\", \"price\": 689.00}]";
                    item.DietaryTags = "[\"Vegetarian\", \"Spicy\"]";
                    item.IsSpecial = true;
                    item.PrepTimeMinutes = 18;
                }
                else if (name.Contains("bbq chicken"))
                {
                    item.Allergens = "[\"Dairy\", \"Gluten\"]";
                    item.Ingredients = "Smoked chicken breast, sweet hickory glaze, caramelized shallots, smoked gouda, mozzarella";
                    item.Portions = "[{\"name\": \"Regular (8 inch)\", \"price\": 529.00}, {\"name\": \"Large (12 inch)\", \"price\": 769.00}]";
                    item.DietaryTags = "[\"Chef Special\", \"High Protein\"]";
                    item.IsSpecial = true;
                    item.PrepTimeMinutes = 20;
                }
                else if (name.Contains("veggie crunch burger"))
                {
                    item.Allergens = "[\"Gluten\", \"Dairy\"]";
                    item.Ingredients = "Crispy spiced potato-corn patty, garden lettuce, vine tomatoes, chipotle aioli, brioche bun";
                    item.Portions = "[{\"name\": \"Single Patty\", \"price\": 219.00}, {\"name\": \"Double Patty\", \"price\": 299.00}]";
                    item.DietaryTags = "[\"Vegetarian\", \"Crispy\"]";
                    item.IsSpecial = false;
                    item.PrepTimeMinutes = 12;
                }
                else if (name.Contains("grilled chicken burger"))
                {
                    item.Allergens = "[\"Gluten\", \"Dairy\"]";
                    item.Ingredients = "Chargrilled boneless chicken breast, aged cheddar, gherkins, caramelized onions, roasted garlic aioli";
                    item.Portions = "[{\"name\": \"Single Patty\", \"price\": 319.00}, {\"name\": \"Double Patty\", \"price\": 429.00}]";
                    item.DietaryTags = "[\"High Protein\", \"Bestseller\"]";
                    item.IsSpecial = true;
                    item.PrepTimeMinutes = 15;
                }
                else if (name.Contains("chilli paneer"))
                {
                    item.Allergens = "[\"Soy\", \"Dairy\", \"Gluten\"]";
                    item.Ingredients = "Crispy cottage cheese cubes, capsicum, scallions, ginger, dark soy sauce, hot chilli reduction";
                    item.Portions = "[{\"name\": \"Half Portion\", \"price\": 199.00}, {\"name\": \"Full Portion\", \"price\": 299.00}]";
                    item.DietaryTags = "[\"Vegetarian\", \"Spicy Indo-Chinese\"]";
                    item.IsSpecial = false;
                    item.PrepTimeMinutes = 12;
                }
                else if (name.Contains("noodles"))
                {
                    item.Allergens = "[\"Gluten\", \"Soy\", \"Sesame\"]";
                    item.Ingredients = "Artisan wheat noodles, shredded cabbage, carrots, scallions, toasted sesame oil, light soy";
                    item.Portions = "[{\"name\": \"Half Portion\", \"price\": 169.00}, {\"name\": \"Full Portion\", \"price\": 249.00}]";
                    item.DietaryTags = "[\"Vegan Option\", \"Wok Tossed\"]";
                    item.IsSpecial = false;
                    item.PrepTimeMinutes = 14;
                }
                else if (name.Contains("dal makhani"))
                {
                    item.Allergens = "[\"Dairy\"]";
                    item.Ingredients = "Urad lentils, kidney beans, churned butter, fresh dairy cream, slow-simmered over charcoal embers for 18 hours";
                    item.Portions = "[{\"name\": \"Half (350ml)\", \"price\": 229.00}, {\"name\": \"Full (600ml)\", \"price\": 349.00}]";
                    item.DietaryTags = "[\"Vegetarian\", \"Gluten-Free\", \"Iconic Recipe\"]";
                    item.IsSpecial = true;
                    item.PrepTimeMinutes = 10;
                }
                else if (name.Contains("paneer butter"))
                {
                    item.Allergens = "[\"Dairy\", \"Nuts\"]";
                    item.Ingredients = "Organic cottage cheese, satin-smooth cashew-tomato velouté, kasuri methi, churned white butter";
                    item.Portions = "[{\"name\": \"Half Portion\", \"price\": 249.00}, {\"name\": \"Full Portion\", \"price\": 379.00}]";
                    item.DietaryTags = "[\"Vegetarian\", \"Gluten-Free\", \"Royal North Indian\"]";
                    item.IsSpecial = false;
                    item.PrepTimeMinutes = 15;
                }
                else if (name.Contains("butter chicken"))
                {
                    item.Allergens = "[\"Dairy\", \"Nuts\"]";
                    item.Ingredients = "Clay-oven roasted chicken morsels, rich aromatic tomato-cashew satin gravy, dried fenugreek, butter";
                    item.Portions = "[{\"name\": \"Half Portion\", \"price\": 299.00}, {\"name\": \"Full Portion\", \"price\": 449.00}]";
                    item.DietaryTags = "[\"Non-Veg\", \"Gluten-Free\", \"House Signature\"]";
                    item.IsSpecial = true;
                    item.PrepTimeMinutes = 15;
                }
                else if (name.Contains("dosa"))
                {
                    item.Allergens = "[]";
                    item.Ingredients = "Fermented stone-ground rice & urad batter, fiery Mysore red chilli-garlic paste, spiced potato mash";
                    item.Portions = "[{\"name\": \"Regular\", \"price\": 229.00}]";
                    item.DietaryTags = "[\"Vegan\", \"Gluten-Free\", \"South Indian Special\"]";
                    item.IsSpecial = false;
                    item.PrepTimeMinutes = 12;
                }
                else if (name.Contains("idli"))
                {
                    item.Allergens = "[\"Dairy\"]";
                    item.Ingredients = "Steamed rice button idlis, pure A2 desi ghee, roasted spiced lentil podi gunpowder";
                    item.Portions = "[{\"name\": \"Small (4 pcs)\", \"price\": 129.00}, {\"name\": \"Full (8 pcs)\", \"price\": 189.00}]";
                    item.DietaryTags = "[\"Vegetarian\", \"Gluten-Free\"]";
                    item.IsSpecial = false;
                    item.PrepTimeMinutes = 10;
                }
                else if (name.Contains("gulab jamun"))
                {
                    item.Allergens = "[\"Dairy\", \"Nuts\", \"Gluten\"]";
                    item.Ingredients = "Khoya dumplings, green cardamom, rose petal syrup, slow-reduced malai rabri, roasted pistachios";
                    item.Portions = "[{\"name\": \"2 Pieces with Rabri\", \"price\": 179.00}]";
                    item.DietaryTags = "[\"Vegetarian\", \"Traditional Sweet\"]";
                    item.IsSpecial = false;
                    item.PrepTimeMinutes = 5;
                }
                else if (name.Contains("lava cake"))
                {
                    item.Allergens = "[\"Dairy\", \"Gluten\", \"Eggs\"]";
                    item.Ingredients = "Callebaut Belgian dark chocolate, sweet butter, Madagascan vanilla beans, freshly churned gelato";
                    item.Portions = "[{\"name\": \"Single Cake + Gelato\", \"price\": 249.00}]";
                    item.DietaryTags = "[\"Decadent Dessert\", \"Freshly Baked\"]";
                    item.IsSpecial = true;
                    item.PrepTimeMinutes = 15;
                }
                else if (name.Contains("mojito"))
                {
                    item.Allergens = "[]";
                    item.Ingredients = "Fresh organic spearmint, Key limes, unrefined cane sugar syrup, sparkling mineral water, crushed ice";
                    item.Portions = "[{\"name\": \"Glass (350ml)\", \"price\": 159.00}, {\"name\": \"Pitcher (1 Litre)\", \"price\": 389.00}]";
                    item.DietaryTags = "[\"Vegan\", \"Gluten-Free\", \"Refreshing Mocktail\"]";
                    item.IsSpecial = false;
                    item.PrepTimeMinutes = 5;
                }
                else
                {
                    item.Allergens = "[]";
                    item.Ingredients = "Fresh locally sourced ingredients, aromatic spices and house chef seasoning";
                    item.Portions = $"[{{\"name\": \"Half\", \"price\": {item.Price * 0.65m:0.00}}}, {{\"name\": \"Full\", \"price\": {item.Price:0.00}}}]";
                    item.DietaryTags = item.VegNonVeg == "VEG" ? "[\"Vegetarian\"]" : "[\"Non-Veg\"]";
                    item.IsSpecial = false;
                    item.PrepTimeMinutes = 15;
                }
            }
        }

        if (changed)
        {
            await db.SaveChangesAsync();
        }
    }

    private static async Task SeedDefaultMenuForDefaultRestaurantAsync(RestaurantDbContext db)
    {
        var catPizza = new MenuCategory { CategoryId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, Name = "Pizza", Description = "Wood-fired gourmet artisan pizzas", SortOrder = 1, Status = "ACTIVE", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
        var catBurger = new MenuCategory { CategoryId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, Name = "Burger", Description = "Juicy handcrafted burgers on brioche buns", SortOrder = 2, Status = "ACTIVE", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
        var catChinese = new MenuCategory { CategoryId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, Name = "Chinese", Description = "Wok-tossed noodles, dim sums & spicy gravies", SortOrder = 3, Status = "ACTIVE", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
        var catIndian = new MenuCategory { CategoryId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, Name = "Indian", Description = "Rich aromatic curries, breads, and tandoori specials", SortOrder = 4, Status = "ACTIVE", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
        var catSouthIndian = new MenuCategory { CategoryId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, Name = "South Indian", Description = "Crisp dosas, fluffy idlis, and traditional chutneys", SortOrder = 5, Status = "ACTIVE", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
        var catNorthIndian = new MenuCategory { CategoryId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, Name = "North Indian", Description = "Dal makhani, paneer tikka, and butter naan", SortOrder = 6, Status = "ACTIVE", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
        var catDesserts = new MenuCategory { CategoryId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, Name = "Desserts", Description = "Decadent sweets, gulab jamun, and artisanal cakes", SortOrder = 7, Status = "ACTIVE", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
        var catBeverages = new MenuCategory { CategoryId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, Name = "Beverages", Description = "Specialty coffees, fresh mocktails, and shakes", SortOrder = 8, Status = "ACTIVE", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };

        db.MenuCategories.AddRange(catPizza, catBurger, catChinese, catIndian, catSouthIndian, catNorthIndian, catDesserts, catBeverages);
        await db.SaveChangesAsync();

        var items = new List<MenuItem>
        {
            new() { MenuItemId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, CategoryId = catPizza.CategoryId, Name = "Margherita Supreme Pizza", Description = "San Marzano tomato sauce, fresh mozzarella, organic basil, extra virgin olive oil", Price = 399.00m, Image = "https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?auto=format&fit=crop&w=400&q=80", VegNonVeg = "VEG", Availability = true, SpiceLevel = "NONE", IsSweet = false, CustomizationOptions = "[{\"name\": \"Crust\", \"choices\": [\"Thin Crust\", \"Cheese Burst (+₹60)\", \"Wheat Crust\"]}]", AddOns = "[{\"name\": \"Extra Mozzarella\", \"price\": 50}, {\"name\": \"Jalapenos\", \"price\": 30}]", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new() { MenuItemId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, CategoryId = catPizza.CategoryId, Name = "Spicy Paneer Tikka Pizza", Description = "Tandoori spiced paneer cubes, capsicum, red onions, mozzarella, spicy drizzle", Price = 469.00m, Image = "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=400&q=80", VegNonVeg = "VEG", Availability = true, SpiceLevel = "SPICY", IsSweet = false, CustomizationOptions = "[{\"name\": \"Crust\", \"choices\": [\"Regular\", \"Cheese Burst (+₹60)\"]}]", AddOns = "[{\"name\": \"Extra Paneer\", \"price\": 60}]", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new() { MenuItemId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, CategoryId = catPizza.CategoryId, Name = "BBQ Chicken Feast Pizza", Description = "Smoked BBQ chicken chunks, caramelized onions, smoked gouda & mozzarella", Price = 529.00m, Image = "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=400&q=80", VegNonVeg = "NON_VEG", Availability = true, SpiceLevel = "MEDIUM", IsSweet = false, CustomizationOptions = "[{\"name\": \"Crust\", \"choices\": [\"Thin Crust\", \"Cheese Burst (+₹70)\"]}]", AddOns = "[{\"name\": \"Extra Chicken\", \"price\": 80}]", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new() { MenuItemId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, CategoryId = catBurger.CategoryId, Name = "Crispy Veggie Crunch Burger", Description = "Crispy spiced potato-corn patty, lettuce, tomatoes, secret house chipotle sauce", Price = 219.00m, Image = "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80", VegNonVeg = "VEG", Availability = true, SpiceLevel = "MILD", IsSweet = false, CustomizationOptions = "[{\"name\": \"Bun\", \"choices\": [\"Brioche\", \"Gluten Free (+₹40)\"]}]", AddOns = "[{\"name\": \"Cheddar Cheese Slice\", \"price\": 30}, {\"name\": \"Peri-peri Fries Combo\", \"price\": 99}]", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new() { MenuItemId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, CategoryId = catBurger.CategoryId, Name = "Smokey Grilled Chicken Burger", Description = "Tender grilled chicken breast, sharp cheddar, gherkins, caramelized onions, garlic aioli", Price = 319.00m, Image = "https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=400&q=80", VegNonVeg = "NON_VEG", Availability = true, SpiceLevel = "MEDIUM", IsSweet = false, CustomizationOptions = "[{\"name\": \"Bun\", \"choices\": [\"Brioche\", \"Multi-grain\"]}]", AddOns = "[{\"name\": \"Bacon Rashers (Chicken)\", \"price\": 60}]", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new() { MenuItemId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, CategoryId = catChinese.CategoryId, Name = "Chilli Paneer Dry", Description = "Crispy cottage cheese cubes tossed with bell peppers, spring onions, and spicy soy-chilli glaze", Price = 299.00m, Image = "https://images.unsplash.com/photo-1541832676-9b763b0239ab?auto=format&fit=crop&w=400&q=80", VegNonVeg = "VEG", Availability = true, SpiceLevel = "SPICY", IsSweet = false, CustomizationOptions = "[{\"name\": \"Style\", \"choices\": [\"Dry\", \"Semi-Gravy\", \"Gravy\"]}]", AddOns = "[]", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new() { MenuItemId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, CategoryId = catChinese.CategoryId, Name = "Hakka Noodles Wok Special", Description = "Fresh wok-tossed egg/veg noodles with shredded cabbage, carrots, scallions and aromatic sesame", Price = 249.00m, Image = "https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=400&q=80", VegNonVeg = "VEG", Availability = true, SpiceLevel = "MILD", IsSweet = false, CustomizationOptions = "[{\"name\": \"Variation\", \"choices\": [\"Veg\", \"Egg (+₹30)\", \"Chicken (+₹70)\"]}]", AddOns = "[]", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new() { MenuItemId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, CategoryId = catNorthIndian.CategoryId, Name = "Dal Makhani Bukhara", Description = "Slow-cooked black lentils simmered overnight with butter, cream, and Kashmiri spices", Price = 349.00m, Image = "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=400&q=80", VegNonVeg = "VEG", Availability = true, SpiceLevel = "MILD", IsSweet = false, CustomizationOptions = "[]", AddOns = "[{\"name\": \"Garlic Naan\", \"price\": 60}, {\"name\": \"Jeera Rice\", \"price\": 120}]", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new() { MenuItemId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, CategoryId = catNorthIndian.CategoryId, Name = "Paneer Butter Masala", Description = "Fresh malai paneer steeped in a rich, buttery, velvety tomato and cashew gravy", Price = 379.00m, Image = "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=400&q=80", VegNonVeg = "VEG", Availability = true, SpiceLevel = "MEDIUM", IsSweet = false, CustomizationOptions = "[]", AddOns = "[{\"name\": \"Butter Roti (2 pcs)\", \"price\": 50}]", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new() { MenuItemId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, CategoryId = catIndian.CategoryId, Name = "Butter Chicken Delhi Special", Description = "Chargrilled boneless chicken tikkas simmered in satin smooth butter tomato sauce", Price = 449.00m, Image = "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=400&q=80", VegNonVeg = "NON_VEG", Availability = true, SpiceLevel = "MEDIUM", IsSweet = false, CustomizationOptions = "[]", AddOns = "[{\"name\": \"Butter Naan (2 pcs)\", \"price\": 80}]", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new() { MenuItemId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, CategoryId = catSouthIndian.CategoryId, Name = "Mysore Masala Dosa", Description = "Golden crispy rice crepe smeared with fiery red garlic-lentil chutney, stuffed with spiced potato mash", Price = 229.00m, Image = "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=400&q=80", VegNonVeg = "VEG", Availability = true, SpiceLevel = "SPICY", IsSweet = false, CustomizationOptions = "[{\"name\": \"Roast\", \"choices\": [\"Ghee Roast (+₹30)\", \"Butter Roast (+₹30)\"]}]", AddOns = "[{\"name\": \"Extra Sambar\", \"price\": 25}]", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new() { MenuItemId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, CategoryId = catSouthIndian.CategoryId, Name = "Ghee Podi Idli (4 pcs)", Description = "Steamed button rice cakes drenched in aromatic desi ghee and gun-powder podi spice", Price = 189.00m, Image = "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=400&q=80", VegNonVeg = "VEG", Availability = true, SpiceLevel = "MEDIUM", IsSweet = false, CustomizationOptions = "[]", AddOns = "[]", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new() { MenuItemId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, CategoryId = catDesserts.CategoryId, Name = "Warm Gulab Jamun with Rabri", Description = "Two soft golden cottage cheese dumplings soaked in rose-cardamom syrup, crowned with chilled rabri", Price = 179.00m, Image = "https://images.unsplash.com/photo-1593798603546-b302636a0d0d?auto=format&fit=crop&w=400&q=80", VegNonVeg = "VEG", Availability = true, SpiceLevel = "NONE", IsSweet = true, CustomizationOptions = "[]", AddOns = "[{\"name\": \"Pistachio Topping\", \"price\": 20}]", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new() { MenuItemId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, CategoryId = catDesserts.CategoryId, Name = "Belgian Chocolate Lava Cake", Description = "Warm molten chocolate cake with gooey center, served with Madagascan vanilla gelato", Price = 249.00m, Image = "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=400&q=80", VegNonVeg = "VEG", Availability = true, SpiceLevel = "NONE", IsSweet = true, CustomizationOptions = "[]", AddOns = "[{\"name\": \"Extra Scoop Gelato\", \"price\": 60}]", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new() { MenuItemId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, CategoryId = catBeverages.CategoryId, Name = "Fresh Mint Mojito", Description = "Fresh garden mint, crushed lime, cane sugar, and sparkling soda over ice", Price = 159.00m, Image = "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=400&q=80", VegNonVeg = "VEG", Availability = true, SpiceLevel = "NONE", IsSweet = true, CustomizationOptions = "[{\"name\": \"Sweetness\", \"choices\": [\"Regular\", \"Low Sugar\", \"No Sugar\"]}]", AddOns = "[]", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow },
            new() { MenuItemId = Guid.NewGuid(), RestaurantId = DefaultRestaurantId, CategoryId = catBeverages.CategoryId, Name = "Sunrise Signature Cold Brew", Description = "18-hour steeped single-origin Arabica cold brew with vanilla cream froth", Price = 199.00m, Image = "https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?auto=format&fit=crop&w=400&q=80", VegNonVeg = "VEG", Availability = true, SpiceLevel = "NONE", IsSweet = false, CustomizationOptions = "[{\"name\": \"Milk\", \"choices\": [\"Whole Milk\", \"Oat Milk (+₹40)\", \"Almond Milk (+₹40)\"]}]", AddOns = "[]", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow }
        };

        db.MenuItems.AddRange(items);
        await db.SaveChangesAsync();
    }
}
