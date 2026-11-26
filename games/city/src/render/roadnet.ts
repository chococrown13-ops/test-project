import { CELL, Ground, Level, N, Road } from '../sim/defs';
import { curveInfo, curvePath, HALF_WIDTH, KERB_W } from '../sim/curves';
import { altNeighbours, forEachNeighbour, NN, rampExit } from '../sim/graph';
import { deckHeightAt } from './roadheight';
import { ringOf } from '../sim/roundabout';
import type { World } from '../sim/world';
import { nearestOnPath, pathAt, pathCrossings, pathLength, samplePath, splitPath, type Path, type Seg, type V } from '../../../shared/roads/geom';
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
  highway: { half: HALF_WIDTH[Road.Highway], kerb: KERB_W[Road.Highway], lanes: 2 },
};
const KIND: Record<number, Kind> = { [Road.Street]: 'street', [Road.Avenue]: 'avenue', [Road.Highway]: 'highway' };

const centre = (i: number): V => ({ x: (i % N) * CELL + CELL / 2, z: ((i / N) | 0) * CELL + CELL / 2 });

/** A piece of curve made to start and end exactly on its junction nodes (they may sit a little off it). */
function snapEnds(p: Path, a: V, b: V): Path {
  const out = p.slice();
  const fix = (s: Seg, at: 'a' | 'b', q: V): Seg | null => (s.kind === 'line' ? { ...s, [at]: q } : null);
  const s0 = pathAt(out, 0).p, s1 = pathAt(out, pathLength(out)).p;
  if (Math.hypot(s0.x - a.x, s0.z - a.z) > 0.05) {
    const f = fix(out[0], 'a', a);
    if (f && pathLength([f]) > 1) out[0] = f; else out.unshift({ kind: 'line', a, b: s0 });
  }
  if (Math.hypot(s1.x - b.x, s1.z - b.z) > 0.05) {
    const f = fix(out[out.length - 1], 'b', b);
    if (f && pathLength([f]) > 1) out[out.length - 1] = f; else out.push({ kind: 'line', a: s1, b });
  }
  return out;
}

