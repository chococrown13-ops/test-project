import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CELL, N, Road } from '../sim/defs';
import { HALF_WIDTH } from '../sim/curves';
import type { World } from '../sim/world';

/**
 * What stands on a 고속도로: at a 톨게이트, a row of booths under a long
 * canopy with the toll plaza's lights; at a 나들목, a green sign gantry over
 * the road pointing the way off. Rebuilt when the roads change.
 */
export class HighwayLayer {
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh | null = null;
  private key = '';
  private mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.15 });

  update(w: World) {
    const key = `${w.ver.roads}`;
    if (key === this.key) return;
    this.key = key;
    if (this.mesh) { this.group.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh = null; }
    const parts: THREE.BufferGeometry[] = [];
    const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number, color: string, rot: number, cx: number, cz: number) => {
      const g = new THREE.BoxGeometry(sx, sy, sz);
      g.translate(x, y + sy / 2, z);
      g.rotateY(rot);
      g.translate(cx, 0, cz);
      const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) { a[k * 3] = c.r; a[k * 3 + 1] = c.g; a[k * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      parts.push(g.toNonIndexed());
    };
    const half = HALF_WIDTH[Road.Highway];
    for (let i = 0; i < N * N; i++) {
      const f = w.hwy[i];
      if (!f || w.road[i] !== Road.Highway) continue;
      const x = i % N, y = (i / N) | 0, cx = x * CELL + CELL / 2, cz = y * CELL + CELL / 2;
      // Which way the highway runs here: across it is local x after the rotation.
      const ew = (x > 0 && w.road[i - 1] === Road.Highway) || (x < N - 1 && w.road[i + 1] === Road.Highway);
      const rot = ew ? Math.PI / 2 : 0;
      if (f & 2) {
        // 톨게이트: islands and booths across the road, a canopy over them, posts at the ends.
        for (let k = -2; k <= 2; k++) {
          const lx = k * (half / 2.5);
          box(0.9, 0.25, 4.2, lx, 0, 0, '#d8d3c6', rot, cx, cz);
          box(0.8, 2.3, 1.6, lx, 0.25, 0, '#f2efe6', rot, cx, cz);
          box(0.82, 0.5, 1.62, lx, 2.55, 0, '#2f6db3', rot, cx, cz);
        }
        box(half * 2 + 2, 0.5, 5.4, 0, 4.4, 0, '#e8e4da', rot, cx, cz);
        box(half * 2 + 2.1, 0.7, 0.2, 0, 3.8, 2.65, '#2f6db3', rot, cx, cz);
        box(half * 2 + 2.1, 0.7, 0.2, 0, 3.8, -2.65, '#2f6db3', rot, cx, cz);
        for (const sx of [-1, 1]) box(0.5, 4.4, 0.5, sx * (half + 0.6), 0, 0, '#9aa0a6', rot, cx, cz);
      }
      if (f & 1) {
        // 나들목: a green sign on a gantry over the road.
        for (const sx of [-1, 1]) box(0.3, 6.2, 0.3, sx * (half + 0.6), 0, 0, '#9aa0a6', rot, cx, cz);
        box(half * 2 + 1.5, 0.25, 0.25, 0, 6.1, 0, '#9aa0a6', rot, cx, cz);
        box(half * 1.1, 1.6, 0.2, half * 0.35, 5.0, 0.15, '#1f7a46', rot, cx, cz);
        box(half * 0.9, 0.22, 0.21, half * 0.35, 5.6, 0.16, '#f2f2f0', rot, cx, cz);
        box(half * 0.6, 0.22, 0.21, half * 0.35, 5.15, 0.16, '#f2f2f0', rot, cx, cz);
      }
    }
    if (!parts.length) return;
    this.mesh = new THREE.Mesh(mergeGeometries(parts), this.mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);
  }
}
