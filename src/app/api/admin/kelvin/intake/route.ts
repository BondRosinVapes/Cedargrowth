import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase';
import { currentAdmin } from '@/lib/kelvinSession';
import {
  INTAKE_KEY_ENV,
  INTAKE_MAX_BODY,
  INTAKE_RECEIPTS_ENV,
  INTAKE_URL_ENV,
  readIntakeConfig,
  runIntake,
  intakeOriginAllowed,
  type IntakeClaim,
  type StoredReceipt,
} from '@/lib/kelvinIntake';

// One-way proposal intake. Session gated. Reads the routine URL and key from
// server env only. Does not report whether a bot finished.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function intakeEnv() {
  return {
    url: process.env[INTAKE_URL_ENV],
    key: process.env[INTAKE_KEY_ENV],
    receipts: process.env[INTAKE_RECEIPTS_ENV],
  };
}

function storedState(value: unknown): StoredReceipt | null {
  if (value === 'reserved' || value === 'accepted' || value === 'rejected') return value;
  return null;
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
    claim: async (value): Promise<IntakeClaim> => {
      if (!supabase) return { won: false, state: 'unavailable' };
      const inserted = await supabase.from('kelvin_intake_receipts').insert({
        task_id: value.taskId,
        agent: value.agent,
        state: 'reserved',
      });
      if (!inserted.error) return { won: true };
      if (inserted.error.code !== '23505') return { won: false, state: 'unavailable' };
      const existing = await supabase.from('kelvin_intake_receipts').select('state').eq('task_id', value.taskId).maybeSingle();
      if (existing.error) return { won: false, state: 'unavailable' };
      const state = storedState(existing.data?.state);
      if (!state) return { won: false, state: 'unavailable' };
      return { won: false, state };
    },
    mark: async (taskId, summary) => {
      if (!supabase) return;
      const state = summary === 'Intake accepted' ? 'accepted' : 'rejected';
      await supabase.from('kelvin_intake_receipts').update({ state, updated_at: new Date().toISOString() }).eq('task_id', taskId);
    },
  });

  return NextResponse.json(result.body, { status: result.http });
}
