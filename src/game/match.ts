/**
 * 경기 해석.
 *
 * 에이전트 게임에서는 한 주에 수백 경기가 동시에 돌아가므로 분 단위 중계를
 * 만들지 않습니다. 대신 팀 전력에서 기대 득점을 뽑고 포아송으로 스코어를
 * 정한 뒤, 득점·도움·평점을 선수에게 배분합니다. 개인 수상이 이 배분 위에
 * 얹히기 때문에 "누가 넣었는가"는 스코어만큼 중요합니다.
 */

import { Rng, clamp } from './rng';
import type { TeamSnapshot } from './ratings';
import type { CompStat, Fixture, Player } from './types';

/** 평균 팀끼리 붙었을 때의 기대 득점. */
const BASE_XG = 1.35;
const HOME_ADVANTAGE = 1.08;

export interface MatchContext {
  players: Record<string, Player>;
  rng: Rng;
  /** 기록을 적립할 대회 id. */
  competitionId: string;
  /** 승부차기까지 가야 하는 경기인지. */
  knockout?: boolean;
  /** 대회 중요도 1-100. 사기·폼 변동 폭에 반영됩니다. */
  prestige?: number;
}

export interface MatchResult {
  homeGoals: number;
  awayGoals: number;
  shootout?: [number, number];
  /** 최고 평점 선수. */
  motmId: string | null;
}

/** 대회별 누적 기록 슬롯을 꺼냅니다. 없으면 만들어 둡니다. */
function compStat(player: Player, competitionId: string): CompStat {
  let stat = player.compStats[competitionId];
  if (!stat) {
    stat = { apps: 0, goals: 0, assists: 0, cleanSheets: 0, ratingSum: 0 };
    player.compStats[competitionId] = stat;
  }
  return stat;
}

function poisson(rng: Rng, lambda: number): number {
  // Knuth 방식. lambda 가 작아 반복 횟수가 적습니다.
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng.next();
  } while (p > limit && k < 12);
  return k - 1;
}

function expectedGoals(attack: number, defence: number, advantage: number): number {
  const ratio = Math.pow((attack * advantage) / Math.max(25, defence), 1.15);
  return clamp(BASE_XG * ratio, 0.15, 5);
}

function pickWeighted(rng: Rng, weights: Array<{ id: string; w: number }>): string | null {
  if (weights.length === 0) return null;
  let roll = rng.next();
  for (const item of weights) {
    roll -= item.w;
    if (roll <= 0) return item.id;
  }
  return weights[weights.length - 1].id;
}

/**
 * 경기를 치르고 fixture 와 선수 기록을 갱신합니다.
 * 승부차기는 knockout 경기가 무승부로 끝났을 때만 돌립니다.
 */
export function playMatch(
  fixture: Fixture,
  home: TeamSnapshot,
  away: TeamSnapshot,
  ctx: MatchContext,
): MatchResult {
  const { rng, players } = ctx;
  const xgHome = expectedGoals(home.attack, away.defence, HOME_ADVANTAGE);
  const xgAway = expectedGoals(away.attack, home.defence, 1 / HOME_ADVANTAGE);

  const homeGoals = poisson(rng, xgHome);
  const awayGoals = poisson(rng, xgAway);

  fixture.homeGoals = homeGoals;
  fixture.awayGoals = awayGoals;
  fixture.played = true;

  let shootout: [number, number] | undefined;
  if (ctx.knockout && homeGoals === awayGoals) {
    // 승부차기 — 침착성 평균이 높은 쪽이 조금 유리합니다.
    let h = 0;
    let a = 0;
    while (h === a) {
      h = rng.int(3, 6);
      a = rng.int(3, 6);
      if (h === a) { h += rng.bool(0.5) ? 1 : 0; a += h === a ? 1 : 0; }
    }
    shootout = [h, a];
    fixture.shootout = shootout;
  }

  const ratings = new Map<string, number>();
  settleSide(home, away, homeGoals, awayGoals, ctx, ratings);
  settleSide(away, home, awayGoals, homeGoals, ctx, ratings);

  let motmId: string | null = null;
  let best = -Infinity;
  for (const [id, rating] of ratings) {
    if (rating > best) { best = rating; motmId = id; }
  }
  if (motmId && players[motmId]) players[motmId].season.motm += 1;

  return { homeGoals, awayGoals, shootout, motmId };
}

