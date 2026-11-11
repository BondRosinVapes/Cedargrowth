import { runCrm } from '@/lib/crm/routeGate';
import { handleAccountRead, handleAccountUpdate } from '@/lib/crm/handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function GET(request: Request, { params }: { params: { id: string } }) {
  return runCrm(request, (ctx) => handleAccountRead(ctx, params.id));
}

export function PATCH(request: Request, { params }: { params: { id: string } }) {
  return runCrm(request, (ctx) => handleAccountUpdate(ctx, params.id));
}
