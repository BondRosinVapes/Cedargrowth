// Production forecast from open and won deals. Missing capacity is not zero.
// Win rates come from closed deals that passed through a stage, or a default
// until five closed deals have done so. Monthly cells are the default.
// Weekly cells group the same weighted demand by ISO week. Capacity is the
// only figure that is pro-rated from the monthly crm_capacity row.
// This module does not write storage.

import { OPEN_STAGES, PRODUCT_LINES, type OpportunityStage, type ProductLine } from './engine';

export function parseCapacityWrite(body: unknown): { ok: true; value: { month: string; productLine: ProductLine; capacityUnits: number; notes: string } } | { ok: false; reason: string } {
  if (!body || typeof body !== 'object') return { ok: false, reason: 'Capacity could not be read.' };
  const record = body as Record<string, unknown>;
  const rawMonth = typeof record.month === 'string' ? record.month : '';
  const month = /^\d{4}-\d{2}$/.test(rawMonth) ? `${rawMonth}-01` : monthStart(rawMonth);
  if (!month) return { ok: false, reason: 'Month must be the first day of a month.' };
  if (typeof record.productLine !== 'string' || !(PRODUCT_LINES as readonly string[]).includes(record.productLine)) {
    return { ok: false, reason: 'Product line is not recognized.' };
  }
  if (typeof record.capacityUnits !== 'number' || !Number.isInteger(record.capacityUnits) || record.capacityUnits < 0 || record.capacityUnits > 10_000_000) {
    return { ok: false, reason: 'Capacity must be a whole number of units.' };
  }
  const notes = record.notes === undefined || record.notes === null ? '' : record.notes;
  if (typeof notes !== 'string' || notes.length > 400) return { ok: false, reason: 'Notes are too long.' };
  return { ok: true, value: { month, productLine: record.productLine as ProductLine, capacityUnits: record.capacityUnits, notes } };
}

export const DEFAULT_WIN_RATES: Record<OpportunityStage, number> = {
  lead: 0.1,
  qualification: 0.25,
  licensed_buyer_review: 0.4,
  proposal: 0.6,
  won: 1,
  lost: 0,
};

export type StageEventRow = {
  brand: string;
  opportunityId: string;
  fromStage: OpportunityStage | null;
  toStage: OpportunityStage;
};

export type ForecastOpportunity = {
  id: string;
  brand: string;
  stage: OpportunityStage;
  expectedCloseOn: string | null;
  productLine: ProductLine | null;
  quantityUnits: number | null;
};

export type CapacityRow = {
  brand: string;
  month: string;
  productLine: ProductLine;
  capacityUnits: number;
};

export type StageRate = {
  stage: OpportunityStage;
  rate: number;
  defaulted: boolean;
  closed: number;
};

export type ForecastStatus = 'short' | 'tight' | 'ok' | 'no_capacity';

export type ForecastCell = {
  month: string;
  productLine: ProductLine;
  demand: number;
  capacityUnits: number | null;
  gap: number | null;
  status: ForecastStatus;
};

// ISO week label, for example 2026-W46. weekStart is the Monday, YYYY-MM-DD.
export type IsoWeek = {
  isoWeek: string;
  weekStart: string;
};

export type WeeklyForecastCell = {
  isoWeek: string;
  weekStart: string;
  productLine: ProductLine;
  demand: number;
  capacityUnits: number | null;
  gap: number | null;
  status: ForecastStatus;
};

export type MonthlyForecastResponse = {
  ok: true;
  configured: true;
  brand: string;
  period: 'month';
  months: number;
  productLine: ProductLine | null;
  rates: StageRate[];
  cells: ForecastCell[];
  notForecastable: number;
  shorts: string[];
};

export type WeeklyForecastResponse = {
  ok: true;
  configured: true;
  brand: string;
  period: 'week';
  weeks: number;
  productLine: ProductLine | null;
  rates: StageRate[];
  cells: WeeklyForecastCell[];
  notForecastable: number;
  shorts: string[];
};

export type ForecastResponse = MonthlyForecastResponse | WeeklyForecastResponse;

const STAGE_LABEL: Record<OpportunityStage, string> = {
  lead: 'Lead',
  qualification: 'Qualification',
  licensed_buyer_review: 'License review',
  proposal: 'Proposal',
  won: 'Won',
  lost: 'Lost',
};

