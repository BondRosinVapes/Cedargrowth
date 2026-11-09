// Bond dispensary intake. Pure checks only. No database, no network, no secrets.
// The message is stored and shown as text. This module does not build HTML.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { parseUuid } from './engine';
import { parseCounty } from './nyRegions';

export const INTAKE_MAX_BYTES = 16 * 1024;
export const INTAKE_SKEW_SECONDS = 300;
export const INTAKE_LIMIT = 30;
export const INTAKE_WINDOW_MS = 60_000;
export const INTAKE_ACTOR = 'bond-intake';
export const INTAKE_TEST_MARKER = 'TEST ONLY';
export const DUPLICATE_FLAG = 'Possible duplicate.';

export const INTAKE_KEYS = [
  'inquiry_id',
  'submitted_at',
  'business_name',
  'contact_name',
  'contact_email',
  'contact_phone',
  'license_number',
  'street',
  'city',
  'state',
  'postal_code',
  'county',
  'message',
  'consent_version',
  'source_route',
] as const;

const OPTIONAL = new Set(['contact_phone', 'license_number', 'county', 'message']);
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const CONSENT_RE = /^v1:[0-9a-f]{16}$/;

export type IntakeLead = {
  inquiryId: string;
  submittedAt: string;
  businessName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  licenseNumber: string | null;
  street: string;
  city: string;
  state: 'NY';
  postalCode: string;
  county: string | null;
  message: string | null;
  consentVersion: string;
  sourceRoute: '/order';
};

export function intakeSecrets(env: Record<string, string | undefined>): { primary: string | null; next: string | null } {
  const primary = env.CG_BOND_INTAKE_SECRET?.trim() || null;
  const next = env.CG_BOND_INTAKE_SECRET_NEXT?.trim() || null;
  return { primary, next: primary ? next : null };
}

export function intakeMessageText(value: string): string {
  return value;
}

export function normalizeBusinessName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/ +/g, ' ').trim();
}

export function emailDomain(value: string): string {
  const parts = value.trim().toLowerCase().split('@');
  return parts.length === 2 ? parts[1] : '';
}

export function intakeTestMarker(businessName: string, licenseNumber: string | null): boolean {
  const hay = `${businessName}\n${licenseNumber ?? ''}`.toLowerCase();
  return hay.includes(INTAKE_TEST_MARKER.toLowerCase());
}

export function intakeExpired(receivedAt: string, nowIso: string): boolean {
  const received = Date.parse(receivedAt);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(received) || !Number.isFinite(now)) return false;
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 12);
  return received <= cutoff.getTime();
}

export function duplicateNote(message: string | null): string {
  if (!message) return DUPLICATE_FLAG;
  return `${DUPLICATE_FLAG}\n${intakeMessageText(message)}`;
}

