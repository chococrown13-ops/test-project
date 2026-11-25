import * as THREE from 'three';
import { type Acc, type Look, lookAt, type UnitDef } from '../sim/units';

/**
 * Low-poly figures for the pieces: a disc in the colour of the cost tier,
 * a body, a head, and the one thing that tells you who it is (a horn, nine
 * tails, a 갓, a shell...). Built from a handful of primitives, flat-shaded.
 */

/** Shapes that are creatures (drawn standing, sized like figures), not dishes on a plate. */
export const CREATURES: string[] = ['snowman', 'cloud', 'twister', 'bird', 'drop', 'pebble', 'jelly'];

let creatureShape = false;

export const TIER_COLOR = ['#888', '#9aa3ab', '#4f9d69', '#3f7cc4', '#9b59b6', '#e2a822'];

/**
 * Three ways to draw the same pieces (the player picks one):
 *  - doll: 치비 인형. Big round heads, soft toon shading, a dark outline.
 *  - carved: 나무 장기알. Faceted, wood-toned figures on octagonal wooden tokens.
 *  - porcelain: 도자기 인형. Smooth glazed figures with a clear-coat shine.
 */
export type PieceStyle = 'art' | 'sticker' | 'doll' | 'carved' | 'porcelain' | 'pixel' | 'voxel';
/** The styles on offer: 도트 and 인형 (the others are kept for comparing, not offered). */
export const STYLE_NAME: Partial<Record<PieceStyle, string>> = { art: '그림', pixel: '도트', doll: '인형' };
/** Styles whose figures use the big-headed doll proportions. */
const chibi = () => style === 'doll' || style === 'pixel' || style === 'voxel' || style === 'sticker' || style === 'art';
let style: PieceStyle = 'art';
export function setPieceStyle(s: PieceStyle) { style = s; }
export const pieceStyle = () => style;
/** Whether figures get eyes (한식 대전's dishes don't). */
let faces = true;

/**
 * 도트 style: eyes are painted pixel by pixel rather than drawn as tiny spheres (which come out
 * lopsided at 40 pixels). While capturing, the face code notes where each pair of eyes goes instead.
 */
export interface EyeMark { x: number; y: number; z: number; spread: number; cute: boolean; one?: boolean }
let eyeLog: EyeMark[] | null = null;
export function beginEyeCapture() { eyeLog = []; }
export function endEyeCapture(): EyeMark[] { const l = eyeLog ?? []; eyeLog = null; return l; }

let toonRamp: THREE.DataTexture | null = null;
function ramp() {
  if (!toonRamp) {
    toonRamp = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
    toonRamp.minFilter = toonRamp.magFilter = THREE.NearestFilter;
    toonRamp.needsUpdate = true;
  }
  return toonRamp;
}

const WOOD = new THREE.Color('#b58a5a');
const mats = new Map<string, THREE.Material>();
function mat(color: string, opts: { emissive?: string; rough?: number } = {}): THREE.Material {
  const k = `${style}|${color}|${opts.emissive ?? ''}|${opts.rough ?? 0.75}`;
  let m = mats.get(k);
  if (m) return m;
  if (style === 'voxel') m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, emissive: opts.emissive ?? '#000000' });
  else if (style === 'doll' || style === 'pixel' || style === 'sticker' || style === 'art') m = new THREE.MeshToonMaterial({ color, gradientMap: ramp(), emissive: opts.emissive ?? '#000000' });
  else if (style === 'porcelain') m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12, emissive: opts.emissive ?? '#000000' });
  else m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).lerp(WOOD, 0.22), flatShading: true, roughness: 0.88, emissive: opts.emissive ?? '#000000' });
  mats.set(k, m);
  return m;
}

/** Round things get more facets in the smooth styles. */
const seg = (n: number) => (style === 'carved' ? Math.max(5, Math.round(n * 0.7)) : Math.round(n * 1.6));

function mesh(g: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0, opts?: { emissive?: string; rough?: number }) {
  const m = new THREE.Mesh(g, mat(color, opts));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export interface PieceObj { root: THREE.Group; figure: THREE.Group; base: THREE.Mesh; shield: THREE.Mesh; stun: THREE.Group; ring: THREE.Mesh; glow: THREE.Mesh }

/** The token the figure stands on, in the tier's colour. */
function makeBase(tier: number): THREE.Mesh {
  const tc = TIER_COLOR[tier] ?? '#777';
  if (style === 'carved') {
    // An octagonal 장기알 with a painted rim.
    const b = mesh(new THREE.CylinderGeometry(0.33, 0.35, 0.12, 8), '#c9a274', 0, 0.06, 0);
    b.add(mesh(new THREE.CylinderGeometry(0.355, 0.355, 0.035, 8), tc, 0, 0.0, 0));
    b.receiveShadow = true;
    return b;
  }
  const b = mesh(new THREE.CylinderGeometry(0.31, 0.34, 0.08, 32), style === 'porcelain' ? '#f4f1ea' : tc, 0, 0.04, 0, { rough: 0.5 });
  if (style === 'porcelain') b.add(mesh(new THREE.CylinderGeometry(0.345, 0.345, 0.03, 32), tc, 0, -0.01, 0));
  else b.add(mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.012, 28), '#fbf6ea', 0, 0.04, 0));
  b.receiveShadow = true;
  return b;
}

/** Dark back-face shells: the drawn outline of the doll style. */
function outline(fig: THREE.Group) {
  const ink = new THREE.MeshBasicMaterial({ color: '#2a1d17', side: THREE.BackSide });
  const add: [THREE.Object3D, THREE.Mesh][] = [];
  fig.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.noOutline) return;
    const g = m.geometry as THREE.BufferGeometry & { parameters?: { radius?: number } };
    if (g.type === 'CircleGeometry' || g.type === 'RingGeometry') return;
    g.computeBoundingSphere();
    if ((g.boundingSphere?.radius ?? 0) < 0.04) return;
    const hull = new THREE.Mesh(g, ink);
    const k = 1 + 0.025 / Math.max(0.05, g.boundingSphere!.radius);
    hull.scale.setScalar(k);
    hull.userData.noOutline = true;
    add.push([m, hull]);
  });
  for (const [m, hull] of add) m.add(hull);
}

/** A piece's evolved form as a def of its own (id `kind@star`), or the def itself. */
export function evolved(def: UnitDef, star: number): UnitDef {
  return def.evo && star >= 2 ? { ...def, id: `${def.id}@${star}`, look: lookAt(def, star) } : def;
}

/** 도트 and 캐릭터 styles: a hook (set by thumbs.ts) that draws a piece as a sprite texture. */
let spriteFor: ((def: UnitDef, faces: boolean) => THREE.Texture) | null = null;
export function setSpriteMaker(fn: (def: UnitDef, faces: boolean) => THREE.Texture) { spriteFor = fn; }
/** Whether this style draws pieces as flat camera-facing pictures. */
export const spriteStyle = () => style === 'pixel' || style === 'sticker' || style === 'art';

/**
 * `raw` builds the figure from primitives even in the 도트 and 복셀 styles (the sprite maker and the
 * voxeliser start from it).
 */
