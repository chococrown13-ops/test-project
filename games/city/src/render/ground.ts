import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CELL, Ground, Level, N, Zone, ZONE_DEPTH } from '../sim/defs';
import { roadDistance } from '../sim/tools';
import { isRamp } from '../sim/graph';
import { idx, terrainField, type World } from '../sim/world';
import { shared } from './materials';

const SIZE = N * CELL;
/** Texels per cell, so zoned lots can show a thin grid line. */
const TX = 4;

export type Overlay = 'none' | 'traffic' | 'transit' | 'land' | 'pollution' | 'power' | 'water' | 'edu' | 'safety' | 'health' | 'fire';

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
  // The HUD's --color-zone-* tokens, so the map and the demand bars agree.
  [Zone.R]: [76, 196, 124],
  [Zone.C]: [63, 127, 214],
  [Zone.I]: [227, 176, 75],
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
  private geo: THREE.PlaneGeometry;
  private field: Float32Array;
  /** Terrain height per cell corner, (N + 1) squared. */
  private vh = new Float32Array((N + 1) * (N + 1));
  private shapeVer = -1;
  /** Calendar month (1-12) for foliage and snow. */
  month = 3;
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
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const pos0 = geo.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < pos0.count; v++) uv.setXY(v, pos0.getX(v) / SIZE, pos0.getZ(v) / SIZE);
    this.geo = geo;
    this.field = terrainField(w.seed);
    this.shape(w);
    // Flat shading shows the hills as low-poly facets; flat land is unaffected.
    const landMat = new THREE.MeshStandardMaterial({ map: this.tex, roughness: 1, flatShading: true });
    // Large soft patches of light and dark grass hide the cell grid on open land.
    landMat.onBeforeCompile = (sh) => {
      sh.uniforms.uSnow = shared.uSnow;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vGP;\nvarying float vGY;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvec4 gw = modelMatrix * vec4(transformed, 1.0); vGP = gw.xz; vGY = gw.y;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        varying vec2 vGP;
        varying float vGY;
        uniform float uSnow;
        float hh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hh(i), hh(i + vec2(1, 0)), f.x), mix(hh(i + vec2(0, 1)), hh(i + vec2(1, 1)), f.x), f.y); }`)
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= 0.9 + 0.14 * vn(vGP / 46.0) + 0.06 * vn(vGP / 9.0);\n// Snow settles everywhere in deep winter, and first on the peaks.\nfloat snow = uSnow * (0.55 + 0.45 * smoothstep(8.0, 45.0, vGY)) * (0.75 + 0.25 * vn(vGP / 6.0));\nif (vGY > -0.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 0.97), clamp(snow, 0.0, 0.92));');
    };
    landMat.customProgramCacheKey = () => 'city-land';
    const land = new THREE.Mesh(geo, landMat);
    land.receiveShadow = true;
    this.group.add(land);

    // Land beyond the map edge, so the city doesn't float in the void.
    const far = new THREE.Mesh(new THREE.PlaneGeometry(SIZE * 6, SIZE * 6), new THREE.MeshStandardMaterial({ color: '#6f8f5a', roughness: 1 }));
    far.rotation.x = -Math.PI / 2;
    far.position.set(SIZE / 2, -0.3, SIZE / 2);
    this.group.add(far);

    const waterMat = new THREE.MeshStandardMaterial({ color: '#2f7fb8', roughness: 0.08, metalness: 0.15 });
    // Ripples: the normal wobbles with two crossing wave trains, so sun and sky glint off the river.
    waterMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = shared.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vGP;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGP = (modelMatrix * vec4(transformed, 1.0)).xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vGP;\nuniform float uTime;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          vec2 wv = vec2(sin(vGP.x * 0.21 + uTime * 1.3) + sin(vGP.y * 0.13 - uTime * 0.9) * 0.6, cos(vGP.y * 0.19 + uTime * 1.1) + sin((vGP.x + vGP.y) * 0.09 + uTime * 0.7) * 0.6);
          normal = normalize(normal + (viewMatrix * vec4(wv.x * 0.06, 0.0, wv.y * 0.06, 0.0)).xyz);`);
    };
    waterMat.customProgramCacheKey = () => 'city-water';
    const water = new THREE.Mesh(new THREE.PlaneGeometry(SIZE * 4, SIZE), waterMat);
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
    this.trees = new THREE.InstancedMesh(tree, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), MAX_TREES);
    this.trees.castShadow = true;
    this.trees.receiveShadow = true;
    this.trees.count = 0;
    this.group.add(this.trees);
  }

  /**
   * Set the terrain heights: river bed below, hills from the seeded field,
   * and a notch cut into the hillside wherever a tunnel opens.
   */
  shape(w: World) {
    if (this.shapeVer === w.ver.roads) return;
    this.shapeVer = w.ver.roads;
    const pos = this.geo.attributes.position as THREE.BufferAttribute;
    const S1 = N + 1;
    const mouth = (cx: number, cz: number) => { const i = idx(cx, cz); return w.roadAlt[i] && w.altLevel[i] === Level.Tunnel && isRamp(w, i); };
    for (let vz = 0; vz <= N; vz++) for (let vx = 0; vx <= N; vx++) {
      let water = 0, cells = 0, hsum = 0, cut = false;
      for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        const cx = vx + dx, cz = vz + dz;
        if (cx < 0 || cz < 0 || cx >= N || cz >= N) continue;
        cells++;
        const i = idx(cx, cz);
        if (w.ground[i] === Ground.Water) water++;
        if (w.ground[i] === Ground.Mountain) hsum += this.field[i];
        if (mouth(cx, cz) || w.road[i]) cut = true;
      }
      // A corner rises only if all its cells are hill, so slopes start at the foot.
      const allHill = cells > 0 && [[-1, -1], [0, -1], [-1, 0], [0, 0]].every(([dx, dz]) => { const cx = vx + dx, cz = vz + dz; return cx < 0 || cz < 0 || cx >= N || cz >= N || w.ground[idx(cx, cz)] === Ground.Mountain; });
      const y = cells && water === cells ? -4.5 : allHill && !cut ? hsum / cells : 0;
      this.vh[vz * S1 + vx] = y;
    }
    // PlaneGeometry runs its rows the other way round after the rotation; match by position.
    for (let v = 0; v < pos.count; v++) {
      const vx = Math.round(pos.getX(v) / CELL), vz = Math.round(pos.getZ(v) / CELL);
      pos.setY(v, this.vh[vz * S1 + vx]);
    }
    pos.needsUpdate = true;
    this.geo.computeVertexNormals();
  }

  /** Terrain height at a world point, interpolated between cell corners. */
  heightAt(wx: number, wz: number): number {
    const S1 = N + 1;
    const fx = Math.max(0, Math.min(N - 0.001, wx / CELL)), fz = Math.max(0, Math.min(N - 0.001, wz / CELL));
    const x = Math.floor(fx), z = Math.floor(fz), u = fx - x, v = fz - z;
    const a = this.vh[z * S1 + x], b = this.vh[z * S1 + x + 1], c = this.vh[(z + 1) * S1 + x], d = this.vh[(z + 1) * S1 + x + 1];
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
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
      else if (w.ground[i] === Ground.Mountain) {
        // Forest on the slopes, bare granite near the tops, like the hills around Seoul.
        const rock = Math.max(0, Math.min(1, (this.field[i] - 55) / 30));
        rgb = [74 + h * 10 + rock * 70, 108 + h * 12 + rock * 22, 64 + h * 6 + rock * 48];
      }
      else if (b && (b.kind === 'park' || b.kind === 'r3' || b.kind === 'riverpark')) rgb = [92 + h * 10, 160 + h * 12, 82];
      else if (b && b.kind === 'palace') rgb = [214, 198, 160];
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

  /** Trees grow on open land, thickly on the hills, and around parks and apartment lots; their colour follows the season. */
  plantTrees(w: World) {
    const v = `${w.ver.roads}:${w.ver.zones}:${w.ver.buildings}:${seasonOf(this.month)}`;
    if (v === this.treeVer) return;
    this.treeVer = v;
    this.shape(w);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    const season = seasonOf(this.month);
    let n = 0;
    const put = (wx: number, wz: number, k: number, seed: number, cherry = 0) => {
      if (n >= MAX_TREES) return;
      q.setFromAxisAngle(up, seed * 6.28);
      s.setScalar(k);
      p.set(wx, this.heightAt(wx, wz) - 0.2, wz);
      m.compose(p, q, s);
      this.trees.setMatrixAt(n, m);
      c.set(treeColour(season, seed, cherry));
      this.trees.setColorAt(n, c);
      n++;
    };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = idx(x, y);
      if (w.road[i] || w.ground[i] === Ground.Water || w.roadAlt[i] && isRamp(w, i)) continue;
      const id = w.bld[i];
      const h = hash(x, y), h2 = hash(y + 3.1, x + 7.7);
      if (w.ground[i] === Ground.Mountain) {
        // Thick forest, thinning toward the bare tops.
        if (id >= 0) continue;
        const count = this.field[i] > 70 ? 1 : this.field[i] > 50 ? 2 : 3;
        for (let k = 0; k < count; k++) put(x * CELL + 1.5 + hash(x + k * 13, y) * 7, y * CELL + 1.5 + hash(y + k * 7, x) * 7, 0.9 + hash(k, x + y) * 0.7, hash(x * 3 + k, y), 0.12);
        continue;
      }
      if (id >= 0) {
        const b = w.buildings.get(id)!;
        if (b.kind === 'park') for (let k = 0; k < 4; k++) put(x * CELL + 2 + hash(k, x) * 6, y * CELL + 2 + hash(y, k) * 6, 0.8 + hash(k, y) * 0.5, hash(x + k, y), 0.4);
        else if (b.kind === 'riverpark') for (let k = 0; k < 3; k++) put(x * CELL + 1 + hash(k, x) * 8, y * CELL + 1 + hash(y, k) * 8, 0.8 + hash(k, y) * 0.4, hash(x + k, y), 0.9);
        else if (b.kind === 'palace') { if (hash(x, y) < 0.5) put(x * CELL + 2 + h * 6, y * CELL + 2 + h2 * 6, 1.1, h, 0.3); }
        else if (b.kind === 'r3' && b.x === x && b.y === y) for (const [ox, oz] of [[1.4, 1.4], [18.6, 1.4], [1.4, 18.6], [18.6, 18.6], [10, 1.2], [10, 18.8]]) put(x * CELL + ox, y * CELL + oz, 0.7 + h * 0.3, h2 + ox, 0.35);
        continue;
      }
      if (w.zone[i] || altBlocks(w, i)) continue;
      const f = noise(x / 9, y / 9) * 0.75 + noise(x / 3.5 + 40, y / 3.5) * 0.25;
      if (f < 0.52) continue;
      const count = f > 0.66 ? 3 : f > 0.58 ? 2 : 1;
      // Cherry trees line the riverbanks.
      const cherry = bank(w, x, y) ? 0.8 : 0.15;
      for (let k = 0; k < count; k++) put(x * CELL + 1.5 + hash(x + k * 13, y) * 7, y * CELL + 1.5 + hash(y + k * 7, x) * 7, 0.75 + hash(k, x + y) * 0.6, hash(x * 3 + k, y), cherry);
    }
    this.trees.count = n;
    this.trees.instanceMatrix.needsUpdate = true;
    if (this.trees.instanceColor) this.trees.instanceColor.needsUpdate = true;
  }
}

