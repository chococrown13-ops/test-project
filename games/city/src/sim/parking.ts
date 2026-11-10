import { Ground, KINDS, N, Road, Zone } from './defs';
import { curveInfo } from './curves';
import { NN, forEachNeighbour } from './graph';
import { network } from './network';
import { bh, bw, type Building, type World } from './world';

/**
 * Parking. Every lived-in or busy building wants somewhere to leave its cars.
 * They go first to the kerb of the streets around it, free and close; the
 * overflow to a 공영주차장 or 주차타워 nearby; whatever is left circles the
 * block looking for a space. Parked cars narrow the road (less capacity), cars still looking add
 * to the traffic, and a lot that can't park its people is worth less.
 */

/** Kerb spaces on one straight road cell, two each side. */
export const CURB_SPACES = 4;
/** Spaces in each parking facility. */
export const LOT_SPACES: Partial<Record<string, number>> = { parking: 40, parktower: 160 };

/** Cars a building wants to park on an ordinary day. */
export function parkingDemand(w: World, b: Building): number {
  const d = KINDS[b.kind];
  if (!d.zone || b.abandoned || b.occ <= 0) return 0;
  let per = d.zone === Zone.R ? 0.35 : d.zone === Zone.C ? 0.5 : 0.3;
  // Apartment complexes and office towers park underground.
  if (d.level === 3) per *= 0.2;
  // Near a station or a bus stop, fewer people bring a car.
  const t = w.transit[b.y * N + b.x];
  if (t === 2) per *= 0.6; else if (t === 1) per *= 0.85;
  return Math.round(b.occ * per);
}

/** Whether cars may park along this ground road cell, and how many. */
export function curbCapacity(w: World, i: number): number {
  const t = w.road[i];
  if (!t || w.ground[i] !== Ground.Land || w.diag[i] || w.roadAlt[i]) return 0;
  if (t === Road.Avenue && w.noAvenueParking) return 0;
  // No kerb parking anywhere along a curve: the cars would sit square to a bending road.
  if (curveInfo(w).chain[i]) return 0;
  const x = i % N, y = (i / N) | 0;
  const r = (dx: number, dy: number) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < N && ny < N && !!w.road[ny * N + nx]; };
  const e = r(1, 0), wv = r(-1, 0), n = r(0, -1), s = r(0, 1);
  // Never in a junction or a corner: only along a straight run (or a dead end).
  if (+e + +wv + +n + +s >= 3) return 0;
  if ((e || wv) && (n || s)) return 0;
  return CURB_SPACES;
}

/** Share every building's cars between nearby lots and kerbs, nearest first. */
export function updateParking(w: World) {
  const net = network(w);
  const free = new Int16Array(NN);
  for (let i = 0; i < NN; i++) free[i] = curbCapacity(w, i);
  const cap = Int16Array.from(free);
  const lots: { b: Building; free: number; cx: number; cy: number }[] = [];
  w.buildings.forEach((b) => {
    const sp = LOT_SPACES[b.kind];
    if (sp && net.access.has(b.id)) { b.occ = 0; lots.push({ b, free: sp, cx: b.x + 0.5, cy: b.y + 0.5 }); }
  });
  w.parkPress.fill(0);
  let demand = 0, unmet = 0;
  const seen = new Int32Array(NN).fill(-1);
  const left: { b: Building; want: number; d: number; a: number | undefined }[] = [];
  // First the kerbs: free and right outside, spreading out along the roads from the front door.
  w.buildings.forEach((b) => {
    const want = parkingDemand(w, b);
    if (!want) return;
    demand += want;
    let d = want;
    const a = net.access.get(b.id);
    if (a !== undefined) {
      let q = [a], depth = 0;
      seen[a] = b.id;
      while (d && q.length && depth <= 3) {
        const next: number[] = [];
        for (const c of q) {
          if (free[c] > 0) { const k = Math.min(d, free[c]); free[c] -= k; d -= k; if (!d) break; }
          forEachNeighbour(w, c, (m) => { if (m < NN && seen[m] !== b.id) { seen[m] = b.id; next.push(m); } });
        }
        q = next; depth++;
      }
    }
    left.push({ b, want, d, a });
  });
  // Then the overflow goes to a lot within a few minutes' walk.
  for (const e of left) {
    const b = e.b;
    if (e.d && e.a !== undefined) {
      const cx = b.x + bw(b) / 2, cy = b.y + bh(b) / 2;
      for (const l of lots) {
        if (!e.d) break;
        if (l.free <= 0 || Math.max(Math.abs(l.cx - cx), Math.abs(l.cy - cy)) > 5) continue;
        const k = Math.min(e.d, l.free);
        l.free -= k; l.b.occ += k; e.d -= k;
      }
    }
    unmet += e.d;
    const p = Math.round((e.d / e.want) * 100);
    for (let y = b.y; y < b.y + bh(b); y++) for (let x = b.x; x < b.x + bw(b); x++) w.parkPress[y * N + x] = p;
    if (e.a !== undefined) w.parkPress[e.a] = Math.max(w.parkPress[e.a], p);
  }
  for (let i = 0; i < NN; i++) w.parked[i] = cap[i] - free[i];
  w.stats.parkDemand = demand;
  w.stats.parkUnmet = unmet;
  w.stats.parkCurb = cap.reduce((s, v) => s + v, 0);
}

/** Share of a road cell's capacity left after the parked cars: a full kerb takes a third. */
export const parkedSqueeze = (w: World, node: number) => (node < NN && w.parked[node] ? 1 - 0.33 * (w.parked[node] / CURB_SPACES) : 1);
