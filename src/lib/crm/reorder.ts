// Reorder links and batch lab reports. Pure checks only. This file does not
// call storage, email, or fetch, and it does not create a Storage bucket.

import { createHash, randomBytes } from 'node:crypto';
import { PRODUCTS, type Format } from '@/lib/products';
import type { ProductLine } from './engine';

export const COA_BUCKET = 'crm-coa';
export const COA_BYTES = 15 * 1024 * 1024;
export const COA_READ_SECONDS = 600;
export const REORDER_DAYS = 30;
export const REORDER_LIMIT = 30;
export const REORDER_WINDOW_MS = 10 * 60 * 1000;
export const NABIS_CONFIRMATION = 'Your CedarGrowth rep will place this order through Nabis.';
export const REQUEST_CONFIRMATION = 'This is a request. No payment was taken. Your CedarGrowth rep will follow up.';
export const BATCH_MISS = 'No released batch with this number.';
export const LINK_MISS = 'This reorder link is not available.';

const PRODUCT_IDS = new Set(PRODUCTS.map((product) => product.slug));

export type ReorderLine = { productId: string; batchNumber: string; quantityUnits: number };

export type ReleasedBatch = {
  id: string;
  productId: string;
  batchNumber: string;
  labName: string;
  testedOn: string;
  released: boolean;
  coaStoragePath: string | null;
};

export function productIdOk(value: unknown): value is string {
  return typeof value === 'string' && PRODUCT_IDS.has(value);
}

export function hashReorderToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newReorderToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashReorderToken(token) };
}

