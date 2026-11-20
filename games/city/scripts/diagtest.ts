/* Headless check: buildings on the triangles beside a diagonal road stay off its asphalt and pavement. */
import { CELL, Road, Zone } from '../src/sim/defs';
import { HALF_WIDTH, KERB_W } from '../src/sim/curves';
import { DIAG } from '../src/sim/graph';
import { addBuilding } from '../src/sim/tools';
import { diagonalPath, paintZone, placeRoad, rectCells, roadPath } from '../src/sim/tools';
import { createWorld, idx, riverY } from '../src/sim/world';
import { parts } from '../src/render/buildings';

let failed = 0;
const check = (name: string, ok: boolean, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${info}`); if (!ok) failed++; };

for (const type of [Road.Street, Road.Avenue]) {
  const w = createWorld(7);
  const row = Math.round(riverY(0, 7) - 40);
  // A straight road to the edge, then a long 45° run off it, zoned on both sides.
  placeRoad(w, roadPath(0, row, 40, row), Road.Avenue);
  const err = placeRoad(w, diagonalPath(40, row, 60, row - 20), type);
  check(`${type === Road.Avenue ? 'avenue' : 'street'}: diagonal laid`, !err, err ?? '');
  paintZone(w, rectCells(38, row - 22, 62, row - 1), Zone.R);
  // Put a small house on every empty zoned cell touching the diagonal.
  let n = 0;
  for (let y = row - 22; y < row; y++) for (let x = 38; x <= 62; x++) {
    const i = idx(x, y);
    if (w.road[i] || w.bld[i] >= 0 || !w.zone[i]) continue;
    const touches = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => w.diag[idx(x + dx, y + dy)]);
    if (!touches) continue;
    if (addBuilding(w, 'r1', x, y) !== null) n++;
  }
  // Every part of every building against every diagonal link.
  const reach = HALF_WIDTH[type as 1 | 2] + KERB_W[type as 1 | 2];
  let worst = Infinity, count = 0;
  for (const b of w.buildings.values()) {
    for (const p of parts(b, w)) {
      const c = Math.abs(Math.cos(p.rot)), sn = Math.abs(Math.sin(p.rot));
      const hx = (p.sx * c + p.sz * sn) / 2, hz = (p.sx * sn + p.sz * c) / 2;
      for (let y = b.y - 1; y <= b.y + 1; y++) for (let x = b.x - 1; x <= b.x + 1; x++) {
        const i = idx(x, y);
        for (const [dx, dy, bit] of DIAG) {
          if (!(w.diag[i] & bit)) continue;
          for (let k = 0; k <= 20; k++) {
            const px = (x + 0.5 + dx * k / 20) * CELL, pz = (y + 0.5 + dy * k / 20) * CELL;
            const d = Math.hypot(Math.max(p.x - hx - px, 0, px - p.x - hx), Math.max(p.z - hz - pz, 0, pz - p.z - hz));
            worst = Math.min(worst, d);
          }
        }
      }
    }
    count++;
  }
  check(`${type === Road.Avenue ? 'avenue' : 'street'}: ${count} buildings beside the diagonal stay off it`, count > 10 && worst >= reach, `closest ${worst.toFixed(2)} m, road+pavement ${reach} m, ${n} placed`);
}
console.log(failed ? `${failed} FAILED` : 'all passed');
