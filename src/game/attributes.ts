/**
 * 풋볼 매니저식 능력치 체계.
 *
 * 능력치는 모두 1-20 척도이며 기술 / 골키핑 / 정신 / 신체 네 그룹으로 나뉩니다.
 * 필드 플레이어는 기술 그룹을, 골키퍼는 골키핑 그룹을 보고, 정신·신체는 공통입니다.
 *
 * ATTRIBUTE_DEFS 의 **순서는 세이브 포맷의 일부**입니다. 항목을 중간에 끼워
 * 넣으면 기존 세이브가 어긋나므로, 새 능력치는 반드시 맨 뒤에 추가하고
 * save.ts 의 SAVE_VERSION 을 올려 주세요.
 */

export type AttributeGroup = 'technical' | 'goalkeeping' | 'mental' | 'physical';

export const ATTRIBUTE_GROUP_LABELS: Record<AttributeGroup, string> = {
  technical: '기술',
  goalkeeping: '골키핑',
  mental: '정신',
  physical: '신체',
};

export const ATTRIBUTE_DEFS = [
  // 기술 (필드 플레이어)
  { key: 'corners', label: '코너킥', short: '코너', group: 'technical' },
  { key: 'crossing', label: '크로스', short: '크로스', group: 'technical' },
  { key: 'dribbling', label: '드리블', short: '드리블', group: 'technical' },
  { key: 'finishing', label: '마무리', short: '마무리', group: 'technical' },
  { key: 'firstTouch', label: '퍼스트 터치', short: '터치', group: 'technical' },
  { key: 'freeKicks', label: '프리킥', short: '프리킥', group: 'technical' },
  { key: 'heading', label: '헤딩', short: '헤딩', group: 'technical' },
  { key: 'longShots', label: '중거리 슛', short: '중거리', group: 'technical' },
  { key: 'longThrows', label: '롱 스로인', short: '스로인', group: 'technical' },
  { key: 'marking', label: '대인 방어', short: '마킹', group: 'technical' },
  { key: 'passing', label: '패스', short: '패스', group: 'technical' },
  { key: 'penaltyTaking', label: '페널티킥', short: 'PK', group: 'technical' },
  { key: 'tackling', label: '태클', short: '태클', group: 'technical' },
  { key: 'technique', label: '테크닉', short: '기교', group: 'technical' },

  // 골키핑
  { key: 'aerialReach', label: '공중볼 장악', short: '공중볼', group: 'goalkeeping' },
  { key: 'commandOfArea', label: '지역 장악', short: '장악', group: 'goalkeeping' },
  { key: 'communication', label: '의사소통', short: '소통', group: 'goalkeeping' },
  { key: 'eccentricity', label: '돌발성', short: '돌발', group: 'goalkeeping' },
  { key: 'handling', label: '핸들링', short: '핸들링', group: 'goalkeeping' },
  { key: 'kicking', label: '킥', short: '킥', group: 'goalkeeping' },
  { key: 'oneOnOnes', label: '일대일 방어', short: '일대일', group: 'goalkeeping' },
  { key: 'reflexes', label: '반사신경', short: '반사', group: 'goalkeeping' },
  { key: 'rushingOut', label: '뛰쳐나가기', short: '돌진', group: 'goalkeeping' },
  { key: 'punchingTendency', label: '펀칭 성향', short: '펀칭', group: 'goalkeeping' },
  { key: 'throwing', label: '던지기', short: '던지기', group: 'goalkeeping' },

  // 정신
  { key: 'aggression', label: '적극성', short: '적극성', group: 'mental' },
  { key: 'anticipation', label: '예측력', short: '예측', group: 'mental' },
  { key: 'bravery', label: '대담성', short: '대담성', group: 'mental' },
  { key: 'composure', label: '침착성', short: '침착', group: 'mental' },
  { key: 'concentration', label: '집중력', short: '집중', group: 'mental' },
  { key: 'decisions', label: '판단력', short: '판단', group: 'mental' },
  { key: 'determination', label: '결단력', short: '결단', group: 'mental' },
  { key: 'flair', label: '창조성', short: '창조성', group: 'mental' },
  { key: 'leadership', label: '리더십', short: '리더십', group: 'mental' },
  { key: 'offTheBall', label: '오프 더 볼', short: '오프볼', group: 'mental' },
  { key: 'positioning', label: '위치 선정', short: '위치', group: 'mental' },
  { key: 'teamwork', label: '팀워크', short: '팀워크', group: 'mental' },
  { key: 'vision', label: '시야', short: '시야', group: 'mental' },
  { key: 'workRate', label: '활동량', short: '활동량', group: 'mental' },

  // 신체
  { key: 'acceleration', label: '가속도', short: '가속', group: 'physical' },
  { key: 'agility', label: '민첩성', short: '민첩', group: 'physical' },
  { key: 'balance', label: '균형 감각', short: '균형', group: 'physical' },
  { key: 'jumpingReach', label: '점프', short: '점프', group: 'physical' },
  { key: 'naturalFitness', label: '타고난 체력', short: '체력', group: 'physical' },
  { key: 'pace', label: '스피드', short: '속도', group: 'physical' },
  { key: 'stamina', label: '지구력', short: '지구력', group: 'physical' },
  { key: 'strength', label: '몸싸움', short: '몸싸움', group: 'physical' },
] as const;

