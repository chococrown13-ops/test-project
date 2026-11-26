/* Cross-check with the Unity port: every building's parts for a saved city. */
import { readFileSync } from 'node:fs';
import { unpack } from '../src/sim/save';
import { parts } from '../src/render/buildings';

const w = unpack(readFileSync(process.argv[2], 'utf8'))!;
let n = 0, sum = 0, hash = 0;
const kinds: Record<string, number> = {};
w.buildings.forEach((b) => {
  for (const p of parts(b, w)) {
    n++;
    kinds[p.shape] = (kinds[p.shape] ?? 0) + 1;
    sum += p.x + p.y * 3 + p.z * 7 + p.sx + p.sy * 11 + p.sz * 13 + p.rot * 17 + p.style * 19;
    for (const ch of p.color + (p.sign ?? '')) hash = (hash * 31 + ch.charCodeAt(0)) % 1000003;
  }
});
console.log(`buildings ${w.buildings.size} parts ${n} sum ${sum.toFixed(4)} hash ${hash} ${Object.entries(kinds).sort().map(([k, v]) => `${k}=${v}`).join(' ')}`);
