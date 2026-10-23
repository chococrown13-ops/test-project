import { bestPosition, marketValue, roundMoney, wageDemand, formatMoney } from './ability';
import { H } from './attributes';
import { windowOpen } from './calendar';
import { STATUS_LABEL } from './dynamics';
import { payFee, wageBill } from './finance';
import { POS_LINE, POSITIONS, type Position } from './formations';
import { emptySeason } from './generate';
import { nextId, pushMessage } from './inbox';
import { Rng, clamp } from './rng';
import { autoSelect } from './tactics';
import type { Club, Contract, GameState, IncomingOffer, Money, Negotiation, Player, SquadStatus } from './types';

export const MAX_SQUAD = 32;
export const MIN_SQUAD = 18;

/* ----------------------------------------------------------------- pricing */

function statusRank(club: Club, state: GameState, player: Player): number {
  return club.playerIds
    .map((id) => state.players[id])
    .filter((p): p is Player => !!p)
    .sort((a, b) => b.ca - a.ca)
    .findIndex((p) => p.id === player.id);
}

/** What the selling club wants. Key men cost a premium; unwanted ones are cheap. */
export function askingPrice(state: GameState, player: Player): Money {
  const value = marketValue(player, state.season);
  if (!player.clubId) return 0;
  const club = state.clubs[player.clubId];
  const rank = statusRank(club, state, player);
  let mult = rank < 3 ? 1.9 : rank < 11 ? 1.4 : rank < 17 ? 1.1 : 0.85;
  if (player.listed === 'transfer') mult *= 0.8;
  if (player.unhappy) mult *= 0.85;
  const years = player.contract ? player.contract.expires - state.season : 0;
  if (years <= 0) mult *= 0.7;
  if (player.youth) mult *= 1.2;
  const price = roundMoney(value * mult);
  const clause = player.contract?.releaseClause;
  return clause ? Math.min(price, clause) : price;
}

export function isWindowOpen(state: GameState): boolean {
  return windowOpen(state.dates, state.day) !== null;
}

export interface BidResponse {
  result: 'accepted' | 'rejected' | 'countered';
  counter?: Money;
  message: string;
}

/** The selling club's answer to a bid (AI clubs only). */
export function respondToBid(state: GameState, player: Player, fee: Money, buyerId: string, deal: 'transfer' | 'loan'): BidResponse {
  const seller = player.clubId ? state.clubs[player.clubId] : null;
  if (!seller) return { result: 'accepted', message: '자유계약 선수입니다.' };
  const squadSize = seller.playerIds.length;
  const keepers = seller.playerIds.filter((id) => (state.players[id]?.positions.GK ?? 0) >= 15).length;
  if (squadSize <= MIN_SQUAD || ((player.positions.GK ?? 0) >= 15 && keepers <= 2)) {
    return { result: 'rejected', message: `${seller.name}: 선수단이 부족해 지금은 내줄 수 없습니다.` };
  }
  if (deal === 'loan') {
    const rank = statusRank(seller, state, player);
    if (rank < 14 && !player.listed) return { result: 'rejected', message: `${seller.name}: 주전 자원은 임대 보낼 생각이 없습니다.` };
    return { result: 'accepted', message: `${seller.name}이(가) 임대에 동의했습니다.` };
  }
  const clause = player.contract?.releaseClause;
  if (clause && fee >= clause) return { result: 'accepted', message: '바이아웃 금액을 충족해 자동으로 수락되었습니다.' };
  const asking = askingPrice(state, player);
  // Rivals in the same division pay a little more.
  const rival = state.clubs[buyerId]?.division === seller.division ? 1.08 : 1;
  const target = roundMoney(asking * rival);
  if (fee >= target) return { result: 'accepted', message: `${seller.name}이(가) 제안을 수락했습니다.` };
  if (fee >= target * 0.7) return { result: 'countered', counter: target, message: `${seller.name}: ${formatMoney(target)}이라면 생각해 보겠습니다.` };
  return { result: 'rejected', counter: target, message: `${seller.name}: 터무니없는 금액입니다. 협상할 가치가 없습니다.` };
}

/* --------------------------------------------------------------- contracts */

export interface Demands {
  wage: Money;
  years: number;
  status: SquadStatus;
  willing: boolean;
  reason?: string;
}

