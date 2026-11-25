-- ============================================================================
-- 003_hardened_rls_policies.sql
-- Replaces overly permissive USING (true) policies from 002_fix_rls_policies.sql
-- with strict multi-tenant & role-scoped policies (including MANAGER parity).
-- Run manually against PostgreSQL / Supabase SQL Editor before staging/prod!
-- ============================================================================

-- 1. Update restaurant_pos.is_staff to ensure MANAGER is covered consistently
CREATE OR REPLACE FUNCTION restaurant_pos.is_staff(p_restaurant uuid, p_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = restaurant_pos, pg_catalog
AS $$
    SELECT EXISTS (
        SELECT 1 FROM restaurant_pos.users
        WHERE user_id = auth.uid()
          AND status = 'ACTIVE'
          AND (
              role = 'SUPER_ADMIN'
              OR (restaurant_id = p_restaurant AND (role = ANY(p_roles) OR role = 'MANAGER'))
          )
    );
$$;

REVOKE ALL ON FUNCTION restaurant_pos.is_staff(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION restaurant_pos.is_staff(uuid, text[]) TO authenticated;

-- 2. Re-harden public schema policies if PostgREST is enabled
DO $$
DECLARE
    tbl text;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['users', 'orders', 'order_items', 'reservations', 'tables', 'help_requests', 'menu_items', 'customer_issues', 'payments', 'audit_logs']
    LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
        END IF;
    END LOOP;
END $$;

-- Drop wide-open policies on public.users & sensitive tables
DROP POLICY IF EXISTS "Allow public registration" ON public.users;
DROP POLICY IF EXISTS "Allow users select for authentication" ON public.users;
DROP POLICY IF EXISTS "Allow users update own profile" ON public.users;
DROP POLICY IF EXISTS "SuperAdmin manages users" ON public.users;
DROP POLICY IF EXISTS "Customer and staff view orders" ON public.orders;
DROP POLICY IF EXISTS "Customer create orders" ON public.orders;
DROP POLICY IF EXISTS "Staff update orders" ON public.orders;
DROP POLICY IF EXISTS "Order items view policy" ON public.order_items;
DROP POLICY IF EXISTS "Order items insert policy" ON public.order_items;
DROP POLICY IF EXISTS "Customer and staff view reservations" ON public.reservations;
DROP POLICY IF EXISTS "Customer create reservation" ON public.reservations;
DROP POLICY IF EXISTS "Staff update reservations" ON public.reservations;
DROP POLICY IF EXISTS "Staff and system update tables" ON public.tables;
DROP POLICY IF EXISTS "Staff manage tables" ON public.tables;
DROP POLICY IF EXISTS "Customer create help request" ON public.help_requests;
DROP POLICY IF EXISTS "View help requests" ON public.help_requests;
DROP POLICY IF EXISTS "Waiter & Receptionist update help request" ON public.help_requests;
DROP POLICY IF EXISTS "Staff update item availability" ON public.menu_items;
DROP POLICY IF EXISTS "Admin manage menu items" ON public.menu_items;
DROP POLICY IF EXISTS "Manage customer issues" ON public.customer_issues;

-- Ensure restaurant_pos policies remain strict (deny anon DB access; .NET API handles guest capabilities)
DROP POLICY IF EXISTS "Own profile" ON restaurant_pos.users;
CREATE POLICY "Own profile" ON restaurant_pos.users
    FOR SELECT USING (
        user_id = auth.uid()
        OR restaurant_pos.is_staff(restaurant_id, ARRAY['MANAGER', 'RECEPTIONIST'])
    );

DROP POLICY IF EXISTS "Staff orders" ON restaurant_pos.orders;
CREATE POLICY "Staff orders" ON restaurant_pos.orders
    FOR ALL USING (
        restaurant_pos.is_staff(restaurant_id, ARRAY['MANAGER', 'RECEPTIONIST', 'KITCHEN', 'WAITER'])
    );

DROP POLICY IF EXISTS "Staff reservations" ON restaurant_pos.reservations;
CREATE POLICY "Staff reservations" ON restaurant_pos.reservations
    FOR ALL USING (
        restaurant_pos.is_staff(restaurant_id, ARRAY['MANAGER', 'RECEPTIONIST'])
    );

DROP POLICY IF EXISTS "Staff payments" ON restaurant_pos.payments;
CREATE POLICY "Staff payments" ON restaurant_pos.payments
    FOR ALL USING (
        restaurant_pos.is_staff(restaurant_id, ARRAY['MANAGER', 'RECEPTIONIST'])
    );

DROP POLICY IF EXISTS "Staff issues" ON restaurant_pos.customer_issues;
CREATE POLICY "Staff issues" ON restaurant_pos.customer_issues
    FOR ALL USING (
        restaurant_pos.is_staff(restaurant_id, ARRAY['MANAGER', 'RECEPTIONIST'])
    );

DROP POLICY IF EXISTS "Staff audit" ON restaurant_pos.audit_logs;
CREATE POLICY "Staff audit" ON restaurant_pos.audit_logs
    FOR SELECT USING (
        restaurant_pos.is_staff(restaurant_id, ARRAY['MANAGER'])
    );
