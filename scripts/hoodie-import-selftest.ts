// Hoodie import self-test. Fixtures are truncated excerpts, not a data load.
// Run: node --experimental-strip-types --import ./scripts/crm-ts-loader.mjs scripts/hoodie-import-selftest.ts

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { handleHoodieImport, type HoodieDb } from '../src/lib/crm/hoodieImportHandler.ts';
import {
  VD_FIELDS,
  approveRun,
  centsOf,
  duplicateOf,
  matchStore,
  monthGap,
  naturalKey,
  parseHoodieFile,
  reviewPack,
  rowCountCheck,
  sha256Hex,
  upsertFacts,
  type Fact,
  type StoreAccount,
} from '../src/lib/crm/hoodieImport.ts';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

const root = join(import.meta.dirname, '..');
const fixtureDir = join(root, 'scripts/fixtures/hoodie');
const period = '2026-10-01';
const compare = '2026-09-01';

function readFixture(name: string) {
  const path = join(fixtureDir, name);
  const bytes = new Uint8Array(readFileSync(path));
  return { bytes, csv: new TextDecoder().decode(bytes) };
}

const accounts: StoreAccount[] = [
  { id: '11111111-1111-4111-8111-111111111111', displayName: 'Buffalo Dreams', city: 'Buffalo', county: 'Erie', licenseRef: 'OCM-1' },
  { id: '22222222-2222-4222-8222-222222222222', displayName: 'Herbal I.Q.', city: 'Depew', county: 'Erie', licenseRef: null },
  { id: '33333333-3333-4333-8333-333333333333', displayName: 'Herbal IQ - Depew', city: 'Depew', county: 'Erie', licenseRef: null },
  { id: '44444444-4444-4444-8444-444444444444', displayName: 'Same Name', city: 'Albany', county: 'Albany', licenseRef: null },
  { id: '55555555-5555-4555-8555-555555555555', displayName: 'Same Name', city: 'Buffalo', county: 'Erie', licenseRef: null },
];

const f1 = parseHoodieFile({ ...readFixture('2026-11-23_Hoodie_-_Monthly_Market_Sales.csv'), fileName: '2026-11-23_Hoodie_-_Monthly_Market_Sales.csv' });
const vapes = f1.facts.filter((fact) => fact.kind === 'market_sales');
assert(f1.status === 'validated' && f1.reportType === 'F1' && vapes.length === 2, 'F1 unpivots dated vape cells and drops the total row');
assert(vapes.some((fact) => fact.kind === 'market_sales' && fact.period_month === '2026-10-01' && fact.state === 'NY' && fact.category === 'Vapes' && fact.dollars === '20.50'), 'F1 maps New York to NY and keeps the October dollars');
assert(!f1.facts.some((fact) => fact.kind === 'market_sales' && fact.category.toLowerCase() === 'null') && f1.rows.length === 3, 'F1 stages the null category row and does not publish it');

const f2 = parseHoodieFile({ ...readFixture('2026-11-23_Hoodie_-_NY_vapes_Trended_Brand_Sales_MonthlySales.csv'), fileName: '2026-11-23_Hoodie_-_NY_vapes_Trended_Brand_Sales_MonthlySales.csv' });
const cedar = f2.facts.find((fact) => fact.kind === 'brand_month' && fact.brand_normalized === 'cedargrowth');
assert(f2.status === 'validated' && f2.facts.filter((fact) => fact.kind === 'brand_month' && fact.dollars === '0').length === 2 && cedar && cedar.kind === 'brand_month' && cedar.is_cedargrowth && cedar.source_report === 'F2', 'F2 keeps zero months and flags Cedar Growth');

const f3 = parseHoodieFile({ ...readFixture('2026-11-23_Hoodie_-_VD_NY_Vapes_by_Brand.csv'), fileName: '2026-11-23_Hoodie_-_VD_NY_Vapes_by_Brand.csv', periodMonth: period, compareMonth: compare });
const ayrloom = f3.facts.find((fact) => fact.kind === 'brand_month' && fact.brand_normalized === 'ayrloom');
assert(f3.reportType === 'F3' && f3.geography === 'NY' && ayrloom && ayrloom.kind === 'brand_month' && ayrloom.metrics?.total_dollars === '2714066.70' && ayrloom.metrics.acv_chg_pct === '-0.77' && ayrloom.dollars === null, 'F3 maps brand display, normalized name, and volume driver metrics');

