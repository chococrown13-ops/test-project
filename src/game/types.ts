import type { AttrGroup } from './attributes';
import type { FormationId, Position } from './formations';

/** Money is stored in units of 10,000 KRW (만원). */
export type Money = number;

export type SquadStatus = 'key' | 'first' | 'rotation' | 'backup' | 'prospect';

export interface Contract {
  /** Weekly wage. */
  wage: Money;
  /** Season in which the deal runs out (it ends on 30 June of season + 1). */
  expires: number;
  releaseClause?: Money;
  status: SquadStatus;
}

export interface Injury {
  name: string;
  days: number;
}

export interface PlayerSeason {
  season: number;
  clubId: string;
  apps: number;
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  ratingSum: number;
  ratingCount: number;
  yellow: number;
  red: number;
  mom: number;
  cleanSheets: number;
}

export interface Loan {
  fromClubId: string;
  /** Day the loan ends. */
  until: number;
  /** Share of the wage the parent club still pays, 0-1. */
  parentPays: number;
}

export interface Player {
  id: string;
  name: string;
  /** Three-letter nation code. */
  nation: string;
  age: number;
  /** Day of year the player turns a year older. */
  birthday: number;
  foot: 'L' | 'R' | 'B';
  height: number;
  /** Position familiarity 1-20 (20 = natural). */
  positions: Partial<Record<Position, number>>;
  attrs: number[];
  hidden: number[];
  /** Potential ability, 1-200. Current ability is derived from attributes. */
  pa: number;
  ca: number;
  /** Fractional development waiting to turn into attribute points. */
  growth: number;
  /** 0-100 physical condition. */
  condition: number;
  /** 0-100 match sharpness. */
  sharpness: number;
  /** 0-100. */
  morale: number;
  /** Last five match ratings, newest last. */
  form: number[];
  injury: Injury | null;
  /** Matches still to sit out. */
  suspension: number;
  yellowAccum: number;
  clubId: string | null;
  contract: Contract | null;
  loan: Loan | null;
  value: Money;
  /** 1-100 how well known the player is. */
  reputation: number;
  trainingFocus: AttrGroup | null;
  listed: 'transfer' | 'loan' | null;
  /** Minutes in the club's last few matches, newest last, for playing-time morale. */
  recentMinutes: number[];
  /** Set when the player wants a move. */
  unhappy: string | null;
  youth: boolean;
  seasons: PlayerSeason[];
}

export type Mentality =
  | 'veryDefensive'
  | 'defensive'
  | 'cautious'
  | 'balanced'
  | 'positive'
  | 'attacking'
  | 'veryAttacking';

export interface IpInstructions {
  tempo: 'slow' | 'normal' | 'fast';
  passing: 'short' | 'mixed' | 'direct';
  width: 'narrow' | 'normal' | 'wide';
  finalThird: 'workIntoBox' | 'mixed' | 'shootOnSight';
  transition: 'counter' | 'patient';
}

export interface OopInstructions {
  engagement: 'low' | 'mid' | 'high';
  line: 'deep' | 'normal' | 'high';
  press: 'less' | 'normal' | 'more';
  tackling: 'stayOnFeet' | 'normal' | 'aggressive';
  transition: 'counterpress' | 'regroup';
}

export interface Tactic {
  ipFormation: FormationId;
  oopFormation: FormationId;
  /** oopOf[ipSlot] = oopSlot. */
  oopOf: number[];
  /** Player per IP slot. */
  lineup: (string | null)[];
  /** Role per IP slot. */
  ipRoles: string[];
  /** Role per OOP slot. */
  oopRoles: string[];
  bench: string[];
  mentality: Mentality;
  ip: IpInstructions;
  oop: OopInstructions;
  captain: string | null;
  penaltyTaker: string | null;
  setPieceTaker: string | null;
  /** 0-100: how well the squad knows this shape. Drops when formations change. */
  familiarity: number;
}

