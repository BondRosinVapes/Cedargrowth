import { NextResponse } from 'next/server';
import { handleTransparencyBatch } from '@/lib/crm/handlers';
import { getCrmStore } from '@/lib/crm/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const result = await handleTransparencyBatch(getCrmStore(), request);
  return NextResponse.json(result.body, {
    status: result.status,
    headers: {
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
  });
}
