import {
  add, dist, dot, left, mul, norm, offsetPoint, pathAt, pathCrossings, pathLength, reversePath, samplePath, segCross, splitPath, sub, v,
  type Path, type V,
} from './geom';

/**
 * A road network as a planar graph: nodes where roads end or meet, edges
 * carrying a centreline path between two nodes. Adding a road splits any
 * road it crosses and makes a junction there, so every crossing is a node.
 *
 * Geometry for drawing follows A/B Street's recipe: widen each road, trim
 * it back from every junction to where its kerbs clear the neighbouring
 * roads' kerbs, and fill the junction with one polygon whose corners are
 * rounded kerb curves.
 */

export interface RoadType { half: number; kerb: number; lanes: number }
export const TYPES = {
  /** 2-lane street: 7 m of asphalt, 2 m pavements. */
  street: { half: 3.5, kerb: 2, lanes: 1 },
  /** 4-lane avenue: 16 m of asphalt (two 4 m lanes each way), 2.5 m pavements. */
  avenue: { half: 8, kerb: 2.5, lanes: 2 },
} as const satisfies Record<string, RoadType>;
export type Kind = keyof typeof TYPES;

export interface Node { id: number; p: V }
export interface Edge { id: number; a: number; b: number; path: Path; kind: Kind }

export class Network {
  nodes = new Map<number, Node>();
  edges = new Map<number, Edge>();
  private nid = 1;
  private eid = 1;
  /** Bumped on every change, so callers can cache what they build from it. */
  version = 0;

  node(p: V): Node {
    const n = { id: this.nid++, p };
    this.nodes.set(n.id, n);
    return n;
  }

  /** Edges touching a node. */
  at(n: number): Edge[] {
    const out: Edge[] = [];
    for (const e of this.edges.values()) if (e.a === n || e.b === n) out.push(e);
    return out;
  }

  /** Nearest node within `r` metres. */
  nodeNear(p: V, r: number): Node | null {
    let best: Node | null = null, bd = r;
    for (const n of this.nodes.values()) { const d = dist(n.p, p); if (d <= bd) { bd = d; best = n; } }
    return best;
  }

  /** Direction a road leaves node `n` along edge `e` (unit). */
  leave(e: Edge, n: number): V {
    const L = pathLength(e.path);
    if (e.a === n) return pathAt(e.path, 0).d;
    const d = pathAt(e.path, L).d;
    return { x: -d.x, z: -d.z };
  }

  /** The edge's path as seen leaving node `n`. */
  pathFrom(e: Edge, n: number): Path { return e.a === n ? e.path : reversePath(e.path); }

  /** Split edge `e` at distance t, returning the new middle node. */
  split(e: Edge, t: number): Node {
    const [p1, p2] = splitPath(e.path, t);
    const m = this.node(pathAt(e.path, t).p);
    this.edges.delete(e.id);
    this.edges.set(this.eid, { id: this.eid++, a: e.a, b: m.id, path: p1, kind: e.kind });
    this.edges.set(this.eid, { id: this.eid++, a: m.id, b: e.b, path: p2, kind: e.kind });
    return m;
  }

