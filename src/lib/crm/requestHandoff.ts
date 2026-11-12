// Bond Haus product request hand-off. A request only. The dispensary decides,
// confirms availability, checks ID, and takes payment in store.
// Consumer fields are never joined to contacts, Hoodie, spend, pins, or Places.

import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PRODUCTS } from '@/lib/products';
import { canExport, parseUuid, type DeskRole } from './engine';

export const HANDOFF_MAX_BYTES = 8 * 1024;
export const HANDOFF_CAP = 50;
export const SHARE_CONSENT_VERSION = 'v1:898aa08ccea983db';
export const REJECTED_CONSENT_VERSIONS = ['v1:46652a17994f78d1', 'v1:56b70a071c4714eb'] as const;
export const STORE_LIST_KEYS = ['id', 'display_name', 'city', 'latitude', 'longitude'] as const;
export const ALERT_KEYS = ['accountId', 'count'] as const;

const TEXT_DIR = path.join(process.cwd(), 'content/crm/bond-request');
const SKUS = new Set(PRODUCTS.map((product) => product.slug));
const KEYS = ['handoff_id', 'bond_request_id', 'submitted_at', 'dispensary_ref', 'items', 'member_first_name', 'member_contact', 'visit_preference', 'share_consent_version', 'source', 'source_event'] as const;
const OPTIONAL = new Set(['visit_preference', 'source_event']);
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const PHONE_RE = /^\+1[0-9]{10}$/;
const EVENT_RE = /^[a-z0-9-]{1,64}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const FROM_RE = /^[A-Za-z0-9._%+-]+@cedargrowthco\.com$/;
const VISITS = ['today', 'tomorrow', 'this_week'] as const;

export type VisitPreference = (typeof VISITS)[number];
export type HandoffStatus = 'queued' | 'sent' | 'no_contact' | 'failed' | 'failed:no_sender' | 'erased' | 'purged';
export type RejectReason = 'rejected:schema' | 'rejected:consent' | 'rejected:clock' | 'rejected:dispensary' | 'rejected:items' | 'rejected:rate' | 'rejected:source';

export type HandoffItem = { sku: string; qty: number };
export type HandoffInput = {
  handoffId: string;
  bondRequestId: string;
  submittedAt: string;
  dispensaryRef: string;
  items: HandoffItem[];
  memberFirstName: string;
  memberContact: string;
  contactKind: 'email' | 'phone';
  visitPreference: VisitPreference | null;
  shareConsentVersion: typeof SHARE_CONSENT_VERSION;
  source: 'bond-haus';
  sourceEvent: string | null;
};

export type AccountView = {
  id: string;
  brand: 'cedargrowth' | 'bond';
  displayName: string;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  accountType: string | null;
  requestContactEmail: string | null;
  carriedSkus: string[];
  requestOptOut: boolean;
  doNotContact: boolean;
};

export type HandoffRow = {
  handoffId: string;
  bondRequestId: string | null;
  receivedAt: string;
  submittedAt: string;
  dispensaryAccountId: string;
  items: HandoffItem[];
  memberFirstName: string | null;
  memberContact: string | null;
  contactKind: 'email' | 'phone' | null;
  visitPreference: VisitPreference | null;
  shareConsentVersion: string;
  source: 'bond-haus';
  sourceEvent: string | null;
  status: HandoffStatus;
  eraseRequestedAt: string | null;
  erasedAt: string | null;
  consumerClearedAt: string | null;
};

export type SendLogRow = {
  handoffId: string;
  template: 'A' | 'B';
  templateVersion: string;
  renderedSha256: string | null;
  providerMessageId: string | null;
  sentAt: string | null;
  status: string;
};

export type AuditRow = { handoffId: string; status: string; recordedAt: string };
export type AlertRow = { accountId: string; count: number; recordedAt: string };

export type FailedBondSend = {
  handoffId: string;
  template: 'B';
  templateVersion: string;
  renderedSha256: string;
  providerMessageId: string | null;
  sentAt: string | null;
  status: 'failed';
};

export type HandoffBook = {
  rows: HandoffRow[];
  sends: SendLogRow[];
  audits: AuditRow[];
  alerts: AlertRow[];
  purgeScheduled: boolean;
  stops: { accountId: string; requestedAt: string; completedAt: string; actor: string }[];
};

export type ProviderMessage = {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  html: string;
  openTracking: false;
  clickTracking: false;
};

export type HandoffProvider = {
  calls: ProviderMessage[];
  send: (message: ProviderMessage) => Promise<{ id: string }>;
};

export function emptyHandoffBook(): HandoffBook {
  return { rows: [], sends: [], audits: [], alerts: [], purgeScheduled: false, stops: [] };
}

