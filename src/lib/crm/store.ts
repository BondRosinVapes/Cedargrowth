import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@/lib/supabase';
import {
  crmStorageDetail,
  isolateBrand,
  type AccountStatus,
  type AlertRecord,
  type ContactWrite,
  type CrmBrand,
  type OpportunityStage,
  type OpportunityWrite,
  type ProductLine,
  type StoredInsight,
  type TaskStatus,
  type TaskWrite,
  ACCOUNT_TYPES,
  LEAD_SOURCES,
  OPEN_STAGES,
  type AccountType,
  type LeadSource,
} from './engine';
import { forecastCapacityRequests } from './capacityQuery';
import { forecastCapacityRows, type ForecastOpportunity } from './forecast';
import { DISTRIBUTORS, ORDER_SOURCES, ORDER_STATUSES, PAYOUT_STATUSES, RETAILER_PAYMENT_STATUSES, type Distributor, type DistributorOrderDraft, type OrderSource, type OrderStatus, type PayoutStatus, type RetailerPaymentStatus } from './distributor';
import { sampleTaskTitle, type MediaKind, type VisitOutcome } from './field';
import { confirmationFor, currentReleased, defaultExpiry, hashReorderToken, linkAccess, newReorderToken, parseReorderLines, reorderDeal, type ReleasedBatch, type ReorderLine } from './reorder';
import { knownEmailEvent, type EmailEvent } from './emailStatus';
import { intakeTestMarker, type IntakeLead } from './intake';
import { AGENT_ACTOR, AGENT_BRAND, applyAgentOps, type AgentOp, type AgentRowFailure } from './agentIntake';
import { forecastDealFilter, readForecastInputs, type ForecastWindow } from './forecastRead';
import { wonMergeOnSave, type ContactPrior, type MergeRow } from './distributionMerge';
import type { PlaceCache, PlaceCard } from './places';

export type StoreResult<T> =
  | { state: 'ok'; value: T; mergeFailed?: boolean }
  | { state: 'absent' }
  | { state: 'unavailable' }
  | { state: 'rejected' }
  | { state: 'missing' };

export type Account = {
  id: string;
  publicId: string;
  brand: CrmBrand;
  displayName: string;
  status: AccountStatus;
  city: string | null;
  county: string | null;
  notes: string;
  licenseRef: string | null;
  facilityRef: string | null;
  licenseJurisdiction: string | null;
  licenseExpiry: string | null;
  assignedRep: string | null;
  accountType: AccountType | null;
  leadSource: LeadSource | null;
  street?: string | null;
  state?: string | null;
  postalCode?: string | null;
  consentVersion?: string | null;
  consentReceivedAt?: string | null;
  intakeSubmittedAt?: string | null;
  ocmStatus?: 'unverified' | 'verified' | null;
  recordMarker?: 'test' | null;
  sourceInquiryId?: string | null;
  sourceRequestId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geocodeSource?: string | null;
  geocodeMatch?: string | null;
  geocodedAt?: string | null;
  distributor: Distributor | null;
  distributorAccountRef: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

export type Contact = {
  id: string;
  publicId: string;
  brand: CrmBrand;
  accountId: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  notes: string;
  preference: 'unspecified' | 'store_only' | 'do_not_contact';
  createdAt: string;
  updatedAt: string;
  sourceRequestId?: string | null;
};

export type Opportunity = {
  id: string;
  publicId: string;
  brand: CrmBrand;
  accountId: string;
  name: string;
  stage: OpportunityStage;
  forecastCents: number | null;
  amountKind: 'forecast';
  invoicedCents: null;
  paidCents: null;
  expectedCloseOn: string | null;
  notes: string;
  lossReason: string | null;
  nextAction: string | null;
  nextActionOn: string | null;
  productLine: ProductLine | null;
  quantityUnits: number | null;
  updatedAt: string;
  sourceInquiryId?: string | null;
};

export type Task = {
  id: string;
  publicId: string;
  brand: CrmBrand;
  accountId: string | null;
  opportunityId: string | null;
  title: string;
  dueOn: string | null;
  status: TaskStatus;
  notes: string;
  ownerActor: string | null;
  completedAt: string | null;
  sourceInquiryId?: string | null;
};

export type Note = {
  id: string;
  publicId: string;
  brand: CrmBrand;
  accountId: string;
  body: string;
  actor: string;
  createdAt: string;
  sourceInquiryId?: string | null;
  sourceRequestId?: string | null;
};

export type Activity = {
  id: string;
  publicId: string;
  brand: CrmBrand;
  accountId: string | null;
  kind: string;
  summary: string;
  actor: string;
  createdAt: string;
  sourceRequestId?: string | null;
};

export type DistributorOrder = {
  id: string;
  publicId: string;
  brand: CrmBrand;
  accountId: string | null;
  distributor: Distributor;
  orderRef: string;
  retailerName: string;
  orderedOn: string | null;
  deliveredOn: string | null;
  orderStatus: OrderStatus;
  invoiceCents: number | null;
  retailerPaymentStatus: RetailerPaymentStatus;
  retailerPaidOn: string | null;
  payoutStatus: PayoutStatus;
  payoutCents: number | null;
  payoutOn: string | null;
  opportunityId: string | null;
  source: OrderSource;
  importedAt: string;
};

export type StageEvent = {
  id: string;
  brand: CrmBrand;
  opportunityId: string;
  fromStage: OpportunityStage | null;
  toStage: OpportunityStage;
  at: string;
};

export type Capacity = {
  id: string;
  brand: CrmBrand;
  month: string;
  productLine: ProductLine;
  capacityUnits: number;
  notes: string;
};

export type Visit = {
  id: string;
  publicId: string;
  brand: CrmBrand;
  accountId: string;
  repActor: string;
  checkedInAt: string;
  checkedOutAt: string | null;
  latitude: number | null;
  longitude: number | null;
  outcome: VisitOutcome;
  notes: string;
};

export type Sample = {
  id: string;
  publicId: string;
  brand: CrmBrand;
  accountId: string;
  visitId: string | null;
  productLine: ProductLine;
  quantityUnits: number;
  leftOn: string;
  followUpOn: string;
  notes: string;
};

export type Media = {
  id: string;
  publicId: string;
  brand: CrmBrand;
  accountId: string;
  visitId: string | null;
  kind: MediaKind;
  storagePath: string;
  contentType: string;
  byteSize: number;
  durationSeconds: number | null;
  createdBy: string;
  createdAt: string;
};

export type Batch = {
  id: string;
  publicId: string;
  brand: CrmBrand;
  productId: string;
  batchNumber: string;
  labName: string;
  testedOn: string;
  coaStoragePath: string | null;
  released: boolean;
  releasedAt: string | null;
  createdBy: string;
  createdAt: string;
};

export type ReorderLink = {
  id: string;
  publicId: string;
  brand: CrmBrand;
  accountId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt: string | null;
  createdBy: string;
  createdAt: string;
};

export type ReorderRequest = {
  id: string;
  publicId: string;
  brand: CrmBrand;
  accountId: string;
  linkId: string;
  lines: ReorderLine[];
  buyerName: string;
  buyerEmail: string;
  note: string;
  createdAt: string;
  status: 'received' | 'converted' | 'declined';
};

export type EmailLog = {
  id: string;
  brand: CrmBrand;
  kind: 'digest' | 'reorder_link';
  resendId: string;
  recipient: string;
  accountId: string | null;
  sentAt: string;
  lastEvent: EmailEvent | null;
  lastEventAt: string | null;
  createdBy: string;
};

export type Counts = {
  accounts: number;
  contacts: number;
  opportunities: number;
  openTasks: number;
  forecastCents: number | null;
  forecastComplete: boolean;
};

export type IntelRead = {
  recommendations: StoredInsight[];
  alerts: AlertRecord[];
};

type DbError = { code?: string; message?: string } | null;

function classify(error: DbError): 'absent' | 'unavailable' | null {
  if (!error) return null;
  return crmStorageDetail(error) === 'schema_absent' ? 'absent' : 'unavailable';
}

function asBrand(value: unknown): CrmBrand | null {
  return value === 'cedargrowth' || value === 'bond' ? value : null;
}

export interface CrmStore {
  counts(brand: CrmBrand): Promise<StoreResult<Counts>>;
  listAccounts(brand: CrmBrand, filter: { q: string | null; status: AccountStatus | null }): Promise<StoreResult<Account[]>>;
  createAccount(brand: CrmBrand, actor: string, input: { displayName: string; status: AccountStatus; city: string | null; county?: string | null; notes: string; licenseRef?: string | null; facilityRef?: string | null; licenseJurisdiction?: string | null; licenseExpiry?: string | null; assignedRep?: string | null; accountType?: AccountType | null; leadSource?: LeadSource | null; distributor?: Distributor | null; distributorAccountRef?: string | null }): Promise<StoreResult<Account>>;
  listNotes(brand: CrmBrand, accountId: string | null): Promise<StoreResult<Note[]>>;
  createNote(brand: CrmBrand, actor: string, input: { accountId: string; body: string }): Promise<StoreResult<Note>>;
  updateAccount(brand: CrmBrand, actor: string, id: string, patch: { displayName?: string; status?: AccountStatus; city?: string | null; county?: string | null; notes?: string; licenseRef?: string | null; facilityRef?: string | null; licenseJurisdiction?: string | null; licenseExpiry?: string | null; assignedRep?: string | null; accountType?: AccountType | null; leadSource?: LeadSource | null; distributor?: Distributor | null; distributorAccountRef?: string | null }): Promise<StoreResult<Account>>;
  listContacts(brand: CrmBrand, accountId: string | null): Promise<StoreResult<Contact[]>>;
  createContact(brand: CrmBrand, actor: string, input: ContactWrite & { accountId: string; name: string }): Promise<StoreResult<Contact>>;
  updateContact(brand: CrmBrand, actor: string, id: string, patch: ContactWrite): Promise<StoreResult<Contact>>;
  listOpportunities(brand: CrmBrand): Promise<StoreResult<Opportunity[]>>;
  createOpportunity(brand: CrmBrand, actor: string, input: OpportunityWrite & { accountId: string; name: string; stage: OpportunityStage }): Promise<StoreResult<Opportunity>>;
  updateOpportunity(brand: CrmBrand, actor: string, id: string, patch: OpportunityWrite): Promise<StoreResult<Opportunity>>;
  listTasks(brand: CrmBrand, status: TaskStatus | null): Promise<StoreResult<Task[]>>;
  createTask(brand: CrmBrand, actor: string, input: TaskWrite & { title: string; status: TaskStatus }): Promise<StoreResult<Task>>;
  updateTask(brand: CrmBrand, actor: string, id: string, patch: TaskWrite): Promise<StoreResult<Task>>;
  listActivity(brand: CrmBrand): Promise<StoreResult<Activity[]>>;
  search(brand: CrmBrand, q: string): Promise<StoreResult<{ accounts: Account[]; contacts: Contact[]; opportunities: Opportunity[] }>>;
  exportBrand(brand: CrmBrand): Promise<StoreResult<{ accounts: Account[]; contacts: Contact[]; opportunities: Opportunity[]; tasks: Task[]; activity: Activity[]; truncated: boolean }>>;
  intelligence(brand: CrmBrand): Promise<StoreResult<IntelRead>>;
  applyAlert(brand: CrmBrand, id: string, next: AlertRecord): Promise<StoreResult<AlertRecord>>;
  listDistributorOrders(brand: CrmBrand): Promise<StoreResult<DistributorOrder[]>>;
  upsertDistributorOrder(brand: CrmBrand, actor: string, input: DistributorOrderDraft & { accountId: string | null }): Promise<StoreResult<{ order: DistributorOrder; action: 'created' | 'updated' }>>;
  linkDistributorOrder(brand: CrmBrand, orderId: string, accountId: string): Promise<StoreResult<DistributorOrder>>;
  markDealWonFromOrder(brand: CrmBrand, actor: string, orderId: string, opportunityId: string): Promise<StoreResult<{ order: DistributorOrder; stage: OpportunityStage }>>;
  listStageEvents(brand: CrmBrand): Promise<StoreResult<StageEvent[]>>;
  listForecastInputs(brand: CrmBrand, window: ForecastWindow): Promise<StoreResult<{ opportunities: ForecastOpportunity[]; events: StageEvent[] }>>;
  listCapacity(brand: CrmBrand, window: { start: string; end: string }): Promise<StoreResult<Capacity[]>>;
  upsertCapacity(brand: CrmBrand, actor: string, input: { month: string; productLine: ProductLine; capacityUnits: number; notes: string }): Promise<StoreResult<Capacity>>;
  listVisits(brand: CrmBrand): Promise<StoreResult<Visit[]>>;
  checkIn(brand: CrmBrand, actor: string, input: { accountId: string; outcome: VisitOutcome; notes: string; latitude: number | null; longitude: number | null }): Promise<StoreResult<Visit>>;
  checkOut(brand: CrmBrand, visitId: string): Promise<StoreResult<Visit>>;
  listSamples(brand: CrmBrand): Promise<StoreResult<Sample[]>>;
  createSample(brand: CrmBrand, actor: string, input: { accountId: string; visitId: string | null; productLine: ProductLine; quantityUnits: number; leftOn: string; followUpOn: string; notes: string }): Promise<StoreResult<{ sample: Sample; task: Task }>>;
  listMedia(brand: CrmBrand): Promise<StoreResult<Media[]>>;
  createMedia(brand: CrmBrand, actor: string, input: { id: string; accountId: string; visitId: string | null; kind: MediaKind; storagePath: string; contentType: string; byteSize: number; durationSeconds: number | null }): Promise<StoreResult<Media>>;
  listBatches(brand: CrmBrand): Promise<StoreResult<Batch[]>>;
  createBatch(brand: CrmBrand, actor: string, input: { id: string; productId: string; batchNumber: string; labName: string; testedOn: string; coaStoragePath: string }): Promise<StoreResult<Batch>>;
  releaseBatch(brand: CrmBrand, id: string): Promise<StoreResult<Batch>>;
  listReorderLinks(brand: CrmBrand, accountId: string): Promise<StoreResult<ReorderLink[]>>;
  createReorderLink(brand: CrmBrand, actor: string, accountId: string, nowMs: number): Promise<StoreResult<{ link: ReorderLink; token: string }>>;
  revokeReorderLink(brand: CrmBrand, id: string, nowMs: number): Promise<StoreResult<ReorderLink>>;
  openReorder(token: string, nowMs: number): Promise<StoreResult<{ accountName: string; distributor: string | null; assignedRep: string | null; batches: ReleasedBatch[]; status: 'ok' | 'unavailable' | 'inactive' }>>;
  submitReorder(token: string, nowMs: number, input: { lines: ReorderLine[]; buyerName: string; buyerEmail: string; note: string }): Promise<StoreResult<{ request: ReorderRequest; opportunity: Opportunity; confirmation: string }> | { state: 'closed' }>;
  lookupReleasedBatch(brand: CrmBrand, batchNumber: string): Promise<StoreResult<Batch | null>>;
  findDigestSend(brand: CrmBrand, summary: string): Promise<StoreResult<{ createdAt: string } | null>>;
  recordDigest(brand: CrmBrand, actor: string, summary: string): Promise<StoreResult<{ id: string }>>;
  insertEmailLog(brand: CrmBrand, actor: string, input: { kind: 'digest' | 'reorder_link'; resendId: string; recipient: string; accountId: string | null }): Promise<StoreResult<EmailLog>>;
  listEmailLogs(brand: CrmBrand, sinceIso: string, accountId?: string | null): Promise<StoreResult<EmailLog[]>>;
  updateEmailLog(brand: CrmBrand, id: string, lastEvent: EmailEvent, lastEventAt: string): Promise<StoreResult<EmailLog>>;
  listTerritories(brand: CrmBrand): Promise<StoreResult<{ id: string; brand: CrmBrand; region: string; repActor: string }[]>>;
  assignTerritory(brand: CrmBrand, region: string, repActor: string): Promise<StoreResult<{ id: string; brand: CrmBrand; region: string; repActor: string }>>;
  clearTerritory(brand: CrmBrand, region: string): Promise<StoreResult<{ cleared: true }>>;
  listMarketRetailers(brand: CrmBrand): Promise<StoreResult<{ id: string; brand: CrmBrand; licenseNumber: string; name: string; county: string; licenseType: string; uploadedAt: string }[]>>;
  insertMarketRetailers(brand: CrmBrand, rows: { licenseNumber: string; name: string; county: string; licenseType: string }[], uploadedAt: string): Promise<StoreResult<{ count: number }>>;
  listDismissals(brand: CrmBrand): Promise<StoreResult<{ id: string; brand: CrmBrand; repActor: string; actionKey: string; until: string }[]>>;
  upsertDismissal(brand: CrmBrand, repActor: string, actionKey: string, until: string): Promise<StoreResult<{ id: string; brand: CrmBrand; repActor: string; actionKey: string; until: string }>>;
  receiveBondInquiry(lead: IntakeLead, receivedAt: string): Promise<StoreResult<{ duplicate: boolean }>>;
  deleteBondInquiry(inquiryId: string): Promise<StoreResult<{ deleted: boolean }>>;
  purgeBondInquiries(nowIso: string): Promise<StoreResult<{ purged: number }>>;
  receiveAgentRecords(input: { requestId: string; receivedAt: string; ops: AgentOp[] }): Promise<StoreResult<{ code: 'replay' } | { code: 'rate'; retryAfter: number } | { code: 'ok'; created: { accounts: number; contacts: number; notes: number }; skipped: { index: number; reason: string }[]; failed: AgentRowFailure[] }>>;
  readAccount(brand: CrmBrand, id: string): Promise<StoreResult<Account | null>>;
  readPlaceCache(brand: CrmBrand, accountId: string): Promise<StoreResult<PlaceCache | null>>;
  savePlaceCache(brand: CrmBrand, accountId: string, cache: PlaceCache): Promise<StoreResult<PlaceCache>>;
  readOpenMerge(brand: CrmBrand, opportunityId: string): Promise<StoreResult<MergeRow | null>>;
  readAccountMerge(brand: CrmBrand, accountId: string): Promise<StoreResult<MergeRow | null>>;
  insertMerge(brand: CrmBrand, row: Omit<MergeRow, 'id'>): Promise<StoreResult<MergeRow>>;
  undoMerge(brand: CrmBrand, mergeId: string, actor: string, now: string): Promise<StoreResult<{ merge: MergeRow; refused: string[] }>>;
}

const ACCOUNT_COLS = 'id,public_id,brand,display_name,status,city,county,notes,license_ref,facility_ref,license_jurisdiction,license_expiry,assigned_rep,account_type,lead_source,distributor,distributor_account_ref,street,state,postal_code,consent_version,consent_received_at,intake_submitted_at,ocm_status,record_marker,source_inquiry_id,latitude,longitude,geocode_source,geocode_match,geocoded_at,created_at,updated_at,created_by,updated_by';
const ORDER_COLS = 'id,public_id,brand,account_id,distributor,order_ref,retailer_name,ordered_on,delivered_on,order_status,invoice_cents,retailer_payment_status,retailer_paid_on,payout_status,payout_cents,payout_on,opportunity_id,source,imported_at';
const CONTACT_COLS = 'id,public_id,brand,account_id,name,title,email,phone,notes,preference,created_at,updated_at';
const OPP_COLS = 'id,public_id,brand,account_id,name,stage,forecast_cents,expected_close_on,notes,loss_reason,next_action,next_action_on,product_line,quantity_units,updated_at';
const TASK_COLS = 'id,public_id,brand,account_id,opportunity_id,title,due_on,status,notes,owner_actor,completed_at';

const ABSENT: CrmStore = new Proxy({} as CrmStore, {
  get: () => async () => ({ state: 'absent' as const }),
});

export function getCrmStore(): CrmStore {
  const client = getSupabaseServerClient();
  if (!client) return ABSENT;
  return new SupabaseCrmStore(client);
}

const MERGE_COLS = 'id,account_id,opportunity_id,actor,contact_ids,prior_accounts,created_at,undone_at,undone_by';

function mapPriors(value: unknown): ContactPrior[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const contactId = (row as { contactId?: unknown }).contactId;
    const priorAccountId = (row as { priorAccountId?: unknown }).priorAccountId;
    if (typeof contactId !== 'string' || typeof priorAccountId !== 'string') return [];
    return [{ contactId, priorAccountId }];
  });
}

