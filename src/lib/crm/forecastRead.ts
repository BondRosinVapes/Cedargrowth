// Forecast reads. The pipeline list stays capped at the 100 most recently
// updated deals, and the activity event list stays capped at the oldest 5000.
// Neither cap is safe for a forecast: a deal outside the list can still land
// in the window, and a stage event newer than the oldest 5000 can change a
// win rate. This module reads only the rows those numbers use, in pages.

import {
  isMissingSchema,
  OPPORTUNITY_STAGES,
  PRODUCT_LINES,
  type CrmBrand,
  type OpportunityStage,
  type ProductLine,
} from './engine';
import type { ForecastOpportunity, StageEventRow } from './forecast';

export const FORECAST_PAGE = 1000;
export const FORECAST_EVENT_BATCH = 80;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CLOSED_STAGES = ['won', 'lost'] as const satisfies readonly OpportunityStage[];

export type ForecastWindow = { start: string; end: string };

export type ForecastStageEvent = StageEventRow & { id: string; at: string; brand: CrmBrand };

export type ForecastRead = {
  opportunities: ForecastOpportunity[];
  events: ForecastStageEvent[];
};

export type ForecastReadResult =
  | { state: 'ok'; value: ForecastRead }
  | { state: 'absent' }
  | { state: 'unavailable' };

export type ForecastPage = {
  data: Record<string, unknown>[] | null;
  error: { code?: string; message?: string } | null;
};

// Pages are ordered by id ascending. A cursor asks for ids strictly after
// the previous page's last id. The caller applies the same limit the reader
// uses, so a short page is the end and a full page is not.
export type ForecastReadClient = {
  opportunityPage(afterId: string | null, limit: number): PromiseLike<ForecastPage>;
  stageEventProbe(): PromiseLike<ForecastPage>;
  stageEventPage(opportunityIds: readonly string[], afterId: string | null, limit: number): PromiseLike<ForecastPage>;
};

export function monthCloseWindow(months: readonly string[]): ForecastWindow | null {
  if (!months.length || months.some((month) => !/^\d{4}-\d{2}-01$/.test(month))) return null;
  const ordered = [...months].sort();
  const start = ordered[0];
  const last = ordered[ordered.length - 1];
  const [year, month] = last.split('-').map(Number);
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  if (!DAY.test(end) || start > end) return null;
  return { start, end };
}

export function weekCloseWindow(weeks: readonly { weekStart: string }[]): ForecastWindow | null {
  if (!weeks.length || weeks.some((week) => !DAY.test(week.weekStart))) return null;
  const ordered = weeks.map((week) => week.weekStart).sort();
  const last = new Date(`${ordered[ordered.length - 1]}T00:00:00.000Z`);
  last.setUTCDate(last.getUTCDate() + 6);
  const end = last.toISOString().slice(0, 10);
  if (ordered[0] > end) return null;
  return { start: ordered[0], end };
}

export function forecastWindowOk(window: ForecastWindow): boolean {
  return DAY.test(window.start) && DAY.test(window.end) && window.start <= window.end;
}

// PostgREST form of forecastDealNeeded. Closed deals set the win rate.
// Open or won deals missing a line or a quantity set the not-forecastable
// count. The remaining open and won deals count only when their close date
// is inside the window.
export function forecastDealFilter(window: ForecastWindow): string | null {
  if (!forecastWindowOk(window)) return null;
  return [
    `stage.in.(${CLOSED_STAGES.join(',')})`,
    'product_line.is.null',
    `product_line.not.in.(${PRODUCT_LINES.join(',')})`,
    'quantity_units.is.null',
    `and(expected_close_on.gte.${window.start},expected_close_on.lte.${window.end})`,
  ].join(',');
}

export function forecastDealNeeded(
  deal: { stage: string; productLine: string | null; quantityUnits: number | null; expectedCloseOn: string | null },
  window: ForecastWindow,
): boolean {
  if (!forecastWindowOk(window)) return false;
  if ((CLOSED_STAGES as readonly string[]).includes(deal.stage)) return true;
  const lineKnown = !!deal.productLine && (PRODUCT_LINES as readonly string[]).includes(deal.productLine);
  if (!lineKnown || deal.quantityUnits === null) return true;
  const day = deal.expectedCloseOn ? deal.expectedCloseOn.slice(0, 10) : '';
  return DAY.test(day) && day >= window.start && day <= window.end;
}

export function chunkIds(ids: readonly string[], size: number): string[][] {
  if (!Number.isInteger(size) || size < 1) return [];
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += size) chunks.push(ids.slice(index, index + size));
  return chunks;
}

