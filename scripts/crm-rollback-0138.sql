-- Roll back only what 0138 creates. Do not run this from the app.
-- Review it, then the only supported invocation is:
--   psql --single-transaction -v ON_ERROR_STOP=1 -f scripts/crm-rollback-0138.sql
-- Do not run this file with autocommit. This repository does not run it.
-- It does not drop earlier CRM tables or dispensary accounts.
-- It restores crm_receive_bond_inquiry to the 0132 signature (no source
-- route or event) and restores crm_private.guard_account to the 0135 body.
-- 0136 did not change that guard. 0137 is not in main. If 0137 has been
-- applied, restore the 0137 guard (with named_publicly) instead of the
-- body in this file, or a named_publicly-only edit will be discarded.
-- The draft wrapped its own begin and commit. Those two lines are omitted
-- here so this file stays inside one transaction.

drop function if exists public.crm_purge_supplier_inquiries(timestamptz);
drop function if exists public.crm_delete_supplier_inquiry(uuid);
drop function if exists public.crm_receive_supplier_inquiry(uuid, timestamptz, timestamptz, text, text, text, text, text, text, text, text, text, text, text, boolean);

drop table if exists public.crm_supplier_intake_deletions;
drop table if exists public.crm_supplier_inquiries;

drop function if exists public.crm_receive_bond_inquiry(uuid, timestamptz, timestamptz, text, text, text, text, text, text, text, text, text, text, text, boolean, text, text);

create or replace function public.crm_receive_bond_inquiry(
  p_inquiry_id uuid,
  p_submitted_at timestamptz,
  p_received_at timestamptz,
  p_business_name text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_license_number text,
  p_street text,
  p_city text,
  p_postal_code text,
  p_county text,
  p_message text,
  p_consent_version text,
  p_test boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  matched uuid;
  account_id uuid;
  v_name text;
  v_domain text;
  v_license text;
begin
  if exists (select 1 from public.crm_intake_log where inquiry_id = p_inquiry_id) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  v_license := nullif(p_license_number, '');
  v_name := lower(btrim(regexp_replace(regexp_replace(p_business_name, '[^a-zA-Z0-9]+', ' ', 'g'), '[[:space:]]+', ' ', 'g')));
  v_domain := lower(split_part(p_contact_email, '@', 2));
  select a.id into matched
  from public.crm_accounts a
  where a.brand = 'bond'
    and v_license is not null
    and a.license_ref is not null
    and lower(btrim(a.license_ref)) = lower(btrim(v_license))
  order by a.created_at
  limit 1;
  if matched is null and v_name <> '' and v_domain <> '' then
    select a.id into matched
    from public.crm_accounts a
    join public.crm_contacts c on c.account_id = a.id and c.brand = a.brand
    where a.brand = 'bond'
      and lower(btrim(regexp_replace(regexp_replace(a.display_name, '[^a-zA-Z0-9]+', ' ', 'g'), '[[:space:]]+', ' ', 'g'))) = v_name
      and lower(split_part(c.email, '@', 2)) = v_domain
    order by a.created_at
    limit 1;
  end if;
  if matched is not null then
    insert into public.crm_notes (brand, account_id, body, actor, source_inquiry_id)
    values ('bond', matched, case when p_message is null or p_message = '' then 'Possible duplicate.' else 'Possible duplicate.' || chr(10) || p_message end, 'bond-intake', p_inquiry_id);
    insert into public.crm_tasks (brand, account_id, title, status, notes, created_by, updated_by, source_inquiry_id)
    values ('bond', matched, 'Possible duplicate', 'open', 'possible duplicate', 'bond-intake', 'bond-intake', p_inquiry_id);
    insert into public.crm_activity (brand, account_id, kind, summary, actor)
    values ('bond', matched, 'inquiry_received', 'Inquiry received', 'bond-intake');
    insert into public.crm_intake_log (inquiry_id, received_at, result)
    values (p_inquiry_id, p_received_at, 'possible_duplicate');
    return jsonb_build_object('ok', true, 'duplicate', false);
  end if;
  insert into public.crm_accounts (
    brand, display_name, status, city, county, notes, license_ref, street, state, postal_code,
    consent_version, consent_received_at, intake_submitted_at, ocm_status, record_marker, source_inquiry_id,
    lead_source, created_by, updated_by
  ) values (
    'bond', p_business_name, 'prospect', p_city, p_county, '', v_license, p_street, 'NY', p_postal_code,
    p_consent_version, p_received_at, p_submitted_at, 'unverified', case when p_test then 'test' else null end, p_inquiry_id,
    'bond_inquiry', 'bond-intake', 'bond-intake'
  ) returning id into account_id;
  insert into public.crm_contacts (brand, account_id, name, email, phone, notes, created_by, updated_by, source_inquiry_id)
  values ('bond', account_id, p_contact_name, p_contact_email, nullif(p_contact_phone, ''), '', 'bond-intake', 'bond-intake', p_inquiry_id);
  insert into public.crm_opportunities (brand, account_id, name, stage, forecast_cents, notes, created_by, updated_by, source_inquiry_id)
  values ('bond', account_id, p_business_name, 'lead', null, '', 'bond-intake', 'bond-intake', p_inquiry_id);
  if p_message is not null and p_message <> '' then
    insert into public.crm_notes (brand, account_id, body, actor, source_inquiry_id)
    values ('bond', account_id, p_message, 'bond-intake', p_inquiry_id);
  end if;
  insert into public.crm_activity (brand, account_id, kind, summary, actor)
  values ('bond', account_id, 'inquiry_received', 'Inquiry received', 'bond-intake');
  insert into public.crm_intake_log (inquiry_id, received_at, result)
  values (p_inquiry_id, p_received_at, 'created');
  return jsonb_build_object('ok', true, 'duplicate', false);
exception
  when unique_violation then
    return jsonb_build_object('ok', true, 'duplicate', true);
end;
$$;

revoke all on function public.crm_receive_bond_inquiry(uuid, timestamptz, timestamptz, text, text, text, text, text, text, text, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.crm_receive_bond_inquiry(uuid, timestamptz, timestamptz, text, text, text, text, text, text, text, text, text, text, text, boolean) to service_role;

alter table public.crm_intake_log drop constraint if exists crm_intake_log_source_pair;
alter table public.crm_intake_log drop constraint if exists crm_intake_log_source_event_check;
alter table public.crm_intake_log drop constraint if exists crm_intake_log_source_route_check;
alter table public.crm_intake_log drop column if exists source_event;
alter table public.crm_intake_log drop column if exists source_route;

alter table public.crm_accounts drop constraint if exists crm_accounts_source_event_check;
alter table public.crm_accounts drop column if exists source_event;

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
       and new.geocoded_at is not distinct from old.geocoded_at then
      return old;
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

revoke all on function crm_private.guard_account() from public, anon, authenticated;
grant execute on function crm_private.guard_account() to service_role;

