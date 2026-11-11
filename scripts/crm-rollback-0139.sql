-- Roll back only what 0139 creates. Do not run this from the app.
-- Review it, then the only supported invocation is:
--   psql --single-transaction -v ON_ERROR_STOP=1 -f scripts/crm-rollback-0139.sql
-- Do not run this file with autocommit. This repository does not run it.
-- It restores crm_private.guard_account to the 0138 body, including source_event.
-- It does not drop source_event. That column belongs to 0138.

drop function if exists public.crm_bond_request_handoff_row(uuid);
drop function if exists public.crm_bond_request_purge_scheduled();
drop function if exists public.crm_bond_request_admin_view(text);
drop function if exists public.crm_bond_request_store_list(text);
drop function if exists public.crm_bond_request_store_list(text, text, double precision, double precision);
drop function if exists public.crm_purge_bond_request_handoffs(timestamptz);
drop function if exists public.crm_mark_bond_request_handoff(uuid, text, text, text, text, text);
drop function if exists public.crm_erase_bond_request_handoff(uuid);
drop function if exists public.crm_bond_request_handoff_status(uuid);
drop function if exists public.crm_receive_bond_request_handoff(jsonb);

drop table if exists public.crm_bond_request_purge_schedule;
drop table if exists public.crm_bond_request_alerts;
drop table if exists public.crm_bond_request_audit;
drop table if exists public.crm_bond_request_send_log;
drop table if exists public.crm_bond_request_handoffs;

create or replace function crm_private.guard_account()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.brand is distinct from old.brand then
    raise exception 'brand is immutable';
  end if;
  if tg_op = 'UPDATE' then
    if new.display_name is not distinct from old.display_name
       and new.status is not distinct from old.status
       and new.city is not distinct from old.city
       and new.county is not distinct from old.county
       and new.notes is not distinct from old.notes
       and new.license_ref is not distinct from old.license_ref
       and new.facility_ref is not distinct from old.facility_ref
       and new.license_jurisdiction is not distinct from old.license_jurisdiction
       and new.license_expiry is not distinct from old.license_expiry
       and new.assigned_rep is not distinct from old.assigned_rep
       and new.account_type is not distinct from old.account_type
       and new.lead_source is not distinct from old.lead_source
       and new.distributor is not distinct from old.distributor
       and new.distributor_account_ref is not distinct from old.distributor_account_ref
       and new.street is not distinct from old.street
       and new.state is not distinct from old.state
       and new.postal_code is not distinct from old.postal_code
       and new.consent_version is not distinct from old.consent_version
       and new.consent_received_at is not distinct from old.consent_received_at
       and new.intake_submitted_at is not distinct from old.intake_submitted_at
       and new.ocm_status is not distinct from old.ocm_status
       and new.record_marker is not distinct from old.record_marker
       and new.source_inquiry_id is not distinct from old.source_inquiry_id
       and new.latitude is not distinct from old.latitude
       and new.longitude is not distinct from old.longitude
       and new.geocode_source is not distinct from old.geocode_source
       and new.geocode_match is not distinct from old.geocode_match
       and new.geocoded_at is not distinct from old.geocoded_at
       and new.source_event is not distinct from old.source_event then
      return old;
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

revoke all on function crm_private.guard_account() from public, anon, authenticated;
grant execute on function crm_private.guard_account() to service_role;

alter table public.crm_accounts drop constraint if exists crm_accounts_request_contact_email_check;
alter table public.crm_accounts drop constraint if exists crm_accounts_bond_carried_skus_check;
alter table public.crm_accounts drop column if exists request_contact_email;
alter table public.crm_accounts drop column if exists bond_carried_skus;
alter table public.crm_accounts drop column if exists request_opt_out;
