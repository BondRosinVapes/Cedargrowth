#!/bin/sh
# Proves the CRM bundle commits together and rolls back together.
# Uses local Postgres only. Does not touch a hosted project.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DB=crm_suite_atomicity
sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists ${DB};" >/dev/null
sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "create database ${DB};" >/dev/null
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if; if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if; if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if; end \$\$;" >/dev/null

# Failure after the first file must not leave tables.
cat > /tmp/crm-bundle-fail.sql <<EOF
\\ir ${ROOT}/supabase/migrations/0120_crm_internal_wholesale.sql
select 1/0;
EOF
set +e
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 --single-transaction -f /tmp/crm-bundle-fail.sql >/tmp/crm-atomicity-fail.log 2>&1
FAIL_CODE=$?
set -e
if [ "$FAIL_CODE" -eq 0 ]; then
  echo 'FAIL: injected error did not abort'
  exit 1
fi
LEFT=$(sudo -u postgres psql -d "$DB" -tA -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'crm_%' and c.relkind='r';")
if [ "$LEFT" != "0" ]; then
  echo "FAIL: rollback left ${LEFT} crm tables"
  exit 1
fi
echo 'ok: injected failure left no crm tables'

sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 --single-transaction -f "${ROOT}/scripts/crm-apply-bundle.sql" >/tmp/crm-atomicity-ok.log
RLS=$(sudo -u postgres psql -d "$DB" -tA -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'crm_%' and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity;")
TABLES=$(sudo -u postgres psql -d "$DB" -tA -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'crm_%' and c.relkind='r';")
if [ "$RLS" != "$TABLES" ] || [ "$TABLES" = "0" ]; then
  echo "FAIL: rls ${RLS} tables ${TABLES}"
  exit 1
fi
echo "ok: bundle committed ${TABLES} tables with forced row level security"

expect_fail() {
  label=$1
  sql=$2
  set +e
  sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -c "$sql" >/tmp/crm-crud-fail.log 2>&1
  code=$?
  set -e
  if [ "$code" -eq 0 ]; then
    echo "FAIL: ${label} was accepted"
    exit 1
  fi
  echo "ok: ${label}"
}

sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 <<'SQL' >/tmp/crm-crud-ok.log
insert into public.crm_accounts (brand, display_name, status, created_by, updated_by, license_ref, facility_ref, assigned_rep)
values ('cedargrowth', 'TEST ONLY synthetic account', 'prospect', 'test-only', 'test-only', 'LIC-TEST', 'FAC-TEST', 'rep-label');
insert into public.crm_contacts (brand, account_id, name, preference, created_by, updated_by)
select 'cedargrowth', id, 'TEST ONLY synthetic contact', 'do_not_contact', 'test-only', 'test-only'
from public.crm_accounts where display_name = 'TEST ONLY synthetic account';
insert into public.crm_opportunities (brand, account_id, name, stage, forecast_cents, expected_close_on, created_by, updated_by)
select 'cedargrowth', id, 'TEST ONLY synthetic opportunity', 'licensed_buyer_review', 2500, '2026-01-01', 'test-only', 'test-only'
from public.crm_accounts where display_name = 'TEST ONLY synthetic account';
insert into public.crm_tasks (brand, title, status, owner_actor, due_on, created_by, updated_by)
values ('cedargrowth', 'TEST ONLY synthetic task', 'open', 'rep-label', '2026-11-12', 'test-only', 'test-only');
insert into public.crm_notes (brand, account_id, body, actor)
select 'cedargrowth', id, 'TEST ONLY synthetic actual note', 'test-only'
from public.crm_accounts where display_name = 'TEST ONLY synthetic account';
SQL

COUNTS=$(sudo -u postgres psql -d "$DB" -tA -c "select (select count(*) from public.crm_accounts) || ',' || (select count(*) from public.crm_contacts where preference = 'do_not_contact') || ',' || (select count(*) from public.crm_notes) || ',' || (select count(*) from public.crm_activity where kind = 'note_recorded');")
if [ "$COUNTS" != "1,1,1,1" ]; then
  echo "FAIL: isolated crud counts ${COUNTS}"
  exit 1
fi
echo 'ok: isolated database stored test-only account, contact, opportunity, task, and append-only note'

expect_fail 'lost opportunity without a reason' "insert into public.crm_opportunities (brand, account_id, name, stage, created_by, updated_by) select 'cedargrowth', id, 'TEST ONLY lost', 'lost', 'test-only', 'test-only' from public.crm_accounts limit 1;"
expect_fail 'retired stage name' "insert into public.crm_opportunities (brand, account_id, name, stage, created_by, updated_by) select 'cedargrowth', id, 'TEST ONLY old', 'qualified', 'test-only', 'test-only' from public.crm_accounts limit 1;"
expect_fail 'note rewrite' "update public.crm_notes set body = 'rewritten' where body like 'TEST ONLY%';"
expect_fail 'note delete' "delete from public.crm_notes where body like 'TEST ONLY%';"
expect_fail 'cross-brand note' "insert into public.crm_notes (brand, account_id, body, actor) select 'bond', id, 'TEST ONLY wrong brand', 'test-only' from public.crm_accounts limit 1;"
expect_fail 'anon read' "set role anon; select count(*) from public.crm_accounts;"
expect_fail 'service role note update' "set role service_role; update public.crm_notes set body = 'rewritten';"
expect_fail 'service role membership insert' "set role service_role; insert into public.crm_sales_memberships (auth_user_id, brand, desk_role) values ('00000000-0000-4000-8000-000000000099', 'cedargrowth', 'salesperson');"
expect_fail 'service role activity insert' "set role service_role; insert into public.crm_activity (brand, kind, summary, actor) values ('cedargrowth', 'note_recorded', 'TEST ONLY direct', 'test-only');"
expect_fail 'membership owner role' "insert into public.crm_sales_memberships (auth_user_id, brand, desk_role) values ('00000000-0000-4000-8000-000000000099', 'cedargrowth', 'owner');"

GRANTS=$(sudo -u postgres psql -d "$DB" -tA -c "select count(*) from information_schema.role_table_grants where grantee in ('anon', 'authenticated') and table_name like 'crm_%';")
if [ "$GRANTS" != "0" ]; then
  echo "FAIL: anon or authenticated still has ${GRANTS} crm grants"
  exit 1
fi
echo 'ok: anon and authenticated have no crm table grants'

sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "drop database ${DB};" >/dev/null
echo 'All CRM migration atomicity checks passed.'
