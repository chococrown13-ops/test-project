import * as THREE from 'three';
import { CELL, N } from '../sim/defs';

const SIZE = N * CELL;

/**
 * City-builder camera: orbit around a point on the ground. Distance, yaw and
 * pitch ease toward their targets so every input feels smooth.
 */
export class CityCamera {
  readonly cam: THREE.PerspectiveCamera;
  target = new THREE.Vector3(SIZE * 0.3, 0, SIZE * 0.35);
  dist = 260;
  yaw = -0.6;
  pitch = 0.82;
  private goal = { x: this.target.x, z: this.target.z, dist: this.dist, yaw: this.yaw, pitch: this.pitch };
  keys = new Set<string>();

  constructor(aspect: number) {
    this.cam = new THREE.PerspectiveCamera(42, aspect, 2, 6000);
  }

  focus(x: number, z: number) { this.goal.x = x; this.goal.z = z; }

  /** Pan by a screen-space delta in pixels. */
  panPixels(dx: number, dy: number, viewH: number) {
    const k = (this.goal.dist * 1.1) / viewH;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    // Screen right is (cos, -sin) on the ground; screen up is away from the camera.
    this.goal.x += (-dx * c - dy * s) * k;
    this.goal.z += (dx * s - dy * c) * k;
    this.clamp();
  }

  zoom(factor: number) {
    this.goal.dist = Math.min(1100, Math.max(35, this.goal.dist * factor));
  }

  rotate(dyaw: number, dpitch: number) {
    this.goal.yaw += dyaw;
    this.goal.pitch = Math.min(1.45, Math.max(0.28, this.goal.pitch + dpitch));
  }

  private clamp() {
    this.goal.x = Math.min(SIZE, Math.max(0, this.goal.x));
    this.goal.z = Math.min(SIZE, Math.max(0, this.goal.z));
  }

  update(dt: number) {
    const k = this.keys;
    const sp = this.goal.dist * 1.2 * dt;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    let fx = 0, fz = 0;
    if (k.has('w') || k.has('arrowup')) { fx -= s; fz -= c; }
    if (k.has('s') || k.has('arrowdown')) { fx += s; fz += c; }
    if (k.has('a') || k.has('arrowleft')) { fx -= c; fz += s; }
    if (k.has('d') || k.has('arrowright')) { fx += c; fz -= s; }
    if (fx || fz) { this.goal.x += fx * sp; this.goal.z += fz * sp; this.clamp(); }
    if (k.has('q')) this.goal.yaw += dt * 1.4;
    if (k.has('e')) this.goal.yaw -= dt * 1.4;
    if (k.has('r') || k.has('=')) this.zoom(1 - dt * 1.5);
    if (k.has('f') || k.has('-')) this.zoom(1 + dt * 1.5);
    const e = 1 - Math.exp(-dt * 10);
    this.target.x += (this.goal.x - this.target.x) * e;
    this.target.z += (this.goal.z - this.target.z) * e;
    this.dist += (this.goal.dist - this.dist) * e;
    this.yaw += (this.goal.yaw - this.yaw) * e;
    this.pitch += (this.goal.pitch - this.pitch) * e;
    const h = Math.sin(this.pitch) * this.dist, r = Math.cos(this.pitch) * this.dist;
    this.cam.position.set(this.target.x + Math.sin(this.yaw) * r, h, this.target.z + Math.cos(this.yaw) * r);
    this.cam.lookAt(this.target);
  }
}
