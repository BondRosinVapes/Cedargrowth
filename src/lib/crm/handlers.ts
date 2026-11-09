import {
  authorizeCrmRequest,
  buildAging,
  buildFunnel,
  buildWorkload,
  brandLabel,
  CANIX_NOT_CONNECTED,
  evaluateDesk,
  formatForecast,
  mirrorContract,
  parseNote,
  HOODIE_NOT_CONNECTED,
  canExport,
  nextAlertState,
  parseAccountWrite,
  parseAlertAction,
  parseBrand,
  parseContactWrite,
  parseOpportunityWrite,
  parseTaskWrite,
  parseUuid,
  plainSearch,
  resolveAssignee,
  WHOLESALE_BRAND,
  type AccountStatus,
  type Audience,
  type CrmBrand,
  type DeskGrant,
  type DeskRole,
  type DeskEvaluation,
  type InsightSnapshot,
  type TaskStatus,
} from './engine';
import type { CrmStore } from './store';
import { buildDashboard, parseDashboardFilter } from './dashboard';
import { matchDistributorAccount, nabisHealthLine, type DistributorOrderDraft } from './distributor';
import { monthStarts, parseCapacityWrite, productionForecast, stageWinRates } from './forecast';
import { buildDigest, digestConfigured, digestFromAddress, digestRecipients, digestSummary, nyWeek, renderDigestHtml, renderDigestText, secretMatches } from './digest';
import { COVERAGE_UPLOAD, NEEDS_HOODIE, NY_REGIONS } from './nyRegions';
import { coverageLabel, territoryTiles, TERRITORY_METRICS, type TerritoryMetric } from './territory';
import { nextBestActions, snoozeUntil } from './nextAction';
import { INTAKE_MAX_BYTES, intakeSecrets, parseIntake, signIntake, signaturesMatch, takeIntakeRate, timestampFresh } from './intake';
import { AGENT_ACTOR, AGENT_MAX_BYTES, AGENT_ROW_LIMIT, agentReady, agentSecret, agentSignatureOk, agentTimestampFresh, parseAgentEnvelope, parseAgentRow, type AgentOp } from './agentIntake';
import { readResendEvent, sendDigestEmail, sendReorderLink } from '@/lib/email';
import { FIELD_BUCKET, READ_URL_SECONDS, isProductLine, isVisitOutcome, mediaPath, roundLocation, validateMediaUpload } from './field';
import { BATCH_MISS, COA_BUCKET, COA_READ_SECONDS, LINK_MISS, clientIp, coaPath, consumeRate, parseBatchWrite, parseBuyer, parseReorderLines, productIdOk, tokenShapeOk, validateCoaUpload } from './reorder';
import { PRODUCTS } from '@/lib/products';
import { sendReorderRequest } from '@/lib/email';
import { EMAIL_STATUS_CAP, EMAIL_STATUS_DAYS, emailRefreshLimited, emailStatusLabel, knownEmailEvent } from './emailStatus';
import { getSupabaseServerClient } from '@/lib/supabase';
import { IMPORT_BATCH, IMPORT_KINDS, type ImportKind } from './importer';

export type CrmResult = { status: number; body: Record<string, unknown> };

export type CrmContext = {
  actorId: string | null;
  grants: readonly DeskGrant[];
  request: Request;
  store: CrmStore;
};

function denied(auth: { status: number; reason: string }): CrmResult {
  return { status: auth.status, body: { ok: false, reason: auth.reason } };
}

function storageBody(brand: CrmBrand, state: 'absent' | 'unavailable'): CrmResult {
  if (state === 'absent') {
    return {
      status: 503,
      body: {
        ok: false,
        configured: false,
        brand,
        reason: 'CRM storage is not configured.',
        detail: 'schema_absent',
      },
    };
  }
  return {
    status: 503,
    body: {
      ok: false,
      configured: false,
      brand,
      reason: 'CRM storage could not be read.',
      detail: 'read_failed',
    },
  };
}

async function gate(ctx: CrmContext, brandRaw: string | null): Promise<{ actorId: string; brand: CrmBrand; role: DeskRole } | CrmResult> {
  const url = new URL(ctx.request.url);
  const auth = authorizeCrmRequest({
    actorId: ctx.actorId,
    grants: ctx.grants,
    method: ctx.request.method,
    requestOrigin: url.origin,
    headerOrigin: ctx.request.headers.get('origin'),
    headerMarker: ctx.request.headers.get('x-cedargrowth-crm'),
    headerFetchSite: ctx.request.headers.get('sec-fetch-site'),
    brandRaw,
  });
  if (!auth.ok) return denied(auth);
  return auth;
}

function isResult(value: { actorId: string; brand: CrmBrand; role: DeskRole } | CrmResult): value is CrmResult {
  return 'status' in value;
}

async function readBody(request: Request): Promise<unknown | CrmResult> {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > 100_000) return { status: 413, body: { ok: false, reason: 'Request was rejected.' } };
  try {
    return await request.json();
  } catch {
    return { status: 400, body: { ok: false, reason: 'Request could not be read.' } };
  }
}

export async function handleCounts(ctx: CrmContext): Promise<CrmResult> {
  const url = new URL(ctx.request.url);
  const auth = await gate(ctx, url.searchParams.get('brand'));
  if (isResult(auth)) return auth;
  const counts = await ctx.store.counts(auth.brand);
  if (counts.state !== 'ok') return storageBody(auth.brand, counts.state === 'rejected' || counts.state === 'missing' ? 'unavailable' : counts.state);
  return {
    status: 200,
    body: {
      ok: true,
      configured: true,
      brand: auth.brand,
      label: brandLabel(auth.brand),
      counts: counts.value,
      amountKind: 'forecast',
      invoicedCents: null,
      paidCents: null,
    },
  };
}

export async function handleAccountCollection(ctx: CrmContext, method: 'GET' | 'POST'): Promise<CrmResult> {
  if (method === 'GET') {
    const url = new URL(ctx.request.url);
    const auth = await gate(ctx, url.searchParams.get('brand'));
    if (isResult(auth)) return auth;
    const status = url.searchParams.get('status');
    const parsedStatus = status ? (parseAccountWrite({ status }, 'update').ok ? status as AccountStatus : null) : null;
    if (status && !parsedStatus) return { status: 400, body: { ok: false, reason: 'Account status is not recognized.' } };
    const q = url.searchParams.get('q');
    const rows = await ctx.store.listAccounts(auth.brand, { q: q ? plainSearch(q) : null, status: parsedStatus });
    if (rows.state !== 'ok') return storageBody(auth.brand, rows.state === 'rejected' || rows.state === 'missing' ? 'unavailable' : rows.state);
    return { status: 200, body: { ok: true, configured: true, brand: auth.brand, accounts: rows.value } };
  }
  const body = await readBody(ctx.request);
  if (body && typeof body === 'object' && 'status' in (body as object) && 'body' in (body as object) && typeof (body as CrmResult).status === 'number' && !('displayName' in (body as object))) {
    return body as CrmResult;
  }
  const record = (body ?? {}) as Record<string, unknown>;
  const auth = await gate(ctx, typeof record.brand === 'string' ? record.brand : null);
  if (isResult(auth)) return auth;
  const parsed = parseAccountWrite(record, 'create');
  if (!parsed.ok || !parsed.value.displayName || !parsed.value.status) return { status: 400, body: { ok: false, reason: parsed.ok ? 'Enter an account name.' : parsed.reason } };
  const created = await ctx.store.createAccount(auth.brand, auth.actorId, {
    displayName: parsed.value.displayName,
    status: parsed.value.status,
    city: parsed.value.city ?? null,
    county: parsed.value.county ?? null,
    notes: parsed.value.notes ?? '',
    licenseRef: parsed.value.licenseRef ?? null,
    facilityRef: parsed.value.facilityRef ?? null,
    licenseJurisdiction: parsed.value.licenseJurisdiction ?? null,
    licenseExpiry: parsed.value.licenseExpiry ?? null,
    assignedRep: parsed.value.assignedRep ?? null,
    accountType: parsed.value.accountType ?? null,
    leadSource: parsed.value.leadSource ?? null,
    distributor: parsed.value.distributor ?? null,
    distributorAccountRef: parsed.value.distributorAccountRef ?? null,
  });
  if (created.state !== 'ok') return storageBody(auth.brand, created.state === 'rejected' ? 'unavailable' : created.state === 'missing' ? 'unavailable' : created.state);
  return { status: 201, body: { ok: true, configured: true, brand: auth.brand, account: created.value } };
}

export async function handleAccountUpdate(ctx: CrmContext, id: string): Promise<CrmResult> {
  const body = await readBody(ctx.request);
  if (isCrmResult(body)) return body;
  const record = (body ?? {}) as Record<string, unknown>;
  const auth = await gate(ctx, typeof record.brand === 'string' ? record.brand : null);
  if (isResult(auth)) return auth;
  if (!parseUuid(id)) return { status: 400, body: { ok: false, reason: 'Not found in this brand.' } };
  const parsed = parseAccountWrite(record, 'update');
  if (!parsed.ok) return { status: 400, body: { ok: false, reason: parsed.reason } };
  const updated = await ctx.store.updateAccount(auth.brand, auth.actorId, id, {
    displayName: parsed.value.displayName,
    status: parsed.value.status,
    city: parsed.value.city,
    notes: parsed.value.notes,
    licenseRef: parsed.value.licenseRef,
    facilityRef: parsed.value.facilityRef,
    licenseJurisdiction: parsed.value.licenseJurisdiction,
    licenseExpiry: parsed.value.licenseExpiry,
    assignedRep: parsed.value.assignedRep,
    accountType: parsed.value.accountType,
    leadSource: parsed.value.leadSource,
    distributor: parsed.value.distributor,
    distributorAccountRef: parsed.value.distributorAccountRef,
  });
  if (updated.state === 'missing') return { status: 404, body: { ok: false, reason: 'Not found in this brand.' } };
  if (updated.state !== 'ok') return storageBody(auth.brand, updated.state === 'rejected' ? 'unavailable' : updated.state);
  return { status: 200, body: { ok: true, configured: true, brand: auth.brand, account: updated.value } };
}

function isCrmResult(value: unknown): value is CrmResult {
  return !!value && typeof value === 'object' && 'status' in value && 'body' in value && typeof (value as CrmResult).status === 'number' && !('brand' in (value as object));
}

export async function handleContactCollection(ctx: CrmContext, method: 'GET' | 'POST'): Promise<CrmResult> {
  if (method === 'GET') {
    const url = new URL(ctx.request.url);
    const auth = await gate(ctx, url.searchParams.get('brand'));
    if (isResult(auth)) return auth;
    const accountId = url.searchParams.get('accountId');
    if (accountId && !parseUuid(accountId)) return { status: 400, body: { ok: false, reason: 'Account is not in this brand.' } };
    const rows = await ctx.store.listContacts(auth.brand, accountId);
    if (rows.state !== 'ok') return storageBody(auth.brand, rows.state === 'rejected' || rows.state === 'missing' ? 'unavailable' : rows.state);
    return { status: 200, body: { ok: true, configured: true, brand: auth.brand, contacts: rows.value } };
  }
  const body = await readBody(ctx.request);
  if (isCrmResult(body)) return body;
  const record = (body ?? {}) as Record<string, unknown>;
  const auth = await gate(ctx, typeof record.brand === 'string' ? record.brand : null);
  if (isResult(auth)) return auth;
  const parsed = parseContactWrite(record, 'create');
  if (!parsed.ok || !parsed.value.accountId || !parsed.value.name) return { status: 400, body: { ok: false, reason: parsed.ok ? 'Enter a contact name.' : parsed.reason } };
  const created = await ctx.store.createContact(auth.brand, auth.actorId, { ...parsed.value, accountId: parsed.value.accountId, name: parsed.value.name });
  if (created.state === 'rejected') return { status: 400, body: { ok: false, reason: 'The related record is not in this brand.' } };
  if (created.state !== 'ok') return storageBody(auth.brand, created.state === 'missing' ? 'unavailable' : created.state);
  return { status: 201, body: { ok: true, configured: true, brand: auth.brand, contact: created.value } };
}

