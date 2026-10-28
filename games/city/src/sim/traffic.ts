import { CELL, KINDS, N, ROAD_CAPACITY, ROAD_SPEED, Zone } from './defs';
import { network } from './network';
import { cellOf, forEachNeighbour, NN, roadTypeOf } from './graph';
import { tryTransit } from './transit';
import { rand, type World } from './world';

/**
 * Commuter traffic. Every car is a real trip between two buildings along an
 * A* route on the road grid; cars slow down as a cell fills past capacity,
 * and the smoothed load per cell is the congestion everyone else reads.
 */
export interface Car {
  path: Int32Array;
  i: number;
  t: number;
  kind: 0 | 1 | 2 | 3; // car, bus-ish van, truck, delivery scooter
  look: number;
  age: number;
}

export const MAX_CARS = 1600;
/** Visual speed-up: cars cover a city in seconds, not real minutes. */
const PACE = 4;

export interface Traffic {
  cars: Car[];
  load: Uint16Array;
  routes: Map<string, Int32Array | null>;
  routesVer: number;
  tripTime: number;
  trips: number;
}

export function createTraffic(): Traffic {
  return { cars: [], load: new Uint16Array(NN * 2), routes: new Map(), routesVer: -1, tripTime: 0, trips: 0 };
}

/** Rush hours fill the roads; nights are quiet. */
export function rushFactor(hour: number): number {
  const peak = (h: number, c: number, wdt: number) => Math.exp(-(((h - c) / wdt) ** 2));
  return 0.25 + 0.9 * peak(hour, 8, 1.4) + 0.75 * peak(hour, 18.5, 1.8) + 0.3 * peak(hour, 13, 3);
}

export function stepTraffic(w: World, tr: Traffic, dt: number, hour: number) {
  const net = network(w);
  if (tr.routesVer !== w.ver.roads) { tr.routes.clear(); tr.routesVer = w.ver.roads; }
  // Spawn toward a target that follows population and the time of day.
  const target = Math.min(MAX_CARS, Math.round((w.stats.pop / 9 + w.stats.employed / 20) * rushFactor(hour)));
  let spawn = Math.min(40, Math.ceil((target - tr.cars.length) * 0.08));
  if (spawn > 0) {
    const homes: number[] = [], works: number[] = [], shops: number[] = [];
    w.buildings.forEach((b) => {
      const a = net.access.get(b.id);
      if (a === undefined || b.abandoned || b.occ < 1) return;
      const z = KINDS[b.kind].zone;
      if (z === Zone.R) homes.push(b.id);
      else if (z === Zone.C) { works.push(b.id); shops.push(b.id); }
      else if (z === Zone.I) works.push(b.id);
    });
    const outside = [...net.outside];
    while (spawn-- > 0 && homes.length) {
      const morning = hour < 12;
      const home = homes[(rand(w) * homes.length) | 0];
      const goShop = rand(w) < (hour > 10 && hour < 17 ? 0.5 : 0.2);
      const pool = goShop && shops.length ? shops : works;
      let a: number | undefined, b: number | undefined;
      const ha = net.access.get(home)!;
      if (pool.length && rand(w) < 0.9) {
        const dest = pool[(rand(w) * pool.length) | 0];
        const da = net.access.get(dest)!;
        [a, b] = morning ? [ha, da] : [da, ha];
      } else if (outside.length) {
        // Some trips leave the city along the expressway.
        const edge = edgeCellOf(w, net.comp, outside[0]);
        if (edge >= 0) [a, b] = morning ? [ha, edge] : [edge, ha];
      }
      if (a === undefined || b === undefined || a === b || net.comp[a] !== net.comp[b]) continue;
      // Near a bus stop or a station at both ends, some people leave the car at home.
      const ride = tryTransit(w, a, b, rand(w));
      if (ride !== null) { tr.tripTime += ride; tr.trips++; continue; }
      const path = route(w, tr, a, b);
      if (!path || path.length < 2) continue;
      const kindRoll = rand(w);
      // Shop trips are often 배달 오토바이 bringing chicken and 짜장면.
      const kind = goShop && kindRoll < 0.3 ? 3 : kindRoll < 0.08 ? 2 : kindRoll < 0.15 ? 1 : 0;
      tr.cars.push({ path, i: 0, t: 0, kind, look: rand(w), age: 0 });
    }
  }
  // Move.
  tr.load.fill(0);
  for (const c of tr.cars) tr.load[c.path[c.i]]++;
  const keep: Car[] = [];
  for (const c of tr.cars) {
    const node = c.path[c.i];
    const r = (roadTypeOf(w, node) || 1) as 1 | 2;
    const over = tr.load[node] / ROAD_CAPACITY[r];
    const slow = over > 1 ? 1 / (1 + (over - 1) * 1.8) : 1;
    // A diagonal step is √2 cells long, so it takes longer to cover.
    const next = c.path[Math.min(c.i + 1, c.path.length - 1)];
    const a = cellOf(node), b = cellOf(next);
    const len = a % N !== b % N && ((a / N) | 0) !== ((b / N) | 0) ? Math.SQRT2 : 1;
    const v = (ROAD_SPEED[r] * PACE * slow) / CELL / len;
    c.t += v * dt;
    c.age += dt;
    while (c.t >= 1 && c.i < c.path.length - 1) {
      tr.load[c.path[c.i]]--;
      c.t -= 1;
      c.i++;
      tr.load[c.path[c.i]]++;
    }
    if (c.i >= c.path.length - 1 && c.t >= 0.5) {
      tr.tripTime += c.age;
      tr.trips++;
      continue;
    }
    keep.push(c);
  }
  tr.cars = keep;
  // Congestion field: load relative to capacity, smoothed over time.
  const k = Math.min(1, dt * 0.6);
  for (let i = 0; i < N * N; i++) {
    // The busier of the two layers sets the cell's congestion.
    const r = w.road[i] as 0 | 1 | 2, ra = w.roadAlt[i] as 0 | 1 | 2;
    const lv = Math.max(r ? tr.load[i] / ROAD_CAPACITY[r as 1 | 2] : 0, ra ? tr.load[i + NN] / ROAD_CAPACITY[ra as 1 | 2] : 0);
    w.traffic[i] += (Math.min(2, lv) - w.traffic[i]) * k;
  }
}

