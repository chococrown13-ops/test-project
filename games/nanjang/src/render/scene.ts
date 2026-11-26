import * as THREE from 'three';
import { COLS, type Combat, DT, type Ev, HALF, ROWS, step } from '../sim/combat';
import type { Piece, Player } from '../sim/game';
import { BENCH } from '../sim/game';
import { ARENAS, BUSH, ICE, MUD, ROCK, WATER } from '../sim/arena';
import { BY_ID, itemDef, type Palette, theme, TRAITS } from '../sim/units';
import { buildPiece, type PieceObj } from './pieces';

/**
 * The table: a 12 x 8 board, long side across the screen, the bench along the
 * near edge, the pieces, and the fight played out step by step with strikes,
 * thrown fire, numbers and falls.
 */

const BENCH_Z = ROWS / 2 + 1.05;
/** Bench pieces shown during a fight are keyed from here (fighters use 0, 1, 2...). */
export const BENCH_KEY = 1_000_000;
const benchX = (i: number) => (i - (BENCH - 1) / 2) * 0.98;
const wx = (x: number) => x - (COLS - 1) / 2;
const wz = (y: number) => y - (ROWS - 1) / 2;

interface Shown {
  obj: PieceObj; label: HTMLDivElement; hp: HTMLElement; mp: HTMLElement; sh: HTMLElement; st: HTMLElement; stKey: string;
  x: number; z: number; tx: number; tz: number;
  /** A step in progress: from where, how far along (0..1), and how long it takes (fight seconds). */
  fx0: number; fz0: number; mk: number; md: number;
  /** Recoil after a shot, a little squash on landing. */
  kick: number;
  lunge: number; lx: number; lz: number; dead: number; side: number; face: number;
}

interface Fx { obj: THREE.Object3D; t: number; life: number; update: (k: number) => void }

export type DropTarget = { bench: number } | { c: number; r: number } | null;

export class Table {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  private shown = new Map<number, Shown>();
  private fx: Fx[] = [];
  private ray = new THREE.Raycaster();
  private hiTile: THREE.Mesh;
  private tiles: THREE.Mesh[] = [];
  private benchPads: THREE.Mesh[] = [];
  private enemyHalf: THREE.Mesh;
  combat: Combat | null = null;
  private tableTop!: THREE.Mesh;
  private frameMesh!: THREE.Mesh;
  private river!: THREE.Mesh;
  private palette: Palette | null = null;
  private terrainLayer = new THREE.Group();
  private grid!: THREE.LineSegments;
  /** The square outlines of our half: on while a piece is being placed. */
  showGrid(on: boolean) { this.grid.visible = on; this.enemyHalf.visible = on && !this.combat; }
  arena = 'yard';
  private flip = false;
  private acc = 0;
  speed = 1;
  onFightEvent: ((e: Ev, c: Combat) => void) | null = null;
  onFightEnd: (() => void) | null = null;

  constructor(private canvas: HTMLCanvasElement, private labels: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene.background = new THREE.Color('#e9e1cf');
    this.scene.fog = new THREE.Fog('#e9e1cf', 22, 40);

    const hemi = new THREE.HemisphereLight('#fff6e2', '#8a7a64', 1.4);
    const sun = new THREE.DirectionalLight('#fff1d6', 2.2);
    sun.position.set(-5, 12, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 });
    sun.shadow.bias = -0.0005;
    this.scene.add(hemi, sun);

