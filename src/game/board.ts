import { buildTable, cupRoundName, cupRoundReached, positionOf } from './competition';
import { pushMessage } from './inbox';
import { clamp, type Rng } from './rng';
import type { GameState, Objective } from './types';

/**
 * The board sets objectives from where the club sits in its division by
 * reputation, rates every result against expectations, and sacks a manager
 * whose confidence collapses.
 */

export function setObjectives(state: GameState): void {
  const club = state.clubs[state.clubId];
  const rivals = Object.values(state.clubs)
    .filter((c) => c.division === club.division)
    .sort((a, b) => b.reputation - a.reputation);
  const rank = rivals.findIndex((c) => c.id === club.id) + 1;
  const objectives: Objective[] = [];

  let target: number;
  let label: string;
  if (club.division === 0) {
    if (rank <= 2) [target, label] = [1, '리그 우승'];
    else if (rank <= 5) [target, label] = [4, '4위 이내'];
    else if (rank <= 10) [target, label] = [8, '중위권 (8위 이내)'];
    else [target, label] = [13, '1부 잔류'];
  } else {
    if (rank <= 3) [target, label] = [2, '자동 승격 (2위 이내)'];
    else if (rank <= 7) [target, label] = [6, '승격 플레이오프 진출'];
    else if (rank <= 12) [target, label] = [10, '중위권 마무리'];
    else [target, label] = [club.division === 2 ? 16 : 13, club.division === 2 ? '시즌 완주' : '잔류'];
  }
  club.expectation = target;
  objectives.push({ id: 'league', label, kind: 'league', target, importance: 'essential' });

  const cupTarget = club.division === 0 ? (rank <= 5 ? 4 : 3) : club.division === 1 ? 1 : 1;
  objectives.push({
    id: 'cup',
    label: `${state.cupName} ${cupRoundName(cupTarget)} 진출`,
    kind: 'cup',
    target: cupTarget,
    importance: 'nice',
  });
  objectives.push({ id: 'finance', label: '구단 잔고 적자 피하기', kind: 'finance', target: 0, importance: 'important' });
  if (club.youthFacilities >= 10) {
    objectives.push({ id: 'youth', label: '유스 출신 선수에게 1군 기회 주기', kind: 'youth', target: 5, importance: 'nice' });
  }
  state.objectives = objectives;
}

/** Expected points share for a fixture, from reputation and home advantage. */
function expectedPoints(state: GameState, opponentId: string, home: boolean): number {
  const us = state.clubs[state.clubId].reputation + (home ? 5 : 0);
  const them = state.clubs[opponentId].reputation;
  const p = 1 / (1 + Math.exp(-(us - them) / 12));
  return 0.35 + p * 2.3;
}

export function afterUserMatch(state: GameState, opponentId: string, home: boolean, scored: number, conceded: number, league: boolean): void {
  const points = scored > conceded ? 3 : scored === conceded ? 1 : 0;
  const delta = (points - expectedPoints(state, opponentId, home)) * (league ? 1.6 : 1);
  state.confidence = clamp(state.confidence + delta, 0, 100);
}

/** First of every month: the board looks at the table. */
export function monthlyReview(state: GameState, rng: Rng): void {
  const club = state.clubs[state.clubId];
  const table = buildTable(state, club.division);
  const played = table.find((r) => r.clubId === club.id)?.played ?? 0;
  if (played < 4) return;
  const position = positionOf(table, club.id);
  const gap = club.expectation - position;
  state.confidence = clamp(state.confidence + gap * 0.6 + (club.balance < 0 ? -2 : 0), 0, 100);

  if (state.confidence < 25 && !state.sacked && rng.bool(0.5)) {
    pushMessage(state, '이사회', '이사회 경고', `현재 ${position}위입니다. 목표(${club.expectation}위)와 거리가 멉니다. 결과가 개선되지 않으면 이사회는 결단을 내릴 수밖에 없습니다.`, 'bad');
  }
  if (state.confidence < 12 && played >= 8) sack(state, rng, '성적 부진');
}

export function sack(state: GameState, rng: Rng, reason: string): void {
  state.sacked = true;
  const club = state.clubs[state.clubId];
  // Clubs a little further down the pyramid are still interested.
  const offers = Object.values(state.clubs)
    .filter((c) => c.id !== club.id && c.reputation <= club.reputation - 5)
    .sort(() => rng.next() - 0.5)
    .slice(0, 3)
    .map((c) => c.id);
  state.jobOffers = offers;
  pushMessage(state, '이사회', '경질 통보', `${club.name} 이사회는 ${reason}을(를) 이유로 감독과의 계약을 해지하기로 결정했습니다. 그동안 수고하셨습니다.`, 'bad');
}

export interface ObjectiveResult {
  objective: Objective;
  met: boolean;
  detail: string;
}

export function evaluateSeason(state: GameState, position: number): ObjectiveResult[] {
  const club = state.clubs[state.clubId];
  return state.objectives.map((o) => {
    switch (o.kind) {
      case 'league':
        return { objective: o, met: position <= o.target, detail: `${position}위` };
      case 'cup': {
        const reached = cupRoundReached(state, club.id);
        return { objective: o, met: reached >= o.target, detail: reached < 0 ? '미참가' : `${cupRoundName(reached)}` };
      }
      case 'finance':
        return { objective: o, met: club.balance >= 0, detail: club.balance >= 0 ? '흑자' : '적자' };
      case 'youth': {
        const youthApps = Object.values(state.players).filter(
          (p) => p.clubId === club.id && p.seasons.some((s) => s.season === state.season && s.apps > 0) && p.age <= 21,
        ).length;
        return { objective: o, met: youthApps >= o.target, detail: `${youthApps}명 출전` };
      }
    }
  });
}

export function applySeasonReview(state: GameState, results: ObjectiveResult[], rng: Rng): void {
  results.forEach((r) => {
    const weight = r.objective.importance === 'essential' ? 18 : r.objective.importance === 'important' ? 8 : 4;
    state.confidence = clamp(state.confidence + (r.met ? weight : -weight), 0, 100);
  });
  const failedEssential = results.some((r) => !r.met && r.objective.importance === 'essential');
  if (failedEssential && state.confidence < 30) sack(state, rng, '시즌 목표 미달성');
}

export function confidenceLabel(value: number): string {
  if (value >= 80) return '절대적 신뢰';
  if (value >= 60) return '만족';
  if (value >= 40) return '보통';
  if (value >= 25) return '불안';
  return '위기';
}
