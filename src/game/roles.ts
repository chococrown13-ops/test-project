import { A, type AttrKey, type Attributes } from './attributes';
import type { Position } from './formations';

/**
 * FM26 splits every player's job in two: an In Possession role and an Out of
 * Possession role. Each role names the attributes that matter for it (used
 * for the star suitability shown in the role picker) and a few behaviour
 * weights the match engine and the 2D/3D shape read.
 */

export type Phase = 'ip' | 'oop';

export interface IpBehaviour {
  /** Share of build-up from the back. */
  build: number;
  /** Carrying/passing the ball through midfield. */
  progress: number;
  /** Making chances. */
  create: number;
  /** Getting on the end of chances. */
  threat: number;
  /** Lateral tendency: -1 tucks inside, +1 hugs the touchline. */
  width: number;
  /** Depth shift of the IP position, as a fraction of the pitch. */
  advance: number;
  /** Tendency to cross rather than pass or dribble. */
  cross: number;
  /** Tendency to take players on. */
  dribble: number;
}

export interface OopBehaviour {
  /** Pressing the ball carrier. */
  press: number;
  /** Shielding the space in front of the back line. */
  screen: number;
  /** Last-line defending. */
  cover: number;
  /** Staying up the pitch as a counter-attack outlet (less defending). */
  outlet: number;
  /** Depth shift of the OOP position. */
  drop: number;
}

export interface Role {
  id: string;
  phase: Phase;
  name: string;
  positions: Position[];
  key: AttrKey[];
  useful: AttrKey[];
  description: string;
  ip?: IpBehaviour;
  oop?: OopBehaviour;
}

const ip = (b: Partial<IpBehaviour>): IpBehaviour => ({
  build: 0,
  progress: 0,
  create: 0,
  threat: 0,
  width: 0,
  advance: 0,
  cross: 0,
  dribble: 0,
  ...b,
});
const oop = (b: Partial<OopBehaviour>): OopBehaviour => ({ press: 0, screen: 0, cover: 0, outlet: 0, drop: 0, ...b });

const FB: Position[] = ['DL', 'DR', 'WBL', 'WBR'];
const WIDE_MID: Position[] = ['ML', 'MR'];
const WINGS: Position[] = ['AML', 'AMR'];

