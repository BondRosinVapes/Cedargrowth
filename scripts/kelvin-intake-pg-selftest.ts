// Disposable local Postgres proof for Kelvin intake receipts.
// Run: npx tsx scripts/kelvin-intake-pg-selftest.ts
// Uses the VM's local cluster only. It creates and drops databases whose names
// start with kelvin_vm_intake_. It does not connect to the CedarGrowth project.
//
// Requires: local psql, a running local Postgres, and /tmp/postgrest/postgrest.

import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { claimFromWrite, intakeOutcome, markFromUpdate } from '../src/lib/kelvinIntake';

const MIGRATION = new URL('../supabase/migrations/0110_kelvin_intake_receipts.sql', import.meta.url).pathname;
const POSTGREST = '/tmp/postgrest/postgrest';
const PASSWORD = 'kelvin-local-test-only';
const JWT_SECRET = 'kelvin-local-postgrest-test-secret';
const TASK = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const DATABASES = ['kelvin_vm_intake_ok', 'kelvin_vm_intake_bad', 'kelvin_vm_intake_api'];

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

function run(cmd: string, args: string[], input?: string): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => { out += String(chunk); });
    child.stderr.on('data', (chunk) => { err += String(chunk); });
    child.on('close', (code) => resolve({ code: code ?? 1, out, err }));
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

async function psql(db: string, sql: string): Promise<{ code: number; out: string; err: string }> {
  return run('sudo', ['-u', 'postgres', 'psql', '-d', db, '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql]);
}

async function psqlFile(db: string, file: string): Promise<{ code: number; out: string; err: string }> {
  return run('sudo', ['-u', 'postgres', 'psql', '-d', db, '-v', 'ON_ERROR_STOP=1', '--single-transaction', '-f', file]);
}

function jwt(role: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ role, iss: 'supabase', iat: 1, exp: 2000000000 })).toString('base64url');
  const data = `${header}.${payload}`;
  const sig = createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

