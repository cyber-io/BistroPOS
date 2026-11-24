-- ============================================================
-- BistroPOS Phase 1
-- Supabase / PostgreSQL Multi-Restaurant Database
-- RBAC + Tenant Isolation + RLS Foundation
-- ============================================================

begin;

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. ENUMS
-- ------------------------------------------------------------

do $$ begin
  create type public.app_role as enum (
    'SUPER_ADMIN',
    'MANAGER',
    'RECEPTIONIST',
    'KITCHEN',
    'WAITER'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.record_status as enum ('ACTIVE', 'INACTIVE');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.table_status as enum (
    'AVAILABLE',
    'RESERVED',
    'OCCUPIED',
    'WAITING_FOR_CLEANING',
    'CLEANING',
    'OUT_OF_SERVICE'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.table_session_status as enum ('OPEN', 'CLOSED');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.assignment_status as enum ('ACTIVE', 'ENDED');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.order_source as enum (
    'DINE_IN_QR',
    'RECEPTION',
    'TAKEAWAY',
    'DELIVERY'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.order_status as enum (
    'NEW',
    'ACCEPTED',
    'PREPARING',
    'READY',
    'PENDING_CONFIRMATION',
    'DELIVERED',
    'CANCELLED',
    'PICKED_UP',
    'OUT_FOR_DELIVERY'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.reservation_status as enum (
    'PENDING',
    'CONFIRMED',
    'ARRIVED',
    'SEATED',
    'COMPLETED',
    'CANCELLED',
    'NO_SHOW',
    'RESCHEDULED'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.payment_status as enum (
    'PENDING',
    'SUCCESS',
    'FAILED',
    'REFUNDED',
    'CANCELLED'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.payment_method as enum (
    'CASH',
    'CARD',
    'UPI',
    'ONLINE',
    'OTHER'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.help_request_status as enum (
    'PENDING',
    'ASSIGNED',
    'RESOLVED',
    'CANCELLED'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.issue_status as enum (
    'OPEN',
    'IN_PROGRESS',
    'RESOLVED',
    'CLOSED',
    'CANCELLED'
  );
exception when duplicate_object then null;
end $$;

-- ------------------------------------------------------------
-- 2. COMMON UPDATED_AT TRIGGER
-- ------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 3. RESTAURANTS / TENANTS
-- ------------------------------------------------------------

create table if not exists public.restaurants (
  restaurant_id uuid primary key default gen_random_uuid(),
  name varchar(150) not null,
  slug varchar(150) not null unique,
  logo text,
  address text,
  phone varchar(30),
  email varchar(255),
  opening_hours jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  status public.record_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_restaurants_status
  on public.restaurants(status)
  where deleted_at is null;

-- ------------------------------------------------------------
-- 4. STAFF PROFILES
-- Supabase Auth owns passwords/credentials.
-- restaurant_id is NULL only for SUPER_ADMIN.
-- ------------------------------------------------------------

create table if not exists public.staff_profiles (
  user_id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  restaurant_id uuid references public.restaurants(restaurant_id) on delete restrict,
  name varchar(150) not null,
  phone varchar(30),
  role public.app_role not null,
  status public.record_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint staff_restaurant_role_check check (
    (role = 'SUPER_ADMIN' and restaurant_id is null)
    or
    (role <> 'SUPER_ADMIN' and restaurant_id is not null)
  )
);

create index if not exists idx_staff_restaurant
  on public.staff_profiles(restaurant_id);

create index if not exists idx_staff_auth_user
  on public.staff_profiles(auth_user_id);

create index if not exists idx_staff_role
  on public.staff_profiles(role);

-- ------------------------------------------------------------
-- 5. CUSTOMERS
-- Restaurant-scoped customer profile.
-- ------------------------------------------------------------

create table if not exists public.customers (
  customer_id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(restaurant_id) on delete restrict,
  name varchar(150),
  phone varchar(30),
  email varchar(255),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_customers_restaurant
  on public.customers(restaurant_id);

create index if not exists idx_customers_phone
  on public.customers(restaurant_id, phone);

-- ------------------------------------------------------------
-- 6. MENU CATEGORIES
-- ------------------------------------------------------------

create table if not exists public.menu_categories (
  category_id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(restaurant_id) on delete restrict,
  name varchar(150) not null,
  description text,
  sort_order integer not null default 0,
  status public.record_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists uq_menu_categories_restaurant_name
  on public.menu_categories(restaurant_id, lower(name))
  where deleted_at is null;

create index if not exists idx_menu_categories_restaurant
  on public.menu_categories(restaurant_id);

-- ------------------------------------------------------------
-- 7. MENU ITEMS
-- restaurant_id is intentionally direct on this table.
-- ------------------------------------------------------------

create table if not exists public.menu_items (
  menu_item_id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(restaurant_id) on delete restrict,
  category_id uuid not null references public.menu_categories(category_id) on delete restrict,
  name varchar(200) not null,
  description text,
  price numeric(12,2) not null check (price >= 0),
  image_url text,
  veg_non_veg varchar(20),
  availability boolean not null default true,
  spice_level varchar(30),
  is_sweet boolean not null default false,
  add_ons jsonb not null default '[]'::jsonb,
  customization_options jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_menu_items_restaurant
  on public.menu_items(restaurant_id);

create index if not exists idx_menu_items_category
  on public.menu_items(category_id);

create unique index if not exists uq_menu_items_restaurant_category_name
  on public.menu_items(restaurant_id, category_id, lower(name))
  where deleted_at is null;

-- ------------------------------------------------------------
-- 8. DINING TABLES
-- ------------------------------------------------------------

create table if not exists public.dining_tables (
  table_id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(restaurant_id) on delete restrict,
  table_number integer not null check (table_number > 0),
  capacity integer not null default 2 check (capacity > 0),
  status public.table_status not null default 'AVAILABLE',
  qr_identifier varchar(255) not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists uq_dining_tables_restaurant_number
  on public.dining_tables(restaurant_id, table_number)
  where deleted_at is null;

create index if not exists idx_dining_tables_restaurant
  on public.dining_tables(restaurant_id);

-- ------------------------------------------------------------
-- 9. TABLE SESSIONS
-- ------------------------------------------------------------

create table if not exists public.table_sessions (
  session_id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(restaurant_id) on delete restrict,
  table_id uuid not null references public.dining_tables(table_id) on delete restrict,
  opened_by uuid references public.staff_profiles(user_id) on delete set null,
  customer_id uuid references public.customers(customer_id) on delete set null,
  customer_name varchar(150),
  guest_count integer not null default 1 check (guest_count > 0),
  status public.table_session_status not null default 'OPEN',
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint session_closed_time_check check (
    (status = 'OPEN' and closed_at is null)
    or
    (status = 'CLOSED')
  )
);

create index if not exists idx_table_sessions_restaurant
  on public.table_sessions(restaurant_id);

create index if not exists idx_table_sessions_table
  on public.table_sessions(table_id);

create unique index if not exists uq_one_open_session_per_table
  on public.table_sessions(table_id)
  where status = 'OPEN' and deleted_at is null;

-- ------------------------------------------------------------
-- 10. TABLE ASSIGNMENTS
-- ------------------------------------------------------------

create table if not exists public.table_assignments (
  assignment_id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(restaurant_id) on delete restrict,
  table_id uuid not null references public.dining_tables(table_id) on delete restrict,
  waiter_id uuid not null references public.staff_profiles(user_id) on delete restrict,
  assigned_by uuid references public.staff_profiles(user_id) on delete set null,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz,
  status public.assignment_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_table_assignments_restaurant
  on public.table_assignments(restaurant_id);

create index if not exists idx_table_assignments_waiter
  on public.table_assignments(waiter_id);

create unique index if not exists uq_one_active_waiter_assignment
  on public.table_assignments(table_id)
  where status = 'ACTIVE' and deleted_at is null;

-- ------------------------------------------------------------
-- 11. RESERVATIONS
-- ------------------------------------------------------------

create table if not exists public.reservations (
  reservation_id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(restaurant_id) on delete restrict,
  booking_id varchar(100),
  table_id uuid references public.dining_tables(table_id) on delete set null,
  customer_id uuid references public.customers(customer_id) on delete set null,
  customer_name varchar(150) not null,
  customer_phone varchar(30),
  customer_email varchar(255),
  reservation_date date not null,
  reservation_time time not null,
  guest_count integer not null check (guest_count > 0),
  status public.reservation_status not null default 'PENDING',
  grace_period_minutes integer not null default 15 check (grace_period_minutes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_reservations_restaurant_date
  on public.reservations(restaurant_id, reservation_date);

create index if not exists idx_reservations_table
  on public.reservations(table_id);

-- ------------------------------------------------------------
-- 12. ORDERS
-- ------------------------------------------------------------

create table if not exists public.orders (
  order_id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(restaurant_id) on delete restrict,
  session_id uuid references public.table_sessions(session_id) on delete set null,
  order_number varchar(100) not null,
  customer_id uuid references public.customers(customer_id) on delete set null,
  table_id uuid references public.dining_tables(table_id) on delete set null,
  source public.order_source not null,
  status public.order_status not null default 'NEW',
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  tax numeric(12,2) not null default 0 check (tax >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  customer_name varchar(150),
  customer_phone varchar(30),
  delivery_address text,
  special_instructions text,
  cancellation_reason text,
  cancelled_by uuid references public.staff_profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint uq_orders_restaurant_order_number unique (restaurant_id, order_number)
);

create index if not exists idx_orders_restaurant
  on public.orders(restaurant_id);

create index if not exists idx_orders_restaurant_status
  on public.orders(restaurant_id, status);

create index if not exists idx_orders_session
  on public.orders(session_id);

create index if not exists idx_orders_table
  on public.orders(table_id);

-- ------------------------------------------------------------
-- 13. ORDER ITEMS
-- Historical snapshots are mandatory.
-- ------------------------------------------------------------

create table if not exists public.order_items (
  order_item_id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(restaurant_id) on delete restrict,
  order_id uuid not null references public.orders(order_id) on delete restrict,
  menu_item_id uuid references public.menu_items(menu_item_id) on delete set null,
  item_name_snapshot varchar(200) not null,
  price_snapshot numeric(12,2) not null check (price_snapshot >= 0),
  quantity integer not null check (quantity > 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  customization jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_order_items_restaurant
  on public.order_items(restaurant_id);

create index if not exists idx_order_items_order
  on public.order_items(order_id);

-- ------------------------------------------------------------
-- 14. PAYMENTS
-- A payment belongs to an order OR reservation.
-- ------------------------------------------------------------

create table if not exists public.payments (
  payment_id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(restaurant_id) on delete restrict,
  order_id uuid references public.orders(order_id) on delete restrict,
  reservation_id uuid references public.reservations(reservation_id) on delete restrict,
  amount numeric(12,2) not null check (amount >= 0),
  currency varchar(10) not null default 'INR',
  method public.payment_method not null,
  status public.payment_status not null default 'PENDING',
  transaction_id varchar(255),
  gateway_reference varchar(255),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint payment_exactly_one_parent check (
    (order_id is not null and reservation_id is null)
    or
    (order_id is null and reservation_id is not null)
  )
);

create index if not exists idx_payments_restaurant
  on public.payments(restaurant_id);

create index if not exists idx_payments_order
  on public.payments(order_id);

create index if not exists idx_payments_reservation
  on public.payments(reservation_id);

-- ------------------------------------------------------------
-- 15. HELP REQUESTS
-- ------------------------------------------------------------

create table if not exists public.help_requests (
  request_id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(restaurant_id) on delete restrict,
  table_id uuid references public.dining_tables(table_id) on delete set null,
  session_id uuid references public.table_sessions(session_id) on delete set null,
  message text not null,
  status public.help_request_status not null default 'PENDING',
  assigned_staff_id uuid references public.staff_profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  deleted_at timestamptz
);

create index if not exists idx_help_requests_restaurant_status
  on public.help_requests(restaurant_id, status);

-- ------------------------------------------------------------
-- 16. CUSTOMER ISSUES
-- ------------------------------------------------------------

create table if not exists public.customer_issues (
  issue_id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(restaurant_id) on delete restrict,
  order_id uuid references public.orders(order_id) on delete set null,
  description text not null,
  status public.issue_status not null default 'OPEN',
  resolution text,
  assigned_staff_id uuid references public.staff_profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  deleted_at timestamptz
);

create index if not exists idx_customer_issues_restaurant_status
  on public.customer_issues(restaurant_id, status);

-- ------------------------------------------------------------
-- 17. RESTAURANT SETTINGS
-- ------------------------------------------------------------

create table if not exists public.restaurant_settings (
  setting_id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null unique references public.restaurants(restaurant_id) on delete cascade,
  tax_percentage numeric(5,2) not null default 0 check (tax_percentage >= 0),
  currency varchar(10) not null default 'INR',
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  packaging_fee numeric(12,2) not null default 0 check (packaging_fee >= 0),
  discount_limit numeric(5,2) not null default 25 check (discount_limit >= 0),
  timezone varchar(100) not null default 'Asia/Kolkata',
  reservation_grace_minutes integer not null default 15 check (reservation_grace_minutes >= 0),
  receipt_settings jsonb not null default '{}'::jsonb,
  notification_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 18. AUDIT LOGS
-- Append-only from application roles.
-- ------------------------------------------------------------

create table if not exists public.audit_logs (
  log_id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurants(restaurant_id) on delete set null,
  user_id uuid references public.staff_profiles(user_id) on delete set null,
  user_role public.app_role,
  action varchar(100) not null,
  resource varchar(100) not null,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_restaurant_created
  on public.audit_logs(restaurant_id, created_at desc);

create index if not exists idx_audit_logs_user_created
  on public.audit_logs(user_id, created_at desc);

-- ------------------------------------------------------------
-- 19. TENANT-CONSISTENCY CONSTRAINTS
-- Prevents a row in Restaurant A from referencing a parent row
-- belonging to Restaurant B.
-- ------------------------------------------------------------

alter table public.staff_profiles
  add constraint uq_staff_restaurant_user unique (restaurant_id, user_id);

alter table public.menu_categories
  add constraint uq_category_restaurant_id unique (restaurant_id, category_id);

alter table public.menu_items
  add constraint uq_menu_item_restaurant_id unique (restaurant_id, menu_item_id);

alter table public.dining_tables
  add constraint uq_table_restaurant_id unique (restaurant_id, table_id);

alter table public.table_sessions
  add constraint uq_session_restaurant_id unique (restaurant_id, session_id);

alter table public.reservations
  add constraint uq_reservation_restaurant_id unique (restaurant_id, reservation_id);

alter table public.orders
  add constraint uq_order_restaurant_id unique (restaurant_id, order_id);

alter table public.customers
  add constraint uq_customer_restaurant_id unique (restaurant_id, customer_id);

alter table public.menu_items
  add constraint fk_menu_item_category_same_restaurant
  foreign key (restaurant_id, category_id)
  references public.menu_categories (restaurant_id, category_id);

alter table public.table_sessions
  add constraint fk_session_table_same_restaurant
  foreign key (restaurant_id, table_id)
  references public.dining_tables (restaurant_id, table_id);

alter table public.table_sessions
  add constraint fk_session_customer_same_restaurant
  foreign key (restaurant_id, customer_id)
  references public.customers (restaurant_id, customer_id);

alter table public.table_sessions
  add constraint fk_session_opened_by_same_restaurant
  foreign key (restaurant_id, opened_by)
  references public.staff_profiles (restaurant_id, user_id);

alter table public.table_assignments
  add constraint fk_assignment_table_same_restaurant
  foreign key (restaurant_id, table_id)
  references public.dining_tables (restaurant_id, table_id);

alter table public.table_assignments
  add constraint fk_assignment_waiter_same_restaurant
  foreign key (restaurant_id, waiter_id)
  references public.staff_profiles (restaurant_id, user_id);

alter table public.table_assignments
  add constraint fk_assignment_by_same_restaurant
  foreign key (restaurant_id, assigned_by)
  references public.staff_profiles (restaurant_id, user_id);

alter table public.reservations
  add constraint fk_reservation_table_same_restaurant
  foreign key (restaurant_id, table_id)
  references public.dining_tables (restaurant_id, table_id);

alter table public.reservations
  add constraint fk_reservation_customer_same_restaurant
  foreign key (restaurant_id, customer_id)
  references public.customers (restaurant_id, customer_id);

alter table public.orders
  add constraint fk_order_session_same_restaurant
  foreign key (restaurant_id, session_id)
  references public.table_sessions (restaurant_id, session_id);

alter table public.orders
  add constraint fk_order_customer_same_restaurant
  foreign key (restaurant_id, customer_id)
  references public.customers (restaurant_id, customer_id);

alter table public.orders
  add constraint fk_order_table_same_restaurant
  foreign key (restaurant_id, table_id)
  references public.dining_tables (restaurant_id, table_id);

alter table public.orders
  add constraint fk_order_cancelled_by_same_restaurant
  foreign key (restaurant_id, cancelled_by)
  references public.staff_profiles (restaurant_id, user_id);

alter table public.order_items
  add constraint fk_order_item_order_same_restaurant
  foreign key (restaurant_id, order_id)
  references public.orders (restaurant_id, order_id);

alter table public.order_items
  add constraint fk_order_item_menu_same_restaurant
  foreign key (restaurant_id, menu_item_id)
  references public.menu_items (restaurant_id, menu_item_id);

alter table public.payments
  add constraint fk_payment_order_same_restaurant
  foreign key (restaurant_id, order_id)
  references public.orders (restaurant_id, order_id);

alter table public.payments
  add constraint fk_payment_reservation_same_restaurant
  foreign key (restaurant_id, reservation_id)
  references public.reservations (restaurant_id, reservation_id);

alter table public.help_requests
  add constraint fk_help_table_same_restaurant
  foreign key (restaurant_id, table_id)
  references public.dining_tables (restaurant_id, table_id);

alter table public.help_requests
  add constraint fk_help_session_same_restaurant
  foreign key (restaurant_id, session_id)
  references public.table_sessions (restaurant_id, session_id);

alter table public.help_requests
  add constraint fk_help_staff_same_restaurant
  foreign key (restaurant_id, assigned_staff_id)
  references public.staff_profiles (restaurant_id, user_id);

alter table public.customer_issues
  add constraint fk_issue_order_same_restaurant
  foreign key (restaurant_id, order_id)
  references public.orders (restaurant_id, order_id);

alter table public.customer_issues
  add constraint fk_issue_staff_same_restaurant
  foreign key (restaurant_id, assigned_staff_id)
  references public.staff_profiles (restaurant_id, user_id);

-- ------------------------------------------------------------
-- 19A. UPDATED_AT TRIGGERS
-- ------------------------------------------------------------

drop trigger if exists trg_restaurants_updated_at on public.restaurants;
create trigger trg_restaurants_updated_at
before update on public.restaurants
for each row execute function public.set_updated_at();

drop trigger if exists trg_staff_profiles_updated_at on public.staff_profiles;
create trigger trg_staff_profiles_updated_at
before update on public.staff_profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_customers_updated_at on public.customers;
create trigger trg_customers_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

drop trigger if exists trg_menu_categories_updated_at on public.menu_categories;
create trigger trg_menu_categories_updated_at
before update on public.menu_categories
for each row execute function public.set_updated_at();

drop trigger if exists trg_menu_items_updated_at on public.menu_items;
create trigger trg_menu_items_updated_at
before update on public.menu_items
for each row execute function public.set_updated_at();

drop trigger if exists trg_dining_tables_updated_at on public.dining_tables;
create trigger trg_dining_tables_updated_at
before update on public.dining_tables
for each row execute function public.set_updated_at();

drop trigger if exists trg_table_sessions_updated_at on public.table_sessions;
create trigger trg_table_sessions_updated_at
before update on public.table_sessions
for each row execute function public.set_updated_at();

drop trigger if exists trg_table_assignments_updated_at on public.table_assignments;
create trigger trg_table_assignments_updated_at
before update on public.table_assignments
for each row execute function public.set_updated_at();

drop trigger if exists trg_reservations_updated_at on public.reservations;
create trigger trg_reservations_updated_at
before update on public.reservations
for each row execute function public.set_updated_at();

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

drop trigger if exists trg_order_items_updated_at on public.order_items;
create trigger trg_order_items_updated_at
before update on public.order_items
for each row execute function public.set_updated_at();

drop trigger if exists trg_payments_updated_at on public.payments;
create trigger trg_payments_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

drop trigger if exists trg_help_requests_updated_at on public.help_requests;
create trigger trg_help_requests_updated_at
before update on public.help_requests
for each row execute function public.set_updated_at();

drop trigger if exists trg_customer_issues_updated_at on public.customer_issues;
create trigger trg_customer_issues_updated_at
before update on public.customer_issues
for each row execute function public.set_updated_at();

drop trigger if exists trg_restaurant_settings_updated_at on public.restaurant_settings;
create trigger trg_restaurant_settings_updated_at
before update on public.restaurant_settings
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 20. SECURITY HELPER FUNCTIONS
-- Keep SECURITY DEFINER helpers in a non-exposed schema.
-- ------------------------------------------------------------

create schema if not exists private;

create or replace function private.current_staff_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select sp.role
  from public.staff_profiles sp
  where sp.auth_user_id = (select auth.uid())
    and sp.status = 'ACTIVE'
    and sp.deleted_at is null
  limit 1;
$$;

create or replace function private.current_staff_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select sp.user_id
  from public.staff_profiles sp
  where sp.auth_user_id = (select auth.uid())
    and sp.status = 'ACTIVE'
    and sp.deleted_at is null
  limit 1;
$$;

create or replace function private.current_restaurant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select sp.restaurant_id
  from public.staff_profiles sp
  where sp.auth_user_id = (select auth.uid())
    and sp.status = 'ACTIVE'
    and sp.deleted_at is null
  limit 1;
$$;

create or replace function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select private.current_staff_role()) = 'SUPER_ADMIN',
    false
  );
$$;

create or replace function private.is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select private.current_staff_role()) = 'MANAGER',
    false
  );
$$;

create or replace function private.has_any_staff_role(
  allowed_roles public.app_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select private.current_staff_role()) = any(allowed_roles),
    false
  );
$$;

revoke all on function private.current_staff_role() from public;
revoke all on function private.current_staff_id() from public;
revoke all on function private.current_restaurant_id() from public;
revoke all on function private.is_super_admin() from public;
revoke all on function private.is_manager() from public;
revoke all on function private.has_any_staff_role(public.app_role[]) from public;

grant usage on schema private to authenticated;

grant execute on function private.current_staff_role() to authenticated;
grant execute on function private.current_staff_id() to authenticated;
grant execute on function private.current_restaurant_id() to authenticated;
grant execute on function private.is_super_admin() to authenticated;
grant execute on function private.is_manager() to authenticated;
grant execute on function private.has_any_staff_role(public.app_role[]) to authenticated;

-- ------------------------------------------------------------
-- 20A. STAFF IDENTITY PROTECTION
-- ------------------------------------------------------------

create or replace function public.protect_staff_identity_fields()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.user_id <> new.user_id
     or old.auth_user_id <> new.auth_user_id
     or old.restaurant_id is distinct from new.restaurant_id
     or old.role <> new.role then
    if coalesce(private.is_super_admin(), false) = false then
      raise exception 'Only SUPER_ADMIN can change staff identity, tenant, or role fields';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_staff_identity on public.staff_profiles;
create trigger trg_protect_staff_identity
before update on public.staff_profiles
for each row execute function public.protect_staff_identity_fields();

-- ------------------------------------------------------------
-- 21. ENABLE RLS
-- ------------------------------------------------------------

alter table public.restaurants enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.customers enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.dining_tables enable row level security;
alter table public.table_sessions enable row level security;
alter table public.table_assignments enable row level security;
alter table public.reservations enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.help_requests enable row level security;
alter table public.customer_issues enable row level security;
alter table public.restaurant_settings enable row level security;
alter table public.audit_logs enable row level security;

-- ------------------------------------------------------------
-- 21A. DATA API GRANTS
-- ------------------------------------------------------------

revoke all on table
  public.restaurants,
  public.staff_profiles,
  public.customers,
  public.menu_categories,
  public.menu_items,
  public.dining_tables,
  public.table_sessions,
  public.table_assignments,
  public.reservations,
  public.orders,
  public.order_items,
  public.payments,
  public.help_requests,
  public.customer_issues,
  public.restaurant_settings,
  public.audit_logs
from anon;

grant select, insert, update, delete on table
  public.restaurants,
  public.staff_profiles,
  public.customers,
  public.menu_categories,
  public.menu_items,
  public.dining_tables,
  public.table_sessions,
  public.table_assignments,
  public.reservations,
  public.orders,
  public.order_items,
  public.payments,
  public.help_requests,
  public.customer_issues,
  public.restaurant_settings,
  public.audit_logs
to authenticated;

revoke insert, update, delete on table public.staff_profiles from authenticated;
grant select on table public.staff_profiles to authenticated;

-- ------------------------------------------------------------
-- 22. RESTAURANTS RLS
-- ------------------------------------------------------------

drop policy if exists restaurants_select on public.restaurants;
create policy restaurants_select
on public.restaurants
for select
to authenticated
using (
  (select private.is_super_admin())
  or restaurant_id = (select private.current_restaurant_id())
);

drop policy if exists restaurants_insert on public.restaurants;
create policy restaurants_insert
on public.restaurants
for insert
to authenticated
with check ((select private.is_super_admin()));

drop policy if exists restaurants_update on public.restaurants;
create policy restaurants_update
on public.restaurants
for update
to authenticated
using ((select private.is_super_admin()))
with check ((select private.is_super_admin()));

drop policy if exists restaurants_delete on public.restaurants;
create policy restaurants_delete
on public.restaurants
for delete
to authenticated
using ((select private.is_super_admin()));

-- ------------------------------------------------------------
-- 23. STAFF PROFILES RLS
-- ------------------------------------------------------------

drop policy if exists staff_select on public.staff_profiles;
create policy staff_select
on public.staff_profiles
for select
to authenticated
using (
  (select private.is_super_admin())
  or restaurant_id = (select private.current_restaurant_id())
);

drop policy if exists staff_insert on public.staff_profiles;
create policy staff_insert
on public.staff_profiles
for insert
to authenticated
with check (
  (select private.is_super_admin())
  or (
    (select private.is_manager())
    and restaurant_id = (select private.current_restaurant_id())
    and role in ('RECEPTIONIST', 'KITCHEN', 'WAITER')
  )
);

drop policy if exists staff_update on public.staff_profiles;
create policy staff_update
on public.staff_profiles
for update
to authenticated
using (
  (select private.is_super_admin())
  or (
    (select private.is_manager())
    and restaurant_id = (select private.current_restaurant_id())
    and role in ('RECEPTIONIST', 'KITCHEN', 'WAITER')
  )
)
with check (
  (select private.is_super_admin())
  or (
    (select private.is_manager())
    and restaurant_id = (select private.current_restaurant_id())
    and role in ('RECEPTIONIST', 'KITCHEN', 'WAITER')
  )
);

drop policy if exists staff_delete on public.staff_profiles;
create policy staff_delete
on public.staff_profiles
for delete
to authenticated
using ((select private.is_super_admin()));

-- ------------------------------------------------------------
-- 24. CUSTOMERS RLS
-- ------------------------------------------------------------

drop policy if exists customers_select on public.customers;
create policy customers_select
on public.customers
for select to authenticated
using (
  (select private.is_super_admin())
  or restaurant_id = (select private.current_restaurant_id())
);

drop policy if exists customers_insert on public.customers;
create policy customers_insert
on public.customers
for insert to authenticated
with check (
  (select private.is_super_admin())
  or (
    restaurant_id = (select private.current_restaurant_id())
    and (select private.has_any_staff_role(array['MANAGER','RECEPTIONIST','WAITER']::public.app_role[]))
  )
);

drop policy if exists customers_update on public.customers;
create policy customers_update
on public.customers
for update to authenticated
using (
  (select private.is_super_admin())
  or (
    restaurant_id = (select private.current_restaurant_id())
    and (select private.has_any_staff_role(array['MANAGER','RECEPTIONIST']::public.app_role[]))
  )
)
with check (
  (select private.is_super_admin())
  or (
    restaurant_id = (select private.current_restaurant_id())
    and (select private.has_any_staff_role(array['MANAGER','RECEPTIONIST']::public.app_role[]))
  )
);

-- ------------------------------------------------------------
-- 25. MENU RLS
-- ------------------------------------------------------------

drop policy if exists menu_categories_select on public.menu_categories;
create policy menu_categories_select
on public.menu_categories
for select to authenticated
using (
  (select private.is_super_admin())
  or restaurant_id = (select private.current_restaurant_id())
);

drop policy if exists menu_categories_insert on public.menu_categories;
create policy menu_categories_insert
on public.menu_categories
for insert to authenticated
with check (
  (select private.is_super_admin())
  or (
    (select private.is_manager())
    and restaurant_id = (select private.current_restaurant_id())
  )
);

drop policy if exists menu_categories_update on public.menu_categories;
create policy menu_categories_update
on public.menu_categories
for update to authenticated
using (
  (select private.is_super_admin())
  or ((select private.is_manager()) and restaurant_id = (select private.current_restaurant_id()))
)
with check (
  (select private.is_super_admin())
  or ((select private.is_manager()) and restaurant_id = (select private.current_restaurant_id()))
);

drop policy if exists menu_categories_delete on public.menu_categories;
create policy menu_categories_delete
on public.menu_categories
for delete to authenticated
using (
  (select private.is_super_admin())
  or ((select private.is_manager()) and restaurant_id = (select private.current_restaurant_id()))
);

drop policy if exists menu_items_select on public.menu_items;
create policy menu_items_select
on public.menu_items
for select to authenticated
using (
  (select private.is_super_admin())
  or restaurant_id = (select private.current_restaurant_id())
);

drop policy if exists menu_items_insert on public.menu_items;
create policy menu_items_insert
on public.menu_items
for insert to authenticated
with check (
  (select private.is_super_admin())
  or ((select private.is_manager()) and restaurant_id = (select private.current_restaurant_id()))
);

drop policy if exists menu_items_update on public.menu_items;
create policy menu_items_update
on public.menu_items
for update to authenticated
using (
  (select private.is_super_admin())
  or ((select private.is_manager()) and restaurant_id = (select private.current_restaurant_id()))
)
with check (
  (select private.is_super_admin())
  or ((select private.is_manager()) and restaurant_id = (select private.current_restaurant_id()))
);

drop policy if exists menu_items_delete on public.menu_items;
create policy menu_items_delete
on public.menu_items
for delete to authenticated
using (
  (select private.is_super_admin())
  or ((select private.is_manager()) and restaurant_id = (select private.current_restaurant_id()))
);

-- ------------------------------------------------------------
-- 26. DINING TABLES RLS
-- ------------------------------------------------------------

drop policy if exists dining_tables_select on public.dining_tables;
create policy dining_tables_select
on public.dining_tables
for select to authenticated
using (
  (select private.is_super_admin())
  or restaurant_id = (select private.current_restaurant_id())
);

drop policy if exists dining_tables_insert on public.dining_tables;
create policy dining_tables_insert
on public.dining_tables
for insert to authenticated
with check (
  (select private.is_super_admin())
  or ((select private.is_manager()) and restaurant_id = (select private.current_restaurant_id()))
);

drop policy if exists dining_tables_update on public.dining_tables;
create policy dining_tables_update
on public.dining_tables
for update to authenticated
using (
  (select private.is_super_admin())
  or (
    restaurant_id = (select private.current_restaurant_id())
    and (select private.has_any_staff_role(array['MANAGER','RECEPTIONIST']::public.app_role[]))
  )
)
with check (
  (select private.is_super_admin())
  or (
    restaurant_id = (select private.current_restaurant_id())
    and (select private.has_any_staff_role(array['MANAGER','RECEPTIONIST']::public.app_role[]))
  )
);

drop policy if exists dining_tables_delete on public.dining_tables;
create policy dining_tables_delete
on public.dining_tables
for delete to authenticated
using (
  (select private.is_super_admin())
  or ((select private.is_manager()) and restaurant_id = (select private.current_restaurant_id()))
);

-- ------------------------------------------------------------
-- 27. TABLE SESSIONS RLS
-- ------------------------------------------------------------

drop policy if exists table_sessions_select on public.table_sessions;
create policy table_sessions_select
on public.table_sessions
for select to authenticated
using (
  (select private.is_super_admin())
  or restaurant_id = (select private.current_restaurant_id())
);

drop policy if exists table_sessions_insert on public.table_sessions;
create policy table_sessions_insert
on public.table_sessions
for insert to authenticated
with check (
  (select private.is_super_admin())
  or (
    restaurant_id = (select private.current_restaurant_id())
    and (select private.has_any_staff_role(array['MANAGER','RECEPTIONIST','WAITER']::public.app_role[]))
  )
);

drop policy if exists table_sessions_update on public.table_sessions;
create policy table_sessions_update
on public.table_sessions
for update to authenticated
using (
  (select private.is_super_admin())
  or (
    restaurant_id = (select private.current_restaurant_id())
    and (select private.has_any_staff_role(array['MANAGER','RECEPTIONIST','WAITER']::public.app_role[]))
  )
)
with check (
  (select private.is_super_admin())
  or (
    restaurant_id = (select private.current_restaurant_id())
    and (select private.has_any_staff_role(array['MANAGER','RECEPTIONIST','WAITER']::public.app_role[]))
  )
);

-- ------------------------------------------------------------
-- 28. TABLE ASSIGNMENTS RLS
-- ------------------------------------------------------------

drop policy if exists table_assignments_select on public.table_assignments;
create policy table_assignments_select
on public.table_assignments
for select to authenticated
using (
  (select private.is_super_admin())
  or restaurant_id = (select private.current_restaurant_id())
);

drop policy if exists table_assignments_insert on public.table_assignments;
create policy table_assignments_insert
on public.table_assignments
for insert to authenticated
with check (
  (select private.is_super_admin())
  or (
    restaurant_id = (select private.current_restaurant_id())
    and (select private.has_any_staff_role(array['MANAGER','RECEPTIONIST']::public.app_role[]))
  )
);

drop policy if exists table_assignments_update on public.table_assignments;
create policy table_assignments_update
on public.table_assignments
for update to authenticated
using (
  (select private.is_super_admin())
  or (
    restaurant_id = (select private.current_restaurant_id())
    and (select private.has_any_staff_role(array['MANAGER','RECEPTIONIST']::public.app_role[]))
  )
)
with check (
  (select private.is_super_admin())
  or (
    restaurant_id = (select private.current_restaurant_id())
    and (select private.has_any_staff_role(array['MANAGER','RECEPTIONIST']::public.app_role[]))
  )
);

-- ------------------------------------------------------------
-- 29. RESERVATIONS RLS
-- ------------------------------------------------------------

drop policy if exists reservations_select on public.reservations;
create policy reservations_select
on public.reservations
for select to authenticated
using (
  (select private.is_super_admin())
  or restaurant_id = (select private.current_restaurant_id())
);

drop policy if exists reservations_insert on public.reservations;
create policy reservations_insert
on public.reservations
for insert to authenticated
with check (
  (select private.is_super_admin())
  or (
    restaurant_id = (select private.current_restaurant_id())
    and (select private.has_any_staff_role(array['MANAGER','RECEPTIONIST']::public.app_role[]))
  )
);

drop policy if exists reservations_update on public.reservations;
create policy reservations_update
on public.reservations
for update to authenticated
using (
  (select private.is_super_admin())
  or (
    restaurant_id = (select private.current_restaurant_id())
    and (select private.has_any_staff_role(array['MANAGER','RECEPTIONIST']::public.app_role[]))
  )
)
with check (
  (select private.is_super_admin())
  or (
    restaurant_id = (select private.current_restaurant_id())
    and (select private.has_any_staff_role(array['MANAGER','RECEPTIONIST']::public.app_role[]))
  )
);

-- ------------------------------------------------------------
-- 30. ORDERS RLS
-- ------------------------------------------------------------

drop policy if exists orders_select on public.orders;
create policy orders_select
on public.orders
for select to authenticated
using (
  (select private.is_super_admin())
  or restaurant_id = (select private.current_restaurant_id())
);

drop policy if exists orders_insert on public.orders;
create policy orders_insert
on public.orders
for insert to authenticated
with check (
  (select private.is_super_admin())
  or (
    restaurant_id = (select private.current_restaurant_id())
    and (select private.has_any_staff_role(array['MANAGER','RECEPTIONIST','WAITER']::public.app_role[]))
  )
);

drop policy if exists orders_update on public.orders;
create policy orders_update
on public.orders
for update to authenticated
using (
  (select private.is_super_admin())
  or (
    restaurant_id = (select private.current_restaurant_id())
    and (select private.has_any_staff_role(array['MANAGER','RECEPTIONIST','WAITER','KITCHEN']::public.app_role[]))
  )
)
with check (
  (select private.is_super_admin())
  or (
    restaurant_id = (select private.current_restaurant_id())
    and (select private.has_any_staff_role(array['MANAGER','RECEPTIONIST','WAITER','KITCHEN']::public.app_role[]))
  )
);

-- ------------------------------------------------------------
-- 31. ORDER ITEMS RLS
-- ------------------------------------------------------------

drop policy if exists order_items_select on public.order_items;
create policy order_items_select
on public.order_items
for select to authenticated
using (
  (select private.is_super_admin())
  or restaurant_id = (select private.current_restaurant_id())
);

drop policy if exists order_items_insert on public.order_items;
create policy order_items_insert
on public.order_items
for insert to authenticated
with check (
  (select private.is_super_admin())
  or (
    restaurant_id = (select private.current_restaurant_id())
    and (select private.has_any_staff_role(array['MANAGER','RECEPTIONIST','WAITER']::public.app_role[]))
  )
);

drop policy if exists order_items_update on public.order_items;
create policy order_items_update
on public.order_items
for update to authenticated
using (
  (select private.is_super_admin())
  or (
    restaurant_id = (select private.current_restaurant_id())
    and (select private.has_any_staff_role(array['MANAGER','RECEPTIONIST','WAITER']::public.app_role[]))
  )
)
with check (
  (select private.is_super_admin())
  or (
    restaurant_id = (select private.current_restaurant_id())
    and (select private.has_any_staff_role(array['MANAGER','RECEPTIONIST','WAITER']::public.app_role[]))
  )
);

-- ------------------------------------------------------------
-- 32. PAYMENTS RLS
-- ------------------------------------------------------------

drop policy if exists payments_select on public.payments;
create policy payments_select
on public.payments
for select to authenticated
using (
  (select private.is_super_admin())
  or (
    restaurant_id = (select private.current_restaurant_id())
    and (select private.has_any_staff_role(array['MANAGER','RECEPTIONIST']::public.app_role[]))
  )
);

drop policy if exists payments_insert on public.payments;
create policy payments_insert
on public.payments
for insert to authenticated
with check (
  (select private.is_super_admin())
  or (
    restaurant_id = (select private.current_restaurant_id())
    and (select private.has_any_staff_role(array['MANAGER','RECEPTIONIST']::public.app_role[]))
  )
);

drop policy if exists payments_update on public.payments;
create policy payments_update
on public.payments
for update to authenticated
using (
  (select private.is_super_admin())
  or (
    restaurant_id = (select private.current_restaurant_id())
    and (select private.has_any_staff_role(array['MANAGER','RECEPTIONIST']::public.app_role[]))
  )
)
with check (
  (select private.is_super_admin())
  or (
    restaurant_id = (select private.current_restaurant_id())
    and (select private.has_any_staff_role(array['MANAGER','RECEPTIONIST']::public.app_role[]))
  )
);

-- ------------------------------------------------------------
-- 33. HELP REQUESTS RLS
-- ------------------------------------------------------------

drop policy if exists help_requests_select on public.help_requests;
create policy help_requests_select
on public.help_requests
for select to authenticated
using (
  (select private.is_super_admin())
  or restaurant_id = (select private.current_restaurant_id())
);

drop policy if exists help_requests_insert on public.help_requests;
create policy help_requests_insert
on public.help_requests
for insert to authenticated
with check (
  (select private.is_super_admin())
  or (
    restaurant_id = (select private.current_restaurant_id())
    and (select private.has_any_staff_role(array['MANAGER','RECEPTIONIST','WAITER']::public.app_role[]))
  )
);

drop policy if exists help_requests_update on public.help_requests;
create policy help_requests_update
on public.help_requests
for update to authenticated
using (
  (select private.is_super_admin())
  or (
    restaurant_id = (select private.current_restaurant_id())
    and (select private.has_any_staff_role(array['MANAGER','RECEPTIONIST','WAITER']::public.app_role[]))
  )
)
with check (
  (select private.is_super_admin())
  or (
    restaurant_id = (select private.current_restaurant_id())
    and (select private.has_any_staff_role(array['MANAGER','RECEPTIONIST','WAITER']::public.app_role[]))
  )
);

-- ------------------------------------------------------------
-- 34. CUSTOMER ISSUES RLS
-- ------------------------------------------------------------

drop policy if exists customer_issues_select on public.customer_issues;
create policy customer_issues_select
on public.customer_issues
for select to authenticated
using (
  (select private.is_super_admin())
  or restaurant_id = (select private.current_restaurant_id())
);

drop policy if exists customer_issues_insert on public.customer_issues;
create policy customer_issues_insert
on public.customer_issues
for insert to authenticated
with check (
  (select private.is_super_admin())
  or (
    restaurant_id = (select private.current_restaurant_id())
    and (select private.has_any_staff_role(array['MANAGER','RECEPTIONIST','WAITER']::public.app_role[]))
  )
);

drop policy if exists customer_issues_update on public.customer_issues;
create policy customer_issues_update
on public.customer_issues
for update to authenticated
using (
  (select private.is_super_admin())
  or (
    restaurant_id = (select private.current_restaurant_id())
    and (select private.has_any_staff_role(array['MANAGER','RECEPTIONIST']::public.app_role[]))
  )
)
with check (
  (select private.is_super_admin())
  or (
    restaurant_id = (select private.current_restaurant_id())
    and (select private.has_any_staff_role(array['MANAGER','RECEPTIONIST']::public.app_role[]))
  )
);

-- ------------------------------------------------------------
-- 35. RESTAURANT SETTINGS RLS
-- ------------------------------------------------------------

drop policy if exists restaurant_settings_select on public.restaurant_settings;
create policy restaurant_settings_select
on public.restaurant_settings
for select to authenticated
using (
  (select private.is_super_admin())
  or restaurant_id = (select private.current_restaurant_id())
);

drop policy if exists restaurant_settings_insert on public.restaurant_settings;
create policy restaurant_settings_insert
on public.restaurant_settings
for insert to authenticated
with check (
  (select private.is_super_admin())
  or (
    (select private.is_manager())
    and restaurant_id = (select private.current_restaurant_id())
  )
);

drop policy if exists restaurant_settings_update on public.restaurant_settings;
create policy restaurant_settings_update
on public.restaurant_settings
for update to authenticated
using (
  (select private.is_super_admin())
  or (
    (select private.is_manager())
    and restaurant_id = (select private.current_restaurant_id())
  )
)
with check (
  (select private.is_super_admin())
  or (
    (select private.is_manager())
    and restaurant_id = (select private.current_restaurant_id())
  )
);

-- ------------------------------------------------------------
-- 36. AUDIT LOG RLS
-- ------------------------------------------------------------

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select
on public.audit_logs
for select to authenticated
using (
  (select private.is_super_admin())
  or (
    (select private.is_manager())
    and restaurant_id = (select private.current_restaurant_id())
  )
);

commit;
