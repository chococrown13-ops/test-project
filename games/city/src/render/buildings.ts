import { pocketKind, pockets } from '../sim/pockets';
import * as THREE from 'three';
import { CELL, KINDS, N, Road, variantOf } from '../sim/defs';
import { AVENUE_SPILL, HALF_WIDTH, KERB_W, nearestCurve } from '../sim/curves';
import { network } from '../sim/network';
import { bh, bw, type Building, type World } from '../sim/world';
import { buildingMaterial, shared } from './materials';

/**
 * Every building is a handful of parts — boxes, sawtooth prisms, cylinders,
 * cones — drawn through one instanced mesh per shape. A Korean street needs
 * variety more than detail: villas in brick with green roofs, 필로티 다세대,
 * white apartment slabs with a brand stripe, shop buildings covered in signs.
 */

type Shape = 'box' | 'prism' | 'cyl' | 'cone' | 'vault' | 'neon' | 'gable' | 'hanok' | 'hip' | 'tree';
interface Part {
  shape: Shape;
  x: number; y: number; z: number; // base centre
  sx: number; sy: number; sz: number;
  rot: number;
  color: string;
  style: number; // see materials.ts; prisms and cylinders ignore it
  sign?: string;
}

const STYLE = { villa: 0, apt: 1, shops: 2, office: 3, factory: 4, plain: 5, house: 6, hanok: 7, framed: 8, slab: 9, shophouse: 10, sign: 11 };

/* The old-town palette (as in 「남길 것인가」). */
const GIWA = ['#5d6773', '#66707b', '#58626d'];
const PLASTER = '#f2ece0', TIMBER = '#5b4232', STONE = '#b8b1a5';
const CEMENT = ['#d9d3c7', '#e4dccb', '#cfc6b5', '#e8e2d4'];
const BLOCK = '#c9c2b4';
const BRICKS = ['#a5523c', '#9a5643', '#b0644a', '#8e4c3a'];
const TILES = ['#d8cfc0', '#cbbfae', '#e2dbd0', '#d3c9b8'];
const SHOPWALL = ['#d9cdb5', '#cfc2a8', '#e6e1d6', '#c4a98a', '#ddd6c8'];
const SIGNS = ['#d9473b', '#2f6db3', '#e2a92b', '#3d9a62', '#c2457e', '#1f2f4a', '#f08a24'];
const TANK = ['#e07b39', '#3f78b5', '#e9e4d8', '#e07b39'];
const ROOFGREEN = '#5f9a6e';
const GLASSES = ['#7d9bb5', '#6f8ea6', '#8aa5b8', '#5f7f99'];

/** A part placer in the lot's own frame: front (-z) toward the road, offsets in metres from the lot centre. */
type Put = (s: Shape, dx: number, dy: number, dz: number, w: number, h: number, d: number, color: string, style?: number, dr?: number, sign?: string) => void;

/** A water tank and a few 장독 on a flat roof at height h. */
function roofLife(P: Put, h: number, r: () => number, x = 0, z = 0) {
  P('cyl', x + 1.8, h, z + 1.6, 1.5, 1.6, 1.5, pick(TANK, r()));
  if (r() < 0.6) for (let k = 0; k < 3; k++) P('cyl', x - 2 + k * 0.9, h, z - 1.2 + (k % 2) * 0.7, 0.7, 0.8, 0.7, '#5a3b2a');
}

/** 적벽돌 빌라: set back behind a brick 담장 and iron 대문, the outside stair up the side, an 옥탑방 and tank on the green roof. */
function brickVilla(P: Put, H: number, r: () => number, brick: string) {
  P('box', -0.5, 0, 0.9, 7.8, H, 7.2, brick, STYLE.framed);
  P('box', 4.1, 0, 1.2, 1, H - 2.6, 3, brick);
  P('box', 4.1, H - 2.6, 1.2, 1.1, 0.2, 3.2, '#cfc8ba');
  P('box', -1, 0, -4.7, 7.8, 1.5, 0.4, brick);
  P('box', -1, 1.5, -4.7, 8, 0.14, 0.6, '#cfc8ba');
  P('box', 3.9, 0, -4.7, 1.8, 1.9, 0.18, pick(['#3d5a4a', '#2f3a40', '#4a5f7a'], r()));
  P('box', -2.5, 0, -3.6, 3.6, 0.45, 1, '#6f9450');
  if (r() < 0.5) P('tree', -3.4, 0.45, -3.6, 1.6, 2.4, 1.6, '#5e8f45');
  P('box', -0.5, H, 0.9, 8, 0.28, 7.4, ROOFGREEN);
  P('box', 1.4, H, 2.2, 3.2, 2.5, 2.8, r() < 0.5 ? '#e6e1d6' : brick, STYLE.house);
  P('box', 1.4, H + 2.5, 2.2, 3.5, 0.22, 3.1, '#3f6f9f');
  roofLife(P, H, r, -2.4, -0.6);
}

/** 저층 아파트: a five-storey block with balconies front and back, the builder's band near the top, parking in front. */
function lowApartment(P: Put, H: number, r: () => number) {
  P('box', 0, 0, 0.9, 9, H, 6.6, pick(APT, r()), STYLE.slab, 0, pick(BRAND, r()));
  P('box', 0, H, 0.9, 9.2, 0.4, 6.8, '#d8d3c8');
  P('box', 2.4, H, 2, 2.8, 2.4, 2.6, '#e9e5dc', STYLE.house);
  P('cyl', -2.6, H, 2, 1.5, 1.6, 1.5, pick(TANK, r()));
  P('box', 0, 0, -3.9, 9, 0.06, 2, '#9d978d');
  P('box', -3.6, 0, -4.7, 1.6, 0.5, 0.5, '#6f9450');
  if (r() < 0.6) P('tree', -3.6, 0.5, -4.6, 1.4, 2.2, 1.4, '#5e8f45');
}

/** 상가주택: shopfronts below, flats above, a signboard on every floor, a 돌출간판, a green roof. */
function shopHouse(P: Put, floors: number, r: () => number, ground: string) {
  const f = Math.max(2, floors), h = f * 3;
  P('box', 0, 0, 0.3, 8.6, h, 8.2, r() < 0.2 ? pick(BRICKS, r()) : pick(SHOPWALL, r()), STYLE.shophouse);
  for (let k = 0; k < f; k++) {
    const sw = k === 0 ? 8.2 : 3.6 + r() * 3.6, sx = k === 0 ? 0 : (r() - 0.5) * (8.2 - sw);
    P('box', sx, k * 3 + 2.05, -3.95, sw, 0.85, 0.3, k === 0 ? ground : pick(SIGNS, r()), STYLE.sign);
    P('box', sx, k * 3 + 2.3, -4.12, sw * 0.6, 0.35, 0.08, '#f6f1e4');
  }
  P('box', 3.9, 3.4, -4.3, 0.3, Math.min(h - 3.6, 4), 1.2, pick(SIGNS, r()), STYLE.sign);
  P('box', 0, h, 0.3, 8.6, 0.25, 8.2, ROOFGREEN);
  roofLife(P, h, r, -1, 0.5);
}

