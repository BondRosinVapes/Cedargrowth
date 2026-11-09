import { NextResponse } from 'next/server';
import { handlePublicReorder } from '@/lib/crm/handlers';
import { getCrmStore } from '@/lib/crm/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const headers = {
  'cache-control': 'private, no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

export async function GET(request: Request, { params }: { params: { token: string } }) {
  const result = await handlePublicReorder(getCrmStore(), request, params.token, 'GET');
  return NextResponse.json(result.body, { status: result.status, headers });
}

export async function POST(request: Request, { params }: { params: { token: string } }) {
  const result = await handlePublicReorder(getCrmStore(), request, params.token, 'POST');
  return NextResponse.json(result.body, { status: result.status, headers });
}
