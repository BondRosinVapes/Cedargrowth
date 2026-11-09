import type { Metadata } from 'next';
import { AGE_LINE } from '@/lib/site';
import { ReorderForm } from './ReorderForm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Reorder',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function ReorderPage({ params }: { params: { token: string } }) {
  return (
    <section className="bg-parchment py-16 md:py-24">
      <div className="mx-auto flex w-full max-w-editorial flex-col gap-6 px-page-margin-mobile md:px-page-margin">
        <p className="font-sans text-eyebrow-m font-medium uppercase text-tertiary md:text-eyebrow">Reorder</p>
        <h1 className="font-display text-heading-m-m text-primary md:text-heading-m">Request a reorder</h1>
        <p className="text-body-m text-secondary">
          This is a request, not an order and not an invoice. No price is committed and no payment is taken.
          Your CedarGrowth rep places the order through the distributor, which invoices and collects.
        </p>
        <p className="font-mono text-specimen uppercase text-tertiary">{AGE_LINE}</p>
        <ReorderForm token={params.token} />
      </div>
    </section>
  );
}
