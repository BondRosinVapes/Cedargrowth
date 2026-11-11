'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  dollarsToCents,
  LEAD_SOURCE_LABELS,
  LEAD_SOURCES,
  OPPORTUNITY_STAGES,
  PRODUCT_LINES,
  PRODUCT_LINE_LABELS,
  type CrmBrand,
} from '@/lib/crm/engine';
import { STAGE_LABELS } from '@/lib/crm/dashboard';
import { WON_MERGE_FAILED } from '@/lib/crm/distributionMerge';
import { IMPORT_BATCH, IMPORT_MAX_ROWS, chunkImportRows, mapRows, mergeBatchOutcomes, parseCsv, skipRepeatedImportRows, TEMPLATES, type ImportKind, type ImportRow } from '@/lib/crm/importer';

type Outcome = { line: number; status: 'ready' | 'created' | 'updated' | 'unmatched' | 'skipped' | 'error'; reason?: string; orderId?: string };

async function send(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set('x-cedargrowth-crm', '1');
  if (init?.body) headers.set('content-type', 'application/json');
  const res = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

const input = 'border border-hairline bg-clinical px-3 py-2 text-body-m text-primary';
const label = 'flex flex-col gap-1 text-caption text-tertiary';
const primaryButton = 'border border-ink bg-ink px-4 py-2 font-mono text-specimen uppercase text-inverse disabled:opacity-40';
const secondaryButton = 'border border-ink px-4 py-2 font-mono text-specimen uppercase text-primary disabled:opacity-40';

export function QuickAdd({ brand, onSaved }: { brand: CrmBrand; onSaved: () => void }) {
  const [accounts, setAccounts] = useState<{ id: string; displayName: string }[]>([]);
  const [message, setMessage] = useState('');
  const [stage, setStage] = useState('lead');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    send(`/api/admin/crm/accounts?brand=${brand}`).then((res) => setAccounts((res.body.accounts as { id: string; displayName: string }[]) || []));
  }, [brand, reload]);

  async function addAccount(form: HTMLFormElement) {
    const data = new FormData(form);
    const res = await send('/api/admin/crm/accounts', {
      method: 'POST',
      body: JSON.stringify({
        brand,
        displayName: String(data.get('displayName') || ''),
        status: 'prospect',
        accountType: String(data.get('accountType') || '') || null,
        leadSource: String(data.get('leadSource') || '') || null,
        assignedRep: String(data.get('assignedRep') || '') || null,
        city: String(data.get('city') || '') || null,
      }),
    });
    setMessage(res.body.ok ? 'Account added.' : String(res.body.reason || 'Account was not saved.'));
    if (res.body.ok) { form.reset(); setReload((value) => value + 1); onSaved(); }
  }

  async function addDeal(form: HTMLFormElement) {
    const data = new FormData(form);
    const cents = dollarsToCents(String(data.get('amount') || ''));
    if (cents === 'invalid') { setMessage('Amount must be dollars and cents, or empty.'); return; }
    const res = await send('/api/admin/crm/opportunities', {
      method: 'POST',
      body: JSON.stringify({
        brand,
        accountId: String(data.get('accountId') || ''),
        name: String(data.get('name') || ''),
        stage: String(data.get('stage') || 'lead'),
        forecastCents: cents,
        expectedCloseOn: String(data.get('expectedCloseOn') || '') || null,
        productLine: String(data.get('productLine') || '') || null,
        quantityUnits: String(data.get('quantityUnits') || '') === '' ? null : Number(data.get('quantityUnits')),
        lossReason: String(data.get('lossReason') || '') || null,
      }),
    });
    setMessage(res.body.mergeFailed ? WON_MERGE_FAILED : (res.body.ok ? 'Deal added.' : String(res.body.reason || 'Deal was not saved.')));
    if (res.body.ok) { form.reset(); setStage('lead'); onSaved(); }
  }

  return (
    <div className="flex flex-col gap-4 border border-hairline bg-clinical p-4">
      {message ? <p role="status" className="border border-hairline bg-bone px-3 py-2 text-body-m text-primary">{message}</p> : null}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <form onSubmit={(event) => { event.preventDefault(); addAccount(event.currentTarget); }} className="flex flex-col gap-3">
          <h3 className="font-display text-body-l text-primary">New account</h3>
          <label className={label}>Account name<input name="displayName" required className={input} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>Account type
              <select name="accountType" defaultValue="" className={input}>
                <option value="">Not set</option>
                {ACCOUNT_TYPES.map((type) => <option key={type} value={type}>{ACCOUNT_TYPE_LABELS[type]}</option>)}
              </select>
            </label>
            <label className={label}>Lead source
              <select name="leadSource" defaultValue="" className={input}>
                <option value="">Not set</option>
                {LEAD_SOURCES.map((source) => <option key={source} value={source}>{LEAD_SOURCE_LABELS[source]}</option>)}
              </select>
            </label>
            <label className={label}>Sales rep<input name="assignedRep" className={input} /></label>
            <label className={label}>City or region<input name="city" className={input} /></label>
          </div>
          <button type="submit" className={`${primaryButton} w-fit`}>Add account</button>
        </form>
        <form onSubmit={(event) => { event.preventDefault(); addDeal(event.currentTarget); }} className="flex flex-col gap-3">
          <h3 className="font-display text-body-l text-primary">New deal</h3>
          <label className={label}>Account
            <select name="accountId" required defaultValue="" className={input}>
              <option value="" disabled>{accounts.length ? 'Choose an account' : 'Add an account first'}</option>
              {accounts.map((row) => <option key={row.id} value={row.id}>{row.displayName}</option>)}
            </select>
          </label>
          <label className={label}>Deal name<input name="name" required className={input} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>Stage
              <select name="stage" value={stage} onChange={(event) => setStage(event.target.value)} className={input}>
                {OPPORTUNITY_STAGES.map((item) => <option key={item} value={item}>{STAGE_LABELS[item]}</option>)}
              </select>
            </label>
            <label className={label}>Amount (dollars)<input name="amount" inputMode="decimal" className={input} /></label>
            <label className={label}>Expected close<input name="expectedCloseOn" type="date" className={input} /></label>
            <label className={label}>Product line
              <select name="productLine" defaultValue="" className={input}>
                <option value="">Not set</option>
                {PRODUCT_LINES.map((line) => <option key={line} value={line}>{PRODUCT_LINE_LABELS[line]}</option>)}
              </select>
            </label>
            <label className={label}>Quantity (units)<input name="quantityUnits" inputMode="numeric" className={input} /></label>
            {stage === 'lost' ? <label className={label}>Loss reason<input name="lossReason" required className={input} /></label> : null}
          </div>
          <button type="submit" disabled={!accounts.length} className={`${primaryButton} w-fit`}>Add deal</button>
        </form>
      </div>
    </div>
  );
}

