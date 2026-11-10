// Synthetic forecast checks. These rows are not account findings.
// Run through scripts/crm-selftest.ts.

import { DEFAULT_WIN_RATES, forecastStatus, isoWeekOf, monthStarts, parseForecastQuery, productionForecast, stageWinRates, weekStarts, weeklyCapacityUnits, weeklyProductionForecast, type CapacityRow, type ForecastOpportunity } from '../src/lib/crm/forecast.ts';

type Assert = (ok: boolean, message: string) => void;

const rates = (['lead', 'qualification', 'licensed_buyer_review', 'proposal', 'won', 'lost'] as const).map((stage) => ({
  stage,
  rate: DEFAULT_WIN_RATES[stage],
  defaulted: stage !== 'won' && stage !== 'lost',
  closed: 0,
}));

function deal(id: string, stage: ForecastOpportunity['stage'], expectedCloseOn: string | null, productLine: ForecastOpportunity['productLine'], quantityUnits: number | null): ForecastOpportunity {
  return { id, brand: 'cedargrowth', stage, expectedCloseOn, productLine, quantityUnits };
}

function cap(month: string, productLine: CapacityRow['productLine'], capacityUnits: number): CapacityRow {
  return { brand: 'cedargrowth', month, productLine, capacityUnits };
}

