/* Headless checks for 도깨비 난장 and its themes: fights, arenas, merging, ingredients, seasons, the shared pool, and whole bot-only games. */
import { ARENA_ROTATION, ARENAS, blocks, COLS, ROWS, terrain } from '../src/sim/arena';
import { fight, setup, step } from '../src/sim/combat';
import { botTurn, buy, census, equip, merge, move, newGame, playRound, sell, type Game } from '../src/sim/game';
import { BY_ID, itemDef, theme, traitCounts, UNITS } from '../src/sim/units';
import { THEMES, useTheme } from '../src/themes';

let failed = 0;
const check = (name: string, ok: boolean, info = '') => { if (!ok) { failed++; console.log(`FAIL ${name} ${info}`); } else console.log(`ok   ${name} ${info}`); };

// Every theme is complete: 19 pieces, traits that exist, creeps, bot names and plans that fit.
for (const T of THEMES) {
  useTheme(T.id);
  const traitsUsed = new Set(UNITS.flatMap((d) => d.traits));
  const unknown = [...traitsUsed].filter((t) => !T.traits[t]);
  const counts = Object.keys(T.traits).map((t) => UNITS.filter((d) => d.traits.includes(t)).length);
  check(`${T.title}: pieces and traits fit`, UNITS.length === 19 && !unknown.length && counts.every((n, i) => n >= T.traits[Object.keys(T.traits)[i]].steps.at(-1)!) && T.botNames.length >= 7 && T.plans.every((p) => p.every((t) => T.traits[t])), `${UNITS.length} pieces, counts ${counts.join(',')} ${unknown.join(',')}`);
}

useTheme('dokkaebi');
// Fights are the same every time for a seed.
const A = [{ id: 'kkoma', star: 1, c: 3, r: 0 }, { id: 'foxfire', star: 1, c: 3, r: 3 }];
const B = [{ id: 'najol', star: 1, c: 3, r: 0 }, { id: 'hunter', star: 1, c: 2, r: 3 }];
const o1 = fight(A, B, 42), o2 = fight(A, B, 42);
check('fights are repeatable', o1.winner === o2.winner && o1.t === o2.t && o1.survivors.length === o2.survivors.length, `winner ${o1.winner} at ${o1.t.toFixed(1)}s`);

let wins = 0;
for (let s = 0; s < 50; s++) if (fight([{ id: 'carp', star: 2, c: 3, r: 0 }], [{ id: 'carp', star: 1, c: 3, r: 0 }, { id: 'carp', star: 1, c: 4, r: 0 }], s).winner === 0) wins++;
check('a 2-star beats two 1-stars of the same most of the time', wins >= 30, `${wins}/50`);

// Arenas: fair (the same turned round), and no one gets stuck: melee teams still finish on every ground.
for (const id of ARENA_ROTATION) {
  const a = ARENAS[id];
  let sym = true;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (a.grid[y * COLS + x] !== a.grid[(ROWS - 1 - y) * COLS + (COLS - 1 - x)]) sym = false;
  let decided = 0;
  for (let s = 0; s < 20; s++) {
    const o = fight([{ id: 'kkoma', star: 1, c: 1, r: 0 }, { id: 'carp', star: 1, c: 5, r: 0 }, { id: 'najol', star: 1, c: 3, r: 1 }], [{ id: 'tigergen', star: 1, c: 3, r: 0 }, { id: 'kkoma', star: 1, c: 0, r: 2 }], s, { arena: id });
    if (o.winner !== -1) decided++;
  }
  // Nobody ever stands on water or rock.
  const c = setup([{ id: 'kkoma', star: 1, c: 0, r: 0 }, { id: 'carp', star: 1, c: 3, r: 0 }], [{ id: 'najol', star: 1, c: 6, r: 0 }], 3, { arena: id });
  let onBlock = false;
  while (!c.over) { step(c); for (const f of c.f) if (f.alive && blocks(terrain(id, f.x, f.y))) onBlock = true; }
  check(`arena ${a.name}: fair, fights finish, no one on water or rock`, sym && decided >= 18 && !onBlock, `${decided}/20 decided`);
}
// Mud makes melee slower to close: ranged pieces get more shots in.
const meet = (arena: string) => { const c = setup([{ id: 'kkoma', star: 1, c: 3, r: 3 }], [{ id: 'kkoma', star: 1, c: 3, r: 3 }], 1, { arena }); let t = 0; while (!c.over && t === 0) { for (const e of step(c)) if (e.k === 'atk') t = c.t; } return t; };
check('mud slows, ice speeds', meet('mudflat') > meet('yard') && meet('ice') < meet('yard'), `meet at ${meet('ice').toFixed(1)} / ${meet('yard').toFixed(1)} / ${meet('mudflat').toFixed(1)} s`);

