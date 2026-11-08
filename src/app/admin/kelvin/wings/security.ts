// Security wing types and the release gate helper. Data lives in Supabase and is
// fetched through /api/admin/kelvin/security; the release clearance gate is
// enforced server side in the mutate route. releaseGate mirrors that check for
// the client display.

export type Monitor = { id: string; name: string; target: string; cadence: string; lastRun: string; state: string };
export type Finding = { id: string; sev: string; title: string; monitor: string; state: string; detail: string };
export type Incident = { id: string; title: string; sev: string; status: string; opened: string; findings: string[] };
export type Rule = { id: string; rule: string; state: string; scope: string };
export type Waiver = { id: string; subject: string; reason: string; approver: string; status: string };
export type AuditRow = { time: string; actor: string; action: string; target: string };
export type Precheck = { id: string; item: string; state: string };
export type Vendor = { id: string; name: string; type: string; posture: string; lastReview: string };

export type SecurityData = {
  monitors: Monitor[]; findings: Finding[]; incidents: Incident[]; rules: Rule[];
  waivers: Waiver[]; audit: AuditRow[]; prechecks: Precheck[] | null; vendors: Vendor[];
};

export function decideReleaseClearance(input: { error: boolean; rows: { state: string }[] | null }): { ok: false; reason: string } {
  if (input.error || !input.rows) return { ok: false, reason: 'Release evidence is unavailable. Nothing was cleared.' };
  if (input.rows.length === 0) return { ok: false, reason: 'No precheck evidence is on file. Nothing was cleared.' };
  const fails = input.rows.filter((row) => row.state === 'Fail').length;
  if (fails) return { ok: false, reason: `${fails} precheck item${fails > 1 ? 's' : ''} failing. Nothing was cleared.` };
  return { ok: false, reason: 'Stored precheck marks are not a SENTINEL or VERNIER pass. Nothing was cleared.' };
}

export function releaseGate(prechecks: Precheck[] | null): { ok: false; reason: string } {
  return decideReleaseClearance({ error: !prechecks, rows: prechecks });
}
