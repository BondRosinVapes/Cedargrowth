import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@/lib/supabase';
import {
  activeSalesBrands,
  isMissingSchema,
  pruneSigninAttempts,
  SALES_AT_COOKIE,
  SALES_RT_COOKIE,
  safeSalesReturnPath,
  signinRateAllowed,
} from '@/lib/crm/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 8;
const attempts = new Map<string, number[]>();

function sameOrigin(request: Request): boolean {
  const marker = request.headers.get('x-cedargrowth-sales');
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  if (marker !== '1' || !origin) return false;
  try {
    if (new URL(origin).origin !== new URL(request.url).origin) return false;
  } catch {
    return false;
  }
  if (site && site !== 'same-origin') return false;
  return true;
}

function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
  return ip.slice(0, 80) || 'unknown';
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: 'Request was rejected.' }, { status: 403, headers: { 'cache-control': 'private, no-store' } });
  }
  const key = clientKey(request);
  const now = Date.now();
  const recent = pruneSigninAttempts(attempts.get(key) ?? [], now, WINDOW_MS);
  if (!signinRateAllowed(recent, LIMIT)) {
    attempts.set(key, recent);
    return NextResponse.json({ error: 'Sales sign-in is temporarily unavailable.' }, { status: 429, headers: { 'cache-control': 'private, no-store' } });
  }
  recent.push(now);
  attempts.set(key, recent);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishable) {
    return NextResponse.json({ error: 'Sales sign-in is not configured.' }, { status: 503, headers: { 'cache-control': 'private, no-store' } });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'That did not resolve.' }, { status: 400, headers: { 'cache-control': 'private, no-store' } });
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password || email.length > 200 || password.length > 200) {
    return NextResponse.json({ error: 'Those credentials did not match.' }, { status: 401, headers: { 'cache-control': 'private, no-store' } });
  }

  const authClient = createClient(url, publishable, { auth: { persistSession: false } });
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) {
    return NextResponse.json({ error: 'Those credentials did not match.' }, { status: 401, headers: { 'cache-control': 'private, no-store' } });
  }

  const svc = getSupabaseServerClient();
  if (!svc) {
    return NextResponse.json({ error: 'Sales access is not provisioned.' }, { status: 403, headers: { 'cache-control': 'private, no-store' } });
  }
  const { data: rows, error: readError } = await svc
    .from('crm_sales_memberships')
    .select('brand, desk_role, revoked_at')
    .eq('auth_user_id', data.user.id)
    .is('revoked_at', null);
  if (readError && isMissingSchema(readError)) {
    return NextResponse.json({ error: 'Sales access is not provisioned.' }, { status: 403, headers: { 'cache-control': 'private, no-store' } });
  }
  const brands = activeSalesBrands(
    data.user.id,
    (rows ?? []).map((row) => ({
      authUserId: data.user.id,
      brand: String(row.brand ?? ''),
      deskRole: String(row.desk_role ?? ''),
      revokedAt: row.revoked_at ? String(row.revoked_at) : null,
    })),
  );
  if (readError || brands.length === 0) {
    return NextResponse.json({ error: 'Sales access is not provisioned.' }, { status: 403, headers: { 'cache-control': 'private, no-store' } });
  }

  const next = safeSalesReturnPath(body.next);
  const res = NextResponse.json({ ok: true, next });
  const secure = process.env.NODE_ENV === 'production';
  res.cookies.set(SALES_AT_COOKIE, data.session.access_token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: data.session.expires_in ?? 3600,
  });
  res.cookies.set(SALES_RT_COOKIE, data.session.refresh_token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  res.headers.set('cache-control', 'private, no-store');
  return res;
}
