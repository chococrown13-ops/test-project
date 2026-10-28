/**
 * Player attributes on Football Manager's 1-20 scale. They are stored as a
 * flat number array (index = position in ATTRS) — compact in the save and
 * cheap to read in the match engine. Use `A.finishing` etc. to index.
 */

export const ATTRS = [
  // Technical
  'corners',
  'crossing',
  'dribbling',
  'finishing',
  'firstTouch',
  'freeKick',
  'heading',
  'longShots',
  'longThrows',
  'marking',
  'passing',
  'penalty',
  'tackling',
  'technique',
  // Mental
  'aggression',
  'anticipation',
  'bravery',
  'composure',
  'concentration',
  'decisions',
  'determination',
  'flair',
  'leadership',
  'offTheBall',
  'positioning',
  'teamwork',
  'vision',
  'workRate',
  // Physical
  'acceleration',
  'agility',
  'balance',
  'jumping',
  'naturalFitness',
  'pace',
  'stamina',
  'strength',
  // Goalkeeping
  'aerialReach',
  'commandOfArea',
  'communication',
  'eccentricity',
  'handling',
  'kicking',
  'oneOnOnes',
  'punching',
  'reflexes',
  'rushingOut',
  'throwing',
] as const;

export type AttrKey = (typeof ATTRS)[number];
export type Attributes = number[];

export const A = Object.fromEntries(ATTRS.map((key, index) => [key, index])) as Record<AttrKey, number>;

export const ATTR_LABEL: Record<AttrKey, string> = {
  corners: '코너킥',
  crossing: '크로스',
  dribbling: '드리블',
  finishing: '골 결정력',
  firstTouch: '퍼스트 터치',
  freeKick: '프리킥',
  heading: '헤더',
  longShots: '중거리 슛',
  longThrows: '롱 스로인',
  marking: '대인 마크',
  passing: '패스',
  penalty: '페널티킥',
  tackling: '태클',
  technique: '테크닉',
  aggression: '적극성',
  anticipation: '예측력',
  bravery: '용감성',
  composure: '침착성',
  concentration: '집중력',
  decisions: '판단력',
  determination: '투지',
  flair: '창의성',
  leadership: '리더십',
  offTheBall: '오프 더 볼',
  positioning: '위치 선정',
  teamwork: '팀워크',
  vision: '시야',
  workRate: '활동량',
  acceleration: '가속력',
  agility: '민첩성',
  balance: '밸런스',
  jumping: '점프',
  naturalFitness: '기초 체력',
  pace: '스피드',
  stamina: '지구력',
  strength: '몸싸움',
  aerialReach: '공중볼 처리',
  commandOfArea: '페널티 지역 장악',
  communication: '의사소통',
  eccentricity: '돌발성',
  handling: '핸들링',
  kicking: '킥',
  oneOnOnes: '1대1',
  punching: '펀칭',
  reflexes: '반사신경',
  rushingOut: '전진 수비',
  throwing: '스로잉',
};

export const TECHNICAL: AttrKey[] = [
  'corners',
  'crossing',
  'dribbling',
  'finishing',
  'firstTouch',
  'freeKick',
  'heading',
  'longShots',
  'longThrows',
  'marking',
  'passing',
  'penalty',
  'tackling',
  'technique',
];
export const MENTAL: AttrKey[] = [
  'aggression',
  'anticipation',
  'bravery',
  'composure',
  'concentration',
  'decisions',
  'determination',
  'flair',
  'leadership',
  'offTheBall',
  'positioning',
  'teamwork',
  'vision',
  'workRate',
];
export const PHYSICAL: AttrKey[] = [
  'acceleration',
  'agility',
  'balance',
  'jumping',
  'naturalFitness',
  'pace',
  'stamina',
  'strength',
];
export const GOALKEEPING: AttrKey[] = [
  'aerialReach',
  'commandOfArea',
  'communication',
  'eccentricity',
  'handling',
  'kicking',
  'oneOnOnes',
  'punching',
  'reflexes',
  'rushingOut',
  'throwing',
];

/** Hidden personality, also 1-20. Never shown directly; it surfaces as a personality label. */
export const HIDDEN = [
  'professionalism',
  'ambition',
  'loyalty',
  'pressure',
  'temperament',
  'consistency',
  'injuryProneness',
  'importantMatches',
  'adaptability',
  'versatility',
] as const;
export type HiddenKey = (typeof HIDDEN)[number];
export const H = Object.fromEntries(HIDDEN.map((key, index) => [key, index])) as Record<HiddenKey, number>;

/** Training groups, used for individual focus and development weighting. */
export type AttrGroup = 'attacking' | 'creative' | 'defending' | 'physical' | 'mental' | 'goalkeeping' | 'setpieces';

export const GROUP_ATTRS: Record<AttrGroup, AttrKey[]> = {
  attacking: ['finishing', 'offTheBall', 'composure', 'longShots', 'heading', 'firstTouch'],
  creative: ['passing', 'vision', 'technique', 'dribbling', 'flair', 'crossing', 'firstTouch'],
  defending: ['tackling', 'marking', 'positioning', 'anticipation', 'concentration', 'heading'],
  physical: ['acceleration', 'agility', 'balance', 'jumping', 'pace', 'stamina', 'strength'],
  mental: ['decisions', 'teamwork', 'workRate', 'determination', 'leadership', 'bravery', 'aggression'],
  goalkeeping: [
    'aerialReach',
    'commandOfArea',
    'communication',
    'handling',
    'kicking',
    'oneOnOnes',
    'punching',
    'reflexes',
    'rushingOut',
    'throwing',
  ],
  setpieces: ['corners', 'freeKick', 'penalty', 'longThrows', 'crossing'],
};

export const GROUP_LABEL: Record<AttrGroup, string> = {
  attacking: '공격',
  creative: '창조',
  defending: '수비',
  physical: '피지컬',
  mental: '멘탈',
  goalkeeping: '골키핑',
  setpieces: '세트피스',
};

/** FM's colour bands for a 1-20 value. */
export function attrTone(value: number): 'elite' | 'good' | 'ok' | 'poor' {
  if (value >= 16) return 'elite';
  if (value >= 12) return 'good';
  if (value >= 8) return 'ok';
  return 'poor';
}
