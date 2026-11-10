import { autoPickLineup, nextId } from './generate';
import { Rng, clamp } from './rng';
import { overall } from './ratings';
import type { GameState, Player, Team, TransferOffer } from './types';

/** Squads may not shrink below this — you cannot sell your way to nine men. */
export const MIN_SQUAD = 18;
/** Nor grow without limit. */
export const MAX_SQUAD = 28;
/** Every club must keep at least this many keepers. */
const MIN_KEEPERS = 2;

export interface WindowInfo {
  open: boolean;
  /** Human-readable label for the current or next window. */
  label: string;
  /** Round the next window opens, when currently closed. */
  opensAtRound: number | null;
}

/**
 * Two windows a season, mirroring the real calendar: a pre-season one before
 * the opening rounds and a shorter mid-season one.
 */
export function transferWindow(round: number, totalRounds: number): WindowInfo {
  const midpoint = Math.floor(totalRounds / 2);
  const preSeasonEnd = 2;
  const midEnd = midpoint + 1;

  if (round <= preSeasonEnd) {
    return { open: true, label: '프리시즌 이적시장', opensAtRound: null };
  }
  if (round >= midpoint && round <= midEnd) {
    return { open: true, label: '겨울 이적시장', opensAtRound: null };
  }
  if (round < midpoint) {
    return { open: false, label: '겨울 이적시장', opensAtRound: midpoint };
  }
  return { open: false, label: '다음 시즌 프리시즌 이적시장', opensAtRound: null };
}

/**
 * What a selling club wants for a player. Market price sits above the raw
 * valuation — clubs do not sell their better players at book value.
 */
export function askingPrice(player: Player, seller: Team): number {
  const base = player.value;

  // Losing a first-choice player hurts more than losing squad filler.
  const ranked = seller.players
    .filter((p) => p.role === player.role || p.group === player.group)
    .sort((a, b) => overall(b) - overall(a));
  const depthRank = ranked.findIndex((p) => p.id === player.id);
  const keyPlayer = depthRank === 0 && ranked.length > 1;

  let multiplier = 1.35;
  if (keyPlayer) multiplier += 0.35;
  if (player.age <= 23 && player.potential - overall(player) > 10) multiplier += 0.3;
  if (player.form > 75) multiplier += 0.15;
  if (player.age >= 32) multiplier -= 0.25;
  if (player.injuredFor > 0) multiplier -= 0.15;

  return Math.max(10, Math.round(base * multiplier));
}

export interface BidResult {
  accepted: boolean;
  reason: string;
}

/** Reasons a club will not sell regardless of the money on the table. */
function blockedFromSelling(player: Player, seller: Team): string | null {
  if (seller.players.length <= MIN_SQUAD) {
    return `${seller.name}의 스쿼드가 최소 인원(${MIN_SQUAD}명)이라 판매하지 않습니다.`;
  }
  if (player.role === 'GK') {
    const keepers = seller.players.filter((p) => p.role === 'GK').length;
    if (keepers <= MIN_KEEPERS) {
      return `${seller.name}이(가) 골키퍼 자원이 부족해 이적을 거절했습니다.`;
    }
  }
  return null;
}

/** Evaluate the user's bid for an AI club's player. */
export function evaluateBid(
  buyer: Team,
  seller: Team,
  player: Player,
  fee: number,
  rng: Rng,
): BidResult {
  if (buyer.players.length >= MAX_SQUAD) {
    return { accepted: false, reason: `스쿼드가 가득 찼습니다 (최대 ${MAX_SQUAD}명).` };
  }
  if (fee > buyer.budget) {
    return { accepted: false, reason: '이적 예산이 부족합니다.' };
  }

  const wageAfter = buyer.players.reduce((sum, p) => sum + p.wage, 0) + player.wage;
  if (wageAfter > buyer.wageBudget) {
    return { accepted: false, reason: '주급 상한을 초과합니다. 먼저 선수를 정리하세요.' };
  }

  const blocked = blockedFromSelling(player, seller);
  if (blocked) return { accepted: false, reason: blocked };

  const asking = askingPrice(player, seller);
  // A little negotiating room either way, so the same bid is not always a
  // guaranteed yes or no.
  const threshold = asking * rng.float(0.94, 1.06);

  if (fee >= threshold) {
    return { accepted: true, reason: '이적 합의가 성사되었습니다.' };
  }
  const shortfall = Math.round(((threshold - fee) / threshold) * 100);
  return {
    accepted: false,
    reason:
      shortfall > 30
        ? `${seller.name}이(가) 제안을 일축했습니다. 요구액에 크게 못 미칩니다.`
        : `${seller.name}이(가) 제안을 거절했습니다. 조금 더 올리면 협상 여지가 있습니다.`,
  };
}

/**
 * Move a player between clubs and settle the fee. Both squads re-pick their
 * sides afterwards so nobody is left with a hole in the lineup.
 */
