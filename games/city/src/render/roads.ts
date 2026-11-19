import * as THREE from 'three';
import { CELL, ELEVATED_Y, Ground, Level, N, Road } from '../sim/defs';
import { altNeighbours, rampExit } from '../sim/graph';
import { buildCityNetwork, buildElevatedNetwork, RING } from './roadnet';
import { ringOf, type Roundabout } from '../sim/roundabout';
import { left, offsetPoint, samplePath } from '../../../shared/roads/geom';
import { buildRoadMeshes } from '../../../shared/roads/mesh';
import { buildGeometry, type Geometry, type Network } from '../../../shared/roads/network';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
import { idx, type World } from '../sim/world';
import { shared } from './materials';
import { seasonOf } from './ground';

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
const MOUTH = 0x15171b;

export class RoadLayer {
  readonly group = new THREE.Group();
  private mesh: THREE.Mesh | null = null;
  private net: THREE.Group | null = null;
  /** Paint: lane lines, crossings, bus lanes (drawn just above the asphalt). */
  private paintMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  private ver = '';
  readonly material: THREE.MeshStandardMaterial;
  private uOv = { value: 0 };
  private poles: THREE.InstancedMesh;
  private lamps: THREE.InstancedMesh;
  private lampMat: THREE.MeshStandardMaterial;
  /** 가로수: where each stands (rebuilt with the roads) and its meshes (recoloured with the seasons). */
  private treeSpots: { x: number; z: number; cherry: boolean; s: number }[] = [];
  private treeMeshes: THREE.InstancedMesh[] = [];
  private treeSeason = '';

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
    // Their bounding sphere would be computed once, from the first few lamps; spread over the whole map, never cull them.
    this.poles.frustumCulled = this.lamps.frustumCulled = false;
    this.group.add(this.poles, this.lamps);
  }

  setTrafficOverlay(on: boolean) { this.uOv.value = on ? 1 : 0; }

  /** `bus` names the ground cells bus lines run on; avenues there get a 중앙버스전용차로. */
  /** The 가로수 as instanced trunks and crowns, coloured for the season (bare in winter). */
  private drawTrees(month: number) {
    const season = seasonOf(month);
    this.treeSeason = season;
    for (const m of this.treeMeshes) { this.group.remove(m); m.dispose(); }
    this.treeMeshes = [];
    const spots = this.treeSpots;
    if (!spots.length) return;
    const GINKGO: Record<string, string> = { spring: '#9cc65a', blossom: '#9cc65a', summer: '#5f9a3f', autumn: '#f2c12e', winter: '' };
    const CHERRY: Record<string, string> = { spring: '#86b85a', blossom: '#f6c9d6', summer: '#4f8a3c', autumn: '#d9822b', winter: '' };
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
    const make = (geo: THREE.BufferGeometry, list: typeof spots, colour: (s: typeof spots[0]) => string) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
      list.forEach((t, i) => {
        p.set(t.x, SW, t.z); sc.set(t.s, t.s, t.s);
        mesh.setMatrixAt(i, m.compose(p, q, sc));
        mesh.setColorAt(i, c.set(colour(t)));
      });
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      this.treeMeshes.push(mesh);
      this.group.add(mesh);
    };
    make(new THREE.CylinderGeometry(0.11, 0.16, 2.8, 5).translate(0, 1.4, 0), spots, () => '#6b5440');
    if (season === 'winter') return;
    // 은행나무: a narrow upright crown; 벚나무: a broad round one.
    make(new THREE.ConeGeometry(1.25, 4.4, 7).translate(0, 4.2, 0), spots.filter((t) => !t.cherry), () => GINKGO[season]);
    make(new THREE.IcosahedronGeometry(1.8, 0).scale(1, 0.75, 1).translate(0, 3.6, 0), spots.filter((t) => t.cherry), () => CHERRY[season]);
  }

  update(w: World, bus: { key: string; cells: Set<number> }, month = 5) {
    this.lampMat.emissiveIntensity = shared.uNight.value * 2.2;
    const ver = `${w.ver.roads}:${bus.key}`;
    if (this.ver === ver) { if (seasonOf(month) !== this.treeSeason) this.drawTrees(month); return; }
    this.ver = ver;
    this.treeSpots = [];
    const b = new Builder();
    const m = new THREE.Matrix4();
    let lamps = 0;
    const cellAt = (x: number, z: number) => { const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL); return cx < 0 || cz < 0 || cx >= N || cz >= N ? -1 : cz * N + cx; };
    const water = (x: number, z: number) => { const i = cellAt(x, z); return i >= 0 && w.ground[i] === Ground.Water; };
    // Every ground road (grid runs, diagonals, curves) as one road graph: one geometry, clean junctions.
    // Ground cells a ramp rises from: the road runs on up the ramp there, no dead-end cap.
    const rampFeet = new Set<number>();
    for (let i = 0; i < N * N; i++) if (w.roadAlt[i]) { const e = rampExit(w, i); if (e >= 0) rampFeet.add(e); }
    const net = buildCityNetwork(w);
    const geo = buildGeometry(net);
    const roads = buildRoadMeshes(net, {
      heights: { asphalt: Y, kerb: SW, paint: Y + 0.02 },
      zebra: 2.2,
      // Roads leaving the map's west edge run on, no cap there.
      capAt: (p) => p.x > 0 && !rampFeet.has(cellAt(p.x, p.z)),
      colours: { asphalt: hex(ASPHALT[Road.Street]), avenue: hex(ASPHALT[Road.Avenue]), pavement: hex(WALK), yellow: hex(YELLOW), white: hex(WHITE) },
      busAt: (x, z) => { const i = cellAt(x, z); return i >= 0 && bus.cells.has(i) && !water(x, z); },
      materials: { asphalt: this.material, pavement: this.material, paint: this.paintMat },
      plain: (e) => e.tag === RING,
      tree: (x, z, ccx, ccz) => {
        const i = cellAt(ccx, ccz);
        if (i < 0 || !w.trees[i] || water(x, z)) return;
        // One kind of tree along a stretch of street: 은행나무 mostly, 벚나무 in places.
        const gx = Math.floor((i % N) / 8), gy = Math.floor(i / N / 8);
        const h = Math.sin(gx * 12.9898 + gy * 78.233) * 43758.5453;
        const k = Math.sin(x * 3.1 + z * 7.7) * 9187.13;
        this.treeSpots.push({ x, z, cherry: h - Math.floor(h) < 0.3, s: 0.85 + (k - Math.floor(k)) * 0.3 });
      },
      lamp: (x, z, ang) => {
        if (lamps >= N * N || water(x, z)) return;
        m.makeTranslation(x, SW, z);
        this.poles.setMatrixAt(lamps, m);
        m.makeRotationY(ang).setPosition(x + Math.sin(ang) * 0.7, SW + 6.4, z + Math.cos(ang) * 0.7);
        this.lamps.setMatrixAt(lamps, m);
        lamps++;
      },
    }, geo);
    // Where a road crosses water: a deck under it, rails along its edges, piers below.
    bridges(b, w, net, geo);
    for (const rb of w.roundabouts) island(b, rb);
    // Flyovers: the same road drawing lifted onto concrete decks with parapets and piers.
    const fly = buildElevatedNetwork(w);
    const flyGeo = buildGeometry(fly.net);
    const flyRoads = buildRoadMeshes(fly.net, {
      heightAt: fly.heightAt,
      heights: { asphalt: 0.12, kerb: 0.32, paint: 0.14 },
      zebra: 2.2,
      capAt: () => false,
      colours: { asphalt: hex(ASPHALT[Road.Street]), avenue: hex(ASPHALT[Road.Avenue]), pavement: hex(CONCRETE), yellow: hex(YELLOW), white: hex(WHITE) },
      materials: { asphalt: this.material, pavement: this.material, paint: this.paintMat },
    }, flyGeo);
    decks(b, w, fly.net, flyGeo, fly.heightAt);
    roads.add(...flyRoads.children);
    // The second layer: flyover decks, and the mouths of underpasses and tunnels.
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (w.roadAlt[idx(x, y)]) altCell(b, w, x, y);
    this.poles.count = this.lamps.count = lamps;
    this.drawTrees(month);
    this.poles.instanceMatrix.needsUpdate = this.lamps.instanceMatrix.needsUpdate = true;
    if (this.mesh) { this.group.remove(this.mesh); this.mesh.geometry.dispose(); }
    if (this.net) { this.group.remove(this.net); this.net.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); }
    this.mesh = new THREE.Mesh(b.geometry(), this.material);
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);
    roads.traverse((o) => { o.receiveShadow = true; });
    this.net = roads;
    this.group.add(roads);
  }
}

