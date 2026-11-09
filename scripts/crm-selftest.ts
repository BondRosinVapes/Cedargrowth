// Synthetic self-test for the wholesale CRM and sales intelligence.
// These fixtures are not account findings and are not written to storage.
// Run: node --experimental-strip-types scripts/crm-selftest.ts

import { readFileSync } from 'node:fs';
import { buildDashboard } from '../src/lib/crm/dashboard.ts';
import { mapRows, parseCsv, parseDate, parseMoney } from '../src/lib/crm/importer.ts';
import { matchDistributorAccount } from '../src/lib/crm/distributor.ts';
import { productionForecast, stageWinRates } from '../src/lib/crm/forecast.ts';
import { roundLocation, sampleTaskTitle, validateMediaUpload } from '../src/lib/crm/field.ts';
import { BATCH_MISS, LINK_MISS, NABIS_CONFIRMATION, clearReorderRates, confirmationFor, currentReleased, defaultExpiry, hashReorderToken, linkAccess, newReorderToken, parseReorderLines, rateLimited, reorderDeal } from '../src/lib/crm/reorder.ts';
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
  buildAging,
  buildFunnel,
  buildWorkload,
  dollarsToCents,
  FIELD_REGISTRY,
  mirrorContract,
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
  parseOpportunityWrite,
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
import {
  handleAccountCollection,
  handleContactCollection,
  handleCounts,
  handleExport,
  handleHealth,
  handleDistributorOrders,
  handleForecast,
  handleCapacity,
  handleVisit,
  handleSample,
  handleMedia,
  handleBatches,
  handleReorderLinks,
  handlePublicReorder,
  handleTransparencyBatch,
  handleNotes,
  handleOpportunityCollection,
  handleReports,
  handleDashboard,
  handleImport,
  handleSearch,
  handleTaskCollection,
} from '../src/lib/crm/handlers.ts';
import type { CrmStore, Account, Contact, Opportunity, Task, Note, Activity } from '../src/lib/crm/store.ts';

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
  actorId: 'owner', grants: ownerGrants, method: 'GET', requestOrigin: origin, headerOrigin: null, headerMarker: '1', headerFetchSite: 'same-origin', brandRaw: 'cedargrowth',
}).ok === true, 'a same-origin read without an Origin header is accepted');
assert(authorizeCrmRequest({
  actorId: 'owner', grants: ownerGrants, method: 'POST', requestOrigin: origin, headerOrigin: null, headerMarker: '1', headerFetchSite: 'same-origin', brandRaw: 'cedargrowth',
}).status === 403, 'a mutation without an Origin header is rejected');
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

const lost = parseOpportunityWrite({ accountId: '00000000-0000-4000-8000-000000000001', name: 'Fixture', stage: 'lost' }, 'create');
assert(lost.ok === false, 'a lost opportunity without a reason is rejected');
const funnel = buildFunnel([
  { brand: 'cedargrowth', stage: 'lead', expectedCloseOn: '2026-01-01', synthetic: true },
  { brand: 'bond', stage: 'lead', expectedCloseOn: null, synthetic: true },
], 'cedargrowth');
assert(funnel.ok === false, 'funnel refuses a mixed-brand set');
const oneBrand = buildFunnel([{ brand: 'cedargrowth', stage: 'proposal', expectedCloseOn: '2026-01-01', synthetic: true }], 'cedargrowth');
assert(oneBrand.ok === true && oneBrand.synthetic === true && oneBrand.invoicedCents === null && oneBrand.paidCents === null, 'synthetic funnel is labeled and is not invoiced revenue');
const aging = buildAging([{ brand: 'cedargrowth', stage: 'qualification', expectedCloseOn: '2026-01-01', synthetic: true }], 'cedargrowth', '2026-11-08');
assert(aging.ok === true && aging.aged === 1, 'aging counts an open opportunity past expected close');
const load = buildWorkload([
  { brand: 'cedargrowth', ownerActor: 'rep-a', status: 'open', synthetic: true },
  { brand: 'cedargrowth', ownerActor: 'rep-a', status: 'done', synthetic: true },
], 'cedargrowth');
assert(load.ok === true && load.owners.length === 1 && load.owners[0].openTasks === 1, 'workload counts open tasks only');
const mirror = mirrorContract();
assert(mirror.connected === false && mirror.orders === null && mirror.invoicedCents === null, 'mirror does not report a silent zero');
assert(FIELD_REGISTRY.some((field) => field.entity === 'mirror.order' && field.editableInCrm === false && field.connected === false), 'Canix order fields stay unverified and not editable');
assert(FIELD_REGISTRY.find((field) => field.field === 'licenseRef')?.certifiesValidity === false, 'a stored license reference certifies nothing');