async function resetDatabases() {
  for (const name of DATABASES) {
    await psql('postgres', `drop database if exists ${name} with (force)`);
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
    end
    $roles$;
    alter role service_role bypassrls;
    alter role authenticator password '${PASSWORD}';
    grant anon, authenticated, service_role to authenticator;
  `);
  if (roles.code !== 0) throw new Error(roles.err || roles.out);
}

async function main() {
  await resetDatabases();

  const first = await psqlFile('kelvin_vm_intake_ok', MIGRATION);
  assert(first.code === 0, 'migration applies to an empty database');
  const contract = await psql('kelvin_vm_intake_ok', 'select public.kelvin_intake_receipt_contract()');
  assert(contract.code === 0 && contract.out.trim() === 't', 'catalog contract is true after apply');
  const pk = await psql('kelvin_vm_intake_ok', `
    select a.attname
    from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
    join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'kelvin_intake_receipts' and i.indisprimary and i.indnkeyatts = 1
  `);
  assert(pk.out.trim() === 'task_id', 'primary key is task_id');

  const second = await psqlFile('kelvin_vm_intake_ok', MIGRATION);
  assert(second.code === 0, 'migration rerun against the matching table succeeds');
  const contractAgain = await psql('kelvin_vm_intake_ok', 'select public.kelvin_intake_receipt_contract()');
  assert(contractAgain.out.trim() === 't', 'catalog contract stays true after rerun');

  const planted = await psql('kelvin_vm_intake_bad', 'create table public.kelvin_intake_receipts (id integer, note text)');
  assert(planted.code === 0, 'malformed preexisting table can be planted');
  const rejected = await psqlFile('kelvin_vm_intake_bad', MIGRATION);
  assert(rejected.code !== 0 && rejected.err.includes('does not satisfy the task_id primary key contract'), 'malformed preexisting table fails the migration');
  const stillMissing = await psql('kelvin_vm_intake_bad', `
    select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'kelvin_intake_receipts' and column_name = 'task_id'
  `);
  assert(stillMissing.out.trim() === '0', 'failed migration leaves the incompatible table without task_id');
  const functionRolledBack = await psql('kelvin_vm_intake_bad', `
    select count(*) from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'kelvin_intake_receipt_contract'
  `);
  assert(functionRolledBack.out.trim() === '0', 'failed migration does not leave the contract function behind');

  const workers = await Promise.all(Array.from({ length: 8 }, () => psql(
    'kelvin_vm_intake_ok',
    `insert into public.kelvin_intake_receipts (task_id, agent, state) values ('${TASK}', 'FOUNDRY', 'reserved')`,
  )));
  const won = workers.filter((item) => item.code === 0).length;
  const lost = workers.filter((item) => item.code !== 0 && item.err.includes('duplicate key')).length;
  const stored = await psql('kelvin_vm_intake_ok', `select count(*) from public.kelvin_intake_receipts where task_id = '${TASK}'`);
  assert(won === 1 && lost === 7 && stored.out.trim() === '1', 'eight parallel connections insert one receipt');

  const anonDenied = await psql('kelvin_vm_intake_ok', `
    set role anon;
    insert into public.kelvin_intake_receipts (task_id, agent, state) values ('bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee', 'KELVIN', 'reserved');
  `);
  assert(anonDenied.code !== 0, 'anon cannot insert a receipt');
  const serviceInsert = await psql('kelvin_vm_intake_ok', `
    set role service_role;
    insert into public.kelvin_intake_receipts (task_id, agent, state) values ('bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee', 'KELVIN', 'reserved');
  `);
  assert(serviceInsert.code === 0, 'service_role can insert a receipt');

  const trigger = await psql('kelvin_vm_intake_ok', `
    create function public.kelvin_vm_block_accept() returns trigger language plpgsql as $body$
    begin
      if new.state = 'accepted' then raise exception 'synthetic update failure'; end if;
      return new;
    end
    $body$;
    create trigger kelvin_vm_block_accept before update on public.kelvin_intake_receipts
    for each row execute function public.kelvin_vm_block_accept();
  `);
  assert(trigger.code === 0, 'synthetic update failure can be installed');
  const blocked = await psql('kelvin_vm_intake_ok', `
    update public.kelvin_intake_receipts set state = 'accepted' where task_id = '${TASK}'
  `);
  const stayed = await psql('kelvin_vm_intake_ok', `select state from public.kelvin_intake_receipts where task_id = '${TASK}'`);
  assert(blocked.code !== 0 && stayed.out.trim() === 'reserved', 'a failed durable update leaves the receipt reserved');
  const interpreted = intakeOutcome('accepted', markFromUpdate({ error: true, rows: 0 }));
  assert(interpreted.state === 'unpersisted' && interpreted.upstream === 'accepted' && interpreted.fresh !== true, 'that reserved row is not reported as a fresh saved acceptance or an upstream rejection');

  const dropped = await psql('kelvin_vm_intake_api', 'select 1');
  assert(dropped.code === 0, 'api database exists');
  const apiMigrate = await psqlFile('kelvin_vm_intake_api', MIGRATION);
  assert(apiMigrate.code === 0, 'migration applies for the PostgREST database');
  await psql('kelvin_vm_intake_api', 'drop table public.kelvin_intake_receipts');
  const missingContract = await psql('kelvin_vm_intake_api', 'select public.kelvin_intake_receipt_contract()');
  assert(missingContract.out.trim() === 'f', 'contract is false when the table is missing');
  await psqlFile('kelvin_vm_intake_api', MIGRATION);

  const dir = mkdtempSync(join(tmpdir(), 'kelvin-postgrest-'));
  const config = join(dir, 'postgrest.conf');
  const port = 35432;
  writeFileSync(config, [
    `db-uri = "postgres://authenticator:${PASSWORD}@127.0.0.1:5432/kelvin_vm_intake_api"`,
    'db-schemas = "public"',
    'db-anon-role = "anon"',
    `jwt-secret = "${JWT_SECRET}"`,
    `server-port = ${port}`,
    'server-host = "127.0.0.1"',
    '',
  ].join('\n'));
  const server = spawn(POSTGREST, [config], { stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = '';
  server.stdout.on('data', (chunk) => { serverLog += String(chunk); });
  server.stderr.on('data', (chunk) => { serverLog += String(chunk); });
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const probe = await fetch(`http://127.0.0.1:${port}/`);
      if (probe.status < 500) { ready = true; break; }
    } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert(ready, 'local PostgREST started against the disposable database');
  if (ready) {
    const url = `http://127.0.0.1:${port}`;
    const restFetch: typeof fetch = (input, init) => {
      const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      return fetch(raw.replace('/rest/v1', ''), init);
    };
    const service = createClient(url, jwt('service_role'), { auth: { persistSession: false }, global: { fetch: restFetch } });
    const anon = createClient(url, jwt('anon'), { auth: { persistSession: false }, global: { fetch: restFetch } });
    const proven = await service.rpc('kelvin_intake_receipt_contract');
    if (proven.error || proven.data !== true) console.error('contract response', proven.error?.message, proven.data);
    assert(!proven.error && proven.data === true, 'PostgREST service role reads a true receipt contract');
    const anonContract = await anon.rpc('kelvin_intake_receipt_contract');
    assert(!!anonContract.error, 'PostgREST anon role cannot read the receipt contract');
    const task = 'cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const raced = await Promise.all(Array.from({ length: 6 }, () => service.from('kelvin_intake_receipts').insert({
      task_id: task,
      agent: 'CODEX',
      state: 'reserved',
    })));
    const apiWon = raced.filter((item) => !item.error).length;
    const apiLost = raced.filter((item) => item.error?.code === '23505').length;
    const loser = raced.find((item) => item.error);
    const read = await service.from('kelvin_intake_receipts').select('state').eq('task_id', task).maybeSingle();
    const claim = claimFromWrite(loser?.error?.code ?? '23505', { error: !!read.error, state: typeof read.data?.state === 'string' ? read.data.state : null });
    if (apiWon !== 1 || apiLost !== 5) console.error('postgrest race', raced.map((item) => ({ code: item.error?.code, message: item.error?.message })), 'read', read.error?.message, read.data);
    assert(apiWon === 1 && apiLost === 5 && claim.won === false && claim.state === 'reserved', 'parallel PostgREST inserts produce one reserved receipt');
    const updated = await service.from('kelvin_intake_receipts').update({ state: 'accepted' }).eq('task_id', task).select('task_id');
    assert(markFromUpdate({ error: !!updated.error, rows: updated.data?.length ?? 0 }) === 'updated', 'PostgREST update of one receipt counts as saved');
    const anonWrite = await anon.from('kelvin_intake_receipts').insert({ task_id: 'dddddddd-bbbb-4ccc-8ddd-eeeeeeeeeeee', agent: 'APEX', state: 'reserved' });
    assert(!!anonWrite.error, 'PostgREST anon role cannot insert a receipt');
    void (service as SupabaseClient);
  } else {
    console.error(serverLog);
  }
  server.kill();

  for (const name of DATABASES) await psql('postgres', `drop database if exists ${name} with (force)`);
  rmSync(dir, { recursive: true, force: true });

  if (failures) {
    console.error(`${failures} failed`);
    process.exit(1);
  }
  console.log('kelvin intake postgres selftest passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
