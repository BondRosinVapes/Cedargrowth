// Production forecast from open and won deals. Missing capacity is not zero.
// Win rates come from closed deals that passed through a stage, or a default
// until five closed deals have done so. This module does not write storage.

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

export type ForecastCell = {
  month: string;
  productLine: ProductLine;
  demand: number;
  capacityUnits: number | null;
  gap: number | null;
  status: 'short' | 'tight' | 'ok' | 'no_capacity';
};

const STAGE_LABEL: Record<OpportunityStage, string> = {
  lead: 'Lead',
  qualification: 'Qualification',
  licensed_buyer_review: 'License review',
  proposal: 'Proposal',
  won: 'Won',
  lost: 'Lost',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

export function productionForecast(input: {
  opportunities: readonly ForecastOpportunity[];
  capacity: readonly CapacityRow[];
  rates: readonly StageRate[];
  months: readonly string[];
}): { cells: ForecastCell[]; notForecastable: number; shorts: string[] } {
  const lines = PRODUCT_LINES;
  let notForecastable = 0;
  const cells: ForecastCell[] = [];
  for (const line of lines) {
    for (const month of input.months) {
      let demand = 0;
      for (const deal of input.opportunities) {
        if (deal.stage === 'lost') continue;
        if (!deal.productLine || deal.quantityUnits === null || !deal.expectedCloseOn) {
          continue;
        }
        if (deal.productLine !== line || monthStart(deal.expectedCloseOn) !== month) continue;
        const weight = deal.stage === 'won' ? 1 : rateFor(deal.stage, input.rates);
        demand += deal.quantityUnits * weight;
      }
      const cap = input.capacity.find((row) => row.productLine === line && row.month === month);
      if (!cap) {
        cells.push({ month, productLine: line, demand, capacityUnits: null, gap: null, status: 'no_capacity' });
        continue;
      }
      const gap = cap.capacityUnits - demand;
      const status = demand > cap.capacityUnits ? 'short' : demand >= cap.capacityUnits * 0.9 ? 'tight' : 'ok';
      cells.push({ month, productLine: line, demand, capacityUnits: cap.capacityUnits, gap, status });
    }
  }
  const seen = new Set<string>();
  for (const deal of input.opportunities) {
    if (deal.stage === 'lost' || seen.has(deal.id)) continue;
    if (OPEN_STAGES.indexOf(deal.stage) < 0 && deal.stage !== 'won') continue;
    if (!deal.productLine || deal.quantityUnits === null) {
      seen.add(deal.id);
      notForecastable += 1;
    }
  }
  const shorts = cells.filter((cell) => cell.status === 'short' && cell.capacityUnits !== null && cell.gap !== null).map((cell) => {
    const label = { vape: 'Vape', preroll: 'Pre-roll', gummy: 'Gummy', other: 'Other' }[cell.productLine];
    const shortBy = Math.round((cell.demand - (cell.capacityUnits as number)) * 10) / 10;
    return `${label} is short by ${shortBy.toLocaleString('en-US')} units in ${monthCaption(cell.month)} (demand ${cell.demand.toLocaleString('en-US')}, capacity ${(cell.capacityUnits as number).toLocaleString('en-US')}).`;
  });
  return { cells, notForecastable, shorts };
}

export function rateCaption(rate: StageRate): string {
  if (rate.stage === 'won' || rate.stage === 'lost') return rate.stage === 'won' ? 'Won deals count in full' : 'Lost deals are not demand';
  return rate.defaulted ? 'Default until 5 deals close' : `From your history (${rate.closed} closed deals)`;
}

export function stageRateLabel(stage: OpportunityStage): string {
  return STAGE_LABEL[stage];
}
