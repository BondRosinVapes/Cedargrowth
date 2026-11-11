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
  | { action: 'refresh'; retain: 'details' | 'place_id' };

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

// Account status is prospect, active, paused, or closed. None of those is a customer status.
// A dispensary we sell to is one with a Won deal. Only that account keeps place details.
export function storesPlaceDetails(stages: readonly string[]): boolean {
  return stages.includes('won');
}

export function shouldPurgePlaceDetails(input: { previousStage: string | null; nextStage: string | null | undefined; remainingWon: boolean }): boolean {
  if (input.previousStage !== 'won' || input.nextStage === undefined || input.nextStage === 'won') return false;
  return input.remainingWon === false;
}

export type PlaceRetain = 'details' | 'place_id';

export function placeReadPlan(input: { hasKey: boolean; query: string | null; cache: PlaceCache | null; now: number; sells: boolean }): PlacePlan {
  if (!input.hasKey) return { action: 'not_connected' };
  if (!input.query && !input.cache?.placeId) return { action: 'no_address' };
  if (input.sells && input.cache && placeCacheFresh(input.cache.fetchedAt, input.now)) return { action: 'use_cache', cache: input.cache };
  return { action: 'refresh', retain: input.sells ? 'details' : 'place_id' };
}

export function retainPlaceCache(cache: PlaceCache, retain: PlaceRetain): PlaceCache {
  if (retain === 'details') return cache;
  return { placeId: cache.placeId, matchStatus: cache.matchStatus, fields: null, fetchedAt: cache.fetchedAt };
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

const placeLoads = new Map<string, Promise<{ placeId: string; card: PlaceCard } | null>>();

function sharePlaceLoad(key: string, load: () => Promise<{ placeId: string; card: PlaceCard } | null>): Promise<{ placeId: string; card: PlaceCard } | null> {
  const current = placeLoads.get(key);
  if (current) return current;
  let flight: Promise<{ placeId: string; card: PlaceCard } | null>;
  flight = Promise.resolve().then(load).finally(() => {
    if (placeLoads.get(key) === flight) placeLoads.delete(key);
  });
  placeLoads.set(key, flight);
  return flight;
}

async function lookupPlaceOnce(query: string, key: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<{ placeId: string; card: PlaceCard } | null> {
  const search = await fetchImpl('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': PLACE_FIELD_MASK,
    },
    body: JSON.stringify({ textQuery: query, pageSize: 1 }),
    signal: photoTimeout(timeoutMs),
  });
  if (!search.ok) return null;
  const found = await search.json() as { places?: DetailBody[] };
  const place = found.places?.[0];
  if (!place?.id) return null;
  return { placeId: place.id, card: parsePlaceDetail(place) };
}

export async function lookupPlace(query: string, key: string, fetchImpl: typeof fetch, timeoutMs = PHOTO_TIMEOUT_MS): Promise<{ placeId: string; card: PlaceCard } | null> {
  return sharePlaceLoad(`text:${query}`, () => lookupPlaceOnce(query, key, fetchImpl, timeoutMs));
}

const DETAIL_FIELD_MASK = 'id,displayName,rating,userRatingCount,regularOpeningHours,nationalPhoneNumber,websiteUri,googleMapsUri,photos';