const STATUS_WAGE: Record<SquadStatus, number> = { key: 1.25, first: 1.1, rotation: 1, backup: 0.9, prospect: 0.7 };
export const STATUSES: SquadStatus[] = ['key', 'first', 'rotation', 'backup', 'prospect'];

/** The status a player thinks he'd have in a squad, from where he'd rank. */
export function expectedStatus(state: GameState, player: Player, club: Club): SquadStatus {
  if (player.age <= 19 && player.ca < 100) return 'prospect';
  const better = club.playerIds.filter((id) => id !== player.id && (state.players[id]?.ca ?? 0) > player.ca).length;
  if (better < 3) return 'key';
  if (better < 11) return 'first';
  if (better < 17) return 'rotation';
  return 'backup';
}

export function playerDemands(state: GameState, player: Player, club: Club, kind: Negotiation['kind']): Demands {
  const status = expectedStatus(state, player, club);
  let wage = wageDemand(player, club.reputation) * STATUS_WAGE[status];
  if (kind === 'free') wage *= 1.15;
  if (kind === 'renewal' && player.contract) wage = Math.max(wage, player.contract.wage * 1.05);
  const years = player.age < 24 ? 4 : player.age < 30 ? 3 : player.age < 33 ? 2 : 1;

  let willing = true;
  let reason: string | undefined;
  const gap = player.reputation - club.reputation;
  if (kind === 'renewal') {
    if (player.unhappy) {
      willing = false;
      reason = '현재 팀에서의 처우에 불만이 있어 재계약을 원하지 않습니다.';
    } else if (gap > 25 && player.hidden[H.ambition] >= 14) {
      willing = false;
      reason = '더 큰 구단에서 뛰고 싶어 합니다.';
    }
  } else if (gap > 30 && !player.unhappy && player.hidden[H.ambition] >= 10) {
    willing = false;
    reason = `${club.name}은(는) 자신의 수준에 맞지 않는다고 생각합니다.`;
  } else if (player.clubId && state.clubs[player.clubId] && state.clubs[player.clubId].division < club.division - 1) {
    willing = false;
    reason = '두 단계 아래 리그로 내려갈 생각은 없습니다.';
  }
  return { wage: roundMoney(wage), years, status, willing, reason };
}

export interface ContractAnswer {
  result: 'accepted' | 'countered' | 'rejected';
  message: string;
  counterWage?: Money;
}

export function evaluateContract(state: GameState, neg: Negotiation, wage: Money, years: number, status: SquadStatus, rng: Rng): ContractAnswer {
  const player = state.players[neg.playerId];
  const wantedRank = STATUSES.indexOf(neg.demandStatus);
  const offeredRank = STATUSES.indexOf(status);
  // A lower squad status than expected has to be paid for.
  const statusPenalty = offeredRank > wantedRank ? 1 + (offeredRank - wantedRank) * 0.15 : offeredRank < wantedRank ? 0.95 : 1;
  const required = neg.demandWage * statusPenalty;
  const yearsOk = Math.abs(years - neg.demandYears) <= 1 || (player.age >= 30 && years >= neg.demandYears);
  const ratio = wage / required;
  if (ratio >= 1 && yearsOk) return { result: 'accepted', message: `${player.name}이(가) 조건에 합의했습니다.` };
  if (ratio >= 0.88 && rng.bool(0.25 + (ratio - 0.88) * 4)) return { result: 'accepted', message: `${player.name}이(가) 조금 고민한 끝에 합의했습니다.` };
  if (neg.log.length >= 6) return { result: 'rejected', message: `${player.name}: 더 이상 협상하지 않겠습니다.` };
  const counter = roundMoney(required * (yearsOk ? 1 : 1.05));
  return {
    result: 'countered',
    counterWage: counter,
    message: `${player.name}: 주급 ${formatMoney(counter)}${yearsOk ? '' : `, ${neg.demandYears}년 계약`}${offeredRank > wantedRank ? ` (${STATUS_LABEL[neg.demandStatus]} 대우를 원함)` : ''}이면 사인하겠습니다.`,
  };
}

/* ---------------------------------------------------------------- moving */

