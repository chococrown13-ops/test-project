/* Headless check: every building's parts stay on its own lot. */
import { CELL, KINDS, N, Road, Zone } from '../src/sim/defs';
import { createSim, tick } from '../src/sim/sim';
import { paintZone, placeFacility, placeRoad, rectCells, roadPath } from '../src/sim/tools';
import { bh, bw, createWorld, idx, riverY } from '../src/sim/world';
import { parts } from '../src/render/buildings';

const w = createWorld(7);
const s = createSim(w);
const row = Math.round(riverY(0, 7) - 22);
placeRoad(w, roadPath(22, row, 90, row), Road.Avenue);
for (let x = 30; x <= 90; x += 8) placeRoad(w, roadPath(x, row - 24, x, row + 12), Road.Street);
for (let y = row - 24; y <= row + 12; y += 8) if (y !== row) placeRoad(w, roadPath(30, y, 90, y), Road.Street);
paintZone(w, rectCells(23, row - 24, 62, row - 1), Zone.R);
paintZone(w, rectCells(23, row + 1, 62, row + 12), Zone.R);
paintZone(w, rectCells(63, row - 3, 78, row + 3), Zone.C);
paintZone(w, rectCells(79, row - 24, 92, row + 12), Zone.I);
placeFacility(w, 'coal', 100, row - 6);
placeRoad(w, roadPath(90, row, 104, row), Road.Street);
let wy = 0;
for (let y = row + 13; y < N; y++) if (w.ground[idx(40, y)] === 1) { wy = y - 4; break; }
placeRoad(w, roadPath(38, row + 8, 38, wy - 1), Road.Street);
placeRoad(w, roadPath(38, wy - 1, 52, wy - 1), Road.Street);
placeFacility(w, 'water', 41, wy);
w.money = 1e7;
for (let m = 1; m <= 48; m++) {
  for (let d = 0; d < 30; d++) for (let k = 0; k < 12; k++) tick(s, 0.1, 1);
  if (w.stats.powerUse > w.stats.powerSupply * 0.85) for (let t = 0; t < 40; t++) { if (!placeFacility(w, 'solar', 92 + (t % 4) * 2, row + 1 + Math.floor(t / 4) * 2)) break; }
  if (w.stats.waterUse > w.stats.waterSupply * 0.85) for (let x = 54; x < 80; x += 4) { if (!placeFacility(w, 'water', x, wy)) { placeRoad(w, roadPath(52, wy - 1, x + 3, wy - 1), Road.Street); break; } }
}
const bad = new Map<string, { n: number; worst: number; ex: string }>();
let total = 0;
w.buildings.forEach((b) => {
  if (!KINDS[b.kind].zone) return;
  total++;
  const x0 = b.x * CELL, z0 = b.y * CELL, x1 = (b.x + bw(b)) * CELL, z1 = (b.y + bh(b)) * CELL;
  let worst = 0, what = '';
  for (const p of parts(b, w)) {
    if (p.shape === 'neon') continue;
    const c = Math.cos(p.rot), sn = Math.sin(p.rot);
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const dx = (u * p.sx) / 2, dz = (v * p.sz) / 2;
      const x = p.x + dx * c + dz * sn, z = p.z - dx * sn + dz * c;
      const out = Math.max(x0 - x, x - x1, z0 - z, z - z1);
      if (out > worst) { worst = out; what = `${p.shape} ${p.sx.toFixed(1)}x${p.sz.toFixed(1)} h${p.sy.toFixed(1)} at ${(p.x - x0).toFixed(1)},${(p.z - z0).toFixed(1)} rot ${p.rot.toFixed(2)}`; }
    }
  }
  if (worst > 0.05) {
    const k = `${b.kind} ${bw(b)}x${bh(b)}`;
    const e = bad.get(k) ?? { n: 0, worst: 0, ex: '' };
    e.n++;
    if (worst > e.worst) { e.worst = worst; e.ex = what; }
    bad.set(k, e);
  }
});
console.log('zoned buildings', total);
for (const [k, e] of bad) console.log(`over lot: ${k} ×${e.n}, worst ${e.worst.toFixed(2)} m (${e.ex})`);
console.log(bad.size ? 'FAIL parts outside their lot' : 'all passed');
if (bad.size) process.exit(1);
