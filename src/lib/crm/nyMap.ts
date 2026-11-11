// New York county shapes and pin placement. Coordinates stay in the browser.
// The county file is a Census cartographic boundary, generalized from TIGER/Line.

import { DISTRIBUTOR_LABELS, type Distributor } from './distributor';
import { COUNTY_REGION, NY_COUNTIES, regionForCounty, type NyRegion } from './nyRegions';
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
export const CITY_MENU_LABEL = 'Search cities';
export const COUNTY_MENU_LABEL = 'Search counties';

export function wholeStateFrame(): { x: number; y: number; w: number; h: number } {
  return { x: -24, y: -24, w: MAP_WIDTH + 48, h: MAP_HEIGHT + 48 };
}

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

// The merge gap stays this fraction of the view. It is not floored, so zoom still shrinks it.
const MARKER_FRACTION = 1 / 90;
const MERGE_MULTIPLE = 2.8;
const MIN_MARK_PX = 8;
const MIN_TARGET_PX = 24;
const TOUCH_TARGET_PX = 44;
const TOUCH_MAP_PX = 768;

export function markerSpan(viewWidth: number): number {
  return viewWidth * MARKER_FRACTION;
}

export function hitTargetPx(svgClientWidth: number): number {
  if (svgClientWidth > 0 && svgClientWidth <= TOUCH_MAP_PX) return TOUCH_TARGET_PX;
  return MIN_TARGET_PX;
}

export function mergeGap(viewWidth: number, svgClientWidth = 0): number {
  const fractional = markerSpan(viewWidth) * MERGE_MULTIPLE;
  if (svgClientWidth <= 0) return fractional;
  return Math.max(fractional, (hitTargetPx(svgClientWidth) / svgClientWidth) * viewWidth);
}

// 0.0001 degrees of latitude near the city, about 11 m.
export function storefrontSeparation(): number {
  const origin = projectNy(-73.99, 40.75);
  const shifted = projectNy(-73.99, 40.7501);
  return Math.hypot(origin.x - shifted.x, origin.y - shifted.y);
}

export function minZoomWidth(wholeWidth: number): number {
  const separation = storefrontSeparation();
  const narrow = Math.max(MARKER_FRACTION * MERGE_MULTIPLE, TOUCH_TARGET_PX / 390);
  return Math.min(wholeWidth, (separation * 0.8) / narrow);
}

export function zoomInFactor(currentWidth: number, wholeWidth: number): number {
  const ratio = currentWidth / minZoomWidth(wholeWidth);
  if (ratio > 80) return 2;
  if (ratio > 12) return 2.5;
  return 3;
}

export function zoomStops(wholeWidth: number): number[] {
  const floor = minZoomWidth(wholeWidth);
  const stops = [wholeWidth];
  let width = wholeWidth;
  while (width > floor + 1e-6 && stops.length < 40) {
    width = Math.max(floor, width / zoomInFactor(width, wholeWidth));
    stops.push(width);
  }
  return stops;
}

export function zoomPresses(wholeWidth: number): number {
  return Math.max(0, zoomStops(wholeWidth).length - 1);
}

export function clusterFrame(points: readonly { x: number; y: number }[], whole: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number } {
  const floor = minZoomWidth(whole.w);
  const left = Math.min(...points.map((point) => point.x));
  const right = Math.max(...points.map((point) => point.x));
  const top = Math.min(...points.map((point) => point.y));
  const bottom = Math.max(...points.map((point) => point.y));
  const span = Math.max(right - left, bottom - top);
  const w = Math.min(whole.w, Math.max(span * 1.8, floor));
  const h = w * (whole.h / whole.w);
  return { x: (left + right) / 2 - w / 2, y: (top + bottom) / 2 - h / 2, w, h };
}

// Visible size and hit target in CSS pixels. Touch widths use a 44px target.
export function markerPixels(viewWidth: number, svgClientWidth: number): { visible: number; target: number } {
  const fractional = svgClientWidth > 0 ? svgClientWidth * MARKER_FRACTION : markerSpan(viewWidth);
  const visible = Math.max(fractional, MIN_MARK_PX);
  return { visible, target: Math.max(visible, hitTargetPx(svgClientWidth)) };
}

export function markerUnits(viewWidth: number, svgClientWidth: number): { visible: number; target: number } {
  if (svgClientWidth <= 0 || viewWidth <= 0) {
    const mark = markerSpan(viewWidth);
    return { visible: mark, target: mark };
  }
  const scale = svgClientWidth / viewWidth;
  const pixels = markerPixels(viewWidth, svgClientWidth);
  return { visible: pixels.visible / scale, target: pixels.target / scale };
}

export function clusterMembers(pins: readonly MapPin[]): { id: string; name: string; place: string }[] {
  return pins.map((pin) => ({
    id: pin.id,
    name: pin.displayName,
    place: pin.city?.trim() || pin.county?.trim() || 'City not set',
  }));
}

