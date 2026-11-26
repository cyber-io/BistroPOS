-- ============================================================================
-- BistroPOS: Complete Clean Slate Reset Script
-- Usage: Run this in your PostgreSQL / Supabase SQL Editor to wipe all old
-- data and reset the system to a clean, fresh state.
-- ============================================================================

-- METHOD 1 (Recommended & 100% Fail-Safe): 
-- Dynamically truncates all existing tables in restaurant_pos schema
-- so it NEVER fails even if some optional migration tables do not exist.
DO $$
DECLARE
    tbl RECORD;
BEGIN
    FOR tbl IN (
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'restaurant_pos' 
          AND tablename NOT IN ('schema_migrations')
    ) LOOP
        EXECUTE 'TRUNCATE TABLE restaurant_pos.' || quote_ident(tbl.tablename) || ' CASCADE;';
    END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 1. Insert primary clean restaurant shell
-- ----------------------------------------------------------------------------
INSERT INTO restaurant_pos.restaurants (
    restaurant_id,
    name,
    logo,
    address,
    phone,
    email,
    status,
    opening_hours,
    settings,
    created_at,
    updated_at
) VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Bistro & Bloom',
    '/favicon.svg',
    'Plot 42, Gourmet Boulevard, Cyber Hub, Gurugram, HR - 122002',
    '+91 98765 43210',
    'contact@bistropos.com',
    'ACTIVE',
    '{"monday": {"open": "10:00", "close": "23:00"}, "tuesday": {"open": "10:00", "close": "23:00"}, "wednesday": {"open": "10:00", "close": "23:00"}, "thursday": {"open": "10:00", "close": "23:00"}, "friday": {"open": "10:00", "close": "23:30"}, "saturday": {"open": "10:00", "close": "23:30"}, "sunday": {"open": "10:00", "close": "23:00"}}'::jsonb,
    '{"tax_rate": 0.05, "delivery_fee": 40.00, "currency": "INR"}'::jsonb,
    NOW(),
    NOW()
) ON CONFLICT (restaurant_id) DO UPDATE
SET name = 'Bistro & Bloom',
    status = 'ACTIVE',
    updated_at = NOW();

-- ----------------------------------------------------------------------------
-- 2. Insert primary Super Admin account (Password: Admin@12345)
-- ----------------------------------------------------------------------------
INSERT INTO restaurant_pos.users (
    user_id,
    restaurant_id,
    name,
    email,
    phone,
    password_hash,
    role,
    status,
    email_verified,
    created_at,
    updated_at
) VALUES (
    'b0000000-0000-0000-0000-000000000001',
    NULL,
    'Super Admin',
    'admin@bistropos.com',
    '+91 99999 00001',
    '$2a$11$w8/q3m2eA8zJ5m7nB3r9TuG4h.8Z.u2v8kP.vYg/H8K1.p2wEa2XW', -- Auto-verified and synced by backend on startup
    'SUPER_ADMIN',
    'ACTIVE',
    TRUE,
    NOW(),
    NOW()
) ON CONFLICT (user_id) DO UPDATE 
SET email = 'admin@bistropos.com',
    role = 'SUPER_ADMIN',
    status = 'ACTIVE',
    updated_at = NOW();

