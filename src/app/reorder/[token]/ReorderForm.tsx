'use client';

import { useEffect, useState } from 'react';

type ProductRow = {
  productId: string;
  name: string;
  spec: string;
  batch: { id: string; batchNumber: string; labName: string; testedOn: string } | null;
};

const field = 'min-h-[44px] border border-hairline bg-clinical px-3 text-body-m text-primary';
const button = 'min-h-[44px] border border-ink bg-ink px-4 py-3 font-mono text-specimen uppercase text-inverse disabled:opacity-40';

export function ReorderForm({ token }: { token: string }) {
  const [phase, setPhase] = useState<'loading' | 'open' | 'closed'>('loading');
  const [accountName, setAccountName] = useState('');
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [note, setNote] = useState('');
  const [reports, setReports] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancel = false;
    fetch(`/api/reorder/${encodeURIComponent(token)}`, { headers: { 'x-cedargrowth-crm': '1' } })
      .then((res) => res.json().then((body) => ({ status: res.status, body })))
      .then((res) => {
        if (cancel) return;
        if (res.status !== 200 || res.body.ok !== true) {
          setPhase('closed');
          setNotice(typeof res.body.reason === 'string' ? res.body.reason : 'This reorder link is not available.');
          return;
        }
        setPhase('open');
        setAccountName(String(res.body.accountName || ''));
        setProducts((res.body.products as ProductRow[]) || []);
      })
      .catch(() => { if (!cancel) { setPhase('closed'); setNotice('This reorder link is not available.'); } });
    return () => { cancel = true; };
  }, [token]);

  async function openReport(batchId: string) {
    const res = await fetch(`/api/reorder/${encodeURIComponent(token)}/report?batchId=${encodeURIComponent(batchId)}`);
    const body = await res.json().catch(() => ({}));
    if (res.ok && typeof body.url === 'string') setReports((current) => ({ ...current, [batchId]: body.url }));
    else setNotice(typeof body.reason === 'string' ? body.reason : 'The lab report could not be signed.');
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const lines = products.flatMap((product) => {
      const quantity = Number(quantities[product.productId] || '');
      if (!product.batch || !Number.isInteger(quantity) || quantity < 1) return [];
      return [{ productId: product.productId, batchNumber: product.batch.batchNumber, quantityUnits: quantity }];
    });
    const res = await fetch(`/api/reorder/${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cedargrowth-crm': '1' },
      body: JSON.stringify({ buyerName, buyerEmail, note, lines }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.ok === true && typeof body.confirmation === 'string') {
      setConfirmation(body.confirmation);
      setNotice('');
      return;
    }
    setNotice(typeof body.reason === 'string' ? body.reason : 'The request was not saved.');
  }

  if (phase !== 'open') {
    return notice ? <p role="status" className="border border-attention px-3 py-3 text-body-m text-primary">{notice}</p> : <p className="text-body-m text-secondary">Loading the reorder.</p>;
  }

  if (confirmation) {
    return (
      <div className="flex flex-col gap-3 border border-hairline bg-clinical p-4">
        <h2 className="font-display text-heading-s text-primary">Request received</h2>
        <p className="text-body-m text-primary">{confirmation}</p>
        <p className="text-body-m text-secondary">No payment was taken.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {accountName ? <p className="font-display text-heading-s text-primary">{accountName}</p> : null}
      {notice ? <p role="status" className="border border-attention px-3 py-3 text-body-m text-primary">{notice}</p> : null}
      {products.map((product) => (
        <article key={product.productId} className="flex flex-col gap-2 border border-hairline bg-clinical p-3">
          <h2 className="font-display text-body-l text-primary">{product.name}</h2>
          <p className="font-mono text-specimen text-tertiary">{product.spec}</p>
          {product.batch ? (
            <>
              <p className="text-body-m text-secondary">Batch {product.batch.batchNumber}. {product.batch.labName}. Tested {product.batch.testedOn}.</p>
              <button type="button" onClick={() => openReport(product.batch?.id || '')} className="min-h-[44px] self-start border border-ink px-3 py-2 font-mono text-specimen uppercase text-primary">Lab report</button>
              {reports[product.batch.id] ? <a href={reports[product.batch.id]} className="text-body-m text-primary" target="_blank" rel="noreferrer">Open the lab report for 10 minutes</a> : null}
              <label className="flex flex-col gap-1 text-caption text-tertiary">Units
                <input inputMode="numeric" value={quantities[product.productId] || ''} onChange={(event) => setQuantities((current) => ({ ...current, [product.productId]: event.target.value }))} className={field} />
              </label>
            </>
          ) : <p className="text-body-m text-secondary">No released batch.</p>}
        </article>
      ))}
      <label className="flex flex-col gap-1 text-caption text-tertiary">Your name
        <input value={buyerName} onChange={(event) => setBuyerName(event.target.value)} required className={field} />
      </label>
      <label className="flex flex-col gap-1 text-caption text-tertiary">Your email
        <input type="email" value={buyerEmail} onChange={(event) => setBuyerEmail(event.target.value)} required className={field} />
      </label>
      <label className="flex flex-col gap-1 text-caption text-tertiary">Note
        <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} className="min-h-[88px] border border-hairline bg-clinical px-3 py-3 text-body-m text-primary" />
      </label>
      <button type="submit" className={button} disabled={!accountName}>Submit request</button>
    </form>
  );
}
