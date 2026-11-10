-- GRANDSTAY HOTEL MANAGEMENT SYSTEM
-- Module 1 database foundation. Run in Supabase SQL Editor.
create extension if not exists pgcrypto;
create extension if not exists btree_gist;

do $$ begin
  create type public.app_role as enum ('super_admin','hotel_manager','receptionist','accountant','housekeeping','customer');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.room_status as enum ('available','occupied','reserved','dirty','maintenance','out_of_service');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.booking_status as enum ('pending','confirmed','checked_in','checked_out','cancelled','no_show');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.payment_status as enum ('pending','completed','failed','refunded','partially_refunded');
exception when duplicate_object then null; end $$;

create table if not exists public.hotels (
 id uuid primary key default gen_random_uuid(), name text not null, slug text unique,
 email text, phone text, address text, timezone text not null default 'Africa/Nairobi',
 currency char(3) not null default 'KES', created_at timestamptz not null default now()
);
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 hotel_id uuid references public.hotels(id) on delete set null,
 full_name text not null default '', phone text,
 role public.app_role not null default 'customer', is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.room_categories (
 id uuid primary key default gen_random_uuid(), hotel_id uuid not null references public.hotels(id) on delete cascade,
 name text not null, description text, base_price numeric(12,2) not null check(base_price>=0),
 capacity integer not null default 2 check(capacity>0), created_at timestamptz not null default now(),
 unique(hotel_id,name), unique(id,hotel_id)
);
create table if not exists public.rooms (
 id uuid primary key default gen_random_uuid(), hotel_id uuid not null references public.hotels(id) on delete cascade,
 category_id uuid not null, room_number text not null, floor text,
 status public.room_status not null default 'available',
 price_per_night numeric(12,2) not null check(price_per_night>=0),
 description text, image_urls text[] not null default '{}', is_active boolean not null default true,
 created_at timestamptz not null default now(),
 foreign key(category_id,hotel_id) references public.room_categories(id,hotel_id) on delete restrict,
 unique(hotel_id,room_number), unique(id,hotel_id)
);
create table if not exists public.guests (
 id uuid primary key default gen_random_uuid(), hotel_id uuid not null references public.hotels(id) on delete cascade,
 auth_user_id uuid references auth.users(id) on delete set null, full_name text not null,
 email text, phone text, id_type text, id_number_ciphertext text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,hotel_id)
);
create table if not exists public.bookings (
 id uuid primary key default gen_random_uuid(), hotel_id uuid not null references public.hotels(id) on delete cascade,
 guest_id uuid not null, room_id uuid not null,
 booking_reference text not null unique default ('GST-'||upper(substr(encode(gen_random_bytes(8),'hex'),1,10))),
 check_in date not null, check_out date not null, adults integer not null default 1 check(adults>0),
 children integer not null default 0 check(children>=0), status public.booking_status not null default 'pending',
 nightly_rate numeric(12,2) not null check(nightly_rate>=0), total_amount numeric(12,2) not null check(total_amount>=0),
 special_requests text, created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), check(check_out>check_in),
 foreign key(guest_id,hotel_id) references public.guests(id,hotel_id) on delete restrict,
 foreign key(room_id,hotel_id) references public.rooms(id,hotel_id) on delete restrict,
 unique(id,hotel_id)
);
alter table public.bookings drop constraint if exists bookings_no_overlapping_room_dates;
alter table public.bookings add constraint bookings_no_overlapping_room_dates
 exclude using gist(room_id with =, daterange(check_in,check_out,'[)') with &&)
 where(status in ('pending','confirmed','checked_in'));

