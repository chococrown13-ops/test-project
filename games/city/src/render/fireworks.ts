import * as THREE from 'three';
import type { World } from '../sim/world';

/**
 * 불꽃축제: bursts of sparks over the water at night while the festival is
 * on. A pool of points; each burst throws its sparks outward, they fall
 * and fade (additive, so fading to black is fading out).
 */
const MAX = 2400, PER = 80, LIFE = 2.4;
const PALETTE = ['#ffd166', '#ef476f', '#06d6a0', '#7cc6fe', '#ffffff', '#ff9f1c', '#c77dff'];

export class Fireworks {
  readonly group = new THREE.Group();
  private pos = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private base = new Float32Array(MAX * 3);
  private age = new Float32Array(MAX).fill(LIFE);
  private geo = new THREE.BufferGeometry();
  private next = 0;
  private clock = 0;
  private cursor = 0;

  constructor() {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({ size: 3.2, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false, toneMapped: false });
    const pts = new THREE.Points(this.geo, mat);
    pts.frustumCulled = false;
    this.group.add(pts);
  }

  update(w: World, dt: number, night: number) {
    const f = w.festival;
    const on = !!f && f.kind === 'fireworks' && night > 0.5;
    this.clock += dt;
    if (on && this.clock >= this.next) {
      this.next = this.clock + 0.35 + Math.random() * 0.6;
      const c = new THREE.Color(PALETTE[(Math.random() * PALETTE.length) | 0]);
      const ox = f!.x + (Math.random() - 0.5) * 160, oy = 90 + Math.random() * 70, oz = f!.z + (Math.random() - 0.5) * 160;
      const speed = 18 + Math.random() * 14;
      for (let k = 0; k < PER; k++) {
        const i = this.cursor; this.cursor = (this.cursor + 1) % MAX;
        const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
        this.pos.set([ox, oy, oz], i * 3);
        this.vel.set([s * Math.cos(a) * speed, u * speed, s * Math.sin(a) * speed], i * 3);
        // Kept below full brightness so the colour survives the additive blend and the bloom.
        this.base.set([c.r * 0.55, c.g * 0.55, c.b * 0.55], i * 3);
        this.age[i] = 0;
      }
    }
    let alive = false;
    for (let i = 0; i < MAX; i++) {
      if (this.age[i] >= LIFE) { this.col[i * 3] = this.col[i * 3 + 1] = this.col[i * 3 + 2] = 0; continue; }
      alive = true;
      this.age[i] += dt;
      this.vel[i * 3 + 1] -= 9 * dt;
      for (let k = 0; k < 3; k++) { this.vel[i * 3 + k] *= 1 - 0.9 * dt; this.pos[i * 3 + k] += this.vel[i * 3 + k] * dt; }
      const fade = Math.max(0, 1 - this.age[i] / LIFE) ** 1.5;
      for (let k = 0; k < 3; k++) this.col[i * 3 + k] = this.base[i * 3 + k] * fade;
    }
    this.group.visible = alive;
    if (alive) { (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true; (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true; }
  }

  /** Whether sparks are in the air (the scene keeps drawing while they are). */
  get active() { return this.group.visible; }
}
