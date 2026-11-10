import * as THREE from 'three';
import { Clipper, ClipperOffset, EndType, FillRule, JoinType, Paths64, PointInPolygonResult, type Path64, type Point64 } from 'clipper2-js';
import { CELL, Ground, N, Road } from '../sim/defs';
import { bez, bezLength, curveInfo, distTo, curveLinkOk, HALF_WIDTH, KERB_W, type Curve } from '../sim/curves';
import { DIAG } from '../sim/graph';
import type { World } from '../sim/world';

/**
 * Road surfaces as merged polygons, for the parts of the network a cell grid
 * can't draw cleanly: curves, diagonals, and every road cell touching them.
 * Each centreline (a grid link between cell centres, or a curve) is widened
 * by its asphalt half width and all of them are unioned, so crossings, T
 * junctions, bends and curve ends are one seamless surface by construction.
 * The pavement is the same union widened by the kerb, minus the asphalt;
 * round ends give bends and dead ends a natural curve. Each cell unions only the
 * centrelines near it and keeps its own piece, which keeps the polygons small
 * enough to triangulate reliably. Cells outside the region
 * stay with the grid renderer, which uses the same widths so the two meet
 * flush at the cell edges. Coordinates go to Clipper in centimetres.
 */

export const S = 20; // metres to Clipper units (5 cm)
/** Arc smoothness: at most this far (in units) off a true circle, 0.15 m. */
const ARC = 5;

export interface PolyRoads {
  /** Ground road cells drawn here (the grid renderer skips them). */
  cells: Set<number>;
  /** Asphalt and pavement outlines in metres: outer rings and holes, ready to triangulate. */
  /** Per cell: street asphalt, avenue asphalt (darker) and pavement, as rings in Clipper units. */
  /** Curve-owned cells (drawn here too). */
  owned: Uint8Array;
  pieces: { cell: number; street: Path64[]; avenue: Path64[]; pavement: Path64[] }[];
  /** Centrelines for the markings, with their road type. */
  lines: { pts: { x: number; z: number }[]; t: Road }[];
  /** Junction centres: no markings near them. */
  junctions: { x: number; z: number; r: number }[];
}

/** Last build's pieces per cell, keyed by the centrelines that made them. */
let pieceCache = new Map<number, { key: string; piece: PolyRoads['pieces'][number] }>();

const centre = (i: number) => ({ x: (i % N) * CELL + CELL / 2, z: ((i / N) | 0) * CELL + CELL / 2 });

/** Every ground road link of a cell: orthogonal neighbours and its diagonals. */
function links(w: World, i: number): number[] {
  const x = i % N, y = (i / N) | 0, out: number[] = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < N && ny < N && w.road[ny * N + nx]) out.push(ny * N + nx);
  }
  for (const [dx, dy, bit] of DIAG) {
    const nx = x + dx, ny = y + dy;
    if (w.diag[i] & bit && nx >= 0 && ny >= 0 && nx < N && ny < N && w.road[ny * N + nx]) out.push(ny * N + nx);
  }
  return out;
}

