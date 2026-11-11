// Synthetic self-test for the wholesale CRM and sales intelligence.
// These fixtures are not account findings and are not written to storage.
// Run: node --experimental-strip-types scripts/crm-selftest.ts

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDashboard } from '../src/lib/crm/dashboard.ts';
import { assertDashboardTabs } from './crm-dashboard-tabs-selftest.ts';
import { createHash } from 'node:crypto';
import { allowedPhotoUrl, cachedPhotoName, collectCapped, currentPhotoName, fetchAllowedPhoto, imageType, loadStoredOrGooglePhoto, lookupPlace, PHOTO_CACHE_CONTROL, PHOTO_MAX_BYTES, PHOTO_MAX_HEIGHT_PX, PHOTO_MAX_WIDTH_PX, photoAddressAllowed, photoMediaUrl, photoResponseHeaders, pinnedPhotoRequest, PLACE_TTL_MS, placeCacheFresh, placeCardOnly, placePhotoObjectPath, placeQuery, placeReadPlan, readPlacePhoto, retainPlaceCache, serveStoredPhoto, sharePhotoLoad, shouldPurgePlaceDetails, storedPlaceCard, storesPlaceDetails, type PhotoLookup, type PlaceCache } from '../src/lib/crm/places.ts';
import { browserLink, stablePhotoUrl } from '../src/lib/crm/placeLinks.ts';
import { applyWonMerge, undoWonMerge, wonMergeOnSave, type LicenseWorld } from '../src/lib/crm/distributionMerge.ts';
import { handleDistributionMerge, handleGooglePlace } from '../src/lib/crm/googlePlaceHandler.ts';
import { isDispensaryAccount } from '../src/lib/crm/engine.ts';
import { assertProductionForecast } from './crm-production-forecast-selftest.ts';
import { IMPORT_BATCH, IMPORT_MAX_ROWS, chunkImportRows, mapRows, mergeBatchOutcomes, parseCsv, parseDate, parseMoney, skipRepeatedImportRows } from '../src/lib/crm/importer.ts';
import { matchDistributorAccount } from '../src/lib/crm/distributor.ts';
import { isCapacityMonth, productionForecast, readForecastCapacity, stageWinRates } from '../src/lib/crm/forecast.ts';
import { forecastDealNeeded } from '../src/lib/crm/forecastRead.ts';
import { assertForecastReads } from './crm-forecast-read-selftest.ts';
import { assertForecastPeriods } from './crm-forecast-selftest.ts';
import { roundLocation, sampleTaskTitle, validateMediaUpload } from '../src/lib/crm/field.ts';
import { BATCH_MISS, LINK_MISS, NABIS_CONFIRMATION, clearReorderRates, confirmationFor, currentReleased, defaultExpiry, hashReorderToken, linkAccess, newReorderToken, parseReorderLines, rateLimited, reorderDeal } from '../src/lib/crm/reorder.ts';
import { buildDigest, hoodieSignals, nyWeek, renderDigestHtml, renderDigestText } from '../src/lib/crm/digest.ts';
import { COUNTY_REGION, NY_COUNTIES, NY_REGIONS, COVERAGE_UPLOAD, NEEDS_HOODIE, parseCounty, regionForCounty } from '../src/lib/crm/nyRegions.ts';
import { coverageLabel } from '../src/lib/crm/territory.ts';
import { CITY_MENU_LABEL, COUNTY_MENU_LABEL, boundaryPins, boxesIntersect, cityChoices, CLOSEST_DISTINCT_PIN_UNITS, clusterFrame, clusterPins, countyAt, countyChoices, countyFrame, declutterPins, dispensaryCard, framePoints, groupHitBox, hitAt, MAP_HEIGHT, MAP_WIDTH, markerPixels, markerUnits, mergeGap, minZoomWidth, nextZoomView, pinCard, placePins, projectNy, storefrontSeparation, unmappedAccountCount, wholeStateFrame, zoomPresses, zoomStops, type MapPin, type PlacedPin } from '../src/lib/crm/nyMap.ts';
import { cardAccountFields, cardContactFields, contactMailHref, contactTelHref, mailtoHref, telHref } from '../src/lib/crm/pinCard.ts';
import { nextBestActions } from '../src/lib/crm/nextAction.ts';
import { emailStatusLabel, clearEmailRefreshRates } from '../src/lib/crm/emailStatus.ts';
import { clearIntakeRates, duplicateNote, emailDomain, excludeTestLeads, intakeExpired, intakeMessageText, normalizeBusinessName, parseIntake, signIntake, takeIntakeRate, INTAKE_MAX_BYTES, INTAKE_TEST_MARKER } from '../src/lib/crm/intake.ts';
import { applyAgentOps, parseAgentRow } from '../src/lib/crm/agentIntake.ts';
import { codexBatches, codexReport, codexWaitMs, planCodexCsv, runCodexLoad } from './codex-load-records.ts';
import type { IntakeLead } from '../src/lib/crm/intake.ts';
import { reorderLinkHtml } from '../src/lib/email.ts';
import {
  activePolicy,
  alertDedupeKey,
  assertPersistable,
  authorizeCrmRequest,
  authorizePlacePhoto,
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
  crmStorageDetail,
  isMissingSchema,
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
  handleAccountRead,
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
  handleDigestPreview,
  handleDigestSend,
  handleEmailStatusRefresh,
  handleTerritoryAssign,
  handleBondIntake,
  handleSupplierIntake,
  handleAgentIntake,
  handleIntakeDelete,
  handleIntakePurge,
  useDigestDelivery,
  useReorderDelivery,
  useEmailLookup,
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
const imgDenied = authorizeCrmRequest({
  actorId: 'owner', grants: salesGrant, method: 'GET', requestOrigin: origin, headerOrigin: null, headerMarker: null, headerFetchSite: 'same-origin', brandRaw: 'cedargrowth',
});
const imgAllowed = authorizePlacePhoto({
  actorId: 'owner', grants: salesGrant, requestOrigin: origin, headerOrigin: null, headerFetchSite: 'same-origin', brandRaw: 'cedargrowth',
});
const imgCross = authorizePlacePhoto({
  actorId: 'owner', grants: salesGrant, requestOrigin: origin, headerOrigin: 'https://evil.example', headerFetchSite: 'cross-site', brandRaw: 'cedargrowth',
});
const imgNoGrant = authorizePlacePhoto({
  actorId: 'owner', grants: [], requestOrigin: origin, headerOrigin: null, headerFetchSite: 'same-origin', brandRaw: 'cedargrowth',
});
const imgBare = authorizePlacePhoto({
  actorId: 'owner', grants: salesGrant, requestOrigin: origin, headerOrigin: null, headerFetchSite: null, brandRaw: 'cedargrowth',
});
assert(imgDenied.ok === false && imgDenied.status === 403 && imgAllowed.ok === true && imgAllowed.brand === 'cedargrowth' && imgCross.ok === false && imgNoGrant.ok === false && imgBare.ok === false && imgBare.status === 403, 'TEST ONLY: a same-origin photo image loads without the CRM header, and a request with neither site nor origin is refused');
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
  async readAccount(brand: 'cedargrowth' | 'bond', id: string) {
    return { state: 'ok' as const, value: this.accounts.find((row) => row.id === id && row.brand === brand) ?? null };
  }
  async createAccount(brand: 'cedargrowth' | 'bond', actor: string, input: { displayName: string; status: Account['status']; city: string | null; county?: string | null; notes: string; licenseRef?: string | null; facilityRef?: string | null; licenseJurisdiction?: string | null; licenseExpiry?: string | null; assignedRep?: string | null; accountType?: Account['accountType']; leadSource?: Account['leadSource']; distributor?: Account['distributor']; distributorAccountRef?: string | null }) {
    const row: Account = { id: this.id(), publicId: `test-only:${brand}:account`, brand, displayName: input.displayName, status: input.status, city: input.city, county: input.county ?? null, notes: input.notes, licenseRef: input.licenseRef ?? null, facilityRef: input.facilityRef ?? null, licenseJurisdiction: input.licenseJurisdiction ?? null, licenseExpiry: input.licenseExpiry ?? null, assignedRep: input.assignedRep ?? null, accountType: input.accountType ?? null, leadSource: input.leadSource ?? null, distributor: input.distributor ?? null, distributorAccountRef: input.distributorAccountRef ?? null, createdAt: 'test-only', updatedAt: 'test-only', createdBy: actor, updatedBy: actor };
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
  async listContacts(brand: 'cedargrowth' | 'bond', accountId?: string | null) { return { state: 'ok' as const, value: this.contacts.filter((row) => row.brand === brand && (!accountId || row.accountId === accountId)) }; }
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
  async clearPlaceDetailsIfNotSelling() { return { state: 'ok' as const, value: { cleared: false } }; }
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
  async listForecastInputs(brand: 'cedargrowth' | 'bond', window: { start: string; end: string }) {
    const opportunities = this.opportunities.filter((row) => row.brand === brand && forecastDealNeeded(row, window));
    const closed = new Set(opportunities.filter((row) => row.stage === 'won' || row.stage === 'lost').map((row) => row.id));
    return { state: 'ok' as const, value: { opportunities, events: this.stageEvents.filter((row) => row.brand === brand && closed.has(row.opportunityId)) } };
  }
  async listCapacity(brand: 'cedargrowth' | 'bond', window: { start: string; end: string }) { return { state: 'ok' as const, value: readForecastCapacity(this.capacity.filter((row) => row.brand === brand), window) }; }
  async upsertCapacity(brand: 'cedargrowth' | 'bond', _actor: string, input: { month: string; productLine: import('../src/lib/crm/engine.ts').ProductLine; capacityUnits: number; notes: string }) {
    if (!isCapacityMonth(input.month)) return { state: 'rejected' as const };
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
  async findDigestSend(brand: 'cedargrowth' | 'bond', summary: string) {
    const row = [...this.activity].reverse().find((item) => item.brand === brand && item.kind === 'digest_sent' && item.summary === summary);
    return { state: 'ok' as const, value: row ? { createdAt: row.createdAt } : null };
  }
  async recordDigest(brand: 'cedargrowth' | 'bond', actor: string, summary: string) {
    const row = { id: this.id(), publicId: 'test-only:activity', brand, accountId: null, kind: 'digest_sent', summary, actor, createdAt: '2026-11-09T18:00:00Z' };
    this.activity.push(row);
    return { state: 'ok' as const, value: { id: row.id } };
  }
  emailLogs: import('../src/lib/crm/store.ts').EmailLog[] = [];
  failEmailLog = false;
  async insertEmailLog(brand: 'cedargrowth' | 'bond', actor: string, input: { kind: 'digest' | 'reorder_link'; resendId: string; recipient: string; accountId: string | null }) {
    if (this.failEmailLog) return { state: 'rejected' as const };
    if (this.emailLogs.some((row) => row.resendId === input.resendId)) return { state: 'rejected' as const };
    const row = { id: this.id(), brand, kind: input.kind, resendId: input.resendId, recipient: input.recipient, accountId: input.accountId, sentAt: '2026-11-09T18:00:00Z', lastEvent: null, lastEventAt: null, createdBy: actor };
    this.emailLogs.push(row);
    return { state: 'ok' as const, value: row };
  }
  async listEmailLogs(brand: 'cedargrowth' | 'bond', sinceIso: string, accountId?: string | null) {
    return { state: 'ok' as const, value: this.emailLogs.filter((row) => row.brand === brand && row.sentAt >= sinceIso && (!accountId || row.accountId === accountId)) };
  }
  async updateEmailLog(brand: 'cedargrowth' | 'bond', id: string, lastEvent: import('../src/lib/crm/emailStatus.ts').EmailEvent, lastEventAt: string) {
    const row = this.emailLogs.find((item) => item.id === id && item.brand === brand);
    if (!row) return { state: 'missing' as const };
    row.lastEvent = lastEvent;
    row.lastEventAt = lastEventAt;
    return { state: 'ok' as const, value: row };
  }
  territories: { id: string; brand: 'cedargrowth' | 'bond'; region: string; repActor: string }[] = [];
  retailers: { id: string; brand: 'cedargrowth' | 'bond'; licenseNumber: string; name: string; county: string; licenseType: string; uploadedAt: string }[] = [];
  dismissals: { id: string; brand: 'cedargrowth' | 'bond'; repActor: string; actionKey: string; until: string }[] = [];
  async listTerritories(brand: 'cedargrowth' | 'bond') { return { state: 'ok' as const, value: this.territories.filter((row) => row.brand === brand) }; }
  async assignTerritory(brand: 'cedargrowth' | 'bond', region: string, repActor: string) {
    const found = this.territories.find((row) => row.brand === brand && row.region === region);
    if (found) { found.repActor = repActor; return { state: 'ok' as const, value: found }; }
    const row = { id: this.id(), brand, region, repActor };
    this.territories.push(row);
    return { state: 'ok' as const, value: row };
  }
  async clearTerritory(brand: 'cedargrowth' | 'bond', region: string) {
    this.territories = this.territories.filter((row) => !(row.brand === brand && row.region === region));
    return { state: 'ok' as const, value: { cleared: true as const } };
  }
  async listMarketRetailers(brand: 'cedargrowth' | 'bond') { return { state: 'ok' as const, value: this.retailers.filter((row) => row.brand === brand) }; }
  async insertMarketRetailers(brand: 'cedargrowth' | 'bond', rows: { licenseNumber: string; name: string; county: string; licenseType: string }[], uploadedAt: string) {
    for (const row of rows) this.retailers.push({ id: this.id(), brand, ...row, uploadedAt });
    return { state: 'ok' as const, value: { count: rows.length } };
  }
  async listDismissals(brand: 'cedargrowth' | 'bond') { return { state: 'ok' as const, value: this.dismissals.filter((row) => row.brand === brand) }; }
  async upsertDismissal(brand: 'cedargrowth' | 'bond', repActor: string, actionKey: string, until: string) {
    const found = this.dismissals.find((row) => row.brand === brand && row.repActor === repActor && row.actionKey === actionKey);
    if (found) { found.until = until; return { state: 'ok' as const, value: found }; }
    const row = { id: this.id(), brand, repActor, actionKey, until };
    this.dismissals.push(row);
    return { state: 'ok' as const, value: row };
  }
  intakeLogs: { inquiryId: string; receivedAt: string; result: 'created' | 'possible_duplicate'; sourceRoute: '/order' | '/card'; sourceEvent: string | null }[] = [];
  supplierInquiries: { inquiryId: string; businessName: string; contactEmail: string; licenseNumber: string | null; supplyType: string; county: string; message: string | null; sourceRoute: '/card'; sourceEvent: string; status: 'received'; possibleDuplicate: boolean; recordMarker: 'test' | null; receivedAt: string }[] = [];
  intakeDeletions: { id: string; reason: 'named' | 'retention'; contactName: 'bond' }[] = [];
  async receiveBondInquiry(lead: IntakeLead, receivedAt: string) {
    if (this.intakeLogs.some((row) => row.inquiryId === lead.inquiryId)) return { state: 'ok' as const, value: { duplicate: true } };
    const license = lead.licenseNumber?.trim().toLowerCase() || '';
    const name = normalizeBusinessName(lead.businessName);
    const domain = emailDomain(lead.contactEmail);
    let matched = license ? this.accounts.find((row) => row.brand === 'bond' && row.licenseRef && row.licenseRef.trim().toLowerCase() === license) : undefined;
    if (!matched && name && domain) {
      matched = this.accounts.find((row) => row.brand === 'bond' && normalizeBusinessName(row.displayName) === name && this.contacts.some((contact) => contact.brand === 'bond' && contact.accountId === row.id && emailDomain(contact.email || '') === domain));
    }
    const marker = lead.businessName.toLowerCase().includes(INTAKE_TEST_MARKER.toLowerCase()) || (lead.licenseNumber || '').toLowerCase().includes(INTAKE_TEST_MARKER.toLowerCase());
    if (matched) {
      this.notes.push({ id: this.id(), publicId: 'test-only:note', brand: 'bond', accountId: matched.id, body: duplicateNote(lead.message), actor: 'bond-intake', createdAt: receivedAt, sourceInquiryId: lead.inquiryId });
      this.tasks.push({ id: this.id(), publicId: 'test-only:task', brand: 'bond', accountId: matched.id, opportunityId: null, title: 'Possible duplicate', dueOn: null, status: 'open', notes: 'possible duplicate', ownerActor: 'bond-intake', completedAt: null, sourceInquiryId: lead.inquiryId });
      this.activity.push({ id: this.id(), publicId: 'test-only:activity', brand: 'bond', accountId: matched.id, kind: 'inquiry_received', summary: 'Inquiry received', actor: 'bond-intake', createdAt: receivedAt });
      this.intakeLogs.push({ inquiryId: lead.inquiryId, receivedAt, result: 'possible_duplicate', sourceRoute: lead.sourceRoute, sourceEvent: lead.sourceEvent });
      return { state: 'ok' as const, value: { duplicate: false } };
    }
    const accountId = this.id();
    this.accounts.push({ id: accountId, publicId: 'test-only:bond:account', brand: 'bond', displayName: lead.businessName, status: 'prospect', city: lead.city, county: lead.county, notes: '', licenseRef: lead.licenseNumber, facilityRef: null, licenseJurisdiction: null, licenseExpiry: null, assignedRep: null, accountType: null, leadSource: 'bond_inquiry', street: lead.street, state: 'NY', postalCode: lead.postalCode, consentVersion: lead.consentVersion, consentReceivedAt: receivedAt, intakeSubmittedAt: lead.submittedAt, ocmStatus: 'unverified', recordMarker: marker ? 'test' : null, sourceInquiryId: lead.inquiryId, sourceEvent: lead.sourceEvent, distributor: null, distributorAccountRef: null, createdAt: receivedAt, updatedAt: receivedAt, createdBy: 'bond-intake', updatedBy: 'bond-intake' });
    this.contacts.push({ id: this.id(), publicId: 'test-only:contact', brand: 'bond', accountId, name: lead.contactName, title: null, email: lead.contactEmail, phone: lead.contactPhone, notes: '', preference: 'unspecified', createdAt: receivedAt, updatedAt: receivedAt });
    this.opportunities.push({ id: this.id(), publicId: 'test-only:opportunity', brand: 'bond', accountId, name: lead.businessName, stage: 'lead', forecastCents: null, amountKind: 'forecast', invoicedCents: null, paidCents: null, expectedCloseOn: null, notes: '', lossReason: null, nextAction: null, nextActionOn: null, productLine: null, quantityUnits: null, updatedAt: receivedAt, sourceInquiryId: lead.inquiryId });
    if (lead.message) this.notes.push({ id: this.id(), publicId: 'test-only:note', brand: 'bond', accountId, body: intakeMessageText(lead.message), actor: 'bond-intake', createdAt: receivedAt, sourceInquiryId: lead.inquiryId });
    this.activity.push({ id: this.id(), publicId: 'test-only:activity', brand: 'bond', accountId, kind: 'inquiry_received', summary: 'Inquiry received', actor: 'bond-intake', createdAt: receivedAt });
    this.intakeLogs.push({ inquiryId: lead.inquiryId, receivedAt, result: 'created', sourceRoute: lead.sourceRoute, sourceEvent: lead.sourceEvent });
    return { state: 'ok' as const, value: { duplicate: false } };
  }
  async receiveSupplierInquiry(lead: import('../src/lib/crm/supplierIntake.ts').SupplierLead, receivedAt: string) {
    if (this.supplierInquiries.some((row) => row.inquiryId === lead.inquiryId)) return { state: 'ok' as const, value: { duplicate: true } };
    const name = normalizeBusinessName(lead.businessName);
    const possibleDuplicate = this.supplierInquiries.some((row) => row.contactEmail.toLowerCase() === lead.contactEmail.toLowerCase() || (name !== '' && normalizeBusinessName(row.businessName) === name));
    const marker = lead.businessName.toLowerCase().includes(INTAKE_TEST_MARKER.toLowerCase()) || (lead.licenseNumber || '').toLowerCase().includes(INTAKE_TEST_MARKER.toLowerCase());
    this.supplierInquiries.push({ inquiryId: lead.inquiryId, businessName: lead.businessName, contactEmail: lead.contactEmail, licenseNumber: lead.licenseNumber, supplyType: lead.supplyType, county: lead.county, message: lead.message, sourceRoute: '/card', sourceEvent: lead.sourceEvent, status: 'received', possibleDuplicate, recordMarker: marker ? 'test' : null, receivedAt });
    return { state: 'ok' as const, value: { duplicate: false } };
  }
  async deleteBondInquiry(inquiryId: string) {
    const account = this.accounts.find((row) => row.sourceInquiryId === inquiryId && row.brand === 'bond');
    const noteHit = this.notes.some((row) => row.sourceInquiryId === inquiryId);
    const taskHit = this.tasks.some((row) => row.sourceInquiryId === inquiryId);
    const logHit = this.intakeLogs.some((row) => row.inquiryId === inquiryId);
    if (!account && !noteHit && !taskHit && !logHit) return { state: 'ok' as const, value: { deleted: false } };
    const ids = new Set<string>([inquiryId]);
    if (account) {
      for (const row of this.notes) if (row.accountId === account.id && row.sourceInquiryId) ids.add(row.sourceInquiryId);
      for (const row of this.tasks) if (row.accountId === account.id && row.sourceInquiryId) ids.add(row.sourceInquiryId);
      this.activity = this.activity.filter((row) => row.accountId !== account.id);
      this.notes = this.notes.filter((row) => row.accountId !== account.id);
      this.tasks = this.tasks.filter((row) => row.accountId !== account.id);
      this.opportunities = this.opportunities.filter((row) => row.accountId !== account.id);
      this.contacts = this.contacts.filter((row) => row.accountId !== account.id);
      this.accounts = this.accounts.filter((row) => row.id !== account.id);
    } else {
      this.tasks = this.tasks.filter((row) => row.sourceInquiryId !== inquiryId);
      this.notes = this.notes.filter((row) => row.sourceInquiryId !== inquiryId);
    }
    for (const id of ids) {
      if (!this.intakeLogs.some((row) => row.inquiryId === id) && id !== inquiryId) continue;
      this.intakeLogs = this.intakeLogs.filter((row) => row.inquiryId !== id);
      this.intakeDeletions.push({ id: this.id(), reason: 'named', contactName: 'bond' });
    }
    return { state: 'ok' as const, value: { deleted: true } };
  }
  async purgeBondInquiries(nowIso: string) {
    const due = this.accounts.filter((account) => account.brand === 'bond' && account.leadSource === 'bond_inquiry' && account.ocmStatus === 'unverified' && account.sourceInquiryId && this.opportunities.some((row) => row.sourceInquiryId === account.sourceInquiryId && row.stage === 'lead') && this.intakeLogs.some((row) => row.inquiryId === account.sourceInquiryId && intakeExpired(row.receivedAt, nowIso)));
    let purged = 0;
    for (const account of due) {
      const ids = new Set<string>([account.sourceInquiryId || '']);
      for (const row of this.notes) if (row.accountId === account.id && row.sourceInquiryId) ids.add(row.sourceInquiryId);
      for (const row of this.tasks) if (row.accountId === account.id && row.sourceInquiryId) ids.add(row.sourceInquiryId);
      this.activity = this.activity.filter((row) => row.accountId !== account.id);
      this.notes = this.notes.filter((row) => row.accountId !== account.id);
      this.tasks = this.tasks.filter((row) => row.accountId !== account.id);
      this.opportunities = this.opportunities.filter((row) => row.accountId !== account.id);
      this.contacts = this.contacts.filter((row) => row.accountId !== account.id);
      this.accounts = this.accounts.filter((row) => row.id !== account.id);
      for (const id of ids) {
        this.intakeLogs = this.intakeLogs.filter((row) => row.inquiryId !== id);
        this.intakeDeletions.push({ id: this.id(), reason: 'retention', contactName: 'bond' });
      }
      purged += 1;
    }
    return { state: 'ok' as const, value: { purged } };
  }
  agentRequests: { requestId: string; receivedAtMs: number }[] = [];
  async receiveAgentRecords(input: { requestId: string; receivedAt: string; ops: import('../src/lib/crm/agentIntake.ts').AgentOp[] }) {
    const receivedAtMs = Date.parse(input.receivedAt);
    const result = applyAgentOps({
      requestId: input.requestId,
      receivedAtMs,
      requests: this.agentRequests,
      accounts: this.accounts.map((row) => ({ id: row.id, brand: row.brand, displayName: row.displayName, licenseRef: row.licenseRef })),
      contacts: this.contacts.map((row) => ({ accountId: row.accountId, email: row.email })),
      ops: input.ops,
      nextId: () => this.id(),
    });
    if (result.code === 'replay') return { state: 'ok' as const, value: { code: 'replay' as const } };
    if (result.code === 'rate') return { state: 'ok' as const, value: { code: 'rate' as const, retryAfter: result.retryAfter } };
    this.agentRequests.push({ requestId: input.requestId, receivedAtMs });
    for (const account of result.accounts) {
      this.accounts.push({ id: account.id, publicId: 'test-only:agent:account', brand: 'cedargrowth', displayName: account.displayName, status: account.status, city: account.city, county: account.county, notes: account.notes, licenseRef: account.licenseRef, facilityRef: null, licenseJurisdiction: null, licenseExpiry: account.licenseExpiry, assignedRep: account.assignedRep, accountType: account.accountType, leadSource: account.leadSource, street: account.street, postalCode: account.postalCode, ocmStatus: account.ocmStatus, distributor: null, distributorAccountRef: null, createdAt: input.receivedAt, updatedAt: input.receivedAt, createdBy: 'CODEX agent', updatedBy: 'CODEX agent', state: 'NY', sourceRequestId: input.requestId });
    }
    for (const contact of result.contacts) {
      this.contacts.push({ id: contact.id, publicId: 'test-only:agent:contact', brand: 'cedargrowth', accountId: contact.accountId, name: contact.name, title: contact.title, email: contact.email, phone: contact.phone, notes: '', preference: 'unspecified', createdAt: input.receivedAt, updatedAt: input.receivedAt, sourceRequestId: input.requestId });
    }
    for (const note of result.notes) {
      this.notes.push({ id: note.id, publicId: 'test-only:agent:note', brand: 'cedargrowth', accountId: note.accountId, body: note.body, actor: 'CODEX agent', createdAt: input.receivedAt, sourceRequestId: input.requestId });
    }
    for (const row of result.activity) {
      this.activity.push({ id: row.id, publicId: 'test-only:agent:activity', brand: 'cedargrowth', accountId: row.accountId, kind: row.kind, summary: row.summary, actor: 'CODEX agent', createdAt: input.receivedAt, sourceRequestId: input.requestId });
    }
    return { state: 'ok' as const, value: { code: 'ok' as const, created: result.created, skipped: result.skipped, failed: result.failed } };
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
const tooManyNow = await handleImport({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/import', { brand: 'cedargrowth', kind: 'accounts', commit: false, rows: Array.from({ length: 51 }, (_, i) => ({ line: i + 2, record: { displayName: `y${i}` } })) }), store: memory });
assert(tooManyNow.status === 413, 'import rejects more than 50 rows');
const fileRows = (count: number) => Array.from({ length: count }, (_, index) => ({ line: index + 2, record: { displayName: `Shop ${index}` } }));
const limitReason = `Send at most ${IMPORT_BATCH} rows at a time.`;
const checked = (list: { line: number; record?: { displayName: string } }[], step: number) => {
  const results: { line: number; status: 'ready' | 'error'; reason?: string }[] = [];
  for (const batch of chunkImportRows(list, step)) {
    if (batch.length > IMPORT_BATCH) results.push(...mergeBatchOutcomes(batch, null, limitReason));
    else results.push(...mergeBatchOutcomes(batch, batch.map((row) => ({ line: row.line, status: 'ready' as const }))));
  }
  return results.sort((a, b) => a.line - b.line);
};
const wide = fileRows(1316);
const wideOld = checked(wide, 100);
const wideFixed = checked(wide, IMPORT_BATCH);
assert(wideOld.filter((row) => row.reason === limitReason).length === 1300 && wideOld.filter((row) => row.status === 'ready').length === 16, 'a 100 row step rejects 1300 rows of a 1316 row file and keeps the last 16');
assert(wideFixed.length === 1316 && wideFixed.every((row) => row.status === 'ready') && wideFixed[0].line === 2 && wideFixed[1315].line === 1317 && new Set(wideFixed.map((row) => row.line)).size === 1316 && chunkImportRows(wide).every((batch) => batch.length <= IMPORT_BATCH) && chunkImportRows(wide).length === 27, '1316 rows are checked in batches of at most 50 and each line comes back once');
assert(chunkImportRows(fileRows(50)).length === 1 && chunkImportRows(fileRows(50))[0].length === 50 && chunkImportRows(fileRows(51)).map((batch) => batch.length).join(',') === '50,1' && chunkImportRows([]).length === 0, 'an exact batch, a 51st row, and an empty file chunk without going over 50');
const emptyMapped = mapRows('accounts', parseCsv(''));
const headerOnly = mapRows('accounts', parseCsv('Account name\n'));
const overMax = mapRows('accounts', parseCsv(`Account name\n${Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, index) => `Shop ${index}`).join('\n')}`));
assert(emptyMapped.rows.length === 0 && emptyMapped.truncated === false && headerOnly.rows.length === 0 && headerOnly.truncated === false && overMax.truncated === true && overMax.rowCount === IMPORT_MAX_ROWS + 1 && overMax.rows.length === IMPORT_MAX_ROWS, 'an empty file stays empty and a file past 2000 rows is reported instead of being cut quietly');
const chainCsv = parseCsv('Name,City,Region,License,License Type,Address,ZIP,County,Operating\nChain Store TEST ONLY,Albany,Capital Region,LIC-CHAIN-1,Adult-Use Retail Dispensary License,1 Main St,12207,Albany,Active\nChain Store TEST ONLY,Troy,Capital Region,LIC-CHAIN-2,Adult-Use Conditional Retail Dispensary License,2 River St,12180,Rensselaer,Non-Operational\n');
const chainRows = mapRows('accounts', chainCsv).rows;
assert(chainRows[0].record?.accountType === 'adult_use_dispensary' && chainRows[0].record?.county === 'Albany' && String(chainRows[0].record?.notes).includes('Address: 1 Main St 12207') && String(chainRows[0].record?.notes).includes('County: Albany') && String(chainRows[0].record?.notes).includes('Region: Capital Region') && String(chainRows[1].record?.notes).includes('Operating: Non-Operational'), 'state license export maps license type, county, and labeled notes');
const chainImport = await handleImport({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/import', { brand: 'cedargrowth', kind: 'accounts', commit: true, rows: chainRows }), store: memory });
assert((chainImport.body.outcomes as { status: string }[]).every((row) => row.status === 'created') && memory.accounts.filter((row) => row.displayName === 'Chain Store TEST ONLY').length === 2, 'two locations with the same name import when their license numbers differ');
const chainAgain = await handleImport({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/import', { brand: 'cedargrowth', kind: 'accounts', commit: false, rows: chainRows }), store: memory });
assert((chainAgain.body.outcomes as { status: string }[]).every((row) => row.status === 'skipped'), 're-importing the same license numbers skips them');
const caseLicense = mapRows('accounts', parseCsv('Account name,License number\nTEST ONLY Case Copy, lic-chain-1 \nTEST ONLY Case Twin,LIC-CHAIN-1\n')).rows;
const caseImport = await handleImport({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/import', { brand: 'cedargrowth', kind: 'accounts', commit: true, rows: caseLicense }), store: memory });
const caseOutcomes = caseImport.body.outcomes as { status: string; reason?: string }[];
assert(caseOutcomes[0].status === 'skipped' && caseOutcomes[1].status === 'skipped' && String(caseOutcomes[0].reason).includes('license') && memory.accounts.filter((row) => (row.licenseRef || '').trim().toLowerCase() === 'lic-chain-1').length === 1, 'a license match ignores case and spaces');
const freshDup = mapRows('accounts', parseCsv('Account name,License number\nTEST ONLY Fresh,LIC-FRESH-1\nTEST ONLY Fresh Two, lic-fresh-1 \n')).rows;
const freshImport = await handleImport({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/import', { brand: 'cedargrowth', kind: 'accounts', commit: true, rows: freshDup }), store: memory });
const freshOutcomes = freshImport.body.outcomes as { status: string }[];
assert(freshOutcomes[0].status === 'created' && freshOutcomes[1].status === 'skipped' && memory.accounts.filter((row) => (row.licenseRef || '').trim().toLowerCase() === 'lic-fresh-1').length === 1, 'a repeated license in one upload is stored once');
const repeatedFile = skipRepeatedImportRows('accounts', caseLicense);
assert(repeatedFile.send.length === 1 && repeatedFile.skipped.length === 1 && repeatedFile.skipped[0].reason.includes('license'), 'one upload keeps the first license and skips the repeat before posting');
const sameNameNewLicense = mapRows('accounts', parseCsv('Account name,License number\nTEST ONLY synthetic account,LIC-NEW\n')).rows;
const sameNameImport = await handleImport({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/import', { brand: 'cedargrowth', kind: 'accounts', commit: true, rows: sameNameNewLicense }), store: memory });
assert((sameNameImport.body.outcomes as { status: string }[])[0].status === 'created', 'a different license imports even when the account name already exists');
const badCountyRows = mapRows('accounts', parseCsv('Account name,County\nUnknown County Shop,Brooklyn\n')).rows;
const beforeBadCounty = memory.accounts.length;
const badCountyImport = await handleImport({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/import', { brand: 'cedargrowth', kind: 'accounts', commit: true, rows: badCountyRows }), store: memory });
assert(!!badCountyRows[0].error && badCountyRows[0].error.includes('New York') && (badCountyImport.body.outcomes as { status: string }[])[0].status === 'error' && memory.accounts.length === beforeBadCounty, 'an unknown county is rejected and not stored');
const contactRows = mapRows('contacts', parseCsv('Name,Email,Phone,Title,Account Name,Account License\nTEST ONLY Buyer,Buyer@Example.com,555-0100,Buyer,Chain Store TEST ONLY,LIC-CHAIN-2\nTEST ONLY Ambiguous,,,,Chain Store TEST ONLY,\nTEST ONLY Orphan,,,,,\n')).rows;
assert(!!contactRows[2].error, 'a contact with no account is reported, not guessed');
const contactImport = await handleImport({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/import', { brand: 'cedargrowth', kind: 'contacts', commit: true, rows: contactRows }), store: memory });
const contactOutcomes = contactImport.body.outcomes as { status: string; reason?: string }[];
assert(contactOutcomes[0].status === 'created' && contactOutcomes[1].status === 'error' && String(contactOutcomes[1].reason).includes('More than one account'), 'contacts match by license and an ambiguous chain name is reported');
const savedContact = (await memory.exportBrand('cedargrowth')).value.contacts.find((row) => row.name === 'TEST ONLY Buyer');
assert(savedContact?.email === 'buyer@example.com' && savedContact?.preference === 'unspecified', 'imported contacts keep an unspecified contact preference');
const contactAgain = await handleImport({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/import', { brand: 'cedargrowth', kind: 'contacts', commit: false, rows: contactRows.slice(0, 1) }), store: memory });
assert((contactAgain.body.outcomes as { status: string }[])[0].status === 'skipped', 're-importing a contact skips it');
const sameEmail = mapRows('contacts', parseCsv('Contact name,Email,Account license\nTEST ONLY Other Buyer,BUYER@example.com,LIC-CHAIN-2\n')).rows;
const beforeSameEmail = memory.contacts.length;
const sameEmailImport = await handleImport({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/import', { brand: 'cedargrowth', kind: 'contacts', commit: true, rows: sameEmail }), store: memory });
assert((sameEmailImport.body.outcomes as { status: string; reason?: string }[])[0].status === 'skipped' && String((sameEmailImport.body.outcomes as { reason?: string }[])[0].reason).includes('email') && memory.contacts.length === beforeSameEmail, 'a contact email already on the account is skipped');
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
assert(vapeCell?.demand === 60 && vapeCell.status === 'short' && vapeCell.gap === -20 && gummyCell?.status === 'no_capacity' && gummyCell.capacityUnits === null && gummyCell.gap === null && grid.notForecastable === 1, 'demand math for open and won, and missing capacity is not zero');
const operatorError = { code: '42883', message: 'operator does not exist: date ~~ unknown' };
assert(crmStorageDetail(operatorError) === 'read_failed' && isMissingSchema(operatorError) === false, '42883 is a failed read, not a missing schema');
for (const code of ['42P01', '42703', 'PGRST205']) {
  const schemaError = { code, message: 'relation does not exist' };
  assert(crmStorageDetail(schemaError) === 'schema_absent' && isMissingSchema(schemaError) === true, `${code} stays schema absent`);
}
assert(crmStorageDetail({ message: 'column does not exist' }) === 'read_failed', 'schema absence is decided by the error code, not the message');
await assertForecastPeriods(assert);
await assertForecastReads(assert);
const salesCap = await handleCapacity({ actorId: 'sales-1', grants: salesGrant, request: crmReq('PUT', '/api/admin/crm/capacity', { brand: 'cedargrowth', month: '2026-12', productLine: 'vape', capacityUnits: 10 }), store: memory });
assert(salesCap.status === 403, 'a salesperson cannot edit capacity');
const midMonth = await memory.upsertCapacity('cedargrowth', 'gary@cedargrowthco.com', { month: '2026-01-15', productLine: 'vape', capacityUnits: 999, notes: '' });
assert(midMonth.state === 'rejected' && memory.capacity.every((row) => row.month !== '2026-01-15'), 'capacity storage rejects a mid-month date');
const bondCap = await handleCapacity({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('PUT', '/api/admin/crm/capacity', { brand: 'bond', month: '2026-12', productLine: 'gummy', capacityUnits: 80 }), store: memory });
const cedarForecast = await handleForecast({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('GET', '/api/admin/crm/forecast?brand=cedargrowth&months=2'), store: memory });
const cedarCells = (cedarForecast.body.cells as { productLine: string; capacityUnits: number | null }[]) || [];
const legacyKeys = Object.keys(cedarForecast.body);
const legacyCellKeys = Object.keys((cedarCells[0] || {}) as object);
assert(bondCap.status === 200 && cedarForecast.status === 200 && cedarForecast.body.months === 2 && cedarCells.length === 8 && cedarCells.filter((cell) => cell.productLine === 'gummy').every((cell) => cell.capacityUnits === null), 'capacity stays in its brand');
assert(JSON.stringify(legacyKeys) === JSON.stringify(['ok', 'configured', 'brand', 'months', 'rates', 'cells', 'notForecastable', 'shorts']) && JSON.stringify(legacyCellKeys) === JSON.stringify(['month', 'productLine', 'demand', 'capacityUnits', 'gap', 'status']) && cedarForecast.body.period === undefined && cedarForecast.body.from === undefined && cedarForecast.body.productLine === undefined, 'a brand and months request keeps the original forecast body');
const badPeriod = await handleForecast({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('GET', '/api/admin/crm/forecast?brand=cedargrowth&period=year'), store: memory });
const badLine = await handleForecast({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('GET', '/api/admin/crm/forecast?brand=cedargrowth&productLine=flower'), store: memory });
const badMonths = await handleForecast({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('GET', '/api/admin/crm/forecast?brand=cedargrowth&months=25'), store: memory });
const badMonthsFloat = await handleForecast({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('GET', '/api/admin/crm/forecast?brand=cedargrowth&months=1.5'), store: memory });
const badMonthsText = await handleForecast({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('GET', '/api/admin/crm/forecast?brand=cedargrowth&months=abc'), store: memory });
const badMonthsZero = await handleForecast({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('GET', '/api/admin/crm/forecast?brand=cedargrowth&months=0'), store: memory });
const badWeeks = await handleForecast({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('GET', '/api/admin/crm/forecast?brand=cedargrowth&period=week&weeks=54'), store: memory });
const badFrom = await handleForecast({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('GET', '/api/admin/crm/forecast?brand=cedargrowth&from=2026-11-15'), store: memory });
assert(badPeriod.status === 400 && badLine.status === 400 && badMonths.status === 400 && badMonthsFloat.status === 400 && badMonthsText.status === 400 && badMonthsZero.status === 400 && badWeeks.status === 400 && badFrom.status === 400, 'the forecast route rejects an unknown period, product line, from date, or out-of-range count');
const weeklyRoute = await handleForecast({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('GET', '/api/admin/crm/forecast?brand=cedargrowth&period=week&weeks=13&productLine=vape&months=2'), store: memory });
const weeklyCells = (weeklyRoute.body.cells as { productLine: string; isoWeek: string; weekStart: string; gap: number | null; capacitySource?: string | null; month?: string }[]) || [];
const yearRoute = await handleForecast({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('GET', '/api/admin/crm/forecast?brand=cedargrowth&months=12&productLine=preroll&from=2026-08-01'), store: memory });
const yearCells = (yearRoute.body.cells as { productLine: string; month?: string; isoWeek?: string; capacitySource?: string | null }[]) || [];
assert(weeklyRoute.status === 200 && weeklyRoute.body.period === 'week' && weeklyRoute.body.weeks === 13 && weeklyRoute.body.months === undefined && weeklyRoute.body.from === undefined && weeklyRoute.body.productLine === 'vape' && weeklyCells.length === 13 && weeklyCells.every((cell) => cell.productLine === 'vape' && /^\d{4}-W\d{2}$/.test(cell.isoWeek) && /^\d{4}-\d{2}-\d{2}$/.test(cell.weekStart) && Object.prototype.hasOwnProperty.call(cell, 'gap') && Object.prototype.hasOwnProperty.call(cell, 'capacitySource') && cell.month === undefined), 'weekly forecast returns one product line of ISO weeks');
assert(yearRoute.status === 200 && yearRoute.body.period === 'month' && yearRoute.body.months === 12 && yearRoute.body.from === '2026-08-01' && yearCells.length === 12 && yearCells[0]?.month === '2026-08-01' && yearCells.every((cell) => cell.productLine === 'preroll' && typeof cell.month === 'string' && cell.isoWeek === undefined && Object.prototype.hasOwnProperty.call(cell, 'capacitySource')), 'a paged year starts at from and echoes it');
const savedHistory = await handleCapacity({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('PUT', '/api/admin/crm/capacity', { brand: 'cedargrowth', month: '2020-01', productLine: 'vape', capacityUnits: 40 }), store: memory });
const legacyAfter = await handleForecast({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('GET', '/api/admin/crm/forecast?brand=cedargrowth&months=1'), store: memory });
const carriedAfter = await handleForecast({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('GET', '/api/admin/crm/forecast?brand=cedargrowth&period=month&months=1&productLine=vape'), store: memory });
const legacyVape = ((legacyAfter.body.cells as { productLine: string; capacityUnits: number | null }[]) || []).find((cell) => cell.productLine === 'vape');
const carriedVape = ((carriedAfter.body.cells as { capacityUnits: number | null; capacitySource?: string | null }[]) || [])[0];
assert(savedHistory.status === 200 && legacyVape?.capacityUnits === null && !('capacitySource' in (legacyVape || {})) && carriedVape?.capacityUnits === 40 && carriedVape.capacitySource === 'extended', 'legacy leaves an earlier capacity null, and period=month carries it forward');
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
const sundayNight = Date.parse('2026-11-09T04:30:00.000Z');
const mondayMorning = Date.parse('2026-11-09T05:30:00.000Z');
assert(nyWeek(sundayNight).key === '2026-11-02' && nyWeek(mondayMorning).key === '2026-11-09', 'week boundary is Monday in New York');
const digestAccounts = [
  { brand: 'cedargrowth' as const, id: '00000000-0000-4000-8000-0000000000aa', status: 'active', city: 'Buffalo', assignedRep: 'Ada', createdAt: '2026-11-10T15:00:00.000Z' },
  { brand: 'bond' as const, id: '00000000-0000-4000-8000-0000000000bb', status: 'active', city: 'Albany', assignedRep: 'BOND ONLY SHOP', createdAt: '2026-11-10T15:00:00.000Z' },
];
const digestDeals = [
  { brand: 'cedargrowth' as const, id: 'd1', accountId: digestAccounts[0].id, stage: 'won' as const, forecastCents: 5000, expectedCloseOn: '2026-11-20' },
  { brand: 'cedargrowth' as const, id: 'd2', accountId: digestAccounts[0].id, stage: 'proposal' as const, forecastCents: 2500, expectedCloseOn: '2026-11-01' },
  { brand: 'bond' as const, id: 'd3', accountId: digestAccounts[1].id, stage: 'won' as const, forecastCents: 999999, expectedCloseOn: '2026-11-20' },
];
const digestTasks = [{ brand: 'cedargrowth' as const, status: 'open', dueOn: '2026-11-01', ownerActor: 'Ada', title: 'Follow up on samples at Ada Shop' }];
const digestNow = Date.parse('2026-11-11T15:00:00.000Z');
const digestDash = buildDashboard({ brand: 'cedargrowth', today: '2026-11-11', filter: { year: null, month: null, rep: null, region: null, accountType: null, leadSource: null, stage: null, status: null }, accounts: digestAccounts, opportunities: digestDeals, tasks: digestTasks, activity: [] });
const digest = buildDigest({
  brand: 'cedargrowth',
  nowMs: digestNow,
  accounts: digestAccounts,
  opportunities: digestDeals,
  tasks: digestTasks,
  events: [{ id: 'e1', brand: 'cedargrowth', opportunityId: 'd1', fromStage: 'proposal', toStage: 'won', at: '2026-11-10T18:00:00.000Z' }],
  contacts: [{ brand: 'cedargrowth', name: 'Quiet Person', email: 'quiet@example.com', phone: '555-0199', preference: 'do_not_contact' }],
  shorts: ['Vape is short by 1,200 units in Mar 27'],
});
const digestText = renderDigestText(digest);
const digestHtml = renderDigestHtml(digest);
assert(digest.winRate === digestDash.kpis.winRate && digest.openPipelineCents === (digestDash.byStatus.find((row) => row.key === 'open')?.cents ?? null), 'digest numbers match the dashboard builder for the same rows');
assert(!digestText.includes('BOND ONLY SHOP') && !digestText.includes('999999') && !digestText.includes('quiet@example.com') && !digestText.includes('555-0199') && !digestText.includes('Quiet Person'), 'Bond data and contact details never appear in a CedarGrowth digest');
assert(digest.shorts[0] === 'Vape is short by 1,200 units in Mar 27' && digestText.includes('Hoodie not connected') && digestText.includes('Not active yet') && hoodieSignals().length === 0, 'forecast words are copied and Hoodie stays unconnected');
assert(NY_COUNTIES.length === 62 && new Set(NY_COUNTIES.map((county) => COUNTY_REGION[county])).size === 10 && NY_REGIONS.every((region) => Object.values(COUNTY_REGION).includes(region)), 'every county maps to exactly one of the 10 regions');
assert(!parseCounty('Brooklyn').ok && regionForCounty(null) === 'Region unknown' && regionForCounty('Erie') === 'Western New York', 'an unknown county is reported and not guessed');
const blankCoverage = coverageLabel({ region: 'Western New York', accounts: [], retailers: [] });
const zeroDenom = coverageLabel({ region: 'Western New York', accounts: [{ brand: 'cedargrowth', id: 'a', displayName: 'Shop', status: 'active', county: 'Erie', assignedRep: 'Ada' }], retailers: [{ county: 'Erie', licenseType: 'Adult-Use Cultivator', uploadedAt: '2026-11-01T00:00:00Z' }] });
const oneCoverage = coverageLabel({ region: 'Western New York', accounts: [{ brand: 'cedargrowth', id: 'a', displayName: 'Shop', status: 'active', county: 'Erie', assignedRep: 'Ada' }], retailers: [{ county: 'Erie', licenseType: 'Adult-Use Retail Dispensary', uploadedAt: '2026-11-01T00:00:00Z' }] });
assert(blankCoverage === COVERAGE_UPLOAD && zeroDenom === 'no data yet' && oneCoverage === '1 / 1' && NEEDS_HOODIE === 'Needs Hoodie', 'coverage asks for the state list and never divides by zero');
const actionToday = '2026-11-09';
const actionAccount = { id: 'acct', brand: 'cedargrowth', displayName: 'Shop', status: 'active', county: 'Erie', assignedRep: 'Ada', licenseExpiry: '2026-11-20' };
const bondAccount = { ...actionAccount, id: 'bond-acct', brand: 'bond', displayName: 'Bond Shop' };
const emptyActions = { brand: 'cedargrowth', rep: 'Ada', today: actionToday, accounts: [actionAccount, bondAccount], tasks: [], deals: [], notes: [] as { brand: string; accountId: string; createdAt: string }[], visits: [] as { brand: string; accountId: string; checkedInAt: string }[], events: [] as { brand: string; opportunityId: string; at: string }[], orders: [] as { brand: string; accountId: string | null; distributor: string; orderStatus: string; deliveredOn: string | null; orderedOn: string | null; retailerPaymentStatus: string }[], territories: [{ brand: 'cedargrowth', region: 'Western New York', repActor: 'Ada' }], dismissals: [] as { brand: string; repActor: string; actionKey: string; until: string }[] };
const overdue = nextBestActions({ ...emptyActions, tasks: [{ id: 't1', brand: 'cedargrowth', accountId: 'acct', title: 'Call', status: 'open', dueOn: '2026-11-01', ownerActor: 'Ada' }, { id: 'tb', brand: 'bond', accountId: 'bond-acct', title: 'Bond task', status: 'open', dueOn: '2026-11-01', ownerActor: 'Ada' }] });
const sample = nextBestActions({ ...emptyActions, tasks: [{ id: 't2', brand: 'cedargrowth', accountId: 'acct', title: 'Follow up on samples at Shop', status: 'open', dueOn: '2026-11-09', ownerActor: 'Ada' }] });
const lateDeal = nextBestActions({ ...emptyActions, deals: [{ id: 'd', brand: 'cedargrowth', accountId: 'acct', name: 'Late', stage: 'proposal', expectedCloseOn: '2026-11-01' }] });
const quietDeal = nextBestActions({ ...emptyActions, deals: [{ id: 'd', brand: 'cedargrowth', accountId: 'acct', name: 'Quiet', stage: 'proposal', expectedCloseOn: '2026-12-01' }] });
const quietMissing = nextBestActions({ ...emptyActions, notes: null, visits: null, events: null, deals: [{ id: 'd', brand: 'cedargrowth', accountId: 'acct', name: 'Quiet', stage: 'proposal', expectedCloseOn: '2026-12-01' }] });
const notVisited = nextBestActions({ ...emptyActions, visits: [] });
const reorder = nextBestActions({ ...emptyActions, visits: [{ brand: 'cedargrowth', accountId: 'acct', checkedInAt: '2026-11-08T00:00:00Z' }], orders: [
  { brand: 'cedargrowth', accountId: 'acct', distributor: 'nabis', orderStatus: 'delivered', deliveredOn: '2026-08-01', orderedOn: '2026-08-01', retailerPaymentStatus: 'paid' },
  { brand: 'cedargrowth', accountId: 'acct', distributor: 'nabis', orderStatus: 'delivered', deliveredOn: '2026-09-01', orderedOn: '2026-09-01', retailerPaymentStatus: 'paid' },
  { brand: 'cedargrowth', accountId: 'acct', distributor: 'nabis', orderStatus: 'delivered', deliveredOn: '2026-10-01', orderedOn: '2026-10-01', retailerPaymentStatus: 'paid' },
] });
const unpaid = nextBestActions({ ...emptyActions, orders: [{ brand: 'cedargrowth', accountId: 'acct', distributor: 'nabis', orderStatus: 'delivered', deliveredOn: '2026-08-01', orderedOn: '2026-08-01', retailerPaymentStatus: 'unpaid' }] });
const prospect = nextBestActions({ ...emptyActions, accounts: [{ ...actionAccount, status: 'prospect' }] });
const snoozed = nextBestActions({ ...emptyActions, tasks: [{ id: 't1', brand: 'cedargrowth', accountId: 'acct', title: 'Call', status: 'open', dueOn: '2026-11-01', ownerActor: 'Ada' }], dismissals: [{ brand: 'cedargrowth', repActor: 'Ada', actionKey: '1:t1', until: '2026-11-16' }] });
assert(overdue.actions.some((row) => row.rule === 1) && !overdue.actions.some((row) => row.reason.includes('Bond')) && sample.actions.some((row) => row.rule === 2) && lateDeal.actions.some((row) => row.rule === 3) && quietDeal.actions.some((row) => row.rule === 4) && quietMissing.actions.every((row) => row.rule !== 4) && quietMissing.inactive.some((row) => row.reason.includes('not connected')), 'overdue, sample, late, and quiet rules fire only with their data');
assert(notVisited.actions.some((row) => row.key.startsWith('5:visit')) && reorder.actions.some((row) => row.key.startsWith('5:reorder')) && unpaid.actions.some((row) => row.reason.startsWith('Mention to Nabis rep')) && !unpaid.actions.some((row) => row.reason.toLowerCase().includes('collect payment')) && nextBestActions(emptyActions).actions.some((row) => row.rule === 8) && prospect.actions.some((row) => row.rule === 9), 'visit, reorder, Nabis wording, license, and prospect rules fire on a minimal case');
assert(snoozed.actions.every((row) => row.key !== '1:t1') && overdue.inactive.some((row) => row.reason === 'Hoodie not connected.') && nextBestActions({ ...emptyActions, orders: null, visits: null }).inactive.some((row) => row.reason.includes('not connected')), 'a snoozed action stays hidden and a missing source is not active');
const salesTerritory = await handleTerritoryAssign({ actorId: 'sales-1', grants: salesGrant, request: crmReq('PUT', '/api/admin/crm/territory', { brand: 'cedargrowth', region: 'Western New York', repActor: 'Ada' }), store: memory });
const bondTerritory = await handleTerritoryAssign({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('PUT', '/api/admin/crm/territory', { brand: 'bond', region: 'Long Island', repActor: 'Bond Rep' }), store: memory });
assert(salesTerritory.status === 403 && bondTerritory.status === 200 && memory.territories.every((row) => row.brand === 'bond' || row.region !== 'Long Island'), 'a salesperson cannot assign a territory and Bond stays in its brand');
const reorderHtml = reorderLinkHtml('Shop', 'https://cedargrowth.example/reorder/token');
assert(digestHtml.includes('Georgia') && !digestHtml.includes('<img') && !reorderHtml.includes('<img') && !digestHtml.includes('pixel') && !reorderHtml.includes('pixel') && !digestHtml.includes('—') && !digestHtml.includes('–'), 'the digest email is plain html without images or dashes');
assert(emailStatusLabel('delivered') === 'Delivered' && emailStatusLabel('opened') === 'Opened (approximate)' && emailStatusLabel('clicked') === 'Opened (approximate)' && emailStatusLabel('bounced') === 'Bounced' && emailStatusLabel(null) === 'Not yet reported' && emailStatusLabel('sent') === 'Not yet reported', 'status labels stay plain and an open is approximate');
const digestBefore = memory.activity.filter((row) => row.kind === 'digest_sent').length;
const salesDigest = await handleDigestSend({ actorId: 'sales-1', grants: salesGrant, request: crmReq('POST', '/api/admin/crm/digest/send', { brand: 'cedargrowth' }), store: memory });
const missingSecret = await handleDigestSend({ actorId: null, grants: [], request: crmReq('POST', '/api/admin/crm/digest/send', { brand: 'cedargrowth' }, { 'x-crm-digest-secret': 'wrong-secret' }), store: memory });
const unconfigured = await handleDigestSend({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/digest/send', { brand: 'cedargrowth' }), store: memory });
assert(salesDigest.status === 403 && missingSecret.status === 401 && unconfigured.status === 200 && unconfigured.body.sent === false && unconfigured.body.reason === 'Email is not configured.' && memory.activity.filter((row) => row.kind === 'digest_sent').length === digestBefore, 'a salesperson cannot send, a bad secret is rejected, and missing configuration sends nothing');
const savedDigestEnv = {
  key: process.env.RESEND_API_KEY,
  to: process.env.CRM_DIGEST_TO,
  from: process.env.CRM_DIGEST_FROM,
  secret: process.env.CRM_DIGEST_SECRET,
};
process.env.RESEND_API_KEY = 'test-digest-key';
process.env.CRM_DIGEST_TO = 'desk@example.com';
process.env.CRM_DIGEST_FROM = 'digest@example.com';
process.env.CRM_DIGEST_SECRET = 'digest-secret-value';
let digestSends = 0;
useDigestDelivery(async (data) => {
  digestSends += 1;
  return { sent: true, messages: data.to.map((recipient) => ({ recipient, id: `re_digest_${digestSends}_${recipient}` })) };
});
const logsBefore = memory.emailLogs.length;
const firstDigest = await handleDigestSend({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/digest/send', { brand: 'cedargrowth' }), store: memory });
const loggedOnce = memory.emailLogs.filter((row) => row.kind === 'digest' && row.brand === 'cedargrowth').length;
const secondDigest = await handleDigestSend({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/digest/send', { brand: 'cedargrowth' }), store: memory });
const adminForce = await handleDigestSend({ actorId: 'admin@example.com', grants: [{ brand: 'cedargrowth', role: 'administrator' }], request: crmReq('POST', '/api/admin/crm/digest/send', { brand: 'cedargrowth', force: true }), store: memory });
const ownerForce = await handleDigestSend({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/digest/send', { brand: 'cedargrowth', force: true }), store: memory });
const preview = await handleDigestPreview({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('GET', '/api/admin/crm/digest/preview?brand=cedargrowth'), store: memory });
assert(firstDigest.status === 200 && firstDigest.body.sent === true && firstDigest.body.logFailed !== true && loggedOnce === logsBefore + 1 && secondDigest.status === 409 && adminForce.status === 403 && ownerForce.status === 200 && preview.status === 200 && typeof preview.body.html === 'string' && memory.activity.filter((row) => row.kind === 'digest_sent').length === digestBefore + 2, 'a second send in the same week is refused without force');
memory.failEmailLog = true;
const failedLog = await handleDigestSend({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/digest/send', { brand: 'cedargrowth', force: true }), store: memory });
assert(failedLog.status === 200 && failedLog.body.sent === true && failedLog.body.logFailed === true && failedLog.body.reason === 'The email was sent. The status log was not saved.' && memory.emailLogs.filter((row) => row.kind === 'digest').length === loggedOnce + 1, 'a log write failure is reported');
memory.failEmailLog = false;
useReorderDelivery(async () => ({ sent: true, id: 're_link_once' }));
const mailedLink = await handleReorderLinks({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/reorder-links', { brand: 'cedargrowth', accountId: activeId, email: 'buyer@example.com' }), store: memory }, 'POST');
assert(mailedLink.status === 201 && mailedLink.body.emailed === true && memory.emailLogs.filter((row) => row.kind === 'reorder_link' && row.resendId === 're_link_once' && row.accountId === activeId).length === 1, 'a reorder link email writes one log row');
useReorderDelivery(null);
const bondLog = await memory.insertEmailLog('bond', 'gary@cedargrowthco.com', { kind: 'digest', resendId: 're_bond_only', recipient: 'bond@example.com', accountId: null });
const cedarLog = memory.emailLogs.find((row) => row.resendId.startsWith('re_digest_'));
const looked: string[] = [];
useEmailLookup(async (id) => { looked.push(id); return id.startsWith('re_digest_') ? 'opened' : 'delivered'; });
const savedKey = process.env.RESEND_API_KEY;
delete process.env.RESEND_API_KEY;
clearEmailRefreshRates();
const salesRefresh = await handleEmailStatusRefresh({ actorId: 'sales-1', grants: salesGrant, request: crmReq('POST', '/api/admin/crm/email-status/refresh?brand=cedargrowth'), store: memory });
const quietRefresh = await handleEmailStatusRefresh({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/email-status/refresh?brand=cedargrowth'), store: memory });
assert(salesRefresh.status === 403 && quietRefresh.status === 200 && quietRefresh.body.configured === false && quietRefresh.body.updated === 0 && cedarLog?.lastEvent === null && bondLog.state === 'ok' && bondLog.value.lastEvent === null, 'a salesperson cannot refresh and missing configuration changes nothing');
process.env.RESEND_API_KEY = 'test-digest-key';
clearEmailRefreshRates();
const cedarRefresh = await handleEmailStatusRefresh({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/email-status/refresh?brand=cedargrowth'), store: memory });
assert(cedarRefresh.status === 200 && cedarRefresh.body.updated === memory.emailLogs.filter((row) => row.brand === 'cedargrowth' && row.sentAt >= '2026-10-01').length && looked.every((id) => !id.startsWith('re_bond')) && bondLog.value.lastEvent === null && cedarLog?.lastEvent === 'opened' && emailStatusLabel(cedarLog?.lastEvent) === 'Opened (approximate)', 'refresh stays in the brand');
useEmailLookup(null);
if (savedKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = savedKey;
useDigestDelivery(null);
if (savedDigestEnv.key === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = savedDigestEnv.key;
if (savedDigestEnv.to === undefined) delete process.env.CRM_DIGEST_TO; else process.env.CRM_DIGEST_TO = savedDigestEnv.to;
if (savedDigestEnv.from === undefined) delete process.env.CRM_DIGEST_FROM; else process.env.CRM_DIGEST_FROM = savedDigestEnv.from;
if (savedDigestEnv.secret === undefined) delete process.env.CRM_DIGEST_SECRET; else process.env.CRM_DIGEST_SECRET = savedDigestEnv.secret;
const absentHealth = await handleHealth({
  actorId: 'gary@cedargrowthco.com',
  grants: owner,
  request: crmReq('GET', '/api/admin/crm/health?brand=cedargrowth'),
  store: new Proxy(memory, { get(target, prop, receiver) { return prop === 'counts' ? async () => ({ state: 'absent' }) : Reflect.get(target, prop, receiver); } }),
});
const absentCanix = absentHealth.body.canix as { connected?: boolean };
assert(absentHealth.status === 503 && absentHealth.body.ok === false && absentHealth.body.configured === false && absentHealth.body.storage === 'absent' && absentCanix.connected === false, 'absent storage is not reported as a healthy desk');

const intakeStore = new MemoryCrm();
const intakeNow = Date.parse('2026-11-09T15:04:00Z');
const intakeStamp = String(Math.floor(intakeNow / 1000));
const intakeEnv = { CG_BOND_INTAKE_SECRET: 'test-secret', CG_BOND_INTAKE_SECRET_NEXT: 'next-secret' };
function intakePayload(overrides: Record<string, unknown> = {}) {
  return {
    inquiry_id: '11111111-1111-4111-8111-111111111111',
    submitted_at: '2026-11-09T15:00:00Z',
    business_name: 'North Store',
    contact_name: 'Ada Buyer',
    contact_email: 'ada@northstore.test',
    street: '1 Main',
    city: 'Buffalo',
    state: 'NY',
    postal_code: '14201',
    county: 'Erie',
    license_number: 'OCM-1',
    message: 'Hello plain',
    consent_version: 'v1:0123456789abcdef',
    source_route: '/order',
    ...overrides,
  };
}
function intakeRequest(body: unknown, options?: { secret?: string; stamp?: string; raw?: string; headers?: Record<string, string> }) {
  const raw = options?.raw ?? JSON.stringify(body);
  const stamp = options?.stamp ?? intakeStamp;
  const secret = options?.secret ?? 'test-secret';
  const inquiry = body && typeof body === 'object' && 'inquiry_id' in (body as Record<string, unknown>) ? String((body as { inquiry_id: unknown }).inquiry_id) : '';
  return new Request('https://cedargrowth.vercel.app/api/intake/dispensary-inquiry', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cg-timestamp': stamp, 'x-cg-signature': signIntake(secret, stamp, raw), 'idempotency-key': inquiry, ...options?.headers },
    body: raw,
  });
}
clearIntakeRates();
const intakeLogs: string[] = [];
const previousError = console.error;
console.error = (...args: unknown[]) => { intakeLogs.push(args.map((item) => String(item)).join(' ')); };
const intakeUnconfigured = await handleBondIntake(intakeStore, intakeRequest(intakePayload()), { nowMs: intakeNow, env: {} });
const badSig = await handleBondIntake(intakeStore, intakeRequest(intakePayload(), { secret: 'wrong' }), { nowMs: intakeNow, env: intakeEnv });
const stale = await handleBondIntake(intakeStore, intakeRequest(intakePayload(), { stamp: String(Number(intakeStamp) - 301) }), { nowMs: intakeNow, env: intakeEnv });
const rotated = await handleBondIntake(intakeStore, intakeRequest(intakePayload(), { secret: 'next-secret' }), { nowMs: intakeNow, env: intakeEnv });
const replay = await handleBondIntake(intakeStore, intakeRequest(intakePayload(), { secret: 'next-secret' }), { nowMs: intakeNow, env: intakeEnv });
console.error = previousError;
const rotatedAccount = intakeStore.accounts.find((row) => row.brand === 'bond' && row.displayName === 'North Store');
assert(intakeUnconfigured.status === 503 && rotated.status === 200 && rotated.body.duplicate !== true, 'a missing intake secret does nothing');
assert(badSig.status === 401 && stale.status === 401 && JSON.stringify(badSig.body) === '{"ok":false}' && intakeStore.intakeLogs.length === 1, 'a bad or stale signature stores nothing');
assert(rotated.status === 200 && rotated.body.ok === true && replay.status === 200 && replay.body.duplicate === true && intakeStore.accounts.filter((row) => row.brand === 'bond').length === 1, 'the rotation secret is accepted and a replay creates nothing');
assert(rotatedAccount?.status === 'prospect' && rotatedAccount.leadSource === 'bond_inquiry' && rotatedAccount.county === 'Erie' && rotatedAccount.ocmStatus === 'unverified' && rotatedAccount.consentVersion === 'v1:0123456789abcdef' && regionForCounty(rotatedAccount.county) === 'Western New York', 'one bond lead keeps the county and stays unverified');
const leadOpp = intakeStore.opportunities.find((row) => row.accountId === rotatedAccount?.id);
const leadNote = intakeStore.notes.find((row) => row.accountId === rotatedAccount?.id);
const leadActivity = intakeStore.activity.find((row) => row.accountId === rotatedAccount?.id && row.kind === 'inquiry_received');
assert(leadOpp?.stage === 'lead' && leadOpp.forecastCents === null && leadNote?.body === 'Hello plain' && leadNote.body.includes('<') === false && leadActivity?.summary === 'Inquiry received' && JSON.stringify(leadActivity).includes('ada@') === false, 'the lead is an unforecasted stage, and the message stays plain text');
const unknownKey = await handleBondIntake(intakeStore, intakeRequest(intakePayload({ inquiry_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', address_line: 'hidden' })), { nowMs: intakeNow, env: intakeEnv });
const rejectedKeys = ['trade_name', 'contact_role', 'preferred_contact_method', 'products_of_interest', 'consumer', 'haus', 'metrc', 'ip', 'user_agent'];
const rejected = [];
for (const key of rejectedKeys) {
  const result = await handleBondIntake(intakeStore, intakeRequest(intakePayload({ inquiry_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', [key]: 'hidden' })), { nowMs: intakeNow, env: intakeEnv });
  rejected.push(result.status === 400 && Array.isArray(result.body.fields) && result.body.fields.includes(key) && JSON.stringify(result.body).includes('hidden') === false);
}
assert(unknownKey.status === 400 && JSON.stringify(unknownKey.body) === '{"ok":false,"fields":["address_line"]}' && rejected.every(Boolean), 'unknown and rejected keys are named and their values are not stored');
const huge = 'x'.repeat(INTAKE_MAX_BYTES + 1);
const oversize = await handleBondIntake(intakeStore, intakeRequest(intakePayload(), { raw: huge }), { nowMs: intakeNow, env: intakeEnv });
const badState = await handleBondIntake(intakeStore, intakeRequest(intakePayload({ inquiry_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', state: 'nj' })), { nowMs: intakeNow, env: intakeEnv });
const badCounty = await handleBondIntake(intakeStore, intakeRequest(intakePayload({ inquiry_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', county: 'Brooklyn' })), { nowMs: intakeNow, env: intakeEnv });
const longMessage = await handleBondIntake(intakeStore, intakeRequest(intakePayload({ inquiry_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', message: 'm'.repeat(501) })), { nowMs: intakeNow, env: intakeEnv });
const badConsent = await handleBondIntake(intakeStore, intakeRequest(intakePayload({ inquiry_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', consent_version: 'v1:ABCDEF0123456789' })), { nowMs: intakeNow, env: intakeEnv });
const badKey = await handleBondIntake(intakeStore, intakeRequest(intakePayload({ inquiry_id: '12121212-1212-4121-8121-121212121212' }), { headers: { 'idempotency-key': '99999999-9999-4999-8999-999999999999' } }), { nowMs: intakeNow, env: intakeEnv });
assert(oversize.status === 413 && badState.status === 400 && badCounty.status === 400 && longMessage.status === 400 && badConsent.status === 400 && badKey.status === 400 && intakeStore.intakeLogs.length === 1, 'oversize, state, county, message, consent, and idempotency failures store no body');
await intakeStore.createAccount('cedargrowth', 'test-only', { displayName: 'Cedar Twin', status: 'prospect', city: 'Buffalo', notes: '', licenseRef: 'OCM-9' });
const cedarId = intakeStore.accounts.find((row) => row.brand === 'cedargrowth')?.id || '';
await intakeStore.createContact('cedargrowth', 'test-only', { accountId: cedarId, name: 'Cedar Buyer', email: 'twin@cedar.test' });
const brandLead = await handleBondIntake(intakeStore, intakeRequest(intakePayload({ inquiry_id: '13131313-1313-4131-8131-131313131313', license_number: 'OCM-9', business_name: 'Cedar Twin', contact_email: 'twin@cedar.test' })), { nowMs: intakeNow, env: intakeEnv });
assert(brandLead.status === 200 && intakeStore.accounts.filter((row) => row.brand === 'bond' && row.displayName === 'Cedar Twin').length === 1 && intakeStore.accounts.filter((row) => row.brand === 'cedargrowth').length === 1, 'a CedarGrowth row is not the Bond duplicate');
const weak = await handleBondIntake(intakeStore, intakeRequest(intakePayload({ inquiry_id: '14141414-1414-4141-8141-141414141414', business_name: 'Different Shop', license_number: 'OCM-1', contact_email: 'bea@other.test' })), { nowMs: intakeNow, env: intakeEnv });
const named = await handleBondIntake(intakeStore, intakeRequest(intakePayload({ inquiry_id: '15151515-1515-4151-8151-151515151515', business_name: 'north-store', license_number: 'OCM-2', contact_email: 'buyer@northstore.test' })), { nowMs: intakeNow, env: intakeEnv });
assert(weak.status === 200 && named.status === 200 && intakeStore.accounts.filter((row) => row.licenseRef === 'OCM-1').length === 1 && intakeStore.tasks.some((row) => row.title === 'Possible duplicate' && row.status === 'open') && intakeStore.notes.some((row) => row.body.startsWith('Possible duplicate.')), 'a weak duplicate is flagged and not merged');
const htmlLead = await handleBondIntake(intakeStore, intakeRequest(intakePayload({ inquiry_id: '16161616-1616-4161-8161-161616161616', business_name: 'Markup Shop', license_number: 'OCM-3', contact_email: 'mark@markup.test', message: '<b>hi</b>' })), { nowMs: intakeNow, env: intakeEnv });
const htmlNote = intakeStore.notes.find((row) => row.body === '<b>hi</b>');
assert(htmlLead.status === 200 && htmlNote?.body === intakeMessageText('<b>hi</b>'), 'a message is stored as text and not wrapped as HTML');
const testLead = await handleBondIntake(intakeStore, intakeRequest(intakePayload({ inquiry_id: '17171717-1717-4171-8171-171717171717', business_name: 'TEST ONLY Shop', license_number: 'TEST ONLY', contact_email: 'qa@test.test', city: 'Rochester', county: 'Monroe' })), { nowMs: intakeNow, env: intakeEnv });
const testAccount = intakeStore.accounts.find((row) => row.displayName === 'TEST ONLY Shop');
const intakeDash = buildDashboard({ brand: 'bond', today: '2026-11-09', filter: { year: null, month: null, rep: null, region: null, territory: null, accountType: null, leadSource: null, stage: null, status: null }, accounts: intakeStore.accounts, opportunities: intakeStore.opportunities, tasks: [], activity: [] });
const intakeDigest = buildDigest({ brand: 'bond', nowMs: intakeNow, accounts: intakeStore.accounts.map((row) => ({ ...row, createdAt: new Date(intakeNow).toISOString() })), opportunities: intakeStore.opportunities, tasks: [] });
assert(testLead.status === 200 && testAccount?.recordMarker === 'test' && excludeTestLeads(testAccount ? [testAccount] : []).length === 0 && (intakeDash.byStage.find((row) => row.key === 'lead')?.count || 0) > 0 && renderDigestText(intakeDigest).includes('TEST ONLY Shop') === false, 'a test marker is excluded from the dashboard and the digest');
const bondSales = [{ brand: 'bond' as const, role: 'salesperson' as const }];
const salesDelete = await handleIntakeDelete({ actorId: 'sales-1', grants: bondSales, request: crmReq('POST', '/api/admin/crm/intake', { brand: 'bond', inquiryId: rotatedAccount?.sourceInquiryId }), store: intakeStore });
assert(salesDelete.status === 403 && JSON.stringify(salesDelete.body).includes('ada@') === false && JSON.stringify(salesDelete.body).includes('Hello plain') === false, 'a salesperson cannot read intake internals');
const removed = await handleIntakeDelete({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/intake', { brand: 'bond', inquiryId: rotatedAccount?.sourceInquiryId }), store: intakeStore });
assert(removed.status === 200 && intakeStore.accounts.every((row) => row.sourceInquiryId !== rotatedAccount?.sourceInquiryId) && intakeStore.intakeDeletions.some((row) => row.contactName === 'bond' && row.reason === 'named') && JSON.stringify(intakeStore.intakeDeletions).includes('email') === false, 'deletion removes the named lead and records bond with no mailbox');
const oldLead = await handleBondIntake(intakeStore, intakeRequest(intakePayload({ inquiry_id: '18181818-1818-4181-8181-181818181818', business_name: 'Old Shop', license_number: 'OLD-1', contact_email: 'cara@old.test' })), { nowMs: intakeNow, env: intakeEnv });
const oldAccount = intakeStore.accounts.find((row) => row.displayName === 'Old Shop');
const oldLog = intakeStore.intakeLogs.find((row) => row.inquiryId === oldAccount?.sourceInquiryId);
if (oldLog) oldLog.receivedAt = '2024-01-01T00:00:00Z';
const keptLead = await handleBondIntake(intakeStore, intakeRequest(intakePayload({ inquiry_id: '19191919-1919-4191-8191-191919191919', business_name: 'Kept Shop', license_number: 'KEPT-1', contact_email: 'dan@kept.test' })), { nowMs: intakeNow, env: intakeEnv });
const keptAccount = intakeStore.accounts.find((row) => row.displayName === 'Kept Shop');
if (keptAccount) keptAccount.ocmStatus = 'verified';
const keptLog = intakeStore.intakeLogs.find((row) => row.inquiryId === keptAccount?.sourceInquiryId);
if (keptLog) keptLog.receivedAt = '2024-01-01T00:00:00Z';
const purged = await handleIntakePurge({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('POST', '/api/admin/crm/intake?action=purge', { brand: 'bond' }), store: intakeStore });
assert(oldLead.status === 200 && keptLead.status === 200 && purged.status === 200 && purged.body.purged === 1 && intakeStore.accounts.every((row) => row.displayName !== 'Old Shop') && intakeStore.accounts.some((row) => row.displayName === 'Kept Shop'), 'purge deletes an unqualified lead and keeps a verified one');
const cardLead = await handleBondIntake(intakeStore, intakeRequest(intakePayload({ inquiry_id: '21212121-2121-4121-8121-212121212121', business_name: 'Card Shop', license_number: 'CARD-1', contact_email: 'eve@card.test', source_route: '/card', source_event: 'nyc-2026' })), { nowMs: intakeNow, env: intakeEnv });
const cardAccount = intakeStore.accounts.find((row) => row.displayName === 'Card Shop');
const cardLog = intakeStore.intakeLogs.find((row) => row.inquiryId === '21212121-2121-4121-8121-212121212121');
const cardMissing = await handleBondIntake(intakeStore, intakeRequest(intakePayload({ inquiry_id: '22222222-2222-4222-8222-222222222222', business_name: 'No Event', license_number: 'CARD-2', contact_email: 'no@event.test', source_route: '/card' })), { nowMs: intakeNow, env: intakeEnv });
const orderEvent = await handleBondIntake(intakeStore, intakeRequest(intakePayload({ inquiry_id: '23232323-2323-4232-8232-232323232323', business_name: 'Order Event', license_number: 'CARD-3', contact_email: 'order@event.test', source_route: '/order', source_event: 'nyc-2026' })), { nowMs: intakeNow, env: intakeEnv });
const orderNull = await handleBondIntake(intakeStore, intakeRequest(intakePayload({ inquiry_id: '24242424-2424-4242-8242-242424242424', business_name: 'Order Null', license_number: 'CARD-4', contact_email: 'null@event.test', source_event: null })), { nowMs: intakeNow, env: intakeEnv });
const badEvent = await handleBondIntake(intakeStore, intakeRequest(intakePayload({ inquiry_id: '25252525-2525-4252-8252-252525252525', business_name: 'Bad Event', license_number: 'CARD-5', contact_email: 'bad@event.test', source_route: '/card', source_event: 'NYC_Show' })), { nowMs: intakeNow, env: intakeEnv });
assert(cardLead.status === 200 && cardAccount?.leadSource === 'bond_inquiry' && cardAccount.sourceEvent === 'nyc-2026' && cardLog?.sourceRoute === '/card' && cardLog.sourceEvent === 'nyc-2026' && rotatedAccount?.sourceEvent == null && cardMissing.status === 400 && orderEvent.status === 400 && orderNull.status === 200 && badEvent.status === 400 && intakeStore.accounts.every((row) => row.displayName !== 'No Event' && row.displayName !== 'Order Event' && row.displayName !== 'Bad Event'), 'a card lead stores its event, and an order lead cannot carry one');
clearIntakeRates();
for (let hit = 0; hit < 30; hit += 1) takeIntakeRate('/order', intakeNow);
const limited = await handleBondIntake(intakeStore, intakeRequest(intakePayload({ inquiry_id: '20202020-2020-4202-8202-202020202020', business_name: 'Late Shop', license_number: 'LATE-1', contact_email: 'late@late.test' })), { nowMs: intakeNow, env: intakeEnv });
function supplierPayload(overrides: Record<string, unknown> = {}) {
  return {
    inquiry_id: '31313131-3131-4131-8131-313131313131',
    submitted_at: '2026-11-09T15:00:00Z',
    business_name: 'North Farm',
    contact_name: 'Ada Grower',
    contact_email: 'ada@northfarm.test',
    contact_phone: '555-0100',
    supply_type: 'fresh_frozen_biomass',
    county: 'Erie',
    message: 'Frozen lot',
    consent_version: 'v1:0123456789abcdef',
    source_route: '/card',
    source_event: 'nyc-2026',
    ...overrides,
  };
}
function supplierRequest(body: unknown, options?: { secret?: string; stamp?: string; raw?: string; headers?: Record<string, string> }) {
  const raw = options?.raw ?? JSON.stringify(body);
  const stamp = options?.stamp ?? intakeStamp;
  const secret = options?.secret ?? 'supplier-secret';
  const inquiry = body && typeof body === 'object' && 'inquiry_id' in (body as Record<string, unknown>) ? String((body as { inquiry_id: unknown }).inquiry_id) : '';
  return new Request('https://cedargrowth.vercel.app/api/intake/supplier-inquiry', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cg-timestamp': stamp, 'x-cg-signature': signIntake(secret, stamp, raw), 'idempotency-key': inquiry, ...options?.headers },
    body: raw,
  });
}
const supplierEnv = { CG_BOND_SUPPLIER_INTAKE_SECRET: 'supplier-secret', CG_BOND_SUPPLIER_INTAKE_SECRET_NEXT: 'supplier-next' };
const accountsBeforeSupplier = intakeStore.accounts.length;
const supplierOff = await handleSupplierIntake(intakeStore, supplierRequest(supplierPayload()), { nowMs: intakeNow, env: {} });
const supplierBad = await handleSupplierIntake(intakeStore, supplierRequest(supplierPayload(), { secret: 'wrong' }), { nowMs: intakeNow, env: supplierEnv });
const supplierStale = await handleSupplierIntake(intakeStore, supplierRequest(supplierPayload(), { stamp: String(Number(intakeStamp) - 301) }), { nowMs: intakeNow, env: supplierEnv });
const supplierOk = await handleSupplierIntake(intakeStore, supplierRequest(supplierPayload(), { secret: 'supplier-next' }), { nowMs: intakeNow, env: supplierEnv });
const supplierReplay = await handleSupplierIntake(intakeStore, supplierRequest(supplierPayload(), { secret: 'supplier-next' }), { nowMs: intakeNow, env: supplierEnv });
const supplierRow = intakeStore.supplierInquiries.find((row) => row.inquiryId === '31313131-3131-4131-8131-313131313131');
const supplierUnknown = await handleSupplierIntake(intakeStore, supplierRequest(supplierPayload({ inquiry_id: '32323232-3232-4232-8232-323232323232', lead_type: 'supplier' })), { nowMs: intakeNow, env: supplierEnv });
const supplierCounty = await handleSupplierIntake(intakeStore, supplierRequest(supplierPayload({ inquiry_id: '33333333-3333-4333-8333-333333333333', county: 'Brooklyn' })), { nowMs: intakeNow, env: supplierEnv });
const supplierRoute = await handleSupplierIntake(intakeStore, supplierRequest(supplierPayload({ inquiry_id: '34343434-3434-4434-8434-343434343434', source_route: '/order' })), { nowMs: intakeNow, env: supplierEnv });
const supplierEvent = await handleSupplierIntake(intakeStore, supplierRequest(supplierPayload({ inquiry_id: '35353535-3535-4535-8535-353535353535', source_event: null })), { nowMs: intakeNow, env: supplierEnv });
const supplierType = await handleSupplierIntake(intakeStore, supplierRequest(supplierPayload({ inquiry_id: '36363636-3636-4636-8636-363636363636', supply_type: 'flower' })), { nowMs: intakeNow, env: supplierEnv });
const supplierLong = await handleSupplierIntake(intakeStore, supplierRequest(supplierPayload({ inquiry_id: '37373737-3737-4737-8737-373737373737', message: 'm'.repeat(501) })), { nowMs: intakeNow, env: supplierEnv });
const supplierDup = await handleSupplierIntake(intakeStore, supplierRequest(supplierPayload({ inquiry_id: '38383838-3838-4838-8838-383838383838', business_name: 'Other Farm', contact_email: 'ada@northfarm.test' })), { nowMs: intakeNow, env: supplierEnv });
const supplierTest = await handleSupplierIntake(intakeStore, supplierRequest(supplierPayload({ inquiry_id: '39393939-3939-4939-8939-393939393939', business_name: 'TEST ONLY Farm', license_number: 'TEST ONLY', contact_email: 'qa@farm.test' })), { nowMs: intakeNow, env: supplierEnv });
const supplierTestRow = intakeStore.supplierInquiries.find((row) => row.inquiryId === '39393939-3939-4939-8939-393939393939');
const supplierDupRow = intakeStore.supplierInquiries.find((row) => row.inquiryId === '38383838-3838-4838-8838-383838383838');
assert(supplierOff.status === 503 && supplierBad.status === 401 && supplierStale.status === 401 && supplierOk.status === 200 && supplierReplay.status === 200 && supplierReplay.body.duplicate === true && supplierRow?.supplyType === 'fresh_frozen_biomass' && supplierRow.sourceEvent === 'nyc-2026' && supplierRow.recordMarker === null && intakeStore.accounts.length === accountsBeforeSupplier && supplierUnknown.status === 400 && supplierCounty.status === 400 && supplierRoute.status === 400 && supplierEvent.status === 400 && supplierType.status === 400 && supplierLong.status === 400 && supplierDup.status === 200 && supplierDupRow?.possibleDuplicate === true && supplierTest.status === 200 && supplierTestRow?.recordMarker === 'test' && intakeStore.supplierInquiries.length === 3, 'supplier intake stays out of dispensary accounts and rejects a bad signature, county, or unknown key');
assert(limited.status === 429 && (limited.retryAfter || 0) >= 1 && intakeStore.accounts.every((row) => row.displayName !== 'Late Shop'), 'the source rate limit returns retry after and stores nothing');
assert(intakeLogs.every((line) => line.includes('test-secret') === false && line.includes('next-secret') === false && line.includes('ada@northstore.test') === false && line.includes('Hello plain') === false), 'secret and payload never logged');
assert(parseIntake({ consumer: true }).ok === false && intakeExpired('2024-01-01T00:00:00Z', '2026-11-09T15:00:00Z') && intakeExpired('2026-10-01T00:00:00Z', '2026-11-09T15:00:00Z') === false, 'consumer fields are rejected and the retention window is twelve months');

const agentStore = new MemoryCrm();
const agentNow = Date.parse('2026-11-09T18:00:00Z');
const agentStamp = String(Math.floor(agentNow / 1000));
const agentEnv = { AGENT_INTAKE_ENABLED: 'true', CG_AGENT_INTAKE_SECRET: 'agent-secret' };
function agentPayload(requestId: string, rows: unknown[]) {
  return { request_id: requestId, brand: 'cedargrowth', rows };
}
function agentRequest(body: unknown, options?: { secret?: string; stamp?: string; raw?: string; headers?: Record<string, string> }) {
  const raw = options?.raw ?? JSON.stringify(body);
  const stamp = options?.stamp ?? agentStamp;
  const secret = options?.secret ?? 'agent-secret';
  const requestId = body && typeof body === 'object' && 'request_id' in (body as Record<string, unknown>) ? String((body as { request_id: unknown }).request_id) : '';
  return new Request('https://cedargrowth.vercel.app/api/intake/agent-records', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cg-timestamp': stamp, 'x-cg-signature': signIntake(secret, stamp, raw), 'idempotency-key': requestId, ...options?.headers },
    body: raw,
  });
}
const agentLogs: string[] = [];
const agentConsole = console.error;
console.error = (...args: unknown[]) => { agentLogs.push(args.map((item) => String(item)).join(' ')); };
const agentOff = await handleAgentIntake(agentStore, agentRequest(agentPayload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', [])), { nowMs: agentNow, env: { CG_AGENT_INTAKE_SECRET: 'agent-secret' } });
const agentNoSecret = await handleAgentIntake(agentStore, agentRequest(agentPayload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', [])), { nowMs: agentNow, env: { AGENT_INTAKE_ENABLED: 'true' } });
const agentBadSig = await handleAgentIntake(agentStore, agentRequest(agentPayload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', []), { secret: 'wrong' }), { nowMs: agentNow, env: agentEnv });
const agentStale = await handleAgentIntake(agentStore, agentRequest(agentPayload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', []), { stamp: String(Number(agentStamp) - 301) }), { nowMs: agentNow, env: agentEnv });
const agentUnknown = await handleAgentIntake(agentStore, agentRequest(agentPayload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', []), { headers: {} }), { nowMs: agentNow, env: agentEnv });
console.error = agentConsole;
const agentUnknownBody = await handleAgentIntake(agentStore, agentRequest({ ...agentPayload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', []), haus: 'hidden' }), { nowMs: agentNow, env: agentEnv });
const agentCounty = await handleAgentIntake(agentStore, agentRequest(agentPayload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', [{ kind: 'account', display_name: 'Bad County', status: 'prospect', county: 'Brooklyn', state: 'NY', country: 'USA' }])), { nowMs: agentNow, env: agentEnv });
const accountsAfterCounty = agentStore.accounts.length;
const agentOversize = await handleAgentIntake(agentStore, agentRequest(agentPayload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4', Array.from({ length: 51 }, () => ({ kind: 'account', display_name: 'Bulk', status: 'prospect', state: 'NY', country: 'USA', county: 'Erie' })))), { nowMs: agentNow, env: agentEnv });
const accountsAfterOversize = agentStore.accounts.length;
const goodId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5';
const agentGood = await handleAgentIntake(agentStore, agentRequest(agentPayload(goodId, [
  { kind: 'account', display_name: 'Agent Shop', status: 'prospect', account_type: 'adult_use_dispensary', city: 'Buffalo', county: 'Erie', state: 'NY', country: 'USA', license_number: 'AGENT-LIC-1' },
  { kind: 'contact', name: 'Agent Buyer', email: 'Buyer@Agent.test', account_license: 'AGENT-LIC-1' },
  { kind: 'note', body: 'Plain note', account_license: 'AGENT-LIC-1' },
])), { nowMs: agentNow, env: agentEnv });
const agentReplay = await handleAgentIntake(agentStore, agentRequest(agentPayload(goodId, [
  { kind: 'account', display_name: 'Agent Shop Again', status: 'prospect', county: 'Erie', state: 'NY', country: 'USA', license_number: 'AGENT-LIC-2' },
])), { nowMs: agentNow, env: agentEnv });
const agentDupe = await handleAgentIntake(agentStore, agentRequest(agentPayload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6', [
  { kind: 'account', display_name: 'Agent Shop Copy', status: 'active', county: 'Erie', state: 'NY', country: 'USA', license_number: 'agent-lic-1' },
])), { nowMs: agentNow, env: agentEnv });
assert(agentOff.status === 503 && agentNoSecret.status === 503, 'agent intake stays off until the flag and secret are set');
assert(agentBadSig.status === 401 && agentStale.status === 401 && JSON.stringify(agentBadSig.body) === '{"ok":false}', 'a bad or stale agent signature stores nothing');
assert(agentUnknownBody.status === 400 && JSON.stringify(agentUnknownBody.body).includes('haus') && JSON.stringify(agentUnknownBody.body).includes('hidden') === false, 'an unknown agent field is named and its value is not stored');
assert(agentCounty.status === 200 && ((agentCounty.body.failed as { reason: string }[]) || []).some((row) => row.reason.includes('New York')) && accountsAfterCounty === 0, 'an unknown county is rejected');
assert(agentOversize.status === 413 && accountsAfterOversize === 0, 'an agent batch over 50 rows is rejected');
const agentCreated = agentGood.body.created as { accounts: number; contacts: number; notes: number };
assert(agentGood.status === 200 && agentCreated.accounts === 1 && agentCreated.contacts === 1 && agentCreated.notes === 1 && agentStore.accounts.filter((row) => row.brand === 'cedargrowth' && row.licenseRef === 'AGENT-LIC-1').length === 1 && agentStore.contacts.some((row) => row.email === 'buyer@agent.test' && row.preference === 'unspecified') && agentStore.notes.some((row) => row.body === 'Plain note' && row.actor === 'CODEX agent') && agentStore.activity.some((row) => row.actor === 'CODEX agent' && row.sourceRequestId === goodId), 'a signed agent request writes an account, a contact, and a note');
assert(agentReplay.status === 409 && agentStore.accounts.filter((row) => row.licenseRef === 'AGENT-LIC-2').length === 0, 'a replayed agent request id is rejected');
assert(agentDupe.status === 200 && ((agentDupe.body.skipped as { reason: string }[]) || []).some((row) => row.reason.includes('license')) && agentStore.accounts.filter((row) => row.displayName === 'Agent Shop Copy').length === 0, 'a duplicate license is not added again');
assert(agentLogs.every((line) => line.includes('agent-secret') === false), 'the agent secret is never logged');
const agentFields = await handleAgentIntake(agentStore, agentRequest(agentPayload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8', [
  { kind: 'account', display_name: 'TEST ONLY Shop', status: 'prospect', account_type: 'adult_use_dispensary', lead_source: 'Referral', assigned_rep: 'TEST ONLY Rep', city: 'Buffalo', county: 'Erie', state: 'NY', country: 'USA', license_number: 'TEST-ONLY-FIELDS', license_expiry: '1/2/2027', street: '1 Test Street', postal_code: '14201', ocm_status: 'unverified', phone: '555-0100', email: 'buyer@test.only', website: 'https://test.only', operating: 'Open', region: 'Western', license_status: 'Active', notes: 'TEST ONLY note' },
])), { nowMs: agentNow, env: agentEnv });
const fieldAccount = agentStore.accounts.find((row) => row.licenseRef === 'TEST-ONLY-FIELDS');
assert(agentFields.status === 200 && fieldAccount?.street === '1 Test Street' && fieldAccount.postalCode === '14201' && fieldAccount.licenseExpiry === '2027-01-02' && fieldAccount.ocmStatus === 'unverified' && fieldAccount.leadSource === 'referral' && fieldAccount.assignedRep === 'TEST ONLY Rep' && fieldAccount.notes.includes('Store phone: 555-0100') && fieldAccount.notes.includes('Store email: buyer@test.only') && fieldAccount.notes.includes('Website: https://test.only') && fieldAccount.notes.includes('Operating: Open') && fieldAccount.notes.startsWith('TEST ONLY note'), 'agent account fields match the importer notes and the added columns');
assert(JSON.stringify(agentFields.body).includes('buyer@test.only') === false && JSON.stringify(agentFields.body).includes('555-0100') === false, 'the agent response does not echo phone or email');
const agentContactAgain = await handleAgentIntake(agentStore, agentRequest(agentPayload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7', [
  { kind: 'contact', name: 'Agent Buyer', email: 'buyer@agent.test', account_license: 'AGENT-LIC-1' },
])), { nowMs: agentNow, env: agentEnv });
assert(agentContactAgain.status === 200 && ((agentContactAgain.body.skipped as { reason: string }[]) || []).some((row) => row.reason.includes('email')) && agentStore.contacts.filter((row) => row.email === 'buyer@agent.test').length === 1, 'a contact with the same email on the same account is not added again');
void agentUnknown;
const accountHeader = 'Account name,Status,Account type,Lead source,Sales rep,City,License number,License expiry,Address,ZIP,County,Region,Phone,Email,Website,License status,Operating,Notes';
const contactHeader = 'Contact name,Email,Phone,Title,Account name,Account license';
const accountCsv = `${accountHeader}\nTEST ONLY Shop,Prospect,Adult-use dispensary,Referral,TEST ONLY Rep,Buffalo,TEST-ONLY-LIC,2027-01-01,1 Test Street,14201,Erie,Western,555-0100,buyer@test.only,https://test.only,Active,Open,TEST ONLY note\nTEST ONLY Bad,Nope,Adult-use dispensary,Referral,TEST ONLY Rep,Buffalo,TEST-ONLY-LIC-2,2027-01-01,1 Test Street,14201,Erie,Western,555-0101,bad@test.only,https://test.only,Active,Open,TEST ONLY\n`;
const contactCsv = `${contactHeader}\nTEST ONLY Buyer,buyer@test.only,555-0100,Buyer,TEST ONLY Shop,TEST-ONLY-LIC\n`;
const accountPlan = planCodexCsv('accounts', accountCsv);
const contactPlan = planCodexCsv('contacts', contactCsv);
const mappedNotes = mapRows('accounts', parseCsv(accountCsv)).rows.find((row) => row.record)?.record?.notes;
const plannedOp = parseAgentRow(0, accountPlan.ready[0]?.payload);
assert(plannedOp && 'op' in plannedOp && plannedOp.op.op === 'account' && plannedOp.op.notes === mappedNotes, 'the loader stores phone, email, website, operating, and notes the same way as the importer');
const dryLines: string[] = [];
let posts = 0;
const dryCode = await runCodexLoad(['--accounts', 'accounts.csv', '--contacts', 'contacts.csv', '--dry-run'], { CG_AGENT_INTAKE_SECRET: 'loader-secret', CG_AGENT_INTAKE_URL: 'https://loader.example' }, {
  read: (path) => path === 'accounts.csv' ? accountCsv : contactCsv,
  post: async () => { posts += 1; return { status: 200, retryAfter: 0, body: {} }; },
  now: () => agentNow,
  sleep: async () => {},
  print: (line) => dryLines.push(line),
});
const report = dryLines.join('\n');
assert(dryCode === 1 && posts === 0 && accountPlan.ready.length === 1 && accountPlan.failed.length === 1 && contactPlan.ready.length === 1, 'dry run validates the spreadsheet and does not post');
assert(report.includes('accounts ready 1') && report.includes('accounts failed 1') && report.includes('contacts ready 1') && report.includes('row 3:'), 'dry run prints counts and the row number');
assert(report.includes('loader-secret') === false && report.includes('loader.example') === false && report.includes('TEST ONLY') === false && report.includes('buyer@test.only') === false && report.includes('555-0100') === false, 'the loader report hides the secret, the URL, and the row values');
const many = [accountHeader, ...Array.from({ length: 51 }, (_, index) => `TEST ONLY ${index},Prospect,Adult-use dispensary,Referral,TEST ONLY Rep,Buffalo,TEST-ONLY-${index},2027-01-01,1 Test Street,14201,Erie,Western,555-0100,buyer${index}@test.only,https://test.only,Active,Open,TEST ONLY`)].join('\n');
assert(codexBatches(planCodexCsv('accounts', many).ready).map((batch) => batch.length).join(',') === '50,1', 'the loader posts at most 50 rows at a time');
assert(codexWaitMs(agentNow + 1000, Array.from({ length: 20 }, () => agentNow)) > 0, 'the loader waits after 20 requests in an hour');
const sentKinds: string[] = [];
await runCodexLoad(['--accounts', 'accounts.csv', '--contacts', 'contacts.csv'], { CG_AGENT_INTAKE_SECRET: 'loader-secret', CG_AGENT_INTAKE_URL: 'https://loader.example' }, {
  read: (path) => path === 'accounts.csv' ? accountCsv : contactCsv,
  post: async ({ body, headers }) => {
    const parsed = JSON.parse(body) as { rows: { kind: string }[] };
    sentKinds.push(String(parsed.rows[0]?.kind));
    assert(typeof headers['x-cg-signature'] === 'string' && headers['x-cg-signature'].length > 0, 'a loader batch is signed');
    return { status: 200, retryAfter: 0, body: { ok: true, created: { accounts: parsed.rows[0]?.kind === 'account' ? 1 : 0, contacts: parsed.rows[0]?.kind === 'contact' ? 1 : 0 }, skipped: [], failed: [] } };
  },
  now: () => agentNow,
  sleep: async () => {},
  print: () => {},
});
assert(sentKinds.join(',') === 'account,contact', 'accounts are posted before contacts');
const reportLines = codexReport('accounts', 1, [{ line: 4, reason: 'Email buyer@test.only was rejected.' }], [], ['loader-secret']);
assert(reportLines.some((line) => line === 'row 4: Row was rejected.'), 'a reason that contains an email is not printed');

assert(countyAt(-78.878, 42.886) === 'Erie', 'a Buffalo coordinate falls in Erie county');
assert(countyAt(-73.985, 40.758) === 'New York', 'a Manhattan coordinate falls in New York county');
const testPin = (id: string, latitude: number, longitude: number): MapPin => ({ id, displayName: `TEST ONLY ${id}`, licenseRef: 'TEST-ONLY-LIC', licenseExpiry: '2027-01-02', ocmStatus: 'unverified', city: 'Buffalo', county: 'Erie', assignedRep: null, distributor: 'nabis', contactCount: 2, latitude, longitude });
const placed = placePins([testPin('north', 42.89, -78.88), testPin('south', 42.891, -78.881)]).placed;
assert(clusterPins(placed, 40).clusters.length === 1 && clusterPins(placed, 0.05).singles.length === 2, 'nearby TEST ONLY pins cluster, then split when the cell is smaller');
const card = pinCard(testPin('card', 42.89, -78.88));
assert(card.some((row) => row.label === 'Rep' && row.value === 'No rep') && card.some((row) => row.mono && row.value === 'TEST-ONLY-LIC') && card.some((row) => row.label === 'Distributor' && row.value === 'Nabis') && card.some((row) => row.label === 'Contacts' && row.value === '2'), 'a pin card shows the dispensary fields and No rep');
const withContacts = dispensaryCard({ displayName: 'TEST ONLY Shop', licenseRef: 'TEST-ONLY-LIC', accountType: 'adult_use_dispensary', ocmStatus: 'verified', street: '1 Test St', city: 'Buffalo', postalCode: '14201', county: 'Erie', status: 'active', assignedRep: 'Ada' }, [{ id: 'c1', name: 'Ada Buyer', title: 'Buyer', email: 'ada@test.only', phone: '5550100' }]);
const withoutContacts = dispensaryCard({ displayName: 'TEST ONLY Bare', licenseRef: ' ', accountType: null, ocmStatus: null, street: '', city: null, postalCode: null, county: null, status: null, assignedRep: ' ' }, []);
assert(withContacts.name === 'TEST ONLY Shop' && withContacts.lines.map((row) => row.label).join(',') === 'License,Account type,OCM status,Street,City,ZIP,County,Status,Rep' && withContacts.contacts.length === 1 && withContacts.contacts[0].email === 'ada@test.only' && withContacts.contacts[0].phone === '5550100' && withoutContacts.contacts.length === 0 && withoutContacts.lines.length === 0 && withoutContacts.lines.some((row) => row.value === 'Not set') === false, 'TEST ONLY: a dispensary card keeps stored fields and contacts, and an empty card invents none');
const olderId = '11111111-1111-4111-8111-111111111111';
const newestHundred = Array.from({ length: 100 }, (_, index) => `new-${index}`);
const olderAccount = {
  id: olderId,
  publicId: 'test-only:older',
  brand: 'cedargrowth' as const,
  displayName: 'TEST ONLY older shop',
  status: 'active' as const,
  city: 'Buffalo',
  county: 'Erie',
  notes: 'secret note',
  licenseRef: 'TEST-ONLY-LIC',
  facilityRef: null,
  licenseJurisdiction: null,
  licenseExpiry: null,
  assignedRep: 'Ada',
  accountType: 'adult_use_dispensary' as const,
  leadSource: null,
  street: '1 Test St',
  postalCode: '14201',
  consentVersion: 'v9',
  consentReceivedAt: '2020-01-01',
  ocmStatus: 'verified' as const,
  distributor: null,
  distributorAccountRef: null,
  createdAt: 'test-only',
  updatedAt: 'test-only',
  createdBy: 'test-only',
  updatedBy: 'test-only',
};
const olderContact = { id: 'c-old', publicId: 'test-only:contact', brand: 'cedargrowth' as const, accountId: olderId, name: 'Ada Buyer', title: 'Buyer', email: 'ada+buyer@test.only', phone: '(716) 555-0100', notes: 'secret contact note', preference: 'do_not_contact' as const, createdAt: 'test-only', updatedAt: 'test-only' };
const storeOnlyContact = { ...olderContact, id: 'c-store', email: 'store@test.only', phone: '716.555.0100', preference: 'store_only' as const };
let sawAccountList = false;
const cardStore = {
  async listAccounts() { sawAccountList = true; return { state: 'ok' as const, value: newestHundred.map((id) => ({ ...olderAccount, id, displayName: id })) }; },
  async readAccount(brand: 'cedargrowth' | 'bond', id: string) {
    if (brand !== 'cedargrowth' || id !== olderId) return { state: 'ok' as const, value: null };
    return { state: 'ok' as const, value: olderAccount };
  },
  async listContacts(brand: 'cedargrowth' | 'bond', accountId: string | null) {
    if (brand !== 'cedargrowth' || accountId !== olderId) return { state: 'ok' as const, value: [] };
    return { state: 'ok' as const, value: [olderContact, storeOnlyContact] };
  },
};
const olderRead = await handleAccountRead({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('GET', `/api/admin/crm/accounts/${olderId}?brand=cedargrowth`), store: cardStore as unknown as typeof memory }, olderId);
const olderAccountBody = olderRead.body.account as Record<string, unknown>;
const olderContacts = await handleContactCollection({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('GET', `/api/admin/crm/contacts?brand=cedargrowth&accountId=${olderId}&card=1`), store: cardStore as unknown as typeof memory }, 'GET');
const olderPeople = (olderContacts.body.contacts as Record<string, unknown>[]) || [];
const deniedCard = await handleAccountRead({ actorId: null, grants: owner, request: crmReq('GET', `/api/admin/crm/accounts/${olderId}?brand=cedargrowth`), store: cardStore as unknown as typeof memory }, olderId);
assert(newestHundred.includes(olderId) === false && sawAccountList === false && olderRead.status === 200 && olderAccountBody.displayName === 'TEST ONLY older shop' && olderAccountBody.street === '1 Test St' && !('notes' in olderAccountBody) && !('consentVersion' in olderAccountBody) && !('consentReceivedAt' in olderAccountBody) && olderPeople.length === 2 && olderPeople.every((row) => !('notes' in row) && typeof row.email === 'string') && deniedCard.status === 404, 'TEST ONLY: a pin card reads one account by id outside the newest 100 and omits notes and consent');
const heldContact = cardContactFields(olderContact);
const storeOnlyFields = cardContactFields(storeOnlyContact);
const openContact = cardContactFields({ ...olderContact, id: 'c-open', preference: 'unspecified', email: 'ada+buyer@test.only', phone: '(716) 555-0100' });
assert(mailtoHref('ada+buyer@test.only') === 'mailto:ada%2Bbuyer%40test.only' && telHref('(716) 555-0100') === 'tel:(716) 555-0100' && telHref('+1 (716) 555-0100') === 'tel:+1 (716) 555-0100' && telHref('716.555.0100') === 'tel:716.555.0100' && telHref('555-0100 ext 12') === null && telHref('javascript:alert(1)') === null && contactMailHref(openContact.email, openContact.preference) === 'mailto:ada%2Bbuyer%40test.only' && contactTelHref(openContact.phone, openContact.preference) === 'tel:(716) 555-0100' && !('preference' in heldContact) && contactMailHref(heldContact.email, 'do_not_contact') === 'mailto:ada%2Bbuyer%40test.only' && contactTelHref(heldContact.phone, 'do_not_contact') === 'tel:(716) 555-0100' && !('preference' in storeOnlyFields) && contactMailHref(storeOnlyFields.email, 'store_only') === 'mailto:store%40test.only' && contactTelHref(storeOnlyFields.phone, 'store_only') === 'tel:716.555.0100' && cardAccountFields(olderAccount).notes === undefined, 'TEST ONLY: open, do not contact, and store only contacts all keep encoded mailto and sanitized tel');
const crowd = new MemoryCrm();
const crowdShop = await crowd.createAccount('cedargrowth', 'gary@cedargrowthco.com', { displayName: 'TEST ONLY crowd', status: 'prospect', city: 'Buffalo', notes: '' });
const crowdId = crowdShop.value?.id || '';
for (let n = 0; n < 120; n += 1) await crowd.createContact('cedargrowth', 'gary@cedargrowthco.com', { accountId: crowdId, name: `Person ${n}`, email: `p${n}@test.only`, phone: '(716) 555-0100' });
const otherShop = await crowd.createAccount('cedargrowth', 'gary@cedargrowthco.com', { displayName: 'TEST ONLY other crowd', status: 'prospect', city: 'Albany', notes: '' });
await crowd.createContact('cedargrowth', 'gary@cedargrowthco.com', { accountId: otherShop.value?.id || '', name: 'Other person', email: 'other@test.only' });
const crowdList = await handleContactCollection({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('GET', `/api/admin/crm/contacts?brand=cedargrowth&accountId=${crowdId}&card=1`), store: crowd }, 'GET');
const crowdPeople = (crowdList.body.contacts as Record<string, unknown>[]) || [];
const contactSql = readFileSync('src/lib/crm/store.ts', 'utf8');
const contactFn = contactSql.slice(contactSql.indexOf('listContacts(brand'), contactSql.indexOf('async createContact'));
assert(crowdList.status === 200 && crowdPeople.length === 120 && crowdPeople.every((row) => !('preference' in row) && !('notes' in row) && typeof row.email === 'string') && contactMailHref(String(crowdPeople[0]?.email || ''), 'store_only') === `mailto:${encodeURIComponent(String(crowdPeople[0]?.email || ''))}` && contactFn.includes("if (accountId) query = query.eq('account_id', accountId)") && contactFn.includes('else query = query.limit(100)'), 'TEST ONLY: one account returns all 120 contacts, and the desk list stays at 100');
assert(unmappedAccountCount([{ latitude: null, longitude: null }, { latitude: 42.8, longitude: -78.8 }, { latitude: 10, longitude: -78.8 }, { latitude: 10, longitude: -78.8, recordMarker: 'test' }]) === 2, 'accounts without a New York coordinate stay off the map');
const menuPins = [testPin('north', 42.89, -78.88), { ...testPin('south', 40.75, -73.99), city: 'New York', county: 'New York' }];
const cities = cityChoices(menuPins, '');
const buffaloOnly = cityChoices(menuPins, 'BUFF');
assert(cities[0]?.label === 'New York City' && cities[0].count === 1 && cities.slice(1).map((row) => row.label).join(',') === 'Buffalo,New York' && buffaloOnly.length === 1 && buffaloOnly[0].label === 'Buffalo' && buffaloOnly[0].count === 1, 'city search lists New York City first, then account cities, and filters without case');
const counties = countyChoices(menuPins, '');
const erie = countyChoices(menuPins, 'erie');
assert(counties[0]?.label === 'Whole state' && counties.length === 63 && counties.find((row) => row.label === 'Hamilton')?.count === 0 && erie.length === 1 && erie[0].label === 'Erie' && erie[0].count === 1, 'county search lists all 62 counties, keeps a zero, and filters');
const erieFrame = countyFrame('Erie');
const buffalo = projectNy(-78.878, 42.886);
const cityFrame = framePoints(placePins(menuPins.filter((pin) => pin.city === 'Buffalo')).placed);
assert(!!erieFrame && buffalo.x >= erieFrame.x && buffalo.x <= erieFrame.x + erieFrame.w && buffalo.y >= erieFrame.y && buffalo.y <= erieFrame.y + erieFrame.h && !!cityFrame && cityFrame.w < 1000, 'a county frame contains the county and a city frame fits its pins');
const opening = wholeStateFrame();
const mapUi = readFileSync('src/app/admin/crm/NyDispensaryMap.tsx', 'utf8');
assert(CITY_MENU_LABEL === 'Search cities' && COUNTY_MENU_LABEL === 'Search counties' && opening.w > (erieFrame?.w ?? opening.w) && opening.h > (erieFrame?.h ?? opening.h) && opening.x <= 0 && opening.y <= 0 && opening.x + opening.w >= MAP_WIDTH && opening.y + opening.h >= MAP_HEIGHT && mapUi.includes('label={CITY_MENU_LABEL}') && mapUi.includes('label={COUNTY_MENU_LABEL}') && mapUi.includes('const WHOLE = wholeStateFrame()') && mapUi.includes('useState(WHOLE)') && mapUi.includes('preserveAspectRatio="xMidYMid meet"') && mapUi.includes('aspectRatio') && mapUi.includes('onWheel') === false && mapUi.includes('gesturestart') && mapUi.includes('declutterPins') && mapUi.includes('aria-label="Zoom in"') && mapUi.includes('aria-label="Zoom out"') && mapUi.includes('nextZoomView') && mapUi.includes('clusterFrame') && mapUi.includes('Math.max(view.w / 90, 4)') === false && mapUi.includes('y: cy - next / 2') === false, 'TEST ONLY: the map opens on the whole state, the menus stay labeled Search cities and Search counties, and zoom is not on the wheel');
const closePins = placePins([testPin('near-a', 40.75, -73.99), testPin('near-b', 40.751, -73.989)]).placed;
const farPins = placePins([testPin('west', 42.89, -78.88), testPin('east', 44.7, -73.45)]).placed;
const merged = declutterPins(closePins, 40);
const split = declutterPins(closePins, 0.01);
const apart = declutterPins(farPins, 40);
const members = merged.clusters[0]?.pins ?? [];
assert(merged.clusters.length === 1 && members.length === 2 && members[0].latitude === closePins[0].latitude && members[0].x === closePins[0].x && members[1].x === closePins[1].x && Math.abs((merged.clusters[0]?.x ?? 0) - (closePins[0].x + closePins[1].x) / 2) < 0.001 && split.singles.length === 2 && apart.singles.length === 2, 'TEST ONLY: overlapping pins share a centroid chip and keep their coordinates');
const cityA = placePins([testPin('city-a', 40.75, -73.99)]).placed[0];
const cityB = placePins([testPin('city-b', 40.7501, -73.99)]).placed[0];
const sameB = placePins([testPin('same-b', 40.75, -73.99)]).placed[0];
const floorGap = mergeGap(minZoomWidth(opening.w));
const splitStorefront = declutterPins([cityA, cityB], floorGap);
const identical = declutterPins([cityA, sameB], floorGap);
const framed = clusterFrame([cityA, cityB], opening);
const wideFrame = clusterFrame([placed[0], placePins([testPin('east', 40.75, -73.99)]).placed[0]], opening);
const narrowMark = markerPixels(opening.w, 390);
const wideMark = markerPixels(opening.w, 1440);
const wheelBlock = mapUi.slice(mapUi.indexOf('const blockCtrlWheel'), mapUi.indexOf('const measure'));
const doubleClick = mapUi.slice(mapUi.indexOf('onDoubleClick'), mapUi.indexOf('onPointerDown'));
const escapeBlock = mapUi.slice(mapUi.indexOf("event.key !== 'Escape'"), mapUi.indexOf('function onDown'));
assert(splitStorefront.singles.length === 2 && splitStorefront.clusters.length === 0 && splitStorefront.singles[0].x === cityA.x && splitStorefront.singles[0].latitude === 40.75 && splitStorefront.singles[1].latitude === 40.7501, 'TEST ONLY: pins 0.0001 degrees apart are separate markers at maximum zoom');
assert(identical.clusters.length === 1 && identical.singles.length === 0 && identical.clusters[0]?.pins[0]?.x === cityA.x && identical.clusters[0]?.pins[1]?.x === sameB.x, 'TEST ONLY: pins at identical coordinates stay one chip');
assert(framed.w + 1e-9 >= minZoomWidth(opening.w) && Math.abs(framed.w - minZoomWidth(opening.w)) < 1e-6 && wideFrame.w <= opening.w + 1e-6 && wideFrame.w + 1e-9 >= minZoomWidth(opening.w), 'TEST ONLY: a chip frame is clamped to the deepest zoom and never past it');
const closeBlock = mapUi.slice(mapUi.indexOf('function closeList'), mapUi.indexOf('function zoomBy'));
assert(wheelBlock.includes('setView') === false && wheelBlock.includes('preventDefault') && doubleClick.includes('setView') === false && doubleClick.includes('preventDefault') && escapeBlock.includes('setView') === false && escapeBlock.includes('setOpenCluster(null)') && escapeBlock.includes('queueReturn(ids)') && mapUi.includes('window.setTimeout') && mapUi.includes("document.addEventListener('click', onDown)") && closeBlock.includes('queueReturn(ids)'), 'TEST ONLY: the wheel, a double click, and Escape leave the map view unchanged, and focus returns after the click');
const phoneMark = markerPixels(opening.w, 430);
const tabletMark = markerPixels(opening.w, 768);
const nycPair = placePins([testPin('nyc-a', 40.75, -73.99), testPin('nyc-b', 40.751, -73.989)]).placed;
const nycGap = mergeGap(minZoomWidth(opening.w));
const nycSplit = declutterPins(nycPair, nycGap);
const chainSeed = { ...cityA, id: 'seed', x: 0, y: 0 };
const chainMid = { ...cityA, id: 'mid', x: 1, y: 0 };
const chainFar = { ...cityA, id: 'far', x: 2.2, y: 0 };
const chain = declutterPins([chainSeed, chainMid, chainFar] as PlacedPin[], 1.5);
function centerHit(svgWidth: number, pins: PlacedPin[]) {
  const units = markerUnits(opening.w, svgWidth);
  const half = units.target / 2;
  const markers = pins.map((pin) => ({ id: pin.id, x: pin.x, y: pin.y, halfW: half, halfH: half }));
  return pins.map((pin) => hitAt(markers, pin.x, pin.y));
}
assert(Math.abs(mergeGap(opening.w) - opening.w / 90 * 2.8) < 1e-9 && Math.abs(nycGap - minZoomWidth(opening.w) / 90 * 2.8) < 1e-9 && nycGap < Math.hypot(nycPair[0].x - nycPair[1].x, nycPair[0].y - nycPair[1].y) && nycSplit.singles.length === 2 && chain.clusters.length === 1 && chain.clusters[0]?.count === 2 && chain.singles.length === 1 && chain.singles[0]?.id === 'far', 'TEST ONLY: the merge gap is the zoom fraction, the NYC pair splits at the stop, and a chain does not become one chip');
assert(centerHit(390, nycPair).join(',') === 'nyc-a,nyc-b' && centerHit(1440, nycPair).join(',') === 'nyc-a,nyc-b', 'TEST ONLY: a click on a pin center returns that pin at 390 and 1440');
const areaPins = placePins([
  testPin('buffalo', 42.886, -78.878),
  testPin('rochester', 43.156, -77.608),
  testPin('syracuse', 43.048, -76.147),
  testPin('utica', 43.1, -75.233),
  testPin('ithaca', 42.444, -76.501),
  testPin('binghamton', 42.099, -75.918),
  testPin('wide-a', 40.75, -73.99),
  testPin('wide-b', 40.752, -73.985),
]).placed;
function hitRects(svgWidth: number, viewWidth = opening.w, pins = areaPins) {
  const screen = { viewWidth, svgClientWidth: svgWidth };
  const grouped = declutterPins(pins, mergeGap(viewWidth, svgWidth), screen);
  return [
    ...grouped.singles.map((pin) => groupHitBox(1, pin.x, pin.y, viewWidth, svgWidth)),
    ...grouped.clusters.map((cluster) => groupHitBox(cluster.count, cluster.x, cluster.y, viewWidth, svgWidth)),
  ];
}
function rectsOverlap(rects: { x: number; y: number; w: number; h: number }[]) {
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      if (boxesIntersect(rects[i], rects[j])) return true;
    }
  }
  return false;
}
const phoneFloorGap = mergeGap(minZoomWidth(opening.w, 390), 390);
const mapStops = zoomStops(opening.w, 390);
const floorWidth = mapStops[mapStops.length - 1];
const shopRows = placePins([
  testPin('syracuse', 43.048, -76.147),
  testPin('ithaca', 42.444, -76.501),
  testPin('shop-a', 43.049, -76.15),
  testPin('shop-b', 43.0494, -76.1495),
  testPin('shop-c', 43.0486, -76.1504),
  testPin('shop-d', 43.0501, -76.1488),
  testPin('pair-a', 40.75, -73.99),
  testPin('pair-b', 40.7501, -73.99),
]).placed;
const realPins = [...boundaryPins(), ...shopRows];
const closestA = { ...cityA, id: 'closest-a', x: 20, y: 20 };
const closestB = { ...cityA, id: 'closest-b', x: 20 + CLOSEST_DISTINCT_PIN_UNITS, y: 20 };
const closestDiagonal = { ...cityA, id: 'closest-d', x: 20 + CLOSEST_DISTINCT_PIN_UNITS / Math.SQRT2, y: 20 + CLOSEST_DISTINCT_PIN_UNITS / Math.SQRT2 };
const stopsClear = mapStops.length > 0 && [390, 430, 768].every((svg) => mapStops.every((width) => rectsOverlap(hitRects(svg, width, realPins)) === false));
const floorSplits = [390, 430, 768].every((svg) => {
  const screen = { viewWidth: floorWidth, svgClientWidth: svg };
  const gap = mergeGap(floorWidth, svg);
  const shops = declutterPins([cityA, cityB], gap, screen);
  const shopBoxes = shops.singles.map((pin) => groupHitBox(1, pin.x, pin.y, floorWidth, svg));
  const along = declutterPins([closestA, closestB], gap, screen);
  const diagonal = declutterPins([closestA, closestDiagonal], gap, screen);
  const same = declutterPins([closestA, { ...closestA, id: 'closest-same' }], gap, screen);
  const alongBoxes = along.singles.map((pin) => groupHitBox(1, pin.x, pin.y, floorWidth, svg));
  const diagonalBoxes = diagonal.singles.map((pin) => groupHitBox(1, pin.x, pin.y, floorWidth, svg));
  return shops.singles.length === 2 && shops.clusters.length === 0 && shopBoxes.length === 2 && !boxesIntersect(shopBoxes[0], shopBoxes[1]) && along.singles.length === 2 && along.clusters.length === 0 && diagonal.singles.length === 2 && !boxesIntersect(alongBoxes[0], alongBoxes[1]) && !boxesIntersect(diagonalBoxes[0], diagonalBoxes[1]) && same.clusters.length === 1 && same.singles.length === 0;
});
let zoomCenter = { x: 120, y: 80, w: opening.w, h: opening.h };
const zoomCx = zoomCenter.x + zoomCenter.w / 2;
const zoomCy = zoomCenter.y + zoomCenter.h / 2;
let centerHeld = true;
for (let press = 0; press < zoomPresses(opening.w) + 2; press += 1) {
  const next = nextZoomView(zoomCenter, 1, opening);
  centerHeld = centerHeld && Math.abs(next.x + next.w / 2 - zoomCx) < 1e-6 && Math.abs(next.y + next.h / 2 - zoomCy) < 1e-6;
  if (Math.abs(next.w - zoomCenter.w) < 1e-6) centerHeld = centerHeld && next.x === zoomCenter.x && next.y === zoomCenter.y && next.h === zoomCenter.h;
  zoomCenter = next;
}
const back = nextZoomView(zoomCenter, -1, opening);
centerHeld = centerHeld && Math.abs(back.x + back.w / 2 - zoomCx) < 1e-6 && Math.abs(back.y + back.h / 2 - zoomCy) < 1e-6;
const frameWidths = [284, 314, 354, 316, 580, 1400];
const frameSplits = frameWidths.every((svg) => {
  const stops = zoomStops(opening.w, svg);
  const floor = stops[stops.length - 1];
  const screen = { viewWidth: floor, svgClientWidth: svg };
  const shops = declutterPins([cityA, cityB], mergeGap(floor, svg), screen);
  const boxes = shops.singles.map((pin) => groupHitBox(1, pin.x, pin.y, floor, svg));
  const clear = stops.every((width) => rectsOverlap(hitRects(svg, width, realPins)) === false);
  return stops[0] === opening.w && Math.abs(floor - minZoomWidth(opening.w, svg)) < 1e-6 && shops.singles.length === 2 && shops.clusters.length === 0 && boxes.length === 2 && !boxesIntersect(boxes[0], boxes[1]) && clear;
});
assert([390, 430, 768].every((svg) => rectsOverlap(hitRects(svg)) === false) && stopsClear && floorSplits && frameSplits && phoneFloorGap < storefrontSeparation() && Math.abs(minZoomWidth(opening.w, 390) - 0.14059686581934208) < 1e-9 && zoomPresses(opening.w, 390) === 12 && Math.abs(mergeGap(opening.w, 390) - Math.max(opening.w / 90 * 2.8, (44 / 390) * opening.w)) < 1e-6 && centerHeld, 'TEST ONLY: hit rects do not intersect at every zoom stop, and the 11 m pair splits at the deepest stop for each rendered map width');
assert(narrowMark.visible === 8 && narrowMark.target === 44 && phoneMark.target === 44 && tabletMark.target === 44 && wideMark.visible === 1440 / 90 && wideMark.target === 24 && zoomPresses(opening.w, 390) === 12 && mapUi.includes("touchAction: zoomed ? 'none' : 'pan-y'") && mapUi.includes('aria-label="Close"') && mapUi.includes('grid-cols-2') && mapUi.includes('hitAt') && mapUi.includes('max-md:fixed max-md:inset-x-4 max-md:w-auto') && mapUi.includes('break-all') && mapUi.includes('nextZoomView(current, direction, WHOLE, svgWidth)'), 'TEST ONLY: touch marks are at least 8px with a 44px target, and a click uses the nearest center');
assert(mapUi.includes('openDispensary(pin.id)') && mapUi.includes('openDispensary(row.id)') && mapUi.includes('onOpenAccount(cardId)') && mapUi.includes('Open record') && mapUi.includes('No contacts yet') && mapUi.includes('contactMailHref') && mapUi.includes('contactTelHref') && mapUi.includes('accounts/${encodeURIComponent(cardId)}') && mapUi.includes('accountId=${encodeURIComponent(cardId)}') && mapUi.includes('card=1') && mapUi.includes('/api/admin/crm/accounts?brand=') === false && mapUi.includes('aria-label="Close"'), 'TEST ONLY: a pin and a chip row open the dispensary card, and Open record uses the account handler');

const freshAt = new Date(Date.now()).toISOString();
const staleAt = new Date(Date.now() - PLACE_TTL_MS - 1000).toISOString();
const matchedCache: PlaceCache = { placeId: 'places/test', matchStatus: 'matched', fields: { name: 'TEST ONLY Shop', rating: 4, reviewCount: 2, hours: [], phone: null, website: null, mapsUrl: 'https://maps.google.com', photoName: null, photoCredits: [] }, fetchedAt: freshAt };
assert(placeReadPlan({ hasKey: false, query: '1 Test St, Buffalo, NY', cache: matchedCache, now: Date.now(), sells: true }).action === 'not_connected', 'TEST ONLY: a missing Google key is not connected');
assert(placeReadPlan({ hasKey: true, query: null, cache: null, now: Date.now(), sells: true }).action === 'no_address', 'TEST ONLY: an account without a street has no Google match');
const sellerRefresh = placeReadPlan({ hasKey: true, query: '1 Test St, Buffalo, NY', cache: null, now: Date.now(), sells: true });
assert(sellerRefresh.action === 'refresh' && sellerRefresh.action === 'refresh' && sellerRefresh.retain === 'details', 'TEST ONLY: an empty cache asks for one Google refresh');
const sellerFresh = placeReadPlan({ hasKey: true, query: '1 Test St, Buffalo, NY', cache: matchedCache, now: Date.now(), sells: true });
const sellerStale = placeReadPlan({ hasKey: true, query: '1 Test St, Buffalo, NY', cache: { ...matchedCache, fetchedAt: staleAt }, now: Date.now(), sells: true });
const prospectPlan = placeReadPlan({ hasKey: true, query: '1 Test St, Buffalo, NY', cache: matchedCache, now: Date.now(), sells: false });
assert(placeCacheFresh(freshAt, Date.now()) && placeCacheFresh(staleAt, Date.now()) === false && sellerFresh.action === 'use_cache' && sellerStale.action === 'refresh' && sellerStale.retain === 'details', 'TEST ONLY: a Google cache lasts seven days and then refreshes');
assert(storesPlaceDetails(['won']) && storesPlaceDetails(['proposal', 'won']) && storesPlaceDetails(['active']) === false && storesPlaceDetails(['prospect']) === false && storesPlaceDetails([]) === false && prospectPlan.action === 'refresh' && prospectPlan.retain === 'place_id' && retainPlaceCache(matchedCache, 'place_id').fields === null && retainPlaceCache(matchedCache, 'place_id').placeId === matchedCache.placeId && retainPlaceCache(matchedCache, 'details').fields?.name === 'TEST ONLY Shop' && storedPlaceCard({}) === null && storedPlaceCard({ name: null, photoName: null }) === null && shouldPurgePlaceDetails({ previousStage: 'won', nextStage: 'lost', remainingWon: false }) && shouldPurgePlaceDetails({ previousStage: 'won', nextStage: 'lost', remainingWon: true }) === false && shouldPurgePlaceDetails({ previousStage: 'proposal', nextStage: 'won', remainingWon: false }) === false, 'TEST ONLY: place details are stored only for a Won deal, and a prospect keeps the place id');
assert(placeQuery({ street: ' 1 Test St ', city: 'Buffalo' }) === '1 Test St, Buffalo, NY' && placeQuery({ street: ' ', city: 'Buffalo' }) === null, 'TEST ONLY: the Google query uses the stored street');
const calls: string[] = [];
const placeHit = await lookupPlace('1 Test St, Buffalo, NY', 'server-key', async (input, init) => {
  const href = String(input);
  calls.push(href);
  const header = new Headers(init?.headers);
  assert(header.get('X-Goog-Api-Key') === 'server-key' && calls.join(' ').includes('server-key') === false, 'TEST ONLY: the Google key stays on the request and out of the URL');
  const mask = header.get('X-Goog-FieldMask') || '';
  assert(mask.includes('places.displayName') && mask.includes('places.photos') && mask.includes('places.nationalPhoneNumber'), 'TEST ONLY: one text search asks for every displayed field');
  return new Response(JSON.stringify({ places: [{ id: 'ChIJtest', displayName: { text: 'TEST ONLY Shop' }, rating: 4.2, userRatingCount: 3, nationalPhoneNumber: '555', websiteUri: 'https://test.only', googleMapsUri: 'https://maps.google.com', photos: [{ name: 'places/ChIJtest/photos/abc', authorAttributions: [{ displayName: 'Ada' }] }] }] }), { status: 200 });
});
assert(placeHit?.placeId === 'ChIJtest' && placeHit.card.name === 'TEST ONLY Shop' && placeHit.card.photoCredits[0] === 'Ada' && placeHit.card.photoName === 'places/ChIJtest/photos/abc' && calls.length === 1, 'TEST ONLY: a Google match is one text search');
const none = await lookupPlace('1 Test St, Buffalo, NY', 'server-key', async () => new Response(JSON.stringify({ places: [] }), { status: 200 }));
assert(none === null, 'TEST ONLY: an empty Google search is no match');
const photoCalls: string[] = [];
const publicLookup: PhotoLookup = async () => [{ address: '142.250.190.78', family: 4 }];
const blockedPhoto = await readPlacePhoto('https://127.0.0.1/secret', 'server-key', { lookup: publicLookup, request: async (url) => { photoCalls.push(url); return new Response('no'); } });
const metadataPhoto = await readPlacePhoto('places/ok/photos/pic', 'server-key', {
  lookup: publicLookup,
  request: async (url) => {
    photoCalls.push(url);
    if (url.includes('places.googleapis.com')) return new Response(JSON.stringify({ photoUri: 'https://169.254.169.254/latest' }), { status: 200 });
    return new Response('secret', { status: 200 });
  },
});
const httpPhoto = allowedPhotoUrl('http://lh3.googleusercontent.com/a');
const localPhoto = allowedPhotoUrl('https://127.0.0.1/latest');
const metaPhoto = allowedPhotoUrl('https://169.254.169.254/latest');
const metaV6 = allowedPhotoUrl('https://[fd00:ec2::254]/latest');
const badName = photoMediaUrl('places/../photos/secret');
const goodName = photoMediaUrl('places/ChIJtest/photos/abc');
const redirected = await fetchAllowedPhoto('https://lh3.googleusercontent.com/a', {
  lookup: publicLookup,
  request: async (url) => {
    photoCalls.push(url);
    if (url.includes('googleusercontent.com')) return new Response(null, { status: 302, headers: { location: 'http://169.254.170.2/meta' } });
    return new Response('secret', { status: 200 });
  },
});
const pinned: string[] = [];
const privatePhoto = async (address: string) => fetchAllowedPhoto('https://lh3.googleusercontent.com/a', {
  lookup: async () => [{ address, family: address.includes(':') ? 6 : 4 }],
  request: async (_url, resolved) => { pinned.push(resolved); return new Response('secret', { status: 200 }); },
});
const keptPrivate = await Promise.all(['127.0.0.1', '10.1.2.3', '192.168.1.1', '172.16.4.4', '169.254.169.254', '0.1.2.3', '::1', 'fe80::1', 'fd00:ec2::254', '::ffff:127.0.0.1', '::ffff:8.8.8.8'].map((address) => privatePhoto(address)));
const mixedDns = await fetchAllowedPhoto('https://lh3.googleusercontent.com/a', {
  lookup: async () => [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }],
  request: async (_url, resolved) => { pinned.push(resolved); return new Response('secret', { status: 200 }); },
});
const publicPhoto = await fetchAllowedPhoto('https://lh3.googleusercontent.com/a', {
  lookup: async () => [{ address: '142.250.190.78', family: 4 }, { address: '2001:4860:4802:32::78', family: 6 }],
  request: async (_url, resolved) => { pinned.push(resolved); return new Response('ok', { status: 200 }); },
});
const hopCalls: string[] = [];
const privateHop = await fetchAllowedPhoto('https://lh3.googleusercontent.com/a', {
  lookup: async (host) => [{ address: host.startsWith('lh3') ? '142.250.190.78' : '10.0.0.8', family: 4 }],
  request: async (url, resolved) => { hopCalls.push(`${resolved} ${url}`); return new Response(null, { status: 302, headers: { location: 'https://lh4.googleusercontent.com/b' } }); },
});
const followed = await fetchAllowedPhoto('https://lh3.googleusercontent.com/a', {
  lookup: async (host) => [{ address: host.startsWith('lh3') ? '142.250.190.78' : '142.250.190.79', family: 4 }],
  request: async (_url, resolved) => {
    hopCalls.push(resolved);
    if (resolved === '142.250.190.78') return new Response(null, { status: 302, headers: { location: 'https://lh4.googleusercontent.com/b' } });
    return new Response('img', { status: 200 });
  },
});
assert(blockedPhoto === null && metadataPhoto === null && httpPhoto === null && localPhoto === null && metaPhoto === null && metaV6 === null && badName === null && goodName === `https://places.googleapis.com/v1/places/ChIJtest/photos/abc/media?maxHeightPx=${PHOTO_MAX_HEIGHT_PX}&maxWidthPx=${PHOTO_MAX_WIDTH_PX}&skipHttpRedirect=true` && redirected === null && photoCalls.some((href) => href.includes('169.254')) === false && photoCalls.some((href) => href.includes('127.0.0.1')) === false, 'TEST ONLY: a photo name and a photo URL stay on Google hosts');
const specialUse = ['100.64.1.1', '100.127.255.255', '0.1.2.3', '192.0.0.1', '192.0.2.1', '192.88.99.1', '192.31.196.1', '192.52.193.1', '198.18.0.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '240.0.0.1', '255.255.255.255', '64:ff9b::8.8.8.8', '64:ff9b:1::1', '2002:0808:0808::', '2001:0:4136:e378:8000:63bf:3fff:fdd2', '::8.8.8.8', '::ffff:8.8.8.8', 'fec0::1', '3fff::1', '5f00::1'];
const specialBlocked = await Promise.all(specialUse.map((address) => privatePhoto(address)));
const photoRoute = readFileSync('src/app/api/admin/crm/places/photo/route.ts', 'utf8');
const photoCallsForImage: string[] = [];
const jpeg = await readPlacePhoto('places/ok/photos/pic', 'server-key', {
  lookup: publicLookup,
  request: async (url) => {
    photoCallsForImage.push(url);
    if (url.includes('places.googleapis.com')) return new Response(JSON.stringify({ photoUri: 'https://lh3.googleusercontent.com/a' }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } });
  },
});
const htmlPhoto = await readPlacePhoto('places/ok/photos/pic', 'server-key', {
  lookup: publicLookup,
  request: async (url) => url.includes('places.googleapis.com')
    ? new Response(JSON.stringify({ photoUri: 'https://lh3.googleusercontent.com/a' }), { status: 200, headers: { 'content-type': 'application/json' } })
    : new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }),
});
const hugePhoto = await readPlacePhoto('places/ok/photos/pic', 'server-key', {
  lookup: publicLookup,
  request: async (url) => url.includes('places.googleapis.com')
    ? new Response(JSON.stringify({ photoUri: 'https://lh3.googleusercontent.com/a' }), { status: 200, headers: { 'content-type': 'application/json' } })
    : new Response(new Uint8Array([1]), { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': '99999999' } }),
});
const cappedPhoto = await readPlacePhoto('places/ok/photos/pic', 'server-key', {
  lookup: publicLookup,
  maxBytes: 4,
  request: async (url) => url.includes('places.googleapis.com')
    ? new Response(JSON.stringify({ photoUri: 'https://lh3.googleusercontent.com/a' }), { status: 200, headers: { 'content-type': 'application/json' } })
    : new Response(new Uint8Array(8), { status: 200, headers: { 'content-type': 'image/png' } }),
});
const slowPhoto = await readPlacePhoto('places/ok/photos/pic', 'server-key', {
  lookup: publicLookup,
  timeoutMs: 20,
  request: (_url, _address, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  }),
});
assert(keptPrivate.every((row) => row === null) && specialBlocked.every((row) => row === null) && specialUse.every((address) => photoAddressAllowed(address) === false) && mixedDns === null && pinned.join(',') === '142.250.190.78' && photoAddressAllowed('8.8.8.8') && photoAddressAllowed('100.63.255.255') && photoAddressAllowed('2001:4860:4802:32::78') && privateHop === null && hopCalls[0] === '142.250.190.78 https://lh3.googleusercontent.com/a' && hopCalls[1] === '142.250.190.78' && hopCalls[2] === '142.250.190.79' && (await followed?.text()) === 'img', 'TEST ONLY: a photo connects only to a checked public address, including each redirect hop');
const svgPhoto = await readPlacePhoto('places/ok/photos/pic', 'server-key', {
  lookup: publicLookup,
  request: async (url) => url.includes('places.googleapis.com')
    ? new Response(JSON.stringify({ photoUri: 'https://lh3.googleusercontent.com/a' }), { status: 200, headers: { 'content-type': 'application/json' } })
    : new Response('<svg>', { status: 200, headers: { 'content-type': 'image/svg+xml' } }),
});
const bin = collectCapped(4);
const cappedPush = bin.push(Buffer.from('ab')) && bin.push(Buffer.from('cd')) && bin.push(Buffer.from('e')) === false && bin.concat().toString() === 'abcd';
const cardUi = readFileSync('src/app/admin/crm/GooglePlaceCard.tsx', 'utf8');
const placeStore = readFileSync('src/lib/crm/store.ts', 'utf8');
const stripped = placeCardOnly({ name: 'TEST ONLY', rating: 4, reviewCount: 2, hours: ['Mon'], phone: null, website: null, mapsUrl: null, photoName: 'places/ChIJtest/photos/abc', photoCredits: [], photoBytes: 'aaaa', photoContentType: 'image/jpeg' } as PlaceCache['fields']);
assert(jpeg?.contentType === 'image/jpeg' && jpeg.bytes.byteLength === 3 && photoCallsForImage.length === 2 && photoCallsForImage.every((url) => url.includes('searchText') === false) && htmlPhoto === null && hugePhoto === null && cappedPhoto === null && slowPhoto === null && svgPhoto === null && photoRoute.includes('authorizePlacePhoto') && photoRoute.includes('readPlaceCache') && photoRoute.includes('sharePhotoLoad') && photoRoute.includes('findStoredPlacePhoto') && photoRoute.indexOf('findStoredPlacePhoto') < photoRoute.indexOf('readPlacePhoto') && photoRoute.includes('accountHasWonDeal') && photoRoute.includes('savePlaceCache') === false && photoRoute.includes('photoBytes') === false && photoRoute.includes('lookupPlace') === false && photoRoute.includes('searchText') === false && photoRoute.includes('createSignedUrl') === false && photoRoute.includes('getPublicUrl') === false && photoRoute.includes('photoResponseHeaders(photo.contentType)') && photoRoute.includes('photoResponseHeaders(photo.contentType,') === false && photoRoute.includes('no-store') === false && photoRoute.includes('immutable') === false && photoRoute.includes('s-maxage') === false && /etag/i.test(photoRoute) === false, 'TEST ONLY: a stored photo is served before Google, and the route does not publish a photo URL');
const photoHeaders = photoResponseHeaders('image/jpeg');
const photoHeaderNames = Object.keys(photoHeaders).map((name) => name.toLowerCase());
const photoA = stablePhotoUrl('acct-1', 'places/ChIJtest/photos/abc');
const photoAAgain = stablePhotoUrl('acct-1', 'places/ChIJtest/photos/abc');
const photoB = stablePhotoUrl('acct-1', 'places/ChIJtest/photos/def');
const cacheControl = photoHeaders['cache-control'];
assert(PHOTO_CACHE_CONTROL === 'private, max-age=3600' && cacheControl === 'private, max-age=3600' && photoHeaders['content-type'] === 'image/jpeg' && photoHeaders['x-content-type-options'] === 'nosniff' && cacheControl.includes('no-store') === false && cacheControl.includes('public') === false && cacheControl.includes('s-maxage') === false && cacheControl.includes('immutable') === false && photoHeaderNames.includes('etag') === false && storesPlaceDetails(['won']) && storesPlaceDetails(['proposal']) === false && photoA === photoAAgain && photoA !== photoB && photoA?.includes('view=') === false && photoA?.includes('photo=places') === true && cardUi.includes('src={card.photoUrl}') && cardUi.includes('freshPhotoSrc') === false && cardUi.includes('randomUUID') === false, 'TEST ONLY: every dispensary photo uses a one hour private cache and a stable photo URL, and place details stay on the Won rule');
let namedFetches = 0;
const namedPhoto = await currentPhotoName({ sells: false, cache: null, query: '1 Test St, Buffalo, NY', now: Date.now(), key: 'server-key', photoName: 'places/ChIJtest/photos/abc', fetchImpl: async () => { namedFetches += 1; return new Response('no', { status: 500 }); } });
const rejectedPhotoName = await currentPhotoName({ sells: false, cache: null, query: '1 Test St, Buffalo, NY', now: Date.now(), key: 'server-key', photoName: 'not-a-photo', fetchImpl: async () => new Response(JSON.stringify({ places: [] }), { status: 200 }) });
assert(namedPhoto === 'places/ChIJtest/photos/abc' && namedFetches === 0 && rejectedPhotoName === null, 'TEST ONLY: a validated photo name skips Place Details');
const photoObjectName = 'places/ChIJtest/photos/abc';
const photoObjectPath = placePhotoObjectPath('ChIJtest', photoObjectName, 'image/jpeg');
const photoObjectSha = createHash('sha256').update(photoObjectName).digest('hex');
const storedBytes = new Uint8Array([9, 8, 7]);
let googleReads = 0;
let uploads = 0;
const uploadLogs: string[] = [];
const firstStored = await loadStoredOrGooglePhoto({
  stored: null,
  readGoogle: async () => { googleReads += 1; return { bytes: storedBytes, contentType: 'image/jpeg' }; },
  upload: async () => { uploads += 1; return true; },
  log: (message) => uploadLogs.push(message),
});
const secondStored = await loadStoredOrGooglePhoto({
  stored: { bytes: storedBytes, contentType: 'image/jpeg' },
  readGoogle: async () => { googleReads += 1; return { bytes: new Uint8Array([1]), contentType: 'image/jpeg' }; },
  upload: async () => { uploads += 1; return true; },
  log: (message) => uploadLogs.push(message),
});
const failedUpload = await loadStoredOrGooglePhoto({
  stored: null,
  readGoogle: async () => ({ bytes: storedBytes, contentType: 'image/jpeg' }),
  upload: async () => { throw new Error('bucket down'); },
  log: (message) => uploadLogs.push(message),
});
const photoBucket = readFileSync('src/lib/crm/placePhotoBucket.ts', 'utf8');
const placeSource = readFileSync('src/lib/crm/places.ts', 'utf8');
let nonWonGoogle = 0;
const nonWonKept = serveStoredPhoto({ bytes: storedBytes, contentType: 'image/jpeg' });
const nonWonServed = await loadStoredOrGooglePhoto({
  stored: nonWonKept,
  readGoogle: async () => { nonWonGoogle += 1; return { bytes: new Uint8Array([4]), contentType: 'image/jpeg' }; },
  upload: async () => true,
  log: () => undefined,
});
const photoGet = photoRoute.slice(photoRoute.indexOf('export async function GET'));
const purgeBody = placeStore.slice(placeStore.indexOf('async purgePlaceDetails'), placeStore.indexOf('async clearPlaceDetailsIfNotSelling'));
assert(storesPlaceDetails(['proposal']) === false && nonWonKept?.bytes[0] === 9 && nonWonServed?.bytes[0] === 9 && nonWonGoogle === 0 && photoGet.indexOf('serveStoredPhoto') < photoGet.indexOf('accountHasWonDeal') && photoGet.includes('not gated on a Won deal') && purgeBody.includes('removeStoredPlacePhotos') === false && purgeBody.includes('fields: {}') && placeStore.includes('leaving Won clears cached place details only') && placeStore.includes('removeStoredPlacePhotos(previousPlaceId)') && placeStore.includes('await this.removePhotosForAccount(accountId)'), 'TEST ONLY: a non-Won store keeps serving its stored photo, and leaving Won does not delete it');
assert(photoObjectPath === `ChIJtest/${photoObjectSha}.jpg` && placePhotoObjectPath('ChIJtest', photoObjectName, 'image/png')?.endsWith('.png') === true && placePhotoObjectPath('ChIJtest', photoObjectName, 'image/webp')?.endsWith('.webp') === true && placePhotoObjectPath('ChIJtest', photoObjectName, 'image/gif') === null && firstStored?.bytes[0] === 9 && secondStored?.bytes[0] === 9 && googleReads === 1 && uploads === 1 && failedUpload?.bytes[0] === 9 && uploadLogs.length === 1 && photoBucket.includes('from(PLACE_PHOTO_BUCKET)') && photoBucket.includes('createSignedUrl') === false && photoBucket.includes('getPublicUrl') === false && photoBucket.includes('FIELD_BUCKET') === false && photoBucket.includes('COA_BUCKET') === false && placeSource.includes("PLACE_PHOTO_BUCKET = 'crm-place-photos'") && placeStore.includes('previousPlaceId !== cache.placeId') && placeStore.includes('removeStoredPlacePhotos(previousPlaceId)') && placeStore.includes('await this.removePhotosForAccount(accountId)'), 'TEST ONLY: the first photo is stored, a later view skips Google, and a failed upload still returns the bytes');
let sharedPlaceFetches = 0;
const sharedPlace = async () => {
  sharedPlaceFetches += 1;
  await new Promise((resolve) => setTimeout(resolve, 20));
  return new Response(JSON.stringify({ places: [{ id: 'ChIJshared', displayName: { text: 'Shared' } }] }), { status: 200 });
};
const [sharedA, sharedB] = await Promise.all([
  lookupPlace('1 Shared St, Buffalo, NY', 'server-key', sharedPlace),
  lookupPlace('1 Shared St, Buffalo, NY', 'server-key', sharedPlace),
]);
let timedOut = false;
try {
  await lookupPlace('1 Slow St, Buffalo, NY', 'server-key', (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  }), 20);
} catch {
  timedOut = true;
}
assert(sharedPlaceFetches === 1 && sharedA?.placeId === 'ChIJshared' && sharedB?.placeId === 'ChIJshared' && timedOut, 'TEST ONLY: identical place searches share one call and time out after the photo limit');
assert(imageType('image/svg+xml') === null && imageType('image/bmp') === null && imageType('image/jpeg') === 'image/jpeg' && imageType('image/png') === 'image/png' && imageType('image/webp') === 'image/webp' && imageType('image/gif') === 'image/gif' && cappedPush && PHOTO_MAX_BYTES === 524288 && stripped?.photoName === 'places/ChIJtest/photos/abc' && stripped && !('photoBytes' in stripped) && !('photoContentType' in stripped) && placeStore.includes('photo_name:fields->photoName') && placeStore.includes('photoBytes') === false && cardUi.includes('h-auto max-h-48 w-auto max-w-full self-start object-contain'), 'TEST ONLY: the card read omits photo bytes, SVG is refused, and the cap is 512 KB');
let sharedReads = 0;
const sharedRead = () => new Promise<{ bytes: ArrayBuffer; contentType: string }>((resolve) => {
  sharedReads += 1;
  setTimeout(() => resolve({ bytes: Uint8Array.from([4, 5]).buffer, contentType: 'image/jpeg' }), 30);
});
const [leftPhoto, rightPhoto] = await Promise.all([
  sharePhotoLoad('test-only-account', sharedRead),
  sharePhotoLoad('test-only-account', sharedRead),
]);
const laterPhoto = await sharePhotoLoad('test-only-account', sharedRead);
assert(sharedReads === 2 && leftPhoto?.bytes.byteLength === 2 && rightPhoto?.bytes.byteLength === 2 && laterPhoto?.bytes.byteLength === 2, 'TEST ONLY: simultaneous photo views share one fetch and nothing is kept after it ends');
const tlsDir = mkdtempSync(join(tmpdir(), 'cg-photo-tls-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-keyout', join(tlsDir, 'key.pem'), '-out', join(tlsDir, 'cert.pem'), '-days', '1', '-nodes', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
const tlsKey = readFileSync(join(tlsDir, 'key.pem'));
const tlsCert = readFileSync(join(tlsDir, 'cert.pem'));
const tlsServer = createServer({ key: tlsKey, cert: tlsCert }, (req, res) => {
  res.on('error', () => undefined);
  res.setHeader('content-type', 'image/jpeg');
  if (req.url === '/small') {
    res.end(Buffer.from([1, 2, 3, 4]));
    return;
  }
  const chunk = Buffer.alloc(64 * 1024, 7);
  let sent = 0;
  const goal = PHOTO_MAX_BYTES + 1;
  const write = () => {
    if (res.destroyed) return;
    while (sent < goal) {
      const size = Math.min(chunk.length, goal - sent);
      if (!res.write(chunk.subarray(0, size))) {
        sent += size;
        res.once('drain', write);
        return;
      }
      sent += size;
    }
    res.end();
  };
  write();
});
await new Promise<void>((resolve) => tlsServer.listen(0, '127.0.0.1', () => resolve()));
const tlsPort = (tlsServer.address() as { port: number }).port;
let smallOk = false;
let cappedOk = false;
try {
  const small = await pinnedPhotoRequest(`https://127.0.0.1:${tlsPort}/small`, '127.0.0.1', { ca: tlsCert.toString() });
  const smallBytes = new Uint8Array(await small.arrayBuffer());
  smallOk = small.status === 200 && smallBytes.length === 4 && smallBytes[0] === 1;
  try {
    await pinnedPhotoRequest(`https://127.0.0.1:${tlsPort}/big`, '127.0.0.1', { ca: tlsCert.toString() });
  } catch (error) {
    cappedOk = error instanceof Error && error.message === 'photo too large';
  }
} finally {
  tlsServer.close();
}
assert(smallOk && cappedOk && photoAddressAllowed('3fff:1000::1') && photoAddressAllowed('5f01::1'), 'TEST ONLY: a pinned https request reads a small image and stops a stream past 512 KB');
assert(browserLink('https://maps.google.com/a') === 'https://maps.google.com/a' && browserLink('http://shop.test') === 'http://shop.test/' && browserLink('javascript:alert(1)') === null && browserLink('data:text/html,hi') === null && browserLink('ftp://files.test') === null, 'TEST ONLY: a Google card link is only http or https');
const photoCache: PlaceCache = { ...matchedCache, fields: { ...matchedCache.fields!, photoName: 'places/ChIJold/photos/old' } };
const stalePhoto = { ...photoCache, fetchedAt: staleAt };
let livePhotoHits = 0;
const livePhotoName = await currentPhotoName({
  sells: true,
  cache: stalePhoto,
  query: '1 Test St, Buffalo, NY',
  now: Date.now(),
  key: 'server-key',
  fetchImpl: async (input) => {
    livePhotoHits += 1;
    const href = String(input);
    assert(href.includes('searchText') === false && href.includes('/places/ChIJold') === false && href.endsWith('/places/places%2Ftest') === false, 'TEST ONLY: a stale photo does not reuse the stored photo name');
    return new Response(JSON.stringify({ id: 'ChIJlive', displayName: { text: 'LIVE' }, photos: [{ name: 'places/ChIJlive/photos/new' }] }), { status: 200 });
  },
});
const freshPhotoName = await currentPhotoName({ sells: true, cache: photoCache, query: '1 Test St, Buffalo, NY', now: Date.now(), key: 'server-key', fetchImpl: async () => { livePhotoHits += 1; return new Response('no', { status: 500 }); } });
const missedPhotoName = await currentPhotoName({ sells: true, cache: stalePhoto, query: '1 Test St, Buffalo, NY', now: Date.now(), key: 'server-key', fetchImpl: async () => new Response('no', { status: 500 }) });
const unsoldPhotoName = await currentPhotoName({ sells: false, cache: photoCache, query: '1 Test St, Buffalo, NY', now: Date.now(), key: 'server-key', fetchImpl: async () => new Response(JSON.stringify({ id: 'ChIJlive', photos: [{ name: 'places/ChIJlive/photos/new' }] }), { status: 200 }) });
assert(cachedPhotoName({ sells: true, cache: photoCache, now: Date.now() }) === 'places/ChIJold/photos/old' && cachedPhotoName({ sells: true, cache: stalePhoto, now: Date.now() }) === null && cachedPhotoName({ sells: false, cache: photoCache, now: Date.now() }) === null && livePhotoName === 'places/ChIJlive/photos/new' && freshPhotoName === 'places/ChIJold/photos/old' && livePhotoHits === 1 && missedPhotoName === null && unsoldPhotoName === 'places/ChIJlive/photos/new', 'TEST ONLY: a photo uses a fresh Won cache and otherwise loads the current Google photo');
const previousFetch = globalThis.fetch;
const previousPlacesKey = process.env.GOOGLE_PLACES_API_KEY;
const savedPlaces: PlaceCache[] = [];
let placeSells = false;
const sellingStore = {
  readAccount: async () => ({ state: 'ok' as const, value: { accountType: 'adult_use_dispensary', street: '1 Test St', city: 'Buffalo', status: 'prospect' } as Account }),
  accountHasWonDeal: async () => ({ state: 'ok' as const, value: placeSells }),
  readPlaceCache: async () => ({ state: 'ok' as const, value: photoCache }),
  savePlaceCache: async (_brand: 'cedargrowth', _accountId: string, cache: PlaceCache) => {
    savedPlaces.push(cache);
    return { state: 'ok' as const, value: cache };
  },
} as unknown as CrmStore;
process.env.GOOGLE_PLACES_API_KEY = 'server-key';
globalThis.fetch = (async () => new Response(JSON.stringify({ id: 'ChIJlive', displayName: { text: 'LIVE SHOP' }, rating: 5, photos: [{ name: 'places/ChIJlive/photos/new' }] }), { status: 200 })) as typeof fetch;
try {
  const prospectView = await handleGooglePlace({ actorId: 'sales-1', grants: salesGrant, request: crmReq('GET', '/api/admin/crm/places?brand=cedargrowth&accountId=00000000-0000-4000-8000-000000000031'), store: sellingStore });
  placeSells = true;
  const sellerView = await handleGooglePlace({ actorId: 'sales-1', grants: salesGrant, request: crmReq('GET', '/api/admin/crm/places?brand=cedargrowth&accountId=00000000-0000-4000-8000-000000000031'), store: sellingStore });
  delete process.env.GOOGLE_PLACES_API_KEY;
  const offlineView = await handleGooglePlace({ actorId: 'sales-1', grants: salesGrant, request: crmReq('GET', '/api/admin/crm/places?brand=cedargrowth&accountId=00000000-0000-4000-8000-000000000031'), store: sellingStore });
  const prospectCard = prospectView.body.card as { name?: string } | undefined;
  const sellerCard = sellerView.body.card as { name?: string } | undefined;
  assert(prospectView.status === 200 && prospectView.body.state === 'matched' && prospectCard?.name === 'LIVE SHOP' && savedPlaces.length === 1 && savedPlaces[0]?.fields === null && savedPlaces[0]?.placeId === 'ChIJlive' && sellerView.status === 200 && sellerCard?.name === 'TEST ONLY Shop' && offlineView.body.state === 'not_connected', 'TEST ONLY: a prospect stores only the place id, a Won deal uses its cache, and no key stays not connected');
} finally {
  globalThis.fetch = previousFetch;
  if (previousPlacesKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
  else process.env.GOOGLE_PLACES_API_KEY = previousPlacesKey;
}
const world: LicenseWorld = {
  accounts: [
    { id: 'won', brand: 'cedargrowth', accountType: 'adult_use_dispensary', licenseRef: ' OCM-123 ' },
    { id: 'dup', brand: 'cedargrowth', accountType: 'adult_use_dispensary', licenseRef: 'ocm-123' },
    { id: 'punct', brand: 'cedargrowth', accountType: 'adult_use_dispensary', licenseRef: 'OCM 123' },
    { id: 'blank', brand: 'cedargrowth', accountType: 'adult_use_dispensary', licenseRef: '   ' },
    { id: 'bond', brand: 'bond', accountType: 'adult_use_dispensary', licenseRef: 'ocm-123' },
    { id: 'dist', brand: 'cedargrowth', accountType: 'distributor', licenseRef: 'ocm-123' },
    { id: 'other', brand: 'cedargrowth', accountType: 'processor', licenseRef: 'ocm-123' },
  ],
  contacts: [
    { id: 'on-won', brand: 'cedargrowth', accountId: 'won' },
    { id: 'from-dup', brand: 'cedargrowth', accountId: 'dup' },
    { id: 'from-punct', brand: 'cedargrowth', accountId: 'punct' },
    { id: 'from-blank', brand: 'cedargrowth', accountId: 'blank' },
    { id: 'from-bond', brand: 'bond', accountId: 'bond' },
    { id: 'from-dist', brand: 'cedargrowth', accountId: 'dist' },
    { id: 'from-other', brand: 'cedargrowth', accountId: 'other' },
  ],
  merges: [],
  notes: [{ id: 'note-1', accountId: 'dup' }],
};
const wonCreated = applyWonMerge(world, { opportunityId: 'deal-1', accountId: 'won', actor: 'gary@cedargrowthco.com', now: freshAt, stage: 'won' });
const again = applyWonMerge(wonCreated.world, { opportunityId: 'deal-1', accountId: 'won', actor: 'gary@cedargrowthco.com', now: staleAt, stage: 'won' });
const undone = undoWonMerge(wonCreated.world, wonCreated.world.merges[0]?.id || '', 'gary@cedargrowthco.com', staleAt);
const notWon = applyWonMerge(world, { opportunityId: 'deal-lead', accountId: 'won', actor: 'gary@cedargrowthco.com', now: freshAt, stage: 'lead' });
const distributor = applyWonMerge(world, { opportunityId: 'deal-dist', accountId: 'dist', actor: 'gary@cedargrowthco.com', now: freshAt, stage: 'won' });
const blankWon = applyWonMerge({ ...world, accounts: world.accounts.map((row) => row.id === 'won' ? { ...row, licenseRef: '' } : row) }, { opportunityId: 'deal-blank', accountId: 'won', actor: 'gary@cedargrowthco.com', now: freshAt, stage: 'won' });
const gone = undoWonMerge({ ...wonCreated.world, accounts: wonCreated.world.accounts.filter((row) => row.id !== 'dup') }, wonCreated.world.merges[0]?.id || '', 'gary@cedargrowthco.com', staleAt);
const moved = (id: string, rows = wonCreated.world.contacts) => rows.find((row) => row.id === id)?.accountId;
assert(wonCreated.code === 'merged' && moved('from-dup') === 'won' && moved('on-won') === 'won' && moved('from-punct') === 'punct' && moved('from-blank') === 'blank' && moved('from-bond') === 'bond' && moved('from-dist') === 'dist' && moved('from-other') === 'other' && wonCreated.world.notes[0]?.accountId === 'dup' && wonCreated.world.merges[0]?.priors[0]?.priorAccountId === 'dup', 'TEST ONLY: the same license with different spacing and case moves that contact, and punctuation, a blank license, Bond, a distributor, and another account type stay put');
assert(again.code === 'already' && again.world.merges.length === 1 && again.world.contacts.find((row) => row.id === 'from-dup')?.accountId === 'won', 'TEST ONLY: a second won on the same open merge does nothing');
assert(undone.refused.length === 0 && undone.reassigned.length === 0 && undone.world.contacts.find((row) => row.id === 'from-dup')?.accountId === 'dup' && undone.world.merges[0]?.undoneAt === staleAt && undone.world.merges[0]?.undoneBy === 'gary@cedargrowthco.com', 'TEST ONLY: undo restores each prior account id');
const movedAway = { ...wonCreated.world, contacts: wonCreated.world.contacts.map((row) => row.id === 'from-dup' ? { ...row, accountId: 'punct' } : row) };
const kept = undoWonMerge(movedAway, wonCreated.world.merges[0]?.id || '', 'gary@cedargrowthco.com', staleAt);
assert(kept.reassigned.join(',') === 'from-dup' && kept.refused.length === 0 && kept.world.contacts.find((row) => row.id === 'from-dup')?.accountId === 'punct' && kept.world.merges[0]?.reassignedIds.join(',') === 'from-dup' && kept.world.merges[0]?.undoneAt === staleAt, 'TEST ONLY: undo skips a contact that was reassigned and records it on the audit');
assert(notWon.code === 'not_won' && notWon.world.merges.length === 0 && distributor.code === 'skipped' && distributor.world.merges.length === 0 && blankWon.code === 'merged' && blankWon.world.merges[0]?.contactIds.length === 0 && blankWon.world.contacts.every((row) => row.accountId !== 'won' || row.id === 'on-won'), 'TEST ONLY: a lead does not merge, a distributor does not merge, and a blank license records that nothing moved');
assert(gone.refused.join(',') === 'from-dup' && gone.world.contacts.find((row) => row.id === 'from-dup')?.accountId === 'won' && gone.world.merges[0]?.undoneAt === staleAt, 'TEST ONLY: undo refuses a contact whose prior account is gone and reports it');
const storeSrc = readFileSync('src/lib/crm/store.ts', 'utf8');
const mergeSql = readFileSync('supabase/migrations/0136_crm_google_places.sql', 'utf8');
const createOpp = storeSrc.slice(storeSrc.indexOf('async createOpportunity'), storeSrc.indexOf('async updateOpportunity'));
const updateOpp = storeSrc.slice(storeSrc.indexOf('async updateOpportunity'), storeSrc.indexOf('private async mergeWonContacts'));
const orderWon = storeSrc.slice(storeSrc.indexOf('async markDealWonFromOrder'), storeSrc.indexOf('async listStageEvents'));
assert(createOpp.includes('wonMergeOnSave') && createOpp.includes('mergeWonContacts') && updateOpp.includes('previousStage') && updateOpp.includes('wonMergeOnSave') && orderWon.includes("stage: 'won'") && storeSrc.includes("console.error('crm won merge failed'") && storeSrc.includes('mergeFailed') && storeSrc.includes('crm_merge_won_distribution') && wonMergeOnSave({ brand: 'cedargrowth', creating: true, nextStage: 'won', previousStage: null }) && wonMergeOnSave({ brand: 'cedargrowth', creating: false, nextStage: 'won', previousStage: 'proposal' }) && wonMergeOnSave({ brand: 'cedargrowth', creating: false, nextStage: 'won', previousStage: 'won' }) === false && wonMergeOnSave({ brand: 'bond', creating: true, nextStage: 'won', previousStage: null }) === false && isDispensaryAccount('adult_use_dispensary') && isDispensaryAccount('microbusiness') && isDispensaryAccount('registered_organization') && isDispensaryAccount('distributor') === false, 'TEST ONLY: a new Won merges, a failed merge is reported, and resending Won after Undo does not merge again');
assert(mergeSql.includes("lower(btrim(a.license_ref)) = v_key") && mergeSql.includes("v_key <> ''") && mergeSql.includes("a.brand = 'cedargrowth'") && mergeSql.includes("a.account_type in ('adult_use_dispensary', 'microbusiness', 'registered_organization')") && mergeSql.includes('for update') && mergeSql.includes('crm_notes') === false && mergeSql.includes('crm_tasks') === false && mergeSql.includes('crm_distributor_orders') === false, 'TEST ONLY: the migration matches a dispensary source license by trim and lowercase in one transaction and does not move notes, tasks, or orders');
assert(mergeSql.includes('drop trigger if exists crm_distribution_merges_append_only on public.crm_distribution_merges') && mergeSql.includes('create unique index if not exists') && mergeSql.includes('create or replace function') && mergeSql.includes('create policy') === false && mergeSql.includes('set search_path = public') === false && mergeSql.includes('pg_catalog.now()'), 'TEST ONLY: 0136 can be applied again, and guard_contact uses pg_catalog');
const rollbackSql = readFileSync('scripts/crm-rollback-0136.sql', 'utf8');
const rlsCheckSql = readFileSync('scripts/crm-check-0136-rls.sql', 'utf8');
const importSrc = readFileSync('src/lib/crm/handlers.ts', 'utf8');
assert(rollbackSql.includes('drop table if exists public.crm_google_places') && rollbackSql.includes('drop table if exists public.crm_distribution_merges') && rollbackSql.includes('drop function if exists public.crm_merge_won_distribution(uuid, text)') && rollbackSql.includes('drop function if exists public.crm_undo_distribution_merge(uuid, text, timestamptz)') && rollbackSql.includes('drop function if exists public.crm_guard_distribution_merge()') && rollbackSql.includes('drop table if exists public.crm_accounts') === false && rollbackSql.includes('create or replace function crm_private.guard_contact()') && rollbackSql.includes('The crm-place-photos bucket and its objects stay') && rollbackSql.toLowerCase().includes('delete from storage') === false && rlsCheckSql.includes('rolbypassrls') && rlsCheckSql.includes('Do not apply 0136 as this role') && importSrc.includes('clearPlaceDetailsIfNotSelling'), 'TEST ONLY: the 0136 rollback drops only the new objects, leaves the photo bucket, and the pre-apply check requires bypassrls');
assert(mergeSql.includes('insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)') && mergeSql.includes("'crm-place-photos'") && mergeSql.includes('false') && mergeSql.includes('5242880') && mergeSql.includes("'image/jpeg'") && mergeSql.includes("'image/png'") && mergeSql.includes("'image/webp'") && mergeSql.includes('on conflict (id) do update') && mergeSql.includes('public = excluded.public') && mergeSql.includes('file_size_limit = excluded.file_size_limit') && mergeSql.includes('allowed_mime_types = excluded.allowed_mime_types') && mergeSql.includes('create policy') === false, 'TEST ONLY: 0136 defines a private photo bucket and adds no storage policy');
const mergeFn = mergeSql.slice(mergeSql.indexOf('function public.crm_merge_won_distribution'), mergeSql.indexOf('function public.crm_undo_distribution_merge'));
const undoFn = mergeSql.slice(mergeSql.indexOf('function public.crm_undo_distribution_merge'), mergeSql.indexOf('comment on function public.crm_undo_distribution_merge'));
const undoHandler = readFileSync('src/lib/crm/googlePlaceHandler.ts', 'utf8');
const undoBody = undoHandler.slice(undoHandler.indexOf('export async function handleDistributionMerge'));
assert(mergeFn.includes('set search_path = pg_catalog') && mergeFn.includes('set search_path = public') === false && undoFn.includes('set search_path = pg_catalog') && undoFn.includes('v_current is distinct from v_row.account_id') && undoFn.includes('reassigned_ids = v_reassigned') && mergeSql.includes('revoke delete, truncate, references, trigger on table public.crm_google_places from service_role') && mergeSql.includes('revoke update, delete, truncate, references, trigger on table public.crm_distribution_merges from service_role') && mergeSql.includes('grant select, insert on table public.crm_distribution_merges to service_role') && mergeSql.includes('grant update on table public.crm_distribution_merges') === false && mergeSql.includes('merge audit is append-only') && mergeSql.includes('grant execute on function public.crm_undo_distribution_merge(uuid, text, timestamptz) to service_role') && undoBody.includes('canExport') && undoBody.includes('Only an owner or administrator can undo a merge.') && undoBody.includes('reassigned: undone.value.reassigned') && undoFn.includes('for update') && undoFn.includes('account_id = v_row.account_id') && mergeSql.includes('add column if not exists reassigned_ids uuid[] not null default') && mergeSql.includes('pending Gary decision') && mergeSql.includes('Any desk staff may call this') === false && updateOpp.includes('clearPlaceDetailsIfNotSelling') && updateOpp.includes("if (cleared.state !== 'ok') return cleared") && updateOpp.includes('shouldPurgePlaceDetails') && storeSrc.includes("console.error('crm place detail purge failed'") === false, 'TEST ONLY: undo locks the contact, the merge audit is append-only, and a failed place purge is returned');
const adminGrant = [{ brand: 'cedargrowth' as const, role: 'administrator' as const }];
let staffUndoCalls = 0;
const undoResult = { state: 'ok' as const, value: { merge: { id: '00000000-0000-4000-8000-000000000010', opportunityId: 'deal', accountId: 'won', actor: 'admin-1', contactIds: ['from-dup'], priors: [{ contactId: 'from-dup', priorAccountId: 'dup' }], createdAt: freshAt, undoneAt: freshAt, undoneBy: 'admin-1', reassignedIds: ['from-dup'] }, refused: [] as string[], reassigned: ['from-dup'] } };
const salesUndo = await handleDistributionMerge({
  actorId: 'sales-1',
  grants: salesGrant,
  request: crmReq('POST', '/api/admin/crm/distribution-merge', { brand: 'cedargrowth', mergeId: '00000000-0000-4000-8000-000000000010' }),
  store: { undoMerge: async () => { staffUndoCalls += 1; return undoResult; } } as unknown as CrmStore,
});
const adminUndo = await handleDistributionMerge({
  actorId: 'admin-1',
  grants: adminGrant,
  request: crmReq('POST', '/api/admin/crm/distribution-merge', { brand: 'cedargrowth', mergeId: '00000000-0000-4000-8000-000000000010' }),
  store: { undoMerge: async () => undoResult } as unknown as CrmStore,
});
const ownerUndo = await handleDistributionMerge({
  actorId: 'owner',
  grants: ownerGrants,
  request: crmReq('POST', '/api/admin/crm/distribution-merge', { brand: 'cedargrowth', mergeId: '00000000-0000-4000-8000-000000000010' }),
  store: { undoMerge: async () => undoResult } as unknown as CrmStore,
});
const consoleUi = readFileSync('src/app/admin/crm/CrmConsole.tsx', 'utf8');
assert(salesUndo.status === 403 && staffUndoCalls === 0 && adminUndo.status === 200 && (adminUndo.body.reassigned as string[]).join(',') === 'from-dup' && ownerUndo.status === 200 && consoleUi.includes("canUndo={roleLabel !== 'Sales'}") && consoleUi.includes('{canUndo ?'), 'TEST ONLY: staff cannot undo a merge, and an administrator or owner can');
assertDashboardTabs(assert);
await assertProductionForecast(assert);

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
