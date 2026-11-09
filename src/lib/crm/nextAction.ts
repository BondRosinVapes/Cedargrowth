// Ranked next actions for one rep. Missing sources are listed, not treated as zero.
// Hoodie (6C) is not connected.

import { CRM_HREF, OPEN_STAGES } from './engine';
import { regionForCounty } from './nyRegions';

export type ActionAccount = {
  id: string;
  brand: string;
  displayName: string;
  status: string;
  county: string | null;
  assignedRep: string | null;
  licenseExpiry: string | null;
  recordMarker?: 'test' | null;
};

export type ActionTask = { id: string; brand: string; accountId: string | null; title: string; status: string; dueOn: string | null; ownerActor: string | null };
export type ActionDeal = { id: string; brand: string; accountId: string; name: string; stage: string; expectedCloseOn: string | null };
export type ActionNote = { brand: string; accountId: string; createdAt: string };
export type ActionVisit = { brand: string; accountId: string; checkedInAt: string };
export type ActionEvent = { brand: string; opportunityId: string; at: string };
export type ActionOrder = {
  brand: string;
  accountId: string | null;
  distributor: string;
  orderStatus: string;
  deliveredOn: string | null;
  orderedOn: string | null;
  retailerPaymentStatus: string;
};
export type ActionTerritory = { brand: string; region: string; repActor: string };
export type ActionDismissal = { brand: string; repActor: string; actionKey: string; until: string };

export type NextAction = { key: string; rule: number; rep: string; reason: string; href: string };
export type InactiveRule = { title: string; reason: string };

const SAMPLE_PREFIX = 'Follow up on samples at ';

function daySpan(later: string, earlier: string): number {
  return Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86400000);
}

function plusDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function latest(values: (string | null | undefined)[]): string | null {
  const parsed = values.map((value) => (value ? Date.parse(value) : NaN)).filter((value) => Number.isFinite(value));
  if (!parsed.length) return null;
  return new Date(Math.max(...parsed)).toISOString();
}

function hidden(dismissals: readonly ActionDismissal[], brand: string, rep: string, key: string, today: string): boolean {
  const row = dismissals.find((item) => item.brand === brand && item.repActor === rep && item.actionKey === key);
  return !!row && row.until > today;
}