create table if not exists public.payments (
 id uuid primary key default gen_random_uuid(), hotel_id uuid not null references public.hotels(id) on delete cascade,
 booking_id uuid, guest_id uuid, amount numeric(12,2) not null check(amount>0),
 currency char(3) not null default 'KES',
 method text not null check(method in ('mpesa','cash','card','bank_transfer','other')),
 status public.payment_status not null default 'pending', provider_reference text,
 merchant_request_id text, checkout_request_id text, verified_at timestamptz,
 metadata jsonb not null default '{}', created_at timestamptz not null default now(),
 foreign key(booking_id,hotel_id) references public.bookings(id,hotel_id) on delete restrict,
 foreign key(guest_id,hotel_id) references public.guests(id,hotel_id) on delete restrict
);
create table if not exists public.invoices (
 id uuid primary key default gen_random_uuid(), hotel_id uuid not null references public.hotels(id) on delete cascade,
 booking_id uuid, invoice_number text not null, subtotal numeric(12,2) not null default 0,
 tax_amount numeric(12,2) not null default 0, total_amount numeric(12,2) not null default 0,
 amount_paid numeric(12,2) not null default 0, issued_at timestamptz not null default now(),
 due_at timestamptz, unique(hotel_id,invoice_number),
 foreign key(booking_id,hotel_id) references public.bookings(id,hotel_id) on delete restrict
);
create table if not exists public.employees (
 id uuid primary key default gen_random_uuid(), hotel_id uuid not null references public.hotels(id) on delete cascade,
 profile_id uuid references public.profiles(id) on delete set null, department text, job_title text,
 employment_status text not null default 'active', created_at timestamptz not null default now()
);
create table if not exists public.housekeeping_tasks (
 id uuid primary key default gen_random_uuid(), hotel_id uuid not null references public.hotels(id) on delete cascade,
 room_id uuid not null, assigned_to uuid references public.employees(id) on delete set null,
 task_status text not null default 'pending' check(task_status in ('pending','in_progress','completed','blocked')),
 notes text, scheduled_for timestamptz, completed_at timestamptz, created_at timestamptz not null default now(),
 foreign key(room_id,hotel_id) references public.rooms(id,hotel_id) on delete restrict
);
create table if not exists public.maintenance_requests (
 id uuid primary key default gen_random_uuid(), hotel_id uuid not null references public.hotels(id) on delete cascade,
 room_id uuid, reported_by uuid references public.profiles(id) on delete set null,
 assigned_to uuid references public.employees(id) on delete set null, title text not null, description text,
 priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),
 status text not null default 'open' check(status in ('open','in_progress','resolved','closed')),
 created_at timestamptz not null default now(), resolved_at timestamptz,
 foreign key(room_id,hotel_id) references public.rooms(id,hotel_id) on delete restrict
);
create table if not exists public.restaurant_menu (
 id uuid primary key default gen_random_uuid(), hotel_id uuid not null references public.hotels(id) on delete cascade,
 name text not null, category text not null, description text, price numeric(12,2) not null check(price>=0),
 is_available boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.restaurant_orders (
 id uuid primary key default gen_random_uuid(), hotel_id uuid not null references public.hotels(id) on delete cascade,
 booking_id uuid, guest_id uuid, room_id uuid,
 order_status text not null default 'received' check(order_status in ('received','preparing','ready','served','cancelled')),
 order_type text not null default 'restaurant' check(order_type in ('restaurant','room_service')),
 total_amount numeric(12,2) not null default 0 check(total_amount>=0), notes text,
 created_at timestamptz not null default now(),
 foreign key(booking_id,hotel_id) references public.bookings(id,hotel_id) on delete restrict,
 foreign key(guest_id,hotel_id) references public.guests(id,hotel_id) on delete restrict,
 foreign key(room_id,hotel_id) references public.rooms(id,hotel_id) on delete restrict
);
create table if not exists public.restaurant_order_items (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.restaurant_orders(id) on delete cascade,
 menu_item_id uuid references public.restaurant_menu(id) on delete set null, item_name text not null,
 quantity integer not null check(quantity>0), unit_price numeric(12,2) not null check(unit_price>=0)
);
create table if not exists public.expenses (
 id uuid primary key default gen_random_uuid(), hotel_id uuid not null references public.hotels(id) on delete cascade,
 recorded_by uuid references public.profiles(id) on delete set null, category text not null, description text,
 amount numeric(12,2) not null check(amount>0), expense_date date not null default current_date,
 receipt_url text, created_at timestamptz not null default now()
);
create table if not exists public.notifications (
 id uuid primary key default gen_random_uuid(), hotel_id uuid references public.hotels(id) on delete cascade,
 recipient_user_id uuid references auth.users(id) on delete cascade, channel text not null default 'in_app',
 subject text not null, message text not null, status text not null default 'unread',
 created_at timestamptz not null default now(), read_at timestamptz
);
create table if not exists public.audit_logs (
 id bigint generated always as identity primary key, hotel_id uuid references public.hotels(id) on delete set null,
 actor_user_id uuid references auth.users(id) on delete set null, action text not null,
 entity_type text not null, entity_id text, details jsonb not null default '{}',
 ip_address inet, created_at timestamptz not null default now()
);

create index if not exists profiles_hotel_role_idx on public.profiles(hotel_id,role);
create index if not exists rooms_hotel_status_idx on public.rooms(hotel_id,status);
create index if not exists bookings_hotel_dates_idx on public.bookings(hotel_id,check_in,check_out);
create index if not exists bookings_guest_idx on public.bookings(guest_id);
create index if not exists payments_booking_idx on public.payments(booking_id);
create index if not exists notifications_recipient_idx on public.notifications(recipient_user_id,created_at desc);
create index if not exists audit_logs_hotel_created_idx on public.audit_logs(hotel_id,created_at desc);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 insert into public.profiles(id,full_name,role)
 values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),'customer')
 on conflict(id) do nothing;
 return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.current_user_role()
