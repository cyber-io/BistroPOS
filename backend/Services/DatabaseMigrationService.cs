using Microsoft.EntityFrameworkCore;
using RestaurantSystem.Api.Repositories;

namespace RestaurantSystem.Api.Services;

public static class DatabaseMigrationService
{
    public static async Task ApplyMigrationsAsync(RestaurantDbContext db, ILogger logger)
    {
        if (!db.Database.IsNpgsql()) return;

        try
        {
            // 1. Ensure migrations table exists
            await db.Database.ExecuteSqlRawAsync(@"
                CREATE SCHEMA IF NOT EXISTS restaurant_pos;
                CREATE TABLE IF NOT EXISTS restaurant_pos.schema_migrations (
                    version VARCHAR(100) PRIMARY KEY,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
            ");

            // 2. Fetch already applied migration versions
            var appliedVersions = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            try
            {
                using var command = db.Database.GetDbConnection().CreateCommand();
                command.CommandText = "SELECT version FROM restaurant_pos.schema_migrations";
                await db.Database.OpenConnectionAsync();
                using var reader = await command.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    appliedVersions.Add(reader.GetString(0));
                }
            }
            finally
            {
                await db.Database.CloseConnectionAsync();
            }

            // 3. Define versioned migrations
            var migrations = new (string Version, string Sql)[]
            {
                ("001_core_schema", @"
                    ALTER TABLE restaurant_pos.tables DROP CONSTRAINT IF EXISTS tables_status_check;
                    ALTER TABLE restaurant_pos.tables ADD CONSTRAINT tables_status_check CHECK (status IN ('AVAILABLE', 'RESERVED', 'OCCUPIED', 'WAITING_FOR_CLEANING', 'CLEANING', 'OUT_OF_SERVICE'));
                    
                    ALTER TABLE restaurant_pos.menu_items ADD COLUMN IF NOT EXISTS allergens JSONB DEFAULT '[]'::jsonb;
                    ALTER TABLE restaurant_pos.menu_items ADD COLUMN IF NOT EXISTS ingredients TEXT;
                    ALTER TABLE restaurant_pos.menu_items ALTER COLUMN ingredients TYPE TEXT USING ingredients::text;
                    ALTER TABLE restaurant_pos.menu_items ADD COLUMN IF NOT EXISTS portions JSONB DEFAULT '[]'::jsonb;
                    ALTER TABLE restaurant_pos.menu_items ADD COLUMN IF NOT EXISTS dietary_tags JSONB DEFAULT '[]'::jsonb;
                    ALTER TABLE restaurant_pos.menu_items ADD COLUMN IF NOT EXISTS is_special BOOLEAN DEFAULT FALSE;
                    ALTER TABLE restaurant_pos.menu_items ADD COLUMN IF NOT EXISTS prep_time_minutes INT DEFAULT 15;
                "),
                ("002_dining_sessions", @"
                    CREATE TABLE IF NOT EXISTS restaurant_pos.dining_sessions (
                        session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        restaurant_id UUID NOT NULL REFERENCES restaurant_pos.restaurants(restaurant_id) ON DELETE CASCADE,
                        table_id UUID NOT NULL REFERENCES restaurant_pos.tables(table_id) ON DELETE CASCADE,
                        session_code VARCHAR(50) NOT NULL DEFAULT '',
                        status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CLOSED')),
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        closed_at TIMESTAMPTZ,
                        expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '12 hours')
                    );
                    ALTER TABLE restaurant_pos.dining_sessions ADD COLUMN IF NOT EXISTS session_code VARCHAR(50) DEFAULT '';
                    ALTER TABLE restaurant_pos.dining_sessions ALTER COLUMN session_code DROP NOT NULL;
                    ALTER TABLE restaurant_pos.dining_sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '12 hours');
                    ALTER TABLE restaurant_pos.dining_sessions ALTER COLUMN expires_at DROP NOT NULL;
                    ALTER TABLE restaurant_pos.dining_sessions ALTER COLUMN closed_at DROP NOT NULL;
                    CREATE INDEX IF NOT EXISTS idx_dining_sessions_table ON restaurant_pos.dining_sessions(table_id, status);

                    ALTER TABLE restaurant_pos.orders ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES restaurant_pos.dining_sessions(session_id) ON DELETE SET NULL;
                    ALTER TABLE restaurant_pos.orders ADD COLUMN IF NOT EXISTS estimated_prep_time_minutes INT DEFAULT 15;
                    ALTER TABLE restaurant_pos.orders ADD COLUMN IF NOT EXISTS estimated_ready_at TIMESTAMPTZ;
                    ALTER TABLE restaurant_pos.help_requests ADD COLUMN IF NOT EXISTS request_type VARCHAR(50) DEFAULT 'CUSTOM';
                "),
                ("003_tables_and_inventory", @"
                    ALTER TABLE restaurant_pos.tables ADD COLUMN IF NOT EXISTS position_x INT DEFAULT 0;
                    ALTER TABLE restaurant_pos.tables ADD COLUMN IF NOT EXISTS position_y INT DEFAULT 0;
                    ALTER TABLE restaurant_pos.tables ADD COLUMN IF NOT EXISTS shape VARCHAR(50) DEFAULT 'SQUARE';
                    ALTER TABLE restaurant_pos.tables ADD COLUMN IF NOT EXISTS dining_area VARCHAR(50) DEFAULT 'everyday';

                    CREATE TABLE IF NOT EXISTS restaurant_pos.inventory_items (
                        item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        restaurant_id UUID NOT NULL REFERENCES restaurant_pos.restaurants(restaurant_id) ON DELETE CASCADE,
                        name VARCHAR(150) NOT NULL,
                        category VARCHAR(100) DEFAULT 'GENERAL',
                        unit VARCHAR(50) NOT NULL,
                        current_stock NUMERIC(10,2) NOT NULL DEFAULT 0,
                        min_threshold NUMERIC(10,2) NOT NULL DEFAULT 5,
                        cost_per_unit NUMERIC(10,2) NOT NULL DEFAULT 0,
                        status VARCHAR(50) NOT NULL DEFAULT 'IN_STOCK',
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    );
                    ALTER TABLE restaurant_pos.inventory_items ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'GENERAL';
                    CREATE INDEX IF NOT EXISTS idx_inventory_restaurant ON restaurant_pos.inventory_items(restaurant_id, status);
                "),
                ("004_loyalty_and_feedback", @"
                    CREATE TABLE IF NOT EXISTS restaurant_pos.customer_loyalty (
                        loyalty_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        restaurant_id UUID NOT NULL REFERENCES restaurant_pos.restaurants(restaurant_id) ON DELETE CASCADE,
                        customer_phone VARCHAR(20) NOT NULL,
                        customer_name VARCHAR(100),
                        customer_email VARCHAR(100),
                        points_balance INT NOT NULL DEFAULT 0,
                        lifetime_points INT NOT NULL DEFAULT 0,
                        tier VARCHAR(20) NOT NULL DEFAULT 'BRONZE',
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        updated_at TIMESTAMPTZ DEFAULT NOW(),
                        CONSTRAINT uq_customer_loyalty_phone UNIQUE (restaurant_id, customer_phone)
                    );

                    CREATE TABLE IF NOT EXISTS restaurant_pos.customer_feedbacks (
                        feedback_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        restaurant_id UUID NOT NULL REFERENCES restaurant_pos.restaurants(restaurant_id) ON DELETE CASCADE,
                        order_id UUID REFERENCES restaurant_pos.orders(order_id) ON DELETE SET NULL,
                        customer_name VARCHAR(100),
                        customer_phone VARCHAR(20),
                        rating INT NOT NULL DEFAULT 5,
                        food_rating INT DEFAULT 5,
                        service_rating INT DEFAULT 5,
                        ambiance_rating INT DEFAULT 5,
                        comment TEXT,
                        google_review_clicked BOOLEAN DEFAULT FALSE,
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    );

                    ALTER TABLE restaurant_pos.restaurants ADD COLUMN IF NOT EXISTS wifi_ssid VARCHAR(100) DEFAULT 'Bistro-HighSpeed-Guest';
                    ALTER TABLE restaurant_pos.restaurants ADD COLUMN IF NOT EXISTS wifi_password VARCHAR(100) DEFAULT 'Bistro@2026';
                    ALTER TABLE restaurant_pos.restaurants ADD COLUMN IF NOT EXISTS wifi_enabled BOOLEAN DEFAULT TRUE;
                    ALTER TABLE restaurant_pos.restaurants ADD COLUMN IF NOT EXISTS google_review_url VARCHAR(255) DEFAULT 'https://maps.google.com';
                    ALTER TABLE restaurant_pos.restaurants ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(50) DEFAULT 'PRO';

                    ALTER TABLE restaurant_pos.payments ADD COLUMN IF NOT EXISTS tip_amount NUMERIC(10,2) DEFAULT 0.00;
                    ALTER TABLE restaurant_pos.payments ADD COLUMN IF NOT EXISTS split_count INT DEFAULT 1;
                    ALTER TABLE restaurant_pos.payments ADD COLUMN IF NOT EXISTS split_type VARCHAR(50) DEFAULT 'FULL';
                "),
                ("010_reliability_and_feature_extensions", @"
                    ALTER TABLE restaurant_pos.order_items ADD COLUMN IF NOT EXISTS course VARCHAR(50) DEFAULT 'MAIN';
                    ALTER TABLE restaurant_pos.order_items ADD COLUMN IF NOT EXISTS station VARCHAR(50) DEFAULT 'MAIN';
                    ALTER TABLE restaurant_pos.order_items ADD COLUMN IF NOT EXISTS preparation_status VARCHAR(50) DEFAULT 'PENDING';
                    ALTER TABLE restaurant_pos.order_items ADD COLUMN IF NOT EXISTS prepared_at TIMESTAMPTZ;

                    ALTER TABLE restaurant_pos.menu_items ADD COLUMN IF NOT EXISTS kitchen_station VARCHAR(50) DEFAULT 'MAIN';
                    ALTER TABLE restaurant_pos.menu_items ADD COLUMN IF NOT EXISTS recipe JSONB DEFAULT '[]'::jsonb;

                    ALTER TABLE restaurant_pos.reservations ADD COLUMN IF NOT EXISTS confirmed_headcount INT;
                    ALTER TABLE restaurant_pos.reservations ADD COLUMN IF NOT EXISTS event_meal_choices JSONB DEFAULT '{}'::jsonb;
                    ALTER TABLE restaurant_pos.reservations ADD COLUMN IF NOT EXISTS dietary_requests TEXT;
                    ALTER TABLE restaurant_pos.reservations ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(10,2) DEFAULT 0.00;
                    ALTER TABLE restaurant_pos.reservations ADD COLUMN IF NOT EXISTS deposit_paid NUMERIC(10,2) DEFAULT 0.00;
                    ALTER TABLE restaurant_pos.reservations ADD COLUMN IF NOT EXISTS estimated_total_cost NUMERIC(10,2) DEFAULT 0.00;
                    ALTER TABLE restaurant_pos.reservations ADD COLUMN IF NOT EXISTS prep_sheet_notes TEXT;

                    CREATE TABLE IF NOT EXISTS restaurant_pos.walk_in_waitlist (
                        waitlist_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        restaurant_id UUID NOT NULL REFERENCES restaurant_pos.restaurants(restaurant_id) ON DELETE CASCADE,
                        customer_name VARCHAR(150) NOT NULL,
                        customer_phone VARCHAR(30) NOT NULL,
                        party_size INT NOT NULL DEFAULT 2,
                        status VARCHAR(50) NOT NULL DEFAULT 'WAITING',
                        estimated_wait_minutes INT NOT NULL DEFAULT 15,
                        estimated_ready_at TIMESTAMPTZ,
                        notified_at TIMESTAMPTZ,
                        seated_table_id UUID REFERENCES restaurant_pos.tables(table_id) ON DELETE SET NULL,
                        notes TEXT,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    );
                    CREATE INDEX IF NOT EXISTS idx_waitlist_restaurant_status ON restaurant_pos.walk_in_waitlist(restaurant_id, status);

                    CREATE TABLE IF NOT EXISTS restaurant_pos.receipt_deliveries (
                        delivery_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        order_id UUID NOT NULL REFERENCES restaurant_pos.orders(order_id) ON DELETE CASCADE,
                        email VARCHAR(255) NOT NULL,
                        status VARCHAR(50) NOT NULL DEFAULT 'DELIVERED',
                        error_message TEXT,
                        attempts INT NOT NULL DEFAULT 1,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        delivered_at TIMESTAMPTZ
                    );
                    CREATE INDEX IF NOT EXISTS idx_receipt_deliveries_order ON restaurant_pos.receipt_deliveries(order_id);
                ")
            };

            foreach (var (version, sql) in migrations)
            {
                if (appliedVersions.Contains(version)) continue;

                logger.LogInformation("Applying database migration {Version}...", version);
                try
                {
                    var connection = db.Database.GetDbConnection();
                    if (connection.State != System.Data.ConnectionState.Open)
                    {
                        await connection.OpenAsync();
                    }

                    await using var cmd = connection.CreateCommand();
                    cmd.CommandText = sql;
                    await cmd.ExecuteNonQueryAsync();

                    await using var recordCmd = connection.CreateCommand();
                    recordCmd.CommandText = "INSERT INTO restaurant_pos.schema_migrations (version, applied_at) VALUES (@version, NOW()) ON CONFLICT (version) DO NOTHING";
                    var p = recordCmd.CreateParameter();
                    p.ParameterName = "@version";
                    p.Value = version;
                    recordCmd.Parameters.Add(p);
                    await recordCmd.ExecuteNonQueryAsync();

                    logger.LogInformation("Migration {Version} applied successfully.", version);
                    appliedVersions.Add(version);
                }
                catch (Exception ex)
                {
                    logger.LogError(ex, "Database migration {Version} failed! {Message}", version, ex.Message);
                    throw new InvalidOperationException($"Migration {version} failed: {ex.Message}", ex);
                }
            }
        }
        catch (Exception ex) when (ex is not InvalidOperationException)
        {
            logger.LogError(ex, "Failed while checking or applying versioned migrations: {Message}", ex.Message);
            throw;
        }
    }
}
