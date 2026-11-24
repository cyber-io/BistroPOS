-- ============================================================================
-- Migration 010: Reliability and Feature Extensions
-- Phase 1: Robust Migrations, Audit, Electronic Payments, Receipt Delivery
-- Phase 2: Courses/Serve Together, Kitchen Stations, Recipes/Portions, Event Planning, Walk-in Waitlist
-- ============================================================================

SET search_path TO restaurant_pos, public;

-- 1. Schema Migrations Table
CREATE TABLE IF NOT EXISTS restaurant_pos.schema_migrations (
    version VARCHAR(100) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Phase 1 & 2 Table Extensions for Order Items (Courses, Stations, Preparation Status)
ALTER TABLE restaurant_pos.order_items
ADD COLUMN IF NOT EXISTS course VARCHAR(50) DEFAULT 'MAIN',
ADD COLUMN IF NOT EXISTS station VARCHAR(50) DEFAULT 'MAIN',
ADD COLUMN IF NOT EXISTS preparation_status VARCHAR(50) DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS prepared_at TIMESTAMPTZ;

-- 3. Menu Items Extensions (Kitchen Station & Recipe Ingredients)
ALTER TABLE restaurant_pos.menu_items
ADD COLUMN IF NOT EXISTS kitchen_station VARCHAR(50) DEFAULT 'MAIN',
ADD COLUMN IF NOT EXISTS recipe JSONB DEFAULT '[]'::jsonb;
ALTER TABLE restaurant_pos.menu_items ALTER COLUMN ingredients TYPE TEXT USING ingredients::text;

-- 4. Reservations Extensions for Party Hall Event Planning
ALTER TABLE restaurant_pos.reservations
ADD COLUMN IF NOT EXISTS confirmed_headcount INT,
ADD COLUMN IF NOT EXISTS event_meal_choices JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS dietary_requests TEXT,
ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS deposit_paid NUMERIC(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS estimated_total_cost NUMERIC(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS prep_sheet_notes TEXT;

-- 5. Walk-in Waitlist Table
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

-- 6. Receipt Deliveries Table
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

-- Register migration 010 in schema_migrations
INSERT INTO restaurant_pos.schema_migrations (version, applied_at)
VALUES ('010_reliability_and_feature_extensions', NOW())
ON CONFLICT (version) DO NOTHING;
