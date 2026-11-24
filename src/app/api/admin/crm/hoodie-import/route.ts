import { NextResponse } from 'next/server';
import { HOODIE_RESPONSE_HEADERS, handleHoodieImport, type HoodieDb } from '@/lib/crm/hoodieImportHandler';
import { resolveDeskAccess } from '@/lib/crm/salesSession';
import { getSupabaseServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function asHoodieDb(client: NonNullable<ReturnType<typeof getSupabaseServerClient>>): HoodieDb {
  return {
    from(table) {
      return {
        select(columns) {
          return {
            eq(column, value) {
              return {
                async range(from, to) {
                  const { data, error } = await client.from(table).select(columns).eq(column, value).range(from, to);
                  return { data: (data as Record<string, unknown>[] | null) ?? null, error: error ? { message: error.message } : null };
                },
              };
            },
          };
        },
      };
    },
    async rpc(fn, args) {
      const { data, error } = await client.rpc(fn, args);
      return { data, error: error ? { message: error.message } : null };
    },
  };
}

export async function POST(request: Request) {
  const access = await resolveDeskAccess();
  const client = getSupabaseServerClient();
  const result = await handleHoodieImport({
    actorId: access.actorId,
    approverLabel: access.label,
    grants: access.grants,
    request,
    db: client ? asHoodieDb(client) : null,
  });
  return NextResponse.json(result.body, { status: result.status, headers: HOODIE_RESPONSE_HEADERS });
}
