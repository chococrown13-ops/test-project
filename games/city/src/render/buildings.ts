import * as THREE from 'three';
import { CELL, KINDS, N, variantOf } from '../sim/defs';
import { network } from '../sim/network';
import type { Building, World } from '../sim/world';
import { buildingMaterial, shared } from './materials';

/**
 * Every building is a handful of parts — boxes, sawtooth prisms, cylinders,
 * cones — drawn through one instanced mesh per shape. A Korean street needs
 * variety more than detail: villas in brick with green roofs, 필로티 다세대,
 * white apartment slabs with a brand stripe, shop buildings covered in signs.
 */

type Shape = 'box' | 'prism' | 'cyl' | 'cone' | 'vault' | 'neon';
interface Part {
  shape: Shape;
  x: number; y: number; z: number; // base centre
  sx: number; sy: number; sz: number;
  rot: number;
  color: string;
  style: number; // see materials.ts; prisms and cylinders ignore it
  sign?: string;
}

const STYLE = { villa: 0, apt: 1, shops: 2, office: 3, factory: 4, plain: 5 };

const pick = <T,>(a: T[], r: number) => a[Math.floor(r * a.length) % a.length];
/** A small deterministic sequence per building. */
function seq(seed: number) {
  let s = Math.floor(seed * 2 ** 31) || 1;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

/** Signboard colour per 상가 trade, in VARIANTS order. */
const C1_SIGN = ['#2bb24c', '#f2c12e', '#3d6b4f', '#2f6fd6', '#e2559b', '#1f4e9a', '#e8743b'];
const BRICK = ['#a8553f', '#b4674a', '#c9a27e', '#e6ddcc', '#d6c7ad', '#94493a', '#cdb79a'];
const TILE = ['#ebe8e1', '#dcd5c6', '#c9b89d', '#c3cacd', '#e3d7c3', '#d4c6b0'];
const APT = ['#f1efe9', '#ebe6db', '#e2e6e8', '#eeeae2'];
const BRAND = ['#2f6db5', '#1c8c6e', '#c0392b', '#7b5aa6', '#d98a1c', '#2c3e50', '#0e7c86'];
const SHOP = ['#d9d2c5', '#c8bfae', '#e6e1d6', '#b7aa94', '#cfd3d6', '#e3e0da'];
const SIGN = ['#e74c3c', '#f1c40f', '#3498db', '#2ecc71', '#e67e22', '#9b59b6', '#ff6fa1', '#1abc9c'];
const FACTORY = ['#b8b2a6', '#9aa3a8', '#c2b8a3', '#8f9a92', '#a9a59b'];
const FROOF = ['#4d6f9a', '#5e8a6e', '#7d8a93', '#3f6a8f'];

function parts(b: Building, w: World): Part[] {
  const r = seq(b.look + b.id * 0.0137);
  const S = b.size * CELL;
  const cx = b.x * CELL + S / 2, cz = b.y * CELL + S / 2;
  const out: Part[] = [];
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, style = STYLE.plain, sign?: string, rot = 0) =>
    out.push({ shape: 'box', x: cx + x, y, z: cz + z, sx, sy, sz, rot, color, style, sign });
  const shape = (s: Shape, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, rot = 0) =>
    out.push({ shape: s, x: cx + x, y, z: cz + z, sx, sy, sz, rot, color, style: STYLE.plain });
  const H = b.floors * 3;
  // Long buildings run along their access road.
  const a = network(w).access.get(b.id);
  const along = a === undefined ? 0 : Math.abs((a % N) * CELL + 5 - cx) > Math.abs(Math.floor(a / N) * CELL + 5 - cz) ? Math.PI / 2 : 0;
  const rooftop = (top: number, wdt: number) => {
    if (r() < 0.75) box((r() - 0.5) * (wdt - 3), top, (r() - 0.5) * (wdt - 3), 2.6, 2.4, 2.2, '#e9e4d8');
    if (r() < 0.6) shape('cyl', (r() - 0.5) * (wdt - 2), top, (r() - 0.5) * (wdt - 2), 1.4, 1.3, 1.4, pick(['#4f7fb5', '#5d9c74', '#d8d4cc'], r()));
  };
  switch (b.kind) {
    case 'r1': {
      const wdt = 7 + r() * 1.6, dep = 7 + r() * 1.6;
      box((r() - 0.5) * 1.2, 0, (r() - 0.5) * 1.2, wdt, H, dep, pick(BRICK, r()), STYLE.villa);
      rooftop(H, Math.min(wdt, dep));
      break;
    }
    case 'r2': {
      const wdt = 8.2 + r() * 1, dep = 8 + r() * 1;
      const col = pick(TILE, r());
      box(0, 0, 0, wdt - 1.6, 3, dep - 1.6, '#5f6062');
      for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(px * (wdt / 2 - 0.4), 0, pz * (dep / 2 - 0.4), 0.6, 3, 0.6, col);
      box(0, 3, 0, wdt, H - 3, dep, col, STYLE.villa);
      rooftop(H, Math.min(wdt, dep));
      break;
    }
    case 'r3': {
      const col = pick(APT, r()), brand = pick(BRAND, r());
      if (b.look < 0.55) {
        // Two 판상형 slabs, the classic 아파트 단지 silhouette.
        for (const off of [-4.6, 4.6]) {
          const h = H - (off > 0 ? Math.floor(r() * 3) * 3 : 0);
          box(Math.sin(along) * off, 0, Math.cos(along) * off, 16.5, h, 4.6, col, STYLE.apt, brand, along);
          box(Math.sin(along) * off, h, Math.cos(along) * off, 4, 2.2, 3.2, col, STYLE.plain, undefined, along);
        }
      } else {
        // 탑상형 towers in a pair.
        for (const off of [-4.5, 4.5]) {
          const h = H - (off > 0 ? 6 : 0);
          box(Math.cos(along) * off, 0, Math.sin(along) * off, 8, h, 8, col, STYLE.apt, brand, along);
          box(Math.cos(along) * off, h, Math.sin(along) * off, 5, 2.4, 5, brand);
        }
      }
      box(Math.cos(along) * 8.2, 0, Math.sin(along) * 8.2, 2.2, 2.6, 2.2, '#d9d2c3'); // 경비실
      break;
    }
    case 'c1': {
      // The trade decides the signboard: 편의점, 치킨집, 카페, PC방, 노래방, 부동산, 분식집.
      const v = variantOf('c1', b.look);
      const wdt = 8.2 + r() * 1.2, dep = 8.2 + r() * 1.2;
      box(0, 0, 0, wdt, H, dep, pick(SHOP, r()), STYLE.shops, C1_SIGN[v]);
      if (v === 0) box(0, 3.05, dep / 2 + 0.05, wdt * 0.9, 0.5, 0.2, C1_SIGN[v]); // the lit fascia of a 편의점
      if (v === 2) shape('prism', 0, 2.6, dep / 2 + 0.6, wdt * 0.8, 0.6, 1.2, '#2f5a43'); // café awning
      rooftop(H, Math.min(wdt, dep));
      break;
    }
    case 'c2': {
      const v = variantOf('c2', b.look);
      const wdt = 8.6 + r() * 0.8, dep = 8.6 + r() * 0.8;
      box(0, 0, 0, wdt, H, dep, pick(SHOP, r()), STYLE.shops, v === 1 ? '#f2c12e' : v === 2 ? '#2fa35a' : pick(SIGN, r()));
      box(0, H, 0, wdt - 1, 0.8, dep - 1, '#9c9a94');
      if (v === 3) {
        // A church upstairs: the red neon cross that lights up Korean skylines at night.
        out.push({ shape: 'neon', x: cx + wdt / 4, y: H + 0.8, z: cz, sx: 0.32, sy: 3.4, sz: 0.32, rot: 0, color: '#ff3b30', style: 0 });
        out.push({ shape: 'neon', x: cx + wdt / 4, y: H + 3.0, z: cz, sx: 1.7, sy: 0.32, sz: 0.32, rot: 0, color: '#ff3b30', style: 0 });
      } else rooftop(H + 0.8, wdt - 1);
      break;
    }
    case 'c3': {
      box(0, 0, 0, 18.4, 9, 18.4, '#b9b4ab', STYLE.shops, pick(SIGN, r()));
      const tw = 11 + r() * 3, td = 10 + r() * 3;
      const glass = pick(['#7c90a6', '#8aa1a8', '#6d7f94', '#9aa7b4'], r());
      box(0, 9, 0, tw, H - 9, td, glass, STYLE.office);
      let top = H;
      if (r() < 0.5) { box(0, H, 0, tw * 0.7, 6, td * 0.7, glass, STYLE.office); top += 6; }
      box(0, top, 0, 3, 2.5, 3, '#c9cbcc');
      break;
    }
    case 'i1':
    case 'i2': {
      const big = b.kind === 'i2';
      const wdt = big ? 9 : 8, dep = big ? 9 : 7.5, h = 4 + b.floors * 1.8;
      box(0, 0, 0, wdt, h, dep, pick(FACTORY, r()), STYLE.factory);
      const roof = pick(FROOF, r()), teeth = 3;
      for (let k = 0; k < teeth; k++) shape('prism', 0, h, -dep / 2 + dep / teeth * (k + 0.5), wdt, 1.8, dep / teeth, roof);
      if (big) shape('cyl', wdt / 2 - 1.2, h, dep / 2 - 1.2, 1.1, 9, 1.1, '#c9c2b8');
      else if (r() < 0.5) shape('cyl', -wdt / 2 + 1.4, 0, dep / 2 - 1.4, 2.4, 3.5, 2.4, '#d1d6d9');
      break;
    }
    case 'i3': {
      box(0, 0, -2, 17, 10, 11, '#e6eaee', STYLE.office);
      box(-4, 0, 6, 8, 16 + r() * 6, 6, '#a9bccb', STYLE.office);
      box(5, 0, 6.5, 6, 4, 5, '#d3d8dc', STYLE.factory);
      break;
    }
    case 'coal': {
      box(-3, 0, 2, 16, 15, 12, '#a7a199', STYLE.factory);
      box(-3, 15, 2, 16, 1, 12, '#7d7a74');
      shape('cyl', 7, 0, -6, 2.4, 46, 2.4, '#d8d2c8');
      shape('cyl', 3, 0, -6, 2.4, 46, 2.4, '#d8d2c8');
      shape('cyl', 7, 40, -6, 2.5, 4, 2.5, '#c0392b');
      shape('cyl', 3, 40, -6, 2.5, 4, 2.5, '#c0392b');
      shape('cone', -8, 0, -8, 11, 20, 11, '#cfcac0');
      shape('prism', 9, 0, 9, 9, 3.5, 9, '#2a2a2c');
      break;
    }
    case 'solar': {
      box(0, 0, 0, 19, 0.2, 19, '#a7a395');
      for (let k = 0; k < 5; k++) shape('prism', 0, 0.2, -7.6 + k * 3.8, 17, 1.6, 2.8, '#24365e');
      break;
    }
    case 'water': {
      box(-7, 0, -7, 12, 8, 10, '#dfe3e6', STYLE.apt, '#2f77b5');
      for (const [px, pz] of [[6, -6], [6, 6], [-6, 7]]) {
        shape('cyl', px, 0, pz, 9, 2.4, 9, '#c7cfd4');
        shape('cyl', px, 2.4, pz, 8, 0.05, 8, '#4a8db5');
      }
      break;
    }
    case 'sewage': {
      for (const pz of [-5, 4]) {
        box(-3, 0, pz, 11, 1.6, 7, '#b6b2a8');
        box(-3, 1.6, pz, 10, 0.05, 6, '#6d7f5a');
      }
      shape('cyl', 6, 0, 0, 6, 2, 6, '#b6b2a8');
      shape('cyl', 6, 2, 0, 5.2, 0.05, 5.2, '#7a8a62');
      break;
    }
    case 'park': {
      if (b.look < 0.4) { box(0, 0, 0, 3.4, 2.6, 3.4, '#8a5a3a'); shape('prism', 0, 2.6, 0, 4.6, 1.4, 4.6, '#6b3d2a'); }
      else if (b.look < 0.7) shape('cyl', 0, 0, 0, 3.2, 0.5, 3.2, '#c9c2b0');
      break;
    }
    case 'school': {
      box(Math.sin(along) * 4.5, 0, Math.cos(along) * 4.5, 17, 12, 6, '#e8dcc0', STYLE.apt, '#2f6db5', along);
      box(Math.sin(along) * 4.5 + Math.cos(along) * 7, 12, Math.cos(along) * 4.5 - Math.sin(along) * 7, 3, 3, 3, '#d8ccb0');
      break;
    }
    case 'police': box(0, 0, 0, 8, 9, 8, '#e9edf2', STYLE.apt, '#1f4e9a'); break;
    case 'fire':
      box(0, 0, 0, 8.4, 7.5, 8, '#efe9e1', STYLE.apt, '#c0392b');
      box(0, 0, 3.8, 6, 4, 0.6, '#b03a2e');
      box(-3, 7.5, -2.5, 2.2, 6, 2.2, '#efe9e1');
      break;
    case 'metro':
      // A Korean subway exit: a glass canopy over the stairs and a lit station sign.
      box(0, 0, 0, 5.2, 0.4, 7.4, '#5b6066');
      box(0, 0.4, 1.2, 4.2, 2.6, 4.6, '#a7c4d6', STYLE.office);
      box(0, 3.0, 0.6, 4.8, 0.35, 6.2, '#e7ebee');
      box(-3.2, 0, -2.6, 0.5, 4.2, 0.5, '#e7ebee');
      box(-3.2, 4.2, -2.6, 1.6, 1.0, 0.4, '#263c96');
      break;
    case 'market': {
      // 전통시장: two rows of stalls under a translucent arcade roof.
      for (const z of [-4.6, 4.6]) {
        box(0, 0, z, 18, 3, 3.2, '#d9cfbf', STYLE.shops, pick(SIGN, r()));
        for (let k = 0; k < 4; k++) shape('prism', -6.75 + k * 4.5, 2.4, z - Math.sign(z) * 2.1, 4.2, 0.7, 1.2, pick(['#d9483b', '#2f6db5', '#e0a400', '#2e9e4f'], r()), z > 0 ? 0 : Math.PI);
      }
      shape('vault', 0, 4.2, 0, 19, 3.2, 12.4, '#a9cfe3');
      box(-9.6, 0, -6.4, 0.5, 6.4, 0.5, '#7a3b2e');
      box(-9.6, 0, 6.4, 0.5, 6.4, 0.5, '#7a3b2e');
      box(-9.6, 6.0, 0, 0.6, 1.4, 13.4, '#c0392b');
      break;
    }
    case 'riverpark': {
      // 한강공원: a bike path, a kiosk, picnic tents.
      box(0, 0, 3, 19.6, 0.06, 2, '#d9c08a');
      box(-6, 0, -4, 3.4, 2.8, 3, '#f4f6f6', STYLE.shops, '#2bb24c');
      for (const [x, z, col] of [[2, -5, '#e74c3c'], [6, -3, '#3498db'], [3, -1, '#f1c40f']] as [number, number, string][]) {
        shape('prism', x, 0, z, 2.2, 1.4, 1.1, col, 0);
        shape('prism', x, 0, z - 1.1, 2.2, 1.4, 1.1, col, Math.PI);
      }
      for (const x of [-2, 8]) box(x, 0, 6, 1.6, 0.45, 0.5, '#8a5a3a');
      break;
    }
    case 'palace': {
      // 고궁: stone terrace, a hall with red pillars and green eaves, tiled gable roof, walls and a gate.
      const S2 = 13.5;
      for (const [x, z, sx, sz] of [[0, -S2, 27, 0.8], [0, S2, 27, 0.8], [-S2, 0, 0.8, 27], [S2, 0, 0.8, 27]] as number[][]) {
        box(x, 0, z, sx, 2.6, sz, '#d8cfc0');
        box(x, 2.6, z, sx + 0.6, 0.5, sz + 0.6, '#4a4f55');
      }
      box(0, 0, -2, 20, 1.4, 14, '#cfc8b8');
      box(0, 1.4, -2, 15, 4.6, 8, '#a33b2c');
      box(0, 6, -2, 18.5, 0.7, 11.5, '#2f6b5e');
      shape('prism', 0, 6.7, -2 + 3, 19, 4.2, 6, '#474c52', Math.PI);
      shape('prism', 0, 6.7, -2 - 3, 19, 4.2, 6, '#474c52', 0);
      box(0, 0, S2, 7, 4.6, 3, '#a33b2c');
      box(0, 4.6, S2, 8.6, 0.5, 4.4, '#2f6b5e');
      shape('prism', 0, 5.1, S2 + 1.1, 9, 2.4, 2.2, '#474c52', Math.PI);
      shape('prism', 0, 5.1, S2 - 1.1, 9, 2.4, 2.2, '#474c52', 0);
      break;
    }
    case 'tower': {
      // 전망타워 on the hilltop, its beacon red at night.
      box(0, 0, 0, 9, 4, 7, '#e7ebee', STYLE.office);
      shape('cyl', 0, 4, 0, 3.2, 50, 3.2, '#eef0f2');
      shape('cyl', 0, 46, 0, 10, 6, 10, '#d5dadf');
      shape('cyl', 0, 52, 0, 7, 3, 7, '#c9ced4');
      shape('cyl', 0, 55, 0, 1.1, 20, 1.1, '#e05a4f');
      out.push({ shape: 'neon', x: cx, y: 75, z: cz, sx: 1.4, sy: 1.4, sz: 1.4, rot: 0, color: '#ff3b30', style: 0 });
      break;
    }
    case 'clinic':
      box(0, 0, 0, 8.4, 9, 8.4, '#f4f6f6', STYLE.apt, '#2fa35a');
      box(0, 9, 0, 4, 0.5, 1.2, '#2fa35a');
      box(0, 9, 0, 1.2, 0.5, 4, '#2fa35a');
      break;
  }
  return out;
}

