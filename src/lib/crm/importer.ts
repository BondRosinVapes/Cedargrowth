// Spreadsheet import for the wholesale CRM.
// Pure functions: parse CSV text, match column headers, and turn each row into
// the same write shape the CRM forms send. Nothing here writes to storage.
// Rows that cannot be read are reported with a reason, never guessed.

import {
  parseDistributorToken,
  parseOrderStatusToken,
  parsePayoutToken,
  parseRetailerPaymentToken,
} from './distributor';
import { parseCounty } from './nyRegions';
import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  LEAD_SOURCE_LABELS,
  LEAD_SOURCES,
  OPPORTUNITY_STAGES,
  PRODUCT_LINES,
  PRODUCT_LINE_LABELS,
  type AccountStatus,
  type OpportunityStage,
  type ProductLine,
} from './engine';

export const IMPORT_KINDS = ['accounts', 'deals', 'orders', 'retailers', 'contacts'] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];
export const IMPORT_BATCH = 50;
export const IMPORT_MAX_ROWS = 2000;

export function chunkImportRows<T>(rows: readonly T[], size = IMPORT_BATCH): T[][] {
  const limit = Math.max(1, Math.floor(size));
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += limit) chunks.push(rows.slice(i, i + limit));
  return chunks;
}

export function mergeBatchOutcomes<T extends { line: number }>(
  batch: readonly T[],
  outcomes: readonly { line?: number; status: 'ready' | 'created' | 'updated' | 'unmatched' | 'skipped' | 'error'; reason?: string; orderId?: string }[] | null,
  failure?: string,
): { line: number; status: 'ready' | 'created' | 'updated' | 'unmatched' | 'skipped' | 'error'; reason?: string; orderId?: string }[] {
  if (failure) return batch.map((row) => ({ line: row.line, status: 'error', reason: failure }));
  const byLine = new Map<number, { line?: number; status: 'ready' | 'created' | 'updated' | 'unmatched' | 'skipped' | 'error'; reason?: string; orderId?: string }>();
  for (const outcome of outcomes ?? []) {
    if (typeof outcome.line === 'number') byLine.set(outcome.line, outcome);
  }
  return batch.map((row, index) => {
    const matched = byLine.get(row.line);
    if (matched) return { ...matched, line: row.line };
    const sameIndex = outcomes?.[index];
    if (sameIndex && typeof sameIndex.line !== 'number') return { ...sameIndex, line: row.line };
    return { line: row.line, status: 'error', reason: 'This row did not come back from the import.' };
  });
}

export type ImportRow = { line: number; record?: Record<string, unknown>; accountName?: string; accountLicense?: string; error?: string };

// RFC 4180 style parser: quoted fields, doubled quotes, commas and newlines inside quotes, CRLF, BOM.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((cell) => cell.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== '')) rows.push(row);
  return rows;
}

const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const ACCOUNT_HEADERS: Record<string, string[]> = {
  displayName: ['account', 'account name', 'name', 'customer', 'customer name', 'retailer', 'store', 'dispensary', 'company', 'business name', 'licensee'],
  status: ['status', 'account status'],
  city: ['city', 'region', 'town', 'location'],
  county: ['county'],
  accountType: ['account type', 'type', 'customer type', 'license type', 'buyer type'],
  leadSource: ['lead source', 'source', 'how found', 'channel', 'origin'],
  assignedRep: ['sales rep', 'rep', 'account manager', 'owner', 'assigned rep', 'salesperson'],
  licenseRef: ['license', 'license number', 'license no', 'license ref', 'license id'],
  licenseExpiry: ['license expiry', 'license expiration', 'expiration', 'expires', 'expiry'],
  notes: ['notes', 'note', 'comments'],
  // Kept as labeled lines in the account notes. County is also stored on the account.
  address: ['address', 'street', 'street address'],
  zip: ['zip', 'zip code', 'postal code'],
  region: ['region', 'region area', 'market region'],
  phone: ['phone', 'store phone', 'account phone'],
  email: ['email', 'store email', 'account email'],
  website: ['website', 'url', 'web'],
  operating: ['operating', 'operating status'],
  licenseStatus: ['source status', 'license status'],
};

const CONTACT_HEADERS: Record<string, string[]> = {
  name: ['name', 'contact', 'contact name', 'full name'],
  email: ['email', 'contact email', 'email address'],
  phone: ['phone', 'contact phone', 'mobile', 'cell'],
  title: ['title', 'role', 'job title', 'contact title'],
  accountName: ['account name', 'account', 'store', 'dispensary', 'retailer'],
  accountLicense: ['account license', 'account id', 'license', 'license number'],
};

