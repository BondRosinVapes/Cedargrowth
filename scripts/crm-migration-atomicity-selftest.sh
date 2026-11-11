#!/bin/sh
# Proves the CRM bundle commits together and rolls back together.
# Uses local Postgres only. Does not touch a hosted project.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DB=crm_suite_atomicity
sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "drop database if exists ${DB};" >/dev/null
sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "create database ${DB};" >/dev/null
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if; if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if; if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if; end \$\$;" >/dev/null
# Local stand-in for the Supabase storage schema. 0136 inserts the photo bucket into it.
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets (id),
  name text not null
);
alter table storage.objects enable row level security;
alter table storage.objects force row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant select on table storage.objects to anon, authenticated, service_role;
revoke insert, update, delete, truncate on table storage.objects from anon, authenticated;
SQL

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

awk -v root="$ROOT" '
  /^\\ir / {
    orig = $0
    sub(/^\\ir \.\.\//, "\\ir " root "/")
    if (orig ~ /0138_crm_card_and_supplier_intake\.sql$/) {
      print "alter default privileges for role postgres in schema public grant all on tables to service_role, anon, authenticated;"
      print "alter default privileges for role postgres in schema public grant all on functions to service_role, anon, authenticated;"
    }
    print
    next
  }
  { print }
' "${ROOT}/scripts/crm-apply-bundle.sql" > /tmp/crm-bundle-with-defaults.sql
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 --single-transaction -f /tmp/crm-bundle-with-defaults.sql >/tmp/crm-atomicity-ok.log
RLS=$(sudo -u postgres psql -d "$DB" -tA -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'crm_%' and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity;")
TABLES=$(sudo -u postgres psql -d "$DB" -tA -c "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'crm_%' and c.relkind='r';")
if [ "$RLS" != "$TABLES" ] || [ "$TABLES" = "0" ]; then
  echo "FAIL: rls ${RLS} tables ${TABLES}"
  exit 1
fi
echo "ok: bundle committed ${TABLES} tables with forced row level security"
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -f "${ROOT}/scripts/crm-check-0138-rls.sql" >/tmp/crm-0138-rls.log 2>&1
BYPASS_COUNT=$(grep -c 'can bypass forced row level security' /tmp/crm-0138-rls.log || true)
if [ "$BYPASS_COUNT" != "4" ]; then
  echo "FAIL: 0138 post-apply bypass check confirmed ${BYPASS_COUNT} function owners"
  exit 1
fi
echo 'ok: all four 0138 function owners still bypass forced row level security'

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

KINDS=$(sudo -u postgres psql -d "$DB" -tA -c "select pg_get_constraintdef(oid) from pg_constraint where conname = 'crm_activity_kind_check';")
echo "$KINDS" | grep -q 'digest_sent' && echo "$KINDS" | grep -q 'inquiry_received' || { echo 'FAIL: activity kinds'; exit 1; }
echo 'ok: activity kinds keep digest_sent and add inquiry_received'
RECV=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select public.crm_receive_bond_inquiry('11111111-1111-4111-8111-111111111111'::uuid, '2026-11-09T15:00:00Z', '2026-11-09T15:00:00Z', 'North Store', 'Ada Buyer', 'ada@northstore.test', '(716) 555-0100', 'OCM-1', '1 Main', 'Buffalo', '14201', 'Erie', 'Hello plain', 'v1:46652a17994f78d1', false)::text;")
REPLAY=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select public.crm_receive_bond_inquiry('11111111-1111-4111-8111-111111111111'::uuid, '2026-11-09T15:00:00Z', '2026-11-09T15:00:00Z', 'North Store', 'Ada Buyer', 'ada@northstore.test', '(716) 555-0100', 'OCM-1', '1 Main', 'Buffalo', '14201', 'Erie', 'Hello plain', 'v1:46652a17994f78d1', false)::text;")
DUP=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select public.crm_receive_bond_inquiry('22222222-2222-4222-8222-222222222222'::uuid, '2026-11-09T15:00:00Z', '2026-11-09T15:00:00Z', 'Other Shop', 'Bea Buyer', 'bea@other.test', '(716) 555-0100', 'OCM-1', '2 Main', 'Buffalo', '14201', 'Erie', null, 'v1:46652a17994f78d1', false)::text;")
COUNTS=$(sudo -u postgres psql -d "$DB" -tA -c "select (select count(*) from public.crm_accounts where brand = 'bond' and lead_source = 'bond_inquiry') || ',' || (select o.stage || ':' || coalesce(o.forecast_cents::text, 'null') || ':' || a.ocm_status from public.crm_opportunities o join public.crm_accounts a on a.id = o.account_id where o.brand = 'bond' limit 1) || ',' || (select body from public.crm_notes where brand = 'bond' and body = 'Hello plain') || ',' || (select count(*) from public.crm_activity where summary like '%ada@northstore.test%' or summary like '%Hello plain%') || ',' || (select count(*) from public.crm_intake_log);")
BOND_PHONE=$(sudo -u postgres psql -d "$DB" -tA -c "select phone from public.crm_contacts where email = 'ada@northstore.test';")
if [ "$RECV" != '{"ok": true, "duplicate": false}' ] || [ "$REPLAY" != '{"ok": true, "duplicate": true}' ] || [ "$DUP" != '{"ok": true, "duplicate": false}' ] || [ "$COUNTS" != "1,lead:null:unverified,Hello plain,0,2" ] || [ "$BOND_PHONE" != "+17165550100" ]; then
  echo "FAIL: bond intake ${RECV} ${REPLAY} ${DUP} ${COUNTS} phone=${BOND_PHONE}"
  exit 1
fi
echo 'ok: bond intake creates one lead, replays, and flags a weak duplicate'
expect_fail 'bond phone missing' "select public.crm_receive_bond_inquiry('76767676-7676-4767-8767-767676767676'::uuid, '2026-11-09T15:00:00Z', '2026-11-09T15:00:00Z', 'Missing Phone Shop', 'No Buyer', 'none@phone.test', null, 'NO-PHONE', '8 Main', 'Buffalo', '14201', 'Erie', null, 'v1:46652a17994f78d1', false);"
expect_fail 'bond phone empty' "select public.crm_receive_bond_inquiry('77777777-7777-4777-8777-777777777771'::uuid, '2026-11-09T15:00:00Z', '2026-11-09T15:00:00Z', 'Empty Phone Shop', 'No Buyer', 'empty@phone.test', '', 'EMPTY-PHONE', '8 Main', 'Buffalo', '14201', 'Erie', null, 'v1:46652a17994f78d1', false);"
expect_fail 'bond phone malformed' "select public.crm_receive_bond_inquiry('78787878-7878-4787-8787-787878787878'::uuid, '2026-11-09T15:00:00Z', '2026-11-09T15:00:00Z', 'Bad Phone Shop', 'No Buyer', 'bad@phone.test', '555-0100', 'BAD-PHONE', '8 Main', 'Buffalo', '14201', 'Erie', null, 'v1:46652a17994f78d1', false);"
BAD_PHONE_ROWS=$(sudo -u postgres psql -d "$DB" -tA -c "select count(*) from public.crm_accounts where display_name in ('Missing Phone Shop', 'Empty Phone Shop', 'Bad Phone Shop');")
if [ "$BAD_PHONE_ROWS" != "0" ]; then
  echo "FAIL: a bad dispensary phone wrote ${BAD_PHONE_ROWS} accounts"
  exit 1
fi
echo 'ok: a missing, empty, or malformed dispensary phone writes nothing'
EMAIL_COLS=$(sudo -u postgres psql -d "$DB" -tA -c "select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'crm_intake_deletions' and column_name like '%email%';")
DELETED=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select public.crm_delete_bond_inquiry('11111111-1111-4111-8111-111111111111'::uuid)::text;")
LEFT=$(sudo -u postgres psql -d "$DB" -tA -c "select (select count(*) from public.crm_accounts where brand = 'bond') || ',' || (select count(*) from public.crm_intake_log) || ',' || (select contact_name from public.crm_intake_deletions limit 1) || ',' || (select count(*) from public.crm_notes where body like '%ada@%');")
if [ "$EMAIL_COLS" != "0" ] || [ "$DELETED" != '{"ok": true, "deleted": true}' ] || [ "$LEFT" != "0,0,bond,0" ]; then
  echo "FAIL: intake deletion ${DELETED} ${LEFT}"
  exit 1
fi
echo 'ok: intake deletion removes the lead and records bond with no mailbox'
OLD=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select public.crm_receive_bond_inquiry('33333333-3333-4333-8333-333333333333'::uuid, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', 'Old Shop', 'Cara Buyer', 'cara@old.test', '(716) 555-0100', 'OLD-1', '3 Main', 'Buffalo', '14201', 'Erie', null, 'v1:46652a17994f78d1', false)::text;")
KEPT=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select public.crm_receive_bond_inquiry('44444444-4444-4444-8444-444444444444'::uuid, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', 'Kept Shop', 'Dan Buyer', 'dan@kept.test', '(716) 555-0100', 'KEPT-1', '4 Main', 'Buffalo', '14201', 'Erie', null, 'v1:46652a17994f78d1', false)::text;")
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -c "update public.crm_accounts set ocm_status = 'verified' where display_name = 'Kept Shop';" >/dev/null
PURGED=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select public.crm_purge_bond_inquiries('2026-11-09T15:00:00Z'::timestamptz)::text;")
AFTER=$(sudo -u postgres psql -d "$DB" -tA -c "select (select count(*) from public.crm_accounts where display_name = 'Old Shop') || ',' || (select count(*) from public.crm_accounts where display_name = 'Kept Shop') || ',' || (select ocm_status from public.crm_accounts where display_name = 'Kept Shop');")
if [ "$OLD" != '{"ok": true, "duplicate": false}' ] || [ "$KEPT" != '{"ok": true, "duplicate": false}' ] || [ "$PURGED" != '{"ok": true, "purged": 1}' ] || [ "$AFTER" != "0,1,verified" ]; then
  echo "FAIL: intake purge ${OLD} ${KEPT} ${PURGED} ${AFTER}"
  exit 1
fi
echo 'ok: purge removes an unverified lead and keeps a verified one'
EXEC=$(sudo -u postgres psql -d "$DB" -tA -c "select has_function_privilege('anon', 'public.crm_receive_bond_inquiry(uuid, timestamptz, timestamptz, text, text, text, text, text, text, text, text, text, text, text, boolean, text, text)', 'execute')::text || ',' || has_function_privilege('service_role', 'public.crm_receive_bond_inquiry(uuid, timestamptz, timestamptz, text, text, text, text, text, text, text, text, text, text, text, boolean, text, text)', 'execute')::text || ',' || has_table_privilege('service_role', 'public.crm_intake_log', 'insert')::text;")
if [ "$EXEC" != "false,true,false" ]; then
  echo "FAIL: intake grants ${EXEC}"
  exit 1
fi
echo 'ok: intake log is writable only through the service role function'
CARD=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select public.crm_receive_bond_inquiry('55555555-5555-4555-8555-555555555555'::uuid, '2026-11-09T15:00:00Z', '2026-11-09T15:00:00Z', 'Card Shop', 'Eve Buyer', 'eve@card.test', '(716) 555-0100', 'CARD-1', '5 Main', 'Buffalo', '14201', 'Erie', null, 'v1:46652a17994f78d1', false, '/card', 'nyc-2026')::text;")
CARD_ROW=$(sudo -u postgres psql -d "$DB" -tA -c "select a.lead_source || '|' || a.source_event || '|' || l.source_route || '|' || l.source_event from public.crm_accounts a join public.crm_intake_log l on l.inquiry_id = a.source_inquiry_id where a.display_name = 'Card Shop';")
set +e
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -c "select public.crm_receive_bond_inquiry('56565656-5656-4565-8565-565656565656'::uuid, '2026-11-09T15:00:00Z', '2026-11-09T15:00:00Z', 'Order Event', 'Fay Buyer', 'fay@order.test', '(716) 555-0100', 'ORD-9', '6 Main', 'Buffalo', '14201', 'Erie', null, 'v1:46652a17994f78d1', false, '/order', 'nyc-2026');" >/tmp/crm-order-event.log 2>&1
ORDER_EVENT=$?
set -e
SUP=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select public.crm_receive_supplier_inquiry('57575757-5757-4575-8575-575757575757'::uuid, '2026-11-09T15:00:00Z', 'TEST ONLY North Farm', null, 'cannabis_nys_adult_use_cultivator', 'OCM-AU-26-000123', 'Ada Grower', null, 'ada@northfarm.test', '(716) 555-0100', null, 'Erie', 'Frozen lot', 'v1:56b70a071c4714eb', '/card', 'nyc-2026')::text;")
SUP_REPLAY=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select public.crm_receive_supplier_inquiry('57575757-5757-4575-8575-575757575757'::uuid, '2026-11-09T15:00:00Z', 'TEST ONLY North Farm', null, 'cannabis_nys_adult_use_cultivator', 'OCM-AU-26-000123', 'Ada Grower', null, 'ada@northfarm.test', '(716) 555-0100', null, 'Erie', 'Frozen lot', 'v1:56b70a071c4714eb', '/card', 'nyc-2026')::text;")
SUP_ROW=$(sudo -u postgres psql -d "$DB" -tA -c "select (select count(*) from public.crm_supplier_inquiries) || ',' || (select count(*) from public.crm_accounts where display_name = 'TEST ONLY North Farm') || ',' || (select supply_type || '|' || license_number || '|' || consent_version || '|' || source_event || '|' || contact_phone from public.crm_supplier_inquiries);")
set +e
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -c "select public.crm_receive_supplier_inquiry('58585858-5858-4585-8585-585858585858'::uuid, '2026-11-09T15:00:00Z', 'TEST ONLY Bad County Farm', null, 'hemp_or_hemp_extract', null, 'Bea Grower', null, 'bea@farm.test', '(716) 555-0100', null, 'Brooklyn', null, 'v1:56b70a071c4714eb', '/card', 'nyc-2026');" >/tmp/crm-supplier-county.log 2>&1
SUP_COUNTY=$?
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -c "select public.crm_receive_supplier_inquiry('59595959-5959-4595-8595-595959595959'::uuid, '2026-11-09T15:00:00Z', 'TEST ONLY No License Farm', null, 'cannabis_nys_adult_use_cultivator', null, 'Cal Grower', null, 'cal@farm.test', '(716) 555-0100', null, 'Erie', null, 'v1:56b70a071c4714eb', '/card', 'nyc-2026');" >/tmp/crm-supplier-license.log 2>&1
SUP_LICENSE=$?
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -c "select public.crm_receive_supplier_inquiry('60606060-6060-4606-8606-606060606060'::uuid, '2026-11-09T15:00:00Z', 'TEST ONLY Dispensary Consent Farm', null, 'hemp_or_hemp_extract', null, 'Dee Grower', null, 'dee@farm.test', '(716) 555-0100', null, 'Erie', null, 'v1:46652a17994f78d1', '/card', 'nyc-2026');" >/tmp/crm-supplier-consent.log 2>&1
SUP_CONSENT=$?
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -c "select public.crm_receive_supplier_inquiry('63636363-6363-4636-8636-636363636363'::uuid, '2026-11-09T15:00:00Z', 'TEST ONLY ROD Farm', null, 'cannabis_nys_adult_use_cultivator', 'OCM-ROD-25-000001', 'Hal Grower', null, 'hal@farm.test', '(716) 555-0100', null, 'Erie', null, 'v1:56b70a071c4714eb', '/card', 'nyc-2026');" >/tmp/crm-supplier-rod.log 2>&1
SUP_ROD=$?
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -c "select public.crm_receive_bond_inquiry('64646464-6464-4646-8646-646464646464'::uuid, '2026-11-09T15:00:00Z', '2026-11-09T15:00:00Z', 'Mixed Consent', 'Ivy Buyer', 'ivy@mix.test', '(716) 555-0100', 'MIX-1', '7 Main', 'Buffalo', '14201', 'Erie', null, 'v1:56b70a071c4714eb', false, '/card', 'nyc-2026');" >/tmp/crm-card-consent.log 2>&1
CARD_MIX=$?
set -e
SUP_GRANT=$(sudo -u postgres psql -d "$DB" -tA -c "select has_table_privilege('anon', 'public.crm_supplier_inquiries', 'select')::text || ',' || has_function_privilege('anon', 'public.crm_receive_supplier_inquiry(uuid, timestamptz, text, text, text, text, text, text, text, text, text, text, text, text, text, text)', 'execute')::text;")
if [ "$CARD" != '{"ok": true, "duplicate": false}' ] || [ "$CARD_ROW" != "bond_inquiry|nyc-2026|/card|nyc-2026" ] || [ "$ORDER_EVENT" -eq 0 ] || [ "$SUP" != '{"ok": true, "duplicate": false}' ] || [ "$SUP_REPLAY" != '{"ok": true, "duplicate": true}' ] || [ "$SUP_ROW" != "1,0,cannabis_nys_adult_use_cultivator|OCM-AU-26-000123|v1:56b70a071c4714eb|nyc-2026|+17165550100" ] || [ "$SUP_COUNTY" -eq 0 ] || [ "$SUP_LICENSE" -eq 0 ] || [ "$SUP_CONSENT" -eq 0 ] || [ "$SUP_ROD" -eq 0 ] || [ "$CARD_MIX" -eq 0 ] || [ "$SUP_GRANT" != "false,false" ]; then
  echo "FAIL: card and supplier intake ${CARD} ${CARD_ROW} order=${ORDER_EVENT} ${SUP} ${SUP_REPLAY} ${SUP_ROW} county=${SUP_COUNTY} license=${SUP_LICENSE} consent=${SUP_CONSENT} rod=${SUP_ROD} mix=${CARD_MIX} grant=${SUP_GRANT}"
  exit 1
fi
echo 'ok: a card lead stores its event and a supplier lead stays out of accounts'
OLD_SUP=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select public.crm_receive_supplier_inquiry('61616161-6161-4616-8616-616161616161'::uuid, '2024-01-01T00:00:00Z', 'TEST ONLY Old Farm', null, 'hemp_or_hemp_extract', null, 'Fay Grower', null, 'fay@farm.test', '(716) 555-0100', null, 'Erie', null, 'v1:56b70a071c4714eb', '/card', 'nyc-2026')::text;")
KEPT_SUP=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select public.crm_receive_supplier_inquiry('62626262-6262-4626-8626-626262626262'::uuid, '2024-01-01T00:00:00Z', 'TEST ONLY Kept Farm', null, 'non_cannabis_inputs', null, 'Gus Grower', null, 'gus@farm.test', '(716) 555-0100', null, 'Erie', null, 'v1:56b70a071c4714eb', '/card', 'nyc-2026')::text;")
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -c "update public.crm_supplier_inquiries set submitted_at = '2024-01-01T00:00:00Z' where business_name = 'TEST ONLY Old Farm'; update public.crm_supplier_inquiries set replied_at = '2026-10-01T00:00:00Z' where business_name = 'TEST ONLY Kept Farm';" >/dev/null
SUP_PURGE=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select public.crm_purge_supplier_inquiries('2026-11-09T15:00:00Z'::timestamptz)::text;")
SUP_LEFT=$(sudo -u postgres psql -d "$DB" -tA -c "select (select count(*) from public.crm_supplier_inquiries where business_name = 'TEST ONLY Old Farm') || ',' || (select count(*) from public.crm_supplier_inquiries where business_name = 'TEST ONLY Kept Farm') || ',' || (select count(*) from public.crm_supplier_inquiries where business_name = 'TEST ONLY North Farm');")
if [ "$OLD_SUP" != '{"ok": true, "duplicate": false}' ] || [ "$KEPT_SUP" != '{"ok": true, "duplicate": false}' ] || [ "$SUP_PURGE" != '{"ok": true, "purged": 1}' ] || [ "$SUP_LEFT" != "0,1,1" ]; then
  echo "FAIL: supplier purge ${OLD_SUP} ${KEPT_SUP} ${SUP_PURGE} ${SUP_LEFT}"
  exit 1
fi
echo 'ok: supplier purge uses the last reply, then submitted_at, and is not scheduled'
FUTURE=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select public.crm_purge_supplier_inquiries('2100-01-01T00:00:00Z'::timestamptz)::text;")
FUTURE_LEFT=$(sudo -u postgres psql -d "$DB" -tA -c "select count(*) from public.crm_supplier_inquiries where business_name in ('TEST ONLY North Farm', 'TEST ONLY Kept Farm');")
MARK=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select public.crm_mark_supplier_replied('57575757-5757-4575-8575-575757575757'::uuid)::text;")
MARKED=$(sudo -u postgres psql -d "$DB" -tA -c "select (replied_at is not null)::text from public.crm_supplier_inquiries where inquiry_id = '57575757-5757-4575-8575-575757575757';")
if [ "$FUTURE" != '{"ok": true, "purged": 0}' ] || [ "$FUTURE_LEFT" != "2" ] || [ "$MARK" != '{"ok": true, "updated": true}' ] || [ "$MARKED" != "true" ]; then
  echo "FAIL: future purge or reply mark ${FUTURE} ${FUTURE_LEFT} ${MARK} ${MARKED}"
  exit 1
fi
echo 'ok: a future clock does not purge recent supplier rows'
SUP_ACL=$(sudo -u postgres psql -d "$DB" -tA -c "select coalesce(string_agg(e.privilege_type, ',' order by e.privilege_type), '') from pg_class c cross join lateral aclexplode(c.relacl) e join pg_roles r on r.oid = e.grantee where c.oid = 'public.crm_supplier_inquiries'::regclass and r.rolname = 'service_role';")
SUP_COL=$(sudo -u postgres psql -d "$DB" -tA -c "select coalesce(string_agg(a.attname, ',' order by a.attname), '') from pg_attribute a cross join lateral aclexplode(a.attacl) e join pg_roles r on r.oid = e.grantee where a.attrelid = 'public.crm_supplier_inquiries'::regclass and a.attnum > 0 and not a.attisdropped and r.rolname = 'service_role' and e.privilege_type = 'UPDATE';")
SUP_OTHER=$(sudo -u postgres psql -d "$DB" -tA -c "select count(*) from (select 1 from pg_class c cross join lateral aclexplode(c.relacl) e left join pg_roles r on r.oid = e.grantee where c.oid = 'public.crm_supplier_inquiries'::regclass and (e.grantee = 0 or r.rolname in ('anon', 'authenticated')) union all select 1 from pg_attribute a cross join lateral aclexplode(a.attacl) e left join pg_roles r on r.oid = e.grantee where a.attrelid = 'public.crm_supplier_inquiries'::regclass and a.attnum > 0 and not a.attisdropped and (e.grantee = 0 or r.rolname in ('anon', 'authenticated'))) s;")
SUP_BITS=$(sudo -u postgres psql -d "$DB" -tA -c "select has_table_privilege('service_role', 'public.crm_supplier_inquiries', 'update')::text || ',' || has_table_privilege('service_role', 'public.crm_supplier_inquiries', 'delete')::text || ',' || has_table_privilege('service_role', 'public.crm_supplier_inquiries', 'truncate')::text || ',' || has_table_privilege('service_role', 'public.crm_supplier_inquiries', 'trigger')::text || ',' || has_table_privilege('service_role', 'public.crm_supplier_inquiries', 'references')::text || ',' || has_column_privilege('service_role', 'public.crm_supplier_inquiries', 'submitted_at', 'update')::text || ',' || has_column_privilege('service_role', 'public.crm_supplier_inquiries', 'replied_at', 'update')::text;")
SUP_RELACL=$(sudo -u postgres psql -d "$DB" -tA -c "select c.relacl::text from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'crm_supplier_inquiries';")
PGNUM=$(sudo -u postgres psql -d "$DB" -tA -c "select current_setting('server_version_num');")
if [ "$PGNUM" -ge 170000 ]; then
  SUP_MAINTAIN=$(sudo -u postgres psql -d "$DB" -tA -c "select has_table_privilege('service_role', 'public.crm_supplier_inquiries', 'maintain')::text;")
  SUP_OWNER='{postgres=arwdDxtm/postgres}'
else
  SUP_MAINTAIN=unsupported
  SUP_OWNER='{postgres=arwdDxt/postgres}'
fi
expect_fail 'service role supplier submitted_at update' "set role service_role; update public.crm_supplier_inquiries set submitted_at = submitted_at where inquiry_id = '57575757-5757-4575-8575-575757575757';"
if ! grep -q 'permission denied' /tmp/crm-crud-fail.log; then
  echo 'FAIL: submitted_at update was not denied by privilege'
  exit 1
fi
SERVICE_MARK=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "set role service_role; select public.crm_mark_supplier_replied('57575757-5757-4575-8575-575757575757'::uuid)::text;" | tail -n 1)
if [ "$SUP_ACL" != "" ] || [ "$SUP_RELACL" != "$SUP_OWNER" ] || [ "$SUP_COL" != "" ] || [ "$SUP_OTHER" != "0" ] || [ "$SUP_BITS" != "false,false,false,false,false,false,false" ] || { [ "$PGNUM" -ge 170000 ] && [ "$SUP_MAINTAIN" != "false" ]; } || { [ "$PGNUM" -lt 170000 ] && [ "$SUP_MAINTAIN" != "unsupported" ]; } || [ "$SERVICE_MARK" != '{"ok": true, "updated": true}' ]; then
  echo "FAIL: supplier privileges acl=${SUP_ACL} relacl=${SUP_RELACL} columns=${SUP_COL} other=${SUP_OTHER} bits=${SUP_BITS} maintain=${SUP_MAINTAIN} mark=${SERVICE_MARK}"
  exit 1
fi
echo 'ok: service_role has no supplier table privileges and can still mark a reply'
expect_fail 'service role supplier replied_at update' "set role service_role; update public.crm_supplier_inquiries set replied_at = '2999-01-01T00:00:00Z' where inquiry_id = '57575757-5757-4575-8575-575757575757';"
if ! grep -q 'permission denied' /tmp/crm-crud-fail.log; then
  echo 'FAIL: replied_at update was not denied by privilege'
  exit 1
fi
expect_fail 'service role supplier select' "set role service_role; select count(*) from public.crm_supplier_inquiries;"
if ! grep -q 'permission denied' /tmp/crm-crud-fail.log; then
  echo 'FAIL: supplier select was not denied by privilege'
  exit 1
fi
expect_fail 'service role supplier insert' "set role service_role; insert into public.crm_supplier_inquiries (inquiry_id, submitted_at, business_name, supply_type, contact_name, contact_email, contact_phone, county, consent_version, source_route, source_event) values ('79797979-7979-4797-8797-797979797979', now(), 'TEST ONLY Direct Farm', 'hemp_or_hemp_extract', 'Pat Grower', 'pat@farm.test', '+17165550100', 'Erie', 'v1:56b70a071c4714eb', '/card', 'nyc-2026');"
if ! grep -q 'permission denied' /tmp/crm-crud-fail.log; then
  echo 'FAIL: supplier insert was not denied by privilege'
  exit 1
fi
echo 'ok: service_role cannot select or insert supplier rows'
FAR_SUP=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select public.crm_receive_supplier_inquiry('65656565-6565-4565-8565-656565656565'::uuid, '2099-01-01T00:00:00Z', 'TEST ONLY Future Farm', null, 'hemp_or_hemp_extract', null, 'Ivy Grower', null, 'ivy@farm.test', '(716) 555-0100', null, 'Erie', null, 'v1:56b70a071c4714eb', '/card', 'nyc-2026')::text;")
FAR_AT=$(sudo -u postgres psql -d "$DB" -tA -c "select (submitted_at <= pg_catalog.now() + interval '5 minutes' and submitted_at < '2090-01-01'::timestamptz)::text from public.crm_supplier_inquiries where inquiry_id = '65656565-6565-4565-8565-656565656565';")
FAR_MARK=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "set role service_role; select public.crm_mark_supplier_replied('65656565-6565-4565-8565-656565656565'::uuid)::text;" | tail -n 1)
FAR_REPLY=$(sudo -u postgres psql -d "$DB" -tA -c "select (replied_at is not null and replied_at <= pg_catalog.now() + interval '5 minutes' and replied_at < '2100-01-01'::timestamptz)::text from public.crm_supplier_inquiries where inquiry_id = '65656565-6565-4565-8565-656565656565';")
if [ "$FAR_SUP" != '{"ok": true, "duplicate": false}' ] || [ "$FAR_AT" != "true" ] || [ "$FAR_MARK" != '{"ok": true, "updated": true}' ] || [ "$FAR_REPLY" != "true" ]; then
  echo "FAIL: far future supplier clock ${FAR_SUP} submitted=${FAR_AT} mark=${FAR_MARK} replied=${FAR_REPLY}"
  exit 1
fi
echo 'ok: a far future submitted_at or replied_at cannot push supplier retention past the server clock'
EPOCH_SUP=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select public.crm_receive_supplier_inquiry('67676767-6767-4676-8676-676767676767'::uuid, '1970-01-01T00:00:00Z', 'TEST ONLY Epoch Farm', null, 'hemp_or_hemp_extract', null, 'Jan Grower', null, 'jan@farm.test', '(716) 555-0100', null, 'Erie', null, 'v1:56b70a071c4714eb', '/card', 'nyc-2026')::text;")
INF_SUP=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select public.crm_receive_supplier_inquiry('68686868-6868-4686-8686-686868686868'::uuid, '-infinity', 'TEST ONLY Ancient Farm', null, 'hemp_or_hemp_extract', null, 'Kay Grower', null, 'kay@farm.test', '(716) 555-0100', null, 'Erie', null, 'v1:56b70a071c4714eb', '/card', 'nyc-2026')::text;")
LOW_AT=$(sudo -u postgres psql -d "$DB" -tA -c "select count(*) from public.crm_supplier_inquiries where inquiry_id in ('67676767-6767-4676-8676-676767676767', '68686868-6868-4686-8686-686868686868') and submitted_at > '1971-01-01'::timestamptz and submitted_at >= pg_catalog.now() - interval '2 days' - interval '1 minute' and submitted_at <= pg_catalog.now() - interval '2 days' + interval '1 minute';")
SUP_DELETE=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "set role service_role; select public.crm_delete_supplier_inquiry('67676767-6767-4676-8676-676767676767'::uuid)::text;" | tail -n 1)
SUP_GONE=$(sudo -u postgres psql -d "$DB" -tA -c "select count(*) from public.crm_supplier_inquiries where inquiry_id = '67676767-6767-4676-8676-676767676767';")
if [ "$EPOCH_SUP" != '{"ok": true, "duplicate": false}' ] || [ "$INF_SUP" != '{"ok": true, "duplicate": false}' ] || [ "$LOW_AT" != "2" ] || [ "$SUP_DELETE" != '{"ok": true, "deleted": true}' ] || [ "$SUP_GONE" != "0" ]; then
  echo "FAIL: low supplier clock or delete ${EPOCH_SUP} ${INF_SUP} low=${LOW_AT} delete=${SUP_DELETE} gone=${SUP_GONE}"
  exit 1
fi
echo 'ok: an ancient submitted_at is clamped and service_role can still delete through the function'
expect_fail 'supplier email shape' "update public.crm_supplier_inquiries set contact_email = 'not-an-email' where inquiry_id = '57575757-5757-4575-8575-575757575757';"
AGENT=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select public.crm_receive_agent_records('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10'::uuid, '2026-11-09T18:00:00Z', '[{\"op\":\"account\",\"index\":0,\"display_name\":\"Agent Shop\",\"status\":\"prospect\",\"account_type\":\"adult_use_dispensary\",\"city\":\"Buffalo\",\"county\":\"Erie\",\"license_number\":\"AGENT-LIC-1\"},{\"op\":\"contact\",\"index\":1,\"name\":\"Agent Buyer\",\"email\":\"buyer@agent.test\",\"account_license\":\"AGENT-LIC-1\"},{\"op\":\"note\",\"index\":2,\"body\":\"Plain note\",\"account_license\":\"AGENT-LIC-1\"}]'::jsonb)::text;")
AGENT_REPLAY=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select public.crm_receive_agent_records('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10'::uuid, '2026-11-09T18:00:00Z', '[]'::jsonb)->>'code';")
AGENT_DUPE=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select public.crm_receive_agent_records('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11'::uuid, '2026-11-09T18:05:00Z', '[{\"op\":\"account\",\"index\":0,\"display_name\":\"Copy\",\"status\":\"prospect\",\"county\":\"Erie\",\"license_number\":\"agent-lic-1\"}]'::jsonb)::text;")
AGENT_COUNTS=$(sudo -u postgres psql -d "$DB" -tA -c "select (select count(*) from public.crm_accounts where license_ref = 'AGENT-LIC-1') || ',' || (select count(*) from public.crm_contacts where account_id in (select id from public.crm_accounts where license_ref = 'AGENT-LIC-1')) || ',' || (select count(*) from public.crm_notes where body = 'Plain note' and actor = 'CODEX agent') || ',' || (select count(*) from public.crm_activity where actor = 'CODEX agent' and source_request_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10') || ',' || (select preference from public.crm_contacts where name = 'Agent Buyer');")
AGENT_GRANT=$(sudo -u postgres psql -d "$DB" -tA -c "select has_function_privilege('anon', 'public.crm_receive_agent_records(uuid, timestamptz, jsonb)', 'execute')::text || ',' || has_function_privilege('service_role', 'public.crm_receive_agent_records(uuid, timestamptz, jsonb)', 'execute')::text || ',' || has_table_privilege('service_role', 'public.crm_agent_requests', 'insert')::text;")
if [ "$AGENT_REPLAY" != "replay" ] || [ "$AGENT_COUNTS" != "1,1,1,3,unspecified" ] || [ "$AGENT_GRANT" != "false,true,false" ] || ! printf '%s' "$AGENT" | grep -q '"accounts": 1' || ! printf '%s' "$AGENT_DUPE" | grep -q 'already exists'; then
  echo "FAIL: agent intake ${AGENT} ${AGENT_REPLAY} ${AGENT_DUPE} ${AGENT_COUNTS} ${AGENT_GRANT}"
  exit 1
fi
echo 'ok: agent intake writes one cedar account, contact, and note, then rejects replay and a duplicate license'
AGENT_CONTACT=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select public.crm_receive_agent_records('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12'::uuid, '2026-11-09T18:06:00Z', '[{\"op\":\"contact\",\"index\":0,\"name\":\"Agent Buyer\",\"email\":\"buyer@agent.test\",\"account_license\":\"AGENT-LIC-1\"}]'::jsonb)::text;")
AGENT_CONTACT_COUNT=$(sudo -u postgres psql -d "$DB" -tA -c "select count(*) from public.crm_contacts where lower(email) = 'buyer@agent.test';")
if [ "$AGENT_CONTACT_COUNT" != "1" ] || ! printf '%s' "$AGENT_CONTACT" | grep -q 'already exists'; then
  echo "FAIL: agent contact dedupe ${AGENT_CONTACT} ${AGENT_CONTACT_COUNT}"
  exit 1
fi
echo 'ok: a repeated contact email on the same account is not added again'
AGENT_FIELDS=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select public.crm_receive_agent_records('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13'::uuid, '2026-11-09T18:07:00Z', '[{\"op\":\"account\",\"index\":0,\"display_name\":\"TEST ONLY Shop\",\"status\":\"prospect\",\"account_type\":\"adult_use_dispensary\",\"lead_source\":\"referral\",\"assigned_rep\":\"TEST ONLY Rep\",\"city\":\"Buffalo\",\"county\":\"Erie\",\"license_number\":\"TEST-ONLY-FIELDS\",\"license_expiry\":\"2027-01-02\",\"street\":\"1 Test Street\",\"postal_code\":\"14201\",\"ocm_status\":\"unverified\",\"notes\":\"TEST ONLY note\\nAddress: 1 Test Street 14201\\nCounty: Erie\\nRegion: Western\\nStore phone: 555-0100\\nStore email: buyer@test.only\\nWebsite: https://test.only\\nLicense status: Active\\nOperating: Open\"}]'::jsonb)->>'code';")
AGENT_FIELD_ROW=$(sudo -u postgres psql -d "$DB" -tA -c "select street || '|' || postal_code || '|' || license_expiry::text || '|' || ocm_status || '|' || lead_source || '|' || assigned_rep || '|' || created_by || '|' || (notes like 'TEST ONLY note%' and notes like '%Store phone: 555-0100%' and notes like '%Store email: buyer@test.only%' and notes like '%Website: https://test.only%' and notes like '%Operating: Open%')::text from public.crm_accounts where license_ref = 'TEST-ONLY-FIELDS';")
if [ "$AGENT_FIELDS" != "accepted" ] || [ "$AGENT_FIELD_ROW" != "1 Test Street|14201|2027-01-02|unverified|referral|TEST ONLY Rep|CODEX agent|true" ]; then
  echo "FAIL: agent account fields ${AGENT_FIELDS} ${AGENT_FIELD_ROW}"
  exit 1
fi
echo 'ok: agent accounts keep street, ZIP, expiry, OCM status, lead source, rep, and importer notes'
expect_fail 'note delete after intake' "delete from public.crm_notes where body like 'TEST ONLY%';"

sudo -u postgres psql -d "$DB" -q -v ON_ERROR_STOP=1 -c "insert into public.crm_accounts (brand, display_name, status, created_by, updated_by) values ('cedargrowth', 'TEST ONLY geocode', 'prospect', 'test-only', 'test-only');" >/dev/null
GEO=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select id from public.crm_accounts where display_name = 'TEST ONLY geocode';" | tr -d '[:space:]')
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -c "update public.crm_accounts set latitude = 42.886000, longitude = -78.878000, geocode_source = 'test-only', geocode_match = 'rooftop', geocoded_at = '2026-11-10T00:00:00Z' where id = '${GEO}';" >/dev/null
KEPT=$(sudo -u postgres psql -d "$DB" -tA -c "select latitude::text || ',' || longitude::text || ',' || geocode_source from public.crm_accounts where id = '${GEO}';")
TRIGGERS=$(sudo -u postgres psql -d "$DB" -tA -c "select string_agg(tgname, ',' order by tgname) from pg_trigger where tgrelid = 'public.crm_accounts'::regclass and not tgisinternal and tgname in ('crm_accounts_audit', 'crm_accounts_guard', 'crm_accounts_no_delete');")
set +e
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -c "update public.crm_accounts set latitude = 10, longitude = -78.878000 where id = '${GEO}';" >/tmp/crm-geocode-range.log 2>&1
RANGE_CODE=$?
set -e
if [ "$KEPT" != "42.886000,-78.878000,test-only" ] || [ "$TRIGGERS" != "crm_accounts_audit,crm_accounts_guard,crm_accounts_no_delete" ] || [ "$RANGE_CODE" -eq 0 ]; then
  echo "FAIL: geocode guard ${KEPT} ${TRIGGERS} ${RANGE_CODE}"
  exit 1
fi
echo 'ok: a coordinate-only update is kept and a latitude outside New York is rejected'

sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -f "${ROOT}/scripts/crm-check-0136-rls.sql" >/tmp/crm-0136-rls.log
sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname = 'crm_0136_norls') then create role crm_0136_norls nologin nosuperuser nobypassrls; end if; end \$\$;" >/dev/null
cat > /tmp/crm-0136-rls-deny.sql <<EOF
set role crm_0136_norls;
\\i ${ROOT}/scripts/crm-check-0136-rls.sql
EOF
set +e
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -f /tmp/crm-0136-rls-deny.sql >/tmp/crm-0136-rls-deny.log 2>&1
RLS_DENY=$?
set -e
sudo -u postgres psql -d postgres -v ON_ERROR_STOP=1 -c "drop role if exists crm_0136_norls;" >/dev/null
if [ "$RLS_DENY" -eq 0 ]; then
  echo 'FAIL: a role without bypassrls was allowed to pass the 0136 check'
  exit 1
