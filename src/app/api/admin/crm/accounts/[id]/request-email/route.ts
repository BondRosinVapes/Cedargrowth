import { runCrm } from '@/lib/crm/routeGate';
import { handleRequestContactEmail } from '@/lib/crm/handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function POST(request: Request, { params }: { params: { id: string } }) {
  return runCrm(request, async (ctx) => {
    const body = await request.json().catch(() => ({}));
    const record = body && typeof body === 'object' ? body as Record<string, unknown> : {};
    const next = new Request(request.url, {
      method: 'POST',
      headers: request.headers,
      body: JSON.stringify({ ...record, accountId: params.id }),
    });
    return handleRequestContactEmail({ ...ctx, request: next });
  });
}
