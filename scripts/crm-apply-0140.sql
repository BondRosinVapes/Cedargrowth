-- Apply 0140 as one transaction. No psql meta commands.
-- Run only after 0139. This repository does not run it.
begin;

-- Clear the template A render hash on the same window that clears the request contact.
-- The hash is an unkeyed digest of text that contains the consumer name and contact.
-- Template B rows are left as stored. No new key is added. Not scheduled.
-- Apply 0139 first. This file does not change 0139.

do $$
begin
  if to_regclass('public.crm_bond_request_send_log') is null
     or to_regprocedure('public.crm_purge_bond_request_handoffs(timestamptz)') is null
     or to_regprocedure('public.crm_receive_bond_request_handoff(jsonb)') is null then
    raise exception '0139 is not applied. crm_bond_request_send_log or crm_purge_bond_request_handoffs is missing. Apply 0139 before 0140.';
  end if;
end $$;

alter table public.crm_bond_request_send_log alter column rendered_sha256 drop not null;

create index if not exists crm_bond_request_send_log_handoff_id_idx
  on public.crm_bond_request_send_log (handoff_id);

create index if not exists crm_bond_request_audit_handoff_id_idx
  on public.crm_bond_request_audit (handoff_id);

create index if not exists crm_bond_request_handoffs_received_at_idx
  on public.crm_bond_request_handoffs (received_at);

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
  update public.crm_bond_request_send_log s
  set rendered_sha256 = null
  from public.crm_bond_request_handoffs h
  where s.handoff_id = h.handoff_id
    and s.template = 'A'
    and s.rendered_sha256 is not null
    and (
      (h.status = 'sent' and s.status = 'sent' and s.sent_at <= v_cutoff - interval '7 days')
      or h.received_at <= v_cutoff - interval '14 days'
      or (h.status in ('no_contact', 'failed', 'failed:no_sender') and h.received_at <= v_cutoff - interval '24 hours')
    );
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
  'Clears consumer fields on the retention windows, and clears the template A render hash on the 7 day send window and the 14 day maximum. Template B hashes stay. Then deletes the non-personal row, the send log, the audit rows, and alert rows 12 months old. Uses least of the caller clock and the server clock. Not scheduled.';

revoke all on function public.crm_purge_bond_request_handoffs(timestamptz) from public, anon, authenticated;
grant execute on function public.crm_purge_bond_request_handoffs(timestamptz) to service_role;

commit;
