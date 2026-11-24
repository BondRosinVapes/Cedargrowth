-- Hoodie market snapshots for the CedarGrowth Agent CRM.
-- Prepared only. Do not apply from CI. Apply by hand as one transaction
-- through scripts/crm-apply-0142.sql. This file does not change 0120 through 0141.
-- No seed rows. No cron. No schedule. No account inserts.
--
-- Q-B1 is PENDING. This file uses the recommended default, not a decision:
-- public SECURITY DEFINER functions, search_path pinned to pg_catalog,
-- EXECUTE granted only to service_role. market_intel is not added to the
-- Data API exposed schemas. A direct database connection was not added.

do $$
declare
  v_super boolean;
  v_bypass boolean;
begin
  if to_regrole('anon') is null or to_regrole('authenticated') is null or to_regrole('service_role') is null then
    raise exception '0142 needs the anon, authenticated, and service_role roles.';
  end if;
  select rolsuper, rolbypassrls into v_super, v_bypass
  from pg_catalog.pg_roles
  where rolname = current_user;
  if coalesce(v_super, false) or coalesce(v_bypass, false) then
    raise notice '0142 function owner % can bypass forced row level security', current_user;
  else
    raise exception '0142 function owner % cannot bypass forced row level security. Do not apply 0142 as this role.', current_user;
  end if;
end $$;

create schema market_intel;

revoke all on schema market_intel from public, anon, authenticated, service_role;

alter default privileges in schema market_intel revoke all on tables from public, anon, authenticated, service_role;
alter default privileges in schema market_intel revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges in schema market_intel revoke all on functions from public, anon, authenticated, service_role;

comment on schema market_intel is
  'CedarGrowth Hoodie market snapshots. Not part of the Data API exposed schemas. Do not add market_intel to Exposed schemas or PostgREST db_schemas. Q-H5 metric meanings are unconfirmed working definitions.';

create table market_intel.hoodie_import_runs (
  id uuid primary key default gen_random_uuid(),
  brand text not null default 'cedargrowth' check (brand = 'cedargrowth'),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  report_type text not null check (report_type in ('F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10')),
  geography text check (geography is null or geography in ('NY', 'NY:Erie')),
  period_month date,
  compare_month date,
  grain text not null check (grain in ('month', 'week')),
  status text not null check (status in ('staged', 'validated', 'published', 'superseded', 'rejected')),
  row_count integer not null check (row_count >= 0),
  file_name text not null check (char_length(file_name) between 1 and 500),
  drive_file_id text check (drive_file_id is null or char_length(drive_file_id) between 1 and 200),
  export_date date,
  column_signature text not null,
  validation_report jsonb not null default '{}'::jsonb check (jsonb_typeof(validation_report) = 'object'),
  fact_rows jsonb not null default '[]'::jsonb check (jsonb_typeof(fact_rows) = 'array'),
  uploaded_by text not null check (char_length(uploaded_by) between 3 and 320),
  approved_by text check (approved_by is null or char_length(approved_by) between 3 and 320),
  approved_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  constraint hoodie_import_runs_sha256_key unique (sha256),
  constraint hoodie_import_runs_approval_pair check (
    (status in ('published', 'superseded') and approved_by is not null and approved_at is not null)
    or (status in ('staged', 'validated', 'rejected') and approved_by is null and approved_at is null)
  )
);

comment on table market_intel.hoodie_import_runs is
  'One Hoodie file. sha256 is the per-file checksum. Facts stay empty until a named staff person publishes.';
comment on column market_intel.hoodie_import_runs.sha256 is
  'Lowercase hex SHA-256 of the uploaded file bytes. A repeat checksum is rejected.';

create table market_intel.hoodie_stg_rows (
  brand text not null default 'cedargrowth' check (brand = 'cedargrowth'),
  run_id uuid not null references market_intel.hoodie_import_runs (id),
  row_num integer not null check (row_num > 0),
  raw jsonb not null check (jsonb_typeof(raw) = 'object'),
  parsed jsonb not null default '[]'::jsonb check (jsonb_typeof(parsed) = 'array'),
  primary key (run_id, row_num)
);

comment on table market_intel.hoodie_stg_rows is
  'Untouched header-to-value audit copy for one source row. Kept after publish and after a later run supersedes it.';

create table market_intel.hoodie_market_sales_month (
  brand text not null default 'cedargrowth' check (brand = 'cedargrowth'),
  period_month date not null,
  state text not null,
  category text not null,
  dollars numeric(14,2) not null,
  run_id uuid not null references market_intel.hoodie_import_runs (id),
  primary key (period_month, state, category)
);

create table market_intel.hoodie_brand_month (
  brand text not null default 'cedargrowth' check (brand = 'cedargrowth'),
  period_month date not null,
  geography text not null check (geography in ('NY', 'NY:Erie')),
  brand_normalized text not null,
  source_report text not null check (source_report in ('F2', 'F3', 'F9')),
  brand_display text not null,
  is_cedargrowth boolean not null default false,
  dollars numeric(14,2),
  acv_pct numeric,
  acv_chg_pct numeric,
  dollars_per_mm_acv numeric,
  dollars_per_mm_acv_chg_pct numeric,
  total_dollars numeric(14,2),
  total_dollars_chg_pct numeric,
  total_units numeric(14,2),
  units_chg_pct numeric,
  wap numeric,
  wap_chg_pct numeric,
  dollars_per_mm_acv_per_sku numeric,
  dollars_per_mm_acv_per_sku_chg_pct numeric,
  avg_sku_oos_pct numeric,
  avg_sku_oos_chg numeric,
  avg_skus_per_disp numeric,
  avg_skus_per_disp_chg_pct numeric,
  dispensary_count numeric,
  dispensary_count_chg numeric,
  acv_max_pct numeric,
  acv_max_chg numeric,
  run_id uuid not null references market_intel.hoodie_import_runs (id),
  primary key (period_month, geography, brand_normalized, source_report)
);