export function textVersion(text: string): string {
  return `v1:${createHash('sha256').update(text).digest('hex').slice(0, 16)}`;
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function renderedPartHash(text: string, html: string): string {
  return sha256Hex(`${text}\n--bond-part--\n${html}`);
}

export function pinnedTexts(): { consent: string; privacy: string; aSubject: string; aBody: string; bSubject: string; bBody: string } {
  const read = (name: string) => readFileSync(path.join(TEXT_DIR, name), 'utf8');
  return {
    consent: read('share-consent-v1.txt'),
    privacy: read('privacy-sharing-v1.txt'),
    aSubject: read('template-a-subject.txt'),
    aBody: read('template-a-body.txt'),
    bSubject: read('template-b-subject.txt'),
    bBody: read('template-b-body.txt'),
  };
}

export function pinsMatch(texts = pinnedTexts()): boolean {
  return textVersion(texts.consent) === SHARE_CONSENT_VERSION
    && sha256Hex(texts.privacy) === 'd91846ca351ddcbb2adfcffae0b8fa79de978317f02fc2aded5e87c8b00309f6'
    && textVersion(texts.aSubject) === 'v1:3554dc1230aadae0'
    && textVersion(texts.aBody) === 'v1:6321250367f61781'
    && textVersion(texts.bSubject) === 'v1:308d432544eb6527'
    && textVersion(texts.bBody) === 'v1:56216bdd6a9c3f35';
}

export function bearerMatches(header: string | null, primary: string | null, next: string | null): boolean {
  const token = header && header.startsWith('Bearer ') ? header.slice(7) : '';
  const dummy = 'cedargrowth-handoff-unset';
  const primaryHit = safeEqual(token, primary || dummy);
  const nextHit = safeEqual(token, next || dummy);
  return Boolean(primary && primaryHit) || Boolean(next && nextHit);
}

function safeEqual(given: string, expected: string): boolean {
  const left = Buffer.from(given);
  const right = Buffer.from(expected);
  if (left.length !== right.length) {
    timingSafeEqual(right, right);
    return false;
  }
  return timingSafeEqual(left, right);
}

const SENDER_DENY = new RegExp(['reserv' + 'ation', 'reser' + 've', 'disc' + 'ount', 'coup' + 'on', 'fr' + 'ee', 'met' + 'rc'].join('|'), 'i');

export function fromAddressOk(value: string | null | undefined): boolean {
  const text = value?.trim() || '';
  const local = text.split('@')[0] || '';
  return FROM_RE.test(text) && !SENDER_DENY.test(local);
}

export function postalOk(value: string | null | undefined): boolean {
  const text = value?.trim() || '';
  return text.length > 0 && text.length <= 240;
}

export type SendGates = { from: string | null; postal: string | null; purgeScheduled: boolean; sendFlag: boolean };

export function gatesFromEnv(env: Record<string, string | undefined>, purgeScheduled: boolean): SendGates {
  return {
    from: env.CG_BOND_REQUEST_FROM_ADDRESS?.trim() || null,
    postal: env.CG_BOND_REQUEST_POSTAL_ADDRESS?.trim() || null,
    purgeScheduled,
    sendFlag: env.CG_BOND_REQUEST_SEND_ENABLED === 'true',
  };
}

export function sendingReady(gates: SendGates): boolean {
  return fromAddressOk(gates.from) && postalOk(gates.postal) && gates.purgeScheduled && gates.sendFlag;
}

export function parseHandoff(body: unknown, _nowMs: number): { ok: true; value: HandoffInput } | { ok: false; result: RejectReason } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, result: 'rejected:schema' };
  const record = body as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some((key) => !(KEYS as readonly string[]).includes(key))) return { ok: false, result: 'rejected:schema' };
  if (keys.some((key) => /hmac|hash|member_id|rate_key|note|price|last_name|birth|address|cookie|device/i.test(key))) return { ok: false, result: 'rejected:schema' };
  for (const key of KEYS) {
    if (!OPTIONAL.has(key) && record[key] === undefined) return { ok: false, result: key === 'share_consent_version' ? 'rejected:consent' : 'rejected:schema' };
  }
  if (record.share_consent_version !== SHARE_CONSENT_VERSION) return { ok: false, result: 'rejected:consent' };
  if (record.source !== 'bond-haus') return { ok: false, result: 'rejected:source' };
  let sourceEvent: string | null = null;
  if (record.source_event !== undefined && record.source_event !== null) {
    if (typeof record.source_event !== 'string' || !EVENT_RE.test(record.source_event)) return { ok: false, result: 'rejected:source' };
    sourceEvent = record.source_event;
  }
  if (typeof record.submitted_at !== 'string' || !ISO_RE.test(record.submitted_at)) return { ok: false, result: 'rejected:schema' };
  const submittedMs = Date.parse(record.submitted_at);
  if (!Number.isFinite(submittedMs)) return { ok: false, result: 'rejected:schema' };
  if (typeof record.handoff_id !== 'string' || !parseUuid(record.handoff_id)) return { ok: false, result: 'rejected:schema' };
  if (typeof record.bond_request_id !== 'string' || record.bond_request_id.length < 1 || record.bond_request_id.length > 80) return { ok: false, result: 'rejected:schema' };
  if (typeof record.dispensary_ref !== 'string' || !parseUuid(record.dispensary_ref)) return { ok: false, result: 'rejected:schema' };
  if (typeof record.member_first_name !== 'string' || record.member_first_name.trim().length < 1 || record.member_first_name.trim().length > 40 || /[\u0000-\u001f]/.test(record.member_first_name)) return { ok: false, result: 'rejected:schema' };
  if (typeof record.member_contact !== 'string') return { ok: false, result: 'rejected:schema' };
  const email = EMAIL_RE.test(record.member_contact) && record.member_contact.length <= 200;
  const phone = PHONE_RE.test(record.member_contact);
  if (email === phone) return { ok: false, result: 'rejected:schema' };
  let visitPreference: VisitPreference | null = null;
  if (record.visit_preference !== undefined && record.visit_preference !== null) {
    if (typeof record.visit_preference !== 'string' || !(VISITS as readonly string[]).includes(record.visit_preference)) return { ok: false, result: 'rejected:schema' };
    visitPreference = record.visit_preference as VisitPreference;
  }
  const items = parseItems(record.items);
  if (!items) return { ok: false, result: 'rejected:items' };
  return {
    ok: true,
    value: {
      handoffId: record.handoff_id,
      bondRequestId: record.bond_request_id,
      submittedAt: new Date(submittedMs).toISOString(),
      dispensaryRef: record.dispensary_ref,
      items,
      memberFirstName: record.member_first_name.trim(),
      memberContact: record.member_contact,
      contactKind: phone ? 'phone' : 'email',
      visitPreference,
      shareConsentVersion: SHARE_CONSENT_VERSION,
      source: 'bond-haus',
      sourceEvent,
    },
  };
}

