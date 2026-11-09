// Pure dashboard aggregation for the wholesale CRM.
// Reads CRM rows only. Amounts are forecasts, never invoiced or paid revenue.
// A source that is not connected is reported as not connected, never as zero.
// Account type and lead source come from the CRM account. Unset values group as Not set.

import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  LEAD_SOURCE_LABELS,
  LEAD_SOURCES,
  OPEN_STAGES,
  OPPORTUNITY_STAGES,
  type AccountType,
  type CrmBrand,
  type LeadSource,
  type OpportunityStage,
} from './engine';

export const STAGE_LABELS: Record<OpportunityStage, string> = {
  lead: 'Lead',
  qualification: 'Qualified',
  licensed_buyer_review: 'License review',
  proposal: 'Proposal',
  won: 'Won',
  lost: 'Lost',
};

export const DEAL_STATUSES = ['open', 'won', 'lost'] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];
export const STATUS_LABELS: Record<DealStatus, string> = { open: 'Open', won: 'Won', lost: 'Lost' };

export const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const UNASSIGNED_REP = 'Unassigned';
export const NO_REGION = 'No region';
export const NOT_SET = 'not_set';

export type DashboardAccountRow = {
  brand: CrmBrand;
  id: string;
  status: string;
  city: string | null;
  assignedRep: string | null;
  accountType?: AccountType | null;
  leadSource?: LeadSource | null;
  createdAt?: string;
};
export type DashboardNoteRow = { brand: CrmBrand; accountId: string; createdAt: string };
export type DashboardOpportunityRow = {
  brand: CrmBrand;
  accountId: string;
  stage: OpportunityStage;
  forecastCents: number | null;
  expectedCloseOn: string | null;
};
export type DashboardTaskRow = { brand: CrmBrand; status: string; dueOn: string | null };
export type DashboardActivityRow = { brand: CrmBrand; createdAt: string };

export type DashboardFilter = {
  year: number | null;
  month: number | null;
  rep: string | null;
  region: string | null;
  accountType: AccountType | null;
  leadSource: LeadSource | null;
  stage: OpportunityStage | null;
  status: DealStatus | null;
};

export type Bucket = { key: string; label: string; count: number; cents: number | null };
export type RepRow = Bucket & { won: number; lost: number; winRate: number | null };

export type Dashboard = {
  filter: DashboardFilter;
  options: { years: number[]; reps: string[]; regions: string[] };
  kpis: {
    deals: number;
    totalValueCents: number | null;
    winRate: number | null;
    avgResponseHours: number | null;
    responseSample: number;
    avgDealCents: number | null;
    accounts: number;
    activeAccounts: number;
    openTasks: number;
    overdueTasks: number;
    activity30d: number;
  };
  byStage: Bucket[];
  byStatus: Bucket[];
  byRep: RepRow[];
  byRegion: Bucket[];
  byMonth: Bucket[];
  monthsLabel: string;
  overdueOpen: number;
  accountsByStatus: Bucket[];
  byAccountType: Bucket[];
  byLeadSource: RepRow[];
};

function clean(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= 160 ? trimmed : null;
}

export function parseDashboardFilter(params: URLSearchParams): DashboardFilter {
  const year = Number(params.get('year'));
  const month = Number(params.get('month'));
  const stage = params.get('stage');
  const status = params.get('status');
  return {
    year: Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null,
    month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : null,
    rep: clean(params.get('rep')),
    region: clean(params.get('region')),
    accountType: (ACCOUNT_TYPES as readonly string[]).includes(params.get('accountType') ?? '') ? (params.get('accountType') as AccountType) : null,
    leadSource: (LEAD_SOURCES as readonly string[]).includes(params.get('leadSource') ?? '') ? (params.get('leadSource') as LeadSource) : null,
    stage: (OPPORTUNITY_STAGES as readonly string[]).includes(stage ?? '') ? (stage as OpportunityStage) : null,
    status: (DEAL_STATUSES as readonly string[]).includes(status ?? '') ? (status as DealStatus) : null,
  };
}

export function dealStatus(stage: OpportunityStage): DealStatus {
  if (stage === 'won') return 'won';
  if (stage === 'lost') return 'lost';
  return 'open';
}

function sumCents(values: (number | null)[]): number | null {
  const known = values.filter((value): value is number => typeof value === 'number');
  return known.length ? known.reduce((total, value) => total + value, 0) : null;
}

