'use client';

import { useEffect, useRef, type ReactNode } from 'react';

// The desk covers the public shell. Mark that shell inert so keyboard focus
// stays on the desk controls, and draw a cedar outline on the focused control.
export function CrmDeskFrame({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    const marked: HTMLElement[] = [];
    const walk = (el: Element) => {
      for (const child of Array.from(el.children)) {
        if (!(child instanceof HTMLElement)) continue;
        if (child === frame) continue;
        if (child.contains(frame)) walk(child);
        else if (!child.hasAttribute('inert')) {
          child.setAttribute('inert', '');
          marked.push(child);
        }
      }
    };
    walk(document.body);
    frame.focus();
    return () => {
      for (const el of marked) el.removeAttribute('inert');
    };
  }, []);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="crm-desk fixed inset-0 z-[80] overflow-auto bg-parchment text-primary outline-none [&_:focus-visible]:outline [&_:focus-visible]:outline-2 [&_:focus-visible]:outline-offset-2 [&_:focus-visible]:outline-cedar"
    >
      {children}
    </div>
  );
}
