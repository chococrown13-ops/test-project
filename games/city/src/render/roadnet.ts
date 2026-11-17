import { CELL, Ground, N, Road } from '../sim/defs';
import { curveInfo, curvePath, HALF_WIDTH, KERB_W } from '../sim/curves';
import { forEachNeighbour, NN } from '../sim/graph';
import type { World } from '../sim/world';
import { nearestOnPath, pathAt, pathLength, splitPath, type Path, type V } from '../../../shared/roads/geom';
import { type Kind, Network, type RoadType } from '../../../shared/roads/network';

/**
 * The city's ground roads as one planar road graph, so every road (grid
 * runs, diagonals and curves alike) is drawn by the same widen-trim-fill
 * geometry and every junction gets one clean polygon. The simulation still
 * runs on cells; this is only how the asphalt is laid out.
 *
 * Nodes sit at the centre of every cell where roads meet, turn, change type
 * or end, and where a curve crosses or is joined (there the node moves onto
 * the curve itself). Edges are the straight runs between nodes, and the
 * curves, split at each place something joins them.
 */

export const CITY_TYPES: Record<Kind, RoadType> = {
  street: { half: HALF_WIDTH[Road.Street], kerb: KERB_W[Road.Street], lanes: 1 },
  avenue: { half: HALF_WIDTH[Road.Avenue], kerb: KERB_W[Road.Avenue], lanes: 2 },
};
const KIND: Record<number, Kind> = { [Road.Street]: 'street', [Road.Avenue]: 'avenue' };

const centre = (i: number): V => ({ x: (i % N) * CELL + CELL / 2, z: ((i / N) | 0) * CELL + CELL / 2 });

export function buildCityNetwork(w: World): Network {
  const net = new Network(CITY_TYPES);
  const info = curveInfo(w);
  const own = info.owned;
  // Ground links of a cell (no ramps), and links that belong to a curve's own chain (the curve edge draws those).
  const links = (i: number) => { const out: number[] = []; forEachNeighbour(w, i, (n) => { if (n < NN) out.push(n); }); return out; };
  const chain = new Set<string>();
  const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  for (const c of w.curves) for (let k = 1; k < c.cells.length; k++) chain.add(key(c.cells[k - 1], c.cells[k]));
  const gridLinks = (i: number) => links(i).filter((n) => !chain.has(key(i, n)));

  // Where a cell's node stands (moved onto a curve where the curve passes through or is joined).
  const pos = new Map<number, V>();
  const nodeOf = new Map<number, number>();
  const node = (cell: number) => {
    let id = nodeOf.get(cell);
    if (id === undefined) { id = net.node(pos.get(cell) ?? centre(cell)).id; nodeOf.set(cell, id); }
    return id;
  };

  // Curves: split at every cell where another road crosses or joins.
  for (const c of w.curves) {
    const { path } = curvePath(c);
    const L = pathLength(path);
    const inChain = new Set(c.cells);
    const taps: { t: number; cell: number }[] = [];
    for (let k = 1; k < c.cells.length - 1; k++) {
      const cell = c.cells[k];
      const side = gridLinks(cell).some((n) => !inChain.has(n));
      if (!own[cell] || side) {
        const t = nearestOnPath(path, centre(cell)).t;
        if (t > 1 && t < L - 1) { taps.push({ t, cell }); pos.set(cell, pathAt(path, t).p); }
      }
    }
    taps.sort((a, b) => a.t - b.t);
    pos.set(c.cells[0], { x: c.ax, z: c.az });
    pos.set(c.cells[c.cells.length - 1], { x: c.bx, z: c.bz });
    const stops = [{ t: 0, cell: c.cells[0] }, ...taps, { t: L, cell: c.cells[c.cells.length - 1] }];
    const kind = KIND[c.t] ?? 'street';
    let rest: Path = path, done = 0;
    for (let k = 1; k < stops.length; k++) {
      if (stops[k].cell === stops[k - 1].cell) continue;
      const [piece, after] = splitPath(rest, stops[k].t - done);
      rest = after; done = stops[k].t;
      if (pathLength(piece) < 0.5) continue;
      net.addEdge(node(stops[k - 1].cell), node(stops[k].cell), piece, kind);
    }
  }

  // Grid runs. A cell is a node unless it is a plain straight stretch: two links, opposite, same road type.
  const isNode = (i: number) => {
    if (own[i]) return pos.has(i);
    if (pos.has(i)) return true;
    // Cells on the west edge lead off the map: always a node, so that road can leave.
    if (i % N === 0) return true;
    const l = gridLinks(i);
    if (l.length !== 2) return true;
    const dx1 = (l[0] % N) - (i % N), dy1 = ((l[0] / N) | 0) - ((i / N) | 0);
    const dx2 = (l[1] % N) - (i % N), dy2 = ((l[1] / N) | 0) - ((i / N) | 0);
    if (dx1 !== -dx2 || dy1 !== -dy2) return true;
    if (w.road[l[0]] !== w.road[i] || w.road[l[1]] !== w.road[i]) return true;
    // A bridge starts and ends at a node, so its deck lines up with the run.
    return (w.ground[l[0]] === Ground.Water) !== (w.ground[i] === Ground.Water) || (w.ground[l[1]] === Ground.Water) !== (w.ground[i] === Ground.Water);
  };
  const seen = new Set<string>();
  for (let i = 0; i < N * N; i++) {
    if (!w.road[i] || !isNode(i)) continue;
    for (const first of gridLinks(i)) {
      if (seen.has(key(i, first))) continue;
      let prev = i, cur = first;
      seen.add(key(prev, cur));
      for (let guard = 0; guard < N * 2 && !isNode(cur); guard++) {
        const next = gridLinks(cur).find((n) => n !== prev);
        if (next === undefined) break;
        prev = cur; cur = next;
        seen.add(key(prev, cur));
      }
      const a = node(i), b = node(cur);
      if (a === b) continue;
      const kind = KIND[Math.min(w.road[i], w.road[first]) as 1 | 2] ?? 'street';
      net.addEdge(a, b, [{ kind: 'line', a: net.nodes.get(a)!.p, b: net.nodes.get(b)!.p }], kind);
    }
    // Roads running off the west edge of the map lead on toward the next town.
    if (i % N === 0 && !own[i]) {
      const p = centre(i), off = net.node({ x: -CELL * 1.5, z: p.z });
      net.addEdge(node(i), off.id, [{ kind: 'line', a: net.nodes.get(node(i))!.p, b: off.p }], KIND[w.road[i]] ?? 'street');
    }
  }
  return net;
}
