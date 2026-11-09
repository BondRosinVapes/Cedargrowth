-- Bond dispensary intake. Depends on 0120 through 0131.
-- Supported fresh install: psql --single-transaction -f scripts/crm-apply-bundle.sql
-- Supported upgrade after 0120 through 0131 have committed:
--   psql --single-transaction -v ON_ERROR_STOP=1 -f scripts/crm-apply-0132.sql
-- Do not apply this file with autocommit.
-- No seed rows. This file does not send email and does not schedule a job.
-- The deletion contact is named bond. This file stores no mailbox.

do $$
begin
  if to_regclass('public.crm_accounts') is null or to_regclass('public.crm_activity') is null or to_regclass('public.crm_notes') is null then
    raise exception 'crm tables are missing. Apply the bundle, not this file.';
  end if;
end $$;

alter table public.crm_accounts add column if not exists street text;
alter table public.crm_accounts add column if not exists state text;
alter table public.crm_accounts add column if not exists postal_code text;
alter table public.crm_accounts add column if not exists consent_version text;
alter table public.crm_accounts add column if not exists consent_received_at timestamptz;
alter table public.crm_accounts add column if not exists intake_submitted_at timestamptz;
alter table public.crm_accounts add column if not exists ocm_status text;
alter table public.crm_accounts add column if not exists record_marker text;
alter table public.crm_accounts add column if not exists source_inquiry_id uuid;

alter table public.crm_accounts drop constraint if exists crm_accounts_street_len;
alter table public.crm_accounts add constraint crm_accounts_street_len check (street is null or char_length(street) between 1 and 120);
alter table public.crm_accounts drop constraint if exists crm_accounts_state_check;
alter table public.crm_accounts add constraint crm_accounts_state_check check (state is null or state = 'NY');
alter table public.crm_accounts drop constraint if exists crm_accounts_postal_code_len;
alter table public.crm_accounts add constraint crm_accounts_postal_code_len check (postal_code is null or char_length(postal_code) between 1 and 10);
alter table public.crm_accounts drop constraint if exists crm_accounts_consent_version_check;
alter table public.crm_accounts add constraint crm_accounts_consent_version_check check (consent_version is null or consent_version ~ '^v1:[0-9a-f]{16}$');
alter table public.crm_accounts drop constraint if exists crm_accounts_ocm_status_check;
alter table public.crm_accounts add constraint crm_accounts_ocm_status_check check (ocm_status is null or ocm_status in ('unverified', 'verified'));
alter table public.crm_accounts drop constraint if exists crm_accounts_record_marker_check;
alter table public.crm_accounts add constraint crm_accounts_record_marker_check check (record_marker is null or record_marker = 'test');
alter table public.crm_accounts drop constraint if exists crm_accounts_source_inquiry_key;
alter table public.crm_accounts add constraint crm_accounts_source_inquiry_key unique (source_inquiry_id);

alter table public.crm_accounts drop constraint if exists crm_accounts_lead_source_check;
alter table public.crm_accounts add constraint crm_accounts_lead_source_check check (lead_source is null or lead_source in (
  'referral', 'leaflink', 'trade_show', 'cold_outreach', 'website', 'hoodie', 'existing_relationship', 'other', 'bond_inquiry'
));

alter table public.crm_contacts add column if not exists source_inquiry_id uuid;
alter table public.crm_opportunities add column if not exists source_inquiry_id uuid;
alter table public.crm_tasks add column if not exists source_inquiry_id uuid;
alter table public.crm_notes add column if not exists source_inquiry_id uuid;

create index if not exists crm_notes_source_inquiry_idx on public.crm_notes (source_inquiry_id);
create index if not exists crm_tasks_source_inquiry_idx on public.crm_tasks (source_inquiry_id);

alter table public.crm_activity drop constraint if exists crm_activity_kind_check;
alter table public.crm_activity add constraint crm_activity_kind_check check (kind in (
  'account_created', 'account_updated',
  'contact_created', 'contact_updated',
  'opportunity_created', 'opportunity_updated',
  'task_created', 'task_updated',
  'note_recorded',
  'distributor_order_imported',
  'visit_logged', 'sample_left', 'media_added',
  'batch_recorded', 'batch_released', 'reorder_link_created', 'reorder_requested',
  'digest_sent',
  'inquiry_received'
));

-- County edits, and the intake columns, have to persist on their own.
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
       and new.source_inquiry_id is not distinct from old.source_inquiry_id then
      return old;
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- Ordinary deletes stay rejected. The intake deletion functions set this flag
-- for the length of their own transaction.
create or replace function crm_private.reject_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('crm.intake_delete', true) = 'on' then
    return old;
  end if;
  raise exception 'crm rows are not deleted in this version';
end;
$$;

create table if not exists public.crm_intake_log (
  inquiry_id uuid primary key,
  received_at timestamptz not null,
  result text not null check (result in ('created', 'possible_duplicate'))
);

comment on table public.crm_intake_log is 'Intake receipt. Inquiry id, time, and result only. No payload body. Not seeded.';

create table if not exists public.crm_intake_deletions (
  id uuid primary key default gen_random_uuid(),
  deleted_at timestamptz not null default now(),
  reason text not null check (reason in ('named', 'retention')),
  contact_name text not null check (contact_name = 'bond')
);

comment on table public.crm_intake_deletions is 'Non-identifying deletion record. The contact is bond and has no mailbox. Not seeded.';

alter table public.crm_intake_log enable row level security;
alter table public.crm_intake_log force row level security;
revoke all on table public.crm_intake_log from public, anon, authenticated, service_role;

