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
