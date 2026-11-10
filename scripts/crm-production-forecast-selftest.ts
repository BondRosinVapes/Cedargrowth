import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LineDashboard, SpanControl, WeeklyOverview, YearWindow } from '../src/app/admin/crm/ProductionForecast.tsx';
import {
  FORECAST_UNREADABLE,
  NO_CAPACITY,
  WEEKLY_PENDING,
  buildMonthlyBoard,
  buildWeeklyBoard,
  coversYearWindow,
  echoedFrom,
  forecastPath,
  loadMonthlyForecast,
  loadWeeklyForecast,
  parseMonthlyForecast,
  parseWeeklyForecast,
  roundCapacityUnits,
  selectSpan,
  shiftMonth,
  yearWindowCaption,
  type MonthlyForecastCell,
} from '../src/lib/crm/forecastClient.ts';

const monthlyBody = {
  ok: true,
  configured: true,
  brand: 'cedargrowth',
  period: 'month',
  months: 1,
  productLine: null,
  cells: [
    { month: '2026-11-01', productLine: 'vape', demand: 60, capacityUnits: 40, gap: -20, status: 'short' },
    { month: '2026-11-01', productLine: 'preroll', demand: 0, capacityUnits: null, gap: null, status: 'no_capacity' },
  ],
  notForecastable: 1,
  shorts: ['Vape is short by 20 units in Nov 26 (demand 60, capacity 40).'],
};

const weeklyBody = {
  ok: true,
  configured: true,
  brand: 'cedargrowth',
  period: 'week',
  weeks: 2,
  productLine: 'vape',
  cells: [
    { isoWeek: '2026-W47', weekStart: '2026-11-16', productLine: 'vape', demand: 60, capacityUnits: 70.4, gap: 10.4, status: 'ok' },
    { isoWeek: '2026-W49', weekStart: '2026-11-30', productLine: 'vape', demand: 80, capacityUnits: null, gap: null, status: 'no_capacity' },
  ],
  notForecastable: 1,
};

function monthCell(month: string, capacityUnits: number | null): MonthlyForecastCell {
  return {
    month,
    productLine: 'vape',
    demand: 12,
    capacityUnits,
    gap: capacityUnits === null ? null : capacityUnits - 12,
    status: capacityUnits === null ? 'no_capacity' : 'ok',
  };
}

