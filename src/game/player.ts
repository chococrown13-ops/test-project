/**
 * 선수 생성 · 가치 평가 · 성장.
 *
 * 능력치는 CA(현재 능력, 1-200)에서 역산합니다. CA 를 포지션별 가중치에 따라
 * 흩뿌리면 "중앙 수비수인데 마무리가 18" 같은 선수가 나오지 않습니다.
 */

import { Rng, clamp } from './rng';
import {
  ATTRIBUTE_KEYS, GROUP_KEYS, ROLE_GROUP,
  type AttributeKey, type Attributes, type Role,
} from './attributes';
import type { PersonalityDef, PersonalityId, Player, SeasonStats, CareerStats } from './types';
import { COUNTRY_BY_ID, type CountryDef } from '../data/countries';
import { NAME_POOLS, type NameFactory } from '../data/names';

// ── 성격 ────────────────────────────────────────────────────────────────

export const PERSONALITIES: PersonalityDef[] = [
  { id: 'professional', label: '프로 정신', wageGreed: 0.92, loyalty: 62, ambition: 58, growth: 1.14, volatility: 0.7, note: '훈련을 거르지 않습니다. 성장이 빠르고 불만이 적습니다.' },
  { id: 'ambitious', label: '야심가', wageGreed: 1.05, loyalty: 34, ambition: 88, growth: 1.10, volatility: 1.15, note: '더 큰 무대를 원합니다. 정체되면 곧바로 이적을 요구합니다.' },
  { id: 'loyal', label: '충성심', wageGreed: 0.90, loyalty: 88, ambition: 40, growth: 1.00, volatility: 0.8, note: '구단을 잘 떠나지 않습니다. 재계약 협상이 수월합니다.' },
  { id: 'determined', label: '근성', wageGreed: 0.98, loyalty: 55, ambition: 70, growth: 1.12, volatility: 0.85, note: '역경에 강합니다. 출전 시간이 줄어도 버팁니다.' },
  { id: 'balanced', label: '평범함', wageGreed: 1.00, loyalty: 55, ambition: 55, growth: 1.00, volatility: 1.0, note: '특별히 두드러지는 성향이 없습니다.' },
  { id: 'temperamental', label: '기복 심함', wageGreed: 1.06, loyalty: 45, ambition: 62, growth: 0.94, volatility: 1.45, note: '경기력 편차가 큽니다. 기분을 자주 살펴야 합니다.' },
  { id: 'mercenary', label: '돈에 민감', wageGreed: 1.30, loyalty: 22, ambition: 66, growth: 0.96, volatility: 1.25, note: '주급이 전부입니다. 수수료 협상은 오히려 쉽습니다.' },
  { id: 'lowKey', label: '소박함', wageGreed: 0.82, loyalty: 72, ambition: 34, growth: 0.98, volatility: 0.75, note: '조용히 뛰는 것을 좋아합니다. 큰 이적을 꺼립니다.' },
  { id: 'perfectionist', label: '완벽주의', wageGreed: 1.02, loyalty: 48, ambition: 76, growth: 1.16, volatility: 1.30, note: '기량은 잘 늘지만 팀 상황에 예민합니다.' },
  { id: 'volatile', label: '다혈질', wageGreed: 1.12, loyalty: 30, ambition: 68, growth: 0.92, volatility: 1.60, note: '카드를 자주 받고 불만이 빠르게 쌓입니다.' },
];

export const PERSONALITY_BY_ID = Object.fromEntries(
  PERSONALITIES.map((p) => [p.id, p]),
) as Record<PersonalityId, PersonalityDef>;

/** 능력이 높을수록 프로 정신을 가진 선수가 많아지도록 가중치를 줍니다. */
function rollPersonality(rng: Rng, ca: number): PersonalityId {
  const eliteBias = clamp((ca - 90) / 90, 0, 1);
  const weights: Array<[PersonalityId, number]> = [
    ['professional', 10 + eliteBias * 14],
    ['ambitious', 12 + eliteBias * 6],
    ['loyal', 10],
    ['determined', 11 + eliteBias * 4],
    ['balanced', 18],
    ['temperamental', 12 - eliteBias * 4],
    ['mercenary', 8 + eliteBias * 3],
    ['lowKey', 9 - eliteBias * 3],
    ['perfectionist', 6 + eliteBias * 5],
    ['volatile', 8 - eliteBias * 3],
  ];
  const total = weights.reduce((sum, [, w]) => sum + Math.max(0.5, w), 0);
  let roll = rng.next() * total;
  for (const [id, w] of weights) {
    roll -= Math.max(0.5, w);
    if (roll <= 0) return id;
  }
  return 'balanced';
}

