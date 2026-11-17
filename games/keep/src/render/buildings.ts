import * as THREE from 'three';
import { B, CELL, type Game, idx, inside, N, type Place, RoadT } from '../sim/world';

/**
 * Every building in the 구 as instanced parts. The look follows how Korean
 * towns were actually built, decade by decade:
 *
 *  - 도시형 한옥 (1930s-60s): ㄷ/ㄱ-shaped wings round a 마당, white plaster
 *    between dark timber posts on a stone 기단, grey tiled roofs whose eaves
 *    curve up at the corners, a 담장 with a tiled coping and a little 대문.
 *  - 슬레이트·함석 집: low houses whose roofs the 새마을 years painted blue,
 *    red and green; packed tight and askew up the 달동네 hill.
 *  - 슬래브 양옥: flat concrete roofs carrying a water tank and 장독대.
 *  - 불란서 주택: two storeys under a steep coloured tile roof.
 *  - 상가주택: shops below, flats above, every floor wearing a signboard,
 *    plus a 돌출간판 sticking out; green waterproofed roof.
 *  - 적벽돌 다세대 (80s-90s): four storeys of red brick, white-framed windows,
 *    green roof with an 옥탑방 and a tank; after 2000 the ground floor opens
 *    into 필로티 parking and the brick gives way to pale tile.
 *  - 판상형 아파트: long slabs all facing south in parallel rows with green
 *    between, blank gable ends, the builder's colour band near the top.
 *  - 주상복합: a glass tower on a podium of shops.
 *  - Blue-roofed factories, a church with its red cross, the bathhouse chimney.
 *
 * Rebuilt whole when the map changes; parts new this decade rise from the ground.
 */

type Shape = 'box' | 'gable' | 'hanok' | 'hip' | 'vault' | 'tree' | 'cyl';
/** Wall pattern: 0 none, 1 house, 2 apartment, 3 glass, 4 shopfront, 5 한옥 timber, 6 brick villa. */
type Win = 0 | 1 | 2 | 3 | 4 | 5 | 6;
interface Part { s: Shape; x: number; y: number; z: number; w: number; h: number; d: number; rot: number; c: string; win: Win; cell: number; base: number }

const hash = (i: number, k: number) => { const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return s - Math.floor(s); };
const pickc = (a: string[], r: number) => a[Math.floor(r * a.length) % a.length];

const GIWA = ['#5d6773', '#66707b', '#58626d'];
const PLASTER = '#f2ece0', TIMBER = '#5b4232', STONE = '#b8b1a5';
const SAEMAEUL = ['#4f7fb0', '#b5503b', '#5e8f6a', '#8e9599', '#c27a3a', '#3f6f9f'];
const CEMENT = ['#d9d3c7', '#e4dccb', '#cfc6b5', '#e8e2d4'];
const BLOCK = '#c9c2b4';
const BRICK = ['#a5523c', '#9a5643', '#b0644a', '#8e4c3a'];
const TILE = ['#d8cfc0', '#cbbfae', '#e2dbd0', '#d3c9b8'];
const SHOPWALL = ['#d9cdb5', '#cfc2a8', '#e6e1d6', '#c4a98a', '#ddd6c8'];
const SIGN = ['#d9473b', '#2f6db3', '#e2a92b', '#3d9a62', '#c2457e', '#1f2f4a', '#f08a24'];
const TANK = ['#e07b39', '#3f78b5', '#e9e4d8', '#e07b39'];
const ROOFGREEN = '#5f9a6e';
const APT = ['#f1efe8', '#ece7dc', '#e7ecef', '#efe9df'];
const BRAND = ['#4b78a8', '#3f8f6f', '#b2524a', '#c9a640', '#6a5aa8'];
const GLASS = ['#7d9bb5', '#6f8ea6', '#8aa5b8', '#5f7f99'];
const FUTURE = ['#f4f1ea', '#e9efe9', '#efe7da'];