create table market_intel.hoodie_size_month (
  brand text not null default 'cedargrowth' check (brand = 'cedargrowth'),
  period_month date not null,
  geography text not null check (geography in ('NY', 'NY:Erie')),
  size_label text not null,
  category text not null,
  size_mg numeric,
  size_unparsed boolean not null default false,
  acv_pct numeric,
  acv_chg_pct numeric,
  dollars_per_mm_acv numeric,
  dollars_per_mm_acv_chg_pct numeric,
  total_dollars numeric(14,2),
  total_dollars_chg_pct numeric,
  total_units numeric(14,2),
  units_chg_pct numeric,
  wap numeric,
  wap_chg_pct numeric,
  dollars_per_mm_acv_per_sku numeric,
  dollars_per_mm_acv_per_sku_chg_pct numeric,
  avg_sku_oos_pct numeric,
  avg_sku_oos_chg numeric,
  avg_skus_per_disp numeric,
  avg_skus_per_disp_chg_pct numeric,
  dispensary_count numeric,
  dispensary_count_chg numeric,
  acv_max_pct numeric,
  acv_max_chg numeric,
  run_id uuid not null references market_intel.hoodie_import_runs (id),
  primary key (period_month, geography, size_label)
);

create table market_intel.hoodie_subsegment_month (
  brand text not null default 'cedargrowth' check (brand = 'cedargrowth'),
  period_month date not null,
  geography text not null check (geography in ('NY', 'NY:Erie')),
  segment text not null,
  sub_segment text not null,
  category text not null,
  acv_pct numeric,
  acv_chg_pct numeric,
  dollars_per_mm_acv numeric,
  dollars_per_mm_acv_chg_pct numeric,
  total_dollars numeric(14,2),
  total_dollars_chg_pct numeric,
  total_units numeric(14,2),
  units_chg_pct numeric,
  wap numeric,
  wap_chg_pct numeric,
  dollars_per_mm_acv_per_sku numeric,
  dollars_per_mm_acv_per_sku_chg_pct numeric,
  avg_sku_oos_pct numeric,
  avg_sku_oos_chg numeric,
  avg_skus_per_disp numeric,
  avg_skus_per_disp_chg_pct numeric,
  dispensary_count numeric,
  dispensary_count_chg numeric,
  acv_max_pct numeric,
  acv_max_chg numeric,
  run_id uuid not null references market_intel.hoodie_import_runs (id),
  primary key (period_month, geography, segment, sub_segment)
);

create table market_intel.hoodie_product_month (
  brand text not null default 'cedargrowth' check (brand = 'cedargrowth'),
  period_month date not null,
  geography text not null check (geography in ('NY', 'NY:Erie')),
  product_normalized text not null,
  product_name text not null,
  category text not null,
  segment text not null,
  brand_parsed text,
  brand_parse_status text not null check (brand_parse_status in ('parsed', 'unparsed')),
  size_mg_parsed numeric,
  size_approximate boolean not null default false,
  is_live_rosin boolean not null default true check (is_live_rosin = true),
  acv_pct numeric,
  acv_chg_pct numeric,
  dollars_per_mm_acv numeric,
  dollars_per_mm_acv_chg_pct numeric,
  total_dollars numeric(14,2),
  total_dollars_chg_pct numeric,
  total_units numeric(14,2),
  units_chg_pct numeric,
  wap numeric,
  wap_chg_pct numeric,
  dollars_per_mm_acv_per_sku numeric,
  dollars_per_mm_acv_per_sku_chg_pct numeric,
  avg_sku_oos_pct numeric,
  avg_sku_oos_chg numeric,
  avg_skus_per_disp numeric,
  avg_skus_per_disp_chg_pct numeric,
  dispensary_count numeric,
  dispensary_count_chg numeric,
  acv_max_pct numeric,
  acv_max_chg numeric,
  run_id uuid not null references market_intel.hoodie_import_runs (id),
  primary key (period_month, geography, product_normalized)
);

create table market_intel.hoodie_dispensary_month (
  brand text not null default 'cedargrowth' check (brand = 'cedargrowth'),
  period_month date not null,
  geography text not null check (geography in ('NY', 'NY:Erie')),
  name_normalized text not null,
  name_raw text not null,
  account_id uuid,
  match_status text not null check (match_status in ('auto', 'manual', 'none', 'residual', 'queued')),
  acv_pct numeric,
  acv_chg_pct numeric,
  dollars_per_mm_acv numeric,
  dollars_per_mm_acv_chg_pct numeric,
  total_dollars numeric(14,2),
  total_dollars_chg_pct numeric,
  total_units numeric(14,2),
  units_chg_pct numeric,
  wap numeric,
  wap_chg_pct numeric,
  dollars_per_mm_acv_per_sku numeric,
  dollars_per_mm_acv_per_sku_chg_pct numeric,
  avg_sku_oos_pct numeric,
  avg_sku_oos_chg numeric,
  avg_skus_per_disp numeric,
  avg_skus_per_disp_chg_pct numeric,
  dispensary_count numeric,
  dispensary_count_chg numeric,
  acv_max_pct numeric,
  acv_max_chg numeric,
  run_id uuid not null references market_intel.hoodie_import_runs (id),
  primary key (period_month, geography, name_normalized)
);

comment on column market_intel.hoodie_dispensary_month.account_id is
  'CedarGrowth account id chosen by a reviewer or an exact name match. No foreign key. Unmatched stores are not created as accounts.';

create table market_intel.hoodie_price_week (
  brand text not null default 'cedargrowth' check (brand = 'cedargrowth'),
  week_start date not null,
  segment text not null,
  unit_of_measure text not null,
  category text not null,
  original_price_avg numeric(16,8) not null,
  run_id uuid not null references market_intel.hoodie_import_runs (id),
  primary key (week_start, segment, unit_of_measure)
);

comment on column market_intel.hoodie_price_week.original_price_avg is
  'Shelf average kept at the source precision. The export carries 8 fractional digits, so this is numeric(16,8) rather than numeric(10,4).';

create table market_intel.hoodie_match_queue (
  id uuid primary key default gen_random_uuid(),
  brand text not null default 'cedargrowth' check (brand = 'cedargrowth'),
  run_id uuid not null references market_intel.hoodie_import_runs (id),
  geography text not null check (geography in ('NY', 'NY:Erie')),
  name_raw text not null,
  name_normalized text not null,
  candidate_account_ids uuid[] not null default '{}',
  reason text not null,
  resolved_account_id uuid,
  resolved_choice text check (resolved_choice is null or resolved_choice in ('account', 'none')),
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  constraint hoodie_match_queue_name_key unique (brand, name_normalized),
  constraint hoodie_match_queue_resolution_pair check (
    (resolved_choice is null and resolved_account_id is null and resolved_by is null and resolved_at is null)
    or (resolved_choice = 'none' and resolved_account_id is null and resolved_by is not null and resolved_at is not null)
    or (resolved_choice = 'account' and resolved_account_id is not null and resolved_by is not null and resolved_at is not null)
  )
);

