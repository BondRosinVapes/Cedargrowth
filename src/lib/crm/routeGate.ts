import { NextResponse } from 'next/server';
import { currentAdmin } from '@/lib/kelvinSession';
import type { CrmContext, CrmResult } from './handlers';
import { getCrmStore } from './store';

const headers = {
  'cache-control': 'private, no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

export async function runCrm(
  request: Request,
  handle: (ctx: CrmContext) => Promise<CrmResult>,
): Promise<NextResponse> {
  const result = await handle({
    adminEmail: await currentAdmin(),
    request,
    store: getCrmStore(),
  });
  return NextResponse.json(result.body, { status: result.status, headers });
}