fi
echo 'ok: 0136 pre-apply check requires the function owner to bypass forced row level security'

sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 --single-transaction -f "${ROOT}/scripts/crm-apply-0136.sql" >/tmp/crm-0136-second.log
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 --single-transaction -f "${ROOT}/scripts/crm-apply-0136.sql" >/tmp/crm-0136-third.log
GUARD=$(sudo -u postgres psql -d "$DB" -tA -c "select coalesce(array_to_string(p.proconfig, '|'), '') || ',' || (position('pg_catalog.now()' in p.prosrc) > 0)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'crm_private' and p.proname = 'guard_contact';")
TRIG=$(sudo -u postgres psql -d "$DB" -tA -c "select count(*) from pg_trigger where tgrelid = 'public.crm_distribution_merges'::regclass and tgname = 'crm_distribution_merges_append_only' and not tgisinternal;")
if [ "$GUARD" != "search_path=pg_catalog,true" ] || [ "$TRIG" != "1" ]; then
  echo "FAIL: 0136 reapply guard=${GUARD} triggers=${TRIG}"
  exit 1
fi
echo 'ok: 0136 applies twice and guard_contact pins search_path to pg_catalog'

sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -c "update storage.buckets set public = true, name = 'renamed-photo-bucket', file_size_limit = 1, allowed_mime_types = array['image/gif']::text[] where id = 'crm-place-photos'; insert into storage.objects (id, bucket_id, name) values ('00000000-0000-4000-8000-0000000000aa', 'crm-place-photos', 'ChIJtest/abc.jpg');" >/dev/null
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 --single-transaction -f "${ROOT}/scripts/crm-apply-0136.sql" >/tmp/crm-0136-bucket.log
BUCKET=$(sudo -u postgres psql -d "$DB" -tA -c "select public::text || '|' || file_size_limit::text || '|' || allowed_mime_types::text || '|' || name || '|' || (select count(*)::text from storage.buckets where id = 'crm-place-photos') || '|' || (select count(*)::text from pg_policy pol join pg_class cls on cls.oid = pol.polrelid join pg_namespace ns on ns.oid = cls.relnamespace where ns.nspname = 'storage') from storage.buckets where id = 'crm-place-photos';")
ANON_SEEN=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "set role anon; select count(*)::text from storage.objects where bucket_id = 'crm-place-photos';" | tail -n 1)
AUTH_SEEN=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "set role authenticated; select count(*)::text from storage.objects where bucket_id = 'crm-place-photos';" | tail -n 1)
SERVICE_SEEN=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "set role service_role; select count(*)::text from storage.objects where bucket_id = 'crm-place-photos';" | tail -n 1)
if [ "$BUCKET" != "false|5242880|{image/jpeg,image/png,image/webp}|crm-place-photos|1|0" ] || [ "$ANON_SEEN" != "0" ] || [ "$AUTH_SEEN" != "0" ] || [ "$SERVICE_SEEN" != "1" ]; then
  echo "FAIL: photo bucket ${BUCKET} anon=${ANON_SEEN} auth=${AUTH_SEEN} service=${SERVICE_SEEN}"
  exit 1
