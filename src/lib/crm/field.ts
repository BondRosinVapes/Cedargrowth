// Field visit rules. Location is stored only when the rep sends it, and only
// to about 100 meters. This module does not call storage or a maps service.

import { PRODUCT_LINES, type ProductLine } from './engine';

export const VISIT_OUTCOMES = ['met_buyer', 'left_info', 'no_answer', 'order_taken', 'other'] as const;
export type VisitOutcome = (typeof VISIT_OUTCOMES)[number];
export const VISIT_OUTCOME_LABELS: Record<VisitOutcome, string> = {
  met_buyer: 'Met buyer',
  left_info: 'Left info',
  no_answer: 'No answer',
  order_taken: 'Order taken',
  other: 'Other',
};

export const MEDIA_KINDS = ['shelf_photo', 'voice_note'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const PHOTO_BYTES = 8 * 1024 * 1024;
export const VOICE_SECONDS = 120;
export const FIELD_BUCKET = 'crm-field';
export const READ_URL_SECONDS = 600;

const PHOTO_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const VOICE_TYPES: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'video/webm': 'webm',
  'video/mp4': 'mp4',
};

export function roundLocation(latitude: unknown, longitude: unknown): { latitude: number; longitude: number } | null | 'invalid' {
  const missing = latitude === undefined || latitude === null || longitude === undefined || longitude === null;
  const empty = (latitude === undefined || latitude === null) && (longitude === undefined || longitude === null);
  if (empty) return null;
  if (missing) return 'invalid';
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return 'invalid';
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return 'invalid';
  return { latitude: Math.round(latitude * 1000) / 1000, longitude: Math.round(longitude * 1000) / 1000 };
}

export function mapsDirectionsUrl(cities: readonly string[]): string | null {
  const stops = cities.map((city) => city.trim()).filter(Boolean);
  if (!stops.length) return null;
  if (stops.length === 1) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stops[0])}`;
  const origin = stops[0];
  const destination = stops[stops.length - 1];
  const waypoints = stops.slice(1, -1);
  const params = new URLSearchParams({ api: '1', origin, destination, travelmode: 'driving' });
  if (waypoints.length) params.set('waypoints', waypoints.join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function mediaPath(brand: string, accountId: string, mediaId: string, ext: string): string {
  return `${brand}/${accountId}/${mediaId}.${ext}`;
}

export function validateMediaUpload(input: Record<string, unknown>): { ok: true; kind: MediaKind; contentType: string; byteSize: number; durationSeconds: number | null; ext: string } | { ok: false; reason: string } {
  if (input.kind !== 'shelf_photo' && input.kind !== 'voice_note') return { ok: false, reason: 'Media kind is not recognized.' };
  if (typeof input.contentType !== 'string' || typeof input.byteSize !== 'number' || !Number.isInteger(input.byteSize) || input.byteSize < 1) {
    return { ok: false, reason: 'File details could not be read.' };
  }
  if (input.kind === 'shelf_photo') {
    const ext = PHOTO_TYPES[input.contentType];
    if (!ext) return { ok: false, reason: 'Photos must be JPEG, PNG, or WebP.' };
    if (input.byteSize > PHOTO_BYTES) return { ok: false, reason: 'Photos must be 8 MB or smaller.' };
    return { ok: true, kind: 'shelf_photo', contentType: input.contentType, byteSize: input.byteSize, durationSeconds: null, ext };
  }
  const ext = VOICE_TYPES[input.contentType];
  if (!ext) return { ok: false, reason: 'Voice notes must be WebM or MP4 audio.' };
  if (typeof input.durationSeconds !== 'number' || !Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0 || input.durationSeconds > VOICE_SECONDS) {
    return { ok: false, reason: 'Voice notes must be 2 minutes or shorter.' };
  }
  if (input.byteSize > PHOTO_BYTES) return { ok: false, reason: 'Voice notes must be 8 MB or smaller.' };
  return { ok: true, kind: 'voice_note', contentType: input.contentType, byteSize: input.byteSize, durationSeconds: Math.round(input.durationSeconds), ext };
}

export function sampleTaskTitle(accountName: string): string {
  const prefix = 'Follow up on samples at ';
  return `${prefix}${accountName.trim().slice(0, 160 - prefix.length)}`;
}

export function isVisitOutcome(value: unknown): value is VisitOutcome {
  return typeof value === 'string' && (VISIT_OUTCOMES as readonly string[]).includes(value);
}

export function isProductLine(value: unknown): value is ProductLine {
  return typeof value === 'string' && (PRODUCT_LINES as readonly string[]).includes(value);
}
