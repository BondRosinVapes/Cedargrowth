'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { NY_REGIONS, type NyRegion } from '@/lib/crm/nyRegions';
import {
  cityChoices,
  clusterPins,
  COUNTY_DRAWS,
  countyChoices,
  countyFrame,
  framePoints,
  MAP_HEIGHT,
  MAP_WIDTH,
  nycFrame,
  pinCard,
  placePins,
  type MapChoice,
  type MapPin,
  type PlacedPin,
} from '@/lib/crm/nyMap';

const REGION_TONE = [0.06, 0.09, 0.12, 0.15, 0.18, 0.22, 0.26, 0.3, 0.34, 0.4];
const WHOLE = { x: -24, y: -24, w: MAP_WIDTH + 48, h: MAP_HEIGHT + 48 };

export function NyDispensaryMap({ pins, unmapped, onOpenAccount }: { pins: MapPin[]; unmapped: number; onOpenAccount: (id: string) => void }) {
  const [view, setView] = useState(WHOLE);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [litIds, setLitIds] = useState<ReadonlySet<string>>(() => new Set());
  const [outline, setOutline] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; viewX: number; viewY: number; pointer: number } | null>(null);
  const placed = useMemo(() => placePins(pins).placed, [pins]);
  const cell = view.w / 28;
  const grouped = useMemo(() => clusterPins(placed, cell), [placed, cell]);
  const active = placed.find((pin) => pin.id === activeId) ?? null;
  const mark = Math.max(view.w / 90, 4);

  function zoomAt(factor: number, anchorX: number, anchorY: number) {
    setView((current) => {
      const nextW = Math.min(WHOLE.w, Math.max(WHOLE.w / 14, current.w / factor));
      const nextH = nextW * (current.h / current.w);
      const rx = (anchorX - current.x) / current.w;
      const ry = (anchorY - current.y) / current.h;
      return { x: anchorX - rx * nextW, y: anchorY - ry * nextH, w: nextW, h: nextH };
    });
  }

  function frameCluster(pinsInCluster: PlacedPin[]) {
    const left = Math.min(...pinsInCluster.map((pin) => pin.x));
    const right = Math.max(...pinsInCluster.map((pin) => pin.x));
    const top = Math.min(...pinsInCluster.map((pin) => pin.y));
    const bottom = Math.max(...pinsInCluster.map((pin) => pin.y));
    const w = Math.max((right - left) * 1.8, WHOLE.w / 14);
    const h = w * (WHOLE.h / WHOLE.w);
    setView({ x: (left + right) / 2 - w / 2, y: (top + bottom) / 2 - h / 2, w, h });
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="border border-hairline bg-parchment">
        <div className="flex flex-wrap gap-2 p-2">
          <button type="button" onClick={() => zoomAt(1.4, view.x + view.w / 2, view.y + view.h / 2)} className="min-h-[44px] min-w-[44px] border border-ink bg-clinical font-mono text-specimen text-primary">+</button>
          <button type="button" onClick={() => zoomAt(1 / 1.4, view.x + view.w / 2, view.y + view.h / 2)} className="min-h-[44px] min-w-[44px] border border-ink bg-clinical font-mono text-specimen text-primary">-</button>
          <MapMenu
            id="city-menu"
            label="New York City"
            placeholder="Search cities"
            options={(query) => cityChoices(placed, query)}
            onPick={(choice) => {
              if (choice.id === 'nyc') {
                setView(nycFrame());
                setLitIds(new Set(placed.filter((pin) => ['Bronx', 'Kings', 'New York', 'Queens', 'Richmond'].includes(pin.county || '')).map((pin) => pin.id)));
              } else {
                const matches = placed.filter((pin) => pin.city?.trim().toLowerCase() === choice.label.toLowerCase());
                const frame = framePoints(matches);
                if (frame) setView(frame);
                setLitIds(new Set(matches.map((pin) => pin.id)));
              }
              setOutline(null);
            }}
          />
          <MapMenu
            id="county-menu"
            label="Whole state"
            placeholder="Search counties"
            options={(query) => countyChoices(placed, query)}
            onPick={(choice) => {
              setLitIds(new Set());
              if (choice.id === 'state') {
                setView(WHOLE);
                setOutline(null);
                return;
              }
              const frame = countyFrame(choice.label);
              if (frame) setView(frame);
              setOutline(choice.label);
            }}
          />
        </div>
        <svg
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          role="img"
          aria-label="New York dispensary map"
          className="h-[28rem] w-full touch-none bg-parchment md:h-[36rem]"
          onWheel={(event) => {
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            const anchorX = view.x + ((event.clientX - rect.left) / rect.width) * view.w;
            const anchorY = view.y + ((event.clientY - rect.top) / rect.height) * view.h;
            zoomAt(event.deltaY < 0 ? 1.2 : 1 / 1.2, anchorX, anchorY);
          }}
          onPointerDown={(event) => {
            if ((event.target as Element).closest('[data-pin]')) return;
            drag.current = { x: event.clientX, y: event.clientY, viewX: view.x, viewY: view.y, pointer: event.pointerId };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            if (!start || start.pointer !== event.pointerId) return;
            const rect = event.currentTarget.getBoundingClientRect();
            setView((current) => ({
              ...current,
              x: start.viewX - ((event.clientX - start.x) / rect.width) * current.w,
              y: start.viewY - ((event.clientY - start.y) / rect.height) * current.h,
            }));
          }}
          onPointerUp={() => { drag.current = null; }}
        >
          {COUNTY_DRAWS.map((county) => {
            const tone = county.region === 'Region unknown' ? 0.04 : REGION_TONE[NY_REGIONS.indexOf(county.region as NyRegion)] ?? 0.08;
            const marked = outline === county.name;
            return <path key={county.name} d={county.d} fill={`rgb(var(--surface-ink) / ${tone})`} stroke={marked ? 'rgb(var(--surface-ink))' : 'rgb(var(--line-hairline))'} strokeWidth={marked ? view.w / 280 : view.w / 900} />;
          })}
          {grouped.clusters.map((cluster) => (
            <g key={`${cluster.x}-${cluster.y}`} data-pin="cluster">
              <rect
                x={cluster.x - mark}
                y={cluster.y - mark}
                width={mark * 2}
                height={mark * 2}
                fill="rgb(var(--surface-ink))"
                className="cursor-pointer"
                tabIndex={0}
                role="button"
                aria-label={`${cluster.count} dispensaries. Zoom in to separate them.`}
                onClick={() => frameCluster(cluster.pins)}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); frameCluster(cluster.pins); } }}
              />
              <text x={cluster.x} y={cluster.y} textAnchor="middle" dominantBaseline="central" fill="rgb(var(--text-inverse))" fontSize={mark} className="pointer-events-none font-mono">{cluster.count}</text>
            </g>
          ))}
          {grouped.singles.map((pin) => {
            const selected = pin.id === activeId;
            const lit = litIds.has(pin.id);
            const size = selected || lit ? mark * 1.35 : mark;
            return (
              <rect
                key={pin.id}
                data-pin="account"
                x={pin.x - size / 2}
                y={pin.y - size / 2}
                width={size}
                height={size}
                fill={selected ? 'rgb(var(--accent-cedar))' : lit ? 'rgb(var(--surface-ink))' : 'rgb(var(--surface-clinical))'}
                stroke="rgb(var(--surface-ink))"
                strokeWidth={selected ? view.w / 280 : view.w / 500}
                className="cursor-pointer"
                tabIndex={0}
                role="button"
                aria-label={pin.displayName}
                onMouseEnter={() => setActiveId(pin.id)}
                onFocus={() => setActiveId(pin.id)}
                onClick={() => onOpenAccount(pin.id)}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpenAccount(pin.id); } }}
              />
            );
          })}
        </svg>
      </div>
      <aside className="flex flex-col gap-3 border border-hairline bg-clinical p-3">
        {active ? <PinCard pin={active} onOpen={() => onOpenAccount(active.id)} /> : <p className="text-body-m text-secondary">Hover or focus a dispensary to see its record. Select it to open the account.</p>}
        <p className="text-caption text-tertiary">{unmapped} accounts not yet on the map.</p>
      </aside>
    </div>
  );
}