const f4 = parseHoodieFile({
  ...readFixture('2026-11-23_Hoodie_-_VD_NY_Vapes_by_Dispensary.csv'),
  fileName: '2026-11-23_Hoodie_-_VD_NY_Vapes_by_Dispensary.csv',
  periodMonth: period,
  compareMonth: compare,
  accounts,
});
const residual = f4.facts.find((fact) => fact.kind === 'dispensary' && fact.name_normalized === 'nontrackednewyorksales');
const herbal = f4.facts.find((fact) => fact.kind === 'dispensary' && fact.name_raw === 'Herbal IQ - Depew');
const hive = f4.facts.find((fact) => fact.kind === 'dispensary' && fact.name_raw === 'The Hive - Amherst');
assert(residual && residual.kind === 'dispensary' && residual.match_status === 'residual' && residual.account_id === null && !f4.queue.some((row) => row.name_normalized === 'nontrackednewyorksales'), 'F4 residual sales are never matched or queued');
assert(herbal && herbal.kind === 'dispensary' && herbal.match_status === 'auto' && herbal.account_id === accounts[2].id && herbal.metrics.total_units === '4159.56' && herbal.metrics.total_dollars_chg_pct === '1.24' && herbal.metrics.dollars_per_mm_acv_chg_pct === '-0.75', 'F4 keeps fractional units and maps an exact store name');
assert(hive && hive.kind === 'dispensary' && hive.match_status === 'queued' && hive.metrics.acv_chg_pct === null && hive.metrics.total_dollars === '0', 'F4 turns N/A changes into null and queues an unmatched store');

const f5 = parseHoodieFile({ ...readFixture('2026-11-23_Hoodie_-_VD_NY_Vapes_by_Size.csv'), fileName: '2026-11-23_Hoodie_-_VD_NY_Vapes_by_Size.csv', periodMonth: period });
const sizeOf = (label: string) => f5.facts.find((fact) => fact.kind === 'size' && fact.size_label === label);
const mg = sizeOf('1000.00 mg');
const gram = sizeOf('2.00 gram');
const half = sizeOf('0.50 gram');
const each = sizeOf('1.00 each');
const blank = sizeOf('');
const oneMg = sizeOf('1.00 mg');
assert(mg && mg.kind === 'size' && mg.size_mg === 1000 && mg.size_unparsed === false && gram && gram.kind === 'size' && gram.size_mg === 2000 && half && half.kind === 'size' && half.size_mg === 500, 'F5 converts mg and gram sizes');
assert(each && each.kind === 'size' && each.size_mg === null && each.size_unparsed && blank && blank.kind === 'size' && blank.size_unparsed && oneMg && oneMg.kind === 'size' && oneMg.size_mg === null && oneMg.size_unparsed, 'F5 flags each, blank, and 1.00 mg');

const f6 = parseHoodieFile({ ...readFixture('2026-11-23_Hoodie_-_VD_NY_Vapes_by_Subsegment.csv'), fileName: '2026-11-23_Hoodie_-_VD_NY_Vapes_by_Subsegment.csv', periodMonth: period });
assert(f6.facts.some((fact) => fact.kind === 'subsegment' && fact.segment === 'Unassigned' && fact.sub_segment === 'Unassigned') && f6.facts.some((fact) => fact.kind === 'subsegment' && fact.segment === 'Disposables'), 'F6 maps a blank segment to Unassigned');

const f7 = parseHoodieFile({ ...readFixture('2026-11-23_Hoodie_-_NY_Vapes_1g_Segment_Price_Original.csv'), fileName: '2026-11-23_Hoodie_-_NY_Vapes_1g_Segment_Price_Original.csv' });
const price = f7.facts.find((fact) => fact.kind === 'price_week' && fact.segment === 'Disposables' && fact.week_start === '2026-11-22');
assert(f7.grain === 'week' && price && price.kind === 'price_week' && price.original_price_avg === '54.63022383' && price.unit_of_measure === '1000.00 mg', 'F7 keeps the original price decimals and the week start');

