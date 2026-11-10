/* Headless check that redevelopment fits the block: deep blocks grow 3×3, thin ones 2×N. */
import { KINDS, Road, Zone } from '../src/sim/defs';
import { grow } from '../src/sim/growth';
import { invalidateNetwork } from '../src/sim/network';
import { addBuilding, paintZone, placeRoad, rectCells, roadPath } from '../src/sim/tools';
import { bh, bw, createWorld, idx, startRowOf } from '../src/sim/world';

let fails = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); if (!ok) fails++; };
const w = createWorld(7, 't', 'plain');
w.money = 1e8;
const row = startRowOf(w);
// A deep block (6 cells between roads, zoned 3 deep from each) and a thin one (2 cells).
placeRoad(w, roadPath(22, row, 60, row), Road.Avenue);
placeRoad(w, roadPath(22, row - 7, 60, row - 7), Road.Street);
placeRoad(w, roadPath(22, row + 3, 60, row + 3), Road.Street);
for (const x of [22, 40, 60]) placeRoad(w, roadPath(x, row - 7, x, row + 3), Road.Street);
paintZone(w, rectCells(23, row - 6, 59, row - 1), Zone.R);
paintZone(w, rectCells(23, row + 1, 59, row + 2), Zone.C);
// Every lot already mid-density, the city rich and happy.
for (let y = row - 6; y <= row + 2; y++) for (let x = 23; x <= 59; x++) {
  const i = idx(x, y);
  if (!w.zone[i] || w.bld[i] >= 0) continue;
  const b = addBuilding(w, w.zone[i] === Zone.R ? 'r2' : 'c2', x, y);
  b.powered = b.watered = true; b.happy = 90; b.occ = 20;
}
invalidateNetwork();
w.demand = { R: 100, C: 100, I: 100 };
for (let t = 0; t < 400; t++) {
  w.land.fill(90);
  w.buildings.forEach((b) => { b.powered = b.watered = true; b.happy = 90; });
  grow(w);
}
const shapes = new Map<string, number>();
let bad = 0;
w.buildings.forEach((b) => {
  const d = KINDS[b.kind];
  if (!d.zone) return;
  const k = `${b.kind} ${bw(b)}x${bh(b)}`;
  shapes.set(k, (shapes.get(k) ?? 0) + 1);
  for (let y = b.y; y < b.y + bh(b); y++) for (let x = b.x; x < b.x + bw(b); x++) if (w.road[idx(x, y)] || w.zone[idx(x, y)] !== d.zone) bad++;
});
console.log('  ', [...shapes].sort().map(([k, v]) => `${k}:${v}`).join('  '));
check('grown lots never cross a road or another zone', bad === 0, `${bad}`);
check('deep residential block grows 3-deep complexes', [...w.buildings.values()].some((b) => b.kind === 'r3' && Math.min(bw(b), bh(b)) === 3));
check('thin commercial block only grows 2-deep', [...w.buildings.values()].every((b) => b.kind !== 'c3' || Math.min(bw(b), bh(b)) === 2) && [...w.buildings.values()].some((b) => b.kind === 'c3'));
console.log(fails ? `${fails} FAILED` : 'all passed');
