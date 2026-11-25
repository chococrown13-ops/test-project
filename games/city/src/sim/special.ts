import { type BuildingKind, KINDS, Zone } from './defs';
import { notify, type World } from './world';

/**
 * 도시 특화: 의료 and 기술. Each opens when the city meets its conditions (not by spending points,
 * so that the city is already shaped for it when it opens: the goals and achievements work the same
 * way). Once open, its own buildings can be built, and the more of them, the higher its level
 * (1 to 3) and the stronger what it gives the whole city.
 */

export type SpecId = 'med' | 'tech';

export interface Need { text: string; have: (w: World) => number; goal: number; unit?: string }

export interface SpecDef {
  id: SpecId; name: string; blurb: string;
  needs: Need[];
  /** Its buildings (built only once it is open). */
  buildings: BuildingKind[];
  /** What each level gives, in words. */
  levels: string[];
}

const count = (w: World, ...kinds: BuildingKind[]) => { let n = 0; w.buildings.forEach((b) => { if (kinds.includes(b.kind)) n++; }); return n; };
/** Share of residents (0 to 100) living where a service reaches. */
function reach(w: World, key: 'health' | 'edu'): number {
  let all = 0, inside = 0;
  w.buildings.forEach((b) => {
    if (KINDS[b.kind].zone !== Zone.R || b.abandoned) return;
    all += b.occ;
    if (w[key][b.y * 256 + b.x]) inside += b.occ;
  });
  return all ? Math.round((inside / all) * 100) : 0;
}

export const SPECS: SpecDef[] = [
  {
    id: 'med', name: '의료 특화',
    blurb: '병원과 바이오 연구로 이름난 도시. 주민이 건강하고, 의료관광객이 찾아와요.',
    needs: [
      { text: '인구', have: (w) => w.stats.pop, goal: 4000, unit: '명' },
      { text: '보건소', have: (w) => count(w, 'clinic'), goal: 3, unit: '곳' },
      { text: '보건소가 닿는 주민', have: (w) => reach(w, 'health'), goal: 60, unit: '%' },
    ],
    buildings: ['hospital', 'medlab'],
    levels: ['주민 만족도 +2, 주거 수요 +3, 의료관광 수입', '주민 만족도 +4, 주거 수요 +6, 의료관광 수입 두 배', '주민 만족도 +6, 주거 수요 +10, 의료관광 수입 세 배'],
  },
  {
    id: 'tech', name: '기술 특화',
    blurb: '대학과 연구단지가 모인 도시. 회사와 공장이 몰려오고, 기술을 팔아 돈을 벌어요.',
    needs: [
      { text: '인구', have: (w) => w.stats.pop, goal: 8000, unit: '명' },
      { text: '초등학교', have: (w) => count(w, 'school'), goal: 2, unit: '곳' },
      { text: '공공도서관', have: (w) => count(w, 'library'), goal: 1, unit: '곳' },
      { text: '3차 산업(지식·물류) 건물', have: (w) => count(w, 'i3'), goal: 4, unit: '채' },
    ],
    buildings: ['university', 'techpark'],
    levels: ['상업·산업 수요 +4, 기술 수출 수입', '상업·산업 수요 +8, 기술 수출 수입 두 배', '상업·산업 수요 +12, 기술 수출 수입 세 배'],
  },
];
export const specOf = (kind: BuildingKind) => SPECS.find((s) => s.buildings.includes(kind));

export const isOpen = (w: World, id: SpecId) => (w.specs ?? []).includes(id);

/** A specialisation's level: 0 until one of its buildings stands, then 1, 2 (3 buildings), 3 (5). */
export function specLevel(w: World, id: SpecId): number {
  if (!isOpen(w, id)) return 0;
  const n = count(w, ...SPECS.find((s) => s.id === id)!.buildings);
  return n >= 5 ? 3 : n >= 3 ? 2 : n >= 1 ? 1 : 0;
}

/** Why one of a specialisation's buildings can't go up yet (null if it can). */
export function specProblem(w: World, kind: BuildingKind): string | null {
  const s = specOf(kind);
  if (!s || isOpen(w, s.id)) return null;
  const left = s.needs.filter((n) => n.have(w) < n.goal).map((n) => `${n.text} ${n.goal.toLocaleString('ko-KR')}${n.unit ?? ''}`);
  return `${s.name}가 열려야 지을 수 있어요. 남은 조건: ${left.join(', ')}`;
}

/** Daily: open any specialisation whose conditions are all met. */
export function checkSpecs(w: World) {
  for (const s of SPECS) {
    if (isOpen(w, s.id)) continue;
    if (!s.needs.every((n) => n.have(w) >= n.goal)) continue;
    w.specs = [...(w.specs ?? []), s.id];
    notify(w, `${s.name}가 열렸어요! ${s.buildings.map((k) => KINDS[k].name).join('과 ')}을 지을 수 있어요. 지을수록 특화 단계가 올라가요.`, 'good');
  }
}

/** Demand the specialisations add, by zone. */
export function specDemand(w: World): { R: number; C: number; I: number } {
  const med = specLevel(w, 'med'), tech = specLevel(w, 'tech');
  return { R: [0, 3, 6, 10][med], C: tech * 4, I: tech * 4 };
}
/** Happiness the 의료 specialisation adds for residents. */
export const specHappy = (w: World) => specLevel(w, 'med') * 2;

/** A day of 의료관광 and 기술 수출 income (만원). */
export function specIncomeDay(w: World): number {
  const med = specLevel(w, 'med'), tech = specLevel(w, 'tech');
  return (med * (200 + w.stats.pop * 0.02) + tech * (300 + w.stats.jobs * 0.025)) / 30;
}