function parseItems(value: unknown): HandoffItem[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) return null;
  const items: HandoffItem[] = [];
  let units = 0;
  for (const row of value) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
    const record = row as Record<string, unknown>;
    if (Object.keys(record).some((key) => key !== 'sku' && key !== 'qty')) return null;
    if (typeof record.sku !== 'string' || !SKUS.has(record.sku)) return null;
    if (typeof record.qty !== 'number' || !Number.isSafeInteger(record.qty) || record.qty < 1 || record.qty > 5) return null;
    units += record.qty;
    items.push({ sku: record.sku, qty: record.qty });
  }
  if (units > 5) return null;
  return items;
}

export function accountEligible(account: AccountView | null, items: HandoffItem[]): boolean {
  if (!account || account.brand !== 'cedargrowth' || account.accountType !== 'adult_use_dispensary') return false;
  if (account.requestOptOut || account.doNotContact) return false;
  return items.some((item) => account.carriedSkus.includes(item.sku));
}

export function handoffClockOk(submittedAt: string, nowMs: number): boolean {
  const submittedMs = Date.parse(submittedAt);
  return Number.isFinite(submittedMs) && submittedMs <= nowMs + 300_000 && submittedMs >= nowMs - 24 * 60 * 60 * 1000;
}

export function receiveHandoff(book: HandoffBook, account: AccountView | null, input: HandoffInput, nowIso: string): { result: 'accepted'; status: 'queued' } | { result: 'duplicate'; status: HandoffStatus } | { result: RejectReason } {
  const existing = book.rows.find((row) => row.handoffId === input.handoffId);
  if (existing) return { result: 'duplicate', status: existing.status };
  if (!handoffClockOk(input.submittedAt, Date.parse(nowIso))) return { result: 'rejected:clock' };
  if (!accountEligible(account, input.items)) return { result: 'rejected:dispensary' };
  const windowStart = Date.parse(nowIso) - 24 * 60 * 60 * 1000;
  const accepted = book.rows.filter((row) => row.dispensaryAccountId === input.dispensaryRef && Date.parse(row.receivedAt) > windowStart).length;
  if (accepted >= HANDOFF_CAP) {
    const recent = book.alerts.some((row) => row.accountId === input.dispensaryRef && Date.parse(row.recordedAt) > windowStart);
    if (!recent) book.alerts.push({ accountId: input.dispensaryRef, count: HANDOFF_CAP, recordedAt: nowIso });
    return { result: 'rejected:rate' };
  }
  const row: HandoffRow = {
    handoffId: input.handoffId,
    bondRequestId: input.bondRequestId,
    receivedAt: nowIso,
    submittedAt: input.submittedAt,
    dispensaryAccountId: input.dispensaryRef,
    items: input.items,
    memberFirstName: input.memberFirstName,
    memberContact: input.memberContact,
    contactKind: input.contactKind,
    visitPreference: input.visitPreference,
    shareConsentVersion: input.shareConsentVersion,
    source: 'bond-haus',
    sourceEvent: input.sourceEvent,
    status: 'queued',
    eraseRequestedAt: null,
    erasedAt: null,
    consumerClearedAt: null,
  };
  book.rows.push(row);
  book.audits.push({ handoffId: row.handoffId, status: 'queued', recordedAt: nowIso });
  return { result: 'accepted', status: 'queued' };
}

