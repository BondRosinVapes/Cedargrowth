// Farmer and supplier intake from the trade show card. Pure checks only.
// Rows stay out of dispensary accounts. This module does not build HTML.

import { parseUuid } from './engine';
import { signIntake, signaturesMatch, timestampFresh } from './intake';
import { parseCounty } from './nyRegions';

export const SUPPLIER_CONSENT_VERSIONS = ['v1:56b70a071c4714eb'] as const;
export const SUPPLIER_KEYS = [
  'inquiry_id',
  'submitted_at',
  'business_name',
  'trade_name',
  'supply_type',
  'license_number',
  'contact_name',
  'contact_role',
  'contact_email',
  'contact_phone',
  'contact_phone_ext',
  'county',
  'message',
  'consent_version',
  'source_route',
  'source_event',
] as const;

const SUPPLY_TYPES = [
  'cannabis_nys_adult_use_cultivator',
  'cannabis_nys_microbusiness_or_cooperative',
  'hemp_or_hemp_extract',
  'non_cannabis_inputs',
] as const;
const CANNABIS_SUPPLY = new Set(['cannabis_nys_adult_use_cultivator', 'cannabis_nys_microbusiness_or_cooperative']);
const OPTIONAL = new Set(['trade_name', 'license_number', 'contact_role', 'contact_phone_ext', 'message']);
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const EVENT_RE = /^[a-z0-9-]{1,64}$/;
const OCM_LICENSE_RE = /^OCM-[A-Z]{2,6}-[0-9]{2}-[0-9]{6}$/;
const ROD_RE = /(^|-)(ROD|ROND)(-|$)/i;
const HEMP_LICENSE_RE = /^[A-Z0-9-]{3,40}$/;
const EIN_RE = /^\d{2}-?\d{7}$/;

export type SupplierSupplyType = (typeof SUPPLY_TYPES)[number];

export type SupplierLead = {
  inquiryId: string;
  submittedAt: string;
  businessName: string;
  tradeName: string | null;
  supplyType: SupplierSupplyType;
  licenseNumber: string | null;
  contactName: string;
  contactRole: string | null;
  contactEmail: string;
  contactPhone: string;
  contactPhoneExt: string | null;
  county: string;
  message: string | null;
  consentVersion: (typeof SUPPLIER_CONSENT_VERSIONS)[number];
  sourceRoute: '/card';
  sourceEvent: string;
};

// Work phone and work email are stored only so staff can reply to the inquiry.
export function parseSupplierPhone(value: string): { phone: string; ext: string | null } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const extMatch = trimmed.match(/(?:ext\.?|extension|(?:^|\s)x)\s*(\d{0,8})\s*$/i);
  let numberPart = trimmed;
  let ext: string | null = null;
  if (extMatch) {
    if (!extMatch[1] || extMatch[1].length > 6) return null;
    ext = extMatch[1];
    numberPart = trimmed.slice(0, extMatch.index).trim();
  }
  if (!numberPart || !/^[+0-9().\s-]+$/.test(numberPart)) return null;
  let digits = numberPart.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  return { phone: `+1${digits}`, ext };
}

export function supplierSecrets(env: Record<string, string | undefined>): { primary: string | null; next: string | null } {
  const primary = env.CG_BOND_SUPPLIER_INTAKE_SECRET?.trim() || null;
  const next = env.CG_BOND_SUPPLIER_INTAKE_SECRET_NEXT?.trim() || null;
  return { primary, next: primary ? next : null };
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
  const tradeName = optionalText(record.trade_name, 160);
  if (tradeName === 'invalid') fields.push('trade_name');
  const supplyType = SUPPLY_TYPES.find((item) => item === record.supply_type) || null;
  if (!supplyType) fields.push('supply_type');
  const licenseNumber = optionalText(record.license_number, 40);
  if (licenseNumber === 'invalid' || (licenseNumber && ROD_RE.test(licenseNumber))) fields.push('license_number');
  else if (supplyType === 'non_cannabis_inputs' && licenseNumber) fields.push('license_number');
  else if (supplyType === 'hemp_or_hemp_extract' && licenseNumber && (!HEMP_LICENSE_RE.test(licenseNumber) || EIN_RE.test(licenseNumber))) fields.push('license_number');
  else if (supplyType && CANNABIS_SUPPLY.has(supplyType) && (licenseNumber === null || !OCM_LICENSE_RE.test(licenseNumber))) fields.push('license_number');
  const contactName = text(record.contact_name, 1, 120);
  if (!contactName) fields.push('contact_name');
  const contactRole = optionalText(record.contact_role, 80);
  if (contactRole === 'invalid') fields.push('contact_role');
  const contactEmail = typeof record.contact_email === 'string' && record.contact_email.length <= 200 && EMAIL_RE.test(record.contact_email) ? record.contact_email : null;
  if (!contactEmail) fields.push('contact_email');
  // Work phone is required and is used only to reply to this inquiry. It is not an SMS, OTP, or marketing number.
  const parsedPhone = typeof record.contact_phone === 'string' ? parseSupplierPhone(record.contact_phone) : null;
  const extField = optionalDigits(record.contact_phone_ext, 6);
  if (!parsedPhone) fields.push('contact_phone');
  if (extField === 'invalid') fields.push('contact_phone_ext');
  let contactPhoneExt = extField && extField !== 'invalid' ? extField : null;
  if (parsedPhone?.ext && contactPhoneExt && parsedPhone.ext !== contactPhoneExt) fields.push('contact_phone_ext');
  else if (parsedPhone?.ext) contactPhoneExt = parsedPhone.ext;
  const county = parseCounty(record.county);
  if (!county.ok || !county.county) fields.push('county');
  const message = optionalText(record.message, 500);
  if (message === 'invalid') fields.push('message');
  const consentVersion = SUPPLIER_CONSENT_VERSIONS.find((item) => item === record.consent_version) || null;
  if (!consentVersion) fields.push('consent_version');
  if (record.source_route !== '/card') fields.push('source_route');
  const sourceEvent = typeof record.source_event === 'string' && EVENT_RE.test(record.source_event) ? record.source_event : null;
  if (!sourceEvent) fields.push('source_event');
  if (fields.length || !inquiryId || !submittedAt || !businessName || !contactName || !contactEmail || !parsedPhone || !supplyType || !county.ok || !county.county || !consentVersion || !sourceEvent) {
    return { ok: false, fields };
  }
  return {
    ok: true,
    lead: {
      inquiryId,
      submittedAt,
      businessName,
      tradeName: tradeName || null,
      supplyType,
      licenseNumber: licenseNumber || null,
      contactName,
      contactRole: contactRole || null,
      contactEmail,
      contactPhone: parsedPhone.phone,
      contactPhoneExt,
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

function optionalDigits(value: unknown, max: number): string | null | 'invalid' {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !new RegExp(`^[0-9]{1,${max}}$`).test(value)) return 'invalid';
  return value;
}

function optionalText(value: unknown, max: number): string | null | 'invalid' {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return 'invalid';
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) return 'invalid';
  return trimmed;
}