export async function handleContactUpdate(ctx: CrmContext, id: string): Promise<CrmResult> {
  const body = await readBody(ctx.request);
  if (isCrmResult(body)) return body;
  const record = (body ?? {}) as Record<string, unknown>;
  const auth = await gate(ctx, typeof record.brand === 'string' ? record.brand : null);
  if (isResult(auth)) return auth;
  if (!parseUuid(id)) return { status: 404, body: { ok: false, reason: 'Not found in this brand.' } };
  const parsed = parseContactWrite(record, 'update');
  if (!parsed.ok) return { status: 400, body: { ok: false, reason: parsed.reason } };
  const updated = await ctx.store.updateContact(auth.brand, auth.actorId, id, parsed.value);
  if (updated.state === 'missing' || updated.state === 'rejected') return { status: updated.state === 'missing' ? 404 : 400, body: { ok: false, reason: 'Not found in this brand.' } };
  if (updated.state !== 'ok') return storageBody(auth.brand, updated.state);
  return { status: 200, body: { ok: true, configured: true, brand: auth.brand, contact: updated.value } };
}

export async function handleOpportunityCollection(ctx: CrmContext, method: 'GET' | 'POST'): Promise<CrmResult> {
  if (method === 'GET') {
    const url = new URL(ctx.request.url);
    const auth = await gate(ctx, url.searchParams.get('brand'));
    if (isResult(auth)) return auth;
    const rows = await ctx.store.listOpportunities(auth.brand);
    if (rows.state !== 'ok') return storageBody(auth.brand, rows.state === 'rejected' || rows.state === 'missing' ? 'unavailable' : rows.state);
    return { status: 200, body: { ok: true, configured: true, brand: auth.brand, amountKind: 'forecast', opportunities: rows.value } };
  }
  const body = await readBody(ctx.request);
  if (isCrmResult(body)) return body;
  const record = (body ?? {}) as Record<string, unknown>;
  const auth = await gate(ctx, typeof record.brand === 'string' ? record.brand : null);
  if (isResult(auth)) return auth;
  const parsed = parseOpportunityWrite(record, 'create');
  if (!parsed.ok || !parsed.value.accountId || !parsed.value.name || !parsed.value.stage) {
    return { status: 400, body: { ok: false, reason: parsed.ok ? 'Enter an opportunity name.' : parsed.reason } };
  }
  const created = await ctx.store.createOpportunity(auth.brand, auth.actorId, {
    ...parsed.value,
    accountId: parsed.value.accountId,
    name: parsed.value.name,
    stage: parsed.value.stage,
  });
  if (created.state === 'rejected') return { status: 400, body: { ok: false, reason: 'The related record is not in this brand.' } };
  if (created.state !== 'ok') return storageBody(auth.brand, created.state === 'missing' ? 'unavailable' : created.state);
  return { status: 201, body: { ok: true, configured: true, brand: auth.brand, opportunity: withForecast(created.value) } };
}

function withForecast<T extends { forecastCents: number | null }>(row: T) {
  return { ...row, forecastLabel: formatForecast(row.forecastCents), amountKind: 'forecast' as const, invoicedCents: null, paidCents: null };
}

export async function handleOpportunityUpdate(ctx: CrmContext, id: string): Promise<CrmResult> {
  const body = await readBody(ctx.request);
  if (isCrmResult(body)) return body;
  const record = (body ?? {}) as Record<string, unknown>;
  const auth = await gate(ctx, typeof record.brand === 'string' ? record.brand : null);
  if (isResult(auth)) return auth;
  if (!parseUuid(id)) return { status: 404, body: { ok: false, reason: 'Not found in this brand.' } };
  const parsed = parseOpportunityWrite(record, 'update');
  if (!parsed.ok) return { status: 400, body: { ok: false, reason: parsed.reason } };
  const updated = await ctx.store.updateOpportunity(auth.brand, auth.actorId, id, parsed.value);
  if (updated.state === 'missing') return { status: 404, body: { ok: false, reason: 'Not found in this brand.' } };
  if (updated.state === 'rejected') return { status: 400, body: { ok: false, reason: 'The related record is not in this brand.' } };
  if (updated.state !== 'ok') return storageBody(auth.brand, updated.state);
  return { status: 200, body: { ok: true, configured: true, brand: auth.brand, opportunity: withForecast(updated.value) } };
}

export async function handleTaskCollection(ctx: CrmContext, method: 'GET' | 'POST'): Promise<CrmResult> {
  if (method === 'GET') {
    const url = new URL(ctx.request.url);
    const auth = await gate(ctx, url.searchParams.get('brand'));
    if (isResult(auth)) return auth;
    const status = url.searchParams.get('status');
    if (status && status !== 'open' && status !== 'done') return { status: 400, body: { ok: false, reason: 'Task status is not recognized.' } };
    const rows = await ctx.store.listTasks(auth.brand, (status as TaskStatus | null) ?? null);
    if (rows.state !== 'ok') return storageBody(auth.brand, rows.state === 'rejected' || rows.state === 'missing' ? 'unavailable' : rows.state);
    return { status: 200, body: { ok: true, configured: true, brand: auth.brand, tasks: rows.value } };
  }
  const body = await readBody(ctx.request);
  if (isCrmResult(body)) return body;
  const record = (body ?? {}) as Record<string, unknown>;
  const auth = await gate(ctx, typeof record.brand === 'string' ? record.brand : null);
  if (isResult(auth)) return auth;
  const parsed = parseTaskWrite(record, 'create');
  if (!parsed.ok || !parsed.value.title || !parsed.value.status) return { status: 400, body: { ok: false, reason: parsed.ok ? 'Enter a task title.' : parsed.reason } };
  const created = await ctx.store.createTask(auth.brand, auth.actorId, { ...parsed.value, title: parsed.value.title, status: parsed.value.status });
  if (created.state === 'rejected') return { status: 400, body: { ok: false, reason: 'The related record is not in this brand.' } };
  if (created.state !== 'ok') return storageBody(auth.brand, created.state === 'missing' ? 'unavailable' : created.state);
  return { status: 201, body: { ok: true, configured: true, brand: auth.brand, task: created.value } };
}

export async function handleTaskUpdate(ctx: CrmContext, id: string): Promise<CrmResult> {
  const body = await readBody(ctx.request);
  if (isCrmResult(body)) return body;
  const record = (body ?? {}) as Record<string, unknown>;
  const auth = await gate(ctx, typeof record.brand === 'string' ? record.brand : null);
  if (isResult(auth)) return auth;
  if (!parseUuid(id)) return { status: 404, body: { ok: false, reason: 'Not found in this brand.' } };
  const parsed = parseTaskWrite(record, 'update');
  if (!parsed.ok) return { status: 400, body: { ok: false, reason: parsed.reason } };
  const updated = await ctx.store.updateTask(auth.brand, auth.actorId, id, parsed.value);
  if (updated.state === 'missing') return { status: 404, body: { ok: false, reason: 'Not found in this brand.' } };
  if (updated.state === 'rejected') return { status: 400, body: { ok: false, reason: 'The related record is not in this brand.' } };
  if (updated.state !== 'ok') return storageBody(auth.brand, updated.state);
  return { status: 200, body: { ok: true, configured: true, brand: auth.brand, task: updated.value } };
}

export async function handleActivity(ctx: CrmContext): Promise<CrmResult> {
  const url = new URL(ctx.request.url);
  const auth = await gate(ctx, url.searchParams.get('brand'));
  if (isResult(auth)) return auth;
  const rows = await ctx.store.listActivity(auth.brand);
  if (rows.state !== 'ok') return storageBody(auth.brand, rows.state === 'rejected' || rows.state === 'missing' ? 'unavailable' : rows.state);
  return { status: 200, body: { ok: true, configured: true, brand: auth.brand, activity: rows.value } };
}

export async function handleSearch(ctx: CrmContext): Promise<CrmResult> {
  const url = new URL(ctx.request.url);
  const auth = await gate(ctx, url.searchParams.get('brand'));
  if (isResult(auth)) return auth;
  const q = plainSearch(url.searchParams.get('q'));
  if (!q) return { status: 400, body: { ok: false, reason: 'Enter a search term.' } };
  const rows = await ctx.store.search(auth.brand, q);
  if (rows.state !== 'ok') return storageBody(auth.brand, rows.state === 'rejected' || rows.state === 'missing' ? 'unavailable' : rows.state);
  return { status: 200, body: { ok: true, configured: true, brand: auth.brand, ...rows.value } };
}

export async function handleExport(ctx: CrmContext): Promise<CrmResult> {
  const url = new URL(ctx.request.url);
  const auth = await gate(ctx, url.searchParams.get('brand'));
  if (isResult(auth)) return auth;
  if (!canExport(auth.role)) return { status: 403, body: { ok: false, reason: 'Export is limited to a CRM administrator.' } };
  const rows = await ctx.store.exportBrand(auth.brand);
  if (rows.state !== 'ok') return storageBody(auth.brand, rows.state === 'rejected' || rows.state === 'missing' ? 'unavailable' : rows.state);
  return {
    status: 200,
    body: {
      ok: true,
      configured: true,
      brand: auth.brand,
      exportedAt: new Date().toISOString(),
      amountKind: 'forecast',
      invoicedCents: null,
      paidCents: null,
      canix: { connected: false, label: CANIX_NOT_CONNECTED },
      hoodie: { connected: false, label: HOODIE_NOT_CONNECTED },
      orders: [],
      packages: [],
      ...rows.value,
    },
  };
}

export function liveDesk(now: string): DeskEvaluation {
  return evaluateDesk({
    now,
    synthetic: false,
    purchases: [],
    observations: [],
    menuCount: 0,
    canixInventorySupplied: false,
    heat: [],
    coverage: [],
  });
}

export async function loadBrandSnapshot(store: CrmStore, brand: CrmBrand, now: string): Promise<InsightSnapshot> {
  const intel = await store.intelligence(brand);
  const desk = liveDesk(now);
  if (intel.state !== 'ok') {
    return { brand, internalNotes: [], recommendations: [], alerts: [], desk, storage: 'absent' };
  }
  return {
    brand,
    internalNotes: [],
    recommendations: intel.value.recommendations,
    alerts: intel.value.alerts,
    desk,
    storage: 'ok',
  };
}

export async function handleIntelligence(ctx: CrmContext): Promise<CrmResult> {
  const url = new URL(ctx.request.url);
  const auth = await gate(ctx, url.searchParams.get('brand'));
  if (isResult(auth)) return auth;
  const snapshot = await loadBrandSnapshot(ctx.store, auth.brand, new Date().toISOString().slice(0, 10));
  return {
    status: snapshot.storage === 'ok' ? 200 : 503,
    body: {
      ok: snapshot.storage === 'ok',
      configured: snapshot.storage === 'ok',
      brand: auth.brand,
      policyVerified: snapshot.desk.policyVerified,
      canix: snapshot.desk.canix,
      hoodie: snapshot.desk.hoodie,
      lastRefresh: snapshot.desk.lastRefresh,
      alertsActivated: false,
      reorder: snapshot.desk.reorder,
      stock: snapshot.desk.stock,
      prospects: snapshot.desk.prospects,
      boundaries: snapshot.desk.boundaries,
      recommendations: snapshot.recommendations,
      alerts: snapshot.alerts,
      reason: snapshot.storage === 'ok' ? undefined : 'CRM storage is not configured.',
    },
  };
}

export async function handleCanix(ctx: CrmContext): Promise<CrmResult> {
  const url = new URL(ctx.request.url);
  const auth = await gate(ctx, url.searchParams.get('brand'));
  if (isResult(auth)) return auth;
  return {
    status: 200,
    body: {
      ok: true,
      brand: auth.brand,
      connected: false,
      label: CANIX_NOT_CONNECTED,
      orders: [],
      packages: [],
      customers: [],
      reason: 'Canix not connected. No live schema was verified, so this desk does not call Canix.',
    },
  };
}

