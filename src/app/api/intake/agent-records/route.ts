import { NextResponse } from 'next/server';
import { handleAgentIntake } from '@/lib/crm/handlers';
import { getCrmStore } from '@/lib/crm/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const headers = {
  'cache-control': 'private, no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

export async function POST(request: Request) {
  const result = await handleAgentIntake(getCrmStore(), request);
  const responseHeaders = result.retryAfter ? { ...headers, 'retry-after': String(result.retryAfter) } : headers;
  return NextResponse.json(result.body, { status: result.status, headers: responseHeaders });
}
