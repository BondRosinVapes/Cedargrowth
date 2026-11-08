// KELVIN Command wing data model and seeds. Pure data and types, no DOM. The
// console holds the mutable pieces (events, review) in React state and reads the
// static pieces from here. When a real backend arrives, only this module and the
// per wing stores change.

export type EventType =
  | 'ALERT'
  | 'GATE'
  | 'BUILD'
  | 'KNOWLEDGE'
  | 'TUNING'
  | 'DRAFT'
  | 'AUDIT'
  | 'DECISION'
  | 'ASSIGNMENT'
  | 'DRIFT';

export type KEvent = {
  id: number;
  agent: string;
  time: string;
  type: EventType;
  summary: string;
  sub: string;
  wing?: string;
};

export type Agent = {
  id: string;
  fn: string;
  status: 'ACTIVE' | 'HOLDING';
  task: string;
  errors: number;
  recs: string[];
};

// Stable teammate ids supplied by the parent mapping. They are inert metadata,
// not credentials and not links. link stays null until a documented web URL
// exists. Chat-app addresses are not web URLs and are not stored here.
export type RosterKind = 'console' | 'agent';

export type RosterSlot = {
  id: string;
  fn: string;
  kind: RosterKind;
  botId: string;
  link: null;
};

export const ROSTER: RosterSlot[] = [
  { id: 'KELVIN', fn: 'Command center', kind: 'console', botId: '51a4ca96-7378-472e-aeba-f893300e52ca', link: null },
  { id: 'MERIDIAN', fn: 'Orchestration, routing, daily audit', kind: 'agent', botId: '81e152c2-da8d-4d32-9c40-44f78a7a2871', link: null },
  { id: 'FOUNDRY', fn: 'Engineering and tooling', kind: 'agent', botId: '70bf0894-1c5a-4a64-be22-945115264b89', link: null },
  { id: 'CODEX', fn: 'Knowledge and canon custody', kind: 'agent', botId: '86d0a7ae-4c2d-4f82-8056-9635d78c3c0b', link: null },
  { id: 'LITMUS', fn: 'Quality assurance, first gate', kind: 'agent', botId: 'f80c8591-b83e-42b5-bc1b-b945923776fb', link: null },
  { id: 'VERNIER', fn: 'Release management and tuning', kind: 'agent', botId: '2673912e-4d22-4894-8925-ecd45c398839', link: null },
  { id: 'SENTINEL', fn: 'Security, compliance, clearance', kind: 'agent', botId: '1df84ae6-c757-469f-bc84-5a9999aa62d5', link: null },
  { id: 'APERTURE', fn: 'Content and editorial', kind: 'agent', botId: '0b681449-ce0c-4b1f-889e-d81448f95e01', link: null },
  { id: 'APEX', fn: 'Training records, drift detection, assignment', kind: 'agent', botId: 'af6b28c8-870e-4c9c-b962-69a552314eb5', link: null },
];

export function rosterHasTransport(slots: readonly RosterSlot[] = ROSTER): boolean {
  return slots.some((slot) => slot.link !== null);
}

export type ReviewItem = {
  id: string;
  from: string;
  title: string;
  body: string;
  status: 'open' | 'approved' | 'rejected' | 'sentback';
  note?: string;
};

export type WingDef = {
  id: string;
  label: string;
  accent: string;
  sections?: [string, string][];
  routes?: string[];
};

export const EVENT_TYPES: EventType[] = [
  'ALERT',
  'GATE',
  'BUILD',
  'KNOWLEDGE',
  'TUNING',
  'DRAFT',
  'AUDIT',
  'DECISION',
  'ASSIGNMENT',
  'DRIFT',
];

export const WINGS: WingDef[] = [
  {
    id: 'command',
    label: 'Command',
    accent: '--k-command',
    sections: [
      ['live-feed', 'Live Feed'],
      ['agents', 'Agents'],
      ['review', 'Review'],
      ['queue', 'Queue'],
      ['steering', 'Steering'],
      ['evolution', 'Evolution'],
      ['knowledge', 'Knowledge'],
    ],
  },
  { id: 'production', label: 'Production', accent: '--k-production', routes: ['dashboard', 'orders', 'stock', 'runs', 'accounts', 'sales', 'skus', 'alerts', 'trace'] },
  { id: 'evidence', label: 'Evidence', accent: '--k-evidence', routes: ['batches', 'coa-intake', 'publishing', 'terpenes', 'laboratories', 'archive'] },
  { id: 'genomics', label: 'Genomics', accent: '--k-genomics', routes: ['kits', 'fulfillment', 'lab-status', 'consent', 'delivery', 'metrics'] },
  { id: 'security', label: 'Security', accent: '--k-security', routes: ['monitors', 'findings', 'incidents', 'rules', 'waivers', 'audit', 'precheck', 'vendors'] },
  { id: 'warrant', label: 'WARRANT', accent: '--k-warrant', routes: ['overview', 'decisions', 'blocked', 'review', 'drift', 'authority'] },
  { id: 'editorial', label: 'Editorial', accent: '--k-editorial', routes: ['overview', 'research', 'drafts', 'clearance', 'approval', 'schedule', 'published'] },
];

