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

type SearchBody = { places?: { id?: string }[] };
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

export async function lookupPlace(query: string, key: string, fetchImpl: typeof fetch): Promise<{ placeId: string; card: PlaceCard } | null> {
  const search = await fetchImpl('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.id',
    },
    body: JSON.stringify({ textQuery: query, pageSize: 1 }),
  });
  if (!search.ok) return null;
  const found = await search.json() as SearchBody;
  const placeId = found.places?.[0]?.id;
  if (!placeId) return null;
  const detail = await fetchImpl(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'id,displayName,rating,userRatingCount,regularOpeningHours,nationalPhoneNumber,websiteUri,googleMapsUri,photos',
    },
  });
  if (!detail.ok) return null;
  const body = await detail.json() as DetailBody;
  return { placeId, card: parsePlaceDetail(body) };
}
