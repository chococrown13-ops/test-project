import * as THREE from 'three';
import { add, dist, mul, norm, offsetPoint, pathAt, samplePath, sub, type V } from './geom';
import { buildGeometry, type Geometry, type Network } from './network';

/**
 * three.js meshes for a road network: asphalt (ribbons + junction fills),
 * raised pavements (both sides of each ribbon and round every junction
 * corner) and painted markings at real sizes, Korean style: a double yellow
 * centre line and white lane dashes on avenues, a single yellow line on
 * streets, stop lines and zebra crossings where roads meet.
 */

/** Direction of a one-way tag code: 1 east (+x), 2 south (+z), 3 west, 4 north. */
const ONEWAY_DIR: Record<number, [number, number]> = { 1: [1, 0], 2: [0, 1], 3: [-1, 0], 4: [0, -1] };

export interface RoadColours { asphalt: string; avenue: string; pavement: string; yellow: string; white: string }
export const COLOURS: RoadColours = { asphalt: '#8d8a84', avenue: '#6c6d71', pavement: '#d9d1c1', yellow: '#e9bf3a', white: '#f3f1ea' };

type H = (x: number, z: number) => number;

class Builder {
  pos: number[] = [];
  col: number[] = [];
  constructor(private h: H) {}
  tri(a: V, b: V, c: V, y: number, k: THREE.Color) {
    // Always face up.
    const cr = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    const [p, q] = cr > 0 ? [c, b] : [b, c];
    for (const s of [a, p, q]) { this.pos.push(s.x, this.h(s.x, s.z) + y, s.z); this.col.push(k.r, k.g, k.b); }
  }
  quad(a: V, b: V, c: V, d: V, y: number, k: THREE.Color) { this.tri(a, b, c, y, k); this.tri(a, c, d, y, k); }
  mesh(mat: THREE.Material): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    return m;
  }
}

export interface RoadMeshOptions {
  heightAt?: H;
  colours?: Partial<RoadColours>;
  /** Draw markings (lane lines, stop lines, crossings). */
  markings?: boolean;
  /** Heights above the ground of asphalt, pavement top and paint. */
  heights?: { asphalt: number; kerb: number; paint: number };
  /** Depth of a zebra crossing, metres. */
  zebra?: number;
  /** Where a 중앙버스전용차로 runs (avenues only): its inner lanes are painted red with blue edges. */
  busAt?: (x: number, z: number) => boolean;
  /** Materials for the three layers (default: plain vertex-coloured standard materials). */
  materials?: { asphalt?: THREE.Material; pavement?: THREE.Material; paint?: THREE.Material };
  /** Whether a dead end at this point gets a rounded cap (default yes). */
  capAt?: (p: V) => boolean;
  /** Edges drawn without centre line, stop line or crossing (a roundabout's one-way ring). */
  plain?: (e: { tag?: string }) => boolean;
  /**
   * Called for a street-tree spot every 9 m along both pavements (between the lamps): the
   * spot on the pavement, and the centreline point it belongs to (to look up whether trees grow there).
   */
  tree?: (x: number, z: number, cx: number, cz: number) => void;
  /** Called for a street lamp every so often along each road: position on the pavement and the angle it faces. */
  lamp?: (x: number, z: number, angle: number) => void;
}

