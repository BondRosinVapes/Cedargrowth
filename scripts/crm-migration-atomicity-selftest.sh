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

KINDS=$(sudo -u postgres psql -d "$DB" -tA -c "select pg_get_constraintdef(oid) from pg_constraint where conname = 'crm_activity_kind_check';")
echo "$KINDS" | grep -q 'digest_sent' && echo "$KINDS" | grep -q 'inquiry_received' || { echo 'FAIL: activity kinds'; exit 1; }
echo 'ok: activity kinds keep digest_sent and add inquiry_received'
RECV=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select public.crm_receive_bond_inquiry('11111111-1111-4111-8111-111111111111'::uuid, '2026-11-09T15:00:00Z', '2026-11-09T15:00:00Z', 'North Store', 'Ada Buyer', 'ada@northstore.test', null, 'OCM-1', '1 Main', 'Buffalo', '14201', 'Erie', 'Hello plain', 'v1:0123456789abcdef', false)::text;")
REPLAY=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select public.crm_receive_bond_inquiry('11111111-1111-4111-8111-111111111111'::uuid, '2026-11-09T15:00:00Z', '2026-11-09T15:00:00Z', 'North Store', 'Ada Buyer', 'ada@northstore.test', null, 'OCM-1', '1 Main', 'Buffalo', '14201', 'Erie', 'Hello plain', 'v1:0123456789abcdef', false)::text;")
DUP=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select public.crm_receive_bond_inquiry('22222222-2222-4222-8222-222222222222'::uuid, '2026-11-09T15:00:00Z', '2026-11-09T15:00:00Z', 'Other Shop', 'Bea Buyer', 'bea@other.test', null, 'OCM-1', '2 Main', 'Buffalo', '14201', 'Erie', null, 'v1:0123456789abcdef', false)::text;")
COUNTS=$(sudo -u postgres psql -d "$DB" -tA -c "select (select count(*) from public.crm_accounts where brand = 'bond' and lead_source = 'bond_inquiry') || ',' || (select o.stage || ':' || coalesce(o.forecast_cents::text, 'null') || ':' || a.ocm_status from public.crm_opportunities o join public.crm_accounts a on a.id = o.account_id where o.brand = 'bond' limit 1) || ',' || (select body from public.crm_notes where brand = 'bond' and body = 'Hello plain') || ',' || (select count(*) from public.crm_activity where summary like '%ada@northstore.test%' or summary like '%Hello plain%') || ',' || (select count(*) from public.crm_intake_log);")
if [ "$RECV" != '{"ok": true, "duplicate": false}' ] || [ "$REPLAY" != '{"ok": true, "duplicate": true}' ] || [ "$DUP" != '{"ok": true, "duplicate": false}' ] || [ "$COUNTS" != "1,lead:null:unverified,Hello plain,0,2" ]; then
  echo "FAIL: bond intake ${RECV} ${REPLAY} ${DUP} ${COUNTS}"
  exit 1
fi
echo 'ok: bond intake creates one lead, replays, and flags a weak duplicate'
EMAIL_COLS=$(sudo -u postgres psql -d "$DB" -tA -c "select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'crm_intake_deletions' and column_name like '%email%';")
DELETED=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select public.crm_delete_bond_inquiry('11111111-1111-4111-8111-111111111111'::uuid)::text;")
LEFT=$(sudo -u postgres psql -d "$DB" -tA -c "select (select count(*) from public.crm_accounts where brand = 'bond') || ',' || (select count(*) from public.crm_intake_log) || ',' || (select contact_name from public.crm_intake_deletions limit 1) || ',' || (select count(*) from public.crm_notes where body like '%ada@%');")
if [ "$EMAIL_COLS" != "0" ] || [ "$DELETED" != '{"ok": true, "deleted": true}' ] || [ "$LEFT" != "0,0,bond,0" ]; then
  echo "FAIL: intake deletion ${DELETED} ${LEFT}"
  exit 1
fi
echo 'ok: intake deletion removes the lead and records bond with no mailbox'
OLD=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select public.crm_receive_bond_inquiry('33333333-3333-4333-8333-333333333333'::uuid, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', 'Old Shop', 'Cara Buyer', 'cara@old.test', null, 'OLD-1', '3 Main', 'Buffalo', '14201', 'Erie', null, 'v1:0123456789abcdef', false)::text;")
KEPT=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select public.crm_receive_bond_inquiry('44444444-4444-4444-8444-444444444444'::uuid, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', 'Kept Shop', 'Dan Buyer', 'dan@kept.test', null, 'KEPT-1', '4 Main', 'Buffalo', '14201', 'Erie', null, 'v1:0123456789abcdef', false)::text;")
sudo -u postgres psql -d "$DB" -v ON_ERROR_STOP=1 -c "update public.crm_accounts set ocm_status = 'verified' where display_name = 'Kept Shop';" >/dev/null
PURGED=$(sudo -u postgres psql -d "$DB" -tA -v ON_ERROR_STOP=1 -c "select public.crm_purge_bond_inquiries('2026-11-09T15:00:00Z'::timestamptz)::text;")
AFTER=$(sudo -u postgres psql -d "$DB" -tA -c "select (select count(*) from public.crm_accounts where display_name = 'Old Shop') || ',' || (select count(*) from public.crm_accounts where display_name = 'Kept Shop') || ',' || (select ocm_status from public.crm_accounts where display_name = 'Kept Shop');")
if [ "$OLD" != '{"ok": true, "duplicate": false}' ] || [ "$KEPT" != '{"ok": true, "duplicate": false}' ] || [ "$PURGED" != '{"ok": true, "purged": 1}' ] || [ "$AFTER" != "0,1,verified" ]; then
  echo "FAIL: intake purge ${OLD} ${KEPT} ${PURGED} ${AFTER}"
  exit 1
fi
echo 'ok: purge removes an unverified lead and keeps a verified one'
EXEC=$(sudo -u postgres psql -d "$DB" -tA -c "select has_function_privilege('anon', 'public.crm_receive_bond_inquiry(uuid, timestamptz, timestamptz, text, text, text, text, text, text, text, text, text, text, text, boolean)', 'execute')::text || ',' || has_function_privilege('service_role', 'public.crm_receive_bond_inquiry(uuid, timestamptz, timestamptz, text, text, text, text, text, text, text, text, text, text, text, boolean)', 'execute')::text || ',' || has_table_privilege('service_role', 'public.crm_intake_log', 'insert')::text;")
if [ "$EXEC" != "false,true,false" ]; then
  echo "FAIL: intake grants ${EXEC}"
  exit 1
fi
echo 'ok: intake log is writable only through the service role function'
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
