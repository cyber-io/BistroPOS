-- ============================================================================
-- Migration 002: Indexes, Performance Optimizations & Multi-Tenant Constraints
-- ============================================================================

-- Tenant isolation indexes
CREATE INDEX IF NOT EXISTS idx_users_restaurant_id ON users(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_tables_restaurant_id ON tables(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_categories_restaurant_id ON menu_categories(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_items_restaurant_id ON menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_id ON orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_restaurant_id ON reservations(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_payments_restaurant_id ON payments(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_help_restaurant_id ON help_requests(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_issues_restaurant_id ON customer_issues(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_audit_restaurant_id ON audit_logs(restaurant_id);

-- Operational indexes for rapid querying
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_source ON orders(source);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_table_id ON orders(table_id);

-- Order Items lookup index
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_menu_item_id ON order_items(menu_item_id);

-- Reservation conflict checking index
CREATE INDEX IF NOT EXISTS idx_reservations_date_time ON reservations(restaurant_id, reservation_date, reservation_time, status);
CREATE INDEX IF NOT EXISTS idx_reservations_table_id ON reservations(table_id);
CREATE INDEX IF NOT EXISTS idx_reservations_booking_id ON reservations(booking_id);

-- Menu items availability and category lookup
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id, availability);
CREATE INDEX IF NOT EXISTS idx_menu_items_veg ON menu_items(veg_nonveg);

-- Real-time notification indexes
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, read_status);
CREATE INDEX IF NOT EXISTS idx_notifications_role ON notifications(restaurant_id, target_role, read_status);

-- Table QR code quick identification
CREATE INDEX IF NOT EXISTS idx_tables_qr_identifier ON tables(qr_identifier);

-- Audit log indexing
CREATE INDEX IF NOT EXISTS idx_audit_resource_action ON audit_logs(resource, action, created_at DESC);

-- Automatic updated_at trigger helper
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN SELECT unnest(ARRAY['restaurants', 'users', 'tables', 'menu_categories', 'menu_items', 'orders', 'reservations', 'payments', 'delivery_addresses'])
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_update_timestamp ON %I;', t);
        EXECUTE format('CREATE TRIGGER trg_update_timestamp BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_timestamp();', t);
    END LOOP;
END;
$$;