const f8 = parseHoodieFile({ ...readFixture('2026-11-23_Hoodie_-_NY_VD_Vapes_LiveRosin_by_Product.csv'), fileName: '2026-11-23_Hoodie_-_NY_VD_Vapes_LiveRosin_by_Product.csv', periodMonth: period });
const jetty = f8.facts.find((fact) => fact.kind === 'product' && fact.product_name.startsWith('Jetty'));
const joker = f8.facts.find((fact) => fact.kind === 'product' && fact.product_name.startsWith('Jokerz'));
assert(jetty && jetty.kind === 'product' && jetty.brand_parsed === 'Jetty Extracts' && jetty.brand_parse_status === 'parsed' && jetty.size_mg_parsed === 1000 && jetty.size_approximate && jetty.is_live_rosin, 'F8 parses a brand prefix and an approximate 1G size');
assert(joker && joker.kind === 'product' && joker.brand_parsed === null && joker.size_mg_parsed === 500, 'F8 leaves an unsure brand unparsed and reads 0.5g');

const f9 = parseHoodieFile({ ...readFixture('2026-11-23_Hoodie_-_ERIE_VD_Vapes_by_Brand.csv'), fileName: '2026-11-23_Hoodie_-_ERIE_VD_Vapes_by_Brand.csv', periodMonth: period });
const f10 = parseHoodieFile({
  ...readFixture('2026-11-23_Hoodie_-_ERIE_VD_Vapes_by_Dispensary.csv'),
  fileName: '2026-11-23_Hoodie_-_ERIE_VD_Vapes_by_Dispensary.csv',
  periodMonth: period,
  accounts,
});
const buffalo = f10.facts.find((fact) => fact.kind === 'dispensary' && fact.name_raw === 'Buffalo Dreams');
const erieHerbal = f10.facts.find((fact) => fact.kind === 'dispensary' && fact.name_raw === 'Herbal IQ - Depew');
assert(f9.geography === 'NY:Erie' && f10.geography === 'NY:Erie' && buffalo && buffalo.kind === 'dispensary' && buffalo.match_status === 'auto' && erieHerbal && erieHerbal.kind === 'dispensary' && erieHerbal.match_status === 'auto', 'F10 autos an Erie county name match');

const bytes = new TextEncoder().encode('cedargrowth,hoodie\n');
const hash = sha256Hex(bytes);
const again = sha256Hex(bytes);
const changed = sha256Hex(new TextEncoder().encode('cedargrowth,hoodie\r\n'));
assert(hash === again && hash.length === 64 && hash !== changed && duplicateOf(hash, new Set([hash])) && !duplicateOf(changed, new Set([hash])), 'checksum is stable per file byte and a repeat is a duplicate');

const first: Fact[] = [{ kind: 'market_sales', period_month: '2026-10-01', state: 'NY', category: 'Vapes', dollars: '10.00' }];
const second: Fact[] = [{ kind: 'market_sales', period_month: '2026-10-01', state: 'NY', category: 'Vapes', dollars: '20.50' }];
const once = upsertFacts(first, second);
const twice = upsertFacts(once, second);
assert(once.length === 1 && twice.length === 1 && once[0].kind === 'market_sales' && once[0].dollars === '20.50' && naturalKey(once[0]) === naturalKey(twice[0]) && JSON.stringify(once) === JSON.stringify(twice), 'upsert on the natural key replaces the value and a second upsert does not add a row');

