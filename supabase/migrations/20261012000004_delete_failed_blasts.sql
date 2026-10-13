-- FloodSense: let staff delete failed SMS blasts
-- Only blasts with status 'Failed' (nothing reached any resident) can be deleted;
-- sent and pending blasts stay as a permanent record. Each deletion is audited.

drop policy if exists "sms_blasts: staff delete failed" on public.sms_blasts;
create policy "sms_blasts: staff delete failed"
  on public.sms_blasts for delete
  to authenticated
  using (status = 'Failed' and (select public.has_role('admin', 'operator')));

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
      'message', left(old.message, 200),
      'error', left(coalesce(old.error_message, ''), 300)
    )
  );
  return null;
end;
$$;

drop trigger if exists audit_sms_blast_delete on public.sms_blasts;
create trigger audit_sms_blast_delete
  after delete on public.sms_blasts
  for each row execute function public.audit_sms_blast_delete();
