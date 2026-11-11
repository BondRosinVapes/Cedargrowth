import { NextResponse } from 'next/server';
import { authorizePlacePhoto } from '@/lib/crm/engine';
import { dnsPhotoLookup, pinnedPhotoRequest, readPlacePhoto, sharePhotoLoad } from '@/lib/crm/places';
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
  const photo = await sharePhotoLoad(`${auth.brand}:${accountId}`, async () => {
    const cache = await store.readPlaceCache(auth.brand, accountId);
    const photoName = cache.state === 'ok' ? cache.value?.fields?.photoName : null;
    if (!photoName) return null;
    return readPlacePhoto(photoName, key, { lookup: dnsPhotoLookup, request: pinnedPhotoRequest });
  });
  if (!photo) return new NextResponse(null, { status: 404 });
  return new NextResponse(photo.bytes, {
    status: 200,
    headers: {
      'content-type': photo.contentType,
      'cache-control': 'private, max-age=3600',
      'x-content-type-options': 'nosniff',
    },
  });
}
