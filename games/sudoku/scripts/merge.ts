// Combines generate.ts runs into the bank shipped with the game.
//
//   node --experimental-strip-types scripts/merge.ts run1.json run2.json ...
import { readFileSync, writeFileSync } from 'node:fs';
import { mulberry32 } from './gen-lib.ts';
import { TECHS, TECH_BY_ID, type TechId } from '../src/techniques.ts';

const PER_LEVEL = 50;
const PER_TECH = 6;

type P = { p: string; tier: number; used: TechId[]; clues: number };
type Pos = { g: string; c: string; primary: boolean };
const runs = process.argv.slice(2).map((f) => JSON.parse(readFileSync(f, 'utf8')) as { puzzles: P[]; practice: Record<string, Pos[]> });

// Stages get harder as the number climbs: more hard techniques needed, fewer clues.
const hardness = (p: P) => {
  const top = p.used.filter((t) => TECH_BY_ID[t].tier === p.tier).length;
  return top * 100 + p.used.length * 10 - p.clues;
};
const levels: Record<string, { p: string; used: TechId[] }[]> = {};
for (const [name, tier] of [['mid', 1], ['hard', 2], ['expert', 3], ['extreme', 4]] as const) {
  const pool = runs.flatMap((r) => r.puzzles).filter((p) => p.tier === tier);
  const seen = new Set<string>();
  const uniq = pool.filter((p) => !seen.has(p.p) && seen.add(p.p));
  // Spread across the range, then order easy → hard.
  uniq.sort((a, b) => hardness(a) - hardness(b));
  const step = uniq.length / PER_LEVEL;
  const picked = Array.from({ length: Math.min(PER_LEVEL, uniq.length) }, (_, i) => uniq[Math.floor(i * step)]);
  levels[name] = picked.map((p) => ({ p: p.p, used: p.used }));
  console.log(name, pool.length, '→', picked.length);
}

const rand = mulberry32(99);
const practice: Record<string, { g: string; c: string }[]> = {};
for (const t of TECHS) {
  const all = runs.flatMap((r) => r.practice[t.id] ?? []);
  const shuffled = all.map((x) => [rand(), x] as const).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const prim = shuffled.filter((x) => x.primary);
  const rest = shuffled.filter((x) => !x.primary);
  practice[t.id] = [...prim, ...rest].slice(0, PER_TECH).map(({ g, c }) => ({ g, c }));
  console.log(t.id, practice[t.id].length, 'primary', Math.min(prim.length, PER_TECH));
}

writeFileSync('src/data/puzzles.json', JSON.stringify(levels));
writeFileSync('src/data/practice.json', JSON.stringify(practice));
