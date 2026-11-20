import * as THREE from 'three';
import { BY_ID } from '../sim/units';
import { buildPiece, pieceStyle } from './pieces';

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
