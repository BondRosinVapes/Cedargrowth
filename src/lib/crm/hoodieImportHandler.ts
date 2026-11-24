// Staff Hoodie import. Stages files, queues store matches, and publishes only
// after a named staff approver. It does not create CRM accounts.
// Q-B1 is pending: database access is the security definer functions only.

import { authorizeCrmRequest, canExport, type DeskGrant } from './engine';
import {
  HOODIE_BRAND,
  namedStaffLabel,
  parseHoodieFile,
  reviewPack,
  stagePayload,
  type PriorResolution,
  type StoreAccount,
} from './hoodieImport';

export type HoodieResult = { status: number; body: Record<string, unknown> };

export type HoodieDb = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        range: (from: number, to: number) => Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
      };
    };
  };
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

const headers = {
  'cache-control': 'private, no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

export const HOODIE_RESPONSE_HEADERS = headers;
const MAX_BYTES = 8_000_000;
const PAGE = 1000;

export async function handleHoodieImport(input: {
  actorId: string | null;
  approverLabel: string;
  grants: readonly DeskGrant[];
  request: Request;
  db: HoodieDb | null;
}): Promise<HoodieResult> {
  if (!input.actorId) return { status: 404, body: { ok: false, reason: 'Not found' } };
  const length = Number(input.request.headers.get('content-length') || 0);
  if (length > MAX_BYTES) return { status: 413, body: { ok: false, reason: 'The upload is too large.' } };
  const loaded = await readRequest(input.request);
  if ('status' in loaded) return loaded;
  const url = new URL(input.request.url);
  const auth = authorizeCrmRequest({
    actorId: input.actorId,
    grants: input.grants,
    method: input.request.method,
    requestOrigin: url.origin,
    headerOrigin: input.request.headers.get('origin'),
    headerMarker: input.request.headers.get('x-cedargrowth-crm'),
    headerFetchSite: input.request.headers.get('sec-fetch-site'),
    brandRaw: loaded.brand,
  });
  if (!auth.ok) return { status: auth.status, body: { ok: false, reason: auth.reason } };
  if (auth.brand !== HOODIE_BRAND) return { status: 403, body: { ok: false, reason: 'Hoodie import is CedarGrowth only.' } };
  if (!canExport(auth.role)) return { status: 403, body: { ok: false, reason: 'Only an owner or administrator can import.' } };
  const approver = namedStaffLabel(input.approverLabel);
  if (!input.db) return { status: 503, body: { ok: false, configured: false, reason: 'CRM storage is not configured.' } };

  if (loaded.action === 'publish') {
    if (!approver) return { status: 403, body: { ok: false, published: false, reason: 'A named staff approver is required.' } };
    const results = [];
    for (const runId of loaded.runIds) {
      const { data, error } = await input.db.rpc('hoodie_publish_import', { p_run_id: runId, p_approved_by: approver });
      if (error) return { status: 503, body: { ok: false, published: false, reason: 'The publish did not complete.' } };
      results.push(data && typeof data === 'object' ? data : { ok: false });
    }
    const published = results.every((row) => (row as { ok?: boolean; published?: boolean }).ok === true && (row as { published?: boolean }).published === true);
    return { status: published ? 200 : 409, body: { ok: published, published, approver, files: results } };
  }

  if (loaded.action === 'resolve') {
    if (!approver) return { status: 403, body: { ok: false, reason: 'A named staff approver is required.' } };
    if (loaded.choice === 'account') {
      const accounts = await loadAccounts(input.db);
      if ('error' in accounts) return { status: 503, body: { ok: false, reason: accounts.error } };
      if (!accounts.rows.some((account) => account.id === loaded.accountId)) {
        return { status: 400, body: { ok: false, reason: 'That account is not a CedarGrowth account. No account was created.' } };
      }
    }
    const { data, error } = await input.db.rpc('hoodie_resolve_match', {
      p_name_normalized: loaded.nameNormalized,
      p_choice: loaded.choice,
      p_account_id: loaded.choice === 'account' ? loaded.accountId : null,
      p_resolved_by: approver,
    });
    if (error) return { status: 503, body: { ok: false, reason: 'The match was not saved.' } };
    const body = data && typeof data === 'object' ? data as Record<string, unknown> : { ok: false };
    return { status: body.ok === true ? 200 : 409, body: { ...body, createdAccount: false } };
  }

  const staff = approver;
  if (!staff) return { status: 403, body: { ok: false, reason: 'A named staff person is required to stage a file.' } };
  const accounts = await loadAccounts(input.db);
  if ('error' in accounts) return { status: 503, body: { ok: false, reason: accounts.error } };
  const prior = await loadResolutions(input.db);
  if ('error' in prior) return { status: 503, body: { ok: false, reason: prior.error } };

  const parsed = reviewPack(loaded.files.map((file) => parseHoodieFile({
    fileName: file.fileName,
    csv: file.csv,
    bytes: file.bytes,
    reportType: file.reportType,
    periodMonth: loaded.periodMonth,
    compareMonth: loaded.compareMonth,
    accounts: accounts.rows,
    prior: prior.rows,
  })));
  const files = [];
  for (const file of parsed) {
    const needsPeriod = file.errors.some((error) => error.startsWith('Enter the sales month') || error.startsWith('Compare month'));
    if (!file.reportType || needsPeriod) {
      files.push({ fileName: file.fileName, sha256: file.sha256, duplicate: false, published: false, runId: null, status: 'rejected', errors: file.errors, warnings: file.warnings, queued: 0, createdAccount: false });
      continue;
    }
    const { data, error } = await input.db.rpc('hoodie_stage_import', {
      p_payload: stagePayload(file, staff, loaded.driveFileId),
    });
    if (error) return { status: 503, body: { ok: false, published: false, reason: 'The file could not be staged.' } };
    const row = data && typeof data === 'object' ? data as Record<string, unknown> : {};
    files.push({
      fileName: file.fileName,
      sha256: file.sha256,
      duplicate: row.duplicate === true,
      published: false,
      runId: row.run_id ?? null,
      status: row.status ?? file.status,
      errors: file.errors,
      warnings: file.warnings,
      queued: file.queue.length,
      createdAccount: false,
    });
  }
  const ok = files.some((file) => file.status === 'validated' || file.duplicate === true);
  return { status: ok ? 200 : 422, body: { ok, published: false, createdAccount: false, files } };
}

async function loadAccounts(db: HoodieDb): Promise<{ rows: StoreAccount[] } | { error: string }> {
  const rows: StoreAccount[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from('crm_accounts').select('id, display_name, city, county, license_ref').eq('brand', HOODIE_BRAND).range(from, from + PAGE - 1);
    if (error) return { error: 'CRM accounts could not be read.' };
    for (const row of data || []) {
      rows.push({
        id: String(row.id ?? ''),
        displayName: String(row.display_name ?? ''),
        city: row.city == null ? null : String(row.city),
        county: row.county == null ? null : String(row.county),
        licenseRef: row.license_ref == null ? null : String(row.license_ref),
      });
    }
    if (!data || data.length < PAGE) break;
  }
  return { rows };
}

async function loadResolutions(db: HoodieDb): Promise<{ rows: PriorResolution[] } | { error: string }> {
  const { data, error } = await db.rpc('hoodie_match_resolutions');
  if (error) return { error: 'Saved store matches could not be read.' };
  const list = Array.isArray(data) ? data : [];
  const rows: PriorResolution[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const choice = row.choice === 'account' || row.choice === 'none' ? row.choice : null;
    if (!choice || typeof row.name_normalized !== 'string') continue;
    rows.push({
      nameNormalized: row.name_normalized,
      choice,
      accountId: typeof row.account_id === 'string' ? row.account_id : null,
    });
  }
  return { rows };
}

type StageFile = { fileName: string; csv: string; bytes: Uint8Array; reportType: string | null };

type Loaded =
  | { action: 'stage'; brand: string; periodMonth: string | null; compareMonth: string | null; driveFileId: string | null; files: StageFile[] }
  | { action: 'publish'; brand: string; runIds: string[] }
  | { action: 'resolve'; brand: string; nameNormalized: string; choice: 'account' | 'none'; accountId: string | null }
  | HoodieResult;

async function readRequest(request: Request): Promise<Loaded> {
  const type = request.headers.get('content-type') || '';
  if (type.includes('multipart/form-data')) return readForm(request);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { status: 400, body: { ok: false, reason: 'Import could not be read.' } };
  }
  if (!body || typeof body !== 'object') return { status: 400, body: { ok: false, reason: 'Import could not be read.' } };
  const record = body as Record<string, unknown>;
  const brand = typeof record.brand === 'string' ? record.brand : '';
  if (record.action === 'publish') {
    const runIds = Array.isArray(record.runIds)
      ? record.runIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : typeof record.runId === 'string' ? [record.runId] : [];
    if (!runIds.length) return { status: 400, body: { ok: false, reason: 'Choose a staged file to publish.' } };
    return { action: 'publish', brand, runIds };
  }
  if (record.action === 'resolve') {
    const choice = record.choice === 'account' || record.choice === 'none' ? record.choice : null;
    const nameNormalized = typeof record.nameNormalized === 'string' ? record.nameNormalized : '';
    if (!choice || !nameNormalized) return { status: 400, body: { ok: false, reason: 'The match could not be read.' } };
    return {
      action: 'resolve',
      brand,
      nameNormalized,
      choice,
      accountId: typeof record.accountId === 'string' ? record.accountId : null,
    };
  }
  if (record.action !== 'stage') return { status: 400, body: { ok: false, reason: 'Import could not be read.' } };
  const files = Array.isArray(record.files) ? record.files : [];
  if (!files.length || files.length > 10) return { status: 400, body: { ok: false, reason: 'Upload between 1 and 10 CSV files.' } };
  const staged: StageFile[] = [];
  let bytes = 0;
  for (const item of files) {
    if (!item || typeof item !== 'object') return { status: 400, body: { ok: false, reason: 'Import could not be read.' } };
    const row = item as Record<string, unknown>;
    const fileName = typeof row.fileName === 'string' ? row.fileName : '';
    const csv = typeof row.csv === 'string' ? row.csv : '';
    if (!fileName || !csv) return { status: 400, body: { ok: false, reason: 'Each file needs a name and CSV text.' } };
    const encoded = new TextEncoder().encode(csv);
    bytes += encoded.byteLength;
    if (bytes > MAX_BYTES) return { status: 413, body: { ok: false, reason: 'The upload is too large.' } };
    staged.push({
      fileName,
      csv,
      bytes: encoded,
      reportType: typeof row.reportType === 'string' ? row.reportType : null,
    });
  }
  return {
    action: 'stage',
    brand,
    periodMonth: typeof record.periodMonth === 'string' ? record.periodMonth : null,
    compareMonth: typeof record.compareMonth === 'string' ? record.compareMonth : null,
    driveFileId: typeof record.driveFileId === 'string' ? record.driveFileId : null,
    files: staged,
  };
}

