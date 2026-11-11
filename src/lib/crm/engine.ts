// Pure CRM and sales-intelligence rules. No database, no network, no secrets.
// Synthetic fixtures stay in tests. This module never treats a fixture as an
// account finding, and it never calls Canix or Hoodie.

import { parseCounty } from './nyRegions';

export const CRM_BRANDS = ['cedargrowth', 'bond'] as const;
export type CrmBrand = (typeof CRM_BRANDS)[number];

export const CRM_ROUTE = '/admin/crm';
export const CRM_HREF = 'https://cedargrowth.vercel.app/admin/crm';
export const SALES_SIGNIN_PATH = '/sales/signin';
export const SALES_SIGNIN_HREF = 'https://cedargrowth.vercel.app/sales/signin';
export const SALES_AT_COOKIE = 'sales-at';
export const SALES_RT_COOKIE = 'sales-rt';
export const WHOLESALE_ROUTE = '/manufacturing';
export const WHOLESALE_LEGACY_PATH = '/wholesale';
export const WHOLESALE_BRAND: CrmBrand = 'cedargrowth';

export const CANIX_NOT_CONNECTED = 'Canix not connected';
export const HOODIE_NOT_CONNECTED = 'Hoodie not connected';

export const CRM_MARKER = 'x-cedargrowth-crm';

export const INTEL_BOUNDARIES = [
  'A predicted reorder window is not an actual purchase and not a confirmed schedule.',
  'Canix inventory is not proof of competitor or dispensary stock.',
  'Missing data is not low stock.',
  'A menu is not on-hand inventory.',
  'Heat-map category demand is not retailer intent.',
  'Recommendations do not place orders.',
  'In-app alerts are not activated, and this desk does not send email, text, or Slack.',
] as const;

export type AccountStatus = 'prospect' | 'active' | 'paused' | 'closed';
export type OpportunityStage = 'lead' | 'qualification' | 'licensed_buyer_review' | 'proposal' | 'won' | 'lost';
export type TaskStatus = 'open' | 'done';

export const ACCOUNT_TYPES = ['adult_use_dispensary', 'microbusiness', 'distributor', 'registered_organization', 'processor', 'cultivator', 'other'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
export const DISPENSARY_ACCOUNT_TYPES = ['adult_use_dispensary', 'microbusiness', 'registered_organization'] as const;

export function isDispensaryAccount(type: string | null | undefined): boolean {
  return (DISPENSARY_ACCOUNT_TYPES as readonly string[]).includes(type || '');
}
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  adult_use_dispensary: 'Adult-use dispensary',
  microbusiness: 'Microbusiness',
  distributor: 'Distributor',
  registered_organization: 'Registered organization',
  processor: 'Processor',
  cultivator: 'Cultivator',
  other: 'Other',
};
export const LEAD_SOURCES = ['referral', 'leaflink', 'trade_show', 'cold_outreach', 'website', 'hoodie', 'existing_relationship', 'other', 'bond_inquiry'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];
export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  referral: 'Referral',
  leaflink: 'LeafLink',
  trade_show: 'Trade show',
  cold_outreach: 'Cold outreach',
  website: 'Website',
  hoodie: 'Hoodie',
  existing_relationship: 'Existing relationship',
  other: 'Other',
  bond_inquiry: 'Bond inquiry',
};

const ACCOUNT_STATUS: readonly AccountStatus[] = ['prospect', 'active', 'paused', 'closed'];
export const OPPORTUNITY_STAGES: readonly OpportunityStage[] = ['lead', 'qualification', 'licensed_buyer_review', 'proposal', 'won', 'lost'];
const STAGES = OPPORTUNITY_STAGES;
export const OPEN_STAGES: readonly OpportunityStage[] = ['lead', 'qualification', 'licensed_buyer_review', 'proposal'];
export const PRODUCT_LINES = ['vape', 'preroll', 'gummy', 'other'] as const;
export type ProductLine = (typeof PRODUCT_LINES)[number];
export const PRODUCT_LINE_LABELS: Record<ProductLine, string> = {
  vape: 'Vape',
  preroll: 'Pre-roll',
  gummy: 'Gummy',
  other: 'Other',
};
const TASK_STATUS: readonly TaskStatus[] = ['open', 'done'];

export function parseBrand(value: unknown): CrmBrand | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (v === 'cedargrowth' || v === 'bond') return v;
  return null;
}

export function brandLabel(brand: CrmBrand): string {
  return brand === 'cedargrowth' ? 'CedarGrowth' : 'Bond';
}

