import { COLS, fight, HALF, type Outcome, type Placed } from './combat';
import { Rng } from './rng';
import { BY_ID, ODDS, POOL_SIZE, sellValue, TIER_COST, traitCounts, type Trait, UNITS, XP_NEXT } from './units';

/**
 * A game of 도깨비 난장: eight players (you and seven bots) on one shared
 * pool of pieces. Each round everyone shops and sets out their board, then
 * fights someone; the loser loses health. Last one standing wins.
 */

export const BENCH = 9;
export const SHOP = 5;
export const START_HP = 100;
export const REROLL = 2;
export const XP_COST = 4;

export interface Piece { uid: number; id: string; star: number }
export interface OnBoard extends Piece { c: number; r: number }

export interface Player {
  idx: number; name: string; bot: boolean;
  hp: number; gold: number; level: number; xp: number;
  bench: (Piece | null)[]; board: OnBoard[]; shop: (string | null)[]; locked: boolean;
  streak: number; alive: boolean; place: number;
  /** Bots: what they build toward. */
  plan?: Trait[];
}

export interface Match { a: number; b: number; ghost?: boolean; creeps?: boolean; seed: number; aTeam: Placed[]; bTeam: Placed[]; outcome: Outcome; damage: number; loser: number[] }

export interface Game {
  v: 1; seed: number; rng: number; round: number; uid: number;
  players: Player[]; pool: Record<string, number>;
  last: Match[] | null;
  over: boolean;
}

export const BOT_NAMES = ['장터 도령', '개울가 아씨', '뒷산 나무꾼', '주막 주모', '옹기장이', '서당 훈장', '대장장이'];
export const BOT_PLANS: Trait[][] = [
  ['dokkaebi', 'warrior'], ['fox', 'shaman'], ['tiger', 'archer'], ['sea', 'guard'], ['under', 'assassin'], ['beast', 'warrior'], ['fox', 'assassin'], ['sea', 'archer'], ['under', 'shaman'], ['dokkaebi', 'shaman'],
];

/* --------------------------------------------------------------- rounds */

/** Rounds against wild beasts: the first three, then every sixth. */
export const isCreepRound = (r: number) => r <= 3 || (r > 6 && r % 6 === 3);
export function creepTeam(r: number): Placed[] {
  const P = (id: string, star: number, c: number, row: number): Placed => ({ id, star, c, r: row });
  if (r === 1) return [P('dog', 1, 2, 0), P('dog', 1, 4, 0)];
  if (r === 2) return [P('dog', 1, 2, 0), P('dog', 1, 3, 1), P('dog', 1, 4, 0)];
  if (r === 3) return [P('dog', 1, 2, 1), P('boar', 1, 3, 0), P('dog', 1, 4, 1)];
  const s = Math.min(3, 1 + Math.floor((r - 9) / 12));
  const extra = Math.min(3, Math.floor((r - 9) / 6));
  const t: Placed[] = [P('boar', s, 2, 0), P('bear', s, 3, 0), P('boar', s, 4, 0), P('dog', s, 1, 1), P('dog', s, 5, 1)];
  for (let k = 0; k < extra; k++) t.push(P('bear', s, [0, 6, 3][k], k === 2 ? 1 : 0));
  return t;
}
export function roundName(r: number): string { return isCreepRound(r) ? '산짐승' : '대결'; }
const income = (r: number) => (r === 1 ? 2 : r === 2 ? 3 : r === 3 ? 4 : 5);
const streakGold = (s: number) => { const a = Math.abs(s); return a >= 5 ? 3 : a >= 4 ? 2 : a >= 2 ? 1 : 0; };
export const interest = (gold: number) => Math.min(5, Math.floor(gold / 10));

/* ---------------------------------------------------------------- setup */

export function newGame(seed: number, name = '나'): Game {
  const rng = new Rng(seed);
  const pool: Record<string, number> = {};
  for (const d of UNITS) pool[d.id] = POOL_SIZE[d.tier];
  const plans = rng.shuffle(BOT_PLANS.slice());
  const players: Player[] = [];
  for (let k = 0; k < 8; k++) players.push({
    idx: k, name: k === 0 ? name : BOT_NAMES[k - 1], bot: k > 0,
    hp: START_HP, gold: 0, level: 1, xp: 0,
    bench: Array(BENCH).fill(null), board: [], shop: Array(SHOP).fill(null), locked: false,
    streak: 0, alive: true, place: 0, plan: k > 0 ? plans[k - 1] : undefined,
  });
  const g: Game = { v: 1, seed, rng: rng.s, round: 1, uid: 1, players, pool, last: null, over: false };
  // Everyone starts with one piece of the cheapest kind.
  for (const p of players) { const id = draw(g, 1); if (id) p.bench[0] = { uid: g.uid++, id, star: 1 }; }
  beginRound(g);
  return g;
}

