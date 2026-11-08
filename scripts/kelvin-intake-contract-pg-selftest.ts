// Disposable Postgres 16 and PostgREST proof for receipt contract v2.
// Run: npx tsx scripts/kelvin-intake-contract-pg-selftest.ts
// Creates and drops databases named kelvin_vm_contract_*. Does not use the
// CedarGrowth project database and does not call a live webhook.
// Plain psql -f is intentional for 0111. Do not add --single-transaction there.

import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const ROOT = new URL('..', import.meta.url);
const M0110 = new URL('supabase/migrations/0110_kelvin_intake_receipts.sql', ROOT).pathname;
const M0111 = new URL('supabase/migrations/0111_kelvin_intake_receipt_contract_v2.sql', ROOT).pathname;
const POSTGREST = '/tmp/postgrest/postgrest';
const PASSWORD = 'kelvin-local-test-only';
const JWT_SECRET = 'kelvin-local-postgrest-test-secret';
const TASK = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const DATABASES = [
  'kelvin_vm_contract_fresh',
  'kelvin_vm_contract_policy',
  'kelvin_vm_contract_tautology',
  'kelvin_vm_contract_unrelated',
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

function apply(db: string, file: string, singleTransaction: boolean) {
  const args = ['-u', 'postgres', 'psql', '-d', db, '-v', 'ON_ERROR_STOP=1'];
  if (singleTransaction) args.push('--single-transaction');
  args.push('-f', file);
  return run('sudo', args);
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
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticator') then
        create role authenticator noinherit login password '${PASSWORD}';
      end if;
      if not exists (select 1 from pg_roles where rolname = 'intake_writer') then create role intake_writer nologin; end if;
    end
    $roles$;
    alter role service_role bypassrls;
    alter role authenticator password '${PASSWORD}';
    grant anon, authenticated, service_role to authenticator;
  `);
  if (roles.code !== 0) throw new Error(roles.err || roles.out);
}

async function main() {
  await reset();

  const base = await apply('kelvin_vm_contract_fresh', M0110, true);
  assert(base.code === 0, '0110 applies on an empty database');
  const v1 = await psql('kelvin_vm_contract_fresh', 'select public.kelvin_intake_receipt_contract()');
  assert(v1.out.trim() === 't', '0110 contract is true on a clean table');
  const next = await apply('kelvin_vm_contract_fresh', M0111, false);
  assert(next.code === 0, 'plain psql -f applies 0111 on a clean 0110 table');
  const v2 = await psql('kelvin_vm_contract_fresh', 'select public.kelvin_intake_receipt_contract_v2()');
  assert(v2.out.trim() === 'ok', 'v2 contract returns ok');
  const anonFresh = await psql('kelvin_vm_contract_fresh', `
    set role anon;
    insert into public.kelvin_intake_receipts (task_id, agent, state) values ('${TASK}', 'FOUNDRY', 'accepted');
  `);
  assert(anonFresh.code !== 0, 'anon cannot insert an accepted receipt after 0111');
  const workers = await Promise.all(Array.from({ length: 8 }, () => psql(
    'kelvin_vm_contract_fresh',
    `insert into public.kelvin_intake_receipts (task_id, agent, state) values ('bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee', 'CODEX', 'reserved')`,
  )));
  const won = workers.filter((item) => item.code === 0).length;
  const lost = workers.filter((item) => item.err.includes('duplicate key')).length;
  assert(won === 1 && lost === 7, 'eight parallel connections still insert one receipt');

  const policyBase = await apply('kelvin_vm_contract_policy', M0110, true);
  assert(policyBase.code === 0, '0110 applies before the policy attack');
  const attack = await psql('kelvin_vm_contract_policy', `
    grant insert, update on table public.kelvin_intake_receipts to anon, authenticated;
    create policy p_open on public.kelvin_intake_receipts for all to anon, authenticated using (true) with check (true);
  `);
  assert(attack.code === 0, 'permissive policy and insert grants can be added');
  const weak = await psql('kelvin_vm_contract_policy', 'select public.kelvin_intake_receipt_contract()');
  assert(weak.out.trim() === 't', '0110 contract stays true when anon can write');
  const anonAccepted = await psql('kelvin_vm_contract_policy', `
    set role anon;
    insert into public.kelvin_intake_receipts (task_id, agent, state) values ('${TASK}', 'APEX', 'accepted');
  `);
  assert(anonAccepted.code === 0, 'anon inserts an accepted receipt under the permissive policy');
  const failed = await apply('kelvin_vm_contract_policy', M0111, false);
  assert(failed.code !== 0 && failed.err.includes('permissive write policy'), '0111 fails closed and names the policy');
  const policyRemains = await psql('kelvin_vm_contract_policy', `
    select count(*) from pg_policy where polrelid = 'public.kelvin_intake_receipts'::regclass and polname = 'p_open'
  `);
  const grantRemains = await psql('kelvin_vm_contract_policy', `select has_table_privilege('anon', 'public.kelvin_intake_receipts', 'INSERT')`);
  const v2Absent = await psql('kelvin_vm_contract_policy', `select to_regprocedure('public.kelvin_intake_receipt_contract_v2()') is null`);
  assert(policyRemains.out.trim() === '1' && grantRemains.out.trim() === 't' && v2Absent.out.trim() === 't', 'failed 0111 does not drop the policy, revoke the grant, or leave v2 behind');
  const dropped = await psql('kelvin_vm_contract_policy', 'drop policy p_open on public.kelvin_intake_receipts');
  assert(dropped.code === 0, 'operator can remove the incompatible policy by hand');
  const repaired = await apply('kelvin_vm_contract_policy', M0111, false);
  assert(repaired.code === 0, '0111 succeeds after the policy is removed');
  const anonAfter = await psql('kelvin_vm_contract_policy', `
    set role anon;
    insert into public.kelvin_intake_receipts (task_id, agent, state) values ('cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee', 'APEX', 'accepted');
  `);
  const authAfter = await psql('kelvin_vm_contract_policy', `
    set role authenticated;
    insert into public.kelvin_intake_receipts (task_id, agent, state) values ('dddddddd-bbbb-4ccc-8ddd-eeeeeeeeeeee', 'APEX', 'accepted');
  `);
  assert(anonAfter.code !== 0 && authAfter.code !== 0, 'anon and authenticated cannot insert after the repaired contract');

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
  assert(tautology.code === 0, 'tautological state check can be planted');
  const forgedBefore = await psql('kelvin_vm_contract_tautology', `
    insert into public.kelvin_intake_receipts (task_id, agent, state) values ('eeeeeeee-bbbb-4ccc-8ddd-eeeeeeeeeeee', 'CONTRACT', 'forged')
  `);
  assert(forgedBefore.code === 0, 'tautological check permits state forged');
  const tautologyMigration = await apply('kelvin_vm_contract_tautology', M0111, false);
  const tautologyV2 = await psql('kelvin_vm_contract_tautology', `select to_regprocedure('public.kelvin_intake_receipt_contract_v2()') is null`);
  assert(tautologyMigration.code !== 0 && tautologyMigration.err.includes('state check accepts forged') && tautologyV2.out.trim() === 't', 'plain psql -f rolls back when the state check accepts forged');

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
  assert(unrelated.code === 0, 'unrelated check containing the state names can be planted');
  const unrelatedMigration = await apply('kelvin_vm_contract_unrelated', M0111, false);
  assert(unrelatedMigration.code !== 0 && unrelatedMigration.err.includes('state check accepts forged'), 'a check that merely names the states does not pass');

  const inherited = await psql('kelvin_vm_contract_fresh', `
    grant insert, update on table public.kelvin_intake_receipts to intake_writer;
    grant intake_writer to anon;
  `);
  assert(inherited.code === 0, 'anon can inherit a writer role');
  const inheritedContract = await psql('kelvin_vm_contract_fresh', 'select public.kelvin_intake_receipt_contract_v2()');
  assert(inheritedContract.out.trim().includes('anon has an effective write privilege'), 'inherited insert privilege fails the contract');
  const inheritedMigration = await apply('kelvin_vm_contract_fresh', M0111, false);
  const inheritedStill = await psql('kelvin_vm_contract_fresh', `select has_table_privilege('anon', 'public.kelvin_intake_receipts', 'INSERT')`);
  assert(inheritedMigration.code !== 0 && inheritedStill.out.trim() === 't', '0111 does not drop the inherited writer role');
  await psql('kelvin_vm_contract_fresh', 'revoke intake_writer from anon; revoke all on table public.kelvin_intake_receipts from intake_writer');

  const column = await psql('kelvin_vm_contract_fresh', `grant update (state) on table public.kelvin_intake_receipts to anon`);
  const columnContract = await psql('kelvin_vm_contract_fresh', 'select public.kelvin_intake_receipt_contract_v2()');
  assert(column.code === 0 && columnContract.out.trim().includes('anon has an effective write privilege'), 'a column update grant on state fails the contract');
  const columnRepair = await apply('kelvin_vm_contract_fresh', M0111, false);
  const columnGone = await psql('kelvin_vm_contract_fresh', `select has_column_privilege('anon', 'public.kelvin_intake_receipts', 'state', 'UPDATE')`);
  assert(columnRepair.code === 0 && columnGone.out.trim() === 'f', '0111 revokes the column update grant');

  const published = await psql('kelvin_vm_contract_fresh', `grant insert on table public.kelvin_intake_receipts to public`);
  const publishedContract = await psql('kelvin_vm_contract_fresh', 'select public.kelvin_intake_receipt_contract_v2()');
  assert(published.code === 0 && publishedContract.out.trim() !== 'ok' && publishedContract.out.includes('write privilege'), 'a public insert grant fails the contract through effective privileges');
  const publishedRepair = await apply('kelvin_vm_contract_fresh', M0111, false);
  assert(publishedRepair.code === 0, '0111 revokes the public insert grant');

  const apiBase = await apply('kelvin_vm_contract_api', M0110, true);
  const apiNext = await apply('kelvin_vm_contract_api', M0111, false);
  assert(apiBase.code === 0 && apiNext.code === 0, 'api database has 0110 and 0111');
  const dir = mkdtempSync(join(tmpdir(), 'kelvin-contract-postgrest-'));
  const config = join(dir, 'postgrest.conf');
  const port = 35433;
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
    const proven = await service.rpc('kelvin_intake_receipt_contract_v2');
    assert(!proven.error && proven.data === 'ok', 'PostgREST service role reads contract v2 ok');
    const anonContract = await anon.rpc('kelvin_intake_receipt_contract_v2');
    assert(!!anonContract.error, 'PostgREST anon cannot execute contract v2');
    const task = 'ffffffff-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const raced = await Promise.all(Array.from({ length: 6 }, () => service.from('kelvin_intake_receipts').insert({
      task_id: task, agent: 'SENTINEL', state: 'reserved',
    })));
    assert(raced.filter((item) => !item.error).length === 1 && raced.filter((item) => item.error?.code === '23505').length === 5, 'parallel PostgREST inserts still have one winner');
    const anonWrite = await anon.from('kelvin_intake_receipts').insert({ task_id: '99999999-bbbb-4ccc-8ddd-eeeeeeeeeeee', agent: 'APEX', state: 'accepted' });
    assert(!!anonWrite.error, 'PostgREST anon cannot insert an accepted receipt');
  }
  server.kill();
  await new Promise((resolve) => server.once('close', resolve));

  for (const name of DATABASES) await psql('postgres', `drop database if exists ${name} with (force)`);
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
