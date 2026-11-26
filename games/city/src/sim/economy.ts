import { KINDS, N, ROAD_UPKEEP, Zone, TOLL_FEE } from './defs';
import { fareIncome, lineUpkeep } from './transit';
import { accrueTourism } from './attractions';
import { specIncomeDay } from './special';
import { emptyMonth, notify, type MonthReport, type World } from './world';

/** Monthly tax per resident / worker at a 10% rate, in 만원. */
const TAX_BASE = { R: 1.0, C: 1.5, I: 1.3 };

/** Accrue one day of income and spending into the current month. */
export function accrueDay(w: World) {
  const m = w.month;
  w.buildings.forEach((b) => {
    const d = KINDS[b.kind];
    if (d.zone && !b.abandoned) {
      const key = d.zone === Zone.R ? 'R' : d.zone === Zone.C ? 'C' : 'I';
      // Unhappy households and cut-off businesses pay less.
      const pay = b.burn ? 0 : b.powered && b.watered ? 1 : 0.4;
      m.income[key] += (b.occ * TAX_BASE[key] * (w.tax[key] / 10) * pay) / 30;
    }
    if (d.upkeep) {
      const group = d.power < 0 || d.water < 0 || b.kind === 'sewage' ? 'facilities' : 'services';
      m.expense[group] += d.upkeep / 30;
    }
  });
  for (const l of w.lines) m.expense.transit += lineUpkeep(w, l) / 30;
  accrueTourism(w);
  m.income.S = (m.income.S ?? 0) + specIncomeDay(w);
  let roads = 0;
  for (let i = 0; i < N * N; i++) {
    if (w.road[i]) roads += ROAD_UPKEEP[w.road[i] as 1 | 2];
    // Flyovers need inspections, tunnels ventilation and lighting.
    if (w.roadAlt[i]) roads += ROAD_UPKEEP[w.roadAlt[i] as 1 | 2] * (w.altLevel[i] === 1 ? 2 : 3);
  }
  m.expense.roads += roads / 30;
}

/** 지방교부세: the state's monthly share for every city, more for more people (in 만원). */
export const grantFor = (pop: number) => Math.round(300 + pop * 0.06);

/** 지방채 on offer: amounts in 만원, paid back monthly over five years at 3.5% a year. */
export const LOAN_SIZES = [10000, 30000, 50000];
export const MAX_LOANS = 3;
const LOAN_MONTHS = 60, LOAN_RATE = 0.035 / 12;

/** Borrow; the money comes at once. Returns why not, or null. */
export function takeLoan(w: World, amount: number): string | null {
  if (!LOAN_SIZES.includes(amount)) return '빌릴 수 없는 금액이에요.';
  if (w.loans.length >= MAX_LOANS) return `대출은 ${MAX_LOANS}건까지예요. 하나를 다 갚으면 또 빌릴 수 있어요.`;
  const pay = Math.ceil((amount * LOAN_RATE) / (1 - (1 + LOAN_RATE) ** -LOAN_MONTHS));
  w.loans.push({ amount, pay, left: pay * LOAN_MONTHS, months: LOAN_MONTHS });
  w.everLoan = true;
  w.money += amount;
  return null;
}
/** Pay a loan off early (what's left of it, less the interest not yet due). */
export function repayLoan(w: World, k: number): string | null {
  const l = w.loans[k];
  if (!l) return null;
  const owed = Math.round(l.pay * ((1 - (1 + LOAN_RATE) ** -l.months) / LOAN_RATE));
  if (w.money < owed) return `갚으려면 ${owed.toLocaleString('ko-KR')}만 원이 있어야 해요.`;
  w.money -= owed;
  w.loans.splice(k, 1);
  return null;
}

export function closeMonth(w: World) {
  const m = w.month;
  m.income.T = fareIncome(w);
  // 고속도로 통행료: every car through a 톨게이트 this month.
  m.income.H = Math.round(w.tollPass * TOLL_FEE);
  w.tollPass = 0;
  m.income.G = grantFor(w.stats.pop);
  m.expense.debt = 0;
  for (const l of w.loans) { const p = Math.min(l.left, l.pay); m.expense.debt += p; l.left -= p; l.months--; }
  w.loans = w.loans.filter((l) => l.left > 0 && l.months > 0);
  const income = monthIncome(m);
  const expense = monthExpense(m);
  w.money += Math.round(income - expense);
  m.pop = w.stats.pop;
  m.jobs = w.stats.jobs;
  w.reports.push(m);
  if (w.reports.length > 120) w.reports.shift();
  if (income - expense < 0 && w.money < 5000) notify(w, `이번 달 ${Math.round(expense - income).toLocaleString('ko-KR')}만 원 적자예요. 예산 창에서 세율을 올리거나 지방채(대출)를 받을 수 있어요.`, 'warn');
  if (w.money < 0) notify(w, '시 재정이 바닥났어요! 새 공사를 할 수 없어요.', 'warn');
  w.month = emptyMonth(m.month + 1);
}

// Saves from before transit have no T or transit fields.
export const monthIncome = (r: MonthReport) => r.income.R + r.income.C + r.income.I + (r.income.T ?? 0) + (r.income.V ?? 0) + (r.income.G ?? 0) + (r.income.S ?? 0) + (r.income.H ?? 0);
export const monthExpense = (r: MonthReport) => r.expense.roads + r.expense.facilities + r.expense.services + (r.expense.transit ?? 0) + (r.expense.debt ?? 0) + (r.expense.snow ?? 0);
