import { CELL, Ground, KINDS, N, Road, Zone } from './defs';
import { curveInfo, curvePath, HALF_WIDTH, KERB_W, type Curve } from './curves';
import { forEachNeighbour, NN } from './graph';
import type { World } from './world';
import { nearestOnPath, pathAt, pathCrossings, pathLength, type Path, type V } from '../../../shared/roads/geom';

/**
 * 회전교차로 (roundabouts), and the rule that makes them matter: roads may
 * not meet at a shallow angle (the junction would be a long sliver of
 * asphalt), except on a roundabout, where every road joins the ring instead.
 *
 * A roundabout sits on a road cell. The simulation still routes through its
 * cells as before; the ring, the island and cars circling it are drawn.
 */

export interface Roundabout { cell: number; t: Road }

/** Centreline radius of the ring, metres. */
export const RING_R: Record<number, number> = { [Road.Street]: 13, [Road.Avenue]: 17 };
/** Price of a roundabout, 만 원. */
export const ROUNDABOUT_COST: Record<number, number> = { [Road.Street]: 500, [Road.Avenue]: 1100 };
/** Roads meeting at less than this many degrees need a roundabout. */
export const MIN_MEET_DEG = 30;

export function ringOf(rb: Roundabout) {
  const t = rb.t as 1 | 2;
  const x = (rb.cell % N) * CELL + CELL / 2, z = ((rb.cell / N) | 0) * CELL + CELL / 2;
  const rc = RING_R[t], half = HALF_WIDTH[t], kerb = KERB_W[t];
  return { x, z, rc, half, kerb, outer: rc + half + kerb, island: rc - half };
}

/** The roundabout whose ring (out to its pavement, plus `pad` metres) covers this point. */
export function roundaboutAt(w: World, x: number, z: number, pad = 0): Roundabout | null {
  for (const rb of w.roundabouts) {
    const g = ringOf(rb);
    if (Math.hypot(x - g.x, z - g.z) <= g.outer + pad) return rb;
  }
  return null;
}

/** Lots the ring, its pavement or its island reach into: cleared and left unzoned. */
export function roundaboutCells(rb: Roundabout | { cell: number; t: Road }): number[] {
  const g = ringOf(rb), out: number[] = [];
  const r = Math.ceil(g.outer / CELL) + 1, cx = rb.cell % N, cy = (rb.cell / N) | 0;
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if (x < 0 || y < 0 || x >= N || y >= N) continue;
    // Nearest point of the lot to the centre.
    const nx = Math.max(x * CELL, Math.min((x + 1) * CELL, g.x)), nz = Math.max(y * CELL, Math.min((y + 1) * CELL, g.z));
    if (Math.hypot(nx - g.x, nz - g.z) < g.outer) out.push(y * N + x);
  }
  return out;
}

/** The size a roundabout on this cell would take: an avenue's if one runs into it. */
export function roundaboutType(w: World, cell: number): Road {
  let t = w.road[cell] === Road.Avenue ? Road.Avenue : Road.Street;
  forEachNeighbour(w, cell, (n) => { if (n < NN && w.road[n] === Road.Avenue) t = Road.Avenue; });
  return t;
}

export function roundaboutProblem(w: World, cell: number): string | null {
  if (cell < 0 || cell >= NN) return '지도 밖이에요.';
  if (!w.road[cell]) return '회전교차로는 도로 위에 놓아 주세요. 교차로 한가운데가 좋아요.';
  if (w.ground[cell] !== Ground.Land) return '다리 위에는 놓을 수 없어요.';
  if (w.roundabouts.some((r) => r.cell === cell)) return '이미 회전교차로가 있어요.';
  const rb = { cell, t: roundaboutType(w, cell) }, g = ringOf(rb);
  for (const o of w.roundabouts) {
    const h = ringOf(o);
    if (Math.hypot(g.x - h.x, g.z - h.z) < g.outer + h.outer + 4) return '다른 회전교차로와 너무 가까워요.';
  }
  const stops = new Set(w.lines.filter((l) => l.kind === 'bus').flatMap((l) => l.stops));
  for (const i of roundaboutCells(rb)) {
    if (stops.has(i) && w.road[i]) return '버스 정류장이 걸려요. 정류장을 옮긴 뒤 놓아 주세요.';
    if (w.ground[i] === Ground.Water) return '물에 걸려요.';
    if (w.ground[i] === Ground.Mountain) return '산에 걸려요.';
    if (w.roadAlt[i]) return '고가도로나 지하도로와 겹쳐요.';
    const id = w.bld[i];
    if (id >= 0 && !KINDS[w.buildings.get(id)!.kind].zone) return '시설물과 겹쳐요.';
  }
  const cost = ROUNDABOUT_COST[rb.t];
  if (cost > w.money) return `예산이 부족해요. (${cost.toLocaleString('ko-KR')}만 원 필요)`;
  return null;
}

export function placeRoundabout(w: World, cell: number, demolish: (w: World, id: number) => void): string | null {
  const why = roundaboutProblem(w, cell);
  if (why) return why;
  const rb = { cell, t: roundaboutType(w, cell) };
  w.money -= ROUNDABOUT_COST[rb.t];
  for (const i of roundaboutCells(rb)) {
    if (w.road[i]) continue;
    const id = w.bld[i];
    if (id >= 0 && KINDS[w.buildings.get(id)!.kind].zone) demolish(w, id);
    w.zone[i] = Zone.None;
  }
  w.roundabouts.push(rb);
  w.ver.roads++;
  w.ver.zones++;
  return null;
}

