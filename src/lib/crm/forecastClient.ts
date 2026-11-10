// Client adapter for the production forecast screens.
// Month and Year call GET /api/admin/crm/forecast?period=month.
// Week calls GET /api/admin/crm/forecast?period=week.

import { PRODUCT_LINES, PRODUCT_LINE_LABELS, type CrmBrand, type ProductLine } from './engine';

export const FORECAST_STATUSES = ['short', 'tight', 'ok', 'no_capacity'] as const;
export type ForecastStatus = (typeof FORECAST_STATUSES)[number];
export type ForecastSpan = 'week' | 'month' | 'year';
export type CapacitySource = 'entered' | 'extended';

export type MonthlyForecastCell = {
  month: string;
  productLine: ProductLine;
  demand: number;
  capacityUnits: number | null;
  gap: number | null;
  status: ForecastStatus;
  capacitySource?: CapacitySource | null;
  capacityFrom?: string | null;
};

export type WeeklyForecastCell = {
  isoWeek: string;
  weekStart: string;
  productLine: ProductLine;
  demand: number;
  capacityUnits: number | null;
  gap: number | null;
  status: ForecastStatus;
  capacitySource?: CapacitySource | null;
  capacityFrom?: string | null;
};

export type ForecastPoint = {
  demand: number | null;
  capacityUnits: number | null;
  gap: number | null;
  status: ForecastStatus | null;
  capacitySource: CapacitySource | null;
  carriedFrom: string | null;
};

export type ForecastColumn = {
  id: string;
  label: string;
  dates: string;
  kicker: string;
  caption: string;
  start: string;
  end: string;
  demand: number | null;
  capacityUnits: number | null;
  gap: number | null;
  capacitySource: CapacitySource | null;
  carriedFrom: string | null;
};

export type ForecastLine = {
  productLine: ProductLine;
  label: string;
  points: ForecastPoint[];
};

export type ForecastBoard = {
  columns: ForecastColumn[];
  lines: ForecastLine[];
};

export type ForecastStats = {
  totalDemand: number;
  short: number;
  tight: number;
  noCapacity: number;
};

export const NO_CAPACITY = 'No capacity entered';
export const WEEKLY_PENDING = 'Weekly forecast coming soon';
export const FORECAST_UNREADABLE = 'That forecast could not be read.';

const ISO_WEEK = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const SPANS: ForecastSpan[] = ['week', 'month', 'year'];

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function isLine(value: unknown): value is ProductLine {
  return typeof value === 'string' && (PRODUCT_LINES as readonly string[]).includes(value);
}

function isStatus(value: unknown): value is ForecastStatus {
  return typeof value === 'string' && (FORECAST_STATUSES as readonly string[]).includes(value);
}