export function buildCityNetwork(w: World): Network {
  const net = new Network(CITY_TYPES);
  const info = curveInfo(w);
  const own = info.owned;
  // Ground links of a cell (no ramps), and links that belong to a curve's own chain (the curve edge draws those).
  const raw = (i: number) => { const out: number[] = []; forEachNeighbour(w, i, (n) => { if (n < NN) out.push(n); }); return out; };
  const isDiag = (a: number, b: number) => a % N !== b % N && ((a / N) | 0) !== ((b / N) | 0);
  /**
   * Ground links to draw. A diagonal passing a corner of a junction also touches the cells beside it,
   * which makes a little triangle of roads (two short sides and the diagonal); drawn, its three junctions
   * overlap into broken shards of pavement. The short straight side of such a triangle isn't drawn:
   * the junction it would join is already reached through the third cell.
   */
  // A link carries on straight at either end (so it's part of a real road, not just a corner stub).
  const straight = (i: number, n: number) => raw(i).includes(2 * i - n) || raw(n).includes(2 * n - i);
  /**
   * Two roads laid side by side in neighbouring rows link at every cell, which would draw a ladder of
   * junctions and crossings. A link whose two ends both run straight on across it is such a rung:
   * the pair is drawn as two roads side by side instead.
   */
  const through = (i: number, n: number) => { const d = n - i, p = Math.abs(d) === 1 ? N : 1; return raw(i).includes(i + p) && raw(i).includes(i - p); };
  const rung = (i: number, n: number) => !isDiag(i, n) && through(i, n) && through(n, i) && !straight(i, n);
  const links = (i: number) => raw(i).filter((n) => !rung(i, n) && (isDiag(i, n) || straight(i, n) || !raw(n).some((m) => m !== i && raw(i).includes(m) && (isDiag(i, m) || isDiag(n, m)))));
  const chain = new Set<string>();
  const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  // (A link between two older road cells stays a grid link even if the curve also runs along it: that street goes straight on.)
  for (const c of w.curves) for (let k = 1; k < c.cells.length; k++) if (own[c.cells[k - 1]] || own[c.cells[k]]) chain.add(key(c.cells[k - 1], c.cells[k]));
  const gridLinks = (i: number) => links(i).filter((n) => !chain.has(key(i, n)));

  // Where a cell's node stands (moved onto a curve where the curve passes through or is joined).
  const pos = new Map<number, V>();
  const nodeOf = new Map<number, number>();
  /** Cells that share one junction (several cells where one road meets a curve). */
  const alias = new Map<number, number>();
  const R = (cell: number) => { let c = cell; for (let g = 0; g < 8 && alias.has(c); g++) c = alias.get(c)!; return c; };
  const node = (cell0: number) => {
    const cell = R(cell0);
    let id = nodeOf.get(cell);
    if (id === undefined) { id = net.node(pos.get(cell) ?? centre(cell)).id; nodeOf.set(cell, id); }
    return id;
  };
  const cellOf = (p: V) => Math.max(0, Math.min(N - 1, Math.floor(p.z / CELL))) * N + Math.max(0, Math.min(N - 1, Math.floor(p.x / CELL)));

  // Curves meeting curves (free-angle roads crossing, or one ending on another): the cell graph links them
  // through a shared cell, which the cell taps below never see. Put one junction where their centrelines meet.
  type Tap = { t: number; cell: number; p: V };
  const paths = w.curves.map((c) => curvePath(c).path);
  const lens = paths.map(pathLength);
  const extra: Tap[][] = w.curves.map(() => []);
  /** Junction keys shared by two curves: their node is fixed where the centrelines meet. */
  const shared = new Set<number>();
  for (let i = 0; i < w.curves.length; i++) for (let j = i + 1; j < w.curves.length; j++) {
    for (const x of pathCrossings(paths[i], paths[j])) {
      if (x.ta < 1 || x.ta > lens[i] - 1 || x.tb < 1 || x.tb > lens[j] - 1) continue;
      const cell = cellOf(x.p);
      shared.add(cell); pos.set(cell, x.p);
      extra[i].push({ t: x.ta, cell, p: x.p });
      extra[j].push({ t: x.tb, cell, p: x.p });
    }
  }
  w.curves.forEach((c, i) => {
    for (const [cell, E, tEnd] of [[c.cells[0], { x: c.ax, z: c.az }, 0], [c.cells[c.cells.length - 1], { x: c.bx, z: c.bz }, lens[i]]] as [number, V, number][]) {
      // Already crossing something right at its end: that junction serves.
      if (extra[i].some((x) => Math.abs(x.t - tEnd) < 12)) continue;
      w.curves.forEach((d, j) => {
        if (j === i || shared.has(cell)) return;
        const q = nearestOnPath(paths[j], E);
        if (q.d > HALF_WIDTH[d.t as 1 | 2] + KERB_W[d.t as 1 | 2] + 4 || q.t < 1 || q.t > lens[j] - 1) return;
        shared.add(cell); pos.set(cell, q.p);
        extra[j].push({ t: q.t, cell, p: q.p });
      });
    }
  });

  // Curves: split at every cell where another road crosses or joins.
  w.curves.forEach((c, ci) => {
    const path = paths[ci];
    const L = lens[ci];
    const inChain = new Set(c.cells);
    const taps: Tap[] = [...extra[ci]];
    for (let k = 1; k < c.cells.length - 1; k++) {
      const cell = c.cells[k];
      if (shared.has(cell)) continue;
      const outside = gridLinks(cell).filter((n) => !inChain.has(n) || (!own[cell] && !own[n]));
      if (own[cell] && !outside.length) continue;
      // The junction goes where the meeting road's own straight line crosses the curve, so that road stays straight.
      let hit: { t: number; p: V } | null = null;
      for (const n of outside) {
        // The meeting road's own direction: the way it runs into n (it may join the curve sideways in the cell graph).
        const before = own[n] ? [] : gridLinks(n).filter((m) => m !== cell && !inChain.has(m));
        const from = before.length === 1 ? centre(before[0]) : centre(n);
        const a = centre(n), b = before.length === 1 ? { x: a.x * 2 - from.x, z: a.z * 2 - from.z } : centre(cell);
        const d = { x: b.x - a.x, z: b.z - a.z };
        const far = { x: a.x + d.x * 4, z: a.z + d.z * 4 }, back = { x: a.x - d.x * 2, z: a.z - d.z * 2 };
        const xs = pathCrossings(path, [{ kind: 'line', a: back, b: far }]);
        for (const x of xs) if (!hit || Math.hypot(x.p.x - b.x, x.p.z - b.z) < Math.hypot(hit.p.x - b.x, hit.p.z - b.z)) hit = { t: x.ta, p: x.p };
        if (hit) break;
      }
      if (!hit) { const q = nearestOnPath(path, centre(cell)); hit = { t: q.t, p: pathAt(path, q.t).p }; }
      if (hit.t > 1 && hit.t < L - 1) taps.push({ t: hit.t, cell, p: hit.p });
    }
    taps.sort((a, b) => a.t - b.t);
    const first = c.cells[0], last = c.cells[c.cells.length - 1];
    const stops: Tap[] = [{ t: 0, cell: first, p: { x: c.ax, z: c.az } }, ...taps, { t: L, cell: last, p: { x: c.bx, z: c.bz } }];
    // Junctions closer than 12 m along the curve are one junction. One two curves share keeps its place
    // (the other curve has it too), then the curve's own ends; a plain one folds into either. Two that
    // both hold their place stay apart.
    const ends = new Set([R(first), R(last)]);
    const rank = (k: number) => (shared.has(k) ? 2 : ends.has(k) ? 1 : 0);
    for (let k = 1; k < stops.length; k++) {
      const a = stops[k - 1], b = stops[k];
      if (b.t - a.t >= 12) continue;
      const ka = R(a.cell), kb = R(b.cell);
      if (ka === kb) { if (k < stops.length - 1) { b.t = a.t; b.p = a.p; } continue; }
      const ra = rank(ka), rb = rank(kb);
      if (ra && rb) continue;
      if (rb > ra) { alias.set(ka, kb); a.p = b.p; a.t = b.t; } else { alias.set(kb, ka); b.t = a.t; b.p = a.p; }
    }
    for (const tp of taps) if (!shared.has(R(tp.cell)) && !ends.has(R(tp.cell))) pos.set(R(tp.cell), tp.p);
    // The curve's ends stand where it was drawn, unless it ends on another curve (that junction is shared).
    for (const [cell, p] of [[first, { x: c.ax, z: c.az }], [last, { x: c.bx, z: c.bz }]] as [number, V][]) if (!shared.has(R(cell))) pos.set(R(cell), p);
    const kind = KIND[c.t] ?? 'street';
    let rest: Path = path, done = 0, from = 0;
    for (let k = 1; k < stops.length; k++) {
      if (R(stops[k].cell) === R(stops[from].cell)) continue;
      const [piece, after] = splitPath(rest, stops[k].t - done);
      rest = after; done = stops[k].t;
      const a = node(stops[from].cell), b = node(stops[k].cell);
      from = k;
      if (pathLength(piece) < 0.5) continue;
      net.addEdge(a, b, snapEnds(piece, net.nodes.get(a)!.p, net.nodes.get(b)!.p), kind);
    }
  });

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
    // A change of road type makes a node, except next to a curve: the curve's junction is the node there.
    const curveish = (c: number) => own[c] === 1 || pos.has(c);
    if ((w.road[l[0]] !== w.road[i] && !curveish(l[0])) || (w.road[l[1]] !== w.road[i] && !curveish(l[1]))) return true;
    // So does the start or end of a one-way stretch.
    if (w.oneway[l[0]] !== w.oneway[i] || w.oneway[l[1]] !== w.oneway[i]) return true;
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
      // A one-way run carries its direction (east, south, west, north) for the arrows and lines.
      const ow = w.oneway[first] && (w.oneway[i] === w.oneway[first] || isNode(i)) && (w.oneway[cur] === w.oneway[first] || isNode(cur)) ? w.oneway[first] : 0;
      net.addEdge(a, b, [{ kind: 'line', a: net.nodes.get(a)!.p, b: net.nodes.get(b)!.p }], kind, ow ? `${ONEWAY_TAG}${ow}` : undefined);
    }
    // Roads running off the west edge of the map lead on toward the next town.
    if (i % N === 0 && !own[i]) {
      const p = centre(i), off = net.node({ x: -CELL * 1.5, z: p.z });
      net.addEdge(node(i), off.id, [{ kind: 'line', a: net.nodes.get(node(i))!.p, b: off.p }], KIND[w.road[i]] ?? 'street');
    }
  }
  // Where a ramp rises from the ground road, the road runs on to the ramp's foot (the edge of its
  // cell) so the asphalt meets the ramp with no gap of grass between.
  for (let r = 0; r < N * N; r++) {
    if (!w.roadAlt[r]) continue;
    const e = rampExit(w, r);
    if (e < 0 || !w.road[e] || own[e]) continue;
    const p = centre(e), q = centre(r);
    const foot = { x: p.x + (q.x - p.x) * 0.499, z: p.z + (q.z - p.z) * 0.499 };
    const end = net.node(foot);
    net.addEdge(node(e), end.id, [{ kind: 'line', a: net.nodes.get(node(e))!.p, b: end.p }], 'avenue');
  }
  net.simplify();
  if (w.roundabouts.length) { addRoundabouts(net, w); net.simplify(); }
  return net;
}

