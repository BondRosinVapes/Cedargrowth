-- Bond Haus product request hand-off. Draft only. Do not apply from CI.
-- A request is not an order. No consumer field is joined to contacts, Hoodie,
-- spend, pins, or Google Places. The purge function is not scheduled.

alter table public.crm_accounts
  add column if not exists request_contact_email text,
  add column if not exists bond_carried_skus text[] not null default '{}',
  add column if not exists request_opt_out boolean not null default false;

alter table public.crm_accounts drop constraint if exists crm_accounts_request_contact_email_check;
alter table public.crm_accounts add constraint crm_accounts_request_contact_email_check check (
  request_contact_email is null
  or (
    account_type = 'adult_use_dispensary'
    and char_length(request_contact_email) between 3 and 200
    and request_contact_email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  )
);

alter table public.crm_accounts drop constraint if exists crm_accounts_bond_carried_skus_check;
alter table public.crm_accounts add constraint crm_accounts_bond_carried_skus_check check (
  bond_carried_skus <@ array['vape-05g', 'vape-1g', 'preroll-1g', 'preroll-5pk', 'dog-walker-5pk', 'gummies-10ct-100', 'gummies-10ct-200', 'gummies-20ct-200']::text[]
);

comment on column public.crm_accounts.request_contact_email is
  'Request contact email. Set only by an owner or administrator, and only on a licensed adult-use retail dispensary. It is never returned to Bond.';

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
       and new.request_contact_email is not distinct from old.request_contact_email
       and new.bond_carried_skus is not distinct from old.bond_carried_skus
       and new.request_opt_out is not distinct from old.request_opt_out then
      return old;
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

revoke all on function crm_private.guard_account() from public, anon, authenticated;
grant execute on function crm_private.guard_account() to service_role;

create table if not exists public.crm_bond_request_handoffs (
  handoff_id uuid primary key,
  bond_request_id text,
  received_at timestamptz not null default pg_catalog.now(),
  submitted_at timestamptz not null,
  dispensary_account_id uuid not null references public.crm_accounts (id),
  items jsonb not null,
  member_first_name text,
  member_contact text,
  contact_kind text,
  visit_preference text,
  share_consent_version text not null,
  source text not null,
  source_event text,
  status text not null,
  erase_requested_at timestamptz,
  erased_at timestamptz,
  consumer_cleared_at timestamptz,
  constraint crm_bond_request_handoffs_consent_check check (share_consent_version = 'v1:898aa08ccea983db'),
  constraint crm_bond_request_handoffs_source_check check (source = 'bond-haus'),
  constraint crm_bond_request_handoffs_event_check check (source_event is null or source_event ~ '^[a-z0-9-]{1,64}$'),
  constraint crm_bond_request_handoffs_status_check check (status in ('queued', 'sent', 'no_contact', 'failed', 'failed:no_sender', 'erased', 'purged')),
  constraint crm_bond_request_handoffs_kind_check check (contact_kind is null or contact_kind in ('email', 'phone')),
  constraint crm_bond_request_handoffs_visit_check check (visit_preference is null or visit_preference in ('today', 'tomorrow', 'this_week')),
  constraint crm_bond_request_handoffs_contact_check check (
    member_contact is null
    or member_contact ~ '^\+1[0-9]{10}$'
    or member_contact ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  )
);

create table if not exists public.crm_bond_request_send_log (
  id uuid primary key default gen_random_uuid(),
  handoff_id uuid not null references public.crm_bond_request_handoffs (handoff_id) on delete cascade,
  template text not null check (template in ('A', 'B')),
  template_version text not null,
  rendered_sha256 text not null,
  provider_message_id text,
  sent_at timestamptz,
  status text not null
);

create table if not exists public.crm_bond_request_audit (
  id uuid primary key default gen_random_uuid(),
  handoff_id uuid not null,
  status text not null,
  recorded_at timestamptz not null default pg_catalog.now()
);

create table if not exists public.crm_bond_request_alerts (
  id uuid primary key default gen_random_uuid(),
  dispensary_account_id uuid not null,
  accepted_count integer not null,
  created_at timestamptz not null default pg_catalog.now()
);

