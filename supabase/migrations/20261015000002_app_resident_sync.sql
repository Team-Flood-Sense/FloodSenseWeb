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