export interface Club {
  id: string;
  name: string;
  short: string;
  city: string;
  primary: string;
  secondary: string;
  /** 1-100. */
  reputation: number;
  division: number;
  stadium: string;
  capacity: number;
  balance: Money;
  transferBudget: Money;
  wageBudget: Money;
  /** 1-20. */
  trainingFacilities: number;
  youthFacilities: number;
  /** 1-20 staff level for AI clubs (and the user's when no staff is hired). */
  staffLevel: number;
  playerIds: string[];
  youthIds: string[];
  tactic: Tactic;
  manager: string;
  /** AI style preset index. */
  style: number;
  /** League position the board expects. */
  expectation: number;
  income: Money;
  expenses: Money;
}

export type Competition = 'league' | 'cup' | 'playoff';

export interface GoalRecord {
  playerId: string;
  minute: number;
  side: 'home' | 'away';
  penalty?: boolean;
}

export interface Fixture {
  id: string;
  comp: Competition;
  division: number;
  round: number;
  day: number;
  homeId: string;
  awayId: string;
  played: boolean;
  homeGoals: number;
  awayGoals: number;
  pens: { home: number; away: number } | null;
  neutral: boolean;
  goals: GoalRecord[];
  homeXg?: number;
  awayXg?: number;
  attendance?: number;
}

export type MessageTone = 'neutral' | 'good' | 'bad' | 'action';

export interface Message {
  id: string;
  day: number;
  from: string;
  subject: string;
  body: string;
  tone: MessageTone;
  read: boolean;
  link?: { type: 'player' | 'offer' | 'pitch' | 'negotiation' | 'fixture' | 'club'; id: string };
}

export type StaffRole = 'assistant' | 'coach' | 'gkCoach' | 'fitness' | 'scout' | 'physio' | 'youth' | 'analyst';

export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
  /** 1-20. */
  ability: number;
  wage: Money;
  age: number;
}

export interface ScoutAssignment {
  id: string;
  staffId: string;
  /** What to look at: a division, free agents, or a single player. */
  target: { type: 'division'; division: number } | { type: 'free' } | { type: 'player'; playerId: string } | { type: 'requirement'; id: string };
  daysLeft: number;
}

export interface Requirement {
  id: string;
  position: Position;
  ipRole: string | null;
  oopRole: string | null;
  minAge: number;
  maxAge: number;
  maxFee: Money;
  maxWage: Money;
  deal: 'transfer' | 'loan' | 'any';
  playingTime: SquadStatus;
  created: number;
  open: boolean;
}

/** A player put forward in answer to one of the user's Requirements. */
export interface Pitch {
  id: string;
  requirementId: string;
  playerId: string;
  fromClubId: string | null;
  /** Fee the selling side is asking. */
  askingFee: Money;
  deal: 'transfer' | 'loan' | 'free';
  day: number;
  note: string;
  dismissed: boolean;
}

/** An AI club advertising what it needs (FM26's Pitch Opportunities). */
export interface AiRequirement {
  id: string;
  clubId: string;
  position: Position;
  maxAge: number;
  maxFee: Money;
  deal: 'transfer' | 'loan';
  until: number;
}

export interface IncomingOffer {
  id: string;
  playerId: string;
  fromClubId: string;
  fee: Money;
  deal: 'transfer' | 'loan';
  expires: number;
  status: 'open' | 'accepted' | 'rejected' | 'countered' | 'completed' | 'collapsed';
  counterFee?: Money;
}

export type NegotiationStage = 'fee' | 'contract' | 'done' | 'failed';

export interface Negotiation {
  id: string;
  playerId: string;
  /** null for free agents and for renewals of the user's own players. */
  sellerId: string | null;
  kind: 'transfer' | 'loan' | 'free' | 'renewal';
  stage: NegotiationStage;
  offeredFee: Money;
  askingFee: Money;
  /** Player's terms once the fee is agreed. */
  demandWage: Money;
  demandYears: number;
  demandStatus: SquadStatus;
  log: string[];
  day: number;
  loanParentPays?: number;
}

