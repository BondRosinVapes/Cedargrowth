import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@/lib/supabase';
import { currentAdmin } from '@/lib/kelvinSession';
import {
  decideDeskAccess,
  SALES_AT_COOKIE,
  type DeskGrant,
  type MembershipRow,
} from './engine';

export type SalesAccess = {
  userId: string | null;
  email: string | null;
  memberships: MembershipRow[];
  store: 'unauthenticated' | 'absent' | 'ok';
};

export type DeskAccess = {
  actorId: string | null;
  label: string;
  grants: DeskGrant[];
  source: 'kelvin_owner' | 'membership' | 'none';
};

function empty(store: SalesAccess['store']): SalesAccess {
  return { userId: null, email: null, memberships: [], store };
}

export async function resolveSalesAccess(): Promise<SalesAccess> {
  let token: string | undefined;
  try {
    token = cookies().get(SALES_AT_COOKIE)?.value;
  } catch {
    token = undefined;
  }
  if (!token) return empty('unauthenticated');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return empty('absent');

  const userClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await userClient.auth.getUser(token);
  const userId = data.user?.id ?? null;
  if (error || !userId) return empty('unauthenticated');
  const email = typeof data.user?.email === 'string' ? data.user.email : null;

  const svc = getSupabaseServerClient();
  if (!svc) return { userId, email, memberships: [], store: 'absent' };
  const { data: rows, error: readError } = await svc
    .from('crm_sales_memberships')
    .select('brand, desk_role, revoked_at')
    .eq('auth_user_id', userId)
    .is('revoked_at', null);
  if (readError || !rows) {
    return { userId, email, memberships: [], store: 'absent' };
  }
  const memberships: MembershipRow[] = rows.map((row) => ({
    authUserId: userId,
    brand: String(row.brand ?? ''),
    deskRole: String(row.desk_role ?? ''),
    revokedAt: row.revoked_at ? String(row.revoked_at) : null,
  }));
  return { userId, email, memberships, store: 'ok' };
}

export async function resolveDeskAccess(): Promise<DeskAccess> {
  const kelvinEmail = await currentAdmin();
  if (kelvinEmail) {
    const decision = decideDeskAccess({
      kelvinOwner: true,
      kelvinActorId: kelvinEmail,
      salesUserId: null,
      memberships: [],
      requestedBrand: null,
    });
    if (decision.ok) {
      return { actorId: decision.actorId, label: kelvinEmail, grants: decision.grants, source: 'kelvin_owner' };
    }
  }
  const sales = await resolveSalesAccess();
  const decision = decideDeskAccess({
    kelvinOwner: false,
    kelvinActorId: null,
    salesUserId: sales.userId,
    memberships: sales.memberships,
    requestedBrand: null,
  });
  if (!decision.ok) {
    return { actorId: sales.userId, label: sales.email ?? 'Sales session', grants: [], source: 'none' };
  }
  return { actorId: decision.actorId, label: sales.email ?? 'Sales session', grants: decision.grants, source: 'membership' };
}
