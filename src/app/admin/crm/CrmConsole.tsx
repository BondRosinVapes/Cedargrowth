'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  isDispensaryAccount,
  brandLabel,
  parseBrand,
  LEAD_SOURCE_LABELS,
  LEAD_SOURCES,
  dollarsToCents,
  formatForecast,
  OPPORTUNITY_STAGES,
  PRODUCT_LINES,
  PRODUCT_LINE_LABELS,
  signalLines,
  type CrmBrand,
  type DeskEvaluation,
} from '@/lib/crm/engine';
import { STAGE_LABELS } from '@/lib/crm/dashboard';
import { DISTRIBUTOR_LABELS } from '@/lib/crm/distributor';
import { VISIT_OUTCOME_LABELS, type VisitOutcome } from '@/lib/crm/field';
import { NY_COUNTIES, regionForCounty } from '@/lib/crm/nyRegions';
import { DashboardWing } from './DashboardWing';
import { GooglePlaceCard } from './GooglePlaceCard';
import { BatchesWing } from './BatchesWing';

type Wing = 'dashboard' | 'accounts' | 'batches' | 'pipeline' | 'tasks' | 'activity' | 'reports' | 'health' | 'signals' | 'canix';

type Account = {
  id: string;
  publicId: string;
  displayName: string;
  status: string;
  city: string | null;
  county?: string | null;
  notes: string;
  licenseRef?: string | null;
  facilityRef?: string | null;
  assignedRep?: string | null;
  accountType?: keyof typeof ACCOUNT_TYPE_LABELS | null;
  leadSource?: keyof typeof LEAD_SOURCE_LABELS | null;
  distributor?: 'nabis' | 'other' | 'self' | null;
  distributorAccountRef?: string | null;
};
type DistributorOrderRow = {
  id: string;
  accountId: string | null;
  opportunityId: string | null;
  distributor: 'nabis' | 'other' | 'self';
  orderRef: string;
  retailerName: string;
  orderStatus: string;
  invoiceCents: number | null;
  orderedOn: string | null;
};
type Contact = { id: string; publicId: string; accountId: string; name: string; email: string | null; title: string | null; preference?: string };
type Opportunity = { id: string; publicId: string; name: string; stage: string; forecastCents: number | null; forecastLabel?: string };
type Task = { id: string; publicId: string; title: string; status: string; dueOn: string | null };
type Activity = { id: string; publicId: string; summary: string; createdAt: string; actor: string };

const WINGS: { id: Wing; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'batches', label: 'Batches' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'activity', label: 'Activity' },
  { id: 'reports', label: 'Reports' },
  { id: 'health', label: 'Health' },
  { id: 'signals', label: 'Signals' },
  { id: 'canix', label: 'Canix' },
];

function FieldMedia({ brand, id, kind }: { brand: CrmBrand; id: string; kind: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [note, setNote] = useState('');
  async function open() {
    const res = await crmFetch(`/api/admin/crm/media?brand=${brand}&id=${id}`);
    const signed = typeof res.body.url === 'string' ? res.body.url : '';
    if (res.status === 200 && signed) {
      setUrl(signed);
      setNote('');
      return;
    }
    setNote(typeof res.body.reason === 'string' ? res.body.reason : 'The file could not be signed.');
  }
  const label = kind === 'voice_note' ? 'Voice note' : 'Shelf photo';
  return (
    <li className="flex flex-col gap-2">
      <button type="button" onClick={open} className="min-h-[44px] self-start border border-ink px-3 py-2 text-body-m text-primary">{label}. Open for 10 minutes</button>
      {url && kind === 'voice_note' ? <audio controls src={url} className="w-full" /> : null}
      {url && kind !== 'voice_note' ? (
        // Signed URLs last 10 minutes and are not a configured image host.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Shelf photo" className="max-w-full" />
      ) : null}
      {note ? <p className="text-caption text-secondary">{note}</p> : null}
    </li>
  );
}

async function crmFetch(path: string, init?: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers = new Headers(init?.headers);
  headers.set('x-cedargrowth-crm', '1');
  if (init?.body) headers.set('content-type', 'application/json');
  const res = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body: body as Record<string, unknown> };
}

