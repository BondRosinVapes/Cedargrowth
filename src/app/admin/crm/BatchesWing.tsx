'use client';

import { useState } from 'react';
import { PRODUCTS } from '@/lib/products';
import type { CrmBrand } from '@/lib/crm/engine';

type BatchRow = {
  id: string;
  productId: string;
  batchNumber: string;
  labName: string;
  testedOn: string;
  released: boolean;
};

async function crmFetch(path: string, init?: RequestInit): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers = new Headers(init?.headers);
  headers.set('x-cedargrowth-crm', '1');
  if (init?.body) headers.set('content-type', 'application/json');
  const res = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body: body as Record<string, unknown> };
}

export function BatchesWing({
  brand,
  batches,
  canManage,
  onChanged,
}: {
  brand: CrmBrand;
  batches: BatchRow[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const [notice, setNotice] = useState('');

  async function create(form: FormData) {
    const file = form.get('report');
    if (!(file instanceof File) || file.size < 1 || (file.type && file.type !== 'application/pdf')) {
      setNotice('Choose the lab report PDF.');
      return;
    }
    const res = await crmFetch('/api/admin/crm/batches', {
      method: 'POST',
      body: JSON.stringify({
        brand,
        productId: String(form.get('productId') || ''),
        batchNumber: String(form.get('batchNumber') || ''),
        labName: String(form.get('labName') || ''),
        testedOn: String(form.get('testedOn') || ''),
        contentType: 'application/pdf',
        byteSize: file.size,
      }),
    });
    if (res.body.ok !== true) {
      setNotice(typeof res.body.reason === 'string' ? res.body.reason : 'The batch was not saved.');
      return;
    }
    if (typeof res.body.uploadUrl === 'string') {
      const put = await fetch(res.body.uploadUrl, { method: 'PUT', headers: { 'content-type': 'application/pdf' }, body: file });
      if (!put.ok) {
        setNotice('The batch was recorded. The lab report upload did not finish.');
        onChanged();
        return;
      }
    }
    setNotice(res.body.configured === false ? 'The batch was recorded. Storage is not configured, so the PDF was not uploaded.' : 'Batch recorded. Release it after the lab report is uploaded.');
    onChanged();
  }

  async function release(id: string) {
    const res = await crmFetch('/api/admin/crm/batches', { method: 'PATCH', body: JSON.stringify({ brand, id }) });
    setNotice(res.body.ok === true ? 'Batch released.' : String(res.body.reason || 'The batch was not released.'));
    if (res.body.ok === true) onChanged();
  }

  return (
    <section className="flex flex-col gap-6">
      <p className="text-body-m text-secondary">Only a released batch is shown on the public site. A lab report is a PDF in the private crm-coa bucket.</p>
      {notice ? <p role="status" className="text-body-m text-primary">{notice}</p> : null}
      <ul className="flex flex-col gap-2">
        {batches.length === 0 ? <li className="text-caption text-tertiary">No batches recorded.</li> : batches.map((row) => {
          const product = PRODUCTS.find((item) => item.slug === row.productId);
          return (
            <li key={row.id} className="flex flex-col gap-2 border border-hairline bg-clinical p-3">
              <p className="text-body-m text-primary">{product?.name || row.productId}. Batch {row.batchNumber}.</p>
              <p className="text-caption text-tertiary">{row.labName}. Tested {row.testedOn}. {row.released ? 'Released' : 'Not released'}.</p>
              {canManage && !row.released ? <button type="button" onClick={() => release(row.id)} className="min-h-[44px] self-start border border-ink px-3 py-2 font-mono text-specimen uppercase text-primary">Release</button> : null}
            </li>
          );
        })}
      </ul>
      {canManage ? (
        <form onSubmit={(event) => { event.preventDefault(); create(new FormData(event.currentTarget)); }} className="grid grid-cols-1 gap-3 border border-hairline bg-clinical p-4">
          <h2 className="font-display text-body-l text-primary">Add a batch</h2>
          <label className="flex flex-col gap-1 text-caption text-tertiary">Product
            <select name="productId" className="min-h-[44px] border border-hairline bg-clinical px-3 text-body-m">
              {PRODUCTS.map((product) => <option key={product.slug} value={product.slug}>{product.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-caption text-tertiary">Batch number
            <input name="batchNumber" required className="min-h-[44px] border border-hairline bg-clinical px-3 text-body-m" />
          </label>
          <label className="flex flex-col gap-1 text-caption text-tertiary">Laboratory
            <input name="labName" required className="min-h-[44px] border border-hairline bg-clinical px-3 text-body-m" />
          </label>
          <label className="flex flex-col gap-1 text-caption text-tertiary">Test date
            <input name="testedOn" type="date" required className="min-h-[44px] border border-hairline bg-clinical px-3 text-body-m" />
          </label>
          <label className="flex flex-col gap-1 text-caption text-tertiary">Lab report PDF, 15 MB max
            <input name="report" type="file" accept="application/pdf" required className="min-h-[44px] text-body-m" />
          </label>
          <button type="submit" className="min-h-[44px] border border-ink bg-ink px-4 py-2 font-mono text-specimen uppercase text-inverse">Save batch</button>
        </form>
      ) : <p className="text-caption text-tertiary">Owners and administrators record and release batches.</p>}
    </section>
  );
}
