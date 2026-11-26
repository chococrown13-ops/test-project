import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Road } from '../sim/defs';
import { NN, roadTypeOf } from '../sim/graph';
import { CELL, N } from '../sim/defs';
import { MAX_CARS, type Car, type Traffic } from '../sim/traffic';
import type { World } from '../sim/world';
import { shared } from './materials';
import { nodeCentre, roadY } from './roadheight';
import { onRing } from './ringpath';
import { laneAt } from './lanepath';

/** `glow` lights a part at night: positive is a warm headlight, negative a red tail light. */
function tinted(g: THREE.BufferGeometry, k: number, glow = 0) {
  const n = g.attributes.position.count, a = new Float32Array(n * 3).fill(k);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.setAttribute('aGlow', new THREE.BufferAttribute(new Float32Array(n).fill(glow), 1));
  return g.toNonIndexed();
}
const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number, k: number, glow = 0) => tinted(new THREE.BoxGeometry(sx, sy, sz).translate(x, y + sy / 2, z), k, glow);
/** Two headlights at the front (+x) and two tail lights at the back of a body of length L. */
const lights = (L: number, y: number, w: number) => [
  box(0.08, 0.22, 0.4, L / 2 + 0.02, y, w / 2 - 0.35, 1, 2.2), box(0.08, 0.22, 0.4, L / 2 + 0.02, y, -w / 2 + 0.35, 1, 2.2),
  box(0.08, 0.2, 0.35, -L / 2 - 0.02, y, w / 2 - 0.3, 0.6, -1.6), box(0.08, 0.2, 0.35, -L / 2 - 0.02, y, -w / 2 + 0.3, 0.6, -1.6),
];

/** Models face +x. Instance colour paints the body; glass and tyres stay dark. */
const MODELS = [
  // 승용차
  mergeGeometries([box(4.3, 0.85, 1.8, 0, 0.3, 0, 1), box(2.3, 0.65, 1.6, -0.3, 1.15, 0, 0.22), ...lights(4.3, 0.6, 1.8)]),
  // 버스
  mergeGeometries([box(10.5, 2.4, 2.4, 0, 0.35, 0, 1), box(10.3, 0.8, 2.45, 0, 1.45, 0, 0.18, 0.5), ...lights(10.5, 0.6, 2.4)]),
  // 1톤 트럭 (포터)
  mergeGeometries([box(1.9, 1.7, 1.75, 1.6, 0.3, 0, 1), box(0.9, 0.6, 1.7, 1.9, 1.25, 0, 0.2), box(3.1, 0.6, 1.8, -0.9, 0.35, 0, 0.75), ...lights(5.0, 0.55, 1.8).map((g) => g.translate(0.05, 0, 0))]),
  // 배달 오토바이: a scooter, its rider, and the delivery box on the back.
  mergeGeometries([box(1.8, 0.5, 0.45, 0, 0.3, 0, 0.3), box(0.5, 1.0, 0.5, -0.1, 0.8, 0, 0.25), box(0.55, 0.35, 0.5, 0, 1.8, 0, 0.9), box(0.6, 0.6, 0.6, -0.75, 0.75, 0, 1), box(0.06, 0.15, 0.2, 0.92, 0.5, 0, 1, 2.2), box(0.06, 0.12, 0.2, -1.07, 0.6, 0, 0.6, -1.6)]),
] as THREE.BufferGeometry[];

const CAR_COLORS = ['#f2f2f0', '#f2f2f0', '#1b1c1e', '#1b1c1e', '#a9adb2', '#a9adb2', '#6f7378', '#2a3d66', '#8c1d1d', '#e6e1d3'];
/** Kerbside parked cars drawn at most. */
const MAX_PARKED = 6000;
const BUS_COLORS = ['#2e9e4f', '#2f6db5', '#2e9e4f', '#d9483b'];
const TRUCK_COLORS = ['#2f5fa8', '#2f5fa8', '#f2f2f0'];
const SCOOTER_COLORS = ['#e0a400', '#d9483b', '#2e9e4f', '#2f6db5', '#f2f2f0'];

export class VehicleLayer {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[];
  private mat: THREE.MeshStandardMaterial;
  private parked: THREE.InstancedMesh;
  private parkedKey = '';