comment on table market_intel.hoodie_match_queue is
  'Store names that are not an exact single account match. A resolved row is reused for later months by name_normalized. Resolving does not create an account.';

create table market_intel.hoodie_pricing_targets (
  id uuid primary key default gen_random_uuid(),
  brand text not null default 'cedargrowth' check (brand = 'cedargrowth'),
  sku_concept text not null,
  otd_low numeric(10,2),
  otd_high numeric(10,2),
  pretax_low numeric(10,2),
  pretax_high numeric(10,2),
  wholesale numeric(10,2),
  cogs numeric(10,2),
  cogs_status text not null default 'unconfirmed' check (cogs_status in ('unconfirmed', 'confirmed')),
  source_note text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  constraint hoodie_pricing_targets_concept_key unique (brand, sku_concept)
);

comment on table market_intel.hoodie_pricing_targets is
  'Email pricing targets. Q-G1 is pending, so this table is created empty and no figures are loaded.';

create index hoodie_import_runs_report_idx on market_intel.hoodie_import_runs (report_type, status, created_at desc);
create index hoodie_match_queue_run_idx on market_intel.hoodie_match_queue (run_id);

alter table market_intel.hoodie_import_runs enable row level security;
alter table market_intel.hoodie_import_runs force row level security;
alter table market_intel.hoodie_stg_rows enable row level security;
alter table market_intel.hoodie_stg_rows force row level security;
alter table market_intel.hoodie_market_sales_month enable row level security;
alter table market_intel.hoodie_market_sales_month force row level security;
alter table market_intel.hoodie_brand_month enable row level security;
alter table market_intel.hoodie_brand_month force row level security;
alter table market_intel.hoodie_size_month enable row level security;
alter table market_intel.hoodie_size_month force row level security;
alter table market_intel.hoodie_subsegment_month enable row level security;
alter table market_intel.hoodie_subsegment_month force row level security;
alter table market_intel.hoodie_product_month enable row level security;
alter table market_intel.hoodie_product_month force row level security;
alter table market_intel.hoodie_dispensary_month enable row level security;
alter table market_intel.hoodie_dispensary_month force row level security;
alter table market_intel.hoodie_price_week enable row level security;
alter table market_intel.hoodie_price_week force row level security;
alter table market_intel.hoodie_match_queue enable row level security;
alter table market_intel.hoodie_match_queue force row level security;
alter table market_intel.hoodie_pricing_targets enable row level security;
alter table market_intel.hoodie_pricing_targets force row level security;

revoke all on all tables in schema market_intel from public, anon, authenticated, service_role;
revoke all on all sequences in schema market_intel from public, anon, authenticated, service_role;
revoke all on all functions in schema market_intel from public, anon, authenticated, service_role;

create or replace function market_intel.hoodie_num(p_value text)
returns numeric
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when p_value is null or p_value = '' then null
    else p_value::numeric
  end
$$;

revoke all on function market_intel.hoodie_num(text) from public, anon, authenticated, service_role;