export async function handleAlerts(ctx: CrmContext, method: 'GET' | 'POST'): Promise<CrmResult> {
  if (method === 'GET') return handleIntelligence(ctx);
  const body = await readBody(ctx.request);
  if (isCrmResult(body)) return body;
  const record = (body ?? {}) as Record<string, unknown>;
  const auth = await gate(ctx, typeof record.brand === 'string' ? record.brand : null);
  if (isResult(auth)) return auth;
  const op = parseAlertAction(record);
  const id = parseUuid(record.id);
  if (!op || !id) return { status: 400, body: { ok: false, reason: 'Alert action was rejected.' } };
  if (record.activate === true || record.channel || record.notify) {
    return { status: 400, body: { ok: false, reason: 'Alerts are not activated.' } };
  }
  const intel = await ctx.store.intelligence(auth.brand);
  if (intel.state !== 'ok') return storageBody(auth.brand, intel.state === 'rejected' || intel.state === 'missing' ? 'unavailable' : intel.state);
  const current = intel.value.alerts.find((alert) => alert.id === id && alert.brand === auth.brand);
  if (!current) return { status: 404, body: { ok: false, reason: 'Not found in this brand.' } };
  const actor = resolveAssignee(record.assignedTo, auth.actorId);
  const next = nextAlertState(current, op, actor, new Date().toISOString());
  if (!next.ok) return { status: 400, body: { ok: false, reason: next.reason } };
  const saved = await ctx.store.applyAlert(auth.brand, id, next.alert);
  if (saved.state === 'missing') return { status: 404, body: { ok: false, reason: 'Not found in this brand.' } };
  if (saved.state !== 'ok') return storageBody(auth.brand, saved.state === 'rejected' ? 'unavailable' : saved.state);
  return { status: 200, body: { ok: true, configured: true, brand: auth.brand, alert: saved.value, alertsActivated: false } };
}

export async function handleReports(ctx: CrmContext): Promise<CrmResult> {
  const url = new URL(ctx.request.url);
  const auth = await gate(ctx, url.searchParams.get('brand'));
  if (isResult(auth)) return auth;
  const [opps, tasks, accounts] = await Promise.all([ctx.store.listOpportunities(auth.brand), ctx.store.listTasks(auth.brand, null), ctx.store.listAccounts(auth.brand, { q: null, status: null })]);
  if (opps.state !== 'ok') return storageBody(auth.brand, opps.state === 'rejected' || opps.state === 'missing' ? 'unavailable' : opps.state);
  if (tasks.state !== 'ok') return storageBody(auth.brand, tasks.state === 'rejected' || tasks.state === 'missing' ? 'unavailable' : tasks.state);
  if (accounts.state !== 'ok') return storageBody(auth.brand, accounts.state === 'rejected' || accounts.state === 'missing' ? 'unavailable' : accounts.state);
  const hidden = new Set(accounts.value.filter((row) => row.recordMarker === 'test').map((row) => row.id));
  const visibleOpps = opps.value.filter((row) => !hidden.has(row.accountId));
  const visibleTasks = tasks.value.filter((row) => !row.accountId || !hidden.has(row.accountId));
  const today = new Date().toISOString().slice(0, 10);
  const funnel = buildFunnel(visibleOpps.map((row) => ({ brand: row.brand, stage: row.stage, expectedCloseOn: row.expectedCloseOn })), auth.brand);
  const aging = buildAging(visibleOpps.map((row) => ({ brand: row.brand, stage: row.stage, expectedCloseOn: row.expectedCloseOn })), auth.brand, today);
  const workload = buildWorkload(visibleTasks.map((row) => ({ brand: row.brand, ownerActor: row.ownerActor, status: row.status })), auth.brand);
  if (!funnel.ok || !aging.ok || !workload.ok) return { status: 403, body: { ok: false, reason: 'This brand is not assigned.' } };
  return {
    status: 200,
    body: {
      ok: true,
      configured: true,
      brand: auth.brand,
      synthetic: false,
      amountKind: 'forecast',
      invoicedCents: null,
      paidCents: null,
      funnel: funnel.stages,
      agedOpenOpportunities: aging.aged,
      workload: workload.owners,
      mirror: mirrorContract(),
    },
  };
}

export async function handleDashboard(ctx: CrmContext): Promise<CrmResult> {
  const url = new URL(ctx.request.url);
  const auth = await gate(ctx, url.searchParams.get('brand'));
  if (isResult(auth)) return auth;
  // exportBrand reads every row in this brand (up to its cap), not the 100 most recent.
  const [all, notes, orders, visits] = await Promise.all([ctx.store.exportBrand(auth.brand), ctx.store.listNotes(auth.brand, null), ctx.store.listDistributorOrders(auth.brand), ctx.store.listVisits(auth.brand)]);
  for (const result of [all, notes]) {
    if (result.state !== 'ok') return storageBody(auth.brand, result.state === 'rejected' || result.state === 'missing' ? 'unavailable' : result.state);
  }
  if (all.state !== 'ok' || notes.state !== 'ok') return storageBody(auth.brand, 'unavailable');
  if (orders.state !== 'ok' && orders.state !== 'absent') return storageBody(auth.brand, orders.state === 'rejected' || orders.state === 'missing' ? 'unavailable' : orders.state);
  if (visits.state !== 'ok' && visits.state !== 'absent') return storageBody(auth.brand, visits.state === 'rejected' || visits.state === 'missing' ? 'unavailable' : visits.state);
  const accounts = { value: all.value.accounts };
  const opps = { value: all.value.opportunities };
  const tasks = { value: all.value.tasks };
  const activity = { value: all.value.activity };
  const dashboard = buildDashboard({
    brand: auth.brand,
    today: new Date().toISOString().slice(0, 10),
    filter: parseDashboardFilter(url.searchParams),
    accounts: accounts.value,
    opportunities: opps.value,
    tasks: tasks.value,
    activity: activity.value,
    notes: notes.value,
    orders: orders.state === 'ok' ? orders.value : [],
    visits: visits.state === 'ok' ? visits.value : [],
  });
  return {
    status: 200,
    body: {
      ok: true,
      configured: true,
      brand: auth.brand,
      amountKind: 'forecast',
      invoicedCents: null,
      paidCents: null,
      sources: {
        crm: { connected: true, label: 'CRM records' },
        canix: { connected: false, label: CANIX_NOT_CONNECTED },
        hoodie: { connected: false, label: HOODIE_NOT_CONNECTED },
      },
      truncated: all.value.truncated,
      refreshedAt: new Date().toISOString(),
      dashboard,
    },
  };
}

type ImportOutcome = { line: number; status: 'ready' | 'created' | 'updated' | 'unmatched' | 'skipped' | 'error'; reason?: string; orderId?: string };

export async function handleImport(ctx: CrmContext): Promise<CrmResult> {
  const body = await readBody(ctx.request);
  if (isCrmResult(body)) return body;
  const record = (body ?? {}) as Record<string, unknown>;
  const auth = await gate(ctx, typeof record.brand === 'string' ? record.brand : null);
  if (isResult(auth)) return auth;
  if (!canExport(auth.role)) return { status: 403, body: { ok: false, reason: 'Only an owner or administrator can import.' } };
  const kind = (IMPORT_KINDS as readonly string[]).includes(String(record.kind)) ? (record.kind as ImportKind) : null;
  const rows = Array.isArray(record.rows) ? record.rows : null;
  if (!kind || !rows) return { status: 400, body: { ok: false, reason: 'Import could not be read.' } };
  if (rows.length > IMPORT_BATCH) return { status: 413, body: { ok: false, reason: `Send at most ${IMPORT_BATCH} rows at a time.` } };
  const commit = record.commit === true;

  const existing = await ctx.store.exportBrand(auth.brand);
  if (existing.state !== 'ok') return storageBody(auth.brand, existing.state === 'rejected' || existing.state === 'missing' ? 'unavailable' : existing.state);
  const key = (value: string) => value.trim().toLowerCase();
  const brandAccounts = existing.value.accounts.filter((row) => row.brand === auth.brand);
  const accountsByName = new Map(brandAccounts.map((row) => [key(row.displayName), row.id]));
  const accountsByLicense = new Map(brandAccounts.filter((row) => row.licenseRef).map((row) => [key(row.licenseRef || ''), row.id]));
  const licenseHits = new Map<string, string[]>();
  const nameHits = new Map<string, string[]>();
  for (const row of brandAccounts) {
    const names = nameHits.get(key(row.displayName)) ?? [];
    names.push(row.id);
    nameHits.set(key(row.displayName), names);
    if (!row.licenseRef) continue;
    const licenses = licenseHits.get(key(row.licenseRef)) ?? [];
    licenses.push(row.id);
    licenseHits.set(key(row.licenseRef), licenses);
  }
  const contactKeys = new Set(existing.value.contacts.filter((row) => row.brand === auth.brand).map((row) => `${row.accountId}|${key(row.name)}|${key(row.email || '')}`));
  const dealKeys = new Set(existing.value.opportunities.filter((row) => row.brand === auth.brand).map((row) => `${row.accountId}|${key(row.name)}`));
  const rememberAccount = (id: string, name: string, license: string | null | undefined) => {
    const names = nameHits.get(key(name)) ?? [];
    names.push(id);
    nameHits.set(key(name), names);
    if (!license) return;
    accountsByLicense.set(key(license), id);
    const licenses = licenseHits.get(key(license)) ?? [];
    licenses.push(id);
    licenseHits.set(key(license), licenses);
  };
  const resolveContact = (license: unknown, name: unknown): { id: string } | { error: string } => {
    const licenseKey = typeof license === 'string' && license.trim() ? key(license) : '';
    if (licenseKey) {
      const hits = licenseHits.get(licenseKey) ?? [];
      if (hits.length === 1) return { id: hits[0] };
      if (hits.length > 1) return { error: 'More than one account has this license number.' };
      return { error: 'No account with this license number. Import or add the account first.' };
    }
    const nameKey = typeof name === 'string' ? key(name) : '';
    if (!nameKey) return { error: 'No account for this contact. Link it to an account first.' };
    const hits = nameHits.get(nameKey) ?? [];
    if (hits.length === 1) return { id: hits[0] };
    if (hits.length > 1) return { error: 'More than one account has this name.' };
    return { error: 'No account with this name. Import or add the account first.' };
  };

  const outcomes: ImportOutcome[] = [];
  const pendingRetailers: { licenseNumber: string; name: string; county: string; licenseType: string }[] = [];
  for (const raw of rows) {
    const item = (raw ?? {}) as { line?: unknown; record?: unknown; accountName?: unknown; accountLicense?: unknown };
    const line = typeof item.line === 'number' ? item.line : 0;
    const fields = item.record && typeof item.record === 'object' ? { ...(item.record as Record<string, unknown>) } : null;
    if (!fields) { outcomes.push({ line, status: 'error', reason: 'Row could not be read.' }); continue; }
    if (kind === 'retailers') {
      const licenseNumber = typeof fields.licenseNumber === 'string' ? fields.licenseNumber : '';
      const name = typeof fields.name === 'string' ? fields.name : '';
      const county = typeof fields.county === 'string' ? fields.county : '';
      const licenseType = typeof fields.licenseType === 'string' ? fields.licenseType : '';
      if (!licenseNumber || !name || !county) { outcomes.push({ line, status: 'error', reason: 'Retailer row is incomplete.' }); continue; }
      if (!commit) { outcomes.push({ line, status: 'ready' }); continue; }
      pendingRetailers.push({ licenseNumber, name, county, licenseType: licenseType || 'Unspecified' });
      outcomes.push({ line, status: 'created' });
      continue;
    }
    if (kind === 'accounts') {
      const parsed = parseAccountWrite(fields, 'create');
      if (!parsed.ok || !parsed.value.displayName) { outcomes.push({ line, status: 'error', reason: parsed.ok ? 'Account name is empty.' : parsed.reason }); continue; }
      const name = key(parsed.value.displayName);
      const license = parsed.value.licenseRef ? key(parsed.value.licenseRef) : '';
      if (license && accountsByLicense.has(license)) { outcomes.push({ line, status: 'skipped', reason: 'An account with this license number already exists.' }); continue; }
      if (!license && accountsByName.has(name)) { outcomes.push({ line, status: 'skipped', reason: 'An account with this name already exists.' }); continue; }
      if (!commit) {
        if (license) accountsByLicense.set(license, `pending-${line}`);
        else accountsByName.set(name, `pending-${line}`);
        outcomes.push({ line, status: 'ready' });
        continue;
      }
      const created = await ctx.store.createAccount(auth.brand, auth.actorId, {
        displayName: parsed.value.displayName,
        status: parsed.value.status ?? 'prospect',
        city: parsed.value.city ?? null,
        county: parsed.value.county ?? null,
        notes: parsed.value.notes ?? '',
        licenseRef: parsed.value.licenseRef ?? null,
        licenseExpiry: parsed.value.licenseExpiry ?? null,
        assignedRep: parsed.value.assignedRep ?? null,
        accountType: parsed.value.accountType ?? null,
        leadSource: parsed.value.leadSource ?? null,
      });
      if (created.state !== 'ok') { outcomes.push({ line, status: 'error', reason: 'Storage did not accept this row.' }); continue; }
      accountsByName.set(name, created.value.id);
      rememberAccount(created.value.id, created.value.displayName, created.value.licenseRef);
      outcomes.push({ line, status: 'created' });
      continue;
    }
    if (kind === 'orders') {
      const draft = fields as DistributorOrderDraft;
      if (!draft.orderRef || !draft.retailerName || !draft.orderStatus || !draft.distributor) {
        outcomes.push({ line, status: 'error', reason: 'Order could not be read.' });
        continue;
      }
      const accountId = matchDistributorAccount(
        existing.value.accounts.filter((row) => row.brand === auth.brand),
        draft,
      );
      if (!commit) {
        outcomes.push({ line, status: accountId ? 'ready' : 'unmatched', reason: accountId ? undefined : 'No account matched. The retailer will not be created.' });
        continue;
      }
      const saved = await ctx.store.upsertDistributorOrder(auth.brand, auth.actorId, { ...draft, accountId });
      if (saved.state !== 'ok') { outcomes.push({ line, status: 'error', reason: 'Storage did not accept this order.' }); continue; }
      if (saved.value.action === 'updated') outcomes.push({ line, status: 'updated', orderId: saved.value.order.id });
      else if (!saved.value.order.accountId) outcomes.push({ line, status: 'unmatched', orderId: saved.value.order.id, reason: 'No account matched. Link this retailer. Nothing new was created.' });
      else outcomes.push({ line, status: 'created', orderId: saved.value.order.id });
      continue;
    }
    if (kind === 'contacts') {
      const resolved = resolveContact(item.accountLicense, item.accountName);
      if ('error' in resolved) { outcomes.push({ line, status: 'error', reason: resolved.error }); continue; }
      const parsed = parseContactWrite({ ...fields, accountId: resolved.id, preference: 'unspecified' }, 'create');
      if (!parsed.ok || !parsed.value.name) { outcomes.push({ line, status: 'error', reason: parsed.ok ? 'Contact name is empty.' : parsed.reason }); continue; }
      const contactKey = `${resolved.id}|${key(parsed.value.name)}|${key(parsed.value.email || '')}`;
      if (contactKeys.has(contactKey)) { outcomes.push({ line, status: 'skipped', reason: 'This account already has this contact.' }); continue; }
      contactKeys.add(contactKey);
      if (!commit) { outcomes.push({ line, status: 'ready' }); continue; }
      const created = await ctx.store.createContact(auth.brand, auth.actorId, { ...parsed.value, accountId: resolved.id, name: parsed.value.name });
      outcomes.push(created.state === 'ok' ? { line, status: 'created' } : { line, status: 'error', reason: 'Storage did not accept this row.' });
      continue;
    }
    const accountName = typeof item.accountName === 'string' ? key(item.accountName) : '';
    const accountId = accountsByName.get(accountName);
    if (!accountId) { outcomes.push({ line, status: 'error', reason: 'No account with this name. Import or add the account first.' }); continue; }
    const parsed = parseOpportunityWrite({ ...fields, accountId }, 'create');
    if (!parsed.ok || !parsed.value.name || !parsed.value.stage) { outcomes.push({ line, status: 'error', reason: parsed.ok ? 'Deal name is empty.' : parsed.reason }); continue; }
    const dealKey = `${accountId}|${key(parsed.value.name)}`;
    if (dealKeys.has(dealKey)) { outcomes.push({ line, status: 'skipped', reason: 'This account already has a deal with this name.' }); continue; }
    dealKeys.add(dealKey);
    if (!commit) { outcomes.push({ line, status: 'ready' }); continue; }
    const created = await ctx.store.createOpportunity(auth.brand, auth.actorId, { ...parsed.value, accountId, name: parsed.value.name, stage: parsed.value.stage });
    outcomes.push(created.state === 'ok' ? { line, status: 'created' } : { line, status: 'error', reason: 'Storage did not accept this row.' });
  }
  if (commit && pendingRetailers.length) {
    const saved = await ctx.store.insertMarketRetailers(auth.brand, pendingRetailers, new Date().toISOString());
    if (saved.state !== 'ok') return storageBody(auth.brand, saved.state === 'rejected' || saved.state === 'missing' ? 'unavailable' : saved.state);
  }
  return { status: 200, body: { ok: true, configured: true, brand: auth.brand, kind, commit, outcomes } };
}

