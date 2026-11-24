// Hoodie market-file parser for the staff CRM import.
// Pure functions: checksums, CSV mapping, natural-key upserts, store matching,
// and the approval gate. Nothing here writes to a database or creates accounts.
// Q-B1 is pending. The route reaches market_intel only through the security
// definer functions in migration 0142.

import { createHash } from 'node:crypto';
import { parseCsv } from './importer';

export const HOODIE_BRAND = 'cedargrowth' as const;
export const REPORT_TYPES = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];
export type HoodieGeography = 'NY' | 'NY:Erie';
export type Grain = 'month' | 'week';
export type RunStatus = 'staged' | 'validated' | 'published' | 'superseded' | 'rejected';
export type MatchStatus = 'auto' | 'manual' | 'none' | 'residual' | 'queued';

export const VD_FIELDS = [
  ['% ACV', 'acv_pct', 'value'],
  ['% ACV Change', 'acv_chg_pct', 'change'],
  ['$/MM ACV', 'dollars_per_mm_acv', 'value'],
  ['$/MM ACV Change', 'dollars_per_mm_acv_chg_pct', 'change'],
  ['Total $', 'total_dollars', 'value'],
  ['Total $ Change', 'total_dollars_chg_pct', 'change'],
  ['Total Units', 'total_units', 'value'],
  ['Units Change', 'units_chg_pct', 'change'],
  ['Weighted Avg Price', 'wap', 'value'],
  ['Weighted Avg Price Change', 'wap_chg_pct', 'change'],
  ['$/MM ACV per SKU', 'dollars_per_mm_acv_per_sku', 'value'],
  ['$/MM ACV per SKU Change', 'dollars_per_mm_acv_per_sku_chg_pct', 'change'],
  ['Avg % SKU OOS', 'avg_sku_oos_pct', 'value'],
  ['Avg % SKU OOS Change', 'avg_sku_oos_chg', 'change'],
  ['Avg SKUs per Dispensary', 'avg_skus_per_disp', 'value'],
  ['Avg SKUs per Dispensary Change', 'avg_skus_per_disp_chg_pct', 'change'],
  ['Dispensary Count', 'dispensary_count', 'value'],
  ['Dispensary Count Change', 'dispensary_count_chg', 'change'],
  ['% ACV Max', 'acv_max_pct', 'value'],
  ['% ACV Max Change', 'acv_max_chg', 'change'],
] as const;

export type VdColumn = (typeof VD_FIELDS)[number][1];
export type VdMetrics = Record<VdColumn, string | null>;

const VD_HEADERS = VD_FIELDS.map((field) => field[0]);

export type Fact =
  | { kind: 'market_sales'; period_month: string; state: string; category: string; dollars: string }
  | {
      kind: 'brand_month';
      period_month: string;
      geography: HoodieGeography;
      brand_display: string;
      brand_normalized: string;
      source_report: 'F2' | 'F3' | 'F9';
      is_cedargrowth: boolean;
      dollars: string | null;
      metrics: VdMetrics | null;
    }
  | {
      kind: 'size';
      period_month: string;
      geography: HoodieGeography;
      category: string;
      size_label: string;
      size_mg: number | null;
      size_unparsed: boolean;
      metrics: VdMetrics;
    }
  | {
      kind: 'subsegment';
      period_month: string;
      geography: HoodieGeography;
      category: string;
      segment: string;
      sub_segment: string;
      metrics: VdMetrics;
    }
  | {
      kind: 'product';
      period_month: string;
      geography: HoodieGeography;
      category: string;
      segment: string;
      product_name: string;
      product_normalized: string;
      brand_parsed: string | null;
      brand_parse_status: 'parsed' | 'unparsed';
      size_mg_parsed: number | null;
      size_approximate: boolean;
      is_live_rosin: true;
      metrics: VdMetrics;
    }
  | {
      kind: 'dispensary';
      period_month: string;
      geography: HoodieGeography;
      name_raw: string;
      name_normalized: string;
      account_id: string | null;
      match_status: MatchStatus;
      metrics: VdMetrics;
    }
  | {
      kind: 'price_week';
      week_start: string;
      category: string;
      segment: string;
      unit_of_measure: string;
      original_price_avg: string;
    };

export type StagedRow = { row_num: number; raw: Record<string, string>; parsed: Fact[] };

export type QueueItem = {
  name_raw: string;
  name_normalized: string;
  geography: HoodieGeography;
  candidate_account_ids: string[];
  reason: string;
};

export type StoreAccount = {
  id: string;
  displayName: string;
  city: string | null;
  county: string | null;
  licenseRef: string | null;
};

export type PriorResolution = {
  nameNormalized: string;
  choice: 'account' | 'none';
  accountId: string | null;
};

