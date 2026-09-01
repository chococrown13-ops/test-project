/**
 * 시즌 진행 엔진.
 *
 * 한 주를 넘길 때마다 활성화된 모든 리그와 대륙 대항전의 그 주 경기를
 * 치르고, 시즌이 끝나면 개인상을 뽑고 선수단을 한 살 먹입니다.
 */

import { Rng, clamp } from './rng';
import { ATTRIBUTE_BY_KEY, GROUP_KEYS, type AttributeKey } from './attributes';
import { buildSnapshot, type TeamSnapshot } from './ratings';
import { playMatch } from './match';
import { caToBase, estimateValue, expectedWage, generatePlayer, PERSONALITY_BY_ID, SQUAD_SIZE } from './player';
import { computeSeasonAwards, recordHonours } from './awards';
import {
  buildLeagueFixtures, continentalEntrants, createCup, drawCupRound, rankLeague, compareTableRows,
} from './world';
import { processExpiries, retireStaleFreeAgents, setClubFinances, signFreeAgents } from './market';
import { returnLoans, type LoanReturn } from './loan';
import { CONTINENTS, CONTINENT_ORDER, PROMOTION_SLOTS, countryOfClub } from '../data/countries';
import { NameFactory } from '../data/names';
import {
  SEASON_WEEKS, AWARDS_WEEK, WORLD_CUP_WEEKS, CONTINENTAL_FINAL_WEEK,
  type Club, type Fixture, type GameState, type Player, type SeasonHistory,
} from './types';

// ── 주간 진행 ───────────────────────────────────────────────────────────

/** 이번 주에 열리는 모든 경기를 치릅니다. 결과 fixture 목록을 돌려줍니다. */
export function playWeek(state: GameState, rng: Rng): Fixture[] {
  const snapshots = new Map<string, TeamSnapshot>();
  const snapshotFor = (clubId: string): TeamSnapshot => {
    let snapshot = snapshots.get(clubId);
    if (!snapshot) {
      snapshot = buildSnapshot(state.clubs[clubId], state.players);
      snapshots.set(clubId, snapshot);
    }
    return snapshot;
  };

  const played: Fixture[] = [];

  // 리그
  for (const league of Object.values(state.leagues)) {
    const prestige = state.competitions[league.competitionId]?.prestige ?? 50;
    for (const fixture of league.fixtures) {
      if (fixture.week !== state.week || fixture.played) continue;
      playMatch(fixture, snapshotFor(fixture.homeId), snapshotFor(fixture.awayId), {
        players: state.players, rng, competitionId: league.competitionId, prestige,
      });
      applyToTable(league.table[fixture.homeId], league.table[fixture.awayId], fixture);
      played.push(fixture);
    }
  }

  // 컵 대회 — 그 주에 예정된 라운드를 뽑고 바로 치릅니다.
  for (const cup of Object.values(state.cups)) {
    const prestige = state.competitions[cup.competitionId]?.prestige ?? 90;
    cup.rounds.forEach((round, index) => {
      if (round.week !== state.week || round.done) return;
      drawCupRound(cup, index, rng);
      const winners: string[] = [];
      for (const fixtureId of round.fixtureIds) {
        const fixture = cup.fixtures.find((f) => f.id === fixtureId);
        if (!fixture || fixture.played) continue;
        const result = playMatch(fixture, snapshotFor(fixture.homeId), snapshotFor(fixture.awayId), {
          players: state.players, rng, competitionId: cup.competitionId, knockout: true, prestige,
        });
        const homeWon = result.homeGoals > result.awayGoals
          || (result.shootout ? result.shootout[0] > result.shootout[1] : false);
        winners.push(homeWon ? fixture.homeId : fixture.awayId);
        played.push(fixture);
      }
      // 부전승 — 대진이 홀수면 남은 한 팀이 자동으로 올라갑니다.
      if (cup.alive.length % 2 === 1) {
        const paired = new Set(round.fixtureIds.flatMap((id) => {
          const fixture = cup.fixtures.find((f) => f.id === id);
          return fixture ? [fixture.homeId, fixture.awayId] : [];
        }));
        const bye = cup.alive.find((id) => !paired.has(id));
        if (bye) winners.push(bye);
      }
      cup.alive = winners;
      round.done = true;

      if (index === cup.rounds.length - 1 && winners.length === 1) {
        cup.championId = winners[0];
        const finalFixture = cup.fixtures.find((f) => f.id === round.fixtureIds[0]);
        if (finalFixture) {
          cup.runnerUpId = finalFixture.homeId === winners[0] ? finalFixture.awayId : finalFixture.homeId;
        }
        awardClubHonour(state, winners[0], cup.competitionId);
      }
    });
  }

  return played;
}

