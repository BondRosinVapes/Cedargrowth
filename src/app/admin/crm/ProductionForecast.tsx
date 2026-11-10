'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { PRODUCT_LINES, PRODUCT_LINE_LABELS, type CrmBrand, type ProductLine } from '@/lib/crm/engine';
import { useReveal } from '@/lib/reveal';
import {
  NO_CAPACITY,
  WEEKLY_PENDING,
  forecastStats,
  asOfLine,
  carriedForwardLabel,
  chartSeries,
  currentMonthStart,
  formatCapacity,
  formatUnits,
  heldIndex,
  lineFromSearch,
  loadForecastView,
  monthFromSearch,
  moveHeld,
  niceMax,
  productionHref,
  selectSpan,
  shiftMonth,
  yearWindowCaption,
  spanFromSearch,
  type ForecastBoard,
  type ForecastColumn,
  type ForecastLine,
  type ForecastPoint,
  type ForecastSpan,
  type ForecastStatus,
  type ForecastView,
} from '@/lib/crm/forecastClient';

const STATUS_LABEL: Record<ForecastStatus, string> = {
  ok: 'Ok',
  tight: 'Tight',
  short: 'Short',
  no_capacity: 'No capacity',
};

const CHIP: Record<ForecastStatus, string> = {
  ok: 'border-hairline text-tertiary',
  tight: 'border-attention/50 text-attention',
  short: 'border-fail/50 text-fail',
  no_capacity: 'border-hairline text-tertiary',
};

const SQUARE: Record<ForecastStatus, string> = {
  ok: 'bg-pass',
  tight: 'bg-attention',
  short: 'bg-fail',
  no_capacity: 'bg-tertiary',
};

const SPAN_LABEL: Record<ForecastSpan, string> = {
  week: 'Week',
  month: 'Month',
  year: 'Year',
};

function easeCedar(t: number): number {
  const cx = 0.66;
  const bx = 0.42 - cx;
  const ax = 1 - cx - bx;
  const cy = 3;
  const by = -cy;
  const ay = 1 - cy - by;
  const sampleX = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sampleY = (u: number) => ((ay * u + by) * u + cy) * u;
  let u = t;
  for (let i = 0; i < 6; i += 1) {
    const slope = (3 * ax * u + 2 * bx) * u + cx;
    if (Math.abs(slope) < 1e-6) break;
    u -= (sampleX(u) - t) / slope;
  }
  return sampleY(Math.min(1, Math.max(0, u)));
}

