import * as THREE from 'three';
import { B, CELL, type Game, idx, inside, N, type Place, RoadT } from '../sim/world';

/**
 * Every building in the 구 as instanced parts: boxes (walls, slabs, towers),
 * gable prisms (roofs), pyramids (hipped 기와 roofs) and half-vaults (market
 * arcades). Rebuilt whole when the map changes; parts that are new this
 * decade rise out of the ground over a couple of seconds.
 */

type Shape = 'box' | 'gable' | 'hip' | 'vault' | 'tree';
/** Window pattern on walls: 0 none, 1 house, 2 apartment, 3 glass, 4 shopfront. */
type Win = 0 | 1 | 2 | 3 | 4;
interface Part { s: Shape; x: number; y: number; z: number; w: number; h: number; d: number; rot: number; c: string; win: Win; cell: number; base: number }

const hash = (i: number, k: number) => { const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return s - Math.floor(s); };
const pickc = (a: string[], r: number) => a[Math.floor(r * a.length) % a.length];

const GIWA_ROOF = ['#46525e', '#3f4a55', '#4d5966'];
const SLATE_ROOF = ['#7d8e9c', '#9aa6ad', '#b4593f', '#5f86a6', '#8f9a80'];
const WALL = ['#efe6d2', '#e6dcc4', '#f3ecdc', '#ddd2bb', '#e9e0cf'];
const BRICK = ['#a8573f', '#9c5a46', '#b56a4c', '#8f4f3c'];
const SIGN = ['#d9473b', '#2f6db3', '#e2a92b', '#3d9a62', '#c2457e'];
const APT = ['#f1efe8', '#ece7dc', '#e7ecef', '#efe9df'];
const GLASS = ['#7d9bb5', '#6f8ea6', '#8aa5b8', '#5f7f99'];
const FUTURE = ['#f4f1ea', '#e9efe9', '#efe7da'];

export const PLACE_COLOUR: Record<string, string> = {
  gukbap: '#c96f3b', bath: '#5b8fb0', barber: '#c94b4b', tearoom: '#a0663f', cinema: '#7a4fa0', hardware: '#7b7f3b', mill: '#c9a03b',
  snack: '#e07a4f', corner: '#d0a24a', briquette: '#4b4b4f', photo: '#5f7f9f', books: '#3f7f6a', chinese: '#c0392b', tree: '#5f8f3f',
  church: '#e8e2d6', school: '#d9b77a', mural: '#e39bb5', crossing: '#e2c93b', market: '#d57a2f',
};

function geometry(s: Shape): THREE.BufferGeometry {
  switch (s) {
    case 'box': return new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    case 'gable': {
      // Ridge along x, one unit high, footprint 1x1.
      const g = new THREE.BufferGeometry();
      const v = [
        -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0, -0.5, 0, 0.5, 0.5, 1, 0, -0.5, 1, 0,
        0.5, 0, -0.5, -0.5, 0, -0.5, -0.5, 1, 0, 0.5, 0, -0.5, -0.5, 1, 0, 0.5, 1, 0,
        0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 1, 0,
        -0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 1, 0,
      ];
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      g.computeVertexNormals();
      return g;
    }
    case 'hip': return new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
    case 'vault': return new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).scale(1, 2, 1);
    case 'tree': return new THREE.IcosahedronGeometry(0.5, 0).translate(0, 0.5, 0);
  }
}

