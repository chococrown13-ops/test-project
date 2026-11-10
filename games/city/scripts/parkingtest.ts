/* Headless check of parking: kerb spaces, lots, unmet demand and its effects. */
import { N, Road, Zone } from '../src/sim/defs';
import { curbCapacity, parkedSqueeze, updateParking } from '../src/sim/parking';
import { createSim, tick } from '../src/sim/sim';
import { paintZone, placeFacility, placeRoad, rectCells, roadPath } from '../src/sim/tools';
import { createWorld, idx, riverY } from '../src/sim/world';

let fails = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); if (!ok) fails++; };

const w = createWorld(7);
w.money = 1e7;
const row = Math.round(riverY(0, 7) - 22);
// The same planned town as simtest: avenue, a street grid, homes, shops and industry.
placeRoad(w, roadPath(22, row, 90, row), Road.Avenue);
for (let x = 30; x <= 90; x += 8) placeRoad(w, roadPath(x, row - 24, x, row + 12), Road.Street);
for (let y = row - 24; y <= row + 12; y += 8) if (y !== row) placeRoad(w, roadPath(30, y, 90, y), Road.Street);
check('junction has no kerb parking', curbCapacity(w, idx(30, row)) === 0);
check('straight street has kerb spaces', curbCapacity(w, idx(30, row - 4)) === 4);
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
const s = createSim(w);
for (let d = 0; d < 720; d++) {
  for (let k = 0; k < 12; k++) tick(s, 0.1, 1);
  if (d % 30 === 0 && w.stats.powerUse > w.stats.powerSupply * 0.85) for (let t = 0; t < 40; t++) { if (!placeFacility(w, 'solar', 92 + (t % 4) * 2, row + 1 + Math.floor(t / 4) * 2)) break; }
  if (d % 30 === 0 && w.stats.waterUse > w.stats.waterSupply * 0.85) for (let x = 54; x < 80; x += 4) { if (!placeFacility(w, 'water', x, wy)) { placeRoad(w, roadPath(52, wy - 1, x + 3, wy - 1), Road.Street); break; } }
}
const st = w.stats;
console.log(`  pop ${Math.round(st.pop)} demand ${st.parkDemand} kerb ${st.parkCurb} unmet ${st.parkUnmet}`);
check('buildings want to park', st.parkDemand > 50);
const parkedCells = w.parked.reduce((a, v) => a + (v ? 1 : 0), 0);
check('cars parked on kerbs', parkedCells > 0, `${parkedCells} cells`);
const full = w.parked.findIndex((v) => v === 4);
check('a full kerb squeezes the road', full < 0 || Math.abs(parkedSqueeze(w, full) - 0.67) < 0.01);
// Ban avenue parking: fewer kerb spaces.
const before = st.parkCurb;
w.noAvenueParking = true; updateParking(w);
check('avenue ban removes kerb spaces', w.stats.parkCurb < before, `${before} -> ${w.stats.parkCurb}`);
w.noAvenueParking = false; updateParking(w);
// A parking tower next to the busiest block takes cars off the kerb.
const unmet0 = w.stats.parkUnmet;
let hot = -1, best = 0;
// The worst neighbourhood: most unmet parking within a tower's reach.
for (let i = 0; i < w.parkPress.length; i++) {
  if (w.road[i] || !w.parkPress[i]) continue;
  const x0 = i % 128, y0 = (i / 128) | 0;
  let sum = 0;
  for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) { const x = x0 + dx, y = y0 + dy; if (x >= 0 && y >= 0 && x < 128 && y < 128 && !w.road[idx(x, y)]) sum += w.parkPress[idx(x, y)]; }
  if (sum > best) { best = sum; hot = i; }
}
let placed = false;
if (hot >= 0) {
  const hx = hot % 128, hy = (hot / 128) | 0;
  outer: for (let r = 0; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = hx + dx, y = hy + dy;
    if (!w.road[idx(x, y)] && w.bld[idx(x, y)] >= 0 && !placeFacility(w, 'parktower', x, y)) { placed = true; break outer; }
    if (!w.road[idx(x, y)] && w.bld[idx(x, y)] < 0 && !placeFacility(w, 'parktower', x, y)) { placed = true; break outer; }
  }
}
updateParking(w);
console.log(`  hottest area ${best} placed tower ${placed} occ ${[...w.buildings.values()].filter((b) => b.kind === 'parktower').map((b) => b.occ)}`);
check('tower takes cars that had nowhere to go', placed && w.stats.parkUnmet < unmet0 - 40, `${unmet0} -> ${w.stats.parkUnmet}`);
console.log(fails ? `${fails} FAILED` : 'all passed');
