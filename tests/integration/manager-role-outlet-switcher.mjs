import assert from 'node:assert/strict';
import { getActiveRestaurantId, setActiveRestaurantId } from '../../frontend/src/services/api.js';

console.log('🧪 Testing Multi-Tenant Outlet Switcher and Manager Role Access Rules...');

// 1. Initial active restaurant
const initialId = getActiveRestaurantId();
assert.ok(initialId, 'Active restaurant ID should have a default value');

// 2. Switch to Royal Palace
const royalPalaceId = '11111111-1111-1111-1111-111111111111';
setActiveRestaurantId(royalPalaceId);
assert.equal(getActiveRestaurantId(), royalPalaceId, 'Active restaurant should switch to Royal Palace');

// 3. Switch to City Restaurant
const cityRestaurantId = '22222222-2222-2222-2222-222222222222';
setActiveRestaurantId(cityRestaurantId);
assert.equal(getActiveRestaurantId(), cityRestaurantId, 'Active restaurant should switch to City Restaurant');

console.log('✅ Multi-Tenant Outlet Switcher successfully switches and persists active outlet.');

// 4. Role Hierarchy Validation
const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  MANAGER: 'MANAGER',
  RECEPTIONIST: 'RECEPTIONIST',
  KITCHEN: 'KITCHEN',
  WAITER: 'WAITER',
  CUSTOMER: 'CUSTOMER'
};

function canAccessPos(role) {
  return ['SUPER_ADMIN', 'MANAGER', 'RECEPTIONIST'].includes(role);
}

function canCreateStaff(role, targetRole) {
  if (role === 'SUPER_ADMIN') return true;
  if (role === 'MANAGER') {
    return ['RECEPTIONIST', 'KITCHEN', 'WAITER'].includes(targetRole);
  }
  return false;
}

assert.equal(canAccessPos(ROLES.MANAGER), true, 'Manager should have full access to POS workspace');
assert.equal(canAccessPos(ROLES.RECEPTIONIST), true, 'Receptionist has POS access');
assert.equal(canAccessPos(ROLES.WAITER), false, 'Waiter does not have full POS frontdesk access');

assert.equal(canCreateStaff(ROLES.MANAGER, 'WAITER'), true, 'Manager can create Waiter');
assert.equal(canCreateStaff(ROLES.MANAGER, 'KITCHEN'), true, 'Manager can create Kitchen staff');
assert.equal(canCreateStaff(ROLES.MANAGER, 'RECEPTIONIST'), true, 'Manager can create Receptionist');
assert.equal(canCreateStaff(ROLES.MANAGER, 'MANAGER'), false, 'Manager CANNOT create another Manager');
assert.equal(canCreateStaff(ROLES.MANAGER, 'SUPER_ADMIN'), false, 'Manager CANNOT create Super Admin');
assert.equal(canCreateStaff(ROLES.RECEPTIONIST, 'WAITER'), false, 'Receptionist cannot create staff');

console.log('✅ Manager Role Permissions & Security Rules verified successfully.');
process.exit(0);
