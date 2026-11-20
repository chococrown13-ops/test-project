import * as THREE from 'three';
import { COLS, type Combat, DT, type Ev, HALF, ROWS, step } from '../sim/combat';
import type { Piece, Player } from '../sim/game';
import { BENCH } from '../sim/game';
import { BY_ID } from '../sim/units';
import { buildPiece, type PieceObj } from './pieces';

/**
 * The table: a 7 x 8 board of paper-and-wood squares, the bench along the
 * near edge, the pieces, and the fight played out step by step with strikes,
 * thrown fire, numbers and falls.
 */

const BENCH_Z = 5.05;
const benchX = (i: number) => (i - (BENCH - 1) / 2) * 0.98;
const wx = (x: number) => x - (COLS - 1) / 2;
const wz = (y: number) => y - (ROWS - 1) / 2;

interface Shown {
  obj: PieceObj; label: HTMLDivElement; hp: HTMLElement; mp: HTMLElement; sh: HTMLElement;
  x: number; z: number; tx: number; tz: number;
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
  private flip = false;
  private acc = 0;
  speed = 1.5;
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
    const table = new THREE.Mesh(new THREE.BoxGeometry(14, 0.4, 15), new THREE.MeshStandardMaterial({ color: '#7a5233', roughness: 0.85 }));
    table.position.set(0, -0.32, 0.6);
    table.receiveShadow = true;
    this.scene.add(table);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(COLS + 0.5, 0.18, ROWS + 0.5), new THREE.MeshStandardMaterial({ color: '#4a3020', roughness: 0.7 }));
    frame.position.y = -0.1; frame.receiveShadow = true;
    this.scene.add(frame);
    const tileG = new THREE.BoxGeometry(0.96, 0.06, 0.96);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const mine = y >= HALF, light = (x + y) % 2 === 0;
      const t = new THREE.Mesh(tileG, new THREE.MeshStandardMaterial({ color: mine ? (light ? '#efe4c8' : '#e2d3b0') : (light ? '#e7dccb' : '#d6c8b3'), roughness: 0.9 }));
      t.position.set(wx(x), 0, wz(y));
      t.receiveShadow = true;
      this.scene.add(t);
      this.tiles.push(t);
    }
    // The 강 (river) line across the middle, as on a 장기판.
    const river = new THREE.Mesh(new THREE.BoxGeometry(COLS, 0.065, 0.06), new THREE.MeshStandardMaterial({ color: '#7b2d26' }));
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
    this.hiTile = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.08, 0.98), new THREE.MeshBasicMaterial({ color: '#f2c94c', transparent: true, opacity: 0.55, depthWrite: false }));
    this.hiTile.visible = false;
    this.scene.add(this.hiTile);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private insets = { top: 0, bottom: 0 };
  /** Screen space the HUD covers at the top and bottom; the table is fitted between. */
  setInsets(top: number, bottom: number) {
    if (Math.abs(top - this.insets.top) < 1 && Math.abs(bottom - this.insets.bottom) < 1) return;
    this.insets = { top, bottom };
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    const free = Math.max(120, h - this.insets.top - this.insets.bottom);
    this.camera.aspect = w / free;
    // Draw a virtual screen the height of the free band, shifted down below the top bar.
    this.camera.setViewOffset(w, free, 0, -this.insets.top, w, h);
    // Fit the board, the bench and the far pieces, then centre them.
    const pts = [
      [-3.8, 0, -4.2], [3.8, 0, -4.2], [-3.6, 1.3, -3.6], [3.6, 1.3, -3.6],
      [-4.8, 0, BENCH_Z + 0.6], [4.8, 0, BENCH_Z + 0.6], [-4.8, 1.1, BENCH_Z], [4.8, 1.1, BENCH_Z],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
    // Tall screens look down more steeply, so the board fills the height.
    const dir = (w / free < 0.85 ? new THREE.Vector3(0, 0.93, 0.37) : new THREE.Vector3(0, 0.8, 0.6)).normalize();
    const look = new THREE.Vector3(0, 0, 0.8);
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
  }

  /* ---------------------------------------------------------- pieces */

  private make(key: number, id: string, star: number, enemy: boolean): Shown {
    const obj = buildPiece(BY_ID[id], star, enemy);
    obj.root.userData.key = key;
    obj.root.traverse((o) => { o.userData.key = key; });
    this.scene.add(obj.root);
    const label = document.createElement('div');
    label.className = `plabel${enemy ? ' enemy' : ''}`;
    label.innerHTML = `<span class="stars s${star}">${'★'.repeat(star)}</span><i class="bar hp"><b></b><u></u></i><i class="bar mp"><b></b></i>`;
    this.labels.appendChild(label);
    const [hp, sh] = [label.querySelector('.hp b') as HTMLElement, label.querySelector('.hp u') as HTMLElement];
    return { obj, label, hp, sh, mp: label.querySelector('.mp b') as HTMLElement, x: 0, z: 0, tx: 0, tz: 0, lunge: 0, lx: 0, lz: 0, dead: 0, side: enemy ? 1 : 0, face: enemy ? 0 : Math.PI };
  }

  private drop(key: number) {
    const s = this.shown.get(key);
    if (!s) return;
    this.scene.remove(s.obj.root);
    s.label.remove();
    this.shown.delete(key);
  }

  clearPieces() { for (const k of [...this.shown.keys()]) this.drop(k); }

  /** Between fights: the player's board and bench, keyed by piece uid. */
  showPrep(p: Player, dragging = -1) {
    this.combat = null;
    this.enemyHalf.visible = true;
    const want = new Map<number, { piece: Piece; x: number; z: number }>();
    p.board.forEach((u) => want.set(u.uid, { piece: u, x: wx(u.c), z: wz(HALF + u.r) }));
    p.bench.forEach((u, i) => { if (u) want.set(u.uid, { piece: u, x: benchX(i), z: BENCH_Z }); });
    for (const [k, s] of this.shown) {
      const w = want.get(k);
      if (!w || s.obj.root.userData.star !== w.piece.star || s.side !== 0) this.drop(k);
    }
    for (const [k, w] of want) {
      let s = this.shown.get(k);
      if (!s) {
        s = this.make(k, w.piece.id, w.piece.star, false);
        s.obj.root.userData.star = w.piece.star;
        s.x = w.x; s.z = w.z;
        this.shown.set(k, s);
      }
      if (k !== dragging) { s.tx = w.x; s.tz = w.z; }
      s.label.classList.add('prep');
      s.dead = 0; s.face = Math.PI;
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
  pick(cx: number, cy: number): number | null {
    if (this.combat) return null;
    this.ray.setFromCamera(this.ndc(cx, cy), this.camera);
    const objs = [...this.shown.values()].map((s) => s.obj.root);
    const hit = this.ray.intersectObjects(objs, true)[0];
    if (hit && hit.object.userData.key !== undefined) return hit.object.userData.key as number;
    // A forgiving second try: the nearest piece to where the pointer meets the table.
    const g = this.ground(cx, cy);
    if (!g) return null;
    let best: number | null = null, bd = 0.5;
    for (const [k, s] of this.shown) { const d = Math.hypot(s.x - g.x, s.z - g.z); if (d < bd) { bd = d; best = k; } }
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
      const s = this.make(f.key, f.def.id, f.star, (f.side === 1) !== flip);
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
      case 'move': { const p = this.pos(e.x, e.y); S(e.a).tx = p.x; S(e.a).tz = p.z; break; }
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
        if (e.ranged) this.shot(a, b, BY_ID[c.f[e.a].def.id].look.body === '#2f5d62' ? '#7fd1d9' : '#f4efe2', 0.07);
        else { a.lunge = 1; a.lx = b.x - a.x; a.lz = b.z - a.z; }
        break;
      }
      case 'hit': this.number(e.b, `${e.v}`, e.crit ? 'crit' : e.magic ? 'magic' : ''); break;
      case 'miss': this.number(e.b, '빗나감', 'miss'); break;
      case 'heal': this.number(e.b, `+${e.v}`, 'heal'); break;
      case 'cast': this.castFx(e); break;
      case 'die': S(e.a).dead = 0.001; break;
    }
  }

  private castFx(e: Extract<Ev, { k: 'cast' }>) {
    const a = this.shown.get(e.a)!, b = e.b !== undefined ? this.shown.get(e.b) : undefined;
    const colour: Record<string, string> = {
      bonk: '#f2c94c', foxfire: '#6ec6ff', snipe: '#f4efe2', drag: '#4fa3b5', guardup: '#cfe8ff', taunt: '#e0a96d', boulder: '#9b8f80', blink: '#b9a7d9',
      wave: '#4fa3b5', heal: '#7ddc8a', roar: '#f29b30', judge: '#ffd84a', ttukttak: '#f2c94c', charm: '#ff8fb1', reap: '#3b3b46', shell: '#9fd3a8',
      mountain: '#c7f0c2', devour: '#8c9099', beam: '#7fd1d9',
    };
    const col = colour[e.skill] ?? '#ffffff';
    this.ring(a.x, a.z, col, 0.9);
    if (b && b !== a && ['foxfire', 'snipe', 'charm', 'reap', 'heal', 'boulder', 'mountain'].includes(e.skill)) this.shot(a, b, col, 0.14);
    if (e.cells) for (const [x, y] of e.cells) { const p = this.pos(x, y); this.flash(p.x, p.z, col); }
    if (b && (e.skill === 'bonk' || e.skill === 'charm' || e.skill === 'drag')) this.ring(b.x, b.z, col, 0.6);
  }

  /* ----------------------------------------------------------- effects */

  private shot(a: Shown, b: Shown, color: string, r: number) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), new THREE.MeshBasicMaterial({ color }));
    this.scene.add(m);
    const from = new THREE.Vector3(a.x, 0.6, a.z);
    this.fx.push({ obj: m, t: 0, life: 0.25, update: (k) => { m.position.lerpVectors(from, new THREE.Vector3(b.x, 0.6, b.z), k); m.position.y += Math.sin(k * Math.PI) * 0.4; } });
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

  private puff(x: number, z: number, color: string) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
    m.position.set(x, 0.4, z);
    this.scene.add(m);
    this.fx.push({ obj: m, t: 0, life: 0.35, update: (k) => { m.scale.setScalar(1 + k * 1.5); (m.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - k); } });
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
      const ease = 1 - Math.exp(-dt * 12);
      s.x += (s.tx - s.x) * ease; s.z += (s.tz - s.z) * ease;
      let ox = 0, oz = 0;
      if (s.lunge > 0) { const q = Math.sin(s.lunge * Math.PI) * 0.28; const l = Math.hypot(s.lx, s.lz) || 1; ox = (s.lx / l) * q; oz = (s.lz / l) * q; s.lunge = Math.max(0, s.lunge - dt * 4 * this.speed); }
      const root = s.obj.root;
      root.position.set(s.x + ox, 0, s.z + oz);
      // Turn smoothly to face the way it's fighting.
      const d = ((s.face - root.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      root.rotation.y += d * Math.min(1, dt * 10);
      // A gentle idle bob.
      s.obj.figure.position.y = 0.1 + Math.abs(Math.sin(t * 2 + k)) * 0.03;
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
        s.hp.style.width = `${(Math.max(0, f.hp) / f.maxHp) * 100}%`;
        s.sh.style.width = `${Math.min(100, (f.shield / f.maxHp) * 100)}%`;
        s.mp.style.width = `${f.maxMana > 500 ? 0 : (f.mana / f.maxMana) * 100}%`;
      } else { s.hp.style.width = '100%'; s.sh.style.width = '0%'; s.mp.style.width = '0%'; s.obj.shield.visible = false; s.obj.stun.visible = false; }
      if (s.label.style.display !== 'none') {
        v.set(root.position.x, 1.25 * root.children[2].scale.y, root.position.z).project(this.camera);
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
