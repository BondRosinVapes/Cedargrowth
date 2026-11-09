import { runCrm } from '@/lib/crm/routeGate';
import { handleReports } from '@/lib/crm/handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function GET(request: Request) {
  return runCrm(request, (ctx) => handleReports(ctx));
}
