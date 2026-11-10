import * as THREE from 'three';
import { CELL, ELEVATED_Y, Ground, Level, N, Road } from '../sim/defs';
import { bez, bezLength, bezTan, curveInfo, HALF_WIDTH, KERB, type Curve } from '../sim/curves';
import { altNeighbours, DIAG } from '../sim/graph';
import { idx, type World } from '../sim/world';
import { shared } from './materials';

const SIZE = N * CELL;
const Y = 0.12; // asphalt
const SW = 0.32; // sidewalk top

/** Collects coloured triangles for one merged mesh. */
class Builder {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  private c = new THREE.Color();

  /** Flat quad on the ground plane. */
  quad(x0: number, z0: number, x1: number, z1: number, y: number, hex: number) {
    this.c.setHex(hex);
    const { r, g, b } = this.c;
    this.pos.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0);
    for (let k = 0; k < 6; k++) { this.nor.push(0, 1, 0); this.col.push(r, g, b); }
  }

  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, hex: number) {
    this.quad(x0, z0, x1, z1, y1, hex);
    this.c.setHex(hex);
    const { r, g, b } = this.c;
    const side = (a: number[], n: number[]) => {
      this.pos.push(...a);
      for (let k = 0; k < 6; k++) { this.nor.push(...n); this.col.push(r * 0.85, g * 0.85, b * 0.85); }
    };
    side([x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y0, z1, x1, y1, z1, x0, y1, z1], [0, 0, 1]);
    side([x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y0, z0, x0, y1, z0, x1, y1, z0], [0, 0, -1]);
    side([x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y0, z1, x1, y1, z0, x1, y1, z1], [1, 0, 0]);
    side([x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y0, z0, x0, y1, z1, x0, y1, z0], [-1, 0, 0]);
  }

  /** One triangle; flipped if needed so its normal faces `hint`. */
  tri(a: number[], b: number[], c: number[], hex: number, hint: number[], shade = 1) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { [b, c] = [c, b]; nx = -nx; ny = -ny; nz = -nz; }
    const l = Math.hypot(nx, ny, nz) || 1;
    this.c.setHex(hex);
    const { r, g, b: bl } = this.c;
    this.pos.push(...a, ...b, ...c);
    for (let k = 0; k < 3; k++) { this.nor.push(nx / l, ny / l, nz / l); this.col.push(r * shade, g * shade, bl * shade); }
  }

  /** A flat band from A to B, `wd` wide, rising from height ya to yb. */
  strip(ax: number, az: number, ya: number, bx: number, bz: number, yb: number, wd: number, hex: number) {
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const px = (-(bz - az) / len) * wd / 2, pz = ((bx - ax) / len) * wd / 2;
    const a1 = [ax + px, ya, az + pz], a2 = [ax - px, ya, az - pz], b1 = [bx + px, yb, bz + pz], b2 = [bx - px, yb, bz - pz];
    this.tri(a1, b1, b2, hex, [0, 1, 0]);
    this.tri(a1, b2, a2, hex, [0, 1, 0]);
  }

  /** A solid beam from A to B: top band at ya..yb (in `top` colour), sides and ends `thick` deep. */
  slab(ax: number, az: number, ya: number, bx: number, bz: number, yb: number, wd: number, thick: number, hex: number, top = hex) {
    this.strip(ax, az, ya, bx, bz, yb, wd, top);
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const dx = (bx - ax) / len, dz = (bz - az) / len, px = -dz * wd / 2, pz = dx * wd / 2;
    const T = (x: number, y: number, z: number) => [x, y, z];
    const side = (s: number) => {
      const a = T(ax + px * s, ya, az + pz * s), b = T(bx + px * s, yb, bz + pz * s), c = T(bx + px * s, yb - thick, bz + pz * s), d = T(ax + px * s, ya - thick, az + pz * s);
      const hint = [px * s, 0, pz * s];
      this.tri(a, b, c, hex, hint, 0.82); this.tri(a, c, d, hex, hint, 0.82);
    };
    side(1); side(-1);
    const end = (x: number, z: number, y: number, s: number) => {
      const a = T(x + px, y, z + pz), b = T(x - px, y, z - pz), c = T(x - px, y - thick, z - pz), d = T(x + px, y - thick, z + pz);
      const hint = [dx * s, 0, dz * s];
      this.tri(a, b, c, hex, hint, 0.7); this.tri(a, c, d, hex, hint, 0.7);
    };
    end(ax, az, ya, -1); end(bx, bz, yb, 1);
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    return g;
  }
}