// ── 포지션별 능력치 가중치 ──────────────────────────────────────────────

interface RoleProfile {
  key: AttributeKey[];
  secondary: AttributeKey[];
  /** 이 포지션이 잘 서는 이웃 포지션. */
  neighbours: Role[];
  /** 키 평균(cm). */
  height: number;
}

const ROLE_PROFILES: Record<Role, RoleProfile> = {
  GK: {
    key: ['reflexes', 'handling', 'oneOnOnes', 'aerialReach', 'commandOfArea', 'positioning', 'concentration', 'agility'],
    secondary: ['kicking', 'throwing', 'communication', 'rushingOut', 'anticipation', 'decisions', 'bravery', 'jumpingReach'],
    neighbours: [], height: 190,
  },
  DC: {
    key: ['marking', 'tackling', 'heading', 'positioning', 'strength', 'jumpingReach', 'bravery', 'concentration'],
    secondary: ['anticipation', 'decisions', 'composure', 'aggression', 'determination', 'passing', 'pace'],
    neighbours: ['DM', 'DR', 'DL'], height: 187,
  },
  DR: {
    key: ['marking', 'tackling', 'crossing', 'pace', 'acceleration', 'stamina', 'positioning', 'workRate'],
    secondary: ['anticipation', 'concentration', 'teamwork', 'decisions', 'passing', 'dribbling', 'agility'],
    neighbours: ['WBR', 'DC', 'MR'], height: 180,
  },
  DL: {
    key: ['marking', 'tackling', 'crossing', 'pace', 'acceleration', 'stamina', 'positioning', 'workRate'],
    secondary: ['anticipation', 'concentration', 'teamwork', 'decisions', 'passing', 'dribbling', 'agility'],
    neighbours: ['WBL', 'DC', 'ML'], height: 180,
  },
  WBR: {
    key: ['crossing', 'pace', 'acceleration', 'stamina', 'workRate', 'dribbling', 'teamwork'],
    secondary: ['marking', 'tackling', 'passing', 'anticipation', 'agility', 'balance', 'technique', 'offTheBall'],
    neighbours: ['DR', 'MR', 'AMR'], height: 179,
  },
  WBL: {
    key: ['crossing', 'pace', 'acceleration', 'stamina', 'workRate', 'dribbling', 'teamwork'],
    secondary: ['marking', 'tackling', 'passing', 'anticipation', 'agility', 'balance', 'technique', 'offTheBall'],
    neighbours: ['DL', 'ML', 'AML'], height: 179,
  },
  DM: {
    key: ['tackling', 'positioning', 'anticipation', 'teamwork', 'workRate', 'passing', 'concentration', 'decisions'],
    secondary: ['marking', 'composure', 'strength', 'stamina', 'vision', 'aggression', 'firstTouch'],
    neighbours: ['MC', 'DC'], height: 183,
  },
  MC: {
    key: ['passing', 'vision', 'decisions', 'technique', 'firstTouch', 'teamwork', 'workRate', 'composure'],
    secondary: ['stamina', 'anticipation', 'longShots', 'tackling', 'offTheBall', 'dribbling', 'positioning'],
    neighbours: ['DM', 'AMC', 'MR', 'ML'], height: 180,
  },
  MR: {
    key: ['crossing', 'dribbling', 'pace', 'acceleration', 'stamina', 'workRate', 'technique'],
    secondary: ['passing', 'agility', 'balance', 'teamwork', 'offTheBall', 'firstTouch', 'flair'],
    neighbours: ['AMR', 'WBR', 'MC'], height: 178,
  },
  ML: {
    key: ['crossing', 'dribbling', 'pace', 'acceleration', 'stamina', 'workRate', 'technique'],
    secondary: ['passing', 'agility', 'balance', 'teamwork', 'offTheBall', 'firstTouch', 'flair'],
    neighbours: ['AML', 'WBL', 'MC'], height: 178,
  },
  AMC: {
    key: ['passing', 'vision', 'technique', 'firstTouch', 'dribbling', 'flair', 'composure', 'offTheBall'],
    secondary: ['longShots', 'decisions', 'anticipation', 'agility', 'balance', 'finishing', 'freeKicks'],
    neighbours: ['MC', 'ST', 'AMR', 'AML'], height: 178,
  },
  AMR: {
    key: ['dribbling', 'pace', 'acceleration', 'technique', 'agility', 'flair', 'crossing', 'offTheBall'],
    secondary: ['finishing', 'firstTouch', 'balance', 'passing', 'composure', 'longShots', 'workRate'],
    neighbours: ['MR', 'AMC', 'ST'], height: 177,
  },
  AML: {
    key: ['dribbling', 'pace', 'acceleration', 'technique', 'agility', 'flair', 'crossing', 'offTheBall'],
    secondary: ['finishing', 'firstTouch', 'balance', 'passing', 'composure', 'longShots', 'workRate'],
    neighbours: ['ML', 'AMC', 'ST'], height: 177,
  },
  ST: {
    key: ['finishing', 'offTheBall', 'composure', 'anticipation', 'firstTouch', 'acceleration', 'pace', 'heading'],
    secondary: ['dribbling', 'technique', 'strength', 'jumpingReach', 'longShots', 'balance', 'decisions', 'penaltyTaking'],
    neighbours: ['AMC', 'AMR', 'AML'], height: 183,
  },
};

