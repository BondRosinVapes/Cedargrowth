// Weekly digest. Pure shaping of CRM rows. No fetch, no email send, no storage.
// 7B next actions and 6C Hoodie rows are placeholders and stay empty.

import { timingSafeEqual } from 'node:crypto';
import { CRM_HREF, OPEN_STAGES, formatForecast, type CrmBrand, type OpportunityStage } from './engine';
import { buildDashboard, type DashboardAccountRow, type DashboardFilter, type DashboardOpportunityRow, type DashboardTaskRow } from './dashboard';
import type { StageEvent } from './store';

const NY = 'America/New_York';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const EMPTY_FILTER: DashboardFilter = {
  year: null, month: null, rep: null, region: null, accountType: null, leadSource: null, stage: null, status: null,
};

export type DigestVisit = { brand: CrmBrand; repActor: string; checkedInAt: string };
export type DigestOrder = {
  brand: CrmBrand;
  distributor: string;
  orderStatus: string;
  orderedOn: string | null;
  deliveredOn: string | null;
  invoiceCents: number | null;
  retailerPaymentStatus: string;
  payoutStatus: string;
  payoutCents: number | null;
  payoutOn: string | null;
  importedAt: string;
  retailerName: string;
};
export type DigestContact = { brand: CrmBrand; name: string; email: string | null; phone: string | null; preference: string };

export type CountChange = { current: number; prior: number };

export type DigestModel = {
  brand: CrmBrand;
  weekKey: string;
  weekLabel: string;
  priorLabel: string;
  href: string;
  newAccounts: CountChange;
  newDeals: CountChange;
  won: CountChange;
  lost: CountChange;
  openPipelineCents: number | null;
  winRate: number | null;
  shorts: string[];
  distributorLabel: string;
  delivered: number | null;
  invoicedCents: number | null;
  unpaidPast30: number | null;
  payoutCents: number | null;
  reps: { rep: string; visits: number; sampleFollowUps: number; overdueTasks: number; pastClose: number; nextActions: readonly string[] }[];
  hoodie: readonly never[];
};

export type NyWeek = {
  key: string;
  label: string;
  priorLabel: string;
  startMs: number;
  endMs: number;
  priorStartMs: number;
  today: string;
  monday: string;
  sunday: string;
  priorMonday: string;
  priorSunday: string;
};

function nyParts(ms: number): { year: number; month: number; day: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: NY, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), weekday: WEEKDAYS[parts.weekday] ?? 0 };
}

function zoneOffset(ms: number): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: NY, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
  const hour = parts.hour === '24' ? 0 : Number(parts.hour);
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour, Number(parts.minute), Number(parts.second));
  return asUtc - ms;
}

function nyMidnight(year: number, month: number, day: number): number {
  const guess = Date.UTC(year, month - 1, day);
  const first = guess - zoneOffset(guess);
  return guess - zoneOffset(first);
}

