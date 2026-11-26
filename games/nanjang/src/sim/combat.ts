import { blocks, BUSH, COLS, HALF, ICE, MUD, ROWS, terrain } from './arena';
import { Rng } from './rng';
import { BY_ID, itemDef, SKILL_MUL, STAR_MUL, TRAITS, traitCounts, traitsAt, type Trait, type UnitDef, type Up, upsAt, type Stack } from './units';

/**
 * The fight: two teams on a 12 x 8 board, fought out in steps of a tenth of a
 * second with no input. Each piece picks the nearest enemy, walks into range
 * and strikes; strikes and blows fill its mana, and a full bar casts its
 * skill. The ground (the round's arena) can block, slow, speed or hide. The
 * same seed always gives the same fight, so the one on screen is the one the
 * game scored.
 */

export { COLS, HALF, ROWS };
export const DT = 0.1;
export const TIME_LIMIT = 40;

export interface Placed { id: string; star: number; c: number; r: number; items?: string[]; grow?: number }
export interface Ctx { arena?: string; season?: number }

export interface Fighter {
  key: number; side: 0 | 1; def: UnitDef; star: number; items: string[];
  x: number; y: number;
  hp: number; maxHp: number; ad: number; as: number; range: number; armor: number; mr: number;
  mana: number; maxMana: number;
  shield: number; shieldT: number; stunT: number; silenceT: number; atkT: number; moveT: number;
  target: number; tauntBy: number; tauntT: number; asBuff: number; asBuffT: number;
  alive: boolean;
  dodge: number; double: number; lifesteal: number; crit: number; leap: boolean; skillMul: number; manaRegen: number; regen: number; ramp: number;
  dealt: number;
  /** Health given back (to itself or friends) and damage taken (after armour, shields included). */
  healed: number;
  taken: number;
  /** Skill upgrades from evolving, and the thorns one leaves on (reflect share, seconds left). */
  ups: Up[]; thorns: number; thornsT: number;
  /** Trait stacks building up (n so far), and whether the low-health shield has gone off. */
  stk: { t: Trait; st: Stack; v: number; n: number }[]; lowDone: boolean;
  /** About to step into mud (it waits a moment first). */
  wade?: boolean;
}

export type Ev =
  | { k: 'move'; a: number; x: number; y: number; t?: number }
  | { k: 'blink'; a: number; x: number; y: number }
  | { k: 'atk'; a: number; b: number; ranged: boolean }
  | { k: 'hit'; a: number; b: number; v: number; magic?: boolean; crit?: boolean }
  | { k: 'miss'; a: number; b: number }
  | { k: 'cast'; a: number; skill: string; b?: number; cells?: [number, number][] }
  | { k: 'heal'; a: number; b: number; v: number }
  | { k: 'shield'; a: number; b: number; v: number }
  | { k: 'stun'; b: number; t: number }
  | { k: 'silence'; b: number; t: number }
  | { k: 'up'; a: number; up: string; b?: number }
  | { k: 'die'; a: number };

export interface Combat { t: number; f: Fighter[]; grid: Int16Array; rng: Rng; over: boolean; winner: 0 | 1 | -1; arena: string; season: number;
  /** While a skill is going off: who it hit and how hard (for the evolution upgrades). */
  casting?: { by: Fighter; hits: { f: Fighter; v: number }[] } }

const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const cell = (x: number, y: number) => y * COLS + x;
const inBoard = (x: number, y: number) => x >= 0 && y >= 0 && x < COLS && y < ROWS;

/** Board coordinates to fight coordinates: side 0 at the bottom (rows 4 to 7), side 1 turned round at the top. */
export function toFight(side: 0 | 1, c: number, r: number): { x: number; y: number } {
  return side === 0 ? { x: c, y: HALF + r } : { x: COLS - 1 - c, y: HALF - 1 - r };
}

