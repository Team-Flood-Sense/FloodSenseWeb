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
