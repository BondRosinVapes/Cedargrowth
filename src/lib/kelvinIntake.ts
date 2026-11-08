// One-way KELVIN task intake. A signed-in admin can propose a task to the single
// CedarGrowth routine webhook. HTTP 200 from that webhook means a run started,
// not that an agent finished. There is no status callback.
//
// The public routines page (cursor.com/help/grok-bot/routines) says: POST the
// routine URL with Authorization Bearer and an optional JSON body. The Cursor
// plugin skill for bot UIs documents the URL shape as
// https://api2.cursor.sh/automations/webhook/<id> with no query string.
// Any other target stays disabled so a configured value cannot be turned into
// an open outbound call.

import { ROSTER } from '../app/admin/kelvin/store';

export const INTAKE_URL_ENV = 'CEDARGROWTH_KELVIN_INTAKE_URL';
export const INTAKE_KEY_ENV = 'CEDARGROWTH_KELVIN_INTAKE_KEY';
export const INTAKE_PROJECT = 'cedargrowth';
export const INTAKE_ROUTINE = 'cedargrowth-kelvin-request-intake';
export const INTAKE_HOST = 'api2.cursor.sh';
export const INTAKE_TIMEOUT_MS = 8000;
export const INTAKE_MAX_BODY = 8192;
export const INTAKE_MAX_NOTE = 1000;

const TASK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const WEBHOOK_PATH = /^\/automations\/webhook\/([A-Za-z0-9_-]{8,200})$/;
const KNOWN_AGENTS = new Set(ROSTER.map((slot) => slot.id));
const ALLOWED_BODY_KEYS = new Set(['agent', 'taskId', 'note']);

export type IntakeEnv = { url?: string; key?: string };

export type IntakeProposal = {
  agent: string;
  taskId: string;
  note: string;
};

export type IntakeWireBody = {
  project: typeof INTAKE_PROJECT;
  routine: typeof INTAKE_ROUTINE;
  taskId: string;
  agent: string;
  agentBotId: string;
  intent: 'propose';
  note: string;
};

export function documentedIntakeUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 300) return null;
  let url: URL;
  try { url = new URL(trimmed); } catch { return null; }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password || url.port) return null;
  if (url.search || url.hash) return null;
  if (url.hostname !== INTAKE_HOST) return null;
  const match = WEBHOOK_PATH.exec(url.pathname);
  if (!match) return null;
  return `https://${INTAKE_HOST}/automations/webhook/${match[1]}`;
}

export function readIntakeConfig(env: IntakeEnv): { configured: true; url: string; key: string } | { configured: false } {
  const url = documentedIntakeUrl(env.url);
  const key = typeof env.key === 'string' ? env.key.trim() : '';
  if (!url || !key || key.length > 500 || /[\r\n]/.test(key)) return { configured: false };
  return { configured: true, url, key };
}

export function intakeOriginAllowed(originHeader: string | null, requestUrl: string): boolean {
  if (!originHeader) return false;
  let origin: URL;
  let page: URL;
  try {
    origin = new URL(originHeader);
    page = new URL(requestUrl);
  } catch {
    return false;
  }
  if (origin.origin !== page.origin) return false;
  if (origin.username || origin.password || origin.search || origin.hash) return false;
  if (origin.protocol === 'https:') return true;
  return origin.protocol === 'http:' && (origin.hostname === 'localhost' || origin.hostname === '127.0.0.1');
}

export function validateIntakeBody(raw: unknown): { ok: true; value: IntakeProposal } | { ok: false } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false };
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!ALLOWED_BODY_KEYS.has(key)) return { ok: false };
  }
  const agent = record.agent;
  const taskId = record.taskId;
  const note = record.note;
  if (typeof agent !== 'string' || !KNOWN_AGENTS.has(agent)) return { ok: false };
  if (typeof taskId !== 'string' || !TASK_ID.test(taskId)) return { ok: false };
  if (typeof note !== 'string') return { ok: false };
  const trimmed = note.trim();
  if (!trimmed || trimmed.length > INTAKE_MAX_NOTE || trimmed.includes('\0')) return { ok: false };
  return { ok: true, value: { agent, taskId, note: trimmed } };
}