const ASPHALT = { [Road.Street]: 0x5a5d61, [Road.Avenue]: 0x4b4e53 } as const;
const WALK = 0xbdb7ab;
const WHITE = 0xeeeeea;
const YELLOW = 0xf2c53d;
const CONCRETE = 0xb4b1a9;
const PIER = 0x9d9a92;
const BUSLANE = 0x8f4a40;
const BLUE = 0x3a6fd8;
const MOUTH = 0x15171b;

export class RoadLayer {
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh | null = null;
  private ver = '';
  readonly material: THREE.MeshStandardMaterial;
  private uOv = { value: 0 };
  private poles: THREE.InstancedMesh;
  private lamps: THREE.InstancedMesh;
  private lampMat: THREE.MeshStandardMaterial;

  constructor(overlayTex: THREE.Texture) {
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
    const uTex = { value: overlayTex };
    this.material.onBeforeCompile = (sh) => {
      sh.uniforms.uOvTex = uTex;
      sh.uniforms.uOv = this.uOv;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vGP;')
        .replace('#include <project_vertex>', `#include <project_vertex>\nvGP = (modelMatrix * vec4(transformed, 1.0)).xz / ${SIZE.toFixed(1)};`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vGP;\nuniform sampler2D uOvTex;\nuniform float uOv;')
        .replace('#include <color_fragment>', '#include <color_fragment>\nif (uOv > 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(uOvTex, vGP).rgb, 0.8);');
    };
    this.material.customProgramCacheKey = () => 'city-road';

    const pole = new THREE.CylinderGeometry(0.09, 0.12, 6.5, 5).translate(0, 3.25, 0);
    this.poles = new THREE.InstancedMesh(pole, new THREE.MeshStandardMaterial({ color: '#8c9196', roughness: 0.6 }), N * N);
    this.lampMat = new THREE.MeshStandardMaterial({ color: '#d8d8d0', emissive: '#ffcf86', emissiveIntensity: 0 });
    this.lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.45, 0.22, 1.4), this.lampMat, N * N);
    this.poles.count = this.lamps.count = 0;
    this.group.add(this.poles, this.lamps);
  }

  setTrafficOverlay(on: boolean) { this.uOv.value = on ? 1 : 0; }

  /** `bus` names the ground cells bus lines run on; avenues there get a 중앙버스전용차로. */
  update(w: World, bus: { key: string; cells: Set<number> }) {
    this.lampMat.emissiveIntensity = shared.uNight.value * 2.2;
    const ver = `${w.ver.roads}:${bus.key}`;
    if (this.ver === ver) return;
    this.ver = ver;
    const b = new Builder();
    const road = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N ? w.road[idx(x, y)] : x < 0 && w.road[idx(0, y)] ? w.road[idx(0, y)] : 0;
    const junction = (x: number, y: number) => {
      if (!road(x, y)) return false;
      return +!!road(x + 1, y) + +!!road(x - 1, y) + +!!road(x, y - 1) + +!!road(x, y + 1) >= 3;
    };
    const m = new THREE.Matrix4();
    let lamps = 0;
    const owned = curveInfo(w).owned;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const t = w.road[idx(x, y)] as Road;
      if (!t || owned[idx(x, y)]) continue;
      const x0 = x * CELL, z0 = y * CELL, x1 = x0 + CELL, z1 = z0 + CELL, mx = x0 + CELL / 2, mz = z0 + CELL / 2;
      if (w.diag[idx(x, y)]) { diagCell(b, w, x, y, t, road); continue; }
      const E = !!road(x + 1, y), W = !!road(x - 1, y), Nn = !!road(x, y - 1), S = !!road(x, y + 1);
      const water = w.ground[idx(x, y)] === Ground.Water;
      const avenue = t === Road.Avenue;
      const sw = avenue ? 1.4 : 2.0;
      b.quad(x0, z0, x1, z1, Y, ASPHALT[t as 1 | 2]);
      if (water) {
        b.box(x0, -1.6, z0, x1, Y - 0.02, z1, 0x9c9a92);
        if ((x + y) % 2 === 0) b.box(mx - 1, -6, mz - 1, mx + 1, -1.6, mz + 1, 0x8c8a84);
        const rail = (a: number, c: number, d: number, e: number) => b.box(a, Y, c, d, Y + 1.0, e, 0xd6d4ce);
        if (!Nn) rail(x0, z0, x1, z0 + 0.3);
        if (!S) rail(x0, z1 - 0.3, x1, z1);
        if (!W) rail(x0, z0, x0 + 0.3, z1);
        if (!E) rail(x1 - 0.3, z0, x1, z1);
      } else {
        if (!Nn) b.box(x0, 0, z0, x1, SW, z0 + sw, WALK);
        if (!S) b.box(x0, 0, z1 - sw, x1, SW, z1, WALK);
        if (!W) b.box(x0, 0, z0, x0 + sw, SW, z1, WALK);
        if (!E) b.box(x1 - sw, 0, z0, x1, SW, z1, WALK);
        // Corners of a crossing keep a little square of pavement.
        const corner = (cx: number, cz: number, sx: number, sz: number) => b.box(Math.min(cx, cx + sx), 0, Math.min(cz, cz + sz), Math.max(cx, cx + sx), SW, Math.max(cz, cz + sz), WALK);
        if (Nn && W && !road(x - 1, y - 1)) corner(x0, z0, sw, sw);
        if (Nn && E && !road(x + 1, y - 1)) corner(x1, z0, -sw, sw);
        if (S && W && !road(x - 1, y + 1)) corner(x0, z1, sw, -sw);
        if (S && E && !road(x + 1, y + 1)) corner(x1, z1, -sw, -sw);
        // A street light on one kerb of every other cell.
        if ((x + y) % 2 === 0 && lamps < N * N) {
          const side = !Nn ? [mx, z0 + sw * 0.5, 0] : !S ? [mx, z1 - sw * 0.5, Math.PI] : !W ? [x0 + sw * 0.5, mz, Math.PI / 2] : !E ? [x1 - sw * 0.5, mz, -Math.PI / 2] : null;
          if (side) {
            m.makeTranslation(side[0], SW, side[1]);
            this.poles.setMatrixAt(lamps, m);
            const dx = Math.sin(side[2]) * 0.7, dz = Math.cos(side[2]) * 0.7;
            m.makeRotationY(side[2]).setPosition(side[0] + dx, SW + 6.4, side[1] + dz);
            this.lamps.setMatrixAt(lamps, m);
            lamps++;
          }
        }
      }
      // Lane markings on straight pieces; crossings get zebra stripes instead.
      const ly = Y + 0.02;
      const horiz = (E || W) && !Nn && !S;
      const vert = (Nn || S) && !E && !W;
      if (horiz || vert) {
        const along = (a0: number, a1: number, off: number, wdt: number, hex: number) => {
          if (horiz) b.quad(x0 + a0, mz + off - wdt / 2, x0 + a1, mz + off + wdt / 2, ly, hex);
          else b.quad(mx + off - wdt / 2, z0 + a0, mx + off + wdt / 2, z0 + a1, ly, hex);
        };
        const lo = horiz ? junction(x - 1, y) : junction(x, y - 1);
        const hi = horiz ? junction(x + 1, y) : junction(x, y + 1);
        const a0 = lo ? 3 : 0, a1 = hi ? CELL - 3 : CELL;
        if (avenue) {
          if (bus.cells.has(idx(x, y)) && !water) {
            // 중앙버스전용차로: the inner lane each way, red with blue edge lines.
            along(a0, a1, -1.85, 2.9, BUSLANE);
            along(a0, a1, 1.85, 2.9, BUSLANE);
            along(a0, a1, -3.35, 0.16, BLUE);
            along(a0, a1, 3.35, 0.16, BLUE);
          }
          along(a0, a1, -0.22, 0.16, YELLOW);
          along(a0, a1, 0.22, 0.16, YELLOW);
          for (const off of [-2.6, 2.6]) { along(Math.max(a0, 0.6), Math.min(a1, 3.6), off, 0.15, WHITE); along(Math.max(a0, 5.6), Math.min(a1, 8.6), off, 0.15, WHITE); }
        } else {
          if (a0 < 3.5) along(Math.max(a0, 0.8), 3.3, 0, 0.18, WHITE);
          if (a1 > 6.5) along(5.8, Math.min(a1, 8.3), 0, 0.18, WHITE);
        }
        const zebra = (from: number) => {
          for (let k = -3.5; k <= 3.5; k += 1.1) {
            if (horiz) b.quad(x0 + from, mz + k - 0.3, x0 + from + 2.2, mz + k + 0.3, ly, WHITE);
            else b.quad(mx + k - 0.3, z0 + from, mx + k + 0.3, z0 + from + 2.2, ly, WHITE);
          }
        };
        if (lo && !water) zebra(0.4);
        if (hi && !water) zebra(CELL - 2.6);
      }
    }
    // Curved roads: one smooth ribbon each over the cells they laid.
    const lamp = (x: number, z: number, ang: number) => {
      if (lamps >= N * N) return;
      m.makeTranslation(x, SW, z);
      this.poles.setMatrixAt(lamps, m);
      m.makeRotationY(ang).setPosition(x + Math.sin(ang) * 0.7, SW + 6.4, z + Math.cos(ang) * 0.7);
      this.lamps.setMatrixAt(lamps, m);
      lamps++;
    };
    for (const c of w.curves) curveRibbon(b, w, c, owned, lamp);
    // The second layer: flyover decks, and the mouths of underpasses and tunnels.
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (w.roadAlt[idx(x, y)]) altCell(b, w, x, y);
    this.poles.count = this.lamps.count = lamps;
    this.poles.instanceMatrix.needsUpdate = this.lamps.instanceMatrix.needsUpdate = true;
    if (this.mesh) { this.group.remove(this.mesh); this.mesh.geometry.dispose(); }
    this.mesh = new THREE.Mesh(b.geometry(), this.material);
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);
  }
}

