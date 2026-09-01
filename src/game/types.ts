import type { Attributes, PositionGroup, Role } from './attributes';
import type { ContinentId } from '../data/countries';

// ── 달력 ────────────────────────────────────────────────────────────────

/** 한 시즌의 길이(주). 아래 상수들이 이 안에 배치됩니다. */
export const SEASON_WEEKS = 44;
/** 리그 라운드가 배치되는 구간. 20개 구단(38라운드)이 딱 들어맞습니다. */
export const LEAGUE_FIRST_WEEK = 5;
export const LEAGUE_LAST_WEEK = 42;
/** 여름 / 겨울 이적시장. */
export const SUMMER_WINDOW: readonly [number, number] = [1, 6];
export const WINTER_WINDOW: readonly [number, number] = [23, 25];
/** 대륙 클럽 대항전 결승 주차. 라운드는 여기서 거꾸로 배치됩니다. */
export const CONTINENTAL_FINAL_WEEK = 38;
/** 클럽 월드컵 (8강 → 결승). */
export const WORLD_CUP_WEEKS: readonly number[] = [40, 41, 42];
/** 시상식 주차. */
export const AWARDS_WEEK = 43;

// ── 선수 ────────────────────────────────────────────────────────────────

export type PersonalityId =
  | 'professional' | 'ambitious' | 'loyal' | 'determined' | 'balanced'
  | 'temperamental' | 'mercenary' | 'lowKey' | 'perfectionist' | 'volatile';

export interface PersonalityDef {
  id: PersonalityId;
  label: string;
  /** 요구 주급 배율. */
  wageGreed: number;
  /** 이적 제안에 대한 저항. 높을수록 현 구단에 남고 싶어 합니다. */
  loyalty: number;
  /** 큰 구단·출전 시간에 대한 갈망. */
  ambition: number;
  /** 성장 속도 배율. */
  growth: number;
  /** 불만이 쌓이는 속도 배율. */
  volatility: number;
  note: string;
}

export interface Contract {
  clubId: string;
  /** 주급, 천 단위. */
  wage: number;
  /** 계약이 끝나는 시즌(연도). 이 시즌 종료와 함께 만료됩니다. */
  expires: number;
  /** 바이아웃 조항. 0이면 없음. */
  releaseClause: number;
  /** 이적 시 에이전트가 받는 비율(%). */
  agentFeePct: number;
  signedSeason: number;
  /** 이 계약을 성사시킨 에이전트. 'you'면 플레이어. */
  brokeredBy: string | null;
}

export interface SeasonStats {
  /** 총 출전 수. 선발과 교체를 모두 포함합니다 — ratingSum 을 이 값으로 나눠 평점을 냅니다. */
  apps: number;
  /** 그중 교체로 들어간 경기 수. */
  subApps: number;
  minutes: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  conceded: number;
  /** 평점 합계. apps 로 나눠 평균을 냅니다. */
  ratingSum: number;
  yellow: number;
  red: number;
  motm: number;
}

/** 대회별 기록. 리그 득점왕과 대륙컵 득점왕을 따로 뽑으려면 필요합니다. */
export interface CompStat {
  apps: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  ratingSum: number;
}

export interface CareerStats extends SeasonStats {
  seasons: number;
  trophies: number;
}

export interface Honour {
  season: number;
  label: string;
  /** 대회 id. 리그 우승 등 구단 성적과 구분하는 용도. */
  competitionId?: string;
}

/** 임대 중인 선수. 소속(clubId)은 임대 구단이고 계약은 원 소속 구단에 남습니다. */
export interface Loan {
  parentClubId: string;
  /** 이 시즌이 끝나면 복귀합니다. */
  untilSeason: number;
}

