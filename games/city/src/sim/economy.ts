import { KINDS, N, ROAD_UPKEEP, Zone } from './defs';
import { FARE, lineUpkeep } from './transit';
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
      const pay = b.powered && b.watered ? 1 : 0.4;
      m.income[key] += (b.occ * TAX_BASE[key] * (w.tax[key] / 10) * pay) / 30;
    }
    if (d.upkeep) {
      const group = d.power < 0 || d.water < 0 || b.kind === 'sewage' ? 'facilities' : 'services';
      m.expense[group] += d.upkeep / 30;
    }
  });
  for (const l of w.lines) m.expense.transit += lineUpkeep(w, l) / 30;
  let roads = 0;
  for (let i = 0; i < N * N; i++) {
    if (w.road[i]) roads += ROAD_UPKEEP[w.road[i] as 1 | 2];
    // Flyovers need inspections, tunnels ventilation and lighting.
    if (w.roadAlt[i]) roads += ROAD_UPKEEP[w.roadAlt[i] as 1 | 2] * (w.altLevel[i] === 1 ? 2 : 3);
  }
  m.expense.roads += roads / 30;
}

export function closeMonth(w: World) {
  const m = w.month;
  m.income.T = w.lines.reduce((a, l) => a + l.ridersMonth, 0) * FARE;
  const income = monthIncome(m);
  const expense = monthExpense(m);
  w.money += Math.round(income - expense);
  m.pop = w.stats.pop;
  m.jobs = w.stats.jobs;
  w.reports.push(m);
  if (w.reports.length > 120) w.reports.shift();
  if (income - expense < 0 && w.money < 5000) notify(w, `이번 달 ${Math.round(expense - income).toLocaleString('ko-KR')}만 원 적자예요. 세금이나 지출을 살펴보세요.`, 'warn');
  if (w.money < 0) notify(w, '시 재정이 바닥났어요! 새 공사를 할 수 없어요.', 'warn');
  w.month = emptyMonth(m.month + 1);
}

// Saves from before transit have no T or transit fields.
export const monthIncome = (r: MonthReport) => r.income.R + r.income.C + r.income.I + (r.income.T ?? 0);
export const monthExpense = (r: MonthReport) => r.expense.roads + r.expense.facilities + r.expense.services + (r.expense.transit ?? 0);
