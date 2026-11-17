/**
 * Headless balance check: each strategy plays many seeds start to finish.
 * No single strategy should win everywhere, and pure preservation must not be best.
 *   npx esbuild games/keep/scripts/balancetest.ts --bundle --platform=node --outfile=/tmp/bt.cjs && node /tmp/bt.cjs
 */
import { CARDS } from '../src/sim/cards';
import { decide, ending, lifetime, newGame, options } from '../src/sim/game';
import { mayorChoice, MAYORS } from '../src/sim/mayors';
import type { Game } from '../src/sim/world';

type Strat = (g: Game) => number;
const byCat = (cats: string[]) => (g: Game) => { const o = options(g); const i = o.findIndex((x) => cats.includes(CARDS[x.card].cat)); return i < 0 ? o.length - 1 : i; };
const strats: Record<string, Strat> = {
  '지켜보기만': (g) => options(g).length - 1,
  '보존만': byCat(['보존', '청원', '고쳐쓰기']),
  '개발만': byCat(['재개발', '제안']),
  '무작위': (g) => Math.floor(Math.random() * options(g).length),
};
for (const m of MAYORS) strats[m.name] = (g) => mayorChoice(g, options(g), { id: m.id, trait: '' }).index;

const SEEDS = Number(process.argv[2] ?? 30);
const rows: string[] = [];
const t0 = Date.now();
for (const [name, s] of Object.entries(strats)) {
  const acc = { m: 0, v: 0, r: 0, b: 0, score: 0, kept: 0, lost: 0 };
  const titles: Record<string, number> = {};
  for (let seed = 1; seed <= SEEDS; seed++) {
    const g = newGame(seed * 7919);
    while (!g.done) decide(g, s(g), name);
    const i = lifetime(g), e = ending(g);
    acc.m += i.memory; acc.v += i.vitality; acc.r += i.residents; acc.b += i.budget; acc.score += e.score; acc.kept += e.kept + e.reused; acc.lost += e.lost;
    titles[e.title] = (titles[e.title] ?? 0) + 1;
  }
  const f = (x: number) => (x / SEEDS).toFixed(0).padStart(4);
  rows.push(`${name.padEnd(8)} 기억${f(acc.m)} 활력${f(acc.v)} 주민${f(acc.r)} 살림${f(acc.b)} | 점수${f(acc.score)} 남음${f(acc.kept)} 사라짐${f(acc.lost)} | ${Object.entries(titles).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}×${n}`).join(', ')}`);
}
console.log(rows.join('\n'));
console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s`);
