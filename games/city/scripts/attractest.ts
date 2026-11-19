/* Headless check of the Korean everyday places: rules, coverage, trips, tourism and festivals. */
import { Ground, N, Road, Zone } from '../src/sim/defs';
import { CIVIC, isCherry, noCarTrip } from '../src/sim/attractions';
import { updateLand } from '../src/sim/growth';
import { deserialize, serialize } from '../src/sim/save';
import { createSim, stepDay } from '../src/sim/sim';
import { addBuilding, paintZone, placeFacility, placeProblem, placeRoad, plantTrees, rectCells, roadPath } from '../src/sim/tools';
import { createWorld, idx, startRowOf } from '../src/sim/world';

let fails = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); if (!ok) fails++; };

const w = createWorld(7, 't', 'river');
w.money = 1e7;
const row = startRowOf(w);
placeRoad(w, roadPath(22, row, 80, row), Road.Avenue);
placeRoad(w, roadPath(40, row - 20, 40, row), Road.Street);
// 고속버스터미널 must touch an avenue.
check('터미널 away from an avenue refused', !!placeProblem(w, 'terminal', 42, row - 12));
check('터미널 on the avenue allowed', placeFacility(w, 'terminal', 50, row + 1) === null);
// KTX역: one per city.
check('KTX역 placed', placeFacility(w, 'ktx', 60, row + 1) === null);
check('second KTX역 refused', !!placeProblem(w, 'ktx', 70, row + 1));
// 등산로 입구 by a mountain only.
let mx = -1, my = -1;
for (let y = 2; y < N - 2 && mx < 0; y++) for (let x = 2; x < N - 2; x++) {
  if (w.ground[idx(x, y)] === Ground.Land && w.ground[idx(x + 1, y)] === Ground.Mountain && !w.road[idx(x, y)] && w.bld[idx(x, y)] < 0) { mx = x; my = y; break; }
}
check('등산로 입구 in the open refused', !!placeProblem(w, 'trailhead', 45, row - 10));
check('등산로 입구 at the foot of a hill allowed', mx >= 0 && placeProblem(w, 'trailhead', mx, my) === null, `${mx},${my}`);
// Civic coverage.
placeFacility(w, 'office', 41, row - 10);
placeFacility(w, 'library', 38, row - 14);
placeFacility(w, 'bike', 41, row - 5);
placeFacility(w, 'bike', 41, row - 16);
updateLand(w);
check('행정복지센터 reaches its neighbourhood', (w.civic[idx(44, row - 10)] & CIVIC.office) > 0 && !(w.civic[idx(70, row - 10)] & CIVIC.office));
check('도서관 counts as schooling nearby', w.edu[idx(38, row - 12)] === 1);
// Bikes between two docks; nothing between far cells.
const bikesBefore = w.bikeMonth;
let bikes = 0;
for (let k = 0; k < 100; k++) if (noCarTrip(w, idx(40, row - 6), idx(40, row - 15), false, k / 100) !== null) bikes++;
check('short trips between docks go by bike (some)', bikes > 10 && bikes < 50 && w.bikeMonth === bikesBefore + bikes, `${bikes}`);
check('no bikes without docks', noCarTrip(w, idx(70, row - 2), idx(75, row - 2), false, 0.01) === null);
let out = 0;
for (let k = 0; k < 100; k++) if (noCarTrip(w, idx(40, row - 6), idx(0, row), true, k / 100) !== null) out++;
check('trips out of town take the coach or KTX (some)', out >= 40 && out <= 50, `${out}`);
// Tourism income and festivals.
paintZone(w, rectCells(41, row - 20, 44, row - 1), Zone.R);
for (let y = row - 18; y < row - 2; y += 2) { const b = addBuilding(w, 'r1', 43, y); b.occ = 10; }
plantTrees(w, rectCells(22, row, 80, row));
plantTrees(w, rectCells(40, row - 20, 40, row));
const cherries = [...Array(N * N).keys()].filter((i) => w.trees[i] && isCherry(i)).length;
const s = createSim(w);
for (let d = 0; d < 32; d++) stepDay(s);
check('tourism shows in the books', (w.reports[0]?.income.V ?? 0) > 0, `${Math.round(w.reports[0]?.income.V ?? 0)}`);
check(`벚꽃축제 in April when the 벚나무 are there (${cherries})`, cherries < 20 ? !w.festival : w.festival?.kind === 'cherry', JSON.stringify(w.festival?.name));
// Fireworks in October from a 수변공원.
let rp = false;
for (let y = row; y < N - 3 && !rp; y++) for (let x = 25; x < 90 && !rp; x++) if (!placeProblem(w, 'riverpark', x, y)) rp = placeFacility(w, 'riverpark', x, y) === null;
check('수변공원 placed', rp);
w.festival = null;
while (Math.floor(w.day / 30) % 12 !== 7) stepDay(s); // month 10
stepDay(s);
check('불꽃축제 in October', w.festival?.kind === 'fireworks', JSON.stringify(w.festival));
const w2 = deserialize(serialize(w));
check('festival and civic saved/rebuilt', w2.festival?.kind === 'fireworks' && w2.civic.length === N * N);
for (let d = 0; d < 5; d++) stepDay(s);
check('festival closes', !w.festival);
console.log(fails ? `${fails} FAILED` : 'all passed');
if (fails) process.exit(1);
