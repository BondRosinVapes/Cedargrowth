import type { Metadata } from 'next';
import { safeSalesReturnPath } from '@/lib/crm/engine';
import { SignInForm } from './SignInForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sales sign in',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function SalesSignInPage({ searchParams }: { searchParams?: { next?: string } }) {
  const nextPath = safeSalesReturnPath(searchParams?.next);
  return (
    <section className="bg-parchment py-16 md:py-24">
      <div className="mx-auto flex w-full max-w-editorial flex-col gap-8 px-page-margin-mobile md:px-page-margin">
        <div className="flex flex-col gap-3">
          <p className="font-sans text-eyebrow-m md:text-eyebrow font-medium uppercase text-tertiary">Sales</p>
          <h1 className="font-display text-heading-m-m md:text-heading-m text-primary">Sign in</h1>
          <p className="text-body-m text-secondary">
            This door opens the internal desk for a provisioned salesperson or CRM administrator. A password match
            is not enough, and there is no self sign-up. Practice labels do not apply. The existing KELVIN owner
            sign-in remains valid on its own and is not replaced by this form.
          </p>
        </div>
        <SignInForm nextPath={nextPath} />
      </div>
    </section>
  );
}
