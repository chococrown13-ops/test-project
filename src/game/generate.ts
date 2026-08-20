import { FORMATIONS, ROLE_GROUP } from './formations';
import { TEAM_SEEDS, randomName, randomNation } from './names';
import { Rng, clamp } from './rng';
import { overall } from './ratings';
import type {
  Attributes,
  Fixture,
  GameState,
  Player,
  Role,
  SeasonStats,
  Team,
} from './types';

export { SQUAD_PLAN };

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}${(idCounter++).toString(36)}`;

export function emptyStats(): SeasonStats {
  return {
    appearances: 0,
    goals: 0,
    assists: 0,
    cleanSheets: 0,
    ratingSum: 0,
    yellowCards: 0,
    redCards: 0,
  };
}

/** Attribute emphasis per role: which attributes a good player there actually has. */
const ROLE_PROFILE: Record<Role, Partial<Record<keyof Attributes, number>>> = {
  GK: { goalkeeping: 1, physical: 0.6, passing: 0.35 },
  DC: { defending: 1, physical: 0.85, passing: 0.5, dribbling: 0.3 },
  DL: { defending: 0.85, physical: 0.9, passing: 0.65, dribbling: 0.6 },
  DR: { defending: 0.85, physical: 0.9, passing: 0.65, dribbling: 0.6 },
  DM: { defending: 0.95, passing: 0.8, physical: 0.8, dribbling: 0.45 },
  MC: { passing: 1, dribbling: 0.75, defending: 0.6, physical: 0.7, shooting: 0.55 },
  ML: { dribbling: 0.95, passing: 0.8, physical: 0.7, shooting: 0.6, defending: 0.45 },
  MR: { dribbling: 0.95, passing: 0.8, physical: 0.7, shooting: 0.6, defending: 0.45 },
  AM: { passing: 0.95, dribbling: 0.95, shooting: 0.8, physical: 0.55, defending: 0.3 },
  ST: { shooting: 1, dribbling: 0.8, physical: 0.75, passing: 0.5, defending: 0.2 },
};

function makeAttributes(rng: Rng, role: Role, quality: number): Attributes {
  const profile = ROLE_PROFILE[role];
  const build = (key: keyof Attributes): number => {
    const weight = profile[key] ?? 0.25;
    // Key attributes sit near the player's quality; the rest tail off.
    const centre = 22 + (quality - 22) * weight;
    return rng.around(centre, 9, 8, 99);
  };
  const attributes: Attributes = {
    shooting: build('shooting'),
    passing: build('passing'),
    dribbling: build('dribbling'),
    defending: build('defending'),
    physical: build('physical'),
    goalkeeping: role === 'GK' ? rng.around(quality, 7, 20, 99) : rng.around(14, 6, 5, 30),
  };
  return attributes;
}

/**
 * How much of his quality a player has actually grown into at a given age.
 * Without this a 17-year-old generates as strong as a 27-year-old and walks
 * into the first team, which is not how squads look.
 */
function ageCurve(age: number): number {
  if (age <= 17) return 0.7;
  if (age <= 19) return 0.7 + (age - 17) * 0.06;
  if (age <= 23) return 0.82 + (age - 19) * 0.045;
  if (age <= 31) return 1;
  return Math.max(0.86, 1 - (age - 31) * 0.035);
}

function makePlayer(rng: Rng, role: Role, quality: number, fixedAge?: number): Player {
  const age = fixedAge ?? rng.int(17, 35);
  // Young players are further from their ceiling, veterans are at or past it.
  const developmentGap = age < 24 ? rng.int(6, 22) : age < 29 ? rng.int(1, 7) : 0;

  const player: Player = {
    id: nextId('p'),
    name: randomName((items) => rng.pick(items)),
    age,
    nationality: randomNation((items) => rng.pick(items)),
    role,
    group: ROLE_GROUP[role],
    attributes: makeAttributes(rng, role, quality * ageCurve(age)),
    potential: 0,
    fitness: rng.int(88, 100),
    form: rng.int(45, 70),
    morale: rng.int(55, 80),
    injuredFor: 0,
    wage: 0,
    value: 0,
    season: emptyStats(),
    career: emptyStats(),
  };

  const ovr = overall(player);
  player.potential = clamp(ovr + developmentGap, ovr, 99);
  // Value rises steeply with ability and falls away with age.
  const ageFactor = age <= 23 ? 1.35 : age <= 27 ? 1.15 : age <= 30 ? 0.85 : age <= 33 ? 0.5 : 0.25;
  player.value = Math.round(Math.pow(ovr / 10, 3.1) * 9 * ageFactor);
  player.wage = Math.max(2, Math.round(player.value / 130));
  return player;
}

/** A squad shaped like a real one: 2 keepers, cover in every line, 23 players. */
const SQUAD_PLAN: Role[] = [
  'GK', 'GK',
  'DL', 'DL', 'DC', 'DC', 'DC', 'DR', 'DR',
  'DM', 'DM', 'MC', 'MC', 'MC', 'ML', 'ML', 'MR', 'MR', 'AM', 'AM',
  'ST', 'ST', 'ST',
];

function makeSquad(rng: Rng, reputation: number): Player[] {
  const plan = SQUAD_PLAN;

  return plan.map((role, index) => {
    // First-choice players are better than the squad filler behind them.
    const depthPenalty = index < 12 ? 0 : index < 18 ? 4 : 8;
    const quality = clamp(rng.around(squadQuality(reputation) - depthPenalty, 7), 20, 96);
    return makePlayer(rng, role, quality);
  });
}

/**
 * Compress the 42-86 reputation range into a 54-79 quality band. The raw
 * spread produced 100-point swings in goal difference across a season; this
 * keeps the pecking order intact while leaving upsets on the table.
 */
function squadQuality(reputation: number): number {
  return 54 + (reputation - 42) * 0.58;
}

/**
 * Bring a squad back up to strength after retirements, filling whichever roles
 * are now short. Intake is young and raw but carries real potential, so the
 * academy is a genuine source of future first-teamers.
 */
export function restockSquad(team: Team, rng: Rng): Player[] {
  const have = new Map<Role, number>();
  team.players.forEach((p) => have.set(p.role, (have.get(p.role) ?? 0) + 1));

  const needed: Role[] = [];
  const want = new Map<Role, number>();
  SQUAD_PLAN.forEach((role) => want.set(role, (want.get(role) ?? 0) + 1));
  want.forEach((count, role) => {
    for (let i = (have.get(role) ?? 0); i < count; i++) needed.push(role);
  });

  const intake = needed.map((role) => {
    // Youngsters arrive well below the first team but with room to grow into it.
    const quality = clamp(rng.around(squadQuality(team.reputation) - 6, 8), 18, 80);
    const player = makePlayer(rng, role, quality, rng.int(17, 20));
    const ovr = overall(player);
    player.potential = clamp(ovr + rng.int(8, 26), ovr, 99);
    player.value = Math.round(Math.pow(ovr / 10, 3.1) * 9 * 1.35);
    player.wage = Math.max(2, Math.round(player.value / 130));
    return player;
  });

  return [...team.players, ...intake];
}

/** Pick the strongest available player for each slot, best slots first. */
export function autoPickLineup(team: Team): { lineup: string[]; bench: string[] } {
  const formation = FORMATIONS[team.formation];
  const available = team.players.filter((p) => p.injuredFor === 0);
  const taken = new Set<string>();
  const lineup: string[] = [];

  // Keeper first — nobody else can do the job.
  const slotOrder = formation.slots
    .map((slot, index) => ({ slot, index }))
    .sort((a, b) => (a.slot === 'GK' ? -1 : b.slot === 'GK' ? 1 : 0));

  const chosen: (string | undefined)[] = new Array(formation.slots.length);
  slotOrder.forEach(({ slot, index }) => {
    const best = available
      .filter((p) => !taken.has(p.id))
      .map((p) => ({ p, score: scoreForSlot(p, slot) }))
      .sort((a, b) => b.score - a.score)[0];
    if (best) {
      chosen[index] = best.p.id;
      taken.add(best.p.id);
    }
  });

  chosen.forEach((id) => id && lineup.push(id));

  const bench = available
    .filter((p) => !taken.has(p.id))
    .sort((a, b) => overall(b) - overall(a))
    .slice(0, 7)
    .map((p) => p.id);

  return { lineup, bench };
}

function scoreForSlot(player: Player, slot: Role): number {
  const base = overall(player);
  if (slot === 'GK') return player.role === 'GK' ? base : base * 0.2;
  if (player.role === 'GK') return base * 0.2;
  if (player.role === slot) return base;
  if (ROLE_GROUP[player.role] === ROLE_GROUP[slot]) return base * 0.9;
  return base * 0.72;
}

/** Circle-method round robin, doubled for home and away legs. */
export function buildFixtures(teamIds: string[], rng: Rng): Fixture[] {
  const ids = rng.shuffle(teamIds);
  const n = ids.length;
  const rounds: [string, string][][] = [];
  const rotation = ids.slice();

  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const home = rotation[i];
      const away = rotation[n - 1 - i];
      // Alternate who is at home so nobody gets a lopsided calendar.
      pairs.push(r % 2 === 0 ? [home, away] : [away, home]);
    }
    rounds.push(pairs);
    // Hold the first team fixed, rotate the rest.
    rotation.splice(1, 0, rotation.pop()!);
  }

  const fixtures: Fixture[] = [];
  const addRound = (pairs: [string, string][], round: number, flip: boolean) => {
    pairs.forEach(([home, away]) => {
      fixtures.push({
        id: nextId('f'),
        round,
        homeId: flip ? away : home,
        awayId: flip ? home : away,
        played: false,
        homeGoals: 0,
        awayGoals: 0,
      });
    });
  };

  rounds.forEach((pairs, i) => addRound(pairs, i, false));
  rounds.forEach((pairs, i) => addRound(pairs, rounds.length + i, true));

  return fixtures;
}

export interface NewGameOptions {
  managerName: string;
  clubId: string | null;
  leagueName?: string;
  /** Overrides for club identity, keyed by team id. */
  teamNames?: Record<string, { name?: string; shortName?: string }>;
  seed?: number;
}

export function createNewGame(options: NewGameOptions): GameState {
  const { managerName, clubId, leagueName, teamNames, seed = Date.now() } = options;
  idCounter = 0;
  const rng = new Rng(seed);

  const teams: Record<string, Team> = {};
  TEAM_SEEDS.forEach((seedTeam, index) => {
    const id = `t${index}`;
    const players = makeSquad(rng, seedTeam.reputation);
    const override = teamNames?.[id];
    const team: Team = {
      id,
      name: override?.name?.trim() || seedTeam.name,
      shortName: override?.shortName?.trim().toUpperCase() || seedTeam.shortName,
      color: seedTeam.color,
      accent: seedTeam.accent,
      players,
      lineup: [],
      bench: [],
      formation: rng.pick(['4-4-2', '4-3-3', '4-2-3-1', '3-5-2']),
      tactics: {
        mentality: 'balanced',
        tempo: 'normal',
        pressing: 'medium',
        passing: 'mixed',
      },
      // Stronger clubs are expected to finish higher.
      expectation: clamp(index + 1 + rng.int(-2, 3), 1, TEAM_SEEDS.length),
      // Enough to buy a genuine upgrade or two, not a whole new spine.
      budget: Math.round(seedTeam.reputation * seedTeam.reputation * 2.4),
      // Headroom above the current bill so every club can sign somebody.
      wageBudget: Math.round(players.reduce((sum, p) => sum + p.wage, 0) * 1.35),
      reputation: seedTeam.reputation,
    };
    const picked = autoPickLineup(team);
    team.lineup = picked.lineup;
    team.bench = picked.bench;
    teams[id] = team;
  });

  const teamIds = Object.keys(teams);
  const chosenClub = clubId && teams[clubId] ? clubId : teamIds[teamIds.length - 4];

  return {
    seed,
    managerName: managerName.trim() || '감독',
    leagueName: leagueName?.trim() || '프리미어 리그',
    clubId: chosenClub,
    season: 1,
    round: 0,
    teams,
    fixtures: buildFixtures(teamIds, rng),
    inbox: [
      {
        id: nextId('m'),
        week: 0,
        subject: `${teams[chosenClub].name}에 오신 것을 환영합니다`,
        body:
          `${managerName.trim() || '감독'}님, 취임을 축하드립니다.\n\n` +
          `이사회는 이번 시즌 ${teams[chosenClub].expectation}위 이내의 성적을 기대하고 있습니다. ` +
          `선수단을 점검하고 전술을 정한 뒤 첫 경기를 준비하세요.`,
        read: false,
        tone: 'neutral',
      },
    ],
    transfer: { listed: [], offers: [], log: [] },
    live: null,
    seasonOver: false,
    history: [],
  };
}

export { nextId };
