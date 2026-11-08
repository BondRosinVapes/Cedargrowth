import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase';
import { currentAdmin } from '@/lib/kelvinSession';
import {
  INTAKE_KEY_ENV,
  INTAKE_MAX_BODY,
  INTAKE_RECEIPTS_ENV,
  INTAKE_URL_ENV,
  claimFromWrite,
  markFromUpdate,
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
    receipts: process.env[INTAKE_RECEIPTS_ENV],
  };
}

export async function GET(request: Request) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ configured: false }, { status: 401 });
  const origin = request.headers.get('origin');
  if (origin && !intakeOriginAllowed(origin, request.url)) {
    return NextResponse.json({ configured: false }, { status: 403 });
  }
  if (!readIntakeConfig(intakeEnv()).configured) return NextResponse.json({ configured: false });
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ configured: false });
  const contract = await supabase.rpc('kelvin_intake_receipt_contract_v2');
  return NextResponse.json({ configured: !contract.error && contract.data === 'ok' });
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
    claim: async (value) => {
      if (!supabase) return { won: false, state: 'unavailable' as const };
      const inserted = await supabase.from('kelvin_intake_receipts').insert({
        task_id: value.taskId,
        agent: value.agent,
        state: 'reserved',
      });
      if (!inserted.error) return claimFromWrite(null, { error: false, state: null });
      if (inserted.error.code !== '23505') return claimFromWrite(inserted.error.code ?? 'error', { error: true, state: null });
      const existing = await supabase.from('kelvin_intake_receipts').select('state').eq('task_id', value.taskId).maybeSingle();
      return claimFromWrite('23505', {
        error: !!existing.error,
        state: existing.data && typeof existing.data.state === 'string' ? existing.data.state : null,
      });
    },
    mark: async (taskId, summary) => {
      if (!supabase) return 'failed';
      const state = summary === 'Intake accepted' ? 'accepted' : 'rejected';
      const updated = await supabase
        .from('kelvin_intake_receipts')
        .update({ state, updated_at: new Date().toISOString() })
        .eq('task_id', taskId)
        .eq('state', 'reserved')
        .select('state');
      if (updated.error || !updated.data || updated.data.length !== 1 || updated.data[0]?.state !== state) {
        return 'failed';
      }
      const durable = await supabase.from('kelvin_intake_receipts').select('state').eq('task_id', taskId).maybeSingle();
      return markFromUpdate({
        error: !!updated.error || !!durable.error,
        rows: updated.data.length,
        durableState: durable.data && typeof durable.data.state === 'string' ? durable.data.state : null,
        expectedState: state,
      });
    },
    contract: async () => {
      if (!supabase) return false;
      const result = await supabase.rpc('kelvin_intake_receipt_contract_v2');
      return !result.error && result.data === 'ok';
    },
  });

  return NextResponse.json(result.body, { status: result.http });
}
