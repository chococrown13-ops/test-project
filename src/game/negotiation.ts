/**
 * 협상.
 *
 * 이적 한 건은 세 단계를 거칩니다. 이적료(파는 구단 ↔ 사는 구단) → 선수
 * 조건(주급·계약 기간) → 내 수수료. 각 단계마다 상대에게는 속으로 정해 둔
 * 한계선과 인내심이 있고, 무리한 금액을 부를수록 인내심이 깎입니다.
 * 인내심이 바닥나면 협상은 그대로 깨집니다.
 */

import { Rng, clamp } from './rng';
import { COUNTRY_BY_ID } from '../data/countries';
import { PERSONALITY_BY_ID, estimateValue, expectedWage } from './player';
import { wageBill } from './market';
import {
  adjustRelation, adjustReputation, ledger, negotiationLimit, relationWith,
  reputationForDeal, transferCommission,
} from './agent';
import type { GameState, Negotiation, NegotiationMessage, Player } from './types';

let counter = 0;
const nextId = (): string => `n${Date.now().toString(36)}${(counter++).toString(36)}`;

const say = (negotiation: Negotiation, week: number, from: NegotiationMessage['from'], text: string, tone: NegotiationMessage['tone'] = 'neutral'): void => {
  negotiation.messages.unshift({ week, from, text, tone });
  if (negotiation.messages.length > 40) negotiation.messages.length = 40;
};

/** 스쿼드 안에서의 위상 0-1. 파는 구단이 얼마나 붙잡고 싶어 하는지. */
function standing(player: Player, state: GameState): number {
  if (!player.clubId) return 0;
  const club = state.clubs[player.clubId];
  if (!club) return 0;
  const ranked = club.playerIds
    .map((id) => state.players[id])
    .filter((p): p is Player => Boolean(p))
    .sort((a, b) => b.ca - a.ca);
  const index = ranked.findIndex((p) => p.id === player.id);
  return index < 0 ? 0 : 1 - index / Math.max(1, ranked.length - 1);
}

/** 사는 구단에게 이 선수가 얼마나 필요한지 0-1. */
function need(player: Player, buyerId: string, state: GameState): number {
  const buyer = state.clubs[buyerId];
  if (!buyer) return 0;
  const sameGroup = buyer.playerIds
    .map((id) => state.players[id])
    .filter((p): p is Player => Boolean(p) && p.group === player.group)
    .sort((a, b) => b.ca - a.ca);
  const best = sameGroup[0]?.ca ?? 0;
  const thin = sameGroup.length < (player.group === 'GK' ? 3 : 5) ? 0.25 : 0;
  return clamp((player.ca - best) / 40 + 0.35 + thin, 0, 1);
}

export interface OpenResult {
  ok: boolean;
  message: string;
  negotiationId?: string;
}

/**
 * 새 협상을 엽니다. kind 가 'renewal' 이면 현 구단과의 재계약이라
 * 이적료 단계를 건너뜁니다.
 */