export const ROLES: Role[] = [
  /* ------------------------------------------------------------- IP roles */
  {
    id: 'gk-ip',
    phase: 'ip',
    name: '골키퍼',
    positions: ['GK'],
    key: ['handling', 'reflexes', 'kicking'],
    useful: ['throwing', 'composure'],
    description: '안전하게 공을 처리하고 수비수에게 연결합니다.',
    ip: ip({ build: 0.25 }),
  },
  {
    id: 'bpgk-ip',
    phase: 'ip',
    name: '볼 플레잉 골키퍼',
    positions: ['GK'],
    key: ['passing', 'kicking', 'composure', 'firstTouch'],
    useful: ['vision', 'decisions'],
    description: '빌드업의 첫 단추. 짧은 패스로 압박을 풀어냅니다.',
    ip: ip({ build: 0.6 }),
  },
  {
    id: 'cb-ip',
    phase: 'ip',
    name: '센터백',
    positions: ['DC'],
    key: ['passing', 'composure', 'decisions'],
    useful: ['firstTouch', 'heading'],
    description: '간결하게 공을 돌리며 뒤를 지킵니다.',
    ip: ip({ build: 0.6, progress: 0.1 }),
  },
  {
    id: 'bpcb-ip',
    phase: 'ip',
    name: '볼 플레잉 센터백',
    positions: ['DC'],
    key: ['passing', 'vision', 'composure', 'technique'],
    useful: ['firstTouch', 'decisions'],
    description: '라인 사이로 전진 패스를 찔러 넣습니다.',
    ip: ip({ build: 0.85, progress: 0.35 }),
  },
  {
    id: 'ocb-ip',
    phase: 'ip',
    name: '오버래핑 센터백',
    positions: ['DC'],
    key: ['dribbling', 'stamina', 'passing', 'crossing'],
    useful: ['pace', 'offTheBall'],
    description: '스리백의 측면 센터백이 전진해 측면에 숫자를 더합니다.',
    ip: ip({ build: 0.5, progress: 0.45, create: 0.15, width: 0.5, advance: 0.14, cross: 0.4 }),
  },
  {
    id: 'fb-ip',
    phase: 'ip',
    name: '풀백',
    positions: FB,
    key: ['passing', 'crossing', 'stamina'],
    useful: ['decisions', 'teamwork'],
    description: '측면에서 빌드업을 돕고 적절히 오버래핑합니다.',
    ip: ip({ build: 0.45, progress: 0.3, create: 0.2, width: 0.8, advance: 0.08, cross: 0.5 }),
  },
  {
    id: 'ifb-ip',
    phase: 'ip',
    name: '인사이드 풀백',
    positions: ['DL', 'DR'],
    key: ['passing', 'composure', 'decisions', 'firstTouch'],
    useful: ['vision', 'positioning'],
    description: '공을 가지면 중앙으로 좁혀 들어와 미드필더처럼 뜁니다.',
    ip: ip({ build: 0.7, progress: 0.4, create: 0.1, width: -0.7, advance: 0.12 }),
  },
  {
    id: 'wb-ip',
    phase: 'ip',
    name: '윙백',
    positions: FB,
    key: ['crossing', 'stamina', 'pace', 'offTheBall'],
    useful: ['dribbling', 'workRate'],
    description: '터치라인을 타고 높이 올라가 크로스를 올립니다.',
    ip: ip({ build: 0.2, progress: 0.45, create: 0.4, threat: 0.05, width: 1, advance: 0.26, cross: 0.85, dribble: 0.3 }),
  },
  {
    id: 'dm-ip',
    phase: 'ip',
    name: '수비형 미드필더',
    positions: ['DM'],
    key: ['passing', 'decisions', 'positioning'],
    useful: ['composure', 'teamwork'],
    description: '수비 앞에서 공을 받아 간결하게 연결합니다.',
    ip: ip({ build: 0.75, progress: 0.4 }),
  },
  {
    id: 'dlp-ip',
    phase: 'ip',
    name: '딥라잉 플레이메이커',
    positions: ['DM', 'MC'],
    key: ['passing', 'vision', 'technique', 'composure'],
    useful: ['decisions', 'firstTouch'],
    description: '깊은 곳에서 경기를 조율하며 긴 패스를 뿌립니다.',
    ip: ip({ build: 0.9, progress: 0.7, create: 0.3, advance: -0.03 }),
  },
  {
    id: 'hb-ip',
    phase: 'ip',
    name: '하프백',
    positions: ['DM'],
    key: ['passing', 'positioning', 'composure', 'decisions'],
    useful: ['tackling', 'teamwork'],
    description: '센터백 사이로 내려가 스리백을 만들어 줍니다.',
    ip: ip({ build: 0.95, progress: 0.3, advance: -0.12 }),
  },
  {
    id: 'cm-ip',
    phase: 'ip',
    name: '센트럴 미드필더',
    positions: ['MC'],
    key: ['passing', 'decisions', 'teamwork'],
    useful: ['firstTouch', 'vision'],
    description: '공수 연결 고리. 무리하지 않고 템포를 이어갑니다.',
    ip: ip({ build: 0.5, progress: 0.6, create: 0.3, threat: 0.15, advance: 0.04 }),
  },
  {
    id: 'b2b-ip',
    phase: 'ip',
    name: '박스 투 박스 미드필더',
    positions: ['MC'],
    key: ['stamina', 'workRate', 'passing', 'offTheBall'],
    useful: ['longShots', 'finishing'],
    description: '양쪽 박스를 오가며 공격에 가담합니다.',
    ip: ip({ build: 0.3, progress: 0.6, create: 0.3, threat: 0.4, advance: 0.12, dribble: 0.3 }),
  },
  {
    id: 'mp-ip',
    phase: 'ip',
    name: '미드필드 플레이메이커',
    positions: ['MC', 'AMC'],
    key: ['passing', 'vision', 'technique', 'decisions'],
    useful: ['flair', 'firstTouch'],
    description: '공을 많이 만지며 결정적인 패스를 노립니다.',
    ip: ip({ build: 0.45, progress: 0.8, create: 0.75, threat: 0.1, advance: 0.06 }),
  },
  {
    id: 'chm-ip',
    phase: 'ip',
    name: '채널 미드필더',
    positions: ['MC'],
    key: ['offTheBall', 'stamina', 'passing', 'dribbling'],
    useful: ['finishing', 'acceleration'],
    description: '하프스페이스로 침투해 측면과 연계합니다.',
    ip: ip({ progress: 0.55, create: 0.45, threat: 0.35, width: 0.4, advance: 0.15, dribble: 0.3 }),
  },
  {
    id: 'wm-ip',
    phase: 'ip',
    name: '와이드 미드필더',
    positions: WIDE_MID,
    key: ['crossing', 'passing', 'workRate'],
    useful: ['stamina', 'teamwork'],
    description: '측면 폭을 지키며 크로스와 연계를 섞습니다.',
    ip: ip({ progress: 0.45, create: 0.45, threat: 0.15, width: 0.9, advance: 0.05, cross: 0.6, dribble: 0.2 }),
  },
  {
    id: 'wp-ip',
    phase: 'ip',
    name: '와이드 플레이메이커',
    positions: [...WIDE_MID, ...WINGS],
    key: ['passing', 'vision', 'technique', 'firstTouch'],
    useful: ['decisions', 'flair'],
    description: '측면에서 안으로 좁혀 들어와 경기를 만듭니다.',
    ip: ip({ progress: 0.6, create: 0.7, threat: 0.1, width: -0.3, advance: 0.05, dribble: 0.2 }),
  },
  {
    id: 'w-ip',
    phase: 'ip',
    name: '윙어',
    positions: [...WIDE_MID, ...WINGS],
    key: ['crossing', 'dribbling', 'pace', 'acceleration'],
    useful: ['technique', 'flair'],
    description: '측면을 돌파해 엔드라인 근처에서 크로스를 올립니다.',
    ip: ip({ progress: 0.4, create: 0.6, threat: 0.25, width: 1, advance: 0.1, cross: 0.85, dribble: 0.7 }),
  },
  {
    id: 'if-ip',
    phase: 'ip',
    name: '인사이드 포워드',
    positions: WINGS,
    key: ['dribbling', 'finishing', 'offTheBall', 'acceleration'],
    useful: ['composure', 'technique'],
    description: '측면에서 안으로 파고들어 직접 슈팅합니다.',
    ip: ip({ progress: 0.35, create: 0.35, threat: 0.75, width: -0.4, advance: 0.12, dribble: 0.75 }),
  },
  {
    id: 'iw-ip',
    phase: 'ip',
    name: '인버티드 윙어',
    positions: [...WIDE_MID, ...WINGS],
    key: ['dribbling', 'passing', 'technique', 'vision'],
    useful: ['flair', 'longShots'],
    description: '반대발로 안쪽을 파고들어 패스와 슛을 섞습니다.',
    ip: ip({ progress: 0.5, create: 0.6, threat: 0.45, width: -0.1, advance: 0.08, dribble: 0.6 }),
  },
  {
    id: 'am-ip',
    phase: 'ip',
    name: '공격형 미드필더',
    positions: ['AMC'],
    key: ['passing', 'vision', 'technique', 'offTheBall'],
    useful: ['longShots', 'decisions'],
    description: '라인 사이에서 공을 받아 마지막 패스를 넣습니다.',
    ip: ip({ progress: 0.5, create: 0.75, threat: 0.4, advance: 0.04, dribble: 0.3 }),
  },
  {
    id: 'fr-ip',
    phase: 'ip',
    name: '프리롤',
    positions: ['AMC', 'AML', 'AMR'],
    key: ['flair', 'vision', 'technique', 'dribbling'],
    useful: ['passing', 'offTheBall'],
    description: '정해진 자리 없이 공이 있는 곳을 찾아다닙니다.',
    ip: ip({ progress: 0.65, create: 0.85, threat: 0.45, width: -0.2, advance: 0.03, dribble: 0.55 }),
  },
  {
    id: 'ss-ip',
    phase: 'ip',
    name: '섀도 스트라이커',
    positions: ['AMC'],
    key: ['offTheBall', 'finishing', 'anticipation', 'composure'],
    useful: ['dribbling', 'acceleration'],
    description: '스트라이커 뒤에서 박스 안으로 늦게 침투합니다.',
    ip: ip({ progress: 0.25, create: 0.35, threat: 0.8, advance: 0.14, dribble: 0.3 }),
  },
  {
    id: 'p-ip',
    phase: 'ip',
    name: '포처',
    positions: ['ST'],
    key: ['finishing', 'offTheBall', 'anticipation', 'composure'],
    useful: ['acceleration', 'firstTouch'],
    description: '최전방에서 수비 뒷공간과 박스 안만 노립니다.',
    ip: ip({ threat: 1, advance: 0.05 }),
  },
  {
    id: 'cf-ip',
    phase: 'ip',
    name: '채널 포워드',
    positions: ['ST'],
    key: ['offTheBall', 'pace', 'finishing', 'workRate'],
    useful: ['dribbling', 'stamina'],
    description: '센터백과 풀백 사이 채널로 뛰어 들어갑니다.',
    ip: ip({ progress: 0.2, create: 0.3, threat: 0.8, width: 0.3, advance: 0.04, dribble: 0.4 }),
  },
  {
    id: 'dlf-ip',
    phase: 'ip',
    name: '딥라잉 포워드',
    positions: ['ST'],
    key: ['firstTouch', 'passing', 'composure', 'strength'],
    useful: ['vision', 'finishing'],
    description: '내려와 공을 지켜내고 2선의 침투를 살려줍니다.',
    ip: ip({ progress: 0.45, create: 0.55, threat: 0.5, advance: -0.06 }),
  },
  {
    id: 'f9-ip',
    phase: 'ip',
    name: '폴스 나인',
    positions: ['ST'],
    key: ['vision', 'passing', 'technique', 'dribbling'],
    useful: ['flair', 'offTheBall'],
    description: '미드필드로 내려와 수비를 끌어내고 공간을 엽니다.',
    ip: ip({ progress: 0.65, create: 0.75, threat: 0.35, advance: -0.13, dribble: 0.5 }),
  },
  {
    id: 'tf-ip',
    phase: 'ip',
    name: '타겟 포워드',
    positions: ['ST'],
    key: ['heading', 'strength', 'jumping', 'bravery'],
    useful: ['finishing', 'firstTouch'],
    description: '공중볼을 따내고 크로스를 마무리합니다.',
    ip: ip({ progress: 0.2, create: 0.2, threat: 0.85, advance: 0.04 }),
  },

  /* ------------------------------------------------------------ OOP roles */
  {
    id: 'lhgk-oop',
    phase: 'oop',
    name: '라인 유지 골키퍼',
    positions: ['GK'],
    key: ['reflexes', 'handling', 'positioning'],
    useful: ['aerialReach', 'commandOfArea'],
    description: '골문을 지키며 선방에 집중합니다.',
    oop: oop({ cover: 1 }),
  },
  {
    id: 'skgk-oop',
    phase: 'oop',
    name: '스위퍼 키퍼',
    positions: ['GK'],
    key: ['rushingOut', 'oneOnOnes', 'anticipation', 'acceleration'],
    useful: ['reflexes', 'composure'],
    description: '높은 라인 뒤 공간을 미리 나와서 정리합니다.',
    oop: oop({ cover: 1, press: 0.1 }),
  },
  {
    id: 'ccb-oop',
    phase: 'oop',
    name: '커버링 센터백',
    positions: ['DC'],
    key: ['positioning', 'anticipation', 'pace', 'concentration'],
    useful: ['marking', 'tackling'],
    description: '깊게 서서 뒷공간과 침투를 커버합니다.',
    oop: oop({ cover: 1, drop: -0.04 }),
  },
  {
    id: 'scb-oop',
    phase: 'oop',
    name: '스토핑 센터백',
    positions: ['DC'],
    key: ['tackling', 'aggression', 'heading', 'strength'],
    useful: ['anticipation', 'bravery'],
    description: '공을 받으러 내려오는 공격수에게 먼저 달려듭니다.',
    oop: oop({ cover: 0.85, press: 0.3, screen: 0.2, drop: 0.03 }),
  },
  {
    id: 'hfb-oop',
    phase: 'oop',
    name: '홀딩 풀백',
    positions: FB,
    key: ['positioning', 'marking', 'tackling', 'concentration'],
    useful: ['anticipation', 'teamwork'],
    description: '수비 라인에 머물며 측면을 막습니다.',
    oop: oop({ cover: 0.9, drop: -0.02 }),
  },
  {
    id: 'pfb-oop',
    phase: 'oop',
    name: '프레싱 풀백',
    positions: FB,
    key: ['tackling', 'workRate', 'acceleration', 'aggression'],
    useful: ['stamina', 'anticipation'],
    description: '상대 윙어에게 높게 붙어 공을 빼앗습니다.',
    oop: oop({ cover: 0.65, press: 0.6, drop: 0.05 }),
  },
  {
    id: 'sdm-oop',
    phase: 'oop',
    name: '스크리닝 수비형 미드필더',
    positions: ['DM'],
    key: ['positioning', 'anticipation', 'concentration', 'teamwork'],
    useful: ['tackling', 'marking'],
    description: '수비 라인 앞 공간을 지키며 패스 길을 막습니다.',
    oop: oop({ screen: 1, cover: 0.3 }),
  },
  {
    id: 'pdm-oop',
    phase: 'oop',
    name: '프레싱 수비형 미드필더',
    positions: ['DM'],
    key: ['tackling', 'workRate', 'aggression', 'stamina'],
    useful: ['anticipation', 'teamwork'],
    description: '공을 가진 상대 미드필더에게 적극적으로 달려듭니다.',
    oop: oop({ screen: 0.6, press: 0.7, drop: 0.04 }),
  },
  {
    id: 'scm-oop',
    phase: 'oop',
    name: '스크리닝 센트럴 미드필더',
    positions: ['MC'],
    key: ['positioning', 'teamwork', 'concentration', 'anticipation'],
    useful: ['tackling', 'workRate'],
    description: '중원 블록을 유지하며 중앙을 걸어 잠급니다.',
    oop: oop({ screen: 0.9, cover: 0.15 }),
  },
  {
    id: 'pcm-oop',
    phase: 'oop',
    name: '프레싱 센트럴 미드필더',
    positions: ['MC'],
    key: ['workRate', 'stamina', 'tackling', 'aggression'],
    useful: ['teamwork', 'acceleration'],
    description: '앞으로 튀어나가 압박의 방아쇠를 당깁니다.',
    oop: oop({ screen: 0.5, press: 0.8, drop: 0.06 }),
  },
  {
    id: 'wccm-oop',
    phase: 'oop',
    name: '와이드 커버링 미드필더',
    positions: ['MC'],
    key: ['workRate', 'stamina', 'positioning', 'teamwork'],
    useful: ['tackling', 'pace'],
    description: '측면 쪽으로 넓게 움직이며 풀백을 돕습니다.',
    oop: oop({ screen: 0.7, cover: 0.25, press: 0.2 }),
  },
  {
    id: 'twm-oop',
    phase: 'oop',
    name: '트래킹 와이드 미드필더',
    positions: WIDE_MID,
    key: ['workRate', 'stamina', 'teamwork', 'tackling'],
    useful: ['positioning', 'pace'],
    description: '상대 풀백의 오버래핑을 끝까지 따라갑니다.',
    oop: oop({ screen: 0.55, cover: 0.35, press: 0.3, drop: -0.04 }),
  },
  {
    id: 'hwm-oop',
    phase: 'oop',
    name: '홀딩 와이드 미드필더',
    positions: WIDE_MID,
    key: ['positioning', 'teamwork', 'concentration'],
    useful: ['workRate', 'tackling'],
    description: '두 줄 블록의 측면을 지키며 자리를 비우지 않습니다.',
    oop: oop({ screen: 0.65, cover: 0.2 }),
  },
  {
    id: 'tam-oop',
    phase: 'oop',
    name: '트래킹 공격형 미드필더',
    positions: ['AMC'],
    key: ['workRate', 'teamwork', 'stamina'],
    useful: ['tackling', 'positioning'],
    description: '상대 수비형 미드필더를 마크하며 내려옵니다.',
    oop: oop({ screen: 0.55, press: 0.45, drop: -0.04 }),
  },
  {
    id: 'coam-oop',
    phase: 'oop',
    name: '센트럴 아웃렛 공격형 미드필더',
    positions: ['AMC'],
    key: ['anticipation', 'offTheBall', 'acceleration'],
    useful: ['firstTouch', 'decisions'],
    description: '높은 위치에 남아 역습의 출구가 됩니다.',
    oop: oop({ press: 0.25, outlet: 0.8, drop: 0.04 }),
  },
  {
    id: 'tw-oop',
    phase: 'oop',
    name: '트래킹 윙어',
    positions: [...WINGS, ...WIDE_MID],
    key: ['workRate', 'stamina', 'teamwork'],
    useful: ['tackling', 'pace'],
    description: '수비 시 측면 미드필드 라인까지 내려옵니다.',
    oop: oop({ screen: 0.5, cover: 0.25, press: 0.35, drop: -0.12 }),
  },
  {
    id: 'wow-oop',
    phase: 'oop',
    name: '와이드 아웃렛 윙어',
    positions: WINGS,
    key: ['pace', 'acceleration', 'anticipation'],
    useful: ['offTheBall', 'dribbling'],
    description: '측면 높은 곳에 남아 역습 시 바로 달립니다.',
    oop: oop({ press: 0.2, outlet: 0.9, drop: 0.02 }),
  },
  {
    id: 'iow-oop',
    phase: 'oop',
    name: '인사이드 아웃렛 윙어',
    positions: WINGS,
    key: ['anticipation', 'offTheBall', 'acceleration'],
    useful: ['pace', 'firstTouch'],
    description: '안쪽 하프스페이스에 남아 역습 패스를 기다립니다.',
    oop: oop({ press: 0.3, outlet: 0.75, screen: 0.1 }),
  },
  {
    id: 'cocf-oop',
    phase: 'oop',
    name: '센트럴 아웃렛 센터포워드',
    positions: ['ST'],
    key: ['anticipation', 'offTheBall', 'strength'],
    useful: ['pace', 'firstTouch'],
    description: '최전방에 남아 상대 센터백을 묶어 둡니다.',
    oop: oop({ press: 0.15, outlet: 1, drop: 0.03 }),
  },
  {
    id: 'socf-oop',
    phase: 'oop',
    name: '스플리팅 아웃렛 센터포워드',
    positions: ['ST'],
    key: ['pace', 'anticipation', 'acceleration'],
    useful: ['offTheBall', 'workRate'],
    description: '센터백과 풀백 사이에 서서 역습 각을 만듭니다.',
    oop: oop({ press: 0.25, outlet: 0.9 }),
  },
  {
    id: 'tcf-oop',
    phase: 'oop',
    name: '트래킹 센터포워드',
    positions: ['ST'],
    key: ['workRate', 'stamina', 'aggression', 'teamwork'],
    useful: ['acceleration', 'anticipation'],
    description: '최전방 압박의 선봉. 상대 빌드업을 괴롭힙니다.',
    oop: oop({ press: 0.9, screen: 0.2, outlet: 0.25 }),
  },
];