function isDemand(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isCapacity(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

function isGap(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function monthKey(value: string): string | null {
  if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`;
  if (ISO_DAY.test(value)) return `${value.slice(0, 7)}-01`;
  return null;
}

function readCapacitySource(cell: Record<string, unknown>): CapacitySource | null {
  // null means no earlier entry.
  if (cell.capacitySource === null || cell.capacitySource === undefined) return null;
  return cell.capacitySource === 'entered' || cell.capacitySource === 'extended' ? cell.capacitySource : null;
}

export function echoedFrom(body: unknown, requested: string | null): boolean {
  if (!requested || !body || typeof body !== 'object') return false;
  const value = (body as { from?: unknown }).from;
  return typeof value === 'string' && monthKey(value) === requested;
}

function readCapacityFrom(cell: Record<string, unknown>): string | null {
  const raw = cell.capacityFrom ?? cell.extendedFrom;
  return typeof raw === 'string' ? monthKey(raw) : null;
}

// A blank capacity stays null. It is never coerced to zero.
function normalizeStatus(capacityUnits: number | null, status: ForecastStatus): ForecastStatus {
  if (capacityUnits === null) return 'no_capacity';
  return status === 'no_capacity' ? 'ok' : status;
}

export type ParsedWeeklyForecast = {
  cells: WeeklyForecastCell[];
  notForecastable: number;
};

// Weekly capacity is a pro-rated share and is not rounded by the API.
// The UI rounds it to a whole unit. Null stays null, never zero.
export function roundCapacityUnits(value: number | null): number | null {
  if (value === null) return null;
  return Math.round(value);
}

export function parseWeeklyForecast(body: unknown): ParsedWeeklyForecast | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  // A body that is not period week, or has no isoWeek cells, is not this contract.
  if (record.period !== 'week' || !Array.isArray(record.cells)) return null;
  const hasIsoWeek = record.cells.some((item) => !!item && typeof item === 'object' && typeof (item as { isoWeek?: unknown }).isoWeek === 'string');
  if (!hasIsoWeek) return null;
  const cells: WeeklyForecastCell[] = [];
  for (const item of record.cells) {
    if (!item || typeof item !== 'object') return null;
    const cell = item as Record<string, unknown>;
    if (typeof cell.isoWeek !== 'string' || !ISO_WEEK.test(cell.isoWeek)) return null;
    if (typeof cell.weekStart !== 'string' || !ISO_DAY.test(cell.weekStart)) return null;
    if (!isLine(cell.productLine) || !isDemand(cell.demand) || !isCapacity(cell.capacityUnits) || !isGap(cell.gap) || !isStatus(cell.status)) return null;
    const capacityUnits = cell.capacityUnits;
    cells.push({
      isoWeek: cell.isoWeek,
      weekStart: cell.weekStart,
      productLine: cell.productLine,
      demand: cell.demand,
      capacityUnits,
      gap: capacityUnits === null ? null : cell.gap,
      status: normalizeStatus(capacityUnits, cell.status),
      capacitySource: capacityUnits === null ? null : readCapacitySource(cell),
      capacityFrom: capacityUnits === null ? null : readCapacityFrom(cell),
    });
  }
  const notForecastable = typeof record.notForecastable === 'number' && Number.isFinite(record.notForecastable) ? record.notForecastable : 0;
  return { cells, notForecastable };
}

export function parseMonthlyForecast(body: unknown): { cells: MonthlyForecastCell[] } | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  if (record.period === 'week' || !Array.isArray(record.cells)) return null;
  const cells: MonthlyForecastCell[] = [];
  for (const item of record.cells) {
    if (!item || typeof item !== 'object') return null;
    const cell = item as Record<string, unknown>;
    const month = typeof cell.month === 'string' ? monthKey(cell.month) : null;
    if (!month || !isLine(cell.productLine) || !isDemand(cell.demand) || !isCapacity(cell.capacityUnits) || !isStatus(cell.status)) return null;
    const capacityUnits = cell.capacityUnits;
    const gap = isGap(cell.gap) ? cell.gap : capacityUnits === null ? null : roundTenth(capacityUnits - cell.demand);
    cells.push({
      month,
      productLine: cell.productLine,
      demand: cell.demand,
      capacityUnits,
      gap: capacityUnits === null ? null : gap,
      status: normalizeStatus(capacityUnits, cell.status),
      capacitySource: capacityUnits === null ? null : readCapacitySource(cell),
      capacityFrom: capacityUnits === null ? null : readCapacityFrom(cell),
    });
  }
  return { cells };
}

export function monthsForSpan(span: 'month' | 'year'): 6 | 12 {
  return span === 'year' ? 12 : 6;
}

export function selectSpan(current: ForecastSpan, key: string): ForecastSpan {
  const index = SPANS.indexOf(current);
  if (key === 'ArrowRight' || key === 'ArrowDown') return SPANS[(index + 1) % SPANS.length];
  if (key === 'ArrowLeft' || key === 'ArrowUp') return SPANS[(index - 1 + SPANS.length) % SPANS.length];
  if (key === 'week' || key === 'month' || key === 'year') return key;
  return current;
}

export function lineFromSearch(value: string | null): ProductLine | null {
  return isLine(value) ? value : null;
}

export function spanFromSearch(value: string | null): ForecastSpan {
  return value === 'month' || value === 'year' || value === 'week' ? value : 'week';
}

export function productionHref(input: { brand: CrmBrand | string; line?: ProductLine | null; span?: ForecastSpan | null }): string {
  const params = new URLSearchParams();
  params.set('section', 'production');
  params.set('brand', input.brand);
  if (input.line) params.set('line', input.line);
  if (input.line && input.span && input.span !== 'week') params.set('span', input.span);
  return `/admin/crm?${params.toString()}`;
}

export function moveHeld(index: number, count: number, key: string): number | null {
  if (count <= 0) return null;
  if (key === 'ArrowRight' || key === 'ArrowDown') return Math.min(count - 1, index + 1);
  if (key === 'ArrowLeft' || key === 'ArrowUp') return Math.max(0, index - 1);
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

export function formatUnits(value: number): string {
  return roundTenth(value).toLocaleString('en-US', { maximumFractionDigits: 1 });
}

export function formatCapacity(value: number | null): string {
  if (value === null) return NO_CAPACITY;
  return Math.round(value).toLocaleString('en-US');
}

export function formatGap(value: number | null): string {
  if (value === null) return NO_CAPACITY;
  const rounded = roundTenth(value);
  if (rounded === 0) return '0';
  const text = formatUnits(Math.abs(rounded));
  return rounded > 0 ? `+${text}` : `-${text}`;
}

export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatDay(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function todayInNewYork(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

export function asOfLine(today = todayInNewYork()): string {
  const [year, month, day] = today.split('-').map(Number);
  const formatted = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
  return `As of ${formatted}`;
}

export function weekNumber(isoWeek: string): string {
  const match = /-W(\d{2})$/.exec(isoWeek);
  return match ? String(Number(match[1])) : isoWeek;
}

export function weekLabel(isoWeek: string): string {
  return `Wk ${weekNumber(isoWeek)}`;
}

export function shortDateSpan(start: string, end: string): string {
  if (start.slice(0, 7) === end.slice(0, 7)) return `${formatDay(start)} to ${Number(end.slice(8))}`;
  return `${formatDay(start)} to ${formatDay(end)}`;
}

export function exactDateSpan(start: string, end: string): string {
  if (start.slice(0, 4) !== end.slice(0, 4)) return `${formatDay(start)}, ${start.slice(0, 4)} to ${formatDay(end)}, ${end.slice(0, 4)}`;
  return `${formatDay(start)} to ${formatDay(end)}, ${end.slice(0, 4)}`;
}

export function monthYearLabel(month: string): string {
  const [year, mon] = month.split('-').map(Number);
  return `${MONTH_NAMES[mon - 1]} ${year}`;
}

function monthCaption(month: string): string {
  const [year, mon] = month.split('-').map(Number);
  return `${MONTH_NAMES[mon - 1]} ${String(year).slice(2)}`;
}

export function containsDay(start: string, end: string, today: string): boolean {
  return start <= today && today <= end;
}

export function currentMonthStart(today = todayInNewYork()): string {
  return `${today.slice(0, 7)}-01`;
}

export function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return date.toISOString().slice(0, 10);
}

export function yearWindowCaption(from: string): string {
  return `${monthYearLabel(from)} to ${monthYearLabel(shiftMonth(from, 11))}`;
}

export function coversYearWindow(months: readonly string[], from: string): boolean {
  for (let index = 0; index < 12; index += 1) {
    if (!months.includes(shiftMonth(from, index))) return false;
  }
  return true;
}

export function sliceYearCells<T extends { month: string }>(cells: readonly T[], from: string): T[] {
  const end = shiftMonth(from, 11);
  return cells.filter((cell) => cell.month >= from && cell.month <= end);
}

export function carriedForwardLabel(from: string | null): string {
  return from ? `Carried forward from ${monthYearLabel(from)}` : 'Carried forward from the last entered month';
}

export function monthFromSearch(value: string | null): string | null {
  return value ? monthKey(value) : null;
}

function monthEnd(month: string): string {
  const [year, mon] = month.split('-').map(Number);
  return new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10);
}

function aggregate(points: ForecastPoint[], expected: number): Pick<ForecastColumn, 'demand' | 'capacityUnits' | 'gap' | 'capacitySource' | 'carriedFrom'> {
  const known = points.filter((point) => typeof point.demand === 'number');
  const demand = known.length ? roundTenth(known.reduce((sum, point) => sum + (point.demand as number), 0)) : null;
  const complete = points.length === expected && points.every((point) => typeof point.capacityUnits === 'number' && point.status !== null);
  const capacityUnits = complete ? points.reduce((sum, point) => sum + (point.capacityUnits as number), 0) : null;
  const gap = demand === null || capacityUnits === null ? null : roundTenth(capacityUnits - demand);
  const numbered = points.filter((point) => typeof point.capacityUnits === 'number');
  const extended = numbered.length > 0 && numbered.every((point) => point.capacitySource === 'extended');
  const froms = [...new Set(numbered.map((point) => point.carriedFrom).filter((value): value is string => !!value))];
  return {
    demand,
    capacityUnits,
    gap,
    capacitySource: extended ? 'extended' : numbered.some((point) => point.capacitySource === 'entered') ? 'entered' : null,
    carriedFrom: extended && froms.length === 1 ? froms[0] : null,
  };
}

function emptyPoint(): ForecastPoint {
  return { demand: null, capacityUnits: null, gap: null, status: null, capacitySource: null, carriedFrom: null };
}

function stampCarry(points: ForecastPoint[], months: readonly string[]) {
  let lastEntered: string | null = null;
  points.forEach((point, index) => {
    if (point.capacityUnits === null) {
      point.capacitySource = null;
      point.carriedFrom = null;
      return;
    }
    if (point.capacitySource === 'extended') {
      point.carriedFrom = point.carriedFrom ?? lastEntered;
      return;
    }
    lastEntered = months[index] ?? null;
    point.carriedFrom = null;
  });
}

export function buildWeeklyBoard(cells: readonly WeeklyForecastCell[], only?: ProductLine | null, today = todayInNewYork()): ForecastBoard {
  const lines = only ? [only] : [...PRODUCT_LINES];
  const weeks = new Map<string, { start: string }>();
  for (const cell of cells) {
    const current = weeks.get(cell.isoWeek);
    if (!current || cell.weekStart < current.start) weeks.set(cell.isoWeek, { start: cell.weekStart });
  }
  const ordered = [...weeks.entries()].sort((a, b) => a[1].start.localeCompare(b[1].start) || a[0].localeCompare(b[0]));
  const columns: ForecastColumn[] = ordered.map(([id, week]) => {
    const end = addDays(week.start, 6);
    const head = weekLabel(id).toUpperCase();
    const day = formatDay(week.start).toUpperCase();
    return {
    id,
    label: head,
    dates: day,
    kicker: `${head} · ${day}`,
    caption: exactDateSpan(week.start, end),
    start: week.start,
    end,
    demand: null,
    capacityUnits: null,
    gap: null,
    capacitySource: null,
    carriedFrom: null,
    };
  });
  const series: ForecastLine[] = lines.map((productLine) => ({
    productLine,
    label: PRODUCT_LINE_LABELS[productLine],
    points: ordered.map(([id]) => {
      const cell = cells.find((item) => item.isoWeek === id && item.productLine === productLine);
      if (!cell) return emptyPoint();
      const capacityUnits = roundCapacityUnits(cell.capacityUnits);
      const gap = capacityUnits === null ? null : roundTenth(capacityUnits - cell.demand);
      return {
        demand: cell.demand,
        capacityUnits,
        gap,
        status: cell.status,
        capacitySource: capacityUnits === null ? null : cell.capacitySource ?? null,
        carriedFrom: capacityUnits === null ? null : cell.capacityFrom ?? null,
      };
    }),
  }));
  series.forEach((line) => stampCarry(line.points, ordered.map(([, week]) => `${week.start.slice(0, 7)}-01`)));
  series.forEach((line, lineIndex) => {
    line.points.forEach((point, index) => {
      if (lineIndex !== 0) return;
      const columnPoints = series.map((row) => row.points[index]);
      Object.assign(columns[index], aggregate(columnPoints, lines.length));
    });
  });
  if (!series.length) {
    ordered.forEach((_, index) => Object.assign(columns[index], aggregate([], 0)));
  }
  return { columns, lines: series };
}

export function buildMonthlyBoard(cells: readonly MonthlyForecastCell[], only?: ProductLine | null, today = todayInNewYork()): ForecastBoard {
  const lines = only ? [only] : [...PRODUCT_LINES];
  const scoped = only ? cells.filter((cell) => cell.productLine === only) : cells;
  const months = [...new Set(scoped.map((cell) => cell.month))].sort();
  const columns: ForecastColumn[] = months.map((month) => {
    const end = monthEnd(month);
    const head = monthCaption(month).toUpperCase();
    return {
    id: month,
    label: head,
    dates: '',
    kicker: head,
    caption: exactDateSpan(month, end),
    start: month,
    end,
    demand: null,
    capacityUnits: null,
    gap: null,
    capacitySource: null,
    carriedFrom: null,
    };
  });
  const series: ForecastLine[] = lines.map((productLine) => ({
    productLine,
    label: PRODUCT_LINE_LABELS[productLine],
    points: months.map((month) => {
      const cell = scoped.find((item) => item.month === month && item.productLine === productLine);
      if (!cell) return emptyPoint();
      return {
        demand: cell.demand,
        capacityUnits: cell.capacityUnits,
        gap: cell.gap,
        status: cell.status,
        capacitySource: cell.capacityUnits === null ? null : cell.capacitySource ?? null,
        carriedFrom: cell.capacityUnits === null ? null : cell.capacityFrom ?? null,
      };
    }),
  }));
  series.forEach((line) => stampCarry(line.points, months));
  if (series.length) {
    months.forEach((_, index) => {
      Object.assign(columns[index], aggregate(series.map((row) => row.points[index]), lines.length));
    });
  }
  return { columns, lines: series };
}

export type ChartPoint = {
  demand: number;
  capacityUnits: number | null;
  extended: boolean;
  partial: boolean;
  partialUnits: number | null;
  known: number;
  expected: number;
  missing: string[];
  carriedCount: number;
};

// A complete column sums every line. A partial column keeps the known sum
// aside, so the chart does not draw it as a full capacity line.
export function chartSeries(board: ForecastBoard): ChartPoint[] {
  return board.columns.map((_, index) => {
    const rows = board.lines.map((line) => ({ label: line.label, point: line.points[index] }));
    const demand = rows.reduce((sum, row) => sum + (typeof row.point?.demand === 'number' ? row.point.demand : 0), 0);
    const known = rows.filter((row) => typeof row.point?.capacityUnits === 'number');
    const missing = rows.filter((row) => row.point?.capacityUnits == null).map((row) => row.label);
    const expected = rows.length;
    const sum = known.reduce((total, row) => total + (row.point.capacityUnits as number), 0);
    const partial = known.length > 0 && known.length < expected;
    const allExtended = known.length > 0 && known.every((row) => row.point.capacitySource === 'extended');
    return {
      demand,
      capacityUnits: !partial && known.length === expected && expected > 0 ? sum : null,
      extended: !partial && allExtended,
      partial,
      partialUnits: partial ? sum : null,
      known: known.length,
      expected,
      missing,
      carriedCount: known.filter((row) => row.point.capacitySource === 'extended').length,
    };
  });
}

export function partialCapacitySentence(point: Pick<ChartPoint, 'partialUnits' | 'known' | 'expected' | 'missing' | 'carriedCount'>): string {
  const amount = formatCapacity(point.partialUnits);
  const carried = point.carriedCount <= 0 ? '' : point.carriedCount === 1 ? ', 1 carried forward' : `, ${point.carriedCount} carried forward`;
  const names = point.missing.length <= 1
    ? (point.missing[0] ?? '')
    : point.missing.length === 2
      ? `${point.missing[0]} and ${point.missing[1]}`
      : `${point.missing.slice(0, -1).join(', ')} and ${point.missing[point.missing.length - 1]}`;
  const has = point.missing.length === 1 ? 'has' : 'have';
  return `Capacity ${amount} for ${point.known} of ${point.expected} lines${carried}. ${names} ${has} no capacity entered.`;
}

export function heldIndex(columns: readonly ForecastColumn[], today = todayInNewYork()): number {
  const index = columns.findIndex((column) => column.start <= today && today <= column.end);
  return index >= 0 ? index : 0;
}

export function forecastStats(points: readonly ForecastPoint[]): ForecastStats {
  let totalDemand = 0;
  let short = 0;
  let tight = 0;
  let noCapacity = 0;
  for (const point of points) {
    if (typeof point.demand === 'number') totalDemand += point.demand;
    if (point.capacityUnits === null) noCapacity += 1;
    else if (point.status === 'short') short += 1;
    else if (point.status === 'tight') tight += 1;
  }
  return { totalDemand: roundTenth(totalDemand), short, tight, noCapacity };
}

export function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = 10 ** exp;
  const step = value / base;
  const nice = step <= 1 ? 1 : step <= 2 ? 2 : step <= 5 ? 5 : 10;
  return nice * base;
}

async function readBody(res: Response): Promise<unknown> {
  return res.json().catch(() => null);
}

export function forecastPath(brand: string, span: ForecastSpan, productLine: ProductLine | null, from?: string | null): string {
  // Always send period, productLine, or from. A bare ?brand=&months= call is the legacy shape.
  const params = new URLSearchParams({ brand });
  if (span === 'week') {
    params.set('period', 'week');
    params.set('weeks', '13');
    if (productLine) params.set('productLine', productLine);
  } else {
    params.set('period', 'month');
    params.set('months', span === 'year' ? '12' : '6');
    if (span === 'year' && from) params.set('from', from);
    if (productLine) params.set('productLine', productLine);
  }
  return `/api/admin/crm/forecast?${params.toString()}`;
}

function quietFailure(status: number, json: unknown): string {
  if (status === 400) return FORECAST_UNREADABLE;
  const reason = json && typeof json === 'object' && typeof (json as { reason?: unknown }).reason === 'string'
    ? (json as { reason: string }).reason
    : '';
  return reason.length > 0 && reason.length < 120 ? reason : 'Production forecast is not available yet.';
}

export async function loadWeeklyForecast(
  brand: string,
  productLine: ProductLine | null,
  fetchImpl: FetchLike = fetch,
): Promise<{ state: 'pending' } | { state: 'error'; reason: string } | { state: 'ready'; cells: WeeklyForecastCell[]; notForecastable: number }> {
  // WEEK ADAPTER.
  // GET /api/admin/crm/forecast?brand=&period=week&weeks=13[&productLine=]
  // Cells may include capacitySource: 'entered' | 'extended' | null. A week is
  // extended when any part of it was carried forward. capacityUnits is null only
  // when nothing earlier was entered. A 400 is a quiet failure. A 200 body that
  // is not period:'week' with isoWeek cells stays "Weekly forecast coming soon".
  try {
    const res = await fetchImpl(forecastPath(brand, 'week', productLine), {
      headers: { 'x-cedargrowth-crm': '1' },
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const json = await readBody(res);
    if (!res.ok) return { state: 'error', reason: quietFailure(res.status, json) };
    const parsed = parseWeeklyForecast(json);
    if (!parsed) return { state: 'pending' };
    return { state: 'ready', cells: parsed.cells, notForecastable: parsed.notForecastable };
  } catch {
    return { state: 'error', reason: 'Production forecast is not available yet.' };
  }
}

export async function loadMonthlyForecast(
  brand: string,
  months: 6 | 12,
  productLine: ProductLine | null,
  fetchImpl: FetchLike = fetch,
  from?: string | null,
): Promise<{ state: 'ready'; cells: MonthlyForecastCell[]; notForecastable: number; honoredFrom: boolean | null } | { state: 'error'; reason: string }> {
  // Month is ?period=month&months=6&productLine=. Year is ?period=month&months=12&from=&productLine=.
  // honoredFrom is true only when the response echoes from.
  const span: ForecastSpan = months === 12 ? 'year' : 'month';
  try {
    const res = await fetchImpl(forecastPath(brand, span, productLine, from), {
      headers: { 'x-cedargrowth-crm': '1' },
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const json = await readBody(res);
    if (!res.ok) return { state: 'error', reason: quietFailure(res.status, json) };
    const parsed = parseMonthlyForecast(json);
    if (!parsed) return { state: 'error', reason: 'Production forecast is not available yet.' };
    const cells = productLine ? parsed.cells.filter((cell) => cell.productLine === productLine) : parsed.cells;
    const notForecastable = json && typeof json === 'object' && typeof (json as { notForecastable?: unknown }).notForecastable === 'number'
      ? (json as { notForecastable: number }).notForecastable
      : 0;
    const honoredFrom = from ? echoedFrom(json, from) : null;
    return { state: 'ready', cells: from && honoredFrom ? sliceYearCells(cells, from) : cells, notForecastable, honoredFrom };
  } catch {
    return { state: 'error', reason: 'Production forecast is not available yet.' };
  }
}

export type ForecastView =
  | { state: 'loading' }
  | { state: 'pending' }
  | { state: 'error'; reason: string }
  | { state: 'ready'; board: ForecastBoard; notForecastable: number; honoredFrom?: boolean | null };

export async function loadForecastView(brand: string, span: ForecastSpan, productLine: ProductLine | null, fetchImpl?: FetchLike, from?: string | null): Promise<ForecastView> {
  if (span === 'week') {
    const weekly = await loadWeeklyForecast(brand, productLine, fetchImpl);
    if (weekly.state === 'pending') return { state: 'pending' };
    if (weekly.state === 'error') return weekly;
    return { state: 'ready', board: buildWeeklyBoard(weekly.cells, productLine), notForecastable: weekly.notForecastable, honoredFrom: null };
  }
  const monthly = await loadMonthlyForecast(brand, monthsForSpan(span), productLine, fetchImpl, span === 'year' ? from : null);
  if (monthly.state === 'error') return monthly;
  return { state: 'ready', board: buildMonthlyBoard(monthly.cells, productLine), notForecastable: monthly.notForecastable, honoredFrom: monthly.honoredFrom };
}
