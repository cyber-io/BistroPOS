# BistroPOS — Phase 2: Authentication + RBAC + .NET Tenant Authorization
**Master Architectural & Implementation Specification**

---

## 1. Project Objective & Multi-Tenant Hierarchy

BistroPOS is an enterprise multi-restaurant SaaS and Point-of-Sale platform.
The platform operates on a strict multi-tenant boundary with five core roles:

```
                  SUPER_ADMIN (Platform Owner)
                              │
               ┌──────────────┴──────────────┐
               ▼                             ▼
       Restaurant A (Royal Palace)   Restaurant B (City Restaurant)
               │                             │
       MANAGER (Rahul)               MANAGER (Amit)
        ├── RECEPTIONIST              ├── RECEPTIONIST
        ├── KITCHEN                   ├── KITCHEN
        └── WAITER                    └── WAITER
```

### Golden Multi-Tenant Security Rule
1. Every restaurant-owned record is isolated by `restaurant_id`.
2. `SUPER_ADMIN` is the only role with platform-wide visibility across all tenants.
3. `MANAGER`, `RECEPTIONIST`, `KITCHEN`, and `WAITER` are tenant-scoped and can access **only** the single restaurant assigned to their authenticated identity.
4. **Never trust `restaurantId` supplied in client request URLs, query parameters, or JSON payloads.** The backend must derive the tenant scope from trusted JWT claims and authorization context. Any cross-tenant attempt must immediately be rejected with `403 Forbidden`.

---

## 2. Supabase Authentication & Identity Architecture

Supabase Auth (GoTrue) is responsible for authentication identity management:
- Passwords and login credentials live under Supabase Auth (`auth.users`).
- Application profiles, roles, and tenant associations reside in `public.staff_profiles` (and `public.users` compatibility layer).
- The `anon` key is strictly restricted and never given access to administrative or tenant-scoped management data.
- The `service_role` key is strictly confidential to backend services and never exposed to the frontend React bundle.

```
┌──────────────────┐               ┌─────────────────┐               ┌───────────────────────┐
│  React Frontend  │ ── Login ──>  │  .NET 8 Web API │ ── GoTrue ──> │ Supabase Auth Engine  │
│  (Session Token) │ <── JWT ───── │  (Auth Service) │ <── Verified ─│ (auth.users Identity) │
└──────────────────┘               └─────────────────┘               └───────────────────────┘
```

---

## 3. JWT & Session Flow

When a user signs in, the .NET Web API verifies credentials against Supabase Auth (or application BCrypt for demo setups) and issues a signed, cryptographically secure JWT:

### Standard Claims Payload
```json
{
  "sub": "b0000000-0000-0000-0000-000000000001",
  "auth_user_id": "aaaaaaaa-1111-1111-1111-111111111111",
  "name": "Rahul Sharma",
  "email": "manager.rahul@royalpalace.com",
  "role": "MANAGER",
  "restaurant_id": "11111111-1111-1111-1111-111111111111",
  "status": "ACTIVE",
  "nbf": 1700000000,
  "exp": 1700086400,
  "iss": "BistroPOSAuthService",
  "aud": "BistroPOSClients"
}
```

### JWT Security Rules
- **Signing Key**: HMAC-SHA256 with a 256-bit secret key.
- **Clock Skew**: Set to `TimeSpan.Zero` to eliminate token reuse grace windows.
- **Lifetime**: 1,440 minutes (24 hours) for operational staff.
- **NULL Restaurant ID Rule**: `restaurant_id` claim is `NULL` only for `SUPER_ADMIN`. For all other staff roles, `restaurant_id` is mandatory.

---

## 4. `auth_user_id` → `staff_profiles` Mapping

```
Supabase Auth (auth.users)
   ├── id (UUID PK)
   ├── email (VARCHAR)
   └── encrypted_password
              │
              │ (auth_user_id 1:1)
              ▼
Application (public.staff_profiles)
   ├── user_id (UUID PK)
   ├── auth_user_id (UUID FK -> auth.users.id)
   ├── restaurant_id (UUID FK -> restaurants.restaurant_id)  [NULL for SUPER_ADMIN only]
   ├── name (VARCHAR)
   ├── phone (VARCHAR)
   ├── role (app_role ENUM)
   └── status (record_status ENUM: ACTIVE / DISABLED)
```