/** 한쪽 팀의 출전 기록·득점·도움·평점·카드·부상을 정리합니다. */
function settleSide(
  side: TeamSnapshot,
  opponent: TeamSnapshot,
  scored: number,
  conceded: number,
  ctx: MatchContext,
  ratings: Map<string, number>,
): void {
  const { rng, players } = ctx;
  const prestige = ctx.prestige ?? 50;

  // 교체 3명 — 선발 셋이 일찍 나가고 벤치 셋이 들어옵니다.
  const subsOn = side.bench.slice(0, 3).filter((id) => players[id]);
  const subbedOff = new Set<string>();
  const outfieldStarters = side.xi.slice(1);
  for (let i = 0; i < subsOn.length && outfieldStarters.length > 0; i++) {
    const target = outfieldStarters[rng.int(0, outfieldStarters.length - 1)];
    if (target) subbedOff.add(target);
  }

  const goalScorers: string[] = [];
  for (let i = 0; i < scored; i++) {
    const id = pickWeighted(rng, side.goalWeights);
    if (id) goalScorers.push(id);
  }

  const result = scored > conceded ? 'win' : scored === conceded ? 'draw' : 'loss';
  const resultBonus = result === 'win' ? 0.35 : result === 'draw' ? 0 : -0.3;

  side.xi.forEach((id, index) => {
    const player = players[id];
    if (!player) return;
    const minutes = subbedOff.has(id) ? rng.int(55, 80) : 90;
    player.season.apps += 1;
    player.season.minutes += minutes;

    if (index === 0) {
      player.season.conceded += conceded;
      if (conceded === 0) player.season.cleanSheets += 1;
    }

    const goals = goalScorers.filter((g) => g === id).length;
    player.season.goals += goals;

    const stat = compStat(player, ctx.competitionId);
    stat.apps += 1;
    stat.goals += goals;
    if (index === 0 && conceded === 0) stat.cleanSheets += 1;

    let rating = 6.35 + rng.float(-0.55, 0.55) + resultBonus;
    rating += goals * 0.95;
    if (index === 0) rating += conceded === 0 ? 0.55 : -0.18 * conceded;
    // 팀 전력 차가 크면 약팀 선수의 평점이 더 흔들립니다.
    rating += clamp((side.attack - opponent.attack) / 220, -0.25, 0.25);

    applyCardsAndInjury(player, rng, minutes);
    stat.ratingSum += rating;
    player.season.ratingSum += rating;
    ratings.set(id, rating);
    updateCondition(player, minutes, rating, prestige);
  });

  // 도움 — 득점자와 다른 선수가 붙습니다. 모든 골에 도움이 있지는 않습니다.
  for (const scorerId of goalScorers) {
    if (!rng.bool(0.72)) continue;
    for (let attempt = 0; attempt < 4; attempt++) {
      const id = pickWeighted(rng, side.assistWeights);
      if (id && id !== scorerId && players[id]) {
        const assistStat = compStat(players[id], ctx.competitionId);
        players[id].season.assists += 1;
        assistStat.assists += 1;
        const current = ratings.get(id);
        if (current !== undefined) ratings.set(id, current + 0.45);
        players[id].season.ratingSum += 0.45;
        assistStat.ratingSum += 0.45;
        break;
      }
    }
  }

  for (const id of subsOn) {
    const player = players[id];
    if (!player) continue;
    const minutes = rng.int(10, 32);
    // apps 는 **총 출전 수**입니다. 교체로 뛴 경기도 여기 포함되어야
    // ratingSum / apps 가 평점이 됩니다. 교체 출전을 빼먹으면 선발 한 번에
    // 교체 일곱 번을 뛴 선수의 평점이 50점대로 튑니다.
    player.season.apps += 1;
    player.season.subApps += 1;
    player.season.minutes += minutes;
    const rating = 6.3 + rng.float(-0.4, 0.6) + resultBonus * 0.5;
    const subStat = compStat(player, ctx.competitionId);
    subStat.apps += 1;
    subStat.ratingSum += rating;
    player.season.ratingSum += rating;
    ratings.set(id, rating);
    updateCondition(player, minutes, rating, prestige);
  }
}

function applyCardsAndInjury(player: Player, rng: Rng, minutes: number): void {
  const aggression = player.attributes.aggression;
  const yellowChance = 0.055 + (aggression / 20) * 0.10;
  if (rng.bool(yellowChance * (minutes / 90))) {
    player.season.yellow += 1;
    if (rng.bool(0.05)) player.season.red += 1;
  }
  // 부상 — 타고난 체력이 높으면 덜 다칩니다.
  const injuryChance = 0.016 * (1.5 - player.attributes.naturalFitness / 20) * (minutes / 90);
  if (rng.bool(injuryChance)) {
    player.injuredWeeks = rng.bool(0.75) ? rng.int(1, 4) : rng.int(5, 16);
  }
}

/** 경기 후 체력·폼·사기 갱신. */
function updateCondition(player: Player, minutes: number, rating: number, prestige: number): void {
  const drain = (minutes / 90) * (26 - (player.attributes.stamina / 20) * 10);
  player.fitness = clamp(player.fitness - drain, 8, 100);

  // 폼은 최근 평점을 따라 천천히 움직입니다.
  const target = clamp((rating - 5.5) * 45, 0, 100);
  player.form = clamp(player.form * 0.72 + target * 0.28, 0, 100);

  const weight = 0.35 + (prestige / 100) * 0.35;
  const moraleShift = (rating - 6.5) * 4 * weight;
  player.morale = clamp(player.morale + moraleShift, 0, 100);
}
