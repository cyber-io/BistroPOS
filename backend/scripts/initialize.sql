CREATE SCHEMA IF NOT EXISTS restaurant_pos;
SET search_path TO restaurant_pos,public;
-- ============================================================================
-- Complete Restaurant & Café Management System - PostgreSQL / Supabase Schema
-- Migration 001: Initial Schema
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. RESTAURANTS (Multi-Tenant Root)
CREATE TABLE IF NOT EXISTS restaurants (
    restaurant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    logo TEXT,
    address TEXT NOT NULL,
    phone VARCHAR(30) NOT NULL,
    email VARCHAR(255) NOT NULL,
    opening_hours JSONB NOT NULL DEFAULT '{"monday": {"open": "10:00", "close": "23:00"}, "tuesday": {"open": "10:00", "close": "23:00"}, "wednesday": {"open": "10:00", "close": "23:00"}, "thursday": {"open": "10:00", "close": "23:00"}, "friday": {"open": "10:00", "close": "23:30"}, "saturday": {"open": "10:00", "close": "23:30"}, "sunday": {"open": "10:00", "close": "23:00"}}'::jsonb,
    settings JSONB NOT NULL DEFAULT '{"tax_rate": 0.05, "delivery_fee": 40.00, "reservation_grace_period_mins": 10, "slot_duration_mins": 90, "max_party_size": 20, "currency": "INR"}'::jsonb,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. USERS (Staff and Customers)
CREATE TABLE IF NOT EXISTS users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(restaurant_id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(30),
    password_hash TEXT NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('SUPER_ADMIN', 'MANAGER', 'RECEPTIONIST', 'KITCHEN', 'WAITER', 'CUSTOMER')),
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. TABLES (Configurable Dine-In Tables)
CREATE TABLE IF NOT EXISTS tables (
    table_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
    table_number INT NOT NULL,
    capacity INT NOT NULL CHECK (capacity > 0),
    status VARCHAR(50) NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'RESERVED', 'OCCUPIED', 'WAITING_FOR_CLEANING', 'CLEANING', 'OUT_OF_SERVICE')),
    qr_identifier VARCHAR(100) NOT NULL UNIQUE,
    current_customer_name VARCHAR(255),
    assigned_waiter_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_restaurant_table_number UNIQUE (restaurant_id, table_number)
);