export function setup(a: Placed[], b: Placed[], seed: number, ctx: Ctx = {}): Combat {
  const c: Combat = { t: 0, f: [], grid: new Int16Array(COLS * ROWS).fill(-1), rng: new Rng(seed), over: false, winner: -1, arena: ctx.arena ?? 'yard', season: ctx.season ?? -1 };
  ([a, b] as Placed[][]).forEach((team, s) => {
    const side = s as 0 | 1;
    const tr = traitCounts(team.map((p) => ({ id: p.id, star: p.star })));
    const val = (t: Trait, step: number) => {
      const d = TRAITS[t];
      return d.effect.v[step - 1] * (d.season !== undefined && d.season === c.season ? 2 : 1);
    };
    let teamArmor = 0;
    for (const t of tr) if (t.step && TRAITS[t.trait].effect.k === 'teamArmor') teamArmor += val(t.trait, t.step);
    for (const p of team) {
      const def = BY_ID[p.id], m = STAR_MUL[p.star];
      let { x, y } = toFight(side, p.c, p.r);
      // A square the ground or another piece has taken: the nearest open one on its own side.
      if (!free(c, x, y)) { const q = nearestFree(c, x, y, side); x = q.x; y = q.y; }
      const f: Fighter = {
        key: c.f.length, side, def, star: p.star, items: p.items ?? [], x, y,
        hp: def.hp * m, maxHp: def.hp * m, ad: def.ad * m, as: def.as, range: def.range, armor: def.armor + teamArmor, mr: def.mr + teamArmor * 0.5,
        mana: def.manaStart, maxMana: def.mana,
        shield: 0, shieldT: 0, stunT: 0, silenceT: 0, atkT: 0.2, moveT: 0, target: -1, tauntBy: -1, tauntT: 0, asBuff: 0, asBuffT: 0,
        alive: true, dodge: 0, double: 0, lifesteal: 0, crit: 0, leap: false, skillMul: SKILL_MUL[p.star], manaRegen: 0, regen: 0, ramp: 0, dealt: 0, healed: 0, taken: 0,
        ups: upsAt(def, p.star), thorns: 0, thornsT: 0, stk: [], lowDone: false,
      };
      let adK = 1, asK = 1, hpK = 1;
      for (const t of traitsAt(def, p.star)) {
        const step = tr.find((q) => q.trait === t)?.step ?? 0;
        if (!step) continue;
        const e = TRAITS[t].effect, v = val(t, step);
        switch (e.k) {
          case 'double': f.double += v; break;
          case 'dodge': f.dodge += v; break;
          case 'ad': adK += v; break;
          case 'as': asK += v; break;
          case 'hp': hpK += v; break;
          case 'lifesteal': f.lifesteal += v; break;
          case 'skill': f.skillMul *= 1 + v; break;
          case 'resist': f.armor += v; f.mr += v; break;
          case 'mana': f.manaRegen += v; break;
          case 'regen': f.regen += v; break;
          case 'ramp': f.ramp += v; break;
          case 'crit': f.crit += v; f.leap = true; break;
          case 'teamArmor': break;
        }
      }
      for (const t of traitsAt(def, p.star)) {
        const step = tr.find((q) => q.trait === t)?.step ?? 0, st = TRAITS[t].stack;
        if (!step || !st) continue;
        const v = st.v[step - 1] * (TRAITS[t].season !== undefined && TRAITS[t].season === c.season ? 2 : 1);
        const n = st.on === 'round' ? Math.min(st.max, p.grow ?? 0) : 0;
        if (st.on === 'round') { f.hp += n * v; f.maxHp += n * v; }
        f.stk.push({ t, st, v, n });
      }
      // What it holds (한식 대전's ingredients and sauces).
      for (const id of f.items) {
        const md = itemDef(id).mods;
        adK += md.ad ?? 0; asK += md.as ?? 0;
        f.hp += md.hp ?? 0; f.maxHp += md.hp ?? 0;
        f.armor += md.resist ?? 0; f.mr += md.resist ?? 0;
        f.mana = Math.min(f.maxMana - 1, f.mana + (md.mana ?? 0));
        f.crit += md.crit ?? 0; f.dodge += md.dodge ?? 0; f.skillMul *= 1 + (md.skill ?? 0);
      }
      f.ad *= adK; f.as *= asK; f.hp *= hpK; f.maxHp *= hpK;
      c.f.push(f);
      c.grid[cell(x, y)] = f.key;
    }
  });
  return c;
}

