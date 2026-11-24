import { ARENA_ROTATION, SEASON_ARENA, standable } from './arena';
import { COLS, type Ctx, fight, HALF, type Outcome, type Placed } from './combat';
import { Rng } from './rng';
import { BY_ID, comboId, itemDef, ODDS, POOL_SIZE, sellValue, theme, TIER_COST, type Trait, traitCounts, UNITS, XP_NEXT } from './units';
import { useTheme } from '../themes';

/**
 * A game: eight players (you and seven bots) on one shared pool of pieces.
 * Each round everyone shops and sets out their board, then fights someone on
 * that round's ground; the loser loses health. Last one standing wins.
 */

export const BENCH = 9;
export const SHOP = 5;
export const START_HP = 100;
export const REROLL = 2;
export const XP_COST = 4;
export const ITEM_SLOTS = 3;
export const TRAY = 10;

export interface Piece { uid: number; id: string; star: number; items?: string[] }
export interface OnBoard extends Piece { c: number; r: number }

export interface Player {
  idx: number; name: string; bot: boolean;
  hp: number; gold: number; level: number; xp: number;
  bench: (Piece | null)[]; board: OnBoard[]; shop: (string | null)[]; locked: boolean;
  streak: number; alive: boolean; place: number;
  /** Ingredients not yet on a piece (한식 대전). */
  items: string[];
  /** Bots: what they build toward. */
  plan?: Trait[];
}

export interface Match { a: number; b: number; ghost?: boolean; creeps?: boolean; seed: number; aTeam: Placed[]; bTeam: Placed[]; outcome: Outcome; damage: number; loser: number[]; ctx: Ctx }

export interface Game {
  v: 3; theme: string; seed: number; rng: number; round: number; uid: number;
  players: Player[]; pool: Record<string, number>;
  /** This round's ground, and (사계절 요괴) season. */
  arena: string; season: number;
  last: Match[] | null;
  over: boolean;
}

/* --------------------------------------------------------------- rounds */

/** Rounds against wild things: the first three, then every sixth. */
export const isCreepRound = (r: number) => r <= 3 || (r > 6 && r % 6 === 3);
export function creepTeam(r: number): Placed[] {
  const [small, mid, big] = theme().creeps.map((d) => d.id);
  // Laid out for an 8-wide board, then centred on the real one.
  const P = (id: string, star: number, c: number, row: number): Placed => ({ id, star, c: c + Math.floor((COLS - 8) / 2), r: Math.min(HALF - 1, row) });
  if (r === 1) return [P(small, 1, 2, 1), P(small, 1, 4, 1)];
  if (r === 2) return [P(small, 1, 2, 1), P(small, 1, 3, 2), P(small, 1, 4, 1)];
  if (r === 3) return [P(small, 1, 2, 2), P(mid, 1, 3, 1), P(small, 1, 4, 2)];
  const s = Math.min(3, 1 + Math.floor((r - 9) / 12));
  const extra = Math.min(3, Math.floor((r - 9) / 6));
  const t: Placed[] = [P(mid, s, 2, 1), P(big, s, 3, 1), P(mid, s, 4, 1), P(small, s, 2, 2), P(small, s, 4, 2)];
  for (let k = 0; k < extra; k++) t.push(P(big, s, [1, 5, 3][k], k === 2 ? 2 : 1));
  return t;
}
export function roundName(r: number): string { return isCreepRound(r) ? theme().creepName : '대결'; }
export const seasonOf = (r: number) => (theme().seasons ? Math.floor((r - 1) / 3) % 4 : -1);
const income = (r: number) => (r === 1 ? 2 : r === 2 ? 3 : r === 3 ? 4 : 5);
const streakGold = (s: number) => { const a = Math.abs(s); return a >= 5 ? 3 : a >= 4 ? 2 : a >= 2 ? 1 : 0; };
export const interest = (gold: number) => Math.min(5, Math.floor(gold / 10));

