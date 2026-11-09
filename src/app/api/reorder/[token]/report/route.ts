import { NextResponse } from 'next/server';
import { handleReorderReport } from '@/lib/crm/handlers';
import { getCrmStore } from '@/lib/crm/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request, { params }: { params: { token: string } }) {
  const result = await handleReorderReport(getCrmStore(), request, params.token);
  return NextResponse.json(result.body, {
    status: result.status,
    headers: {
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
  });
}
