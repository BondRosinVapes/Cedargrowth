-- Account coordinates for the staff map. Depends on 0120 through 0134.
-- Supported fresh install: psql --single-transaction -f scripts/crm-apply-bundle.sql
-- Supported upgrade after 0120 through 0134 have committed:
--   psql --single-transaction -v ON_ERROR_STOP=1 -f scripts/crm-apply-0135.sql
-- Do not apply this file with autocommit. This repository does not run it.
-- No seed rows. Existing row security and grants are unchanged.

do $$
begin
  if to_regclass('public.crm_accounts') is null then
    raise exception 'crm_accounts is missing. Apply the bundle, not this file.';
  end if;
end $$;

alter table public.crm_accounts add column if not exists latitude numeric(9,6);
alter table public.crm_accounts add column if not exists longitude numeric(9,6);
alter table public.crm_accounts add column if not exists geocode_source text;
alter table public.crm_accounts add column if not exists geocode_match text;
alter table public.crm_accounts add column if not exists geocoded_at timestamptz;

alter table public.crm_accounts drop constraint if exists crm_accounts_latitude_range;
alter table public.crm_accounts add constraint crm_accounts_latitude_range
  check (latitude is null or (latitude >= 40.4 and latitude <= 45.1));
alter table public.crm_accounts drop constraint if exists crm_accounts_longitude_range;
alter table public.crm_accounts add constraint crm_accounts_longitude_range
  check (longitude is null or (longitude >= -79.8 and longitude <= -71.8));
alter table public.crm_accounts drop constraint if exists crm_accounts_geocode_pair;
alter table public.crm_accounts add constraint crm_accounts_geocode_pair
  check ((latitude is null and longitude is null) or (latitude is not null and longitude is not null));

comment on column public.crm_accounts.latitude is 'Street level latitude for the staff map. Null until a geocode is stored.';
comment on column public.crm_accounts.longitude is 'Street level longitude for the staff map. Null until a geocode is stored.';

-- A coordinate-only edit has to persist. The comparison includes every column the previous guard watched.
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
