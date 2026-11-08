'use client';

import { useCallback, useEffect, useState } from 'react';
import { releaseGate, type SecurityData } from './security';
import type { KEvent } from '../store';

// The Security wing, backed by Supabase. Data from /api/admin/kelvin/security;
// mutations persist through the gated mutate route where the release clearance
// gate is enforced. Actions refetch and emit events into the Command feed.

type Props = { view: string; addEvent: (e: Omit<KEvent, 'id'>) => void; flash: (m: string) => void; now: () => string };

function sevChip(s: string) {
  if (s === 'P0') return <span className="chip fail"><span className="sq fail" />P0</span>;
  if (s === 'P1') return <span className="chip attention"><span className="sq attention" />P1</span>;
  return <span className="chip" style={{ color: 'var(--k-tertiary)' }}>P2</span>;
}
function stateChip(s: string) {
  const pass = ['Passing', 'Resolved', 'Enforced', 'Closed', 'Pass', 'Reviewed'];
  const fail = ['Failing', 'Fail'];
  const warn = ['Degraded', 'Open', 'Staged', 'Contained', 'Pending', 'Advisory', 'Triaged', 'Revoked'];
  if (pass.indexOf(s) >= 0) return <span className="chip pass"><span className="sq pass" />{s}</span>;
  if (fail.indexOf(s) >= 0) return <span className="chip fail"><span className="sq fail" />{s}</span>;
  if (warn.indexOf(s) >= 0) return <span className="chip attention"><span className="sq attention" />{s}</span>;
  return <span className="chip" style={{ color: 'var(--k-secondary)' }}>{s}</span>;
}

