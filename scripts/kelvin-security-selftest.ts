// Release clearance must fail closed. Run:
// node --experimental-strip-types scripts/kelvin-security-selftest.ts

import { decideReleaseClearance, releaseGate } from '../src/app/admin/kelvin/wings/security.ts';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

const missing = decideReleaseClearance({ error: true, rows: null });
assert(missing.ok === false && missing.reason.includes('unavailable'), 'select error does not clear');

const empty = decideReleaseClearance({ error: false, rows: [] });
assert(empty.ok === false && empty.reason.includes('No precheck evidence'), 'empty evidence does not clear');

const passing = decideReleaseClearance({ error: false, rows: [{ state: 'Pass' }, { state: 'Pass' }] });
assert(passing.ok === false && passing.reason.includes('not a SENTINEL or VERNIER pass'), 'stored pass marks do not clear');

const failing = decideReleaseClearance({ error: false, rows: [{ state: 'Fail' }] });
assert(failing.ok === false && failing.reason.includes('Nothing was cleared'), 'a failing precheck does not clear');

const ui = releaseGate([]);
assert(ui.ok === false && !ui.reason.includes('All prechecks passing'), 'the console does not say all prechecks are passing');

if (failures) {
  console.error(`${failures} failed`);
  process.exit(1);
}
console.log('kelvin security selftest passed');