Constraint enforced at database level:
```sql
CONSTRAINT staff_restaurant_role_check CHECK (
  (role = 'SUPER_ADMIN' AND restaurant_id IS NULL)
  OR
  (role <> 'SUPER_ADMIN' AND restaurant_id IS NOT NULL)
);
```

---

## 5. Comprehensive RBAC Matrix

| Role | Scope | Key Capabilities | Prohibited Operations |
| :--- | :--- | :--- | :--- |
| **SUPER_ADMIN** | Platform-Wide | Create/manage restaurants, create Managers, configure system rules, global analytics, system audit logs | Daily kitchen/waiter operational tasks |
| **MANAGER** | Own Restaurant | Full dashboard, add/edit menu & prices, tables & QR layout, assign waiters, view reports, create staff | Cannot create SUPER_ADMIN or MANAGER, cannot delete restaurant, cannot access other restaurants |
| **RECEPTIONIST** | Own Restaurant | Floor status, active table sessions, reservations, POS orders, billing, payments, customer help | Cannot create staff, cannot edit menu prices, cannot access platform settings |
| **KITCHEN** | Own Restaurant | Kitchen Display System (KDS), ticket transitions (Accepted/Preparing/Ready), item availability | No billing, no financial reports, no staff management, no table management |
| **WAITER** | Assigned Tables | View assigned tables, ready-order alerts, mark orders delivered, customer assistance calls | No billing modification, no price changes, no staff creation |
| **CUSTOMER** | QR Dine-In / Public | Scan QR, browse menu, place dine-in/takeaway orders, call waiter, view order status | No staff portals, no cross-table order manipulation |

---

## 6. .NET 8 Authorization Policies

In `backend/Program.cs`, policies are registered with strict role mappings:

```csharp
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("SuperAdminOnly", policy => policy.RequireRole(UserRoles.SuperAdmin));
    options.AddPolicy("ManagerOnly", policy => policy.RequireRole(UserRoles.Manager));
    options.AddPolicy("ManagerOrAdmin", policy => policy.RequireRole(UserRoles.SuperAdmin, UserRoles.Manager));
    options.AddPolicy("ReceptionistOrManagerOrAdmin", policy => policy.RequireRole(UserRoles.SuperAdmin, UserRoles.Manager, UserRoles.Receptionist));
    options.AddPolicy("KitchenStaff", policy => policy.RequireRole(UserRoles.SuperAdmin, UserRoles.Manager, UserRoles.Kitchen));
    options.AddPolicy("WaiterStaff", policy => policy.RequireRole(UserRoles.SuperAdmin, UserRoles.Manager, UserRoles.Waiter));
    options.AddPolicy("OperationalStaff", policy => policy.RequireRole(UserRoles.SuperAdmin, UserRoles.Manager, UserRoles.Receptionist, UserRoles.Kitchen, UserRoles.Waiter));
    options.AddPolicy("StaffOnly", policy => policy.RequireRole(UserRoles.SuperAdmin, UserRoles.Manager, UserRoles.Receptionist, UserRoles.Kitchen, UserRoles.Waiter));
    options.AddPolicy("CustomerAccess", policy => policy.RequireRole(UserRoles.Customer, UserRoles.SuperAdmin));
});
```

---

## 7. Current User / Tenant Authorization Context (`ITenantContext`)

`ITenantContext` is a scoped service that reads claims directly from `IHttpContextAccessor.HttpContext.User`:

```csharp
public interface ITenantContext
{
    Guid? CurrentUserId { get; }
    Guid? AuthUserId { get; }
    string CurrentRole { get; }
    Guid? RestaurantId { get; }
    bool IsAuthenticated { get; }
    bool IsSuperAdmin { get; }
    bool IsManager { get; }
    bool IsStaff { get; }
    
    void EnforceTenantAccess(Guid? targetRestaurantId);
    Guid GetRequiredRestaurantId();
}
```

