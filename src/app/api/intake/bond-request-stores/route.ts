import { handleBondRequestHttp } from '@/lib/crm/requestHandoff';
import { handoffDeps } from '@/lib/crm/handoffDeps';
import { respond } from '@/lib/crm/handoffHttp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  return respond(await handleBondRequestHttp(request, handoffDeps(), { kind: 'stores' }));
}