export function assertForecastPeriods(assert: Assert) {
  const week46 = isoWeekOf('2026-11-09');
  const week46Sunday = isoWeekOf('2026-11-15');
  const week47 = isoWeekOf('2026-11-16');
  const week53Monday = isoWeekOf('2026-12-28');
  const week53Close = isoWeekOf('2026-12-31');
  const week53NewYear = isoWeekOf('2027-01-01');
  const week53Sunday = isoWeekOf('2027-01-03');
  const week01 = isoWeekOf('2027-01-04');
  const opening = isoWeekOf('2025-12-29');
  const newYearDay = isoWeekOf('2026-01-01');
  assert(week46?.isoWeek === '2026-W46' && week46.weekStart === '2026-11-09', '2026-11-09 is Monday of ISO week 2026-W46');
  assert(week46Sunday?.isoWeek === '2026-W46' && week46Sunday.weekStart === '2026-11-09', 'a Sunday stays in the Monday week');
  assert(week47?.isoWeek === '2026-W47' && week47.weekStart === '2026-11-16', 'the next Monday opens 2026-W47');
  assert(week53Monday?.isoWeek === '2026-W53' && week53Monday.weekStart === '2026-12-28', '2026 has a week 53');
  assert(week53Close?.isoWeek === '2026-W53' && week53Close.weekStart === '2026-12-28', '2026-12-31 stays in 2026-W53');
  assert(week53NewYear?.isoWeek === '2026-W53' && week53NewYear.weekStart === '2026-12-28', '2027-01-01 stays in 2026-W53');
  assert(week53Sunday?.isoWeek === '2026-W53' && week53Sunday.weekStart === '2026-12-28', '2027-01-03 is the Sunday of 2026-W53');
  assert(week01?.isoWeek === '2027-W01' && week01.weekStart === '2027-01-04', '2027-01-04 opens 2027-W01');
  assert(opening?.isoWeek === '2026-W01' && opening.weekStart === '2025-12-29', '2025-12-29 opens 2026-W01');
  assert(newYearDay?.isoWeek === '2026-W01' && newYearDay.weekStart === '2025-12-29', '2026-01-01 belongs to 2026-W01');
  assert(isoWeekOf('2026-02-31') === null && isoWeekOf('') === null, 'an impossible date is not a week');

  const horizon = weekStarts('2026-11-09', 13);
  assert(horizon.length === 13 && horizon[0].isoWeek === '2026-W46' && horizon[0].weekStart === '2026-11-09' && horizon[12].isoWeek === '2027-W05' && horizon[12].weekStart === '2027-02-01', 'thirteen weeks run from 2026-W46 through 2027-W05');
  const boundary = weekStarts('2026-12-31', 2);
  assert(boundary[0]?.isoWeek === '2026-W53' && boundary[0].weekStart === '2026-12-28' && boundary[1]?.isoWeek === '2027-W01' && boundary[1].weekStart === '2027-01-04', 'a year-end date starts on 2026-W53 and then 2027-W01');

  const november = [cap('2026-11-01', 'vape', 300)];
  assert(weeklyCapacityUnits('2026-11-16', 'vape', november) === 70, 'a full November week takes 7/30 of the monthly capacity');
  assert(weeklyCapacityUnits('2026-11-16', 'vape', november) !== 300, 'a week does not receive the whole month');
  assert(weeklyCapacityUnits('2026-02-09', 'vape', [cap('2026-02-01', 'vape', 280)]) === 70, 'a February week uses 28 days');
  assert(weeklyCapacityUnits('2026-02-23', 'vape', [cap('2026-02-01', 'vape', 280), cap('2026-03-01', 'vape', 310)]) === 70, 'a week crossing February and March sums both shares');
  assert(weeklyCapacityUnits('2028-02-28', 'vape', [cap('2028-02-01', 'vape', 290), cap('2028-03-01', 'vape', 310)]) === 70, 'a leap-year week counts February 29');

  const cross = [cap('2026-11-01', 'vape', 300), cap('2026-12-01', 'vape', 310)];
  assert(weeklyCapacityUnits('2026-11-30', 'vape', cross) === 70, '2026-W49 takes one November day and six December days');
  assert(weeklyCapacityUnits('2026-11-30', 'vape', [cap('2026-11-01', 'vape', 300)]) === null, 'a cross-month week with only November entered is null');
  assert(weeklyCapacityUnits('2026-11-30', 'vape', [cap('2026-12-01', 'vape', 310)]) === null, 'a cross-month week with only December entered is null');
  assert(weeklyCapacityUnits('2026-11-30', 'vape', []) === null, 'a week with no parent rows is null');
  assert(weeklyCapacityUnits('2026-11-30', 'vape', [cap('2026-11-01', 'vape', 0), cap('2026-12-01', 'preroll', 310)]) === null, 'a zero in one month does not fill a missing month, and another product line does not count');
  assert(weeklyCapacityUnits('2026-11-30', 'vape', [cap('2026-11-01', 'vape', 0), cap('2026-12-01', 'vape', 310)]) === 60, 'an entered zero is a real share and is summed with the other month');
  assert(weeklyCapacityUnits('2026-11-16', 'gummy', [cap('2026-11-01', 'gummy', 0)]) === 0, 'an entered zero inside one month stays zero');
  assert(weeklyCapacityUnits('2026-11-16', 'preroll', november) === null, 'capacity for another product line is not reused');
  assert(weeklyCapacityUnits('2026-12-28', 'vape', [cap('2026-12-01', 'vape', 310), cap('2027-01-01', 'vape', 310)]) === 70, '2026-W53 splits four December days and three January days');
  assert(weeklyCapacityUnits('2026-12-28', 'vape', [cap('2026-12-01', 'vape', 310)]) === null, '2026-W53 is null when January has no row');

  const opportunities = [
    deal('won-nov', 'won', '2026-11-18', 'vape', 50),
    deal('lead-nov', 'lead', '2026-11-20', 'vape', 100),
    deal('next', 'won', '2026-11-30', 'vape', 80),
    deal('lost', 'lost', '2026-11-18', 'vape', 999),
    deal('year-end', 'won', '2026-12-31', 'vape', 40),
    deal('new-year', 'lead', '2027-01-01', 'vape', 100),
    deal('week-one', 'proposal', '2027-01-04', 'vape', 10),
    deal('preroll', 'won', '2026-11-18', 'preroll', 20),
    deal('blank', 'proposal', '2026-11-18', null, null),
    deal('no-date', 'won', null, 'vape', 5),
  ];
  const weekly = weeklyProductionForecast({
    opportunities,
    capacity: [...cross, cap('2026-12-01', 'vape', 310), cap('2027-01-01', 'vape', 310), cap('2026-11-01', 'preroll', 600)],
    rates,
    weeks: [
      { isoWeek: '2026-W47', weekStart: '2026-11-16' },
      { isoWeek: '2026-W49', weekStart: '2026-11-30' },
      { isoWeek: '2026-W53', weekStart: '2026-12-28' },
      { isoWeek: '2027-W01', weekStart: '2027-01-04' },
    ],
  });
  const vape47 = weekly.cells.find((cell) => cell.productLine === 'vape' && cell.isoWeek === '2026-W47');
  const vape49 = weekly.cells.find((cell) => cell.productLine === 'vape' && cell.isoWeek === '2026-W49');
  const vape53 = weekly.cells.find((cell) => cell.productLine === 'vape' && cell.isoWeek === '2026-W53');
  const vape01 = weekly.cells.find((cell) => cell.productLine === 'vape' && cell.isoWeek === '2027-W01');
  const preroll47 = weekly.cells.find((cell) => cell.productLine === 'preroll' && cell.isoWeek === '2026-W47');
  assert(vape47?.demand === 60 && vape47.capacityUnits === 70 && vape47.gap === 10 && vape47.status === 'ok' && vape47.weekStart === '2026-11-16', 'won deals count in full and an open lead keeps its stage weight in the same ISO week');
  assert(vape49?.demand === 80 && vape49.capacityUnits === 70 && vape49.gap === -10 && vape49.status === 'short', 'the next week does not absorb the earlier close date');
  assert(vape53?.demand === 50 && vape53.capacityUnits === 70 && vape53.gap === 20 && vape53.status === 'ok', '2026-12-31 and 2027-01-01 share 2026-W53');
  assert(vape01?.demand === 6 && vape01.isoWeek === '2027-W01' && vape01.weekStart === '2027-01-04', '2027-01-04 is 2027-W01 and a proposal uses the 0.6 weight');
  assert(preroll47?.demand === 20 && preroll47.capacityUnits === 140 && preroll47.gap === 120, 'pre-roll uses its own monthly capacity');
  assert(weekly.notForecastable === 1, 'a deal with no product line or quantity is not forecastable');
  assert(weekly.shorts.some((line) => line.startsWith('Vape is short by 10 units in 2026-W49 (week of 2026-11-30)')), 'a weekly short names the ISO week');

  const filtered = weeklyProductionForecast({
    opportunities,
    capacity: cross,
    rates,
    weeks: [{ isoWeek: '2026-W47', weekStart: '2026-11-16' }],
    productLine: 'preroll',
  });
  assert(filtered.cells.length === 1 && filtered.cells[0].productLine === 'preroll' && filtered.cells[0].demand === 20 && filtered.cells[0].capacityUnits === null && filtered.cells[0].gap === null && filtered.cells[0].status === 'no_capacity', 'a product line filter returns that line only, and a missing row is null');

  const tight = weeklyProductionForecast({
    opportunities: [deal('tight', 'won', '2026-11-18', 'vape', 63)],
    capacity: november,
    rates,
    weeks: [{ isoWeek: '2026-W47', weekStart: '2026-11-16' }],
    productLine: 'vape',
  });
  const okCell = weeklyProductionForecast({
    opportunities: [deal('ok', 'won', '2026-11-18', 'vape', 62)],
    capacity: november,
    rates,
    weeks: [{ isoWeek: '2026-W47', weekStart: '2026-11-16' }],
    productLine: 'vape',
  });
  const equal = weeklyProductionForecast({
    opportunities: [deal('equal', 'won', '2026-11-18', 'vape', 70)],
    capacity: november,
    rates,
    weeks: [{ isoWeek: '2026-W47', weekStart: '2026-11-16' }],
    productLine: 'vape',
  });
  const empty = weeklyProductionForecast({
    opportunities: [],
    capacity: [cap('2026-11-01', 'gummy', 0)],
    rates,
    weeks: [{ isoWeek: '2026-W47', weekStart: '2026-11-16' }],
    productLine: 'gummy',
  });
  assert(tight.cells[0].status === 'tight' && tight.cells[0].gap === 7, 'demand at 90 percent of capacity is tight');
  assert(okCell.cells[0].status === 'ok' && okCell.cells[0].gap === 8, 'demand under 90 percent of capacity is ok');
  assert(equal.cells[0].status === 'tight' && equal.cells[0].gap === 0, 'demand equal to capacity is tight');
  assert(empty.cells[0].capacityUnits === 0 && empty.cells[0].status === 'tight' && empty.cells[0].gap === 0, 'entered zero capacity follows the same threshold');
  assert(forecastStatus(71, 70) === 'short' && forecastStatus(63, 70) === 'tight' && forecastStatus(62, 70) === 'ok' && forecastStatus(0, null) === 'no_capacity', 'status thresholds stay short, tight, ok, and no capacity');

  const monthly = productionForecast({
    opportunities: [
      deal('o1', 'lead', '2026-11-15', 'vape', 100),
      deal('o2', 'won', '2026-11-20', 'vape', 50),
      deal('o3', 'proposal', '2026-11-01', null, null),
    ],
    capacity: [cap('2026-11-01', 'vape', 40)],
    rates,
    months: ['2026-11-01'],
  });
  const vapeMonth = monthly.cells.find((cell) => cell.productLine === 'vape');
  const gummyMonth = monthly.cells.find((cell) => cell.productLine === 'gummy');
  assert(monthly.cells.length === 4 && vapeMonth?.demand === 60 && vapeMonth.capacityUnits === 40 && vapeMonth.gap === -20 && vapeMonth.status === 'short' && vapeMonth.month === '2026-11-01' && !('isoWeek' in vapeMonth), 'the monthly cell keeps month, demand, capacity, gap, and status');
  assert(gummyMonth?.status === 'no_capacity' && gummyMonth.capacityUnits === null && gummyMonth.gap === null && monthly.notForecastable === 1, 'missing monthly capacity stays null and is not zero');
  assert(monthly.shorts[0] === 'Vape is short by 20 units in Nov 26 (demand 60, capacity 40).', 'the monthly short sentence stays the same');
  const yearMonths = monthStarts('2026-11-10', 12);
  assert(yearMonths.length === 12 && yearMonths[0] === '2026-11-01' && yearMonths[11] === '2027-10-01', 'twelve months start at the current month and are not a fiscal year');
  const vapeOnly = productionForecast({
    opportunities: [
      deal('o1', 'lead', '2026-11-15', 'vape', 100),
      deal('o2', 'won', '2026-11-20', 'vape', 50),
    ],
    capacity: [cap('2026-11-01', 'vape', 40), cap('2026-11-01', 'gummy', 10)],
    rates,
    months: ['2026-11-01', '2026-12-01'],
    productLine: 'vape',
  });
  assert(vapeOnly.cells.length === 2 && vapeOnly.cells.every((cell) => cell.productLine === 'vape') && vapeOnly.cells[1].capacityUnits === null && vapeOnly.cells[1].gap === null, 'a monthly product line filter does not borrow another line or invent December capacity');

  const learned = stageWinRates([], []);
  assert(learned.find((row) => row.stage === 'lead')?.rate === 0.1, 'default rates remain available to both periods');

  const absent = parseForecastQuery(new URLSearchParams());
  const monthOnly = parseForecastQuery(new URLSearchParams('months=6'));
  const year = parseForecastQuery(new URLSearchParams('months=12&productLine=preroll'));
  const week = parseForecastQuery(new URLSearchParams('period=week&weeks=13&productLine=vape&months=2'));
  const weekDefault = parseForecastQuery(new URLSearchParams('period=week'));
  const badWeeks = parseForecastQuery(new URLSearchParams('period=week&weeks=54'));
  const badMonths = parseForecastQuery(new URLSearchParams('months=25'));
  const badPeriod = parseForecastQuery(new URLSearchParams('period=year'));
  const badLine = parseForecastQuery(new URLSearchParams('productLine=flower'));
  const blankLine = parseForecastQuery(new URLSearchParams('productLine='));
  assert(absent.ok && absent.period === 'month' && absent.months === 6 && absent.productLine === null, 'an empty query stays a six month forecast');
  assert(monthOnly.ok && monthOnly.period === 'month' && monthOnly.months === 6 && monthOnly.productLine === null, 'months without period stays monthly');
  assert(year.ok && year.period === 'month' && year.months === 12 && year.productLine === 'preroll', 'a year view reuses months=12 for one product line');
  assert(week.ok && week.period === 'week' && week.weeks === 13 && week.productLine === 'vape', 'week view uses weeks and ignores months');
  assert(weekDefault.ok && weekDefault.period === 'week' && weekDefault.weeks === 13, 'weeks defaults to 13');
  assert(badWeeks.ok && badWeeks.period === 'week' && badWeeks.weeks === 13, 'an out-of-range weeks value falls back to 13');
  assert(badMonths.ok && badMonths.period === 'month' && badMonths.months === 6, 'an out-of-range months value falls back to 6');
  assert(!badPeriod.ok && badPeriod.reason === 'Period must be month or week.', 'year is not its own period');
  assert(!badLine.ok && badLine.reason === 'Product line is not recognized.', 'an unknown product line is rejected');
  assert(blankLine.ok && blankLine.productLine === null, 'an empty product line means every line');
}
