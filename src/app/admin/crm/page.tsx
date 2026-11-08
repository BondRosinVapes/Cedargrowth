import { notFound } from 'next/navigation';
import { resolveDeskAccess } from '@/lib/crm/salesSession';
import { CrmConsole } from './CrmConsole';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CrmPage() {
  const access = await resolveDeskAccess();
  if (!access.actorId || access.grants.length === 0) {
    if (access.actorId) {
      return (
        <section className="mx-auto flex min-h-full max-w-editorial flex-col gap-4 px-page-margin-mobile py-16 md:px-page-margin">
          <p className="font-sans text-eyebrow uppercase text-tertiary">Sales</p>
          <h1 className="font-display text-heading-m-m md:text-heading-m text-primary">Sales access is not provisioned.</h1>
          <p className="text-body-m text-secondary">
            This session has no active brand membership. The desk, counts, and wholesale signals stay closed.
            The KELVIN owner sign-in remains a separate door and is not granted by this message.
          </p>
        </section>
      );
    }
    notFound();
  }
  const roleLabel = access.source === 'kelvin_owner'
    ? 'KELVIN owner'
    : access.grants.some((grant) => grant.role === 'administrator')
      ? 'CRM administrator'
      : 'Sales';
  return (
    <CrmConsole
      brands={access.grants.map((grant) => grant.brand)}
      sessionLabel={access.label}
      roleLabel={roleLabel}
    />
  );
}