type RoadAt = (x: number, y: number) => number;

/** A ground cell with diagonal links: curbed asphalt arms from the centre to each neighbour. */
function diagCell(b: Builder, w: World, x: number, y: number, t: Road, road: RoadAt) {
  const mx = x * CELL + CELL / 2, mz = y * CELL + CELL / 2;
  const W = t === Road.Avenue ? 9 : 7, curb = W + 2.6;
  const arms: { dx: number; dy: number; diag: boolean }[] = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (road(x + dx, y + dy)) arms.push({ dx, dy, diag: false });
  for (const [dx, dy, bit] of DIAG) if (w.diag[idx(x, y)] & bit) arms.push({ dx, dy, diag: true });
  const octagon = (r: number, yy: number, hex: number) => {
    for (let k = 0; k < 8; k++) {
      const a0 = (k / 8) * Math.PI * 2 + Math.PI / 8, a1 = ((k + 1) / 8) * Math.PI * 2 + Math.PI / 8;
      b.tri([mx, yy, mz], [mx + Math.cos(a0) * r, yy, mz + Math.sin(a0) * r], [mx + Math.cos(a1) * r, yy, mz + Math.sin(a1) * r], hex, [0, 1, 0]);
    }
  };
  // Kerb band first, asphalt on top of it.
  octagon(curb / 2, 0.06, WALK);
  for (const a of arms) b.strip(mx, mz, 0.06, mx + a.dx * 5, mz + a.dy * 5, 0.06, a.diag ? curb : W + 0.6, WALK);
  octagon(W / 2, 0.14, ASPHALT[t as 1 | 2]);
  for (const a of arms) b.strip(mx, mz, 0.14, mx + a.dx * 5, mz + a.dy * 5, 0.14, W, ASPHALT[t as 1 | 2]);
  // A straight diagonal gets its centre line.
  const diags = arms.filter((a) => a.diag);
  if (diags.length === 2 && arms.length === 2 && diags[0].dx === -diags[1].dx) {
    for (const a of diags) {
      if (t === Road.Avenue) {
        const px = -a.dy * 0.16, pz = a.dx * 0.16;
        for (const s of [1, -1]) b.strip(mx + px * s, mz + pz * s, 0.16, mx + a.dx * 5 + px * s, mz + a.dy * 5 + pz * s, 0.16, 0.12, YELLOW);
      } else b.strip(mx + a.dx * 1.2, mz + a.dy * 1.2, 0.16, mx + a.dx * 3.6, mz + a.dy * 3.6, 0.16, 0.18, WHITE);
    }
  }
}