### Server Enforcement Rule
```csharp
public void EnforceTenantAccess(Guid? targetRestaurantId)
{
    if (IsSuperAdmin) return; // Platform owner bypasses single-tenant filter

    if (IsStaff)
    {
        if (!RestaurantId.HasValue)
            throw new TenantIsolationException("Staff user account is not associated with any restaurant.");

        if (targetRestaurantId.HasValue && targetRestaurantId.Value != RestaurantId.Value)
            throw new TenantIsolationException("Cross-restaurant access is strictly prohibited.");
    }
}
```

---

## 8. Manager → Staff Creation Rules

When a `MANAGER` provisions staff accounts via `POST /api/auth/staff`:
1. **Allowed Roles**: `RECEPTIONIST`, `KITCHEN`, `WAITER` only.
2. **Forbidden Roles**: If the requested role is `MANAGER` or `SUPER_ADMIN`, the backend immediately rejects the request (`400 Bad Request` / `403 Forbidden`).
3. **Automatic Tenant Inheritance**: The backend **discards** any `restaurantId` provided in the request payload and stamps `tenant.RestaurantId.Value` directly from the authenticated Manager's JWT claims.
4. **Promotion Lock**: A Manager cannot promote an existing staff account to Manager without Super Admin action.

---

## 9. Disabled User & Session Handling

1. **Token Claim Check**: Each issued JWT contains `"status": "ACTIVE"`.
2. **Middleware Interception**: In `TenantSecurityMiddleware`, if `status == "DISABLED"`, the request is immediately terminated with `401 Unauthorized`.
3. **Database Guard**: On login, if `user.Status == "DISABLED"`, login is rejected with `"This account has been disabled by management."`
4. **Deactivation Capability**: Managers can deactivate staff within their own restaurant using `PATCH /api/auth/staff/{id}/status`. Managers cannot deactivate other Managers or Super Admins.

---

## 10. Supabase RLS + .NET Defense-in-Depth

| Security Concern | Layer 1: .NET 8 Web API | Layer 2: PostgreSQL / Supabase RLS |
| :--- | :--- | :--- |
| **Authentication** | Validates JWT signature, claims, expiry, issuer | Validates `auth.uid()` and session claims |
| **Tenant Isolation** | `TenantSecurityMiddleware` & `ITenantContext` | Direct table policies comparing `restaurant_id` |
| **Role Permissions** | `[Authorize(Policy = "...")]` attributes | `private.has_any_staff_role(...)` functions |
| **Object Authorization**| `ResourceAccessFilter` entity checks | Row-level `USING` and `WITH CHECK` clauses |
| **Audit Logging** | Centralized `IAuditLogService` | DB triggers on sensitive audit tables |

---

## 11. Security Error Code Standard (401 vs 403 vs 404)

- **401 Unauthorized**: No token supplied, expired token, signature invalid, or account marked `DISABLED`.
- **403 Forbidden**: Valid authentication, but user lacks required role OR attempted cross-restaurant data access (`TenantIsolationException`).
- **404 Not Found**: Resource does not exist, or cross-tenant query where revealing existence would leak data.

---

## 12. Object-Level Authorization (`ResourceAccessFilter`)

`ResourceAccessFilter` executes on every controller action:
- Extracts target entity `id` from route data.
- Looks up target entity's `restaurant_id` in database.
- Verifies `entityTenant == claimTenantId`. If mismatch and caller is not `SUPER_ADMIN`, returns `403 Forbidden`.
- Inspects customer capabilities for guest order tokens (`X-Resource-Token` or query param `accessToken`).

---

## 13. Append-Only Audit Logging

All sensitive administrative and operational activities write to `public.audit_logs`:
- Staff creation & deactivation.
- Manager creation.
- Price changes on menu items.
- Order cancellations & refunds.
- Login and privilege escalation attempts.

The table has no `UPDATE` or `DELETE` RLS policies for authenticated roles, making it append-only.

