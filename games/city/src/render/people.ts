import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CELL, KINDS, N, Zone } from '../sim/defs';
import { HALF_WIDTH, KERB_W } from '../sim/curves';
import { forEachNeighbour, NN } from '../sim/graph';
import { isJunction, nodes } from '../sim/junctions';
import { ringMask } from '../sim/roundabout';
import { axisOf, greenAge, Light, lightFor, signalCells } from '../sim/signals';

/** Walkers step out onto a crossing only this soon after the green man comes on (seconds), and cross this much faster. */
const START = 1, HURRY = 2;
import type { World } from '../sim/world';
import { nodeCentre } from './roadheight';
import { laneAt } from './lanepath';

/**
 * People on the pavements: walking a few blocks along the streets near
 * where they live and shop, more by day and around shops and stations,
 * fewer at night. Purely for looks (the simulation's trips are the cars and
 * the transit riders); drawn only when the camera is close enough to see them.
 */

const MAX = 900;
/** Metres a second at 1x (a stroll, sped up like the cars). */
const WALK = 3.2;
const SW = 0.32;

/** `hurry`: out on a crossing, walking briskly to be off it before the turning cars go. */
interface Walker { path: number[]; i: number; t: number; side: number; speed: number; look: number; hurry?: boolean }

const SHIRTS = ['#d9473b', '#2f6db3', '#f2f2f0', '#1b1c1e', '#e2a92b', '#3d9a62', '#8e9599', '#c2457e', '#5b4232', '#7cc6fe'];

export class PeopleLayer {
  readonly group = new THREE.Group();
  private mesh: THREE.InstancedMesh;
  private walkers: Walker[] = [];
  /** Road cells people set out from, weighted by what's beside them; rebuilt when the city changes. */
  private starts: number[] = [];
  private startsKey = '';

