// Synthetic self-test for the wholesale CRM and sales intelligence.
// These fixtures are not account findings and are not written to storage.
// Run: node --experimental-strip-types scripts/crm-selftest.ts

import { readFileSync } from 'node:fs';
import {
  activePolicy,
  alertDedupeKey,
  assertPersistable,
  authorizeCrmRequest,
  canExport,
  decideDeskAccess,
  CANIX_NOT_CONNECTED,
  containsConfidenceClaim,
  createCanixAdapter,
  createHoodieAdapter,
  dollarsToCents,
  evaluateDesk,
  evaluateProspects,
  evaluateReorder,
  evaluateStock,
  foreignStockFromCanix,
  formatForecast,
  hasForbiddenSignal,
  HOODIE_NOT_CONNECTED,
  isolateBrand,
  nextAlertState,
  parseBrand,
  plainSearch,
  prepareReorderAlert,
  projectWholesaleInsights,
  reduceAlerts,
  resolveAssignee,
  sameContact,
  signalLines,
  WHOLESALE_BRAND,
  WHOLESALE_ROUTE,
  type AlertRecord,
  type InsightSnapshot,
} from '../src/lib/crm/engine.ts';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

assert(parseBrand('cedargrowth') === 'cedargrowth', 'cedar brand parses');
assert(parseBrand('Bond') === 'bond', 'bond brand parses case-insensitively');
assert(parseBrand('gary@cedargrowthco.com') === null, 'email is not a brand');
assert(parseBrand('cedargrowth,bond') === null, 'joined brands are rejected');
assert(plainSearch('%') === null, 'wildcard-only search is rejected');

const mixed = isolateBrand(
  [{ brand: 'cedargrowth' as const, id: 'a' }, { brand: 'bond' as const, id: 'b' }],
  'cedargrowth',
);
assert(mixed.ok === false, 'mixed brand rows fail closed');
assert(sameContact({ id: '1', email: 'a@b.co' }, { id: '2', email: 'a@b.co' }) === false, 'same email is not the same contact');

const origin = 'https://cedargrowth.vercel.app';
const ownerGrants = [
  { brand: 'cedargrowth' as const, role: 'owner' as const },
  { brand: 'bond' as const, role: 'owner' as const },
];
const salesGrant = [{ brand: 'cedargrowth' as const, role: 'salesperson' as const }];
assert(authorizeCrmRequest({
  actorId: null, grants: ownerGrants, method: 'GET', requestOrigin: origin, headerOrigin: origin, headerMarker: '1', headerFetchSite: 'same-origin', brandRaw: 'cedargrowth',
}).status === 404, 'anonymous CRM request is not found');
assert(authorizeCrmRequest({
  actorId: 'owner', grants: ownerGrants, method: 'POST', requestOrigin: origin, headerOrigin: 'https://evil.example', headerMarker: '1', headerFetchSite: 'cross-site', brandRaw: 'cedargrowth',
}).status === 403, 'cross-origin mutation is rejected');
assert(authorizeCrmRequest({
  actorId: 'owner', grants: ownerGrants, method: 'GET', requestOrigin: origin, headerOrigin: origin, headerMarker: '1', headerFetchSite: 'same-origin', brandRaw: null,
}).status === 400, 'missing brand is rejected');
const bondOk = authorizeCrmRequest({
  actorId: 'owner', grants: ownerGrants, method: 'GET', requestOrigin: origin, headerOrigin: origin, headerMarker: '1', headerFetchSite: 'same-origin', brandRaw: 'bond',
});
assert(bondOk.ok === true && bondOk.brand === 'bond' && bondOk.role === 'owner', 'KELVIN owner can name Bond');
const salesBond = authorizeCrmRequest({
  actorId: 'sales-1', grants: salesGrant, method: 'GET', requestOrigin: origin, headerOrigin: origin, headerMarker: '1', headerFetchSite: 'same-origin', brandRaw: 'bond',
});
assert(salesBond.ok === false && salesBond.status === 403, 'a CedarGrowth salesperson cannot read Bond');
assert(canExport('salesperson') === false && canExport('administrator') === true && canExport('owner') === true, 'export stays with administrator and owner');