function applyToTable(home: { played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; points: number },
  away: typeof home, fixture: Fixture): void {
  home.played++; away.played++;
  home.goalsFor += fixture.homeGoals; home.goalsAgainst += fixture.awayGoals;
  away.goalsFor += fixture.awayGoals; away.goalsAgainst += fixture.homeGoals;
  if (fixture.homeGoals > fixture.awayGoals) { home.won++; home.points += 3; away.lost++; }
  else if (fixture.homeGoals < fixture.awayGoals) { away.won++; away.points += 3; home.lost++; }
  else { home.drawn++; away.drawn++; home.points++; away.points++; }
}

function awardClubHonour(state: GameState, clubId: string, competitionId: string): void {
  const club = state.clubs[clubId];
  const competition = state.competitions[competitionId];
  if (!club || !competition) return;
  club.honours.push({ season: state.season, label: `${competition.name} 우승`, competitionId });
  for (const playerId of club.playerIds) {
    const player = state.players[playerId];
    if (!player) continue;
    // 그 대회에 실제로 뛴 선수만 우승 기록을 가져갑니다.
    if ((player.compStats[competitionId]?.apps ?? 0) > 0) {
      player.honours.push({ season: state.season, label: `${competition.name} 우승`, competitionId });
      player.career.trophies += 1;
    }
  }
}

/** 경기가 없는 선수의 체력 회복, 부상 복귀, 시장 가치 갱신. */
export function weeklyRecovery(state: GameState): void {
  for (const player of Object.values(state.players)) {
    if (player.retired) continue;
    if (player.injuredWeeks > 0) {
      player.injuredWeeks -= 1;
      player.fitness = clamp(player.fitness + 4, 0, 92);
    } else {
      const recovery = 12 + (player.attributes.naturalFitness / 20) * 14;
      player.fitness = clamp(player.fitness + recovery, 0, 100);
    }
    // 폼은 경기가 없으면 서서히 평균으로 돌아옵니다.
    player.form = clamp(player.form * 0.94 + 50 * 0.06, 0, 100);
    player.value = estimateValue(player);
  }
}

// ── 클럽 월드컵 ─────────────────────────────────────────────────────────

/**
 * 대륙 챔피언이 모두 결정된 뒤 클럽 월드컵 대진을 만듭니다.
 * 대륙 수가 8에 못 미치면 리그 우승팀 중 명성이 높은 구단으로 채웁니다.
 */
export function ensureWorldCup(state: GameState, rng: Rng): void {
  if (state.cups['wc']) return;
  if (state.week < WORLD_CUP_WEEKS[0]) return;

  const entrants: string[] = [];
  for (const continentId of CONTINENT_ORDER) {
    const cup = state.cups[`ct:${continentId}`];
    if (cup?.championId) entrants.push(cup.championId);
  }
  const leagueChampions = Object.values(state.leagues)
    .map((league) => rankLeague(league, state.clubs, state.players)[0])
    .filter((clubId): clubId is string => Boolean(clubId) && !entrants.includes(clubId))
    .sort((a, b) => state.clubs[b].reputation - state.clubs[a].reputation);

  while (entrants.length < 8 && leagueChampions.length > 0) entrants.push(leagueChampions.shift()!);
  if (entrants.length < 2) return;

  state.cups['wc'] = createCup('wc', undefined, entrants, WORLD_CUP_WEEKS[WORLD_CUP_WEEKS.length - 1], 1);
  void rng;
}

