import Link from 'next/link';
import { BRAND } from '@/lib/site';

// Text lockup in the editorial face. Kept as type rather than the logo asset
// until the asset is visually verified. It is a link to home with an accessible
// name, not a heading, so each route keeps its single h1.

export function Wordmark({ className = '', masthead = false }: { className?: string; masthead?: boolean }) {
  const size = masthead
    ? 'text-heading-m'
    : 'text-heading-s-m md:text-heading-m';
  return (
    <Link
      href="/"
      aria-label={`${BRAND.full}, home`}
      className={`inline-block font-display leading-none ${size} ${className}`}
    >
      {BRAND.name}
    </Link>
  );
}
