import { closeMonth, accrueDay } from './economy';
import { grow, updateBuildings, updateDemand, updateLand } from './growth';
import { updateUtilities } from './network';
import { closeDay, createTraffic, stepTraffic, type Traffic } from './traffic';
import { notify, type World } from './world';

/** Real seconds per game day at 1x. */
export const DAY_SECONDS = 1.2;
/** Real seconds per visual day/night cycle at 1x (slower than the calendar, as in Cities: Skylines). */
export const CLOCK_SECONDS = 72;

export interface Sim {
  w: World;
  tr: Traffic;
  acc: number;
  clock: number; // 0-24
}

export function createSim(w: World): Sim {
  const s: Sim = { w, tr: createTraffic(), acc: 0, clock: 9 };
  updateUtilities(w);
  updateLand(w);
  return s;
}

/** Population milestones and the grant from the central government that comes with each. */
export const MILESTONES: [number, string, number][] = [
  [100, '첫 주민 100명! 작은 마을이 생겼어요.', 3000],
  [1000, '인구 1,000명 돌파! 이제 어엿한 동네예요.', 8000],
  [5000, '인구 5,000명! 소도시로 성장했어요.', 15000],
  [20000, '인구 2만 명! 도시라고 불러도 되겠어요.', 30000],
  [50000, '인구 5만 명! 대도시를 향해 가고 있어요.', 50000],
  [100000, '인구 10만 명! 대도시 달성!', 100000],
];

/** One game day of everything except moving cars. */
export function stepDay(s: Sim) {
  const w = s.w;
  w.day += 1;
  updateUtilities(w);
  if (w.day % 4 === 0) updateLand(w);
  updateBuildings(w);
  updateDemand(w);
  grow(w);
  accrueDay(w);
  closeDay(w, s.tr);
  if (w.day % 30 === 0) closeMonth(w);
  for (const [n, text, grant] of MILESTONES) {
    if (w.stats.pop < n || w.milestones.includes(n)) continue;
    w.milestones.push(n);
    w.money += grant;
    notify(w, `${text} 국비 지원 ${grant.toLocaleString('ko-KR')}만 원`, 'good');
  }
  if (w.day % 15 === 0) warnings(w);
}

function warnings(w: World) {
  const st = w.stats;
  if (st.pop > 50 && st.powerSupply === 0) notify(w, '전기가 없어요. 발전소를 짓고 도로로 연결하세요.', 'warn');
  else if (st.powerSupply && st.powerUse > st.powerSupply * 0.95) notify(w, '전력이 부족해요. 발전소를 더 지으세요.', 'warn');
  if (st.pop > 50 && st.waterSupply === 0) notify(w, '수돗물이 없어요. 강가에 정수장을 지으세요.', 'warn');
  else if (st.waterSupply && st.waterUse > st.waterSupply * 0.95) notify(w, '수돗물이 부족해요. 정수장을 늘리세요.', 'warn');
  if (st.pop > 800 && st.sewageCap < st.waterUse * 0.8) notify(w, '하수처리 용량이 모자라요. 하수처리장을 지으세요.', 'warn');
  if (st.congestion > 0.7) notify(w, '교통 체증이 심해요. 대로를 깔거나 우회로를 만들어 보세요.', 'warn');
}

/** Advance by real time `dt` at `speed` (0 = paused). */
export function tick(s: Sim, dt: number, speed: number) {
  if (!speed) return;
  const t = Math.min(0.1, dt) * speed;
  s.clock = (s.clock + (t / CLOCK_SECONDS) * 24) % 24;
  stepTraffic(s.w, s.tr, t, s.clock);
  s.acc += t;
  let days = 0;
  while (s.acc >= DAY_SECONDS && days < 4) { s.acc -= DAY_SECONDS; stepDay(s); days++; }
}
