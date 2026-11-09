// Distributor order rules. CedarGrowth does not invoice retailers.
// The distributor reports the order, the retailer payment, and the payout.
// These functions do not place orders, set credit limits, or call Nabis.

import { OPEN_STAGES, type CrmBrand, type OpportunityStage } from './engine';

export const DISTRIBUTORS = ['nabis', 'other', 'self'] as const;
export type Distributor = (typeof DISTRIBUTORS)[number];
export const DISTRIBUTOR_LABELS: Record<Distributor, string> = { nabis: 'Nabis', other: 'Other', self: 'Self' };

export const ORDER_STATUSES = ['placed', 'scheduled', 'delivered', 'cancelled', 'returned'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  placed: 'Placed',
  scheduled: 'Scheduled',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned',
};

export const RETAILER_PAYMENT_STATUSES = ['unpaid', 'partial', 'paid', 'unknown'] as const;
export type RetailerPaymentStatus = (typeof RETAILER_PAYMENT_STATUSES)[number];
export const RETAILER_PAYMENT_LABELS: Record<RetailerPaymentStatus, string> = {
  unpaid: 'Unpaid',
  partial: 'Partial',
  paid: 'Paid',
  unknown: 'Unknown',
};

export const PAYOUT_STATUSES = ['pending', 'paid_out', 'unknown'] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];
export const PAYOUT_STATUS_LABELS: Record<PayoutStatus, string> = {
  pending: 'Pending',
  paid_out: 'Paid out',
  unknown: 'Unknown',
};

export const ORDER_SOURCES = ['csv', 'api'] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

export type DistributorOrderDraft = {
  distributor: Distributor;
  orderRef: string;
  retailerName: string;
  distributorAccountRef: string | null;
  licenseRef: string | null;
  orderedOn: string | null;
  deliveredOn: string | null;
  orderStatus: OrderStatus;
  invoiceCents: number | null;
  retailerPaymentStatus: RetailerPaymentStatus;
  retailerPaidOn: string | null;
  payoutStatus: PayoutStatus;
  payoutCents: number | null;
  payoutOn: string | null;
};

export type OrderMatchAccount = {
  id: string;
  displayName: string;
  licenseRef: string | null;
  distributorAccountRef: string | null;
};

const norm = (value: string) => value.trim().toLowerCase();

function oneMatch(ids: string[]): string | null {
  return ids.length === 1 ? ids[0] : null;
}

// Match by the distributor's retailer id, then license number, then the whole name.
// More than one hit is left unmatched. A partial name is not a match.
export function matchDistributorAccount(accounts: readonly OrderMatchAccount[], row: { distributorAccountRef: string | null; licenseRef: string | null; retailerName: string }): string | null {
  const ref = row.distributorAccountRef ? norm(row.distributorAccountRef) : '';
  if (ref) {
    return oneMatch(accounts.filter((account) => account.distributorAccountRef && norm(account.distributorAccountRef) === ref).map((account) => account.id));
  }
  const license = row.licenseRef ? norm(row.licenseRef) : '';
  if (license) {
    return oneMatch(accounts.filter((account) => account.licenseRef && norm(account.licenseRef) === license).map((account) => account.id));
  }
  const name = norm(row.retailerName);
  if (!name) return null;
  return oneMatch(accounts.filter((account) => norm(account.displayName) === name).map((account) => account.id));
}

const STATUS_WORDS: Record<string, OrderStatus> = {
  placed: 'placed', new: 'placed', submitted: 'placed', open: 'placed',
  scheduled: 'scheduled', schedule: 'scheduled',
  delivered: 'delivered', delivery: 'delivered', complete: 'delivered', completed: 'delivered',
  cancelled: 'cancelled', canceled: 'cancelled',
  returned: 'returned', return: 'returned',
};
const PAYMENT_WORDS: Record<string, RetailerPaymentStatus> = {
  unpaid: 'unpaid', 'not paid': 'unpaid', due: 'unpaid', open: 'unpaid',
  partial: 'partial', 'partially paid': 'partial', 'partial payment': 'partial',
  paid: 'paid', 'paid in full': 'paid',
  unknown: 'unknown',
};
const PAYOUT_WORDS: Record<string, PayoutStatus> = {
  pending: 'pending', unpaid: 'pending', 'not paid': 'pending',
  'paid out': 'paid_out', paid: 'paid_out', payout: 'paid_out',
  unknown: 'unknown',
};

function word<T extends string>(value: string, table: Record<string, T>): T | null | 'invalid' {
  const v = norm(value);
  if (!v) return null;
  return table[v] ?? 'invalid';
}

export function parseDistributorToken(value: unknown): Distributor | null | 'invalid' {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return 'invalid';
  const v = norm(value);
  if (!v) return null;
  if (v === 'nabis') return 'nabis';
  if (v === 'other') return 'other';
  if (v === 'self' || v === 'direct') return 'self';
  return 'invalid';
}

export function parseOrderStatusToken(value: string): OrderStatus | 'invalid' {
  const parsed = word(value, STATUS_WORDS);
  return parsed === null ? 'invalid' : parsed;
}

export function parseRetailerPaymentToken(value: string): RetailerPaymentStatus | 'invalid' {
  const parsed = word(value, PAYMENT_WORDS);
  return parsed === null ? 'unknown' : parsed;
}