export function openNegotiation(
  state: GameState, playerId: string, toClubId: string, kind: Negotiation['kind'], rng: Rng,
): OpenResult {
  const player = state.players[playerId];
  const buyer = state.clubs[toClubId];
  if (!player || !buyer) return { ok: false, message: '선수나 구단을 찾을 수 없습니다.' };
  if (!state.clients[playerId]) return { ok: false, message: '내 의뢰인만 협상할 수 있습니다.' };
  if (state.negotiations.some((n) => n.playerId === playerId && n.stage !== 'agreed' && n.stage !== 'failed')) {
    return { ok: false, message: '이 선수는 이미 협상이 진행 중입니다.' };
  }
  const active = state.negotiations.filter((n) => n.stage !== 'agreed' && n.stage !== 'failed').length;
  if (active >= negotiationLimit(state)) {
    return { ok: false, message: `동시에 진행할 수 있는 협상은 ${negotiationLimit(state)}건입니다.` };
  }
  if (kind === 'transfer' && player.clubId === toClubId) {
    return { ok: false, message: '이미 그 구단 소속입니다.' };
  }

  const country = COUNTRY_BY_ID[buyer.countryId];
  if (!country) return { ok: false, message: '구단 정보를 읽을 수 없습니다.' };

  const relation = relationWith(state, toClubId);
  const personality = PERSONALITY_BY_ID[player.personality];
  const value = estimateValue(player);
  const seller = player.clubId ? state.clubs[player.clubId] : null;

  // 사는 구단의 상한 — 예산, 필요도, 나와의 관계가 함께 정합니다.
  const buyerMaxFee = kind === 'renewal' || !seller ? 0 : Math.round(Math.min(
    buyer.budget,
    value * (0.85 + need(player, toClubId, state) * 0.55 + relation / 260),
  ));

  // 파는 구단의 하한. 바이아웃이 있으면 그 금액에서 막힙니다.
  const contractYears = player.contract ? Math.max(0, player.contract.expires - state.season) : 0;
  let sellerMin = seller
    ? Math.round(value * (1.0 + standing(player, state) * 0.55 + contractYears * 0.07))
    : 0;
  if (player.contract?.releaseClause) sellerMin = Math.min(sellerMin, player.contract.releaseClause);

  const marketWage = expectedWage(player, buyer.reputation, country);
  const playerMinWage = Math.round(marketWage * personality.wageGreed * rng.float(0.88, 1.08) * 10) / 10;
  const wageRoom = Math.max(0, buyer.wageBudget * 1.05 - wageBill(buyer, state.players));
  const buyerMaxWage = Math.round(Math.min(marketWage * 1.45, Math.max(marketWage * 0.5, wageRoom)) * 10) / 10;

  const negotiation: Negotiation = {
    id: nextId(),
    kind,
    playerId,
    clubId: toClubId,
    fromClubId: kind === 'renewal' ? null : player.clubId,
    stage: kind === 'transfer' && seller ? 'fee' : 'terms',
    fee: 0,
    wage: 0,
    years: 3,
    commissionPct: 0,
    releaseClause: 0,
    clubMaxFee: buyerMaxFee,
    clubMaxWage: buyerMaxWage,
    playerMinWage,
    patience: Math.round(clamp(55 + relation * 0.45 + state.agent.reputation * 0.2, 30, 100)),
    messages: [],
    openedWeek: state.week,
    expiresWeek: state.week + 4,
    inbound: false,
  };

  // 협상 시작 시점에 이미 성립 불가능한 경우가 있습니다. 힌트를 남깁니다.
  if (negotiation.stage === 'fee' && sellerMin > buyerMaxFee) {
    say(negotiation, state.week, 'seller', `${seller?.name ?? '구단'} 은(는) 선수를 팔 생각이 별로 없어 보입니다.`, 'bad');
  }
  negotiation.fee = sellerMin;
  say(negotiation, state.week, 'club',
    kind === 'renewal'
      ? `${buyer.name} 이(가) 재계약 논의를 시작했습니다.`
      : `${buyer.name} 이(가) ${player.name} 영입 논의에 응했습니다.`, 'neutral');

  state.negotiations.unshift(negotiation);
  adjustRelation(state, toClubId, 1);
  return { ok: true, message: '협상을 시작했습니다.', negotiationId: negotiation.id };
}

export interface ProposeResult {
  ok: boolean;
  accepted: boolean;
  message: string;
}

function fail(negotiation: Negotiation, state: GameState, reason: string): ProposeResult {
  negotiation.stage = 'failed';
  say(negotiation, state.week, 'club', reason, 'bad');
  adjustRelation(state, negotiation.clubId, -3);
  return { ok: true, accepted: false, message: reason };
}

function find(state: GameState, id: string): Negotiation | undefined {
  return state.negotiations.find((n) => n.id === id);
}

