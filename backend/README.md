# Bistro & Bloom API

This is the .NET 8 REST backend shared by the restaurant website and Electron POS.
All operational data is stored in PostgreSQL's isolated `restaurant_pos` schema.
The existing `public` schema is never replaced.

## Run locally

Start your local Supabase Docker stack, then initialize the schema once:

```sh
docker exec -i supabase-db psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -1 < backend/scripts/initialize.sql
dotnet run --project backend/RestaurantSystem.Api.csproj
```

The API listens on `http://127.0.0.1:5050`. `GET /api/health` verifies database
connectivity. Swagger is available at `/swagger` in Development. The checked-in
connection values are local Supabase demonstration defaults. For another database,
set `ConnectionStrings__DefaultConnection` in your environment. This local
Supavisor connection requires `Username=postgres.your-tenant-id`.

`Properties/launchSettings.json` sets Development for local runs. Never deploy
using a Development environment. Production hosting should set the listening URL
and use HTTPS through its reverse proxy.

## Authentication

Normal account registration and login use Supabase Authentication through the API.
Set `Supabase__Url` and `Supabase__AnonKey`. Registration always creates a CUSTOMER;
email verification follows the Supabase provider settings. Existing staff accounts
must be provisioned by an administrator and their user IDs linked to Supabase Auth.
The API exchanges verified sign-in for a signed application JWT whose roles come
from the server-side profile, rather than user-supplied metadata.

Development permits `POST /api/auth/demo-login` with `role` set to RECEPTIONIST,
KITCHEN, WAITER, CUSTOMER, or SUPER_ADMIN. Supplied seed accounts also accept
`Password@123` in Development only. This bypass is disabled in Production.

Configure a strong unique `Jwt__SecretKey`, issuer, audience, and expiry in
production. Existing seed accounts are demonstration data, not real staff.

## Resource access

Staff lists and mutations require a bearer JWT and enforce restaurant isolation.
A guest-created order or help request returns an opaque `accessToken` scoped to
that resource. Send it as `?accessToken=...` or `X-Resource-Token` for reads and
customer actions. Guest resources cannot be listed by strangers. Public table
responses omit names, waiter identity, and QR identifiers. Sensitive tables have
RLS policies for direct Supabase access; the API separately checks authorization
because a PostgreSQL service account can bypass RLS.

## Core rules

- Prices, add-ons, and paid customization choices are resolved from the database.
- Order creation and payment requests support idempotency keys.
- Customer cancellation is restricted to NEW, unpaid orders within 60 seconds.
- Kitchen and waiter mutations have separate role and state restrictions.
- Reservations check opening hours, party size, 90-minute overlaps, and table
  capacity. Allocation, rescheduling, and waiter assignment take PostgreSQL locks.
- A background worker expires unconfirmed deliveries and overdue bookings.
- Guest payment initiation creates PENDING cash payment records. Staff-only
  `POST /api/payments/record` records an actual collected CASH/UPI/CARD payment,
  validates the balance, and prevents duplicate collection. Online card processing,
  refunds, and provider webhooks are unavailable until a real gateway is integrated;
  client success flags and mock signatures never mark a payment PAID.

## Operational limitations

This is a working local application. Public internet deployment still needs a
hosted PostgreSQL/Supabase project, verified staff provisioning, rotated secrets,
HTTPS, backup monitoring, and a real online payment provider if online payment is
wanted. Email delivery/reset depends on Supabase configuration. The browser and
Electron client poll scoped endpoints for live state; same-device tabs also receive
BroadcastChannel notifications. SignalR staff groups remain server scoped.
