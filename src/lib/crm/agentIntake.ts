// Agent record intake. Pure checks only. No database, no network, no secrets.
// Writes are create only, for CedarGrowth accounts, contacts, and notes.

import { parseAccountWrite, parseContactWrite, parseUuid, type AccountStatus, type AccountType, type LeadSource } from './engine';
import { composeAccountNotes, matchLeadSource, parseDate } from './importer';
import { signIntake, signaturesMatch, timestampFresh } from './intake';

export const AGENT_ACTOR = 'CODEX agent';
export const AGENT_BRAND = 'cedargrowth';
export const AGENT_ROW_LIMIT = 50;
export const AGENT_HOUR_LIMIT = 20;
export const AGENT_HOUR_MS = 60 * 60 * 1000;
export const AGENT_MAX_BYTES = 64 * 1024;
export const AGENT_FLAG = 'AGENT_INTAKE_ENABLED';

const ENVELOPE_KEYS = ['request_id', 'brand', 'rows'] as const;
const ACCOUNT_KEYS = ['kind', 'display_name', 'status', 'account_type', 'lead_source', 'assigned_rep', 'city', 'county', 'state', 'country', 'license_number', 'license_expiry', 'street', 'postal_code', 'ocm_status', 'phone', 'email', 'website', 'operating', 'region', 'license_status', 'notes'] as const;
const CONTACT_KEYS = ['kind', 'name', 'email', 'phone', 'title', 'account_license', 'account_name'] as const;
const NOTE_KEYS = ['kind', 'body', 'account_license', 'account_name'] as const;
const DUMMY_ACCOUNT = '00000000-0000-4000-8000-000000000001';

export type AgentAccountOp = {
  op: 'account';
  index: number;
  displayName: string;
  status: AccountStatus;
  accountType: AccountType | null;
  leadSource: LeadSource | null;
  assignedRep: string | null;
  city: string | null;
  county: string | null;
  licenseNumber: string | null;
  licenseExpiry: string | null;
  street: string | null;
  postalCode: string | null;
  ocmStatus: 'unverified' | 'verified' | null;
  notes: string;
};

export type AgentContactOp = {
  op: 'contact';
  index: number;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  accountLicense: string | null;
  accountName: string | null;
};

export type AgentNoteOp = {
  op: 'note';
  index: number;
  body: string;
  accountLicense: string | null;
  accountName: string | null;
};

export type AgentOp = AgentAccountOp | AgentContactOp | AgentNoteOp;
export type AgentRowFailure = { index: number; reason: string; fields?: string[] };

export function agentReady(env: Record<string, string | undefined>): boolean {
  return env[AGENT_FLAG] === 'true' && !!env.CG_AGENT_INTAKE_SECRET?.trim();
}

export function agentSecret(env: Record<string, string | undefined>): string | null {
  if (env[AGENT_FLAG] !== 'true') return null;
  return env.CG_AGENT_INTAKE_SECRET?.trim() || null;
}

export function agentSignatureOk(secret: string, timestamp: string, raw: string, provided: string): boolean {
  return signaturesMatch(signIntake(secret, timestamp, raw), provided);
}

export function agentTimestampFresh(header: string | null, nowMs: number): boolean {
  return timestampFresh(header, nowMs);
}

export function agentRateLimited(nowMs: number, receivedAt: readonly number[], limit = AGENT_HOUR_LIMIT, windowMs = AGENT_HOUR_MS): { limited: boolean; retryAfter: number } {
  const fresh = receivedAt.filter((stamp) => nowMs - stamp < windowMs && nowMs >= stamp).sort((a, b) => a - b);
  if (fresh.length >= limit) {
    return { limited: true, retryAfter: Math.max(1, Math.ceil((fresh[0] + windowMs - nowMs) / 1000)) };
  }
  return { limited: false, retryAfter: 0 };
}

export function parseAgentEnvelope(value: unknown): { ok: true; requestId: string; rows: unknown[] } | { ok: false; fields: string[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, fields: ['payload'] };
  const record = value as Record<string, unknown>;
  const unknown = Object.keys(record).filter((key) => !(ENVELOPE_KEYS as readonly string[]).includes(key)).sort();
  if (unknown.length) return { ok: false, fields: unknown };
  const fields: string[] = [];
  const requestId = parseUuid(record.request_id);
  if (!requestId) fields.push('request_id');
  if (record.brand !== AGENT_BRAND) fields.push('brand');
  if (!Array.isArray(record.rows)) fields.push('rows');
  if (fields.length || !requestId || !Array.isArray(record.rows)) return { ok: false, fields };
  return { ok: true, requestId, rows: record.rows };
}