function clearConsumer(row: HandoffRow, nowIso: string) {
  row.memberFirstName = null;
  row.memberContact = null;
  row.contactKind = null;
  row.bondRequestId = null;
  row.consumerClearedAt = nowIso;
}

export function eraseHandoff(book: HandoffBook, handoffId: string, nowIso: string): { status: HandoffStatus | null; withdrawal: boolean } {
  const row = book.rows.find((item) => item.handoffId === handoffId);
  if (!row) return { status: null, withdrawal: false };
  if (row.status === 'erased') return { status: 'erased', withdrawal: false };
  const sent = row.status === 'sent' || book.sends.some((item) => item.handoffId === handoffId && item.template === 'A' && item.status === 'sent');
  clearConsumer(row, nowIso);
  for (const send of book.sends) {
    if (send.handoffId === handoffId && send.template === 'A') send.renderedSha256 = null;
  }
  row.status = 'erased';
  row.eraseRequestedAt = nowIso;
  row.erasedAt = nowIso;
  book.audits.push({ handoffId, status: 'erased', recordedAt: nowIso });
  return { status: 'erased', withdrawal: sent };
}

export function purgeHandoffs(book: HandoffBook, nowIso: string): { cleared: number; purged: number } {
  const now = Date.parse(nowIso);
  const cutoff = Math.min(now, Date.now());
  let cleared = 0;
  for (const row of book.rows) {
    if (row.consumerClearedAt) continue;
    const received = Date.parse(row.receivedAt);
    const sentAt = book.sends.find((item) => item.handoffId === row.handoffId && item.template === 'A' && item.status === 'sent' && item.sentAt)?.sentAt;
    const sentDue = row.status === 'sent' && typeof sentAt === 'string' && Date.parse(sentAt) <= cutoff - 7 * 24 * 60 * 60 * 1000;
    const outerDue = received <= cutoff - 14 * 24 * 60 * 60 * 1000;
    const terminal = row.status === 'no_contact' || row.status === 'failed' || row.status === 'failed:no_sender';
    const terminalDue = terminal && received <= cutoff - 24 * 60 * 60 * 1000;
    if (sentDue || outerDue || terminalDue) {
      clearConsumer(row, new Date(cutoff).toISOString());
      cleared += 1;
    }
  }
  for (const send of book.sends) {
    if (send.template !== 'A' || send.renderedSha256 == null) continue;
    const row = book.rows.find((item) => item.handoffId === send.handoffId);
    if (!row) continue;
    const sentDue = row.status === 'sent' && send.status === 'sent' && typeof send.sentAt === 'string' && Date.parse(send.sentAt) <= cutoff - 7 * 24 * 60 * 60 * 1000;
    const outerDue = Date.parse(row.receivedAt) <= cutoff - 14 * 24 * 60 * 60 * 1000;
    const terminal = row.status === 'no_contact' || row.status === 'failed' || row.status === 'failed:no_sender';
    const terminalDue = terminal && Date.parse(row.receivedAt) <= cutoff - 24 * 60 * 60 * 1000;
    const clearedEarlier = row.consumerClearedAt != null && Date.parse(row.consumerClearedAt) < cutoff;
    if (sentDue || outerDue || terminalDue || clearedEarlier) send.renderedSha256 = null;
  }
  const dueIds = new Set(book.rows.filter((row) => Date.parse(row.receivedAt) <= cutoff - 365 * 24 * 60 * 60 * 1000).map((row) => row.handoffId));
  const before = book.rows.length;
  book.rows = book.rows.filter((row) => !dueIds.has(row.handoffId));
  book.sends = book.sends.filter((row) => !dueIds.has(row.handoffId));
  book.audits = book.audits.filter((row) => !dueIds.has(row.handoffId));
  book.alerts = book.alerts.filter((row) => Date.parse(row.recordedAt) > cutoff - 365 * 24 * 60 * 60 * 1000);
  return { cleared, purged: before - book.rows.length };
}

