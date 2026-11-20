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
