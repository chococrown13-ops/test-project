import * as THREE from 'three';
import { CELL, KINDS, N } from '../sim/defs';
import { network } from '../sim/network';
import type { Building, World } from '../sim/world';
import { buildingMaterial } from './materials';

/**
 * Every building is a handful of parts — boxes, sawtooth prisms, cylinders,
 * cones — drawn through one instanced mesh per shape. A Korean street needs
 * variety more than detail: villas in brick with green roofs, 필로티 다세대,
 * white apartment slabs with a brand stripe, shop buildings covered in signs.
 */

type Shape = 'box' | 'prism' | 'cyl' | 'cone';
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
      const wdt = 8.2 + r() * 1.2, dep = 8.2 + r() * 1.2;
      box(0, 0, 0, wdt, H, dep, pick(SHOP, r()), STYLE.shops, pick(SIGN, r()));
      rooftop(H, Math.min(wdt, dep));
      break;
    }
    case 'c2': {
      const wdt = 8.6 + r() * 0.8, dep = 8.6 + r() * 0.8;
      box(0, 0, 0, wdt, H, dep, pick(SHOP, r()), STYLE.shops, pick(SIGN, r()));
      box(0, H, 0, wdt - 1, 0.8, dep - 1, '#9c9a94');
      rooftop(H + 0.8, wdt - 1);
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

  constructor() {
    const plain = new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true });
    this.mats = { box: buildingMaterial(), prism: plain, cyl: plain, cone: new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide }) };
    (Object.keys(GEOS) as Shape[]).forEach((s) => this.alloc(s, s === 'box' ? 4096 : 512));
    for (const [k, e] of Object.entries({ power: '⚡', water: '💧', road: '🚧', gone: '🏚️' })) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      g.fillStyle = k === 'gone' ? '#6b6b6b' : '#e74c3c';
      g.beginPath(); g.arc(32, 32, 29, 0, Math.PI * 2); g.fill();
      g.font = '36px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(e, 32, 35);
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
    if (!force && ver === this.ver && !this.animating) return;
    this.ver = ver;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    const need: Record<Shape, number> = { box: 0, prism: 0, cyl: 0, cone: 0 };
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
      for (const pt of ps) {
        const sl = this.slots[pt.shape];
        const i = sl.n++;
        q.setFromAxisAngle(up, pt.rot);
        p.set(pt.x, pt.y * g, pt.z);
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
      sp.scale.setScalar(7);
      sp.visible = true;
      n++;
    };
    w.buildings.forEach((b) => {
      const d = KINDS[b.kind];
      if (!d.zone) { if (!net.access.has(b.id)) put(b, 'road'); else if (showAll && d.power > 0 && !b.powered) put(b, 'power'); return; }
      if (b.abandoned) put(b, 'gone');
      else if (b.outage > 3 || (showAll && b.outage > 0)) put(b, !b.powered ? 'power' : 'water');
    });
    for (let i = n; i < this.icons.length; i++) this.icons[i].visible = false;
  }
}