// ── 시즌 마감 ───────────────────────────────────────────────────────────

export interface SeasonSummary {
  history: SeasonHistory;
}

/** 시상식 주차에 호출합니다. 우승팀 확정 + 개인상 산정. */
export function finishSeason(state: GameState): SeasonSummary {
  // 리그 우승
  const leagueChampions: Record<string, string> = {};
  for (const league of Object.values(state.leagues)) {
    const ranked = Object.values(league.table).slice().sort(compareTableRows);
    if (ranked.length === 0) continue;
    league.championId = ranked[0].clubId;
    leagueChampions[league.id] = ranked[0].clubId;
    awardClubHonour(state, ranked[0].clubId, league.competitionId);
    ranked.forEach((row, index) => {
      const club = state.clubs[row.clubId];
      if (club) club.lastPosition = index + 1;
    });
  }

  const continentalChampions: Record<string, string> = {};
  for (const continentId of CONTINENT_ORDER) {
    const cup = state.cups[`ct:${continentId}`];
    if (cup?.championId) continentalChampions[continentId] = cup.championId;
  }

  const clientIds = new Set(Object.keys(state.clients));
  const winners = computeSeasonAwards({
    season: state.season,
    players: state.players,
    clubs: state.clubs,
    competitions: state.competitions,
    clientIds,
  });
  recordHonours(winners, state.players, state.competitions);
  state.awards.push(...winners);

  const history: SeasonHistory = {
    season: state.season,
    leagueChampions,
    continentalChampions,
    worldChampionId: state.cups['wc']?.championId,
    awards: winners,
    agent: {
      cash: state.agent.cash,
      reputation: state.agent.reputation,
      deals: state.agent.totals.deals,
      commission: state.agent.totals.commission,
      clients: clientIds.size,
    },
  };
  state.history.push(history);
  return { history };
}

// ── 성장 · 노화 · 시즌 롤오버 ───────────────────────────────────────────

/**
 * 나이와 출전 시간에 따른 CA 변화량.
 *
 * `roomFactor` 가 핵심입니다. 남은 잠재력에 비례해 성장 속도를 올려 주지
 * 않으면 특급 유망주가 평생 잠재력의 절반도 못 채우고, 그 결과 세대가
 * 바뀔 때마다 세계 최고 수준이 통째로 내려앉습니다.
 */
function caDelta(player: Player, rng: Rng): number {
  const personality = PERSONALITY_BY_ID[player.personality];
  const playingTime = clamp(player.season.minutes / 2200, 0, 1.15);
  const room = player.pa - player.ca;
  const drive = 0.5 + (player.attributes.determination / 20) * 0.5;
  const roomFactor = clamp(room / 45, 0.15, 1.8);

  if (player.age <= 23) {
    const gain = rng.float(4, 13) * drive * personality.growth * (0.6 + playingTime * 0.7) * roomFactor;
    return Math.min(room, gain);
  }
  if (player.age <= 27) {
    const gain = rng.float(0.5, 6) * drive * personality.growth * (0.45 + playingTime * 0.8) * roomFactor;
    return Math.min(room, gain);
  }
  if (player.age <= 30) return rng.float(-3, 1.5) * (0.6 + playingTime * 0.5);
  if (player.age <= 33) return rng.float(-8, -1);
  return rng.float(-14, -4);
}

