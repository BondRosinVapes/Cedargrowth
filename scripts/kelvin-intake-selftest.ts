// Intake contract. Run: npx tsx scripts/kelvin-intake-selftest.ts
// No network and no secret values.

import { readFileSync } from 'node:fs';
import {
  documentedIntakeUrl,
  intakeOriginAllowed,
  intakeWireBody,
  readIntakeConfig,
  runIntake,
  validateIntakeBody,
  clientFeedEventAllowed,
  intakeFetchInit,
  markFromUpdate,
  intakeOutcome,
  type IntakeClaim,
  type IntakePost,
} from '../src/lib/kelvinIntake';

const GOOD_URL = 'https://api2.cursor.sh/automations/webhook/wh_abc12345';
const PAGE = 'https://cedargrowth.vercel.app/api/admin/kelvin/intake';
const ORIGIN = 'https://cedargrowth.vercel.app';
const TASK = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

assert(documentedIntakeUrl(GOOD_URL) === GOOD_URL, 'documented webhook url is kept');
assert(documentedIntakeUrl('http://api2.cursor.sh/automations/webhook/wh_abc12345') === null, 'http rejected');
assert(documentedIntakeUrl('https://api2.cursor.sh.evil.com/automations/webhook/wh_abc12345') === null, 'lookalike host rejected');
assert(documentedIntakeUrl('https://evil.example/automations/webhook/wh_abc12345') === null, 'other host rejected');
assert(documentedIntakeUrl('https://user:pass@api2.cursor.sh/automations/webhook/wh_abc12345') === null, 'url credentials rejected');
assert(documentedIntakeUrl(`${GOOD_URL}?next=https://evil.example`) === null, 'query rejected');
assert(documentedIntakeUrl('https://api2.cursor.sh/automations/webhook/wh_abc12345/extra') === null, 'extra path rejected');
assert(documentedIntakeUrl('https://api2.cursor.sh/automations/webhook/../admin') === null, 'path escape rejected');
assert(readIntakeConfig({}).configured === false, 'missing env is unconfigured');
assert(readIntakeConfig({ url: GOOD_URL }).configured === false, 'missing key is unconfigured');
assert(readIntakeConfig({ url: 'https://evil.example/hook', key: 'secret' }).configured === false, 'bad url is unconfigured');
assert(readIntakeConfig({ url: GOOD_URL, key: 'routine-key' }).configured === false, 'url and key without a verified receipt store stay off');
assert(readIntakeConfig({ url: GOOD_URL, key: 'routine-key', receipts: 'verified' }).configured === true, 'valid pair and verified receipts are configured');
assert(clientFeedEventAllowed({ wing: 'intake', summary: 'Note' }) === false, 'clients cannot write the intake wing');
assert(clientFeedEventAllowed({ wing: null, summary: 'Intake accepted' }) === false, 'clients cannot forge an accepted receipt');
assert(clientFeedEventAllowed({ wing: 'command', summary: 'Directive recorded' }) === true, 'ordinary console notes remain allowed');

assert(!intakeOriginAllowed(null, PAGE), 'missing origin rejected');
assert(!intakeOriginAllowed('https://evil.example', PAGE), 'cross origin rejected');
assert(intakeOriginAllowed(ORIGIN, PAGE), 'same origin allowed');
assert(intakeOriginAllowed('http://localhost:3000', 'http://localhost:3000/api/admin/kelvin/intake'), 'localhost allowed');

assert(!validateIntakeBody({ agent: 'BOND', taskId: TASK, note: 'hello' }).ok, 'unknown agent rejected');
assert(!validateIntakeBody({ agent: 'MERIDIAN', taskId: 'not-a-uuid', note: 'hello' }).ok, 'bad task id rejected');
assert(!validateIntakeBody({ agent: 'MERIDIAN', taskId: TASK, note: '   ' }).ok, 'blank note rejected');
assert(!validateIntakeBody({ agent: 'MERIDIAN', taskId: TASK, note: 'x'.repeat(1001) }).ok, 'long note rejected');
assert(!validateIntakeBody({ agent: 'MERIDIAN', taskId: TASK, note: 'hello', url: 'https://evil.example' }).ok, 'client url rejected');
assert(!validateIntakeBody({ agent: 'MERIDIAN', taskId: TASK, note: 'hello', genetics: 'hidden' }).ok, 'genetics field rejected');
assert(!validateIntakeBody({ agent: 'MERIDIAN', taskId: TASK, note: 'hello', cookie: 'session' }).ok, 'cookie field rejected');
assert(validateIntakeBody({ agent: 'KELVIN', taskId: TASK, note: 'Check the roster' }).ok, 'KELVIN proposal accepted');