const pick = <T,>(a: T[], r: number) => a[Math.floor(r * a.length) % a.length];
/** A small deterministic sequence per building. */
function seq(seed: number) {
  let s = Math.floor(seed * 2 ** 31) || 1;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

/** Signboard colour per 상가 trade, in VARIANTS order. */
const C1_SIGN = ['#2bb24c', '#f2c12e', '#3d6b4f', '#2f6fd6', '#e2559b', '#1f4e9a', '#e8743b'];
const APT = ['#f1efe9', '#ebe6db', '#e2e6e8', '#eeeae2'];
const BRAND = ['#2f6db5', '#1c8c6e', '#c0392b', '#7b5aa6', '#d98a1c', '#2c3e50', '#0e7c86'];
const SIGN = ['#e74c3c', '#f1c40f', '#3498db', '#2ecc71', '#e67e22', '#9b59b6', '#ff6fa1', '#1abc9c'];

/**
 * An avenue's pavement spills into the lots beside it: a building on such a
 * lot stands back from it by that much (not when avenues run on both sides).
 */
function avenueShift(w: World, b: Building): { x: number; z: number } {
  const W = bw(b), D = bh(b);
  const av = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && w.road[y * N + x] === Road.Avenue;
  let wW = 0, wE = 0, wN = 0, wS = 0;
  for (let k = 0; k < D; k++) { if (av(b.x - 1, b.y + k)) wW = 1; if (av(b.x + W, b.y + k)) wE = 1; }
  for (let k = 0; k < W; k++) { if (av(b.x + k, b.y - 1)) wN = 1; if (av(b.x + k, b.y + D)) wS = 1; }
  return { x: (wW - wE) * AVENUE_SPILL, z: (wN - wS) * AVENUE_SPILL };
}

function rawParts(b: Building, w: World): Part[] {
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
  // The front of the lot (local -z) faces its road; south when it has none.
  let rot = Math.PI;
  if (a !== undefined) {
    const dx = (a % N) * CELL + CELL / 2 - cx, dz = Math.floor(a / N) * CELL + CELL / 2 - cz;
    rot = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? -Math.PI / 2 : Math.PI / 2) : dz > 0 ? Math.PI : 0;
  }
  const c0 = Math.cos(rot), s0 = Math.sin(rot);
  const P: Put = (s, dx, dy, dz, w, h, d, color, style = STYLE.plain, dr = 0, sign) =>
    out.push({ shape: s, x: cx + dx * c0 + dz * s0, y: dy, z: cz - dx * s0 + dz * c0, sx: w, sy: h, sz: d, rot: rot + dr, color, style, sign });
  switch (b.kind) {
    case 'r1': {
      // 1단계 homes: 단독주택 (불란서 주택), 양옥집 (슬래브), 도시형 한옥, or a small 빌라. The variant picks the model.
      const v = variantOf('r1', b.look);
      if (v === 0) {
        // 불란서 주택: two storeys under a steep coloured roof.
        P('box', 0, 0, 0.6, 7.4, 5.6, 7, pick(['#efe6d2', '#e8dcc6', '#f1ece2'], r()), STYLE.house);
        P('gable', 0, 5.6, 0.6, 8.2, 3, 7.8, pick(['#b5503b', '#3f6f9f', '#4d7a52', '#7a4a3a'], r()));
        P('box', 0, 0, -4.7, 9.4, 1.4, 0.35, pick(BRICKS, r()));
      } else if (v === 1) {
        // 슬래브 양옥: a flat concrete roof with a parapet, tank and 장독대, a green iron gate.
        const h = r() < 0.5 ? 5.8 : 3;
        P('box', 0, 0, 0.6, 7.8, h, 7.2, r() < 0.3 ? pick(BRICKS, r()) : pick(CEMENT, r()), STYLE.house);
        P('box', 0, h, 0.6, 8, 0.45, 7.4, '#bdb6a8');
        roofLife(P, h, r, 0, 0.6);
        P('box', -1, 0, -4.7, 7.4, 1.5, 0.35, BLOCK);
        P('box', 3.5, 0, -4.7, 2, 1.9, 0.22, '#3d7a5a');
      } else if (v === 2) {
        // 도시형 한옥: 안채 at the back, a wing by the 마당, 담장 and 대문 on the street.
        const roof = pick(GIWA, r());
        P('box', 0, 0, 2, 8.8, 0.45, 4, STONE);
        P('box', 0, 0.45, 2, 7.6, 2.5, 2.8, PLASTER, STYLE.hanok);
        P('hanok', 0, 2.95, 2, 9.6, 2, 4.6, roof);
        const sx = r() < 0.5 ? -1 : 1;
        P('box', sx * 3, 0, -1.6, 2.8, 0.4, 3.4, STONE);
        P('box', sx * 3, 0.4, -1.6, 2, 2.2, 3, PLASTER, STYLE.hanok);
        P('hanok', sx * 3, 2.6, -1.6, 4.2, 1.5, 3, roof, STYLE.plain, Math.PI / 2);
        P('box', -sx * 1, 0, -4.6, 7.6, 1.5, 0.35, '#d6cab1');
        P('box', -sx * 1, 1.5, -4.6, 7.7, 0.25, 0.7, roof);
        P('box', -sx * 3.9, 0, -4.6, 0.5, 2.2, 0.5, TIMBER);
      } else brickVilla(P, Math.max(2, b.floors) * 3, r, pick(BRICKS, r())); // 작은 빌라: two or three floors
      break;
    }
    case 'r2': {
      // 2단계: 빌라 (적벽돌), 다세대 (pale tile over 필로티 parking), or a 저층 아파트 block.
      const v = variantOf('r2', b.look);
      if (v === 0) brickVilla(P, H, r, pick(BRICKS, r()));
      else if (v === 1) {
        const tile = pick(TILES, r());
        for (const [px, pz] of [[-3.8, -3.4], [3.8, -3.4], [-3.8, 3.8], [3.8, 3.8]]) P('box', px, 0, pz, 0.6, 3, 0.6, '#bdb6a8');
        P('box', 0, 3, 0.2, 8.6, H - 3, 7.8, tile, STYLE.framed);
        P('box', 0, 0, 0, 8, 0.06, 8.6, '#9d978d');
        P('box', -3, 0, -4.6, 3.4, 0.5, 0.6, '#6f9450');
        P('box', 0, H, 0.2, 8.8, 0.3, 8, ROOFGREEN);
        P('box', 1.8, H, 1.6, 3.2, 2.5, 2.8, '#e6e1d6', STYLE.house);
        P('box', 1.8, H + 2.5, 1.6, 3.5, 0.22, 3.1, '#3f6f9f');
        roofLife(P, H, r, -2, -1);
      } else lowApartment(P, H, r);
      break;
    }
    case 'r3':
      // An 아파트 단지 (or 주상복합) laid out for its plot, with its own parking and park.
      out.push(...complex(b));
      break;
    case 'c1': {
      // 상가주택: shops below, flats above, a signboard on every floor and a 돌출간판.
      // The trade decides the ground-floor sign: 편의점, 치킨집, 카페, PC방, 노래방, 부동산, 분식집.
      const v = variantOf('c1', b.look);
      shopHouse(P, b.floors, r, C1_SIGN[v]);
      if (v === 2) P('prism', 0, 2.5, -4.3, 7, 0.6, 1.2, '#2f5a43'); // café awning
      break;
    }
    case 'c2': {
      const v = variantOf('c2', b.look);
      shopHouse(P, b.floors, r, v === 1 ? '#f2c12e' : v === 2 ? '#2fa35a' : pick(SIGNS, r()));
      if (v === 3) {
        // A church upstairs: the red neon cross that lights up Korean skylines at night.
        out.push({ shape: 'neon', x: cx, y: H + 0.3, z: cz, sx: 0.32, sy: 3.4, sz: 0.32, rot: 0, color: '#ff3b30', style: 0 });
        out.push({ shape: 'neon', x: cx, y: H + 2.5, z: cz, sx: 1.7, sy: 0.32, sz: 0.32, rot: 0, color: '#ff3b30', style: 0 });
      }
      break;
    }
    case 'c3': {
      if (variantOf('c3', b.look) === 2) { bigMart(b, w, out); break; }
      P('box', 0, 0, 0, 18.4, 9, 18.4, '#b9b4ab', STYLE.shops, 0, pick(SIGN, r()));
      const tw = 11 + r() * 3, td = 10 + r() * 3;
      const glass = pick(['#7c90a6', '#8aa1a8', '#6d7f94', '#9aa7b4'], r());
      P('box', 0, 9, 0, tw, H - 9, td, glass, STYLE.office);
      let top = H;
      if (r() < 0.5) { P('box', 0, H, 0, tw * 0.7, 6, td * 0.7, glass, STYLE.office); top += 6; }
      P('box', 0, top, 0, 3, 2.5, 3, '#c9cbcc');
      break;
    }
    case 'i1': {
      // 1차 산업: 비닐하우스, 논밭, 축사, 과수원 on the edge of town.
      const v = variantOf('i1', b.look);
      if (v === 0) {
        P('box', 0, 0, 0, 9.4, 0.08, 9.4, '#8a7a5c');
        for (const dx of [-3, 0, 3]) P('vault', dx, 0.08, 0.3, 8.4, 2.4, 2.6, '#eef4f0', STYLE.plain, Math.PI / 2);
        P('box', 3.6, 0.08, -4.3, 1.6, 1.4, 0.8, '#3f6f9f');
      } else if (v === 1) {
        P('box', 0, 0, 0, 9.4, 0.1, 9.4, '#7a6a4a');
        const crop = r() < 0.5 ? '#7fae4f' : '#d8b75a';
        for (let k = 0; k < 5; k++) P('box', -1, 0.1, -3.8 + k * 1.7, 6.6, 0.3, 1, crop);
        P('box', 3.4, 0.1, 2.8, 2.4, 2.2, 2.2, '#cfc8b8', STYLE.house);
        P('gable', 3.4, 2.3, 2.8, 2.8, 0.9, 2.6, '#3f6f9f');
      } else if (v === 2) {
        P('box', 0, 0, 0.8, 8.6, 2.6, 5.6, '#e3ddcf', STYLE.factory);
        P('gable', 0, 2.6, 0.8, 9, 1.5, 6.2, pick(['#b5503b', '#3f6f9f'], r()));
        P('cyl', 3.4, 0, -3.3, 1.8, 6, 1.8, '#cfd3d6');
        P('cyl', 3.4, 6, -3.3, 1.9, 0.6, 1.9, '#9aa0a6');
        P('box', -1.5, 0, -4.4, 6, 1.1, 0.15, '#8a6a4a');
      } else {
        P('box', 0, 0, 0, 9.4, 0.06, 9.4, '#7d9b4f');
        const fruit = pick(['#5e8f45', '#6f9a3f', '#7aa04a'], r());
        for (const dx of [-3, 0, 3]) for (const dz of [-3, 0, 3]) {
          P('box', dx, 0.06, dz, 0.25, 1.2, 0.25, '#6b5440');
          P('tree', dx, 0.9, dz, 2.2, 2.2, 2.2, fruit);
        }
      }
      break;
    }
    case 'i2': {
      // 2차 산업: blue sawtooth roofs, the colour of every Korean works yard.
      const v = variantOf('i2', b.look);
      const h = 4 + b.floors * 1.6;
      P('box', 0, 0, 0, 9, h, 8.6, v === 2 ? '#e8e6e0' : pick(['#cfc8b8', '#c9c2b4', '#d6d0c2'], r()), STYLE.factory);
      const roof = pick(['#4a78a8', '#4a78a8', '#5d86b2', '#3f6f9f'], r());
      for (let k = 0; k < 2; k++) P('gable', 0, h, -2.15 + k * 4.3, 9.2, 1.6, 4.4, roof);
      if (v === 0) P('cyl', 3.4, 0, 3.4, 1.2, h + 9, 1.2, '#b25b44');
      else if (v === 1) P('cyl', -3.2, 0, 3.4, 2.2, 3.2, 2.2, '#d1d6d9');
      else for (const dx of [-3, -0.6]) P('cyl', dx, 0, 3.6, 2, h + 3, 2, '#dfe3e6');
      break;
    }
    case 'i3': {
      // 3차 산업: 지식산업센터, 물류센터, 데이터센터.
      const v = variantOf('i3', b.look);
      if (v === 0) {
        P('box', 0, 0, 2, 18, 6, 15, '#d8d5cc', STYLE.factory);
        P('box', 0, 6, 3, 16, Math.max(12, H) - 6, 11, pick(['#9fb2c2', '#a7b4bd', '#8ea7b9'], r()), STYLE.office);
        P('box', 0, Math.max(12, H), 3, 6, 2.4, 5, '#c9cbcc');
        P('prism', -6.5, 0, -7.2, 4, 2.2, 3.4, '#9d978d');
      } else if (v === 1) {
        P('box', 0, 0, 1, 18.4, 13, 15.6, '#e8e6e0', STYLE.plain);
        P('box', 0, 10.6, -6.85, 18.4, 1.4, 0.3, pick(['#2f6db3', '#d9473b', '#2e9e4f'], r()), STYLE.sign);
        for (let k = -3; k <= 3; k++) P('box', k * 2.5, 0, -6.95, 1.8, 3.2, 0.2, '#4a4f55');
        for (const dx of [-5, 0, 5]) P('box', dx, 0, -9, 2.3, 3.4, 1.6, '#f2f2f0');
      } else {
        P('box', 0, 0, 1.5, 17, 10, 14, '#c9ccd0', STYLE.plain);
        for (const dx of [-5.5, -1.8, 1.8, 5.5]) for (const dz of [-2.5, 2, 6.5]) {
          P('box', dx, 10, dz, 2.6, 1.2, 2.6, '#9aa0a6');
          P('cyl', dx, 11.2, dz, 1.8, 0.2, 1.8, '#5d6670');
        }
        P('box', -4, 0, -7.2, 7, 4, 3, pick(GLASSES, r()), STYLE.office);
        P('box', 0, 0, -9.6, 18.8, 1.8, 0.1, '#8d9399');
      }
      break;
    }
    case 'office': {
      // 행정복지센터: a plain civic block, its name in blue, and three flagpoles out front.
      P('box', 0, 0, 0.8, 8.4, 9, 7.4, '#ece6da', STYLE.apt, 0, '#2f6db3');
      P('box', 0, 3, -3.2, 4.4, 0.25, 1.6, '#cfc8ba');
      P('box', 0, 3.6, -3.05, 4.2, 0.9, 0.2, '#2f6db3', STYLE.sign);
      for (const fx of [-3.4, -2.6, -1.8]) {
        P('cyl', fx, 0, -4.3, 0.12, 6.5, 0.12, '#e8e8e8');
        P('box', fx + 0.45, 5.6, -4.3, 0.9, 0.6, 0.04, fx === -2.6 ? '#f2f2f0' : fx === -3.4 ? '#2f6db3' : '#e8e2d4');
      }
      break;
    }
    case 'post': {
      // 우체국: red signboard, glass front, and a red 우체통 on the pavement edge.
      P('box', 0, 0, 0.6, 8.4, 6, 7.6, '#e8e2d4', STYLE.shophouse);
      P('box', 0, 4.4, -3.25, 7, 1, 0.3, '#d9473b', STYLE.sign);
      P('box', 3.4, 0, -4.4, 0.6, 1.2, 0.5, '#d9473b');
      P('box', 3.4, 1.2, -4.4, 0.7, 0.15, 0.6, '#b8362b');
      P('box', -2.5, 0, -4.2, 2.4, 1.6, 1.4, '#e6e1d6');
      break;
    }
    case 'library': {
      // 공공도서관: a long low hall with a glass reading room, a sloping roof, and a reading garden.
      P('box', 0, 0, 2.5, 17, 7, 11, '#d9cdb5', STYLE.house);
      P('box', -3, 0, -3.4, 9, 6, 1.2, '#8aa5b8', STYLE.office);
      P('gable', 0, 7, 2.5, 17.6, 2, 11.6, '#6b7f8f');
      P('box', 4, 5.2, -3.15, 5, 0.9, 0.3, '#3d9a62', STYLE.sign);
      P('box', 4, 0, -7, 8, 0.08, 4.4, '#7fae55');
      for (const tx of [1.5, 6.5]) { P('box', tx, 0, -7, 0.25, 1.4, 0.25, '#6b5440'); P('tree', tx, 1.1, -7, 2.6, 2.6, 2.6, '#5e8f45'); }
      P('box', 4, 0, -8.6, 2, 0.45, 0.5, '#8a6a4a');
      break;
    }
    case 'terminal': {
      // 고속버스터미널: the hall at the back, a long canopy over the bays, coaches lined up under it.
      P('box', 0, 0, 9, 26, 9, 9, '#e3ded2', STYLE.shophouse);
      P('box', 0, 6.6, 4.35, 18, 1.6, 0.35, '#2f6db3', STYLE.sign);
      P('box', 0, 0, -1, 28, 0.15, 17, '#5a5d61');
      for (let k = -4; k <= 4; k++) P('box', k * 3, 0.15, -2, 0.12, 0.02, 9, '#eeeeea');
      P('box', 0, 5.2, -1, 28, 0.4, 10, '#d8d5cc');
      // Pillars stand on the bay lines (every 6 m), between the coaches, never in a bay.
      for (const px of [-12, -6, 0, 6, 12]) for (const pz of [-5, 3]) P('box', px, 0, pz, 0.4, 5.2, 0.4, '#9d9a92');
      for (let k = -4; k <= 3; k++) {
        if (r() < 0.25) continue;
        const coach = pick(['#f2f2f0', '#2f6db3', '#f2f2f0', '#1f4e9a'], r());
        P('box', k * 3 + 1.5, 0.15, -2, 2.3, 3.3, 11, coach, STYLE.plain);
        P('box', k * 3 + 1.5, 1.6, -2, 2.34, 1, 10.6, '#2c3e50');
      }
      break;
    }
    case 'ktx': {
      // KTX역: a glass station hall, a long platform canopy, and a white train with its blue stripe on the line behind.
      P('box', 0, 0, -6, 22, 11, 9, '#8aa5b8', STYLE.office);
      P('box', 0, 11, -6, 24, 0.8, 11, '#eef0f2');
      P('box', 0, 8.6, -10.6, 12, 1.6, 0.3, '#1f4e9a', STYLE.sign);
      P('box', 0, 0, 5.5, 30, 1.2, 12, '#b9b4ab');
      for (const tz of [3, 8]) for (const rx of [-0.7, 0.7]) P('box', 0, 1.2, tz + rx, 30, 0.2, 0.12, '#6b6f75');
      P('box', 0, 1.2, 5.5, 28, 0.25, 2.2, '#cfc9bd');
      P('box', 0, 5.8, 5.5, 28, 0.3, 5, '#eef0f2');
      for (const px of [-12, -4, 4, 12]) P('box', px, 1.2, 5.5, 0.4, 4.6, 0.4, '#9d9a92');
      P('box', -1, 1.4, 8, 24, 3.6, 3, '#f2f2f0');
      P('box', -1, 2.2, 8, 24.05, 0.5, 3.05, '#2f6db3');
      P('box', -1, 3, 8, 24.05, 0.6, 3.05, '#2c3e50');
      P('prism', 12.5, 1.4, 8, 3, 3.2, 3, '#f2f2f0', STYLE.plain, -Math.PI / 2);
      break;
    }
    case 'bike': {
      // 공공자전거 대여소: a docking rail, bikes in their green frames, and the kiosk.
      P('box', 0, 0, -1, 8, 0.12, 3, '#9d978d');
      P('box', 0, 0.12, 0, 7.2, 0.6, 0.2, '#6f7378');
      for (let k = -3; k <= 3; k++) {
        if (r() < 0.25) continue;
        P('box', k, 0.3, -0.9, 0.12, 0.7, 1.7, '#3d9a62');
        P('box', k, 0.12, -0.2, 0.08, 0.6, 0.6, '#2c2f33');
        P('box', k, 0.12, -1.6, 0.08, 0.6, 0.6, '#2c2f33');
      }
      P('box', 3.6, 0, -2.4, 0.8, 1.6, 0.5, '#3d9a62');
      break;
    }
    case 'trailhead': {
      // 등산로 입구: a timber gate with the trail's name, a 막걸리·파전집 under a tiled roof with a 평상, and the path into the hills.
      P('box', -3.5, 0, -3.6, 0.35, 3.2, 0.35, TIMBER);
      P('box', -0.9, 0, -3.6, 0.35, 3.2, 0.35, TIMBER);
      P('box', -2.2, 2.7, -3.6, 3.3, 0.6, 0.3, '#8a6a4a', STYLE.sign);
      P('box', -2.2, 0, 1, 2.2, 0.06, 9.6, '#b59b72');
      P('box', 2.6, 0, 1.4, 4.4, 0.4, 5, STONE);
      P('box', 2.6, 0.4, 1.4, 3.6, 2.4, 4, PLASTER, STYLE.hanok);
      P('hanok', 2.6, 2.8, 1.4, 5.2, 1.5, 5.6, pick(GIWA, r()), STYLE.plain, Math.PI / 2);
      P('box', 2.6, 2, -0.65, 2.4, 0.6, 0.2, '#c0392b', STYLE.sign);
      P('box', 2.4, 0, -2.6, 2.4, 0.5, 1.6, '#8a6a4a');
      break;
    }
    case 'jjim': {
      if (variantOf('jjim', b.look) === 0) {
        // 찜질방: a big 4-storey block with its lit sign, and the steam chimney.
        P('box', 0, 0, 1, 17, 12, 15, '#e8d9c4', STYLE.shophouse);
        P('box', 0, 8.4, -6.65, 12, 2.4, 0.35, '#e8743b', STYLE.sign);
        P('box', 0, 12, 1, 17.2, 0.3, 15.2, ROOFGREEN);
        P('hip', -4, 12.3, 3, 6, 2.6, 6, '#d9473b');
        P('cyl', 6, 12.3, 5, 1.4, 6, 1.4, '#c8b8a2');
      } else {
        // 목욕탕: a blue-tiled block and its tall chimney.
        P('box', 0, 0, 1, 15, 6, 13, '#cfe0e8', STYLE.house);
        P('box', 0, 6, 1, 15.2, 0.4, 13.2, ROOFGREEN);
        P('box', 0, 4.2, -5.65, 7, 1.4, 0.3, '#2f6db3', STYLE.sign);
        P('cyl', 5.5, 0, 5, 1.8, 18, 1.8, '#c8b8a2');
        P('cyl', 5.5, 15.2, 5, 1.95, 1.4, 1.95, '#c0392b');
      }
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
    case 'well': {
      // 지하수 관정: a pump house, a raised steel tank, and the capped well heads with their pipes.
      box(-4, 0, -3, 7, 3.4, 6, '#e3ded2', STYLE.factory);
      shape('gable', -4, 3.4, -3, 7.4, 1.4, 6.4, '#3f6f9f');
      for (const [px, pz] of [[-5, 5.5], [5, 6.5], [6.5, -6.5]]) {
        box(px, 0, pz, 2.2, 0.3, 2.2, '#b9b4ab');
        shape('cyl', px, 0.3, pz, 0.8, 1.3, 0.8, '#2f77b5');
      }
      box(1, 0.5, 6, 8, 0.25, 0.25, '#8d9399');
      box(5.5, 0.5, -1, 0.25, 0.25, 11, '#8d9399');
      for (const [px, pz] of [[3, -6.5], [8, -6.5], [3, -1.5], [8, -1.5]]) box(px, 0, pz, 0.4, 6, 0.4, '#8d9399');
      shape('cyl', 5.5, 6, -4, 6, 3.6, 6, '#dfe6ea');
      shape('cyl', 5.5, 9.6, -4, 6.2, 0.3, 6.2, '#2f77b5');
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
    case 'parking': {
      // 공영주차장: an asphalt lot with painted bays and a few cars in them.
      box(0, 0, 0, 9.4, 0.14, 9.4, '#55585c');
      for (let k = -2; k <= 2; k++) { box(k * 2.3, 0.14, -2.6, 0.12, 0.02, 4, '#eeeeea'); box(k * 2.3, 0.14, 2.6, 0.12, 0.02, 4, '#eeeeea'); }
      for (const k of [-1.5, -0.5, 0.5, 1.5]) for (const z of [-2.6, 2.6]) {
        if (r() < 0.35) continue;
        const col = pick(['#f2f2f0', '#1b1c1e', '#a9adb2', '#6f7378', '#2a3d66', '#8c1d1d'], r());
        box(k * 2.3, 0.14, z, 1.7, 0.8, 3.9, col);
        box(k * 2.3, 0.94, z, 1.5, 0.55, 2.0, '#2c2f33');
      }
      box(-4.3, 0, -4.3, 0.15, 3, 0.15, '#8c9196');
      box(-4.3, 2.4, -4.3, 1.1, 1.1, 0.15, '#2f6db5', STYLE.plain);
      break;
    }
    case 'parktower': {
      // 주차타워: open concrete decks with cars glimpsed between them, a blue P on top.
      const H2 = b.floors * 2.6;
      for (let f = 0; f < b.floors; f++) {
        box(0, f * 2.6, 0, 8.8, 0.35, 8.8, '#b4b1a9');
        if (f) for (const x of [-3, 0, 3]) box(x, f * 2.6 + 0.35, (r() - 0.5) * 4, 1.6, 0.9, 3.6, pick(['#f2f2f0', '#1b1c1e', '#a9adb2', '#2a3d66', '#8c1d1d'], r()));
        for (const [x, z] of [[-4.2, -4.2], [4.2, -4.2], [-4.2, 4.2], [4.2, 4.2]]) box(x, f * 2.6, z, 0.5, 2.6, 0.5, '#9d9a92');
      }
      box(0, H2, 0, 8.8, 0.4, 8.8, '#9d9a92');
      box(0, H2 + 0.4, 4.2, 2.4, 2.4, 0.3, '#2f6db5');
      box(-0.3, H2 + 0.9, 4.4, 0.4, 1.5, 0.1, '#ffffff');
      box(0.15, H2 + 1.85, 4.4, 0.6, 0.45, 0.1, '#ffffff');
      box(0.35, H2 + 1.35, 4.4, 0.25, 0.5, 0.1, '#ffffff');
      box(0.15, H2 + 1.1, 4.4, 0.6, 0.3, 0.1, '#ffffff');
      break;
    }
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

/**
 * Zoned buildings that front a curved road turn to face it, the way lots
 * line a bending street: rotated to the curve's direction (by at most 45°,
 * since a block reads the same every quarter turn), shrunk so the turned
 * footprint still fits its lot, and nudged back off the pavement.
 */
export function parts(b: Building, w: World): Part[] {
  return squeeze(b, w, lotParts(b, w));
}

/**
 * Beside an avenue the building gives up the strip its pavement spills over:
 * squeezed toward the back of the lot (not pushed, which would put it on the neighbour's).
 */
function squeeze(b: Building, w: World, out: Part[]): Part[] {
  const sh = avenueShift(w, b);
  if (!sh.x && !sh.z) return out;
  const Wm = bw(b) * CELL, Dm = bh(b) * CELL, cx = b.x * CELL + Wm / 2, cz = b.y * CELL + Dm / 2;
  const kx = (Wm - Math.abs(sh.x)) / Wm, kz = (Dm - Math.abs(sh.z)) / Dm;
  for (const p of out) {
    p.x = cx + sh.x / 2 + (p.x - cx) * kx;
    p.z = cz + sh.z / 2 + (p.z - cz) * kz;
    const c = Math.abs(Math.cos(p.rot)), sn = Math.abs(Math.sin(p.rot));
    const fx = c * kx + sn * kz, fz = c * kz + sn * kx;
    p.sx *= fx; p.sz *= fz;
  }
  return out;
}

function lotParts(b: Building, w: World): Part[] {
  if (bw(b) !== b.size || bh(b) !== b.size) return stretched(b, w);
  const out = rawParts(b, w);
  if (!KINDS[b.kind].zone || !w.curves.length) return out;
  const S = b.size * CELL;
  const cx = b.x * CELL + S / 2, cz = b.y * CELL + S / 2;
  const near = nearestCurve(w, cx, cz, S / 2 + 9);
  if (!near) return out;
  const a = network(w).access.get(b.id);
  if (a === undefined || !near.c.cells.includes(a)) return out;
  let phi = Math.atan2(-near.tan.z, near.tan.x);
  phi -= Math.round(phi / (Math.PI / 2)) * (Math.PI / 2);
  if (Math.abs(phi) < 0.03) return out;
  const cos = Math.cos(phi), sin = Math.sin(phi);
  let k = Math.min(1, 1.15 / (Math.abs(cos) + Math.abs(sin)));
  const clear = HALF_WIDTH[near.c.t as 1 | 2] + KERB_W[near.c.t as 1 | 2] + 0.3;
  const half = S * 0.42;
  if (near.d - clear < half * k) k = Math.max(0.55, Math.min(k, (near.d - clear) / half));
  // Back off along the normal if the shrunk lot still reaches the pavement.
  const push = Math.min(2, Math.max(0, half * k - (near.d - clear)));
  const nx = (cx - near.x) / (near.d || 1), nz = (cz - near.z) / (near.d || 1);
  const ox = nx * push, oz = nz * push;
  for (const p of out) {
    const dx = (p.x - cx) * k, dz = (p.z - cz) * k;
    p.x = cx + ox + dx * cos + dz * sin;
    p.z = cz + oz - dx * sin + dz * cos;
    p.sx *= k; p.sz *= k;
    p.rot += phi;
  }
  return out;
}

/**
 * A lot grown to fit its block (2×1, 3×2, ...): the kind's own model drawn on
 * its usual square, then stretched to the footprint. A villa becomes a long
 * 다세대, a shop a row of shopfronts, two apartment slabs longer 동.
 */
function stretched(b: Building, w: World): Part[] {
  if (b.kind === 'r3') return complex(b);
  if (b.kind === 'c3') { if (variantOf('c3', b.look) === 2) { const out: Part[] = []; bigMart(b, w, out); return out; } return officeBlock(b); }
  const W = bw(b), D = bh(b), base = b.size;
  const out = rawParts({ ...b, x: b.x + (W - base) / 2, y: b.y + (D - base) / 2 }, w);
  const cx = (b.x + W / 2) * CELL, cz = (b.y + D / 2) * CELL;
  const fx = W / base, fz = D / base;
  for (const p of out) {
    p.x = cx + (p.x - cx) * fx;
    p.z = cz + (p.z - cz) * fz;
    // A part turned a quarter is long along the other axis.
    if (Math.abs(Math.sin(p.rot)) > 0.5) { p.sx *= fz; p.sz *= fx; } else { p.sx *= fx; p.sz *= fz; }
  }
  return out;
}

/**
 * An 아파트 단지 laid out for its plot: rows of 판상형 slabs along the long
 * side (two to a row on a long plot), or a grid of 탑상형 towers, one per
 * cell. A bigger block gets more 동, not fatter ones.
 */
function complex(b: Building): Part[] {
  if (variantOf('r3', b.look) === 2) { const out: Part[] = []; mixedUse(b, out); return out; }
  const r = seq(b.look + b.id * 0.0137);
  const Wm = bw(b) * CELL, Dm = bh(b) * CELL;
  const cx = b.x * CELL + Wm / 2, cz = b.y * CELL + Dm / 2;
  const H = b.floors * 3;
  const col = pick(APT, r()), brand = pick(BRAND, r());
  const out: Part[] = [];
  const alongX = Wm > Dm || (Wm === Dm && b.look < 0.3);
  const long = alongX ? Wm : Dm, short = alongX ? Dm : Wm;
  // Everything in the plot's own frame: u along its long side, v across.
  const Q = (s: Shape, u: number, v: number, y: number, lu: number, h: number, lv: number, color: string, style = STYLE.plain, sign?: string) =>
    out.push(alongX ? { shape: s, x: cx + u, y, z: cz + v, sx: lu, sy: h, sz: lv, rot: 0, color, style, sign } : { shape: s, x: cx + v, y, z: cz + u, sx: lv, sy: h, sz: lu, rot: 0, color, style, sign });
  const CARS = ['#f2f2f0', '#f2f2f0', '#1b1c1e', '#a9adb2', '#6f7378', '#2a3d66', '#8c1d1d'];
  const LEAF = ['#5e8f45', '#6c9f4f', '#7aab55'];
  // 주차장: a strip of asphalt, cars nose-in across it.
  const parking = (u0: number, u1: number, v: number, w: number) => {
    Q('box', (u0 + u1) / 2, v, 0.05, u1 - u0, 0.05, w, '#5a5d61');
    for (let u = u0 + 1.4; u < u1 - 1.2; u += 2.6) {
      Q('box', u - 1.3, v, 0.1, 0.1, 0.02, w * 0.8, '#eeeeea');
      if (r() < 0.25) continue;
      const k = pick(CARS, r());
      Q('box', u, v, 0.1, 1.7, 0.8, Math.min(4.1, w - 0.6), k);
      Q('box', u, v, 0.9, 1.5, 0.55, Math.min(2, w - 2), '#2c2f33');
    }
  };
  // 단지 공원: lawn and trees, and a 놀이터 (sand, a slide) or a 정자.
  const park = (u0: number, u1: number, v: number, w: number, play: boolean) => {
    Q('box', (u0 + u1) / 2, v, 0.05, u1 - u0, 0.08, w, '#7fae55');
    for (let u = u0 + 1.6; u < u1 - 1; u += 4.2) {
      Q('box', u, v + w / 2 - 1, 0.1, 0.25, 1.4, 0.25, '#6b5440');
      Q('tree', u, v + w / 2 - 1, 1.1, 2.6, 2.8, 2.6, pick(LEAF, r()));
    }
    const mu = (u0 + u1) / 2;
    if (play) {
      Q('box', mu, v - 0.4, 0.1, 4, 0.15, Math.min(3.4, w - 1.2), '#e2c48a');
      Q('prism', mu - 0.8, v - 0.4, 0.25, 0.9, 1.6, 2.2, pick(['#e74c3c', '#f1c40f', '#3498db'], r()));
      Q('box', mu + 1, v - 0.4, 0.25, 0.9, 1.6, 0.9, '#2e9e4f');
    } else {
      Q('box', mu, v - 0.3, 0.1, 2.6, 0.4, 2.6, '#8a6a4a');
      Q('hip', mu, v - 0.3, 2.4, 3.4, 1.2, 3.4, '#4a4f55');
      for (const [a, c] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) Q('box', mu + a * 1.1, v - 0.3 + c * 1.1, 0.5, 0.18, 1.9, 0.18, '#7a3b2e');
    }
  };
  // The 단지 itself: paved, a hedge round it, the gate (문주) and 경비실 at a corner.
  Q('box', 0, 0, 0, long - 0.6, 0.04, short - 0.6, '#cbc5b8');
  for (const sv of [-1, 1]) Q('box', 2.2, sv * (short / 2 - 0.5), 0, long - 5.4, 0.8, 0.5, '#5f8f45');
  for (const su of [-1, 1]) Q('box', su * (long / 2 - 0.5), 2.2, 0, 0.5, 0.8, short - 5.4, '#5f8f45');
  const gu = -long / 2 + 1.3, gv = -short / 2 + 1.3;
  Q('box', gu + 2.6, gv, 0, 0.7, 3.6, 0.7, '#cfc8ba');
  Q('box', gu, gv + 2.6, 0, 0.7, 3.6, 0.7, '#cfc8ba');
  Q('box', gu + 1.6, gv + 1.6, 1.2, 1.9, 2.4, 1.9, '#d9d2c3', STYLE.house);
  Q('box', gu + 2.6, gv, 3.6, 1.2, 0.8, 0.9, brand, STYLE.sign);
  if (b.look < 0.55) {
    // 판상형: rows of slabs about 10 m apart; between them, by turns, a car park and a strip of park.
    const rows = Math.max(2, Math.floor((short - 2) / 9));
    const segs = long >= 28 ? 2 : 1;
    const gap = 3, len = (long - 3.5 - (segs - 1) * gap) / segs;
    const pitch = short / rows, gw = pitch - 4.6 - 0.8;
    for (let i = 0; i < rows; i++) {
      const v = -short / 2 + pitch * (i + 0.5);
      for (let k = 0; k < segs; k++) {
        const u = -long / 2 + 1.75 + len / 2 + k * (len + gap);
        const h = H - Math.floor(r() * 3) * 3;
        Q('box', u, v, 0, len, h, 4.6, col, STYLE.slab, brand);
        Q('box', u, v, h, Math.min(4, len * 0.3), 2.2, 3.2, col);
      }
      if (i === rows - 1) break;
      const gv2 = v + pitch / 2;
      if (rows === 2) {
        // Only one gap: cars on most of it, the 놀이터 at the end.
        parking(-long / 2 + 1, long * 0.18, gv2, gw);
        park(long * 0.18, long / 2 - 1, gv2, gw, true);
      } else if (i % 2 === 0) parking(-long / 2 + 1, long / 2 - 1, gv2, gw);
      else park(-long / 2 + 1, long / 2 - 1, gv2, gw, i % 4 === 1);
    }
  } else {
    // 탑상형: towers on every other spot, park and parking in between.
    const nu = Math.max(2, Math.round(long / 10)), nv = Math.max(2, Math.round(short / 10));
    const su = long / nu, sv = short / nv;
    let n = 0;
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const u = -long / 2 + su * (i + 0.5), v = -short / 2 + sv * (j + 0.5);
      if ((i + j) % 2 === 0) {
        const h = H - Math.floor(r() * 3) * 6;
        Q('box', u, v, 0, 8, h, 8, col, STYLE.apt, brand);
        Q('box', u, v, h, 5, 2.4, 5, brand);
      } else if (n++ % 2 === 0) parking(u - su / 2 + 0.8, u + su / 2 - 0.8, v, sv - 2);
      else park(u - su / 2 + 0.8, u + su / 2 - 0.8, v, sv - 2, n % 4 === 1);
    }
  }
  return out;
}

/**
 * 주상복합: a podium of shops over the whole plot, signboards along it, and
 * cross-shaped residential towers on top (one for every 18 m or so of frontage).
 */
function mixedUse(b: Building, out: Part[]) {
  const r = seq(b.look + b.id * 0.0137);
  const Wm = bw(b) * CELL, Dm = bh(b) * CELL;
  const cx = b.x * CELL + Wm / 2, cz = b.y * CELL + Dm / 2;
  const H = b.floors * 3, base = 9;
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, style = STYLE.plain, sign?: string) =>
    out.push({ shape: 'box', x: cx + x, y, z: cz + z, sx, sy, sz, rot: 0, color, style, sign });
  box(0, 0, 0, Wm - 1.6, base, Dm - 1.6, '#d8d5cc', STYLE.shophouse);
  // A lit signboard band round the podium.
  box(0, 6.6, -(Dm - 1.6) / 2 - 0.15, (Wm - 1.6) * 0.8, 1.1, 0.3, pick(SIGNS, r()), STYLE.sign);
  box(0, 6.6, (Dm - 1.6) / 2 + 0.15, (Wm - 1.6) * 0.8, 1.1, 0.3, pick(SIGNS, r()), STYLE.sign);
  const alongX = Wm >= Dm, long = alongX ? Wm : Dm;
  const n = Math.max(1, Math.round(long / 18));
  const col = pick(['#eef0f0', '#e7ebee', '#f1ece2'], r()), brand = pick(BRAND, r());
  for (let k = 0; k < n; k++) {
    const u = -long / 2 + (long / n) * (k + 0.5);
    const [x, z] = alongX ? [u, 0] : [0, u];
    const h = H - (k % 2) * 9;
    box(x, base, z, 13, h - base, 7, col, STYLE.apt, brand);
    box(x, base, z, 7, h - base - 3, 13, col, STYLE.apt, brand);
    box(x, h, z, 5, 3, 5, '#cfd3d6');
  }
}

/**
 * 대형마트: a big windowless box with its name lit up along the front, a glass
 * entrance and cart shelter on the street side, and the car park on the roof,
 * reached by a ramp up the side.
 */
function bigMart(b: Building, w: World, out: Part[]) {
  const r = seq(b.look + b.id * 0.0137);
  const Wm = bw(b) * CELL, Dm = bh(b) * CELL;
  const cx = b.x * CELL + Wm / 2, cz = b.y * CELL + Dm / 2;
  // Which side faces the road: the store's front (local -z) turns to it.
  const a = network(w).access.get(b.id);
  let rot = Math.PI;
  if (a !== undefined) {
    const dx = (a % N) * CELL + CELL / 2 - cx, dz = Math.floor(a / N) * CELL + CELL / 2 - cz;
    rot = Math.abs(dx) / Wm > Math.abs(dz) / Dm ? (dx > 0 ? -Math.PI / 2 : Math.PI / 2) : dz > 0 ? Math.PI : 0;
  }
  const side = Math.abs(Math.sin(rot)) > 0.5;
  const FW = side ? Dm : Wm, FD = side ? Wm : Dm; // frontage width and depth in the store's frame
  const c0 = Math.cos(rot), s0 = Math.sin(rot);
  const P: Put = (s, dx, dy, dz, ww, h, d, color, style = STYLE.plain, dr = 0, sign) =>
    out.push({ shape: s, x: cx + dx * c0 + dz * s0, y: dy, z: cz - dx * s0 + dz * c0, sx: ww, sy: h, sz: d, rot: rot + dr, color, style, sign });
  const H = 12, bwid = FW - 5.5, bdep = FD - 3, bx = -2.2, bz = 0.8;
  const brand = pick(['#f2c12e', '#d9473b', '#2f6db3', '#e8743b'], r());
  P('box', bx, 0, bz, bwid, H, bdep, '#ebe8e1', STYLE.factory);
  // The name along the top of the front, and a band of colour under it.
  P('box', bx, H - 3.6, bz - bdep / 2 - 0.2, bwid * 0.55, 2.6, 0.35, brand, STYLE.sign);
  P('box', bx, H - 0.9, bz - bdep / 2 - 0.12, bwid, 0.6, 0.2, brand);
  // Glass entrance and canopy.
  P('box', bx, 0, bz - bdep / 2 - 0.1, 9, 3.6, 0.3, '#7d9bb5', STYLE.office);
  P('box', bx, 3.6, bz - bdep / 2 - 1.4, 10, 0.3, 2.8, '#d8d5cc');
  // Cart shelter by the door.
  P('box', bx + bwid / 2 - 3, 0, bz - bdep / 2 - 1.2, 3.6, 2.2, 1.6, '#c9ced4');
  // Roof car park: asphalt, bays, cars, a parapet, the lift tower.
  P('box', bx, H, bz, bwid, 0.1, bdep, '#5a5d61');
  for (const sz of [-1, 1]) P('box', bx, H, bz + sz * (bdep / 2 - 0.2), bwid, 1, 0.3, '#d8d5cc');
  for (const sx2 of [-1, 1]) P('box', bx + sx2 * (bwid / 2 - 0.2), H, bz, 0.3, 1, bdep, '#d8d5cc');
  const CARS = ['#f2f2f0', '#1b1c1e', '#a9adb2', '#6f7378', '#2a3d66', '#8c1d1d'];
  for (const lane of [-1, 1]) for (let x = bx - bwid / 2 + 2; x < bx + bwid / 2 - 2; x += 2.6) {
    if (r() < 0.35) continue;
    P('box', x, H + 0.1, bz + lane * (bdep / 4), 1.7, 0.8, 4, pick(CARS, r()));
    P('box', x, H + 0.9, bz + lane * (bdep / 4), 1.5, 0.5, 2, '#2c2f33');
  }
  P('box', bx + bwid / 2 - 2.5, H, bz + bdep / 2 - 2.5, 3.5, 3.4, 3.5, '#d8d5cc');
  // The ramp up the side (local +x): a sloped deck from the back corner to the roof.
  const rx = FW / 2 - 2.2;
  P('prism', rx, 0, bz, 4.2, H, bdep, '#9d9a92', STYLE.plain, 0);
  P('box', rx, H, bz + bdep / 2 - 0.5, 4.2, 0.9, 0.3, '#d8d5cc');
}

/** Office plots: a podium over the whole lot, with a tower for every two cells of frontage. */
function officeBlock(b: Building): Part[] {
  const r = seq(b.look + b.id * 0.0137);
  const Wm = bw(b) * CELL, Dm = bh(b) * CELL;
  const cx = b.x * CELL + Wm / 2, cz = b.y * CELL + Dm / 2;
  const H = b.floors * 3;
  const out: Part[] = [];
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, style = STYLE.plain, sign?: string) =>
    out.push({ shape: 'box', x: cx + x, y, z: cz + z, sx, sy, sz, rot: 0, color, style, sign });
  box(0, 0, 0, Wm - 1.6, 9, Dm - 1.6, '#b9b4ab', STYLE.shops, pick(SIGN, r()));
  const alongX = Wm >= Dm, long = alongX ? Wm : Dm;
  const n = Math.max(1, Math.floor(long / 15));
  const glass = pick(['#7c90a6', '#8aa1a8', '#6d7f94', '#9aa7b4'], r());
  for (let k = 0; k < n; k++) {
    const u = -long / 2 + (long / n) * (k + 0.5);
    const tw = 10 + r() * 3, td = 10 + r() * 3, h = H - (k % 2) * 9;
    const [x, z] = alongX ? [u, 0] : [0, u];
    box(x, 9, z, tw, h - 9, td, glass, STYLE.office);
    box(x, h, z, 3, 2.5, 3, '#c9cbcc');
  }
  return out;
}

/** Pitched roof, ridge along x, one unit high on a 1x1 footprint. */
function gableGeometry() {
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

/**
 * 한옥 roof (팔작지붕, simplified): ridge along x, footprint 1x1, height 1.
 * The slopes sag, the ridge rises toward its ends and the eaves sweep up at the corners.
 */
function hanokRoof(): THREE.BufferGeometry {
  const RL = 0.34;
  const lift = (u: number) => 0.22 * Math.pow(Math.min(1, Math.abs(u) * 2), 3);
  const ridge = (x: number) => new THREE.Vector3(x, 1 + 0.07 * (Math.abs(x) / RL) ** 2, 0);
  const slope = (a: THREE.Vector3, b: THREE.Vector3, t: number) => { const p = a.clone().lerp(b, t); p.y = a.y + (b.y - a.y) * Math.pow(t, 1.5); return p; };
  const tris: THREE.Vector3[] = [];
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => tris.push(a, b, c, a, c, d);
  const NS = 4, NT = 2, NE = 2;
  for (const sz of [-1, 1]) for (let i = 0; i < NS; i++) for (let j = 0; j < NT; j++) {
    const P = (ii: number, jj: number) => { const u = -0.5 + ii / NS; return slope(new THREE.Vector3(u, lift(u), sz * 0.5), ridge(u * RL / 0.5), jj / NT); };
    quad(P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1));
  }
  for (const sx of [-1, 1]) for (let i = 0; i < NE; i++) for (let j = 0; j < NT; j++) {
    const P = (ii: number, jj: number) => { const w = -0.5 + ii / NE; return slope(new THREE.Vector3(sx * 0.5, lift(w), w), ridge(sx * RL), jj / NT); };
    quad(P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1));
  }
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

/** Stands in for the pockets in the instance loop (never in the world). */
const POCKET = { id: -1, kind: 'park', x: 0, y: 0, size: 1, floors: 0, look: 0, occ: 0, powered: true, watered: true, sewered: true, happy: 60, outage: 0, abandoned: false, builtDay: 0 } as Building;

/** The parts of one backland cell: a green strip, a 소공원, a 놀이터, a 주말 텃밭 or a 공터. */
function pocketParts(i: number): Part[] {
  const out: Part[] = [];
  const cx = (i % N) * CELL + CELL / 2, cz = ((i / N) | 0) * CELL + CELL / 2;
  const h = (k: number) => { const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return s - Math.floor(s); };
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string) => out.push({ shape: 'box', x: cx + x, y, z: cz + z, sx, sy, sz, rot: 0, color, style: STYLE.plain });
  const shape = (s: Shape, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, rot = 0) => out.push({ shape: s, x: cx + x, y, z: cz + z, sx, sy, sz, rot, color, style: STYLE.plain });
  const tree = (x: number, z: number, s: number) => { box(x, 0, z, 0.25, 1.4 * s, 0.25, '#6b5440'); shape('tree', x, 1.1 * s, z, 2.8 * s, 3 * s, 2.8 * s, pick(['#5e8f45', '#6c9f4f', '#7aab55'], h(9))); };
  switch (pocketKind(i)) {
    case 'green':
      box(0, 0, 0, 9.6, 0.06, 9.6, '#7fae55');
      tree(-2.5, -2, 1 + h(1) * 0.3); tree(2.6, 2.2, 0.9 + h(2) * 0.3);
      if (h(3) < 0.5) tree(2.4, -2.6, 0.8);
      break;
    case 'park':
      box(0, 0, 0, 9.6, 0.06, 9.6, '#86b55e');
      box(0, 0.06, 0, 1.4, 0.03, 9.6, '#d8c9a8');
      for (const z of [-2, 2]) { box(-1.6, 0, z, 0.6, 0.45, 1.8, '#8a6a4a'); }
      tree(-3, -3, 1); tree(3, 3, 1.1);
      if (h(4) < 0.5) { shape('hip', 2.8, 2.4, -2.6, 3, 1, 3, '#4a4f55'); for (const [a, c] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(2.8 + a, 0, -2.6 + c, 0.16, 2.4, 0.16, '#7a3b2e'); }
      break;
    case 'play':
      box(0, 0, 0, 9.6, 0.06, 9.6, '#c9b48a');
      box(-1.4, 0.06, -0.6, 4, 0.1, 4, '#e2c48a');
      shape('prism', -1.6, 0.16, -0.8, 1, 1.7, 2.4, pick(['#e74c3c', '#f1c40f', '#3498db'], h(5)));
      box(-0.2, 0.16, -0.8, 1, 1.7, 1, '#2e9e4f');
      for (const x of [2.4, 3.6]) box(x, 0, 2.6, 0.12, 2, 0.12, '#8d9399');
      box(3, 2, 2.6, 1.5, 0.12, 0.12, '#8d9399');
      tree(-3.4, 3.4, 0.9);
      break;
    case 'garden':
      box(0, 0, 0, 9.6, 0.06, 9.6, '#8a7a5c');
      for (let k = 0; k < 4; k++) box(-1, 0.06, -3.3 + k * 2.2, 6.4, 0.3, 1.2, h(6 + k) < 0.5 ? '#6f9a3f' : '#8fb34f');
      box(3.6, 0, 3.2, 1.4, 1.2, 1.2, '#3f6f9f');
      shape('cyl', 3.6, 0, -3.4, 0.8, 0.9, 0.8, '#5a3b2a');
      break;
    case 'empty':
      box(0, 0, 0, 9.6, 0.04, 9.6, '#b59f7a');
      for (let k = 0; k < 3; k++) shape('tree', (h(10 + k) - 0.5) * 7, 0, (h(20 + k) - 0.5) * 7, 1.6, 0.8, 1.6, '#8a9a5a');
      if (h(7) < 0.5) box(2.5, 0, -2.5, 2.2, 0.3, 1.2, '#8d8a84');
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
  gable: gableGeometry(),
  hanok: hanokRoof(),
  hip: new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0),
  tree: new THREE.IcosahedronGeometry(0.5, 0).translate(0, 0.5, 0),
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
  private pocketKey = '';
  private pocketParts: Part[] = [];
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
      gable: plain,
      hanok: new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide }),
      hip: plain,
      tree: plain,
    };
    (Object.keys(GEOS) as Shape[]).forEach((s) => this.alloc(s, s === 'box' ? 4096 : 512));
    // Problem badges: a round pictogram on a card-stock ring, coral for what needs fixing, slate for empty houses.
    for (const k of ['power', 'water', 'road', 'gone', 'park']) {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      drawIcon(c.getContext('2d')!, k);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
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
    const ver = `${w.ver.buildings}:${w.ver.roads}:${w.ver.zones}`;
    this.neonMat.emissiveIntensity = 0.25 + shared.uNight.value * 3;
    if (!force && ver === this.ver && !this.animating) return;
    this.ver = ver;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    const need = Object.fromEntries(Object.keys(GEOS).map((k) => [k, 0])) as Record<Shape, number>;
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
    live.add(POCKET.id);
    for (const id of this.born.keys()) if (!live.has(id)) { this.born.delete(id); this.cache.delete(id); }
    // 동네 쉼터 on the lots behind the houses: drawn like a building that is always fully grown.
    const pk = `${w.ver.roads}:${w.ver.zones}:${w.ver.buildings}`;
    if (pk !== this.pocketKey) { this.pocketKey = pk; this.pocketParts = pockets(w).flatMap((i) => pocketParts(i)); }
    for (const pt of this.pocketParts) need[pt.shape]++;
    all.push({ b: POCKET, parts: this.pocketParts });
    this.born.set(POCKET.id, -99);
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
  /** `parking`: the 주차 map is open, so every building short of spaces gets a P; otherwise only the worst do. */
  updateIcons(w: World, showAll: boolean, parking = false) {
    const net = network(w);
    let n = 0;
    const put = (b: Building, k: string) => {
      if (n >= 400) return;
      let sp = this.icons[n];
      if (!sp) { sp = new THREE.Sprite(); sp.renderOrder = 10; this.icons[n] = sp; this.group.add(sp); }
      sp.material = this.iconTex[k];
      // Empty houses get a quieter, smaller badge than problems the player can fix.
      const k2 = k === 'gone' ? 4.6 : 6.4;
      sp.position.set((b.x + bw(b) / 2) * CELL, b.floors * 3 + 4 + k2, (b.y + bh(b) / 2) * CELL);
      sp.scale.set(k2, k2, 1);
      sp.visible = true;
      n++;
    };
    w.buildings.forEach((b) => {
      const d = KINDS[b.kind];
      if (b.kind === 'metro' || b.kind === 'tower') return;
      if (!d.zone) { if (!net.access.has(b.id)) put(b, 'road'); else if (showAll && d.power > 0 && !b.powered) put(b, 'power'); return; }
      if (b.abandoned) put(b, 'gone');
      else if (b.outage > 3 || (showAll && b.outage > 0)) put(b, !b.powered ? 'power' : 'water');
      // Cars with nowhere to go: the parking pressure (share of its cars without a space) of this lot.
      else if (w.parkPress[b.y * N + b.x] >= (parking ? 30 : 70)) put(b, 'park');
    });
    for (let i = n; i < this.icons.length; i++) this.icons[i].visible = false;
  }
}

