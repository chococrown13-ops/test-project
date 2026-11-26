import * as THREE from 'three';
import { CELL, N } from '../sim/defs';
import { snowingNow } from '../sim/hazards';
import { bh, bw, type Building, type World } from '../sim/world';
import { shared } from './materials';

const MAX_FIRES = 24;
const FLAMES = 6;
const PUFFS = 14;
const FLAKES = 2600;
/** The box of air round the camera's target that the snow falls through, metres. */
const SNOW_BOX = 520, SNOW_H = 260;

/**
 * What the weather and the fires look like: flames licking round a burning building with grey
 * smoke rising off it, snow lying on the roads (a texture the road shader reads), and flakes
 * drifting down round the camera while a 한파 lasts.
 */
/** A soft round flake. */
function flakeTex(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!, gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export class HazardLayer {
  readonly group = new THREE.Group();
  private flames: THREE.InstancedMesh;
  private smoke: THREE.InstancedMesh;
  private flakes: THREE.Points;
  private flakeV: Float32Array;
  private snowDay = -1;
  private snowSum = -1;
  private t = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3();
  heightAt: (x: number, z: number) => number = () => 0;

  constructor() {
    const flame = new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0);
    this.flames = new THREE.InstancedMesh(flame, new THREE.MeshBasicMaterial({ color: '#ff8a2a', transparent: true, opacity: 0.9, depthWrite: false }), MAX_FIRES * FLAMES);
    this.flames.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FIRES * FLAMES * 3), 3);
    const puff = new THREE.IcosahedronGeometry(1, 0);
    this.smoke = new THREE.InstancedMesh(puff, new THREE.MeshStandardMaterial({ color: '#5d5f63', roughness: 1, transparent: true, opacity: 0.55, depthWrite: false, flatShading: true }), MAX_FIRES * PUFFS);
    this.flames.frustumCulled = this.smoke.frustumCulled = false;
    this.flames.count = this.smoke.count = 0;

    const pos = new Float32Array(FLAKES * 3);
    this.flakeV = new Float32Array(FLAKES);
    for (let k = 0; k < FLAKES; k++) {
      pos[k * 3] = (Math.random() - 0.5) * SNOW_BOX;
      pos[k * 3 + 1] = Math.random() * SNOW_H;
      pos[k * 3 + 2] = (Math.random() - 0.5) * SNOW_BOX;
      this.flakeV[k] = 6 + Math.random() * 6;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.flakes = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 1.3, map: flakeTex(), alphaTest: 0.05, transparent: true, opacity: 0.9, depthWrite: false }));
    this.flakes.frustumCulled = false;
    this.flakes.visible = false;
    this.group.add(this.flames, this.smoke, this.flakes);
  }

  update(w: World, dt: number, target: THREE.Vector3) {
    this.t += dt;
    this.updateFires(w);
    this.updateRoadSnow(w);
    // Falling snow, round wherever the camera looks.
    const on = snowingNow(w);
    this.flakes.visible = on;
    if (on) {
      this.flakes.position.set(target.x, 0, target.z);
      const p = this.flakes.geometry.attributes.position as THREE.BufferAttribute, a = p.array as Float32Array;
      for (let k = 0; k < FLAKES; k++) {
        a[k * 3 + 1] -= this.flakeV[k] * dt;
        a[k * 3] += Math.sin(this.t * 0.8 + k) * dt * 1.5;
        if (a[k * 3 + 1] < 0) a[k * 3 + 1] += SNOW_H;
      }
      p.needsUpdate = true;
    }
  }

  private updateRoadSnow(w: World) {
    if (!w.snow) return;
    if (w.day === this.snowDay) return;
    this.snowDay = w.day;
    let sum = 0;
    for (let i = 0; i < w.snow.length; i += 7) sum += w.snow[i];
    if (sum === 0 && this.snowSum === 0) return;
    this.snowSum = sum;
    const tex = shared.uRoadSnow.value, d = tex.image.data as Uint8Array;
    for (let i = 0; i < N * N; i++) d[i] = Math.min(255, w.snow[i] * 2.55);
    tex.needsUpdate = true;
  }

  private updateFires(w: World) {
    const burning: Building[] = [];
    w.buildings.forEach((b) => { if (b.burn && burning.length < MAX_FIRES) burning.push(b); });
    let nf = 0, ns = 0;
    const col = new THREE.Color();
    for (const b of burning) {
      const W = bw(b) * CELL, H = bh(b) * CELL;
      const cx = b.x * CELL + W / 2, cz = b.y * CELL + H / 2;
      const top = this.heightAt(cx, cz) + Math.max(3, b.floors * 3) + 0.5;
      const seed = b.id * 1.37;
      for (let k = 0; k < FLAMES; k++) {
        const ang = seed + k * 2.39, r = (k % 3) * 0.22 * Math.min(W, H);
        const fl = 0.75 + 0.35 * Math.sin(this.t * (9 + k) + seed * k);
        const h = (3 + (k % 2) * 2.5) * fl, rad = 1.3 + (k % 3) * 0.4;
        this.v.set(cx + Math.cos(ang) * r, top - 1.2, cz + Math.sin(ang) * r);
        this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.t * 2 + k);
        this.sc.set(rad, h, rad);
        this.m.compose(this.v, this.q, this.sc);
        this.flames.setMatrixAt(nf, this.m);
        col.set(k % 2 ? '#ffd23a' : '#ff6a1f');
        this.flames.setColorAt(nf, col);
        nf++;
      }
      for (let k = 0; k < PUFFS; k++) {
        const life = (this.t * 0.35 + k / PUFFS + seed) % 1;
        const s = 1.4 + life * 4.5;
        this.v.set(cx + Math.sin(seed + k * 1.7) * 2 + life * 7, top + 2 + life * 26, cz + Math.cos(seed + k * 2.1) * 2 + life * 3);
        this.q.setFromAxisAngle(this.v.clone().normalize(), k);
        this.sc.set(s, s * 0.85, s);
        this.m.compose(this.v, this.q, this.sc);
        this.smoke.setMatrixAt(ns, this.m);
        ns++;
      }
    }
    this.flames.count = nf;
    this.smoke.count = ns;
    if (nf) { this.flames.instanceMatrix.needsUpdate = true; if (this.flames.instanceColor) this.flames.instanceColor.needsUpdate = true; }
    if (ns) this.smoke.instanceMatrix.needsUpdate = true;
  }
}