export interface Player {
  id: string;
  name: string;
  age: number;
  /** 국적 코드(CountryDef.code). */
  nationality: string;
  /** 이중 국적. 없으면 undefined. */
  secondNationality?: string;
  /** 키(cm) / 몸무게(kg). */
  height: number;
  weight: number;
  /** 왼발 / 오른발 능력 1-20. 주발은 여기서 계산합니다. */
  footLeft: number;
  footRight: number;
  attributes: Attributes;
  /** 포지션별 숙련도 1-20. */
  positions: Partial<Record<Role, number>>;
  bestRole: Role;
  group: PositionGroup;
  /** 현재 능력 1-200. */
  ca: number;
  /** 잠재 능력 1-200. */
  pa: number;
  personality: PersonalityId;
  clubId: string | null;
  /** 임대 중이면 원 소속 구단. 시즌이 끝나면 자동으로 돌아갑니다. */
  loan?: Loan;
  contract: Contract | null;
  /** 담당 에이전트. 'you' = 플레이어, null = 무소속, 그 외 = AI 에이전트. */
  agentId: string | null;
  /** 0-100. */
  morale: number;
  form: number;
  fitness: number;
  injuredWeeks: number;
  /** 이번 시즌 부상 누적 주 수. 잦은 부상은 가치를 깎습니다. */
  season: SeasonStats;
  /** 대회 id → 이번 시즌 그 대회에서의 기록. */
  compStats: Record<string, CompStat>;
  career: CareerStats;
  honours: Honour[];
  /** 추정 시장 가치, 천 단위. 매주 갱신됩니다. */
  value: number;
  /** 플레이어가 스카우팅으로 얼마나 파악했는지 0-100. */
  scouted: number;
  retired: boolean;
}

// ── 구단 ────────────────────────────────────────────────────────────────

export interface Club {
  id: string;
  name: string;
  shortName: string;
  countryId: string;
  /** 소속 부. 승격·강등으로 바뀝니다. */
  tier: number;
  color: string;
  accent: string;
  /** 1-100. 선수 영입력과 매력도. */
  reputation: number;
  /** 이적료 예산, 천 단위. */
  budget: number;
  /** 주급 총액 상한, 천 단위. */
  wageBudget: number;
  playerIds: string[];
  /** 이사회가 기대하는 리그 순위. */
  expectation: number;
  style: 'attacking' | 'balanced' | 'defensive';
  /** 지난 시즌 리그 순위. 0이면 신생/승격. */
  lastPosition: number;
  honours: Honour[];
}

// ── 대회 ────────────────────────────────────────────────────────────────

export type CompetitionKind = 'league' | 'continental' | 'world';

export interface Competition {
  id: string;
  kind: CompetitionKind;
  name: string;
  shortName: string;
  countryId?: string;
  /** 리그의 부(1 = 1부). 컵 대회에는 없습니다. */
  tier?: number;
  continentId?: ContinentId;
  /** 대회 수준 1-100. 경기 중요도와 수상 가중치에 씁니다. */
  prestige: number;
  color: string;
}

export interface Fixture {
  id: string;
  competitionId: string;
  week: number;
  /** 리그는 라운드 번호, 컵은 라운드 인덱스. */
  round: number;
  homeId: string;
  awayId: string;
  played: boolean;
  homeGoals: number;
  awayGoals: number;
  /** 승부차기가 있었다면 [홈, 원정]. */
  shootout?: [number, number];
}