/** 1단계 — 이적료. 두 구단이 모두 받아들여야 넘어갑니다. */
export function proposeFee(state: GameState, id: string, fee: number, rng: Rng): ProposeResult {
  const negotiation = find(state, id);
  if (!negotiation || negotiation.stage !== 'fee') return { ok: false, accepted: false, message: '이적료 단계가 아닙니다.' };
  const player = state.players[negotiation.playerId];
  const seller = negotiation.fromClubId ? state.clubs[negotiation.fromClubId] : null;
  const buyer = state.clubs[negotiation.clubId];
  if (!player || !buyer) return { ok: false, accepted: false, message: '협상 대상을 찾을 수 없습니다.' };

  const value = estimateValue(player);
  const contractYears = player.contract ? Math.max(0, player.contract.expires - state.season) : 0;
  let sellerMin = seller ? Math.round(value * (1.0 + standing(player, state) * 0.55 + contractYears * 0.07)) : 0;
  if (player.contract?.releaseClause) sellerMin = Math.min(sellerMin, player.contract.releaseClause);

  negotiation.fee = Math.round(fee);

  if (fee > negotiation.clubMaxFee) {
    negotiation.patience -= 22;
    say(negotiation, state.week, 'club', `${buyer.name}: 그 금액은 우리 예산 밖입니다.`, 'bad');
    if (negotiation.patience <= 0) return fail(negotiation, state, `${buyer.name} 이(가) 협상을 접었습니다.`);
    return { ok: true, accepted: false, message: '사는 구단이 난색을 표합니다.' };
  }
  if (seller && fee < sellerMin) {
    negotiation.patience -= 16;
    const gap = sellerMin / Math.max(1, fee);
    say(negotiation, state.week, 'seller',
      `${seller.name}: ${gap > 1.4 ? '턱없이 부족합니다.' : '조금만 더 올려 주십시오.'}`, 'bad');
    if (negotiation.patience <= 0) return fail(negotiation, state, `${seller.name} 이(가) 협상을 중단했습니다.`);
    return { ok: true, accepted: false, message: '파는 구단이 거절했습니다.' };
  }

  say(negotiation, state.week, 'club', `이적료 ${Math.round(fee).toLocaleString()}k 에 합의했습니다.`, 'good');
  negotiation.stage = 'terms';
  negotiation.wage = Math.round(negotiation.playerMinWage * rng.float(0.95, 1.05) * 10) / 10;
  return { ok: true, accepted: true, message: '이적료 합의. 이제 선수 조건을 정합니다.' };
}

/** 2단계 — 주급과 계약 기간. 구단 상한과 선수 하한 사이여야 합니다. */
export function proposeTerms(
  state: GameState, id: string, wage: number, years: number, releaseClause: number,
): ProposeResult {
  const negotiation = find(state, id);
  if (!negotiation || negotiation.stage !== 'terms') return { ok: false, accepted: false, message: '조건 협상 단계가 아닙니다.' };
  const player = state.players[negotiation.playerId];
  const buyer = state.clubs[negotiation.clubId];
  if (!player || !buyer) return { ok: false, accepted: false, message: '협상 대상을 찾을 수 없습니다.' };

  negotiation.wage = Math.round(wage * 10) / 10;
  negotiation.years = clamp(Math.round(years), 1, 5);
  negotiation.releaseClause = Math.max(0, Math.round(releaseClause));

  if (wage > negotiation.clubMaxWage) {
    negotiation.patience -= 20;
    say(negotiation, state.week, 'club', `${buyer.name}: 주급 상한을 넘습니다.`, 'bad');
    if (negotiation.patience <= 0) return fail(negotiation, state, `${buyer.name} 이(가) 협상을 접었습니다.`);
    return { ok: true, accepted: false, message: '구단이 주급을 거절했습니다.' };
  }
  if (wage < negotiation.playerMinWage) {
    negotiation.patience -= 12;
    say(negotiation, state.week, 'player', `${player.name}: 이 조건으로는 서명하지 않겠습니다.`, 'bad');
    if (negotiation.patience <= 0) return fail(negotiation, state, `${player.name} 이(가) 협상 테이블을 떠났습니다.`);
    return { ok: true, accepted: false, message: '선수가 주급에 만족하지 못합니다.' };
  }
  // 바이아웃을 낮게 걸면 구단이 싫어합니다.
  if (negotiation.releaseClause > 0 && negotiation.releaseClause < estimateValue(player) * 1.4) {
    negotiation.patience -= 10;
    say(negotiation, state.week, 'club', `${buyer.name}: 바이아웃이 너무 낮습니다.`, 'bad');
    if (negotiation.patience <= 0) return fail(negotiation, state, `${buyer.name} 이(가) 협상을 접었습니다.`);
    return { ok: true, accepted: false, message: '바이아웃 조항을 조정해야 합니다.' };
  }

  say(negotiation, state.week, 'player', `${player.name} 이(가) 조건에 만족했습니다.`, 'good');
  negotiation.stage = 'commission';
  negotiation.commissionPct = 5;
  return { ok: true, accepted: true, message: '선수 조건 합의. 이제 내 수수료를 정합니다.' };
}

