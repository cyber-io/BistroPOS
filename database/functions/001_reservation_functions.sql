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