export function buildRoadMeshes(net: Network, opts: RoadMeshOptions = {}, geo: Geometry = buildGeometry(net)): THREE.Group {
  const h = opts.heightAt ?? (() => 0);
  const C = { ...COLOURS, ...opts.colours };
  const col = (s: string) => new THREE.Color(s);
  const asphalt = new Builder(h), pave = new Builder(h), paint = new Builder(h);
  const A = { street: col(C.asphalt), avenue: col(C.avenue) }, P = col(C.pavement), Y = col(C.yellow), W = col(C.white);
  // Heights above the ground: asphalt sits a little proud of it (no z-fighting), kerbs higher, paint on the asphalt.
  const ASPH = opts.heights?.asphalt ?? 0.06, KERB_H = opts.heights?.kerb ?? 0.2, PAINT = opts.heights?.paint ?? ASPH + 0.03;
  const ZD = opts.zebra ?? 4;
  // On a deck or a slope the height changes along straight runs too: sample them finely.
  const hilly = !!opts.heightAt;
  const TYPES = net.types;
  const RED = col('#8f4a40'), BLUE = col('#3a6fd8');

  for (const r of geo.ribbons) {
    const e = net.edges.get(r.edge)!, T = TYPES[r.kind];
    const s = samplePath(e.path, r.t0, r.t1, 2, hilly);
    for (let i = 1; i < s.length; i++) {
      const q0 = s[i - 1], q1 = s[i];
      const o = (q: typeof q0, d: number) => offsetPoint(q, d);
      asphalt.quad(o(q0, T.half), o(q1, T.half), o(q1, -T.half), o(q0, -T.half), ASPH, A[r.kind]);
      for (const sg of [1, -1]) pave.quad(o(q0, sg * T.half), o(q1, sg * T.half), o(q1, sg * (T.half + T.kerb)), o(q0, sg * (T.half + T.kerb)), KERB_H, P);
    }
    if (opts.tree && r.t1 - r.t0 > 7) {
      // Clear of the crossings at each end and of the lamps (which stand at t0 + 6 + 20k).
      for (let t = r.t0 + 3.5; t < r.t1 - 3; t += 9) {
        const q = pathAt(e.path, t);
        for (const side of [1, -1]) { const p = offsetPoint(q, side * (T.half + T.kerb / 2)); opts.tree(p.x, p.z, q.p.x, q.p.z); }
      }
    }
    if (opts.lamp && r.t1 - r.t0 > 8) {
      // A lamp every 20 m, alternating sides, on the middle of the pavement.
      let side = 1;
      for (let t = r.t0 + 6; t < r.t1 - 2; t += 20, side = -side) {
        const q = pathAt(e.path, t), p = offsetPoint(q, side * (T.half + T.kerb / 2));
        opts.lamp(p.x, p.z, Math.atan2(-side * q.d.z, side * q.d.x));
      }
    }
  }
  for (const j of geo.junctions) {
    const contour = j.ring.map((p) => new THREE.Vector2(p.x, p.z));
    if (contour.length < 3) continue;
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    // Junctions take the darker avenue colour if any avenue meets there.
    const k = net.at(j.node).some((e) => e.kind === 'avenue') ? A.avenue : A.street;
    for (const [a, b, c] of tris) asphalt.tri(j.ring[a], j.ring[b], j.ring[c], ASPH, k);
    // Pavement round each corner: the kerb curve widened outward (away from the junction centre).
    const node = net.nodes.get(j.node)!.p;
    const kw = Math.min(...net.at(j.node).map((e) => TYPES[e.kind].kerb));
    for (const curve of j.kerb) {
      const out = curve.map((p, i) => {
        const a = curve[Math.max(0, i - 1)], b = curve[Math.min(curve.length - 1, i + 1)];
        const t = norm(sub(b, a));
        let n = { x: t.z, z: -t.x };
        if ((p.x - node.x) * n.x + (p.z - node.z) * n.z < 0) n = mul(n, -1);
        return add(p, mul(n, kw));
      });
      for (let i = 1; i < curve.length; i++) pave.quad(curve[i - 1], curve[i], out[i], out[i - 1], KERB_H, P);
    }
  }

  // Dead ends: a rounded cap of asphalt with the pavement wrapped round it.
  for (const n of net.nodes.values()) {
    const es = net.at(n.id);
    if (es.length !== 1 || opts.capAt?.(n.p) === false) continue;
    const e = es[0], T = TYPES[e.kind];
    const out = net.leave(e, n.id), back = { x: -out.x, z: -out.z };
    const side = { x: out.z, z: -out.x };
    const seg = 10, k = A[e.kind];
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI, a1 = ((i + 1) / seg) * Math.PI;
      const dir = (a: number) => ({ x: side.x * Math.cos(a) + back.x * Math.sin(a), z: side.z * Math.cos(a) + back.z * Math.sin(a) });
      const d0 = dir(a0), d1 = dir(a1);
      asphalt.tri(n.p, add(n.p, mul(d0, T.half)), add(n.p, mul(d1, T.half)), ASPH, k);
      pave.quad(add(n.p, mul(d0, T.half)), add(n.p, mul(d1, T.half)), add(n.p, mul(d1, T.half + T.kerb)), add(n.p, mul(d0, T.half + T.kerb)), KERB_H, P);
    }
  }

  if (opts.markings !== false) {
    const deg = (n: number) => net.at(n).length;
    for (const r of geo.ribbons) {
      const e = net.edges.get(r.edge)!, T = TYPES[r.kind];
      // Leave room at a real junction for the zebra and stop line.
      const plain = !!opts.plain?.(e);
      // Approaches to a plain (ring) junction keep their crossing a little further out, as at a real roundabout.
      const ja = !plain && deg(e.a) >= 3, jb = !plain && deg(e.b) >= 3;
      const t0 = r.t0 + (ja ? ZD + 2 : 0), t1 = r.t1 - (jb ? ZD + 2 : 0);
      if (t1 - t0 < 1) continue;
      const line = (o0: number, o1: number, k: THREE.Color, a = t0, b = t1) => {
        const s = samplePath(e.path, a, b, 2, hilly);
        for (let i = 1; i < s.length; i++) paint.quad(offsetPoint(s[i - 1], o0), offsetPoint(s[i], o0), offsetPoint(s[i], o1), offsetPoint(s[i - 1], o1), PAINT, k);
      };
      if (plain) {
        // One-way ring: on an avenue-sized ring, a dashed line between its two lanes.
        if (r.kind === 'avenue') for (let a = t0 + 2; a < t1 - 1; a += 8) line(-0.075, 0.075, W, a, Math.min(a + 3, t1));
        continue;
      }
      // One-way (tag "ow:<1 east, 2 south, 3 west, 4 north>"): white lane dashes down the middle instead of
      // the yellow centre line, an arrow every so often, and one stop line across the whole width where it comes in.
      const ow = e.tag?.startsWith('ow:') ? ONEWAY_DIR[Number(e.tag.slice(3))] : undefined;
      if (ow) {
        const mid = pathAt(e.path, (t0 + t1) / 2);
        const fwd = mid.d.x * ow[0] + mid.d.z * ow[1] >= 0 ? 1 : -1;
        for (let a = t0 + 2; a < t1 - 1; a += 8) line(-0.075, 0.075, W, a, Math.min(a + 3, t1));
        if (r.kind === 'avenue') for (const sg of [1, -1]) for (let a = t0 + 2; a < t1 - 1; a += 8) line(sg * T.half * 0.5 - 0.075, sg * T.half * 0.5 + 0.075, W, a, Math.min(a + 3, t1));
        const lanesAt = r.kind === 'avenue' ? [-T.half * 0.75, -T.half * 0.25, T.half * 0.25, T.half * 0.75] : [-T.half * 0.5, T.half * 0.5];
        for (let a = t0 + 6; a < t1 - 4; a += 22) {
          const q = pathAt(e.path, a);
          for (const o of lanesAt) {
            const along = (k: number) => mul(q.d, k * fwd);
            const c = offsetPoint(q, o);
            const tail = add(c, along(-1.6)), neck = add(c, along(0.6)), tip = add(c, along(1.8));
            const side = (p: V, k: number) => offsetPoint({ p, d: q.d } as typeof q, k);
            paint.quad(side(tail, -0.12), side(tail, 0.12), side(neck, 0.12), side(neck, -0.12), PAINT, W);
            paint.quad(side(neck, -0.5), side(neck, 0.5), tip, tip, PAINT, W);
          }
        }
        for (const [atA, j] of [[true, ja], [false, jb]] as [boolean, boolean][]) {
          if (!j) continue;
          const tEdge = atA ? r.t0 : r.t1, dir = atA ? 1 : -1;
          const zs = tEdge + dir * 0.5, ze = tEdge + dir * (ZD + 0.5);
          for (let o = -T.half + 0.4; o < T.half - 0.4; o += 0.9) line(o, o + 0.45, W, Math.min(zs, ze), Math.max(zs, ze));
          // Traffic arrives at end A when it runs against the path, at end B when with it.
          if ((atA && fwd < 0) || (!atA && fwd > 0)) {
            const q = pathAt(e.path, tEdge + dir * (ZD + 1.5));
            const a0 = offsetPoint(q, -T.half + 0.2), a1 = offsetPoint(q, T.half - 0.2), along = mul(q.d, 0.4);
            paint.quad(a0, a1, add(a1, along), add(a0, along), PAINT, W);
          }
        }
        continue;
      }
      if (r.kind === 'avenue') {
        line(0.15, 0.3, Y); line(-0.3, -0.15, Y);
        const lw = T.half / Math.max(1, T.lanes);
        // 중앙버스전용차로: the inner lane each way red, with blue edge lines, where buses run.
        let bus = false;
        if (opts.busAt) {
          const s = samplePath(e.path, t0, t1, 2, hilly);
          for (let i = 1; i < s.length; i++) {
            const m = s[i - 1].p, n = s[i].p;
            if (!opts.busAt((m.x + n.x) / 2, (m.z + n.z) / 2)) continue;
            bus = true;
            for (const sg of [1, -1]) {
              paint.quad(offsetPoint(s[i - 1], sg * 0.35), offsetPoint(s[i], sg * 0.35), offsetPoint(s[i], sg * (lw - 0.1)), offsetPoint(s[i - 1], sg * (lw - 0.1)), PAINT - 0.005, RED);
              paint.quad(offsetPoint(s[i - 1], sg * (lw - 0.1)), offsetPoint(s[i], sg * (lw - 0.1)), offsetPoint(s[i], sg * (lw + 0.06)), offsetPoint(s[i - 1], sg * (lw + 0.06)), PAINT, BLUE);
            }
          }
        }
        // White dashes between the lanes: 3 m painted every 8 m (the bus lane's edge is solid blue instead).
        for (let k = bus ? 2 : 1; k < T.lanes; k++) for (let a = t0 + 2; a < t1 - 1; a += 8) for (const sg of [1, -1]) line(sg * k * lw - 0.075, sg * k * lw + 0.075, W, a, Math.min(a + 3, t1));
      } else line(-0.075, 0.075, Y);
      // Stop line and zebra on each end meeting a junction.
      for (const [atA, j] of [[true, ja], [false, jb]] as [boolean, boolean][]) {
        if (!j) continue;
        const tEdge = atA ? r.t0 : r.t1, dir = atA ? 1 : -1;
        // Zebra: 45 cm bars, 45 cm apart, 4 m deep, right at the junction mouth.
        const zs = tEdge + dir * 0.5, ze = tEdge + dir * (ZD + 0.5);
        for (let o = -T.half + 0.4; o < T.half - 0.4; o += 0.9) line(o, o + 0.45, W, Math.min(zs, ze), Math.max(zs, ze));
        // Stop line across the lanes coming in (traffic keeps right).
        const st = tEdge + dir * (ZD + 1.5);
        const q = pathAt(e.path, st);
        const sideIn = atA ? 1 : -1; // arriving at a means travelling backwards: the incoming half is the left offset
        const a0 = offsetPoint(q, sideIn * 0.3), a1 = offsetPoint(q, sideIn * T.half);
        const along = mul(q.d, 0.4);
        paint.quad(a0, a1, add(a1, along), add(a0, along), PAINT, W);
      }
    }
  }

  const g = new THREE.Group();
  const flat = (side: THREE.Side = THREE.FrontSide) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, side });
  const M = opts.materials ?? {};
  g.add(asphalt.mesh(M.asphalt ?? flat()));
  g.add(pave.mesh(M.pavement ?? flat(THREE.DoubleSide)));
  g.add(paint.mesh(M.paint ?? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
  return g;
}

export { dist };
