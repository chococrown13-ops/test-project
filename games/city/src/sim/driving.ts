import { Road, ROAD_SPEED } from './defs';
import { cellOf, NN, roadTypeOf } from './graph';
import { clearOf, conflicts, isJunction, laneCount, linkLen, nodes, stopBack, turnCos, turnOf, type Nodes } from './junctions';
import { axisOf, greenAge, Light, lightFor } from './signals';
import type { Car, Traffic } from './traffic';
import type { World } from './world';

/**
 * How the cars drive. Each car has a real speed and keeps its distance from
 * the one ahead in its lane by the intelligent driver model (it speeds up on
 * an open road, closes up behind a slower car and brakes smoothly for a
 * queue). Before a junction it stops at the stop line unless it may go:
 *
 * - lights: green goes, red stops, amber stops if it still can;
 *   turning cars let the people on the crossing go first as the light turns green;
 * - a turn left on green gives way to oncoming traffic going straight on or right, and
 *   if no gap came, goes as the light turns amber;
 * - no lights: the avenue goes first, otherwise first come first served;
 * - never onto a way across the junction that another car is on;
 * - not into the junction when there's no room to get out the other side.
 *
 * A car that has waited long enough stops waiting for others to give way
 * (so four cars at a crossroads don't stare at each other for ever), and one
 * stuck for very long squeezes past whatever is blocking it.
 */

/** Visual speed-up: cars cover a city in seconds, not real minutes. Everything below is in sped-up seconds. */
export const PACE = 4;
/** Comfortable acceleration and braking, m/s². */
const A = 28, B = 36;
/** Time gap kept to the car ahead, seconds; and the gap left standing, metres. */
const T = 0.28, S0 = 1.8;
const SQ = 2 * Math.sqrt(A * B);
/** Car, bus, truck, scooter: metres long. */
export const LENGTH = [4.3, 10.5, 5.0, 1.8];
/** Seconds after green that turning cars wait for walkers. */
const PED = 1;
/** Seconds at the line before a car stops giving way to cars arriving at the same time. */
const YIELD_WAIT = 6;
/** Seconds without moving before a car squeezes past, and how long that lasts. */
const STUCK = 30, GHOST = 2.5;
const STEP = 0.1;

/** Why cars were held at a line, for tests. */
export const why = { red: 0, amber: 0, ped: 0, occ: 0, yield: 0, box: 0, ghost: 0 };

const NN2 = NN * 2;
const keyOf = (a: number, b: number, lane: number) => (a * NN2 + b) * 2 + lane;

/**
 * The lane a car wants along link i of its path: the inner lane to turn left
 * at the next junction, the outer one to turn right, or -1 going straight on
 * (either lane: it takes the one with more room).
 */
function laneWant(w: World, c: Car, i: number): -1 | 0 | 1 {
  const p = c.path;
  if (i >= p.length - 1 || laneCount(w, p[i], p[i + 1]) === 1) return 0;
  const nd = nodes(w);
  for (let j = i + 1, k = 0; j + 1 < p.length && k < 5; j++, k++) {
    if (!isJunction(nd, p[j])) continue;
    const tn = turnOf(p[j - 1], p[j], p[j + 1]);
    return tn < 0 ? 0 : tn > 0 ? 1 : -1;
  }
  return -1;
}

/** The lane a car takes along link i, when nobody else is about. */
export function laneFor(w: World, c: Car, i: number): 0 | 1 {
  const l = laneWant(w, c, i);
  return l >= 0 ? (l as 0 | 1) : c.look > 0.5 ? 1 : 0;
}

/** Metres free at the start of a lane of a link (to the back of its last car). */
function roomIn(groups: Map<number, Car[]>, a: number, b: number, lane: number): number {
  const g = groups.get(keyOf(a, b, lane));
  if (!g) return Infinity;
  const r = g[g.length - 1];
  return r.t * linkLen(a, b) - LENGTH[r.kind] / 2;
}