export function visitLabel(value: VisitPreference | null): string {
  if (value === 'today') return 'Today';
  if (value === 'tomorrow') return 'Tomorrow';
  if (value === 'this_week') return 'This week';
  return 'Not specified';
}

export function itemLines(items: HandoffItem[]): string {
  return items.map((item) => {
    const product = PRODUCTS.find((row) => row.slug === item.sku);
    return `${item.qty} x Bond ${product?.name || item.sku} ${product?.netWeight || ''}`.trim();
  }).join('\n');
}

export function renderTemplate(kind: 'A' | 'B', fields: { dispensaryName: string; memberFirstName: string; memberContact: string; itemLines: string; visitPreference: string; requestDate: string; postal: string }): { subject: string; text: string; html: string; subjectVersion: string; bodyVersion: string; renderedSha256: string } | null {
  const texts = pinnedTexts();
  if (!pinsMatch(texts)) return null;
  const subject = (kind === 'A' ? texts.aSubject : texts.bSubject).replaceAll('{dispensary_name}', fields.dispensaryName);
  const source = kind === 'A' ? texts.aBody : texts.bBody;
  const text = source
    .replaceAll('{dispensary_name}', fields.dispensaryName)
    .replaceAll('{member_first_name}', fields.memberFirstName)
    .replaceAll('{member_contact}', fields.memberContact)
    .replaceAll('{item_lines}', fields.itemLines)
    .replaceAll('{visit_preference}', fields.visitPreference)
    .replaceAll('{request_date}', fields.requestDate)
    .replaceAll('{postal_address}', fields.postal);
  const html = text.split('\n').map((line) => {
    const warning = /21 years|health risks|HOPEline|OCM-PROC|postal|Poison Center/.test(line) || line === fields.postal;
    const size = warning ? '12px' : '16px';
    return `<p style="font-size:${size};margin:0 0 8px">${escapeHtml(line) || '&nbsp;'}</p>`;
  }).join('');
  if (html.includes('<img') || html.includes('font-size:11px')) return null;
  return {
    subject,
    text,
    html,
    subjectVersion: textVersion(kind === 'A' ? texts.aSubject : texts.bSubject),
    bodyVersion: textVersion(kind === 'A' ? texts.aBody : texts.bBody),
    renderedSha256: renderedPartHash(text, html),
  };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function deliverMessage(gates: SendGates, message: ProviderMessage | null, provider: HandoffProvider): Promise<{ state: 'failed:no_sender' } | { state: 'sent'; id: string } | { state: 'refused' }> {
  if (!sendingReady(gates)) return { state: 'failed:no_sender' };
  if (!message || message.openTracking !== false || message.clickTracking !== false || message.replyTo !== message.from) return { state: 'refused' };
  try {
    const saved = await provider.send(message);
    if (!saved?.id) return { state: 'refused' };
    provider.calls.push(message);
    return { state: 'sent', id: saved.id };
  } catch {
    return { state: 'refused' };
  }
}

export function markHandoff(book: HandoffBook, handoffId: string, status: HandoffStatus, nowIso: string, send: Omit<SendLogRow, 'handoffId'> | null) {
  const row = book.rows.find((item) => item.handoffId === handoffId);
  if (!row) return;
  const cleared = row.status === 'erased' || row.memberContact == null || row.consumerClearedAt != null;
  const stored = send && send.template === 'A' && cleared ? { ...send, renderedSha256: null } : send;
  if (row.status === 'erased') {
    if (stored) book.sends.push({ handoffId, ...stored });
    return;
  }
  row.status = status;
  if (status === 'no_contact' || status === 'failed' || status === 'failed:no_sender') {
    // Consumer fields stay until the 24 hour clear. The purge performs that clear.
  }
  book.audits.push({ handoffId, status, recordedAt: nowIso });
  if (stored) book.sends.push({ handoffId, ...stored });
}

export function storeList(accounts: AccountView[], sku: string): Record<(typeof STORE_LIST_KEYS)[number], string | number | null>[] {
  const rows = accounts.filter((account) => account.brand === 'cedargrowth' && account.accountType === 'adult_use_dispensary' && account.requestContactEmail && !account.requestOptOut && !account.doNotContact && account.carriedSkus.includes(sku));
  return [...rows].sort((a, b) => a.displayName.localeCompare(b.displayName)).map((account) => ({
    id: account.id,
    display_name: account.displayName,
    city: account.city,
    latitude: account.latitude,
    longitude: account.longitude,
  }));
}

export type AdminHandoffSend = {
  template: 'A' | 'B';
  templateVersion: string;
  renderedSha256: string | null;
  providerMessageId: string | null;
  sentAt: string | null;
  status: string;
};

export type AdminHandoffRow = {
  handoffId: string;
  dispensaryAccountId: string;
  items: HandoffItem[];
  visitPreference: VisitPreference | null;
  source: 'bond-haus';
  sourceEvent: string | null;
  status: HandoffStatus;
  receivedAt: string;
  submittedAt: string;
  sends: AdminHandoffSend[];
};

export function adminHandoffRows(book: HandoffBook, role: DeskRole | null): AdminHandoffRow[] | null {
  if (!role || !canExport(role)) return null;
  return book.rows.map((row) => ({
    handoffId: row.handoffId,
    dispensaryAccountId: row.dispensaryAccountId,
    items: row.items,
    visitPreference: row.visitPreference,
    source: row.source,
    sourceEvent: row.sourceEvent,
    status: row.status,
    receivedAt: row.receivedAt,
    submittedAt: row.submittedAt,
    sends: book.sends.filter((send) => send.handoffId === row.handoffId).map((send) => ({
      template: send.template,
      templateVersion: send.templateVersion,
      renderedSha256: send.renderedSha256,
      providerMessageId: send.providerMessageId,
      sentAt: send.sentAt,
      status: send.status,
    })),
  }));
}

export function businessDaysBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 99;
  let days = 0;
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (cursor < last) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) days += 1;
  }
  return days;
}

