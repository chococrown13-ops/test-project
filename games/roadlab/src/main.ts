import * as THREE from 'three';
import './style.css';
import { dist, dot, fillet, minRadius, nearestOnPath, norm, pathLength, sub, v, type Path, type V } from '../../shared/roads/geom';
import { buildRoadMeshes } from '../../shared/roads/mesh';
import { type Kind, Network, TYPES } from '../../shared/roads/network';

/**
 * 도로 실험실: draw roads made of lines and arcs, watch junctions form.
 * 곡선: press the start, the bend point, then the end. Starting on a road's
 * free end continues that road smoothly (the bend is held on its line).
 * 직선: start and end. 지우기: tap a road.
 */

const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#cfd8c4');
const cam = new THREE.PerspectiveCamera(40, 1, 1, 5000);
const sun = new THREE.DirectionalLight('#fff3e0', 2.2);
sun.position.set(-200, 400, 150);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -400, right: 400, top: 400, bottom: -400, far: 1200 });
scene.add(sun, new THREE.HemisphereLight('#e6f0ff', '#7d8a5d', 1.1));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#b9c79f', roughness: 1 }));
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(2000, 100, '#a9b78f', '#a9b78f');
(grid.material as THREE.Material).opacity = 0.35;
(grid.material as THREE.Material).transparent = true;
grid.position.y = 0.01;
scene.add(grid);

// Orbit camera: drag to pan, wheel/pinch to zoom, right-drag to turn.
const view = { x: 0, z: 0, dist: 420, yaw: -0.35, pitch: 1.05 };
function place() {
  const h = Math.sin(view.pitch) * view.dist, r = Math.cos(view.pitch) * view.dist;
  cam.position.set(view.x + Math.sin(view.yaw) * r, h, view.z + Math.cos(view.yaw) * r);
  cam.lookAt(view.x, 0, view.z);
}

const net = new Network();
let roads = new THREE.Group();
scene.add(roads);
const preview = new THREE.Group();
scene.add(preview);

let tool: 'curve' | 'line' | 'erase' = 'curve';
let kind: Kind = 'street';
/** Points pressed so far for the road being drawn. */
let picks: V[] = [];
/** Direction to hold the bend on, when continuing from a road end. */
let hold: V | null = null;
let hover: V | null = null;

const hint = document.getElementById('hint')!;
function say(s: string, bad = false) { hint.textContent = s; hint.classList.toggle('bad', bad); }
function idleHint() {
  say(tool === 'curve' ? '곡선: 시작점 → 꺾는 점 → 끝점 순서로 누르세요. 도로 끝에서 시작하면 자연스럽게 이어져요.'
    : tool === 'line' ? '직선: 시작점과 끝점을 누르세요. 다른 도로와 만나면 교차로가 생겨요.' : '지우기: 지울 도로를 누르세요.');
}

function rebuild() {
  scene.remove(roads);
  roads.traverse((o) => { if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose(); });
  roads = buildRoadMeshes(net);
  roads.traverse((o) => { o.castShadow = false; o.receiveShadow = true; });
  scene.add(roads);
}

/** Snap a point: to a road node, else to a 5 m grid. */
function snap(p: V): { p: V; node?: number } {
  const n = net.nodeNear(p, 8);
  if (n) return { p: n.p, node: n.id };
  return { p: v(Math.round(p.x / 5) * 5, Math.round(p.z / 5) * 5) };
}

/** Minimum arc radius a road type can take. */
const MIN_R: Record<Kind, number> = { street: 8, avenue: 20 };

function candidate(): { path: Path; why: string | null } | null {
  if (!hover || !picks.length) return null;
  const A = picks[0];
  if (tool === 'line' || (tool === 'curve' && picks.length === 1)) {
    let B = snap(hover).p;
    if (tool === 'curve' && hold) {
      // Hold the bend on the continuing road's line.
      const t = Math.max(10, dot(sub(B, A), hold));
      B = { x: A.x + hold.x * t, z: A.z + hold.z * t };
    }
    if (dist(A, B) < 4) return null;
    return { path: [{ kind: 'line', a: A, b: B }], why: null };
  }
  const C = picks[1], B = snap(hover).p;
  if (dist(C, B) < 2) return { path: [{ kind: 'line', a: A, b: C }], why: null };
  const path = fillet(A, C, B);
  const r = minRadius(path);
  const why = r < MIN_R[kind] ? `너무 급한 커브예요 (반지름 ${r.toFixed(0)}m, ${kind === 'avenue' ? '큰길' : '골목길'}은 ${MIN_R[kind]}m 이상)` : null;
  return { path, why };
}

function drawPreview() {
  preview.clear();
  const c = candidate();
  if (c) {
    const tmp = new Network();
    tmp.addRoad(c.path, kind);
    const g = buildRoadMeshes(tmp, { markings: false, colours: { asphalt: c.why ? '#d9473b' : '#5b8fbf', avenue: c.why ? '#d9473b' : '#3f6f9f', pavement: c.why ? '#f0b3aa' : '#c8dcef' } });
    g.position.y = 0.2;
    preview.add(g);
    const r = minRadius(c.path);
    if (c.why) say(c.why, true);
    else say(`${(pathLength(c.path)).toFixed(0)}m${Number.isFinite(r) ? ` · 반지름 ${r.toFixed(0)}m` : ''}${picks.length === 1 && tool === 'curve' ? ' · 이제 꺾는 점을 누르세요 (같은 곳을 두 번 누르면 직선)' : ''}`);
  }
  // Pick markers.
  for (const p of picks) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.6, 16), new THREE.MeshBasicMaterial({ color: '#f2c94c' }));
    m.position.set(p.x, 0.5, p.z);
    preview.add(m);
  }
  if (picks.length === 2) {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(picks[0].x, 0.6, picks[0].z), new THREE.Vector3(picks[1].x, 0.6, picks[1].z), ...(hover ? [new THREE.Vector3(snap(hover).p.x, 0.6, snap(hover).p.z)] : [])]);
    preview.add(new THREE.Line(g, new THREE.LineDashedMaterial({ color: '#1f2733', dashSize: 3, gapSize: 2 })).computeLineDistances());
  }
}

