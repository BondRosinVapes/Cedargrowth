-- Sales intelligence storage for the same CRM. Prepared only. Do not apply from CI.
-- Depends on 0120. No seed, no Canix call, no Hoodie call, no schedule.
-- Live recommendations stay empty until a later reviewed ingest.
-- Alerts cannot be activated in this version. Synthetic rows cannot be stored.
-- Competitor readings and internal evidence are staff records, not public rows.

create table public.crm_intel_recommendations (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('cedargrowth', 'bond')),
  account_id uuid references public.crm_accounts (id),
  kind text not null check (kind in ('reorder_window', 'observed_stock', 'prospect')),
  state text not null check (state in ('insufficient_evidence', 'ready_for_review')),
  sufficiency text not null check (sufficiency in ('insufficient', 'sufficient')),
  predicted_window_start date,
  predicted_window_end date,
  last_actual_purchase_on date,
  confirmed_schedule_on date,
  rank integer check (rank is null or rank > 0),
  stock_change text check (stock_change is null or stock_change = 'became_low'),
  observation_basis text check (observation_basis is null or observation_basis = 'hoodie_on_hand'),
  source text not null check (source in (
    'crm',
    'canix_sales_order',
    'crm_confirmed_schedule',
    'canix_confirmed_schedule',
    'hoodie_observed_on_hand',
    'hoodie_heatmap',
    'authorized_retailer_coverage'
  )),
  observed_at timestamptz,
  evidence text not null check (char_length(evidence) between 1 and 2000),
  uncertainty text not null check (char_length(uncertainty) between 1 and 2000),
  factors jsonb not null default '[]'::jsonb check (jsonb_typeof(factors) = 'array'),
  refreshed_at timestamptz,
  staff_only boolean not null default true check (staff_only = true),
  intent_inferred boolean not null default false check (intent_inferred = false),
  synthetic boolean not null default false check (synthetic = false),
  created_at timestamptz not null default now(),
  public_id text generated always as ('crm:' || brand || ':recommendation:' || id::text) stored unique,
  constraint intel_no_claim_without_evidence check (
    sufficiency = 'sufficient'
    or (
      predicted_window_start is null
      and predicted_window_end is null
      and rank is null
      and stock_change is null
      and state = 'insufficient_evidence'
    )
  ),
  constraint intel_stock_basis check (
    stock_change is null
    or (observation_basis = 'hoodie_on_hand' and source = 'hoodie_observed_on_hand')
  ),
  constraint intel_window_pair check (
    (predicted_window_start is null and predicted_window_end is null)
    or (predicted_window_start is not null and predicted_window_end is not null and predicted_window_end >= predicted_window_start)
  )
);

comment on table public.crm_intel_recommendations is 'Canonical sales-intelligence records. Forecast windows are not orders. Empty until verified ingest.';

create table public.crm_intel_alerts (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('cedargrowth', 'bond')),
  recommendation_id uuid references public.crm_intel_recommendations (id),
  kind text not null check (kind in ('reorder_window', 'observed_stock_change', 'prospect_opportunity')),
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 500),
  subject_ref text not null check (char_length(subject_ref) between 1 and 200),
  status text not null check (status in ('open', 'assigned', 'dismissed')),
  evidence text not null check (char_length(evidence) between 1 and 2000),
  sufficiency text not null check (sufficiency = 'sufficient'),
  uncertainty text not null check (char_length(uncertainty) between 1 and 2000),
  factors jsonb not null default '[]'::jsonb check (jsonb_typeof(factors) = 'array'),
  source text,
  refreshed_at timestamptz,
  assigned_to text,
  reviewed_at timestamptz,
  reviewed_by text,
  dismissed_at timestamptz,
  dismissed_by text,
  activated boolean not null default false check (activated = false),
  staff_only boolean not null default true check (staff_only = true),
  synthetic boolean not null default false check (synthetic = false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand, dedupe_key)
);

comment on table public.crm_intel_alerts is 'In-app sales alerts only. Delivery channels are not configured and cannot be activated here.';

