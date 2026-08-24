/**
 * 세계 생성. 선택한 국가들의 1부 리그와 구단·선수·일정·대륙 대항전을 만듭니다.
 *
 * 전부 시드 기반이라 같은 시드 + 같은 국가 선택은 언제나 같은 세계를 만듭니다.
 */

import { Rng, clamp } from './rng';
import { NameFactory, shortenClubName } from '../data/names';
import { COUNTRY_BY_ID, CONTINENTS, CONTINENT_ORDER, type ContinentId, type CountryDef } from '../data/countries';
import { generateSquad, generatePlayer, estimateValue, expectedWage, PERSONALITY_BY_ID } from './player';
import { clubStrength } from './ratings';
import { setClubFinances } from './market';
import {
  LEAGUE_FIRST_WEEK, LEAGUE_LAST_WEEK, CONTINENTAL_FINAL_WEEK,
  type Club, type Competition, type CupState, type Fixture, type LeagueState,
  type Player, type TableRow,
} from './types';

/** 구단 색 팔레트. 리그마다 순환하며 뽑습니다. */
const PALETTE: Array<[string, string]> = [
  ['#d92d3c', '#ffffff'], ['#1e63d0', '#8fc0ff'], ['#0f9d58', '#ffffff'],
  ['#6b3fa0', '#f0d24a'], ['#e07a1f', '#1a1a1a'], ['#0e7c86', '#ffffff'],
  ['#b8912e', '#2b2b2b'], ['#c0392b', '#f5c518'], ['#2f4f8f', '#e8e8e8'],
  ['#3c3c46', '#9fd356'], ['#8e2f5e', '#ffd9ec'], ['#146b3a', '#f2f2f2'],
  ['#7a5230', '#ffd08a'], ['#1f5f99', '#ffcf40'], ['#4c6b22', '#e6f2c2'],
  ['#555f6e', '#ff8c42'], ['#9b1b30', '#f7d9c4'], ['#00636b', '#ffe066'],
  ['#4a4a8a', '#ffb3c1'], ['#2d6a4f', '#d8f3dc'],
];

/** AI 에이전트. 이름만 있으면 충분합니다 — 경쟁자 표시용입니다. */
export const AI_AGENTS = [
  'ai1', 'ai2', 'ai3', 'ai4', 'ai5', 'ai6', 'ai7', 'ai8', 'ai9', 'ai10',
] as const;

export const AI_AGENT_NAMES: Record<string, string> = {
  ai1: 'Kessler & Partners', ai2: 'Vantage Sports', ai3: 'Corner Flag Agency',
  ai4: 'Delacroix Management', ai5: 'Meridian Football', ai6: 'Anchor Sports Group',
  ai7: 'Silva Representações', ai8: 'Northline Talent', ai9: 'Aurora Sportif',
  ai10: 'Kite Athlete Care',
};

export interface WorldSetup {
  seed: number;
  countryIds: string[];
  season: number;
}

export interface World {
  clubs: Record<string, Club>;
  players: Record<string, Player>;
  competitions: Record<string, Competition>;
  leagues: Record<string, LeagueState>;
  cups: Record<string, CupState>;
}

// ── 일정 ────────────────────────────────────────────────────────────────

/** 원형 로테이션(circle method)으로 짝수 팀의 단일 라운드로빈을 만듭니다. */
function singleRoundRobin(ids: string[]): Array<Array<[string, string]>> {
  const teams = ids.slice();
  if (teams.length % 2 === 1) teams.push('__bye__');
  const n = teams.length;
  const rounds: Array<Array<[string, string]>> = [];
  const rotation = teams.slice(1);

  for (let r = 0; r < n - 1; r++) {
    const pairs: Array<[string, string]> = [];
    const left = [teams[0], ...rotation.slice(0, n / 2 - 1)];
    const right = rotation.slice(n / 2 - 1).reverse();
    for (let i = 0; i < left.length; i++) {
      const home = r % 2 === 0 ? left[i] : right[i];
      const away = r % 2 === 0 ? right[i] : left[i];
      if (home !== '__bye__' && away !== '__bye__') pairs.push([home, away]);
    }
    rounds.push(pairs);
    rotation.unshift(rotation.pop()!);
  }
  return rounds;
}

