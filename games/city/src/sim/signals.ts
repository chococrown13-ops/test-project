import { N, Road } from './defs';
import { forEachNeighbour, NN } from './graph';
import type { World } from './world';

/**
 * Traffic lights. Junctions of three or more roads on the ground get them
 * where an avenue meets, or where four or more streets cross; roundabouts
 * never. The lights take turns by direction: east-west, then north-south
 * (diagonals go with the nearer of the two). Cars wait at the stop line on red
 * and amber.
 */

/** One full turn of the lights, in simulation seconds: green, amber, then the other way. */
export const CYCLE = 14;
const GREEN = 6, AMBER = 1;
export const enum Light { Green = 0, Amber = 1, Red = 2 }

let cache: { ver: string; at: Uint8Array } | null = null;

/** Which ground cells have lights (1), cached until the roads change. */
export function signalCells(w: World): Uint8Array {
  const ver = `${w.ver.roads}:${w.roundabouts.length}`;
  if (cache && cache.ver === ver) return cache.at;
  const at = new Uint8Array(NN);
  const rings = new Set(w.roundabouts.map((r) => r.cell));
  for (let c = 0; c < NN; c++) {
    if (!w.road[c] || rings.has(c)) continue;
    let n = 0, avenue = w.road[c] === Road.Avenue;
    forEachNeighbour(w, c, (m) => { if (m < NN) { n++; if (w.road[m] === Road.Avenue) avenue = true; } });
    if (n >= 4 || (n >= 3 && avenue)) at[c] = 1;
  }
  cache = { ver, at };
  return at;
}

/** The way a step from one cell to the next runs: 0 east-west, 1 north-south. */
export function axisOf(from: number, to: number): 0 | 1 {
  const dx = (to % N) - (from % N), dy = ((to / N) | 0) - ((from / N) | 0);
  if (dy === 0) return 0;
  if (dx === 0) return 1;
  return dx * dy > 0 ? 0 : 1;
}

/** The light shown to traffic running along an axis at a moment. */
export function lightFor(axis: 0 | 1, clock: number): Light {
  const t = ((clock % CYCLE) + CYCLE) % CYCLE, half = GREEN + AMBER;
  const local = axis === 0 ? t : (t + half) % CYCLE;
  return local < GREEN ? Light.Green : local < half ? Light.Amber : Light.Red;
}

/** Whether a car stepping from `node` to `next` must wait at the stop line now. */
export function mustStop(w: World, node: number, next: number, clock: number): boolean {
  if (node >= NN || next >= NN || node === next || !signalCells(w)[next]) return false;
  return lightFor(axisOf(node, next), clock) !== Light.Green;
}
