-- ============================================================
-- BistroPOS - Mandatory Two-Restaurant Security Test Seed Data
-- Section 23: Two-Restaurant Test Scenario
-- Restaurant A: Royal Palace (Manager: Rahul)
-- Restaurant B: City Restaurant (Manager: Amit)
-- Platform Owner: Super Admin (System-Wide)
-- ============================================================

begin;

-- 1. Create Restaurants
insert into public.restaurants (restaurant_id, name, slug, address, phone, email, status)
values
  ('11111111-1111-1111-1111-111111111111', 'Royal Palace', 'royal-palace', 'Civil Lines, Jaipur', '+91 98000 00001', 'contact@royalpalace.com', 'ACTIVE'),
  ('22222222-2222-2222-2222-222222222222', 'City Restaurant', 'city-restaurant', 'Connaught Place, New Delhi', '+91 98000 00002', 'contact@cityrestaurant.com', 'ACTIVE')
on conflict (restaurant_id) do nothing;

-- 2. Restaurant Settings
insert into public.restaurant_settings (setting_id, restaurant_id, tax_percentage, currency, delivery_fee, discount_limit)
values
  ('11111111-1111-1111-1111-000000000001', '11111111-1111-1111-1111-111111111111', 5.00, 'INR', 50.00, 25.00),
  ('22222222-2222-2222-2222-000000000001', '22222222-2222-2222-2222-222222222222', 5.00, 'INR', 40.00, 20.00)
on conflict (restaurant_id) do nothing;

-- 3. Mock Supabase Auth Users (using pgcrypto or auth.users if available)
-- Note: In production Supabase Auth manages auth.users. Here we ensure foreign keys resolve.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'auth' and table_name = 'users') then
    insert into auth.users (id, email)
    values
      ('00000000-0000-0000-0000-000000000001', 'superadmin@bistropos.com'),
      ('aaaaaaaa-1111-1111-1111-111111111111', 'rahul.manager@royalpalace.com'),
      ('aaaaaaaa-1111-1111-1111-222222222222', 'reception@royalpalace.com'),
      ('aaaaaaaa-1111-1111-1111-333333333333', 'kitchen@royalpalace.com'),
      ('aaaaaaaa-1111-1111-1111-444444444444', 'waiter@royalpalace.com'),
      ('bbbbbbbb-2222-2222-2222-111111111111', 'amit.manager@cityrestaurant.com'),
      ('bbbbbbbb-2222-2222-2222-222222222222', 'reception@cityrestaurant.com'),
      ('bbbbbbbb-2222-2222-2222-333333333333', 'kitchen@cityrestaurant.com'),
      ('bbbbbbbb-2222-2222-2222-444444444444', 'waiter@cityrestaurant.com')
    on conflict (id) do nothing;
  end if;
end $$;

-- 4. Staff Profiles
-- Super Admin (No restaurant_id)
insert into public.staff_profiles (user_id, auth_user_id, restaurant_id, name, phone, role, status)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', null, 'System Super Admin', '+91 90000 00000', 'SUPER_ADMIN', 'ACTIVE')
on conflict (auth_user_id) do nothing;

-- Restaurant A (Royal Palace) Staff
insert into public.staff_profiles (user_id, auth_user_id, restaurant_id, name, phone, role, status)
values
  ('a1111111-0000-0000-0000-000000000001', 'aaaaaaaa-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Rahul Sharma (Manager)', '+91 98111 00001', 'MANAGER', 'ACTIVE'),
  ('a1111111-0000-0000-0000-000000000002', 'aaaaaaaa-1111-1111-1111-222222222222', '11111111-1111-1111-1111-111111111111', 'Royal Receptionist', '+91 98111 00002', 'RECEPTIONIST', 'ACTIVE'),
  ('a1111111-0000-0000-0000-000000000003', 'aaaaaaaa-1111-1111-1111-333333333333', '11111111-1111-1111-1111-111111111111', 'Royal Kitchen Master', '+91 98111 00003', 'KITCHEN', 'ACTIVE'),
  ('a1111111-0000-0000-0000-000000000004', 'aaaaaaaa-1111-1111-1111-444444444444', '11111111-1111-1111-1111-111111111111', 'Royal Waiter Suresh', '+91 98111 00004', 'WAITER', 'ACTIVE')
on conflict (auth_user_id) do nothing;

-- Restaurant B (City Restaurant) Staff
insert into public.staff_profiles (user_id, auth_user_id, restaurant_id, name, phone, role, status)
values
  ('b2222222-0000-0000-0000-000000000001', 'bbbbbbbb-2222-2222-2222-111111111111', '22222222-2222-2222-2222-222222222222', 'Amit Patel (Manager)', '+91 98222 00001', 'MANAGER', 'ACTIVE'),
  ('b2222222-0000-0000-0000-000000000002', 'bbbbbbbb-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'City Receptionist', '+91 98222 00002', 'RECEPTIONIST', 'ACTIVE'),
  ('b2222222-0000-0000-0000-000000000003', 'bbbbbbbb-2222-2222-2222-333333333333', '22222222-2222-2222-2222-222222222222', 'City Kitchen Master', '+91 98222 00003', 'KITCHEN', 'ACTIVE'),
  ('b2222222-0000-0000-0000-000000000004', 'bbbbbbbb-2222-2222-2222-444444444444', '22222222-2222-2222-2222-222222222222', 'City Waiter Ramesh', '+91 98222 00004', 'WAITER', 'ACTIVE')
on conflict (auth_user_id) do nothing;

-- 5. Dining Tables
insert into public.dining_tables (table_id, restaurant_id, table_number, capacity, qr_identifier)
values
  ('11111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 1, 4, 'QR-ROYAL-TBL-1'),
  ('11111111-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 2, 2, 'QR-ROYAL-TBL-2'),
  ('22222222-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 1, 4, 'QR-CITY-TBL-1'),
  ('22222222-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 2, 6, 'QR-CITY-TBL-2')
on conflict (table_id) do nothing;

-- 6. Menu Categories
insert into public.menu_categories (category_id, restaurant_id, name, sort_order)
values
  ('11111111-cccc-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Royal Rajasthani Specials', 1),
  ('22222222-cccc-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Delhi Street Food', 1)
on conflict (category_id) do nothing;

-- 7. Menu Items
insert into public.menu_items (menu_item_id, restaurant_id, category_id, name, description, price, veg_non_veg)
values
  ('11111111-mmmm-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '11111111-cccc-0000-0000-000000000001', 'Dal Baati Churma', 'Traditional ghee-roasted baatis with spicy daal and sweet churma', 350.00, 'VEG'),
  ('22222222-mmmm-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', '22222222-cccc-0000-0000-000000000001', 'Delhi Chole Bhature', 'Crispy puffed bhature with tangy pindi chole', 180.00, 'VEG')
on conflict (menu_item_id) do nothing;

commit;