/** Edge tag of a one-way road, followed by its direction code (1 east, 2 south, 3 west, 4 north). */
export const ONEWAY_TAG = 'ow:';

/** Edge tag of a roundabout's ring. */
export const RING = 'ring';

/**
 * Each 회전교차로: every road reaching inside its ring is cut where it meets
 * the ring's centreline and ends there at a junction; the ring itself runs
 * round between those junctions as arcs. Roads meeting the ring too close
 * together share one mouth.
 */
function addRoundabouts(net: Network, w: World) {
  for (const rb of w.roundabouts) {
    const g = ringOf(rb), C = { x: g.x, z: g.z }, R = g.rc;
    const ringKind: Kind = rb.t === Road.Avenue ? 'avenue' : 'street';
    const off = (p: V) => Math.hypot(p.x - C.x, p.z - C.z) - R;
    const entries: { a: number; node: number }[] = [];
    const entry = (p: V) => {
      const a = Math.atan2(p.z - C.z, p.x - C.x);
      const n = net.node({ x: C.x + Math.cos(a) * R, z: C.z + Math.sin(a) * R });
      entries.push({ a, node: n.id });
      return n.id;
    };
    for (const e of [...net.edges.values()]) {
      const L = pathLength(e.path);
      const s = samplePath(e.path, 0, L, 0.5, true);
      if (!s.some((q) => off(q.p) < 0)) continue;
      const cuts = [0];
      for (let i = 1; i < s.length; i++) {
        const d0 = off(s[i - 1].p), d1 = off(s[i].p);
        if ((d0 < 0) !== (d1 < 0)) cuts.push(s[i - 1].t + (s[i].t - s[i - 1].t) * (d0 / (d0 - d1)));
      }
      cuts.push(L);
      net.edges.delete(e.id);
      net.version++;
      for (let k = 1; k < cuts.length; k++) {
        const t0 = cuts[k - 1], t1 = cuts[k];
        if (t1 - t0 < 0.3 || off(pathAt(e.path, (t0 + t1) / 2).p) < 0) continue;
        const piece = splitPath(splitPath(e.path, t0)[1], t1 - t0)[0];
        const a = k === 1 ? e.a : entry(pathAt(e.path, t0).p);
        const b = k === cuts.length - 1 ? e.b : entry(pathAt(e.path, t1).p);
        net.addEdge(a, b, snapEnds(piece, net.nodes.get(a)!.p, net.nodes.get(b)!.p), e.kind, e.tag);
      }
    }
    // Whatever was left inside (junctions, dead ends) goes.
    for (const n of [...net.nodes.values()]) if (off(n.p) < -0.5 && !net.at(n.id).length) net.nodes.delete(n.id);
    // Mouths closer than this along the ring merge into one.
    entries.sort((p, q) => p.a - q.a);
    const gap = (net.types[ringKind].half + net.types[ringKind].kerb) * 2 + 4;
    const groups: { a: number; node: number }[][] = [];
    for (const en of entries) {
      const last = groups[groups.length - 1];
      if (last && (en.a - last[last.length - 1].a) * R < gap) last.push(en); else groups.push([en]);
    }
    if (groups.length > 1) {
      const first = groups[0], last = groups[groups.length - 1];
      if ((first[0].a + Math.PI * 2 - last[last.length - 1].a) * R < gap) { groups.pop(); groups[0] = [...last.map((x) => ({ ...x, a: x.a - Math.PI * 2 })), ...first]; }
    }
    const mouths: { a: number; node: number }[] = [];
    for (const gr of groups) {
      if (gr.length === 1) { mouths.push(gr[0]); continue; }
      const a = gr.reduce((s, x) => s + x.a, 0) / gr.length;
      const m = net.node({ x: C.x + Math.cos(a) * R, z: C.z + Math.sin(a) * R });
      for (const x of gr) {
        for (const e of net.at(x.node)) {
          if (e.a === x.node) e.a = m.id;
          if (e.b === x.node) e.b = m.id;
          e.path = snapEnds(e.path, net.nodes.get(e.a)!.p, net.nodes.get(e.b)!.p);
        }
        net.nodes.delete(x.node);
      }
      net.version++;
      mouths.push({ a, node: m.id });
    }
    // An empty ring still goes round: two halves.
    if (mouths.length < 2) {
      const a = mouths.length ? mouths[0].a + Math.PI : 0;
      const extra = [a, ...(mouths.length ? [] : [a + Math.PI])].map((x) => ({ a: x, node: net.node({ x: C.x + Math.cos(x) * R, z: C.z + Math.sin(x) * R }).id }));
      mouths.push(...extra);
    }
    mouths.sort((p, q) => p.a - q.a);
    for (let i = 0; i < mouths.length; i++) {
      const p = mouths[i], q = mouths[(i + 1) % mouths.length];
      let sweep = q.a - p.a;
      while (sweep <= 0) sweep += Math.PI * 2;
      net.addEdge(p.node, q.node, [{ kind: 'arc', c: C, r: R, a0: p.a, sweep }], ringKind, RING);
    }
  }
}