create table if not exists public.crm_bond_request_purge_schedule (
  id boolean primary key default true check (id),
  scheduled_at timestamptz not null
);

comment on table public.crm_bond_request_send_log is
  'Send record without the dispensary address and without consumer fields. Purged with the hand-off at 12 months.';
comment on table public.crm_bond_request_purge_schedule is
  'Empty until Gary records a purge schedule. Sending stays off while this table has no row. No cron is created here.';

alter table public.crm_bond_request_handoffs enable row level security;
alter table public.crm_bond_request_handoffs force row level security;
alter table public.crm_bond_request_send_log enable row level security;
alter table public.crm_bond_request_send_log force row level security;
alter table public.crm_bond_request_audit enable row level security;
alter table public.crm_bond_request_audit force row level security;
alter table public.crm_bond_request_alerts enable row level security;
alter table public.crm_bond_request_alerts force row level security;
alter table public.crm_bond_request_purge_schedule enable row level security;
alter table public.crm_bond_request_purge_schedule force row level security;

revoke all on table public.crm_bond_request_handoffs from public, anon, authenticated, service_role;
revoke all on table public.crm_bond_request_send_log from public, anon, authenticated, service_role;
revoke all on table public.crm_bond_request_audit from public, anon, authenticated, service_role;
revoke all on table public.crm_bond_request_alerts from public, anon, authenticated, service_role;
revoke all on table public.crm_bond_request_purge_schedule from public, anon, authenticated, service_role;

create index if not exists crm_bond_request_handoffs_account_received_idx
  on public.crm_bond_request_handoffs (dispensary_account_id, received_at);