/** 3단계 — 내 수수료. 관계가 좋고 평판이 높을수록 더 부를 수 있습니다. */
export function proposeCommission(state: GameState, id: string, pct: number): ProposeResult {
  const negotiation = find(state, id);
  if (!negotiation || negotiation.stage !== 'commission') return { ok: false, accepted: false, message: '수수료 단계가 아닙니다.' };
  const buyer = state.clubs[negotiation.clubId];
  if (!buyer) return { ok: false, accepted: false, message: '구단을 찾을 수 없습니다.' };

  const relation = relationWith(state, negotiation.clubId);
  const ceiling = 3 + relation / 22 + state.agent.reputation / 22;
  negotiation.commissionPct = Math.round(clamp(pct, 0, 25) * 10) / 10;

  if (pct > ceiling) {
    negotiation.patience -= 18;
    say(negotiation, state.week, 'club', `${buyer.name}: 수수료가 과합니다. 우리 기준은 ${ceiling.toFixed(1)}% 선입니다.`, 'bad');
    if (negotiation.patience <= 0) return fail(negotiation, state, `${buyer.name} 이(가) 협상을 접었습니다.`);
    return { ok: true, accepted: false, message: '구단이 수수료를 거절했습니다.' };
  }

  negotiation.stage = 'agreed';
  say(negotiation, state.week, 'club', `수수료 ${negotiation.commissionPct}% 에 합의했습니다. 계약서를 준비하겠습니다.`, 'good');
  return { ok: true, accepted: true, message: '모든 조건에 합의했습니다. 계약을 마무리하세요.' };
}

export interface CompleteResult {
  ok: boolean;
  message: string;
  commission: number;
}

/** 합의된 협상을 실제 이적/재계약으로 확정합니다. */
export function completeNegotiation(state: GameState, id: string): CompleteResult {
  const negotiation = find(state, id);
  if (!negotiation || negotiation.stage !== 'agreed') {
    return { ok: false, message: '아직 합의되지 않은 협상입니다.', commission: 0 };
  }
  const player = state.players[negotiation.playerId];
  const buyer = state.clubs[negotiation.clubId];
  if (!player || !buyer) return { ok: false, message: '대상을 찾을 수 없습니다.', commission: 0 };

  const client = state.clients[player.id];
  const seller = negotiation.fromClubId ? state.clubs[negotiation.fromClubId] : null;

  if (negotiation.kind !== 'renewal') {
    if (seller) {
      seller.playerIds = seller.playerIds.filter((pid) => pid !== player.id);
      seller.budget += negotiation.fee;
      adjustRelation(state, seller.id, 4);
    }
    buyer.budget -= negotiation.fee;
    buyer.playerIds.push(player.id);
    player.clubId = buyer.id;
    player.morale = clamp(player.morale + 12, 0, 100);
  }

  player.contract = {
    clubId: buyer.id,
    wage: negotiation.wage,
    expires: state.season + negotiation.years,
    releaseClause: negotiation.releaseClause,
    agentFeePct: negotiation.commissionPct,
    brokeredBy: 'you',
    signedSeason: state.season,
  };
  player.value = estimateValue(player);

  const commission = transferCommission(negotiation.fee, negotiation.wage, negotiation.commissionPct);
  ledger(state, `${player.name} ${negotiation.kind === 'renewal' ? '재계약' : '이적'} 수수료`, commission);
  adjustReputation(state, reputationForDeal(negotiation.fee, buyer.reputation));
  adjustRelation(state, buyer.id, 6);

  state.agent.totals.deals += 1;
  state.agent.totals.feeVolume += negotiation.fee;
  state.agent.totals.commission += commission;

  if (client) {
    client.trust = clamp(client.trust + 14, 0, 100);
    // 이적을 요구하던 건이 있었다면 함께 해결됩니다.
    for (const demand of client.demands) {
      if (!demand.resolution && (demand.kind === 'transfer' || demand.kind === 'renewal' || demand.kind === 'wage')) {
        demand.resolution = 'success';
      }
    }
  }

  state.negotiations = state.negotiations.filter((n) => n.id !== id);
  return {
    ok: true,
    commission,
    message: negotiation.kind === 'renewal'
      ? `${player.name} 재계약 완료. 수수료 ${commission.toLocaleString()}k.`
      : `${player.name} → ${buyer.name} 이적 완료. 수수료 ${commission.toLocaleString()}k.`,
  };
}