/** 홈·원정 두 바퀴. */
function doubleRoundRobin(rng: Rng, ids: string[]): Array<Array<[string, string]>> {
  const first = singleRoundRobin(rng.shuffle(ids));
  const second = first.map((round) => round.map(([h, a]) => [a, h] as [string, string]));
  return [...first, ...second];
}

/** 라운드를 시즌 주차에 고르게 흩뿌립니다. */
function spreadOverWeeks(roundCount: number): number[] {
  const span = LEAGUE_LAST_WEEK - LEAGUE_FIRST_WEEK;
  if (roundCount <= 1) return [LEAGUE_FIRST_WEEK];
  return Array.from({ length: roundCount }, (_, i) =>
    LEAGUE_FIRST_WEEK + Math.round((i * span) / (roundCount - 1)));
}

// ── 구단 · 리그 ─────────────────────────────────────────────────────────

function buildClubs(rng: Rng, names: NameFactory, country: CountryDef): Club[] {
  const clubs: Club[] = [];
  for (let i = 0; i < country.clubCount; i++) {
    // 리그 안에서 최상위와 최하위의 격차. 명성이 높은 리그일수록 위가 두껍습니다.
    const rank = i / Math.max(1, country.clubCount - 1);
    const reputation = clamp(
      Math.round(country.reputation + 9 - rank * (26 + country.reputation * 0.12) + rng.float(-3, 3)),
      12, 99,
    );
    const [color, accent] = PALETTE[(i + country.id.length) % PALETTE.length];
    const name = names.club(country.namePool);
    clubs.push({
      id: `${country.id}-${i}`,
      name,
      shortName: shortenClubName(name),
      countryId: country.id,
      color,
      accent,
      reputation,
      budget: Math.round(Math.pow(reputation / 100, 3.4) * 90000 * country.wageFactor),
      wageBudget: Math.round(Math.pow(reputation / 100, 2.8) * 1900 * country.wageFactor),
      playerIds: [],
      expectation: 0,
      style: rng.pick(['attacking', 'balanced', 'defensive'] as const),
      lastPosition: 0,
      honours: [],
    });
  }
  // 명성 순으로 정렬해 두면 기대 순위를 그대로 매길 수 있습니다.
  clubs.sort((a, b) => b.reputation - a.reputation);
  clubs.forEach((club, i) => { club.expectation = i + 1; });
  return clubs;
}

function emptyTable(clubIds: string[]): Record<string, TableRow> {
  return Object.fromEntries(clubIds.map((clubId) => [clubId, {
    clubId, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0,
  }]));
}

export function buildLeagueFixtures(rng: Rng, competitionId: string, clubIds: string[]): Fixture[] {
  const rounds = doubleRoundRobin(rng, clubIds);
  const weeks = spreadOverWeeks(rounds.length);
  const fixtures: Fixture[] = [];
  rounds.forEach((pairs, roundIndex) => {
    pairs.forEach(([homeId, awayId], i) => {
      fixtures.push({
        id: `${competitionId}#${roundIndex}-${i}`,
        competitionId,
        week: weeks[roundIndex],
        round: roundIndex + 1,
        homeId, awayId,
        played: false,
        homeGoals: 0, awayGoals: 0,
      });
    });
  });
  return fixtures;
}

// ── 대륙 대항전 ─────────────────────────────────────────────────────────

const KNOCKOUT_NAMES: Record<number, string> = {
  32: '32강', 16: '16강', 8: '8강', 4: '4강', 2: '결승',
};

function largestPowerOfTwo(n: number): number {
  let size = 1;
  while (size * 2 <= n) size *= 2;
  return size;
}

/**
 * 대륙 대항전의 빈 대진표를 만듭니다. 참가 구단은 시즌이 시작될 때
 * (또는 직전 시즌 순위가 정해진 뒤) 채워집니다.
 */
