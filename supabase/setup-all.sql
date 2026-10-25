-- FloodSense: complete database setup (all migrations in order).
-- Paste this whole file into Supabase Dashboard > SQL Editor > New query > Run.
-- Safe to run more than once.

-- ===== migrations/20261012000000_profiles.sql =====
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

-- ===== migrations/20261012000001_security_audit_sms.sql =====
-- FloodSense: security hardening, audit log and SMS blasts
-- Run after 20261012000000_profiles.sql.

-- ---------------------------------------------------------------------------
-- 1. Self sign-ups start Inactive. Only the admin-users Edge Function
--    activates accounts, so a stranger calling signUp() gets no access.
-- ---------------------------------------------------------------------------

alter table public.profiles alter column status set default 'Inactive';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name, phone, location, status)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    coalesce(new.raw_user_meta_data ->> 'location', ''),
    'Inactive'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Role helpers now require a completed 2FA challenge (aal2).
-- ---------------------------------------------------------------------------

create or replace function public.is_aal2()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal') = 'aal2', false);
$$;

create or replace function public.has_role(variadic roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_aal2() and exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and role = any (roles)
      and status = 'Active'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('admin');
$$;

-- ---------------------------------------------------------------------------
-- 3. Never leave the system without an active admin.
-- ---------------------------------------------------------------------------

create or replace function public.other_active_admin_exists(excluded uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id <> excluded and role = 'admin' and status = 'Active'
  );
$$;

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

  if old.role = 'admin' and old.status = 'Active'
     and (new.role <> 'admin' or new.status <> 'Active')
     and not public.other_active_admin_exists(old.id) then
    raise exception 'Cannot remove the last active admin'
      using errcode = 'P0001';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.guard_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'admin' and old.status = 'Active'
     and not public.other_active_admin_exists(old.id) then
    raise exception 'Cannot delete the last active admin'
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

drop trigger if exists guard_profile_delete on public.profiles;
create trigger guard_profile_delete
  before delete on public.profiles
  for each row execute function public.guard_profile_delete();

-- ---------------------------------------------------------------------------
-- 4. Audit log
-- ---------------------------------------------------------------------------

create table if not exists public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  resource    text not null,
  resource_id text,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);

alter table public.audit_logs enable row level security;

drop policy if exists "audit_logs: admin reads" on public.audit_logs;
create policy "audit_logs: admin reads"
  on public.audit_logs for select
  to authenticated
  using ((select public.is_admin()));
-- No insert/update/delete policies: rows are written only by triggers and the
-- admin-users Edge Function (service role).

-- Logs profile changes made by signed-in users. Changes made by the Edge
-- Function (no auth.uid()) are logged by the function itself, with the actor.
create or replace function public.audit_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changes jsonb := '{}'::jsonb;
  col text;
begin
  if (select auth.uid()) is null then
    return null;
  end if;

  if tg_op = 'UPDATE' then
    foreach col in array array['name', 'email', 'phone', 'role', 'status', 'location', 'avatar'] loop
      if (to_jsonb(old) -> col) is distinct from (to_jsonb(new) -> col) then
        changes := changes || jsonb_build_object(col, jsonb_build_object('from', to_jsonb(old) -> col, 'to', to_jsonb(new) -> col));
      end if;
    end loop;
    -- Skip last_active-only updates
    if changes = '{}'::jsonb then
      return null;
    end if;
  end if;

  insert into public.audit_logs (actor_id, action, resource, resource_id, details)
  values (
    (select auth.uid()),
    lower(tg_op),
    'profile',
    coalesce(new.id, old.id)::text,
    changes
  );
  return null;
end;
$$;

drop trigger if exists audit_profile_change on public.profiles;
create trigger audit_profile_change
  after update or delete on public.profiles
  for each row execute function public.audit_profile_change();

-- ---------------------------------------------------------------------------
-- 5. SMS blasts (replaces the Firestore "sms_blasts" collection)
-- ---------------------------------------------------------------------------
-- Rows are created as 'Pending'. Actual SMS delivery needs a server-side
-- gateway (e.g. a Semaphore Edge Function) that updates status/recipients.

create table if not exists public.sms_blasts (
  id                uuid primary key default gen_random_uuid(),
  message           text not null check (char_length(btrim(message)) between 1 and 480),
  level             text not null check (level in ('INFO', 'WARNING', 'CRITICAL')),
  location          text not null check (char_length(btrim(location)) > 0),
  recipients        integer not null default 0 check (recipients >= 0),
  status            text not null default 'Pending' check (status in ('Pending', 'Delivered', 'Failed')),
  trigger_source    text not null default 'Manual' check (trigger_source in ('Manual', 'System')),
  triggered_by      uuid references public.profiles (id) on delete set null,
  triggered_by_name text not null default '',
  created_at        timestamptz not null default now()
);

create index if not exists sms_blasts_created_at_idx on public.sms_blasts (created_at desc);

-- Stamp the sender from the session so it can't be spoofed by the client.
create or replace function public.stamp_sms_blast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.triggered_by := (select auth.uid());
    new.triggered_by_name := coalesce(
      (select name from public.profiles where id = (select auth.uid())), '');
    new.trigger_source := 'Manual';
    new.status := 'Pending';
    new.recipients := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists stamp_sms_blast on public.sms_blasts;