const now = '2026-11-24T21:00:00.000Z';
const unnamed = approveRun({ status: 'validated', approver: 'Sales session', facts: second, approvedBy: null, approvedAt: null, now });
const rejected = approveRun({ status: 'rejected', approver: 'ops@cedargrowthco.com', facts: second, approvedBy: null, approvedAt: null, now });
const approved = approveRun({ status: 'validated', approver: 'ops@cedargrowthco.com', facts: second, approvedBy: null, approvedAt: null, now });
const repeated = approved.ok && approved.published
  ? approveRun({ status: 'published', approver: 'other@cedargrowthco.com', facts: approved.facts, approvedBy: approved.approvedBy, approvedAt: approved.approvedAt, now: '2026-11-25T00:00:00.000Z' })
  : null;
assert(!unnamed.ok && unnamed.published === false && !rejected.ok && rejected.published === false, 'approval refuses an unnamed session and a rejected file');
assert(approved.ok && approved.published && approved.approvedBy === 'ops@cedargrowthco.com' && approved.approvedAt === now && repeated && repeated.ok && repeated.published && repeated.idempotent && repeated.approvedBy === 'ops@cedargrowthco.com' && repeated.approvedAt === now && repeated.facts.length === 1, 'a named approver publishes once and a second approval keeps the original name and time');

const prefix = matchStore({ nameRaw: 'Herbal IQ - Depew', geography: 'NY', accounts: [accounts[1]], prior: null });
const several = matchStore({ nameRaw: 'Same Name', geography: 'NY', accounts, prior: null });
const erieMiss = matchStore({ nameRaw: 'Buffalo Dreams', geography: 'NY:Erie', accounts: [{ ...accounts[0], county: 'Kings' }], prior: null });
const reused = matchStore({ nameRaw: 'Buffalo Dreams', geography: 'NY:Erie', accounts: [], prior: { nameNormalized: 'buffalodreams', choice: 'account', accountId: accounts[0].id } });
const none = matchStore({ nameRaw: 'Buffalo Dreams', geography: 'NY', accounts, prior: { nameNormalized: 'buffalodreams', choice: 'none', accountId: null } });
const licensed = matchStore({ nameRaw: 'Unknown Store', geography: 'NY', licenseRef: 'OCM-1', accounts, prior: null });
assert(prefix.match_status === 'queued' && prefix.createAccount === false && prefix.queue?.reason.startsWith('Prefix only'), 'a prefix-only store is queued and no account is created');
assert(several.match_status === 'queued' && several.queue?.candidate_account_ids.length === 2, 'several accounts go to the queue');
assert(erieMiss.match_status === 'queued' && reused.match_status === 'manual' && reused.account_id === accounts[0].id && reused.queue === null && none.match_status === 'none', 'Erie county must agree, and a saved resolution is reused');
assert(licensed.match_status === 'auto' && licensed.account_id === accounts[0].id && licensed.createAccount === false, 'a license matches one account and still does not create one');

assert(rowCountCheck(100, null).status === 'no_prior' && rowCountCheck(100, 100).status === 'within' && rowCountCheck(70, 100).status === 'outside', 'row count warns outside 20 percent and skips a first file');
assert(monthGap('2026-09-01', '2026-10-01') === 'next' && monthGap('2026-08-01', '2026-10-01') === 'gap' && monthGap(null, '2026-10-01') === 'none', 'month gap follows the prior month');

