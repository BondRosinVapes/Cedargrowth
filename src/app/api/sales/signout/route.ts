import { NextResponse } from 'next/server';
import { SALES_AT_COOKIE, SALES_RT_COOKIE } from '@/lib/crm/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  const marker = request.headers.get('x-cedargrowth-sales');
  let same = false;
  try {
    same = marker === '1' && !!origin && new URL(origin).origin === new URL(request.url).origin;
  } catch {
    same = false;
  }
  if (!same) {
    return NextResponse.json({ error: 'Request was rejected.' }, { status: 403 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SALES_AT_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
  res.cookies.set(SALES_RT_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
  res.headers.set('cache-control', 'private, no-store');
  return res;
}