function mapMerge(row: Record<string, unknown>): MergeRow | null {
  if (typeof row.id !== 'string' || typeof row.account_id !== 'string' || typeof row.opportunity_id !== 'string') return null;
  const ids = Array.isArray(row.contact_ids) ? row.contact_ids.filter((id): id is string => typeof id === 'string') : [];
  const priors = mapPriors(row.prior_accounts);
  return {
    id: row.id,
    accountId: row.account_id,
    opportunityId: row.opportunity_id,
    actor: typeof row.actor === 'string' ? row.actor : '',
    contactIds: ids.length ? ids : priors.map((item) => item.contactId),
    priors,
    createdAt: String(row.created_at || ''),
    undoneAt: typeof row.undone_at === 'string' ? row.undone_at : null,
    undoneBy: typeof row.undone_by === 'string' ? row.undone_by : null,
  };
}

function mapAccount(row: Record<string, unknown>): Account | null {
  const brand = asBrand(row.brand);
  if (!brand || typeof row.id !== 'string') return null;
  return {
    id: row.id,
    publicId: String(row.public_id ?? ''),
    brand,
    displayName: String(row.display_name ?? ''),
    status: row.status as AccountStatus,
    city: row.city === null || row.city === undefined ? null : String(row.city),
    county: row.county ? String(row.county) : null,
    notes: String(row.notes ?? ''),
    licenseRef: row.license_ref ? String(row.license_ref) : null,
    facilityRef: row.facility_ref ? String(row.facility_ref) : null,
    licenseJurisdiction: row.license_jurisdiction ? String(row.license_jurisdiction) : null,
    licenseExpiry: row.license_expiry ? String(row.license_expiry) : null,
    assignedRep: row.assigned_rep ? String(row.assigned_rep) : null,
    accountType: (ACCOUNT_TYPES as readonly string[]).includes(String(row.account_type)) ? (row.account_type as AccountType) : null,
    leadSource: (LEAD_SOURCES as readonly string[]).includes(String(row.lead_source)) ? (row.lead_source as LeadSource) : null,
    street: row.street ? String(row.street) : null,
    state: row.state ? String(row.state) : null,
    postalCode: row.postal_code ? String(row.postal_code) : null,
    consentVersion: row.consent_version ? String(row.consent_version) : null,
    consentReceivedAt: row.consent_received_at ? String(row.consent_received_at) : null,
    intakeSubmittedAt: row.intake_submitted_at ? String(row.intake_submitted_at) : null,
    ocmStatus: row.ocm_status === 'unverified' || row.ocm_status === 'verified' ? row.ocm_status : null,
    recordMarker: row.record_marker === 'test' ? 'test' : null,
    sourceInquiryId: row.source_inquiry_id ? String(row.source_inquiry_id) : null,
    latitude: row.latitude === null || row.latitude === undefined || row.latitude === '' ? null : Number(row.latitude),
    longitude: row.longitude === null || row.longitude === undefined || row.longitude === '' ? null : Number(row.longitude),
    geocodeSource: row.geocode_source ? String(row.geocode_source) : null,
    geocodeMatch: row.geocode_match ? String(row.geocode_match) : null,
    geocodedAt: row.geocoded_at ? String(row.geocoded_at) : null,
    distributor: (DISTRIBUTORS as readonly string[]).includes(String(row.distributor)) ? (row.distributor as Distributor) : null,
    distributorAccountRef: row.distributor_account_ref ? String(row.distributor_account_ref) : null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
    createdBy: String(row.created_by ?? ''),
    updatedBy: String(row.updated_by ?? ''),
  };
}

function asToken<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T : null;
}

