import { CELL, Ground, KINDS, N, Road } from './defs';
import { invalidateNetwork } from './network';
import { addBuilding, demolish } from './tools';
import { idx, notify, type World } from './world';

/**
 * Public transport. A bus line is a loop of stops on road cells; buses follow
 * the roads between them. A subway line is a chain of stations joined by
 * tunnels that ignore the street grid. A trip whose home and destination are
 * both near the same line may leave the car at home.
 */
export type LineKind = 'bus' | 'metro';

export interface TransitLine {
  id: number;
  kind: LineKind;
  name: string;
  color: string;
  stops: number[]; // cell indices: road cells for buses, station cells for the subway
  /** Riders so far this month, and last month's total. */
  ridersMonth: number;
  riders: number;
}

export const STOP_RADIUS = { bus: 4, metro: 9 } as const;
/** Construction: per stop / station, and per cell of tunnel. */
export const TRANSIT_COST = { busStop: 60, busLine: 400, station: 5000, tunnel: 90 } as const;
/** Monthly upkeep: a bus line pays per bus, a subway per station plus its tunnels. */
export const TRANSIT_UPKEEP = { bus: 45, station: 110, tunnel: 0.6 } as const;
/** Fare per rider in 만원 (1,400원 for both, like a 교통카드 base fare). */
export const FARE = 0.14;
/** Share of covered trips that take the line instead of a car. */
const MODE_SHARE = { bus: 0.35, metro: 0.6 } as const;
/** One simulated trip stands for a day's worth of riders on that pair of stops. */
const RIDERS_PER_TRIP = 40;
/** Cells per second, against about 3.6 for a car on a free street. */
const SPEED = { bus: 3.2, metro: 9 } as const;

export const BUS_COLORS = ['#2e9e4f', '#2f6db5', '#d9483b', '#e0a400'];
export const METRO_COLORS = ['#263c96', '#3cb44a', '#ef7c1c', '#00a5de', '#996cac', '#cd7c2f', '#747f00', '#e6186c', '#bdb092'];

/* ------------------------------------------------------------ validation */

export function stopProblem(w: World, kind: LineKind, i: number, draft: number[]): string | null {
  if (draft.includes(i)) return '이미 고른 정류장이에요.';
  if (kind === 'bus') return w.road[i] ? null : '버스 정류장은 도로 위에 놓아요.';
  if (w.ground[i] === Ground.Water) return '역은 땅 위에 지어야 해요.';
  if (w.road[i]) return '역은 도로가 아닌 빈 땅이나 구역에 지어요.';
  const id = w.bld[i];
  if (id >= 0 && !KINDS[w.buildings.get(id)!.kind].zone) return '다른 시설이 있어요.';
  return null;
}

export function lineCost(kind: LineKind, stops: number[]): number {
  if (kind === 'bus') return TRANSIT_COST.busLine + stops.length * TRANSIT_COST.busStop;
  let tunnel = 0;
  for (let k = 1; k < stops.length; k++) tunnel += tunnelLength(stops[k - 1], stops[k]);
  return stops.length * TRANSIT_COST.station + Math.round(tunnel * TRANSIT_COST.tunnel);
}

export const tunnelLength = (a: number, b: number) => Math.hypot((a % N) - (b % N), ((a / N) | 0) - ((b / N) | 0));

export function createLine(w: World, kind: LineKind, stops: number[]): string | null {
  if (stops.length < 2) return '정류장을 두 곳 이상 골라 주세요.';
  for (let k = 0; k < stops.length; k++) { const why = stopProblem(w, kind, stops[k], stops.slice(0, k)); if (why) return why; }
  const cost = lineCost(kind, stops);
  if (cost > w.money) return `예산이 부족해요. (${cost.toLocaleString('ko-KR')}만 원 필요)`;
  if (kind === 'bus' && !busRoute(w, stops)) return '정류장끼리 도로로 이어져 있지 않아요.';
  w.money -= cost;
  const same = w.lines.filter((l) => l.kind === kind).length;
  const color = kind === 'bus' ? BUS_COLORS[same % BUS_COLORS.length] : METRO_COLORS[same % METRO_COLORS.length];
  const name = kind === 'bus' ? `${100 + w.nextLine * 3 + same}번 버스` : `${same + 1}호선`;
  if (kind === 'metro') for (const i of stops) {
    if (w.bld[i] >= 0 && w.buildings.get(w.bld[i])?.kind !== 'metro') demolish(w, w.bld[i]);
    if (w.bld[i] < 0) addBuilding(w, 'metro', i % N, (i / N) | 0);
    w.zone[i] = 0;
  }
  w.lines.push({ id: w.nextLine++, kind, name, color, stops: [...stops], ridersMonth: 0, riders: 0 });
  w.ver.transit++;
  w.ver.zones++;
  invalidateNetwork();
  notify(w, `${name} 개통! 정류장 ${stops.length}곳`, 'good');
  return null;
}