const ownerDesk = decideDeskAccess({
  kelvinOwner: true,
  kelvinActorId: 'gary@cedargrowthco.com',
  salesUserId: null,
  memberships: [],
  requestedBrand: 'bond',
  practiceRole: 'OWNER',
  userMetadataRole: 'salesperson',
});
assert(ownerDesk.ok === true && ownerDesk.source === 'kelvin_owner' && ownerDesk.grants.length === 2, 'verified KELVIN owner keeps both brands without a membership row');
const emailAlone = decideDeskAccess({
  kelvinOwner: false,
  kelvinActorId: 'gary@cedargrowthco.com',
  salesUserId: null,
  memberships: [],
  requestedBrand: 'cedargrowth',
  practiceRole: 'OWNER',
});
assert(emailAlone.ok === false && emailAlone.reason === 'no_session', 'an owner email or Practice OWNER label is not a session');
const salesDesk = decideDeskAccess({
  kelvinOwner: false,
  kelvinActorId: null,
  salesUserId: 'user-a',
  memberships: [{ authUserId: 'user-a', brand: 'cedargrowth', deskRole: 'salesperson', revokedAt: null }],
  requestedBrand: 'cedargrowth',
});
assert(salesDesk.ok === true && salesDesk.grants[0].role === 'salesperson', 'explicit salesperson membership is brand scoped');
const adminDesk = decideDeskAccess({
  kelvinOwner: false,
  kelvinActorId: null,
  salesUserId: 'user-b',
  memberships: [{ authUserId: 'user-b', brand: 'bond', deskRole: 'administrator', revokedAt: null }],
  requestedBrand: 'cedargrowth',
});
assert(adminDesk.ok === false && adminDesk.reason === 'brand_denied', 'a Bond administrator is not a CedarGrowth administrator');
const revoked = decideDeskAccess({
  kelvinOwner: false,
  kelvinActorId: null,
  salesUserId: 'user-a',
  memberships: [{ authUserId: 'user-a', brand: 'cedargrowth', deskRole: 'salesperson', revokedAt: '2026-11-01T00:00:00Z' }],
  requestedBrand: null,
});
assert(revoked.ok === false && revoked.reason === 'not_provisioned', 'revoked membership does not grant access');
const fakeOwner = decideDeskAccess({
  kelvinOwner: false,
  kelvinActorId: null,
  salesUserId: 'user-c',
  memberships: [{ authUserId: 'user-c', brand: 'cedargrowth', deskRole: 'owner', revokedAt: null }],
  requestedBrand: null,
  userMetadataRole: 'administrator',
});
assert(fakeOwner.ok === false, 'a membership cannot self-assign the KELVIN owner role');
assert(resolveAssignee('other@example.com', 'gary@cedargrowthco.com') === 'gary@cedargrowthco.com', 'assignee is the signed-in admin');
assert(dollarsToCents('12.5') === 1250, 'forecast dollars convert to cents');
assert(dollarsToCents('-1') === 'invalid', 'negative forecast is rejected');
assert(formatForecast(1250).startsWith('Forecast'), 'forecast label stays a forecast');

const originalFetch = globalThis.fetch;
let fetchCalls = 0;
globalThis.fetch = (() => { fetchCalls += 1; throw new Error('network'); }) as typeof fetch;
const canix = createCanixAdapter();
const hoodie = createHoodieAdapter();
await canix.customers();
await canix.ownInventory();
await hoodie.observedOnHand();
await hoodie.heatMap();
globalThis.fetch = originalFetch;
assert(fetchCalls === 0, 'disconnected adapters do not fetch');
assert(canix.state === 'not_connected' && (await canix.packages()).label === CANIX_NOT_CONNECTED, 'Canix label is not connected');
assert((await hoodie.retailerCoverage()).label === HOODIE_NOT_CONNECTED, 'Hoodie label is not connected');
assert(foreignStockFromCanix([{ sku: 'x', qty: 1 }]).length === 0, 'Canix inventory is not competitor stock');