  constructor() {
    const box = (sx: number, sy: number, sz: number, y: number, k: number) => {
      const g = new THREE.BoxGeometry(sx, sy, sz).translate(0, y + sy / 2, 0).toNonIndexed();
      g.setAttribute('aTone', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(k), 1));
      return g;
    };
    // Legs (tone 0), body (tone 1, the instance colour), head (tone 2).
    const geo = mergeGeometries([box(0.38, 0.8, 0.26, 0, 0), box(0.46, 0.7, 0.3, 0.8, 1), box(0.26, 0.28, 0.26, 1.5, 2)]);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aTone;\nvarying float vTone;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvTone = aTone;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vTone;')
        .replace('#include <color_fragment>', '#include <color_fragment>\nif (vTone < 0.5) diffuseColor.rgb = vec3(0.16, 0.18, 0.24);\nelse if (vTone > 1.5) diffuseColor.rgb = vec3(0.86, 0.7, 0.58);');
    };
    mat.customProgramCacheKey = () => 'city-people';
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, new THREE.Color());
    this.group.add(this.mesh);
  }

  private findStarts(w: World) {
    const key = `${w.ver.buildings}:${w.ver.roads}:${w.roundabouts.length}`;
    if (key === this.startsKey) return;
    this.startsKey = key;
    // The streets changed: whoever was walking where there's no pavement now goes home.
    const gone = ringMask(w);
    this.walkers = this.walkers.filter((wk) => wk.path.every((c) => c < NN && w.road[c] && !gone[c]));
    const starts: number[] = [];
    const ring = ringMask(w);
    w.buildings.forEach((b) => {
      const d = KINDS[b.kind];
      if (b.abandoned) return;
      // Shops and stations draw a crowd; homes send people out; the rest a few.
      const weight = d.zone === Zone.C ? 4 : d.zone === Zone.R ? 2 : b.kind === 'metro' || b.kind === 'terminal' || b.kind === 'ktx' || b.kind === 'market' ? 6 : d.zone === Zone.I ? 0 : 1;
      if (!weight) return;
      for (let y = b.y - 1; y <= b.y + (b.sy ?? b.size); y++) for (let x = b.x - 1; x <= b.x + (b.sx ?? b.size); x++) {
        if (x < 0 || y < 0 || x >= N || y >= N) continue;
        const i = y * N + x;
        if (w.road[i] && w.road[i] !== 3 && !w.roadAlt[i] && w.ground[i] === 0 && !ring[i]) for (let k = 0; k < weight; k++) starts.push(i);
      }
    });
    this.starts = starts;
  }

  /** A short wander along the streets from a start cell. */
  private spawn(w: World): Walker | null {
    if (!this.starts.length) return null;
    let cur = this.starts[(Math.random() * this.starts.length) | 0];
    // Not through a roundabout: its grid cells are under the ring and the island, not pavement.
    const ring = ringMask(w);
    const path = [cur];
    const len = 4 + ((Math.random() * 10) | 0);
    // Which pavement they walk on (right of travel +1, left -1). At a junction they go straight on or
    // round the corner on their own side, never across the middle to the far pavement (through the cars).
    const side = Math.random() < 0.5 ? 1 : -1;
    let prev = -1;
    for (let k = 0; k < len; k++) {
      const next: number[] = [];
      const dx = prev >= 0 ? (cur % N) - (prev % N) : 0, dy = prev >= 0 ? ((cur / N) | 0) - ((prev / N) | 0) : 0;
      forEachNeighbour(w, cur, (n) => {
        if (n >= NN || n === prev || w.ground[n] !== 0 || w.roadAlt[n] || w.road[n] === 3 || ring[n]) return;
        if (prev >= 0) {
          const ex = (n % N) - (cur % N), ez = ((n / N) | 0) - ((cur / N) | 0);
          const turn = dx * ez - dy * ex; // > 0 a right turn (screen z points south)
          if (turn !== 0 && Math.sign(turn) !== side) return;
        }
        next.push(n);
      });
      if (!next.length) break;
      // Mostly straight on.
      const ahead = next.find((n) => (n % N) - (cur % N) === dx && ((n / N) | 0) - ((cur / N) | 0) === dy);
      const n = ahead !== undefined && Math.random() < 0.75 ? ahead : next[(Math.random() * next.length) | 0];
      prev = cur; cur = n; path.push(n);
    }
    // Not across a junction on the slant (there is no crossing that way: walk up to it and stop), and
    // never starting or ending in the middle of a junction.
    const nd = nodes(w);
    const slant = (a: number, b: number) => (a % N) !== (b % N) && ((a / N) | 0) !== ((b / N) | 0);
    for (let j = 1; j < path.length - 1; j++) {
      if (isJunction(nd, path[j]) && (slant(path[j - 1], path[j]) || slant(path[j], path[j + 1]))) { path.length = j; break; }
    }
    while (path.length && isJunction(nd, path[path.length - 1])) path.pop();
    while (path.length && isJunction(nd, path[0])) path.shift();
    if (path.length < 2) return null;
    return { path, i: 0, t: Math.random(), side, speed: WALK * (0.8 + Math.random() * 0.4), look: Math.random() };
  }

  /**
   * Whether a walker should stand at the kerb now, about to cross a side street at a junction: at
   * lights, until the green man (and not once it has been on a while); anywhere, while a car is on
   * or near the crossing, so people and cars never walk through each other.
   */
  private mustWait(w: World, wk: Walker, clock: number, L: number, cars?: { spots: Float32Array; nSpots: number }): boolean {
    const j = wk.i + 1;
    if (j >= wk.path.length - 1 || wk.t > 0.9) return false;
    const pa = wk.path[j - 1], pc = wk.path[j], pb = wk.path[j + 1];
    if (pc >= NN || pc - pa !== pb - pc) return false;
    const dx = Math.sign((pb % N) - (pa % N)), dy = Math.sign(((pb / N) | 0) - ((pa / N) | 0));
    if ((dx === 0) === (dy === 0)) return false;
    // The side street being crossed, on the walker's side.
    const sx = (pc % N) - dy * wk.side, sy = ((pc / N) | 0) + dx * wk.side;
    if (sx < 0 || sy < 0 || sx >= N || sy >= N || !w.road[sy * N + sx]) return false;
    const st = (w.road[sy * N + sx] || 1) as 1 | 2;
    // Distance left to the junction's middle; stop just before stepping onto the crossing.
    const left = (1 - wk.t) * L, kerb = HALF_WIDTH[st] + 2.9;
    if (left > kerb + 1.2 || left < kerb - 0.3) return false;
    if (signalCells(w)[pc]) {
      // Not once the green man has been on a while: the turning cars go soon (sim/driving.ts waits 2 s for walkers).
      const ax = axisOf(pa, pc);
      if (lightFor(ax, clock) !== Light.Green || greenAge(ax, clock) > START) return true;
    }
    if (!cars) return false;
    // The crossing: across the side street, just beyond the junction's edge.
    const t = (w.road[pc] || 1) as 1 | 2;
    const cx = (pc % N) * CELL + CELL / 2 - dy * wk.side * (HALF_WIDTH[t] + 1.6), cz = ((pc / N) | 0) * CELL + CELL / 2 + dx * wk.side * (HALF_WIDTH[t] + 1.6);
    const r2 = (HALF_WIDTH[st] + 2.5) ** 2;
    for (let k = 0; k < cars.nSpots; k++) {
      const ex = cars.spots[k * 2] - cx, ez = cars.spots[k * 2 + 1] - cz;
      if (ex * ex + ez * ez < r2) return true;
    }
    return false;
  }

  /** Zebras walkers are on this frame (the traffic's map, filled here). */
  crossings: Map<number, number> | null = null;

  update(w: World, dt: number, pace: number, night: number, camDist: number, clock = 0, cars?: { spots: Float32Array; nSpots: number }) {
    this.crossings?.clear();
    this.mesh.visible = camDist < 450;
    if (!this.mesh.visible) return;
    this.findStarts(w);
    // How many are out: the population, thinned at night.
    const want = Math.min(MAX, Math.round((w.stats.pop / 6 + this.starts.length * 0.08) * (1 - night * 0.75)));
    while (this.walkers.length < want) { const p = this.spawn(w); if (!p) break; this.walkers.push(p); }
    if (this.walkers.length > want) this.walkers.length = want;
    // Drawn a little larger than life (like the cars), so they read from the usual camera height.
    const pt = { x: 0, z: 0 }, prev = { x: 0, z: 0 };
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1.4, 1.4, 1.4), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    let n = 0;
    for (let k = 0; k < this.walkers.length; k++) {
      const wk = this.walkers[k];
      const a = nodeCentre(wk.path[wk.i], w), b = nodeCentre(wk.path[wk.i + 1], w);
      const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      // At a junction with lights, wait at the kerb for the green man before crossing the side street
      // (walkers along a street cross with the traffic going their way, while the side street has red).
      const hold = this.mustWait(w, wk, clock, L, cars);
      if (!hold) wk.t += (dt * pace * wk.speed * (wk.hurry ? HURRY : 1)) / L;
      if (wk.t >= 1) {
        wk.t -= 1; wk.i++;
        if (wk.i >= wk.path.length - 1) { const fresh = this.spawn(w); if (fresh) this.walkers[k] = fresh; else wk.i = 0; continue; }
      }
      const dx = (b.x - a.x) / L, dz = (b.z - a.z) / L;
      const cell = wk.path[wk.i];
      // The wider of the two roads this step joins: round the corner of an avenue on its pavement, not its kerb.
      const t = Math.max(w.road[cell] || 1, w.road[wk.path[wk.i + 1]] || 1) as 1 | 2;
      let off = wk.side * (HALF_WIDTH[t] + KERB_W[t] * 0.5) + (wk.look - 0.5) * 0.5;
      // Going straight past a side street: step out to its zebra (painted just beyond the junction's edge) to cross.
      wk.hurry = false;
      const j = Math.round(wk.i + wk.t);
      if (j > 0 && j < wk.path.length - 1) {
        const pa = wk.path[j - 1], pc = wk.path[j], pb = wk.path[j + 1];
        const dx = Math.sign((pb % N) - (pa % N)), dy = Math.sign(((pb / N) | 0) - ((pa / N) | 0));
        if ((dx === 0) !== (dy === 0) && pc - pa === pb - pc) {
          const sx = (pc % N) - dy * wk.side, sy = ((pc / N) | 0) + dx * wk.side;
          const sc = sy * N + sx;
          if (sx >= 0 && sy >= 0 && sx < N && sy < N && w.road[sc]) {
            const st = (w.road[sc] || 1) as 1 | 2;
            const zebra = HALF_WIDTH[t] + KERB_W[t] + 1.6;
            const dist = Math.abs(wk.i + wk.t - j) * CELL;
            const k = Math.max(0, Math.min(1, (HALF_WIDTH[st] + 2.5 - dist) / 2));
            off += Math.sign(off) * (zebra - Math.abs(off)) * k;
            wk.hurry = k > 0 && !hold;
            // Only while actually out on the crossing: someone waiting at the kerb doesn't hold the cars up.
            if (k > 0 && !hold && this.crossings) this.crossings.set(sc, pc);
          }
        }
      }
      // Along the pavement; at a junction straight to the corner and across on the line of the crossing.
      laneAt((j) => nodeCentre(wk.path[j], w), wk.path.length - 1, wk.i + wk.t, off, Math.abs(off) + 1.5, true, pt);
      p.set(pt.x, SW, pt.z);
      // A little bob as they step.
      if (!hold) p.y += Math.abs(Math.sin((wk.t * L) / 0.7)) * 0.05;
      // Face the way they're actually walking (round corners too).
      laneAt((j) => nodeCentre(wk.path[j], w), wk.path.length - 1, Math.max(0, wk.i + wk.t - 0.05), off, Math.abs(off) + 1.5, true, prev);
      const hx = pt.x - prev.x, hz = pt.z - prev.z;
      q.setFromAxisAngle(up, (hx * hx + hz * hz > 1e-6 ? Math.atan2(-hz, hx) : Math.atan2(-dz, dx)) + Math.PI / 2);
      this.mesh.setMatrixAt(n, m.compose(p, q, one));
      this.mesh.setColorAt(n, c.set(SHIRTS[Math.floor(wk.look * 997) % SHIRTS.length]));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