export function buildPiece(def0: UnitDef, star: number, enemy = false, withFaces = true, raw = false): PieceObj {
  faces = withFaces;
  const root = new THREE.Group();
  // An evolved piece is drawn as its own form (its look and its own sprite).
  const def = evolved(def0, star);
  const L = def.look;
  const base = makeBase(def.tier);
  root.add(base);
  // A thin ring round the base: red for the other side.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.03, 6, 32), new THREE.MeshBasicMaterial({ color: enemy ? '#d94a3a' : '#f4efe2' }));
  ring.rotation.x = Math.PI / 2; ring.position.y = style === 'carved' ? 0.12 : 0.08;
  root.add(ring);
  // A glow under the piece, lit when its trait is picked out.
  const glow = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.5, 40), new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.06; glow.visible = false;
  root.add(glow);

  const fig = new THREE.Group();
  // Pieces stand well inside their square (about 60% of it), as on the usual auto-battler boards.
  const s = 0.92 * (L.size ?? 1) * (star === 3 ? 1.22 : star === 2 ? 1.1 : 1);
  fig.scale.setScalar(s);
  fig.position.y = style === 'carved' ? 0.12 : 0.08;
  root.add(fig);
  const body = L.body, head = L.head;
  const serpent = L.acc === 'serpent';
  // Where things hang: accessories drawn for a head at y 0.62 (r 0.17) and a body 0.48 tall, refitted to this style's proportions.
  const doll = chibi();
  const headY = doll ? 0.6 : 0.62, headK = doll ? 1.45 : 1, bodyK = doll ? 0.8 : 1;
  const headG = new THREE.Group(), bodyG = new THREE.Group();
  headG.position.y = headY - 0.62 * headK; headG.scale.setScalar(headK);
  bodyG.scale.set(doll ? 1.15 : 1, bodyK, doll ? 1.15 : 1);
  fig.add(headG, bodyG);
  const shaped = !!L.shape && L.shape !== 'figure';
  if (shaped) shapeBody(fig, L);
  else if (serpent) {
    // A coiled body instead of a standing one.
    const coil = mesh(new THREE.TorusGeometry(0.22, 0.1, seg(6), seg(14)), body, 0, 0.12, 0);
    coil.rotation.x = Math.PI / 2;
    fig.add(coil, mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.45, seg(7)), body, 0.05, 0.38, 0));
    fig.add(mesh(new THREE.SphereGeometry(0.15, seg(8), seg(6)), head, 0.08, 0.66, 0.06));
    if (faces) faceOn(fig, 0.08, 0.68, 0.19, 0.05, 0.028);
    fig.add(mesh(new THREE.ConeGeometry(0.04, 0.16, 4), '#e8d9a8', 0.0, 0.8, 0.02), mesh(new THREE.ConeGeometry(0.04, 0.16, 4), '#e8d9a8', 0.16, 0.8, 0.02));
  } else {
    const wide = L.acc === 'shell' || L.acc === 'spikes' || L.acc === 'mane';
    if (doll) {
      // A round little body, stubby arms and feet, a big head.
      const b = mesh(new THREE.SphereGeometry(wide ? 0.25 : 0.21, seg(10), seg(8)), body, 0, 0.21, 0); b.scale.set(1, 0.95, 0.9); fig.add(b);
      for (const sd of [-1, 1]) {
        fig.add(mesh(new THREE.SphereGeometry(0.075, seg(8), seg(6)), body, sd * (wide ? 0.26 : 0.22), 0.24, 0.03));
        const ft = mesh(new THREE.SphereGeometry(0.08, seg(8), seg(6)), head, sd * 0.1, 0.03, 0.05); ft.scale.set(1, 0.55, 1.3); fig.add(ft);
      }
      fig.add(mesh(new THREE.SphereGeometry(0.25, seg(12), seg(10)), head, 0, headY, 0));
      if (faces && L.acc !== 'eye') faceOn(fig, 0, headY + 0.01, 0.22, 0.085, 0.045, true);
    } else {
      fig.add(mesh(new THREE.CylinderGeometry(wide ? 0.22 : 0.16, wide ? 0.3 : 0.24, 0.48, seg(7)), body, 0, 0.24, 0));
      for (const sd of [-1, 1]) {
        const arm = mesh(new THREE.CapsuleGeometry(0.045, 0.2, 3, seg(6)), body, sd * (wide ? 0.27 : 0.21), 0.26, 0.02); arm.rotation.z = sd * 0.25; fig.add(arm);
        fig.add(mesh(new THREE.SphereGeometry(0.05, seg(6), seg(4)), head, sd * (wide ? 0.3 : 0.24), 0.14, 0.04));
      }
      fig.add(mesh(style === 'carved' ? new THREE.IcosahedronGeometry(wide ? 0.2 : 0.17, 0) : new THREE.SphereGeometry(wide ? 0.2 : 0.17, seg(10), seg(8)), head, 0, 0.62, 0));
      if (faces && L.acc !== 'eye') faceOn(fig, 0, 0.64, 0.155, 0.06, 0.026);
    }
  }
  /** Accessories: head things (y 0.6 and up) onto the head, the rest onto the body. */
  const add = (...o: THREE.Object3D[]) => {
    let last: THREE.Group = fig;
    for (const x of o) {
      if (shaped || serpent) { fig.add(x); last = fig; continue; }
      last = x.position.y >= 0.6 ? headG : bodyG;
      last.add(x);
    }
    return last;
  };
  /** One accessory (a piece can have two: its own, and one an evolution adds). */
  const accessory = (acc: Acc | undefined) => { switch (acc) {
    case 'horn': add(mesh(new THREE.ConeGeometry(0.05, 0.2, 5), '#f2e3b3', 0, 0.85, 0)); break;
    case 'horns': {
      const h1 = mesh(new THREE.ConeGeometry(0.05, 0.22, 5), '#f2e3b3', -0.1, 0.82, 0), h2 = mesh(new THREE.ConeGeometry(0.05, 0.22, 5), '#f2e3b3', 0.1, 0.82, 0);
      h1.rotation.z = 0.35; h2.rotation.z = -0.35;
      add(h1, h2);
      break;
    }
    case 'eye': {
      // One big eye (외눈도깨비).
      if (eyeLog) {
        const k = doll ? 1.45 : 1;
        eyeLog.push({ x: 0, y: headY + (0.66 - 0.62) * k, z: (0.2) * k, spread: 0, cute: false, one: true });
        add(mesh(new THREE.ConeGeometry(0.04, 0.14, 5), '#f2e3b3', 0, 0.84, 0));
      } else add(mesh(new THREE.SphereGeometry(0.07, 8, 6), '#fffbe8', 0, 0.66, 0.13), mesh(new THREE.SphereGeometry(0.035, 6, 4), '#1b1b1f', 0, 0.66, 0.19), mesh(new THREE.ConeGeometry(0.04, 0.14, 5), '#f2e3b3', 0, 0.84, 0));
      break;
    }
    case 'bumps': for (const sd of [-1, 1]) add(mesh(new THREE.SphereGeometry(0.075, seg(8), seg(6)), head, sd * 0.09, 0.76, 0.03)); break;
    case 'ears': {
      const e1 = mesh(new THREE.ConeGeometry(0.06, 0.16, 4), head, -0.1, 0.8, 0), e2 = mesh(new THREE.ConeGeometry(0.06, 0.16, 4), head, 0.1, 0.8, 0);
      add(e1, e2);
      const tail = mesh(new THREE.ConeGeometry(0.08, 0.38, 5), body, 0, 0.2, -0.26);
      tail.rotation.x = -1.1; add(tail);
      break;
    }
    case 'ears9': {
      add(mesh(new THREE.ConeGeometry(0.06, 0.16, 4), head, -0.1, 0.8, 0), mesh(new THREE.ConeGeometry(0.06, 0.16, 4), head, 0.1, 0.8, 0));
      for (let k = 0; k < 9; k++) {
        const a = (k / 8 - 0.5) * 2.2;
        const t = mesh(new THREE.ConeGeometry(0.05, 0.42, 5), k % 2 ? '#f6c28b' : '#fff6e6', Math.sin(a) * 0.18, 0.3, -0.22 - Math.cos(a) * 0.05);
        t.rotation.x = -0.9; t.rotation.z = -a * 0.7;
        add(t);
      }
      break;
    }
    case 'stripes': for (let k = 0; k < 3; k++) add(mesh(new THREE.TorusGeometry(0.21 - k * 0.012, 0.025, 4, 10), '#2a2420', 0, 0.12 + k * 0.14, 0)).children.at(-1)!.rotation.set(Math.PI / 2, 0, 0); break;
    case 'gat': {
      // A 갓; smaller on the big-headed dolls so it doesn't hide them from the camera above.
      const br = doll ? 0.2 : 0.3;
      add(mesh(new THREE.CylinderGeometry(br, br, 0.02, seg(16)), '#1a1a1d', 0, 0.76, 0), mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.15, seg(10)), '#1a1a1d', 0, 0.85, 0));
      break;
    }
    case 'hat': add(mesh(new THREE.ConeGeometry(0.2, 0.28, 8), '#8a5a2b', 0, 0.88, 0)); break;
    case 'hood': add(mesh(new THREE.ConeGeometry(0.24, 0.5, 7), body, 0, 0.72, -0.04)); break;
    case 'shell': {
      // A domed shell with a rim, wide enough to show round the sides.
      const sh = mesh(new THREE.SphereGeometry(0.33, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), L.extra ?? '#3e6b3e', 0, 0.2, -0.1);
      sh.scale.set(1.05, 0.95, 1); add(sh);
      add(mesh(new THREE.TorusGeometry(0.33, 0.03, 5, 16), '#c9a86a', 0, 0.2, -0.1)).children.at(-1)!.rotation.set(Math.PI / 2, 0, 0);
      break;
    }
    case 'fins': {
      const fc = L.extra ?? '#f2b880';
      const f1 = mesh(new THREE.ConeGeometry(0.08, 0.25, 3), fc, -0.22, 0.32, 0), f2 = mesh(new THREE.ConeGeometry(0.08, 0.25, 3), fc, 0.22, 0.32, 0);
      f1.rotation.z = 1.2; f2.rotation.z = -1.2;
      add(f1, f2, mesh(new THREE.ConeGeometry(0.07, 0.2, 3), L.extra ?? '#c96f1d', 0, 0.84, -0.03));
      break;
    }
    case 'mane': {
      add(mesh(new THREE.DodecahedronGeometry(0.26, 0), '#4f7d5f', 0, 0.6, -0.05), mesh(new THREE.ConeGeometry(0.05, 0.18, 5), '#e8d9a8', 0, 0.86, 0.05));
      break;
    }
    case 'pole': {
      // A carved post: a tall body with a painted face band.
      add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.35, 7), body, 0, 0.82, 0), mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 7), '#b33a2e', 0, 1.0, 0));
      break;
    }
    case 'crown': {
      // A small gold crown with points and a jewel.
      const band = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.06, 12, 1, true), '#e8c04a', 0, 0.8, 0, { rough: 0.35 });
      (band.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide; add(band);
      for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 + Math.PI / 2; add(mesh(new THREE.ConeGeometry(0.035, 0.1, 4), '#e8c04a', Math.cos(a) * 0.12, 0.87, Math.sin(a) * 0.12, { rough: 0.35 })); }
      add(mesh(new THREE.OctahedronGeometry(0.035, 0), '#e8435a', 0, 0.8, 0.135, { emissive: '#5a0a14' }));
      break;
    }
    case 'conch': {
      // A tall spiral conch on the back, standing up over the head, with knobs down its whorls.
      const col = L.extra ?? '#f0a8a0';
      // (Leaning out to one side, so it stands clear of the big head from the front.)
      const c = mesh(new THREE.ConeGeometry(0.22, 0.7, seg(10)), col, 0.26, 0.6, -0.12); c.rotation.z = -0.5; add(c);
      for (let k = 0; k < 3; k++) { const r = mesh(new THREE.TorusGeometry(0.19 - k * 0.055, 0.028, 5, 14), '#fbe8d8', 0.2 + k * 0.08, 0.42 + k * 0.15, -0.12); r.rotation.set(Math.PI / 2, 0.5, 0); add(r); }
      for (let k = 0; k < 4; k++) add(mesh(new THREE.ConeGeometry(0.035, 0.1, 4), '#fbe8d8', 0.4 - k * 0.06, 0.38 + k * 0.13, -0.02));
      for (const sd of [-1, 1]) { const st = mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.2, 5), head, sd * 0.07, 0.86, 0.02); st.rotation.z = -sd * 0.25; add(st, mesh(new THREE.SphereGeometry(0.04, 6, 4), head, sd * 0.1, 0.96, 0.02)); }
      break;
    }
    case 'castle': {
      // A little fortress carried on the back: a wall, two towers with red roofs, a flag.
      const col = L.extra ?? '#c9d6ea';
      add(mesh(new THREE.BoxGeometry(0.46, 0.26, 0.26), col, 0, 0.5, -0.2));
      for (const sd of [-1, 1]) {
        add(mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.42, 8), col, sd * 0.22, 0.6, -0.2));
        add(mesh(new THREE.ConeGeometry(0.11, 0.18, 8), '#c8433a', sd * 0.22, 0.9, -0.2));
      }
      for (let k = 0; k < 3; k++) add(mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), col, (k - 1) * 0.12, 0.66, -0.08));
      add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.24, 4), '#5a4a3a', 0.22, 1.08, -0.2), mesh(new THREE.BoxGeometry(0.1, 0.06, 0.01), '#f2d04a', 0.27, 1.15, -0.2));
      for (const sd of [-1, 1]) { const st = mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.2, 5), head, sd * 0.07, 0.86, 0.06); st.rotation.z = -sd * 0.25; add(st, mesh(new THREE.SphereGeometry(0.04, 6, 4), head, sd * 0.1, 0.96, 0.06)); }
      break;
    }
    case 'antennae': {
      // Two feelers ending in glowing lights.
      for (const sd of [-1, 1]) {
        const st = mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.28, 4), '#3a3020', sd * 0.08, 0.88, 0); st.rotation.z = -sd * 0.4; add(st);
        add(mesh(new THREE.SphereGeometry(0.05, 8, 6), L.extra ?? '#f2e04a', sd * 0.14, 1.01, 0, { emissive: L.extra ?? '#f2e04a' }));
      }
      break;
    }
    case 'halo': {
      // A glowing ring floating over the head.
      const h = mesh(new THREE.TorusGeometry(0.15, 0.025, 6, 20), L.extra ?? '#fff2a0', 0, 0.94, 0, { emissive: L.extra ?? '#fff2a0' }); h.rotation.x = Math.PI / 2 - 0.25; add(h);
      break;
    }
    case 'whiskers': for (const sd of [-1, 1]) for (const k of [-1, 1]) { const w = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 4), '#3a2a20', sd * 0.2, 0.6 + k * 0.025, 0.14); w.rotation.z = Math.PI / 2 + sd * k * 0.2; add(w); } break;
    case 'spikes': for (let k = 0; k < 5; k++) { const sp = mesh(new THREE.ConeGeometry(0.06, 0.22, 4), '#3c3e44', (k - 2) * 0.08, 0.58 - Math.abs(k - 2) * 0.06, -0.2); sp.rotation.x = -0.6; add(sp); } break;
    case 'serpent': break;
    case 'wings': {
      for (const sd of [-1, 1]) {
        const wg = mesh(new THREE.CircleGeometry(0.2, 10), L.extra ?? '#cfe3ea', sd * 0.2, 0.45, -0.12, { emissive: L.extra && L.extra !== '#cfe3ea' ? L.extra : undefined });
        wg.scale.set(1, 1.5, 1); wg.rotation.set(0, sd * 0.9, sd * 0.4);
        (wg.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
        add(wg);
      }
      break;
    }
    case 'leaf': { const lf = mesh(new THREE.ConeGeometry(0.09, 0.3, 4), '#5f9a35', 0.04, 0.86, 0); lf.rotation.z = -0.4; lf.scale.z = 0.35; add(lf); break; }
    case 'petals': for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; add(mesh(new THREE.SphereGeometry(0.06, 6, 4), '#f29bb8', Math.cos(a) * 0.16, 0.76, Math.sin(a) * 0.16)); } break;
    case 'longears': for (const sd of [-1, 1]) { const e = mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.38, 6), head, sd * 0.08, 0.92, -0.02); e.rotation.z = -sd * 0.18; add(e, mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.3, 5), '#f2b5c6', sd * 0.08, 0.92, 0.025)); } break;
    case 'sun': { const sun = mesh(new THREE.CircleGeometry(0.42, 18), '#d9362b', 0, 0.62, -0.3, { emissive: '#7a1a12' }); add(sun); break; }
    case 'swirl': {
      add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 4), '#7a5a3a', 0.26, 0.5, 0.05));
      for (let k = 0; k < 4; k++) { const bl = mesh(new THREE.ConeGeometry(0.08, 0.2, 3), ['#d9362b', '#3a6fd9', '#e8c34a', '#4fa35a'][k], 0.26, 0.82, 0.08); bl.rotation.set(Math.PI / 2, 0, (k * Math.PI) / 2); bl.position.x += Math.cos((k * Math.PI) / 2) * 0.08; bl.position.y += Math.sin((k * Math.PI) / 2) * 0.08; add(bl); }
      break;
    }
    case 'bolt': for (let k = 0; k < 3; k++) { const b = mesh(new THREE.BoxGeometry(0.05, 0.14, 0.03), '#f2d04a', (k % 2 ? 0.04 : -0.02), 0.95 + k * 0.11, 0, { emissive: '#7a6a12' }); b.rotation.z = k % 2 ? -0.6 : 0.6; add(b); } break;
    case 'snow': add(mesh(new THREE.SphereGeometry(0.12, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), '#ffffff', 0, 0.74, 0)); break;
    case 'flame': {
      // A flickering tuft of fire on the head.
      add(mesh(new THREE.ConeGeometry(0.09, 0.3, 6), '#ffd24a', 0, 0.9, 0, { emissive: '#7a4a00' }));
      for (const sd of [-1, 1]) { const f = mesh(new THREE.ConeGeometry(0.06, 0.2, 6), '#ff7a2a', sd * 0.08, 0.83, 0.01, { emissive: '#5a1a00' }); f.rotation.z = -sd * 0.35; add(f); }
      break;
    }
    case 'quills': {
      // Spines fanned round the top and back of the head, so they show from the front.
      const col = L.extra ?? '#5a3a20';
      for (let k = 0; k < 9; k++) {
        const a = (k / 8 - 0.5) * Math.PI * 1.15;
        const dir = new THREE.Vector3(Math.sin(a), Math.cos(a) * 0.9 + 0.15, -0.45).normalize();
        const sp = mesh(new THREE.ConeGeometry(0.05, 0.2, 5), col, dir.x * 0.17, 0.62 + dir.y * 0.17, dir.z * 0.17);
        sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        add(sp);
      }
      break;
    }
    case 'snailshell': {
      // A big coiled shell on the back, peeking over the shoulders, and two eye stalks.
      const col = L.extra ?? '#c98a4a';
      // (Set off to one side and up, so it shows from the front over the shoulder.)
      add(mesh(new THREE.SphereGeometry(0.27, seg(10), seg(8)), col, 0.16, 0.42, -0.16));
      const ring = mesh(new THREE.TorusGeometry(0.14, 0.035, 6, 16), '#7a4a2a', 0.18, 0.44, 0.08); add(ring);
      for (const sd of [-1, 1]) { const st = mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.2, 5), head, sd * 0.07, 0.86, 0.02); st.rotation.z = -sd * 0.25; add(st, mesh(new THREE.SphereGeometry(0.04, 6, 4), head, sd * 0.1, 0.96, 0.02)); }
      break;
    }
    case 'penguin': {
      // White face and belly, an orange beak, little flippers.
      const white = L.extra ?? '#f4f7fa';
      const belly = mesh(new THREE.SphereGeometry(0.17, seg(10), seg(8)), white, 0, 0.22, 0.09); belly.scale.set(0.9, 1.1, 0.6); add(belly);
      const face = mesh(new THREE.SphereGeometry(0.13, seg(10), seg(8)), white, 0, 0.6, 0.08); face.scale.set(1.1, 0.9, 0.7); add(face);
      const bk = mesh(new THREE.ConeGeometry(0.04, 0.12, 5), '#f2a03a', 0, 0.56, 0.2); bk.rotation.x = Math.PI / 2; add(bk);
      for (const sd of [-1, 1]) { const fl = mesh(new THREE.BoxGeometry(0.05, 0.2, 0.12), body, sd * 0.24, 0.26, 0); fl.rotation.z = sd * 0.4; add(fl); }
      break;
    }
    case 'mole': {
      // A pink nose and big digging claws.
      add(mesh(new THREE.SphereGeometry(0.055, 8, 6), '#f29bb0', 0, 0.58, 0.18));
      for (const sd of [-1, 1]) { const cl = mesh(new THREE.SphereGeometry(0.085, 8, 6), '#f2c4b8', sd * 0.25, 0.22, 0.1); cl.scale.set(1, 0.6, 1.2); add(cl); }
      break;
    }
    case 'fleece': {
      // Fluffy wool all over, a woolly cap, and curled horns.
      const wool = L.extra ?? '#f4f1e8';
      for (const [x, y, z, r] of [[-0.15, 0.24, 0.06, 0.13], [0.15, 0.24, 0.06, 0.13], [0, 0.3, 0.12, 0.13], [0, 0.16, 0.1, 0.12], [-0.12, 0.36, -0.08, 0.13], [0.12, 0.36, -0.08, 0.13]] as number[][]) add(mesh(new THREE.IcosahedronGeometry(r, 1), wool, x, y, z));
      for (const x of [-0.08, 0, 0.08]) add(mesh(new THREE.IcosahedronGeometry(0.08, 1), wool, x, 0.78, 0.02));
      for (const sd of [-1, 1]) { const h = mesh(new THREE.TorusGeometry(0.06, 0.025, 5, 10), '#c9b08a', sd * 0.17, 0.66, 0.02); h.rotation.y = Math.PI / 2; add(h); }
      break;
    }
    case 'antlers': {
      // Branching antlers, with blossoms at the tips when the piece has a flower colour.
      for (const sd of [-1, 1]) {
        const main = mesh(new THREE.CylinderGeometry(0.018, 0.026, 0.26, 5), '#8a6a4a', sd * 0.1, 0.86, 0); main.rotation.z = -sd * 0.45; add(main);
        const tine = mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.13, 5), '#8a6a4a', sd * 0.1, 0.9, 0); tine.rotation.z = sd * 0.35; add(tine);
        if (L.extra) add(mesh(new THREE.SphereGeometry(0.045, 6, 4), L.extra, sd * 0.17, 0.97, 0), mesh(new THREE.SphereGeometry(0.035, 6, 4), L.extra, sd * 0.06, 0.96, 0));
      }
      break;
    }
    case 'roundears': {
      // Round mouse ears with pink insides, and a long thin tail.
      for (const sd of [-1, 1]) {
        const e = mesh(new THREE.SphereGeometry(0.085, 10, 8), head, sd * 0.13, 0.78, 0); e.scale.set(1, 1, 0.4); add(e);
        const i = mesh(new THREE.SphereGeometry(0.055, 8, 6), '#f2a7b8', sd * 0.13, 0.78, 0.025); i.scale.set(1, 1, 0.3); add(i);
      }
      const tail = mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.4, 5), '#f2a7b8', 0.12, 0.14, -0.24); tail.rotation.set(-1.1, 0, -0.6); add(tail);
      break;
    }
    case 'starmark': {
      // Cat ears and a little gold star on the forehead.
      add(mesh(new THREE.ConeGeometry(0.06, 0.16, 4), head, -0.1, 0.8, 0), mesh(new THREE.ConeGeometry(0.06, 0.16, 4), head, 0.1, 0.8, 0));
      const star = mesh(new THREE.OctahedronGeometry(0.05, 0), '#ffd84a', 0, 0.71, 0.16, { emissive: '#7a5a00' }); star.scale.set(1, 1, 0.4); add(star);
      const tail = mesh(new THREE.ConeGeometry(0.06, 0.36, 5), body, 0.08, 0.2, -0.24); tail.rotation.x = -1.1; add(tail);
      break;
    }
    case 'dragon': {
      // Little horns, wings on the back, a lighter belly and a tail.
      for (const sd of [-1, 1]) { const h = mesh(new THREE.ConeGeometry(0.035, 0.14, 5), '#f6ead0', sd * 0.08, 0.82, -0.02); h.rotation.z = -sd * 0.3; add(h); }
      for (const sd of [-1, 1]) { const wg = mesh(new THREE.CircleGeometry(0.16, 6), L.extra ?? '#f2c14a', sd * 0.2, 0.42, -0.14); wg.scale.set(1.2, 0.9, 1); wg.rotation.set(0, sd * 0.8, sd * 0.3); (wg.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide; add(wg); }
      const belly = mesh(new THREE.SphereGeometry(0.14, seg(8), seg(6)), '#f6dca0', 0, 0.22, 0.1); belly.scale.set(0.9, 1.1, 0.5); add(belly);
      const tail = mesh(new THREE.ConeGeometry(0.07, 0.34, 5), body, 0, 0.14, -0.26); tail.rotation.x = -1.2; add(tail);
      break;
    }
    case 'cloud': case 'none': case undefined: break;
  } };
  accessory(L.acc);
  if (L.acc2 && L.acc2 !== L.acc) accessory(L.acc2);
  fig.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  if (style === 'doll') outline(fig);
  if (!raw && style === 'voxel') voxelise(fig, `${def.id}|${faces}`);
  if (!raw && spriteStyle() && spriteFor) {
    // A camera-facing sprite instead of the figure (mirrored for the other side, so they face each other).
    fig.clear();
    const sticker = style === 'sticker' || style === 'art';
    const tex = spriteFor(def, faces);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: sticker ? 0.08 : 0.5 }));
    // Dishes are wide: draw them smaller so they stay inside their square.
    const dish = !!L.shape && L.shape !== 'figure' && !CREATURES.includes(L.shape);
    const k = (dish ? 0.8 : 1.15) * (sticker ? 1.08 : 1);
    sp.scale.set(enemy ? -k : k, k, 1);
    sp.position.y = k * 0.45;
    // A sticker knows where its feet are in the picture: stand them on the token.
    if (typeof tex.userData.foot === 'number') { sp.center.set(0.5, tex.userData.foot); sp.position.y = 0.01; }
    fig.add(sp);
    // A soft round shadow, since sprites cast none.
    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.34, 24), new THREE.MeshBasicMaterial({ color: '#1a1410', transparent: true, opacity: 0.32, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.012; fig.add(blob);
  }

  // A bubble for shields, little stars for a stun: shown when needed.
  const shield = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), new THREE.MeshBasicMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.28, depthWrite: false }));
  shield.position.y = 0.36; shield.visible = false;
  root.add(shield);
  const stun = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), new THREE.MeshBasicMaterial({ color: '#ffd84a' }));
    st.position.set(Math.cos((k / 3) * Math.PI * 2) * 0.22, 0, Math.sin((k / 3) * Math.PI * 2) * 0.22);
    stun.add(st);
  }
  stun.position.y = 1.0 * s; stun.visible = false;
  root.add(stun);
  return { root, figure: fig, base, shield, stun, ring, glow };
}

