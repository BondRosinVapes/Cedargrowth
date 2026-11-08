import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase';
import { currentAdmin } from '@/lib/kelvinSession';
import { decideReleaseClearance } from '@/app/admin/kelvin/wings/security';

// Security mutations. The release clearance gate is enforced here: clear-release
// checks the precheck rows and refuses while any fail. All gated.

export const runtime = 'nodejs';

function hhmm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export async function POST(request: Request) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ ok: false, reason: 'No session' }, { status: 401 });

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ ok: false, reason: 'Not configured' }, { status: 503 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const b = (body ?? {}) as Record<string, unknown>;
  const op = typeof b.op === 'string' ? b.op : '';
  const id = typeof b.id === 'string' ? b.id : '';
  const value = typeof b.value === 'string' ? b.value : '';

  if (op === 'run-monitor') {
    const { data } = await supabase.from('kelvin_monitors').update({ last_run: hhmm() }).eq('id', id).select('name, state').maybeSingle();
    return NextResponse.json({ ok: true, name: data?.name, state: data?.state });
  }
  if (op === 'set-finding') {
    const { data } = await supabase.from('kelvin_findings').update({ state: value }).eq('id', id).select('sev, title').maybeSingle();
    return NextResponse.json({ ok: true, sev: data?.sev, title: data?.title });
  }
  if (op === 'set-incident') {
    await supabase.from('kelvin_incidents').update({ status: value }).eq('id', id);
    return NextResponse.json({ ok: true });
  }
  if (op === 'enforce-rule') {
    const { data } = await supabase.from('kelvin_rules').update({ state: 'Enforced' }).eq('id', id).eq('state', 'Staged').select('rule, scope').maybeSingle();
    return NextResponse.json({ ok: true, rule: data?.rule, scope: data?.scope });
  }
  if (op === 'revoke-waiver') {
    await supabase.from('kelvin_waivers').update({ status: 'Revoked' }).eq('id', id);
    return NextResponse.json({ ok: true });
  }
  if (op === 'clear-release') {
    const { data, error } = await supabase.from('kelvin_prechecks').select('state');
    const decision = decideReleaseClearance({ error: !!error, rows: error ? null : (data || []) });
    return NextResponse.json(decision);
  }
  if (op === 'review-vendor') {
    const { data } = await supabase.from('kelvin_vendors').update({ posture: 'Reviewed', last_review: hhmm() }).eq('id', id).select('name').maybeSingle();
    return NextResponse.json({ ok: true, name: data?.name });
  }

  return NextResponse.json({ ok: false, reason: 'Unknown operation.' }, { status: 400 });
}
