import { runCrm } from '@/lib/crm/routeGate';
import { handleActivity } from '@/lib/crm/handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function GET(request: Request) {
  return runCrm(request, (ctx) => handleActivity(ctx));
}