/** Fold the day's trips into the commute stat (in game minutes). */
export function closeDay(w: World, tr: Traffic) {
  if (tr.trips) {
    const minutes = (tr.tripTime / tr.trips) * 2;
    w.stats.commute += (minutes - w.stats.commute) * 0.3;
  }
  tr.tripTime = 0;
  tr.trips = 0;
  let sum = 0, n = 0;
  for (let i = 0; i < N * N; i++) if (w.road[i] || w.roadAlt[i]) { sum += Math.min(1.5, w.traffic[i]); n++; }
  w.stats.congestion = n ? sum / n : 0;
}

function edgeCellOf(w: World, comp: Int32Array, id: number): number {
  for (let y = 0; y < N; y++) { const i = y * N; if (w.road[i] && comp[i] === id) return i; }
  for (let x = 0; x < N; x++) { if (w.road[x] && comp[x] === id) return x; }
  return -1;
}

/* ---------------------------------------------------------------- routing */

export function route(w: World, tr: Traffic, from: number, to: number): Int32Array | null {
  const key = `${from}>${to}`;
  const hit = tr.routes.get(key);
  if (hit !== undefined) return hit;
  const p = astar(w, from, to);
  if (tr.routes.size > 4000) tr.routes.clear();
  tr.routes.set(key, p);
  return p;
}

/** A* over road nodes; avenues are faster so routes prefer them. */
function astar(w: World, from: number, to: number): Int32Array | null {
  const tc = cellOf(to), tx = tc % N, ty = (tc / N) | 0;
  const g = new Map<number, number>();
  const prev = new Map<number, number>();
  const heap = new Heap();
  g.set(from, 0);
  heap.push(from, 0);
  const vmax = ROAD_SPEED[2];
  while (heap.size) {
    const c = heap.pop();
    if (c === to) break;
    const gc = g.get(c)!;
    forEachNeighbour(w, c, (n, len) => {
      const cost = gc + len / ROAD_SPEED[roadTypeOf(w, n) as 1 | 2];
      if (cost < (g.get(n) ?? Infinity)) {
        g.set(n, cost);
        prev.set(n, c);
        const nc = cellOf(n), dx = Math.abs((nc % N) - tx), dy = Math.abs(((nc / N) | 0) - ty);
        // Octile distance: diagonals are allowed.
        heap.push(n, cost + (Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)) / vmax);
      }
    });
  }
  if (!prev.has(to) && from !== to) return null;
  const out: number[] = [to];
  let c = to;
  while (c !== from) { c = prev.get(c)!; out.push(c); }
  return Int32Array.from(out.reverse());
}

class Heap {
  private k: number[] = [];
  private p: number[] = [];
  get size() { return this.k.length; }
  push(key: number, pri: number) {
    const k = this.k, p = this.p;
    k.push(key); p.push(pri);
    let i = k.length - 1;
    while (i > 0) {
      const j = (i - 1) >> 1;
      if (p[j] <= p[i]) break;
      [k[i], k[j]] = [k[j], k[i]]; [p[i], p[j]] = [p[j], p[i]];
      i = j;
    }
  }
  pop(): number {
    const k = this.k, p = this.p;
    const top = k[0];
    const lk = k.pop()!, lp = p.pop()!;
    if (k.length) {
      k[0] = lk; p[0] = lp;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < k.length && p[l] < p[m]) m = l;
        if (r < k.length && p[r] < p[m]) m = r;
        if (m === i) break;
        [k[i], k[m]] = [k[m], k[i]]; [p[i], p[m]] = [p[m], p[i]];
        i = m;
      }
    }
    return top;
  }
}
