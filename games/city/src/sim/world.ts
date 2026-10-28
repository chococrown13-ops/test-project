import { Ground, N, Road, START_MONEY, type BuildingKind } from './defs';
import type { TransitLine } from './transit';

export interface Building {
  id: number;
  kind: BuildingKind;
  x: number;
  y: number;
  size: number;
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
  zone: Uint8Array;
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

/** River centre line: a gentle S-curve across the map, like a city on the 한강. */
export function riverY(x: number, seed: number): number {
  const p = seed % 1000 / 1000;
  return N * 0.58 + Math.sin((x / N) * Math.PI * 1.6 + p * 6) * 9 + Math.sin((x / N) * Math.PI * 4.2 + p * 3) * 2.5;
}

export function emptyMonth(month: number): MonthReport {
  return { month, income: { R: 0, C: 0, I: 0, T: 0 }, expense: { roads: 0, facilities: 0, services: 0, transit: 0 }, pop: 0, jobs: 0 };
}

export function createWorld(seed = 20261028, name = '새솔시'): World {
  const size = N * N;
  const w: World = {
    name,
    seed,
    rng: seed >>> 0,
    day: 0,
    money: START_MONEY,
    ground: new Uint8Array(size),
    road: new Uint8Array(size),
    roadAlt: new Uint8Array(size),
    altLevel: new Uint8Array(size),
    diag: new Uint8Array(size),
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
    stats: { pop: 0, jobs: 0, workers: 0, employed: 0, powerSupply: 0, powerUse: 0, waterSupply: 0, waterUse: 0, sewageCap: 0, sewageUse: 0, happy: 60, commute: 0, congestion: 0 },
    reports: [],
    month: emptyMonth(0),
    notices: [],
    ver: { roads: 1, zones: 1, buildings: 1, transit: 1 },
    milestones: [],
  };
  for (let x = 0; x < N; x++) {
    const c = riverY(x, seed);
    const half = 3.6 + Math.sin(x * 0.07 + seed) * 0.9;
    for (let y = 0; y < N; y++) if (Math.abs(y + 0.5 - c) < half) w.ground[idx(x, y)] = Ground.Water;
  }
  // The city starts with an expressway link from the west edge: the outside world.
  const row = Math.round(riverY(0, seed) - 22);
  // Mountains behind the city and a hill across the river: 배산임수.
  const hills = terrainField(seed);
  for (let i = 0; i < size; i++) if (hills[i] > 0 && w.ground[i] === Ground.Land) w.ground[i] = Ground.Mountain;
  for (let x = 0; x <= 22; x++) w.road[idx(x, row)] = Road.Avenue;
  return w;
}

const fh = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = fh(xi, yi), b = fh(xi + 1, yi), c = fh(xi, yi + 1), d = fh(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * Mountain heights in metres per cell (0 on flat land), from the seed alone so
 * the renderer can rebuild it. A ridge runs along the north edge and one hill
 * stands south of the river; the river, its banks and the start road stay flat.
 */
export function terrainField(seed: number): Float32Array {
  const h = new Float32Array(N * N);
  const o = (seed % 997) * 0.37;
  const row = Math.round(riverY(0, seed) - 22);
  const hx = Math.round(N * (0.55 + (seed % 7) * 0.03)), hy = Math.round(Math.min(N - 14, riverY(hx, seed) + 22));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const depth = 6 + vnoise(x / 13 + o, 3.1) * 13;
    let v = 0;
    if (y < depth) v = ((depth - y) / depth) ** 0.8 * (45 + vnoise(x / 8 + o, 7.7) * 50);
    const d = Math.hypot(x - hx, y - hy), r = 7.5 + vnoise(o, 1.3) * 3;
    if (d < r) v = Math.max(v, (1 - d / r) ** 1.2 * (55 + vnoise(o, 9.1) * 25));
    v *= 0.85 + vnoise(x / 4 + o, y / 4) * 0.3;
    const river = Math.abs(y + 0.5 - riverY(x, seed));
    if (river < 9 || (x < 40 && Math.abs(y - row) < 12) || v < 4) v = 0;
    h[y * N + x] = v;
  }
  return h;
}

export function notify(w: World, text: string, tone: 'info' | 'warn' | 'good' = 'info') {
  w.notices.unshift({ day: w.day, text, tone });
  if (w.notices.length > 40) w.notices.length = 40;
}

/** The road cell a building uses to reach the network: any road touching its footprint. */
export function accessRoad(w: World, b: { x: number; y: number; size: number }): number {
  for (let k = 0; k < b.size; k++) {
    const cand: [number, number][] = [[b.x + k, b.y - 1], [b.x + k, b.y + b.size], [b.x - 1, b.y + k], [b.x + b.size, b.y + k]];
    for (const [x, y] of cand) if (inside(x, y) && w.road[idx(x, y)]) return idx(x, y);
  }
  return -1;
}
