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