export function parseIntake(value: unknown): { ok: true; lead: IntakeLead } | { ok: false; fields: string[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, fields: ['payload'] };
  const record = value as Record<string, unknown>;
  const unknown = Object.keys(record).filter((key) => !(INTAKE_KEYS as readonly string[]).includes(key)).sort();
  if (unknown.length) return { ok: false, fields: unknown };
  const missing = INTAKE_KEYS.filter((key) => !OPTIONAL.has(key) && (record[key] === undefined || record[key] === null || record[key] === ''));
  if (missing.length) return { ok: false, fields: [...missing] };

  const fields: string[] = [];
  const inquiryId = parseUuid(record.inquiry_id);
  if (!inquiryId) fields.push('inquiry_id');
  const submittedAt = typeof record.submitted_at === 'string' && ISO_RE.test(record.submitted_at) && Number.isFinite(Date.parse(record.submitted_at)) ? record.submitted_at : null;
  if (!submittedAt) fields.push('submitted_at');
  const businessName = text(record.business_name, 1, 160);
  if (!businessName) fields.push('business_name');
  const contactName = text(record.contact_name, 1, 120);
  if (!contactName) fields.push('contact_name');
  const contactEmail = typeof record.contact_email === 'string' && record.contact_email.length <= 200 && EMAIL_RE.test(record.contact_email) ? record.contact_email : null;
  if (!contactEmail) fields.push('contact_email');
  const contactPhone = optionalText(record.contact_phone, 40);
  if (contactPhone === 'invalid') fields.push('contact_phone');
  const licenseNumber = optionalText(record.license_number, 40);
  if (licenseNumber === 'invalid') fields.push('license_number');
  const street = text(record.street, 1, 120);
  if (!street) fields.push('street');
  const city = text(record.city, 1, 80);
  if (!city) fields.push('city');
  if (record.state !== 'NY') fields.push('state');
  const postalCode = text(record.postal_code, 1, 10);
  if (!postalCode) fields.push('postal_code');
  const county = record.county === undefined || record.county === null || record.county === '' ? { ok: true as const, county: null } : parseCounty(record.county);
  if (!county.ok) fields.push('county');
  const message = optionalText(record.message, 500);
  if (message === 'invalid') fields.push('message');
  const consentVersion = typeof record.consent_version === 'string' && CONSENT_RE.test(record.consent_version) ? record.consent_version : null;
  if (!consentVersion) fields.push('consent_version');
  if (record.source_route !== '/order') fields.push('source_route');
  if (fields.length || !inquiryId || !submittedAt || !businessName || !contactName || !contactEmail || !street || !city || !postalCode || !consentVersion || !county.ok) {
    return { ok: false, fields };
  }
  return {
    ok: true,
    lead: {
      inquiryId,
      submittedAt,
      businessName,
      contactName,
      contactEmail,
      contactPhone: contactPhone || null,
      licenseNumber: licenseNumber || null,
      street,
      city,
      state: 'NY',
      postalCode,
      county: county.county,
      message: message ? intakeMessageText(message) : null,
      consentVersion,
      sourceRoute: '/order',
    },
  };
}

function text(value: unknown, min: number, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) return null;
  return trimmed;
}

function optionalText(value: unknown, max: number): string | null | 'invalid' {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return 'invalid';
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) return 'invalid';
  return trimmed;
}

export function signaturesMatch(expected: string, provided: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(provided.toLowerCase());
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

export function signIntake(secret: string, timestamp: string, raw: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');
}

export function timestampFresh(header: string | null, nowMs: number): boolean {
  if (!header || !/^\d{1,12}$/.test(header)) return false;
  const sent = Number(header);
  const now = Math.floor(nowMs / 1000);
  return Math.abs(now - sent) <= INTAKE_SKEW_SECONDS;
}

export function intakeRateDecision(nowMs: number, hits: readonly number[], windowMs = INTAKE_WINDOW_MS, limit = INTAKE_LIMIT): { limited: boolean; next: number[]; retryAfter: number } {
  const fresh = hits.filter((hit) => nowMs - hit < windowMs).sort((a, b) => a - b);
  if (fresh.length >= limit) {
    return { limited: true, next: fresh, retryAfter: Math.max(1, Math.ceil((fresh[0] + windowMs - nowMs) / 1000)) };
  }
  return { limited: false, next: [...fresh, nowMs], retryAfter: 0 };
}

const rateHits = new Map<string, number[]>();

export function takeIntakeRate(key: string, nowMs: number): { limited: boolean; retryAfter: number } {
  const decision = intakeRateDecision(nowMs, rateHits.get(key) ?? []);
  rateHits.set(key, decision.next);
  return { limited: decision.limited, retryAfter: decision.retryAfter };
}

export function clearIntakeRates(): void {
  rateHits.clear();
}

export function excludeTestLeads<T extends { recordMarker?: 'test' | null }>(rows: readonly T[]): T[] {
  return rows.filter((row) => row.recordMarker !== 'test');
}
