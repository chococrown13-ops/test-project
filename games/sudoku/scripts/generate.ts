// Builds the puzzle bank and the practice positions for lessons.
//
//   node --experimental-strip-types scripts/generate.ts <seed> <count> <out.json>
//
// Each run generates `count` random puzzles, grades them with the logical
// solver and mines practice positions. `merge.ts` combines several runs into
// src/data/*.json.
import { writeFileSync } from 'node:fs';
import { makePuzzle, mulberry32 } from './gen-lib.ts';
import { gridToString } from '../src/core.ts';
import { solveLogical } from '../src/solver.ts';
import { TECHS, TECH_BY_ID } from '../src/techniques.ts';

const [seed, count, out] = [Number(process.argv[2]), Number(process.argv[3]), process.argv[4]];
const rand = mulberry32(seed);
const puzzles: { p: string; tier: number; used: string[]; clues: number }[] = [];
// tech -> list of { g, c, primary } ; primary = this tech was the easiest step there
const practice: Record<string, { g: string; c: string; primary: boolean }[]> = {};

const encCand = (cand: number[]) => cand.map((m) => m.toString(36).padStart(2, '0')).join('');

for (let i = 0; i < count; i++) {
  const { puzzle } = makePuzzle(rand);
  const r = solveLogical(puzzle, { keepStates: true });
  if (!r.solved) continue;
  puzzles.push({ p: gridToString(puzzle), tier: r.tier, used: r.used, clues: puzzle.filter((d) => d).length });
  // Practice positions: states right before a non-single step; plus states
  // where a rarer technique is present even if something easier also is.
  r.steps.forEach((st, k) => {
    const s = r.before![k];
    for (const t of TECHS) {
      if (t.tier === 0 && t.id !== st.tech) continue;
      const primary = t.id === st.tech;
      if (!primary && t.tier <= TECH_BY_ID[st.tech].tier) continue;
      const list = (practice[t.id] ??= []);
      if (list.length >= 60) continue;
      if (t.tier === 0 && Math.random() > 0.02) continue; // singles are everywhere
      if (!primary && list.filter((x) => !x.primary).length >= 30) continue;
      if (t.find(s, 1).length === 0) continue;
      list.push({ g: gridToString(s.grid), c: encCand(s.cand), primary });
    }
  });
}
writeFileSync(out, JSON.stringify({ puzzles, practice }));
console.log(out, puzzles.length);
