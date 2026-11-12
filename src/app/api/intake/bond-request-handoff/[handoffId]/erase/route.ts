import { handleBondRequestHttp } from '@/lib/crm/requestHandoff';
import { handoffDeps } from '@/lib/crm/handoffDeps';
import { respond } from '@/lib/crm/handoffHttp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: Request, { params }: { params: { handoffId: string } }) {
  return respond(await handleBondRequestHttp(request, handoffDeps(), { kind: 'erase', handoffId: params.handoffId }));
}
