/**
 * What every theme shares: the shape of a piece, a trait and an item, the
 * shop's numbers, and the registry the rest of the game reads from. A theme
 * (정령 키우기, 한식 대전, 사계절 요괴) fills the registry with its own pieces.
 */

export type Trait = string;

/** What a trait does at each of its steps. Most act on the pieces that carry it; teamArmor reaches the whole side. */
export type Effect =
  | { k: 'double' | 'dodge' | 'ad' | 'as' | 'hp' | 'lifesteal' | 'skill' | 'resist' | 'mana' | 'regen' | 'ramp' | 'teamArmor'; v: number[] }
  | { k: 'crit'; v: number[]; leap: true };

/**
 * A trait's stacks: something that builds up during a fight (or, for 'round', from fight to fight).
 *  on: what adds a stack. stat: what each stack gives (v is per stack, by step). max: the most stacks.
 *  burst: at max, the stacks go off as extra magic damage on the target (v), then start again.
 *  kin: each stack goes to every ally sharing the trait instead (mana).
 *  low: once, when health first falls under half, a shield of v.
 */
export interface Stack {
  on: 'attack' | 'hit' | 'cast' | 'kill' | 'dodge' | 'round' | 'low';
  stat: 'ad' | 'as' | 'resist' | 'skill' | 'hp' | 'mana' | 'burst' | 'shield';
  v: number[]; max: number; text: string;
}

export interface TraitDef {
  name: string; kind: 'origin' | 'class'; steps: number[]; text: string; levels: string[]; effect: Effect;
  /** What builds up while it fights (see Stack). */
  stack?: Stack;
  /** 사계절 요괴: the season (0 봄 .. 3 겨울) in which this trait counts double. */
  season?: number;
}

export type Acc =
  | 'horn' | 'horns' | 'eye' | 'ears' | 'ears9' | 'stripes' | 'hat' | 'gat' | 'shell' | 'fins' | 'mane' | 'pole' | 'crown' | 'hood' | 'whiskers' | 'spikes' | 'serpent'
  | 'wings' | 'bumps' | 'leaf' | 'petals' | 'longears' | 'sun' | 'swirl' | 'snow' | 'cloud' | 'bolt' | 'none'
  | 'quills' | 'flame' | 'snailshell' | 'penguin' | 'mole' | 'fleece' | 'antlers' | 'roundears' | 'starmark' | 'dragon' | 'halo' | 'conch' | 'castle' | 'antennae';
/** Food and other non-figure bodies (한식 대전 and a few 사계절 pieces). */
export type Shape = 'figure' | 'bowl' | 'rods' | 'roll' | 'disc' | 'fish' | 'crab' | 'cabbage' | 'skewer' | 'bird' | 'pot' | 'snowman' | 'cloud' | 'twister' | 'pan' | 'drop' | 'pebble' | 'jelly';

export interface Look { body: string; head: string; acc?: Acc; shape?: Shape; size?: number; extra?: string;
  /** A second accessory (evolutions add one). */
  acc2?: Acc }

export interface UnitDef {
  id: string; name: string; tier: number; traits: Trait[];
  hp: number; ad: number; as: number; range: number; armor: number; mr: number;
  mana: number; manaStart: number;
  skill: string; skillText: string; look: Look;
  /** 정령 키우기: what it evolves into at two stars and at three (a new name and a change of look). */
  evo?: [Evolution, Evolution];
}
export interface Evolution { name: string; look: Partial<Look>;
  /** What evolving adds to the skill (the last form keeps the one before too). */
  up?: Up;
  /** A trait the form gains, as some creatures gain a second type when they evolve. */
  trait?: Trait }

/** Skill upgrades an evolution brings. */
export type Up = 'thorns' | 'share' | 'twin' | 'splash' | 'manaback' | 'drain' | 'haste' | 'execute' | 'chill' | 'rally';
export const UP_TEXT: Record<Up, [string, string]> = {
  thorns: ['가시', '기술을 쓴 뒤 5초 동안 받은 평타 피해의 30%를 되돌려줘요.'],
  share: ['나눔', '체력이 가장 낮은 우리 편에게도 보호막을 씌워요.'],
  twin: ['연쇄', '다른 적 하나에게 기술 피해의 60%를 한 번 더 줘요.'],
  splash: ['튀김', '기술에 맞은 적 둘레의 적에게도 40% 피해를 줘요.'],
  manaback: ['여운', '기술을 쓴 뒤 마나 30%를 돌려받아요.'],
  drain: ['흡수', '기술 피해의 35%만큼 체력을 되찾아요.'],
  haste: ['신바람', '기술을 쓴 뒤 5초 동안 공격 속도 +35%.'],
  execute: ['마무리', '체력이 40%보다 적은 적에게 기술 피해 +50%.'],
  chill: ['얼림', '기술에 맞은 적이 0.8초 동안 멈춰요.'],
  rally: ['응원', '기술을 쓸 때마다 우리 편 모두 공격력 +8% (이번 싸움 동안 쌓여요).'],
};
/** The upgrades a piece's skill has at a number of stars. */
export const upsAt = (d: UnitDef, star: number): Up[] => (d.evo ? d.evo.slice(0, Math.max(0, star - 1)).map((e) => e.up).filter((u): u is Up => !!u) : []);