/* ------------------------------------------------------------ shapes */

/** Cartoon eyes (white with a dark pupil), for food and other non-figure pieces. */
function eyes(fig: THREE.Group, y: number, z: number, spread = 0.07, r = 0.035) {
  if (!faces) return;
  // Creatures get the big shiny eyes and rosy cheeks of the figures.
  if (creatureShape) { faceOn(fig, 0, y, z + r * 0.4, spread, r * 1.15, true); return; }
  if (eyeLog) { eyeLog.push({ x: 0, y, z: z + r, spread, cute: false }); return; }
  for (const sd of [-1, 1]) {
    fig.add(mesh(new THREE.SphereGeometry(r, 8, 6), '#ffffff', sd * spread, y, z));
    fig.add(mesh(new THREE.SphereGeometry(r * 0.55, 6, 4), '#1b1b1f', sd * spread, y, z + r * 0.6));
  }
}

/** A plate under a dish. */
function plate(fig: THREE.Group, r: number, color: string) {
  fig.add(mesh(new THREE.CylinderGeometry(r, r * 0.8, 0.04, seg(20)), color, 0, 0.02, 0, { rough: 0.3 }));
}

/** A face on a figure's head: eyes (big and shiny for the doll style) and, for dolls, rosy cheeks. */
function faceOn(fig: THREE.Group, x: number, y: number, z: number, spread: number, r: number, cute = false) {
  if (eyeLog) { eyeLog.push({ x, y, z, spread, cute }); return; }
  for (const sd of [-1, 1]) {
    const e = mesh(new THREE.SphereGeometry(r, 10, 8), '#1b1b1f', x + sd * spread, y, z);
    e.scale.set(cute ? 0.85 : 1, cute ? 1.15 : 1, 0.6); e.userData.noOutline = true; fig.add(e);
    if (cute) {
      const hl = mesh(new THREE.SphereGeometry(r * 0.35, 6, 4), '#ffffff', x + sd * spread + r * 0.3, y + r * 0.4, z + r * 0.5, { emissive: '#888888' }); hl.userData.noOutline = true; fig.add(hl);
      const ck = mesh(new THREE.SphereGeometry(r * 0.8, 8, 6), '#f2a0a0', x + sd * spread * 1.55, y - r * 1.5, z - 0.02); ck.scale.set(1, 0.6, 0.4); ck.userData.noOutline = true; fig.add(ck);
    }
  }
}

