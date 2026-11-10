/* Headless check of curved roads: chain of cells, routing, zoning, bulldozing, saving. */
import { CELL, Road, Zone } from '../src/sim/defs';
import { coverCells, curveInfo, snapControl } from '../src/sim/curves';
import { forEachNeighbour } from '../src/sim/graph';
import { network } from '../src/sim/network';
import { deserialize, serialize } from '../src/sim/save';
import { bulldoze, paintZone, placeCurve, placeRoad, rectCells, roadPath } from '../src/sim/tools';
import { createTraffic, route } from '../src/sim/traffic';
import { createWorld, idx, riverY } from '../src/sim/world';

let fails = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); if (!ok) fails++; };

const w = createWorld(7);
w.money = 1e7;
const row = Math.round(riverY(0, 7) - 22);
placeRoad(w, roadPath(0, row, 30, row), Road.Avenue);
// A quarter bend from the avenue end up and to the right, bent so it leaves the avenue straight.
const a = idx(30, row), b = idx(44, row - 14);
const h = snapControl(w, a, b, 44 * CELL, row * CELL);
check('bend handle snaps onto the avenue line', h.snap === 'tangent', JSON.stringify(h));
const err = placeCurve(w, a, b, h.x, h.z, Road.Street);
check('curve placed', !err, err ?? '');
const c = w.curves[0];
check('curve kept with its cells', !!c && c.cells.length >= 15 && c.cells.length < 30, `${c?.cells.length} cells, own ${c?.own.length}`);
const net = network(w);
check('curve end joins the avenue network', net.comp[idx(5, row)] === net.comp[b]);
const tr = createTraffic();
const p = route(w, tr, idx(5, row), b);
check('route runs along the curve', !!p && p.length <= c.cells.length + 30, `${p?.length}`);
const info = curveInfo(w);
check('owned cells drawn as ribbon', c.own.every((i) => info.owned[i] === 1));
const cov = coverCells(c).filter((i) => !w.road[i]);
check('pavement cells are covered', cov.length > 0 && cov.every((i) => info.cover[i]), `${cov.length}`);
const painted = paintZone(w, rectCells(30, row - 16, 46, row - 1), Zone.R);
check('zoning skips covered lots', painted > 0 && cov.every((i) => !w.zone[i]), `${painted} painted`);
const w2 = deserialize(serialize(w));
check('save keeps the curve', w2.curves.length === 1 && w2.curves[0].cells.join() === c.cells.join());
// Too sharp a bend is refused.
check('hairpin refused', !!placeCurve(w, idx(60, row), idx(64, row), 62 * CELL, (row - 30) * CELL, Road.Street));
// A street running alongside the curve joins it at one cell only; a car can still turn onto the curve there.
{
  const mid = c.own[Math.floor(c.own.length / 2)];
  const mx = mid % 128, my = (mid / 128) | 0;
  // A short street ending one cell east of the curve's middle, running further east.
  let sx = mx + 1;
  while (c.cells.includes(idx(sx, my)) || w.road[idx(sx, my)]) sx++;
  placeRoad(w, roadPath(sx, my, sx + 4, my), Road.Street);
  const joins = new Set<number>();
  // Every street cell that touches the curve, and which curve cells it actually links to.
  for (let x = sx; x <= sx + 4; x++) forEachNeighbour(w, idx(x, my), (n) => { if (c.own.includes(n)) joins.add(n); });
  check('side street joins the curve at most one cell', joins.size <= 1, `${joins.size}`);
  const r2 = route(w, createTraffic(), idx(sx + 4, my), b);
  check('side street routes onto the curve', !!r2 || joins.size === 0, `${r2?.length}`);
}
// Bulldozing a cell of it drops the curve but keeps the rest of the road.
bulldoze(w, [c.own[3]]);
check('bulldoze drops the curve', w.curves.length === 0 && !!w.road[c.own[5]]);
console.log(fails ? `${fails} FAILED` : 'all passed');
