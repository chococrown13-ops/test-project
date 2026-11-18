import { CELL, ELEVATED_Y, Level, N, UNDER_Y } from '../sim/defs';
import { altNeighbours } from '../sim/graph';
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

/**
 * Height of a flyover's deck (its road surface less the asphalt) at any
 * point over or beside it: the full deck height, or on a ramp a straight
 * climb from the ground at the ramp's outer edge to the deck at its inner
 * edge. The road drawing and the cars both read this, so cars sit exactly
 * on the asphalt. Points just off the deck's cells (its pavement spills
 * over) take the nearest deck cell's rule.
 */
export function deckHeightAt(w: World, x: number, z: number): number {
  const elev = (c: number) => c >= 0 && c < NN && w.roadAlt[c] !== 0 && w.altLevel[c] === Level.Elevated;
  const nbs = (c: number) => altNeighbours(w, c).filter(elev);
  // Ramps are two cells: the end cell (step 0) and the one inside it (step 1). The deck climbs
  // steadily over both, from the ground at the end cell's outer edge to full height 20 m on.
  const at = (c: number) => {
    const nb = nbs(c);
    let step: number, from: number;
    if (nb.length === 1) { step = 0; from = nb[0]; }
    else {
      const end = nb.find((n) => nbs(n).length === 1);
      if (end === undefined || nb.length !== 2) return ELEVATED_Y;
      step = 1; from = nb.find((n) => n !== end)!;
    }
    // Inward: toward `from` (the deck side).
    const dx = (from % N) - (c % N), dz = ((from / N) | 0) - ((c / N) | 0);
    const ox = (c % N) * CELL + CELL / 2 - dx * CELL / 2, oz = ((c / N) | 0) * CELL + CELL / 2 - dz * CELL / 2;
    const s = Math.max(0, Math.min(1, ((x - ox) * dx + (z - oz) * dz) / CELL));
    return 0.02 + Math.min(1, (step + s) / 2) * (ELEVATED_Y - 0.02);
  };
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  if (cx >= 0 && cz >= 0 && cx < N && cz < N && elev(cz * N + cx)) return at(cz * N + cx);
  let best = -1, bd = Infinity;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const nx = cx + dx, nz = cz + dz;
    if (nx < 0 || nz < 0 || nx >= N || nz >= N || !elev(nz * N + nx)) continue;
    const px = nx * CELL + CELL / 2, pz = nz * CELL + CELL / 2, d = (px - x) ** 2 + (pz - z) ** 2;
    if (d < bd) { bd = d; best = nz * N + nx; }
  }
  return best >= 0 ? at(best) : ELEVATED_Y;
}

const isElevatedNode = (w: World, node: number) => node >= NN && w.altLevel[node - NN] === Level.Elevated;

/**
 * Height a vehicle drives at between two nodes, at fraction f, at the given
 * point (already offset into its lane). On or onto a flyover it follows the
 * deck itself; elsewhere the two nodes' heights are blended.
 */
export function roadY(w: World, n0: number, n1: number, f: number, x: number, z: number): number {
  if (isElevatedNode(w, n0) || isElevatedNode(w, n1)) return deckHeightAt(w, x, z) + 0.12;
  return nodeY(w, n0) + (nodeY(w, n1) - nodeY(w, n0)) * f;
}
