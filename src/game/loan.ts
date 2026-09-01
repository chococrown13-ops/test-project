/**
 * 임대.
 *
 * 어린 의뢰인은 큰 구단 벤치에서 시즌을 통째로 버립니다. 출전 시간이 없으면
 * 성장도 멈추고(`caDelta` 가 출전 분수를 봅니다) 이적을 붙일 만한 실적도
 * 쌓이지 않아, 에이전트가 손쓸 방법이 사라집니다. 임대는 그 교착을 푸는
 * 수단입니다 — 계약은 원 소속 구단에 남고 선수만 한 시즌 옮겨 갑니다.
 */

import { Rng, clamp } from './rng';
import { countryOfClub } from '../data/countries';
import { expectedWage, PERSONALITY_BY_ID } from './player';
import { squadStanding, wageBill } from './market';
import { adjustRelation, ledger, relationWith } from './agent';
import { SEASON_WEEKS, isWindowOpen, type Club, type GameState, type Player } from './types';

/** 임대를 붙일 수 있는 나이 상한. 이보다 많으면 출전 시간이 적어야 합니다. */
export const LOAN_AGE_LIMIT = 24;

export interface LoanEligibility {
  ok: boolean;
  reason?: string;
}

/** 시즌 진행 대비 출전 시간 비율 0-1. */
function playingShare(state: GameState, player: Player): number {
  const expected = (state.week / SEASON_WEEKS) * 2100;
  if (expected < 200) return player.season.minutes > 0 ? 1 : 0;
  return clamp(player.season.minutes / expected, 0, 1);
}

export function loanEligibility(state: GameState, player: Player): LoanEligibility {
  if (!state.clients[player.id]) return { ok: false, reason: '내 의뢰인만 임대를 붙일 수 있습니다.' };
  if (player.retired) return { ok: false, reason: '은퇴한 선수입니다.' };
  if (player.loan) return { ok: false, reason: '이미 임대 중입니다.' };
  if (!player.clubId || !player.contract) return { ok: false, reason: '소속 구단이 없습니다. 임대가 아니라 계약이 필요합니다.' };
  if (!isWindowOpen(state.week)) return { ok: false, reason: '이적시장이 열려 있어야 임대를 보낼 수 있습니다.' };
  if (state.negotiations.some((n) => n.playerId === player.id && n.stage !== 'failed')) {
    return { ok: false, reason: '이적 협상이 진행 중입니다.' };
  }
  const share = playingShare(state, player);
  if (player.age > LOAN_AGE_LIMIT && share > 0.5) {
    return { ok: false, reason: `${LOAN_AGE_LIMIT}세를 넘은 주전은 임대 대상이 아닙니다.` };
  }
  return { ok: true };
}

export interface LoanOutlook {
  /** 성사 확률 0-1. */
  chance: number;
  /** 이 임대로 받는 주선료(천 단위). */
  fee: number;
  reasons: string[];
  /** 임대 구단에서 주전으로 뛸 수 있을지 0-1. */
  playingChance: number;
}

/**
 * 임대 성사 가능성.
 *
 * 세 쪽이 모두 끄덕여야 합니다 — 받는 구단은 전력이 되어야 하고, 보내는
 * 구단은 내보내도 아깝지 않아야 하며, 선수는 뛸 수 있어야 합니다.
 */
export function loanOutlook(state: GameState, player: Player, club: Club): LoanOutlook {
  const reasons: string[] = [];
  const parent = player.clubId ? state.clubs[player.clubId] : null;
  const country = countryOfClub(club);
  const fee = Math.round(player.value * 0.01 + 15);

  if (!parent || !country || club.id === parent.id) {
    return { chance: 0, fee, reasons: ['보낼 수 없는 구단입니다'], playingChance: 0 };
  }

  // 받는 구단 기준: 이 선수가 그쪽 스쿼드에서 몇 번째쯤인가.
  const theirs = club.playerIds
    .map((id) => state.players[id])
    .filter((p): p is Player => Boolean(p) && p.group === player.group)
    .sort((a, b) => b.ca - a.ca);
  const benchmark = theirs.length > 0 ? theirs[Math.min(2, theirs.length - 1)].ca : 0;
  const upgrade = clamp((player.ca - benchmark) / 30, -1, 1);
  const playingChance = clamp(0.45 + upgrade * 0.5, 0.05, 0.97);

  let chance = 0.35 + upgrade * 0.35;
  if (upgrade > 0.25) reasons.push('그쪽 스쿼드에서 바로 주전급입니다');
  else if (upgrade < -0.3) reasons.push('그쪽 수준에는 못 미칩니다');

  // 보내는 구단: 안 쓰는 선수일수록 흔쾌히 내줍니다.
  const standing = squadStanding(player, parent, state.players);
  const share = playingShare(state, player);
  const spare = clamp((1 - standing) * 0.6 + (1 - share) * 0.6, 0, 1);
  chance += (spare - 0.5) * 0.4;
  if (share < 0.25) reasons.push(`${parent.name} 에서 거의 못 뛰고 있습니다`);
  else if (standing > 0.7) reasons.push(`${parent.name} 이(가) 붙잡으려 합니다`);

  // 임대 구단이 주급을 부담할 수 있어야 합니다.
  const wage = expectedWage(player, club.reputation, country);
  const room = club.wageBudget * 1.15 - wageBill(club, state.players);
  if (room < wage * 0.5) {
    chance -= 0.3;
    reasons.push('그쪽 주급 여력이 빠듯합니다');
  }

  // 선수 본인 — 뛸 수 있으면 좋아하고, 급이 너무 낮으면 자존심이 상합니다.
  const personality = PERSONALITY_BY_ID[player.personality];
  const dropTooFar = parent.reputation - club.reputation > 45 && personality.ambition > 65;
  if (dropTooFar) {
    chance -= 0.2;
    reasons.push('선수가 급이 너무 낮다고 느낍니다');
  }

  chance += (relationWith(state, club.id) - 30) / 300;

  return { chance: clamp(chance, 0.02, 0.95), fee, reasons, playingChance };
}

