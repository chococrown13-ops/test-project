import * as THREE from 'three';
import { BY_ID } from '../sim/units';
import type { UnitDef } from '../sim/units';
import { buildPiece, pieceStyle, setSpriteMaker } from './pieces';

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
export function portrait(id: string, faces: boolean): string {
  const key = `${pieceStyle()}|${faces}|${id}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (!renderer) setup();
  const def = BY_ID[id];
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

const PX = 40;
let pxRenderer: THREE.WebGLRenderer | null = null;
const pxCache = new Map<string, HTMLCanvasElement>();
const texCache = new Map<string, THREE.Texture>();

/**
 * A piece as pixel art: the figure drawn at 40 x 40 with no smoothing, its colours stepped down,
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
  const obj = buildPiece(def, 1, false, faces, true);
  obj.base.visible = false; obj.ring.visible = false;
  const box = new THREE.Box3().setFromObject(obj.figure);
  const size = box.getSize(new THREE.Vector3());
  const h = Math.max(0.45, size.y, size.x * 0.9), cy = (box.max.y + box.min.y) / 2;
  const d = h * 1.9 + 0.25;
  camera.position.set(d * 0.3, cy + d * 0.28, d * 0.92);
  camera.lookAt(0, cy, 0);
  scene.add(obj.root);
  pxRenderer.render(scene, camera);
  scene.remove(obj.root);
  const out = document.createElement('canvas'); out.width = out.height = PX;
  const g = out.getContext('2d')!;
  g.drawImage(pxRenderer.domElement, 0, 0);
  const img = g.getImageData(0, 0, PX, PX), a = img.data;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < PX && y < PX && a[(y * PX + x) * 4 + 3] > 110;
  const keep = new Uint8Array(PX * PX);
  for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) keep[y * PX + x] = solid(x, y) ? 1 : 0;
  // Read the silhouette from this copy, not the pixels being rewritten (else the outline spreads).
  const was = (x: number, y: number) => x >= 0 && y >= 0 && x < PX && y < PX && keep[y * PX + x] === 1;
  for (let y = 0; y < PX; y++) for (let x = 0; x < PX; x++) {
    const i = (y * PX + x) * 4;
    if (keep[y * PX + x]) {
      // Fewer, flatter colours.
      for (let c = 0; c < 3; c++) a[i + c] = Math.min(255, Math.round(a[i + c] / 28) * 28);
      a[i + 3] = 255;
    } else if (was(x - 1, y) || was(x + 1, y) || was(x, y - 1) || was(x, y + 1)) {
      a[i] = 42; a[i + 1] = 29; a[i + 2] = 23; a[i + 3] = 255;
    } else a[i + 3] = 0;
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
