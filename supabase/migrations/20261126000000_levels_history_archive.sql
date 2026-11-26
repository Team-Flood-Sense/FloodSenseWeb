-- FloodSense: 1 ft / 2 ft sensor thresholds, archived accounts, sign-in history, hourly day details
-- Safe to run more than once. Run after 20261027000001_alert_sender_name.sql.

-- ---------------------------------------------------------------------------
-- 1. Thresholds in whole feet (levels are still stored in cm): warning 1 ft, critical 2 ft.
--    Only sensors still on the old 30 / 60 cm defaults are changed.
-- ---------------------------------------------------------------------------
alter table public.sensors
  alter column warn_level set default 30.48,
  alter column danger_level set default 60.96;

update public.sensors set warn_level = 30.48 where warn_level = 30;
update public.sensors set danger_level = 60.96 where danger_level = 60;

-- ---------------------------------------------------------------------------
-- 2. Staff accounts are archived, never deleted. has_role() only accepts 'Active',
--    so an archived account has no access.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists archived_at timestamptz;

alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles
  add constraint profiles_status_check check (status in ('Active', 'Inactive', 'Archived'));

drop policy if exists "profiles: admin deletes" on public.profiles;

-- ---------------------------------------------------------------------------
-- 3. Sign-in / sign-out history, kept in the audit log
-- ---------------------------------------------------------------------------
create or replace function public.log_session_event(p_event text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_event not in ('login', 'logout') then
    raise exception 'invalid event' using errcode = '22023';
  end if;
  -- Only fully signed-in (2FA verified), active staff are recorded
  if coalesce((select auth.jwt()) ->> 'aal', '') <> 'aal2'
     or not public.has_role('admin', 'operator', 'viewer') then
    return;
  end if;

  insert into public.audit_logs (actor_id, action, resource, resource_id, details)
  values ((select auth.uid()), p_event, 'session', (select auth.uid())::text, '{}'::jsonb);
end;
$$;

revoke all on function public.log_session_event(text) from public, anon;
grant execute on function public.log_session_event(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Hour-by-hour levels for one Philippine day (raw readings are kept for about 7 days).
--    Runs with the caller's rights, so the sensor_readings read policy applies.
-- ---------------------------------------------------------------------------
create or replace function public.sensor_hourly_levels(p_day date)
returns table (sensor_id text, hour integer, peak numeric, average numeric)
language sql
stable
set search_path = ''
as $$
  select r.sensor_id,
         extract(hour from r.created_at at time zone 'Asia/Manila')::integer,
         max(r.value),
         avg(r.value)
  from public.sensor_readings r
  where r.created_at >= (p_day::timestamp at time zone 'Asia/Manila')
    and r.created_at <  ((p_day + 1)::timestamp at time zone 'Asia/Manila')
  group by 1, 2
  order by 2, 1;
$$;

revoke all on function public.sensor_hourly_levels(date) from public, anon;
grant execute on function public.sensor_hourly_levels(date) to authenticated;
