# BistroPOS Cybersecurity Guide & Hardening Tracker

This document tracks **what cybersecurity vulnerabilities were identified**, **what has been fixed and verified in code**, and **what manual / deployment steps remain** before staging or production launch.

It follows core security engineering principles:
1. **Defense in Depth** — never rely on a single check (API + Service + DB RLS + Browser headers).
2. **Fail Secure** — deny access by default when configuration, secrets, signatures, or ownership cannot be verified.
3. **Least Privilege** — staff, customers, and anonymous QR guests receive only minimum required permissions.
4. **Trust Nothing Outside the Trust Boundary** — never trust client-supplied prices, IDs, signatures, `X-Forwarded-For` headers, or stale JWT claims alone.

---

## Live Progress Summary

| Priority | Total Items | Code Fixed & Tested | Partial / Architecture Follow-Up | Manual / Deployment Action |
| :--- | :---: | :---: | :---: | :--- |
| **P0 — Critical** | 7 | 7 | — | 🔑 Rotate exposed dev/cloud keys & apply `003_hardened_rls_policies.sql` to DB |
| **P1 — High** | 6 | 6 | — | 🔑 Configure `KnownProxies` when deploying behind Nginx/Cloudflare |
| **P2 — Medium** | 5 | 4 | 1 (`HttpOnly` cookie auth + real Razorpay checkout SDK) | 🔑 Configure production CSP & CORS origins (`Security:CorsAllowedOrigins`) |

> **Legend:** `✅ DONE` = Implemented & verified · `🟡 PARTIAL` = Backend hardened; full rollout needs frontend/infra coordination · `🔑 MANUAL` = Requires your deployment/DB action

---

## P0 — Critical Security Fixes

### 1. Remove Universal `"Password@123"` Auth Backdoor & Lock Down Demo Login
- **Status:** ✅ DONE
- **Problem:**
  - `backend/Services/AuthService.cs` previously allowed `"Password@123"` to bypass BCrypt password verification for **any** account.
  - `POST /api/auth/demo-login` (`AuthController.DemoLogin` / `AuthService.DemoLoginAsync`) ran in all environments without an environment gate and dropped `users_role_check` constraints at runtime.
- **What Changed:**
  - Removed the hardcoded `"Password@123"` bypass in [`backend/Services/AuthService.cs`](backend/Services/AuthService.cs). Disabled status checks now happen cleanly without pre-auth account enumeration.
  - Updated [`backend/Services/UserProvisioning.cs`](backend/Services/UserProvisioning.cs) so seed users are provisioned **only** in `Development` with real `BCrypt.HashPassword(...)` hashes (and `users_role_check` is recreated with `'MANAGER'` instead of left dropped).
  - Locked `DemoLogin` (`AuthController` + `AuthService`) behind **both** `IHostEnvironment.IsDevelopment()` AND `Features:EnableDemoLogin` (`false` by default in `appsettings.json`), returning `404` in production.

---