function mapDistributorOrder(row: Record<string, unknown>): DistributorOrder | null {
  const brand = asBrand(row.brand);
  const distributor = asToken(row.distributor, DISTRIBUTORS);
  const orderStatus = asToken(row.order_status, ORDER_STATUSES);
  const payment = asToken(row.retailer_payment_status, RETAILER_PAYMENT_STATUSES);
  const payout = asToken(row.payout_status, PAYOUT_STATUSES);
  const source = asToken(row.source, ORDER_SOURCES);
  if (!brand || typeof row.id !== 'string' || !distributor || !orderStatus || !payment || !payout || !source) return null;
  return {
    id: row.id,
    publicId: String(row.public_id ?? ''),
    brand,
    accountId: typeof row.account_id === 'string' ? row.account_id : null,
    distributor,
    orderRef: String(row.order_ref ?? ''),
    retailerName: String(row.retailer_name ?? ''),
    orderedOn: row.ordered_on ? String(row.ordered_on) : null,
    deliveredOn: row.delivered_on ? String(row.delivered_on) : null,
    orderStatus,
    invoiceCents: typeof row.invoice_cents === 'number' ? row.invoice_cents : null,
    retailerPaymentStatus: payment,
    retailerPaidOn: row.retailer_paid_on ? String(row.retailer_paid_on) : null,
    payoutStatus: payout,
    payoutCents: typeof row.payout_cents === 'number' ? row.payout_cents : null,
    payoutOn: row.payout_on ? String(row.payout_on) : null,
    opportunityId: typeof row.opportunity_id === 'string' ? row.opportunity_id : null,
    source,
    importedAt: String(row.imported_at ?? ''),
  };
}

