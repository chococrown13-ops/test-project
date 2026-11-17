/**
 * 「남길 것인가」: one 구 of an invented Korean city, 1970 to 2070.
 *
 * The map is 256 x 256 cells of 20 m (5.12 km a side). Every cell holds at
 * most one building; a few dozen of them are 기억 장소, places with a name and
 * a story. The player decides one thing every ten years; between decisions
 * the decade plays out on its own (markets, ageing, closures, people moving).
 */

export const N = 256;
export const CELL = 20;
export const SIZE = N * CELL;
export const START_YEAR = 1970;
export const TURNS = 10;

export const Ground = { Land: 0, Water: 1, Hill: 2 } as const;
export const RoadT = { None: 0, Street: 1, Avenue: 2 } as const;

/** What stands on a cell. */
export const B = {
  None: 0, Giwa: 1, Slate: 2, Shop: 3, Market: 4, Factory: 5, Villa: 6, Apt: 7, Tower: 8, Office: 9, Future: 10,
  Park: 11, Vacant: 12, Place: 13, Field: 14,
} as const;
export type BType = (typeof B)[keyof typeof B];

/** Buildings that count as the old fabric of the 동네 (they carry its look and some of its memory). */
export const OLD: ReadonlySet<number> = new Set([B.Giwa, B.Slate, B.Shop, B.Market]);

export type DistrictKind = 'market' | 'school' | 'river' | 'hill' | 'station';

export interface District {
  id: number;
  name: string;
  kind: DistrictKind;
  /** Centre cell. */
  cx: number;
  cy: number;
  pop: number;
  /** 0-100 */
  vitality: number;
  /** 0-100: how much the land is worth; high values draw private redevelopment. */
  land: number;
  /** Share of residents whose families lived here before 1980. */
  original: number;
  /** 보존지구: no private redevelopment, places close less, but the stock ages. */
  protected: boolean;
  station: boolean;
  /** Flood defences (from the 2040s the river rises). */
  levee: boolean;
  /** Turns of tourist pressure after a preservation success. */
  tourism: number;
  /** Cells the 구청 itself rebuilt this decade (they push residents out like private building does). */
  churn?: number;
  /** Lasting help that keeps households in place (임대주택, 집수리, 청원), 0-0.25. */
  anchor?: number;
}

export type PlaceKind =
  | 'gukbap' | 'bath' | 'barber' | 'tearoom' | 'cinema' | 'hardware' | 'mill' | 'snack' | 'corner' | 'briquette'
  | 'photo' | 'books' | 'chinese' | 'tree' | 'church' | 'school' | 'mural' | 'crossing' | 'market';

export type PlaceState = 'open' | 'closed' | 'reused' | 'lost';

export interface Place {
  id: number;
  kind: PlaceKind;
  name: string;
  district: number;
  x: number;
  y: number;
  since: number;
  founder: string;
  /** Story lines; grows as the decades pass. */
  story: string[];
  state: PlaceState;
  /** 보존 지정: never demolished; costs upkeep. */
  protected: boolean;
  /** Support for the owners (가업 지원 etc.): fewer closures. */
  support: number;
  /** For reused places, what they became. */
  reuse?: string;
  /** When it was lost, and why. */
  lostYear?: number;
  lostWhy?: string;
  /** A record was made before it went (기록 남기기): counts for half when lost. */
  recorded?: boolean;
}

export interface Lost { place: number; year: number; why: string; by: string }

export interface Decade {
  year: number;
  decision: string;
  by: string;
  headlines: string[];
  lost: string[];
  indicators: Indicators;
}

export interface Indicators { memory: number; vitality: number; residents: number; budget: number }

export interface Game {
  version: 1;
  seed: number;
  rng: number;
  gu: string;
  year: number;
  turn: number;
  ground: Uint8Array;
  height: Float32Array;
  road: Uint8Array;
  district: Int8Array;
  btype: Uint8Array;
  built: Int16Array;
  floors: Uint8Array;
  districts: District[];
  places: Place[];
  /** 억 원 */
  money: number;
  history: Decade[];
  lost: Lost[];
  /** Cards on the table this turn (ids into the card list with their targets). */
  offer: Offer[];
  mayor: MayorPick;
  /** The new town across the river has been built. */
  newtown?: boolean;
  done: boolean;
}

/** A card on the table, bound to a 동네, a place, or an area (centre cell + radius). */
export interface Offer { card: string; district: number; place: number; cell: number; r: number }

/** The AI mayor standing in this decade, should the player hand it over. */
export interface MayorPick { id: string; trait: string }

export const idx = (x: number, y: number) => y * N + x;
export const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N;

export function rand(g: { rng: number }): number {
  g.rng = (g.rng + 0x6d2b79f5) >>> 0;
  let t = g.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const pick = <T>(g: { rng: number }, a: readonly T[]): T => a[Math.floor(rand(g) * a.length)];
export const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

/** Cells of a district within r cells of (cx, cy). */
export function cellsNear(g: Game, cx: number, cy: number, r: number, d = -1): number[] {
  const out: number[] = [];
  for (let y = Math.max(0, cy - r); y <= Math.min(N - 1, cy + r); y++) for (let x = Math.max(0, cx - r); x <= Math.min(N - 1, cx + r); x++) {
    const i = idx(x, y);
    if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
    if (d >= 0 && g.district[i] !== d) continue;
    out.push(i);
  }
  return out;
}

export const placeAt = (g: Game, i: number) => g.places.find((p) => p.y * N + p.x === i && p.state !== 'lost');

/** Buildable cells of a district: land, not road. */
export function districtCells(g: Game, d: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < N * N; i++) if (g.district[i] === d && !g.road[i] && g.ground[i] === Ground.Land) out.push(i);
  return out;
}