function addMonths(key: string, count: number): string {
  const [year, month] = key.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1 + count, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string, withYear: boolean): string {
  const [year, month] = key.split('-').map(Number);
  return withYear ? `${MONTH_LABELS[month - 1]} ${String(year).slice(2)}` : MONTH_LABELS[month - 1];
}

export function buildDashboard(input: {
  brand: CrmBrand;
  today: string;
  filter: DashboardFilter;
  accounts: readonly DashboardAccountRow[];
  opportunities: readonly DashboardOpportunityRow[];
  tasks: readonly DashboardTaskRow[];
  activity: readonly DashboardActivityRow[];
  notes?: readonly DashboardNoteRow[];
}): Dashboard {
  const { brand, today, filter } = input;
  const accounts = input.accounts.filter((row) => row.brand === brand);
  const repOf = (row: DashboardAccountRow | undefined) => row?.assignedRep?.trim() || UNASSIGNED_REP;
  const regionOf = (row: DashboardAccountRow | undefined) => row?.city?.trim() || NO_REGION;

  const allOpps = input.opportunities.filter((row) => row.brand === brand);
  const thisYear = Number(today.slice(0, 4));
  const years = Array.from(new Set([
    thisYear,
    ...allOpps.map((row) => Number(row.expectedCloseOn?.slice(0, 4))).filter((year) => Number.isInteger(year) && year > 0),
  ])).sort((a, b) => b - a);
  const reps = Array.from(new Set(accounts.map((row) => repOf(row)))).sort();
  const regions = Array.from(new Set(accounts.map((row) => regionOf(row)))).sort();

  const scopedAccounts = accounts.filter((row) =>
    (!filter.rep || repOf(row) === filter.rep)
    && (!filter.region || regionOf(row) === filter.region)
    && (!filter.accountType || row.accountType === filter.accountType)
    && (!filter.leadSource || row.leadSource === filter.leadSource));
  const accountById = new Map(scopedAccounts.map((row) => [row.id, row]));

  // Everything except the date filter, so the timeline can still show the whole year.
  const undated = allOpps.filter((row) =>
    accountById.has(row.accountId)
    && (!filter.stage || row.stage === filter.stage)
    && (!filter.status || dealStatus(row.stage) === filter.status));
  const opps = undated.filter((row) => {
    if (!filter.year && !filter.month) return true;
    if (!row.expectedCloseOn) return false;
    if (filter.year && Number(row.expectedCloseOn.slice(0, 4)) !== filter.year) return false;
    if (filter.month && Number(row.expectedCloseOn.slice(5, 7)) !== filter.month) return false;
    return true;
  });

  const open = opps.filter((row) => OPEN_STAGES.includes(row.stage));
  const won = opps.filter((row) => row.stage === 'won');
  const lost = opps.filter((row) => row.stage === 'lost');
  const forecasts = opps.map((row) => row.forecastCents).filter((value): value is number => typeof value === 'number');

  const byStage: Bucket[] = OPPORTUNITY_STAGES.map((stage) => {
    const rows = opps.filter((row) => row.stage === stage);
    return { key: stage, label: STAGE_LABELS[stage], count: rows.length, cents: sumCents(rows.map((row) => row.forecastCents)) };
  });

  const byStatus: Bucket[] = DEAL_STATUSES.map((status) => {
    const rows = opps.filter((row) => dealStatus(row.stage) === status);
    return { key: status, label: STATUS_LABELS[status], count: rows.length, cents: sumCents(rows.map((row) => row.forecastCents)) };
  });

  const byRep: RepRow[] = (filter.rep ? [filter.rep] : reps).map((rep) => {
    const rows = opps.filter((row) => repOf(accountById.get(row.accountId)) === rep);
    const repWon = rows.filter((row) => row.stage === 'won').length;
    const repLost = rows.filter((row) => row.stage === 'lost').length;
    return {
      key: rep,
      label: rep,
      count: rows.length,
      cents: sumCents(rows.map((row) => row.forecastCents)),
      won: repWon,
      lost: repLost,
      winRate: repWon + repLost ? repWon / (repWon + repLost) : null,
    };
  }).filter((row) => row.count > 0);

  const typeOf = (row: DashboardOpportunityRow) => accountById.get(row.accountId)?.accountType ?? NOT_SET;
  const sourceOf = (row: DashboardOpportunityRow) => accountById.get(row.accountId)?.leadSource ?? NOT_SET;
  const byAccountType: Bucket[] = [...ACCOUNT_TYPES, NOT_SET].map((type) => {
    const rows = opps.filter((row) => typeOf(row) === type);
    const label = type === NOT_SET ? 'Not set' : ACCOUNT_TYPE_LABELS[type as AccountType];
    return { key: type, label, count: rows.length, cents: sumCents(rows.map((row) => row.forecastCents)) };
  }).filter((row) => row.count > 0);
  const byLeadSource: RepRow[] = [...LEAD_SOURCES, NOT_SET].map((source) => {
    const rows = opps.filter((row) => sourceOf(row) === source);
    const srcWon = rows.filter((row) => row.stage === 'won').length;
    const srcLost = rows.filter((row) => row.stage === 'lost').length;
    return {
      key: source,
      label: source === NOT_SET ? 'Not set' : LEAD_SOURCE_LABELS[source as LeadSource],
      count: rows.length,
      cents: sumCents(rows.map((row) => row.forecastCents)),
      won: srcWon,
      lost: srcLost,
      winRate: srcWon + srcLost ? srcWon / (srcWon + srcLost) : null,
    };
  }).filter((row) => row.count > 0);

  // Response time: hours from an account being created to the first note logged on it.
  const firstNote = new Map<string, number>();
  for (const note of input.notes ?? []) {
    if (note.brand !== brand || !accountById.has(note.accountId)) continue;
    const at = Date.parse(note.createdAt);
    if (Number.isNaN(at)) continue;
    const prior = firstNote.get(note.accountId);
    if (prior === undefined || at < prior) firstNote.set(note.accountId, at);
  }
  const responseHours: number[] = [];
  for (const [accountId, at] of firstNote) {
    const created = Date.parse(accountById.get(accountId)?.createdAt ?? '');
    if (!Number.isNaN(created) && at >= created) responseHours.push((at - created) / 3600000);
  }

  const byRegion: Bucket[] = (filter.region ? [filter.region] : regions).map((region) => {
    const rows = opps.filter((row) => regionOf(accountById.get(row.accountId)) === region);
    return { key: region, label: region, count: rows.length, cents: sumCents(rows.map((row) => row.forecastCents)) };
  }).filter((row) => row.count > 0);

  // Timeline: the twelve months of the chosen year, or the next twelve months from today.
  const firstMonth = filter.year ? `${filter.year}-01` : today.slice(0, 7);
  const byMonth: Bucket[] = Array.from({ length: 12 }, (_, index) => {
    const key = addMonths(firstMonth, index);
    const rows = undated.filter((row) => row.expectedCloseOn && row.expectedCloseOn.slice(0, 7) === key);
    return { key, label: monthLabel(key, !filter.year), count: rows.length, cents: sumCents(rows.map((row) => row.forecastCents)) };
  });

  const statuses = ['prospect', 'active', 'paused', 'closed'];
  const accountsByStatus: Bucket[] = statuses.map((status) => ({
    key: status,
    label: status.charAt(0).toUpperCase() + status.slice(1),
    count: scopedAccounts.filter((row) => row.status === status).length,
    cents: null,
  }));

  const tasks = input.tasks.filter((row) => row.brand === brand);
  const openTasks = tasks.filter((row) => row.status === 'open');
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 30 * 86400000).toISOString();

  return {
    filter,
    options: { years, reps, regions },
    kpis: {
      deals: opps.length,
      totalValueCents: sumCents(opps.map((row) => row.forecastCents)),
      winRate: won.length + lost.length ? won.length / (won.length + lost.length) : null,
      avgResponseHours: responseHours.length ? Math.round((responseHours.reduce((a, b) => a + b, 0) / responseHours.length) * 10) / 10 : null,
      responseSample: responseHours.length,
      avgDealCents: forecasts.length ? Math.round(forecasts.reduce((a, b) => a + b, 0) / forecasts.length) : null,
      accounts: scopedAccounts.length,
      activeAccounts: scopedAccounts.filter((row) => row.status === 'active').length,
      openTasks: openTasks.length,
      overdueTasks: openTasks.filter((row) => row.dueOn && row.dueOn < today).length,
      activity30d: input.activity.filter((row) => row.brand === brand && row.createdAt >= since).length,
    },
    byStage,
    byStatus,
    byRep,
    byRegion,
    byMonth,
    monthsLabel: filter.year ? String(filter.year) : 'next 12 months',
    overdueOpen: open.filter((row) => row.expectedCloseOn && row.expectedCloseOn < today).length,
    accountsByStatus,
    byAccountType,
    byLeadSource,
  };
}
