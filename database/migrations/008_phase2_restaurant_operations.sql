-- Migration: 008_phase2_restaurant_operations.sql
-- Description: Phase 2: Restaurant Operations (Interactive Floor Map coordinates & Inventory Management)

SET search_path TO restaurant_pos, public;

-- 1. Extend tables with coordinates, shape, and dining_area
ALTER TABLE tables
    ADD COLUMN IF NOT EXISTS position_x INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS position_y INT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS shape VARCHAR(50) DEFAULT 'SQUARE',
    ADD COLUMN IF NOT EXISTS dining_area VARCHAR(50) DEFAULT 'everyday';

-- 2. Create inventory_items table
CREATE TABLE IF NOT EXISTS inventory_items (
    item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(100) DEFAULT 'GENERAL',
    unit VARCHAR(50) NOT NULL,
    current_stock NUMERIC(10,2) NOT NULL DEFAULT 0,
    min_threshold NUMERIC(10,2) NOT NULL DEFAULT 5,
    cost_per_unit NUMERIC(10,2) NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'IN_STOCK',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_restaurant ON inventory_items(restaurant_id, status);

-- 3. Seed initial inventory items for default restaurant
INSERT INTO inventory_items (restaurant_id, name, category, unit, current_stock, min_threshold, cost_per_unit, status)
SELECT 
    'a0000000-0000-0000-0000-000000000001'::UUID,
    item.name,
    item.category,
    item.unit,
    item.stock,
    item.threshold,
    item.cost,
    item.status
FROM (VALUES
    ('Pizza Dough Flour', 'BAKERY', 'kg', 45.0, 10.0, 48.00, 'IN_STOCK'),
    ('Buffalo Mozzarella', 'DAIRY', 'kg', 18.5, 5.0, 420.00, 'IN_STOCK'),
    ('Fresh Paneer', 'DAIRY', 'kg', 24.0, 6.0, 310.00, 'IN_STOCK'),
    ('Boneless Chicken Breast', 'MEAT', 'kg', 32.0, 8.0, 260.00, 'IN_STOCK'),
    ('San Marzano Tomato Sauce', 'SAUCES', 'L', 28.0, 5.0, 140.00, 'IN_STOCK'),
    ('Arabica Coffee Beans', 'BEVERAGES', 'kg', 12.0, 3.0, 850.00, 'IN_STOCK'),
    ('Fresh Spearmint & Limes', 'PRODUCE', 'kg', 8.5, 2.0, 95.00, 'IN_STOCK'),
    ('Aged Basmati Rice', 'GRAINS', 'kg', 50.0, 15.0, 110.00, 'IN_STOCK'),
    ('Pure Desi Ghee', 'DAIRY', 'kg', 14.0, 4.0, 680.00, 'IN_STOCK'),
    ('Chilli Pepper Pods & Spices', 'SPICES', 'kg', 6.0, 2.0, 450.00, 'IN_STOCK')
) AS item(name, category, unit, stock, threshold, cost, status)
WHERE NOT EXISTS (
    SELECT 1 FROM inventory_items WHERE restaurant_id = 'a0000000-0000-0000-0000-000000000001'::UUID
);
