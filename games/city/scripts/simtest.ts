/* Headless check: build a planned town by script and run the simulation for years. */
import { N, Road, Zone } from '../src/sim/defs';
import { createSim, stepDay, tick } from '../src/sim/sim';
import { paintZone, placeFacility, placeRoad, rectCells, roadPath } from '../src/sim/tools';
import { createWorld, idx, riverY } from '../src/sim/world';
import { monthExpense, monthIncome } from '../src/sim/economy';
import { createLine } from '../src/sim/transit';

const w = createWorld(7);
const s = createSim(w);
const row = Math.round(riverY(0, 7) - 22);
const err = (e: string | null) => { if (e) console.log('ERR', e); };
// Avenue east, a grid of streets north of the river.
err(placeRoad(w, roadPath(22, row, 90, row), Road.Avenue));
for (let x = 30; x <= 90; x += 8) err(placeRoad(w, roadPath(x, row - 24, x, row + 12), Road.Street));
for (let y = row - 24; y <= row + 12; y += 8) if (y !== row) err(placeRoad(w, roadPath(30, y, 90, y), Road.Street));
// Zones: residential west, commercial on the avenue, industry east.
paintZone(w, rectCells(23, row - 24, 62, row - 1), Zone.R);
paintZone(w, rectCells(23, row + 1, 62, row + 12), Zone.R);
paintZone(w, rectCells(63, row - 3, 78, row + 3), Zone.C);
paintZone(w, rectCells(79, row - 24, 92, row + 12), Zone.I);
err(placeFacility(w, 'coal', 100, row - 6));
err(placeRoad(w, roadPath(90, row, 104, row), Road.Street));
// Water plant on the river bank.
let wx = 40, wy = 0;
for (let y = row + 13; y < N; y++) if (w.ground[idx(wx, y)] === 1) { wy = y - 4; break; }
err(placeRoad(w, roadPath(38, row + 8, 38, wy - 1), Road.Street));
err(placeRoad(w, roadPath(38, wy - 1, 52, wy - 1), Road.Street));
err(placeFacility(w, 'water', 41, wy));
console.log('water y', wy, 'row', row);
console.log('start money', w.money);
const t0 = performance.now();
let ticks = 0;
for (let m = 1; m <= 60; m++) {
  for (let d = 0; d < 30; d++) {
    for (let k = 0; k < 12; k++) { tick(s, 0.1, 1); ticks++; }
  }
  if (m === 6) { err(placeFacility(w, 'sewage', 47, wy)); err(placeFacility(w, 'school', 44, row - 7)); }
  if (m === 10) {  err(placeFacility(w, 'clinic', 46, row + 9)); err(placeFacility(w, 'police', 54, row - 15)); }
  // Keep utilities ahead of demand, like a sensible player.
  if (w.stats.powerUse > w.stats.powerSupply * 0.85) for (let tries = 0; tries < 40; tries++) { const x = 92 + (tries % 4) * 2, y = row + 1 + Math.floor(tries / 4) * 2; if (!placeFacility(w, 'solar', x, y)) break; }
  if (w.stats.waterUse > w.stats.waterSupply * 0.85) for (let x = 54; x < 80; x += 4) { if (!placeFacility(w, 'water', x, wy)) { err(placeRoad(w, roadPath(52, wy - 1, x + 3, wy - 1), Road.Street)); break; } }
  if (m === 14) {
    // A bus loop round the grid and a subway line under the avenue.
    err(createLine(w, 'bus', [idx(30, row - 16), idx(46, row - 16), idx(62, row - 16), idx(62, row + 8), idx(30, row + 8)]));
    w.money += 40000;
    err(createLine(w, 'metro', [idx(33, row - 5), idx(49, row - 6), idx(65, row - 5), idx(81, row - 5)]));
  }
  if (m === 8) { paintZone(w, rectCells(23, row - 40, 62, row - 25), Zone.C); for (let x = 30; x <= 62; x += 8) err(placeRoad(w, roadPath(x, row - 40, x, row - 24), Road.Street)); err(placeRoad(w, roadPath(30, row - 32, 62, row - 32), Road.Street)); err(placeRoad(w, roadPath(30, row - 40, 62, row - 40), Road.Street)); }
  if (m % 6 === 0) {
    const r = w.reports[w.reports.length - 1];
    const lv = [0, 0, 0, 0];
    w.buildings.forEach((b) => { const l = ({ r1: 1, c1: 1, i1: 1, r2: 2, c2: 2, i2: 2, r3: 3, c3: 3, i3: 3 } as Record<string, number>)[b.kind]; if (l) lv[l]++; });
    console.log(`m${m} day ${w.day} pop ${w.stats.pop} jobs ${Math.round(w.stats.jobs)} money ${w.money} in ${Math.round(monthIncome(r))} out ${Math.round(monthExpense(r))} demand R${w.demand.R.toFixed(0)} C${w.demand.C.toFixed(0)} I${w.demand.I.toFixed(0)} happy ${w.stats.happy.toFixed(0)} power ${w.stats.powerUse.toFixed(0)}/${w.stats.powerSupply} water ${w.stats.waterUse.toFixed(0)}/${w.stats.waterSupply} cars ${s.tr.cars.length} commute ${w.stats.commute.toFixed(1)} cong ${w.stats.congestion.toFixed(2)} transit ${w.lines.map((l) => `${l.name}:${l.riders}`).join(',')} fare ${Math.round(r.income.T)} tcost ${Math.round(r.expense.transit)} lv1/2/3 ${lv.slice(1).join('/')}`);
  }
}
const ms = performance.now() - t0;
for (const k of ['r1', 'c1', 'i1', 'r2', 'c2']) { const bs = [...w.buildings.values()].filter((b) => b.kind === k); if (!bs.length) continue; const avg = (f: (b: typeof bs[0]) => number) => (bs.reduce((a, b) => a + f(b), 0) / bs.length).toFixed(1); console.log(k, bs.length, 'land', avg((b) => w.land[idx(b.x, b.y)]), 'happy', avg((b) => b.happy), 'powered', avg((b) => +b.powered), 'watered', avg((b) => +b.watered), 'occ', avg((b) => b.occ)); }
console.log('ticks', ticks, 'avg ms/tick', (ms / ticks).toFixed(2), 'buildings', w.buildings.size);
void stepDay; void N;
