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
}
