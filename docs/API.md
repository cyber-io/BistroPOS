# REST API & Real-Time Specifications

Base URL: `http://localhost:5000` (or `https://api.sunrisecafe.com`)

## 1. Authentication (`/api/auth`)

### `POST /api/auth/register`
Creates a new customer or staff account.
- **Request Body**:
  ```json
  {
    "name": "John Doe",
    "email": "john.doe@example.com",
    "phone": "+91 9876543210",
    "password": "Password@123",
    "role": "CUSTOMER",
    "restaurantId": "a0000000-0000-0000-0000-000000000001"
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "token": "eyJhbGciOi...",
    "user": {
      "userId": "b0000000-...",
      "name": "John Doe",
      "email": "john.doe@example.com",
      "role": "CUSTOMER"
    }
  }
  ```

### `POST /api/auth/login`
Authenticates a user and returns a signed JWT Bearer token.

### `GET /api/auth/me`
Requires `Bearer <token>`. Returns currently logged-in user profile.

---

## 2. Orders (`/api/orders`)

### `POST /api/orders`
Creates a new Dine-in, Delivery, or Takeaway order.
- **Request Body**:
  ```json
  {
    "restaurantId": "a0000000-0000-0000-0000-000000000001",
    "tableId": "c0000000-0000-0000-0000-000000000001",
    "source": "DINE_IN_QR",
    "items": [
      {
        "menuItemId": "e0000000-0000-0000-0000-000000000001",
        "quantity": 1,
        "customizationJson": "{\"Crust\": \"Thin Crust\"}",
        "specialInstruction": "Extra crispy base"
      }
    ],
    "specialInstructions": "Please serve with extra napkins"
  }
  ```
- **Response `201 Created`**: Returns created order object with snapshot prices, tax, and order number (`ORD-XXXX`).

### `GET /api/orders/{id}`
Returns order details by ID with line items.

### `PATCH /api/orders/{id}/status`
*Requires Staff Authorization (`KITCHEN`, `WAITER`, `RECEPTIONIST`, `SUPER_ADMIN`)*.
Updates order status adhering to valid state machine transitions:
- `NEW` -> `ACCEPTED` / `PREPARING`
- `PREPARING` -> `READY` (dispatches waiter event)
- `READY` -> `PENDING_CONFIRMATION`
- `PENDING_CONFIRMATION` -> `DELIVERED`

### `POST /api/orders/{id}/cancel`
Enforces the **1-minute cancellation rule**. If elapsed time is <= 60 seconds and status is `NEW`, cancels the order. Otherwise, returns HTTP 400 Bad Request.

### `POST /api/orders/{id}/confirm-receipt?confirmed=true`
Called when the customer responds to the Section 8 order receipt prompt:
- If `confirmed=true`: moves to `DELIVERED`.
- If `confirmed=false`: alerts receptionist: *"TABLE X CUSTOMER HAS NOT RECEIVED ORDER #Y"*.

---

## 3. Reservations (`/api/reservations`)

### `GET /api/reservations/availability`
Query parameters: `restaurantId`, `date`, `guestCount`.
Dynamically calculates available time slots by evaluating all tables with `capacity >= guestCount` and existing bookings.

### `POST /api/reservations`
Creates a table booking with automatic capacity matching and concurrency protection. Returns booking ID `RES-XXXXX` and assigned table number.

### `PATCH /api/reservations/{id}/status`
Updates reservation status: `ARRIVED`, `SEATED`, `COMPLETED`, `CANCELLED`, `NO_SHOW`.

---

## 4. Tables & QR Management (`/api/tables` & `/api/qr`)

### `GET /api/tables?restaurantId={id}`
Returns all configurable tables, seating capacities, current guests, and statuses.

### `GET /api/qr/validate/{qrCode}`
Validates that the scanned QR code corresponds to an active restaurant and valid table.

### `PUT /api/tables/{id}/status`
Updates table status: `AVAILABLE`, `RESERVED`, `OCCUPIED`, `WAITING_FOR_CLEANING`, `OUT_OF_SERVICE`.

---

## 5. Menu & Food Availability (`/api/menu`)

### `GET /api/menu/categories`
Returns active menu categories.

### `GET /api/menu/items`
Returns menu items with category, spice levels, veg/non-veg indicator, and prices.

### `PATCH /api/menu/items/{id}/availability`
*Requires `KITCHEN` or `RECEPTIONIST` role*.
Sets item availability `true` / `false`. Broadcasts change immediately to all connected clients.

---

## 6. Payments (`/api/payments`)

### `POST /api/payments/initiate`
Initiates an idempotent payment transaction.

### `POST /api/payments/verify`
Cryptographically verifies payment signature against gateway secret before marking `PAID`.

### `POST /api/payments/webhook`
Webhook listener verifying HMAC-SHA256 signatures to process asynchronous gateway confirmations.

---

## 7. Customer Help & Issues (`/api/help` & `/api/issues`)

### `POST /api/help`
Creates a table assistance request (`"Need water"`, `"Which food is sweet?"`, etc.). Notifies floor waiters.

### `POST /api/help/{id}/assign`
*Requires `WAITER` role*.
Atomically assigns the request to the accepting waiter. Notifies the table: *"The Waiter [Name] Is Coming."*

---

## 8. Real-Time SignalR Hub (`/hubs/notifications`)

Clients connect via WebSocket or Server-Sent Events with JWT Bearer authentication.

### Hub Groups:
- `tenant_{restaurantId}`: All staff of the restaurant.
- `tenant_{restaurantId}_kitchen`: Kitchen display terminals.
- `tenant_{restaurantId}_waiter`: Waiter floor tablets.
- `tenant_{restaurantId}_receptionist`: Receptionist dashboard.
- `table_{restaurantId}_{tableId}`: Connected guest table for live status updates.

### Broadcast Events:
- `NEW_ORDER`: Dispatched when an order is placed.
- `ORDER_READY`: Dispatched when kitchen marks food ready (`"TABLE NO X ORDER IS READY"`).
- `CUSTOMER_HELP_REQUEST`: Dispatched when a table calls for help.
- `WAITER_HELP_ACCEPTED`: Dispatched when a waiter accepts a call.
- `FOOD_AVAILABILITY_CHANGED`: Dispatched when dish stock status changes.
