'use client';

import { useEffect, useState } from 'react';
import type { CrmBrand } from '@/lib/crm/engine';
import { NY_REGIONS, TILES } from '@/lib/crm/nyRegions';
import { NEEDS_HOODIE } from '@/lib/crm/nyRegions';

type Tile = { region: string; value: number | null; text: string; unassigned: boolean; rep: string | null };
type Body = {
  ok?: boolean;
  reason?: string;
  tiles?: Tile[];
  invoicedLabel?: string;
  unknown?: { id: string; displayName: string; county: string | null }[];
  coverage?: { region: string; label: string }[];
  coverageSource?: string;
  marketShare?: string;
  territories?: { region: string; repActor: string }[];
};

const METRICS = [
  { id: 'accounts', label: 'Accounts' },
  { id: 'active', label: 'Active accounts' },
  { id: 'pipeline', label: 'Open pipeline (forecast)' },
  { id: 'invoiced', label: 'Invoiced (Nabis)' },
  { id: 'visits', label: 'Visits in 30 days' },
] as const;

async function crmFetch(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set('x-cedargrowth-crm', '1');
  if (init?.body) headers.set('content-type', 'application/json');
  const res = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body: body as Body & Record<string, unknown> };
}

export function TerritoryMap({ brand, canAssign, territory, onSelect }: { brand: CrmBrand; canAssign: boolean; territory: string; onSelect: (region: string) => void }) {
  const [metric, setMetric] = useState<(typeof METRICS)[number]['id']>('accounts');
  const [data, setData] = useState<Body | null>(null);
  const [notice, setNotice] = useState('');
  const [rep, setRep] = useState('');
  const [region, setRegion] = useState<string>(NY_REGIONS[0]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancel = false;
    crmFetch(`/api/admin/crm/territory?brand=${brand}&metric=${metric}`).then((res) => {
      if (cancel) return;
      if (res.body.ok !== true) setNotice(typeof res.body.reason === 'string' ? res.body.reason : 'Territory could not be read.');
      else { setData(res.body); setNotice(''); }
    }).catch(() => { if (!cancel) setNotice('Territory could not be read.'); });
    return () => { cancel = true; };
  }, [brand, metric, tick]);

  const max = Math.max(1, ...(data?.tiles || []).map((tile) => tile.value || 0));
  async function assign(event: React.FormEvent) {
    event.preventDefault();
    const res = await crmFetch('/api/admin/crm/territory', { method: 'PUT', body: JSON.stringify({ brand, region, repActor: rep }) });
    setNotice(res.body.ok === true ? 'Territory saved.' : String(res.body.reason || 'Territory was not saved.'));
    if (res.body.ok === true) setTick((value) => value + 1);
  }

  return (
    <section className="flex flex-col gap-4 border border-hairline bg-clinical p-4">
      <div className="flex flex-wrap gap-2">
        {METRICS.map((item) => (
          <button key={item.id} type="button" onClick={() => setMetric(item.id)} className={`min-h-[44px] border px-3 py-2 font-mono text-specimen uppercase ${metric === item.id ? 'border-ink bg-ink text-inverse' : 'border-ink text-primary'}`}>{item.label}</button>
        ))}
      </div>
      <p className="text-caption text-tertiary">{metric === 'invoiced' ? (data?.invoicedLabel || 'No Nabis data imported.') : metric === 'pipeline' ? 'Amounts are forecast.' : 'Region comes from the account county.'}</p>
      {notice ? <p role="status" className="text-body-m text-primary">{notice}</p> : null}
      <svg viewBox="0 0 620 490" role="img" aria-label="New York territory map" className="w-full max-w-editorial bg-parchment">
        {(data?.tiles || TILES.map((tile) => ({ region: tile.region, value: null, text: 'no data yet', unassigned: false, rep: null }))).map((tile) => {
          const spot = TILES.find((item) => item.region === tile.region);
          if (!spot) return null;
          const depth = tile.value === null ? 0.05 : 0.12 + (0.55 * (tile.value / max));
          const selected = territory === tile.region;
          return (
            <g key={tile.region} onClick={() => onSelect(tile.region)} className="cursor-pointer">
              <rect x={spot.x} y={spot.y} width="110" height="110" fill={`rgb(var(--surface-ink) / ${depth})`} stroke={selected ? 'rgb(var(--surface-ink))' : 'rgb(var(--line-hairline))'} strokeWidth={selected ? 2 : 1} />
              <text x={spot.x + 8} y={spot.y + 22} fill="rgb(var(--text-primary))" className="font-sans" fontSize="11">{tile.region}</text>
              <text x={spot.x + 8} y={spot.y + 64} fill="rgb(var(--text-primary))" className="font-mono" fontSize="16">{tile.text}</text>
              {tile.unassigned ? <text x={spot.x + 8} y={spot.y + 96} fill="rgb(var(--text-primary))" fontSize="11">No rep</text> : null}
            </g>
          );
        })}
      </svg>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="font-mono text-specimen uppercase text-tertiary">
            <th className="border-b border-hairline py-2">Region</th>
            <th className="border-b border-hairline py-2">Value</th>
            <th className="border-b border-hairline py-2">Coverage</th>
            <th className="border-b border-hairline py-2">Dollar share</th>
            <th className="border-b border-hairline py-2">Rep</th>
          </tr>
        </thead>
        <tbody>
          {(data?.tiles || []).map((tile) => (
            <tr key={tile.region}>
              <td className="border-b border-hairline py-2 text-body-m text-primary">{tile.region}</td>
              <td className="border-b border-hairline py-2 font-mono text-data text-primary">{tile.text}</td>
              <td className="border-b border-hairline py-2 text-body-m text-primary">{data?.coverage?.find((row) => row.region === tile.region)?.label}</td>
              <td className="border-b border-hairline py-2 text-body-m text-primary">{data?.marketShare || NEEDS_HOODIE}</td>
              <td className="border-b border-hairline py-2 text-body-m text-primary">{tile.rep || (tile.unassigned ? 'No rep' : 'None')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-caption text-tertiary">{data?.coverageSource}</p>
      <p className="text-caption text-tertiary">Dollar market share: {data?.marketShare || NEEDS_HOODIE}.</p>
      {(data?.unknown || []).length ? (
        <div className="flex flex-col gap-1">
          <h3 className="font-display text-body-l text-primary">Region unknown</h3>
          {data?.unknown?.map((row) => <p key={row.id} className="text-body-m text-primary">{row.displayName}. County {row.county || 'not set'}.</p>)}
        </div>
      ) : null}
      {canAssign ? (
        <form onSubmit={assign} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-caption text-tertiary">Region
            <select value={region} onChange={(event) => setRegion(event.target.value)} className="min-h-[44px] border border-hairline bg-clinical px-3 text-body-m">{NY_REGIONS.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1 text-caption text-tertiary">Rep
            <input value={rep} onChange={(event) => setRep(event.target.value)} placeholder="Leave blank to clear" className="min-h-[44px] border border-hairline bg-clinical px-3 text-body-m" />
          </label>
          <button type="submit" className="min-h-[44px] border border-ink px-3 py-2 font-mono text-specimen uppercase text-primary">Assign</button>
        </form>
      ) : null}
    </section>
  );
}

export function NextActions({ brand }: { brand: CrmBrand }) {
  const [rows, setRows] = useState<{ rep: string; actions: { key: string; reason: string; href: string }[] }[]>([]);
  const [inactive, setInactive] = useState<{ title: string; reason: string }[]>([]);
  const [notice, setNotice] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancel = false;
    crmFetch(`/api/admin/crm/actions?brand=${brand}`).then((res) => {
      if (cancel) return;
      const body = res.body as { reps?: { rep: string; actions: { key: string; reason: string; href: string }[] }[]; inactive?: { title: string; reason: string }[] };
      setRows(body.reps || []);
      setInactive(body.inactive || []);
    }).catch(() => { if (!cancel) setNotice('Next actions could not be read.'); });
    return () => { cancel = true; };
  }, [brand, tick]);
  async function dismiss(repActor: string, actionKey: string, mode: 'done' | 'snooze') {
    const res = await crmFetch('/api/admin/crm/actions', { method: 'POST', body: JSON.stringify({ brand, repActor, actionKey, mode }) });
    setNotice(res.body.ok === true ? (mode === 'done' ? 'Marked done.' : 'Snoozed for 7 days.') : String(res.body.reason || 'The action was not updated.'));
    if (res.body.ok === true) setTick((value) => value + 1);
  }
  return (
    <div className="flex flex-col gap-3">
      {notice ? <p role="status" className="text-body-m text-primary">{notice}</p> : null}
      {rows.map((rep) => (
        <div key={rep.rep} className="flex flex-col gap-2">
          <h3 className="font-display text-body-l text-primary">{rep.rep}</h3>
          {rep.actions.length === 0 ? <p className="text-caption text-tertiary">No actions right now.</p> : rep.actions.map((action) => (
            <div key={action.key} className="flex flex-col gap-2 border border-hairline p-3">
              <a href={action.href} className="text-body-m text-primary">{action.reason}</a>
              <div className="flex gap-2">
                <button type="button" onClick={() => dismiss(rep.rep, action.key, 'done')} className="min-h-[44px] border border-ink px-3 py-2 font-mono text-specimen uppercase">Done</button>
                <button type="button" onClick={() => dismiss(rep.rep, action.key, 'snooze')} className="min-h-[44px] border border-ink px-3 py-2 font-mono text-specimen uppercase">Snooze 7 days</button>
              </div>
            </div>
          ))}
        </div>
      ))}
      <h3 className="font-display text-body-l text-primary">Not active yet</h3>
      {inactive.map((row) => <p key={row.title} className="text-body-m text-secondary">{row.title}: {row.reason}</p>)}
    </div>
  );
}