class MemoryCrm implements CrmStore {
  accounts: Account[] = [];
  contacts: Contact[] = [];
  opportunities: Opportunity[] = [];
  tasks: Task[] = [];
  notes: Note[] = [];
  activity: Activity[] = [];
  orders: import('../src/lib/crm/store.ts').DistributorOrder[] = [];
  stageEvents: import('../src/lib/crm/store.ts').StageEvent[] = [];
  capacity: import('../src/lib/crm/store.ts').Capacity[] = [];
  private n = 0;
  private id() { this.n += 1; return `00000000-0000-4000-8000-${String(this.n).padStart(12, '0')}`; }
  async counts(brand: 'cedargrowth' | 'bond') {
    const opps = this.opportunities.filter((row) => row.brand === brand);
    const forecasts = opps.map((row) => row.forecastCents);
    return { state: 'ok' as const, value: {
      accounts: this.accounts.filter((row) => row.brand === brand).length,
      contacts: this.contacts.filter((row) => row.brand === brand).length,
      opportunities: opps.length,
      openTasks: this.tasks.filter((row) => row.brand === brand && row.status === 'open').length,
      forecastCents: forecasts.every((value) => value === null) ? null : forecasts.reduce((sum, value) => sum + (value || 0), 0),
      forecastComplete: forecasts.every((value) => typeof value === 'number'),
    } };
  }
  async listAccounts(brand: 'cedargrowth' | 'bond', filter: { q: string | null; status: Account['status'] | null }) {
    return { state: 'ok' as const, value: this.accounts.filter((row) => row.brand === brand && (!filter.status || row.status === filter.status) && (!filter.q || row.displayName.toLowerCase().includes(filter.q))) };
  }
  async createAccount(brand: 'cedargrowth' | 'bond', actor: string, input: { displayName: string; status: Account['status']; city: string | null; notes: string; licenseRef?: string | null; facilityRef?: string | null; licenseJurisdiction?: string | null; licenseExpiry?: string | null; assignedRep?: string | null; accountType?: Account['accountType']; leadSource?: Account['leadSource']; distributor?: Account['distributor']; distributorAccountRef?: string | null }) {
    const row: Account = { id: this.id(), publicId: `test-only:${brand}:account`, brand, displayName: input.displayName, status: input.status, city: input.city, notes: input.notes, licenseRef: input.licenseRef ?? null, facilityRef: input.facilityRef ?? null, licenseJurisdiction: input.licenseJurisdiction ?? null, licenseExpiry: input.licenseExpiry ?? null, assignedRep: input.assignedRep ?? null, accountType: input.accountType ?? null, leadSource: input.leadSource ?? null, distributor: input.distributor ?? null, distributorAccountRef: input.distributorAccountRef ?? null, createdAt: 'test-only', updatedAt: 'test-only', createdBy: actor, updatedBy: actor };
    this.accounts.push(row);
    return { state: 'ok' as const, value: row };
  }
  async listNotes(brand: 'cedargrowth' | 'bond') { return { state: 'ok' as const, value: this.notes.filter((row) => row.brand === brand) }; }
  async createNote(brand: 'cedargrowth' | 'bond', actor: string, input: { accountId: string; body: string }) {
    const account = this.accounts.find((row) => row.id === input.accountId && row.brand === brand);
    if (!account) return { state: 'rejected' as const };
    const row: Note = { id: this.id(), publicId: 'test-only:note', brand, accountId: input.accountId, body: input.body, actor, createdAt: 'test-only' };
    this.notes.push(row);
    this.activity.push({ id: this.id(), publicId: 'test-only:activity', brand, accountId: input.accountId, kind: 'note_recorded', summary: 'Note appended', actor, createdAt: 'test-only' });
    return { state: 'ok' as const, value: row };
  }
  async updateAccount() { return { state: 'missing' as const }; }
  async listContacts(brand: 'cedargrowth' | 'bond') { return { state: 'ok' as const, value: this.contacts.filter((row) => row.brand === brand) }; }
  async createContact(brand: 'cedargrowth' | 'bond', _actor: string, input: { accountId: string; name: string; preference?: Contact['preference']; email?: string | null; title?: string | null; phone?: string | null; notes?: string }) {
    const account = this.accounts.find((row) => row.id === input.accountId && row.brand === brand);
    if (!account) return { state: 'rejected' as const };
    const row: Contact = { id: this.id(), publicId: 'test-only:contact', brand, accountId: input.accountId, name: input.name, title: input.title ?? null, email: input.email ?? null, phone: input.phone ?? null, notes: input.notes ?? '', preference: input.preference ?? 'unspecified', createdAt: 'test-only', updatedAt: 'test-only' };
    this.contacts.push(row);
    return { state: 'ok' as const, value: row };
  }
  async updateContact() { return { state: 'missing' as const }; }
  async listOpportunities(brand: 'cedargrowth' | 'bond') { return { state: 'ok' as const, value: this.opportunities.filter((row) => row.brand === brand) }; }
  async createOpportunity(brand: 'cedargrowth' | 'bond', _actor: string, input: { accountId: string; name: string; stage: Opportunity['stage']; forecastCents?: number | null; expectedCloseOn?: string | null; notes?: string; lossReason?: string | null; nextAction?: string | null; nextActionOn?: string | null; productLine?: Opportunity['productLine']; quantityUnits?: number | null }) {
    const account = this.accounts.find((row) => row.id === input.accountId && row.brand === brand);
    if (!account) return { state: 'rejected' as const };
    const row: Opportunity = { id: this.id(), publicId: 'test-only:opportunity', brand, accountId: input.accountId, name: input.name, stage: input.stage, forecastCents: input.forecastCents ?? null, amountKind: 'forecast', invoicedCents: null, paidCents: null, expectedCloseOn: input.expectedCloseOn ?? null, notes: input.notes ?? '', lossReason: input.lossReason ?? null, nextAction: input.nextAction ?? null, nextActionOn: input.nextActionOn ?? null, productLine: input.productLine ?? null, quantityUnits: input.quantityUnits ?? null, updatedAt: 'test-only' };
    this.opportunities.push(row);
    this.stageEvents.push({ id: this.id(), brand, opportunityId: row.id, fromStage: null, toStage: input.stage, at: 'test-only' });
    return { state: 'ok' as const, value: row };
  }
  async updateOpportunity() { return { state: 'missing' as const }; }
  async listTasks(brand: 'cedargrowth' | 'bond') { return { state: 'ok' as const, value: this.tasks.filter((row) => row.brand === brand) }; }
  async createTask(brand: 'cedargrowth' | 'bond', actor: string, input: { title: string; status: Task['status']; accountId?: string | null; dueOn?: string | null; ownerActor?: string | null; notes?: string }) {
    const row: Task = { id: this.id(), publicId: 'test-only:task', brand, accountId: input.accountId ?? null, opportunityId: null, title: input.title, dueOn: input.dueOn ?? null, status: input.status, notes: input.notes ?? '', ownerActor: input.ownerActor || actor, completedAt: null };
    this.tasks.push(row);
    return { state: 'ok' as const, value: row };
  }
  async updateTask() { return { state: 'missing' as const }; }
  async listActivity(brand: 'cedargrowth' | 'bond') { return { state: 'ok' as const, value: this.activity.filter((row) => row.brand === brand) }; }
  async search(brand: 'cedargrowth' | 'bond', q: string) {
    const needle = q.toLowerCase();
    return { state: 'ok' as const, value: {
      accounts: this.accounts.filter((row) => row.brand === brand && row.displayName.toLowerCase().includes(needle)),
      contacts: this.contacts.filter((row) => row.brand === brand && row.name.toLowerCase().includes(needle)),
      opportunities: this.opportunities.filter((row) => row.brand === brand && row.name.toLowerCase().includes(needle)),
    } };
  }
  async exportBrand(brand: 'cedargrowth' | 'bond') {
    return { state: 'ok' as const, value: { accounts: this.accounts.filter((row) => row.brand === brand), contacts: this.contacts.filter((row) => row.brand === brand), opportunities: this.opportunities.filter((row) => row.brand === brand), tasks: this.tasks.filter((row) => row.brand === brand), activity: this.activity.filter((row) => row.brand === brand), truncated: false } };
  }
  async intelligence() { return { state: 'ok' as const, value: { recommendations: [], alerts: [] } }; }
  async applyAlert() { return { state: 'missing' as const }; }
  async listDistributorOrders(brand: 'cedargrowth' | 'bond') { return { state: 'ok' as const, value: this.orders.filter((row) => row.brand === brand) }; }
  async upsertDistributorOrder(brand: 'cedargrowth' | 'bond', actor: string, input: { distributor: import('../src/lib/crm/distributor.ts').Distributor; orderRef: string; retailerName: string; orderedOn: string | null; deliveredOn: string | null; orderStatus: import('../src/lib/crm/distributor.ts').OrderStatus; invoiceCents: number | null; retailerPaymentStatus: import('../src/lib/crm/distributor.ts').RetailerPaymentStatus; retailerPaidOn: string | null; payoutStatus: import('../src/lib/crm/distributor.ts').PayoutStatus; payoutCents: number | null; payoutOn: string | null; accountId: string | null }) {
    const found = this.orders.find((row) => row.brand === brand && row.distributor === input.distributor && row.orderRef === input.orderRef);
    if (found) {
      found.orderStatus = input.orderStatus;
      found.deliveredOn = input.deliveredOn;
      found.invoiceCents = input.invoiceCents;
      found.retailerPaymentStatus = input.retailerPaymentStatus;
      found.retailerPaidOn = input.retailerPaidOn;
      found.payoutStatus = input.payoutStatus;
      found.payoutCents = input.payoutCents;
      found.payoutOn = input.payoutOn;
      found.importedAt = '2026-11-09T14:14:00Z';
      this.activity.push({ id: this.id(), publicId: 'test-only:activity', brand, accountId: found.accountId, kind: 'distributor_order_imported', summary: 'Distributor order updated', actor, createdAt: found.importedAt });
      return { state: 'ok' as const, value: { order: found, action: 'updated' as const } };
    }
    const row = { id: this.id(), publicId: 'test-only:order', brand, accountId: input.accountId, distributor: input.distributor, orderRef: input.orderRef, retailerName: input.retailerName, orderedOn: input.orderedOn, deliveredOn: input.deliveredOn, orderStatus: input.orderStatus, invoiceCents: input.invoiceCents, retailerPaymentStatus: input.retailerPaymentStatus, retailerPaidOn: input.retailerPaidOn, payoutStatus: input.payoutStatus, payoutCents: input.payoutCents, payoutOn: input.payoutOn, opportunityId: null, source: 'csv' as const, importedAt: '2026-11-09T14:14:00Z' };
    this.orders.push(row);
    this.activity.push({ id: this.id(), publicId: 'test-only:activity', brand, accountId: input.accountId, kind: 'distributor_order_imported', summary: 'Distributor order imported', actor, createdAt: row.importedAt });
    return { state: 'ok' as const, value: { order: row, action: 'created' as const } };
  }
  async linkDistributorOrder(brand: 'cedargrowth' | 'bond', orderId: string, accountId: string) {
    const account = this.accounts.find((row) => row.id === accountId && row.brand === brand);
    const order = this.orders.find((row) => row.id === orderId && row.brand === brand);
    if (!account || !order) return { state: 'rejected' as const };
    order.accountId = accountId;
    return { state: 'ok' as const, value: order };
  }
  async markDealWonFromOrder(brand: 'cedargrowth' | 'bond', _actor: string, orderId: string, opportunityId: string) {
    const order = this.orders.find((row) => row.id === orderId && row.brand === brand);
    const deal = this.opportunities.find((row) => row.id === opportunityId && row.brand === brand);
    if (!order || !order.accountId || !deal || deal.accountId !== order.accountId || deal.stage === 'won' || deal.stage === 'lost') return { state: 'rejected' as const };
    const previous = deal.stage;
    deal.stage = 'won';
    this.stageEvents.push({ id: this.id(), brand, opportunityId, fromStage: previous, toStage: 'won', at: 'test-only' });
    order.opportunityId = opportunityId;
    return { state: 'ok' as const, value: { order, stage: 'won' as const } };
  }
  async listStageEvents(brand: 'cedargrowth' | 'bond') { return { state: 'ok' as const, value: this.stageEvents.filter((row) => row.brand === brand) }; }
  async listCapacity(brand: 'cedargrowth' | 'bond') { return { state: 'ok' as const, value: this.capacity.filter((row) => row.brand === brand) }; }
  async upsertCapacity(brand: 'cedargrowth' | 'bond', _actor: string, input: { month: string; productLine: import('../src/lib/crm/engine.ts').ProductLine; capacityUnits: number; notes: string }) {
    const found = this.capacity.find((row) => row.brand === brand && row.month === input.month && row.productLine === input.productLine);
    if (found) { found.capacityUnits = input.capacityUnits; found.notes = input.notes; return { state: 'ok' as const, value: found }; }
    const row = { id: this.id(), brand, month: input.month, productLine: input.productLine, capacityUnits: input.capacityUnits, notes: input.notes };
    this.capacity.push(row);
    return { state: 'ok' as const, value: row };
  }
  visits: import('../src/lib/crm/store.ts').Visit[] = [];
  samples: import('../src/lib/crm/store.ts').Sample[] = [];
  media: import('../src/lib/crm/store.ts').Media[] = [];
  async listVisits(brand: 'cedargrowth' | 'bond') { return { state: 'ok' as const, value: this.visits.filter((row) => row.brand === brand) }; }
  async checkIn(brand: 'cedargrowth' | 'bond', actor: string, input: { accountId: string; outcome: import('../src/lib/crm/store.ts').Visit['outcome']; notes: string; latitude: number | null; longitude: number | null }) {
    const account = this.accounts.find((row) => row.id === input.accountId && row.brand === brand);
    if (!account) return { state: 'rejected' as const };
    const row = { id: this.id(), publicId: 'test-only:visit', brand, accountId: input.accountId, repActor: actor, checkedInAt: '2026-11-09T15:00:00Z', checkedOutAt: null, latitude: input.latitude, longitude: input.longitude, outcome: input.outcome, notes: input.notes };
    this.visits.push(row);
    this.activity.push({ id: this.id(), publicId: 'test-only:activity', brand, accountId: input.accountId, kind: 'visit_logged', summary: 'Visit logged', actor, createdAt: row.checkedInAt });
    return { state: 'ok' as const, value: row };
  }
  async checkOut(brand: 'cedargrowth' | 'bond', visitId: string) {
    const visit = this.visits.find((row) => row.id === visitId && row.brand === brand && !row.checkedOutAt);
    if (!visit) return { state: 'missing' as const };
    visit.checkedOutAt = '2026-11-09T16:00:00Z';
    return { state: 'ok' as const, value: visit };
  }
  async listSamples(brand: 'cedargrowth' | 'bond') { return { state: 'ok' as const, value: this.samples.filter((row) => row.brand === brand) }; }
  async createSample(brand: 'cedargrowth' | 'bond', actor: string, input: { accountId: string; visitId: string | null; productLine: import('../src/lib/crm/engine.ts').ProductLine; quantityUnits: number; leftOn: string; followUpOn: string; notes: string }) {
    const account = this.accounts.find((row) => row.id === input.accountId && row.brand === brand);
    if (!account) return { state: 'rejected' as const };
    const sample = { id: this.id(), publicId: 'test-only:sample', brand, accountId: input.accountId, visitId: input.visitId, productLine: input.productLine, quantityUnits: input.quantityUnits, leftOn: input.leftOn, followUpOn: input.followUpOn, notes: input.notes };
    this.samples.push(sample);
    const task = { id: this.id(), publicId: 'test-only:task', brand, accountId: input.accountId, opportunityId: null, title: sampleTaskTitle(account.displayName), dueOn: input.followUpOn, status: 'open' as const, notes: input.notes, ownerActor: actor, completedAt: null };
    this.tasks.push(task);
    return { state: 'ok' as const, value: { sample, task } };
  }
  async listMedia(brand: 'cedargrowth' | 'bond') { return { state: 'ok' as const, value: this.media.filter((row) => row.brand === brand) }; }
  async createMedia(brand: 'cedargrowth' | 'bond', actor: string, input: { id: string; accountId: string; visitId: string | null; kind: 'shelf_photo' | 'voice_note'; storagePath: string; contentType: string; byteSize: number; durationSeconds: number | null }) {
    const account = this.accounts.find((row) => row.id === input.accountId && row.brand === brand);
    if (!account) return { state: 'rejected' as const };
    const row = { id: input.id, publicId: 'test-only:media', brand, accountId: input.accountId, visitId: input.visitId, kind: input.kind, storagePath: input.storagePath, contentType: input.contentType, byteSize: input.byteSize, durationSeconds: input.durationSeconds, createdBy: actor, createdAt: '2026-11-09T15:00:00Z' };
    this.media.push(row);
    return { state: 'ok' as const, value: row };
  }
  batches: import('../src/lib/crm/store.ts').Batch[] = [];
  links: import('../src/lib/crm/store.ts').ReorderLink[] = [];
  requests: import('../src/lib/crm/store.ts').ReorderRequest[] = [];
  async listBatches(brand: 'cedargrowth' | 'bond') { return { state: 'ok' as const, value: this.batches.filter((row) => row.brand === brand) }; }
  async createBatch(brand: 'cedargrowth' | 'bond', actor: string, input: { id: string; productId: string; batchNumber: string; labName: string; testedOn: string; coaStoragePath: string }) {
    if (this.batches.some((row) => row.brand === brand && row.batchNumber === input.batchNumber)) return { state: 'rejected' as const };
    const row = { id: input.id, publicId: 'test-only:batch', brand, productId: input.productId, batchNumber: input.batchNumber, labName: input.labName, testedOn: input.testedOn, coaStoragePath: input.coaStoragePath, released: false, releasedAt: null, createdBy: actor, createdAt: '2026-11-09T18:00:00Z' };
    this.batches.push(row);
    return { state: 'ok' as const, value: row };
  }
  async releaseBatch(brand: 'cedargrowth' | 'bond', id: string) {
    const batch = this.batches.find((row) => row.id === id && row.brand === brand && !row.released && row.coaStoragePath);
    if (!batch) return { state: 'missing' as const };
    batch.released = true;
    batch.releasedAt = '2026-11-09T18:05:00Z';
    return { state: 'ok' as const, value: batch };
  }
  async listReorderLinks(brand: 'cedargrowth' | 'bond', accountId: string) { return { state: 'ok' as const, value: this.links.filter((row) => row.brand === brand && row.accountId === accountId) }; }
  async createReorderLink(brand: 'cedargrowth' | 'bond', actor: string, accountId: string, nowMs: number) {
    const account = this.accounts.find((row) => row.id === accountId && row.brand === brand);
    if (!account) return { state: 'rejected' as const };
    const minted = newReorderToken();
    const row = { id: this.id(), publicId: 'test-only:link', brand, accountId, tokenHash: minted.tokenHash, expiresAt: defaultExpiry(nowMs), revokedAt: null, createdBy: actor, createdAt: new Date(nowMs).toISOString() };
    this.links.push(row);
    return { state: 'ok' as const, value: { link: row, token: minted.token } };
  }
  async revokeReorderLink(brand: 'cedargrowth' | 'bond', id: string, nowMs: number) {
    const link = this.links.find((row) => row.id === id && row.brand === brand && !row.revokedAt);
    if (!link) return { state: 'missing' as const };
    link.revokedAt = new Date(nowMs).toISOString();
    return { state: 'ok' as const, value: link };
  }
  async openReorder(token: string, nowMs: number) {
    const link = this.links.find((row) => row.tokenHash === hashReorderToken(token));
    if (!link) return { state: 'ok' as const, value: { accountName: '', distributor: null, assignedRep: null, batches: [], status: 'unavailable' as const } };
    const account = this.accounts.find((row) => row.id === link.accountId && row.brand === link.brand);
    const access = linkAccess(link, account?.status ?? null, nowMs);
    if (access !== 'ok' || !account) return { state: 'ok' as const, value: { accountName: '', distributor: null, assignedRep: null, batches: [], status: access === 'inactive' ? 'inactive' as const : 'unavailable' as const } };
    const batches = currentReleased(this.batches.filter((row) => row.brand === link.brand).map((row) => ({ id: row.id, productId: row.productId, batchNumber: row.batchNumber, labName: row.labName, testedOn: row.testedOn, released: row.released, coaStoragePath: row.coaStoragePath })));
    return { state: 'ok' as const, value: { accountName: account.displayName, distributor: account.distributor, assignedRep: account.assignedRep, batches, status: 'ok' as const } };
  }
  async submitReorder(token: string, nowMs: number, input: { lines: { productId: string; batchNumber: string; quantityUnits: number }[]; buyerName: string; buyerEmail: string; note: string }) {
    const opened = await this.openReorder(token, nowMs);
    if (opened.state !== 'ok') return opened;
    if (opened.value.status !== 'ok') return { state: 'closed' as const };
    const link = this.links.find((row) => row.tokenHash === hashReorderToken(token));
    const account = link ? this.accounts.find((row) => row.id === link.accountId && row.brand === link.brand) : undefined;
    if (!link || !account) return { state: 'closed' as const };
    const parsed = parseReorderLines(input.lines, opened.value.batches);
    if (!parsed.ok) return { state: 'rejected' as const };
    const deal = reorderDeal(parsed.lines, new Date(nowMs).toISOString().slice(0, 10));
    if (!deal) return { state: 'rejected' as const };
    const beforeRequests = this.requests.length;
    const beforeDeals = this.opportunities.length;
    const opportunity = await this.createOpportunity(link.brand, 'reorder request', { accountId: account.id, name: deal.name, stage: 'proposal', forecastCents: null, notes: 'Reorder request. No price is committed and no payment was taken.', productLine: deal.productLine, quantityUnits: deal.quantityUnits });
    if (opportunity.state !== 'ok') {
      this.requests.length = beforeRequests;
      this.opportunities.length = beforeDeals;
      return opportunity;
    }
    const request = { id: this.id(), publicId: 'test-only:request', brand: link.brand, accountId: account.id, linkId: link.id, lines: parsed.lines, buyerName: input.buyerName, buyerEmail: input.buyerEmail, note: input.note, createdAt: new Date(nowMs).toISOString(), status: 'received' as const };
    this.requests.push(request);
    return { state: 'ok' as const, value: { request, opportunity: opportunity.value, confirmation: confirmationFor(account.distributor) } };
  }
  async lookupReleasedBatch(brand: 'cedargrowth' | 'bond', batchNumber: string) {
    const batch = this.batches.find((row) => row.brand === brand && row.batchNumber === batchNumber && row.released && row.coaStoragePath) ?? null;
    return { state: 'ok' as const, value: batch };
  }
}

