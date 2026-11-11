-- Card intake source_event on dispensary leads, and a separate supplier
-- intake table. Depends on 0120 through 0136. 0137 is not in main and is
-- not approved, so the account guard is the live 0135 body plus source_event.
-- It does not mention named_publicly.
-- Supported upgrade after 0120 through 0136 have committed:
--   psql --single-transaction -v ON_ERROR_STOP=1 -f scripts/crm-apply-0138.sql
-- Do not apply this file with autocommit. This repository does not run it.
-- The draft wrapped its own begin and commit. Those two lines are omitted
-- here so this file can join the one-transaction bundle.
-- No seed rows. Does not connect Canix or Metrc. Does not store Bond Haus
-- member or consumer data. Does not grant Bond Haus access to CRM tables.
-- No HTTP is performed from any function in this file.
--
-- Gary 1:03 AM ET on 2026-11-11: trade show card dispensary sign-up uses
-- the existing intake with source_route /card and a required source_event.
-- Gary 1:04 AM ET on 2026-11-11: /card also takes farmer and supplier
-- sign-ups for biomass or input material. Those rows stay out of
-- crm_accounts and out of the dispensary pipeline.

do $$
declare
  v_super boolean;
  v_bypass boolean;
begin
  select rolsuper, rolbypassrls into v_super, v_bypass
  from pg_catalog.pg_roles
  where rolname = current_user;
  if coalesce(v_super, false) or coalesce(v_bypass, false) then
    raise notice '0138 function owner % can bypass forced row level security', current_user;
  else
    raise exception '0138 function owner % cannot bypass forced row level security. Do not apply 0138 as this role.', current_user;
  end if;
end $$;

do $$
begin
  if to_regclass('public.crm_accounts') is null
     or to_regclass('public.crm_intake_log') is null then
    raise exception 'crm intake tables are missing. Apply the bundle through 0136, not this file.';
  end if;
end $$;

alter table public.crm_intake_log
  add column if not exists source_route text;

update public.crm_intake_log
set source_route = '/order'
where source_route is null;

alter table public.crm_intake_log
  alter column source_route set not null;

alter table public.crm_intake_log
  add column if not exists source_event text;

alter table public.crm_intake_log drop constraint if exists crm_intake_log_source_route_check;
alter table public.crm_intake_log add constraint crm_intake_log_source_route_check
  check (source_route in ('/order', '/card'));

alter table public.crm_intake_log drop constraint if exists crm_intake_log_source_event_check;
alter table public.crm_intake_log add constraint crm_intake_log_source_event_check
  check (source_event is null or source_event ~ '^[a-z0-9-]{1,64}$');

alter table public.crm_intake_log drop constraint if exists crm_intake_log_source_pair;
alter table public.crm_intake_log add constraint crm_intake_log_source_pair
  check (
    (source_route = '/card' and source_event is not null)
    or (source_route = '/order' and source_event is null)
  );

comment on column public.crm_intake_log.source_route is
  'Dispensary intake path. /order is the website form. /card is the trade show digital business card.';
comment on column public.crm_intake_log.source_event is
  'Trade event slug. Required when source_route is /card. Must be absent when source_route is /order.';

alter table public.crm_accounts
  add column if not exists source_event text;

alter table public.crm_accounts drop constraint if exists crm_accounts_source_event_check;
alter table public.crm_accounts add constraint crm_accounts_source_event_check
  check (source_event is null or source_event ~ '^[a-z0-9-]{1,64}$');

comment on column public.crm_accounts.source_event is
  'Trade event slug from a /card dispensary inquiry that created this account. Null for /order leads. Not a Bond Haus event record.';

-- Watches source_event so a tag-only edit persists. This body is the live
-- 0135 guard plus source_event. It does not mention named_publicly.
-- If 0137 has already been applied, add named_publicly to this comparison
-- before running this file. If this file is applied first, 0137 must add
-- source_event to its guard before that apply.
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

