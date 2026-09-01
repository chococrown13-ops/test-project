/**
 * 주간 진행 오케스트레이터.
 *
 * 경기 → 회복 → AI 이적 → 의뢰인 → 협상 → 정산 → 뉴스 순서로 한 주를
 * 넘깁니다. UI 는 이 함수 하나만 호출하면 됩니다.
 */

import { Rng } from './rng';
import {
  ensureWorldCup, finishSeason, isGrowthWeek, playWeek, rolloverSeason, trainingTick,
  weeklyRecovery, type GrowthReport,
} from './season';
import { runAiTransfers } from './market';
import { weeklyClientTick } from './clients';
import { weeklyNegotiationTick } from './negotiation';
import { settleWeeklyFinance } from './agent';
import { replenishScoutPoints } from './scouting';
import { AWARD_LABELS } from './awards';
import {
  AWARDS_WEEK, SEASON_WEEKS, isWindowOpen,
  type GameState, type NewsItem,
} from './types';

let newsCounter = 0;

export function pushNews(state: GameState, item: Omit<NewsItem, 'id' | 'season' | 'week' | 'read'>): void {
  state.news.unshift({
    ...item,
    id: `w${state.season}-${state.week}-${newsCounter++}`,
    season: state.season,
    week: state.week,
    read: false,
  });
  if (state.news.length > 300) state.news.length = 300;
}

export interface WeekReport {
  week: number;
  season: number;
  /** 이번 주에 새로 생긴 소식 수. */
  newsCount: number;
  seasonRolled: boolean;
  awarded: boolean;
}

/** 한 주를 진행합니다. */
export function advanceWeek(state: GameState, rng: Rng): WeekReport {
  const before = state.news.length;
  const windowOpen = isWindowOpen(state.week);

  state.phase = state.week <= 4 ? 'preseason' : state.week >= AWARDS_WEEK ? 'awards' : 'season';

  ensureWorldCup(state, rng);
  const results = playWeek(state, rng);
  state.lastWeekResults = results;
  weeklyRecovery(state);
  replenishScoutPoints(state);

  reportClientMatches(state);

  // 4주에 한 번 훈련 성과를 반영합니다. 시즌이 끝나야 알 수 있으면
  // 에이전트는 반 시즌 내내 의뢰인이 자라는지도 모른 채 지나갑니다.
  if (isGrowthWeek(state.week)) reportGrowth(state, trainingTick(state, rng));

  if (windowOpen) {
    const deals = runAiTransfers(state, rng, rng.int(2, 6));
    for (const deal of deals) {
      // 큰 거래만 뉴스로 올립니다. 그러지 않으면 소식함이 잡음으로 찹니다.
      if (deal.fee < 12000) continue;
      pushNews(state, {
        category: 'transfer',
        title: `${deal.playerName}, ${state.clubs[deal.toClubId].name} 행`,
        body: `${state.clubs[deal.fromClubId].name} 에서 ${state.clubs[deal.toClubId].name} 으로 이적료 ${formatMoney(deal.fee)} 에 이적했습니다.`,
        tone: 'neutral',
        playerId: deal.playerId,
        clubId: deal.toClubId,
      });
    }
  }

  for (const event of weeklyClientTick(state, rng)) {
    pushNews(state, {
      category: 'client',
      title: event.kind === 'demand' ? '의뢰인의 요구' : event.kind === 'left' ? '의뢰인이 떠났습니다' : '의뢰인 소식',
      body: event.text,
      tone: event.kind === 'demand' ? 'neutral' : 'bad',
      playerId: event.playerId,
    });
  }

  for (const event of weeklyNegotiationTick(state, rng, windowOpen)) {
    pushNews(state, {
      category: 'transfer',
      title: event.kind === 'inbound' ? '영입 문의' : '협상 종료',
      body: event.text,
      tone: event.kind === 'inbound' ? 'good' : 'bad',
      playerId: event.playerId,
    });
  }

  const finance = settleWeeklyFinance(state);
  if (state.week % 4 === 0) {
    pushNews(state, {
      category: 'finance',
      title: '주간 정산',
      body: `수수료 수입 ${formatMoney(finance.income)}, 운영비 ${formatMoney(finance.expenses)}. 현재 잔고 ${formatMoney(state.agent.cash)}.`,
      tone: state.agent.cash < 0 ? 'bad' : 'neutral',
    });
  }

  if (windowOpen && state.week === 1) {
    pushNews(state, { category: 'system', title: '여름 이적시장이 열렸습니다', body: '지금부터 이적 협상을 시작할 수 있습니다.', tone: 'good' });
  }
  if (windowOpen && state.week === 23) {
    pushNews(state, { category: 'system', title: '겨울 이적시장이 열렸습니다', body: '짧은 창구입니다. 서두르세요.', tone: 'good' });
  }

  // 이적시장이 닫힌 구간에도 세계가 돌아간다는 느낌이 있어야 합니다.
  if (state.week % 4 === 2 && state.week > 6) reportLeagueHighlight(state, rng);

  let awarded = false;
  if (state.week === AWARDS_WEEK) {
    const { history } = finishSeason(state);
    awarded = true;
    reportAwards(state);
    for (const [leagueId, clubId] of Object.entries(history.leagueChampions)) {
      const league = state.leagues[leagueId];
      const competition = league ? state.competitions[league.competitionId] : undefined;
      if (!competition) continue;
      pushNews(state, {
        category: 'league',
        title: `${competition.name} 우승`,
        body: `${state.clubs[clubId]?.name ?? ''} 이(가) 리그를 제패했습니다.`,
        tone: 'neutral',
        clubId,
      });
    }
  }

  let seasonRolled = false;
  state.week += 1;
  if (state.week > SEASON_WEEKS) {
    const rollover = rolloverSeason(state, rng);
    seasonRolled = true;
    for (const loan of rollover.loansEnded) {
      if (!state.clients[loan.playerId]) continue;
      pushNews(state, {
        category: 'client',
        title: '임대 복귀',
        body: `${loan.playerName} 이(가) ${loan.parentName} 으로 돌아왔습니다. 임대 기간 동안 ${loan.minutes.toLocaleString()}분을 뛰었습니다.`,
        tone: 'neutral',
        playerId: loan.playerId,
      });
    }
    pushNews(state, {
      category: 'system',
      title: `${state.season} 시즌이 시작됩니다`,
      body: '프리시즌입니다. 여름 이적시장이 열려 있습니다.',
      tone: 'good',
    });
  }

  return {
    week: state.week,
    season: state.season,
    newsCount: state.news.length - before,
    seasonRolled,
    awarded,
  };
}