export function namespacedId(brand: CrmBrand, entity: string, id: string): string {
  return `crm:${brand}:${entity}:${id}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return UUID_RE.test(v) ? v.toLowerCase() : null;
}

export function plainSearch(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().replace(/[%_\\]/g, '').slice(0, 80);
  return cleaned ? cleaned : null;
}

export function isolateBrand<T extends { brand: CrmBrand }>(
  rows: readonly T[],
  brand: CrmBrand,
): { ok: true; rows: T[] } | { ok: false } {
  if (rows.some((row) => row.brand !== brand)) return { ok: false };
  return { ok: true, rows: rows.slice() };
}

export function sameContact(
  a: { id: string; email: string | null },
  b: { id: string; email: string | null },
): boolean {
  return a.id === b.id;
}

export type DeskRole = 'owner' | 'administrator' | 'salesperson';
export type MembershipRole = 'administrator' | 'salesperson';

export type DeskGrant = { brand: CrmBrand; role: DeskRole };

export type Authz =
  | { ok: true; actorId: string; brand: CrmBrand; role: DeskRole }
  | { ok: false; status: number; reason: string };

export function authorizeCrmRequest(input: {
  actorId: string | null;
  grants: readonly DeskGrant[];
  method: string;
  requestOrigin: string;
  headerOrigin: string | null;
  headerMarker: string | null;
  headerFetchSite: string | null;
  brandRaw: string | null;
}): Authz {
  if (!input.actorId) return { ok: false, status: 404, reason: 'Not found' };
  if (input.grants.length === 0) return { ok: false, status: 403, reason: 'Sales access is not provisioned.' };
  if (input.headerMarker !== '1') return { ok: false, status: 403, reason: 'Request was rejected.' };
  const method = input.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST' && method !== 'PATCH' && method !== 'PUT') {
    return { ok: false, status: 405, reason: 'Request was rejected.' };
  }
  // A browser same-origin GET does not send Origin. Mutations still require it.
  if (input.headerFetchSite && input.headerFetchSite !== 'same-origin') {
    return { ok: false, status: 403, reason: 'Request was rejected.' };
  }
  if (input.headerOrigin) {
    let origin: URL;
    try {
      origin = new URL(input.headerOrigin);
    } catch {
      return { ok: false, status: 403, reason: 'Request was rejected.' };
    }
    if (origin.origin !== input.requestOrigin) return { ok: false, status: 403, reason: 'Request was rejected.' };
  } else if (method !== 'GET') {
    return { ok: false, status: 403, reason: 'Request was rejected.' };
  }
  if (!input.brandRaw) return { ok: false, status: 400, reason: 'Brand is required.' };
  const brand = parseBrand(input.brandRaw);
  if (!brand) return { ok: false, status: 400, reason: 'Brand is not recognized.' };
  const grant = input.grants.find((item) => item.brand === brand);
  if (!grant) return { ok: false, status: 403, reason: 'This brand is not assigned.' };
  return { ok: true, actorId: input.actorId, brand, role: grant.role };
}

export function canExport(role: DeskRole): boolean {
  return role === 'owner' || role === 'administrator';
}

export type MembershipRow = {
  authUserId: string;
  brand: string;
  deskRole: string;
  revokedAt: string | null;
};

export function parseMembershipRole(value: string): MembershipRole | null {
  if (value === 'salesperson' || value === 'administrator') return value;
  return null;
}

export function activeSalesBrands(authUserId: string, rows: readonly MembershipRow[]): CrmBrand[] {
  return deskGrantsFor(authUserId, rows).map((grant) => grant.brand);
}

export function deskGrantsFor(authUserId: string, rows: readonly MembershipRow[]): DeskGrant[] {
  const grants: DeskGrant[] = [];
  for (const row of rows) {
    if (row.authUserId !== authUserId || row.revokedAt) continue;
    const brand = parseBrand(row.brand);
    const role = parseMembershipRole(row.deskRole);
    if (!brand || !role) continue;
    const existing = grants.find((grant) => grant.brand === brand);
    if (!existing) grants.push({ brand, role });
    else if (existing.role === 'salesperson' && role === 'administrator') existing.role = 'administrator';
  }
  return grants;
}

export type DeskDecision =
  | { ok: true; actorId: string; source: 'kelvin_owner' | 'membership'; grants: DeskGrant[]; brand: CrmBrand }
  | { ok: false; reason: 'no_session' | 'not_provisioned' | 'brand_denied' };

// A verified KELVIN owner session is the existing admin path. It is not a
// membership row and it is not implied by a Practice label or user_metadata.
export function decideDeskAccess(input: {
  kelvinOwner: boolean;
  kelvinActorId: string | null;
  salesUserId: string | null;
  memberships: readonly MembershipRow[];
  requestedBrand: string | null;
  practiceRole?: string | null;
  userMetadataRole?: string | null;
}): DeskDecision {
  void input.practiceRole;
  void input.userMetadataRole;
  if (input.kelvinOwner) {
    const grants: DeskGrant[] = CRM_BRANDS.map((brand) => ({ brand, role: 'owner' }));
    const requested = input.requestedBrand === null ? grants[0].brand : parseBrand(input.requestedBrand);
    if (!requested || !grants.some((grant) => grant.brand === requested)) return { ok: false, reason: 'brand_denied' };
    return { ok: true, actorId: input.kelvinActorId || 'kelvin-owner', source: 'kelvin_owner', grants, brand: requested };
  }
  if (!input.salesUserId) return { ok: false, reason: 'no_session' };
  const grants = deskGrantsFor(input.salesUserId, input.memberships);
  if (grants.length === 0) return { ok: false, reason: 'not_provisioned' };
  if (input.requestedBrand === null) return { ok: true, actorId: input.salesUserId, source: 'membership', grants, brand: grants[0].brand };
  const brand = parseBrand(input.requestedBrand);
  if (!brand || !grants.some((grant) => grant.brand === brand)) return { ok: false, reason: 'brand_denied' };
  return { ok: true, actorId: input.salesUserId, source: 'membership', grants, brand };
}

export function safeSalesReturnPath(value: unknown): string {
  if (typeof value !== 'string') return CRM_ROUTE;
  const trimmed = value.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\') || trimmed.includes('://')) {
    return CRM_ROUTE;
  }
  const path = trimmed.split('?')[0].split('#')[0];
  if (path === CRM_ROUTE || path.startsWith(`${CRM_ROUTE}/`) || path === WHOLESALE_ROUTE) return path;
  return CRM_ROUTE;
}

export function pruneSigninAttempts(stamps: readonly number[], now: number, windowMs: number): number[] {
  return stamps.filter((stamp) => now - stamp < windowMs && stamp <= now);
}

export function signinRateAllowed(stamps: readonly number[], limit: number): boolean {
  return stamps.length < limit;
}

export function resolveAssignee(_requested: unknown, sessionEmail: string): string {
  return sessionEmail;
}

function textField(value: unknown, max: number, required: boolean): string | null | undefined {
  if (value === undefined || value === null) return required ? null : undefined;
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v) return required ? null : '';
  if (v.length > max) return null;
  return v;
}

export function parseAccountWrite(
  body: unknown,
  mode: 'create' | 'update',
): { ok: true; value: { displayName?: string; status?: AccountStatus; city?: string | null; county?: string | null; notes?: string; licenseRef?: string | null; facilityRef?: string | null; licenseJurisdiction?: string | null; licenseExpiry?: string | null; assignedRep?: string | null; accountType?: AccountType | null; leadSource?: LeadSource | null; distributor?: 'nabis' | 'other' | 'self' | null; distributorAccountRef?: string | null } } | { ok: false; reason: string } {
  if (!body || typeof body !== 'object') return { ok: false, reason: 'Account could not be read.' };
  const b = body as Record<string, unknown>;
  const displayName = textField(b.displayName, 160, mode === 'create');
  if (displayName === null || (mode === 'create' && !displayName)) return { ok: false, reason: 'Enter an account name.' };
  let status: AccountStatus | undefined;
  if (b.status !== undefined) {
    if (typeof b.status !== 'string' || ACCOUNT_STATUS.indexOf(b.status as AccountStatus) < 0) {
      return { ok: false, reason: 'Account status is not recognized.' };
    }
    status = b.status as AccountStatus;
  } else if (mode === 'create') status = 'prospect';
  let county: string | null | undefined;
  if (b.county !== undefined) {
    const parsed = parseCounty(b.county);
    if (!parsed.ok) return parsed;
    county = parsed.county;
  }
  let city: string | null | undefined;
  if (b.city !== undefined) {
    if (b.city === null) city = null;
    else {
      const c = textField(b.city, 80, false);
      if (c === null) return { ok: false, reason: 'City is too long.' };
      city = c ? c : null;
    }
  }
  let notes: string | undefined;
  if (b.notes !== undefined) {
    const n = textField(b.notes, 4000, false);
    if (n === null) return { ok: false, reason: 'Notes are too long.' };
    notes = n ?? '';
  }
  let licenseRef: string | null | undefined;
  let facilityRef: string | null | undefined;
  let licenseJurisdiction: string | null | undefined;
  let licenseExpiry: string | null | undefined;
  let assignedRep: string | null | undefined;
  if (b.licenseRef !== undefined) {
    if (b.licenseRef === null || b.licenseRef === '') licenseRef = null;
    else {
      const v = textField(b.licenseRef, 120, false);
      if (v === null) return { ok: false, reason: 'License reference is too long.' };
      licenseRef = v || null;
    }
  }
  if (b.facilityRef !== undefined) {
    if (b.facilityRef === null || b.facilityRef === '') facilityRef = null;
    else {
      const v = textField(b.facilityRef, 120, false);
      if (v === null) return { ok: false, reason: 'Facility reference is too long.' };
      facilityRef = v || null;
    }
  }
  if (b.licenseJurisdiction !== undefined) {
    if (b.licenseJurisdiction === null || b.licenseJurisdiction === '') licenseJurisdiction = null;
    else {
      const v = textField(b.licenseJurisdiction, 80, false);
      if (v === null) return { ok: false, reason: 'Jurisdiction is too long.' };
      licenseJurisdiction = v || null;
    }
  }
  if (b.licenseExpiry !== undefined) {
    if (b.licenseExpiry === null || b.licenseExpiry === '') licenseExpiry = null;
    else if (typeof b.licenseExpiry !== 'string' || !parseIsoDate(b.licenseExpiry)) return { ok: false, reason: 'License expiry must be a calendar date.' };
    else licenseExpiry = b.licenseExpiry;
  }
  if (b.assignedRep !== undefined) {
    if (b.assignedRep === null || b.assignedRep === '') assignedRep = null;
    else {
      const v = textField(b.assignedRep, 200, false);
      if (v === null) return { ok: false, reason: 'Assigned rep is too long.' };
      assignedRep = v || null;
    }
  }
  let accountType: AccountType | null | undefined;
  if (b.accountType !== undefined) {
    if (b.accountType === null || b.accountType === '') accountType = null;
    else if (typeof b.accountType !== 'string' || !(ACCOUNT_TYPES as readonly string[]).includes(b.accountType)) return { ok: false, reason: 'Account type is not recognized.' };
    else accountType = b.accountType as AccountType;
  }
  let leadSource: LeadSource | null | undefined;
  if (b.leadSource !== undefined) {
    if (b.leadSource === null || b.leadSource === '') leadSource = null;
    else if (typeof b.leadSource !== 'string' || !(LEAD_SOURCES as readonly string[]).includes(b.leadSource)) return { ok: false, reason: 'Lead source is not recognized.' };
    else leadSource = b.leadSource as LeadSource;
  }
  let distributor: 'nabis' | 'other' | 'self' | null | undefined;
  if (b.distributor !== undefined) {
    if (b.distributor === null || b.distributor === '') distributor = null;
    else if (b.distributor === 'nabis' || b.distributor === 'other' || b.distributor === 'self') distributor = b.distributor;
    else return { ok: false, reason: 'Distributor is not recognized.' };
  }
  let distributorAccountRef: string | null | undefined;
  if (b.distributorAccountRef !== undefined) {
    if (b.distributorAccountRef === null || b.distributorAccountRef === '') distributorAccountRef = null;
    else {
      const v = textField(b.distributorAccountRef, 120, false);
      if (v === null) return { ok: false, reason: 'Distributor account ID is too long.' };
      distributorAccountRef = v || null;
    }
  }
  if (mode === 'update' && displayName === undefined && status === undefined && city === undefined && county === undefined && notes === undefined
    && licenseRef === undefined && facilityRef === undefined && licenseJurisdiction === undefined && licenseExpiry === undefined && assignedRep === undefined
    && accountType === undefined && leadSource === undefined && distributor === undefined && distributorAccountRef === undefined) {
    return { ok: false, reason: 'Nothing to update.' };
  }
  return { ok: true, value: { displayName: displayName || undefined, status, city, county, notes, licenseRef, facilityRef, licenseJurisdiction, licenseExpiry, assignedRep, accountType, leadSource, distributor, distributorAccountRef } };
}

export function dollarsToCents(input: string): number | null | 'invalid' {
  const t = input.trim();
  if (!t) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return 'invalid';
  const [d, c = ''] = t.split('.');
  const cents = Number(d) * 100 + Number((c + '00').slice(0, 2));
  if (!Number.isSafeInteger(cents) || cents > 100_000_000_000) return 'invalid';
  return cents;
}

export function parseForecastCents(value: unknown): number | null | 'invalid' {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100_000_000_000) return 'invalid';
  return value;
}

export function formatForecast(cents: number | null): string {
  if (cents === null) return 'No forecast entered';
  const dollars = cents / 100;
  return `Forecast ${dollars.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`;
}

export type FieldOwner = 'crm' | 'stored_reference' | 'canix_unverified' | 'hoodie_unverified';

export type FieldRecord = {
  entity: string;
  field: string;
  owner: FieldOwner;
  editableInCrm: boolean;
  certifiesValidity: false;
  connected: boolean;
};

// connected is whether this desk stores the field. Canix and Hoodie rows stay false.
export const FIELD_REGISTRY: readonly FieldRecord[] = [
  { entity: 'account', field: 'displayName', owner: 'crm', editableInCrm: true, certifiesValidity: false, connected: true },
  { entity: 'account', field: 'licenseRef', owner: 'stored_reference', editableInCrm: true, certifiesValidity: false, connected: true },
  { entity: 'account', field: 'facilityRef', owner: 'stored_reference', editableInCrm: true, certifiesValidity: false, connected: true },
  { entity: 'account', field: 'assignedRep', owner: 'crm', editableInCrm: true, certifiesValidity: false, connected: true },
  { entity: 'contact', field: 'preference', owner: 'crm', editableInCrm: true, certifiesValidity: false, connected: true },
  { entity: 'opportunity', field: 'forecastCents', owner: 'crm', editableInCrm: true, certifiesValidity: false, connected: true },
  { entity: 'opportunity', field: 'lossReason', owner: 'crm', editableInCrm: true, certifiesValidity: false, connected: true },
  { entity: 'mirror.order', field: 'status', owner: 'canix_unverified', editableInCrm: false, certifiesValidity: false, connected: false },
  { entity: 'mirror.inventory', field: 'quantity', owner: 'canix_unverified', editableInCrm: false, certifiesValidity: false, connected: false },
  { entity: 'mirror.hoodie', field: 'coverage', owner: 'hoodie_unverified', editableInCrm: false, certifiesValidity: false, connected: false },
];

export type MirrorContract = {
  connected: false;
  schemaVerified: false;
  orders: null;
  invoicedCents: null;
  paidCents: null;
  lastSuccessAt: null;
  reason: string;
};

export function mirrorContract(): MirrorContract {
  return {
    connected: false,
    schemaVerified: false,
    orders: null,
    invoicedCents: null,
    paidCents: null,
    lastSuccessAt: null,
    reason: 'Canix not connected. No live schema was verified, so the operational mirror has no rows.',
  };
}

export type ReportRow = { brand: CrmBrand; stage: OpportunityStage; expectedCloseOn: string | null; synthetic?: boolean };
export type WorkRow = { brand: CrmBrand; ownerActor: string | null; status: TaskStatus; synthetic?: boolean };

export function buildFunnel(rows: readonly ReportRow[], brand: CrmBrand): { ok: true; synthetic: boolean; stages: { stage: OpportunityStage; count: number }[]; invoicedCents: null; paidCents: null } | { ok: false } {
  if (rows.some((row) => row.brand !== brand)) return { ok: false };
  const stages = OPPORTUNITY_STAGES.map((stage) => ({ stage, count: rows.filter((row) => row.stage === stage).length }));
  return { ok: true, synthetic: rows.some((row) => row.synthetic === true), stages, invoicedCents: null, paidCents: null };
}

export function buildAging(rows: readonly ReportRow[], brand: CrmBrand, today: string): { ok: true; synthetic: boolean; aged: number } | { ok: false } {
  if (!parseIsoDate(today) || rows.some((row) => row.brand !== brand)) return { ok: false };
  const aged = rows.filter((row) => OPEN_STAGES.indexOf(row.stage) >= 0 && row.expectedCloseOn !== null && row.expectedCloseOn < today).length;
  return { ok: true, synthetic: rows.some((row) => row.synthetic === true), aged };
}

export function buildWorkload(rows: readonly WorkRow[], brand: CrmBrand): { ok: true; synthetic: boolean; owners: { ownerActor: string; openTasks: number }[] } | { ok: false } {
  if (rows.some((row) => row.brand !== brand)) return { ok: false };
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.status !== 'open') continue;
    const key = row.ownerActor || 'unassigned';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return {
    ok: true,
    synthetic: rows.some((row) => row.synthetic === true),
    owners: [...counts.entries()].map(([ownerActor, openTasks]) => ({ ownerActor, openTasks })),
  };
}

export function parseNote(body: unknown): { ok: true; accountId: string; text: string } | { ok: false; reason: string } {
  if (!body || typeof body !== 'object') return { ok: false, reason: 'Note could not be read.' };
  const b = body as Record<string, unknown>;
  const accountId = parseUuid(b.accountId);
  const text = textField(b.text, 2000, true);
  if (!accountId) return { ok: false, reason: 'Choose an account in this brand.' };
  if (!text) return { ok: false, reason: 'Enter the note.' };
  return { ok: true, accountId, text };
}

export type OpportunityWrite = {
  accountId?: string;
  name?: string;
  stage?: OpportunityStage;
  forecastCents?: number | null;
  expectedCloseOn?: string | null;
  notes?: string;
  lossReason?: string | null;
  nextAction?: string | null;
  nextActionOn?: string | null;
  productLine?: ProductLine | null;
  quantityUnits?: number | null;
};

export function parseOpportunityWrite(
  body: unknown,
  mode: 'create' | 'update',
): { ok: true; value: OpportunityWrite } | { ok: false; reason: string } {
  if (!body || typeof body !== 'object') return { ok: false, reason: 'Opportunity could not be read.' };
  const b = body as Record<string, unknown>;
  const value: OpportunityWrite = {};
  if (mode === 'create' || b.accountId !== undefined) {
    const id = parseUuid(b.accountId);
    if (!id) return { ok: false, reason: 'Choose an account in this brand.' };
    value.accountId = id;
  }
  if (mode === 'create' || b.name !== undefined) {
    const name = textField(b.name, 160, true);
    if (!name) return { ok: false, reason: 'Enter an opportunity name.' };
    value.name = name;
  }
  if (b.stage !== undefined) {
    if (typeof b.stage !== 'string' || STAGES.indexOf(b.stage as OpportunityStage) < 0) {
      return { ok: false, reason: 'Stage is not recognized.' };
    }
    value.stage = b.stage as OpportunityStage;
  } else if (mode === 'create') value.stage = 'lead';
  if (b.forecastCents !== undefined) {
    const cents = parseForecastCents(b.forecastCents);
    if (cents === 'invalid') return { ok: false, reason: 'Forecast must be a whole cent amount, or empty.' };
    value.forecastCents = cents;
  }
  if (b.expectedCloseOn !== undefined) {
    if (b.expectedCloseOn === null || b.expectedCloseOn === '') value.expectedCloseOn = null;
    else if (typeof b.expectedCloseOn !== 'string' || !parseIsoDate(b.expectedCloseOn)) {
      return { ok: false, reason: 'Expected close must be a calendar date.' };
    } else value.expectedCloseOn = b.expectedCloseOn;
  }
  if (b.notes !== undefined) {
    const n = textField(b.notes, 4000, false);
    if (n === null) return { ok: false, reason: 'Notes are too long.' };
    value.notes = n ?? '';
  }
  if (b.lossReason !== undefined) {
    if (b.lossReason === null || b.lossReason === '') value.lossReason = null;
    else {
      const v = textField(b.lossReason, 400, false);
      if (v === null) return { ok: false, reason: 'Loss reason is too long.' };
      value.lossReason = v || null;
    }
  }
  if (b.nextAction !== undefined) {
    if (b.nextAction === null || b.nextAction === '') value.nextAction = null;
    else {
      const v = textField(b.nextAction, 200, false);
      if (v === null) return { ok: false, reason: 'Next action is too long.' };
      value.nextAction = v || null;
    }
  }
  if (b.nextActionOn !== undefined) {
    if (b.nextActionOn === null || b.nextActionOn === '') value.nextActionOn = null;
    else if (typeof b.nextActionOn !== 'string' || !parseIsoDate(b.nextActionOn)) return { ok: false, reason: 'Next action date must be a calendar date.' };
    else value.nextActionOn = b.nextActionOn;
  }
  if (b.productLine !== undefined) {
    if (b.productLine === null || b.productLine === '') value.productLine = null;
    else if (typeof b.productLine !== 'string' || !(PRODUCT_LINES as readonly string[]).includes(b.productLine)) return { ok: false, reason: 'Product line is not recognized.' };
    else value.productLine = b.productLine as ProductLine;
  }
  if (b.quantityUnits !== undefined) {
    if (b.quantityUnits === null || b.quantityUnits === '') value.quantityUnits = null;
    else if (typeof b.quantityUnits !== 'number' || !Number.isInteger(b.quantityUnits) || b.quantityUnits < 0 || b.quantityUnits > 10_000_000) {
      return { ok: false, reason: 'Quantity must be a whole number of units, or empty.' };
    } else value.quantityUnits = b.quantityUnits;
  }
  if (value.stage === 'lost' && !value.lossReason) return { ok: false, reason: 'A lost opportunity needs a loss reason.' };
  return { ok: true, value };
}

export type ContactPreference = 'unspecified' | 'store_only' | 'do_not_contact';

export type ContactWrite = {
  accountId?: string;
  name?: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string;
  preference?: ContactPreference;
};

export function parseContactWrite(
  body: unknown,
  mode: 'create' | 'update',
): { ok: true; value: ContactWrite } | { ok: false; reason: string } {
  if (!body || typeof body !== 'object') return { ok: false, reason: 'Contact could not be read.' };
  const b = body as Record<string, unknown>;
  const value: ContactWrite = {};
  if (mode === 'create' || b.accountId !== undefined) {
    const id = parseUuid(b.accountId);
    if (!id) return { ok: false, reason: 'Choose an account in this brand.' };
    value.accountId = id;
  }
  if (mode === 'create' || b.name !== undefined) {
    const name = textField(b.name, 160, true);
    if (!name) return { ok: false, reason: 'Enter a contact name.' };
    value.name = name;
  }
  if (b.title !== undefined) {
    if (b.title === null) value.title = null;
    else {
      const t = textField(b.title, 120, false);
      if (t === null) return { ok: false, reason: 'Title is too long.' };
      value.title = t || null;
    }
  }
  if (b.email !== undefined) {
    if (b.email === null || b.email === '') value.email = null;
    else if (typeof b.email !== 'string' || b.email.trim().length > 200 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email.trim())) {
      return { ok: false, reason: 'Email is not usable.' };
    } else value.email = b.email.trim().toLowerCase();
  }
  if (b.phone !== undefined) {
    if (b.phone === null || b.phone === '') value.phone = null;
    else {
      const p = textField(b.phone, 40, false);
      if (p === null) return { ok: false, reason: 'Phone is too long.' };
      value.phone = p || null;
    }
  }
  if (b.notes !== undefined) {
    const n = textField(b.notes, 4000, false);
    if (n === null) return { ok: false, reason: 'Notes are too long.' };
    value.notes = n ?? '';
  }
  if (b.preference !== undefined) {
    if (b.preference !== 'unspecified' && b.preference !== 'store_only' && b.preference !== 'do_not_contact') {
      return { ok: false, reason: 'Contact preference is not recognized.' };
    }
    value.preference = b.preference;
  }
  return { ok: true, value };
}

export type TaskWrite = {
  accountId?: string | null;
  opportunityId?: string | null;
  title?: string;
  dueOn?: string | null;
  status?: TaskStatus;
  notes?: string;
  ownerActor?: string | null;
};

export function parseTaskWrite(
  body: unknown,
  mode: 'create' | 'update',
): { ok: true; value: TaskWrite } | { ok: false; reason: string } {
  if (!body || typeof body !== 'object') return { ok: false, reason: 'Task could not be read.' };
  const b = body as Record<string, unknown>;
  const value: TaskWrite = {};
  if (b.accountId !== undefined) {
    if (b.accountId === null || b.accountId === '') value.accountId = null;
    else {
      const id = parseUuid(b.accountId);
      if (!id) return { ok: false, reason: 'Account is not in this brand.' };
      value.accountId = id;
    }
  }
  if (b.opportunityId !== undefined) {
    if (b.opportunityId === null || b.opportunityId === '') value.opportunityId = null;
    else {
      const id = parseUuid(b.opportunityId);
      if (!id) return { ok: false, reason: 'Opportunity is not in this brand.' };
      value.opportunityId = id;
    }
  }
  if (mode === 'create' || b.title !== undefined) {
    const title = textField(b.title, 160, true);
    if (!title) return { ok: false, reason: 'Enter a task title.' };
    value.title = title;
  }
  if (b.dueOn !== undefined) {
    if (b.dueOn === null || b.dueOn === '') value.dueOn = null;
    else if (typeof b.dueOn !== 'string' || !parseIsoDate(b.dueOn)) return { ok: false, reason: 'Due date must be a calendar date.' };
    else value.dueOn = b.dueOn;
  }
  if (b.status !== undefined) {
    if (typeof b.status !== 'string' || TASK_STATUS.indexOf(b.status as TaskStatus) < 0) {
      return { ok: false, reason: 'Task status is not recognized.' };
    }
    value.status = b.status as TaskStatus;
  } else if (mode === 'create') value.status = 'open';
  if (b.notes !== undefined) {
    const n = textField(b.notes, 4000, false);
    if (n === null) return { ok: false, reason: 'Notes are too long.' };
    value.notes = n ?? '';
  }
  if (b.ownerActor !== undefined) {
    if (b.ownerActor === null || b.ownerActor === '') value.ownerActor = null;
    else {
      const v = textField(b.ownerActor, 200, false);
      if (v === null) return { ok: false, reason: 'Task owner is too long.' };
      value.ownerActor = v || null;
    }
  }
  return { ok: true, value };
}

const MISSING_SCHEMA_CODES = new Set(['42P01', '42703', 'PGRST205']);

// Match the Postgres or PostgREST code only. Message text such as
// "does not exist" also appears on operator errors (42883) and must stay a failed read.
export function isMissingSchema(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error?.code && MISSING_SCHEMA_CODES.has(error.code);
}

export function crmStorageDetail(error: { code?: string; message?: string } | null | undefined): 'schema_absent' | 'read_failed' | null {
  if (!error) return null;
  return isMissingSchema(error) ? 'schema_absent' : 'read_failed';
}

export type DisabledRead = {
  connected: false;
  label: string;
  records: [];
  reason: string;
};

export function createCanixAdapter() {
  const reason = 'Canix not connected. No live schema was verified, so this adapter does not call Canix.';
  const empty = async (): Promise<DisabledRead> => ({
    connected: false,
    label: CANIX_NOT_CONNECTED,
    records: [],
    reason,
  });
  return {
    state: 'not_connected' as const,
    customers: empty,
    salesOrders: empty,
    packages: empty,
    ownInventory: empty,
  };
}

export function createHoodieAdapter() {
  const reason = 'Hoodie not connected. Coverage, licensing, and freshness are unverified, so this adapter does not call Hoodie.';
  const empty = async (): Promise<DisabledRead> => ({
    connected: false,
    label: HOODIE_NOT_CONNECTED,
    records: [],
    reason,
  });
  return {
    state: 'not_connected' as const,
    observedOnHand: empty,
    heatMap: empty,
    retailerCoverage: empty,
  };
}

export function foreignStockFromCanix(_inventory: unknown): [] {
  return [];
}

export type IntelPolicy =
  | { verified: false; reason: string }
  | { verified: true; minimumPurchases: number; maxStalenessDays: number; windowPaddingDays: number };

export const UNVERIFIED_POLICY: IntelPolicy = {
  verified: false,
  reason: 'Calibration has not been reviewed.',
};

export function activePolicy(): IntelPolicy {
  return UNVERIFIED_POLICY;
}

export type ActualPurchase = {
  purchasedOn: string;
  source: 'canix_sales_order';
  sourceRecordedAt: string;
  verified: true;
  synthetic: boolean;
};

export type ConfirmedSchedule = {
  scheduledOn: string;
  source: 'crm_confirmed_schedule' | 'canix_confirmed_schedule';
  sourceRecordedAt: string;
  synthetic: boolean;
};

export type ReorderEvaluation = {
  outcome: 'insufficient_evidence' | 'predicted_window';
  predictedWindow: null | { start: string; end: string };
  lastActualPurchaseOn: string | null;
  confirmedScheduleOn: string | null;
  sufficiency: 'insufficient' | 'sufficient';
  uncertainty: string;
  factors: string[];
  source: string | null;
  refreshedAt: string | null;
  synthetic: boolean;
};

export function parseIsoDate(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.getTime();
}

function formatIsoDate(ms: number): string {
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

function median(nums: number[]): number {
  const s = nums.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2) return s[mid];
  return Math.round((s[mid - 1] + s[mid]) / 2);
}

function datePart(value: string): string | null {
  const day = value.slice(0, 10);
  return parseIsoDate(day) === null ? null : day;
}

export function evaluateReorder(input: {
  policy: IntelPolicy;
  purchases: readonly ActualPurchase[];
  confirmedSchedule: ConfirmedSchedule | null;
  now: string;
  synthetic: boolean;
}): ReorderEvaluation {
  const synthetic = input.synthetic || input.purchases.some((p) => p.synthetic) || !!input.confirmedSchedule?.synthetic;
  const dated = input.purchases
    .map((p) => p.purchasedOn)
    .filter((d) => parseIsoDate(d) !== null);
  const unique = Array.from(new Set(dated)).sort();
  const lastActual = unique.length ? unique[unique.length - 1] : null;
  const confirmed = input.confirmedSchedule && parseIsoDate(input.confirmedSchedule.scheduledOn)
    ? input.confirmedSchedule.scheduledOn
    : null;
  const base: ReorderEvaluation = {
    outcome: 'insufficient_evidence',
    predictedWindow: null,
    lastActualPurchaseOn: lastActual,
    confirmedScheduleOn: confirmed,
    sufficiency: 'insufficient',
    uncertainty: '',
    factors: [],
    source: lastActual ? 'canix_sales_order' : null,
    refreshedAt: null,
    synthetic,
  };
  if (!input.policy.verified) {
    return {
      ...base,
      uncertainty: 'Calibration has not been reviewed, so no reorder window is produced.',
      factors: [input.policy.reason, 'Actual purchase dates and confirmed schedules stay separate from any prediction.'],
    };
  }
  const now = parseIsoDate(datePart(input.now) ?? '');
  if (now === null) {
    return { ...base, uncertainty: 'The evaluation clock was not a calendar date, so no window is produced.', factors: ['Clock refused.'] };
  }
  if (unique.length < input.policy.minimumPurchases) {
    return {
      ...base,
      uncertainty: `${unique.length} verified purchase date${unique.length === 1 ? '' : 's'} are below the minimum of ${input.policy.minimumPurchases}, so no window is produced.`,
      factors: ['Sparse history is not a reorder date.'],
    };
  }
  const lastMs = parseIsoDate(unique[unique.length - 1]) as number;
  const age = Math.round((now - lastMs) / 86400000);
  if (age > input.policy.maxStalenessDays) {
    return {
      ...base,
      uncertainty: 'The newest verified purchase is older than the staleness bound, so no window is produced.',
      factors: [`Newest purchase is ${age} days before the evaluation date.`],
    };
  }
  const intervals: number[] = [];
  for (let i = 1; i < unique.length; i += 1) {
    const gap = Math.round(((parseIsoDate(unique[i]) as number) - (parseIsoDate(unique[i - 1]) as number)) / 86400000);
    if (gap > 0) intervals.push(gap);
  }
  if (!intervals.length) {
    return { ...base, uncertainty: 'The purchase dates do not form an interval, so no window is produced.', factors: ['No positive gap between verified dates.'] };
  }
  const mid = median(intervals);
  const pad = input.policy.windowPaddingDays;
  const start = formatIsoDate(lastMs + (mid - pad) * 86400000);
  const end = formatIsoDate(lastMs + (mid + pad) * 86400000);
  return {
    outcome: 'predicted_window',
    predictedWindow: { start, end },
    lastActualPurchaseOn: lastActual,
    confirmedScheduleOn: confirmed,
    sufficiency: 'sufficient',
    uncertainty: 'The window is the median gap between verified purchase dates, padded. It is not an order and not a confirmed delivery.',
    factors: [
      `${unique.length} verified purchase dates.`,
      `Median gap ${mid} days.`,
      `Padding ${pad} days on each side.`,
      'Confirmed schedule, when present, is reported beside the window and is not rewritten by it.',
    ],
    source: 'canix_sales_order',
    refreshedAt: input.now,
    synthetic,
  };
}

export type StockObservation = {
  source: 'hoodie_observed_on_hand';
  observationKind: 'on_hand';
  licensedCoverage: true;
  retailerRef: string;
  observedAt: string;
  condition: 'low' | 'ok' | 'unknown';
  synthetic: boolean;
};

export type StockEvaluation = {
  outcome: 'insufficient_evidence' | 'observed_reading';
  latestOnHand: null | 'low' | 'ok';
  change: null | { from: 'low' | 'ok'; to: 'low' | 'ok' };
  alertEligible: false | true;
  sufficiency: 'insufficient' | 'sufficient';
  uncertainty: string;
  factors: string[];
  source: string | null;
  refreshedAt: string | null;
  synthetic: boolean;
};

function lawful(obs: StockObservation | undefined): obs is StockObservation {
  return !!obs
    && obs.source === 'hoodie_observed_on_hand'
    && obs.observationKind === 'on_hand'
    && obs.licensedCoverage === true
    && (obs.condition === 'low' || obs.condition === 'ok' || obs.condition === 'unknown');
}

export function evaluateStock(input: {
  policy: IntelPolicy;
  observations: readonly StockObservation[];
  menuCount: number;
  canixInventorySupplied: boolean;
  now: string;
  synthetic: boolean;
}): StockEvaluation {
  const synthetic = input.synthetic || input.observations.some((o) => o.synthetic);
  const factors: string[] = [];
  if (input.menuCount > 0) factors.push('Menu listings were ignored because a menu is not on-hand inventory.');
  if (input.canixInventorySupplied) factors.push('Canix inventory was ignored because it is not a dispensary or competitor stock reading.');
  const base: StockEvaluation = {
    outcome: 'insufficient_evidence',
    latestOnHand: null,
    change: null,
    alertEligible: false,
    sufficiency: 'insufficient',
    uncertainty: '',
    factors,
    source: null,
    refreshedAt: null,
    synthetic,
  };
  if (!input.policy.verified) {
    return {
      ...base,
      uncertainty: 'Hoodie coverage settings are not verified, so observations are not promoted to stock signals.',
      factors: factors.concat(['Missing data is not low stock.']),
    };
  }
  const now = parseIsoDate(datePart(input.now) ?? '');
  const staleness = input.policy.maxStalenessDays;
  const usable = input.observations.filter((o) => {
    if (!lawful(o)) return false;
    const day = datePart(o.observedAt);
    if (!day || now === null) return false;
    const age = Math.round((now - (parseIsoDate(day) as number)) / 86400000);
    return age >= 0 && age <= staleness && o.condition !== 'unknown';
  });
  const refused = input.observations.length - usable.length;
  if (refused > 0) factors.push('A supplied observation was refused because it was not a fresh licensed on-hand Hoodie reading.');
  if (!usable.length) {
    return {
      ...base,
      uncertainty: 'No on-hand observation was supplied. Missing data is not a low-stock signal.',
      factors,
    };
  }
  const ordered = usable.slice().sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const latest = ordered[ordered.length - 1];
  if (ordered.length < 2) {
    return {
      ...base,
      outcome: 'observed_reading',
      latestOnHand: latest.condition === 'low' ? 'low' : 'ok',
      uncertainty: 'One licensed on-hand reading is recorded. It is not a stock change, because no earlier reading was supplied.',
      factors,
      source: 'hoodie_observed_on_hand',
      refreshedAt: latest.observedAt,
    };
  }
  const prev = ordered[ordered.length - 2];
  const from = prev.condition === 'low' ? 'low' : 'ok';
  const to = latest.condition === 'low' ? 'low' : 'ok';
  const changed = from !== to;
  return {
    outcome: 'observed_reading',
    latestOnHand: to,
    change: changed ? { from, to } : null,
    alertEligible: changed && to === 'low',
    sufficiency: changed ? 'sufficient' : 'insufficient',
    uncertainty: changed
      ? 'Two licensed on-hand readings differ. This is an observed change, not a menu and not Canix stock.'
      : 'Two licensed on-hand readings agree, so no stock-change alert is produced.',
    factors,
    source: 'hoodie_observed_on_hand',
    refreshedAt: latest.observedAt,
    synthetic,
  };
}

const FORBIDDEN_KEYS = new Set([
  'email', 'phone', 'patient', 'patientid', 'genome', 'genetic', 'genetics', 'dna',
  'ssn', 'dob', 'birthdate', 'personaladdress', 'consumer', 'scraped',
]);

function normalKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function hasForbiddenSignal(value: unknown, depth = 0): boolean {
  if (depth > 6) return true;
  if (Array.isArray(value)) return value.some((item) => hasForbiddenSignal(item, depth + 1));
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(normalKey(key))) return true;
      if (hasForbiddenSignal(child, depth + 1)) return true;
    }
  }
  return false;
}

export type HeatSignal = {
  source: 'hoodie_heatmap';
  geography: string;
  category: string;
  observedAt: string;
  synthetic: boolean;
};

export type RetailerCoverage = {
  source: 'authorized_retailer_coverage';
  retailerRef: string;
  geography: string;
  licensed: true;
  synthetic: boolean;
};

export type ProspectCandidate = {
  retailerRef: string;
  geography: string;
  category: string;
  rank: number;
  intentInferred: false;
  source: 'hoodie_heatmap';
  observedAt: string;
};

export type ProspectEvaluation = {
  outcome: 'insufficient_evidence' | 'prospect_candidates';
  candidates: ProspectCandidate[];
  sufficiency: 'insufficient' | 'sufficient';
  uncertainty: string;
  factors: string[];
  source: string | null;
  refreshedAt: string | null;
  synthetic: boolean;
  intentInferred: false;
};

export function evaluateProspects(input: {
  policy: IntelPolicy;
  heat: readonly HeatSignal[];
  coverage: readonly RetailerCoverage[];
  now: string;
  synthetic: boolean;
}): ProspectEvaluation {
  const synthetic = input.synthetic || input.heat.some((h) => h.synthetic) || input.coverage.some((c) => c.synthetic);
  const refused = hasForbiddenSignal(input.heat) || hasForbiddenSignal(input.coverage);
  const base: ProspectEvaluation = {
    outcome: 'insufficient_evidence',
    candidates: [],
    sufficiency: 'insufficient',
    uncertainty: '',
    factors: ['Category demand is not retailer intent.'],
    source: null,
    refreshedAt: null,
    synthetic,
    intentInferred: false,
  };
  if (refused) {
    return { ...base, uncertainty: 'A packet included a personal or genetic field and was refused.' };
  }
  if (!input.policy.verified) {
    return { ...base, uncertainty: 'Prospect ranking is inactive until calibration and authorized coverage are reviewed. No rank is assigned.' };
  }
  const now = parseIsoDate(datePart(input.now) ?? '');
  const staleness = input.policy.maxStalenessDays;
  const heat = input.heat.filter((h) => h.source === 'hoodie_heatmap' && h.geography && h.category && datePart(h.observedAt) && now !== null);
  const cover = input.coverage.filter((c) => c.source === 'authorized_retailer_coverage' && c.licensed === true && c.retailerRef && c.geography);
  if (!heat.length) return { ...base, uncertainty: 'No permitted heat-map signal was supplied, so no prospect is named.' };
  if (!cover.length) return { ...base, uncertainty: 'A heat-map signal has no authorized retailer coverage, so no prospect is named.' };
  const candidates: ProspectCandidate[] = [];
  for (const retailer of cover) {
    const matches = heat.filter((h) => h.geography === retailer.geography);
    if (!matches.length) continue;
    const newest = matches.slice().sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
    const observed = datePart(newest.observedAt);
    if (!observed || now === null) continue;
    const age = Math.round((now - (parseIsoDate(observed) as number)) / 86400000);
    if (age < 0 || age > staleness) continue;
    candidates.push({
      retailerRef: retailer.retailerRef,
      geography: retailer.geography,
      category: newest.category,
      rank: 0,
      intentInferred: false,
      source: 'hoodie_heatmap',
      observedAt: newest.observedAt,
    });
  }
  if (!candidates.length) {
    return { ...base, uncertainty: 'Heat and coverage did not meet on a fresh permitted geography, so no prospect is named.' };
  }
  candidates.sort((a, b) => b.observedAt.localeCompare(a.observedAt) || a.retailerRef.localeCompare(b.retailerRef));
  candidates.forEach((c, i) => { c.rank = i + 1; });
  return {
    outcome: 'prospect_candidates',
    candidates,
    sufficiency: 'sufficient',
    uncertainty: 'Rank is the order of fresh geography matches. It is not a probability and it does not claim the retailer intends to buy.',
    factors: ['Authorized licensed coverage was required before a retailer was named.', 'Category demand is not retailer intent.'],
    source: 'hoodie_heatmap',
    refreshedAt: input.now,
    synthetic,
    intentInferred: false,
  };
}

export type DeskEvaluation = {
  policyVerified: false | true;
  reorder: ReorderEvaluation;
  stock: StockEvaluation;
  prospects: ProspectEvaluation;
  boundaries: readonly string[];
  canix: { connected: false; label: typeof CANIX_NOT_CONNECTED };
  hoodie: { connected: false; label: typeof HOODIE_NOT_CONNECTED };
  lastRefresh: null;
  alertsActivated: false;
};

export function evaluateDesk(input: {
  policy?: IntelPolicy;
  purchases?: readonly ActualPurchase[];
  confirmedSchedule?: ConfirmedSchedule | null;
  observations?: readonly StockObservation[];
  menuCount?: number;
  canixInventorySupplied?: boolean;
  heat?: readonly HeatSignal[];
  coverage?: readonly RetailerCoverage[];
  now: string;
  synthetic: boolean;
}): DeskEvaluation {
  const policy = input.policy ?? activePolicy();
  return {
    policyVerified: policy.verified,
    reorder: evaluateReorder({
      policy,
      purchases: input.purchases ?? [],
      confirmedSchedule: input.confirmedSchedule ?? null,
      now: input.now,
      synthetic: input.synthetic,
    }),
    stock: evaluateStock({
      policy,
      observations: input.observations ?? [],
      menuCount: input.menuCount ?? 0,
      canixInventorySupplied: input.canixInventorySupplied ?? false,
      now: input.now,
      synthetic: input.synthetic,
    }),
    prospects: evaluateProspects({
      policy,
      heat: input.heat ?? [],
      coverage: input.coverage ?? [],
      now: input.now,
      synthetic: input.synthetic,
    }),
    boundaries: INTEL_BOUNDARIES,
    canix: { connected: false, label: CANIX_NOT_CONNECTED },
    hoodie: { connected: false, label: HOODIE_NOT_CONNECTED },
    lastRefresh: null,
    alertsActivated: false,
  };
}

export type AlertKind = 'reorder_window' | 'observed_stock_change' | 'prospect_opportunity';
export type AlertStatus = 'open' | 'assigned' | 'dismissed';

export type AlertRecord = {
  id: string;
  brand: CrmBrand;
  kind: AlertKind;
  status: AlertStatus;
  dedupeKey: string;
  subjectRef: string;
  assignedTo: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  dismissedAt: string | null;
  dismissedBy: string | null;
  activated: false;
  synthetic: boolean;
  evidence: string;
  sufficiency: 'insufficient' | 'sufficient';
  uncertainty: string;
  factors: string[];
  source: string | null;
  refreshedAt: string | null;
  staffOnly: true;
};

export function alertDedupeKey(parts: { brand: CrmBrand; kind: AlertKind; subject: string; evidence: string }): string {
  return [parts.brand, parts.kind, parts.subject.trim(), parts.evidence.trim()].join('|');
}

export function reduceAlerts(
  drafts: readonly { dedupeKey: string; synthetic: boolean }[],
  allowSynthetic: boolean,
): { kept: number; refused: number } {
  const seen = new Set<string>();
  let kept = 0;
  let refused = 0;
  for (const draft of drafts) {
    if (draft.synthetic && !allowSynthetic) { refused += 1; continue; }
    if (seen.has(draft.dedupeKey)) { refused += 1; continue; }
    seen.add(draft.dedupeKey);
    kept += 1;
  }
  return { kept, refused };
}

export function prepareReorderAlert(evaluation: ReorderEvaluation, brand: CrmBrand, subject: string): { activated: false; synthetic: boolean; dedupeKey: string } | null {
  if (evaluation.synthetic) return null;
  if (evaluation.outcome !== 'predicted_window' || !evaluation.predictedWindow) return null;
  if (evaluation.sufficiency !== 'sufficient') return null;
  return {
    activated: false,
    synthetic: false,
    dedupeKey: alertDedupeKey({
      brand,
      kind: 'reorder_window',
      subject,
      evidence: `${evaluation.predictedWindow.start}:${evaluation.predictedWindow.end}`,
    }),
  };
}

export function assertPersistable(draft: { synthetic: boolean; activated: boolean; sufficiency: string }): void {
  if (draft.synthetic) throw new Error('Synthetic intelligence results cannot be stored.');
  if (draft.activated) throw new Error('Alerts cannot be activated in this version.');
  if (draft.sufficiency !== 'sufficient') throw new Error('Insufficient evidence cannot be stored as an alert.');
}

export function nextAlertState(
  alert: AlertRecord,
  op: 'review' | 'assign' | 'dismiss',
  actor: string,
  at: string,
): { ok: true; alert: AlertRecord } | { ok: false; reason: string } {
  if (alert.activated !== false) return { ok: false, reason: 'Alerts are not activated.' };
  if (alert.synthetic) return { ok: false, reason: 'Synthetic results are not desk records.' };
  if (alert.status === 'dismissed') return { ok: false, reason: 'Dismissed alerts stay closed.' };
  if (op === 'review') return { ok: true, alert: { ...alert, reviewedAt: at, reviewedBy: actor } };
  if (op === 'assign') {
    return { ok: true, alert: { ...alert, status: 'assigned', assignedTo: actor, reviewedAt: at, reviewedBy: actor } };
  }
  return { ok: true, alert: { ...alert, status: 'dismissed', dismissedAt: at, dismissedBy: actor } };
}

export function parseAlertAction(body: unknown): 'review' | 'assign' | 'dismiss' | null {
  if (!body || typeof body !== 'object') return null;
  const op = (body as Record<string, unknown>).op;
  if (op === 'review' || op === 'assign' || op === 'dismiss') return op;
  return null;
}

export function containsConfidenceClaim(value: unknown): boolean {
  const text = JSON.stringify(value).toLowerCase();
  return text.includes('confidence') || text.includes('accuracy') || text.includes('%');
}

export type Audience =
  | { kind: 'public' }
  | { kind: 'staff' }
  | { kind: 'retailer'; permits: readonly string[] };

export type StoredInsight = {
  brand: CrmBrand;
  accountId: string | null;
  staffOnly: boolean;
  kind: 'reorder_window' | 'observed_stock' | 'prospect';
  evidence: string;
  source: string | null;
  refreshedAt: string | null;
  sufficiency: 'insufficient' | 'sufficient';
  uncertainty: string;
  factors: string[];
};

export type InsightSnapshot = {
  brand: CrmBrand;
  internalNotes: readonly string[];
  recommendations: readonly StoredInsight[];
  alerts: readonly AlertRecord[];
  desk: DeskEvaluation;
  storage: 'ok' | 'absent';
};

export type WholesaleView = {
  visible: false | true;
  route: typeof WHOLESALE_ROUTE;
  brand: CrmBrand | null;
  notes: [];
  counts: null | { recommendations: number; alerts: number };
  recommendations: StoredInsight[];
  alerts: AlertRecord[];
  desk: DeskEvaluation | null;
  storage: 'ok' | 'absent' | 'hidden';
};

export function projectWholesaleInsights(input: {
  audience: Audience;
  requestedBrand: string;
  snapshot: InsightSnapshot;
}): WholesaleView {
  const hidden: WholesaleView = {
    visible: false,
    route: WHOLESALE_ROUTE,
    brand: null,
    notes: [],
    counts: null,
    recommendations: [],
    alerts: [],
    desk: null,
    storage: 'hidden',
  };
  if (parseBrand(input.requestedBrand) !== WHOLESALE_BRAND) return hidden;
  if (input.snapshot.brand !== WHOLESALE_BRAND) return hidden;
  if (input.snapshot.recommendations.some((row) => row.brand !== WHOLESALE_BRAND)) return hidden;
  if (input.snapshot.alerts.some((row) => row.brand !== WHOLESALE_BRAND)) return hidden;
  if (input.audience.kind === 'public') return hidden;
  if (input.audience.kind === 'retailer') {
    const permitted = new Set(input.audience.permits);
    const mine = input.snapshot.recommendations.filter((row) => (
      row.staffOnly === false
      && row.accountId !== null
      && permitted.has(row.accountId)
      && row.brand === WHOLESALE_BRAND
    ));
    return {
      visible: mine.length > 0,
      route: WHOLESALE_ROUTE,
      brand: WHOLESALE_BRAND,
      notes: [],
      counts: null,
      recommendations: mine,
      alerts: [],
      desk: null,
      storage: 'hidden',
    };
  }
  return {
    visible: true,
    route: WHOLESALE_ROUTE,
    brand: WHOLESALE_BRAND,
    notes: [],
    counts: input.snapshot.storage === 'ok' ? {
      recommendations: input.snapshot.recommendations.length,
      alerts: input.snapshot.alerts.length,
    } : null,
    recommendations: input.snapshot.recommendations.slice(),
    alerts: input.snapshot.alerts.slice(),
    desk: input.snapshot.desk,
    storage: input.snapshot.storage,
  };
}

export function signalLines(desk: DeskEvaluation): { title: string; lines: string[] }[] {
  const reorder = desk.reorder;
  const reorderLines = [
    reorder.uncertainty,
    reorder.lastActualPurchaseOn ? `Last actual purchase ${reorder.lastActualPurchaseOn}` : 'No actual purchase history is loaded.',
    reorder.confirmedScheduleOn ? `Confirmed schedule ${reorder.confirmedScheduleOn}` : 'No confirmed schedule is loaded.',
    reorder.predictedWindow ? `Predicted window ${reorder.predictedWindow.start} to ${reorder.predictedWindow.end}` : 'No predicted reorder window.',
    reorder.source ? `Source ${reorder.source}` : 'No reorder source.',
    reorder.refreshedAt ? `Last refresh ${reorder.refreshedAt}` : 'No reorder refresh.',
  ];
  const stock = desk.stock;
  const stockLines = [
    stock.uncertainty,
    stock.latestOnHand ? `Latest on-hand reading ${stock.latestOnHand}` : 'No on-hand reading is promoted.',
    stock.change ? `Observed change ${stock.change.from} to ${stock.change.to}` : 'No observed stock change.',
    stock.source ? `Source ${stock.source}` : 'No stock source.',
    stock.refreshedAt ? `Last refresh ${stock.refreshedAt}` : 'No stock refresh.',
  ];
  const prospects = desk.prospects;
  const prospectLines = [
    prospects.uncertainty,
    prospects.candidates.length ? `${prospects.candidates.length} candidate${prospects.candidates.length === 1 ? '' : 's'}` : 'No target is named.',
    prospects.source ? `Source ${prospects.source}` : 'No prospect source.',
    prospects.refreshedAt ? `Last refresh ${prospects.refreshedAt}` : 'No prospect refresh.',
  ];
  return [
    { title: 'Reorder windows', lines: reorderLines.concat(reorder.factors) },
    { title: 'Stock signals', lines: stockLines.concat(stock.factors) },
    { title: 'Target recommendations', lines: prospectLines.concat(prospects.factors) },
  ];
}