const wire = intakeWireBody({ agent: 'MERIDIAN', taskId: TASK, note: 'Check the roster' });
assert(wire.intent === 'propose' && wire.project === 'cedargrowth' && wire.routine === 'cedargrowth-kelvin-request-intake', 'wire body is a proposal for this routine');
assert(wire.agentBotId === '81e152c2-da8d-4d32-9c40-44f78a7a2871', 'wire body uses the server roster id');
assert(!JSON.stringify(wire).includes('cookie') && !JSON.stringify(wire).includes('genetics'), 'wire body has no cookie or genetics');

const fetchInit = intakeFetchInit({ url: GOOD_URL, key: 'routine-key', body: '{}', timeoutMs: 8000 });
assert(fetchInit.init.redirect === 'error', 'webhook fetch does not follow redirects');
assert(!Object.keys(fetchInit.init.headers as object).some((name) => name.toLowerCase() === 'cookie'), 'webhook fetch does not send a cookie');
assert(markFromUpdate({ error: true, rows: 1, durableState: 'accepted', expectedState: 'accepted' }) === 'failed', 'an update error is not a saved receipt');
assert(markFromUpdate({ error: false, rows: 1, durableState: 'reserved', expectedState: 'accepted' }) === 'failed', 'a reserved read-back is not a saved acceptance');
assert(intakeOutcome('accepted', 'failed').state === 'unpersisted' && intakeOutcome('accepted', 'failed').upstream === 'accepted', 'upstream acceptance stays distinct from a failed receipt write');

const READY = { url: GOOD_URL, key: 'routine-key', receipts: 'verified' };

