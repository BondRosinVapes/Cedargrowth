import { authorizeCrmRequest, isDispensaryAccount } from './engine';
import type { CrmContext, CrmResult } from './handlers';
import { loadPlace, placeQuery, placeReadPlan, retainPlaceCache, type PlaceCard } from './places';
import { browserLink } from './placeLinks';

function denied(status: number, reason: string): CrmResult {
  return { status, body: { ok: false, reason } };
}

export async function handleGooglePlace(ctx: CrmContext, now = Date.now()): Promise<CrmResult> {
  const url = new URL(ctx.request.url);
  const auth = authorizeCrmRequest({
    actorId: ctx.actorId,
    grants: ctx.grants,
    method: ctx.request.method,
    requestOrigin: url.origin,
    headerOrigin: ctx.request.headers.get('origin'),
    headerMarker: ctx.request.headers.get('x-cedargrowth-crm'),
    headerFetchSite: ctx.request.headers.get('sec-fetch-site'),
    brandRaw: url.searchParams.get('brand'),
  });
  if (!auth.ok) return denied(auth.status, auth.reason);
  if (auth.brand !== 'cedargrowth') return denied(404, 'Not found.');
  const accountId = url.searchParams.get('accountId');
  if (!accountId) return denied(400, 'Account is required.');
  const account = await ctx.store.readAccount(auth.brand, accountId);
  if (account.state !== 'ok') return denied(503, 'CRM storage could not be read.');
  if (!account.value) return denied(404, 'Not found.');
  if (!isDispensaryAccount(account.value.accountType)) return { status: 200, body: { ok: true, state: 'not_dispensary' } };
  const cacheResult = await ctx.store.readPlaceCache(auth.brand, accountId);
  if (cacheResult.state !== 'ok') return denied(503, 'CRM storage could not be read.');
  const selling = await ctx.store.accountHasWonDeal(auth.brand, accountId);
  if (selling.state !== 'ok') return denied(503, 'CRM storage could not be read.');
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim() || '';
  const query = placeQuery(account.value);
  const plan = placeReadPlan({
    hasKey: key.length > 0,
    query,
    cache: cacheResult.value,
    now,
    sells: selling.value,
  });
  if (plan.action === 'not_connected') return { status: 200, body: { ok: true, state: 'not_connected' } };
  if (plan.action === 'no_address') return { status: 200, body: { ok: true, state: 'no_match' } };
  if (plan.action === 'use_cache') {
    if (plan.cache.matchStatus === 'none' || !plan.cache.fields) return { status: 200, body: { ok: true, state: 'no_match' } };
    return { status: 200, body: { ok: true, state: 'matched', card: publicCard(accountId, plan.cache.fields) } };
  }
  const found = await loadPlace({ placeId: cacheResult.value?.placeId ?? null, query, key, fetchImpl: fetch });
  const fetchedAt = new Date(now).toISOString();
  const saved = await ctx.store.savePlaceCache(auth.brand, accountId, retainPlaceCache(found
    ? { placeId: found.placeId, matchStatus: 'matched', fields: found.card, fetchedAt }
    : { placeId: cacheResult.value?.placeId ?? null, matchStatus: 'none', fields: null, fetchedAt }, plan.retain));
  if (saved.state !== 'ok') return denied(503, 'CRM storage could not be read.');
  if (!found) return { status: 200, body: { ok: true, state: 'no_match' } };
  return { status: 200, body: { ok: true, state: 'matched', card: publicCard(accountId, found.card) } };
}

function publicCard(accountId: string, card: PlaceCard) {
  return {
    name: card.name,
    rating: card.rating,
    reviewCount: card.reviewCount,
    hours: card.hours,
    phone: card.phone,
    website: browserLink(card.website),
    mapsUrl: browserLink(card.mapsUrl),
    photoCredits: card.photoCredits,
    photoUrl: card.photoName ? `/api/admin/crm/places/photo?brand=cedargrowth&accountId=${encodeURIComponent(accountId)}` : null,
  };
}

export async function handleDistributionMerge(ctx: CrmContext): Promise<CrmResult> {
  const url = new URL(ctx.request.url);
  const brandRaw = ctx.request.method === 'GET' ? url.searchParams.get('brand') : null;
  let body: { brand?: string; mergeId?: string } = {};
  if (ctx.request.method === 'POST') body = await ctx.request.json().catch(() => ({}));
  const auth = authorizeCrmRequest({
    actorId: ctx.actorId,
    grants: ctx.grants,
    method: ctx.request.method,
    requestOrigin: url.origin,
    headerOrigin: ctx.request.headers.get('origin'),
    headerMarker: ctx.request.headers.get('x-cedargrowth-crm'),
    headerFetchSite: ctx.request.headers.get('sec-fetch-site'),
    brandRaw: brandRaw || body.brand || null,
  });
  if (!auth.ok) return denied(auth.status, auth.reason);
  if (auth.brand !== 'cedargrowth') return denied(404, 'Not found.');
  if (ctx.request.method === 'GET') {
    const accountId = url.searchParams.get('accountId');
    if (!accountId) return denied(400, 'Account is required.');
    const merge = await ctx.store.readAccountMerge(auth.brand, accountId);
    if (merge.state !== 'ok') return denied(503, 'CRM storage could not be read.');
    return { status: 200, body: { ok: true, merge: merge.value } };
  }
  if (!auth.actorId) return denied(401, 'Sign in required.');
  const undone = await ctx.store.undoMerge(auth.brand, String(body.mergeId || ''), auth.actorId, new Date().toISOString());
  if (undone.state !== 'ok') return denied(400, 'That merge was not undone.');
  return { status: 200, body: { ok: true, merge: undone.value.merge, refused: undone.value.refused, reassigned: undone.value.reassigned } };
}