export function SpreadsheetUpload({ brand, onSaved }: { brand: CrmBrand; onSaved: () => void }) {
  const [kind, setKind] = useState<ImportKind>('accounts');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const [phase, setPhase] = useState<'idle' | 'checking' | 'checked' | 'importing' | 'done'>('idle');
  const [accounts, setAccounts] = useState<{ id: string; displayName: string }[]>([]);
  const [links, setLinks] = useState<Record<string, string>>({});
  const runLock = useRef(false);
  useEffect(() => {
    if (kind !== 'orders') return;
    send(`/api/admin/crm/accounts?brand=${brand}`).then((res) => setAccounts((res.body.accounts as { id: string; displayName: string }[]) || []));
  }, [brand, kind]);

  function reset() { setRows([]); setProblems([]); setUnmatched([]); setOutcomes(null); setPhase('idle'); setFileName(''); }

  async function run(commit: boolean, list: ImportRow[]) {
    const ready = list.filter((row) => row.record);
    const repeated = skipRepeatedImportRows(kind, ready);
    const results: Outcome[] = list.filter((row) => row.error).map((row) => ({ line: row.line, status: 'error', reason: row.error }));
    results.push(...repeated.skipped);
    for (const batch of chunkImportRows(repeated.send, IMPORT_BATCH)) {
      const res = await send('/api/admin/crm/import', { method: 'POST', body: JSON.stringify({ brand, kind, commit, rows: batch }) });
      if (!res.body.ok) {
        results.push(...mergeBatchOutcomes(batch, null, String(res.body.reason || 'The CRM did not accept this batch.')));
        continue;
      }
      results.push(...mergeBatchOutcomes(batch, (res.body.outcomes as Outcome[]) || []));
    }
    return results.sort((a, b) => a.line - b.line);
  }

  async function onFile(file: File | undefined) {
    if (runLock.current) return;
    runLock.current = true;
    try {
      reset();
      if (!file) return;
      setFileName(file.name);
      if (!/\.csv$/i.test(file.name)) { setProblems(['Save the sheet as CSV first. In Excel or Google Sheets: File, then Save as or Download, then CSV.']); return; }
      const text = await file.text();
      const mapped = mapRows(kind, parseCsv(text));
      setUnmatched(mapped.unmatched);
      const found: string[] = [];
      if (mapped.truncated) found.push(`This file has ${mapped.rowCount} data rows. Import reads at most ${IMPORT_MAX_ROWS} rows. Split the file and upload the rest. Nothing was checked.`);
      if (mapped.missing.length) found.push(`Missing column: ${mapped.missing.join(', ')}. Download the template to see the expected headers.`);
      if (found.length) { setProblems(found); return; }
      if (!mapped.rows.length) { setProblems(['The file has headers but no rows.']); return; }
      setRows(mapped.rows);
      setPhase('checking');
      setOutcomes(await run(false, mapped.rows));
      setPhase('checked');
    } finally {
      runLock.current = false;
    }
  }

  async function commit() {
    if (runLock.current) return;
    runLock.current = true;
    setPhase('importing');
    try {
      const results = await run(true, rows);
      setOutcomes(results);
      setPhase('done');
      onSaved();
    } finally {
      runLock.current = false;
    }
  }

  const count = (status: Outcome['status']) => (outcomes || []).filter((row) => row.status === status).length;
  const errors = (outcomes || []).filter((row) => row.status === 'error' || row.status === 'skipped');
  const template = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATES[kind])}`;

  return (
    <div className="flex flex-col gap-4 border border-hairline bg-clinical p-4">
      <div className="flex flex-wrap items-end gap-4">
        <label className={label}>What is in the file
          <select value={kind} onChange={(event) => { setKind(event.target.value as ImportKind); reset(); }} className={input}>
            <option value="accounts">Accounts (stores and buyers)</option>
            <option value="contacts">Contacts (people at accounts)</option>
            <option value="deals">Deals</option>
            <option value="orders">Distributor orders</option>
            <option value="retailers">State dispensary list</option>
          </select>
        </label>
        <label className={label}>CSV file
          <input key={`${kind}-${phase === 'idle' ? 'empty' : 'set'}`} type="file" accept=".csv,text/csv" disabled={phase === 'checking' || phase === 'importing'} onChange={(event) => onFile(event.target.files?.[0])} className="text-body-m text-primary" />
        </label>
        <a href={template} download={`cedargrowth-${kind}-template.csv`} className="cedar-underline pb-2 font-mono text-specimen uppercase tracking-specimen">Download template</a>
      </div>
      <p className="text-caption text-tertiary">
        {kind === 'accounts'
          ? 'Needs an Account name column. Optional: Status, Account type, Lead source, Sales rep, City, County, License number, License expiry, Notes, plus Address, ZIP, Region, Phone, Email, Website, License status, and Operating, which are kept in the account notes. County must be a New York county. An account whose license number is already in the CRM, or repeated in this file, is skipped. Without a license number, an existing name is skipped.'
          : kind === 'contacts'
            ? 'Needs Contact name plus Account license or Account name. Optional: Email, Phone, Title. Import accounts first. Each contact is matched by license number, then by a unique account name. A contact whose email is already on that account is skipped. More than one match is reported. Saving a contact is not consent to contact them.'
            : kind === 'orders'
            ? 'Needs Order ID and Retailer. Optional: License, Order Date, Delivery Date, Status, Invoice Total, Payment Status, Paid Date, Payout, Payout Date. A repeat Order ID updates that order. Unmatched retailers are not created.'
            : kind === 'retailers'
              ? 'Needs License number, Name, and County. License type is optional. County must be a New York county. This list is the coverage denominator, not a set of CRM accounts.'
              : 'Needs Account and Deal name columns. Optional: Stage, Amount, Close date, Product line, Quantity, Next action, Loss reason, Notes. Import accounts first; each deal is matched to an account by name.'}
        {' '}Nothing is saved until you press Import.
      </p>
      {problems.map((text) => <p key={text} role="alert" className="border border-attention px-3 py-2 text-body-m text-primary">{text}</p>)}
      {unmatched.length ? <p className="text-caption text-tertiary">Columns not used: {unmatched.join(', ')}.</p> : null}
      {phase === 'checking' ? <p className="font-mono text-specimen uppercase tracking-specimen text-tertiary">Checking {rows.length} rows</p> : null}
      {phase === 'importing' ? <p className="font-mono text-specimen uppercase tracking-specimen text-tertiary">Importing</p> : null}
      {outcomes && (phase === 'checked' || phase === 'importing' || phase === 'done') ? (
        <div className="flex flex-col gap-3">
          <p className="text-body-m text-primary">
            {fileName}: {phase === 'done' ? `${count('created')} imported` : `${count('ready')} ready to import`}, {count('updated')} updated, {count('unmatched')} unmatched, {count('skipped')} skipped, {count('error')} with problems.
          </p>
          {errors.length ? (
            <ul className="max-h-48 overflow-y-auto border border-hairline">
              {errors.slice(0, 200).map((row) => (
                <li key={`${row.line}-${row.status}`} className="border-b border-hairline px-3 py-1 text-caption text-secondary last:border-b-0">
                  <span className="font-mono text-specimen text-tertiary">Row {row.line}</span> {row.status === 'skipped' ? 'Skipped.' : 'Problem.'} {row.reason}
                </li>
              ))}
            </ul>
          ) : null}
          {phase === 'done' ? (outcomes || []).filter((row) => row.status === 'unmatched' && row.orderId).map((row) => (
            <div key={row.orderId} className="flex flex-wrap items-end gap-2 border border-hairline px-3 py-2">
              <p className="text-caption text-secondary">Row {row.line} did not match a retailer.</p>
              <label className={label}>Link to account
                <select value={links[row.orderId || ''] || ''} onChange={(event) => setLinks((current) => ({ ...current, [row.orderId || '']: event.target.value }))} className={input}>
                  <option value="">Choose</option>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.displayName}</option>)}
                </select>
              </label>
              <button type="button" disabled={!links[row.orderId || '']} onClick={async () => {
                const res = await send('/api/admin/crm/distributor-orders', { method: 'POST', body: JSON.stringify({ brand, action: 'link', orderId: row.orderId, accountId: links[row.orderId || ''] }) });
                setProblems(res.body.ok ? [] : [String(res.body.reason || 'The retailer was not linked.')]);
                if (res.body.ok) onSaved();
              }} className={secondaryButton}>Link to account</button>
            </div>
          )) : null}
          <div className="flex gap-3">
            {phase === 'checked' || phase === 'importing' ? <button type="button" disabled={phase !== 'checked' || (!count('ready') && !count('unmatched'))} onClick={commit} className={primaryButton}>Import {count('ready') + count('unmatched')} rows</button> : null}
            <button type="button" onClick={reset} className={secondaryButton}>{phase === 'done' ? 'Upload another file' : 'Cancel'}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