/** A 128px badge: drop shadow, light ring, coloured disc, and a white pictogram. */
function drawIcon(g: CanvasRenderingContext2D, k: string) {
  const R = 52;
  g.save();
  g.shadowColor = 'rgba(20, 24, 30, 0.35)';
  g.shadowBlur = 8;
  g.shadowOffsetY = 3;
  g.fillStyle = '#fbf8ee';
  g.beginPath(); g.arc(64, 62, R + 6, 0, Math.PI * 2); g.fill();
  g.restore();
  g.fillStyle = k === 'gone' ? '#5b616b' : k === 'water' ? '#2f7fc8' : k === 'road' ? '#e0892f' : k === 'park' ? '#2f5fa8' : '#f0644f';
  g.beginPath(); g.arc(64, 62, R, 0, Math.PI * 2); g.fill();
  g.fillStyle = g.strokeStyle = '#fbf8ee';
  g.lineJoin = g.lineCap = 'round';
  g.beginPath();
  if (k === 'park') {
    // A parking sign: the bold P.
    g.font = '700 70px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('P', 64, 66);
  } else if (k === 'power') {
    // Lightning bolt.
    g.moveTo(72, 24); g.lineTo(42, 68); g.lineTo(62, 68); g.lineTo(54, 100); g.lineTo(86, 52); g.lineTo(66, 52); g.lineTo(74, 24);
    g.closePath(); g.fill();
  } else if (k === 'water') {
    // A drop, with a slash: no water.
    g.moveTo(64, 26); g.bezierCurveTo(78, 46, 88, 58, 88, 72); g.arc(64, 72, 24, 0, Math.PI); g.bezierCurveTo(40, 58, 50, 46, 64, 26);
    g.fill();
    g.strokeStyle = '#2f7fc8'; g.lineWidth = 7;
    g.beginPath(); g.moveTo(44, 92); g.lineTo(86, 40); g.stroke();
  } else if (k === 'road') {
    // A road running away into the distance, with a gap: not connected.
    g.moveTo(52, 26); g.lineTo(76, 26); g.lineTo(94, 100); g.lineTo(34, 100); g.closePath(); g.fill();
    g.fillStyle = '#e0892f';
    g.fillRect(61, 32, 6, 12); g.fillRect(60, 52, 8, 12); g.fillRect(59, 74, 10, 16);
    g.strokeStyle = '#e0892f'; g.lineWidth = 8;
    g.beginPath(); g.moveTo(30, 60); g.lineTo(98, 60); g.stroke();
  } else {
    // An empty house: gable roof, boarded-up window.
    g.moveTo(30, 60); g.lineTo(64, 30); g.lineTo(98, 60); g.lineTo(90, 60); g.lineTo(90, 96); g.lineTo(38, 96); g.lineTo(38, 60); g.closePath(); g.fill();
    g.strokeStyle = '#5b616b'; g.lineWidth = 6;
    g.strokeRect(52, 62, 24, 22);
    g.beginPath(); g.moveTo(52, 62); g.lineTo(76, 84); g.moveTo(76, 62); g.lineTo(52, 84); g.stroke();
  }
}