// Every skill goes off in a fight without breaking anything, in every theme.
for (const T of THEMES) {
  useTheme(T.id);
  const cast = new Set<string>();
  const foe = UNITS.filter((d) => d.tier === 2 && d.range === 1)[0].id;
  for (const d of UNITS) {
    const c = setup([{ id: d.id, star: 2, c: 3, r: 1 }, { id: UNITS[0].id, star: 1, c: 2, r: 0 }], [{ id: foe, star: 2, c: 3, r: 0 }, { id: UNITS[3].id, star: 1, c: 1, r: 3 }, { id: UNITS[0].id, star: 1, c: 4, r: 1 }], 7);
    while (!c.over) for (const e of step(c)) if (e.k === 'cast' && c.f[e.a].def.id === d.id) cast.add(d.id);
    if (c.f.some((f) => !Number.isFinite(f.hp) || !Number.isFinite(f.mana) || !Number.isFinite(f.ad))) check(`${d.name} stays finite`, false);
  }
  check(`${T.title}: every piece casts its skill`, cast.size === UNITS.length, `${cast.size}/${UNITS.length} ${UNITS.filter((d) => !cast.has(d.id)).map((d) => d.name).join(',')}`);
}

useTheme('dokkaebi');
const tc = traitCounts(['kkoma', 'kkoma', 'oneeye']);
check('traits count kinds, not copies', tc.find((t) => t.trait === 'dokkaebi')?.n === 2 && tc.find((t) => t.trait === 'dokkaebi')?.step === 1);

// Merging and buying.
const g0 = newGame(1, 'dokkaebi');
const me = g0.players[0];
me.bench = Array(9).fill(null); me.board = [{ uid: 900, id: 'kkoma', star: 1, c: 2, r: 0 }];
me.bench[0] = { uid: 901, id: 'kkoma', star: 1 }; me.bench[3] = { uid: 902, id: 'kkoma', star: 1 };
merge(g0, me);
check('three of a kind merge on the board', me.board.length === 1 && me.board[0].star === 2 && me.board[0].c === 2 && me.bench.every((u) => !u));
me.board = []; me.bench = Array(9).fill(null).map((_, i) => ({ uid: 1000 + i, id: i < 2 ? 'najol' : 'hunter', star: 1 }));
me.bench[2] = { uid: 1100, id: 'carp', star: 2 }; me.bench[3] = { uid: 1101, id: 'carp', star: 2 }; me.bench[4] = { uid: 1102, id: 'oneeye', star: 1 };
me.bench[5] = { uid: 1103, id: 'whitefox', star: 1 }; me.bench[6] = { uid: 1104, id: 'haetae', star: 1 }; me.bench[7] = { uid: 1105, id: 'bari', star: 1 }; me.bench[8] = { uid: 1106, id: 'gumiho', star: 1 };
me.shop[0] = 'najol'; me.gold = 10;
check('buy the third onto a full bench', buy(g0, me, 0) === null && me.bench.filter((u) => u?.id === 'najol').length === 1 && me.bench.find((u) => u?.id === 'najol')!.star === 2);
me.level = 1; me.board = []; g0.arena = 'yard';
move(g0, me, me.bench.find((u) => u)!.uid, { c: 0, r: 0 });
const second = me.bench.find((u) => u)!;
check('board holds only as many as the level', move(g0, me, second.uid, { c: 1, r: 0 }) !== null && me.board.length === 1);
g0.arena = 'brook'; me.level = 3;
check('cannot stand a piece in the brook', move(g0, me, second.uid, { c: 3, r: 0 }) !== null && move(g0, me, second.uid, { c: 1, r: 0 }) === null);
const gold = me.gold, sold = me.board[0];
sell(g0, me, sold.uid);
check('selling pays', me.gold > gold && me.board.length === 1);