/** CA 변화를 능력치에 반영합니다. 나이 들면 신체 능력이 먼저 무너집니다. */
function applyCaChange(player: Player, newCa: number, rng: Rng): void {
  const oldBase = caToBase(player.ca);
  const newBase = caToBase(newCa);
  const scale = newBase / Math.max(0.1, oldBase);
  const declining = newCa < player.ca;

  const groupScale = (key: AttributeKey): number => {
    if (!declining) {
      // 성장기에는 정신 능력이 조금 더 잘 오릅니다.
      return GROUP_KEYS.mental.includes(key) ? scale * 1.03 : scale;
    }
    if (GROUP_KEYS.physical.includes(key)) return scale * 0.94;
    if (GROUP_KEYS.mental.includes(key)) return Math.min(1.01, scale * 1.06);
    return scale;
  };

  for (const key of Object.keys(player.attributes) as AttributeKey[]) {
    const target = player.attributes[key] * groupScale(key) + rng.float(-0.35, 0.35);
    player.attributes[key] = clamp(Math.round(target), 1, 20);
  }
  player.ca = clamp(Math.round(newCa), 20, 200);
}

function shouldRetire(player: Player, rng: Rng): boolean {
  if (player.age >= 40) return true;
  if (player.age < 32) return false;
  const lowMinutes = player.season.minutes < 500;
  const chance = (player.age - 31) * 0.12 + (lowMinutes ? 0.18 : 0) + (player.ca < 70 ? 0.12 : 0);
  return rng.bool(clamp(chance, 0, 0.9));
}

/**
 * 유스 충원 나이. 대부분은 아카데미에서 올라오지만, 일부는 하부 리그에서
 * 데려온 성인 선수입니다. 이 비율이 어긋나면 세계 평균 연령이 시즌마다
 * 내려앉습니다.
 */
function intakeAge(rng: Rng): number {
  const roll = rng.next();
  if (roll < 0.52) return rng.int(16, 19);
  if (roll < 0.82) return rng.int(20, 23);
  return rng.int(24, 28);
}

/** 한 시즌 동안 자란 의뢰인. 소식함에 올릴 재료입니다. */
export interface GrowthReport {
  playerId: string;
  playerName: string;
  caGain: number;
  /** 가장 많이 오른 능력치 몇 개. */
  improved: Array<{ label: string; from: number; to: number }>;
}

export interface RolloverResult {
  retired: Player[];
  growth: GrowthReport[];
  loansEnded: LoanReturn[];
}

/**
 * 시즌을 넘깁니다. 나이·성장·은퇴·계약 만료·유스 충원·새 일정까지 한 번에.
 */