export const PLACE_COLOUR: Record<string, string> = {
  gukbap: '#c96f3b', bath: '#5b8fb0', barber: '#c94b4b', tearoom: '#a0663f', cinema: '#7a4fa0', hardware: '#7b7f3b', mill: '#c9a03b',
  snack: '#e07a4f', corner: '#d0a24a', briquette: '#4b4b4f', photo: '#5f7f9f', books: '#3f7f6a', chinese: '#c0392b', tree: '#5f8f3f',
  church: '#e8e2d6', school: '#d9b77a', mural: '#e39bb5', crossing: '#e2c93b', market: '#d57a2f',
};

/**
 * 한옥 roof (팔작지붕, simplified): ridge along x, footprint 1x1, height 1.
 * The slopes sag (concave), the ridge rises a touch toward its ends and the
 * eaves sweep up at the four corners (추녀).
 */
function hanokRoof(): THREE.BufferGeometry {
  const RL = 0.34; // half-length of the ridge
  const lift = (u: number) => 0.22 * Math.pow(Math.min(1, Math.abs(u) * 2), 3); // eave sweep at the corners
  const ridge = (x: number) => new THREE.Vector3(x, 1 + 0.07 * (Math.abs(x) / RL) ** 2, 0);
  const slope = (a: THREE.Vector3, b: THREE.Vector3, t: number) => {
    // From eave a (t=0) to ridge b (t=1); concave in height.
    const p = a.clone().lerp(b, t);
    p.y = a.y + (b.y - a.y) * Math.pow(t, 1.5);
    return p;
  };
  const tris: THREE.Vector3[] = [];
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => tris.push(a, b, c, a, c, d);
  const NS = 8, NT = 4;
  // Long slopes (north and south).
  for (const sz of [-1, 1]) for (let i = 0; i < NS; i++) for (let j = 0; j < NT; j++) {
    const P = (ii: number, jj: number) => {
      const u = -0.5 + ii / NS, t = jj / NT;
      return slope(new THREE.Vector3(u, lift(u), sz * 0.5), ridge(u * RL / 0.5), t);
    };
    quad(P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1));
  }
  // Hip ends (east and west): from the short eave up to the ridge end.
  for (const sx of [-1, 1]) for (let i = 0; i < NS; i++) for (let j = 0; j < NT; j++) {
    const P = (ii: number, jj: number) => {
      const w = -0.5 + ii / NS, t = jj / NT;
      const e = new THREE.Vector3(sx * 0.5, lift(w), w);
      return slope(e, ridge(sx * RL), t);
    };
    quad(P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1));
  }
  // Every face looks up: flip any triangle wound the wrong way.
  const v: number[] = [];
  const n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let k = 0; k < tris.length; k += 3) {
    let [a, b, c] = [tris[k], tris[k + 1], tris[k + 2]];
    n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
    if (n.lengthSq() < 1e-12) continue;
    if (n.y < 0) [b, c] = [c, b];
    v.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

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
    case 'hanok': return hanokRoof();
    case 'hip': return new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
    case 'vault': return new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).scale(1, 2, 1);
    case 'tree': return new THREE.IcosahedronGeometry(0.5, 0).translate(0, 0.5, 0);
    case 'cyl': return new THREE.CylinderGeometry(0.5, 0.5, 1, 10).translate(0, 0.5, 0);
  }
}