function removeFromClub(state: GameState, player: Player): void {
  if (!player.clubId) return;
  const club = state.clubs[player.clubId];
  if (!club) return;
  club.playerIds = club.playerIds.filter((id) => id !== player.id);
  club.youthIds = club.youthIds.filter((id) => id !== player.id);
  club.tactic.lineup = club.tactic.lineup.map((id) => (id === player.id ? null : id));
  club.tactic.bench = club.tactic.bench.filter((id) => id !== player.id);
  if (club.tactic.captain === player.id) club.tactic.captain = null;
  if (club.id !== state.clubId) autoSelect(club, state.players);
}

export function executeTransfer(
  state: GameState,
  player: Player,
  toClubId: string | null,
  fee: Money,
  contract: Contract | null,
  loan?: { parentPays: number },
): void {
  const fromId = player.clubId;
  const from = fromId ? state.clubs[fromId] : null;
  const to = toClubId ? state.clubs[toClubId] : null;
  removeFromClub(state, player);

  if (loan && from) {
    player.loan = { fromClubId: from.id, until: state.dates.end, parentPays: loan.parentPays };
  } else {
    player.loan = null;
    if (fee > 0) payFee(to, from, fee);
    player.contract = contract;
  }
  player.clubId = toClubId;
  player.youth = false;
  player.listed = null;
  player.unhappy = null;
  player.recentMinutes = [];
  player.morale = clamp(player.morale + 10, 0, 100);
  if (to) {
    to.playerIds.push(player.id);
    player.seasons.push(emptySeason(state.season, to.id));
    if (to.id !== state.clubId) autoSelect(to, state.players);
  }
  if (toClubId === state.clubId || fromId === state.clubId) state.knowledge[player.id] = 100;
  player.value = marketValue(player, state.season);

  state.transfers.unshift({
    day: state.day,
    season: state.season,
    playerId: player.id,
    playerName: player.name,
    fromId,
    toId: toClubId,
    fee,
    loan: !!loan,
  });
  if (state.transfers.length > 300) state.transfers.length = 300;

  state.offers = state.offers.filter((o) => o.playerId !== player.id || o.status === 'completed');
  state.pitches = state.pitches.filter((p) => p.playerId !== player.id);
  state.negotiations = state.negotiations.filter((n) => n.playerId !== player.id || n.stage === 'done');
  if (toClubId === state.clubId) state.shortlist = state.shortlist.filter((id) => id !== player.id);
}

/** Return loanees to their parent clubs (season end, or recall). */
export function endLoan(state: GameState, player: Player): void {
  if (!player.loan) return;
  const parent = state.clubs[player.loan.fromClubId];
  removeFromClub(state, player);
  player.loan = null;
  player.clubId = parent?.id ?? null;
  if (parent) {
    parent.playerIds.push(player.id);
    player.seasons.push(emptySeason(state.season, parent.id));
    if (parent.id !== state.clubId) autoSelect(parent, state.players);
  }
}

export function releasePlayer(state: GameState, player: Player, payout = true): void {
  const club = player.clubId ? state.clubs[player.clubId] : null;
  if (club && payout && player.contract) {
    // Pay up the remaining contract (simplified: half of what's left).
    const weeksLeft = Math.max(0, (player.contract.expires - state.season + 1) * 52 - 26);
    club.balance -= Math.round(player.contract.wage * weeksLeft * 0.5);
  }
  removeFromClub(state, player);
  player.clubId = null;
  player.contract = null;
  player.loan = null;
  player.listed = null;
}

/* -------------------------------------------------------- user negotiations */

export function canAffordWage(state: GameState, wage: Money): boolean {
  const club = state.clubs[state.clubId];
  return wageBill(state, club) + wage <= club.wageBudget;
}

