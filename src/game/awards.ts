/**
 * 개인 수상.
 *
 * 리그별(득점왕·도움왕·올해의 선수·영플레이어·골든글러브), 대륙별(대륙 올해의
 * 선수·대륙컵 득점왕), 세계 단위(세계 올해의 선수·세계 영플레이어·세계
 * 득점왕)로 나뉩니다. 점수는 대회 수준(prestige)으로 가중되기 때문에 약한
 * 리그에서 40골을 넣어도 강한 리그의 25골을 이기기 어렵습니다.
 */

import { COUNTRY_BY_ID, CONTINENTS, type ContinentId } from '../data/countries';
import type {
  AwardId, AwardWinner, Club, Competition, CompStat, Player,
} from './types';

export const AWARD_LABELS: Record<AwardId, string> = {
  'top-scorer': '득점왕',
  'top-assists': '도움왕',
  'player-of-year': '올해의 선수',
  'young-player': '영플레이어',
  'golden-glove': '골든글러브',
  'continental-player': '대륙 올해의 선수',
  'continental-scorer': '대륙컵 득점왕',
  'world-player': '세계 올해의 선수',
  'world-young-player': '세계 영플레이어',
  'world-scorer': '세계 득점왕',
};

/** 영플레이어 기준 나이. 시즌 종료 시점 기준입니다. */
export const YOUNG_PLAYER_MAX_AGE = 21;

export interface AwardsInput {
  season: number;
  players: Record<string, Player>;
  clubs: Record<string, Club>;
  competitions: Record<string, Competition>;
  /** 플레이어의 의뢰인 선수 id 집합. 수상 기록에 표시합니다. */
  clientIds: Set<string>;
}

const avgRating = (stat: CompStat): number => (stat.apps > 0 ? stat.ratingSum / stat.apps : 0);

/** 한 대회에서의 활약 점수. */
function compScore(stat: CompStat, prestige: number): number {
  if (stat.apps === 0) return 0;
  const weight = prestige / 70;
  const production = stat.goals * 3.2 + stat.assists * 2.2 + stat.cleanSheets * 1.4;
  const quality = (avgRating(stat) - 6.3) * stat.apps * 0.9;
  return (production + quality) * weight;
}

/** 이번 시즌 전체 활약 점수. 대회별 가중치를 모두 더합니다. */
export function seasonScore(player: Player, competitions: Record<string, Competition>): number {
  let total = 0;
  for (const [competitionId, stat] of Object.entries(player.compStats)) {
    const competition = competitions[competitionId];
    if (!competition) continue;
    total += compScore(stat, competition.prestige);
  }
  return total;
}

function makeWinner(
  input: AwardsInput, awardId: AwardId, player: Player, value: number,
  extra: { competitionId?: string; continentId?: ContinentId } = {},
): AwardWinner {
  const club = player.clubId ? input.clubs[player.clubId] : undefined;
  return {
    awardId,
    season: input.season,
    competitionId: extra.competitionId,
    continentId: extra.continentId,
    playerId: player.id,
    playerName: player.name,
    clubName: club?.name ?? '무소속',
    value: Math.round(value * 10) / 10,
    wasClient: input.clientIds.has(player.id),
  };
}

/** 조건을 만족하는 후보 중 점수가 가장 높은 한 명. */
function best<T>(items: T[], score: (item: T) => number): T | null {
  let winner: T | null = null;
  let bestScore = -Infinity;
  for (const item of items) {
    const value = score(item);
    if (value > bestScore) { bestScore = value; winner = item; }
  }
  return bestScore > 0 ? winner : null;
}

