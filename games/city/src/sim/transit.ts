import { CELL, Ground, KINDS, N, Road } from './defs';
import { cellOf, forEachNeighbour } from './graph';
import { invalidateNetwork } from './network';
import { addBuilding, demolish } from './tools';
import { idx, notify, type World } from './world';
import { roundaboutAt } from './roundabout';

/**
 * Public transport. A bus line is a loop of stops on road cells; buses follow
 * the roads between them. A subway line is a chain of stations joined by
 * tunnels that ignore the street grid. A trip whose home and destination are
 * both near the same line may leave the car at home.
 */
export type LineKind = 'bus' | 'metro';

/**
 * Korean bus kinds, after the colour scheme Seoul brought in in 2004 and
 * most cities follow:
 *  - 마을버스: small buses round the back streets to the nearest station.
 *    Cheap, short loops, stops close together.
 *  - 지선버스 (green): neighbourhood to neighbourhood, feeding the trunk lines.
 *  - 간선버스 (blue): long runs along the big roads, quicker on the
 *    중앙버스전용차로.
 *  - 광역버스 (red): straight out of town along the expressway; it carries
 *    commuters leaving the city and barely anyone inside it.
 */
export type BusType = 'village' | 'branch' | 'trunk' | 'express';
export const BUS_TYPES: Record<BusType, {
  name: string; color: string; radius: number; share: number; speed: number;
  cost: { line: number; stop: number }; upkeep: number; cellsPerBus: number;
  /** Longest loop (cells) the line may drive, or 0 for no limit. */
  maxLoop: number;
  /** What it is good at and where it falls short, in the player's words (the line panel shows it). */
  good: string; bad: string;
}> = {
  village: { name: '마을버스', color: '#f0a500', radius: 4, share: 0.45, speed: 2.6, cost: { line: 150, stop: 20 }, upkeep: 15, cellsPerBus: 22, maxLoop: 300, good: '가장 싸고, 골목 사람을 지하철역까지 잘 실어 날라요. 역으로 갈아타면 승객이 가장 많이 늘어요.', bad: '가장 느리고, 한 바퀴 3km 안의 짧은 노선만 돼요.' },
  branch: { name: '지선버스', color: '#5bb025', radius: 4, share: 0.35, speed: 3.2, cost: { line: 400, stop: 60 }, upkeep: 45, cellsPerBus: 28, maxLoop: 0, good: '길이 제한이 없어 동네와 동네, 터널 너머까지 이어요. 값과 속도가 중간이에요.', bad: '타는 사람 비율이 가장 낮아요.' },
  trunk: { name: '간선버스', color: '#3d5bab', radius: 4, share: 0.4, speed: 3.8, cost: { line: 700, stop: 80 }, upkeep: 60, cellsPerBus: 34, maxLoop: 0, good: '빠르고 많이 태워요. 대로를 따라 도시를 가로지르는 줄기 노선이에요.', bad: '짓고 굴리는 데 지선의 1.5배쯤 들어요.' },
  express: { name: '광역버스', color: '#d6262b', radius: 5, share: 0.55, speed: 5, cost: { line: 1500, stop: 100 }, upkeep: 90, cellsPerBus: 40, maxLoop: 0, good: '가장 빠르고 정류장 범위가 넓어요. 도시 밖으로 출퇴근하는 사람을 실어 날라요.', bad: '가장 비싸고, 정류장 하나는 서쪽 고속도로 입구 가까이 있어야 해요.' },
};
export const busTypeOf = (l: Pick<TransitLine, 'kind' | 'bus'>): BusType => l.bus ?? 'branch';