function nearestFree(c: Combat, x0: number, y0: number, side: 0 | 1): { x: number; y: number } {
  let best = { x: x0, y: y0 }, bd = Infinity;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (!free(c, x, y)) continue;
    const own = side === 0 ? y >= HALF : y < HALF;
    const d = Math.hypot(x - x0, y - y0) + (own ? 0 : 100);
    if (d < bd) { bd = d; best = { x, y }; }
  }
  return best;
}

/* ------------------------------------------------------------- helpers */

/** Something that builds stacks happened to f (`on`); `t` is who it was fighting, for bursts. */
function bump(c: Combat, ev: Ev[], f: Fighter, on: Stack['on'], t?: Fighter) {
  if (!f.alive) return;
  for (const s of f.stk) {
    if (s.st.on !== on) continue;
    if (s.st.stat === 'burst') {
      if (++s.n >= s.st.max) { s.n = 0; if (t?.alive) { ev.push({ k: 'cast', a: f.key, skill: 'burst', b: t.key }); deal(c, ev, f, t, s.v, true); } }
      continue;
    }
    if (s.n >= s.st.max) continue;
    s.n++;
    switch (s.st.stat) {
      case 'ad': f.ad *= 1 + s.v; break;
      case 'as': f.as *= 1 + s.v; break;
      case 'resist': f.armor += s.v; f.mr += s.v; break;
      case 'skill': f.skillMul *= 1 + s.v; break;
      case 'mana': for (const o of friends(c, f)) if (o !== f && o.stk.some((x) => x.t === s.t)) o.mana = Math.min(o.maxMana, o.mana + s.v); break;
      default: break;
    }
  }
}

function foes(c: Combat, f: Fighter) { return c.f.filter((o) => o.alive && o.side !== f.side); }
function friends(c: Combat, f: Fighter) { return c.f.filter((o) => o.alive && o.side === f.side); }

function nearest(c: Combat, f: Fighter, list = foes(c, f)): Fighter | null {
  let best: Fighter | null = null, bd = Infinity;
  for (const o of list) {
    const d = cheb(f, o) + Math.hypot(f.x - o.x, f.y - o.y) * 0.001;
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

function free(c: Combat, x: number, y: number) { return inBoard(x, y) && c.grid[cell(x, y)] < 0 && !blocks(terrain(c.arena, x, y)); }

function place(c: Combat, f: Fighter, x: number, y: number) {
  c.grid[cell(f.x, f.y)] = -1;
  f.x = x; f.y = y;
  c.grid[cell(x, y)] = f.key;
}

function deal(c: Combat, ev: Ev[], src: Fighter, dst: Fighter, amount: number, magic: boolean, crit = false): number {
  if (!dst.alive) return 0;
  const sk = c.casting?.by === src ? c.casting : null;
  if (sk && src.ups.includes('execute') && dst.hp < dst.maxHp * 0.4) { amount *= 1.5; ev.push({ k: 'up', a: src.key, up: 'execute', b: dst.key }); }
  let v = amount * (100 / (100 + Math.max(0, magic ? dst.mr : dst.armor)));
  dst.taken += Math.min(dst.hp + dst.shield, v);
  if (dst.shield > 0) { const s = Math.min(dst.shield, v); dst.shield -= s; v -= s; }
  const done = Math.min(dst.hp, v);
  dst.hp -= v;
  src.dealt += done;
  dst.mana = Math.min(dst.maxMana, dst.mana + Math.min(12, 2 + v * 0.03));
  ev.push({ k: 'hit', a: src.key, b: dst.key, v: Math.round(amount * (100 / (100 + Math.max(0, magic ? dst.mr : dst.armor)))), magic, crit });
  if (src.lifesteal && done > 0) heal(c, ev, src, src, done * src.lifesteal, false);
  if (sk) sk.hits.push({ f: dst, v: amount });
  if (dst.hp <= 0) { kill(c, ev, dst); bump(c, ev, src, 'kill'); return done; }
  if (done > 0) {
    bump(c, ev, dst, 'hit');
    if (!dst.lowDone && dst.hp < dst.maxHp / 2) {
      const low = dst.stk.find((x) => x.st.on === 'low');
      if (low) { dst.lowDone = true; low.n = 1; shield(ev, dst, dst, low.v, 6); }
    }
  }
  return done;
}

function heal(_c: Combat, ev: Ev[], src: Fighter, dst: Fighter, v: number, show = true) {
  if (!dst.alive) return;
  const h = Math.min(dst.maxHp - dst.hp, v);
  dst.hp += h;
  src.healed += h;
  if (show && h > 0) ev.push({ k: 'heal', a: src.key, b: dst.key, v: Math.round(h) });
}

function shield(ev: Ev[], src: Fighter, dst: Fighter, v: number, t: number) {
  dst.shield = Math.max(dst.shield, v); dst.shieldT = Math.max(dst.shieldT, t);
  ev.push({ k: 'shield', a: src.key, b: dst.key, v: Math.round(v) });
}

/** Silenced: it still fights, but can't cast its skill until it wears off. */
function silence(ev: Ev[], dst: Fighter, t: number) {
  if (!dst.alive) return;
  dst.silenceT = Math.max(dst.silenceT, t);
  ev.push({ k: 'silence', b: dst.key, t });
}

function stun(ev: Ev[], dst: Fighter, t: number) {
  if (!dst.alive) return;
  dst.stunT = Math.max(dst.stunT, t);
  ev.push({ k: 'stun', b: dst.key, t });
}

function kill(c: Combat, ev: Ev[], f: Fighter) {
  f.alive = false; f.hp = 0;
  c.grid[cell(f.x, f.y)] = -1;
  ev.push({ k: 'die', a: f.key });
}

function around(c: Combat, x: number, y: number, r: number, side: number): Fighter[] {
  return c.f.filter((o) => o.alive && o.side !== side && Math.max(Math.abs(o.x - x), Math.abs(o.y - y)) <= r);
}

/** An empty cell next to `t`, on the far side from `from` if there is one. */
function behind(c: Combat, t: Fighter, from: { x: number; y: number }): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null, bd = -Infinity;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = t.x + dx, y = t.y + dy;
    if (!free(c, x, y)) continue;
    const d = Math.hypot(x - from.x, y - from.y);
    if (d > bd) { bd = d; best = { x, y }; }
  }
  return best;
}

