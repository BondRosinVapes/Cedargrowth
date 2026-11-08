import { NextResponse, type NextRequest } from 'next/server';
import { KELVIN_COOKIE, readSession } from '@/lib/kelvinAuth';

// Gate for the KELVIN admin console and the internal CRM desk. Both use the
// existing signed session. Without a session the middleware returns a bare 404,
// so the route does not announce that it exists. /manufacturing stays public.
// The login POST and logout live under /api and are not matched here.

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(KELVIN_COOKIE)?.value;
  const email = await readSession(token, process.env.KELVIN_SESSION_SECRET);

  // The public wholesale page stays public. A signed-in admin response must
  // not be cached and reused for anyone else. No new permission is introduced.
  if (pathname === '/manufacturing') {
    const res = NextResponse.next();
    if (email) {
      res.headers.set('cache-control', 'private, no-store');
      res.headers.set('vary', 'cookie');
    }
    return res;
  }

  if (pathname === '/admin/kelvin/login') {
    return NextResponse.next();
  }

  if (!email) {
    return new NextResponse('Not found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'private, no-store' },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/kelvin', '/admin/kelvin/:path*', '/admin/crm', '/admin/crm/:path*', '/manufacturing'],
};