returns public.app_role language sql stable security definer set search_path=''
as $$ select p.role from public.profiles p where p.id=(select auth.uid()) and p.is_active=true limit 1; $$;
create or replace function public.current_user_hotel()
returns uuid language sql stable security definer set search_path=''
as $$ select p.hotel_id from public.profiles p where p.id=(select auth.uid()) and p.is_active=true limit 1; $$;
create or replace function public.is_hotel_staff()
returns boolean language sql stable security definer set search_path=''
as $$ select coalesce(public.current_user_role() in ('super_admin','hotel_manager','receptionist','accountant','housekeeping'),false); $$;

alter table public.hotels enable row level security;
alter table public.profiles enable row level security;
alter table public.room_categories enable row level security;
alter table public.rooms enable row level security;
alter table public.guests enable row level security;
alter table public.bookings enable row level security;
alter table public.payments enable row level security;
alter table public.invoices enable row level security;
alter table public.employees enable row level security;
alter table public.housekeeping_tasks enable row level security;
alter table public.maintenance_requests enable row level security;
alter table public.restaurant_menu enable row level security;
alter table public.restaurant_orders enable row level security;
alter table public.restaurant_order_items enable row level security;
alter table public.expenses enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

create policy hotels_read on public.hotels for select to authenticated using(id=public.current_user_hotel() or public.current_user_role()='super_admin');
create policy hotels_manage on public.hotels for all to authenticated using(public.current_user_role() in ('super_admin','hotel_manager')) with check(public.current_user_role() in ('super_admin','hotel_manager'));

create policy profiles_read on public.profiles for select to authenticated using(
 id=(select auth.uid()) or (hotel_id=public.current_user_hotel() and public.current_user_role() in ('super_admin','hotel_manager'))
);
create policy profiles_update_self on public.profiles for update to authenticated using(id=(select auth.uid()))
with check(id=(select auth.uid()) and role=public.current_user_role() and hotel_id is not distinct from public.current_user_hotel());
create policy profiles_manage_staff on public.profiles for all to authenticated
using(public.current_user_role()='super_admin' or (hotel_id=public.current_user_hotel() and public.current_user_role()='hotel_manager' and role <> 'super_admin'))
with check(public.current_user_role()='super_admin' or (hotel_id=public.current_user_hotel() and public.current_user_role()='hotel_manager' and role <> 'super_admin'));

create policy categories_read on public.room_categories for select to authenticated using(true);
create policy categories_staff_manage on public.room_categories for all to authenticated
using(public.is_hotel_staff() and hotel_id=public.current_user_hotel()) with check(public.is_hotel_staff() and hotel_id=public.current_user_hotel());
create policy rooms_read on public.rooms for select to authenticated using(true);
create policy rooms_staff_manage on public.rooms for all to authenticated
using(public.is_hotel_staff() and hotel_id=public.current_user_hotel()) with check(public.is_hotel_staff() and hotel_id=public.current_user_hotel());
create policy menu_read on public.restaurant_menu for select to authenticated using(true);
create policy menu_staff_manage on public.restaurant_menu for all to authenticated
using(public.is_hotel_staff() and hotel_id=public.current_user_hotel()) with check(public.is_hotel_staff() and hotel_id=public.current_user_hotel());

create policy guests_read on public.guests for select to authenticated using(
 auth_user_id=(select auth.uid()) or (hotel_id=public.current_user_hotel() and public.is_hotel_staff())
);
create policy guests_staff_manage on public.guests for all to authenticated
using(hotel_id=public.current_user_hotel() and public.is_hotel_staff())
with check(hotel_id=public.current_user_hotel() and public.is_hotel_staff());

