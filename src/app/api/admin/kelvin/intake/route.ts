import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase';
import { currentAdmin } from '@/lib/kelvinSession';
import {
  INTAKE_KEY_ENV,
  INTAKE_MAX_BODY,
  INTAKE_URL_ENV,
  readIntakeConfig,
  runIntake,
  intakeOriginAllowed,
} from '@/lib/kelvinIntake';

// One-way proposal intake. Session gated. Reads the routine URL and key from
// server env only. Does not report whether a bot finished.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function intakeEnv() {
  return {
    url: process.env[INTAKE_URL_ENV],
    key: process.env[INTAKE_KEY_ENV],
  };
}

function clock(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export async function GET(request: Request) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ configured: false }, { status: 401 });
  const origin = request.headers.get('origin');
  if (origin && !intakeOriginAllowed(origin, request.url)) {
    return NextResponse.json({ configured: false }, { status: 403 });
  }
  return NextResponse.json({ configured: readIntakeConfig(intakeEnv()).configured });
}

export async function POST(request: Request) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ state: 'unauthorized' }, { status: 401 });
  const declared = Number(request.headers.get('content-length') || '0');
  if (Number.isFinite(declared) && declared > INTAKE_MAX_BODY) {
    return NextResponse.json({ state: 'invalid' }, { status: 400 });
  }
  const rawText = await request.text();
  const supabase = getSupabaseServerClient();

  const result = await runIntake({
    admin,
    origin: request.headers.get('origin'),
    requestUrl: request.url,
    rawText,
    env: intakeEnv(),
    findReceipt: async (taskId) => {
      if (!supabase) return 'unknown';
      const { data, error } = await supabase
        .from('kelvin_events')
        .select('summary')
        .eq('wing', 'intake')
        .eq('sub', taskId)
        .limit(1);
      if (error) return 'unknown';
      const summary = data && data[0] ? String(data[0].summary) : '';
      if (!summary) return 'none';
      if (summary === 'Intake accepted') return 'accepted';
      if (summary === 'Intake not accepted') return 'rejected';
      return 'reserved';
    },
    reserve: async (value) => {
      if (!supabase) return false;
      const { error } = await supabase.from('kelvin_events').insert({
        agent: value.agent,
        time: clock(),
        type: 'DECISION',
        summary: 'Intake reserved',
        sub: value.taskId,
        wing: 'intake',
      });
      return !error;
    },
    mark: async (taskId, summary) => {
      if (!supabase) return;
      await supabase.from('kelvin_events').update({ summary }).eq('wing', 'intake').eq('sub', taskId);
    },
  });

  return NextResponse.json(result.body, { status: result.http });
}