const LINE_LABEL: Record<ProductLine, string> = {
  vape: 'Vape',
  preroll: 'Pre-roll',
  gummy: 'Gummy',
  other: 'Other',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LIMIT = 24;
const WEEK_LIMIT = 53;

export function monthStart(isoDate: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;
  return `${match[1]}-${match[2]}-01`;
}

export function monthStarts(today: string, count: number): string[] {
  const start = monthStart(today);
  if (!start) return [];
  const [year, month] = start.split('-').map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 + index, 1));
    return date.toISOString().slice(0, 10);
  });
}

export function monthCaption(month: string): string {
  const [year, mon] = month.split('-').map(Number);
  return `${MONTHS[mon - 1]} ${String(year).slice(2)}`;
}

function utcDate(isoDate: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function formatUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// ISO 8601 week. Monday is the first day. The week belongs to the year of its
// Thursday, so 2026-12-28 through 2027-01-03 is 2026-W53 and 2027-01-04 is 2027-W01.
export function isoWeekOf(isoDate: string): IsoWeek | null {
  const date = utcDate(isoDate);
  if (!date) return null;
  const weekday = date.getUTCDay() || 7;
  const monday = new Date(date.getTime());
  monday.setUTCDate(date.getUTCDate() - (weekday - 1));
  const thursday = new Date(monday.getTime());
  thursday.setUTCDate(monday.getUTCDate() + 3);
  const isoYear = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Weekday = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4.getTime());
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Weekday - 1));
  const diffDays = Math.round((monday.getTime() - week1Monday.getTime()) / 86400000);
  const week = diffDays / 7 + 1;
  if (!Number.isInteger(week) || week < 1 || week > 53) return null;
  return { isoWeek: `${isoYear}-W${String(week).padStart(2, '0')}`, weekStart: formatUtc(monday) };
}

// Weeks begin with the ISO week that contains today, then move forward.
export function weekStarts(today: string, count: number): IsoWeek[] {
  const first = isoWeekOf(today);
  if (!first || count < 1) return [];
  const start = utcDate(first.weekStart);
  if (!start) return [];
  const weeks: IsoWeek[] = [];
  for (let index = 0; index < count; index += 1) {
    const monday = new Date(start.getTime());
    monday.setUTCDate(start.getUTCDate() + index * 7);
    const bucket = isoWeekOf(formatUtc(monday));
    if (!bucket) return [];
    weeks.push(bucket);
  }
  return weeks;
}

export function stageWinRates(events: readonly StageEventRow[], opportunities: readonly ForecastOpportunity[]): StageRate[] {
  const byId = new Map(opportunities.map((row) => [row.id, row]));
  const entered = new Map<string, Set<string>>();
  for (const event of events) {
    const deal = byId.get(event.opportunityId);
    if (!deal || deal.brand !== event.brand) continue;
    const set = entered.get(event.toStage) ?? new Set<string>();
    set.add(event.opportunityId);
    entered.set(event.toStage, set);
  }
  return (['lead', 'qualification', 'licensed_buyer_review', 'proposal', 'won', 'lost'] as const).map((stage) => {
    if (stage === 'won' || stage === 'lost') {
      return { stage, rate: DEFAULT_WIN_RATES[stage], defaulted: false, closed: 0 };
    }
    const ids = entered.get(stage) ?? new Set<string>();
    const closed = [...ids].map((id) => byId.get(id)).filter((row): row is ForecastOpportunity => !!row && (row.stage === 'won' || row.stage === 'lost'));
    const won = closed.filter((row) => row.stage === 'won').length;
    if (closed.length < 5) return { stage, rate: DEFAULT_WIN_RATES[stage], defaulted: true, closed: closed.length };
    return { stage, rate: won / closed.length, defaulted: false, closed: closed.length };
  });
}

function rateFor(stage: OpportunityStage, rates: readonly StageRate[]): number {
  return rates.find((row) => row.stage === stage)?.rate ?? DEFAULT_WIN_RATES[stage];
}

export function forecastStatus(demand: number, capacityUnits: number | null): ForecastStatus {
  if (capacityUnits === null) return 'no_capacity';
  if (demand > capacityUnits) return 'short';
  if (demand >= capacityUnits * 0.9) return 'tight';
  return 'ok';
}

