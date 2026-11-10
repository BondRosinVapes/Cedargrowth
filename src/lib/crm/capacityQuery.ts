// Forecast capacity reads. No cast and no LIKE: PostgREST applies LIKE to the
// date column and rejects it. Migration 0126 already requires day 1.

import { PRODUCT_LINES } from './engine';

const CAPACITY_COLUMNS = 'id,brand,month,product_line,capacity_units,notes';

type From = (table: string) => {
  select: (columns: string) => {
    eq: (column: string, value: string) => any;
  };
};

export function forecastCapacityRequests(from: From, brand: string, window: { start: string; end: string }) {
  const table = () => from('crm_capacity').select(CAPACITY_COLUMNS).eq('brand', brand);
  return [
    table().gte('month', window.start).lte('month', window.end),
    ...PRODUCT_LINES.map((line) => table().eq('product_line', line).lt('month', window.start).order('month', { ascending: false }).limit(1)),
  ];
}