export const AGENTS: Agent[] = [
  { id: 'MERIDIAN', fn: 'Orchestration, routing, daily audit', status: 'ACTIVE', task: 'Filed the 09:00 audit. Routing three items to owner review.', errors: 0, recs: [] },
  { id: 'FOUNDRY', fn: 'Engineering and tooling', status: 'ACTIVE', task: 'Verified token sync against the design source. Repo health green.', errors: 0, recs: ['Pin the font subset before the portal ports into the repo.'] },
  { id: 'CODEX', fn: 'Knowledge and canon custody', status: 'ACTIVE', task: 'Staged terpene index v2. Awaiting owner approval.', errors: 0, recs: ['Terpene index v2 needs one more citation on limonene.'] },
  { id: 'LITMUS', fn: 'Quality assurance, first gate', status: 'ACTIVE', task: 'Cleared rc-004 through the first gate. Passed to SENTINEL.', errors: 0, recs: [] },
  { id: 'VERNIER', fn: 'Release management and tuning', status: 'ACTIVE', task: 'Filed a contrast tuning proposal. rc-003 holding at the release gate.', errors: 0, recs: ['Raise tertiary text to AA at body sizes.'] },
  { id: 'SENTINEL', fn: 'Security, compliance, clearance', status: 'HOLDING', task: 'Held a preview build. Age gate rendered after content on one route. P0.', errors: 1, recs: ['Do not promote the held build until the gate order is corrected.'] },
  { id: 'APERTURE', fn: 'Content and editorial', status: 'ACTIVE', task: 'Holding the cold cure research note for an originality check.', errors: 0, recs: [] },
  { id: 'APEX', fn: 'Training records, drift detection, assignment', status: 'ACTIVE', task: 'Caught PROC-002 revised to v2.0. Re-acknowledgment assigned to nine, due in seven days.', errors: 0, recs: ['One assessment completed in 41 seconds, below plausible time. Flagged for review.'] },
];

export const SEED_EVENTS: KEvent[] = [
  { id: 1, agent: 'MERIDIAN', time: '09:00', type: 'AUDIT', summary: 'Daily audit filed', sub: 'Seven agents reporting. Zero escapes in 30 days.' },
  { id: 2, agent: 'SENTINEL', time: '14:22', type: 'ALERT', summary: 'Age gate synthetic failed on preview build', sub: 'Gate rendered after content on one route. P0. Build held.', wing: 'security' },
  { id: 3, agent: 'LITMUS', time: '13:58', type: 'GATE', summary: 'rc-004 cleared first gate', sub: 'Three lint hits resolved. Passed to SENTINEL.' },
  { id: 4, agent: 'CODEX', time: '11:40', type: 'KNOWLEDGE', summary: 'Terpene index v2 staged', sub: 'Fourteen entries, nine citations. Awaiting owner approval.' },
  { id: 5, agent: 'VERNIER', time: '15:10', type: 'TUNING', summary: 'Proposal filed: tertiary text contrast', sub: 'Raise the gate to AA at body sizes. Affects six components.' },
  { id: 6, agent: 'FOUNDRY', time: '12:05', type: 'BUILD', summary: 'Token sync verified', sub: 'Forty one semantic variables matched against the design source.' },
  { id: 7, agent: 'APERTURE', time: '16:30', type: 'DRAFT', summary: 'Research note held', sub: 'Cold cure piece awaiting SENTINEL originality check.' },
  { id: 8, agent: 'MERIDIAN', time: '08:12', type: 'DECISION', summary: 'Overnight queue triaged', sub: 'Two release candidates and one draft carried into the day.' },
  { id: 9, agent: 'CODEX', time: '10:20', type: 'KNOWLEDGE', summary: 'Claims guardrails synced to canon', sub: 'Wellness policy language matched against the current federal posture.' },
  { id: 10, agent: 'LITMUS', time: '11:02', type: 'GATE', summary: 'rc-003 returned to VERNIER', sub: 'First gate clean. Held at the release gate for the tuning decision.' },
  { id: 11, agent: 'FOUNDRY', time: '13:15', type: 'BUILD', summary: 'Preview build minted for rc-004', sub: 'Immutable URL issued. Handed to LITMUS for the first gate.' },
  { id: 12, agent: 'SENTINEL', time: '15:40', type: 'AUDIT', summary: 'Clearance log reconciled', sub: 'Every clearance in the last cycle traced to a named gate.' },
  { id: 13, agent: 'APEX', time: '07:15', type: 'DRIFT', summary: 'CGO-SOP-PROC-002 revised to v2.0', sub: 'Nine acknowledgments now against a superseded version.', wing: 'warrant' },
  { id: 14, agent: 'APEX', time: '07:16', type: 'ASSIGNMENT', summary: 'Re-acknowledgment assigned to nine', sub: 'Reason: SOP revised to v2.0. Due in seven days.', wing: 'warrant' },
  { id: 15, agent: 'APEX', time: '09:00', type: 'AUDIT', summary: 'Daily training audit filed', sub: 'Four items overdue. One certification expires in eleven days.', wing: 'warrant' },
  { id: 16, agent: 'APEX', time: '11:30', type: 'ALERT', summary: 'Assessment completed in 41 seconds', sub: 'Below plausible completion time. Flagged for review.', wing: 'warrant' },
];