const tieA = parseHoodieFile({
  fileName: 'tie_Monthly_Market_Sales.csv',
  csv: ',Sales Month,2026-10-01 00:00:00.000,Total\nState,Category,Dollars sum,Dollars sum\nNew York,Vapes,20.50,20.50\nTotal,,20.50,20.50\n',
});
const tieB = parseHoodieFile({
  fileName: 'tie_Trended_Brand_Sales_MonthlySales.csv',
  csv: 'Sales Month,2026-10-01 00:00:00.000,Total\nBrand,Dollars sum,Dollars sum\nJAUNTY,20.50,20.50\nTotal,20.50,20.50\n',
});
const metricCells = (dollars: string) => VD_FIELDS.map((field) => (field[1] === 'total_dollars' ? dollars : field[2] === 'change' ? '0' : '1')).join(',');
const metricHeader = VD_FIELDS.map((field) => field[0]).join(',');
const tieStores = parseHoodieFile({ fileName: 'tie_VD_NY_Vapes_by_Dispensary.csv', csv: `Dispensary,${metricHeader}\nOnly Store,${metricCells('20.50')}\n`, periodMonth: period, accounts: [] });
const tieSize = parseHoodieFile({ fileName: 'tie_VD_NY_Vapes_by_Size.csv', csv: `Category,Size,${metricHeader}\nVapes,1000.00 mg,${metricCells('20.50')}\n`, periodMonth: period });
const tieSub = parseHoodieFile({ fileName: 'tie_VD_NY_Vapes_by_Subsegment.csv', csv: `Category,Segment,Sub-segment,${metricHeader}\nVapes,Disposables,Disposables,${metricCells('20.50')}\n`, periodMonth: period });
const tied = reviewPack([tieA, tieB, tieStores, tieSize, tieSub]);
assert(tied.every((file) => file.status === 'validated' && !file.errors.length) && centsOf('20.50') === 2050n, 'a pack that ties to the cent stays publishable');
const short = reviewPack([
  tieA,
  { ...tieB, facts: tieB.facts.map((fact) => fact.kind === 'brand_month' ? { ...fact, dollars: '10.00' } : fact) },
  tieStores,
  tieSize,
  tieSub,
]);
assert(short.some((file) => file.errors.some((error) => error.includes('does not tie'))), 'a pack that misses the cent is rejected and not publishable');

const bad = parseHoodieFile({
  fileName: 'bad_VD_NY_Vapes_by_Brand.csv',
  csv: `Brand,${VD_FIELDS.map((field) => field[0]).join(',')}\nAYRLOOM,${VD_FIELDS.map((field) => (field[1] === 'total_dollars' ? 'N/A' : '0')).join(',')}\n`,
  periodMonth: period,
});
assert(bad.status === 'rejected' && bad.facts.length === 0 && bad.errors.some((error) => error.includes('N/A')), 'N/A in a value column rejects the file and publishes nothing');

const migration = readFileSync(join(root, 'supabase/migrations/0142_market_intel_hoodie.sql'), 'utf8');
const handlerSource = readFileSync(join(root, 'src/lib/crm/hoodieImportHandler.ts'), 'utf8');
const routeSource = readFileSync(join(root, 'src/app/api/admin/crm/hoodie-import/route.ts'), 'utf8');
for (const column of VD_FIELDS.map((field) => field[1])) {
  assert(migration.includes(column), `migration has ${column}`);
}
assert(migration.includes("check (brand = 'cedargrowth')") && migration.includes('force row level security') && migration.includes('revoke all on schema market_intel from public, anon, authenticated, service_role'), 'migration forces RLS, locks the brand, and revokes schema access');
assert(migration.includes('security definer') && migration.includes('set search_path = pg_catalog') && migration.includes('grant execute on function public.hoodie_publish_import(uuid, text) to service_role') && migration.includes('Q-B1 is PENDING'), 'migration uses the pending Q-B1 default: definer functions, pinned search path, service_role execute');
assert(!migration.includes('crm_bond') && !migration.includes('crm_receive_agent_records') && !migration.includes('pg_cron') && !migration.includes('cron.schedule') && !migration.includes('references public.crm_'), 'migration has no bond-table foreign key, no account writer, and no cron');
assert(!handlerSource.includes('crm_receive_agent_records') && !routeSource.includes('crm_receive_agent_records') && handlerSource.includes('createdAccount: false'), 'the route never calls the account writer');

