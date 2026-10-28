import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CELL, N, Road } from '../sim/defs';
import { busCount, busRoute, type LineKind } from '../sim/transit';
import type { World } from '../sim/world';
import { shared } from './materials';
import { nodeCentre, nodeY } from './roadheight';

const BUS_SPEED = 2.4; // cells per second at 1x
const TRAIN_SPEED = 7;
const MAX_BUSES = 400;

function tint(g: THREE.BufferGeometry, k: number, glow = 0) {
  const n = g.attributes.position.count;
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(k), 3));
  g.setAttribute('aGlow', new THREE.BufferAttribute(new Float32Array(n).fill(glow), 1));
  return g.toNonIndexed();
}
const part = (sx: number, sy: number, sz: number, x: number, y: number, z: number, k: number, glow = 0) =>
  tint(new THREE.BoxGeometry(sx, sy, sz).translate(x, y + sy / 2, z), k, glow);

/** City bus facing +x: body in the line colour, a dark window band, a lit destination sign. */
const BUS = mergeGeometries([
  part(10.5, 2.3, 2.45, 0, 0.35, 0, 1),
  part(10.55, 0.85, 2.5, 0, 1.35, 0, 0.16, 0.6),
  part(0.1, 0.35, 1.8, 5.3, 2.25, 0, 1.6, 1.5),
  part(9.6, 0.25, 2.1, 0, 2.65, 0, 0.9),
])!;
/** Four-car subway train, drawn only in the transit view. */
const TRAIN = mergeGeometries([0, 1, 2, 3].map((k) => part(4.6, 2.2, 2.6, -k * 5, 0, 0, 1, 0.4)))!;

/** Shared emissive-at-night material: aGlow marks windows and signs. */
function glowMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.1 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = shared.uNight;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying float vGlow;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.86, 0.6) * vGlow * uNight;');
  };
  m.customProgramCacheKey = () => 'city-glow';
  return m;
}

const centre = (i: number) => ({ x: (i % N) * CELL + CELL / 2, z: Math.floor(i / N) * CELL + CELL / 2 });

export class TransitLayer {
  readonly group = new THREE.Group();
  private stops = new THREE.Group();
  private routes = new THREE.Group();
  private draft = new THREE.Group();
  private buses: THREE.InstancedMesh;
  private trains: THREE.InstancedMesh;
  private ver = '';
  private draftKey = '';
  private shelterMat = new THREE.MeshStandardMaterial({ color: '#d8dde2', roughness: 0.4, metalness: 0.2 });
  private glassMat = new THREE.MeshStandardMaterial({ color: '#9fc4d8', roughness: 0.1, transparent: true, opacity: 0.55 });
  showRoutes = false;

  constructor() {
    const mat = glowMaterial();
    this.buses = new THREE.InstancedMesh(BUS, mat, MAX_BUSES);
    this.trains = new THREE.InstancedMesh(TRAIN, mat, 200);
    for (const m of [this.buses, this.trains]) { m.count = 0; m.castShadow = true; m.frustumCulled = false; m.setColorAt(0, new THREE.Color()); }
    this.group.add(this.stops, this.routes, this.draft, this.buses, this.trains);
  }

  /** `time` is simulated seconds, so vehicles stop when the game is paused. */
  update(w: World, time: number, draft: { kind: LineKind; stops: number[] } | null) {
    const ver = `${w.ver.transit}:${w.ver.roads}:${w.lines.length}`;
    if (ver !== this.ver) { this.ver = ver; this.rebuild(w); }
    const dk = draft ? `${draft.kind}:${draft.stops.join(',')}:${w.ver.roads}` : '';
    if (dk !== this.draftKey) { this.draftKey = dk; this.drawDraft(w, draft); }
    this.routes.visible = this.showRoutes || !!draft;
    this.moveVehicles(w, time);
  }

