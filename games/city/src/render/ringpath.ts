import { ringOf } from '../sim/roundabout';
import type { World } from '../sim/world';
import { nodeCentre } from './roadheight';

/**
 * Where a vehicle is while its cell path runs through a 회전교차로: round
 * the ring rather than across the island, anticlockwise on screen (traffic
 * keeps right), `lane` metres out from the ring's centreline. Null when the
 * point is not on a ring.
 */
export function onRing(w: World, path: ArrayLike<number>, s: number, lane: number): { x: number; z: number } | null {
  if (!w.roundabouts.length || path.length < 2) return null;
  const last = path.length - 1;
  const raw = (u: number) => {
    u = Math.max(0, Math.min(last, u));
    const i = Math.min(last - 1, Math.floor(u)), f = u - i;
    const a = nodeCentre(path[i], w), b = nodeCentre(path[i + 1], w);
    return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
  };
  const p = raw(s);
  for (const rb of w.roundabouts) {
    const g = ringOf(rb);
    const d = (u: number) => { const q = raw(u); return Math.hypot(q.x - g.x, q.z - g.z) - g.rc; };
    if (d(s) >= 0) continue;
    if (Math.hypot(p.x - g.x, p.z - g.z) > g.rc) continue;
    let a = Math.floor(s);
    while (a > 0 && d(a) < 0) a--;
    let b = Math.ceil(s);
    while (b < last && d(b) < 0) b++;
    // A trip that starts or ends inside the ring (a lot opening onto it): out onto the ring, straight out from the middle.
    if (d(a) < 0 || d(b) < 0) {
      const ang = Math.atan2(p.z - g.z, p.x - g.x), r = g.rc + lane;
      return { x: g.x + Math.cos(ang) * r, z: g.z + Math.sin(ang) * r };
    }
    // Where the path crosses the ring's centreline, going in and coming out.
    const cross = (out: number, inn: number) => { let lo = out, hi = inn; for (let k = 0; k < 12; k++) { const m = (lo + hi) / 2; if (d(m) >= 0) lo = m; else hi = m; } return (lo + hi) / 2; };
    const sIn = cross(a, Math.min(a + 1, s)), sOut = cross(b, Math.max(b - 1, s));
    const pin = raw(sIn), pout = raw(sOut);
    const a0 = Math.atan2(pin.z - g.z, pin.x - g.x), a1 = Math.atan2(pout.z - g.z, pout.x - g.x);
    // Anticlockwise on screen is decreasing angle (z points south).
    let sweep = a0 - a1;
    while (sweep < 0.15) sweep += Math.PI * 2;
    while (sweep > Math.PI * 2 + 0.15) sweep -= Math.PI * 2;
    const u = Math.max(0, Math.min(1, (s - sIn) / Math.max(1e-6, sOut - sIn)));
    const ang = a0 - u * sweep, r = g.rc + lane;
    return { x: g.x + Math.cos(ang) * r, z: g.z + Math.sin(ang) * r };
  }
  return null;
}