export function createCup(
  competitionId: string, continentId: ContinentId | undefined, entrants: string[],
  finalWeek: number, gapWeeks: number,
): CupState {
  const size = largestPowerOfTwo(entrants.length);
  const seeded = entrants.slice(0, size);
  const roundCount = Math.max(1, Math.log2(Math.max(2, size)));
  const rounds = [];
  for (let i = 0; i < roundCount; i++) {
    const teamsInRound = size / Math.pow(2, i);
    rounds.push({
      name: KNOCKOUT_NAMES[teamsInRound] ?? `${teamsInRound}강`,
      week: finalWeek - (roundCount - 1 - i) * gapWeeks,
      fixtureIds: [] as string[],
      done: false,
    });
  }
  return {
    id: competitionId,
    competitionId,
    continentId,
    entrants: seeded,
    rounds,
    fixtures: [],
    alive: seeded.slice(),
  };
}

/** 라운드 대진을 뽑습니다. 살아남은 구단을 섞어 짝지어 줍니다. */
export function drawCupRound(cup: CupState, roundIndex: number, rng: Rng): void {
  const round = cup.rounds[roundIndex];
  if (!round || round.fixtureIds.length > 0) return;
  const pool = rng.shuffle(cup.alive);
  for (let i = 0; i + 1 < pool.length; i += 2) {
    const fixture: Fixture = {
      id: `${cup.competitionId}#r${roundIndex}-${i / 2}`,
      competitionId: cup.competitionId,
      week: round.week,
      round: roundIndex,
      homeId: pool[i],
      awayId: pool[i + 1],
      played: false,
      homeGoals: 0,
      awayGoals: 0,
    };
    cup.fixtures.push(fixture);
    round.fixtureIds.push(fixture.id);
  }
}

/** 대륙별 출전권 배분. 리그 상위 팀이 나갑니다. */
export function continentalEntrants(
  continentId: ContinentId, countryIds: string[], leagues: Record<string, LeagueState>,
  clubs: Record<string, Club>, players: Record<string, Player>,
): string[] {
  const entrants: Array<{ clubId: string; seed: number }> = [];
  for (const countryId of countryIds) {
    const country = COUNTRY_BY_ID[countryId];
    if (!country || country.continent !== continentId) continue;
    const league = leagues[countryId];
    if (!league) continue;
    const ranked = rankLeague(league, clubs, players);
    const slots = Math.min(country.continentalSlots, ranked.length);
    for (let i = 0; i < slots; i++) {
      entrants.push({ clubId: ranked[i], seed: country.reputation - i * 4 });
    }
  }
  entrants.sort((a, b) => b.seed - a.seed);
  return entrants.map((e) => e.clubId);
}

/**
 * 리그 순위. 시즌이 진행 중이면 승점표를, 아직 한 경기도 안 했으면
 * 스쿼드 전력을 기준으로 정렬합니다(개막 전 출전권 배분용).
 */
export function rankLeague(
  league: LeagueState, clubs: Record<string, Club>, players: Record<string, Player>,
): string[] {
  const rows = Object.values(league.table);
  const anyPlayed = rows.some((row) => row.played > 0);
  if (!anyPlayed) {
    return league.clubIds.slice().sort((a, b) =>
      clubStrength(clubs[b], players) - clubStrength(clubs[a], players));
  }
  return rows.slice().sort(compareTableRows).map((row) => row.clubId);
}

export function compareTableRows(a: TableRow, b: TableRow): number {
  if (b.points !== a.points) return b.points - a.points;
  const gdA = a.goalsFor - a.goalsAgainst;
  const gdB = b.goalsFor - b.goalsAgainst;
  if (gdB !== gdA) return gdB - gdA;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  return a.clubId.localeCompare(b.clubId);
}

// ── 계약 · 에이전트 배정 ────────────────────────────────────────────────

function signInitialContract(rng: Rng, player: Player, club: Club, country: CountryDef, season: number): void {
  const wage = expectedWage(player, club.reputation, country);
  const years = rng.int(1, 5);
  const personality = PERSONALITY_BY_ID[player.personality];
  player.clubId = club.id;
  player.contract = {
    clubId: club.id,
    wage: Math.round(wage * rng.float(0.85, 1.15) * 10) / 10,
    expires: season + years,
    // 상위 리그일수록 바이아웃이 흔합니다.
    releaseClause: rng.bool(country.reputation > 78 ? 0.45 : 0.15)
      ? Math.round(estimateValue(player) * rng.float(1.5, 3.0))
      : 0,
    agentFeePct: Math.round(rng.float(2, 9)),
    brokeredBy: null,
    signedSeason: season - rng.int(0, Math.max(0, years - 1)),
  };
  // 능력이 좋고 야심 있는 선수일수록 이미 에이전트가 붙어 있습니다.
  const represented = clamp(0.20 + (player.ca / 200) * 0.62 + personality.ambition / 500, 0.15, 0.9);
  player.agentId = rng.bool(represented) ? rng.pick(AI_AGENTS as readonly string[]) : null;
}

