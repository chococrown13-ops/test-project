import { KINDS, N, ROAD_UPKEEP, Zone } from './defs';
import { emptyMonth, notify, type World } from './world';

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
      const pay = b.powered && b.watered ? 1 : 0.4;
      m.income[key] += (b.occ * TAX_BASE[key] * (w.tax[key] / 10) * pay) / 30;
    }
    if (d.upkeep) {
      const group = d.power < 0 || d.water < 0 || b.kind === 'sewage' ? 'facilities' : 'services';
      m.expense[group] += d.upkeep / 30;
    }
  });
  let roads = 0;
  for (let i = 0; i < N * N; i++) if (w.road[i]) roads += ROAD_UPKEEP[w.road[i] as 1 | 2];
  m.expense.roads += roads / 30;
}

export function closeMonth(w: World) {
  const m = w.month;
  const income = m.income.R + m.income.C + m.income.I;
  const expense = m.expense.roads + m.expense.facilities + m.expense.services;
  w.money += Math.round(income - expense);
  m.pop = w.stats.pop;
  m.jobs = w.stats.jobs;
  w.reports.push(m);
  if (w.reports.length > 120) w.reports.shift();
  if (income - expense < 0 && w.money < 5000) notify(w, `이번 달 ${Math.round(expense - income).toLocaleString('ko-KR')}만 원 적자예요. 세금이나 지출을 살펴보세요.`, 'warn');
  if (w.money < 0) notify(w, '시 재정이 바닥났어요! 새 공사를 할 수 없어요.', 'warn');
  w.month = emptyMonth(m.month + 1);
}

export const monthIncome = (r: { income: { R: number; C: number; I: number } }) => r.income.R + r.income.C + r.income.I;
export const monthExpense = (r: { expense: { roads: number; facilities: number; services: number } }) => r.expense.roads + r.expense.facilities + r.expense.services;
