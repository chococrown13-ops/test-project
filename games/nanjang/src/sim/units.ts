/**
 * The pieces of 도깨비 난장: creatures and folk of Korean tales. Each has a
 * cost tier (1 to 5), two traits (where it comes from, and how it fights),
 * base stats, and one skill it casts when its mana fills.
 */

export type Trait =
  | 'dokkaebi' | 'fox' | 'tiger' | 'sea' | 'under' | 'beast'
  | 'warrior' | 'archer' | 'shaman' | 'assassin' | 'guard';

export interface TraitDef { name: string; kind: 'origin' | 'class'; steps: number[]; text: string; levels: string[] }

export const TRAITS: Record<Trait, TraitDef> = {
  dokkaebi: { name: '도깨비', kind: 'origin', steps: [2, 3], text: '도깨비가 평타를 두 번 칠 때가 있어요.', levels: ['20% 확률', '40% 확률'] },
  fox: { name: '여우', kind: 'origin', steps: [2, 3], text: '여우가 평타를 피해요.', levels: ['25% 회피', '45% 회피'] },
  tiger: { name: '산군', kind: 'origin', steps: [2, 3], text: '산군의 공격력이 올라요.', levels: ['공격력 +30%', '공격력 +65%'] },
  sea: { name: '용궁', kind: 'origin', steps: [2, 4], text: '용궁 식구가 마나를 저절로 얻어요.', levels: ['초당 마나 4', '초당 마나 9'] },
  under: { name: '저승', kind: 'origin', steps: [2, 3], text: '저승 식구가 준 피해만큼 체력을 되찾아요.', levels: ['흡혈 25%', '흡혈 50%'] },
  beast: { name: '신수', kind: 'origin', steps: [2, 3], text: '신수의 방어력과 마법 저항이 올라요.', levels: ['+35', '+80'] },
  warrior: { name: '장수', kind: 'class', steps: [2, 4], text: '장수의 최대 체력이 늘어요.', levels: ['체력 +25%', '체력 +60%'] },
  archer: { name: '궁수', kind: 'class', steps: [2, 3], text: '궁수의 공격 속도가 빨라져요.', levels: ['공속 +30%', '공속 +70%'] },
  shaman: { name: '무당', kind: 'class', steps: [2, 4], text: '무당의 기술이 세져요.', levels: ['기술 +50%', '기술 +110%'] },
  assassin: { name: '자객', kind: 'class', steps: [2, 3], text: '자객이 싸움이 시작되면 적 뒷줄로 뛰어들고, 치명타를 노려요.', levels: ['치명타 25%', '치명타 45%'] },
  guard: { name: '수호', kind: 'class', steps: [2, 3], text: '우리 편 모두의 방어력이 올라요.', levels: ['모두 +20', '모두 +45'] },
};

/** How a piece is drawn: colours and the thing that makes it recognisable. */
export interface Look {
  body: string; head: string;
  acc: 'horn' | 'horns' | 'eye' | 'ears' | 'ears9' | 'stripes' | 'hat' | 'gat' | 'shell' | 'fins' | 'mane' | 'pole' | 'crown' | 'hood' | 'whiskers' | 'spikes' | 'serpent';
  size?: number;
}

export interface UnitDef {
  id: string; name: string; tier: number; traits: Trait[];
  hp: number; ad: number; as: number; range: number; armor: number; mr: number;
  mana: number; manaStart: number;
  skill: string; skillText: string; look: Look;
}

type Role = 'tank' | 'fighter' | 'ranged' | 'caster' | 'striker';
const ROLE: Record<Role, Omit<UnitDef, 'id' | 'name' | 'tier' | 'traits' | 'skill' | 'skillText' | 'look' | 'mana' | 'manaStart'>> = {
  tank: { hp: 700, ad: 50, as: 0.6, range: 1, armor: 40, mr: 35 },
  fighter: { hp: 620, ad: 60, as: 0.7, range: 1, armor: 30, mr: 25 },
  striker: { hp: 520, ad: 66, as: 0.8, range: 1, armor: 20, mr: 20 },
  ranged: { hp: 480, ad: 58, as: 0.75, range: 4, armor: 15, mr: 15 },
  caster: { hp: 480, ad: 42, as: 0.65, range: 3, armor: 15, mr: 25 },
};

