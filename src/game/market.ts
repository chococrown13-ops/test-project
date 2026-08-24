/**
 * AI 이적 시장.
 *
 * 플레이어가 손대지 않는 구단들도 재계약을 하고, 자유계약 선수를 줍고,
 * 자기들끼리 선수를 사고팝니다. 이게 없으면 계약이 만료될 때마다 선수가
 * 무소속으로 쌓여 세계가 텅 비어 버립니다.
 */

import { Rng, clamp } from './rng';
import { estimateValue, expectedWage, PERSONALITY_BY_ID } from './player';
import { COUNTRY_BY_ID } from '../data/countries';
import type { Club, GameState, Player } from './types';

/** 스쿼드 전체의 시장 가치 합계. */
export function squadValue(club: Club, players: Record<string, Player>): number {
  let total = 0;
  for (const id of club.playerIds) {
    const player = players[id];
    if (player && !player.retired) total += player.value;
  }
  return total;
}

/**
 * 구단 재정을 스쿼드 가치에서 역산합니다.
 *
 * 예산을 명성만 보고 정하면 선수 가치 곡선과 어긋나, 중위권 구단이 자기
 * 리그 수준의 선수조차 못 사는 상태가 됩니다. 실제 구단이 그렇듯 "가진
 * 선수단의 값어치에 비례해" 쓸 수 있게 하고, 리그에 도는 돈(wageFactor)으로
 * 그 비율을 조절합니다.
 */
export function setClubFinances(
  club: Club, players: Record<string, Player>, wageFactor: number, jitter = 1,
): void {
  const value = squadValue(club, players);
  const share = clamp(0.06 + wageFactor * 0.10, 0.06, 0.22);
  club.budget = Math.round(value * share * jitter);
  club.wageBudget = Math.round(Math.pow(club.reputation / 100, 2.8) * 1900 * wageFactor);
}

/** 한 구단이 실제로 굴리는 주급 총액. */
export function wageBill(club: Club, players: Record<string, Player>): number {
  let total = 0;
  for (const id of club.playerIds) {
    const contract = players[id]?.contract;
    if (contract) total += contract.wage;
  }
  return total;
}

/** 구단이 이 선수를 스쿼드에서 어느 정도로 치는지 0-1. */
function squadStanding(player: Player, club: Club, players: Record<string, Player>): number {
  const ranked = club.playerIds
    .map((id) => players[id])
    .filter((p): p is Player => Boolean(p) && !p.retired)
    .sort((a, b) => b.ca - a.ca);
  const index = ranked.findIndex((p) => p.id === player.id);
  if (index < 0) return 0;
  return 1 - index / Math.max(1, ranked.length - 1);
}

/**
 * 계약 만료 처리. 구단이 붙잡고 싶은 선수에게는 재계약을 제시하고,
 * 나머지는 자유계약으로 풀립니다.
 */
export function processExpiries(state: GameState, rng: Rng): Player[] {
  const released: Player[] = [];

  for (const club of Object.values(state.clubs)) {
    const country = COUNTRY_BY_ID[club.countryId];
    if (!country) continue;
    let bill = wageBill(club, state.players);

    for (const playerId of club.playerIds.slice()) {
      const player = state.players[playerId];
      if (!player || player.retired || !player.contract) continue;
      if (player.contract.expires > state.season) continue;

      const standing = squadStanding(player, club, state.players);
      const upside = player.pa - player.ca > 15 && player.age <= 22;
      // 주전급이거나 유망주면 붙잡습니다.
      const wantsToKeep = standing > 0.42 || upside || player.age <= 20;
      const offer = expectedWage(player, club.reputation, country) * rng.float(0.95, 1.2);
      const affordable = bill - player.contract.wage + offer <= club.wageBudget * 1.12;

      if (!wantsToKeep || !affordable) {
        releaseToFreeAgency(state, player);
        released.push(player);
        continue;
      }

      // 선수 쪽 수락 여부 — 충성심이 높고 대우가 좋으면 남습니다.
      const personality = PERSONALITY_BY_ID[player.personality];
      const wageRatio = offer / Math.max(0.2, expectedWage(player, club.reputation, country) * personality.wageGreed);
      const accept = clamp(
        0.32 + personality.loyalty / 220 + (player.morale - 50) / 260 + (wageRatio - 1) * 0.5
        - (personality.ambition / 100) * (standing < 0.3 ? 0.25 : 0.05),
        0.08, 0.95,
      );
      if (!rng.bool(accept)) {
        releaseToFreeAgency(state, player);
        released.push(player);
        continue;
      }

      bill = bill - player.contract.wage + offer;
      player.contract = {
        clubId: club.id,
        wage: Math.round(offer * 10) / 10,
        expires: state.season + rng.int(2, 5),
        releaseClause: player.contract.releaseClause,
        agentFeePct: player.contract.agentFeePct,
        brokeredBy: player.agentId,
        signedSeason: state.season,
      };
    }
  }

  return released;
}

