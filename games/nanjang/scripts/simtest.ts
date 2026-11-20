/* Headless checks for 도깨비 난장: fights, merging, the shared pool, and whole bot-only games. */
import { fight, setup, step } from '../src/sim/combat';
import { botTurn, buy, census, merge, move, newGame, playRound, sell, type Game } from '../src/sim/game';
import { BY_ID, traitCounts, UNITS } from '../src/sim/units';

let failed = 0;
const check = (name: string, ok: boolean, info = '') => { if (!ok) { failed++; console.log(`FAIL ${name} ${info}`); } else console.log(`ok   ${name} ${info}`); };

// Fights are the same every time for a seed.
const A = [{ id: 'kkoma', star: 1, c: 3, r: 0 }, { id: 'foxfire', star: 1, c: 3, r: 3 }];
const B = [{ id: 'najol', star: 1, c: 3, r: 0 }, { id: 'hunter', star: 1, c: 2, r: 3 }];
const o1 = fight(A, B, 42), o2 = fight(A, B, 42);
check('fights are repeatable', o1.winner === o2.winner && o1.t === o2.t && o1.survivors.length === o2.survivors.length, `winner ${o1.winner} at ${o1.t.toFixed(1)}s`);

// Stars matter: three-star beats one-star of the same.
let wins = 0;
for (let s = 0; s < 50; s++) if (fight([{ id: 'carp', star: 2, c: 3, r: 0 }], [{ id: 'carp', star: 1, c: 3, r: 0 }, { id: 'carp', star: 1, c: 4, r: 0 }], s).winner === 0) wins++;
check('a 2-star beats two 1-stars of the same most of the time', wins >= 30, `${wins}/50`);
wins = 0;
for (let s = 0; s < 50; s++) if (fight([{ id: 'sansin', star: 1, c: 3, r: 3 }, { id: 'bulgasari', star: 1, c: 3, r: 0 }], [{ id: 'kkoma', star: 1, c: 3, r: 0 }, { id: 'najol', star: 1, c: 4, r: 0 }], s).winner === 0) wins++;
check('tier 5 beats tier 1', wins >= 45, `${wins}/50`);

// Every skill goes off in a fight without breaking anything.
const cast = new Set<string>();
for (const d of UNITS) {
  const c = setup([{ id: d.id, star: 2, c: 3, r: 1 }, { id: 'najol', star: 1, c: 2, r: 0 }], [{ id: 'jangseung', star: 2, c: 3, r: 0 }, { id: 'hunter', star: 1, c: 1, r: 3 }, { id: 'kkoma', star: 1, c: 4, r: 1 }], 7);
  while (!c.over) for (const e of step(c)) if (e.k === 'cast' && c.f[e.a].def.id === d.id) cast.add(d.id);
  const bad = c.f.some((f) => !Number.isFinite(f.hp) || !Number.isFinite(f.mana));
  if (bad) check(`${d.name} stays finite`, false);
}
check('every piece casts its skill', cast.size === UNITS.length, `${cast.size}/${UNITS.length} ${UNITS.filter((d) => !cast.has(d.id)).map((d) => d.name).join(',')}`);

// Traits count each kind once.
const tc = traitCounts(['kkoma', 'kkoma', 'oneeye']);
check('traits count kinds, not copies', tc.find((t) => t.trait === 'dokkaebi')?.n === 2 && tc.find((t) => t.trait === 'dokkaebi')?.step === 1);

// Merging: three 1-stars make a 2-star where the board one stood.
const g0 = newGame(1);
const me = g0.players[0];
me.bench = Array(9).fill(null); me.board = [{ uid: 900, id: 'kkoma', star: 1, c: 2, r: 0 }];
me.bench[0] = { uid: 901, id: 'kkoma', star: 1 }; me.bench[3] = { uid: 902, id: 'kkoma', star: 1 };
merge(g0, me);
check('three of a kind merge on the board', me.board.length === 1 && me.board[0].star === 2 && me.board[0].c === 2 && me.bench.every((u) => !u));
// Buying the third onto a full bench still works.
me.board = []; me.bench = Array(9).fill(null).map((_, i) => ({ uid: 1000 + i, id: i < 2 ? 'najol' : 'hunter', star: 1 }));
me.bench[2] = { uid: 1100, id: 'carp', star: 2 }; me.bench[3] = { uid: 1101, id: 'carp', star: 2 }; me.bench[4] = { uid: 1102, id: 'oneeye', star: 1 };
me.bench[5] = { uid: 1103, id: 'whitefox', star: 1 }; me.bench[6] = { uid: 1104, id: 'haetae', star: 1 }; me.bench[7] = { uid: 1105, id: 'bari', star: 1 }; me.bench[8] = { uid: 1106, id: 'gumiho', star: 1 };
me.shop[0] = 'najol'; me.gold = 10;
const before = census(g0);
check('buy the third onto a full bench', buy(g0, me, 0) === null && me.bench.filter((u) => u?.id === 'najol').length === 1 && me.bench.find((u) => u?.id === 'najol')!.star === 2);
void before;
// Board cap.
me.level = 1; me.board = [];
move(me, me.bench.find((u) => u)!.uid, { c: 0, r: 0 });
const second = me.bench.find((u) => u)!;
check('board holds only as many as the level', move(me, second.uid, { c: 1, r: 0 }) !== null && me.board.length === 1);
// Sell gives gold and returns copies.
const gold = me.gold, sold = me.board[0];
sell(g0, me, sold.uid);
check('selling pays', me.gold > gold && !me.board.length);

// Whole games, bots only (the player plays like a bot too).
const runs = Number(process.env.RUNS ?? 30);
let rounds = 0, longest = 0, poolOk = true, ended = 0;
const winPlans: Record<string, number> = {};
const t0 = Date.now();
for (let s = 0; s < runs; s++) {
  const g: Game = newGame(1000 + s);
  g.players[0].plan = ['under', 'shaman'];
  botTurn(g, g.players[0]);
  const total0 = census(g);
  while (!g.over && g.round < 80) {
    playRound(g);
    if (!g.over && g.players[0].alive) botTurn(g, g.players[0]);
    const now = census(g);
    for (const id in total0) if (now[id] !== total0[id]) { poolOk = false; break; }
  }
  if (g.over) ended++;
  rounds += g.round; longest = Math.max(longest, g.round);
  const w = g.players.find((p) => p.place === 1);
  if (w) winPlans[w.plan!.join('+')] = (winPlans[w.plan!.join('+')] ?? 0) + 1;
  const places = g.players.map((p) => p.place).sort((a, b) => a - b).join('');
  if (places !== '12345678') check(`places 1 to 8 (seed ${s})`, false, places);
}
check('every game ends', ended === runs, `${ended}/${runs}`);
check('games last a sensible while', rounds / runs > 14 && rounds / runs < 40, `avg ${(rounds / runs).toFixed(1)} rounds, longest ${longest}`);
check('no piece made or lost', poolOk);
console.log('winning plans', JSON.stringify(winPlans), `${((Date.now() - t0) / runs).toFixed(0)} ms a game`);
void BY_ID;
console.log(failed ? `${failed} FAILED` : 'all passed');