  constructor() {
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.3 });
    this.mat.onBeforeCompile = (sh) => {
      sh.uniforms.uNight = shared.uNight;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying float vGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += (vGlow > 0.0 ? vec3(1.0, 0.92, 0.75) * vGlow : vec3(1.0, 0.08, 0.05) * -vGlow) * (0.15 + uNight);');
    };
    this.mat.customProgramCacheKey = () => 'city-car';
    this.meshes = MODELS.map((g) => {
      const m = new THREE.InstancedMesh(g, this.mat, MAX_CARS);
      m.castShadow = true;
      m.count = 0;
      m.frustumCulled = false;
      m.setColorAt(0, new THREE.Color());
      this.group.add(m);
      return m;
    });
    this.parked = new THREE.InstancedMesh(MODELS[0], this.mat, MAX_PARKED);
    this.parked.castShadow = true;
    this.parked.receiveShadow = true;
    this.parked.count = 0;
    this.parked.frustumCulled = false;
    this.parked.setColorAt(0, new THREE.Color());
    this.group.add(this.parked);
  }

  /** Cars parked along the kerbs, two to a side per cell: rebuilt when the parking changes. */
  private updateParked(w: World) {
    const key = `${w.day >> 1}:${w.ver.roads}:${w.noAvenueParking}`;
    if (key === this.parkedKey) return;
    this.parkedKey = key;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    let n = 0;
    for (let i = 0; i < NN && n < MAX_PARKED; i++) {
      const k = w.parked[i];
      if (!k || !w.road[i]) continue;
      const x = i % N, y = (i / N) | 0;
      const horiz = (x > 0 && !!w.road[i - 1]) || (x < N - 1 && !!w.road[i + 1]);
      const off = w.road[i] === 2 ? 4.35 : 2.55;
      const mx = x * CELL + CELL / 2, mz = y * CELL + CELL / 2;
      // Alternate sides so a half-full street has cars on both kerbs.
      const slots = [[1, -2.4], [-1, 2.4], [-1, -2.4], [1, 2.4]];
      for (let s = 0; s < Math.min(k, 4) && n < MAX_PARKED; s++) {
        const [side, along] = slots[(s + x + y) % 4];
        const h = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453;
        const r = h - Math.floor(h);
        if (horiz) { p.set(mx + along, 0.12, mz + side * off); q.setFromAxisAngle(up, r < 0.5 ? 0 : Math.PI); }
        else { p.set(mx + side * off, 0.12, mz + along); q.setFromAxisAngle(up, r < 0.5 ? Math.PI / 2 : -Math.PI / 2); }
        m.compose(p, q, one);
        this.parked.setMatrixAt(n, m);
        this.parked.setColorAt(n, c.set(CAR_COLORS[Math.floor(r * 997) % CAR_COLORS.length]));
        n++;
      }
    }
    this.parked.count = n;
    this.parked.instanceMatrix.needsUpdate = true;
    if (this.parked.instanceColor) this.parked.instanceColor.needsUpdate = true;
  }

  /** How far right of the centre line each car is drawn: eased, so a change of lane is a smooth move across. */
  private side = new WeakMap<Car, number>();
  /** Where every moving car is drawn this frame (x, z pairs; not those standing at a stop line), for the walkers to look out for. */
  readonly spots = new Float32Array(MAX_CARS * 2);
  /** Where each line's buses are this frame (drawn by the transit layer in the line's colour). */
  readonly buses: { line: number; m: THREE.Matrix4 }[] = [];
  nSpots = 0;
  private lastClock = 0;

  update(w: World, tr: Traffic) {
    this.updateParked(w);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pitch = new THREE.Quaternion(), fwdZ = new THREE.Vector3(0, 0, 1), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    const n = [0, 0, 0, 0];
    const a = { x: 0, z: 0, y: 0 }, b = { x: 0, z: 0, y: 0 };
    const dt = Math.max(0, Math.min(0.5, tr.clock - this.lastClock));
    this.lastClock = tr.clock;
    const ease = 1 - Math.exp(-dt * 6);
    let spots = 0, nb = 0;
    for (const car of tr.cars) {
      // Average two points along the path so cars round the corners.
      // Cars are drawn where the simulation has them: it keeps them apart and in their lanes.
      const st = car.i + car.t;
      const want = laneOff(w, car, st);
      let off = this.side.get(car);
      off = off === undefined ? want : off + (want - off) * ease;
      this.side.set(car, off);
      sample(w, car, st - 0.3, off, a);
      sample(w, car, st + 0.3, off, b);
      const dx = b.x - a.x, dz = b.z - a.z;
      if (dx * dx + dz * dz < 1e-4) continue;
      if (car.bus !== undefined) {
        q.setFromAxisAngle(up, Math.atan2(-dz, dx)).multiply(pitch.setFromAxisAngle(fwdZ, Math.atan2(b.y - a.y, Math.hypot(dx, dz))));
        p.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        if (car.v > 1 && spots < MAX_CARS) { this.spots[spots * 2] = p.x; this.spots[spots * 2 + 1] = p.z; spots++; }
        const e = this.buses[nb] ?? (this.buses[nb] = { line: 0, m: new THREE.Matrix4() });
        e.line = car.bus; e.m.compose(p, q, one); nb++;
        continue;
      }
      const k = car.kind, i = n[k]++;
      // Heading, then the nose up or down the slope (ramps).
      q.setFromAxisAngle(up, Math.atan2(-dz, dx)).multiply(pitch.setFromAxisAngle(fwdZ, Math.atan2(b.y - a.y, Math.hypot(dx, dz))));
      p.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      if (car.v > 1 && spots < MAX_CARS) { this.spots[spots * 2] = p.x; this.spots[spots * 2 + 1] = p.z; spots++; }
      m.compose(p, q, one);
      this.meshes[k].setMatrixAt(i, m);
      const pal = k === 0 ? CAR_COLORS : k === 1 ? BUS_COLORS : k === 2 ? TRUCK_COLORS : SCOOTER_COLORS;
      c.set(pal[Math.floor(car.look * 997) % pal.length]);
      this.meshes[k].setColorAt(i, c);
    }
    this.nSpots = spots;
    this.buses.length = nb;
    this.meshes.forEach((mesh, k) => {
      mesh.count = n[k];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }
}

/** How far right of the centre line a car belongs at path parameter s, metres. */
function laneOff(w: World, car: Car, s: number): number {
  const path = car.path, last = path.length - 1;
  s = Math.max(0, Math.min(last, s));
  const i = Math.min(last - 1, Math.floor(s)), f = s - i;
  const node = path[f < 0.5 ? i : i + 1];
  // Avenue lanes 2.5 m wide at 1.25 and 3.75 m (kerb at 5 m), squeezed in a little past parked cars;
  // the street lane at 1.75 m (kerb at 3.5 m), further in past parked cars. Scooters keep to the kerb side.
  if (roadTypeOf(w, node) === Road.Highway) return car.kind === 3 ? 5.2 : car.lane ? 4.6 : 1.9;
  const avenue = roadTypeOf(w, node) === Road.Avenue;
  const parked = node < NN && w.parked[node] > 0;
  // One-way: the whole road goes one way, two lanes either side of the middle.
  if (node < NN && w.oneway[node]) {
    const half = avenue ? 2.4 : 1.3;
    if (car.kind === 3) return car.lane ? half + 0.6 : -half + 0.4;
    return car.lane ? half : -half + (parked ? 0.6 : 0);
  }
  if (avenue) {
    if (car.kind === 3) return car.lane ? (parked ? 3.0 : 4.1) : 1.6;
    return car.lane ? (parked ? 2.6 : 3.75) : parked ? 0.85 : 1.25;
  }
  return car.kind === 3 ? (parked ? 1.1 : 2.9) : parked ? 1.1 : 1.75;
}

/** Position at path parameter s (cell index + fraction), `lane` metres right of the centre line. */
function sample(w: World, car: Car, s: number, lane: number, out: { x: number; z: number; y: number }) {
  const path = car.path, last = path.length - 1;
  s = Math.max(0, Math.min(last, s));
  const i = Math.min(last - 1, Math.floor(s)), f = s - i;
  const n0 = path[Math.max(0, i)], n1 = path[Math.min(last, i + 1)];
  // Corners are rounded from lane to lane (so a sharp turn at a five-way junction sweeps round instead of jumping or cutting across).
  laneAt((k) => nodeCentre(path[k], w), last, s, lane, 6, false, out);
  const ring = onRing(w, path, s, lane);
  if (ring) { out.x = ring.x; out.z = ring.z; }
  out.y = roadY(w, n0, n1, f, out.x, out.z);
}