export type ParsedHoodieFile = {
  fileName: string;
  sha256: string;
  reportType: ReportType | null;
  geography: HoodieGeography | null;
  grain: Grain | null;
  periodMonth: string | null;
  compareMonth: string | null;
  exportDate: string | null;
  columnSignature: string;
  rows: StagedRow[];
  facts: Fact[];
  queue: QueueItem[];
  errors: string[];
  warnings: string[];
  status: 'validated' | 'rejected';
};

const REPORT_GEO: Record<ReportType, HoodieGeography | null> = {
  F1: null,
  F2: 'NY',
  F3: 'NY',
  F4: 'NY',
  F5: 'NY',
  F6: 'NY',
  F7: null,
  F8: 'NY',
  F9: 'NY:Erie',
  F10: 'NY:Erie',
};

const NEEDS_PERIOD = new Set<ReportType>(['F3', 'F4', 'F5', 'F6', 'F8', 'F9', 'F10']);

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function duplicateOf(sha256: string, known: ReadonlySet<string>): boolean {
  return known.has(sha256);
}

export function namedStaffLabel(label: string | null | undefined): string | null {
  if (!label) return null;
  const trimmed = label.trim();
  if (trimmed.length < 3 || trimmed.length > 320) return null;
  if (!/^[^\s@]+@[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

export function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function baseFileName(name: string): string {
  const trimmed = name.trim().split(/[/\\]/).pop() || '';
  return trimmed.slice(0, 500);
}

export function monthStart(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const month = trimmed.match(/^(\d{4})-(\d{2})$/);
  const full = trimmed.match(/^(\d{4})-(\d{2})-01$/);
  const year = month?.[1] || full?.[1];
  const mon = month?.[2] || full?.[2];
  if (!year || !mon) return null;
  const n = Number(mon);
  if (n < 1 || n > 12) return null;
  return `${year}-${mon}-01`;
}

export function naturalKey(fact: Fact): string {
  switch (fact.kind) {
    case 'market_sales':
      return `market_sales|${fact.period_month}|${fact.state}|${fact.category}`;
    case 'brand_month':
      return `brand_month|${fact.period_month}|${fact.geography}|${fact.brand_normalized}|${fact.source_report}`;
    case 'size':
      return `size|${fact.period_month}|${fact.geography}|${fact.size_label}`;
    case 'subsegment':
      return `subsegment|${fact.period_month}|${fact.geography}|${fact.segment}|${fact.sub_segment}`;
    case 'product':
      return `product|${fact.period_month}|${fact.geography}|${fact.product_normalized}`;
    case 'dispensary':
      return `dispensary|${fact.period_month}|${fact.geography}|${fact.name_normalized}`;
    case 'price_week':
      return `price_week|${fact.week_start}|${fact.segment}|${fact.unit_of_measure}`;
    default: {
      const unreachable: never = fact;
      return unreachable;
    }
  }
}

export function upsertFacts(existing: readonly Fact[], incoming: readonly Fact[]): Fact[] {
  const byKey = new Map<string, Fact>();
  for (const fact of existing) byKey.set(naturalKey(fact), fact);
  for (const fact of incoming) byKey.set(naturalKey(fact), fact);
  return [...byKey.values()];
}

export function dedupeFacts(facts: readonly Fact[]): { facts: Fact[]; duplicateKeys: string[] } {
  const byKey = new Map<string, Fact>();
  const duplicateKeys: string[] = [];
  for (const fact of facts) {
    const key = naturalKey(fact);
    if (byKey.has(key)) duplicateKeys.push(key);
    byKey.set(key, fact);
  }
  return { facts: [...byKey.values()], duplicateKeys };
}

export type ApprovalDecision =
  | { ok: true; published: false; idempotent: false; status: 'validated' | 'staged'; facts: [] }
  | { ok: true; published: true; idempotent: boolean; status: 'published'; approvedBy: string; approvedAt: string; facts: Fact[] }
  | { ok: false; published: false; reason: string };

// Nothing is published until a named staff person approves. A second approval
// of the same run returns the original approver and time and does not add rows.
export function approveRun(input: {
  status: RunStatus;
  approver: string | null;
  facts: readonly Fact[];
  approvedBy: string | null;
  approvedAt: string | null;
  now: string;
}): ApprovalDecision {
  const named = namedStaffLabel(input.approver);
  if (!named) return { ok: false, published: false, reason: 'A named staff approver is required.' };
  if (input.status === 'rejected') return { ok: false, published: false, reason: 'A rejected file cannot be published.' };
  if (input.status === 'superseded') return { ok: false, published: false, reason: 'A superseded file cannot be published.' };
  if (input.status === 'published') {
    return {
      ok: true,
      published: true,
      idempotent: true,
      status: 'published',
      approvedBy: input.approvedBy || named,
      approvedAt: input.approvedAt || input.now,
      facts: [...input.facts],
    };
  }
  return {
    ok: true,
    published: true,
    idempotent: false,
    status: 'published',
    approvedBy: named,
    approvedAt: input.now,
    facts: [...input.facts],
  };
}

export function rowCountCheck(current: number, prior: number | null): { status: 'no_prior' | 'within' | 'outside'; warning: string | null } {
  if (prior === null || prior < 0) return { status: 'no_prior', warning: null };
  const outside = current * 5 < prior * 4 || current * 5 > prior * 6;
  if (!outside) return { status: 'within', warning: null };
  return { status: 'outside', warning: `Row count ${current} is outside 20 percent of the prior file (${prior}).` };
}

export function monthGap(previous: string | null, next: string | null): 'none' | 'same' | 'next' | 'gap' {
  if (!previous || !next) return 'none';
  if (previous === next) return 'same';
  const [year, month] = previous.split('-').map(Number);
  const expectedMonth = month === 12 ? 1 : month + 1;
  const expectedYear = month === 12 ? year + 1 : year;
  const expected = `${expectedYear}-${String(expectedMonth).padStart(2, '0')}-01`;
  return next === expected ? 'next' : 'gap';
}

export function centsOf(value: string | null): bigint | null {
  if (value === null) return null;
  if (!/^-?\d+(\.\d+)?$/.test(value)) return null;
  const neg = value.startsWith('-');
  const body = neg ? value.slice(1) : value;
  const [whole, frac = ''] = body.split('.');
  const padded = `${frac}00`.slice(0, 2);
  const cents = BigInt(whole || '0') * 100n + BigInt(padded);
  return neg ? -cents : cents;
}

export function matchStore(input: {
  nameRaw: string;
  geography: HoodieGeography;
  licenseRef?: string | null;
  accounts: readonly StoreAccount[];
  prior: PriorResolution | null;
}): { match_status: MatchStatus; account_id: string | null; queue: QueueItem | null; createAccount: false } {
  const nameNormalized = normalizeKey(input.nameRaw);
  const refuse = { createAccount: false as const };
  if (nameNormalized === 'nontrackednewyorksales') {
    return { ...refuse, match_status: 'residual', account_id: null, queue: null };
  }
  if (input.prior?.choice === 'account' && input.prior.accountId) {
    return { ...refuse, match_status: 'manual', account_id: input.prior.accountId, queue: null };
  }
  if (input.prior?.choice === 'none') {
    return { ...refuse, match_status: 'none', account_id: null, queue: null };
  }
  const license = normalizeKey(input.licenseRef || '');
  if (license) {
    const hits = input.accounts.filter((account) => normalizeKey(account.licenseRef || '') === license);
    if (hits.length === 1) return { ...refuse, match_status: 'auto', account_id: hits[0].id, queue: null };
    if (hits.length > 1) {
      return {
        ...refuse,
        match_status: 'queued',
        account_id: null,
        queue: queueFor(input, nameNormalized, hits.map((hit) => hit.id), 'Several accounts share this license number.'),
      };
    }
  }
  const town = townSuffix(input.nameRaw);
  const agrees = (account: StoreAccount) => geoAgrees(input.geography, town, account);
  const fullHits = input.accounts.filter((account) => normalizeKey(account.displayName) === nameNormalized);
  const agreed = fullHits.filter(agrees);
  if (fullHits.length > 0) {
    if (agreed.length === 1) return { ...refuse, match_status: 'auto', account_id: agreed[0].id, queue: null };
    const reason = fullHits.length > 1 && agreed.length !== 1
      ? (agreed.length > 1 ? 'Several accounts match this store name.' : 'City or county does not agree.')
      : 'City or county does not agree.';
    return {
      ...refuse,
      match_status: 'queued',
      account_id: null,
      queue: queueFor(input, nameNormalized, fullHits.map((hit) => hit.id), reason),
    };
  }
  if (town) {
    const prefix = normalizeKey(input.nameRaw.slice(0, input.nameRaw.lastIndexOf(' - ')));
    const prefixHits = input.accounts.filter((account) => normalizeKey(account.displayName) === prefix);
    if (prefixHits.length > 0) {
      return {
        ...refuse,
        match_status: 'queued',
        account_id: null,
        queue: queueFor(input, nameNormalized, prefixHits.map((hit) => hit.id), 'Prefix only. The town suffix does not match a single account name.'),
      };
    }
  }
  return {
    ...refuse,
    match_status: 'queued',
    account_id: null,
    queue: queueFor(input, nameNormalized, [], 'No candidate account.'),
  };
}

function queueFor(input: { nameRaw: string; geography: HoodieGeography }, nameNormalized: string, ids: string[], reason: string): QueueItem {
  return {
    name_raw: input.nameRaw,
    name_normalized: nameNormalized,
    geography: input.geography,
    candidate_account_ids: ids,
    reason,
  };
}

function townSuffix(name: string): string | null {
  const at = name.lastIndexOf(' - ');
  if (at <= 0) return null;
  const town = name.slice(at + 3).trim();
  return town || null;
}

function geoAgrees(geography: HoodieGeography, town: string | null, account: StoreAccount): boolean {
  if (geography === 'NY:Erie') return normalizeKey(account.county || '') === 'erie';
  if (town) return normalizeKey(account.city || '') === normalizeKey(town);
  return true;
}

export function parseSizeLabel(label: string): { sizeMg: number | null; flag: boolean } {
  const trimmed = label.trim();
  if (!trimmed) return { sizeMg: null, flag: true };
  const mg = trimmed.match(/^(\d+(?:\.\d+)?)\s*mg$/i);
  if (mg) {
    const value = Number(mg[1]);
    if (value === 1) return { sizeMg: null, flag: true };
    return { sizeMg: value, flag: false };
  }
  const gram = trimmed.match(/^(\d+(?:\.\d+)?)\s*grams?$/i);
  if (gram) return { sizeMg: Math.round(Number(gram[1]) * 1000), flag: false };
  return { sizeMg: null, flag: true };
}

export function parseProductBrand(name: string): { brand: string | null; status: 'parsed' | 'unparsed' } {
  const at = name.indexOf(' - ');
  if (at <= 0) return { brand: null, status: 'unparsed' };
  const brand = name.slice(0, at).trim();
  if (!brand) return { brand: null, status: 'unparsed' };
  return { brand, status: 'parsed' };
}

export function parseProductSize(name: string): { mg: number | null; approximate: boolean } {
  const match = name.match(/(\d+(?:\.\d+)?)\s*g(?:ram)?s?\b/i);
  if (!match) return { mg: null, approximate: false };
  return { mg: Math.round(Number(match[1]) * 1000), approximate: true };
}

export function isCedarGrowthBrand(display: string): boolean {
  const key = normalizeKey(display);
  return key === 'cedargrowth' || key === 'cedargrowthorganics';
}

type DecimalResult = { ok: true; value: string | null } | { ok: false; reason: string };

function parseDecimal(raw: string, kind: 'value' | 'change'): DecimalResult {
  const trimmed = raw.trim();
  if (trimmed === '' || /^n\/a$/i.test(trimmed)) {
    if (kind === 'change') return { ok: true, value: null };
    if (trimmed === '') return { ok: false, reason: 'A value cell is empty.' };
    return { ok: false, reason: 'N/A is only valid in a change column.' };
  }
  if (/^null$/i.test(trimmed)) return { ok: true, value: null };
  const cleaned = trimmed.replace(/[$,]/g, '').replace(/%/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return { ok: false, reason: `Could not parse "${trimmed}".` };
  return { ok: true, value: cleaned };
}

function headerDate(value: string): string | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function sameHeaders(actual: string[], expected: readonly string[]): boolean {
  if (actual.length < expected.length) return false;
  return expected.every((cell, index) => actual[index]?.trim() === cell);
}

function rawRecord(headers: string[], row: string[]): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((header, index) => {
    const key = header.trim() || `column_${index + 1}`;
    record[key] = row[index] ?? '';
  });
  return record;
}

function emptyMetrics(): VdMetrics {
  return Object.fromEntries(VD_FIELDS.map((field) => [field[1], null])) as VdMetrics;
}

function readMetrics(row: string[], header: string[], line: number, errors: string[]): VdMetrics | null {
  const metrics = emptyMetrics();
  let ok = true;
  const index = new Map(header.map((cell, at) => [cell.trim(), at]));
  for (const [label, column, kind] of VD_FIELDS) {
    const at = index.get(label);
    if (at === undefined) {
      errors.push(`Row ${line}: missing column ${label}.`);
      ok = false;
      continue;
    }
    const parsed = parseDecimal(row[at] ?? '', kind);
    if (!parsed.ok) {
      errors.push(`Row ${line}: ${label}: ${parsed.reason}`);
      ok = false;
      continue;
    }
    metrics[column] = parsed.value;
  }
  return ok ? metrics : null;
}

type HeaderFamily = 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6' | 'F7' | 'F8';

function headerFamily(rows: string[][]): HeaderFamily | null {
  const top = rows[0] || [];
  const next = rows[1] || [];
  if (top[1]?.trim() === 'Sales Month' && next[0]?.trim() === 'State' && next[1]?.trim() === 'Category') return 'F1';
  if (top[0]?.trim() === 'Sales Month' && next[0]?.trim() === 'Brand') return 'F2';
  if (top.some((cell) => cell.trim() === 'Seen At') && next[0]?.trim() === 'Category' && next[2]?.trim() === 'Unit of Measure') return 'F7';
  if (sameHeaders(top, ['Category', 'Segment', 'Product', ...VD_HEADERS])) return 'F8';
  if (sameHeaders(top, ['Category', 'Segment', 'Sub-segment', ...VD_HEADERS])) return 'F6';
  if (sameHeaders(top, ['Category', 'Size', ...VD_HEADERS])) return 'F5';
  if (sameHeaders(top, ['Dispensary', ...VD_HEADERS])) return 'F4';
  if (sameHeaders(top, ['Brand', ...VD_HEADERS])) return 'F3';
  return null;
}

function familyOf(report: ReportType): HeaderFamily {
  if (report === 'F9') return 'F3';
  if (report === 'F10') return 'F4';
  return report;
}

export function detectReport(fileName: string, rows: string[][], explicit: string | null): { ok: true; reportType: ReportType } | { ok: false; reason: string } {
  const family = headerFamily(rows);
  if (!family) return { ok: false, reason: 'The header signature does not match a Hoodie report.' };
  const fromName = reportFromName(fileName);
  const requested = explicit && (REPORT_TYPES as readonly string[]).includes(explicit) ? (explicit as ReportType) : null;
  if (requested && fromName && requested !== fromName) return { ok: false, reason: 'The file name and the report type do not agree.' };
  const chosen = requested || fromName;
  if (chosen) {
    if (familyOf(chosen) !== family) return { ok: false, reason: 'The header signature does not match the report type.' };
    return { ok: true, reportType: chosen };
  }
  if (family === 'F3' || family === 'F4') return { ok: false, reason: 'This header is shared by the statewide and Erie files. The file name has to identify which one it is.' };
  return { ok: true, reportType: family };
}

function reportFromName(fileName: string): ReportType | null {
  const name = fileName.toLowerCase();
  if (name.includes('monthly_market') || name.includes('monthly market')) return 'F1';
  if (name.includes('trended') || name.includes('monthlysales')) return 'F2';
  if (name.includes('liverosin') || name.includes('live_rosin') || name.includes('live rosin')) return 'F8';
  if (name.includes('segment_price') || name.includes('original_price') || name.includes('1g_segment')) return 'F7';
  if (name.includes('subsegment') || name.includes('sub-segment') || name.includes('sub_segment')) return 'F6';
  if (name.includes('by_size') || name.includes('by size')) return 'F5';
  if (name.includes('erie') && name.includes('dispensary')) return 'F10';
  if (name.includes('erie') && name.includes('brand')) return 'F9';
  if (name.includes('dispensary')) return 'F4';
  if (name.includes('by_brand') || name.includes('by brand') || name.includes('vapes_by_brand')) return 'F3';
  return null;
}

function exportDateFromName(fileName: string): string | null {
  const match = baseFileName(fileName).match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return null;
  const [, year, month, day] = match[0].match(/^(\d{4})-(\d{2})-(\d{2})$/) || [];
  if (!year || Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) return null;
  return match[1];
}

function blankToUnassigned(value: string): string {
  return value.trim() ? value.trim() : 'Unassigned';
}

export function parseHoodieFile(input: {
  fileName: string;
  csv: string;
  bytes?: Uint8Array;
  reportType?: string | null;
  periodMonth?: string | null;
  compareMonth?: string | null;
  accounts?: readonly StoreAccount[];
  prior?: readonly PriorResolution[];
  priorRowCount?: number | null;
  priorPeriod?: string | null;
}): ParsedHoodieFile {
  const fileName = baseFileName(input.fileName);
  const bytes = input.bytes ?? new TextEncoder().encode(input.csv);
  const sha256 = sha256Hex(bytes);
  const grid = parseCsv(input.csv);
  const detected = detectReport(fileName, grid, input.reportType ?? null);
  const base: ParsedHoodieFile = {
    fileName,
    sha256,
    reportType: detected.ok ? detected.reportType : null,
    geography: detected.ok ? REPORT_GEO[detected.reportType] : null,
    grain: null,
    periodMonth: null,
    compareMonth: monthStart(input.compareMonth),
    exportDate: exportDateFromName(fileName),
    columnSignature: (grid[0] || []).map((cell) => cell.trim()).join('|').slice(0, 2000),
    rows: [],
    facts: [],
    queue: [],
    errors: [],
    warnings: [],
    status: 'rejected',
  };
  if (!detected.ok) {
    base.errors.push(detected.reason);
    return base;
  }
  const report = detected.reportType;
  base.grain = report === 'F7' ? 'week' : 'month';
  const period = monthStart(input.periodMonth);
  if (NEEDS_PERIOD.has(report) && !period) {
    base.errors.push('Enter the sales month for this file. The volume driver export does not carry a period column.');
    return base;
  }
  if (NEEDS_PERIOD.has(report) && input.compareMonth && !base.compareMonth) {
    base.errors.push('Compare month must be the first day of a month.');
    return base;
  }
  const priorByName = new Map((input.prior || []).map((row) => [row.nameNormalized, row]));
  const built = report === 'F1' || report === 'F2' || report === 'F7'
    ? parseWide(report, grid, base.errors, base.warnings)
    : parseTall(report, grid, period as string, input.accounts || [], priorByName, base.errors, base.warnings);
  base.rows = built.rows;
  const deduped = dedupeFacts(built.facts);
  base.facts = deduped.facts;
  base.queue = built.queue;
  if (deduped.duplicateKeys.length) base.warnings.push(`Duplicate natural keys in the file were collapsed: ${deduped.duplicateKeys.length}.`);
  const drift = rowCountCheck(base.rows.length, input.priorRowCount ?? null);
  if (drift.warning) base.warnings.push(drift.warning);
  const gap = monthGap(input.priorPeriod ?? null, period);
  if (gap === 'gap') base.warnings.push('The sales month does not follow the prior month.');
  if (report === 'F1' || report === 'F2' || report === 'F7') {
    const dates = base.facts.flatMap((fact) => ('period_month' in fact ? [fact.period_month] : 'week_start' in fact ? [fact.week_start] : []));
    base.periodMonth = dates.sort().at(-1) ?? null;
  } else {
    base.periodMonth = period;
  }
  base.columnSignature = built.signature || base.columnSignature;
  base.status = base.errors.length ? 'rejected' : 'validated';
  if (base.status === 'rejected') {
    base.facts = [];
    base.queue = [];
    base.rows = base.rows.map((row) => ({ ...row, parsed: [] }));
  }
  return base;
}

function parseWide(report: ReportType, grid: string[][], errors: string[], warnings: string[]): { rows: StagedRow[]; facts: Fact[]; queue: QueueItem[]; signature: string } {
  const top = grid[0] || [];
  const names = grid[1] || [];
  const rows: StagedRow[] = [];
  const facts: Fact[] = [];
  const dates: { index: number; day: string }[] = [];
  const totalIndex = top.findIndex((cell) => cell.trim() === 'Total');
  for (let index = 0; index < top.length; index += 1) {
    const label = top[index]?.trim() || '';
    if (!label || label === 'Sales Month' || label === 'Seen At') continue;
    if (label === 'Total') continue;
    const day = headerDate(label);
    if (!day) {
      errors.push(`Column ${index + 1} is not a date.`);
      continue;
    }
    dates.push({ index, day });
  }
  if (!dates.length) errors.push('No dated columns were found.');
  grid.slice(2).forEach((row, offset) => {
    const line = offset + 3;
    const raw = rawRecord(names.map((cell, index) => cell.trim() || top[index]?.trim() || `column_${index + 1}`), row);
    const parsed: Fact[] = [];
    if (report === 'F1') {
      const state = row[0]?.trim() || '';
      const category = row[1]?.trim() || '';
      if (normalizeKey(state) === 'total') {
        checkWideTotal(dates, row, totalIndex, line, errors);
        rows.push({ row_num: rows.length + 1, raw, parsed: [] });
        return;
      }
      const unpublished = /^null$/i.test(category) || category === '';
      if (unpublished) warnings.push('A null category row was staged and was not published.');
      for (const date of dates) {
        const dollars = parseDecimal(row[date.index] ?? '', 'value');
        if (!dollars.ok || dollars.value === null) {
          if (unpublished && (row[date.index] ?? '').trim().toLowerCase() === 'null') continue;
          errors.push(`Row ${line}: ${dollars.ok ? 'A value cell is empty.' : dollars.reason}`);
          continue;
        }
        if (!unpublished && normalizeKey(state) === 'newyork') {
          parsed.push({ kind: 'market_sales', period_month: date.day, state: 'NY', category, dollars: dollars.value });
        }
      }
    } else if (report === 'F2') {
      const brand = row[0]?.trim() || '';
      if (normalizeKey(brand) === 'total') {
        checkWideTotal(dates, row, totalIndex, line, errors);
        rows.push({ row_num: rows.length + 1, raw, parsed: [] });
        return;
      }
      for (const date of dates) {
        const dollars = parseDecimal(row[date.index] ?? '', 'value');
        if (!dollars.ok || dollars.value === null) {
          errors.push(`Row ${line}: ${dollars.ok ? 'A value cell is empty.' : dollars.reason}`);
          continue;
        }
        parsed.push({
          kind: 'brand_month',
          period_month: date.day,
          geography: 'NY',
          brand_display: brand,
          brand_normalized: normalizeKey(brand),
          source_report: 'F2',
          is_cedargrowth: isCedarGrowthBrand(brand),
          dollars: dollars.value,
          metrics: null,
        });
      }
    } else {
      const category = row[0]?.trim() || '';
      const segment = row[1]?.trim() || '';
      const unit = row[2]?.trim() || '';
      for (const date of dates) {
        const price = parseDecimal(row[date.index] ?? '', 'value');
        if (!price.ok || price.value === null) {
          errors.push(`Row ${line}: ${price.ok ? 'A value cell is empty.' : price.reason}`);
          continue;
        }
        parsed.push({
          kind: 'price_week',
          week_start: date.day,
          category,
          segment,
          unit_of_measure: unit,
          original_price_avg: price.value,
        });
      }
    }
    facts.push(...parsed);
    rows.push({ row_num: rows.length + 1, raw, parsed });
  });
  return { rows, facts, queue: [], signature: names.map((cell) => cell.trim()).join('|').slice(0, 2000) };
}

function checkWideTotal(dates: { index: number; day: string }[], row: string[], totalIndex: number, line: number, errors: string[]) {
  if (totalIndex < 0) return;
  const total = parseDecimal(row[totalIndex] ?? '', 'value');
  if (!total.ok || total.value === null) return;
  let sum = 0n;
  for (const date of dates) {
    const cell = parseDecimal(row[date.index] ?? '', 'value');
    const cents = cell.ok ? centsOf(cell.value) : null;
    if (cents === null) return;
    sum += cents;
  }
  if (sum !== centsOf(total.value)) errors.push(`Row ${line}: the Total column does not equal the sum of the months.`);
}

function parseTall(
  report: ReportType,
  grid: string[][],
  period: string,
  accounts: readonly StoreAccount[],
  priorByName: Map<string, PriorResolution>,
  errors: string[],
  warnings: string[],
): { rows: StagedRow[]; facts: Fact[]; queue: QueueItem[]; signature: string } {
  const header = (grid[0] || []).map((cell) => cell.trim());
  const rows: StagedRow[] = [];
  const facts: Fact[] = [];
  const queue: QueueItem[] = [];
  const geography = REPORT_GEO[report];
  grid.slice(1).forEach((row, offset) => {
    const line = offset + 2;
    const raw = rawRecord(header, row);
    const metrics = readMetrics(row, header, line, errors);
    if (!metrics || !geography) {
      rows.push({ row_num: rows.length + 1, raw, parsed: [] });
      return;
    }
    const parsed: Fact[] = [];
    if (report === 'F3' || report === 'F9') {
      const brand = row[0]?.trim() || '';
      if (!brand) errors.push(`Row ${line}: Brand is empty.`);
      else {
        parsed.push({
          kind: 'brand_month',
          period_month: period,
          geography,
          brand_display: brand,
          brand_normalized: normalizeKey(brand),
          source_report: report,
          is_cedargrowth: isCedarGrowthBrand(brand),
          dollars: null,
          metrics,
        });
      }
    } else if (report === 'F5') {
      const sizeLabel = row[1]?.trim() || '';
      const size = parseSizeLabel(sizeLabel);
      if (size.flag) warnings.push(`Size "${sizeLabel || '(blank)'}" was staged with no milligram value.`);
      parsed.push({
        kind: 'size',
        period_month: period,
        geography,
        category: row[0]?.trim() || '',
        size_label: sizeLabel,
        size_mg: size.sizeMg,
        size_unparsed: size.flag,
        metrics,
      });
    } else if (report === 'F6') {
      parsed.push({
        kind: 'subsegment',
        period_month: period,
        geography,
        category: row[0]?.trim() || '',
        segment: blankToUnassigned(row[1] || ''),
        sub_segment: blankToUnassigned(row[2] || ''),
        metrics,
      });
    } else if (report === 'F8') {
      const product = row[2]?.trim() || '';
      const brand = parseProductBrand(product);
      const size = parseProductSize(product);
      if (brand.status === 'unparsed') warnings.push(`Product brand was not parsed and needs a hand review: ${product.slice(0, 80)}.`);
      parsed.push({
        kind: 'product',
        period_month: period,
        geography,
        category: row[0]?.trim() || '',
        segment: row[1]?.trim() || '',
        product_name: product,
        product_normalized: normalizeKey(product),
        brand_parsed: brand.brand,
        brand_parse_status: brand.status,
        size_mg_parsed: size.mg,
        size_approximate: size.approximate,
        is_live_rosin: true,
        metrics,
      });
    } else if (report === 'F4' || report === 'F10') {
      const name = row[0]?.trim() || '';
      if (!name) errors.push(`Row ${line}: Dispensary is empty.`);
      else {
        const decision = matchStore({
          nameRaw: name,
          geography,
          accounts,
          prior: priorByName.get(normalizeKey(name)) ?? null,
        });
        if (decision.queue) queue.push(decision.queue);
        parsed.push({
          kind: 'dispensary',
          period_month: period,
          geography,
          name_raw: name,
          name_normalized: normalizeKey(name),
          account_id: decision.account_id,
          match_status: decision.match_status,
          metrics,
        });
      }
    }
    facts.push(...parsed);
    rows.push({ row_num: rows.length + 1, raw, parsed });
  });
  return { rows, facts, queue, signature: header.join('|').slice(0, 2000) };
}

export function sumFactDollars(facts: readonly Fact[], period: string | null, report: ReportType | null): bigint | null {
  if (!period) return null;
  let sum = 0n;
  let seen = false;
  for (const fact of facts) {
    if (report === 'F1' && fact.kind === 'market_sales' && fact.period_month === period && fact.category === 'Vapes') {
      const cents = centsOf(fact.dollars);
      if (cents === null) return null;
      sum += cents;
      seen = true;
    } else if (report === 'F2' && fact.kind === 'brand_month' && fact.source_report === 'F2' && fact.period_month === period) {
      const cents = centsOf(fact.dollars);
      if (cents === null) return null;
      sum += cents;
      seen = true;
    } else if ((report === 'F3' || report === 'F9') && fact.kind === 'brand_month' && fact.source_report === report) {
      const cents = centsOf(fact.metrics?.total_dollars ?? null);
      if (cents === null) return null;
      sum += cents;
      seen = true;
    } else if ((report === 'F4' || report === 'F5' || report === 'F6' || report === 'F8' || report === 'F10') && 'metrics' in fact && fact.metrics) {
      const cents = centsOf(fact.metrics.total_dollars);
      if (cents === null) return null;
      sum += cents;
      seen = true;
    }
  }
  return seen ? sum : null;
}

export function reviewPack(files: readonly ParsedHoodieFile[]): ParsedHoodieFile[] {
  const copies = files.map((file) => ({ ...file, errors: [...file.errors], warnings: [...file.warnings] }));
  const byType = new Map(copies.filter((file) => file.reportType && file.status === 'validated').map((file) => [file.reportType as ReportType, file]));
  const period = byType.get('F4')?.periodMonth || byType.get('F5')?.periodMonth || byType.get('F1')?.periodMonth || null;
  const tieTypes: ReportType[] = ['F1', 'F2', 'F4', 'F5', 'F6'];
  const present = tieTypes.filter((type) => byType.has(type));
  if (present.length && present.length < tieTypes.length) {
    for (const file of copies) file.warnings.push('Partial pack: the market total was not tied across F1, F2, F4, F5, and F6.');
  }
  if (present.length === tieTypes.length && period) {
    const sums = tieTypes.map((type) => sumFactDollars(byType.get(type)?.facts || [], period, type));
    if (sums.some((sum) => sum === null) || new Set(sums.map((sum) => sum?.toString())).size > 1) {
      for (const type of tieTypes) {
        const file = byType.get(type);
        if (file) file.errors.push('Market total does not tie to the cent across F1, F2, F4, F5, and F6.');
      }
    }
  }
  const market = period ? sumFactDollars(byType.get('F1')?.facts || [], period, 'F1') : null;
  for (const type of ['F3', 'F9'] as const) {
    const file = byType.get(type);
    if (!file) continue;
    const sum = sumFactDollars(file.facts, file.periodMonth, type);
    if (market !== null && sum !== null && sum !== market) file.warnings.push('Brand file does not sum to the market total. This is a warning, not a failed import.');
  }
  const erieBrands = byType.get('F9');
  const erieStores = byType.get('F10');
  if (erieBrands && erieStores) {
    const brandSum = sumFactDollars(erieBrands.facts, erieBrands.periodMonth, 'F9');
    const storeSum = sumFactDollars(erieStores.facts, erieStores.periodMonth, 'F10');
    if (brandSum !== null && storeSum !== null && brandSum !== storeSum) {
      erieBrands.warnings.push('Erie brand dollars do not equal Erie dispensary dollars. This is a warning, not a failed import.');
    }
  }
  const nyStores = byType.get('F4');
  if (erieStores && !nyStores) erieStores.warnings.push('Statewide dispensary file was not in this upload, so Erie names were not checked against it.');
  if (erieStores && nyStores) {
    const names = new Set(nyStores.facts.filter((fact) => fact.kind === 'dispensary').map((fact) => fact.name_normalized));
    const missing = erieStores.facts.filter((fact) => fact.kind === 'dispensary' && !names.has(fact.name_normalized));
    if (missing.length) erieStores.errors.push('An Erie dispensary name is missing from the statewide file.');
  }
  for (const file of copies) {
    if (file.errors.length) {
      file.status = 'rejected';
      file.facts = [];
      file.queue = [];
      file.rows = file.rows.map((row) => ({ ...row, parsed: [] }));
    }
  }
  return copies;
}

export function stagePayload(file: ParsedHoodieFile, uploadedBy: string, driveFileId: string | null) {
  return {
    sha256: file.sha256,
    report_type: file.reportType,
    geography: file.geography,
    period_month: file.periodMonth,
    compare_month: file.compareMonth,
    grain: file.grain,
    file_name: file.fileName,
    drive_file_id: driveFileId,
    export_date: file.exportDate,
    column_signature: file.columnSignature,
    uploaded_by: uploadedBy,
    validation_report: {
      errors: file.errors,
      warnings: file.warnings,
      row_count: file.rows.length,
    },
    rows: file.rows.map((row) => ({ row_num: row.row_num, raw: row.raw, parsed: row.parsed })),
    fact_rows: file.status === 'validated' ? file.facts : [],
    queue: file.status === 'validated' ? file.queue : [],
  };
}