create trigger stamp_sms_blast
  before insert on public.sms_blasts
  for each row execute function public.stamp_sms_blast();

create or replace function public.audit_sms_blast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (actor_id, action, resource, resource_id, details)
  values (
    new.triggered_by,
    'create',
    'sms_blast',
    new.id::text,
    jsonb_build_object('level', new.level, 'location', new.location, 'source', new.trigger_source)
  );
  return null;
end;
$$;

drop trigger if exists audit_sms_blast on public.sms_blasts;
create trigger audit_sms_blast
  after insert on public.sms_blasts
  for each row execute function public.audit_sms_blast();

alter table public.sms_blasts enable row level security;

drop policy if exists "sms_blasts: admin/operator read" on public.sms_blasts;
create policy "sms_blasts: admin/operator read"
  on public.sms_blasts for select
  to authenticated
  using ((select public.has_role('admin', 'operator')));

drop policy if exists "sms_blasts: admin/operator create" on public.sms_blasts;
create policy "sms_blasts: admin/operator create"
  on public.sms_blasts for insert
  to authenticated
  with check ((select public.has_role('admin', 'operator')));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sms_blasts'
  ) then
    alter publication supabase_realtime add table public.sms_blasts;
  end if;
end;
$$;

-- ===== migrations/20261012000002_first_admin.sql =====
-- FloodSense: first-admin setup from the web app
-- Lets the very first admin account be created from the /setup page.
-- Once any admin exists, setup is closed.

-- Public yes/no check used by the sign-in and setup pages. Reveals nothing
-- except whether setup has been completed.
create or replace function public.admin_exists()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where role = 'admin');
$$;

revoke all on function public.admin_exists() from public;
grant execute on function public.admin_exists() to anon, authenticated;

