'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProductionWing from './wings/ProductionWing';
import EvidenceWing from './wings/EvidenceWing';
import GenomicsWing from './wings/GenomicsWing';
import SecurityWing from './wings/SecurityWing';
import WarrantWing from './wings/WarrantWing';
import EditorialWing from './wings/EditorialWing';
import CommandExtras from './CommandExtras';
import {
  EVENT_TYPES,
  ROSTER,
  WINGS,
  nowTime,
  type EventType,
  type KEvent,
  type ReviewItem,
  type TuningItem,
} from './store';

// The KELVIN console. Increment one: the shell plus the Command wing wired end to
// end. The five data wings render as framed placeholders and fill in next. The
// prototype behind this is the verified single file build; this is its port into
// the repo, gated by the signed session and served only to an authenticated
// operator.

export default function KelvinConsole() {
  const router = useRouter();
  const [wing, setWing] = useState('command');
  const [view, setView] = useState('live-feed');
  const [events, setEvents] = useState<KEvent[]>([]);
  const [review, setReview] = useState<ReviewItem[]>([]);
  const [tuning, setTuning] = useState<TuningItem[]>([]);
  const [filterAgent, setFilterAgent] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<EventType | null>(null);
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [toast, setToast] = useState('');
  const [sessionEmail, setSessionEmail] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const nextId = useRef(1000000);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wingDef = WINGS.find((w) => w.id === wing) || WINGS[0];
  const accentVar = `var(${wingDef.accent})`;
  const openReview = review.filter((r) => r.status === 'open').length;

  const flash = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  }, []);

  const addEvent = useCallback((e: Omit<KEvent, 'id'>, persist = true) => {
    nextId.current += 1;
    const id = nextId.current;
    setEvents((prev) => [{ id, ...e }, ...prev]);
    if (persist) {
      fetch('/api/admin/kelvin/command/event', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(e) }).catch(() => {});
    }
  }, []);

  const loadCommand = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/kelvin/command');
      if (r.ok) {
        const d = await r.json();
        setEvents(d.events || []);
        setReview(d.review || []);
        setTuning(d.tuning || []);
      }
    } catch {
      // keep current
    }
  }, []);

  useEffect(() => { loadCommand(); }, [loadCommand]);

  useEffect(() => {
    let active = true;
    fetch('/api/admin/kelvin/session')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active && d && typeof d.email === 'string') setSessionEmail(d.email); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    try {
      const t = localStorage.getItem('kelvin-theme');
      if (t === 'dark' || t === 'light') setTheme(t);
    } catch {
      // ignore, default light
    }
  }, []);

  useEffect(() => {
    const root = document.querySelector('.kelvin-root');
    if (root) root.setAttribute('data-theme', theme);
    try { localStorage.setItem('kelvin-theme', theme); } catch {
      // ignore storage failures
    }
  }, [theme]);

  const filtered = useMemo(
    () =>
      events.filter((e) => {
        if (filterAgent && e.agent !== filterAgent) return false;
        if (filterType && e.type !== filterType) return false;
        return true;
      }),
    [events, filterAgent, filterType],
  );

  function goWing(id: string) {
    const def = WINGS.find((w) => w.id === id);
    if (!def) return;
    setWing(id);
    setView(def.sections ? def.sections[0][0] : (def.routes as string[])[0]);
    setOpenRow(null);
  }

  async function signOut() {
    try {
      await fetch('/api/admin/kelvin/logout', { method: 'POST' });
    } catch {
      // ignore, cookie clears client side on navigation anyway
    }
    router.replace('/admin/kelvin/login');
  }

  async function resolveReview(id: string, decision: ReviewItem['status'], title: string) {
    setReview((prev) => prev.map((r) => (r.id === id ? { ...r, status: decision } : r)));
    const verb = decision === 'approved' ? 'approved' : decision === 'rejected' ? 'rejected' : 'sent back';
    addEvent(
      { agent: 'KELVIN', time: nowTime(), type: 'DECISION', summary: `Owner ${verb}: ${title}`, sub: `Review item ${id} recorded in the console. Not delivered to a bot, and no gate was passed.` },
      false,
    );
    const remaining = review.filter((r) => r.status === 'open' && r.id !== id).length;
    flash(remaining === 0 ? 'Queue clear. Badge at zero.' : `Recorded. ${String(remaining).padStart(2, '0')} remaining.`);
    try {
      await fetch('/api/admin/kelvin/command/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, decision }) });
    } catch {
      // local state already updated
    }
  }

  return (
    <div className="shell" style={{ '--k-accent': accentVar } as React.CSSProperties}>
      <aside className="sidebar">
        <div className="brand">
          <div className="wordmark">CEDARGROWTH</div>
          <div className="sys">KELVIN</div>
        </div>
        <ul className="wings">
          {WINGS.map((w) => (
            <li key={w.id}>
              <button
                className={`wing-link${w.id === wing ? ' active' : ''}`}
                style={{ '--k-accent': `var(${w.accent})` } as React.CSSProperties}
                onClick={() => goWing(w.id)}
              >
                <span className="nm">{w.label}</span>
                {w.id === 'command' ? (
                  <span className={`badge${openReview === 0 ? ' zero' : ''}`}>
                    {String(openReview).padStart(2, '0')}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
        <div className="sidefoot">
          <div className="theme-switch" role="group" aria-label="Theme">
            <button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>Light</button>
            <button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>Dark</button>
          </div>
          <a className="signout" href="/">Home page</a>
          <button className="signout" onClick={signOut}>
            Sign Out
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div>
            <h1 className="wing-title">{wingDef.label}</h1>
            <div className="wing-rule" />
          </div>
          <div className="status-cluster">
            <div className="live-ind">
              <span className="live-dot" />
              Unverified
            </div>
            <span className="session-id">{sessionEmail || 'admin session'}</span>
          </div>
        </div>

        <nav className="section-nav">
          {wingDef.sections
            ? wingDef.sections.map(([id, label]) => (
                <button key={id} className={id === view ? 'active' : ''} onClick={() => { setView(id); setOpenRow(null); }}>
                  {label}
                </button>
              ))
            : (wingDef.routes as string[]).map((r) => (
                <button key={r} className={r === view ? 'active' : ''} onClick={() => setView(r)}>
                  {r}
                </button>
              ))}
        </nav>

        <section className="view">
          {wing === 'command' ? (
            <CommandView
              view={view}
              filtered={filtered}
              review={review}
              filterAgent={filterAgent}
              filterType={filterType}
              openRow={openRow}
              setFilterAgent={setFilterAgent}
              setFilterType={setFilterType}
              setOpenRow={setOpenRow}
              resolveReview={resolveReview}
              addEvent={addEvent}
              flash={flash}
              now={nowTime}
              tuning={tuning}
              reloadCommand={loadCommand}
            />
          ) : wing === 'production' ? (
            <ProductionWing view={view} addEvent={addEvent} flash={flash} now={nowTime} />
          ) : wing === 'evidence' ? (
            <EvidenceWing view={view} addEvent={addEvent} flash={flash} now={nowTime} />
          ) : wing === 'genomics' ? (
            <GenomicsWing view={view} addEvent={addEvent} flash={flash} now={nowTime} />
          ) : wing === 'security' ? (
            <SecurityWing view={view} addEvent={addEvent} flash={flash} now={nowTime} />
          ) : wing === 'warrant' ? (
            <WarrantWing view={view} addEvent={addEvent} flash={flash} now={nowTime} />
          ) : wing === 'editorial' ? (
            <EditorialWing view={view} addEvent={addEvent} flash={flash} now={nowTime} />
          ) : (
            <WingFrame wingId={wing} routes={(wingDef.routes as string[]) || []} view={view} />
          )}
        </section>
      </main>

      <div className={`toast${toast ? ' show' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}

function CommandView(props: {
  view: string;
  filtered: KEvent[];
  review: ReviewItem[];
  filterAgent: string | null;
  filterType: EventType | null;
  openRow: number | null;
  setFilterAgent: (v: string | null) => void;
  setFilterType: (v: EventType | null) => void;
  setOpenRow: (v: number | null) => void;
  resolveReview: (id: string, d: ReviewItem['status'], title: string) => void;
  addEvent: (e: Omit<KEvent, 'id'>) => void;
  flash: (m: string) => void;
  now: () => string;
  tuning: TuningItem[];
  reloadCommand: () => Promise<void>;
}) {
  const { view, filtered, review, filterAgent, filterType, openRow, setFilterAgent, setFilterType, setOpenRow, resolveReview, addEvent, flash, now, tuning, reloadCommand } = props;

  if (view === 'live-feed') {
    return (
      <>
        <p className="lead">
          Prototype records from the console store. A gate word in a line is not a pass. No row is authenticated bot telemetry, and the ticker that minted extra lines is off.
        </p>
        <div className="filters" style={{ marginBottom: 16 }}>
          {ROSTER.map((a) => (
            <button
              key={a.id}
              className={`pill${filterAgent === a.id ? ' active' : ''}`}
              onClick={() => setFilterAgent(filterAgent === a.id ? null : a.id)}
            >
              {a.id}
            </button>
          ))}
        </div>
        <div className="filters" style={{ marginBottom: 20 }}>
          <button className={`pill${!filterType ? ' active' : ''}`} onClick={() => setFilterType(null)}>
            All Events
          </button>
          {EVENT_TYPES.map((t) => (
            <button key={t} className={`pill${filterType === t ? ' active' : ''}`} onClick={() => setFilterType(t)}>
              {t}
            </button>
          ))}
        </div>
        <div className="feed">
          {filtered.length ? (
            filtered.map((e) => (
              <div className="row" key={e.id}>
                <div className="row-head" onClick={() => setOpenRow(openRow === e.id ? null : e.id)}>
                  <span className="row-meta">
                    <span className="mono row-agent">{e.agent}</span>
                    <span>.</span>
                    <span className="mono">{e.time}</span>
                    <span>.</span>
                    <span className="mono row-type">{e.type}</span>
                  </span>
                  <span className="row-sum">{e.summary}</span>
                  <span className="chip attention">Prototype</span>
                </div>
                {openRow === e.id ? (
                  <div className="row-detail">
                    <div className="kv">
                      <span className="k">Subline</span>
                      <span>{e.sub}</span>
                    </div>
                    <div className="kv">
                      <span className="k">Source</span>
                      <span>Console store. Transport none. Audit id none.</span>
                    </div>
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <div className="empty">No events match the active filters.</div>
          )}
        </div>
      </>
    );
  }

  if (view === 'agents') {
    return (
      <>
        <p className="lead">
          Roster metadata only. Bot ids are inert identifiers, not credentials. No web link is on file, and no event transport is connected. Routing acknowledgement has not been confirmed. Health, errors, and recommendations stay blank until a verified feed exists.
        </p>
        <div className="grid cols3">
          {ROSTER.map((a) => (
            <div className="card" key={a.id}>
              <h3>
                {a.id}
                <span className="chip attention">
                  <span className="sq attention" />
                  Unverified
                </span>
              </h3>
              <div className="fn">{a.fn}</div>
              <div className="task">
                {a.kind === 'console'
                  ? 'This console. Not a routed teammate, and not a delivery target.'
                  : a.id === 'MERIDIAN'
                    ? 'Existing lead. This console cannot deliver work to the lead.'
                    : 'Named role. This console cannot deliver work to the role.'}
              </div>
              <div className="botid">{a.botId}</div>
              <div className="stat-row">
                <span>Link <b>None</b></span>
                <span>Telemetry <b>None</b></span>
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  if (view === 'review') {
    return (
      <>
        <p className="lead">
          Items stored in the console. Approving one records an owner decision in KELVIN. It does not clear LITMUS, SENTINEL, or VERNIER, and it does not reach a bot.
        </p>
        {review.map((r) =>
          r.status === 'open' ? (
            <div className="item" key={r.id}>
              <h3>{r.title}</h3>
              <div className="from mono">{r.from}</div>
              <div className="body">{r.body}</div>
              <div className="actions">
                <button className="btn solid" onClick={() => resolveReview(r.id, 'approved', r.title)}>
                  Approve
                </button>
                <button className="btn" onClick={() => resolveReview(r.id, 'rejected', r.title)}>
                  Reject
                </button>
                <button className="btn" onClick={() => resolveReview(r.id, 'sentback', r.title)}>
                  Send back
                </button>
              </div>
            </div>
          ) : (
            <div className="item" key={r.id}>
              <h3>{r.title}</h3>
              <div className="from mono">{r.from}</div>
              <div className="actions">
                <span className={`chip ${r.status === 'approved' ? 'pass' : r.status === 'rejected' ? 'fail' : 'attention'}`}>
                  {r.status === 'sentback' ? 'SENT BACK' : r.status.toUpperCase()}
                </span>
              </div>
            </div>
          ),
        )}
      </>
    );
  }

  return <CommandExtras view={view} addEvent={addEvent} flash={flash} now={now} tuning={tuning} reloadCommand={reloadCommand} />;
}

function WingFrame({ wingId, routes, view }: { wingId: string; routes: string[]; view: string }) {
  return (
    <div className="frame">
      <div className="routes">
        {routes.map((r) => (
          <span className={`r${r === view ? ' active' : ''}`} key={r}>
            {r}
          </span>
        ))}
      </div>
      <div className="msg">This wing is framed. Its console arrives in the next increment of the port.</div>
      {wingId === 'genomics' ? (
        <div className="privacy">
          Genomics displays counts and status only. Individual genetic results are unreadable from any
          administrative context, including this one, and there is no owner override. This is a property of how
          the wing is built, not a permission that can be granted.
        </div>
      ) : null}
    </div>
  );
}