async function readForm(request: Request): Promise<Loaded> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return { status: 400, body: { ok: false, reason: 'Import could not be read.' } };
  }
  const brand = String(form.get('brand') || '');
  const action = String(form.get('action') || 'stage');
  if (action === 'publish') {
    const runIds = form.getAll('runId').map(String).filter(Boolean);
    if (!runIds.length) return { status: 400, body: { ok: false, reason: 'Choose a staged file to publish.' } };
    return { action: 'publish', brand, runIds };
  }
  const blobs = form.getAll('file');
  if (!blobs.length || blobs.length > 10) return { status: 400, body: { ok: false, reason: 'Upload between 1 and 10 CSV files.' } };
  const files: StageFile[] = [];
  let total = 0;
  for (const blob of blobs) {
    if (!(blob instanceof File)) return { status: 400, body: { ok: false, reason: 'Import could not be read.' } };
    if (!/\.csv$/i.test(blob.name)) return { status: 400, body: { ok: false, reason: 'Save the sheet as CSV first.' } };
    const bytes = new Uint8Array(await blob.arrayBuffer());
    total += bytes.byteLength;
    if (total > MAX_BYTES) return { status: 413, body: { ok: false, reason: 'The upload is too large.' } };
    files.push({ fileName: blob.name, csv: new TextDecoder('utf-8').decode(bytes), bytes, reportType: null });
  }
  return {
    action: 'stage',
    brand,
    periodMonth: String(form.get('periodMonth') || '') || null,
    compareMonth: String(form.get('compareMonth') || '') || null,
    driveFileId: String(form.get('driveFileId') || '') || null,
    files,
  };
}