const memory = new MemoryCrm();
const owner = [{ brand: 'cedargrowth' as const, role: 'owner' as const }, { brand: 'bond' as const, role: 'owner' as const }];
function crmReq(method: string, path: string, body?: unknown, headers?: Record<string, string>) {
  return new Request(`https://cedargrowth.vercel.app${path}`, {
    method,
    headers: { origin: 'https://cedargrowth.vercel.app', 'x-cedargrowth-crm': '1', 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const anonCounts = await handleCounts({ actorId: null, grants: owner, request: crmReq('GET', '/api/admin/crm/counts?brand=cedargrowth'), store: memory });
assert(anonCounts.status === 404, 'route counts without a session are not found');
const csrf = await handleAccountCollection({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/accounts', { brand: 'cedargrowth', displayName: 'TEST ONLY', status: 'prospect' }, { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }), store: memory });
assert(csrf.status === 403 && memory.accounts.length === 0, 'route create rejects a cross-site origin before writing');
const created = await handleAccountCollection({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/accounts', { brand: 'cedargrowth', displayName: 'TEST ONLY synthetic account', status: 'prospect', licenseRef: 'LIC-TEST', facilityRef: 'FAC-TEST', assignedRep: 'rep-label' }), store: memory });
const accountId = String((created.body.account as { id?: string } | undefined)?.id || '');
assert(created.status === 201 && accountId.length > 0, 'route create stores a test-only account with license and facility references');
const contact = await handleContactCollection({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/contacts', { brand: 'cedargrowth', accountId, name: 'TEST ONLY synthetic contact', preference: 'do_not_contact' }), store: memory });
assert(contact.status === 201 && (contact.body.contact as { preference?: string }).preference === 'do_not_contact', 'route contact stores a preference and does not treat it as consent');
const lostRoute = await handleOpportunityCollection({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/opportunities', { brand: 'cedargrowth', accountId, name: 'TEST ONLY lost', stage: 'lost' }), store: memory });
assert(lostRoute.status === 400, 'route rejects a lost opportunity without a reason');
const opp = await handleOpportunityCollection({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/opportunities', { brand: 'cedargrowth', accountId, name: 'TEST ONLY opportunity', stage: 'licensed_buyer_review', forecastCents: 2500, expectedCloseOn: '2026-01-01' }), store: memory });
assert(opp.status === 201 && (opp.body.opportunity as { invoicedCents?: unknown }).invoicedCents === null, 'route opportunity forecast is not invoiced');
const task = await handleTaskCollection({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/tasks', { brand: 'cedargrowth', title: 'TEST ONLY follow-up', ownerActor: 'rep-label', dueOn: '2026-11-12', status: 'open' }), store: memory });
assert(task.status === 201, 'route task stores an owner and a due date');
const note = await handleNotes({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/notes', { brand: 'cedargrowth', accountId, text: 'TEST ONLY actual note' }), store: memory }, 'POST');
assert(note.status === 201 && memory.activity.some((row) => row.kind === 'note_recorded'), 'route note appends an actual activity record');
const counts = await handleCounts({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('GET', '/api/admin/crm/counts?brand=cedargrowth'), store: memory });
assert(counts.status === 200 && (counts.body.counts as { accounts?: number }).accounts === 1 && counts.body.invoicedCents === null, 'route counts stay in brand and do not invent invoiced revenue');
const bondCounts = await handleCounts({ actorId: 'sales-1', grants: salesGrant, request: crmReq('GET', '/api/admin/crm/counts?brand=bond'), store: memory });
assert(bondCounts.status === 403, 'route counts deny the other brand');
const found = await handleSearch({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('GET', '/api/admin/crm/search?brand=cedargrowth&q=TEST%20ONLY'), store: memory });
assert(found.status === 200 && ((found.body.accounts as unknown[]) || []).length === 1, 'route search finds the test-only account in its brand');
const salesExport = await handleExport({ actorId: 'sales-1', grants: salesGrant, request: crmReq('GET', '/api/admin/crm/export?brand=cedargrowth'), store: memory });
assert(salesExport.status === 403, 'route export denies a salesperson');
const adminExport = await handleExport({ actorId: 'admin-1', grants: [{ brand: 'cedargrowth', role: 'administrator' }], request: crmReq('GET', '/api/admin/crm/export?brand=cedargrowth'), store: memory });
assert(adminExport.status === 200 && adminExport.body.paidCents === null && ((adminExport.body.accounts as unknown[]) || []).length === 1, 'route export allows an administrator and leaves paid null');
const reports = await handleReports({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('GET', '/api/admin/crm/reports?brand=cedargrowth'), store: memory });
assert(reports.status === 200 && reports.body.synthetic === false && reports.body.invoicedCents === null, 'route reports are stored rows, not a synthetic live history');
const dash = await handleDashboard({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('GET', '/api/admin/crm/dashboard?brand=cedargrowth'), store: memory });
const dashBody = dash.body.dashboard as { kpis: { deals: number; avgResponseHours: unknown; winRate: unknown }; byStage: { key: string; count: number }[]; options: { reps: string[] } } | undefined;
assert(dash.status === 200 && dash.body.invoicedCents === null && dash.body.paidCents === null && !!dashBody, 'route dashboard reads stored rows and leaves invoiced and paid null');
assert(!!dashBody && dashBody.kpis.avgResponseHours === null && dashBody.kpis.winRate === null, 'dashboard reports untracked response time and no win rate without closed deals');
assert(!!dashBody && dashBody.byStage.find((row) => row.key === 'licensed_buyer_review')?.count === 1 && dashBody.options.reps.includes('rep-label'), 'dashboard counts the stored opportunity by stage and lists the rep');
const sources = dash.body.sources as { canix: { connected: boolean }; hoodie: { connected: boolean } };
assert(sources.canix.connected === false && sources.hoodie.connected === false, 'dashboard reports Canix and Hoodie as not connected');
const otherRep = await handleDashboard({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('GET', '/api/admin/crm/dashboard?brand=cedargrowth&rep=nobody'), store: memory });
assert((otherRep.body.dashboard as { kpis: { deals: number } }).kpis.deals === 0, 'dashboard rep filter scopes opportunities');
const wonOnly = await handleDashboard({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('GET', '/api/admin/crm/dashboard?brand=cedargrowth&status=won&year=2026'), store: memory });
const wonBody = wonOnly.body.dashboard as { kpis: { deals: number }; byMonth: unknown[]; byLeadSource: unknown; byAccountType: unknown };
assert(wonBody.kpis.deals === 0 && wonBody.byMonth.length === 12, 'dashboard status and year filters scope deals and keep a twelve month timeline');
assert(Array.isArray(wonBody.byLeadSource) && Array.isArray(wonBody.byAccountType), 'dashboard returns lead source and account type breakdowns');
const typedAccount = await handleAccountCollection({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/accounts', { brand: 'cedargrowth', displayName: 'TEST ONLY typed account', status: 'prospect', accountType: 'adult_use_dispensary', leadSource: 'trade_show' }), store: memory });
const typedRow = typedAccount.body.account as { id: string; accountType: string | null; leadSource: string | null } | undefined;
assert(typedAccount.status === 201 && typedRow?.accountType === 'adult_use_dispensary' && typedRow?.leadSource === 'trade_show', 'account stores account type and lead source');
const badSource = await handleAccountCollection({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/accounts', { brand: 'cedargrowth', displayName: 'TEST ONLY bad source', status: 'prospect', leadSource: 'billboard' }), store: memory });
assert(badSource.status === 400, 'an unknown lead source is rejected');
if (typedRow) await handleOpportunityCollection({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/opportunities', { brand: 'cedargrowth', accountId: typedRow.id, name: 'TEST ONLY typed deal', stage: 'proposal', forecastCents: 5000 }), store: memory });
const typedDash = await handleDashboard({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('GET', '/api/admin/crm/dashboard?brand=cedargrowth&leadSource=trade_show'), store: memory });
const typedBody = typedDash.body.dashboard as { kpis: { deals: number }; byLeadSource: { key: string; count: number; cents: number | null }[]; byAccountType: { key: string; count: number }[] };
assert(typedBody.kpis.deals === 1 && typedBody.byLeadSource[0]?.key === 'trade_show' && typedBody.byLeadSource[0]?.cents === 5000 && typedBody.byAccountType[0]?.key === 'adult_use_dispensary', 'dashboard groups deals by lead source and account type');
const responseOnly = buildDashboard({
  brand: 'cedargrowth',
  today: '2026-11-09',
  filter: { year: null, month: null, rep: null, region: null, accountType: null, leadSource: null, stage: null, status: null },
  accounts: [{ brand: 'cedargrowth', id: 'a1', status: 'prospect', city: null, assignedRep: null, createdAt: '2026-11-01T00:00:00Z' }, { brand: 'bond', id: 'b1', status: 'prospect', city: null, assignedRep: null, createdAt: '2026-11-01T00:00:00Z' }],
  opportunities: [],
  tasks: [],
  activity: [],
  notes: [{ brand: 'cedargrowth', accountId: 'a1', createdAt: '2026-11-02T06:00:00Z' }, { brand: 'cedargrowth', accountId: 'a1', createdAt: '2026-11-01T12:00:00Z' }, { brand: 'bond', accountId: 'b1', createdAt: '2026-11-01T01:00:00Z' }],
});
assert(responseOnly.kpis.avgResponseHours === 12 && responseOnly.kpis.responseSample === 1, 'response time uses the first note on each account in this brand only');
const bondDash = await handleDashboard({ actorId: 'sales-1', grants: salesGrant, request: crmReq('GET', '/api/admin/crm/dashboard?brand=bond'), store: memory });
assert(bondDash.status === 403, 'route dashboard denies the other brand');
const csv = parseCsv('\ufeffCustomer,Type,Lead Source,Rep,City\r\n"Leaf, Inc.",Dispensary,Trade show,Nick,Albany\n"Quote ""Shop""",Micro,Billboard,,\n,,,,\n');
assert(csv.length === 3 && csv[1][0] === 'Leaf, Inc.' && csv[2][0] === 'Quote "Shop"', 'csv parser handles BOM, quotes, commas, and blank lines');
const mappedAccounts = mapRows('accounts', csv);
assert(mappedAccounts.rows[0].record?.accountType === 'adult_use_dispensary' && mappedAccounts.rows[0].record?.leadSource === 'trade_show' && mappedAccounts.rows[0].record?.assignedRep === 'Nick', 'import maps header aliases and value synonyms');
assert(!!mappedAccounts.rows[1].error && mappedAccounts.rows[1].error.includes('Billboard'), 'import reports an unknown lead source instead of guessing');
assert(mapRows('deals', parseCsv('Deal name,Stage\nX,Lead\n')).missing.includes('Account'), 'import reports a missing required column');
assert(parseDate('3/14/26') === '2026-03-14' && parseDate('2026-02-30') === 'invalid' && parseMoney('$1,234.50') === 123450 && parseMoney('12abc') === 'invalid', 'import parses dates and dollar amounts strictly');
const importRows = mapRows('accounts', parseCsv('Account name,Lead source\nTEST ONLY import store,Referral\nTEST ONLY synthetic account,Referral\n')).rows;
const salesImport = await handleImport({ actorId: 'sales-1', grants: salesGrant, request: crmReq('POST', '/api/admin/crm/import', { brand: 'cedargrowth', kind: 'accounts', commit: true, rows: importRows }), store: memory });
assert(salesImport.status === 403, 'a salesperson cannot bulk import');
const dryRun = await handleImport({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/import', { brand: 'cedargrowth', kind: 'accounts', commit: false, rows: importRows }), store: memory });
const dryOutcomes = dryRun.body.outcomes as { status: string }[];
const beforeImport = (await memory.exportBrand('cedargrowth')).value.accounts.length;
assert(dryRun.status === 200 && dryOutcomes[0].status === 'ready' && dryOutcomes[1].status === 'skipped', 'dry run marks new rows ready and existing names skipped');
assert((await memory.exportBrand('cedargrowth')).value.accounts.length === beforeImport, 'dry run writes nothing');
const committed = await handleImport({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/import', { brand: 'cedargrowth', kind: 'accounts', commit: true, rows: importRows }), store: memory });
assert((committed.body.outcomes as { status: string }[])[0].status === 'created' && (await memory.exportBrand('cedargrowth')).value.accounts.length === beforeImport + 1, 'commit creates only the new account');
const dealRows = mapRows('deals', parseCsv('Account,Deal name,Stage,Amount,Close date\ntest only import store,First order,Proposal Sent,"$2,500",12/1/2026\nNo Such Store,Ghost,Lead,,\n')).rows;
const dealImport = await handleImport({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/import', { brand: 'cedargrowth', kind: 'deals', commit: true, rows: dealRows }), store: memory });
const dealOutcomes = dealImport.body.outcomes as { status: string }[];
assert(dealOutcomes[0].status === 'created' && dealOutcomes[1].status === 'error', 'deals match accounts by name and unmatched accounts are reported');
const bondImport = await handleImport({ actorId: 'sales-1', grants: salesGrant, request: crmReq('POST', '/api/admin/crm/import', { brand: 'bond', kind: 'accounts', commit: true, rows: importRows }), store: memory });
assert(bondImport.status === 403, 'import denies a brand the session is not granted');
const tooMany = await handleImport({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/import', { brand: 'cedargrowth', kind: 'accounts', commit: false, rows: Array.from({ length: 101 }, (_, i) => ({ line: i + 2, record: { displayName: `x${i}` } })) }), store: memory });
assert(tooMany.status === 413, 'import rejects oversized batches');
assert(matchDistributorAccount([{ id: 'a', displayName: 'Shop', licenseRef: 'LIC', distributorAccountRef: 'R-9' }, { id: 'b', displayName: 'Shop', licenseRef: null, distributorAccountRef: null }], { distributorAccountRef: 'R-9', licenseRef: null, retailerName: 'Other' }) === 'a', 'distributor match prefers the distributor account id');
assert(matchDistributorAccount([{ id: 'a', displayName: 'Shop', licenseRef: 'LIC', distributorAccountRef: null }, { id: 'b', displayName: 'Shop', licenseRef: 'LIC', distributorAccountRef: null }], { distributorAccountRef: null, licenseRef: 'LIC', retailerName: 'Shop' }) === null, 'distributor match does not guess when two accounts share a license');
const orderRows = mapRows('orders', parseCsv('Order ID,Retailer,License,Status,Invoice Total\nN-1,TEST ONLY synthetic account,LIC-TEST,Delivered,"$90.00"\nN-2,Nobody Retail,NO-LIC,Placed,$10\n')).rows;
assert(orderRows[0].record?.orderStatus === 'delivered' && orderRows[0].record?.invoiceCents === 9000, 'distributor import maps order headers');
const accountsBeforeOrders = memory.accounts.length;
const stageBefore = memory.opportunities.find((row) => row.accountId === accountId)?.stage;
const salesOrders = await handleImport({ actorId: 'sales-1', grants: salesGrant, request: crmReq('POST', '/api/admin/crm/import', { brand: 'cedargrowth', kind: 'orders', commit: true, rows: orderRows }), store: memory });
assert(salesOrders.status === 403 && memory.orders.length === 0, 'a salesperson cannot import distributor orders');
const orderImport = await handleImport({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/import', { brand: 'cedargrowth', kind: 'orders', commit: true, rows: orderRows }), store: memory });
const orderOut = orderImport.body.outcomes as { status: string; orderId?: string }[];
assert(orderOut[0].status === 'created' && orderOut[1].status === 'unmatched' && memory.accounts.length === accountsBeforeOrders, 'unmatched retailers are not auto-created');
assert(memory.opportunities.find((row) => row.accountId === accountId)?.stage === stageBefore, 'no deal changes stage without the button');
const reimportRows = mapRows('orders', parseCsv('Order ID,Retailer,Status,Invoice Total\nN-1,Renamed Retailer,Scheduled,$120\n')).rows;
const reimport = await handleImport({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/import', { brand: 'cedargrowth', kind: 'orders', commit: true, rows: reimportRows }), store: memory });
const stored = memory.orders.filter((row) => row.orderRef === 'N-1');
assert((reimport.body.outcomes as { status: string }[])[0].status === 'updated' && stored.length === 1 && stored[0].orderStatus === 'scheduled' && stored[0].retailerName === 'TEST ONLY synthetic account' && stored[0].invoiceCents === 12000, 're-import updates and never duplicates');
const bondOrders = await handleDistributorOrders({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('GET', '/api/admin/crm/distributor-orders?brand=bond'), store: memory }, 'GET');
assert(bondOrders.status === 200 && ((bondOrders.body.orders as unknown[]) || []).length === 0, 'distributor orders stay in their brand');
const crossLink = await handleDistributorOrders({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/distributor-orders', { brand: 'bond', action: 'link', orderId: orderOut[1].orderId, accountId }), store: memory }, 'POST');
assert(crossLink.status === 400 && memory.orders.find((row) => row.id === orderOut[1].orderId)?.accountId === null, 'a distributor order cannot be linked to another brand');
const forecastDash = await handleDashboard({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('GET', '/api/admin/crm/dashboard?brand=cedargrowth'), store: memory });
const forecastBody = forecastDash.body.dashboard as { kpis: { totalValueCents: number | null }; distributor: { invoicedNabisCents: number | null; nabisOrderCount: number } };
assert(forecastBody.kpis.totalValueCents !== forecastBody.distributor.invoicedNabisCents && forecastBody.distributor.nabisOrderCount === 2 && forecastBody.distributor.invoicedNabisCents === 13000, 'forecast and invoiced totals stay separate');
const oppId = String((opp.body.opportunity as { id?: string } | undefined)?.id || '');
const marked = await handleDistributorOrders({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/distributor-orders', { brand: 'cedargrowth', action: 'win', orderId: orderOut[0].orderId, opportunityId: oppId }), store: memory }, 'POST');
assert(marked.status === 200 && memory.opportunities.find((row) => row.id === oppId)?.stage === 'won' && memory.opportunities.find((row) => row.id === oppId)?.forecastCents === 2500, 'mark deal won is explicit and leaves the forecast unchanged');
const health = await handleHealth({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('GET', '/api/admin/crm/health?brand=cedargrowth'), store: memory });
const healthCanix = health.body.canix as { connected?: boolean; lastSuccessAt?: unknown };
assert(health.status === 200 && health.body.storage === 'ready' && health.body.configured === true && healthCanix.connected === false && health.body.adaptersConnected === false, 'ready storage is separate from a disconnected adapter');
assert(String(health.body.nabisLabel).includes('Nov 9') && String(health.body.nabisLabel).includes('CSV'), 'health names the Nabis CSV import');
assert(memory.stageEvents.some((row) => row.opportunityId === oppId && row.fromStage === null && row.toStage === 'licensed_buyer_review'), 'a new deal writes a stage event');
assert(memory.stageEvents.some((row) => row.opportunityId === oppId && row.fromStage === 'licensed_buyer_review' && row.toStage === 'won'), 'a stage change writes an event');
const defaultRates = stageWinRates([], []);
assert(defaultRates.find((row) => row.stage === 'proposal')?.rate === 0.6 && defaultRates.find((row) => row.stage === 'proposal')?.defaulted === true, 'default rates until 5 closed deals');
const historyDeals = Array.from({ length: 5 }, (_, index) => ({ id: `c${index}`, brand: 'cedargrowth', stage: (index < 4 ? 'won' : 'lost') as 'won' | 'lost', expectedCloseOn: '2026-12-01', productLine: 'vape' as const, quantityUnits: 10 }));
const learned = stageWinRates(historyDeals.map((row) => ({ brand: 'cedargrowth', opportunityId: row.id, fromStage: null, toStage: 'proposal' as const })), historyDeals);
assert(learned.find((row) => row.stage === 'proposal')?.defaulted === false && learned.find((row) => row.stage === 'proposal')?.rate === 0.8, 'win rate uses history after 5 closed deals');
const grid = productionForecast({
  opportunities: [
    { id: 'o1', brand: 'cedargrowth', stage: 'lead', expectedCloseOn: '2026-11-15', productLine: 'vape', quantityUnits: 100 },
    { id: 'o2', brand: 'cedargrowth', stage: 'won', expectedCloseOn: '2026-11-20', productLine: 'vape', quantityUnits: 50 },
    { id: 'o3', brand: 'cedargrowth', stage: 'proposal', expectedCloseOn: '2026-11-01', productLine: null, quantityUnits: null },
  ],
  capacity: [{ brand: 'cedargrowth', month: '2026-11-01', productLine: 'vape', capacityUnits: 40 }],
  rates: defaultRates,
  months: ['2026-11-01'],
});
const vapeCell = grid.cells.find((cell) => cell.productLine === 'vape');
const gummyCell = grid.cells.find((cell) => cell.productLine === 'gummy');
assert(vapeCell?.demand === 60 && vapeCell.status === 'short' && gummyCell?.status === 'no_capacity' && gummyCell.capacityUnits === null && grid.notForecastable === 1, 'demand math for open and won, and missing capacity is not zero');
const salesCap = await handleCapacity({ actorId: 'sales-1', grants: salesGrant, request: crmReq('PUT', '/api/admin/crm/capacity', { brand: 'cedargrowth', month: '2026-12', productLine: 'vape', capacityUnits: 10 }), store: memory });
assert(salesCap.status === 403, 'a salesperson cannot edit capacity');
const bondCap = await handleCapacity({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('PUT', '/api/admin/crm/capacity', { brand: 'bond', month: '2026-12', productLine: 'gummy', capacityUnits: 80 }), store: memory });
const cedarForecast = await handleForecast({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('GET', '/api/admin/crm/forecast?brand=cedargrowth&months=2'), store: memory });
const cedarCells = (cedarForecast.body.cells as { productLine: string; capacityUnits: number | null }[]) || [];
assert(bondCap.status === 200 && cedarForecast.status === 200 && cedarCells.filter((cell) => cell.productLine === 'gummy').every((cell) => cell.capacityUnits === null), 'capacity stays in its brand');
const noLocation = await handleVisit({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/visits', { brand: 'cedargrowth', accountId, outcome: 'met_buyer', notes: 'Stopped in' }), store: memory });
const noLocationVisit = noLocation.body.visit as { latitude: number | null; longitude: number | null };
assert(noLocation.status === 201 && noLocationVisit.latitude === null && noLocationVisit.longitude === null, 'location is omitted unless the rep sends it');
const rounded = roundLocation(40.7128123, -74.0060123);
const withLocation = await handleVisit({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/visits', { brand: 'cedargrowth', accountId, outcome: 'left_info', notes: '', latitude: 40.7128123, longitude: -74.0060123 }), store: memory });
const located = withLocation.body.visit as { latitude: number | null; longitude: number | null };
assert(rounded !== 'invalid' && rounded !== null && withLocation.status === 201 && located.latitude === 40.713 && located.longitude === -74.006, 'location is stored rounded');
const otherBrandVisit = await handleVisit({ actorId: 'sales-1', grants: salesGrant, request: crmReq('POST', '/api/admin/crm/visits', { brand: 'bond', accountId, outcome: 'met_buyer', notes: '' }), store: memory });
const ownBrandVisit = await handleVisit({ actorId: 'sales-1', grants: salesGrant, request: crmReq('POST', '/api/admin/crm/visits', { brand: 'cedargrowth', accountId, outcome: 'order_taken', notes: '' }), store: memory });
assert(otherBrandVisit.status === 403 && ownBrandVisit.status === 201, 'a salesperson can log visits only for their granted brand');
const crossAccount = await handleVisit({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/visits', { brand: 'bond', accountId, outcome: 'met_buyer', notes: '' }), store: memory });
assert(crossAccount.status === 400 && memory.visits.every((row) => row.brand !== 'bond'), 'check-in stays in the account brand');
const sampleSaved = await handleSample({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/samples', { brand: 'cedargrowth', accountId, productLine: 'vape', quantityUnits: 2, leftOn: '2026-11-09', followUpOn: '2026-11-20', notes: '' }), store: memory });
const sampleTask = sampleSaved.body.task as { title?: string; dueOn?: string };
assert(sampleSaved.status === 201 && sampleTask.dueOn === '2026-11-20' && sampleTask.title === 'Follow up on samples at TEST ONLY synthetic account', 'a sample creates a task with the right due date');
const wrongType = await handleMedia({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/media', { brand: 'cedargrowth', accountId, kind: 'shelf_photo', contentType: 'image/gif', byteSize: 1000 }), store: memory }, 'POST');
const tooBig = await handleMedia({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/media', { brand: 'cedargrowth', accountId, kind: 'shelf_photo', contentType: 'image/jpeg', byteSize: 8 * 1024 * 1024 + 1 }), store: memory }, 'POST');
assert(wrongType.status === 400 && tooBig.status === 400 && validateMediaUpload({ kind: 'shelf_photo', contentType: 'image/gif', byteSize: 1000, durationSeconds: null }).ok === false, 'the upload route rejects the wrong content type and oversize files');
const nowMs = Date.parse('2026-11-09T18:00:00Z');
const tokenStates = [
  linkAccess(null, 'active', nowMs),
  linkAccess({ expiresAt: '2026-11-01T00:00:00Z', revokedAt: null }, 'active', nowMs),
  linkAccess({ expiresAt: '2026-12-01T00:00:00Z', revokedAt: '2026-11-08T00:00:00Z' }, 'active', nowMs),
];
assert(tokenStates.every((state) => state === 'unavailable') && new Set(tokenStates).size === 1, 'expired, revoked and missing tokens are the same result');
assert(linkAccess({ expiresAt: '2026-12-01T00:00:00Z', revokedAt: null }, 'paused', nowMs) === 'inactive', 'an inactive account is not an open reorder');
const hidden = currentReleased([
  { id: '1', productId: 'vape-1g', batchNumber: 'HIDDEN', labName: 'Lab', testedOn: '2026-11-01', released: false, coaStoragePath: 'cedargrowth/1.pdf' },
  { id: '2', productId: 'vape-1g', batchNumber: 'LIVE', labName: 'Lab', testedOn: '2026-11-02', released: true, coaStoragePath: 'cedargrowth/2.pdf' },
]);
assert(hidden.length === 1 && hidden[0].batchNumber === 'LIVE', 'unreleased batches never appear publicly');
assert(rateLimited(1000, [900, 950], 200, 2).limited === true && rateLimited(1000, [100], 200, 2).limited === false, 'rate limit counts hits inside the window');
assert(reorderDeal([{ productId: 'vape-1g', batchNumber: 'LIVE', quantityUnits: 4 }], '2026-11-09')?.productLine === 'vape', 'a single format stays that product line');
assert(confirmationFor('nabis') === NABIS_CONFIRMATION, 'a Nabis account uses the Nabis confirmation');
const salesBatch = await handleBatches({ actorId: 'sales-1', grants: salesGrant, request: crmReq('POST', '/api/admin/crm/batches', { brand: 'cedargrowth', productId: 'vape-1g', batchNumber: 'CG-1', labName: 'Lab', testedOn: '2026-11-01', contentType: 'application/pdf', byteSize: 1200 }), store: memory }, 'POST');
assert(salesBatch.status === 403 && memory.batches.length === 0, 'a salesperson cannot record a batch');
const recorded = await handleBatches({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/batches', { brand: 'cedargrowth', productId: 'vape-1g', batchNumber: 'CG-1', labName: 'North Lab', testedOn: '2026-11-01', contentType: 'application/pdf', byteSize: 1200 }), store: memory }, 'POST');
const batchId = String((recorded.body.batch as { id?: string } | undefined)?.id || '');
assert(recorded.status === 201 && memory.batches.every((row) => row.released === false), 'a new batch stays unreleased');
const activeShop = await memory.createAccount('cedargrowth', 'gary@cedargrowthco.com', { displayName: 'TEST ONLY active shop', status: 'active', city: 'Buffalo', notes: '', distributor: 'nabis', assignedRep: 'rep@example.com' });
const activeId = activeShop.state === 'ok' ? activeShop.value.id : '';
clearReorderRates();
const openLink = await handleReorderLinks({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/reorder-links', { brand: 'cedargrowth', accountId: activeId }), store: memory }, 'POST');
const openToken = String(openLink.body.url || '').split('/').pop() || '';
const beforeRelease = await handlePublicReorder(memory, crmReq('GET', `/api/reorder/${openToken}`), openToken, 'GET');
const beforeProducts = (beforeRelease.body.products as { batch: { batchNumber?: string } | null }[]) || [];
assert(beforeRelease.status === 200 && beforeProducts.every((row) => row.batch === null), 'an unreleased batch is not on the reorder page');
const unreleasedLookup = await handleTransparencyBatch(memory, crmReq('GET', '/api/transparency/batch?number=CG-1'));
assert(unreleasedLookup.status === 200 && unreleasedLookup.body.found === false && unreleasedLookup.body.reason === BATCH_MISS, 'an unreleased batch number is not published');
const released = await handleBatches({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('PATCH', '/api/admin/crm/batches', { brand: 'cedargrowth', id: batchId }), store: memory }, 'PATCH');
assert(released.status === 200, 'an owner can release a batch');
const published = await handleTransparencyBatch(memory, crmReq('GET', '/api/transparency/batch?number=CG-1'));
assert(published.body.found === true && (published.body.batch as { labName?: string }).labName === 'North Lab', 'a released batch is published with its lab and test date');
const wrongToken = 'a'.repeat(43);
const wrong = await handlePublicReorder(memory, crmReq('GET', `/api/reorder/${wrongToken}`), wrongToken, 'GET');
const expiredLink = await memory.createReorderLink('cedargrowth', 'gary@cedargrowthco.com', activeId, nowMs);
if (expiredLink.state === 'ok') expiredLink.value.link.expiresAt = '2026-11-01T00:00:00Z';
const expiredToken = expiredLink.state === 'ok' ? expiredLink.value.token : '';
const expired = await handlePublicReorder(memory, crmReq('GET', `/api/reorder/${expiredToken}`), expiredToken, 'GET');
const revokedLink = await memory.createReorderLink('cedargrowth', 'gary@cedargrowthco.com', activeId, nowMs);
if (revokedLink.state === 'ok') await memory.revokeReorderLink('cedargrowth', revokedLink.value.link.id, nowMs);
const revokedToken = revokedLink.state === 'ok' ? revokedLink.value.token : '';
const revokedPage = await handlePublicReorder(memory, crmReq('GET', `/api/reorder/${revokedToken}`), revokedToken, 'GET');
assert(wrong.status === expired.status && expired.status === revokedPage.status && JSON.stringify(wrong.body) === JSON.stringify(expired.body) && JSON.stringify(expired.body) === JSON.stringify(revokedPage.body) && wrong.body.reason === LINK_MISS, 'expired, revoked and wrong tokens are rejected the same way');
const quietBefore = memory.requests.length;
const inactiveLink = await handleReorderLinks({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/reorder-links', { brand: 'cedargrowth', accountId }), store: memory }, 'POST');
const inactiveToken = String(inactiveLink.body.url || '').split('/').pop() || '';
const inactive = await handlePublicReorder(memory, crmReq('POST', `/api/reorder/${inactiveToken}`, { buyerName: 'Buyer', buyerEmail: 'buyer@example.com', note: '', lines: [{ productId: 'vape-1g', batchNumber: 'CG-1', quantityUnits: 2 }] }), inactiveToken, 'POST');
assert(inactive.status === wrong.status && inactive.body.reason === LINK_MISS && memory.requests.length === quietBefore, 'inactive accounts cannot submit');
const dealsBefore = memory.opportunities.filter((row) => row.brand === 'cedargrowth').length;
const bondBefore = memory.opportunities.filter((row) => row.brand === 'bond').length;
const submitted = await handlePublicReorder(memory, crmReq('POST', `/api/reorder/${openToken}`, { buyerName: 'Buyer', buyerEmail: 'buyer@example.com', note: '', lines: [{ productId: 'vape-1g', batchNumber: 'CG-1', quantityUnits: 4 }] }), openToken, 'POST');
const cedarDeals = memory.opportunities.filter((row) => row.brand === 'cedargrowth' && row.name.startsWith('Reorder '));
assert(submitted.status === 201 && submitted.body.confirmation === NABIS_CONFIRMATION && memory.requests.filter((row) => row.brand === 'cedargrowth').length === 1 && cedarDeals.length === 1 && cedarDeals[0].stage === 'proposal' && cedarDeals[0].productLine === 'vape' && cedarDeals[0].quantityUnits === 4 && cedarDeals[0].forecastCents === null && memory.opportunities.filter((row) => row.brand === 'bond').length === bondBefore && memory.opportunities.filter((row) => row.brand === 'cedargrowth').length === dealsBefore + 1, 'a submission creates exactly one request and one deal in the right brand');
const absentHealth = await handleHealth({
  actorId: 'gary@cedargrowthco.com',
  grants: owner,
  request: crmReq('GET', '/api/admin/crm/health?brand=cedargrowth'),
  store: new Proxy(memory, { get(target, prop, receiver) { return prop === 'counts' ? async () => ({ state: 'absent' }) : Reflect.get(target, prop, receiver); } }),
});
const absentCanix = absentHealth.body.canix as { connected?: boolean };
assert(absentHealth.status === 503 && absentHealth.body.ok === false && absentHealth.body.configured === false && absentHealth.body.storage === 'absent' && absentCanix.connected === false, 'absent storage is not reported as a healthy desk');

const suiteSql = readFileSync('supabase/migrations/0123_crm_suite_workflows.sql', 'utf8');
const raiseAt = suiteSql.indexOf('unsupported opportunity stage');
const dropStageAt = suiteSql.indexOf('drop constraint if exists crm_opportunities_stage_check');
const qualifiedAt = suiteSql.indexOf("when 'qualified' then 'qualification'");
const addStageAt = suiteSql.indexOf("check (stage in ('lead', 'qualification'");
assert(raiseAt > 0 && raiseAt < dropStageAt && dropStageAt < qualifiedAt && qualifiedAt < addStageAt, 'known stages are rewritten in the same statement that replaces the check');
assert(suiteSql.includes('unsupported opportunity stage'), 'an unsupported stage aborts the upgrade');
assert(suiteSql.includes("set search_path = pg_catalog"), 'audit_note pins search_path to pg_catalog');
assert(suiteSql.lastIndexOf('revoke all on all functions in schema crm_private') > suiteSql.indexOf('function crm_private.audit_note'), 'note functions repeat the execute revoke');

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
assert(middleware.includes("'/admin/crm'") && middleware.includes("'/sales/field'") && middleware.includes('kelvinEmail') && middleware.includes('SALES_AT_COOKIE'), 'middleware keeps the KELVIN owner path and the sales cookie');
assert(readFileSync('vercel.json', 'utf8').includes('crons') === false, 'no scheduled job was added');

if (failures > 0) {
  console.error(`\n${failures} failure(s).`);
  process.exit(1);
}
console.log('\nAll CRM self-tests passed.');