create policy bookings_read on public.bookings for select to authenticated using(
 (hotel_id=public.current_user_hotel() and public.is_hotel_staff())
 or exists(select 1 from public.guests g where g.id=guest_id and g.auth_user_id=(select auth.uid()))
);
create policy bookings_staff_manage on public.bookings for all to authenticated
using(hotel_id=public.current_user_hotel() and public.is_hotel_staff())
with check(hotel_id=public.current_user_hotel() and public.is_hotel_staff());

create policy payments_read on public.payments for select to authenticated using(
 (hotel_id=public.current_user_hotel() and public.current_user_role() in ('super_admin','hotel_manager','receptionist','accountant'))
 or exists(select 1 from public.guests g where g.id=guest_id and g.auth_user_id=(select auth.uid()))
);
create policy payments_staff_manage on public.payments for all to authenticated
using(hotel_id=public.current_user_hotel() and public.current_user_role() in ('super_admin','hotel_manager','accountant'))
with check(hotel_id=public.current_user_hotel() and public.current_user_role() in ('super_admin','hotel_manager','accountant'));

create policy invoices_read on public.invoices for select to authenticated using(hotel_id=public.current_user_hotel() and public.is_hotel_staff());
create policy invoices_staff_manage on public.invoices for all to authenticated
using(hotel_id=public.current_user_hotel() and public.current_user_role() in ('super_admin','hotel_manager','receptionist','accountant'))
with check(hotel_id=public.current_user_hotel() and public.current_user_role() in ('super_admin','hotel_manager','receptionist','accountant'));

create policy employees_staff_manage on public.employees for all to authenticated
using(hotel_id=public.current_user_hotel() and public.current_user_role() in ('super_admin','hotel_manager'))
with check(hotel_id=public.current_user_hotel() and public.current_user_role() in ('super_admin','hotel_manager'));

create policy housekeeping_read on public.housekeeping_tasks for select to authenticated using(hotel_id=public.current_user_hotel() and public.is_hotel_staff());
create policy housekeeping_manage on public.housekeeping_tasks for all to authenticated
using(hotel_id=public.current_user_hotel() and public.current_user_role() in ('super_admin','hotel_manager','housekeeping'))
with check(hotel_id=public.current_user_hotel() and public.current_user_role() in ('super_admin','hotel_manager','housekeeping'));

create policy maintenance_read on public.maintenance_requests for select to authenticated using(hotel_id=public.current_user_hotel() and public.is_hotel_staff());
create policy maintenance_manage on public.maintenance_requests for all to authenticated
using(hotel_id=public.current_user_hotel() and public.is_hotel_staff())
with check(hotel_id=public.current_user_hotel() and public.is_hotel_staff());

create policy restaurant_orders_read on public.restaurant_orders for select to authenticated using(hotel_id=public.current_user_hotel() and public.is_hotel_staff());
create policy restaurant_orders_manage on public.restaurant_orders for all to authenticated
using(hotel_id=public.current_user_hotel() and public.is_hotel_staff())
with check(hotel_id=public.current_user_hotel() and public.is_hotel_staff());
create policy restaurant_order_items_staff on public.restaurant_order_items for all to authenticated
using(exists(select 1 from public.restaurant_orders o where o.id=order_id and o.hotel_id=public.current_user_hotel() and public.is_hotel_staff()))
with check(exists(select 1 from public.restaurant_orders o where o.id=order_id and o.hotel_id=public.current_user_hotel() and public.is_hotel_staff()));

create policy expenses_staff_manage on public.expenses for all to authenticated
using(hotel_id=public.current_user_hotel() and public.current_user_role() in ('super_admin','hotel_manager','accountant'))
with check(hotel_id=public.current_user_hotel() and public.current_user_role() in ('super_admin','hotel_manager','accountant'));

create policy notifications_read_own on public.notifications for select to authenticated using(recipient_user_id=(select auth.uid()));
create policy notifications_update_own on public.notifications for update to authenticated using(recipient_user_id=(select auth.uid())) with check(recipient_user_id=(select auth.uid()));

create policy audit_logs_read_admin on public.audit_logs for select to authenticated
using(hotel_id=public.current_user_hotel() and public.current_user_role() in ('super_admin','hotel_manager'));
-- Audit-log inserts and privileged payment updates are performed by trusted backend code only.
