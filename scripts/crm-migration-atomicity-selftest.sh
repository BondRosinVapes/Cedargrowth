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

ACL=$(sudo -u postgres psql -d "$DB" -tA -c "select has_function_privilege('anon', p.oid, 'execute')::text || ',' || has_function_privilege('authenticated', p.oid, 'execute')::text || ',' || has_function_privilege('service_role', p.oid, 'execute')::text || ',' || coalesce((select bool_or(e.grantee = 0 and e.privilege_type = 'EXECUTE') from aclexplode(p.proacl) e), false)::text || ',' || coalesce(array_to_string(p.proconfig, '|'), '') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'crm_private' and p.proname = 'audit_note';")
if [ "$ACL" != "false,false,true,false,search_path=pg_catalog" ]; then
  echo "FAIL: audit_note acl ${ACL}"
  exit 1
fi
OLDER=$(sudo -u postgres psql -d "$DB" -tA -c "select coalesce((select bool_or(e.grantee = 0 and e.privilege_type = 'EXECUTE') from aclexplode(p.proacl) e), false)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'crm_private' and p.proname = 'audit_account';")
if [ "$OLDER" != "false" ]; then
  echo "FAIL: audit_account public execute ${OLDER}"
  exit 1
fi
echo 'ok: audit_note execute matches the older revoke and pins search_path'
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -c "set role service_role; insert into public.crm_notes (brand, account_id, body, actor) select 'cedargrowth', id, 'TEST ONLY service role note', 'test-only' from public.crm_accounts limit 1;" >/dev/null
echo 'ok: service_role can still append a note through the pinned function'

sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "drop database ${DB};" >/dev/null

UP=crm_suite_upgrade
sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists ${UP};" >/dev/null
sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "create database ${UP};" >/dev/null
cat > /tmp/crm-prior.sql <<EOF
\\ir ${ROOT}/supabase/migrations/0120_crm_internal_wholesale.sql
\\ir ${ROOT}/supabase/migrations/0121_crm_sales_intelligence.sql
\\ir ${ROOT}/supabase/migrations/0122_crm_sales_membership.sql
EOF
sudo -u postgres psql -d "$UP" -v ON_ERROR_STOP=1 --single-transaction -f /tmp/crm-prior.sql >/tmp/crm-prior.log
sudo -u postgres psql -d "$UP" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
insert into public.crm_accounts (brand, display_name, status, created_by, updated_by)
values ('cedargrowth', 'TEST ONLY legacy account', 'prospect', 'test-only', 'test-only');
insert into public.crm_opportunities (brand, account_id, name, stage, created_by, updated_by)
select 'cedargrowth', id, '1 lead', 'lead', 'test-only', 'test-only' from public.crm_accounts
union all select 'cedargrowth', id, '2 qualified', 'qualified', 'test-only', 'test-only' from public.crm_accounts
union all select 'cedargrowth', id, '3 proposal', 'proposal', 'test-only', 'test-only' from public.crm_accounts
union all select 'cedargrowth', id, '4 committed', 'committed', 'test-only', 'test-only' from public.crm_accounts
union all select 'cedargrowth', id, '5 closed_won', 'closed_won', 'test-only', 'test-only' from public.crm_accounts
union all select 'cedargrowth', id, '6 closed_lost', 'closed_lost', 'test-only', 'test-only' from public.crm_accounts;
SQL

cat > /tmp/crm-upgrade-fail.sql <<EOF
\\ir ${ROOT}/supabase/migrations/0123_crm_suite_workflows.sql
select 1/0;
EOF
set +e
sudo -u postgres psql -d "$UP" -v ON_ERROR_STOP=1 --single-transaction -f /tmp/crm-upgrade-fail.sql >/tmp/crm-upgrade-fail.log 2>&1
UP_FAIL=$?
set -e
if [ "$UP_FAIL" -eq 0 ]; then
  echo 'FAIL: injected upgrade error did not abort'
  exit 1