/* -------------------------------------------------------------- skills */

/** Each skill's numbers at one star (damage, heal and shield grow with stars, items and traits; times are seconds). */
export const SK = {
  bonk: { dmg: 160, stun: 1.5 }, foxfire: { dmg: 230 }, snipe: { dmg: 240 }, drag: { dmg: 170, stun: 1, heal: 120 },
  guardup: { shield: 280 }, taunt: { shield: 420 }, boulder: { dmg: 120, silence: 2 }, blink: { dmg: 260 },
  wave: { dmg: 150, silence: 1.5 }, heal: { heal: 420 }, roar: { dmg: 190 }, judge: { dmg: 80, stun: 1.5, shield: 320 },
  ttukttak: { heal: 110 }, charm: { dmg: 380, stun: 2.5 }, reap: { dmg: 320 }, shell: { shield: 190 },
  mountain: { heal: 160, dmg: 230 }, devour: { heal: 200 }, beam: { dmg: 250 },
} as const;

/**
 * A skill's numbers in words, for the info card: `mul` is the skill power (stars, traits and items together),
 * `star` adds the little extra some stuns and silences get per star.
 */
export function skillNumbers(skill: string, mul: number, star: number): string {
  const k = (SK as Record<string, Record<string, number>>)[skill];
  if (!k) return '';
  const n = (v: number) => Math.round(v * mul).toLocaleString('ko-KR');
  const out: string[] = [];
  const magic = !['bonk', 'snipe', 'blink', 'roar'].includes(skill);
  if (k.dmg) out.push(`${magic ? '마법' : '물리'} 피해 ${n(k.dmg)}`);
  if (k.heal) out.push(`회복 ${n(k.heal)}`);
  if (k.shield) out.push(`보호막 ${n(k.shield)} (4초)`);
  if (k.stun) out.push(`기절 ${(k.stun + (skill === 'judge' ? 0.3 * star : 0)).toFixed(1)}초`);
  if (k.silence) out.push(`침묵 ${(k.silence + (skill === 'boulder' ? 0.5 * star : 0)).toFixed(1)}초`);
  if (skill === 'roar') out.push('공격력 +25%');
  if (skill === 'ttukttak') out.push('공속 +30% (5초)');
  if (skill === 'devour') out.push('공격력 +15%, 방어·마저 +10');
  if (skill === 'taunt') out.push('도발 3초');
  return out.join(' · ');
}