const ORDER_HEADERS: Record<string, string[]> = {
  orderRef: ['order id', 'order number', 'order no', 'order'],
  retailerName: ['retailer', 'dispensary', 'store name', 'customer name'],
  licenseRef: ['license', 'license number', 'license no', 'license ref', 'license id'],
  distributorAccountRef: ['retailer id', 'customer id', 'account id', 'account number', 'distributor account', 'nabis id'],
  orderedOn: ['order date', 'ordered', 'ordered on'],
  deliveredOn: ['delivery date', 'delivered', 'delivered on'],
  orderStatus: ['status', 'order status'],
  invoice: ['invoice total', 'invoice', 'invoice amount', 'total'],
  paymentStatus: ['payment status', 'paid status', 'retailer payment'],
  paidOn: ['paid date', 'payment date', 'date paid'],
  payout: ['payout', 'payout amount'],
  payoutStatus: ['payout status'],
  payoutOn: ['payout date'],
  distributor: ['distributor'],
};

const RETAILER_HEADERS: Record<string, string[]> = {
  licenseNumber: ['license number', 'license', 'license no', 'license id'],
  name: ['name', 'retailer', 'dispensary', 'business name'],
  county: ['county'],
  licenseType: ['license type', 'type'],
};

const DEAL_HEADERS: Record<string, string[]> = {
  accountName: ['account', 'account name', 'customer', 'customer name', 'retailer', 'store', 'dispensary', 'company'],
  name: ['deal', 'deal name', 'opportunity', 'opportunity name', 'order', 'title', 'name'],
  stage: ['stage', 'deal stage', 'status', 'pipeline stage'],
  forecast: ['amount', 'value', 'deal value', 'forecast', 'total', 'total deal value', 'order total'],
  expectedCloseOn: ['close date', 'expected close', 'expected close date', 'close', 'due date'],
  lossReason: ['loss reason', 'lost reason', 'reason lost'],
  nextAction: ['next action', 'next step'],
  notes: ['notes', 'note', 'comments'],
  productLine: ['product line', 'product', 'format', 'line'],
  quantity: ['quantity', 'quantity units', 'units', 'qty'],
};

export function matchHeaders(kind: ImportKind, header: string[]): { columns: Record<string, number>; unmatched: string[] } {
  const table = kind === 'accounts' ? ACCOUNT_HEADERS : kind === 'orders' ? ORDER_HEADERS : kind === 'retailers' ? RETAILER_HEADERS : kind === 'contacts' ? CONTACT_HEADERS : DEAL_HEADERS;
  const columns: Record<string, number> = {};
  const unmatched: string[] = [];
  header.forEach((raw, index) => {
    const h = norm(raw);
    const field = Object.keys(table).find((key) => !(key in columns) && (norm(key) === h || table[key].includes(h)));
    if (field) columns[field] = index;
    else if (raw.trim()) unmatched.push(raw.trim());
  });
  return { columns, unmatched };
}

export function matchLeadSource(value: string): (typeof LEAD_SOURCES)[number] | null | 'invalid' {
  return choice(value, LEAD_SOURCES, LEAD_SOURCE_LABELS, SOURCE_SYNONYMS);
}

export function composeAccountNotes(input: { notes?: string; address?: string; zip?: string; county?: string; region?: string; phone?: string; email?: string; website?: string; licenseStatus?: string; operating?: string }): string {
  const extra = [
    ['Address', [input.address || '', input.zip || ''].filter(Boolean).join(' ')],
    ['County', input.county || ''],
    ['Region', input.region || ''],
    ['Store phone', input.phone || ''],
    ['Store email', input.email || ''],
    ['Website', input.website || ''],
    ['License status', input.licenseStatus || ''],
    ['Operating', input.operating || ''],
  ].filter(([, value]) => value).map(([name, value]) => `${name}: ${value}`);
  return [input.notes || '', ...extra].filter(Boolean).join('\n').slice(0, 4000);
}

function choice<T extends string>(value: string, allowed: readonly T[], labels: Record<T, string>, synonyms: Record<string, T>): T | null | 'invalid' {
  const v = norm(value);
  if (!v) return null;
  const direct = allowed.find((item) => norm(item) === v || norm(labels[item]) === v);
  if (direct) return direct;
  return synonyms[v] ?? 'invalid';
}

