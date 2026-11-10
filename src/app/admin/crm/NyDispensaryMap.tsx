'use client';

import { useMemo, useRef, useState } from 'react';
import { NY_REGIONS, type NyRegion } from '@/lib/crm/nyRegions';
import {
  clusterPins,
  COUNTY_DRAWS,
  MAP_HEIGHT,
  MAP_WIDTH,
  nycFrame,
  pinCard,
  placePins,
  type MapPin,
  type PlacedPin,
} from '@/lib/crm/nyMap';

const REGION_TONE = [0.06, 0.09, 0.12, 0.15, 0.18, 0.22, 0.26, 0.3, 0.34, 0.4];
const WHOLE = { x: -24, y: -24, w: MAP_WIDTH + 48, h: MAP_HEIGHT + 48 };

export function NyDispensaryMap({ pins, unmapped, onOpenAccount }: { pins: MapPin[]; unmapped: number; onOpenAccount: (id: string) => void }) {
  const [view, setView] = useState(WHOLE);
  const [activeId, setActiveId] = useState<string | null>(null);
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
          <button type="button" onClick={() => setView(nycFrame())} className="min-h-[44px] border border-ink bg-clinical px-3 font-mono text-specimen uppercase text-primary">New York City</button>
          <button type="button" onClick={() => setView(WHOLE)} className="min-h-[44px] border border-ink bg-clinical px-3 font-mono text-specimen uppercase text-primary">Whole state</button>
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
            return <path key={county.name} d={county.d} fill={`rgb(var(--surface-ink) / ${tone})`} stroke="rgb(var(--line-hairline))" strokeWidth={view.w / 900} />;
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
            const size = selected ? mark * 1.35 : mark;
            return (
              <rect
                key={pin.id}
                data-pin="account"
                x={pin.x - size / 2}
                y={pin.y - size / 2}
                width={size}
                height={size}
                fill={selected ? 'rgb(var(--accent-cedar))' : 'rgb(var(--surface-clinical))'}
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