export const SEED_REVIEW: ReviewItem[] = [
  { id: 'rv-1', from: 'VERNIER . TUNING', title: 'Raise tertiary text contrast to AA', body: 'Tertiary ink fails AA at body sizes on the parchment chrome. Proposal raises it and restates the token. Affects six components. No layout change.', status: 'open' },
  { id: 'rv-2', from: 'SENTINEL . CLEARANCE', title: 'Endorsement of rc-004 for release', body: 'Prototype review line. No first gate and no security review are on file. Owner approval here does not open a release gate.', status: 'open' },
  { id: 'rv-3', from: 'CODEX . KNOWLEDGE', title: 'Approve terpene index v2 for canon', body: 'Fourteen entries, nine citations, one citation still thin on limonene. Approval versions the canon and publishes to the transparency source.', status: 'open' },
];

export type QueueRc = { id: string; title: string; stage: number; note: string };
export type QueueDraft = { id: string; title: string; blocker: string };
export type TuningItem = { id: string; from: string; title: string; detail: string; affects: string; status: 'proposed' | 'applied' | 'rejected'; note?: string };
export type CanonVersion = { v: string; note: string; content: string };
export type CanonDoc = { id: string; title: string; versions: CanonVersion[] };

export const RELEASE_CHAIN = ['LITMUS', 'SENTINEL', 'VERNIER', 'Owner'];

export const QUEUE_RCS: QueueRc[] = [
  { id: 'rc-003', title: 'Home surface rhythm and hero copy', stage: -1, note: 'Prototype line. No LITMUS, SENTINEL, or VERNIER evidence is on file.' },
  { id: 'rc-004', title: 'Reservation flow and confirmation copy', stage: -1, note: 'Prototype line. No gate has been passed.' },
];
export const QUEUE_DRAFTS: QueueDraft[] = [
  { id: 'dr-11', title: 'Cold cure, dried and washed', blocker: 'Prototype line. No originality check is on file.' },
  { id: 'dr-12', title: 'The thirteen traits, plain language', blocker: 'Prototype line. No canon sign off is on file.' },
];

export const SEED_TUNING: TuningItem[] = [
  { id: 'tn-1', from: 'VERNIER', title: 'Tertiary text contrast to AA', detail: 'Raise tertiary ink one step and restate the semantic token. Affects six components at body sizes.', affects: '6 components', status: 'proposed' },
];