/* ---------------------------------------------------------------- setup */

export function newGame(seed: number, themeId = 'spirits', name = '나'): Game {
  const T = useTheme(themeId);
  const rng = new Rng(seed);
  const pool: Record<string, number> = {};
  for (const d of UNITS) pool[d.id] = POOL_SIZE[d.tier];
  const plans = rng.shuffle(T.plans.slice());
  const players: Player[] = [];
  for (let k = 0; k < 8; k++) players.push({
    idx: k, name: k === 0 ? name : T.botNames[k - 1], bot: k > 0,
    hp: START_HP, gold: 0, level: 1, xp: 0,
    bench: Array(BENCH).fill(null), board: [], shop: Array(SHOP).fill(null), locked: false,
    streak: 0, alive: true, place: 0, items: [], plan: k > 0 ? plans[k - 1] : undefined,
  });
  const g: Game = { v: 3, theme: T.id, seed, rng: rng.s, round: 1, uid: 1, players, pool, arena: 'yard', season: -1, last: null, over: false };
  // Everyone starts with one piece of the cheapest kind (and, with ingredients, one of those).
  for (const p of players) {
    const id = draw(g, 1);
    if (id) p.bench[0] = { uid: g.uid++, id, star: 1 };
    if (T.items) p.items.push(randomItem(g));
  }
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

function randomItem(g: Game): string { return withRng(g, (r) => r.pick(theme().items!).id); }

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

/** Start of a round: pick the ground, pay everyone, refill their shops, let the bots shop. */
export function beginRound(g: Game) {
  g.season = seasonOf(g.round);
  const prev = g.arena;
  if (g.season >= 0) g.arena = SEASON_ARENA[g.season];
  else if (isCreepRound(g.round) || g.round < 5) g.arena = 'yard';
  else g.arena = withRng(g, (r) => r.pick(ARENA_ROTATION.filter((a) => a !== prev)));
  for (const p of g.players) {
    if (!p.alive) continue;
    if (g.round > 1) { p.gold += income(g.round) + interest(p.gold) + streakGold(p.streak); gainXp(p, 2); }
    else p.gold += income(1);
    if (!p.locked) rollShop(g, p);
    p.locked = false;
    settle(g, p);
  }
  for (const p of g.players) if (p.alive && p.bot) botTurn(g, p);
}

/** Pieces standing where this round's ground won't hold them step to the nearest square that will (or back to the bench). */
export function settle(g: Game, p: Player): number {
  let moved = 0;
  for (const u of p.board.slice()) {
    if (standable(g.arena, u.c, u.r)) continue;
    const spot = nearestSpot(g, p, u.c, u.r);
    if (spot) { u.c = spot.c; u.r = spot.r; }
    else { p.board = p.board.filter((x) => x !== u); const at = benchFree(p); if (at >= 0) p.bench[at] = strip(u); }
    moved++;
  }
  return moved;
}

function nearestSpot(g: Game, p: Player, c0: number, r0: number): { c: number; r: number } | null {
  let best: { c: number; r: number } | null = null, bd = Infinity;
  for (let r = 0; r < HALF; r++) for (let c = 0; c < COLS; c++) {
    if (!standable(g.arena, c, r) || p.board.some((u) => u.c === c && u.r === r)) continue;
    const d = Math.hypot(c - c0, r - r0);
    if (d < bd) { bd = d; best = { c, r }; }
  }
  return best;
}

const strip = (u: OnBoard): Piece => ({ uid: u.uid, id: u.id, star: u.star, items: u.items });

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
export const findPiece = (p: Player, uid: number) => owned(p).find((o) => o.piece.uid === uid)?.piece;

/** Whether buying this one would make three of a kind (so it fits even on a full bench). */
function completes(p: Player, id: string): boolean {
  return owned(p).filter((o) => o.piece.id === id && o.piece.star === 1).length >= 2;
}

export function buy(g: Game, p: Player, slot: number): string | null {
  const id = p.shop[slot];
  if (!id) return null;
  const cost = TIER_COST[BY_ID[id].tier];
  if (p.gold < cost) return `${BY_ID[id].name}: ${cost}냥이 있어야 사요.`;
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

/** Three of a kind become one a star higher, where the best-placed one stands; their ingredients go with it. */
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
        for (const it of x.piece.items ?? []) {
          const list = keep.piece.items ?? (keep.piece.items = []);
          if (list.length < ITEM_SLOTS) list.push(it); else if (p.items.length < TRAY) p.items.push(it);
        }
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
  // Ingredients come back off a sold piece (sauces come apart into what made them).
  for (const it of piece.items ?? []) for (const part of it.split('+')) if (p.items.length < TRAY) p.items.push(part);
  return null;
}

/** Put an ingredient from the tray on a piece. Two plain ingredients on one piece become a sauce. */
export function equip(_g: Game, p: Player, uid: number, k: number): string | null {
  const piece = findPiece(p, uid), it = p.items[k];
  if (!piece || !it) return null;
  const list = piece.items ?? (piece.items = []);
  const plain = list.findIndex((x) => !x.includes('+'));
  if (plain >= 0) list[plain] = comboId(list[plain], it);
  else if (list.length >= ITEM_SLOTS) return `한 음식에는 양념을 ${ITEM_SLOTS}개까지 올릴 수 있어요.`;
  else list.push(it);
  p.items.splice(k, 1);
  return null;
}

/** Move a piece to a board cell or a bench slot, swapping with whatever is there. */
export function move(g: Game, p: Player, uid: number, to: { bench: number } | { c: number; r: number }): string | null {
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
    p.bench[to.bench] = strip(onB!);
    if (other) p.board.push({ ...other, c: onB!.c, r: onB!.r });
    return null;
  }
  if (to.c < 0 || to.c >= COLS || to.r < 0 || to.r >= HALF) return null;
  if (!standable(g.arena, to.c, to.r)) return '이번 경기장에서는 그 칸에 설 수 없어요 (물이나 바위예요).';
  const there = p.board.find((u) => u.c === to.c && u.r === to.r && u.uid !== uid);
  if (onB) {
    if (there) { there.c = onB.c; there.r = onB.r; }
    onB.c = to.c; onB.r = to.r;
    return null;
  }
  if (!there && p.board.length >= boardCap(p)) return `판에는 레벨만큼(${boardCap(p)}개) 올릴 수 있어요. 경험치를 사서 레벨을 올리세요.`;
  p.bench[bi] = there ? strip(there) : null;
  if (there) p.board = p.board.filter((u) => u.uid !== there.uid);
  p.board.push({ ...piece, c: to.c, r: to.r });
  return null;
}

