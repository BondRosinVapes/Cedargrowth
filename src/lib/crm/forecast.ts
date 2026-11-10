// Production forecast from open and won deals. Missing capacity is not zero.
// Win rates come from closed deals that passed through a stage, or a default
// until five closed deals have done so. Monthly cells are the default.
// Weekly cells group the same weighted demand by ISO week. Capacity is the
// only figure that is pro-rated from the monthly crm_capacity row.
// This module does not write storage.
//
// Owner decision, 2026-11-10: a new forecast request carries the latest earlier
// entered capacity forward. CARRY_FORWARD_CAPACITY is that switch and defaults
// to on. Set it to false to make a month with no row null again. A legacy
// request (brand and months only) never carries forward and keeps the original
// response keys.

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

// null when the cell has no capacity. 'extended' means the value was carried
// forward from an earlier first-of-month row. A cross-month week is 'extended'
// when any of its shares was carried forward.
export type CapacitySource = 'entered' | 'extended' | null;

// Confirmed on. Set to false to stop carry-forward on new forecast requests.
// A month with no row then stays null, and a week that needs that month stays
// null. Legacy brand+months requests never carry forward, either way.
export const CARRY_FORWARD_CAPACITY = true;

export type ForecastCell = {
  month: string;
  productLine: ProductLine;
  demand: number;
  capacityUnits: number | null;
  gap: number | null;
  status: ForecastStatus;
};

export type SourcedForecastCell = ForecastCell & {
  capacitySource: CapacitySource;
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
  capacitySource: CapacitySource;
};

// The original GET shape. No period, productLine, from, or capacitySource.
export type LegacyForecastResponse = {
  ok: true;
  configured: true;
  brand: string;
  months: number;
  rates: StageRate[];
  cells: ForecastCell[];
  notForecastable: number;
  shorts: string[];
};

