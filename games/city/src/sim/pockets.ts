import { CELL, Ground, KINDS, N } from './defs';
import { bh, bw, inside, idx, type Building, type World } from './world';

/**
 * Lots with no street frontage. A building only goes up on a lot that
 * touches a road (no house buried behind other houses); the zoned cells
 * behind are left as the block's shared open space, 동네 쉼터: a strip of
 * green, a 소공원 with benches, a 놀이터, a 주말 텃밭, or plain 공터.
 * When the block is redeveloped whole (an 아파트 단지), they go into it.
 */

/** Whether a cell sits right on a road (a road in one of its four neighbours). */
export function onRoad(w: World, i: number): boolean {
  const x = i % N, y = (i / N) | 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (inside(nx, ny) && w.road[idx(nx, ny)]) return true;
  }
  return false;
}

/** Whether any cell of a building's footprint fronts a road. */
export function fronts(w: World, b: { x: number; y: number } & Partial<Pick<Building, 'size' | 'sx' | 'sy'>>): boolean {
  const W = b.sx ?? b.size ?? 1, H = b.sy ?? b.size ?? 1;
  for (let y = b.y; y < b.y + H; y++) for (let x = b.x; x < b.x + W; x++) if (onRoad(w, idx(x, y))) return true;
  return false;
}

export type PocketKind = 'green' | 'park' | 'play' | 'garden' | 'empty';
export const POCKET_NAME: Record<PocketKind, string> = { green: '녹지', park: '소공원', play: '놀이터', garden: '주말 텃밭', empty: '공터' };

/** What a backland cell becomes: the same for the cells that sit together, so a pocket reads as one place. */
export function pocketKind(i: number): PocketKind {
  const x = i % N, y = (i / N) | 0;
  const h = Math.sin(Math.floor(x / 2) * 12.9898 + Math.floor(y / 2) * 78.233) * 43758.5453;
  const r = h - Math.floor(h);
  return r < 0.3 ? 'green' : r < 0.52 ? 'park' : r < 0.7 ? 'play' : r < 0.86 ? 'garden' : 'empty';
}

/** Zoned land with no building that can't take one: a pocket of open space. */
export function isPocket(w: World, i: number): boolean {
  return w.zone[i] !== 0 && !w.road[i] && w.bld[i] < 0 && w.ground[i] === Ground.Land && !onRoad(w, i);
}

/** Every pocket cell, cached until roads, zones or buildings change. */
let cacheKey = '', cacheW: World | null = null, cache: number[] = [];
export function pockets(w: World): number[] {
  const key = `${w.ver.roads}:${w.ver.zones}:${w.ver.buildings}`;
  if (cacheW === w && key === cacheKey) return cache;
  cache = [];
  for (let i = 0; i < N * N; i++) if (isPocket(w, i)) cache.push(i);
  cacheW = w; cacheKey = key;
  return cache;
}

/**
 * Old towns (and saves from before this rule) have houses buried behind
 * others: now and then one of them is cleared for the pocket, its people
 * moving to the street-front lots. Returns the building cleared, if any.
 */
export function clearBackland(w: World, roll: number): Building | null {
  if (roll > 0.15) return null;
  for (const b of w.buildings.values()) {
    const d = KINDS[b.kind];
    if (!d.zone || (d.level ?? 1) >= 3 || bw(b) * bh(b) > 2 || fronts(w, b)) continue;
    return b;
  }
  return null;
}

/** Cell centre in metres. */
export const cellCentre = (i: number) => ({ x: (i % N) * CELL + CELL / 2, z: ((i / N) | 0) * CELL + CELL / 2 });