const policy = { verified: true as const, minimumPurchases: 3, maxStalenessDays: 120, windowPaddingDays: 2 };
const purchases = [1, 2, 3].map((month) => ({
  purchasedOn: `2026-0${month}-01`,
  source: 'canix_sales_order' as const,
  sourceRecordedAt: `2026-0${month}-02`,
  verified: true as const,
  synthetic: true,
}));
const unverified = evaluateReorder({
  policy: activePolicy(), purchases, confirmedSchedule: { scheduledOn: '2026-04-01', source: 'crm_confirmed_schedule', sourceRecordedAt: '2026-03-02', synthetic: true }, now: '2026-03-15', synthetic: true,
});
assert(unverified.predictedWindow === null && unverified.lastActualPurchaseOn === '2026-03-01', 'unverified policy keeps the actual date and hides the window');
assert(unverified.confirmedScheduleOn === '2026-04-01', 'confirmed schedule stays separate');
assert(prepareReorderAlert(unverified, 'cedargrowth', 'fixture:retailer') === null, 'synthetic evaluation is not an alert draft');

const predicted = evaluateReorder({ policy, purchases, confirmedSchedule: null, now: '2026-03-15', synthetic: true });
assert(predicted.outcome === 'predicted_window' && predicted.predictedWindow !== null && predicted.synthetic === true, 'fixture history can compute an in-memory window');
assert(prepareReorderAlert(predicted, 'cedargrowth', 'fixture:retailer') === null, 'synthetic window is not persistable');
assert(evaluateReorder({ policy, purchases: purchases.slice(0, 2), confirmedSchedule: null, now: '2026-03-15', synthetic: true }).predictedWindow === null, 'sparse history has no window');
assert(evaluateReorder({ policy, purchases, confirmedSchedule: null, now: '2026-11-01', synthetic: true }).predictedWindow === null, 'stale history has no window');

const stockMissing = evaluateStock({ policy: activePolicy(), observations: [], menuCount: 2, canixInventorySupplied: true, now: '2026-03-15', synthetic: true });
assert(stockMissing.latestOnHand === null && stockMissing.alertEligible === false, 'menus and Canix inventory do not create low stock');
assert(stockMissing.factors.some((line) => line.includes('menu')) && stockMissing.factors.some((line) => line.includes('Canix')), 'stock factors name what was ignored');

const oneLow = evaluateStock({
  policy,
  observations: [{ source: 'hoodie_observed_on_hand', observationKind: 'on_hand', licensedCoverage: true, retailerRef: 'fixture:a', observedAt: '2026-03-10', condition: 'low', synthetic: true }],
  menuCount: 0,
  canixInventorySupplied: false,
  now: '2026-03-15',
  synthetic: true,
});
assert(oneLow.alertEligible === false && oneLow.latestOnHand === 'low', 'one low reading is not a stock change');
const changed = evaluateStock({
  policy,
  observations: [
    { source: 'hoodie_observed_on_hand', observationKind: 'on_hand', licensedCoverage: true, retailerRef: 'fixture:a', observedAt: '2026-03-01', condition: 'ok', synthetic: true },
    { source: 'hoodie_observed_on_hand', observationKind: 'on_hand', licensedCoverage: true, retailerRef: 'fixture:a', observedAt: '2026-03-10', condition: 'low', synthetic: true },
  ],
  menuCount: 0,
  canixInventorySupplied: false,
  now: '2026-03-15',
  synthetic: true,
});
assert(changed.change?.from === 'ok' && changed.change.to === 'low' && changed.alertEligible === true, 'two licensed readings can show a change');