function R(g: Game): Rng { const r = new Rng(0); r.s = g.rng; return r; }
function withRng<T>(g: Game, fn: (r: Rng) => T): T { const r = R(g); const v = fn(r); g.rng = r.s; return v; }

/** Take one piece of a tier out of the pool, or null if that tier is empty. */
function draw(g: Game, tier: number): string | null {
  return withRng(g, (r) => {
    const ids = UNITS.filter((d) => d.tier === tier && g.pool[d.id] > 0);
    const total = ids.reduce((s, d) => s + g.pool[d.id], 0);
    if (!total) return null;
    let k = r.int(total);
    for (const d of ids) { k -= g.pool[d.id]; if (k < 0) { g.pool[d.id]--; return d.id; } }
    return null;
  });
}

function rollShop(g: Game, p: Player) {
  for (const id of p.shop) if (id) g.pool[id]++;
  p.shop = p.shop.map(() => {
    const tier = withRng(g, (r) => {
      const odds = ODDS[p.level];
      let k = r.int(100);
      for (let t = 0; t < 5; t++) { k -= odds[t]; if (k < 0) return t + 1; }
      return 1;
    });
    for (let t = tier; t >= 1; t--) { const id = draw(g, t); if (id) return id; }
    return null;
  });
}

/** Start of a round: pay everyone, refill their shops, let the bots shop. */
export function beginRound(g: Game) {
  for (const p of g.players) {
    if (!p.alive) continue;
    if (g.round > 1) { p.gold += income(g.round) + interest(p.gold) + streakGold(p.streak); gainXp(p, 2); }
    else p.gold += income(1);
    if (!p.locked) rollShop(g, p);
    p.locked = false;
  }
  for (const p of g.players) if (p.alive && p.bot) botTurn(g, p);
}

/* -------------------------------------------------------------- actions */

export const boardCap = (p: Player) => p.level;
export const benchFree = (p: Player) => p.bench.indexOf(null);

function gainXp(p: Player, n: number) {
  p.xp += n;
  while (p.level < 9 && p.xp >= XP_NEXT[p.level]) { p.xp -= XP_NEXT[p.level]; p.level++; }
  if (p.level >= 9) p.xp = 0;
}

export function buyXp(_g: Game, p: Player): string | null {
  if (p.level >= 9) return '이미 가장 높은 레벨이에요.';
  if (p.gold < XP_COST) return `경험치는 ${XP_COST}냥이에요.`;
  p.gold -= XP_COST; gainXp(p, 4);
  return null;
}

export function reroll(g: Game, p: Player): string | null {
  if (p.gold < REROLL) return `새로고침은 ${REROLL}냥이에요.`;
  p.gold -= REROLL; rollShop(g, p);
  return null;
}

/** All of a player's pieces with where they are. */
export function owned(p: Player): { piece: Piece; where: 'bench' | 'board'; i: number }[] {
  const out: { piece: Piece; where: 'bench' | 'board'; i: number }[] = [];
  p.bench.forEach((u, i) => { if (u) out.push({ piece: u, where: 'bench', i }); });
  p.board.forEach((u, i) => out.push({ piece: u, where: 'board', i }));
  return out;
}

/** Whether buying this one would make three of a kind (so it fits even on a full bench). */
function completes(p: Player, id: string): boolean {
  return owned(p).filter((o) => o.piece.id === id && o.piece.star === 1).length >= 2;
}

export function buy(g: Game, p: Player, slot: number): string | null {
  const id = p.shop[slot];
  if (!id) return null;
  const cost = TIER_COST[BY_ID[id].tier];
  if (p.gold < cost) return `${BY_ID[id].name}은(는) ${cost}냥이에요.`;
  const at = benchFree(p);
  if (at < 0 && !completes(p, id)) return '대기석이 꽉 찼어요. 말을 팔거나 판에 올리세요.';
  p.gold -= cost; p.shop[slot] = null;
  const piece = { uid: g.uid++, id, star: 1 };
  if (at >= 0) p.bench[at] = piece;
  else {
    // A full bench: the third copy merges straight away.
    p.bench.push(piece); merge(g, p); p.bench.length = BENCH;
    return null;
  }
  merge(g, p);
  return null;
}

