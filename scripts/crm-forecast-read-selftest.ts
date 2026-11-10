// Synthetic forecast-read checks. These rows are not account findings.
// Run through scripts/crm-selftest.ts.

import { handleForecast, handleOpportunityCollection } from '../src/lib/crm/handlers.ts';
import { monthStarts, productionForecast, stageWinRates } from '../src/lib/crm/forecast.ts';
import {
  chunkIds,
  forecastDealFilter,
  forecastDealNeeded,
  monthCloseWindow,
  readForecastInputs,
  weekCloseWindow,
  type ForecastPage,
  type ForecastReadClient,
  type ForecastWindow,
} from '../src/lib/crm/forecastRead.ts';
import type { CrmStore } from '../src/lib/crm/store.ts';

type Assert = (ok: boolean, message: string) => void;

type Deal = {
  id: string;
  brand: 'cedargrowth' | 'bond';
  stage: 'lead' | 'qualification' | 'licensed_buyer_review' | 'proposal' | 'won' | 'lost';
  expectedCloseOn: string | null;
  productLine: 'vape' | 'preroll' | 'gummy' | 'other' | null;
  quantityUnits: number | null;
  updatedAt: string;
};

type EventRow = {
  id: string;
  brand: 'cedargrowth' | 'bond';
  opportunityId: string;
  fromStage: Deal['stage'] | null;
  toStage: Deal['stage'];
  at: string;
};

function crmReq(path: string) {
  return new Request(`https://cedargrowth.vercel.app${path}`, {
    method: 'GET',
    headers: { origin: 'https://cedargrowth.vercel.app', 'x-cedargrowth-crm': '1', 'sec-fetch-site': 'same-origin' },
  });
}

function pageById<T extends { id: string }>(rows: readonly T[], afterId: string | null, limit: number): T[] {
  const ordered = [...rows].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  if (!afterId) return ordered.slice(0, limit);
  const at = ordered.findIndex((row) => row.id === afterId);
  if (at < 0) return [];
  return ordered.slice(at + 1, at + 1 + limit);
}

function dealRow(deal: Deal): Record<string, unknown> {
  return {
    id: deal.id,
    brand: deal.brand,
    stage: deal.stage,
    expected_close_on: deal.expectedCloseOn,
    product_line: deal.productLine,
    quantity_units: deal.quantityUnits,
  };
}

function eventRecord(event: EventRow): Record<string, unknown> {
  return { id: event.id, brand: event.brand, opportunity_id: event.opportunityId, from_stage: event.fromStage, to_stage: event.toStage, at: event.at };
}

function pagingClient(deals: readonly Deal[], events: readonly EventRow[], brand: Deal['brand'], window: ForecastWindow, pageSize: number, pages: { opportunities: number; events: number }) : ForecastReadClient {
  const needed = deals.filter((row) => row.brand === brand && forecastDealNeeded(row, window));
  return {
    opportunityPage(afterId, limit) {
      pages.opportunities += 1;
      const data = pageById(needed, afterId, limit).map(dealRow);
      if (limit !== pageSize) return Promise.resolve({ data: null, error: { message: 'page size drifted' } });
      return Promise.resolve({ data, error: null });
    },
    stageEventProbe() {
      return Promise.resolve({ data: [], error: null });
    },
    stageEventPage(opportunityIds, afterId, limit) {
      pages.events += 1;
      const allowed = new Set(opportunityIds);
      const matched = events.filter((row) => row.brand === brand && allowed.has(row.opportunityId));
      const data = pageById(matched, afterId, limit).map(eventRecord);
      return Promise.resolve({ data, error: null });
    },
  };
}