fi
echo 'ok: the photo bucket stays private and anon and authenticated cannot select its objects'
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 --single-transaction -f "${ROOT}/scripts/crm-rollback-0136.sql" >/tmp/crm-0136-rollback.log
KEPT_BUCKET=$(sudo -u postgres psql -d "$DB" -tA -c "select (select count(*) from storage.buckets where id = 'crm-place-photos' and public = false) || ',' || (select count(*) from storage.objects where bucket_id = 'crm-place-photos') || ',' || (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'crm_google_places');")
if [ "$KEPT_BUCKET" != "1,1,0" ]; then
  echo "FAIL: rollback changed the photo bucket ${KEPT_BUCKET}"
  exit 1
fi
echo 'ok: rollback leaves the photo bucket and its objects in place'

HAND_PRIV=$(sudo -u postgres psql -d "$DB" -tA -c "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace cross join lateral aclexplode(c.relacl) e left join pg_roles r on r.oid = e.grantee where n.nspname = 'public' and c.relname like 'crm_bond_request_%' and (e.grantee = 0 or r.rolname in ('anon', 'authenticated', 'service_role'));")
HAND_BITS=$(sudo -u postgres psql -d "$DB" -tA -c "select has_table_privilege('service_role', 'public.crm_bond_request_handoffs', 'select')::text || ',' || has_table_privilege('service_role', 'public.crm_bond_request_handoffs', 'insert')::text || ',' || has_table_privilege('service_role', 'public.crm_bond_request_handoffs', 'update')::text || ',' || has_table_privilege('service_role', 'public.crm_bond_request_handoffs', 'delete')::text || ',' || has_table_privilege('anon', 'public.crm_bond_request_handoffs', 'select')::text || ',' || has_function_privilege('anon', 'public.crm_receive_bond_request_handoff(jsonb)', 'execute')::text || ',' || has_function_privilege('service_role', 'public.crm_receive_bond_request_handoff(jsonb)', 'execute')::text;")
HAND_COLS=$(sudo -u postgres psql -d "$DB" -tA -c "select count(*) from information_schema.columns where table_schema = 'public' and table_name in ('crm_bond_request_handoffs', 'crm_bond_request_send_log') and column_name ~* 'fee|price|commission|credit|target|recipient';")
if [ "$HAND_PRIV" != "0" ] || [ "$HAND_BITS" != "false,false,false,false,false,false,true" ] || [ "$HAND_COLS" != "0" ]; then
  echo "FAIL: handoff privileges priv=${HAND_PRIV} bits=${HAND_BITS} cols=${HAND_COLS}"
  exit 1
