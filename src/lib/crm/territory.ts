// Territory tile numbers and coverage. Forecast stays labeled forecast.
// A missing Nabis source is "no data yet", never zero. Hoodie share is not estimated.

import { OPEN_STAGES, formatForecast } from './engine';
import { COVERAGE_UPLOAD, NEEDS_HOODIE, NY_REGIONS, REGION_UNKNOWN, isAdultUseDispensary, regionForCounty, type NyRegion } from './nyRegions';

export const TERRITORY_METRICS = ['accounts', 'active', 'pipeline', 'invoiced', 'visits'] as const;
export type TerritoryMetric = (typeof TERRITORY_METRICS)[number];

export type TerritoryAccount = { brand: string; id: string; displayName: string; status: string; county: string | null; assignedRep: string | null };
export type TerritoryDeal = { brand: string; accountId: string; stage: string; forecastCents: number | null };
export type TerritoryOrder = { brand: string; accountId: string | null; distributor: string; invoiceCents: number | null; importedAt: string };
export type TerritoryVisit = { brand: string; accountId: string; checkedInAt: string };
export type TerritoryRetailer = { county: string; licenseType: string; uploadedAt: string };

export type TerritoryTile = {
  region: NyRegion;
  value: number | null;
  text: string;
  unassigned: boolean;
  rep: string | null;
};

function daysBefore(today: string, days: number): string {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function latestUpload(rows: readonly { uploadedAt: string }[]): string | null {
  const stamps = rows.map((row) => row.uploadedAt).filter(Boolean).sort();
  return stamps.at(-1) ?? null;
}

export function coverageLabel(input: {
  region: NyRegion | typeof REGION_UNKNOWN;
  accounts: readonly TerritoryAccount[];
  retailers: readonly TerritoryRetailer[];
}): string {
  if (!input.retailers.length) return COVERAGE_UPLOAD;
  const latest = latestUpload(input.retailers);
  const batch = input.retailers.filter((row) => row.uploadedAt === latest);
  const denominator = batch.filter((row) => regionForCounty(row.county) === input.region && isAdultUseDispensary(row.licenseType)).length;
  if (denominator === 0) return 'no data yet';
  const numerator = input.accounts.filter((row) => row.status === 'active' && regionForCounty(row.county) === input.region).length;
  return `${numerator} / ${denominator}`;
}

export function nabisStamp(orders: readonly TerritoryOrder[]): string | null {
  const nabis = orders.filter((row) => row.distributor === 'nabis' && row.importedAt);
  const latest = nabis.map((row) => row.importedAt).sort().at(-1);
  if (!latest) return null;
  const day = latest.slice(0, 10);
  const [year, month, date] = day.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `From Nabis export, ${months[month - 1]} ${date}, ${year}`;
}

export function territoryTiles(input: {
  brand: string;
  metric: TerritoryMetric;
  today: string;
  accounts: readonly TerritoryAccount[];
  deals: readonly TerritoryDeal[];
  orders: readonly TerritoryOrder[] | null;
  visits: readonly TerritoryVisit[] | null;
  territories: readonly { region: string; repActor: string }[];
}): { tiles: TerritoryTile[]; invoicedLabel: string; unknown: TerritoryAccount[] } {
  const accounts = input.accounts.filter((row) => row.brand === input.brand);
  const deals = input.deals.filter((row) => row.brand === input.brand);
  const orders = input.orders?.filter((row) => row.brand === input.brand) ?? null;
  const visits = input.visits?.filter((row) => row.brand === input.brand) ?? null;
  const stamp = orders ? nabisStamp(orders) : null;
  const since = daysBefore(input.today, 30);
  const tiles = NY_REGIONS.map((region) => {
    const inRegion = accounts.filter((row) => regionForCounty(row.county) === region);
    const ids = new Set(inRegion.map((row) => row.id));
    const rep = input.territories.find((row) => row.region === region)?.repActor ?? null;
    let value: number | null = 0;
    let text = '0';
    if (input.metric === 'accounts') {
      value = inRegion.length;
      text = String(value);
    } else if (input.metric === 'active') {
      value = inRegion.filter((row) => row.status === 'active').length;
      text = String(value);
    } else if (input.metric === 'pipeline') {
      const cents = deals.filter((row) => ids.has(row.accountId) && (OPEN_STAGES as readonly string[]).includes(row.stage)).map((row) => row.forecastCents).filter((cents): cents is number => typeof cents === 'number');
      value = cents.length ? cents.reduce((sum, item) => sum + item, 0) : null;
      text = formatForecast(value);
    } else if (input.metric === 'invoiced') {
      if (!orders || !stamp) { value = null; text = 'no data yet'; }
      else {
        const cents = orders.filter((row) => row.distributor === 'nabis' && row.accountId && ids.has(row.accountId)).map((row) => row.invoiceCents).filter((cents): cents is number => typeof cents === 'number');
        value = cents.length ? cents.reduce((sum, item) => sum + item, 0) : null;
        text = value === null ? 'no data yet' : `$${(value / 100).toLocaleString('en-US')}`;
      }
    } else if (!visits) {
      value = null;
      text = 'no data yet';
    } else {
      value = visits.filter((row) => ids.has(row.accountId) && row.checkedInAt.slice(0, 10) >= since && row.checkedInAt.slice(0, 10) <= input.today).length;
      text = String(value);
    }
    return { region, value, text, unassigned: inRegion.length > 0 && !rep, rep };
  });
  return {
    tiles,
    invoicedLabel: stamp ?? 'No Nabis data imported.',
    unknown: accounts.filter((row) => regionForCounty(row.county) === REGION_UNKNOWN),
  };
}
