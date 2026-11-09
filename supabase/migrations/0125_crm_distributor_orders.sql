-- Distributor orders reported to CedarGrowth. Depends on 0120 through 0124.
-- Supported fresh install: psql --single-transaction -f scripts/crm-apply-bundle.sql
-- Supported upgrade after 0120 through 0124 have committed:
--   psql --single-transaction -v ON_ERROR_STOP=1 -f scripts/crm-apply-0125.sql
-- Do not apply this file with autocommit.
-- No seed rows. The CRM does not invoice retailers and does not store credit limits or credit holds.
-- invoice_cents and payout_cents are what the distributor reported. They are not a CedarGrowth invoice.

do $$
begin
  if to_regclass('public.crm_accounts') is null
     or to_regclass('public.crm_opportunities') is null
     or to_regclass('public.crm_activity') is null then
    raise exception 'crm tables are missing. Apply the bundle, not this file.';
  end if;
end $$;

alter table public.crm_accounts
  add column if not exists distributor text,
  add column if not exists distributor_account_ref text;

alter table public.crm_accounts drop constraint if exists crm_accounts_distributor_check;
alter table public.crm_accounts add constraint crm_accounts_distributor_check
  check (distributor is null or distributor in ('nabis', 'other', 'self'));
alter table public.crm_accounts drop constraint if exists crm_accounts_distributor_account_ref_len;
alter table public.crm_accounts add constraint crm_accounts_distributor_account_ref_len
  check (distributor_account_ref is null or char_length(distributor_account_ref) <= 120);

comment on column public.crm_accounts.distributor is 'Who sells and collects for this retailer. Not a credit limit.';
comment on column public.crm_accounts.distributor_account_ref is 'Retailer id in the distributor system. Used only to match imported orders.';

create table if not exists public.crm_distributor_orders (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('cedargrowth', 'bond')),
  account_id uuid references public.crm_accounts (id),
  distributor text not null check (distributor in ('nabis', 'other', 'self')),
  order_ref text not null check (char_length(order_ref) between 1 and 120),
  retailer_name text not null check (char_length(retailer_name) between 1 and 200),
  ordered_on date,
  delivered_on date,
  order_status text not null check (order_status in ('placed', 'scheduled', 'delivered', 'cancelled', 'returned')),
  invoice_cents integer check (invoice_cents is null or invoice_cents >= 0),
  retailer_payment_status text not null check (retailer_payment_status in ('unpaid', 'partial', 'paid', 'unknown')),
  retailer_paid_on date,
  payout_status text not null check (payout_status in ('pending', 'paid_out', 'unknown')),
  payout_cents integer check (payout_cents is null or payout_cents >= 0),
  payout_on date,
  opportunity_id uuid references public.crm_opportunities (id),
  source text not null default 'csv' check (source in ('csv', 'api')),
  imported_at timestamptz not null default now(),
  public_id text generated always as ('crm:' || brand || ':distributor_order:' || id::text) stored unique,
  unique (brand, distributor, order_ref)
);

comment on table public.crm_distributor_orders is 'Orders reported by a distributor. Not seeded. Not a CedarGrowth invoice and not a credit hold.';

create index if not exists crm_distributor_orders_brand_idx on public.crm_distributor_orders (brand, ordered_on desc);
create index if not exists crm_distributor_orders_account_idx on public.crm_distributor_orders (account_id);

alter table public.crm_activity drop constraint if exists crm_activity_kind_check;
alter table public.crm_activity add constraint crm_activity_kind_check check (kind in (
  'account_created', 'account_updated',
  'contact_created', 'contact_updated',
  'opportunity_created', 'opportunity_updated',
  'task_created', 'task_updated',
  'note_recorded',
  'distributor_order_imported'
));

-- The 0120 account guard treated name, status, city, and notes as the only real edits.
-- Distributor fields, and the 0124 type and source fields, must persist on their own.
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
       and new.notes is not distinct from old.notes
       and new.license_ref is not distinct from old.license_ref
       and new.facility_ref is not distinct from old.facility_ref
       and new.license_jurisdiction is not distinct from old.license_jurisdiction
       and new.license_expiry is not distinct from old.license_expiry
       and new.assigned_rep is not distinct from old.assigned_rep
       and new.account_type is not distinct from old.account_type
       and new.lead_source is not distinct from old.lead_source
       and new.distributor is not distinct from old.distributor
       and new.distributor_account_ref is not distinct from old.distributor_account_ref then
      return old;
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create or replace function crm_private.audit_distributor_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.crm_activity (brand, account_id, opportunity_id, kind, summary, actor)
  values (
    new.brand,
    new.account_id,
    new.opportunity_id,
    'distributor_order_imported',
    case when tg_op = 'UPDATE' then 'Distributor order updated' else 'Distributor order imported' end,
    'crm import'
  );
  return null;
end;
$$;

drop trigger if exists crm_distributor_orders_audit on public.crm_distributor_orders;
create trigger crm_distributor_orders_audit after insert or update on public.crm_distributor_orders
  for each row execute function crm_private.audit_distributor_order();

alter table public.crm_distributor_orders enable row level security;
alter table public.crm_distributor_orders force row level security;
revoke all on table public.crm_distributor_orders from public, anon, authenticated;
grant select, insert, update on table public.crm_distributor_orders to service_role;
revoke delete on table public.crm_distributor_orders from service_role, anon, authenticated, public;

revoke all on all functions in schema crm_private from public, anon, authenticated;
grant execute on all functions in schema crm_private to service_role;
