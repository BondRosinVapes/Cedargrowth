// Spreadsheet import for the wholesale CRM.
// Pure functions: parse CSV text, match column headers, and turn each row into
// the same write shape the CRM forms send. Nothing here writes to storage.
// Rows that cannot be read are reported with a reason, never guessed.

import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  LEAD_SOURCE_LABELS,
  LEAD_SOURCES,
  OPPORTUNITY_STAGES,
  type AccountStatus,
  type OpportunityStage,
} from './engine';

export const IMPORT_KINDS = ['accounts', 'deals'] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];
export const IMPORT_BATCH = 100;
export const IMPORT_MAX_ROWS = 2000;

export type ImportRow = { line: number; record?: Record<string, unknown>; accountName?: string; error?: string };

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
  accountType: ['account type', 'type', 'customer type', 'license type', 'buyer type'],
  leadSource: ['lead source', 'source', 'how found', 'channel', 'origin'],
  assignedRep: ['sales rep', 'rep', 'account manager', 'owner', 'assigned rep', 'salesperson'],
  licenseRef: ['license', 'license number', 'license no', 'license ref', 'license id'],
  licenseExpiry: ['license expiry', 'license expiration', 'expiration', 'expires', 'expiry'],
  notes: ['notes', 'note', 'comments'],
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
};

export function matchHeaders(kind: ImportKind, header: string[]): { columns: Record<string, number>; unmatched: string[] } {
  const table = kind === 'accounts' ? ACCOUNT_HEADERS : DEAL_HEADERS;
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

export function mapRows(kind: ImportKind, table: string[][]): { rows: ImportRow[]; missing: string[]; unmatched: string[] } {
  const [header = [], ...body] = table;
  const { columns, unmatched } = matchHeaders(kind, header);
  const required = kind === 'accounts' ? ['displayName'] : ['accountName', 'name'];
  const missing = required.filter((key) => !(key in columns)).map((key) => ({ displayName: 'Account name', accountName: 'Account', name: 'Deal name' }[key] ?? key));
  if (missing.length) return { rows: [], missing, unmatched };
  const cell = (row: string[], key: string) => (key in columns ? (row[columns[key]] ?? '').trim() : '');
  const rows = body.slice(0, IMPORT_MAX_ROWS).map((row, index): ImportRow => {
    const line = index + 2;
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
      for (const key of ['city', 'assignedRep', 'licenseRef', 'notes']) if (cell(row, key)) record[key] = cell(row, key);
      return { line, record };
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
    if (record.stage === 'lost' && !record.lossReason) return { line, error: 'A lost deal needs a loss reason column.' };
    return { line, record, accountName };
  });
  return { rows, missing: [], unmatched };
}

export const TEMPLATES: Record<ImportKind, string> = {
  accounts: 'Account name,Status,Account type,Lead source,Sales rep,City,License number,License expiry,Notes\n',
  deals: 'Account,Deal name,Stage,Amount,Close date,Next action,Loss reason,Notes\n',
};
