import { runCrm } from '@/lib/crm/routeGate';
import { handleOpportunityUpdate } from '@/lib/crm/handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function PATCH(request: Request, { params }: { params: { id: string } }) {
  return runCrm(request, (ctx) => handleOpportunityUpdate(ctx, params.id));
}