type Run = { id: string; sha: string; status: string; facts: Fact[]; approvedBy: string | null; approvedAt: string | null; report: string };
const runs: Run[] = [];
const published = new Map<string, Fact>();
let rpcLog: string[] = [];
const db: HoodieDb = {
  from() {
    return { select: () => ({ eq: () => ({ range: async () => ({ data: accounts.map((account) => ({ id: account.id, display_name: account.displayName, city: account.city, county: account.county, license_ref: account.licenseRef })), error: null }) }) }) };
  },
  async rpc(fn, args) {
    rpcLog.push(fn);
    if (fn === 'hoodie_match_resolutions') return { data: [], error: null };
    if (fn === 'hoodie_stage_import') {
      const payload = (args?.p_payload ?? {}) as { sha256: string; report_type: string; fact_rows: Fact[]; validation_report: { errors: string[] } };
      const existing = runs.find((run) => run.sha === payload.sha256);
      if (existing) return { data: { ok: true, duplicate: true, published: false, run_id: existing.id, status: 'duplicate' }, error: null };
      const id = `run-${runs.length + 1}`;
      const status = payload.validation_report.errors.length ? 'rejected' : 'validated';
      runs.push({ id, sha: payload.sha256, status, facts: status === 'validated' ? payload.fact_rows : [], approvedBy: null, approvedAt: null, report: payload.report_type });
      return { data: { ok: true, duplicate: false, published: false, run_id: id, status }, error: null };
    }
    if (fn === 'hoodie_publish_import') {
      const run = runs.find((item) => item.id === args?.p_run_id);
      const decision = approveRun({
        status: (run?.status ?? 'rejected') as 'staged' | 'validated' | 'published' | 'superseded' | 'rejected',
        approver: String(args?.p_approved_by || ''),
        facts: run?.facts || [],
        approvedBy: run?.approvedBy ?? null,
        approvedAt: run?.approvedAt ?? null,
        now,
      });
      if (!run || !decision.ok || !decision.published) return { data: { ok: false, published: false }, error: null };
      if (!decision.idempotent) {
        for (const fact of upsertFacts([...published.values()], decision.facts)) published.set(naturalKey(fact), fact);
        run.status = 'published';
        run.approvedBy = decision.approvedBy;
        run.approvedAt = decision.approvedAt;
      }
      return { data: { ok: true, published: true, idempotent: decision.idempotent, approved_by: run.approvedBy, approved_at: run.approvedAt }, error: null };
    }
    return { data: { ok: false }, error: { message: 'unexpected' } };
  },
};

