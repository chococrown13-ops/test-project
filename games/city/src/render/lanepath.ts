/**
 * Lanes and pavements along a path of node centres, turning corners the way
 * people and cars really do. Away from corners a point sits `off` metres to
 * the right of travel. Within R of a corner it follows a curve from the lane
 * coming in to the lane going out, through the point where the two lanes
 * would meet, so nothing jumps sideways at a junction or cuts across it.
 * Sharp corners (people) go straight to that meeting point and out again,
 * so a walker crossing a side street stays on the line of the crossing.
 */

export interface P2 { x: number; z: number }

const len = (a: P2, b: P2) => Math.hypot(b.x - a.x, b.z - a.z) || 1e-6;

export function laneAt(pts: (k: number) => P2, last: number, s: number, off: number, rMax: number, sharp: boolean, out: P2): P2 {
  s = Math.max(0, Math.min(last, s));
  const i = Math.min(last - 1, Math.floor(s)), f = s - i;
  const p0 = pts(i), p1 = pts(i + 1);
  const L = len(p0, p1), dx = (p1.x - p0.x) / L, dz = (p1.z - p0.z) / L;
  const R = (k: number) => {
    const a = pts(k - 1), b = pts(k), c = pts(k + 1);
    return Math.min(rMax, 0.45 * len(a, b), 0.45 * len(b, c));
  };
  const fL = f * L;
  if (i + 1 < last) { const r = R(i + 1); if (L - fL < r) return corner(pts, i + 1, r, off, 0.5 * (1 - (L - fL) / r), sharp, out); }
  if (i > 0) { const r = R(i); if (fL < r) return corner(pts, i, r, off, 0.5 + (0.5 * fL) / r, sharp, out); }
  out.x = p0.x + dx * fL - dz * off;
  out.z = p0.z + dz * fL + dx * off;
  return out;
}

/** The point a fraction u (0..1) round the corner at node k. */
function corner(pts: (k: number) => P2, k: number, R: number, off: number, u: number, sharp: boolean, out: P2): P2 {
  const a = pts(k - 1), c = pts(k), b = pts(k + 1);
  const l1 = len(a, c), l2 = len(c, b);
  const d1x = (c.x - a.x) / l1, d1z = (c.z - a.z) / l1, d2x = (b.x - c.x) / l2, d2z = (b.z - c.z) / l2;
  const Ax = c.x - d1x * R - d1z * off, Az = c.z - d1z * R + d1x * off;
  const Bx = c.x + d2x * R - d2z * off, Bz = c.z + d2z * R + d2x * off;
  const cross = d1x * d2z - d1z * d2x;
  let Kx = (Ax + Bx) / 2, Kz = (Az + Bz) / 2;
  if (Math.abs(cross) > 1e-3) {
    // Where the incoming lane, carried on, meets the outgoing lane carried back.
    const t = ((Bx - Ax) * d2z - (Bz - Az) * d2x) / cross;
    if (t > 0 && t < 3 * R) { Kx = Ax + d1x * t; Kz = Az + d1z * t; }
  }
  if (sharp) {
    const la = Math.hypot(Kx - Ax, Kz - Az), lb = Math.hypot(Bx - Kx, Bz - Kz), tot = la + lb || 1;
    const d = u * tot;
    if (d < la) { const q = d / (la || 1); out.x = Ax + (Kx - Ax) * q; out.z = Az + (Kz - Az) * q; }
    else { const q = (d - la) / (lb || 1); out.x = Kx + (Bx - Kx) * q; out.z = Kz + (Bz - Kz) * q; }
    return out;
  }
  const v = 1 - u;
  out.x = v * v * Ax + 2 * v * u * Kx + u * u * Bx;
  out.z = v * v * Az + 2 * v * u * Kz + u * u * Bz;
  return out;
}
