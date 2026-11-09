import { runCrm } from '@/lib/crm/routeGate';
import { handleCapacity } from '@/lib/crm/handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function PUT(request: Request) {
  return runCrm(request, (ctx) => handleCapacity(ctx));
}
