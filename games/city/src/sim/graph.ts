import { N, Road } from './defs';
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
export function roadTypeOf(w: World, node: number): 0 | 1 | 2 {
  return (node >= NN ? w.roadAlt[node - NN] : w.road[node]) as 0 | 1 | 2;
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

/** Calls fn for every node reachable in one step, with the step's length in cells. */
export function forEachNeighbour(w: World, node: number, fn: (n: number, len: number) => void) {
  if (node < NN) {
    const c = node;
    if (!w.road[c]) return;
    const nb = orth(c, []);
    for (const n of nb) if (w.road[n]) fn(n, 1);
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
