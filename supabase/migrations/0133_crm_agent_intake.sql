-- Agent record intake. Depends on 0120 through 0132.
-- Supported fresh install: psql --single-transaction -f scripts/crm-apply-bundle.sql
-- Supported upgrade after 0120 through 0132 have committed:
--   psql --single-transaction -v ON_ERROR_STOP=1 -f scripts/crm-apply-0133.sql
-- Do not apply this file with autocommit. This repository does not run it.
-- No seed rows. The route stays off until AGENT_INTAKE_ENABLED is set.
-- This file does not send email and does not schedule a job.

do $$
begin
  if to_regclass('public.crm_accounts') is null or to_regclass('public.crm_notes') is null or to_regclass('public.crm_activity') is null then
    raise exception 'crm tables are missing. Apply the bundle, not this file.';
  end if;
end $$;

create table if not exists public.crm_agent_requests (
  request_id uuid primary key,
  actor text not null check (actor = 'CODEX agent'),
  received_at timestamptz not null
);

comment on table public.crm_agent_requests is 'One stored request id for the CODEX agent writer. No payload. Not seeded.';

create index if not exists crm_agent_requests_actor_received_idx on public.crm_agent_requests (actor, received_at desc);

alter table public.crm_accounts add column if not exists source_request_id uuid;
alter table public.crm_contacts add column if not exists source_request_id uuid;
alter table public.crm_notes add column if not exists source_request_id uuid;
alter table public.crm_activity add column if not exists source_request_id uuid;

alter table public.crm_accounts drop constraint if exists crm_accounts_source_request_fk;
alter table public.crm_accounts add constraint crm_accounts_source_request_fk foreign key (source_request_id) references public.crm_agent_requests (request_id);
alter table public.crm_contacts drop constraint if exists crm_contacts_source_request_fk;
alter table public.crm_contacts add constraint crm_contacts_source_request_fk foreign key (source_request_id) references public.crm_agent_requests (request_id);
alter table public.crm_notes drop constraint if exists crm_notes_source_request_fk;
alter table public.crm_notes add constraint crm_notes_source_request_fk foreign key (source_request_id) references public.crm_agent_requests (request_id);
alter table public.crm_activity drop constraint if exists crm_activity_source_request_fk;
alter table public.crm_activity add constraint crm_activity_source_request_fk foreign key (source_request_id) references public.crm_agent_requests (request_id);

create or replace function crm_private.audit_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parts text := '';
begin
  if tg_op = 'INSERT' then
    insert into public.crm_activity (brand, account_id, kind, summary, actor, source_request_id)
    values (new.brand, new.id, 'account_created', 'Account created', new.created_by, new.source_request_id);
    return null;
  end if;
  if new.display_name is distinct from old.display_name then parts := parts || 'display_name '; end if;
  if new.status is distinct from old.status then parts := parts || 'status '; end if;
  if new.city is distinct from old.city then parts := parts || 'city '; end if;
  if new.notes is distinct from old.notes then parts := parts || 'notes '; end if;
  if parts <> '' then
    insert into public.crm_activity (brand, account_id, kind, summary, actor, source_request_id)
    values (new.brand, new.id, 'account_updated', 'Updated account fields: ' || trim(parts), new.updated_by, new.source_request_id);
  end if;
  return null;
end;
$$;

create or replace function crm_private.audit_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.crm_activity (brand, account_id, kind, summary, actor, source_request_id)
    values (new.brand, new.account_id, 'contact_created', 'Contact created', new.created_by, new.source_request_id);
  else
    insert into public.crm_activity (brand, account_id, kind, summary, actor, source_request_id)
    values (new.brand, new.account_id, 'contact_updated', 'Contact updated', new.updated_by, new.source_request_id);
  end if;
  return null;
end;
$$;

create or replace function crm_private.audit_note()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.crm_activity (brand, account_id, kind, summary, actor, source_request_id)
  values (new.brand, new.account_id, 'note_recorded', 'Note appended', new.actor, new.source_request_id);
  return null;
end;
$$;