/** The name a piece goes by at a number of stars (its evolution, where it has one). */
export const nameAt = (d: UnitDef, star: number) => (star >= 2 && d.evo ? d.evo[Math.min(3, star) - 2].name : d.name);
/** How a piece looks at a number of stars: each evolution adds to the one before. */
export function lookAt(d: UnitDef, star: number): Look {
  if (!d.evo || star < 2) return d.look;
  let l = { ...d.look, ...d.evo[0].look };
  if (star >= 3) l = { ...l, ...d.evo[1].look };
  return l;
}

/** Stat changes an item gives the piece holding it. */
export interface Mods { ad?: number; as?: number; hp?: number; resist?: number; mana?: number; crit?: number; dodge?: number; skill?: number }
export interface ItemDef { id: string; name: string; text: string; color: string; mods: Mods; base: boolean }

export interface Palette { accent: string; deep: string; bg: string; table: string; frame: string; mine: [string, string]; theirs: [string, string]; line: string;
  /** Around the board: a meadow with trees, flowers and clouds under a sky (else a plain room). */
  scenery?: 'meadow'; sky?: string }

export interface Theme {
  id: string; title: string; kicker: string; lede: string;
  creepName: string; creepText: string;
  units: UnitDef[];
  /** Wild things on the creep rounds: small, middling, big. */
  creeps: [UnitDef, UnitDef, UnitDef];
  traits: Record<Trait, TraitDef>;
  botNames: string[]; plans: Trait[][];
  palette: Palette;
  /** Things that go on pieces (ingredients, charms, fruit); two on one piece make a stronger mix. */
  items?: ItemDef[];
  /** What the items are called (재료, 부적, 열매) and what two of them make (양념, 부적, 비약). */
  itemWord?: string; mixWord?: string;
  /** Named sauces for some pairs of ingredients (key: ids joined by '+', sorted). */
  recipes?: Record<string, string>;
  /** 사계절 요괴: the season turns every three rounds. */
  seasons?: boolean;
  /** Whether the pieces get faces (dishes look better without). */
  faces?: boolean;
}

/* ------------------------------------------------------------ registry */

export const UNITS: UnitDef[] = [];
export const TRAITS: Record<Trait, TraitDef> = {};
export const BY_ID: Record<string, UnitDef> = {};
let active: Theme | null = null;
export const theme = (): Theme => active!;

/** Make a theme the one the game reads from. */
export function install(t: Theme) {
  active = t;
  UNITS.length = 0; UNITS.push(...t.units);
  for (const k of Object.keys(TRAITS)) delete TRAITS[k];
  Object.assign(TRAITS, t.traits);
  for (const k of Object.keys(BY_ID)) delete BY_ID[k];
  for (const d of [...t.units, ...t.creeps]) BY_ID[d.id] = d;
}

/* ---------------------------------------------------------- unit maker */

export type Role = 'tank' | 'fighter' | 'ranged' | 'caster' | 'striker';
const ROLE: Record<Role, { hp: number; ad: number; as: number; range: number; armor: number; mr: number }> = {
  tank: { hp: 700, ad: 50, as: 0.6, range: 1, armor: 40, mr: 35 },
  fighter: { hp: 620, ad: 60, as: 0.7, range: 1, armor: 30, mr: 25 },
  striker: { hp: 520, ad: 66, as: 0.8, range: 1, armor: 20, mr: 20 },
  ranged: { hp: 490, ad: 58, as: 0.75, range: 4, armor: 15, mr: 15 },
  caster: { hp: 480, ad: 42, as: 0.65, range: 3, armor: 15, mr: 25 },
};

export function unit(id: string, name: string, tier: number, traits: Trait[], role: Role, mana: [number, number], skill: string, skillText: string, look: Look, evo?: [Evolution, Evolution]): UnitDef {
  const r = ROLE[role], k = 1 + (tier - 1) * 0.22;
  return { id, name, tier, traits, hp: Math.round(r.hp * k), ad: Math.round(r.ad * k), as: r.as, range: r.range, armor: r.armor, mr: r.mr, mana: mana[1], manaStart: mana[0], skill, skillText, look, evo };
}