export function recordStop(book: HandoffBook, account: { id: string; requestOptOut?: boolean }, contacts: { accountId: string; preference: string }[], requestedAt: string, completedAt: string, actor: string): { ok: boolean; onTime: boolean } {
  const onTime = businessDaysBetween(requestedAt, completedAt) <= 2;
  if (!onTime) return { ok: false, onTime: false };
  account.requestOptOut = true;
  for (const contact of contacts) {
    if (contact.accountId === account.id) contact.preference = 'do_not_contact';
  }
  book.stops.push({ accountId: account.id, requestedAt, completedAt, actor });
  book.audits.push({ handoffId: account.id, status: 'request_stop', recordedAt: completedAt });
  return { ok: true, onTime: true };
}

export function alertRecipientAllowed(recipient: string | null | undefined, dispensaryEmails: string[]): boolean {
  const value = recipient?.trim().toLowerCase() || '';
  if (!value) return false;
  return !dispensaryEmails.some((email) => email.trim().toLowerCase() === value);
}

export function handoffSecrets(env: Record<string, string | undefined>): { primary: string | null; next: string | null } {
  const primary = env.CG_BOND_REQUEST_HANDOFF_SECRET?.trim() || null;
  const next = env.CG_BOND_REQUEST_HANDOFF_SECRET_NEXT?.trim() || null;
  return { primary, next };
}

export type HandoffDeps = {
  book: HandoffBook;
  accountById(id: string): Promise<AccountView | null>;
  accounts(): Promise<AccountView[]>;
  remotePurgeScheduled?(): Promise<boolean>;
  remoteReceive?(payload: unknown): Promise<{ result: string; status?: HandoffStatus }>;
  remoteStatus?(id: string): Promise<HandoffStatus | null>;
  remoteErase?(id: string): Promise<{ status: HandoffStatus | null; withdrawal: boolean }>;
  remoteRow?(id: string): Promise<HandoffRow | null>;
  remoteMark?(id: string, status: HandoffStatus, send: Omit<SendLogRow, 'handoffId'> | null): Promise<void>;
  remoteStores?(sku: string): Promise<Record<(typeof STORE_LIST_KEYS)[number], string | number | null>[]>;
};

export type HandoffHttp = { status: number; body: Record<string, unknown> | null };

function privateHeadersEnv(options?: { env?: Record<string, string | undefined> }): Record<string, string | undefined> {
  if (options?.env) return options.env;
  return {
    CG_BOND_REQUEST_HANDOFF_SECRET: process.env.CG_BOND_REQUEST_HANDOFF_SECRET,
    CG_BOND_REQUEST_HANDOFF_SECRET_NEXT: process.env.CG_BOND_REQUEST_HANDOFF_SECRET_NEXT,
    CG_BOND_REQUEST_FROM_ADDRESS: process.env.CG_BOND_REQUEST_FROM_ADDRESS,
    CG_BOND_REQUEST_POSTAL_ADDRESS: process.env.CG_BOND_REQUEST_POSTAL_ADDRESS,
    CG_BOND_REQUEST_SEND_ENABLED: process.env.CG_BOND_REQUEST_SEND_ENABLED,
    CG_BOND_REQUEST_ALERT_TO: process.env.CG_BOND_REQUEST_ALERT_TO,
  };
}

