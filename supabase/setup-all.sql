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
  check (status in ('Pending', 'Sending', 'Sent', 'Delivered', 'Failed'));

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
  check (status in ('Pending', 'Sending', 'Sent', 'Delivered', 'Failed', 'Skipped'));

alter table public.sms_blasts drop constraint if exists sms_blasts_email_status_check;
alter table public.sms_blasts
  add constraint sms_blasts_email_status_check
  check (email_status is null or email_status in ('Pending', 'Sending', 'Sent', 'Failed'));

alter table public.sms_blasts drop constraint if exists sms_blasts_channel_check;
alter table public.sms_blasts
  add constraint sms_blasts_channel_check check (send_sms or send_email);

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
