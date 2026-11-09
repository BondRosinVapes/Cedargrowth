-- Batches, lab report pointers, and reorder requests. Depends on 0120 through 0127.
-- Supported fresh install: psql --single-transaction -f scripts/crm-apply-bundle.sql
-- Supported upgrade after 0120 through 0127 have committed:
--   psql --single-transaction -v ON_ERROR_STOP=1 -f scripts/crm-apply-0128.sql
-- Do not apply this file with autocommit.
-- No seed rows. Lab report bytes live in the private Storage bucket crm-coa, not in these tables.
-- This file does not create that bucket.

do $$
begin
  if to_regclass('public.crm_accounts') is null
     or to_regclass('public.crm_opportunities') is null
     or to_regclass('public.crm_activity') is null then
    raise exception 'crm tables are missing. Apply the bundle, not this file.';
  end if;
end $$;

create table if not exists public.crm_batches (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('cedargrowth', 'bond')),
  product_id text not null check (product_id in (
    'vape-05g', 'vape-1g', 'preroll-1g', 'preroll-5pk', 'dog-walker-5pk',
    'gummies-10ct-100', 'gummies-10ct-200', 'gummies-20ct-200'
  )),
  batch_number text not null check (char_length(batch_number) between 1 and 40),
  lab_name text not null check (char_length(lab_name) between 1 and 160),
  tested_on date not null,
  coa_storage_path text unique check (coa_storage_path is null or char_length(coa_storage_path) between 3 and 300),
  released boolean not null default false,
  released_at timestamptz,
  created_by text not null check (char_length(created_by) between 3 and 200),
  created_at timestamptz not null default now(),
  public_id text generated always as ('crm:' || brand || ':batch:' || id::text) stored unique,
  unique (brand, batch_number),
  check ((released = false and released_at is null) or (released = true and released_at is not null)),
  check (released = false or coa_storage_path is not null)
);

comment on table public.crm_batches is 'Batch identity and a pointer to a private lab report PDF. Not seeded. Unreleased rows stay inside the CRM.';

create table if not exists public.crm_reorder_links (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('cedargrowth', 'bond')),
  account_id uuid not null references public.crm_accounts (id),
  token_hash text not null unique check (char_length(token_hash) = 64),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by text not null check (char_length(created_by) between 3 and 200),
  created_at timestamptz not null default now(),
  public_id text generated always as ('crm:' || brand || ':reorder-link:' || id::text) stored unique
);

comment on table public.crm_reorder_links is 'SHA-256 hashes of reorder tokens. The raw token is not stored. Not seeded.';

create table if not exists public.crm_reorder_requests (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('cedargrowth', 'bond')),
  account_id uuid not null references public.crm_accounts (id),
  link_id uuid not null references public.crm_reorder_links (id),
  lines jsonb not null check (jsonb_typeof(lines) = 'array'),
  buyer_name text not null check (char_length(buyer_name) between 1 and 120),
  buyer_email text not null check (char_length(buyer_email) between 3 and 200),
  note text not null default '' check (char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  status text not null default 'received' check (status in ('received', 'converted', 'declined')),
  public_id text generated always as ('crm:' || brand || ':reorder-request:' || id::text) stored unique
);

comment on table public.crm_reorder_requests is 'A buyer request. Not an order, not an invoice, and not a payment. Not seeded.';

create index if not exists crm_batches_brand_product_idx on public.crm_batches (brand, product_id, tested_on desc);
create index if not exists crm_reorder_links_brand_account_idx on public.crm_reorder_links (brand, account_id, created_at desc);
create index if not exists crm_reorder_requests_brand_account_idx on public.crm_reorder_requests (brand, account_id, created_at desc);

alter table public.crm_activity drop constraint if exists crm_activity_kind_check;
alter table public.crm_activity add constraint crm_activity_kind_check check (kind in (
  'account_created', 'account_updated',
  'contact_created', 'contact_updated',
  'opportunity_created', 'opportunity_updated',
  'task_created', 'task_updated',
  'note_recorded',
  'distributor_order_imported',
  'visit_logged', 'sample_left', 'media_added',
  'batch_recorded', 'batch_released', 'reorder_link_created', 'reorder_requested'
));

create or replace function crm_private.audit_batch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.crm_activity (brand, kind, summary, actor)
    values (new.brand, 'batch_recorded', 'Batch recorded', new.created_by);
  elsif tg_op = 'UPDATE' and new.released = true and old.released = false then
    insert into public.crm_activity (brand, kind, summary, actor)
    values (new.brand, 'batch_released', 'Batch released', new.created_by);
  end if;
  return null;
