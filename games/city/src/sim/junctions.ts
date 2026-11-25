import { CELL, N, Road } from './defs';
import { HALF_WIDTH, KERB_W } from './curves';
import { cellOf, forEachNeighbour, NN, roadTypeOf } from './graph';
import { signalCells } from './signals';
import type { World } from './world';

/**
 * What the drivers know about the road ahead: which nodes are junctions
 * (three or more roads meet), which have lights or are 회전교차로, how long
 * each link is, how many lanes it has, and which turns cross each other's
 * path inside a junction.
 */

export interface Nodes {
  ver: string;
  /** Roads meeting at each node (ground 0..NN-1, the raised layer NN..2NN-1). */
  deg: Uint8Array;
  /** 1 where the node has lights. */
  sig: Uint8Array;
  /** 1 where the node is a roundabout. */
  ring: Uint8Array;
}

let cache: Nodes | null = null;

export function nodes(w: World): Nodes {
  const ver = `${w.ver.roads}:${w.roundabouts.length}`;
  if (cache && cache.ver === ver) return cache;
  const deg = new Uint8Array(NN * 2), sig = new Uint8Array(NN * 2), ring = new Uint8Array(NN * 2);
  for (let n = 0; n < NN * 2; n++) {
    if (!roadTypeOf(w, n)) continue;
    let k = 0;
    forEachNeighbour(w, n, () => { k++; });
    deg[n] = Math.min(255, k);
  }
  sig.set(signalCells(w));
  for (const r of w.roundabouts) ring[r.cell] = 1;
  cache = { ver, deg, sig, ring };
  return cache;
}

export const isJunction = (nd: Nodes, n: number) => nd.deg[n] >= 3 || nd.ring[n] === 1;

const cx = (n: number) => cellOf(n) % N;
const cy = (n: number) => (cellOf(n) / N) | 0;

/** Length of the link between two neighbouring nodes, metres (centre to centre). */
export function linkLen(a: number, b: number): number {
  const dx = cx(b) - cx(a), dy = cy(b) - cy(a);
  return dx && dy ? CELL * Math.SQRT2 : CELL;
}

/** Lanes each way on a link: two along an avenue (a little narrower past parked cars), one on a street. */
export function laneCount(w: World, a: number, b: number): 1 | 2 {
  return roadTypeOf(w, a) === Road.Avenue && roadTypeOf(w, b) === Road.Avenue ? 2 : 1;
}

/** Which way a car turns at `j` going from `a` to `b`: 1 right, -1 left, 0 straight on (or no turn to make). */
export function turnOf(a: number, j: number, b: number): -1 | 0 | 1 {
  if (b < 0) return 0;
  const d1x = cx(j) - cx(a), d1z = cy(j) - cy(a), d2x = cx(b) - cx(j), d2z = cy(b) - cy(j);
  // Right of travel (dx, dz) on screen (z south) is (-dz, dx).
  const cr = d1x * d2z - d1z * d2x;
  return cr > 0 ? 1 : cr < 0 ? -1 : 0;
}

/** Cosine of the angle a car turns through at `j` (1 straight on, 0 a right angle). */
export function turnCos(a: number, j: number, b: number): number {
  if (b < 0) return 1;
  const d1x = cx(j) - cx(a), d1z = cy(j) - cy(a), d2x = cx(b) - cx(j), d2z = cy(b) - cy(j);
  const l = Math.hypot(d1x, d1z) * Math.hypot(d2x, d2z);
  return l ? (d1x * d2x + d1z * d2z) / l : 1;
}

/** Where the stop line is before junction `j`: metres back from its middle. */
export function stopBack(w: World, j: number, len: number): number {
  const t = (roadTypeOf(w, j) === Road.Avenue ? Road.Avenue : Road.Street) as 1 | 2;
  return Math.min(HALF_WIDTH[t] + KERB_W[t] + 1.2, len - 3);
}

/** How far from a junction's middle a car has to get before it has left it. */
export function clearOf(w: World, j: number): number {
  return roadTypeOf(w, j) === Road.Avenue ? 6 : 4.5;
}

const TAU = Math.PI * 2;
const wrap = (a: number) => ((a % TAU) + TAU) % TAU;

/** Angle round junction `j` where a car coming from `a` enters it (keeping right). */
function entryAngle(a: number, j: number): number {
  const dx = cx(j) - cx(a), dz = cy(j) - cy(a), l = Math.hypot(dx, dz) || 1;
  // Back along the way it came, then a little to the right of travel.
  return Math.atan2(-dz / l + (dx / l) * 0.35, -dx / l - (dz / l) * 0.35);
}

/** Angle round junction `j` where a car leaves it toward `b`. */
function exitAngle(j: number, b: number): number {
  const dx = cx(b) - cx(j), dz = cy(b) - cy(j), l = Math.hypot(dx, dz) || 1;
  return Math.atan2(dz / l + (dx / l) * 0.35, dx / l - (dz / l) * 0.35);
}

/**
 * Whether two ways through junction `j` cross or merge, so that only one car
 * may be on them at once. Cars from the same approach just follow each other.
 * Each way is a chord from where it enters the junction's edge to where it
 * leaves; two chords cross when their ends interleave round the edge.
 */
export function conflicts(nd: Nodes, j: number, af: number, at: number, bf: number, bt: number): boolean {
  if (af === bf) return false;
  if (at >= 0 && at === bt) return true;
  if (nd.ring[j]) return true;
  // A ramp onto the raised road (same cell, other layer) has no direction: keep it simple and let it merge.
  if (cellOf(af) === cellOf(j) || cellOf(bf) === cellOf(j)) return at === bt;
  const p1 = entryAngle(af, j), q1 = at >= 0 ? exitAngle(j, at) : entryAngle(af, j) + Math.PI;
  const p2 = entryAngle(bf, j), q2 = bt >= 0 ? exitAngle(j, bt) : entryAngle(bf, j) + Math.PI;
  const span = wrap(q1 - p1);
  const inA = (x: number) => wrap(x - p1) < span;
  return inA(p2) !== inA(q2);
}
