import Link from 'next/link';
import { notFound } from 'next/navigation';
import { resolveDeskAccess } from '@/lib/crm/salesSession';
import { FieldApp } from './FieldApp';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function FieldPage() {
  const access = await resolveDeskAccess();
  if (!access.actorId || access.grants.length === 0) {
    if (access.actorId) {
      return (
        <section className="mx-auto flex min-h-full max-w-editorial flex-col gap-4 px-page-margin-mobile py-16">
          <h1 className="font-display text-heading-m-m text-primary">Sales access is not provisioned.</h1>
          <Link href="/sales/signin" className="min-h-[44px] font-mono text-specimen uppercase text-primary">Sign in</Link>
        </section>
      );
    }
    notFound();
  }
  return <FieldApp brands={access.grants.map((grant) => grant.brand)} actorId={access.actorId} label={access.label} />;
}
