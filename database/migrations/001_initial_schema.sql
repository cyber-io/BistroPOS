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
    role VARCHAR(50) NOT NULL CHECK (role IN ('SUPER_ADMIN', 'RECEPTIONIST', 'KITCHEN', 'WAITER', 'CUSTOMER')),
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