export function intakeWireBody(value: IntakeProposal): IntakeWireBody {
  const slot = ROSTER.find((item) => item.id === value.agent);
  if (!slot) throw new Error('unknown agent');
  return {
    project: INTAKE_PROJECT,
    routine: INTAKE_ROUTINE,
    taskId: value.taskId,
    agent: value.agent,
    agentBotId: slot.botId,
    intent: 'propose',
    note: value.note,
  };
}

export type ReceiptState = 'none' | 'reserved' | 'accepted' | 'rejected' | 'unknown';

export type IntakeResult = {
  http: number;
  body: { state: 'unauthorized' | 'forbidden' | 'invalid' | 'unconfigured' | 'duplicate' | 'accepted' | 'error'; taskId?: string };
};

export type IntakePost = (input: { url: string; key: string; body: string; timeoutMs: number }) => Promise<{ status: number }>;

export async function runIntake(input: {
  admin: string | null;
  origin: string | null;
  requestUrl: string;
  rawText: string;
  env: IntakeEnv;
  findReceipt: (taskId: string) => Promise<ReceiptState>;
  reserve: (value: IntakeProposal) => Promise<boolean>;
  mark: (taskId: string, summary: 'Intake accepted' | 'Intake not accepted') => Promise<void>;
  post?: IntakePost;
}): Promise<IntakeResult> {
  if (!input.admin) return { http: 401, body: { state: 'unauthorized' } };
  if (!intakeOriginAllowed(input.origin, input.requestUrl)) return { http: 403, body: { state: 'forbidden' } };
  if (input.rawText.length > INTAKE_MAX_BODY) return { http: 400, body: { state: 'invalid' } };
  let parsed: unknown;
  try { parsed = JSON.parse(input.rawText); } catch { return { http: 400, body: { state: 'invalid' } }; }
  const proposal = validateIntakeBody(parsed);
  if (!proposal.ok) return { http: 400, body: { state: 'invalid' } };
  const config = readIntakeConfig(input.env);
  if (!config.configured) return { http: 503, body: { state: 'unconfigured', taskId: proposal.value.taskId } };

  const existing = await input.findReceipt(proposal.value.taskId);
  if (existing === 'unknown') return { http: 502, body: { state: 'error', taskId: proposal.value.taskId } };
  if (existing !== 'none') return { http: 409, body: { state: 'duplicate', taskId: proposal.value.taskId } };

  const reserved = await input.reserve(proposal.value);
  if (!reserved) return { http: 502, body: { state: 'error', taskId: proposal.value.taskId } };

  const wire = intakeWireBody(proposal.value);
  const post = input.post ?? defaultPost;
  let status = 0;
  try {
    const sent = await post({
      url: config.url,
      key: config.key,
      body: JSON.stringify(wire),
      timeoutMs: INTAKE_TIMEOUT_MS,
    });
    status = sent.status;
  } catch {
    status = 0;
  }
  try {
    await input.mark(proposal.value.taskId, status === 200 ? 'Intake accepted' : 'Intake not accepted');
  } catch {
    // The webhook was already called once. A failed receipt write must not cause a retry.
  }
  if (status !== 200) return { http: 502, body: { state: 'error', taskId: proposal.value.taskId } };
  return { http: 200, body: { state: 'accepted', taskId: proposal.value.taskId } };
}

async function defaultPost(input: { url: string; key: string; body: string; timeoutMs: number }): Promise<{ status: number }> {
  const response = await fetch(input.url, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(input.timeoutMs),
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${input.key}`,
    },
    body: input.body,
  });
  return { status: response.status };
}