export async function assertProductionForecast(assert: (ok: boolean, message: string) => void) {
  const weekOverview = forecastPath('cedargrowth', 'week', null);
  const weekLine = forecastPath('bond', 'week', 'preroll');
  const monthLine = forecastPath('cedargrowth', 'month', 'gummy');
  const yearLine = forecastPath('cedargrowth', 'year', 'other');
  const yearFrom = forecastPath('cedargrowth', 'year', 'vape', '2026-08-01');
  assert(
    weekOverview === '/api/admin/crm/forecast?brand=cedargrowth&period=week&weeks=13'
    && weekLine === '/api/admin/crm/forecast?brand=bond&period=week&weeks=13&productLine=preroll'
    && monthLine === '/api/admin/crm/forecast?brand=cedargrowth&period=month&months=6&productLine=gummy'
    && yearLine === '/api/admin/crm/forecast?brand=cedargrowth&period=month&months=12&productLine=other'
    && yearFrom === '/api/admin/crm/forecast?brand=cedargrowth&period=month&months=12&from=2026-08-01&productLine=vape'
    && yearLine.includes('period=year') === false
    && monthLine.includes('months=6')
    && weekOverview.includes('period=week'),
    'forecast queries send period, and year paging sends from',
  );
  assert(shiftMonth('2026-11-01', -3) === '2026-08-01' && shiftMonth('2026-11-01', 3) === '2027-02-01' && yearWindowCaption('2026-08-01') === 'Aug 26 to Jul 27' && coversYearWindow(['2026-11-01'], '2026-08-01') === false, 'the year window steps three months and names its range');

  assert(parseWeeklyForecast(monthlyBody) === null, 'a monthly payload is not a weekly forecast');
  assert(parseWeeklyForecast({ ...weeklyBody, period: 'month' }) === null, 'a week request that comes back without period week stays pending');
  assert(parseWeeklyForecast({ period: 'week', cells: [] }) === null, 'a week payload with no isoWeek cells stays pending');
  const parsedWeek = parseWeeklyForecast(weeklyBody);
  const parsedMonth = parseMonthlyForecast(monthlyBody);
  assert(!!parsedWeek && parsedWeek.cells[0].capacityUnits === 70.4 && parsedWeek.cells[1].capacityUnits === null && parsedWeek.cells[0].isoWeek === '2026-W47', 'weekly cells keep a fractional capacity and a null capacity');
  assert(!!parsedMonth && parsedMonth.cells[1].capacityUnits === null && parsedMonth.cells[1].status === 'no_capacity', 'monthly null capacity stays null');
  assert(roundCapacityUnits(70.4) === 70 && roundCapacityUnits(null) === null && roundCapacityUnits(0) === 0, 'weekly capacity rounds in the UI and null does not become zero');

  const rounded = buildWeeklyBoard(parsedWeek?.cells ?? [], 'vape');
  assert(rounded.columns[0].capacityUnits === 70 && rounded.columns[0].gap === 10 && rounded.columns[1].capacityUnits === null && rounded.lines[0].points[1].capacityUnits === null, 'the weekly board rounds capacity and leaves a blank week null');

  let requested = '';
  const pending = await loadWeeklyForecast('cedargrowth', null, async (url) => {
    requested = url;
    return new Response(JSON.stringify(monthlyBody), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  const ready = await loadWeeklyForecast('cedargrowth', 'vape', async () => new Response(JSON.stringify(weeklyBody), { status: 200, headers: { 'content-type': 'application/json' } }));
  assert(pending.state === 'pending' && requested.endsWith('period=week&weeks=13') && ready.state === 'ready' && ready.cells[1].capacityUnits === null, 'a body without isoWeek cells stays pending and a weekly body is kept');
  const rejected = await loadWeeklyForecast('cedargrowth', 'vape', async () => new Response(JSON.stringify({ reason: 'Weeks must be a whole number.' }), { status: 400, headers: { 'content-type': 'application/json' } }));
  const monthRejected = await loadMonthlyForecast('cedargrowth', 6, 'vape', async () => new Response(JSON.stringify({ reason: 'From must be the first of a month.' }), { status: 400, headers: { 'content-type': 'application/json' } }));
  const silent = { ok: true, period: 'month', months: 12, cells: [{ month: '2026-11-01', productLine: 'vape', demand: 1, capacityUnits: 2, gap: 1, status: 'ok' }] };
  const echoed = { ...silent, from: '2026-08-01' };
  assert(rejected.state === 'error' && rejected.reason === FORECAST_UNREADABLE && monthRejected.state === 'error' && monthRejected.reason === FORECAST_UNREADABLE, 'a 400 is a quiet forecast failure');
  assert(echoedFrom(silent, '2026-08-01') === false && echoedFrom(echoed, '2026-08-01') === true, 'paging stays off unless the response echoes from');

  const blank = buildWeeklyBoard([
    { isoWeek: '2020-W02', weekStart: '2020-01-06', productLine: 'vape', demand: 12, capacityUnits: null, gap: null, status: 'no_capacity' },
  ], 'vape');
  const blankHtml = renderToStaticMarkup(createElement(WeeklyOverview, {
    brand: 'cedargrowth',
    view: { state: 'ready', board: blank, notForecastable: 0 },
    canEdit: true,
    onChanged: () => {},
    onOpenLine: () => {},
  }));
  assert(
    blankHtml.includes(NO_CAPACITY)
    && blankHtml.includes('data-capacity="none"')
    && blankHtml.includes('data-capacity="0"') === false
    && blankHtml.includes('name="capacityUnits"')
    && blankHtml.includes('Save capacity')
    && blankHtml.includes('href="/admin/crm?section=production&amp;brand=cedargrowth&amp;line=vape"')
    && blankHtml.includes('960 / 560')
    && blankHtml.includes('md:hidden')
    && blankHtml.includes('md:grid'),
    'a blank capacity renders No capacity entered, and the capacity form still saves',
  );

  const zero = buildWeeklyBoard([
    { isoWeek: '2020-W02', weekStart: '2020-01-06', productLine: 'vape', demand: 12, capacityUnits: 0, gap: -12, status: 'short' },
  ], 'vape');
  const zeroHtml = renderToStaticMarkup(createElement(WeeklyOverview, {
    brand: 'cedargrowth',
    view: { state: 'ready', board: zero, notForecastable: 0 },
    canEdit: false,
    onChanged: () => {},
    onOpenLine: () => {},
  }));
  assert(zeroHtml.includes('data-capacity="0"') && zero.columns[0].capacityUnits === 0, 'an entered capacity of zero stays zero');

  const coming = renderToStaticMarkup(createElement(LineDashboard, {
    brand: 'cedargrowth',
    line: 'vape',
    span: 'week',
    view: { state: 'pending' },
    onSpan: () => {},
    onBack: () => {},
  }));
  assert(selectSpan('week', 'ArrowRight') === 'month' && selectSpan('month', 'ArrowRight') === 'year' && selectSpan('year', 'ArrowLeft') === 'month' && coming.includes(WEEKLY_PENDING) && coming.includes('aria-checked="true"') && coming.includes('>Week<') && coming.includes('W47') === false, 'the week toggle shows the quiet weekly state and does not invent weeks');

  const months = ['2020-01-01', '2020-02-01', '2020-03-01', '2020-04-01', '2020-05-01', '2020-06-01'];
  const monthBoard = buildMonthlyBoard(months.map((month, index) => monthCell(month, index === 0 ? null : 18)), 'vape');
  const monthHtml = renderToStaticMarkup(createElement(LineDashboard, {
    brand: 'cedargrowth',
    line: 'vape',
    span: 'month',
    view: { state: 'ready', board: monthBoard, notForecastable: 0 },
    onSpan: () => {},
    onBack: () => {},
  }));
  const yearMonths = Array.from({ length: 12 }, (_, index) => `2020-${String(index + 1).padStart(2, '0')}-01`);
  const yearBoard = buildMonthlyBoard(yearMonths.map((month, index) => monthCell(month, index === 3 ? null : 18)), 'vape');
  const yearHtml = renderToStaticMarkup(createElement(LineDashboard, {
    brand: 'cedargrowth',
    line: 'gummy',
    span: 'year',
    view: { state: 'ready', board: yearBoard, notForecastable: 0 },
    onSpan: () => {},
    onBack: () => {},
  }));
  const weekPressed = renderToStaticMarkup(createElement(SpanControl, { span: 'week', onSpan: () => {} }));
  const monthPressed = renderToStaticMarkup(createElement(SpanControl, { span: 'month', onSpan: () => {} }));
  const yearPressed = renderToStaticMarkup(createElement(SpanControl, { span: 'year', onSpan: () => {} }));
  assert(
    monthHtml.includes('aria-checked="true"')
    && monthHtml.includes('>Month<')
    && monthHtml.includes(WEEKLY_PENDING) === false
    && monthHtml.includes(NO_CAPACITY)
    && monthHtml.includes('Jan 20')
    && monthHtml.includes('Jun 20')
    && monthHtml.includes('Dec 20') === false
    && yearHtml.includes('>Year<')
    && yearHtml.includes('Jan 20')
    && yearHtml.includes('Dec 20')
    && yearHtml.includes(NO_CAPACITY)
    && weekPressed.includes('aria-checked="true"')
    && monthPressed.indexOf('aria-checked="true"') > weekPressed.length - weekPressed.length
    && yearPressed.includes('>Year<'),
    'the range toggle moves between 13 weeks, 6 months, and 12 months',
  );
  assert(monthPressed.includes('aria-checked="true"') && (monthPressed.match(/aria-checked="true"/g) || []).length === 1 && monthPressed.includes('>Month<'), 'only the selected range is pressed');

  const extendedCells: MonthlyForecastCell[] = [
    { month: '2020-01-01', productLine: 'vape', demand: 12, capacityUnits: 40, gap: 28, status: 'ok', capacitySource: 'entered' },
    { month: '2020-02-01', productLine: 'vape', demand: 12, capacityUnits: 40, gap: 28, status: 'ok', capacitySource: 'extended' },
    { month: '2020-03-01', productLine: 'vape', demand: 12, capacityUnits: null, gap: null, status: 'no_capacity' },
  ];
  const extended = buildMonthlyBoard(extendedCells, 'vape');
  const extendedHtml = renderToStaticMarkup(createElement(LineDashboard, {
    brand: 'cedargrowth',
    line: 'vape',
    span: 'month',
    view: { state: 'ready', board: extended, notForecastable: 0 },
    onSpan: () => {},
    onBack: () => {},
  }));
  assert(extended.columns[1].capacityUnits === 40 && extended.columns[1].capacitySource === 'extended' && extended.columns[1].carriedFrom === '2020-01-01' && extended.columns[2].capacityUnits === null, 'extended capacity keeps its number and a blank with no earlier entry stays null');
  assert(extendedHtml.includes('ext.') && extendedHtml.includes('Carried forward from Jan 20') && extendedHtml.includes(NO_CAPACITY) && extendedHtml.includes('stroke-dasharray="2 7"'), 'extended capacity shows ext. and a dotted segment, and a true blank stays No capacity entered');

  const older = renderToStaticMarkup(createElement(YearWindow, { from: '2026-08-01', canPrev: false, canNext: true, onShift: () => {} }));
  assert(older.includes('← 3 months') && older.includes('3 months →') && older.includes('Aug 26 to Jul 27') && (older.match(/disabled=""/g) || []).length === 1, 'year paging uses square mono controls and can disable one direction');
}
