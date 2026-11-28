-- Non-destructive migration: TextBee SMS Gateway tables and Supabase RLS policies
-- Safe to run multiple times (idempotent).

CREATE TABLE IF NOT EXISTS restaurant_pos.sms_logs (
    sms_log_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id uuid NULL REFERENCES restaurant_pos.restaurants(restaurant_id) ON DELETE CASCADE,
    event_type varchar(64) NOT NULL DEFAULT 'SMS',
    recipient_phone varchar(32) NOT NULL,
    message_body text NOT NULL,
    provider_message_id varchar(128) NULL,
    status varchar(32) NOT NULL DEFAULT 'QUEUED',
    attempts integer NOT NULL DEFAULT 0,
    dedup_key varchar(128) NULL,
    error_message text NULL,
    reference_id varchar(128) NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    sent_at timestamptz NULL,
    delivered_at timestamptz NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_sms_logs_restaurant_created
    ON restaurant_pos.sms_logs (restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_sms_logs_dedup_key
    ON restaurant_pos.sms_logs (dedup_key)
    WHERE dedup_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_sms_logs_provider_msg
    ON restaurant_pos.sms_logs (provider_message_id)
    WHERE provider_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS restaurant_pos.sms_preferences (
    preference_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id uuid NOT NULL UNIQUE REFERENCES restaurant_pos.restaurants(restaurant_id) ON DELETE CASCADE,
    order_confirmation_enabled boolean NOT NULL DEFAULT true,
    order_status_enabled boolean NOT NULL DEFAULT true,
    digital_receipt_enabled boolean NOT NULL DEFAULT true,
    reservation_enabled boolean NOT NULL DEFAULT true,
    payment_confirmation_enabled boolean NOT NULL DEFAULT true,
    staff_shift_enabled boolean NOT NULL DEFAULT true,
    inventory_alert_enabled boolean NOT NULL DEFAULT true,
    loyalty_enabled boolean NOT NULL DEFAULT true,
    promotional_enabled boolean NOT NULL DEFAULT false,
    manager_alert_phone varchar(32) NULL,
    templates_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS restaurant_pos.sms_consents (
    consent_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id uuid NOT NULL REFERENCES restaurant_pos.restaurants(restaurant_id) ON DELETE CASCADE,
    customer_phone varchar(32) NOT NULL,
    promotional_opt_in boolean NOT NULL DEFAULT false,
    opted_out boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (restaurant_id, customer_phone)
);

-- Enable Row Level Security (Supabase)
ALTER TABLE restaurant_pos.sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_pos.sms_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_pos.sms_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff sms logs" ON restaurant_pos.sms_logs;
CREATE POLICY "Staff sms logs" ON restaurant_pos.sms_logs
    FOR ALL USING (restaurant_pos.is_staff(restaurant_id, ARRAY['MANAGER','RECEPTIONIST']));

DROP POLICY IF EXISTS "Staff sms preferences" ON restaurant_pos.sms_preferences;
CREATE POLICY "Staff sms preferences" ON restaurant_pos.sms_preferences
    FOR ALL USING (restaurant_pos.is_staff(restaurant_id, ARRAY['MANAGER','RECEPTIONIST']));

DROP POLICY IF EXISTS "Staff sms consents" ON restaurant_pos.sms_consents;
CREATE POLICY "Staff sms consents" ON restaurant_pos.sms_consents
    FOR ALL USING (restaurant_pos.is_staff(restaurant_id, ARRAY['MANAGER','RECEPTIONIST']));
