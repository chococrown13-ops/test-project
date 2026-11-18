/**
 * Road centrelines made only of straight lines and circular arcs.
 *
 * Why not Bézier curves: the offset of a Bézier is not a Bézier, so the two
 * edges of a road drawn from one drift apart and fold over on tight bends.
 * An arc offset by any distance is another arc with the same centre, so
 * kerbs, lanes and pavements stay exactly parallel however tight the bend.
 * (After Sandbox Spirit's "simple geometry of roads".)
 *
 * Coordinates are metres on the ground plane: x east, z south.
 */

export interface V { x: number; z: number }
export const v = (x: number, z: number): V => ({ x, z });
export const add = (a: V, b: V): V => ({ x: a.x + b.x, z: a.z + b.z });
export const sub = (a: V, b: V): V => ({ x: a.x - b.x, z: a.z - b.z });
export const mul = (a: V, k: number): V => ({ x: a.x * k, z: a.z * k });
export const len = (a: V) => Math.hypot(a.x, a.z);
export const dist = (a: V, b: V) => Math.hypot(a.x - b.x, a.z - b.z);
export const norm = (a: V): V => { const l = len(a) || 1; return { x: a.x / l, z: a.z / l }; };
export const dot = (a: V, b: V) => a.x * b.x + a.z * b.z;
/** z-component of the 2-D cross product: > 0 when b turns left of a... in x-east/z-south that's clockwise on screen. */
export const cross = (a: V, b: V) => a.x * b.z - a.z * b.x;
/** Left-hand normal of a direction (rotate 90°). */
export const left = (d: V): V => ({ x: d.z, z: -d.x });

export interface Line { kind: 'line'; a: V; b: V }
/** An arc around `c` of radius `r`, from angle `a0` sweeping `sweep` radians (signed). */
export interface Arc { kind: 'arc'; c: V; r: number; a0: number; sweep: number }
export type Seg = Line | Arc;

export function segLength(s: Seg): number {
  return s.kind === 'line' ? dist(s.a, s.b) : Math.abs(s.sweep) * s.r;
}

/** Point and unit tangent at distance `t` along a segment. */
export function segAt(s: Seg, t: number): { p: V; d: V } {
  if (s.kind === 'line') {
    const L = dist(s.a, s.b) || 1, d = norm(sub(s.b, s.a));
    return { p: add(s.a, mul(d, Math.max(0, Math.min(L, t)))), d };
  }
  const ang = s.a0 + Math.sign(s.sweep) * (t / s.r);
  const p = v(s.c.x + Math.cos(ang) * s.r, s.c.z + Math.sin(ang) * s.r);
  // Tangent: derivative of (cos, sin) times the sweep direction.
  const sg = Math.sign(s.sweep) || 1;
  const d = v(-Math.sin(ang) * sg, Math.cos(ang) * sg);
  return { p, d };
}

/** A path is a chain of segments end to end. */
export type Path = Seg[];

export const pathLength = (p: Path) => p.reduce((a, s) => a + segLength(s), 0);

export function pathAt(p: Path, t: number): { p: V; d: V } {
  let rest = Math.max(0, t);
  for (let i = 0; i < p.length; i++) {
    const L = segLength(p[i]);
    if (rest <= L || i === p.length - 1) return segAt(p[i], Math.min(rest, L));
    rest -= L;
  }
  return { p: v(0, 0), d: v(1, 0) };
}

/**
 * Sample a path between distances t0 and t1: straight parts only at their
 * ends (or every `step` metres with `lines`), arcs every `step` metres (and at least every 6°). Offsets are exact:
 * the point at offset `o` is p + left(d) * o.
 */
export function samplePath(p: Path, t0 = 0, t1 = pathLength(p), step = 2, lines = false): { t: number; p: V; d: V }[] {
  const out: { t: number; p: V; d: V }[] = [];
  let base = 0;
  for (const s of p) {
    const L = segLength(s);
    const a = Math.max(t0, base), b = Math.min(t1, base + L);
    if (b > a || (b === a && out.length === 0 && a === t0)) {
      // Straight parts need only their ends, unless the road climbs along them (lines = true).
      const n = s.kind === 'line' ? (lines ? Math.max(1, Math.ceil((b - a) / step)) : 1) : Math.max(1, Math.ceil(Math.max((b - a) / step, Math.abs(s.sweep) * ((b - a) / L) / (Math.PI / 30))));
      for (let k = out.length && out[out.length - 1].t >= a - 1e-6 ? 1 : 0; k <= n; k++) {
        const t = a + ((b - a) * k) / n;
        const q = segAt(s, t - base);
        out.push({ t, p: q.p, d: q.d });
      }
    }
    base += L;
  }
  return out;
}

export const offsetPoint = (q: { p: V; d: V }, o: number) => add(q.p, mul(left(q.d), o));

/**
 * The road tool's curve: from A toward a bend point C, then on to B, with the
 * corner at C rounded by the largest arc that fits (line, arc, line). The
 * shorter leg is used up by the arc; the longer keeps a straight run.
 * Collinear points give one straight line.
 */
