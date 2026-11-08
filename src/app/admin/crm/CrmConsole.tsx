'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  brandLabel,
  dollarsToCents,
  formatForecast,
  signalLines,
  type CrmBrand,
  type DeskEvaluation,
} from '@/lib/crm/engine';

type Wing = 'accounts' | 'pipeline' | 'tasks' | 'activity' | 'signals' | 'canix';

type Account = {
  id: string;
  publicId: string;
  displayName: string;
  status: string;
  city: string | null;
  notes: string;
};
type Contact = { id: string; publicId: string; accountId: string; name: string; email: string | null; title: string | null };
type Opportunity = { id: string; publicId: string; name: string; stage: string; forecastCents: number | null; forecastLabel?: string };
type Task = { id: string; publicId: string; title: string; status: string; dueOn: string | null };
type Activity = { id: string; publicId: string; summary: string; createdAt: string; actor: string };

const WINGS: { id: Wing; label: string }[] = [
  { id: 'accounts', label: 'Accounts' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'activity', label: 'Activity' },
  { id: 'signals', label: 'Signals' },
  { id: 'canix', label: 'Canix' },
];

async function crmFetch(path: string, init?: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers = new Headers(init?.headers);
  headers.set('x-cedargrowth-crm', '1');
  if (init?.body) headers.set('content-type', 'application/json');
  const res = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body: body as Record<string, unknown> };
}