export default function SecurityWing({ view, addEvent, flash, now }: Props) {
  const [data, setData] = useState<SecurityData | null>(null);
  const [selFinding, setSelFinding] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { const r = await fetch('/api/admin/kelvin/security'); if (r.ok) setData(await r.json()); } catch { /* keep */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const mutate = useCallback(async (payload: Record<string, unknown>): Promise<Record<string, unknown>> => {
    try {
      const r = await fetch('/api/admin/kelvin/security/mutate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      return await r.json().catch(() => ({ ok: false }));
    } catch { return { ok: false }; }
  }, []);

  async function runMon(id: string) {
    const res = await mutate({ op: 'run-monitor', id });
    addEvent({ agent: 'SENTINEL', time: now(), type: 'AUDIT', summary: `Ran monitor ${id}: ${res.name || ''}`, sub: `State ${res.state || ''}. Recorded to the audit chain.` });
    await load(); flash(`Ran ${id}. State ${res.state || ''}.`);
  }
  async function setFinding(id: string, state: string) {
    const res = await mutate({ op: 'set-finding', id, value: state });
    addEvent({ agent: 'SENTINEL', time: now(), type: 'DECISION', summary: `Finding ${id} ${state.toLowerCase()}`, sub: `${res.sev || ''} . ${res.title || ''}` });
    await load(); flash(`Finding ${id} ${state.toLowerCase()}.`);
  }
  async function setIncident(id: string, status: string) {
    await mutate({ op: 'set-incident', id, value: status });
    addEvent({ agent: 'SENTINEL', time: now(), type: 'DECISION', summary: `Incident ${id} ${status.toLowerCase()}`, sub: 'Incident status advanced by owner.' });
    await load(); flash(`Incident ${id} ${status.toLowerCase()}.`);
  }
  async function enforce(id: string) {
    const res = await mutate({ op: 'enforce-rule', id });
    addEvent({ agent: 'SENTINEL', time: now(), type: 'GATE', summary: `Rule ${id} enforced`, sub: `${res.rule || ''} . scope ${res.scope || ''}` });
    await load(); flash(`Rule ${id} enforced.`);
  }
  async function revoke(id: string) {
    await mutate({ op: 'revoke-waiver', id });
    addEvent({ agent: 'SENTINEL', time: now(), type: 'DECISION', summary: `Waiver ${id} revoked`, sub: 'Accepted risk returned to enforcement.' });
    await load(); flash(`Waiver ${id} revoked.`);
  }
  async function clearRelease() {
    const res = await mutate({ op: 'clear-release' });
    if (res.ok) { addEvent({ agent: 'SENTINEL', time: now(), type: 'GATE', summary: 'Release cleared by SENTINEL', sub: 'Every precheck passing. Passed to VERNIER on the release chain.' }); await load(); flash('Release cleared. Passed to VERNIER.'); }
    else flash((res.reason as string) || 'Blocked.');
  }
  async function reviewVendor(id: string) {
    const res = await mutate({ op: 'review-vendor', id });
    addEvent({ agent: 'SENTINEL', time: now(), type: 'AUDIT', summary: `Vendor reviewed: ${res.name || id}`, sub: 'Third party posture updated to Reviewed.' });
    await load(); flash(`Vendor ${res.name || id} reviewed.`);
  }

  if (!data) return <div className="empty">Loading Security data.</div>;

  if (view === 'monitors') {
    const rows = data.monitors;
    return (
      <>
        <p className="lead">The monitor catalog. Synthetic checks that run on a cadence. A failing monitor raises a finding.</p>
        <div className="kpis">
          <div className="kpi"><div className="k">Monitors</div><div className="v">{String(rows.length).padStart(2, '0')}</div><div className="m">in the catalog</div></div>
          <div className="kpi"><div className="k">Passing</div><div className="v">{String(rows.filter((m) => m.state === 'Passing').length).padStart(2, '0')}</div><div className="m">green</div></div>
          <div className="kpi"><div className="k">Failing</div><div className="v">{String(rows.filter((m) => m.state === 'Failing').length).padStart(2, '0')}</div><div className="m">raising findings</div></div>
          <div className="kpi"><div className="k">Degraded</div><div className="v">{String(rows.filter((m) => m.state === 'Degraded').length).padStart(2, '0')}</div><div className="m">watch</div></div>
        </div>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th scope="col">Monitor</th><th scope="col">Target</th><th scope="col">Cadence</th><th scope="col">Last run</th><th scope="col">State</th><th scope="col">Action</th></tr></thead>
          <tbody>{rows.map((m) => (
            <tr key={m.id}><td className="mono">{m.id}</td><td>{m.name}<div style={{ color: 'var(--k-tertiary)', fontSize: 12 }}>{m.target}</div></td><td className="mono">{m.cadence}</td><td className="mono">{m.lastRun}</td><td>{stateChip(m.state)}</td><td><button className="btn" onClick={() => runMon(m.id)}>Run</button></td></tr>
          ))}</tbody>
        </table></div>
      </>
    );
  }

  if (view === 'incidents') {
    return (
      <>
        <p className="lead">Incidents group findings under a single response. Contain limits the blast radius, close ends the incident.</p>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th scope="col">Incident</th><th scope="col">Severity</th><th scope="col">Title</th><th scope="col">Opened</th><th scope="col">Findings</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead>
          <tbody>{data.incidents.map((x) => (
            <tr key={x.id}><td className="mono">{x.id}</td><td>{sevChip(x.sev)}</td><td>{x.title}</td><td className="mono">{x.opened}</td><td className="mono">{x.findings.join(', ')}</td><td>{stateChip(x.status)}</td>
              <td>{x.status !== 'Closed' ? (<>{x.status === 'Open' ? <button className="btn" onClick={() => setIncident(x.id, 'Contained')}>Contain</button> : null} <button className="btn solid" onClick={() => setIncident(x.id, 'Closed')}>Close</button></>) : <span style={{ color: 'var(--k-tertiary)', fontSize: 12 }}>Closed</span>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </>
    );
  }

  if (view === 'rules') {
    return (
      <>
        <p className="lead">Security rules and policies. A staged rule can be enforced. Enforced rules are the guardrails the prechecks read.</p>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th scope="col">Rule</th><th scope="col">Policy</th><th scope="col">Scope</th><th scope="col">State</th><th scope="col">Action</th></tr></thead>
          <tbody>{data.rules.map((x) => (
            <tr key={x.id}><td className="mono">{x.id}</td><td>{x.rule}</td><td>{x.scope}</td><td>{stateChip(x.state)}</td><td>{x.state === 'Staged' ? <button className="btn solid" onClick={() => enforce(x.id)}>Enforce</button> : <span style={{ color: 'var(--k-tertiary)', fontSize: 12 }}>Enforced</span>}</td></tr>
          ))}</tbody>
        </table></div>
      </>
    );
  }

  if (view === 'waivers') {
    return (
      <>
        <p className="lead">Accepted risks. Each waiver is an exception with a reason and an approver. Revoking a waiver returns the item to enforcement.</p>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th scope="col">Waiver</th><th scope="col">Subject</th><th scope="col">Reason</th><th scope="col">Approver</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead>
          <tbody>{data.waivers.map((x) => (
            <tr key={x.id}><td className="mono">{x.id}</td><td>{x.subject}</td><td style={{ color: 'var(--k-tertiary)' }}>{x.reason}</td><td className="mono">{x.approver}</td><td>{stateChip(x.status)}</td><td>{x.status === 'Active' ? <button className="btn" onClick={() => revoke(x.id)}>Revoke</button> : <span style={{ color: 'var(--k-tertiary)', fontSize: 12 }}>Revoked</span>}</td></tr>
          ))}</tbody>
        </table></div>
      </>
    );
  }

  if (view === 'audit') {
    return (
      <>
        <p className="lead">The audit chain. Append only. Every clearance, publish, and sign in lands here with its actor and target.</p>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th scope="col">Time</th><th scope="col">Actor</th><th scope="col">Action</th><th scope="col">Target</th></tr></thead>
          <tbody>{data.audit.map((a, i) => <tr key={i}><td className="mono">{a.time}</td><td className="mono">{a.actor}</td><td>{a.action}</td><td style={{ color: 'var(--k-tertiary)' }}>{a.target}</td></tr>)}</tbody>
        </table></div>
      </>
    );
  }

  if (view === 'precheck') {
    const gate = releaseGate(data.prechecks);
    return (
      <>
        <p className="lead">Release prechecks stored in the console. A Pass mark here is not release evidence. LITMUS, SENTINEL, and VERNIER stay closed until each gate has its own evidence. A build does not clear while any precheck fails.</p>
        <div className="detailpanel">
          <h3>Prechecks</h3>
          {data.prechecks.map((p) => <div className="keyfield" key={p.id}><span className="kf-k" style={{ color: 'var(--k-secondary)' }}>{p.item}</span><span className="kf-v">{stateChip(p.state)}</span></div>)}
          <div className="actions" style={{ marginTop: 18 }}>
            {gate.ok ? <button className="btn solid" onClick={clearRelease}>Clear for release</button> : <button className="btn disabled" onClick={() => flash(gate.reason || 'Blocked.')}>Clear for release</button>}
            <span className={`gate ${gate.ok ? 'ok' : 'no'}`}><span className={`sq ${gate.ok ? 'pass' : 'fail'}`} />{gate.ok ? 'All prechecks passing' : gate.reason}</span>
          </div>
        </div>
      </>
    );
  }

  if (view === 'vendors') {
    return (
      <>
        <p className="lead">Third party posture. Every vendor that touches data or the build carries a review state.</p>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th scope="col">Vendor</th><th scope="col">Type</th><th scope="col">Posture</th><th scope="col">Last review</th><th scope="col">Action</th></tr></thead>
          <tbody>{data.vendors.map((v) => (
            <tr key={v.id}><td>{v.name}</td><td>{v.type}</td><td>{stateChip(v.posture)}</td><td className="mono">{v.lastReview}</td><td>{v.posture === 'Pending' ? <button className="btn" onClick={() => reviewVendor(v.id)}>Mark reviewed</button> : <span style={{ color: 'var(--k-tertiary)', fontSize: 12 }}>Current</span>}</td></tr>
          ))}</tbody>
        </table></div>
      </>
    );
  }

  // findings (default)
  const rows = data.findings;
  const sel = selFinding ? rows.find((x) => x.id === selFinding) || null : null;
  return (
    <>
      <p className="lead">Security findings, most severe first. Triage moves a finding into work, resolve closes it. Actions record to the audit chain.</p>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th scope="col">Finding</th><th scope="col">Severity</th><th scope="col">Title</th><th scope="col">Monitor</th><th scope="col">State</th></tr></thead>
        <tbody>{rows.map((x) => (
          <tr key={x.id} className={`clickable${selFinding === x.id ? ' sel' : ''}`} onClick={() => setSelFinding(selFinding === x.id ? null : x.id)}>
            <td className="mono">{x.id}</td><td>{sevChip(x.sev)}</td><td>{x.title}</td><td className="mono">{x.monitor}</td><td>{stateChip(x.state)}</td>
          </tr>
        ))}</tbody>
      </table></div>
      {sel ? (
        <div className="detailpanel">
          <h3>{sel.id} {sevChip(sel.sev)}</h3>
          <div className="keyfield"><span className="kf-k">Title</span><span className="kf-v">{sel.title}</span></div>
          <div className="keyfield"><span className="kf-k">Monitor</span><span className="kf-v">{sel.monitor}</span></div>
          <div className="keyfield"><span className="kf-k">State</span><span className="kf-v">{stateChip(sel.state)}</span></div>
          <div className="body" style={{ marginTop: 12, color: 'var(--k-secondary)', fontSize: 13 }}>{sel.detail}</div>
          <div className="actions" style={{ marginTop: 16 }}>
            {sel.state !== 'Resolved' ? (<><button className="btn" onClick={() => setFinding(sel.id, 'Triaged')}>Triage</button><button className="btn solid" onClick={() => setFinding(sel.id, 'Resolved')}>Resolve</button></>) : <span className="chip pass"><span className="sq pass" />Resolved</span>}
          </div>
        </div>
      ) : null}
    </>
  );
}
