'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Menu, ShoppingBag } from 'lucide-react';
import { PRIMARY_NAV, UTILITY_LEFT, UTILITY_RIGHT } from '@/lib/nav';
import { useReservation } from '@/components/reserve/ReservationProvider';
import { Wordmark } from './Wordmark';
import { MobileMenu } from './MobileMenu';

// Header. The mega panel was removed in Prompt 11: every primary item is now a
// plain link to a real page, with no dropdown, disclosure, chevron, or hover
// state beyond the established underline draw. SEARCH and ACCOUNT were removed
// with it (no index to search, no consumer accounts). RESERVE stays: it is a
// real reservation subsystem (ReservationProvider, /reserve, /api/reserve).
export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { count, hydrated } = useReservation();
  const reserveCount = hydrated ? count : 0;

  const menuBtnRef = useRef<HTMLButtonElement>(null);

  // Bottom hairline draws in once the page has scrolled past the header. The
  // header itself never resizes or slides, only the hairline's scaleX moves.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const closeMobile = useCallback(() => {
    setMobileOpen(false);
    menuBtnRef.current?.focus();
  }, []);

  // The compact menu is hidden from 1024px up, but hiding it in CSS leaves the
  // open state and the body scroll lock in place. Close it when that row takes
  // over, and move focus to the visible Sales link rather than the hidden button.
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const onChange = () => {
      if (!desktop.matches) return;
      setMobileOpen((open) => {
        if (!open) return open;
        window.requestAnimationFrame(() => {
          const sales = document.querySelector('header a[href="/sales/signin"]');
          if (sales instanceof HTMLElement) sales.focus();
        });
        return false;
      });
    };
    desktop.addEventListener('change', onChange);
    return () => desktop.removeEventListener('change', onChange);
  }, []);

  return (
    <header className="bg-parchment">
      {/* Desktop masthead from 1024px. Three columns: Sales and Access left,
          wordmark centre, Manufacturing then Reserve right. Below that width
          the same links stay in the menu, because the centred wordmark and
          the right-hand pair collide. */}
      <div className="hidden lg:block">
        <div className="border-b border-hairline">
          <div className="mx-auto grid max-w-content grid-cols-3 items-center px-page-margin py-4">
            <ul className="flex items-center gap-6">
              {UTILITY_LEFT.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="cedar-underline text-caption uppercase tracking-eyebrow text-tertiary"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex justify-center">
              <Wordmark />
            </div>
            <ul className="flex items-center justify-end gap-6">
              {UTILITY_RIGHT.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="cedar-underline text-caption uppercase tracking-eyebrow text-tertiary"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/reserve"
                  className="flex items-center gap-2 text-caption uppercase tracking-eyebrow text-tertiary cedar-underline"
                >
                  <ShoppingBag size={16} strokeWidth={1.5} aria-hidden="true" />
                  Reserve
                  <span className="font-mono text-data lowercase tracking-normal">
                    ({reserveCount})
                  </span>
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <nav aria-label="Primary" className="border-b border-hairline">
          <ul className="mx-auto flex max-w-content items-center justify-center gap-8 px-page-margin py-4">
            {PRIMARY_NAV.map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className="cedar-underline text-body-m tracking-nav text-primary"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* Compact bar. Equal side columns keep the wordmark centred. Sales,
          Access, and Manufacturing stay in the menu, which is already keyboard
          reachable. Reserve stays tappable. */}
      <div className="border-b border-hairline lg:hidden">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center px-page-margin-mobile py-4">
          <button
            ref={menuBtnRef}
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            aria-label="Open menu"
            className="justify-self-start p-1 text-primary"
          >
            <Menu size={20} strokeWidth={1.5} aria-hidden="true" />
          </button>
          <Wordmark />
          <Link
            href="/reserve"
            aria-label={`Reservations, ${reserveCount} items`}
            className="relative justify-self-end p-1 text-primary"
          >
            <ShoppingBag size={20} strokeWidth={1.5} aria-hidden="true" />
            <span className="ml-1 font-mono text-specimen text-tertiary">
              ({reserveCount})
            </span>
          </Link>
        </div>
      </div>

      <MobileMenu open={mobileOpen} onClose={closeMobile} />

      {/*
        Scroll indicator hairline. Always present at 1px height so the header
        never changes height; only its horizontal scale animates, drawn in
        from the left edge over 240ms once the page scrolls past the header.
      */}
      <div
        aria-hidden="true"
        className={`h-px w-full origin-left bg-hairline transition-transform duration-hover ease-cedar motion-reduce:transition-none ${
          scrolled ? 'scale-x-100' : 'scale-x-0'
        }`}
      />
    </header>
  );
}
