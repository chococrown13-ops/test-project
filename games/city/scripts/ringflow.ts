/* Cars from four sides through a 회전교차로 (and, for comparison, a plain crossroads with lights). */
import { Road } from '../src/sim/defs';
import { bulldoze, placeRoad, placeRoundabout, roadPath } from '../src/sim/tools';
import { createWorld, idx, riverY } from '../src/sim/world';
import { createTraffic, newCar, route } from '../src/sim/traffic';
import { drive, laneFor } from '../src/sim/driving';

for (const ring of [false, true]) {
  const w = createWorld(7);
  w.money = 1e8;
  const row = Math.round(riverY(0, 7) - 30), cx = 60;
  placeRoad(w, roadPath(30, row, 90, row), Road.Street);
  placeRoad(w, roadPath(cx, row - 30, cx, row + 20), Road.Street);
  if (ring) { const e = placeRoundabout(w, idx(cx, row), (ww, id) => bulldoze(ww, [id])); if (e) console.log('ring:', e); }
  const tr = createTraffic();
  const ends = [idx(30, row), idx(90, row), idx(cx, row - 30), idx(cx, row + 20)];
  const paths = [];
  for (const a of ends) for (const b of ends) if (a !== b) { const p = route(w, tr, a, b); if (p) paths.push(p); }
  let out = 0, t = 0, k = 0;
  const dt = 0.07;
  while (t < 120) {
    if (Math.floor(t / 0.5) !== Math.floor((t - dt) / 0.5)) {
      const path = paths[k++ % paths.length];
      const c = newCar(path, 0, Math.random());
      c.lane = laneFor(w, c, 0);
      if (!tr.cars.some((o) => o.path[o.i] === path[0] && o.path[o.i + 1] === path[1] && o.t < 0.8)) tr.cars.push(c);
    }
    out += drive(w, tr, dt).length;
    t += dt;
  }
  const still = tr.cars.filter((c) => c.v < 0.5).length, old = Math.max(0, ...tr.cars.map((c) => c.age));
  console.log(ring ? 'roundabout' : 'lights', 'rings', w.roundabouts.length, 'paths', paths.length, 'out', out, 'on road', tr.cars.length, 'still', still, 'oldest', old.toFixed(0));
}