### 2. Fix Cross-Tenant User Deletion, Role Escalation & Weak Default Staff Passwords
- **Status:** ✅ DONE
- **Problem:**
  - `DELETE /api/users/{id}` allowed a `MANAGER` from Outlet A to delete any user across any restaurant (including `SUPER_ADMIN` or Outlet B's manager).
  - `POST /api/users` silently defaulted omitted passwords to `"bistro123"` and trusted `[FromQuery] Guid restaurantId`.
  - `InventoryService.ReportShortageAsync` modified `MenuItems` without verifying `RestaurantId`, and `WaitlistService.SeatGuestAsync` seated guests without checking `table.RestaurantId` or occupancy status.
- **What Changed:**
  - Hardened `UsersController` ([`backend/Controllers/ApiControllers.cs`](backend/Controllers/ApiControllers.cs)) with `ITenantContext` tenant isolation, role hierarchy enforcement (`MANAGER` cannot create/delete `MANAGER` or `SUPER_ADMIN`, no self-deletion), audit logging, and strict `>= 8` char alphanumeric password checks (removed `"bistro123"`).
  - Scoped `InventoryService.ReportShortageAsync` ([`backend/Services/InventoryService.cs`](backend/Services/InventoryService.cs)) to `m.RestaurantId == request.RestaurantId`.
  - Hardened `WaitlistService.SeatGuestAsync` ([`backend/Services/WaitlistService.cs`](backend/Services/WaitlistService.cs)) to reject cross-tenant, occupied, or out-of-service tables, and removed phone/name PII from operational logs.

---

### 3. Fix `ResourceAccessFilter` Parameter Bypasses & Anonymous Endpoint Exposures
- **Status:** ✅ DONE
- **Problem:**
  - `ResourceAccessFilter` only checked arguments literally named `id`, bypassing `{orderId:guid}`, `{orderItemId:guid}`, `{paymentId:guid}`, `Orders.DeleteOrder(idOrNumber)`, `UsersController`, and `RestaurantsController` mutations.
  - Endpoints missing `[Authorize]` or ownership validation: `TablesController.CloseTableSession`, `InventoryController.GetInventory`/`ReportShortage`, `OrdersController.EmailReceipt`, `WaitlistController.GetWaitlist`/`AddWalkIn`, `FeedbackController.GetFeedbacks`, and `LoyaltyController` (`Earn`/`Redeem`/`Balance`).
- **What Changed:**
  - Upgraded [`backend/Security/ResourceAccessFilter.cs`](backend/Security/ResourceAccessFilter.cs) to inspect `{id}`, `{orderId}`, `{paymentId}`, `{orderItemId}`, `idOrNumber`, `Users`, `Auth.UpdateStaffStatus`, `Inventory`, `Waitlist`, `Payments`, and non-GET `Restaurants` actions.
  - Set `resource = "order"` / `"help"` unconditionally for order/help capability checks so nonexistent GUIDs return `403` uniformly instead of leaking existence oracles (`400`/`404`).
  - Added `[Authorize]` policies to `CloseTableSession`, `GetInventory`, `ReportShortage`, `Waitlist` (`Get`/`Post`/`Notify`/`Seat`/`Cancel`), `FeedbackController.GetFeedbacks`, and `LoyaltyController.EarnPoints`.
  - Restricted `LoyaltyController.RedeemPoints` (with advisory lock transaction in [`backend/Services/LoyaltyAndFeedbackService.cs`](backend/Services/LoyaltyAndFeedbackService.cs)) to staff or guests with a valid order capability token, and masked `CustomerName`/`CustomerEmail` on unauthenticated `LoyaltyController.GetBalance`.
  - Updated [`frontend/src/services/api.js`](frontend/src/services/api.js) and [`frontend/src/components/billing/QrTablePaymentModal.jsx`](frontend/src/components/billing/QrTablePaymentModal.jsx) to forward `accessToken` (`X-Resource-Token`) on `emailReceipt`, `verifyPayment`, and `redeemLoyaltyPoints`.

---

### 4. Harden Payment Webhook & Verification Signature Validation (Fail Closed)
- **Status:** ✅ DONE (Backend) · 🟡 Client Mock Checkout Note
- **Problem:**
  - `POST /api/payments/webhook` processed `payment.captured` events with **zero** signature verification.
  - `VerifyPaymentAsync` skipped HMAC checks when `SecretKey` matched `"dev-secret-change-in-production"` or was empty, and used non-constant-time `string.Equals`.
- **What Changed:**
  - Updated [`backend/Services/InfrastructureServices.cs`](backend/Services/InfrastructureServices.cs) and `PaymentsController.Webhook` ([`backend/Controllers/ApiControllers.cs`](backend/Controllers/ApiControllers.cs)) to require valid HMAC-SHA256 verification via `CryptographicOperations.FixedTimeEquals` on both `VerifyPaymentAsync` and `ProcessWebhookAsync`, failing closed (`401`/`400`) when secrets are unset or invalid.
- **Note for Live Gateway Rollout:** `QrTablePaymentModal.jsx` and `PaymentModal.jsx` currently simulate mock UPI/card confirmations in the UI (`signature: 'verified'`). When integrating live Razorpay Checkout, return the gateway-signed `razorpay_signature` directly from the Razorpay modal to `/api/payments/verify` and ensure `PaymentGateway:WebhookSecret` matches your Razorpay dashboard webhook secret.

---

### 5. Separate Capability Signing Key & Add Token Expiry (`ResourceTokens`)
- **Status:** ✅ DONE
- **Problem:** `ResourceTokens` signed non-expiring tokens directly with `Jwt:SecretKey`.
- **What Changed:** [`backend/Security/ResourceTokens.cs`](backend/Security/ResourceTokens.cs) now supports a dedicated `Security:ResourceTokenKey` (with SHA-256 domain separation if only `Jwt:SecretKey` is set), enforces token expiration (`Security:ResourceTokenHours`, default `24h`), and verifies signatures with `CryptographicOperations.FixedTimeEquals`.

---

### 6. Harden Database Row Level Security (RLS) Policies
- **Status:** ✅ SQL Script Created · 🔑 **MANUAL DB APPLY REQUIRED**
- **Problem:** `database/policies/002_fix_rls_policies.sql` previously introduced `USING (true)` policies on `users`, `orders`, `reservations`, `tables`, etc., and `002_restaurant_pos_security.sql` omitted `'MANAGER'` from `is_staff(...)`.
- **What Changed:** Created [`database/policies/003_hardened_rls_policies.sql`](database/policies/003_hardened_rls_policies.sql) to drop those wide-open `public` policies, add `MANAGER` parity in `restaurant_pos.is_staff(...)`, and restore strict per-tenant RLS across `users`, `orders`, `reservations`, `payments`, `customer_issues`, and `audit_logs`.
- **Manual Step Required:** Run `database/policies/003_hardened_rls_policies.sql` against your PostgreSQL / Supabase database (`psql` or Supabase SQL Editor).

---

### 7. Remove Committed Secrets from Repository & Config Hygiene
- **Status:** ✅ Code Cleaned · 🔑 **MANUAL KEY ROTATION REQUIRED**
- **What Changed:**
  - Stripped plaintext secrets from tracked [`backend/appsettings.json`](backend/appsettings.json) and [`backend/appsettings.Development.json`](backend/appsettings.Development.json).
  - Updated [`backend/Program.cs`](backend/Program.cs) to load optional `appsettings.Development.local.json` only in `Development`, fail fast if `Jwt:SecretKey < 32 chars`, and gitignored `appsettings.Development.local.json` & `appsettings.*.local.json` in [`.gitignore`](.gitignore).
  - Created [`.env.example`](.env.example) documenting all production environment variables (`Jwt__SecretKey`, `Security__ResourceTokenKey`, `PaymentGateway__SecretKey`, `PaymentGateway__WebhookSecret`, `Features__EnableDemoLogin=false`).
- **Manual Step Required:** Before hosting publicly, rotate your Supabase `ServiceRoleKey`, database password, JWT signing key, and gateway secrets (old dev values still exist in prior git history).

---

## P1 — High-Severity Hardening

| ID | Issue | Status | Summary of Fix |
| :--- | :--- | :---: | :--- |
| **P1-1** | Immediate revocation for `DISABLED` / `INACTIVE` accounts | ✅ DONE | [`ResourceAccessFilter.cs`](backend/Security/ResourceAccessFilter.cs) now validates live DB `User.Status` (`DISABLED` or `INACTIVE` -> `401 Unauthorized`) on authenticated requests; `TenantSecurityMiddleware` also checks both statuses; default JWT expiry reduced from `1440` -> `240` min in [`AppSettings.cs`](backend/Configuration/AppSettings.cs). |
| **P1-2** | Fix Rate Limiter `X-Forwarded-For` spoofing & memory DoS | ✅ DONE | Removed untrusted client `X-Forwarded-For` parsing in [`CustomMiddlewares.cs`](backend/Middleware/CustomMiddlewares.cs), wired `app.UseForwardedHeaders()` in [`Program.cs`](backend/Program.cs), and added periodic pruning (`MaxTrackedKeys = 10000`) to `MemoryRateLimitingMiddleware`. *(🔑 Configure `ForwardedHeadersOptions.KnownProxies` in `Program.cs` when behind a reverse proxy.)* |
| **P1-3** | Hide internal DB/exception details outside Development | ✅ DONE | Updated `ExceptionHandlingMiddleware` ([`CustomMiddlewares.cs`](backend/Middleware/CustomMiddlewares.cs)) using `IHostEnvironment` so `500` and `DbUpdateException` responses return generic safe text + `traceId` in Staging/Production. |
| **P1-4** | Prevent reservation lookup enumeration & PII leaks | ✅ DONE | Updated `LookupReservationAsync` ([`backend/Services/ReservationService.cs`](backend/Services/ReservationService.cs)) to remove 3-char name wildcard queries; `ReservationsController.LookupReservation` masks emails, phones, and special requests for unauthenticated callers. |
| **P1-5** | Stronger password & HTTPS validation rules | ✅ DONE | Enforced `>= 8` chars with letter + digit in [`ApiValidators.cs`](backend/Validators/ApiValidators.cs) & `RegisterRequest`/`CreateStaff`/`CreateManager` ([`backend/DTOs/ApiDtos.cs`](backend/DTOs/ApiDtos.cs)). Set `RequireHttpsMetadata = !IsDevelopment` in [`Program.cs`](backend/Program.cs). |
| **P1-6** | `MANAGER` RBAC parity across controllers & SignalR hub | ✅ DONE | Added `UserRoles.Manager` to `UpdateWifi`, `Inventory` (`Create`/`UpdateStock`), `Orders.UpdateItemStatus`, `Reservations` (`PlanEvent`/`PrepSheet`), `Payments.ConfirmCash`, `Waitlist`, `Help.ResolveHelp` ([`ApiControllers.cs`](backend/Controllers/ApiControllers.cs)), and `NotificationHub.JoinTableGroup` ([`NotificationHub.cs`](backend/Hubs/NotificationHub.cs)). |

---

## P2 — Medium-Severity Defense-in-Depth

| ID | Issue | Status | Notes |
| :--- | :--- | :---: | :--- |
| **P2-1** | Security Response Headers & Referrer Hygiene | ✅ DONE | Added `SecurityHeadersMiddleware` in [`CustomMiddlewares.cs`](backend/Middleware/CustomMiddlewares.cs) (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, standard `Permissions-Policy: camera=(), microphone=(), geolocation=()`, API `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, plus non-dev `UseHsts()`) and `<meta name="referrer">` in [`frontend/index.html`](frontend/index.html). |
| **P2-2** | Configurable CORS origins & consistent JWT key length | ✅ DONE | `Program.cs` reads `Security:CorsAllowedOrigins`; removed `.PadRight(32)` mismatch so `AuthService` and `Program.cs` require identical `>= 32` char JWT keys. |
| **P2-3** | PII redaction in receipt logs | ✅ DONE | Updated [`EmailReceiptService.cs`](backend/Services/EmailReceiptService.cs) so email addresses and full receipt contents are not dumped into info logs. |
| **P2-4** | `HttpOnly` Cookie Auth + Strict Frontend CSP | 🟡 PENDING (Arch) | Currently the SPA/Electron app sends Bearer JWT from `sessionStorage` (`api.js`). Migrating to `HttpOnly; Secure; SameSite=Lax` cookies (+ CSRF anti-forgery token) and serving strict frontend CSP headers at Nginx/reverse proxy eliminates browser JS token theft risks. |
| **P2-5** | Automated Security Regression Test Suite | ✅ DONE | Added [`tests/integration/security-regression.mjs`](tests/integration/security-regression.mjs) covering HTTP security headers, 12 unauthenticated/forged signature checks, weak password & `"Password@123"` rejection, `Production` demo-login lockdown (`404`), cross-tenant `MANAGER` protections, and immediate JWT revocation on deactivation. |

---

## How to Configure Environments & Run Checks

### Local Development Setup
Local DB/JWT/gateway dev values are read from `backend/appsettings.Development.local.json` (gitignored) or `.NET User Secrets`:
```bash
dotnet user-secrets init --project backend/RestaurantSystem.Api.csproj
dotnet user-secrets set "Jwt:SecretKey" "<32+-char-random-secret>" --project backend/RestaurantSystem.Api.csproj
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "Host=localhost;Port=5432;..." --project backend/RestaurantSystem.Api.csproj
```

### Production Environment Variables
Use `.env.example` as reference and supply secrets via your secrets manager / platform env:
```bash
ASPNETCORE_ENVIRONMENT=Production
ConnectionStrings__DefaultConnection=...
Jwt__SecretKey=...
Security__ResourceTokenKey=...
Security__CorsAllowedOrigins__0=https://pos.yourrestaurant.com
PaymentGateway__SecretKey=...
PaymentGateway__WebhookSecret=...
Features__EnableDemoLogin=false
```

### Verification Commands
```bash
# 1. Build backend & frontend
dotnet build backend/RestaurantSystem.Api.csproj
npm --prefix frontend run build

# 2. Run role & tenant switcher unit assertions
node tests/integration/manager-role-outlet-switcher.mjs

# 3. Run security regression suite against running API (Dev or Prod mode)
API_BASE_URL="http://127.0.0.1:5050/api" node tests/integration/security-regression.mjs
```

---

## Changelog of Applied Fixes (Latest Run)
- **Verified Passing (`dotnet build`: 0 errors; `vite build`: succeeded; `manager-role-outlet-switcher.mjs`: PASS; `security-regression.mjs`: PASS in both `Development` on `:5056` and `Production` on `:5057` using isolated InMemoryDB).**
- Applied all P0, P1, and P2-1/P2-2/P2-3/P2-5 code controls listed above.