function cast(c: Combat, ev: Ev[], f: Fighter, t: Fighter) {
  c.casting = { by: f, hits: [] };
  castSkill(c, ev, f, t);
  const hits = c.casting.hits;
  c.casting = undefined;
  if (f.ups.length) upgrades(c, ev, f, t, hits);
  bump(c, ev, f, 'cast', t);
}

/** What an evolved piece's skill does on top: the upgrades of its forms. */
function upgrades(c: Combat, ev: Ev[], f: Fighter, t: Fighter, hits: { f: Fighter; v: number }[]) {
  const total = hits.reduce((a, h) => a + h.v, 0);
  const hit = new Set(hits.map((h) => h.f.key));
  for (const u of f.ups) switch (u) {
    case 'thorns': f.thorns = 0.3; f.thornsT = 5; ev.push({ k: 'up', a: f.key, up: u }); break;
    case 'share': {
      const v = friends(c, f).filter((o) => o !== f).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.key - b.key)[0];
      if (v) { ev.push({ k: 'up', a: f.key, up: u, b: v.key }); shield(ev, f, v, 200 * f.skillMul, 4); }
      break;
    }
    case 'twin': {
      if (!total) break;
      const from = hits[0]?.f ?? t;
      const o = foes(c, f).filter((x) => !hit.has(x.key)).sort((a, b) => cheb(a, from) - cheb(b, from) || a.key - b.key)[0];
      if (o) { ev.push({ k: 'up', a: from.key, up: u, b: o.key }); ev.push({ k: 'cast', a: f.key, skill: f.def.skill, b: o.key }); deal(c, ev, f, o, Math.max(...hits.map((h) => h.v)) * 0.6, true); }
      break;
    }
    case 'splash': {
      const near = new Set<Fighter>();
      for (const h of hits) for (const o of around(c, h.f.x, h.f.y, 1, f.side)) if (!hit.has(o.key)) near.add(o);
      for (const h of hits) ev.push({ k: 'up', a: f.key, up: u, b: h.f.key });
      for (const o of near) deal(c, ev, f, o, (total / Math.max(1, hits.length)) * 0.4, true);
      break;
    }
    case 'manaback': f.mana = Math.max(f.mana, f.maxMana * 0.3); ev.push({ k: 'up', a: f.key, up: u }); break;
    case 'drain': if (total) { for (const h of hits) ev.push({ k: 'up', a: f.key, up: u, b: h.f.key }); heal(c, ev, f, f, total * 0.35); } break;
    case 'haste': f.asBuff = Math.max(f.asBuff, 0.35); f.asBuffT = Math.max(f.asBuffT, 5); ev.push({ k: 'up', a: f.key, up: u }); break;
    case 'chill': for (const h of hits) if (h.f.alive) { ev.push({ k: 'up', a: f.key, up: u, b: h.f.key }); stun(ev, h.f, 0.8); } break;
    case 'rally': for (const o of friends(c, f)) { o.ad *= 1.08; ev.push({ k: 'up', a: f.key, up: u, b: o.key }); } break;
    case 'execute': break; // applied as the skill lands (see deal)
  }
}

