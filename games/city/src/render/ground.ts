import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CELL, Ground, N, Zone, ZONE_DEPTH } from '../sim/defs';
import { roadDistance } from '../sim/tools';
import { idx, type World } from '../sim/world';

const SIZE = N * CELL;
/** Texels per cell, so zoned lots can show a thin grid line. */
const TX = 4;

export type Overlay = 'none' | 'traffic' | 'land' | 'pollution' | 'power' | 'water' | 'edu' | 'safety' | 'health' | 'fire';

const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Smooth value noise for forests. */
function noise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const ZONE_RGB: Record<number, [number, number, number]> = {
  [Zone.R]: [96, 196, 92],
  [Zone.C]: [74, 142, 224],
  [Zone.I]: [232, 190, 62],
};

/** Five-stop heat scale: green (good) to red (bad). */
function heat(v: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, v));
  const stops: [number, number, number][] = [[46, 160, 90], [140, 200, 70], [240, 210, 60], [240, 130, 50], [210, 50, 50]];
  const f = t * 4, i = Math.min(3, Math.floor(f)), k = f - i;
  const a = stops[i], b = stops[i + 1];
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

export class GroundLayer {
  readonly group = new THREE.Group();
  readonly tex: THREE.DataTexture;
  private data: Uint8Array;
  private trees: THREE.InstancedMesh;
  private treeVer = '';
  overlay: Overlay = 'none';
  showZoneable = false;