export function rolloverSeason(state: GameState, rng: Rng): RolloverResult {
  const names = new NameFactory((items) => rng.pick(items));
  const retired: Player[] = [];
  const growth: GrowthReport[] = [];

  // 임대는 다른 무엇보다 먼저 정리합니다 — 이 아래의 계약·방출 처리가 전부
  // 소속 구단을 기준으로 도는데, 임대 중인 선수는 계약과 소속이 갈려 있습니다.
  const loansEnded = returnLoans(state);

  for (const player of Object.values(state.players)) {
    if (player.retired) continue;
    const isClient = Boolean(state.clients[player.id]);
    const caBefore = player.ca;
    const attributesBefore = isClient ? { ...player.attributes } : null;

    // 통산 기록 적립 후 시즌 기록 초기화
    player.career.apps += player.season.apps;
    player.career.subApps += player.season.subApps;
    player.career.minutes += player.season.minutes;
    player.career.goals += player.season.goals;
    player.career.assists += player.season.assists;
    player.career.cleanSheets += player.season.cleanSheets;
    player.career.conceded += player.season.conceded;
    player.career.ratingSum += player.season.ratingSum;
    player.career.yellow += player.season.yellow;
    player.career.red += player.season.red;
    player.career.motm += player.season.motm;
    if (player.season.apps > 0) player.career.seasons += 1;

    player.age += 1;
    applyCaChange(player, player.ca + caDelta(player, rng), rng);

    if (attributesBefore && player.ca - caBefore >= 2) {
      const improved = (Object.keys(player.attributes) as AttributeKey[])
        .map((key) => ({ key, gain: player.attributes[key] - attributesBefore[key] }))
        .filter((entry) => entry.gain > 0)
        .sort((a, b) => b.gain - a.gain)
        .slice(0, 3)
        .map((entry) => ({
          label: ATTRIBUTE_BY_KEY[entry.key].label,
          from: attributesBefore[entry.key],
          to: player.attributes[entry.key],
        }));
      growth.push({
        playerId: player.id,
        playerName: player.name,
        caGain: player.ca - caBefore,
        improved,
      });
    }

    player.season = { apps: 0, subApps: 0, minutes: 0, goals: 0, assists: 0, cleanSheets: 0, conceded: 0, ratingSum: 0, yellow: 0, red: 0, motm: 0 };
    player.compStats = {};
    player.fitness = 100;
    player.injuredWeeks = 0;
    player.form = clamp(player.form * 0.5 + 25, 20, 80);

    if (shouldRetire(player, rng)) {
      player.retired = true;
      player.value = 0;
      if (player.clubId) removeFromClub(state, player);
      player.contract = null;
      retired.push(player);
      continue;
    }
    player.value = estimateValue(player);
  }

  // 계약 만료 → 재계약 또는 자유계약. 그 뒤 아카데미가 새 세대를 올려
  // 보내고, 남는 선수를 정리한 다음, 구단들이 시장에 나온 선수를 줍습니다.
  // 이 순서를 지켜야 스쿼드가 유스로만 채워지지도, 노장으로만 남지도 않습니다.
  processExpiries(state, rng);
  runAcademyIntake(state, rng);
  trimOversizedSquads(state, rng);
  retireStaleFreeAgents(state, rng);
  signFreeAgents(state, rng, SQUAD_SIZE - 2);

  // 구단별 스쿼드 정리 — 그래도 모자라면 유스로 채웁니다.
  let youthIndex = 900000;
  for (const club of Object.values(state.clubs)) {
    club.playerIds = club.playerIds.filter((id) => {
      const player = state.players[id];
      return player && !player.retired && player.clubId === club.id;
    });
    const country = countryOfClub(club);
    if (!country) continue;
    // 골키퍼는 대체가 안 되므로 인원수보다 먼저 확인합니다.
    const keeperCount = () => club.playerIds.filter((id) => state.players[id]?.group === 'GK').length;

    while (club.playerIds.length < SQUAD_SIZE - 2 || keeperCount() < 2) {
      const player = generatePlayer({
        rng, names, country,
        role: keeperCount() < 2 ? 'GK' : neededRole(club, state.players, rng),
        // 초기 스쿼드와 같은 체급 곡선을 씁니다. 이걸 낮게 잡으면 시즌이
        // 갈수록 세계 전체의 상한이 내려앉습니다.
        targetCa: clamp(22 + country.reputation * 0.72 + club.reputation * 0.62 - 12, 20, 190),
        age: intakeAge(rng),
        idPrefix: `y${state.season}-${club.id}-`,
        index: youthIndex++,
      });
      const wage = expectedWage(player, club.reputation * 0.5, country);
      player.clubId = club.id;
      player.contract = {
        clubId: club.id,
        wage: Math.max(0.4, Math.round(wage * 0.35 * 10) / 10),
        expires: state.season + 1 + rng.int(2, 4),
        releaseClause: 0,
        agentFeePct: 4,
        brokeredBy: null,
        signedSeason: state.season + 1,
      };
      player.value = estimateValue(player);
      state.players[player.id] = player;
      club.playerIds.push(player.id);
    }
    // 명성과 예산 재설정 — 성적에 따라 오르내립니다.
    const placement = club.lastPosition > 0 ? club.lastPosition : club.expectation;
    const overPerformance = clamp((club.expectation - placement) / 10, -0.3, 0.4);
    club.reputation = clamp(Math.round(club.reputation + overPerformance * 6), 12, 99);
    setClubFinances(club, state.players, country.wageFactor, rng.float(0.85, 1.2) * (1 + overPerformance * 0.25));
  }

  applyPromotions(state);

  // 새 시즌 달력
  state.season += 1;
  state.week = 1;
  state.phase = 'preseason';
  state.lastWeekResults = [];

  for (const league of Object.values(state.leagues)) {
    league.fixtures = buildLeagueFixtures(rng, league.competitionId, league.clubIds);
    league.table = Object.fromEntries(league.clubIds.map((clubId) => [clubId, {
      clubId, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0,
    }]));
    league.championId = undefined;
  }

  // 대륙 대항전 재구성 — 지난 시즌 최종 순위로 출전권을 나눕니다.
  state.cups = {};
  for (const continentId of CONTINENT_ORDER) {
    const continent = CONTINENTS[continentId];
    const entrants = continentalEntrants(continentId, state.countryIds, state.leagues, state.clubs, state.players);
    if (entrants.length < 2) continue;
    const competitionId = `ct:${continentId}`;
    state.cups[competitionId] = createCup(
      competitionId, continentId, entrants.slice(0, continent.cupSize), CONTINENTAL_FINAL_WEEK, 6,
    );
  }

  return { retired, growth, loansEnded };
}