const PRISM = (() => {
  // Sawtooth: vertical face at +z, roof slope down to -z.
  const g = new THREE.BufferGeometry();
  const v = [
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0.5, -0.5, 0, 0.5, 0.5, 1, 0.5, -0.5, 1, 0.5,
    -0.5, 0, -0.5, -0.5, 1, 0.5, 0.5, 1, 0.5, -0.5, 0, -0.5, 0.5, 1, 0.5, 0.5, 0, -0.5,
    0.5, 0, -0.5, 0.5, 1, 0.5, 0.5, 0, 0.5,
    -0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 1, 0.5,
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
})();

const GEOS: Record<Shape, THREE.BufferGeometry> = {
  box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  prism: PRISM,
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 12).translate(0, 0.5, 0),
  cone: new THREE.CylinderGeometry(0.32, 0.5, 1, 14, 1, true).translate(0, 0.5, 0),
  // Half a cylinder lying along x, flat side down: an arcade roof one unit high.
  vault: new THREE.CylinderGeometry(0.5, 0.5, 1, 14, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).scale(1, 2, 1),
  neon: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
};

interface Slot {
  mesh: THREE.InstancedMesh;
  style?: THREE.InstancedBufferAttribute;
  sign?: THREE.InstancedBufferAttribute;
  info?: THREE.InstancedBufferAttribute;
  n: number;
  cap: number;
}

