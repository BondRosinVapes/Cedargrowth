// Google Places (New) lookup for CedarGrowth accounts. The API key stays on the server.

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

export async function fetchAllowedPhoto(start: string, fetchImpl: typeof fetch, hops = 0): Promise<Response | null> {
  const current = allowedPhotoUrl(start);
  if (!current || hops > 2) return null;
  const response = await fetchImpl(current, { redirect: 'manual' });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (!location) return null;
    return fetchAllowedPhoto(new URL(location, current).toString(), fetchImpl, hops + 1);
  }
  if (!response.ok) return null;
  return response;
}

export async function readPlacePhoto(photoName: string, key: string, fetchImpl: typeof fetch): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const mediaUrl = photoMediaUrl(photoName);
  if (!mediaUrl) return null;
  const meta = await fetchImpl(mediaUrl, { redirect: 'manual', headers: { 'X-Goog-Api-Key': key } });
  if (meta.status >= 300 && meta.status < 400 || !meta.ok) return null;
  const body = await meta.json().catch(() => null) as { photoUri?: unknown } | null;
  if (!body || typeof body.photoUri !== 'string') return null;
  const image = await fetchAllowedPhoto(body.photoUri, fetchImpl);
  if (!image) return null;
  return { bytes: await image.arrayBuffer(), contentType: image.headers.get('content-type') || 'image/jpeg' };
}
