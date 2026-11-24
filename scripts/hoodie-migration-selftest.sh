#!/bin/sh
# Proves migration 0142 on a throwaway local database.
# Does not touch a hosted project. Does not load the Hoodie source files.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DB=hoodie_0142_selftest
PSQL=${PSQL:-psql}
if ! command -v "$PSQL" >/dev/null 2>&1; then
  echo 'FAIL: psql is not available'
  exit 1
fi

drop_sql="drop database if exists ${DB};"
create_sql="create database ${DB};"
if command -v sudo >/dev/null 2>&1 && id postgres >/dev/null 2>&1; then
  sudo -u postgres "$PSQL" -d postgres -v ON_ERROR_STOP=1 -c "$drop_sql" >/dev/null
  sudo -u postgres "$PSQL" -d postgres -v ON_ERROR_STOP=1 -c "$create_sql" >/dev/null
  run() { sudo -u postgres "$PSQL" -d "$DB" -v ON_ERROR_STOP=1 "$@"; }
else
  "$PSQL" -d postgres -v ON_ERROR_STOP=1 -c "$drop_sql" >/dev/null
  "$PSQL" -d postgres -v ON_ERROR_STOP=1 -c "$create_sql" >/dev/null
  run() { "$PSQL" -d "$DB" -v ON_ERROR_STOP=1 "$@"; }
fi

run -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if; if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if; if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if; end \$\$;" >/dev/null
run --single-transaction -f "$ROOT/supabase/migrations/0142_market_intel_hoodie.sql" >/tmp/hoodie-0142-apply.log

TABLES=$(run -tA -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='market_intel' and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity;")
if [ "$TABLES" != "11" ]; then
  echo "FAIL: forced rls tables ${TABLES}"
  exit 1
fi
echo 'ok: 11 market_intel tables have forced row level security'

run <<'SQL' >/tmp/hoodie-0142-behavior.log
select set_config('hoodie.sha', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', false);
SQL

export PGOPTIONS='-c statement_timeout=30000'
SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
SHA2=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb

STAGE=$(run -tA -c "select public.hoodie_stage_import(jsonb_build_object(
  'sha256', '${SHA}',
  'report_type', 'F1',
  'geography', null,
  'period_month', '2026-10-01',
  'compare_month', null,
  'grain', 'month',
  'file_name', 'fixture.csv',
  'column_signature', 'State|Category',
  'uploaded_by', 'ops@cedargrowthco.com',
  'validation_report', jsonb_build_object('errors', '[]'::jsonb, 'warnings', '[]'::jsonb),
  'rows', jsonb_build_array(jsonb_build_object('row_num', 1, 'raw', jsonb_build_object('Category','Vapes'), 'parsed', '[]'::jsonb)),
  'fact_rows', jsonb_build_array(jsonb_build_object('kind','market_sales','period_month','2026-10-01','state','NY','category','Vapes','dollars','20.50')),
  'queue', '[]'::jsonb
))::text;")
RUN=$(printf '%s' "$STAGE" | sed -n 's/.*"run_id" : "\([^"]*\)".*/\1/p')
if [ -z "$RUN" ]; then
  RUN=$(printf '%s' "$STAGE" | sed -n 's/.*"run_id": "\([^"]*\)".*/\1/p')
fi
echo "stage: $STAGE"
if ! printf '%s' "$STAGE" | grep -q '"published": false'; then
  echo 'FAIL: stage published facts'
  exit 1
fi
FACTS=$(run -tA -c "select count(*) from market_intel.hoodie_market_sales_month;")
if [ "$FACTS" != "0" ]; then
  echo "FAIL: facts existed before approval (${FACTS})"
  exit 1
fi
echo 'ok: stage writes no published facts'

UNNAMED=$(run -tA -c "select public.hoodie_publish_import('${RUN}'::uuid, 'Sales session')::text;")
if ! printf '%s' "$UNNAMED" | grep -q '"published": false'; then
  echo "FAIL: unnamed publish was accepted: $UNNAMED"
  exit 1
fi
echo 'ok: unnamed approver publishes nothing'

PUB=$(run -tA -c "select public.hoodie_publish_import('${RUN}'::uuid, 'ops@cedargrowthco.com')::text;")
if ! printf '%s' "$PUB" | grep -q '"published": true'; then
  echo "FAIL: named publish failed: $PUB"
  exit 1
fi
AGAIN=$(run -tA -c "select public.hoodie_publish_import('${RUN}'::uuid, 'other@cedargrowthco.com')::text;")
COUNT=$(run -tA -c "select count(*)::text || ',' || dollars::text || ',' || approved_by || ',' || (approved_at = (select approved_at from market_intel.hoodie_import_runs where id = '${RUN}'::uuid))::text from market_intel.hoodie_market_sales_month m join market_intel.hoodie_import_runs r on r.id = '${RUN}'::uuid group by dollars, approved_by, approved_at;")
if [ "$COUNT" != "1,20.50,ops@cedargrowthco.com,true" ]; then
  echo "FAIL: publish result ${COUNT} second ${AGAIN}"
  exit 1
fi
echo 'ok: named publish upserts once and a second publish keeps the approver'

STAGE2=$(run -tA -c "select public.hoodie_stage_import(jsonb_build_object(
  'sha256', '${SHA2}',
  'report_type', 'F1',
  'grain', 'month',
  'period_month', '2026-10-01',
  'file_name', 'fixture-2.csv',
  'column_signature', 'State|Category',
  'uploaded_by', 'ops@cedargrowthco.com',
  'validation_report', jsonb_build_object('errors', '[]'::jsonb, 'warnings', '[]'::jsonb),
  'rows', jsonb_build_array(jsonb_build_object('row_num', 1, 'raw', '{}'::jsonb, 'parsed', '[]'::jsonb)),
  'fact_rows', jsonb_build_array(jsonb_build_object('kind','market_sales','period_month','2026-10-01','state','NY','category','Vapes','dollars','30.00')),
  'queue', '[]'::jsonb
))::text;")
RUN2=$(printf '%s' "$STAGE2" | sed -n 's/.*"run_id": "\([^"]*\)".*/\1/p')
run -c "select public.hoodie_publish_import('${RUN2}'::uuid, 'ops@cedargrowthco.com');" >/dev/null
AFTER=$(run -tA -c "select count(*)::text || ',' || dollars::text || ',' || (select status from market_intel.hoodie_import_runs where id = '${RUN}'::uuid) from market_intel.hoodie_market_sales_month group by dollars;")
if [ "$AFTER" != "1,30.00,superseded" ]; then
  echo "FAIL: upsert result ${AFTER}"
  exit 1