fi
echo 'ok: handoff tables grant nothing direct under default privileges'
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -c "insert into public.crm_accounts (brand, display_name, status, created_by, updated_by, account_type, bond_carried_skus, request_contact_email) values ('cedargrowth', 'TEST ONLY Request Shop', 'active', 'test-only', 'test-only', 'adult_use_dispensary', array['vape-1g'], 'shop@request.test');" >/dev/null
ACCT=$(sudo -u postgres psql -d "$DB" -tA -c "select id from public.crm_accounts where display_name = 'TEST ONLY Request Shop';")
expect_fail 'handoff direct update' "set role service_role; update public.crm_bond_request_handoffs set submitted_at = now();"
BAD_CONSENT=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select public.crm_receive_bond_request_handoff(jsonb_build_object('handoff_id','81818181-8181-4181-8181-818181818181','bond_request_id','b1','submitted_at','2026-11-11T14:00:00Z','dispensary_ref','${ACCT}','items', jsonb_build_array(jsonb_build_object('sku','vape-1g','qty',1)),'member_first_name','Ada','member_contact','ada@member.test','share_consent_version','v1:46652a17994f78d1','source','bond-haus'))->>'result';")
OK_HAND=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select public.crm_receive_bond_request_handoff(jsonb_build_object('handoff_id','82828282-8282-4282-8282-828282828282','bond_request_id','b2','submitted_at', now(), 'dispensary_ref','${ACCT}','items', jsonb_build_array(jsonb_build_object('sku','vape-1g','qty',1)),'member_first_name','Ada','member_contact','ada@member.test','share_consent_version','v1:898aa08ccea983db','source','bond-haus'))->>'result';")
DUP_HAND=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select public.crm_receive_bond_request_handoff(jsonb_build_object('handoff_id','82828282-8282-4282-8282-828282828282','bond_request_id','b2','submitted_at', now(), 'dispensary_ref','${ACCT}','items', jsonb_build_array(jsonb_build_object('sku','vape-1g','qty',1)),'member_first_name','Ada','member_contact','ada@member.test','share_consent_version','v1:898aa08ccea983db','source','bond-haus'))->>'result';")
ADMIN_ROWS=$(sudo -u postgres psql -d "$DB" -tA -c "select count(*) from public.crm_bond_request_admin_view('salesperson');")
ADMIN_OK=$(sudo -u postgres psql -d "$DB" -tA -c "select count(*) from public.crm_bond_request_admin_view('owner');")
if [ "$BAD_CONSENT" != "rejected:consent" ] || [ "$OK_HAND" != "accepted" ] || [ "$DUP_HAND" != "duplicate" ] || [ "$ADMIN_ROWS" != "0" ] || [ "$ADMIN_OK" != "1" ]; then
  echo "FAIL: handoff sql consent=${BAD_CONSENT} ok=${OK_HAND} dup=${DUP_HAND} admin=${ADMIN_ROWS}/${ADMIN_OK} acct=${ACCT}"
  exit 1
