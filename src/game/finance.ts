import { dateOf } from './calendar';
import { recentForm } from './competition';
import type { Rng } from './rng';
import type { Club, Fixture, GameState, Money } from './types';

/** Average ticket price per division, in 만원. */
const TICKET = [0.65, 0.45, 0.35];
/** Monthly broadcast + league central money. */
const TV_MONTHLY = [8000, 2500, 800];
/** End-of-season prize money for first place; it scales down the table. */
const PRIZE_TOP = [100000, 30000, 8000];
const CUP_PRIZE: Money[] = [300, 800, 2000, 5000, 10000, 30000];

export function wageBill(state: GameState, club: Club): Money {
  const players = [...club.playerIds, ...club.youthIds].reduce((sum, id) => {
    const p = state.players[id];
    if (!p?.contract) return sum;
    const share = p.loan ? 1 - p.loan.parentPays : 1;
    return sum + p.contract.wage * share;
  }, 0);
  const staff = club.id === state.clubId ? state.staff.reduce((sum, s) => sum + s.wage, 0) : club.staffLevel * 8;
  // Players out on loan still cost their parent club its share.
  const loanedOut = Object.values(state.players)
    .filter((p) => p.loan?.fromClubId === club.id && p.contract)
    .reduce((sum, p) => sum + p.contract!.wage * p.loan!.parentPays, 0);
  return Math.round(players + staff + loanedOut);
}

export function attendance(state: GameState, club: Club, opponent: Club, fixture: Fixture): number {
  const form = recentForm(state, club.id).filter((r) => r === 'W').length;
  const big = fixture.comp !== 'league' ? 0.1 : 0;
  const derby = club.city === opponent.city ? 0.2 : 0;
  const fill = 0.3 + club.reputation / 250 + form * 0.03 + opponent.reputation / 600 + big + derby;
  return Math.round(Math.min(club.capacity, club.capacity * fill));
}

function earn(club: Club, amount: Money): void {
  club.balance += amount;
  club.income += amount;
}

function spend(club: Club, amount: Money): void {
  club.balance -= amount;
  club.expenses += amount;
}

export function matchdayIncome(state: GameState, fixture: Fixture): number {
  const home = state.clubs[fixture.homeId];
  const away = state.clubs[fixture.awayId];
  const crowd = attendance(state, home, away, fixture);
  const gate = Math.round(crowd * TICKET[Math.min(2, home.division)] * (fixture.comp === 'league' ? 1 : 0.8));
  if (fixture.neutral) {
    earn(home, Math.round(gate / 2));
    earn(away, Math.round(gate / 2));
  } else {
    earn(home, gate);
    // Merchandise and catering on the day.
    earn(home, Math.round(crowd * 0.08));
  }
  return crowd;
}

/** Run once a day: weekly wages on Mondays, central money on the 1st. */
export function dailyFinance(state: GameState, _rng: Rng): void {
  const date = dateOf(state.day);
  const monday = date.getUTCDay() === 1;
  const firstOfMonth = date.getUTCDate() === 1;
  Object.values(state.clubs).forEach((club) => {
    if (monday) spend(club, wageBill(state, club));
    if (firstOfMonth) {
      earn(club, TV_MONTHLY[club.division]);
      // Sponsorship follows reputation.
      earn(club, Math.round(Math.pow(club.reputation, 1.7) * 2.2));
      // Running costs: stadium, travel, the training ground.
      spend(club, Math.round(club.capacity * 0.05 + club.trainingFacilities * 60 + club.youthFacilities * 40));
    }
  });
}

export function prizeMoney(division: number, position: number): Money {
  return Math.round(PRIZE_TOP[division] * Math.pow(0.86, position - 1));
}

export function payPrize(club: Club, amount: Money): void {
  earn(club, amount);
}

export function cupPrize(round: number): Money {
  return CUP_PRIZE[Math.min(round, CUP_PRIZE.length - 1)];
}

export function payFee(buyer: Club | null, seller: Club | null, fee: Money): void {
  if (buyer) {
    buyer.balance -= fee;
    buyer.expenses += fee;
    buyer.transferBudget = Math.max(0, buyer.transferBudget - fee);
  }
  if (seller) {
    seller.balance += fee;
    seller.income += fee;
    // Boards usually release part of a sale back into the budget.
    seller.transferBudget += Math.round(fee * 0.5);
  }
}

/** Board budget for the new season, from the bank balance. */
export function seasonBudgets(state: GameState, club: Club): void {
  const bill = wageBill(state, club);
  club.wageBudget = Math.max(bill, Math.round(bill * 1.06 + club.reputation * 4));
  const cash = Math.max(0, club.balance);
  club.transferBudget = Math.round(cash * (club.division === 0 ? 0.3 : 0.25));
  club.income = 0;
  club.expenses = 0;
}