/** Onto a new link: the lane for the turn ahead, or going straight on the one with more room (staying put unless it's much better). */
function pickLane(w: World, groups: Map<number, Car[]>, c: Car): 0 | 1 {
  const want = laneWant(w, c, c.i);
  if (want >= 0) return want as 0 | 1;
  const a = c.path[c.i], b = c.path[c.i + 1];
  const here = roomIn(groups, a, b, c.lane), there = roomIn(groups, a, b, 1 - c.lane);
  return there > here + 6 ? (1 - c.lane) as 0 | 1 : c.lane;
}

/** The lane a car will be in along a later link, as far as the cars behind it can tell. */
const laneAhead = (w: World, c: Car, j: number): 0 | 1 => { const l = laneWant(w, c, j); return l >= 0 ? (l as 0 | 1) : c.lane; };

/** The speed a driver wants on a link, m/s (sped up). */
function wanted(w: World, c: Car, a: number, b: number): number {
  const ra = roadTypeOf(w, a) || Road.Street, rb = roadTypeOf(w, b) || Road.Street;
  const r = ra === Road.Avenue && rb === Road.Avenue ? Road.Avenue : Road.Street;
  let v = ROAD_SPEED[r] * PACE * (0.92 + c.look * 0.16);
  if (c.kind === 1 || c.kind === 2) v *= 0.85;
  // Past cars parked along a street, a bit slower.
  if (r === Road.Street && a < NN && w.parked[a] > 0) v *= 0.85;
  return v;
}

/** Move every car on by `dt`, in steps short enough for smooth braking. */
export function drive(w: World, tr: Traffic, dt: number): Car[] {
  const nd = nodes(w);
  const n = Math.max(1, Math.ceil(dt / STEP)), h = dt / n;
  const done: Car[] = [];
  for (let k = 0; k < n; k++) {
    tr.clock += h;
    step(w, tr, nd, h, done);
    if (done.length) tr.cars = tr.cars.filter((c) => !c.done);
  }
  return done;
}

interface Scene { groups: Map<number, Car[]>; near: Map<number, Car[]>; occ: Map<number, Car[]> }

function push(m: Map<number, Car[]>, k: number, c: Car) {
  const l = m.get(k);
  if (l) l.push(c); else m.set(k, [c]);
}