export class BuildingLayer {
  readonly group = new THREE.Group();
  private slots = {} as Record<Shape, Slot>;
  private mats: Record<Shape, THREE.Material>;
  private born = new Map<number, number>();
  private first = true;
  private cache = new Map<number, { key: string; parts: Part[] }>();
  private icons: THREE.Sprite[] = [];
  private iconTex: Record<string, THREE.SpriteMaterial> = {};
  private ver = '';
  private animating = false;
  private neonMat!: THREE.MeshStandardMaterial;
  /** Terrain height under a point, so a hilltop tower stands on the hill. */
  heightAt: (x: number, z: number) => number = () => 0;

  constructor() {
    const plain = new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true });
    this.neonMat = new THREE.MeshStandardMaterial({ color: '#c0392b', emissive: '#ff2a1f', emissiveIntensity: 0.2 });
    this.mats = {
      box: buildingMaterial(), prism: plain, cyl: plain,
      cone: new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide }),
      vault: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
      neon: this.neonMat,
    };
    (Object.keys(GEOS) as Shape[]).forEach((s) => this.alloc(s, s === 'box' ? 4096 : 512));
    // Problem badges as short words on a card-stock pill, in the HUD's coral and ink.
    for (const [k, word] of Object.entries({ power: '전기', water: '수도', road: '도로', gone: '폐가' })) {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 64;
      const g = c.getContext('2d')!;
      g.fillStyle = k === 'gone' ? '#4a4f57' : '#f0644f';
      g.beginPath(); g.roundRect(4, 6, 120, 52, 26); g.fill();
      g.fillStyle = '#fbf8ee';
      g.font = '34px Jua, "Gothic A1", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(word, 64, 34);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      this.iconTex[k] = new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true });
    }
  }

  private alloc(s: Shape, cap: number) {
    const old = this.slots[s];
    if (old) { this.group.remove(old.mesh); old.mesh.dispose(); }
    const geo = GEOS[s].clone();
    const slot: Slot = { mesh: null!, n: 0, cap };
    if (s === 'box') {
      slot.style = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
      slot.sign = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      slot.info = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      geo.setAttribute('aStyle', slot.style);
      geo.setAttribute('aSign', slot.sign);
      geo.setAttribute('aInfo', slot.info);
    }
    slot.mesh = new THREE.InstancedMesh(geo, this.mats[s], cap);
    slot.mesh.castShadow = true;
    slot.mesh.receiveShadow = true;
    slot.mesh.count = 0;
    slot.mesh.frustumCulled = false;
    slot.mesh.setColorAt(0, new THREE.Color());
    this.slots[s] = slot;
    this.group.add(slot.mesh);
  }

  /** Rebuild instance buffers when buildings change, and every frame while some are still rising. */
  update(w: World, now: number, force = false) {
    const ver = `${w.ver.buildings}:${w.ver.roads}`;
    this.neonMat.emissiveIntensity = 0.25 + shared.uNight.value * 3;
    if (!force && ver === this.ver && !this.animating) return;
    this.ver = ver;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    const need: Record<Shape, number> = { box: 0, prism: 0, cyl: 0, cone: 0, vault: 0, neon: 0 };
    const all: { b: Building; parts: Part[] }[] = [];
    const live = new Set<number>();
    w.buildings.forEach((b) => {
      live.add(b.id);
      if (!this.born.has(b.id)) this.born.set(b.id, this.first ? -99 : now);
      const key = `${b.kind}:${b.floors}:${w.ver.roads}`;
      let e = this.cache.get(b.id);
      if (!e || e.key !== key) { e = { key, parts: parts(b, w) }; this.cache.set(b.id, e); }
      for (const pt of e.parts) need[pt.shape]++;
      all.push({ b, parts: e.parts });
    });
    for (const id of this.born.keys()) if (!live.has(id)) { this.born.delete(id); this.cache.delete(id); }
    this.first = false;
    (Object.keys(need) as Shape[]).forEach((k) => { if (need[k] > this.slots[k].cap) this.alloc(k, Math.ceil(need[k] * 1.5)); this.slots[k].n = 0; });
    this.animating = false;
    for (const { b, parts: ps } of all) {
      const age = now - this.born.get(b.id)!;
      let g = 1;
      if (age < 1.4) { g = Math.max(0.02, 1 - (1 - age / 1.4) ** 3); this.animating = true; }
      const base = b.kind === 'tower' ? this.heightAt(b.x * CELL + CELL / 2, b.y * CELL + CELL / 2) : 0;
      for (const pt of ps) {
        const sl = this.slots[pt.shape];
        const i = sl.n++;
        q.setFromAxisAngle(up, pt.rot);
        p.set(pt.x, pt.y * g + base, pt.z);
        s.set(pt.sx, pt.sy * g, pt.sz);
        m.compose(p, q, s);
        sl.mesh.setMatrixAt(i, m);
        c.set(pt.color);
        sl.mesh.setColorAt(i, c);
        if (sl.style) {
          sl.style.setX(i, pt.style);
          c.set(pt.sign ?? '#888888');
          sl.sign!.setXYZ(i, c.r, c.g, c.b);
          sl.info!.setXYZ(i, b.look, b.powered ? 1 : 0, b.abandoned ? 1 : 0);
        }
      }
    }
    for (const sl of Object.values(this.slots)) {
      sl.mesh.count = sl.n;
      sl.mesh.instanceMatrix.needsUpdate = true;
      if (sl.mesh.instanceColor) sl.mesh.instanceColor.needsUpdate = true;
      if (sl.style) sl.style.needsUpdate = sl.sign!.needsUpdate = sl.info!.needsUpdate = true;
    }
  }

  /** Light the windows of buildings that just got (or lost) power without a full rebuild. */
  refreshInfo(w: World) { this.update(w, performance.now() / 1000, true); }

  /** Problem icons over buildings: no power, no water, no road, abandoned. */
  updateIcons(w: World, showAll: boolean) {
    const net = network(w);
    let n = 0;
    const put = (b: Building, k: string) => {
      if (n >= 400) return;
      let sp = this.icons[n];
      if (!sp) { sp = new THREE.Sprite(); sp.renderOrder = 10; this.icons[n] = sp; this.group.add(sp); }
      sp.material = this.iconTex[k];
      const S = b.size * CELL;
      sp.position.set(b.x * CELL + S / 2, b.floors * 3 + 9, b.y * CELL + S / 2);
      sp.scale.set(10, 5, 1);
      sp.visible = true;
      n++;
    };
    w.buildings.forEach((b) => {
      const d = KINDS[b.kind];
      if (b.kind === 'metro' || b.kind === 'tower') return;
      if (!d.zone) { if (!net.access.has(b.id)) put(b, 'road'); else if (showAll && d.power > 0 && !b.powered) put(b, 'power'); return; }
      if (b.abandoned) put(b, 'gone');
      else if (b.outage > 3 || (showAll && b.outage > 0)) put(b, !b.powered ? 'power' : 'water');
    });
    for (let i = n; i < this.icons.length; i++) this.icons[i].visible = false;
  }
}