export const ROLE_BY_ID: Record<string, Role> = Object.fromEntries(ROLES.map((role) => [role.id, role]));

/** Roles the picker offers for a slot position in a phase. */
export function rolesFor(pos: Position, phase: Phase): Role[] {
  const list = ROLES.filter((role) => role.phase === phase && role.positions.includes(pos));
  if (list.length > 0) return list;
  // WBL/WBR without bespoke roles fall back to the full-back set and so on.
  return ROLES.filter((role) => role.phase === phase && role.positions.some((p) => p[0] === pos[0]));
}

const DEFAULT_IP: Partial<Record<Position, string>> = {
  GK: 'gk-ip',
  DL: 'fb-ip',
  DR: 'fb-ip',
  DC: 'cb-ip',
  WBL: 'wb-ip',
  WBR: 'wb-ip',
  DM: 'dm-ip',
  MC: 'cm-ip',
  ML: 'wm-ip',
  MR: 'wm-ip',
  AML: 'w-ip',
  AMR: 'if-ip',
  AMC: 'am-ip',
  ST: 'cf-ip',
};

const DEFAULT_OOP: Partial<Record<Position, string>> = {
  GK: 'lhgk-oop',
  DL: 'hfb-oop',
  DR: 'hfb-oop',
  DC: 'ccb-oop',
  WBL: 'pfb-oop',
  WBR: 'pfb-oop',
  DM: 'sdm-oop',
  MC: 'scm-oop',
  ML: 'twm-oop',
  MR: 'twm-oop',
  AML: 'tw-oop',
  AMR: 'tw-oop',
  AMC: 'tam-oop',
  ST: 'tcf-oop',
};

export function defaultRole(pos: Position, phase: Phase): string {
  const id = (phase === 'ip' ? DEFAULT_IP : DEFAULT_OOP)[pos];
  return id ?? rolesFor(pos, phase)[0].id;
}

/** 1-20 suitability of a player for a role, from its key (x2) and useful (x1) attributes. */
export function roleScore(attrs: Attributes, role: Role): number {
  let sum = 0;
  let weight = 0;
  role.key.forEach((key) => {
    sum += attrs[A[key]] * 2;
    weight += 2;
  });
  role.useful.forEach((key) => {
    sum += attrs[A[key]];
    weight += 1;
  });
  return weight > 0 ? sum / weight : 10;
}

/** Stars (0.5-5) for the role picker, relative to the given reference level. */
export function roleStars(score: number): number {
  return Math.max(0.5, Math.min(5, Math.round(((score - 5) / 2.6) * 2) / 2));
}