function classify(error: { code?: string; message?: string } | null): 'absent' | 'unavailable' | null {
  if (!error) return null;
  return isMissingSchema(error) ? 'absent' : 'unavailable';
}

function asBrand(value: unknown): CrmBrand | null {
  return value === 'cedargrowth' || value === 'bond' ? value : null;
}

function asStage(value: unknown): OpportunityStage | null {
  return typeof value === 'string' && (OPPORTUNITY_STAGES as readonly string[]).includes(value) ? value as OpportunityStage : null;
}

function asLine(value: unknown): ProductLine | null {
  return typeof value === 'string' && (PRODUCT_LINES as readonly string[]).includes(value) ? value as ProductLine : null;
}

function mapOpportunity(row: Record<string, unknown>, brand: CrmBrand): ForecastOpportunity | null {
  const rowBrand = asBrand(row.brand);
  const stage = asStage(row.stage);
  if (!rowBrand || rowBrand !== brand || typeof row.id !== 'string' || !row.id || !stage) return null;
  return {
    id: row.id,
    brand: rowBrand,
    stage,
    expectedCloseOn: row.expected_close_on ? String(row.expected_close_on) : null,
    productLine: asLine(row.product_line),
    quantityUnits: typeof row.quantity_units === 'number' ? row.quantity_units : null,
  };
}

function mapEvent(row: Record<string, unknown>, brand: CrmBrand): ForecastStageEvent | null {
  const rowBrand = asBrand(row.brand);
  const toStage = asStage(row.to_stage);
  const fromStage = row.from_stage === null || row.from_stage === undefined ? null : asStage(row.from_stage);
  if (!rowBrand || rowBrand !== brand || typeof row.id !== 'string' || !row.id || typeof row.opportunity_id !== 'string' || !toStage) return null;
  if (row.from_stage !== null && row.from_stage !== undefined && !fromStage) return null;
  return {
    id: row.id,
    brand: rowBrand,
    opportunityId: row.opportunity_id,
    fromStage,
    toStage,
    at: String(row.at ?? ''),
  };
}

async function readPages(
  fetchPage: (afterId: string | null, limit: number) => PromiseLike<ForecastPage>,
  limit: number,
): Promise<{ state: 'ok'; rows: Record<string, unknown>[] } | { state: 'absent' } | { state: 'unavailable' }> {
  const rows: Record<string, unknown>[] = [];
  let after: string | null = null;
  for (;;) {
    const page = await fetchPage(after, limit);
    const failed = classify(page.error);
    if (failed) return { state: failed };
    if (page.error || !Array.isArray(page.data)) return { state: 'unavailable' };
    if (page.data.length === 0) return { state: 'ok', rows };
    const last = page.data[page.data.length - 1];
    const lastId = last && typeof last.id === 'string' ? last.id : '';
    if (!lastId || lastId === after) return { state: 'unavailable' };
    rows.push(...page.data);
    if (page.data.length < limit) return { state: 'ok', rows };
    after = lastId;
  }
}

export async function readForecastInputs(
  brand: CrmBrand,
  window: ForecastWindow,
  client: ForecastReadClient,
  pageSize = FORECAST_PAGE,
): Promise<ForecastReadResult> {
  if (!forecastDealFilter(window) || !Number.isInteger(pageSize) || pageSize < 1) return { state: 'unavailable' };
  const loaded = await readPages((afterId, limit) => client.opportunityPage(afterId, limit), pageSize);
  if (loaded.state !== 'ok') return loaded;
  const opportunities: ForecastOpportunity[] = [];
  for (const row of loaded.rows) {
    const deal = mapOpportunity(row, brand);
    if (!deal) return { state: 'unavailable' };
    opportunities.push(deal);
  }
  const closedIds = opportunities.filter((row) => row.stage === 'won' || row.stage === 'lost').map((row) => row.id).sort();
  if (!closedIds.length) {
    const probe = await client.stageEventProbe();
    const failed = classify(probe.error);
    if (failed) return { state: failed };
    if (probe.error) return { state: 'unavailable' };
    return { state: 'ok', value: { opportunities, events: [] } };
  }
  const events: ForecastStageEvent[] = [];
  for (const ids of chunkIds(closedIds, FORECAST_EVENT_BATCH)) {
    const page = await readPages((afterId, limit) => client.stageEventPage(ids, afterId, limit), pageSize);
    if (page.state !== 'ok') return page;
    for (const row of page.rows) {
      const event = mapEvent(row, brand);
      if (!event || !ids.includes(event.opportunityId)) return { state: 'unavailable' };
      events.push(event);
    }
  }
  return { state: 'ok', value: { opportunities, events } };
}