export function parsePayoutToken(value: string): PayoutStatus | 'invalid' {
  const parsed = word(value, PAYOUT_WORDS);
  return parsed === null ? 'unknown' : parsed;
}

export function formatImportStamp(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let hour = date.getUTCHours();
  const suffix = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  const minute = String(date.getUTCMinutes()).padStart(2, '0');
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${hour}:${minute} ${suffix}`;
}

export function nabisHealthLine(importedAt: string | null, source: OrderSource | null): string {
  if (!importedAt) return 'Nabis: no data yet.';
  const stamp = formatImportStamp(importedAt);
  if (!stamp) return 'Nabis: no data yet.';
  const via = source === 'api' ? 'API' : 'CSV';
  return `Nabis: last import ${stamp} (${via})`;
}

export type DistributorSummaryOrder = {
  id: string;
  brand: CrmBrand;
  distributor: Distributor;
  orderRef: string;
  retailerName: string;
  accountId: string | null;
  orderStatus: OrderStatus;
  invoiceCents: number | null;
  retailerPaymentStatus: RetailerPaymentStatus;
  payoutStatus: PayoutStatus;
  orderedOn: string | null;
  importedAt: string;
  source: OrderSource;
  opportunityId: string | null;
};

export type DistributorSummary = {
  sourceLabel: string;
  ordersThisMonth: number;
  invoicedThisMonthCents: number | null;
  awaitingRetailerPayment: number;
  awaitingPayout: number;
  nabisOrderCount: number;
  invoicedNabisCents: number | null;
  byStatus: { key: string; label: string; count: number; cents: number | null }[];
  overdueUnpaid: { id: string; retailerName: string; invoiceCents: number | null; orderedOn: string | null }[];
  orders: (DistributorSummaryOrder & { openOpportunityIds: string[] })[];
};

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function closedOrder(status: OrderStatus): boolean {
  return status === 'cancelled' || status === 'returned';
}

export function summarizeDistributor(input: {
  today: string;
  orders: readonly DistributorSummaryOrder[];
  openDeals: readonly { id: string; accountId: string; stage: OpportunityStage }[];
}): DistributorSummary {
  const month = input.today.slice(0, 7);
  const cutoff = addDays(input.today, -30);
  const nabis = input.orders.filter((row) => row.distributor === 'nabis');
  const latest = [...input.orders].sort((a, b) => (a.importedAt < b.importedAt ? 1 : -1))[0];
  const sourceLabel = latest
    ? `From ${DISTRIBUTOR_LABELS[latest.distributor]} export, ${formatImportStamp(latest.importedAt)?.replace(/,.*$/, '') || input.today}`
    : 'Nabis: no data yet.';
  const thisMonth = input.orders.filter((row) => row.orderedOn?.slice(0, 7) === month && !closedOrder(row.orderStatus));
  const monthInvoices = thisMonth.map((row) => row.invoiceCents).filter((value): value is number => typeof value === 'number');
  const nabisInvoices = nabis.map((row) => row.invoiceCents).filter((value): value is number => typeof value === 'number');
  const openByAccount = new Map<string, string[]>();
  for (const deal of input.openDeals) {
    if (OPEN_STAGES.indexOf(deal.stage) < 0) continue;
    const list = openByAccount.get(deal.accountId) ?? [];
    list.push(deal.id);
    openByAccount.set(deal.accountId, list);
  }
  return {
    sourceLabel,
    ordersThisMonth: thisMonth.length,
    invoicedThisMonthCents: monthInvoices.length ? monthInvoices.reduce((sum, value) => sum + value, 0) : null,
    awaitingRetailerPayment: input.orders.filter((row) => !closedOrder(row.orderStatus) && (row.retailerPaymentStatus === 'unpaid' || row.retailerPaymentStatus === 'partial')).length,
    awaitingPayout: input.orders.filter((row) => !closedOrder(row.orderStatus) && row.payoutStatus === 'pending').length,
    nabisOrderCount: nabis.length,
    invoicedNabisCents: nabis.length ? (nabisInvoices.length ? nabisInvoices.reduce((sum, value) => sum + value, 0) : null) : null,
    byStatus: ORDER_STATUSES.map((status) => {
      const rows = input.orders.filter((row) => row.orderStatus === status);
      const cents = rows.map((row) => row.invoiceCents).filter((value): value is number => typeof value === 'number');
      return { key: status, label: ORDER_STATUS_LABELS[status], count: rows.length, cents: cents.length ? cents.reduce((sum, value) => sum + value, 0) : null };
    }),
    overdueUnpaid: input.orders.filter((row) => !closedOrder(row.orderStatus) && (row.retailerPaymentStatus === 'unpaid' || row.retailerPaymentStatus === 'partial') && !!row.orderedOn && row.orderedOn < cutoff).map((row) => ({
      id: row.id,
      retailerName: row.retailerName,
      invoiceCents: row.invoiceCents,
      orderedOn: row.orderedOn,
    })),
    orders: input.orders.map((row) => ({
      ...row,
      openOpportunityIds: row.accountId ? (openByAccount.get(row.accountId) ?? []) : [],
    })),
  };
}
