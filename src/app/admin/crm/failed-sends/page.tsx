import Link from 'next/link';
import { notFound } from 'next/navigation';
import { canExport } from '@/lib/crm/engine';
import { resolveDeskAccess } from '@/lib/crm/salesSession';
import { getCrmStore } from '@/lib/crm/store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function FailedSendsPage() {
  const access = await resolveDeskAccess();
  if (!access.actorId) notFound();
  const grant = access.grants.find((row) => canExport(row.role)) || null;
  if (!grant) {
    return (
      <section className="mx-auto flex min-h-full max-w-editorial flex-col gap-4 px-page-margin-mobile py-16 md:px-page-margin">
        <p className="font-sans text-eyebrow uppercase text-tertiary">Sales</p>
        <h1 className="font-display text-heading-m text-primary">Failed withdrawal sends</h1>
        <p className="text-body-m text-secondary">Only an owner or administrator can read this list.</p>
      </section>
    );
  }
  const loaded = await getCrmStore().listFailedBondSends();
  const sends = loaded.state === 'ok' ? loaded.value : [];
  return (
    <section className="mx-auto flex min-h-full max-w-editorial flex-col gap-6 px-page-margin-mobile py-16 md:px-page-margin">
      <p className="font-sans text-eyebrow uppercase text-tertiary">Sales</p>
      <h1 className="font-display text-heading-m text-primary">Failed withdrawal sends</h1>
      <p className="text-body-m text-secondary">Template B sends that the provider refused. This list has no consumer fields and no send action.</p>
      <Link href="/admin/crm" className="font-mono text-specimen uppercase text-primary">Back to the desk</Link>
      {loaded.state !== 'ok' ? <p className="text-body-m text-secondary">The send list could not be read.</p> : null}
      {loaded.state === 'ok' && sends.length === 0 ? <p className="text-body-m text-secondary">No failed withdrawal sends.</p> : null}
      {sends.length > 0 ? (
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-hairline font-mono text-specimen uppercase text-tertiary">
              <th className="py-2 pr-4 font-normal">Handoff</th>
              <th className="py-2 pr-4 font-normal">Template</th>
              <th className="py-2 pr-4 font-normal">Status</th>
              <th className="py-2 font-normal">Recorded</th>
            </tr>
          </thead>
          <tbody>
            {sends.map((row) => (
              <tr key={`${row.handoffId}-${row.renderedSha256}`} className="border-b border-hairline">
                <td className="py-3 pr-4 font-mono text-specimen text-primary">{row.handoffId}</td>
                <td className="py-3 pr-4 text-body-m text-primary">{row.template}</td>
                <td className="py-3 pr-4 text-body-m text-primary">{row.status}</td>
                <td className="py-3 font-mono text-specimen text-secondary">{row.sentAt || 'Not recorded'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
