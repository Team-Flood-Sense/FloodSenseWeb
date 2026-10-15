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
