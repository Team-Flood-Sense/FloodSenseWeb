-- FloodSense: let staff delete alert logs
--   * Admins can delete any alert that is not in the middle of sending.
--   * Operators can delete only alerts where nothing was delivered on any channel
--     (the rule from before).
--   * An alert stuck in "Sending" for over 10 minutes (e.g. a crashed function) can be deleted too.
-- Every deletion is written to audit_logs by the audit_sms_blast_delete trigger,
-- so the audit trail still shows what was sent and who removed it.

drop policy if exists "sms_blasts: staff delete failed" on public.sms_blasts;
drop policy if exists "sms_blasts: staff delete" on public.sms_blasts;

create policy "sms_blasts: staff delete"
  on public.sms_blasts for delete
  to authenticated
  using (
    (
      (status <> 'Sending' and coalesce(email_status, '') <> 'Sending')
      or created_at < now() - interval '10 minutes'
    )
    and (
      (select public.has_role('admin'))
      or (
        status in ('Failed', 'Skipped')
        and (email_status is null or email_status = 'Failed')
        and (select public.has_role('admin', 'operator'))
      )
    )
  );