/**
 * The flyovers (second-layer roads at the Elevated level) as their own road
 * graph, drawn by the same code as the ground roads, then lifted onto the
 * deck: `heightAt` gives the deck height at any point, ramps climbing from
 * the ground at their outer edge to the deck at their inner one.
 */
export function buildElevatedNetwork(w: World): { net: Network; heightAt: (x: number, z: number) => number; isRamp: (c: number) => boolean } {
  const net = new Network(CITY_TYPES);
  const elev = (c: number) => c >= 0 && c < N * N && w.roadAlt[c] !== 0 && w.altLevel[c] === Level.Elevated;
  const nbs = (c: number) => altNeighbours(w, c).filter(elev);
  const rampDir = (c: number) => { const n = nbs(c); if (n.length !== 1) return null; return { x: (n[0] % N) - (c % N), z: ((n[0] / N) | 0) - ((c / N) | 0) }; };
  const isRamp = (c: number) => elev(c) && nbs(c).length <= 1;
  // Where a cell's node sits: the centre, or for a ramp its outer edge (where it leaves the ground).
  const nodePos = (c: number): V => {
    const p = centre(c), d = rampDir(c);
    return d ? { x: p.x - d.x * CELL / 2, z: p.z - d.z * CELL / 2 } : p;
  };
  const isNode = (c: number) => {
    const n = nbs(c);
    if (n.length !== 2) return true;
    const dx1 = (n[0] % N) - (c % N), dy1 = ((n[0] / N) | 0) - ((c / N) | 0), dx2 = (n[1] % N) - (c % N), dy2 = ((n[1] / N) | 0) - ((c / N) | 0);
    return dx1 !== -dx2 || dy1 !== -dy2 || w.roadAlt[n[0]] !== w.roadAlt[c] || w.roadAlt[n[1]] !== w.roadAlt[c];
  };
  const nodeOf = new Map<number, number>();
  const node = (c: number) => { let id = nodeOf.get(c); if (id === undefined) { id = net.node(nodePos(c)).id; nodeOf.set(c, id); } return id; };
  const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const seen = new Set<string>();
  for (let c = 0; c < N * N; c++) {
    if (!elev(c) || !isNode(c)) continue;
    for (const first of nbs(c)) {
      if (seen.has(key(c, first))) continue;
      let prev = c, cur = first;
      seen.add(key(prev, cur));
      for (let g = 0; g < N * 2 && !isNode(cur); g++) {
        const next = nbs(cur).find((n) => n !== prev);
        if (next === undefined) break;
        prev = cur; cur = next;
        seen.add(key(prev, cur));
      }
      const a = node(c), b = node(cur);
      if (a === b) continue;
      net.addEdge(a, b, [{ kind: 'line', a: net.nodes.get(a)!.p, b: net.nodes.get(b)!.p }], KIND[Math.min(w.roadAlt[c], w.roadAlt[first]) as 1 | 2] ?? 'avenue');
    }
  }
  net.simplify();
  const heightAt = (x: number, z: number) => deckHeightAt(w, x, z);
  return { net, heightAt, isRamp };
}
