/* Headless check of one-way roads, paired carriageways and widening. */
import { Road } from '../src/sim/defs';
import { forEachDriveStep, forEachNeighbour } from '../src/sim/graph';
import { placeCurve, placeRoad, roadPath, setOneWay, widenRoad } from '../src/sim/tools';
import { createTraffic, route } from '../src/sim/traffic';
import { createWorld, idx, riverY } from '../src/sim/world';

let fails = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); if (!ok) fails++; };
const w = createWorld(7);
w.money = 1e7;
const row = Math.round(riverY(0, 7) - 30);

// A one-way street east: cars can go east along it, never west.
placeRoad(w, roadPath(20, row, 40, row), Road.Street);
check('one-way set', setOneWay(w, roadPath(22, row, 38, row)) === null);
const steps = (i: number) => { const o: number[] = []; forEachDriveStep(w, i, (n) => o.push(n)); return o; };
const c = idx(30, row);
check('east allowed', steps(c).includes(c + 1));
check('west refused', !steps(c).includes(c - 1));
const tr = createTraffic();
check('route east exists', !!route(w, tr, idx(23, row), idx(37, row)));
check('route west refused', route(w, tr, idx(37, row), idx(23, row)) === null);
check('dragging the same way again makes it two-way', setOneWay(w, roadPath(22, row, 38, row)) === null && w.oneway[c] === 0);

// Two streets side by side become a pair of one-way carriageways, east on the southern one.
placeRoad(w, roadPath(50, row, 70, row), Road.Street);
placeRoad(w, roadPath(50, row + 1, 70, row + 1), Road.Street);
const n = idx(60, row), s = idx(60, row + 1);
check('northern one goes west', w.oneway[n] === 3, String(w.oneway[n]));
check('southern one goes east', w.oneway[s] === 1, String(w.oneway[s]));
const nb: number[] = []; forEachNeighbour(w, n, (m) => nb.push(m));
check('no rung between the pair', !nb.includes(s));
// A side street crossing both still joins them.
placeRoad(w, roadPath(60, row - 6, 60, row + 6), Road.Street);
const nb2: number[] = []; forEachNeighbour(w, n, (m) => nb2.push(m));
check('a crossing street links the pair', nb2.includes(s));
check('route round the pair both ways', !!route(w, tr, idx(52, row + 1), idx(68, row + 1)) && !!route(w, tr, idx(68, row), idx(52, row)));

// Widening: a straight street and a curved one.
placeRoad(w, roadPath(20, row + 10, 40, row + 10), Road.Street);
const money = w.money;
check('widen straight', widenRoad(w, roadPath(25, row + 10, 30, row + 10)) === null && w.road[idx(27, row + 10)] === Road.Avenue && w.road[idx(22, row + 10)] === Road.Street);
check('widen charged', w.money < money);
const e = placeCurve(w, idx(20, row + 20), idx(40, row + 26), 300, (row + 18) * 10, Road.Street);
const cv = w.curves[w.curves.length - 1];
check('curve laid', !e, e ?? '');
check('widen curve as a whole', widenRoad(w, [cv.cells[3]]) === null && cv.t === Road.Avenue && cv.cells.every((i) => w.road[i] === Road.Avenue));
console.log(fails ? `${fails} failed` : 'all passed');
