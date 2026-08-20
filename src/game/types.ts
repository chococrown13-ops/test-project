export type PositionGroup = 'GK' | 'DF' | 'MF' | 'FW';

/** Concrete slot on the pitch. Formations are expressed as lists of these. */
export type Role =
  | 'GK'
  | 'DC'
  | 'DL'
  | 'DR'
  | 'DM'
  | 'MC'
  | 'ML'
  | 'MR'
  | 'AM'
  | 'ST';

export interface Attributes {
  /** Finishing, heading, composure in the box. */
  shooting: number;
  /** Vision, passing range, set pieces. */
  passing: number;
  /** Dribbling, first touch, flair. */
  dribbling: number;
  /** Tackling, marking, positioning. */
  defending: number;
  /** Pace, strength, stamina ceiling. */
  physical: number;
  /** Shot stopping, handling, command of area. GK only — outfielders get a token value. */
  goalkeeping: number;
}

export type AttributeKey = keyof Attributes;

export interface Player {
  id: string;
  name: string;
  age: number;
  nationality: string;
  role: Role;
  group: PositionGroup;
  attributes: Attributes;
  /** Long-term ceiling, 40-99. Drives development. */
  potential: number;
  /** 0-100. Recovers between matches, drains during them. */
  fitness: number;
  /** 0-100. Recent performances move this. Multiplies effective ability. */
  form: number;
  /** 0-100. Playing time, results and squad status move this. */
  morale: number;
  /** Remaining matches out. 0 = available. */
  injuredFor: number;
  /** Weekly wage in thousands. */
  wage: number;
  /** Estimated market value in thousands. */
  value: number;
  season: SeasonStats;
  career: SeasonStats;
}

export interface SeasonStats {
  appearances: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  /** Sum of per-match ratings, for averaging. */
  ratingSum: number;
  yellowCards: number;
  redCards: number;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  /** Primary shirt colour, used across the UI. */
  color: string;
  /** Secondary/accent colour. */
  accent: string;
  players: Player[];
  /** Selected XI, player ids in formation-slot order. */
  lineup: string[];
  /** Bench, player ids. */
  bench: string[];
  formation: FormationId;
  tactics: Tactics;
  /** Board expectation for the season, as a league position. */
  expectation: number;
  /** Transfer budget in thousands, spent on fees. */
  budget: number;
  /** Ceiling on the total weekly wage bill, in thousands. */
  wageBudget: number;
  /** Baseline club strength, used when generating squads. */
  reputation: number;
}

export type FormationId = '4-4-2' | '4-3-3' | '4-2-3-1' | '3-5-2' | '5-3-2';

export type Mentality = 'defensive' | 'cautious' | 'balanced' | 'positive' | 'attacking';
export type Tempo = 'slow' | 'normal' | 'high';
export type Pressing = 'low' | 'medium' | 'high';
export type PassingStyle = 'short' | 'mixed' | 'direct';

export interface Tactics {
  mentality: Mentality;
  tempo: Tempo;
  pressing: Pressing;
  passing: PassingStyle;
}

export interface Fixture {
  id: string;
  round: number;
  homeId: string;
  awayId: string;
  played: boolean;
  homeGoals: number;
  awayGoals: number;
}

export interface TableRow {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

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
  | 'halftime'
  | 'fulltime'
  | 'info';

export interface MatchEvent {
  minute: number;
  kind: MatchEventKind;
  /** Which side the event belongs to. 'neutral' for clock events. */
  side: 'home' | 'away' | 'neutral';
  text: string;
  /** Score after this event, for the timeline. */
  homeGoals: number;
  awayGoals: number;
}

export interface MatchStats {
  shots: number;
  onTarget: number;
  possession: number;
  corners: number;
  fouls: number;
  yellows: number;
  reds: number;
}

/** Live state of a match in progress, owned by the store. */
export interface LiveMatch {
  fixtureId: string;
  homeId: string;
  awayId: string;
  minute: number;
  homeGoals: number;
  awayGoals: number;
  events: MatchEvent[];
  homeStats: MatchStats;
  awayStats: MatchStats;
  /** Player id -> current match rating (0-10). */
  ratings: Record<string, number>;
  /** Player id -> goals this match, for the summary. */
  scorers: Record<string, number>;
  /** Ids on the pitch right now, per side. */
  homeOnPitch: string[];
  awayOnPitch: string[];
  /**
   * Everyone who took part, per side: the starting XI plus every substitute
   * brought on. End-of-match stats settle over these, not `onPitch`, so a
   * player who is taken off still gets his appearance and rating recorded.
   */
  homeParticipants: string[];
  awayParticipants: string[];
  /** Substitutions remaining. */
  homeSubsLeft: number;
  awaySubsLeft: number;
  /** Player ids sent off. */
  sentOff: string[];
  /** Player ids injured during this match. */
  injured: string[];
  finished: boolean;
  /** Set once the user has seen the result screen. */
  acknowledged: boolean;
}

export interface InboxItem {
  id: string;
  week: number;
  subject: string;
  body: string;
  read: boolean;
  tone: 'neutral' | 'good' | 'bad';
}

/** A bid from an AI club for one of the user's players. */
export interface TransferOffer {
  id: string;
  playerId: string;
  /** Club making the bid. */
  fromTeamId: string;
  fee: number;
  /** Round after which the offer lapses. */
  expiresRound: number;
}

export interface TransferRecord {
  season: number;
  round: number;
  playerName: string;
  fromName: string;
  toName: string;
  fee: number;
}

export interface TransferState {
  /** Player ids the user has put up for sale. */
  listed: string[];
  /** Live bids for the user's players. */
  offers: TransferOffer[];
  /** League-wide completed deals, newest first. */
  log: TransferRecord[];
}

export interface GameState {
  seed: number;
  managerName: string;
  /** Player-editable competition name. */
  leagueName: string;
  clubId: string;
  season: number;
  /** Index into the fixture rounds. */
  round: number;
  teams: Record<string, Team>;
  fixtures: Fixture[];
  inbox: InboxItem[];
  transfer: TransferState;
  live: LiveMatch | null;
  /** Set when the season is complete and awaiting rollover. */
  seasonOver: boolean;
  history: SeasonRecord[];
}

export interface SeasonRecord {
  season: number;
  position: number;
  points: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  topScorer: string;
  topScorerGoals: number;
}
