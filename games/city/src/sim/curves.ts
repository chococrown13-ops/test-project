import { CELL, Ground, KINDS, N, Road } from './defs';
import { NN } from './graph';
import type { World } from './world';

/**
 * Curved roads. A curve is a quadratic Bézier from the centre of cell A to
 * the centre of cell B, bent toward a control point, all in metres. The
 * simulation still runs on the cell grid: a curve is rasterised into a chain
 * of road cells (with diagonal links where the chain steps corner to corner),
 * so traffic, zoning and transit work on it unchanged. The curve itself is
 * kept for what the grid can't say: where the asphalt really runs, which way
 * the buildings beside it face, and the smooth line cars follow.
 */
export interface Curve {
  ax: number; az: number;
  cx: number; cz: number;
  bx: number; bz: number;
  t: Road;
  /** Every cell of the chain, A to B. */
  cells: number[];
  /** Cells the curve laid itself (not crossings or ends on older roads): drawn as a ribbon. */
  own: number[];
}

/** Asphalt half width and pavement width, the same as a grid road's so the two meet flush. */
export const HALF_WIDTH = { [Road.Street]: 3, [Road.Avenue]: 4 } as const;
export const KERB_W = { [Road.Street]: 2, [Road.Avenue]: 1 } as const;

export function bez(c: Pick<Curve, 'ax' | 'az' | 'cx' | 'cz' | 'bx' | 'bz'>, u: number) {
  const v = 1 - u;
  return { x: v * v * c.ax + 2 * v * u * c.cx + u * u * c.bx, z: v * v * c.az + 2 * v * u * c.cz + u * u * c.bz };
}

/** Unit tangent at u. */
export function bezTan(c: Pick<Curve, 'ax' | 'az' | 'cx' | 'cz' | 'bx' | 'bz'>, u: number) {
  let x = 2 * (1 - u) * (c.cx - c.ax) + 2 * u * (c.bx - c.cx);
  let z = 2 * (1 - u) * (c.cz - c.az) + 2 * u * (c.bz - c.cz);
  const l = Math.hypot(x, z);
  if (l < 1e-6) { x = c.bx - c.ax; z = c.bz - c.az; }
  const m = Math.hypot(x, z) || 1;
  return { x: x / m, z: z / m };
}

export function bezLength(c: Pick<Curve, 'ax' | 'az' | 'cx' | 'cz' | 'bx' | 'bz'>): number {
  let len = 0, p = bez(c, 0);
  for (let k = 1; k <= 32; k++) { const q = bez(c, k / 32); len += Math.hypot(q.x - p.x, q.z - p.z); p = q; }
  return len;
}

const cellAt = (x: number, z: number) => {
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  return cx < 0 || cz < 0 || cx >= N || cz >= N ? -1 : cz * N + cx;
};

/**
 * The chain of cells a curve runs through, A to B. A step that would cut a
 * corner orthogonally (east, then south) becomes one diagonal step when the
 * curve passes nearer that diagonal, so a 45° bend is a clean diagonal road
 * rather than a staircase.
 */
export function curveCells(c: Pick<Curve, 'ax' | 'az' | 'cx' | 'cz' | 'bx' | 'bz'>): number[] {
  const len = bezLength(c);
  const steps = Math.max(2, Math.ceil(len / 0.5));
  const out: number[] = [];
  for (let k = 0; k <= steps; k++) {
    const p = bez(c, k / steps);
    const i = cellAt(p.x, p.z);
    if (i < 0) continue;
    if (out[out.length - 1] !== i) out.push(i);
  }
  // Collapse staircases: a, b, c where a and c touch corner to corner.
  for (let k = 1; k < out.length - 1; k++) {
    const a = out[k - 1], m = out[k], b = out[k + 1];
    const dx = (b % N) - (a % N), dy = ((b / N) | 0) - ((a / N) | 0);
    if (Math.abs(dx) !== 1 || Math.abs(dy) !== 1) continue;
    // Keep the corner cell when the curve runs through the middle of it.
    const mx = (m % N) * CELL + CELL / 2, mz = ((m / N) | 0) * CELL + CELL / 2;
    if (distTo(c, mx, mz).d < CELL * 0.3) continue;
    out.splice(k, 1);
  }
  return out;
}

