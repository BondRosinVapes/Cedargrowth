// New York county shapes and pin placement. Coordinates stay in the browser.
// The county file is a Census cartographic boundary, generalized from TIGER/Line.

import { DISTRIBUTOR_LABELS, type Distributor } from './distributor';
import { COUNTY_REGION, regionForCounty, type NyRegion } from './nyRegions';
import shapes from './nyCounties.json' with { type: 'json' };

export type MapPin = {
  id: string;
  displayName: string;
  licenseRef: string | null;
  licenseExpiry: string | null;
  ocmStatus: 'unverified' | 'verified' | null;
  city: string | null;
  county: string | null;
  assignedRep: string | null;
  distributor: Distributor | null;
  contactCount: number;
  latitude: number;
  longitude: number;
};

type Ring = number[][];
type CountyFile = { counties: { name: string; rings: Ring[] }[] };

const file = shapes as unknown as CountyFile;

function mercator(lon: number, lat: number): { x: number; y: number } {
  const x = (lon * Math.PI) / 180;
  const latR = (lat * Math.PI) / 180;
  const y = Math.log(Math.tan(Math.PI / 4 + latR / 2));
  return { x, y };
}

const projected = file.counties.flatMap((county) => county.rings.flatMap((ring) => ring.map(([lon, lat]) => mercator(lon, lat))));
const minX = Math.min(...projected.map((point) => point.x));
const maxX = Math.max(...projected.map((point) => point.x));
const minY = Math.min(...projected.map((point) => point.y));
const maxY = Math.max(...projected.map((point) => point.y));
const SCALE = 1000 / (maxX - minX);

export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = (maxY - minY) * SCALE;

export function projectNy(lon: number, lat: number): { x: number; y: number } {
  const point = mercator(lon, lat);
  return { x: (point.x - minX) * SCALE, y: (maxY - point.y) * SCALE };
}

export type CountyDraw = { name: string; region: NyRegion | 'Region unknown'; d: string };

function ringPath(ring: Ring): string {
  return ring.map(([lon, lat], index) => {
    const point = projectNy(lon, lat);
    const command = index === 0 ? 'M' : 'L';
    return `${command}${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }).join('') + 'Z';
}

export const COUNTY_DRAWS: CountyDraw[] = file.counties.map((county) => ({
  name: county.name,
  region: county.name in COUNTY_REGION ? regionForCounty(county.name) : 'Region unknown',
  d: county.rings.map(ringPath).join(''),
}));

export function coordinatesInRange(latitude: number, longitude: number): boolean {
  return latitude >= 40.4 && latitude <= 45.1 && longitude >= -79.8 && longitude <= -71.8;
}

function insideRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = (yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function countyAt(lon: number, lat: number): string | null {
  for (const county of file.counties) {
    if (county.rings.some((ring) => insideRing(lon, lat, ring))) return county.name;
  }
  return null;
}

export function nycFrame(): { x: number; y: number; w: number; h: number } {
  const names = new Set(['Bronx', 'Kings', 'New York', 'Queens', 'Richmond']);
  const points = file.counties.filter((county) => names.has(county.name)).flatMap((county) => county.rings.flatMap((ring) => ring.map(([lon, lat]) => projectNy(lon, lat))));
  const left = Math.min(...points.map((point) => point.x));
  const right = Math.max(...points.map((point) => point.x));
  const top = Math.min(...points.map((point) => point.y));
  const bottom = Math.max(...points.map((point) => point.y));
  const padX = (right - left) * 0.12;
  const padY = (bottom - top) * 0.12;
  return { x: left - padX, y: top - padY, w: right - left + padX * 2, h: bottom - top + padY * 2 };
}

export type PlacedPin = MapPin & { x: number; y: number };
export type PinCluster = { x: number; y: number; count: number; pins: PlacedPin[] };

export function placePins(pins: readonly MapPin[]): { placed: PlacedPin[]; rejected: number } {
  const placed: PlacedPin[] = [];
  let rejected = 0;
  for (const pin of pins) {
    if (!Number.isFinite(pin.latitude) || !Number.isFinite(pin.longitude) || !coordinatesInRange(pin.latitude, pin.longitude)) {
      rejected += 1;
      continue;
    }
    const point = projectNy(pin.longitude, pin.latitude);
    placed.push({ ...pin, x: point.x, y: point.y });
  }
  return { placed, rejected };
}

export function clusterPins(pins: readonly PlacedPin[], cell: number): { singles: PlacedPin[]; clusters: PinCluster[] } {
  const size = Math.max(cell, 0.001);
  const groups = new Map<string, PlacedPin[]>();
  for (const pin of pins) {
    const key = `${Math.floor(pin.x / size)}:${Math.floor(pin.y / size)}`;
    const group = groups.get(key);
    if (group) group.push(pin);
    else groups.set(key, [pin]);
  }
  const singles: PlacedPin[] = [];
  const clusters: PinCluster[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) singles.push(group[0]);
    else {
      const x = group.reduce((sum, pin) => sum + pin.x, 0) / group.length;
      const y = group.reduce((sum, pin) => sum + pin.y, 0) / group.length;
      clusters.push({ x, y, count: group.length, pins: group });
    }
  }
  return { singles, clusters };
}

export function pinCard(pin: MapPin): { label: string; value: string; mono?: boolean }[] {
  const place = [pin.city, pin.county].filter((part) => part && part.trim()).join(', ');
  return [
    { label: 'License', value: pin.licenseRef?.trim() || 'Not stored', mono: true },
    { label: 'License expiry', value: pin.licenseExpiry || 'Not set' },
    { label: 'OCM status', value: pin.ocmStatus === 'verified' ? 'Verified' : pin.ocmStatus === 'unverified' ? 'Unverified' : 'Not set' },
    { label: 'Place', value: place || 'Not set' },
    { label: 'Rep', value: pin.assignedRep?.trim() || 'No rep' },
    { label: 'Distributor', value: pin.distributor ? DISTRIBUTOR_LABELS[pin.distributor] : 'Not set' },
    { label: 'Contacts', value: String(pin.contactCount) },
  ];
}

export function unmappedAccountCount(rows: readonly { latitude?: number | null; longitude?: number | null; recordMarker?: 'test' | null }[]): number {
  return rows.filter((row) => row.recordMarker !== 'test' && (row.latitude == null || row.longitude == null || !coordinatesInRange(row.latitude, row.longitude))).length;
}
