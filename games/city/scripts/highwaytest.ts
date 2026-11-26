/* Headless check of 고속도로: no level crossings, 나들목 joins, 분기점, 톨게이트 pays. */
import { Road, Zone } from '../src/sim/defs';
import { forEachNeighbour } from '../src/sim/graph';
import { findAccess } from '../src/sim/network';
import { addBuilding, paintZone, placeHighwayPart, placeRoad, rectCells, roadPath } from '../src/sim/tools';
import { createTraffic, route } from '../src/sim/traffic';
import { createWorld, idx, riverY } from '../src/sim/world';

let fails = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); if (!ok) fails++; };
const w = createWorld(7);
w.money = 1e7;
const row = Math.round(riverY(0, 7) - 40);
const H = (x: number) => idx(x, row);
check('highway laid', placeRoad(w, roadPath(30, row, 90, row), Road.Highway) === null);
check('a street across it is refused', placeRoad(w, roadPath(50, row - 5, 50, row + 5), Road.Street) !== null);
// A street running up beside it, ending next to it.
placeRoad(w, roadPath(60, row - 8, 60, row - 1), Road.Street);
const nbs = (i: number) => { const o: number[] = []; forEachNeighbour(w, i, (n) => o.push(n)); return o; };
check('no link without a 나들목', !nbs(H(60)).includes(idx(60, row - 1)));
const tr = createTraffic();
check('no route onto it yet', route(w, tr, idx(60, row - 8), H(85)) === null);
check('나들목 placed', placeHighwayPart(w, H(60), 'ic') === null);
check('linked at the 나들목', nbs(H(60)).includes(idx(60, row - 1)));
tr.routes.clear();
check('route onto it now', !!route(w, tr, idx(60, row - 8), H(85)));
// A second highway meeting it: a 분기점, joined without a 나들목.
check('second highway', placeRoad(w, roadPath(75, row + 1, 75, row + 20), Road.Highway) === null);
check('분기점 joins highways', nbs(H(75)).includes(idx(75, row + 1)));
// Nothing fronts a highway.
paintZone(w, rectCells(40, row + 1, 45, row + 2), Zone.R);
const b = addBuilding(w, 'r1', 42, row + 1);
check('no access from a highway', findAccess(w, b) === -1);
check('톨게이트 on a straight stretch', placeHighwayPart(w, H(70), 'toll') === null);
check('not on the 나들목', placeHighwayPart(w, H(60), 'toll') !== null);
console.log(fails ? `${fails} failed` : 'all passed');