/** Nearest point on the curve to (x, z): distance, parameter, point and tangent. */
export function distTo(c: Pick<Curve, 'ax' | 'az' | 'cx' | 'cz' | 'bx' | 'bz'>, x: number, z: number) {
  let best = Infinity, bu = 0;
  for (let k = 0; k <= 24; k++) {
    const p = bez(c, k / 24);
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < best) { best = d; bu = k / 24; }
  }
  // Refine by bisection-like narrowing around the best sample.
  let lo = Math.max(0, bu - 1 / 24), hi = Math.min(1, bu + 1 / 24);
  for (let it = 0; it < 12; it++) {
    const u1 = lo + (hi - lo) / 3, u2 = hi - (hi - lo) / 3;
    const p1 = bez(c, u1), p2 = bez(c, u2);
    if ((p1.x - x) ** 2 + (p1.z - z) ** 2 < (p2.x - x) ** 2 + (p2.z - z) ** 2) hi = u2; else lo = u1;
  }
  const u = (lo + hi) / 2, p = bez(c, u);
  return { d: Math.hypot(p.x - x, p.z - z), u, x: p.x, z: p.z, tan: bezTan(c, u) };
}

export interface CurveInfo {
  /** 1 where a curve's own ribbon replaces the grid road drawing. */
  owned: Uint8Array;
  /** 1 where the asphalt or pavement of a curve covers a lot: no zoning there. */
  cover: Uint8Array;
  /** Where cars drive through an owned cell: the curve's point nearest its centre. */
  px: Float32Array;
  pz: Float32Array;
}

let cacheW: World | null = null, cacheVer = -1, cacheN = -1, cache: CurveInfo | null = null;

/** Derived per-cell facts about the curves, rebuilt when the roads change. */
export function curveInfo(w: World): CurveInfo {
  if (cache && cacheW === w && cacheVer === w.ver.roads && cacheN === w.curves.length) return cache;
  const owned = new Uint8Array(NN), cover = new Uint8Array(NN);
  const px = new Float32Array(NN), pz = new Float32Array(NN);
  for (const c of w.curves) {
    for (const i of c.own) {
      owned[i] = 1;
      const p = distTo(c, (i % N) * CELL + CELL / 2, ((i / N) | 0) * CELL + CELL / 2);
      px[i] = p.x; pz[i] = p.z;
    }
    for (const i of coverCells(c)) if (!w.road[i]) cover[i] = 1;
  }
  cacheW = w; cacheVer = w.ver.roads; cacheN = w.curves.length; cache = { owned, cover, px, pz };
  return cache;
}

/** Lots whose middle lies on the curve's asphalt or pavement. */
export function coverCells(c: Curve | (Pick<Curve, 'ax' | 'az' | 'cx' | 'cz' | 'bx' | 'bz' | 't'>)): number[] {
  const reach = HALF_WIDTH[c.t as 1 | 2] + KERB_W[c.t as 1 | 2] + 1.2;
  const x0 = Math.max(0, Math.floor((Math.min(c.ax, c.bx, c.cx) - reach) / CELL)), x1 = Math.min(N - 1, Math.floor((Math.max(c.ax, c.bx, c.cx) + reach) / CELL));
  const z0 = Math.max(0, Math.floor((Math.min(c.az, c.bz, c.cz) - reach) / CELL)), z1 = Math.min(N - 1, Math.floor((Math.max(c.az, c.bz, c.cz) + reach) / CELL));
  const out: number[] = [];
  for (let y = z0; y <= z1; y++) for (let x = x0; x <= x1; x++) {
    if (distTo(c, x * CELL + CELL / 2, y * CELL + CELL / 2).d < reach) out.push(y * N + x);
  }
  return out;
}

/** The nearest curve to a point within `max` metres, if any. */
export function nearestCurve(w: World, x: number, z: number, max: number) {
  let best: { c: Curve; d: number; x: number; z: number; tan: { x: number; z: number } } | null = null;
  for (const c of w.curves) {
    if (x < Math.min(c.ax, c.bx, c.cx) - max || x > Math.max(c.ax, c.bx, c.cx) + max) continue;
    if (z < Math.min(c.az, c.bz, c.cz) - max || z > Math.max(c.az, c.bz, c.cz) + max) continue;
    const p = distTo(c, x, z);
    if (p.d < max && (!best || p.d < best.d)) best = { c, d: p.d, x: p.x, z: p.z, tan: p.tan };
  }
  return best;
}

