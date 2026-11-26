import { N, Road } from './defs';
import { curveLinkOk } from './curves';
import type { World } from './world';

/**
 * The road network as a graph. A node is a cell on one of two layers: the
 * ground road (node = cell) or the second road in that cell, over or under it
 * (node = cell + NN). Ground roads meet their orthogonal neighbours and any
 * diagonal they were built with. A second-layer road only meets its own kind,
 * and the ground network at its two ramps, so an elevated road or a tunnel
 * can cross a street without an intersection.
 */
export const NN = N * N;
export const SQRT2 = Math.SQRT2;

/** Diagonal directions: dx, dy and the bit for each in `World.diag`. */
export const DIAG = [[1, -1, 1], [1, 1, 2], [-1, 1, 4], [-1, -1, 8]] as const;
export const oppositeDiag = (bit: number) => (bit === 1 ? 4 : bit === 2 ? 8 : bit === 4 ? 1 : 2);

export const cellOf = (node: number) => (node >= NN ? node - NN : node);
export const isAlt = (node: number) => node >= NN;

/** Road type of a node: 0 none, 1 street, 2 avenue. */
export function roadTypeOf(w: World, node: number): 0 | 1 | 2 | 3 {
  return (node >= NN ? w.roadAlt[node - NN] : w.road[node]) as 0 | 1 | 2 | 3;
}

function orth(c: number, out: number[]) {
  out.length = 0;
  const x = c % N, y = (c / N) | 0;
  if (x > 0) out.push(c - 1);
  if (x < N - 1) out.push(c + 1);
  if (y > 0) out.push(c - N);
  if (y < N - 1) out.push(c + N);
  return out;
}

const tmp: number[] = [];

/** Second-layer neighbours of the same level. */
export function altNeighbours(w: World, c: number): number[] {
  const out: number[] = [];
  if (!w.roadAlt[c]) return out;
  for (const n of orth(c, tmp)) if (w.roadAlt[n] && w.altLevel[n] === w.altLevel[c]) out.push(n);
  return out;
}

/**
 * A ramp is a second-layer cell with exactly one neighbour of its kind; it
 * opens onto the ground road straight ahead, on the far side from that
 * neighbour. Returns that ground cell, or -1.
 */
export function rampExit(w: World, c: number): number {
  const nb = altNeighbours(w, c);
  if (nb.length !== 1) return -1;
  const m = nb[0];
  const dx = (c % N) - (m % N), dy = ((c / N) | 0) - ((m / N) | 0);
  const x = (c % N) + dx, y = ((c / N) | 0) + dy;
  if (x < 0 || y < 0 || x >= N || y >= N) return -1;
  const e = y * N + x;
  return w.road[e] !== Road.None ? e : -1;
}

export const isRamp = (w: World, c: number) => w.roadAlt[c] !== Road.None && altNeighbours(w, c).length <= 1;

/** One-way codes: the step each allows (1 east, 2 south, 3 west, 4 north). */
export const ONEWAY_STEP: [number, number][] = [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]];
const axisOfCode = (o: number) => (o === 1 || o === 3 ? 0 : 1);

/**
 * Two one-way roads laid side by side (a 왕복 4차선 made of a pair of carriageways): no link
 * across between them, except where a road carries on beyond the pair (a real crossing).
 */
function pairGap(w: World, a: number, b: number): boolean {
  const oa = w.oneway[a], ob = w.oneway[b];
  if (!oa || !ob || axisOfCode(oa) !== axisOfCode(ob)) return false;
  const dx = (b % N) - (a % N), dy = ((b / N) | 0) - ((a / N) | 0);
  // The link has to run across the pair's axis.
  if ((axisOfCode(oa) === 0) !== (dx === 0)) return false;
  const beyondB = b + dx + dy * N, beforeA = a - dx - dy * N;
  const ok = (c: number) => c >= 0 && c < NN && Math.abs((c % N) - (a % N)) <= 2 && !!w.road[c] && !w.oneway[c];
  return !ok(beyondB) && !ok(beforeA);
}

/** A 고속도로 joins ordinary roads only at a 나들목; highways meet each other freely (a 분기점). */
export function highwayLinkOk(w: World, a: number, b: number): boolean {
  const ha = w.road[a] === 3, hb = w.road[b] === 3;
  if (ha === hb) return true;
  return ha ? (w.hwy[a] & 1) !== 0 : (w.hwy[b] & 1) !== 0;
}

/** Whether traffic may drive from ground cell a to its neighbour b, given the one-way roads. */
export function driveOk(w: World, a: number, b: number): boolean {
  if (a >= NN || b >= NN) return true;
  const dx = Math.sign((b % N) - (a % N)), dy = Math.sign(((b / N) | 0) - ((a / N) | 0));
  if (dx && dy) return true;
  for (const c of [a, b]) {
    const o = w.oneway[c];
    if (!o) continue;
    const [ox, oy] = ONEWAY_STEP[o];
    // Along the one-way axis only forwards; across it (a side street) is fine.
    if (ox !== 0 && dx !== 0 && dx !== ox) return false;
    if (oy !== 0 && dy !== 0 && dy !== oy) return false;
  }
  return true;
}

/** Like forEachNeighbour, but only the steps a car may drive (one-way roads). */
export function forEachDriveStep(w: World, node: number, fn: (n: number, len: number) => void) {
  forEachNeighbour(w, node, (n, len) => { if (driveOk(w, node, n)) fn(n, len); });
}

/** Calls fn for every node reachable in one step, with the step's length in cells. */
export function forEachNeighbour(w: World, node: number, fn: (n: number, len: number) => void) {
  if (node < NN) {
    const c = node;
    if (!w.road[c]) return;
    const nb = orth(c, []);
    // Beside a curve only the links it really makes count (no shortcuts across the verge).
    for (const n of nb) if (w.road[n] && curveLinkOk(w, c, n) && !pairGap(w, c, n) && highwayLinkOk(w, c, n)) fn(n, 1);
    const d = w.diag[c];
    if (d) {
      const x = c % N, y = (c / N) | 0;
      for (const [dx, dy, bit] of DIAG) {
        if (!(d & bit)) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < N && ny < N && w.road[ny * N + nx]) fn(ny * N + nx, SQRT2);
      }
    }
    // Ramps of second-layer roads that open onto this cell.
    for (const n of nb) if (w.roadAlt[n] && rampExit(w, n) === c) fn(n + NN, 1);
    return;
  }
  const c = node - NN;
  if (!w.roadAlt[c]) return;
  for (const m of altNeighbours(w, c)) fn(m + NN, 1);
  const e = rampExit(w, c);
  if (e >= 0) fn(e, 1);
}

/** Whether a node exists (has a road on its layer). */
export const nodeExists = (w: World, node: number) => roadTypeOf(w, node) !== 0;
