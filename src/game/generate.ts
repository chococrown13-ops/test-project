import { computeCA, marketValue, positionWeights, wageDemand } from './ability';
import { A, ATTRS, GOALKEEPING, HIDDEN, H, type AttrKey } from './attributes';
import { planSeason } from './calendar';
import { POS_NEIGHBOURS, type Position } from './formations';
import { CLUB_SEEDS, FOREIGN_NATIONS, STADIUM_SUFFIX, playerName, staffName } from './names';
import { Rng, clamp } from './rng';
import { PRESETS, autoSelect, makeTactic } from './tactics';
import type { Club, Fixture, GameState, Player, PlayerSeason, SquadStatus, Staff, StaffRole } from './types';

export const DIVISIONS = 3;
export const CLUBS_PER_DIVISION = 16;
export const SAVE_VERSION = 2;

/** CA band of a division's clubs, from weakest to strongest reputation. */
const DIVISION_CA: [number, number][] = [
  [104, 142],
  [80, 112],
  [58, 90],
];

export function emptySeason(season: number, clubId: string): PlayerSeason {
  return {
    season,
    clubId,
    apps: 0,
    starts: 0,
    minutes: 0,
    goals: 0,
    assists: 0,
    ratingSum: 0,
    ratingCount: 0,
    yellow: 0,
    red: 0,
    mom: 0,
    cleanSheets: 0,
  };
}

let idCounter = 0;
export function newId(prefix: string, rng: Rng): string {
  idCounter += 1;
  return `${prefix}${Date.now().toString(36).slice(-4)}${idCounter.toString(36)}${rng.int(0, 1295).toString(36)}`;
}

export interface PlayerSpec {
  position: Position;
  ca: number;
  age: number;
  nation: string;
  pa?: number;
}

/**
 * Build a player whose attributes fit his position and land on the target
 * current ability. Attributes follow the position's weights with noise, then
 * are nudged up or down until the derived CA matches.
 */
export function createPlayer(rng: Rng, spec: PlayerSpec, season: number): Player {
  const { position } = spec;
  const isKeeper = position === 'GK';
  const weights = weightTable(position);
  const level = 1 + spec.ca / 10.5;

  const attrs = ATTRS.map((key) => {
    const w = weights[key] ?? 0;
    if (!isKeeper && (GOALKEEPING as string[]).includes(key)) return rng.int(1, 4);
    if (isKeeper && !(GOALKEEPING as string[]).includes(key) && w === 0) {
      // Keepers' outfield technique is poor; mental and physical still matter.
      const technical = ATTRS.indexOf(key) < A.aggression;
      return clamp(Math.round(rng.normal(technical ? level - 5 : level - 1, 3)), 1, 20);
    }
    const bias = w > 0 ? (w - 0.6) * 2.4 : -2.2;
    return clamp(Math.round(rng.normal(level + bias, 2.6)), 1, 20);
  });

  // Signature strengths make players feel distinct.
  const relevant = Object.keys(weights) as AttrKey[];
  for (let i = 0; i < 2; i++) {
    const key = rng.pick(relevant);
    attrs[A[key]] = clamp(attrs[A[key]] + rng.int(2, 4), 1, 20);
  }

  const player: Player = {
    id: newId('p', rng),
    name: playerName(rng, spec.nation),
    nation: spec.nation,
    age: spec.age,
    birthday: rng.int(0, 364),
    foot: footFor(rng, position),
    height: Math.round(rng.normal(isKeeper ? 189 : position === 'DC' ? 186 : 178, 6)),
    positions: positionsFor(rng, position),
    attrs,
    hidden: HIDDEN.map(() => clamp(Math.round(rng.normal(11, 4.5)), 1, 20)),
    pa: 0,
    ca: 0,
    growth: 0,
    condition: rng.int(90, 100),
    sharpness: rng.int(55, 80),
    morale: rng.int(55, 75),
    form: [],
    injury: null,
    suspension: 0,
    yellowAccum: 0,
    clubId: null,
    contract: null,
    loan: null,
    value: 0,
    reputation: 0,
    trainingFocus: null,
    listed: null,
    recentMinutes: [],
    unhappy: null,
    youth: false,
    seasons: [],
  };

  // Professionalism tracks determination loosely, as in FM's generated players.
  player.hidden[H.professionalism] = clamp(
    Math.round((player.hidden[H.professionalism] + player.attrs[A.determination]) / 2 + rng.normal(0, 2)),
    1,
    20,
  );

  tuneToCA(player, spec.ca, rng);
  player.ca = computeCA(player);
  player.pa = spec.pa ?? clamp(player.ca + upsideFor(rng, spec.age), player.ca, 200);
  player.reputation = clamp(Math.round(player.ca / 2 + rng.normal(0, 6)), 1, 100);
  player.value = marketValue(player, season);
  return player;
}

