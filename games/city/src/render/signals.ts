import * as THREE from 'three';
import { CELL, N, Road } from '../sim/defs';
import { HALF_WIDTH, KERB_W } from '../sim/curves';
import { NN } from '../sim/graph';
import { Light, lightFor, signalCells } from '../sim/signals';
import type { World } from '../sim/world';

/**
 * The traffic lights at signalled junctions: a pole on each corner with a
 * head of three lamps. Two opposite corners face east-west traffic, the
 * other two north-south; the lit lamp follows the simulation's lights.
 */

const MAX = 4000;
const LIT = [new THREE.Color('#3be37a'), new THREE.Color('#ffc233'), new THREE.Color('#ff3b2f')];
const DIM = new THREE.Color('#2a2c30');

export class SignalLayer {
  readonly group = new THREE.Group();
  private poles: THREE.InstancedMesh;
  private heads: THREE.InstancedMesh;
  /** Lamps: three per head (green, amber, red from the bottom). */
  private lamps: THREE.InstancedMesh;
  private axes: number[] = [];
  private key = '';

  constructor() {
    const pole = new THREE.CylinderGeometry(0.1, 0.13, 4.4, 6).translate(0, 2.2, 0);
    const head = new THREE.BoxGeometry(0.5, 1.35, 0.5).translate(0, 4.55, 0);
    const lamp = new THREE.SphereGeometry(0.17, 10, 8);
    this.poles = new THREE.InstancedMesh(pole, new THREE.MeshStandardMaterial({ color: '#8a8f96', roughness: 0.6, metalness: 0.4 }), MAX);
    this.heads = new THREE.InstancedMesh(head, new THREE.MeshStandardMaterial({ color: '#1f2226', roughness: 0.7 }), MAX);
    this.lamps = new THREE.InstancedMesh(lamp, new THREE.MeshBasicMaterial({ toneMapped: false }), MAX * 3);
    for (const m of [this.poles, this.heads, this.lamps]) { m.count = 0; m.frustumCulled = false; this.group.add(m); }
    this.poles.castShadow = true; this.heads.castShadow = true;
    this.lamps.setColorAt(0, DIM);
  }

  private rebuild(w: World) {
    const at = signalCells(w);
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    let n = 0;
    this.axes = [];
    for (let c = 0; c < NN && n < MAX - 4; c++) {
      if (!at[c]) continue;
      const t = (w.road[c] === Road.Avenue ? Road.Avenue : Road.Street) as 1 | 2;
      const h = HALF_WIDTH[t] + KERB_W[t] * 0.5;
      const cx = (c % N) * CELL + CELL / 2, cz = ((c / N) | 0) * CELL + CELL / 2;
      // Corners (+,+) and (-,-) for east-west traffic, the other two for north-south.
      const x = c % N, y = (c / N) | 0;
      // Where a diagonal comes in, the junction is one wide square: its lights stand at the cells around it, not in it.
      if (w.diag[c] && [c - 1, c + 1, c - N, c + N].some((m) => at[m] && !w.diag[m])) continue;
      for (const [sx, sz, axis] of [[1, 1, 0], [-1, -1, 0], [1, -1, 1], [-1, 1, 1]] as const) {
        // Only on a corner that's pavement: not where the road (a diagonal, a wider junction) carries on.
        const nx = x + sx, ny = y + sz;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N || w.road[ny * N + nx]) continue;
        // Nor toward the next cell of the same wide junction (cells side by side all with lights, or a
        // diagonal road beside): that corner is in the middle of the asphalt.
        const ex = y * N + nx, ez = ny * N + x;
        if (at[ex] || at[ez] || (w.road[ex] && w.diag[ex]) || (w.road[ez] && w.diag[ez])) continue;
        p.set(cx + sx * h, 0, cz + sz * h);
        m.compose(p, q, one);
        this.poles.setMatrixAt(n, m);
        this.heads.setMatrixAt(n, m);
        for (let k = 0; k < 3; k++) {
          // The lamps face the road they control, on the side of the head toward it.
          const ox = axis === 0 ? -sx * 0.26 : 0, oz = axis === 1 ? -sz * 0.26 : 0;
          p.set(cx + sx * h + ox, 4.1 + k * 0.42, cz + sz * h + oz);
          m.compose(p, q, one);
          this.lamps.setMatrixAt(n * 3 + k, m);
        }
        this.axes.push(axis);
        n++;
      }
    }
    this.poles.count = this.heads.count = n;
    this.lamps.count = n * 3;
    for (const im of [this.poles, this.heads, this.lamps]) im.instanceMatrix.needsUpdate = true;
  }

  update(w: World, clock: number, camDist: number) {
    this.group.visible = camDist < 900;
    const key = `${w.ver.roads}:${w.roundabouts.length}`;
    if (key !== this.key) { this.key = key; this.rebuild(w); }
    if (!this.group.visible) return;
    const s = [lightFor(0, clock), lightFor(1, clock)];
    for (let i = 0; i < this.axes.length; i++) {
      const on = s[this.axes[i]];
      // Bottom green, middle amber, top red.
      this.lamps.setColorAt(i * 3, on === Light.Green ? LIT[0] : DIM);
      this.lamps.setColorAt(i * 3 + 1, on === Light.Amber ? LIT[1] : DIM);
      this.lamps.setColorAt(i * 3 + 2, on === Light.Red ? LIT[2] : DIM);
    }
    if (this.lamps.instanceColor) this.lamps.instanceColor.needsUpdate = true;
  }
}
