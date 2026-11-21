-- ============================================================================
-- Migration 009: Phase 3 to Phase 5 (Loyalty, Feedback, Wi-Fi, Analytics)
-- ============================================================================

SET search_path TO restaurant_pos, public;

-- 1. Customer Loyalty table
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

-- 2. Customer Feedback & Review table
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

-- 3. Extend restaurants table with Wi-Fi & Subscription settings
ALTER TABLE restaurant_pos.restaurants
ADD COLUMN IF NOT EXISTS wifi_ssid VARCHAR(100) DEFAULT 'Bistro-HighSpeed-Guest',
ADD COLUMN IF NOT EXISTS wifi_password VARCHAR(100) DEFAULT 'Bistro@2026',
ADD COLUMN IF NOT EXISTS wifi_enabled BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS google_review_url VARCHAR(255) DEFAULT 'https://maps.google.com',
ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(50) DEFAULT 'PRO';

-- 4. Extend payments table with tips & split details
ALTER TABLE restaurant_pos.payments
ADD COLUMN IF NOT EXISTS tip_amount NUMERIC(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS split_count INT DEFAULT 1,
ADD COLUMN IF NOT EXISTS split_type VARCHAR(50) DEFAULT 'FULL';

-- 5. Seed initial mock loyalty accounts for testing
INSERT INTO restaurant_pos.customer_loyalty (restaurant_id, customer_phone, customer_name, customer_email, points_balance, lifetime_points, tier)
SELECT 
    restaurant_id,
    '9876543210',
    'Rahul Sharma',
    'rahul.sharma@example.com',
    420,
    1250,
    'SILVER'
FROM restaurant_pos.restaurants
LIMIT 1
ON CONFLICT (restaurant_id, customer_phone) DO NOTHING;