/** 한 대회(리그)의 개인상. */
function leagueAwards(input: AwardsInput, competition: Competition): AwardWinner[] {
  const compId = competition.id;
  const pool = Object.values(input.players).filter((p) => (p.compStats[compId]?.apps ?? 0) >= 8);
  if (pool.length === 0) return [];
  const out: AwardWinner[] = [];

  const scorer = best(pool, (p) => p.compStats[compId].goals);
  if (scorer && scorer.compStats[compId].goals > 0) {
    out.push(makeWinner(input, 'top-scorer', scorer, scorer.compStats[compId].goals, { competitionId: compId }));
  }

  const assister = best(pool, (p) => p.compStats[compId].assists);
  if (assister && assister.compStats[compId].assists > 0) {
    out.push(makeWinner(input, 'top-assists', assister, assister.compStats[compId].assists, { competitionId: compId }));
  }

  const keeper = best(pool.filter((p) => p.group === 'GK'), (p) => p.compStats[compId].cleanSheets);
  if (keeper) {
    out.push(makeWinner(input, 'golden-glove', keeper, keeper.compStats[compId].cleanSheets, { competitionId: compId }));
  }

  const poty = best(pool, (p) => compScore(p.compStats[compId], competition.prestige));
  if (poty) {
    out.push(makeWinner(input, 'player-of-year', poty, compScore(poty.compStats[compId], competition.prestige), { competitionId: compId }));
  }

  const young = best(pool.filter((p) => p.age <= YOUNG_PLAYER_MAX_AGE),
    (p) => compScore(p.compStats[compId], competition.prestige));
  if (young) {
    out.push(makeWinner(input, 'young-player', young, compScore(young.compStats[compId], competition.prestige), { competitionId: compId }));
  }

  return out;
}

/** 한 대륙의 개인상. 그 대륙 리그에 뛴 선수 전체가 후보입니다. */
function continentalAwards(input: AwardsInput, continentId: ContinentId, cupCompetitionId: string): AwardWinner[] {
  const out: AwardWinner[] = [];
  const inContinent = (player: Player): boolean => {
    const club = player.clubId ? input.clubs[player.clubId] : undefined;
    if (!club) return false;
    return COUNTRY_BY_ID[club.countryId]?.continent === continentId;
  };

  const cupPool = Object.values(input.players).filter((p) => (p.compStats[cupCompetitionId]?.apps ?? 0) >= 2);
  const cupScorer = best(cupPool, (p) => p.compStats[cupCompetitionId].goals);
  if (cupScorer && cupScorer.compStats[cupCompetitionId].goals > 0) {
    out.push(makeWinner(input, 'continental-scorer', cupScorer, cupScorer.compStats[cupCompetitionId].goals, {
      competitionId: cupCompetitionId, continentId,
    }));
  }

  const pool = Object.values(input.players).filter(inContinent);
  const poty = best(pool, (p) => seasonScore(p, input.competitions));
  if (poty) {
    out.push(makeWinner(input, 'continental-player', poty, seasonScore(poty, input.competitions), { continentId }));
  }
  return out;
}

/** 세계 단위 3개 상. */
function worldAwards(input: AwardsInput): AwardWinner[] {
  const out: AwardWinner[] = [];
  const pool = Object.values(input.players).filter((p) => p.season.apps >= 10);
  if (pool.length === 0) return out;

  const scorer = best(pool, (p) => p.season.goals);
  if (scorer && scorer.season.goals > 0) {
    out.push(makeWinner(input, 'world-scorer', scorer, scorer.season.goals));
  }

  const poty = best(pool, (p) => seasonScore(p, input.competitions));
  if (poty) out.push(makeWinner(input, 'world-player', poty, seasonScore(poty, input.competitions)));

  const young = best(pool.filter((p) => p.age <= YOUNG_PLAYER_MAX_AGE),
    (p) => seasonScore(p, input.competitions));
  if (young) out.push(makeWinner(input, 'world-young-player', young, seasonScore(young, input.competitions)));

  return out;
}

/** 시즌이 끝난 뒤 모든 개인상을 한 번에 계산합니다. */
export function computeSeasonAwards(input: AwardsInput): AwardWinner[] {
  const winners: AwardWinner[] = [];

  for (const competition of Object.values(input.competitions)) {
    if (competition.kind === 'league') winners.push(...leagueAwards(input, competition));
  }
  for (const competition of Object.values(input.competitions)) {
    if (competition.kind === 'continental' && competition.continentId) {
      winners.push(...continentalAwards(input, competition.continentId, competition.id));
    }
  }
  winners.push(...worldAwards(input));
  return winners;
}

/** 수상 내역을 선수 개인 이력에 새깁니다. */
export function recordHonours(
  winners: AwardWinner[], players: Record<string, Player>, competitions: Record<string, Competition>,
): void {
  for (const winner of winners) {
    const player = players[winner.playerId];
    if (!player) continue;
    const scope = winner.competitionId
      ? competitions[winner.competitionId]?.shortName ?? ''
      : winner.continentId ? CONTINENTS[winner.continentId].name : '세계';
    const label = `${scope} ${AWARD_LABELS[winner.awardId]}`.trim();
    player.honours.push({ season: winner.season, label, competitionId: winner.competitionId });
  }
}
