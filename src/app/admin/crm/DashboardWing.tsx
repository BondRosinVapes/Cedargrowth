'use client';

import { useEffect, useState } from 'react';
import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPES, LEAD_SOURCE_LABELS, LEAD_SOURCES, OPPORTUNITY_STAGES, type CrmBrand } from '@/lib/crm/engine';
import { ORDER_STATUS_LABELS } from '@/lib/crm/distributor';
import { PRODUCT_LINES, PRODUCT_LINE_LABELS, type ProductLine } from '@/lib/crm/engine';
import { monthCaption, rateCaption, stageRateLabel } from '@/lib/crm/forecast';
import {
  DEAL_STATUSES,
  MONTH_LABELS,
  STAGE_LABELS,
  STATUS_LABELS,
  type Bucket,
  type Dashboard,
  type RepRow,
} from '@/lib/crm/dashboard';
import { sectionFromSearch, type DashboardSection } from '@/lib/crm/dashboardSections';
import { QuickAdd, SpreadsheetUpload } from './DataIntake';
import { DashboardSectionHost, DashboardTabs } from './DashboardTabs';
import { DigestPanel } from './DigestPanel';
import { NextActions, TerritoryMap } from './TerritoryMap';

type Source = { connected: boolean; label: string };
type DashboardBody = {
  ok?: boolean;
  configured?: boolean;
  reason?: string;
  sources?: { crm: Source; canix: Source; hoodie: Source };
  dashboard?: Dashboard;
  refreshedAt?: string;
  truncated?: boolean;
};
type ForecastBody = {
  ok?: boolean;
  reason?: string;
  rates?: { stage: 'lead' | 'qualification' | 'licensed_buyer_review' | 'proposal' | 'won' | 'lost'; rate: number; defaulted: boolean; closed: number }[];
  cells?: { month: string; productLine: ProductLine; demand: number; capacityUnits: number | null; status: 'short' | 'tight' | 'ok' | 'no_capacity' }[];
  notForecastable?: number;
  shorts?: string[];
};
type Jump = 'accounts' | 'pipeline' | 'canix' | 'signals';

// Categorical order from the house tokens, checked for adjacent color-blind separation:
// cedar, verdant, tertiary, ink. Every chart also carries a legend and direct labels.
const SERIES = ['rgb(var(--accent-cedar))', 'rgb(var(--accent-verdant))', 'rgb(var(--text-tertiary))', 'rgb(var(--surface-ink))'];
const STATUS_COLOR: Record<string, string> = { open: SERIES[3], won: SERIES[1], lost: SERIES[2] };

const EMPTY_FILTERS = { year: '', month: '', rep: '', region: '', territory: '', accountType: '', leadSource: '', stage: '', status: '' };
type Filters = typeof EMPTY_FILTERS;