async function lookupPlaceByIdOnce(placeId: string, key: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<{ placeId: string; card: PlaceCard } | null> {
  const id = placeId.trim().replace(/^places\//, '');
  if (!id || /[^A-Za-z0-9_-]/.test(id)) return null;
  const response = await fetchImpl(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, {
    headers: {
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': DETAIL_FIELD_MASK,
    },
    signal: photoTimeout(timeoutMs),
  });
  if (!response.ok) return null;
  const body = await response.json() as DetailBody;
  if (!body.id) return null;
  return { placeId: body.id, card: parsePlaceDetail(body) };
}

export async function lookupPlaceById(placeId: string, key: string, fetchImpl: typeof fetch, timeoutMs = PHOTO_TIMEOUT_MS): Promise<{ placeId: string; card: PlaceCard } | null> {
  const id = placeId.trim().replace(/^places\//, '');
  if (!id || /[^A-Za-z0-9_-]/.test(id)) return null;
  return sharePlaceLoad(`id:${id}`, () => lookupPlaceByIdOnce(placeId, key, fetchImpl, timeoutMs));
}

export async function loadPlace(input: { placeId: string | null; query: string | null; key: string; fetchImpl: typeof fetch }): Promise<{ placeId: string; card: PlaceCard } | null> {
  if (input.placeId) {
    const byId = await lookupPlaceById(input.placeId, input.key, input.fetchImpl);
    if (byId) return byId;
  }
  if (!input.query) return null;
  return lookupPlace(input.query, input.key, input.fetchImpl);
}

export function storedPlaceCard(input: {
  name?: unknown;
  rating?: unknown;
  reviewCount?: unknown;
  hours?: unknown;
  phone?: unknown;
  website?: unknown;
  mapsUrl?: unknown;
  photoName?: unknown;
  photoCredits?: unknown;
} | null | undefined): PlaceCard | null {
  if (!input) return null;
  const text = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
  const list = (value: unknown) => Array.isArray(value) && value.some((item) => typeof item === 'string' && item.trim().length > 0);
  const present = text(input.name) || typeof input.rating === 'number' || typeof input.reviewCount === 'number' || list(input.hours) || text(input.phone) || text(input.website) || text(input.mapsUrl) || text(input.photoName) || list(input.photoCredits);
  if (!present) return null;
  return placeCardOnly(input);
}

export function cachedPhotoName(input: { sells: boolean; cache: PlaceCache | null; now: number }): string | null {
  if (!input.sells || !input.cache || !placeCacheFresh(input.cache.fetchedAt, input.now)) return null;
  return input.cache.fields?.photoName || null;
}

export async function currentPhotoName(input: { sells: boolean; cache: PlaceCache | null; query: string | null; now: number; key: string; fetchImpl: typeof fetch; photoName?: string | null }): Promise<string | null> {
  if (input.photoName && PHOTO_NAME_PATTERN.test(input.photoName)) return input.photoName;
  const cached = cachedPhotoName(input);
  if (cached && PHOTO_NAME_PATTERN.test(cached)) return cached;
  const live = await loadPlace({ placeId: input.cache?.placeId ?? null, query: input.query, key: input.key, fetchImpl: input.fetchImpl });
  return live?.card.photoName ?? null;
}

export const PHOTO_NAME_PATTERN = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

export const PHOTO_MAX_HEIGHT_PX = 384;
export const PHOTO_MAX_WIDTH_PX = 768;

export function photoMediaUrl(photoName: string): string | null {
  if (!PHOTO_NAME_PATTERN.test(photoName)) return null;
  return `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=${PHOTO_MAX_HEIGHT_PX}&maxWidthPx=${PHOTO_MAX_WIDTH_PX}&skipHttpRedirect=true`;
}

export function placeCardOnly(input: {
  name?: unknown;
  rating?: unknown;
  reviewCount?: unknown;
  hours?: unknown;
  phone?: unknown;
  website?: unknown;
  mapsUrl?: unknown;
  photoName?: unknown;
  photoCredits?: unknown;
} | null | undefined): PlaceCard | null {
  if (!input) return null;
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
  const list = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []);
  return {
    name: text(input.name) || 'Name not provided',
    rating: typeof input.rating === 'number' ? input.rating : null,
    reviewCount: typeof input.reviewCount === 'number' ? input.reviewCount : null,
    hours: list(input.hours),
    phone: text(input.phone),
    website: text(input.website),
    mapsUrl: text(input.mapsUrl),
    photoName: text(input.photoName),
    photoCredits: list(input.photoCredits),
  };
}

export const PHOTO_CACHE_CONTROL = 'no-store, private';

export function photoResponseHeaders(contentType: string): Record<string, string> {
  return {
    'content-type': contentType,
    'cache-control': PHOTO_CACHE_CONTROL,
    'x-content-type-options': 'nosniff',
  };
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
export type PinnedRequest = (url: string, address: string, init?: { headers?: Record<string, string>; signal?: AbortSignal; ca?: string }) => Promise<Response>;

export const PHOTO_TIMEOUT_MS = 8000;
export const PHOTO_MAX_BYTES = 524_288;

export function photoAddressAllowed(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  const parsed = ipaddr.parse(address);
  if (parsed.kind() === 'ipv6') {
    const v6 = parsed as ipaddr.IPv6;
    if (v6.parts.slice(0, 6).every((part) => part === 0)) return false;
    if (blockedIpv6Prefix(v6.parts)) return false;
  }
  return parsed.range() === 'unicast';
}

function blockedIpv6Prefix(groups: number[]): boolean {
  if (groups[0] === 0x64 && groups[1] === 0xff9b && groups[2] === 1) return true;
  if ((groups[0] & 0xffc0) === 0xfec0) return true;
  if (groups[0] === 0x3fff && (groups[1] & 0xf000) === 0) return true;
  if (groups[0] === 0x5f00) return true;
  return false;
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

const photoFlights = new Map<string, Promise<unknown>>();

export function sharePhotoLoad<T>(accountId: string, load: () => Promise<T>): Promise<T> {
  const current = photoFlights.get(accountId) as Promise<T> | undefined;
  if (current) return current;
  const flight = load().finally(() => {
    if (photoFlights.get(accountId) === flight) photoFlights.delete(accountId);
  });
  photoFlights.set(accountId, flight);
  return flight;
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
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const req = https.request({
      protocol: 'https:',
      hostname: target.hostname,
      servername: target.hostname,
      port: target.port || '443',
      path: `${target.pathname}${target.search}`,
      method: 'GET',
      headers: init?.headers,
      signal: init?.signal,
      ca: init?.ca,
      lookup: (_hostname, options, callback) => {
        const all = typeof options === 'object' && options !== null && 'all' in options && Boolean((options as { all?: boolean }).all);
        if (all) {
          callback(null, [{ address, family }] as unknown as string);
          return;
        }
        callback(null, address, family);
      },
    }, (res) => {
      const capped = collectCapped(PHOTO_MAX_BYTES);
      res.on('data', (chunk: Buffer) => {
        if (capped.push(chunk)) return;
        fail(new Error('photo too large'));
        res.destroy();
        req.destroy();
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
    req.on('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    req.end();
  });
};