export interface LoanResult {
  ok: boolean;
  agreed: boolean;
  message: string;
}

export function arrangeLoan(state: GameState, playerId: string, clubId: string, rng: Rng): LoanResult {
  const player = state.players[playerId];
  const club = state.clubs[clubId];
  if (!player || !club) return { ok: false, agreed: false, message: '대상을 찾을 수 없습니다.' };

  const eligibility = loanEligibility(state, player);
  if (!eligibility.ok) return { ok: false, agreed: false, message: eligibility.reason ?? '임대할 수 없습니다.' };

  const parent = state.clubs[player.clubId as string];
  if (!parent) return { ok: false, agreed: false, message: '원 소속 구단을 찾을 수 없습니다.' };

  const outlook = loanOutlook(state, player, club);
  if (!rng.bool(outlook.chance)) {
    adjustRelation(state, clubId, -1);
    return { ok: true, agreed: false, message: `${club.name} 이(가) 임대 제안을 거절했습니다.` };
  }

  parent.playerIds = parent.playerIds.filter((id) => id !== playerId);
  club.playerIds.push(playerId);
  player.clubId = club.id;
  player.loan = { parentClubId: parent.id, untilSeason: state.season };
  player.morale = clamp(player.morale + 12, 0, 100);

  ledger(state, `${player.name} 임대 주선료`, outlook.fee);
  adjustRelation(state, club.id, 4);
  adjustRelation(state, parent.id, 3);

  const client = state.clients[playerId];
  if (client) {
    client.trust = clamp(client.trust + 8, 0, 100);
    // 출전 시간을 요구하던 건이 있었다면 함께 풀립니다.
    for (const demand of client.demands) {
      if (!demand.resolution && demand.kind === 'playing-time') demand.resolution = 'success';
    }
  }

  return {
    ok: true,
    agreed: true,
    message: `${player.name} 을(를) ${club.name} 으로 임대 보냈습니다. 주선료 ${outlook.fee}k.`,
  };
}

export interface LoanReturn {
  playerId: string;
  playerName: string;
  parentName: string;
  minutes: number;
}

/**
 * 시즌이 끝난 임대를 원 소속으로 돌려보냅니다.
 *
 * **반드시 시즌 롤오버의 맨 앞에서 불러야 합니다.** 계약 만료·방출·자유계약
 * 영입이 모두 소속 구단을 보고 도는데, 임대 중인 선수는 계약과 소속이
 * 서로 다른 구단을 가리키고 있기 때문입니다.
 */
export function returnLoans(state: GameState): LoanReturn[] {
  const returned: LoanReturn[] = [];
  for (const player of Object.values(state.players)) {
    if (!player.loan || player.loan.untilSeason > state.season) continue;

    const host = player.clubId ? state.clubs[player.clubId] : null;
    const parent = state.clubs[player.loan.parentClubId];
    if (host) host.playerIds = host.playerIds.filter((id) => id !== player.id);

    if (parent) {
      if (!parent.playerIds.includes(player.id)) parent.playerIds.push(player.id);
      player.clubId = parent.id;
      if (player.contract) player.contract.clubId = parent.id;
    } else {
      player.clubId = null;
      player.contract = null;
    }

    returned.push({
      playerId: player.id,
      playerName: player.name,
      parentName: parent?.name ?? '무소속',
      minutes: player.season.minutes,
    });
    delete player.loan;
  }
  return returned;
}