function castSkill(c: Combat, ev: Ev[], f: Fighter, t: Fighter) {
  const s = f.skillMul;
  const lowestFoe = () => foes(c, f).sort((a, b) => a.hp - b.hp || a.key - b.key)[0];
  const lowestFriend = () => friends(c, f).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.key - b.key)[0];
  switch (f.def.skill) {
    case 'bonk': ev.push({ k: 'cast', a: f.key, skill: 'bonk', b: t.key }); deal(c, ev, f, t, SK.bonk.dmg * s, false); stun(ev, t, SK.bonk.stun); break;
    case 'foxfire': ev.push({ k: 'cast', a: f.key, skill: 'foxfire', b: t.key }); deal(c, ev, f, t, SK.foxfire.dmg * s, true); break;
    case 'snipe': { const v = lowestFoe(); ev.push({ k: 'cast', a: f.key, skill: 'snipe', b: v.key }); deal(c, ev, f, v, SK.snipe.dmg * s, false); break; }
    case 'drag': ev.push({ k: 'cast', a: f.key, skill: 'drag', b: t.key }); deal(c, ev, f, t, SK.drag.dmg * s, true); stun(ev, t, SK.drag.stun); heal(c, ev, f, f, SK.drag.heal * s); break;
    case 'guardup': ev.push({ k: 'cast', a: f.key, skill: 'guardup', b: f.key }); shield(ev, f, f, SK.guardup.shield * s, 4); break;
    case 'taunt': {
      ev.push({ k: 'cast', a: f.key, skill: 'taunt', b: f.key });
      shield(ev, f, f, SK.taunt.shield * s, 4);
      for (const o of around(c, f.x, f.y, 2, f.side)) { o.tauntBy = f.key; o.tauntT = 3; o.target = f.key; }
      break;
    }
    case 'boulder': {
      const cells: [number, number][] = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cells.push([t.x + dx, t.y + dy]);
      ev.push({ k: 'cast', a: f.key, skill: 'boulder', b: t.key, cells });
      deal(c, ev, f, t, SK.boulder.dmg * s, true);
      silence(ev, t, SK.boulder.silence + 0.5 * f.star);
      for (const o of around(c, t.x, t.y, 1, f.side)) deal(c, ev, f, o, SK.boulder.dmg * s, true);
      break;
    }
    case 'blink': {
      const v = lowestFoe(), spot = behind(c, v, f);
      if (spot) { place(c, f, spot.x, spot.y); ev.push({ k: 'blink', a: f.key, x: spot.x, y: spot.y }); f.target = v.key; }
      ev.push({ k: 'cast', a: f.key, skill: 'blink', b: v.key });
      deal(c, ev, f, v, SK.blink.dmg * s, false, true);
      break;
    }
    case 'wave': {
      const cells: [number, number][] = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) cells.push([f.x + dx, f.y + dy]);
      ev.push({ k: 'cast', a: f.key, skill: 'wave', cells });
      for (const o of around(c, f.x, f.y, 1, f.side)) { deal(c, ev, f, o, SK.wave.dmg * s, true); silence(ev, o, SK.wave.silence); }
      break;
    }
    case 'heal': { const v = lowestFriend(); ev.push({ k: 'cast', a: f.key, skill: 'heal', b: v.key }); heal(c, ev, f, v, SK.heal.heal * s); break; }
    case 'roar': {
      ev.push({ k: 'cast', a: f.key, skill: 'roar' });
      for (const o of around(c, f.x, f.y, 1, f.side)) deal(c, ev, f, o, SK.roar.dmg * s, false);
      f.ad *= 1.25;
      break;
    }
    case 'judge': {
      ev.push({ k: 'cast', a: f.key, skill: 'judge' });
      for (const o of around(c, f.x, f.y, 1, f.side)) { deal(c, ev, f, o, SK.judge.dmg * s, true); stun(ev, o, SK.judge.stun + 0.3 * f.star); }
      shield(ev, f, f, SK.judge.shield * s, 4);
      break;
    }
    case 'ttukttak': {
      ev.push({ k: 'cast', a: f.key, skill: 'ttukttak' });
      for (const o of friends(c, f)) { heal(c, ev, f, o, SK.ttukttak.heal * s); o.asBuff = 0.3; o.asBuffT = 5; }
      break;
    }
    case 'charm': ev.push({ k: 'cast', a: f.key, skill: 'charm', b: t.key }); deal(c, ev, f, t, SK.charm.dmg * s, true); stun(ev, t, SK.charm.stun); break;
    case 'reap': {
      const v = lowestFoe();
      ev.push({ k: 'cast', a: f.key, skill: 'reap', b: v.key });
      deal(c, ev, f, v, SK.reap.dmg * s, true);
      f.mana = v.alive ? 0 : f.maxMana * 0.5;
      return; // a kill refunds half the bar
    }
    case 'shell': ev.push({ k: 'cast', a: f.key, skill: 'shell' }); for (const o of friends(c, f)) shield(ev, f, o, SK.shell.shield * s, 4); break;
    case 'mountain': {
      const cells: [number, number][] = [];
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) cells.push([t.x + dx, t.y + dy]);
      ev.push({ k: 'cast', a: f.key, skill: 'mountain', b: t.key, cells });
      for (const o of friends(c, f)) heal(c, ev, f, o, SK.mountain.heal * s);
      for (const o of around(c, t.x, t.y, 2, f.side)) deal(c, ev, f, o, SK.mountain.dmg * s, true);
      break;
    }
    case 'devour': {
      ev.push({ k: 'cast', a: f.key, skill: 'devour', b: f.key });
      heal(c, ev, f, f, SK.devour.heal * s);
      f.ad *= 1.15; f.armor += 10; f.mr += 10;
      break;
    }
    case 'beam': {
      // Every cell on the line from the caster through its target to the edge.
      const cells: [number, number][] = [];
      const dx = t.x - f.x, dy = t.y - f.y, n = Math.max(Math.abs(dx), Math.abs(dy)) || 1;
      for (let k = 1; k < 12; k++) {
        const x = Math.round(f.x + (dx / n) * k), y = Math.round(f.y + (dy / n) * k);
        if (!inBoard(x, y)) break;
        cells.push([x, y]);
      }
      ev.push({ k: 'cast', a: f.key, skill: 'beam', b: t.key, cells });
      const hitKeys = new Set(cells.map(([x, y]) => c.grid[cell(x, y)]).filter((k) => k >= 0));
      for (const k of hitKeys) { const o = c.f[k]; if (o.side !== f.side) deal(c, ev, f, o, SK.beam.dmg * s, true); }
      break;
    }
  }
  f.mana = 0;
}