/** Three of a kind become one a star higher, where the best-placed one stands. */
export function merge(_g: Game, p: Player): Piece | null {
  let made: Piece | null = null;
  for (let again = true; again;) {
    again = false;
    const all = owned(p);
    for (const o of all) {
      if (o.piece.star >= 3) continue;
      const same = all.filter((x) => x.piece.id === o.piece.id && x.piece.star === o.piece.star);
      if (same.length < 3) continue;
      const three = same.sort((a, b) => (a.where === 'board' ? 0 : 1) - (b.where === 'board' ? 0 : 1) || a.i - b.i).slice(0, 3);
      const keep = three[0];
      keep.piece.star++;
      made = keep.piece;
      for (const x of three.slice(1)) {
        if (x.where === 'bench') p.bench[x.i] = null;
        else p.board = p.board.filter((b) => b.uid !== x.piece.uid);
      }
      again = true;
      break;
    }
  }
  return made;
}

export function sell(g: Game, p: Player, uid: number): string | null {
  const bi = p.bench.findIndex((u) => u?.uid === uid);
  const piece = bi >= 0 ? p.bench[bi]! : p.board.find((u) => u.uid === uid);
  if (!piece) return null;
  if (bi >= 0) p.bench[bi] = null; else p.board = p.board.filter((u) => u.uid !== uid);
  p.gold += sellValue(piece.id, piece.star);
  g.pool[piece.id] += 3 ** (piece.star - 1);
  return null;
}

/** Move a piece to a board cell or a bench slot, swapping with whatever is there. */
export function move(p: Player, uid: number, to: { bench: number } | { c: number; r: number }): string | null {
  const bi = p.bench.findIndex((u) => u?.uid === uid);
  const onB = p.board.find((u) => u.uid === uid);
  const piece: Piece | undefined = bi >= 0 ? p.bench[bi]! : onB;
  if (!piece) return null;
  if ('bench' in to) {
    if (bi === to.bench) return null;
    const other = p.bench[to.bench];
    if (bi >= 0) { p.bench[bi] = other; p.bench[to.bench] = piece; return null; }
    // board -> bench: swap the bench piece onto the board spot.
    p.board = p.board.filter((u) => u.uid !== uid);
    p.bench[to.bench] = { uid: piece.uid, id: piece.id, star: piece.star };
    if (other) p.board.push({ ...other, c: onB!.c, r: onB!.r });
    return null;
  }
  if (to.c < 0 || to.c >= COLS || to.r < 0 || to.r >= HALF) return null;
  const there = p.board.find((u) => u.c === to.c && u.r === to.r && u.uid !== uid);
  if (onB) {
    if (there) { there.c = onB.c; there.r = onB.r; }
    onB.c = to.c; onB.r = to.r;
    return null;
  }
  if (!there && p.board.length >= boardCap(p)) return `판에는 레벨만큼(${boardCap(p)}개) 올릴 수 있어요. 경험치를 사서 레벨을 올리세요.`;
  p.bench[bi] = there ? { uid: there.uid, id: there.id, star: there.star } : null;
  if (there) p.board = p.board.filter((u) => u.uid !== there.uid);
  p.board.push({ uid: piece.uid, id: piece.id, star: piece.star, c: to.c, r: to.r });
  return null;
}

/** Fill empty board places from the bench (strongest first), so no one fights a man short. */
export function autoFill(p: Player): number {
  let n = 0;
  while (p.board.length < boardCap(p)) {
    const cands = p.bench.map((u, i) => ({ u, i })).filter((x) => x.u) as { u: Piece; i: number }[];
    if (!cands.length) break;
    cands.sort((a, b) => worth(b.u) - worth(a.u));
    const { u, i } = cands[0];
    const spot = freeSpot(p, BY_ID[u.id].range > 1 ? 'back' : 'front');
    if (!spot) break;
    p.bench[i] = null;
    p.board.push({ ...u, ...spot });
    n++;
  }
  return n;
}

function freeSpot(p: Player, pref: 'front' | 'back'): { c: number; r: number } | null {
  const rows = pref === 'front' ? [0, 1, 2, 3] : [3, 2, 1, 0];
  const cols = [3, 2, 4, 1, 5, 0, 6];
  for (const r of rows) for (const c of cols) if (!p.board.some((u) => u.c === c && u.r === r)) return { c, r };
  return null;
}

