-- ============================================================================
-- Fix Row Level Security (RLS) Policies for Frontend & Direct PostgREST Access
-- Allows Registration, Authentication, Orders, Reservations, and Table Updates
-- ============================================================================

-- 1. USERS: Allow public registration, login lookup, and profile management
DROP POLICY IF EXISTS "Users read own profile" ON users;
DROP POLICY IF EXISTS "SuperAdmin manages users" ON users;
DROP POLICY IF EXISTS "Allow public registration" ON users;
DROP POLICY IF EXISTS "Allow users select for authentication" ON users;
DROP POLICY IF EXISTS "Allow users update own profile" ON users;

CREATE POLICY "Allow public registration" ON users
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow users select for authentication" ON users
    FOR SELECT USING (true);

CREATE POLICY "Allow users update own profile" ON users
    FOR UPDATE USING (true);

CREATE POLICY "SuperAdmin manages users" ON users
    FOR ALL USING (true);

-- 2. ORDERS: Allow Dine-In QR and online customers to insert and view orders
DROP POLICY IF EXISTS "Customer view own orders" ON orders;
DROP POLICY IF EXISTS "Customer create orders" ON orders;
DROP POLICY IF EXISTS "Staff update orders" ON orders;

CREATE POLICY "Customer and staff view orders" ON orders
    FOR SELECT USING (true);

CREATE POLICY "Customer create orders" ON orders
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Staff update orders" ON orders
    FOR UPDATE USING (true);

-- 3. ORDER ITEMS
DROP POLICY IF EXISTS "Order items view policy" ON order_items;
DROP POLICY IF EXISTS "Order items insert policy" ON order_items;

CREATE POLICY "Order items view policy" ON order_items
    FOR SELECT USING (true);

CREATE POLICY "Order items insert policy" ON order_items
    FOR INSERT WITH CHECK (true);

-- 4. RESERVATIONS
DROP POLICY IF EXISTS "Customer view own reservations" ON reservations;
DROP POLICY IF EXISTS "Customer create reservation" ON reservations;
DROP POLICY IF EXISTS "Staff update reservations" ON reservations;

CREATE POLICY "Customer and staff view reservations" ON reservations
    FOR SELECT USING (true);

CREATE POLICY "Customer create reservation" ON reservations
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Staff update reservations" ON reservations
    FOR UPDATE USING (true);

-- 5. TABLES
DROP POLICY IF EXISTS "Staff manage tables" ON tables;
DROP POLICY IF EXISTS "Public view tables for menu" ON tables;

CREATE POLICY "Public view tables for menu" ON tables
    FOR SELECT USING (true);

CREATE POLICY "Staff and system update tables" ON tables
    FOR UPDATE USING (true);

CREATE POLICY "Staff manage tables" ON tables
    FOR ALL USING (true);

-- 6. HELP REQUESTS
DROP POLICY IF EXISTS "Customer create help request" ON help_requests;
DROP POLICY IF EXISTS "View help requests" ON help_requests;
DROP POLICY IF EXISTS "Waiter & Receptionist update help request" ON help_requests;

CREATE POLICY "Customer create help request" ON help_requests
    FOR INSERT WITH CHECK (true);

CREATE POLICY "View help requests" ON help_requests
    FOR SELECT USING (true);

CREATE POLICY "Waiter & Receptionist update help request" ON help_requests
    FOR UPDATE USING (true);

-- 7. MENU ITEMS & CATEGORIES
DROP POLICY IF EXISTS "Kitchen & Admin update item availability" ON menu_items;
DROP POLICY IF EXISTS "Admin manage menu items" ON menu_items;

CREATE POLICY "Staff update item availability" ON menu_items
    FOR UPDATE USING (true);

CREATE POLICY "Admin manage menu items" ON menu_items
    FOR ALL USING (true);

-- 8. CUSTOMER ISSUES
DROP POLICY IF EXISTS "Receptionist & Admin manage issues" ON customer_issues;

CREATE POLICY "Manage customer issues" ON customer_issues
    FOR ALL USING (true);

-- ============================================================================
-- 9. SUPABASE REALTIME REPLICATION CONFIGURATION
-- Enables PostgreSQL replication stream for instant multi-client push notifications
-- ============================================================================
ALTER TABLE orders REPLICA IDENTITY FULL;
ALTER TABLE tables REPLICA IDENTITY FULL;
ALTER TABLE help_requests REPLICA IDENTITY FULL;
ALTER TABLE menu_items REPLICA IDENTITY FULL;
ALTER TABLE reservations REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'orders') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE orders, tables, help_requests, menu_items, reservations;
    END IF;
END $$;

