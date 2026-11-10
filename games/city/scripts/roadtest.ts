/* Headless check of diagonal roads, flyovers, underpasses and tunnels on the road graph. */
import { Ground, Level, N, Road } from '../src/sim/defs';
import { forEachNeighbour, NN } from '../src/sim/graph';
import { network } from '../src/sim/network';
import { altCells, bulldoze, diagonalPath, placeAltRoad, placeRoad, roadPath } from '../src/sim/tools';
import { createTraffic, route } from '../src/sim/traffic';
import { createWorld, idx, riverY } from '../src/sim/world';

let fails = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); if (!ok) fails++; };

const w = createWorld(7);
w.money = 1e7;
const row = Math.round(riverY(0, 7) - 22);
const tr = createTraffic();
const err = (e: string | null) => { if (e) console.log('  err:', e); return e; };

// 1. Diagonal road from the avenue end, then a route along it.
err(placeRoad(w, roadPath(22, row, 40, row), Road.Avenue));
err(placeRoad(w, diagonalPath(40, row, 52, row - 12), Road.Street));
const p1 = route(w, tr, idx(22, row), idx(52, row - 12));
check('diagonal route exists', !!p1, `len ${p1?.length}`);
check('diagonal route is short (uses diagonals)', !!p1 && p1.length <= 32, `${p1?.length} nodes`);

// 2. A flyover over a crossing street: no intersection with it.
err(placeRoad(w, roadPath(60, row - 10, 60, row + 6), Road.Street)); // the street to cross
err(placeRoad(w, roadPath(40, row, 55, row), Road.Avenue));
err(placeRoad(w, roadPath(66, row, 72, row), Road.Avenue));
const fly = altCells(w, roadPath(55, row, 66, row));
check('flyover trims its ground ends', fly.length === 10, `cells ${fly.length}`);
err(placeAltRoad(w, roadPath(55, row, 66, row), Level.Elevated));
const net = network(w);
check('flyover joins the avenue on both sides', net.comp[idx(54, row)] === net.comp[idx(72, row)]);
const nb: number[] = [];
forEachNeighbour(w, idx(60, row) + NN, (n) => nb.push(n));
check('flyover deck does not meet the street below', !nb.includes(idx(60, row - 1)) && !nb.includes(idx(60, row)), JSON.stringify(nb));
const p2 = route(w, tr, idx(50, row), idx(70, row));
check('route crosses on the deck', !!p2 && Array.from(p2).some((n) => n >= NN), `${p2?.length}`);
check('street under the flyover still runs', !!route(w, tr, idx(60, row - 10), idx(60, row + 6)));

// 3. Underpass and a tunnel through the mountains.
let mx = -1, my = -1;
outer: for (let y = 2; y < row - 14; y++) for (let x = 30; x < N - 30; x++) if (w.ground[idx(x, y)] === Ground.Mountain && w.ground[idx(x, y + 6)] === Ground.Land) { mx = x; my = y; break outer; }
check('map has mountains', mx >= 0, `at ${mx},${my}`);
const groundCount = w.ground.reduce((a, g) => a + (g === Ground.Mountain ? 1 : 0), 0);
console.log('  mountain cells', groundCount, 'of', N * N);
check('ground road refused on a mountain', !!placeRoad(w, roadPath(mx, my, mx, my + 1), Road.Street));
// Find a straight north-south line that crosses mountain and has land at both ends.
let tx = -1, top = -1, bot = -1;
// A vertical run land, mountain, land anywhere on the map (the hill across the river).
for (let x = 4; x < N - 4 && tx < 0; x++) for (let y = 4; y < N - 6 && tx < 0; y++) {
  if (w.ground[idx(x, y)] !== Ground.Land || w.ground[idx(x, y + 1)] !== Ground.Mountain) continue;
  let e = y + 1;
  while (e < N - 4 && w.ground[idx(x, e)] === Ground.Mountain) e++;
  if ([0, 1, 2, 3].every((k) => w.ground[idx(x, e + k)] === Ground.Land) && [0, 1, 2].every((k) => w.ground[idx(x, y - k)] === Ground.Land)) { tx = x; top = y; bot = e; }
}
console.log('  tunnel line', tx, top, bot);
if (tx >= 0) {
  err(placeRoad(w, roadPath(tx, top - 2, tx, top), Road.Street));
  err(placeRoad(w, roadPath(tx, bot, tx, bot + 3), Road.Street));
  check('underpass refused under a mountain', !!placeAltRoad(w, roadPath(tx, top, tx, bot), Level.Underpass));
  check('tunnel accepted', !err(placeAltRoad(w, roadPath(tx, top, tx, bot), Level.Tunnel)));
  check('tunnel connects both sides', !!route(w, tr, idx(tx, top - 2), idx(tx, bot + 3)));
} else console.log('  (no mountain line suitable for a tunnel test on this seed)');

// 3b. Dragging along an existing avenue lifts it over a crossing street.
const w2 = createWorld(7); w2.money = 1e7;
placeRoad(w2, roadPath(22, row, 90, row), Road.Avenue);
placeRoad(w2, roadPath(60, row - 8, 60, row + 8), Road.Street);
check('lift along a road accepted', !err(placeAltRoad(w2, roadPath(52, row, 68, row), Level.Elevated)));
check('ramps replaced the ground road', !w2.road[idx(53, row)] && !w2.road[idx(67, row)] && !!w2.roadAlt[idx(53, row)]);
const tr2 = createTraffic();
const lifted = route(w2, tr2, idx(40, row), idx(80, row));
check('through traffic uses the deck', !!lifted && Array.from(lifted).some((n) => n >= NN));
check('local road under the deck still meets the cross street', network(w2).comp[idx(58, row)] === network(w2).comp[idx(60, row - 8)]);

// 4. Bulldozing a flyover keeps the street under it.
bulldoze(w, [idx(60, row)]);
check('bulldoze takes the deck first', !w.roadAlt[idx(60, row)] && !!w.road[idx(60, row)]);
console.log(fails ? `${fails} FAILED` : 'all passed');
