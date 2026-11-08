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
  type StoredInsight,
  type TaskStatus,
  type TaskWrite,
} from './engine';

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
  completedAt: string | null;
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
  createAccount(brand: CrmBrand, actor: string, input: { displayName: string; status: AccountStatus; city: string | null; notes: string }): Promise<StoreResult<Account>>;
  updateAccount(brand: CrmBrand, actor: string, id: string, patch: { displayName?: string; status?: AccountStatus; city?: string | null; notes?: string }): Promise<StoreResult<Account>>;
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
}

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
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
    createdBy: String(row.created_by ?? ''),
    updatedBy: String(row.updated_by ?? ''),
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
    updatedAt: String(row.updated_at ?? ''),
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
    let query = this.db.from('crm_accounts').select('*').eq('brand', brand).order('updated_at', { ascending: false }).limit(100);
    if (filter.status) query = query.eq('status', filter.status);
    if (filter.q) query = query.ilike('display_name', `%${filter.q}%`);
    return this.rows(brand, query, mapAccount);
  }

  async createAccount(brand: CrmBrand, actor: string, input: { displayName: string; status: AccountStatus; city: string | null; notes: string }): Promise<StoreResult<Account>> {
    const { data, error } = await this.db.from('crm_accounts').insert({
      brand,
      display_name: input.displayName,
      status: input.status,
      city: input.city,
      notes: input.notes,
      created_by: actor,
      updated_by: actor,
    }).select('*').maybeSingle();
    const failed = classify(error);
    if (failed) return { state: failed };
    if (error) return { state: 'rejected' as const };
    const account = data ? mapAccount(data as Record<string, unknown>) : null;
    if (!account || account.brand !== brand) return { state: 'unavailable' };
    return { state: 'ok', value: account };
  }

  async updateAccount(brand: CrmBrand, actor: string, id: string, patch: { displayName?: string; status?: AccountStatus; city?: string | null; notes?: string }) {
    const row: Record<string, unknown> = { updated_by: actor };
    if (patch.displayName !== undefined) row.display_name = patch.displayName;
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.city !== undefined) row.city = patch.city;
    if (patch.notes !== undefined) row.notes = patch.notes;
    const { data, error } = await this.db.from('crm_accounts').update(row).eq('id', id).eq('brand', brand).select('*').maybeSingle();
    return this.one(brand, data as Record<string, unknown> | null, error, mapAccount);
  }

  listContacts(brand: CrmBrand, accountId: string | null) {
    let query = this.db.from('crm_contacts').select('*').eq('brand', brand).order('updated_at', { ascending: false }).limit(100);
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
      created_by: actor,
      updated_by: actor,
    }).select('*').maybeSingle();
    return this.one(brand, data as Record<string, unknown> | null, error, mapContact);
  }

  async updateContact(brand: CrmBrand, actor: string, id: string, patch: ContactWrite) {
    const row: Record<string, unknown> = { updated_by: actor };
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.email !== undefined) row.email = patch.email;
    if (patch.phone !== undefined) row.phone = patch.phone;
    if (patch.notes !== undefined) row.notes = patch.notes;
    const { data, error } = await this.db.from('crm_contacts').update(row).eq('id', id).eq('brand', brand).select('*').maybeSingle();
    return this.one(brand, data as Record<string, unknown> | null, error, mapContact);
  }

  listOpportunities(brand: CrmBrand) {
    return this.rows(
      brand,
      this.db.from('crm_opportunities').select('*').eq('brand', brand).order('updated_at', { ascending: false }).limit(100),
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
      created_by: actor,
      updated_by: actor,
    }).select('*').maybeSingle();
    return this.one(brand, data as Record<string, unknown> | null, error, mapOpportunity);
  }

  async updateOpportunity(brand: CrmBrand, actor: string, id: string, patch: OpportunityWrite) {
    const row: Record<string, unknown> = { updated_by: actor };
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.stage !== undefined) row.stage = patch.stage;
    if (patch.forecastCents !== undefined) row.forecast_cents = patch.forecastCents;
    if (patch.expectedCloseOn !== undefined) row.expected_close_on = patch.expectedCloseOn;
    if (patch.notes !== undefined) row.notes = patch.notes;
    const { data, error } = await this.db.from('crm_opportunities').update(row).eq('id', id).eq('brand', brand).select('*').maybeSingle();
    return this.one(brand, data as Record<string, unknown> | null, error, mapOpportunity);
  }

  listTasks(brand: CrmBrand, status: TaskStatus | null) {
    let query = this.db.from('crm_tasks').select('*').eq('brand', brand).order('due_on', { ascending: true }).limit(100);
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
      created_by: actor,
      updated_by: actor,
    }).select('*').maybeSingle();
    return this.one(brand, data as Record<string, unknown> | null, error, mapTask);
  }

  async updateTask(brand: CrmBrand, actor: string, id: string, patch: TaskWrite) {
    const row: Record<string, unknown> = { updated_by: actor };
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.dueOn !== undefined) row.due_on = patch.dueOn;
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.notes !== undefined) row.notes = patch.notes;
    if (patch.accountId !== undefined) row.account_id = patch.accountId;
    if (patch.opportunityId !== undefined) row.opportunity_id = patch.opportunityId;
    const { data, error } = await this.db.from('crm_tasks').update(row).eq('id', id).eq('brand', brand).select('*').maybeSingle();
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
      this.rows(brand, this.db.from('crm_contacts').select('*').eq('brand', brand).ilike('name', `%${q}%`).limit(25), mapContact),
      this.rows(brand, this.db.from('crm_opportunities').select('*').eq('brand', brand).ilike('name', `%${q}%`).limit(25), mapOpportunity),
    ]);
    if (accounts.state !== 'ok') return accounts;
    if (contacts.state !== 'ok') return contacts;
    if (opportunities.state !== 'ok') return opportunities;
    return { state: 'ok', value: { accounts: accounts.value, contacts: contacts.value, opportunities: opportunities.value } };
  }

  async exportBrand(brand: CrmBrand): Promise<StoreResult<{ accounts: Account[]; contacts: Contact[]; opportunities: Opportunity[]; tasks: Task[]; activity: Activity[]; truncated: boolean }>> {
    const [accounts, contacts, opportunities, tasks, activity] = await Promise.all([
      this.rows(brand, this.db.from('crm_accounts').select('*').eq('brand', brand).limit(2001), mapAccount),
      this.rows(brand, this.db.from('crm_contacts').select('*').eq('brand', brand).limit(2001), mapContact),
      this.rows(brand, this.db.from('crm_opportunities').select('*').eq('brand', brand).limit(2001), mapOpportunity),
      this.rows(brand, this.db.from('crm_tasks').select('*').eq('brand', brand).limit(2001), mapTask),
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
