-- ============================================================================
-- Migration 007: Phase 1 Customer Experience Additions
-- Menu Allergens, Ingredients, Portions, Dietary Tags, Prep Times,
-- Dining Sessions & Shared Ordering, and Structured Quick Service Requests
-- ============================================================================

BEGIN;

-- 1. Extend menu_items with Allergens, Ingredients, Portions, Dietary Tags, Specials, Prep Time
ALTER TABLE restaurant_pos.menu_items
    ADD COLUMN IF NOT EXISTS allergens JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS ingredients TEXT,
    ADD COLUMN IF NOT EXISTS portions JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS dietary_tags JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS is_special BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS prep_time_minutes INT DEFAULT 15;

-- 2. Dining Sessions Table for Table-Sharing & Real-Time Sync
CREATE TABLE IF NOT EXISTS restaurant_pos.dining_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurant_pos.restaurants(restaurant_id) ON DELETE CASCADE,
    table_id UUID NOT NULL REFERENCES restaurant_pos.tables(table_id) ON DELETE CASCADE,
    session_code VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CLOSED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dining_sessions_table ON restaurant_pos.dining_sessions(table_id, status);

-- 3. Extend orders with session_id and prep-time estimation
ALTER TABLE restaurant_pos.orders
    ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES restaurant_pos.dining_sessions(session_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS estimated_prep_time_minutes INT DEFAULT 15,
    ADD COLUMN IF NOT EXISTS estimated_ready_at TIMESTAMPTZ;

-- 4. Extend help_requests with structured request_type
ALTER TABLE restaurant_pos.help_requests
    ADD COLUMN IF NOT EXISTS request_type VARCHAR(50) DEFAULT 'CUSTOM';

-- 5. Enrich seed items with realistic allergens, ingredients, portions and dietary tags
UPDATE restaurant_pos.menu_items
SET 
    allergens = '["Dairy", "Gluten"]'::jsonb,
    ingredients = 'San Marzano tomatoes, fresh buffalo mozzarella, handpicked basil, cold-pressed olive oil, wheat flour',
    portions = '[{"name": "Regular (8 inch)", "price": 399.00}, {"name": "Large (12 inch)", "price": 599.00}]'::jsonb,
    dietary_tags = '["Vegetarian", "Classic"]'::jsonb,
    is_special = false,
    prep_time_minutes = 15
WHERE name LIKE '%Margherita%';

UPDATE restaurant_pos.menu_items
SET 
    allergens = '["Dairy", "Gluten"]'::jsonb,
    ingredients = 'Tandoori marinated cottage cheese, bell peppers, red onions, mozzarella, house spicy makhani drizzle',
    portions = '[{"name": "Regular (8 inch)", "price": 469.00}, {"name": "Large (12 inch)", "price": 689.00}]'::jsonb,
    dietary_tags = '["Vegetarian", "Spicy"]'::jsonb,
    is_special = true,
    prep_time_minutes = 18
WHERE name LIKE '%Paneer Tikka Pizza%';

UPDATE restaurant_pos.menu_items
SET 
    allergens = '["Dairy", "Gluten"]'::jsonb,
    ingredients = 'Smoked chicken breast, sweet hickory glaze, caramelized shallots, smoked gouda, mozzarella',
    portions = '[{"name": "Regular (8 inch)", "price": 529.00}, {"name": "Large (12 inch)", "price": 769.00}]'::jsonb,
    dietary_tags = '["Chef Special", "High Protein"]'::jsonb,
    is_special = true,
    prep_time_minutes = 20
WHERE name LIKE '%BBQ Chicken Feast Pizza%';

UPDATE restaurant_pos.menu_items
SET 
    allergens = '["Gluten", "Dairy"]'::jsonb,
    ingredients = 'Crispy spiced potato-corn patty, garden lettuce, vine tomatoes, chipotle aioli, brioche bun',
    portions = '[{"name": "Single Patty", "price": 219.00}, {"name": "Double Patty", "price": 299.00}]'::jsonb,
    dietary_tags = '["Vegetarian", "Crispy"]'::jsonb,
    is_special = false,
    prep_time_minutes = 12
WHERE name LIKE '%Crispy Veggie Crunch Burger%';

UPDATE restaurant_pos.menu_items
SET 
    allergens = '["Gluten", "Dairy"]'::jsonb,
    ingredients = 'Chargrilled boneless chicken breast, aged cheddar, gherkins, caramelized onions, roasted garlic aioli',
    portions = '[{"name": "Single Patty", "price": 319.00}, {"name": "Double Patty", "price": 429.00}]'::jsonb,
    dietary_tags = '["High Protein", "Bestseller"]'::jsonb,
    is_special = true,
    prep_time_minutes = 15
WHERE name LIKE '%Smokey Grilled Chicken Burger%';

UPDATE restaurant_pos.menu_items
SET 
    allergens = '["Soy", "Dairy", "Gluten"]'::jsonb,
    ingredients = 'Crispy cottage cheese cubes, capsicum, scallions, ginger, dark soy sauce, hot chilli reduction',
    portions = '[{"name": "Half Portion", "price": 199.00}, {"name": "Full Portion", "price": 299.00}]'::jsonb,
    dietary_tags = '["Vegetarian", "Spicy Indo-Chinese"]'::jsonb,
    is_special = false,
    prep_time_minutes = 12
WHERE name LIKE '%Chilli Paneer Dry%';

UPDATE restaurant_pos.menu_items
SET 
    allergens = '["Gluten", "Soy", "Sesame"]'::jsonb,
    ingredients = 'Artisan wheat noodles, shredded cabbage, carrots, scallions, toasted sesame oil, light soy',
    portions = '[{"name": "Half Portion", "price": 169.00}, {"name": "Full Portion", "price": 249.00}]'::jsonb,
    dietary_tags = '["Vegan Option", "Wok Tossed"]'::jsonb,
    is_special = false,
    prep_time_minutes = 14
WHERE name LIKE '%Hakka Noodles%';

UPDATE restaurant_pos.menu_items
SET 
    allergens = '["Dairy"]'::jsonb,
    ingredients = 'Urad lentils, kidney beans, churned butter, fresh dairy cream, slow-simmered over charcoal embers for 18 hours',
    portions = '[{"name": "Half (350ml)", "price": 229.00}, {"name": "Full (600ml)", "price": 349.00}]'::jsonb,
    dietary_tags = '["Vegetarian", "Gluten-Free", "Iconic Recipe"]'::jsonb,
    is_special = true,
    prep_time_minutes = 10
WHERE name LIKE '%Dal Makhani%';

UPDATE restaurant_pos.menu_items
SET 
    allergens = '["Dairy", "Nuts"]'::jsonb,
    ingredients = 'Organic cottage cheese, satin-smooth cashew-tomato velouté, kasuri methi, churned white butter',
    portions = '[{"name": "Half Portion", "price": 249.00}, {"name": "Full Portion", "price": 379.00}]'::jsonb,
    dietary_tags = '["Vegetarian", "Gluten-Free", "Royal North Indian"]'::jsonb,
    is_special = false,
    prep_time_minutes = 15
WHERE name LIKE '%Paneer Butter Masala%';

UPDATE restaurant_pos.menu_items
SET 
    allergens = '["Dairy", "Nuts"]'::jsonb,
    ingredients = 'Clay-oven roasted chicken morsels, rich aromatic tomato-cashew satin gravy, dried fenugreek, butter',
    portions = '[{"name": "Half Portion", "price": 299.00}, {"name": "Full Portion", "price": 449.00}]'::jsonb,
    dietary_tags = '["Non-Veg", "Gluten-Free", "House Signature"]'::jsonb,
    is_special = true,
    prep_time_minutes = 15
WHERE name LIKE '%Butter Chicken%';

UPDATE restaurant_pos.menu_items
SET 
    allergens = '[]'::jsonb,
    ingredients = 'Fermented stone-ground rice & urad batter, fiery Mysore red chilli-garlic paste, spiced potato mash',
    portions = '[{"name": "Regular", "price": 229.00}]'::jsonb,
    dietary_tags = '["Vegan", "Gluten-Free", "South Indian Special"]'::jsonb,
    is_special = false,
    prep_time_minutes = 12
WHERE name LIKE '%Mysore Masala Dosa%';

UPDATE restaurant_pos.menu_items
SET 
    allergens = '["Dairy"]'::jsonb,
    ingredients = 'Steamed rice button idlis, pure A2 desi ghee, roasted spiced lentil podi gunpowder',
    portions = '[{"name": "Small (4 pcs)", "price": 129.00}, {"name": "Full (8 pcs)", "price": 189.00}]'::jsonb,
    dietary_tags = '["Vegetarian", "Gluten-Free"]'::jsonb,
    is_special = false,
    prep_time_minutes = 10
WHERE name LIKE '%Ghee Podi Idli%';

UPDATE restaurant_pos.menu_items
SET 
    allergens = '["Dairy", "Nuts", "Gluten"]'::jsonb,
    ingredients = 'Khoya dumplings, green cardamom, rose petal syrup, slow-reduced malai rabri, roasted pistachios',
    portions = '[{"name": "2 Pieces with Rabri", "price": 179.00}]'::jsonb,
    dietary_tags = '["Vegetarian", "Traditional Sweet"]'::jsonb,
    is_special = false,
    prep_time_minutes = 5
WHERE name LIKE '%Gulab Jamun%';

UPDATE restaurant_pos.menu_items
SET 
    allergens = '["Dairy", "Gluten", "Eggs"]'::jsonb,
    ingredients = 'Callebaut Belgian dark chocolate, sweet butter, Madagascan vanilla beans, freshly churned gelato',
    portions = '[{"name": "Single Cake + Gelato", "price": 249.00}]'::jsonb,
    dietary_tags = '["Decadent Dessert", "Freshly Baked"]'::jsonb,
    is_special = true,
    prep_time_minutes = 15
WHERE name LIKE '%Lava Cake%';

UPDATE restaurant_pos.menu_items
SET 
    allergens = '[]'::jsonb,
    ingredients = 'Fresh organic spearmint, Key limes, unrefined cane sugar syrup, sparkling mineral water, crushed ice',
    portions = '[{"name": "Glass (350ml)", "price": 159.00}, {"name": "Pitcher (1 Litre)", "price": 389.00}]'::jsonb,
    dietary_tags = '["Vegan", "Gluten-Free", "Refreshing Mocktail"]'::jsonb,
    is_special = false,
    prep_time_minutes = 5
WHERE name LIKE '%Mojito%';

COMMIT;