async function main() {
async function attempt(overrides: Partial<Parameters<typeof runIntake>[0]> = {}, claim: () => Promise<IntakeClaim> = async () => ({ won: true })) {
  let posts = 0;
  let postedUrl = '';
  let postedBody = '';
  const order: string[] = [];
  const post: IntakePost = async (call) => {
    posts += 1;
    postedUrl = call.url;
    postedBody = call.body;
    order.push('post');
    if (overrides.post) return overrides.post(call);
    return { status: 200 };
  };
  const result = await runIntake({
    admin: 'gary@cedargrowthco.com',
    origin: ORIGIN,
    requestUrl: PAGE,
    rawText: JSON.stringify({ agent: 'FOUNDRY', taskId: TASK, note: 'Inspect the tooling note' }),
    env: READY,
    claim: async (value) => { order.push('claim'); return claim(); void value; },
    mark: async () => { order.push('mark'); return 'updated' as const; },
    contract: async () => true,
    post,
    ...overrides,
  });
  return { result, posts, postedUrl, postedBody, order };
}

const accepted = await attempt();
assert(accepted.result.http === 200 && accepted.result.body.state === 'accepted', '200 from the routine is accepted');
assert(accepted.posts === 1, 'accepted path posts once');
assert(accepted.postedUrl === GOOD_URL, 'post target is the documented url');
assert(accepted.order.join(',') === 'claim,post,mark', 'the unique claim happens before the single post');
assert(accepted.result.body.fresh === true, 'a new acceptance is marked fresh');
const sent = JSON.parse(accepted.postedBody) as Record<string, unknown>;
assert(sent.intent === 'propose' && sent.agent === 'FOUNDRY' && !('key' in sent) && !('cookie' in sent), 'posted json is the proposal only');

const already = await attempt({}, async () => ({ won: false, state: 'accepted' }));
assert(already.result.http === 409 && already.result.body.state === 'accepted' && already.result.body.fresh === false && already.posts === 0, 'an accepted receipt is not sent again');

const pending = await attempt({}, async () => ({ won: false, state: 'reserved' }));
assert(pending.result.body.state === 'pending' && pending.posts === 0, 'a pending receipt is reported as pending and not sent');

const refused = await attempt({}, async () => ({ won: false, state: 'rejected' }));
assert(refused.result.body.state === 'rejected' && refused.posts === 0, 'a rejected receipt is reported as rejected and not sent');

const unknown = await attempt({}, async () => ({ won: false, state: 'unavailable' }));
assert(unknown.result.http === 502 && unknown.posts === 0, 'unavailable receipt store does not send');

const missing = await attempt({ env: {} });
assert(missing.result.http === 503 && missing.result.body.state === 'unconfigured' && missing.posts === 0, 'disabled when env is absent');

const badTarget = await attempt({ env: { url: 'https://evil.example/automations/webhook/wh_abc12345', key: 'routine-key' } });
assert(badTarget.result.body.state === 'unconfigured' && badTarget.posts === 0, 'disabled when the target is not the documented host');

const forbidden = await attempt({ origin: 'https://evil.example' });
assert(forbidden.result.http === 403 && forbidden.posts === 0, 'cross origin rejected before send');

const anonymous = await attempt({ admin: null });
assert(anonymous.result.http === 401 && anonymous.posts === 0, 'anonymous rejected before send');

const invalid = await attempt({ rawText: JSON.stringify({ agent: 'NOBODY', taskId: TASK, note: 'no' }) });
assert(invalid.result.http === 400 && invalid.posts === 0, 'invalid proposal rejected before send');

let failedPosts = 0;
const failed = await attempt({
  post: async () => {
    failedPosts += 1;
    return { status: 500 };
  },
});
assert(failed.result.body.state === 'error' && failedPosts === 1, 'non-200 is an error and is not retried');

let thrownPosts = 0;
const thrown = await attempt({
  post: async () => {
    thrownPosts += 1;
    throw new Error('timeout');
  },
});
assert(thrown.result.body.state === 'unpersisted' && thrown.result.body.upstream === 'unknown' && thrownPosts === 1, 'an unfinished call is not called a rejection and is not retried');

const unpersisted = await attempt({
  mark: async () => 'failed',
});
assert(unpersisted.posts === 1 && unpersisted.result.body.state === 'unpersisted' && unpersisted.result.body.upstream === 'accepted' && unpersisted.result.body.fresh !== true, 'upstream 200 with a failed receipt write is not a fresh saved acceptance');

const unproven = await attempt({ contract: async () => false });
assert(unproven.posts === 0 && unproven.result.body.state === 'unproven', 'a failed receipt contract sends nothing');
const routeSource = readFileSync(new URL('../src/app/api/admin/kelvin/intake/route.ts', import.meta.url), 'utf8');
assert(routeSource.includes("rpc('kelvin_intake_receipt_contract_v3')") && !routeSource.includes('kelvin_intake_receipt_contract_v2'), 'the intake route calls contract v3');

const shared = new Map<string, 'reserved' | 'accepted' | 'rejected'>();
let entered = 0;
let openGate: () => void = () => {};
const bothInside = new Promise<void>((resolve) => { openGate = resolve; });
let releasePost: () => void = () => {};
const postGate = new Promise<void>((resolve) => { releasePost = resolve; });
let overlapPosts = 0;
const overlapPost: IntakePost = async () => {
  overlapPosts += 1;
  await postGate;
  return { status: 200 };
};
async function claimShared(): Promise<IntakeClaim> {
  entered += 1;
  if (entered === 2) openGate();
  await bothInside;
  const current = shared.get(TASK);
  if (current) {
    releasePost();
    return { won: false, state: current };
  }
  shared.set(TASK, 'reserved');
  return { won: true };
}
const overlapEnv = {
  admin: 'gary@cedargrowthco.com',
  origin: ORIGIN,
  requestUrl: PAGE,
  rawText: JSON.stringify({ agent: 'FOUNDRY', taskId: TASK, note: 'Inspect the tooling note' }),
  env: READY,
  claim: claimShared,
  mark: async (_taskId: string, summary: 'Intake accepted' | 'Intake not accepted') => {
    shared.set(TASK, summary === 'Intake accepted' ? 'accepted' : 'rejected');
    return 'updated' as const;
  },
  contract: async () => true,
  post: overlapPost,
};
const overlapped = await Promise.all([runIntake(overlapEnv), runIntake(overlapEnv)]);
const freshWins = overlapped.filter((item) => item.body.state === 'accepted' && item.body.fresh === true);
const pendingLosses = overlapped.filter((item) => item.body.state === 'pending');
assert(overlapPosts === 1 && shared.size === 1 && freshWins.length === 1 && pendingLosses.length === 1, 'overlapping claims against one unique store send one post');

if (failures) {
  console.error(`${failures} failed`);
  process.exit(1);
}
console.log('kelvin intake selftest passed');
}

main();