/** Fill empty board places from the bench (strongest first), so no one fights a man short. */
export function autoFill(g: Game, p: Player): number {
  let n = 0;
  while (p.board.length < boardCap(p)) {
    const cands = p.bench.map((u, i) => ({ u, i })).filter((x) => x.u) as { u: Piece; i: number }[];
    if (!cands.length) break;
    cands.sort((a, b) => worth(b.u) - worth(a.u));
    const { u, i } = cands[0];
    const spot = freeSpot(g, p, BY_ID[u.id].range > 1 ? 'back' : 'front');
    if (!spot) break;
    p.bench[i] = null;
    p.board.push({ ...u, ...spot });
    n++;
  }
  return n;
}

function freeSpot(g: Game, p: Player, pref: 'front' | 'back'): { c: number; r: number } | null {
  const rows = pref === 'front' ? [0, 1, 2, 3] : [3, 2, 1, 0];
  // Middle columns first.
  const cols = [...Array(COLS).keys()].sort((a, b) => Math.abs(a - (COLS - 1) / 2) - Math.abs(b - (COLS - 1) / 2) || a - b);
  for (const r of rows) for (const c of cols) if (standable(g.arena, c, r) && !p.board.some((u) => u.c === c && u.r === r)) return { c, r };
  return null;
}