function shapeBody(fig: THREE.Group, L: Look) {
  const body = L.body, head = L.head;
  creatureShape = CREATURES.includes(L.shape ?? '');
  const add = (...o: THREE.Object3D[]) => fig.add(...o);
  switch (L.shape) {
    case 'bowl': {
      // A 뚝배기 with the stew in it.
      add(mesh(new THREE.CylinderGeometry(0.34, 0.24, 0.3, 14), body, 0, 0.15, 0));
      add(mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.03, 14), head, 0, 0.3, 0, { rough: 0.3 }));
      if (L.extra === 'chicken') { add(mesh(new THREE.SphereGeometry(0.16, 8, 6), '#f4ead2', 0, 0.36, 0), mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.2, 5), '#d9c08a', 0.12, 0.42, -0.05)); }
      else for (let k = 0; k < 4; k++) add(mesh(new THREE.BoxGeometry(0.07, 0.04, 0.07), ['#f4f1e8', '#4f8f3a', '#f4f1e8', '#c8352a'][k], Math.cos(k * 1.7) * 0.15, 0.33, Math.sin(k * 1.7) * 0.15));
      eyes(fig, 0.17, 0.3, 0.09);
      break;
    }
    case 'rods': {
      // 떡볶이: rice cakes and a fish-cake triangle in red sauce on a shallow plate.
      plate(fig, 0.36, '#f4f1ea');
      const sauce = mesh(new THREE.SphereGeometry(0.3, seg(12), seg(6), 0, Math.PI * 2, 0, Math.PI / 2), body, 0, 0.06, 0, { rough: 0.3 }); sauce.scale.set(1, 0.28, 1); add(sauce);
      for (let k = 0; k < 6; k++) {
        const r = mesh(new THREE.CapsuleGeometry(0.045, 0.16, 3, seg(8)), head, Math.cos(k * 1.1) * 0.15, 0.13 + (k % 3) * 0.04, Math.sin(k * 1.1) * 0.12);
        r.rotation.set(Math.PI / 2, 0, k * 0.9); add(r);
      }
      const fc = mesh(new THREE.ConeGeometry(0.1, 0.03, 3), '#e8c27a', 0.05, 0.22, 0.04); fc.rotation.set(0.3, 0.4, 0); add(fc);
      for (let k = 0; k < 4; k++) add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.06, 6), '#4f9a3a', Math.cos(k * 2) * 0.1, 0.23, Math.sin(k * 2) * 0.1));
      eyes(fig, 0.27, 0.22, 0.08);
      break;
    }
    case 'roll': {
      // 김밥: three slices standing in a row, cut faces to the front.
      plate(fig, 0.36, '#f4f1ea');
      for (let k = 0; k < 3; k++) {
        const g = new THREE.Group(); g.position.set((k - 1) * 0.2, 0.16, (k === 1 ? 0.04 : 0)); g.rotation.y = (k - 1) * -0.25;
        const nori = mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.1, seg(14)), body); nori.rotation.x = Math.PI / 2; g.add(nori);
        const rice = mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.102, seg(14)), head); rice.rotation.x = Math.PI / 2; g.add(rice);
        for (const [c, x, y] of [['#f2d04a', 0.03, 0.02], ['#4f8f3a', -0.03, 0.02], ['#e0703a', 0, -0.035], ['#c8352a', 0.035, -0.03]] as [string, number, number][]) g.add(mesh(new THREE.BoxGeometry(0.035, 0.035, 0.104), c, x, y, 0));
        add(g);
      }
      eyes(fig, 0.2, 0.24, 0.08);
      break;
    }
    case 'disc': {
      // A pancake on a plate, golden at the edge.
      plate(fig, 0.4, '#f4f1ea');
      add(mesh(new THREE.CylinderGeometry(0.31, 0.33, 0.08, seg(18)), body, 0, 0.09, 0));
      add(mesh(new THREE.TorusGeometry(0.31, 0.025, 5, seg(18)), '#b8742a', 0, 0.12, 0)).children.at(-1)!.rotation.set(Math.PI / 2, 0, 0);
      for (let k = 0; k < 7; k++) { const t = mesh(new THREE.BoxGeometry(0.05, 0.025, 0.14), head, Math.cos(k * 0.9) * 0.17, 0.14, Math.sin(k * 2.1) * 0.17); t.rotation.y = k; add(t); }
      eyes(fig, 0.16, 0.2, 0.09, 0.045);
      break;
    }
    case 'pan': {
      // 닭갈비 on a round iron pan: red chicken, cabbage, rice cakes.
      add(mesh(new THREE.CylinderGeometry(0.38, 0.34, 0.08, seg(18)), '#2b2b2e', 0, 0.04, 0, { rough: 0.5 }));
      add(mesh(new THREE.TorusGeometry(0.37, 0.03, 5, seg(18)), '#3a3a3e', 0, 0.09, 0)).children.at(-1)!.rotation.set(Math.PI / 2, 0, 0);
      for (const sd of [-1, 1]) add(mesh(new THREE.BoxGeometry(0.12, 0.03, 0.05), '#2b2b2e', sd * 0.44, 0.08, 0));
      for (let k = 0; k < 9; k++) { const c = mesh(new THREE.DodecahedronGeometry(0.065, 0), k % 3 === 2 ? '#7fb04a' : body, Math.cos(k * 1.7) * 0.2, 0.13 + (k % 2) * 0.03, Math.sin(k * 1.7) * 0.2); c.rotation.set(k, k * 2, 0); add(c); }
      for (let k = 0; k < 3; k++) { const r = mesh(new THREE.CapsuleGeometry(0.035, 0.12, 3, seg(6)), head, (k - 1) * 0.12, 0.16, 0.05); r.rotation.z = Math.PI / 2; add(r); }
      eyes(fig, 0.24, 0.2, 0.08);
      break;
    }
    case 'fish': {
      const b = mesh(new THREE.SphereGeometry(0.2, 10, 8), body, 0, 0.2, 0); b.scale.set(0.8, 0.9, 1.7); add(b);
      const belly = mesh(new THREE.SphereGeometry(0.19, 10, 8), head, 0, 0.15, 0.02); belly.scale.set(0.75, 0.6, 1.55); add(belly);
      const tail = mesh(new THREE.ConeGeometry(0.14, 0.22, 4), body, 0, 0.22, -0.38); tail.rotation.x = Math.PI / 2; tail.scale.x = 0.3; add(tail);
      eyes(fig, 0.27, 0.22, 0.1);
      break;
    }
    case 'crab': {
      const sh = mesh(new THREE.SphereGeometry(0.26, 10, 6), body, 0, 0.18, 0); sh.scale.set(1.2, 0.55, 1); add(sh);
      for (const sd of [-1, 1]) {
        for (let k = 0; k < 3; k++) { const lg = mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.24, 4), body, sd * 0.3, 0.1, (k - 1) * 0.12); lg.rotation.z = sd * 1.1; add(lg); }
        add(mesh(new THREE.SphereGeometry(0.09, 7, 5), head, sd * 0.24, 0.24, 0.24));
        add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 4), body, sd * 0.07, 0.32, 0.12));
      }
      eyes(fig, 0.39, 0.13, 0.07, 0.035);
      break;
    }
    case 'cabbage': {
      // 김치 on a plate: leaves folded in a mound, white at the stem and red with seasoning.
      plate(fig, 0.36, '#f4f1ea');
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const lf = mesh(new THREE.SphereGeometry(0.14, seg(8), seg(6)), k % 2 ? head : body, Math.cos(a) * 0.13, 0.12 + (k % 3) * 0.03, Math.sin(a) * 0.13);
        lf.scale.set(1.4, 0.55, 0.75); lf.rotation.y = -a; add(lf);
      }
      add(mesh(new THREE.SphereGeometry(0.15, seg(10), seg(8)), body, 0, 0.22, 0)).children.at(-1)!.scale.set(1.2, 0.8, 1.2);
      for (let k = 0; k < 5; k++) add(mesh(new THREE.BoxGeometry(0.03, 0.02, 0.03), '#7a1a12', Math.cos(k * 2.3) * 0.1, 0.32, Math.sin(k * 2.3) * 0.1));
      eyes(fig, 0.3, 0.26, 0.08);
      break;
    }
    case 'skewer': {
      add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.95, 4), '#c9a46a', 0, 0.48, 0));
      for (let k = 0; k < 3; k++) { const p = mesh(new THREE.BoxGeometry(0.42, 0.2, 0.08), body, (k % 2 ? 0.06 : -0.06), 0.2 + k * 0.22, 0); p.rotation.z = k % 2 ? 0.2 : -0.2; add(p); }
      eyes(fig, 0.62, 0.06, 0.06);
      break;
    }
    case 'bird': {
      const b = mesh(new THREE.SphereGeometry(0.22, 10, 8), body, 0, 0.3, 0); b.scale.set(0.9, 0.9, 1.15); add(b);
      add(mesh(new THREE.SphereGeometry(0.14, 8, 6), body, 0, 0.56, 0.12));
      const beak = mesh(new THREE.ConeGeometry(0.05, 0.14, 5), head, 0, 0.55, 0.3); beak.rotation.x = Math.PI / 2; add(beak);
      for (const sd of [-1, 1]) { const wg = mesh(new THREE.BoxGeometry(0.05, 0.16, 0.3), body, sd * 0.22, 0.34, -0.04); wg.rotation.z = sd * 0.3; add(wg); }
      const legs = L.acc === 'sun' ? [-0.07, 0, 0.07] : [-0.06, 0.06];
      for (const x of legs) add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.14, 4), '#d9a43a', x, 0.07, 0));
      eyes(fig, 0.6, 0.23, 0.06, 0.03);
      break;
    }
    case 'pot': {
      // 신선로: a ring pot round a chimney.
      const ringPot = mesh(new THREE.TorusGeometry(0.24, 0.1, 8, 18), body, 0, 0.18, 0, { rough: 0.35 }); ringPot.rotation.x = Math.PI / 2; add(ringPot);
      add(mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.08, 16), body, 0, 0.06, 0, { rough: 0.35 }));
      add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.42, 8), body, 0, 0.36, 0, { rough: 0.35 }));
      for (let k = 0; k < 6; k++) add(mesh(new THREE.BoxGeometry(0.07, 0.04, 0.07), [head, '#f2d04a', '#4f8f3a'][k % 3], Math.cos(k) * 0.24, 0.27, Math.sin(k) * 0.24));
      eyes(fig, 0.3, 0.12, 0.05, 0.03);
      break;
    }
    case 'snowman': {
      add(mesh(new THREE.SphereGeometry(0.24, 10, 8), body, 0, 0.22, 0), mesh(new THREE.SphereGeometry(0.17, 10, 8), head, 0, 0.55, 0));
      const nose = mesh(new THREE.ConeGeometry(0.03, 0.14, 5), '#e0703a', 0, 0.55, 0.2); nose.rotation.x = Math.PI / 2; add(nose);
      add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.16, 10), '#2a2a2e', 0, 0.76, 0), mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 12), '#2a2a2e', 0, 0.69, 0));
      add(mesh(new THREE.TorusGeometry(0.15, 0.035, 5, 12), '#c8352a', 0, 0.42, 0)).children.at(-1)!.rotation.set(Math.PI / 2, 0, 0);
      eyes(fig, 0.6, 0.14, 0.06, 0.025);
      break;
    }
    case 'drop': {
      // A water drop: round below, drawn up to a point.
      add(mesh(new THREE.SphereGeometry(0.25, seg(12), seg(10)), body, 0, 0.26, 0));
      add(mesh(new THREE.ConeGeometry(0.205, 0.32, seg(12)), body, 0, 0.6, 0));
      add(mesh(new THREE.SphereGeometry(0.05, 6, 4), '#ffffff', -0.1, 0.4, 0.18));
      eyes(fig, 0.3, 0.2, 0.08, 0.04);
      break;
    }
    case 'pebble': {
      // A round river stone with a face, a few flecks.
      const b = mesh(new THREE.DodecahedronGeometry(0.28, 1), body, 0, 0.24, 0); b.scale.set(1.15, 0.85, 1); add(b);
      for (let k = 0; k < 3; k++) add(mesh(new THREE.SphereGeometry(0.03, 5, 4), head, Math.cos(k * 2.1) * 0.2, 0.32 + (k % 2) * 0.06, 0.14 + Math.sin(k * 2.1) * 0.05));
      eyes(fig, 0.27, 0.25, 0.09, 0.04);
      break;
    }
    case 'jelly': {
      // A jellyfish: a glowing bell, and tentacles trailing under it.
      const bell = mesh(new THREE.SphereGeometry(0.28, seg(12), seg(8), 0, Math.PI * 2, 0, Math.PI / 2), body, 0, 0.42, 0, { emissive: '#2a1a3a' }); bell.scale.set(1, 1.1, 1); add(bell);
      add(mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.05, seg(12)), head, 0, 0.42, 0));
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const t = mesh(new THREE.CylinderGeometry(0.018, 0.01, 0.34, 4), L.extra ?? head, Math.cos(a) * 0.17, 0.24, Math.sin(a) * 0.17); t.rotation.z = Math.cos(a * 3) * 0.25; add(t);
      }
      eyes(fig, 0.52, 0.24, 0.09, 0.04);
      break;
    }
    case 'cloud': {
      for (const [x, y, z, r] of [[0, 0.42, 0, 0.2], [-0.18, 0.36, 0, 0.15], [0.18, 0.36, 0, 0.15], [0, 0.34, -0.12, 0.15]] as number[][]) add(mesh(new THREE.IcosahedronGeometry(r, 1), body, x, y, z));
      for (let k = 0; k < 4; k++) add(mesh(new THREE.ConeGeometry(0.025, 0.08, 5), '#5a9ad9', (k - 1.5) * 0.1, 0.12 + (k % 2) * 0.06, 0.05));
      eyes(fig, 0.44, 0.18, 0.07);
      break;
    }
    case 'twister': {
      // A solid funnel inside the rings, so it reads as one whirl.
      add(mesh(new THREE.CylinderGeometry(0.24, 0.05, 0.62, seg(10)), head, 0, 0.36, 0));
      for (let k = 0; k < 5; k++) { const t = mesh(new THREE.TorusGeometry(0.06 + k * 0.05, 0.035, 5, 14), k % 2 ? body : head, Math.sin(k) * 0.03, 0.08 + k * 0.13, 0); t.rotation.x = Math.PI / 2; add(t); }
      eyes(fig, 0.5, 0.18, 0.07);
      break;
    }
  }
}