export const worth = (u: Piece) => BY_ID[u.id].tier * 3 ** (u.star - 1);

/* ---------------------------------------------------------------- fights */

const team = (p: Player): Placed[] => p.board.map((u) => ({ id: u.id, star: u.star, c: u.c, r: u.r }));

/** Everyone fights; returns the matches (yours first) and moves the game on a round. */
export function playRound(g: Game): Match[] {
  for (const p of g.players) if (p.alive) autoFill(p);
  const alive = g.players.filter((p) => p.alive);
  const matches: Match[] = [];
  const seed = () => withRng(g, (r) => r.int(2 ** 31));
  if (isCreepRound(g.round)) {
    for (const p of alive) {
      const s = seed(), aT = team(p), bT = creepTeam(g.round);
      const o = fight(aT, bT, s);
      matches.push({ a: p.idx, b: -1, creeps: true, seed: s, aTeam: aT, bTeam: bT, outcome: o, damage: 0, loser: [] });
    }
  } else {
    const order = withRng(g, (r) => r.shuffle(alive.map((p) => p.idx)));
    for (let k = 0; k < order.length; k += 2) {
      const a = order[k];
      let b = order[k + 1], ghost = false;
      if (b === undefined) { b = withRng(g, (r) => r.pick(order.filter((x) => x !== a))); ghost = true; }
      const s = seed(), aT = team(g.players[a]), bT = team(g.players[b]);
      matches.push({ a, b, ghost, seed: s, aTeam: aT, bTeam: bT, outcome: fight(aT, bT, s), damage: 0, loser: [] });
    }
  }
  // Scoring.
  const stage = 1 + Math.floor(g.round / 4);
  for (const m of matches) {
    const pa = g.players[m.a], pb = m.b >= 0 ? g.players[m.b] : null;
    const surv = m.outcome.survivors.reduce((s, f) => s + f.def.tier + f.star - 1, 0);
    const dmg = Math.min(30, (m.creeps ? 1 : stage) + surv);
    m.damage = dmg;
    const w = m.outcome.winner;
    if (m.creeps) {
      if (w === 0) { pa.gold += 2 + Math.min(3, Math.floor(g.round / 9)); reward(g, pa); }
      else { pa.hp -= dmg; m.loser.push(pa.idx); }
      continue;
    }
    const hit = (p: Player) => { p.hp -= dmg; m.loser.push(p.idx); p.streak = Math.min(0, p.streak) - 1; };
    const win = (p: Player) => { p.gold += 1; p.streak = Math.max(0, p.streak) + 1; };
    if (w === 0) { win(pa); if (!m.ghost) hit(pb!); }
    else if (w === 1) { hit(pa); if (!m.ghost) win(pb!); }
    else { hit(pa); if (!m.ghost) hit(pb!); }
  }
  // Knocked out: places count up from the bottom.
  const out = g.players.filter((p) => p.alive && p.hp <= 0).sort((a, b) => a.hp - b.hp);
  let left = alive.length;
  for (const p of out) { p.alive = false; p.place = left--; returnAll(g, p); }
  const still = g.players.filter((p) => p.alive);
  if (still.length <= 1) { g.over = true; if (still[0]) still[0].place = 1; }
  g.last = matches.sort((x, y) => (x.a === 0 || x.b === 0 ? -1 : 0) - (y.a === 0 || y.b === 0 ? -1 : 0));
  if (!g.over) { g.round++; beginRound(g); }
  return g.last;
}

/** A beaten beast drops a piece (if the bench has room). */
function reward(g: Game, p: Player) {
  const at = benchFree(p);
  if (at < 0) { p.gold += 1; return; }
  const tier = g.round <= 3 ? 1 : g.round <= 9 ? 2 : g.round <= 15 ? 3 : 4;
  const id = draw(g, tier) ?? draw(g, 1);
  if (id) { p.bench[at] = { uid: g.uid++, id, star: 1 }; merge(g, p); }
}

function returnAll(g: Game, p: Player) {
  for (const o of owned(p)) g.pool[o.piece.id] += 3 ** (o.piece.star - 1);
  for (const id of p.shop) if (id) g.pool[id]++;
  p.bench = Array(BENCH).fill(null); p.board = []; p.shop = Array(SHOP).fill(null);
}

/* ------------------------------------------------------------------ bots */

/** The level a bot wants by this round. */
const botLevel = (r: number) => (r >= 26 ? 9 : r >= 20 ? 8 : r >= 15 ? 7 : r >= 11 ? 6 : r >= 7 ? 5 : r >= 4 ? 4 : r >= 2 ? 3 : 1);

