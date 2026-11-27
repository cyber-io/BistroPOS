-- ============================================================================
-- Migration 011: Employee Codes for Staff and Admins
-- Adds employee_code column starting from 1000 for each staff role
-- ============================================================================

SET search_path TO restaurant_pos, public;

ALTER TABLE IF EXISTS restaurant_pos.users 
ADD COLUMN IF NOT EXISTS employee_code VARCHAR(50);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_employee_code 
ON restaurant_pos.users (employee_code) 
WHERE employee_code IS NOT NULL;

-- Backfill Super Admin with ADM-1000
UPDATE restaurant_pos.users 
SET employee_code = 'ADM-1000' 
WHERE role = 'SUPER_ADMIN' AND (employee_code IS NULL OR employee_code = '');
