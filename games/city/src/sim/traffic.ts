import { drive, laneFor, PACE } from './driving';
import { linkLen } from './junctions';
import { noCarTrip } from './attractions';
import { KINDS, N, ROAD_CAPACITY, ROAD_SPEED, Zone } from './defs';
import { network } from './network';
import { cellOf, forEachNeighbour, NN, roadTypeOf } from './graph';

import { parkedSqueeze } from './parking';
import { tryTransit } from './transit';
import { rand, type World } from './world';

/**
 * Commuter traffic. Every car is a real trip between two buildings along an
 * A* route on the road grid; cars slow down as a cell fills past capacity,
 * and the smoothed load per cell is the congestion everyone else reads.
 */
export interface Car {
  path: Int32Array;
  /** On the link from path[i] to path[i + 1], t of the way along (0.5 is the edge between the two cells). */
  i: number;
  t: number;
  kind: 0 | 1 | 2 | 3; // car, bus-ish van, truck, delivery scooter
  look: number;
  age: number;
  /** Already went round the block looking for a space once. */
  cruised?: boolean;
  /** Speed, m/s (sped up), and the lane on an avenue (0 inner, 1 outer). */
  v: number;
  lane: 0 | 1;
  /** The junction it has gone into (-1 none), with the nodes it came in from and goes out to. */
  jn: number;
  jf: number;
  jt: number;
  /** When it reached the front of the queue at the junction ahead (-1 not yet), and seconds waited there. */
  at: number;
  wait: number;
  /** Seconds without moving, and seconds left squeezing past whatever blocks it. */
  stuck: number;
  ghost: number;
  /** Per step: acceleration, gap ahead, metres to the stop line, whether it may go. */
  acc: number;
  gap: number;
  line: number;
  ok: boolean;
  done?: boolean;
  /** For tests: the car this one is waiting behind or for. */
  by?: Car | null;
  held?: Car | null;
  why?: string;
}

export const MAX_CARS = 1600;
/**
 * Trips start at `target / TRIP_SPREAD` a second. Game time runs far faster than the cars
 * (an hour passes in a few seconds), so this is set where a sensibly planned town flows
 * at rush hour and a town with too few roads jams.
 */
const TRIP_SPREAD = 150;

export function newCar(path: Int32Array, kind: Car['kind'], look: number): Car {
  return { path, i: 0, t: 0, kind, look, age: 0, v: 0, lane: 0, jn: -1, jf: -1, jt: -1, at: -1, wait: 0, stuck: 0, ghost: 0, acc: 0, gap: Infinity, line: Infinity, ok: true };
}

export interface Traffic {
  cars: Car[];
  load: Uint16Array;
  routes: Map<string, Int32Array | null>;
  routesVer: number;
  tripTime: number;
  trips: number;
  /** Seconds of driving so far: the traffic lights run on it. */
  clock: number;
  /** Cars owed to the roads: trips start at a rate, not to fill a quota. */
  owed: number;
}

export function createTraffic(): Traffic {
  return { cars: [], load: new Uint16Array(NN * 2), routes: new Map(), routesVer: -1, tripTime: 0, trips: 0, clock: 0, owed: 0 };
}

/** Rush hours fill the roads; nights are quiet. */
export function rushFactor(hour: number): number {
  const peak = (h: number, c: number, wdt: number) => Math.exp(-(((h - c) / wdt) ** 2));
  return 0.25 + 0.9 * peak(hour, 8, 1.4) + 0.75 * peak(hour, 18.5, 1.8) + 0.3 * peak(hour, 13, 3);
}