function releaseToFreeAgency(state: GameState, player: Player): void {
  const club = player.clubId ? state.clubs[player.clubId] : null;
  if (club) club.playerIds = club.playerIds.filter((id) => id !== player.id);
  player.clubId = null;
  player.contract = null;
  player.value = estimateValue(player);
}

/** 무소속 선수 목록 — 능력 순. */
export function freeAgents(state: GameState): Player[] {
  return Object.values(state.players)
    .filter((p) => !p.retired && !p.clubId)
    .sort((a, b) => b.ca - a.ca);
}

/**
 * 자리가 빈 구단이 자유계약 선수를 데려갑니다. 좋은 구단이 먼저 고릅니다.
 * 유스 충원보다 먼저 돌려야 스쿼드가 애들로만 차지 않습니다.
 */
export function signFreeAgents(state: GameState, rng: Rng, minSquad: number): number {
  const pool = freeAgents(state);
  if (pool.length === 0) return 0;
  const taken = new Set<string>();
  let signings = 0;

  const clubs = Object.values(state.clubs).sort((a, b) => b.reputation - a.reputation);
  for (const club of clubs) {
    const country = COUNTRY_BY_ID[club.countryId];
    if (!country) continue;
    let bill = wageBill(club, state.players);
    let needed = minSquad - club.playerIds.length;
    if (needed <= 0) continue;

    // 골키퍼가 모자라면 골키퍼부터 채웁니다.
    const keepers = club.playerIds.filter((id) => state.players[id]?.group === 'GK').length;
    const ordered = keepers < 2
      ? [...pool.filter((p) => p.group === 'GK'), ...pool.filter((p) => p.group !== 'GK')]
      : pool;

    for (const player of ordered) {
      if (needed <= 0) break;
      if (taken.has(player.id) || player.clubId) continue;

      const wage = expectedWage(player, club.reputation, country);
      if (bill + wage > club.wageBudget * 1.05) continue;
      // 구단 체급에 안 맞는 선수는 거릅니다. 너무 좋아도 안 옵니다.
      const fit = player.ca <= club.reputation * 1.9 + 40 && player.ca >= club.reputation * 0.75 - 20;
      if (!fit) continue;

      const personality = PERSONALITY_BY_ID[player.personality];
      const appeal = clamp(0.35 + (club.reputation - 40) / 130 - (personality.ambition / 100) * 0.2, 0.1, 0.95);
      if (!rng.bool(appeal)) continue;

      player.clubId = club.id;
      player.contract = {
        clubId: club.id,
        wage: Math.round(wage * rng.float(0.9, 1.1) * 10) / 10,
        expires: state.season + rng.int(1, 4),
        releaseClause: 0,
        agentFeePct: Math.round(rng.float(2, 8)),
        brokeredBy: player.agentId,
        signedSeason: state.season,
      };
      player.value = estimateValue(player);
      club.playerIds.push(player.id);
      bill += player.contract.wage;
      taken.add(player.id);
      needed--;
      signings++;
    }
  }
  return signings;
}