export type AttributeKey = (typeof ATTRIBUTE_DEFS)[number]['key'];
export type Attributes = Record<AttributeKey, number>;

/** 세이브 포맷이 의존하는 고정 순서. */
export const ATTRIBUTE_KEYS = ATTRIBUTE_DEFS.map((d) => d.key) as AttributeKey[];

export const ATTRIBUTE_BY_KEY = Object.fromEntries(
  ATTRIBUTE_DEFS.map((d) => [d.key, d]),
) as Record<AttributeKey, (typeof ATTRIBUTE_DEFS)[number]>;

export const GROUP_KEYS: Record<AttributeGroup, AttributeKey[]> = {
  technical: ATTRIBUTE_DEFS.filter((d) => d.group === 'technical').map((d) => d.key),
  goalkeeping: ATTRIBUTE_DEFS.filter((d) => d.group === 'goalkeeping').map((d) => d.key),
  mental: ATTRIBUTE_DEFS.filter((d) => d.group === 'mental').map((d) => d.key),
  physical: ATTRIBUTE_DEFS.filter((d) => d.group === 'physical').map((d) => d.key),
};

/** 선수 상세 화면에서 보여줄 그룹 순서. 골키퍼는 technical 대신 goalkeeping. */
export function visibleGroups(isKeeper: boolean): AttributeGroup[] {
  return isKeeper ? ['goalkeeping', 'mental', 'physical'] : ['technical', 'mental', 'physical'];
}

export function emptyAttributes(fill = 1): Attributes {
  const out = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) out[key] = fill;
  return out;
}

// ── 포지션 ──────────────────────────────────────────────────────────────

export type Role =
  | 'GK'
  | 'DR' | 'DC' | 'DL'
  | 'WBR' | 'WBL'
  | 'DM'
  | 'MR' | 'MC' | 'ML'
  | 'AMR' | 'AMC' | 'AML'
  | 'ST';

export const ROLES: Role[] = ['GK', 'DR', 'DC', 'DL', 'WBR', 'WBL', 'DM', 'MR', 'MC', 'ML', 'AMR', 'AMC', 'AML', 'ST'];

export const ROLE_LABELS: Record<Role, string> = {
  GK: '골키퍼',
  DR: '오른쪽 수비수', DC: '중앙 수비수', DL: '왼쪽 수비수',
  WBR: '오른쪽 윙백', WBL: '왼쪽 윙백',
  DM: '수비형 미드필더',
  MR: '오른쪽 미드필더', MC: '중앙 미드필더', ML: '왼쪽 미드필더',
  AMR: '오른쪽 공격형 미드필더', AMC: '중앙 공격형 미드필더', AML: '왼쪽 공격형 미드필더',
  ST: '스트라이커',
};

export type PositionGroup = 'GK' | 'DF' | 'MF' | 'FW';

export const ROLE_GROUP: Record<Role, PositionGroup> = {
  GK: 'GK',
  DR: 'DF', DC: 'DF', DL: 'DF', WBR: 'DF', WBL: 'DF',
  DM: 'MF', MR: 'MF', MC: 'MF', ML: 'MF',
  AMR: 'FW', AMC: 'FW', AML: 'FW', ST: 'FW',
};

export const POSITION_GROUP_LABELS: Record<PositionGroup, string> = {
  GK: '골키퍼', DF: '수비수', MF: '미드필더', FW: '공격수',
};

/** 포지션 숙련도. 1-20 값을 FM 식 표현으로 옮깁니다. */
export function familiarityLabel(rating: number): string {
  if (rating >= 20) return '자연스러움';
  if (rating >= 15) return '능숙함';
  if (rating >= 10) return '무난함';
  if (rating >= 5) return '미숙함';
  return '어색함';
}

// ── 주발 ────────────────────────────────────────────────────────────────

export type Foot = 'left' | 'right' | 'both';

export const FOOT_LABELS: Record<Foot, string> = {
  left: '왼발', right: '오른발', both: '양발',
};

/**
 * 왼발/오른발 능력치(1-20)에서 주발을 판정합니다. 두 발 모두 15 이상이면
 * 양발잡이로 봅니다.
 */
export function preferredFoot(left: number, right: number): Foot {
  if (left >= 15 && right >= 15) return 'both';
  return left > right ? 'left' : 'right';
}

/** 능력치 색상 구간 — 상세 화면에서 한눈에 강점을 보게 합니다. */
export function attributeTone(value: number): 'poor' | 'ok' | 'good' | 'great' {
  if (value >= 16) return 'great';
  if (value >= 13) return 'good';
  if (value >= 9) return 'ok';
  return 'poor';
}