function WonMergeLine({ accountId, onChanged }: { accountId: string; onChanged: (refused: number) => void }) {
  const [merge, setMerge] = useState<{ id: string; contactIds: string[] } | null>(null);
  useEffect(() => {
    let cancel = false;
    crmFetch(`/api/admin/crm/distribution-merge?brand=cedargrowth&accountId=${encodeURIComponent(accountId)}`).then((res) => {
      if (cancel) return;
      const row = res.body.merge as { id?: string; contactIds?: string[]; undoneAt?: string | null } | null;
      setMerge(row && row.id && !row.undoneAt ? { id: row.id, contactIds: row.contactIds || [] } : null);
    }).catch(() => { if (!cancel) setMerge(null); });
    return () => { cancel = true; };
  }, [accountId]);
  if (!merge) return null;
  const count = merge.contactIds.length;
  return (
    <div className="flex flex-col gap-2 border border-hairline bg-clinical p-3">
      <p className="text-body-m text-primary">{count === 0 ? 'Won merge. No contacts moved.' : `Won merge. ${count} contact${count === 1 ? '' : 's'} moved onto this account.`}</p>
      <button type="button" onClick={async () => {
        const res = await crmFetch('/api/admin/crm/distribution-merge', { method: 'POST', body: JSON.stringify({ brand: 'cedargrowth', mergeId: merge.id }) });
        if (res.body.ok) onChanged(Array.isArray(res.body.refused) ? res.body.refused.length : 0);
      }} className="min-h-[44px] self-start border border-ink px-3 py-2 font-mono text-specimen uppercase text-primary">Undo</button>
    </div>
  );
}