export interface TransitLine {
  id: number;
  kind: LineKind;
  name: string;
  color: string;
  stops: number[]; // cell indices: road cells for buses, station cells for the subway
  /** Bus kind (older saves: 지선버스). */
  bus?: BusType;
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

export const METRO_COLORS = ['#263c96', '#3cb44a', '#ef7c1c', '#00a5de', '#996cac', '#cd7c2f', '#747f00', '#e6186c', '#bdb092'];

/* ------------------------------------------------------------ validation */

export function stopProblem(w: World, kind: LineKind, i: number, draft: number[]): string | null {
  if (draft.includes(i)) return '이미 고른 정류장이에요.';
  if (kind === 'bus' && !w.road[i] && w.roadAlt[i]) return '터널, 지하차도, 고가도로 위에는 정류장을 둘 수 없어요. 앞뒤 도로에 놓으면 버스는 그 길로 지나가요.';
  if (kind === 'bus') return !w.road[i] ? '버스 정류장은 도로 위에 놓아요.' : roundaboutAt(w, (i % N) * CELL + CELL / 2, ((i / N) | 0) * CELL + CELL / 2) ? '회전교차로 안에는 정류장을 둘 수 없어요. 앞뒤 도로에 놓아 주세요.' : null;
  if (w.ground[i] === Ground.Water) return '역은 땅 위에 지어야 해요.';
  if (w.road[i]) return '역은 도로가 아닌 빈 땅이나 구역에 지어요.';
  const id = w.bld[i];
  if (id >= 0 && !KINDS[w.buildings.get(id)!.kind].zone) return '다른 시설이 있어요.';
  return null;
}

export function lineCost(kind: LineKind, stops: number[], bus: BusType = 'branch'): number {
  if (kind === 'bus') { const c = BUS_TYPES[bus].cost; return c.line + stops.length * c.stop; }
  let tunnel = 0;
  for (let k = 1; k < stops.length; k++) tunnel += tunnelLength(stops[k - 1], stops[k]);
  return stops.length * TRANSIT_COST.station + Math.round(tunnel * TRANSIT_COST.tunnel);
}

export const tunnelLength = (a: number, b: number) => Math.hypot((a % N) - (b % N), ((a / N) | 0) - ((b / N) | 0));

/** Why a bus line of this kind can't run these stops, or null. */
export function busProblem(w: World, bus: BusType, stops: number[]): string | null {
  const route = busRoute(w, stops);
  if (!route) return '정류장끼리 도로로 이어져 있지 않아요.';
  const T = BUS_TYPES[bus];
  if (T.maxLoop && route.length > T.maxLoop) return `${T.name}는 한 바퀴 ${T.maxLoop * CELL / 1000}km 안의 짧은 동네 노선이에요. 이 노선은 ${(route.length * CELL / 1000).toFixed(1)}km예요. 멀리 이으려면 지선버스나 간선버스를 쓰세요.`;
  if (bus === 'express' && !stops.some((i) => i % N <= 6)) return '광역버스는 도시 밖으로 나가는 노선이에요. 서쪽 고속도로 입구 가까이에 정류장을 하나 두세요.';
  return null;
}

/** Route numbers the Korean way: 간선 three digits, 지선 four, 광역 starting with 9, 마을버스 by the town's name. */
function lineName(w: World, kind: LineKind, bus: BusType): string {
  const n = w.lines.filter((l) => l.kind === kind && (kind === 'metro' || busTypeOf(l) === bus)).length;
  if (kind === 'metro') return `${n + 1}호선`;
  const town = w.name.replace(/(시|군)$/, '');
  if (bus === 'village') return `${town}${String(n + 1).padStart(2, '0')}`;
  if (bus === 'trunk') return `${(n % 7) + 1}${String(20 + w.nextLine * 7 % 70).padStart(2, '0')}번`;
  if (bus === 'express') return `9${String(100 + w.nextLine * 13 % 900)}번`;
  return `${(n % 7) + 1}${String(100 + w.nextLine * 37 % 900)}번`;
}

export function createLine(w: World, kind: LineKind, stops: number[], bus: BusType = 'branch'): string | null {
  if (stops.length < 2) return '정류장을 두 곳 이상 골라 주세요.';
  for (let k = 0; k < stops.length; k++) { const why = stopProblem(w, kind, stops[k], stops.slice(0, k)); if (why) return why; }
  const cost = lineCost(kind, stops, bus);
  if (cost > w.money) return `예산이 부족해요. (${cost.toLocaleString('ko-KR')}만 원 필요)`;
  if (kind === 'bus') { const why = busProblem(w, bus, stops); if (why) return why; }
  w.money -= cost;
  const same = w.lines.filter((l) => l.kind === kind).length;
  const color = kind === 'bus' ? BUS_TYPES[bus].color : METRO_COLORS[same % METRO_COLORS.length];
  const name = lineName(w, kind, bus);
  if (kind === 'metro') for (const i of stops) {
    if (w.bld[i] >= 0 && w.buildings.get(w.bld[i])?.kind !== 'metro') demolish(w, w.bld[i]);
    if (w.bld[i] < 0) addBuilding(w, 'metro', i % N, (i / N) | 0);
    w.zone[i] = 0;
  }
  w.lines.push({ id: w.nextLine++, kind, name, color, stops: [...stops], ridersMonth: 0, riders: 0, ...(kind === 'bus' ? { bus } : {}) });
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
  // Over the road graph, so buses use diagonals, flyovers and tunnels too.
  const prev = new Int32Array(N * N * 2).fill(-1);
  prev[a] = a;
  const q = [a];
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    if (c === b) break;
    forEachNeighbour(w, c, (n) => { if (prev[n] < 0) { prev[n] = c; q.push(n); } });
  }
  if (prev[b] < 0) return null;
  const out = [b];
  for (let c = b; c !== a; ) { c = prev[c]; out.push(c); }
  return out.reverse();
}