function weightTable(position: Position): Partial<Record<AttrKey, number>> {
  return positionWeights(position);
}

function tuneToCA(player: Player, target: number, rng: Rng): void {
  const relevant = (Object.keys(weightTable(bestNatural(player))) as AttrKey[]).map((k) => A[k]);
  for (let guard = 0; guard < 120; guard++) {
    const ca = computeCA(player);
    if (Math.abs(ca - target) <= 2) return;
    const index = rng.pick(relevant);
    const step = ca < target ? 1 : -1;
    player.attrs[index] = clamp(player.attrs[index] + step, 1, 20);
  }
}

function bestNatural(player: Player): Position {
  const entry = (Object.entries(player.positions) as [Position, number][]).sort((a, b) => b[1] - a[1])[0];
  return entry ? entry[0] : 'MC';
}

function upsideFor(rng: Rng, age: number): number {
  if (age <= 18) return rng.int(20, 75);
  if (age <= 21) return rng.int(8, 45);
  if (age <= 24) return rng.int(2, 22);
  if (age <= 27) return rng.int(0, 8);
  return rng.int(0, 2);
}

function footFor(rng: Rng, position: Position): Player['foot'] {
  const leftSide = position === 'DL' || position === 'WBL' || position === 'ML';
  const roll = rng.next();
  if (roll < 0.06) return 'B';
  if (leftSide) return roll < 0.7 ? 'L' : 'R';
  return roll < 0.22 ? 'L' : 'R';
}

function positionsFor(rng: Rng, main: Position): Player['positions'] {
  const positions: Player['positions'] = { [main]: 20 };
  if (main === 'GK') return positions;
  const neighbours = rng.shuffle([...POS_NEIGHBOURS[main]]);
  const extra = rng.weighted([0, 1, 2, 3], [2, 4, 3, 1]);
  neighbours.slice(0, extra).forEach((pos, i) => {
    positions[pos] = i === 0 ? rng.int(14, 19) : rng.int(10, 17);
  });
  // Mirror sides are common for full-backs and wide players.
  const mirror: Partial<Record<Position, Position>> = { DL: 'DR', DR: 'DL', ML: 'MR', MR: 'ML', AML: 'AMR', AMR: 'AML', WBL: 'WBR', WBR: 'WBL' };
  const m = mirror[main];
  if (m && rng.bool(0.45)) positions[m] = rng.int(12, 18);
  if ((main === 'DL' || main === 'DR') && !positions[main === 'DL' ? 'WBL' : 'WBR']) {
    positions[main === 'DL' ? 'WBL' : 'WBR'] = rng.int(14, 19);
  }
  if ((main === 'AML' || main === 'AMR') && !positions[main === 'AML' ? 'ML' : 'MR']) {
    positions[main === 'AML' ? 'ML' : 'MR'] = rng.int(14, 19);
  }
  return positions;
}