export function startNegotiation(state: GameState, playerId: string, kind: Negotiation['kind']): Negotiation | string {
  const player = state.players[playerId];
  const club = state.clubs[state.clubId];
  if (!player) return '선수를 찾을 수 없습니다.';
  if (kind !== 'renewal' && kind !== 'free' && !isWindowOpen(state)) return '이적시장이 닫혀 있습니다. 자유계약 선수만 영입할 수 있습니다.';
  if (kind !== 'renewal' && club.playerIds.length >= MAX_SQUAD) return `선수단이 가득 찼습니다 (최대 ${MAX_SQUAD}명).`;
  const existing = state.negotiations.find((n) => n.playerId === playerId && n.stage !== 'done' && n.stage !== 'failed');
  if (existing) return existing;
  const demands = playerDemands(state, player, club, kind);
  if (!demands.willing) return `${player.name}: ${demands.reason}`;
  const neg: Negotiation = {
    id: nextId(state, 'n'),
    playerId,
    sellerId: kind === 'renewal' || kind === 'free' ? null : player.clubId,
    kind,
    stage: kind === 'renewal' || kind === 'free' ? 'contract' : 'fee',
    offeredFee: 0,
    askingFee: kind === 'transfer' ? askingPrice(state, player) : 0,
    demandWage: demands.wage,
    demandYears: demands.years,
    demandStatus: demands.status,
    log: [],
    day: state.day,
    loanParentPays: kind === 'loan' ? 0.5 : undefined,
  };
  state.negotiations.unshift(neg);
  return neg;
}

export function submitBid(state: GameState, negId: string, fee: Money, parentPays?: number): BidResponse {
  const neg = state.negotiations.find((n) => n.id === negId);
  if (!neg || neg.stage !== 'fee') return { result: 'rejected', message: '진행 중인 협상이 아닙니다.' };
  const player = state.players[neg.playerId];
  const club = state.clubs[state.clubId];
  if (neg.kind === 'transfer' && fee > club.transferBudget) return { result: 'rejected', message: `이적 예산(${formatMoney(club.transferBudget)})을 넘는 금액입니다.` };
  neg.offeredFee = fee;
  if (parentPays !== undefined) neg.loanParentPays = parentPays;
  const answer = respondToBid(state, player, fee, state.clubId, neg.kind === 'loan' ? 'loan' : 'transfer');
  neg.log.push(neg.kind === 'loan' ? `임대 제안` : `이적료 ${formatMoney(fee)} 제시 → ${answer.message}`);
  if (answer.result === 'accepted') {
    neg.stage = 'contract';
    if (neg.kind === 'loan') {
      // On loan the parent club's contract stands; only the wage split matters.
      neg.demandWage = player.contract?.wage ?? neg.demandWage;
    }
  } else if (answer.result === 'countered' && answer.counter) {
    neg.askingFee = answer.counter;
  } else {
    neg.stage = neg.log.length >= 4 ? 'failed' : 'fee';
    if (answer.counter) neg.askingFee = answer.counter;
  }
  return answer;
}

export function submitContract(state: GameState, negId: string, wage: Money, years: number, status: SquadStatus, rng: Rng): ContractAnswer {
  const neg = state.negotiations.find((n) => n.id === negId);
  if (!neg || neg.stage !== 'contract') return { result: 'rejected', message: '진행 중인 협상이 아닙니다.' };
  const player = state.players[neg.playerId];
  const club = state.clubs[state.clubId];

  if (neg.kind === 'loan') {
    const ourShare = Math.round((player.contract?.wage ?? 0) * (1 - (neg.loanParentPays ?? 0.5)));
    if (!canAffordWage(state, ourShare)) return { result: 'rejected', message: '임금 예산이 부족합니다.' };
    executeTransfer(state, player, club.id, 0, player.contract, { parentPays: neg.loanParentPays ?? 0.5 });
    neg.stage = 'done';
    pushMessage(state, '단장', `임대 영입 — ${player.name}`, `${player.name}을(를) 시즌 종료까지 임대로 데려왔습니다.`, 'good', { type: 'player', id: player.id });
    return { result: 'accepted', message: '임대 계약이 완료되었습니다.' };
  }

  const extra = neg.kind === 'renewal' && player.contract ? player.contract.wage : 0;
  if (!canAffordWage(state, wage - extra)) return { result: 'rejected', message: `임금 예산을 초과합니다 (주급 예산 ${formatMoney(club.wageBudget)}).` };
  const answer = evaluateContract(state, neg, wage, years, status, rng);
  neg.log.push(`주급 ${formatMoney(wage)}, ${years}년, ${STATUS_LABEL[status]} → ${answer.message}`);
  if (answer.result === 'accepted') {
    neg.stage = 'done';
    const contract: Contract = { wage, expires: state.season + years, status };
    if (neg.kind === 'renewal') {
      player.contract = { ...contract, releaseClause: player.contract?.releaseClause };
      player.morale = clamp(player.morale + 8, 0, 100);
      pushMessage(state, '단장', `재계약 — ${player.name}`, `${player.name}과(와) ${years}년 재계약에 합의했습니다. 주급 ${formatMoney(wage)}.`, 'good', { type: 'player', id: player.id });
    } else {
      const fee = neg.kind === 'transfer' ? neg.offeredFee : 0;
      const from = player.clubId ? state.clubs[player.clubId]?.name : '자유계약';
      executeTransfer(state, player, club.id, fee, contract);
      pushMessage(
        state,
        '단장',
        `영입 완료 — ${player.name}`,
        `${from}에서 ${player.name}을(를) 영입했습니다.\n이적료 ${formatMoney(fee)}, 주급 ${formatMoney(wage)}, ${years}년 계약.`,
        'good',
        { type: 'player', id: player.id },
      );
    }
  } else if (answer.result === 'countered' && answer.counterWage) {
    neg.demandWage = answer.counterWage;
  } else {
    neg.stage = 'failed';
  }
  return answer;
}

