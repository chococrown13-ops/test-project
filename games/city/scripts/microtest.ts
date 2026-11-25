/* One avenue with cross streets: feed cars in at one end, count what comes out the other. */
import { N, Road } from '../src/sim/defs';
import { placeRoad, roadPath } from '../src/sim/tools';
import { createWorld, idx, riverY } from '../src/sim/world';
import { createTraffic, newCar, route } from '../src/sim/traffic';
import { drive, laneFor, why } from '../src/sim/driving';

const w = createWorld(7);
w.money = 1e8;
const row = Math.round(riverY(0, 7) - 22);
const cross = process.argv[2] !== 'plain';
placeRoad(w, roadPath(22, row, 90, row), Road.Avenue);
if (cross) for (let x = 30; x <= (process.argv[4] ? +process.argv[4] : 82); x += 8) placeRoad(w, roadPath(x, row - 6, x, row + 6), Road.Street);
const tr = createTraffic();
const path = route(w, tr, idx(22, row), idx(90, row))!;
console.log('path len', path.length, 'cross', cross);
let out = 0, t = 0, made = 0;
const dt = 0.07;
const gapS = +(process.argv[3] || 0.5);
let next = 0;
while (t < 120) {
  if (t >= next) {
    next += gapS;
    const c = newCar(path, 0, Math.random());
    c.lane = laneFor(w, c, 0);
    c.v = 20;
    const blocked = tr.cars.some((o) => o.i === 0 && o.lane === c.lane && o.t < 0.8);
    if (!blocked) { tr.cars.push(c); made++; }
  }
  out += drive(w, tr, dt).length;
  t += dt;
}
const vs = tr.cars.map((c) => c.v);
console.log('made', made, 'out', out, 'per min', (out / 2).toFixed(0), 'on road', tr.cars.length, 'avg v', (vs.reduce((a, b) => a + b, 0) / Math.max(1, vs.length)).toFixed(1), JSON.stringify(why));
void N;
