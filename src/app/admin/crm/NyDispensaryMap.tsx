'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { NY_REGIONS, type NyRegion } from '@/lib/crm/nyRegions';
import {
  cityChoices,
  COUNTY_DRAWS,
  countyChoices,
  countyFrame,
  declutterPins,
  framePoints,
  CITY_MENU_LABEL,
  COUNTY_MENU_LABEL,
  clusterFrame,
  clusterMembers,
  hitAt,
  markerUnits,
  mergeGap,
  nextZoomView,
  nycFrame,
  dispensaryCard,
  placePins,
  wholeStateFrame,
  type MapChoice,
  type MapPin,
  type PinCluster,
  type PlacedPin,
} from '@/lib/crm/nyMap';
import { contactMailHref, contactTelHref } from '@/lib/crm/pinCard';

const REGION_TONE = [0.06, 0.09, 0.12, 0.15, 0.18, 0.22, 0.26, 0.3, 0.34, 0.4];
const WHOLE = wholeStateFrame();

export function NyDispensaryMap({ pins, unmapped, brand = 'cedargrowth', onOpenAccount }: { pins: MapPin[]; unmapped: number; brand?: 'cedargrowth' | 'bond'; onOpenAccount: (id: string) => void }) {
  const [view, setView] = useState(WHOLE);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [litIds, setLitIds] = useState<ReadonlySet<string>>(() => new Set());
  const [outline, setOutline] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; viewX: number; viewY: number; pointer: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [svgWidth, setSvgWidth] = useState(0);
  const [openCluster, setOpenCluster] = useState<PinCluster | null>(null);
  const [cardId, setCardId] = useState<string | null>(null);
  const [cardToken, setCardToken] = useState(0);
  const [record, setRecord] = useState<ReturnType<typeof dispensaryCard> | null>(null);
  const [recordNote, setRecordNote] = useState('');
  const cardRef = useRef<HTMLDivElement>(null);
  const placed = useMemo(() => placePins(pins).placed, [pins]);
  const units = markerUnits(view.w, svgWidth);
  const grouped = useMemo(() => declutterPins(placed, mergeGap(view.w, svgWidth), svgWidth > 0 ? { viewWidth: view.w, svgClientWidth: svgWidth } : undefined), [placed, view.w, svgWidth]);
  const zoomed = view.w < WHOLE.w - 0.5;

  useEffect(() => {
    const node = svgRef.current;
    if (!node) return;
    const blockPinch = (event: Event) => event.preventDefault();
    const blockCtrlWheel = (event: WheelEvent) => {
      if (event.ctrlKey) event.preventDefault();
    };
    node.addEventListener('gesturestart', blockPinch);
    node.addEventListener('gesturechange', blockPinch);
    node.addEventListener('wheel', blockCtrlWheel, { passive: false });
    const measure = () => setSvgWidth(node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      observer.disconnect();
      node.removeEventListener('gesturestart', blockPinch);
      node.removeEventListener('gesturechange', blockPinch);
      node.removeEventListener('wheel', blockCtrlWheel);
    };
  }, []);

  const queueReturn = useCallback((ids: string[]) => {
    window.setTimeout(() => {
      const node = svgRef.current;
      if (!node || !ids.length) return;
      const wanted = new Set(ids);
      const chip = grouped.clusters.find((cluster) => cluster.pins.length === ids.length && cluster.pins.every((pin) => wanted.has(pin.id)));
      const chipKey = chip ? chip.pins.map((pin) => pin.id).join(':') : null;
      const markers = [...node.querySelectorAll<SVGRectElement>('[data-hit]')];
      const chipMarker = chipKey ? markers.find((marker) => marker.getAttribute('data-hit') === chipKey) : undefined;
      const memberMarker = ids.map((id) => markers.find((marker) => marker.getAttribute('data-hit') === id)).find((marker) => marker);
      (chipMarker ?? memberMarker)?.focus({ preventScroll: true });
    }, 0);
  }, [grouped]);

  useEffect(() => {
    if (!openCluster) return;
    listRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const ids = openCluster.pins.map((pin) => pin.id);
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpenCluster(null);
      queueReturn(ids);
    }
    function onDown(event: MouseEvent) {
      const target = event.target;
      if (listRef.current?.contains(target as Node)) return;
      if (target instanceof Element && target.closest('[data-pin="cluster"]')) return;
      setOpenCluster(null);
      queueReturn(ids);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onDown);
    };
  }, [openCluster, grouped, queueReturn]);

  function openDispensary(id: string) {
    setOpenCluster(null);
    setCardToken((value) => value + 1);
    setCardId(id);
  }

  function closeCard() {
    const id = cardId;
    setCardId(null);
    setRecord(null);
    if (id) queueReturn([id]);
  }

  useEffect(() => {
    if (!cardId) return;
    let cancel = false;
    setRecord(null);
    setRecordNote('');
    const headers = { 'x-cedargrowth-crm': '1' };
    const accountUrl = `/api/admin/crm/accounts/${encodeURIComponent(cardId)}?brand=${encodeURIComponent(brand)}`;
    const contactUrl = `/api/admin/crm/contacts?brand=${encodeURIComponent(brand)}&accountId=${encodeURIComponent(cardId)}&card=1`;
    Promise.all([
      fetch(accountUrl, { headers, credentials: 'same-origin' }).then((res) => res.json()),
      fetch(contactUrl, { headers, credentials: 'same-origin' }).then((res) => res.json()),
    ]).then(([accountBody, contactsBody]: [{ ok?: boolean; account?: AccountRow }, { ok?: boolean; contacts?: ContactRow[] }]) => {
      if (cancel) return;
      if (accountBody.ok !== true || !accountBody.account) { setRecordNote('This dispensary could not be read.'); return; }
      if (contactsBody.ok !== true) { setRecordNote('This dispensary could not be read.'); return; }
      setRecord(dispensaryCard(accountBody.account, contactsBody.contacts || []));
    }).catch(() => { if (!cancel) setRecordNote('This dispensary could not be read.'); });
    return () => { cancel = true; };
  }, [cardId, cardToken, brand]);

  useEffect(() => {
    if (!cardId) return;
    const id = cardId;
    cardRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setCardId(null);
      setRecord(null);
      queueReturn([id]);
    }
    function onClick(event: MouseEvent) {
      const target = event.target;
      if (cardRef.current?.contains(target as Node)) return;
      if (target instanceof Element && target.closest('[data-pin]')) return;
      setCardId(null);
      setRecord(null);
      queueReturn([id]);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, [cardId, queueReturn]);

  function showCluster(cluster: PinCluster) {
    setOpenCluster(cluster);
    setView(clusterFrame(cluster.pins, WHOLE));
  }

  function closeList() {
    const ids = openCluster?.pins.map((pin) => pin.id) ?? [];
    setOpenCluster(null);
    queueReturn(ids);
  }

  function zoomBy(direction: 1 | -1) {
    setView((current) => nextZoomView(current, direction, WHOLE));
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="relative min-w-0 border border-hairline bg-parchment">
        <div className="grid grid-cols-2 gap-2 p-2 md:flex md:flex-wrap">
          <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1)} className="min-h-[44px] min-w-[44px] w-full border border-ink bg-clinical font-mono text-specimen text-primary md:w-auto">+</button>
          <button type="button" aria-label="Zoom out" onClick={() => zoomBy(-1)} className="min-h-[44px] min-w-[44px] w-full border border-ink bg-clinical font-mono text-specimen text-primary md:w-auto">-</button>
          <MapMenu
            id="city-menu"
            label={CITY_MENU_LABEL}
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
            label={COUNTY_MENU_LABEL}
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
        {openCluster ? (
          <div ref={listRef} role="dialog" aria-label={`${openCluster.count} dispensaries`} className="fixed inset-x-0 bottom-0 z-30 max-h-[70vh] overflow-y-auto border-t border-ink bg-clinical p-3 md:absolute md:inset-x-auto md:bottom-auto md:left-2 md:top-16 md:z-10 md:max-h-64 md:w-[min(18rem,calc(100%-1rem))] md:border md:p-0">
            <div className="mb-2 flex items-start justify-between gap-2">
              <p className="font-mono text-specimen uppercase text-tertiary">{openCluster.count} dispensaries</p>
              <button type="button" aria-label="Close" onClick={closeList} className="flex min-h-[44px] min-w-[44px] items-center justify-center border border-ink text-primary"><X strokeWidth={1.5} className="h-4 w-4" aria-hidden="true" /></button>
            </div>
            <ul>
              {clusterMembers(openCluster.pins).map((row) => (
                <li key={row.id}>
                  <button type="button" onClick={() => openDispensary(row.id)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); openDispensary(row.id); } }} className="flex min-h-[44px] w-full flex-col items-start justify-center px-3 py-2 text-left">
                    <span className="text-body-m text-primary">{row.name}</span>
                    <span className="text-caption text-secondary">{row.place}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {cardId ? (
          <div ref={cardRef} role="dialog" aria-label={record?.name || 'Dispensary'} className="fixed inset-x-0 bottom-0 z-30 max-h-[70vh] overflow-y-auto border-t border-ink bg-clinical p-3 md:absolute md:inset-x-auto md:bottom-auto md:left-2 md:top-16 md:z-10 md:max-h-80 md:w-[min(22rem,calc(100%-1rem))] md:border md:p-3">
            <div className="mb-2 flex items-start justify-between gap-2">
              <h2 className="font-display text-body-l text-primary">{record?.name || 'Dispensary'}</h2>
              <button type="button" aria-label="Close" onClick={closeCard} className="flex min-h-[44px] min-w-[44px] items-center justify-center border border-ink text-primary"><X strokeWidth={1.5} className="h-4 w-4" aria-hidden="true" /></button>
            </div>
            {recordNote ? <p className="text-body-m text-secondary">{recordNote}</p> : null}
            {!record && !recordNote ? <p className="text-caption text-tertiary">Loading the dispensary.</p> : null}
            {record ? <DispensaryInfoCard model={record} onOpen={() => onOpenAccount(cardId)} /> : null}
          </div>
        ) : null}
        <svg
          ref={svgRef}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="New York dispensary map"
          className="block w-full min-w-0 bg-parchment"
          style={{ aspectRatio: `${WHOLE.w} / ${WHOLE.h}`, touchAction: zoomed ? 'none' : 'pan-y' }}
          onDoubleClick={(event) => event.preventDefault()}
          onClick={(event) => {
            const node = svgRef.current;
            if (!node) return;
            const rect = node.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            const x = view.x + ((event.clientX - rect.left) / rect.width) * view.w;
            const y = view.y + ((event.clientY - rect.top) / rect.height) * view.h;
            const markers = [
              ...grouped.singles.map((pin) => ({ id: pin.id, x: pin.x, y: pin.y, halfW: Math.max(units.visible, units.target) / 2, halfH: Math.max(units.visible, units.target) / 2 })),
              ...grouped.clusters.map((cluster) => {
                const label = String(cluster.count);
                const textSize = units.visible * 0.5;
                const chipW = Math.max(units.visible * 1.8, label.length * textSize * 0.65 + textSize * 0.5);
                const chipH = Math.max(textSize * 1.8, units.visible);
                return { id: cluster.pins.map((pin) => pin.id).join(':'), x: cluster.x, y: cluster.y, halfW: Math.max(chipW, units.target) / 2, halfH: Math.max(chipH, units.target) / 2 };
              }),
            ];
            const id = hitAt(markers, x, y);
            if (!id) return;
            const pin = grouped.singles.find((item) => item.id === id);
            if (pin) { openDispensary(pin.id); return; }
            const cluster = grouped.clusters.find((item) => item.pins.map((member) => member.id).join(':') === id);
            if (cluster) showCluster(cluster);
          }}
          onPointerDown={(event) => {
            if (!zoomed || (event.target as Element).closest('[data-pin]')) return;
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
          {grouped.clusters.map((cluster) => {
            const label = String(cluster.count);
            const textSize = units.visible * 0.5;
            const chipW = Math.max(units.visible * 1.8, label.length * textSize * 0.65 + textSize * 0.5);
            const chipH = Math.max(textSize * 1.8, units.visible);
            const hitW = Math.max(chipW, units.target);
            const hitH = Math.max(chipH, units.target);
            return (
              <g key={cluster.pins.map((pin) => pin.id).join(':')}>
                <rect
                  data-pin="cluster"
                  data-hit={cluster.pins.map((pin) => pin.id).join(':')}
                  x={cluster.x - hitW / 2}
                  y={cluster.y - hitH / 2}
                  width={hitW}
                  height={hitH}
                  fill="transparent"
                  className="cursor-pointer"
                  tabIndex={0}
                  role="button"
                  aria-label={`${cluster.count} dispensaries`}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showCluster(cluster); } }}
                />
                <rect x={cluster.x - chipW / 2} y={cluster.y - chipH / 2} width={chipW} height={chipH} fill="rgb(var(--surface-ink))" className="pointer-events-none" />
                <text x={cluster.x} y={cluster.y} textAnchor="middle" dominantBaseline="central" fill="rgb(var(--text-inverse))" fontSize={textSize} className="pointer-events-none font-mono">{label}</text>
              </g>
            );
          })}
          {grouped.singles.map((pin) => {
            const selected = pin.id === activeId;
            const lit = litIds.has(pin.id);
            const size = selected || lit ? units.visible * 1.35 : units.visible;
            const hit = Math.max(size, units.target);
            return (
              <g key={pin.id}>
                <rect
                  data-pin="account"
                  data-hit={pin.id}
                  x={pin.x - hit / 2}
                  y={pin.y - hit / 2}
                  width={hit}
                  height={hit}
                  fill="transparent"
                  className="cursor-pointer"
                  tabIndex={0}
                  role="button"
                  aria-label={pin.displayName}
                  onMouseEnter={() => setActiveId(pin.id)}
                  onFocus={() => setActiveId(pin.id)}
                  onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDispensary(pin.id); } }}
                />
                <rect
                  x={pin.x - size / 2}
                  y={pin.y - size / 2}
                  width={size}
                  height={size}
                  fill={selected ? 'rgb(var(--accent-cedar))' : lit ? 'rgb(var(--surface-ink))' : 'rgb(var(--surface-clinical))'}
                  stroke="rgb(var(--surface-ink))"
                  strokeWidth={selected ? view.w / 280 : view.w / 500}
                  className="pointer-events-none"
                />
              </g>
            );
          })}
        </svg>
      </div>
      <aside className="flex flex-col gap-3 border border-hairline bg-clinical p-3">
        <p className="text-body-m text-secondary">Select a dispensary to open its card.</p>
        <p className="text-caption text-tertiary">{unmapped} accounts not yet on the map.</p>
      </aside>
    </div>
  );
}