/**
 * 아카데미 승격. 구단마다 매 시즌 한두 명이 1군에 올라옵니다.
 * 자리가 남을 때만 뽑으면 강팀 아카데미가 놀아서 세계의 재능 공급이 마릅니다.
 */
function runAcademyIntake(state: GameState, rng: Rng): number {
  const names = new NameFactory((items) => rng.pick(items));
  let index = 0;
  let made = 0;
  for (const club of Object.values(state.clubs)) {
    const country = countryOfClub(club);
    if (!country) continue;
    const count = rng.bool(0.45 + club.reputation / 320) ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const player = generatePlayer({
        rng, names, country,
        role: neededRole(club, state.players, rng),
        // 초기 스쿼드와 같은 체급 곡선. 낮게 잡으면 세대가 바뀔수록
        // 세계 전체의 상한이 내려앉습니다.
        targetCa: clamp(22 + country.reputation * 0.72 + club.reputation * 0.62 - 12, 20, 190),
        age: rng.int(16, 19),
        idPrefix: `a${state.season}-${club.id}-`,
        index: index++,
      });
      const wage = expectedWage(player, club.reputation * 0.5, country);
      player.clubId = club.id;
      player.contract = {
        clubId: club.id,
        wage: Math.max(0.4, Math.round(wage * 0.35 * 10) / 10),
        expires: state.season + rng.int(3, 5),
        releaseClause: 0,
        agentFeePct: 4,
        brokeredBy: null,
        signedSeason: state.season,
      };
      player.value = estimateValue(player);
      state.players[player.id] = player;
      club.playerIds.push(player.id);
      made++;
    }
  }
  return made;
}

/** 정원을 넘긴 스쿼드에서 기여도가 낮은 선수를 방출합니다. */
function trimOversizedSquads(state: GameState, rng: Rng): number {
  let released = 0;
  for (const club of Object.values(state.clubs)) {
    const limit = SQUAD_SIZE + 3;
    if (club.playerIds.length <= limit) continue;
    const ranked = club.playerIds
      .map((id) => state.players[id])
      .filter((p): p is Player => Boolean(p))
      // 유망주는 남기고, 나이 많고 능력이 처지는 선수부터 내보냅니다.
      .sort((a, b) => (a.ca + (a.pa - a.ca) * 0.8 - a.age) - (b.ca + (b.pa - b.ca) * 0.8 - b.age));
    const keepers = club.playerIds.filter((id) => state.players[id]?.group === 'GK').length;
    let toRelease = club.playerIds.length - limit;
    for (const player of ranked) {
      if (toRelease <= 0) break;
      if (player.group === 'GK' && keepers <= 2) continue;
      if (rng.bool(0.15)) continue;
      club.playerIds = club.playerIds.filter((id) => id !== player.id);
      player.clubId = null;
      player.contract = null;
      player.value = estimateValue(player);
      toRelease--;
      released++;
    }
  }
  return released;
}

