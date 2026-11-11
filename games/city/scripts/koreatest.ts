/* Headless check of the real-Korea tiles: every tile decodes, has a flat start road, and a city on it runs. */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { Ground, N, Road, Zone } from '../src/sim/defs';
import { createSim, stepDay } from '../src/sim/sim';
import { hasOpenWater, paintZone, placeFacility, placeProblem, placeRoad, rectCells, roadPath } from '../src/sim/tools';
import { createRealWorld, idx } from '../src/sim/world';
import { network } from '../src/sim/network';

let fails = 0;
const check = (name: string, ok: boolean, extra = '') => { if (!ok) { console.log(`FAIL ${name} ${extra}`); fails++; } };
const dir = process.argv[2] ?? 'games/city/src/data/korea/';
const index = JSON.parse(fs.readFileSync(dir + 'index.json', 'utf8'));
const tiles: { id: string; row: number; lat: number; lon: number; data: string }[] = [];
for (const f of fs.readdirSync(dir)) if (/^p\d+\.json$/.test(f)) tiles.push(...JSON.parse(fs.readFileSync(dir + f, 'utf8')));
check('every index entry has data', index.tiles.every((t: { id: string }) => tiles.some((x) => x.id === t.id)));
const units = new Set(index.tiles.map((t: { id: string }) => t.id.split('-')[0]));
console.log('tiles', tiles.length, 'units', units.size);
let noWater = 0;
for (const t of tiles) {
  const cells = new Uint8Array(zlib.inflateRawSync(Buffer.from(t.data, 'base64')));
  check(`${t.id} size`, cells.length === N * N);
  const info = index.tiles.find((x: { id: string }) => x.id === t.id);
  const w = createRealWorld(1, 't', { cells, row: t.row, id: t.id, name: info.name, prov: info.prov, lat: t.lat, lon: t.lon });
  check(`${t.id} start road on flat land`, [...Array(23).keys()].every((x) => w.ground[idx(x, t.row)] === Ground.Land));
  if (!hasOpenWater(w)) noWater++;
  // Somewhere for a water plant reachable from the road.
  let spot = false;
  for (let i = 0; i < N * N && !spot; i += 3) if (!placeProblem(w, 'water', i % N, (i / N) | 0)) spot = true;
  check(`${t.id} room for a water plant`, spot);
}
console.log('tiles without open water (wells allowed):', noWater);
// One city grown on a real tile.
{
  const t = tiles[Math.floor(tiles.length / 2)];
  const info = index.tiles.find((x: { id: string }) => x.id === t.id);
  const cells = new Uint8Array(zlib.inflateRawSync(Buffer.from(t.data, 'base64')));
  const w = createRealWorld(3, 't', { cells, row: t.row, id: t.id, name: info.name, prov: info.prov, lat: t.lat, lon: t.lon });
  w.money = 1e6;
  placeRoad(w, roadPath(22, t.row, 60, t.row), Road.Street);
  paintZone(w, rectCells(23, t.row - 3, 59, t.row + 3), Zone.R);
  const s = createSim(w);
  for (let d = 0; d < 60; d++) stepDay(s);
  check('city on real land has buildings', w.buildings.size > 0, `${info.name}`);
  check('network reaches outside', network(w).outside.size > 0);
  console.log(`  ${info.name}: ${w.buildings.size} buildings after 60 days`);
}
console.log(fails ? `${fails} FAILED` : 'all passed');
