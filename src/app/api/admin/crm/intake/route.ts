import { runCrm } from '@/lib/crm/routeGate';
import { handleIntakeDelete, handleIntakePurge } from '@/lib/crm/handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function POST(request: Request) {
  const action = new URL(request.url).searchParams.get('action');
  if (action === 'purge') return runCrm(request, (ctx) => handleIntakePurge(ctx));
  return runCrm(request, (ctx) => handleIntakeDelete(ctx));
}
