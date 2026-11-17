import * as THREE from 'three';
import { add, dist, mul, norm, offsetPoint, pathAt, samplePath, sub, type V } from './geom';
import { buildGeometry, type Geometry, type Network, TYPES } from './network';

/**
 * three.js meshes for a road network: asphalt (ribbons + junction fills),
 * raised pavements (both sides of each ribbon and round every junction
 * corner) and painted markings at real sizes, Korean style: a double yellow
 * centre line and white lane dashes on avenues, a single yellow line on
 * streets, stop lines and zebra crossings where roads meet.
 */

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
}

export function buildRoadMeshes(net: Network, opts: RoadMeshOptions = {}, geo: Geometry = buildGeometry(net)): THREE.Group {
  const h = opts.heightAt ?? (() => 0);
  const C = { ...COLOURS, ...opts.colours };
  const col = (s: string) => new THREE.Color(s);
  const asphalt = new Builder(h), pave = new Builder(h), paint = new Builder(h);
  const A = { street: col(C.asphalt), avenue: col(C.avenue) }, P = col(C.pavement), Y = col(C.yellow), W = col(C.white);
  // Heights above the ground: asphalt sits a little proud of it (no z-fighting), kerbs higher, paint on the asphalt.
  const ASPH = 0.06, KERB_H = 0.2, PAINT = ASPH + 0.03;

  for (const r of geo.ribbons) {
    const e = net.edges.get(r.edge)!, T = TYPES[r.kind];
    const s = samplePath(e.path, r.t0, r.t1, 2);
    for (let i = 1; i < s.length; i++) {
      const q0 = s[i - 1], q1 = s[i];
      const o = (q: typeof q0, d: number) => offsetPoint(q, d);
      asphalt.quad(o(q0, T.half), o(q1, T.half), o(q1, -T.half), o(q0, -T.half), ASPH, A[r.kind]);
      for (const sg of [1, -1]) pave.quad(o(q0, sg * T.half), o(q1, sg * T.half), o(q1, sg * (T.half + T.kerb)), o(q0, sg * (T.half + T.kerb)), KERB_H, P);
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

  if (opts.markings !== false) {
    const deg = (n: number) => net.at(n).length;
    for (const r of geo.ribbons) {
      const e = net.edges.get(r.edge)!, T = TYPES[r.kind];
      // Leave room at a real junction for the zebra and stop line.
      const ja = deg(e.a) >= 3, jb = deg(e.b) >= 3;
      const t0 = r.t0 + (ja ? 6 : 0), t1 = r.t1 - (jb ? 6 : 0);
      if (t1 - t0 < 1) continue;
      const line = (o0: number, o1: number, k: THREE.Color, a = t0, b = t1) => {
        const s = samplePath(e.path, a, b, 2);
        for (let i = 1; i < s.length; i++) paint.quad(offsetPoint(s[i - 1], o0), offsetPoint(s[i], o0), offsetPoint(s[i], o1), offsetPoint(s[i - 1], o1), PAINT, k);
      };
      if (r.kind === 'avenue') {
        line(0.15, 0.3, Y); line(-0.3, -0.15, Y);
        // White dashes between the lanes: 3 m painted every 8 m.
        for (let a = t0 + 2; a < t1 - 1; a += 8) for (const sg of [1, -1]) line(sg * 4 - 0.075, sg * 4 + 0.075, W, a, Math.min(a + 3, t1));
      } else line(-0.075, 0.075, Y);
      // Stop line and zebra on each end meeting a junction.
      for (const [atA, j] of [[true, ja], [false, jb]] as [boolean, boolean][]) {
        if (!j) continue;
        const tEdge = atA ? r.t0 : r.t1, dir = atA ? 1 : -1;
        // Zebra: 45 cm bars, 45 cm apart, 4 m deep, right at the junction mouth.
        const zs = tEdge + dir * 0.5, ze = tEdge + dir * 4.5;
        for (let o = -T.half + 0.4; o < T.half - 0.4; o += 0.9) line(o, o + 0.45, W, Math.min(zs, ze), Math.max(zs, ze));
        // Stop line across the lanes coming in (traffic keeps right).
        const st = tEdge + dir * 5.5;
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
  g.add(asphalt.mesh(flat()));
  const pm = pave.mesh(flat(THREE.DoubleSide));
  g.add(pm);
  const mk = paint.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  g.add(mk);
  return g;
}

export { dist };
