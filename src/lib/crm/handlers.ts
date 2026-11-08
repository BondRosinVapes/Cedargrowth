import {
  authorizeCrmRequest,
  brandLabel,
  CANIX_NOT_CONNECTED,
  evaluateDesk,
  formatForecast,
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
    notes: parsed.value.notes ?? '',
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
  const updated = await ctx.store.updateAccount(auth.brand, auth.actorId, id, parsed.value);
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

export function staffAudience(hasCedarSalesMembership: boolean): Audience {
  return hasCedarSalesMembership ? { kind: 'staff' } : { kind: 'public' };
}

export function wholesaleBrandOnly(brand: string | null): CrmBrand | null {
  return parseBrand(brand) === WHOLESALE_BRAND ? WHOLESALE_BRAND : null;
}