  /**
   * Lay a road along `path`. Its ends snap to nodes within `snap` metres
   * (or split the road they land on); every crossing with an existing road
   * becomes a junction. Returns the edges created.
   */
  addRoad(path: Path, kind: Kind, snap = 6): Edge[] {
    const L = pathLength(path);
    if (L < 2) return [];
    // Cut points along the new road: its two ends and every crossing.
    const cuts: { t: number; node: number }[] = [];
    const endNode = (p: V): number => {
      const n = this.nodeNear(p, snap);
      if (n) return n.id;
      // Landing on the middle of a road: split it there.
      for (const e of this.edges.values()) {
        const s = samplePath(e.path, 0, pathLength(e.path), 1);
        for (let i = 1; i < s.length; i++) {
          const a = s[i - 1].p, b = s[i].p, ab = sub(b, a);
          const k = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1)));
          if (dist(add(a, mul(ab, k)), p) < snap) return this.split(e, s[i - 1].t + (s[i].t - s[i - 1].t) * k).id;
        }
      }
      return this.node(p).id;
    };
    cuts.push({ t: 0, node: endNode(pathAt(path, 0).p) });
    const endId = endNode(pathAt(path, L).p);
    for (const e of [...this.edges.values()]) {
      for (const c of pathCrossings(path, e.path)) {
        if (c.ta < snap || c.ta > L - snap) continue;
        // Close to one of that road's ends? Use the node; otherwise split it.
        const eL = pathLength(e.path);
        const n = c.tb < snap ? e.a : c.tb > eL - snap ? e.b : (this.edges.has(e.id) ? this.split(e, c.tb).id : this.node(c.p).id);
        cuts.push({ t: c.ta, node: n });
      }
    }
    cuts.push({ t: L, node: endId });
    cuts.sort((a, b) => a.t - b.t);
    const made: Edge[] = [];
    let rest = path, done = 0;
    for (let i = 1; i < cuts.length; i++) {
      if (cuts[i].node === cuts[i - 1].node) continue;
      const [piece, after] = splitPath(rest, cuts[i].t - done);
      rest = after; done = cuts[i].t;
      // Snap the piece's ends exactly onto the nodes.
      const fixed = snapEnds(piece, this.nodes.get(cuts[i - 1].node)!.p, this.nodes.get(cuts[i].node)!.p);
      const e: Edge = { id: this.eid++, a: cuts[i - 1].node, b: cuts[i].node, path: fixed, kind };
      this.edges.set(e.id, e);
      made.push(e);
    }
    this.version++;
    return made;
  }

  remove(edgeId: number) {
    const e = this.edges.get(edgeId);
    if (!e) return;
    this.edges.delete(edgeId);
    for (const n of [e.a, e.b]) if (!this.at(n).length) this.nodes.delete(n);
    this.version++;
  }
}

/** Move a path's first and last points onto exact node positions (lines only; arcs are left alone). */
function snapEnds(p: Path, a: V, b: V): Path {
  const out = p.slice();
  const f = out[0], l = out[out.length - 1];
  if (f && f.kind === 'line') out[0] = { ...f, a };
  if (l && l.kind === 'line') out[out.length - 1] = { ...l, b };
  return out;
}

/* ---------------- geometry for drawing ---------------- */

export interface Ribbon { edge: number; kind: Kind; t0: number; t1: number }
export interface Junction { node: number; ring: V[]; kerb: V[][] }
export interface Geometry {
  /** Each edge's drawn stretch between its two trims. */
  ribbons: Ribbon[];
  /** Junction fills (asphalt) and the kerb curves round their corners. */
  junctions: Junction[];
  /** How far each edge is trimmed back at its a and b ends. */
  trims: Map<number, [number, number]>;
}

/** Sampled boundary of an edge leaving node n, offset `o` to the left, out to `far` metres. */
function boundary(net: Network, e: Edge, n: number, o: number, far: number) {
  const p = net.pathFrom(e, n);
  const L = Math.min(pathLength(p), far);
  return samplePath(p, 0, L, 1).map((q) => ({ t: q.t, p: offsetPoint(q, o) }));
}

function polyCross(a: { t: number; p: V }[], b: { t: number; p: V }[]) {
  for (let i = 1; i < a.length; i++) for (let j = 1; j < b.length; j++) {
    const c = segCross(a[i - 1].p, a[i].p, b[j - 1].p, b[j].p);
    if (c) return { ta: a[i - 1].t + (a[i].t - a[i - 1].t) * c.s, tb: b[j - 1].t + (b[j].t - b[j - 1].t) * c.u, p: c.p };
  }
  return null;
}

