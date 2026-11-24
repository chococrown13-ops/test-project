/* Headless check of 지하수 관정: where there's no water to draw on, wells are the water supply. */
import { Ground, N, Road } from '../src/sim/defs';
import { createSim, tick } from '../src/sim/sim';
import { hasOpenWater, placeFacility, placeProblem, placeRoad, roadPath } from '../src/sim/tools';
import { createWorld, idx, startRowOf } from '../src/sim/world';

let fails = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); if (!ok) fails++; };

// A dry map: the plain with its pond and stream filled in.
const w = createWorld(7, 't', 'plain');
for (let i = 0; i < N * N; i++) if (w.ground[i] === Ground.Water) w.ground[i] = Ground.Land;
w.money = 1e6;
check('no open water', !hasOpenWater(w));
const row = startRowOf(w);
placeRoad(w, roadPath(22, row, 60, row), Road.Street);
const p = placeProblem(w, 'water', 40, row + 1);
check('정수장 refused on dry land', !!p && p.includes('지하수'), p ?? '');
check('지하수 관정 allowed', placeFacility(w, 'well', 40, row + 1) === null);
const s = createSim(w);
for (let k = 0; k < 40; k++) tick(s, 0.1, 1);
check('wells supply water', w.stats.waterSupply === 330, String(w.stats.waterSupply));

// By the river the 정수장 still goes on the bank, and wells work too.
const r = createWorld(7, 't', 'river');
r.money = 1e6;
check('river map has open water', hasOpenWater(r));
check('정수장 away from water refused', !!placeProblem(r, 'water', 30, startRowOf(r) - 20));
check('wells allowed by the river too', placeProblem(r, 'well', 30, startRowOf(r) - 20) === null);
void idx;
console.log(fails ? `${fails} FAILED` : 'all passed');
if (fails) process.exit(1);