function mapContact(row: Record<string, unknown>): Contact | null {
  const brand = asBrand(row.brand);
  if (!brand || typeof row.id !== 'string' || typeof row.account_id !== 'string') return null;
  return {
    id: row.id,
    publicId: String(row.public_id ?? ''),
    brand,
    accountId: row.account_id,
    name: String(row.name ?? ''),
    title: row.title ? String(row.title) : null,
    email: row.email ? String(row.email) : null,
    phone: row.phone ? String(row.phone) : null,
    notes: String(row.notes ?? ''),
    preference: row.preference === 'store_only' || row.preference === 'do_not_contact' ? row.preference : 'unspecified',
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

function mapOpportunity(row: Record<string, unknown>): Opportunity | null {
  const brand = asBrand(row.brand);
  if (!brand || typeof row.id !== 'string' || typeof row.account_id !== 'string') return null;
  return {
    id: row.id,
    publicId: String(row.public_id ?? ''),
    brand,
    accountId: row.account_id,
    name: String(row.name ?? ''),
    stage: row.stage as OpportunityStage,
    forecastCents: typeof row.forecast_cents === 'number' ? row.forecast_cents : null,
    amountKind: 'forecast',
    invoicedCents: null,
    paidCents: null,
    expectedCloseOn: row.expected_close_on ? String(row.expected_close_on) : null,
    notes: String(row.notes ?? ''),
    lossReason: row.loss_reason ? String(row.loss_reason) : null,
    nextAction: row.next_action ? String(row.next_action) : null,
    nextActionOn: row.next_action_on ? String(row.next_action_on) : null,
    productLine: row.product_line === 'vape' || row.product_line === 'preroll' || row.product_line === 'gummy' || row.product_line === 'other' ? row.product_line : null,
    quantityUnits: typeof row.quantity_units === 'number' ? row.quantity_units : null,
    updatedAt: String(row.updated_at ?? ''),
  };
}

const STAGES: readonly OpportunityStage[] = ['lead', 'qualification', 'licensed_buyer_review', 'proposal', 'won', 'lost'];

function mapStageEvent(row: Record<string, unknown>): StageEvent | null {
  const brand = asBrand(row.brand);
  const toStage = asToken(row.to_stage, STAGES);
  const fromStage = row.from_stage === null || row.from_stage === undefined ? null : asToken(row.from_stage, STAGES);
  if (!brand || typeof row.id !== 'string' || typeof row.opportunity_id !== 'string' || !toStage) return null;
  if (row.from_stage !== null && row.from_stage !== undefined && !fromStage) return null;
  return { id: row.id, brand, opportunityId: row.opportunity_id, fromStage, toStage, at: String(row.at ?? '') };
}

function mapCapacity(row: Record<string, unknown>): Capacity | null {
  const brand = asBrand(row.brand);
  const productLine = row.product_line === 'vape' || row.product_line === 'preroll' || row.product_line === 'gummy' || row.product_line === 'other' ? row.product_line : null;
  if (!brand || typeof row.id !== 'string' || !productLine || typeof row.capacity_units !== 'number') return null;
  return { id: row.id, brand, month: String(row.month ?? '').slice(0, 10), productLine, capacityUnits: row.capacity_units, notes: String(row.notes ?? '') };
}

function mapVisit(row: Record<string, unknown>): Visit | null {
  const brand = asBrand(row.brand);
  const outcome = asToken(row.outcome, ['met_buyer', 'left_info', 'no_answer', 'order_taken', 'other'] as const);
  if (!brand || typeof row.id !== 'string' || typeof row.account_id !== 'string' || !outcome) return null;
  return {
    id: row.id,
    publicId: String(row.public_id ?? ''),
    brand,
    accountId: row.account_id,
    repActor: String(row.rep_actor ?? ''),
    checkedInAt: String(row.checked_in_at ?? ''),
    checkedOutAt: row.checked_out_at ? String(row.checked_out_at) : null,
    latitude: typeof row.latitude === 'number' ? row.latitude : row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
    longitude: typeof row.longitude === 'number' ? row.longitude : row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
    outcome,
    notes: String(row.notes ?? ''),
  };
}

function mapSample(row: Record<string, unknown>): Sample | null {
  const brand = asBrand(row.brand);
  const productLine = row.product_line === 'vape' || row.product_line === 'preroll' || row.product_line === 'gummy' || row.product_line === 'other' ? row.product_line : null;
  if (!brand || typeof row.id !== 'string' || typeof row.account_id !== 'string' || !productLine) return null;
  return {
    id: row.id,
    publicId: String(row.public_id ?? ''),
    brand,
    accountId: row.account_id,
    visitId: typeof row.visit_id === 'string' ? row.visit_id : null,
    productLine,
    quantityUnits: Number(row.quantity_units),
    leftOn: String(row.left_on ?? ''),
    followUpOn: String(row.follow_up_on ?? ''),
    notes: String(row.notes ?? ''),
  };
}

function mapMedia(row: Record<string, unknown>): Media | null {
  const brand = asBrand(row.brand);
  const kind = row.kind === 'shelf_photo' || row.kind === 'voice_note' ? row.kind : null;
  if (!brand || typeof row.id !== 'string' || typeof row.account_id !== 'string' || !kind) return null;
  return {
    id: row.id,
    publicId: String(row.public_id ?? ''),
    brand,
    accountId: row.account_id,
    visitId: typeof row.visit_id === 'string' ? row.visit_id : null,
    kind,
    storagePath: String(row.storage_path ?? ''),
    contentType: String(row.content_type ?? ''),
    byteSize: Number(row.byte_size),
    durationSeconds: typeof row.duration_seconds === 'number' ? row.duration_seconds : null,
    createdBy: String(row.created_by ?? ''),
    createdAt: String(row.created_at ?? ''),
  };
}

function mapBatch(row: Record<string, unknown>): Batch | null {
  const brand = asBrand(row.brand);
  if (!brand || typeof row.id !== 'string') return null;
  return {
    id: row.id,
    publicId: String(row.public_id ?? ''),
    brand,
    productId: String(row.product_id ?? ''),
    batchNumber: String(row.batch_number ?? ''),
    labName: String(row.lab_name ?? ''),
    testedOn: String(row.tested_on ?? '').slice(0, 10),
    coaStoragePath: row.coa_storage_path ? String(row.coa_storage_path) : null,
    released: row.released === true,
    releasedAt: row.released_at ? String(row.released_at) : null,
    createdBy: String(row.created_by ?? ''),
    createdAt: String(row.created_at ?? ''),
  };
}

function mapReorderLink(row: Record<string, unknown>): ReorderLink | null {
  const brand = asBrand(row.brand);
  if (!brand || typeof row.id !== 'string' || typeof row.account_id !== 'string' || typeof row.token_hash !== 'string') return null;
  return {
    id: row.id,
    publicId: String(row.public_id ?? ''),
    brand,
    accountId: row.account_id,
    tokenHash: row.token_hash,
    expiresAt: String(row.expires_at ?? ''),
    revokedAt: row.revoked_at ? String(row.revoked_at) : null,
    createdBy: String(row.created_by ?? ''),
    createdAt: String(row.created_at ?? ''),
  };
}

function mapReorderRequest(row: Record<string, unknown>): ReorderRequest | null {
  const brand = asBrand(row.brand);
  const status = row.status === 'received' || row.status === 'converted' || row.status === 'declined' ? row.status : null;
  if (!brand || typeof row.id !== 'string' || typeof row.account_id !== 'string' || typeof row.link_id !== 'string' || !status || !Array.isArray(row.lines)) return null;
  const lines: ReorderLine[] = [];
  for (const line of row.lines) {
    if (!line || typeof line !== 'object') return null;
    const record = line as Record<string, unknown>;
    if (typeof record.productId !== 'string' || typeof record.batchNumber !== 'string' || typeof record.quantityUnits !== 'number') return null;
    lines.push({ productId: record.productId, batchNumber: record.batchNumber, quantityUnits: record.quantityUnits });
  }
  return {
    id: row.id,
    publicId: String(row.public_id ?? ''),
    brand,
    accountId: row.account_id,
    linkId: row.link_id,
    lines,
    buyerName: String(row.buyer_name ?? ''),
    buyerEmail: String(row.buyer_email ?? ''),
    note: String(row.note ?? ''),
    createdAt: String(row.created_at ?? ''),
    status,
  };
}

function mapEmailLog(row: Record<string, unknown>): EmailLog | null {
  const brand = asBrand(row.brand);
  const kind = row.kind === 'digest' || row.kind === 'reorder_link' ? row.kind : null;
  if (!brand || typeof row.id !== 'string' || !kind || typeof row.resend_id !== 'string' || typeof row.recipient !== 'string') return null;
  return {
    id: row.id,
    brand,
    kind,
    resendId: row.resend_id,
    recipient: row.recipient,
    accountId: typeof row.account_id === 'string' ? row.account_id : null,
    sentAt: String(row.sent_at ?? ''),
    lastEvent: knownEmailEvent(typeof row.last_event === 'string' ? row.last_event : null),
    lastEventAt: row.last_event_at ? String(row.last_event_at) : null,
    createdBy: String(row.created_by ?? ''),
  };
}

function asReleased(batch: Batch): ReleasedBatch {
  return {
    id: batch.id,
    productId: batch.productId,
    batchNumber: batch.batchNumber,
    labName: batch.labName,
    testedOn: batch.testedOn,
    released: batch.released,
    coaStoragePath: batch.coaStoragePath,
  };
}

function mapTask(row: Record<string, unknown>): Task | null {
  const brand = asBrand(row.brand);
  if (!brand || typeof row.id !== 'string') return null;
  return {
    id: row.id,
    publicId: String(row.public_id ?? ''),
    brand,
    accountId: typeof row.account_id === 'string' ? row.account_id : null,
    opportunityId: typeof row.opportunity_id === 'string' ? row.opportunity_id : null,
    title: String(row.title ?? ''),
    dueOn: row.due_on ? String(row.due_on) : null,
    status: row.status as TaskStatus,
    notes: String(row.notes ?? ''),
    ownerActor: row.owner_actor ? String(row.owner_actor) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
  };
}

function mapActivity(row: Record<string, unknown>): Activity | null {
  const brand = asBrand(row.brand);
  if (!brand || typeof row.id !== 'string') return null;
  return {
    id: row.id,
    publicId: String(row.public_id ?? ''),
    brand,
    accountId: typeof row.account_id === 'string' ? row.account_id : null,
    kind: String(row.kind ?? ''),
    summary: String(row.summary ?? ''),
    actor: String(row.actor ?? ''),
    createdAt: String(row.created_at ?? ''),
  };
}

function mapInsight(row: Record<string, unknown>): StoredInsight | null {
  const brand = asBrand(row.brand);
  if (!brand || typeof row.evidence !== 'string') return null;
  const factors = Array.isArray(row.factors) ? row.factors.filter((item) => typeof item === 'string') : [];
  return {
    brand,
    accountId: typeof row.account_id === 'string' ? row.account_id : null,
    staffOnly: true,
    kind: row.kind as StoredInsight['kind'],
    evidence: row.evidence,
    source: row.source ? String(row.source) : null,
    refreshedAt: row.refreshed_at ? String(row.refreshed_at) : null,
    sufficiency: row.sufficiency === 'sufficient' ? 'sufficient' : 'insufficient',
    uncertainty: String(row.uncertainty ?? ''),
    factors: factors as string[],
  };
}

function mapAlert(row: Record<string, unknown>): AlertRecord | null {
  const brand = asBrand(row.brand);
  if (!brand || typeof row.id !== 'string') return null;
  const factors = Array.isArray(row.factors) ? row.factors.filter((item) => typeof item === 'string') : [];
  return {
    id: row.id,
    brand,
    kind: row.kind as AlertRecord['kind'],
    status: row.status as AlertRecord['status'],
    dedupeKey: String(row.dedupe_key ?? ''),
    subjectRef: String(row.subject_ref ?? ''),
    assignedTo: row.assigned_to ? String(row.assigned_to) : null,
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    reviewedBy: row.reviewed_by ? String(row.reviewed_by) : null,
    dismissedAt: row.dismissed_at ? String(row.dismissed_at) : null,
    dismissedBy: row.dismissed_by ? String(row.dismissed_by) : null,
    activated: false,
    synthetic: false,
    evidence: String(row.evidence ?? ''),
    sufficiency: 'sufficient',
    uncertainty: String(row.uncertainty ?? ''),
    factors: factors as string[],
    source: row.source ? String(row.source) : null,
    refreshedAt: row.refreshed_at ? String(row.refreshed_at) : null,
    staffOnly: true,
  };
}

class SupabaseCrmStore implements CrmStore {
  constructor(private readonly db: SupabaseClient) {}

  private async rows<T>(
    brand: CrmBrand,
    query: PromiseLike<{ data: Record<string, unknown>[] | null; error: DbError }>,
    map: (row: Record<string, unknown>) => T | null,
  ): Promise<StoreResult<T[]>> {
    const { data, error } = await query;
    const failed = classify(error);
    if (failed) return { state: failed };
    const mapped: T[] = [];
    for (const row of data ?? []) {
      const item = map(row);
      if (!item) return { state: 'unavailable' };
      mapped.push(item);
    }
    const scoped = isolateBrand(mapped as ({ brand: CrmBrand })[], brand);
    if (!scoped.ok) return { state: 'unavailable' };
    return { state: 'ok', value: scoped.rows as T[] };
  }

  async counts(brand: CrmBrand): Promise<StoreResult<Counts>> {
    const [accounts, contacts, opportunities, openTasks, forecasts] = await Promise.all([
      this.db.from('crm_accounts').select('id', { count: 'exact', head: true }).eq('brand', brand),
      this.db.from('crm_contacts').select('id', { count: 'exact', head: true }).eq('brand', brand),
      this.db.from('crm_opportunities').select('id', { count: 'exact', head: true }).eq('brand', brand),
      this.db.from('crm_tasks').select('id', { count: 'exact', head: true }).eq('brand', brand).eq('status', 'open'),
      this.db.from('crm_opportunities').select('forecast_cents').eq('brand', brand).not('forecast_cents', 'is', null).limit(2001),
    ]);
    const failed = classify(accounts.error) || classify(contacts.error) || classify(opportunities.error) || classify(openTasks.error) || classify(forecasts.error);
    if (failed) return { state: failed };
    const forecastRows = forecasts.data ?? [];
    const complete = forecastRows.length <= 2000;
    let forecastCents: number | null = null;
    if (complete) {
      for (const row of forecastRows) {
        if (typeof row.forecast_cents === 'number') forecastCents = (forecastCents ?? 0) + row.forecast_cents;
      }
    }
    return {
      state: 'ok',
      value: {
        accounts: accounts.count ?? 0,
        contacts: contacts.count ?? 0,
        opportunities: opportunities.count ?? 0,
        openTasks: openTasks.count ?? 0,
        forecastCents,
        forecastComplete: complete,
      },
    };
  }

  listAccounts(brand: CrmBrand, filter: { q: string | null; status: AccountStatus | null }) {
    let query = this.db.from('crm_accounts').select(ACCOUNT_COLS).eq('brand', brand).order('updated_at', { ascending: false }).limit(100);
    if (filter.status) query = query.eq('status', filter.status);
    if (filter.q) query = query.ilike('display_name', `%${filter.q}%`);
    return this.rows(brand, query, mapAccount);
  }

  async createAccount(brand: CrmBrand, actor: string, input: { displayName: string; status: AccountStatus; city: string | null; county?: string | null; notes: string; licenseRef?: string | null; facilityRef?: string | null; licenseJurisdiction?: string | null; licenseExpiry?: string | null; assignedRep?: string | null; accountType?: AccountType | null; leadSource?: LeadSource | null; distributor?: Distributor | null; distributorAccountRef?: string | null }): Promise<StoreResult<Account>> {
    const { data, error } = await this.db.from('crm_accounts').insert({
      brand,
      display_name: input.displayName,
      status: input.status,
      city: input.city,
      county: input.county ?? null,
      notes: input.notes,
      license_ref: input.licenseRef ?? null,
      facility_ref: input.facilityRef ?? null,
      license_jurisdiction: input.licenseJurisdiction ?? null,
      license_expiry: input.licenseExpiry ?? null,
      assigned_rep: input.assignedRep ?? null,
      account_type: input.accountType ?? null,
      lead_source: input.leadSource ?? null,
      distributor: input.distributor ?? null,
      distributor_account_ref: input.distributorAccountRef ?? null,
      created_by: actor,
      updated_by: actor,
    }).select(ACCOUNT_COLS).maybeSingle();
    const failed = classify(error);
    if (failed) return { state: failed };
    if (error) return { state: 'rejected' as const };
    const account = data ? mapAccount(data as Record<string, unknown>) : null;
    if (!account || account.brand !== brand) return { state: 'unavailable' };
    return { state: 'ok', value: account };
  }

  async updateAccount(brand: CrmBrand, actor: string, id: string, patch: { displayName?: string; status?: AccountStatus; city?: string | null; county?: string | null; notes?: string; licenseRef?: string | null; facilityRef?: string | null; licenseJurisdiction?: string | null; licenseExpiry?: string | null; assignedRep?: string | null; accountType?: AccountType | null; leadSource?: LeadSource | null; distributor?: Distributor | null; distributorAccountRef?: string | null }) {
    const row: Record<string, unknown> = { updated_by: actor };
    if (patch.displayName !== undefined) row.display_name = patch.displayName;
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.city !== undefined) row.city = patch.city;
    if (patch.county !== undefined) row.county = patch.county;
    if (patch.notes !== undefined) row.notes = patch.notes;
    if (patch.licenseRef !== undefined) row.license_ref = patch.licenseRef;
    if (patch.facilityRef !== undefined) row.facility_ref = patch.facilityRef;
    if (patch.licenseJurisdiction !== undefined) row.license_jurisdiction = patch.licenseJurisdiction;
    if (patch.licenseExpiry !== undefined) row.license_expiry = patch.licenseExpiry;
    if (patch.assignedRep !== undefined) row.assigned_rep = patch.assignedRep;
    if (patch.accountType !== undefined) row.account_type = patch.accountType;
    if (patch.leadSource !== undefined) row.lead_source = patch.leadSource;
    if (patch.distributor !== undefined) row.distributor = patch.distributor;
    if (patch.distributorAccountRef !== undefined) row.distributor_account_ref = patch.distributorAccountRef;
    const { data, error } = await this.db.from('crm_accounts').update(row).eq('id', id).eq('brand', brand).select(ACCOUNT_COLS).maybeSingle();
    return this.one(brand, data as Record<string, unknown> | null, error, mapAccount);
  }

  listContacts(brand: CrmBrand, accountId: string | null) {
    let query = this.db.from('crm_contacts').select(CONTACT_COLS).eq('brand', brand).order('updated_at', { ascending: false }).limit(100);
    if (accountId) query = query.eq('account_id', accountId);
    return this.rows(brand, query, mapContact);
  }

  async createContact(brand: CrmBrand, actor: string, input: ContactWrite & { accountId: string; name: string }) {
    const { data, error } = await this.db.from('crm_contacts').insert({
      brand,
      account_id: input.accountId,
      name: input.name,
      title: input.title ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      notes: input.notes ?? '',
      preference: input.preference ?? 'unspecified',
      created_by: actor,
      updated_by: actor,
    }).select(CONTACT_COLS).maybeSingle();
    return this.one(brand, data as Record<string, unknown> | null, error, mapContact);
  }

  async updateContact(brand: CrmBrand, actor: string, id: string, patch: ContactWrite) {
    const row: Record<string, unknown> = { updated_by: actor };
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.email !== undefined) row.email = patch.email;
    if (patch.phone !== undefined) row.phone = patch.phone;
    if (patch.notes !== undefined) row.notes = patch.notes;
    if (patch.preference !== undefined) row.preference = patch.preference;
    const { data, error } = await this.db.from('crm_contacts').update(row).eq('id', id).eq('brand', brand).select(CONTACT_COLS).maybeSingle();
    return this.one(brand, data as Record<string, unknown> | null, error, mapContact);
  }

  // Pipeline list and the reports funnel. The 100 most recently updated rows
  // are the display window. Forecast math does not use this list.
  listOpportunities(brand: CrmBrand) {
    return this.rows(
      brand,
      this.db.from('crm_opportunities').select(OPP_COLS).eq('brand', brand).order('updated_at', { ascending: false }).limit(100),
      mapOpportunity,
    );
  }

  async createOpportunity(brand: CrmBrand, actor: string, input: OpportunityWrite & { accountId: string; name: string; stage: OpportunityStage }) {
    const { data, error } = await this.db.from('crm_opportunities').insert({
      brand,
      account_id: input.accountId,
      name: input.name,
      stage: input.stage,
      forecast_cents: input.forecastCents ?? null,
      expected_close_on: input.expectedCloseOn ?? null,
      notes: input.notes ?? '',
      loss_reason: input.lossReason ?? null,
      next_action: input.nextAction ?? null,
      next_action_on: input.nextActionOn ?? null,
      product_line: input.productLine ?? null,
      quantity_units: input.quantityUnits ?? null,
      created_by: actor,
      updated_by: actor,
    }).select(OPP_COLS).maybeSingle();
    const saved = this.one(brand, data as Record<string, unknown> | null, error, mapOpportunity);
    if (saved.state === 'ok' && wonMergeOnSave({ brand, creating: true, nextStage: input.stage, previousStage: null })) {
      const merged = await this.mergeWonContacts(brand, actor, saved.value);
      if (!merged) {
        const failed: StoreResult<Opportunity> = { state: 'ok', value: saved.value, mergeFailed: true };
        return failed;
      }
    }
    return saved;
  }

  async updateOpportunity(brand: CrmBrand, actor: string, id: string, patch: OpportunityWrite) {
    let previousStage: string | null = null;
    if (patch.stage === 'won' && brand === 'cedargrowth') {
      const prior = await this.db.from('crm_opportunities').select('stage').eq('id', id).eq('brand', brand).maybeSingle();
      const priorFailed = classify(prior.error);
      if (priorFailed) return { state: priorFailed };
      previousStage = prior.data && typeof prior.data.stage === 'string' ? prior.data.stage : null;
    }
    const row: Record<string, unknown> = { updated_by: actor };
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.stage !== undefined) row.stage = patch.stage;
    if (patch.forecastCents !== undefined) row.forecast_cents = patch.forecastCents;
    if (patch.expectedCloseOn !== undefined) row.expected_close_on = patch.expectedCloseOn;
    if (patch.notes !== undefined) row.notes = patch.notes;
    if (patch.lossReason !== undefined) row.loss_reason = patch.lossReason;
    if (patch.nextAction !== undefined) row.next_action = patch.nextAction;
    if (patch.nextActionOn !== undefined) row.next_action_on = patch.nextActionOn;
    if (patch.productLine !== undefined) row.product_line = patch.productLine;
    if (patch.quantityUnits !== undefined) row.quantity_units = patch.quantityUnits;
    const { data, error } = await this.db.from('crm_opportunities').update(row).eq('id', id).eq('brand', brand).select(OPP_COLS).maybeSingle();
    const saved = this.one(brand, data as Record<string, unknown> | null, error, mapOpportunity);
    if (saved.state === 'ok' && wonMergeOnSave({ brand, creating: false, nextStage: patch.stage, previousStage })) {
      const merged = await this.mergeWonContacts(brand, actor, saved.value);
      if (!merged) {
        const failed: StoreResult<Opportunity> = { state: 'ok', value: saved.value, mergeFailed: true };
        return failed;
      }
    }
    return saved;
  }

  private async mergeWonContacts(brand: CrmBrand, actor: string, opportunity: Opportunity): Promise<boolean> {
    if (brand !== 'cedargrowth') return true;
    const { error } = await this.db.rpc('crm_merge_won_distribution', { p_opportunity_id: opportunity.id, p_actor: actor });
    if (classify(error) || error) {
      console.error('crm won merge failed', { opportunityId: opportunity.id, brand });
      return false;
    }
    return true;
  }

  async readAccount(brand: CrmBrand, id: string): Promise<StoreResult<Account | null>> {
    const { data, error } = await this.db.from('crm_accounts').select(ACCOUNT_COLS).eq('id', id).eq('brand', brand).maybeSingle();
    const failed = classify(error);
    if (failed) return { state: failed };
    if (!data) return { state: 'ok', value: null };
    const account = mapAccount(data as Record<string, unknown>);
    return { state: 'ok', value: account && account.brand === brand ? account : null };
  }

  async readPlaceCache(brand: CrmBrand, accountId: string): Promise<StoreResult<PlaceCache | null>> {
    const { data, error } = await this.db.from('crm_google_places').select('place_id,match_status,fields,fetched_at').eq('account_id', accountId).eq('brand', brand).maybeSingle();
    const failed = classify(error);
    if (failed) return { state: failed };
    if (!data) return { state: 'ok', value: null };
    const row = data as { place_id?: string | null; match_status?: string; fields?: PlaceCard | null; fetched_at?: string };
    if (row.match_status !== 'matched' && row.match_status !== 'none') return { state: 'ok', value: null };
    return {
      state: 'ok',
      value: {
        placeId: row.place_id ?? null,
        matchStatus: row.match_status,
        fields: row.match_status === 'matched' ? row.fields ?? null : null,
        fetchedAt: String(row.fetched_at || ''),
      },
    };
  }

  async savePlaceCache(brand: CrmBrand, accountId: string, cache: PlaceCache): Promise<StoreResult<PlaceCache>> {
    const { error } = await this.db.from('crm_google_places').upsert({
      account_id: accountId,
      brand,
      place_id: cache.placeId,
      match_status: cache.matchStatus,
      fields: cache.fields ?? {},
      fetched_at: cache.fetchedAt,
    }, { onConflict: 'account_id' });
    const failed = classify(error);
    if (failed) return { state: failed };
    if (error) return { state: 'unavailable' };
    return { state: 'ok', value: cache };
  }

  async readOpenMerge(brand: CrmBrand, opportunityId: string): Promise<StoreResult<MergeRow | null>> {
    const { data, error } = await this.db.from('crm_distribution_merges').select(MERGE_COLS).eq('brand', brand).eq('opportunity_id', opportunityId).is('undone_at', null).maybeSingle();
    const failed = classify(error);
    if (failed) return { state: failed };
    if (!data) return { state: 'ok', value: null };
    return { state: 'ok', value: mapMerge(data as Record<string, unknown>) };
  }

  async readAccountMerge(brand: CrmBrand, accountId: string): Promise<StoreResult<MergeRow | null>> {
    const { data, error } = await this.db.from('crm_distribution_merges').select(MERGE_COLS).eq('brand', brand).eq('account_id', accountId).is('undone_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
    const failed = classify(error);
    if (failed) return { state: failed };
    if (!data) return { state: 'ok', value: null };
    return { state: 'ok', value: mapMerge(data as Record<string, unknown>) };
  }

  async insertMerge(brand: CrmBrand, row: Omit<MergeRow, 'id'>): Promise<StoreResult<MergeRow>> {
    const { data, error } = await this.db.from('crm_distribution_merges').insert({
      brand,
      account_id: row.accountId,
      opportunity_id: row.opportunityId,
      actor: row.actor,
      contact_ids: row.contactIds,
      prior_accounts: row.priors,
      created_at: row.createdAt,
    }).select(MERGE_COLS).maybeSingle();
    const failed = classify(error);
    if (failed) return { state: failed };
    const mapped = data ? mapMerge(data as Record<string, unknown>) : null;
    if (!mapped) return { state: 'unavailable' };
    return { state: 'ok', value: mapped };
  }

  async undoMerge(brand: CrmBrand, mergeId: string, actor: string, now: string): Promise<StoreResult<{ merge: MergeRow; refused: string[] }>> {
    if (brand !== 'cedargrowth') return { state: 'rejected' };
    const { data, error } = await this.db.rpc('crm_undo_distribution_merge', { p_merge_id: mergeId, p_actor: actor, p_now: now });
    const failed = classify(error);
    if (failed) return { state: failed };
    const payload = data as { ok?: boolean; refused?: unknown; merge?: Record<string, unknown> } | null;
    const mapped = payload?.merge ? mapMerge(payload.merge) : null;
    if (error || !payload || payload.ok !== true || !mapped) return { state: 'rejected' };
    const refused = Array.isArray(payload.refused) ? payload.refused.filter((id): id is string => typeof id === 'string') : [];
    return { state: 'ok', value: { merge: mapped, refused } };
  }

  listTasks(brand: CrmBrand, status: TaskStatus | null) {
    let query = this.db.from('crm_tasks').select(TASK_COLS).eq('brand', brand).order('due_on', { ascending: true }).limit(100);
    if (status) query = query.eq('status', status);
    return this.rows(brand, query, mapTask);
  }

  async createTask(brand: CrmBrand, actor: string, input: TaskWrite & { title: string; status: TaskStatus }) {
    const { data, error } = await this.db.from('crm_tasks').insert({
      brand,
      account_id: input.accountId ?? null,
      opportunity_id: input.opportunityId ?? null,
      title: input.title,
      due_on: input.dueOn ?? null,
      status: input.status,
      notes: input.notes ?? '',
      owner_actor: input.ownerActor ?? actor,
      created_by: actor,
      updated_by: actor,
    }).select(TASK_COLS).maybeSingle();
    return this.one(brand, data as Record<string, unknown> | null, error, mapTask);
  }

  async updateTask(brand: CrmBrand, actor: string, id: string, patch: TaskWrite) {
    const row: Record<string, unknown> = { updated_by: actor };
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.dueOn !== undefined) row.due_on = patch.dueOn;
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.notes !== undefined) row.notes = patch.notes;
    if (patch.ownerActor !== undefined) row.owner_actor = patch.ownerActor;
    if (patch.accountId !== undefined) row.account_id = patch.accountId;
    if (patch.opportunityId !== undefined) row.opportunity_id = patch.opportunityId;
    const { data, error } = await this.db.from('crm_tasks').update(row).eq('id', id).eq('brand', brand).select(TASK_COLS).maybeSingle();
    return this.one(brand, data as Record<string, unknown> | null, error, mapTask);
  }

  listActivity(brand: CrmBrand) {
    return this.rows(
      brand,
      this.db.from('crm_activity').select('*').eq('brand', brand).order('created_at', { ascending: false }).limit(100),
      mapActivity,
    );
  }

  async search(brand: CrmBrand, q: string): Promise<StoreResult<{ accounts: Account[]; contacts: Contact[]; opportunities: Opportunity[] }>> {
    const [accounts, contacts, opportunities] = await Promise.all([
      this.listAccounts(brand, { q, status: null }),
      this.rows(brand, this.db.from('crm_contacts').select(CONTACT_COLS).eq('brand', brand).ilike('name', `%${q}%`).limit(25), mapContact),
      this.rows(brand, this.db.from('crm_opportunities').select(OPP_COLS).eq('brand', brand).ilike('name', `%${q}%`).limit(25), mapOpportunity),
    ]);
    if (accounts.state !== 'ok') return accounts;
    if (contacts.state !== 'ok') return contacts;
    if (opportunities.state !== 'ok') return opportunities;
    return { state: 'ok', value: { accounts: accounts.value, contacts: contacts.value, opportunities: opportunities.value } };
  }

  async exportBrand(brand: CrmBrand): Promise<StoreResult<{ accounts: Account[]; contacts: Contact[]; opportunities: Opportunity[]; tasks: Task[]; activity: Activity[]; truncated: boolean }>> {
    const [accounts, contacts, opportunities, tasks, activity] = await Promise.all([
      this.rows(brand, this.db.from('crm_accounts').select(ACCOUNT_COLS).eq('brand', brand).limit(2001), mapAccount),
      this.rows(brand, this.db.from('crm_contacts').select(CONTACT_COLS).eq('brand', brand).limit(2001), mapContact),
      this.rows(brand, this.db.from('crm_opportunities').select(OPP_COLS).eq('brand', brand).limit(2001), mapOpportunity),
      this.rows(brand, this.db.from('crm_tasks').select(TASK_COLS).eq('brand', brand).limit(2001), mapTask),
      this.rows(brand, this.db.from('crm_activity').select('*').eq('brand', brand).limit(2001), mapActivity),
    ]);
    const parts = [accounts, contacts, opportunities, tasks, activity];
    for (const part of parts) if (part.state !== 'ok') return part;
    const truncated = [accounts, contacts, opportunities, tasks, activity].some((part) => part.state === 'ok' && part.value.length > 2000);
    return {
      state: 'ok',
      value: {
        accounts: accounts.state === 'ok' ? accounts.value.slice(0, 2000) : [],
        contacts: contacts.state === 'ok' ? contacts.value.slice(0, 2000) : [],
        opportunities: opportunities.state === 'ok' ? opportunities.value.slice(0, 2000) : [],
        tasks: tasks.state === 'ok' ? tasks.value.slice(0, 2000) : [],
        activity: activity.state === 'ok' ? activity.value.slice(0, 2000) : [],
        truncated,
      },
    };
  }

  async intelligence(brand: CrmBrand): Promise<StoreResult<IntelRead>> {
    const [recommendations, alerts] = await Promise.all([
      this.rows(brand, this.db.from('crm_intel_recommendations').select('*').eq('brand', brand).order('created_at', { ascending: false }).limit(100), mapInsight),
      this.rows(brand, this.db.from('crm_intel_alerts').select('*').eq('brand', brand).order('updated_at', { ascending: false }).limit(100), mapAlert),
    ]);
    if (recommendations.state !== 'ok') return recommendations;
    if (alerts.state !== 'ok') return alerts;
    return { state: 'ok', value: { recommendations: recommendations.value, alerts: alerts.value } };
  }

  async applyAlert(brand: CrmBrand, id: string, next: AlertRecord): Promise<StoreResult<AlertRecord>> {
    if (next.brand !== brand || next.activated !== false || next.synthetic) return { state: 'rejected' };
    const { data, error } = await this.db.from('crm_intel_alerts').update({
      status: next.status,
      assigned_to: next.assignedTo,
      reviewed_at: next.reviewedAt,
      reviewed_by: next.reviewedBy,
      dismissed_at: next.dismissedAt,
      dismissed_by: next.dismissedBy,
      activated: false,
    }).eq('id', id).eq('brand', brand).select('*').maybeSingle();
    return this.one(brand, data as Record<string, unknown> | null, error, mapAlert);
  }

  listNotes(brand: CrmBrand, accountId: string | null) {
    let query = this.db.from('crm_notes').select('id,public_id,brand,account_id,body,actor,created_at').eq('brand', brand).order('created_at', { ascending: false }).limit(100);
    if (accountId) query = query.eq('account_id', accountId);
    return this.rows(brand, query, (row) => {
      const b = asBrand(row.brand);
      if (!b || typeof row.id !== 'string' || typeof row.account_id !== 'string') return null;
      return { id: row.id, publicId: String(row.public_id ?? ''), brand: b, accountId: row.account_id, body: String(row.body ?? ''), actor: String(row.actor ?? ''), createdAt: String(row.created_at ?? '') };
    });
  }

  async createNote(brand: CrmBrand, actor: string, input: { accountId: string; body: string }): Promise<StoreResult<Note>> {
    const { data, error } = await this.db.from('crm_notes').insert({
      brand, account_id: input.accountId, body: input.body, actor,
    }).select('id,public_id,brand,account_id,body,actor,created_at').maybeSingle();
    return this.one(brand, data as Record<string, unknown> | null, error, (row) => {
      const b = asBrand(row.brand);
      if (!b || typeof row.id !== 'string' || typeof row.account_id !== 'string') return null;
      return { id: row.id, publicId: String(row.public_id ?? ''), brand: b, accountId: row.account_id, body: String(row.body ?? ''), actor: String(row.actor ?? ''), createdAt: String(row.created_at ?? '') };
    });
  }

  listDistributorOrders(brand: CrmBrand) {
    return this.rows(
      brand,
      this.db.from('crm_distributor_orders').select(ORDER_COLS).eq('brand', brand).order('imported_at', { ascending: false }).limit(500),
      mapDistributorOrder,
    );
  }

  async upsertDistributorOrder(brand: CrmBrand, _actor: string, input: DistributorOrderDraft & { accountId: string | null }): Promise<StoreResult<{ order: DistributorOrder; action: 'created' | 'updated' }>> {
    const existing = await this.db.from('crm_distributor_orders').select(ORDER_COLS).eq('brand', brand).eq('distributor', input.distributor).eq('order_ref', input.orderRef).maybeSingle();
    const failed = classify(existing.error);
    if (failed) return { state: failed };
    if (existing.error) return { state: 'rejected' };
    const current = existing.data ? mapDistributorOrder(existing.data as Record<string, unknown>) : null;
    if (current && current.brand === brand) {
      const { data, error } = await this.db.from('crm_distributor_orders').update({
        order_status: input.orderStatus,
        delivered_on: input.deliveredOn,
        invoice_cents: input.invoiceCents,
        retailer_payment_status: input.retailerPaymentStatus,
        retailer_paid_on: input.retailerPaidOn,
        payout_status: input.payoutStatus,
        payout_cents: input.payoutCents,
        payout_on: input.payoutOn,
        imported_at: new Date().toISOString(),
      }).eq('id', current.id).eq('brand', brand).select(ORDER_COLS).maybeSingle();
      const saved = this.one(brand, data as Record<string, unknown> | null, error, mapDistributorOrder);
      if (saved.state !== 'ok') return saved;
      return { state: 'ok', value: { order: saved.value, action: 'updated' } };
    }
    const { data, error } = await this.db.from('crm_distributor_orders').insert({
      brand,
      account_id: input.accountId,
      distributor: input.distributor,
      order_ref: input.orderRef,
      retailer_name: input.retailerName,
      ordered_on: input.orderedOn,
      delivered_on: input.deliveredOn,
      order_status: input.orderStatus,
      invoice_cents: input.invoiceCents,
      retailer_payment_status: input.retailerPaymentStatus,
      retailer_paid_on: input.retailerPaidOn,
      payout_status: input.payoutStatus,
      payout_cents: input.payoutCents,
      payout_on: input.payoutOn,
      source: 'csv',
    }).select(ORDER_COLS).maybeSingle();
    const saved = this.one(brand, data as Record<string, unknown> | null, error, mapDistributorOrder);
    if (saved.state !== 'ok') return saved;
    return { state: 'ok', value: { order: saved.value, action: 'created' } };
  }

  async linkDistributorOrder(brand: CrmBrand, orderId: string, accountId: string): Promise<StoreResult<DistributorOrder>> {
    const account = await this.db.from('crm_accounts').select('id,brand').eq('id', accountId).eq('brand', brand).maybeSingle();
    const accountFailed = classify(account.error);
    if (accountFailed) return { state: accountFailed };
    if (account.error || !account.data || account.data.brand !== brand) return { state: 'rejected' };
    const { data, error } = await this.db.from('crm_distributor_orders').update({ account_id: accountId }).eq('id', orderId).eq('brand', brand).select(ORDER_COLS).maybeSingle();
    return this.one(brand, data as Record<string, unknown> | null, error, mapDistributorOrder);
  }

  async markDealWonFromOrder(brand: CrmBrand, actor: string, orderId: string, opportunityId: string): Promise<StoreResult<{ order: DistributorOrder; stage: OpportunityStage }>> {
    const order = await this.db.from('crm_distributor_orders').select(ORDER_COLS).eq('id', orderId).eq('brand', brand).maybeSingle();
    const orderFailed = classify(order.error);
    if (orderFailed) return { state: orderFailed };
    const current = order.data ? mapDistributorOrder(order.data as Record<string, unknown>) : null;
    if (order.error || !current || !current.accountId) return { state: 'rejected' };
    const deal = await this.db.from('crm_opportunities').select(OPP_COLS).eq('id', opportunityId).eq('brand', brand).maybeSingle();
    const dealFailed = classify(deal.error);
    if (dealFailed) return { state: dealFailed };
    const mapped = deal.data ? mapOpportunity(deal.data as Record<string, unknown>) : null;
    if (!mapped || mapped.accountId !== current.accountId || OPEN_STAGES.indexOf(mapped.stage) < 0) return { state: 'rejected' };
    const won = await this.updateOpportunity(brand, actor, opportunityId, { stage: 'won' });
    if (won.state !== 'ok') return won;
    const { data, error } = await this.db.from('crm_distributor_orders').update({ opportunity_id: opportunityId }).eq('id', orderId).eq('brand', brand).select(ORDER_COLS).maybeSingle();
    const saved = this.one(brand, data as Record<string, unknown> | null, error, mapDistributorOrder);
    if (saved.state !== 'ok') return saved;
    return { state: 'ok', value: { order: saved.value, stage: 'won' }, mergeFailed: won.mergeFailed === true };
  }

  // Digest week counts and territory quiet-deal checks. Oldest 5000 only, so
  // a newer event past that cap is absent here. Forecast win rates use
  // listForecastInputs, which reads events for closed deals by id.
  listStageEvents(brand: CrmBrand) {
    return this.rows(
      brand,
      this.db.from('crm_stage_events').select('id,brand,opportunity_id,from_stage,to_stage,at').eq('brand', brand).order('at', { ascending: true }).limit(5000),
      mapStageEvent,
    );
  }

  async listForecastInputs(brand: CrmBrand, window: ForecastWindow) {
    const filter = forecastDealFilter(window);
    if (!filter) return { state: 'unavailable' as const };
    const dealColumns = 'id,brand,stage,expected_close_on,product_line,quantity_units';
    const eventColumns = 'id,brand,opportunity_id,from_stage,to_stage,at';
    return readForecastInputs(brand, window, {
      opportunityPage: async (afterId, limit) => {
        let query = this.db.from('crm_opportunities').select(dealColumns).eq('brand', brand).or(filter).order('id', { ascending: true }).limit(limit);
        if (afterId) query = query.gt('id', afterId);
        const { data, error } = await query;
        return { data: (data as Record<string, unknown>[] | null) ?? null, error };
      },
      stageEventProbe: async () => {
        const { data, error } = await this.db.from('crm_stage_events').select('id').eq('brand', brand).limit(1);
        return { data: (data as Record<string, unknown>[] | null) ?? null, error };
      },
      stageEventPage: async (opportunityIds, afterId, limit) => {
        let query = this.db.from('crm_stage_events').select(eventColumns).eq('brand', brand).in('opportunity_id', [...opportunityIds]).order('id', { ascending: true }).limit(limit);
        if (afterId) query = query.gt('id', afterId);
        const { data, error } = await query;
        return { data: (data as Record<string, unknown>[] | null) ?? null, error };
      },
    });
  }

  // Capacity for one forecast window, plus the latest earlier row for each
  // product line. Migration 0126 checks extract(day from month) = 1, so the
  // table cannot store a mid-month date. No cast and no LIKE filter: PostgREST
  // drops a column cast and then rejects LIKE on the date column.
  async listCapacity(brand: CrmBrand, window: { start: string; end: string }) {
    const from = (table: string) => (this.db as unknown as { from: (name: string) => { select: (columns: string) => any } }).from(table);
    const queries = forecastCapacityRequests(from, brand, window) as PromiseLike<{ data: Record<string, unknown>[] | null; error: DbError }>[];
    const [inWindow, ...priors] = await Promise.all(queries.map((query) => this.rows(brand, query, mapCapacity)));
    if (inWindow.state !== 'ok') return inWindow;
    const loaded = [...inWindow.value];
    for (const prior of priors) {
      if (prior.state !== 'ok') return prior;
      loaded.push(...prior.value);
    }
    return { state: 'ok' as const, value: forecastCapacityRows(loaded, window.start, window.end) };
  }

  async upsertCapacity(brand: CrmBrand, actor: string, input: { month: string; productLine: ProductLine; capacityUnits: number; notes: string }): Promise<StoreResult<Capacity>> {
    const existing = await this.db.from('crm_capacity').select('id,brand,month,product_line,capacity_units,notes').eq('brand', brand).eq('month', input.month).eq('product_line', input.productLine).maybeSingle();
    const failed = classify(existing.error);
    if (failed) return { state: failed };
    if (existing.error) return { state: 'rejected' };
    if (existing.data && typeof existing.data.id === 'string') {
      const { data, error } = await this.db.from('crm_capacity').update({
        capacity_units: input.capacityUnits,
        notes: input.notes,
        updated_by: actor,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.data.id).eq('brand', brand).select('id,brand,month,product_line,capacity_units,notes').maybeSingle();
      return this.one(brand, data as Record<string, unknown> | null, error, mapCapacity);
    }
    const { data, error } = await this.db.from('crm_capacity').insert({
      brand,
      month: input.month,
      product_line: input.productLine,
      capacity_units: input.capacityUnits,
      notes: input.notes,
      created_by: actor,
      updated_by: actor,
    }).select('id,brand,month,product_line,capacity_units,notes').maybeSingle();
    return this.one(brand, data as Record<string, unknown> | null, error, mapCapacity);
  }

  listVisits(brand: CrmBrand) {
    return this.rows(brand, this.db.from('crm_visits').select('id,public_id,brand,account_id,rep_actor,checked_in_at,checked_out_at,latitude,longitude,outcome,notes').eq('brand', brand).order('checked_in_at', { ascending: false }).limit(500), mapVisit);
  }

  async checkIn(brand: CrmBrand, actor: string, input: { accountId: string; outcome: VisitOutcome; notes: string; latitude: number | null; longitude: number | null }): Promise<StoreResult<Visit>> {
    const account = await this.db.from('crm_accounts').select('id,brand').eq('id', input.accountId).eq('brand', brand).maybeSingle();
    if (classify(account.error)) return { state: classify(account.error) as 'absent' | 'unavailable' };
    if (!account.data || account.data.brand !== brand) return { state: 'rejected' };
    const { data, error } = await this.db.from('crm_visits').insert({
      brand,
      account_id: input.accountId,
      rep_actor: actor,
      outcome: input.outcome,
      notes: input.notes,
      latitude: input.latitude,
      longitude: input.longitude,
    }).select('id,public_id,brand,account_id,rep_actor,checked_in_at,checked_out_at,latitude,longitude,outcome,notes').maybeSingle();
    return this.one(brand, data as Record<string, unknown> | null, error, mapVisit);
  }

  async checkOut(brand: CrmBrand, visitId: string): Promise<StoreResult<Visit>> {
    const { data, error } = await this.db.from('crm_visits').update({ checked_out_at: new Date().toISOString() }).eq('id', visitId).eq('brand', brand).is('checked_out_at', null).select('id,public_id,brand,account_id,rep_actor,checked_in_at,checked_out_at,latitude,longitude,outcome,notes').maybeSingle();
    return this.one(brand, data as Record<string, unknown> | null, error, mapVisit);
  }

  listSamples(brand: CrmBrand) {
    return this.rows(brand, this.db.from('crm_samples').select('id,public_id,brand,account_id,visit_id,product_line,quantity_units,left_on,follow_up_on,notes').eq('brand', brand).order('follow_up_on', { ascending: true }).limit(500), mapSample);
  }

  async createSample(brand: CrmBrand, actor: string, input: { accountId: string; visitId: string | null; productLine: ProductLine; quantityUnits: number; leftOn: string; followUpOn: string; notes: string }): Promise<StoreResult<{ sample: Sample; task: Task }>> {
    const account = await this.db.from('crm_accounts').select('id,brand,display_name').eq('id', input.accountId).eq('brand', brand).maybeSingle();
    if (classify(account.error)) return { state: classify(account.error) as 'absent' | 'unavailable' };
    if (!account.data || account.data.brand !== brand) return { state: 'rejected' };
    const { data, error } = await this.db.from('crm_samples').insert({
      brand,
      account_id: input.accountId,
      visit_id: input.visitId,
      product_line: input.productLine,
      quantity_units: input.quantityUnits,
      left_on: input.leftOn,
      follow_up_on: input.followUpOn,
      notes: input.notes,
    }).select('id,public_id,brand,account_id,visit_id,product_line,quantity_units,left_on,follow_up_on,notes').maybeSingle();
    const saved = this.one(brand, data as Record<string, unknown> | null, error, mapSample);
    if (saved.state !== 'ok') return saved;
    const title = sampleTaskTitle(String(account.data.display_name ?? ''));
    const task = await this.createTask(brand, actor, { title, accountId: input.accountId, dueOn: input.followUpOn, status: 'open', ownerActor: actor, notes: input.notes });
    if (task.state !== 'ok') return task;
    return { state: 'ok', value: { sample: saved.value, task: task.value } };
  }

  listMedia(brand: CrmBrand) {
    return this.rows(brand, this.db.from('crm_media').select('id,public_id,brand,account_id,visit_id,kind,storage_path,content_type,byte_size,duration_seconds,created_by,created_at').eq('brand', brand).order('created_at', { ascending: false }).limit(200), mapMedia);
  }

  async createMedia(brand: CrmBrand, actor: string, input: { id: string; accountId: string; visitId: string | null; kind: MediaKind; storagePath: string; contentType: string; byteSize: number; durationSeconds: number | null }): Promise<StoreResult<Media>> {
    const account = await this.db.from('crm_accounts').select('id,brand').eq('id', input.accountId).eq('brand', brand).maybeSingle();
    if (classify(account.error)) return { state: classify(account.error) as 'absent' | 'unavailable' };
    if (!account.data || account.data.brand !== brand) return { state: 'rejected' };
    const { data, error } = await this.db.from('crm_media').insert({
      id: input.id,
      brand,
      account_id: input.accountId,
      visit_id: input.visitId,
      kind: input.kind,
      storage_path: input.storagePath,
      content_type: input.contentType,
      byte_size: input.byteSize,
      duration_seconds: input.durationSeconds,
      created_by: actor,
    }).select('id,public_id,brand,account_id,visit_id,kind,storage_path,content_type,byte_size,duration_seconds,created_by,created_at').maybeSingle();
    return this.one(brand, data as Record<string, unknown> | null, error, mapMedia);
  }

  listBatches(brand: CrmBrand) {
    return this.rows(brand, this.db.from('crm_batches').select('id,public_id,brand,product_id,batch_number,lab_name,tested_on,coa_storage_path,released,released_at,created_by,created_at').eq('brand', brand).order('tested_on', { ascending: false }).limit(200), mapBatch);
  }

  async createBatch(brand: CrmBrand, actor: string, input: { id: string; productId: string; batchNumber: string; labName: string; testedOn: string; coaStoragePath: string }): Promise<StoreResult<Batch>> {
    const { data, error } = await this.db.from('crm_batches').insert({
      id: input.id,
      brand,
      product_id: input.productId,
      batch_number: input.batchNumber,
      lab_name: input.labName,
      tested_on: input.testedOn,
      coa_storage_path: input.coaStoragePath,
      released: false,
      created_by: actor,
    }).select('id,public_id,brand,product_id,batch_number,lab_name,tested_on,coa_storage_path,released,released_at,created_by,created_at').maybeSingle();
    return this.one(brand, data as Record<string, unknown> | null, error, mapBatch);
  }

  async releaseBatch(brand: CrmBrand, id: string): Promise<StoreResult<Batch>> {
    const { data, error } = await this.db.from('crm_batches').update({ released: true, released_at: new Date().toISOString() }).eq('id', id).eq('brand', brand).eq('released', false).not('coa_storage_path', 'is', null).select('id,public_id,brand,product_id,batch_number,lab_name,tested_on,coa_storage_path,released,released_at,created_by,created_at').maybeSingle();
    return this.one(brand, data as Record<string, unknown> | null, error, mapBatch);
  }

  listReorderLinks(brand: CrmBrand, accountId: string) {
    return this.rows(brand, this.db.from('crm_reorder_links').select('id,public_id,brand,account_id,token_hash,expires_at,revoked_at,created_by,created_at').eq('brand', brand).eq('account_id', accountId).order('created_at', { ascending: false }).limit(50), mapReorderLink);
  }

  async createReorderLink(brand: CrmBrand, actor: string, accountId: string, nowMs: number): Promise<StoreResult<{ link: ReorderLink; token: string }>> {
    const account = await this.db.from('crm_accounts').select('id,brand').eq('id', accountId).eq('brand', brand).maybeSingle();
    if (classify(account.error)) return { state: classify(account.error) as 'absent' | 'unavailable' };
    if (!account.data || account.data.brand !== brand) return { state: 'rejected' };
    const minted = newReorderToken();
    const { data, error } = await this.db.from('crm_reorder_links').insert({
      brand,
      account_id: accountId,
      token_hash: minted.tokenHash,
      expires_at: defaultExpiry(nowMs),
      created_by: actor,
    }).select('id,public_id,brand,account_id,token_hash,expires_at,revoked_at,created_by,created_at').maybeSingle();
    const saved = this.one(brand, data as Record<string, unknown> | null, error, mapReorderLink);
    if (saved.state !== 'ok') return saved;
    return { state: 'ok', value: { link: saved.value, token: minted.token } };
  }

  async revokeReorderLink(brand: CrmBrand, id: string, nowMs: number): Promise<StoreResult<ReorderLink>> {
    const { data, error } = await this.db.from('crm_reorder_links').update({ revoked_at: new Date(nowMs).toISOString() }).eq('id', id).eq('brand', brand).is('revoked_at', null).select('id,public_id,brand,account_id,token_hash,expires_at,revoked_at,created_by,created_at').maybeSingle();
    return this.one(brand, data as Record<string, unknown> | null, error, mapReorderLink);
  }

  async openReorder(token: string, nowMs: number): Promise<StoreResult<{ accountName: string; distributor: string | null; assignedRep: string | null; batches: ReleasedBatch[]; status: 'ok' | 'unavailable' | 'inactive' }>> {
    const link = await this.db.from('crm_reorder_links').select('id,brand,account_id,expires_at,revoked_at').eq('token_hash', hashReorderToken(token)).maybeSingle();
    if (classify(link.error)) return { state: classify(link.error) as 'absent' | 'unavailable' };
    if (!link.data || !asBrand(link.data.brand)) return { state: 'ok', value: { accountName: '', distributor: null, assignedRep: null, batches: [], status: 'unavailable' } };
    const account = await this.db.from('crm_accounts').select('id,brand,display_name,status,distributor,assigned_rep').eq('id', link.data.account_id).eq('brand', link.data.brand).maybeSingle();
    if (classify(account.error)) return { state: classify(account.error) as 'absent' | 'unavailable' };
    const access = linkAccess(
      { expiresAt: String(link.data.expires_at ?? ''), revokedAt: link.data.revoked_at ? String(link.data.revoked_at) : null },
      account.data ? String(account.data.status ?? '') : null,
      nowMs,
    );
    if (access !== 'ok' || !account.data) return { state: 'ok', value: { accountName: '', distributor: null, assignedRep: null, batches: [], status: access === 'inactive' ? 'inactive' : 'unavailable' } };
    const batches = await this.listBatches(asBrand(link.data.brand) as CrmBrand);
    if (batches.state !== 'ok') return batches;
    return {
      state: 'ok',
      value: {
        accountName: String(account.data.display_name ?? ''),
        distributor: account.data.distributor ? String(account.data.distributor) : null,
        assignedRep: account.data.assigned_rep ? String(account.data.assigned_rep) : null,
        batches: currentReleased(batches.value.map(asReleased)),
        status: 'ok',
      },
    };
  }

  async submitReorder(token: string, nowMs: number, input: { lines: ReorderLine[]; buyerName: string; buyerEmail: string; note: string }): Promise<StoreResult<{ request: ReorderRequest; opportunity: Opportunity; confirmation: string }> | { state: 'closed' }> {
    const opened = await this.openReorder(token, nowMs);
    if (opened.state !== 'ok') return opened;
    if (opened.value.status !== 'ok') return { state: 'closed' };
    const link = await this.db.from('crm_reorder_links').select('id,brand,account_id').eq('token_hash', hashReorderToken(token)).maybeSingle();
    if (classify(link.error)) return { state: classify(link.error) as 'absent' | 'unavailable' };
    const brand = asBrand(link.data?.brand);
    if (!link.data || !brand || typeof link.data.account_id !== 'string' || typeof link.data.id !== 'string') return { state: 'closed' };
    const parsed = parseReorderLines(input.lines, opened.value.batches);
    if (!parsed.ok) return { state: 'rejected' };
    const deal = reorderDeal(parsed.lines, new Date(nowMs).toISOString().slice(0, 10));
    if (!deal) return { state: 'rejected' };
    const recorded = await this.db.rpc('crm_record_reorder', {
      p_brand: brand,
      p_account_id: link.data.account_id,
      p_link_id: link.data.id,
      p_lines: parsed.lines,
      p_buyer_name: input.buyerName,
      p_buyer_email: input.buyerEmail,
      p_note: input.note,
      p_deal_name: deal.name,
      p_product_line: deal.productLine,
      p_quantity: deal.quantityUnits,
    });
    if (recorded.error) {
      const message = String(recorded.error.message || '');
      if (message.includes('reorder link is not available') || message.includes('reorder line is not available')) return { state: 'closed' };
      return { state: classify(recorded.error) ?? 'unavailable' };
    }
    const payload = recorded.data as { request_id?: string; opportunity_id?: string } | null;
    const requestRow = await this.db.from('crm_reorder_requests').select('id,public_id,brand,account_id,link_id,lines,buyer_name,buyer_email,note,created_at,status').eq('id', payload?.request_id ?? '').eq('brand', brand).maybeSingle();
    const opportunityRow = await this.db.from('crm_opportunities').select(OPP_COLS).eq('id', payload?.opportunity_id ?? '').eq('brand', brand).maybeSingle();
    const request = this.one(brand, requestRow.data as Record<string, unknown> | null, requestRow.error, mapReorderRequest);
    const opportunity = this.one(brand, opportunityRow.data as Record<string, unknown> | null, opportunityRow.error, mapOpportunity);
    if (request.state !== 'ok' || opportunity.state !== 'ok') return { state: 'unavailable' };
    return { state: 'ok', value: { request: request.value, opportunity: opportunity.value, confirmation: confirmationFor(opened.value.distributor) } };
  }

  async lookupReleasedBatch(brand: CrmBrand, batchNumber: string): Promise<StoreResult<Batch | null>> {
    const { data, error } = await this.db.from('crm_batches').select('id,public_id,brand,product_id,batch_number,lab_name,tested_on,coa_storage_path,released,released_at,created_by,created_at').eq('brand', brand).eq('batch_number', batchNumber).eq('released', true).not('coa_storage_path', 'is', null).maybeSingle();
    if (classify(error)) return { state: classify(error) as 'absent' | 'unavailable' };
    if (error) return { state: 'unavailable' };
    if (!data) return { state: 'ok', value: null };
    const item = mapBatch(data as Record<string, unknown>);
    if (!item || item.brand !== brand || !item.released) return { state: 'unavailable' };
    return { state: 'ok', value: item };
  }

  async findDigestSend(brand: CrmBrand, summary: string): Promise<StoreResult<{ createdAt: string } | null>> {
    const { data, error } = await this.db.from('crm_activity').select('created_at,kind,summary,brand').eq('brand', brand).eq('kind', 'digest_sent').eq('summary', summary).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (classify(error)) return { state: classify(error) as 'absent' | 'unavailable' };
    if (error) return { state: 'unavailable' };
    if (!data) return { state: 'ok', value: null };
    if (data.brand !== brand || data.summary !== summary) return { state: 'unavailable' };
    return { state: 'ok', value: { createdAt: String(data.created_at ?? '') } };
  }

  async recordDigest(brand: CrmBrand, actor: string, summary: string): Promise<StoreResult<{ id: string }>> {
    const recorded = await this.db.rpc('crm_record_digest', { p_brand: brand, p_actor: actor, p_summary: summary });
    if (recorded.error) return { state: classify(recorded.error) ?? 'unavailable' };
    const id = typeof recorded.data === 'string' ? recorded.data : '';
    if (!id) return { state: 'unavailable' };
    return { state: 'ok', value: { id } };
  }

  async insertEmailLog(brand: CrmBrand, actor: string, input: { kind: 'digest' | 'reorder_link'; resendId: string; recipient: string; accountId: string | null }): Promise<StoreResult<EmailLog>> {
    const { data, error } = await this.db.from('crm_email_log').insert({
      brand,
      kind: input.kind,
      resend_id: input.resendId,
      recipient: input.recipient,
      account_id: input.accountId,
      created_by: actor,
    }).select('id,brand,kind,resend_id,recipient,account_id,sent_at,last_event,last_event_at,created_by').maybeSingle();
    return this.one(brand, data as Record<string, unknown> | null, error, mapEmailLog);
  }

  listEmailLogs(brand: CrmBrand, sinceIso: string, accountId?: string | null) {
    let query = this.db.from('crm_email_log').select('id,brand,kind,resend_id,recipient,account_id,sent_at,last_event,last_event_at,created_by').eq('brand', brand).gte('sent_at', sinceIso).order('sent_at', { ascending: false }).limit(200);
    if (accountId) query = query.eq('account_id', accountId);
    return this.rows(brand, query, mapEmailLog);
  }

  async updateEmailLog(brand: CrmBrand, id: string, lastEvent: EmailEvent, lastEventAt: string): Promise<StoreResult<EmailLog>> {
    const { data, error } = await this.db.from('crm_email_log').update({ last_event: lastEvent, last_event_at: lastEventAt }).eq('id', id).eq('brand', brand).select('id,brand,kind,resend_id,recipient,account_id,sent_at,last_event,last_event_at,created_by').maybeSingle();
    return this.one(brand, data as Record<string, unknown> | null, error, mapEmailLog);
  }

  listTerritories(brand: CrmBrand) {
    return this.rows(brand, this.db.from('crm_territories').select('id,brand,region,rep_actor').eq('brand', brand), (row) => {
      const itemBrand = asBrand(row.brand);
      if (!itemBrand || typeof row.id !== 'string') return null;
      return { id: row.id, brand: itemBrand, region: String(row.region ?? ''), repActor: String(row.rep_actor ?? '') };
    });
  }

  async assignTerritory(brand: CrmBrand, region: string, repActor: string) {
    const existing = await this.db.from('crm_territories').select('id').eq('brand', brand).eq('region', region).maybeSingle();
    if (classify(existing.error)) return { state: classify(existing.error) as 'absent' | 'unavailable' };
    if (existing.data?.id) {
      const { data, error } = await this.db.from('crm_territories').update({ rep_actor: repActor }).eq('id', existing.data.id).eq('brand', brand).select('id,brand,region,rep_actor').maybeSingle();
      if (classify(error) || error || !data) return { state: 'unavailable' as const };
      return { state: 'ok' as const, value: { id: String(data.id), brand, region: String(data.region), repActor: String(data.rep_actor) } };
    }
    const { data, error } = await this.db.from('crm_territories').insert({ brand, region, rep_actor: repActor }).select('id,brand,region,rep_actor').maybeSingle();
    if (classify(error) || error || !data) return { state: 'unavailable' as const };
    return { state: 'ok' as const, value: { id: String(data.id), brand, region: String(data.region), repActor: String(data.rep_actor) } };
  }

  async clearTerritory(brand: CrmBrand, region: string) {
    const { error } = await this.db.from('crm_territories').delete().eq('brand', brand).eq('region', region);
    if (classify(error)) return { state: classify(error) as 'absent' | 'unavailable' };
    if (error) return { state: 'unavailable' as const };
    return { state: 'ok' as const, value: { cleared: true as const } };
  }

  listMarketRetailers(brand: CrmBrand) {
    return this.rows(brand, this.db.from('crm_market_retailers').select('id,brand,license_number,name,county,license_type,uploaded_at').eq('brand', brand).order('uploaded_at', { ascending: false }).limit(5000), (row) => {
      const itemBrand = asBrand(row.brand);
      if (!itemBrand || typeof row.id !== 'string') return null;
      return { id: row.id, brand: itemBrand, licenseNumber: String(row.license_number ?? ''), name: String(row.name ?? ''), county: String(row.county ?? ''), licenseType: String(row.license_type ?? ''), uploadedAt: String(row.uploaded_at ?? '') };
    });
  }

  async insertMarketRetailers(brand: CrmBrand, rows: { licenseNumber: string; name: string; county: string; licenseType: string }[], uploadedAt: string) {
    if (!rows.length) return { state: 'ok' as const, value: { count: 0 } };
    const { error } = await this.db.from('crm_market_retailers').insert(rows.map((row) => ({
      brand, license_number: row.licenseNumber, name: row.name, county: row.county, license_type: row.licenseType, uploaded_at: uploadedAt,
    })));
    if (classify(error)) return { state: classify(error) as 'absent' | 'unavailable' };
    if (error) return { state: 'rejected' as const };
    return { state: 'ok' as const, value: { count: rows.length } };
  }

  listDismissals(brand: CrmBrand) {
    return this.rows(brand, this.db.from('crm_action_dismissals').select('id,brand,rep_actor,action_key,until').eq('brand', brand), (row) => {
      const itemBrand = asBrand(row.brand);
      if (!itemBrand || typeof row.id !== 'string') return null;
      return { id: row.id, brand: itemBrand, repActor: String(row.rep_actor ?? ''), actionKey: String(row.action_key ?? ''), until: String(row.until ?? '').slice(0, 10) };
    });
  }

  async upsertDismissal(brand: CrmBrand, repActor: string, actionKey: string, until: string) {
    const existing = await this.db.from('crm_action_dismissals').select('id').eq('brand', brand).eq('rep_actor', repActor).eq('action_key', actionKey).maybeSingle();
    if (classify(existing.error)) return { state: classify(existing.error) as 'absent' | 'unavailable' };
    if (existing.data?.id) {
      const { data, error } = await this.db.from('crm_action_dismissals').update({ until }).eq('id', existing.data.id).eq('brand', brand).select('id,brand,rep_actor,action_key,until').maybeSingle();
      if (error || !data) return { state: 'unavailable' as const };
      return { state: 'ok' as const, value: { id: String(data.id), brand, repActor: String(data.rep_actor), actionKey: String(data.action_key), until: String(data.until).slice(0, 10) } };
    }
    const { data, error } = await this.db.from('crm_action_dismissals').insert({ brand, rep_actor: repActor, action_key: actionKey, until }).select('id,brand,rep_actor,action_key,until').maybeSingle();
    if (error || !data) return { state: 'unavailable' as const };
    return { state: 'ok' as const, value: { id: String(data.id), brand, repActor: String(data.rep_actor), actionKey: String(data.action_key), until: String(data.until).slice(0, 10) } };
  }

  async receiveBondInquiry(lead: IntakeLead, receivedAt: string) {
    const { data, error } = await this.db.rpc('crm_receive_bond_inquiry', {
      p_inquiry_id: lead.inquiryId,
      p_submitted_at: lead.submittedAt,
      p_received_at: receivedAt,
      p_business_name: lead.businessName,
      p_contact_name: lead.contactName,
      p_contact_email: lead.contactEmail,
      p_contact_phone: lead.contactPhone,
      p_license_number: lead.licenseNumber,
      p_street: lead.street,
      p_city: lead.city,
      p_postal_code: lead.postalCode,
      p_county: lead.county,
      p_message: lead.message,
      p_consent_version: lead.consentVersion,
      p_test: intakeTestMarker(lead.businessName, lead.licenseNumber),
    });
    if (classify(error)) return { state: classify(error) as 'absent' | 'unavailable' };
    const payload = data as { ok?: boolean; duplicate?: boolean } | null;
    if (error || !payload || payload.ok !== true) return { state: 'unavailable' as const };
    return { state: 'ok' as const, value: { duplicate: payload.duplicate === true } };
  }

  async deleteBondInquiry(inquiryId: string) {
    const { data, error } = await this.db.rpc('crm_delete_bond_inquiry', { p_inquiry_id: inquiryId });
    if (classify(error)) return { state: classify(error) as 'absent' | 'unavailable' };
    const payload = data as { ok?: boolean; deleted?: boolean } | null;
    if (error || !payload || payload.ok !== true) return { state: 'unavailable' as const };
    return { state: 'ok' as const, value: { deleted: payload.deleted === true } };
  }

  async purgeBondInquiries(nowIso: string) {
    const { data, error } = await this.db.rpc('crm_purge_bond_inquiries', { p_now: nowIso });
    if (classify(error)) return { state: classify(error) as 'absent' | 'unavailable' };
    const payload = data as { ok?: boolean; purged?: number } | null;
    if (error || !payload || payload.ok !== true) return { state: 'unavailable' as const };
    return { state: 'ok' as const, value: { purged: Number(payload.purged) || 0 } };
  }

  async receiveAgentRecords(input: { requestId: string; receivedAt: string; ops: AgentOp[] }) {
    const { data, error } = await this.db.rpc('crm_receive_agent_records', {
      p_request_id: input.requestId,
      p_received_at: input.receivedAt,
      p_rows: input.ops.map((op) => {
        if (op.op === 'account') return { op: 'account', index: op.index, display_name: op.displayName, status: op.status, account_type: op.accountType, lead_source: op.leadSource, assigned_rep: op.assignedRep, city: op.city, county: op.county, license_number: op.licenseNumber, license_expiry: op.licenseExpiry, street: op.street, postal_code: op.postalCode, ocm_status: op.ocmStatus, notes: op.notes };
        if (op.op === 'contact') return { op: 'contact', index: op.index, name: op.name, email: op.email, phone: op.phone, title: op.title, account_license: op.accountLicense, account_name: op.accountName };
        return { op: 'note', index: op.index, body: op.body, account_license: op.accountLicense, account_name: op.accountName };
      }),
    });
    if (classify(error)) return { state: classify(error) as 'absent' | 'unavailable' };
    const payload = data as { ok?: boolean; code?: string; retry_after?: number; created?: { accounts: number; contacts: number; notes: number }; skipped?: { index: number; reason: string }[]; failed?: AgentRowFailure[] } | null;
    if (error || !payload) return { state: 'unavailable' as const };
    if (payload.code === 'replay') return { state: 'ok' as const, value: { code: 'replay' as const } };
    if (payload.code === 'rate') return { state: 'ok' as const, value: { code: 'rate' as const, retryAfter: Number(payload.retry_after) || 1 } };
    if (payload.ok !== true || !payload.created) return { state: 'unavailable' as const };
    return { state: 'ok' as const, value: { code: 'ok' as const, created: payload.created, skipped: payload.skipped || [], failed: payload.failed || [] } };
  }

  private one<T extends { brand: CrmBrand }>(
    brand: CrmBrand,
    data: Record<string, unknown> | null,
    error: DbError,
    map: (row: Record<string, unknown>) => T | null,
  ): StoreResult<T> {
    const failed = classify(error);
    if (failed) return { state: failed };
    if (error) return { state: 'rejected' };
    if (!data) return { state: 'missing' };
    const item = map(data);
    if (!item || item.brand !== brand) return { state: 'unavailable' };
    return { state: 'ok', value: item };
  }
}