function botScore(p: Player, id: string): number {
  const d = BY_ID[id];
  const copies = owned(p).filter((o) => o.piece.id === id && o.piece.star < 3).length;
  const fit = d.traits.filter((t) => p.plan!.includes(t)).length;
  return d.tier * 1.2 + fit * 2.5 + copies * 2;
}

export function botTurn(g: Game, p: Player) {
  // Level up on schedule, keeping some gold back from round 10.
  while (p.level < botLevel(g.round) && p.gold >= XP_COST) buyXp(g, p);
  const keep = g.round >= 10 && p.hp > 40 ? 20 : g.round >= 6 ? 10 : 0;
  for (let pass = 0; pass < 6; pass++) {
    // Buy what fits the plan or pairs up, best first.
    const offers = p.shop.map((id, i) => ({ id, i })).filter((x) => x.id) as { id: string; i: number }[];
    offers.sort((a, b) => botScore(p, b.id) - botScore(p, a.id));
    let bought = false;
    for (const o of offers) {
      const cost = TIER_COST[BY_ID[o.id].tier];
      const good = botScore(p, o.id) >= 4 || completes(p, o.id) || owned(p).length < p.level + 2;
      if (!good || p.gold - cost < (completes(p, o.id) ? 0 : keep)) continue;
      if (benchFree(p) < 0 && !completes(p, o.id)) sellWeakest(g, p);
      if (!buy(g, p, o.i)) bought = true;
    }
    // Roll for upgrades when rich, or when low on health.
    const roll = p.gold >= keep + REROLL + 4 && (p.gold > 50 || (p.hp < 40 && p.level >= botLevel(g.round)));
    if (!roll || bought && pass > 3) break;
    reroll(g, p);
  }
  arrange(p);
}

function sellWeakest(g: Game, p: Player) {
  const bench = p.bench.map((u, i) => ({ u, i })).filter((x) => x.u) as { u: Piece; i: number }[];
  if (!bench.length) return;
  bench.sort((a, b) => botScore(p, a.u.id) * a.u.star - botScore(p, b.u.id) * b.u.star);
  sell(g, p, bench[0].u.uid);
}

/** Put the best pieces on the board: the sturdy ones in front, the ranged behind. */
export function arrange(p: Player) {
  const all = owned(p).map((o) => o.piece);
  all.sort((a, b) => worth(b) + (p.plan ? botScore(p, b.id) * 0.5 : 0) - (worth(a) + (p.plan ? botScore(p, a.id) * 0.5 : 0)));
  const chosen = all.slice(0, boardCap(p));
  const rest = all.slice(boardCap(p));
  p.board = [];
  p.bench = Array(BENCH).fill(null);
  rest.slice(0, BENCH).forEach((u, i) => { p.bench[i] = { uid: u.uid, id: u.id, star: u.star }; });
  const front = chosen.filter((u) => BY_ID[u.id].range === 1 && !BY_ID[u.id].traits.includes('assassin'));
  const back = chosen.filter((u) => !front.includes(u));
  const cols = [3, 2, 4, 1, 5, 0, 6];
  front.forEach((u, k) => p.board.push({ uid: u.uid, id: u.id, star: u.star, c: cols[k % 7], r: Math.floor(k / 7) }));
  back.forEach((u, k) => p.board.push({ uid: u.uid, id: u.id, star: u.star, c: cols[k % 7], r: 3 - Math.floor(k / 7) }));
}

/* ------------------------------------------------------------- helpers */

export function boardTraits(p: Player) { return traitCounts(p.board.map((u) => u.id)); }

/** Every copy of every piece, wherever it is: the pool plus all hands and shops. Should never change. */
export function census(g: Game): Record<string, number> {
  const n: Record<string, number> = { ...g.pool };
  for (const p of g.players) {
    for (const o of owned(p)) n[o.piece.id] += 3 ** (o.piece.star - 1);
    for (const id of p.shop) if (id) n[id]++;
  }
  return n;
}

const KEY = 'nanjang.save.v1';
export function save(g: Game) { try { localStorage.setItem(KEY, JSON.stringify(g)); } catch { /* storage blocked */ } }
export function load(): Game | null {
  try { const s = localStorage.getItem(KEY); const g = s ? JSON.parse(s) as Game : null; return g && g.v === 1 && !g.over ? g : null; } catch { return null; }
}
export function clearSave() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