/** A cell of the second road layer. */
function altCell(b: Builder, w: World, x: number, y: number) {
  const i = idx(x, y);
  const mx = x * CELL + CELL / 2, mz = y * CELL + CELL / 2;
  const nb = altNeighbours(w, i).map((n) => ({ dx: (n % N) - x, dy: ((n / N) | 0) - y }));
  const level = w.altLevel[i];
  const DW = 9.5, H = ELEVATED_Y;
  const ramp = nb.length <= 1 ? nb[0] ?? { dx: 1, dy: 0 } : null;
  if (level === Level.Elevated) {
    const parapets = (ax: number, az: number, ya: number, bx: number, bz: number, yb: number, dx: number, dy: number) => {
      for (const s of [1, -1]) {
        const ox = -dy * (DW / 2 - 0.2) * s, oz = dx * (DW / 2 - 0.2) * s;
        b.slab(ax + ox, az + oz, ya + 0.95, bx + ox, bz + oz, yb + 0.95, 0.35, 0.95, CONCRETE);
      }
    };
    if (!ramp) {
      for (const n of nb) {
        b.slab(mx, mz, H, mx + n.dx * 5, mz + n.dy * 5, H, DW, 1.3, CONCRETE, ASPHALT[Road.Avenue]);
        parapets(mx, mz, H, mx + n.dx * 5, mz + n.dy * 5, H, n.dx, n.dy);
        b.strip(mx + n.dx * 1.2, mz + n.dy * 1.2, H + 0.03, mx + n.dx * 3.8, mz + n.dy * 3.8, H + 0.03, 0.16, WHITE);
      }
      b.slab(mx - DW / 2, mz, H, mx + DW / 2, mz, H, DW, 1.3, CONCRETE, ASPHALT[Road.Avenue]);
      if ((x + y) % 2 === 0) {
        const base = w.ground[i] === Ground.Water ? -4.5 : 0;
        b.box(mx - 0.9, base, mz - 0.9, mx + 0.9, H - 1.3, mz + 0.9, PIER);
        b.box(mx - DW / 2 + 0.6, H - 2.1, mz - 0.9, mx + DW / 2 - 0.6, H - 1.3, mz + 0.9, PIER);
      }
    } else {
      // The ramp climbs from the ground road toward the deck.
      const ax = mx - ramp.dx * 5, az = mz - ramp.dy * 5, bx = mx + ramp.dx * 5, bz = mz + ramp.dy * 5;
      b.slab(ax, az, 0.14, bx, bz, H, DW, 0.9, CONCRETE, ASPHALT[Road.Avenue]);
      parapets(ax, az, 0.14, bx, bz, H, ramp.dx, ramp.dy);
      b.box(mx + ramp.dx * 2.5 - 0.7, 0, mz + ramp.dy * 2.5 - 0.7, mx + ramp.dx * 2.5 + 0.7, H * 0.7, mz + ramp.dy * 2.5 + 0.7, PIER);
    }
    return;
  }
  if (!ramp) return; // underground: nothing to see between the mouths
  const tunnel = level === Level.Tunnel;
  const ax = mx - ramp.dx * 5, az = mz - ramp.dy * 5, bx = mx + ramp.dx * 5, bz = mz + ramp.dy * 5;
  b.strip(ax, az, 0.15, bx, bz, 0.15, DW, 0x3f4246);
  for (const s of [1, -1]) {
    const ox = -ramp.dy * (DW / 2 + 0.3) * s, oz = ramp.dx * (DW / 2 + 0.3) * s;
    b.slab(ax + ox, az + oz, 1.1, bx + ox, bz + oz, 1.1, 0.6, 1.1, CONCRETE);
  }
  // The portal: a concrete frame (stone for a mountain tunnel) around a dark mouth.
  const px = mx + ramp.dx * 4.3, pz = mz + ramp.dy * 4.3, ox = -ramp.dy, oz = ramp.dx;
  const frameH = tunnel ? 7 : 5.6, half = DW / 2 + 1.4;
  b.slab(px - ox * half, pz - oz * half, frameH, px + ox * half, pz + oz * half, frameH, 1.4, frameH, tunnel ? 0x8f8b82 : CONCRETE);
  const mh = frameH - 1.4, mi = DW / 2 - 0.1;
  b.slab(px - ramp.dx * 0.1 - ox * mi, pz - ramp.dy * 0.1 - oz * mi, mh, px - ramp.dx * 0.1 + ox * mi, pz - ramp.dy * 0.1 + oz * mi, mh, 1.6, mh, MOUTH);
}