export function nextBestActions(input: {
  brand: string;
  rep: string;
  today: string;
  accounts: readonly ActionAccount[];
  tasks: readonly ActionTask[];
  deals: readonly ActionDeal[];
  notes: readonly ActionNote[] | null;
  visits: readonly ActionVisit[] | null;
  events: readonly ActionEvent[] | null;
  orders: readonly ActionOrder[] | null;
  territories: readonly ActionTerritory[];
  dismissals: readonly ActionDismissal[];
}): { actions: NextAction[]; inactive: InactiveRule[] } {
  const brand = input.brand;
  const rep = input.rep;
  const today = input.today;
  const hiddenAccounts = new Set(input.accounts.filter((row) => row.brand === brand && row.recordMarker === 'test').map((row) => row.id));
  const accounts = input.accounts.filter((row) => row.brand === brand && row.recordMarker !== 'test');
  const mine = accounts.filter((row) => (row.assignedRep || '').trim() === rep);
  const byId = new Map(accounts.map((row) => [row.id, row]));
  const tasks = input.tasks.filter((row) => row.brand === brand && (!row.accountId || !hiddenAccounts.has(row.accountId)));
  const deals = input.deals.filter((row) => row.brand === brand && !hiddenAccounts.has(row.accountId));
  const ranked: { rule: number; rank: number; action: NextAction }[] = [];
  const inactive: InactiveRule[] = [];
  const push = (rule: number, rank: number, key: string, reason: string) => {
    if (hidden(input.dismissals, brand, rep, key, today)) return;
    ranked.push({ rule, rank, action: { key, rule, rep, reason, href: CRM_HREF } });
  };

  for (const task of tasks) {
    if (task.status !== 'open' || !task.dueOn || task.dueOn >= today || (task.ownerActor || '').trim() !== rep) continue;
    const days = daySpan(today, task.dueOn);
    push(1, days, `1:${task.id}`, `Overdue task, ${days} days: ${task.title}`);
  }

  for (const task of tasks) {
    if (task.status !== 'open' || !task.title.startsWith(SAMPLE_PREFIX) || !task.dueOn || task.dueOn > today || (task.ownerActor || '').trim() !== rep) continue;
    const days = daySpan(today, task.dueOn);
    push(2, days, `2:${task.id}`, `Sample follow up due${days ? `, ${days} days` : ''}: ${task.title}`);
  }

  for (const deal of deals) {
      if (!(OPEN_STAGES as readonly string[]).includes(deal.stage) || !deal.expectedCloseOn || deal.expectedCloseOn >= today) continue;
    if ((byId.get(deal.accountId)?.assignedRep || '').trim() !== rep) continue;
    push(3, daySpan(today, deal.expectedCloseOn), `3:${deal.id}`, `Deal past expected close: ${deal.name}`);
  }

  if (input.notes === null || input.visits === null || input.events === null) {
    inactive.push({ title: 'Quiet deals', reason: 'Notes, visits, or stage history is not connected.' });
  } else {
    const notes = input.notes.filter((row) => row.brand === brand);
    const visits = input.visits.filter((row) => row.brand === brand);
    const events = input.events.filter((row) => row.brand === brand);
    for (const deal of deals) {
      if (!(OPEN_STAGES as readonly string[]).includes(deal.stage)) continue;
      if ((byId.get(deal.accountId)?.assignedRep || '').trim() !== rep) continue;
      const last = latest([
        ...notes.filter((row) => row.accountId === deal.accountId).map((row) => row.createdAt),
        ...visits.filter((row) => row.accountId === deal.accountId).map((row) => row.checkedInAt),
        ...events.filter((row) => row.opportunityId === deal.id).map((row) => row.at),
      ]);
      const day = last ? last.slice(0, 10) : null;
      if (day && daySpan(today, day) < 14) continue;
      push(4, day ? daySpan(today, day) : 14, `4:${deal.id}`, `No note, visit, or stage change in 14 days: ${deal.name}`);
    }
  }

  if (input.visits === null && input.orders === null) {
    inactive.push({ title: 'Visit and reorder timing', reason: 'Visits and Nabis order history are not connected.' });
  } else {
    if (input.visits === null) inactive.push({ title: 'Accounts not visited', reason: 'Visits are not connected.' });
    else {
      const visits = input.visits.filter((row) => row.brand === brand);
      for (const account of mine) {
        if (account.status !== 'active') continue;
        const last = latest(visits.filter((row) => row.accountId === account.id).map((row) => row.checkedInAt));
        const day = last ? last.slice(0, 10) : null;
        if (day && daySpan(today, day) < 30) continue;
        push(5, day ? daySpan(today, day) : 30, `5:visit:${account.id}`, `Active account not visited in 30 days: ${account.displayName}`);
      }
    }
    if (input.orders === null) inactive.push({ title: 'Reorder window', reason: 'Nabis order history is not connected.' });
    else {
      const orders = input.orders.filter((row) => row.brand === brand && row.distributor === 'nabis' && row.orderStatus === 'delivered' && row.accountId);
      for (const account of mine) {
        if (account.status !== 'active') continue;
        const delivered = orders.filter((row) => row.accountId === account.id).map((row) => row.deliveredOn || row.orderedOn).filter((day): day is string => !!day).sort();
        if (delivered.length < 3) continue;
        const gaps: number[] = [];
        for (let i = 1; i < delivered.length; i += 1) gaps.push(daySpan(delivered[i], delivered[i - 1]));
        const average = Math.round(gaps.reduce((sum, value) => sum + value, 0) / gaps.length);
        const last = delivered[delivered.length - 1];
        if (today <= plusDays(last, average)) continue;
        push(5, daySpan(today, plusDays(last, average)), `5:reorder:${account.id}`, `Past the usual reorder window from Nabis deliveries: ${account.displayName}`);
      }
    }
  }

  inactive.push({ title: 'Out of stock alerts', reason: 'Hoodie not connected.' });

  if (input.orders === null) inactive.push({ title: 'Unpaid invoices', reason: 'Nabis export not connected.' });
  else {
    const cutoff = plusDays(today, -45);
    for (const order of input.orders) {
      if (order.brand !== brand || order.distributor !== 'nabis' || !order.accountId) continue;
      if (order.orderStatus === 'cancelled' || order.orderStatus === 'returned') continue;
      if (order.retailerPaymentStatus !== 'unpaid' && order.retailerPaymentStatus !== 'partial') continue;
      const day = order.orderedOn;
      if (!day || day >= cutoff) continue;
      const account = byId.get(order.accountId);
      if ((account?.assignedRep || '').trim() !== rep) continue;
      push(7, daySpan(today, day), `7:${order.accountId}:${day}`, `Mention to Nabis rep. Invoice unpaid past 45 days at ${account?.displayName || 'this account'}.`);
    }
  }

  const soon = plusDays(today, 30);
  for (const account of mine) {
    if (!account.licenseExpiry || account.licenseExpiry < today || account.licenseExpiry > soon) continue;
    push(8, 30 - daySpan(account.licenseExpiry, today), `8:${account.id}`, `License expires ${account.licenseExpiry}: ${account.displayName}`);
  }

  if (input.notes === null || input.visits === null) {
    inactive.push({ title: 'Unworked prospects', reason: 'Visit or note history is not connected.' });
  } else {
    const notes = input.notes.filter((row) => row.brand === brand);
    const visits = input.visits.filter((row) => row.brand === brand);
    const assigned = new Set(input.territories.filter((row) => row.brand === brand && row.repActor === rep).map((row) => row.region));
    for (const account of accounts) {
      if (account.status !== 'prospect') continue;
      const region = regionForCounty(account.county);
      if (!assigned.has(region)) continue;
      if (deals.some((row) => row.accountId === account.id)) continue;
      if (notes.some((row) => row.accountId === account.id)) continue;
      if (visits.some((row) => row.accountId === account.id)) continue;
      push(9, 1, `9:${account.id}`, `Unworked prospect in ${region}: ${account.displayName}`);
    }
  }

  ranked.sort((a, b) => a.rule - b.rule || b.rank - a.rank);
  return { actions: ranked.slice(0, 10).map((row) => row.action), inactive };
}

export function snoozeUntil(today: string, mode: 'done' | 'snooze'): string {
  return mode === 'done' ? '9999-12-31' : plusDays(today, 7);
}
