# Bistro_POS

[![Built with React](https://img.shields.io/badge/Frontend-React.js%2018%20%7C%20Vite%20%7C%20Tailwind-blue)](https://react.dev)
[![Built with .NET 8](https://img.shields.io/badge/Backend-.NET%208%20Web%20API%20%7C%20C%23-purple)](https://dotnet.microsoft.com)
[![Database Supabase](https://img.shields.io/badge/Database-Supabase%20PostgreSQL%20%7C%20RLS-emerald)](https://supabase.com)
[![Realtime SignalR](https://img.shields.io/badge/Realtime-SignalR%20%7C%20BroadcastChannel-orange)](https://dotnet.microsoft.com)

A production-grade, multi-tenant digital operating system connecting front-of-house, kitchen, floor waitstaff, reception desk, and online customers into one synchronized, real-time platform.

---

## 🍽️ The Five Connected Modules

| Module | Primary Route | Role | Description |
| :--- | :--- | :--- | :--- |
| **1. Customer QR Menu & Dine-In** | `/qr/:restaurantId/:tableId` | `CUSTOMER` | Mobile-first table ordering. Upper-right Help button, dish customizations, cart, **strict 1-minute cancellation**, and **order receipt verification prompt** (YES/NO). |
| **2. Kitchen Panel (KDS)** | `/kitchen` | `KITCHEN` | Kitchen Display System managing `NEW`, `PREPARING`, `READY`, `DELIVERED`, and `CANCELLED`. Accept/reject with reasons, **mark ready** (alerts waiter), and **live food availability toggles**. |
| **3. Waiter Panel** | `/waiter` | `WAITER` | Floor staff portal with audio chimes. Collect ready orders, attend table help calls with **atomic assignment locking** (*"The Waiter Kunal Is Coming"*), strictly scoped permissions. |
| **4. Receptionist Panel** | `/receptionist` | `RECEPTIONIST` | Central concierge with KPI metrics, visual floor table map, customer arrival flow (*Arrived* -> *Seat*), table booking manager, billing & checkout, customer delivery dispute escalations, and QR management. |
| **5. Public Responsive Website** | `/`, `/menu`, `/delivery`, `/takeaway`, `/book-table` | `CUSTOMER` | Public landing page, online food menu, delivery checkout with address collection & live progress tracking, takeaway pickup, and **real-time table availability engine** (no hardcoded slots). |

---

## 📁 Project Folder Structure

```
restaurant-system/
├── frontend/                     # React.js SPA (Vite + Tailwind CSS + Lucide)
│   ├── src/
│   │   ├── components/
│   │   │   ├── common/           # RoleSwitcher, Navbar, ToastContainer, CartDrawer, PaymentModal, HelpModal
│   │   │   └── ...
│   │   ├── context/              # AuthContext, CartContext, NotificationContext
│   │   ├── pages/
│   │   │   ├── dineIn/           # QrDineInPage (Module 1)
│   │   │   ├── kitchen/          # KitchenDashboard (Module 2)
│   │   │   ├── waiter/           # WaiterDashboard (Module 3)
│   │   │   ├── receptionist/     # ReceptionistDashboard (Module 4)
│   │   │   └── public/           # HomePage, PublicMenu, Delivery, Takeaway, BookTable, TrackOrder (Module 5)
│   │   ├── services/             # api.js (unified client + multi-tab real-time), soundEffects.js, mockData.js
│   │   └── App.jsx               # Protected route tree & providers
│   ├── package.json
│   └── vite.config.js
├── backend/                      # C# ASP.NET Core .NET 8 Web API
│   ├── Controllers/              # Auth, Orders, Reservations, Tables, Menu, Payments, Help, Issues, Qr
│   ├── Services/                 # AuthService, OrderService, ReservationService, TableService, PaymentService
│   ├── Repositories/             # RestaurantDbContext & EF Core models
│   ├── Models/                   # Domain entities (Restaurant, User, Table, Order, Reservation, Payment, etc.)
│   ├── DTOs/                     # Request and response models
│   ├── Middleware/               # ExceptionHandling, TenantSecurity, MemoryRateLimiting
│   ├── Hubs/                     # SignalR NotificationHub
│   ├── Validators/               # FluentValidation request validators
│   ├── Configuration/            # Strongly-typed AppSettings
│   ├── Program.cs                # Dependency injection, pipeline, OpenAPI
│   └── RestaurantSystem.Api.csproj
├── database/                     # PostgreSQL / Supabase scripts
│   ├── migrations/               # 001_initial_schema.sql, 002_indexes_and_constraints.sql
│   ├── functions/                # 001_reservation_functions.sql, 002_order_functions.sql
│   ├── policies/                 # 001_row_level_security.sql (RLS for all roles)
│   └── seeds/                    # 001_seed_data.sql (Demo restaurant, 12 tables, 16 dishes, 6 users)
├── docs/
│   ├── ARCHITECTURE.md           # System architecture & component interaction
│   ├── SECURITY.md               # RLS, RBAC, 1-min cancellation, concurrency & validation
│   ├── API.md                    # Complete REST API & SignalR documentation
│   └── DEPLOYMENT.md             # Production hosting, Docker & environment configuration
└── README.md
```

---

## 🚀 Quickstart Guide

### 1. Run the Frontend (React.js)
```bash
cd restaurant-system/frontend
npm install
npm run dev
```
Open **`http://localhost:5173`** in your browser.

> **Role Demo Switcher**: A sticky banner at the top of the interface allows you to switch between roles (`Customer`, `Table 1 Dine-In`, `Kitchen`, `Waiter Kunal`, `Receptionist`, `Super Admin`) with a single click to test every module interactively!

### 2. Run the Backend (.NET 8 Web API)
```bash
cd restaurant-system/backend
dotnet restore
dotnet run
```
Access Swagger UI at **`http://localhost:5000/swagger`**.

### 3. Setup the Database (Local Docker Supabase Stack)
The project is connected to the local Docker Supabase instance running on your system:
- **Supabase REST Gateway**: `http://localhost:8000`
- **PostgreSQL Database**: `Host=localhost;Port=5432;Database=postgres;Username=postgres;Password=your-super-secret-and-long-postgres-password`
- **Supabase Studio UI**: `http://localhost:8000` (or Docker port 3000 / Studio container)
- **Realtime WebSocket**: `ws://localhost:8000/realtime/v1`

All 6 migration and seed scripts are already applied to your local Supabase database using:
```bash
cd restaurant-system/database
chmod +x apply_migrations.sh
./apply_migrations.sh
```

Scripts executed in sequence:
1. `database/migrations/001_initial_schema.sql` (14 relational tables with UUIDs, constraints, JSONB)
2. `database/migrations/002_indexes_and_constraints.sql` (B-Tree, partial & composite indexes)
3. `database/functions/001_reservation_functions.sql` (Advisory locks & dynamic table allocation)
4. `database/functions/002_order_functions.sql` (Strict 1-min cancellation window & state machine)
5. `database/policies/001_row_level_security.sql` (RLS policies for Super Admin, Receptionist, Kitchen, Waiter, Customer)
6. `database/seeds/001_seed_data.sql` (Sunrise Café, 12 tables, 8 categories, 16 dishes, 6 users)

---

## 👥 Demo Accounts (Password: `Password@123`)

| Email | Role | Module Accessed |
| :--- | :--- | :--- |
| `superadmin@sunrisecafe.com` | `SUPER_ADMIN` | Full System Access |
| `receptionist@sunrisecafe.com` | `RECEPTIONIST` | Receptionist Panel (`/receptionist`) |
| `kitchen@sunrisecafe.com` | `KITCHEN` | Kitchen Display System (`/kitchen`) |
| `waiter.kunal@sunrisecafe.com` | `WAITER` | Waiter Panel (`/waiter`) |
| `customer.rahul@example.com` | `CUSTOMER` | Public Website & QR Dine-In (`/`, `/qr/...`) |

---

## 🧪 Testing Key Real-Time Workflows

1. **Test 1-Minute Order Cancellation (Section 5)**:
   - Go to Table 1 Dine-In (`/qr/a0000000-0000-0000-0000-000000000001/c0000000-0000-0000-0000-000000000001`).
   - Add items and place order.
   - Observe the live 60-second countdown timer. Click *Cancel Order* before 60s expires -> Order cancels cleanly.
   - After 60s expires or once Kitchen accepts the ticket, cancellation is rejected by the backend.

2. **Test Real-Time Kitchen & Waiter Coordination (Sections 10, 11, 17)**:
   - Open two tabs: Tab A on `/kitchen` (Kitchen) and Tab B on `/waiter` (Waiter).
   - In Kitchen, click *Mark Ready* on a preparing ticket.
   - Tab B immediately plays a melodic alert chime and displays *"TABLE NO X ORDER IS READY"*.
   - Waiter clicks *[ OK ] Collected & Served*.

3. **Test Customer Order Receipt Confirmation (Section 8)**:
   - When the waiter serves the order, the customer's QR screen pops up: *"Have you received your complete order? YES / NO"*.
   - If customer selects **YES** -> Order moves to `DELIVERED`.
   - If customer selects **NO** -> Receptionist panel immediately sounds an alert and creates a high-priority issue: *"TABLE X CUSTOMER HAS NOT RECEIVED ORDER #Y"*.

4. **Test Waiter Help Call Assignment Locking (Sections 7 & 18)**:
   - On the QR menu, tap the upper-right **Help** button and request *"Need water"*.
   - In the Waiter panel, click *[ ACCEPT ]*.
   - Customer screen updates instantly to: *"The Waiter Kunal Is Coming."*
   - Other waiters see the call locked to prevent duplicate responses.

5. **Test Live Food Availability Synchronization (Section 15)**:
   - In Kitchen Panel (`/kitchen`), open the *Dish Availability* tab and mark a dish *"Sold Out"*.
   - Switch to the Public Menu or QR Menu -> the item updates to unavailable in real time and cannot be added to cart.