alter table public.crm_intake_deletions enable row level security;
alter table public.crm_intake_deletions force row level security;
revoke all on table public.crm_intake_deletions from public, anon, authenticated, service_role;

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

create or replace function public.crm_delete_bond_inquiry(p_inquiry_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account uuid;
  extra uuid;
  extras uuid[];
  removed integer := 0;
begin
  if not exists (select 1 from public.crm_intake_log where inquiry_id = p_inquiry_id)
     and not exists (select 1 from public.crm_accounts where source_inquiry_id = p_inquiry_id)
     and not exists (select 1 from public.crm_notes where source_inquiry_id = p_inquiry_id)
     and not exists (select 1 from public.crm_tasks where source_inquiry_id = p_inquiry_id) then
    return jsonb_build_object('ok', true, 'deleted', false);
  end if;
  perform set_config('crm.intake_delete', 'on', true);
  select id into v_account from public.crm_accounts where source_inquiry_id = p_inquiry_id and brand = 'bond';
  if v_account is not null then
    select coalesce(array_agg(distinct source_inquiry_id), array[]::uuid[]) into extras from (
      select source_inquiry_id from public.crm_notes where account_id = v_account and source_inquiry_id is not null
      union
      select source_inquiry_id from public.crm_tasks where account_id = v_account and source_inquiry_id is not null
      union
      select p_inquiry_id
    ) ids;
    delete from public.crm_activity
    where account_id = v_account
       or task_id in (select id from public.crm_tasks where account_id = v_account)
       or opportunity_id in (select id from public.crm_opportunities where account_id = v_account);
    delete from public.crm_notes where account_id = v_account;
    delete from public.crm_tasks where account_id = v_account;
    delete from public.crm_stage_events where opportunity_id in (select id from public.crm_opportunities where account_id = v_account);
    delete from public.crm_opportunities where account_id = v_account;
    delete from public.crm_contacts where account_id = v_account;
    delete from public.crm_accounts where id = v_account;
    foreach extra in array extras loop
      delete from public.crm_intake_log where inquiry_id = extra;
      insert into public.crm_intake_deletions (reason, contact_name) values ('named', 'bond');
      removed := removed + 1;
    end loop;
  else
    delete from public.crm_activity where task_id in (select id from public.crm_tasks where source_inquiry_id = p_inquiry_id);
    delete from public.crm_notes where source_inquiry_id = p_inquiry_id;
    delete from public.crm_tasks where source_inquiry_id = p_inquiry_id;
    delete from public.crm_intake_log where inquiry_id = p_inquiry_id;
    insert into public.crm_intake_deletions (reason, contact_name) values ('named', 'bond');
    removed := 1;
  end if;
  return jsonb_build_object('ok', true, 'deleted', removed > 0);
end;
$$;

create or replace function public.crm_purge_bond_inquiries(p_now timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  extra uuid;
  purged integer := 0;
begin
  perform set_config('crm.intake_delete', 'on', true);
  for rec in
    select a.id as account_id, a.source_inquiry_id
    from public.crm_accounts a
    join public.crm_intake_log l on l.inquiry_id = a.source_inquiry_id
    join public.crm_opportunities o on o.source_inquiry_id = a.source_inquiry_id and o.brand = a.brand
    where a.brand = 'bond'
      and a.lead_source = 'bond_inquiry'
      and a.ocm_status = 'unverified'
      and o.stage = 'lead'
      and l.received_at <= p_now - interval '12 months'
  loop
    for extra in
      select distinct source_inquiry_id from (
        select source_inquiry_id from public.crm_notes where account_id = rec.account_id and source_inquiry_id is not null
        union
        select source_inquiry_id from public.crm_tasks where account_id = rec.account_id and source_inquiry_id is not null
        union
        select rec.source_inquiry_id
      ) ids
    loop
      delete from public.crm_intake_log where inquiry_id = extra;
      insert into public.crm_intake_deletions (reason, contact_name) values ('retention', 'bond');
    end loop;
    delete from public.crm_activity
    where account_id = rec.account_id
       or task_id in (select id from public.crm_tasks where account_id = rec.account_id)
       or opportunity_id in (select id from public.crm_opportunities where account_id = rec.account_id);
    delete from public.crm_notes where account_id = rec.account_id;
    delete from public.crm_tasks where account_id = rec.account_id;
    delete from public.crm_stage_events where opportunity_id in (select id from public.crm_opportunities where account_id = rec.account_id);
    delete from public.crm_opportunities where account_id = rec.account_id;
    delete from public.crm_contacts where account_id = rec.account_id;
    delete from public.crm_accounts where id = rec.account_id;
    purged := purged + 1;
  end loop;
  return jsonb_build_object('ok', true, 'purged', purged);
end;
$$;

revoke all on function public.crm_receive_bond_inquiry(uuid, timestamptz, timestamptz, text, text, text, text, text, text, text, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.crm_receive_bond_inquiry(uuid, timestamptz, timestamptz, text, text, text, text, text, text, text, text, text, text, text, boolean) to service_role;
revoke all on function public.crm_delete_bond_inquiry(uuid) from public, anon, authenticated;
grant execute on function public.crm_delete_bond_inquiry(uuid) to service_role;
revoke all on function public.crm_purge_bond_inquiries(timestamptz) from public, anon, authenticated;
grant execute on function public.crm_purge_bond_inquiries(timestamptz) to service_role;

revoke all on all functions in schema crm_private from public, anon, authenticated;
grant execute on all functions in schema crm_private to service_role;