create or replace function public.hoodie_stage_import(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_sha text := p_payload->>'sha256';
  v_existing uuid;
  v_run uuid;
  v_status text;
  v_errors integer;
  v_report text := p_payload->>'report_type';
  v_prior integer;
  v_prior_period date;
  v_period date := nullif(p_payload->>'period_month', '')::date;
  v_count integer;
begin
  if v_sha is null or v_sha !~ '^[0-9a-f]{64}$' then
    return pg_catalog.jsonb_build_object('ok', false, 'duplicate', false, 'published', false, 'reason', 'Checksum is missing.');
  end if;
  if v_report not in ('F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10') then
    return pg_catalog.jsonb_build_object('ok', false, 'duplicate', false, 'published', false, 'reason', 'Report type is not recognized.');
  end if;
  if coalesce(p_payload->>'uploaded_by', '') !~ '^[^[:space:]@]+@[^[:space:]@]+$' then
    return pg_catalog.jsonb_build_object('ok', false, 'duplicate', false, 'published', false, 'reason', 'A named staff person is required to stage a file.');
  end if;
  if coalesce(p_payload->>'grain', '') not in ('month', 'week') then
    return pg_catalog.jsonb_build_object('ok', false, 'duplicate', false, 'published', false, 'reason', 'Grain is not recognized.');
  end if;
  select id into v_existing from market_intel.hoodie_import_runs where sha256 = v_sha;
  if found then
    return pg_catalog.jsonb_build_object('ok', true, 'duplicate', true, 'published', false, 'run_id', v_existing, 'status', 'duplicate');
  end if;
  v_errors := coalesce(pg_catalog.jsonb_array_length(p_payload#>'{validation_report,errors}'), 0);
  v_status := case when v_errors > 0 then 'rejected' else 'validated' end;
  insert into market_intel.hoodie_import_runs (
    brand, sha256, report_type, geography, period_month, compare_month, grain, status,
    row_count, file_name, drive_file_id, export_date, column_signature, validation_report,
    fact_rows, uploaded_by
  ) values (
    'cedargrowth',
    v_sha,
    v_report,
    nullif(p_payload->>'geography', ''),
    v_period,
    nullif(p_payload->>'compare_month', '')::date,
    p_payload->>'grain',
    v_status,
    coalesce(pg_catalog.jsonb_array_length(p_payload->'rows'), 0),
    p_payload->>'file_name',
    nullif(p_payload->>'drive_file_id', ''),
    nullif(p_payload->>'export_date', '')::date,
    coalesce(p_payload->>'column_signature', ''),
    coalesce(p_payload->'validation_report', '{}'::jsonb),
    case when v_status = 'validated' then coalesce(p_payload->'fact_rows', '[]'::jsonb) else '[]'::jsonb end,
    p_payload->>'uploaded_by'
  ) returning id into v_run;

  insert into market_intel.hoodie_stg_rows (brand, run_id, row_num, raw, parsed)
  select 'cedargrowth', v_run, (item->>'row_num')::integer, item->'raw',
    case when v_status = 'validated' then coalesce(item->'parsed', '[]'::jsonb) else '[]'::jsonb end
  from pg_catalog.jsonb_array_elements(coalesce(p_payload->'rows', '[]'::jsonb)) item;

  if v_status = 'validated' then
    insert into market_intel.hoodie_match_queue (
      brand, run_id, geography, name_raw, name_normalized, candidate_account_ids, reason
    )
    select 'cedargrowth',
      v_run,
      item->>'geography',
      item->>'name_raw',
      item->>'name_normalized',
      coalesce((
        select pg_catalog.array_agg(candidate::uuid)
        from pg_catalog.jsonb_array_elements_text(coalesce(item->'candidate_account_ids', '[]'::jsonb)) as candidate
      ), '{}'::uuid[]),
      item->>'reason'
    from pg_catalog.jsonb_array_elements(coalesce(p_payload->'queue', '[]'::jsonb)) item
    on conflict (brand, name_normalized) do nothing;
  end if;

  select row_count, period_month into v_prior, v_prior_period
  from market_intel.hoodie_import_runs
  where report_type = v_report
    and id <> v_run
    and status in ('published', 'superseded', 'validated')
  order by created_at desc
  limit 1;
  v_count := coalesce(pg_catalog.jsonb_array_length(p_payload->'rows'), 0);
  if v_prior is not null and (v_count * 5 < v_prior * 4 or v_count * 5 > v_prior * 6) then
    update market_intel.hoodie_import_runs
    set validation_report = validation_report || pg_catalog.jsonb_build_object(
      'warnings',
      coalesce(validation_report->'warnings', '[]'::jsonb) || pg_catalog.jsonb_build_array('Row count is outside 20 percent of the prior file.')
    )
    where id = v_run;
  end if;
  if v_prior_period is not null and v_period is not null and v_period <> v_prior_period and v_period <> (v_prior_period + interval '1 month')::date then
    update market_intel.hoodie_import_runs
    set validation_report = validation_report || pg_catalog.jsonb_build_object(
      'warnings',
      coalesce(validation_report->'warnings', '[]'::jsonb) || pg_catalog.jsonb_build_array('The sales month does not follow the prior month.')
    )
    where id = v_run;
  end if;

  return pg_catalog.jsonb_build_object('ok', true, 'duplicate', false, 'published', false, 'run_id', v_run, 'status', v_status);
exception
  when unique_violation then
    if sqlerrm not like '%hoodie_import_runs_sha256_key%' then
      raise;
    end if;
    select id into v_existing from market_intel.hoodie_import_runs where sha256 = v_sha;
    return pg_catalog.jsonb_build_object('ok', true, 'duplicate', true, 'published', false, 'run_id', v_existing, 'status', 'duplicate');
end;
$$;

comment on function public.hoodie_stage_import(jsonb) is
  'Q-B1 PENDING. Stages one Hoodie file by checksum. A known checksum is returned as a duplicate and is not loaded again. Does not publish and does not create accounts.';

create or replace function public.hoodie_publish_import(p_run_id uuid, p_approved_by text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_status text;
  v_approved_by text;
  v_approved_at timestamptz;
  v_facts jsonb;
  v_report text;
  v_count integer;
begin
  if p_approved_by is null or p_approved_by !~ '^[^[:space:]@]+@[^[:space:]@]+$' then
    return pg_catalog.jsonb_build_object('ok', false, 'published', false, 'reason', 'A named staff approver is required.');
  end if;
  select status, approved_by, approved_at, fact_rows, report_type
    into v_status, v_approved_by, v_approved_at, v_facts, v_report
  from market_intel.hoodie_import_runs
  where id = p_run_id
  for update;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'published', false, 'reason', 'Staged file was not found.');
  end if;
  if v_status = 'published' then
    return pg_catalog.jsonb_build_object('ok', true, 'published', true, 'idempotent', true, 'run_id', p_run_id, 'approved_by', v_approved_by, 'approved_at', v_approved_at);
  end if;
  if v_status not in ('validated', 'staged') then
    return pg_catalog.jsonb_build_object('ok', false, 'published', false, 'reason', 'This file cannot be published.');
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(coalesce(v_facts, '[]'::jsonb)) item
    where item->>'kind' not in ('market_sales', 'brand_month', 'size', 'subsegment', 'product', 'dispensary', 'price_week')
  ) then
    return pg_catalog.jsonb_build_object('ok', false, 'published', false, 'reason', 'A staged row has an unknown kind.');
  end if;

  insert into market_intel.hoodie_market_sales_month (brand, period_month, state, category, dollars, run_id)
  select 'cedargrowth', (item->>'period_month')::date, item->>'state', item->>'category', market_intel.hoodie_num(item->>'dollars'), p_run_id
  from (
    select distinct on (item->>'period_month', item->>'state', item->>'category') item
    from pg_catalog.jsonb_array_elements(v_facts) item
    where item->>'kind' = 'market_sales'
    order by item->>'period_month', item->>'state', item->>'category'
  ) picked(item)
  on conflict (period_month, state, category) do update
  set dollars = excluded.dollars, run_id = excluded.run_id;

  insert into market_intel.hoodie_brand_month (
    brand, period_month, geography, brand_normalized, source_report, brand_display, is_cedargrowth, dollars,
    acv_pct, acv_chg_pct, dollars_per_mm_acv, dollars_per_mm_acv_chg_pct, total_dollars, total_dollars_chg_pct,
    total_units, units_chg_pct, wap, wap_chg_pct, dollars_per_mm_acv_per_sku, dollars_per_mm_acv_per_sku_chg_pct,
    avg_sku_oos_pct, avg_sku_oos_chg, avg_skus_per_disp, avg_skus_per_disp_chg_pct, dispensary_count,
    dispensary_count_chg, acv_max_pct, acv_max_chg, run_id
  )
  select 'cedargrowth',
    (item->>'period_month')::date,
    item->>'geography',
    item->>'brand_normalized',
    item->>'source_report',
    item->>'brand_display',
    coalesce((item->>'is_cedargrowth')::boolean, false),
    market_intel.hoodie_num(item->>'dollars'),
    market_intel.hoodie_num(item#>>'{metrics,acv_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,acv_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,dollars_per_mm_acv}'),
    market_intel.hoodie_num(item#>>'{metrics,dollars_per_mm_acv_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,total_dollars}'),
    market_intel.hoodie_num(item#>>'{metrics,total_dollars_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,total_units}'),
    market_intel.hoodie_num(item#>>'{metrics,units_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,wap}'),
    market_intel.hoodie_num(item#>>'{metrics,wap_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,dollars_per_mm_acv_per_sku}'),
    market_intel.hoodie_num(item#>>'{metrics,dollars_per_mm_acv_per_sku_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,avg_sku_oos_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,avg_sku_oos_chg}'),
    market_intel.hoodie_num(item#>>'{metrics,avg_skus_per_disp}'),
    market_intel.hoodie_num(item#>>'{metrics,avg_skus_per_disp_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,dispensary_count}'),
    market_intel.hoodie_num(item#>>'{metrics,dispensary_count_chg}'),
    market_intel.hoodie_num(item#>>'{metrics,acv_max_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,acv_max_chg}'),
    p_run_id
  from (
    select distinct on (item->>'period_month', item->>'geography', item->>'brand_normalized', item->>'source_report') item
    from pg_catalog.jsonb_array_elements(v_facts) item
    where item->>'kind' = 'brand_month'
    order by item->>'period_month', item->>'geography', item->>'brand_normalized', item->>'source_report'
  ) picked(item)
  on conflict (period_month, geography, brand_normalized, source_report) do update
  set brand_display = excluded.brand_display,
      is_cedargrowth = excluded.is_cedargrowth,
      dollars = excluded.dollars,
      acv_pct = excluded.acv_pct,
      acv_chg_pct = excluded.acv_chg_pct,
      dollars_per_mm_acv = excluded.dollars_per_mm_acv,
      dollars_per_mm_acv_chg_pct = excluded.dollars_per_mm_acv_chg_pct,
      total_dollars = excluded.total_dollars,
      total_dollars_chg_pct = excluded.total_dollars_chg_pct,
      total_units = excluded.total_units,
      units_chg_pct = excluded.units_chg_pct,
      wap = excluded.wap,
      wap_chg_pct = excluded.wap_chg_pct,
      dollars_per_mm_acv_per_sku = excluded.dollars_per_mm_acv_per_sku,
      dollars_per_mm_acv_per_sku_chg_pct = excluded.dollars_per_mm_acv_per_sku_chg_pct,
      avg_sku_oos_pct = excluded.avg_sku_oos_pct,
      avg_sku_oos_chg = excluded.avg_sku_oos_chg,
      avg_skus_per_disp = excluded.avg_skus_per_disp,
      avg_skus_per_disp_chg_pct = excluded.avg_skus_per_disp_chg_pct,
      dispensary_count = excluded.dispensary_count,
      dispensary_count_chg = excluded.dispensary_count_chg,
      acv_max_pct = excluded.acv_max_pct,
      acv_max_chg = excluded.acv_max_chg,
      run_id = excluded.run_id;

  insert into market_intel.hoodie_size_month (
    brand, period_month, geography, size_label, category, size_mg, size_unparsed,
    acv_pct, acv_chg_pct, dollars_per_mm_acv, dollars_per_mm_acv_chg_pct, total_dollars, total_dollars_chg_pct,
    total_units, units_chg_pct, wap, wap_chg_pct, dollars_per_mm_acv_per_sku, dollars_per_mm_acv_per_sku_chg_pct,
    avg_sku_oos_pct, avg_sku_oos_chg, avg_skus_per_disp, avg_skus_per_disp_chg_pct, dispensary_count,
    dispensary_count_chg, acv_max_pct, acv_max_chg, run_id
  )
  select 'cedargrowth', (item->>'period_month')::date, item->>'geography', item->>'size_label', item->>'category',
    market_intel.hoodie_num(item->>'size_mg'), coalesce((item->>'size_unparsed')::boolean, false),
    market_intel.hoodie_num(item#>>'{metrics,acv_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,acv_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,dollars_per_mm_acv}'),
    market_intel.hoodie_num(item#>>'{metrics,dollars_per_mm_acv_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,total_dollars}'),
    market_intel.hoodie_num(item#>>'{metrics,total_dollars_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,total_units}'),
    market_intel.hoodie_num(item#>>'{metrics,units_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,wap}'),
    market_intel.hoodie_num(item#>>'{metrics,wap_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,dollars_per_mm_acv_per_sku}'),
    market_intel.hoodie_num(item#>>'{metrics,dollars_per_mm_acv_per_sku_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,avg_sku_oos_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,avg_sku_oos_chg}'),
    market_intel.hoodie_num(item#>>'{metrics,avg_skus_per_disp}'),
    market_intel.hoodie_num(item#>>'{metrics,avg_skus_per_disp_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,dispensary_count}'),
    market_intel.hoodie_num(item#>>'{metrics,dispensary_count_chg}'),
    market_intel.hoodie_num(item#>>'{metrics,acv_max_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,acv_max_chg}'),
    p_run_id
  from (
    select distinct on (item->>'period_month', item->>'geography', item->>'size_label') item
    from pg_catalog.jsonb_array_elements(v_facts) item
    where item->>'kind' = 'size'
    order by item->>'period_month', item->>'geography', item->>'size_label'
  ) picked(item)
  on conflict (period_month, geography, size_label) do update
  set category = excluded.category, size_mg = excluded.size_mg, size_unparsed = excluded.size_unparsed,
      acv_pct = excluded.acv_pct, acv_chg_pct = excluded.acv_chg_pct,
      dollars_per_mm_acv = excluded.dollars_per_mm_acv, dollars_per_mm_acv_chg_pct = excluded.dollars_per_mm_acv_chg_pct,
      total_dollars = excluded.total_dollars, total_dollars_chg_pct = excluded.total_dollars_chg_pct,
      total_units = excluded.total_units, units_chg_pct = excluded.units_chg_pct,
      wap = excluded.wap, wap_chg_pct = excluded.wap_chg_pct,
      dollars_per_mm_acv_per_sku = excluded.dollars_per_mm_acv_per_sku,
      dollars_per_mm_acv_per_sku_chg_pct = excluded.dollars_per_mm_acv_per_sku_chg_pct,
      avg_sku_oos_pct = excluded.avg_sku_oos_pct, avg_sku_oos_chg = excluded.avg_sku_oos_chg,
      avg_skus_per_disp = excluded.avg_skus_per_disp, avg_skus_per_disp_chg_pct = excluded.avg_skus_per_disp_chg_pct,
      dispensary_count = excluded.dispensary_count, dispensary_count_chg = excluded.dispensary_count_chg,
      acv_max_pct = excluded.acv_max_pct, acv_max_chg = excluded.acv_max_chg, run_id = excluded.run_id;

  insert into market_intel.hoodie_subsegment_month (
    brand, period_month, geography, segment, sub_segment, category,
    acv_pct, acv_chg_pct, dollars_per_mm_acv, dollars_per_mm_acv_chg_pct, total_dollars, total_dollars_chg_pct,
    total_units, units_chg_pct, wap, wap_chg_pct, dollars_per_mm_acv_per_sku, dollars_per_mm_acv_per_sku_chg_pct,
    avg_sku_oos_pct, avg_sku_oos_chg, avg_skus_per_disp, avg_skus_per_disp_chg_pct, dispensary_count,
    dispensary_count_chg, acv_max_pct, acv_max_chg, run_id
  )
  select 'cedargrowth', (item->>'period_month')::date, item->>'geography', item->>'segment', item->>'sub_segment', item->>'category',
    market_intel.hoodie_num(item#>>'{metrics,acv_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,acv_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,dollars_per_mm_acv}'),
    market_intel.hoodie_num(item#>>'{metrics,dollars_per_mm_acv_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,total_dollars}'),
    market_intel.hoodie_num(item#>>'{metrics,total_dollars_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,total_units}'),
    market_intel.hoodie_num(item#>>'{metrics,units_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,wap}'),
    market_intel.hoodie_num(item#>>'{metrics,wap_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,dollars_per_mm_acv_per_sku}'),
    market_intel.hoodie_num(item#>>'{metrics,dollars_per_mm_acv_per_sku_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,avg_sku_oos_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,avg_sku_oos_chg}'),
    market_intel.hoodie_num(item#>>'{metrics,avg_skus_per_disp}'),
    market_intel.hoodie_num(item#>>'{metrics,avg_skus_per_disp_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,dispensary_count}'),
    market_intel.hoodie_num(item#>>'{metrics,dispensary_count_chg}'),
    market_intel.hoodie_num(item#>>'{metrics,acv_max_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,acv_max_chg}'),
    p_run_id
  from (
    select distinct on (item->>'period_month', item->>'geography', item->>'segment', item->>'sub_segment') item
    from pg_catalog.jsonb_array_elements(v_facts) item
    where item->>'kind' = 'subsegment'
    order by item->>'period_month', item->>'geography', item->>'segment', item->>'sub_segment'
  ) picked(item)
  on conflict (period_month, geography, segment, sub_segment) do update
  set category = excluded.category,
      acv_pct = excluded.acv_pct, acv_chg_pct = excluded.acv_chg_pct,
      dollars_per_mm_acv = excluded.dollars_per_mm_acv, dollars_per_mm_acv_chg_pct = excluded.dollars_per_mm_acv_chg_pct,
      total_dollars = excluded.total_dollars, total_dollars_chg_pct = excluded.total_dollars_chg_pct,
      total_units = excluded.total_units, units_chg_pct = excluded.units_chg_pct,
      wap = excluded.wap, wap_chg_pct = excluded.wap_chg_pct,
      dollars_per_mm_acv_per_sku = excluded.dollars_per_mm_acv_per_sku,
      dollars_per_mm_acv_per_sku_chg_pct = excluded.dollars_per_mm_acv_per_sku_chg_pct,
      avg_sku_oos_pct = excluded.avg_sku_oos_pct, avg_sku_oos_chg = excluded.avg_sku_oos_chg,
      avg_skus_per_disp = excluded.avg_skus_per_disp, avg_skus_per_disp_chg_pct = excluded.avg_skus_per_disp_chg_pct,
      dispensary_count = excluded.dispensary_count, dispensary_count_chg = excluded.dispensary_count_chg,
      acv_max_pct = excluded.acv_max_pct, acv_max_chg = excluded.acv_max_chg, run_id = excluded.run_id;

  insert into market_intel.hoodie_product_month (
    brand, period_month, geography, product_normalized, product_name, category, segment, brand_parsed,
    brand_parse_status, size_mg_parsed, size_approximate, is_live_rosin,
    acv_pct, acv_chg_pct, dollars_per_mm_acv, dollars_per_mm_acv_chg_pct, total_dollars, total_dollars_chg_pct,
    total_units, units_chg_pct, wap, wap_chg_pct, dollars_per_mm_acv_per_sku, dollars_per_mm_acv_per_sku_chg_pct,
    avg_sku_oos_pct, avg_sku_oos_chg, avg_skus_per_disp, avg_skus_per_disp_chg_pct, dispensary_count,
    dispensary_count_chg, acv_max_pct, acv_max_chg, run_id
  )
  select 'cedargrowth', (item->>'period_month')::date, item->>'geography', item->>'product_normalized', item->>'product_name',
    item->>'category', item->>'segment', nullif(item->>'brand_parsed', ''),
    coalesce(item->>'brand_parse_status', 'unparsed'),
    market_intel.hoodie_num(item->>'size_mg_parsed'),
    coalesce((item->>'size_approximate')::boolean, false),
    true,
    market_intel.hoodie_num(item#>>'{metrics,acv_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,acv_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,dollars_per_mm_acv}'),
    market_intel.hoodie_num(item#>>'{metrics,dollars_per_mm_acv_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,total_dollars}'),
    market_intel.hoodie_num(item#>>'{metrics,total_dollars_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,total_units}'),
    market_intel.hoodie_num(item#>>'{metrics,units_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,wap}'),
    market_intel.hoodie_num(item#>>'{metrics,wap_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,dollars_per_mm_acv_per_sku}'),
    market_intel.hoodie_num(item#>>'{metrics,dollars_per_mm_acv_per_sku_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,avg_sku_oos_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,avg_sku_oos_chg}'),
    market_intel.hoodie_num(item#>>'{metrics,avg_skus_per_disp}'),
    market_intel.hoodie_num(item#>>'{metrics,avg_skus_per_disp_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,dispensary_count}'),
    market_intel.hoodie_num(item#>>'{metrics,dispensary_count_chg}'),
    market_intel.hoodie_num(item#>>'{metrics,acv_max_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,acv_max_chg}'),
    p_run_id
  from (
    select distinct on (item->>'period_month', item->>'geography', item->>'product_normalized') item
    from pg_catalog.jsonb_array_elements(v_facts) item
    where item->>'kind' = 'product'
    order by item->>'period_month', item->>'geography', item->>'product_normalized'
  ) picked(item)
  on conflict (period_month, geography, product_normalized) do update
  set product_name = excluded.product_name, category = excluded.category, segment = excluded.segment,
      brand_parsed = excluded.brand_parsed, brand_parse_status = excluded.brand_parse_status,
      size_mg_parsed = excluded.size_mg_parsed, size_approximate = excluded.size_approximate,
      is_live_rosin = excluded.is_live_rosin,
      acv_pct = excluded.acv_pct, acv_chg_pct = excluded.acv_chg_pct,
      dollars_per_mm_acv = excluded.dollars_per_mm_acv, dollars_per_mm_acv_chg_pct = excluded.dollars_per_mm_acv_chg_pct,
      total_dollars = excluded.total_dollars, total_dollars_chg_pct = excluded.total_dollars_chg_pct,
      total_units = excluded.total_units, units_chg_pct = excluded.units_chg_pct,
      wap = excluded.wap, wap_chg_pct = excluded.wap_chg_pct,
      dollars_per_mm_acv_per_sku = excluded.dollars_per_mm_acv_per_sku,
      dollars_per_mm_acv_per_sku_chg_pct = excluded.dollars_per_mm_acv_per_sku_chg_pct,
      avg_sku_oos_pct = excluded.avg_sku_oos_pct, avg_sku_oos_chg = excluded.avg_sku_oos_chg,
      avg_skus_per_disp = excluded.avg_skus_per_disp, avg_skus_per_disp_chg_pct = excluded.avg_skus_per_disp_chg_pct,
      dispensary_count = excluded.dispensary_count, dispensary_count_chg = excluded.dispensary_count_chg,
      acv_max_pct = excluded.acv_max_pct, acv_max_chg = excluded.acv_max_chg, run_id = excluded.run_id;

  insert into market_intel.hoodie_dispensary_month (
    brand, period_month, geography, name_normalized, name_raw, account_id, match_status,
    acv_pct, acv_chg_pct, dollars_per_mm_acv, dollars_per_mm_acv_chg_pct, total_dollars, total_dollars_chg_pct,
    total_units, units_chg_pct, wap, wap_chg_pct, dollars_per_mm_acv_per_sku, dollars_per_mm_acv_per_sku_chg_pct,
    avg_sku_oos_pct, avg_sku_oos_chg, avg_skus_per_disp, avg_skus_per_disp_chg_pct, dispensary_count,
    dispensary_count_chg, acv_max_pct, acv_max_chg, run_id
  )
  select 'cedargrowth',
    (item->>'period_month')::date,
    item->>'geography',
    item->>'name_normalized',
    item->>'name_raw',
    case
      when item->>'match_status' = 'residual' then null
      when q.resolved_choice = 'account' then q.resolved_account_id
      when q.resolved_choice = 'none' then null
      when coalesce(item->>'account_id', '') = '' then null
      else (item->>'account_id')::uuid
    end,
    case
      when item->>'match_status' = 'residual' then 'residual'
      when q.resolved_choice = 'account' then 'manual'
      when q.resolved_choice = 'none' then 'none'
      else item->>'match_status'
    end,
    market_intel.hoodie_num(item#>>'{metrics,acv_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,acv_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,dollars_per_mm_acv}'),
    market_intel.hoodie_num(item#>>'{metrics,dollars_per_mm_acv_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,total_dollars}'),
    market_intel.hoodie_num(item#>>'{metrics,total_dollars_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,total_units}'),
    market_intel.hoodie_num(item#>>'{metrics,units_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,wap}'),
    market_intel.hoodie_num(item#>>'{metrics,wap_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,dollars_per_mm_acv_per_sku}'),
    market_intel.hoodie_num(item#>>'{metrics,dollars_per_mm_acv_per_sku_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,avg_sku_oos_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,avg_sku_oos_chg}'),
    market_intel.hoodie_num(item#>>'{metrics,avg_skus_per_disp}'),
    market_intel.hoodie_num(item#>>'{metrics,avg_skus_per_disp_chg_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,dispensary_count}'),
    market_intel.hoodie_num(item#>>'{metrics,dispensary_count_chg}'),
    market_intel.hoodie_num(item#>>'{metrics,acv_max_pct}'),
    market_intel.hoodie_num(item#>>'{metrics,acv_max_chg}'),
    p_run_id
  from (
    select distinct on (item->>'period_month', item->>'geography', item->>'name_normalized') item
    from pg_catalog.jsonb_array_elements(v_facts) item
    where item->>'kind' = 'dispensary'
    order by item->>'period_month', item->>'geography', item->>'name_normalized'
  ) picked(item)
  left join market_intel.hoodie_match_queue q
    on q.brand = 'cedargrowth' and q.name_normalized = item->>'name_normalized'
  on conflict (period_month, geography, name_normalized) do update
  set name_raw = excluded.name_raw, account_id = excluded.account_id, match_status = excluded.match_status,
      acv_pct = excluded.acv_pct, acv_chg_pct = excluded.acv_chg_pct,
      dollars_per_mm_acv = excluded.dollars_per_mm_acv, dollars_per_mm_acv_chg_pct = excluded.dollars_per_mm_acv_chg_pct,
      total_dollars = excluded.total_dollars, total_dollars_chg_pct = excluded.total_dollars_chg_pct,
      total_units = excluded.total_units, units_chg_pct = excluded.units_chg_pct,
      wap = excluded.wap, wap_chg_pct = excluded.wap_chg_pct,
      dollars_per_mm_acv_per_sku = excluded.dollars_per_mm_acv_per_sku,
      dollars_per_mm_acv_per_sku_chg_pct = excluded.dollars_per_mm_acv_per_sku_chg_pct,
      avg_sku_oos_pct = excluded.avg_sku_oos_pct, avg_sku_oos_chg = excluded.avg_sku_oos_chg,
      avg_skus_per_disp = excluded.avg_skus_per_disp, avg_skus_per_disp_chg_pct = excluded.avg_skus_per_disp_chg_pct,
      dispensary_count = excluded.dispensary_count, dispensary_count_chg = excluded.dispensary_count_chg,
      acv_max_pct = excluded.acv_max_pct, acv_max_chg = excluded.acv_max_chg, run_id = excluded.run_id;

  insert into market_intel.hoodie_price_week (brand, week_start, segment, unit_of_measure, category, original_price_avg, run_id)
  select 'cedargrowth', (item->>'week_start')::date, item->>'segment', item->>'unit_of_measure', item->>'category',
    market_intel.hoodie_num(item->>'original_price_avg'), p_run_id
  from (
    select distinct on (item->>'week_start', item->>'segment', item->>'unit_of_measure') item
    from pg_catalog.jsonb_array_elements(v_facts) item
    where item->>'kind' = 'price_week'
    order by item->>'week_start', item->>'segment', item->>'unit_of_measure'
  ) picked(item)
  on conflict (week_start, segment, unit_of_measure) do update
  set category = excluded.category, original_price_avg = excluded.original_price_avg, run_id = excluded.run_id;

  update market_intel.hoodie_import_runs
  set status = 'superseded'
  where id <> p_run_id
    and report_type = v_report
    and status = 'published'
    and brand = 'cedargrowth';

  update market_intel.hoodie_import_runs
  set status = 'published', approved_by = p_approved_by, approved_at = pg_catalog.now()
  where id = p_run_id;

  get diagnostics v_count = row_count;
  return pg_catalog.jsonb_build_object('ok', true, 'published', true, 'idempotent', false, 'run_id', p_run_id, 'approved_by', p_approved_by);
end;
$$;

comment on function public.hoodie_publish_import(uuid, text) is
  'Q-B1 PENDING. Publishes one staged file after a named staff approver. Upserts on natural keys. A second call keeps the original approver and time. Does not create accounts.';

create or replace function public.hoodie_match_resolutions()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_rows jsonb;
begin
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'name_normalized', name_normalized,
    'choice', resolved_choice,
    'account_id', resolved_account_id
  )), '[]'::jsonb)
  into v_rows
  from market_intel.hoodie_match_queue
  where brand = 'cedargrowth' and resolved_choice is not null;
  return v_rows;
end;
$$;

comment on function public.hoodie_match_resolutions() is
  'Q-B1 PENDING. Returns store resolutions so a later month reuses them. Does not create accounts.';

create or replace function public.hoodie_resolve_match(
  p_name_normalized text,
  p_choice text,
  p_account_id uuid,
  p_resolved_by text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_id uuid;
begin
  if p_resolved_by is null or p_resolved_by !~ '^[^[:space:]@]+@[^[:space:]@]+$' then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'A named staff approver is required.');
  end if;
  if p_choice = 'none' then
    update market_intel.hoodie_match_queue
    set resolved_choice = 'none', resolved_account_id = null, resolved_by = p_resolved_by, resolved_at = pg_catalog.now()
    where brand = 'cedargrowth' and name_normalized = p_name_normalized
    returning id into v_id;
  elsif p_choice = 'account' and p_account_id is not null then
    update market_intel.hoodie_match_queue
    set resolved_choice = 'account', resolved_account_id = p_account_id, resolved_by = p_resolved_by, resolved_at = pg_catalog.now()
    where brand = 'cedargrowth' and name_normalized = p_name_normalized
    returning id into v_id;
  else
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'The match choice is not recognized.');
  end if;
  if v_id is null then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'That store is not in the review queue.');
  end if;
  return pg_catalog.jsonb_build_object('ok', true, 'id', v_id, 'created_account', false);
end;
$$;

comment on function public.hoodie_resolve_match(text, text, uuid, text) is
  'Q-B1 PENDING. Records a reviewer choice of an existing account id or none. Does not create an account.';

revoke all on function public.hoodie_stage_import(jsonb) from public, anon, authenticated;
revoke all on function public.hoodie_publish_import(uuid, text) from public, anon, authenticated;
revoke all on function public.hoodie_match_resolutions() from public, anon, authenticated;
revoke all on function public.hoodie_resolve_match(text, text, uuid, text) from public, anon, authenticated;

grant execute on function public.hoodie_stage_import(jsonb) to service_role;
grant execute on function public.hoodie_publish_import(uuid, text) to service_role;
grant execute on function public.hoodie_match_resolutions() to service_role;
grant execute on function public.hoodie_resolve_match(text, text, uuid, text) to service_role;

revoke all on all tables in schema market_intel from public, anon, authenticated, service_role;
revoke all on all sequences in schema market_intel from public, anon, authenticated, service_role;
revoke all on all functions in schema market_intel from public, anon, authenticated, service_role;
revoke all on schema market_intel from public, anon, authenticated, service_role;

do $$
declare
  v_table text;
  v_bad integer;
  v_tables text[] := array[
    'hoodie_import_runs',
    'hoodie_stg_rows',
    'hoodie_market_sales_month',
    'hoodie_brand_month',
    'hoodie_size_month',
    'hoodie_subsegment_month',
    'hoodie_product_month',
    'hoodie_dispensary_month',
    'hoodie_price_week',
    'hoodie_match_queue',
    'hoodie_pricing_targets'
  ];
begin
  if (
    select count(*) from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'market_intel' and c.relkind = 'r'
  ) <> 11 then
    raise exception '0142 expected 11 market_intel tables.';
  end if;
  foreach v_table in array v_tables loop
    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'market_intel' and c.relname = v_table
        and c.relrowsecurity and c.relforcerowsecurity
    ) then
      raise exception '0142 forced row level security is missing on %.', v_table;
    end if;
    if exists (
      select 1 from pg_policy pol
      join pg_class c on c.oid = pol.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'market_intel' and c.relname = v_table
    ) then
      raise exception '0142 did not expect a policy on %.', v_table;
    end if;
  end loop;
  select count(*) into v_bad
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  where n.nspname = 'market_intel'
    and c.relkind = 'r'
    and (
      a.grantee = 0
      or a.grantee in (select oid from pg_roles where rolname in ('anon', 'authenticated', 'service_role'))
    );
  if v_bad <> 0 then
    raise exception '0142 left table privileges for public, anon, authenticated, or service_role.';
  end if;
  if has_schema_privilege('anon', 'market_intel', 'usage')
     or has_schema_privilege('authenticated', 'market_intel', 'usage')
     or has_schema_privilege('service_role', 'market_intel', 'usage') then
    raise exception '0142 left schema usage granted.';
  end if;
  if has_function_privilege('anon', 'public.hoodie_stage_import(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.hoodie_stage_import(jsonb)', 'execute')
     or has_function_privilege('anon', 'public.hoodie_publish_import(uuid, text)', 'execute')
     or not has_function_privilege('service_role', 'public.hoodie_stage_import(jsonb)', 'execute')
     or not has_function_privilege('service_role', 'public.hoodie_publish_import(uuid, text)', 'execute')
     or not has_function_privilege('service_role', 'public.hoodie_match_resolutions()', 'execute')
     or not has_function_privilege('service_role', 'public.hoodie_resolve_match(text, text, uuid, text)', 'execute') then
    raise exception '0142 function execute grants are wrong.';
  end if;
  if has_function_privilege('service_role', 'market_intel.hoodie_num(text)', 'execute')
     or has_function_privilege('anon', 'market_intel.hoodie_num(text)', 'execute') then
    raise exception '0142 helper function was left executable.';
  end if;
end $$;