export function creep(id: string, name: string, role: Role, hp: number, ad: number, look: Look): UnitDef {
  return { ...unit(id, name, 1, [], role, [0, 999], 'none', '', look), hp, ad };
}

/* --------------------------------------------------------------- shop */

export const TIER_COST = [0, 1, 2, 3, 4, 5];
export const POOL_SIZE = [0, 29, 22, 18, 12, 10];
/** Shop odds (percent of tier 1 to 5) by player level. */
export const ODDS: number[][] = [
  [], [100, 0, 0, 0, 0], [100, 0, 0, 0, 0], [75, 25, 0, 0, 0], [55, 30, 15, 0, 0], [45, 33, 20, 2, 0],
  [30, 40, 25, 5, 0], [19, 30, 35, 15, 1], [18, 25, 32, 22, 3], [10, 20, 25, 35, 10],
];
/** XP to go from level n to n + 1. */
export const XP_NEXT = [0, 2, 2, 6, 10, 20, 36, 56, 80, Infinity];
export const STAR_MUL = [0, 1, 1.8, 3.24];
export const SKILL_MUL = [0, 1, 1.6, 2.6];

/** How much a piece sells for: what went into it. */
export function sellValue(id: string, star: number): number {
  const c = BY_ID[id].tier;
  return star === 1 ? c : c * 3 ** (star - 1) - (c > 1 ? 1 : 0);
}

/** A piece's traits at a number of stars: its own, plus any its evolutions gained. */
export function traitsAt(d: UnitDef, star = 1): Trait[] {
  const extra = d.evo ? d.evo.slice(0, Math.max(0, star - 1)).map((e) => e.trait).filter((t): t is Trait => !!t && !d.traits.includes(t)) : [];
  return extra.length ? [...d.traits, ...extra] : d.traits;
}

/** Which steps of each trait a set of pieces reaches (counting each kind once, at its best-evolved copy). */
export function traitCounts(pieces: (string | { id: string; star: number })[]): { trait: Trait; n: number; step: number }[] {
  const best = new Map<string, number>(), n: Record<Trait, number> = {};
  for (const p of pieces) {
    const id = typeof p === 'string' ? p : p.id, star = typeof p === 'string' ? 1 : p.star;
    best.set(id, Math.max(best.get(id) ?? 0, star));
  }
  for (const [id, star] of best) for (const t of traitsAt(BY_ID[id], star)) n[t] = (n[t] ?? 0) + 1;
  return Object.keys(n).map((t) => {
    const k = n[t];
    let step = 0;
    TRAITS[t].steps.forEach((s, i) => { if (k >= s) step = i + 1; });
    return { trait: t, n: k, step };
  }).sort((a, b) => b.step - a.step || b.n - a.n || a.trait.localeCompare(b.trait));
}

/* -------------------------------------------------------------- items */

const MOD_TEXT: Record<keyof Mods, (v: number) => string> = {
  ad: (v) => `공격력 +${Math.round(v * 100)}%`, as: (v) => `공격 속도 +${Math.round(v * 100)}%`, hp: (v) => `체력 +${Math.round(v)}`,
  resist: (v) => `방어·마법 저항 +${Math.round(v)}`, mana: (v) => `시작 마나 +${Math.round(v)}`, crit: (v) => `치명타 +${Math.round(v * 100)}%`,
  dodge: (v) => `회피 +${Math.round(v * 100)}%`, skill: (v) => `기술 +${Math.round(v * 100)}%`,
};
export const modsText = (m: Mods) => (Object.keys(m) as (keyof Mods)[]).map((k) => MOD_TEXT[k](m[k]!)).join(', ');

/** An item by id: a base ingredient, or two joined by '+' (a sauce, stronger than the two apart). */
export function itemDef(id: string): ItemDef {
  const t = active!;
  const base = t.items!.find((i) => i.id === id);
  if (base) return base;
  const [a, b] = id.split('+').map((x) => t.items!.find((i) => i.id === x)!);
  const mods: Mods = {};
  const k = a.id === b.id ? 1.7 : 1.4;
  for (const m of [a.mods, b.mods]) for (const key of Object.keys(m) as (keyof Mods)[]) mods[key] = (mods[key] ?? 0) + m[key]! * k;
  const name = t.recipes?.[id] ?? `${a.name}·${b.name} ${t.mixWord ?? '양념'}`;
  return { id, name, text: modsText(mods), color: a.id === b.id ? a.color : b.color, mods, base: false };
}
export const comboId = (a: string, b: string) => [a, b].sort().join('+');
