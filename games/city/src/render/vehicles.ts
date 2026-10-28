import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Road } from '../sim/defs';
import { roadTypeOf } from '../sim/graph';
import { MAX_CARS, type Car, type Traffic } from '../sim/traffic';
import type { World } from '../sim/world';
import { shared } from './materials';
import { nodeCentre, nodeY } from './roadheight';

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
const BUS_COLORS = ['#2e9e4f', '#2f6db5', '#2e9e4f', '#d9483b'];
const TRUCK_COLORS = ['#2f5fa8', '#2f5fa8', '#f2f2f0'];
const SCOOTER_COLORS = ['#e0a400', '#d9483b', '#2e9e4f', '#2f6db5', '#f2f2f0'];

export class VehicleLayer {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[];
  private mat: THREE.MeshStandardMaterial;

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
  }

  update(w: World, tr: Traffic) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    const n = [0, 0, 0, 0];
    const a = { x: 0, z: 0, y: 0 }, b = { x: 0, z: 0, y: 0 };
    for (const car of tr.cars) {
      // Average two points along the path so cars round the corners.
      sample(w, car, car.i + car.t - 0.3, a);
      sample(w, car, car.i + car.t + 0.3, b);
      const dx = b.x - a.x, dz = b.z - a.z;
      if (dx * dx + dz * dz < 1e-4) continue;
      const k = car.kind, i = n[k]++;
      q.setFromAxisAngle(up, Math.atan2(-dz, dx));
      p.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      m.compose(p, q, one);
      this.meshes[k].setMatrixAt(i, m);
      const pal = k === 0 ? CAR_COLORS : k === 1 ? BUS_COLORS : k === 2 ? TRUCK_COLORS : SCOOTER_COLORS;
      c.set(pal[Math.floor(car.look * 997) % pal.length]);
      this.meshes[k].setColorAt(i, c);
    }
    this.meshes.forEach((mesh, k) => {
      mesh.count = n[k];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }
}

/** Position at path parameter s (cell index + fraction), in the right-hand lane. */
function sample(w: World, car: Car, s: number, out: { x: number; z: number; y: number }) {
  const path = car.path, last = path.length - 1;
  s = Math.max(0, Math.min(last, s));
  const i = Math.min(last - 1, Math.floor(s)), f = s - i;
  const n0 = path[Math.max(0, i)], n1 = path[Math.min(last, i + 1)];
  const p0 = nodeCentre(n0), p1 = nodeCentre(n1);
  let dx = p1.x - p0.x, dz = p1.z - p0.z;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len; dz /= len;
  const node = f < 0.5 ? n0 : n1;
  const lane = roadTypeOf(w, node) === Road.Avenue ? (car.look > 0.5 ? 4.1 : 1.6) : car.kind === 3 ? 2.6 : 1.6;
  // Right of travel direction (dx, dz) with y up is (-dz, dx); diagonals use the unit vector.
  out.x = p0.x + (p1.x - p0.x) * f - dz * lane;
  out.z = p0.z + (p1.z - p0.z) * f + dx * lane;
  out.y = nodeY(w, n0) + (nodeY(w, n1) - nodeY(w, n0)) * f;
}