fi
STILL=$(sudo -u postgres psql -d "$UP" -tA -c "select (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'crm_opportunities' and column_name = 'legacy_stage') || ',' || (select count(*) from public.crm_opportunities where stage = 'qualified') || ',' || (select position('qualified' in pg_get_constraintdef(oid)) > 0 from pg_constraint where conname = 'crm_opportunities_stage_check');")
if [ "$STILL" != "0,1,true" ]; then
  echo "FAIL: upgrade rollback state ${STILL}"
  exit 1
fi
echo 'ok: injected upgrade failure kept the qualified row and the previous check'

sudo -u postgres psql -d "$UP" -v ON_ERROR_STOP=1 --single-transaction -f "${ROOT}/scripts/crm-apply-0123.sql" >/tmp/crm-upgrade-ok.log
MAPPED=$(sudo -u postgres psql -d "$UP" -tA -c "select name || ':' || stage || ':' || coalesce(legacy_stage, '-') || ':' || coalesce(loss_reason, '-') from public.crm_opportunities order by name;")
EXPECTED=$(printf '%s\n' '1 lead:lead:-:-' '2 qualified:qualification:qualified:-' '3 proposal:proposal:-:-' '4 committed:proposal:committed:-' '5 closed_won:won:closed_won:-' '6 closed_lost:lost:closed_lost:Legacy stage closed_lost. No loss reason was stored.')
if [ "$MAPPED" != "$EXPECTED" ]; then
  echo "FAIL: stage map"
  printf '%s\n' "$MAPPED"
  exit 1
fi
echo 'ok: atomic upgrade rewrote every prior stage and kept the original token'
set +e
sudo -u postgres psql -d "$UP" -v ON_ERROR_STOP=1 -c "insert into public.crm_opportunities (brand, account_id, name, stage, created_by, updated_by) select 'cedargrowth', id, 'TEST ONLY after', 'qualified', 'test-only', 'test-only' from public.crm_accounts limit 1;" >/tmp/crm-qualified-after.log 2>&1
AFTER=$?
set -e
if [ "$AFTER" -eq 0 ]; then
  echo 'FAIL: qualified was accepted after the upgrade'
  exit 1
fi
echo 'ok: qualified is not a stage after the upgrade'

BAD=crm_suite_unsupported
sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists ${BAD};" >/dev/null
sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "create database ${BAD};" >/dev/null
sudo -u postgres psql -d "$BAD" -v ON_ERROR_STOP=1 --single-transaction -f /tmp/crm-prior.sql >/tmp/crm-bad-prior.log
sudo -u postgres psql -d "$BAD" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
insert into public.crm_accounts (brand, display_name, status, created_by, updated_by)
values ('cedargrowth', 'TEST ONLY unsupported account', 'prospect', 'test-only', 'test-only');
alter table public.crm_opportunities drop constraint crm_opportunities_stage_check;
insert into public.crm_opportunities (brand, account_id, name, stage, created_by, updated_by)
select 'cedargrowth', id, 'TEST ONLY unsupported', 'not-a-stage', 'test-only', 'test-only' from public.crm_accounts;
SQL
set +e
sudo -u postgres psql -d "$BAD" -v ON_ERROR_STOP=1 --single-transaction -f "${ROOT}/scripts/crm-apply-0123.sql" >/tmp/crm-bad-upgrade.log 2>&1
BAD_CODE=$?
set -e
if [ "$BAD_CODE" -eq 0 ]; then
  echo 'FAIL: unsupported stage upgrade succeeded'
  exit 1
fi
BAD_STATE=$(sudo -u postgres psql -d "$BAD" -tA -c "select (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'crm_opportunities' and column_name = 'legacy_stage') || ',' || (select stage from public.crm_opportunities);")
if [ "$BAD_STATE" != "0,not-a-stage" ]; then
  echo "FAIL: unsupported upgrade state ${BAD_STATE}"
  exit 1
fi
echo 'ok: unsupported stage aborted the atomic upgrade and left the row unchanged'

sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "drop database ${UP};" >/dev/null
sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "drop database ${BAD};" >/dev/null
echo 'All CRM migration atomicity checks passed.'