/* -------------------------------------------------------------- coverage */

let cover: { ver: string; lines: Map<number, Uint8Array>; links: Map<number, Set<number>> } = { ver: '', lines: new Map(), links: new Map() };

/** Cells within walking distance of each line; also fills w.transit (0 none, 1 bus, 2 subway). */
export function coverage(w: World): Map<number, Uint8Array> {
  const ver = `${w.ver.transit}:${w.lines.length}:${w.ver.roads}`;
  if (cover.ver === ver) return cover.lines;
  const lines = new Map<number, Uint8Array>();
  w.transit.fill(0);
  for (const l of w.lines) {
    const m = new Uint8Array(N * N);
    const r = l.kind === 'bus' ? BUS_TYPES[busTypeOf(l)].radius : STOP_RADIUS[l.kind];
    // A bus picks people up all along its route (stops every few blocks); the subway only at stations.
    const route = l.kind === 'bus' ? busRoute(w, l.stops, l.id) : null;
    const centres = route ? [...l.stops, ...Array.from(route).filter((_, k) => k % 4 === 0).map(cellOf)] : l.stops;
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
  // Transfer points: two lines link where a stop of one lies within the other's walking reach.
  const links = new Map<number, Set<number>>();
  for (const a of w.lines) {
    const set = new Set<number>();
    for (const b of w.lines) if (a !== b && (a.stops.some((s) => lines.get(b.id)![s]) || b.stops.some((s) => lines.get(a.id)![s]))) set.add(b.id);
    links.set(a.id, set);
  }
  cover = { ver, lines, links };
  return lines;
}

/** Lines you can change to from a line (their stops within walking distance). */
export function transferLinks(w: World): Map<number, Set<number>> { coverage(w); return cover.links; }

const share = (l: TransitLine, outbound: boolean) => {
  if (l.kind === 'metro') return MODE_SHARE.metro;
  const t = busTypeOf(l);
  // 광역버스 runs non-stop through town: it's for leaving the city, hardly for trips inside it.
  if (t === 'express') return outbound ? BUS_TYPES.express.share : 0.06;
  return outbound ? BUS_TYPES[t].share * 0.3 : BUS_TYPES[t].share;
};
const speed = (l: TransitLine) => (l.kind === 'metro' ? SPEED.metro : BUS_TYPES[busTypeOf(l)].speed);

/**
 * Called for each trip about to become a car. Returns the trip time in
 * seconds if it goes by bus or subway instead, or null to drive. `outbound`
 * trips leave the city along the expressway. A trip no single line covers
 * may still change lines where two meet: often with the 환승 할인, rarely
 * without it (paying twice).
 */
export function tryTransit(w: World, from: number, to: number, roll: number, outbound = false): number | null {
  if (!w.lines.length) return null;
  const cov = coverage(w);
  const d = Math.abs((from % N) - (to % N)) + Math.abs(((from / N) | 0) - ((to / N) | 0));
  // A 광역버스 runs on out along the expressway: the far end of a trip leaving town is on its route.
  const at = (l: TransitLine, c: number) => cov.get(l.id)![c] === 1 || (outbound && l.kind === 'bus' && busTypeOf(l) === 'express' && c % N === 0);
  // Direct: the fastest kinds get first chance; each covering line gets its own.
  const cands = w.lines.filter((l) => cov.has(l.id) && at(l, from) && at(l, to)).sort((a, b) => share(b, outbound) - share(a, outbound));
  const feeder = (l: TransitLine) => l.kind === 'bus' && busTypeOf(l) === 'village';
  for (const l of cands) {
    const p = share(l, outbound);
    if (roll < p) { l.ridersMonth += RIDERS_PER_TRIP; return d / speed(l) + 2.5; }
    roll = (roll - p) / (1 - p);
  }
  // One change of line.
  const links = cover.links;
  // 마을버스 first: its whole job is to carry the back streets to a bigger line.
  const starts = w.lines.filter((l) => cov.has(l.id) && at(l, from)).sort((a, b) => +feeder(b) - +feeder(a));
  for (const a of starts) for (const bId of links.get(a.id) ?? []) {
    const b = w.lines.find((l) => l.id === bId)!;
    if (!at(b, to) || at(a, to)) continue;
    // A 마을버스 to the subway is the trip it exists for: no loss for the change when the discount holds.
    const ease = w.transferDiscount ? (feeder(a) && b.kind === 'metro' ? 1 : 0.75) : 0.25;
    const p = Math.min(share(a, false), share(b, outbound)) * ease;
    if (roll < p) {
      a.ridersMonth += RIDERS_PER_TRIP;
      b.ridersMonth += RIDERS_PER_TRIP;
      w.transfersMonth += RIDERS_PER_TRIP;
      return d / Math.min(speed(a), speed(b)) + 6; // walking across and waiting for the second bus
    }
    roll = (roll - p) / (1 - p);
  }
  return null;
}

/* -------------------------------------------------------------- 역세권 */

/**
 * 역세권: the area within walking distance of a subway station. Korean
 * planning law draws the first ring at 250 m (1차 역세권); here that is 25
 * cells. Land is worth more there, so it fills and grows denser first.
 */
export const STATION_AREA = 25;

let areaCache: { ver: string; m: Uint8Array } = { ver: '', m: new Uint8Array(0) };
/** 1 for cells within 250 m of a subway station. */
export function stationArea(w: World): Uint8Array {
  const ver = `${w.ver.transit}:${w.lines.length}`;
  if (areaCache.ver === ver && areaCache.m.length === N * N) return areaCache.m;
  const m = new Uint8Array(N * N), r = STATION_AREA;
  for (const s of stationCells(w)) {
    const sx = s % N, sy = (s / N) | 0;
    for (let y = Math.max(0, sy - r); y <= Math.min(N - 1, sy + r); y++)
      for (let x = Math.max(0, sx - r); x <= Math.min(N - 1, sx + r); x++) if ((x - sx) ** 2 + (y - sy) ** 2 <= r * r) m[idx(x, y)] = 1;
  }
  areaCache = { ver, m };
  return m;
}

export const stationCells = (w: World) => [...new Set(w.lines.filter((l) => l.kind === 'metro').flatMap((l) => l.stops))];

/** People living and working in the 역세권, and its share of the city. */
export function stationAreaStats(w: World): { pop: number; jobs: number; share: number; stations: number } {
  const m = stationArea(w);
  let pop = 0, jobs = 0;
  w.buildings.forEach((b) => {
    const d = KINDS[b.kind];
    if (!d.zone || !m[idx(b.x, b.y)]) return;
    if (d.residents) pop += b.occ; else jobs += b.occ;
  });
  return { pop: Math.round(pop), jobs: Math.round(jobs), share: w.stats.pop ? pop / w.stats.pop : 0, stations: stationCells(w).length };
}

/** Land value near stations and stops: the 역세권 premium. */
export function transitLandBonus(w: World, bonus: Float32Array) {
  // The whole 역세권 is worth a little more, most of all close to the station.
  const r = STATION_AREA;
  for (const s of stationCells(w)) {
    const sx = s % N, sy = (s / N) | 0;
    for (let y = Math.max(0, sy - r); y <= Math.min(N - 1, sy + r); y++)
      for (let x = Math.max(0, sx - r); x <= Math.min(N - 1, sx + r); x++) {
        const d = Math.hypot(x - sx, y - sy);
        if (d <= r) bonus[idx(x, y)] = Math.max(bonus[idx(x, y)], 5 * (1 - d / (r + 1)));
      }
  }
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
  return p ? Math.max(1, Math.round(p.length / BUS_TYPES[busTypeOf(l)].cellsPerBus)) : 0;
}

export function lineUpkeep(w: World, l: TransitLine): number {
  if (l.kind === 'bus') return busCount(w, l) * BUS_TYPES[busTypeOf(l)].upkeep;
  let t = 0;
  for (let k = 1; k < l.stops.length; k++) t += tunnelLength(l.stops[k - 1], l.stops[k]);
  return l.stops.length * TRANSIT_UPKEEP.station + t * TRANSIT_UPKEEP.tunnel;
}

/** Close the month for every line: last month's riders become the visible figure. */
export function closeTransitMonth(w: World) {
  for (const l of w.lines) { l.riders = l.ridersMonth; l.ridersMonth = 0; }
  w.transfers = w.transfersMonth;
  w.transfersMonth = 0;
}

/**
 * Fare income for the month. Each boarding pays 1,400원, except that with the
 * 환승 할인 a change of line is free (the trip pays once; in reality a small
 * distance top-up, left out here).
 */
export const fareIncome = (w: World) => (w.lines.reduce((a, l) => a + l.ridersMonth, 0) - (w.transferDiscount ? w.transfersMonth : 0)) * FARE;

export const metroPathLength = (l: TransitLine) => {
  let t = 0;
  for (let k = 1; k < l.stops.length; k++) t += tunnelLength(l.stops[k - 1], l.stops[k]);
  return t * CELL;
};
