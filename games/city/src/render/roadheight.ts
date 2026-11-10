import { CELL, ELEVATED_Y, Level, N, UNDER_Y } from '../sim/defs';
import { curveInfo } from '../sim/curves';
import { isRamp, NN } from '../sim/graph';
import type { World } from '../sim/world';

let rampVer = -1;
let ramps = new Uint8Array(NN);

/** Ramp flags per cell, cached per road version (vehicles ask every frame). */
function rampAt(w: World, c: number): boolean {
  if (rampVer !== w.ver.roads) {
    rampVer = w.ver.roads;
    ramps = new Uint8Array(NN);
    for (let i = 0; i < NN; i++) if (w.roadAlt[i] && isRamp(w, i)) ramps[i] = 1;
  }
  return ramps[c] === 1;
}

/** Height a vehicle drives at on a road node: decks up high, tunnels out of sight below. */
export function nodeY(w: World, node: number): number {
  if (node < NN) return 0.12;
  const c = node - NN;
  const ramp = rampAt(w, c);
  if (w.altLevel[c] === Level.Elevated) return ramp ? ELEVATED_Y / 2 : ELEVATED_Y + 0.12;
  return ramp ? 0.12 : UNDER_Y;
}

/** Where traffic passes through a node: the cell centre, or the nearest point of a curve laid through it. */
export function nodeCentre(node: number, w?: World) {
  const c = node >= NN ? node - NN : node;
  if (w && node < NN && w.curves.length) {
    const ci = curveInfo(w);
    if (ci.owned[c]) return { x: ci.px[c], z: ci.pz[c] };
  }
  return { x: (c % N) * CELL + CELL / 2, z: Math.floor(c / N) * CELL + CELL / 2 };
}
