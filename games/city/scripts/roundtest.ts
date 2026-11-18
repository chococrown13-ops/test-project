/* Headless check of the shallow-meeting rule and 회전교차로. */
import { CELL, Road, Zone } from '../src/sim/defs';
import { curbCapacity } from '../src/sim/parking';
import { ringOf } from '../src/sim/roundabout';
import { deserialize, serialize } from '../src/sim/save';
import { bulldoze, paintZone, placeCurve, placeRoad, placeRoundabout, rectCells, roadPath } from '../src/sim/tools';
import { buildCityNetwork, RING } from '../src/render/roadnet';
import { createWorld, idx, riverY } from '../src/sim/world';
import { stopProblem } from '../src/sim/transit';

let fails = 0;
const check = (name: string, ok: boolean, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); if (!ok) fails++; };
const free = (w: ReturnType<typeof createWorld>, ax: number, ay: number, bx: number, by: number, t = Road.Street) =>
  placeCurve(w, idx(ax, ay), idx(bx, by), ((ax + bx) / 2 + 0.5) * CELL, ((ay + by) / 2 + 0.5) * CELL, t);

const w = createWorld(7);
w.money = 1e7;
const row = Math.round(riverY(0, 7) - 30);
// Two free roads crossing at about 40°: fine.
check('40° crossing allowed', free(w, 20, row, 60, row - 10) === null);
check('crossing at ~40° allowed', free(w, 20, row - 16, 60, row + 6) === null);
// A third at ~10° to the first: refused, with the angle in the message.
const e = free(w, 20, row - 3, 60, row - 10);
check('shallow crossing refused', !!e && e.includes('비스듬히'), e ?? '');
// A grid street crossing a free road at a shallow angle: the free road runs ~14° off the street.
placeRoad(w, roadPath(70, row + 20, 110, row + 20), Road.Street);
const g = free(w, 70, row + 25, 110, row + 15);
check('free road crossing a grid street at 14° refused', !!g, g ?? '');
check('free road crossing a grid street at 45° allowed', free(w, 80, row + 30, 100, row + 10) === null);
// A grid street crossing a free road at a shallow angle.
const w3 = createWorld(7); w3.money = 1e7;
free(w3, 20, row, 60, row - 8);
const gg = placeRoad(w3, roadPath(15, row - 2, 65, row - 2), Road.Street);
check('grid street crossing a 11° free road refused', !!gg, gg ?? '');

// A roundabout on the first crossing's centre lets the shallow road through.
const w2 = createWorld(7); w2.money = 1e7;
placeRoad(w2, roadPath(20, row, 60, row), Road.Street);
check('shallow free road refused before the roundabout', !!free(w2, 20, row + 4, 60, row - 4));
check('roundabout off-road refused', !!placeRoundabout(w2, idx(40, row - 6)));
const r = placeRoundabout(w2, idx(40, row));
check('roundabout placed', r === null, r ?? '');
const ring = ringOf(w2.roundabouts[0]);
check('roundabout size', ring.rc === 13 && ring.outer > 15, JSON.stringify(ring));
const s = free(w2, 20, row + 4, 60, row - 4);
check('shallow free road through the roundabout allowed', s === null, s ?? '');
check('no kerb parking on the ring', curbCapacity(w2, idx(40, row)) === 0 && curbCapacity(w2, idx(41, row)) === 0);
check('kerb parking elsewhere: 3 spaces', curbCapacity(w2, idx(25, row)) === 3, String(curbCapacity(w2, idx(25, row))));
check('no zoning under the ring', paintZone(w2, rectCells(39, row - 1, 41, row + 1), Zone.R) === 0);
check('no bus stop on the ring', !!stopProblem(w2, 'bus', idx(41, row), []) && stopProblem(w2, 'bus', idx(25, row), []) === null);
check('second roundabout too close refused', !!placeRoundabout(w2, idx(43, row)));
const net = buildCityNetwork(w2);
const ringEdges = [...net.edges.values()].filter((x) => x.tag === RING);
check('ring drawn as arcs between mouths', ringEdges.length >= 2, `${ringEdges.length}`);
const inside = [...net.nodes.values()].filter((n) => Math.hypot(n.p.x - ring.x, n.p.z - ring.z) < ring.rc - 1);
check('nothing left inside the ring', inside.length === 0, `${inside.length}`);
const mouths = [...net.nodes.values()].filter((n) => Math.abs(Math.hypot(n.p.x - ring.x, n.p.z - ring.z) - ring.rc) < 0.5 && net.at(n.id).length >= 3);
check('every road meets the ring at a mouth', mouths.length >= 2 && mouths.reduce((s, n) => s + net.at(n.id).length - 2, 0) === 4, `${mouths.length}`);
const w4 = deserialize(serialize(w2));
check('save keeps the roundabout', w4.roundabouts.length === 1 && w4.roundabouts[0].cell === idx(40, row));
bulldoze(w2, [idx(40, row)]);
check('bulldozing its centre removes it', w2.roundabouts.length === 0);

console.log(fails ? `${fails} failed` : 'all passed');
if (fails) process.exit(1);