-- 4. MENU CATEGORIES
CREATE TABLE IF NOT EXISTS menu_categories (
    category_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. MENU ITEMS
CREATE TABLE IF NOT EXISTS menu_items (
    menu_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES menu_categories(category_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    image TEXT,
    veg_nonveg VARCHAR(20) NOT NULL CHECK (veg_nonveg IN ('VEG', 'NON_VEG', 'EGG')),
    availability BOOLEAN NOT NULL DEFAULT TRUE,
    spice_level VARCHAR(20) DEFAULT 'MEDIUM' CHECK (spice_level IN ('NONE', 'MILD', 'MEDIUM', 'SPICY', 'EXTRA_SPICY')),
    is_sweet BOOLEAN NOT NULL DEFAULT FALSE,
    add_ons JSONB DEFAULT '[]'::jsonb,
    customization_options JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. ORDERS
CREATE TABLE IF NOT EXISTS orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number VARCHAR(50) NOT NULL UNIQUE,
    restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
    customer_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    table_id UUID REFERENCES tables(table_id) ON DELETE SET NULL,
    source VARCHAR(50) NOT NULL CHECK (source IN ('DINE_IN_QR', 'DELIVERY', 'TAKEAWAY')),
    status VARCHAR(50) NOT NULL CHECK (status IN (
        'NEW', 'ACCEPTED', 'PREPARING', 'READY', 'PENDING_CONFIRMATION', 'DELIVERED', 
        'CANCELLED', 'OUT_FOR_DELIVERY', 'READY_FOR_PICKUP', 'PICKED_UP', 'CONFIRMATION_TIMEOUT'
    )),
    subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
    tax NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (tax >= 0),
    discount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (discount >= 0),
    delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (delivery_fee >= 0),
    total NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (total >= 0),
    delivery_address JSONB,
    takeaway_pickup_time TIMESTAMPTZ,
    rejection_reason TEXT,
    cancellation_reason TEXT,
    cancelled_by VARCHAR(50),
    special_instructions TEXT,
    served_at TIMESTAMPTZ,
    confirmation_requested_at TIMESTAMPTZ,
    customer_confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. ORDER ITEMS (WITH PRICE SNAPSHOT)
CREATE TABLE IF NOT EXISTS order_items (
    order_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(menu_item_id),
    item_name_snapshot VARCHAR(255) NOT NULL,
    price_snapshot NUMERIC(10, 2) NOT NULL CHECK (price_snapshot >= 0),
    quantity INT NOT NULL CHECK (quantity > 0),
    customization JSONB DEFAULT '{}'::jsonb,
    special_instruction TEXT,
    line_total NUMERIC(10, 2) NOT NULL CHECK (line_total >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. RESERVATIONS (Dynamic & Concurrency Protected)
CREATE TABLE IF NOT EXISTS reservations (
    reservation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id VARCHAR(50) NOT NULL UNIQUE,
    restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
    customer_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    table_id UUID REFERENCES tables(table_id) ON DELETE SET NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(30) NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    reservation_date DATE NOT NULL,
    reservation_time TIME NOT NULL,
    guest_count INT NOT NULL CHECK (guest_count > 0),
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN (
        'PENDING', 'CONFIRMED', 'ARRIVED', 'SEATED', 'COMPLETED', 
        'CANCELLED', 'NO_SHOW', 'RESCHEDULED', 'EXPIRED'
    )),
    grace_period_minutes INT NOT NULL DEFAULT 10,
    special_request TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. PAYMENTS (Idempotent & Secure)
CREATE TABLE IF NOT EXISTS payments (
    payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(order_id) ON DELETE SET NULL,
    reservation_id UUID REFERENCES reservations(reservation_id) ON DELETE SET NULL,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    method VARCHAR(50) NOT NULL CHECK (method IN ('CASH', 'UPI', 'CARD', 'ONLINE', 'NET_BANKING', 'WALLET')),
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'PAID', 'FAILED', 'REFUNDED')),
    transaction_id VARCHAR(100),
    idempotency_key VARCHAR(100) UNIQUE,
    gateway_signature TEXT,
    provider_response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. HELP REQUESTS (Waiter Assistance)
CREATE TABLE IF NOT EXISTS help_requests (
    request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
    table_id UUID NOT NULL REFERENCES tables(table_id) ON DELETE CASCADE,
    customer_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    assigned_waiter_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    assigned_waiter_name VARCHAR(255),
    message TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ASSIGNED', 'RESOLVED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ
);

-- 11. CUSTOMER ISSUES (Escalations & Resolution)
CREATE TABLE IF NOT EXISTS customer_issues (
    issue_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(order_id) ON DELETE SET NULL,
    table_id UUID REFERENCES tables(table_id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'INVESTIGATING', 'RESOLVED', 'ESCALATED')),
    assigned_staff_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    resolution TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- 12. NOTIFICATIONS (Real-time and persistent)
CREATE TABLE IF NOT EXISTS notifications (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
    recipient_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    target_role VARCHAR(50),
    type VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    related_entity_id UUID,
    read_status BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. DELIVERY ADDRESSES
CREATE TABLE IF NOT EXISTS delivery_addresses (
    address_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    mobile VARCHAR(30) NOT NULL,
    address TEXT NOT NULL,
    landmark TEXT,
    pincode VARCHAR(20) NOT NULL,
    delivery_instructions TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(restaurant_id) ON DELETE CASCADE,
    user_id UUID,
    user_role VARCHAR(50),
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100) NOT NULL,
    metadata JSONB,
    ip_address VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

-- ============================================================================
-- Function 001: Reservation Availability & Atomic Table Assignment
-- ============================================================================

-- Function to find all available suitable tables for a given date, time, and party size
CREATE OR REPLACE FUNCTION get_available_tables_for_slot(
    p_restaurant_id UUID,
    p_reservation_date DATE,
    p_reservation_time TIME,
    p_guest_count INT,
    p_duration_minutes INT DEFAULT 90
)
RETURNS TABLE (
    table_id UUID,
    table_number INT,
    capacity INT
) AS $$
DECLARE
    slot_start TIMESTAMPTZ;
    slot_end TIMESTAMPTZ;
BEGIN
    slot_start := (p_reservation_date + p_reservation_time)::TIMESTAMPTZ;
    slot_end := slot_start + (p_duration_minutes || ' minutes')::INTERVAL;

    RETURN QUERY
    SELECT 
        t.table_id,
        t.table_number,
        t.capacity
    FROM tables t
    WHERE t.restaurant_id = p_restaurant_id
      AND t.status != 'OUT_OF_SERVICE'
      AND t.capacity >= p_guest_count
      AND NOT EXISTS (
          SELECT 1 
          FROM reservations r
          WHERE r.table_id = t.table_id
            AND r.restaurant_id = p_restaurant_id
            AND r.status IN ('CONFIRMED', 'ARRIVED', 'SEATED')
            AND (
                -- Time overlap calculation: (StartA < EndB) AND (EndA > StartB)
                (r.reservation_date + r.reservation_time)::TIMESTAMPTZ < slot_end
                AND ((r.reservation_date + r.reservation_time)::TIMESTAMPTZ + (p_duration_minutes || ' minutes')::INTERVAL) > slot_start
            )
      )
    ORDER BY t.capacity ASC, t.table_number ASC;
END;
$$ LANGUAGE plpgsql;

-- Atomic Table Assignment with Concurrency Locking
CREATE OR REPLACE FUNCTION assign_table_and_create_reservation(
    p_restaurant_id UUID,
    p_customer_id UUID,
    p_customer_name VARCHAR,
    p_customer_phone VARCHAR,
    p_customer_email VARCHAR,
    p_reservation_date DATE,
    p_reservation_time TIME,
    p_guest_count INT,
    p_special_request TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_table_id UUID;
    v_table_number INT;
    v_booking_id VARCHAR;
    v_new_reservation_id UUID;
    v_slot_duration INT := 90;
    v_grace_period INT := 10;
BEGIN
    -- Acquire exclusive advisory lock for the restaurant's reservations to prevent race conditions
    PERFORM pg_advisory_xact_lock(hashtext(p_restaurant_id::text || '_' || p_reservation_date::text));

    -- Find the best fitting table (smallest table with capacity >= guest count that is not booked)
    SELECT t.table_id, t.table_number
    INTO v_table_id, v_table_number
    FROM get_available_tables_for_slot(
        p_restaurant_id, 
        p_reservation_date, 
        p_reservation_time, 
        p_guest_count, 
        v_slot_duration
    ) t
    LIMIT 1;

    IF v_table_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'No available tables matching party size for the selected time slot. Please choose another time.'
        );
    END IF;

    -- Generate a human-readable booking ID: RES-XXXXX
    v_booking_id := 'RES-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));

    -- Insert reservation
    INSERT INTO reservations (
        booking_id,
        restaurant_id,
        customer_id,
        table_id,
        customer_name,
        customer_phone,
        customer_email,
        reservation_date,
        reservation_time,
        guest_count,
        status,
        grace_period_minutes,
        special_request
    ) VALUES (
        v_booking_id,
        p_restaurant_id,
        p_customer_id,
        v_table_id,
        p_customer_name,
        p_customer_phone,
        p_customer_email,
        p_reservation_date,
        p_reservation_time,
        p_guest_count,
        'CONFIRMED',
        v_grace_period,
        p_special_request
    ) RETURNING reservation_id INTO v_new_reservation_id;

    -- Record Audit Log
    INSERT INTO audit_logs (
        restaurant_id,
        user_id,
        action,
        resource,
        metadata
    ) VALUES (
        p_restaurant_id,
        p_customer_id,
        'RESERVATION_CREATED',
        'reservations',
        jsonb_build_object(
            'reservation_id', v_new_reservation_id,
            'booking_id', v_booking_id,
            'table_number', v_table_number,
            'guests', p_guest_count,
            'date', p_reservation_date,
            'time', p_reservation_time
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'reservation_id', v_new_reservation_id,
        'booking_id', v_booking_id,
        'table_id', v_table_id,
        'table_number', v_table_number,
        'message', 'Booking confirmed successfully.'
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Function 002: Order State Machine & 1-Minute Cancellation Enforcement
-- ============================================================================

-- Function to validate order status transitions strictly by source
CREATE OR REPLACE FUNCTION validate_order_status_transition(
    p_current_status VARCHAR,
    p_new_status VARCHAR,
    p_source VARCHAR
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Immediate cancellation from NEW is allowed for all sources
    IF p_current_status = 'NEW' AND p_new_status = 'CANCELLED' THEN
        RETURN TRUE;
    END IF;

    -- Transitions by Order Source
    IF p_source = 'DINE_IN_QR' THEN
        IF (p_current_status = 'NEW' AND p_new_status = 'ACCEPTED') OR
           (p_current_status = 'ACCEPTED' AND p_new_status = 'PREPARING') OR
           (p_current_status = 'NEW' AND p_new_status = 'PREPARING') OR -- Direct accept to prep
           (p_current_status = 'PREPARING' AND p_new_status = 'READY') OR
           (p_current_status = 'READY' AND p_new_status = 'PENDING_CONFIRMATION') OR
           (p_current_status = 'PENDING_CONFIRMATION' AND p_new_status = 'DELIVERED') OR
           (p_current_status = 'PENDING_CONFIRMATION' AND p_new_status = 'CONFIRMATION_TIMEOUT') THEN
            RETURN TRUE;
        END IF;

    ELSIF p_source = 'DELIVERY' THEN
        IF (p_current_status = 'NEW' AND p_new_status = 'ACCEPTED') OR
           (p_current_status = 'ACCEPTED' AND p_new_status = 'PREPARING') OR
           (p_current_status = 'NEW' AND p_new_status = 'PREPARING') OR
           (p_current_status = 'PREPARING' AND p_new_status = 'READY') OR
           (p_current_status = 'READY' AND p_new_status = 'OUT_FOR_DELIVERY') OR
           (p_current_status = 'OUT_FOR_DELIVERY' AND p_new_status = 'DELIVERED') THEN
            RETURN TRUE;
        END IF;

    ELSIF p_source = 'TAKEAWAY' THEN
        IF (p_current_status = 'NEW' AND p_new_status = 'ACCEPTED') OR
           (p_current_status = 'ACCEPTED' AND p_new_status = 'PREPARING') OR
           (p_current_status = 'NEW' AND p_new_status = 'PREPARING') OR
           (p_current_status = 'PREPARING' AND p_new_status = 'READY_FOR_PICKUP') OR
           (p_current_status = 'READY_FOR_PICKUP' AND p_new_status = 'PICKED_UP') THEN
            RETURN TRUE;
        END IF;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Stored procedure to enforce the strict 1-minute cancellation rule
CREATE OR REPLACE FUNCTION cancel_customer_order(
    p_order_id UUID,
    p_user_id UUID,
    p_reason TEXT DEFAULT 'Customer cancelled'
)
RETURNS JSONB AS $$
DECLARE
    v_order RECORD;
    v_elapsed_seconds NUMERIC;
BEGIN
    SELECT * INTO v_order 
    FROM orders 
    WHERE order_id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Order not found.');
    END IF;

    -- Verify ownership (if user authenticated)
    IF p_user_id IS NOT NULL AND v_order.customer_id IS NOT NULL AND v_order.customer_id != p_user_id THEN
        RETURN jsonb_build_object('success', false, 'message', 'Unauthorized: You can only cancel your own orders.');
    END IF;

    -- Only orders in NEW status can be cancelled by customer
    IF v_order.status != 'NEW' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Order has already been processed and cannot be cancelled.');
    END IF;

    -- Calculate elapsed seconds since order creation
    v_elapsed_seconds := EXTRACT(EPOCH FROM (NOW() - v_order.created_at));

    IF v_elapsed_seconds > 60 THEN
        RETURN jsonb_build_object(
            'success', false, 
            'message', 'Cancellation window expired. Orders can only be cancelled within 1 minute of creation.',
            'elapsed_seconds', ROUND(v_elapsed_seconds, 1)
        );
    END IF;

    -- Perform cancellation
    UPDATE orders 
    SET status = 'CANCELLED',
        cancellation_reason = p_reason,
        cancelled_by = 'CUSTOMER',
        updated_at = NOW()
    WHERE order_id = p_order_id;

    -- Insert Audit Log
    INSERT INTO audit_logs (
        restaurant_id,
        user_id,
        action,
        resource,
        metadata
    ) VALUES (
        v_order.restaurant_id,
        p_user_id,
        'ORDER_CANCELLED',
        'orders',
        jsonb_build_object(
            'order_id', p_order_id,
            'reason', p_reason,
            'elapsed_seconds', ROUND(v_elapsed_seconds, 1)
        )
    );

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Order cancelled successfully within 1-minute window.',
        'order_id', p_order_id
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Seed Data: Sunrise Café & Restaurant
-- Full initial catalog, tables, users, and baseline operational data
-- ============================================================================

-- 1. SEED RESTAURANT
INSERT INTO restaurants (
    restaurant_id, 
    name, 
    logo, 
    address, 
    phone, 
    email, 
    opening_hours, 
    settings
) VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Bistro & Bloom',
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=300&q=80',
    'Plot 42, Gourmet Boulevard, Cyber Hub, Gurugram, HR - 122002',
    '+91 98765 43210',
    'contact@sunrisecafe.com',
    '{
        "monday": {"open": "10:00", "close": "23:00"},
        "tuesday": {"open": "10:00", "close": "23:00"},
        "wednesday": {"open": "10:00", "close": "23:00"},
        "thursday": {"open": "10:00", "close": "23:00"},
        "friday": {"open": "10:00", "close": "23:30"},
        "saturday": {"open": "10:00", "close": "23:30"},
        "sunday": {"open": "10:00", "close": "23:00"}
    }'::jsonb,
    '{
        "tax_rate": 0.05,
        "delivery_fee": 40.00,
        "reservation_grace_period_mins": 10,
        "slot_duration_mins": 90,
        "currency": "INR"
    }'::jsonb
) ON CONFLICT (restaurant_id) DO NOTHING;

-- 2. SEED USERS (Password for all demo accounts: Password@123)
-- BCrypt hash for 'Password@123': $2a$11$w8/q3m2eA8zJ5m7nB3r9TuG4h.8Z.u2v8kP.vYg/H8K1.p2wEa2XW
INSERT INTO users (user_id, restaurant_id, name, email, phone, password_hash, role, status, email_verified) VALUES
('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Super Admin Admin', 'superadmin@sunrisecafe.com', '+91 99999 00001', '$2a$11$w8/q3m2eA8zJ5m7nB3r9TuG4h.8Z.u2v8kP.vYg/H8K1.p2wEa2XW', 'SUPER_ADMIN', 'ACTIVE', true),
('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Ananya Sharma (Receptionist)', 'receptionist@sunrisecafe.com', '+91 99999 00002', '$2a$11$w8/q3m2eA8zJ5m7nB3r9TuG4h.8Z.u2v8kP.vYg/H8K1.p2wEa2XW', 'RECEPTIONIST', 'ACTIVE', true),
('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Chef Vikram (Kitchen Head)', 'kitchen@sunrisecafe.com', '+91 99999 00003', '$2a$11$w8/q3m2eA8zJ5m7nB3r9TuG4h.8Z.u2v8kP.vYg/H8K1.p2wEa2XW', 'KITCHEN', 'ACTIVE', true),
('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Waiter Kunal', 'waiter.kunal@sunrisecafe.com', '+91 99999 00004', '$2a$11$w8/q3m2eA8zJ5m7nB3r9TuG4h.8Z.u2v8kP.vYg/H8K1.p2wEa2XW', 'WAITER', 'ACTIVE', true),
('b0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'Waiter Priya', 'waiter.priya@sunrisecafe.com', '+91 99999 00005', '$2a$11$w8/q3m2eA8zJ5m7nB3r9TuG4h.8Z.u2v8kP.vYg/H8K1.p2wEa2XW', 'WAITER', 'ACTIVE', true),
('b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'Rahul Verma (Customer)', 'customer.rahul@example.com', '+91 98888 77777', '$2a$11$w8/q3m2eA8zJ5m7nB3r9TuG4h.8Z.u2v8kP.vYg/H8K1.p2wEa2XW', 'CUSTOMER', 'ACTIVE', true)
ON CONFLICT (email) DO NOTHING;

-- 3. SEED TABLES (12 configurable tables with capacity 2, 4, 6, 8, all initialized as AVAILABLE)
INSERT INTO tables (table_id, restaurant_id, table_number, capacity, status, qr_identifier) VALUES
('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 1, 2, 'AVAILABLE', 'QR_REST1_TBL01'),
('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 2, 2, 'AVAILABLE', 'QR_REST1_TBL02'),
('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 3, 4, 'AVAILABLE', 'QR_REST1_TBL03'),
('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 4, 4, 'AVAILABLE', 'QR_REST1_TBL04'),
('c0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 5, 4, 'AVAILABLE', 'QR_REST1_TBL05'),
('c0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 6, 6, 'AVAILABLE', 'QR_REST1_TBL06'),
('c0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 7, 6, 'AVAILABLE', 'QR_REST1_TBL07'),
('c0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 8, 8, 'AVAILABLE', 'QR_REST1_TBL08'),
('c0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 9, 2, 'AVAILABLE', 'QR_REST1_TBL09'),
('c0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 10, 4, 'AVAILABLE', 'QR_REST1_TBL10'),
('c0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 11, 4, 'AVAILABLE', 'QR_REST1_TBL11'),
('c0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 12, 8, 'AVAILABLE', 'QR_REST1_TBL12'),
-- Royal Palace Tables
('c0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000002', 1, 2, 'AVAILABLE', 'QR_REST2_TBL01'),
('c0000000-0000-0000-0000-000000000022', 'a0000000-0000-0000-0000-000000000002', 2, 2, 'AVAILABLE', 'QR_REST2_TBL02'),
('c0000000-0000-0000-0000-000000000023', 'a0000000-0000-0000-0000-000000000002', 3, 4, 'AVAILABLE', 'QR_REST2_TBL03'),
('c0000000-0000-0000-0000-000000000024', 'a0000000-0000-0000-0000-000000000002', 4, 4, 'AVAILABLE', 'QR_REST2_TBL04'),
('c0000000-0000-0000-0000-000000000025', 'a0000000-0000-0000-0000-000000000002', 5, 4, 'AVAILABLE', 'QR_REST2_TBL05'),
('c0000000-0000-0000-0000-000000000026', 'a0000000-0000-0000-0000-000000000002', 6, 6, 'AVAILABLE', 'QR_REST2_TBL06'),
('c0000000-0000-0000-0000-000000000027', 'a0000000-0000-0000-0000-000000000002', 7, 6, 'AVAILABLE', 'QR_REST2_TBL07'),
('c0000000-0000-0000-0000-000000000028', 'a0000000-0000-0000-0000-000000000002', 8, 8, 'AVAILABLE', 'QR_REST2_TBL08'),
('c0000000-0000-0000-0000-000000000029', 'a0000000-0000-0000-0000-000000000002', 9, 2, 'AVAILABLE', 'QR_REST2_TBL09'),
('c0000000-0000-0000-0000-00000000002a', 'a0000000-0000-0000-0000-000000000002', 10, 4, 'AVAILABLE', 'QR_REST2_TBL10'),
('c0000000-0000-0000-0000-00000000002b', 'a0000000-0000-0000-0000-000000000002', 11, 4, 'AVAILABLE', 'QR_REST2_TBL11'),
('c0000000-0000-0000-0000-00000000002c', 'a0000000-0000-0000-0000-000000000002', 12, 8, 'AVAILABLE', 'QR_REST2_TBL12'),
-- City Restaurant Tables
('c0000000-0000-0000-0000-000000000031', 'a0000000-0000-0000-0000-000000000003', 1, 2, 'AVAILABLE', 'QR_REST3_TBL01'),
('c0000000-0000-0000-0000-000000000032', 'a0000000-0000-0000-0000-000000000003', 2, 2, 'AVAILABLE', 'QR_REST3_TBL02'),
('c0000000-0000-0000-0000-000000000033', 'a0000000-0000-0000-0000-000000000003', 3, 4, 'AVAILABLE', 'QR_REST3_TBL03'),
('c0000000-0000-0000-0000-000000000034', 'a0000000-0000-0000-0000-000000000003', 4, 4, 'AVAILABLE', 'QR_REST3_TBL04'),
('c0000000-0000-0000-0000-000000000035', 'a0000000-0000-0000-0000-000000000003', 5, 4, 'AVAILABLE', 'QR_REST3_TBL05'),
('c0000000-0000-0000-0000-000000000036', 'a0000000-0000-0000-0000-000000000003', 6, 6, 'AVAILABLE', 'QR_REST3_TBL06'),
('c0000000-0000-0000-0000-000000000037', 'a0000000-0000-0000-0000-000000000003', 7, 6, 'AVAILABLE', 'QR_REST3_TBL07'),
('c0000000-0000-0000-0000-000000000038', 'a0000000-0000-0000-0000-000000000003', 8, 8, 'AVAILABLE', 'QR_REST3_TBL08'),
('c0000000-0000-0000-0000-000000000039', 'a0000000-0000-0000-0000-000000000003', 9, 2, 'AVAILABLE', 'QR_REST3_TBL09'),
('c0000000-0000-0000-0000-00000000003a', 'a0000000-0000-0000-0000-000000000003', 10, 4, 'AVAILABLE', 'QR_REST3_TBL10'),
('c0000000-0000-0000-0000-00000000003b', 'a0000000-0000-0000-0000-000000000003', 11, 4, 'AVAILABLE', 'QR_REST3_TBL11'),
('c0000000-0000-0000-0000-00000000003c', 'a0000000-0000-0000-0000-000000000003', 12, 8, 'AVAILABLE', 'QR_REST3_TBL12')
ON CONFLICT (table_id) DO NOTHING;

-- 4. SEED MENU CATEGORIES (8 categories from spec)
INSERT INTO menu_categories (category_id, restaurant_id, name, description, sort_order) VALUES
('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Pizza', 'Wood-fired gourmet artisan pizzas', 1),
('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Burger', 'Juicy handcrafted burgers on brioche buns', 2),
('d0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Chinese', 'Wok-tossed noodles, dim sums & spicy gravies', 3),
('d0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Indian', 'Rich aromatic curries, breads, and tandoori specials', 4),
('d0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'South Indian', 'Crisp dosas, fluffy idlis, and traditional chutneys', 5),
('d0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'North Indian', 'Dal makhani, paneer tikka, and butter naan', 6),
('d0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'Desserts', 'Decadent sweets, gulab jamun, and artisanal cakes', 7),
('d0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'Beverages', 'Specialty coffees, fresh mocktails, and shakes', 8)
ON CONFLICT (category_id) DO NOTHING;

-- 5. SEED MENU ITEMS
INSERT INTO menu_items (menu_item_id, restaurant_id, category_id, name, description, price, image, veg_nonveg, availability, spice_level, is_sweet, customization_options, add_ons) VALUES
-- Pizza
('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'Margherita Supreme Pizza', 'San Marzano tomato sauce, fresh mozzarella, organic basil, extra virgin olive oil', 399.00, 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?auto=format&fit=crop&w=400&q=80', 'VEG', true, 'NONE', false, '[{"name": "Crust", "choices": ["Thin Crust", "Cheese Burst (+₹60)", "Wheat Crust"]}]'::jsonb, '[{"name": "Extra Mozzarella", "price": 50}, {"name": "Jalapenos", "price": 30}]'::jsonb),
('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'Spicy Paneer Tikka Pizza', 'Tandoori spiced paneer cubes, capsicum, red onions, mozzarella, spicy drizzle', 469.00, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=400&q=80', 'VEG', true, 'SPICY', false, '[{"name": "Crust", "choices": ["Regular", "Cheese Burst (+₹60)"]}]'::jsonb, '[{"name": "Extra Paneer", "price": 60}]'::jsonb),
('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'BBQ Chicken Feast Pizza', 'Smoked BBQ chicken chunks, caramelized onions, smoked gouda & mozzarella', 529.00, 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=400&q=80', 'NON_VEG', true, 'MEDIUM', false, '[{"name": "Crust", "choices": ["Thin Crust", "Cheese Burst (+₹70)"]}]'::jsonb, '[{"name": "Extra Chicken", "price": 80}]'::jsonb),

-- Burger
('e0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'Crispy Veggie Crunch Burger', 'Crispy spiced potato-corn patty, lettuce, tomatoes, secret house chipotle sauce', 219.00, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80', 'VEG', true, 'MILD', false, '[{"name": "Bun", "choices": ["Brioche", "Gluten Free (+₹40)"]}]'::jsonb, '[{"name": "Cheddar Cheese Slice", "price": 30}, {"name": "Peri-peri Fries Combo", "price": 99}]'::jsonb),
('e0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'Smokey Grilled Chicken Burger', 'Tender grilled chicken breast, sharp cheddar, gherkins, caramelized onions, garlic aioli', 319.00, 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=400&q=80', 'NON_VEG', true, 'MEDIUM', false, '[{"name": "Bun", "choices": ["Brioche", "Multi-grain"]}]'::jsonb, '[{"name": "Bacon Rashers (Chicken)", "price": 60}]'::jsonb),

-- Chinese
('e0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'Chilli Paneer Dry', 'Crispy cottage cheese cubes tossed with bell peppers, spring onions, and spicy soy-chilli glaze', 299.00, 'https://images.unsplash.com/photo-1541832676-9b763b0239ab?auto=format&fit=crop&w=400&q=80', 'VEG', true, 'SPICY', false, '[{"name": "Style", "choices": ["Dry", "Semi-Gravy", "Gravy"]}]'::jsonb, '[]'::jsonb),
('e0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000003', 'Hakka Noodles Wok Special', 'Fresh wok-tossed egg/veg noodles with shredded cabbage, carrots, scallions and aromatic sesame', 249.00, 'https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=400&q=80', 'VEG', true, 'MILD', false, '[{"name": "Variation", "choices": ["Veg", "Egg (+₹30)", "Chicken (+₹70)"]}]'::jsonb, '[]'::jsonb),

-- Indian / North Indian
('e0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000006', 'Dal Makhani Bukhara', 'Slow-cooked black lentils simmered overnight with butter, cream, and Kashmiri spices', 349.00, 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=400&q=80', 'VEG', true, 'MILD', false, '[]'::jsonb, '[{"name": "Garlic Naan", "price": 60}, {"name": "Jeera Rice", "price": 120}]'::jsonb),
('e0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000006', 'Paneer Butter Masala', 'Fresh malai paneer steeped in a rich, buttery, velvety tomato and cashew gravy', 379.00, 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=400&q=80', 'VEG', true, 'MEDIUM', false, '[]'::jsonb, '[{"name": "Butter Roti (2 pcs)", "price": 50}]'::jsonb),
('e0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000004', 'Butter Chicken Delhi Special', 'Chargrilled boneless chicken tikkas simmered in satin smooth butter tomato sauce', 449.00, 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=400&q=80', 'NON_VEG', true, 'MEDIUM', false, '[]'::jsonb, '[{"name": "Butter Naan (2 pcs)", "price": 80}]'::jsonb),

-- South Indian
('e0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000005', 'Mysore Masala Dosa', 'Golden crispy rice crepe smeared with fiery red garlic-lentil chutney, stuffed with spiced potato mash', 229.00, 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=400&q=80', 'VEG', true, 'SPICY', false, '[{"name": "Roast", "choices": ["Ghee Roast (+₹30)", "Butter Roast (+₹30)"]}]'::jsonb, '[{"name": "Extra Sambar", "price": 25}]'::jsonb),
('e0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000005', 'Ghee Podi Idli (4 pcs)', 'Steamed button rice cakes drenched in aromatic desi ghee and gun-powder podi spice', 189.00, 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=400&q=80', 'VEG', true, 'MEDIUM', false, '[]'::jsonb, '[]'::jsonb),

-- Desserts
('e0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000007', 'Warm Gulab Jamun with Rabri', 'Two soft golden cottage cheese dumplings soaked in rose-cardamom syrup, crowned with chilled rabri', 179.00, 'https://images.unsplash.com/photo-1593798603546-b302636a0d0d?auto=format&fit=crop&w=400&q=80', 'VEG', true, 'NONE', true, '[]'::jsonb, '[{"name": "Pistachio Topping", "price": 20}]'::jsonb),
('e0000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000007', 'Belgian Chocolate Lava Cake', 'Warm molten chocolate cake with gooey center, served with Madagascan vanilla gelato', 249.00, 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=400&q=80', 'VEG', true, 'NONE', true, '[]'::jsonb, '[{"name": "Extra Scoop Gelato", "price": 60}]'::jsonb),

-- Beverages
('e0000000-0000-0000-0000-000000000015', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000008', 'Fresh Mint Mojito', 'Fresh garden mint, crushed lime, cane sugar, and sparkling soda over ice', 159.00, 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=400&q=80', 'VEG', true, 'NONE', true, '[{"name": "Sweetness", "choices": ["Regular", "Low Sugar", "No Sugar"]}]'::jsonb, '[]'::jsonb),
('e0000000-0000-0000-0000-000000000016', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000008', 'Sunrise Signature Cold Brew', '18-hour steeped single-origin Arabica cold brew with vanilla cream froth', 199.00, 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?auto=format&fit=crop&w=400&q=80', 'VEG', true, 'NONE', false, '[{"name": "Milk", "choices": ["Whole Milk", "Oat Milk (+₹40)", "Almond Milk (+₹40)"]}]'::jsonb, '[]'::jsonb)
ON CONFLICT (menu_item_id) DO NOTHING;


ALTER TABLE restaurant_pos.orders ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE restaurant_pos.orders ADD COLUMN IF NOT EXISTS customer_phone text;
ALTER TABLE restaurant_pos.orders ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency ON restaurant_pos.orders(restaurant_id,idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Defense in depth for the isolated application schema. Direct database guest
-- access is denied; guest capabilities are verified by the .NET API.
CREATE OR REPLACE FUNCTION restaurant_pos.is_staff(p_restaurant uuid, p_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = restaurant_pos, pg_catalog
AS $$ SELECT EXISTS (
    SELECT 1 FROM restaurant_pos.users
    WHERE user_id = auth.uid() AND status = 'ACTIVE'
      AND (role = 'SUPER_ADMIN' OR (restaurant_id = p_restaurant AND role = ANY(p_roles)))
); $$;
REVOKE ALL ON FUNCTION restaurant_pos.is_staff(uuid,text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION restaurant_pos.is_staff(uuid,text[]) TO authenticated;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['restaurants','users','tables','menu_categories','menu_items','orders','order_items','reservations','payments','help_requests','customer_issues','notifications','delivery_addresses','audit_logs'] LOOP
    EXECUTE format('ALTER TABLE restaurant_pos.%I ENABLE ROW LEVEL SECURITY',t);
  END LOOP;
END $$;
DROP POLICY IF EXISTS "Restaurant information" ON restaurant_pos.restaurants;
CREATE POLICY "Restaurant information" ON restaurant_pos.restaurants FOR SELECT USING (status='ACTIVE');
DROP POLICY IF EXISTS "Menu categories" ON restaurant_pos.menu_categories;
CREATE POLICY "Menu categories" ON restaurant_pos.menu_categories FOR SELECT USING (status='ACTIVE');
DROP POLICY IF EXISTS "Menu items" ON restaurant_pos.menu_items;
CREATE POLICY "Menu items" ON restaurant_pos.menu_items FOR SELECT USING (true);
DROP POLICY IF EXISTS "Own profile" ON restaurant_pos.users;
CREATE POLICY "Own profile" ON restaurant_pos.users FOR SELECT USING (user_id=auth.uid() OR restaurant_pos.is_staff(restaurant_id,ARRAY['RECEPTIONIST']));
DROP POLICY IF EXISTS "Staff tables" ON restaurant_pos.tables;
CREATE POLICY "Staff tables" ON restaurant_pos.tables FOR ALL USING (restaurant_pos.is_staff(restaurant_id,ARRAY['RECEPTIONIST','KITCHEN','WAITER']));
DROP POLICY IF EXISTS "Order owner or staff" ON restaurant_pos.orders;
CREATE POLICY "Order owner or staff" ON restaurant_pos.orders FOR SELECT USING (customer_id=auth.uid() OR restaurant_pos.is_staff(restaurant_id,ARRAY['RECEPTIONIST','KITCHEN','WAITER']));
DROP POLICY IF EXISTS "Staff orders" ON restaurant_pos.orders;
CREATE POLICY "Staff orders" ON restaurant_pos.orders FOR ALL USING (restaurant_pos.is_staff(restaurant_id,ARRAY['RECEPTIONIST','KITCHEN','WAITER']));
DROP POLICY IF EXISTS "Order items follow order" ON restaurant_pos.order_items;
CREATE POLICY "Order items follow order" ON restaurant_pos.order_items FOR SELECT USING (EXISTS(SELECT 1 FROM restaurant_pos.orders o WHERE o.order_id=order_items.order_id));
DROP POLICY IF EXISTS "Booking owner" ON restaurant_pos.reservations;
CREATE POLICY "Booking owner" ON restaurant_pos.reservations FOR SELECT USING (customer_id=auth.uid() OR restaurant_pos.is_staff(restaurant_id,ARRAY['RECEPTIONIST']));
DROP POLICY IF EXISTS "Staff reservations" ON restaurant_pos.reservations;
CREATE POLICY "Staff reservations" ON restaurant_pos.reservations FOR ALL USING (restaurant_pos.is_staff(restaurant_id,ARRAY['RECEPTIONIST']));
DROP POLICY IF EXISTS "Staff payments" ON restaurant_pos.payments;
CREATE POLICY "Staff payments" ON restaurant_pos.payments FOR ALL USING (restaurant_pos.is_staff(restaurant_id,ARRAY['RECEPTIONIST']));
DROP POLICY IF EXISTS "Scoped help" ON restaurant_pos.help_requests;
CREATE POLICY "Scoped help" ON restaurant_pos.help_requests FOR SELECT USING (customer_id=auth.uid() OR restaurant_pos.is_staff(restaurant_id,ARRAY['RECEPTIONIST','WAITER']));
DROP POLICY IF EXISTS "Staff help" ON restaurant_pos.help_requests;
CREATE POLICY "Staff help" ON restaurant_pos.help_requests FOR ALL USING (restaurant_pos.is_staff(restaurant_id,ARRAY['RECEPTIONIST','WAITER']));
DROP POLICY IF EXISTS "Staff issues" ON restaurant_pos.customer_issues;
CREATE POLICY "Staff issues" ON restaurant_pos.customer_issues FOR ALL USING (restaurant_pos.is_staff(restaurant_id,ARRAY['RECEPTIONIST']));
DROP POLICY IF EXISTS "Own addresses" ON restaurant_pos.delivery_addresses;
CREATE POLICY "Own addresses" ON restaurant_pos.delivery_addresses FOR ALL USING (customer_id=auth.uid());
DROP POLICY IF EXISTS "Staff audit" ON restaurant_pos.audit_logs;
CREATE POLICY "Staff audit" ON restaurant_pos.audit_logs FOR SELECT USING (restaurant_pos.is_staff(restaurant_id,ARRAY['RECEPTIONIST']));
DROP POLICY IF EXISTS "Own notifications" ON restaurant_pos.notifications;
CREATE POLICY "Own notifications" ON restaurant_pos.notifications FOR SELECT USING (recipient_id=auth.uid() OR restaurant_pos.is_staff(restaurant_id,ARRAY[target_role]));
