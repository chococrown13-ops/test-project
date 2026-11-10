/* Headless check of every map kind: water, flat start road, reachable land, a place for a 정수장. */
import { Ground, N } from '../src/sim/defs';
import { MAPS, startRow } from '../src/sim/maps';
import { placeProblem } from '../src/sim/tools';
import { createWorld, idx } from '../src/sim/world';

let fails = 0;
const check = (name: string, ok: boolean, extra = '') => { if (!ok) { console.log(`FAIL ${name} ${extra}`); fails++; } };
for (const m of MAPS) {
  const rows: string[] = [];
  for (const seed of [7, 12345, 987654, 31337, 2026, 55555]) {
    const w = createWorld(seed, 't', m.id);
    const row = startRow(seed, m.id);
    let water = 0, land = 0, hill = 0;
    for (let i = 0; i < N * N; i++) { const g = w.ground[i]; if (g === Ground.Water) water++; else if (g === Ground.Land) land++; else hill++; }
    check(`${m.id}/${seed} has water`, water > 150, `${water}`);
    check(`${m.id}/${seed} start road not on a hill`, [...Array(23).keys()].every((x) => w.ground[idx(x, row)] !== Ground.Mountain));
    check(`${m.id}/${seed} start road end on land`, w.ground[idx(22, row)] === Ground.Land);
    // Flat land reachable from the end of the start road.
    const seen = new Uint8Array(N * N), q = [idx(22, row)];
    seen[q[0]] = 1;
    let reach = 0;
    while (q.length) {
      const i = q.pop()!; reach++;
      const x = i % N, y = (i / N) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const j = idx(nx, ny);
        if (!seen[j] && w.ground[j] === Ground.Land) { seen[j] = 1; q.push(j); }
      }
    }
    check(`${m.id}/${seed} most land reachable`, reach > land * 0.5, `${reach}/${land}`);
    // Somewhere reachable to put a water plant.
    let spot = false;
    for (let i = 0; i < N * N && !spot; i++) if (seen[i] && !placeProblem(w, 'water', i % N, (i / N) | 0)) spot = true;
    check(`${m.id}/${seed} room for a water plant`, spot);
    rows.push(`${seed}: water ${water} land ${land} hill ${hill} reach ${reach}`);
  }
  console.log(m.id.padEnd(7), rows[0], '|', rows[1]);
}
console.log(fails ? `${fails} FAILED` : 'all passed');