fi
DUP=$(run -tA -c "select (public.hoodie_stage_import(jsonb_build_object('sha256','${SHA2}','report_type','F1','grain','month','file_name','fixture-2.csv','column_signature','x','uploaded_by','ops@cedargrowthco.com','validation_report', jsonb_build_object('errors','[]'::jsonb),'rows','[]'::jsonb,'fact_rows','[]'::jsonb,'queue','[]'::jsonb))->>'duplicate');")
if [ "$DUP" != "true" ]; then
  echo "FAIL: duplicate checksum was not flagged"
  exit 1
fi
echo 'ok: a later file upserts the natural key, supersedes the first run, and a repeat checksum is duplicate'

STORE=$(run -tA -c "select public.hoodie_stage_import(jsonb_build_object(
  'sha256', 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  'report_type', 'F4',
  'geography', 'NY',
  'period_month', '2026-10-01',
  'compare_month', '2026-09-01',
  'grain', 'month',
  'file_name', 'stores.csv',
  'column_signature', 'Dispensary',
  'uploaded_by', 'ops@cedargrowthco.com',
  'validation_report', jsonb_build_object('errors', '[]'::jsonb, 'warnings', '[]'::jsonb),
  'rows', jsonb_build_array(jsonb_build_object('row_num', 1, 'raw', jsonb_build_object('Dispensary','Only Store'), 'parsed', '[]'::jsonb)),
  'fact_rows', jsonb_build_array(jsonb_build_object('kind','dispensary','period_month','2026-10-01','geography','NY','name_raw','Only Store','name_normalized','onlystore','match_status','queued','metrics', jsonb_build_object('total_dollars','20.50','total_units','4159.56','acv_chg_pct', null))),
  'queue', jsonb_build_array(jsonb_build_object('name_raw','Only Store','name_normalized','onlystore','geography','NY','candidate_account_ids','[]'::jsonb,'reason','No candidate account.'))
))::text;")
STORE_RUN=$(printf '%s' "$STORE" | sed -n 's/.*"run_id": "\([^"]*\)".*/\1/p')
run -c "select public.hoodie_publish_import('${STORE_RUN}'::uuid, 'ops@cedargrowthco.com');" >/dev/null
STORE_COUNT=$(run -tA -c "select (select count(*) from market_intel.hoodie_dispensary_month) || ',' || (select total_units::text from market_intel.hoodie_dispensary_month) || ',' || (select match_status from market_intel.hoodie_dispensary_month) || ',' || (select count(*) from market_intel.hoodie_match_queue) || ',' || (select count(*) from market_intel.hoodie_dispensary_month where account_id is not null);")
if [ "$STORE_COUNT" != "1,4159.56,queued,1,0" ]; then
  echo "FAIL: dispensary publish ${STORE_COUNT}"
  exit 1
fi
echo 'ok: dispensary publish queues the store and does not attach an account'

set +e
run -c "set role anon; select * from market_intel.hoodie_import_runs;" >/tmp/hoodie-0142-anon.log 2>&1
ANON=$?
set -e
if [ "$ANON" -eq 0 ]; then
  echo 'FAIL: anon read the market table'
  exit 1
fi
echo 'ok: anon cannot read market_intel'

CRM=$(run -tA -c "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'crm_%';")
if [ "$CRM" != "0" ]; then
  echo "FAIL: crm tables were created (${CRM})"
  exit 1
fi
echo 'ok: no crm account table was created'

echo 'hoodie migration self-test passed'
