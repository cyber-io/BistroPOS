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