/* -------------------------------------------------------- offers for our players */

export function respondToOffer(state: GameState, offerId: string, action: 'accept' | 'reject' | 'counter', counterFee: Money | undefined, rng: Rng): string {
  const offer = state.offers.find((o) => o.id === offerId);
  if (!offer || offer.status !== 'open') return '유효하지 않은 제안입니다.';
  const player = state.players[offer.playerId];
  const buyer = state.clubs[offer.fromClubId];
  if (!player || !buyer || player.clubId !== state.clubId) {
    offer.status = 'collapsed';
    return '제안이 더 이상 유효하지 않습니다.';
  }
  if (action === 'reject') {
    offer.status = 'rejected';
    return `${buyer.name}의 제안을 거절했습니다.`;
  }
  if (action === 'counter' && counterFee) {
    const value = marketValue(player, state.season);
    const ok = counterFee <= Math.min(buyer.transferBudget, value * 1.5) && rng.bool(clamp(1.6 - counterFee / Math.max(1, offer.fee), 0.1, 0.9));
    if (!ok) {
      offer.status = 'rejected';
      return `${buyer.name}: 그 금액은 무리입니다. 협상을 끝내겠습니다.`;
    }
    offer.fee = counterFee;
  }
  if (offer.deal === 'loan') {
    executeTransfer(state, player, buyer.id, 0, player.contract, { parentPays: 0.3 });
  } else {
    const contract: Contract = { wage: wageDemand(player, buyer.reputation), expires: state.season + (player.age < 28 ? 4 : 2), status: expectedStatus(state, player, buyer) };
    executeTransfer(state, player, buyer.id, offer.fee, contract);
  }
  offer.status = 'completed';
  pushMessage(state, '단장', `${offer.deal === 'loan' ? '임대' : '이적'} 완료 — ${player.name}`, `${player.name}이(가) ${buyer.name}(으)로 ${offer.deal === 'loan' ? '임대 이적' : `이적했습니다. 이적료 ${formatMoney(offer.fee)}`}.`, 'neutral');
  return `${player.name}의 ${offer.deal === 'loan' ? '임대' : '이적'}가 완료되었습니다.`;
}

/* ------------------------------------------------------------- AI behaviour */

function lineCounts(state: GameState, club: Club): Record<string, number> {
  const counts: Record<string, number> = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  club.playerIds.forEach((id) => {
    const p = state.players[id];
    if (p) counts[POS_LINE[bestPosition(p)]]++;
  });
  return counts;
}

const LINE_TARGET: Record<string, number> = { GK: 3, DEF: 8, MID: 8, ATT: 6 };

