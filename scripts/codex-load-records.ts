// Loads a spreadsheet from a path outside the repo. Do not commit the file.
// Put local files in the gitignored data folder. This script prints counts and
// row numbers only. It does not print the secret, the site URL, names, emails,
// or phone numbers.

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { mapRows, matchHeaders, parseCsv, type ImportRow } from '../src/lib/crm/importer.ts';
import { signIntake } from '../src/lib/crm/intake.ts';
import { AGENT_HOUR_LIMIT, AGENT_ROW_LIMIT, agentRateLimited, parseAgentRow } from '../src/lib/crm/agentIntake.ts';

export type CodexRow = { line: number; payload: Record<string, unknown> };
export type CodexIssue = { line: number; reason: string };
export type CodexPlan = { ready: CodexRow[]; failed: CodexIssue[] };

const SECRET_ENV = 'CG_AGENT_INTAKE_SECRET';
const URL_ENV = 'CG_AGENT_INTAKE_URL';

export function planCodexCsv(kind: 'accounts' | 'contacts', text: string): CodexPlan {
  const table = parseCsv(text);
  const mapped = mapRows(kind, table);
  const failed: CodexIssue[] = [];
  if (mapped.missing.length) failed.push({ line: 1, reason: 'The header is missing a required column.' });
  const columns = kind === 'accounts' ? matchHeaders('accounts', table[0] || []).columns : {};
  const ready: CodexRow[] = [];
  for (const row of mapped.rows) {
    if (row.error || !row.record) {
      failed.push({ line: row.line, reason: row.error || 'Row could not be read.' });
      continue;
    }
    const source = table[row.line - 1] || [];
    const payload = kind === 'accounts' ? accountPayload(row.record, source, columns) : contactPayload(row);
    const parsed = parseAgentRow(0, payload);
    if (!('op' in parsed)) failed.push({ line: row.line, reason: parsed.reason });
    else ready.push({ line: row.line, payload });
  }
  return { ready, failed };
}

export function codexBatches<T>(rows: readonly T[], size = AGENT_ROW_LIMIT): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < rows.length; i += size) batches.push(rows.slice(i, i + size));
  return batches;
}

export function codexWaitMs(nowMs: number, sentAt: readonly number[], limit = AGENT_HOUR_LIMIT): number {
  const decision = agentRateLimited(nowMs, sentAt, limit);
  return decision.limited ? decision.retryAfter * 1000 : 0;
}

export function codexSafeReason(reason: string, hidden: readonly string[]): string {
  const lowered = reason.toLowerCase();
  if (hidden.some((value) => value && lowered.includes(value.toLowerCase()))) return 'Row was rejected.';
  if (reason.includes('@')) return 'Row was rejected.';
  if (/\d{3}[-.\s]\d{3}[-.\s]\d{4}/.test(reason)) return 'Row was rejected.';
  return reason;
}

export function codexReport(label: string, ready: number, failed: readonly CodexIssue[], skipped: readonly CodexIssue[], hidden: readonly string[]): string[] {
  const issues = [...failed, ...skipped].sort((a, b) => a.line - b.line || a.reason.localeCompare(b.reason));
  return [
    `${label} ready ${ready}`,
    `${label} failed ${failed.length}`,
    `${label} skipped ${skipped.length}`,
    ...issues.map((row) => `row ${row.line}: ${codexSafeReason(row.reason, hidden)}`),
  ];
}

function accountPayload(record: Record<string, unknown>, source: string[], columns: Record<string, number>): Record<string, unknown> {
  const cell = (key: string) => {
    const index = columns[key];
    return index === undefined ? '' : (source[index] || '').trim();
  };
  return {
    kind: 'account',
    display_name: text(record.displayName),
    status: text(record.status),
    account_type: text(record.accountType),
    lead_source: text(record.leadSource),
    assigned_rep: text(record.assignedRep),
    city: text(record.city),
    county: text(record.county),
    state: 'NY',
    country: 'USA',
    license_number: text(record.licenseRef),
    license_expiry: text(record.licenseExpiry),
    street: cell('address'),
    postal_code: cell('zip'),
    phone: cell('phone'),
    email: cell('email'),
    website: cell('website'),
    operating: cell('operating'),
    region: cell('region'),
    license_status: cell('licenseStatus'),
    notes: cell('notes'),
  };
}

