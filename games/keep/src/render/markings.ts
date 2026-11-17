import * as THREE from 'three';
import { CELL, type Game, Ground, idx, N, RoadT } from '../sim/world';

/**
 * Road markings as real geometry at real sizes, laid just above the asphalt
 * (the ground texture is 2.5 m a pixel, far too coarse for a 15 cm line).
 *
 * Avenues are 16 m of asphalt, two 4 m lanes each way, marked the Korean way:
 *  - 중앙선: a double yellow line, two 15 cm lines 15 cm apart,
 *  - 차선: white dashes between the lanes, 3 m painted and 5 m gap,
 *  - at each avenue crossroads: a white 정지선 across the lanes coming in,
 *    then a 횡단보도 of 45 cm bars 45 cm apart, 4 m deep.
 */
const YELLOW = new THREE.Color('#e9bf3a');
const WHITE = new THREE.Color('#f3f1ea');
const LIFT = 0.06;

export function buildMarkings(g: Game, ground: (x: number, z: number) => number): THREE.Mesh {
  const pos: number[] = [], col: number[] = [];
  const av = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && g.road[idx(x, y)] === RoadT.Avenue;
  const big = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && g.road[idx(x, y)] >= RoadT.Street;
  const cross = (x: number, y: number) => av(x, y) && (
    (av(x - 1, y) || av(x + 1, y)) && (av(x, y - 1) || av(x, y + 1)) ||
    (av(x - 1, y) || av(x + 1, y)) && big(x, y - 1) && big(x, y + 1) ||
    (av(x, y - 1) || av(x, y + 1)) && big(x - 1, y) && big(x + 1, y));
  const avCross = (x: number, y: number) => av(x, y) && (av(x - 1, y) || av(x + 1, y)) && (av(x, y - 1) || av(x, y + 1));
  const deck = (wx: number, wz: number) => {
    const cx = Math.floor(wx / CELL), cz = Math.floor(wz / CELL);
    return cx >= 0 && cz >= 0 && cx < N && cz < N && g.ground[idx(cx, cz)] === Ground.Water;
  };
  const h = (wx: number, wz: number) => (deck(wx, wz) ? 2.4 : ground(wx, wz)) + LIFT;
  /** An axis-aligned painted rectangle; `along` is the road direction (x or z), u along it, v across. */
  const rect = (alongX: boolean, u0: number, u1: number, v0: number, v1: number, c: THREE.Color) => {
    const P = (u: number, v: number) => (alongX ? [u, h(u, v), v] : [v, h(v, u), u]);
    const a = P(u0, v0), b = P(u1, v0), cc = P(u1, v1), d = P(u0, v1);
    // Wind so the face looks up whichever axis the road runs along.
    const tri = alongX ? [a, d, cc, a, cc, b] : [a, b, cc, a, cc, d];
    for (const p of tri) { pos.push(p[0], p[1], p[2]); col.push(c.r, c.g, c.b); }
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!av(x, y) || cross(x, y)) continue;
    for (const alongX of [true, false]) {
      // This cell carries the avenue along this axis if the avenue continues that way.
      const n0 = alongX ? av(x - 1, y) : av(x, y - 1), n1 = alongX ? av(x + 1, y) : av(x, y + 1);
      if (!n0 && !n1) continue;
      const c0 = (alongX ? x : y) * CELL, mid = (alongX ? y : x) * CELL + CELL / 2;
      // Approaching a crossroads on either end? Leave room for the stop line and crossing.
      const j0 = alongX ? avCross(x - 1, y) : avCross(x, y - 1), j1 = alongX ? avCross(x + 1, y) : avCross(x, y + 1);
      const s0 = alongX ? cross(x - 1, y) : cross(x, y - 1), s1 = alongX ? cross(x + 1, y) : cross(x, y + 1);
      let u0 = c0, u1 = c0 + CELL;
      if (j0) u0 += 7; else if (s0) u0 += 1;
      if (j1) u1 -= 7; else if (s1) u1 -= 1;
      // 중앙선: double yellow.
      rect(alongX, u0, u1, mid - 0.3, mid - 0.15, YELLOW);
      rect(alongX, u0, u1, mid + 0.15, mid + 0.3, YELLOW);
      // 차선: white dashes 4 m either side of the centre, solid near a crossroads.
      for (const side of [-1, 1]) {
        const v = mid + side * 4;
        if (j0 || j1) rect(alongX, u0, u1, v - 0.075, v + 0.075, WHITE);
        else for (let k = Math.floor(u0 / 8) * 8; k < u1; k += 8) {
          // Dashes keep one rhythm down the whole avenue: 3 m painted every 8 m.
          const a = Math.max(k, u0), b = Math.min(k + 3, u1);
          if (b > a) rect(alongX, a, b, v - 0.075, v + 0.075, WHITE);
        }
      }
      // Stop line and crossing on each end that meets an avenue crossroads.
      for (const [j, dir] of [[j0, -1], [j1, 1]] as [boolean, number][]) {
        if (!j) continue;
        const edge = dir < 0 ? c0 : c0 + CELL;
        // 횡단보도: bars across the road, 4 m deep, right at the junction.
        const a = edge - dir * 0.6, b = edge - dir * 4.6;
        for (let v = mid - 7.7; v <= mid + 7.3; v += 0.9) rect(alongX, Math.min(a, b), Math.max(a, b), v, v + 0.45, WHITE);
        // 정지선 across the incoming lanes (traffic keeps right, so the half to the driver's right).
        const sl = edge - dir * 6;
        const vIn0 = dir > 0 ? (alongX ? mid + 0.3 : mid - 8) : (alongX ? mid - 8 : mid + 0.3);
        rect(alongX, Math.min(sl, sl - dir * 0.45), Math.max(sl, sl - dir * 0.45), vIn0, vIn0 + 7.7, WHITE);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  return mesh;
}