function money(cents: number | null): string {
  if (cents === null) return 'None';
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(1)}K`;
  return `$${Math.round(dollars)}`;
}

function percent(value: number | null): string {
  return value === null ? 'None' : `${(value * 100).toFixed(1)}%`;
}

function hours(value: number | null): string {
  if (value === null) return 'None yet';
  if (value >= 48) return `${(value / 24).toFixed(1)} days`;
  return `${value.toFixed(1)} hrs`;
}

// Four color slots at most. Anything past the top three folds into Other, so no hue is ever invented.
function topWithOther(rows: Bucket[]): Bucket[] {
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  if (sorted.length <= SERIES.length) return sorted;
  const rest = sorted.slice(SERIES.length - 1);
  const restCents = rest.map((row) => row.cents).filter((value): value is number => value !== null);
  return [
    ...sorted.slice(0, SERIES.length - 1),
    { key: 'other_folded', label: 'All others', count: rest.reduce((sum, row) => sum + row.count, 0), cents: restCents.length ? restCents.reduce((a, b) => a + b, 0) : null },
  ];
}

export function DashboardWing({ brand, brandName, canEditCapacity = false, onOpenAccount }: { brand: CrmBrand; brandName: string; onOpen?: (wing: Jump) => void; canEditCapacity?: boolean; onOpenAccount: (id: string) => void }) {
  const [section, setSection] = useState<DashboardSection>('overview');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [body, setBody] = useState<DashboardBody | null>(null);
  const [failed, setFailed] = useState(false);
  const [forecast, setForecast] = useState<ForecastBody | null>(null);
  const [tick, setTick] = useState(0);
  const [panel, setPanel] = useState<'none' | 'add' | 'upload'>('none');

  // Live refresh: every 60 seconds while the tab is visible, when the tab regains focus,
  // and right after anything is added or imported from this screen.
  useEffect(() => {
    const stored = sectionFromSearch(new URLSearchParams(window.location.search).get('section'));
    if (stored !== 'overview') setSection(stored);
  }, []);

  function selectSection(next: DashboardSection) {
    setSection(next);
    const url = new URL(window.location.href);
    if (next === 'overview') url.searchParams.delete('section');
    else url.searchParams.set('section', next);
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  useEffect(() => {
    const bump = () => { if (document.visibilityState === 'visible') setTick((value) => value + 1); };
    const timer = window.setInterval(bump, 60_000);
    window.addEventListener('focus', bump);
    document.addEventListener('visibilitychange', bump);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', bump);
      document.removeEventListener('visibilitychange', bump);
    };
  }, []);

  useEffect(() => {
    let cancel = false;
    const params = new URLSearchParams({ brand });
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    fetch(`/api/admin/crm/dashboard?${params.toString()}`, { headers: { 'x-cedargrowth-crm': '1' }, credentials: 'same-origin', cache: 'no-store' })
      .then((res) => res.json())
      .then((json: DashboardBody) => { if (!cancel) { setBody(json); setFailed(false); } })
      .catch(() => { if (!cancel) setFailed(true); });
    fetch(`/api/admin/crm/forecast?brand=${brand}&months=6`, { headers: { 'x-cedargrowth-crm': '1' }, credentials: 'same-origin', cache: 'no-store' })
      .then((res) => res.json())
      .then((json: ForecastBody) => { if (!cancel) setForecast(json); })
      .catch(() => { if (!cancel) setForecast(null); });
    return () => { cancel = true; };
  }, [brand, filters, tick]);

  const refresh = () => setTick((value) => value + 1);

  if (failed && !body) return <Notice text="The dashboard could not be read. Try again in a moment." />;
  if (!body) return <p className="font-mono text-specimen uppercase tracking-specimen text-tertiary">Loading dashboard</p>;
  if (body.configured === false || !body.dashboard) return <Notice text={body.reason || 'CRM storage is not configured.'} />;

  const data = body.dashboard;
  const set = (key: keyof Filters) => (value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const filtered = Object.values(filters).some(Boolean);
  const empty = data.kpis.deals === 0 && data.kpis.accounts === 0;

  const filterPanel = (
    <div className="flex flex-col gap-4">
      <FilterSelect label="Year" value={filters.year} onChange={set('year')} options={data.options.years.map((year) => ({ value: String(year), label: String(year) }))} />
      <FilterSelect label="Month" value={filters.month} onChange={set('month')} options={MONTH_LABELS.map((label, index) => ({ value: String(index + 1), label }))} />
      <FilterSelect label="Sales rep" value={filters.rep} onChange={set('rep')} options={data.options.reps.map((rep) => ({ value: rep, label: rep }))} />
      <FilterSelect label="Region" value={filters.region} onChange={set('region')} options={data.options.regions.map((region) => ({ value: region, label: region }))} />
      <FilterSelect label="Account type" value={filters.accountType} onChange={set('accountType')} options={ACCOUNT_TYPES.map((type) => ({ value: type, label: ACCOUNT_TYPE_LABELS[type] }))} />
      <FilterSelect label="Lead source" value={filters.leadSource} onChange={set('leadSource')} options={LEAD_SOURCES.map((source) => ({ value: source, label: LEAD_SOURCE_LABELS[source] }))} />
      <FilterSelect label="Stage" value={filters.stage} onChange={set('stage')} options={OPPORTUNITY_STAGES.map((stage) => ({ value: stage, label: STAGE_LABELS[stage] }))} />
      <FilterSelect label="Status" value={filters.status} onChange={set('status')} options={DEAL_STATUSES.map((status) => ({ value: status, label: STATUS_LABELS[status] }))} />
      {filtered ? (
        <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="w-fit border border-hairline-inverse px-3 py-2 font-mono text-specimen uppercase tracking-specimen text-inverse">
          Clear filters
        </button>
      ) : null}
      {body.sources ? (
        <ul className="flex flex-col gap-2 border-t border-hairline-inverse pt-4" aria-label="Data sources">
          <SourceLine name="CRM" source={body.sources.crm} />
          <SourceLine name="Canix" source={body.sources.canix} />
          <SourceLine name="Hoodie" source={body.sources.hoodie} />
        </ul>
      ) : null}
    </div>
  );

  return (
    <section aria-label={`${brandName} dashboard`} className="flex flex-col gap-4">
      <DashboardTabs section={section} onSelect={selectSection} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_14rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <details className="bg-ink p-4 text-inverse lg:hidden">
          <summary className="cursor-pointer font-mono text-specimen uppercase tracking-specimen">Filters{filtered ? ' (on)' : ''}</summary>
          <div className="mt-4">{filterPanel}</div>
        </details>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-specimen uppercase tracking-specimen text-tertiary" aria-live="polite">
            {failed ? 'Refresh failed, showing last data' : body.refreshedAt ? `Live. Updated ${new Date(body.refreshedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : 'Live'}
            {body.truncated ? '. Showing the first 2,000 records' : ''}
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={refresh} className="border border-hairline bg-clinical px-3 py-2 font-mono text-specimen uppercase text-primary">Refresh</button>
            <button type="button" aria-expanded={panel === 'add'} onClick={() => setPanel(panel === 'add' ? 'none' : 'add')} className={`border px-3 py-2 font-mono text-specimen uppercase ${panel === 'add' ? 'border-ink bg-ink text-inverse' : 'border-ink text-primary'}`}>+ Quick add</button>
            <button type="button" aria-expanded={panel === 'upload'} onClick={() => setPanel(panel === 'upload' ? 'none' : 'upload')} className={`border px-3 py-2 font-mono text-specimen uppercase ${panel === 'upload' ? 'border-ink bg-ink text-inverse' : 'border-ink text-primary'}`}>Upload spreadsheet</button>
          </div>
        </div>

        {panel === 'add' ? <QuickAdd brand={brand} onSaved={refresh} /> : null}
        {panel === 'upload' ? <SpreadsheetUpload brand={brand} onSaved={refresh} /> : null}

        <DashboardSectionHost
          section={section}
          panels={{
            overview: (
              <>
                <DigestPanel brand={brand} canSend={canEditCapacity} />
                {forecast?.shorts?.length ? (
                  <div className="flex flex-col gap-2 border border-fail bg-clinical px-4 py-3" role="status">
                    {forecast.shorts.map((line) => <p key={line} className="text-body-m text-primary">{line}</p>)}
                  </div>
                ) : null}
                <dl className="grid grid-cols-2 gap-4 md:grid-cols-5">
                  <Kpi label="Deals" value={String(data.kpis.deals)} />
                  <Kpi label="Total deal value" value={money(data.kpis.totalValueCents)} note="Forecast" detail={data.distributor.nabisOrderCount > 0 ? `Invoiced (Nabis): ${money(data.distributor.invoicedNabisCents)}` : undefined} />
                  <Kpi label="Win rate" value={percent(data.kpis.winRate)} />
                  <Kpi label="Avg response time" value={hours(data.kpis.avgResponseHours)} note={data.kpis.responseSample ? `${data.kpis.responseSample} accounts` : 'First note after a new account'} muted={data.kpis.avgResponseHours === null} />
                  <Kpi label="Avg deal value" value={money(data.kpis.avgDealCents)} note="Forecast" />
                </dl>
                {empty ? (
                  <div className="flex flex-col gap-3 border border-hairline bg-clinical p-4 md:flex-row md:items-center md:justify-between">
                    <p className="text-body-m text-secondary">
                      {filtered ? 'Nothing matches these filters.' : `No ${brandName} records yet. Add one with Quick add, or upload a spreadsheet of accounts and deals. The charts update live.`}
                    </p>
                  </div>
                ) : null}
                <TerritoryMap brand={brand} canAssign={canEditCapacity} territory={filters.territory} onSelect={(region) => setFilters((current) => ({ ...current, territory: current.territory === region ? '' : region }))} onOpenAccount={onOpenAccount} />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card title="Deals by account type">
              <Donut rows={topWithOther(data.byAccountType)} colorFor={(_, index) => SERIES[index]} measure="count" empty="Set an account type on each account to see this." />
            </Card>
            <Card title="Total deal value by status">
              <Donut rows={data.byStatus} colorFor={(row) => STATUS_COLOR[row.key]} measure="cents" />
            </Card>
            <Card title="Deals by stage" className="md:col-span-2 xl:col-span-1 xl:row-span-2">
              <Bars rows={data.byStage} />
            </Card>
            <Card title="Win rate vs total deal value by lead source" className="md:col-span-2">
              <Scatter rows={data.byLeadSource} />
            </Card>
          </div>
              </>
            ),
            reps: (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card title="Deals by sales rep" className="xl:col-span-2"><RepTable rows={data.byRep} /></Card>
            <Card title="Next best action" className="xl:col-span-2"><NextActions brand={brand} /></Card>
            <Card title="Visits this week" className="xl:col-span-2">
              {data.fieldReps.length === 0 ? <p className="text-caption text-tertiary">No visits logged yet.</p> : (
                <ul className="flex flex-col gap-2">
                  {data.fieldReps.map((row) => (
                    <li key={row.rep} className="flex flex-wrap justify-between gap-2 text-body-m text-primary">
                      <span>{row.rep}</span>
                      <span className="font-mono text-data tabular-nums">{row.visitsThisWeek} this week. {row.daysSinceLastVisit === null ? 'No visit yet' : `${row.daysSinceLastVisit} days since last visit`}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Total deal value by sales rep">
              <Bars rows={data.byRep} measure="cents" empty="Assign a sales rep on each account to see this." />
            </Card>
            <Card title="Win rate by sales rep">
              <Bars rows={data.byRep.filter((row) => row.winRate !== null).map((row) => ({ ...row, count: Math.round((row.winRate ?? 0) * 1000) / 10 }))} suffix="%" empty="No closed deals yet." />
            </Card>
          </div>
            ),
            accounts: (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card title="Deal value by account type">
              <Bars rows={data.byAccountType} measure="cents" empty="Set an account type on each account to see this." />
            </Card>
            <Card title="Accounts by status">
              <Donut rows={data.accountsByStatus} colorFor={(_, index) => SERIES[index % SERIES.length]} measure="count" />
            </Card>
            <Card title="Deals by region" className="md:col-span-2 xl:col-span-1">
              <Bars rows={data.byRegion} empty="Add a city to each account to see regions." />
            </Card>
          </div>
            ),
            sources: (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card title="Deals by lead source">
              <Bars rows={data.byLeadSource} empty="Set a lead source on each account to see this." />
            </Card>
            <Card title="Total deal value by lead source">
              <Bars rows={data.byLeadSource} measure="cents" empty="Set a lead source on each account to see this." />
            </Card>
            <Card title="Lead source effectiveness" className="xl:col-span-2"><SourceTable rows={data.byLeadSource} /></Card>
            <Card title="Win rate vs total deal value by lead source" className="xl:col-span-2">
              <Scatter rows={data.byLeadSource} />
            </Card>
          </div>
            ),
            distributor: <DistributorSection brand={brand} data={data} onChanged={refresh} />,
            production: <ProductionSection brand={brand} forecast={forecast} canEdit={canEditCapacity} onChanged={refresh} />,
            timeline: (
          <div className="grid grid-cols-1 gap-4">
            <Card title={`Deals by expected close, ${data.monthsLabel}`} note={data.overdueOpen ? `${data.overdueOpen} open deals are past their close date` : undefined}>
              <Columns rows={data.byMonth} measure="count" />
            </Card>
            <Card title={`Total deal value by expected close, ${data.monthsLabel}`}>
              <Columns rows={data.byMonth} measure="cents" />
            </Card>
          </div>
            ),
          }}
        />
      </div>

      <aside aria-label="Filters" className="hidden bg-ink p-5 text-inverse lg:block">{filterPanel}</aside>
      </div>
    </section>
  );
}

function DistributorSection({ brand, data, onChanged }: { brand: CrmBrand; data: Dashboard; onChanged: () => void }) {
  const report = data.distributor;
  const [accounts, setAccounts] = useState<{ id: string; displayName: string }[]>([]);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  useEffect(() => {
    fetch(`/api/admin/crm/accounts?brand=${brand}`, { headers: { 'x-cedargrowth-crm': '1' }, credentials: 'same-origin' })
      .then((res) => res.json())
      .then((json: { accounts?: { id: string; displayName: string }[] }) => setAccounts(json.accounts || []))
      .catch(() => setAccounts([]));
  }, [brand]);
  async function post(body: Record<string, string>) {
    const res = await fetch('/api/admin/crm/distributor-orders', {
      method: 'POST',
      headers: { 'x-cedargrowth-crm': '1', 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ brand, ...body }),
    });
    const json = await res.json().catch(() => ({})) as { ok?: boolean; reason?: string };
    setMessage(json.ok ? 'Saved.' : String(json.reason || 'That change was not saved.'));
    if (json.ok) onChanged();
  }
  const tiles = [
    ['Orders this month', String(report.ordersThisMonth)],
    ['Invoiced this month', money(report.invoicedThisMonthCents)],
    ['Awaiting retailer payment', String(report.awaitingRetailerPayment)],
    ['Awaiting payout to CedarGrowth', String(report.awaitingPayout)],
  ] as const;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-caption text-tertiary">{report.sourceLabel}. These figures are what the distributor reported. They are not a CedarGrowth invoice.</p>
      {message ? <p role="status" className="border border-hairline bg-bone px-3 py-2 text-body-m text-primary">{message}</p> : null}
      <dl className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {tiles.map(([labelText, value]) => (
          <div key={labelText} className="border border-hairline bg-clinical px-3 py-4 text-center">
            <dd className="font-display text-heading-s-m text-primary">{value}</dd>
            <dt className="text-caption text-secondary">{labelText}</dt>
            <p className="text-caption text-tertiary">{report.sourceLabel}</p>
          </div>
        ))}
      </dl>
      <Card title="Orders by status">
        <ul className="flex flex-col gap-2">
          {report.byStatus.map((row) => (
            <li key={row.key} className="flex justify-between gap-3 text-body-m text-primary">
              <span>{row.label}</span>
              <span className="font-mono text-data tabular-nums">{row.count}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Unpaid invoices past 30 days">
        {report.overdueUnpaid.length === 0 ? <p className="text-caption text-tertiary">No unpaid distributor invoices past 30 days.</p> : (
          <ul className="flex flex-col gap-2">
            {report.overdueUnpaid.map((row) => (
              <li key={row.id} className="text-body-m text-primary">{row.retailerName}. {money(row.invoiceCents)}. Ordered {row.orderedOn || 'on an unknown date'}.</li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Reported orders">
        {report.orders.length === 0 ? <p className="text-caption text-tertiary">No distributor orders imported yet.</p> : (
          <ul className="flex flex-col gap-3">
            {report.orders.map((row) => (
              <li key={row.id} className="flex flex-col gap-2 border border-hairline px-3 py-2">
                <p className="text-body-m text-primary">{row.retailerName}. {row.orderRef}. {ORDER_STATUS_LABELS[row.orderStatus]}. Invoice {money(row.invoiceCents)}.</p>
                {!row.accountId ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex flex-col gap-1 text-caption text-tertiary">Link to account
                      <select value={links[row.id] || ''} onChange={(event) => setLinks((current) => ({ ...current, [row.id]: event.target.value }))} className="border border-hairline bg-clinical px-3 py-2 text-body-m text-primary">
                        <option value="">Choose</option>
                        {accounts.map((account) => <option key={account.id} value={account.id}>{account.displayName}</option>)}
                      </select>
                    </label>
                    <button type="button" disabled={!links[row.id]} onClick={() => post({ action: 'link', orderId: row.id, accountId: links[row.id] })} className="border border-ink px-3 py-2 font-mono text-specimen uppercase disabled:opacity-40">Link to account</button>
                  </div>
                ) : null}
                {row.openOpportunityIds.map((opportunityId) => (
                  <button key={opportunityId} type="button" onClick={() => post({ action: 'win', orderId: row.id, opportunityId })} className="w-fit border border-ink px-3 py-2 font-mono text-specimen uppercase">Mark deal won from this order</button>
                ))}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

const CHIP: Record<string, string> = {
  short: 'border-fail text-fail',
  tight: 'border-attention text-secondary',
  ok: 'border-pass text-secondary',
  no_capacity: 'border-hairline text-tertiary',
};
const CHIP_LABEL: Record<string, string> = {
  short: 'Short',
  tight: 'Tight',
  ok: 'OK',
  no_capacity: 'No capacity entered',
};

function units(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function ProductionSection({ brand, forecast, canEdit, onChanged }: { brand: CrmBrand; forecast: ForecastBody | null; canEdit: boolean; onChanged: () => void }) {
  const [message, setMessage] = useState('');
  const cells = forecast?.cells || [];
  const months = Array.from(new Set(cells.map((cell) => cell.month)));
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
    if (json.ok) { form.reset(); onChanged(); }
  }
  if (!forecast?.ok) return <Notice text={forecast?.reason || 'Production forecast is not available yet.'} />;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-caption text-tertiary">Weighted demand uses the win rate for the current stage. Won deals count in full. A blank capacity is not zero.</p>
      {message ? <p role="status" className="border border-hairline bg-bone px-3 py-2 text-body-m text-primary">{message}</p> : null}
      {(forecast.notForecastable || 0) > 0 ? <p className="text-body-m text-secondary">{forecast.notForecastable} deals have no product line or quantity, so they are not in this forecast.</p> : null}
      <div className="overflow-x-auto border border-hairline bg-clinical">
        <table className="w-full text-left">
          <thead>
            <tr className="font-mono text-specimen uppercase tracking-specimen text-tertiary">
              <th className="px-3 py-2 font-normal">Product line</th>
              {months.map((month) => <th key={month} className="px-3 py-2 font-normal">{monthCaption(month)}</th>)}
            </tr>
          </thead>
          <tbody>
            {PRODUCT_LINES.map((line) => (
              <tr key={line} className="border-t border-hairline">
                <th className="px-3 py-2 text-left font-sans text-body-m font-normal text-primary">{PRODUCT_LINE_LABELS[line]}</th>
                {months.map((month) => {
                  const cell = cells.find((item) => item.productLine === line && item.month === month);
                  if (!cell) return <td key={month} className="px-3 py-2 text-caption text-tertiary">No capacity entered</td>;
                  return (
                    <td key={month} className="px-3 py-2">
                      <p className="font-mono text-data tabular-nums text-primary">{units(cell.demand)} / {cell.capacityUnits === null ? 'No capacity' : units(cell.capacityUnits)}</p>
                      <p className={`mt-1 inline-flex rounded-chip border px-2 py-0.5 font-mono text-specimen uppercase ${CHIP[cell.status]}`}>{CHIP_LABEL[cell.status]}</p>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Card title="Win rates used">
        <ul className="flex flex-col gap-2">
          {(forecast.rates || []).map((rate) => (
            <li key={rate.stage} className="flex flex-wrap justify-between gap-2 text-body-m text-primary">
              <span>{stageRateLabel(rate.stage)}</span>
              <span className="font-mono text-data tabular-nums">{(rate.rate * 100).toFixed(0)}%. {rateCaption(rate)}</span>
            </li>
          ))}
        </ul>
      </Card>
      {canEdit ? (
        <form onSubmit={(event) => { event.preventDefault(); save(event.currentTarget); }} className="grid grid-cols-1 gap-3 border border-hairline bg-clinical p-4 md:grid-cols-2">
          <h3 className="font-display text-body-l text-primary md:col-span-2">Capacity</h3>
          <label className="flex flex-col gap-1 text-caption text-tertiary">Month
            <input name="month" type="month" required className="border border-hairline bg-clinical px-3 py-2 text-body-m text-primary" />
          </label>
          <label className="flex flex-col gap-1 text-caption text-tertiary">Product line
            <select name="productLine" required defaultValue="vape" className="border border-hairline bg-clinical px-3 py-2 text-body-m text-primary">
              {PRODUCT_LINES.map((line) => <option key={line} value={line}>{PRODUCT_LINE_LABELS[line]}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-caption text-tertiary">Units
            <input name="capacityUnits" required inputMode="numeric" className="border border-hairline bg-clinical px-3 py-2 text-body-m text-primary" />
          </label>
          <label className="flex flex-col gap-1 text-caption text-tertiary">Notes
            <input name="notes" className="border border-hairline bg-clinical px-3 py-2 text-body-m text-primary" />
          </label>
          <button type="submit" className="w-fit border border-ink bg-ink px-4 py-2 font-mono text-specimen uppercase text-inverse">Save capacity</button>
        </form>
      ) : <p className="text-caption text-tertiary">Capacity is edited by an owner or administrator.</p>}
    </div>
  );
}

function Notice({ text }: { text: string }) {
  return <p className="border border-hairline bg-clinical px-4 py-3 text-body-m text-secondary">{text}</p>;
}

function Kpi({ label, value, note, muted, detail }: { label: string; value: string; note?: string; muted?: boolean; detail?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 border border-hairline bg-clinical px-3 py-5 text-center">
      <dd className={`order-1 font-display tabular-nums ${muted ? 'text-heading-s-m md:text-heading-s text-tertiary' : 'text-heading-m-m md:text-heading-m text-primary'}`}>{value}</dd>
      <dt className="order-2 text-caption text-secondary">{label}{note ? <span className="text-tertiary"> ({note})</span> : null}</dt>
      {detail ? <p className="order-3 text-caption text-secondary">{detail}</p> : null}
    </div>
  );
}

function Card({ title, note, className = '', children }: { title: string; note?: string; className?: string; children: React.ReactNode }) {
  return (
    <article className={`flex min-w-0 flex-col gap-4 border border-hairline bg-clinical p-4 ${className}`}>
      <header className="text-center">
        <h2 className="font-display text-body-l-m md:text-body-l text-primary">{title}</h2>
        {note ? <p className="text-caption text-tertiary">{note}</p> : null}
      </header>
      {children}
    </article>
  );
}

function EmptyChart({ text }: { text: string }) {
  return <p className="flex min-h-40 flex-1 items-center justify-center border border-dashed border-hairline px-4 text-center text-caption text-tertiary">{text}</p>;
}

function Donut({ rows, colorFor, measure, empty }: { rows: Bucket[]; colorFor: (row: Bucket, index: number) => string; measure: 'count' | 'cents'; empty?: string }) {
  const valueOf = (row: Bucket) => (measure === 'cents' ? row.cents ?? 0 : row.count);
  const total = rows.reduce((sum, row) => sum + valueOf(row), 0);
  if (total === 0) return <EmptyChart text={empty ?? (measure === 'cents' ? 'No deal values entered yet.' : 'No records yet.')} />;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox="0 0 120 120" className="h-40 w-40" role="img" aria-label={rows.map((row) => `${row.label} ${measure === 'cents' ? money(row.cents) : row.count}`).join(', ')}>
        <g transform="rotate(-90 60 60)">
          {rows.map((row, index) => {
            const value = valueOf(row);
            if (!value) return null;
            const length = (value / total) * circumference;
            const segment = (
              <circle key={row.key} cx="60" cy="60" r={radius} fill="none" stroke={colorFor(row, index)} strokeWidth="18"
                strokeDasharray={`${Math.max(length - 2, 0.5)} ${circumference}`} strokeDashoffset={-offset}>
                <title>{`${row.label}: ${measure === 'cents' ? money(row.cents) : row.count} (${Math.round((value / total) * 100)}%)`}</title>
              </circle>
            );
            offset += length;
            return segment;
          })}
        </g>
      </svg>
      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1">
        {rows.map((row, index) => (
          <li key={row.key} className="flex items-center gap-2 text-caption text-secondary">
            <span className="inline-block h-2 w-2" style={{ background: colorFor(row, index) }} aria-hidden="true" />
            {row.label} <span className="font-mono text-specimen tabular-nums text-primary">{measure === 'cents' ? money(row.cents) : row.count} ({Math.round((valueOf(row) / total) * 100)}%)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bars({ rows, measure = 'count', suffix = '', empty = 'No deals yet.' }: { rows: Bucket[]; measure?: 'count' | 'cents'; suffix?: string; empty?: string }) {
  const valueOf = (row: Bucket) => (measure === 'cents' ? row.cents ?? 0 : row.count);
  const max = Math.max(0, ...rows.map(valueOf));
  if (max === 0) return <EmptyChart text={empty} />;
  return (
    <ul className="flex flex-1 flex-col justify-around gap-3">
      {rows.map((row) => {
        const label = measure === 'cents' ? money(row.cents) : `${valueOf(row)}${suffix}`;
        return (
          <li key={row.key} className="grid grid-cols-[6.5rem_1fr] items-center gap-3" title={`${row.label}: ${label}`}>
            <span className="truncate text-right text-caption text-secondary">{row.label}</span>
            <span className="flex items-center gap-2">
              <span className="h-8 bg-ink" style={{ width: `${(valueOf(row) / max) * 85}%` }} aria-hidden="true" />
              <span className="font-mono text-specimen tabular-nums text-primary">{label}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Columns({ rows, measure }: { rows: Bucket[]; measure: 'count' | 'cents' }) {
  const valueOf = (row: Bucket) => (measure === 'cents' ? row.cents ?? 0 : row.count);
  const max = Math.max(0, ...rows.map(valueOf));
  if (max === 0) return <EmptyChart text="No deals have an expected close date in this range yet." />;
  return (
    <ul className="grid h-48 grid-cols-12 items-end gap-1 md:gap-2">
      {rows.map((row) => {
        const label = measure === 'cents' ? (row.cents === null ? '' : money(row.cents)) : row.count ? String(row.count) : '';
        return (
          <li key={row.key} className="flex h-full min-w-0 flex-col items-center justify-end gap-1" title={`${row.label}: ${row.count} deals, ${money(row.cents)}`}>
            <span className="font-mono text-specimen tabular-nums text-primary">{label}</span>
            <span className="w-full bg-ink" style={{ height: `${(valueOf(row) / max) * 75}%` }} aria-hidden="true" />
            <span className="truncate font-mono text-specimen text-tertiary">{row.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Scatter({ rows }: { rows: RepRow[] }) {
  const points = rows.filter((row) => row.winRate !== null && row.cents !== null);
  if (!points.length) return <EmptyChart text="Each lead source becomes a point once its deals have values and at least one is won or lost." />;
  const maxCents = Math.max(...points.map((row) => row.cents ?? 0)) || 1;
  const width = 600;
  const height = 240;
  const pad = { left: 64, right: 24, top: 32, bottom: 36 };
  const x = (rate: number) => pad.left + rate * (width - pad.left - pad.right);
  const y = (cents: number) => height - pad.bottom - (cents / maxCents) * (height - pad.top - pad.bottom);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mx-auto h-auto w-full max-w-3xl" role="img" aria-label={points.map((row) => `${row.label}: ${percent(row.winRate)} win rate, ${money(row.cents)}`).join('; ')}>
      {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
        <g key={tick}>
          <line x1={x(tick)} x2={x(tick)} y1={pad.top} y2={height - pad.bottom} stroke="rgb(var(--line-hairline))" strokeWidth="1" />
          <text x={x(tick)} y={height - pad.bottom + 16} textAnchor="middle" className="fill-tertiary font-mono" fontSize="11">{`${tick * 100}%`}</text>
        </g>
      ))}
      <line x1={pad.left} x2={width - pad.right} y1={height - pad.bottom} y2={height - pad.bottom} stroke="rgb(var(--text-tertiary))" strokeWidth="1" />
      <text x={pad.left - 8} y={pad.top + 4} textAnchor="end" className="fill-tertiary font-mono" fontSize="11">{money(maxCents)}</text>
      <text x={pad.left - 8} y={height - pad.bottom} textAnchor="end" className="fill-tertiary font-mono" fontSize="11">$0</text>
      <text x={(width + pad.left) / 2} y={height - 4} textAnchor="middle" className="fill-tertiary" fontSize="11">Win rate</text>
      {points.map((row) => (
        <g key={row.key}>
          <circle cx={x(row.winRate ?? 0)} cy={y(row.cents ?? 0)} r="7" fill="rgb(var(--surface-ink))" stroke="rgb(var(--surface-clinical))" strokeWidth="2">
            <title>{`${row.label}: ${percent(row.winRate)} win rate, ${money(row.cents)}, ${row.count} deals`}</title>
          </circle>
          <text x={x(row.winRate ?? 0)} y={y(row.cents ?? 0) - 12} textAnchor="middle" className="fill-primary" fontSize="12">{row.label}</text>
        </g>
      ))}
    </svg>
  );
}

function SourceTable({ rows }: { rows: RepRow[] }) {
  if (!rows.length) return <EmptyChart text="Set a lead source on each account to see which sources win." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="font-mono text-specimen uppercase tracking-specimen text-tertiary">
            <th className="py-2 font-normal">Lead source</th>
            <th className="py-2 text-right font-normal">Deals</th>
            <th className="py-2 text-right font-normal">Deal value</th>
            <th className="py-2 text-right font-normal">Won</th>
            <th className="py-2 text-right font-normal">Lost</th>
            <th className="py-2 text-right font-normal">Win rate</th>
          </tr>
        </thead>
        <tbody className="font-mono text-data tabular-nums text-primary">
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-hairline">
              <td className="py-2 font-sans text-body-m">{row.label}</td>
              <td className="py-2 text-right">{row.count}</td>
              <td className="py-2 text-right">{money(row.cents)}</td>
              <td className="py-2 text-right">{row.won}</td>
              <td className="py-2 text-right">{row.lost}</td>
              <td className="py-2 text-right">{percent(row.winRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RepTable({ rows }: { rows: RepRow[] }) {
  if (!rows.length) return <EmptyChart text="No deals yet. Assign a sales rep on each account." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="font-mono text-specimen uppercase tracking-specimen text-tertiary">
            <th className="py-2 font-normal">Sales rep</th>
            <th className="py-2 text-right font-normal">Deals</th>
            <th className="py-2 text-right font-normal">Deal value</th>
            <th className="py-2 text-right font-normal">Won</th>
            <th className="py-2 text-right font-normal">Lost</th>
            <th className="py-2 text-right font-normal">Win rate</th>
          </tr>
        </thead>
        <tbody className="font-mono text-data tabular-nums text-primary">
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-hairline">
              <td className="py-2 font-sans text-body-m">{row.label}</td>
              <td className="py-2 text-right">{row.count}</td>
              <td className="py-2 text-right">{money(row.cents)}</td>
              <td className="py-2 text-right">{row.won}</td>
              <td className="py-2 text-right">{row.lost}</td>
              <td className="py-2 text-right">{percent(row.winRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, disabled }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; disabled?: boolean }) {
  return (
    <label className="flex flex-col gap-1 text-caption text-inverse">
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="border border-hairline bg-clinical px-3 py-2 text-body-m text-primary disabled:bg-bone disabled:text-tertiary"
      >
        <option value="">{disabled ? 'Not tracked yet' : 'All'}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function SourceLine({ name, source }: { name: string; source: Source }) {
  return (
    <li className="flex items-center justify-between gap-2 font-mono text-specimen uppercase tracking-specimen">
      <span>{name}</span>
      <span className={`rounded-chip border px-2 py-0.5 ${source.connected ? 'border-pass text-inverse' : 'border-attention text-inverse'}`}>
        {source.connected ? 'Connected' : 'Not connected'}
      </span>
    </li>
  );
}