export function removeLine(w: World, id: number) {
  const line = w.lines.find((l) => l.id === id);
  if (!line) return;
  w.lines = w.lines.filter((l) => l !== line);
  if (line.kind === 'metro') for (const i of line.stops) {
    if (w.lines.some((l) => l.kind === 'metro' && l.stops.includes(i))) continue;
    const b = w.bld[i] >= 0 ? w.buildings.get(w.bld[i]) : undefined;
    if (b?.kind === 'metro') demolish(w, b.id);
  }
  w.ver.transit++;
  notify(w, `${line.name}을(를) 폐선했어요.`, 'info');
}

/** Drop stops that no longer exist (a road or station bulldozed) and lines left with fewer than two. */
export function pruneLines(w: World) {
  let changed = false;
  for (const l of w.lines) {
    const ok = l.stops.filter((i) => (l.kind === 'bus' ? w.road[i] !== Road.None : w.buildings.get(w.bld[i])?.kind === 'metro'));
    if (ok.length !== l.stops.length) { l.stops = ok; changed = true; }
  }
  const dead = w.lines.filter((l) => l.stops.length < 2);
  for (const l of dead) removeLine(w, l.id);
  if (changed && !dead.length) w.ver.transit++;
}

/* --------------------------------------------------------------- routes */

const routeCache = new Map<number, { key: string; path: Int32Array | null }>();

/** The road cells a bus drives, stop to stop and back to the first. */
export function busRoute(w: World, stops: number[], lineId = -1): Int32Array | null {
  const key = `${w.ver.roads}:${stops.join(',')}`;
  const hit = lineId >= 0 ? routeCache.get(lineId) : undefined;
  if (hit && hit.key === key) return hit.path;
  const out: number[] = [];
  const loop = [...stops, stops[0]];
  let path: Int32Array | null = null;
  for (let k = 1; k < loop.length; k++) {
    const seg = bfs(w, loop[k - 1], loop[k]);
    if (!seg) { path = null; out.length = 0; break; }
    out.push(...(out.length ? seg.slice(1) : seg));
  }
  if (out.length) path = Int32Array.from(out);
  if (lineId >= 0) routeCache.set(lineId, { key, path });
  return path;
}

function bfs(w: World, a: number, b: number): number[] | null {
  if (a === b) return [a];
  const prev = new Int32Array(N * N).fill(-1);
  prev[a] = a;
  const q = [a];
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    if (c === b) break;
    const x = c % N, y = (c / N) | 0;
    for (const n of [x > 0 ? c - 1 : -1, x < N - 1 ? c + 1 : -1, y > 0 ? c - N : -1, y < N - 1 ? c + N : -1]) {
      if (n < 0 || !w.road[n] || prev[n] >= 0) continue;
      prev[n] = c;
      q.push(n);
    }
  }
  if (prev[b] < 0) return null;
  const out = [b];
  for (let c = b; c !== a; ) { c = prev[c]; out.push(c); }
  return out.reverse();
}

/* -------------------------------------------------------------- coverage */

let cover: { ver: string; lines: Map<number, Uint8Array> } = { ver: '', lines: new Map() };