export function tokenShapeOk(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function defaultExpiry(nowMs: number): string {
  return new Date(nowMs + REORDER_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function linkAccess(
  link: { expiresAt: string; revokedAt: string | null } | null,
  accountStatus: string | null,
  nowMs: number,
): 'ok' | 'unavailable' | 'inactive' {
  if (!link || link.revokedAt) return 'unavailable';
  const expires = Date.parse(link.expiresAt);
  if (!Number.isFinite(expires) || expires <= nowMs) return 'unavailable';
  if (accountStatus !== 'active') return 'inactive';
  return 'ok';
}

export function rateLimited(nowMs: number, hits: readonly number[], windowMs: number, limit: number): { limited: boolean; next: number[] } {
  const fresh = hits.filter((hit) => nowMs - hit < windowMs);
  if (fresh.length >= limit) return { limited: true, next: fresh };
  return { limited: false, next: [...fresh, nowMs] };
}

const rateHits = new Map<string, number[]>();

export function consumeRate(key: string, nowMs: number, limit = REORDER_LIMIT, windowMs = REORDER_WINDOW_MS): boolean {
  const decision = rateLimited(nowMs, rateHits.get(key) ?? [], windowMs, limit);
  rateHits.set(key, decision.next);
  return decision.limited;
}

export function clearReorderRates(): void {
  rateHits.clear();
}

export function clientIp(header: string | null): string {
  const first = header?.split(',')[0]?.trim() || '';
  return first.slice(0, 80) || 'unknown';
}

export function currentReleased(batches: readonly ReleasedBatch[]): ReleasedBatch[] {
  const chosen = new Map<string, ReleasedBatch>();
  for (const batch of batches) {
    if (!batch.released || !batch.coaStoragePath) continue;
    const prev = chosen.get(batch.productId);
    if (!prev || batch.testedOn > prev.testedOn) chosen.set(batch.productId, batch);
  }
  return [...chosen.values()];
}

export function releasedByNumber(batches: readonly ReleasedBatch[], batchNumber: string): ReleasedBatch | null {
  const needle = batchNumber.trim();
  if (!needle) return null;
  return batches.find((batch) => batch.released && batch.coaStoragePath && batch.batchNumber === needle) ?? null;
}

export function validateCoaUpload(input: Record<string, unknown>): { ok: true; contentType: 'application/pdf'; byteSize: number } | { ok: false; reason: string } {
  if (input.contentType !== 'application/pdf') return { ok: false, reason: 'The lab report must be a PDF.' };
  if (typeof input.byteSize !== 'number' || !Number.isInteger(input.byteSize) || input.byteSize < 1 || input.byteSize > COA_BYTES) {
    return { ok: false, reason: 'The lab report must be a PDF of 15 MB or less.' };
  }
  return { ok: true, contentType: 'application/pdf', byteSize: input.byteSize };
}

export function parseBatchWrite(input: Record<string, unknown>): { ok: true; value: { productId: string; batchNumber: string; labName: string; testedOn: string } } | { ok: false; reason: string } {
  if (!productIdOk(input.productId)) return { ok: false, reason: 'Product is not recognized.' };
  const batchNumber = typeof input.batchNumber === 'string' ? input.batchNumber.trim() : '';
  const labName = typeof input.labName === 'string' ? input.labName.trim() : '';
  const testedOn = typeof input.testedOn === 'string' ? input.testedOn : '';
  if (batchNumber.length < 1 || batchNumber.length > 40) return { ok: false, reason: 'Enter the batch number.' };
  if (labName.length < 1 || labName.length > 160) return { ok: false, reason: 'Enter the laboratory name.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(testedOn)) return { ok: false, reason: 'Enter the test date.' };
  return { ok: true, value: { productId: input.productId, batchNumber, labName, testedOn } };
}

export function parseReorderLines(input: unknown, current: readonly ReleasedBatch[]): { ok: true; lines: ReorderLine[] } | { ok: false; reason: string } {
  if (!Array.isArray(input) || input.length < 1 || input.length > PRODUCTS.length) return { ok: false, reason: 'Choose a quantity for a released batch.' };
  const lines: ReorderLine[] = [];
  const seen = new Set<string>();
  for (const row of input) {
    if (!row || typeof row !== 'object') return { ok: false, reason: 'Choose a quantity for a released batch.' };
    const record = row as Record<string, unknown>;
    if (!productIdOk(record.productId) || seen.has(record.productId)) return { ok: false, reason: 'Choose a quantity for a released batch.' };
    const quantity = record.quantityUnits;
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 1_000_000) {
      return { ok: false, reason: 'Quantity must be a whole number of units.' };
    }
    const batch = current.find((item) => item.productId === record.productId && item.batchNumber === record.batchNumber);
    if (!batch) return { ok: false, reason: 'That batch is not available.' };
    seen.add(record.productId);
    lines.push({ productId: record.productId, batchNumber: batch.batchNumber, quantityUnits: quantity });
  }
  return { ok: true, lines };
}

export function parseBuyer(input: Record<string, unknown>): { ok: true; buyerName: string; buyerEmail: string; note: string } | { ok: false; reason: string } {
  const buyerName = typeof input.buyerName === 'string' ? input.buyerName.trim() : '';
  const buyerEmail = typeof input.buyerEmail === 'string' ? input.buyerEmail.trim().toLowerCase() : '';
  const note = input.note === undefined || input.note === null ? '' : input.note;
  if (buyerName.length < 1 || buyerName.length > 120) return { ok: false, reason: 'Enter your name.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail) || buyerEmail.length > 200) return { ok: false, reason: 'Enter your email.' };
  if (typeof note !== 'string' || note.length > 2000) return { ok: false, reason: 'The note is too long.' };
  return { ok: true, buyerName, buyerEmail, note };
}

export function reorderDeal(lines: readonly ReorderLine[], date: string): { name: string; productLine: ProductLine; quantityUnits: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || lines.length === 0) return null;
  const formats: Format[] = [];
  for (const line of lines) {
    const product = PRODUCTS.find((item) => item.slug === line.productId);
    if (!product) return null;
    formats.push(product.format);
  }
  const productLine: ProductLine = formats.every((item) => item === formats[0]) ? formats[0] : 'other';
  return {
    name: `Reorder ${date}`,
    productLine,
    quantityUnits: lines.reduce((sum, line) => sum + line.quantityUnits, 0),
  };
}

export function confirmationFor(distributor: string | null): string {
  return distributor === 'nabis' ? NABIS_CONFIRMATION : REQUEST_CONFIRMATION;
}

export function coaPath(brand: string, batchId: string): string {
  return `${brand}/${batchId}.pdf`;
}