/** Positions of a 26-man senior squad. */
const SQUAD_TEMPLATE: Position[] = [
  'GK', 'GK', 'GK',
  'DC', 'DC', 'DC', 'DC',
  'DL', 'DL', 'DR', 'DR',
  'DM', 'DM',
  'MC', 'MC', 'MC', 'MC', 'MC',
  'AML', 'AML', 'AMR', 'AMR',
  'AMC',
  'ST', 'ST', 'ST',
];

function squadAge(rng: Rng): number {
  return clamp(Math.round(rng.normal(25.5, 4.2)), 17, 36);
}

export function contractFor(rng: Rng, player: Player, club: Club, season: number, status?: SquadStatus): Player['contract'] {
  const years = player.age < 22 ? rng.int(2, 4) : player.age > 31 ? rng.int(0, 1) : rng.int(0, 3);
  return {
    wage: wageDemand(player, club.reputation),
    expires: season + years,
    status: status ?? 'rotation',
  };
}

function statusByRank(rank: number): SquadStatus {
  if (rank < 3) return 'key';
  if (rank < 11) return 'first';
  if (rank < 17) return 'rotation';
  return 'backup';
}

function makeClub(rng: Rng, index: number): Club {
  const seed = CLUB_SEEDS[index];
  const division = Math.floor(index / CLUBS_PER_DIVISION);
  const rankInDiv = index % CLUBS_PER_DIVISION;
  // Reputation falls through each division, with a little overlap at the edges.
  const top = [88, 58, 36][division];
  const bottom = [56, 34, 14][division];
  const reputation = Math.round(top - ((top - bottom) * rankInDiv) / (CLUBS_PER_DIVISION - 1) + rng.normal(0, 2));
  const capacity = Math.round(
    division === 0 ? rng.int(18, 48) * 1000 : division === 1 ? rng.int(7, 20) * 1000 : rng.int(25, 90) * 100,
  );
  const balance = Math.round(Math.pow(reputation, 2.1) * (division === 0 ? 30 : 18));
  const style = rng.int(0, PRESETS.length - 1);
  return {
    id: `c${index}`,
    name: `${seed.city} ${seed.nick}`,
    short: seed.short,
    city: seed.city,
    primary: seed.primary,
    secondary: seed.secondary,
    reputation,
    division,
    stadium: `${seed.city} ${rng.pick(STADIUM_SUFFIX)}`,
    capacity,
    balance,
    transferBudget: 0,
    wageBudget: 0,
    trainingFacilities: clamp(Math.round(reputation / 5.5 + rng.normal(2, 2)), 2, 20),
    youthFacilities: clamp(Math.round(reputation / 5.5 + rng.normal(2, 3)), 2, 20),
    staffLevel: clamp(Math.round(reputation / 5.5 + rng.normal(2, 2)), 3, 20),
    playerIds: [],
    youthIds: [],
    tactic: makeTactic(PRESETS[style]),
    manager: staffName(rng),
    style,
    expectation: 8,
    income: 0,
    expenses: 0,
  };
}