function press(p: V) {
  if (tool === 'erase') {
    let best = -1, bd = 10;
    for (const e of net.edges.values()) { const d = nearestOnPath(e.path, p).d; if (d < bd) { bd = d; best = e.id; } }
    if (best >= 0) { net.remove(best); rebuild(); }
    return;
  }
  const s = snap(p);
  if (!picks.length) {
    picks = [s.p];
    // Starting on a road's free end: continue it smoothly.
    hold = null;
    if (s.node !== undefined) {
      const es = net.at(s.node);
      if (es.length === 1) { const d = net.leave(es[0], s.node); hold = norm({ x: -d.x, z: -d.z }); }
    }
    drawPreview();
    return;
  }
  const c = candidate();
  if (tool === 'curve' && picks.length === 1) {
    if (!c) return;
    picks.push((c.path[0] as { b: V }).b);
    drawPreview();
    return;
  }
  if (!c || c.why) return;
  net.addRoad(c.path, kind);
  // Keep drawing from the end, continuing smoothly.
  const end = c.path[c.path.length - 1];
  const endP = end.kind === 'line' ? end.b : { x: end.c.x + Math.cos(end.a0 + end.sweep) * end.r, z: end.c.z + Math.sin(end.a0 + end.sweep) * end.r };
  picks = [];
  hold = null;
  rebuild();
  void endP;
  drawPreview();
  idleHint();
}

/* ---- input ---- */
const ray = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function groundAt(e: { clientX: number; clientY: number }): V | null {
  const r = canvas.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), cam);
  const hit = new THREE.Vector3();
  return ray.ray.intersectPlane(plane, hit) ? v(hit.x, hit.z) : null;
}
const pts = new Map<number, { x: number; y: number }>();
let down: { x: number; y: number } | null = null, moved = 0;
canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 1) { down = { x: e.clientX, y: e.clientY }; moved = 0; } });
canvas.addEventListener('pointermove', (e) => {
  hover = groundAt(e);
  const prev = pts.get(e.pointerId);
  if (prev) {
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    moved += Math.abs(dx) + Math.abs(dy);
    if (pts.size === 1 && moved > 6) {
      if (e.buttons & 2) { view.yaw -= dx * 0.006; view.pitch = Math.min(1.5, Math.max(0.3, view.pitch + dy * 0.004)); }
      else { const k = view.dist / innerHeight * 1.1, s = Math.sin(view.yaw), c = Math.cos(view.yaw); view.x += (-dx * c - dy * s) * k; view.z += (dx * s - dy * c) * k; }
    } else if (pts.size === 2) {
      const o = [...pts.entries()].find(([id]) => id !== e.pointerId)![1];
      const d0 = Math.hypot(prev.x - o.x, prev.y - o.y), d1 = Math.hypot(e.clientX - o.x, e.clientY - o.y);
      if (d0 > 0) view.dist = Math.min(2500, Math.max(60, view.dist * d0 / d1));
    }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }
  drawPreview();
});
const up = (e: PointerEvent) => {
  pts.delete(e.pointerId);
  if (down && moved < 6 && pts.size === 0 && e.button === 0) { const p = groundAt(e); if (p) press(p); }
  if (!pts.size) down = null;
};
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => { e.preventDefault(); view.dist = Math.min(2500, Math.max(60, view.dist * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
addEventListener('keydown', (e) => { if (e.key === 'Escape') { picks = []; hold = null; drawPreview(); idleHint(); } });

document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((b) => b.addEventListener('click', () => {
  tool = b.dataset.tool as typeof tool; picks = []; hold = null;
  document.querySelectorAll('[data-tool]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  drawPreview(); idleHint();
}));
document.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach((b) => b.addEventListener('click', () => {
  kind = b.dataset.kind as Kind;
  document.querySelectorAll('[data-kind]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  drawPreview();
}));
document.getElementById('clear')!.addEventListener('click', () => { net.nodes.clear(); net.edges.clear(); net.version++; rebuild(); });
document.getElementById('demo')!.addEventListener('click', () => { demo(); rebuild(); });

/** A sample: an avenue bending through town, streets crossing it, a roundabout-ish loop and a T. */
function demo() {
  net.nodes.clear(); net.edges.clear();
  net.addRoad(fillet(v(-300, 40), v(0, 40), v(240, -200)), 'avenue');
  net.addRoad([{ kind: 'line', a: v(-120, -160), b: v(-120, 200) }], 'avenue');
  net.addRoad(fillet(v(-260, 160), v(-40, 160), v(60, 260)), 'street');
  net.addRoad([{ kind: 'line', a: v(60, -120), b: v(60, 200) }], 'street');
  net.addRoad(fillet(v(-220, -60), v(-200, -140), v(-60, -150)), 'street');
  net.addRoad(fillet(v(140, 120), v(140, 20), v(260, 10)), 'street');
  net.addRoad([{ kind: 'line', a: v(-120, 100), b: v(-40, 160) }], 'street');
}

function resize() { renderer.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
addEventListener('resize', resize);
resize();
demo();
rebuild();
idleHint();
(function loop() { place(); renderer.render(scene, cam); requestAnimationFrame(loop); })();

(window as unknown as { lab: unknown }).lab = { net, view, rebuild, TYPES, get picks() { return picks; }, get tool() { return tool; } };