const TYPE_SYNONYMS: Record<string, (typeof ACCOUNT_TYPES)[number]> = {
  dispensary: 'adult_use_dispensary', retail: 'adult_use_dispensary', retailer: 'adult_use_dispensary', 'adult use': 'adult_use_dispensary',
  'adult use retail dispensary': 'adult_use_dispensary', caurd: 'adult_use_dispensary', aurd: 'adult_use_dispensary',
  micro: 'microbusiness', 'micro business': 'microbusiness', distribution: 'distributor', ro: 'registered_organization',
  'medical dispensary': 'registered_organization', processing: 'processor', manufacturer: 'processor', cultivation: 'cultivator', grower: 'cultivator',
  'adult use retail dispensary license': 'adult_use_dispensary', 'adult use conditional retail dispensary license': 'adult_use_dispensary',
  'adult use dispensary': 'adult_use_dispensary', 'adult use microbusiness license': 'microbusiness', 'microbusiness retail': 'microbusiness',
  'adult use registered organization dispensary license': 'registered_organization',
};
const SOURCE_SYNONYMS: Record<string, (typeof LEAD_SOURCES)[number]> = {
  'leaf link': 'leaflink', 'trade show': 'trade_show', tradeshow: 'trade_show', event: 'trade_show', expo: 'trade_show',
  cold: 'cold_outreach', 'cold call': 'cold_outreach', 'cold email': 'cold_outreach', outreach: 'cold_outreach',
  web: 'website', inbound: 'website', 'web form': 'website', referred: 'referral', 'word of mouth': 'referral',
  existing: 'existing_relationship', 'existing customer': 'existing_relationship',
};
const STAGE_SYNONYMS: Record<string, OpportunityStage> = {
  new: 'lead', prospect: 'lead', contacted: 'lead', qualified: 'qualification', 'license review': 'licensed_buyer_review',
  'license check': 'licensed_buyer_review', 'proposal sent': 'proposal', quote: 'proposal', negotiation: 'proposal',
  'closed won': 'won', closed: 'won', ordered: 'won', 'closed lost': 'lost',
};
const LINE_SYNONYMS: Record<string, ProductLine> = {
  'pre roll': 'preroll', 'pre-roll': 'preroll', 'infused pre roll': 'preroll', 'infused pre-roll': 'preroll',
  gummies: 'gummy', vapes: 'vape',
};
const STAGE_LABEL: Record<OpportunityStage, string> = {
  lead: 'Lead', qualification: 'Qualified', licensed_buyer_review: 'Licensed buyer review', proposal: 'Proposal', won: 'Won', lost: 'Lost',
};
const STATUS_VALUES: readonly AccountStatus[] = ['prospect', 'active', 'paused', 'closed'];

// Accepts 2026-03-14, 3/14/2026, and 3/14/26. Anything else is reported, not guessed.
export function parseDate(value: string): string | null | 'invalid' {
  const v = value.trim();
  if (!v) return null;
  let y: number; let m: number; let d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(v);
  if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3]; }
  else if (us) { m = +us[1]; d = +us[2]; y = us[3].length === 2 ? 2000 + +us[3] : +us[3]; }
  else return 'invalid';
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return 'invalid';
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Accepts $1,234.50, 1234.5, and 1234. Returns whole cents.
export function parseMoney(value: string): number | null | 'invalid' {
  const v = value.trim().replace(/[$,\s]/g, '');
  if (!v) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return 'invalid';
  return Math.round(Number(v) * 100);
}

