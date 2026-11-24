# BistroPOS — Digital Restaurant Operating System

[![Built with React](https://img.shields.io/badge/Frontend-React.js%2018%20%7C%20Vite%20%7C%20Tailwind-blue)](https://react.dev)
[![Built with .NET 8](https://img.shields.io/badge/Backend-.NET%208%20Web%20API%20%7C%20C%23-purple)](https://dotnet.microsoft.com)
[![Database Supabase](https://img.shields.io/badge/Database-Supabase%20PostgreSQL%20%7C%20RLS-emerald)](https://supabase.com)
[![Realtime SignalR](https://img.shields.io/badge/Realtime-SignalR%20%7C%20BroadcastChannel-orange)](https://dotnet.microsoft.com)

A production-grade, multi-tenant digital operating system connecting front-of-house, kitchen, floor waitstaff, reception desk, and online customers into one synchronized, real-time platform.

---

## 🍽️ The Five Connected Modules

| Module | Primary Route | Role | Description |
| :--- | :--- | :--- | :--- |
| **1. Customer QR Menu & Dine-In** | `/qr/:restaurantId/:tableId` | `CUSTOMER` | Mobile-first table ordering. Upper-right Help button with quick actions (Water, Tissues, Bill, Cleaning), dish customizations, portion sizes (Half/Full), shared dining sessions, **strict 1-minute cancellation**, **order receipt verification prompt** (YES/NO), **Wi-Fi & Food Trivia**, **Bill Splitting & Tip calculator**, and **Multilingual support (English / हिन्दी)**. |
| **2. Kitchen Panel (KDS)** | `/kitchen` | `KITCHEN` | Kitchen Display System with configurable station routing (**Main Kitchen**, **Grill Station**, **Beverages**, **Desserts**), workload meters with overload warnings ($\ge 5$ tickets), preparation timers with elapsed vs target duration, delayed ticket alerts, **Stock Shortage Reporting**, and **live food availability toggles**. |
| **3. Waiter Panel** | `/waiter` | `WAITER` | Floor staff portal with audio chimes. Collect ready orders, attend table help calls with **atomic assignment locking** (*"The Waiter Kunal Is Coming"*), prominent colored badges for structured service calls (💧 Water, 🧻 Tissues, 🧾 Bill, 🧹 Cleaning), and strictly scoped permissions. |
| **4. Receptionist Panel** | `/receptionist` | `RECEPTIONIST` | Central concierge with KPI metrics, **Interactive Live Floor Map** with drag-and-drop table positioning, configurable shapes & dining areas, live table status nodes (Help, Cooking, Ready, Unpaid Bills, Assigned Waiter), customer arrival flow (*Arrived* -> *Seat*), table booking manager, billing & checkout, customer delivery dispute escalations, and **Advanced Analytics & Reporting**. |
| **5. Public Responsive Website** | `/`, `/menu`, `/delivery`, `/takeaway`, `/book-table` | `CUSTOMER` | Public landing page, online food menu with allergen & ingredient info, dietary filters, spice level filters, portion price previews, **AI Chef recommendations rail**, delivery checkout with live order tracking, takeaway pickup, and **real-time table availability engine** (no hardcoded slots). |

---

## ✨ Features Overview & System Architecture

### 1. Advanced Digital Menu & Dietary Information (Feature 1)
* **Allergens & Ingredients**: Detailed allergen warnings (Gluten, Dairy, Nuts, Soy, Eggs, Shellfish) and key ingredients visible on cards and detail modals.
* **Spice Level Selection**: Mild 🌶️, Medium 🌶️🌶️, Hot 🌶️🌶️🌶️, Extra Hot 🔥.
* **Portion Sizes**: Half / Full portions with separate prices that dynamically adjust unit prices and line totals in the cart.
* **Dietary Preferences**: Veg, Non-Veg, Vegan 🌱, Gluten-Free 🌾, and Chef Specials ⭐ filters.
* **Advanced Search**: Instant keyword matching across dish names, ingredients, and allergen tags.

### 2. Shared Table Ordering Sessions (Feature 2)
* **Table Sessions**: Unique active dining session (`#SESS-XXXX`) initiated upon QR scan.
* **Multi-Diner Synchronization**: Multiple customers at the same physical table can join via the table QR code, browse together, maintain individual carts, and see the synchronized shared table orders feed.
* **Dynamic Preparation Countdowns**: Preparation time estimates with dynamic countdowns and kitchen overload delay notices.
* **Automatic Session Closure**: Automatically archived when checkout/payment is completed.

### 3. Advanced Kitchen Display System & Stations (Feature 3)
* **Station Management**: Configurable station routing (`Main Kitchen`, `Grill Station`, `Beverages`, `Desserts`).
* **Station Workload Metrics**: Real-time workload bar showing active ticket counts per station with `⚠️ OVERLOAD` warnings when $\ge 5$ orders are pending.
* **Cooking Timers & Delays**: Real-time elapsed preparation timers vs. expected target cooking times, delayed order highlighting (`⚠️ DELAYED`), and flame priority badges (`🔥 HIGH PRIORITY`).

### 4. Interactive Live Restaurant Floor Map (Feature 4)
* **Interactive Floor View**: Dual-mode toggle between `📋 Card Grid` and `🗺️ Interactive Floor Map`.
* **Drag-and-Drop Table Arrangement**: Staff can drag tables across a 2D blueprint grid canvas; snapped coordinates auto-save to the database (`position_x`, `position_y`).
* **Table Shapes & Dining Areas**: Configurable shapes (`Square`, `Round`, `Rectangle / Long`) and dining zones (`Everyday Dining`, `Group Dining`, `Family Dining`, `Party Hall`, `Outdoor / Patio`).
* **Live Status Indicators**:
  * 🚨 **Assistance Needed**: Pulsing alert with specific request type (Water, Bill, Cleaning, Tissues).
  * 🍳 **Kitchen Cooking**: Elapsed cooking timer.
  * 🔔 **Ready to Serve**: Order ready notification.
  * 💳 **Payment Pending**: Unpaid balance on table.
  * 👤 **Assigned Waiter**: Staff badge.
* **Table Inspector Drawer**: View active dining session, open service requests with 1-click **Resolve ✓**, kitchen ticket progress, waiter re-assignment dropdown, and checkout flow.

### 5. Wi-Fi Information & Customer Entertainment (Feature 5)
* **Guest Wi-Fi**: Complimentary Wi-Fi network SSID and password with a 1-click **Copy Password** button. Staff can configure credentials via `PATCH /api/restaurants/{id}/wifi`.
* **Food Trivia & Café Quiz**: Interactive culinary quiz mini-game in the customer QR interface under the **Wi-Fi & Fun** tab to keep guests entertained while waiting for food.

### 6. Customer Loyalty Rewards Program (Feature 6)
* **Points Accumulation**: 1 point earned per ₹10 spent on completed orders.
* **Tier Progression**: `Bronze` (0-499 pts), `Silver` (500-1499 pts), `Gold` (1500-2999 pts), `Platinum` (3000+ pts).
* **Points Redemption**: Instant discount at checkout (100 points = ₹50 off).
* **Backend Services**: `customer_loyalty` table, `ILoyaltyService`, and `LoyaltyController` (`/api/loyalty/balance`, `/api/loyalty/earn`, `/api/loyalty/redeem`).

### 7. Split-Bill & Gratuity Calculator (Feature 7)
* **Equal Bill Split**: Divides total bill across 2 to 6+ diners with per-person breakdown.
* **Itemized Bill Split**: Assigns specific dishes to individual diners with proportional tax and tip calculation.
* **Tip Selector**: Presets for 0%, 5%, 10%, 15%, or custom ₹ gratuity.
* **Summary Breakdown**: Subtotal, GST, Tip, Loyalty discount, and Grand Total.

### 8. Digital Receipts & 5-Star Customer Feedback (Feature 8)
* **Digital Receipts**: Printable, downloadable (`.txt`), and email-ready itemized digital invoices with GST tax breakdown.
* **5-Star Feedback Form**: Detailed ratings across Food Taste, Service, and Ambiance, stored in `customer_feedbacks` via `POST /api/feedback`.
* **Google Maps Review Prompt**: 5-star diners are celebrated and prompted with a 1-click link to leave a review on Google Maps.

### 9. AI Recommendation Engine (Feature 9)
* **Intelligent Pairings**: `AiRecommendationsRail` analyzes current cart items and category affinities to suggest complementary beverages, desserts, or chef specials with a 1-click **+ Add** button.

### 10. Advanced Restaurant Analytics & Reporting (Feature 10)
* **Peak Traffic Heatmap**: Hourly capacity utilization across Lunch Rush (12-3 PM), Evening Snacks (4-6 PM), Dinner Peak (7-10 PM), and Late Dining (10 PM+).
* **Key Metrics**: Average Order Value (AOV) and average table turnover duration (~42 mins/session).
* **Top-Selling Dishes**: Ranks top dishes by order volume and generated revenue.
* **Channel Mix**: Live distribution across Dine-In, Delivery, and Takeaway.

### 11. Inventory Shortage Alerts (Feature 11)
* **Raw Inventory Tracking**: `inventory_items` table tracking stock levels, units, and minimum thresholds.
* **Stock Shortage Modal**: Allows kitchen staff to report depleted dishes or raw supplies, with an option to instantly toggle the menu item to **Sold Out**.
* **Pixel-Perfect Alignment**: Strict box-sizing and grid styling ensuring dropdowns (`Shortage status`, `Urgency level`) align with container borders.

### 12. Multilingual Support (Feature 12)
* **Bilingual Toggle**: Seamless switching between **English** and **Hindi (हिन्दी)** in both the QR Dine-In menu and Public Food menu.
* **Translation Coverage**: Food categories (Starters -> शुरुआत, Mains -> मुख्य भोजन, Breads -> रोटियाँ, Desserts -> मिठाइयाँ, Beverages -> पेय), spice levels, dietary preferences, and UI controls.

---

## 📁 Project Folder Structure

```
BistroPOS/
├── frontend/                     # React.js SPA (Vite + Tailwind CSS + Lucide)
│   ├── src/
│   │   ├── components/
│   │   │   ├── billing/          # BillSplitAndTipModal, DigitalReceiptAndFeedbackModal
│   │   │   ├── common/           # AiRecommendationsRail, ItemCustomizationModal, CustomerHelpModal, CartDrawer
│   │   │   ├── entertainment/    # WifiAndEntertainmentCard
│   │   │   ├── pos/              # TableFloorPlan, FamilyDiningPlan, PartyHallPlan, PosUI
│   │   │   └── ...
│   │   ├── context/              # AuthContext, CartContext, NotificationContext
│   │   ├── pages/
│   │   │   ├── dineIn/           # QrDineInPage (Shared Sessions, Food Menu, Entertainment, Table Orders)
│   │   │   ├── kitchen/          # KitchenDashboard (KDS Stations, Timers, Shortage Reporting, Stock Tab)
│   │   │   ├── waiter/           # WaiterDashboard (Help Call Badges, Atomic Assignment, Ready Orders)
│   │   │   ├── receptionist/     # ReceptionistDashboard (Interactive Floor Map, Analytics, Bookings, Orders)
│   │   │   └── public/           # PublicMenuPage (Allergens, Portions, AI Rail, English/Hindi), TrackOrder, BookTable
│   │   ├── services/             # api.js, menuTranslations.js, tablePresentation.js, soundEffects.js
│   │   └── App.jsx               # Protected route tree & providers
│   ├── package.json
│   └── vite.config.js
├── backend/                      # C# ASP.NET Core .NET 8 Web API
│   ├── Controllers/              # Auth, Orders, Reservations, Tables, Menu, Payments, Help, Inventory, Loyalty, Feedback, Users
│   ├── Services/                 # AuthService, OrderService, TableService, InventoryService, LoyaltyService, FeedbackService
│   ├── Repositories/             # RestaurantDbContext & EF Core models (schema: restaurant_pos)
│   ├── Models/                   # Domain entities (TableEntity, InventoryItem, CustomerLoyalty, CustomerFeedback, etc.)
│   ├── DTOs/                     # Strongly-typed API request & response records
│   ├── Middleware/               # ExceptionHandling, TenantSecurity, MemoryRateLimiting
│   ├── Hubs/                     # SignalR NotificationHub
│   ├── Program.cs                # Dependency injection, startup auto-migrations, pipeline
│   └── RestaurantSystem.Api.csproj
├── database/                     # PostgreSQL / Supabase scripts
│   ├── migrations/               # 001_initial_schema.sql to 009_phase3_to_phase5.sql
│   ├── functions/                # 001_reservation_functions.sql, 002_order_functions.sql
│   ├── policies/                 # 001_row_level_security.sql (RLS for all roles)
│   └── seeds/                    # 001_seed_data.sql (Demo restaurant, tables, dishes, users)
└── README.md
```

---

## 🚀 Quickstart Guide

### 1. Run the Frontend (React.js)
```bash
cd frontend
npm install
npm run dev
```
Open **`http://localhost:5173`** in your browser.

> **Role Demo Switcher**: A sticky banner at the top of the interface allows switching between roles (`Customer`, `Table 1 Dine-In`, `Kitchen`, `Waiter Kunal`, `Receptionist`, `Super Admin`) with a single click.

### 2. Run the Backend (.NET 8 Web API)
```bash
cd backend
dotnet restore
dotnet run
```
Access Swagger UI at **`http://localhost:5000/swagger`** (or configured port).

### 3. Database & Migrations
The system operates against PostgreSQL (Supabase schema: `restaurant_pos`). Migrations are located under `database/migrations/`:
* `007_phase1_customer_experience.sql` — Portions, allergens, dietary tags, dining sessions.
* `008_phase2_restaurant_operations.sql` — Table coordinates `(x, y)`, shapes, raw inventory items.
* `009_phase3_to_phase5.sql` — Customer loyalty, feedback reviews, Wi-Fi credentials, payment gratuity & splits.

---

## 👥 Demo Accounts (Password: `Password@123`)

| Email | Role | Module Accessed |
| :--- | :--- | :--- |
| `superadmin@sunrisecafe.com` | `SUPER_ADMIN` | Full System Access |
| `receptionist@sunrisecafe.com` | `RECEPTIONIST` | Receptionist Panel & Live Floor Map (`/receptionist`) |
| `kitchen@sunrisecafe.com` | `KITCHEN` | Kitchen Display System & Inventory (`/kitchen`) |
| `waiter.kunal@sunrisecafe.com` | `WAITER` | Waiter Panel & Table Help (`/waiter`) |
| `customer.rahul@example.com` | `CUSTOMER` | Public Website & QR Dine-In (`/`, `/qr/...`) |

---

## 🧪 Testing Real-Time Workflows

1. **Interactive Floor Map & Table Drag-and-Drop (Feature 4)**:
   - Navigate to `/receptionist` and switch to the **Table Management** tab.
   - Click **🗺️ Interactive Floor Map**.
   - Drag tables across the floor canvas; observe positions snapping to grid and coordinates auto-saving.
   - Click a table to inspect active dining session details, view open service requests, check kitchen progress, or re-assign waiters.

2. **KDS Station Routing & Workload Meters (Feature 3)**:
   - Navigate to `/kitchen`.
   - Filter tickets by station (**Main Kitchen**, **Grill Station**, **Beverages**, **Desserts**).
   - Observe preparation countdown timers, delayed ticket alerts (`⚠️ DELAYED`), and active ticket counts on the workload bar.
   - Click **Report Stock Shortage** to mark a depleted dish as Sold Out in real time.

3. **Shared Table Ordering & Bill Splitting (Features 2, 7 & 8)**:
   - Open a table QR session (e.g. `/qr/a0000000-0000-0000-0000-000000000001/c0000000-0000-0000-0000-000000000001`).
   - Add items with Half/Full portions and place the order.
   - In the **👥 Table Orders** tab, click **Split Bill & Tip** to test equal or itemized splitting and loyalty discount application.
   - Click **Receipt & Review** to generate a printable digital invoice or submit 5-star feedback.

4. **Wi-Fi & Food Trivia (Feature 5)**:
   - In the QR customer view, tap the **📶 Wi-Fi & Fun** tab.
   - Copy the guest Wi-Fi password with 1 click.
   - Play the culinary food quiz and receive instant feedback.

5. **Multilingual Support (Feature 12)**:
   - In either the Public Menu (`/menu`) or QR Dine-In page, tap the **Globe (EN / हिन्दी)** toggle in the header.
   - Observe instant translation of categories, allergens, spice levels, and UI buttons.
