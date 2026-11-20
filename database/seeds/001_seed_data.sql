-- ============================================================================
-- Seed Data: Bistro_POS
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
('b0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'Rahul Verma (Customer)', 'customer.rahul@example.com', '+91 98888 77777', '$2a$11$w8/q3m2eA8zJ5m7nB3r9TuG4h.8Z.u2v8kP.vYg/H8K1.p2wEa2XW', 'CUSTOMER', 'ACTIVE', true),
('b0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'Waiter', 'waiter@sunrisecafe.com', '+91 99999 00004', '$2a$11$w8/q3m2eA8zJ5m7nB3r9TuG4h.8Z.u2v8kP.vYg/H8K1.p2wEa2XW', 'WAITER', 'ACTIVE', true)
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
('c0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 12, 8, 'AVAILABLE', 'QR_REST1_TBL12')
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