export function fillet(A: V, C: V, B: V): Path {
  const d1 = norm(sub(C, A)), d2 = norm(sub(B, C));
  const turn = Math.atan2(cross(d1, d2), dot(d1, d2));
  const l1 = dist(A, C), l2 = dist(C, B);
  if (Math.abs(turn) < 1e-3 || l1 < 1e-3 || l2 < 1e-3) return [{ kind: 'line', a: A, b: B }];
  // Tangent length L from C to where the arc meets each leg; r = L / tan(|turn|/2).
  const L = Math.min(l1, l2);
  const r = L / Math.tan(Math.abs(turn) / 2);
  const T1 = sub(C, mul(d1, L)), T2 = add(C, mul(d2, L));
  // Centre: from T1 along the normal on the inside of the turn.
  const inside = turn > 0 ? mul(left(d1), -1) : left(d1);
  // In x-east/z-south, a positive cross means a clockwise (right) turn on screen; the centre sits on that side.
  const c = add(T1, mul(inside, r));
  const a0 = Math.atan2(T1.z - c.z, T1.x - c.x);
  const a1 = Math.atan2(T2.z - c.z, T2.x - c.x);
  let sweep = a1 - a0;
  while (sweep > Math.PI) sweep -= Math.PI * 2;
  while (sweep < -Math.PI) sweep += Math.PI * 2;
  const out: Path = [];
  if (dist(A, T1) > 1e-3) out.push({ kind: 'line', a: A, b: T1 });
  out.push({ kind: 'arc', c, r, a0, sweep });
  if (dist(T2, B) > 1e-3) out.push({ kind: 'line', a: T2, b: B });
  return out;
}

/** Tightest arc in a path (Infinity for a straight one). */
export const minRadius = (p: Path) => p.reduce((m, s) => (s.kind === 'arc' ? Math.min(m, s.r) : m), Infinity);

/** Split a path at distance t into [before, after]. */
export function splitPath(p: Path, t: number): [Path, Path] {
  const a: Path = [], b: Path = [];
  let base = 0;
  for (const s of p) {
    const L = segLength(s);
    if (base + L <= t + 1e-9) a.push(s);
    else if (base >= t - 1e-9) b.push(s);
    else {
      const k = t - base;
      if (s.kind === 'line') {
        const m = segAt(s, k).p;
        a.push({ kind: 'line', a: s.a, b: m });
        b.push({ kind: 'line', a: m, b: s.b });
      } else {
        const sg = Math.sign(s.sweep), da = (k / s.r) * sg;
        a.push({ kind: 'arc', c: s.c, r: s.r, a0: s.a0, sweep: da });
        b.push({ kind: 'arc', c: s.c, r: s.r, a0: s.a0 + da, sweep: s.sweep - da });
      }
    }
    base += L;
  }
  return [a, b];
}

/** The same path run backwards. */
export function reversePath(p: Path): Path {
  return p.slice().reverse().map((s): Seg => s.kind === 'line'
    ? { kind: 'line', a: s.b, b: s.a }
    : { kind: 'arc', c: s.c, r: s.r, a0: s.a0 + s.sweep, sweep: -s.sweep });
}

/** Where two segments of polyline cross: parameters along each, or null. */
export function segCross(p1: V, p2: V, q1: V, q2: V): { s: number; u: number; p: V } | null {
  const r = sub(p2, p1), q = sub(q2, q1);
  const den = cross(r, q);
  if (Math.abs(den) < 1e-12) return null;
  const w = sub(q1, p1);
  const s = cross(w, q) / den, u = cross(w, r) / den;
  if (s < 0 || s > 1 || u < 0 || u > 1) return null;
  return { s, u, p: add(p1, mul(r, s)) };
}

/**
 * Every crossing of two paths, as distances along each (sampled finely;
 * good to a few centimetres, plenty for placing a junction).
 */
export function pathCrossings(a: Path, b: Path): { ta: number; tb: number; p: V }[] {
  const sa = samplePath(a, 0, pathLength(a), 1), sb = samplePath(b, 0, pathLength(b), 1);
  const out: { ta: number; tb: number; p: V }[] = [];
  for (let i = 1; i < sa.length; i++) for (let j = 1; j < sb.length; j++) {
    const c = segCross(sa[i - 1].p, sa[i].p, sb[j - 1].p, sb[j].p);
    if (!c) continue;
    const ta = sa[i - 1].t + (sa[i].t - sa[i - 1].t) * c.s, tb = sb[j - 1].t + (sb[j].t - sb[j - 1].t) * c.u;
    if (!out.some((o) => Math.abs(o.ta - ta) < 0.5)) out.push({ ta, tb, p: c.p });
  }
  return out;
}

/** Nearest point on a path to q: distance along it and how far off. */
export function nearestOnPath(p: Path, q: V): { t: number; d: number; p: V } {
  const s = samplePath(p, 0, pathLength(p), 1);
  let best = { t: 0, d: Infinity, p: s[0].p };
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1].p, b = s[i].p, ab = sub(b, a);
    const k = Math.max(0, Math.min(1, dot(sub(q, a), ab) / (dot(ab, ab) || 1)));
    const m = add(a, mul(ab, k)), d = dist(m, q);
    if (d < best.d) best = { t: s[i - 1].t + (s[i].t - s[i - 1].t) * k, d, p: m };
  }
  return best;
}
