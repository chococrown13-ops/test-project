/* Cross-check with the Unity port: a scripted town run day by day, numbers printed each half year. */
import { Road, Zone } from '../src/sim/defs';
import { createSim, tick } from '../src/sim/sim';
import { paintZone, placeFacility, placeRoad, rectCells, roadPath } from '../src/sim/tools';
import { createWorld, idx, riverY } from '../src/sim/world';
import { monthExpense, monthIncome } from '../src/sim/economy';
import { createLine } from '../src/sim/transit';
import { pack, unpack } from '../src/sim/save';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const out = process.argv[2] ?? '/tmp/porttest';
const w = createWorld(7);
const s = createSim(w);
const row = Math.round(riverY(0, 7) - 22);
const err = (e: string | null) => { if (e) console.log('ERR', e); };
err(placeRoad(w, roadPath(22, row, 90, row), Road.Avenue));
for (let x = 30; x <= 90; x += 8) err(placeRoad(w, roadPath(x, row - 24, x, row + 12), Road.Street));
for (let y = row - 24; y <= row + 12; y += 8) if (y !== row) err(placeRoad(w, roadPath(30, y, 90, y), Road.Street));
paintZone(w, rectCells(23, row - 24, 62, row - 1), Zone.R);
paintZone(w, rectCells(23, row + 1, 62, row + 12), Zone.R);
paintZone(w, rectCells(63, row - 3, 78, row + 3), Zone.C);
paintZone(w, rectCells(79, row - 24, 92, row + 12), Zone.I);
err(placeFacility(w, 'coal', 100, row - 6));
err(placeRoad(w, roadPath(90, row, 104, row), Road.Street));
let wy = 0;
for (let y = row + 13; y < 256; y++) if (w.ground[idx(40, y)] === 1) { wy = y - 4; break; }
err(placeRoad(w, roadPath(38, row + 8, 38, wy - 1), Road.Street));
err(placeRoad(w, roadPath(38, wy - 1, 52, wy - 1), Road.Street));
err(placeFacility(w, 'water', 41, wy));
console.log('row', row, 'wy', wy, 'money', w.money);
const traffic = process.env.TRAFFIC === '1';
for (let m = 1; m <= 36; m++) {
  for (let d = 0; d < 30; d++) {
    if (traffic) for (let k = 0; k < 12; k++) tick(s, 0.1, 1);
    else { s.acc = 1.2; tick(s, 0.0, 1); }
  }
  if (m === 6) { err(placeFacility(w, 'sewage', 47, wy)); err(placeFacility(w, 'school', 44, row - 7)); }
  if (m === 10) { err(placeFacility(w, 'clinic', 46, row + 9)); err(placeFacility(w, 'police', 54, row - 15)); }
  if (w.stats.powerUse > w.stats.powerSupply * 0.85) for (let tries = 0; tries < 40; tries++) { const x = 92 + (tries % 4) * 2, y = row + 1 + Math.floor(tries / 4) * 2; if (!placeFacility(w, 'solar', x, y)) break; }
  if (w.stats.waterUse > w.stats.waterSupply * 0.85) for (let x = 54; x < 80; x += 4) { if (!placeFacility(w, 'water', x, wy)) { err(placeRoad(w, roadPath(52, wy - 1, x + 3, wy - 1), Road.Street)); break; } }
  if (m === 14) {
    err(createLine(w, 'bus', [idx(30, row - 16), idx(46, row - 16), idx(62, row - 16), idx(62, row + 8), idx(30, row + 8)]));
    w.money += 40000;
    err(createLine(w, 'metro', [idx(33, row - 5), idx(49, row - 6), idx(65, row - 5), idx(81, row - 5)]));
  }
  if (m % 6 === 0) {
    const r = w.reports[w.reports.length - 1];
    let land = 0; for (let i = 0; i < 65536; i++) land += w.land[i];
    console.log(`m${m} day ${w.day} pop ${w.stats.pop} bld ${w.buildings.size} money ${Math.round(w.money)} in ${Math.round(monthIncome(r))} out ${Math.round(monthExpense(r))} R${w.demand.R.toFixed(2)} C${w.demand.C.toFixed(2)} I${w.demand.I.toFixed(2)} happy ${w.stats.happy.toFixed(2)} land ${land.toFixed(1)} rng ${w.rng} cars ${s.tr.cars.length}`);
  }
}
writeFileSync(out + '.ts.city', pack(w));
if (existsSync(out + '.cs.city')) { const v = unpack(readFileSync(out + '.cs.city', 'utf8'))!; console.log('read C# save:', v.name, 'pop', v.stats.pop, 'bld', v.buildings.size, 'day', v.day, 'money', Math.round(v.money)); }