function material(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aWin;\nvarying vec3 vWP;\nvarying vec3 vWN;\nvarying float vWin;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nmat4 cwM = modelMatrix * instanceMatrix;\nvWP = (cwM * vec4(transformed, 1.0)).xyz;\nvWN = normalize(mat3(cwM) * objectNormal);\nvWin = aWin;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nvarying vec3 vWN;\nvarying float vWin;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float st = floor(vWin + 0.5);
        if (abs(vWN.y) < 0.5 && st > 0.5) {
          vec2 t = normalize(vec2(-vWN.z, vWN.x));
          float u = dot(vWP.xz, t);
          float fy = vWP.y / 3.0, fv = fract(fy);
          float sp = st < 1.5 ? 3.4 : st < 2.5 ? 2.8 : st < 3.5 ? 1.8 : 3.6;
          float cu = fract(u / sp);
          float win = 0.0;
          if (st < 1.5) win = step(0.38, fv) * step(fv, 0.72) * step(0.3, cu) * step(cu, 0.7);
          else if (st < 2.5) win = step(0.32, fv) * step(fv, 0.8) * step(0.12, cu) * step(cu, 0.88);
          else if (st < 3.5) win = step(0.08, fv) * step(cu, 0.94);
          else win = step(0.2, fv) * step(fv, 0.8) * step(0.1, cu) * step(cu, 0.9);
          if (st > 1.5 && st < 2.5 && fv < 0.28) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.94), 0.55);
          diffuseColor.rgb = mix(diffuseColor.rgb, st > 2.5 && st < 3.5 ? vec3(0.34, 0.47, 0.6) : vec3(0.2, 0.24, 0.3), win);
          if (fv < 0.04 && vWP.y > 2.9) diffuseColor.rgb *= 0.88;
        }`);
  };
  m.customProgramCacheKey = () => 'keep-building';
  return m;
}

/** The parts of one cell's building. `y0` is the ground height there. */
function partsFor(g: Game, i: number, y0: number, out: Part[]) {
  const t = g.btype[i];
  if (t === B.None || t === B.Field) return;
  const x = i % N, y = (i / N) | 0;
  const cx = x * CELL + CELL / 2, cz = y * CELL + CELL / 2;
  // Face the road: rotate a quarter turn when the road runs north-south beside us.
  const ns = (inside(x - 1, y) && g.road[idx(x - 1, y)]) || (inside(x + 1, y) && g.road[idx(x + 1, y)]);
  const rot = ns ? Math.PI / 2 : 0;
  const r = (k: number) => hash(i, k);
  const P = (s: Shape, dx: number, dy: number, dz: number, w: number, h: number, d: number, c: string, win: Win = 0, rr = rot) => {
    // Offsets are in the building's own frame.
    const c0 = Math.cos(rr), s0 = Math.sin(rr);
    out.push({ s, x: cx + dx * c0 + dz * s0, y: y0 + dy, z: cz - dx * s0 + dz * c0, w, h, d, rot: rr, c, win, cell: i, base: y0 });
  };
  switch (t) {
    case B.Giwa: {
      // ㄱ-shaped 한옥: two wings under dark tiled roofs, a yard in the corner.
      const wall = pickc(WALL, r(1)), roof = pickc(GIWA_ROOF, r(2));
      P('box', -2, 0, -3, 12, 3.2, 6, wall, 1);
      P('gable', -2, 3.2, -3, 13.4, 2.6, 7.6, roof);
      P('box', 4.5, 0, 2, 5, 3.2, 8, wall, 1);
      P('gable', 4.5, 3.2, 2, 6.4, 2.4, 9.4, roof, 0, rot + Math.PI / 2);
      break;
    }
    case B.Slate: {
      // Two small 슬레이트 houses side by side, low roofs in faded colours.
      for (const k of [0, 1]) {
        const dx = k ? 4.5 : -4.5;
        P('box', dx, 0, (r(3 + k) - 0.5) * 3, 8, 2.9, 9, pickc(WALL, r(5 + k)), 1);
        P('gable', dx, 2.9, (r(3 + k) - 0.5) * 3, 8.8, 1.3, 9.8, pickc(SLATE_ROOF, r(7 + k)));
      }
      break;
    }
    case B.Shop: {
      const f = Math.max(2, g.floors[i]), h = f * 3;
      P('box', 0, 0, -1, 16, h, 12, pickc([...WALL, ...BRICK], r(1)), 4);
      P('box', 0, 2.4, -7.2, 15, 0.9, 0.4, pickc(SIGN, r(2)));
      break;
    }
    case B.Market: {
      // Stalls under a bright arcade.
      P('box', 0, 0, -4, 18, 2.6, 6, pickc(WALL, r(1)), 4);
      P('box', 0, 0, 4, 18, 2.6, 6, pickc(WALL, r(2)), 4);
      P('vault', 0, 2.6, 0, 19, 1.6, 18, pickc(['#e8a33d', '#3d8ac4', '#d75a43', '#7bb661'], r(3)));
      break;
    }
    case B.Factory: {
      P('box', 0, 0, 0, 18, 5, 16, '#c9c2b2', 0);
      for (let k = 0; k < 3; k++) P('gable', 0, 5, -5.3 + k * 5.3, 18, 2, 5.3, '#8a9399');
      if (r(4) < 0.5) P('box', 6, 0, 6, 1.4, 16, 1.4, '#b25b44');
      break;
    }
    case B.Villa: {
      const h = 3 * Math.max(3, g.floors[i]);
      P('box', 0, 0, 0, 15, h, 13, pickc(BRICK, r(1)), 1);
      P('box', 0, h, 0, 15.4, 0.4, 13.4, '#5f9a6e');
      break;
    }
    case B.Apt: {
      // 판상형: one long slab; neighbours line up along the same street.
      const h = 3 * Math.max(8, g.floors[i]);
      P('box', 0, 0, 0, 18, h, 10, pickc(APT, r(1)), 2);
      P('box', 0, h, 0, 18.2, 1.2, 10.2, pickc(['#4b78a8', '#3f8f6f', '#b2524a', '#c9a640'], r(2)));
      break;
    }
    case B.Tower: {
      const h = 3 * Math.max(20, g.floors[i]);
      P('box', 0, 0, 0, 17, 9, 17, '#d8d5cc', 4);
      P('box', 0, 9, 0, 14, h - 9, 14, pickc(GLASS, r(1)), 3);
      break;
    }
    case B.Office: {
      const h = 3 * Math.max(8, g.floors[i]);
      P('box', 0, 0, 0, 17, h, 15, pickc(['#9fb2c2', '#b9c0c4', '#8ea7b9', '#c8c2b5'], r(1)), 3);
      P('box', 0, h, 0, 6, 2.4, 6, '#c9cbcc');
      break;
    }
    case B.Future: {
      // Terraced blocks with planted roofs.
      const f = Math.max(4, g.floors[i]);
      for (let k = 0; k < 3; k++) {
        const hk = 3 * Math.max(2, f - k * 2), wk = 17 - k * 4;
        P('box', 0, 3 * k * 1.6, 0, wk, hk - 3 * k * 1.6, wk - 2, pickc(FUTURE, r(1)), 2);
        P('box', 0, hk, 0, wk - 1, 0.6, wk - 3, '#7fb36a');
      }
      break;
    }
    case B.Park: {
      for (let k = 0; k < 3; k++) P('tree', (r(10 + k) - 0.5) * 14, 0, (r(20 + k) - 0.5) * 14, 6 + r(30 + k) * 3, 7 + r(40 + k) * 4, 6 + r(30 + k) * 3, pickc(['#6c9f4f', '#7aab55', '#5e8f45'], r(50 + k)));
      break;
    }
    case B.Vacant: {
      // An empty house: faded walls, a sagging roof, weeds round it.
      P('box', 0, 0, 0, 9, 2.6, 9, '#b9b2a2', 0);
      P('gable', 0, 2.6, 0, 9.6, 1, 10, '#7a7570');
      P('tree', 5, 0, 5, 3, 1.6, 3, '#8a9a5a');
      break;
    }
    case B.Place: break; // drawn by placeParts
  }
}

/** A 기억 장소: its own colours, a little taller than its neighbours so it reads from afar. */
function placeParts(p: Place, i: number, y0: number, g: Game, out: Part[]) {
  const cx = p.x * CELL + CELL / 2, cz = p.y * CELL + CELL / 2;
  const ns = (inside(p.x - 1, p.y) && g.road[idx(p.x - 1, p.y)] > 0) || (inside(p.x + 1, p.y) && g.road[idx(p.x + 1, p.y)] > 0);
  const rot = ns ? Math.PI / 2 : 0;
  const col = PLACE_COLOUR[p.kind] ?? '#d0a24a';
  const closed = p.state === 'closed';
  const wall = closed ? '#b8b1a4' : '#f1e9d8';
  const P = (s: Shape, dx: number, dy: number, dz: number, w: number, h: number, d: number, c: string, win: Win = 0, rr = rot) => {
    const c0 = Math.cos(rr), s0 = Math.sin(rr);
    out.push({ s, x: cx + dx * c0 + dz * s0, y: y0 + dy, z: cz - dx * s0 + dz * c0, w, h, d, rot: rr, c, win, cell: i, base: y0 });
  };
  switch (p.kind) {
    case 'tree':
      P('box', 0, 0, 0, 1.6, 6, 1.6, '#6b5440');
      P('tree', 0, 4, 0, 18, 13, 18, closed ? '#8a9a6a' : '#5e9447');
      return;
    case 'crossing':
      P('box', -6, 0, 0, 0.6, 4, 0.6, '#e2c93b'); P('box', -6, 3.4, 3, 0.4, 0.4, 7, '#e8e2d6');
      P('box', 5, 0, 4, 4, 3, 4, '#f1e9d8', 1); P('gable', 5, 3, 4, 4.6, 1.3, 4.6, '#b4593f');
      return;
    case 'mural':
      for (let k = 0; k < 3; k++) { P('box', -5 + k * 5, 0, 0, 4.6, 3, 9, ['#e39bb5', '#8fc1e3', '#f2d16b'][k], 1); P('gable', -5 + k * 5, 3, 0, 5, 1.2, 9.6, '#7d8e9c'); }
      return;
    case 'church':
      P('box', 0, 0, 0, 10, 6, 15, wall, 1); P('gable', 0, 6, 0, 10.8, 4, 15.8, '#8b4b3c', 0, rot + Math.PI / 2);
      P('box', 0, 0, -8, 3, 13, 3, wall); P('hip', 0, 13, -8, 3.4, 4, 3.4, '#8b4b3c');
      return;
    case 'school':
      P('box', 0, 0, -3, 18, 9, 8, closed ? '#c9bfa8' : '#e8d4a6', 2); P('box', 0, 0, 5, 18, 0.2, 8, '#c9a46a');
      P('box', 0, 9, -3, 18.4, 0.6, 8.4, '#9b6b4a');
      return;
    case 'cinema':
      P('box', 0, 0, 0, 16, 9, 15, wall, 0); P('box', 0, 6, -7.8, 14, 3, 0.5, closed ? '#8a8580' : col);
      return;
    case 'bath':
      P('box', 0, 0, 0, 14, 6, 12, wall, 1); P('box', 0, 6, 0, 14.4, 0.5, 12.4, col);
      P('box', 5, 0, 4, 1.8, 16, 1.8, '#c8b8a2'); P('box', 5, 14.4, 4, 2, 1.6, 2, closed ? '#8a8580' : '#c0392b');
      return;
    case 'market':
      P('box', 0, 0, 0, 2, 7, 2, col); P('box', 0, 6, 0, 16, 2.2, 1.2, col); P('box', 7, 0, 0, 2, 7, 2, col); P('box', -7, 0, 0, 2, 7, 2, col);
      return;
    default: {
      const two = p.kind === 'photo' || p.kind === 'books' || p.kind === 'tearoom' || p.kind === 'chinese';
      const h = two ? 6 : 3.4;
      P('box', 0, 0, 0, 13, h, 11, wall, 4);
      P('gable', 0, h, 0, 14, 2.2, 12, closed ? '#8f8a84' : col);
      P('box', 0, 2.3, -5.8, 11, 1.1, 0.5, closed ? '#9a958f' : col);
    }
  }
}

export class BuildingLayer {
  readonly group = new THREE.Group();
  private meshes = new Map<Shape, THREE.InstancedMesh>();
  private mat = material();
  private plain = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
  private parts: Part[] = [];
  /** Parts rising this decade, with their start delay. */
  private growing: { s: Shape; k: number; part: Part; delay: number }[] = [];
  private t = 0;
  heightAt: (i: number) => number = () => 0;

  /** Rebuild everything. Cells in `fresh` rise from the ground, nearest `from` first. */
  build(g: Game, fresh?: Set<number>, from?: { x: number; y: number }) {
    const parts: Part[] = [];
    const places = new Map<number, Place>();
    for (const p of g.places) if (p.state !== 'lost') places.set(p.y * N + p.x, p);
    for (let i = 0; i < N * N; i++) {
      if (g.btype[i] === B.None || g.btype[i] === B.Field) continue;
      const p = places.get(i);
      if (p) placeParts(p, i, this.heightAt(i), g, parts);
      else partsFor(g, i, this.heightAt(i), parts);
    }
    // Bridge decks: avenue over water.
    for (let i = 0; i < N * N; i++) if (g.road[i] === RoadT.Avenue && g.ground[i] === 1) {
      const x = i % N, y = (i / N) | 0;
      parts.push({ s: 'box', x: x * CELL + CELL / 2, y: 1.2, z: y * CELL + CELL / 2, w: 18, h: 1.2, d: CELL + 0.2, rot: 0, c: '#9a9590', win: 0, cell: -1, base: 0 });
      if (y % 3 === 0) parts.push({ s: 'box', x: x * CELL + CELL / 2, y: -3, z: y * CELL + CELL / 2, w: 3, h: 4.2, d: 3, rot: 0, c: '#8a8580', win: 0, cell: -1, base: 0 });
    }
    this.parts = parts;
    const by = new Map<Shape, Part[]>();
    for (const p of parts) { let a = by.get(p.s); if (!a) by.set(p.s, (a = [])); a.push(p); }
    for (const m of this.meshes.values()) { this.group.remove(m); m.geometry.dispose(); m.dispose(); }
    this.meshes.clear();
    this.growing = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    for (const [s, list] of by) {
      const geo = geometry(s);
      const win = new Float32Array(list.length);
      list.forEach((p, k) => (win[k] = p.win));
      geo.setAttribute('aWin', new THREE.InstancedBufferAttribute(win, 1));
      const mesh = new THREE.InstancedMesh(geo, s === 'box' ? this.mat : this.plain, list.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      list.forEach((p, k) => {
        q.setFromAxisAngle(up, p.rot);
        m4.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.w, p.h, p.d));
        mesh.setMatrixAt(k, m4);
        mesh.setColorAt(k, col.set(p.c));
        if (fresh && p.cell >= 0 && fresh.has(p.cell)) {
          const fx = p.cell % N, fy = (p.cell / N) | 0;
          const dist = from ? Math.hypot(fx - from.x, fy - from.y) : 0;
          this.growing.push({ s, k, part: p, delay: Math.min(1.6, dist * 0.03) + hash(p.cell, 99) * 0.25 });
        }
      });
      mesh.computeBoundingSphere();
      this.meshes.set(s, mesh);
      this.group.add(mesh);
    }
    this.t = 0;
    if (this.growing.length) this.tick(0);
  }

  get animating() { return this.growing.length > 0; }

  /** Advance the rising animation. */
  tick(dt: number) {
    if (!this.growing.length) return;
    this.t += dt;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    let done = true;
    const touched = new Set<THREE.InstancedMesh>();
    for (const gr of this.growing) {
      const k = Math.max(0, Math.min(1, (this.t - gr.delay) / 0.7));
      if (k < 1) done = false;
      const e = 1 - (1 - k) ** 3;
      const p = gr.part, mesh = this.meshes.get(gr.s)!;
      q.setFromAxisAngle(up, p.rot);
      // Roofs ride up with the walls under them.
      m4.compose(new THREE.Vector3(p.x, p.base + (p.y - p.base) * e, p.z), q, new THREE.Vector3(p.w, Math.max(0.01, p.h * e), p.d));
      mesh.setMatrixAt(gr.k, m4);
      touched.add(mesh);
    }
    for (const m of touched) m.instanceMatrix.needsUpdate = true;
    if (done) this.growing = [];
  }

  /** Total parts, for tests. */
  get count() { return this.parts.length; }
}
