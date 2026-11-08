// Disposable Postgres 16 and PostgREST proof for receipt contract v3.
// Run: npx tsx scripts/kelvin-intake-contract-pg-selftest.ts
// Creates and drops databases named kelvin_vm_contract_*. Does not use the
// CedarGrowth project database and does not call a live webhook.
// Applies 0112 by itself. Does not apply 0110 or 0111 first.
// Plain psql -f is intentional. Do not add --single-transaction there.

import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const ROOT = new URL('..', import.meta.url);
const M0112 = new URL('supabase/migrations/0112_kelvin_intake_receipt_contract_v3.sql', ROOT).pathname;
const POSTGREST = '/tmp/postgrest/postgrest';
const PASSWORD = 'kelvin-local-test-only';
const JWT_SECRET = 'kelvin-local-postgrest-test-secret';
const TASK = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const DATABASES = [
  'kelvin_vm_contract_fresh',
  'kelvin_vm_contract_policy',
  'kelvin_vm_contract_delete',
  'kelvin_vm_contract_tautology',
  'kelvin_vm_contract_unrelated',
  'kelvin_vm_contract_trigger',
  'kelvin_vm_contract_role',
  'kelvin_vm_contract_api',
];

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

function run(cmd: string, args: string[]): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => { out += String(chunk); });
    child.stderr.on('data', (chunk) => { err += String(chunk); });
    child.on('close', (code) => resolve({ code: code ?? 1, out, err }));
  });
}

function psql(db: string, sql: string) {
  return run('sudo', ['-u', 'postgres', 'psql', '-d', db, '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql]);
}

function apply(db: string, file: string) {
  return run('sudo', ['-u', 'postgres', 'psql', '-d', db, '-v', 'ON_ERROR_STOP=1', '-f', file]);
}

function jwt(role: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ role, iss: 'supabase', iat: 1, exp: 2000000000 })).toString('base64url');
  const data = `${header}.${payload}`;
  const sig = createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

async function reset() {
  for (const name of DATABASES) {
    const dropped = await psql('postgres', `drop database if exists ${name} with (force)`);
    if (dropped.code !== 0) throw new Error(dropped.err || dropped.out);
    const created = await psql('postgres', `create database ${name}`);
    if (created.code !== 0) throw new Error(created.err || created.out);
  }
  const roles = await psql('postgres', `
    do $roles$
    begin
      if exists (select 1 from pg_roles where rolname = 'kelvin_contract_bypass') then
        begin
          execute 'revoke kelvin_contract_bypass from anon';
        exception when undefined_object then null;
        end;
        begin
          execute 'revoke kelvin_contract_bypass from authenticated';
        exception when undefined_object then null;
        end;
        execute 'drop role kelvin_contract_bypass';
      end if;
      if exists (select 1 from pg_roles where rolname = 'kelvin_contract_inert') then
        begin
          execute 'revoke kelvin_contract_inert from anon';
        exception when undefined_object then null;
        end;
        execute 'drop role kelvin_contract_inert';
      end if;
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticator') then
        create role authenticator noinherit login password '${PASSWORD}';
      end if;
      if not exists (select 1 from pg_roles where rolname = 'intake_writer') then create role intake_writer nologin; end if;
    end
    $roles$;
    alter role anon nobypassrls nosuperuser;
    alter role authenticated nobypassrls nosuperuser;
    alter role service_role bypassrls;
    alter role authenticator password '${PASSWORD}';
    grant anon, authenticated, service_role to authenticator;
  `);
  if (roles.code !== 0) throw new Error(roles.err || roles.out);
}

