import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase';
import { currentAdmin } from '@/lib/kelvinSession';

// Reads the Security dataset in the client shape. Gated.

export const runtime = 'nodejs';

export async function GET() {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: 'No session' }, { status: 401 });

  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 });

  const [mo, fi, inc, ru, wa, au, pc, ve] = await Promise.all([
    supabase.from('kelvin_monitors').select('*').order('id'),
    supabase.from('kelvin_findings').select('*').order('id'),
    supabase.from('kelvin_incidents').select('*').order('id'),
    supabase.from('kelvin_rules').select('*').order('id'),
    supabase.from('kelvin_waivers').select('*').order('id'),
    supabase.from('kelvin_audit').select('*').order('id'),
    supabase.from('kelvin_prechecks').select('*').order('id'),
    supabase.from('kelvin_vendors').select('*').order('id'),
  ]);

  return NextResponse.json({
    monitors: (mo.data || []).map((m) => ({ id: m.id, name: m.name, target: m.target, cadence: m.cadence, lastRun: m.last_run, state: m.state })),
    findings: fi.data || [],
    incidents: (inc.data || []).map((i) => ({ id: i.id, title: i.title, sev: i.sev, status: i.status, opened: i.opened, findings: i.findings || [] })),
    rules: ru.data || [],
    waivers: wa.data || [],
    audit: (au.data || []).map((a) => ({ time: a.time, actor: a.actor, action: a.action, target: a.target })),
    prechecks: pc.error ? null : (pc.data || []),
    vendors: (ve.data || []).map((v) => ({ id: v.id, name: v.name, type: v.type, posture: v.posture, lastReview: v.last_review })),
  });
}