/* ---------------------------------------------------------------- 복셀 */

/** A solid we can test points against: its inverse transform (figure space -> its own) and an inside test. */
interface Solid { inv: THREE.Matrix4; inside: (p: THREE.Vector3) => boolean; color: THREE.Color; vol: number }

function solidOf(m: THREE.Mesh, toFig: THREE.Matrix4): Solid | null {
  const g = m.geometry as THREE.BufferGeometry & { parameters: Record<string, number> };
  const P = g.parameters ?? {};
  const color = ((m.material as THREE.MeshStandardMaterial).color ?? new THREE.Color('#888')).clone();
  const inv = toFig.clone().invert();
  const sc = new THREE.Vector3(); toFig.decompose(new THREE.Vector3(), new THREE.Quaternion(), sc);
  const k = sc.x * sc.y * sc.z;
  switch (g.type) {
    case 'SphereGeometry': {
      const r = P.radius, half = (P.thetaLength ?? Math.PI) < Math.PI * 0.9;
      return { inv, color, vol: r ** 3 * k, inside: (p) => p.lengthSq() <= r * r && (!half || p.y >= -0.005) };
    }
    case 'IcosahedronGeometry': case 'DodecahedronGeometry': case 'OctahedronGeometry': {
      const r = P.radius * (g.type === 'OctahedronGeometry' ? 0.7 : 0.9);
      return { inv, color, vol: r ** 3 * k, inside: (p) => p.lengthSq() <= r * r };
    }
    case 'CylinderGeometry': case 'ConeGeometry': {
      const rt = g.type === 'ConeGeometry' ? 0 : P.radiusTop, rb = g.type === 'ConeGeometry' ? P.radius : P.radiusBottom, h = Math.max(P.height, 0.03);
      return { inv, color, vol: Math.max(rt, rb) ** 2 * h * k, inside: (p) => Math.abs(p.y) <= h / 2 && Math.hypot(p.x, p.z) <= rb + (rt - rb) * ((p.y + h / 2) / h) + 0.004 };
    }
    case 'CapsuleGeometry': {
      const r = P.radius, L = P.height ?? P.length ?? 0;
      return { inv, color, vol: r * r * (L + r) * k, inside: (p) => Math.hypot(p.x, Math.max(0, Math.abs(p.y) - L / 2), p.z) <= r };
    }
    case 'BoxGeometry': {
      const w = Math.max(P.width, 0.03) / 2, h = Math.max(P.height, 0.03) / 2, d = Math.max(P.depth, 0.03) / 2;
      return { inv, color, vol: w * h * d * 8 * k, inside: (p) => Math.abs(p.x) <= w && Math.abs(p.y) <= h && Math.abs(p.z) <= d };
    }
    case 'TorusGeometry': {
      const R = P.radius, t = Math.max(P.tube, 0.025);
      return { inv, color, vol: R * t * t * 6 * k, inside: (p) => (Math.hypot(p.x, p.y) - R) ** 2 + p.z * p.z <= t * t };
    }
    case 'CircleGeometry': {
      const r = P.radius;
      return { inv, color, vol: r * r * 0.03 * k, inside: (p) => Math.abs(p.z) <= 0.03 && p.x * p.x + p.y * p.y <= r * r };
    }
    default: return null;
  }
}

