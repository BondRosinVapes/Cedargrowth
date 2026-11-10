'use client';

import type { ReactNode } from 'react';
import { DASHBOARD_SECTIONS, DASHBOARD_TABLIST_CLASS, stepDashboardSection, type DashboardSection } from '@/lib/crm/dashboardSections';

export function DashboardTabs({ section, onSelect }: { section: DashboardSection; onSelect: (id: DashboardSection) => void }) {
  function onKey(event: React.KeyboardEvent<HTMLButtonElement>, current: DashboardSection) {
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    const next = stepDashboardSection(current, direction);
    onSelect(next);
    document.getElementById(`dashboard-tab-${next}`)?.focus();
  }

  return (
    <div role="tablist" aria-label="Dashboard sections" className={DASHBOARD_TABLIST_CLASS}>
      {DASHBOARD_SECTIONS.map((item) => {
        const selected = section === item.id;
        return (
          <button
            key={item.id}
            id={`dashboard-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`dashboard-panel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(item.id)}
            onKeyDown={(event) => onKey(event, item.id)}
            className={`min-h-[44px] flex-auto whitespace-nowrap px-0.5 py-2 text-center font-sans text-[clamp(11px,1.65cqi,15px)] ${selected ? 'border-b-2 border-cedar bg-parchment text-primary' : 'border-b-2 border-transparent text-inverse'}`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function DashboardSectionHost({ section, panels }: { section: DashboardSection; panels: Record<DashboardSection, ReactNode> }) {
  return (
    <div role="tabpanel" id={`dashboard-panel-${section}`} aria-labelledby={`dashboard-tab-${section}`} className="flex flex-col gap-4">
      {panels[section]}
    </div>
  );
}