/** 골키퍼에게도 의미가 있는 기술 능력치. 나머지는 낮게 깔립니다. */
const GK_USEFUL_TECHNICAL = new Set<AttributeKey>(['firstTouch', 'passing', 'technique']);

/** 스쿼드 구성 — 이 비율로 포지션을 배분합니다. */
const SQUAD_TEMPLATE: Role[] = [
  'GK', 'GK', 'GK',
  'DR', 'DR', 'DC', 'DC', 'DC', 'DC', 'DL', 'DL',
  'DM', 'DM', 'MC', 'MC', 'MC',
  'MR', 'ML', 'AMC', 'AMC', 'AMR', 'AML',
  'ST', 'ST', 'ST',
];

export const SQUAD_SIZE = SQUAD_TEMPLATE.length;

// ── 생성 ────────────────────────────────────────────────────────────────

export function emptySeasonStats(): SeasonStats {
  return { apps: 0, subApps: 0, minutes: 0, goals: 0, assists: 0, cleanSheets: 0, conceded: 0, ratingSum: 0, yellow: 0, red: 0, motm: 0 };
}

export function emptyCareerStats(): CareerStats {
  return { ...emptySeasonStats(), seasons: 0, trophies: 0 };
}

/** CA 를 능력치 평균으로 옮기는 곡선. CA 200 → 16.5, CA 100 → 10.2, CA 40 → 6.4. */
export function caToBase(ca: number): number {
  return 4.2 + (ca / 200) * 12.4;
}

function rollAttributes(rng: Rng, ca: number, role: Role): Attributes {
  const profile = ROLE_PROFILES[role];
  const base = caToBase(ca);
  const keySet = new Set(profile.key);
  const secondSet = new Set(profile.secondary);
  const isKeeper = role === 'GK';
  const attrs = {} as Attributes;

  for (const key of ATTRIBUTE_KEYS) {
    const isGkAttr = GROUP_KEYS.goalkeeping.includes(key);
    const isTechAttr = GROUP_KEYS.technical.includes(key);

    // 포지션과 무관한 그룹은 낮게 깔아 둡니다.
    if (isKeeper && isTechAttr && !GK_USEFUL_TECHNICAL.has(key)) {
      attrs[key] = rng.around(4, 3, 1, 10);
      continue;
    }
    if (!isKeeper && isGkAttr) {
      attrs[key] = rng.around(3, 2.5, 1, 8);
      continue;
    }

    let factor = 0.72;
    if (keySet.has(key)) factor = 1.24;
    else if (secondSet.has(key)) factor = 1.0;
    attrs[key] = rng.around(base * factor, 2.4, 1, 20);
  }

  // 결단력과 타고난 체력은 성격·커리어에 영향을 주므로 바닥을 조금 올립니다.
  attrs.determination = clamp(Math.round(rng.around(base * 0.95, 3.4, 3, 20)), 3, 20);
  attrs.naturalFitness = clamp(Math.round(rng.around(base * 0.9 + 3, 2.6, 5, 20)), 5, 20);
  return attrs;
}

/**
 * 나이대별 CA/PA 관계. 어릴수록 PA 여유가 크게 남습니다.
 *
 * 특급 유망주 꼬리가 중요합니다. 이게 없으면 매 시즌 새로 들어오는 세대의
 * 상한이 기존 세대보다 낮아, 열 시즌쯤 지나면 세계 최고 수준이 통째로
 * 주저앉습니다.
 */