-- ----------------------------------------------------------------------------
-- 3. Insert 12 clean empty tables for floor plan and QR dine-in
-- ----------------------------------------------------------------------------
INSERT INTO restaurant_pos.tables (
    table_id,
    restaurant_id,
    table_number,
    capacity,
    status,
    qr_identifier,
    dining_area,
    created_at,
    updated_at
) VALUES 
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 1, 2, 'AVAILABLE', 'QR_a0000000000000000000000000000001_TBL01', 'everyday', NOW(), NOW()),
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 2, 2, 'AVAILABLE', 'QR_a0000000000000000000000000000001_TBL02', 'everyday', NOW(), NOW()),
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 3, 4, 'AVAILABLE', 'QR_a0000000000000000000000000000001_TBL03', 'everyday', NOW(), NOW()),
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 4, 4, 'AVAILABLE', 'QR_a0000000000000000000000000000001_TBL04', 'everyday', NOW(), NOW()),
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 5, 4, 'AVAILABLE', 'QR_a0000000000000000000000000000001_TBL05', 'everyday', NOW(), NOW()),
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 6, 6, 'AVAILABLE', 'QR_a0000000000000000000000000000001_TBL06', 'group', NOW(), NOW()),
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 7, 6, 'AVAILABLE', 'QR_a0000000000000000000000000000001_TBL07', 'group', NOW(), NOW()),
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 8, 8, 'AVAILABLE', 'QR_a0000000000000000000000000000001_TBL08', 'group', NOW(), NOW()),
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 9, 2, 'AVAILABLE', 'QR_a0000000000000000000000000000001_TBL09', 'everyday', NOW(), NOW()),
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 10, 4, 'AVAILABLE', 'QR_a0000000000000000000000000000001_TBL10', 'everyday', NOW(), NOW()),
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 11, 4, 'AVAILABLE', 'QR_a0000000000000000000000000000001_TBL11', 'everyday', NOW(), NOW()),
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 12, 8, 'AVAILABLE', 'QR_a0000000000000000000000000000001_TBL12', 'group', NOW(), NOW());

