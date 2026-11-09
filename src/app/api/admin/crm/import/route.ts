import { runCrm } from '@/lib/crm/routeGate';
import { handleImport } from '@/lib/crm/handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function POST(request: Request) {
  return runCrm(request, (ctx) => handleImport(ctx));
}
