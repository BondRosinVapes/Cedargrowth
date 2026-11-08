import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Wholesale CRM',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function CrmLayout({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[80] overflow-auto bg-parchment text-primary">
      {children}
    </div>
  );
}
