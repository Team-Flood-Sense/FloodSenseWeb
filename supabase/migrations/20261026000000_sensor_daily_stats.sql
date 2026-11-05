-- FloodSense: long-term daily summaries for the Analytics reports
-- Raw sensor_readings are kept for only 7 days, so weekly/monthly/yearly reports are built from
-- one summary row per sensor per day (Philippine time). Every reading updates today's row.
-- Safe to run more than once. Run after 20261024000000_sensors.sql.

create table if not exists public.sensor_daily_stats (
  sensor_id      text not null references public.sensors (id) on delete cascade,
  day            date not null,
  peak           numeric not null,   -- highest level that day
  low            numeric not null,   -- lowest level that day
  sum_value      numeric not null,   -- with readings, gives the average
  readings       integer not null,
  warn_seconds   integer not null default 0,   -- time at or above the warning level
  danger_seconds integer not null default 0,   -- time at or above the danger level
  primary key (sensor_id, day)
);

create index if not exists sensor_daily_stats_day_idx on public.sensor_daily_stats (day);

alter table public.sensor_daily_stats enable row level security;

drop policy if exists "sensor_daily_stats: staff read" on public.sensor_daily_stats;
create policy "sensor_daily_stats: staff read"
  on public.sensor_daily_stats for select to authenticated
  using ((select public.has_role('admin', 'operator', 'viewer')));

-- Admins can clear summaries (for example test data from a simulated sensor).
drop policy if exists "sensor_daily_stats: admin delete" on public.sensor_daily_stats;
create policy "sensor_daily_stats: admin delete"
  on public.sensor_daily_stats for delete to authenticated
  using ((select public.has_role('admin')));

-- ---------------------------------------------------------------------------
-- Same function as before, now also keeping the daily summary
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
declare
  prev_seen timestamptz;
  warn      numeric;
  danger    numeric;
  gap       integer;
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

  select last_seen into prev_seen from public.sensors where id = p_sensor_id;

  insert into public.sensors (id, name, reading, battery, last_seen)
  values (p_sensor_id, p_sensor_id, p_value, p_battery, now())
  on conflict (id) do update
    set reading   = excluded.reading,
        battery   = coalesce(excluded.battery, public.sensors.battery),
        last_seen = excluded.last_seen;

  insert into public.sensor_readings (sensor_id, value, battery)
  values (p_sensor_id, p_value, p_battery);

  select warn_level, danger_level into warn, danger from public.sensors where id = p_sensor_id;

  -- Time since the previous reading (capped at 5 minutes, so an outage isn't counted as flooding)
  gap := case when prev_seen is null then 0
              else least(extract(epoch from now() - prev_seen), 300)::integer end;

  insert into public.sensor_daily_stats
    (sensor_id, day, peak, low, sum_value, readings, warn_seconds, danger_seconds)
  values (
    p_sensor_id,
    (now() at time zone 'Asia/Manila')::date,
    p_value, p_value, p_value, 1,
    case when p_value >= warn then gap else 0 end,
    case when p_value >= danger then gap else 0 end
  )
  on conflict (sensor_id, day) do update
    set peak           = greatest(public.sensor_daily_stats.peak, excluded.peak),
        low            = least(public.sensor_daily_stats.low, excluded.low),
        sum_value      = public.sensor_daily_stats.sum_value + excluded.sum_value,
        readings       = public.sensor_daily_stats.readings + 1,
        warn_seconds   = public.sensor_daily_stats.warn_seconds + excluded.warn_seconds,
        danger_seconds = public.sensor_daily_stats.danger_seconds + excluded.danger_seconds;

  -- Housekeeping: now and then, drop raw history older than a week (daily summaries stay).
  if random() < 0.01 then
    delete from public.sensor_readings where created_at < now() - interval '7 days';
  end if;
end;
$$;

revoke all on function public.report_sensor_reading(text, text, numeric, integer) from public;
grant execute on function public.report_sensor_reading(text, text, numeric, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- One-time backfill from readings already stored. Durations are approximate
-- (10 seconds per reading); days that already have a summary are left alone.
-- ---------------------------------------------------------------------------
insert into public.sensor_daily_stats
  (sensor_id, day, peak, low, sum_value, readings, warn_seconds, danger_seconds)
select
  r.sensor_id,
  (r.created_at at time zone 'Asia/Manila')::date,
  max(r.value), min(r.value), sum(r.value), count(*),
  (count(*) filter (where r.value >= s.warn_level) * 10)::integer,
  (count(*) filter (where r.value >= s.danger_level) * 10)::integer
from public.sensor_readings r
join public.sensors s on s.id = r.sensor_id
group by r.sensor_id, (r.created_at at time zone 'Asia/Manila')::date
on conflict (sensor_id, day) do nothing;
