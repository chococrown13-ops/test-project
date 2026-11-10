import type { Curve } from './curves';
import { hillField, startRow, waterMask, type MapKind } from './maps';
import { Ground, N, Road, START_MONEY, type BuildingKind } from './defs';
import type { TransitLine } from './transit';

export interface Building {
  id: number;
  kind: BuildingKind;
  x: number;
  y: number;
  size: number;
  /** Footprint in cells along x and y when it isn't the kind's square (a lot grown to fit its block). */
  sx?: number;
  sy?: number;
  floors: number;
  /** 0-1 seed for colour and facade variety. */
  look: number;
  /** Residents living here, or workers employed here. */
  occ: number;
  powered: boolean;
  watered: boolean;
  sewered: boolean;
  happy: number;
  /** Days without power or water; long outages abandon the building. */
  outage: number;
  abandoned: boolean;
  builtDay: number;
}

export interface MonthReport {
  month: number;
  income: { R: number; C: number; I: number; T: number };
  expense: { roads: number; facilities: number; services: number; transit: number };
  pop: number;
  jobs: number;
}

export interface World {
  name: string;
  seed: number;
  /** The kind of land the city was founded on. */
  map: MapKind;
  rng: number;
  day: number;
  money: number;
  ground: Uint8Array;
  road: Uint8Array;
  /** A second road in the cell, over or under the ground one (type, as in `road`). */
  roadAlt: Uint8Array;
  /** Its level: Level.Elevated, Underpass or Tunnel. */
  altLevel: Uint8Array;
  /** Diagonal links of the ground road: 1 NE, 2 SE, 4 SW, 8 NW. */
  diag: Uint8Array;
  /** Curved roads drawn over their chains of road cells (see curves.ts). */
  curves: Curve[];
  zone: Uint8Array;
  /** Cars parked along the kerb of each ground road cell (see parking.ts). */
  parked: Uint8Array;
  /** Share of a building's cars with nowhere to park, 0-100, on its cells and its front road. */
  parkPress: Uint8Array;
  /** Policy: no stopping or parking on avenues. */
  noAvenueParking: boolean;
  bld: Int32Array;
  land: Float32Array;
  traffic: Float32Array;
  pollution: Float32Array;
  edu: Uint8Array;
  safety: Uint8Array;
  fire: Uint8Array;
  health: Uint8Array;
  /** Walking distance to transit: 0 none, 1 bus, 2 subway. */
  transit: Uint8Array;
  lines: TransitLine[];
  nextLine: number;
  buildings: Map<number, Building>;
  nextId: number;
  tax: { R: number; C: number; I: number };
  demand: { R: number; C: number; I: number };
  stats: {
    pop: number;
    jobs: number;
    workers: number;
    employed: number;
    powerSupply: number;
    powerUse: number;
    waterSupply: number;
    waterUse: number;
    sewageCap: number;
    sewageUse: number;
    happy: number;
    commute: number;
    congestion: number;
    parkDemand: number;
    parkUnmet: number;
    parkCurb: number;
  };
  reports: MonthReport[];
  /** Running totals for the current month. */
  month: MonthReport;
  notices: { day: number; text: string; tone: 'info' | 'warn' | 'good' }[];
  /** Bumped whenever something the renderer draws changes. */
  ver: { roads: number; zones: number; buildings: number; transit: number };
  /** Milestones already announced. */
  milestones: number[];
}

export const idx = (x: number, y: number) => y * N + x;

type Footprinted = { size: number; sx?: number; sy?: number };
/** Footprint width (x) and depth (y) in cells. */
export const bw = (b: Footprinted) => b.sx ?? b.size;
export const bh = (b: Footprinted) => b.sy ?? b.size;
/** How many standard lots of its kind a building covers: a lot grown to fit its block holds more. */
export const lotsOf = (b: Footprinted) => (bw(b) * bh(b)) / (b.size * b.size);
export const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N;
export const cx = (i: number) => i % N;
export const cy = (i: number) => (i / N) | 0;

