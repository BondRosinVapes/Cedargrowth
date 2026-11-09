import { NextResponse, type NextRequest } from 'next/server';
import { KELVIN_COOKIE, readSession } from '@/lib/kelvinAuth';
import { SALES_AT_COOKIE } from '@/lib/crm/engine';

// KELVIN remains a valid owner path into the CRM. A sales cookie is the other
// door, and the route still checks an explicit membership before any data.
// /manufacturing stays public.

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const salesCookie = req.cookies.get(SALES_AT_COOKIE)?.value;
  const kelvinEmail = await readSession(req.cookies.get(KELVIN_COOKIE)?.value, process.env.KELVIN_SESSION_SECRET);

  if (pathname === '/manufacturing') {
    const res = NextResponse.next();
    if (salesCookie || kelvinEmail) {
      res.headers.set('cache-control', 'private, no-store');
      res.headers.set('vary', 'cookie');
    }
    return res;
  }

  if (pathname === '/admin/crm' || pathname.startsWith('/admin/crm/') || pathname === '/sales/field' || pathname.startsWith('/sales/field/')) {
    if (!salesCookie && !kelvinEmail) {
      return new NextResponse('Not found', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'private, no-store' },
      });
    }
    const res = NextResponse.next();
    res.headers.set('cache-control', 'private, no-store');
    res.headers.set('vary', 'cookie');
    return res;
  }

  if (pathname === '/admin/kelvin/login') {
    return NextResponse.next();
  }

  if (!kelvinEmail) {
    return new NextResponse('Not found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'private, no-store' },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/kelvin', '/admin/kelvin/:path*', '/admin/crm', '/admin/crm/:path*', '/sales/field', '/sales/field/:path*', '/manufacturing'],
};