export function parseAgentRow(index: number, value: unknown): { ok: true; op: AgentOp } | AgentRowFailure {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { index, reason: 'Row could not be read.' };
  const record = value as Record<string, unknown>;
  const kind = record.kind;
  const allowed = kind === 'account' ? ACCOUNT_KEYS : kind === 'contact' ? CONTACT_KEYS : kind === 'note' ? NOTE_KEYS : null;
  if (!allowed) return { index, reason: 'This writer cannot create that record.' };
  const unknown = Object.keys(record).filter((key) => !(allowed as readonly string[]).includes(key)).sort();
  if (unknown.length) return { index, reason: 'Unknown field.', fields: unknown };
  if (kind === 'account') return parseAccountRow(index, record);
  if (kind === 'contact') return parseContactRow(index, record);
  return parseNoteRow(index, record);
}

function parseAccountRow(index: number, record: Record<string, unknown>): { ok: true; op: AgentAccountOp } | AgentRowFailure {
  if (record.state !== 'NY') return { index, reason: 'State must be NY.' };
  if (record.country !== 'USA') return { index, reason: 'Country must be USA.' };
  const leadSource = record.lead_source === undefined || record.lead_source === null || record.lead_source === '' ? null : typeof record.lead_source === 'string' ? matchLeadSource(record.lead_source) : 'invalid';
  if (leadSource === 'invalid') return { index, reason: 'Lead source is not recognized.' };
  const expiry = record.license_expiry === undefined || record.license_expiry === null || record.license_expiry === '' ? null : typeof record.license_expiry === 'string' ? parseDate(record.license_expiry) : 'invalid';
  if (expiry === 'invalid') return { index, reason: 'License expiry is not a date.' };
  const assignedRep = record.assigned_rep === undefined || record.assigned_rep === null || record.assigned_rep === '' ? null : typeof record.assigned_rep === 'string' ? record.assigned_rep.trim() : 'invalid';
  if (assignedRep === 'invalid' || (assignedRep && assignedRep.length > 200)) return { index, reason: 'Assigned rep is too long.' };
  const street = optionalBounded(record.street, 120);
  if (street === 'invalid') return { index, reason: 'Street is too long.' };
  const postalCode = optionalBounded(record.postal_code, 10);
  if (postalCode === 'invalid') return { index, reason: 'ZIP is too long.' };
  const ocmStatus = record.ocm_status === undefined || record.ocm_status === null || record.ocm_status === '' ? null : record.ocm_status === 'unverified' || record.ocm_status === 'verified' ? record.ocm_status : 'invalid';
  if (ocmStatus === 'invalid') return { index, reason: 'OCM status must be unverified or verified.' };
  const phone = optionalNote(record.phone);
  const email = optionalNote(record.email);
  const website = optionalNote(record.website);
  const operating = optionalNote(record.operating);
  const region = optionalNote(record.region);
  const licenseStatus = optionalNote(record.license_status);
  const noteText = optionalNote(record.notes);
  if ([phone, email, website, operating, region, licenseStatus, noteText].includes('invalid')) return { index, reason: 'Notes could not be read.' };
  const parsed = parseAccountWrite({
    displayName: record.display_name,
    status: record.status,
    accountType: record.account_type,
    leadSource,
    assignedRep,
    city: record.city,
    county: record.county,
    licenseRef: record.license_number,
    licenseExpiry: expiry,
  }, 'create');
  if (!parsed.ok || !parsed.value.displayName || !parsed.value.status) return { index, reason: parsed.ok ? 'Enter an account name.' : parsed.reason };
  const notes = composeAccountNotes({
    notes: noteText || '',
    address: street || '',
    zip: postalCode || '',
    county: parsed.value.county || '',
    region: region || '',
    phone: phone || '',
    email: email || '',
    website: website || '',
    licenseStatus: licenseStatus || '',
    operating: operating || '',
  });
  return {
    ok: true,
    op: {
      op: 'account',
      index,
      displayName: parsed.value.displayName,
      status: parsed.value.status,
      accountType: parsed.value.accountType ?? null,
      leadSource: parsed.value.leadSource ?? null,
      assignedRep: parsed.value.assignedRep ?? null,
      city: parsed.value.city ?? null,
      county: parsed.value.county ?? null,
      licenseNumber: parsed.value.licenseRef ?? null,
      licenseExpiry: parsed.value.licenseExpiry ?? null,
      street,
      postalCode,
      ocmStatus,
      notes,
    },
  };
}