function ReorderLinks({ brand, accountId, accountName }: { brand: CrmBrand; accountId: string; accountName: string }) {
  const [links, setLinks] = useState<{ id: string; expiresAt: string; revokedAt: string | null }[]>([]);
  const [statuses, setStatuses] = useState<{ recipient: string; label: string; lastEventAt: string | null }[]>([]);
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancel = false;
    crmFetch(`/api/admin/crm/reorder-links?brand=${brand}&accountId=${accountId}`).then((res) => {
      if (cancel) return;
      setLinks((res.body.links as { id: string; expiresAt: string; revokedAt: string | null }[]) || []);
      setStatuses((res.body.emailStatus as { recipient: string; label: string; lastEventAt: string | null }[]) || []);
      setConfigured(res.body.configured === true);
    }).catch(() => { if (!cancel) setNotice('Reorder links could not be read.'); });
    return () => { cancel = true; };
  }, [brand, accountId, url, tick]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const res = await crmFetch('/api/admin/crm/reorder-links', { method: 'POST', body: JSON.stringify({ brand, accountId, email }) });
    if (typeof res.body.url === 'string') {
      setUrl(res.body.url);
      setNotice(typeof res.body.reason === 'string' ? res.body.reason : (res.body.emailed === true ? `Link emailed for ${accountName}.` : 'Copy this link. It is shown once.'));
      setTick((value) => value + 1);
      return;
    }
    setNotice(typeof res.body.reason === 'string' ? res.body.reason : 'The link was not created.');
  }

  async function refreshStatus() {
    const res = await crmFetch(`/api/admin/crm/email-status/refresh?brand=${brand}`, { method: 'POST' });
    setNotice(res.body.configured === false ? 'Email is not configured' : (typeof res.body.reason === 'string' ? res.body.reason : 'Status refreshed.'));
    setTick((value) => value + 1);
  }

  async function revoke(id: string) {
    const res = await crmFetch('/api/admin/crm/reorder-links', { method: 'PATCH', body: JSON.stringify({ brand, id }) });
    if (res.body.ok === true) setLinks((rows) => rows.map((row) => row.id === id ? { ...row, revokedAt: String(res.body.link && (res.body.link as { revokedAt?: string }).revokedAt || new Date().toISOString()) } : row));
    setNotice(res.body.ok === true ? 'Link revoked.' : String(res.body.reason || 'The link was not revoked.'));
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-display text-body-l text-primary">Reorder link</h3>
      <p className="text-caption text-tertiary">The link lets this account request a reorder. It is not an order and no payment is taken.</p>
      <p className="text-caption text-tertiary">Open tracking is approximate: some mail apps preload images.</p>
      {configured === false ? <p className="text-caption text-tertiary">Email is not configured</p> : null}
      <button type="button" onClick={refreshStatus} className="min-h-[44px] self-start border border-ink px-3 py-2 font-mono text-specimen uppercase text-primary">Refresh status</button>
      {notice ? <p className="text-body-m text-primary">{notice}</p> : null}
      {url ? <input readOnly value={url} className="min-h-[44px] border border-hairline bg-clinical px-3 font-mono text-specimen text-primary" /> : null}
      <form onSubmit={create} className="flex flex-col gap-2">
        <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email the link, optional" className="min-h-[44px] border border-hairline bg-clinical px-3 text-body-m" />
        <button type="submit" className="min-h-[44px] self-start border border-ink px-3 py-2 font-mono text-specimen uppercase text-primary">Create reorder link</button>
      </form>
      <ul className="flex flex-col gap-1">
        {links.length === 0 ? <li className="text-caption text-tertiary">No reorder links yet.</li> : links.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-2 text-body-m text-primary">
            <span>Expires {row.expiresAt.slice(0, 10)}. {row.revokedAt ? 'Revoked' : 'Open'}.</span>
            {row.revokedAt ? null : <button type="button" onClick={() => revoke(row.id)} className="min-h-[44px] border border-ink px-3 py-2 font-mono text-specimen uppercase">Revoke</button>}
          </li>
        ))}
      </ul>
      <ul className="flex flex-col gap-1">
        {statuses.length === 0 ? <li className="text-caption text-tertiary">No emailed link status yet.</li> : statuses.map((row) => (
          <li key={`${row.recipient}-${row.lastEventAt || 'none'}`} className="text-body-m text-primary">{row.recipient}. {row.label}.{row.lastEventAt ? ` ${row.lastEventAt.slice(0, 16).replace('T', ' ')}` : ''}</li>
        ))}
      </ul>
    </div>
  );
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
  const brandKey = brands.join(',');
  const [wing, setWing] = useState<Wing>('dashboard');
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [notice, setNotice] = useState('');
  const [counts, setCounts] = useState<Record<string, number | null | boolean> | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [distributorOrders, setDistributorOrders] = useState<DistributorOrderRow[]>([]);
  const [fieldNotes, setFieldNotes] = useState<{ visits: { id: string; accountId: string; checkedInAt: string; outcome: string; notes: string }[]; samples: { id: string; accountId: string; productLine: string; quantityUnits: number; followUpOn: string }[]; media: { id: string; accountId: string; kind: string }[] }>({ visits: [], samples: [], media: [] });
  const [batches, setBatches] = useState<{ id: string; productId: string; batchNumber: string; labName: string; testedOn: string; released: boolean }[]>([]);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [desk, setDesk] = useState<DeskEvaluation | null>(null);
  const [canixLabel, setCanixLabel] = useState('Canix not connected');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const requested = parseBrand(new URLSearchParams(window.location.search).get('brand'));
    if (requested && brands.includes(requested)) setBrand(requested);
  }, [brandKey, brands]);

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
      if (storageMissing) {
        setConfigured(false);
        setNotice(String(countRes.body.reason || accountRes.body.reason || 'CRM storage is not configured.'));
      } else if (countRes.body.configured === true) {
        setConfigured(true);
      } else {
        setConfigured(null);
        if (countRes.body.ok === false) setNotice(String(countRes.body.reason || 'The desk could not be read.'));
      }
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
      if (wing === 'pipeline' || wing === 'accounts') {
        const [oppRes, orderRes] = await Promise.all([
          wing === 'pipeline' ? crmFetch(`/api/admin/crm/opportunities?brand=${brand}`) : Promise.resolve(null),
          crmFetch(`/api/admin/crm/distributor-orders?brand=${brand}`),
        ]);
        if (!cancel && oppRes) setOpportunities((oppRes.body.opportunities as Opportunity[]) || []);
        if (!cancel) setDistributorOrders((orderRes.body.orders as DistributorOrderRow[]) || []);
      }
      if (wing === 'tasks') {
        const res = await crmFetch(`/api/admin/crm/tasks?brand=${brand}`);
        if (!cancel) setTasks((res.body.tasks as Task[]) || []);
      }
      if (wing === 'activity') {
        const res = await crmFetch(`/api/admin/crm/activity?brand=${brand}`);
        if (!cancel) setActivity((res.body.activity as Activity[]) || []);
      }
      if (wing === 'reports') {
        const res = await crmFetch(`/api/admin/crm/reports?brand=${brand}`);
        if (!cancel) setReport(res.body);
      }
      if (wing === 'health') {
        const res = await crmFetch(`/api/admin/crm/health?brand=${brand}`);
        if (!cancel) setHealth(res.body);
      }
      if (wing === 'batches') {
        const res = await crmFetch(`/api/admin/crm/batches?brand=${brand}`);
        if (!cancel) setBatches((res.body.batches as { id: string; productId: string; batchNumber: string; labName: string; testedOn: string; released: boolean }[]) || []);
      }
      if (wing === 'accounts') {
        const [res, fieldRes] = await Promise.all([
          crmFetch(`/api/admin/crm/contacts?brand=${brand}`),
          crmFetch(`/api/admin/crm/field?brand=${brand}`),
        ]);
        if (!cancel) setContacts((res.body.contacts as Contact[]) || []);
        if (!cancel) setFieldNotes({
          visits: (fieldRes.body.visits as { id: string; accountId: string; checkedInAt: string; outcome: string; notes: string }[]) || [],
          samples: (fieldRes.body.samples as { id: string; accountId: string; productLine: string; quantityUnits: number; followUpOn: string }[]) || [],
          media: (fieldRes.body.media as { id: string; accountId: string; kind: string }[]) || [],
        });
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
        county: String(form.get('county') || '') || null,
        notes: String(form.get('notes') || ''),
        licenseRef: String(form.get('licenseRef') || '') || null,
        facilityRef: String(form.get('facilityRef') || '') || null,
        licenseJurisdiction: String(form.get('licenseJurisdiction') || '') || null,
        licenseExpiry: String(form.get('licenseExpiry') || '') || null,
        assignedRep: String(form.get('assignedRep') || '') || null,
        accountType: String(form.get('accountType') || '') || null,
        leadSource: String(form.get('leadSource') || '') || null,
        distributor: String(form.get('distributor') || '') || null,
        distributorAccountRef: String(form.get('distributorAccountRef') || '') || null,
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
        expectedCloseOn: String(form.get('expectedCloseOn') || '') || null,
        productLine: String(form.get('productLine') || '') || null,
        quantityUnits: String(form.get('quantityUnits') || '') === '' ? null : Number(form.get('quantityUnits')),
        lossReason: String(form.get('lossReason') || '') || null,
        nextAction: String(form.get('nextAction') || '') || null,
        notes: String(form.get('notes') || ''),
      }),
    });
    setNotice(res.body.ok ? 'Opportunity saved. The amount is a forecast, not invoiced or paid revenue.' : String(res.body.reason || 'Opportunity was not saved.'));
    if (res.body.ok) setRefresh((value) => value + 1);
  }

  async function recordNote(form: FormData) {
    const res = await crmFetch('/api/admin/crm/notes', {
      method: 'POST',
      body: JSON.stringify({ brand, accountId: String(form.get('accountId') || ''), text: String(form.get('text') || '') }),
    });
    setNotice(res.body.ok ? 'Note appended.' : String(res.body.reason || 'Note was not saved.'));
    if (res.body.ok) setRefresh((value) => value + 1);
  }

  async function createContact(form: FormData) {
    const res = await crmFetch('/api/admin/crm/contacts', {
      method: 'POST',
      body: JSON.stringify({
        brand,
        accountId: String(form.get('accountId') || ''),
        name: String(form.get('name') || ''),
        email: String(form.get('email') || '') || null,
        preference: String(form.get('preference') || 'unspecified'),
        notes: String(form.get('notes') || ''),
      }),
    });
    setNotice(res.body.ok ? 'Contact saved. Email is not used to merge accounts.' : String(res.body.reason || 'Contact was not saved.'));
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
        ownerActor: String(form.get('ownerActor') || '') || null,
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

  const selected = accounts.find((row) => row.id === selectedAccountId) ?? null;
  const selectedContact = contacts.find((row) => row.id === selectedContactId) ?? null;
  const contactAccount = selectedContact ? accounts.find((row) => row.id === selectedContact.accountId) ?? null : null;
  const accountContacts = selected ? contacts.filter((row) => row.accountId === selected.id) : [];
  const label = brandLabel(brand);
  const lines = desk ? signalLines(desk) : [];

  return (
    <div className={`mx-auto flex min-h-full w-full flex-col gap-8 px-page-margin-mobile py-8 md:px-page-margin md:py-12 ${wing === 'dashboard' ? 'max-w-none' : 'max-w-content'}`}>
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
              onClick={() => {
                setBrand(item);
                const url = new URL(window.location.href);
                url.searchParams.set('brand', item);
                window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
              }}
              className={`border px-3 py-2 font-mono text-specimen uppercase tracking-specimen ${item === brand ? 'border-ink bg-ink text-inverse' : 'border-hairline bg-clinical text-primary'}`}
            >
              {brandLabel(item)}
            </button>
          ))}
        </div>
        <p className="max-w-editorial text-caption text-tertiary">
          {label} records stay in {label}. Brands are never merged.{' '}
          <Link href="/admin/kelvin" className="cedar-underline font-mono text-specimen uppercase tracking-specimen">KELVIN</Link>
        </p>
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
          CRM storage is not configured. Nothing is kept in this browser. Migrations 0120 through 0123 have not been applied from this desk.
        </p>
      ) : null}

      {counts && configured && wing !== 'dashboard' ? (
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

      {wing === 'dashboard' ? (
        <DashboardWing key={`${brand}-${refresh}`} brand={brand} brandName={label} onOpen={setWing} canEditCapacity={roleLabel !== 'Sales'} onOpenAccount={(id) => { setSelectedAccountId(id); setWing('accounts'); }} />
      ) : null}

      {wing === 'batches' ? (
        <BatchesWing brand={brand} batches={batches} canManage={roleLabel !== 'Sales'} onChanged={() => setRefresh((value) => value + 1)} />
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
          <RecordList
            rows={accounts.map((row) => ({ id: row.id, title: row.displayName, meta: row.status }))}
            onSelect={setSelectedAccountId}
          />
          {selected ? (
            <article className="flex max-w-editorial flex-col gap-2 border border-hairline bg-clinical p-4">
              <h2 className="font-display text-heading-s text-primary">{selected.displayName}</h2>
              <p className="font-mono text-specimen text-tertiary">{selected.publicId || selected.id}</p>
              <p className="text-body-m text-secondary">License reference: {selected.licenseRef || 'None stored'}. A stored reference is not a validity certification.</p>
              <p className="text-body-m text-secondary">Facility reference: {selected.facilityRef || 'None stored'}. This is not a certified facility record.</p>
              <p className="text-body-m text-secondary">Account type: {selected.accountType ? ACCOUNT_TYPE_LABELS[selected.accountType] : 'Not set'}. Lead source: {selected.leadSource ? LEAD_SOURCE_LABELS[selected.leadSource] : 'Not set'}.</p>
              <p className="text-body-m text-secondary">County: {selected.county || 'Not set'}. Region: {regionForCounty(selected.county)}.</p>
              <p className="text-body-m text-secondary">Assigned rep: {selected.assignedRep || 'None'}. Assignment does not grant a login or a role.</p>
              <p className="text-body-m text-secondary">Distributor: {selected.distributor ? DISTRIBUTOR_LABELS[selected.distributor] : 'Not set'}. Distributor account ID: {selected.distributorAccountRef || 'None stored'}.</p>
              <ul className="flex flex-col gap-1">
                {distributorOrders.filter((row) => row.accountId === selected.id).length === 0 ? <li className="text-caption text-tertiary">No distributor orders linked to this account.</li> : distributorOrders.filter((row) => row.accountId === selected.id).map((row) => (
                  <li key={row.id} className="text-body-m text-primary">{row.orderRef}. {row.orderStatus}. {row.orderedOn || 'No order date'}.</li>
                ))}
              </ul>
              <ReorderLinks brand={brand} accountId={selected.id} accountName={selected.displayName} />
              <h3 className="font-display text-body-l text-primary">Visits</h3>
              <ul className="flex flex-col gap-1">
                {fieldNotes.visits.filter((row) => row.accountId === selected.id).length === 0 ? <li className="text-caption text-tertiary">No visits yet.</li> : fieldNotes.visits.filter((row) => row.accountId === selected.id).map((row) => (
                  <li key={row.id} className="text-body-m text-primary">{row.checkedInAt.slice(0, 10)}. {VISIT_OUTCOME_LABELS[row.outcome as VisitOutcome] || row.outcome}. {row.notes}</li>
                ))}
              </ul>
              <h3 className="font-display text-body-l text-primary">Samples</h3>
              <ul className="flex flex-col gap-1">
                {fieldNotes.samples.filter((row) => row.accountId === selected.id).length === 0 ? <li className="text-caption text-tertiary">No samples left.</li> : fieldNotes.samples.filter((row) => row.accountId === selected.id).map((row) => (
                  <li key={row.id} className="text-body-m text-primary">{PRODUCT_LINE_LABELS[row.productLine as keyof typeof PRODUCT_LINE_LABELS] || row.productLine}. {row.quantityUnits} units. Follow up {row.followUpOn}.</li>
                ))}
              </ul>
              <h3 className="font-display text-body-l text-primary">Photos and voice notes</h3>
              <ul className="flex flex-col gap-1">
                {fieldNotes.media.filter((row) => row.accountId === selected.id).length === 0 ? <li className="text-caption text-tertiary">No shelf photos or voice notes.</li> : fieldNotes.media.filter((row) => row.accountId === selected.id).map((row) => (
                  <FieldMedia key={row.id} brand={brand} id={row.id} kind={row.kind} />
                ))}
              </ul>
              {brand === 'cedargrowth' && isDispensaryAccount(selected.accountType) ? <GooglePlaceCard accountId={selected.id} /> : null}
              {brand === 'cedargrowth' && isDispensaryAccount(selected.accountType) ? <WonMergeLine accountId={selected.id} onChanged={(refused) => { setNotice(refused > 0 ? `Undo left ${refused} contact${refused === 1 ? '' : 's'} on this account. The previous account is gone.` : 'Undo restored the contacts to their previous accounts.'); setRefresh((value) => value + 1); }} /> : null}
              <h3 className="font-display text-body-l text-primary">Contacts</h3>
              <ul className="flex flex-col gap-2">
                {accountContacts.length === 0 ? <li className="text-caption text-tertiary">No contacts on this account.</li> : accountContacts.map((row) => (
                  <li key={row.id}>
                    <button type="button" onClick={() => setSelectedContactId(row.id)} className="min-h-[44px] w-full border border-hairline px-3 py-2 text-left text-body-m text-primary">{row.name}</button>
                  </li>
                ))}
              </ul>
            </article>
          ) : null}
          <RecordList rows={contacts.map((row) => ({ id: row.id, title: row.name, meta: row.email || 'No email' }))} onSelect={setSelectedContactId} />
          {selectedContact ? (
            <article className="flex w-full max-w-editorial flex-col gap-2 border border-hairline bg-clinical p-4">
              <h2 className="font-display text-heading-s text-primary">{selectedContact.name}</h2>
              {contactAccount ? (
                <button type="button" onClick={() => setSelectedAccountId(contactAccount.id)} className="min-h-[44px] border border-ink px-3 py-2 text-left text-body-m text-primary">Account: {contactAccount.displayName}</button>
              ) : <p className="text-caption text-tertiary">No linked account.</p>}
            </article>
          ) : null}
          <AddPanel label="Add contact">
            <form onSubmit={(event) => { event.preventDefault(); createContact(new FormData(event.currentTarget)); }} className="grid grid-cols-1 gap-3 border-t border-hairline p-4">
              <label className="flex flex-col gap-1 text-caption text-tertiary">Account
                <select name="accountId" className="border border-hairline bg-clinical px-3 py-2 text-body-m">
                  <option value="">Choose</option>
                  {accounts.map((row) => <option key={row.id} value={row.id}>{row.displayName}</option>)}
                </select>
              </label>
              <Field name="name" label="Contact name" />
              <Field name="email" label="Work email" />
              <label className="flex flex-col gap-1 text-caption text-tertiary">Preference
                <select name="preference" className="border border-hairline bg-clinical px-3 py-2 text-body-m" defaultValue="unspecified">
                  <option value="unspecified">Unspecified</option>
                  <option value="store_only">Store only</option>
                  <option value="do_not_contact">Do not contact</option>
                </select>
              </label>
              <button type="submit" disabled={configured === false} className="border border-ink px-4 py-2 font-mono text-specimen uppercase disabled:opacity-40">Save contact</button>
            </form>
          </AddPanel>
          <AddPanel label="Add account">
            <form onSubmit={(event) => { event.preventDefault(); createAccount(new FormData(event.currentTarget)); }} className="grid grid-cols-1 gap-3 border-t border-hairline p-4">
              <Field name="displayName" label="Account name" />
              <label className="flex flex-col gap-1 text-caption text-tertiary">Status
                <select name="status" className="border border-hairline bg-clinical px-3 py-2 text-body-m" defaultValue="prospect">
                  <option value="prospect">Prospect</option>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="closed">Closed</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-caption text-tertiary">Account type
                <select name="accountType" className="border border-hairline bg-clinical px-3 py-2 text-body-m" defaultValue="">
                  <option value="">Not set</option>
                  {ACCOUNT_TYPES.map((type) => <option key={type} value={type}>{ACCOUNT_TYPE_LABELS[type]}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-caption text-tertiary">Lead source
                <select name="leadSource" className="border border-hairline bg-clinical px-3 py-2 text-body-m" defaultValue="">
                  <option value="">Not set</option>
                  {LEAD_SOURCES.map((source) => <option key={source} value={source}>{LEAD_SOURCE_LABELS[source]}</option>)}
                </select>
              </label>
              <Field name="city" label="City or region" />
              <label className="flex flex-col gap-1 text-caption text-tertiary">County
                <select name="county" className="border border-hairline bg-clinical px-3 py-2 text-body-m" defaultValue="">
                  <option value="">Not set</option>
                  {NY_COUNTIES.map((county) => <option key={county} value={county}>{county}</option>)}
                </select>
              </label>
              <Field name="licenseRef" label="License number (reference only)" />
              <Field name="facilityRef" label="Facility reference" />
              <Field name="licenseJurisdiction" label="Jurisdiction" />
              <Field name="licenseExpiry" type="date" label="License expiry date" />
              <Field name="assignedRep" label="Sales rep" />
              <label className="flex flex-col gap-1 text-caption text-tertiary">Distributor
                <select name="distributor" className="border border-hairline bg-clinical px-3 py-2 text-body-m" defaultValue="">
                  <option value="">Not set</option>
                  <option value="nabis">Nabis</option>
                  <option value="other">Other</option>
                  <option value="self">Self</option>
                </select>
              </label>
              <Field name="distributorAccountRef" label="Distributor account ID" />
              <Field name="notes" label="Notes" />
              <button type="submit" disabled={configured === false} className="border border-ink px-4 py-2 font-mono text-specimen uppercase disabled:opacity-40">Save account</button>
            </form>
          </AddPanel>
        </section>
      ) : null}

      {wing === 'pipeline' ? (
        <section className="flex flex-col gap-6">
          <p className="max-w-editorial text-body-m text-secondary">Forecast is not invoiced revenue and not paid revenue. Invoiced and paid amounts are not in this CRM.</p>
          {configured && opportunities.length === 0 ? <p className="text-body-m text-secondary">No {label} opportunities yet.</p> : null}
          <RecordList rows={opportunities.map((row) => {
            const linked = distributorOrders.find((order) => order.opportunityId === row.id && order.orderStatus === 'delivered' && order.distributor === 'nabis');
            const invoiced = row.stage === 'won' && linked ? ` Invoiced by Nabis: ${typeof linked.invoiceCents === 'number' ? `$${(linked.invoiceCents / 100).toLocaleString('en-US')}` : 'None'}` : '';
            return { id: row.publicId || row.id, title: row.name, meta: `${STAGE_LABELS[row.stage as keyof typeof STAGE_LABELS] ?? row.stage}. ${row.forecastLabel || formatForecast(row.forecastCents)}.${invoiced}` };
          })} />
          <AddPanel label="Add opportunity">
            <form onSubmit={(event) => { event.preventDefault(); createOpportunity(new FormData(event.currentTarget)); }} className="grid grid-cols-1 gap-3 border-t border-hairline p-4">
              <label className="flex flex-col gap-1 text-caption text-tertiary">Account
                <select name="accountId" className="border border-hairline bg-clinical px-3 py-2 text-body-m">
                  <option value="">Choose</option>
                  {accounts.map((row) => <option key={row.id} value={row.id}>{row.displayName}</option>)}
                </select>
              </label>
              <Field name="name" label="Opportunity name" />
              <label className="flex flex-col gap-1 text-caption text-tertiary">Stage
                <select name="stage" className="border border-hairline bg-clinical px-3 py-2 text-body-m" defaultValue="lead">
                  {OPPORTUNITY_STAGES.map((stage) => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}
                </select>
              </label>
              <Field name="forecast" label="Forecast amount in dollars" />
              <Field name="expectedCloseOn" type="date" label="Expected close date" />
              <label className="flex flex-col gap-1 text-caption text-tertiary">Product line
                <select name="productLine" className="border border-hairline bg-clinical px-3 py-2 text-body-m" defaultValue="">
                  <option value="">Not set</option>
                  {PRODUCT_LINES.map((line) => <option key={line} value={line}>{PRODUCT_LINE_LABELS[line]}</option>)}
                </select>
              </label>
              <Field name="quantityUnits" label="Quantity (units)" />
              <Field name="nextAction" label="Next action" />
              <Field name="lossReason" label="Loss reason, required when stage is lost" />
              <button type="submit" disabled={configured === false} className="border border-ink px-4 py-2 font-mono text-specimen uppercase disabled:opacity-40">Save opportunity</button>
            </form>
          </AddPanel>
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
          <AddPanel label="Add task">
            <form onSubmit={(event) => { event.preventDefault(); createTask(new FormData(event.currentTarget)); }} className="grid grid-cols-1 gap-3 border-t border-hairline p-4">
              <Field name="title" label="Follow-up" />
              <label className="flex flex-col gap-1 text-caption text-tertiary">Account
                <select name="accountId" className="border border-hairline bg-clinical px-3 py-2 text-body-m">
                  <option value="">None</option>
                  {accounts.map((row) => <option key={row.id} value={row.id}>{row.displayName}</option>)}
                </select>
              </label>
              <Field name="dueOn" type="date" label="Due date" />
              <Field name="ownerActor" label="Owner (leave empty for yourself)" />
              <button type="submit" disabled={configured === false} className="border border-ink px-4 py-2 font-mono text-specimen uppercase disabled:opacity-40">Save task</button>
            </form>
          </AddPanel>
        </section>
      ) : null}

      {wing === 'activity' ? (
        <section className="flex flex-col gap-3">
          {configured && activity.length === 0 ? <p className="text-body-m text-secondary">No activity has been recorded for {label}.</p> : null}
          <RecordList rows={activity.map((row) => ({ id: row.publicId || row.id, title: row.summary, meta: `${row.createdAt} ${row.actor}` }))} />
          <AddPanel label="Add note">
            <form onSubmit={(event) => { event.preventDefault(); recordNote(new FormData(event.currentTarget)); }} className="grid grid-cols-1 gap-3 border-t border-hairline p-4">
              <label className="flex flex-col gap-1 text-caption text-tertiary">Account
                <select name="accountId" className="border border-hairline bg-clinical px-3 py-2 text-body-m">
                  <option value="">Choose</option>
                  {accounts.map((row) => <option key={row.id} value={row.id}>{row.displayName}</option>)}
                </select>
              </label>
              <Field name="text" label="Note (saved permanently)" />
              <button type="submit" disabled={configured === false} className="border border-ink px-4 py-2 font-mono text-specimen uppercase disabled:opacity-40">Append note</button>
            </form>
          </AddPanel>
        </section>
      ) : null}

      {wing === 'reports' ? (
        <section className="flex max-w-editorial flex-col gap-4">
          <p className="text-body-m text-secondary">Counts below are CRM records for {label}. Invoiced and paid amounts are not connected, so they are not shown as zero.</p>
          {report?.configured === false ? <p className="text-body-m">{String(report.reason || 'CRM storage is not configured.')}</p> : null}
          {report?.configured === true ? (
            <ul className="flex flex-col gap-2 font-mono text-specimen">
              {((report.funnel as { stage: string; count: number }[]) || []).map((row) => <li key={row.stage}>{STAGE_LABELS[row.stage as keyof typeof STAGE_LABELS] ?? row.stage}: {row.count}</li>)}
              <li>Open opportunities past expected close: {String(report.agedOpenOpportunities)}</li>
              {((report.workload as { ownerActor: string; openTasks: number }[]) || []).map((row) => (
                <li key={row.ownerActor}>Open tasks for {row.ownerActor}: {row.openTasks}</li>
              ))}
              <li>Invoiced: not connected. Paid: not connected.</li>
            </ul>
          ) : null}
        </section>
      ) : null}

      {wing === 'health' ? (
        <section className="flex max-w-editorial flex-col gap-3 border border-hairline bg-clinical p-4">
          <h2 className="font-display text-heading-s text-primary">Source health</h2>
          <p className="text-body-m text-primary">
            {health?.storage === 'ready'
              ? 'Storage is ready for this brand.'
              : health?.storage === 'absent' || health?.storage === 'unavailable'
                ? `Storage is not ready. ${String(health.reason || 'CRM storage is not configured.')}`
                : health ? String(health.reason || 'The desk could not be read.') : 'Loading.'}
          </p>
          <p className="text-body-m text-secondary">{health ? `${String((health.canix as { label?: string })?.label || 'Canix not connected')}. ${String((health.hoodie as { label?: string })?.label || 'Hoodie not connected')}. Last successful refresh: none. Adapter disconnection is separate from storage readiness.` : null}</p>
          <p className="text-body-m text-secondary">{health ? String(health.nabisLabel || 'Nabis: no data yet.') : null}</p>
          <p className="text-caption text-tertiary">Exceptions: not configured. A missing source is not a zero count and not a healthy sync.</p>
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

function AddPanel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="group max-w-editorial border border-hairline bg-clinical">
      <summary className="cursor-pointer list-none px-4 py-3 font-mono text-specimen uppercase tracking-specimen text-primary">
        <span className="group-open:hidden">+ </span><span className="hidden group-open:inline">- </span>{label}
      </summary>
      {children}
    </details>
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

function Field({ name, label, type = 'text' }: { name: string; label: string; type?: 'text' | 'date' }) {
  return (
    <label className="flex flex-col gap-1 text-caption text-tertiary">
      {label}
      <input name={name} type={type} className="border border-hairline bg-clinical px-3 py-2 text-body-m text-primary" />
    </label>
  );
}

function RecordList({ rows, onSelect }: { rows: { id: string; title: string; meta: string }[]; onSelect?: (id: string) => void }) {
  if (!rows.length) return null;
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.id} className="border border-hairline bg-clinical px-4 py-3">
          {onSelect ? (
            <button type="button" onClick={() => onSelect(row.id)} className="text-left">
              <p className="text-body-m text-primary">{row.title}</p>
              <p className="text-caption text-secondary">{row.meta}</p>
            </button>
          ) : (
            <>
              <p className="text-body-m text-primary">{row.title}</p>
              <p className="font-mono text-specimen text-tertiary">{row.id}</p>
              <p className="text-caption text-secondary">{row.meta}</p>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
