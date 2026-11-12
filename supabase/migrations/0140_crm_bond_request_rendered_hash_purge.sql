-- Clear the template A render hash on every path that clears the request contact.
-- That is 7 days after a sent template A, 14 days after the request, and 24 hours
-- after a failed, no_contact, or failed:no_sender request. Any row whose
-- consumer_cleared_at is set also loses the template A hash. Erase clears the
-- hash in the same step as the contact. A later mark stores a null template A
-- hash once the contact is cleared or the status is erased.
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
      h.consumer_cleared_at is not null
      or (h.status = 'sent' and s.status = 'sent' and s.sent_at <= v_cutoff - interval '7 days')
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
  'Clears consumer fields on the retention windows, and clears the template A render hash on the 7 day send window, the 14 day maximum, the 24 hour failed, no_contact, and failed:no_sender path, and any row whose consumer_cleared_at is set. Template B hashes stay. Then deletes the non-personal row, the send log, the audit rows, and alert rows 12 months old. Uses least of the caller clock and the server clock. Not scheduled.';

revoke all on function public.crm_purge_bond_request_handoffs(timestamptz) from public, anon, authenticated;
grant execute on function public.crm_purge_bond_request_handoffs(timestamptz) to service_role;

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
  update public.crm_bond_request_send_log
  set rendered_sha256 = null
  where handoff_id = p_handoff_id
    and template = 'A';
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
declare
  v_hash text := p_rendered_sha256;
  v_cleared boolean := false;
begin
  if p_status not in ('sent', 'no_contact', 'failed', 'failed:no_sender') then
    return pg_catalog.jsonb_build_object('ok', false);
  end if;
  if p_template = 'A' then
    select status = 'erased' or member_contact is null or consumer_cleared_at is not null
      into v_cleared
      from public.crm_bond_request_handoffs
      where handoff_id = p_handoff_id;
    if v_cleared then
      v_hash := null;
    end if;
  end if;
  if p_template in ('A', 'B') and p_template_version is not null and (v_hash is not null or (p_template = 'A' and v_cleared and p_rendered_sha256 is not null)) then
    insert into public.crm_bond_request_send_log (handoff_id, template, template_version, rendered_sha256, provider_message_id, sent_at, status)
    values (p_handoff_id, p_template, p_template_version, v_hash, p_provider_message_id, case when p_status = 'sent' then pg_catalog.now() else null end, p_status);
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

revoke all on function public.crm_erase_bond_request_handoff(uuid) from public, anon, authenticated;
grant execute on function public.crm_erase_bond_request_handoff(uuid) to service_role;
revoke all on function public.crm_mark_bond_request_handoff(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.crm_mark_bond_request_handoff(uuid, text, text, text, text, text) to service_role;