export function buildPolyRoads(w: World, owned: Uint8Array): PolyRoads {
  const cells = new Set<number>();
  const eligible = (i: number) => !!w.road[i] && w.ground[i] === Ground.Land && !w.roadAlt[i] && i % N > 1;
  // Seeds: every cell of a curve's chain and every cell with a diagonal; then their road neighbours.
  const seeds: number[] = [];
  for (const c of w.curves) for (const i of c.cells) seeds.push(i);
  for (let i = 0; i < N * N; i++) if (w.diag[i]) seeds.push(i);
  for (const i of seeds) {
    if (!eligible(i)) continue;
    cells.add(i);
    for (const j of links(w, i)) if (eligible(j) && !owned[j]) cells.add(j);
  }
  // Grid junctions, corners and dead ends too, on their own: rounded kerbs instead of square ones.
  for (let i = 0; i < N * N; i++) {
    if (cells.has(i) || !eligible(i) || owned[i]) continue;
    const x = i % N, y = (i / N) | 0;
    const r = (dx: number, dy: number) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < N && ny < N && !!w.road[ny * N + nx]; };
    const e = r(1, 0), wv = r(-1, 0), n = r(0, -1), so = r(0, 1);
    const deg = +e + +wv + +n + +so;
    if (deg >= 3 || deg === 1 || (deg === 2 && !((e && wv) || (n && so)))) cells.add(i);
  }
  const empty = { cells, owned, pieces: [], lines: [], junctions: [] };
  if (!cells.size) return empty;

  // Which curve a chain cell belongs to: links inside one curve's chain are drawn by the curve itself.
  const chainOf = new Map<number, Set<Curve>>();
  for (const c of w.curves) for (const i of c.cells) { if (!chainOf.has(i)) chainOf.set(i, new Set()); chainOf.get(i)!.add(c); }
  const sameCurve = (a: number, b: number) => { const A = chainOf.get(a), B = chainOf.get(b); if (!A || !B) return false; for (const c of A) if (B.has(c)) return true; return false; };
  // Consecutive in some chain: the curve passes from one to the other.
  const chainNeighbours = (a: number, b: number) => w.curves.some((c) => { const k = c.cells.indexOf(a); return k >= 0 && (c.cells[k - 1] === b || c.cells[k + 1] === b); });
  const ci = curveInfo(w);

  const lines: PolyRoads['lines'] = [];
  const degree = new Map<number, number>();
  const seen = new Set<string>();
  // Arms meeting at each node (a point where centrelines start, end or cross), for the kerb fillets.
  const arms = new Map<string, { x: number; z: number; list: { dx: number; dz: number; hw: number; len: number; t: 1 | 2 }[] }>();
  const nodeKey = (p: { x: number; z: number }) => `${Math.round(p.x * 4)},${Math.round(p.z * 4)}`;
  const arm = (p: { x: number; z: number }, q: { x: number; z: number }, t: Road, len?: number) => {
    const l = Math.hypot(q.x - p.x, q.z - p.z);
    if (l < 1e-3) return;
    const k = nodeKey(p);
    if (!arms.has(k)) arms.set(k, { x: p.x, z: p.z, list: [] });
    arms.get(k)!.list.push({ dx: (q.x - p.x) / l, dz: (q.z - p.z) / l, hw: HALF_WIDTH[t as 1 | 2], len: len ?? l, t: t as 1 | 2 });
  };
  // Centrelines in Clipper units, with their bounds for finding the ones near a cell.
  const segs: { path: Path64; t: 1 | 2; line: number; key: string; x0: number; z0: number; x1: number; z1: number }[] = [];
  let lineId = 0;
  const addLine = (pts: { x: number; z: number }[], t: Road, line = lineId++) => {
    const flat: number[] = [];
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of pts) {
      flat.push(Math.round(p.x * S), Math.round(p.z * S));
      x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z);
    }
    segs.push({ path: Clipper.makePath(flat), t: t as 1 | 2, line, key: `${t}:${flat.join(',')};`, x0, z0, x1, z1 });
    lines.push({ pts, t });
  };
  for (const i of cells) {
    for (const j of links(w, i)) {
      // Along a chain the curve draws itself; beside it only the links it really makes (curveLinkOk).
      if (sameCurve(i, j) && (owned[i] || owned[j] || chainNeighbours(i, j))) continue;
      if (!curveLinkOk(w, i, j)) continue;
      const key = i < j ? `${i}:${j}` : `${j}:${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Half a link when the far end is drawn by the grid: the rest is the grid's.
      // A road meeting a curve from the side runs to the curve itself, not the cell centre.
      const at = (k: number) => (owned[k] ? { x: ci.px[k], z: ci.pz[k] } : centre(k));
      const a = at(i), b = at(j);
      const end = cells.has(j) ? b : { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      const lt = Math.min(w.road[i], w.road[j]) as Road;
      addLine([a, end], lt);
      arm(a, end, lt);
      if (cells.has(j)) arm(b, a, lt);
      // A side join: the curve runs on both ways through the join point.
      for (const [k, p] of [[i, a], [j, b]] as const) {
        if (!owned[k] || (k === j && !cells.has(j))) continue;
        for (const c of w.curves) {
          if (!c.own.includes(k)) continue;
          const d = distTo(c, p.x, p.z);
          if (arms.get(nodeKey(p))?.list.some((q) => q.t === c.t && Math.abs(Math.abs(q.dx * d.tan.x + q.dz * d.tan.z) - 1) < 0.01)) break;
          arm(p, { x: p.x + d.tan.x, z: p.z + d.tan.z }, c.t, 10);
          arm(p, { x: p.x - d.tan.x, z: p.z - d.tan.z }, c.t, 10);
        }
      }
      degree.set(i, (degree.get(i) ?? 0) + 1);
      if (cells.has(j)) degree.set(j, (degree.get(j) ?? 0) + 1);
      // A road joining a curve from the side makes a T on the curve.
      for (const k of [i, j]) if (owned[k]) degree.set(k, Math.max(3, degree.get(k) ?? 0));
    }
  }
  for (const c of w.curves) {
    // Long curves go in short pieces so a cell only unions what passes near it.
    const n = Math.max(4, Math.ceil(bezLength(c) / 1));
    const pts = Array.from({ length: n + 1 }, (_, k) => bez(c, k / n));
    const id = lineId++;
    for (let k = 0; k < n; k += 8) addLine(pts.slice(k, Math.min(n, k + 8) + 1), c.t, id);
    // Its ends are nodes too (they meet the road they join there).
    arm(pts[0], pts[Math.min(3, n)], c.t, 10);
    arm(pts[n], pts[Math.max(0, n - 3)], c.t, 10);
    for (const e of [c.cells[0], c.cells[c.cells.length - 1]]) degree.set(e, (degree.get(e) ?? 0) + 1);
    // A crossing in the middle of a curve is a junction too.
    for (const i of c.cells.slice(1, -1)) if (!owned[i] && cells.has(i)) degree.set(i, (degree.get(i) ?? 0) + 2);
  }

  // Kerb fillets: between each pair of neighbouring arms at a node, the corner between their asphalt
  // edges is filled up to a circle of radius R tangent to both, so the kerb rounds the corner.
  // R shrinks until both tangent points lie on the arms (on a half link: inside the cell).
  const patches: { path: Path64; av: boolean; key: string; x0: number; z0: number; x1: number; z1: number }[] = [];
  arms.forEach(({ x, z, list }) => {
    if (list.length < 2) return;
    const ang = list.map((a) => ({ a, t: Math.atan2(a.dz, a.dx) })).sort((p, q) => p.t - q.t);
    for (let k = 0; k < ang.length; k++) {
      const A = ang[k].a, Bn = ang[(k + 1) % ang.length];
      let th = Bn.t - ang[k].t;
      if (th <= 0) th += Math.PI * 2;
      if (th >= Math.PI - 0.15 || th < 0.2) continue;
      const B = Bn.a;
      const nA = { x: -A.dz, z: A.dx }, nB = { x: B.dz, z: -B.dx };
      // P = node + nA*(ha+r) + a*t meets Q = node + nB*(hb+r) + b*s.
      const solve = (r: number) => {
        const px = nA.x * (A.hw + r) - nB.x * (B.hw + r), pz = nA.z * (A.hw + r) - nB.z * (B.hw + r);
        const det = A.dx * -B.dz - A.dz * -B.dx;
        const t = (-px * -B.dz + pz * -B.dx) / det;
        const s2 = (A.dx * -pz + A.dz * px) / det;
        return { t, s: s2 };
      };
      let R = 3, f = solve(R);
      while (R > 0.6 && (f.t > A.len - 0.05 || f.s > B.len - 0.05)) { R -= 0.5; f = solve(R); }
      if (f.t <= 0 || f.s <= 0 || f.t > A.len - 0.05 || f.s > B.len - 0.05) continue;
      const e = solve(0);
      const C = { x: x + nA.x * (A.hw + R) + A.dx * f.t, z: z + nA.z * (A.hw + R) + A.dz * f.t };
      const TA = { x: x + nA.x * A.hw + A.dx * f.t, z: z + nA.z * A.hw + A.dz * f.t };
      const TB = { x: x + nB.x * B.hw + B.dx * f.s, z: z + nB.z * B.hw + B.dz * f.s };
      const E = { x: x + nA.x * A.hw + A.dx * e.t, z: z + nA.z * A.hw + A.dz * e.t };
      let a0 = Math.atan2(TA.z - C.z, TA.x - C.x), a1 = Math.atan2(TB.z - C.z, TB.x - C.x);
      let da = a1 - a0;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const pts = [E, TA];
      const steps = Math.max(3, Math.ceil(Math.abs(da) / 0.2));
      for (let j = 1; j < steps; j++) { const a = a0 + (da * j) / steps; pts.push({ x: C.x + Math.cos(a) * R, z: C.z + Math.sin(a) * R }); }
      pts.push(TB);
      const flat = pts.flatMap((p) => [Math.round(p.x * S), Math.round(p.z * S)]);
      let path = Clipper.makePath(flat);
      if (!Clipper.isPositive(path)) path = Clipper.reversePath(path);
      const xs = pts.map((p) => p.x), zs = pts.map((p) => p.z);
      patches.push({ path, av: A.t === 2 && B.t === 2, key: `p${flat.join(',')};`, x0: Math.min(...xs), z0: Math.min(...zs), x1: Math.max(...xs), z1: Math.max(...zs) });
    }
  });

  // Cells the surfaces may reach, minus those they must not spill onto: grid-drawn road cells and water.
  const reach = new Set<number>();
  for (const i of cells) {
    const x = i % N, y = (i / N) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const j = ny * N + nx;
      if (cells.has(j) || (!(w.road[j] && !owned[j]) && w.ground[j] !== Ground.Water)) reach.add(j);
    }
  }
  for (const c of w.curves) for (const i of c.cells) if (w.ground[i] === Ground.Water) reach.delete(i);

  // Each cell: union the centrelines near it, widened, then cut to the cell. Small pieces, robust and fast.
  const pieces: PolyRoads['pieces'] = [];
  const fresh = new Map<number, { key: string; piece: PolyRoads['pieces'][number] }>();
  // Far enough that every cell sees all it needs for the rounding below, so neighbouring pieces agree.
  const M = HALF_WIDTH[2] + KERB_W[2] + 1;
  const offset = (p: Paths64, d: number, end: EndType) => {
    const out = new Paths64();
    if (!p.length) return out;
    const o = new ClipperOffset(2, ARC);
    o.addPaths(p, JoinType.Round, end);
    o.execute(d * S, out);
    return out;
  };
  // Clipper2 widens an open path by the whole delta (half each side): pass twice the half width.
  const inflate = (p: Paths64, d: number) => offset(p, d * 2, EndType.Round);
  for (const cell of reach) {
    const cx0 = (cell % N) * CELL, cz0 = ((cell / N) | 0) * CELL;
    const st = new Paths64(), av = new Paths64();
    let key = '';
    for (const g of segs) {
      if (g.x1 < cx0 - M || g.x0 > cx0 + CELL + M || g.z1 < cz0 - M || g.z0 > cz0 + CELL + M) continue;
      (g.t === 2 ? av : st).push(g.path);
      key += g.key;
    }
    const pAll = new Paths64(), pAv = new Paths64();
    for (const g of patches) {
      if (g.x1 < cx0 - 1 || g.x0 > cx0 + CELL + 1 || g.z1 < cz0 - 1 || g.z0 > cz0 + CELL + 1) continue;
      pAll.push(g.path);
      if (g.av) pAv.push(g.path);
      key += g.key;
    }
    if (!st.length && !av.length) continue;
    // Unchanged surroundings: reuse last time's piece (most edits touch a few cells).
    const hit = pieceCache.get(cell);
    if (hit && hit.key === key) { pieces.push(hit.piece); fresh.set(cell, hit); continue; }
    const box = new Paths64();
    box.push(Clipper.makePath([cx0 * S, cz0 * S, (cx0 + CELL) * S, cz0 * S, (cx0 + CELL) * S, (cz0 + CELL) * S, cx0 * S, (cz0 + CELL) * S]));
    const U = (a: Paths64, b: Paths64) => Clipper.Union(a, b, FillRule.NonZero);
    const avA = U(inflate(av, HALF_WIDTH[2]), pAv);
    const allA = U(U(inflate(st, HALF_WIDTH[1]), inflate(av, HALF_WIDTH[2])), pAll);
    const outer = U(U(inflate(st, HALF_WIDTH[1] + KERB_W[1]), inflate(av, HALF_WIDTH[2] + KERB_W[2])), allA);
    const cut = (p: Paths64) => [...Clipper.Intersect(p, box, FillRule.NonZero)].filter((r) => r.length >= 3);
    const piece = {
      cell,
      street: cut(Clipper.Difference(allA, avA, FillRule.NonZero)),
      avenue: cut(avA),
      pavement: cut(Clipper.Difference(outer, allA, FillRule.NonZero)),
    };
    pieces.push(piece);
    fresh.set(cell, { key, piece });
  }
  pieceCache = fresh;

  const junctions: PolyRoads['junctions'] = [];
  degree.forEach((d, i) => { if (d >= 3) { const p = owned[i] ? { x: ci.px[i], z: ci.pz[i] } : centre(i); junctions.push({ x: p.x, z: p.z, r: HALF_WIDTH[2] + 3.5 }); } });
  return { cells, owned, pieces, lines, junctions };
}

/** Split Clipper's flat ring list into outer rings with their holes, as THREE vectors in metres. */
export function shapes(rings: Path64[]): { outer: THREE.Vector2[]; holes: THREE.Vector2[][] }[] {
  const v = (r: Path64) => r.map((p) => new THREE.Vector2(p.x / S, p.y / S));
  rings = rings.filter((r) => r && r.length >= 3);
  const outers = rings.filter((r) => Clipper.isPositive(r));
  const holes = rings.filter((r) => !Clipper.isPositive(r));
  const out = outers.map((r) => ({ ring: r, outer: v(r), holes: [] as THREE.Vector2[][] }));
  for (const h of holes) {
    // The smallest outer ring that contains the hole's first point.
    let best: (typeof out)[number] | null = null, area = Infinity;
    for (const o of out) {
      if (Clipper.pointInPolygon(h[0] as Point64, o.ring) === PointInPolygonResult.IsOutside) continue;
      const a = Math.abs(Clipper.area(o.ring));
      if (a < area) { area = a; best = o; }
    }
    best?.holes.push(v(h));
  }
  return out.map(({ outer, holes: hs }) => ({ outer, holes: hs }));
}
