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
/** 골목 (alley) is the narrow lane that reaches the lots a street can't. */
export const RoadT = { None: 0, Alley: 1, Street: 2, Avenue: 3 } as const;

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
  for (let i = 0; i < N * N; i++) if (g.district[i] === d && !g.road[i] && g.ground[i] !== Ground.Water) out.push(i);
  return out;
}

/** Is any of the four neighbours a road? */
export function touchesRoad(g: { road: Uint8Array }, x: number, y: number): boolean {
  return (x > 0 && g.road[y * N + x - 1] > 0) || (x < N - 1 && g.road[y * N + x + 1] > 0)
    || (y > 0 && g.road[(y - 1) * N + x] > 0) || (y < N - 1 && g.road[(y + 1) * N + x] > 0);
}

/**
 * Make sure every lot in `need` faces a road: cut 골목 through the blocks the
 * streets leave too deep, then, for anything still shut in, a dead-end lane
 * from the nearest road. Only alleys that join the road network are kept.
 */
export function carveAlleys(g: Game, need: (i: number) => boolean) {
  const open = (i: number) => need(i) && !g.road[i];
  // 1. Blocks: connected lots between roads. Lanes run along the long side, every third row.
  const block = new Int32Array(N * N).fill(-1);
  let nb = 0;
  for (let s = 0; s < N * N; s++) {
    if (!open(s) || block[s] >= 0) continue;
    const cells: number[] = [s];
    block[s] = nb;
    for (let k = 0; k < cells.length; k++) {
      const i = cells[k], x = i % N, y = (i / N) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < N - 1 ? i + 1 : -1, y > 0 ? i - N : -1, y < N - 1 ? i + N : -1]) if (j >= 0 && block[j] < 0 && open(j)) { block[j] = nb; cells.push(j); }
    }
    nb++;
    let x0 = N, x1 = 0, y0 = N, y1 = 0;
    for (const i of cells) { const x = i % N, y = (i / N) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const wide = x1 - x0 >= y1 - y0;
    const span = wide ? y1 - y0 : x1 - x0;
    for (const i of cells) {
      const x = i % N, y = (i / N) | 0;
      const r = wide ? y - y0 : x - x0;
      if (r % 3 === 2 && r < span) g.road[i] = RoadT.Alley;
    }
  }
  // 2. Keep only alleys joined to the street network.
  const reach = new Uint8Array(N * N);
  const q: number[] = [];
  for (let i = 0; i < N * N; i++) if (g.road[i] >= RoadT.Street) { reach[i] = 1; q.push(i); }
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % N, y = (i / N) | 0;
    for (const j of [x > 0 ? i - 1 : -1, x < N - 1 ? i + 1 : -1, y > 0 ? i - N : -1, y < N - 1 ? i + N : -1]) if (j >= 0 && !reach[j] && g.road[j]) { reach[j] = 1; q.push(j); }
  }
  for (let i = 0; i < N * N; i++) if (g.road[i] === RoadT.Alley && !reach[i]) g.road[i] = 0;
  // 3. Anything still shut in: a dead-end lane back to the nearest road, through
  //    other lots or open land if it must, every step of it joined up.
  const pass = (i: number) => open(i) || (g.ground[i] !== Ground.Water && !g.road[i] && (g.btype[i] === B.None || g.btype[i] === B.Field));
  const dist = new Int32Array(N * N).fill(-1);
  const bq: number[] = [];
  for (let i = 0; i < N * N; i++) if (g.road[i]) { dist[i] = 0; bq.push(i); }
  for (let k = 0; k < bq.length; k++) {
    const i = bq[k], x = i % N, y = (i / N) | 0;
    for (const j of [x > 0 ? i - 1 : -1, x < N - 1 ? i + 1 : -1, y > 0 ? i - N : -1, y < N - 1 ? i + N : -1]) if (j >= 0 && dist[j] < 0 && pass(j)) { dist[j] = dist[i] + 1; bq.push(j); }
  }
  const order = bq.filter((i) => dist[i] >= 2 && need(i)).sort((a, b) => dist[a] - dist[b]);
  for (const i of order) {
    if (g.road[i] || touchesRoad(g, i % N, (i / N) | 0)) continue;
    let c = i;
    for (let guard = 0; guard < N; guard++) {
      const x = c % N, y = (c / N) | 0;
      // Step toward the network, preferring a cell that already sits on a road (straight lanes, no zigzags).
      let best = -1, bs = Infinity;
      for (const j of [x > 0 ? c - 1 : -1, x < N - 1 ? c + 1 : -1, y > 0 ? c - N : -1, y < N - 1 ? c + N : -1]) {
        if (j < 0 || dist[j] !== dist[c] - 1 || g.road[j]) continue;
        const s2 = touchesRoad(g, j % N, (j / N) | 0) ? 0 : 1;
        if (s2 < bs) { bs = s2; best = j; }
      }
      if (best < 0) break;
      // Joined if it touches a road other than the lane we're laying behind us.
      const bx = best % N, by = (best / N) | 0;
      const joined = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nx = bx + dx, ny = by + dy;
        return nx >= 0 && ny >= 0 && nx < N && ny < N && ny * N + nx !== c && g.road[ny * N + nx] > 0;
      });
      g.road[best] = RoadT.Alley;
      if (g.btype[best] === B.Field) g.btype[best] = B.None;
      if (joined) break;
      c = best;
    }
  }
}
