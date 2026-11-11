// Google Places (New) lookup for CedarGrowth accounts. The API key stays on the server.

import { lookup as dnsLookup } from 'node:dns/promises';
import https from 'node:https';
import ipaddr from 'ipaddr.js';

export const PLACE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type PlaceCard = {
  name: string;
  rating: number | null;
  reviewCount: number | null;
  hours: string[];
  phone: string | null;
  website: string | null;
  mapsUrl: string | null;
  photoName: string | null;
  photoCredits: string[];
  photoContentType?: string | null;
  photoBytes?: string | null;
};

export type PlaceCache = {
  placeId: string | null;
  matchStatus: 'matched' | 'none';
  fields: PlaceCard | null;
  fetchedAt: string;
};

export type PlacePlan =
  | { action: 'not_connected' }
  | { action: 'no_address' }
  | { action: 'use_cache'; cache: PlaceCache }
  | { action: 'refresh' };

export function placeQuery(account: { street?: string | null; city?: string | null }): string | null {
  const street = account.street?.trim();
  if (!street) return null;
  const city = account.city?.trim();
  return [street, city, 'NY'].filter((part) => part).join(', ');
}

export function placeCacheFresh(fetchedAt: string, now: number): boolean {
  const then = Date.parse(fetchedAt);
  if (!Number.isFinite(then)) return false;
  return now - then < PLACE_TTL_MS;
}

export function placeReadPlan(input: { hasKey: boolean; query: string | null; cache: PlaceCache | null; now: number }): PlacePlan {
  if (!input.hasKey) return { action: 'not_connected' };
  if (!input.query) return { action: 'no_address' };
  if (input.cache && placeCacheFresh(input.cache.fetchedAt, input.now)) return { action: 'use_cache', cache: input.cache };
  return { action: 'refresh' };
}

type DetailBody = {
  id?: string;
  displayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  nationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  photos?: { name?: string; authorAttributions?: { displayName?: string }[] }[];
};

export function parsePlaceDetail(body: DetailBody): PlaceCard {
  const photo = body.photos?.[0];
  return {
    name: body.displayName?.text?.trim() || 'Name not provided',
    rating: typeof body.rating === 'number' ? body.rating : null,
    reviewCount: typeof body.userRatingCount === 'number' ? body.userRatingCount : null,
    hours: body.regularOpeningHours?.weekdayDescriptions?.filter((line) => line.trim()) || [],
    phone: body.nationalPhoneNumber?.trim() || null,
    website: body.websiteUri?.trim() || null,
    mapsUrl: body.googleMapsUri?.trim() || null,
    photoName: photo?.name?.trim() || null,
    photoCredits: (photo?.authorAttributions || []).map((row) => row.displayName?.trim() || '').filter((name) => name),
  };
}

const PLACE_FIELD_MASK = 'places.id,places.displayName,places.rating,places.userRatingCount,places.regularOpeningHours,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.photos';

export async function lookupPlace(query: string, key: string, fetchImpl: typeof fetch): Promise<{ placeId: string; card: PlaceCard } | null> {
  const search = await fetchImpl('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': PLACE_FIELD_MASK,
    },
    body: JSON.stringify({ textQuery: query, pageSize: 1 }),
  });
  if (!search.ok) return null;
  const found = await search.json() as { places?: DetailBody[] };
  const place = found.places?.[0];
  if (!place?.id) return null;
  return { placeId: place.id, card: parsePlaceDetail(place) };
}

export const PHOTO_NAME_PATTERN = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

export function photoMediaUrl(photoName: string): string | null {
  if (!PHOTO_NAME_PATTERN.test(photoName)) return null;
  return `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=400&skipHttpRedirect=true`;
}

export function allowedPhotoUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host === 'metadata.google.internal') return null;
  if (host.includes(':') || /^\d+$/.test(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;
  const photoHost = host === 'googleusercontent.com' || host.endsWith('.googleusercontent.com');
  if (host !== 'places.googleapis.com' && !photoHost) return null;
  return url.toString();
}

export type PhotoLookup = (host: string) => Promise<{ address: string; family: number }[]>;
export type PinnedRequest = (url: string, address: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<Response>;

export const PHOTO_TIMEOUT_MS = 8000;
export const PHOTO_MAX_BYTES = 2_000_000;

export function photoAddressAllowed(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  const parsed = ipaddr.parse(address);
  if (parsed.kind() === 'ipv6') {
    const v6 = parsed as ipaddr.IPv6;
    if (v6.parts.slice(0, 6).every((part) => part === 0)) return false;
  }
  return parsed.range() === 'unicast';
}

export async function checkedPhotoAddress(host: string, lookup: PhotoLookup): Promise<string | null> {
  let rows: { address: string; family: number }[];
  try {
    rows = await lookup(host);
  } catch {
    return null;
  }
  if (!rows.length || rows.some((row) => !photoAddressAllowed(row.address))) return null;
  return rows[0].address;
}

function photoTimeout(ms: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  controller.signal.addEventListener('abort', () => clearTimeout(timer));
  return controller.signal;
}

export async function fetchAllowedPhoto(start: string, deps: { lookup: PhotoLookup; request: PinnedRequest; headers?: Record<string, string>; timeoutMs?: number }, hops = 0): Promise<Response | null> {
  const current = allowedPhotoUrl(start);
  if (!current || hops > 2) return null;
  const host = new URL(current).hostname;
  const address = await checkedPhotoAddress(host, deps.lookup);
  if (!address) return null;
  const headers = host === 'places.googleapis.com' ? deps.headers : undefined;
  let response: Response;
  try {
    response = await deps.request(current, address, { headers, signal: photoTimeout(deps.timeoutMs ?? PHOTO_TIMEOUT_MS) });
  } catch {
    return null;
  }
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (!location) return null;
    return fetchAllowedPhoto(new URL(location, current).toString(), { lookup: deps.lookup, request: deps.request, timeoutMs: deps.timeoutMs }, hops + 1);
  }
  if (!response.ok) return null;
  return response;
}

const RASTER_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);

