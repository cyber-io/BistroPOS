# System Architecture: Complete Restaurant & Café Management Platform

## 1. Executive Summary

This document specifies the technical architecture for the multi-tenant **Complete Restaurant & Café Management System**, engineered with a high-performance **.NET 8 Web API** backend, **Supabase PostgreSQL** database with Row-Level Security (RLS), and a responsive **React.js** frontend.

The platform unites five interconnected operational modules:
1. **Customer QR Menu & Dine-In Ordering**
2. **Kitchen Panel (Kitchen Display System - KDS)**
3. **Waiter Panel**
4. **Receptionist Panel**
5. **Public Responsive Restaurant Website**

---

## 2. High-Level Architectural Flow

```
                      +---------------------------------------+
                      |       Public Responsive Website       |
                      |   (Home, Menu, Delivery, Takeaway,    |
                      |          Table Reservations)          |
                      +-------------------+-------------------+
                                          |
                                          | HTTPS / REST
                                          v
+------------------------+    +------------------------+    +------------------------+
| Customer Table QR Menu |    |     ASP.NET Core       |    |      Kitchen KDS       |
|  (Mobile-First Dine-In |<-->|       .NET 8           |<-->| (Prep, Pass, Alerts,   |
|   1-Min Cancellation)  |    |     Web API Core       |    |   Item Availability)   |
+------------------------+    +-----------+------------+    +------------------------+
                                          |
                +-------------------------+-------------------------+
                |                         |                         |
                v                         v                         v
   +------------------------+   +-------------------+   +------------------------+
   |      Waiter Panel      |   |    Receptionist   |   |  Supabase PostgreSQL   |
   | (Ready Orders, Help,   |   | (Floor Map, Rsv,  |   | (RLS, Multi-Tenancy,   |
   |  Assignment Locking)   |   | Billing, Issues)  |   |  Transactions, Triggers|
   +------------------------+   +-------------------+   +------------------------+
```

---

## 3. Five Operational Modules

### 3.1 Module 1: Customer QR Menu & Dine-In Ordering
- **Interface**: Dedicated mobile-first interface opened exclusively when scanning physical table QR codes (`/qr/:restaurantId/:tableId`).
- **Core Capabilities**:
  - Validates table identity and restaurant binding against the backend API.
  - Interactive menu categorized by cuisine, veg/non-veg indicator, spice level, and sweet tags.
  - Cart drawer with subtotal, 5% GST calculation, total, and live order placement.
  - **1-Minute Cancellation Window**: Enforced server-side. Orders in `NEW` status can only be cancelled within 60 seconds of creation.
  - **Order Receipt Confirmation Prompt**: Upon food serving (`READY` -> `PENDING_CONFIRMATION`), prompts the customer: *"Have you received your complete order? YES / NO"*. If NO, immediately escalates to Receptionist.
  - **Upper-Right Help Button**: Provides 1-tap alerts (*Water*, *Cutlery*, *Assistance*, *Sweet/Spicy query*).

### 3.2 Module 2: Kitchen Display System (KDS)
- **Interface**: High-contrast, dark-mode kitchen display (`/kitchen`).
- **Status Columns**: `NEW`, `PREPARING`, `READY`, `DELIVERED`, `CANCELLED`.
- **Actions**:
  - Accept ticket: moves to `PREPARING`.
  - Reject ticket: requires reason, marks `CANCELLED`, notifies customer.
  - Mark `READY`: triggers instant real-time event to floor staff: *"TABLE NO X ORDER IS READY"*.
  - **Live Food Availability Control**: Kitchen toggles dishes `AVAILABLE` or `UNAVAILABLE`. Backend blocks ordering unavailable items immediately.

### 3.3 Module 3: Waiter Panel
- **Interface**: Lightweight, floor-optimized mobile/tablet view (`/waiter`).
- **Responsibilities**:
  - Live ready-order notification stream with pickup acknowledgment.
  - Live customer help call feed.
  - **Assignment Locking**: When Waiter Kunal clicks `[ ACCEPT ]`, state is atomically assigned to prevent duplicate responses. Customer displays: *"The Waiter Kunal Is Coming"*.
  - **Scoped Permissions**: Strictly restricted from menu pricing, restaurant settings, staff management, and financial summaries.

### 3.4 Module 4: Receptionist Panel
- **Interface**: Operations hub (`/receptionist`).
- **Sub-modules**:
  - **KPI Dashboard**: Total, available, occupied, reserved, cleaning tables, active orders, sales.
  - **Table Management**: Visual color-coded floor map (`AVAILABLE`, `RESERVED`, `OCCUPIED`, `WAITING_FOR_CLEANING`, `OUT_OF_SERVICE`).
  - **Customer Arrival Flow**: Reservation Confirmed -> Arrived -> Assign Table -> Seated -> QR Ordering active.
  - **Billing & Payments**: Bill generation, payment verification, customer checkout, auto-transition to `WAITING_FOR_CLEANING`.
  - **Customer Issue Escalation**: Handles delivery disputes and unanswered help calls.
  - **QR Code Management**: Generates, validates, and prints unique table QR codes.

### 3.5 Module 5: Public Responsive Restaurant Website
- **Interface**: Multi-device public web presence (`/`, `/menu`, `/delivery`, `/takeaway`, `/book-table`, `/track-order`).
- **Core Capabilities**:
  - Landing page with hero, chef specials, reviews, gallery, location, and hours.
  - Online delivery checkout with customer address, landmark, instructions, and live status progress bar.
  - Takeaway pickup scheduling.
  - **Real Table Availability Engine**: Calculates available time slots dynamically from table capacities and booking schedules (no hardcoded slots). Automatic table assignment.

---

## 4. Multi-Tenant Architecture & Security

- Every domain entity contains `restaurant_id`.
- Tenant isolation is enforced simultaneously across 3 defense layers:
  1. **Database Layer (Supabase RLS)**: SQL policies filter all queries by `restaurant_id = auth.jwt() ->> 'restaurant_id'`.
  2. **API Middleware Layer (`TenantSecurityMiddleware`)**: Validates claims on incoming requests and blocks cross-tenant headers.
  3. **Service Layer**: Explicit tenant boundary checks in every database query.