async function main() {
  await reset();

  const fresh = await apply('kelvin_vm_contract_fresh', M0112);
  assert(fresh.code === 0, 'plain psql -f applies 0112 on an empty database');
  const absentHistory = await psql('kelvin_vm_contract_fresh', `
    select (to_regprocedure('public.kelvin_intake_receipt_contract()') is null)
       and (to_regprocedure('public.kelvin_intake_receipt_contract_v2()') is null)
  `);
  assert(absentHistory.out.trim() === 't', 'standalone 0112 does not require 0110 or 0111');
  const v3 = await psql('kelvin_vm_contract_fresh', 'select public.kelvin_intake_receipt_contract_v3()');
  const probeRows = await psql('kelvin_vm_contract_fresh', `select count(*) from public.kelvin_intake_receipts where task_id = 'kelvin-contract-probe'`);
  assert(v3.out.trim() === 'ok' && probeRows.out.trim() === '0', 'v3 returns ok and leaves no probe row');
  const again = await apply('kelvin_vm_contract_fresh', M0112);
  const v3Again = await psql('kelvin_vm_contract_fresh', 'select public.kelvin_intake_receipt_contract_v3()');
  assert(again.code === 0 && v3Again.out.trim() === 'ok', '0112 can be run again');
  const serviceDelete = await psql('kelvin_vm_contract_fresh', `select has_table_privilege('service_role', 'public.kelvin_intake_receipts', 'DELETE')`);
  assert(serviceDelete.out.trim() === 'f', 'service_role is not granted delete');
  const anonFresh = await psql('kelvin_vm_contract_fresh', `
    set role anon;
    insert into public.kelvin_intake_receipts (task_id, agent, state) values ('${TASK}', 'FOUNDRY', 'accepted');
  `);
  assert(anonFresh.code !== 0, 'anon cannot insert an accepted receipt after 0112');
  const workers = await Promise.all(Array.from({ length: 8 }, () => psql(
    'kelvin_vm_contract_fresh',
    `insert into public.kelvin_intake_receipts (task_id, agent, state) values ('bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee', 'CODEX', 'reserved')`,
  )));
  const won = workers.filter((item) => item.code === 0).length;
  const lost = workers.filter((item) => item.err.includes('duplicate key')).length;
  assert(won === 1 && lost === 7, 'eight parallel connections still insert one receipt');

  const selectOnly = await psql('kelvin_vm_contract_fresh', `
    grant select on table public.kelvin_intake_receipts to anon;
    create policy p_read on public.kelvin_intake_receipts for select to anon using (true);
  `);
  const selectContract = await psql('kelvin_vm_contract_fresh', 'select public.kelvin_intake_receipt_contract_v3()');
  assert(selectOnly.code === 0 && selectContract.out.trim() === 'ok', 'a select grant and select policy do not fail the contract');
  await psql('kelvin_vm_contract_fresh', `drop policy p_read on public.kelvin_intake_receipts; revoke select on table public.kelvin_intake_receipts from anon`);

  const inherited = await psql('kelvin_vm_contract_fresh', `
    grant insert, update on table public.kelvin_intake_receipts to intake_writer;
    grant intake_writer to anon;
  `);
  const inheritedContract = await psql('kelvin_vm_contract_fresh', 'select public.kelvin_intake_receipt_contract_v3()');
  assert(inherited.code === 0 && inheritedContract.out.includes('anon has an effective write privilege'), 'inherited insert privilege fails the contract');
  const inheritedMigration = await apply('kelvin_vm_contract_fresh', M0112);
  const inheritedStill = await psql('kelvin_vm_contract_fresh', `select has_table_privilege('anon', 'public.kelvin_intake_receipts', 'INSERT')`);
  assert(inheritedMigration.code !== 0 && inheritedStill.out.trim() === 't', '0112 does not drop the inherited writer role');
  await psql('kelvin_vm_contract_fresh', 'revoke intake_writer from anon; revoke all on table public.kelvin_intake_receipts from intake_writer');
  const inheritedRepair = await apply('kelvin_vm_contract_fresh', M0112);
  assert(inheritedRepair.code === 0, '0112 succeeds after the inherited writer role is removed');

  const column = await psql('kelvin_vm_contract_fresh', `grant update (state) on table public.kelvin_intake_receipts to anon`);
  const columnContract = await psql('kelvin_vm_contract_fresh', 'select public.kelvin_intake_receipt_contract_v3()');
  assert(column.code === 0 && columnContract.out.includes('anon has an effective write privilege'), 'a column update grant on state fails the contract');
  const columnRepair = await apply('kelvin_vm_contract_fresh', M0112);
  const columnGone = await psql('kelvin_vm_contract_fresh', `select has_column_privilege('anon', 'public.kelvin_intake_receipts', 'state', 'UPDATE')`);
  assert(columnRepair.code === 0 && columnGone.out.trim() === 'f', '0112 revokes the column update grant');

  const published = await psql('kelvin_vm_contract_fresh', `grant insert on table public.kelvin_intake_receipts to public`);
  const publishedContract = await psql('kelvin_vm_contract_fresh', 'select public.kelvin_intake_receipt_contract_v3()');
  assert(published.code === 0 && publishedContract.out.includes('effective write privilege'), 'a public insert grant is an effective anon write privilege');
  const publishedRepair = await apply('kelvin_vm_contract_fresh', M0112);
  assert(publishedRepair.code === 0, '0112 revokes the public insert grant');

  const policyBase = await apply('kelvin_vm_contract_policy', M0112);
  assert(policyBase.code === 0, '0112 applies before the policy attack');
  const attack = await psql('kelvin_vm_contract_policy', `
    grant insert, update on table public.kelvin_intake_receipts to anon, authenticated;
    create policy p_open on public.kelvin_intake_receipts for all to anon, authenticated using (true) with check (true);
  `);
  assert(attack.code === 0, 'permissive policy and insert grants can be added');
  const openContract = await psql('kelvin_vm_contract_policy', 'select public.kelvin_intake_receipt_contract_v3()');
  assert(openContract.out.trim() !== 'ok', 'v3 is not ok while anon has a permissive write policy');
  const failed = await apply('kelvin_vm_contract_policy', M0112);
  const policyRemains = await psql('kelvin_vm_contract_policy', `
    select count(*) from pg_policy where polrelid = 'public.kelvin_intake_receipts'::regclass and polname = 'p_open'
  `);
  const grantRemains = await psql('kelvin_vm_contract_policy', `select has_table_privilege('anon', 'public.kelvin_intake_receipts', 'INSERT')`);
  assert(failed.code !== 0 && failed.err.includes('p_open') && policyRemains.out.trim() === '1' && grantRemains.out.trim() === 't', 'failed 0112 does not drop the policy or revoke the grant');
  await psql('kelvin_vm_contract_policy', 'drop policy p_open on public.kelvin_intake_receipts');
  const repaired = await apply('kelvin_vm_contract_policy', M0112);
  const anonAfter = await psql('kelvin_vm_contract_policy', `
    set role anon;
    insert into public.kelvin_intake_receipts (task_id, agent, state) values ('cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee', 'APEX', 'accepted');
  `);
  assert(repaired.code === 0 && anonAfter.code !== 0, 'anon cannot insert after the policy is removed and 0112 is applied');

  const deleteBase = await apply('kelvin_vm_contract_delete', M0112);
  const reserved = await psql('kelvin_vm_contract_delete', `
    insert into public.kelvin_intake_receipts (task_id, agent, state) values ('${TASK}', 'FOUNDRY', 'reserved')
  `);
  const deleteAttack = await psql('kelvin_vm_contract_delete', `
    grant select, delete on table public.kelvin_intake_receipts to anon;
    create policy p_sel on public.kelvin_intake_receipts for select to anon using (true);
    create policy p_del on public.kelvin_intake_receipts for delete to anon using (true);
  `);
  const deleteContract = await psql('kelvin_vm_contract_delete', 'select public.kelvin_intake_receipt_contract_v3()');
  assert(deleteBase.code === 0 && reserved.code === 0 && deleteAttack.code === 0 && deleteContract.out.includes('delete'), 'v3 rejects anon delete');
  const anonDelete = await psql('kelvin_vm_contract_delete', `
    set role anon;
    delete from public.kelvin_intake_receipts where task_id = '${TASK}';
  `);
  const gone = await psql('kelvin_vm_contract_delete', `select count(*) from public.kelvin_intake_receipts where task_id = '${TASK}'`);
  assert(anonDelete.code === 0 && gone.out.trim() === '0', 'anon delete removes a reserved receipt while the contract is not ok');
  const deleteFailed = await apply('kelvin_vm_contract_delete', M0112);
  const delPolicyRemains = await psql('kelvin_vm_contract_delete', `
    select count(*) from pg_policy where polrelid = 'public.kelvin_intake_receipts'::regclass and polname = 'p_del'
  `);
  const delGrantRemains = await psql('kelvin_vm_contract_delete', `select has_table_privilege('anon', 'public.kelvin_intake_receipts', 'DELETE')`);
  assert(deleteFailed.code !== 0 && deleteFailed.err.includes('p_del') && delPolicyRemains.out.trim() === '1' && delGrantRemains.out.trim() === 't', 'failed 0112 names the delete policy and leaves the grant');
  await psql('kelvin_vm_contract_delete', 'drop policy p_del on public.kelvin_intake_receipts; drop policy p_sel on public.kelvin_intake_receipts');
  const deleteRepaired = await apply('kelvin_vm_contract_delete', M0112);
  await psql('kelvin_vm_contract_delete', `insert into public.kelvin_intake_receipts (task_id, agent, state) values ('${TASK}', 'FOUNDRY', 'reserved')`);
  const anonDeleteAfter = await psql('kelvin_vm_contract_delete', `
    set role anon;
    delete from public.kelvin_intake_receipts where task_id = '${TASK}';
  `);
  const stillThere = await psql('kelvin_vm_contract_delete', `select count(*) from public.kelvin_intake_receipts where task_id = '${TASK}'`);
  assert(deleteRepaired.code === 0 && anonDeleteAfter.code !== 0 && stillThere.out.trim() === '1', 'anon cannot delete a reserved receipt after the repaired contract');

  const tautology = await psql('kelvin_vm_contract_tautology', `
    create table public.kelvin_intake_receipts (
      task_id text primary key,
      agent text not null,
      state text not null check ((state = state) or state in ('reserved', 'accepted', 'rejected')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    alter table public.kelvin_intake_receipts enable row level security;
  `);
  const forgedBefore = await psql('kelvin_vm_contract_tautology', `
    insert into public.kelvin_intake_receipts (task_id, agent, state) values ('eeeeeeee-bbbb-4ccc-8ddd-eeeeeeeeeeee', 'CONTRACT', 'forged')
  `);
  const tautologyMigration = await apply('kelvin_vm_contract_tautology', M0112);
  const v3Absent = await psql('kelvin_vm_contract_tautology', `select to_regprocedure('public.kelvin_intake_receipt_contract_v3()') is null`);
  assert(tautology.code === 0 && forgedBefore.code === 0 && tautologyMigration.code !== 0 && tautologyMigration.err.includes('state check accepts forged') && v3Absent.out.trim() === 't', 'plain psql -f rolls back when the state check accepts forged');

  const unrelated = await psql('kelvin_vm_contract_unrelated', `
    create table public.kelvin_intake_receipts (
      task_id text primary key,
      agent text not null,
      state text not null check ((agent <> 'blocked-word') or state in ('reserved', 'accepted', 'rejected')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    alter table public.kelvin_intake_receipts enable row level security;
  `);
  const unrelatedMigration = await apply('kelvin_vm_contract_unrelated', M0112);
  assert(unrelated.code === 0 && unrelatedMigration.code !== 0 && unrelatedMigration.err.includes('state check accepts forged'), 'a check that merely names the states does not pass');

  const triggerBase = await apply('kelvin_vm_contract_trigger', M0112);
  const trigger = await psql('kelvin_vm_contract_trigger', `
    create table public.kelvin_contract_probe_audit (note text);
    create function public.kelvin_contract_rewrite_forged() returns trigger
    language plpgsql as $fn$
    begin
      if new.state = 'forged' then new.state := 'reserved'; end if;
      insert into public.kelvin_contract_probe_audit(note) values ('fired');
      return new;
    end
    $fn$;
    create trigger kelvin_contract_rewrite
      before insert on public.kelvin_intake_receipts
      for each row execute function public.kelvin_contract_rewrite_forged();
  `);
  const first = await psql('kelvin_vm_contract_trigger', 'select public.kelvin_intake_receipt_contract_v3()');
  const second = await psql('kelvin_vm_contract_trigger', 'select public.kelvin_intake_receipt_contract_v3()');
  const leftover = await psql('kelvin_vm_contract_trigger', `
    select (select count(*) from public.kelvin_intake_receipts where task_id = 'kelvin-contract-probe')
        || ',' || (select count(*) from public.kelvin_contract_probe_audit)
  `);
  assert(triggerBase.code === 0 && trigger.code === 0 && first.out.includes('state check accepts forged') && second.out.includes('state check accepts forged') && leftover.out.trim() === '0,0', 'a rewriting trigger fails closed without leaving a probe row or audit row');
  const triggerMigration = await apply('kelvin_vm_contract_trigger', M0112);
  const triggerRemains = await psql('kelvin_vm_contract_trigger', `
    select count(*) from pg_trigger where tgname = 'kelvin_contract_rewrite' and not tgisinternal
  `);
  assert(triggerMigration.code !== 0 && triggerRemains.out.trim() === '1', '0112 does not drop the rewriting trigger');
  await psql('kelvin_vm_contract_trigger', 'drop trigger kelvin_contract_rewrite on public.kelvin_intake_receipts');
  const triggerRepair = await apply('kelvin_vm_contract_trigger', M0112);
  const triggerOk = await psql('kelvin_vm_contract_trigger', 'select public.kelvin_intake_receipt_contract_v3()');
  const triggerClean = await psql('kelvin_vm_contract_trigger', `select count(*) from public.kelvin_intake_receipts where task_id = 'kelvin-contract-probe'`);
  assert(triggerRepair.code === 0 && triggerOk.out.trim() === 'ok' && triggerClean.out.trim() === '0', 'v3 is ok and side-effect free after the trigger is removed');

  const roleBase = await apply('kelvin_vm_contract_role', M0112);
  const bypass = await psql('kelvin_vm_contract_role', `
    create role kelvin_contract_bypass bypassrls nologin;
    grant insert, update, delete on table public.kelvin_intake_receipts to kelvin_contract_bypass;
    grant kelvin_contract_bypass to anon with inherit false, set true;
  `);
  const effective = await psql('kelvin_vm_contract_role', `
    select has_table_privilege('anon', 'public.kelvin_intake_receipts', 'INSERT')
  `);
  const bypassContract = await psql('kelvin_vm_contract_role', 'select public.kelvin_intake_receipt_contract_v3()');
  assert(roleBase.code === 0 && bypass.code === 0 && effective.out.trim() === 'f' && bypassContract.out.includes('anon can set role to bypassrls role') && bypassContract.out.includes('kelvin_contract_bypass'), 'v3 rejects noinherit set-role membership in a bypassrls role');
  const sqlAssume = await psql('kelvin_vm_contract_role', `
    set session authorization anon;
    set role kelvin_contract_bypass;
    insert into public.kelvin_intake_receipts (task_id, agent, state) values ('${TASK}', 'APEX', 'accepted');
  `);
  assert(sqlAssume.code === 0, 'a direct SQL session as anon can set role to the bypass role and insert');
  const inert = await psql('kelvin_vm_contract_role', `
    reset role;
    revoke kelvin_contract_bypass from anon;
    create role kelvin_contract_inert bypassrls nologin;
    grant kelvin_contract_inert to anon with inherit false, set false;
  `);
  const inertContract = await psql('kelvin_vm_contract_role', 'select public.kelvin_intake_receipt_contract_v3()');
  const cannotSet = await psql('kelvin_vm_contract_role', `
    set session authorization anon;
    set role kelvin_contract_inert;
  `);
  assert(inert.code === 0 && inertContract.out.trim() === 'ok' && cannotSet.code !== 0, 'set false membership is not treated as a reachable bypass role');
  const roleMigration = await psql('kelvin_vm_contract_role', `
    reset role;
    revoke kelvin_contract_inert from anon;
    grant kelvin_contract_bypass to anon with inherit false, set true;
  `);
  const roleFailed = await apply('kelvin_vm_contract_role', M0112);
  const memberRemains = await psql('kelvin_vm_contract_role', `select pg_has_role('anon', 'kelvin_contract_bypass', 'set')`);
  assert(roleMigration.code === 0 && roleFailed.code !== 0 && memberRemains.out.trim() === 't', '0112 does not revoke the bypass role membership');

  await psql('postgres', `
    do $clear_bypass$
    begin
      if exists (select 1 from pg_roles where rolname = 'kelvin_contract_bypass')
         and exists (select 1 from pg_roles where rolname = 'anon')
         and pg_has_role('anon', 'kelvin_contract_bypass', 'member') then
        revoke kelvin_contract_bypass from anon;
      end if;
    end
    $clear_bypass$;
  `);
  const apiBase = await apply('kelvin_vm_contract_api', M0112);
  assert(apiBase.code === 0, 'api database applies 0112 alone');
  const dir = mkdtempSync(join(tmpdir(), 'kelvin-contract-postgrest-'));
  const config = join(dir, 'postgrest.conf');
  const port = 35434;
  writeFileSync(config, [
    `db-uri = "postgres://authenticator:${PASSWORD}@127.0.0.1:5432/kelvin_vm_contract_api"`,
    'db-schemas = "public"',
    'db-anon-role = "anon"',
    `jwt-secret = "${JWT_SECRET}"`,
    `server-port = ${port}`,
    'server-host = "127.0.0.1"',
    '',
  ].join('\n'));
  const server = spawn(POSTGREST, [config], { stdio: ['ignore', 'ignore', 'pipe'] });
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const probe = await fetch(`http://127.0.0.1:${port}/`);
      if (probe.status < 500) { ready = true; break; }
    } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert(ready, 'local PostgREST started');
  if (ready) {
    const url = `http://127.0.0.1:${port}`;
    const restFetch: typeof fetch = (input, init) => {
      const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      return fetch(raw.replace('/rest/v1', ''), init);
    };
    const service = createClient(url, jwt('service_role'), { auth: { persistSession: false }, global: { fetch: restFetch } });
    const anon = createClient(url, jwt('anon'), { auth: { persistSession: false }, global: { fetch: restFetch } });
    const proven = await service.rpc('kelvin_intake_receipt_contract_v3');
    assert(!proven.error && proven.data === 'ok', 'PostgREST service role reads contract v3 ok');
    const anonContract = await anon.rpc('kelvin_intake_receipt_contract_v3');
    assert(!!anonContract.error, 'PostgREST anon cannot execute contract v3');
    const task = 'ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const raced = await Promise.all(Array.from({ length: 6 }, () => service.from('kelvin_intake_receipts').insert({
      task_id: task, agent: 'SENTINEL', state: 'reserved',
    })));
    assert(raced.filter((item) => !item.error).length === 1 && raced.filter((item) => item.error?.code === '23505').length === 5, 'parallel PostgREST inserts still have one winner');
    const anonWrite = await anon.from('kelvin_intake_receipts').insert({ task_id: '99999999-bbbb-4ccc-8ddd-eeeeeeeeeeee', agent: 'APEX', state: 'accepted' });
    assert(!!anonWrite.error, 'PostgREST anon cannot insert an accepted receipt');
    await psql('kelvin_vm_contract_api', `
      do $api_role$
      begin
        if not exists (select 1 from pg_roles where rolname = 'kelvin_contract_bypass') then
          create role kelvin_contract_bypass bypassrls nologin;
        end if;
      end
      $api_role$;
      grant insert on table public.kelvin_intake_receipts to kelvin_contract_bypass;
      do $api_grant$
      begin
        if not pg_has_role('anon', 'kelvin_contract_bypass', 'member') then
          grant kelvin_contract_bypass to anon with inherit false, set true;
        end if;
      end
      $api_grant$;
    `);
    const anonStill = await anon.from('kelvin_intake_receipts').insert({
      task_id: '11111111-bbbb-4ccc-8ddd-eeeeeeeeeeee', agent: 'APEX', state: 'accepted',
    });
    assert(!!anonStill.error, 'the anon JWT still cannot insert when that membership exists');
    // A different JWT role claim, signed with the test secret. PostgREST sets
    // the request role from that claim when authenticator can assume it.
    // authenticator can, because it can set role to anon and anon can set
    // role to the bypass role. This is not a SET ROLE statement from the
    // anon client. v3 is not ok for this membership.
    const httpBypass = createClient(url, jwt('kelvin_contract_bypass'), { auth: { persistSession: false }, global: { fetch: restFetch } });
    const claimed = await httpBypass.from('kelvin_intake_receipts').insert({
      task_id: '12121212-bbbb-4ccc-8ddd-eeeeeeeeeeee', agent: 'APEX', state: 'accepted',
    });
    const stored = await psql('kelvin_vm_contract_api', `select count(*) from public.kelvin_intake_receipts where task_id = '12121212-bbbb-4ccc-8ddd-eeeeeeeeeeee'`);
    const during = await psql('kelvin_vm_contract_api', 'select public.kelvin_intake_receipt_contract_v3()');
    assert(!claimed.error && stored.out.trim() === '1' && during.out.includes('anon can set role to bypassrls role'), 'a JWT role claim can reach the bypass role through authenticator, and v3 rejects that membership');
  }
  server.kill();
  await new Promise((resolve) => server.once('close', resolve));

  for (const name of DATABASES) await psql('postgres', `drop database if exists ${name} with (force)`);
  await psql('postgres', `
    do $drop_roles$
    begin
      if exists (select 1 from pg_roles where rolname = 'anon') and exists (select 1 from pg_roles where rolname = 'kelvin_contract_bypass') then
        begin
          execute 'revoke kelvin_contract_bypass from anon';
        exception when others then null;
        end;
      end if;
      if exists (select 1 from pg_roles where rolname = 'anon') and exists (select 1 from pg_roles where rolname = 'kelvin_contract_inert') then
        begin
          execute 'revoke kelvin_contract_inert from anon';
        exception when others then null;
        end;
      end if;
      if exists (select 1 from pg_roles where rolname = 'kelvin_contract_bypass') then
        execute 'drop role kelvin_contract_bypass';
      end if;
      if exists (select 1 from pg_roles where rolname = 'kelvin_contract_inert') then
        execute 'drop role kelvin_contract_inert';
      end if;
    end
    $drop_roles$;
  `);
  rmSync(dir, { recursive: true, force: true });
  if (failures) {
    console.error(`${failures} failed`);
    process.exit(1);
  }
  console.log('kelvin intake contract postgres selftest passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