export type MonthlyForecastResponse = {
  ok: true;
  configured: true;
  brand: string;
  period: 'month';
  months: number;
  from: string;
  productLine: ProductLine | null;
  rates: StageRate[];
  cells: SourcedForecastCell[];
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

export type ForecastResponse = LegacyForecastResponse | MonthlyForecastResponse | WeeklyForecastResponse;

export type ParsedForecastQuery =
  | { ok: true; shape: 'legacy'; months: number }
  | { ok: true; shape: 'month'; months: number; from: string | null; productLine: ProductLine | null }
  | { ok: true; shape: 'week'; weeks: number; productLine: ProductLine | null }
  | { ok: false; reason: string };

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

export function monthCapacityRange(months: readonly string[]): { start: string; end: string } | null {
  if (!months.length) return null;
  return { start: months[0], end: months[months.length - 1] };
}

export function weekCapacityRange(weeks: readonly IsoWeek[]): { start: string; end: string } | null {
  if (!weeks.length) return null;
  const last = utcDate(weeks[weeks.length - 1].weekStart);
  if (!last) return null;
  last.setUTCDate(last.getUTCDate() + 6);
  const start = monthStart(weeks[0].weekStart);
  const end = monthStart(formatUtc(last));
  if (!start || !end) return null;
  return { start, end };
}

// Rows the forecast needs: every capacity row inside the window, plus the
// latest first-of-month row before the window for each product line. Older
// history is not required for an exact match or for carry-forward.
export function forecastCapacityRows<T extends CapacityRow>(rows: readonly T[], start: string, end: string): T[] {
  const inWindow: T[] = [];
  const prior = new Map<ProductLine, T>();
  for (const row of rows) {
    if (row.month >= start && row.month <= end) {
      inWindow.push(row);
      continue;
    }
    if (row.month >= start || !isFirstOfMonth(row.month)) continue;
    const current = prior.get(row.productLine);
    if (!current || row.month > current.month) prior.set(row.productLine, row);
  }
  return [...inWindow, ...prior.values()];
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

// A capacity row counts only when month is exactly YYYY-MM-01. A value such as
// 2026-01-15 does not match January and is not a carry-forward candidate.
function isFirstOfMonth(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-01$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return false;
  const date = new Date(Date.UTC(year, month - 1, 1));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1;
}

function sameScope(row: CapacityRow, productLine: ProductLine, brand: string | undefined): boolean {
  return row.productLine === productLine && (brand === undefined || row.brand === brand);
}

export type ResolvedCapacity = { units: number; source: 'entered' | 'extended' };

// Exact row first. Otherwise, when carry-forward is on, the latest earlier
// first-of-month row for the same brand and product line. An entered 0 is a
// real value and carries forward as 0. Rows before the forecast window are
// included; the caller passes the brand's full capacity history.
export function resolveMonthCapacity(capacity: readonly CapacityRow[], productLine: ProductLine, month: string, options?: { brand?: string; carryForward?: boolean }): ResolvedCapacity | null {
  const brand = options?.brand;
  const exact = capacity.find((row) => sameScope(row, productLine, brand) && row.month === month);
  if (exact) return { units: exact.capacityUnits, source: 'entered' };
  if (!(options?.carryForward && CARRY_FORWARD_CAPACITY)) return null;
  let best: CapacityRow | undefined;
  for (const row of capacity) {
    if (!sameScope(row, productLine, brand) || !isFirstOfMonth(row.month) || row.month >= month) continue;
    if (!best || row.month > best.month) best = row;
  }
  return best ? { units: best.capacityUnits, source: 'extended' } : null;
}

// Weekly capacity splits each month's capacity across that month's days.
// A week receives (days of that week in the month / days in the month) times
// that month's capacity for the same product line, then sums the shares.
// The result is not rounded. A month with no row uses the carried value, so a
// cross-month week is not dropped just because one month is blank. The week
// is null only when a month still has no entered or carried capacity. A
// partial share is not reported.
export function weeklyCapacityUnits(weekStart: string, productLine: ProductLine, capacity: readonly CapacityRow[], options?: { brand?: string; carryForward?: boolean }): { units: number; source: 'entered' | 'extended' } | null {
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
  let extended = false;
  for (const [month, share] of shares) {
    const resolved = resolveMonthCapacity(capacity, productLine, month, options);
    if (!resolved) return null;
    if (resolved.source === 'extended') extended = true;
    total += (share.days * resolved.units) / share.length;
  }
  return { units: total, source: extended ? 'extended' : 'entered' };
}

function linesFor(productLine: ProductLine | null | undefined): readonly ProductLine[] {
  return productLine ? [productLine] : PRODUCT_LINES;
}

// Demand follows expected_close_on, including dates before today. Won deals
// count in full. Lost deals add nothing. An open deal with a past close date
// still counts in that month or ISO week at its stage weight.
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
  brand?: string;
  carryForward?: boolean;
  includeSource?: boolean;
}): { cells: Array<ForecastCell | SourcedForecastCell>; notForecastable: number; shorts: string[] } {
  const carryForward = input.carryForward === true;
  const cells: Array<ForecastCell | SourcedForecastCell> = [];
  for (const line of linesFor(input.productLine)) {
    for (const month of input.months) {
      const demand = weightedDemand(input.opportunities, input.rates, line, (deal) => monthStart(deal.expectedCloseOn || '') === month);
      const resolved = resolveMonthCapacity(input.capacity, line, month, { brand: input.brand, carryForward });
      const capacityUnits = resolved ? resolved.units : null;
      const gap = cellGap(demand, capacityUnits);
      const status = forecastStatus(demand, capacityUnits);
      const cell: ForecastCell = { month, productLine: line, demand, capacityUnits, gap, status };
      cells.push(input.includeSource ? { ...cell, capacitySource: resolved ? resolved.source : null } : cell);
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
  brand?: string;
  carryForward?: boolean;
}): { cells: WeeklyForecastCell[]; notForecastable: number; shorts: string[] } {
  const carryForward = input.carryForward !== false;
  const cells: WeeklyForecastCell[] = [];
  for (const line of linesFor(input.productLine)) {
    for (const week of input.weeks) {
      const canonical = isoWeekOf(week.weekStart) ?? week;
      const demand = weightedDemand(input.opportunities, input.rates, line, (deal) => isoWeekOf(deal.expectedCloseOn || '')?.isoWeek === canonical.isoWeek);
      const resolved = weeklyCapacityUnits(canonical.weekStart, line, input.capacity, { brand: input.brand, carryForward });
      const capacityUnits = resolved ? resolved.units : null;
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
        capacitySource: resolved ? resolved.source : null,
      });
    }
  }
  const shorts = cells.map((cell) => shortLine(cell, `${cell.isoWeek} (week of ${cell.weekStart})`)).filter((line): line is string => line !== null);
  return { cells, notForecastable: countNotForecastable(input.opportunities), shorts };
}

