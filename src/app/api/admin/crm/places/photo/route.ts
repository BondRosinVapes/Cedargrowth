import { NextResponse } from 'next/server';
import { authorizePlacePhoto } from '@/lib/crm/engine';
import { findStoredPlacePhoto, uploadStoredPlacePhoto } from '@/lib/crm/placePhotoBucket';
import { cachedPhotoName, dnsPhotoLookup, loadStoredOrGooglePhoto, photoResponseHeaders, pinnedPhotoRequest, placeQuery, readPlacePhoto, resolvePlacePhoto, serveStoredPhoto, sharePhotoLoad } from '@/lib/crm/places';
import { resolveDeskAccess } from '@/lib/crm/salesSession';
import { getCrmStore } from '@/lib/crm/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const access = await resolveDeskAccess();
  const auth = authorizePlacePhoto({
    actorId: access.actorId,
    grants: access.grants,
    requestOrigin: url.origin,
    headerOrigin: request.headers.get('origin'),
    headerFetchSite: request.headers.get('sec-fetch-site'),
    brandRaw: url.searchParams.get('brand'),
  });
  if (!auth.ok || auth.brand !== 'cedargrowth') return new NextResponse(null, { status: auth.ok ? 404 : auth.status });
  const accountId = url.searchParams.get('accountId') || '';
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim() || '';
  if (!key || !accountId) return new NextResponse(null, { status: 404 });
  const store = getCrmStore();
  // Gary, 11:50 PM ET on 2026-11-10: store photos for every dispensary.
  // A stored photo is not gated on a Won deal. The Won rule covers cached place details only.
  const photo = await sharePhotoLoad(`${auth.brand}:${accountId}`, async () => {
    const account = await store.readAccount(auth.brand, accountId);
    const cache = await store.readPlaceCache(auth.brand, accountId);
    if (account.state !== 'ok' || !account.value || cache.state !== 'ok') return null;
    const placeId = cache.value?.placeId ?? null;
    if (placeId) {
      try {
        const kept = serveStoredPhoto(await findStoredPlacePhoto(placeId));
        if (kept) return { bytes: kept.bytes.buffer.slice(kept.bytes.byteOffset, kept.bytes.byteOffset + kept.bytes.byteLength) as ArrayBuffer, contentType: kept.contentType };
      } catch {
        console.error('crm place photo read failed', { accountId });
      }
    }
    const selling = await store.accountHasWonDeal(auth.brand, accountId);
    if (selling.state !== 'ok') return null;
    const now = Date.now();
    const known = cachedPhotoName({ sells: selling.value, cache: cache.value, now });
    const resolved = await resolvePlacePhoto({
      sells: selling.value,
      cache: cache.value,
      query: placeQuery(account.value),
      now,
      key,
      fetchImpl: fetch,
      photoName: known,
      placeId,
    });
    if (!resolved) return null;
    const fresh = await readPlacePhoto(resolved.photoName, key, { lookup: dnsPhotoLookup, request: pinnedPhotoRequest });
    if (!fresh) return null;
    const served = await loadStoredOrGooglePhoto({
      stored: null,
      readGoogle: async () => ({ bytes: new Uint8Array(fresh.bytes), contentType: fresh.contentType }),
      upload: () => uploadStoredPlacePhoto(resolved.placeId, resolved.photoName, new Uint8Array(fresh.bytes), fresh.contentType),
      log: (message) => console.error(message, { accountId }),
    });
    if (!served) return null;
    return { bytes: served.bytes.buffer.slice(served.bytes.byteOffset, served.bytes.byteOffset + served.bytes.byteLength) as ArrayBuffer, contentType: served.contentType };
  });
  if (!photo) return new NextResponse(null, { status: 404 });
  return new NextResponse(photo.bytes, {
    status: 200,
    headers: photoResponseHeaders(photo.contentType),
  });
}