// Chips that would draw on top of each other share one count at their centroid.
// The pins keep the coordinates placePins stored.
export function declutterPins(pins: readonly PlacedPin[], gap: number): { singles: PlacedPin[]; clusters: PinCluster[] } {
  const span = Math.max(gap, 0.001);
  const spanSq = span * span;
  type Group = { pins: PlacedPin[]; x: number; y: number };
  let groups: Group[] = pins.map((pin) => ({ pins: [pin], x: pin.x, y: pin.y }));
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < groups.length && !merged; i += 1) {
      for (let j = i + 1; j < groups.length; j += 1) {
        const dx = groups[i].x - groups[j].x;
        const dy = groups[i].y - groups[j].y;
        if (dx * dx + dy * dy >= spanSq) continue;
        const members = groups[i].pins.concat(groups[j].pins);
        const x = members.reduce((sum, pin) => sum + pin.x, 0) / members.length;
        const y = members.reduce((sum, pin) => sum + pin.y, 0) / members.length;
        groups = [...groups.slice(0, i), ...groups.slice(i + 1, j), ...groups.slice(j + 1), { pins: members, x, y }];
        merged = true;
        break;
      }
    }
  }
  const singles: PlacedPin[] = [];
  const clusters: PinCluster[] = [];
  for (const group of groups) {
    if (group.pins.length === 1) singles.push(group.pins[0]);
    else clusters.push({ x: group.x, y: group.y, count: group.pins.length, pins: group.pins });
  }
  return { singles, clusters };
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

export type MapChoice = { id: string; label: string; count: number };

const BOROUGHS = new Set(['Bronx', 'Kings', 'New York', 'Queens', 'Richmond']);

function matches(label: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return !needle || label.toLowerCase().includes(needle);
}

export function cityChoices(pins: readonly { city: string | null; county: string | null }[], query: string): MapChoice[] {
  const counts = new Map<string, { label: string; count: number }>();
  let boroughs = 0;
  for (const pin of pins) {
    if (pin.county && BOROUGHS.has(pin.county)) boroughs += 1;
    const label = pin.city?.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    const row = counts.get(key);
    if (row) row.count += 1;
    else counts.set(key, { label, count: 1 });
  }
  const cities = [...counts.values()]
    .filter((row) => matches(row.label, query))
    .sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }))
    .map((row) => ({ id: `city:${row.label.toLowerCase()}`, label: row.label, count: row.count }));
  const top = matches('New York City', query) ? [{ id: 'nyc', label: 'New York City', count: boroughs }] : [];
  return [...top, ...cities];
}

export function countyChoices(pins: readonly { county: string | null }[], query: string): MapChoice[] {
  const counts = new Map<string, number>(NY_COUNTIES.map((name) => [name, 0]));
  for (const pin of pins) {
    const name = NY_COUNTIES.find((county) => county.toLowerCase() === (pin.county || '').trim().toLowerCase());
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const rows = [...NY_COUNTIES]
    .filter((name) => matches(name, query))
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
    .map((name) => ({ id: `county:${name}`, label: name, count: counts.get(name) ?? 0 }));
  const top = matches('Whole state', query) ? [{ id: 'state', label: 'Whole state', count: pins.length }] : [];
  return [...top, ...rows];
}

export function framePoints(points: readonly { x: number; y: number }[]): { x: number; y: number; w: number; h: number } | null {
  if (!points.length) return null;
  const left = Math.min(...points.map((point) => point.x));
  const right = Math.max(...points.map((point) => point.x));
  const top = Math.min(...points.map((point) => point.y));
  const bottom = Math.max(...points.map((point) => point.y));
  const pad = Math.max(right - left, bottom - top, MAP_WIDTH / 14) * 0.18;
  const span = Math.max(right - left + pad * 2, MAP_WIDTH / 14);
  const height = Math.max(bottom - top + pad * 2, span * (MAP_HEIGHT / MAP_WIDTH));
  const width = Math.max(span, height / (MAP_HEIGHT / MAP_WIDTH));
  return { x: (left + right) / 2 - width / 2, y: (top + bottom) / 2 - height / 2, w: width, h: width * (MAP_HEIGHT / MAP_WIDTH) };
}

export function countyFrame(name: string): { x: number; y: number; w: number; h: number } | null {
  const county = file.counties.find((row) => row.name === name);
  if (!county) return null;
  const points = county.rings.flatMap((ring) => ring.map(([lon, lat]) => projectNy(lon, lat)));
  return framePoints(points);
}

export function unmappedAccountCount(rows: readonly { latitude?: number | null; longitude?: number | null; recordMarker?: 'test' | null }[]): number {
  return rows.filter((row) => row.recordMarker !== 'test' && (row.latitude == null || row.longitude == null || !coordinatesInRange(row.latitude, row.longitude))).length;
}