function step(w: World, tr: Traffic, nd: Nodes, h: number, done: Car[]) {
  // Who is in which lane of which link, front first.
  const groups = new Map<number, Car[]>();
  for (const c of tr.cars) push(groups, keyOf(c.path[c.i], c.path[c.i + 1], c.lane), c);
  for (const g of groups.values()) if (g.length > 1) g.sort((p, q) => q.t - p.t);
  // Cars inside each junction, and the first car waiting to go into it from each lane.
  const occ = new Map<number, Car[]>(), near = new Map<number, Car[]>();
  for (const c of tr.cars) if (c.jn >= 0) push(occ, c.jn, c);
  for (const g of groups.values()) {
    const j = g[0].path[g[0].i + 1];
    if (!isJunction(nd, j)) continue;
    const c = g.find((o) => o.jn !== j);
    if (!c) continue;
    const L = linkLen(c.path[c.i], j), d = L - stopBack(w, j, L) - (c.t * L + LENGTH[c.kind] / 2);
    if (d > Math.max(15, c.v * 1.2 + 8)) { c.at = -1; continue; }
    if (c.at < 0) c.at = tr.clock;
    push(near, j, c);
  }
  const sc: Scene = { groups, near, occ };

  // How hard each car accelerates or brakes, from where everyone is now.
  for (const g of groups.values()) {
    for (let q = 0; q < g.length; q++) {
      const c = g[q], p = c.path, i = c.i, a = p[i], b = p[i + 1];
      const L = linkLen(a, b), x = c.t * L, len = LENGTH[c.kind];
      let v0 = wanted(w, c, a, b);
      // Slow down for a turn.
      const nb = i + 2 < p.length ? p[i + 2] : -1;
      if (nb >= 0) {
        const cs = turnCos(a, b, nb);
        if (cs < 0.99) {
          const vt = v0 * (0.32 + 0.6 * Math.max(0, cs));
          v0 = Math.min(v0, Math.sqrt(vt * vt + B * Math.max(0, L - x - 2)));
        }
      }
      // The car ahead: in this lane, or further on along the way this car goes.
      let s = Infinity, vl = 0;
      if (c.ghost <= 0) {
        c.by = null;
        if (q > 0) { const l = g[q - 1]; s = (l.t - c.t) * L - (LENGTH[l.kind] + len) / 2; vl = l.v; c.by = l; }
        else {
          let dist = L - x;
          for (let j = i + 1; j < p.length - 1 && dist < 90; j++) {
            const Lj = linkLen(p[j], p[j + 1]);
            const g2 = groups.get(keyOf(p[j], p[j + 1], laneAhead(w, c, j)));
            if (g2) { const l = g2[g2.length - 1]; s = dist + l.t * Lj - (LENGTH[l.kind] + len) / 2; vl = l.v; c.by = l; break; }
            dist += Lj;
          }
        }
      }
      // The stop line, if this car may not go into the junction ahead.
      c.ok = true;
      if (c.ghost <= 0 && c.jn !== b && isJunction(nd, b)) {
        const d = L - stopBack(w, b, L) - (x + len / 2);
        if (d < 45) {
          c.ok = mayEnter(w, tr, nd, sc, c, d);
          // A standing obstacle at the line: stop just short of it.
          if (!c.ok && d + S0 * 0.8 < s) { s = d + S0 * 0.8; vl = 0; c.by = c.held ?? null; }
        }
        c.line = d;
      } else c.line = Infinity;
      c.gap = s;
      // Intelligent driver model.
      let acc = A * (1 - (c.v / v0) ** 4);
      if (s < Infinity) {
        const want = S0 + Math.max(0, c.v * T + (c.v * (c.v - vl)) / SQ);
        acc -= A * (want / Math.max(0.1, s)) ** 2;
      }
      c.acc = Math.max(-B * 4, acc);
    }
  }

  // Move.
  for (const c of tr.cars) {
    const p = c.path, last = p.length - 1, len = LENGTH[c.kind];
    let a = p[c.i], b = p[c.i + 1], L = linkLen(a, b);
    const v1 = Math.max(0, c.v + c.acc * h);
    let dx = ((c.v + v1) / 2) * h;
    c.v = v1;
    // Never into the car ahead.
    if (c.ghost <= 0 && c.gap < Infinity && dx > c.gap - 0.2) { dx = Math.max(0, c.gap - 0.2); c.v = Math.min(c.v, dx / h); }
    // Over the stop line: into the junction, or held at the line.
    if (c.line < Infinity && dx > c.line) {
      const to = c.i + 2 <= last ? p[c.i + 2] : -1;
      // Someone else may have gone in during this same step.
      const os = c.ok ? sc.occ.get(b) : undefined;
      if (os) for (const o of os) if (o !== c && conflicts(nd, b, a, to, o.jf, o.jt)) { c.ok = false; break; }
      if (c.ok) { c.jn = b; c.jf = a; c.jt = to; c.at = -1; c.wait = 0; push(sc.occ, b, c); }
      else { dx = Math.max(0, c.line); c.v = 0; }
    }
    if (c.line === Infinity) c.wait = 0;
    else if (c.line < 8 && c.v < 1) c.wait += h;
    let x = c.t * L + dx;
    let finished = false;
    while (x >= L) {
      if (c.i + 1 >= last) { finished = true; break; }
      x -= L;
      c.i++;
      a = p[c.i]; b = p[c.i + 1]; L = linkLen(a, b);
      c.lane = pickLane(w, groups, c);
    }
    c.t = finished ? 1 : x / L;
    c.age += h;
    // Out of the junction once clear of its middle.
    if (c.jn >= 0) {
      if (p[c.i] === c.jn) { if (x - len / 2 > clearOf(w, c.jn)) c.jn = -1; }
      else if (p[c.i + 1] !== c.jn) c.jn = -1;
    }
    if (c.v < 0.5) c.stuck += h; else c.stuck = 0;
    if (c.ghost > 0) c.ghost -= h;
    else if (c.stuck > STUCK) { c.ghost = GHOST; c.stuck = 0; why.ghost++;  }
    if (finished) { c.done = true; done.push(c); }
  }
}

