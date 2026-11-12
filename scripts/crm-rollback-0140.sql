-- Roll back only the 0140 purge change. Do not run this from the app.
-- The column stays nullable because a cleared hash cannot be put back.
-- The purge function is restored to the 0139 body.

begin;

create or replace function public.crm_purge_bond_request_handoffs(p_now timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_cutoff timestamptz := least(p_now, pg_catalog.now());
  v_cleared integer := 0;
  v_purged integer := 0;
begin
  update public.crm_bond_request_handoffs h
  set member_first_name = null,
      member_contact = null,
      contact_kind = null,
      bond_request_id = null,
      consumer_cleared_at = v_cutoff
  where h.consumer_cleared_at is null
    and (
      (h.status = 'sent' and exists (
        select 1 from public.crm_bond_request_send_log s
        where s.handoff_id = h.handoff_id and s.template = 'A' and s.status = 'sent'
          and s.sent_at <= v_cutoff - interval '7 days'
      ))
      or h.received_at <= v_cutoff - interval '14 days'
      or (h.status in ('no_contact', 'failed', 'failed:no_sender') and h.received_at <= v_cutoff - interval '24 hours')
    );
  get diagnostics v_cleared = row_count;
  delete from public.crm_bond_request_send_log
  where handoff_id in (
    select handoff_id from public.crm_bond_request_handoffs
    where received_at <= v_cutoff - interval '12 months'
  );
  delete from public.crm_bond_request_audit
  where handoff_id in (
    select handoff_id from public.crm_bond_request_handoffs
    where received_at <= v_cutoff - interval '12 months'
  );
  delete from public.crm_bond_request_handoffs
  where received_at <= v_cutoff - interval '12 months';
  get diagnostics v_purged = row_count;
  delete from public.crm_bond_request_alerts
  where created_at <= v_cutoff - interval '12 months';
  return pg_catalog.jsonb_build_object('ok', true, 'cleared', v_cleared, 'purged', v_purged);
end;
$$;

comment on function public.crm_purge_bond_request_handoffs(timestamptz) is
  'Clears consumer fields on the retention windows, then deletes the non-personal row, the send log, the audit rows, and alert rows 12 months old. Uses least of the caller clock and the server clock. Not scheduled.';

revoke all on function public.crm_purge_bond_request_handoffs(timestamptz) from public, anon, authenticated;
grant execute on function public.crm_purge_bond_request_handoffs(timestamptz) to service_role;

drop index if exists public.crm_bond_request_send_log_handoff_id_idx;
drop index if exists public.crm_bond_request_audit_handoff_id_idx;
drop index if exists public.crm_bond_request_handoffs_received_at_idx;

commit;