/** Cells within walking distance of each line; also fills w.transit (0 none, 1 bus, 2 subway). */
export function coverage(w: World): Map<number, Uint8Array> {
  const ver = `${w.ver.transit}:${w.lines.length}:${w.ver.roads}`;
  if (cover.ver === ver) return cover.lines;
  const lines = new Map<number, Uint8Array>();
  w.transit.fill(0);
  for (const l of w.lines) {
    const m = new Uint8Array(N * N);
    const r = STOP_RADIUS[l.kind];
    // A bus picks people up all along its route (stops every few blocks); the subway only at stations.
    const route = l.kind === 'bus' ? busRoute(w, l.stops, l.id) : null;
    const centres = route ? [...l.stops, ...Array.from(route).filter((_, k) => k % 4 === 0)] : l.stops;
    for (const s of centres) {
      const sx = s % N, sy = (s / N) | 0;
      for (let y = Math.max(0, sy - r); y <= Math.min(N - 1, sy + r); y++)
        for (let x = Math.max(0, sx - r); x <= Math.min(N - 1, sx + r); x++) {
          if (Math.hypot(x - sx, y - sy) > r) continue;
          const i = idx(x, y);
          m[i] = 1;
          w.transit[i] = Math.max(w.transit[i], l.kind === 'metro' ? 2 : 1);
        }
    }
    lines.set(l.id, m);
  }
  cover = { ver, lines };
  return lines;
}

/**
 * Called for each trip about to become a car. Returns the trip time in
 * seconds if it goes by bus or subway instead, or null to drive.
 */
export function tryTransit(w: World, from: number, to: number, roll: number): number | null {
  if (!w.lines.length) return null;
  const cov = coverage(w);
  // Subway lines are tried first; each covering line gets its own chance at the trip.
  const cands = w.lines.filter((l) => { const m = cov.get(l.id); return m && m[from] && m[to]; }).sort((a, b) => MODE_SHARE[b.kind] - MODE_SHARE[a.kind]);
  let best: TransitLine | null = null;
  for (const l of cands) {
    const p = MODE_SHARE[l.kind];
    if (roll < p) { best = l; break; }
    roll = (roll - p) / (1 - p);
  }
  if (!best) return null;
  best.ridersMonth += RIDERS_PER_TRIP;
  const d = Math.abs((from % N) - (to % N)) + Math.abs(((from / N) | 0) - ((to / N) | 0));
  return d / SPEED[best.kind] + 2.5;
}

/** Land value near stations and stops: the 역세권 premium. */
export function transitLandBonus(w: World, bonus: Float32Array) {
  for (const l of w.lines) {
    const r = l.kind === 'metro' ? 6 : 3, v = l.kind === 'metro' ? 12 : 3;
    for (const s of l.stops) {
      const sx = s % N, sy = (s / N) | 0;
      for (let y = Math.max(0, sy - r); y <= Math.min(N - 1, sy + r); y++)
        for (let x = Math.max(0, sx - r); x <= Math.min(N - 1, sx + r); x++) {
          const d = Math.hypot(x - sx, y - sy);
          if (d <= r) bonus[idx(x, y)] = Math.max(bonus[idx(x, y)], v * (1 - d / (r + 1)));
        }
    }
  }
}

/* --------------------------------------------------------------- economy */

export function busCount(w: World, l: TransitLine): number {
  if (l.kind !== 'bus') return 0;
  const p = busRoute(w, l.stops, l.id);
  return p ? Math.max(1, Math.round(p.length / 28)) : 0;
}

export function lineUpkeep(w: World, l: TransitLine): number {
  if (l.kind === 'bus') return busCount(w, l) * TRANSIT_UPKEEP.bus;
  let t = 0;
  for (let k = 1; k < l.stops.length; k++) t += tunnelLength(l.stops[k - 1], l.stops[k]);
  return l.stops.length * TRANSIT_UPKEEP.station + t * TRANSIT_UPKEEP.tunnel;
}

/** Close the month for every line: last month's riders become the visible figure. */
export function closeTransitMonth(w: World) {
  for (const l of w.lines) { l.riders = l.ridersMonth; l.ridersMonth = 0; }
}

export const metroPathLength = (l: TransitLine) => {
  let t = 0;
  for (let k = 1; k < l.stops.length; k++) t += tunnelLength(l.stops[k - 1], l.stops[k]);
  return t * CELL;
};
