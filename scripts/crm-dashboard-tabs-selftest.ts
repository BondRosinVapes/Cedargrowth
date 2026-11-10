import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DashboardSectionHost, DashboardTabs } from '../src/app/admin/crm/DashboardTabs.tsx';
import { DASHBOARD_SECTIONS, DASHBOARD_TABLIST_CLASS, sectionFromSearch, stepDashboardSection } from '../src/lib/crm/dashboardSections.ts';

export function assertDashboardTabs(assert: (ok: boolean, message: string) => void) {
  assert(sectionFromSearch(null) === 'overview' && sectionFromSearch('nope') === 'overview' && stepDashboardSection('production', 1) === 'overview' && DASHBOARD_TABLIST_CLASS.includes('overflow-x') === false && DASHBOARD_TABLIST_CLASS.includes('w-full') && DASHBOARD_TABLIST_CLASS.includes('lg:flex-nowrap') && DASHBOARD_SECTIONS.length === 7, 'TEST ONLY: the dashboard opens on Overview and the tab row does not scroll');
  for (const item of DASHBOARD_SECTIONS) {
    const tabs = renderToStaticMarkup(createElement(DashboardTabs, { section: item.id, onSelect: () => {} }));
    const panel = renderToStaticMarkup(createElement(DashboardSectionHost, {
      section: item.id,
      panels: {
        overview: createElement('p', null, 'TEST ONLY overview panel'),
        reps: createElement('p', null, 'TEST ONLY reps panel'),
        accounts: createElement('p', null, 'TEST ONLY accounts panel'),
        sources: createElement('p', null, 'TEST ONLY sources panel'),
        timeline: createElement('p', null, 'TEST ONLY timeline panel'),
        distributor: createElement('p', null, 'TEST ONLY distributor panel'),
        production: createElement('p', null, 'TEST ONLY production panel'),
      },
    }));
    const selected = (tabs.match(/aria-selected="true"/g) || []).length === 1;
    const others = DASHBOARD_SECTIONS.filter((other) => other.id !== item.id).every((other) => panel.includes(`TEST ONLY ${other.id} panel`) === false);
    assert(tabs.includes('role="tablist"') && tabs.includes('flex-1') && tabs.includes('text-data') && tabs.includes('text-center') && tabs.includes(`id="dashboard-tab-${item.id}"`) && selected && tabs.includes(item.label) && panel.includes('role="tabpanel"') && panel.includes(`id="dashboard-panel-${item.id}"`) && panel.includes(`TEST ONLY ${item.id} panel`) && others, `TEST ONLY: the ${item.label} tab renders its own panel`);
  }
}