export function buildGeometry(net: Network): Geometry {
  const trims = new Map<number, [number, number]>();
  for (const e of net.edges.values()) trims.set(e.id, [0, 0]);
  const setTrim = (e: Edge, n: number, t: number) => {
    const tr = trims.get(e.id)!;
    if (e.a === n) tr[0] = Math.max(tr[0], t); else tr[1] = Math.max(tr[1], t);
  };
  const trimOf = (e: Edge, n: number) => (e.a === n ? trims.get(e.id)![0] : trims.get(e.id)![1]);
  const junctions: Junction[] = [];
  const order = new Map<number, Edge[]>();

  for (const n of net.nodes.values()) {
    const es = net.at(n.id);
    if (es.length < 2) continue;
    // Edges round the node in angle order.
    es.sort((a, b) => {
      const da = net.leave(a, n.id), db = net.leave(b, n.id);
      return Math.atan2(da.z, da.x) - Math.atan2(db.z, db.x);
    });
    order.set(n.id, es);
    const far = 60;
    for (let i = 0; i < es.length; i++) {
      const e1 = es[i], e2 = es[(i + 1) % es.length];
      if (e1 === e2) continue;
      // With angles increasing clockwise on screen (z south), e2 lies clockwise of e1:
      // e1's right kerb meets e2's left kerb.
      const h1 = TYPES[e1.kind].half, h2 = TYPES[e2.kind].half;
      const b1 = boundary(net, e1, n.id, -h1, far), b2 = boundary(net, e2, n.id, h2, far);
      const c = polyCross(b1, b2);
      if (c) { setTrim(e1, n.id, c.ta); setTrim(e2, n.id, c.tb); }
    }
    // Roads that meet nearly straight on (a bend, no side road) need only a sliver; others a clear box.
    const straight = es.length === 2 && dot(net.leave(es[0], n.id), net.leave(es[1], n.id)) < -0.95;
    for (const e of es) setTrim(e, n.id, straight ? 0.5 : TYPES[e.kind].half * 0.6 + 1);
  }
  // Trims can't eat a whole road: cap each end at 45% of the length.
  for (const e of net.edges.values()) {
    const L = pathLength(e.path), tr = trims.get(e.id)!;
    tr[0] = Math.min(tr[0], L * 0.45); tr[1] = Math.min(tr[1], L * 0.45);
  }
  // Junction polygons: for each road round the node, its trimmed end (right kerb, then left),
  // joined to the next road by a kerb curve bent toward where the two kerbs would meet.
  for (const [nid, es] of order) {
    const ring: V[] = [], kerb: V[][] = [];
    const node = net.nodes.get(nid)!;
    for (let i = 0; i < es.length; i++) {
      const e1 = es[i], e2 = es[(i + 1) % es.length];
      const h1 = TYPES[e1.kind].half, h2 = TYPES[e2.kind].half;
      const p1 = net.pathFrom(e1, nid), p2 = net.pathFrom(e2, nid);
      const q1 = pathAt(p1, trimOf(e1, nid)), q2 = pathAt(p2, trimOf(e2, nid));
      const l1 = offsetPoint(q1, h1), r1 = offsetPoint(q1, -h1), l2 = offsetPoint(q2, h2);
      if (i === 0) ring.push(l1);
      ring.push(r1);
      // Corner from e1's right kerb to e2's left kerb: a quadratic curve through the kerbs' meeting point.
      const ctrl = cornerControl(q1, -1, q2, 1, r1, l2, node.p);
      const curve: V[] = [];
      for (let k = 1; k < 8; k++) {
        const u = k / 8, w = 1 - u;
        curve.push(v(w * w * r1.x + 2 * w * u * ctrl.x + u * u * l2.x, w * w * r1.z + 2 * w * u * ctrl.z + u * u * l2.z));
      }
      kerb.push([r1, ...curve, l2]);
      ring.push(...curve);
      if (i < es.length - 1) ring.push(l2);
    }
    junctions.push({ node: nid, ring, kerb });
  }
  const ribbons: Ribbon[] = [];
  for (const e of net.edges.values()) {
    const L = pathLength(e.path), [ta, tb] = trims.get(e.id)!;
    if (L - ta - tb > 0.05) ribbons.push({ edge: e.id, kind: e.kind, t0: ta, t1: L - tb });
  }
  return { ribbons, junctions, trims };
}

/** Control point for a kerb corner: where the two kerb lines, extended back toward the node, meet. */
function cornerControl(q1: { p: V; d: V }, s1: number, q2: { p: V; d: V }, s2: number, a: V, b: V, node: V): V {
  // Kerb lines run back toward the node (opposite the leaving direction).
  const d1 = { x: -q1.d.x, z: -q1.d.z }, d2 = { x: -q2.d.x, z: -q2.d.z };
  const den = d1.x * d2.z - d1.z * d2.x;
  void s1; void s2;
  if (Math.abs(den) > 1e-6) {
    const w = sub(b, a);
    const s = (w.x * d2.z - w.z * d2.x) / den;
    const p = add(a, mul(d1, s));
    // Only if it lies on the near side (not far behind the node).
    if (s > -0.5 && dist(p, node) < dist(a, node) + dist(b, node)) return p;
  }
  return mul(add(a, b), 0.5);
}

/** Left and right kerb points along a ribbon, for building a strip. */
export function ribbonStrip(net: Network, r: Ribbon, offsets: number[], step = 2) {
  const e = net.edges.get(r.edge)!;
  return samplePath(e.path, r.t0, r.t1, step).map((q) => offsets.map((o) => offsetPoint(q, o)));
}

export { norm, left };
