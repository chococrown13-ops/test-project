/* Headless check: houses only on lots with frontage; the backland stays open as 동네 쉼터. */
import { KINDS, N, Road, Zone } from '../src/sim/defs';
import { fronts, isPocket, pockets } from '../src/sim/pockets';
import { createSim, tick } from '../src/sim/sim';
import { addBuilding, paintZone, placeFacility, placeRoad, rectCells, roadPath } from '../src/sim/tools';
import { createWorld, idx, startRowOf } from '../src/sim/world';

let fails = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); if (!ok) fails++; };
const w = createWorld(7, 't', 'plain');
w.money = 1e7;
const row = startRowOf(w);
// A block 7 deep between two streets: rows 1 and 7 front a road, rows 2-6 are backland… with ZONE_DEPTH 3, rows 2-3 and 5-6.
placeRoad(w, roadPath(22, row, 60, row), Road.Avenue);
placeRoad(w, roadPath(22, row - 8, 60, row - 8), Road.Street);
for (const x of [22, 40, 60]) placeRoad(w, roadPath(x, row - 8, x, row), Road.Street);
paintZone(w, rectCells(23, row - 7, 39, row - 1), Zone.R);
// An old buried house, as a pre-rule save would have.
const buried = addBuilding(w, 'r1', 30, row - 4);
placeFacility(w, 'coal', 70, row - 6);
placeRoad(w, roadPath(60, row - 3, 70, row - 3), Road.Street);
let wy = 0;
for (let y = row + 1; y < N; y++) if (w.ground[idx(40, y)] === 1) { wy = y; break; }
placeFacility(w, 'well', 45, row + 1);
const s = createSim(w);
for (let k = 0; k < 12 * 30 * 4; k++) tick(s, 0.1, 1);
void wy;
let buriedNow = 0, built = 0;
w.buildings.forEach((b) => { if (!KINDS[b.kind].zone) return; built++; if (!fronts(w, b)) buriedNow++; });
check('houses grew', built > 20, `${built}`);
check('every house fronts a road', buriedNow === 0, `${buriedNow} buried`);
check('the old buried house was cleared', !w.buildings.has(buried.id));
const pk = pockets(w);
check('backland left as pockets', pk.length > 10 && pk.every((i) => isPocket(w, i)), `${pk.length}`);
check('a lot three deep from the avenue is a pocket', isPocket(w, idx(30, row - 3)));
console.log(fails ? `${fails} FAILED` : 'all passed');
if (fails) process.exit(1);
