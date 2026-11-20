# Security Architecture & Compliance Specification

## 1. Multi-Tenant Security & Data Isolation (Section 49)

Every tenant entity contains a non-nullable `restaurant_id` column.
Cross-restaurant data access is strictly prevented through defense-in-depth:
1. **Supabase Row Level Security (RLS)**: Enforced directly on PostgreSQL tables using security definer functions and JWT claims.
2. **Backend ASP.NET Core Middleware (`TenantSecurityMiddleware`)**: Inspects every incoming request. If a user belonging to Restaurant A attempts to pass an identifier or payload for Restaurant B, the request is immediately rejected with HTTP 403 Forbidden.
3. **Database Foreign Key Constraints**: Strict cascading rules and composite foreign key indexes prevent orphaned or unassigned records.

---

## 2. Authentication & Session Security (Section 50 & 58)

- **Identity Provider**: Supabase Authentication / ASP.NET Core JWT Bearer.
- **Passwords**: Never stored in plaintext. Hashed using **BCrypt** with adaptive work factor (11 rounds).
- **Tokens**: Signed using HMAC-SHA256 with 256-bit secret keys.
- **Session Lifetimes**: Expire automatically; refresh tokens are stored securely.
- **Cookie Security**: `HttpOnly`, `Secure`, and `SameSite=Strict` flags applied where applicable.

---

## 3. Role-Based Access Control (RBAC) (Section 51 & 52)

Authorization is strictly enforced on the backend. Frontend button hiding is purely for user experience and is never treated as a security boundary.

| Role | Permissions & Boundaries |
| :--- | :--- |
| `SUPER_ADMIN` | Full unrestricted administrative management across the assigned tenant. |
| `RECEPTIONIST` | Manage tables, reservations, floor seating, billing, checkout, customer issues, QR codes. |
| `KITCHEN` | Order preparation queue (accept/reject/cook/ready), food item availability toggles. |
| `WAITER` | Floor pass notifications, collect & serve orders, attend table help calls. **Restricted**: No access to menu pricing, staff salaries, financial records, or system settings. |
| `CUSTOMER` | Place orders for own table/delivery, cancel within 1-min rule, submit reservations, request waiter help. |

Every protected endpoint validates:
1. Is the request authenticated?
2. Does the caller possess the requisite role claim?
3. Does the resource belong to the caller's restaurant tenant?
4. Is the caller the owner of the resource (for customers)?
5. Is the state machine transition allowed by business rules?

---

## 4. Business Rule Concurrency & Critical Validations

### 4.1 Strict 1-Minute Order Cancellation (Section 5)
- Customer order cancellation is permitted **only within 60 seconds** of order creation and only if status is `NEW`.
- The rule is enforced server-side:
  ```csharp
  var elapsedSeconds = (DateTime.UtcNow - order.CreatedAt).TotalSeconds;
  if (elapsedSeconds > 60) {
      return (false, "Cancellation limit exceeded. Orders can only be cancelled within 1 minute of creation.");
  }
  ```

### 4.2 Real Table Availability & Conflict Prevention (Section 39 & 40)
- Hardcoded booking slots are forbidden. Availability is computed in real time by evaluating existing confirmed, arrived, and seated bookings.
- Double bookings are prevented using database transaction locks (`pg_advisory_xact_lock` or `BeginTransactionAsync`).

### 4.3 Order Item Availability Double-Check (Section 15)
- When a customer submits an order, the backend re-verifies that all ordered items are currently `AVAILABLE = TRUE`. If an item was marked sold out while the customer was browsing, the order is rejected with HTTP 409 Conflict.

---

## 5. Payment Security & Webhook Signatures (Section 60 & 61)

- Raw credit/debit card numbers and CVV codes are **never** received or stored on application servers.
- Frontend payment responses are **never trusted**. Only backend-verified gateway signatures or signed webhooks mark an order or reservation as `PAID`.
- Webhooks verify cryptographic HMAC-SHA256 signatures before processing payloads to prevent spoofing and replay attacks.
- Idempotency keys prevent duplicate payments on repeated network submissions.

---

## 6. Input Validation, SQL Injection & XSS Protection (Sections 54-57)

- **SQL Injection**: Parameterized SQL via Entity Framework Core and Npgsql. Raw SQL string concatenation is forbidden.
- **XSS Protection**: All user-generated text (names, special instructions, dish notes, issue resolutions) is sanitized and treated as untrusted strings. Direct rendering of raw HTML is blocked.
- **Server Validation**: FluentValidation enforces strict constraints on email formats, telephone regular expressions, numeric party sizes (1–50), and string lengths.

---

## 7. Rate Limiting (Section 59)

A memory-sliding window rate limiter (`MemoryRateLimitingMiddleware`) restricts:
- Authentication endpoints (`/api/auth/*`): max 20 requests per minute per IP.
- Order and reservation creation: max 120 requests per minute per IP.
Exceeding the threshold returns HTTP 429 Too Many Requests with a `Retry-After: 60` header.

---

## 8. Centralized Exception Handling & Sanitization (Section 62 & 63)

Exceptions are intercepted globally by `ExceptionHandlingMiddleware`:
- Standardized RFC 7807 `application/problem+json` responses.
- Stack traces, database passwords, SQL syntax, and internal infrastructure topology are **never exposed** to the client.
- User-friendly messages are returned for common business errors.

---

## 9. Comprehensive Audit Logging (Section 67)

Every critical operational event is persisted to the `audit_logs` table:
- `USER_LOGIN` / `USER_REGISTERED`
- `ORDER_CREATED` / `ORDER_ACCEPTED` / `ORDER_CANCELLED` / `ORDER_READY` / `ORDER_DELIVERED`
- `RESERVATION_CREATED` / `RESERVATION_RESCHEDULED` / `TABLE_ASSIGNED`
- `PAYMENT_INITIATED` / `PAYMENT_VERIFIED_PAID`
- `FOOD_AVAILABILITY_CHANGED`
- `HELP_REQUEST_ASSIGNED` / `ISSUE_RESOLVED`
Logs capture: timestamp, user ID, user role, action, target resource, metadata snapshot, and IP address. No secrets or card details are ever logged.