export async function handleForecast(ctx: CrmContext): Promise<CrmResult> {
  const url = new URL(ctx.request.url);
  const auth = await gate(ctx, url.searchParams.get('brand'));
  if (isResult(auth)) return auth;
  const requested = Number(url.searchParams.get('months') || '6');
  const span = Number.isInteger(requested) && requested >= 1 && requested <= 24 ? requested : 6;
  const [opps, events, capacity] = await Promise.all([
    ctx.store.listOpportunities(auth.brand),
    ctx.store.listStageEvents(auth.brand),
    ctx.store.listCapacity(auth.brand),
  ]);
  for (const result of [opps, events, capacity]) {
    if (result.state !== 'ok') return storageBody(auth.brand, result.state === 'rejected' || result.state === 'missing' ? 'unavailable' : result.state);
  }
  if (opps.state !== 'ok' || events.state !== 'ok' || capacity.state !== 'ok') return storageBody(auth.brand, 'unavailable');
  const today = new Date().toISOString().slice(0, 10);
  const rates = stageWinRates(events.value, opps.value);
  const forecast = productionForecast({
    opportunities: opps.value,
    capacity: capacity.value,
    rates,
    months: monthStarts(today, span),
  });
  return { status: 200, body: { ok: true, configured: true, brand: auth.brand, months: span, rates, ...forecast } };
}

export async function handleCapacity(ctx: CrmContext): Promise<CrmResult> {
  const body = await readBody(ctx.request);
  if (isCrmResult(body)) return body;
  const record = (body ?? {}) as Record<string, unknown>;
  const auth = await gate(ctx, typeof record.brand === 'string' ? record.brand : null);
  if (isResult(auth)) return auth;
  if (!canExport(auth.role)) return { status: 403, body: { ok: false, reason: 'Only an owner or administrator can edit capacity.' } };
  const parsed = parseCapacityWrite(record);
  if (!parsed.ok) return { status: 400, body: { ok: false, reason: parsed.reason } };
  const saved = await ctx.store.upsertCapacity(auth.brand, auth.actorId, parsed.value);
  if (saved.state !== 'ok') return storageBody(auth.brand, saved.state === 'rejected' || saved.state === 'missing' ? 'unavailable' : saved.state);
  return { status: 200, body: { ok: true, configured: true, brand: auth.brand, capacity: saved.value } };
}

export async function handleField(ctx: CrmContext): Promise<CrmResult> {
  const url = new URL(ctx.request.url);
  const auth = await gate(ctx, url.searchParams.get('brand'));
  if (isResult(auth)) return auth;
  const [accounts, visits, tasks, samples, media] = await Promise.all([
    ctx.store.listAccounts(auth.brand, { q: null, status: null }),
    ctx.store.listVisits(auth.brand),
    ctx.store.listTasks(auth.brand, 'open'),
    ctx.store.listSamples(auth.brand),
    ctx.store.listMedia(auth.brand),
  ]);
  for (const result of [accounts, visits, tasks, samples, media]) {
    if (result.state !== 'ok') return storageBody(auth.brand, result.state === 'rejected' || result.state === 'missing' ? 'unavailable' : result.state);
  }
  if (accounts.state !== 'ok' || visits.state !== 'ok' || tasks.state !== 'ok' || samples.state !== 'ok' || media.state !== 'ok') {
    return storageBody(auth.brand, 'unavailable');
  }
  return {
    status: 200,
    body: {
      ok: true,
      configured: true,
      brand: auth.brand,
      actorId: auth.actorId,
      accounts: accounts.value.map((row) => ({ id: row.id, displayName: row.displayName, city: row.city })),
      visits: visits.value,
      tasks: tasks.value.filter((row) => row.ownerActor === auth.actorId || (row.title.startsWith('Follow up on samples at ') && row.dueOn !== null && row.dueOn <= new Date().toISOString().slice(0, 10))),
      samples: samples.value,
      media: media.value,
    },
  };
}

export async function handleVisit(ctx: CrmContext, method: 'POST' | 'PATCH'): Promise<CrmResult> {
  const body = await readBody(ctx.request);
  if (isCrmResult(body)) return body;
  const record = (body ?? {}) as Record<string, unknown>;
  const auth = await gate(ctx, typeof record.brand === 'string' ? record.brand : null);
  if (isResult(auth)) return auth;
  if (method === 'PATCH') {
    const visitId = typeof record.visitId === 'string' ? record.visitId : '';
    if (!parseUuid(visitId)) return { status: 400, body: { ok: false, reason: 'Visit was not found in this brand.' } };
    const saved = await ctx.store.checkOut(auth.brand, visitId);
    if (saved.state === 'rejected' || saved.state === 'missing') return { status: 404, body: { ok: false, reason: 'Visit was not found in this brand.' } };
    if (saved.state !== 'ok') return storageBody(auth.brand, saved.state);
    return { status: 200, body: { ok: true, configured: true, brand: auth.brand, visit: saved.value } };
  }
  const accountId = typeof record.accountId === 'string' ? record.accountId : '';
  if (!parseUuid(accountId)) return { status: 400, body: { ok: false, reason: 'Account is not in this brand.' } };
  if (!isVisitOutcome(record.outcome)) return { status: 400, body: { ok: false, reason: 'Outcome is not recognized.' } };
  const notes = record.notes === undefined || record.notes === null ? '' : record.notes;
  if (typeof notes !== 'string' || notes.length > 2000) return { status: 400, body: { ok: false, reason: 'Notes are too long.' } };
  const location = roundLocation(record.latitude, record.longitude);
  if (location === 'invalid') return { status: 400, body: { ok: false, reason: 'Location could not be read.' } };
  const saved = await ctx.store.checkIn(auth.brand, auth.actorId, {
    accountId,
    outcome: record.outcome,
    notes,
    latitude: location?.latitude ?? null,
    longitude: location?.longitude ?? null,
  });
  if (saved.state === 'rejected') return { status: 400, body: { ok: false, reason: 'Account is not in this brand.' } };
  if (saved.state !== 'ok') return storageBody(auth.brand, saved.state === 'missing' ? 'unavailable' : saved.state);
  return { status: 201, body: { ok: true, configured: true, brand: auth.brand, visit: saved.value } };
}

