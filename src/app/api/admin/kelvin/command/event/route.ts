import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase';
import { currentAdmin } from '@/lib/kelvinSession';
import { clientFeedEventAllowed } from '@/lib/kelvinIntake';

// Persists a feed event. Wing actions and directives post here so the feed holds
// across sessions. The live ticker does not post, so it stays ephemeral. Gated.

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ ok: false }, { status: 401 });

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ ok: false }, { status: 503 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const b = (body ?? {}) as Record<string, unknown>;
  const row = {
    agent: typeof b.agent === 'string' ? b.agent : 'MERIDIAN',
    time: typeof b.time === 'string' ? b.time : '',
    type: typeof b.type === 'string' ? b.type : 'DECISION',
    summary: typeof b.summary === 'string' ? b.summary : '',
    sub: typeof b.sub === 'string' ? b.sub : '',
    wing: typeof b.wing === 'string' ? b.wing : null,
  };
  if (!clientFeedEventAllowed(row)) return NextResponse.json({ ok: false }, { status: 400 });
  const { data } = await supabase.from('kelvin_events').insert(row).select('id').maybeSingle();
  return NextResponse.json({ ok: true, id: data ? Number(data.id) : null });
}