function populate(rng: Rng, club: Club, rank: number, players: Record<string, Player>, season: number): void {
  const [lo, hi] = DIVISION_CA[club.division];
  const centre = hi - ((hi - lo) * rank) / (CLUBS_PER_DIVISION - 1);
  const foreignSlots = [4, 2, 1][club.division];
  let foreigners = 0;

  const squad = SQUAD_TEMPLATE.map((position, i) => {
    // The first choice at each position is better than the cover.
    const depth = i % 2 === 0 ? 6 : -8;
    const age = squadAge(rng);
    const isForeign = foreigners < foreignSlots && position !== 'GK' && rng.bool(0.22);
    if (isForeign) foreigners++;
    const ageAdj = age < 21 ? -14 : age > 32 ? -6 : 0;
    const ca = clamp(Math.round(rng.normal(centre + depth + ageAdj + (isForeign ? 9 : 0), 7)), 30, 185);
    return createPlayer(rng, { position, ca, age, nation: isForeign ? rng.pick(FOREIGN_NATIONS) : 'KOR' }, season);
  });

  squad
    .sort((a, b) => b.ca - a.ca)
    .forEach((player, i) => {
      player.clubId = club.id;
      player.contract = contractFor(rng, player, club, season, statusByRank(i));
      player.value = marketValue(player, season);
      player.seasons.push(emptySeason(season, club.id));
      players[player.id] = player;
      club.playerIds.push(player.id);
    });

  // Youth team.
  for (let i = 0; i < rng.int(4, 6); i++) {
    const position = rng.pick(SQUAD_TEMPLATE);
    const youth = createPlayer(
      rng,
      { position, ca: clamp(Math.round(rng.normal(lo - 22, 8)), 20, 120), age: rng.int(16, 18), nation: 'KOR' },
      season,
    );
    youth.youth = true;
    youth.clubId = club.id;
    youth.contract = { wage: Math.max(3, Math.round(youth.ca / 8)), expires: season + 2, status: 'prospect' };
    youth.seasons.push(emptySeason(season, club.id));
    players[youth.id] = youth;
    club.youthIds.push(youth.id);
  }
}

export function setBudgets(club: Club, players: Record<string, Player>): void {
  const wageBill = club.playerIds.reduce((sum, id) => sum + (players[id]?.contract?.wage ?? 0), 0);
  club.wageBudget = Math.round(wageBill * 1.08 + club.reputation * 3);
  club.transferBudget = Math.max(0, Math.round(club.balance * (club.division === 0 ? 0.35 : 0.3)));
}

const STAFF_ROLES: StaffRole[] = ['assistant', 'coach', 'coach', 'coach', 'gkCoach', 'fitness', 'scout', 'scout', 'physio', 'physio', 'youth', 'analyst'];

export const STAFF_LABEL: Record<StaffRole, string> = {
  assistant: '수석 코치',
  coach: '코치',
  gkCoach: '골키퍼 코치',
  fitness: '피지컬 코치',
  scout: '스카우트',
  physio: '의무 트레이너',
  youth: '유스 감독',
  analyst: '전력 분석관',
};

export function createStaff(rng: Rng, role: StaffRole, level: number): Staff {
  const ability = clamp(Math.round(rng.normal(level, 2.5)), 3, 20);
  return {
    id: newId('s', rng),
    name: staffName(rng),
    role,
    ability,
    wage: Math.round(10 + Math.pow(ability, 2) * 0.9),
    age: rng.int(31, 62),
  };
}

export function roundRobin(teamIds: string[], rng: Rng): [string, string][][] {
  const teams = rng.shuffle(teamIds.slice());
  const n = teams.length;
  const rounds: [string, string][][] = [];
  const list = teams.slice();
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    list.splice(1, 0, list.pop()!);
  }
  // Second half: same order, venues reversed.
  return [...rounds, ...rounds.map((pairs) => pairs.map(([h, a]) => [a, h] as [string, string]))];
}

export function leagueFixtures(state: Pick<GameState, 'clubs'>, season: number, rng: Rng): Fixture[] {
  const plan = planSeason(season);
  const fixtures: Fixture[] = [];
  for (let division = 0; division < DIVISIONS; division++) {
    const ids = Object.values(state.clubs)
      .filter((c) => c.division === division)
      .map((c) => c.id);
    roundRobin(ids, rng).forEach((pairs, round) => {
      pairs.forEach(([homeId, awayId]) => {
        fixtures.push({
          id: `f${season}-${division}-${round}-${homeId}`,
          comp: 'league',
          division,
          round,
          day: plan.leagueDays[round],
          homeId,
          awayId,
          played: false,
          homeGoals: 0,
          awayGoals: 0,
          pens: null,
          neutral: false,
          goals: [],
        });
      });
    });
  }
  return fixtures;
}