-- ----------------------------------------------------------------------------
-- 4. Insert baseline starter menu categories
-- ----------------------------------------------------------------------------
INSERT INTO restaurant_pos.menu_categories (category_id, restaurant_id, name, description, sort_order, status, created_at, updated_at)
VALUES
    ('c0000001-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Pizza', 'Wood-fired artisan pizzas', 1, 'ACTIVE', NOW(), NOW()),
    ('c0000001-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Burger', 'Handcrafted burgers on brioche buns', 2, 'ACTIVE', NOW(), NOW()),
    ('c0000001-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Chinese', 'Wok-tossed noodles and appetizers', 3, 'ACTIVE', NOW(), NOW()),
    ('c0000001-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Indian', 'Rich curries, dal makhani and tandoori specials', 4, 'ACTIVE', NOW(), NOW()),
    ('c0000001-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'South Indian', 'Crisp dosas and fluffy idlis', 5, 'ACTIVE', NOW(), NOW()),
    ('c0000001-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'Desserts', 'Artisanal desserts and warm sweets', 6, 'ACTIVE', NOW(), NOW()),
    ('c0000001-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'Beverages', 'Signature cold brews, mocktails and teas', 7, 'ACTIVE', NOW(), NOW())
ON CONFLICT (category_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. Insert baseline starter dishes
-- ----------------------------------------------------------------------------
INSERT INTO restaurant_pos.menu_items (
    menu_item_id, restaurant_id, category_id, name, description, price, image,
    veg_nonveg, availability, spice_level, is_sweet, customization_options, add_ons, created_at, updated_at
) VALUES
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'c0000001-0000-0000-0000-000000000001', 'Margherita Supreme Pizza', 'San Marzano tomato sauce, fresh buffalo mozzarella, organic basil, extra virgin olive oil', 399.00, 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?auto=format&fit=crop&w=400&q=80', 'VEG', TRUE, 'NONE', FALSE, '[]'::jsonb, '[]'::jsonb, NOW(), NOW()),
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'c0000001-0000-0000-0000-000000000001', 'Spicy Paneer Tikka Pizza', 'Tandoori spiced paneer cubes, capsicum, red onions, mozzarella, spicy drizzle', 469.00, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=400&q=80', 'VEG', TRUE, 'SPICY', FALSE, '[]'::jsonb, '[]'::jsonb, NOW(), NOW()),
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'c0000001-0000-0000-0000-000000000001', 'BBQ Chicken Feast Pizza', 'Smoked BBQ chicken chunks, caramelized onions, smoked gouda & mozzarella', 529.00, 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=400&q=80', 'NON_VEG', TRUE, 'MEDIUM', FALSE, '[]'::jsonb, '[]'::jsonb, NOW(), NOW()),
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'c0000001-0000-0000-0000-000000000002', 'Crispy Veggie Crunch Burger', 'Crispy spiced potato-corn patty, lettuce, tomatoes, secret house chipotle sauce', 219.00, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80', 'VEG', TRUE, 'MILD', FALSE, '[]'::jsonb, '[]'::jsonb, NOW(), NOW()),
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'c0000001-0000-0000-0000-000000000002', 'Smokey Grilled Chicken Burger', 'Tender grilled chicken breast, sharp cheddar, gherkins, caramelized onions, garlic aioli', 319.00, 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=400&q=80', 'NON_VEG', TRUE, 'MEDIUM', FALSE, '[]'::jsonb, '[]'::jsonb, NOW(), NOW()),
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'c0000001-0000-0000-0000-000000000003', 'Chilli Paneer Dry', 'Crispy cottage cheese cubes tossed with bell peppers, spring onions, and spicy soy-chilli glaze', 299.00, 'https://images.unsplash.com/photo-1541832676-9b763b0239ab?auto=format&fit=crop&w=400&q=80', 'VEG', TRUE, 'SPICY', FALSE, '[]'::jsonb, '[]'::jsonb, NOW(), NOW()),
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'c0000001-0000-0000-0000-000000000003', 'Hakka Noodles Wok Special', 'Fresh wok-tossed noodles with shredded cabbage, carrots, scallions and aromatic sesame', 249.00, 'https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=400&q=80', 'VEG', TRUE, 'MILD', FALSE, '[]'::jsonb, '[]'::jsonb, NOW(), NOW()),
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'c0000001-0000-0000-0000-000000000004', 'Dal Makhani Bukhara', 'Slow-cooked black lentils simmered overnight with butter, cream, and Kashmiri spices', 349.00, 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=400&q=80', 'VEG', TRUE, 'MILD', FALSE, '[]'::jsonb, '[]'::jsonb, NOW(), NOW()),
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'c0000001-0000-0000-0000-000000000004', 'Paneer Butter Masala', 'Fresh malai paneer steeped in a rich, buttery, velvety tomato and cashew gravy', 379.00, 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=400&q=80', 'VEG', TRUE, 'MEDIUM', FALSE, '[]'::jsonb, '[]'::jsonb, NOW(), NOW()),
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'c0000001-0000-0000-0000-000000000004', 'Butter Chicken Delhi Special', 'Chargrilled boneless chicken tikkas simmered in satin smooth butter tomato sauce', 449.00, 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=400&q=80', 'NON_VEG', TRUE, 'MEDIUM', FALSE, '[]'::jsonb, '[]'::jsonb, NOW(), NOW()),
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'c0000001-0000-0000-0000-000000000005', 'Mysore Masala Dosa', 'Golden crispy rice crepe smeared with fiery red garlic-lentil chutney, stuffed with spiced potato mash', 229.00, 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=400&q=80', 'VEG', TRUE, 'SPICY', FALSE, '[]'::jsonb, '[]'::jsonb, NOW(), NOW()),
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000006', 'c0000001-0000-0000-0000-000000000006', 'Warm Gulab Jamun with Rabri', 'Two soft golden dumplings soaked in rose-cardamom syrup, crowned with chilled rabri', 179.00, 'https://images.unsplash.com/photo-1593798603546-b302636a0d0d?auto=format&fit=crop&w=400&q=80', 'VEG', TRUE, 'NONE', TRUE, '[]'::jsonb, '[]'::jsonb, NOW(), NOW()),
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000006', 'c0000001-0000-0000-0000-000000000006', 'Belgian Chocolate Lava Cake', 'Warm molten chocolate cake with gooey center, served with vanilla gelato', 249.00, 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=400&q=80', 'VEG', TRUE, 'NONE', TRUE, '[]'::jsonb, '[]'::jsonb, NOW(), NOW()),
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'c0000001-0000-0000-0000-000000000007', 'Fresh Mint Mojito', 'Fresh garden mint, crushed lime, cane sugar, and sparkling soda over ice', 159.00, 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=400&q=80', 'VEG', TRUE, 'NONE', TRUE, '[]'::jsonb, '[]'::jsonb, NOW(), NOW()),
    (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', 'c0000001-0000-0000-0000-000000000007', 'Cold Brew Coffee', '18-hour steeped single-origin Arabica cold brew with vanilla cream froth', 199.00, 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?auto=format&fit=crop&w=400&q=80', 'VEG', TRUE, 'NONE', FALSE, '[]'::jsonb, '[]'::jsonb, NOW(), NOW())
ON CONFLICT (menu_item_id) DO NOTHING;
