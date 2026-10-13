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