create or replace function public.crm_receive_bond_request_handoff(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_key text;
  v_id uuid;
  v_submitted timestamptz;
  v_account uuid;
  v_items jsonb;
  v_item jsonb;
  v_units integer := 0;
  v_lines integer := 0;
  v_contact text;
  v_kind text;
  v_name text;
  v_event text;
  v_visit text;
  v_existing text;
  v_accepted integer;
  v_brand text;
  v_type text;
  v_opt boolean;
  v_skus text[];
  v_carries boolean;
begin
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    return pg_catalog.jsonb_build_object('result', 'rejected:schema');
  end if;
  for v_key in select pg_catalog.jsonb_object_keys(p_payload) loop
    if v_key not in ('handoff_id', 'bond_request_id', 'submitted_at', 'dispensary_ref', 'items', 'member_first_name', 'member_contact', 'visit_preference', 'share_consent_version', 'source', 'source_event') then
      return pg_catalog.jsonb_build_object('result', 'rejected:schema');
    end if;
  end loop;
  if p_payload->>'share_consent_version' is distinct from 'v1:898aa08ccea983db' then
    return pg_catalog.jsonb_build_object('result', 'rejected:consent');
  end if;
  if p_payload->>'source' is distinct from 'bond-haus' then
    return pg_catalog.jsonb_build_object('result', 'rejected:source');
  end if;
  v_event := p_payload->>'source_event';
  if v_event is not null and v_event !~ '^[a-z0-9-]{1,64}$' then
    return pg_catalog.jsonb_build_object('result', 'rejected:source');
  end if;
  begin
    v_submitted := (p_payload->>'submitted_at')::timestamptz;
    v_id := (p_payload->>'handoff_id')::uuid;
    v_account := (p_payload->>'dispensary_ref')::uuid;
  exception when others then
    return pg_catalog.jsonb_build_object('result', 'rejected:schema');
  end;
  if v_submitted > v_now + interval '300 seconds' or v_submitted < v_now - interval '24 hours' then
    return pg_catalog.jsonb_build_object('result', 'rejected:clock');
  end if;
  v_name := pg_catalog.btrim(p_payload->>'member_first_name');
  v_contact := p_payload->>'member_contact';
  if v_name is null or pg_catalog.char_length(v_name) < 1 or pg_catalog.char_length(v_name) > 40
     or p_payload->>'bond_request_id' is null or pg_catalog.char_length(p_payload->>'bond_request_id') < 1 then
    return pg_catalog.jsonb_build_object('result', 'rejected:schema');
  end if;
  if v_contact ~ '^\+1[0-9]{10}$' then
    v_kind := 'phone';
  elsif v_contact ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' and pg_catalog.char_length(v_contact) <= 200 then
    v_kind := 'email';
  else
    return pg_catalog.jsonb_build_object('result', 'rejected:schema');
  end if;
  v_visit := p_payload->>'visit_preference';
  if v_visit is not null and v_visit not in ('today', 'tomorrow', 'this_week') then
    return pg_catalog.jsonb_build_object('result', 'rejected:schema');
  end if;
  v_items := p_payload->'items';
  if pg_catalog.jsonb_typeof(v_items) <> 'array' then
    return pg_catalog.jsonb_build_object('result', 'rejected:items');
  end if;
  for v_item in select value from pg_catalog.jsonb_array_elements(v_items) loop
    v_lines := v_lines + 1;
    if pg_catalog.jsonb_typeof(v_item) <> 'object'
       or (v_item->>'sku') not in ('vape-05g', 'vape-1g', 'preroll-1g', 'preroll-5pk', 'dog-walker-5pk', 'gummies-10ct-100', 'gummies-10ct-200', 'gummies-20ct-200')
       or (v_item->>'qty') !~ '^[1-9][0-9]*$' then
      return pg_catalog.jsonb_build_object('result', 'rejected:items');
    end if;
    v_units := v_units + (v_item->>'qty')::integer;
  end loop;
  if v_lines < 1 or v_lines > 10 or v_units > 5 then
    return pg_catalog.jsonb_build_object('result', 'rejected:items');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_id::text));
  select status into v_existing from public.crm_bond_request_handoffs where handoff_id = v_id;
  if found then
    return pg_catalog.jsonb_build_object('result', 'duplicate', 'status', v_existing);
  end if;
  select brand, account_type, request_opt_out, bond_carried_skus
    into v_brand, v_type, v_opt, v_skus
  from public.crm_accounts where id = v_account;
  if not found or v_brand is distinct from 'cedargrowth' or v_type is distinct from 'adult_use_dispensary' or v_opt then
    return pg_catalog.jsonb_build_object('result', 'rejected:dispensary');
  end if;
  if exists (select 1 from public.crm_contacts where account_id = v_account and preference = 'do_not_contact') then
    return pg_catalog.jsonb_build_object('result', 'rejected:dispensary');
  end if;
  select exists (
    select 1 from pg_catalog.jsonb_array_elements(v_items) element
    where (element->>'sku') = any (v_skus)
  ) into v_carries;
  if not v_carries then
    return pg_catalog.jsonb_build_object('result', 'rejected:dispensary');
  end if;
  select count(*) into v_accepted
  from public.crm_bond_request_handoffs
  where dispensary_account_id = v_account
    and received_at > v_now - interval '24 hours';
  if v_accepted >= 50 then
    insert into public.crm_bond_request_alerts (dispensary_account_id, accepted_count)
    values (v_account, 50);
    return pg_catalog.jsonb_build_object('result', 'rejected:rate');
  end if;
  begin
    insert into public.crm_bond_request_handoffs (
      handoff_id, bond_request_id, received_at, submitted_at, dispensary_account_id, items,
      member_first_name, member_contact, contact_kind, visit_preference, share_consent_version,
      source, source_event, status
    ) values (
      v_id, p_payload->>'bond_request_id', v_now, v_submitted, v_account, v_items,
      v_name, v_contact, v_kind, v_visit, 'v1:898aa08ccea983db',
      'bond-haus', v_event, 'queued'
    );
    insert into public.crm_bond_request_audit (handoff_id, status) values (v_id, 'queued');
    return pg_catalog.jsonb_build_object('result', 'accepted', 'status', 'queued');
  exception when unique_violation then
    select status into v_existing from public.crm_bond_request_handoffs where handoff_id = v_id;
    return pg_catalog.jsonb_build_object('result', 'duplicate', 'status', v_existing);
  end;
