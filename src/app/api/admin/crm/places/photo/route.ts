import { NextResponse } from 'next/server';
import { authorizeCrmRequest } from '@/lib/crm/engine';
import { resolveDeskAccess } from '@/lib/crm/salesSession';
import { getCrmStore } from '@/lib/crm/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const access = await resolveDeskAccess();
  const auth = authorizeCrmRequest({
    actorId: access.actorId,
    grants: access.grants,
    method: 'GET',
    requestOrigin: url.origin,
    headerOrigin: request.headers.get('origin'),
    headerMarker: request.headers.get('x-cedargrowth-crm'),
    headerFetchSite: request.headers.get('sec-fetch-site'),
    brandRaw: url.searchParams.get('brand'),
  });
  if (!auth.ok || auth.brand !== 'cedargrowth') return new NextResponse(null, { status: auth.ok ? 404 : auth.status });
  const accountId = url.searchParams.get('accountId') || '';
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim() || '';
  if (!key || !accountId) return new NextResponse(null, { status: 404 });
  const cache = await getCrmStore().readPlaceCache(auth.brand, accountId);
  const photoName = cache.state === 'ok' ? cache.value?.fields?.photoName : null;
  if (!photoName) return new NextResponse(null, { status: 404 });
  const meta = await fetch(`https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=400&skipHttpRedirect=true`, {
    headers: { 'X-Goog-Api-Key': key },
  });
  if (!meta.ok) return new NextResponse(null, { status: 404 });
  const body = await meta.json().catch(() => ({})) as { photoUri?: string };
  if (!body.photoUri) return new NextResponse(null, { status: 404 });
  const image = await fetch(body.photoUri);
  if (!image.ok) return new NextResponse(null, { status: 404 });
  return new NextResponse(image.body, {
    status: 200,
    headers: {
      'content-type': image.headers.get('content-type') || 'image/jpeg',
      'cache-control': 'private, max-age=3600',
      'x-content-type-options': 'nosniff',
    },
  });
}