---

## 14. Cross-Restaurant Attack Vectors & Mitigations

| Attack Vector | Attacker Action | System Defense |
| :--- | :--- | :--- |
| **Parameter Tampering** | Manager Rahul adds `?restaurantId=CityRestaurant` to URL | `TenantSecurityMiddleware` catches mismatch and returns `403 Forbidden` |
| **Header Injection** | Attacker sets `X-Restaurant-Id: 22222222-...` | Middleware verifies against JWT claim `restaurant_id` and blocks request |
| **Payload Spoofing** | Manager sends `{ restaurantId: "other" }` in POST body | `AuthService` overrides field with server-derived `tenant.RestaurantId` |
| **Privilege Escalation**| Manager sends `{ role: "SUPER_ADMIN" }` | Role validator restricts Manager to operational roles only |
| **Foreign Key Hijacking**| Restaurant A attempts to link table from Restaurant B | DB composite foreign key `fk_..._same_restaurant` rejects insert |

---

## 15. Frontend Route Guards & Session Sync

In the React frontend (`App.jsx`):
- `RoleRoute`: Protects `/pos`, `/kitchen`, `/waiter`, `/receptionist`.
- If role does not match `allowedRoles`, user is shown an **Access Restricted** card with their current role and redirected to their role portal.
- On `401 Unauthorized`, session is cleared from `sessionStorage` and `rs_session_expired` event triggers redirect to `/pos/login`.

---

## 16. Two-Restaurant Security Validation Matrix

Tested via `tests/tenant-isolation-test.sql` and `tests/integration/phase2-tenant-auth.mjs`:

```
Test Scenario:
Restaurant A: Royal Palace (Manager: Rahul)
Restaurant B: City Restaurant (Manager: Amit)

[PASS] Rahul reads Royal Palace menu items (Found 1 item)
[PASS] Rahul queries City Restaurant menu items (0 rows returned)
[PASS] Rahul updates City Restaurant table (0 rows affected)
[PASS] Rahul attempts creating staff for City Restaurant (Rejected by RLS)
[PASS] Rahul attempts creating a MANAGER (Rejected: privilege escalation blocked)
[PASS] Super Admin reads all restaurants (Found 2 restaurants)
[PASS] Amit queries Royal Palace items (0 rows returned)
```

---

## 17. AI Coding Agent Mandatory Rules

1. **Do not trust client `restaurantId`** for any non-SuperAdmin user.
2. **Always derive tenant scope from server context** (`ITenantContext`).
3. **Manager-created staff must inherit the Manager's `restaurant_id` server-side.**
4. **Never allow Manager to create SUPER_ADMIN or MANAGER.**
5. **Disabled staff must not be permitted to authenticate or call protected endpoints.**
6. **Preserve backward compatibility** with existing operational flows.
7. **Keep business authorization in .NET 8** with Supabase RLS as Layer 2.

---

## 18. Phase 2 Completion Checklist

- [x] `UserRoles.Manager` added to role definitions.
- [x] `StaffProfile`, `TableSession`, `TableAssignment`, `RestaurantSettingsEntity` domain models mapped in EF Core.
- [x] `ITenantContext` and `TenantContext` implemented and registered in DI.
- [x] JWT token generation includes `restaurant_id`, `role`, `status`, and `auth_user_id`.
- [x] .NET Authorization policies registered for all role combinations.
- [x] Staff management endpoints (`/api/auth/staff`, `/api/auth/managers`) implemented with role/tenant validation.
- [x] `TenantSecurityMiddleware` detects and blocks cross-tenant query params and headers.
- [x] `ResourceAccessFilter` enforces object-level tenant isolation.
- [x] Disabled user status check blocks login and invalidates sessions.
- [x] Frontend `api.js` updated to include `MANAGER` in `isStaff` and staff management APIs.
- [x] Frontend `AuthContext` and `App.jsx` updated with Manager routes and portal redirection.
- [x] Two-restaurant test seed and tenant-isolation test suites created and verified.
- [x] Backend and Frontend builds pass cleanly with 0 errors.