  private clear(g: THREE.Group) {
    for (const c of [...g.children]) {
      g.remove(c);
      c.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); if (o.material !== this.shelterMat && o.material !== this.glassMat) (o.material as THREE.Material).dispose(); } });
    }
  }

  private rebuild(w: World) {
    this.clear(this.stops);
    this.clear(this.routes);
    const done = new Set<number>();
    for (const l of w.lines) {
      if (l.kind === 'bus') {
        for (const s of l.stops) if (!done.has(s)) { done.add(s); this.shelter(w, s, l.color); }
        const p = busRoute(w, l.stops, l.id);
        if (p) this.routes.add(ribbon(Array.from(p).map(nodeCentre), l.color, 1.6, 0.7));
      } else {
        this.routes.add(ribbon(l.stops.map(centre), l.color, 3.2, 0.9));
        for (const s of l.stops) this.routes.add(disc(centre(s), l.color, 4.2));
      }
    }
  }

  /** A bus shelter on the kerb: roof, glass back panel and a pole sign in the line colour. */
  private shelter(w: World, i: number, color: string) {
    const x = i % N, y = Math.floor(i / N);
    const road = (dx: number, dy: number) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < N && ny < N && w.road[ny * N + nx] !== Road.None; };
    const side = [[0, -1], [0, 1], [-1, 0], [1, 0]].find(([dx, dy]) => !road(dx, dy)) ?? [0, -1];
    const c = centre(i);
    const g = new THREE.Group();
    g.position.set(c.x + side[0] * 3.9, 0.3, c.z + side[1] * 3.9);
    g.rotation.y = Math.atan2(side[0], side[1]);
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, px: number, py: number, pz: number) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(px, py, pz); mesh.castShadow = true; g.add(mesh); };
    add(new THREE.BoxGeometry(3.2, 0.14, 1.3), this.shelterMat, 0, 2.5, 0);
    add(new THREE.BoxGeometry(3.0, 2.3, 0.08), this.glassMat, 0, 1.2, 0.55);
    add(new THREE.BoxGeometry(0.12, 2.5, 0.12), this.shelterMat, -1.5, 1.25, 0);
    add(new THREE.BoxGeometry(0.12, 2.5, 0.12), this.shelterMat, 1.5, 1.25, 0);
    add(new THREE.BoxGeometry(0.1, 3.2, 0.1), this.shelterMat, 2.1, 1.6, -0.2);
    add(new THREE.BoxGeometry(0.75, 0.75, 0.12), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25 }), 2.1, 3.1, -0.2);
    this.stops.add(g);
  }

  private drawDraft(w: World, draft: { kind: LineKind; stops: number[] } | null) {
    this.clear(this.draft);
    if (!draft || !draft.stops.length) return;
    const color = draft.kind === 'bus' ? '#2e9e4f' : '#263c96';
    for (const s of draft.stops) this.draft.add(disc(centre(s), color, draft.kind === 'bus' ? 3 : 4.5, 1.2));
    if (draft.stops.length < 2) return;
    const pts = draft.kind === 'bus' ? Array.from(busRoute(w, draft.stops) ?? []).map(nodeCentre) : draft.stops.map(centre);
    if (pts.length > 1) this.draft.add(ribbon(pts, color, draft.kind === 'bus' ? 1.6 : 3.2, 1.1));
  }

  private moveVehicles(w: World, time: number) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    const t = time;
    let nb = 0, nt = 0;
    for (const l of w.lines) {
      c.set(l.color);
      if (l.kind === 'bus') {
        const path = busRoute(w, l.stops, l.id);
        if (!path || path.length < 2) continue;
        const n = busCount(w, l), L = path.length - 1;
        for (let k = 0; k < n && nb < MAX_BUSES; k++) {
          const s = (t * BUS_SPEED + (k * L) / n) % L;
          const a = along(w, path, s - 0.35, true), b = along(w, path, s + 0.35, true);
          q.setFromAxisAngle(up, Math.atan2(-(b.z - a.z), b.x - a.x));
          p.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
          this.buses.setMatrixAt(nb, m.compose(p, q, one));
          this.buses.setColorAt(nb++, c);
        }
      } else if (this.showRoutes) {
        const pts = l.stops.map(centre);
        const lens = pts.slice(1).map((v, k) => Math.hypot(v.x - pts[k].x, v.z - pts[k].z));
        const total = lens.reduce((a, b) => a + b, 0);
        if (!total) continue;
        // Out and back along the line, two trains a line.
        for (let k = 0; k < 2; k++) {
          let d = ((t * TRAIN_SPEED * CELL + k * total) % (2 * total));
          const back = d > total;
          if (back) d = 2 * total - d;
          let seg = 0;
          while (seg < lens.length - 1 && d > lens[seg]) { d -= lens[seg]; seg++; }
          const A = pts[seg], B = pts[seg + 1], f = Math.min(1, d / lens[seg]);
          let ang = Math.atan2(-(B.z - A.z), B.x - A.x);
          if (back) ang += Math.PI;
          q.setFromAxisAngle(up, ang);
          p.set(A.x + (B.x - A.x) * f, 1.2, A.z + (B.z - A.z) * f);
          this.trains.setMatrixAt(nt, m.compose(p, q, one));
          this.trains.setColorAt(nt++, c);
        }
      }
    }
    for (const [mesh, n] of [[this.buses, nb], [this.trains, nt]] as const) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}

/** Point along a cell path at parameter s, in the right-hand lane. */
function along(w: World, path: Int32Array, s: number, loop: boolean) {
  const L = path.length - 1;
  if (loop) s = ((s % L) + L) % L; else s = Math.max(0, Math.min(L, s));
  const i = Math.min(L - 1, Math.floor(s)), f = s - i;
  const a = nodeCentre(path[i]), b = nodeCentre(path[i + 1]);
  const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const dx = (b.x - a.x) / len, dz = (b.z - a.z) / len;
  const y = nodeY(w, path[i]) + (nodeY(w, path[i + 1]) - nodeY(w, path[i])) * f;
  return { x: a.x + (b.x - a.x) * f - dz * 1.7, z: a.z + (b.z - a.z) * f + dx * 1.7, y };
}

/** A flat coloured band through points, for route maps. */
function ribbon(pts: { x: number; z: number }[], color: string, width: number, y: number): THREE.Mesh {
  const pos: number[] = [];
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (!len) continue;
    const nx = (-(b.z - a.z) / len) * width / 2, nz = ((b.x - a.x) / len) * width / 2;
    pos.push(a.x + nx, y, a.z + nz, b.x + nx, y, b.z + nz, b.x - nx, y, b.z - nz, a.x + nx, y, a.z + nz, b.x - nx, y, b.z - nz, a.x - nx, y, a.z - nz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
  mesh.renderOrder = 4;
  return mesh;
}

function disc(c: { x: number; z: number }, color: string, r: number, y = 1.0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.3, 20), new THREE.MeshBasicMaterial({ color }));
  mesh.position.set(c.x, y, c.z);
  mesh.renderOrder = 5;
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.32, 20), new THREE.MeshBasicMaterial({ color: '#f7f3e6' }));
  mesh.add(ring);
  return mesh;
}

