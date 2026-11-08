// Roster contract for the KELVIN console. Run:
// node --experimental-strip-types scripts/kelvin-roster-selftest.ts
// Checks inert teammate metadata. It does not call a bot or read a secret.

import { QUEUE_RCS, RELEASE_CHAIN, ROSTER, rosterHasTransport } from '../src/app/admin/kelvin/store.ts';

const EXPECTED: Array<[string, string, 'console' | 'agent']> = [
  ['KELVIN', '51a4ca96-7378-472e-aeba-f893300e52ca', 'console'],
  ['MERIDIAN', '81e152c2-da8d-4d32-9c40-44f78a7a2871', 'agent'],
  ['FOUNDRY', '70bf0894-1c5a-4a64-be22-945115264b89', 'agent'],
  ['CODEX', '86d0a7ae-4c2d-4f82-8056-9635d78c3c0b', 'agent'],
  ['LITMUS', 'f80c8591-b83e-42b5-bc1b-b945923776fb', 'agent'],
  ['VERNIER', '2673912e-4d22-4894-8925-ecd45c398839', 'agent'],
  ['SENTINEL', '1df84ae6-c757-469f-bc84-5a9999aa62d5', 'agent'],
  ['APERTURE', '0b681449-ce0c-4b1f-889e-d81448f95e01', 'agent'],
  ['APEX', 'af6b28c8-870e-4c9c-b962-69a552314eb5', 'agent'],
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

assert(ROSTER.length === EXPECTED.length, 'roster has the nine named slots');
assert(ROSTER.filter((slot) => slot.id === 'MERIDIAN').length === 1, 'MERIDIAN appears once');
assert(ROSTER[0]?.id === 'KELVIN' && ROSTER[0].kind === 'console', 'KELVIN is the command center, not a duplicate lead');

for (let i = 0; i < EXPECTED.length; i += 1) {
  const slot = ROSTER[i];
  const [id, botId, kind] = EXPECTED[i];
  assert(!!slot && slot.id === id && slot.botId === botId && slot.kind === kind, `${id} id and kind`);
  assert(!!slot && slot.link === null, `${id} has no web link`);
  assert(!!slot && !slot.botId.includes('://') && !slot.botId.includes('/'), `${id} bot id is an inert identifier`);
}

const serialized = JSON.stringify(ROSTER);
assert(!serialized.includes('grokbot:'), 'roster does not embed a chat-app link');
assert(rosterHasTransport(ROSTER) === false, 'no slot claims a transport');
assert(RELEASE_CHAIN.join(',') === 'LITMUS,SENTINEL,VERNIER,Owner', 'release chain order is unchanged');
assert(QUEUE_RCS.every((rc) => rc.stage < 0), 'prototype queue marks no gate done');

if (failures) {
  console.error(`${failures} failed`);
  process.exit(1);
}
console.log('kelvin roster selftest passed');
