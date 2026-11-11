// Farmer and supplier intake from the trade show card. Pure checks only.
// Rows stay out of dispensary accounts. This module does not build HTML.

import { parseUuid } from './engine';
import { intakeTestMarker, signIntake, signaturesMatch, timestampFresh } from './intake';
import { parseCounty } from './nyRegions';

export const SUPPLIER_KEYS = [
  'inquiry_id',
  'submitted_at',
  'business_name',
  'contact_name',
  'contact_email',
  'contact_phone',
  'license_number',
  'supply_type',
  'county',
  'message',
  'consent_version',
  'source_route',
  'source_event',
] as const;

const SUPPLY_TYPES = ['fresh_frozen_biomass', 'other_biomass', 'other_input'] as const;
const OPTIONAL = new Set(['license_number', 'message']);
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const CONSENT_RE = /^v1:[0-9a-f]{16}$/;
const EVENT_RE = /^[a-z0-9-]{1,64}$/;

export type SupplierSupplyType = (typeof SUPPLY_TYPES)[number];

export type SupplierLead = {
  inquiryId: string;
  submittedAt: string;
  businessName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  licenseNumber: string | null;
  supplyType: SupplierSupplyType;
  county: string;
  message: string | null;
  consentVersion: string;
  sourceRoute: '/card';
  sourceEvent: string;
};

export function supplierSecrets(env: Record<string, string | undefined>): { primary: string | null; next: string | null } {
  const primary = env.CG_BOND_SUPPLIER_INTAKE_SECRET?.trim() || null;
  const next = env.CG_BOND_SUPPLIER_INTAKE_SECRET_NEXT?.trim() || null;
  return { primary, next: primary ? next : null };
}

export function supplierTestMarker(businessName: string, licenseNumber: string | null): boolean {
  return intakeTestMarker(businessName, licenseNumber);
}

export function parseSupplierIntake(value: unknown): { ok: true; lead: SupplierLead } | { ok: false; fields: string[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, fields: ['payload'] };
  const record = value as Record<string, unknown>;
  const unknown = Object.keys(record).filter((key) => !(SUPPLIER_KEYS as readonly string[]).includes(key)).sort();
  if (unknown.length) return { ok: false, fields: unknown };
  const missing = SUPPLIER_KEYS.filter((key) => !OPTIONAL.has(key) && (record[key] === undefined || record[key] === null || record[key] === ''));
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
  const contactPhone = text(record.contact_phone, 1, 40);
  if (!contactPhone) fields.push('contact_phone');
  const licenseNumber = optionalText(record.license_number, 40);
  if (licenseNumber === 'invalid') fields.push('license_number');
  const supplyType = SUPPLY_TYPES.find((item) => item === record.supply_type) || null;
  if (!supplyType) fields.push('supply_type');
  const county = parseCounty(record.county);
  if (!county.ok || !county.county) fields.push('county');
  const message = optionalText(record.message, 500);
  if (message === 'invalid') fields.push('message');
  const consentVersion = typeof record.consent_version === 'string' && CONSENT_RE.test(record.consent_version) ? record.consent_version : null;
  if (!consentVersion) fields.push('consent_version');
  if (record.source_route !== '/card') fields.push('source_route');
  const sourceEvent = typeof record.source_event === 'string' && EVENT_RE.test(record.source_event) ? record.source_event : null;
  if (!sourceEvent) fields.push('source_event');
  if (fields.length || !inquiryId || !submittedAt || !businessName || !contactName || !contactEmail || !contactPhone || !supplyType || !county.ok || !county.county || !consentVersion || !sourceEvent) {
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
      contactPhone,
      licenseNumber: licenseNumber || null,
      supplyType,
      county: county.county,
      message: message || null,
      consentVersion,
      sourceRoute: '/card',
      sourceEvent,
    },
  };
}

export { signIntake as signSupplierIntake, signaturesMatch as supplierSignaturesMatch, timestampFresh as supplierTimestampFresh };

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