// 한식 대전: ingredients go on, pair into sauces, come back when sold, and make a piece stronger.
const gh = newGame(5, 'hansik');
const hp = gh.players[0];
hp.items = ['chili', 'chili', 'soy', 'garlic'];
hp.board = [{ uid: 777, id: 'tteok', star: 1, c: 3, r: 0 }];
equip(gh, hp, 777, 0); equip(gh, hp, 777, 0);
check('two ingredients make a sauce', hp.board[0].items?.length === 1 && itemDef(hp.board[0].items[0]).name === '고추장', hp.board[0].items?.join());
equip(gh, hp, 777, 0); equip(gh, hp, 777, 0);
check('a piece holds up to three, sauces count as one', hp.board[0].items?.length === 2 && hp.items.length === 0, hp.board[0].items?.join());
sell(gh, hp, 777);
check('selling gives the ingredients back', hp.items.sort().join() === 'chili,chili,garlic,soy', hp.items.join());
wins = 0;
for (let s = 0; s < 40; s++) if (fight([{ id: 'tteok', star: 1, c: 3, r: 0, items: ['chili+chili', 'soy+soy'] }], [{ id: 'tteok', star: 1, c: 3, r: 0 }], s).winner === 0) wins++;
check('sauces make a piece stronger', wins >= 36, `${wins}/40`);

// 사계절 요괴: the season turns every three rounds, sets the ground, and doubles its own trait.
const gs = newGame(9, 'seasons');
check('season and ground follow the round', gs.season === 0 && gs.arena === 'bamboo');
useTheme('seasons');
const team = [{ id: 'icicle', star: 1, c: 3, r: 0 }, { id: 'snowman', star: 1, c: 2, r: 0 }];
const armor = (season: number) => setup(team, [{ id: 'frog', star: 1, c: 3, r: 0 }], 1, { season }).f[0].armor;
check('a trait counts double in its season', armor(3) > armor(1), `겨울 ${armor(3)} / 여름 ${armor(1)}`);

// Whole games, bots only (the player plays like a bot too), in every theme.
for (const T of THEMES) {
  const runs = Number(process.env.RUNS ?? 20);
  let rounds = 0, longest = 0, poolOk = true, ended = 0, draws = 0, fights = 0;
  const winPlans: Record<string, number> = {};
  const t0 = Date.now();
  for (let s = 0; s < runs; s++) {
    const g: Game = newGame(1000 + s, T.id);
    g.players[0].plan = T.plans[0];
    botTurn(g, g.players[0]);
    const total0 = census(g);
    while (!g.over && g.round < 80) {
      const ms = playRound(g);
      for (const m of ms) { fights++; if (m.outcome.winner === -1) draws++; }
      if (!g.over && g.players[0].alive) botTurn(g, g.players[0]);
      const now = census(g);
      for (const id in total0) if (now[id] !== total0[id]) { poolOk = false; break; }
    }
    if (g.over) ended++;
    rounds += g.round; longest = Math.max(longest, g.round);
    const w = g.players.find((p) => p.place === 1);
    if (w) winPlans[w.plan!.join('+')] = (winPlans[w.plan!.join('+')] ?? 0) + 1;
    const places = g.players.map((p) => p.place).sort((a, b) => a - b).join('');
    if (places !== '12345678') check(`${T.title}: places 1 to 8 (seed ${s})`, false, places);
  }
  check(`${T.title}: every game ends, sensible length, no piece made or lost`, ended === runs && rounds / runs > 14 && rounds / runs < 40 && poolOk, `avg ${(rounds / runs).toFixed(1)} rounds, longest ${longest}, draws ${((draws / fights) * 100).toFixed(1)}%`);
  check(`${T.title}: few fights run out the clock`, draws / fights < 0.08, `${((draws / fights) * 100).toFixed(1)}%`);
  console.log(`  winning plans ${JSON.stringify(winPlans)} ${((Date.now() - t0) / runs).toFixed(0)} ms a game`);
}
void BY_ID; void theme;
console.log(failed ? `${failed} FAILED` : 'all passed');