export async function handleSample(ctx: CrmContext): Promise<CrmResult> {
  const body = await readBody(ctx.request);
  if (isCrmResult(body)) return body;
  const record = (body ?? {}) as Record<string, unknown>;
  const auth = await gate(ctx, typeof record.brand === 'string' ? record.brand : null);
  if (isResult(auth)) return auth;
  const accountId = typeof record.accountId === 'string' ? record.accountId : '';
  if (!parseUuid(accountId)) return { status: 400, body: { ok: false, reason: 'Account is not in this brand.' } };
  const visitId = record.visitId === undefined || record.visitId === null || record.visitId === '' ? null : record.visitId;
  if (visitId !== null && (typeof visitId !== 'string' || !parseUuid(visitId))) return { status: 400, body: { ok: false, reason: 'Visit was not found in this brand.' } };
  if (!isProductLine(record.productLine)) return { status: 400, body: { ok: false, reason: 'Product line is not recognized.' } };
  if (typeof record.quantityUnits !== 'number' || !Number.isInteger(record.quantityUnits) || record.quantityUnits < 1) {
    return { status: 400, body: { ok: false, reason: 'Sample quantity must be at least 1.' } };
  }
  if (typeof record.leftOn !== 'string' || typeof record.followUpOn !== 'string') return { status: 400, body: { ok: false, reason: 'Sample dates are required.' } };
  const notes = record.notes === undefined || record.notes === null ? '' : record.notes;
  if (typeof notes !== 'string' || notes.length > 2000) return { status: 400, body: { ok: false, reason: 'Notes are too long.' } };
  const saved = await ctx.store.createSample(auth.brand, auth.actorId, {
    accountId,
    visitId,
    productLine: record.productLine,
    quantityUnits: record.quantityUnits,
    leftOn: record.leftOn,
    followUpOn: record.followUpOn,
    notes,
  });
  if (saved.state === 'rejected') return { status: 400, body: { ok: false, reason: 'Account is not in this brand.' } };
  if (saved.state !== 'ok') return storageBody(auth.brand, saved.state === 'missing' ? 'unavailable' : saved.state);
  return { status: 201, body: { ok: true, configured: true, brand: auth.brand, sample: saved.value.sample, task: saved.value.task } };
}

export async function handleMedia(ctx: CrmContext, method: 'GET' | 'POST'): Promise<CrmResult> {
  if (method === 'GET') {
    const url = new URL(ctx.request.url);
    const auth = await gate(ctx, url.searchParams.get('brand'));
    if (isResult(auth)) return auth;
    const id = url.searchParams.get('id') || '';
    if (!parseUuid(id)) return { status: 400, body: { ok: false, reason: 'Media was not found in this brand.' } };
    const rows = await ctx.store.listMedia(auth.brand);
    if (rows.state !== 'ok') return storageBody(auth.brand, rows.state === 'rejected' || rows.state === 'missing' ? 'unavailable' : rows.state);
    const media = rows.value.find((row) => row.id === id);
    if (!media) return { status: 404, body: { ok: false, reason: 'Media was not found in this brand.' } };
    const client = getSupabaseServerClient();
    if (!client) return storageBody(auth.brand, 'absent');
    const signed = await client.storage.from(FIELD_BUCKET).createSignedUrl(media.storagePath, READ_URL_SECONDS);
    if (signed.error || !signed.data?.signedUrl) return { status: 503, body: { ok: false, reason: 'The file could not be signed.' } };
    return { status: 200, body: { ok: true, configured: true, brand: auth.brand, url: signed.data.signedUrl, expiresIn: READ_URL_SECONDS } };
  }
  const body = await readBody(ctx.request);
  if (isCrmResult(body)) return body;
  const record = (body ?? {}) as Record<string, unknown>;
  const auth = await gate(ctx, typeof record.brand === 'string' ? record.brand : null);
  if (isResult(auth)) return auth;
  const checked = validateMediaUpload(record);
  if (!checked.ok) return { status: 400, body: { ok: false, reason: checked.reason } };
  const accountId = typeof record.accountId === 'string' ? record.accountId : '';
  if (!parseUuid(accountId)) return { status: 400, body: { ok: false, reason: 'Account is not in this brand.' } };
  const visitId = record.visitId === undefined || record.visitId === null || record.visitId === '' ? null : record.visitId;
  if (visitId !== null && (typeof visitId !== 'string' || !parseUuid(visitId))) return { status: 400, body: { ok: false, reason: 'Visit was not found in this brand.' } };
  const id = crypto.randomUUID();
  const path = mediaPath(auth.brand, accountId, id, checked.ext);
  const created = await ctx.store.createMedia(auth.brand, auth.actorId, {
    id,
    accountId,
    visitId,
    kind: checked.kind,
    storagePath: path,
    contentType: checked.contentType,
    byteSize: checked.byteSize,
    durationSeconds: checked.durationSeconds,
  });
  if (created.state === 'rejected') return { status: 400, body: { ok: false, reason: 'Account is not in this brand.' } };
  if (created.state !== 'ok') return storageBody(auth.brand, created.state === 'missing' ? 'unavailable' : created.state);
  const client = getSupabaseServerClient();
  if (!client) return { status: 201, body: { ok: true, configured: false, brand: auth.brand, media: { ...created.value, storagePath: path }, uploadUrl: null, token: null } };
  const signed = await client.storage.from(FIELD_BUCKET).createSignedUploadUrl(path);
  if (signed.error || !signed.data) return { status: 503, body: { ok: false, reason: 'The upload could not be signed.' } };
  return { status: 201, body: { ok: true, configured: true, brand: auth.brand, media: { ...created.value, storagePath: path }, uploadUrl: signed.data.signedUrl, token: signed.data.token, path } };
}

export async function handleHealth(ctx: CrmContext): Promise<CrmResult> {
  const url = new URL(ctx.request.url);
  const auth = await gate(ctx, url.searchParams.get('brand'));
  if (isResult(auth)) return auth;
  const ready = await ctx.store.counts(auth.brand);
  const adapters = {
    canix: { connected: false, label: CANIX_NOT_CONNECTED, lastSuccessAt: null, exceptions: 'Not configured' },
    hoodie: { connected: false, label: HOODIE_NOT_CONNECTED, lastSuccessAt: null, exceptions: 'Not configured' },
    mirror: mirrorContract(),
    adaptersConnected: false,
  };
  const orders = await ctx.store.listDistributorOrders(auth.brand);
  const latestNabis = orders.state === 'ok'
    ? orders.value.filter((row) => row.distributor === 'nabis').sort((a, b) => (a.importedAt < b.importedAt ? 1 : -1))[0]
    : undefined;
  const nabisLabel = nabisHealthLine(latestNabis?.importedAt ?? null, latestNabis?.source ?? null);
  if (ready.state !== 'ok') {
    const absent = ready.state === 'absent';
    return {
      status: 503,
      body: {
        ok: false,
        configured: false,
        storage: absent ? 'absent' : 'unavailable',
        brand: auth.brand,
        reason: absent ? 'CRM storage is not configured.' : 'CRM storage could not be read.',
        detail: absent ? 'schema_absent' : 'read_failed',
        ...adapters,
        nabisLabel,
      },
    };
  }
  return {
    status: 200,
    body: {
      ok: true,
      configured: true,
      storage: 'ready',
      brand: auth.brand,
      ...adapters,
      nabisLabel,
    },
  };
}

export async function handleDistributorOrders(ctx: CrmContext, method: 'GET' | 'POST'): Promise<CrmResult> {
  if (method === 'GET') {
    const url = new URL(ctx.request.url);
    const auth = await gate(ctx, url.searchParams.get('brand'));
    if (isResult(auth)) return auth;
    const rows = await ctx.store.listDistributorOrders(auth.brand);
    if (rows.state !== 'ok') return storageBody(auth.brand, rows.state === 'rejected' || rows.state === 'missing' ? 'unavailable' : rows.state);
    return { status: 200, body: { ok: true, configured: true, brand: auth.brand, orders: rows.value } };
  }
  const body = await readBody(ctx.request);
  if (isCrmResult(body)) return body;
  const record = (body ?? {}) as Record<string, unknown>;
  const auth = await gate(ctx, typeof record.brand === 'string' ? record.brand : null);
  if (isResult(auth)) return auth;
  const orderId = typeof record.orderId === 'string' ? record.orderId : '';
  if (!parseUuid(orderId)) return { status: 400, body: { ok: false, reason: 'Order was not found in this brand.' } };
  if (record.action === 'link') {
    const accountId = typeof record.accountId === 'string' ? record.accountId : '';
    if (!parseUuid(accountId)) return { status: 400, body: { ok: false, reason: 'Account is not in this brand.' } };
    const linked = await ctx.store.linkDistributorOrder(auth.brand, orderId, accountId);
    if (linked.state === 'rejected' || linked.state === 'missing') return { status: 400, body: { ok: false, reason: 'That account is not in this brand.' } };
    if (linked.state !== 'ok') return storageBody(auth.brand, linked.state);
    return { status: 200, body: { ok: true, configured: true, brand: auth.brand, order: linked.value } };
  }
  if (record.action === 'win') {
    const opportunityId = typeof record.opportunityId === 'string' ? record.opportunityId : '';
    if (!parseUuid(opportunityId)) return { status: 400, body: { ok: false, reason: 'Deal was not found in this brand.' } };
    const won = await ctx.store.markDealWonFromOrder(auth.brand, auth.actorId, orderId, opportunityId);
    if (won.state === 'rejected' || won.state === 'missing') return { status: 400, body: { ok: false, reason: 'The deal was not marked won. It must be an open deal on the matched account.' } };
    if (won.state !== 'ok') return storageBody(auth.brand, won.state);
    return { status: 200, body: { ok: true, configured: true, brand: auth.brand, order: won.value.order, stage: won.value.stage } };
  }
  return { status: 400, body: { ok: false, reason: 'Order action is not recognized.' } };
}

export async function handleNotes(ctx: CrmContext, method: 'GET' | 'POST'): Promise<CrmResult> {
  if (method === 'GET') {
    const url = new URL(ctx.request.url);
    const auth = await gate(ctx, url.searchParams.get('brand'));
    if (isResult(auth)) return auth;
    const accountId = url.searchParams.get('accountId');
    if (accountId && !parseUuid(accountId)) return { status: 400, body: { ok: false, reason: 'Account is not in this brand.' } };
    const rows = await ctx.store.listNotes(auth.brand, accountId);
    if (rows.state !== 'ok') return storageBody(auth.brand, rows.state === 'rejected' || rows.state === 'missing' ? 'unavailable' : rows.state);
    return { status: 200, body: { ok: true, configured: true, brand: auth.brand, notes: rows.value } };
  }
  const body = await readBody(ctx.request);
  if (isCrmResult(body)) return body;
  const record = (body ?? {}) as Record<string, unknown>;
  const auth = await gate(ctx, typeof record.brand === 'string' ? record.brand : null);
  if (isResult(auth)) return auth;
  const parsed = parseNote(record);
  if (!parsed.ok) return { status: 400, body: { ok: false, reason: parsed.reason } };
  const created = await ctx.store.createNote(auth.brand, auth.actorId, { accountId: parsed.accountId, body: parsed.text });
  if (created.state === 'rejected') return { status: 400, body: { ok: false, reason: 'The related record is not in this brand.' } };
  if (created.state !== 'ok') return storageBody(auth.brand, created.state === 'missing' ? 'unavailable' : created.state);
  return { status: 201, body: { ok: true, configured: true, brand: auth.brand, note: created.value } };
}

function publicMiss(): CrmResult {
  return { status: 404, body: { ok: false, reason: LINK_MISS } };
}

function limited(): CrmResult {
  return { status: 429, body: { ok: false, reason: 'Too many attempts. Wait and try again.' } };
}

export async function handleBatches(ctx: CrmContext, method: 'GET' | 'POST' | 'PATCH'): Promise<CrmResult> {
  if (method === 'GET') {
    const url = new URL(ctx.request.url);
    const auth = await gate(ctx, url.searchParams.get('brand'));
    if (isResult(auth)) return auth;
    const rows = await ctx.store.listBatches(auth.brand);
    if (rows.state !== 'ok') return storageBody(auth.brand, rows.state === 'rejected' || rows.state === 'missing' ? 'unavailable' : rows.state);
    return { status: 200, body: { ok: true, configured: true, brand: auth.brand, batches: rows.value } };
  }
  const body = await readBody(ctx.request);
  if (isCrmResult(body)) return body;
  const record = (body ?? {}) as Record<string, unknown>;
  const auth = await gate(ctx, typeof record.brand === 'string' ? record.brand : null);
  if (isResult(auth)) return auth;
  if (!canExport(auth.role)) return { status: 403, body: { ok: false, reason: 'Only an owner or administrator can manage batches.' } };
  if (method === 'PATCH') {
    const id = typeof record.id === 'string' ? record.id : '';
    if (!parseUuid(id)) return { status: 400, body: { ok: false, reason: 'Batch was not found in this brand.' } };
    const saved = await ctx.store.releaseBatch(auth.brand, id);
    if (saved.state === 'missing' || saved.state === 'rejected') return { status: 400, body: { ok: false, reason: 'Batch was not found in this brand, or it has no lab report.' } };
    if (saved.state !== 'ok') return storageBody(auth.brand, saved.state);
    return { status: 200, body: { ok: true, configured: true, brand: auth.brand, batch: saved.value } };
  }
  const parsed = parseBatchWrite(record);
  if (!parsed.ok) return { status: 400, body: { ok: false, reason: parsed.reason } };
  const file = validateCoaUpload(record);
  if (!file.ok) return { status: 400, body: { ok: false, reason: file.reason } };
  const id = crypto.randomUUID();
  const path = coaPath(auth.brand, id);
  const created = await ctx.store.createBatch(auth.brand, auth.actorId, { id, ...parsed.value, coaStoragePath: path });
  if (created.state === 'rejected') return { status: 400, body: { ok: false, reason: 'That batch number is already recorded in this brand.' } };
  if (created.state !== 'ok') return storageBody(auth.brand, created.state === 'missing' ? 'unavailable' : created.state);
  const client = getSupabaseServerClient();
  if (!client) return { status: 201, body: { ok: true, configured: false, brand: auth.brand, batch: created.value, uploadUrl: null, token: null } };
  const signed = await client.storage.from(COA_BUCKET).createSignedUploadUrl(path);
  if (signed.error || !signed.data) return { status: 503, body: { ok: false, reason: 'The upload could not be signed.' } };
  return { status: 201, body: { ok: true, configured: true, brand: auth.brand, batch: created.value, uploadUrl: signed.data.signedUrl, token: signed.data.token, path } };
}