export interface TableRow {
  clubId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

export interface LeagueState {
  /** 1부는 국가 id, 하부는 `eng:2` 형태. */
  id: string;
  countryId: string;
  /** 1 = 1부. 본거지 국가만 2 이상이 존재합니다. */
  tier: number;
  competitionId: string;
  clubIds: string[];
  fixtures: Fixture[];
  table: Record<string, TableRow>;
  /** 총 라운드 수. */
  rounds: number;
  championId?: string;
}

export interface CupRound {
  name: string;
  week: number;
  /** 이 라운드 대진의 fixture id 목록. */
  fixtureIds: string[];
  done: boolean;
}

export interface CupState {
  id: string;
  competitionId: string;
  continentId?: ContinentId;
  entrants: string[];
  rounds: CupRound[];
  fixtures: Fixture[];
  /** 아직 남아 있는 구단. */
  alive: string[];
  championId?: string;
  runnerUpId?: string;
}

// ── 에이전트 ────────────────────────────────────────────────────────────

export interface LedgerEntry {
  season: number;
  week: number;
  label: string;
  /** 양수 = 수입, 음수 = 지출. 천 단위. */
  amount: number;
}

export interface AgentState {
  name: string;
  agencyName: string;
  /** 보유 자금, 천 단위. */
  cash: number;
  /** 0-100. 구단이 전화를 받아 주는 정도. */
  reputation: number;
  /** 라이선스 등급 1-5. 동시 진행 가능한 협상 수와 의뢰인 정원을 정합니다. */
  licence: number;
  /** 구단별 관계 0-100. */
  clubRelations: Record<string, number>;
  /** 스카우팅에 쓰는 주간 포인트. */
  scoutPoints: number;
  ledger: LedgerEntry[];
  /** 통산 실적. */
  totals: { deals: number; feeVolume: number; commission: number };
}

export interface ClientDemand {
  id: string;
  kind: 'playing-time' | 'wage' | 'transfer' | 'personal' | 'discipline' | 'renewal';
  title: string;
  body: string;
  createdWeek: number;
  /** 이 주차를 넘기면 자동으로 실패 처리됩니다. */
  deadlineWeek: number;
  /** 선택지. 플레이어가 하나를 고릅니다. */
  options: DemandOption[];
  resolution?: 'success' | 'fail' | 'expired';
}

export interface DemandOption {
  id: string;
  label: string;
  /** 성공 확률 0-1. 계산된 값이 저장됩니다. */
  chance: number;
  /** 성공/실패 시 신뢰도 변화. */
  trustOnSuccess: number;
  trustOnFail: number;
  /** 비용(천 단위). 0이면 무료. */
  cost: number;
  hint: string;
}

export interface Client {
  playerId: string;
  /** 에이전시와 계약한 시즌. */
  since: number;
  /** 대리인 계약 만료 시즌. */
  until: number;
  /** 0-100. 낮아지면 다른 에이전트로 떠납니다. */
  trust: number;
  /** 이적·계약 성사 시 받는 수수료율(%). */
  commissionPct: number;
  demands: ClientDemand[];
}

// ── 협상 ────────────────────────────────────────────────────────────────

export type NegotiationKind = 'transfer' | 'renewal' | 'free-agent';
export type NegotiationStage = 'fee' | 'terms' | 'commission' | 'agreed' | 'failed';

export interface NegotiationMessage {
  week: number;
  from: 'you' | 'club' | 'player' | 'seller';
  text: string;
  tone: 'neutral' | 'good' | 'bad';
}

export interface Negotiation {
  id: string;
  kind: NegotiationKind;
  playerId: string;
  /** 영입하려는 구단(재계약이면 현 구단). */
  clubId: string;
  /** 파는 구단. 자유계약이면 null. */
  fromClubId: string | null;
  stage: NegotiationStage;
  /** 현재 테이블에 올라온 조건. */
  fee: number;
  wage: number;
  years: number;
  commissionPct: number;
  releaseClause: number;
  /** 상대가 속으로 생각하는 상한/하한. 협상 전에는 보이지 않습니다. */
  clubMaxFee: number;
  sellerMinFee: number;
  clubMaxWage: number;
  playerMinWage: number;
  /** 구단이 받아들이는 최대 수수료율(%). 조건 합의 시점에 정해집니다. */
  commissionCap: number;
  /**
   * 한 번 퇴짜를 맞으면 상대가 자기 선을 흘립니다. 값이 들어 있으면 UI 에
   * 표시됩니다 — 협상은 상한을 모르고 찌르는 게 아니라, 찔러서 알아낸 뒤
   * 그 안에서 최선을 뽑아내는 놀이여야 합니다.
   */
  revealedClubMaxFee?: number;
  revealedSellerMinFee?: number;
  revealedClubMaxWage?: number;
  revealedPlayerMinWage?: number;
  revealedCommissionCap?: number;
  /** 0-100. 0이 되면 결렬. */
  patience: number;
  messages: NegotiationMessage[];
  openedWeek: number;
  expiresWeek: number;
  /** 구단이 먼저 접근해 온 건인지. */
  inbound: boolean;
}

// ── 스카우팅 ────────────────────────────────────────────────────────────

export interface ScoutReport {
  playerId: string;
  week: number;
  /** 파악한 정도 0-100. */
  depth: number;
}

export interface ScoutingState {
  /** 이번 시즌 남은 스카우팅 포인트. */
  points: number;
  /** 주당 회복량. */
  regen: number;
  /** 관심 목록. */
  shortlist: string[];
  reports: Record<string, ScoutReport>;
}

// ── 뉴스 · 수상 · 기록 ──────────────────────────────────────────────────

export interface NewsItem {
  id: string;
  season: number;
  week: number;
  category: 'transfer' | 'client' | 'award' | 'match' | 'finance' | 'league' | 'system';
  title: string;
  body: string;
  tone: 'neutral' | 'good' | 'bad';
  read: boolean;
  /** 관련 선수/구단. 탭하면 상세로 이동합니다. */
  playerId?: string;
  clubId?: string;
}

export type AwardId =
  | 'top-scorer' | 'top-assists' | 'player-of-year' | 'young-player' | 'golden-glove'
  | 'continental-player' | 'continental-scorer'
  | 'world-player' | 'world-young-player' | 'world-scorer';

export interface AwardWinner {
  awardId: AwardId;
  season: number;
  /** 리그·대륙 단위 상이면 대회 id. 세계 상이면 undefined. */
  competitionId?: string;
  continentId?: ContinentId;
  playerId: string;
  /** 수상 시점의 이름/구단을 박제해 둡니다. 은퇴 후에도 기록이 남습니다. */
  playerName: string;
  clubName: string;
  /** 득점왕이면 골 수, 올해의 선수면 점수. */
  value: number;
  /** 플레이어의 의뢰인이었는지. */
  wasClient: boolean;
}

export interface SeasonHistory {
  season: number;
  /** 리그별 우승 구단. */
  leagueChampions: Record<string, string>;
  /** 대륙컵 우승 구단. */
  continentalChampions: Record<string, string>;
  worldChampionId?: string;
  awards: AwardWinner[];
  /** 에이전트 실적. */
  agent: { cash: number; reputation: number; deals: number; commission: number; clients: number };
}

// ── 전체 상태 ───────────────────────────────────────────────────────────

export type Phase = 'preseason' | 'season' | 'awards' | 'rollover';

export interface GameState {
  seed: number;
  /** 시작 연도. 시즌 표기는 `${season}/${season+1}`. */
  season: number;
  week: number;
  phase: Phase;
  /** 활성화된 국가 id 목록. */
  countryIds: string[];
  /** 본거지 국가. 이 나라만 하부 리그까지 열립니다. */
  homeCountryId: string;
  agent: AgentState;
  clubs: Record<string, Club>;
  players: Record<string, Player>;
  competitions: Record<string, Competition>;
  leagues: Record<string, LeagueState>;
  cups: Record<string, CupState>;
  clients: Record<string, Client>;
  negotiations: Negotiation[];
  scouting: ScoutingState;
  news: NewsItem[];
  awards: AwardWinner[];
  history: SeasonHistory[];
  /** 지난 주에 치러진 경기 결과 — 주간 요약 화면에 씁니다. */
  lastWeekResults: Fixture[];
  /** 리그명·구단명 사용자 편집분. */
  renames: Record<string, string>;
}

export const isWindowOpen = (week: number): boolean =>
  (week >= SUMMER_WINDOW[0] && week <= SUMMER_WINDOW[1]) ||
  (week >= WINTER_WINDOW[0] && week <= WINTER_WINDOW[1]);

export const seasonLabel = (season: number): string => `${season}/${String((season + 1) % 100).padStart(2, '0')}`;
