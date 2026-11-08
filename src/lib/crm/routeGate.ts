import { NextResponse } from 'next/server';
import type { CrmContext, CrmResult } from './handlers';
import { resolveDeskAccess } from './salesSession';
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
  const access = await resolveDeskAccess();
  const result = await handle({
    actorId: access.actorId,
    grants: access.grants,
    request,
    store: getCrmStore(),
  });
  return NextResponse.json(result.body, { status: result.status, headers });
}