function parseSpan(raw: string | null, label: string, fallback: number, max: number): { ok: true; value: number } | { ok: false; reason: string } {
  if (raw === null || raw === '') return { ok: true, value: fallback };
  const reason = `${label} must be a whole number from 1 to ${max}.`;
  if (!/^\d+$/.test(raw)) return { ok: false, reason };
  const value = Number(raw);
  if (value < 1 || value > max) return { ok: false, reason };
  return { ok: true, value };
}

export function parseMonthParam(value: string): string | null {
  if (!isFirstOfMonth(value)) return null;
  return value;
}

// Year view is not a fiscal year. It is a month window of 12, starting at
// `from` or the current month. `from` pages that window, including past months.
// An omitted months or weeks value keeps its default. A present value that is
// not a whole number in range is rejected. productLine, period, and from are
// the new params: any one of them leaves the legacy response.
export function parseForecastQuery(params: URLSearchParams): ParsedForecastQuery {
  const rawPeriod = params.get('period');
  const rawLine = params.get('productLine');
  const rawFrom = params.get('from');
  const periodExplicit = rawPeriod !== null && rawPeriod !== '';
  const lineExplicit = rawLine !== null && rawLine !== '';
  const fromExplicit = rawFrom !== null && rawFrom !== '';
  if (periodExplicit && rawPeriod !== 'month' && rawPeriod !== 'week') return { ok: false, reason: 'Period must be month or week.' };
  let productLine: ProductLine | null = null;
  if (lineExplicit) {
    if (!(PRODUCT_LINES as readonly string[]).includes(rawLine as string)) return { ok: false, reason: 'Product line is not recognized.' };
    productLine = rawLine as ProductLine;
  }
  let from: string | null = null;
  if (fromExplicit) {
    from = parseMonthParam(rawFrom as string);
    if (!from) return { ok: false, reason: 'Month must be the first day of a month.' };
  }
  const period = rawPeriod === 'week' ? 'week' : 'month';
  if (period === 'week' && fromExplicit) return { ok: false, reason: 'from applies to a month forecast.' };
  if (period === 'week') {
    const weeks = parseSpan(params.get('weeks'), 'Weeks', 13, WEEK_LIMIT);
    if (!weeks.ok) return weeks;
    return { ok: true, shape: 'week', weeks: weeks.value, productLine };
  }
  const months = parseSpan(params.get('months'), 'Months', 6, MONTH_LIMIT);
  if (!months.ok) return months;
  if (!periodExplicit && !lineExplicit && !fromExplicit) return { ok: true, shape: 'legacy', months: months.value };
  return { ok: true, shape: 'month', months: months.value, from, productLine };
}

export function rateCaption(rate: StageRate): string {
  if (rate.stage === 'won' || rate.stage === 'lost') return rate.stage === 'won' ? 'Won deals count in full' : 'Lost deals are not demand';
  return rate.defaulted ? 'Default until 5 deals close' : `From your history (${rate.closed} closed deals)`;
}

export function stageRateLabel(stage: OpportunityStage): string {
  return STAGE_LABEL[stage];
}
