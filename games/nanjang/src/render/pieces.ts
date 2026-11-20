import * as THREE from 'three';
import type { Look, UnitDef } from '../sim/units';

/**
 * Low-poly figures for the pieces: a disc in the colour of the cost tier,
 * a body, a head, and the one thing that tells you who it is (a horn, nine
 * tails, a 갓, a shell...). Built from a handful of primitives, flat-shaded.
 */

export const TIER_COLOR = ['#888', '#9aa3ab', '#4f9d69', '#3f7cc4', '#9b59b6', '#e2a822'];

const mats = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, opts: { emissive?: string; rough?: number } = {}): THREE.MeshStandardMaterial {
  const k = `${color}|${opts.emissive ?? ''}|${opts.rough ?? 0.75}`;
  let m = mats.get(k);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: opts.rough ?? 0.75, emissive: opts.emissive ?? '#000000' }); mats.set(k, m); }
  return m;
}

function mesh(g: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0, opts?: { emissive?: string; rough?: number }) {
  const m = new THREE.Mesh(g, mat(color, opts));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export interface PieceObj { root: THREE.Group; figure: THREE.Group; base: THREE.Mesh; shield: THREE.Mesh; stun: THREE.Group; ring: THREE.Mesh }

export function buildPiece(def: UnitDef, star: number, enemy = false): PieceObj {
  const root = new THREE.Group();
  const L = def.look;
  const base = mesh(new THREE.CylinderGeometry(0.4, 0.44, 0.1, 18), TIER_COLOR[def.tier] ?? '#777', 0, 0.05, 0, { rough: 0.5 });
  base.receiveShadow = true;
  root.add(base);
  // A thin ring round the base: red for the other side.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.035, 6, 24), new THREE.MeshBasicMaterial({ color: enemy ? '#d94a3a' : '#f4efe2' }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.1;
  root.add(ring);

  const fig = new THREE.Group();
  const s = 1.2 * (L.size ?? 1) * (star === 3 ? 1.22 : star === 2 ? 1.1 : 1);
  fig.scale.setScalar(s);
  fig.position.y = 0.1;
  root.add(fig);
  const body = L.body, head = L.head;
  const serpent = L.acc === 'serpent';
  if (L.shape && L.shape !== 'figure') shapeBody(fig, L);
  else if (serpent) {
    // A coiled body instead of a standing one.
    const coil = mesh(new THREE.TorusGeometry(0.22, 0.1, 6, 14), body, 0, 0.12, 0);
    coil.rotation.x = Math.PI / 2;
    fig.add(coil, mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.45, 7), body, 0.05, 0.38, 0));
    fig.add(mesh(new THREE.DodecahedronGeometry(0.15, 0), head, 0.08, 0.66, 0.06));
    fig.add(mesh(new THREE.ConeGeometry(0.04, 0.16, 4), '#e8d9a8', 0.0, 0.8, 0.02), mesh(new THREE.ConeGeometry(0.04, 0.16, 4), '#e8d9a8', 0.16, 0.8, 0.02));
  } else {
    const wide = L.acc === 'shell' || L.acc === 'spikes' || L.acc === 'mane';
    fig.add(mesh(new THREE.CylinderGeometry(wide ? 0.22 : 0.16, wide ? 0.3 : 0.24, 0.48, 7), body, 0, 0.24, 0));
    fig.add(mesh(new THREE.IcosahedronGeometry(wide ? 0.2 : 0.17, 0), head, 0, 0.62, 0));
    // Eyes, so they face somewhere.
    const eye = new THREE.SphereGeometry(0.025, 5, 4);
    if (L.acc !== 'eye') fig.add(mesh(eye, '#1b1b1f', -0.06, 0.65, 0.15), mesh(eye, '#1b1b1f', 0.06, 0.65, 0.15));
  }
  const add = (...o: THREE.Object3D[]) => fig.add(...o);
  switch (L.acc) {
    case 'horn': add(mesh(new THREE.ConeGeometry(0.05, 0.2, 5), '#f2e3b3', 0, 0.85, 0)); break;
    case 'horns': {
      const h1 = mesh(new THREE.ConeGeometry(0.05, 0.22, 5), '#f2e3b3', -0.1, 0.82, 0), h2 = mesh(new THREE.ConeGeometry(0.05, 0.22, 5), '#f2e3b3', 0.1, 0.82, 0);
      h1.rotation.z = 0.35; h2.rotation.z = -0.35;
      add(h1, h2, mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.5, 5), '#6b4b2a', 0.28, 0.35, 0.05));
      break;
    }
    case 'eye': add(mesh(new THREE.SphereGeometry(0.07, 8, 6), '#fffbe8', 0, 0.66, 0.13), mesh(new THREE.SphereGeometry(0.035, 6, 4), '#1b1b1f', 0, 0.66, 0.19), mesh(new THREE.ConeGeometry(0.04, 0.14, 5), '#f2e3b3', 0, 0.84, 0)); break;
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
      add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 16), '#1a1a1d', 0, 0.76, 0), mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.16, 10), '#1a1a1d', 0, 0.85, 0));
      break;
    }
    case 'hat': add(mesh(new THREE.ConeGeometry(0.2, 0.28, 8), '#8a5a2b', 0, 0.88, 0)); break;
    case 'hood': add(mesh(new THREE.ConeGeometry(0.24, 0.5, 7), body, 0, 0.72, -0.04)); break;
    case 'shell': {
      const sh = mesh(new THREE.SphereGeometry(0.3, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), '#3e6b3e', 0, 0.2, -0.08);
      sh.scale.set(1, 0.8, 1); add(sh);
      break;
    }
    case 'fins': {
      const f1 = mesh(new THREE.ConeGeometry(0.08, 0.25, 3), '#f2b880', -0.22, 0.32, 0), f2 = mesh(new THREE.ConeGeometry(0.08, 0.25, 3), '#f2b880', 0.22, 0.32, 0);
      f1.rotation.z = 1.2; f2.rotation.z = -1.2;
      add(f1, f2, mesh(new THREE.ConeGeometry(0.07, 0.2, 3), '#c96f1d', 0, 0.84, -0.03));
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
    case 'crown': add(mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.12, 6), '#d9b44a', 0, 0.82, 0, { rough: 0.4 }), mesh(new THREE.TorusGeometry(0.26, 0.03, 5, 16), '#8fb4d9', 0, 0.42, 0)).children.at(-1)!.rotation.set(Math.PI / 2, 0, 0); break;
    case 'whiskers': add(mesh(new THREE.ConeGeometry(0.1, 0.32, 6), '#ffffff', 0, 0.42, 0.14), mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.95, 5), '#7a5a3a', 0.26, 0.45, 0.05), mesh(new THREE.ConeGeometry(0.06, 0.2, 5), '#e9e3d3', 0, 0.84, 0)); break;
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
    case 'cloud': case 'none': case undefined: break;
  }
  fig.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });

  // A bubble for shields, little stars for a stun: shown when needed.
  const shield = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), new THREE.MeshBasicMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.28, depthWrite: false }));
  shield.position.y = 0.45; shield.visible = false;
  root.add(shield);
  const stun = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), new THREE.MeshBasicMaterial({ color: '#ffd84a' }));
    st.position.set(Math.cos((k / 3) * Math.PI * 2) * 0.22, 0, Math.sin((k / 3) * Math.PI * 2) * 0.22);
    stun.add(st);
  }
  stun.position.y = 1.05 * s; stun.visible = false;
  root.add(stun);
  return { root, figure: fig, base, shield, stun, ring };
}