export async function handleReorderLinks(ctx: CrmContext, method: 'GET' | 'POST' | 'PATCH'): Promise<CrmResult> {
  if (method === 'GET') {
    const url = new URL(ctx.request.url);
    const auth = await gate(ctx, url.searchParams.get('brand'));
    if (isResult(auth)) return auth;
    const accountId = url.searchParams.get('accountId') || '';
    if (!parseUuid(accountId)) return { status: 400, body: { ok: false, reason: 'Account is not in this brand.' } };
    const rows = await ctx.store.listReorderLinks(auth.brand, accountId);
    if (rows.state !== 'ok') return storageBody(auth.brand, rows.state === 'rejected' || rows.state === 'missing' ? 'unavailable' : rows.state);
    const since = new Date(Date.now() - EMAIL_STATUS_DAYS * 86400000).toISOString();
    const logs = await ctx.store.listEmailLogs(auth.brand, since, accountId);
    return {
      status: 200,
      body: {
        ok: true,
        configured: Boolean(process.env.RESEND_API_KEY),
        brand: auth.brand,
        links: rows.value.map((row) => ({ id: row.id, accountId: row.accountId, expiresAt: row.expiresAt, revokedAt: row.revokedAt, createdAt: row.createdAt })),
        emailStatus: logs.state === 'ok' ? logs.value.filter((row) => row.kind === 'reorder_link' && row.brand === auth.brand).map(emailStatusRow) : [],
      },
    };
  }
  const body = await readBody(ctx.request);
  if (isCrmResult(body)) return body;
  const record = (body ?? {}) as Record<string, unknown>;
  const auth = await gate(ctx, typeof record.brand === 'string' ? record.brand : null);
  if (isResult(auth)) return auth;
  if (method === 'PATCH') {
    const id = typeof record.id === 'string' ? record.id : '';
    if (!parseUuid(id)) return { status: 400, body: { ok: false, reason: 'Reorder link was not found in this brand.' } };
    const saved = await ctx.store.revokeReorderLink(auth.brand, id, Date.now());
    if (saved.state === 'missing' || saved.state === 'rejected') return { status: 404, body: { ok: false, reason: 'Reorder link was not found in this brand.' } };
    if (saved.state !== 'ok') return storageBody(auth.brand, saved.state);
    return { status: 200, body: { ok: true, configured: true, brand: auth.brand, link: { id: saved.value.id, revokedAt: saved.value.revokedAt } } };
  }
  const accountId = typeof record.accountId === 'string' ? record.accountId : '';
  if (!parseUuid(accountId)) return { status: 400, body: { ok: false, reason: 'Account is not in this brand.' } };
  const created = await ctx.store.createReorderLink(auth.brand, auth.actorId, accountId, Date.now());
  if (created.state === 'rejected') return { status: 400, body: { ok: false, reason: 'Account is not in this brand.' } };
  if (created.state !== 'ok') return storageBody(auth.brand, created.state === 'missing' ? 'unavailable' : created.state);
  const origin = new URL(ctx.request.url).origin;
  const url = `${origin}/reorder/${created.value.token}`;
  const email = typeof record.email === 'string' ? record.email.trim() : '';
  let emailed = false;
  let logFailed = false;
  if (email) {
    const account = await ctx.store.listAccounts(auth.brand, { q: null, status: null });
    const name = account.state === 'ok' ? account.value.find((row) => row.id === accountId)?.displayName || 'Account' : 'Account';
    const mailed = await deliverReorder({ to: email, accountName: name, url });
    emailed = mailed.sent && Boolean(mailed.id);
    if (mailed.id) {
      const logged = await ctx.store.insertEmailLog(auth.brand, auth.actorId, { kind: 'reorder_link', resendId: mailed.id, recipient: email, accountId });
      logFailed = logged.state !== 'ok';
    } else if (mailed.sent) logFailed = true;
  }
  const since = new Date(Date.now() - EMAIL_STATUS_DAYS * 86400000).toISOString();
  const logs = await ctx.store.listEmailLogs(auth.brand, since, accountId);
  return {
    status: 201,
    body: {
      ok: true,
      configured: true,
      brand: auth.brand,
      url,
      expiresAt: created.value.link.expiresAt,
      emailed,
      logFailed,
      reason: logFailed ? 'The email was sent. The status log was not saved.' : undefined,
      emailStatus: logs.state === 'ok' ? logs.value.filter((row) => row.kind === 'reorder_link').map(emailStatusRow) : [],
    },
  };
}

function catalog(accountName: string, batches: { id: string; productId: string; batchNumber: string; labName: string; testedOn: string }[]) {
  return {
    ok: true,
    accountName,
    products: PRODUCTS.map((product) => {
      const batch = batches.find((row) => row.productId === product.slug) ?? null;
      return {
        productId: product.slug,
        name: product.name,
        spec: product.spec,
        batch: batch ? { id: batch.id, batchNumber: batch.batchNumber, labName: batch.labName, testedOn: batch.testedOn } : null,
      };
    }),
  };
}

export async function handlePublicReorder(store: CrmStore, request: Request, token: string, method: 'GET' | 'POST'): Promise<CrmResult> {
  const now = Date.now();
  const ip = clientIp(request.headers.get('x-forwarded-for'));
  const ipLimited = consumeRate(`ip:${ip}`, now);
  if (!tokenShapeOk(token)) return ipLimited ? limited() : publicMiss();
  if (ipLimited || consumeRate(`reorder:${token}`, now)) return limited();
  if (method === 'POST') {
    const origin = request.headers.get('origin');
    const site = request.headers.get('sec-fetch-site');
    if (site && site !== 'same-origin') return { status: 403, body: { ok: false, reason: 'Request was rejected.' } };
    if (!origin || origin !== new URL(request.url).origin) return { status: 403, body: { ok: false, reason: 'Request was rejected.' } };
  }
  const opened = await store.openReorder(token, now);
  if (opened.state !== 'ok') return storageBody('cedargrowth', opened.state === 'rejected' || opened.state === 'missing' ? 'unavailable' : opened.state);
  if (opened.value.status !== 'ok') return publicMiss();
  if (method === 'GET') return { status: 200, body: catalog(opened.value.accountName, opened.value.batches) };
  const body = await readBody(request);
  if (isCrmResult(body)) return body;
  const record = (body ?? {}) as Record<string, unknown>;
  const buyer = parseBuyer(record);
  if (!buyer.ok) return { status: 400, body: { ok: false, reason: buyer.reason } };
  const lines = parseReorderLines(record.lines, opened.value.batches);
  if (!lines.ok) return { status: 400, body: { ok: false, reason: lines.reason } };
  const saved = await store.submitReorder(token, now, { lines: lines.lines, buyerName: buyer.buyerName, buyerEmail: buyer.buyerEmail, note: buyer.note });
  if (saved.state === 'closed') return publicMiss();
  if (saved.state === 'rejected') return { status: 400, body: { ok: false, reason: 'That batch is not available.' } };
  if (saved.state !== 'ok') return storageBody('cedargrowth', saved.state === 'absent' ? 'absent' : 'unavailable');
  const recipients = [process.env.RESERVATION_ALERT_TO || ''];
  if (opened.value.assignedRep && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(opened.value.assignedRep)) recipients.push(opened.value.assignedRep);
  await sendReorderRequest({
    to: recipients,
    accountName: opened.value.accountName,
    buyerName: buyer.buyerName,
    buyerEmail: buyer.buyerEmail,
    lines: lines.lines.map((line) => ({ name: PRODUCTS.find((product) => product.slug === line.productId)?.name || line.productId, batchNumber: line.batchNumber, quantityUnits: line.quantityUnits })),
  });
  return { status: 201, body: { ok: true, confirmation: saved.value.confirmation, request: true } };
}

export async function handleReorderReport(store: CrmStore, request: Request, token: string): Promise<CrmResult> {
  const now = Date.now();
  const ip = clientIp(request.headers.get('x-forwarded-for'));
  const ipLimited = consumeRate(`ip:${ip}`, now);
  if (!tokenShapeOk(token)) return ipLimited ? limited() : publicMiss();
  if (ipLimited || consumeRate(`reorder:${token}`, now)) return limited();
  const opened = await store.openReorder(token, now);
  if (opened.state !== 'ok') return storageBody('cedargrowth', opened.state === 'rejected' || opened.state === 'missing' ? 'unavailable' : opened.state);
  if (opened.value.status !== 'ok') return publicMiss();
  const batchId = new URL(request.url).searchParams.get('batchId') || '';
  const batch = opened.value.batches.find((row) => row.id === batchId && row.released && row.coaStoragePath);
  if (!batch || !batch.coaStoragePath) return { status: 404, body: { ok: false, reason: BATCH_MISS } };
  const client = getSupabaseServerClient();
  if (!client) return storageBody('cedargrowth', 'absent');
  const signed = await client.storage.from(COA_BUCKET).createSignedUrl(batch.coaStoragePath, COA_READ_SECONDS);
  if (signed.error || !signed.data?.signedUrl) return { status: 503, body: { ok: false, reason: 'The lab report could not be signed.' } };
  return { status: 200, body: { ok: true, url: signed.data.signedUrl, expiresIn: COA_READ_SECONDS } };
}

export async function handleTransparencyBatch(store: CrmStore, request: Request): Promise<CrmResult> {
  const now = Date.now();
  const ip = clientIp(request.headers.get('x-forwarded-for'));
  if (consumeRate(`transparency:${ip}`, now)) return limited();
  const url = new URL(request.url);
  const batchNumber = (url.searchParams.get('number') || '').trim();
  if (batchNumber.length < 1 || batchNumber.length > 40) return { status: 200, body: { ok: true, found: false, reason: BATCH_MISS } };
  const found = await store.lookupReleasedBatch('cedargrowth', batchNumber);
  if (found.state !== 'ok') return storageBody('cedargrowth', found.state === 'rejected' || found.state === 'missing' ? 'unavailable' : found.state);
  if (!found.value || !found.value.released || !productIdOk(found.value.productId)) return { status: 200, body: { ok: true, found: false, reason: BATCH_MISS } };
  const product = PRODUCTS.find((item) => item.slug === found.value?.productId);
  if (url.searchParams.get('sign') === '1') {
    if (!found.value.coaStoragePath) return { status: 200, body: { ok: true, found: false, reason: BATCH_MISS } };
    const client = getSupabaseServerClient();
    if (!client) return storageBody('cedargrowth', 'absent');
    const signed = await client.storage.from(COA_BUCKET).createSignedUrl(found.value.coaStoragePath, COA_READ_SECONDS);
    if (signed.error || !signed.data?.signedUrl) return { status: 503, body: { ok: false, reason: 'The lab report could not be signed.' } };
    return { status: 200, body: { ok: true, found: true, url: signed.data.signedUrl, expiresIn: COA_READ_SECONDS } };
  }
  return {
    status: 200,
    body: {
      ok: true,
      found: true,
      batch: {
        id: found.value.id,
        batchNumber: found.value.batchNumber,
        product: product?.name || found.value.productId,
        labName: found.value.labName,
        testedOn: found.value.testedOn,
      },
    },
  };
}