  constructor(w: World) {
    const R = N * TX;
    this.data = new Uint8Array(R * R * 4);
    this.tex = new THREE.DataTexture(this.data, R, R, THREE.RGBAFormat);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.magFilter = THREE.NearestFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;

    // Terrain: a vertex per cell corner; corners fully inside the river sink to form the bed.
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, N, N);
    geo.rotateX(-Math.PI / 2);
    geo.translate(SIZE / 2, 0, SIZE / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v), z = pos.getZ(v);
      uv.setXY(v, x / SIZE, z / SIZE);
      const vx = Math.round(x / CELL), vz = Math.round(z / CELL);
      let water = 0, cells = 0;
      for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        const cx = vx + dx, cz = vz + dz;
        if (cx < 0 || cz < 0 || cx >= N || cz >= N) continue;
        cells++;
        if (w.ground[idx(cx, cz)] === Ground.Water) water++;
      }
      if (cells && water === cells) pos.setY(v, -4.5);
    }
    geo.computeVertexNormals();
    const land = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: this.tex, roughness: 1 }));
    land.receiveShadow = true;
    this.group.add(land);

    // Land beyond the map edge, so the city doesn't float in the void.
    const far = new THREE.Mesh(new THREE.PlaneGeometry(SIZE * 6, SIZE * 6), new THREE.MeshStandardMaterial({ color: '#6f8f5a', roughness: 1 }));
    far.rotation.x = -Math.PI / 2;
    far.position.set(SIZE / 2, -0.3, SIZE / 2);
    this.group.add(far);

    const water = new THREE.Mesh(new THREE.PlaneGeometry(SIZE + 40, SIZE), new THREE.MeshStandardMaterial({ color: '#3d93cc', roughness: 0.3, metalness: 0 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(SIZE / 2, -1.1, SIZE / 2);
    water.receiveShadow = true;
    this.group.add(water);

    // Low-poly trees: a trunk and two stacked cones, coloured per instance.
    const trunk = new THREE.CylinderGeometry(0.25, 0.32, 2, 5).translate(0, 1, 0);
    const c1 = new THREE.ConeGeometry(2.1, 3.6, 6).translate(0, 3.4, 0);
    const c2 = new THREE.ConeGeometry(1.5, 2.8, 6).translate(0, 5.0, 0);
    const paint = (g: THREE.BufferGeometry, hex: string) => {
      const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      return g;
    };
    const tree = mergeGeometries([paint(trunk, '#6b4a33'), paint(c1, '#ffffff'), paint(c2, '#ffffff')])!;
    this.trees = new THREE.InstancedMesh(tree, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), 9000);
    this.trees.castShadow = true;
    this.trees.receiveShadow = true;
    this.trees.count = 0;
    this.group.add(this.trees);
  }

  /** Repaint the ground texture. Cheap enough to do on every change. */
  paint(w: World) {
    const R = N * TX, d = this.data;
    const ov = this.overlay;
    const near = this.showZoneable;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = idx(x, y);
      let rgb: [number, number, number];
      const id = w.bld[i];
      const b = id >= 0 ? w.buildings.get(id) : undefined;
      const h = hash(x, y);
      const grass: [number, number, number] = [106 + h * 7, 145 + h * 8, 76 + h * 4];
      let line = false;
      if (w.ground[i] === Ground.Water) rgb = [70, 92, 84];
      else if (b && (b.kind === 'park' || b.kind === 'r3')) rgb = [92 + h * 10, 160 + h * 12, 82];
      else if (b && b.kind === 'school') rgb = [196, 160, 118];
      else if (b && (b.kind.startsWith('c') || b.kind.startsWith('i'))) rgb = b.kind.startsWith('i') ? [128, 128, 124] : [170, 166, 158];
      else if (b) rgb = [150 + h * 10, 150 + h * 10, 140];
      else if (w.zone[i]) {
        const z = ZONE_RGB[w.zone[i]];
        rgb = [grass[0] * 0.6 + z[0] * 0.4, grass[1] * 0.6 + z[1] * 0.4, grass[2] * 0.6 + z[2] * 0.4];
        line = true;
      } else if (bank(w, x, y)) rgb = [196, 184, 140];
      else rgb = grass;
      if (near && !w.zone[i] && !w.road[i] && !b && w.ground[i] !== Ground.Water && roadDistance(w, x, y) <= ZONE_DEPTH) {
        rgb = [rgb[0] * 0.8 + 255 * 0.2, rgb[1] * 0.8 + 255 * 0.2, rgb[2] * 0.8 + 255 * 0.2];
        line = true;
      }
      if (ov !== 'none' && w.ground[i] !== Ground.Water) {
        const v = overlayValue(w, ov, i);
        if (v !== null) { const c = heat(v); rgb = [rgb[0] * 0.25 + c[0] * 0.75, rgb[1] * 0.25 + c[1] * 0.75, rgb[2] * 0.25 + c[2] * 0.75]; }
        else rgb = [rgb[0] * 0.55, rgb[1] * 0.55, rgb[2] * 0.55];
      }
      for (let ty = 0; ty < TX; ty++) for (let tx = 0; tx < TX; tx++) {
        const o = ((y * TX + ty) * R + x * TX + tx) * 4;
        const edge = line && (tx === 0 || ty === 0);
        const k = edge ? 0.78 : 1;
        d[o] = rgb[0] * k; d[o + 1] = rgb[1] * k; d[o + 2] = rgb[2] * k; d[o + 3] = 255;
      }
    }
    this.tex.needsUpdate = true;
  }

  /** Trees grow on open land and around parks and apartment lots. */
  plantTrees(w: World) {
    const v = `${w.ver.roads}:${w.ver.zones}:${w.ver.buildings}`;
    if (v === this.treeVer) return;
    this.treeVer = v;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    let n = 0;
    const greens = ['#4f8a3c', '#3f7a35', '#5d9643', '#6a9a3a', '#3b6e3a'];
    const put = (wx: number, wz: number, k: number, seed: number) => {
      if (n >= 9000) return;
      q.setFromAxisAngle(up, seed * 6.28);
      s.setScalar(k);
      p.set(wx, 0, wz);
      m.compose(p, q, s);
      this.trees.setMatrixAt(n, m);
      c.set(greens[Math.floor(seed * 97) % greens.length]);
      this.trees.setColorAt(n, c);
      n++;
    };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = idx(x, y);
      if (w.road[i] || w.ground[i] === Ground.Water) continue;
      const id = w.bld[i];
      const h = hash(x, y), h2 = hash(y + 3.1, x + 7.7);
      if (id >= 0) {
        const b = w.buildings.get(id)!;
        if (b.kind === 'park') for (let k = 0; k < 4; k++) put(x * CELL + 2 + hash(k, x) * 6, y * CELL + 2 + hash(y, k) * 6, 0.8 + hash(k, y) * 0.5, hash(x + k, y));
        else if (b.kind === 'r3' && b.x === x && b.y === y) for (const [ox, oz] of [[1.4, 1.4], [18.6, 1.4], [1.4, 18.6], [18.6, 18.6], [10, 1.2], [10, 18.8]]) put(x * CELL + ox, y * CELL + oz, 0.7 + h * 0.3, h2 + ox);
        continue;
      }
      if (w.zone[i]) continue;
      const f = noise(x / 9, y / 9) * 0.75 + noise(x / 3.5 + 40, y / 3.5) * 0.25;
      if (f < 0.52) continue;
      const count = f > 0.66 ? 3 : f > 0.58 ? 2 : 1;
      for (let k = 0; k < count; k++) put(x * CELL + 1.5 + hash(x + k * 13, y) * 7, y * CELL + 1.5 + hash(y + k * 7, x) * 7, 0.75 + hash(k, x + y) * 0.6, hash(x * 3 + k, y));
    }
    this.trees.count = n;
    this.trees.instanceMatrix.needsUpdate = true;
    if (this.trees.instanceColor) this.trees.instanceColor.needsUpdate = true;
  }
}

function bank(w: World, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < N && ny < N && w.ground[idx(nx, ny)] === Ground.Water) return true;
  }
  return false;
}

/** 0 = good, 1 = bad; null = not applicable here. */
function overlayValue(w: World, ov: Overlay, i: number): number | null {
  switch (ov) {
    case 'traffic': return w.road[i] ? Math.min(1, w.traffic[i] / 1.3) : null;
    case 'land': return (70 - w.land[i]) / 50;
    case 'pollution': return w.pollution[i] > 2 ? w.pollution[i] / 60 : 0;
    case 'edu': return w.edu[i] ? 0 : 1;
    case 'safety': return w.safety[i] ? 0 : 1;
    case 'health': return w.health[i] ? 0 : 1;
    case 'fire': return w.fire[i] ? 0 : 1;
    case 'power':
    case 'water': {
      const id = w.bld[i];
      if (id < 0) return null;
      const b = w.buildings.get(id)!;
      return (ov === 'power' ? b.powered : b.watered) ? 0 : 1;
    }
    default: return null;
  }
}
