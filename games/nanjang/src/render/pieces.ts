import * as THREE from 'three';
import type { UnitDef } from '../sim/units';

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
  if (serpent) {
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