/** A cell of the second road layer. */
function altCell(b: Builder, w: World, x: number, y: number) {
  const i = idx(x, y);
  const mx = x * CELL + CELL / 2, mz = y * CELL + CELL / 2;
  const nb = altNeighbours(w, i).map((n) => ({ dx: (n % N) - x, dy: ((n / N) | 0) - y }));
  const level = w.altLevel[i];
  const DW = 9.5;
  const ramp = nb.length <= 1 ? nb[0] ?? { dx: 1, dy: 0 } : null;
  if (level === Level.Elevated) return; // drawn with the road graph (see decks)
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
 * The concrete of a flyover: under each deck ribbon a slab 1.3 m deep with a
 * parapet on both edges, a pier every 20 m (not on the ramps), and under
 * each junction where flyovers meet a slab of its outline.
 */
function decks(b: Builder, w: World, net: Network, geo: Geometry, h: (x: number, z: number) => number) {
  const T = 1.3;
  for (const r of geo.ribbons) {
    const e = net.edges.get(r.edge)!, K = net.types[r.kind];
    const P = samplePath(e.path, r.t0, r.t1, 1.5, true);
    const edge = K.half + K.kerb;
    const at = (k: number, off: number, dy: number) => { const q = offsetPoint(P[k], off); return [q.x, h(q.x, q.z) + dy, q.z]; };
    let nextPier = r.t0 + 4;
    for (let k = 0; k < P.length - 1; k++) {
      // Underside and outer faces of the slab.
      const u = (o: number) => at(k, o, -T), u1 = (o: number) => at(k + 1, o, -T);
      b.tri(u(-edge), u1(-edge), u1(edge), CONCRETE, [0, -1, 0], 0.7);
      b.tri(u(-edge), u1(edge), u(edge), CONCRETE, [0, -1, 0], 0.7);
      for (const sd of [1, -1]) {
        const n = left(P[k].d), hint = [n.x * sd, 0, n.z * sd];
        const a = at(k, sd * edge, 0.32), bb = at(k + 1, sd * edge, 0.32), c = at(k + 1, sd * edge, -T), d = at(k, sd * edge, -T);
        b.tri(a, bb, c, CONCRETE, hint, 0.85); b.tri(a, c, d, CONCRETE, hint, 0.85);
        // Parapet: 0.35 m thick, 0.95 m above the pavement.
        const pa = at(k, sd * (edge - 0.35), 1.27), pb = at(k + 1, sd * (edge - 0.35), 1.27), pc = at(k + 1, sd * edge, 1.27), pd = at(k, sd * edge, 1.27);
        b.tri(pa, pb, pc, CONCRETE, [0, 1, 0]); b.tri(pa, pc, pd, CONCRETE, [0, 1, 0]);
        for (const [off, out] of [[edge, sd], [edge - 0.35, -sd]] as [number, number][]) {
          const ta = at(k, sd * off, 1.27), tb = at(k + 1, sd * off, 1.27), tc = at(k + 1, sd * off, 0.32), td = at(k, sd * off, 0.32);
          const hh = [n.x * out, 0, n.z * out];
          b.tri(ta, tb, tc, CONCRETE, hh, 0.85); b.tri(ta, tc, td, CONCRETE, hh, 0.85);
        }
      }
      // A pier and its cross-beam wherever the deck is up at full height.
      const y = h(P[k].p.x, P[k].p.z);
      if (P[k].t >= nextPier && y > ELEVATED_Y - 0.5) {
        nextPier = P[k].t + 20;
        const cx = Math.floor(P[k].p.x / CELL), cz = Math.floor(P[k].p.z / CELL);
        const base = cx >= 0 && cz >= 0 && cx < N && cz < N && w.ground[cz * N + cx] === Ground.Water ? -4.5 : 0;
        const { x, z } = P[k].p, n = left(P[k].d);
        b.box(x - 0.9, base, z - 0.9, x + 0.9, y - T, z + 0.9, PIER);
        const half = edge - 0.6;
        b.slab(x - n.x * half, z - n.z * half, y - T, x + n.x * half, z + n.z * half, y - T, 1.8, 0.8, PIER);
      }
    }
  }
  for (const j of geo.junctions) {
    const ring = j.ring;
    if (ring.length < 3) continue;
    const tris = THREE.ShapeUtils.triangulateShape(ring.map((p) => new THREE.Vector2(p.x, p.z)), []);
    for (const [a, c, d] of tris) b.tri([ring[a].x, h(ring[a].x, ring[a].z) - T, ring[a].z], [ring[c].x, h(ring[c].x, ring[c].z) - T, ring[c].z], [ring[d].x, h(ring[d].x, ring[d].z) - T, ring[d].z], CONCRETE, [0, -1, 0], 0.7);
  }
}

/** Bridge decks: under every stretch of road over water, a deck with rails and piers. */
function bridges(b: Builder, w: World, net: Network, geo: Geometry) {
  const cellOfPt = (x: number, z: number) => { const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL); return cx < 0 || cz < 0 || cx >= N || cz >= N ? -1 : cz * N + cx; };
  for (const r of geo.ribbons) {
    const e = net.edges.get(r.edge)!, T = net.types[r.kind];
    const P = samplePath(e.path, r.t0, r.t1, 1.2);
    const edge = T.half + T.kerb;
    const at = (k: number, off: number, y: number) => { const q = offsetPoint(P[k], off); return [q.x, y, q.z]; };
    const band = (k: number, o0: number, o1: number, y: number, hx: number) => {
      const a = at(k, o0, y), bb = at(k, o1, y), cc = at(k + 1, o1, y), d = at(k + 1, o0, y);
      b.tri(a, bb, cc, hx, [0, 1, 0]); b.tri(a, cc, d, hx, [0, 1, 0]);
    };
    const wall = (k: number, off: number, y0: number, y1: number, hx: number, out: number) => {
      const a = at(k, off, y0), bb = at(k + 1, off, y0), cc = at(k + 1, off, y1), d = at(k, off, y1);
      const n = left(P[k].d), hint = [n.x * out, 0, n.z * out];
      b.tri(a, bb, cc, hx, hint, 0.82); b.tri(a, cc, d, hx, hint, 0.82);
    };
    let nextPier = 0;
    for (let k = 0; k < P.length - 1; k++) {
      const mx = (P[k].p.x + P[k + 1].p.x) / 2, mz = (P[k].p.z + P[k + 1].p.z) / 2;
      const i = cellOfPt(mx, mz);
      if (i < 0 || w.ground[i] !== Ground.Water) continue;
      band(k, -edge - 0.4, edge + 0.4, Y - 0.04, 0x9c9a92);
      for (const sd of [1, -1]) {
        wall(k, sd * (edge + 0.4), -1.6, Y - 0.04, 0x9c9a92, sd);
        band(k, sd * (edge + 0.05), sd * (edge + 0.4), 1.0, 0xd6d4ce);
        wall(k, sd * (edge + 0.05), SW, 1.0, 0xd6d4ce, -sd);
      }
      if (P[k].t > nextPier) { nextPier = P[k].t + 14; b.box(P[k].p.x - 1, -6, P[k].p.z - 1, P[k].p.x + 1, -1.6, P[k].p.z + 1, 0x8c8a84); }
    }
  }
}