function CountFigure({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const played = useRef(false);
  useEffect(() => {
    if (played.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      played.current = true;
      setShown(value);
      return;
    }
    played.current = true;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 700);
      setShown(value * easeCedar(t));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{formatUnits(shown)}</>;
}

function plainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function StatusSquare({ status }: { status: ForecastStatus | null }) {
  if (!status) return <span className="inline-block h-1.5 w-1.5 border border-hairline" aria-hidden="true" />;
  return <span className={`inline-block h-1.5 w-1.5 ${SQUARE[status]}`} title={STATUS_LABEL[status]} aria-hidden="true" />;
}

function StatusChip({ status }: { status: ForecastStatus }) {
  return <span className={`inline-flex rounded-chip border px-2 py-0.5 font-mono text-specimen uppercase ${CHIP[status]}`}>{STATUS_LABEL[status]}</span>;
}

function demandText(value: number | null): string {
  return value === null ? 'Not returned' : formatUnits(value);
}

function ExtMark({ from }: { from: string | null }) {
  const text = carriedForwardLabel(from);
  return <span className="font-mono text-specimen lowercase tracking-normal text-tertiary" title={text} aria-label={text}>ext.</span>;
}

function CapacityValue({ value, source, from }: { value: number | null; source: ForecastColumn['capacitySource']; from: string | null }) {
  return (
    <span data-capacity={value === null ? 'none' : String(value)} data-capacity-source={source ?? 'unset'}>
      {formatCapacity(value)}
      {source === 'extended' && value !== null ? <> <ExtMark from={from} /></> : null}
    </span>
  );
}

function HeldFrame({ board, children }: { board: ForecastBoard; children: (held: number, onHold: (index: number) => void) => ReactNode }) {
  const key = board.columns.map((column) => column.id).join('|');
  const [seen, setSeen] = useState(key);
  const [held, setHeld] = useState(() => heldIndex(board.columns));
  if (seen !== key) {
    setSeen(key);
    setHeld(heldIndex(board.columns));
  }
  const safe = board.columns.length ? Math.min(held, board.columns.length - 1) : 0;
  return children(safe, setHeld);
}

function onArrow(event: KeyboardEvent, held: number, count: number, onHold: (index: number) => void) {
  const next = moveHeld(held, count, event.key);
  if (next === null) return;
  event.preventDefault();
  onHold(next);
}

function monthLong(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
}

function readoutColumn(board: ForecastBoard, index: number): ForecastColumn {
  const column = board.columns[index];
  const point = chartSeries(board)[index];
  if (!column || !point || point.capacityUnits === null) return column;
  const froms = [...new Set(board.lines.flatMap((line) => {
    const cell = line.points[index];
    return cell?.capacitySource === 'extended' && cell.carriedFrom ? [cell.carriedFrom] : [];
  }))];
  const demand = column.demand ?? 0;
  return {
    ...column,
    capacityUnits: point.capacityUnits,
    gap: Math.round((point.capacityUnits - demand) * 10) / 10,
    capacitySource: point.extended ? 'extended' : 'entered',
    carriedFrom: point.extended && froms.length === 1 ? froms[0] : null,
  };
}

function capacitySentence(column: ForecastColumn, weekly: boolean): string {
  if (column.capacityUnits === null) return 'No capacity entered.';
  const amount = formatCapacity(column.capacityUnits);
  const from = column.carriedFrom ? monthLong(column.carriedFrom) : monthLong(column.start);
  const lead = weekly ? `Capacity ${amount}, pro-rated from ${from}.` : `Capacity ${amount}.`;
  if (column.gap !== null && column.gap < 0) return `${lead} Short by ${formatUnits(Math.abs(column.gap))} units.`;
  if (column.capacitySource === 'extended') return `${lead} Carried forward from ${from}.`;
  if (column.gap !== null && column.gap > 0 && column.demand !== null && column.demand >= column.capacityUnits * 0.9) return `${lead} Tight.`;
  if (column.gap !== null && column.gap > 0) return `${lead} Spare room ${formatUnits(column.gap)} units.`;
  return lead;
}

function Readout({ column, label, weekly }: { column: ForecastColumn; label: string; weekly: boolean }) {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={`flex items-end gap-5 ${revealed ? 'prod-rise prod-in' : ''}`}>
      <p className="font-display text-[72px] leading-none tabular-nums text-primary md:text-[96px]" aria-live="polite">
        {column.demand === null ? 'None' : <CountFigure value={column.demand} />}
      </p>
      <div className="min-w-0 pb-2">
        <p className="font-mono text-specimen uppercase tracking-specimen text-tertiary">{column.kicker}</p>
        <p className="font-display text-heading-s text-primary">{label}</p>
        <p className="max-w-md text-caption text-secondary">{capacitySentence(column, weekly)}</p>
      </div>
    </div>
  );
}

function ForecastChart({ board, held, onHold, label }: { board: ForecastBoard; held: number; onHold: (index: number) => void; label: string }) {
  const series = chartSeries(board);
  const columns = board.columns.map((column, index) => ({
    ...column,
    demand: series[index]?.demand ?? 0,
    capacityUnits: series[index]?.capacityUnits ?? null,
    capacitySource: series[index]?.extended ? 'extended' as const : series[index]?.capacityUnits === null ? null : 'entered' as const,
  }));
  const { ref } = useReveal<HTMLDivElement>();
  const width = 960;
  const height = 150;
  const pad = { left: 44, right: 8, top: 12, bottom: 28 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const live = columns.some((column) => (column.demand ?? 0) > 0 || (column.capacityUnits ?? 0) > 0);
  const numbers = columns.flatMap((column) => [column.demand, column.capacityUnits].filter((value): value is number => typeof value === 'number' && value > 0));
  const yMax = niceMax(Math.max(1, ...numbers));
  const xAt = (index: number) => (columns.length <= 1 ? pad.left + plotW / 2 : pad.left + (index / (columns.length - 1)) * plotW);
  const yAt = (value: number) => pad.top + plotH - (value / yMax) * plotH;
  const colW = plotW / Math.max(columns.length, 1);
  const base = pad.top + plotH;
  function segments(kind: 'demand' | 'capacity') {
    const solid: string[] = [];
    const dotted: string[] = [];
    let prev: { x: number; y: number; extended: boolean } | null = null;
    columns.forEach((column, index) => {
      const value = kind === 'demand' ? column.demand : column.capacityUnits;
      if (typeof value !== 'number') {
        prev = null;
        return;
      }
      const point = { x: xAt(index), y: yAt(value), extended: kind === 'capacity' && column.capacitySource === 'extended' };
      if (prev) {
        const piece = `M${prev.x.toFixed(1)},${prev.y.toFixed(1)}L${point.x.toFixed(1)},${point.y.toFixed(1)}`;
        if (kind === 'capacity' && (point.extended || prev.extended)) dotted.push(piece);
        else solid.push(piece);
      }
      prev = point;
    });
    return { solid: solid.join(''), dotted: dotted.join('') };
  }
  const demand = segments('demand');
  const capacity = segments('capacity');
  const ticks = live ? [0, yMax / 2, yMax] : [0];
  const summary = columns.map((column) => {
    const carried = column.capacitySource === 'extended' ? ` ${carriedForwardLabel(column.carriedFrom)}` : '';
    return `${column.label} demand ${demandText(column.demand)}, capacity ${formatCapacity(column.capacityUnits)}${carried}`;
  }).join('. ');
  const heldColumn = columns[held];
  return (
    <div
      ref={ref}
      role="group"
      tabIndex={0}
      aria-label={label}
      onKeyDown={(event) => onArrow(event, held, columns.length, onHold)}
      className="min-w-0 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cedar"
    >
      {live ? null : <p className="mb-2 font-display text-body-m text-secondary">No weighted demand in this window</p>}
      <svg viewBox={`0 0 ${width} ${height}`} className="block h-[150px] w-full" role="img" aria-label={summary}>
        {live ? ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={yAt(tick)} y2={yAt(tick)} stroke="rgb(var(--line-hairline))" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <text x={pad.left - 6} y={yAt(tick) + 3} textAnchor="end" fill="rgb(var(--text-tertiary))" fontFamily="var(--font-mono)" fontSize="11">{formatUnits(tick)}</text>
          </g>
        )) : <line x1={pad.left} x2={width - pad.right} y1={base} y2={base} stroke="rgb(var(--line-hairline))" strokeWidth="1" />}
        {live && columns.length ? (
          <rect x={Math.max(pad.left, xAt(held) - colW / 2)} y={pad.top} width={Math.min(colW, plotW)} height={plotH} fill="rgb(var(--surface-bone))" />
        ) : null}
        {live ? <line x1={pad.left} x2={width - pad.right} y1={base} y2={base} stroke="rgb(var(--text-tertiary))" strokeWidth="1" vectorEffect="non-scaling-stroke" /> : null}
        {demand.solid ? <path d={demand.solid} fill="none" stroke="rgb(var(--accent-verdant))" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="miter" /> : null}
        {capacity.solid ? <path d={capacity.solid} fill="none" stroke="rgb(var(--surface-ink))" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinejoin="miter" /> : null}
        {capacity.dotted ? <path d={capacity.dotted} fill="none" stroke="rgb(var(--surface-ink))" strokeWidth="1" strokeDasharray="2 7" vectorEffect="non-scaling-stroke" strokeLinejoin="miter" /> : null}
        {columns.map((column, index) => (
          <g key={column.id}>
            {index === held && typeof column.demand === 'number' ? <rect x={xAt(index) - 3} y={yAt(column.demand) - 3} width="6" height="6" fill="rgb(var(--accent-verdant))" /> : null}
            {index === held && typeof column.capacityUnits === 'number' ? (
              <rect x={xAt(index) - 3} y={yAt(column.capacityUnits) - 3} width="6" height="6" fill="rgb(var(--surface-ink))">
                {column.capacitySource === 'extended' ? <title>{carriedForwardLabel(column.carriedFrom)}</title> : null}
              </rect>
            ) : null}
            <text x={index === 0 ? pad.left : index === columns.length - 1 ? width - pad.right : xAt(index)} y={height - 6} textAnchor={index === 0 ? 'start' : index === columns.length - 1 ? 'end' : 'middle'} fill={index === held ? 'rgb(var(--text-primary))' : 'rgb(var(--text-tertiary))'} fontFamily="var(--font-mono)" fontSize="10">{column.label}</text>
            <rect x={xAt(index) - colW / 2} y={pad.top} width={colW} height={plotH + 20} fill="transparent" onMouseEnter={() => onHold(index)} />
          </g>
        ))}
      </svg>
      {live ? (
        <ul className="mt-2 flex flex-wrap gap-6" aria-label="Chart legend">
          <li className="flex items-center gap-2 font-mono text-specimen uppercase tracking-specimen text-tertiary"><span className="inline-block h-px w-8 bg-verdant" aria-hidden="true" />Demand</li>
          <li className="flex items-center gap-2 font-mono text-specimen uppercase tracking-specimen text-tertiary"><span className="inline-block h-px w-8 bg-ink" aria-hidden="true" />Capacity</li>
          {columns.some((column) => column.capacitySource === 'extended') ? (
            <li className="flex items-center gap-2 font-mono text-specimen uppercase tracking-specimen text-tertiary"><span className="inline-block w-8 border-t border-dotted border-ink" aria-hidden="true" />Extended</li>
          ) : null}
        </ul>
      ) : null}
      {heldColumn?.capacitySource === 'extended' ? <p className="mt-1 font-mono text-specimen text-tertiary">{carriedForwardLabel(heldColumn.carriedFrom)}</p> : null}
    </div>
  );
}