end;
$$;

create or replace function crm_private.audit_reorder_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.crm_activity (brand, account_id, kind, summary, actor)
    values (new.brand, new.account_id, 'reorder_link_created', 'Reorder link created', new.created_by);
  end if;
  return null;
end;
$$;

create or replace function crm_private.audit_reorder_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.crm_activity (brand, account_id, kind, summary, actor)
  values (new.brand, new.account_id, 'reorder_requested', 'Reorder requested', 'reorder request');
  return null;
end;
$$;

drop trigger if exists crm_batches_audit on public.crm_batches;
create trigger crm_batches_audit after insert or update of released on public.crm_batches
  for each row execute function crm_private.audit_batch();
drop trigger if exists crm_reorder_links_audit on public.crm_reorder_links;
create trigger crm_reorder_links_audit after insert on public.crm_reorder_links
  for each row execute function crm_private.audit_reorder_link();
drop trigger if exists crm_reorder_requests_audit on public.crm_reorder_requests;
create trigger crm_reorder_requests_audit after insert on public.crm_reorder_requests
  for each row execute function crm_private.audit_reorder_request();

create or replace function public.crm_record_reorder(
  p_brand text,
  p_account_id uuid,
  p_link_id uuid,
  p_lines jsonb,
  p_buyer_name text,
  p_buyer_email text,
  p_note text,
  p_deal_name text,
  p_product_line text,
  p_quantity integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  link_brand text;
  link_account uuid;
  link_expires timestamptz;
  link_revoked timestamptz;
  acct_brand text;
  acct_status text;
  req_id uuid;
  opp_id uuid;
begin
  select brand, account_id, expires_at, revoked_at
    into link_brand, link_account, link_expires, link_revoked
  from public.crm_reorder_links where id = p_link_id;
  if link_brand is null or link_brand is distinct from p_brand or link_account is distinct from p_account_id
     or link_revoked is not null or link_expires <= now() then
    raise exception 'reorder link is not available';
  end if;
  select brand, status into acct_brand, acct_status from public.crm_accounts where id = p_account_id;
  if acct_brand is null or acct_brand is distinct from p_brand or acct_status is distinct from 'active' then
    raise exception 'reorder link is not available';
  end if;
  if p_product_line not in ('vape', 'preroll', 'gummy', 'other') or p_quantity is null or p_quantity < 1 then
    raise exception 'reorder line is not available';
  end if;
  insert into public.crm_reorder_requests (brand, account_id, link_id, lines, buyer_name, buyer_email, note, status)
  values (p_brand, p_account_id, p_link_id, p_lines, p_buyer_name, p_buyer_email, coalesce(p_note, ''), 'received')
  returning id into req_id;
  insert into public.crm_opportunities (
    brand, account_id, name, stage, forecast_cents, notes, product_line, quantity_units, created_by, updated_by
  ) values (
    p_brand, p_account_id, p_deal_name, 'proposal', null,
    'Reorder request. No price is committed and no payment was taken.',
    p_product_line, p_quantity, 'reorder request', 'reorder request'
  ) returning id into opp_id;
  return jsonb_build_object('request_id', req_id, 'opportunity_id', opp_id);
end;
$$;

alter table public.crm_batches enable row level security;
alter table public.crm_batches force row level security;
revoke all on table public.crm_batches from public, anon, authenticated;
grant select, insert, update on table public.crm_batches to service_role;
revoke delete on table public.crm_batches from service_role, anon, authenticated, public;

alter table public.crm_reorder_links enable row level security;
alter table public.crm_reorder_links force row level security;
revoke all on table public.crm_reorder_links from public, anon, authenticated;
grant select, insert, update on table public.crm_reorder_links to service_role;
revoke delete on table public.crm_reorder_links from service_role, anon, authenticated, public;

alter table public.crm_reorder_requests enable row level security;
alter table public.crm_reorder_requests force row level security;
revoke all on table public.crm_reorder_requests from public, anon, authenticated;
grant select, insert on table public.crm_reorder_requests to service_role;
revoke update, delete on table public.crm_reorder_requests from service_role, anon, authenticated, public;

revoke all on function public.crm_record_reorder(text, uuid, uuid, jsonb, text, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.crm_record_reorder(text, uuid, uuid, jsonb, text, text, text, text, text, integer) to service_role;

revoke all on all functions in schema crm_private from public, anon, authenticated;
grant execute on all functions in schema crm_private to service_role;