export const worth = (u: Piece) => BY_ID[u.id].tier * 3 ** (u.star - 1) + (u.items?.length ?? 0) * 0.5;

/* ---------------------------------------------------------------- fights */

const team = (p: Player): Placed[] => p.board.map((u) => ({ id: u.id, star: u.star, c: u.c, r: u.r, items: u.items }));

/**
 * Everyone fights; returns the matches (yours first). With `advance` the game moves straight on to
 * the next round; without, it waits for nextRound (the screen plays the fight first, and the player
 * may keep shopping with this round's gold and shop meanwhile).
 */
export function playRound(g: Game, advance = true): Match[] {
  for (const p of g.players) if (p.alive) autoFill(g, p);
  const alive = g.players.filter((p) => p.alive);
  const matches: Match[] = [];
  const ctx: Ctx = { arena: g.arena, season: g.season };
  const seed = () => withRng(g, (r) => r.int(2 ** 31));
  if (isCreepRound(g.round)) {
    for (const p of alive) {
      const s = seed(), aT = team(p), bT = creepTeam(g.round);
      matches.push({ a: p.idx, b: -1, creeps: true, seed: s, aTeam: aT, bTeam: bT, outcome: fight(aT, bT, s, ctx), damage: 0, loser: [], ctx });
    }
  } else {
    const order = withRng(g, (r) => r.shuffle(alive.map((p) => p.idx)));
    for (let k = 0; k < order.length; k += 2) {
      const a = order[k];
      let b = order[k + 1], ghost = false;
      if (b === undefined) { b = withRng(g, (r) => r.pick(order.filter((x) => x !== a))); ghost = true; }
      const s = seed(), aT = team(g.players[a]), bT = team(g.players[b]);
      matches.push({ a, b, ghost, seed: s, aTeam: aT, bTeam: bT, outcome: fight(aT, bT, s, ctx), damage: 0, loser: [], ctx });
    }
  }
  matches.sort((x, y) => (x.a === 0 || x.b === 0 ? -1 : 0) - (y.a === 0 || y.b === 0 ? -1 : 0));
  g.last = matches;
  if (advance) { settleRound(g, matches); nextRound(g); }
  return matches;
}

/** The fights are over: health lost, win gold and streaks, creep rewards, who is knocked out. */
export function settleRound(g: Game, matches: Match[]) {
  const alive = g.players.filter((p) => p.alive);
  // Losing costs a little for the stage of the game plus a point per surviving enemy piece (more for stars), at most 20.
  const stage = 1 + Math.floor(g.round / 7);
  for (const m of matches) {
    const pa = g.players[m.a], pb = m.b >= 0 ? g.players[m.b] : null;
    const surv = m.outcome.survivors.reduce((s, f) => s + f.star + (f.def.tier >= 4 ? 1 : 0), 0);
    const dmg = Math.min(20, (m.creeps ? 1 : stage) + surv);
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
}

/** After the fights: the next round's pay, shops and bots. */
export function nextRound(g: Game) {
  if (g.over) return;
  g.round++;
  beginRound(g);
}

/** What a beaten creep round gives: a piece (if the bench has room), or with ingredients, ingredients. */
export function reward(g: Game, p: Player): string {
  if (theme().items) {
    const n = g.round >= 9 ? 2 : 1;
    const got: string[] = [];
    for (let k = 0; k < n; k++) { const it = randomItem(g); if (p.items.length < TRAY) { p.items.push(it); got.push(itemDef(it).name); } }
    return got.length ? `재료 ${got.join(', ')}` : '엽전';
  }
  const at = benchFree(p);
  if (at < 0) { p.gold += 1; return '엽전'; }
  const tier = g.round <= 3 ? 1 : g.round <= 9 ? 2 : g.round <= 15 ? 3 : 4;
  const id = draw(g, tier) ?? draw(g, 1);
  if (id) { p.bench[at] = { uid: g.uid++, id, star: 1 }; merge(g, p); return BY_ID[id].name; }
  return '엽전';
}

function returnAll(g: Game, p: Player) {
  for (const o of owned(p)) g.pool[o.piece.id] += 3 ** (o.piece.star - 1);
  for (const id of p.shop) if (id) g.pool[id]++;
  p.bench = Array(BENCH).fill(null); p.board = []; p.shop = Array(SHOP).fill(null); p.items = [];
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
    if (!roll || (bought && pass > 3)) break;
    reroll(g, p);
  }
  arrange(g, p);
  // Ingredients onto the best pieces on the board.
  while (p.items.length && p.board.length) {
    const best = p.board.slice().sort((a, b) => worth(b) - worth(a)).find((u) => (u.items?.length ?? 0) < ITEM_SLOTS || u.items!.some((x) => !x.includes('+')));
    if (!best || equip(g, p, best.uid, 0)) break;
  }
}