const heatOnly = evaluateProspects({
  policy,
  heat: [{ source: 'hoodie_heatmap', geography: 'fixture-geo', category: 'fixture-category', observedAt: '2026-03-10', synthetic: true }],
  coverage: [],
  now: '2026-03-15',
  synthetic: true,
});
assert(heatOnly.candidates.length === 0, 'heat without coverage names nobody');
const unverifiedProspect = evaluateProspects({
  policy: activePolicy(),
  heat: [{ source: 'hoodie_heatmap', geography: 'fixture-geo', category: 'fixture-category', observedAt: '2026-03-10', synthetic: true }],
  coverage: [{ source: 'authorized_retailer_coverage', retailerRef: 'fixture:a', geography: 'fixture-geo', licensed: true, synthetic: true }],
  now: '2026-03-15',
  synthetic: true,
});
assert(unverifiedProspect.candidates.length === 0, 'unverified policy assigns no rank');
const ranked = evaluateProspects({
  policy,
  heat: [{ source: 'hoodie_heatmap', geography: 'fixture-geo', category: 'fixture-category', observedAt: '2026-03-10', synthetic: true }],
  coverage: [
    { source: 'authorized_retailer_coverage', retailerRef: 'fixture:b', geography: 'fixture-geo', licensed: true, synthetic: true },
    { source: 'authorized_retailer_coverage', retailerRef: 'fixture:a', geography: 'fixture-geo', licensed: true, synthetic: true },
  ],
  now: '2026-03-15',
  synthetic: true,
});
assert(ranked.candidates.length === 2 && ranked.candidates[0].rank === 1 && ranked.intentInferred === false, 'rank is an order, not intent');
assert(hasForbiddenSignal([{ email: 'person@example.com' }]) === true, 'personal fields are refused');
assert(evaluateProspects({
  policy,
  heat: [{ source: 'hoodie_heatmap', geography: 'fixture-geo', category: 'fixture-category', observedAt: '2026-03-10', synthetic: true, email: 'nope' } as never],
  coverage: [],
  now: '2026-03-15',
  synthetic: true,
}).uncertainty.includes('refused'), 'a personal field blocks prospects');

const key = alertDedupeKey({ brand: 'cedargrowth', kind: 'reorder_window', subject: 'fixture:a', evidence: 'same' });
assert(reduceAlerts([{ dedupeKey: key, synthetic: true }, { dedupeKey: 'other', synthetic: true }], false).kept === 0, 'synthetic drafts are not kept');
assert(reduceAlerts([{ dedupeKey: key, synthetic: false }, { dedupeKey: key, synthetic: false }], false).kept === 1, 'duplicate keys collapse');
let threw = false;
try { assertPersistable({ synthetic: true, activated: false, sufficiency: 'sufficient' }); } catch { threw = true; }
assert(threw, 'synthetic results cannot be stored');

const alert = {
  id: '00000000-0000-4000-8000-000000000001',
  brand: 'cedargrowth' as const,
  kind: 'reorder_window' as const,
  status: 'open' as const,
  dedupeKey: key,
  subjectRef: 'fixture:a',
  assignedTo: null,
  reviewedAt: null,
  reviewedBy: null,
  dismissedAt: null,
  dismissedBy: null,
  activated: false as const,
  synthetic: false,
  evidence: 'fixture',
  sufficiency: 'sufficient' as const,
  uncertainty: 'fixture',
  factors: [],
  source: null,
  refreshedAt: null,
  staffOnly: true as const,
};
const assigned = nextAlertState(alert, 'assign', 'gary@cedargrowthco.com', '2026-03-15T00:00:00Z');
assert(assigned.ok === true && assigned.alert.assignedTo === 'gary@cedargrowthco.com' && assigned.alert.activated === false, 'assign stays in-app');
const dismissed = assigned.ok ? nextAlertState(assigned.alert, 'dismiss', 'gary@cedargrowthco.com', '2026-03-16T00:00:00Z') : { ok: false as const, reason: '' };
assert(dismissed.ok === true && dismissed.alert.status === 'dismissed', 'dismiss closes the alert');
assert(dismissed.ok && nextAlertState(dismissed.alert, 'assign', 'gary@cedargrowthco.com', '2026-03-17T00:00:00Z').ok === false, 'dismissed alerts stay closed');

const desk = evaluateDesk({ now: '2026-03-15', synthetic: false });
assert(desk.reorder.predictedWindow === null && desk.alertsActivated === false && desk.canix.connected === false, 'live empty desk makes no prediction');
assert(containsConfidenceClaim(desk) === false, 'desk copy has no confidence percentage');
assert(signalLines(desk).length === 3, 'wholesale and CRM share three signal groups');

