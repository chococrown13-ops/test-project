import * as THREE from 'three';
import { BY_ID } from '../sim/units';
import type { UnitDef } from '../sim/units';
import { beginEyeCapture, buildPiece, CREATURES, endEyeCapture, evolved, pieceStyle, setSpriteMaker } from './pieces';

/**
 * Little portraits of the pieces for the shop cards, the info card and the
 * collection: each piece drawn once on its own small canvas and kept as an
 * image, per style.
 */

const SIZE = 160;
let renderer: THREE.WebGLRenderer | null = null;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
const cache = new Map<string, string>();

function setup() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  scene.add(new THREE.HemisphereLight('#fff6e2', '#8a7a64', 1.5));
  const sun = new THREE.DirectionalLight('#fff1d6', 2.4);
  sun.position.set(-2, 4, 3);
  scene.add(sun);
}

/** A data-URL image of a piece's figure, three-quarter view, on a transparent ground. */
export function portrait(id: string, faces: boolean, star = 1): string {
  const key = `${pieceStyle()}|${faces}|${id}|${star}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (!renderer) setup();
  // An evolved form gets its own picture.
  const def = evolved(BY_ID[id], star);
  if (pieceStyle() === 'pixel') {
    // The pixel sprite itself, blown up with hard edges.
    const src = pixelCanvas(def, faces), big = document.createElement('canvas');
    big.width = big.height = SIZE;
    const g = big.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.drawImage(src, 0, 0, SIZE, SIZE);
    const url = big.toDataURL('image/png');
    cache.set(key, url);
    return url;
  }
  const obj = buildPiece(def, 1, false, faces);
  obj.base.visible = false; obj.ring.visible = false;
  // Frame the figure: its height decides how far back the camera stands.
  const box = new THREE.Box3().setFromObject(obj.figure);
  const size = box.getSize(new THREE.Vector3());
  const h = Math.max(0.45, size.y, size.x * 0.9), cy = (box.max.y + box.min.y) / 2;
  const d = h * 2.05 + 0.3;
  camera.position.set(d * 0.4, cy + d * 0.3, d * 0.86);
  camera.lookAt(0, cy - h * 0.04, 0);
  scene.add(obj.root);
  renderer!.render(scene, camera);
  const url = renderer!.domElement.toDataURL('image/png');
  scene.remove(obj.root);
  cache.set(key, url);
  return url;
}

/* ---------------------------------------------------------------- 도트 */

const PX = 44;
let pxRenderer: THREE.WebGLRenderer | null = null;
const pxCache = new Map<string, HTMLCanvasElement>();
const texCache = new Map<string, THREE.Texture>();

/**
 * A piece as pixel art: the figure drawn front-on at 44 x 44 with no smoothing, its colours stepped
 * down, stray single pixels cleared, the eyes painted in by hand (mirror-symmetric, with a glint),
 * and a one-pixel dark outline round the silhouette.
 */
function pixelCanvas(def: UnitDef, faces: boolean): HTMLCanvasElement {
  const key = `${def.id}|${faces}`;
  const hit = pxCache.get(key);
  if (hit) return hit;
  if (!renderer) setup();
  if (!pxRenderer) {
    const c = document.createElement('canvas'); c.width = c.height = PX;
    pxRenderer = new THREE.WebGLRenderer({ canvas: c, antialias: false, alpha: true, preserveDrawingBuffer: true });
    pxRenderer.setSize(PX, PX, false);
    pxRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  }
  beginEyeCapture();
  const obj = buildPiece(def, 1, false, faces, true);
  const marks = endEyeCapture();
  obj.base.visible = false; obj.ring.visible = false;
  // Dishes and other non-figures read best from higher up, and fish side-on.
  const shape = def.look.shape;
  const dish = !!shape && shape !== 'figure' && !CREATURES.includes(shape);
  if (shape === 'fish') obj.root.rotation.y = -Math.PI / 2;
  if (shape === 'crab') obj.root.rotation.y = -0.5;
  obj.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj.figure);
  const size = box.getSize(new THREE.Vector3());
  const h = Math.max(0.45, size.y, Math.max(size.x, size.z) * (dish ? 0.8 : 0.95)), cy = (box.max.y + box.min.y) / 2;
  const d = h * 1.95 + 0.25;
  // Straight on and a little from above, so faces come out even; dishes from well above.
  camera.position.set(0, cy + d * (dish ? 0.62 : 0.3), d * (dish ? 0.8 : 0.95));
  camera.lookAt(0, cy, 0);
  scene.add(obj.root);
  pxRenderer.render(scene, camera);
  obj.root.updateMatrixWorld(true);
  const eyesAt = marks.map((m) => {
    const proj = (x: number) => { const v = obj.figure.localToWorld(new THREE.Vector3(x, m.y, m.z)).project(camera); return { x: ((v.x + 1) / 2) * PX, y: ((1 - v.y) / 2) * PX }; };
    return { m, l: proj(m.x - m.spread), r: proj(m.x + m.spread) };
  });
  scene.remove(obj.root);

  const out = document.createElement('canvas'); out.width = out.height = PX;
  const g = out.getContext('2d')!;
  g.drawImage(pxRenderer.domElement, 0, 0);
  const img = g.getImageData(0, 0, PX, PX), a = img.data;
  const keep = new Uint8Array(PX * PX);
  for (let i = 0; i < PX * PX; i++) keep[i] = a[i * 4 + 3] > 110 ? 1 : 0;
  // Clear stray pixels (a lone pixel, or one hanging on by a single neighbour off a thin spike).
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < PX && y < PX && keep[y * PX + x] === 1;
  for (let pass = 0; pass < 2; pass++) for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) {
    if (!on(x, y)) continue;
    const n = (on(x - 1, y) ? 1 : 0) + (on(x + 1, y) ? 1 : 0) + (on(x, y - 1) ? 1 : 0) + (on(x, y + 1) ? 1 : 0);
    if (n === 0) keep[y * PX + x] = 0;
  }
  const set = (x: number, y: number, r: number, gg: number, b: number) => {
    if (x < 0 || y < 0 || x >= PX || y >= PX) return;
    const i = (y * PX + x) * 4; a[i] = r; a[i + 1] = gg; a[i + 2] = b; a[i + 3] = 255; keep[y * PX + x] = 1;
  };
  for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) {
    const i = (y * PX + x) * 4;
    if (keep[y * PX + x]) { for (let c = 0; c < 3; c++) a[i + c] = Math.min(255, Math.round(a[i + c] / 22) * 22); a[i + 3] = 255; }
  }
  // Eyes: mirror-symmetric about the face's middle, 2 wide; tall with a glint on the cute ones.
  for (const { m, l, r } of eyesAt) {
    const row = Math.round((l.y + r.y) / 2) - 1;
    if (m.one) {
      // One big eye: white with a dark pupil.
      const cx = Math.round((l.x + r.x) / 2);
      for (let dy = -1; dy <= 2; dy++) for (let dx = -2; dx <= 1; dx++) if (Math.abs(dx + 0.5) + Math.abs(dy - 0.5) < 3) set(cx + dx, row + dy, 250, 246, 232);
      for (let dy = 0; dy <= 1; dy++) for (let dx = -1; dx <= 0; dx++) set(cx + dx, row + dy, 27, 27, 31);
      continue;
    }
    const axis2 = Math.round(l.x + r.x); // twice the middle, so the mirror can fall between two columns
    // On a dark face, light eyes (else they vanish).
    const at = (Math.round(row + 1) * PX + Math.round(axis2 / 2)) * 4;
    const lum = 0.3 * a[at] + 0.59 * a[at + 1] + 0.11 * a[at + 2];
    const [er, eg, eb] = lum < 85 ? [246, 232, 160] : [27, 27, 31];
    const half = Math.max(1.5, (r.x - l.x) / 2);
    const left = Math.round(axis2 / 2 - half - 1);
    const tall = m.cute ? 3 : 2;
    for (const c of [left, left + 1]) {
      const cr = axis2 - c - 1; // the mirrored column
      for (let k = 0; k < tall; k++) { set(c, row + k, er, eg, eb); set(cr, row + k, er, eg, eb); }
    }
    if (m.cute && lum >= 85) {
      set(left + 1, row, 255, 255, 255); set(axis2 - left - 1, row, 255, 255, 255);
      // Rosy cheeks just below and outside the eyes.
      set(left - 1, row + tall, 240, 150, 150); set(axis2 - (left - 1) - 1, row + tall, 240, 150, 150);
    }
  }
  // Outline: from the finished silhouette, read from a copy so it doesn't spread.
  const was = keep.slice();
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < PX && y < PX && was[y * PX + x] === 1;
  for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) {
    const i = (y * PX + x) * 4;
    if (was[y * PX + x]) continue;
    if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) { a[i] = 42; a[i + 1] = 29; a[i + 2] = 23; a[i + 3] = 255; }
    else a[i + 3] = 0;
  }
  g.putImageData(img, 0, 0);
  pxCache.set(key, out);
  return out;
}

setSpriteMaker((def, faces) => {
  const key = `${def.id}|${faces}`;
  let t = texCache.get(key);
  if (!t) {
    t = new THREE.CanvasTexture(pixelCanvas(def, faces));
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(key, t);
  }
  return t;
});
