-- ============================================================================
-- BistroPOS: Complete Clean Slate Reset Script
-- Usage: Run this in your PostgreSQL / Supabase SQL Editor to wipe all old
-- dummy/test data and reset the system to a clean state.
-- ============================================================================

-- 1. Truncate all transactional, operational and entity tables
TRUNCATE TABLE 
    restaurant_pos.order_items,
    restaurant_pos.orders,
    restaurant_pos.payments,
    restaurant_pos.table_sessions,
    restaurant_pos.table_assignments,
    restaurant_pos.dining_sessions,
    restaurant_pos.reservations,
    restaurant_pos.help_requests,
    restaurant_pos.customer_issues,
    restaurant_pos.notifications,
    restaurant_pos.delivery_addresses,
    restaurant_pos.customer_feedbacks,
    restaurant_pos.customer_loyalties,
    restaurant_pos.walk_in_waitlists,
    restaurant_pos.receipt_deliveries,
    restaurant_pos.audit_logs,
    restaurant_pos.inventory_items,
    restaurant_pos.menu_items,
    restaurant_pos.menu_categories,
    restaurant_pos.tables,
    restaurant_pos.staff_profiles,
    restaurant_pos.users,
    restaurant_pos.restaurants
CASCADE;

-- 2. Insert primary clean restaurant shell
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
) ON CONFLICT (restaurant_id) DO NOTHING;

-- 3. Insert primary Super Admin account (Password: Admin@12345)
-- BCrypt hash for Admin@12345
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
    '$2a$11$q9u0K6oT1eD.9t2M9SXZ0.oK9GzU1b8H2eY7w0v5s6Q3c4a5b6c7d', -- Admin@12345 hash or managed by backend startup
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

-- 4. Insert 12 clean empty tables for the default restaurant
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
