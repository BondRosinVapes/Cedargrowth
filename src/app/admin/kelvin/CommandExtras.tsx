'use client';

import { useEffect, useState } from 'react';
import {
  CANON,
  ROSTER,
  QUEUE_DRAFTS,
  QUEUE_RCS,
  RELEASE_CHAIN,
  type KEvent,
  type TuningItem,
} from './store';

// The remaining Command sections: Queue, Steering, Evolution, Knowledge. Tuning
// proposals are persisted (passed in and mutated through the command tuning
// route); queue and canon are static reference. Actions emit events into the
// Command feed through addEvent.

type Props = { view: string; addEvent: (e: Omit<KEvent, 'id'>) => void; flash: (m: string) => void; now: () => string; tuning: TuningItem[]; reloadCommand: () => Promise<void> };

export default function CommandExtras({ view, addEvent, flash, now, tuning, reloadCommand }: Props) {
  const [rejectOpen, setRejectOpen] = useState<Record<string, boolean>>({});
  const [rejectNote, setRejectNote] = useState<Record<string, string>>({});
  const [canonSel, setCanonSel] = useState('design-canon');
  const [canonVer, setCanonVer] = useState(0);
  const [canonQuery, setCanonQuery] = useState('');
  const [dir, setDir] = useState('');
  const [target, setTarget] = useState('MERIDIAN');
  const [priority, setPriority] = useState('normal');
  const [due, setDue] = useState('');
  const [intakeReady, setIntakeReady] = useState<boolean | null>(null);
  const [proposal, setProposal] = useState('');
  const [proposalAgent, setProposalAgent] = useState('MERIDIAN');
  const [intakePhase, setIntakePhase] = useState<'idle' | 'pending' | 'unconfigured' | 'accepted' | 'duplicate' | 'error' | 'invalid'>('idle');
  const [intakeTask, setIntakeTask] = useState('');

  useEffect(() => {
    if (view !== 'steering') return;
    let active = true;
    fetch('/api/admin/kelvin/intake')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active) setIntakeReady(!!(d && d.configured === true)); })
      .catch(() => { if (active) setIntakeReady(false); });
    return () => { active = false; };
  }, [view]);

  async function propose(e: React.FormEvent) {
    e.preventDefault();
    if (intakePhase === 'pending') return;
    const taskId = crypto.randomUUID();
    setIntakeTask(taskId);
    setIntakePhase('pending');
    try {
      const res = await fetch('/api/admin/kelvin/intake', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agent: proposalAgent, taskId, note: proposal }),
      });
      const data = await res.json().catch(() => ({}));
      const state = data && typeof data.state === 'string' ? data.state : 'error';
      if (state === 'accepted' || state === 'duplicate' || state === 'unconfigured' || state === 'invalid' || state === 'error') {
        setIntakePhase(state);
      } else {
        setIntakePhase('error');
      }
      if (state === 'accepted') await reloadCommand();
    } catch {
      setIntakePhase('error');
    }
  }

  if (view === 'queue') {
    return (
      <>
      <p className="lead">Prototype queue. A step is not a gate pass. LITMUS, SENTINEL, and VERNIER have no evidence on file.</p>
      <div className="two-col">
        <div className="col">
          <h2>Release candidates</h2>
          {QUEUE_RCS.map((rc) => (
            <div className="item" key={rc.id} tabIndex={0} role="button" style={{ cursor: 'pointer' }} onClick={() => flash(`Opened ${rc.id}. No detail panel is attached.`)}>
              <h3 className="mono" style={{ fontSize: 15 }}>{rc.id}</h3>
              <div className="body" style={{ marginBottom: 10 }}>{rc.title}</div>
              <div className="stepper">
                {RELEASE_CHAIN.map((s, i) => (
                  <span key={s} style={{ display: 'contents' }}>
                    <span className={`step ${i < rc.stage ? 'done' : i === rc.stage ? 'current' : ''}`}><span className="dot" />{s}</span>
                    {i < RELEASE_CHAIN.length - 1 ? <span className="step-sep" /> : null}
                  </span>
                ))}
              </div>
              <div className="from mono">{rc.note}</div>
            </div>
          ))}
        </div>
        <div className="col">
          <h2>Editorial drafts</h2>
          {QUEUE_DRAFTS.map((d) => (
            <div className="item" key={d.id} tabIndex={0} role="button" style={{ cursor: 'pointer' }} onClick={() => flash(`Opened ${d.id}. No detail panel is attached.`)}>
              <h3 className="mono" style={{ fontSize: 15 }}>{d.id}</h3>
              <div className="body" style={{ marginBottom: 10 }}>{d.title}</div>
              <div className="from mono"><span className="sq attention" /> {d.blocker}</div>
            </div>
          ))}
        </div>
      </div>
      </>
    );
  }

  if (view === 'steering') {
    const targets = ROSTER.filter((a) => a.kind === 'agent').map((a) => a.id);
    function submit(e: React.FormEvent) {
      e.preventDefault();
      const text = dir.trim();
      if (!text) { flash('Directive text is required.'); return; }
      const words = text.split(/\s+/).slice(0, 8).join(' ');
      addEvent({ agent: 'KELVIN', time: now(), type: 'DECISION', summary: `Directive recorded: ${words}`, sub: `Held in KELVIN against ${target}. Priority ${priority}. Not delivered. Routing acknowledgement is not confirmed.` });
      setDir(''); setDue('');
      flash('Directive recorded. Not delivered.');
    }
    return (
      <>
        <p className="lead">Record a directive in KELVIN. This form does not send it. The proposal under it is the only intake, and it stays unconfigured until the server settings are present.</p>
        <form className="form-grid" onSubmit={submit}>
          <div className="field"><label>Directive</label><textarea rows={4} value={dir} onChange={(e) => setDir(e.target.value)} placeholder="State the directive in plain language." /></div>
          <div className="row2">
            <div className="field"><label>Target agent</label><select value={target} onChange={(e) => setTarget(e.target.value)}>{targets.map((t) => <option key={t}>{t}</option>)}</select></div>
            <div className="field"><label>Priority</label><select value={priority} onChange={(e) => setPriority(e.target.value)}><option>normal</option><option>high</option><option>P0</option></select></div>
          </div>
          <div className="field" style={{ maxWidth: 300 }}><label>Due date</label><input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
          <div className="actions"><button className="btn solid" type="submit">File directive</button></div>
        </form>
        <form className="form-grid" style={{ marginTop: 28 }} onSubmit={propose}>
          <p className="lead">
            {intakeReady === null
              ? 'Checking intake.'
              : intakeReady
                ? 'Intake is configured. A proposal can be accepted, which only means a run started. The result stays in the bot chat. This page does not show completion.'
                : 'Intake unconfigured. No proposal is sent.'}
          </p>
          <div className="field"><label>Proposal</label><textarea rows={4} value={proposal} onChange={(e) => setProposal(e.target.value)} placeholder="State the task. Do not include access codes or genetic results." /></div>
          <div className="field"><label>Named role</label><select value={proposalAgent} onChange={(e) => setProposalAgent(e.target.value)}>{ROSTER.map((a) => <option key={a.id}>{a.id}</option>)}</select></div>
          <div className="actions"><button className="btn solid" type="submit" disabled={intakePhase === 'pending'}>{intakePhase === 'pending' ? 'Sending proposal' : 'Propose task'}</button></div>
          {intakePhase === 'accepted' ? <p className="lead">Accepted. Task {intakeTask}. A run started. Not finished, and not a gate pass.</p> : null}
          {intakePhase === 'duplicate' ? <p className="lead">Already accepted for task {intakeTask}. Not sent again.</p> : null}
          {intakePhase === 'unconfigured' ? <p className="lead">Intake unconfigured. Nothing was sent.</p> : null}
          {intakePhase === 'error' ? <p className="lead">Not accepted. Nothing was retried.</p> : null}
          {intakePhase === 'invalid' ? <p className="lead">The proposal was refused. Nothing was sent.</p> : null}
        </form>
      </>
    );
  }

  if (view === 'evolution') {
    const tuningMutate = async (id: string, op: string, note?: string) => {
      try { await fetch('/api/admin/kelvin/command/tuning', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, op, note }) }); } catch { /* keep */ }
      await reloadCommand();
    };
    const apply = async (id: string) => {
      await tuningMutate(id, 'apply');
      addEvent({ agent: 'KELVIN', time: now(), type: 'TUNING', summary: `Console mark applied: ${id}`, sub: 'Recorded in KELVIN. No release artifact changed and no bot was notified.' });
      flash('Marked in the console. Nothing was retuned.');
    };
    const rollback = async (id: string) => {
      await tuningMutate(id, 'rollback');
      addEvent({ agent: 'KELVIN', time: now(), type: 'TUNING', summary: `Console mark returned: ${id}`, sub: 'Recorded in KELVIN. No release artifact changed and no bot was notified.' });
      flash('Mark returned in the console.');
    };
    const reject = async (id: string) => {
      const note = (rejectNote[id] || '').trim();
      if (!note) { flash('A reason is required to reject.'); return; }
      await tuningMutate(id, 'reject', note);
      flash('Rejected with note.');
    };
    return (
      <>
        <p className="lead">Tuning lines stored in the console. Marking one applied changes that record only. It does not retune the site and it does not reach VERNIER. Rejecting requires a note.</p>
        {tuning.map((t) => (
          <div className="item" key={t.id}>
            <h3>{t.title}</h3>
            <div className="from mono">{t.from} . affects {t.affects} . {t.status.charAt(0).toUpperCase() + t.status.slice(1)}</div>
            <div className="body">{t.detail}</div>
            <div className="actions">
              {t.status === 'proposed' ? (<>
                <button className="btn solid" onClick={() => apply(t.id)}>Apply</button>
                <button className="btn" onClick={() => setRejectOpen((m) => ({ ...m, [t.id]: !m[t.id] }))}>Reject</button>
              </>) : null}
              {t.status === 'applied' ? (<>
                <span className="chip pass"><span className="sq pass" />Applied</span>
                <button className="btn" onClick={() => rollback(t.id)}>Roll back</button>
              </>) : null}
              {t.status === 'rejected' ? (<><span className="chip fail">Rejected</span>{t.note ? <span style={{ color: 'var(--k-tertiary)', fontSize: 12 }}>Note: {t.note}</span> : null}</>) : null}
            </div>
            {rejectOpen[t.id] && t.status === 'proposed' ? (
              <div className="note-in">
                <textarea rows={2} placeholder="Reason for rejection. Required." value={rejectNote[t.id] || ''} onChange={(e) => setRejectNote((m) => ({ ...m, [t.id]: e.target.value }))} />
                <div className="actions" style={{ marginTop: 10 }}><button className="btn solid" onClick={() => reject(t.id)}>Confirm reject</button></div>
              </div>
            ) : null}
          </div>
        ))}
      </>
    );
  }

  // knowledge (default)
  const docs = CANON.filter((c) => c.title.toLowerCase().includes(canonQuery.toLowerCase()) || c.id.includes(canonQuery.toLowerCase()));
  const doc = CANON.find((c) => c.id === canonSel) || docs[0] || null;
  const verIdx = doc ? Math.min(canonVer, doc.versions.length - 1) : 0;
  const prevIdx = verIdx > 0 ? verIdx - 1 : 1;
  return (
    <div className="kn" style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24 }}>
      <div>
        <div style={{ border: '1px solid var(--k-hairline)' }}>
          <input placeholder="Search canon" value={canonQuery} onChange={(e) => setCanonQuery(e.target.value)} style={{ border: 'none', borderBottom: '1px solid var(--k-hairline)', padding: '12px 14px' }} />
          {docs.length ? docs.map((d) => (
            <div key={d.id} onClick={() => { setCanonSel(d.id); setCanonVer(0); }} tabIndex={0} role="button" style={{ padding: '12px 14px', borderBottom: '1px solid var(--k-hairline)', cursor: 'pointer', color: d.id === canonSel ? 'var(--k-primary)' : 'var(--k-secondary)', background: d.id === canonSel ? 'var(--k-bone)' : undefined }}>
              {d.title}<span className="mono" style={{ display: 'block', fontSize: 11, color: 'var(--k-tertiary)', marginTop: 2 }}>{d.id}</span>
            </div>
          )) : <div style={{ padding: '12px 14px', color: 'var(--k-tertiary)' }}>No canon matches.</div>}
        </div>
      </div>
      <div style={{ border: '1px solid var(--k-hairline)', padding: 24, minHeight: 340 }}>
        {doc ? (<>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, borderBottom: '1px solid var(--k-hairline)', paddingBottom: 14, marginBottom: 16, flexWrap: 'wrap' }}>
            <div><h3 style={{ fontSize: 18, margin: 0 }}>{doc.title}</h3><div className="mono" style={{ fontSize: 12, color: 'var(--k-tertiary)', marginTop: 2 }}>{doc.id}</div></div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--k-tertiary)' }}>Version</label>
              <select value={verIdx} onChange={(e) => setCanonVer(parseInt(e.target.value, 10) || 0)} style={{ width: 'auto', padding: '6px 10px', fontFamily: 'var(--k-font-mono)', fontSize: 12 }}>
                {doc.versions.map((v, i) => <option key={v.v} value={i}>{v.v}</option>)}
              </select>
            </div>
          </div>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--k-font-mono)', fontSize: 12.5, color: 'var(--k-secondary)', lineHeight: 1.7 }}>{doc.versions[verIdx].content}</pre>
          {doc.versions.length > 1 ? (
            <div style={{ marginTop: 20, borderTop: '1px solid var(--k-hairline)', paddingTop: 16, fontFamily: 'var(--k-font-mono)', fontSize: 12 }}>
              <div style={{ marginBottom: 10, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--k-tertiary)' }}>Change from {doc.versions[prevIdx].v} to {doc.versions[verIdx].v}</div>
              <div style={{ color: 'var(--k-fail)' }}>removed . {doc.versions[prevIdx].note}</div>
              <div style={{ color: 'var(--k-pass)' }}>added . {doc.versions[verIdx].note}</div>
            </div>
          ) : null}
        </>) : <div className="empty">Select a canon document.</div>}
      </div>
    </div>
  );
}
