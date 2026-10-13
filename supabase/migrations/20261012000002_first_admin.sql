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
