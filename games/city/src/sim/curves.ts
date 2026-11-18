import { CELL, Ground, KINDS, N, Road } from './defs';
// Not imported from graph.ts: graph.ts asks this module which links are real.
const NN = N * N;
import type { World } from './world';
import { curveMeetProblem, MIN_MEET_DEG, roundaboutCells } from './roundabout';
import { fillet, minRadius, nearestOnPath, pathAt, pathLength, type Path } from '../../../shared/roads/geom';

/**
 * Curved roads. A curve runs from the centre of cell A toward a bend point
 * C, then on to the centre of cell B; the corner at C is rounded by the
 * largest circular arc that fits (straight, arc, straight). It used to be a
 * quadratic Bézier with C as its control point: C is still where the two
 * end directions meet, so curves in older saves keep their ends and simply
 * take the cleaner shape. An arc, unlike a Bézier, widens into an arc, so the
 * road's kerbs stay exactly parallel on any bend. The
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
/**
 * Asphalt half width and pavement width. Streets fit their 10 m cell: 7 m
 * of asphalt (two 3.5 m lanes) and 1.5 m pavements. Avenues are wider than a
 * cell: 10 m of asphalt (four lanes) and the same 1.5 m pavements, spilling
 * 1.5 m into the lots either side (buildings there stand back to make room).
 */
export const HALF_WIDTH = { [Road.Street]: 3.5, [Road.Avenue]: 5 } as const;
export const KERB_W = { [Road.Street]: 1.5, [Road.Avenue]: 1.5 } as const;
/** How far an avenue's pavement reaches past its own cell. */
export const AVENUE_SPILL = HALF_WIDTH[Road.Avenue] + KERB_W[Road.Avenue] - 5;

type Ends = Pick<Curve, 'ax' | 'az' | 'cx' | 'cz' | 'bx' | 'bz'>;
const pathCache = new Map<string, { path: Path; len: number }>();
/** The curve's centreline as lines and an arc (cached by its three points). */
export function curvePath(c: Ends): { path: Path; len: number } {
  const key = `${c.ax},${c.az},${c.cx},${c.cz},${c.bx},${c.bz}`;
  let hit = pathCache.get(key);
  if (!hit) {
    const path = fillet({ x: c.ax, z: c.az }, { x: c.cx, z: c.cz }, { x: c.bx, z: c.bz });
    hit = { path, len: pathLength(path) };
    if (pathCache.size > 512) pathCache.clear();
    pathCache.set(key, hit);
  }
  return hit;
}

/** Point at fraction u (0..1) of the way along the curve, by distance. */
export function bez(c: Ends, u: number) {
  const { path, len } = curvePath(c);
  return pathAt(path, Math.max(0, Math.min(1, u)) * len).p;
}

/** Unit tangent at u. */
export function bezTan(c: Ends, u: number) {
  const { path, len } = curvePath(c);
  return pathAt(path, Math.max(0, Math.min(1, u)) * len).d;
}

export function bezLength(c: Ends): number { return curvePath(c).len; }

/** Tightest bend each road type takes: wide enough that the inner kerb never folds over. */
export const MIN_RADIUS = { [Road.Street]: 12, [Road.Avenue]: 18 } as const;

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
  /**
   * Links that touch a curve's own cells and are real road: consecutive cells
   * of a chain, and one link per road that meets the curve from the side (to
   * its nearest chain cell). A road that merely brushes past touches several
   * chain cells; only that nearest one joins, so no phantom shortcuts.
   */
  links: Set<string>;
  /** 1 on every cell of any curve's chain, ends and crossings included. */
  chain: Uint8Array;
}

const lk = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

/** Whether the ground link a-b is a road (see CurveInfo.links); links away from curves always are. */
export function curveLinkOk(w: World, a: number, b: number): boolean {
  if (!w.curves.length) return true;
  const ci = curveInfo(w);
  if (!ci.owned[a] && !ci.owned[b]) return true;
  return ci.links.has(lk(a, b));
}

let cacheW: World | null = null, cacheVer = -1, cacheN = -1, cache: CurveInfo | null = null;