/** Position an AI club most needs, or null if it's settled. */
export function clubNeed(state: GameState, club: Club, rng: Rng): Position | null {
  const counts = lineCounts(state, club);
  const short = Object.entries(LINE_TARGET).find(([line, target]) => counts[line] < target);
  const linePos: Record<string, Position[]> = { GK: ['GK'], DEF: ['DC', 'DL', 'DR'], MID: ['DM', 'MC', 'ML', 'MR'], ATT: ['AML', 'AMR', 'AMC', 'ST'] };
  if (short) return rng.pick(linePos[short[0]]);
  // Otherwise upgrade the weakest starter now and then.
  if (!rng.bool(0.4)) return null;
  const xi = club.tactic.lineup.map((id) => (id ? state.players[id] : null)).filter((p): p is Player => !!p);
  const weakest = xi.sort((a, b) => a.ca - b.ca)[0];
  return weakest ? bestPosition(weakest) : null;
}

function averageXI(state: GameState, club: Club): number {
  const xi = club.tactic.lineup.map((id) => (id ? state.players[id] : null)).filter((p): p is Player => !!p);
  return xi.length ? xi.reduce((s, p) => s + p.ca, 0) / xi.length : 80;
}

/** One day of AI market activity while a window is open. */
export function aiMarketDay(state: GameState, rng: Rng): void {
  if (!isWindowOpen(state)) return;
  const all = Object.values(state.players);
  const aiClubs = Object.values(state.clubs).filter((c) => c.id !== state.clubId);

  aiClubs.forEach((club) => {
    if (!rng.bool(0.05)) return;
    if (club.playerIds.length >= 30) return;
    const need = clubNeed(state, club, rng);
    if (!need) return;
    const bar = averageXI(state, club) - 2;
    const pool: Player[] = [];
    for (let i = 0; i < 80; i++) {
      const p = all[rng.int(0, all.length - 1)];
      if (p.clubId === club.id || p.loan || p.youth) continue;
      if ((p.positions[need] ?? 0) < 15) continue;
      if (p.ca < bar || p.age > 31 || p.age < 18) continue;
      const seller = p.clubId ? state.clubs[p.clubId] : null;
      if (seller && seller.reputation > club.reputation + 8 && !p.listed && !p.unhappy) continue;
      pool.push(p);
    }
    if (pool.length === 0) return;
    const target = pool.sort((a, b) => b.ca / (b.value + 50) - a.ca / (a.value + 50))[0];
    const asking = askingPrice(state, target);
    if (asking > club.transferBudget) return;
    if (target.clubId === state.clubId) {
      makeOfferToUser(state, club, target, Math.round(asking * rng.float(0.8, 1.05)), 'transfer');
      return;
    }
    const answer = target.clubId ? respondToBid(state, target, asking, club.id, 'transfer') : { result: 'accepted' as const };
    if (answer.result !== 'accepted') return;
    const contract: Contract = { wage: wageDemand(target, club.reputation), expires: state.season + (target.age < 27 ? rng.int(2, 4) : rng.int(1, 2)), status: expectedStatus(state, target, club) };
    executeTransfer(state, target, club.id, target.clubId ? asking : 0, contract);
  });

  // Loan bids for the user's loan-listed youngsters, and interest in transfer-listed ones.
  const mine = state.clubs[state.clubId].playerIds.map((id) => state.players[id]).filter((p): p is Player => !!p);
  mine.forEach((p) => {
    if (p.listed === 'loan' && rng.bool(0.04)) {
      const club = rng.pick(aiClubs.filter((c) => c.division >= state.clubs[state.clubId].division));
      if (club) makeOfferToUser(state, club, p, 0, 'loan');
    }
    if (p.listed === 'transfer' && rng.bool(0.05)) {
      const buyers = aiClubs.filter((c) => c.transferBudget > p.value * 0.7 && Math.abs(averageXI(state, c) - p.ca) < 20);
      if (buyers.length) {
        const buyer = rng.pick(buyers);
        makeOfferToUser(state, buyer, p, Math.round(marketValue(p, state.season) * rng.float(0.7, 1.0)), 'transfer');
      }
    }
  });

  // FM26 Pitch Opportunities: AI clubs advertise what they're after.
  state.aiRequirements = state.aiRequirements.filter((r) => r.until > state.day);
  if (state.aiRequirements.length < 8 && rng.bool(0.3)) {
    const club = rng.pick(aiClubs);
    const need = clubNeed(state, club, rng) ?? rng.pick(POSITIONS.filter((p) => p !== 'GK'));
    state.aiRequirements.push({
      id: nextId(state, 'ar'),
      clubId: club.id,
      position: need,
      maxAge: rng.pick([23, 26, 29, 32]),
      maxFee: Math.max(0, Math.round(club.transferBudget * rng.float(0.2, 0.6))),
      deal: rng.bool(0.25) ? 'loan' : 'transfer',
      until: state.day + rng.int(10, 25),
    });
  }
}