function sellWeakest(g: Game, p: Player) {
  const bench = p.bench.map((u, i) => ({ u, i })).filter((x) => x.u) as { u: Piece; i: number }[];
  if (!bench.length) return;
  bench.sort((a, b) => botScore(p, a.u.id) * a.u.star - botScore(p, b.u.id) * b.u.star);
  sell(g, p, bench[0].u.uid);
}

/** Put the best pieces on the board: the sturdy ones in front, the ranged behind, round the ground. */
export function arrange(g: Game, p: Player) {
  const all = owned(p).map((o) => o.piece);
  const score = (u: Piece) => worth(u) + (p.plan ? botScore(p, u.id) * 0.5 : 0);
  all.sort((a, b) => score(b) - score(a));
  const chosen = all.slice(0, boardCap(p));
  const rest = all.slice(boardCap(p));
  p.board = [];
  p.bench = Array(BENCH).fill(null);
  rest.slice(0, BENCH).forEach((u, i) => { p.bench[i] = { uid: u.uid, id: u.id, star: u.star, items: u.items }; });
  const front = chosen.filter((u) => BY_ID[u.id].range === 1 && !BY_ID[u.id].traits.some((t) => theme().traits[t].effect.k === 'crit'));
  const back = chosen.filter((u) => !front.includes(u));
  for (const u of front) { const s = freeSpot(g, p, 'front'); if (s) p.board.push({ ...u, ...s }); }
  for (const u of back) { const s = freeSpot(g, p, 'back'); if (s) p.board.push({ ...u, ...s }); }
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

/** A game saved on the old 8 x 10 board: pieces from the rows that are gone find new squares. */
function migrate(g: Game) {
  g.v = 3;
  for (const p of g.players) {
    const keep = p.board.filter((u) => u.r < HALF && u.c < COLS && standable(g.arena, u.c, u.r));
    const moved = p.board.filter((u) => !keep.includes(u));
    p.board = keep;
    for (const u of moved) { const s = freeSpot(g, p, 'back'); if (s) p.board.push({ ...u, ...s }); else { const i = benchFree(p); if (i >= 0) p.bench[i] = { uid: u.uid, id: u.id, star: u.star, items: u.items }; } }
  }
}

const key = (themeId: string) => `nanjang.save.${themeId}`;
export function save(g: Game) { try { localStorage.setItem(key(g.theme), JSON.stringify(g)); } catch { /* storage blocked */ } }
export function load(themeId: string): Game | null {
  try {
    const s = localStorage.getItem(key(themeId));
    const g = s ? JSON.parse(s) as Game : null;
    if (!g || (g.v !== 2 && g.v !== 3) || g.over) return null;
    useTheme(g.theme);
    if (g.v === 2) migrate(g);
    return g;
  } catch { return null; }
}
export function clearSave(themeId: string) { try { localStorage.removeItem(key(themeId)); } catch { /* ignore */ } }