/**
 * 승격과 강등.
 *
 * 본거지 국가의 인접한 두 부 사이에서 위 리그 최하위 세 팀과 아래 리그 상위
 * 세 팀을 맞바꿉니다. 4부 무명 구단의 선수를 1부로 올려 보내는 경로가 실제로
 * 존재해야 하부 리그에서 시작하는 의미가 생깁니다.
 */
function applyPromotions(state: GameState): void {
  const ordered = Object.values(state.leagues)
    .filter((league) => league.countryId === state.homeCountryId)
    .sort((a, b) => a.tier - b.tier);

  for (let i = 0; i + 1 < ordered.length; i++) {
    const upper = ordered[i];
    const lower = ordered[i + 1];
    const upperRanked = Object.values(upper.table).slice().sort(compareTableRows).map((r) => r.clubId);
    const lowerRanked = Object.values(lower.table).slice().sort(compareTableRows).map((r) => r.clubId);

    const slots = Math.min(PROMOTION_SLOTS, upperRanked.length, lowerRanked.length);
    if (slots === 0) continue;
    const relegated = upperRanked.slice(-slots);
    const promoted = lowerRanked.slice(0, slots);

    upper.clubIds = upper.clubIds.filter((id) => !relegated.includes(id)).concat(promoted);
    lower.clubIds = lower.clubIds.filter((id) => !promoted.includes(id)).concat(relegated);

    for (const clubId of promoted) {
      const club = state.clubs[clubId];
      if (!club) continue;
      club.tier = upper.tier;
      // 승격하면 몸값과 수입이 함께 오릅니다.
      club.reputation = clamp(Math.round(club.reputation * 1.18 + 4), 6, 99);
    }
    for (const clubId of relegated) {
      const club = state.clubs[clubId];
      if (!club) continue;
      club.tier = lower.tier;
      club.reputation = clamp(Math.round(club.reputation * 0.82 - 2), 6, 99);
    }
  }

  // 부가 바뀌었으니 이사회 기대 순위를 리그별로 다시 매깁니다.
  for (const league of Object.values(state.leagues)) {
    league.clubIds
      .map((id) => state.clubs[id])
      .filter((club): club is Club => Boolean(club))
      .sort((a, b) => b.reputation - a.reputation)
      .forEach((club, index) => { club.expectation = index + 1; });
  }
}

function removeFromClub(state: GameState, player: Player): void {
  const club = player.clubId ? state.clubs[player.clubId] : null;
  if (club) club.playerIds = club.playerIds.filter((id) => id !== player.id);
  player.clubId = null;
}

/** 스쿼드에서 가장 부족한 포지션. */
function neededRole(club: Club, players: Record<string, Player>, rng: Rng) {
  const counts: Record<string, number> = {};
  for (const id of club.playerIds) {
    const player = players[id];
    if (player) counts[player.group] = (counts[player.group] ?? 0) + 1;
  }
  if ((counts.GK ?? 0) < 3) return 'GK' as const;
  if ((counts.DF ?? 0) < 8) return rng.pick(['DC', 'DR', 'DL'] as const);
  if ((counts.MF ?? 0) < 7) return rng.pick(['DM', 'MC', 'MR', 'ML'] as const);
  return rng.pick(['AMC', 'AMR', 'AML', 'ST'] as const);
}

/** 시즌이 끝났는지. */
export const isSeasonOver = (week: number): boolean => week > SEASON_WEEKS;
export const isAwardsWeek = (week: number): boolean => week === AWARDS_WEEK;