export interface TransferRecord {
  day: number;
  season: number;
  playerId: string;
  playerName: string;
  fromId: string | null;
  toId: string | null;
  fee: Money;
  loan: boolean;
}

export interface Objective {
  id: string;
  label: string;
  kind: 'league' | 'cup' | 'finance' | 'youth';
  /** For league: position target; for cup: round index; otherwise unused. */
  target: number;
  importance: 'essential' | 'important' | 'nice';
}

export interface SeasonRecord {
  season: number;
  clubId: string;
  division: number;
  position: number;
  points: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  cup: string;
  outcome: string;
  topScorer: string;
}

export type TrainingFocus = 'balanced' | 'tactical' | 'attacking' | 'defending' | 'physical' | 'setpieces' | 'recovery' | 'matchPrep';

export interface GameSettings {
  highlights: 'all' | 'dynamic' | 'key';
}

export interface GameState {
  version: number;
  seed: number;
  managerName: string;
  clubId: string;
  nationName: string;
  leagueNames: string[];
  cupName: string;
  season: number;
  day: number;
  clubs: Record<string, Club>;
  players: Record<string, Player>;
  fixtures: Fixture[];
  inbox: Message[];
  /** User's scouting knowledge of each player, 0-100. */
  knowledge: Record<string, number>;
  shortlist: string[];
  staff: Staff[];
  staffPool: Staff[];
  assignments: ScoutAssignment[];
  requirements: Requirement[];
  pitches: Pitch[];
  aiRequirements: AiRequirement[];
  offers: IncomingOffer[];
  negotiations: Negotiation[];
  transfers: TransferRecord[];
  objectives: Objective[];
  confidence: number;
  training: { focus: TrainingFocus; intensity: 'low' | 'normal' | 'high' };
  history: SeasonRecord[];
  sacked: boolean;
  jobOffers: string[];
  settings: GameSettings;
  counter: number;
  /** Set on match day for the user's fixture until it is played. */
  matchPending: string | null;
  /** Season's important dates. */
  dates: SeasonDates;
  /** Day of the last pre-match press conference, to avoid one every match. */
  lastPress: number;
  /** Shown once after the season rolls over. */
  review: SeasonReview | null;
  /** Shouts/team-talk state of the live match is kept on the live match. */
}

export interface SeasonReview {
  season: number;
  division: number;
  position: number;
  outcome: string;
  champion: string;
  cup: string;
  cupWinner: string;
  objectives: { label: string; met: boolean; detail: string }[];
  prize: Money;
  promoted: string[];
  relegated: string[];
  departures: string[];
  retirements: string[];
}

export interface SeasonDates {
  start: number;
  windowSummerEnd: number;
  windowWinterStart: number;
  windowWinterEnd: number;
  youthIntake: number;
  end: number;
}

/* ------------------------------------------------------------- match events */

export type ChanceType =
  | 'through'
  | 'cross'
  | 'cutback'
  | 'dribble'
  | 'longshot'
  | 'counter'
  | 'longball'
  | 'corner'
  | 'freekick'
  | 'penalty';

export type MatchEventKind =
  | 'kickoff'
  | 'chance'
  | 'goal'
  | 'save'
  | 'miss'
  | 'foul'
  | 'yellow'
  | 'red'
  | 'injury'
  | 'sub'
  | 'offside'
  | 'corner'
  | 'halftime'
  | 'fulltime'
  | 'extratime'
  | 'pens'
  | 'info';

export interface MatchEvent {
  minute: number;
  kind: MatchEventKind;
  side: 'home' | 'away' | 'neutral';
  text: string;
  playerId?: string;
  assistId?: string;
  chance?: ChanceType;
  xg?: number;
  homeGoals: number;
  awayGoals: number;
}