const voxelCache = new Map<string, { pos: Float32Array; col: Float32Array; n: number; step: number }>();

/** Replace a figure's primitives with little cubes, the way a voxel editor would draw it. */
function voxelise(fig: THREE.Group, key: string) {
  const step = 0.042;
  let data = voxelCache.get(key);
  if (!data) {
    fig.updateMatrixWorld(true);
    const figInv = fig.matrixWorld.clone().invert();
    const solids: Solid[] = [];
    const box = new THREE.Box3();
    fig.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.userData.hull) return;
      const toFig = figInv.clone().multiply(m.matrixWorld);
      const sd = solidOf(m, toFig);
      if (!sd) return;
      solids.push(sd);
      m.geometry.computeBoundingBox();
      box.union(m.geometry.boundingBox!.clone().applyMatrix4(toFig));
    });
    // Small things (eyes, horns) win over the big shapes they sit on.
    solids.sort((a, b) => a.vol - b.vol);
    const pos: number[] = [], col: number[] = [];
    const nx = Math.ceil((box.max.x - box.min.x) / step) + 1, ny = Math.ceil((box.max.y - box.min.y) / step) + 1, nz = Math.ceil((box.max.z - box.min.z) / step) + 1;
    const grid = new Int32Array(nx * ny * nz).fill(-1);
    const p = new THREE.Vector3(), q = new THREE.Vector3();
    for (let iy = 0; iy < ny; iy++) for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      p.set(box.min.x + ix * step, box.min.y + iy * step, box.min.z + iz * step);
      for (let k = 0; k < solids.length; k++) { q.copy(p).applyMatrix4(solids[k].inv); if (solids[k].inside(q)) { grid[(iy * nz + iz) * nx + ix] = k; break; } }
    }
    // Only the cubes you can see: those with an empty neighbour.
    const at = (x: number, y: number, z: number) => (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz ? -1 : grid[(y * nz + z) * nx + x]);
    for (let iy = 0; iy < ny; iy++) for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
      const k = at(ix, iy, iz);
      if (k < 0) continue;
      if (at(ix + 1, iy, iz) >= 0 && at(ix - 1, iy, iz) >= 0 && at(ix, iy + 1, iz) >= 0 && at(ix, iy - 1, iz) >= 0 && at(ix, iy, iz + 1) >= 0 && at(ix, iy, iz - 1) >= 0) continue;
      pos.push(box.min.x + ix * step, box.min.y + iy * step, box.min.z + iz * step);
      // A touch of variation per cube, like hand-placed voxels.
      const c = solids[k].color, j = 1 + (((ix * 7 + iy * 13 + iz * 5) % 5) - 2) * 0.018;
      col.push(c.r * j, c.g * j, c.b * j);
    }
    data = { pos: new Float32Array(pos), col: new Float32Array(col), n: pos.length / 3, step };
    voxelCache.set(key, data);
  }
  fig.clear();
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(data.step, data.step, data.step), new THREE.MeshStandardMaterial({ roughness: 0.85 }), data.n);
  const m4 = new THREE.Matrix4(), c = new THREE.Color();
  for (let i = 0; i < data.n; i++) {
    inst.setMatrixAt(i, m4.makeTranslation(data.pos[i * 3], data.pos[i * 3 + 1], data.pos[i * 3 + 2]));
    inst.setColorAt(i, c.setRGB(data.col[i * 3], data.col[i * 3 + 1], data.col[i * 3 + 2]));
  }
  inst.castShadow = true;
  fig.add(inst);
}