/** Derived per-cell facts about the curves, rebuilt when the roads change. */
export function curveInfo(w: World): CurveInfo {
  if (cache && cacheW === w && cacheVer === w.ver.roads && cacheN === w.curves.length + w.roundabouts.length * 1000) return cache;
  const owned = new Uint8Array(NN), cover = new Uint8Array(NN);
  const px = new Float32Array(NN), pz = new Float32Array(NN);
  const links = new Set<string>();
  const chain = new Uint8Array(NN);
  for (const c of w.curves) {
    for (const i of c.cells) chain[i] = 1;
    for (const i of c.own) {
      owned[i] = 1;
      const p = distTo(c, (i % N) * CELL + CELL / 2, ((i / N) | 0) * CELL + CELL / 2);
      px[i] = p.x; pz[i] = p.z;
    }
    for (const i of coverCells(c)) if (!w.road[i]) cover[i] = 1;
    for (let k = 1; k < c.cells.length; k++) links.add(lk(c.cells[k - 1], c.cells[k]));
  }
  for (const rb of w.roundabouts) for (const i of roundaboutCells(rb)) if (!w.road[i]) cover[i] = 1;
  // Roads meeting a curve from the side: a road that ends beside it joins at its nearest chain cell
  // (unless it runs alongside, within the shallowest meeting angle). Roads that only pass by stay apart.
  const parallel = (j: number, d: { x: number; z: number }) => {
    const x = j % N, y = (j / N) | 0;
    let n = 0, along = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const k = ny * N + nx;
      if (!w.road[k] || owned[k]) continue;
      n++;
      if (Math.abs(dx * d.x + dy * d.z) > Math.cos((MIN_MEET_DEG * Math.PI) / 180)) along++;
    }
    // A road running past (straight on, or a junction) never joins sideways: only one that ends here does.
    return n > 1 || (n > 0 && along === n);
  };
  for (const c of w.curves) {
    const chain = new Set(c.cells);
    const path = curvePath(c).path;
    const best = new Map<number, { i: number; d: number }>();
    for (const i of c.own) {
      const x = i % N, y = (i / N) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const j = ny * N + nx;
        if (!w.road[j] || chain.has(j) || owned[j]) continue;
        const d = Math.hypot(nx * CELL + CELL / 2 - px[i], ny * CELL + CELL / 2 - pz[i]);
        const b = best.get(j);
        if (!b || d < b.d) best.set(j, { i, d });
      }
    }
    best.forEach(({ i }, j) => {
      const q = nearestOnPath(path, { x: px[i], z: pz[i] });
      if (!parallel(j, pathAt(path, q.t).d)) links.add(lk(i, j));
    });
  }
  cacheW = w; cacheVer = w.ver.roads; cacheN = w.curves.length + w.roundabouts.length * 1000; cache = { owned, cover, px, pz, links, chain };
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
  if (cells.length < 3) return '세 칸 이상 떨어진 두 점을 이어 주세요.';
  const len = bezLength(c), chord = Math.hypot(c.bx - c.ax, c.bz - c.az);
  if (len > chord * 1.9) return '너무 심하게 휘었어요. 굽힘을 줄여 주세요.';
  // One curve turns at most 150°: a U-turn is two curves (or a block round).
  const d1 = { x: c.cx - c.ax, z: c.cz - c.az }, d2 = { x: c.bx - c.cx, z: c.bz - c.cz };
  const turn = Math.abs(Math.atan2(d1.x * d2.z - d1.z * d2.x, d1.x * d2.x + d1.z * d2.z));
  if (turn > (150 * Math.PI) / 180) return '한 번에 너무 많이 돌아요. 곡선 두 개로 나눠 주세요.';
  const r = minRadius(curvePath(c).path), need = MIN_RADIUS[c.t as 1 | 2] ?? 12;
  if (r < need) return `커브가 너무 급해요 (반지름 ${Math.round(r)}m, ${need}m 이상 필요). 꺾는 점을 더 멀리 두세요.`;
  for (const i of coverCells(c)) {
    if (cells.includes(i)) continue;
    const id = w.bld[i];
    if (id >= 0 && !KINDS[w.buildings.get(id)!.kind].zone) return '곡선 도로가 시설물과 겹쳐요.';
    if (w.ground[i] === Ground.Mountain && !w.road[i]) return '곡선 도로가 산에 걸려요.';
  }
  return curveMeetProblem(w, curvePath(c).path, cells);
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