/** The first square on the shortest walk (eight ways) from f to any square within its reach of t, or null. */
function pathStep(c: Combat, f: Fighter, t: Fighter): { x: number; y: number } | null {
  const N = COLS * ROWS, prev = new Int16Array(N).fill(-2), q: number[] = [cell(f.x, f.y)];
  prev[q[0]] = -1;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % COLS, y = (i / COLS) | 0;
    if (h > 0 && Math.max(Math.abs(x - t.x), Math.abs(y - t.y)) <= f.range) {
      let k = i;
      while (prev[k] !== q[0]) k = prev[k];
      return { x: k % COLS, y: (k / COLS) | 0 };
    }
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if ((!dx && !dy) || !free(c, nx, ny)) continue;
      const j = cell(nx, ny);
      if (prev[j] !== -2) continue;
      prev[j] = i; q.push(j);
    }
  }
  return null;
}

/* ---------------------------------------------------------------- step */

/** Assassins leap to the enemy's back line as the fight opens. */
function opening(c: Combat, ev: Ev[]) {
  for (const f of c.f) {
    if (!f.leap) continue;
    const backY = f.side === 0 ? 0 : ROWS - 1, dir = f.side === 0 ? 1 : -1;
    let spot: { x: number; y: number } | null = null;
    for (let row = 0; row < HALF && !spot; row++) {
      const y = backY + dir * row;
      const xs = [...Array(COLS).keys()].sort((a, b) => Math.abs(a - f.x) - Math.abs(b - f.x));
      for (const x of xs) if (free(c, x, y)) { spot = { x, y }; break; }
    }
    if (spot) { place(c, f, spot.x, spot.y); ev.push({ k: 'blink', a: f.key, x: spot.x, y: spot.y }); }
  }
}

