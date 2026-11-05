-- FloodSense: app alerts are titled with the barangay office's name
-- Same function as before; only the title now starts with "BDRRMO Pamplona Tres".
-- Safe to run more than once. Run after 20261015000003_app_integration.sql.

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
      left('BDRRMO Pamplona Tres - ' || label || ': ' || new.location, 120),
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
