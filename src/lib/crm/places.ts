// Google Places (New) lookup for CedarGrowth accounts. The API key stays on the server.

import { lookup as dnsLookup } from 'node:dns/promises';
import https from 'node:https';

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
export type PinnedRequest = (url: string, address: string, init?: { headers?: Record<string, string> }) => Promise<Response>;

function ipv4Parts(address: string): number[] | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address);
  if (!match) return null;
  const parts = match.slice(1).map((part) => Number(part));
  if (parts.some((part) => part > 255)) return null;
  return parts;
}

function ipv4Blocked(parts: number[]): boolean {
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a >= 224) return true;
  return false;
}

function expandIpv6(input: string): number[] | null {
  let address = input.toLowerCase().split('%')[0];
  if (address.includes('.')) {
    const last = address.lastIndexOf(':');
    const tail = ipv4Parts(address.slice(last + 1));
    if (!tail) return null;
    const hex = `${((tail[0] << 8) | tail[1]).toString(16)}:${((tail[2] << 8) | tail[3]).toString(16)}`;
    address = `${address.slice(0, last + 1)}${hex}`;
  }
  const halves = address.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  if (halves.length === 1 && head.length !== 8) return null;
  const missing = 8 - head.length - tail.length;
  if (missing < 0) return null;
  const groups = [...head, ...Array(missing).fill('0'), ...tail];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.map((group) => parseInt(group, 16));
}

function ipv6Blocked(groups: number[]): boolean {
  const mapped = groups[0] === 0 && groups[1] === 0 && groups[2] === 0 && groups[3] === 0 && groups[4] === 0 && groups[5] === 0xffff;
  if (mapped) return true;
  if (groups.every((part) => part === 0)) return true;
  if (groups.slice(0, 7).every((part) => part === 0) && groups[7] === 1) return true;
  if ((groups[0] & 0xfe00) === 0xfc00) return true;
  if ((groups[0] & 0xffc0) === 0xfe80) return true;
  if ((groups[0] & 0xff00) === 0xff00) return true;
  return false;
}

export function photoAddressAllowed(address: string): boolean {
  const v4 = ipv4Parts(address);
  if (v4) return !ipv4Blocked(v4);
  const v6 = expandIpv6(address);
  if (!v6) return false;
  return !ipv6Blocked(v6);
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

export async function fetchAllowedPhoto(start: string, deps: { lookup: PhotoLookup; request: PinnedRequest; headers?: Record<string, string> }, hops = 0): Promise<Response | null> {
  const current = allowedPhotoUrl(start);
  if (!current || hops > 2) return null;
  const host = new URL(current).hostname;
  const address = await checkedPhotoAddress(host, deps.lookup);
  if (!address) return null;
  const headers = host === 'places.googleapis.com' ? deps.headers : undefined;
  const response = await deps.request(current, address, { headers });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (!location) return null;
    return fetchAllowedPhoto(new URL(location, current).toString(), { lookup: deps.lookup, request: deps.request }, hops + 1);
  }
  if (!response.ok) return null;
  return response;
}

export async function readPlacePhoto(photoName: string, key: string, deps: { lookup: PhotoLookup; request: PinnedRequest }): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const mediaUrl = photoMediaUrl(photoName);
  if (!mediaUrl) return null;
  const meta = await fetchAllowedPhoto(mediaUrl, { ...deps, headers: { 'X-Goog-Api-Key': key } });
  if (!meta || meta.status >= 300 && meta.status < 400 || !meta.ok) return null;
  const body = await meta.json().catch(() => null) as { photoUri?: unknown } | null;
  if (!body || typeof body.photoUri !== 'string') return null;
  const image = await fetchAllowedPhoto(body.photoUri, deps);
  if (!image) return null;
  return { bytes: await image.arrayBuffer(), contentType: image.headers.get('content-type') || 'image/jpeg' };
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
      lookup: (_hostname, _options, callback) => {
        callback(null, address, family);
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(res.headers)) {
          if (typeof value === 'string') headers.set(name, value);
          else if (Array.isArray(value)) for (const item of value) headers.append(name, item);
        }
        resolve(new Response(Buffer.concat(chunks), { status: res.statusCode || 0, headers }));
      });
    });
    req.on('error', reject);
    req.end();
  });
};