const handoffLocks = new Map<string, Promise<void>>();

function withHandoffLock<T>(id: string, work: () => Promise<T>): Promise<T> {
  const previous = handoffLocks.get(id) ?? Promise.resolve();
  const run = previous.then(work, work);
  handoffLocks.set(id, run.then(() => undefined, () => undefined));
  return run;
}

export async function handleBondRequestHttp(
  request: Request,
  deps: HandoffDeps,
  options?: { nowMs?: number; env?: Record<string, string | undefined>; provider?: HandoffProvider; kind?: 'create' | 'status' | 'erase' | 'stores'; handoffId?: string },
): Promise<HandoffHttp> {
  const env = privateHeadersEnv(options);
  const secrets = handoffSecrets(env);
  if (!bearerMatches(request.headers.get('authorization'), secrets.primary, secrets.next)) return { status: 401, body: null };
  const nowMs = options?.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const purgeScheduled = deps.remotePurgeScheduled ? await deps.remotePurgeScheduled() : deps.book.purgeScheduled;
  const gates = gatesFromEnv(env, purgeScheduled);
  const kind = options?.kind || 'create';
  if (kind === 'create' && !sendingReady(gates)) return { status: 503, body: { ok: false, reason: 'sending_off' } };
  if (kind === 'stores') {
    const url = new URL(request.url);
    const sku = url.searchParams.get('sku') || '';
    const rows = deps.remoteStores ? await deps.remoteStores(sku) : storeList(await deps.accounts(), sku);
    return { status: 200, body: { ok: true, stores: rows } };
  }
  if (kind === 'status') {
    const status = deps.remoteStatus
      ? await deps.remoteStatus(options?.handoffId || '')
      : deps.book.rows.find((item) => item.handoffId === options?.handoffId)?.status || null;
    return { status: status ? 200 : 404, body: { status } };
  }
  if (kind === 'erase') {
    const erased = deps.remoteErase
      ? await deps.remoteErase(options?.handoffId || '')
      : eraseHandoff(deps.book, options?.handoffId || '', nowIso);
    if (erased.withdrawal) {
      const row = deps.remoteRow
        ? await deps.remoteRow(options?.handoffId || '')
        : deps.book.rows.find((item) => item.handoffId === options?.handoffId) || null;
      const account = row ? await deps.accountById(row.dispensaryAccountId) : null;
      if (row && account) await dispatch(deps, row, account, gates, options?.provider || silentProvider(), nowIso, 'B');
    }
    return { status: erased.status ? 200 : 404, body: { status: erased.status } };
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw) > HANDOFF_MAX_BYTES) return { status: 413, body: { result: 'rejected:schema' } };
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { status: 400, body: { result: 'rejected:schema' } };
  }
  const parsed = parseHandoff(parsedJson, nowMs);
  if (!parsed.ok) return { status: 400, body: { result: parsed.result } };
  return withHandoffLock(parsed.value.handoffId, async () => {
    const account = await deps.accountById(parsed.value.dispensaryRef);
    const saved = deps.remoteReceive
      ? await deps.remoteReceive(parsedJson)
      : receiveHandoff(deps.book, account, parsed.value, nowIso);
    if (saved.result === 'rejected:rate') {
      const recipient = env.CG_BOND_REQUEST_ALERT_TO;
      let emails: string[] = [];
      try {
        emails = (await deps.accounts()).map((item) => item.requestContactEmail || '').filter(Boolean);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'account page failed';
        console.error(`account page failed: ${message}`);
        return { status: 400, body: { result: 'rejected:rate', accounts: 'error' } };
      }
      if (alertRecipientAllowed(recipient, emails)) {
        // The recipient is unset until Gary names one. A dispensary address is never used.
      }
      return { status: 400, body: { result: 'rejected:rate' } };
    }
    if (saved.result !== 'accepted' || !account) return { status: saved.result === 'duplicate' ? 200 : 400, body: saved };
    if (!deps.book.rows.some((item) => item.handoffId === parsed.value.handoffId)) {
      receiveHandoff(deps.book, account, parsed.value, nowIso);
    }
    const row = deps.book.rows.find((item) => item.handoffId === parsed.value.handoffId);
    if (row) await dispatch(deps, row, account, gates, options?.provider || silentProvider(), nowIso, 'A');
    return { status: 200, body: { result: 'accepted', status: row?.status || 'queued' } };
  });
}

function silentProvider(): HandoffProvider {
  return { calls: [], send: async () => { throw new Error('provider blocked'); } };
}