function MapMenu({ id, label, placeholder, options, onPick }: { id: string; label: string; placeholder: string; options: (query: string) => MapChoice[]; onPick: (choice: MapChoice) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
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
    <div ref={root} className="relative w-full md:w-auto">
      <button ref={button} type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`} onClick={() => (open ? hide() : show())} className="min-h-[44px] w-full border border-ink bg-clinical px-3 font-mono text-specimen uppercase text-primary md:w-auto">{label}</button>
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

export function DispensaryInfoCard({ model, onOpen }: { model: ReturnType<typeof dispensaryCard>; onOpen: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <dl className="flex flex-col gap-2">
        {model.lines.map((line) => (
          <div key={line.label}>
            <dt className="font-mono text-specimen uppercase tracking-specimen text-tertiary">{line.label}</dt>
            <dd className="text-body-m text-primary">{line.value}</dd>
          </div>
        ))}
      </dl>
      <h3 className="font-display text-body-l text-primary">Contacts</h3>
      {model.contacts.length === 0 ? <p className="text-body-m text-secondary">No contacts yet</p> : (
        <ul className="flex flex-col gap-3">
          {model.contacts.map((person) => {
            const mail = contactMailHref(person.email, person.preference);
            const phone = contactTelHref(person.phone, person.preference);
            return (
              <li key={person.id} className="flex flex-col gap-1">
                <p className="text-body-m text-primary">{person.name}</p>
                {person.title ? <p className="text-caption text-secondary">{person.title}</p> : null}
                {person.email ? (mail ? <a href={mail} className="min-h-[44px] text-body-m text-primary underline">{person.email}</a> : <p className="min-h-[44px] text-body-m text-primary">{person.email}</p>) : null}
                {person.phone ? (phone ? <a href={phone} className="min-h-[44px] text-body-m text-primary underline">{person.phone}</a> : <p className="min-h-[44px] text-body-m text-primary">{person.phone}</p>) : null}
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" onClick={onOpen} className="min-h-[44px] border border-ink px-3 py-2 font-mono text-specimen uppercase text-primary">Open record</button>
    </div>
  );
}

type AccountRow = { id: string; displayName?: string | null; licenseRef?: string | null; accountType?: string | null; ocmStatus?: 'verified' | 'unverified' | null; street?: string | null; city?: string | null; postalCode?: string | null; county?: string | null; status?: string | null; assignedRep?: string | null };
type ContactRow = { id: string; accountId: string; name: string; title?: string | null; email?: string | null; phone?: string | null; preference?: string | null };