export async function assertForecastReads(assert: Assert): Promise<void> {
  const window = { start: '2026-11-01', end: '2026-12-31' };
  assert(monthCloseWindow(['2026-11-01', '2026-12-01'])?.end === '2026-12-31' && monthCloseWindow(['2024-02-01'])?.end === '2024-02-29', 'a month window runs through the last day, including a leap day');
  assert(weekCloseWindow([{ weekStart: '2026-11-16' }, { weekStart: '2026-11-09' }])?.start === '2026-11-09' && weekCloseWindow([{ weekStart: '2026-11-09' }])?.end === '2026-11-15', 'a week window covers Monday through Sunday');
  assert(forecastDealNeeded({ stage: 'won', productLine: 'vape', quantityUnits: 1, expectedCloseOn: '2020-01-01' }, window), 'a closed deal stays in the win-rate set outside the window');
  assert(forecastDealNeeded({ stage: 'proposal', productLine: null, quantityUnits: 3, expectedCloseOn: '2020-01-01' }, window), 'a deal missing a product line still counts as not forecastable');
  assert(!forecastDealNeeded({ stage: 'proposal', productLine: 'vape', quantityUnits: 3, expectedCloseOn: '2020-01-01' }, window), 'a complete open deal outside the window is not read');
  assert(forecastDealNeeded({ stage: 'proposal', productLine: 'vape', quantityUnits: 3, expectedCloseOn: '2026-11-15' }, window) && forecastDealNeeded({ stage: 'proposal', productLine: 'vape', quantityUnits: 3, expectedCloseOn: '2026-12-31' }, window), 'close dates on the window edges are included');
  assert(forecastDealFilter(window) === 'stage.in.(won,lost),product_line.is.null,product_line.not.in.(vape,preroll,gummy,other),quantity_units.is.null,and(expected_close_on.gte.2026-11-01,expected_close_on.lte.2026-12-31)', 'the deal query is the same rule as the predicate');
  assert(chunkIds(['a', 'b', 'c'], 2).length === 2 && chunkIds(['a'], 80).length === 1, 'closed deal ids are queried in batches');

  const deals: Deal[] = [];
  const events: EventRow[] = [];
  for (let index = 0; index < 99; index += 1) {
    deals.push({ id: `n${String(index).padStart(4, '0')}`, brand: 'cedargrowth', stage: 'proposal', expectedCloseOn: '2020-01-01', productLine: 'vape', quantityUnits: 9, updatedAt: '2026-11-01T00:00:00.000Z' });
  }
  const recentId = 'n-recent';
  deals.push({ id: recentId, brand: 'cedargrowth', stage: 'proposal', expectedCloseOn: '2026-11-15', productLine: 'vape', quantityUnits: 5, updatedAt: '2026-11-02T00:00:00.000Z' });
  const staleId = 'a-stale';
  deals.push({ id: staleId, brand: 'cedargrowth', stage: 'proposal', expectedCloseOn: '2026-11-20', productLine: 'vape', quantityUnits: 5, updatedAt: '2020-01-01T00:00:00.000Z' });
  const bareId = 'a-bare';
  deals.push({ id: bareId, brand: 'cedargrowth', stage: 'lead', expectedCloseOn: '2020-06-01', productLine: null, quantityUnits: null, updatedAt: '2020-01-02T00:00:00.000Z' });
  for (let index = 0; index < 4; index += 1) {
    const id = `c-won-${index}`;
    deals.push({ id, brand: 'cedargrowth', stage: 'won', expectedCloseOn: '2020-03-01', productLine: 'vape', quantityUnits: 1, updatedAt: '2020-03-01T00:00:00.000Z' });
    events.push({ id: `w${index}`, brand: 'cedargrowth', opportunityId: id, fromStage: 'proposal', toStage: 'proposal', at: `2024-01-0${index + 1}T00:00:00.000Z` });
  }
  const lostId = 'c-lost';
  const newestId = 'z-newest';
  deals.push({ id: lostId, brand: 'cedargrowth', stage: 'lost', expectedCloseOn: '2020-04-01', productLine: 'vape', quantityUnits: 1, updatedAt: '2020-04-01T00:00:00.000Z' });
  events.push({ id: newestId, brand: 'cedargrowth', opportunityId: lostId, fromStage: 'proposal', toStage: 'proposal', at: '2026-11-10T00:00:00.000Z' });
  deals.push({ id: 'bond-open', brand: 'bond', stage: 'proposal', expectedCloseOn: '2026-11-15', productLine: 'vape', quantityUnits: 500, updatedAt: '2026-11-03T00:00:00.000Z' });
  for (let index = 0; index < 5000; index += 1) {
    const at = new Date(Date.UTC(2020, 0, 1) + index * 1000).toISOString();
    events.push({ id: `f${String(index).padStart(5, '0')}`, brand: 'cedargrowth', opportunityId: deals[index % 99].id, fromStage: null, toStage: 'proposal', at });
  }

  const oldest = [...events].sort((left, right) => (left.at < right.at ? -1 : left.at > right.at ? 1 : 0)).slice(0, 5000);
  const newestHundred = [...deals].filter((row) => row.brand === 'cedargrowth').sort((left, right) => (left.updatedAt < right.updatedAt ? 1 : left.updatedAt > right.updatedAt ? -1 : 0)).slice(0, 100);
  const droppedRates = stageWinRates(oldest, newestHundred);
  const droppedForecast = productionForecast({ opportunities: newestHundred, capacity: [], rates: droppedRates, months: ['2026-11-01'] });
  assert(events.length === 5005 && !oldest.some((row) => row.id === newestId) && !newestHundred.some((row) => row.id === staleId), 'the old caps drop the newest stage event and the open deal past the 100 most recently updated');
  const droppedProposal = droppedRates.find((row) => row.stage === 'proposal');
  assert(droppedProposal?.defaulted === true && droppedProposal.rate === 0.6 && droppedForecast.cells[0]?.demand === 5 * droppedProposal.rate && droppedForecast.notForecastable === 0, 'those dropped rows are the ones that change the win rate, the demand, and the not-forecastable count');

  const pages = { opportunities: 0, events: 0 };
  const read = await readForecastInputs('cedargrowth', window, pagingClient(deals, events, 'cedargrowth', window, 2, pages), 2);
  assert(read.state === 'ok', 'paged forecast inputs load');
  if (read.state !== 'ok') return;
  const rates = stageWinRates(read.value.events, read.value.opportunities);
  const forecast = productionForecast({
    opportunities: read.value.opportunities,
    capacity: [{ brand: 'cedargrowth', month: '2026-11-01', productLine: 'vape', capacityUnits: 4 }],
    rates,
    months: ['2026-11-01', '2026-12-01'],
  });
  const proposal = rates.find((row) => row.stage === 'proposal');
  const november = forecast.cells.find((cell) => cell.productLine === 'vape' && cell.month === '2026-11-01');
  assert(pages.opportunities >= 4 && pages.events >= 3, 'deals and events are read across pages instead of one capped query');
  assert(read.value.events.some((row) => row.id === newestId) && read.value.opportunities.some((row) => row.id === staleId) && read.value.opportunities.some((row) => row.id === bareId), 'the newest event, the stale open deal, and the incomplete deal are all present');
  assert(!read.value.opportunities.some((row) => row.brand === 'bond' || row.id.startsWith('n0')), 'Bond rows and complete deals outside the window stay out of the read');
  assert(proposal?.defaulted === false && proposal.rate === 4 / 5 && proposal.closed === 5, 'five closed deals, including the newest event, replace the default win rate');
  assert(november?.demand === 10 * (4 / 5) && november.status === 'short' && forecast.notForecastable === 1 && forecast.cells.find((cell) => cell.month === '2026-12-01' && cell.productLine === 'vape')?.capacityUnits === null, 'both in-window open deals count, and a later month does not invent capacity');

  const failing: ForecastReadClient = {
    opportunityPage(afterId) {
      if (afterId) return Promise.resolve({ data: null, error: { message: 'page failed' } });
      return Promise.resolve({ data: [dealRow(deals.find((row) => row.id === staleId) as Deal)], error: null });
    },
    stageEventProbe: () => Promise.resolve({ data: [], error: null }),
    stageEventPage: () => Promise.resolve({ data: [], error: null }),
  };
  const failed = await readForecastInputs('cedargrowth', window, failing, 1);
  assert(failed.state === 'unavailable', 'a failed later page is not returned as a partial forecast');
  const absent: ForecastReadClient = {
    opportunityPage: (afterId) => Promise.resolve({ data: afterId ? [] : [dealRow({ id: 'only-open', brand: 'cedargrowth', stage: 'proposal', expectedCloseOn: '2026-11-01', productLine: 'vape', quantityUnits: 1, updatedAt: '2026-11-01T00:00:00.000Z' })], error: null }),
    stageEventProbe: () => Promise.resolve({ data: null, error: { code: '42P01', message: 'missing' } } satisfies ForecastPage),
    stageEventPage: () => Promise.resolve({ data: [], error: null }),
  };
  const missing = await readForecastInputs('cedargrowth', window, absent, 1);
  assert(missing.state === 'absent', 'a missing stage-event table is reported instead of a defaulted forecast');

  const today = new Date().toISOString().slice(0, 10);
  const liveMonths = monthStarts(today, 2);
  const liveWindow = monthCloseWindow(liveMonths);
  assert(!!liveWindow, 'the live month window can be built');
  if (!liveWindow) return;
  const liveDeals: Deal[] = deals.map((row) => row.id === staleId || row.id === recentId ? { ...row, expectedCloseOn: liveMonths[0] } : row);
  const livePages = { opportunities: 0, events: 0 };
  const owner = [{ brand: 'cedargrowth' as const, role: 'owner' as const }];
  const store = {
    async listOpportunities(brand: 'cedargrowth' | 'bond') {
      const rows = liveDeals.filter((row) => row.brand === brand).sort((left, right) => (left.updatedAt < right.updatedAt ? 1 : left.updatedAt > right.updatedAt ? -1 : 0)).slice(0, 100);
      return { state: 'ok' as const, value: rows };
    },
    async listForecastInputs(brand: 'cedargrowth' | 'bond', requested: ForecastWindow) {
      return readForecastInputs(brand, requested, pagingClient(liveDeals, events, brand, requested, 2, livePages), 2);
    },
    async listCapacity(brand: 'cedargrowth' | 'bond') {
      return { state: 'ok' as const, value: [{ id: 'cap', brand, month: liveMonths[0], productLine: 'vape' as const, capacityUnits: 10, notes: '' }] };
    },
  };
  const listed = await handleOpportunityCollection({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('/api/admin/crm/opportunities?brand=cedargrowth'), store: store as unknown as CrmStore }, 'GET');
  const listedRows = (listed.body.opportunities as { id?: string }[]) || [];
  const liveForecast = await handleForecast({ actorId: 'gary@cedargrowthco.com', grants: owner, request: crmReq('/api/admin/crm/forecast?brand=cedargrowth&months=2'), store: store as unknown as CrmStore });
  const keys = Object.keys(liveForecast.body).sort();
  const cells = (liveForecast.body.cells as { month: string; productLine: string; demand: number; capacityUnits: number | null; status: string }[]) || [];
  const liveCell = cells.find((cell) => cell.productLine === 'vape' && cell.month === liveMonths[0]);
  const liveRates = (liveForecast.body.rates as { stage: string; rate: number; defaulted: boolean; closed: number }[]) || [];
  const liveProposal = liveRates.find((row) => row.stage === 'proposal');
  assert(listed.status === 200 && listedRows.length === 100 && !listedRows.some((row) => row.id === staleId), 'the pipeline list still returns only the 100 most recently updated deals');
  assert(liveForecast.status === 200 && JSON.stringify(keys) === JSON.stringify(['brand', 'cells', 'configured', 'months', 'notForecastable', 'ok', 'rates', 'shorts'].sort()), 'the legacy forecast response keeps its keys');
  assert(liveForecast.body.months === 2 && liveProposal?.rate === 4 / 5 && liveProposal.defaulted === false && liveCell?.demand === 10 * (4 / 5) && liveCell.capacityUnits === 10 && liveForecast.body.notForecastable === 1 && !cells.some((cell) => 'capacitySource' in cell), 'the legacy forecast counts the stale open deal and the newest stage event');
  assert(livePages.events >= 3, 'the forecast route pages stage events for the closed deals');
}