create table public.crm_intel_alert_events (
  id uuid primary key default gen_random_uuid(),
  brand text not null check (brand in ('cedargrowth', 'bond')),
  alert_id uuid not null references public.crm_intel_alerts (id),
  action text not null check (action in ('review', 'assign', 'dismiss')),
  actor text not null check (char_length(actor) between 3 and 200),
  created_at timestamptz not null default now()
);

create index crm_intel_recs_brand_idx on public.crm_intel_recommendations (brand, created_at desc);
create index crm_intel_recs_account_idx on public.crm_intel_recommendations (account_id);
create index crm_intel_alerts_brand_idx on public.crm_intel_alerts (brand, updated_at desc);
create index crm_intel_alert_events_alert_idx on public.crm_intel_alert_events (alert_id);

create or replace function crm_private.guard_intel()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent text;
begin
  if new.account_id is not null then
    select brand into parent from public.crm_accounts where id = new.account_id;
    if parent is null or parent is distinct from new.brand then
      raise exception 'brand does not match account';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.brand is distinct from old.brand then
    raise exception 'brand is immutable';
  end if;
  if new.synthetic is true or new.staff_only is false then
    raise exception 'intelligence rows stay staff only and non synthetic';
  end if;
  return new;
end;
$$;

create or replace function crm_private.guard_alert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  rec_brand text;
begin
  if tg_op = 'UPDATE' and new.brand is distinct from old.brand then
    raise exception 'brand is immutable';
  end if;
  if new.activated is true or new.synthetic is true or new.staff_only is false then
    raise exception 'alerts stay inactive';
  end if;
  if new.recommendation_id is not null then
    select brand into rec_brand from public.crm_intel_recommendations where id = new.recommendation_id;
    if rec_brand is null or rec_brand is distinct from new.brand then
      raise exception 'brand does not match recommendation';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create or replace function crm_private.audit_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  act text;
begin
  if tg_op <> 'UPDATE' then
    return null;
  end if;
  if new.status = 'dismissed' and old.status is distinct from 'dismissed' then
    act := 'dismiss';
  elsif new.status = 'assigned' and (old.status is distinct from 'assigned' or new.assigned_to is distinct from old.assigned_to) then
    act := 'assign';
  elsif new.reviewed_at is distinct from old.reviewed_at then
    act := 'review';
  else
    return null;
  end if;
  insert into public.crm_intel_alert_events (brand, alert_id, action, actor)
  values (new.brand, new.id, act, coalesce(new.reviewed_by, new.dismissed_by, new.assigned_to, 'staff'));
  return null;
end;
$$;

create trigger crm_intel_recs_guard before insert or update on public.crm_intel_recommendations
  for each row execute function crm_private.guard_intel();
create trigger crm_intel_recs_no_delete before delete on public.crm_intel_recommendations
  for each row execute function crm_private.reject_delete();

create trigger crm_intel_alerts_guard before insert or update on public.crm_intel_alerts
  for each row execute function crm_private.guard_alert();
create trigger crm_intel_alerts_audit after update on public.crm_intel_alerts
  for each row execute function crm_private.audit_alert();
create trigger crm_intel_alerts_no_delete before delete on public.crm_intel_alerts
  for each row execute function crm_private.reject_delete();

create trigger crm_intel_alert_events_no_update before update or delete on public.crm_intel_alert_events
  for each row execute function crm_private.reject_delete();

alter table public.crm_intel_recommendations enable row level security;
alter table public.crm_intel_recommendations force row level security;
alter table public.crm_intel_alerts enable row level security;
alter table public.crm_intel_alerts force row level security;
alter table public.crm_intel_alert_events enable row level security;
alter table public.crm_intel_alert_events force row level security;

revoke all on table public.crm_intel_recommendations from public, anon, authenticated;
revoke all on table public.crm_intel_alerts from public, anon, authenticated;
revoke all on table public.crm_intel_alert_events from public, anon, authenticated, service_role;

grant select, insert, update, delete on table public.crm_intel_recommendations to service_role;
grant select, insert, update, delete on table public.crm_intel_alerts to service_role;
grant select on table public.crm_intel_alert_events to service_role;

revoke all on all functions in schema crm_private from public, anon, authenticated;
grant execute on all functions in schema crm_private to service_role;
