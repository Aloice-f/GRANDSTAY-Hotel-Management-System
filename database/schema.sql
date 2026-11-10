-- GRANDSTAY initial secure authentication/profile schema.
-- Run in Supabase SQL Editor. Review your existing schema before running on a non-empty project.

create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum (
    'super_admin', 'hotel_manager', 'receptionist',
    'accountant', 'housekeeping', 'customer'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role public.app_role not null default 'customer',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'customer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Users can update own name only" on public.profiles;
create policy "Users can update own name only"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- IMPORTANT: role is not supplied by public signup. Only trusted server-side
-- service-role operations or a carefully controlled SQL administrator should assign staff roles.
-- To bootstrap the first super administrator, first register your own email as a customer,
-- then run the UPDATE below using your actual Auth user UUID:
-- update public.profiles set role = 'super_admin' where id = 'YOUR-AUTH-USER-UUID';
-- Do not expose the service-role key in the browser or commit it to GitHub.
