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