create or replace function public.crm_receive_agent_records(
  p_request_id uuid,
  p_received_at timestamptz,
  p_rows jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  row_index integer;
  created_accounts integer := 0;
  created_contacts integer := 0;
  created_notes integer := 0;
  skipped jsonb := '[]'::jsonb;
  failed jsonb := '[]'::jsonb;
  account_id uuid;
  license text;
  account_name text;
  hits integer;
begin
  if exists (select 1 from public.crm_agent_requests where request_id = p_request_id) then
    return jsonb_build_object('ok', false, 'code', 'replay');
  end if;
  if (
    select count(*) from public.crm_agent_requests
    where actor = 'CODEX agent' and received_at > p_received_at - interval '1 hour' and received_at <= p_received_at
  ) >= 20 then
    return jsonb_build_object('ok', false, 'code', 'rate');
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 50 then
    return jsonb_build_object('ok', false, 'code', 'oversize');
  end if;
  insert into public.crm_agent_requests (request_id, actor, received_at) values (p_request_id, 'CODEX agent', p_received_at);
  for item in select value from jsonb_array_elements(p_rows) loop
    row_index := coalesce((item->>'index')::integer, 0);
    if item->>'op' = 'account' then
      license := nullif(btrim(coalesce(item->>'license_number', '')), '');
      if license is not null and exists (
        select 1 from public.crm_accounts
        where brand = 'cedargrowth' and license_ref is not null and lower(btrim(license_ref)) = lower(license)
      ) then
        skipped := skipped || jsonb_build_array(jsonb_build_object('index', row_index, 'reason', 'An account with this license number already exists.'));
      else
        insert into public.crm_accounts (
          brand, display_name, status, city, county, state, license_ref, account_type, notes, source_request_id, created_by, updated_by
        ) values (
          'cedargrowth', item->>'display_name', item->>'status', nullif(item->>'city', ''), nullif(item->>'county', ''), 'NY', license,
          nullif(item->>'account_type', ''), '', p_request_id, 'CODEX agent', 'CODEX agent'
        );
        created_accounts := created_accounts + 1;
      end if;
    elsif item->>'op' = 'contact' or item->>'op' = 'note' then
      license := nullif(btrim(coalesce(item->>'account_license', '')), '');
      account_name := nullif(btrim(coalesce(item->>'account_name', '')), '');
      account_id := null;
      if license is not null then
        select count(*) into hits from public.crm_accounts
        where brand = 'cedargrowth' and license_ref is not null and lower(btrim(license_ref)) = lower(license);
        if hits = 1 then
          select id into account_id from public.crm_accounts
          where brand = 'cedargrowth' and license_ref is not null and lower(btrim(license_ref)) = lower(license);
        elsif hits > 1 then
          failed := failed || jsonb_build_array(jsonb_build_object('index', row_index, 'reason', 'More than one account has this license number.'));
        else
          failed := failed || jsonb_build_array(jsonb_build_object('index', row_index, 'reason', 'No account with this license number.'));
        end if;
      elsif account_name is not null then
        select count(*) into hits from public.crm_accounts where brand = 'cedargrowth' and display_name = account_name;
        if hits = 1 then
          select id into account_id from public.crm_accounts where brand = 'cedargrowth' and display_name = account_name;
        elsif hits > 1 then
          failed := failed || jsonb_build_array(jsonb_build_object('index', row_index, 'reason', 'More than one account has this name.'));
        else
          failed := failed || jsonb_build_array(jsonb_build_object('index', row_index, 'reason', 'No account with this exact name.'));
        end if;
      else
        failed := failed || jsonb_build_array(jsonb_build_object('index', row_index, 'reason', 'Link the row to an account by license or exact name.'));
      end if;
      if account_id is not null and item->>'op' = 'contact' then
        insert into public.crm_contacts (brand, account_id, name, email, phone, title, notes, preference, source_request_id, created_by, updated_by)
        values ('cedargrowth', account_id, item->>'name', nullif(item->>'email', ''), nullif(item->>'phone', ''), nullif(item->>'title', ''), '', 'unspecified', p_request_id, 'CODEX agent', 'CODEX agent');
        created_contacts := created_contacts + 1;
      elsif account_id is not null and item->>'op' = 'note' then
        insert into public.crm_notes (brand, account_id, body, actor, source_request_id)
        values ('cedargrowth', account_id, item->>'body', 'CODEX agent', p_request_id);
        created_notes := created_notes + 1;
      end if;
    else
      failed := failed || jsonb_build_array(jsonb_build_object('index', row_index, 'reason', 'This writer cannot create that record.'));
    end if;
  end loop;
  return jsonb_build_object(
    'ok', true,
    'code', 'accepted',
    'created', jsonb_build_object('accounts', created_accounts, 'contacts', created_contacts, 'notes', created_notes),
    'skipped', skipped,
    'failed', failed
  );
end;
$$;

alter table public.crm_agent_requests enable row level security;
alter table public.crm_agent_requests force row level security;
revoke all on table public.crm_agent_requests from public, anon, authenticated, service_role;

revoke all on function public.crm_receive_agent_records(uuid, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.crm_receive_agent_records(uuid, timestamptz, jsonb) to service_role;

revoke all on all functions in schema crm_private from public, anon, authenticated;
grant execute on all functions in schema crm_private to service_role;
