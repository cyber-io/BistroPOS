-- ============================================================================
-- Migration 012: Restaurant Codes
-- Adds restaurant_code column starting from 100 for each restaurant tenant (e.g., RST-100)
-- ============================================================================

SET search_path TO restaurant_pos, public;

ALTER TABLE IF EXISTS restaurant_pos.restaurants 
ADD COLUMN IF NOT EXISTS restaurant_code VARCHAR(50);

CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurants_restaurant_code 
ON restaurant_pos.restaurants (restaurant_code) 
WHERE restaurant_code IS NOT NULL;

-- Backfill primary baseline restaurant with RST-100
UPDATE restaurant_pos.restaurants 
SET restaurant_code = 'RST-100' 
WHERE restaurant_id = 'a0000000-0000-0000-0000-000000000001' 
  AND (restaurant_code IS NULL OR restaurant_code = '');
