-- FloodSense: dashboard user profiles (replaces the Firestore "users" collection)
-- Apply with `supabase db push`, or paste into the Supabase SQL Editor and run.

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null default '',
  email       text not null default '',
  phone       text not null default '',
  role        text not null default 'viewer' check (role in ('admin', 'operator', 'viewer')),
  status      text not null default 'Active' check (status in ('Active', 'Inactive')),
  location    text not null default '',
  avatar      text not null default '',
  last_active timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- True when the calling user is an active admin. SECURITY DEFINER so it can be
-- used inside RLS policies on profiles without recursing into those policies.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
      and status = 'Active'
  );
$$;

-- Create a profile row whenever an auth user is created. Role is always
-- 'viewer' here; only an admin (or the admin-users Edge Function) can raise it.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name, phone, location)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    coalesce(new.raw_user_meta_data ->> 'location', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.email in sync once a user confirms an email change.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- Non-admin users may edit their own name/phone/location/avatar/last_active,
-- but never their role, status or email. Backend contexts (no auth.uid(),
-- e.g. service role or the triggers above) are not restricted.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not public.is_admin() then
    if new.role   is distinct from old.role
    or new.status is distinct from old.status
    or new.email  is distinct from old.email
    or new.id     is distinct from old.id then
      raise exception 'Only admins can change role, status or email'
        using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists guard_profile_update on public.profiles;
create trigger guard_profile_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

drop policy if exists "profiles: read own or admin reads all" on public.profiles;
create policy "profiles: read own or admin reads all"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "profiles: update own or admin updates all" on public.profiles;
create policy "profiles: update own or admin updates all"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "profiles: admin deletes" on public.profiles;
create policy "profiles: admin deletes"
  on public.profiles for delete
  to authenticated
  using ((select public.is_admin()));

-- Inserts happen only through the handle_new_user trigger (no insert policy).

-- ---------------------------------------------------------------------------
-- Realtime (User Management table updates live)
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- First admin
-- ---------------------------------------------------------------------------
-- 1. Supabase Dashboard -> Authentication -> Users -> "Add user" (auto-confirm).
-- 2. Then run:
--      update public.profiles set role = 'admin', status = 'Active', name = 'Your Name'
--      where email = 'you@example.com';
-- 3. On first sign-in the app asks you to set up an authenticator app (2FA).
