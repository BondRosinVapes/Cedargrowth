-- Roll back only the 0140 changes. Do not run this from the app.
-- Null every template A render hash first. The restored purge keeps a hash for 12 months,
-- so this file must not restore that function while a template A hash is still stored.
-- The column stays nullable because a cleared hash cannot be put back.
-- The purge, erase, and mark functions are restored to the 0139 bodies.

begin;

update public.crm_bond_request_send_log
set rendered_sha256 = null
where template = 'A'
  and rendered_sha256 is not null;

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

create or replace function public.crm_erase_bond_request_handoff(p_handoff_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_status text;
  v_sent boolean;
begin
  select status into v_status from public.crm_bond_request_handoffs where handoff_id = p_handoff_id;
  if not found then
    return pg_catalog.jsonb_build_object('status', null, 'withdrawal', false);
  end if;
  if v_status = 'erased' then
    return pg_catalog.jsonb_build_object('status', 'erased', 'withdrawal', false);
  end if;
  select exists (
    select 1 from public.crm_bond_request_send_log
    where handoff_id = p_handoff_id and template = 'A' and status = 'sent'
  ) or v_status = 'sent' into v_sent;
  update public.crm_bond_request_handoffs
  set member_first_name = null,
      member_contact = null,
      contact_kind = null,
      bond_request_id = null,
      consumer_cleared_at = pg_catalog.now(),
      erase_requested_at = pg_catalog.now(),
      erased_at = pg_catalog.now(),
      status = 'erased'
  where handoff_id = p_handoff_id;
  insert into public.crm_bond_request_audit (handoff_id, status) values (p_handoff_id, 'erased');
  return pg_catalog.jsonb_build_object('status', 'erased', 'withdrawal', v_sent);
end;
$$;

create or replace function public.crm_mark_bond_request_handoff(
  p_handoff_id uuid,
  p_status text,
  p_template text,
  p_template_version text,
  p_rendered_sha256 text,
  p_provider_message_id text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_status not in ('sent', 'no_contact', 'failed', 'failed:no_sender') then
    return pg_catalog.jsonb_build_object('ok', false);
  end if;
  if p_template in ('A', 'B') and p_template_version is not null and p_rendered_sha256 is not null then
    insert into public.crm_bond_request_send_log (handoff_id, template, template_version, rendered_sha256, provider_message_id, sent_at, status)
    values (p_handoff_id, p_template, p_template_version, p_rendered_sha256, p_provider_message_id, case when p_status = 'sent' then pg_catalog.now() else null end, p_status);
  end if;
  update public.crm_bond_request_handoffs
  set status = p_status
  where handoff_id = p_handoff_id and status <> 'erased';
  if found then
    insert into public.crm_bond_request_audit (handoff_id, status) values (p_handoff_id, p_status);
  end if;
  return pg_catalog.jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.crm_purge_bond_request_handoffs(timestamptz) from public, anon, authenticated;
grant execute on function public.crm_purge_bond_request_handoffs(timestamptz) to service_role;
revoke all on function public.crm_erase_bond_request_handoff(uuid) from public, anon, authenticated;
grant execute on function public.crm_erase_bond_request_handoff(uuid) to service_role;
revoke all on function public.crm_mark_bond_request_handoff(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.crm_mark_bond_request_handoff(uuid, text, text, text, text, text) to service_role;

drop index if exists public.crm_bond_request_send_log_handoff_id_idx;
drop index if exists public.crm_bond_request_audit_handoff_id_idx;
drop index if exists public.crm_bond_request_handoffs_received_at_idx;

commit;