const GRASS = 0x7fae55, LEAF = 0x4f8a3c, TRUNK = 0x6b5440;
/** A roundabout's island: a raised kerb ring round a grass mound, and a pine in the middle. */
function island(b: Builder, rb: Roundabout) {
  const g = ringOf(rb), seg = 40;
  const at = (r: number, k: number, y: number) => [g.x + Math.cos((k / seg) * Math.PI * 2) * r, y, g.z + Math.sin((k / seg) * Math.PI * 2) * r];
  const r0 = g.island, r1 = g.island - 1.5, KH = SW + 0.04, GH = SW + 0.25;
  for (let k = 0; k < seg; k++) {
    // Kerb face, kerb top, then the grass.
    b.tri(at(r0, k, Y), at(r0, k + 1, Y), at(r0, k + 1, KH), WALK, [Math.cos(((k + 0.5) / seg) * Math.PI * 2), 0, Math.sin(((k + 0.5) / seg) * Math.PI * 2)], 0.85);
    b.tri(at(r0, k, Y), at(r0, k + 1, KH), at(r0, k, KH), WALK, [Math.cos(((k + 0.5) / seg) * Math.PI * 2), 0, Math.sin(((k + 0.5) / seg) * Math.PI * 2)], 0.85);
    b.tri(at(r0, k, KH), at(r0, k + 1, KH), at(r1, k + 1, KH), WALK, [0, 1, 0]);
    b.tri(at(r0, k, KH), at(r1, k + 1, KH), at(r1, k, KH), WALK, [0, 1, 0]);
    b.tri(at(r1, k, KH), at(r1, k + 1, KH), [g.x, GH + 0.6, g.z], GRASS, [0, 1, 0]);
  }
  // 소나무: trunk and three tiers of needles.
  b.box(g.x - 0.35, GH, g.z - 0.35, g.x + 0.35, GH + 3, g.z + 0.35, TRUNK);
  for (const [y0, r, h] of [[GH + 2, 3.2, 3], [GH + 3.8, 2.4, 2.6], [GH + 5.3, 1.5, 2.2]]) {
    const n = 8;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
      const p0 = [g.x + Math.cos(a0) * r, y0, g.z + Math.sin(a0) * r], p1 = [g.x + Math.cos(a1) * r, y0, g.z + Math.sin(a1) * r];
      const am = (a0 + a1) / 2;
      b.tri(p0, p1, [g.x, y0 + h, g.z], LEAF, [Math.cos(am), 0.6, Math.sin(am)], 0.9 + 0.1 * Math.cos(am));
      b.tri(p0, p1, [g.x, y0, g.z], LEAF, [0, -1, 0], 0.6);
    }
  }
}
