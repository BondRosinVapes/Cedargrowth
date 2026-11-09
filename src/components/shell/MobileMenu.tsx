'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { PRIMARY_NAV, UTILITY_LEFT, UTILITY_RIGHT } from '@/lib/nav';
import { Wordmark } from './Wordmark';

// Full height drawer for mobile. Every primary item is a plain link (the mega
// panel and its mobile accordions were removed in Prompt 11). Utility links sit
// beneath. Focus is trapped while open, Escape closes, focus returns to the
// trigger (handled by the Header through menuBtnRef).

export function MobileMenu({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    if (!panel) return;

    // Move focus into the drawer.
    const focusables = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
    focusables()[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      id="mobile-menu"
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      className="fixed inset-0 z-50 flex flex-col bg-parchment animate-fade motion-reduce:animate-none lg:hidden"
    >
      <div className="flex items-center justify-between border-b border-hairline px-page-margin-mobile py-4">
        <Wordmark />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className="p-1 text-primary"
        >
          <X size={20} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>

      <nav
        aria-label="Primary"
        className="flex-1 overflow-y-auto px-page-margin-mobile py-6"
      >
        <ul className="flex flex-col">
          {PRIMARY_NAV.map((item) => (
            <li key={item.label} className="border-b border-hairline">
              <Link
                href={item.href}
                onClick={onClose}
                className="cedar-underline block py-4 text-body-l-m text-primary tracking-nav"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <ul className="mt-8 flex flex-col gap-3">
          {UTILITY_LEFT.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                onClick={onClose}
                className="cedar-underline text-body-m-m uppercase tracking-eyebrow text-tertiary"
              >
                {link.label}
              </Link>
            </li>
          ))}
          {UTILITY_RIGHT.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                onClick={onClose}
                className="cedar-underline text-body-m-m uppercase tracking-eyebrow text-tertiary"
              >
                {link.label}
              </Link>
            </li>
          ))}
          <li>
            <Link
              href="/reserve"
              onClick={onClose}
              className="cedar-underline text-body-m-m uppercase tracking-eyebrow text-tertiary"
            >
              Reserve
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}
