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
  v_phone text;
  v_digits text;
begin
  v_phone := btrim(coalesce(p_contact_phone, ''));
  if v_phone = '' or v_phone ~* '(ext\.?|extension|(^|[[:space:]])x)' then
    raise exception 'contact_phone is not a US number';
  end if;
  if v_phone !~ '^[+0-9().[:space:]-]+$' then
    raise exception 'contact_phone is not a US number';
  end if;
  v_digits := regexp_replace(v_phone, '[^0-9]', '', 'g');
  if char_length(v_digits) = 11 and left(v_digits, 1) = '1' then
    v_digits := substring(v_digits from 2);
  end if;
  if char_length(v_digits) <> 10 then
    raise exception 'contact_phone is not a US number';
  end if;
  v_phone := '+1' || v_digits;
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
  if p_consent_version is distinct from 'v1:46652a17994f78d1' then
    raise exception 'consent_version is not the dispensary line';
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
  values ('bond', account_id, p_contact_name, p_contact_email, v_phone, '', 'bond-intake', 'bond-intake', p_inquiry_id);
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
  submitted_at timestamptz not null,
  business_name text not null check (char_length(business_name) between 1 and 160),
  trade_name text check (trade_name is null or char_length(trade_name) between 1 and 160),
  supply_type text not null check (supply_type in (
    'cannabis_nys_adult_use_cultivator',
    'cannabis_nys_microbusiness_or_cooperative',
    'hemp_or_hemp_extract',
    'non_cannabis_inputs'
  )),
  license_number text,
  contact_name text not null check (char_length(contact_name) between 1 and 120),
  contact_role text check (contact_role is null or char_length(contact_role) between 1 and 80),
  contact_email text not null check (
    char_length(contact_email) between 3 and 200
    and contact_email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  ),
  contact_phone text not null check (contact_phone ~ '^\+1[0-9]{10}$'),
  contact_phone_ext text check (contact_phone_ext is null or contact_phone_ext ~ '^[0-9]{1,6}$'),
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
  consent_version text not null check (consent_version = 'v1:56b70a071c4714eb'),
  source_route text not null check (source_route = '/card'),
  source_event text not null check (source_event ~ '^[a-z0-9-]{1,64}$'),
  replied_at timestamptz,
  constraint crm_supplier_inquiries_license_check check (
    (
      supply_type in ('cannabis_nys_adult_use_cultivator', 'cannabis_nys_microbusiness_or_cooperative')
      and license_number ~ '^OCM-[A-Z]{2,6}-[0-9]{2}-[0-9]{6}$'
      and upper(license_number) !~ '(^|-)(ROD|ROND)(-|$)'
    )
    or (
      supply_type = 'hemp_or_hemp_extract'
      and (
        license_number is null
        or (
          license_number ~ '^[A-Z0-9-]{3,40}$'
          and license_number !~ '^[0-9]{2}-?[0-9]{7}$'
          and upper(license_number) !~ '(^|-)(ROD|ROND)(-|$)'
        )
      )
    )
    or (
      supply_type = 'non_cannabis_inputs'
      and license_number is null
    )
  )
);

comment on table public.crm_supplier_inquiries is
  'Farmer and supplier intake from the trade show card. Not a retailer account. Not a Bond Haus member. Not seeded. license_number is a format check only and does not certify a license.';
comment on column public.crm_supplier_inquiries.supply_type is
  'cannabis_nys_adult_use_cultivator, cannabis_nys_microbusiness_or_cooperative, hemp_or_hemp_extract, or non_cannabis_inputs. ROD and ROND are not values.';
comment on column public.crm_supplier_inquiries.contact_phone is
  'Work phone, stored as +1 and 10 digits. Used only to reply to this inquiry. Not an SMS, OTP, or marketing number.';
comment on column public.crm_supplier_inquiries.contact_email is
  'Work email. Used only to reply to this inquiry. Not a marketing address.';
comment on column public.crm_supplier_inquiries.contact_phone_ext is
  'Optional work phone extension, digits only, at most 6. Null when the caller gave no extension.';
