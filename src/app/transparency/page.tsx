import type { Metadata } from 'next';
import { Eyebrow } from '@/components/atoms/Eyebrow';
import { Unknown } from '@/components/atoms/Unknown';
import { BatchLookup } from './BatchLookup';

export const metadata: Metadata = {
  title: 'Transparency',
  description:
    'How every CedarGrowth batch is tested by an independent, third-party laboratory before it is offered for sale.',
};

export default function TransparencyPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-parchment py-16 md:py-40">
        <div className="mx-auto max-w-content px-page-margin-mobile md:px-page-margin">
          <div className="reveal flex max-w-editorial flex-col gap-6">
            <Eyebrow>Transparency</Eyebrow>
            <h1 className="font-display text-display-l-m md:text-display-xl text-primary">
              Read any batch.
            </h1>
            <p className="text-body-m-m md:text-body-l text-secondary">
              Every batch we release is tested by an independent, third-party
              laboratory before it is offered for sale. The laboratory is not
              owned by CedarGrowth and does not report a result to us until
              testing is complete.
            </p>
            <p className="text-body-m-m md:text-body-l text-secondary">
              The result is a Certificate of Analysis, the record the
              laboratory issues for that batch. We publish it as the
              laboratory writes it, not a summary we write ourselves.
            </p>
          </div>
        </div>
      </section>

      <BatchLookup />

      {/* What is tested and why */}
      <section className="bg-parchment py-16 md:py-24">
        <div className="mx-auto max-w-content px-page-margin-mobile md:px-page-margin">
          <Eyebrow className="reveal mb-10">What is tested</Eyebrow>
          <div className="reveal grid grid-cols-1 gap-10 border-t border-hairline pt-10 md:grid-cols-3">
            <div className="flex flex-col gap-3">
              <h2 className="font-display text-heading-s-m md:text-heading-s text-primary">
                Cannabinoid profile
              </h2>
              <p className="text-body-m-m md:text-body-m text-secondary">
                Confirms the potency printed on the package against the
                potency measured in the batch, reported as the percentage of
                each cannabinoid present.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <h2 className="font-display text-heading-s-m md:text-heading-s text-primary">
                Terpene profile
              </h2>
              <p className="text-body-m-m md:text-body-m text-secondary">
                Records the terpenes present in the batch, the aromatic
                compounds that shape how one batch reads differently from
                another.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <h2 className="font-display text-heading-s-m md:text-heading-s text-primary">
                Contaminant screens
              </h2>
              <p className="text-body-m-m md:text-body-m text-secondary">
                Confirms the batch is free of substances that should not be
                in a product you consume.
              </p>
              <Unknown caption="Contaminant screen list, pending confirmation." />
            </div>
          </div>
        </div>
      </section>

      {/* Laboratory partners */}
      <section className="bg-clinical py-16 md:py-24">
        <div className="mx-auto max-w-content px-page-margin-mobile md:px-page-margin">
          <Eyebrow className="reveal mb-10">Laboratory partners</Eyebrow>
          <div className="reveal border-t border-hairline pt-10">
            <Unknown label="Laboratory partners" caption="UNKNOWN, PENDING CONFIRMATION" />
          </div>
        </div>
      </section>
    </>
  );
}
