'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PRODUCT_LINES, PRODUCT_LINE_LABELS, brandLabel, type CrmBrand } from '@/lib/crm/engine';
import { VISIT_OUTCOMES, VISIT_OUTCOME_LABELS, mapsDirectionsUrl, type VisitOutcome } from '@/lib/crm/field';
import { NextActions } from '@/app/admin/crm/TerritoryMap';

type Account = { id: string; displayName: string; city: string | null };
type Visit = { id: string; accountId: string; repActor: string; checkedInAt: string; checkedOutAt: string | null; outcome: VisitOutcome; notes: string };
type Task = { id: string; title: string; dueOn: string | null; status: string };
type Pending = { id: string; label: string; path: string; method: 'POST' | 'PATCH'; body: Record<string, unknown> };

const tap = 'min-h-[44px] border border-ink px-4 py-3 text-left font-mono text-specimen uppercase text-primary';
const solid = 'min-h-[44px] border border-ink bg-ink px-4 py-3 font-mono text-specimen uppercase text-inverse disabled:opacity-40';

async function send(path: string, method: 'GET' | 'POST' | 'PATCH', body?: Record<string, unknown>) {
  const res = await fetch(path, {
    method,
    headers: { 'x-cedargrowth-crm': '1', ...(body ? { 'content-type': 'application/json' } : {}) },
    credentials: 'same-origin',
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok || json.ok === false) throw new Error(String(json.reason || 'Not saved yet, retry'));
  return json;
}

function daysSince(last: string | null, today: string): number | null {
  if (!last) return null;
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${last.slice(0, 10)}T00:00:00Z`)) / 86400000);
}

async function stripPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Photo could not be prepared.');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob) throw new Error('Photo could not be prepared.');
  return blob;
}

export function FieldApp({ brands, actorId, label }: { brands: CrmBrand[]; actorId: string; label: string }) {
  const [brand, setBrand] = useState<CrmBrand>(brands[0] ?? 'cedargrowth');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [region, setRegion] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [visitId, setVisitId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<VisitOutcome>('met_buyer');
  const [notes, setNotes] = useState('');
  const [pending, setPending] = useState<Pending[]>([]);
  const [message, setMessage] = useState('');
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    const json = await send(`/api/admin/crm/field?brand=${brand}`, 'GET');
    setAccounts((json.accounts as Account[]) || []);
    setVisits((json.visits as Visit[]) || []);
    setTasks((json.tasks as Task[]) || []);
  }, [brand]);

  useEffect(() => { load().catch(() => setMessage('Not saved yet, retry')); }, [load]);

  async function trySend(item: Omit<Pending, 'id'>) {
    try {
      const json = await send(item.path, item.method, item.body);
      setMessage('');
      await load();
      return json;
    } catch {
      setPending((rows) => [...rows, { ...item, id: crypto.randomUUID() }]);
      setMessage('Not saved yet, retry');
      return null;
    }
  }

  async function retry() {
    const left: Pending[] = [];
    for (const item of pending) {
      try { await send(item.path, item.method, item.body); } catch { left.push(item); }
    }
    setPending(left);
    setMessage(left.length ? 'Not saved yet, retry' : '');
    await load().catch(() => setMessage('Not saved yet, retry'));
  }

  const regions = Array.from(new Set(accounts.map((row) => row.city?.trim() || 'No region'))).sort();
  const route = accounts.filter((row) => (row.city?.trim() || 'No region') === region).map((row) => {
    const last = visits.filter((visit) => visit.accountId === row.id).map((visit) => visit.checkedInAt).sort().at(-1) ?? null;
    return { ...row, last, days: daysSince(last, today) };
  }).sort((a, b) => {
    if (a.last === null && b.last === null) return a.displayName.localeCompare(b.displayName);
    if (a.last === null) return -1;
    if (b.last === null) return 1;
    return a.last < b.last ? -1 : 1;
  });
  const maps = mapsDirectionsUrl(route.filter((row) => picked.includes(row.id) && row.city).map((row) => row.city as string));
  const account = accounts.find((row) => row.id === accountId) ?? null;

  async function checkIn() {
    if (!account) return;
    const json = await trySend({
      label: 'Check in',
      path: '/api/admin/crm/visits',
      method: 'POST',
      body: { brand, accountId: account.id, outcome, notes, latitude: coords?.latitude, longitude: coords?.longitude },
    });
    const visit = json?.visit as { id?: string } | undefined;
    if (visit?.id) setVisitId(visit.id);
  }

  async function addLocation() {
    if (!navigator.geolocation) { setMessage('Location is not available on this phone.'); return; }
    navigator.geolocation.getCurrentPosition((pos) => {
      setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      setMessage('Location will be saved with check in.');
    }, () => setMessage('Location was not added.'));
  }

  async function uploadPhoto(file: File | undefined) {
    if (!file || !account) return;
    try {
      const blob = await stripPhoto(file);
      const signed = await send('/api/admin/crm/media', 'POST', { brand, accountId: account.id, visitId, kind: 'shelf_photo', contentType: 'image/jpeg', byteSize: blob.size });
      if (typeof signed.uploadUrl === 'string') {
        const put = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: blob });
        if (!put.ok) throw new Error('upload');
      }
      setMessage('');
    } catch {
      setMessage('Not saved yet, retry');
    }
  }

  async function recordVoice() {
    if (!account) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    const started = Date.now();
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      const durationSeconds = Math.round((Date.now() - started) / 1000);
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      try {
        const contentType = blob.type.includes('mp4') ? 'audio/mp4' : 'audio/webm';
        const signed = await send('/api/admin/crm/media', 'POST', { brand, accountId: account.id, visitId, kind: 'voice_note', contentType, byteSize: blob.size, durationSeconds });
        if (typeof signed.uploadUrl === 'string') {
          const put = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'content-type': contentType }, body: blob });
          if (!put.ok) throw new Error('upload');
        }
        setMessage('');
      } catch {
        setMessage('Not saved yet, retry');
      }
    };
    recorder.start();
    setRecorder(recorder);
    window.setTimeout(() => { if (recorder.state !== 'inactive') recorder.stop(); }, 120_000);
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-editorial flex-col gap-4 px-page-margin-mobile py-6">
      <header className="flex flex-col gap-3">
        <p className="font-sans text-eyebrow-m font-medium uppercase text-cedar">Field</p>
        <h1 className="font-display text-heading-m-m text-primary">{brandLabel(brand)}</h1>
        <p className="font-mono text-specimen text-tertiary">{label}</p>
        <div className="flex flex-wrap gap-2">
          {brands.map((item) => (
            <button key={item} type="button" onClick={() => setBrand(item)} className={item === brand ? solid : tap}>{brandLabel(item)}</button>
          ))}
        </div>
        <Link href="/admin/crm" className="min-h-[44px] font-mono text-specimen uppercase text-primary">Desk</Link>
      </header>
      {message ? <p role="status" className="border border-attention px-3 py-3 text-body-m text-primary">{message}</p> : null}
      {pending.length ? <button type="button" onClick={retry} className={solid}>Not saved yet, retry</button> : null}

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-heading-s text-primary">Today</h2>
        <NextActions brand={brand} />
        {tasks.length === 0 ? <p className="text-body-m text-secondary">No open tasks for this session.</p> : tasks.map((task) => (
          <p key={task.id} className="border border-hairline bg-clinical px-3 py-3 text-body-m text-primary">{task.title}{task.dueOn ? `. Due ${task.dueOn}` : ''}</p>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-heading-s text-primary">Route</h2>
        <label className="flex flex-col gap-1 text-caption text-tertiary">Region
          <select value={region} onChange={(event) => { setRegion(event.target.value); setPicked([]); }} className="min-h-[44px] border border-hairline bg-clinical px-3 text-body-m text-primary">
            <option value="">Choose</option>
            {regions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        {route.map((row) => (
          <label key={row.id} className="flex min-h-[44px] items-center gap-3 border border-hairline bg-clinical px-3">
            <input type="checkbox" checked={picked.includes(row.id)} onChange={(event) => setPicked((current) => event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id))} />
            <button type="button" onClick={() => setAccountId(row.id)} className="flex-1 text-left text-body-m text-primary">{row.displayName}. {row.days === null ? 'Never visited' : `${row.days} days`}</button>
          </label>
        ))}
        {maps ? <a href={maps} className={`${solid} text-center`} target="_blank" rel="noreferrer">Open route in Maps</a> : null}
      </section>

      {account ? (
        <section className="flex flex-col gap-3 border border-hairline bg-clinical p-3">
          <h2 className="font-display text-heading-s text-primary">{account.displayName}</h2>
          <div className="grid grid-cols-2 gap-2">
            {VISIT_OUTCOMES.map((item) => (
              <button key={item} type="button" onClick={() => setOutcome(item)} className={outcome === item ? solid : tap}>{VISIT_OUTCOME_LABELS[item]}</button>
            ))}
          </div>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} className="min-h-[88px] border border-hairline bg-clinical px-3 py-3 text-body-m text-primary" placeholder="Notes" />
          <button type="button" onClick={checkIn} className={solid}>Check in</button>
          <button type="button" onClick={addLocation} className={tap}>Add my location</button>
          <label className={tap}>Add shelf photo
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => uploadPhoto(event.target.files?.[0])} />
          </label>
          {recorder ? <button type="button" onClick={() => { recorder.stop(); setRecorder(null); }} className={solid}>Stop voice note</button> : <button type="button" onClick={recordVoice} className={tap}>Record voice note</button>}
          <form onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            await trySend({ label: 'Samples', path: '/api/admin/crm/samples', method: 'POST', body: { brand, accountId: account.id, visitId, productLine: String(data.get('productLine')), quantityUnits: Number(data.get('quantityUnits')), leftOn: String(data.get('leftOn')), followUpOn: String(data.get('followUpOn')), notes: String(data.get('notes') || '') } });
          }} className="flex flex-col gap-2">
            <h3 className="font-display text-body-l text-primary">Log samples left</h3>
            <select name="productLine" className="min-h-[44px] border border-hairline bg-clinical px-3 text-body-m">{PRODUCT_LINES.map((line) => <option key={line} value={line}>{PRODUCT_LINE_LABELS[line]}</option>)}</select>
            <input name="quantityUnits" inputMode="numeric" required placeholder="Units" className="min-h-[44px] border border-hairline bg-clinical px-3 text-body-m" />
            <input name="leftOn" type="date" required defaultValue={today} className="min-h-[44px] border border-hairline bg-clinical px-3 text-body-m" />
            <input name="followUpOn" type="date" required className="min-h-[44px] border border-hairline bg-clinical px-3 text-body-m" />
            <input name="notes" placeholder="Notes" className="min-h-[44px] border border-hairline bg-clinical px-3 text-body-m" />
            <button type="submit" className={solid}>Save samples</button>
          </form>
          <button type="button" disabled={!visitId} onClick={() => trySend({ label: 'Check out', path: '/api/admin/crm/visits', method: 'PATCH', body: { brand, visitId } })} className={solid}>Check out</button>
        </section>
      ) : null}
      <p className="text-caption text-tertiary">Session {actorId}. A failed visit stays on this screen until you retry. Nothing is written to this phone.</p>
    </div>
  );
}