function u(id: string, name: string, tier: number, traits: Trait[], role: Role, mana: [number, number], skill: string, skillText: string, look: Look): UnitDef {
  const r = ROLE[role], k = 1 + (tier - 1) * 0.22;
  return { id, name, tier, traits, hp: Math.round(r.hp * k), ad: Math.round(r.ad * k), as: r.as, range: r.range, armor: r.armor, mr: r.mr, mana: mana[1], manaStart: mana[0], skill, skillText, look };
}

export const UNITS: UnitDef[] = [
  // 1
  u('kkoma', '꼬마도깨비', 1, ['dokkaebi', 'warrior'], 'fighter', [0, 70], 'bonk', '방망이로 내리쳐 피해를 주고 잠깐 기절시켜요.', { body: '#c9553f', head: '#e07a5f', acc: 'horn' }),
  u('foxfire', '여우불', 1, ['fox', 'shaman'], 'caster', [20, 70], 'foxfire', '푸른 여우불을 던져 마법 피해를 줘요.', { body: '#f1e7d0', head: '#f4a259', acc: 'ears' }),
  u('hunter', '산포수', 1, ['tiger', 'archer'], 'ranged', [0, 60], 'snipe', '체력이 가장 낮은 적을 저격해요.', { body: '#6b7f4a', head: '#e9c9a5', acc: 'gat' }),
  u('watergh', '물귀신', 1, ['sea', 'assassin'], 'striker', [0, 60], 'drag', '물속으로 끌어당겨 피해를 주고 묶고, 제 체력을 채워요.', { body: '#3d7f8f', head: '#9ec9c2', acc: 'hood' }),
  u('najol', '저승 나졸', 1, ['under', 'warrior'], 'tank', [0, 80], 'guardup', '보호막을 둘러 피해를 막아요.', { body: '#2b2d33', head: '#d8d4cc', acc: 'gat' }),
  // 2
  u('jangseung', '장승', 2, ['beast', 'guard'], 'tank', [30, 100], 'taunt', '큰 보호막을 두르고 둘레의 적이 자기만 때리게 해요.', { body: '#a5784f', head: '#c99a6b', acc: 'pole', size: 1.15 }),
  u('oneeye', '외눈도깨비', 2, ['dokkaebi', 'archer'], 'ranged', [0, 70], 'boulder', '바위를 던져 맞은 적과 그 둘레에 피해를 줘요.', { body: '#4f6d7a', head: '#87a8b8', acc: 'eye' }),
  u('whitefox', '백여우', 2, ['fox', 'assassin'], 'striker', [0, 60], 'blink', '체력이 가장 낮은 적 뒤로 순간이동해 베어요.', { body: '#f6f4ef', head: '#ffffff', acc: 'ears' }),
  u('carp', '잉어 장군', 2, ['sea', 'warrior'], 'fighter', [20, 80], 'wave', '물결을 일으켜 둘레의 적 모두에게 피해를 줘요.', { body: '#d9822b', head: '#f2b880', acc: 'fins' }),
  // 3
  u('bari', '바리데기', 3, ['under', 'shaman'], 'caster', [30, 80], 'heal', '생명수로 체력이 가장 낮은 우리 편을 고쳐요.', { body: '#efe9f4', head: '#f2d7c4', acc: 'crown' }),
  u('tigergen', '범 장수', 3, ['tiger', 'warrior'], 'fighter', [0, 70], 'roar', '포효로 둘레의 적에게 피해를 주고 공격력이 올라요.', { body: '#e08e2b', head: '#f2b14a', acc: 'stripes', size: 1.1 }),
  u('haetae', '해태', 3, ['beast', 'guard'], 'tank', [40, 100], 'judge', '둘레의 적을 기절시키고 보호막을 둘러요.', { body: '#7fa58b', head: '#a8c7b0', acc: 'mane', size: 1.15 }),
  u('dokchief', '도깨비 대장', 3, ['dokkaebi', 'shaman'], 'caster', [20, 80], 'ttukttak', '"뚝딱!" 우리 편 모두의 체력을 채우고 공격 속도를 올려요.', { body: '#8a3b2e', head: '#d26a4f', acc: 'horns', size: 1.1 }),
  // 4
  u('gumiho', '구미호', 4, ['fox', 'shaman'], 'caster', [30, 80], 'charm', '홀려서 큰 마법 피해를 주고 오래 기절시켜요.', { body: '#f3ead8', head: '#f6c28b', acc: 'ears9', size: 1.1 }),
  u('reaper', '저승사자', 4, ['under', 'assassin'], 'striker', [0, 70], 'reap', '체력이 가장 낮은 적을 거둬 가요. 쓰러뜨리면 마나 절반을 돌려받아요.', { body: '#16171b', head: '#e9e6e0', acc: 'gat', size: 1.1 }),
  u('turtle', '별주부', 4, ['sea', 'guard'], 'tank', [40, 110], 'shell', '우리 편 모두에게 보호막을 씌워요.', { body: '#5a8f5a', head: '#a6c48a', acc: 'shell', size: 1.15 }),
  // 5
  u('sansin', '산신령', 5, ['tiger', 'shaman'], 'caster', [40, 110], 'mountain', '산의 기운으로 우리 편을 고치고 대상 둘레 적에게 큰 피해를 줘요.', { body: '#f5f1e6', head: '#efd9bd', acc: 'whiskers', size: 1.15 }),
  u('bulgasari', '불가사리', 5, ['beast', 'warrior'], 'tank', [0, 50], 'devour', '쇠를 먹어 체력을 채우고 공격력과 방어력이 계속 커져요.', { body: '#5b5e66', head: '#8c9099', acc: 'spikes', size: 1.3 }),
  u('imugi', '이무기', 5, ['sea', 'archer'], 'ranged', [20, 90], 'beam', '대상 쪽으로 일직선의 물줄기를 뿜어 줄에 선 적 모두에게 피해를 줘요.', { body: '#2f5d62', head: '#5e8b7e', acc: 'serpent', size: 1.2 }),
];