function shiftDate(year: number, month: number, day: number, days: number): { year: number; month: number; day: number } {
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function rangeLabel(start: { year: number; month: number; day: number }, end: { year: number; month: number; day: number }): string {
  const left = `${MONTHS[start.month - 1]} ${start.day}`;
  const right = start.month === end.month && start.year === end.year
    ? `${end.day}, ${end.year}`
    : `${MONTHS[end.month - 1]} ${end.day}, ${end.year}`;
  return start.year === end.year && start.month !== end.month ? `${left} to ${right}` : `${left} to ${right}`;
}

export function nyWeek(nowMs: number): NyWeek {
  const today = nyParts(nowMs);
  const sinceMonday = today.weekday === 0 ? 6 : today.weekday - 1;
  const monday = shiftDate(today.year, today.month, today.day, -sinceMonday);
  const sunday = shiftDate(monday.year, monday.month, monday.day, 6);
  const priorMonday = shiftDate(monday.year, monday.month, monday.day, -7);
  const priorSunday = shiftDate(monday.year, monday.month, monday.day, -1);
  const startMs = nyMidnight(monday.year, monday.month, monday.day);
  return {
    key: isoDate(monday.year, monday.month, monday.day),
    label: rangeLabel(monday, sunday),
    priorLabel: rangeLabel(priorMonday, priorSunday),
    startMs,
    endMs: nyMidnight(sunday.year, sunday.month, sunday.day + 1),
    priorStartMs: nyMidnight(priorMonday.year, priorMonday.month, priorMonday.day),
    today: isoDate(today.year, today.month, today.day),
    monday: isoDate(monday.year, monday.month, monday.day),
    sunday: isoDate(sunday.year, sunday.month, sunday.day),
    priorMonday: isoDate(priorMonday.year, priorMonday.month, priorMonday.day),
    priorSunday: isoDate(priorSunday.year, priorSunday.month, priorSunday.day),
  };
}

function inSpan(iso: string | null | undefined, startMs: number, endMs: number): boolean {
  if (!iso) return false;
  const at = Date.parse(iso);
  return Number.isFinite(at) && at >= startMs && at < endMs;
}

function onDays(day: string | null | undefined, start: string, end: string): boolean {
  return !!day && day >= start && day <= end;
}

export function digestSummary(weekKey: string): string {
  return `Digest sent for ${weekKey}`;
}

export function secretMatches(header: string | null, secret: string | undefined): boolean {
  if (!header || !secret) return false;
  const left = Buffer.from(header);
  const right = Buffer.from(secret);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function digestRecipients(brand: CrmBrand): string[] {
  const raw = brand === 'bond' ? process.env.CRM_DIGEST_TO_BOND : process.env.CRM_DIGEST_TO;
  return (raw || '').split(',').map((item) => item.trim()).filter((item) => item.length > 0);
}

export function digestFromAddress(): string | null {
  return process.env.CRM_DIGEST_FROM || process.env.RESERVATION_ALERT_FROM || null;
}

export function digestConfigured(brand: CrmBrand): boolean {
  return Boolean(process.env.RESEND_API_KEY && digestFromAddress() && digestRecipients(brand).length > 0);
}

/** Placeholder until 7B ships. Returns no rows and no sample actions. */
export function nextBestActions(_rep: string): readonly string[] {
  return [];
}

/** 6C is not built. Returns no rows. */
export function hoodieSignals(): readonly never[] {
  return [];
}

function countNew(rows: readonly { createdAt?: string }[], startMs: number, endMs: number): number {
  return rows.filter((row) => inSpan(row.createdAt, startMs, endMs)).length;
}

function countStage(events: readonly StageEvent[], brand: CrmBrand, stage: OpportunityStage, startMs: number, endMs: number): number {
  return events.filter((row) => row.brand === brand && row.toStage === stage && row.fromStage !== null && inSpan(row.at, startMs, endMs)).length;
}

function countCreated(events: readonly StageEvent[], brand: CrmBrand, startMs: number, endMs: number, opportunities: readonly { id?: string; createdAt?: string; brand: CrmBrand }[]): number {
  const fromDates = opportunities.filter((row) => row.brand === brand && inSpan(row.createdAt, startMs, endMs)).length;
  if (fromDates > 0) return fromDates;
  return events.filter((row) => row.brand === brand && row.fromStage === null && inSpan(row.at, startMs, endMs)).length;
}

function moneyOrData(cents: number | null, labeled: string): string {
  return cents === null ? 'no data yet' : labeled;
}

export function buildDigest(input: {
  brand: CrmBrand;
  nowMs: number;
  accounts: readonly (DashboardAccountRow & { createdAt?: string })[];
  opportunities: readonly (DashboardOpportunityRow & { createdAt?: string })[];
  tasks: readonly (DashboardTaskRow & { ownerActor?: string | null; title?: string })[];
  activity?: readonly { brand: CrmBrand; createdAt: string }[];
  notes?: readonly { brand: CrmBrand; accountId: string; createdAt: string }[];
  visits?: readonly DigestVisit[];
  orders?: readonly DigestOrder[];
  events?: readonly StageEvent[];
  contacts?: readonly DigestContact[];
  shorts?: readonly string[];
}): DigestModel {
  const week = nyWeek(input.nowMs);
  const brand = input.brand;
  const accounts = input.accounts.filter((row) => row.brand === brand);
  const opportunities = input.opportunities.filter((row) => row.brand === brand);
  const tasks = input.tasks.filter((row) => row.brand === brand);
  const events = (input.events ?? []).filter((row) => row.brand === brand);
  const visits = (input.visits ?? []).filter((row) => row.brand === brand);
  const orders = (input.orders ?? []).filter((row) => row.brand === brand && row.distributor === 'nabis');
  const dashboard = buildDashboard({
    brand,
    today: week.today,
    filter: EMPTY_FILTER,
    accounts,
    opportunities,
    tasks,
    activity: (input.activity ?? []).filter((row) => row.brand === brand),
    notes: input.notes,
    visits,
  });
  const open = dashboard.byStatus.find((row) => row.key === 'open');
  const imported = orders.filter((row) => inSpan(row.importedAt, week.startMs, week.endMs));
  const hasImport = imported.length > 0;
  const latest = [...imported].sort((a, b) => (a.importedAt < b.importedAt ? 1 : -1))[0];
  const importDay = latest ? nyWeek(Date.parse(latest.importedAt)).today : week.today;
  const [importYear, importMonth, importDate] = importDay.split('-').map(Number);
  const invoicedRows = orders.filter((row) => onDays(row.orderedOn, week.monday, week.sunday));
  const invoiceKnown = invoicedRows.map((row) => row.invoiceCents).filter((value): value is number => typeof value === 'number');
  const payoutKnown = orders.filter((row) => row.payoutStatus === 'paid' && onDays(row.payoutOn, week.monday, week.sunday)).map((row) => row.payoutCents).filter((value): value is number => typeof value === 'number');
  const cutoff = shiftDate(Number(week.today.slice(0, 4)), Number(week.today.slice(5, 7)), Number(week.today.slice(8, 10)), -30);
  const cutoffIso = isoDate(cutoff.year, cutoff.month, cutoff.day);
  const reps = new Map<string, DigestModel['reps'][number]>();
  const slot = (name: string) => {
    const key = name.trim() || 'Unassigned';
    const found = reps.get(key);
    if (found) return found;
    const row = { rep: key, visits: 0, sampleFollowUps: 0, overdueTasks: 0, pastClose: 0, nextActions: nextBestActions(key) };
    reps.set(key, row);
    return row;
  };
  for (const account of accounts) if (account.assignedRep) slot(account.assignedRep);
  for (const visit of visits) {
    if (!inSpan(visit.checkedInAt, week.startMs, week.endMs)) continue;
    slot(visit.repActor).visits += 1;
  }
  for (const task of tasks) {
    const owner = task.ownerActor || 'Unassigned';
    if (task.status === 'open' && task.dueOn && task.dueOn < week.today) slot(owner).overdueTasks += 1;
    if (task.status === 'open' && (task.title || '').startsWith('Follow up on samples at ') && onDays(task.dueOn, week.monday, week.sunday)) slot(owner).sampleFollowUps += 1;
  }
  const accountById = new Map(accounts.map((row) => [row.id, row]));
  for (const deal of opportunities) {
    if (!OPEN_STAGES.includes(deal.stage) || !deal.expectedCloseOn || deal.expectedCloseOn >= week.today) continue;
    slot(accountById.get(deal.accountId)?.assignedRep || 'Unassigned').pastClose += 1;
  }
  void input.contacts;
  return {
    brand,
    weekKey: week.key,
    weekLabel: week.label,
    priorLabel: week.priorLabel,
    href: CRM_HREF,
    newAccounts: {
      current: countNew(accounts, week.startMs, week.endMs),
      prior: countNew(accounts, week.priorStartMs, week.startMs),
    },
    newDeals: {
      current: countCreated(events, brand, week.startMs, week.endMs, opportunities),
      prior: countCreated(events, brand, week.priorStartMs, week.startMs, opportunities),
    },
    won: {
      current: countStage(events, brand, 'won', week.startMs, week.endMs),
      prior: countStage(events, brand, 'won', week.priorStartMs, week.startMs),
    },
    lost: {
      current: countStage(events, brand, 'lost', week.startMs, week.endMs),
      prior: countStage(events, brand, 'lost', week.priorStartMs, week.startMs),
    },
    openPipelineCents: open?.cents ?? null,
    winRate: dashboard.kpis.winRate,
    shorts: [...(input.shorts ?? [])],
    distributorLabel: hasImport ? `From Nabis export, ${MONTHS[importMonth - 1]} ${importDate}, ${importYear}` : 'No Nabis data imported this week.',
    delivered: hasImport ? orders.filter((row) => row.orderStatus === 'delivered' && (row.deliveredOn ? onDays(row.deliveredOn, week.monday, week.sunday) : onDays(row.orderedOn, week.monday, week.sunday))).length : null,
    invoicedCents: hasImport ? (invoiceKnown.length ? invoiceKnown.reduce((sum, value) => sum + value, 0) : null) : null,
    unpaidPast30: hasImport ? orders.filter((row) => (row.retailerPaymentStatus === 'unpaid' || row.retailerPaymentStatus === 'partial') && !!row.orderedOn && row.orderedOn < cutoffIso && row.orderStatus !== 'cancelled' && row.orderStatus !== 'returned').length : null,
    payoutCents: hasImport ? (payoutKnown.length ? payoutKnown.reduce((sum, value) => sum + value, 0) : null) : null,
    reps: [...reps.values()].filter((row) => row.visits || row.sampleFollowUps || row.overdueTasks || row.pastClose || row.rep !== 'Unassigned').sort((a, b) => a.rep.localeCompare(b.rep)),
    hoodie: hoodieSignals(),
  };
}

function changeLabel(row: CountChange): string {
  const delta = row.current - row.prior;
  if (delta === 0) return 'no change';
  return delta > 0 ? `up ${delta}` : `down ${Math.abs(delta)}`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function dollars(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function renderDigestText(model: DigestModel): string {
  const brand = model.brand === 'bond' ? 'Bond' : 'CedarGrowth';
  const lines = [
    `${brand} weekly digest`,
    model.weekLabel,
    `Prior week ${model.priorLabel}`,
    '',
    `New accounts: ${model.newAccounts.current} (${changeLabel(model.newAccounts)} versus the prior week)`,
    `New deals: ${model.newDeals.current} (${changeLabel(model.newDeals)} versus the prior week)`,
    `Deals won: ${model.won.current} (${changeLabel(model.won)} versus the prior week)`,
    `Deals lost: ${model.lost.current} (${changeLabel(model.lost)} versus the prior week)`,
    `Open pipeline: ${formatForecast(model.openPipelineCents)}`,
    `Win rate: ${model.winRate === null ? 'None yet' : `${(model.winRate * 100).toFixed(1)}%`}`,
    '',
    'Production forecast',
    ...(model.shorts.length ? model.shorts : ['No production shortfall in the forecast window.']),
    '',
    'Distributor',
    model.distributorLabel,
    `Orders delivered: ${model.delivered === null ? 'no data yet' : String(model.delivered)}`,
    `Invoiced this week: ${moneyOrData(model.invoicedCents, model.invoicedCents === null ? '' : dollars(model.invoicedCents))}`,
    `Retailer invoices unpaid past 30 days: ${model.unpaidPast30 === null ? 'no data yet' : String(model.unpaidPast30)}`,
    `Payout received: ${moneyOrData(model.payoutCents, model.payoutCents === null ? '' : dollars(model.payoutCents))}`,
    '',
    'Reps',
    ...(model.reps.length ? model.reps.flatMap((rep) => [
      rep.rep,
      `Visits logged: ${rep.visits}`,
      `Sample follow ups due: ${rep.sampleFollowUps}`,
      `Overdue tasks: ${rep.overdueTasks}`,
      `Deals past their close date: ${rep.pastClose}`,
      rep.nextActions.length ? `Next actions: ${rep.nextActions.join('; ')}` : 'Next actions: none yet',
    ]) : ['No rep activity this week.']),
    '',
    'Hoodie: not connected.',
    `Dashboard: ${model.href}`,
  ];
  return lines.join('\n');
}

export function renderDigestHtml(model: DigestModel): string {
  const text = renderDigestText(model).split('\n');
  const body = text.map((line) => line === '' ? '<tr><td style="height:12px"></td></tr>' : `<tr><td style="padding:2px 0;font-family:system-ui,sans-serif;font-size:16px;line-height:1.4;color:rgb(28,27,25)">${escapeHtml(line)}</td></tr>`).join('');
  const brand = model.brand === 'bond' ? 'Bond' : 'CedarGrowth';
  return `<!doctype html><html lang="en"><body style="margin:0;background:rgb(255,255,255);color:rgb(28,27,25)">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:rgb(255,255,255)"><tr><td align="center">`
    + `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:rgb(255,255,255)">`
    + `<tr><td style="padding:24px;border-bottom:1px solid rgb(216,209,198);font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.2;color:rgb(28,27,25)">${escapeHtml(brand)} weekly digest</td></tr>`
    + `<tr><td style="padding:24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${body}</table></td></tr>`
    + `</table></td></tr></table></body></html>`;
}