// ── 전체 생성 ───────────────────────────────────────────────────────────

export function buildWorld(setup: WorldSetup): World {
  const rng = new Rng(setup.seed);
  const names = new NameFactory((items) => rng.pick(items));

  const clubs: Record<string, Club> = {};
  const players: Record<string, Player> = {};
  const competitions: Record<string, Competition> = {};
  const leagues: Record<string, LeagueState> = {};
  const cups: Record<string, CupState> = {};

  const countryIds = setup.countryIds.filter((id) => COUNTRY_BY_ID[id]);

  for (const countryId of countryIds) {
    const country = COUNTRY_BY_ID[countryId];
    const competitionId = `lg:${countryId}`;
    competitions[competitionId] = {
      id: competitionId,
      kind: 'league',
      name: country.leagueName,
      shortName: country.code,
      countryId,
      prestige: country.reputation,
      color: country.color,
    };

    const countryClubs = buildClubs(rng, names, country);
    for (const club of countryClubs) {
      clubs[club.id] = club;
      const squad = generateSquad(rng, names, country, club.reputation, `${club.id}p`);
      for (const player of squad) {
        signInitialContract(rng, player, club, country, setup.season);
        player.value = estimateValue(player);
        players[player.id] = player;
        club.playerIds.push(player.id);
      }
      setClubFinances(club, players, country.wageFactor, rng.float(0.85, 1.2));
    }

    const clubIds = countryClubs.map((c) => c.id);
    leagues[countryId] = {
      id: countryId,
      competitionId,
      clubIds,
      fixtures: buildLeagueFixtures(rng, competitionId, clubIds),
      table: emptyTable(clubIds),
      rounds: (clubIds.length - 1) * 2,
    };
  }

  // 무소속 선수 — 스카우팅으로 발굴할 수 있는 자유계약 인력입니다.
  const freeAgentCount = Math.max(12, countryIds.length * 4);
  for (let i = 0; i < freeAgentCount; i++) {
    const country = COUNTRY_BY_ID[rng.pick(countryIds)];
    const player = generatePlayer({
      rng, names, country,
      role: rng.pick(['GK', 'DC', 'DR', 'DL', 'DM', 'MC', 'MR', 'ML', 'AMC', 'AMR', 'AML', 'ST'] as const),
      targetCa: clamp(country.reputation * 0.6 + rng.float(-14, 18), 25, 150),
      idPrefix: 'fa', index: i,
    });
    player.value = estimateValue(player);
    player.agentId = rng.bool(0.35) ? rng.pick(AI_AGENTS as readonly string[]) : null;
    players[player.id] = player;
  }

  // 대륙 대항전
  for (const continentId of CONTINENT_ORDER) {
    const continent = CONTINENTS[continentId];
    const entrants = continentalEntrants(continentId, countryIds, leagues, clubs, players);
    if (entrants.length < 2) continue;
    const competitionId = `ct:${continentId}`;
    competitions[competitionId] = {
      id: competitionId,
      kind: 'continental',
      name: continent.cupName,
      shortName: continent.cupShort,
      continentId,
      prestige: 92,
      color: continent.color,
    };
    const capped = entrants.slice(0, continent.cupSize);
    cups[competitionId] = createCup(competitionId, continentId, capped, CONTINENTAL_FINAL_WEEK, 6);
  }

  // 클럽 월드컵은 대륙 챔피언이 정해진 뒤(주 40) 만들어집니다.
  competitions['wc'] = {
    id: 'wc',
    kind: 'world',
    name: '클럽 월드컵',
    shortName: 'CWC',
    prestige: 96,
    color: '#eab308',
  };

  return { clubs, players, competitions, leagues, cups };
}