/** Cup round 1: the 32 clubs outside the top division. */
export function cupFirstRound(state: Pick<GameState, 'clubs'>, season: number, rng: Rng): Fixture[] {
  const plan = planSeason(season);
  const entrants = rng.shuffle(
    Object.values(state.clubs)
      .filter((c) => c.division > 0)
      .map((c) => c.id),
  );
  return pairUp(entrants, season, 0, plan.cupDays[0]);
}

export function pairUp(ids: string[], season: number, round: number, day: number, neutral = false): Fixture[] {
  const fixtures: Fixture[] = [];
  for (let i = 0; i + 1 < ids.length; i += 2) {
    fixtures.push({
      id: `cup${season}-${round}-${i}`,
      comp: 'cup',
      division: -1,
      round,
      day,
      homeId: ids[i],
      awayId: ids[i + 1],
      played: false,
      homeGoals: 0,
      awayGoals: 0,
      pens: null,
      neutral,
      goals: [],
    });
  }
  return fixtures;
}

export interface NewGameOptions {
  managerName: string;
  clubIndex: number;
  seed?: number;
}

/** Create the whole world: 48 clubs over three divisions, squads, staff and the first season's fixtures. */
export function createWorld(seed: number): Pick<GameState, 'clubs' | 'players'> {
  const rng = new Rng(seed);
  const season = 2026;
  const clubs: Record<string, Club> = {};
  const players: Record<string, Player> = {};
  CLUB_SEEDS.forEach((_, index) => {
    const club = makeClub(rng, index);
    clubs[club.id] = club;
    populate(rng, club, index % CLUBS_PER_DIVISION, players, season);
    setBudgets(club, players);
    autoSelect(club, players);
  });
  return { clubs, players };
}

export function createNewGame(options: NewGameOptions): GameState {
  const seed = (options.seed ?? Date.now()) >>> 0;
  const rng = new Rng(seed ^ 0x9e3779b9);
  const season = 2026;
  const world = createWorld(seed);
  const clubId = `c${options.clubIndex}`;
  const club = world.clubs[clubId];
  const plan = planSeason(season);

  const staff: Staff[] = STAFF_ROLES.map((role) => createStaff(rng, role, club.staffLevel));
  const staffPool: Staff[] = [];
  for (let i = 0; i < 28; i++) {
    staffPool.push(createStaff(rng, rng.pick(STAFF_ROLES), rng.int(6, 17)));
  }

  const state: GameState = {
    version: SAVE_VERSION,
    seed,
    managerName: options.managerName || '감독',
    clubId,
    nationName: '대한민국',
    leagueNames: ['프리미어 디비전', '챔피언십', '내셔널 리그'],
    cupName: 'FA컵',
    season,
    day: plan.dates.start,
    clubs: world.clubs,
    players: world.players,
    fixtures: [],
    inbox: [],
    knowledge: {},
    shortlist: [],
    staff,
    staffPool,
    assignments: [],
    requirements: [],
    pitches: [],
    aiRequirements: [],
    offers: [],
    negotiations: [],
    transfers: [],
    objectives: [],
    confidence: 65,
    training: { focus: 'balanced', intensity: 'normal' },
    history: [],
    sacked: false,
    jobOffers: [],
    settings: { highlights: 'dynamic' },
    counter: 1,
    matchPending: null,
    dates: plan.dates,
    lastPress: -99,
    review: null,
  };
  state.fixtures = [...leagueFixtures(state, season, rng), ...cupFirstRound(state, season, rng)];
  return state;
}

/** Scouting knowledge you start with: own squad fully, own division partly. */
export function baselineKnowledge(state: GameState, player: Player): number {
  if (player.clubId === state.clubId) return 100;
  const club = player.clubId ? state.clubs[player.clubId] : null;
  const own = state.clubs[state.clubId];
  if (club && club.division === own.division) return 35;
  if (club && Math.abs(club.division - own.division) === 1) return 20;
  return 10;
}

export function knowledgeOf(state: GameState, player: Player): number {
  return Math.max(state.knowledge[player.id] ?? 0, baselineKnowledge(state, player));
}