/** Whether a car `d` metres short of the stop line may go into the junction now. */
function mayEnter(w: World, tr: Traffic, nd: Nodes, sc: Scene, c: Car, d: number): boolean {
  const p = c.path, i = c.i, a = p[i], j = p[i + 1], to = i + 2 < p.length ? p[i + 2] : -1;
  c.held = null;
  c.why = '';
  if (nd.sig[j]) {
    const ax = axisOf(cellOf(a), j), light = lightFor(ax, tr.clock);
    // Already over the line (a trip that starts there): carry on.
    if (light === Light.Red) { why.red++; c.why = 'red'; return d < 0; }
    // Amber: stop if it still can.
    if (light === Light.Amber) {
      // A left turn that waited at the line all through the green for a gap goes as the light changes.
      const sneak = c.wait > 1 && d < 1.5 && turnOf(a, j, to) < 0;
      if (!sneak) { why.amber++; c.why = 'amber'; return d < (c.v * c.v) / (2 * B); }
    }
    if (light === Light.Green && to >= 0 && axisOf(j, cellOf(to)) !== ax && greenAge(ax, tr.clock) < PED && c.wait < YIELD_WAIT) { why.ped++; c.why = 'ped'; return false; }
  }
  // Someone already on a way that crosses this one.
  const os = sc.occ.get(j);
  if (os) for (const o of os) if (o !== c && conflicts(nd, j, a, to, o.jf, o.jt)) { why.occ++; c.why = 'occ'; c.held = o; return false; }
  // Someone arriving at the same time who goes first.
  if (c.wait < YIELD_WAIT) {
    const ns = sc.near.get(j);
    if (ns) for (const o of ns) {
      const ob = o.path[o.i];
      if (o === c || ob === a || o.wait >= YIELD_WAIT || o.ghost > 0) continue;
      if (nd.sig[j] && lightFor(axisOf(cellOf(ob), j), tr.clock) !== Light.Green) continue;
      const ot = o.i + 2 < o.path.length ? o.path[o.i + 2] : -1;
      if (!conflicts(nd, j, a, to, ob, ot)) continue;
      if (goesFirst(w, nd, j, o, ob, ot, c, a, to)) { why.yield++; c.why = 'yield'; c.held = o; return false; }
    }
  }
  // No room on the other side: don't block the junction. Where the queue beyond stands still,
  // will this car fit behind it once the cars moving up to it have stopped too?
  if (to >= 0 && !nd.ring[j]) {
    let room = exitRoom(w, sc, c);
    if (room < Infinity && os) for (const o of os) if (o.jt === to && o.path[o.i] !== j) room -= LENGTH[o.kind] + S0;
    if (room < LENGTH[c.kind] + 1) { why.box++; c.why = 'box'; return false; }
  }
  return true;
}

/** Metres free past the junction ahead (behind the standing queue there, less the cars moving up to it). */
function exitRoom(w: World, sc: Scene, c: Car): number {
  const p = c.path, j = p[c.i + 1];
  let dist = 0, moving = 0;
  for (let k = c.i + 1; k + 1 < p.length && dist < 70; k++) {
    const a = p[k], b = p[k + 1], L = linkLen(a, b);
    const g = sc.groups.get(keyOf(a, b, laneAhead(w, c, k)));
    if (g) for (let q = g.length - 1; q >= 0; q--) {
      const o = g[q];
      if (o.v < 2) { c.held = o; return dist + o.t * L - LENGTH[o.kind] / 2 - clearOf(w, j) - moving; }
      moving += LENGTH[o.kind] + S0;
    }
    dist += L;
  }
  return Infinity;
}

/** Whether car `o` has the right of way over car `c` at junction `j`. */
function goesFirst(w: World, nd: Nodes, j: number, o: Car, ob: number, ot: number, c: Car, a: number, to: number): boolean {
  if (nd.sig[j]) {
    // On green, turning left gives way.
    const lo = turnOf(ob, j, ot) < 0, lc = turnOf(a, j, to) < 0;
    if (lo !== lc) return lc;
  } else {
    // No lights: the avenue first.
    const ao = roadTypeOf(w, ob) === Road.Avenue, ac = roadTypeOf(w, a) === Road.Avenue;
    if (ao !== ac) return ao;
  }
  const ta = c.at < 0 ? Infinity : c.at, oa = o.at < 0 ? Infinity : o.at;
  if (oa !== ta) return oa < ta;
  return o.look < c.look;
}
