import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@/lib/supabase';
import {
  isMissingSchema,
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
import { DISTRIBUTORS, ORDER_SOURCES, ORDER_STATUSES, PAYOUT_STATUSES, RETAILER_PAYMENT_STATUSES, type Distributor, type DistributorOrderDraft, type OrderSource, type OrderStatus, type PayoutStatus, type RetailerPaymentStatus } from './distributor';
import { sampleTaskTitle, type MediaKind, type VisitOutcome } from './field';

export type StoreResult<T> =
  | { state: 'ok'; value: T }
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
  notes: string;
  licenseRef: string | null;
  facilityRef: string | null;
  licenseJurisdiction: string | null;
  licenseExpiry: string | null;
  assignedRep: string | null;
  accountType: AccountType | null;
  leadSource: LeadSource | null;
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
};

export type Note = {
  id: string;
  publicId: string;
  brand: CrmBrand;
  accountId: string;
  body: string;
  actor: string;
  createdAt: string;
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
  return isMissingSchema(error) ? 'absent' : 'unavailable';
}

function asBrand(value: unknown): CrmBrand | null {
  return value === 'cedargrowth' || value === 'bond' ? value : null;
}

export interface CrmStore {
  counts(brand: CrmBrand): Promise<StoreResult<Counts>>;
  listAccounts(brand: CrmBrand, filter: { q: string | null; status: AccountStatus | null }): Promise<StoreResult<Account[]>>;
  createAccount(brand: CrmBrand, actor: string, input: { displayName: string; status: AccountStatus; city: string | null; notes: string; licenseRef?: string | null; facilityRef?: string | null; licenseJurisdiction?: string | null; licenseExpiry?: string | null; assignedRep?: string | null; accountType?: AccountType | null; leadSource?: LeadSource | null; distributor?: Distributor | null; distributorAccountRef?: string | null }): Promise<StoreResult<Account>>;
  listNotes(brand: CrmBrand, accountId: string | null): Promise<StoreResult<Note[]>>;
  createNote(brand: CrmBrand, actor: string, input: { accountId: string; body: string }): Promise<StoreResult<Note>>;
  updateAccount(brand: CrmBrand, actor: string, id: string, patch: { displayName?: string; status?: AccountStatus; city?: string | null; notes?: string; licenseRef?: string | null; facilityRef?: string | null; licenseJurisdiction?: string | null; licenseExpiry?: string | null; assignedRep?: string | null; accountType?: AccountType | null; leadSource?: LeadSource | null; distributor?: Distributor | null; distributorAccountRef?: string | null }): Promise<StoreResult<Account>>;
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
  listCapacity(brand: CrmBrand): Promise<StoreResult<Capacity[]>>;
  upsertCapacity(brand: CrmBrand, actor: string, input: { month: string; productLine: ProductLine; capacityUnits: number; notes: string }): Promise<StoreResult<Capacity>>;
  listVisits(brand: CrmBrand): Promise<StoreResult<Visit[]>>;
  checkIn(brand: CrmBrand, actor: string, input: { accountId: string; outcome: VisitOutcome; notes: string; latitude: number | null; longitude: number | null }): Promise<StoreResult<Visit>>;
  checkOut(brand: CrmBrand, visitId: string): Promise<StoreResult<Visit>>;
  listSamples(brand: CrmBrand): Promise<StoreResult<Sample[]>>;
  createSample(brand: CrmBrand, actor: string, input: { accountId: string; visitId: string | null; productLine: ProductLine; quantityUnits: number; leftOn: string; followUpOn: string; notes: string }): Promise<StoreResult<{ sample: Sample; task: Task }>>;
  listMedia(brand: CrmBrand): Promise<StoreResult<Media[]>>;
  createMedia(brand: CrmBrand, actor: string, input: { id: string; accountId: string; visitId: string | null; kind: MediaKind; storagePath: string; contentType: string; byteSize: number; durationSeconds: number | null }): Promise<StoreResult<Media>>;
}

const ACCOUNT_COLS = 'id,public_id,brand,display_name,status,city,notes,license_ref,facility_ref,license_jurisdiction,license_expiry,assigned_rep,account_type,lead_source,distributor,distributor_account_ref,created_at,updated_at,created_by,updated_by';
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
    notes: String(row.notes ?? ''),
    licenseRef: row.license_ref ? String(row.license_ref) : null,
    facilityRef: row.facility_ref ? String(row.facility_ref) : null,
    licenseJurisdiction: row.license_jurisdiction ? String(row.license_jurisdiction) : null,
    licenseExpiry: row.license_expiry ? String(row.license_expiry) : null,
    assignedRep: row.assigned_rep ? String(row.assigned_rep) : null,
    accountType: (ACCOUNT_TYPES as readonly string[]).includes(String(row.account_type)) ? (row.account_type as AccountType) : null,
    leadSource: (LEAD_SOURCES as readonly string[]).includes(String(row.lead_source)) ? (row.lead_source as LeadSource) : null,
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

  async createAccount(brand: CrmBrand, actor: string, input: { displayName: string; status: AccountStatus; city: string | null; notes: string; licenseRef?: string | null; facilityRef?: string | null; licenseJurisdiction?: string | null; licenseExpiry?: string | null; assignedRep?: string | null; accountType?: AccountType | null; leadSource?: LeadSource | null; distributor?: Distributor | null; distributorAccountRef?: string | null }): Promise<StoreResult<Account>> {
    const { data, error } = await this.db.from('crm_accounts').insert({
      brand,
      display_name: input.displayName,
      status: input.status,
      city: input.city,
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

  async updateAccount(brand: CrmBrand, actor: string, id: string, patch: { displayName?: string; status?: AccountStatus; city?: string | null; notes?: string; licenseRef?: string | null; facilityRef?: string | null; licenseJurisdiction?: string | null; licenseExpiry?: string | null; assignedRep?: string | null; accountType?: AccountType | null; leadSource?: LeadSource | null; distributor?: Distributor | null; distributorAccountRef?: string | null }) {
    const row: Record<string, unknown> = { updated_by: actor };
    if (patch.displayName !== undefined) row.display_name = patch.displayName;
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.city !== undefined) row.city = patch.city;
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
    return this.one(brand, data as Record<string, unknown> | null, error, mapOpportunity);
  }

  async updateOpportunity(brand: CrmBrand, actor: string, id: string, patch: OpportunityWrite) {
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
    return this.one(brand, data as Record<string, unknown> | null, error, mapOpportunity);
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
    return { state: 'ok', value: { order: saved.value, stage: 'won' } };
  }

  listStageEvents(brand: CrmBrand) {
    return this.rows(
      brand,
      this.db.from('crm_stage_events').select('id,brand,opportunity_id,from_stage,to_stage,at').eq('brand', brand).order('at', { ascending: true }).limit(5000),
      mapStageEvent,
    );
  }

  listCapacity(brand: CrmBrand) {
    return this.rows(
      brand,
      this.db.from('crm_capacity').select('id,brand,month,product_line,capacity_units,notes').eq('brand', brand).order('month', { ascending: true }),
      mapCapacity,
    );
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
