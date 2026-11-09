import Link from 'next/link';
import { FOOTER_COLUMNS } from '@/lib/nav';
import { AGE_LINE, FACILITY_ADDRESS, UNKNOWNS, BRAND } from '@/lib/site';
import { Unknown } from '@/components/atoms/Unknown';
import { Wordmark } from './Wordmark';
import { NewsletterForm } from './NewsletterForm';

// Footer on ink (Block 9). Four link columns, license identifier, address, the
// 21 plus line, the required state warning block, and a small newsletter row.
// License and warnings are UNKNOWN until confirmed.

export function Footer() {
  return (
    <footer className="bg-ink text-inverse">
      <div className="mx-auto max-w-content px-page-margin-mobile md:px-page-margin py-16 md:py-24">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4">
          {FOOTER_COLUMNS.map((col) => (
            <nav key={col.heading} aria-label={col.heading}>
              <p className="mb-4 font-mono text-specimen uppercase tracking-specimen text-inverse/60">
                {col.heading}
              </p>
              <ul className="flex flex-col gap-3">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="cedar-underline text-body-m-m md:text-body-m text-inverse"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-16 grid grid-cols-1 gap-10 border-t border-hairline-inverse pt-10 md:grid-cols-2">
          <div className="flex flex-col gap-6">
            <Wordmark className="text-inverse" />
            <address className="not-italic text-body-m-m md:text-body-m text-inverse/70">
              {FACILITY_ADDRESS}
            </address>
            <p className="font-mono text-specimen uppercase tracking-specimen text-inverse/70">
              {AGE_LINE}
            </p>
            <Unknown
              tone="inverse"
              label="License"
              caption={UNKNOWNS.license}
            />
          </div>

          <div className="flex flex-col gap-6">
            <div>
              <p className="mb-3 font-mono text-specimen uppercase tracking-specimen text-inverse/60">
                State warnings
              </p>
              <Unknown tone="inverse" caption={UNKNOWNS.stateWarnings} />
            </div>
            <div>
              <p className="mb-3 font-mono text-specimen uppercase tracking-specimen text-inverse/60">
                Newsletter
              </p>
              <NewsletterForm />
            </div>
          </div>
        </div>

        <div className="mt-16 flex flex-wrap items-center justify-between gap-3">
          <p className="text-caption-m md:text-caption text-inverse/60">
            {BRAND.full}. Buffalo, New York.
          </p>
          <Link
            href="/admin/kelvin/login"
            className="cedar-underline font-mono text-specimen uppercase tracking-specimen text-inverse/40"
          >
            Admin
          </Link>
        </div>
      </div>
    </footer>
  );
}
