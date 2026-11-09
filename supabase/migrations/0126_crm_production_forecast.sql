-- Production forecast fields. Depends on 0120 through 0125.
-- Supported fresh install: psql --single-transaction -f scripts/crm-apply-bundle.sql
-- Supported upgrade after 0120 through 0125 have committed:
--   psql --single-transaction -v ON_ERROR_STOP=1 -f scripts/crm-apply-0126.sql
-- Do not apply this file with autocommit.
-- No seed rows. Missing capacity is not stored as zero.

do $$
begin
  if to_regclass('public.crm_opportunities') is null then
    raise exception 'crm_opportunities is missing. Apply the bundle, not this file.';
  end if;
end $$;

alter table public.crm_opportunities
  add column if not exists product_line text,
  add column if not exists quantity_units integer;

alter table public.crm_opportunities drop constraint if exists crm_opportunities_product_line_check;
alter table public.crm_opportunities add constraint crm_opportunities_product_line_check
  check (product_line is null or product_line in ('vape', 'preroll', 'gummy', 'other'));
alter table public.crm_opportunities drop constraint if exists crm_opportunities_quantity_units_check;
alter table public.crm_opportunities add constraint crm_opportunities_quantity_units_check
  check (quantity_units is null or quantity_units >= 0);

comment on column public.crm_opportunities.product_line is 'Format for the production forecast. Not a batch specification.';
comment on column public.crm_opportunities.quantity_units is 'Units in the forecast. Not invoiced quantity.';

create table if not exists public.crm_capacity (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('cedargrowth', 'bond')),
  month date not null check (extract(day from month) = 1),
  product_line text not null check (product_line in ('vape', 'preroll', 'gummy', 'other')),
  capacity_units integer not null check (capacity_units >= 0),
  notes text not null default '' check (char_length(notes) <= 400),
  created_by text not null check (char_length(created_by) between 3 and 200),
  updated_by text not null check (char_length(updated_by) between 3 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand, month, product_line)
);

comment on table public.crm_capacity is 'Monthly unit capacity by product line. Not seeded. A missing row is not zero.';

create table if not exists public.crm_stage_events (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('cedargrowth', 'bond')),
  opportunity_id uuid not null references public.crm_opportunities (id),
  from_stage text check (from_stage is null or from_stage in ('lead', 'qualification', 'licensed_buyer_review', 'proposal', 'won', 'lost')),
  to_stage text not null check (to_stage in ('lead', 'qualification', 'licensed_buyer_review', 'proposal', 'won', 'lost')),
  at timestamptz not null default now()
);

comment on table public.crm_stage_events is 'Stage history used for win rates. Written by trigger. Not seeded.';

create index if not exists crm_stage_events_opportunity_idx on public.crm_stage_events (opportunity_id, at);
create index if not exists crm_capacity_brand_month_idx on public.crm_capacity (brand, month);

create or replace function crm_private.audit_stage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.stage is not distinct from old.stage then
    return null;
  end if;
  insert into public.crm_stage_events (brand, opportunity_id, from_stage, to_stage)
  values (new.brand, new.id, case when tg_op = 'INSERT' then null else old.stage end, new.stage);
  return null;
end;
$$;

drop trigger if exists crm_opportunities_stage on public.crm_opportunities;
create trigger crm_opportunities_stage after insert or update of stage on public.crm_opportunities
  for each row execute function crm_private.audit_stage();

alter table public.crm_capacity enable row level security;
alter table public.crm_capacity force row level security;
revoke all on table public.crm_capacity from public, anon, authenticated;
grant select, insert, update on table public.crm_capacity to service_role;
revoke delete on table public.crm_capacity from service_role, anon, authenticated, public;

alter table public.crm_stage_events enable row level security;
alter table public.crm_stage_events force row level security;
revoke all on table public.crm_stage_events from public, anon, authenticated, service_role;
grant select on table public.crm_stage_events to service_role;

revoke all on all functions in schema crm_private from public, anon, authenticated;
grant execute on all functions in schema crm_private to service_role;