let deliverDigest = sendDigestEmail;
export function useDigestDelivery(fn: typeof sendDigestEmail | null): void {
  deliverDigest = fn ?? sendDigestEmail;
}

let deliverReorder = sendReorderLink;
export function useReorderDelivery(fn: typeof sendReorderLink | null): void {
  deliverReorder = fn ?? sendReorderLink;
}

let lookupEvent = readResendEvent;
export function useEmailLookup(fn: typeof readResendEvent | null): void {
  lookupEvent = fn ?? readResendEvent;
}

function emailStatusRow(row: { recipient: string; lastEvent: string | null; lastEventAt: string | null; brand: CrmBrand }) {
  return { recipient: row.recipient, label: emailStatusLabel(row.lastEvent), lastEventAt: row.lastEventAt, brand: row.brand };
}

async function loadDigest(store: CrmStore, brand: CrmBrand, nowMs: number): Promise<{ model: ReturnType<typeof buildDigest> } | CrmResult> {
  const [all, notes, orders, visits, events, capacity] = await Promise.all([
    store.exportBrand(brand),
    store.listNotes(brand, null),
    store.listDistributorOrders(brand),
    store.listVisits(brand),
    store.listStageEvents(brand),
    store.listCapacity(brand),
  ]);
  if (all.state !== 'ok') return storageBody(brand, all.state === 'rejected' || all.state === 'missing' ? 'unavailable' : all.state);
  if (notes.state !== 'ok') return storageBody(brand, notes.state === 'rejected' || notes.state === 'missing' ? 'unavailable' : notes.state);
  if (events.state !== 'ok' && events.state !== 'absent') return storageBody(brand, events.state === 'rejected' || events.state === 'missing' ? 'unavailable' : events.state);
  if (capacity.state !== 'ok' && capacity.state !== 'absent') return storageBody(brand, capacity.state === 'rejected' || capacity.state === 'missing' ? 'unavailable' : capacity.state);
  const today = nyWeek(nowMs).today;
  const forecast = events.state === 'ok' && capacity.state === 'ok'
    ? productionForecast({ opportunities: all.value.opportunities, capacity: capacity.value, rates: stageWinRates(events.value, all.value.opportunities), months: monthStarts(today, 6) })
    : { shorts: [] as string[] };
  const model = buildDigest({
    brand,
    nowMs,
    accounts: all.value.accounts,
    opportunities: all.value.opportunities,
    tasks: all.value.tasks,
    activity: all.value.activity,
    notes: notes.value,
    visits: visits.state === 'ok' ? visits.value : [],
    orders: orders.state === 'ok' ? orders.value : [],
    events: events.state === 'ok' ? events.value : [],
    contacts: all.value.contacts.map((row) => ({ brand: row.brand, name: row.name, email: row.email, phone: row.phone, preference: row.preference })),
    shorts: forecast.shorts,
  });
  return { model };
}

export async function handleDigestPreview(ctx: CrmContext): Promise<CrmResult> {
  const url = new URL(ctx.request.url);
  const auth = await gate(ctx, url.searchParams.get('brand'));
  if (isResult(auth)) return auth;
  if (!canExport(auth.role)) return { status: 403, body: { ok: false, reason: 'Only an owner or administrator can preview the digest.' } };
  const loaded = await loadDigest(ctx.store, auth.brand, Date.now());
  if ('status' in loaded) return loaded;
  const prior = await ctx.store.findDigestSend(auth.brand, digestSummary(loaded.model.weekKey));
  if (prior.state !== 'ok') return storageBody(auth.brand, prior.state === 'rejected' || prior.state === 'missing' ? 'unavailable' : prior.state);
  const since = new Date(Date.now() - EMAIL_STATUS_DAYS * 86400000).toISOString();
  const logs = await ctx.store.listEmailLogs(auth.brand, since);
  return {
    status: 200,
    body: {
      ok: true,
      configured: digestConfigured(auth.brand),
      recipients: digestRecipients(auth.brand),
      lastSent: prior.value?.createdAt ?? null,
      weekLabel: loaded.model.weekLabel,
      html: renderDigestHtml(loaded.model),
      text: renderDigestText(loaded.model),
      statuses: logs.state === 'ok' ? logs.value.filter((row) => row.kind === 'digest' && row.brand === auth.brand).map(emailStatusRow) : [],
    },
  };
}

export async function handleDigestSend(ctx: CrmContext): Promise<CrmResult> {
  const body = await readBody(ctx.request);
  if (isCrmResult(body)) return body;
  const record = (body ?? {}) as Record<string, unknown>;
  const brand = parseBrand(typeof record.brand === 'string' ? record.brand : null);
  if (!brand) return { status: 400, body: { ok: false, reason: 'Brand is required.' } };
  const secretOk = secretMatches(ctx.request.headers.get('x-crm-digest-secret'), process.env.CRM_DIGEST_SECRET);
  let actor = 'digest schedule';
  let owner = false;
  if (!secretOk) {
    if (!ctx.actorId) return { status: 401, body: { ok: false, reason: 'The digest secret was rejected.' } };
    const auth = await gate(ctx, brand);
    if (isResult(auth)) return auth.status === 404 ? { status: 401, body: { ok: false, reason: 'The digest secret was rejected.' } } : auth;
    if (!canExport(auth.role)) return { status: 403, body: { ok: false, reason: 'Only an owner or administrator can send the digest.' } };
    actor = auth.actorId;
    owner = auth.role === 'owner';
  }
  if (record.force === true && !owner) return { status: 403, body: { ok: false, reason: 'Only an owner can send the digest again for this week.' } };
  if (!digestConfigured(brand)) return { status: 200, body: { ok: true, sent: false, reason: 'Email is not configured.' } };
  const from = digestFromAddress();
  const recipients = digestRecipients(brand);
  if (!from) return { status: 200, body: { ok: true, sent: false, reason: 'Email is not configured.' } };
  const loaded = await loadDigest(ctx.store, brand, Date.now());
  if ('status' in loaded) return loaded;
  const summary = digestSummary(loaded.model.weekKey);
  const prior = await ctx.store.findDigestSend(brand, summary);
  if (prior.state !== 'ok') return storageBody(brand, prior.state === 'rejected' || prior.state === 'missing' ? 'unavailable' : prior.state);
  if (prior.value && record.force !== true) return { status: 409, body: { ok: false, reason: 'This week was already sent.' } };
  const brandName = brand === 'bond' ? 'Bond' : 'CedarGrowth';
  const sent = await deliverDigest({
    to: recipients,
    from,
    subject: `${brandName} weekly digest, ${loaded.model.weekLabel}`,
    html: renderDigestHtml(loaded.model),
    text: renderDigestText(loaded.model),
  });
  if (!sent.sent) return { status: 502, body: { ok: false, sent: false, reason: 'The digest was not sent.' } };
  let logFailed = sent.messages.length !== recipients.length;
  for (const message of sent.messages) {
    if (!message.id) { logFailed = true; continue; }
    const logged = await ctx.store.insertEmailLog(brand, actor, { kind: 'digest', resendId: message.id, recipient: message.recipient, accountId: null });
    if (logged.state !== 'ok') logFailed = true;
  }
  const saved = await ctx.store.recordDigest(brand, actor, summary);
  if (saved.state !== 'ok') return storageBody(brand, saved.state === 'rejected' || saved.state === 'missing' ? 'unavailable' : saved.state);
  return {
    status: 200,
    body: {
      ok: true,
      sent: true,
      weekKey: loaded.model.weekKey,
      logFailed,
      reason: logFailed ? 'The email was sent. The status log was not saved.' : undefined,
    },
  };
}

export async function handleEmailStatusRefresh(ctx: CrmContext): Promise<CrmResult> {
  const url = new URL(ctx.request.url);
  const auth = await gate(ctx, url.searchParams.get('brand'));
  if (isResult(auth)) return auth;
  if (!canExport(auth.role)) return { status: 403, body: { ok: false, reason: 'Only an owner or administrator can refresh email status.' } };
  if (!process.env.RESEND_API_KEY) return { status: 200, body: { ok: true, configured: false, updated: 0, reason: 'Email is not configured' } };
  if (emailRefreshLimited(`${auth.brand}:${auth.actorId}`, Date.now())) return { status: 429, body: { ok: false, reason: 'Too many status checks. Wait and try again.' } };
  const since = new Date(Date.now() - EMAIL_STATUS_DAYS * 86400000).toISOString();
  const rows = await ctx.store.listEmailLogs(auth.brand, since);
  if (rows.state !== 'ok') return storageBody(auth.brand, rows.state === 'rejected' || rows.state === 'missing' ? 'unavailable' : rows.state);
  const batch = rows.value.filter((row) => row.brand === auth.brand).slice(0, EMAIL_STATUS_CAP);
  const observed = new Date().toISOString();
  let updated = 0;
  for (const row of batch) {
    const event = knownEmailEvent(await lookupEvent(row.resendId));
    if (!event) continue;
    const saved = await ctx.store.updateEmailLog(auth.brand, row.id, event, observed);
    if (saved.state === 'ok' && saved.value.brand === auth.brand) updated += 1;
  }
  return { status: 200, body: { ok: true, configured: true, updated, capped: rows.value.length > EMAIL_STATUS_CAP } };
}

async function territoryBundle(store: CrmStore, brand: CrmBrand) {
  const [all, notes, orders, visits, events, territories, retailers, dismissals] = await Promise.all([
    store.exportBrand(brand),
    store.listNotes(brand, null),
    store.listDistributorOrders(brand),
    store.listVisits(brand),
    store.listStageEvents(brand),
    store.listTerritories(brand),
    store.listMarketRetailers(brand),
    store.listDismissals(brand),
  ]);
  if (all.state !== 'ok') return storageBody(brand, all.state === 'rejected' || all.state === 'missing' ? 'unavailable' : all.state);
  return {
    accounts: all.value.accounts,
    deals: all.value.opportunities,
    tasks: all.value.tasks,
    notes: notes.state === 'ok' ? notes.value : null,
    orders: orders.state === 'ok' ? orders.value : null,
    visits: visits.state === 'ok' ? visits.value : null,
    events: events.state === 'ok' ? events.value : null,
    territories: territories.state === 'ok' ? territories.value : [],
    retailers: retailers.state === 'ok' ? retailers.value : [],
    dismissals: dismissals.state === 'ok' ? dismissals.value : [],
  };
}

export async function handleTerritory(ctx: CrmContext): Promise<CrmResult> {
  const url = new URL(ctx.request.url);
  const auth = await gate(ctx, url.searchParams.get('brand'));
  if (isResult(auth)) return auth;
  const metric = (TERRITORY_METRICS as readonly string[]).includes(url.searchParams.get('metric') || '') ? url.searchParams.get('metric') as TerritoryMetric : 'accounts';
  const loaded = await territoryBundle(ctx.store, auth.brand);
  if ('status' in loaded) return loaded;
  const today = new Date().toISOString().slice(0, 10);
  const view = territoryTiles({
    brand: auth.brand,
    metric,
    today,
    accounts: loaded.accounts,
    deals: loaded.deals,
    orders: loaded.orders,
    visits: loaded.visits,
    territories: loaded.territories,
  });
  const latest = loaded.retailers.map((row) => row.uploadedAt).sort().at(-1) ?? null;
  return {
    status: 200,
    body: {
      ok: true,
      configured: true,
      brand: auth.brand,
      metric,
      tiles: view.tiles,
      invoicedLabel: view.invoicedLabel,
      unknown: view.unknown.map((row) => ({ id: row.id, displayName: row.displayName, county: row.county })),
      coverage: NY_REGIONS.map((region) => ({ region, label: coverageLabel({ region, accounts: loaded.accounts, retailers: loaded.retailers }) })),
      coverageSource: latest ? `From state list uploaded ${latest.slice(0, 10)}` : COVERAGE_UPLOAD,
      marketShare: NEEDS_HOODIE,
      territories: loaded.territories,
    },
  };
}