fi
echo 'ok: handoff sql rejects the other consent versions, replays one row, and hides the row from other roles'
RACE_SQL="select public.crm_receive_bond_request_handoff(jsonb_build_object('handoff_id','83838383-8383-4383-8383-838383838383','bond_request_id','race','submitted_at', now(), 'dispensary_ref','${ACCT}','items', jsonb_build_array(jsonb_build_object('sku','vape-1g','qty',1)),'member_first_name','Ada','member_contact','ada@member.test','share_consent_version','v1:898aa08ccea983db','source','bond-haus'))->>'result';"
sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "$RACE_SQL" >/tmp/crm-handoff-race-a.txt &
sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "$RACE_SQL" >/tmp/crm-handoff-race-b.txt &
wait || true
RACE_A=$(tr -d '[:space:]' < /tmp/crm-handoff-race-a.txt)
RACE_B=$(tr -d '[:space:]' < /tmp/crm-handoff-race-b.txt)
RACE_ROWS=$(sudo -u postgres psql -d "$DB" -tA -c "select count(*) from public.crm_bond_request_handoffs where handoff_id = '83838383-8383-4383-8383-838383838383';")
RACE_SORTED=$(printf '%s\n%s\n' "$RACE_A" "$RACE_B" | sort | tr '\n' ',')
if [ "$RACE_SORTED" != "accepted,duplicate," ] || [ "$RACE_ROWS" != "1" ]; then
  echo "FAIL: concurrent handoff replay ${RACE_A} ${RACE_B} rows=${RACE_ROWS}"
  exit 1
