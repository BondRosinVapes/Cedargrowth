import { NextResponse } from 'next/server';

const headers = {
  'cache-control': 'private, no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

export function respond(result: { status: number; body: Record<string, unknown> | null }) {
  if (result.body === null) return new NextResponse(null, { status: result.status, headers });
  return NextResponse.json(result.body, { status: result.status, headers });
}