function rollPotential(rng: Rng, ca: number, age: number): number {
  if (age <= 20 && rng.bool(0.025 + (ca / 200) * 0.05)) {
    return clamp(rng.int(165, 200), ca, 200);
  }
  const room = age <= 18 ? rng.float(35, 78)
    : age <= 21 ? rng.float(22, 55)
    : age <= 24 ? rng.float(10, 34)
    : age <= 27 ? rng.float(2, 16)
    : rng.float(0, 5);
  return clamp(Math.round(ca + room), ca, 200);
}

function rollFoot(rng: Rng, role: Role): { left: number; right: number } {
  const leftSided = role === 'DL' || role === 'WBL' || role === 'ML' || role === 'AML';
  const rightSided = role === 'DR' || role === 'WBR' || role === 'MR' || role === 'AMR';
  let leftChance = 0.22;
  if (leftSided) leftChance = 0.72;
  else if (rightSided) leftChance = 0.06;

  const strongIsLeft = rng.bool(leftChance);
  const strong = rng.int(16, 20);
  // 약발은 대부분 어중간합니다. 가끔 양발잡이가 나옵니다.
  const weak = rng.bool(0.12) ? rng.int(15, 19) : rng.int(4, 14);
  return strongIsLeft ? { left: strong, right: weak } : { left: weak, right: strong };
}

function rollPositions(rng: Rng, role: Role): Partial<Record<Role, number>> {
  const positions: Partial<Record<Role, number>> = { [role]: 20 };
  for (const neighbour of ROLE_PROFILES[role].neighbours) {
    if (rng.bool(0.45)) positions[neighbour] = rng.int(8, 17);
  }
  return positions;
}

export interface GeneratePlayerOptions {
  rng: Rng;
  names: NameFactory;
  country: CountryDef;
  role: Role;
  /** 목표 CA. 여기서 약간의 편차를 줍니다. */
  targetCa: number;
  age?: number;
  idPrefix: string;
  index: number;
}

export function generatePlayer(opts: GeneratePlayerOptions): Player {
  const { rng, names, country, role, idPrefix, index } = opts;
  const age = opts.age ?? rollAge(rng);
  // 어린 선수는 아직 CA 가 덜 찼습니다.
  const youthPenalty = age >= 24 ? 1 : 0.62 + (age - 16) * 0.0475;
  const ca = clamp(Math.round(rng.around(opts.targetCa, 9, 20, 200) * youthPenalty), 20, 200);
  const pa = rollPotential(rng, ca, age);
  const attrs = rollAttributes(rng, ca, role);
  const foot = rollFoot(rng, role);
  const profile = ROLE_PROFILES[role];
  const height = Math.round(rng.around(profile.height, 6, 165, 205));
  const nationality = rollNationality(rng, country);

  const player: Player = {
    id: `${idPrefix}${index}`,
    name: names.player(nationality.pool),
    age,
    nationality: nationality.code,
    secondNationality: nationality.second,
    height,
    weight: Math.round(clamp((height - 100) * rng.float(0.86, 1.02), 58, 100)),
    footLeft: foot.left,
    footRight: foot.right,
    attributes: attrs,
    positions: rollPositions(rng, role),
    bestRole: role,
    group: ROLE_GROUP[role],
    ca,
    pa,
    personality: rollPersonality(rng, ca),
    clubId: null,
    contract: null,
    agentId: null,
    morale: rng.int(55, 85),
    form: rng.int(45, 65),
    fitness: rng.int(88, 100),
    injuredWeeks: 0,
    season: emptySeasonStats(),
    compStats: {},
    career: emptyCareerStats(),
    honours: [],
    value: 0,
    scouted: 0,
    retired: false,
  };
  player.value = estimateValue(player);
  return player;
}

/** 리그 소속 선수의 나이 분포. 24-27 이 가장 두껍습니다. */
function rollAge(rng: Rng): number {
  const roll = rng.next();
  if (roll < 0.10) return rng.int(16, 19);
  if (roll < 0.30) return rng.int(20, 23);
  if (roll < 0.66) return rng.int(24, 27);
  if (roll < 0.88) return rng.int(28, 31);
  return rng.int(32, 37);
}

/**
 * 국적. 대부분은 리그가 속한 나라 사람이지만, 리그 수준이 높을수록 외국인
 * 비중이 커집니다. 이름 풀은 실제 국적을 따라갑니다.
 */
