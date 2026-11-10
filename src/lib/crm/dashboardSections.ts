// Dashboard section tabs. The first view is Overview, which is the whole dashboard.

export const DASHBOARD_SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'reps', label: 'Sales rep analysis' },
  { id: 'accounts', label: 'Account breakdown' },
  { id: 'sources', label: 'Source effectiveness' },
  { id: 'timeline', label: 'Timeline analysis' },
  { id: 'distributor', label: 'Distributor' },
  { id: 'production', label: 'Production forecast' },
] as const;

export type DashboardSection = (typeof DASHBOARD_SECTIONS)[number]['id'];

export const DASHBOARD_TABLIST_CLASS = 'flex flex-wrap bg-ink lg:flex-nowrap';

export function sectionFromSearch(value: string | null): DashboardSection {
  const match = DASHBOARD_SECTIONS.find((item) => item.id === value);
  return match ? match.id : 'overview';
}

export function stepDashboardSection(current: DashboardSection, direction: 1 | -1): DashboardSection {
  const index = DASHBOARD_SECTIONS.findIndex((item) => item.id === current);
  const next = (index + direction + DASHBOARD_SECTIONS.length) % DASHBOARD_SECTIONS.length;
  return DASHBOARD_SECTIONS[next].id;
}
