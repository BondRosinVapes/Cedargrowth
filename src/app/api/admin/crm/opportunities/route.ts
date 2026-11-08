import { runCrm } from '@/lib/crm/routeGate';
import { handleOpportunityCollection } from '@/lib/crm/handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function GET(request: Request) {
  return runCrm(request, (ctx) => handleOpportunityCollection(ctx, 'GET'));
}

export function POST(request: Request) {
  return runCrm(request, (ctx) => handleOpportunityCollection(ctx, 'POST'));
}