function contactPayload(row: ImportRow): Record<string, unknown> {
  const record = row.record || {};
  return {
    kind: 'contact',
    name: text(record.name),
    email: text(record.email),
    phone: text(record.phone),
    title: text(record.title),
    account_name: row.accountName || '',
    account_license: row.accountLicense || '',
  };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

type PostResult = { status: number; retryAfter: number; created: number; skipped: CodexIssue[]; failed: CodexIssue[] };

export async function runCodexLoad(argv: readonly string[], env: Record<string, string | undefined>, io: {
  read: (path: string) => string;
  post: (input: { url: string; body: string; headers: Record<string, string> }) => Promise<{ status: number; retryAfter: number; body: unknown }>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  print: (line: string) => void;
}): Promise<number> {
  const dryRun = argv.includes('--dry-run');
  const accountsPath = flagValue(argv, '--accounts');
  const contactsPath = flagValue(argv, '--contacts');
  if (!accountsPath && !contactsPath) {
    io.print('Pass --accounts or --contacts with a file path.');
    return 1;
  }
  const secret = env[SECRET_ENV]?.trim() || '';
  const baseUrl = env[URL_ENV]?.trim() || '';
  if (!dryRun && (!secret || !baseUrl)) {
    io.print('Missing configuration.');
    return 1;
  }
  const hidden = [secret, baseUrl];
  const sent: number[] = [];
  let exit = 0;
  if (accountsPath) exit = await loadKind('accounts', accountsPath, dryRun, secret, baseUrl, hidden, sent, io) || exit;
  if (contactsPath) exit = await loadKind('contacts', contactsPath, dryRun, secret, baseUrl, hidden, sent, io) || exit;
  return exit;
}

async function loadKind(kind: 'accounts' | 'contacts', path: string, dryRun: boolean, secret: string, baseUrl: string, hidden: readonly string[], sent: number[], io: {
  read: (path: string) => string;
  post: (input: { url: string; body: string; headers: Record<string, string> }) => Promise<{ status: number; retryAfter: number; body: unknown }>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  print: (line: string) => void;
}): Promise<number> {
  let text = '';
  try { text = io.read(path); } catch { io.print('File could not be read.'); return 1; }
  const plan = planCodexCsv(kind, text);
  const label = kind === 'accounts' ? 'accounts' : 'contacts';
  if (dryRun) {
    for (const line of codexReport(label, plan.ready.length, plan.failed, [], hidden)) io.print(line);
    return plan.failed.length ? 1 : 0;
  }
  const skipped: CodexIssue[] = [];
  const failed = [...plan.failed];
  let created = 0;
  for (const batch of codexBatches(plan.ready)) {
    const posted = await postBatch(batch, secret, baseUrl, sent, io);
    if (!posted) { io.print('Request failed.'); return 1; }
    if (posted.status === 503) { io.print('Writer is off.'); return 1; }
    if (posted.status !== 200) { io.print('Request failed.'); return 1; }
    created += posted.created;
    skipped.push(...posted.skipped);
    failed.push(...posted.failed);
  }
  for (const line of codexReport(label, plan.ready.length, failed, skipped, hidden)) io.print(line);
  io.print(`${label} created ${created}`);
  return failed.length ? 1 : 0;
}

async function postBatch(batch: readonly CodexRow[], secret: string, baseUrl: string, sent: number[], io: {
  post: (input: { url: string; body: string; headers: Record<string, string> }) => Promise<{ status: number; retryAfter: number; body: unknown }>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}): Promise<PostResult | null> {
  const url = new URL('/api/intake/agent-records', baseUrl).toString();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const wait = codexWaitMs(io.now(), sent);
    if (wait > 0) await io.sleep(wait);
    const requestId = randomUUID();
    const body = JSON.stringify({ request_id: requestId, brand: 'cedargrowth', rows: batch.map((row) => row.payload) });
    const stamp = String(Math.floor(io.now() / 1000));
    let response: { status: number; retryAfter: number; body: unknown };
    try {
      response = await io.post({
        url,
        body,
        headers: { 'content-type': 'application/json', 'x-cg-timestamp': stamp, 'x-cg-signature': signIntake(secret, stamp, body), 'idempotency-key': requestId },
      });
    } catch {
      return null;
    }
    if (response.status === 429) {
      await io.sleep(Math.max(1, response.retryAfter) * 1000);
      continue;
    }
    sent.push(io.now());
    const payload = response.body && typeof response.body === 'object' ? response.body as { created?: { accounts?: number; contacts?: number }; skipped?: { index?: number; reason?: string }[]; failed?: { index?: number; reason?: string }[] } : {};
    const created = batch[0]?.payload.kind === 'contact' ? Number(payload.created?.contacts) || 0 : Number(payload.created?.accounts) || 0;
    return {
      status: response.status,
      retryAfter: response.retryAfter,
      created,
      skipped: mapIssues(batch, payload.skipped),
      failed: mapIssues(batch, payload.failed),
    };
  }
  return { status: 429, retryAfter: 0, created: 0, skipped: [], failed: [] };
}

function mapIssues(batch: readonly CodexRow[], rows: { index?: number; reason?: string }[] | undefined): CodexIssue[] {
  return (rows || []).map((row) => ({
    line: batch[Number(row.index)]?.line ?? Number(row.index) + 1,
    reason: typeof row.reason === 'string' ? row.reason : 'Row was rejected.',
  }));
}

function flagValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index < 0) return null;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) return null;
  return value;
}

function isCodexLoaderMain(): boolean {
  const entry = process.argv[1] || '';
  return entry.endsWith('codex-load-records.ts') || entry.endsWith('codex-load-records.js');
}

if (isCodexLoaderMain()) {
  runCodexLoad(process.argv.slice(2), process.env, {
    read: (path) => readFileSync(path, 'utf8'),
    post: async ({ url, body, headers }) => {
      const response = await fetch(url, { method: 'POST', headers, body });
      const retryAfter = Number(response.headers.get('retry-after') || 0);
      let parsed: unknown = null;
      try { parsed = await response.json(); } catch { parsed = null; }
      return { status: response.status, retryAfter: Number.isFinite(retryAfter) ? retryAfter : 0, body: parsed };
    },
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    print: (line) => console.log(line),
  }).then((code) => process.exit(code));
}