function request(body: unknown, label = 'ops@cedargrowthco.com', role: 'owner' | 'salesperson' = 'owner', actor: string | null = 'owner-1') {
  return handleHoodieImport({
    actorId: actor,
    approverLabel: label,
    grants: actor ? [{ brand: 'cedargrowth', role }] : [],
    request: new Request('https://www.cedargrowthco.com/api/admin/crm/hoodie-import', {
      method: 'POST',
      headers: {
        origin: 'https://www.cedargrowthco.com',
        'x-cedargrowth-crm': '1',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    }),
    db,
  });
}

const missing = await request({ actorId: null });
const anon = await handleHoodieImport({
  actorId: null,
  approverLabel: '',
  grants: [],
  request: new Request('https://www.cedargrowthco.com/api/admin/crm/hoodie-import', {
    method: 'POST',
    headers: { origin: 'https://www.cedargrowthco.com', 'x-cedargrowth-crm': '1', 'content-type': 'application/json' },
    body: JSON.stringify({ brand: 'cedargrowth', action: 'stage', files: [] }),
  }),
  db,
});
assert(anon.status === 404 && missing.status === 400, 'a missing session is not found and a body without an action is rejected');
const seller = await request({ brand: 'cedargrowth', action: 'stage', periodMonth: period, files: [{ fileName: '2026-11-23_Hoodie_-_VD_NY_Vapes_by_Dispensary.csv', csv: readFixture('2026-11-23_Hoodie_-_VD_NY_Vapes_by_Dispensary.csv').csv }] }, 'rep@cedargrowthco.com', 'salesperson');
assert(seller.status === 403, 'a salesperson cannot import');
const bond = await handleHoodieImport({
  actorId: 'owner-1',
  approverLabel: 'ops@cedargrowthco.com',
  grants: [{ brand: 'bond', role: 'owner' }, { brand: 'cedargrowth', role: 'owner' }],
  request: new Request('https://www.cedargrowthco.com/api/admin/crm/hoodie-import', {
    method: 'POST',
    headers: { origin: 'https://www.cedargrowthco.com', 'x-cedargrowth-crm': '1', 'content-type': 'application/json' },
    body: JSON.stringify({ brand: 'bond', action: 'publish', runId: 'run-1' }),
  }),
  db,
});
assert(bond.status === 403 && bond.body.reason === 'Hoodie import is CedarGrowth only.', 'a non-CedarGrowth brand is refused');

rpcLog = [];
const noPeriod = await request({
  brand: 'cedargrowth',
  action: 'stage',
  files: [{ fileName: '2026-11-23_Hoodie_-_VD_NY_Vapes_by_Dispensary.csv', csv: readFixture('2026-11-23_Hoodie_-_VD_NY_Vapes_by_Dispensary.csv').csv }],
});
assert(noPeriod.status === 422 && !rpcLog.includes('hoodie_stage_import') && published.size === 0, 'a volume driver file without a sales month is not staged and nothing is published');

const staged = await request({
  brand: 'cedargrowth',
  action: 'stage',
  periodMonth: period,
  compareMonth: compare,
  files: [{ fileName: '2026-11-23_Hoodie_-_VD_NY_Vapes_by_Dispensary.csv', csv: readFixture('2026-11-23_Hoodie_-_VD_NY_Vapes_by_Dispensary.csv').csv }],
});
const stagedFiles = staged.body.files as { duplicate?: boolean; published?: boolean; runId?: string; status?: string; queued?: number; createdAccount?: boolean }[];
assert(staged.status === 200 && staged.body.published === false && stagedFiles[0]?.status === 'validated' && stagedFiles[0]?.published === false && (stagedFiles[0]?.queued || 0) > 0 && stagedFiles[0]?.createdAccount === false && published.size === 0 && !rpcLog.includes('hoodie_publish_import'), 'stage checksums the file, queues stores, and does not publish');

const duplicate = await request({
  brand: 'cedargrowth',
  action: 'stage',
  periodMonth: period,
  files: [{ fileName: '2026-11-23_Hoodie_-_VD_NY_Vapes_by_Dispensary.csv', csv: readFixture('2026-11-23_Hoodie_-_VD_NY_Vapes_by_Dispensary.csv').csv }],
});
const duplicateFiles = duplicate.body.files as { duplicate?: boolean; runId?: string }[];
assert(duplicateFiles[0]?.duplicate === true && duplicateFiles[0]?.runId === stagedFiles[0]?.runId && runs.length === 1, 'the same checksum is flagged as a duplicate and is not loaded again');

const unnamedPublish = await request({ brand: 'cedargrowth', action: 'publish', runId: stagedFiles[0]?.runId }, 'Sales session');
assert(unnamedPublish.status === 403 && unnamedPublish.body.published === false && !rpcLog.includes('hoodie_publish_import') && published.size === 0, 'publish without a named staff person does not write facts');

const publishedOnce = await request({ brand: 'cedargrowth', action: 'publish', runId: stagedFiles[0]?.runId });
const countAfterFirst = published.size;
const publishedTwice = await request({ brand: 'cedargrowth', action: 'publish', runIds: [stagedFiles[0]?.runId] });
const after = [...published.values()];
assert(publishedOnce.status === 200 && publishedOnce.body.published === true && publishedTwice.status === 200 && published.size === countAfterFirst && runs[0]?.approvedBy === 'ops@cedargrowthco.com' && runs[0]?.approvedAt === now, 'publish records the approver and a second publish does not add rows');
assert(after.filter((fact) => fact.kind === 'dispensary').length === 4 && new Set(after.map(naturalKey)).size === after.length, 'published dispensary rows are one per natural key');

const replacement: Fact[] = [{ kind: 'market_sales', period_month: '2026-10-01', state: 'NY', category: 'Vapes', dollars: '30.00' }];
const replaced = upsertFacts(after, replacement);
const replacedAgain = upsertFacts(replaced, replacement);
assert(replaced.filter((fact) => fact.kind === 'market_sales').length === 1 && replacedAgain.filter((fact) => fact.kind === 'market_sales' && fact.dollars === '30.00').length === 1, 'a later period upsert replaces the published dollars once');

if (failures) {
  console.error(`${failures} failed`);
  process.exit(1);
}
console.log('hoodie import self-test passed');