function parseContactRow(index: number, record: Record<string, unknown>): { ok: true; op: AgentContactOp } | AgentRowFailure {
  const accountLicense = optionalLink(record.account_license);
  const accountName = optionalLink(record.account_name);
  if (accountLicense === 'invalid' || accountName === 'invalid') return { index, reason: 'Account link could not be read.' };
  if (!accountLicense && !accountName) return { index, reason: 'Link the contact to an account by license or exact name.' };
  const parsed = parseContactWrite({
    accountId: DUMMY_ACCOUNT,
    name: record.name,
    email: record.email,
    phone: record.phone,
    title: record.title,
    preference: 'unspecified',
  }, 'create');
  if (!parsed.ok || !parsed.value.name) return { index, reason: parsed.ok ? 'Enter a contact name.' : parsed.reason };
  return {
    ok: true,
    op: {
      op: 'contact',
      index,
      name: parsed.value.name,
      email: parsed.value.email ?? null,
      phone: parsed.value.phone ?? null,
      title: parsed.value.title ?? null,
      accountLicense,
      accountName,
    },
  };
}

function parseNoteRow(index: number, record: Record<string, unknown>): { ok: true; op: AgentNoteOp } | AgentRowFailure {
  const accountLicense = optionalLink(record.account_license);
  const accountName = optionalLink(record.account_name);
  if (accountLicense === 'invalid' || accountName === 'invalid') return { index, reason: 'Account link could not be read.' };
  if (!accountLicense && !accountName) return { index, reason: 'Link the note to an account by license or exact name.' };
  if (typeof record.body !== 'string') return { index, reason: 'Note could not be read.' };
  const body = record.body.trim();
  if (!body || body.length > 2000) return { index, reason: 'Note length is not allowed.' };
  return { ok: true, op: { op: 'note', index, body, accountLicense, accountName } };
}

export type AgentAccountView = { id: string; brand: string; displayName: string; licenseRef: string | null };