/**
 * 오래 방치된 무소속 선수는 은퇴시킵니다. 그러지 않으면 세이브가 계속
 * 부풀고 스카우팅 목록이 쓰레기로 찹니다.
 */
export function retireStaleFreeAgents(state: GameState, rng: Rng): number {
  let count = 0;
  for (const player of freeAgents(state)) {
    const hopeless = player.age >= 31 || player.ca < 45;
    if (hopeless && rng.bool(0.55)) {
      player.retired = true;
      player.value = 0;
      count++;
    }
  }
  return count;
}

export interface AiDeal {
  playerId: string;
  playerName: string;
  fromClubId: string;
  toClubId: string;
  fee: number;
}

/**
 * 이적시장이 열린 주에 AI 구단끼리 거래합니다. 한 주에 몇 건만 처리해
 * 시장이 천천히 움직이는 느낌을 냅니다.
 */
export function runAiTransfers(state: GameState, rng: Rng, deals: number): AiDeal[] {
  const done: AiDeal[] = [];
  const clubIds = Object.keys(state.clubs);
  if (clubIds.length < 2) return done;

  for (let attempt = 0; attempt < deals * 8 && done.length < deals; attempt++) {
    const buyer = state.clubs[rng.pick(clubIds)];
    const seller = state.clubs[rng.pick(clubIds)];
    if (!buyer || !seller || buyer.id === seller.id) continue;
    if (seller.playerIds.length <= 20) continue;

    const country = COUNTRY_BY_ID[buyer.countryId];
    if (!country) continue;

    // 파는 쪽에서 벤치를 겉도는 선수를 고릅니다.
    const candidates = seller.playerIds
      .map((id) => state.players[id])
      .filter((p): p is Player => Boolean(p) && !p.retired && Boolean(p.contract));
    if (candidates.length === 0) continue;
    const player = rng.pick(candidates);
    const standing = squadStanding(player, seller, state.players);
    if (standing > 0.65 && !rng.bool(0.15)) continue;

    // 사는 쪽에는 전력 보강이 되어야 합니다.
    const buyerRanked = buyer.playerIds
      .map((id) => state.players[id])
      .filter((p): p is Player => Boolean(p))
      .sort((a, b) => b.ca - a.ca);
    const buyerEleventh = buyerRanked[10]?.ca ?? 0;
    if (player.ca < buyerEleventh - 4) continue;

    const fee = Math.round(player.value * rng.float(0.85, 1.4));
    if (fee > buyer.budget) continue;
    const wage = expectedWage(player, buyer.reputation, country);
    if (wageBill(buyer, state.players) + wage > buyer.wageBudget * 1.08) continue;

    const personality = PERSONALITY_BY_ID[player.personality];
    const stepUp = buyer.reputation - seller.reputation;
    const willing = clamp(0.3 + stepUp / 90 + (personality.ambition - personality.loyalty) / 220, 0.05, 0.92);
    if (!rng.bool(willing)) continue;

    seller.playerIds = seller.playerIds.filter((id) => id !== player.id);
    buyer.playerIds.push(player.id);
    buyer.budget -= fee;
    seller.budget += fee;
    player.clubId = buyer.id;
    player.contract = {
      clubId: buyer.id,
      wage: Math.round(wage * rng.float(0.95, 1.15) * 10) / 10,
      expires: state.season + rng.int(2, 5),
      releaseClause: rng.bool(0.25) ? Math.round(player.value * rng.float(1.6, 3)) : 0,
      agentFeePct: player.contract?.agentFeePct ?? 5,
      brokeredBy: player.agentId,
      signedSeason: state.season,
    };
    player.morale = clamp(player.morale + 8, 0, 100);
    player.value = estimateValue(player);

    done.push({
      playerId: player.id, playerName: player.name,
      fromClubId: seller.id, toClubId: buyer.id, fee,
    });
  }
  return done;
}