export function step(c: Combat): Ev[] {
  const ev: Ev[] = [];
  if (c.over) return ev;
  if (c.t === 0) opening(c, ev);
  c.t += DT;
  for (const f of c.f) {
    if (!f.alive) continue;
    if (f.shieldT > 0 && (f.shieldT -= DT) <= 0) f.shield = 0;
    if (f.tauntT > 0 && (f.tauntT -= DT) <= 0) f.tauntBy = -1;
    if (f.asBuffT > 0 && (f.asBuffT -= DT) <= 0) f.asBuff = 0;
    if (f.thornsT > 0 && (f.thornsT -= DT) <= 0) f.thorns = 0;
    if (f.manaRegen) f.mana = Math.min(f.maxMana, f.mana + f.manaRegen * DT);
    if (f.regen) f.hp = Math.min(f.maxHp, f.hp + f.maxHp * f.regen * DT);
    if (f.ramp) f.ad *= 1 + f.ramp * DT / 2;
    if (f.silenceT > 0) f.silenceT -= DT;
    if (f.stunT > 0) { f.stunT -= DT; continue; }
    // Who to fight: the one taunting, else keep the current target while it lives and is near, else the nearest.
    let t = f.tauntBy >= 0 && c.f[f.tauntBy].alive ? c.f[f.tauntBy] : f.target >= 0 && c.f[f.target].alive ? c.f[f.target] : null;
    const near = nearest(c, f);
    if (!near) break;
    if (!t || (cheb(f, t) > f.range && cheb(f, near) < cheb(f, t))) t = near;
    f.target = t.key;
    if (f.mana >= f.maxMana && f.def.skill !== 'none' && f.silenceT <= 0) { cast(c, ev, f, t); continue; }
    if (cheb(f, t) <= f.range) {
      f.atkT -= DT;
      if (f.atkT > 0) continue;
      f.atkT += 1 / (f.as * (1 + f.asBuff));
      const ranged = f.range > 1;
      const swings = c.rng.next() < f.double ? 2 : 1;
      ev.push({ k: 'atk', a: f.key, b: t.key, ranged });
      for (let k = 0; k < swings && t.alive; k++) {
        const dodge = t.dodge + (terrain(c.arena, t.x, t.y) === BUSH ? 0.2 : 0);
        if (dodge && c.rng.next() < dodge) { ev.push({ k: 'miss', a: f.key, b: t.key }); bump(c, ev, t, 'dodge'); continue; }
        const crit = f.crit > 0 && c.rng.next() < f.crit;
        const done = deal(c, ev, f, t, f.ad * (crit ? 2 : 1), false, crit);
        if (t.thorns && done > 0 && f.alive) deal(c, ev, t, f, done * t.thorns, true);
      }
      f.mana = Math.min(f.maxMana, f.mana + 10);
      bump(c, ev, f, 'attack', t);
    } else {
      f.atkT = Math.max(f.atkT, 0.15);
      f.moveT -= DT;
      if (f.moveT > 0) continue;
      // One cell along the shortest way to a square in reach of the target, round water, rocks and anyone in the way.
      let best = pathStep(c, f, t);
      if (!best) {
        let bd = cheb(f, t) + Math.hypot(f.x - t.x, f.y - t.y) * 0.01;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const x = f.x + dx, y = f.y + dy;
          if ((!dx && !dy) || !free(c, x, y)) continue;
          const d = Math.max(Math.abs(x - t.x), Math.abs(y - t.y)) + Math.hypot(x - t.x, y - t.y) * 0.01;
          if (d < bd) { bd = d; best = { x, y }; }
        }
      }
      if (best) {
        // Wading into mud takes a moment before the step itself.
        if (terrain(c.arena, best.x, best.y) === MUD && !f.wade) { f.wade = true; f.moveT = 0.45; continue; }
        f.wade = false;
        place(c, f, best.x, best.y);
        const g = terrain(c.arena, best.x, best.y);
        f.moveT = g === MUD ? 1.15 : g === ICE ? 0.38 : 0.7;
        ev.push({ k: 'move', a: f.key, x: best.x, y: best.y, t: f.moveT });
      }
      else f.moveT = 0.2;
    }
  }
  const alive = [0, 0];
  for (const f of c.f) if (f.alive) alive[f.side]++;
  if (!alive[0] || !alive[1]) { c.over = true; c.winner = alive[0] ? 0 : alive[1] ? 1 : -1; }
  else if (c.t >= TIME_LIMIT) { c.over = true; c.winner = -1; }
  return ev;
}

export interface Outcome { winner: 0 | 1 | -1; survivors: Fighter[]; t: number }

export function fight(a: Placed[], b: Placed[], seed: number, ctx: Ctx = {}): Outcome {
  const c = setup(a, b, seed, ctx);
  if (!a.length || !b.length) { c.over = true; c.winner = a.length ? 0 : b.length ? 1 : -1; }
  while (!c.over) step(c);
  return { winner: c.winner, survivors: c.f.filter((f) => f.alive), t: c.t };
}