export function executeTransfer(
  state: GameState,
  player: Player,
  from: Team,
  to: Team,
  fee: number,
): void {
  from.players = from.players.filter((p) => p.id !== player.id);
  from.lineup = from.lineup.filter((id) => id !== player.id);
  from.bench = from.bench.filter((id) => id !== player.id);

  // A new signing arrives fresh but needs time to settle in.
  player.morale = clamp(player.morale + 8, 20, 100);
  player.form = clamp(player.form - 4, 20, 100);
  to.players.push(player);

  from.budget += fee;
  to.budget -= fee;

  [from, to].forEach((team) => {
    const picked = autoPickLineup(team);
    team.lineup = picked.lineup;
    team.bench = picked.bench;
  });

  state.transfer.log.unshift({
    season: state.season,
    round: state.round,
    playerName: player.name,
    fromName: from.name,
    toName: to.name,
    fee,
  });
  if (state.transfer.log.length > 60) state.transfer.log.length = 60;

  // Any pending offer for this player is void once he has moved.
  state.transfer.offers = state.transfer.offers.filter((o) => o.playerId !== player.id);
  state.transfer.listed = state.transfer.listed.filter((id) => id !== player.id);
}

/** Every player at another club that the user could try to sign. */
export function transferTargets(state: GameState): { player: Player; team: Team }[] {
  return Object.values(state.teams)
    .filter((team) => team.id !== state.clubId)
    .flatMap((team) => team.players.map((player) => ({ player, team })));
}

/**
 * How much an AI club wants a player, 0 when it has no interest. Clubs chase
 * players who would improve their first eleven and that they can afford.
 *
 * `relaxed` widens the net for players who are known to be available: a club
 * will take squad depth off your hands even when he would not walk into
 * their first team, which is how a transfer list actually clears.
 */
function interestIn(buyer: Team, player: Player, relaxed = false): number {
  if (buyer.players.length >= MAX_SQUAD) return 0;

  const wageAfter = buyer.players.reduce((sum, p) => sum + p.wage, 0) + player.wage;
  if (wageAfter > buyer.wageBudget) return 0;

  const sameGroup = buyer.players
    .filter((p) => p.group === player.group)
    .sort((a, b) => overall(b) - overall(a));
  const best = sameGroup[0] ? overall(sameGroup[0]) : 0;
  const ability = overall(player);

  // Only interested if he is close to, or better than, what they already have.
  const tolerance = relaxed ? 14 : 4;
  if (ability < best - tolerance) return 0;
  return ability - best + tolerance + 1;
}

/** Generate bids from AI clubs for the user's listed and star players. */
export function generateOffers(state: GameState, rng: Rng): TransferOffer[] {
  const club = state.teams[state.clubId];
  const rivals = Object.values(state.teams).filter((t) => t.id !== state.clubId);
  const created: TransferOffer[] = [];

  club.players.forEach((player) => {
    const isListed = state.transfer.listed.includes(player.id);
    // Listed players attract attention; unlisted ones only occasionally.
    const chance = isListed ? 0.45 : overall(player) >= 70 ? 0.06 : 0.015;
    if (!rng.bool(chance)) return;
    if (state.transfer.offers.some((o) => o.playerId === player.id)) return;
    if (club.players.length <= MIN_SQUAD) return;

    const suitors = rivals
      .map((team) => ({ team, interest: interestIn(team, player, isListed) }))
      .filter(({ team, interest }) => interest > 0 && team.budget >= player.value);
    if (suitors.length === 0) return;

    const { team } = rng.pick(suitors);
    const asking = askingPrice(player, club);
    // Listed players draw lower bids; clubs know you want them gone.
    const fee = Math.round(
      Math.min(team.budget, asking * rng.float(isListed ? 0.7 : 0.95, isListed ? 1.05 : 1.3)),
    );

    created.push({
      id: nextId('o'),
      playerId: player.id,
      fromTeamId: team.id,
      fee,
      expiresRound: state.round + 2,
    });
  });

  return created;
}

/** A few deals between AI clubs each round, so the league moves without you. */
export function runAiTransfers(state: GameState, rng: Rng): void {
  const rivals = Object.values(state.teams).filter((t) => t.id !== state.clubId);
  const attempts = rng.int(0, 3);

  for (let i = 0; i < attempts; i++) {
    const buyer = rng.pick(rivals);
    const sellers = rivals.filter((t) => t.id !== buyer.id && t.players.length > MIN_SQUAD);
    if (sellers.length === 0) continue;

    const seller = rng.pick(sellers);
    const candidates = seller.players.filter(
      (p) => !blockedFromSelling(p, seller) && interestIn(buyer, p) > 0,
    );
    if (candidates.length === 0) continue;

    const player = rng.pick(candidates);
    const fee = askingPrice(player, seller);
    if (fee > buyer.budget) continue;

    executeTransfer(state, player, seller, buyer, fee);
  }
}

/** Drop offers that have lapsed. Called when the round advances. */
export function expireOffers(state: GameState): TransferOffer[] {
  const expired = state.transfer.offers.filter((o) => o.expiresRound < state.round);
  state.transfer.offers = state.transfer.offers.filter((o) => o.expiresRound >= state.round);
  return expired;
}

export const emptyTransferState = () => ({ listed: [], offers: [], log: [] });
