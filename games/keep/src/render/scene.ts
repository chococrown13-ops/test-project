import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { StylizePass } from '../../../city/src/render/stylize';
import { B, CELL, type Game, Ground, idx, N, type Place, RoadT, SIZE } from '../sim/world';
import { BuildingLayer } from './buildings';
import { buildMarkings } from './markings';

const PX = 8; // ground texture pixels per cell
/** Where the sun sits relative to what it lights: late afternoon, from the south-west. */
const SUN = new THREE.Vector3(-700, 900, 500);
/** A shadow's reach on the ground per metre of height (away from the sun). */
const CAST = { x: -SUN.x / SUN.y, z: -SUN.z / SUN.y };

/** Convex hull of 2-D points (monotone chain), for a shadow outline. */
function hull(pts: [number, number][]): [number, number][] {
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: [number, number][] = [], up: [number, number][] = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/** Orbit camera over a 5 km 구: eases toward its goal so every move feels smooth. */
export class KeepCamera {
  readonly cam = new THREE.PerspectiveCamera(40, 1, 4, 20000);
  target = new THREE.Vector3(SIZE / 2, 0, SIZE / 2);
  dist = 2600; yaw = -0.5; pitch = 0.95;
  goal = { x: SIZE / 2, z: SIZE / 2, dist: 2600, yaw: -0.5, pitch: 0.95 };
  focus(x: number, z: number, dist?: number) { this.goal.x = x; this.goal.z = z; if (dist) this.goal.dist = dist; }
  /**
   * Look at a point so it lands `lift` (share of the view height) above the
   * centre: used when a sheet covers the bottom of the screen.
   */
  focusAbove(x: number, z: number, dist: number, lift: number) {
    const ground = (dist * 0.73) / Math.sin(this.goal.pitch);
    const k = ground * lift;
    this.focus(x + Math.sin(this.goal.yaw) * k, z + Math.cos(this.goal.yaw) * k, dist);
  }
  /** Still easing toward the goal? */
  moving() {
    const g = this.goal, e = this.dist * 1e-4;
    return Math.abs(g.x - this.target.x) > e || Math.abs(g.z - this.target.z) > e || Math.abs(g.dist - this.dist) > e
      || Math.abs(g.yaw - this.yaw) > 1e-4 || Math.abs(g.pitch - this.pitch) > 1e-4;
  }
  /** Jump straight to the goal (first frame, tests). */
  snap() { Object.assign(this, { dist: this.goal.dist, yaw: this.goal.yaw, pitch: this.goal.pitch }); this.target.x = this.goal.x; this.target.z = this.goal.z; this.update(0); }
  panPixels(dx: number, dy: number, viewH: number) {
    const k = (this.goal.dist * 1.0) / viewH, s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    this.goal.x = Math.min(SIZE, Math.max(0, this.goal.x + (-dx * c - dy * s) * k));
    this.goal.z = Math.min(SIZE, Math.max(0, this.goal.z + (dx * s - dy * c) * k));
  }
  zoom(f: number) { this.goal.dist = Math.min(4200, Math.max(90, this.goal.dist * f)); }
  rotate(dyaw: number, dpitch: number) { this.goal.yaw += dyaw; this.goal.pitch = Math.min(1.42, Math.max(0.35, this.goal.pitch + dpitch)); }
  update(dt: number) {
    const e = 1 - Math.exp(-dt * 6);
    this.target.x += (this.goal.x - this.target.x) * e;
    this.target.z += (this.goal.z - this.target.z) * e;
    this.dist += (this.goal.dist - this.dist) * e;
    this.yaw += (this.goal.yaw - this.yaw) * e;
    this.pitch += (this.goal.pitch - this.pitch) * e;
    const h = Math.sin(this.pitch) * this.dist, r = Math.cos(this.pitch) * this.dist;
    this.cam.position.set(this.target.x + Math.sin(this.yaw) * r, this.target.y + h, this.target.z + Math.cos(this.yaw) * r);
    this.cam.lookAt(this.target);
  }
}

/**
 * Graphics level. high: full resolution, 4x MSAA, soft shadows, ink outlines,
 * all details. medium: lighter resolution, smaller shadows, half-size outline
 * buffer, details only up close. low: native pixels, no shadows, no outlines,
 * details only very close.
 */
export type Quality = 'high' | 'medium' | 'low';

export interface Highlight { cells?: number[]; district?: number; place?: number }

export class KeepScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly view = new KeepCamera();
  readonly buildings = new BuildingLayer();
  private composer: EffectComposer;
  private stylize: StylizePass;
  private fxaa: FXAAPass;
  /** A rebuild spread over frames (see update). */
  private job: Generator<void> | null = null;
  private sun = new THREE.DirectionalLight('#fff1dc', 2.5);
  private terrain!: THREE.Mesh;
  private groundCanvas = document.createElement('canvas');
  private groundTex: THREE.CanvasTexture;
  private corner = new Float32Array((N + 1) * (N + 1));
  private trees?: THREE.InstancedMesh;
  private marks?: THREE.Mesh;
  private pins = new THREE.Group();
  private pinMats = new Map<string, THREE.SpriteMaterial>();
  private ray = new THREE.Raycaster();
  private g!: Game;
  private hl: Highlight = {};

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.background = new THREE.Color('#d5e6ec');
    this.scene.fog = new THREE.Fog('#d5e6ec', 3000, 9000);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 1.2;
    this.scene.add(this.sun, this.sun.target, new THREE.HemisphereLight('#d6ebff', '#7d8a5d', 1.05));
    this.groundCanvas.width = this.groundCanvas.height = N * PX;
    this.groundTex = new THREE.CanvasTexture(this.groundCanvas);
    this.groundTex.colorSpace = THREE.SRGBColorSpace;
    this.groundTex.anisotropy = 8;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(SIZE * 3, SIZE * 3).rotateX(-Math.PI / 2).translate(SIZE / 2, -1.2, SIZE / 2), new THREE.MeshStandardMaterial({ color: '#6aa3c2', roughness: 0.25, metalness: 0.05 }));
    water.receiveShadow = true;
    this.scene.add(water, this.buildings.group, this.pins);
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(1, 1) });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.view.cam));
    this.stylize = new StylizePass(this.scene, this.view.cam);
    this.composer.addPass(this.stylize);
    this.composer.addPass(new OutputPass());
    // Without multisampling (보통, 가볍게) a cheap FXAA pass smooths the jagged edges.
    this.fxaa = new FXAAPass();
    this.fxaa.enabled = false;
    this.composer.addPass(this.fxaa);
    this.buildings.heightAt = (i) => this.cellBase(i);
    this.buildings.topAt = (i) => this.cellTop(i);
  }

  quality: Quality = 'high';
  private baked = false;
  private shadowCanvas = document.createElement('canvas');
  private shadowsFresh = false;

  setQuality(q: Quality) {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(q === 'high' ? Math.min(dpr, 2) : q === 'medium' ? Math.min(dpr, 1.5) : 1);
    const samples = q === 'high' ? 4 : 0;
    this.fxaa.enabled = samples === 0;
    for (const t of [this.composer.renderTarget1, this.composer.renderTarget2]) if (t.samples !== samples) { t.samples = samples; t.dispose(); }
    // Shadows: switching the light's flag off skips the shadow pass entirely.
    // 높게 casts shadows live. 보통 and 가볍게 use shadows baked into the ground
    // once per change: no shadow pass at all, buildings still throw shade.
    this.sun.castShadow = q === 'high';
    const bake = q !== 'high';
    if (bake !== this.baked) { this.baked = bake; if (this.g) this.paint(); }
    const size = q === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) { this.sun.shadow.mapSize.set(size, size); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
    // Ink outlines need a second render of the scene for normals.
    this.stylize.enabled = q !== 'low';
    this.stylize.normalScale = q === 'high' ? 1 : 0.5;
    this.buildings.detailDist = q === 'high' ? 1100 : q === 'medium' ? 650 : 380;
    const v = new THREE.Vector2();
    this.renderer.getSize(v);
    this.resize(v.x, v.y);
  }

  /** Something changed on screen: draw the next couple of frames. */
  invalidate() { this.dirty = 2; }
  private dirty = 2;

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.view.cam.aspect = w / h;
    this.view.cam.updateProjectionMatrix();
    this.invalidate();
  }

  /** A new map: terrain, ground paint, trees, buildings, pins. */
  setGame(g: Game) {
    this.g = g;
    this.hl = {};
    this.buildTerrain();
    this.paint();
    this.buildTrees();
    this.buildMarks();
    this.buildings.build(g);
    this.shadowsFresh = false;
    if (this.baked) this.paint();
    this.buildPins();
    this.invalidate();
  }

  /** The map changed over a decade: repaint and let the new buildings rise. */
  update(fresh: Set<number>, from?: { x: number; y: number }) {
    // Spread the work over frames (a few milliseconds each) so the view never freezes.
    this.job = this.updateSteps(fresh, from);
    this.invalidate();
  }

  /** Is a spread-out rebuild still running? */
  get busy() { return this.job !== null; }

  private *updateSteps(fresh: Set<number>, from?: { x: number; y: number }): Generator<void> {
    this.buildTrees();
    yield;
    this.buildMarks();
    yield;
    yield* this.buildings.buildSteps(this.g, fresh, from);
    this.shadowsFresh = !this.baked;
    if (this.baked) yield* this.bakeSteps();
    yield* this.paintSteps();
    this.buildPins();
    this.invalidate();
  }

  setHighlight(h: Highlight) { this.hl = h; this.paint(); this.buildPins(); this.invalidate(); }

  private buildTerrain() {
    const g = this.g, c = this.corner;
    for (let y = 0; y <= N; y++) for (let x = 0; x <= N; x++) {
      let s = 0, n = 0, wet = false;
      for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        const cx = x + dx, cy = y + dy;
        if (cx < 0 || cy < 0 || cx >= N || cy >= N) continue;
        const i = idx(cx, cy);
        if (g.ground[i] === Ground.Water) wet = true;
        s += g.height[i]; n++;
      }
      c[y * (N + 1) + x] = wet ? -4 : n ? s / n : 0;
    }
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, N, N).rotateX(-Math.PI / 2).translate(SIZE / 2, 0, SIZE / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) {
      const x = Math.round(pos.getX(k) / CELL), z = Math.round(pos.getZ(k) / CELL);
      pos.setY(k, c[z * (N + 1) + x]);
    }
    geo.computeVertexNormals();
    if (this.terrain) { this.scene.remove(this.terrain); this.terrain.geometry.dispose(); }
    this.terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: this.groundTex, roughness: 0.95 }));
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
  }

  /** The lowest corner of a cell, so buildings on slopes sit into the hill rather than float. */
  cellBase(i: number) {
    const x = i % N, y = (i / N) | 0, c = this.corner, W = N + 1;
    return Math.min(c[y * W + x], c[y * W + x + 1], c[(y + 1) * W + x], c[(y + 1) * W + x + 1]);
  }
  cellTop(i: number) {
    const x = i % N, y = (i / N) | 0, c = this.corner, W = N + 1;
    return Math.max(c[y * W + x], c[y * W + x + 1], c[(y + 1) * W + x], c[(y + 1) * W + x + 1]);
  }

  private paint() { for (const _ of this.paintSteps()) { /* all at once */ } }

  private *paintSteps(): Generator<void> {
    const g = this.g, ctx = this.groundCanvas.getContext('2d')!;
    const area = new Set(this.hl.cells ?? []);
    const shade = (hex: string, k: number) => { const n = parseInt(hex.slice(1), 16); const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k))); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (x === 0 && (y & 63) === 63) yield;
      const i = idx(x, y), t = g.btype[i], h = g.height[i];
      let col: string;
      if (g.ground[i] === Ground.Water) col = '#6aa3c2';
      else if (t === B.Field) col = (x + y) % 2 ? '#c9cf7c' : '#b7c96f';
      else if (t === B.Park) col = '#93c072';
      else if (g.district[i] >= 0) col = t === B.Vacant || t === B.None ? '#d9cfb4' : '#e7dcc3';
      else if (g.ground[i] === Ground.Hill) col = shade('#93b46e', 1 - Math.min(0.25, h / 600));
      else col = '#b3cc8a';
      ctx.fillStyle = col;
      ctx.fillRect(x * PX, y * PX, PX, PX);
      if (area.has(i)) { ctx.fillStyle = 'rgba(232, 92, 60, 0.42)'; ctx.fillRect(x * PX, y * PX, PX, PX); }
      else if (this.hl.district !== undefined && g.district[i] === this.hl.district) { ctx.fillStyle = 'rgba(242, 200, 60, 0.22)'; ctx.fillRect(x * PX, y * PX, PX, PX); }
    }
    // Roads: kerbs first for every road, then the asphalt on top, so a later
    // cell's kerb can never cut across the road drawn before it.
    const W = { [RoadT.Avenue]: [8, 6.4], [RoadT.Street]: [5.2, 3.6], [RoadT.Alley]: [3.4, 2.2] } as Record<number, [number, number]>;
    for (const pass of [0, 1]) {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (x === 0 && (y & 63) === 63) yield;
        const r = g.road[idx(x, y)];
        if (!r) continue;
        const w = W[r][pass], cx = x * PX + PX / 2, cy = y * PX + PX / 2;
        ctx.fillStyle = pass === 0 ? '#f1ebdd' : r === RoadT.Avenue ? '#6c6d71' : r === RoadT.Street ? '#a39c90' : '#b6ad9b';
        ctx.fillRect(cx - w / 2, cy - w / 2, w, w);
        for (const [dx, dy] of [[1, 0], [0, 1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx >= N || ny >= N) continue;
          const r2 = g.road[idx(nx, ny)];
          if (!r2) continue;
          const ww = Math.min(w, W[r2][pass]);
          if (dx) ctx.fillRect(cx, cy - ww / 2, PX, ww); else ctx.fillRect(cx - ww / 2, cy, ww, PX);
        }
      }
    }
    // (Lane markings are real geometry: see markings.ts.)
    if (this.baked) {
      if (!this.shadowsFresh) this.bakeShadows();
      ctx.save();
      ctx.globalAlpha = 0.32;
      ctx.drawImage(this.shadowCanvas, 0, 0);
      ctx.restore();
    }
    // Faint 동네 boundaries.
    ctx.fillStyle = 'rgba(120, 100, 70, 0.35)';
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (x === 0 && (y & 63) === 63) yield;
      const d = g.district[idx(x, y)];
      if (d < 0) continue;
      if (x + 1 < N && g.district[idx(x + 1, y)] >= 0 && g.district[idx(x + 1, y)] !== d) ctx.fillRect((x + 1) * PX - 1, y * PX, 2, PX);
      if (y + 1 < N && g.district[idx(x, y + 1)] >= 0 && g.district[idx(x, y + 1)] !== d) ctx.fillRect(x * PX, (y + 1) * PX - 1, PX, 2);
    }
    this.groundTex.needsUpdate = true;
  }

  private buildMarks() {
    if (this.marks) { this.scene.remove(this.marks); this.marks.geometry.dispose(); }
    this.marks = buildMarkings(this.g, (x, z) => this.groundAt(x, z));
    this.scene.add(this.marks);
  }

  /** Terrain height at a world point, interpolated between cell corners. */
  groundAt(wx: number, wz: number) {
    const W = N + 1, gx = Math.max(0, Math.min(N - 0.001, wx / CELL)), gz = Math.max(0, Math.min(N - 0.001, wz / CELL));
    const x0 = Math.floor(gx), z0 = Math.floor(gz), fx = gx - x0, fz = gz - z0, c = this.corner;
    const a = c[z0 * W + x0], b = c[z0 * W + x0 + 1], d = c[(z0 + 1) * W + x0], e = c[(z0 + 1) * W + x0 + 1];
    // The plane mesh splits each quad along one diagonal; bilinear is close enough under a painted line.
    return a * (1 - fx) * (1 - fz) + b * fx * (1 - fz) + d * (1 - fx) * fz + e * fx * fz;
  }

  /**
   * Bake every building's and tree's shadow into one layer: each part's
   * footprint, swept from its foot to its top along the sun's direction and
   * drawn as a solid outline. Drawn opaque on its own canvas so overlapping
   * shadows don't darken twice, then laid on the ground at partial strength.
   */
  private bakeShadows() { for (const _ of this.bakeSteps()) { /* all at once */ } }

  private *bakeSteps(): Generator<void> {
    const c = this.shadowCanvas;
    c.width = c.height = N * PX;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = 'rgb(38, 44, 66)';
    const k = PX / CELL;
    const cast = (x: number, y: number, z: number, w: number, h: number, d: number, rot: number) => {
      if (w * h * d < 2) return;
      const g0 = this.groundAt(x, z);
      const lo = Math.max(0, y - g0), hi = Math.max(0, y + h - g0);
      if (hi < 0.5) return;
      const cs = Math.cos(rot), sn = Math.sin(rot);
      const pts: [number, number][] = [];
      for (const [dx, dz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]) {
        const fx = x + dx * cs + dz * sn, fz = z - dx * sn + dz * cs;
        for (const t of [lo, hi]) pts.push([(fx + CAST.x * t) * k, (fz + CAST.z * t) * k]);
      }
      const hp = hull(pts);
      ctx.beginPath();
      ctx.moveTo(hp[0][0], hp[0][1]);
      for (let i = 1; i < hp.length; i++) ctx.lineTo(hp[i][0], hp[i][1]);
      ctx.closePath();
      ctx.fill();
    };
    let n = 0;
    for (const p of this.buildings.placed) { cast(p.x, p.y, p.z, p.w, p.h, p.d, p.rot); if (++n % 4000 === 0) yield; }
    for (const [x, y, z, sz] of this.treeSpots) cast(x, y, z, sz * 0.6, sz * 1.6, sz * 0.6, 0);
    this.shadowsFresh = true;
  }
  private treeSpots: [number, number, number, number][] = [];

  private buildTrees() {
    const g = this.g;
    const spots: [number, number, number, number][] = [];
    const h = (i: number, k: number) => { const s = Math.sin(i * 91.17 + k * 13.7) * 43758.5; return s - Math.floor(s); };
    for (let i = 0; i < N * N; i++) {
      if (g.ground[i] === Ground.Water || g.road[i] || g.btype[i] !== B.None) continue;
      const hill = g.ground[i] === Ground.Hill, town = g.district[i] >= 0;
      if (h(i, 1) > (town ? 0.7 : hill ? 0.55 : 0.12)) continue;
      const x = (i % N) * CELL + CELL * h(i, 2), z = ((i / N) | 0) * CELL + CELL * h(i, 3);
      spots.push([x, this.cellBase(i), z, 8 + h(i, 4) * 10]);
    }
    this.treeSpots = spots;
    if (this.trees) { this.scene.remove(this.trees); this.trees.dispose(); }
    const mesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 1, 6).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), spots.length);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    spots.forEach(([x, y, z, s], k) => {
      m4.makeScale(s * 0.8, s * 1.6, s * 0.8).setPosition(x, y, z);
      mesh.setMatrixAt(k, m4);
      mesh.setColorAt(k, col.setHSL(0.27 + h(k, 5) * 0.06, 0.38, 0.32 + h(k, 6) * 0.1));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.trees = mesh;
    this.scene.add(mesh);
  }

  /** A round badge over each 기억 장소: amber open, grey closed, mint reused; red ring when under threat. */
  private pinMat(key: string, fill: string, ring: string) {
    let m = this.pinMats.get(key);
    if (m) return m;
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const x = c.getContext('2d')!;
    x.beginPath(); x.arc(48, 40, 28, 0, Math.PI * 2); x.fillStyle = ring; x.fill();
    x.beginPath(); x.moveTo(34, 60); x.lineTo(48, 92); x.lineTo(62, 60); x.fill();
    x.beginPath(); x.arc(48, 40, 19, 0, Math.PI * 2); x.fillStyle = fill; x.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    m = new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true, fog: false });
    this.pinMats.set(key, m);
    return m;
  }

  private buildPins() {
    this.pins.clear();
    const area = new Set(this.hl.cells ?? []);
    const k = Math.max(1, this.view.dist / 900);
    for (const p of this.g.places) {
      if (p.state === 'lost') continue;
      const i = p.y * N + p.x;
      const danger = area.has(i) || this.hl.place === p.id;
      const fill = p.state === 'open' ? '#f2c94c' : p.state === 'reused' ? '#6fcf97' : '#b9b4ab';
      const ring = danger ? '#e2513c' : p.protected ? '#2f6db3' : '#ffffff';
      const s = new THREE.Sprite(this.pinMat(fill + ring, fill, ring));
      s.center.set(0.5, 0.05);
      const size = (danger ? 46 : 34) * k;
      s.scale.set(size, size, 1);
      s.position.set(p.x * CELL + CELL / 2, this.cellTop(i) + 16, p.y * CELL + CELL / 2);
      s.userData.place = p.id;
      s.renderOrder = 10;
      this.pins.add(s);
    }
    this.pinScale = k;
  }
  private pinScale = 1;

  /** Screen position of a world point, or null when behind the camera. */
  project(x: number, y: number, z: number, rect: DOMRect): { x: number; y: number } | null {
    const v = new THREE.Vector3(x, y, z).project(this.view.cam);
    if (v.z > 1) return null;
    return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height };
  }

  placeScreen(p: Place, rect: DOMRect) {
    return this.project(p.x * CELL + CELL / 2, this.cellTop(p.y * N + p.x) + 16, p.y * CELL + CELL / 2, rect);
  }

  /** What's under a tap: a pin first, else the ground cell. */
  pick(px: number, py: number, rect: DOMRect): { place?: number; cell?: number } {
    const v = new THREE.Vector2(((px - rect.left) / rect.width) * 2 - 1, -((py - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(v, this.view.cam);
    // Pins: nearest on screen within a finger's width.
    let best = -1, bd = 26 * 26;
    for (const s of this.pins.children) {
      const q = this.project(s.position.x, s.position.y + s.scale.y * 0.45, s.position.z, rect);
      if (!q) continue;
      const d = (q.x - px) ** 2 + (q.y - py) ** 2;
      if (d < bd) { bd = d; best = s.userData.place; }
    }
    if (best >= 0) return { place: best };
    const hit = this.ray.intersectObject(this.terrain, false)[0];
    if (!hit) return {};
    const x = Math.floor(hit.point.x / CELL), y = Math.floor(hit.point.z / CELL);
    if (x < 0 || y < 0 || x >= N || y >= N) return {};
    return { cell: idx(x, y) };
  }

  /**
   * Advance and, only if anything on screen changed, draw. A still map costs
   * nothing: no redraw while the camera rests and nothing is rising.
   * Returns whether a frame was drawn.
   */
  frame(dt: number): boolean {
    // Advance a spread-out rebuild by a few milliseconds a frame.
    if (this.job) {
      const t0 = performance.now();
      while (performance.now() - t0 < 6) if (this.job.next().done) { this.job = null; break; }
      this.dirty = 2;
    }
    const moving = this.view.moving();
    this.view.update(dt);
    if (this.buildings.animating) this.dirty = 2;
    this.buildings.tick(dt);
    if (moving) this.dirty = 2;
    if (this.dirty <= 0) return false;
    this.dirty--;
    this.buildings.setDistance(this.view.dist);
    // Pins keep a steady size on screen as the camera zooms.
    const k = Math.max(1, this.view.dist / 900);
    if (Math.abs(k - this.pinScale) / this.pinScale > 0.08) {
      for (const s of this.pins.children) s.scale.multiplyScalar(k / this.pinScale);
      this.pinScale = k;
    }
    const t = this.view.target;
    // Late-afternoon sun from the south-west; the shadow box follows the view.
    this.sun.position.set(t.x + SUN.x, SUN.y, t.z + SUN.z);
    this.sun.target.position.copy(t);
    const s = Math.min(1600, Math.max(250, this.view.dist * 0.9));
    const cam = this.sun.shadow.camera;
    if (cam.right !== s) { cam.left = -s; cam.right = s; cam.top = s; cam.bottom = -s; cam.near = 10; cam.far = 3000; cam.updateProjectionMatrix(); }
    (this.scene.fog as THREE.Fog).near = this.view.dist * 1.4;
    (this.scene.fog as THREE.Fog).far = this.view.dist * 4 + 2000;
    // Thin lines shimmer from far away: fade them out as the camera pulls back.
    if (this.marks) {
      const m = this.marks.material as THREE.Material;
      m.opacity = Math.max(0, Math.min(1, (2000 - this.view.dist) / 900));
      this.marks.visible = m.opacity > 0.01;
    }
    this.stylize.configure(this.view.dist, 0);
    this.composer.render(dt);
    return true;
  }
}