    // The table top and the board on it.
    const table = this.tableTop = new THREE.Mesh(new THREE.BoxGeometry(COLS + 7, 0.4, ROWS + 8), new THREE.MeshStandardMaterial({ color: '#7a5233', roughness: 0.85 }));
    table.position.set(0, -0.32, 0.6);
    table.receiveShadow = true;
    this.scene.add(table);
    const frame = this.frameMesh = new THREE.Mesh(new THREE.BoxGeometry(COLS + 0.5, 0.18, ROWS + 0.5), new THREE.MeshStandardMaterial({ color: '#4a3020', roughness: 0.7 }));
    frame.position.y = -0.1; frame.receiveShadow = true;
    this.scene.add(frame);
    // One seamless surface per half: the squares show only as grid lines while placing (see showGrid).
    const tileG = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const mine = y >= HALF, light = (x + y) % 2 === 0;
      void light;
      const t = new THREE.Mesh(tileG, new THREE.MeshStandardMaterial({ color: mine ? '#efe4c8' : '#e7dccb', roughness: 0.9 }));
      t.position.set(wx(x), 0.03, wz(y));
      t.receiveShadow = true;
      this.scene.add(t);
      this.tiles.push(t);
    }
    // The 강 (river) line across the middle, as on a 장기판.
    const river = this.river = new THREE.Mesh(new THREE.BoxGeometry(COLS, 0.065, 0.06), new THREE.MeshStandardMaterial({ color: '#7b2d26' }));
    river.position.set(0, 0.01, 0);
    this.scene.add(river);
    this.enemyHalf = new THREE.Mesh(new THREE.PlaneGeometry(COLS, HALF), new THREE.MeshBasicMaterial({ color: '#3a2a20', transparent: true, opacity: 0.12, depthWrite: false }));
    this.enemyHalf.rotation.x = -Math.PI / 2; this.enemyHalf.position.set(0, 0.04, wz(HALF / 2 - 0.5));
    this.scene.add(this.enemyHalf);
    // The bench: a tray with nine pads.
    const tray = new THREE.Mesh(new THREE.BoxGeometry(BENCH * 0.98 + 0.3, 0.12, 1.1), new THREE.MeshStandardMaterial({ color: '#5a3b26', roughness: 0.8 }));
    tray.position.set(0, -0.08, BENCH_Z); tray.receiveShadow = true;
    this.scene.add(tray);
    for (let i = 0; i < BENCH; i++) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 20), new THREE.MeshStandardMaterial({ color: '#d9c9a6', roughness: 0.9 }));
      pad.position.set(benchX(i), 0, BENCH_Z); pad.receiveShadow = true;
      this.scene.add(pad);
      this.benchPads.push(pad);
    }
    // Grid lines over our half, shown while a piece is being placed.
    const pts: number[] = [];
    const y0 = 0.035, zA = wz(HALF) - 0.5, zB = wz(ROWS - 1) + 0.5, xA = wx(0) - 0.5, xB = wx(COLS - 1) + 0.5;
    for (let c = 0; c <= COLS; c++) { const x = xA + c; pts.push(x, y0, zA, x, y0, zB); }
    for (let r = 0; r <= HALF; r++) { const z = zA + r; pts.push(xA, y0, z, xB, y0, z); }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.grid = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#5a3b26', transparent: true, opacity: 0.45 }));
    this.grid.visible = false;
    this.scene.add(this.grid);
    this.hiTile = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.08, 0.98), new THREE.MeshBasicMaterial({ color: '#f2c94c', transparent: true, opacity: 0.55, depthWrite: false }));
    this.hiTile.visible = false;
    this.scene.add(this.hiTile);
    this.scene.add(this.terrainLayer);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Colours of the table for a theme. */
  setPalette(p: Palette) {
    this.palette = p;
    (this.scene.fog as THREE.Fog).color.set(p.bg);
    (this.tableTop.material as THREE.MeshStandardMaterial).color.set(p.table);
    (this.frameMesh.material as THREE.MeshStandardMaterial).color.set(p.frame);
    (this.river.material as THREE.MeshStandardMaterial).color.set(p.line);
    this.paintTiles();
    this.setScenery(p);
    (this.scene.fog as THREE.Fog).near = p.scenery === 'meadow' ? 30 : 22;
    (this.scene.fog as THREE.Fog).far = p.scenery === 'meadow' ? 70 : 40;
  }

  private paintTiles() {
    const p = this.palette;
    if (!p) return;
    this.tiles.forEach((t, i) => {
      const y = Math.floor(i / COLS), x = i % COLS;
      // A faint wash by half; a meadow board gets a soft lawn checker, like a mown pitch.
      const k = p.scenery === 'meadow' && (x + y) % 2 ? 1 : 0;
      (t.material as THREE.MeshStandardMaterial).color.set(y >= HALF ? p.mine[k] : p.theirs[k]);
    });
  }

  private scenery = new THREE.Group();
  /** A sky behind and a meadow round the table: rounded trees, bushes, flowers, a few clouds. */
  private setScenery(p: Palette) {
    this.scene.remove(this.scenery);
    this.scenery = new THREE.Group();
    if (p.scenery !== 'meadow') {
      this.scene.background = new THREE.Color(p.bg);
      return;
    }
    // Sky: a vertical gradient.
    const c = document.createElement('canvas'); c.width = 4; c.height = 256;
    const g = c.getContext('2d')!, gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, p.sky ?? '#8fcdf0'); gr.addColorStop(0.75, p.bg); gr.addColorStop(1, p.bg);
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    const sky = new THREE.CanvasTexture(c); sky.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = sky;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const toon = (color: string) => new THREE.MeshToonMaterial({ color });
    const put = (m: THREE.Object3D, x: number, y: number, z: number) => { m.position.set(x, y, z); m.traverse((o) => { (o as THREE.Mesh).castShadow = true; (o as THREE.Mesh).receiveShadow = true; }); this.scenery.add(m); return m; };
    // A wide lawn under everything, so the table edge sits in grass.
    const lawn = new THREE.Mesh(new THREE.CircleGeometry(40, 48), new THREE.MeshToonMaterial({ color: '#8cc46c' }));
    lawn.rotation.x = -Math.PI / 2; lawn.position.y = -0.53; lawn.receiveShadow = true; this.scenery.add(lawn);
    const tree = (x: number, z: number, s: number) => {
      const t = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1, 7), toon('#8a5a36'));
      trunk.position.y = 0.5; t.add(trunk);
      const greens = ['#5fa64a', '#72b856', '#4f9442'];
      for (let k = 0; k < 3; k++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62 - k * 0.12, 1), toon(greens[k]));
        b.position.set((k - 1) * 0.28, 1.25 + k * 0.38, (k % 2) * 0.15);
        t.add(b);
      }
      t.scale.setScalar(s);
      put(t, x, -0.52, z);
    };
    const bush = (x: number, z: number, s: number) => {
      const b = new THREE.Group();
      for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 1), toon(k === 1 ? '#6cb052' : '#5a9e46')); m.position.set((k - 1) * 0.3, 0.22 + (k === 1 ? 0.08 : 0), 0); b.add(m); }
      b.scale.setScalar(s);
      put(b, x, -0.52, z);
    };
    const W = COLS / 2 + 3.5, D = ROWS / 2 + 4;
    // Trees behind and to the sides, bushes along the table's sides.
    for (let k = 0; k < 9; k++) tree(-W - 2 + (k / 8) * (2 * W + 4) + (rnd() - 0.5), -D - 1.2 - rnd() * 2.5, 1.1 + rnd() * 0.6);
    for (const sd of [-1, 1]) {
      for (let k = 0; k < 4; k++) tree(sd * (W + 1.6 + rnd() * 2), -D + k * 3 + rnd(), 0.9 + rnd() * 0.5);
      for (let k = 0; k < 5; k++) bush(sd * (W + 0.5 + rnd() * 0.6), -D + 1 + k * 2.2, 0.9 + rnd() * 0.4);
    }
    // Flowers dotted over the lawn.
    const petals = ['#ffffff', '#f6d24a', '#f29ab8', '#c9a7f2'];
    const flowerG = new THREE.SphereGeometry(0.07, 6, 5);
    for (let k = 0; k < 90; k++) {
      const a = rnd() * Math.PI * 2, r = 10 + rnd() * 9;
      const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.8;
      if (Math.abs(x) < W + 0.4 && Math.abs(z) < D + 1) continue;
      const f = new THREE.Mesh(flowerG, new THREE.MeshToonMaterial({ color: petals[k % petals.length] }));
      put(f, x, -0.46, z);
    }
    // Clouds far off.
    for (let k = 0; k < 5; k++) {
      const cl = new THREE.Group();
      for (let j = 0; j < 4; j++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.9 + rnd() * 0.5, 12, 10), new THREE.MeshToonMaterial({ color: '#ffffff' })); m.position.set(j * 1.1 - 1.6, rnd() * 0.4, rnd() * 0.3); cl.add(m); }
      cl.scale.set(1.6, 0.9, 1);
      cl.position.set(-22 + k * 11 + rnd() * 3, 7 + rnd() * 3, -26 - rnd() * 4);
      this.scenery.add(cl);
    }
    this.scene.add(this.scenery);
  }

  /** The round's ground: water, rocks, bamboo, mud and ice drawn on the squares. */
  setArena(id: string) {
    if (id === this.arena && this.terrainLayer.children.length) return;
    this.arena = id;
    this.terrainLayer.clear();
    this.paintTiles();
    const a = ARENAS[id];
    if (!a) return;
    const M = (c: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, flatShading: true, ...o });
    a.grid.forEach((g, i) => {
      const x = wx(i % COLS), z = wz(Math.floor(i / COLS));
      const tile = this.tiles[i];
      const add = (m: THREE.Mesh, y = 0) => { m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; this.terrainLayer.add(m); return m; };
      if (g === WATER) {
        (tile.material as THREE.MeshStandardMaterial).color.set('#5d93b0');
        add(new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.04, 0.98), M('#7fb6d0', { transparent: true, opacity: 0.85, roughness: 0.2 })), 0.035);
      } else if (g === ROCK) {
        const r = add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.36, 0), M('#8d8a82')), 0.22);
        r.rotation.set(i * 0.7, i * 1.3, 0); r.scale.set(1, 0.75, 1);
        add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.18, 0), M('#a3a097')), 0.12).position.x += 0.22;
      } else if (g === BUSH) {
        (tile.material as THREE.MeshStandardMaterial).color.set('#c9d6a8');
        for (let k = 0; k < 5; k++) {
          const st = add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.9, 5), M(k % 2 ? '#6f9a4a' : '#87b25a')), 0.45);
          st.position.x += Math.cos(k * 2.4 + i) * 0.33; st.position.z += Math.sin(k * 2.4 + i) * 0.33;
        }
      } else if (g === MUD) {
        (tile.material as THREE.MeshStandardMaterial).color.set('#9b7e5c');
        add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 10), M('#7d6347')), 0.04).position.x += 0.18;
      } else if (g === ICE) {
        (tile.material as THREE.MeshStandardMaterial).color.set('#a9d3e6');
        add(new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.015, 0.96), M('#e4f4fb', { transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.1 })), 0.04);
        // A couple of white scratches on the ice.
        for (let k = 0; k < 2; k++) { const sc = add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.005, 0.03), M('#ffffff')), 0.05); sc.rotation.y = 0.5 + k * 1.1 + i; sc.position.x += (k - 0.5) * 0.25; }
      }
    });
  }

  private insets = { top: 0, bottom: 0 };
  /** Screen space the HUD covers at the top and bottom; the table is fitted between. */
  setInsets(top: number, bottom: number) {
    if (Math.abs(top - this.insets.top) < 1 && Math.abs(bottom - this.insets.bottom) < 1) return;
    this.insets = { top, bottom };
    this.resize();
  }

  private sized = { w: 0, h: 0 };
  /** Zoom (1 = the whole board fits) and how far the view is slid, in screen pixels. */
  private zoom = 1;
  private pan = { x: 0, y: 0 };
  get zoomLevel() { return this.zoom; }
  /** Zoom in or out by a factor, keeping the point under (cx, cy) where it is. */
  zoomBy(k: number, cx?: number, cy?: number) {
    const z = Math.max(1, Math.min(2.6, this.zoom * k));
    if (z === this.zoom) return;
    const r = this.canvas.getBoundingClientRect();
    const midX = r.left + r.width / 2, midY = r.top + this.insets.top + (r.height - this.insets.top - this.insets.bottom) / 2;
    const px = (cx ?? midX) - midX, py = (cy ?? midY) - midY;
    // The point under the pointer: (p - pan) / zoom in board pixels; keep it there.
    this.pan.x = px - ((px - this.pan.x) / this.zoom) * z;
    this.pan.y = py - ((py - this.pan.y) / this.zoom) * z;
    this.zoom = z;
    this.applyView();
  }
  panBy(dx: number, dy: number) { if (this.zoom <= 1) return; this.pan.x += dx; this.pan.y += dy; this.applyView(); }
  resetZoom() { this.zoom = 1; this.pan = { x: 0, y: 0 }; this.applyView(); }
  private applyView() {
    const { w, h } = this.sized;
    const free = Math.max(120, h - this.insets.top - this.insets.bottom);
    // Never slide the board out of sight.
    const mx = ((this.zoom - 1) * w) / 2, my = ((this.zoom - 1) * free) / 2;
    this.pan.x = Math.max(-mx, Math.min(mx, this.pan.x)); this.pan.y = Math.max(-my, Math.min(my, this.pan.y));
    if (this.zoom <= 1) this.pan = { x: 0, y: 0 };
    this.camera.zoom = this.zoom;
    this.camera.setViewOffset(w, free, -this.pan.x, -this.insets.top - this.pan.y, w, h);
    this.camera.updateProjectionMatrix();
  }
  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.sized = { w, h };
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setSize(w, h, false);
    const free = Math.max(120, h - this.insets.top - this.insets.bottom);
    this.camera.aspect = w / free;
    // Draw a virtual screen the height of the free band, shifted down below the top bar.
    this.camera.setViewOffset(w, free, 0, -this.insets.top, w, h);
    // Fit the board, the bench and the far pieces, then centre them.
    const pts = [
      [-COLS / 2 - 0.3, 0, -ROWS / 2 - 0.2], [COLS / 2 + 0.3, 0, -ROWS / 2 - 0.2], [-COLS / 2 + 0.4, 1, -ROWS / 2 + 0.4], [COLS / 2 - 0.4, 1, -ROWS / 2 + 0.4],
      [-4.8, 0, BENCH_Z + 0.55], [4.8, 0, BENCH_Z + 0.55], [-4.8, 0.9, BENCH_Z], [4.8, 0.9, BENCH_Z],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
    // Tall screens look down more steeply, so the board fills the height.
    const ar = w / free;
    // Short, wide bands (a phone on its side) look along the table more, so the long board fills the width.
    // A low look along the board, as in the usual auto-battlers (steeper only on tall screens, where it must fit).
    const dir = (ar < 0.85 ? new THREE.Vector3(0, 0.9, 0.43) : ar > 2.2 ? new THREE.Vector3(0, 0.6, 0.8) : new THREE.Vector3(0, 0.73, 0.68)).normalize();
    const look = new THREE.Vector3(0, 0, 0.8);
    this.camera.zoom = 1;
    const place = (d: number) => { this.camera.position.copy(look).addScaledVector(dir, d); this.camera.lookAt(look); this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld(); };
    const span = () => {
      // The NDC extent of the points in the virtual (free-band) view, without the offset.
      const v = this.camera.view; this.camera.view = null; this.camera.updateProjectionMatrix();
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const p of pts) { const q = p.clone().project(this.camera); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
      this.camera.view = v; this.camera.updateProjectionMatrix();
      return { x0, x1, y0, y1 };
    };
    let d = 16;
    for (let it = 0; it < 4; it++) {
      let lo = 5, hi = 60;
      for (let k = 0; k < 24; k++) { d = (lo + hi) / 2; place(d); const s = span(); if (Math.max(-s.x0, s.x1, -s.y0, s.y1) > 0.97) lo = d; else hi = d; }
      d = hi; place(d);
      // Shift the look point so the content sits centred top to bottom.
      const s = span();
      const mid = (s.y0 + s.y1) / 2;
      if (Math.abs(mid) < 0.01) break;
      look.z -= mid * d * 0.35;
    }
    place(d);
    this.applyView();
  }

  /* ---------------------------------------------------------- pieces */

  private make(key: number, id: string, star: number, enemy: boolean, items: string[] = []): Shown {
    const obj = buildPiece(BY_ID[id], star, enemy, theme().faces !== false);
    obj.root.userData.id = id;
    obj.root.userData.key = key;
    obj.root.traverse((o) => { o.userData.key = key; });
    this.scene.add(obj.root);
    const label = document.createElement('div');
    label.className = `plabel${enemy ? ' enemy' : ''}`;
    const dots = items.map((it) => { const d = itemDef(it); return `<i class="it${d.base ? '' : ' sauce'}" style="--c:${d.color}" title="${d.name}"></i>`; }).join('');
    label.innerHTML = `<span class="status"></span><span class="pbars"><span class="stars s${star}">${'★'.repeat(star)}</span><span class="bars"><i class="bar hp"><b></b><u></u><i class="ticks"></i></i><i class="bar mp"><b></b></i></span></span>${dots ? `<span class="items">${dots}</span>` : ''}`;
    this.labels.appendChild(label);
    const [hp, sh] = [label.querySelector('.hp b') as HTMLElement, label.querySelector('.hp u') as HTMLElement];
    return { obj, label, hp, sh, mp: label.querySelector('.mp b') as HTMLElement, st: label.querySelector('.status') as HTMLElement, stKey: '', x: 0, z: 0, tx: 0, tz: 0, fx0: 0, fz0: 0, mk: 1, md: 0, kick: 0, lunge: 0, lx: 0, lz: 0, dead: 0, side: enemy ? 1 : 0, face: enemy ? 0 : Math.PI };
  }

  private drop(key: number) {
    const s = this.shown.get(key);
    if (!s) return;
    this.scene.remove(s.obj.root);
    s.label.remove();
    this.shown.delete(key);
  }

  /** Light up the pieces a test picks out (a trait being looked at), or none. */
  private hi: ((id: string) => boolean) | null = null;
  setHighlight(fn: ((id: string) => boolean) | null) {
    this.hi = fn;
    for (const s of this.shown.values()) {
      const on = !!fn && fn(s.obj.root.userData.id);
      s.obj.glow.visible = on;
      s.label.classList.toggle('hi', on);
      s.label.classList.toggle('lo', !!fn && !on);
    }
  }

  /** Every piece of the theme stood out on the board (for the collection and for comparing styles). */
  showLineup(ids: string[]) {
    this.clearPieces();
    this.combat = null;
    this.enemyHalf.visible = false;
    ids.forEach((id, k) => {
      const s = this.make(1000 + k, id, 1, false);
      const x = wx(k % COLS), z = wz(1 + Math.floor(k / COLS) * 2);
      s.x = s.tx = x; s.z = s.tz = z; s.face = Math.PI * 0.9;
      s.label.classList.add('prep');
      this.shown.set(1000 + k, s);
    });
  }

  clearPieces() { for (const k of [...this.shown.keys()]) this.drop(k); }

  /** Between fights: the player's board and bench, keyed by piece uid. */
  /** During a fight: the bench pieces (keyed apart from the fighters), which may still be sold or swapped. */
  showBench(p: Player, dragging = -1) {
    const want = new Map<number, { piece: Piece; x: number }>();
    p.bench.forEach((u, i) => { if (u) want.set(BENCH_KEY + u.uid, { piece: u, x: benchX(i) }); });
    for (const [k, s] of this.shown) {
      if (k < BENCH_KEY) continue;
      const w = want.get(k);
      if (!w || s.obj.root.userData.star !== w.piece.star) this.drop(k);
    }
    for (const [k, w] of want) {
      let s = this.shown.get(k);
      if (!s) {
        s = this.make(k, w.piece.id, w.piece.star, false, w.piece.items);
        s.obj.root.userData.star = w.piece.star;
        s.x = w.x; s.z = BENCH_Z;
        s.label.classList.add('prep');
        this.shown.set(k, s);
      }
      if (k !== dragging) { s.tx = w.x; s.tz = BENCH_Z; }
    }
  }

  showPrep(p: Player, dragging = -1) {
    this.combat = null;
    this.enemyHalf.visible = this.grid.visible;
    const want = new Map<number, { piece: Piece; x: number; z: number }>();
    p.board.forEach((u) => want.set(u.uid, { piece: u, x: wx(u.c), z: wz(HALF + u.r) }));
    p.bench.forEach((u, i) => { if (u) want.set(u.uid, { piece: u, x: benchX(i), z: BENCH_Z }); });
    for (const [k, s] of this.shown) {
      const w = want.get(k);
      if (!w || s.obj.root.userData.star !== w.piece.star || s.obj.root.userData.items !== (w.piece.items ?? []).join() || s.side !== 0) this.drop(k);
    }
    for (const [k, w] of want) {
      let s = this.shown.get(k);
      if (!s) {
        s = this.make(k, w.piece.id, w.piece.star, false, w.piece.items);
        s.obj.root.userData.star = w.piece.star;
        s.obj.root.userData.items = (w.piece.items ?? []).join();
        s.x = w.x; s.z = w.z;
        this.shown.set(k, s);
      }
      if (k !== dragging) { s.tx = w.x; s.tz = w.z; }
      s.label.classList.add('prep');
      s.dead = 0; s.face = Math.PI;
      if (this.hi) { const on = this.hi(s.obj.root.userData.id); s.obj.glow.visible = on; s.label.classList.toggle('hi', on); s.label.classList.toggle('lo', !on); }
    }
  }

  /** While dragging: the piece follows the pointer, raised a little. */
  dragTo(key: number, x: number, z: number) {
    const s = this.shown.get(key);
    if (!s) return;
    s.tx = x; s.tz = z; s.x = x; s.z = z;
  }

  /* ------------------------------------------------------------ input */

  private ndc(cx: number, cy: number) {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  }

  /** The player's piece under the pointer (prep only). */
  pick(cx: number, cy: number, any = false): number | null {
    if (this.combat && !any) return null;
    this.ray.setFromCamera(this.ndc(cx, cy), this.camera);
    const objs = [...this.shown.values()].map((s) => s.obj.root);
    const hit = this.ray.intersectObjects(objs, true)[0];
    if (hit && hit.object.userData.key !== undefined) return hit.object.userData.key as number;
    // A forgiving second try: the nearest piece to where the pointer meets the table.
    const g = this.ground(cx, cy);
    if (!g) return null;
    let best: number | null = null, bd = 0.5;
    for (const [k, s] of this.shown) { if (s.dead) continue; const d = Math.hypot(s.x - g.x, s.z - g.z); if (d < bd) { bd = d; best = k; } }
    return best;
  }

  /** Where the pointer meets the table top. */
  ground(cx: number, cy: number): THREE.Vector3 | null {
    this.ray.setFromCamera(this.ndc(cx, cy), this.camera);
    const p = new THREE.Vector3();
    return this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.05), p) ? p : null;
  }

  /** The board square or bench slot nearest a point on the table, if it's one the player may use. */
  targetAt(p: THREE.Vector3 | null): DropTarget {
    if (!p) return null;
    if (Math.abs(p.z - BENCH_Z) < 0.75 && Math.abs(p.x) < (BENCH / 2) * 0.98 + 0.2) {
      return { bench: Math.max(0, Math.min(BENCH - 1, Math.round(p.x / 0.98 + (BENCH - 1) / 2))) };
    }
    const x = Math.round(p.x + (COLS - 1) / 2), y = Math.round(p.z + (ROWS - 1) / 2);
    if (x < 0 || x >= COLS || y < HALF || y >= ROWS) return null;
    return { c: x, r: y - HALF };
  }

  highlight(t: DropTarget) {
    this.hiTile.visible = !!t;
    if (!t) return;
    if ('bench' in t) this.hiTile.position.set(benchX(t.bench), 0.04, BENCH_Z);
    else this.hiTile.position.set(wx(t.c), 0.04, wz(HALF + t.r));
  }

  /** Where on screen a piece stands (for the info card). */
  screenOf(key: number): { x: number; y: number } | null {
    const s = this.shown.get(key);
    if (!s) return null;
    const v = new THREE.Vector3(s.x, 1, s.z).project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  /* ------------------------------------------------------------- fight */

  /** Play a fight from its start; `flip` turns the board so the player's side is at the bottom. */
  startFight(c: Combat, flip: boolean) {
    this.clearPieces();
    this.enemyHalf.visible = false;
    this.hiTile.visible = false;
    this.combat = c; this.flip = flip; this.acc = 0;
    for (const f of c.f) {
      const s = this.make(f.key, f.def.id, f.star, (f.side === 1) !== flip, f.items);
      const p = this.pos(f.x, f.y);
      s.x = s.tx = p.x; s.z = s.tz = p.z;
      s.face = s.side === 1 ? 0 : Math.PI;
      this.shown.set(f.key, s);
    }
  }

  private pos(x: number, y: number) { return this.flip ? { x: wx(COLS - 1 - x), z: wz(ROWS - 1 - y) } : { x: wx(x), z: wz(y) }; }

  private handle(e: Ev) {
    const c = this.combat!;
    const S = (k: number) => this.shown.get(k)!;
    switch (e.k) {
      case 'move': {
        // A real step: from the square it stood on to the next, over the time the step takes, with a hop.
        const p = this.pos(e.x, e.y), s = S(e.a);
        s.fx0 = s.x; s.fz0 = s.z; s.tx = p.x; s.tz = p.z; s.mk = 0; s.md = Math.max(0.25, (e.t ?? 0.7) * 0.9);
        s.face = Math.atan2(p.x - s.x, p.z - s.z);
        break;
      }
      case 'blink': {
        const p = this.pos(e.x, e.y), s = S(e.a);
        this.puff(s.x, s.z, '#b9a7d9');
        s.x = s.tx = p.x; s.z = s.tz = p.z;
        this.puff(p.x, p.z, '#b9a7d9');
        break;
      }
      case 'atk': {
        const a = S(e.a), b = S(e.b);
        a.face = Math.atan2(b.x - a.x, b.z - a.z);
        // Every basic attack shows: a shot in the attacker's colour (with a glowing core and a trail), or a lunge and a slash.
        if (e.ranged) { this.bolt(a, b, BY_ID[c.f[e.a].def.id].look.extra ?? BY_ID[c.f[e.a].def.id].look.body); a.kick = 1; }
        else { a.lunge = 1; a.lx = b.x - a.x; a.lz = b.z - a.z; this.slash(b, a); }
        break;
      }
      // No damage numbers: the bars say enough. Effects get a word and a ring.
      case 'hit': if (e.crit) this.number(e.b, '치명타!', 'crit'); break;
      case 'miss': this.number(e.b, '회피', 'miss'); break;
      case 'heal': { const b = S(e.b); if (!b) break; this.number(e.b, `회복 +${e.v}`, 'heal'); this.ring(b.x, b.z, '#5fd17a', 0.5); this.sparkle(b.x, b.z, '#7ddc8a'); break; }
      case 'shield': { const b = S(e.b); if (!b) break; this.number(e.b, '보호막', 'shield'); this.ring(b.x, b.z, '#8ec5ff', 0.5); break; }
      case 'stun': { const b = S(e.b); if (!b) break; this.number(e.b, '기절!', 'stun'); this.ring(b.x, b.z, '#ffd84a', 0.4); break; }
      case 'silence': { const b = S(e.b); if (!b) break; this.number(e.b, '침묵!', 'silence'); this.ring(b.x, b.z, '#b07cff', 0.4); break; }
      case 'cast': this.castFx(e); break;
      case 'up': this.upFx(e); break;
      case 'die': S(e.a).dead = 0.001; break;
    }
  }

  /**
   * Every skill has its own look, so a fight can be read without words: what was cast, by whom, on whom.
   * Shapes, not just colours: bolts, beams, rocks from the sky, spikes from the ground, bubbles, waves.
   */
  private castFx(e: Extract<Ev, { k: 'cast' }>) {
    const a = this.shown.get(e.a), b = e.b !== undefined ? this.shown.get(e.b) : undefined;
    if (!a) return;
    const t = b ?? a;
    const cells = (col: string, stagger = 0) => { if (e.cells) e.cells.forEach(([x, y], k) => { const p = this.pos(x, y); this.later(k * stagger, () => this.flash(p.x, p.z, col)); }); };
    switch (e.skill) {
      case 'bonk': this.fall(t, '#e8c25a', 0.28, 'box'); this.stars(t, '#ffe27a'); break;
      case 'foxfire': for (let k = 0; k < 3; k++) this.later(k * 0.08, () => this.bolt(a, t, k === 1 ? '#bfe6ff' : '#5ab8ff')); break;
      case 'snipe': this.beam(a, t, '#fffdf2', 0.05, 0.2); this.target(t, '#ff5a4a'); break;
      case 'drag': this.beam(a, t, '#4fa3b5', 0.09, 0.35); this.ripple(t.x, t.z, '#7fd3e6', 3); break;
      case 'guardup': this.dome(a, '#bfe0ff'); break;
      case 'taunt': this.wave(a.x, a.z, '#f0a45a', 2.2); this.dome(a, '#f6c48d'); break;
      case 'boulder': this.fall(t, '#9b8f80', 0.42, 'rock'); cells('#b9ad9c', 0.03); break;
      case 'blink': this.afterimage(a, '#b9a7d9'); break;
      case 'wave': cells('#4fa3b5', 0.04); this.ripple(t.x, t.z, '#9ad8ea', 4); break;
      case 'heal': this.pillar(t, '#7ddc8a', 0.5); this.sparkle(t.x, t.z, '#b4f0bd'); break;
      case 'roar': this.wave(a.x, a.z, '#f29b30', 2.8); this.wave(a.x, a.z, '#ffd08a', 1.8); break;
      case 'judge': this.pillar(t, '#ffe15a', 0.35, 3.2); this.later(0.12, () => this.wave(t.x, t.z, '#fff1a8', 1.2)); break;
      case 'ttukttak': for (let k = 0; k < 3; k++) this.later(k * 0.1, () => this.fall(t, '#f2c94c', 0.16, 'box')); break;
      case 'charm': this.hearts(a, t, '#ff8fb1'); break;
      case 'reap': this.crescent(t, a, '#3b3b46', 1.7); break;
      case 'shell': this.dome(a, '#9fd3a8'); this.spikes(a.x, a.z, '#7bb886', 6, 0.55); break;
      case 'mountain': this.spikes(t.x, t.z, '#c7f0c2', 7, 0.75); cells('#9fd09a', 0.03); break;
      case 'devour': this.implode(t, '#55585f'); break;
      case 'beam': this.beam(a, t, '#7fd1d9', 0.16, 0.45); cells('#bdeef2'); break;
      case 'burst': this.blast(t, '#fff2a8'); break;
      default: this.ring(a.x, a.z, '#ffffff', 0.9);
    }
  }

  /** The extra an evolved skill does, each with its own mark (tests: render/scene.ts handles every Up). */
  private upFx(e: Extract<Ev, { k: 'up' }>) {
    const a = this.shown.get(e.a), b = e.b !== undefined ? this.shown.get(e.b) : undefined;
    if (!a) return;
    switch (e.up) {
      case 'thorns': this.spikes(a.x, a.z, '#e0554a', 8, 0.45); break;
      case 'share': if (b) { this.beam(a, b, '#8ec5ff', 0.05, 0.4); this.dome(b, '#cfe6ff'); } break;
      case 'twin': if (b) this.beam(a, b, '#c59bff', 0.06, 0.3); break;
      case 'splash': if (b) this.wave(b.x, b.z, '#ff9a4a', 1.3); break;
      case 'manaback': this.motesIn(a, '#6ea8ff'); break;
      case 'drain': if (b) this.stream(b, a, '#e04a5a'); break;
      case 'haste': this.whirl(a, '#ffe27a'); break;
      case 'chill': if (b) this.ice(b); break;
      case 'rally': if (b) this.arrow(b, '#ffcf4a'); break;
      case 'execute': if (b) this.crescent(b, a, '#c0283a', 1.2); break;
    }
  }

  /** Run something a little later (in fight time). */
  private later(delay: number, fn: () => void) {
    if (delay <= 0) { fn(); return; }
    let done = false;
    this.fx.push({ obj: new THREE.Object3D(), t: -delay, life: 0.001, update: (k) => { if (k >= 0 && !done) { done = true; fn(); } } });
  }

  private mat(color: string, opacity = 1) { return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }); }

  /** A straight line of light from one piece to another that fades. */
  private beam(a: Shown, b: Shown, color: string, width: number, life: number) {
    const from = new THREE.Vector3(a.x, 0.6, a.z), to = new THREE.Vector3(b.x, 0.6, b.z);
    const len = from.distanceTo(to) || 0.01;
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.45, width * 0.45, len, 8, 1, true), this.mat('#ffffff'));
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(width, width, len, 10, 1, true), this.mat(color, 0.7));
    g.add(core, glow);
    g.position.copy(from).lerp(to, 0.5);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    this.scene.add(g);
    this.fx.push({ obj: g, t: 0, life, update: (k) => { const s = 1 - k * 0.7; g.scale.set(s, 1, s); (glow.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k); (core.material as THREE.MeshBasicMaterial).opacity = 1 - k; } });
  }

  /** Something falling from the sky onto a piece: a rock or a block, landing with dust. */
  private fall(t: Shown, color: string, r: number, kind: 'rock' | 'box') {
    const m = new THREE.Mesh(kind === 'rock' ? new THREE.DodecahedronGeometry(r, 0) : new THREE.BoxGeometry(r, r, r), new THREE.MeshLambertMaterial({ color }));
    m.castShadow = true;
    this.scene.add(m);
    let landed = false;
    this.fx.push({ obj: m, t: 0, life: 0.5, update: (k) => {
      const f = Math.min(1, k / 0.55);
      m.position.set(t.x, 0.4 + (1 - f * f) * 3.2, t.z);
      m.rotation.set(k * 6, k * 4, 0);
      if (f >= 1 && !landed) { landed = true; for (let i = 0; i < 4; i++) this.puff(t.x + (Math.random() - 0.5) * 0.5, t.z + (Math.random() - 0.5) * 0.5, '#d8cfbf', 0.2, 0.16); this.ring(t.x, t.z, color, 0.7); }
      if (k > 0.8) m.scale.setScalar(Math.max(0.01, (1 - k) / 0.2));
    } });
  }

  /** Little stars circling a head: dazed. */
  private stars(t: Shown, color: string) {
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), this.mat(color));
      this.scene.add(m);
      this.fx.push({ obj: m, t: 0, life: 0.9, update: (k) => { const ang = k * 9 + (i * Math.PI * 2) / 3; m.position.set(t.x + Math.cos(ang) * 0.28, 1.15, t.z + Math.sin(ang) * 0.28); (m.material as THREE.MeshBasicMaterial).opacity = k < 0.8 ? 1 : (1 - k) * 5; } });
    }
  }

  /** A crosshair on the ground under a target. */
  private target(t: Shown, color: string) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.RingGeometry(0.32, 0.38, 28), this.mat(color)));
    for (let i = 0; i < 4; i++) { const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.22), this.mat(color)); const ang = (i * Math.PI) / 2; bar.position.set(Math.cos(ang) * 0.46, Math.sin(ang) * 0.46, 0); bar.rotation.z = ang + Math.PI / 2; g.add(bar); }
    g.rotation.x = -Math.PI / 2; g.position.set(t.x, 0.08, t.z);
    this.scene.add(g);
    this.fx.push({ obj: g, t: 0, life: 0.6, update: (k) => { g.scale.setScalar(1.6 - Math.min(1, k * 3) * 0.6); g.rotation.z = k * 2; g.children.forEach((c) => (((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 1 - k)); } });
  }

  /** Rings of water spreading one after another. */
  private ripple(x: number, z: number, color: string, n: number) { for (let i = 0; i < n; i++) this.later(i * 0.1, () => this.ring(x, z, color, 0.6 + i * 0.2)); }

  /** A bubble over a piece: a shield. */
  private dome(s: Shown, color: string) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), this.mat(color, 0.4));
    m.position.set(s.x, 0.05, s.z);
    this.scene.add(m);
    this.fx.push({ obj: m, t: 0, life: 0.8, update: (k) => { m.position.set(s.x, 0.05, s.z); m.scale.setScalar(0.4 + Math.min(1, k * 4) * 0.8); (m.material as THREE.MeshBasicMaterial).opacity = 0.45 * (k < 0.6 ? 1 : (1 - k) / 0.4); } });
  }

  /** A flat disc rolling out across the ground: a shout, a slam. */
  private wave(x: number, z: number, color: string, radius: number) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.32, 36), this.mat(color, 0.8));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.09, z);
    this.scene.add(m);
    this.fx.push({ obj: m, t: 0, life: 0.45, update: (k) => { m.scale.setScalar(0.5 + k * radius * 3); (m.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k); } });
  }

  /** A column of light standing on a piece (from the sky when tall). */
  private pillar(t: Shown, color: string, r: number, h = 1.8) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16, 1, true), this.mat(color, 0.5));
    m.position.set(t.x, h / 2, t.z);
    this.scene.add(m);
    this.fx.push({ obj: m, t: 0, life: 0.6, update: (k) => { m.scale.set(1 - k * 0.6, Math.min(1, k * 5), 1 - k * 0.6); m.position.y = (h / 2) * Math.min(1, k * 5); (m.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k); } });
  }

  /** Where a piece was, a fading copy of its puff of smoke. */
  private afterimage(s: Shown, color: string) { this.puff(s.x, s.z, color, 0.5, 0.35); this.later(0.1, () => this.puff(s.x, s.z, color, 0.5, 0.25)); }

  /** Hearts floating from one piece to another. */
  private hearts(a: Shown, b: Shown, color: string) {
    for (let i = 0; i < 3; i++) {
      const sh = new THREE.Shape();
      sh.moveTo(0, -0.1); sh.bezierCurveTo(-0.18, 0.02, -0.08, 0.16, 0, 0.06); sh.bezierCurveTo(0.08, 0.16, 0.18, 0.02, 0, -0.1);
      const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), this.mat(color));
      this.scene.add(m);
      this.fx.push({ obj: m, t: -i * 0.08, life: 0.5, update: (k) => { const q = Math.max(0, k); m.position.set(a.x + (b.x - a.x) * q, 0.7 + Math.sin(q * Math.PI) * 0.5 + i * 0.08, a.z + (b.z - a.z) * q); m.lookAt(this.camera.position); m.scale.setScalar(1 + Math.sin(q * 20) * 0.15); (m.material as THREE.MeshBasicMaterial).opacity = q <= 0 ? 0 : 1 - Math.max(0, q - 0.8) * 5; } });
    }
  }

  /** A big curved blade sweeping across a piece. */
  private crescent(b: Shown, a: Shown, color: string, size: number) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.35 * size, 0.55 * size, 28, 1, 0, Math.PI), this.mat(color, 0.9));
    m.position.set(b.x, 0.6, b.z);
    m.lookAt(a.x, 0.6, a.z);
    this.scene.add(m);
    this.fx.push({ obj: m, t: 0, life: 0.4, update: (k) => { m.rotation.z = -1.2 + k * 2.6; m.scale.setScalar(0.8 + k * 0.4); (m.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k); } });
  }

  /** Spikes thrust up out of the ground round a point. */
  private spikes(x: number, z: number, color: string, n: number, r: number) {
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.4, d = r * (0.6 + Math.random() * 0.5);
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.45, 5), new THREE.MeshLambertMaterial({ color, transparent: true }));
      m.position.set(x + Math.cos(ang) * d, 0, z + Math.sin(ang) * d);
      m.rotation.set(Math.sin(ang) * 0.35, 0, -Math.cos(ang) * 0.35);
      this.scene.add(m);
      this.fx.push({ obj: m, t: -i * 0.02, life: 0.55, update: (k) => { const q = Math.max(0, k); m.position.y = Math.min(1, q * 5) * 0.22 - (q > 0.7 ? (q - 0.7) * 1.2 : 0); (m.material as THREE.MeshLambertMaterial).opacity = q > 0.7 ? 1 - (q - 0.7) / 0.3 : 1; } });
    }
  }

  /** Dark motes pulled into a point: swallowed up. */
  private implode(t: Shown, color: string) {
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), this.mat(color));
      const ang = (i / 10) * Math.PI * 2, y = 0.3 + Math.random() * 0.6;
      this.scene.add(m);
      this.fx.push({ obj: m, t: 0, life: 0.5, update: (k) => { const d = 0.9 * (1 - k); m.position.set(t.x + Math.cos(ang + k * 3) * d, y * (1 - k) + 0.5 * k, t.z + Math.sin(ang + k * 3) * d); } });
    }
    this.later(0.45, () => this.puff(t.x, t.z, '#2b2d33', 0.55, 0.3));
  }

  /** A burst of light: a ball that swells and scatters sparks. */
  private blast(t: Shown, color: string) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), this.mat(color, 0.8));
    m.position.set(t.x, 0.55, t.z);
    this.scene.add(m);
    this.fx.push({ obj: m, t: 0, life: 0.4, update: (k) => { m.scale.setScalar(0.5 + k * 2.4); (m.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k); } });
    this.burst(t.x, t.z, '#ffffff'); this.burst(t.x, t.z, color);
  }

  /** Blue motes spiralling into a piece: mana coming back. */
  private motesIn(s: Shown, color: string) {
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), this.mat(color));
      const ang = (i / 6) * Math.PI * 2;
      this.scene.add(m);
      this.fx.push({ obj: m, t: -i * 0.04, life: 0.5, update: (k) => { const q = Math.max(0, k), d = 0.7 * (1 - q); m.position.set(s.x + Math.cos(ang + q * 4) * d, 0.3 + q * 0.8, s.z + Math.sin(ang + q * 4) * d); (m.material as THREE.MeshBasicMaterial).opacity = q <= 0 ? 0 : 1; } });
    }
  }

  /** Red drops flowing from one piece to another: life drunk. */
  private stream(from: Shown, to: Shown, color: string) {
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), this.mat(color));
      this.scene.add(m);
      this.fx.push({ obj: m, t: -i * 0.05, life: 0.4, update: (k) => { const q = Math.max(0, k); m.position.set(from.x + (to.x - from.x) * q, 0.6 + Math.sin(q * Math.PI) * 0.35, from.z + (to.z - from.z) * q); (m.material as THREE.MeshBasicMaterial).opacity = q <= 0 ? 0 : 1; } });
    }
  }

  /** Streaks whirling round a piece: hurrying. */
  private whirl(s: Shown, color: string) {
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.47, 20, 1, 0, Math.PI * 0.5), this.mat(color, 0.9));
      m.rotation.x = -Math.PI / 2;
      this.scene.add(m);
      this.fx.push({ obj: m, t: 0, life: 0.6, update: (k) => { m.position.set(s.x, 0.2 + i * 0.3 + k * 0.2, s.z); m.rotation.z = k * 10 + i * 2; (m.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k); } });
    }
  }

  /** Ice crystals closing round a piece: frozen. */
  private ice(s: Shown) {
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), this.mat(i % 2 ? '#e8f8ff' : '#9fdcff', 0.85));
      m.scale.set(0.6, 1.6, 0.6);
      this.scene.add(m);
      this.fx.push({ obj: m, t: 0, life: 0.8, update: (k) => { const d = 0.5 - Math.min(1, k * 4) * 0.22; m.position.set(s.x + Math.cos(ang) * d, 0.25 + (i % 2) * 0.25, s.z + Math.sin(ang) * d); (m.material as THREE.MeshBasicMaterial).opacity = k < 0.75 ? 0.85 : (1 - k) * 3.4; } });
    }
  }

  /** A golden arrow rising over a piece: stronger. */
  private arrow(s: Shown, color: string) {
    const g = new THREE.Group();
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.16, 4), this.mat(color));
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.05), this.mat(color));
    head.position.y = 0.16; g.add(head, stem);
    this.scene.add(g);
    this.fx.push({ obj: g, t: 0, life: 0.7, update: (k) => { g.position.set(s.x + 0.25, 0.7 + k * 0.6, s.z); g.children.forEach((c) => (((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 1 - k)); } });
  }

  /* ----------------------------------------------------------- effects */

  /** A basic ranged attack: a bright ball with a white core and a fading trail, flying in an arc. */
  private bolt(a: Shown, b: Shown, color: string) {
    const g = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshBasicMaterial({ color }));
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false }));
    g.add(ball, core, halo);
    this.scene.add(g);
    const from = new THREE.Vector3(a.x, 0.7, a.z), to = new THREE.Vector3(b.x, 0.55, b.z);
    const dist = from.distanceTo(to);
    let lastTrail = 0;
    this.fx.push({ obj: g, t: 0, life: Math.min(0.45, 0.12 + dist * 0.06), update: (k) => {
      g.position.lerpVectors(from, to, k); g.position.y += Math.sin(k * Math.PI) * Math.min(0.6, dist * 0.12);
      if (k - lastTrail > 0.12 && k < 0.95) { lastTrail = k; this.puff(g.position.x, g.position.z, color, g.position.y, 0.08); }
      if (k >= 1) this.burst(b.x, b.z, color);
    } });
  }

  /** A melee hit: a curved white swipe across the target. */
  private slash(b: Shown, a: Shown) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.42, 20, 1, 0, Math.PI * 0.8), new THREE.MeshBasicMaterial({ color: '#fffbe8', transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    m.position.set(b.x, 0.55, b.z);
    m.lookAt(a.x, 0.55, a.z);
    m.rotateZ(Math.random() * Math.PI);
    this.scene.add(m);
    this.fx.push({ obj: m, t: -0.08, life: 0.3, update: (k) => { const q = Math.max(0, k); m.scale.setScalar(0.8 + q * 0.5); (m.material as THREE.MeshBasicMaterial).opacity = q <= 0 ? 0 : 0.95 * (1 - q); } });
  }

  /** A little spray where a shot lands. */
  private burst(x: number, z: number, color: string) {
    for (let k = 0; k < 4; k++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
      const a = (k / 4) * Math.PI * 2 + Math.random();
      this.scene.add(m);
      this.fx.push({ obj: m, t: 0, life: 0.3, update: (q) => { m.position.set(x + Math.cos(a) * q * 0.35, 0.55 + q * 0.2, z + Math.sin(a) * q * 0.35); (m.material as THREE.MeshBasicMaterial).opacity = 1 - q; } });
    }
  }

  private ring(x: number, z: number, color: string, size: number) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.38, 24), new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.1, z);
    this.scene.add(m);
    this.fx.push({ obj: m, t: 0, life: 0.5, update: (k) => { m.scale.setScalar(1 + k * size * 2); (m.material as THREE.MeshBasicMaterial).opacity = 1 - k; } });
  }

  private flash(x: number, z: number, color: string) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.9), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
    m.position.set(x, 0.06, z);
    this.scene.add(m);
    this.fx.push({ obj: m, t: 0, life: 0.45, update: (k) => { (m.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k); } });
  }

  private puff(x: number, z: number, color: string, y = 0.4, r = 0.3) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
    m.position.set(x, y, z);
    this.scene.add(m);
    this.fx.push({ obj: m, t: 0, life: 0.35, update: (k) => { m.scale.setScalar(1 + k * 1.5); (m.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - k); } });
  }

  /** Little rising motes over a piece (healing). */
  private sparkle(x: number, z: number, color: string) {
    for (let k = 0; k < 5; k++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
      const a = (k / 5) * Math.PI * 2, r = 0.22;
      m.position.set(x + Math.cos(a) * r, 0.2, z + Math.sin(a) * r);
      this.scene.add(m);
      this.fx.push({ obj: m, t: -k * 0.06, life: 0.7, update: (q) => { m.position.y = 0.2 + Math.max(0, q) * 0.9; (m.material as THREE.MeshBasicMaterial).opacity = 1 - Math.max(0, q); } });
    }
  }

  private number(key: number, text: string, cls: string) {
    const s = this.shown.get(key);
    if (!s) return;
    const el = document.createElement('div');
    el.className = `pop ${cls}`;
    el.textContent = text;
    this.labels.appendChild(el);
    const v = new THREE.Vector3();
    const dx = (Math.random() - 0.5) * 0.3;
    this.fx.push({ obj: new THREE.Object3D(), t: 0, life: 0.8, update: (k) => {
      v.set(s.x + dx, 1.1 + k * 0.6, s.z).project(this.camera);
      const r = this.canvas.getBoundingClientRect();
      el.style.transform = `translate(${((v.x + 1) / 2) * r.width}px, ${((1 - v.y) / 2) * r.height}px) translate(-50%, -50%)`;
      el.style.opacity = `${k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3}`;
      if (k >= 1) el.remove();
    } });
  }

  /* ------------------------------------------------------------ frame */

  frame(dt: number) {
    // Phones settle their new size a moment after turning: follow the canvas, not just the resize event.
    if (this.canvas.clientWidth !== this.sized.w || this.canvas.clientHeight !== this.sized.h) this.resize();
    const c = this.combat;
    if (c && !c.over) {
      this.acc += dt * this.speed;
      while (this.acc >= DT && !c.over) {
        this.acc -= DT;
        for (const e of step(c)) { this.handle(e); this.onFightEvent?.(e, c); }
        if (c.over) { const end = this.onFightEnd; setTimeout(() => end?.(), 900); }
      }
    }
    const r = this.canvas.getBoundingClientRect();
    const v = new THREE.Vector3();
    const t = performance.now() / 1000;
    for (const [k, s] of this.shown) {
      const f = c ? c.f[k] : null;
      let hop = 0;
      if (s.mk < 1 && s.md > 0) {
        // Stepping: steady across the square, a small hop at the middle.
        s.mk = Math.min(1, s.mk + (dt * this.speed) / s.md);
        const q = s.mk < 0.5 ? 2 * s.mk * s.mk : 1 - (-2 * s.mk + 2) ** 2 / 2;
        s.x = s.fx0 + (s.tx - s.fx0) * q; s.z = s.fz0 + (s.tz - s.fz0) * q;
        hop = Math.sin(s.mk * Math.PI) * 0.12;
      } else {
        const ease = 1 - Math.exp(-dt * 12);
        s.x += (s.tx - s.x) * ease; s.z += (s.tz - s.z) * ease;
      }
      let ox = 0, oz = 0;
      // A melee swing: wind back a touch, then a quick lunge at the target and back.
      if (s.lunge > 0) { const p = 1 - s.lunge; const q = p < 0.25 ? -p * 0.4 : Math.sin(((p - 0.25) / 0.75) * Math.PI) * 0.34; const l = Math.hypot(s.lx, s.lz) || 1; ox = (s.lx / l) * q; oz = (s.lz / l) * q; s.lunge = Math.max(0, s.lunge - dt * 3.2 * this.speed); }
      let squash = 1;
      if (s.kick > 0) { squash = 1 - Math.sin(s.kick * Math.PI) * 0.16; s.kick = Math.max(0, s.kick - dt * 5 * this.speed); }
      // Alive things breathe; a swing stretches up as it lunges (the width gives back what the height takes).
      if (s.dead <= 0) squash *= 1 + Math.sin(t * 2.6 + k * 1.3) * 0.035;
      if (s.lunge > 0) squash *= 1 + Math.sin((1 - s.lunge) * Math.PI) * 0.14;
      const root = s.obj.root;
      root.position.set(s.x + ox, hop, s.z + oz);
      s.obj.figure.scale.y = (s.obj.figure.userData.sy ??= s.obj.figure.scale.y) * squash;
      const sxz = 1 / Math.sqrt(squash);
      s.obj.figure.scale.x = (s.obj.figure.userData.sx ??= s.obj.figure.scale.x) * sxz;
      s.obj.figure.scale.z = (s.obj.figure.userData.sz ??= s.obj.figure.scale.z) * sxz;
      // Turn smoothly to face the way it's fighting.
      const d = ((s.face - root.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      root.rotation.y += d * Math.min(1, dt * 10);
      // A gentle idle bob.
      s.obj.figure.position.y = (s.obj.figure.userData.y0 ??= s.obj.figure.position.y) + Math.abs(Math.sin(t * 2 + k)) * 0.05 + (s.obj.glow.visible ? 0.12 : 0);
      if (s.obj.glow.visible) (s.obj.glow.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(t * 6) * 0.3;
      if (s.dead > 0) {
        s.dead += dt * this.speed;
        root.rotation.z = Math.min(1.4, s.dead * 4);
        root.position.y = -Math.max(0, s.dead - 0.4) * 0.8;
        s.label.style.display = 'none';
        if (s.dead > 1.4) root.visible = false;
      }
      if (f) {
        s.obj.shield.visible = f.alive && f.shield > 1;
        s.obj.stun.visible = f.alive && f.stunT > 0;
        s.obj.stun.rotation.y = t * 4;
        s.obj.stun.scale.setScalar(1.4);
        // Status badges over the bars: only rewritten when they change.
        const top = f.alive ? f.stk.filter((x) => x.n > 0 && x.st.on !== 'low').sort((a, b) => b.n - a.n)[0] : undefined;
        const st = !f.alive ? '' : [f.stunT > 0 ? 'stun' : '', f.silenceT > 0 ? 'silence' : '', f.shield > 1 ? 'shield' : '', f.tauntBy >= 0 ? 'taunt' : '', f.asBuffT > 0 ? 'fast' : '', top ? `stk:${TRAITS[top.t].name}:${top.n}` : ''].filter(Boolean).join(' ');
        if (st !== s.stKey) {
          s.stKey = st;
          const NAME: Record<string, string> = { stun: '기절', silence: '침묵', shield: '보호막', taunt: '도발됨', fast: '빨라짐' };
          s.st.innerHTML = st ? st.split(' ').map((k) => k.startsWith('stk:') ? `<b class="stk">${k.split(':')[1]} ×${k.split(':')[2]}</b>` : `<b class="${k}">${NAME[k]}</b>`).join('') : '';
        }
        // The shield sits right after the health left (squeezing the bar when the two pass the maximum).
        const total = Math.max(f.maxHp, Math.max(0, f.hp) + f.shield);
        const hpW = (Math.max(0, f.hp) / total) * 100;
        s.hp.style.width = `${hpW}%`;
        // A tick every 300 health, like the usual auto-battler bars (so a big pool reads at a glance).
        const seg = `${Math.min(100, (300 / total) * 100).toFixed(2)}%`;
        if (s.label.style.getPropertyValue('--seg') !== seg) s.label.style.setProperty('--seg', seg);
        s.sh.style.left = `${hpW}%`;
        s.sh.style.width = `${(f.shield / total) * 100}%`;
        s.mp.style.width = `${f.maxMana > 500 ? 0 : (f.mana / f.maxMana) * 100}%`;
      } else { s.hp.style.width = '100%'; s.sh.style.width = '0%'; s.mp.style.width = '0%'; s.obj.shield.visible = false; s.obj.stun.visible = false; }
      if (s.label.style.display !== 'none') {
        v.set(root.position.x, 1.18 * s.obj.figure.scale.y + 0.1, root.position.z).project(this.camera);
        s.label.style.transform = `translate(${((v.x + 1) / 2) * r.width}px, ${((1 - v.y) / 2) * r.height}px) translate(-50%, -100%)`;
      }
    }
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i];
      f.t += dt * this.speed;
      const k = Math.min(1, f.t / f.life);
      f.update(k);
      if (k >= 1) { this.scene.remove(f.obj); this.fx.splice(i, 1); }
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** Skip to the end of the fight on screen. */
  finishNow() {
    const c = this.combat;
    if (!c) return;
    while (!c.over) for (const e of step(c)) { if (e.k === 'die') this.handle(e); else if (e.k === 'move' || e.k === 'blink') this.handle(e); this.onFightEvent?.(e, c); }
    const end = this.onFightEnd; this.onFightEnd = null;
    setTimeout(() => end?.(), 300);
  }
}