function rollNationality(rng: Rng, country: CountryDef): { code: string; pool: keyof typeof NAME_POOLS; second?: string } {
  const foreignChance = clamp((country.reputation - 45) / 100, 0.05, 0.55);
  if (!rng.bool(foreignChance)) {
    const second = rng.bool(0.07) ? pickOtherCode(rng, country.code) : undefined;
    return { code: country.code, pool: country.namePool, second };
  }
  const other = pickForeignCountry(rng, country);
  const second = rng.bool(0.14) ? country.code : undefined;
  return { code: other.code, pool: other.namePool, second };
}

/** 국가 데이터에 정의된 나라 중 하나를 뽑습니다. 리그 활성화 여부와 무관합니다. */
function pickForeignCountry(rng: Rng, exclude: CountryDef): CountryDef {
  const all = Object.values(COUNTRY_BY_ID).filter((c) => c.id !== exclude.id);
  // 축구 인구가 많은 나라에서 더 자주 나옵니다.
  const weights = all.map((c) => (c.continent === 'sam' ? 2.4 : c.continent === 'afr' ? 1.8 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng.next() * total;
  for (let i = 0; i < all.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return all[i];
  }
  return all[all.length - 1];
}

function pickOtherCode(rng: Rng, exclude: string): string {
  const codes = Object.values(COUNTRY_BY_ID).map((c) => c.code).filter((c) => c !== exclude);
  return rng.pick(codes);
}

/** 한 구단의 스쿼드를 통째로 만듭니다. */
export function generateSquad(
  rng: Rng, names: NameFactory, country: CountryDef, clubReputation: number, idPrefix: string,
): Player[] {
  // 구단 명성과 리그 수준이 함께 스쿼드 체급을 정합니다.
  const centre = 22 + country.reputation * 0.72 + clubReputation * 0.62;
  const players: Player[] = [];
  SQUAD_TEMPLATE.forEach((role, i) => {
    // 주전(앞쪽 슬롯)이 조금 더 좋고, 뒤로 갈수록 백업입니다.
    const depthPenalty = i < 11 ? 6 : i < 18 ? -2 : -10;
    // 강팀에는 이따금 리그 평균을 훌쩍 넘는 간판 선수가 있습니다.
    const starBonus = i < 3 && rng.bool(clubReputation / 260) ? rng.float(12, 32) : 0;
    players.push(generatePlayer({
      rng, names, country, role,
      targetCa: clamp(centre + depthPenalty + starBonus, 20, 198),
      idPrefix, index: i,
    }));
  });
  return players;
}

// ── 가치 · 주급 ─────────────────────────────────────────────────────────

/** 나이에 따른 가치 배율. 23-27 이 정점입니다. */
function ageValueFactor(age: number, ca: number, pa: number): number {
  const upside = clamp((pa - ca) / 60, 0, 1);
  if (age <= 18) return 0.85 + upside * 1.35;
  if (age <= 21) return 1.00 + upside * 1.15;
  if (age <= 23) return 1.05 + upside * 0.70;
  if (age <= 27) return 1.0;
  if (age === 28) return 0.86;
  if (age === 29) return 0.74;
  if (age === 30) return 0.60;
  if (age === 31) return 0.47;
  if (age === 32) return 0.36;
  if (age === 33) return 0.26;
  if (age === 34) return 0.18;
  return Math.max(0.05, 0.12 - (age - 35) * 0.03);
}

/**
 * 시장 가치(천 단위). CA 에 대해 급격히 볼록한 곡선이라 상위 1%가 압도적으로
 * 비쌉니다. 실제 이적시장의 모양과 같습니다.
 */
export function estimateValue(player: Player): number {
  if (player.retired) return 0;
  const core = 8700 * Math.pow(player.ca / 100, 4.5);
  const age = ageValueFactor(player.age, player.ca, player.pa);
  const form = 0.92 + (player.form / 100) * 0.16;
  // 계약이 얼마 안 남으면 값이 떨어집니다.
  const contract = player.contract ? 1 : 0.35;
  const value = core * age * form * contract;
  return Math.max(20, Math.round(value / 10) * 10);
}

/** 이 선수가 해당 구단에서 기대하는 주급(천 단위/주). */
export function expectedWage(player: Player, clubReputation: number, country: CountryDef): number {
  const personality = PERSONALITY_BY_ID[player.personality];
  const core = 12 * Math.pow(player.ca / 100, 4);
  const clubFactor = 0.6 + (clubReputation / 100) * 0.85;
  const wage = core * country.wageFactor * clubFactor * personality.wageGreed;
  return Math.max(1, Math.round(wage * 10) / 10);
}
