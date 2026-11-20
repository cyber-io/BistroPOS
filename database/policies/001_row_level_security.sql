-- ============================================================================
-- Supabase Row Level Security (RLS) Policies
-- Enforcing Multi-Tenant Isolation & Role-Based Permissions
-- ============================================================================

-- Enable RLS on all sensitive tables
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE help_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper functions for JWT claims
CREATE OR REPLACE FUNCTION current_user_role() RETURNS TEXT AS $$
    SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'ANON');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION current_user_restaurant_id() RETURNS UUID AS $$
    SELECT nullif(current_setting('request.jwt.claim.restaurant_id', true), '')::UUID;
$$ LANGUAGE sql STABLE;

-- 1. RESTAURANTS
CREATE POLICY "Public read restaurant info" ON restaurants
    FOR SELECT USING (status = 'ACTIVE');

CREATE POLICY "SuperAdmin manages restaurant" ON restaurants
    FOR ALL USING (current_user_role() = 'SUPER_ADMIN');

-- 2. USERS
CREATE POLICY "Users read own profile" ON users
    FOR SELECT USING (user_id = auth.uid() OR current_user_role() = 'SUPER_ADMIN' OR (restaurant_id = current_user_restaurant_id() AND current_user_role() = 'RECEPTIONIST'));

CREATE POLICY "SuperAdmin manages users" ON users
    FOR ALL USING (current_user_role() = 'SUPER_ADMIN');

-- 3. TABLES
CREATE POLICY "Public view tables for menu" ON tables
    FOR SELECT USING (true);

CREATE POLICY "Staff manage tables" ON tables
    FOR ALL USING (restaurant_id = current_user_restaurant_id() AND current_user_role() IN ('SUPER_ADMIN', 'RECEPTIONIST'));

-- 4. MENU CATEGORIES & ITEMS
CREATE POLICY "Public read active categories" ON menu_categories
    FOR SELECT USING (status = 'ACTIVE');

CREATE POLICY "Public read active menu items" ON menu_items
    FOR SELECT USING (true);

CREATE POLICY "Kitchen & Admin update item availability" ON menu_items
    FOR UPDATE USING (restaurant_id = current_user_restaurant_id() AND current_user_role() IN ('SUPER_ADMIN', 'RECEPTIONIST', 'KITCHEN'));

CREATE POLICY "Admin manage menu items" ON menu_items
    FOR ALL USING (restaurant_id = current_user_restaurant_id() AND current_user_role() IN ('SUPER_ADMIN', 'RECEPTIONIST'));

-- 5. ORDERS
-- Customers view their own orders
CREATE POLICY "Customer view own orders" ON orders
    FOR SELECT USING (
        (auth.uid() IS NOT NULL AND customer_id = auth.uid()) 
        OR (restaurant_id = current_user_restaurant_id() AND current_user_role() IN ('SUPER_ADMIN', 'RECEPTIONIST', 'KITCHEN', 'WAITER'))
    );

-- Customers can create orders
CREATE POLICY "Customer create orders" ON orders
    FOR INSERT WITH CHECK (
        auth.uid() IS NULL OR customer_id = auth.uid()
    );

-- Staff update orders based on their role
CREATE POLICY "Staff update orders" ON orders
    FOR UPDATE USING (
        restaurant_id = current_user_restaurant_id() 
        AND current_user_role() IN ('SUPER_ADMIN', 'RECEPTIONIST', 'KITCHEN', 'WAITER')
    );

-- 6. ORDER ITEMS
CREATE POLICY "Order items view policy" ON order_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM orders o 
            WHERE o.order_id = order_items.order_id 
              AND (o.customer_id = auth.uid() OR (o.restaurant_id = current_user_restaurant_id() AND current_user_role() IN ('SUPER_ADMIN', 'RECEPTIONIST', 'KITCHEN', 'WAITER')))
        )
    );

CREATE POLICY "Order items insert policy" ON order_items
    FOR INSERT WITH CHECK (true);

-- 7. RESERVATIONS
CREATE POLICY "Customer view own reservations" ON reservations
    FOR SELECT USING (
        customer_id = auth.uid() 
        OR (restaurant_id = current_user_restaurant_id() AND current_user_role() IN ('SUPER_ADMIN', 'RECEPTIONIST'))
    );

CREATE POLICY "Customer create reservation" ON reservations
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Staff update reservations" ON reservations
    FOR UPDATE USING (
        restaurant_id = current_user_restaurant_id() 
        AND current_user_role() IN ('SUPER_ADMIN', 'RECEPTIONIST')
    );

-- 8. PAYMENTS
CREATE POLICY "Customer view own payments" ON payments
    FOR SELECT USING (
        restaurant_id = current_user_restaurant_id() 
        AND current_user_role() IN ('SUPER_ADMIN', 'RECEPTIONIST')
    );

CREATE POLICY "Staff manage payments" ON payments
    FOR ALL USING (
        restaurant_id = current_user_restaurant_id() 
        AND current_user_role() IN ('SUPER_ADMIN', 'RECEPTIONIST')
    );

-- 9. HELP REQUESTS
CREATE POLICY "View help requests" ON help_requests
    FOR SELECT USING (
        restaurant_id = current_user_restaurant_id() 
        AND current_user_role() IN ('SUPER_ADMIN', 'RECEPTIONIST', 'WAITER')
    );

CREATE POLICY "Customer create help request" ON help_requests
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Waiter & Receptionist update help request" ON help_requests
    FOR UPDATE USING (
        restaurant_id = current_user_restaurant_id() 
        AND current_user_role() IN ('SUPER_ADMIN', 'RECEPTIONIST', 'WAITER')
    );

-- 10. CUSTOMER ISSUES
CREATE POLICY "Receptionist & Admin manage issues" ON customer_issues
    FOR ALL USING (
        restaurant_id = current_user_restaurant_id() 
        AND current_user_role() IN ('SUPER_ADMIN', 'RECEPTIONIST')
    );

-- 11. DELIVERY ADDRESSES
CREATE POLICY "Customer manage own addresses" ON delivery_addresses
    FOR ALL USING (customer_id = auth.uid());

-- 12. AUDIT LOGS
CREATE POLICY "Staff view audit logs" ON audit_logs
    FOR SELECT USING (
        restaurant_id = current_user_restaurant_id() 
        AND current_user_role() = 'SUPER_ADMIN'
    );