comment on column public.crm_supplier_inquiries.consent_version is
  'Supplier consent line v1:56b70a071c4714eb. Not the dispensary consent version.';
comment on column public.crm_supplier_inquiries.replied_at is
  'Last reply or qualification time. Null means never replied. The 12 month purge uses this, then submitted_at. Scheduling that purge needs Gary approval. No cron is created here.';

create index if not exists crm_supplier_inquiries_retention_idx
  on public.crm_supplier_inquiries ((coalesce(replied_at, submitted_at)));

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
revoke all on table public.crm_supplier_inquiries from service_role;

alter table public.crm_supplier_intake_deletions enable row level security;
alter table public.crm_supplier_intake_deletions force row level security;
revoke all on table public.crm_supplier_intake_deletions from public, anon, authenticated, service_role;

drop function if exists public.crm_receive_supplier_inquiry(uuid, timestamptz, timestamptz, text, text, text, text, text, text, text, text, text, text, text, boolean);
drop function if exists public.crm_receive_supplier_inquiry(uuid, timestamptz, text, text, text, text, text, text, text, text, text, text, text, text, text);
drop function if exists public.crm_receive_supplier_inquiry(uuid, timestamptz, text, text, text, text, text, text, text, text, text, text, text, text, text, text);

create or replace function public.crm_receive_supplier_inquiry(
  p_inquiry_id uuid,
  p_submitted_at timestamptz,
  p_business_name text,
  p_trade_name text,
  p_supply_type text,
  p_license_number text,
  p_contact_name text,
  p_contact_role text,
  p_contact_email text,
  p_contact_phone text,
  p_contact_phone_ext text,
  p_county text,
  p_message text,
  p_consent_version text,
  p_source_route text,
  p_source_event text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_license text;
  v_phone text;
  v_phone_raw text;
  v_digits text;
  v_ext text;
  v_trade text;
  v_role text;
  v_message text;
  v_cannabis boolean;
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
  if p_consent_version is distinct from 'v1:56b70a071c4714eb' then
    raise exception 'consent_version is not the supplier consent line';
  end if;
  if p_supply_type not in (
    'cannabis_nys_adult_use_cultivator',
    'cannabis_nys_microbusiness_or_cooperative',
    'hemp_or_hemp_extract',
    'non_cannabis_inputs'
  ) then
    raise exception 'supply_type is not recognized';
  end if;

  v_license := nullif(btrim(p_license_number), '');
  v_phone_raw := btrim(coalesce(p_contact_phone, ''));
  v_ext := nullif(btrim(coalesce(p_contact_phone_ext, '')), '');
  if v_phone_raw ~* '(ext\.?|extension|x)\s*[0-9]{0,8}\s*$' then
    v_digits := substring(v_phone_raw from '([0-9]{0,8})\s*$');
    if v_digits is null or char_length(v_digits) < 1 or char_length(v_digits) > 6 then
      raise exception 'contact_phone extension is not recognized';
    end if;
    if v_ext is not null and v_ext is distinct from v_digits then
      raise exception 'contact_phone extension does not match';
    end if;
    v_ext := v_digits;
    v_phone_raw := btrim(regexp_replace(v_phone_raw, '(ext\.?|extension|x)\s*[0-9]{0,8}\s*$', '', 'i'));
  elsif v_phone_raw ~* '(ext|extension|\mx\M)' then
    raise exception 'contact_phone extension is not recognized';
  end if;
  if v_ext is not null and v_ext !~ '^[0-9]{1,6}$' then
    raise exception 'contact_phone extension is not recognized';
  end if;
  if v_phone_raw !~ '^[+0-9(). -]+$' then
    raise exception 'contact_phone is not a US number';
  end if;
  v_digits := regexp_replace(v_phone_raw, '[^0-9]', '', 'g');
  if char_length(v_digits) = 11 and left(v_digits, 1) = '1' then
    v_digits := substring(v_digits from 2);
  end if;
  if char_length(v_digits) <> 10 then
    raise exception 'contact_phone is not a US number';
  end if;
  v_phone := '+1' || v_digits;
  v_trade := nullif(btrim(p_trade_name), '');
  v_role := nullif(btrim(p_contact_role), '');
  v_message := nullif(btrim(p_message), '');
  v_cannabis := p_supply_type in ('cannabis_nys_adult_use_cultivator', 'cannabis_nys_microbusiness_or_cooperative');
  if v_license is not null and upper(v_license) ~ '(^|-)(ROD|ROND)(-|$)' then
    raise exception 'license_number is not recognized';
  end if;
  if v_cannabis and (v_license is null or v_license !~ '^OCM-[A-Z]{2,6}-[0-9]{2}-[0-9]{6}$') then
    raise exception 'license_number is required for this supply type';
  end if;
  if p_supply_type = 'non_cannabis_inputs' and v_license is not null then
    raise exception 'license_number is not allowed for this supply type';
  end if;
  if p_supply_type = 'hemp_or_hemp_extract' and v_license is not null and (v_license !~ '^[A-Z0-9-]{3,40}$' or v_license ~ '^[0-9]{2}-?[0-9]{7}$') then
    raise exception 'license_number is not recognized';
  end if;

  insert into public.crm_supplier_inquiries (
    inquiry_id,
    submitted_at,
    business_name,
    trade_name,
    supply_type,
    license_number,
    contact_name,
    contact_role,
    contact_email,
    contact_phone,
    contact_phone_ext,
    county,
    message,
    consent_version,
    source_route,
    source_event,
    replied_at
  ) values (
    p_inquiry_id,
    greatest(least(p_submitted_at, pg_catalog.now() + interval '5 minutes'), pg_catalog.now() - interval '2 days'),
    p_business_name,
    v_trade,
    p_supply_type,
    v_license,
    p_contact_name,
    v_role,
    p_contact_email,
    v_phone,
    v_ext,
    p_county,
    v_message,
    p_consent_version,
    '/card',
    p_source_event,
    null
  );
  return pg_catalog.jsonb_build_object('ok', true, 'duplicate', false);
end;
$$;

comment on function public.crm_receive_supplier_inquiry(uuid, timestamptz, text, text, text, text, text, text, text, text, text, text, text, text, text, text) is
  'Stores a farmer or supplier inquiry in crm_supplier_inquiries. Does not write crm_accounts. Same inquiry_id is an idempotent replay. License format is checked only. Does not call Metrc.';

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
    where coalesce(replied_at, submitted_at) <= least(p_now, pg_catalog.now()) - interval '12 months'
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
  'Removes supplier inquiries whose last reply or qualification, or submitted_at when never replied, is 12 months old or older. This function is not scheduled. Scheduling needs Gary approval.';

revoke all on function public.crm_receive_supplier_inquiry(uuid, timestamptz, text, text, text, text, text, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.crm_receive_supplier_inquiry(uuid, timestamptz, text, text, text, text, text, text, text, text, text, text, text, text, text, text) to service_role;
revoke all on function public.crm_delete_supplier_inquiry(uuid) from public, anon, authenticated;
grant execute on function public.crm_delete_supplier_inquiry(uuid) to service_role;
revoke all on function public.crm_purge_supplier_inquiries(timestamptz) from public, anon, authenticated;
grant execute on function public.crm_purge_supplier_inquiries(timestamptz) to service_role;

create or replace function public.crm_mark_supplier_replied(p_inquiry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_count integer;
begin
  update public.crm_supplier_inquiries
  set replied_at = pg_catalog.now()
  where inquiry_id = p_inquiry_id;
  get diagnostics v_count = row_count;
  return pg_catalog.jsonb_build_object('ok', true, 'updated', v_count > 0);
end;
$$;

comment on function public.crm_mark_supplier_replied(uuid) is
  'Records a reply or qualification time. The purge deletes rows 12 months after replied_at, or 12 months after submitted_at if never replied. A qualified supplier is a separate record outside this table. Not scheduled.';

revoke all on function public.crm_mark_supplier_replied(uuid) from public, anon, authenticated;
grant execute on function public.crm_mark_supplier_replied(uuid) to service_role;