async function dispatch(deps: HandoffDeps, row: HandoffRow, account: AccountView, gates: SendGates, provider: HandoffProvider, nowIso: string, template: 'A' | 'B') {
  const book = deps.book;
  const noted = async (status: HandoffStatus, send: Omit<SendLogRow, 'handoffId'> | null) => {
    markHandoff(book, row.handoffId, status, nowIso, send);
    if (deps.remoteMark) await deps.remoteMark(row.handoffId, status, send);
  };
  if (template === 'A' && !account.requestContactEmail) {
    await noted('no_contact', null);
    return;
  }
  if (!account.requestContactEmail || !sendingReady(gates) || !gates.from || !gates.postal) {
    const skipped = {
      template,
      templateVersion: template === 'A' ? 'v1:6321250367f61781' : 'v1:56216bdd6a9c3f35',
      renderedSha256: '',
      providerMessageId: null,
      sentAt: null,
      status: 'failed:no_sender' as const,
    };
    if (template === 'B' || row.status === 'erased') {
      book.sends.push({ handoffId: row.handoffId, ...skipped });
      if (deps.remoteMark) await deps.remoteMark(row.handoffId, 'failed:no_sender', skipped);
      return;
    }
    await noted('failed:no_sender', skipped);
    return;
  }
  const rendered = renderTemplate(template, {
    dispensaryName: account.displayName,
    memberFirstName: row.memberFirstName || '',
    memberContact: row.memberContact || '',
    itemLines: itemLines(row.items),
    visitPreference: visitLabel(row.visitPreference),
    requestDate: row.receivedAt.slice(0, 10),
    postal: gates.postal,
  });
  if (!rendered || rendered.renderedSha256 !== renderedPartHash(rendered.text, rendered.html)) {
    await noted('failed', null);
    return;
  }
  const message: ProviderMessage = {
    from: gates.from,
    to: account.requestContactEmail,
    replyTo: gates.from,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    openTracking: false,
    clickTracking: false,
  };
  const outcome = await deliverMessage(gates, message, provider);
  if (outcome.state === 'sent' && template === 'A') {
    await noted('sent', {
      template,
      templateVersion: rendered.bodyVersion,
      renderedSha256: rendered.renderedSha256,
      providerMessageId: outcome.id,
      sentAt: nowIso,
      status: 'sent',
    });
    return;
  }
  if (outcome.state === 'sent') {
    const send = {
      template,
      templateVersion: rendered.bodyVersion,
      renderedSha256: rendered.renderedSha256,
      providerMessageId: outcome.id,
      sentAt: nowIso,
      status: 'sent',
    };
    book.sends.push({ handoffId: row.handoffId, ...send });
    if (deps.remoteMark) await deps.remoteMark(row.handoffId, 'sent', send);
    return;
  }
  if (template === 'B') {
    const failedSend = {
      template,
      templateVersion: rendered.bodyVersion,
      renderedSha256: rendered.renderedSha256,
      providerMessageId: null,
      sentAt: null,
      status: 'failed' as const,
    };
    book.sends.push({ handoffId: row.handoffId, ...failedSend });
    if (deps.remoteMark) await deps.remoteMark(row.handoffId, 'failed', failedSend);
    return;
  }
  if (row.status !== 'erased') await noted(outcome.state === 'failed:no_sender' ? 'failed:no_sender' : 'failed', null);
}

export async function retryQueuedHandoffs(deps: HandoffDeps, gates: SendGates, provider: HandoffProvider, nowMs: number) {
  const nowIso = new Date(nowMs).toISOString();
  for (const row of deps.book.rows) {
    if (row.status !== 'queued') continue;
    if (Date.parse(row.receivedAt) <= nowMs - 24 * 60 * 60 * 1000) {
      markHandoff(deps.book, row.handoffId, 'failed', nowIso, null);
      continue;
    }
    const account = await deps.accountById(row.dispensaryAccountId);
    if (account) await dispatch(deps, row, account, gates, provider, nowIso, 'A');
  }
}

export function assignRequestEmail(account: AccountView, role: DeskRole, email: string): { ok: true } | { ok: false; status: number; reason: string } {
  if (!canExport(role)) return { ok: false, status: 403, reason: 'Only an owner or administrator can set the request contact email.' };
  if (account.accountType !== 'adult_use_dispensary') return { ok: false, status: 400, reason: 'Request contact email is only for a licensed adult-use retail dispensary.' };
  if (!EMAIL_RE.test(email) || email.length > 200) return { ok: false, status: 400, reason: 'Enter a work email.' };
  account.requestContactEmail = email;
  return { ok: true };
}