/**
 * A curve's road surface: pavement, asphalt and markings swept along the
 * Bézier, drawn only where the curve laid its own cells (its ends and any
 * crossings belong to the grid roads it joins). Over water it becomes a deck
 * with rails and piers.
 */
function curveRibbon(b: Builder, w: World, c: Curve, owned: Uint8Array, lamp: (x: number, z: number, ang: number) => void) {
  const hw = HALF_WIDTH[c.t as 1 | 2];
  const len = bezLength(c);
  const n = Math.max(4, Math.ceil(len / 1.2));
  const P: { x: number; z: number; nx: number; nz: number; s: number }[] = [];
  let s = 0;
  for (let k = 0; k <= n; k++) {
    const p = bez(c, k / n), t = bezTan(c, k / n);
    if (k) s += Math.hypot(p.x - P[k - 1].x, p.z - P[k - 1].z);
    P.push({ x: p.x, z: p.z, nx: -t.z, nz: t.x, s });
  }
  const cellOfPt = (x: number, z: number) => Math.floor(z / CELL) * N + Math.floor(x / CELL);
  const seg: { on: boolean; water: boolean }[] = [];
  for (let k = 0; k < n; k++) {
    const mx = (P[k].x + P[k + 1].x) / 2, mz = (P[k].z + P[k + 1].z) / 2;
    const i = cellOfPt(mx, mz);
    // Draw everywhere except over grid road cells the curve meets (its ends, crossings).
    seg.push({ on: i >= 0 && i < N * N && (owned[i] === 1 || !w.road[i]), water: i >= 0 && i < N * N && w.ground[i] === Ground.Water });
  }
  const at = (k: number, off: number, y: number) => [P[k].x + P[k].nx * off, y, P[k].z + P[k].nz * off];
  const band = (k: number, o0: number, o1: number, y: number, hex: number) => {
    const a = at(k, o0, y), bb = at(k, o1, y), cc = at(k + 1, o1, y), d = at(k + 1, o0, y);
    b.tri(a, bb, cc, hex, [0, 1, 0]);
    b.tri(a, cc, d, hex, [0, 1, 0]);
  };
  const wall = (k: number, off: number, y0: number, y1: number, hex: number, out: number) => {
    const a = at(k, off, y0), bb = at(k + 1, off, y0), cc = at(k + 1, off, y1), d = at(k, off, y1);
    const hint = [P[k].nx * out, 0, P[k].nz * out];
    b.tri(a, bb, cc, hex, hint, 0.82);
    b.tri(a, cc, d, hex, hint, 0.82);
  };
  const avenue = c.t === Road.Avenue;
  let nextLamp = 6, side = 1, nextPier = 4;
  for (let k = 0; k < n; k++) {
    if (!seg[k].on) continue;
    const ss = (P[k].s + P[k + 1].s) / 2;
    if (seg[k].water) {
      band(k, -hw - 0.6, hw + 0.6, 0.12, 0x9c9a92);
      for (const sd of [1, -1]) {
        wall(k, sd * (hw + 0.6), -1.6, 0.12, 0x9c9a92, sd);
        band(k, sd * (hw + 0.25), sd * (hw + 0.6), 1.0, 0xd6d4ce);
        wall(k, sd * (hw + 0.25), 0.12, 1.0, 0xd6d4ce, -sd);
      }
      if (ss > nextPier) {
        nextPier = ss + 14;
        const p = P[k];
        b.box(p.x - 1, -6, p.z - 1, p.x + 1, -1.6, p.z + 1, 0x8c8a84);
      }
    } else {
      band(k, -hw - KERB, -hw, 0.26, WALK);
      band(k, hw, hw + KERB, 0.26, WALK);
      for (const sd of [1, -1]) wall(k, sd * (hw + KERB), 0, 0.26, WALK, sd);
      if (ss > nextLamp) {
        nextLamp = ss + 22;
        const p = P[k], off = side * (hw + KERB * 0.5);
        // The lamp arm reaches over the road: toward the centre line.
        lamp(p.x + p.nx * off, p.z + p.nz * off, Math.atan2(-p.nx * side, -p.nz * side));
        side = -side;
      }
    }
    band(k, -hw, hw, 0.16, ASPHALT[c.t as 1 | 2]);
    // Markings: dashed white for a street; double yellow and dashed lanes on an avenue.
    const dash = (ss % 6) < 3;
    if (avenue) {
      band(k, -0.3, -0.16, 0.18, YELLOW);
      band(k, 0.16, 0.3, 0.18, YELLOW);
      if (dash) { band(k, -2.65, -2.5, 0.18, WHITE); band(k, 2.5, 2.65, 0.18, WHITE); }
    } else if (dash) band(k, -0.09, 0.09, 0.18, WHITE);
  }
}
