// ============================================================================
// Baseline Seed Data & Initial State for Frontend
// Synchronized with PostgreSQL Seed Data
// ============================================================================

export const INITIAL_RESTAURANT = {
  restaurantId: 'a0000000-0000-0000-0000-000000000001',
  name: 'Bistro & Bloom',
  tagline: 'Your Neighbourhood Bistro',
  logo: '/favicon.svg',
  address: 'Plot 42, Gourmet Boulevard, Cyber Hub, Gurugram, HR - 122002',
  phone: '+91 98765 43210',
  email: 'contact@bistroandbloom.com',
  openingHours: {
    monday: { open: '10:00 AM', close: '11:00 PM' },
    tuesday: { open: '10:00 AM', close: '11:00 PM' },
    wednesday: { open: '10:00 AM', close: '11:00 PM' },
    thursday: { open: '10:00 AM', close: '11:00 PM' },
    friday: { open: '10:00 AM', close: '11:30 PM' },
    saturday: { open: '10:00 AM', close: '11:30 PM' },
    sunday: { open: '10:00 AM', close: '11:00 PM' }
  },
  settings: {
    taxRate: 0.05,
    deliveryFee: 40.00,
    reservationGracePeriodMins: 10,
    slotDurationMins: 90,
    currency: '₹'
  }
};

export const INITIAL_USERS = [
  {
    userId: 'b0000000-0000-0000-0000-000000000001',
    name: 'Super Admin',
    email: 'superadmin@sunrisecafe.com',
    role: 'SUPER_ADMIN',
    avatar: '👑'
  },
  {
    userId: 'b0000000-0000-0000-0000-000000000002',
    name: 'Ananya Sharma',
    email: 'receptionist@sunrisecafe.com',
    role: 'RECEPTIONIST',
    avatar: '👩‍💼'
  },
  {
    userId: 'b0000000-0000-0000-0000-000000000003',
    name: 'Chef Vikram',
    email: 'kitchen@sunrisecafe.com',
    role: 'KITCHEN',
    avatar: '👨‍🍳'
  },
  {
    userId: 'b0000000-0000-0000-0000-000000000004',
    name: 'Waiter Kunal',
    email: 'waiter.kunal@sunrisecafe.com',
    role: 'WAITER',
    avatar: '🤵'
  },
  {
    userId: 'b0000000-0000-0000-0000-000000000005',
    name: 'Waiter Priya',
    email: 'waiter.priya@sunrisecafe.com',
    role: 'WAITER',
    avatar: '👩‍🍳'
  },
  {
    userId: 'b0000000-0000-0000-0000-000000000006',
    name: 'Rahul Verma',
    email: 'customer.rahul@example.com',
    phone: '+91 98888 77777',
    role: 'CUSTOMER',
    avatar: '👤'
  }
];

export const INITIAL_TABLES = [
  { tableId: 'c0000000-0000-0000-0000-000000000001', tableNumber: 1, capacity: 2, status: 'AVAILABLE', qrIdentifier: 'QR_REST1_TBL01', currentCustomerName: null, currentOrderTotal: 0, assignedWaiterName: null },
  { tableId: 'c0000000-0000-0000-0000-000000000002', tableNumber: 2, capacity: 2, status: 'AVAILABLE', qrIdentifier: 'QR_REST1_TBL02', currentCustomerName: null, currentOrderTotal: 0, assignedWaiterName: null },
  { tableId: 'c0000000-0000-0000-0000-000000000003', tableNumber: 3, capacity: 4, status: 'AVAILABLE', qrIdentifier: 'QR_REST1_TBL03', currentCustomerName: null, currentOrderTotal: 0, assignedWaiterName: null },
  { tableId: 'c0000000-0000-0000-0000-000000000004', tableNumber: 4, capacity: 4, status: 'AVAILABLE', qrIdentifier: 'QR_REST1_TBL04', currentCustomerName: null, currentOrderTotal: 0, assignedWaiterName: null },
  { tableId: 'c0000000-0000-0000-0000-000000000005', tableNumber: 5, capacity: 4, status: 'AVAILABLE', qrIdentifier: 'QR_REST1_TBL05', currentCustomerName: null, currentOrderTotal: 0, assignedWaiterName: null },
  { tableId: 'c0000000-0000-0000-0000-000000000006', tableNumber: 6, capacity: 6, status: 'AVAILABLE', qrIdentifier: 'QR_REST1_TBL06', currentCustomerName: null, currentOrderTotal: 0, assignedWaiterName: null },
  { tableId: 'c0000000-0000-0000-0000-000000000007', tableNumber: 7, capacity: 6, status: 'AVAILABLE', qrIdentifier: 'QR_REST1_TBL07', currentCustomerName: null, currentOrderTotal: 0, assignedWaiterName: null },
  { tableId: 'c0000000-0000-0000-0000-000000000008', tableNumber: 8, capacity: 8, status: 'AVAILABLE', qrIdentifier: 'QR_REST1_TBL08', currentCustomerName: null, currentOrderTotal: 0, assignedWaiterName: null },
  { tableId: 'c0000000-0000-0000-0000-000000000009', tableNumber: 9, capacity: 2, status: 'AVAILABLE', qrIdentifier: 'QR_REST1_TBL09', currentCustomerName: null, currentOrderTotal: 0, assignedWaiterName: null },
  { tableId: 'c0000000-0000-0000-0000-000000000010', tableNumber: 10, capacity: 4, status: 'AVAILABLE', qrIdentifier: 'QR_REST1_TBL10', currentCustomerName: null, currentOrderTotal: 0, assignedWaiterName: null },
  { tableId: 'c0000000-0000-0000-0000-000000000011', tableNumber: 11, capacity: 4, status: 'AVAILABLE', qrIdentifier: 'QR_REST1_TBL11', currentCustomerName: null, currentOrderTotal: 0, assignedWaiterName: null },
  { tableId: 'c0000000-0000-0000-0000-000000000012', tableNumber: 12, capacity: 8, status: 'AVAILABLE', qrIdentifier: 'QR_REST1_TBL12', currentCustomerName: null, currentOrderTotal: 0, assignedWaiterName: null }
];

