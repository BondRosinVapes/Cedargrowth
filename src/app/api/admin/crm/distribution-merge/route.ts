import { runCrm } from '@/lib/crm/routeGate';
import { handleDistributionMerge } from '@/lib/crm/googlePlaceHandler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function GET(request: Request) {
  return runCrm(request, (ctx) => handleDistributionMerge(ctx));
}

export function POST(request: Request) {
  return runCrm(request, (ctx) => handleDistributionMerge(ctx));
}