function material(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.85 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aWin;\nvarying vec3 vWP;\nvarying vec3 vWN;\nvarying float vWin;\nvarying float vLY;\nvarying float vH;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        mat4 cwM = modelMatrix * instanceMatrix;
        vWP = (cwM * vec4(transformed, 1.0)).xyz;
        vWN = normalize(mat3(cwM) * objectNormal);
        vWin = aWin; vLY = position.y; vH = length(instanceMatrix[1].xyz);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nvarying vec3 vWN;\nvarying float vWin;\nvarying float vLY;\nvarying float vH;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float st = floor(vWin + 0.5);
        if (abs(vWN.y) < 0.5 && st > 0.5) {
          vec2 t = normalize(vec2(-vWN.z, vWN.x));
          float u = dot(vWP.xz, t);
          float yl = vLY * vH;            // height above this part's foot, in metres
          float fy = yl / 3.0, fv = fract(fy);
          vec3 glassC = vec3(0.2, 0.24, 0.3);
          if (st < 1.5) {
            // Small house windows.
            float cu = fract(u / 3.4);
            float w = step(0.38, fv) * step(fv, 0.72) * step(0.3, cu) * step(cu, 0.7);
            diffuseColor.rgb = mix(diffuseColor.rgb, glassC, w);
          } else if (st < 2.5) {
            // Apartment: blank gable ends (the slabs run east-west), balconies on the long faces.
            if (abs(vWN.x) < 0.5) {
              float cu = fract(u / 2.8);
              float w = step(0.32, fv) * step(fv, 0.8) * step(0.1, cu) * step(cu, 0.9);
              if (fv < 0.28 && yl > 3.0) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95), 0.6);
              diffuseColor.rgb = mix(diffuseColor.rgb, glassC, w * step(3.0, yl));
            }
          } else if (st < 3.5) {
            float cu = fract(u / 1.8);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.34, 0.47, 0.6), step(0.08, fv) * step(cu, 0.94));
          } else if (st < 4.5) {
            // Shop: a glass front on the ground floor, ordinary windows above.
            float cu = fract(u / 3.6);
            float w = yl < 3.0 ? step(0.12, fv) * step(fv, 0.78) * step(0.06, cu) * step(cu, 0.94)
                               : step(0.3, fv) * step(fv, 0.72) * step(0.15, cu) * step(cu, 0.85);
            diffuseColor.rgb = mix(diffuseColor.rgb, glassC, w);
          } else if (st < 5.5) {
            // 한옥: timber posts and beam, a stone-faced base, papered lattice doors between.
            float cu = fract(u / 2.6);
            if (vLY < 0.2) diffuseColor.rgb = vec3(0.79, 0.76, 0.7);
            else if (vLY > 0.84 || cu < 0.07) diffuseColor.rgb = vec3(0.36, 0.26, 0.2);
            else if (vLY > 0.3 && vLY < 0.78 && cu > 0.18 && cu < 0.82) {
              float lat = max(step(fract(u * 2.2), 0.12), step(fract(yl * 2.2), 0.12));
              diffuseColor.rgb = mix(vec3(0.93, 0.88, 0.76), vec3(0.4, 0.3, 0.22), lat);
            }
          } else {
            // Brick villa: white-framed windows.
            float cu = fract(u / 3.2);
            float frame = step(0.3, fv) * step(fv, 0.8) * step(0.22, cu) * step(cu, 0.78);
            float w = step(0.34, fv) * step(fv, 0.76) * step(0.26, cu) * step(cu, 0.74);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.92, 0.88), frame);
            diffuseColor.rgb = mix(diffuseColor.rgb, glassC, w);
          }
          if (st != 3.0 && st != 5.0 && fv < 0.035 && yl > 2.9) diffuseColor.rgb *= 0.88;
          diffuseColor.rgb *= mix(0.72, 1.0, smoothstep(0.0, 2.5, yl));
        }`);
  };
  m.customProgramCacheKey = () => 'keep-building-2';
  return m;
}

type Put = (s: Shape, dx: number, dy: number, dz: number, w: number, h: number, d: number, c: string, win?: Win, dr?: number) => void;

/** A placer in the lot's own frame: front (-z) faces `rot`, offsets in metres from the cell centre. */
function placer(out: Part[], i: number, cx: number, cz: number, y0: number, rot: number): Put {
  return (s, dx, dy, dz, w, h, d, c, win = 0, dr = 0) => {
    const c0 = Math.cos(rot), s0 = Math.sin(rot);
    out.push({ s, x: cx + dx * c0 + dz * s0, y: y0 + dy, z: cz - dx * s0 + dz * c0, w, h, d, rot: rot + dr, c, win, cell: i, base: y0 });
  };
}

/** Which way the lot's front faces: toward a road, south first (남향). */
function facing(g: Game, x: number, y: number): number {
  const road = (dx: number, dy: number) => inside(x + dx, y + dy) && g.road[idx(x + dx, y + dy)] > 0;
  if (road(0, 1)) return Math.PI;
  if (road(0, -1)) return 0;
  if (road(1, 0)) return -Math.PI / 2;
  if (road(-1, 0)) return Math.PI / 2;
  return Math.PI;
}

/** A water tank and a few 장독 on a flat roof at height h. */
function roofLife(P: Put, h: number, r: (k: number) => number, x = 0, z = 0) {
  P('cyl', x + 3, h, z + 2, 1.8, 1.9, 1.8, pickc(TANK, r(60)));
  if (r(61) < 0.6) for (let k = 0; k < 3; k++) P('cyl', x - 3 + k * 1.1, h, z - 1.5 + (k % 2) * 0.9, 0.8, 0.9, 0.8, '#5a3b2a');
}

/** The parts of one cell's building. `y0` is the ground height there. */
function partsFor(g: Game, i: number, y0: number, out: Part[]) {
  const t = g.btype[i];
  if (t === B.None || t === B.Field) return;
  const x = i % N, y = (i / N) | 0;
  const cx = x * CELL + CELL / 2, cz = y * CELL + CELL / 2;
  const r = (k: number) => hash(i, k);
  const rot = facing(g, x, y);
  const P = placer(out, i, cx, cz, y0, rot);
  const hill = g.district[i] >= 0 && g.districts[g.district[i]].kind === 'hill';
  switch (t) {
    case B.Giwa: {
      // 도시형 한옥: 안채 at the back, one or two wings, a 마당 between, 담장 and 대문 on the street.
      const roof = pickc(GIWA, r(2));
      P('box', 0, 0, 4.6, 17, 0.6, 6.4, STONE);
      P('box', 0, 0.6, 4.6, 15, 2.8, 4.2, PLASTER, 5);
      P('hanok', 0, 3.3, 4.6, 18.6, 2.7, 7.8, roof);
      const wings = r(3) < 0.55 ? [-1, 1] : [r(4) < 0.5 ? -1 : 1];
      for (const sx of wings) {
        P('box', sx * 6.6, 0, -2, 5.2, 0.5, 8, STONE);
        P('box', sx * 6.6, 0.5, -2, 3.6, 2.5, 7, PLASTER, 5);
        P('hanok', sx * 6.6, 2.95, -2, 9.4, 2.2, 6, roof, 0, Math.PI / 2);
      }
      // 담장 with a tiled coping, and the gate.
      P('box', -2.4, 0, -9.3, 15, 1.7, 0.6, '#d6cab1');
      P('box', -2.4, 1.7, -9.3, 15.6, 0.35, 1.2, roof);
      P('box', 7.8, 0, -9.3, 1, 2.4, 1, TIMBER);
      P('hanok', 6.9, 2.4, -9.3, 4.4, 1.2, 2.4, roof);
      break;
    }
    case B.Slate: {
      if (hill) {
        // 달동네: three small houses squeezed together, each a little askew.
        for (let k = 0; k < 3; k++) {
          const dx = -6 + k * 6 + (r(10 + k) - 0.5) * 2, dz = (r(20 + k) - 0.5) * 8, dr = (r(30 + k) - 0.5) * 0.5;
          const flat = r(40 + k) < 0.3;
          P('box', dx, 0, dz, 5.6, 2.5, 5.4, pickc(CEMENT, r(50 + k)), 1, dr);
          if (flat) P('cyl', dx + 1.2, 2.5, dz, 1.3, 1.4, 1.3, pickc(TANK, r(55 + k)));
          else P('gable', dx, 2.5, dz, 6.2, 1.1, 6.0, pickc(SAEMAEUL, r(60 + k)), 0, dr);
        }
        break;
      }
      const v = r(1);
      if (v < 0.5) {
        // 슬레이트·함석 집 two to a lot, roofs in 새마을 colours, a block wall in front.
        for (const k of [0, 1]) {
          const dx = k ? 4.6 : -4.6, dz = 1 + (r(3 + k) - 0.5) * 3;
          P('box', dx, 0, dz, 8, 2.8, 8.5, pickc(CEMENT, r(5 + k)), 1);
          P('gable', dx, 2.8, dz, 8.8, 1.4, 9.4, pickc(SAEMAEUL, r(7 + k)));
        }
        P('box', 0, 0, -9.3, 19, 1.5, 0.4, BLOCK);
      } else if (v < 0.85) {
        // 슬래브 양옥: a flat concrete roof with a parapet, tank and 장독대, green iron gate.
        const h = r(2) < 0.4 ? 5.8 : 3;
        P('box', 0, 0, 1.5, 13, h, 11, r(3) < 0.3 ? pickc(BRICK, r(4)) : pickc(CEMENT, r(4)), 1);
        P('box', 0, h, 1.5, 13.2, 0.5, 11.2, '#bdb6a8');
        roofLife(P, h, r, 0, 1.5);
        P('box', -2, 0, -9.3, 15, 1.6, 0.4, BLOCK);
        P('box', 6.6, 0, -9.3, 3, 2, 0.3, '#3d7a5a');
      } else {
        // 불란서 주택: two storeys under a steep coloured roof.
        P('box', 0, 0, 1, 11, 5.6, 10, pickc(['#efe6d2', '#e8dcc6', '#f1ece2'], r(4)), 1);
        P('gable', 0, 5.6, 1, 11.8, 3.8, 10.8, pickc(['#b5503b', '#3f6f9f', '#4d7a52', '#7a4a3a'], r(5)));
        P('box', 0, 0, -9.3, 19, 1.4, 0.4, pickc(BRICK, r(6)));
      }
      break;
    }
    case B.Shop: {
      // 상가주택: shops below, flats above, a signboard on every floor.
      const f = Math.max(2, g.floors[i]), h = f * 3;
      P('box', 0, 0, -0.5, 16, h, 13, r(1) < 0.2 ? pickc(BRICK, r(2)) : pickc(SHOPWALL, r(2)), 4);
      for (let k = 0; k < f; k++) {
        const sw = k === 0 ? 15 : 8 + r(70 + k) * 6, sx = k === 0 ? 0 : (r(80 + k) - 0.5) * (15 - sw);
        P('box', sx, k * 3 + 2.05, -7.15, sw, 0.85, 0.3, pickc(SIGN, r(90 + k)));
        P('box', sx, k * 3 + 2.3, -7.32, sw * 0.6, 0.35, 0.12, '#f6f1e4');
      }
      P('box', 7.6, 3.4, -8.1, 0.4, Math.min(h - 3.6, 4.5), 1.6, pickc(SIGN, r(5)));
      P('box', 0, h, -0.5, 16, 0.25, 13, ROOFGREEN);
      roofLife(P, h, r, 0, 0);
      break;
    }
    case B.Market: {
      P('box', 0, 0, -4, 18, 2.6, 6, pickc(SHOPWALL, r(1)), 4);
      P('box', 0, 0, 4, 18, 2.6, 6, pickc(SHOPWALL, r(2)), 4);
      P('vault', 0, 2.6, 0, 19, 1.4, 9, pickc(['#d9a04a', '#5b8fbf', '#c96a52', '#86b06a', '#e8e2d4'], r(3)));
      if (r(4) < 0.5) P('cyl', 5, 0, -5, 3.2, 0.25, 3.2, pickc(['#d9473b', '#2f6db3', '#e2a92b'], r(5)));
      break;
    }
    case B.Factory: {
      // Blue sawtooth roofs, the colour of every Korean works yard.
      P('box', 0, 0, 0, 18, 5, 16, '#cfc8b8', 0);
      for (let k = 0; k < 3; k++) P('gable', 0, 5, -5.3 + k * 5.3, 18.4, 2, 5.4, '#4a78a8');
      if (r(4) < 0.5) P('cyl', 6, 0, 6, 1.6, 16, 1.6, '#b25b44');
      break;
    }
    case B.Villa: {
      // 다세대: red brick until the late 90s, then pale tile over 필로티 parking.
      const h = 3 * Math.max(3, g.floors[i]);
      if (g.built[i] >= 1998) {
        for (const [px, pz] of [[-6.5, -5], [6.5, -5], [-6.5, 5], [6.5, 5]]) P('box', px, 0, pz, 0.8, 3, 0.8, '#bdb6a8');
        P('box', 0, 3, 0, 15, h - 3, 12, pickc(TILE, r(1)), 6);
      } else P('box', 0, 0, 0, 15, h, 12, pickc(BRICK, r(1)), 6);
      P('box', 0, h, 0, 15.2, 0.3, 12.2, ROOFGREEN);
      P('box', 3.5, h, 2.5, 5, 2.6, 4.5, r(2) < 0.5 ? '#e6e1d6' : pickc(BRICK, r(1)), 1);
      P('box', 3.5, h + 2.6, 2.5, 5.4, 0.25, 4.9, '#3f6f9f');
      roofLife(P, h, r, -3, -2);
      break;
    }
    case B.Apt: {
      // 판상형: slabs run east-west so every flat faces south; every third row is the 단지 garden.
      const A = placer(out, i, cx, cz, y0, 0);
      if (y % 3 === 2) {
        for (let k = 0; k < 3; k++) A('tree', -6 + k * 6, 0, (r(10 + k) - 0.5) * 8, 5, 7 + r(20 + k) * 3, 5, pickc(['#6c9f4f', '#7aab55', '#5e8f45'], r(30 + k)));
        if (r(5) < 0.4) A('box', 4, 0, 4, 6, 0.3, 4, '#d8b27a');
        break;
      }
      const h = 3 * Math.max(8, g.floors[i]);
      const end = x % 5 === 4;
      const w = end ? 12 : 20.2, ox = end ? -4 : 0;
      const col = pickc(APT, hash(y, 3)), brand = pickc(BRAND, hash(y, 4));
      A('box', ox, 0, 0, w, h, 11, col, 2);
      A('box', ox, h - 2.6, 0, w + 0.05, 1.3, 11.05, brand);
      A('box', ox, h, 0, w, 0.4, 11, '#d8d3c8');
      if (x % 2 === 0) A('box', ox, h, 0, 3, 3.2, 4, '#e9e5dc');
      break;
    }
    case B.Tower: {
      // 주상복합: a shop podium, then a cross-shaped glass tower.
      const h = 3 * Math.max(20, g.floors[i]);
      P('box', 0, 0, 0, 18, 9, 18, '#d8d5cc', 4);
      const glass = pickc(GLASS, r(1));
      P('box', 0, 9, 0, 15, h - 9, 9, glass, 3);
      P('box', 0, 9, 0, 9, h - 15, 15, glass, 3);
      P('box', 0, h, 0, 7, 4, 7, '#cfd3d6');
      break;
    }
    case B.Office: {
      const h = 3 * Math.max(8, g.floors[i]);
      P('box', 0, 0, 0, 17, 4, 15, '#c8c2b5', 4);
      P('box', 0, 4, 0, 16, h - 4, 14, pickc(['#9fb2c2', '#b9c0c4', '#8ea7b9', '#a7b4bd'], r(1)), 3);
      P('box', 0, h, 0, 6, 2.4, 6, '#c9cbcc');
      break;
    }
    case B.Future: {
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
      if (r(9) < 0.5) P('box', 0, 0, 0, 3, 0.5, 1, '#8a6a4a');
      break;
    }
    case B.Vacant: {
      // An empty house: faded walls, a broken roof, weeds.
      P('box', 0, 0, 0, 9, 2.6, 9, '#b9b2a2', 0);
      P('gable', 0, 2.6, 0, 9.6, 1, 10, '#7a7570', 0, 0.06);
      P('tree', 5, 0, 5, 3, 1.6, 3, '#8a9a5a');
      P('tree', -4, 0, -5, 2.4, 1.2, 2.4, '#8a9a5a');
      break;
    }
    case B.Place: break; // drawn by placeParts
  }
}

/** A 기억 장소: its own colours, a little taller than its neighbours so it reads from afar. */
function placeParts(p: Place, i: number, y0: number, g: Game, out: Part[]) {
  const cx = p.x * CELL + CELL / 2, cz = p.y * CELL + CELL / 2;
  const P = placer(out, i, cx, cz, y0, facing(g, p.x, p.y));
  const col = PLACE_COLOUR[p.kind] ?? '#d0a24a';
  const closed = p.state === 'closed';
  const sign = closed ? '#9a958f' : col;
  const wall = closed ? '#b8b1a4' : '#f1e9d8';
  const shop = (floors: number, w = 14) => {
    const h = floors * 3;
    P('box', 0, 0, 0, w, h, 11, wall, 4);
    P('box', 0, 2.1, -5.65, w - 1, 0.95, 0.35, sign);
    P('box', 0, 2.35, -5.85, (w - 1) * 0.55, 0.4, 0.12, '#f6f1e4');
    P('box', 0, h, 0, w, 0.25, 11, ROOFGREEN);
    return h;
  };
  switch (p.kind) {
    case 'tree':
      // 당산나무 with a stone platform and a 평상.
      P('box', 0, 0, 0, 9, 0.6, 9, STONE);
      P('box', 0, 0.6, 0, 1.6, 6, 1.6, '#6b5440');
      P('tree', 0, 4, 0, 18, 13, 18, closed ? '#8a9a6a' : '#5e9447');
      P('box', 5, 0, -6, 4, 0.6, 2.4, '#8a6a4a');
      return;
    case 'crossing':
      P('box', -6, 0, 0, 0.6, 4, 0.6, '#e2c93b'); P('box', -6, 3.4, 3, 0.4, 0.4, 7, '#e8e2d6');
      P('box', 5, 0, 4, 4, 3, 4, '#f1e9d8', 1); P('gable', 5, 3, 4, 4.6, 1.3, 4.6, '#b4593f');
      return;
    case 'mural':
      for (let k = 0; k < 3; k++) { P('box', -5 + k * 5, 0, 0, 4.6, 3, 9, ['#e39bb5', '#8fc1e3', '#f2d16b'][k], 1); P('gable', -5 + k * 5, 3, 0, 5, 1.2, 9.6, pickc(SAEMAEUL, k / 3)); }
      return;
    case 'church': {
      // The red cross on a steeple: the one thing every Korean skyline has.
      P('box', 0, 0, 2, 10, 6, 13, wall, 1); P('gable', 0, 6, 2, 13.8, 4, 10.8, '#8b4b3c', 0, Math.PI / 2);
      P('box', 0, 0, -6.5, 3.4, 14, 3.4, wall); P('hip', 0, 14, -6.5, 3.8, 4, 3.8, '#8b4b3c');
      P('box', 0, 18, -6.5, 0.45, 5, 0.45, '#d8262a'); P('box', 0, 21, -6.5, 2.6, 0.45, 0.45, '#d8262a');
      return;
    }
    case 'school':
      // A long ㅡ-shaped block facing a sand 운동장, with a flagpole.
      P('box', 0, 0, 4, 19, 12, 7, closed ? '#c9bfa8' : '#e8d4a6', 2);
      P('box', 0, 12, 4, 19.4, 0.6, 7.4, '#9b6b4a');
      P('box', 0, 0, -4, 19, 0.15, 9, '#d9bf8a');
      P('cyl', -7, 0, -7.5, 0.3, 9, 0.3, '#e8e8e8');
      return;
    case 'cinema':
      P('box', 0, 0, 0, 16, 10, 15, wall, 0); P('box', 0, 6, -7.75, 14, 3.6, 0.5, sign);
      P('box', 0, 2.2, -7.9, 14, 0.8, 0.3, '#f2d16b');
      return;
    case 'bath': {
      // 목욕탕: blue-tiled block and its tall chimney.
      P('box', 0, 0, 0, 14, 6, 12, closed ? '#b8b1a4' : '#cfe0e8', 1); P('box', 0, 6, 0, 14.2, 0.4, 12.2, ROOFGREEN);
      P('box', 0, 4.2, -6.1, 6, 1.4, 0.3, sign);
      P('cyl', 5, 0, 4, 1.8, 18, 1.8, '#c8b8a2'); P('cyl', 5, 15.2, 4, 1.95, 1.4, 1.95, closed ? '#8a8580' : '#c0392b');
      return;
    }
    case 'market':
      P('box', -7, 0, 0, 1.6, 7, 1.6, col); P('box', 7, 0, 0, 1.6, 7, 1.6, col);
      P('box', 0, 6, 0, 16, 2.2, 1.4, col); P('box', 0, 6.6, -0.75, 10, 0.9, 0.15, '#f6f1e4');
      return;
    case 'gukbap': case 'mill': {
      // An old tiled house turned shop.
      P('box', 0, 0, 1, 15, 0.5, 9, STONE);
      P('box', 0, 0.5, 1, 13, 2.8, 7.5, wall, 5);
      P('hanok', 0, 3.3, 1, 16.4, 2.6, 10.6, closed ? '#6d7177' : pickc(GIWA, 0));
      P('box', 0, 2.2, -2.95, 8, 0.9, 0.3, sign);
      if (p.kind === 'mill') P('cyl', 5, 0, 5, 1, 9, 1, '#9a8f80');
      return;
    }
    case 'briquette':
      P('box', 0, 0, 2, 14, 3.4, 9, '#c9c2b4', 0); P('gable', 0, 3.4, 2, 14.6, 1.2, 9.6, '#8e9599');
      for (let k = 0; k < 4; k++) P('box', -5 + k * 3.2, 0, -5, 2.4, 1.6, 2.4, '#2e2e31');
      P('box', 0, 2.2, -2.6, 8, 0.8, 0.3, sign);
      return;
    case 'barber':
      shop(2);
      P('cyl', 6, 0, -6.4, 0.6, 2.4, 0.6, closed ? '#9a958f' : '#e04848');
      return;
    case 'corner':
      shop(1, 12);
      P('box', -3, 0, -8, 4, 0.5, 2, '#8a6a4a'); // 평상
      return;
    default:
      shop(p.kind === 'tearoom' || p.kind === 'photo' || p.kind === 'chinese' || p.kind === 'books' ? 3 : 2);
  }
}

export class BuildingLayer {
  readonly group = new THREE.Group();
  private meshes = new Map<Shape, THREE.InstancedMesh>();
  private mat = material();
  private plain = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
  private roofMat = new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide });
  private parts: Part[] = [];
  /** Parts rising this decade, with their start delay. */
  private growing: { s: Shape; k: number; part: Part; delay: number }[] = [];
  private t = 0;
  heightAt: (i: number) => number = () => 0;
  /** Highest corner of a cell: on a slope, houses stand on a stone 축대 up to here. */
  topAt: (i: number) => number = () => 0;

  /** Rebuild everything. Cells in `fresh` rise from the ground, nearest `from` first. */
  build(g: Game, fresh?: Set<number>, from?: { x: number; y: number }) {
    const parts: Part[] = [];
    const places = new Map<number, Place>();
    for (const p of g.places) if (p.state !== 'lost') places.set(p.y * N + p.x, p);
    for (let i = 0; i < N * N; i++) {
      if (g.btype[i] === B.None || g.btype[i] === B.Field) continue;
      const p = places.get(i);
      let y0 = this.heightAt(i);
      const top = this.topAt(i);
      const t = g.btype[i];
      if (top - y0 > 0.8 && t !== B.Park && t < B.Apt) {
        // Terrace the slope: a stone retaining wall, the house on top.
        const x = i % N, y = (i / N) | 0;
        parts.push({ s: 'box', x: x * CELL + CELL / 2, y: y0 - 0.5, z: y * CELL + CELL / 2, w: 19.6, h: top - y0 + 0.6, d: 19.6, rot: 0, c: '#a39b8d', win: 0, cell: i, base: y0 - 0.5 });
        y0 = top + 0.1;
      }
      if (p) placeParts(p, i, y0, g, parts);
      else partsFor(g, i, y0, parts);
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
      const mesh = new THREE.InstancedMesh(geo, s === 'box' ? this.mat : s === 'hanok' ? this.roofMat : this.plain, list.length);
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