/** Deterministic RNG stored in the world so saves replay the same way. */
export function rand(w: World): number {
  w.rng = (w.rng + 0x6d2b79f5) >>> 0;
  let t = w.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export { riverY } from './maps';

export function emptyMonth(month: number): MonthReport {
  return { month, income: { R: 0, C: 0, I: 0, T: 0 }, expense: { roads: 0, facilities: 0, services: 0, transit: 0 }, pop: 0, jobs: 0 };
}

export function createWorld(seed = 20261028, name = '새솔시', map: MapKind = 'river'): World {
  const size = N * N;
  const w: World = {
    name,
    seed,
    map,
    rng: seed >>> 0,
    day: 0,
    money: START_MONEY,
    ground: new Uint8Array(size),
    road: new Uint8Array(size),
    roadAlt: new Uint8Array(size),
    altLevel: new Uint8Array(size),
    diag: new Uint8Array(size),
    curves: [],
    parked: new Uint8Array(size),
    parkPress: new Uint8Array(size),
    noAvenueParking: false,
    zone: new Uint8Array(size),
    bld: new Int32Array(size).fill(-1),
    land: new Float32Array(size),
    traffic: new Float32Array(size),
    pollution: new Float32Array(size),
    edu: new Uint8Array(size),
    safety: new Uint8Array(size),
    fire: new Uint8Array(size),
    health: new Uint8Array(size),
    transit: new Uint8Array(size),
    lines: [],
    nextLine: 1,
    buildings: new Map(),
    nextId: 1,
    tax: { R: 9, C: 9, I: 9 },
    demand: { R: 60, C: 25, I: 35 },
    stats: { pop: 0, jobs: 0, workers: 0, employed: 0, powerSupply: 0, powerUse: 0, waterSupply: 0, waterUse: 0, sewageCap: 0, sewageUse: 0, happy: 60, commute: 0, congestion: 0, parkDemand: 0, parkUnmet: 0, parkCurb: 0 },
    reports: [],
    month: emptyMonth(0),
    notices: [],
    ver: { roads: 1, zones: 1, buildings: 1, transit: 1 },
    milestones: [],
  };
  const wet = waterMask(seed, map);
  for (let i = 0; i < size; i++) if (wet[i]) w.ground[i] = Ground.Water;
  // Hills: on the river map, mountains behind the city and a hill across the river (배산임수).
  const hills = hillField(seed, map);
  for (let i = 0; i < size; i++) if (hills[i] > 0 && w.ground[i] === Ground.Land) w.ground[i] = Ground.Mountain;
  // The city starts with an expressway link from the west edge: the outside world.
  const row = startRow(seed, map);
  for (let x = 0; x <= 22; x++) w.road[idx(x, row)] = Road.Avenue;
  return w;
}

/** Mountain heights in metres per cell, from the seed and map alone, so the renderer can rebuild them. */
export const terrainField = (seed: number, map: MapKind = 'river') => hillField(seed, map);

/** Row of the expressway link the city starts from. */
export const startRowOf = (w: World) => startRow(w.seed, w.map);

export function notify(w: World, text: string, tone: 'info' | 'warn' | 'good' = 'info') {
  w.notices.unshift({ day: w.day, text, tone });
  if (w.notices.length > 40) w.notices.length = 40;
}

/** The road cell a building uses to reach the network: any road touching its footprint. */
export function accessRoad(w: World, b: { x: number; y: number } & Footprinted): number {
  const W = bw(b), H = bh(b);
  for (let k = 0; k < Math.max(W, H); k++) {
    const cand: [number, number][] = [];
    if (k < W) cand.push([b.x + k, b.y - 1], [b.x + k, b.y + H]);
    if (k < H) cand.push([b.x - 1, b.y + k], [b.x + W, b.y + k]);
    for (const [x, y] of cand) if (inside(x, y) && w.road[idx(x, y)]) return idx(x, y);
  }
  return -1;
}
