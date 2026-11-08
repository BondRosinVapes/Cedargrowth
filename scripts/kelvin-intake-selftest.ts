// Intake contract. Run: npx tsx scripts/kelvin-intake-selftest.ts
// No network and no secret values.

import {
  documentedIntakeUrl,
  intakeOriginAllowed,
  intakeWireBody,
  readIntakeConfig,
  runIntake,
  validateIntakeBody,
  type IntakePost,
  type ReceiptState,
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
assert(readIntakeConfig({ url: GOOD_URL, key: 'routine-key' }).configured === true, 'valid pair is configured');

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

async function main() {
async function attempt(overrides: Partial<Parameters<typeof runIntake>[0]> = {}, receipt: ReceiptState = 'none') {
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
    env: { url: GOOD_URL, key: 'routine-key' },
    findReceipt: async () => receipt,
    reserve: async () => { order.push('reserve'); return true; },
    mark: async () => { order.push('mark'); },
    post,
    ...overrides,
  });
  return { result, posts, postedUrl, postedBody, order };
}

const accepted = await attempt();
assert(accepted.result.http === 200 && accepted.result.body.state === 'accepted', '200 from the routine is accepted');
assert(accepted.posts === 1, 'accepted path posts once');
assert(accepted.postedUrl === GOOD_URL, 'post target is the documented url');
assert(accepted.order.join(',') === 'reserve,post,mark', 'reserve happens before the single post');
const sent = JSON.parse(accepted.postedBody) as Record<string, unknown>;
assert(sent.intent === 'propose' && sent.agent === 'FOUNDRY' && !('key' in sent) && !('cookie' in sent), 'posted json is the proposal only');

const duplicate = await attempt({}, 'accepted');
assert(duplicate.result.http === 409 && duplicate.result.body.state === 'duplicate' && duplicate.posts === 0, 'duplicate task id is not sent again');

const unknown = await attempt({}, 'unknown');
assert(unknown.result.http === 502 && unknown.posts === 0, 'unknown receipt store does not send');

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
assert(thrown.result.body.state === 'error' && thrownPosts === 1, 'timeout is an error and is not retried');

if (failures) {
  console.error(`${failures} failed`);
  process.exit(1);
}
console.log('kelvin intake selftest passed');
}

main();
