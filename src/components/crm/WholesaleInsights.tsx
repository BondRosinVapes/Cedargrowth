import Link from 'next/link';
import { isAdmin } from '@/lib/kelvinAuth';
import { currentAdmin } from '@/lib/kelvinSession';
import {
  CRM_ROUTE,
  projectWholesaleInsights,
  signalLines,
  WHOLESALE_BRAND,
  WHOLESALE_ROUTE,
} from '@/lib/crm/engine';
import { loadBrandSnapshot, staffAudience } from '@/lib/crm/handlers';
import { getCrmStore } from '@/lib/crm/store';

// Staff-only reading of the same CRM intelligence records. Public and retailer
// sessions render nothing. Bond is not queried. Notes are not rendered.

export async function WholesaleInsights() {
  const email = await currentAdmin();
  const audience = staffAudience(email, isAdmin(email));
  if (audience.kind !== 'staff') return null;

  const snapshot = await loadBrandSnapshot(getCrmStore(), WHOLESALE_BRAND, new Date().toISOString().slice(0, 10));
  const view = projectWholesaleInsights({
    audience,
    requestedBrand: WHOLESALE_BRAND,
    snapshot,
  });
  if (!view.visible || !view.desk || view.brand !== WHOLESALE_BRAND) return null;

  const sections = signalLines(view.desk);

  return (
    <section id="wholesale-signals" className="bg-clinical py-16 md:py-24" aria-label="Wholesale signals">
      <div className="mx-auto flex max-w-content flex-col gap-8 px-page-margin-mobile md:px-page-margin">
        <div className="flex max-w-editorial flex-col gap-4">
          <p className="font-sans text-eyebrow-m md:text-eyebrow font-medium uppercase text-tertiary">CedarGrowth wholesale</p>
          <h2 className="font-display text-heading-m-m md:text-heading-m text-primary">Signals</h2>
          <p className="text-body-m-m md:text-body-m text-secondary">
            This block reads the same sales-intelligence records as the internal desk. It is CedarGrowth only.
            Bond is not included. Recommendations are not orders.
          </p>
          <p className="font-mono text-specimen text-tertiary">
            {view.desk.canix.label}. {view.desk.hoodie.label}. Alerts are not activated.
            {view.storage === 'absent' ? ' CRM storage is not configured.' : ' No live refresh has run.'}
          </p>
          <Link href={CRM_ROUTE} className="cedar-underline w-fit font-mono text-specimen uppercase tracking-specimen text-primary">
            Open the sales desk
          </Link>
        </div>
          {view.storage === 'ok' && view.counts ? (
          <dl className="grid grid-cols-2 gap-4 border border-hairline bg-parchment p-4 md:grid-cols-4">
            <div>
              <dt className="font-mono text-specimen uppercase tracking-specimen text-tertiary">Recommendations</dt>
              <dd className="font-mono text-data text-primary">{view.counts.recommendations}</dd>
            </div>
            <div>
              <dt className="font-mono text-specimen uppercase tracking-specimen text-tertiary">In-app alerts</dt>
              <dd className="font-mono text-data text-primary">{view.counts.alerts}</dd>
            </div>
          </dl>
        ) : null}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {sections.map((section) => (
            <article key={section.title} className="border border-hairline bg-parchment p-4">
              <h3 className="font-display text-heading-s-m md:text-heading-s text-primary">{section.title}</h3>
              <ul className="mt-4 flex flex-col gap-2">
                {section.lines.map((line) => (
                  <li key={line} className="text-caption-m md:text-caption text-secondary">{line}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <ul className="flex max-w-editorial flex-col gap-2">
          {view.desk.boundaries.map((line) => (
            <li key={line} className="text-caption text-tertiary">{line}</li>
          ))}
        </ul>
        {view.storage !== 'ok' ? (
          <p className="text-body-m text-secondary">Recommendation storage is not configured, so this page is not reporting an empty book.</p>
        ) : view.recommendations.length === 0 ? (
          <p className="text-body-m text-secondary">No stored recommendations for CedarGrowth.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {view.recommendations.map((row) => (
              <li key={`${row.kind}-${row.evidence}`} className="border border-hairline p-4">
                <p className="font-mono text-specimen text-tertiary">{row.kind}</p>
                <p className="mt-2 text-body-m text-primary">{row.evidence}</p>
                <p className="mt-2 text-caption text-secondary">{row.uncertainty}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="font-mono text-specimen text-tertiary">{WHOLESALE_ROUTE}</p>
      </div>
    </section>
  );
}