const MAX_TREES = 16000;

type Season = 'spring' | 'blossom' | 'summer' | 'autumn' | 'winter';
export function seasonOf(month: number): Season {
  if (month === 4) return 'blossom';
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 9) return 'summer';
  if (month <= 11 && month >= 10) return 'autumn';
  return 'winter';
}
const PALETTE: Record<Season, string[]> = {
  spring: ['#6aa84f', '#7cbf5a', '#5d9643', '#8bc34a'],
  blossom: ['#6aa84f', '#7cbf5a', '#5d9643'],
  summer: ['#3f7a35', '#4f8a3c', '#356b30', '#2f6b3a'],
  autumn: ['#e0a526', '#d9822b', '#c0392b', '#b5651d', '#e8c13a', '#4f7a35'],
  winter: ['#2f4f3a', '#3b5a40', '#7a6450', '#6d5a48'],
};
/** A tree's colour for the season; `cherry` is the chance it is a 벚나무 in bloom in April. */
function treeColour(season: Season, seed: number, cherry: number): string {
  if (season === 'blossom' && (seed * 7.31) % 1 < cherry) return (seed * 13.7) % 1 < 0.5 ? '#f4b6c8' : '#f9d3de';
  const pal = PALETTE[season];
  return pal[Math.floor(seed * 97) % pal.length];
}

/** Under a flyover deck or on a ramp: no trees. */
const altBlocks = (w: World, i: number) => w.roadAlt[i] !== 0 && (w.altLevel[i] === Level.Elevated || isRamp(w, i));

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
    case 'transit': return w.transit[i] === 2 ? 0 : w.transit[i] ? 0.35 : 1;
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