export const INITIAL_CATEGORIES = [
  { categoryId: 'd0000000-0000-0000-0000-000000000001', name: 'Pizza', icon: '🍕', sortOrder: 1 },
  { categoryId: 'd0000000-0000-0000-0000-000000000002', name: 'Burger', icon: '🍔', sortOrder: 2 },
  { categoryId: 'd0000000-0000-0000-0000-000000000003', name: 'Chinese', icon: '🥢', sortOrder: 3 },
  { categoryId: 'd0000000-0000-0000-0000-000000000004', name: 'Indian', icon: '🍛', sortOrder: 4 },
  { categoryId: 'd0000000-0000-0000-0000-000000000005', name: 'South Indian', icon: '🥞', sortOrder: 5 },
  { categoryId: 'd0000000-0000-0000-0000-000000000006', name: 'North Indian', icon: '🥘', sortOrder: 6 },
  { categoryId: 'd0000000-0000-0000-0000-000000000007', name: 'Desserts', icon: '🍨', sortOrder: 7 },
  { categoryId: 'd0000000-0000-0000-0000-000000000008', name: 'Beverages', icon: '🍹', sortOrder: 8 }
];

export const INITIAL_MENU_ITEMS = [
  // Pizza
  {
    menuItemId: 'e0000000-0000-0000-0000-000000000001',
    categoryId: 'd0000000-0000-0000-0000-000000000001',
    categoryName: 'Pizza',
    name: 'Margherita Supreme Pizza',
    description: 'San Marzano tomato sauce, fresh mozzarella, organic basil, extra virgin olive oil',
    price: 399,
    image: 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?auto=format&fit=crop&w=400&q=80',
    vegNonveg: 'VEG',
    availability: true,
    spiceLevel: 'NONE',
    isSweet: false,
    customizationOptions: [{ name: 'Crust', choices: ['Thin Crust', 'Cheese Burst (+₹60)', 'Wheat Crust'] }],
    addOns: [{ name: 'Extra Mozzarella', price: 50 }, { name: 'Jalapenos', price: 30 }]
  },
  {
    menuItemId: 'e0000000-0000-0000-0000-000000000002',
    categoryId: 'd0000000-0000-0000-0000-000000000001',
    categoryName: 'Pizza',
    name: 'Spicy Paneer Tikka Pizza',
    description: 'Tandoori spiced paneer cubes, crisp capsicum, red onions, mozzarella, spicy drizzle',
    price: 469,
    image: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=400&q=80',
    vegNonveg: 'VEG',
    availability: true,
    spiceLevel: 'SPICY',
    isSweet: false,
    customizationOptions: [{ name: 'Crust', choices: ['Regular', 'Cheese Burst (+₹60)'] }],
    addOns: [{ name: 'Extra Paneer', price: 60 }]
  },
  {
    menuItemId: 'e0000000-0000-0000-0000-000000000003',
    categoryId: 'd0000000-0000-0000-0000-000000000001',
    categoryName: 'Pizza',
    name: 'BBQ Chicken Feast Pizza',
    description: 'Smoked BBQ chicken chunks, caramelized onions, smoked gouda & mozzarella',
    price: 529,
    image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=400&q=80',
    vegNonveg: 'NON_VEG',
    availability: true,
    spiceLevel: 'MEDIUM',
    isSweet: false,
    customizationOptions: [{ name: 'Crust', choices: ['Thin Crust', 'Cheese Burst (+₹70)'] }],
    addOns: [{ name: 'Extra Chicken', price: 80 }]
  },
  // Burger
  {
    menuItemId: 'e0000000-0000-0000-0000-000000000004',
    categoryId: 'd0000000-0000-0000-0000-000000000002',
    categoryName: 'Burger',
    name: 'Crispy Veggie Crunch Burger',
    description: 'Crispy spiced potato-corn patty, lettuce, tomatoes, secret house chipotle sauce',
    price: 219,
    image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80',
    vegNonveg: 'VEG',
    availability: true,
    spiceLevel: 'MILD',
    isSweet: false,
    customizationOptions: [{ name: 'Bun', choices: ['Brioche Bun', 'Gluten Free (+₹40)'] }],
    addOns: [{ name: 'Cheddar Cheese Slice', price: 30 }, { name: 'Peri-peri Fries Combo', price: 99 }]
  },
  {
    menuItemId: 'e0000000-0000-0000-0000-000000000005',
    categoryId: 'd0000000-0000-0000-0000-000000000002',
    categoryName: 'Burger',
    name: 'Smokey Grilled Chicken Burger',
    description: 'Tender grilled chicken breast, sharp cheddar, gherkins, caramelized onions, garlic aioli',
    price: 319,
    image: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=400&q=80',
    vegNonveg: 'NON_VEG',
    availability: true,
    spiceLevel: 'MEDIUM',
    isSweet: false,
    customizationOptions: [{ name: 'Bun', choices: ['Brioche Bun', 'Multi-grain Bun'] }],
    addOns: [{ name: 'Chicken Rasher', price: 60 }]
  },
  // Chinese
  {
    menuItemId: 'e0000000-0000-0000-0000-000000000006',
    categoryId: 'd0000000-0000-0000-0000-000000000003',
    categoryName: 'Chinese',
    name: 'Chilli Paneer Dry',
    description: 'Crispy cottage cheese cubes tossed with bell peppers, spring onions, and spicy soy-chilli glaze',
    price: 299,
    image: 'https://images.unsplash.com/photo-1541832676-9b763b0239ab?auto=format&fit=crop&w=400&q=80',
    vegNonveg: 'VEG',
    availability: true,
    spiceLevel: 'SPICY',
    isSweet: false,
    customizationOptions: [{ name: 'Style', choices: ['Dry', 'Semi-Gravy', 'Gravy'] }],
    addOns: []
  },
  {
    menuItemId: 'e0000000-0000-0000-0000-000000000007',
    categoryId: 'd0000000-0000-0000-0000-000000000003',
    categoryName: 'Chinese',
    name: 'Hakka Noodles Wok Special',
    description: 'Fresh wok-tossed noodles with shredded cabbage, carrots, scallions and aromatic sesame',
    price: 249,
    image: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=400&q=80',
    vegNonveg: 'VEG',
    availability: true,
    spiceLevel: 'MILD',
    isSweet: false,
    customizationOptions: [{ name: 'Variation', choices: ['Veg', 'Egg (+₹30)', 'Chicken (+₹70)'] }],
    addOns: []
  },
  // Indian / North Indian
  {
    menuItemId: 'e0000000-0000-0000-0000-000000000008',
    categoryId: 'd0000000-0000-0000-0000-000000000006',
    categoryName: 'North Indian',
    name: 'Dal Makhani Bukhara',
    description: 'Slow-cooked black lentils simmered overnight with butter, cream, and Kashmiri spices',
    price: 349,
    image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=400&q=80',
    vegNonveg: 'VEG',
    availability: true,
    spiceLevel: 'MILD',
    isSweet: false,
    customizationOptions: [],
    addOns: [{ name: 'Garlic Naan', price: 60 }, { name: 'Jeera Rice', price: 120 }]
  },
  {
    menuItemId: 'e0000000-0000-0000-0000-000000000009',
    categoryId: 'd0000000-0000-0000-0000-000000000006',
    categoryName: 'North Indian',
    name: 'Paneer Butter Masala',
    description: 'Fresh malai paneer steeped in a rich, velvety tomato and cashew gravy',
    price: 379,
    image: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?auto=format&fit=crop&w=400&q=80',
    vegNonveg: 'VEG',
    availability: true,
    spiceLevel: 'MEDIUM',
    isSweet: false,
    customizationOptions: [],
    addOns: [{ name: 'Butter Roti (2 pcs)', price: 50 }]
  },
  {
    menuItemId: 'e0000000-0000-0000-0000-000000000010',
    categoryId: 'd0000000-0000-0000-0000-000000000004',
    categoryName: 'Indian',
    name: 'Butter Chicken Delhi Special',
    description: 'Chargrilled boneless chicken tikkas simmered in satin smooth butter tomato sauce',
    price: 449,
    image: 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=400&q=80',
    vegNonveg: 'NON_VEG',
    availability: true,
    spiceLevel: 'MEDIUM',
    isSweet: false,
    customizationOptions: [],
    addOns: [{ name: 'Butter Naan (2 pcs)', price: 80 }]
  },
  // South Indian
  {
    menuItemId: 'e0000000-0000-0000-0000-000000000011',
    categoryId: 'd0000000-0000-0000-0000-000000000005',
    categoryName: 'South Indian',
    name: 'Mysore Masala Dosa',
    description: 'Crispy rice crepe smeared with fiery red garlic chutney, filled with spiced potato mash',
    price: 229,
    image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=400&q=80',
    vegNonveg: 'VEG',
    availability: true,
    spiceLevel: 'SPICY',
    isSweet: false,
    customizationOptions: [{ name: 'Roast', choices: ['Ghee Roast (+₹30)', 'Butter Roast (+₹30)'] }],
    addOns: [{ name: 'Extra Sambar', price: 25 }]
  },
  {
    menuItemId: 'e0000000-0000-0000-0000-000000000012',
    categoryId: 'd0000000-0000-0000-0000-000000000005',
    categoryName: 'South Indian',
    name: 'Ghee Podi Idli (4 pcs)',
    description: 'Steamed button rice cakes drenched in aromatic desi ghee and gun-powder podi spice',
    price: 189,
    image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=400&q=80',
    vegNonveg: 'VEG',
    availability: true,
    spiceLevel: 'MEDIUM',
    isSweet: false,
    customizationOptions: [],
    addOns: []
  },
  // Desserts
  {
    menuItemId: 'e0000000-0000-0000-0000-000000000013',
    categoryId: 'd0000000-0000-0000-0000-000000000007',
    categoryName: 'Desserts',
    name: 'Warm Gulab Jamun with Rabri',
    description: 'Two soft golden cottage cheese dumplings soaked in rose syrup, crowned with chilled rabri',
    price: 179,
    image: 'https://images.unsplash.com/photo-1593798603546-b302636a0d0d?auto=format&fit=crop&w=400&q=80',
    vegNonveg: 'VEG',
    availability: true,
    spiceLevel: 'NONE',
    isSweet: true,
    customizationOptions: [],
    addOns: [{ name: 'Pistachio Topping', price: 20 }]
  },
  {
    menuItemId: 'e0000000-0000-0000-0000-000000000014',
    categoryId: 'd0000000-0000-0000-0000-000000000007',
    categoryName: 'Desserts',
    name: 'Belgian Chocolate Lava Cake',
    description: 'Warm molten chocolate cake with gooey center, served with Madagascan vanilla gelato',
    price: 249,
    image: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=400&q=80',
    vegNonveg: 'VEG',
    availability: true,
    spiceLevel: 'NONE',
    isSweet: true,
    customizationOptions: [],
    addOns: [{ name: 'Extra Scoop Gelato', price: 60 }]
  },
  // Beverages
  {
    menuItemId: 'e0000000-0000-0000-0000-000000000015',
    categoryId: 'd0000000-0000-0000-0000-000000000008',
    categoryName: 'Beverages',
    name: 'Fresh Mint Mojito',
    description: 'Fresh garden mint, crushed lime, cane sugar, and sparkling soda over crushed ice',
    price: 159,
    image: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=400&q=80',
    vegNonveg: 'VEG',
    availability: true,
    spiceLevel: 'NONE',
    isSweet: true,
    customizationOptions: [{ name: 'Sweetness', choices: ['Regular', 'Low Sugar', 'No Sugar'] }],
    addOns: []
  },
  {
    menuItemId: 'e0000000-0000-0000-0000-000000000016',
    categoryId: 'd0000000-0000-0000-0000-000000000008',
    categoryName: 'Beverages',
    name: 'Sunrise Signature Cold Brew',
    description: '18-hour steeped single-origin Arabica cold brew with delicate vanilla cream froth',
    price: 199,
    image: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?auto=format&fit=crop&w=400&q=80',
    vegNonveg: 'VEG',
    availability: true,
    spiceLevel: 'NONE',
    isSweet: false,
    customizationOptions: [{ name: 'Milk', choices: ['Whole Milk', 'Oat Milk (+₹40)', 'Almond Milk (+₹40)'] }],
    addOns: []
  }
];

export const INITIAL_ORDERS = [];

export const INITIAL_RESERVATIONS = [];

export const INITIAL_HELP_REQUESTS = [];

