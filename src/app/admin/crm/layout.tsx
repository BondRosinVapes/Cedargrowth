import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { CrmDeskFrame } from './CrmDeskFrame';

export const metadata: Metadata = {
  title: 'Wholesale CRM',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function CrmLayout({ children }: { children: ReactNode }) {
  return (
    <CrmDeskFrame>{children}</CrmDeskFrame>
  );
}