export const CANON: CanonDoc[] = [
  { id: 'design-canon', title: 'Design Canon', versions: [
    { v: 'v1.0', note: 'First ratified canon.', content: 'Section 2.3. Temperature.\nThe system runs daylight and paper. No nocturnal register on public surfaces.\nSection 4. Density.\nOperator surfaces may compress spacing. Marketing surfaces may not.' },
    { v: 'v1.1', note: 'Operator density clause added.', content: 'Section 2.3. Temperature.\nThe system runs daylight and paper on public surfaces. Operator consoles may run dark by owner decision.\nSection 4. Density.\nOperator surfaces compress to 12px row padding. Marketing surfaces hold 40px section padding.\nSection 4.2. Figures.\nEvery figure sets in IBM Plex Mono with tabular numerals.' },
  ] },
  { id: 'dual-input-copy-pack', title: 'Dual Input Copy Pack', versions: [
    { v: 'v1.0', note: 'Dried and fresh frozen language.', content: 'Two inputs. One method.\nDried and cured trim gives depth.\nFresh frozen keeps the aromatics that drying takes away.\nWe do not blend the distinction away.' },
    { v: 'v1.1', note: 'Owner override on live rosin term.', content: 'Two inputs. One method.\nDried and cured trim gives depth.\nFresh frozen keeps the aromatics that drying takes away.\nLive rosin term preserved verbatim by owner decision.' },
  ] },
  { id: 'brand-tokens', title: 'Brand Tokens', versions: [
    { v: 'v1.0', note: 'Light clinical token set.', content: 'surface/clinical #FFFFFF\nsurface/parchment #F3EEE7\nink/primary #1C1B19\nForty one semantic variables total.' },
    { v: 'v1.1', note: 'Dark operator map appended.', content: 'surface/clinical light #FFFFFF, dark #100F0C\nink/primary light #1C1B19, dark #F2ECE1\nOperator dark map derived, not invented. Same hues, retuned for a dark ground.' },
  ] },
  { id: 'method-sop', title: 'Method SOP', versions: [
    { v: 'v0.9', note: 'Draft. Values pending.', content: 'Wash temperature UNKNOWN.\nAgitation time UNKNOWN.\nPress temperature UNKNOWN.\nCure duration UNKNOWN.\nValues arrive with Prompt 04.' },
    { v: 'v0.9b', note: 'Structure fixed, values still pending.', content: 'Wash. Ice water hash, cold.\nPress. Rosin, controlled.\nCure. Matured, timed.\nEvery numeric value renders UNKNOWN until owner supplies the SOP figures.' },
  ] },
  { id: 'claims-guardrails', title: 'Claims Guardrails', versions: [
    { v: 'v1.0', note: 'Wellness policy baseline.', content: 'No claim to diagnose, treat, cure, or prevent any disease.\nGeneral wellness policy, federal posture January 2026.\nNo compound named on a public surface without clinical validation.' },
    { v: 'v1.1', note: 'Dictionary scan clause.', content: 'No claim to diagnose, treat, cure, or prevent any disease.\nEvery public copy change runs a dictionary scan before delivery.\nA single banned term is a hard block.' },
  ] },
  { id: 'trait-matrix', title: 'Trait Matrix', versions: [
    { v: 'v1.0', note: 'Thirteen traits, first pass.', content: 'Thirteen traits. One protocol.\nEach trait maps to a format, a ratio, and a starting protocol.\nGenotype is never displayed. Readout only.' },
    { v: 'v2.0', note: 'Format and ratio columns added.', content: 'Thirteen traits. One protocol.\nColumns: trait, format, ratio, starting protocol.\nGenotype is never displayed from any context, including admin. Readout only.' },
  ] },
];

export function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const TICK_SUMMARIES: Record<EventType, string[]> = {
  ALERT: ['Synthetic probe flagged a slow route', 'Rate limit threshold approached on a public form'],
  GATE: ['Candidate cleared the first gate', 'Second gate opened for review'],
  BUILD: ['Preview build minted', 'Token sync re verified'],
  KNOWLEDGE: ['Citation added to a canon entry', 'Canon version staged for approval'],
  TUNING: ['Contrast sample measured on parchment', 'Focus ring offset verified'],
  DRAFT: ['Research note advanced to clearance', 'Draft returned for one revision'],
  AUDIT: ['Clearance log reconciled', 'Routing table checked against the roster'],
  DECISION: ['Queue item carried forward', 'Reference line rebalanced the day'],
  ASSIGNMENT: ['Re-acknowledgment assigned on a revised procedure', 'Training item assigned with a due date and a reason'],
  DRIFT: ['Acknowledgments now sit against a superseded version', 'Reassignment volume moved beyond its trailing baseline'],
};

export function mintEvent(nextId: number, agentFilter: string | null, typeFilter: EventType | null): KEvent {
  const agent = agentFilter || AGENTS[Math.floor(Math.random() * AGENTS.length)].id;
  const type = typeFilter || EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
  const pool = TICK_SUMMARIES[type];
  return {
    id: nextId,
    agent,
    time: nowTime(),
    type,
    summary: pool[Math.floor(Math.random() * pool.length)],
    sub: 'Minted by the live ticker for review continuity.',
    wing: type === 'ALERT' ? 'security' : undefined,
  };
}