export function mapRows(kind: ImportKind, table: string[][]): { rows: ImportRow[]; missing: string[]; unmatched: string[]; truncated: boolean; rowCount: number } {
  const [header = [], ...body] = table;
  const { columns, unmatched } = matchHeaders(kind, header);
  const required = kind === 'accounts' ? ['displayName'] : kind === 'orders' ? ['orderRef', 'retailerName'] : kind === 'retailers' ? ['licenseNumber', 'name', 'county'] : kind === 'contacts' ? ['name'] : ['accountName', 'name'];
  const missing = required.filter((key) => !(key in columns)).map((key) => ({ displayName: 'Account name', accountName: 'Account', name: kind === 'contacts' ? 'Contact name' : 'Name', orderRef: 'Order ID', retailerName: 'Retailer', licenseNumber: 'License number', county: 'County' }[key] ?? key));
  if (kind === 'contacts' && !('accountName' in columns) && !('accountLicense' in columns)) missing.push('Account name or Account license');
  if (missing.length) return { rows: [], missing, unmatched, truncated: body.length > IMPORT_MAX_ROWS, rowCount: body.length };
    const cell = (row: string[], key: string) => (key in columns ? (row[columns[key]] ?? '').trim() : '');
  const truncated = body.length > IMPORT_MAX_ROWS;
  const rows = body.slice(0, IMPORT_MAX_ROWS).map((row, index): ImportRow => {
    const line = index + 2;
    if (kind === 'orders') {
      const orderRef = cell(row, 'orderRef');
      const retailerName = cell(row, 'retailerName');
      if (!orderRef) return { line, error: 'Order ID is empty.' };
      if (!retailerName) return { line, error: 'Retailer is empty.' };
      const distributor = parseDistributorToken(cell(row, 'distributor') || 'nabis');
      if (distributor === 'invalid' || !distributor) return { line, error: `Distributor "${cell(row, 'distributor')}" is not Nabis, Other, or Self.` };
      const orderStatus = parseOrderStatusToken(cell(row, 'orderStatus'));
      if (orderStatus === 'invalid') return { line, error: `Status "${cell(row, 'orderStatus')}" is not recognized.` };
      const payment = parseRetailerPaymentToken(cell(row, 'paymentStatus'));
      if (payment === 'invalid') return { line, error: `Payment status "${cell(row, 'paymentStatus')}" is not recognized.` };
      const payoutStatus = parsePayoutToken(cell(row, 'payoutStatus'));
      if (payoutStatus === 'invalid') return { line, error: `Payout status "${cell(row, 'payoutStatus')}" is not recognized.` };
      const orderedOn = parseDate(cell(row, 'orderedOn'));
      if (orderedOn === 'invalid') return { line, error: `Order date "${cell(row, 'orderedOn')}" is not a date.` };
      const deliveredOn = parseDate(cell(row, 'deliveredOn'));
      if (deliveredOn === 'invalid') return { line, error: `Delivery date "${cell(row, 'deliveredOn')}" is not a date.` };
      const paidOn = parseDate(cell(row, 'paidOn'));
      if (paidOn === 'invalid') return { line, error: `Paid date "${cell(row, 'paidOn')}" is not a date.` };
      const payoutOn = parseDate(cell(row, 'payoutOn'));
      if (payoutOn === 'invalid') return { line, error: `Payout date "${cell(row, 'payoutOn')}" is not a date.` };
      const invoice = parseMoney(cell(row, 'invoice'));
      if (invoice === 'invalid') return { line, error: `Invoice total "${cell(row, 'invoice')}" is not a dollar amount.` };
      const payoutCents = parseMoney(cell(row, 'payout'));
      if (payoutCents === 'invalid') return { line, error: `Payout "${cell(row, 'payout')}" is not a dollar amount.` };
      const record: Record<string, unknown> = {
        distributor,
        orderRef,
        retailerName,
        distributorAccountRef: cell(row, 'distributorAccountRef') || null,
        licenseRef: cell(row, 'licenseRef') || null,
        orderedOn,
        deliveredOn,
        orderStatus,
        invoiceCents: invoice,
        retailerPaymentStatus: payment,
        retailerPaidOn: paidOn,
        payoutStatus,
        payoutCents,
        payoutOn,
      };
      return { line, record, accountName: retailerName };
    }
    if (kind === 'retailers') {
      const licenseNumber = cell(row, 'licenseNumber');
      const name = cell(row, 'name');
      const countyRaw = cell(row, 'county');
      const licenseType = cell(row, 'licenseType') || 'Unspecified';
      if (!licenseNumber) return { line, error: 'License number is empty.' };
      if (!name) return { line, error: 'Name is empty.' };
      const county = parseCounty(countyRaw);
      if (!county.ok || !county.county) return { line, error: county.ok ? 'County is empty.' : county.reason };
      return { line, record: { licenseNumber, name, county: county.county, licenseType } };
    }
    if (kind === 'accounts') {
      const record: Record<string, unknown> = { displayName: cell(row, 'displayName') };
      if (!record.displayName) return { line, error: 'Account name is empty.' };
      const status = norm(cell(row, 'status'));
      if (status) {
        const match = STATUS_VALUES.find((item) => item === status);
        if (!match) return { line, error: `Status "${cell(row, 'status')}" is not Prospect, Active, Paused, or Closed.` };
        record.status = match;
      } else record.status = 'prospect';
      const type = choice(cell(row, 'accountType'), ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS, TYPE_SYNONYMS);
      if (type === 'invalid') return { line, error: `Account type "${cell(row, 'accountType')}" is not recognized.` };
      if (type) record.accountType = type;
      const source = choice(cell(row, 'leadSource'), LEAD_SOURCES, LEAD_SOURCE_LABELS, SOURCE_SYNONYMS);
      if (source === 'invalid') return { line, error: `Lead source "${cell(row, 'leadSource')}" is not recognized.` };
      if (source) record.leadSource = source;
      const expiry = parseDate(cell(row, 'licenseExpiry'));
      if (expiry === 'invalid') return { line, error: `License expiry "${cell(row, 'licenseExpiry')}" is not a date.` };
      if (expiry) record.licenseExpiry = expiry;
      for (const key of ['city', 'assignedRep', 'licenseRef']) if (cell(row, key)) record[key] = cell(row, key);
      let countyName = '';
      if (cell(row, 'county')) {
        const county = parseCounty(cell(row, 'county'));
        if (!county.ok) return { line, error: county.reason };
        if (county.county) {
          record.county = county.county;
          countyName = county.county;
        }
      }
      const notes = composeAccountNotes({
        notes: cell(row, 'notes'),
        address: cell(row, 'address'),
        zip: cell(row, 'zip'),
        county: countyName,
        region: cell(row, 'region'),
        phone: cell(row, 'phone'),
        email: cell(row, 'email'),
        website: cell(row, 'website'),
        licenseStatus: cell(row, 'licenseStatus'),
        operating: cell(row, 'operating'),
      });
      if (notes) record.notes = notes;
      return { line, record };
    }
    if (kind === 'contacts') {
      const record: Record<string, unknown> = { name: cell(row, 'name') };
      if (!record.name) return { line, error: 'Contact name is empty.' };
      const accountName = cell(row, 'accountName');
      const accountLicense = cell(row, 'accountLicense');
      if (!accountName && !accountLicense) return { line, error: 'No account for this contact. Link it to an account first.' };
      for (const key of ['email', 'phone', 'title']) if (cell(row, key)) record[key] = cell(row, key);
      return { line, record, accountName, accountLicense };
    }
    const accountName = cell(row, 'accountName');
    const record: Record<string, unknown> = { name: cell(row, 'name') };
    if (!accountName) return { line, error: 'Account is empty.' };
    if (!record.name) return { line, error: 'Deal name is empty.' };
    const stage = choice(cell(row, 'stage'), OPPORTUNITY_STAGES, STAGE_LABEL, STAGE_SYNONYMS);
    if (stage === 'invalid') return { line, error: `Stage "${cell(row, 'stage')}" is not recognized.` };
    record.stage = stage ?? 'lead';
    const cents = parseMoney(cell(row, 'forecast'));
    if (cents === 'invalid') return { line, error: `Amount "${cell(row, 'forecast')}" is not a dollar amount.` };
    if (cents !== null) record.forecastCents = cents;
    const close = parseDate(cell(row, 'expectedCloseOn'));
    if (close === 'invalid') return { line, error: `Close date "${cell(row, 'expectedCloseOn')}" is not a date.` };
    if (close) record.expectedCloseOn = close;
    for (const key of ['lossReason', 'nextAction', 'notes']) if (cell(row, key)) record[key] = cell(row, key);
    const lineName = choice(cell(row, 'productLine'), PRODUCT_LINES, PRODUCT_LINE_LABELS, LINE_SYNONYMS);
    if (lineName === 'invalid') return { line, error: `Product line "${cell(row, 'productLine')}" is not recognized.` };
    if (lineName) record.productLine = lineName;
    const qtyRaw = cell(row, 'quantity').replace(/,/g, '');
    if (qtyRaw) {
      if (!/^\d+$/.test(qtyRaw)) return { line, error: `Quantity "${cell(row, 'quantity')}" is not a whole number of units.` };
      record.quantityUnits = Number(qtyRaw);
    }
    if (record.stage === 'lost' && !record.lossReason) return { line, error: 'A lost deal needs a loss reason column.' };
    return { line, record, accountName };
  });
  return { rows, missing: [], unmatched, truncated, rowCount: body.length };
}

export const TEMPLATES: Record<ImportKind, string> = {
  accounts: 'Account name,Status,Account type,Lead source,Sales rep,City,County,License number,License expiry,Address,ZIP,Region,Phone,Email,Website,License status,Operating,Notes\n',
  retailers: 'License number,Name,County,License type\n',
  deals: 'Account,Deal name,Stage,Amount,Close date,Product line,Quantity,Next action,Loss reason,Notes\n',
  orders: 'Order ID,Retailer,License,Order Date,Delivery Date,Status,Invoice Total,Payment Status,Paid Date,Payout,Payout Date\n',
  contacts: 'Contact name,Email,Phone,Title,Account name,Account license\n',
};