/* ------------------------------------------------------------ shapes */

/** Cartoon eyes (white with a dark pupil), for food and other non-figure pieces. */
function eyes(fig: THREE.Group, y: number, z: number, spread = 0.07, r = 0.035) {
  for (const sd of [-1, 1]) {
    fig.add(mesh(new THREE.SphereGeometry(r, 8, 6), '#ffffff', sd * spread, y, z));
    fig.add(mesh(new THREE.SphereGeometry(r * 0.55, 6, 4), '#1b1b1f', sd * spread, y, z + r * 0.6));
  }
}

function shapeBody(fig: THREE.Group, L: Look) {
  const body = L.body, head = L.head;
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
      for (let k = 0; k < 3; k++) { const r = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.5, 8), head, (k - 1) * 0.15, 0.12 + (k === 1 ? 0.12 : 0), 0); r.rotation.x = Math.PI / 2; add(r); }
      // The sauce over them.
      const sauce = mesh(new THREE.SphereGeometry(0.24, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), body, 0, 0.12, 0, { rough: 0.35 });
      sauce.scale.set(1.3, 0.8, 1.2); add(sauce);
      eyes(fig, 0.27, 0.22, 0.08);
      break;
    }
    case 'roll': {
      const r = mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.36, 14), body, 0, 0.18, 0); add(r);
      add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 14), head, 0, 0.365, 0));
      for (const [c, x, z] of [['#f2d04a', 0.07, 0], ['#4f8f3a', -0.07, 0.04], ['#e0703a', 0, -0.08], ['#c8352a', -0.04, -0.03]] as [string, number, number][]) add(mesh(new THREE.BoxGeometry(0.06, 0.03, 0.06), c, x, 0.38, z));
      eyes(fig, 0.2, 0.24, 0.08);
      break;
    }
    case 'disc': {
      add(mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.1, 16), body, 0, 0.06, 0));
      for (let k = 0; k < 6; k++) add(mesh(new THREE.BoxGeometry(0.06, 0.03, 0.12), head, Math.cos(k) * 0.18, 0.12, Math.sin(k * 2.1) * 0.18));
      eyes(fig, 0.16, 0.2, 0.09, 0.045);
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
      add(mesh(new THREE.IcosahedronGeometry(0.24, 0), head, 0, 0.22, 0));
      for (let k = 0; k < 5; k++) { const lf = mesh(new THREE.SphereGeometry(0.17, 7, 5), body, Math.cos(k * 1.25) * 0.14, 0.2 + (k % 2) * 0.08, Math.sin(k * 1.25) * 0.14); lf.scale.set(1, 1.3, 0.5); lf.lookAt(0, 0.2, 0); add(lf); }
      eyes(fig, 0.3, 0.26, 0.08);
      break;
    }
    case 'skewer': {
      add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.95, 4), '#c9a46a', 0, 0.48, 0));
      for (let k = 0; k < 3; k++) { const p = mesh(new THREE.BoxGeometry(0.3, 0.16, 0.08), body, (k % 2 ? 0.05 : -0.05), 0.2 + k * 0.2, 0); p.rotation.z = k % 2 ? 0.2 : -0.2; add(p); }
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
    case 'cloud': {
      for (const [x, y, z, r] of [[0, 0.42, 0, 0.2], [-0.18, 0.36, 0, 0.15], [0.18, 0.36, 0, 0.15], [0, 0.34, -0.12, 0.15]] as number[][]) add(mesh(new THREE.IcosahedronGeometry(r, 1), body, x, y, z));
      for (let k = 0; k < 4; k++) add(mesh(new THREE.ConeGeometry(0.025, 0.08, 5), '#5a9ad9', (k - 1.5) * 0.1, 0.12 + (k % 2) * 0.06, 0.05));
      eyes(fig, 0.44, 0.18, 0.07);
      break;
    }
    case 'twister': {
      for (let k = 0; k < 5; k++) { const t = mesh(new THREE.TorusGeometry(0.06 + k * 0.05, 0.035, 5, 14), k % 2 ? body : head, Math.sin(k) * 0.03, 0.08 + k * 0.13, 0); t.rotation.x = Math.PI / 2; add(t); }
      eyes(fig, 0.5, 0.18, 0.07);
      break;
    }
  }
}