end;
$$;

create or replace function public.crm_bond_request_handoff_status(p_handoff_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_status text;
begin
  select status into v_status from public.crm_bond_request_handoffs where handoff_id = p_handoff_id;
  if not found then
    return pg_catalog.jsonb_build_object('status', null);
  end if;
  return pg_catalog.jsonb_build_object('status', v_status);
end;
$$;

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
  return pg_catalog.jsonb_build_object('ok', true, 'cleared', v_cleared, 'purged', v_purged);
end;
$$;

comment on function public.crm_purge_bond_request_handoffs(timestamptz) is
  'Clears consumer fields on the retention windows, then deletes the non-personal row, the send log, and the audit rows 12 months after received_at. Uses least of the caller clock and the server clock. Not scheduled.';

create or replace function public.crm_bond_request_store_list(
  p_sku text,
  p_order text,
  p_latitude double precision,
  p_longitude double precision
) returns table (id uuid, display_name text, city text, latitude double precision, longitude double precision)
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  return query
  select a.id, a.display_name, a.city, a.latitude::double precision, a.longitude::double precision
  from public.crm_accounts a
  where a.brand = 'cedargrowth'
    and a.account_type = 'adult_use_dispensary'
    and a.request_opt_out = false
    and p_sku = any (a.bond_carried_skus)
    and not exists (
      select 1 from public.crm_contacts c
      where c.account_id = a.id and c.preference = 'do_not_contact'
    )
  order by
    case when p_order = 'distance' and p_latitude is not null and p_longitude is not null and a.latitude is not null and a.longitude is not null
      then ((a.latitude - p_latitude) ^ 2 + (a.longitude - p_longitude) ^ 2)
      else null end,
    case when p_order = 'distance' and p_latitude is not null then null else a.display_name end;
end;
$$;

create or replace function public.crm_bond_request_admin_view(p_role text)
returns table (
  handoff_id uuid,
  dispensary_account_id uuid,
  items jsonb,
  visit_preference text,
  source text,
  source_event text,
  status text,
  received_at timestamptz,
  submitted_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_role not in ('owner', 'administrator') then
    return;
  end if;
  return query
  select h.handoff_id, h.dispensary_account_id, h.items, h.visit_preference, h.source, h.source_event, h.status, h.received_at, h.submitted_at
  from public.crm_bond_request_handoffs h;
end;
$$;

create or replace function public.crm_bond_request_purge_scheduled()
returns boolean
language sql
security definer
set search_path = pg_catalog
as $$
  select exists (select 1 from public.crm_bond_request_purge_schedule);
$$;

revoke all on function public.crm_receive_bond_request_handoff(jsonb) from public, anon, authenticated;
revoke all on function public.crm_bond_request_handoff_status(uuid) from public, anon, authenticated;
revoke all on function public.crm_erase_bond_request_handoff(uuid) from public, anon, authenticated;
revoke all on function public.crm_mark_bond_request_handoff(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.crm_purge_bond_request_handoffs(timestamptz) from public, anon, authenticated;
revoke all on function public.crm_bond_request_store_list(text, text, double precision, double precision) from public, anon, authenticated;
revoke all on function public.crm_bond_request_admin_view(text) from public, anon, authenticated;
revoke all on function public.crm_bond_request_purge_scheduled() from public, anon, authenticated;

grant execute on function public.crm_receive_bond_request_handoff(jsonb) to service_role;
grant execute on function public.crm_bond_request_handoff_status(uuid) to service_role;
grant execute on function public.crm_erase_bond_request_handoff(uuid) to service_role;
grant execute on function public.crm_mark_bond_request_handoff(uuid, text, text, text, text, text) to service_role;
grant execute on function public.crm_purge_bond_request_handoffs(timestamptz) to service_role;
grant execute on function public.crm_bond_request_store_list(text, text, double precision, double precision) to service_role;
grant execute on function public.crm_bond_request_admin_view(text) to service_role;
grant execute on function public.crm_bond_request_purge_scheduled() to service_role;