/** Why a curve can't run here (beyond what placeRoad checks), or null. */
export function curveProblem(w: World, c: Pick<Curve, 'ax' | 'az' | 'cx' | 'cz' | 'bx' | 'bz' | 't'>, cells: number[]): string | null {
  if (cells.length < 3) return '곡선 도로는 세 칸 이상 떨어진 두 점을 이어야 해요.';
  const len = bezLength(c), chord = Math.hypot(c.bx - c.ax, c.bz - c.az);
  if (len > chord * 1.9) return '너무 심하게 휘었어요. 굽힘을 줄여 주세요.';
  for (const i of coverCells(c)) {
    if (cells.includes(i)) continue;
    const id = w.bld[i];
    if (id >= 0 && !KINDS[w.buildings.get(id)!.kind].zone) return '곡선 도로가 시설물과 겹쳐요.';
    if (w.ground[i] === Ground.Mountain && !w.road[i]) return '곡선 도로가 산에 걸려요.';
  }
  return null;
}

/** Curves stay only while every cell of their chain is still a road. */
export function pruneCurves(w: World) {
  const keep = w.curves.filter((c) => c.cells.every((i) => w.road[i]));
  if (keep.length !== w.curves.length) w.curves = keep;
}

/**
 * Which way a road runs out of a dead-end cell, pointing onward (away from
 * the road it ends): the tangent of a curve ending there, or the step from
 * its single neighbour. Null when the cell is not a road end.
 */
export function endDirection(w: World, cell: number): { x: number; z: number } | null {
  for (const c of w.curves) {
    if (c.cells[c.cells.length - 1] === cell) return bezTan(c, 1);
    if (c.cells[0] === cell) { const t = bezTan(c, 0); return { x: -t.x, z: -t.z }; }
  }
  if (!w.road[cell]) return null;
  const x = cell % N, y = (cell / N) | 0;
  const nb: [number, number][] = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < N && ny < N && w.road[ny * N + nx]) nb.push([dx, dy]);
  }
  for (const [dx, dy, bit] of [[1, -1, 1], [1, 1, 2], [-1, 1, 4], [-1, -1, 8]]) if (w.diag[cell] & bit) nb.push([dx, dy]);
  if (nb.length !== 1) return null;
  const l = Math.hypot(nb[0][0], nb[0][1]);
  return { x: -nb[0][0] / l, z: -nb[0][1] / l };
}

/**
 * Where the bend handle lands: on the line straight ahead of a road end, so
 * the new curve leaves it smoothly; where two such lines meet when near; or
 * the middle for a straight road at any angle.
 */
export function snapControl(w: World, a: number, b: number, x: number, z: number): { x: number; z: number; snap: '' | 'straight' | 'tangent' } {
  const P = (i: number) => ({ x: (i % N) * CELL + CELL / 2, z: ((i / N) | 0) * CELL + CELL / 2 });
  const A = P(a), B = P(b);
  const da = endDirection(w, a), db = endDirection(w, b);
  const ray = (o: { x: number; z: number }, d: { x: number; z: number } | null) => {
    if (!d) return null;
    const t = (x - o.x) * d.x + (z - o.z) * d.z;
    if (t <= 0) return null;
    const px = o.x + d.x * t, pz = o.z + d.z * t;
    return { x: px, z: pz, off: Math.hypot(x - px, z - pz) };
  };
  if (da && db) {
    // Where the two onward lines cross: a bend that leaves both ends smoothly.
    const den = da.x * db.z - da.z * db.x;
    if (Math.abs(den) > 0.05) {
      const t = ((B.x - A.x) * db.z - (B.z - A.z) * db.x) / den;
      const s = ((B.x - A.x) * da.z - (B.z - A.z) * da.x) / den;
      const ix = A.x + da.x * t, iz = A.z + da.z * t;
      if (t > 0 && s > 0 && Math.hypot(ix - x, iz - z) < 14) return { x: ix, z: iz, snap: 'tangent' };
    }
  }
  const ra = ray(A, da), rb = ray(B, db);
  const best = [ra, rb].filter((r) => r && r.off < 6).sort((p, q) => p!.off - q!.off)[0];
  if (best) return { x: best.x, z: best.z, snap: 'tangent' };
  const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2;
  const L = Math.hypot(B.x - A.x, B.z - A.z) || 1;
  const off = Math.abs(((x - A.x) * (B.z - A.z) - (z - A.z) * (B.x - A.x)) / L);
  if (off < 4) return { x: mx, z: mz, snap: 'straight' };
  return { x, z, snap: '' };
}
