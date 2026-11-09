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
  handleNotes,
  handleOpportunityCollection,
  handleReports,
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
  async createAccount(brand: 'cedargrowth' | 'bond', actor: string, input: { displayName: string; status: Account['status']; city: string | null; notes: string; licenseRef?: string | null; facilityRef?: string | null; licenseJurisdiction?: string | null; licenseExpiry?: string | null; assignedRep?: string | null }) {
    const row: Account = { id: this.id(), publicId: `test-only:${brand}:account`, brand, displayName: input.displayName, status: input.status, city: input.city, notes: input.notes, licenseRef: input.licenseRef ?? null, facilityRef: input.facilityRef ?? null, licenseJurisdiction: input.licenseJurisdiction ?? null, licenseExpiry: input.licenseExpiry ?? null, assignedRep: input.assignedRep ?? null, createdAt: 'test-only', updatedAt: 'test-only', createdBy: actor, updatedBy: actor };
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
  async createOpportunity(brand: 'cedargrowth' | 'bond', _actor: string, input: { accountId: string; name: string; stage: Opportunity['stage']; forecastCents?: number | null; expectedCloseOn?: string | null; notes?: string; lossReason?: string | null; nextAction?: string | null; nextActionOn?: string | null }) {
    const account = this.accounts.find((row) => row.id === input.accountId && row.brand === brand);
    if (!account) return { state: 'rejected' as const };
    const row: Opportunity = { id: this.id(), publicId: 'test-only:opportunity', brand, accountId: input.accountId, name: input.name, stage: input.stage, forecastCents: input.forecastCents ?? null, amountKind: 'forecast', invoicedCents: null, paidCents: null, expectedCloseOn: input.expectedCloseOn ?? null, notes: input.notes ?? '', lossReason: input.lossReason ?? null, nextAction: input.nextAction ?? null, nextActionOn: input.nextActionOn ?? null, updatedAt: 'test-only' };
    this.opportunities.push(row);
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
const health = await handleHealth({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('GET', '/api/admin/crm/health?brand=cedargrowth'), store: memory });
const healthCanix = health.body.canix as { connected?: boolean; lastSuccessAt?: unknown };
assert(health.status === 200 && health.body.storage === 'ready' && health.body.configured === true && healthCanix.connected === false && health.body.adaptersConnected === false, 'ready storage is separate from a disconnected adapter');
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
assert(middleware.includes("'/admin/crm'") && middleware.includes('kelvinEmail') && middleware.includes('SALES_AT_COOKIE'), 'middleware keeps the KELVIN owner path and the sales cookie');
assert(readFileSync('vercel.json', 'utf8').includes('crons') === false, 'no scheduled job was added');

if (failures > 0) {
  console.error(`\n${failures} failure(s).`);
  process.exit(1);
}
console.log('\nAll CRM self-tests passed.');
