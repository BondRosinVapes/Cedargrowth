import { runCrm } from '@/lib/crm/routeGate';
import { handleTerritory, handleTerritoryAssign } from '@/lib/crm/handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function GET(request: Request) {
  return runCrm(request, (ctx) => handleTerritory(ctx));
}

export function PUT(request: Request) {
  return runCrm(request, (ctx) => handleTerritoryAssign(ctx));
}