export function makeOfferToUser(state: GameState, buyer: Club, player: Player, fee: Money, deal: 'transfer' | 'loan'): IncomingOffer | null {
  if (state.offers.some((o) => o.playerId === player.id && o.fromClubId === buyer.id && o.status === 'open')) return null;
  const offer: IncomingOffer = {
    id: nextId(state, 'o'),
    playerId: player.id,
    fromClubId: buyer.id,
    fee: Math.max(0, roundMoney(fee)),
    deal,
    expires: state.day + 5,
    status: 'open',
  };
  state.offers.unshift(offer);
  pushMessage(
    state,
    buyer.name,
    `${deal === 'loan' ? '임대' : '이적'} 제안 — ${player.name}`,
    deal === 'loan'
      ? `${buyer.name}이(가) ${player.name}의 시즌 임대를 원합니다. 임대 기간 주급의 70%를 부담합니다.`
      : `${buyer.name}이(가) ${player.name} 영입을 위해 ${formatMoney(offer.fee)}를 제안했습니다.\n제안은 ${5}일 뒤 만료됩니다.`,
    'action',
    { type: 'offer', id: offer.id },
  );
  return offer;
}

/** Offer one of our players to an AI club's advertised requirement. */
export function pitchToAiRequirement(state: GameState, requirementId: string, playerId: string, rng: Rng): string {
  const req = state.aiRequirements.find((r) => r.id === requirementId);
  const player = state.players[playerId];
  if (!req || !player) return '요청을 찾을 수 없습니다.';
  const club = state.clubs[req.clubId];
  if ((player.positions[req.position] ?? 0) < 13) return `${club.name}: 우리가 찾는 포지션의 선수가 아닙니다.`;
  if (player.age > req.maxAge) return `${club.name}: 나이가 너무 많습니다.`;
  const bar = averageXI(state, club) - 12;
  if (player.ca < bar) return `${club.name}: 우리 팀 수준에는 조금 부족합니다.`;
  const value = marketValue(player, state.season);
  const fee = req.deal === 'loan' ? 0 : Math.min(req.maxFee, Math.round(value * rng.float(0.75, 1.05)));
  if (req.deal === 'transfer' && fee < value * 0.5) return `${club.name}: 그 선수에게 그만한 돈을 쓸 수는 없습니다.`;
  makeOfferToUser(state, club, player, fee, req.deal);
  state.aiRequirements = state.aiRequirements.filter((r) => r.id !== requirementId);
  return `${club.name}이(가) 관심을 보이며 공식 제안을 보내왔습니다.`;
}

/** Offers lapse after a few days. */
export function expireOffers(state: GameState): void {
  state.offers.forEach((o) => {
    if (o.status === 'open' && o.expires < state.day) o.status = 'collapsed';
  });
  state.offers = state.offers.filter((o) => o.status === 'open' || state.day - o.expires < 20);
  state.negotiations = state.negotiations.filter((n) => (n.stage !== 'done' && n.stage !== 'failed') || state.day - n.day < 14);
}

/** Pre-season and January: AI sides top up from the free-agent pool. */
export function aiSignFreeAgents(state: GameState, rng: Rng): void {
  const free = Object.values(state.players).filter((p) => !p.clubId && !p.youth && p.age <= 33);
  if (free.length === 0) return;
  Object.values(state.clubs).forEach((club) => {
    if (club.id === state.clubId || club.playerIds.length >= 22 || !rng.bool(0.3)) return;
    const need = clubNeed(state, club, rng);
    const candidates = free.filter((p) => !p.clubId && (!need || (p.positions[need] ?? 0) >= 15)).sort((a, b) => b.ca - a.ca);
    const pick = candidates.find((p) => p.reputation <= club.reputation + 20);
    if (!pick) return;
    executeTransfer(state, pick, club.id, 0, { wage: wageDemand(pick, club.reputation), expires: state.season + 1, status: expectedStatus(state, pick, club) });
  });
}