-- Promotes a freshly created user to the first admin, atomically. The table
-- lock makes two simultaneous setup attempts impossible: the second one sees
-- the first admin and gets false. Only the bootstrap-admin Edge Function
-- (service role) may call this.
create or replace function public.claim_first_admin(target uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  lock table public.profiles in share row exclusive mode;

  if exists (select 1 from public.profiles where role = 'admin') then
    return false;
  end if;

  update public.profiles
  set role = 'admin', status = 'Active'
  where id = target;

  if not found then
    return false;
  end if;

  insert into public.audit_logs (actor_id, action, resource, resource_id, details)
  values (target, 'bootstrap-admin', 'profile', target::text, '{}'::jsonb);

  return true;
end;
$$;

revoke all on function public.claim_first_admin(uuid) from public, anon, authenticated;
grant execute on function public.claim_first_admin(uuid) to service_role;

-- ===== migrations/20261012000003_residents_sms_send.sql =====
-- FloodSense: residents (SMS recipients) and the sending workflow
-- Run after 20261012000002_first_admin.sql.

-- ---------------------------------------------------------------------------
-- 1. Residents: the people who receive SMS blasts
-- ---------------------------------------------------------------------------

-- Philippine mobile numbers are stored as 639XXXXXXXXX whatever way they were typed
-- (09XXXXXXXXX, +639XXXXXXXXX, 9XXXXXXXXX, with spaces/dashes...).
create or replace function public.normalize_ph_phone(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when d ~ '^639[0-9]{9}$' then d
    when d ~ '^09[0-9]{9}$'  then '63' || substr(d, 2)
    when d ~ '^9[0-9]{9}$'   then '63' || d
    else d
  end
  from (select regexp_replace(coalesce(raw, ''), '[^0-9]', '', 'g') as d) t;
$$;

create table if not exists public.residents (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default '',
  phone       text not null unique check (phone ~ '^639[0-9]{9}$'),
  area        text not null default 'Barangay Pamplona 3',
  is_verified boolean not null default true,
  is_active   boolean not null default true,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists residents_area_idx on public.residents (area) where is_active and is_verified;

create or replace function public.prepare_resident()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.phone := public.normalize_ph_phone(new.phone);
  new.name  := btrim(coalesce(new.name, ''));
  new.area  := coalesce(nullif(btrim(new.area), ''), 'Barangay Pamplona 3');
  if tg_op = 'INSERT' and (select auth.uid()) is not null then
    new.created_by := (select auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists prepare_resident on public.residents;
create trigger prepare_resident
  before insert or update on public.residents
  for each row execute function public.prepare_resident();

alter table public.residents enable row level security;

drop policy if exists "residents: staff read" on public.residents;
create policy "residents: staff read"
  on public.residents for select to authenticated
  using ((select public.has_role('admin', 'operator')));

drop policy if exists "residents: staff create" on public.residents;
create policy "residents: staff create"
  on public.residents for insert to authenticated
  with check ((select public.has_role('admin', 'operator')));

drop policy if exists "residents: staff update" on public.residents;
create policy "residents: staff update"
  on public.residents for update to authenticated
  using ((select public.has_role('admin', 'operator')))
  with check ((select public.has_role('admin', 'operator')));

drop policy if exists "residents: staff delete" on public.residents;
create policy "residents: staff delete"
  on public.residents for delete to authenticated
  using ((select public.has_role('admin', 'operator')));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'residents'
  ) then
    alter publication supabase_realtime add table public.residents;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. SMS blasts: sending lifecycle
--    Pending -> Sending -> Sent | Failed   ('Delivered' is reserved for delivery receipts)
-- ---------------------------------------------------------------------------

alter table public.sms_blasts add column if not exists error_message text;

alter table public.sms_blasts drop constraint if exists sms_blasts_status_check;
alter table public.sms_blasts
  add constraint sms_blasts_status_check
  check (status in ('Pending', 'Sending', 'Sent', 'Delivered', 'Failed'))
  not valid;  -- applies to new/changed rows only, so replaying this file never trips on newer statuses

-- ===== migrations/20261012000004_delete_failed_blasts.sql =====
-- FloodSense: let staff delete failed SMS blasts
-- Only blasts with status 'Failed' (nothing reached any resident) can be deleted;
-- sent and pending blasts stay as a permanent record. Each deletion is audited.

drop policy if exists "sms_blasts: staff delete failed" on public.sms_blasts;
create policy "sms_blasts: staff delete failed"
  on public.sms_blasts for delete
  to authenticated
  using (status = 'Failed' and (select public.has_role('admin', 'operator')));

create or replace function public.audit_sms_blast_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (actor_id, action, resource, resource_id, details)
  values (
    (select auth.uid()),
    'delete',
    'sms_blast',
    old.id::text,
    jsonb_build_object(
      'level', old.level,
      'location', old.location,
      'status', old.status,
      'message', left(old.message, 200),
      'error', left(coalesce(old.error_message, ''), 300)
    )
  );
  return null;
end;
$$;

drop trigger if exists audit_sms_blast_delete on public.sms_blasts;
create trigger audit_sms_blast_delete
  after delete on public.sms_blasts
  for each row execute function public.audit_sms_blast_delete();

-- ===== migrations/20261015000000_email_alerts.sql =====
-- FloodSense: email alerts alongside SMS
-- Run after 20261012000004_delete_failed_blasts.sql.

-- ---------------------------------------------------------------------------
-- 1. Residents can have an email address, a phone number, or both
-- ---------------------------------------------------------------------------

alter table public.residents add column if not exists email text;
alter table public.residents alter column phone drop not null;

alter table public.residents drop constraint if exists residents_phone_check;
alter table public.residents
  add constraint residents_phone_check check (phone is null or phone ~ '^639[0-9]{9}$');

alter table public.residents drop constraint if exists residents_email_check;
alter table public.residents
  add constraint residents_email_check
  check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

alter table public.residents drop constraint if exists residents_contact_check;
alter table public.residents
  add constraint residents_contact_check check (phone is not null or email is not null);

alter table public.residents drop constraint if exists residents_email_key;
alter table public.residents add constraint residents_email_key unique (email);

-- Normalise on every insert/update: phone -> 639XXXXXXXXX, email -> lower case, blanks -> null
create or replace function public.prepare_resident()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.phone := nullif(public.normalize_ph_phone(new.phone), '');
  new.email := nullif(lower(btrim(coalesce(new.email, ''))), '');
  new.name  := btrim(coalesce(new.name, ''));
  new.area  := coalesce(nullif(btrim(new.area), ''), 'Barangay Pamplona 3');
  if tg_op = 'INSERT' and (select auth.uid()) is not null then
    new.created_by := (select auth.uid());
  end if;
  return new;
end;
$$;

-- Bulk import that skips anything already listed (same phone OR same email).
-- Runs with the caller's rights, so the residents RLS policies still apply.
create or replace function public.import_residents(rows jsonb, target_area text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  inserted integer;
begin
  insert into public.residents (name, phone, email, area)
  select
    coalesce(r.name, ''),
    r.phone,
    r.email,
    coalesce(nullif(btrim(target_area), ''), 'Barangay Pamplona 3')
  from jsonb_to_recordset(rows) as r(name text, phone text, email text)
  on conflict do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke all on function public.import_residents(jsonb, text) from public, anon;
grant execute on function public.import_residents(jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Blasts: which channels were used and how each one went
--    SMS columns (status, recipients, error_message) are unchanged.
--    Email has its own: email_status, email_recipients, email_error.
-- ---------------------------------------------------------------------------

alter table public.sms_blasts
  add column if not exists send_sms         boolean not null default true,
  add column if not exists send_email       boolean not null default false,
  add column if not exists email_subject    text,
  add column if not exists email_status     text,
  add column if not exists email_recipients integer not null default 0,
  add column if not exists email_error      text;

-- 'Skipped' = SMS was not selected for this blast
alter table public.sms_blasts drop constraint if exists sms_blasts_status_check;
alter table public.sms_blasts
  add constraint sms_blasts_status_check
  check (status in ('Pending', 'Sending', 'Sent', 'Delivered', 'Failed', 'Skipped'))
  not valid;  -- validated at the end of 20261015000003_app_integration.sql

alter table public.sms_blasts drop constraint if exists sms_blasts_email_status_check;
alter table public.sms_blasts
  add constraint sms_blasts_email_status_check
  check (email_status is null or email_status in ('Pending', 'Sending', 'Sent', 'Failed'));

alter table public.sms_blasts drop constraint if exists sms_blasts_channel_check;
alter table public.sms_blasts
  add constraint sms_blasts_channel_check check (send_sms or send_email) not valid;  -- replaced in 20261015000003

alter table public.sms_blasts drop constraint if exists sms_blasts_subject_check;
alter table public.sms_blasts
  add constraint sms_blasts_subject_check check (email_subject is null or char_length(email_subject) <= 150);

-- Stamp sender and initial statuses from the session so the client can't spoof them
create or replace function public.stamp_sms_blast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.triggered_by := (select auth.uid());
    new.triggered_by_name := coalesce(
      (select name from public.profiles where id = (select auth.uid())), '');
    new.trigger_source := 'Manual';
    new.recipients := 0;
    new.error_message := null;
    new.status := case when new.send_sms then 'Pending' else 'Skipped' end;
    new.email_recipients := 0;
    new.email_error := null;
    new.email_status := case when new.send_email then 'Pending' else null end;
    new.email_subject := nullif(btrim(coalesce(new.email_subject, '')), '');
  end if;
  return new;
end;
$$;

create or replace function public.audit_sms_blast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (actor_id, action, resource, resource_id, details)
  values (
    new.triggered_by,
    'create',
    'sms_blast',
    new.id::text,
    jsonb_build_object(
      'level', new.level,
      'location', new.location,
      'source', new.trigger_source,
      'sms', new.send_sms,
      'email', new.send_email
    )
  );
  return null;
end;
$$;

-- A blast can be deleted only when nothing reached anyone on any channel it used
drop policy if exists "sms_blasts: staff delete failed" on public.sms_blasts;
create policy "sms_blasts: staff delete failed"
  on public.sms_blasts for delete
  to authenticated
  using (
    status in ('Failed', 'Skipped')
    and (email_status is null or email_status = 'Failed')
    and (select public.has_role('admin', 'operator'))
  );

create or replace function public.audit_sms_blast_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (actor_id, action, resource, resource_id, details)
  values (
    (select auth.uid()),
    'delete',
    'sms_blast',
    old.id::text,
    jsonb_build_object(
      'level', old.level,
      'location', old.location,
      'status', old.status,
      'email_status', old.email_status,
      'message', left(old.message, 200),
      'error', left(coalesce(old.error_message, ''), 300),
      'email_error', left(coalesce(old.email_error, ''), 300)
    )
  );
  return null;
end;
$$;

-- ===== migrations/20261015000001_delete_alert_logs.sql =====
-- FloodSense: let staff delete alert logs
--   * Admins can delete any alert that is not in the middle of sending.
--   * Operators can delete only alerts where nothing was delivered on any channel
--     (the rule from before).
--   * An alert stuck in "Sending" for over 10 minutes (e.g. a crashed function) can be deleted too.
-- Every deletion is written to audit_logs by the audit_sms_blast_delete trigger,
-- so the audit trail still shows what was sent and who removed it.

drop policy if exists "sms_blasts: staff delete failed" on public.sms_blasts;
drop policy if exists "sms_blasts: staff delete" on public.sms_blasts;

create policy "sms_blasts: staff delete"
  on public.sms_blasts for delete
  to authenticated
  using (
    (
      (status <> 'Sending' and coalesce(email_status, '') <> 'Sending')
      or created_at < now() - interval '10 minutes'
    )
    and (
      (select public.has_role('admin'))
      or (
        status in ('Failed', 'Skipped')
        and (email_status is null or email_status = 'Failed')
        and (select public.has_role('admin', 'operator'))
      )
    )
  );

-- ===== migrations/20261015000002_app_resident_sync.sql =====
-- FloodSense: keep the mobile app's resident columns in step with the website's
--
-- The mobile app (which shares this Supabase project) saves residents as
--   full_name, phone_number (+639XXXXXXXXX), address
-- while the website uses
--   name, phone (639XXXXXXXXX), area
-- Without this, a resident who registers in the app shows as "Unnamed" with no phone on the website,
-- and residents added on the website look incomplete to the app.
-- Safe to run whether or not the app's own residents.sql has been run.

alter table public.residents add column if not exists full_name    text;
alter table public.residents add column if not exists phone_number text;

create or replace function public.prepare_resident()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 1. Reconcile the two naming schemes -----------------------------------------------------
  if tg_op = 'INSERT' then
    -- Fill whichever side is empty from the other
    if nullif(btrim(coalesce(new.name, '')), '') is null then
      new.name := coalesce(btrim(new.full_name), '');
    end if;
    if nullif(btrim(coalesce(new.phone, '')), '') is null and new.phone_number is not null then
      new.phone := new.phone_number;
    end if;
  else
    -- On update, the side that changed wins
    if new.full_name is distinct from old.full_name and new.name is not distinct from old.name then
      new.name := coalesce(btrim(new.full_name), '');
    end if;
    if new.phone_number is distinct from old.phone_number and new.phone is not distinct from old.phone then
      new.phone := new.phone_number;
    end if;
  end if;

  -- 2. Normalise the website's columns ------------------------------------------------------
  new.phone := nullif(public.normalize_ph_phone(new.phone), '');
  new.email := nullif(lower(btrim(coalesce(new.email, ''))), '');
  new.name  := btrim(coalesce(new.name, ''));
  new.area  := coalesce(nullif(btrim(new.area), ''), 'Barangay Pamplona 3');

  -- 3. Mirror them into the app's columns ----------------------------------------------------
  if tg_op = 'INSERT' then
    if nullif(btrim(coalesce(new.full_name, '')), '') is null and new.name <> '' then
      new.full_name := new.name;
    end if;
    if new.phone_number is null and new.phone is not null then
      new.phone_number := '+' || new.phone;
    end if;
  else
    if new.name is distinct from old.name and new.full_name is not distinct from old.full_name then
      new.full_name := nullif(new.name, '');
    end if;
    if new.phone is distinct from old.phone and new.phone_number is not distinct from old.phone_number then
      new.phone_number := case when new.phone is null then null else '+' || new.phone end;
    end if;
  end if;

  -- created_by points at the staff profiles table, so only stamp it for staff (app residents have no profile)
  if tg_op = 'INSERT' and new.created_by is null
     and exists (select 1 from public.profiles where id = (select auth.uid())) then
    new.created_by := (select auth.uid());
  end if;
  return new;
end;
$$;

-- Fix residents the app already saved: copy the app's name and phone into the website's columns
-- (skipping a phone that another resident already has, to respect the unique constraint)
update public.residents r
   set name = btrim(r.full_name)
 where btrim(coalesce(r.name, '')) = ''
   and nullif(btrim(coalesce(r.full_name, '')), '') is not null;

update public.residents r
   set phone = r.phone_number
 where r.phone is null
   and r.phone_number is not null
   and public.normalize_ph_phone(r.phone_number) ~ '^639[0-9]{9}$'
   and not exists (
     select 1 from public.residents o
      where o.id <> r.id and o.phone = public.normalize_ph_phone(r.phone_number)
   );

-- ===== migrations/20261015000003_app_integration.sql =====
-- FloodSense: make the website and the mobile app share one Supabase project cleanly
--   1. Residents who sign up in the app no longer get a staff profile
--   2. A resident who registers in the app after staff added them is merged, not rejected
--   3. Website alerts can also go to the app (its `alerts` table + push notifications)
--
-- IMPORTANT: redeploy the `admin-users` and `bootstrap-admin` functions BEFORE running this.
-- The new versions mark staff accounts; without them, staff created after this migration
-- would have no profile.
-- The mobile app's own SQL (alerts.sql / residents.sql) must already have been run.

-- ===========================================================================
-- 1. Only staff accounts get a profile
-- ===========================================================================
-- app_metadata can be set only by server code (the admin-users / bootstrap-admin functions),
-- so a resident signing up in the app can never mark themselves as staff.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.raw_app_meta_data ->> 'kind', '') <> 'staff' then
    return new;
  end if;

  insert into public.profiles (id, email, name, phone, location, status)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    coalesce(new.raw_user_meta_data ->> 'location', ''),
    'Inactive'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Remove the staff entries that mobile-app sign-ups left behind.
-- Staff made on the website (User Management or /setup) are always recorded in audit_logs with a
-- 'create' or 'bootstrap-admin' entry; app sign-ups never are. So a viewer with no such record
-- that has never signed in to the dashboard (or is still Inactive) is an app account, not staff.
-- Admins and operators are never touched. The login itself is kept; it just has no dashboard role.
delete from public.profiles p
 where p.role = 'viewer'
   and (p.status = 'Inactive' or p.last_active is null)
   and not exists (
     select 1 from public.audit_logs a
      where a.resource = 'profile'
        and a.resource_id = p.id::text
        and a.action in ('create', 'bootstrap-admin')
   );

-- Residents saved by the app have no staff profile, so the "created by" stamp must not point at them
-- (corrected copy of the function from 20261015000002_app_resident_sync.sql)
create or replace function public.prepare_resident()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 1. Reconcile the two naming schemes -----------------------------------------------------
  if tg_op = 'INSERT' then
    -- Fill whichever side is empty from the other
    if nullif(btrim(coalesce(new.name, '')), '') is null then
      new.name := coalesce(btrim(new.full_name), '');
    end if;
    if nullif(btrim(coalesce(new.phone, '')), '') is null and new.phone_number is not null then
      new.phone := new.phone_number;
    end if;
  else
    -- On update, the side that changed wins
    if new.full_name is distinct from old.full_name and new.name is not distinct from old.name then
      new.name := coalesce(btrim(new.full_name), '');
    end if;
    if new.phone_number is distinct from old.phone_number and new.phone is not distinct from old.phone then
      new.phone := new.phone_number;
    end if;
  end if;

  -- 2. Normalise the website's columns ------------------------------------------------------
  new.phone := nullif(public.normalize_ph_phone(new.phone), '');
  new.email := nullif(lower(btrim(coalesce(new.email, ''))), '');
  new.name  := btrim(coalesce(new.name, ''));
  new.area  := coalesce(nullif(btrim(new.area), ''), 'Barangay Pamplona 3');

  -- 3. Mirror them into the app's columns ----------------------------------------------------
  if tg_op = 'INSERT' then
    if nullif(btrim(coalesce(new.full_name, '')), '') is null and new.name <> '' then
      new.full_name := new.name;
    end if;
    if new.phone_number is null and new.phone is not null then
      new.phone_number := '+' || new.phone;
    end if;
  else
    if new.name is distinct from old.name and new.full_name is not distinct from old.full_name then
      new.full_name := nullif(new.name, '');
    end if;
    if new.phone is distinct from old.phone and new.phone_number is not distinct from old.phone_number then
      new.phone_number := case when new.phone is null then null else '+' || new.phone end;
    end if;
  end if;

  -- created_by points at the staff profiles table, so only stamp it for staff (app residents have no profile)
  if tg_op = 'INSERT' and new.created_by is null
     and exists (select 1 from public.profiles where id = (select auth.uid())) then
    new.created_by := (select auth.uid());
  end if;
  return new;
end;
$$;

-- ===========================================================================
-- 2. Merge an app registration into a resident staff already added
-- ===========================================================================
-- Staff add residents with a random id; the app saves its own row with id = the user's login id.
-- If the email or phone already exists, the unique rules would reject the app's registration.
-- Instead, re-link the existing row to the new login and take the app's details.

alter table public.residents add column if not exists address text;

create or replace function public.merge_app_resident()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  me           uuid := (select auth.uid());
  new_email    text := nullif(lower(btrim(coalesce(new.email, ''))), '');
  new_phone    text := nullif(public.normalize_ph_phone(coalesce(nullif(new.phone, ''), new.phone_number)), '');
  existing_id  uuid;
  email_free   boolean;
  phone_free   boolean;
begin
  -- Only a signed-in user saving their own row (the app's registration), never staff inserts
  if me is null or new.id is distinct from me then
    return new;
  end if;
  -- Already registered: the app's normal upsert handles it
  if exists (select 1 from public.residents where id = new.id) then
    return new;
  end if;

  select r.id into existing_id
    from public.residents r
   where r.id <> new.id
     and ((new_email is not null and r.email = new_email)
       or (new_phone is not null and r.phone = new_phone))
   order by (new_email is not null and r.email = new_email) desc
   limit 1;

  if existing_id is null then
    return new;
  end if;

  -- Take the app's email/phone only if no other resident already uses them
  email_free := new_email is not null and not exists (
    select 1 from public.residents o where o.id not in (existing_id, new.id) and o.email = new_email);
  phone_free := new_phone is not null and not exists (
    select 1 from public.residents o where o.id not in (existing_id, new.id) and o.phone = new_phone);

  update public.residents r
     set id           = new.id,
         email        = case when email_free then new_email else r.email end,
         full_name    = coalesce(nullif(btrim(coalesce(new.full_name, '')), ''), r.full_name),
         phone_number = case when phone_free then '+' || new_phone else r.phone_number end,
         address      = coalesce(nullif(btrim(coalesce(new.address, '')), ''), r.address)
   where r.id = existing_id;

  return null;  -- the existing row now belongs to this login; skip the duplicate insert
end;
$$;

-- Fires before prepare_resident (triggers run in name order), and skips it when it merges
drop trigger if exists merge_app_resident on public.residents;
create trigger merge_app_resident
  before insert on public.residents
  for each row execute function public.merge_app_resident();

-- ===========================================================================
-- 3. Website alerts -> mobile app (the app's `alerts` table + its push trigger)
-- ===========================================================================

alter table public.sms_blasts
  add column if not exists send_app       boolean not null default false,
  add column if not exists app_status     text,
  add column if not exists app_recipients integer not null default 0,
  add column if not exists app_error      text;

alter table public.sms_blasts drop constraint if exists sms_blasts_app_status_check;
alter table public.sms_blasts
  add constraint sms_blasts_app_status_check
  check (app_status is null or app_status in ('Pending', 'Sent', 'Failed'));

alter table public.sms_blasts drop constraint if exists sms_blasts_channel_check;
alter table public.sms_blasts
  add constraint sms_blasts_channel_check check (send_sms or send_email or send_app);

-- The status rule (set in 20261015000000) is checked against all existing rows once, here
alter table public.sms_blasts validate constraint sms_blasts_status_check;

create or replace function public.stamp_sms_blast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.triggered_by := (select auth.uid());
    new.triggered_by_name := coalesce(
      (select name from public.profiles where id = (select auth.uid())), '');
    new.trigger_source := 'Manual';
    new.recipients := 0;
    new.error_message := null;
    new.status := case when new.send_sms then 'Pending' else 'Skipped' end;
    new.email_recipients := 0;
    new.email_error := null;
    new.email_status := case when new.send_email then 'Pending' else null end;
    new.email_subject := nullif(btrim(coalesce(new.email_subject, '')), '');
    new.app_recipients := 0;
    new.app_error := null;
    new.app_status := case when new.send_app then 'Pending' else null end;
  end if;
  return new;
end;
$$;

-- After a blast with the App channel is saved, add it to the app's alerts list. The app's own
-- trigger (alerts_send_push) then pushes it to every registered phone. Push reaches ALL registered
-- phones: the app has no per-area targeting.
create or replace function public.push_blast_to_app()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  label   text := case new.level when 'CRITICAL' then 'Critical alert' when 'WARNING' then 'Flood warning' else 'Information' end;
  devices integer;
begin
  if not new.send_app then
    return null;
  end if;

  begin
    insert into public.alerts (type, title, message)
    values (
      case new.level when 'INFO' then 'info' else 'warning' end,
      left(label || ': ' || new.location, 120),
      left(new.message, 500)
    );
    select count(*) into devices from public.push_tokens;
    update public.sms_blasts set app_status = 'Sent', app_recipients = devices where id = new.id;
  exception when others then
    update public.sms_blasts set app_status = 'Failed', app_error = left(sqlerrm, 300) where id = new.id;
  end;
  return null;
end;
$$;

drop trigger if exists push_blast_to_app on public.sms_blasts;
create trigger push_blast_to_app
  after insert on public.sms_blasts
  for each row execute function public.push_blast_to_app();

-- Staff can see how many phones are registered for push notifications
create or replace function public.count_app_devices()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.has_role('admin', 'operator') then (select count(*)::integer from public.push_tokens)
    else 0
  end;
$$;

revoke all on function public.count_app_devices() from public, anon;
grant execute on function public.count_app_devices() to authenticated;

create or replace function public.audit_sms_blast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (actor_id, action, resource, resource_id, details)
  values (
    new.triggered_by,
    'create',
    'sms_blast',
    new.id::text,
    jsonb_build_object(
      'level', new.level,
      'location', new.location,
      'source', new.trigger_source,
      'sms', new.send_sms,
      'email', new.send_email,
      'app', new.send_app
    )
  );
  return null;
end;
$$;

-- A blast can be deleted only when nothing was delivered on any channel it used
-- (admins can delete any alert that is not mid-send)
drop policy if exists "sms_blasts: staff delete" on public.sms_blasts;
create policy "sms_blasts: staff delete"
  on public.sms_blasts for delete
  to authenticated
  using (
    (
      (status <> 'Sending' and coalesce(email_status, '') <> 'Sending')
      or created_at < now() - interval '10 minutes'
    )
    and (
      (select public.has_role('admin'))
      or (
        status in ('Failed', 'Skipped')
        and (email_status is null or email_status = 'Failed')
        and (app_status is null or app_status = 'Failed')
        and (select public.has_role('admin', 'operator'))
      )
    )
  );

create or replace function public.audit_sms_blast_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (actor_id, action, resource, resource_id, details)
  values (
    (select auth.uid()),
    'delete',
    'sms_blast',
    old.id::text,
    jsonb_build_object(
      'level', old.level,
      'location', old.location,
      'status', old.status,
      'email_status', old.email_status,
      'app_status', old.app_status,
      'message', left(old.message, 200),
      'error', left(coalesce(old.error_message, ''), 300),
      'email_error', left(coalesce(old.email_error, ''), 300),
      'app_error', left(coalesce(old.app_error, ''), 300)
    )
  );
  return null;
end;
$$;

-- ===== migrations/20261022000000_staff_resident_separation.sql =====
-- FloodSense: keep staff and residents strictly apart
--   * Staff (admins, operators, viewers) live in User Management (the profiles table).
--   * Residents live on the Residents page (the residents table).
--   * A staff account never appears in the Residents list and never receives resident alerts.
--   * Staff emails can't be added as residents.
--
-- Requires 20261015000003_app_integration.sql first: it stops residents from getting a staff
-- profile and removes the leftovers. Run setup-all.sql (everything, in order) to be safe.

do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'merge_app_resident') then
    raise exception 'Run 20261015000003_app_integration.sql before this migration (or run setup-all.sql).';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Is this login id / email a staff account?
-- ---------------------------------------------------------------------------
create or replace function public.is_staff_account(p_id uuid, p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles p
     where (p_id is not null and p.id = p_id)
        or (nullif(btrim(coalesce(p_email, '')), '') is not null and lower(p.email) = lower(btrim(p_email)))
  );
$$;

revoke all on function public.is_staff_account(uuid, text) from public, anon;
grant execute on function public.is_staff_account(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The Residents page: every resident except staff accounts
-- ---------------------------------------------------------------------------
create or replace function public.list_residents()
returns setof public.residents
language sql
stable
security definer
set search_path = ''
as $$
  select r.*
    from public.residents r
   where public.has_role('admin', 'operator')
     and not public.is_staff_account(r.id, r.email);
$$;

revoke all on function public.list_residents() from public, anon;
grant execute on function public.list_residents() to authenticated;

-- ---------------------------------------------------------------------------
-- How many residents an alert would reach (staff are never counted)
-- ---------------------------------------------------------------------------
create or replace function public.count_alert_recipients(p_area text, p_channel text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.has_role('admin', 'operator') then (
      select count(*)::integer
        from public.residents r
       where r.is_active
         and r.is_verified
         and (p_area = 'All Residents' or r.area = p_area)
         and ((p_channel = 'sms' and r.phone is not null) or (p_channel = 'email' and r.email is not null))
         and not public.is_staff_account(r.id, r.email)
    )
    else 0
  end;
$$;

revoke all on function public.count_alert_recipients(text, text) from public, anon;
grant execute on function public.count_alert_recipients(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- A staff email can't be saved as a resident (website or app registration)
-- ---------------------------------------------------------------------------
create or replace function public.reject_staff_resident()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_staff_account(new.id, new.email) then
    raise exception 'This email belongs to a staff account. Staff are managed in User Management, not Residents.';
  end if;
  return new;
end;
$$;

-- "a_" so it runs before the other triggers on residents
drop trigger if exists a_reject_staff_resident on public.residents;
create trigger a_reject_staff_resident
  before insert or update of email, id on public.residents
  for each row execute function public.reject_staff_resident();

-- ---------------------------------------------------------------------------
-- Bulk import: skip staff emails along with entries already in the list
-- ---------------------------------------------------------------------------
create or replace function public.import_residents(rows jsonb, target_area text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  inserted integer;
begin
  insert into public.residents (name, phone, email, area)
  select
    coalesce(r.name, ''),
    r.phone,
    r.email,
    coalesce(nullif(btrim(target_area), ''), 'Barangay Pamplona 3')
  from jsonb_to_recordset(rows) as r(name text, phone text, email text)
  where not public.is_staff_account(null, r.email)
  on conflict do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke all on function public.import_residents(jsonb, text) from public, anon;
grant execute on function public.import_residents(jsonb, text) to authenticated;


-- ===== migrations/20261024000000_sensors.sql =====
-- FloodSense: live sensor readings
--   * sensors          one row per physical sensor, holding its latest reading
--   * sensor_readings  history of readings (kept 7 days)
--   * sensor_settings  the secret key a sensor must send; never readable from the website
--   * report_sensor_reading()  what the ESP32/ESP8266 calls to send a reading. It registers the
--     sensor on its first report, so no manual setup is needed per device.
-- Safe to run more than once.

create table if not exists public.sensors (
  id           text primary key check (id ~ '^[A-Za-z0-9_-]{1,40}$'),
  name         text not null,
  type         text not null default 'water' check (type in ('water', 'rainfall', 'wind', 'temperature')),
  location     text not null default 'Barangay Pamplona 3',
  reading      numeric,
  unit         text not null default 'cm',
  battery      integer check (battery between 0 and 100),
  warn_level   numeric not null default 30,
  danger_level numeric not null default 60,
  last_seen    timestamptz,
  created_at   timestamptz not null default now()
);

create table if not exists public.sensor_readings (
  id         bigint generated always as identity primary key,
  sensor_id  text not null references public.sensors (id) on delete cascade,
  value      numeric not null,
  battery    integer,
  created_at timestamptz not null default now()
);

create index if not exists sensor_readings_sensor_time_idx
  on public.sensor_readings (sensor_id, created_at desc);

-- One row holding the device key. RLS is on with no policies, so only the database itself
-- (the function below) can read it. Find your key with:  select ingest_key from public.sensor_settings;
create table if not exists public.sensor_settings (
  id         boolean primary key default true check (id),
  ingest_key text not null default replace(gen_random_uuid()::text, '-', '')
);
insert into public.sensor_settings (id) values (true) on conflict do nothing;

alter table public.sensors enable row level security;
alter table public.sensor_readings enable row level security;
alter table public.sensor_settings enable row level security;
revoke all on public.sensor_settings from anon, authenticated;

drop policy if exists "sensors: staff read" on public.sensors;
create policy "sensors: staff read"
  on public.sensors for select to authenticated
  using ((select public.has_role('admin', 'operator', 'viewer')));

drop policy if exists "sensors: staff update" on public.sensors;
create policy "sensors: staff update"
  on public.sensors for update to authenticated
  using ((select public.has_role('admin', 'operator')))
  with check ((select public.has_role('admin', 'operator')));

drop policy if exists "sensors: admin delete" on public.sensors;
create policy "sensors: admin delete"
  on public.sensors for delete to authenticated
  using ((select public.has_role('admin')));

drop policy if exists "sensor_readings: staff read" on public.sensor_readings;
create policy "sensor_readings: staff read"
  on public.sensor_readings for select to authenticated
  using ((select public.has_role('admin', 'operator', 'viewer')));

-- ---------------------------------------------------------------------------
-- Called by the sensor over HTTPS: POST /rest/v1/rpc/report_sensor_reading
-- ---------------------------------------------------------------------------
create or replace function public.report_sensor_reading(
  p_key       text,
  p_sensor_id text,
  p_value     numeric,
  p_battery   integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_key is null or p_key is distinct from (select ingest_key from public.sensor_settings limit 1) then
    raise exception 'invalid device key' using errcode = '28000';
  end if;
  if p_sensor_id is null or p_sensor_id !~ '^[A-Za-z0-9_-]{1,40}$' then
    raise exception 'invalid sensor id' using errcode = '22023';
  end if;
  if p_value is null or p_value < -1000 or p_value > 100000 then
    raise exception 'invalid reading' using errcode = '22023';
  end if;

  insert into public.sensors (id, name, reading, battery, last_seen)
  values (p_sensor_id, p_sensor_id, p_value, p_battery, now())
  on conflict (id) do update
    set reading   = excluded.reading,
        battery   = coalesce(excluded.battery, public.sensors.battery),
        last_seen = excluded.last_seen;

  insert into public.sensor_readings (sensor_id, value, battery)
  values (p_sensor_id, p_value, p_battery);

  -- Housekeeping: now and then, drop history older than a week.
  if random() < 0.01 then
    delete from public.sensor_readings where created_at < now() - interval '7 days';
  end if;
end;
$$;

revoke all on function public.report_sensor_reading(text, text, numeric, integer) from public;
grant execute on function public.report_sensor_reading(text, text, numeric, integer) to anon, authenticated;

-- Realtime: the website updates the moment a reading arrives.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sensors'
  ) then
    alter publication supabase_realtime add table public.sensors;
  end if;
end;
$$;
