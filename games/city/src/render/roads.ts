import * as THREE from 'three';
import { CELL, Ground, N, Road } from '../sim/defs';
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

export class RoadLayer {
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh | null = null;
  private ver = -1;
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

  update(w: World) {
    this.lampMat.emissiveIntensity = shared.uNight.value * 2.2;
    if (this.ver === w.ver.roads) return;
    this.ver = w.ver.roads;
    const b = new Builder();
    const road = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N ? w.road[idx(x, y)] : x < 0 && w.road[idx(0, y)] ? w.road[idx(0, y)] : 0;
    const junction = (x: number, y: number) => {
      if (!road(x, y)) return false;
      return +!!road(x + 1, y) + +!!road(x - 1, y) + +!!road(x, y - 1) + +!!road(x, y + 1) >= 3;
    };
    const m = new THREE.Matrix4();
    let lamps = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const t = w.road[idx(x, y)] as Road;
      if (!t) continue;
      const x0 = x * CELL, z0 = y * CELL, x1 = x0 + CELL, z1 = z0 + CELL, mx = x0 + CELL / 2, mz = z0 + CELL / 2;
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
    this.poles.count = this.lamps.count = lamps;
    this.poles.instanceMatrix.needsUpdate = this.lamps.instanceMatrix.needsUpdate = true;
    if (this.mesh) { this.group.remove(this.mesh); this.mesh.geometry.dispose(); }
    this.mesh = new THREE.Mesh(b.geometry(), this.material);
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);
  }
}