export function stepTraffic(w: World, tr: Traffic, dt: number, hour: number) {
  const net = network(w);
  if (tr.routesVer !== w.ver.roads) { tr.routes.clear(); tr.routesVer = w.ver.roads; }
  // Trips start at a rate that follows population and the time of day; when the roads jam,
  // trips take longer and more cars pile up on them.
  const target = Math.min(MAX_CARS, (w.stats.pop / 9 + w.stats.employed / 20) * rushFactor(hour));
  tr.owed = Math.min(tr.owed + (target / TRIP_SPREAD) * dt, 40);
  // A jam doesn't feed itself for ever: past this many on the road, trips wait to start.
  if (tr.cars.length >= Math.min(MAX_CARS, target + 20)) tr.owed = Math.min(tr.owed, 0);
  let spawn = Math.min(60, Math.floor(tr.owed * 1.6) + 1);
  if (tr.owed >= 1) {
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
    // Not onto a link where a car is still pulling away from the start.
    const busy = new Set<number>();
    for (const c of tr.cars) if (c.t * linkLen(c.path[c.i], c.path[c.i + 1]) < 9) busy.add(c.path[c.i] * NN * 2 + c.path[c.i + 1]);
    while (spawn-- > 0 && tr.owed >= 1 && homes.length) {
      const morning = hour < 12;
      const home = homes[(rand(w) * homes.length) | 0];
      const goShop = rand(w) < (hour > 10 && hour < 17 ? 0.5 : 0.2);
      const pool = goShop && shops.length ? shops : works;
      let a: number | undefined, b: number | undefined;
      let leaving = false;
      const ha = net.access.get(home)!;
      if (pool.length && rand(w) < 0.9) {
        const dest = pool[(rand(w) * pool.length) | 0];
        const da = net.access.get(dest)!;
        [a, b] = morning ? [ha, da] : [da, ha];
      } else if (outside.length) {
        // Some trips leave the city along the expressway.
        const edge = edgeCellOf(w, net.comp, outside[0]);
        if (edge >= 0) { [a, b] = morning ? [ha, edge] : [edge, ha]; leaving = true; }
      }
      if (a === undefined || b === undefined || a === b || net.comp[a] !== net.comp[b]) continue;
      // 고속버스, KTX or a 공공자전거: no car at all.
      const nc = noCarTrip(w, a, b, leaving, rand(w));
      if (nc !== null) { tr.tripTime += nc; tr.trips++; continue; }
      // Near a bus stop or a station at both ends, some people leave the car at home.
      const ride = tryTransit(w, a, b, rand(w), leaving);
      if (ride !== null) { tr.tripTime += ride; tr.trips++; continue; }
      const path = route(w, tr, a, b);
      if (!path || path.length < 2) continue;
      const kindRoll = rand(w);
      // Shop trips are often 배달 오토바이 bringing chicken and 짜장면.
      // Cars, 1톤 trucks and 배달 오토바이. Buses run only on the lines the player opens (render/transit.ts).
      const kind = goShop && kindRoll < 0.3 ? 3 : kindRoll < 0.08 ? 2 : 0;
      const key = path[0] * NN * 2 + path[1];
      if (busy.has(key)) continue;
      busy.add(key);
      const car = newCar(path, kind, rand(w));
      car.lane = laneFor(w, car, 0);
      car.v = wantedStart(w, path);
      tr.cars.push(car);
      tr.owed--;
    }
  }
  // Move.
  for (const c of drive(w, tr, dt)) {
    if (!c.cruised && cruise(w, c)) { c.done = false; tr.cars.push(c); continue; }
    tr.tripTime += c.age;
    tr.trips++;
  }
  tr.load.fill(0);
  for (const c of tr.cars) tr.load[c.t < 0.5 ? c.path[c.i] : c.path[c.i + 1]]++;
  // Congestion field: load relative to capacity, smoothed over time.
  const k = Math.min(1, dt * 0.6);
  for (let i = 0; i < N * N; i++) {
    // The busier of the two layers sets the cell's congestion.
    const r = w.road[i] as 0 | 1 | 2, ra = w.roadAlt[i] as 0 | 1 | 2;
    const lv = Math.max(r ? tr.load[i] / (ROAD_CAPACITY[r as 1 | 2] * parkedSqueeze(w, i)) : 0, ra ? tr.load[i + NN] / ROAD_CAPACITY[ra as 1 | 2] : 0);
    w.traffic[i] += (Math.min(2, lv) - w.traffic[i]) * k;
  }
}

/** Pulling out of a drive: a third of the street's speed. */
function wantedStart(w: World, path: Int32Array): number {
  return (ROAD_SPEED[(roadTypeOf(w, path[0]) || 1) as 1 | 2] * PACE) / 3;
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

/**
 * Arriving where there's nowhere to park: some drivers go round the block
 * a few cells before they give up and find something. Returns whether the
 * car keeps driving.
 */
function cruise(w: World, c: Car): boolean {
  const end = c.path[c.path.length - 1];
  if (end >= NN || c.kind === 1 || c.kind === 3) return false;
  const p = w.parkPress[end] / 100;
  if (!p || rand(w) > p * 0.8) return false;
  const walk = [end];
  let prev = -1, cur = end;
  const steps = 3 + Math.floor(rand(w) * 4);
  for (let k = 0; k < steps; k++) {
    const nb: number[] = [];
    forEachNeighbour(w, cur, (n) => { if (n < NN && n !== prev) nb.push(n); });
    if (!nb.length) break;
    prev = cur;
    cur = nb[Math.floor(rand(w) * nb.length)];
    walk.push(cur);
  }
  if (walk.length < 2) return false;
  c.path = Int32Array.from(walk);
  c.i = 0;
  c.t = 0;
  c.cruised = true;
  c.lane = laneFor(w, c, 0);
  c.jn = -1;
  c.at = -1;
  return true;
}