fi
echo 'ok: a concurrent handoff replay keeps one row and returns duplicate'
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -c "update public.crm_bond_request_handoffs set received_at = now() - interval '13 months' where handoff_id = '82828282-8282-4282-8282-828282828282'; insert into public.crm_bond_request_send_log (handoff_id, template, template_version, rendered_sha256, status) values ('82828282-8282-4282-8282-828282828282', 'A', 'v1:6321250367f61781', 'abc', 'sent'); insert into public.crm_bond_request_audit (handoff_id, status) values ('82828282-8282-4282-8282-828282828282', 'queued');" >/dev/null
PURGE_HAND=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select public.crm_purge_bond_request_handoffs(now())->>'purged';")
LEFT_HAND=$(sudo -u postgres psql -d "$DB" -tA -c "select (select count(*) from public.crm_bond_request_handoffs where handoff_id = '82828282-8282-4282-8282-828282828282') || ',' || (select count(*) from public.crm_bond_request_send_log where handoff_id = '82828282-8282-4282-8282-828282828282') || ',' || (select count(*) from public.crm_bond_request_audit where handoff_id = '82828282-8282-4282-8282-828282828282') || ',' || (select count(*) from public.crm_bond_request_handoffs where handoff_id = '83838383-8383-4383-8383-838383838383');")
if [ "$PURGE_HAND" != "1" ] || [ "$LEFT_HAND" != "0,0,0,1" ]; then
  echo "FAIL: handoff purge ${PURGE_HAND} ${LEFT_HAND}"
  exit 1
fi
echo 'ok: the 12 month purge removes the handoff, the send log, and the audit rows'
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 --single-transaction -f "${ROOT}/scripts/crm-rollback-0139.sql" >/tmp/crm-0139-rollback.log
GONE=$(sudo -u postgres psql -d "$DB" -tA -c "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname like 'crm_bond_request_%';")
if [ "$GONE" != "0" ]; then
  echo "FAIL: 0139 rollback left ${GONE} relations"
  exit 1
fi
echo 'ok: 0139 rollback removes the handoff tables'

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