/** Wild things on the creep rounds: not in the shop. */
export const CREEPS: UnitDef[] = [
  { ...u('dog', '들개', 1, [], 'striker', [0, 999], 'none', '', { body: '#8d7a63', head: '#a8947a', acc: 'ears' }), hp: 300, ad: 30 },
  { ...u('boar', '멧돼지', 2, [], 'tank', [0, 999], 'none', '', { body: '#4e3d33', head: '#6b5547', acc: 'spikes' }), hp: 700, ad: 45 },
  { ...u('bear', '반달곰', 3, [], 'tank', [0, 999], 'none', '', { body: '#1f1f22', head: '#333338', acc: 'ears', size: 1.3 }), hp: 1300, ad: 70 },
];

export const BY_ID: Record<string, UnitDef> = Object.fromEntries([...UNITS, ...CREEPS].map((d) => [d.id, d]));

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

/** Which steps of each trait a set of pieces reaches (counting each kind once). */
export function traitCounts(ids: string[]): { trait: Trait; n: number; step: number }[] {
  const seen = new Set<string>(), n: Partial<Record<Trait, number>> = {};
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    for (const t of BY_ID[id].traits) n[t] = (n[t] ?? 0) + 1;
  }
  return (Object.keys(n) as Trait[]).map((t) => {
    const k = n[t]!;
    let step = 0;
    TRAITS[t].steps.forEach((s, i) => { if (k >= s) step = i + 1; });
    return { trait: t, n: k, step };
  }).sort((a, b) => b.step - a.step || b.n - a.n || a.trait.localeCompare(b.trait));
}
