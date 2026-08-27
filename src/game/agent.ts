/**
 * 에이전트 본체 — 자금, 평판, 라이선스, 구단 관계.
 *
 * 게임의 점수판입니다. 이적을 성사시키면 수수료가 들어오고 평판이 오르며,
 * 평판이 오르면 더 큰 구단이 전화를 받아 주고 의뢰인 정원이 늘어납니다.
 */

import { clamp } from './rng';
import { LICENCE_LIMITS, licenceFor } from './newGame';
import type { Client, GameState, LedgerEntry, Player } from './types';

/** 구단과의 기본 관계. 처음 보는 구단은 여기서 시작합니다. */
export const BASE_RELATION = 30;

export function relationWith(state: GameState, clubId: string): number {
  return state.agent.clubRelations[clubId] ?? BASE_RELATION;
}

export function adjustRelation(state: GameState, clubId: string, delta: number): void {
  state.agent.clubRelations[clubId] = clamp(relationWith(state, clubId) + delta, 0, 100);
}

export function adjustReputation(state: GameState, delta: number): void {
  state.agent.reputation = clamp(state.agent.reputation + delta, 0, 100);
  state.agent.licence = licenceFor(state.agent.reputation).licence;
}

/** 지금 등급에서 데리고 있을 수 있는 의뢰인 수. */
export function clientLimit(state: GameState): number {
  return LICENCE_LIMITS.find((tier) => tier.licence === state.agent.licence)?.clients ?? 4;
}

/** 동시에 진행할 수 있는 협상 수. */
export function negotiationLimit(state: GameState): number {
  return LICENCE_LIMITS.find((tier) => tier.licence === state.agent.licence)?.negotiations ?? 2;
}

export function ledger(state: GameState, label: string, amount: number): void {
  const entry: LedgerEntry = { season: state.season, week: state.week, label, amount: Math.round(amount * 10) / 10 };
  state.agent.ledger.unshift(entry);
  if (state.agent.ledger.length > 200) state.agent.ledger.length = 200;
  state.agent.cash = Math.round((state.agent.cash + entry.amount) * 10) / 10;
}

/**
 * 사무실 유지비 — 의뢰인이 많을수록 비쌉니다.
 *
 * 에이전트 수입의 대부분은 이적 성사 수수료이고 주급에서 떼는 몫은 얼마
 * 안 됩니다. 그래서 유지비가 조금만 세도 첫 거래를 성사시키기 전에 파산해
 * 게임이 끝나 버립니다.
 */
export function weeklyExpenses(state: GameState): number {
  const clients = Object.keys(state.clients).length;
  return Math.round((3 + clients * 1.0 + state.agent.licence * 1.5) * 10) / 10;
}

/**
 * 매주 들어오는 수수료. 의뢰인의 주급에서 계약된 비율만큼 떼어 옵니다.
 * 부상 중이거나 무소속이면 수입이 없습니다.
 */
export function weeklyCommission(state: GameState): number {
  let total = 0;
  for (const client of Object.values(state.clients)) {
    const player = state.players[client.playerId];
    if (!player || player.retired || !player.contract) continue;
    total += player.contract.wage * (client.commissionPct / 100);
  }
  return Math.round(total * 10) / 10;
}

/** 한 주의 수입·지출을 정산합니다. */
export function settleWeeklyFinance(state: GameState): { income: number; expenses: number } {
  const income = weeklyCommission(state);
  const expenses = weeklyExpenses(state);
  if (income > 0) ledger(state, '의뢰인 주급 수수료', income);
  ledger(state, '사무실 운영비', -expenses);
  return { income, expenses };
}

/** 이적 성사 수수료. 이적료 비율 + 새 계약 주급의 몇 주치. */
export function transferCommission(fee: number, wage: number, commissionPct: number): number {
  return Math.round((fee * (commissionPct / 100) + wage * 4) * 10) / 10;
}

/**
 * 이적 규모에 따른 평판 상승. 큰 거래 한 건이 작은 거래 열 건보다 낫습니다.
 */
export function reputationForDeal(fee: number, buyerReputation: number): number {
  const size = Math.log10(Math.max(100, fee)) - 2; // 100k → 0, 100M → 3
  return clamp(size * 1.6 + (buyerReputation - 50) / 45, 0.2, 7);
}

/** 의뢰인 목록 — 신뢰도가 낮은 순(먼저 챙겨야 할 순)으로. */
export function clientsByUrgency(state: GameState): Array<{ client: Client; player: Player }> {
  return Object.values(state.clients)
    .map((client) => ({ client, player: state.players[client.playerId] }))
    .filter((entry): entry is { client: Client; player: Player } => Boolean(entry.player))
    .sort((a, b) => {
      const aDemands = a.client.demands.filter((d) => !d.resolution).length;
      const bDemands = b.client.demands.filter((d) => !d.resolution).length;
      if (aDemands !== bDemands) return bDemands - aDemands;
      return a.client.trust - b.client.trust;
    });
}

export function agentNetWorth(state: GameState): number {
  return state.agent.cash;
}
