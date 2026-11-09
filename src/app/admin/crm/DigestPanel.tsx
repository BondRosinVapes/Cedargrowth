'use client';

import { useEffect, useState } from 'react';
import type { CrmBrand } from '@/lib/crm/engine';

async function crmFetch(path: string, init?: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers = new Headers(init?.headers);
  headers.set('x-cedargrowth-crm', '1');
  if (init?.body) headers.set('content-type', 'application/json');
  const res = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body: body as Record<string, unknown> };
}

export function DigestPanel({ brand, canSend }: { brand: CrmBrand; canSend: boolean }) {
  const [open, setOpen] = useState(false);
  const [html, setHtml] = useState('');
  const [text, setText] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [notice, setNotice] = useState('');
  const [statuses, setStatuses] = useState<{ recipient: string; label: string; lastEventAt: string | null }[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!canSend) return;
    let cancel = false;
    crmFetch(`/api/admin/crm/digest/preview?brand=${brand}`).then((res) => {
      if (cancel) return;
      if (res.body.ok !== true) {
        setNotice(typeof res.body.reason === 'string' ? res.body.reason : 'The digest could not be read.');
        return;
      }
      setHtml(typeof res.body.html === 'string' ? res.body.html : '');
      setText(typeof res.body.text === 'string' ? res.body.text : '');
      setRecipients(Array.isArray(res.body.recipients) ? res.body.recipients.filter((item): item is string => typeof item === 'string') : []);
      setLastSent(typeof res.body.lastSent === 'string' ? res.body.lastSent : null);
      setConfigured(res.body.configured === true);
      setStatuses(Array.isArray(res.body.statuses) ? res.body.statuses as { recipient: string; label: string; lastEventAt: string | null }[] : []);
      setNotice(res.body.configured === true ? '' : 'Email is not configured');
    }).catch(() => { if (!cancel) setNotice('The digest could not be read.'); });
    return () => { cancel = true; };
  }, [brand, canSend, tick]);

  async function send() {
    const res = await crmFetch('/api/admin/crm/digest/send', { method: 'POST', body: JSON.stringify({ brand }) });
    if (res.body.sent === true) {
      setNotice(typeof res.body.reason === 'string' ? res.body.reason : 'Digest sent.');
      setLastSent(new Date().toISOString());
      setTick((value) => value + 1);
      return;
    }
    setNotice(typeof res.body.reason === 'string' ? res.body.reason : 'The digest was not sent.');
  }

  async function refresh() {
    const res = await crmFetch(`/api/admin/crm/email-status/refresh?brand=${brand}`, { method: 'POST' });
    setNotice(res.body.configured === false ? 'Email is not configured' : (typeof res.body.reason === 'string' ? res.body.reason : 'Status refreshed.'));
    setTick((value) => value + 1);
  }

  if (!canSend) return null;

  return (
    <div className="flex flex-col gap-3 border border-hairline bg-clinical p-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-mono text-specimen uppercase text-tertiary">Digest</p>
        <button type="button" onClick={() => setOpen((value) => !value)} className="min-h-[44px] border border-ink px-3 py-2 font-mono text-specimen uppercase text-primary">Preview</button>
        <button type="button" onClick={send} disabled={configured === false} className="min-h-[44px] border border-ink bg-ink px-3 py-2 font-mono text-specimen uppercase text-inverse disabled:opacity-40">Send now</button>
        <button type="button" onClick={refresh} className="min-h-[44px] border border-ink px-3 py-2 font-mono text-specimen uppercase text-primary">Refresh status</button>
      </div>
      <p className="text-caption text-tertiary">Last sent: {lastSent ? lastSent.slice(0, 16).replace('T', ' ') : 'Not sent yet'}.</p>
      <p className="text-caption text-tertiary">Recipients: {recipients.length ? recipients.join(', ') : 'None'}.</p>
      <p className="text-caption text-tertiary">Open tracking is approximate: some mail apps preload images.</p>
      <ul className="flex flex-col gap-1">
        {statuses.length === 0 ? <li className="text-caption text-tertiary">No status yet.</li> : statuses.map((row) => (
          <li key={`${row.recipient}-${row.lastEventAt || 'none'}`} className="text-body-m text-primary">{row.recipient}. {row.label}.{row.lastEventAt ? ` ${row.lastEventAt.slice(0, 16).replace('T', ' ')}` : ''}</li>
        ))}
      </ul>
      {notice ? <p role="status" className="text-body-m text-primary">{notice}</p> : null}
      {open && html ? <iframe title="Digest preview" sandbox="" srcDoc={html} className="h-80 w-full border border-hairline bg-clinical" /> : null}
      {open && text ? <pre className="max-h-40 overflow-auto whitespace-pre-wrap border border-hairline p-3 font-sans text-caption text-primary">{text}</pre> : null}
    </div>
  );
}
