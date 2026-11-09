// New York's 10 economic development regions. Region is derived from county.
// An unknown county is reported, never guessed into a region.

export const NY_REGIONS = [
  'Western New York',
  'Finger Lakes',
  'Southern Tier',
  'Central New York',
  'North Country',
  'Mohawk Valley',
  'Capital Region',
  'Mid-Hudson',
  'New York City',
  'Long Island',
] as const;

export type NyRegion = (typeof NY_REGIONS)[number];
export const REGION_UNKNOWN = 'Region unknown';

export const COUNTY_REGION: Record<string, NyRegion> = {
  Allegany: 'Western New York',
  Cattaraugus: 'Western New York',
  Chautauqua: 'Western New York',
  Erie: 'Western New York',
  Niagara: 'Western New York',
  Genesee: 'Finger Lakes',
  Livingston: 'Finger Lakes',
  Monroe: 'Finger Lakes',
  Ontario: 'Finger Lakes',
  Orleans: 'Finger Lakes',
  Seneca: 'Finger Lakes',
  Wayne: 'Finger Lakes',
  Wyoming: 'Finger Lakes',
  Yates: 'Finger Lakes',
  Broome: 'Southern Tier',
  Chemung: 'Southern Tier',
  Chenango: 'Southern Tier',
  Delaware: 'Southern Tier',
  Schuyler: 'Southern Tier',
  Steuben: 'Southern Tier',
  Tioga: 'Southern Tier',
  Tompkins: 'Southern Tier',
  Cayuga: 'Central New York',
  Cortland: 'Central New York',
  Madison: 'Central New York',
  Onondaga: 'Central New York',
  Oswego: 'Central New York',
  Clinton: 'North Country',
  Essex: 'North Country',
  Franklin: 'North Country',
  Hamilton: 'North Country',
  Jefferson: 'North Country',
  Lewis: 'North Country',
  'St. Lawrence': 'North Country',
  Fulton: 'Mohawk Valley',
  Herkimer: 'Mohawk Valley',
  Montgomery: 'Mohawk Valley',
  Oneida: 'Mohawk Valley',
  Otsego: 'Mohawk Valley',
  Schoharie: 'Mohawk Valley',
  Albany: 'Capital Region',
  Columbia: 'Capital Region',
  Greene: 'Capital Region',
  Rensselaer: 'Capital Region',
  Saratoga: 'Capital Region',
  Schenectady: 'Capital Region',
  Warren: 'Capital Region',
  Washington: 'Capital Region',
  Dutchess: 'Mid-Hudson',
  Orange: 'Mid-Hudson',
  Putnam: 'Mid-Hudson',
  Rockland: 'Mid-Hudson',
  Sullivan: 'Mid-Hudson',
  Ulster: 'Mid-Hudson',
  Westchester: 'Mid-Hudson',
  Bronx: 'New York City',
  Kings: 'New York City',
  'New York': 'New York City',
  Queens: 'New York City',
  Richmond: 'New York City',
  Nassau: 'Long Island',
  Suffolk: 'Long Island',
};

export const NY_COUNTIES = Object.keys(COUNTY_REGION).sort((a, b) => a.localeCompare(b));

export function parseCounty(value: unknown): { ok: true; county: string | null } | { ok: false; reason: string } {
  if (value === undefined || value === null || value === '') return { ok: true, county: null };
  if (typeof value !== 'string') return { ok: false, reason: 'County is not a New York county.' };
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, county: null };
  const match = NY_COUNTIES.find((county) => county.toLowerCase() === trimmed.toLowerCase());
  if (!match) return { ok: false, reason: 'County is not a New York county.' };
  return { ok: true, county: match };
}

export function regionForCounty(county: string | null | undefined): NyRegion | typeof REGION_UNKNOWN {
  if (!county) return REGION_UNKNOWN;
  return COUNTY_REGION[county] ?? REGION_UNKNOWN;
}

// Adult-use retail only. Other license types stay stored and are not counted.
export function isAdultUseDispensary(licenseType: string): boolean {
  const value = licenseType.toLowerCase();
  if (value.includes('medical') || value.includes('cultiv') || value.includes('processor') || value.includes('distributor') || value.includes('micro')) return false;
  return value.includes('adult') && (value.includes('dispensary') || value.includes('retail'));
}

export const COVERAGE_UPLOAD = 'Upload the state dispensary list to see coverage.';
export const NEEDS_HOODIE = 'Needs Hoodie';

export const TILES: { region: NyRegion; x: number; y: number }[] = [
  { region: 'North Country', x: 220, y: 8 },
  { region: 'Western New York', x: 8, y: 128 },
  { region: 'Finger Lakes', x: 128, y: 128 },
  { region: 'Central New York', x: 248, y: 128 },
  { region: 'Mohawk Valley', x: 368, y: 128 },
  { region: 'Capital Region', x: 488, y: 128 },
  { region: 'Southern Tier', x: 68, y: 248 },
  { region: 'Mid-Hudson', x: 368, y: 248 },
  { region: 'New York City', x: 368, y: 368 },
  { region: 'Long Island', x: 488, y: 368 },
];