export async function handleTerritoryAssign(ctx: CrmContext): Promise<CrmResult> {
  const body = await readBody(ctx.request);
  if (isCrmResult(body)) return body;
  const record = (body ?? {}) as Record<string, unknown>;
  const auth = await gate(ctx, typeof record.brand === 'string' ? record.brand : null);
  if (isResult(auth)) return auth;
  if (!canExport(auth.role)) return { status: 403, body: { ok: false, reason: 'Only an owner or administrator can assign a territory.' } };
  const region = typeof record.region === 'string' ? record.region : '';
  if (!(NY_REGIONS as readonly string[]).includes(region)) return { status: 400, body: { ok: false, reason: 'Region is not recognized.' } };
  const rep = typeof record.repActor === 'string' ? record.repActor.trim() : '';
  if (!rep) {
    const cleared = await ctx.store.clearTerritory(auth.brand, region);
    if (cleared.state !== 'ok') return storageBody(auth.brand, cleared.state === 'rejected' || cleared.state === 'missing' ? 'unavailable' : cleared.state);
    return { status: 200, body: { ok: true, brand: auth.brand, cleared: true } };
  }
  const saved = await ctx.store.assignTerritory(auth.brand, region, rep);
  if (saved.state !== 'ok') return storageBody(auth.brand, saved.state === 'rejected' || saved.state === 'missing' ? 'unavailable' : saved.state);
  return { status: 200, body: { ok: true, brand: auth.brand, territory: saved.value } };
}

export async function handleActions(ctx: CrmContext, method: 'GET' | 'POST'): Promise<CrmResult> {
  if (method === 'POST') {
    const body = await readBody(ctx.request);
    if (isCrmResult(body)) return body;
    const record = (body ?? {}) as Record<string, unknown>;
    const auth = await gate(ctx, typeof record.brand === 'string' ? record.brand : null);
    if (isResult(auth)) return auth;
    const rep = typeof record.repActor === 'string' ? record.repActor.trim() : auth.actorId;
    if (!canExport(auth.role) && rep !== auth.actorId) return { status: 403, body: { ok: false, reason: 'You can snooze only your own actions.' } };
    const actionKey = typeof record.actionKey === 'string' ? record.actionKey.trim() : '';
    const mode = record.mode === 'done' ? 'done' : record.mode === 'snooze' ? 'snooze' : null;
    if (!actionKey || !mode) return { status: 400, body: { ok: false, reason: 'Action could not be read.' } };
    const today = new Date().toISOString().slice(0, 10);
    const saved = await ctx.store.upsertDismissal(auth.brand, rep, actionKey, snoozeUntil(today, mode));
    if (saved.state !== 'ok') return storageBody(auth.brand, saved.state === 'rejected' || saved.state === 'missing' ? 'unavailable' : saved.state);
    return { status: 200, body: { ok: true, brand: auth.brand, dismissal: saved.value } };
  }
  const url = new URL(ctx.request.url);
  const auth = await gate(ctx, url.searchParams.get('brand'));
  if (isResult(auth)) return auth;
  const loaded = await territoryBundle(ctx.store, auth.brand);
  if ('status' in loaded) return loaded;
  const today = new Date().toISOString().slice(0, 10);
  const requested = url.searchParams.get('rep');
  const reps = requested ? [requested] : [...new Set(loaded.accounts.map((row) => (row.assignedRep || '').trim()).filter(Boolean))];
  const visible = canExport(auth.role) ? reps : [auth.actorId];
  const reports = visible.map((rep) => nextBestActions({
    brand: auth.brand,
    rep,
    today,
    accounts: loaded.accounts,
    tasks: loaded.tasks,
    deals: loaded.deals,
    notes: loaded.notes,
    visits: loaded.visits,
    events: loaded.events,
    orders: loaded.orders,
    territories: loaded.territories,
    dismissals: loaded.dismissals,
  }));
  return { status: 200, body: { ok: true, brand: auth.brand, today, reps: visible.map((rep, index) => ({ rep, actions: reports[index].actions })), inactive: reports[0]?.inactive ?? [{ title: 'Out of stock alerts', reason: 'Hoodie not connected.' }] } };
}

export type IntakeHttpResult = { status: number; body: Record<string, unknown>; retryAfter?: number };

export async function handleBondIntake(store: CrmStore, request: Request, options?: { nowMs?: number; env?: Record<string, string | undefined> }): Promise<IntakeHttpResult> {
  const nowMs = options?.nowMs ?? Date.now();
  const secrets = intakeSecrets(options?.env ?? process.env);
  if (!secrets.primary) return { status: 503, body: { ok: false } };
  const declared = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > INTAKE_MAX_BYTES) return { status: 413, body: { ok: false } };
  const rawBuffer = await request.arrayBuffer();
  if (rawBuffer.byteLength > INTAKE_MAX_BYTES) return { status: 413, body: { ok: false } };
  const raw = new TextDecoder().decode(rawBuffer);
  const stamp = request.headers.get('x-cg-timestamp');
  const provided = request.headers.get('x-cg-signature') || '';
  if (!timestampFresh(stamp, nowMs) || !stamp) return { status: 401, body: { ok: false } };
  const primaryOk = signaturesMatch(signIntake(secrets.primary, stamp, raw), provided);
  const nextOk = secrets.next ? signaturesMatch(signIntake(secrets.next, stamp, raw), provided) : false;
  if (!primaryOk && !nextOk) return { status: 401, body: { ok: false } };
  let parsed: unknown = null;
  let parsedOk = false;
  try {
    parsed = JSON.parse(raw);
    parsedOk = true;
  } catch {
    parsedOk = false;
  }
  const source = parsed && typeof parsed === 'object' && !Array.isArray(parsed) && typeof (parsed as { source_route?: unknown }).source_route === 'string'
    ? (parsed as { source_route: string }).source_route.slice(0, 80)
    : 'invalid';
  const rate = takeIntakeRate(source, nowMs);
  if (rate.limited) return { status: 429, body: { ok: false }, retryAfter: rate.retryAfter };
  if (!parsedOk) return { status: 400, body: { ok: false, fields: ['payload'] } };
  const lead = parseIntake(parsed);
  if (!lead.ok) return { status: 400, body: { ok: false, fields: lead.fields } };
  const idempotency = parseUuid(request.headers.get('idempotency-key'));
  if (!idempotency || idempotency !== lead.lead.inquiryId) return { status: 400, body: { ok: false, fields: ['Idempotency-Key'] } };
  try {
    const saved = await store.receiveBondInquiry(lead.lead, new Date(nowMs).toISOString());
    if (saved.state === 'absent') return { status: 503, body: { ok: false } };
    if (saved.state !== 'ok') return { status: 500, body: { ok: false } };
    return saved.value.duplicate ? { status: 200, body: { ok: true, duplicate: true } } : { status: 200, body: { ok: true } };
  } catch {
    return { status: 500, body: { ok: false } };
  }
}

export async function handleAgentIntake(store: CrmStore, request: Request, options?: { nowMs?: number; env?: Record<string, string | undefined> }): Promise<IntakeHttpResult> {
  const nowMs = options?.nowMs ?? Date.now();
  const env = options?.env ?? process.env;
  const secret = agentSecret(env);
  if (!agentReady(env) || !secret) return { status: 503, body: { ok: false } };
  const declared = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > AGENT_MAX_BYTES) return { status: 413, body: { ok: false } };
  const rawBuffer = await request.arrayBuffer();
  if (rawBuffer.byteLength > AGENT_MAX_BYTES) return { status: 413, body: { ok: false } };
  const raw = new TextDecoder().decode(rawBuffer);
  const stamp = request.headers.get('x-cg-timestamp');
  const provided = request.headers.get('x-cg-signature') || '';
  if (!agentTimestampFresh(stamp, nowMs) || !stamp) return { status: 401, body: { ok: false } };
  if (!agentSignatureOk(secret, stamp, raw, provided)) return { status: 401, body: { ok: false } };
  let parsed: unknown = null;
  try { parsed = JSON.parse(raw); } catch { return { status: 400, body: { ok: false, fields: ['payload'] } }; }
  const envelope = parseAgentEnvelope(parsed);
  if (!envelope.ok) return { status: 400, body: { ok: false, fields: envelope.fields } };
  const idempotency = parseUuid(request.headers.get('idempotency-key'));
  if (!idempotency || idempotency !== envelope.requestId) return { status: 400, body: { ok: false, fields: ['Idempotency-Key'] } };
  if (envelope.rows.length > AGENT_ROW_LIMIT) return { status: 413, body: { ok: false } };
  const ops: AgentOp[] = [];
  const rejected: { index: number; reason: string; fields?: string[] }[] = [];
  envelope.rows.forEach((row, index) => {
    const parsedRow = parseAgentRow(index, row);
    if ('op' in parsedRow) ops.push(parsedRow.op);
    else rejected.push({ index: parsedRow.index, reason: parsedRow.reason, ...(parsedRow.fields ? { fields: parsedRow.fields } : {}) });
  });
  try {
    const saved = await store.receiveAgentRecords({ requestId: envelope.requestId, receivedAt: new Date(nowMs).toISOString(), ops });
    if (saved.state === 'absent') return { status: 503, body: { ok: false } };
    if (saved.state !== 'ok') return { status: 500, body: { ok: false } };
    if (saved.value.code === 'replay') return { status: 409, body: { ok: false } };
    if (saved.value.code === 'rate') return { status: 429, body: { ok: false }, retryAfter: saved.value.retryAfter };
    return { status: 200, body: { ok: true, actor: AGENT_ACTOR, created: saved.value.created, skipped: saved.value.skipped, failed: [...rejected, ...saved.value.failed] } };
  } catch {
    return { status: 500, body: { ok: false } };
  }
}

export async function handleIntakeDelete(ctx: CrmContext): Promise<CrmResult> {
  const body = await readBody(ctx.request);
  if (isCrmResult(body)) return body;
  const record = (body ?? {}) as Record<string, unknown>;
  const auth = await gate(ctx, typeof record.brand === 'string' ? record.brand : null);
  if (isResult(auth)) return auth;
  if (!canExport(auth.role)) return { status: 403, body: { ok: false, reason: 'Only an owner or administrator can delete an intake lead.' } };
  if (auth.brand !== 'bond') return { status: 403, body: { ok: false, reason: 'This brand is not assigned.' } };
  const inquiryId = parseUuid(record.inquiryId);
  if (!inquiryId) return { status: 400, body: { ok: false, fields: ['inquiryId'] } };
  const saved = await ctx.store.deleteBondInquiry(inquiryId);
  if (saved.state !== 'ok') return storageBody(auth.brand, saved.state === 'rejected' || saved.state === 'missing' ? 'unavailable' : saved.state);
  if (!saved.value.deleted) return { status: 404, body: { ok: false } };
  return { status: 200, body: { ok: true } };
}

export async function handleIntakePurge(ctx: CrmContext): Promise<CrmResult> {
  const body = await readBody(ctx.request);
  if (isCrmResult(body)) return body;
  const record = (body ?? {}) as Record<string, unknown>;
  const auth = await gate(ctx, typeof record.brand === 'string' ? record.brand : null);
  if (isResult(auth)) return auth;
  if (!canExport(auth.role)) return { status: 403, body: { ok: false, reason: 'Only an owner or administrator can purge intake leads.' } };
  if (auth.brand !== 'bond') return { status: 403, body: { ok: false, reason: 'This brand is not assigned.' } };
  const saved = await ctx.store.purgeBondInquiries(new Date().toISOString());
  if (saved.state !== 'ok') return storageBody(auth.brand, saved.state === 'rejected' || saved.state === 'missing' ? 'unavailable' : saved.state);
  return { status: 200, body: { ok: true, purged: saved.value.purged } };
}

export function staffAudience(hasCedarSalesMembership: boolean): Audience {
  return hasCedarSalesMembership ? { kind: 'staff' } : { kind: 'public' };
}

export function wholesaleBrandOnly(brand: string | null): CrmBrand | null {
  return parseBrand(brand) === WHOLESALE_BRAND ? WHOLESALE_BRAND : null;
}