export function applyAgentOps(input: {
  requestId: string;
  receivedAtMs: number;
  requests: readonly { requestId: string; receivedAtMs: number }[];
  accounts: readonly AgentAccountView[];
  contacts: readonly { accountId: string; email: string | null }[];
  ops: readonly AgentOp[];
  nextId: () => string;
}): { code: 'replay' } | { code: 'rate'; retryAfter: number } | {
  code: 'ok';
  accounts: (AgentAccountView & { status: AccountStatus; city: string | null; county: string | null; accountType: AccountType | null; leadSource: LeadSource | null; assignedRep: string | null; licenseExpiry: string | null; street: string | null; postalCode: string | null; ocmStatus: 'unverified' | 'verified' | null; notes: string })[];
  contacts: { id: string; accountId: string; name: string; email: string | null; phone: string | null; title: string | null }[];
  notes: { id: string; accountId: string; body: string }[];
  activity: { id: string; accountId: string; kind: string; summary: string }[];
  created: { accounts: number; contacts: number; notes: number };
  skipped: { index: number; reason: string }[];
  failed: AgentRowFailure[];
} {
  if (input.requests.some((row) => row.requestId === input.requestId)) return { code: 'replay' };
  const recent = input.requests.map((row) => row.receivedAtMs).filter((stamp) => input.receivedAtMs - stamp < AGENT_HOUR_MS && input.receivedAtMs >= stamp);
  const rate = agentRateLimited(input.receivedAtMs, recent);
  if (rate.limited) return { code: 'rate', retryAfter: rate.retryAfter };
  const accounts = input.accounts.map((row) => ({ ...row }));
  const added: (AgentAccountView & { status: AccountStatus; city: string | null; county: string | null; accountType: AccountType | null; leadSource: LeadSource | null; assignedRep: string | null; licenseExpiry: string | null; street: string | null; postalCode: string | null; ocmStatus: 'unverified' | 'verified' | null; notes: string })[] = [];
  const knownContacts = input.contacts.map((row) => ({ accountId: row.accountId, email: row.email }));
  const contacts: { id: string; accountId: string; name: string; email: string | null; phone: string | null; title: string | null }[] = [];
  const notes: { id: string; accountId: string; body: string }[] = [];
  const activity: { id: string; accountId: string; kind: string; summary: string }[] = [];
  const skipped: { index: number; reason: string }[] = [];
  const failed: AgentRowFailure[] = [];
  const created = { accounts: 0, contacts: 0, notes: 0 };
  const link = (license: string | null, name: string | null): { id: string } | { reason: string } => {
    if (license) {
      const hits = accounts.filter((row) => row.brand === AGENT_BRAND && row.licenseRef && row.licenseRef.trim().toLowerCase() === license.trim().toLowerCase());
      if (hits.length === 1) return { id: hits[0].id };
      if (hits.length > 1) return { reason: 'More than one account has this license number.' };
      return { reason: 'No account with this license number.' };
    }
    if (name) {
      const hits = accounts.filter((row) => row.brand === AGENT_BRAND && row.displayName === name);
      if (hits.length === 1) return { id: hits[0].id };
      if (hits.length > 1) return { reason: 'More than one account has this name.' };
      return { reason: 'No account with this exact name.' };
    }
    return { reason: 'Link the row to an account by license or exact name.' };
  };
  for (const op of input.ops) {
    if (op.op === 'account') {
      const license = op.licenseNumber?.trim() || '';
      if (license && accounts.some((row) => row.brand === AGENT_BRAND && row.licenseRef && row.licenseRef.trim().toLowerCase() === license.toLowerCase())) {
        skipped.push({ index: op.index, reason: 'An account with this license number already exists.' });
        continue;
      }
      const id = input.nextId();
      const createdAccount = { id, brand: AGENT_BRAND, displayName: op.displayName, licenseRef: op.licenseNumber, status: op.status, city: op.city, county: op.county, accountType: op.accountType, leadSource: op.leadSource, assignedRep: op.assignedRep, licenseExpiry: op.licenseExpiry, street: op.street, postalCode: op.postalCode, ocmStatus: op.ocmStatus, notes: op.notes };
      accounts.push(createdAccount);
      added.push(createdAccount);
      activity.push({ id: input.nextId(), accountId: id, kind: 'account_created', summary: 'Account created' });
      created.accounts += 1;
      continue;
    }
    const linked = link(op.accountLicense, op.accountName);
    if ('reason' in linked) { failed.push({ index: op.index, reason: linked.reason }); continue; }
    if (op.op === 'contact') {
      const email = op.email?.trim().toLowerCase() || '';
      if (email && knownContacts.some((row) => row.accountId === linked.id && row.email?.trim().toLowerCase() === email)) {
        skipped.push({ index: op.index, reason: 'A contact with this email already exists on the account.' });
        continue;
      }
      knownContacts.push({ accountId: linked.id, email: op.email });
      contacts.push({ id: input.nextId(), accountId: linked.id, name: op.name, email: op.email, phone: op.phone, title: op.title });
      activity.push({ id: input.nextId(), accountId: linked.id, kind: 'contact_created', summary: 'Contact created' });
      created.contacts += 1;
    } else {
      notes.push({ id: input.nextId(), accountId: linked.id, body: op.body });
      activity.push({ id: input.nextId(), accountId: linked.id, kind: 'note_recorded', summary: 'Note appended' });
      created.notes += 1;
    }
  }
  return { code: 'ok', accounts: added, contacts, notes, activity, created, skipped, failed };
}

function optionalBounded(value: unknown, max: number): string | null | 'invalid' {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return 'invalid';
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) return 'invalid';
  return trimmed;
}

function optionalNote(value: unknown): string | null | 'invalid' {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return 'invalid';
  const trimmed = value.trim();
  return trimmed || null;
}

function optionalLink(value: unknown): string | null | 'invalid' {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return 'invalid';
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 160) return 'invalid';
  return trimmed;
}
