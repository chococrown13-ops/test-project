/* Headless check of Korean bus kinds, transfers and the 환승 할인. */
import { Road } from '../src/sim/defs';
import { placeRoad, roadPath } from '../src/sim/tools';
import { createWorld, idx, riverY } from '../src/sim/world';
import { busProblem, BUS_TYPES, busTypeOf, createLine, fareIncome, tryTransit, FARE, stationArea, STATION_AREA } from '../src/sim/transit';

let fails = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); if (!ok) fails++; };

const w = createWorld(7);
const row = Math.round(riverY(0, 7) - 22);
w.money = 1e7;
const e = (x: string | null) => { if (x) console.log('ERR', x); };
// An avenue from the west edge, and streets north of it.
e(placeRoad(w, roadPath(0, row, 100, row), Road.Avenue));
for (let x = 20; x <= 100; x += 10) e(placeRoad(w, roadPath(x, row - 30, x, row), Road.Street));
e(placeRoad(w, roadPath(20, row - 30, 100, row - 30), Road.Street));

// 마을버스: short loops only.
check('long 마을버스 refused', !!busProblem(w, 'village', [idx(20, row - 30), idx(100, row - 30), idx(100, row)]));
check('short 마을버스 accepted', !busProblem(w, 'village', [idx(20, row - 30), idx(30, row - 30), idx(30, row)]));
// 광역버스: needs a stop by the expressway.
check('광역버스 without an edge stop refused', !!busProblem(w, 'express', [idx(60, row), idx(90, row)]));
check('광역버스 with an edge stop accepted', !busProblem(w, 'express', [idx(3, row), idx(60, row)]));

// Two lines that share no trip end but meet: 지선 north-west, 간선 along the avenue to the east.
e(createLine(w, 'bus', [idx(20, row - 30), idx(40, row - 30), idx(40, row - 2)], 'branch'));
e(createLine(w, 'bus', [idx(40, row), idx(70, row), idx(100, row)], 'trunk'));
const [branch, trunk] = w.lines;
check('line kinds kept', busTypeOf(branch) === 'branch' && busTypeOf(trunk) === 'trunk', `${branch.name} / ${trunk.name}`);
check('Korean colours', branch.color === BUS_TYPES.branch.color && trunk.color === BUS_TYPES.trunk.color);
check('trunk numbered with three digits, branch with four', /^\d{3}번$/.test(trunk.name) && /^\d{4}번$/.test(branch.name), `${trunk.name} ${branch.name}`);

const from = idx(22, row - 28), to = idx(98, row - 2);
const trial = (discount: boolean) => {
  w.transferDiscount = discount;
  for (const l of w.lines) l.ridersMonth = 0;
  w.transfersMonth = 0;
  let rides = 0;
  for (let k = 0; k < 2000; k++) if (tryTransit(w, from, to, k / 2000) !== null) rides++;
  return { rides, transfers: w.transfersMonth, fare: fareIncome(w), boardings: w.lines.reduce((a, l) => a + l.ridersMonth, 0) };
};
const on = trial(true), off = trial(false);
check('trip with no single line rides by changing', on.rides > 0 && on.transfers > 0, JSON.stringify(on));
check('환승 할인 brings more changing riders', on.rides > off.rides * 2, `${on.rides} vs ${off.rides}`);
check('with the discount a change pays once', Math.abs(on.fare - (on.boardings - on.transfers) * FARE) < 1e-6);
check('without it every boarding pays', Math.abs(off.fare - off.boardings * FARE) < 1e-6);

// 광역버스 carries trips leaving town, barely any inside it.
e(createLine(w, 'bus', [idx(3, row), idx(60, row)], 'express'));
const ex = w.lines[w.lines.length - 1];
const count = (outbound: boolean, a: number, b: number) => { ex.ridersMonth = 0; for (let k = 0; k < 2000; k++) tryTransit(w, a, b, k / 2000, outbound); return ex.ridersMonth; };
const out = count(true, idx(58, row - 2), idx(0, row)), inside = count(false, idx(58, row - 2), idx(8, row - 2));
check('광역버스 serves the trip out of town', out > inside * 3, `${out} vs ${inside}`);

// 역세권: 250 m round each station, worth more.
w.money = 1e7;
const me = createLine(w, 'metro', [idx(51, row - 12), idx(81, row - 12)]);
console.log('metro:', me);
const area = stationArea(w);
check('역세권 covers 250 m round a station', area[idx(51, row - 12 - STATION_AREA)] === 1 && area[idx(51, row - 14 - STATION_AREA)] === 0);
console.log(fails ? `${fails} FAILED` : 'all passed');