export function withdraw(state: GameState, id: string): void {
  const negotiation = find(state, id);
  if (!negotiation) return;
  negotiation.stage = 'failed';
  adjustRelation(state, negotiation.clubId, -2);
  state.negotiations = state.negotiations.filter((n) => n.id !== id);
}

// ── 주간 처리 ───────────────────────────────────────────────────────────

export interface NegotiationEvent {
  kind: 'inbound' | 'expired';
  text: string;
  negotiationId?: string;
  playerId?: string;
}

/**
 * 협상 시계. 기한이 지난 협상을 정리하고, 이적시장이 열려 있으면 AI 구단이
 * 먼저 내 의뢰인에게 관심을 보내옵니다.
 */
export function weeklyNegotiationTick(state: GameState, rng: Rng, windowOpen: boolean): NegotiationEvent[] {
  const events: NegotiationEvent[] = [];

  for (const negotiation of state.negotiations.slice()) {
    if (negotiation.stage === 'agreed' || negotiation.stage === 'failed') continue;
    if (state.week > negotiation.expiresWeek) {
      negotiation.stage = 'failed';
      const player = state.players[negotiation.playerId];
      events.push({ kind: 'expired', text: `${player?.name ?? '선수'} 협상이 기한을 넘겨 무산됐습니다.`, negotiationId: negotiation.id });
      adjustRelation(state, negotiation.clubId, -2);
    } else {
      negotiation.patience = Math.max(0, negotiation.patience - 4);
    }
  }
  state.negotiations = state.negotiations.filter((n) => n.stage !== 'failed');

  if (!windowOpen) return events;

  // 구단이 먼저 연락해 오는 경우 — 좋은 의뢰인을 가지고 있을수록 자주 옵니다.
  for (const client of Object.values(state.clients)) {
    const player = state.players[client.playerId];
    if (!player || player.retired || !player.clubId) continue;
    if (state.negotiations.some((n) => n.playerId === player.id)) continue;

    const interest = clamp((player.ca - 90) / 260 + (player.form - 50) / 500, 0.005, 0.09);
    if (!rng.bool(interest)) continue;

    const suitors = Object.values(state.clubs).filter((club) =>
      club.id !== player.clubId
      && club.reputation > (state.clubs[player.clubId!]?.reputation ?? 0) - 6
      && club.budget > estimateValue(player) * 0.9);
    if (suitors.length === 0) continue;

    const buyer = rng.pick(suitors);
    const result = openNegotiation(state, player.id, buyer.id, 'transfer', rng);
    if (result.ok && result.negotiationId) {
      const negotiation = find(state, result.negotiationId);
      if (negotiation) {
        negotiation.inbound = true;
        negotiation.expiresWeek = state.week + 3;
        say(negotiation, state.week, 'club', `${buyer.name} 이(가) 먼저 관심을 보내왔습니다.`, 'good');
      }
      events.push({
        kind: 'inbound',
        text: `${buyer.name} 이(가) ${player.name} 영입에 관심을 보입니다.`,
        negotiationId: result.negotiationId,
        playerId: player.id,
      });
    }
  }

  return events;
}