function pointLabel(line: ForecastLine, column: ForecastColumn, point: ForecastPoint): string {
  const status = point.status ? STATUS_LABEL[point.status] : 'Not returned';
  const carried = point.capacitySource === 'extended' ? ` ${carriedForwardLabel(point.carriedFrom)}.` : '';
  return `${line.label}, ${column.label}. ${status}. Demand ${demandText(point.demand)}. Capacity ${formatCapacity(point.capacityUnits)}.${carried}`;
}

function LineMatrix({
  brand,
  board,
  held,
  onHold,
  onOpenLine,
  linkLines,
}: {
  brand: CrmBrand;
  board: ForecastBoard;
  held: number;
  onHold: (index: number) => void;
  onOpenLine?: (event: MouseEvent<HTMLAnchorElement>, line: ProductLine) => void;
  linkLines: boolean;
}) {
  return (
    <div
      className="hidden min-w-0 md:grid"
      style={{ gridTemplateColumns: `minmax(7.5rem, 9.5rem) repeat(${board.columns.length}, minmax(0, 1fr))` }}
      role="grid"
      aria-label="Product lines by period"
      onKeyDown={(event) => {
        const next = moveHeld(held, board.columns.length, event.key);
        if (next === null) return;
        event.preventDefault();
        onHold(next);
        document.getElementById(`forecast-period-${board.columns[next]?.id}`)?.focus();
      }}
    >
      <div />
      {board.columns.map((column, index) => (
        <button
          key={column.id}
          id={`forecast-period-${column.id}`}
          type="button"
          aria-pressed={index === held}
          onMouseEnter={() => onHold(index)}
          onFocus={() => onHold(index)}
          onClick={() => onHold(index)}
          className={`min-h-[44px] px-0.5 py-2 text-center font-mono text-[11px] leading-tight ${index === held ? 'bg-bone text-primary' : 'text-tertiary'}`}
        >
          <span className="block uppercase tracking-specimen">{column.label}</span>
          {column.dates ? <span className="mt-1 block tabular-nums">{column.dates}</span> : null}
        </button>
      ))}
      {board.lines.map((line, lineIndex) => (
        <div key={line.productLine} className="contents">
          {linkLines ? (
            <a
              href={productionHref({ brand, line: line.productLine })}
              onClick={(event) => onOpenLine?.(event, line.productLine)}
              className={`flex items-center border-t border-hairline py-3 pr-3 font-display text-[22px] leading-none text-primary ${lineIndex === board.lines.length - 1 ? 'border-b' : ''}`}
            >
              {line.label}
            </a>
          ) : (
            <div className={`flex items-center border-t border-hairline py-3 pr-3 font-display text-[22px] leading-none text-primary ${lineIndex === board.lines.length - 1 ? 'border-b' : ''}`}>{line.label}</div>
          )}
          {line.points.map((point, index) => (
            <button
              key={`${line.productLine}-${board.columns[index].id}`}
              type="button"
              aria-label={pointLabel(line, board.columns[index], point)}
              data-capacity={point.capacityUnits === null ? 'none' : String(point.capacityUnits)}
              onMouseEnter={() => onHold(index)}
              onFocus={() => onHold(index)}
              onClick={() => onHold(index)}
              className={`flex min-h-[52px] flex-col items-start justify-center gap-0.5 border-t border-hairline px-1 py-3 text-left ${lineIndex === board.lines.length - 1 ? 'border-b' : ''} ${index === held ? 'bg-bone' : ''}`}
            >
              <span className="font-mono text-[13px] tabular-nums leading-none text-primary">{demandText(point.demand)}</span>
              <span className="font-mono text-[12px] tabular-nums leading-none text-secondary">{point.capacityUnits === null ? 'No capacity entered' : `/ ${formatCapacity(point.capacityUnits)}`}</span>
              <span className="mt-1"><StatusSquare status={point.status} /></span>
              {point.capacitySource === 'extended' ? <ExtMark from={point.carriedFrom} /> : null}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function PhoneLines({
  brand,
  board,
  held,
  onHold,
  onOpenLine,
  linkLines,
}: {
  brand: CrmBrand;
  board: ForecastBoard;
  held: number;
  onHold: (index: number) => void;
  onOpenLine?: (event: MouseEvent<HTMLAnchorElement>, line: ProductLine) => void;
  linkLines: boolean;
}) {
  const column = board.columns[held];
  if (!column) return null;
  return (
    <div className="flex flex-col md:hidden">
      <div className="mb-3 flex gap-2">
        <button type="button" disabled={held === 0} onClick={() => onHold(held - 1)} className="min-h-[44px] flex-1 border border-hairline bg-clinical font-mono text-specimen uppercase tracking-specimen text-primary disabled:opacity-40">Previous</button>
        <button type="button" disabled={held >= board.columns.length - 1} onClick={() => onHold(held + 1)} className="min-h-[44px] flex-1 border border-hairline bg-clinical font-mono text-specimen uppercase tracking-specimen text-primary disabled:opacity-40">Next</button>
      </div>
      <ul>
        {board.lines.map((line) => {
          const point = line.points[held];
          const body = (
            <>
              <span className="flex items-center justify-between gap-3">
                <span className="font-display text-[22px] leading-none text-primary">{line.label}</span>
                <StatusSquare status={point?.status ?? null} />
              </span>
              <span className="font-mono text-data tabular-nums text-primary">Demand {demandText(point?.demand ?? null)}</span>
              <span className="font-mono text-data tabular-nums text-primary">Capacity <CapacityValue value={point?.capacityUnits ?? null} source={point?.capacitySource ?? null} from={point?.carriedFrom ?? null} /></span>
            </>
          );
          return (
            <li key={line.productLine} className="border-t border-hairline">
              {linkLines ? (
                <a href={productionHref({ brand, line: line.productLine })} onClick={(event) => onOpenLine?.(event, line.productLine)} className="flex min-h-[44px] flex-col gap-1 py-3">
                  {body}
                </a>
              ) : (
                <div className="flex min-h-[44px] flex-col gap-1 py-3">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function BoardView({
  brand,
  board,
  kicker,
  demandLabel,
  weekly,
  linkLines,
  onOpenLine,
}: {
  brand: CrmBrand;
  board: ForecastBoard;
  kicker: string;
  demandLabel: string;
  weekly: boolean;
  linkLines: boolean;
  onOpenLine?: (event: MouseEvent<HTMLAnchorElement>, line: ProductLine) => void;
}) {
  if (!board.columns.length) {
    return <p className="border border-hairline bg-clinical px-4 py-8 text-center text-body-m text-secondary">No forecast rows for this range.</p>;
  }
  return (
    <HeldFrame board={board}>
      {(held, onHold) => {
        return (
          <div className="flex min-w-0 flex-col gap-6">
            <div className="flex flex-col gap-6 lg:col-span-2 lg:grid lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)] lg:items-end">
            <Readout column={readoutColumn(board, held)} label={demandLabel} weekly={weekly} />
            <div className="hidden min-w-0 md:block">
              <ForecastChart board={board} held={held} onHold={onHold} label={kicker} />
            </div>
          </div>
            <LineMatrix brand={brand} board={board} held={held} onHold={onHold} onOpenLine={onOpenLine} linkLines={linkLines} />
            <PhoneLines brand={brand} board={board} held={held} onHold={onHold} onOpenLine={onOpenLine} linkLines={linkLines} />
          </div>
        );
      }}
    </HeldFrame>
  );
}

export function SpanControl({ span, onSpan }: { span: ForecastSpan; onSpan: (span: ForecastSpan) => void }) {
  return (
    <div role="radiogroup" aria-label="Forecast range" className="inline-flex border border-hairline">
      {(['week', 'month', 'year'] as const).map((item, index) => (
        <button
          key={item}
          type="button"
          role="radio"
          aria-checked={span === item}
          onClick={() => onSpan(selectSpan(span, item))}
          onKeyDown={(event) => {
            const next = selectSpan(span, event.key);
            if (next === span || (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
            event.preventDefault();
            onSpan(next);
          }}
          className={`min-h-[36px] px-3 font-mono text-specimen uppercase tracking-specimen ${index ? 'border-l border-hairline' : ''} ${span === item ? 'bg-ink text-inverse' : 'bg-transparent text-primary'}`}
        >
          {SPAN_LABEL[item]}
        </button>
      ))}
    </div>
  );
}

function StatsRow({ board }: { board: ForecastBoard }) {
  const stats = forecastStats(board.lines[0]?.points ?? []);
  const items = [
    ['Total demand', formatUnits(stats.totalDemand)],
    ['Periods short', String(stats.short)],
    ['Periods tight', String(stats.tight)],
    ['Periods without capacity', String(stats.noCapacity)],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="flex flex-col gap-1">
          <dd className="font-display text-[40px] leading-none tabular-nums text-primary">{value}</dd>
          <dt className="font-mono text-specimen uppercase tracking-specimen text-tertiary">{label}</dt>
        </div>
      ))}
    </dl>
  );
}

function PeriodBreakdown({ board }: { board: ForecastBoard }) {
  const line = board.lines[0];
  if (!line) return null;
  return (
    <div className="min-w-0">
      <h3 className="font-display text-heading-s text-primary">Period breakdown</h3>
      <ul className="md:hidden">
        {board.columns.map((column, index) => {
          const point = line.points[index];
          return (
            <li key={column.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-hairline py-2">
              <span className="w-24 font-mono text-specimen uppercase text-tertiary">{column.label}</span>
              <span className="font-mono text-data tabular-nums text-primary">{demandText(point?.demand ?? null)} / {point?.capacityUnits === null ? 'No capacity entered' : formatCapacity(point?.capacityUnits ?? null)}</span>
              {point?.capacitySource === 'extended' ? <ExtMark from={point.carriedFrom} /> : null}
              {point?.status ? <StatusChip status={point.status} /> : null}
            </li>
          );
        })}
      </ul>
      <div className="hidden md:block">
        <table className="w-full text-left">
          <thead>
            <tr className="font-mono text-specimen uppercase tracking-specimen text-tertiary">
              <th className="px-4 py-2 font-normal">Period</th>
              <th className="px-4 py-2 text-right font-normal">Demand</th>
              <th className="px-4 py-2 text-right font-normal">Capacity</th>
              <th className="px-4 py-2 font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {board.columns.map((column, index) => {
              const point = line.points[index];
              return (
                <tr key={column.id} className="border-t border-hairline">
                  <th className="py-2 pr-4 text-left font-mono text-specimen font-normal uppercase text-tertiary">{column.label}</th>
                  <td className="py-2 font-mono text-data tabular-nums text-primary">{demandText(point?.demand ?? null)} / {point?.capacityUnits === null ? 'No capacity entered' : formatCapacity(point?.capacityUnits ?? null)}{point?.capacitySource === 'extended' ? ' ' : ''}</td>
                  <td className="py-2 pl-3">{point?.capacitySource === 'extended' ? <ExtMark from={point.carriedFrom} /> : null}</td>
                  <td className="py-2 pl-3">{point?.status ? <StatusChip status={point.status} /> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CapacityForm({ brand, canEdit, onChanged }: { brand: CrmBrand; canEdit: boolean; onChanged: () => void }) {
  const [message, setMessage] = useState('');
  async function save(form: HTMLFormElement) {
    const data = new FormData(form);
    const res = await fetch('/api/admin/crm/capacity', {
      method: 'PUT',
      headers: { 'x-cedargrowth-crm': '1', 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        brand,
        month: String(data.get('month') || ''),
        productLine: String(data.get('productLine') || ''),
        capacityUnits: Number(data.get('capacityUnits')),
        notes: String(data.get('notes') || ''),
      }),
    });
    const json = await res.json().catch(() => ({})) as { ok?: boolean; reason?: string };
    setMessage(json.ok ? 'Capacity saved.' : String(json.reason || 'Capacity was not saved.'));
    if (json.ok) {
      form.reset();
      onChanged();
    }
  }
  return (
    <div className="flex flex-col gap-3">
      {message ? <p role="status" className="border border-hairline bg-bone px-3 py-2 text-body-m text-primary">{message}</p> : null}
      {canEdit ? (
        <form onSubmit={(event) => { event.preventDefault(); save(event.currentTarget); }} className="grid grid-cols-1 gap-4 border-t border-hairline pt-6 md:grid-cols-2">
          <h3 className="font-display text-heading-s text-primary md:col-span-2">Capacity</h3>
          <label className="flex flex-col gap-1 text-caption text-tertiary">Month
            <input name="month" type="month" required className="border border-hairline bg-transparent px-3 py-2 text-body-m text-primary" />
          </label>
          <label className="flex flex-col gap-1 text-caption text-tertiary">Product line
            <select name="productLine" required defaultValue="vape" className="border border-hairline bg-transparent px-3 py-2 text-body-m text-primary">
              {PRODUCT_LINES.map((line) => <option key={line} value={line}>{PRODUCT_LINE_LABELS[line]}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-caption text-tertiary">Units
            <input name="capacityUnits" required inputMode="numeric" className="border border-hairline bg-transparent px-3 py-2 text-body-m text-primary" />
          </label>
          <label className="flex flex-col gap-1 text-caption text-tertiary">Notes
            <input name="notes" className="border border-hairline bg-transparent px-3 py-2 text-body-m text-primary" />
          </label>
          <button type="submit" className="w-fit border border-ink bg-ink px-4 py-2 font-mono text-specimen uppercase text-inverse">Save capacity</button>
        </form>
      ) : <p className="text-caption text-tertiary">Capacity is edited by an owner or administrator.</p>}
    </div>
  );
}

function MissedDeals({ count }: { count: number }) {
  if (count <= 0) return null;
  const verb = count === 1 ? 'deal has' : 'deals have';
  return <p className="text-body-m text-secondary">{count} {verb} no product line or quantity, so they are not in this forecast.</p>;
}

export function WeeklyOverview({
  brand,
  view,
  canEdit,
  notForecastable = 0,
  onChanged = () => {},
  onOpenLine = () => {},
}: {
  brand: CrmBrand;
  view: ForecastView;
  canEdit: boolean;
  notForecastable?: number;
  onChanged?: () => void;
  onOpenLine?: (event: MouseEvent<HTMLAnchorElement>, line: ProductLine) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-sans text-eyebrow uppercase text-cedar">Production</p>
          <h2 className="font-display text-[40px] leading-none text-primary md:text-[48px]">The next thirteen weeks</h2>
          <p className="mt-2 font-display text-body-m text-secondary">{asOfLine()}</p>
        </div>
        <p className="max-w-sm text-caption text-tertiary md:text-right">Weighted demand uses the win rate for the current stage. Won deals count in full. A blank capacity is not zero.</p>
      </div>
      <MissedDeals count={view.state === 'ready' ? view.notForecastable : notForecastable} />
      {view.state === 'loading' ? <p className="font-mono text-specimen uppercase tracking-specimen text-tertiary">Loading forecast</p> : null}
      {view.state === 'pending' ? <p className="border border-hairline bg-clinical px-4 py-8 text-center text-body-m text-secondary">{WEEKLY_PENDING}</p> : null}
      {view.state === 'error' ? <p className="border border-hairline bg-clinical px-4 py-3 text-body-m text-secondary">{view.reason}</p> : null}
      {view.state === 'ready' ? (
        <BoardView brand={brand} board={view.board} kicker="Held week" demandLabel="Demand this week" weekly linkLines onOpenLine={onOpenLine} />
      ) : null}
      {view.state === 'pending' ? (
        <ul className="border-t border-hairline">
          {PRODUCT_LINES.map((line) => (
            <li key={line} className="border-b border-hairline">
              <a href={productionHref({ brand, line })} onClick={(event) => onOpenLine(event, line)} className="flex min-h-[44px] items-center font-sans text-body-m text-primary cedar-underline">
                {PRODUCT_LINE_LABELS[line]}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      <CapacityForm brand={brand} canEdit={canEdit} onChanged={onChanged} />
    </div>
  );
}

export function YearWindow({
  from,
  canPrev,
  canNext,
  onShift,
}: {
  from: string;
  canPrev: boolean;
  canNext: boolean;
  onShift: (delta: -3 | 3) => void;
}) {
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowLeft' && canPrev) {
      event.preventDefault();
      onShift(-3);
    }
    if (event.key === 'ArrowRight' && canNext) {
      event.preventDefault();
      onShift(3);
    }
  }
  return (
    <div role="group" aria-label="Year window" tabIndex={0} onKeyDown={onKey} className="flex flex-wrap items-center gap-2 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cedar">
      <button type="button" disabled={!canPrev} onClick={() => onShift(-3)} className="min-h-[44px] border border-hairline bg-clinical px-3 font-mono text-specimen text-primary disabled:opacity-40">← 3 months</button>
      <p className="font-mono text-specimen text-tertiary">{yearWindowCaption(from)}</p>
      <button type="button" disabled={!canNext} onClick={() => onShift(3)} className="min-h-[44px] border border-hairline bg-clinical px-3 font-mono text-specimen text-primary disabled:opacity-40">3 months →</button>
    </div>
  );
}

export function LineDashboard({
  brand,
  line,
  span,
  view,
  onSpan = () => {},
  onBack = () => {},
  yearFrom,
  canPrev = true,
  canNext = true,
  onYearShift,
  onBackToToday,
}: {
  brand: CrmBrand;
  line: ProductLine;
  span: ForecastSpan;
  view: ForecastView;
  onSpan?: (span: ForecastSpan) => void;
  onBack?: (event: MouseEvent<HTMLAnchorElement>) => void;
  yearFrom?: string;
  canPrev?: boolean;
  canNext?: boolean;
  onYearShift?: (delta: -3 | 3) => void;
  onBackToToday?: () => void;
}) {
  const kicker = span === 'week' ? 'Held week' : 'Held month';
  const title = span === 'week' ? 'The next thirteen weeks' : span === 'year' ? 'The next twelve months' : 'The next six months';
  const windowFrom = yearFrom ?? (view.state === 'ready' ? view.board.columns[0]?.start : null) ?? currentMonthStart();
  const todayWindow = currentMonthStart();
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-col gap-4">
        <a href={productionHref({ brand })} onClick={onBack} className="w-fit font-mono text-specimen uppercase tracking-specimen text-primary cedar-underline">
          Production forecast
        </a>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-3">
            <div>
              <p className="font-sans text-eyebrow uppercase text-cedar">{PRODUCT_LINE_LABELS[line]}</p>
              <h2 className="font-display text-[40px] leading-none text-primary md:text-[48px]">{title}</h2>
              <p className="mt-2 font-display text-body-m text-secondary">{asOfLine()}</p>
            </div>
            {span === 'year' ? (
              <div className="flex flex-wrap items-center gap-4">
                <YearWindow from={windowFrom} canPrev={canPrev} canNext={canNext} onShift={onYearShift ?? (() => {})} />
                {windowFrom !== todayWindow ? (
                  <button type="button" onClick={onBackToToday} className="font-mono text-specimen uppercase tracking-specimen text-primary cedar-underline">Back to today</button>
                ) : null}
              </div>
            ) : null}
          </div>
          <SpanControl span={span} onSpan={onSpan} />
        </div>
      </div>
      {view.state === 'loading' ? <p className="font-mono text-specimen uppercase tracking-specimen text-tertiary">Loading forecast</p> : null}
      {view.state === 'pending' ? <p className="border border-hairline bg-clinical px-4 py-8 text-center text-body-m text-secondary">{WEEKLY_PENDING}</p> : null}
      {view.state === 'error' ? <p className="border border-hairline bg-clinical px-4 py-3 text-body-m text-secondary">{view.reason}</p> : null}
      {view.state === 'ready' ? (
        <>
          <BoardView brand={brand} board={view.board} kicker={kicker} demandLabel={`${PRODUCT_LINE_LABELS[line]} demand`} weekly={span === 'week'} linkLines={false} />
          <StatsRow board={view.board} />
          <PeriodBreakdown board={view.board} />
        </>
      ) : null}
    </div>
  );
}

function writeProductionUrl(brand: CrmBrand, line: ProductLine | null, span: ForecastSpan, from?: string | null) {
  const url = new URL(window.location.href);
  url.searchParams.set('section', 'production');
  url.searchParams.set('brand', brand);
  if (line) url.searchParams.set('line', line);
  else url.searchParams.delete('line');
  if (line && span !== 'week') url.searchParams.set('span', span);
  else url.searchParams.delete('span');
  if (line && span === 'year' && from) url.searchParams.set('from', from);
  else url.searchParams.delete('from');
  return url;
}

export function ProductionSection({
  brand,
  canEdit,
  onChanged,
  notForecastable = 0,
}: {
  brand: CrmBrand;
  canEdit: boolean;
  onChanged: () => void;
  notForecastable?: number;
}) {
  const [line, setLine] = useState<ProductLine | null>(null);
  const [span, setSpan] = useState<ForecastSpan>('week');
  const [yearFrom, setYearFrom] = useState(currentMonthStart);
  const [yearMoves, setYearMoves] = useState({ prev: false, next: false });
  const [yearBusy, setYearBusy] = useState(false);
  const [view, setView] = useState<ForecastView>({ state: 'loading' });
  const [tick, setTick] = useState(0);
  const appliedYear = useRef<string | null>(null);

  useEffect(() => {
    const read = () => {
      const params = new URLSearchParams(window.location.search);
      setLine(lineFromSearch(params.get('line')));
      setSpan(spanFromSearch(params.get('span')));
      const from = monthFromSearch(params.get('from'));
      if (from) setYearFrom(from);
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);

  useEffect(() => {
    let cancel = false;
    const from = span === 'year' ? yearFrom : null;
    const yearKey = `${brand}:${line ?? ''}:${yearFrom}:${tick}`;
    if (span === 'year' && appliedYear.current === yearKey) return () => { cancel = true; };
    setView({ state: 'loading' });
    loadForecastView(brand, line ? span : 'week', line, undefined, from)
      .then((next) => {
        if (cancel) return;
        if (span === 'year') {
          appliedYear.current = `${brand}:${line ?? ''}:${yearFrom}:${tick}`;
          const paging = next.state === 'ready' && next.honoredFrom === true;
          setYearMoves({ prev: paging, next: paging });
        }
        setView(next);
      })
      .catch(() => { if (!cancel) setView(line && span !== 'week' ? { state: 'error', reason: 'Production forecast is not available yet.' } : { state: 'pending' }); });
    return () => { cancel = true; };
  }, [brand, line, span, yearFrom, tick]);

  function openLine(event: MouseEvent<HTMLAnchorElement>, next: ProductLine) {
    if (!plainClick(event)) return;
    event.preventDefault();
    window.history.pushState(null, '', writeProductionUrl(brand, next, 'week'));
    setLine(next);
    setSpan('week');
  }

  function back(event: MouseEvent<HTMLAnchorElement>) {
    if (!plainClick(event)) return;
    event.preventDefault();
    window.history.pushState(null, '', writeProductionUrl(brand, null, 'week'));
    setLine(null);
    setSpan('week');
  }

  function changeSpan(next: ForecastSpan) {
    setSpan(next);
    window.history.replaceState(null, '', writeProductionUrl(brand, line, next, yearFrom));
  }

  function backToToday() {
    const today = currentMonthStart();
    appliedYear.current = null;
    setYearMoves({ prev: false, next: false });
    setYearFrom(today);
    window.history.replaceState(null, '', writeProductionUrl(brand, line, 'year', today));
  }

  function shiftYear(delta: -3 | 3) {
    const key = delta < 0 ? 'prev' : 'next';
    if (yearBusy || !yearMoves[key] || !line) return;
    const nextFrom = shiftMonth(yearFrom, delta);
    setYearBusy(true);
    loadForecastView(brand, 'year', line, undefined, nextFrom)
      .then((next) => {
        if (next.state === 'ready' && next.honoredFrom) {
          appliedYear.current = `${brand}:${line}:${nextFrom}:${tick}`;
          setYearMoves({ prev: true, next: true });
          setYearFrom(nextFrom);
          setView(next);
          window.history.replaceState(null, '', writeProductionUrl(brand, line, 'year', nextFrom));
          return;
        }
        setYearMoves({ prev: false, next: false });
      })
      .finally(() => setYearBusy(false));
  }

  if (line) {
    return (
      <LineDashboard
        brand={brand}
        line={line}
        span={span}
        view={view}
        onSpan={changeSpan}
        onBack={back}
        yearFrom={yearFrom}
        canPrev={yearMoves.prev && !yearBusy}
        canNext={yearMoves.next && !yearBusy}
        onYearShift={shiftYear}
        onBackToToday={backToToday}
      />
    );
  }
  return (
    <WeeklyOverview
      brand={brand}
      view={view}
      canEdit={canEdit}
      notForecastable={notForecastable}
      onChanged={() => { setTick((value) => value + 1); onChanged(); }}
      onOpenLine={openLine}
    />
  );
}
