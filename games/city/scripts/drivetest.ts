/* Headless check of the driving model: the simtest town, then a look at how the cars move. */
import { KINDS, N, Road, Zone } from '../src/sim/defs';
import { createSim, stepDay, tick } from '../src/sim/sim';
import { paintZone, placeFacility, placeRoad, rectCells, roadPath } from '../src/sim/tools';
import { createWorld, idx, riverY } from '../src/sim/world';
import { monthExpense, monthIncome } from '../src/sim/economy';
import { createLine } from '../src/sim/transit';
import { why } from '../src/sim/driving';

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
const months = +(process.argv[2] || 12);
let seen = false;
const chk = (tag: string) => { if (seen) return; const b = s.tr.cars.find((c) => !Number.isFinite(c.v) || !Number.isFinite(c.t)); if (b) { seen = true; console.log('NaN', tag, JSON.stringify({ ...b, path: [...b.path].slice(0, 12), len: b.path.length })); } };
for (let m = 1; m <= months; m++) {
  for (let d = 0; d < 30; d++) {
    for (let k = 0; k < 12; k++) { tick(s, 0.1, 1); ticks++; chk('m' + m); }
    if (d % 10 === 0) { const cs = s.tr.cars; const st = cs.filter((c) => c.v < 0.5).length; const gh = cs.filter((c) => c.ghost > 0).length; void st; void gh; }
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
// Now watch: a sped-up spell of ticks.
for (const k of Object.keys(why)) (why as Record<string, number>)[k] = 0;
const trips0 = s.tr.trips, time0 = s.tr.tripTime;
let still = 0, n = 0, vs = 0;
for (let k = 0; k < 600; k++) {
  tick(s, 0.1, 1);
  for (const c of s.tr.cars) { n++; vs += c.v; if (c.v < 0.5) still++; }
}
console.log('pop', w.stats.pop, 'cars', s.tr.cars.length, 'avg v', (vs / n).toFixed(1), 'still', (still / n * 100).toFixed(0) + '%', 'trips', s.tr.trips - trips0, 'avg trip s', ((s.tr.tripTime - time0) / Math.max(1, s.tr.trips - trips0)).toFixed(1));
console.log('held', JSON.stringify(why));
const ages = s.tr.cars.map((c) => c.age).sort((a, b) => b - a);
console.log('oldest', ages.slice(0, 8).map((a) => a.toFixed(0)).join(' '));
const stuck = s.tr.cars.filter((c) => c.v < 0.5 && (c.gap > 2.5 || !c.ok)).slice(0, 12);
console.log('ghosts now', s.tr.cars.filter((c) => c.ghost > 0).length, 'stuck>20', s.tr.cars.filter((c) => c.stuck > 20).length);
for (const c of stuck) console.log('still car at', c.path[c.i], '->', c.path[c.i + 1], 't', c.t.toFixed(2), 'line', c.line.toFixed(1), 'ok', c.ok, 'gap', c.gap.toFixed(1), 'wait', c.wait.toFixed(1), 'jn', c.jn, 'age', c.age.toFixed(0), 'next', c.path[c.i + 2], 'stuck', c.stuck.toFixed(0), 'v', c.v.toFixed(2), 'lane', c.lane);
const inj = s.tr.cars.filter((c) => c.jn >= 0 && c.v < 0.5).slice(0, 10);
console.log('in junctions, still:', s.tr.cars.filter((c) => c.jn >= 0 && c.v < 0.5).length, 'of', s.tr.cars.filter((c) => c.jn >= 0).length);
for (const c of inj) console.log('  jn', c.jn, c.jf, '->', c.jt, 'on', c.path[c.i], '->', c.path[c.i + 1], 't', c.t.toFixed(2), 'gap', c.gap.toFixed(1), 'line', c.line.toFixed(1), 'ok', c.ok, 'lane', c.lane, 'stuck', c.stuck.toFixed(0));
// Follow who waits for whom from many still cars, to find loops.
{
  const ids = new Map(s.tr.cars.map((c, k) => [c, k]));
  const loops = new Map<string, string[]>();
  const descr = (c: typeof s.tr.cars[0]) => `#${ids.get(c)} ${c.path[c.i]}>${c.path[c.i + 1]}>${c.path[c.i + 2]} t${c.t.toFixed(2)} v${c.v.toFixed(1)} jn${c.jn} ok${+c.ok} ${c.why || ''} ${c.by ? 'by#' + ids.get(c.by) : ''} ${c.held ? 'held#' + ids.get(c.held) : ''}`;
  for (const st of s.tr.cars.filter((c) => c.v < 0.5)) {
    let c: typeof st | null | undefined = st;
    const chain: typeof st[] = [];
    while (c && !chain.includes(c) && chain.length < 400) { chain.push(c); c = c.ok ? c.by : (c.held ?? c.by); }
    if (c && chain.includes(c)) {
      const cyc = chain.slice(chain.indexOf(c));
      const key = cyc.map((x) => ids.get(x)).sort((a, b) => a! - b!).join(',');
      if (!loops.has(key)) loops.set(key, cyc.map(descr));
    }
  }
  console.log('loops', loops.size);
  for (const l of [...loops.values()].slice(0, 4)) { console.log('LOOP len', l.length); for (const x of l.slice(0, 30)) console.log('   ', x); }
}
{
  const by = new Map<number, number>();
  for (const c of s.tr.cars) if (c.v < 0.5) { const j = c.path[c.i + 1]; by.set(j, (by.get(j) || 0) + 1); }
  const top = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log('still cars by node ahead:', top.map(([j, n]) => `${j % 256},${(j / 256) | 0}${j >= 65536 ? 'hi' : ''}:${n}`).join(' '));
  const heads = s.tr.cars.filter((c) => c.v < 0.5 && !c.ok);
  const ws = new Map<string, number>();
  for (const c of heads) ws.set(c.why || '?', (ws.get(c.why || '?') || 0) + 1);
  console.log('held at lines now:', JSON.stringify([...ws]));
  for (const c of heads.slice(0, 10)) { const j = c.path[c.i + 1]; console.log('  at', j % 256, (j / 256) | 0, 'from', c.path[c.i] % 256, (c.path[c.i] / 256) | 0, 'to', c.path[c.i + 2] % 256, (c.path[c.i + 2] / 256) | 0, c.why, 'wait', c.wait.toFixed(0), 'lane', c.lane); }
}