function cellGap(demand: number, capacityUnits: number | null): number | null {
  return capacityUnits === null ? null : capacityUnits - demand;
}

// crm_capacity is keyed by month start (YYYY-MM-01) and product line.
// The caller loads one brand. A missing row is null, never zero.
function enteredCapacity(capacity: readonly CapacityRow[], productLine: ProductLine, month: string): number | null {
  const row = capacity.find((item) => item.productLine === productLine && monthStart(item.month.slice(0, 10)) === month);
  return row ? row.capacityUnits : null;
}

// Weekly capacity splits each month's crm_capacity across that month's days.
// A week receives (days of that week that fall in the month / days in the month)
// times the monthly capacity for the same product line. A week that crosses two
// months sums the share from each month. The result is not rounded.
// If any parent month the week touches has no capacity row for that product line,
// the week capacity is null. Null means no capacity was entered. It is never
// reported as 0. A cross-month week where only one month has a row is null for
// the whole week. A partial share is not reported. An entered capacity of 0
// stays 0, because that row exists.
export function weeklyCapacityUnits(weekStart: string, productLine: ProductLine, capacity: readonly CapacityRow[]): number | null {
  const canonical = isoWeekOf(weekStart);
  const start = canonical ? utcDate(canonical.weekStart) : null;
  if (!start) return null;
  const shares = new Map<string, { days: number; length: number }>();
  for (let offset = 0; offset < 7; offset += 1) {
    const day = new Date(start.getTime());
    day.setUTCDate(start.getUTCDate() + offset);
    const month = monthStart(formatUtc(day));
    if (!month) return null;
    const [year, mon] = month.split('-').map(Number);
    const current = shares.get(month) ?? { days: 0, length: daysInMonth(year, mon) };
    current.days += 1;
    shares.set(month, current);
  }
  let total = 0;
  for (const [month, share] of shares) {
    const units = enteredCapacity(capacity, productLine, month);
    if (units === null) return null;
    total += (share.days * units) / share.length;
  }
  return total;
}

function linesFor(productLine: ProductLine | null | undefined): readonly ProductLine[] {
  return productLine ? [productLine] : PRODUCT_LINES;
}

function weightedDemand(deals: readonly ForecastOpportunity[], rates: readonly StageRate[], line: ProductLine, matches: (deal: ForecastOpportunity) => boolean): number {
  let demand = 0;
  for (const deal of deals) {
    if (deal.stage === 'lost') continue;
    if (!deal.productLine || deal.quantityUnits === null || !deal.expectedCloseOn) continue;
    if (deal.productLine !== line || !matches(deal)) continue;
    const weight = deal.stage === 'won' ? 1 : rateFor(deal.stage, rates);
    demand += deal.quantityUnits * weight;
  }
  return demand;
}

function countNotForecastable(opportunities: readonly ForecastOpportunity[]): number {
  const seen = new Set<string>();
  let notForecastable = 0;
  for (const deal of opportunities) {
    if (deal.stage === 'lost' || seen.has(deal.id)) continue;
    if (OPEN_STAGES.indexOf(deal.stage) < 0 && deal.stage !== 'won') continue;
    if (!deal.productLine || deal.quantityUnits === null) {
      seen.add(deal.id);
      notForecastable += 1;
    }
  }
  return notForecastable;
}

function shortLine(cell: { productLine: ProductLine; demand: number; capacityUnits: number | null; gap: number | null; status: ForecastStatus }, when: string): string | null {
  if (cell.status !== 'short' || cell.capacityUnits === null || cell.gap === null) return null;
  const shortBy = Math.round((cell.demand - cell.capacityUnits) * 10) / 10;
  return `${LINE_LABEL[cell.productLine]} is short by ${shortBy.toLocaleString('en-US')} units in ${when} (demand ${cell.demand.toLocaleString('en-US')}, capacity ${cell.capacityUnits.toLocaleString('en-US')}).`;
}

