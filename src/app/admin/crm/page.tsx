import { notFound } from 'next/navigation';
import { currentAdmin } from '@/lib/kelvinSession';
import { CrmConsole } from './CrmConsole';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function CrmPage() {
  const email = await currentAdmin();
  if (!email) notFound();
  return <CrmConsole adminEmail={email} />;
}