export function CrmConsole({
  brands,
  sessionLabel,
  roleLabel,
}: {
  brands: CrmBrand[];
  sessionLabel: string;
  roleLabel: string;
}) {
  const [brand, setBrand] = useState<CrmBrand>(brands[0] ?? 'cedargrowth');
  const [wing, setWing] = useState<Wing>('accounts');
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [notice, setNotice] = useState('');
  const [counts, setCounts] = useState<Record<string, number | null | boolean> | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [desk, setDesk] = useState<DeskEvaluation | null>(null);
  const [canixLabel, setCanixLabel] = useState('Canix not connected');
  const [query, setQuery] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancel = false;
    async function load() {
      setNotice('');
      const [countRes, accountRes, intelRes, canixRes] = await Promise.all([
        crmFetch(`/api/admin/crm/counts?brand=${brand}`),
        crmFetch(`/api/admin/crm/accounts?brand=${brand}`),
        crmFetch(`/api/admin/crm/intelligence?brand=${brand}`),
        crmFetch(`/api/admin/crm/canix?brand=${brand}`),
      ]);
      if (cancel) return;
      const storageMissing = countRes.body.configured === false || accountRes.body.configured === false;
      setConfigured(storageMissing ? false : countRes.body.configured === true);
      if (storageMissing) setNotice(String(countRes.body.reason || accountRes.body.reason || 'CRM storage is not configured.'));
      setCounts((countRes.body.counts as Record<string, number | null | boolean>) || null);
      setAccounts((accountRes.body.accounts as Account[]) || []);
      if (intelRes.body.reorder) {
        setDesk({
          policyVerified: false,
          reorder: intelRes.body.reorder as DeskEvaluation['reorder'],
          stock: intelRes.body.stock as DeskEvaluation['stock'],
          prospects: intelRes.body.prospects as DeskEvaluation['prospects'],
          boundaries: (intelRes.body.boundaries as string[]) || [],
          canix: intelRes.body.canix as DeskEvaluation['canix'],
          hoodie: intelRes.body.hoodie as DeskEvaluation['hoodie'],
          lastRefresh: null,
          alertsActivated: false,
        });
      } else setDesk(null);
      setCanixLabel(String(canixRes.body.label || 'Canix not connected'));
      if (wing === 'pipeline') {
        const res = await crmFetch(`/api/admin/crm/opportunities?brand=${brand}`);
        if (!cancel) setOpportunities((res.body.opportunities as Opportunity[]) || []);
      }
      if (wing === 'tasks') {
        const res = await crmFetch(`/api/admin/crm/tasks?brand=${brand}`);
        if (!cancel) setTasks((res.body.tasks as Task[]) || []);
      }
      if (wing === 'activity') {
        const res = await crmFetch(`/api/admin/crm/activity?brand=${brand}`);
        if (!cancel) setActivity((res.body.activity as Activity[]) || []);
      }
      if (wing === 'accounts') {
        const res = await crmFetch(`/api/admin/crm/contacts?brand=${brand}`);
        if (!cancel) setContacts((res.body.contacts as Contact[]) || []);
      }
    }
    load().catch(() => { if (!cancel) setNotice('The desk could not be read.'); });
    return () => { cancel = true; };
  }, [brand, wing, refresh]);

  async function createAccount(form: FormData) {
    const res = await crmFetch('/api/admin/crm/accounts', {
      method: 'POST',
      body: JSON.stringify({
        brand,
        displayName: String(form.get('displayName') || ''),
        status: String(form.get('status') || 'prospect'),
        city: String(form.get('city') || '') || null,
        notes: String(form.get('notes') || ''),
      }),
    });
    setNotice(res.body.ok ? 'Account saved in this brand.' : String(res.body.reason || 'Account was not saved.'));
    if (res.body.ok) setRefresh((value) => value + 1);
  }

  async function createOpportunity(form: FormData) {
    const cents = dollarsToCents(String(form.get('forecast') || ''));
    if (cents === 'invalid') { setNotice('Forecast must be dollars and cents, or empty.'); return; }
    const res = await crmFetch('/api/admin/crm/opportunities', {
      method: 'POST',
      body: JSON.stringify({
        brand,
        accountId: String(form.get('accountId') || ''),
        name: String(form.get('name') || ''),
        stage: String(form.get('stage') || 'lead'),
        forecastCents: cents,
        notes: String(form.get('notes') || ''),
      }),
    });
    setNotice(res.body.ok ? 'Opportunity saved. The amount is a forecast, not invoiced or paid revenue.' : String(res.body.reason || 'Opportunity was not saved.'));
    if (res.body.ok) setRefresh((value) => value + 1);
  }

  async function createTask(form: FormData) {
    const res = await crmFetch('/api/admin/crm/tasks', {
      method: 'POST',
      body: JSON.stringify({
        brand,
        title: String(form.get('title') || ''),
        accountId: String(form.get('accountId') || '') || null,
        dueOn: String(form.get('dueOn') || '') || null,
        status: 'open',
        notes: String(form.get('notes') || ''),
      }),
    });
    setNotice(res.body.ok ? 'Task saved.' : String(res.body.reason || 'Task was not saved.'));
    if (res.body.ok) setRefresh((value) => value + 1);
  }

  async function completeTask(id: string) {
    const res = await crmFetch(`/api/admin/crm/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ brand, status: 'done' }),
    });
    setNotice(res.body.ok ? 'Task marked done.' : String(res.body.reason || 'Task was not updated.'));
    if (res.body.ok) setTasks((rows) => rows.map((row) => row.id === id ? { ...row, status: 'done' } : row));
  }

  async function runSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const res = await crmFetch(`/api/admin/crm/search?brand=${brand}&q=${encodeURIComponent(query)}`);
    if (!res.body.ok) { setNotice(String(res.body.reason || 'Search was rejected.')); return; }
    setAccounts((res.body.accounts as Account[]) || []);
    setContacts((res.body.contacts as Contact[]) || []);
    setOpportunities((res.body.opportunities as Opportunity[]) || []);
    setNotice(`Search is limited to ${brandLabel(brand)}.`);
  }

  const label = brandLabel(brand);
  const lines = desk ? signalLines(desk) : [];

  return (
    <div className="mx-auto flex min-h-full w-full max-w-content flex-col gap-8 px-page-margin-mobile py-8 md:px-page-margin md:py-12">
      <header className="flex flex-col gap-4 border-b border-hairline pb-6">
        <p className="font-sans text-eyebrow-m md:text-eyebrow font-medium uppercase text-cedar">Wholesale CRM</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display text-heading-m-m md:text-heading-m text-primary">{WINGS.find((item) => item.id === wing)?.label}</h1>
          <p className="font-mono text-specimen text-tertiary">{roleLabel} {sessionLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Brand">
          {brands.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={item === brand}
              onClick={() => setBrand(item)}
              className={`border px-3 py-2 font-mono text-specimen uppercase tracking-specimen ${item === brand ? 'border-ink bg-ink text-inverse' : 'border-hairline bg-clinical text-primary'}`}
            >
              {brandLabel(item)}
            </button>
          ))}
        </div>
        <p className="max-w-editorial text-caption text-secondary">
          {label} records stay in {label}. An email match does not merge CedarGrowth with Bond.
          The wholesale page shows CedarGrowth signals only, and only to this admin session.
        </p>
        <Link href="/admin/kelvin" className="cedar-underline w-fit font-mono text-specimen uppercase tracking-specimen">KELVIN</Link>
      </header>

      <nav className="flex flex-wrap gap-4" aria-label="Wings">
        {WINGS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={wing === item.id}
            onClick={() => setWing(item.id)}
            className={`font-display text-heading-s-m md:text-heading-s ${wing === item.id ? 'text-primary' : 'text-tertiary'}`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {notice ? <p role="status" className="border border-hairline bg-bone px-4 py-3 text-body-m text-primary">{notice}</p> : null}
      {configured === false ? (
        <p className="border border-hairline bg-clinical px-4 py-3 text-body-m text-primary">
          CRM storage is not configured. Nothing is kept in this browser. Migration 0120 has not been applied from this desk.
        </p>
      ) : null}

      {counts && configured ? (
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Count label="Accounts" value={counts.accounts} />
          <Count label="Contacts" value={counts.contacts} />
          <Count label="Open tasks" value={counts.openTasks} />
          <div>
            <dt className="font-mono text-specimen uppercase tracking-specimen text-tertiary">Forecast</dt>
            <dd className="font-mono text-data text-primary">{formatForecast(typeof counts.forecastCents === 'number' ? counts.forecastCents : null)}</dd>
          </div>
        </dl>
      ) : null}

      {wing === 'accounts' ? (
        <section className="flex flex-col gap-6">
          <form onSubmit={runSearch} className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-caption text-tertiary">
              Search {label}
              <input value={query} onChange={(event) => setQuery(event.target.value)} className="border border-hairline bg-clinical px-3 py-2 text-body-m text-primary" />
            </label>
            <button type="submit" className="self-end border border-ink px-4 py-2 font-mono text-specimen uppercase">Search</button>
          </form>
          {configured && accounts.length === 0 ? <p className="text-body-m text-secondary">No {label} accounts yet.</p> : null}
          <RecordList rows={accounts.map((row) => ({ id: row.publicId || row.id, title: row.displayName, meta: row.status }))} />
          <RecordList rows={contacts.map((row) => ({ id: row.publicId || row.id, title: row.name, meta: row.email || 'No email' }))} />
          <form onSubmit={(event) => { event.preventDefault(); createAccount(new FormData(event.currentTarget)); }} className="grid max-w-editorial grid-cols-1 gap-3 border border-hairline bg-clinical p-4">
            <Field name="displayName" label="Account name" />
            <label className="flex flex-col gap-1 text-caption text-tertiary">Status
              <select name="status" className="border border-hairline bg-clinical px-3 py-2 text-body-m" defaultValue="prospect">
                <option value="prospect">Prospect</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="closed">Closed</option>
              </select>
            </label>
            <Field name="city" label="City, operator entered, not a verified address" />
            <Field name="notes" label="Sales notes owned by this CRM" />
            <button type="submit" disabled={configured === false} className="border border-ink px-4 py-2 font-mono text-specimen uppercase disabled:opacity-40">Save account</button>
          </form>
        </section>
      ) : null}

      {wing === 'pipeline' ? (
        <section className="flex flex-col gap-6">
          <p className="max-w-editorial text-body-m text-secondary">Forecast is not invoiced revenue and not paid revenue. Invoiced and paid amounts are not in this CRM.</p>
          {configured && opportunities.length === 0 ? <p className="text-body-m text-secondary">No {label} opportunities yet.</p> : null}
          <RecordList rows={opportunities.map((row) => ({ id: row.publicId || row.id, title: row.name, meta: `${row.stage}. ${row.forecastLabel || formatForecast(row.forecastCents)}` }))} />
          <form onSubmit={(event) => { event.preventDefault(); createOpportunity(new FormData(event.currentTarget)); }} className="grid max-w-editorial grid-cols-1 gap-3 border border-hairline bg-clinical p-4">
            <label className="flex flex-col gap-1 text-caption text-tertiary">Account
              <select name="accountId" className="border border-hairline bg-clinical px-3 py-2 text-body-m">
                <option value="">Choose</option>
                {accounts.map((row) => <option key={row.id} value={row.id}>{row.displayName}</option>)}
              </select>
            </label>
            <Field name="name" label="Opportunity name" />
            <label className="flex flex-col gap-1 text-caption text-tertiary">Stage
              <select name="stage" className="border border-hairline bg-clinical px-3 py-2 text-body-m" defaultValue="lead">
                {['lead', 'qualified', 'proposal', 'committed', 'closed_won', 'closed_lost'].map((stage) => <option key={stage} value={stage}>{stage}</option>)}
              </select>
            </label>
            <Field name="forecast" label="Forecast amount in dollars, not invoiced, not paid" />
            <button type="submit" disabled={configured === false} className="border border-ink px-4 py-2 font-mono text-specimen uppercase disabled:opacity-40">Save opportunity</button>
          </form>
        </section>
      ) : null}

      {wing === 'tasks' ? (
        <section className="flex flex-col gap-6">
          {configured && tasks.length === 0 ? <p className="text-body-m text-secondary">No {label} tasks yet.</p> : null}
          <ul className="flex flex-col gap-3">
            {tasks.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 border border-hairline bg-clinical px-4 py-3">
                <div>
                  <p className="text-body-m text-primary">{row.title}</p>
                  <p className="font-mono text-specimen text-tertiary">{row.publicId} {row.status} {row.dueOn || ''}</p>
                </div>
                {row.status === 'open' ? <button type="button" onClick={() => completeTask(row.id)} className="border border-ink px-3 py-2 font-mono text-specimen uppercase">Mark done</button> : null}
              </li>
            ))}
          </ul>
          <form onSubmit={(event) => { event.preventDefault(); createTask(new FormData(event.currentTarget)); }} className="grid max-w-editorial grid-cols-1 gap-3 border border-hairline bg-clinical p-4">
            <Field name="title" label="Follow-up" />
            <label className="flex flex-col gap-1 text-caption text-tertiary">Account
              <select name="accountId" className="border border-hairline bg-clinical px-3 py-2 text-body-m">
                <option value="">None</option>
                {accounts.map((row) => <option key={row.id} value={row.id}>{row.displayName}</option>)}
              </select>
            </label>
            <Field name="dueOn" label="Due date (YYYY-MM-DD)" />
            <button type="submit" disabled={configured === false} className="border border-ink px-4 py-2 font-mono text-specimen uppercase disabled:opacity-40">Save task</button>
          </form>
        </section>
      ) : null}

      {wing === 'activity' ? (
        <section className="flex flex-col gap-3">
          {configured && activity.length === 0 ? <p className="text-body-m text-secondary">No activity has been recorded for {label}.</p> : null}
          <RecordList rows={activity.map((row) => ({ id: row.publicId || row.id, title: row.summary, meta: `${row.createdAt} ${row.actor}` }))} />
        </section>
      ) : null}

      {wing === 'signals' ? (
        <section className="flex flex-col gap-6">
          <p className="max-w-editorial text-body-m text-secondary">
            Hoodie is not connected. Live recommendations are inactive until coverage, freshness, and calibration are verified.
            These lines are the same evaluation the CedarGrowth wholesale page shows to this session.
          </p>
          {lines.map((section) => (
            <article key={section.title} className="border border-hairline bg-clinical p-4">
              <h2 className="font-display text-heading-s text-primary">{section.title}</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {section.lines.map((line) => <li key={line} className="text-caption text-secondary">{line}</li>)}
              </ul>
            </article>
          ))}
          {desk ? (
            <ul className="flex flex-col gap-2">
              {desk.boundaries.map((line) => <li key={line} className="text-caption text-tertiary">{line}</li>)}
            </ul>
          ) : null}
        </section>
      ) : null}

      {wing === 'canix' ? (
        <section className="flex max-w-editorial flex-col gap-3 border border-hairline bg-clinical p-4">
          <h2 className="font-display text-heading-s text-primary">{canixLabel}</h2>
          <p className="text-body-m text-secondary">No wholesale orders, packages, licenses, or inventory are loaded. This CRM does not call Canix, and it does not treat forecast amounts as invoiced or paid revenue.</p>
          <p className="inline-flex w-fit rounded-chip border border-attention px-2 py-1 font-mono text-specimen uppercase text-attention">Not connected</p>
        </section>
      ) : null}
    </div>
  );
}

function Count({ label, value }: { label: string; value: number | boolean | null | undefined }) {
  return (
    <div>
      <dt className="font-mono text-specimen uppercase tracking-specimen text-tertiary">{label}</dt>
      <dd className="font-mono text-data text-primary">{typeof value === 'number' ? value : '...'}</dd>
    </div>
  );
}

function Field({ name, label }: { name: string; label: string }) {
  return (
    <label className="flex flex-col gap-1 text-caption text-tertiary">
      {label}
      <input name={name} className="border border-hairline bg-clinical px-3 py-2 text-body-m text-primary" />
    </label>
  );
}

function RecordList({ rows }: { rows: { id: string; title: string; meta: string }[] }) {
  if (!rows.length) return null;
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.id} className="border border-hairline bg-clinical px-4 py-3">
          <p className="text-body-m text-primary">{row.title}</p>
          <p className="font-mono text-specimen text-tertiary">{row.id}</p>
          <p className="text-caption text-secondary">{row.meta}</p>
        </li>
      ))}
    </ul>
  );
}
