using Microsoft.EntityFrameworkCore;
using RestaurantSystem.Api.Models;

namespace RestaurantSystem.Api.Repositories;

public class RestaurantDbContext : DbContext
{
    public RestaurantDbContext(DbContextOptions<RestaurantDbContext> options) : base(options)
    {
    }

    public DbSet<Restaurant> Restaurants => Set<Restaurant>();
    public DbSet<User> Users => Set<User>();
    public DbSet<TableEntity> Tables => Set<TableEntity>();
    public DbSet<TableSession> TableSessions => Set<TableSession>();
    public DbSet<TableAssignment> TableAssignments => Set<TableAssignment>();
    public DbSet<MenuCategory> MenuCategories => Set<MenuCategory>();
    public DbSet<MenuItem> MenuItems => Set<MenuItem>();
    public DbSet<DiningSession> DiningSessions => Set<DiningSession>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<Reservation> Reservations => Set<Reservation>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<HelpRequest> HelpRequests => Set<HelpRequest>();
    public DbSet<CustomerIssue> CustomerIssues => Set<CustomerIssue>();
    public DbSet<NotificationEntity> Notifications => Set<NotificationEntity>();
    public DbSet<DeliveryAddressEntity> DeliveryAddresses => Set<DeliveryAddressEntity>();
    public DbSet<RestaurantSettingsEntity> RestaurantSettings => Set<RestaurantSettingsEntity>();
    public DbSet<StaffProfile> StaffProfiles => Set<StaffProfile>();
    public DbSet<InventoryItem> InventoryItems => Set<InventoryItem>();
    public DbSet<CustomerLoyalty> CustomerLoyalties => Set<CustomerLoyalty>();
    public DbSet<CustomerFeedback> CustomerFeedbacks => Set<CustomerFeedback>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<WalkInWaitlist> WalkInWaitlists => Set<WalkInWaitlist>();
    public DbSet<ReceiptDelivery> ReceiptDeliveries => Set<ReceiptDelivery>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.HasDefaultSchema("restaurant_pos");
        foreach (var entity in modelBuilder.Model.GetEntityTypes())
        {
            foreach (var property in entity.GetProperties())
            {
                var snakeName = System.Text.RegularExpressions.Regex.Replace(property.Name, "([a-z0-9])([A-Z])", "$1_$2").ToLowerInvariant();
                property.SetColumnName(snakeName);
            }
        }
        modelBuilder.Entity<MenuItem>().Property(m => m.VegNonVeg).HasColumnName("veg_nonveg");
        modelBuilder.Entity<Restaurant>().Property(r => r.OpeningHours).HasColumnType("jsonb");
        modelBuilder.Entity<Restaurant>().Property(r => r.Settings).HasColumnType("jsonb");
        modelBuilder.Entity<Restaurant>().Ignore(r => r.WifiSsid);
        modelBuilder.Entity<Restaurant>().Ignore(r => r.WifiPassword);
        modelBuilder.Entity<Restaurant>().Ignore(r => r.WifiEnabled);
        modelBuilder.Entity<Restaurant>().Ignore(r => r.GoogleReviewUrl);
        modelBuilder.Entity<Restaurant>().Ignore(r => r.SubscriptionTier);
        modelBuilder.Entity<MenuItem>().Property(m => m.AddOns).HasColumnType("jsonb");
        modelBuilder.Entity<MenuItem>().Property(m => m.CustomizationOptions).HasColumnType("jsonb");
        modelBuilder.Entity<MenuItem>().Property(m => m.Allergens).HasColumnType("jsonb");
        modelBuilder.Entity<MenuItem>().Property(m => m.Portions).HasColumnType("jsonb");
        modelBuilder.Entity<MenuItem>().Property(m => m.DietaryTags).HasColumnType("jsonb");
        modelBuilder.Entity<MenuItem>().Property(m => m.Recipe).HasColumnType("jsonb");
        modelBuilder.Entity<Reservation>().Property(r => r.EventMealChoices).HasColumnType("jsonb");
        modelBuilder.Entity<DiningSession>().Ignore(s => s.SessionCode);
        modelBuilder.Entity<DiningSession>().Ignore(s => s.ExpiresAt);
        modelBuilder.Entity<DiningSession>().HasIndex(s => new { s.TableId, s.Status });
        modelBuilder.Entity<OrderItem>().Property(i => i.Customization).HasColumnType("jsonb");
        modelBuilder.Entity<Order>().Property(o => o.DeliveryAddress).HasColumnType("jsonb");
        modelBuilder.Entity<Payment>().Property(p => p.ProviderResponse).HasColumnType("jsonb");
        modelBuilder.Entity<AuditLog>().Property(a => a.Metadata).HasColumnType("jsonb");
        modelBuilder.Entity<AuditLog>().Ignore(a => a.IpAddress);

        // Multi-tenant indexes and unique constraints
        modelBuilder.Entity<TableEntity>()
            .HasIndex(t => new { t.RestaurantId, t.TableNumber })
            .IsUnique();

        modelBuilder.Entity<TableEntity>()
            .HasIndex(t => t.QrIdentifier)
            .IsUnique();

        modelBuilder.Entity<Order>()
            .HasIndex(o => o.OrderNumber)
            .IsUnique();

        modelBuilder.Entity<Reservation>()
            .HasIndex(r => r.BookingId)
            .IsUnique();

        modelBuilder.Entity<Reservation>()
            .HasIndex(r => new { r.RestaurantId, r.ReservationDate, r.ReservationTime, r.Status });

        modelBuilder.Entity<Payment>()
            .HasIndex(p => p.IdempotencyKey)
            .IsUnique();
    }
}