function MapMenu({ id, label, placeholder, options, onPick }: { id: string; label: string; placeholder: string; options: (query: string) => MapChoice[]; onPick: (choice: MapChoice) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [chosen, setChosen] = useState(label);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = options(query);
  const current = list.length ? Math.min(active, list.length - 1) : 0;

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.getElementById(`${id}-opt-${current}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, current, id]);

  function show() {
    setQuery('');
    setActive(0);
    setOpen(true);
    setTimeout(() => input.current?.focus(), 0);
  }

  function hide() {
    setOpen(false);
    button.current?.focus();
  }

  function pick(choice: MapChoice) {
    setChosen(choice.label);
    onPick(choice);
    hide();
  }

  function onKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => list.length ? (Math.min(index, list.length - 1) + 1) % list.length : 0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => list.length ? (Math.min(index, list.length - 1) - 1 + list.length) % list.length : 0);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (list[current]) pick(list[current]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      hide();
    }
  }

  return (
    <div ref={root} className="relative">
      <button ref={button} type="button" aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`} onClick={() => (open ? hide() : show())} className="min-h-[44px] border border-ink bg-clinical px-3 font-mono text-specimen uppercase text-primary">{chosen}</button>
      {open ? (
        <div className="absolute left-0 z-10 mt-1 w-[min(18rem,calc(100vw-2rem))] border border-ink bg-clinical">
          <input
            ref={input}
            role="combobox"
            aria-expanded={open}
            aria-controls={`${id}-list`}
            aria-autocomplete="list"
            aria-activedescendant={list[current] ? `${id}-opt-${current}` : undefined}
            value={query}
            placeholder={placeholder}
            onChange={(event) => { setQuery(event.target.value); setActive(0); }}
            onKeyDown={onKey}
            className="min-h-[44px] w-full border-b border-hairline bg-clinical px-3 text-body-m text-primary"
          />
          <ul id={`${id}-list`} role="listbox" aria-label={label} className="max-h-64 overflow-y-auto">
            {list.length ? list.map((choice, index) => (
              <li key={choice.id} id={`${id}-opt-${index}`} role="option" aria-selected={index === current}>
                <button type="button" onMouseEnter={() => setActive(index)} onClick={() => pick(choice)} className={`flex min-h-[44px] w-full items-center justify-between px-3 text-left text-body-m text-primary ${index === current ? 'bg-bone' : 'bg-clinical'}`}>
                  <span>{choice.label}</span>
                  <span className="font-mono text-specimen tabular-nums">{choice.count}</span>
                </button>
              </li>
            )) : <li className="px-3 py-2 text-caption text-tertiary">No matches.</li>}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function PinCard({ pin, onOpen }: { pin: PlacedPin; onOpen: () => void }) {
  return (
    <article className="flex flex-col gap-2">
      <h3 className="font-sans text-body-m text-primary">{pin.displayName}</h3>
      <dl className="flex flex-col gap-1">
        {pinCard(pin).map((row) => (
          <div key={row.label}>
            <dt className="font-mono text-specimen uppercase tracking-specimen text-tertiary">{row.label}</dt>
            <dd className={row.mono ? 'font-mono text-specimen text-primary' : 'text-caption text-primary'}>{row.value}</dd>
          </div>
        ))}
      </dl>
      <button type="button" onClick={onOpen} className="min-h-[44px] border border-ink px-3 py-2 font-mono text-specimen uppercase text-primary">Open account</button>
    </article>
  );
}