drop function if exists public.crm_receive_bond_inquiry(uuid, timestamptz, timestamptz, text, text, text, text, text, text, text, text, text, text, text, boolean);
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
  p_test boolean,
  p_source_route text default '/order',
  p_source_event text default null
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
  v_route text;
  v_event text;
begin
  v_route := nullif(btrim(p_source_route), '');
  v_event := nullif(btrim(p_source_event), '');
  if v_route is distinct from '/order' and v_route is distinct from '/card' then
    raise exception 'source_route is not recognized';
  end if;
  if v_route = '/card' and (v_event is null or v_event !~ '^[a-z0-9-]{1,64}$') then
    raise exception 'source_event is required for /card';
  end if;
  if v_route = '/order' and v_event is not null then
    raise exception 'source_event is not allowed for /order';
  end if;

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
    insert into public.crm_intake_log (inquiry_id, received_at, result, source_route, source_event)
    values (p_inquiry_id, p_received_at, 'possible_duplicate', v_route, v_event);
    return jsonb_build_object('ok', true, 'duplicate', false);
  end if;
  insert into public.crm_accounts (
    brand, display_name, status, city, county, notes, license_ref, street, state, postal_code,
    consent_version, consent_received_at, intake_submitted_at, ocm_status, record_marker, source_inquiry_id,
    source_event, lead_source, created_by, updated_by
  ) values (
    'bond', p_business_name, 'prospect', p_city, p_county, '', v_license, p_street, 'NY', p_postal_code,
    p_consent_version, p_received_at, p_submitted_at, 'unverified', case when p_test then 'test' else null end, p_inquiry_id,
    v_event, 'bond_inquiry', 'bond-intake', 'bond-intake'
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
  insert into public.crm_intake_log (inquiry_id, received_at, result, source_route, source_event)
  values (p_inquiry_id, p_received_at, 'created', v_route, v_event);
  return jsonb_build_object('ok', true, 'duplicate', false);
exception
  when unique_violation then
    return jsonb_build_object('ok', true, 'duplicate', true);
end;
$$;

comment on function public.crm_receive_bond_inquiry(uuid, timestamptz, timestamptz, text, text, text, text, text, text, text, text, text, text, text, boolean, text, text) is
  'Stores a dispensary inquiry. source_route is /order or /card. source_event is required for /card and must be null for /order. lead_source stays bond_inquiry. Does not store supplier leads.';

revoke all on function public.crm_receive_bond_inquiry(uuid, timestamptz, timestamptz, text, text, text, text, text, text, text, text, text, text, text, boolean, text, text) from public, anon, authenticated;
grant execute on function public.crm_receive_bond_inquiry(uuid, timestamptz, timestamptz, text, text, text, text, text, text, text, text, text, text, text, boolean, text, text) to service_role;

create table if not exists public.crm_supplier_inquiries (
  inquiry_id uuid primary key,
  business_name text not null check (char_length(business_name) between 1 and 160),
  contact_name text not null check (char_length(contact_name) between 1 and 120),
  contact_email text not null check (char_length(contact_email) between 3 and 200),
  contact_phone text not null check (char_length(contact_phone) between 1 and 40),
  license_number text check (license_number is null or char_length(license_number) between 1 and 40),
  supply_type text not null check (supply_type in ('fresh_frozen_biomass', 'other_biomass', 'other_input')),
  county text not null check (county in (
    'Albany',
    'Allegany',
    'Bronx',
    'Broome',
    'Cattaraugus',
    'Cayuga',
    'Chautauqua',
    'Chemung',
    'Chenango',
    'Clinton',
    'Columbia',
    'Cortland',
    'Delaware',
    'Dutchess',
    'Erie',
    'Essex',
    'Franklin',
    'Fulton',
    'Genesee',
    'Greene',
    'Hamilton',
    'Herkimer',
    'Jefferson',
    'Kings',
    'Lewis',
    'Livingston',
    'Madison',
    'Monroe',
    'Montgomery',
    'Nassau',
    'New York',
    'Niagara',
    'Oneida',
    'Onondaga',
    'Ontario',
    'Orange',
    'Orleans',
    'Oswego',
    'Otsego',
    'Putnam',
    'Queens',
    'Rensselaer',
    'Richmond',
    'Rockland',
    'St. Lawrence',
    'Saratoga',
    'Schenectady',
    'Schoharie',
    'Schuyler',
    'Seneca',
    'Steuben',
    'Suffolk',
    'Sullivan',
    'Tioga',
    'Tompkins',
    'Ulster',
    'Warren',
    'Washington',
    'Wayne',
    'Westchester',
    'Wyoming',
    'Yates'
  )),
  message text check (message is null or char_length(message) <= 500),
  consent_version text not null check (consent_version ~ '^v1:[0-9a-f]{16}$'),
  consent_received_at timestamptz not null,
  source_route text not null check (source_route = '/card'),
  source_event text not null check (source_event ~ '^[a-z0-9-]{1,64}$'),
  submitted_at timestamptz not null,
  received_at timestamptz not null,
  status text not null default 'received' check (status in ('received', 'qualified', 'declined')),
  possible_duplicate boolean not null default false,
  record_marker text check (record_marker is null or record_marker = 'test'),
  created_at timestamptz not null default now()
);

comment on table public.crm_supplier_inquiries is
  'Farmer and supplier intake from the trade show card. Not a retailer account. Not a Bond Haus member. Not seeded. license_number is stored as typed and does not certify a license.';
comment on column public.crm_supplier_inquiries.supply_type is
  'What the supplier offered: fresh frozen biomass, other biomass, or other input material.';
comment on column public.crm_supplier_inquiries.status is
  'received is unqualified. qualified and declined are kept out of the 12 month purge.';

create index if not exists crm_supplier_inquiries_received_idx
  on public.crm_supplier_inquiries (status, received_at);
create index if not exists crm_supplier_inquiries_email_idx
  on public.crm_supplier_inquiries (lower(contact_email));

create table if not exists public.crm_supplier_intake_deletions (
  id uuid primary key default gen_random_uuid(),
  deleted_at timestamptz not null default now(),
  reason text not null check (reason in ('named', 'retention'))
);

comment on table public.crm_supplier_intake_deletions is
  'Non-identifying deletion record for supplier intake. Not seeded.';

alter table public.crm_supplier_inquiries enable row level security;
alter table public.crm_supplier_inquiries force row level security;
revoke all on table public.crm_supplier_inquiries from public, anon, authenticated;
grant select, insert, update on table public.crm_supplier_inquiries to service_role;
revoke delete, truncate, references, trigger on table public.crm_supplier_inquiries from service_role, anon, authenticated, public;

alter table public.crm_supplier_intake_deletions enable row level security;
alter table public.crm_supplier_intake_deletions force row level security;
revoke all on table public.crm_supplier_intake_deletions from public, anon, authenticated, service_role;

create or replace function public.crm_receive_supplier_inquiry(
  p_inquiry_id uuid,
  p_submitted_at timestamptz,
  p_received_at timestamptz,
  p_business_name text,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_license_number text,
  p_supply_type text,
  p_county text,
  p_message text,
  p_consent_version text,
  p_source_route text,
  p_source_event text,
  p_test boolean
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_license text;
  v_message text;
  v_dup boolean := false;
  v_name text;
begin
  if exists (select 1 from public.crm_supplier_inquiries where inquiry_id = p_inquiry_id) then
    return pg_catalog.jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  if p_source_route is distinct from '/card' then
    raise exception 'source_route must be /card';
  end if;
  if p_source_event is null or p_source_event !~ '^[a-z0-9-]{1,64}$' then
    raise exception 'source_event is required';
  end if;

  v_license := nullif(btrim(p_license_number), '');
  v_message := nullif(btrim(p_message), '');
  v_name := lower(btrim(regexp_replace(regexp_replace(coalesce(p_business_name, ''), '[^a-zA-Z0-9]+', ' ', 'g'), '[[:space:]]+', ' ', 'g')));

  if exists (
    select 1
    from public.crm_supplier_inquiries s
    where lower(s.contact_email) = lower(btrim(p_contact_email))
       or (
         v_name <> ''
         and lower(btrim(regexp_replace(regexp_replace(s.business_name, '[^a-zA-Z0-9]+', ' ', 'g'), '[[:space:]]+', ' ', 'g'))) = v_name
       )
  ) then
    v_dup := true;
  end if;

  insert into public.crm_supplier_inquiries (
    inquiry_id,
    business_name,
    contact_name,
    contact_email,
    contact_phone,
    license_number,
    supply_type,
    county,
    message,
    consent_version,
    consent_received_at,
    source_route,
    source_event,
    submitted_at,
    received_at,
    status,
    possible_duplicate,
    record_marker
  ) values (
    p_inquiry_id,
    p_business_name,
    p_contact_name,
    p_contact_email,
    p_contact_phone,
    v_license,
    p_supply_type,
    p_county,
    v_message,
    p_consent_version,
    p_received_at,
    '/card',
    p_source_event,
    p_submitted_at,
    p_received_at,
    'received',
    v_dup,
    case when p_test then 'test' else null end
  );
  return pg_catalog.jsonb_build_object('ok', true, 'duplicate', false, 'possible_duplicate', v_dup);
end;
$$;

comment on function public.crm_receive_supplier_inquiry(uuid, timestamptz, timestamptz, text, text, text, text, text, text, text, text, text, text, text, boolean) is
  'Stores a farmer or supplier inquiry in crm_supplier_inquiries. Does not write crm_accounts. Same inquiry_id is an idempotent replay. Does not call Metrc.';

create or replace function public.crm_delete_supplier_inquiry(p_inquiry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if not exists (select 1 from public.crm_supplier_inquiries where inquiry_id = p_inquiry_id) then
    return pg_catalog.jsonb_build_object('ok', true, 'deleted', false);
  end if;
  delete from public.crm_supplier_inquiries where inquiry_id = p_inquiry_id;
  insert into public.crm_supplier_intake_deletions (reason) values ('named');
  return pg_catalog.jsonb_build_object('ok', true, 'deleted', true);
end;
$$;

create or replace function public.crm_purge_supplier_inquiries(p_now timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  purged integer := 0;
begin
  with gone as (
    delete from public.crm_supplier_inquiries
    where status = 'received'
      and received_at <= p_now - interval '12 months'
    returning inquiry_id
  )
  select pg_catalog.count(*) into purged from gone;
  if purged > 0 then
    insert into public.crm_supplier_intake_deletions (reason)
    select 'retention' from pg_catalog.generate_series(1, purged);
  end if;
  return pg_catalog.jsonb_build_object('ok', true, 'purged', purged);
end;
$$;

comment on function public.crm_purge_supplier_inquiries(timestamptz) is
  'Removes supplier inquiries still in status received when they are 12 months old or older. Qualified and declined rows are kept.';

revoke all on function public.crm_receive_supplier_inquiry(uuid, timestamptz, timestamptz, text, text, text, text, text, text, text, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.crm_receive_supplier_inquiry(uuid, timestamptz, timestamptz, text, text, text, text, text, text, text, text, text, text, text, boolean) to service_role;
revoke all on function public.crm_delete_supplier_inquiry(uuid) from public, anon, authenticated;
grant execute on function public.crm_delete_supplier_inquiry(uuid) to service_role;
revoke all on function public.crm_purge_supplier_inquiries(timestamptz) from public, anon, authenticated;
grant execute on function public.crm_purge_supplier_inquiries(timestamptz) to service_role;