export function productionForecast(input: {
  opportunities: readonly ForecastOpportunity[];
  capacity: readonly CapacityRow[];
  rates: readonly StageRate[];
  months: readonly string[];
  productLine?: ProductLine | null;
}): { cells: ForecastCell[]; notForecastable: number; shorts: string[] } {
  const cells: ForecastCell[] = [];
  for (const line of linesFor(input.productLine)) {
    for (const month of input.months) {
      const demand = weightedDemand(input.opportunities, input.rates, line, (deal) => monthStart(deal.expectedCloseOn || '') === month);
      const capacityUnits = enteredCapacity(input.capacity, line, month);
      const gap = cellGap(demand, capacityUnits);
      const status = forecastStatus(demand, capacityUnits);
      cells.push({ month, productLine: line, demand, capacityUnits, gap, status });
    }
  }
  const shorts = cells.map((cell) => shortLine(cell, monthCaption(cell.month))).filter((line): line is string => line !== null);
  return { cells, notForecastable: countNotForecastable(input.opportunities), shorts };
}

// Demand is not split across months. The whole weighted quantity, with won
// deals counted in full, lands in the ISO week of expected_close_on.
export function weeklyProductionForecast(input: {
  opportunities: readonly ForecastOpportunity[];
  capacity: readonly CapacityRow[];
  rates: readonly StageRate[];
  weeks: readonly IsoWeek[];
  productLine?: ProductLine | null;
}): { cells: WeeklyForecastCell[]; notForecastable: number; shorts: string[] } {
  const cells: WeeklyForecastCell[] = [];
  for (const line of linesFor(input.productLine)) {
    for (const week of input.weeks) {
      const canonical = isoWeekOf(week.weekStart) ?? week;
      const demand = weightedDemand(input.opportunities, input.rates, line, (deal) => isoWeekOf(deal.expectedCloseOn || '')?.isoWeek === canonical.isoWeek);
      const capacityUnits = weeklyCapacityUnits(canonical.weekStart, line, input.capacity);
      const gap = cellGap(demand, capacityUnits);
      const status = forecastStatus(demand, capacityUnits);
      cells.push({
        isoWeek: canonical.isoWeek,
        weekStart: canonical.weekStart,
        productLine: line,
        demand,
        capacityUnits,
        gap,
        status,
      });
    }
  }
  const shorts = cells.map((cell) => shortLine(cell, `${cell.isoWeek} (week of ${cell.weekStart})`)).filter((line): line is string => line !== null);
  return { cells, notForecastable: countNotForecastable(input.opportunities), shorts };
}

// Year view is not a fiscal year. Callers ask for period=month and months=12,
// which starts at the current month. Week view uses weeks, default 13.
// An out-of-range months or weeks value falls back to that default.
// productLine limits the cells to one line. Omitted, it returns every line.
export function parseForecastQuery(params: URLSearchParams): { ok: true; period: 'month'; months: number; productLine: ProductLine | null } | { ok: true; period: 'week'; weeks: number; productLine: ProductLine | null } | { ok: false; reason: string } {
  const rawPeriod = params.get('period');
  const period = rawPeriod === null || rawPeriod === '' || rawPeriod === 'month' ? 'month' : rawPeriod === 'week' ? 'week' : null;
  if (!period) return { ok: false, reason: 'Period must be month or week.' };
  const rawLine = params.get('productLine');
  let productLine: ProductLine | null = null;
  if (rawLine !== null && rawLine !== '') {
    if (!(PRODUCT_LINES as readonly string[]).includes(rawLine)) return { ok: false, reason: 'Product line is not recognized.' };
    productLine = rawLine as ProductLine;
  }
  if (period === 'week') {
    const requested = Number(params.get('weeks') || '13');
    const weeks = Number.isInteger(requested) && requested >= 1 && requested <= WEEK_LIMIT ? requested : 13;
    return { ok: true, period: 'week', weeks, productLine };
  }
  const requested = Number(params.get('months') || '6');
  const months = Number.isInteger(requested) && requested >= 1 && requested <= MONTH_LIMIT ? requested : 6;
  return { ok: true, period: 'month', months, productLine };
}

export function rateCaption(rate: StageRate): string {
  if (rate.stage === 'won' || rate.stage === 'lost') return rate.stage === 'won' ? 'Won deals count in full' : 'Lost deals are not demand';
  return rate.defaulted ? 'Default until 5 deals close' : `From your history (${rate.closed} closed deals)`;
}

export function stageRateLabel(stage: OpportunityStage): string {
  return STAGE_LABEL[stage];
}