/** Roundabouts stay only while their centre is still a road. */
export function pruneRoundabouts(w: World) {
  const keep = w.roundabouts.filter((r) => w.road[r.cell]);
  if (keep.length !== w.roundabouts.length) w.roundabouts = keep;
}

/* ------------------------------------------------ shallow meetings */

const centre = (i: number): V => ({ x: (i % N) * CELL + CELL / 2, z: ((i / N) | 0) * CELL + CELL / 2 });
const unit = (v: V): V => { const l = Math.hypot(v.x, v.z) || 1; return { x: v.x / l, z: v.z / l }; };
const neg = (v: V): V => ({ x: -v.x, z: -v.z });
const deg = (a: V, b: V) => (Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.z * b.z))) * 180) / Math.PI;

/**
 * Where roads meet, every pair of arms (the directions roads leave the
 * meeting point in) must be at least MIN_MEET_DEG apart, new road against
 * old. Returns the narrowest angle found below that, or null.
 */
function narrowest(meets: { p: V; fresh: V[]; old: V[] }[], w: World): number | null {
  let worst: number | null = null;
  for (const m of meets) {
    // Near a roundabout the roads meet its ring instead (a cell's grace for roads the grid lays alongside).
    if (!m.fresh.length || !m.old.length || roundaboutAt(w, m.p.x, m.p.z, CELL)) continue;
    for (const a of m.fresh) for (const b of m.old) {
      const d = deg(a, b);
      if (d < MIN_MEET_DEG && (worst === null || d < worst)) worst = d;
    }
  }
  return worst;
}

const message = (d: number) => `도로가 너무 비스듬히 만나요 (${Math.round(d)}°). ${MIN_MEET_DEG}° 이상으로 만나게 하거나, 회전교차로를 먼저 놓고 그 위로 지나가게 하세요.`;

/** Arms of an existing curve at distance t along it: both ways, or only inward at its ends. */
function curveArms(p: Path, t: number): V[] {
  const L = pathLength(p), d = pathAt(p, t).d;
  if (t < 2) return [d];
  if (t > L - 2) return [neg(d)];
  return [d, neg(d)];
}

/** A new curve (or free straight) against everything already built. */
export function curveMeetProblem(w: World, path: Path, cells: number[]): string | null {
  const L = pathLength(path);
  const meets: { p: V; fresh: V[]; old: V[] }[] = [];
  const freshAt = (t: number): V[] => curveArms(path, t);
  const chain = curveInfo(w).chain;
  // Against curves: their crossings, and either road ending on the other.
  for (const c of w.curves as Curve[]) {
    const q = curvePath(c).path, Lq = pathLength(q);
    const seen: number[] = [];
    for (const x of pathCrossings(path, q)) { meets.push({ p: x.p, fresh: freshAt(x.ta), old: curveArms(q, x.tb) }); seen.push(x.ta); }
    const reach = HALF_WIDTH[c.t as 1 | 2] + 2;
    for (const t of [0, L]) {
      if (seen.some((s) => Math.abs(s - t) < 6)) continue;
      const e = pathAt(path, t).p, n = nearestOnPath(q, e);
      if (n.d < reach) meets.push({ p: n.p, fresh: freshAt(t), old: curveArms(q, n.t) });
    }
    for (const t of [0, Lq]) {
      const e = pathAt(q, t).p, n = nearestOnPath(path, e);
      if (n.d < reach && !seen.some((s) => Math.abs(s - n.t) < 6)) meets.push({ p: n.p, fresh: freshAt(n.t), old: curveArms(q, t) });
    }
  }
  // Against grid roads it passes through or ends on: their links out of that cell.
  cells.forEach((i, k) => {
    if (!w.road[i] || chain[i]) return;
    const old: V[] = [];
    const o = centre(i);
    forEachNeighbour(w, i, (n) => { if (n < NN && w.road[n]) { const p = centre(n); old.push(unit({ x: p.x - o.x, z: p.z - o.z })); } });
    const t = k === 0 ? 0 : k === cells.length - 1 ? L : nearestOnPath(path, o).t;
    meets.push({ p: o, fresh: freshAt(t), old });
  });
  const d = narrowest(meets, w);
  return d === null ? null : message(d);
}

/** A new grid or diagonal road (a run of cells) against the curves it meets. */
export function gridMeetProblem(w: World, cells: number[]): string | null {
  if (!w.curves.length) return null;
  const chain = curveInfo(w).chain;
  const meets: { p: V; fresh: V[]; old: V[] }[] = [];
  cells.forEach((i, k) => {
    if (!chain[i]) return;
    const o = centre(i), fresh: V[] = [];
    for (const n of [cells[k - 1], cells[k + 1]]) if (n !== undefined) { const p = centre(n); fresh.push(unit({ x: p.x - o.x, z: p.z - o.z })); }
    for (const c of w.curves) {
      if (!c.cells.includes(i)) continue;
      const q = curvePath(c).path, n = nearestOnPath(q, o);
      meets.push({ p: n.p, fresh, old: curveArms(q, n.t) });
    }
  });
  const d = narrowest(meets, w);
  return d === null ? null : message(d);
}
