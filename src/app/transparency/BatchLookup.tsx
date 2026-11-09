'use client';

import { useState } from 'react';
import { Eyebrow } from '@/components/atoms/Eyebrow';

type Found = { id: string; batchNumber: string; product: string; labName: string; testedOn: string };

export function BatchLookup() {
  const [number, setNumber] = useState('');
  const [found, setFound] = useState<Found | null>(null);
  const [miss, setMiss] = useState('');
  const [report, setReport] = useState('');

  async function lookup(event: React.FormEvent) {
    event.preventDefault();
    setReport('');
    const res = await fetch(`/api/transparency/batch?number=${encodeURIComponent(number.trim())}`);
    const body = await res.json().catch(() => ({}));
    if (body.found === true && body.batch) {
      setFound(body.batch as Found);
      setMiss('');
      return;
    }
    setFound(null);
    setMiss(typeof body.reason === 'string' ? body.reason : 'No released batch with this number.');
  }

  async function openReport() {
    if (!found) return;
    const res = await fetch(`/api/transparency/batch?number=${encodeURIComponent(found.batchNumber)}&sign=1`);
    const body = await res.json().catch(() => ({}));
    if (typeof body.url === 'string') setReport(body.url);
    else setMiss(typeof body.reason === 'string' ? body.reason : 'The lab report could not be signed.');
  }

  return (
    <section className="bg-clinical py-16 md:py-24">
      <div className="mx-auto max-w-content px-page-margin-mobile md:px-page-margin">
        <form onSubmit={lookup} className="reveal flex max-w-editorial flex-col gap-6">
          <Eyebrow>Batch lookup</Eyebrow>
          <div className="flex flex-col gap-3">
            <label htmlFor="transparency-batch" className="font-mono text-specimen uppercase tracking-specimen text-tertiary">
              Batch number
            </label>
            <input
              id="transparency-batch"
              name="batch"
              value={number}
              onChange={(event) => setNumber(event.target.value)}
              placeholder="BATCH ID"
              autoComplete="off"
              className="min-h-[44px] border-b border-hairline bg-transparent py-2 font-mono text-data uppercase tracking-specimen text-primary placeholder:text-tertiary focus-visible:outline-none"
            />
            <button type="submit" className="min-h-[44px] self-start border border-ink px-4 py-2 font-mono text-specimen uppercase text-primary">Look up</button>
          </div>
          {found ? (
            <div className="flex flex-col gap-2 border border-hairline bg-clinical p-4">
              <p className="font-display text-heading-s text-primary">{found.product}</p>
              <p className="text-body-m text-secondary">Batch {found.batchNumber}. {found.labName}. Tested {found.testedOn}.</p>
              <button type="button" onClick={openReport} className="min-h-[44px] self-start border border-ink px-3 py-2 font-mono text-specimen uppercase text-primary">Lab report</button>
              {report ? <a href={report} className="text-body-m text-primary" target="_blank" rel="noreferrer">Open the lab report for 10 minutes</a> : null}
            </div>
          ) : null}
          {miss ? <p role="status" className="text-body-m text-secondary">{miss}</p> : null}
        </form>
      </div>
    </section>
  );
}