function snapshot(extra: Partial<InsightSnapshot> = {}): InsightSnapshot {
  return {
    brand: 'cedargrowth',
    internalNotes: ['secret note that must not leave the desk'],
    recommendations: [],
    alerts: [],
    desk,
    storage: 'ok',
    ...extra,
  };
}
const publicView = projectWholesaleInsights({ audience: { kind: 'public' }, requestedBrand: 'cedargrowth', snapshot: snapshot() });
assert(publicView.visible === false && publicView.counts === null && JSON.stringify(publicView).includes('secret note') === false, 'public wholesale view is empty');
const staffView = projectWholesaleInsights({ audience: { kind: 'staff' }, requestedBrand: WHOLESALE_BRAND, snapshot: snapshot() });
assert(staffView.visible === true && staffView.notes.length === 0 && staffView.counts !== null && staffView.route === WHOLESALE_ROUTE, 'staff wholesale view keeps signals and drops notes');
assert(projectWholesaleInsights({ audience: { kind: 'staff' }, requestedBrand: WHOLESALE_BRAND, snapshot: snapshot({ storage: 'absent' }) }).counts === null, 'unconfigured storage is not reported as zero rows');
assert(projectWholesaleInsights({ audience: { kind: 'staff' }, requestedBrand: 'bond', snapshot: snapshot() }).visible === false, 'Bond is not shown on the CedarGrowth wholesale page');
assert(projectWholesaleInsights({
  audience: { kind: 'staff' },
  requestedBrand: 'cedargrowth',
  snapshot: snapshot({ recommendations: [{ brand: 'bond', accountId: null, staffOnly: true, kind: 'prospect', evidence: 'nope', source: null, refreshedAt: null, sufficiency: 'insufficient', uncertainty: 'nope', factors: [] }] }),
}).visible === false, 'a Bond row fails the wholesale view closed');

const shareA = { brand: 'cedargrowth' as const, accountId: 'account-a', staffOnly: false, kind: 'reorder_window' as const, evidence: 'permitted', source: 'crm', refreshedAt: null, sufficiency: 'insufficient' as const, uncertainty: 'shared', factors: [] };
const secretA = { ...shareA, staffOnly: true, evidence: 'competitor' };
const shareB = { ...shareA, accountId: 'account-b', evidence: 'other retailer' };
const retailer = projectWholesaleInsights({
  audience: { kind: 'retailer', permits: ['account-a'] },
  requestedBrand: 'cedargrowth',
  snapshot: snapshot({ recommendations: [shareA, secretA, shareB] }),
});
assert(retailer.recommendations.length === 1 && retailer.recommendations[0].evidence === 'permitted', 'retailer sees only an explicit non-staff share');
assert(retailer.alerts.length === 0 && retailer.counts === null, 'retailer does not receive staff alerts or counts');
assert(projectWholesaleInsights({ audience: { kind: 'retailer', permits: [] }, requestedBrand: 'cedargrowth', snapshot: snapshot({ recommendations: [shareA] }) }).visible === false, 'a retailer with no permit sees nothing');

const sql = readFileSync('supabase/migrations/0120_crm_internal_wholesale.sql', 'utf8')
  + readFileSync('supabase/migrations/0121_crm_sales_intelligence.sql', 'utf8');
assert(sql.includes('enable row level security') && sql.includes('force row level security'), 'RLS is enabled and forced');
assert(sql.includes('revoke all on table public.crm_accounts from public, anon, authenticated'), 'anon cannot read accounts');
assert(/insert into public\.crm_accounts/i.test(sql) === false, 'migration does not seed accounts');
assert(sql.includes('synthetic = false') && sql.includes('activated = false'), 'synthetic rows and activation are rejected');
const engine = readFileSync('src/lib/crm/engine.ts', 'utf8');
assert(engine.includes('fetch(') === false, 'engine source does not call fetch');
const handlers = readFileSync('src/lib/crm/handlers.ts', 'utf8');
assert(handlers.includes('prepareReorderAlert') === false, 'HTTP handlers do not persist alert drafts');
const wholesale = readFileSync('src/components/crm/WholesaleInsights.tsx', 'utf8');
assert(wholesale.includes('getCrmStore') && wholesale.includes('localStorage') === false, 'wholesale view uses the CRM store');
const middleware = readFileSync('src/middleware.ts', 'utf8');
assert(middleware.includes("'/admin/crm'") && middleware.includes('kelvinEmail') && middleware.includes('SALES_AT_COOKIE'), 'middleware keeps the KELVIN owner path and the sales cookie');
assert(readFileSync('vercel.json', 'utf8').includes('crons') === false, 'no scheduled job was added');

if (failures > 0) {
  console.error(`\n${failures} failure(s).`);
  process.exit(1);
}
console.log('\nAll CRM self-tests passed.');