/**
 * 의뢰인의 성장·하락 보고.
 *
 * 숫자만 조용히 바뀌면 눈치채기 어려우니 어느 항목이 얼마나 움직였는지
 * 짚어 줍니다. 나이 든 선수가 꺾이는 것도 에이전트에게는 정보입니다 —
 * 팔 때를 놓치면 값이 없어집니다.
 */
function reportGrowth(state: GameState, growth: GrowthReport[]): void {
  for (const report of growth) {
    if (!state.clients[report.playerId]) continue;

    if (report.caGain > 0) {
      const detail = report.improved.length > 0
        ? report.improved.map((entry) => `${entry.label} ${entry.from}→${entry.to}`).join(', ')
        : '전반적으로 고르게 올랐습니다';
      pushNews(state, {
        category: 'client',
        title: `${report.playerName} 이(가) 성장했습니다`,
        body: `최근 훈련에서 눈에 띄게 좋아졌습니다. ${detail}.`,
        tone: 'good',
        playerId: report.playerId,
      });
    } else if (report.caGain <= -2) {
      pushNews(state, {
        category: 'client',
        title: `${report.playerName} 의 기량이 떨어지고 있습니다`,
        body: '나이가 실력에 드러나기 시작했습니다. 값이 더 빠지기 전에 움직일지 판단해야 합니다.',
        tone: 'bad',
        playerId: report.playerId,
      });
    }
  }
}

/** 활성화된 리그 하나를 골라 선두와 득점 선두를 짚어 줍니다. */
function reportLeagueHighlight(state: GameState, rng: Rng): void {
  const leagues = Object.values(state.leagues).filter((league) =>
    Object.values(league.table).some((row) => row.played > 2));
  if (leagues.length === 0) return;
  const league = rng.pick(leagues);
  const competition = state.competitions[league.competitionId];
  const leader = Object.values(league.table).slice()
    .sort((a, b) => b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst))[0];
  const topScorer = Object.values(state.players)
    .filter((p) => (p.compStats[league.competitionId]?.goals ?? 0) > 0)
    .sort((a, b) => b.compStats[league.competitionId].goals - a.compStats[league.competitionId].goals)[0];
  if (!leader || !competition) return;

  const scorerLine = topScorer
    ? ` 득점 선두는 ${topScorer.name} (${topScorer.compStats[league.competitionId].goals}골).`
    : '';
  pushNews(state, {
    category: 'league',
    title: `${competition.name} 판세`,
    body: `${state.clubs[leader.clubId]?.name} 이(가) ${leader.played}경기 승점 ${leader.points}로 선두입니다.${scorerLine}`,
    tone: 'neutral',
    playerId: topScorer?.id,
    clubId: leader.clubId,
  });
}

/** 의뢰인이 골이나 도움을 올렸으면 알려 줍니다. */
function reportClientMatches(state: GameState): void {
  for (const client of Object.values(state.clients)) {
    const player = state.players[client.playerId];
    if (!player) continue;
    const fixture = state.lastWeekResults.find(
      (f) => f.homeId === player.clubId || f.awayId === player.clubId);
    if (!fixture) continue;

    // 시즌 누적에서 이번 주 증가분을 알 수 없으므로, 눈에 띄는 경기만
    // 부상·퇴장 기준으로 골라 알립니다.
    if (player.injuredWeeks > 0) {
      pushNews(state, {
        category: 'match',
        title: `${player.name} 부상`,
        body: `${player.injuredWeeks}주 결장이 예상됩니다.`,
        tone: 'bad',
        playerId: player.id,
      });
    }
  }
}

function reportAwards(state: GameState): void {
  const thisSeason = state.awards.filter((a) => a.season === state.season);
  for (const award of thisSeason) {
    const isWorld = award.awardId.startsWith('world-');
    if (!isWorld && !award.wasClient) continue;
    const competition = award.competitionId ? state.competitions[award.competitionId]?.name : null;
    pushNews(state, {
      category: 'award',
      title: `${competition ? `${competition} ` : ''}${AWARD_LABELS[award.awardId]}`,
      body: `${award.playerName} (${award.clubName})${award.wasClient ? ' — 당신의 의뢰인입니다.' : ''}`,
      tone: award.wasClient ? 'good' : 'neutral',
      playerId: award.playerId,
    });
  }
}

/** 천 단위 금액을 사람이 읽는 형태로. */
export function formatMoney(thousands: number): string {
  const abs = Math.abs(thousands);
  if (abs >= 1000000) return `${(thousands / 1000000).toFixed(2)}B`;
  if (abs >= 1000) return `${(thousands / 1000).toFixed(1)}M`;
  return `${Math.round(thousands).toLocaleString()}k`;
}