export function imageType(value: string | null): string | null {
  const type = (value || '').split(';')[0].trim().toLowerCase();
  if (!RASTER_TYPES.has(type)) return null;
  return type === 'image/jpg' ? 'image/jpeg' : type;
}

export function collectCapped(maxBytes: number) {
  const chunks: Buffer[] = [];
  let total = 0;
  return {
    push(chunk: Buffer): boolean {
      if (total + chunk.length > maxBytes) return false;
      chunks.push(chunk);
      total += chunk.length;
      return true;
    },
    concat(): Buffer {
      return Buffer.concat(chunks);
    },
  };
}

export function encodePhoto(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

export function decodePhoto(value: string): Uint8Array | null {
  if (!value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  const bytes = Buffer.from(value, 'base64');
  if (!bytes.length || bytes.length > PHOTO_MAX_BYTES) return null;
  return new Uint8Array(bytes);
}

export function freshPhoto(cache: PlaceCache | null, now: number): { bytes: Uint8Array; contentType: string } | null {
  if (!cache?.fields || !placeCacheFresh(cache.fetchedAt, now)) return null;
  const contentType = imageType(cache.fields.photoContentType ?? null);
  const raw = cache.fields.photoBytes;
  if (!contentType || typeof raw !== 'string') return null;
  const bytes = decodePhoto(raw);
  if (!bytes) return null;
  return { bytes, contentType };
}

export function attachPhoto(card: PlaceCard, bytes: Uint8Array, contentType: string): PlaceCard | null {
  const type = imageType(contentType);
  if (!type || bytes.byteLength > PHOTO_MAX_BYTES) return null;
  return { ...card, photoContentType: type, photoBytes: encodePhoto(bytes) };
}

export async function photoForView(input: {
  cache: PlaceCache | null;
  now: number;
  key: string;
  read: (photoName: string, key: string) => Promise<{ bytes: ArrayBuffer; contentType: string } | null>;
}): Promise<{ bytes: Uint8Array; contentType: string; nextFields: PlaceCard | null } | null> {
  const stored = freshPhoto(input.cache, input.now);
  if (stored) return { ...stored, nextFields: null };
  const fields = input.cache?.fields;
  if (!fields?.photoName || !input.cache || !placeCacheFresh(input.cache.fetchedAt, input.now)) return null;
  const photo = await input.read(fields.photoName, input.key);
  if (!photo) return null;
  const bytes = new Uint8Array(photo.bytes);
  const nextFields = attachPhoto(fields, bytes, photo.contentType);
  if (!nextFields) return null;
  return { bytes, contentType: nextFields.photoContentType || photo.contentType, nextFields };
}

async function readLimited(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.byteLength > maxBytes ? null : bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const step = await reader.read();
    if (step.done) break;
    total += step.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(step.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readPlacePhoto(photoName: string, key: string, deps: { lookup: PhotoLookup; request: PinnedRequest; timeoutMs?: number; maxBytes?: number }): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const mediaUrl = photoMediaUrl(photoName);
  if (!mediaUrl) return null;
  const meta = await fetchAllowedPhoto(mediaUrl, { ...deps, headers: { 'X-Goog-Api-Key': key } });
  if (!meta || meta.status >= 300 && meta.status < 400 || !meta.ok) return null;
  const body = await meta.json().catch(() => null) as { photoUri?: unknown } | null;
  if (!body || typeof body.photoUri !== 'string') return null;
  const image = await fetchAllowedPhoto(body.photoUri, deps);
  if (!image) return null;
  const contentType = imageType(image.headers.get('content-type'));
  if (!contentType) return null;
  const bytes = await readLimited(image, deps.maxBytes ?? PHOTO_MAX_BYTES);
  if (!bytes) return null;
  return { bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, contentType };
}

export const dnsPhotoLookup: PhotoLookup = async (host) => {
  const rows = await dnsLookup(host, { all: true, verbatim: true });
  return rows.map((row) => ({ address: row.address, family: row.family }));
};

export const pinnedPhotoRequest: PinnedRequest = (url, address, init) => {
  const target = new URL(url);
  const family = address.includes(':') ? 6 : 4;
  return new Promise((resolve, reject) => {
    const req = https.request({
      protocol: 'https:',
      hostname: target.hostname,
      servername: target.hostname,
      path: `${target.pathname}${target.search}`,
      method: 'GET',
      headers: init?.headers,
      signal: init?.signal,
      lookup: (_hostname, _options, callback) => {
        callback(null, address, family);
      },
    }, (res) => {
      const capped = collectCapped(PHOTO_MAX_BYTES);
      let settled = false;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      res.on('data', (chunk: Buffer) => {
        if (capped.push(chunk)) return;
        res.destroy();
        req.destroy();
        fail(new Error('photo too large'));
      });
      res.on('end', () => {
        if (settled) return;
        settled = true;
        const headers = new Headers();
        for (const [name, value] of Object.entries(res.headers)) {
          if (typeof value === 'string') headers.set(name, value);
          else if (Array.isArray(value)) for (const item of value) headers.append(name, item);
        }
        resolve(new Response(capped.concat(), { status: res.statusCode || 0, headers }));
      });
      res.on('error', fail);
    });
    req.on('error', reject);
    req.end();
  });
};
