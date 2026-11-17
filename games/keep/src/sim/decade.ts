import { B, clamp, type District, type Game, Ground, idx, type Indicators, inside, N, OLD, type Place, rand, RoadT } from './world';
import { eun, iga, KIND_NAME } from './text';

/** How much the country wants to build, decade by decade: a boom, then a long slow shrink. */
export const DEMAND: Record<number, number> = { 1970: 0.35, 1980: 0.4, 1990: 0.3, 2000: 0.15, 2010: 0, 2020: -0.1, 2030: -0.2, 2040: -0.25, 2050: -0.2, 2060: -0.15 };
const decadeOf = (year: number) => Math.min(2060, Math.floor(year / 10) * 10);

/** People a building of each kind houses. */
export const HOUSES: Partial<Record<number, number>> = { [B.Giwa]: 6, [B.Slate]: 8, [B.Shop]: 5, [B.Market]: 2, [B.Villa]: 16, [B.Apt]: 40, [B.Tower]: 60, [B.Office]: 0, [B.Future]: 22, [B.Place]: 2 };

/** What private money builds on an old lot, by era and street. */
export function newBuilding(g: Game, year: number, onAvenue: boolean): number {
  const r = rand(g);
  if (year >= 2045) return r < 0.5 ? B.Future : onAvenue ? B.Tower : B.Apt;
  if (year >= 2005) return onAvenue ? (r < 0.5 ? B.Tower : B.Office) : r < 0.55 ? B.Apt : B.Villa;
  if (year >= 1985) return onAvenue ? (r < 0.5 ? B.Apt : B.Office) : r < 0.45 ? B.Apt : B.Villa;
  return onAvenue ? B.Shop : B.Villa;
}

export function floorsFor(g: Game, t: number): number {
  switch (t) {
    case B.Villa: return 4;
    case B.Apt: return 15 + Math.floor(rand(g) * 11);
    case B.Tower: return 30 + Math.floor(rand(g) * 20);
    case B.Office: return 12 + Math.floor(rand(g) * 14);
    case B.Future: return 5 + Math.floor(rand(g) * 6);
    case B.Shop: return 2 + Math.floor(rand(g) * 3);
    default: return 1;
  }
}

export const onAvenue = (g: Game, i: number) => {
  const x = i % N, y = (i / N) | 0;
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inside(x + dx, y + dy) && g.road[idx(x + dx, y + dy)] === RoadT.Avenue);
};

/** Put up a new building on a cell (any place there is lost with `why`). */
export function rebuild(g: Game, i: number, t: number, why: string, by: string, out: string[]) {
  const p = g.places.find((q) => q.y * N + q.x === i && q.state !== 'lost');
  if (p) losePlace(g, p, why, by, out);
  g.btype[i] = t;
  g.built[i] = g.year;
  g.floors[i] = floorsFor(g, t);
}

export function losePlace(g: Game, p: Place, why: string, by: string, out: string[]) {
  p.state = 'lost';
  p.lostYear = g.year;
  p.lostWhy = why;
  g.lost.push({ place: p.id, year: g.year, why, by });
  out.push(`${iga(p.name)} ${why} 사라졌어요.`);
  const i = p.y * N + p.x;
  if (g.btype[i] === B.Place) { g.btype[i] = B.Vacant; g.built[i] = g.year; g.floors[i] = 1; }
}

/** Places of a kind that can shut (a tree, a mural, a crossing don't, they can only be taken). */
const CAN_CLOSE = new Set(['gukbap', 'bath', 'barber', 'tearoom', 'cinema', 'hardware', 'mill', 'snack', 'corner', 'briquette', 'photo', 'books', 'chinese', 'church', 'school', 'market']);

/**
 * Ten years go by on their own: land prices, private building, shops closing
 * or passing to the next generation, people moving in and out, floods late on.
 * Returns the decade's headlines.
 */
export function playDecade(g: Game): string[] {
  const out: string[] = [];
  const dec = decadeOf(g.year);
  const demand = DEMAND[dec] ?? 0;
  for (const d of g.districts) {
    const cells: number[] = [];
    for (let i = 0; i < N * N; i++) if (g.district[i] === d.id && !g.road[i] && g.ground[i] !== Ground.Water) cells.push(i);
    // Land prices follow the country, the trains and the street life.
    d.land = clamp(d.land + demand * 20 + (d.station ? 5 : 0) + (d.vitality - 50) * 0.1 + d.tourism * 4 + (d.protected ? 2 : 0) - (d.land - 50) * 0.12);
    // Private redevelopment of old lots where land is dear, unless it's a 보존지구.
    let rebuilt = 0;
    if (!d.protected) {
      const share = clamp((d.land - 40) / 130, 0, 0.3) * (demand > 0 ? 1 : 0.3);
      for (const i of cells) {
        if (!OLD.has(g.btype[i]) && g.btype[i] !== B.Vacant) continue;
        if (rand(g) > share) continue;
        rebuild(g, i, newBuilding(g, g.year, onAvenue(g, i)), '민간 재개발로', '시장', out);
        rebuilt++;
      }
    }
    // Decline: old houses empty out when the country shrinks or the street dies.
    const decline = Math.max(0, -demand) * 0.32 + (d.vitality < 25 ? 0.05 : 0);
    let emptied = 0;
    if (decline > 0) for (const i of cells) {
      const t = g.btype[i];
      if ((OLD.has(t) || (t === B.Villa && g.year - g.built[i] > 40)) && rand(g) < decline) { g.btype[i] = B.Vacant; g.floors[i] = 1; g.built[i] = g.year; emptied++; }
      // Houses left empty for twenty years come down, leaving a gap.
      else if (t === B.Vacant && g.year - g.built[i] >= 20 && rand(g) < 0.5) { g.btype[i] = B.None; g.floors[i] = 0; }
    }
    // Floods from the 2040s along the river, unless there's a levee.
    if (g.year >= 2040 && d.kind === 'river' && !d.levee && rand(g) < 0.6) {
      let hit = 0;
      for (const i of cells) {
        const x = i % N, y = (i / N) | 0;
        let wet = false;
        for (let dy = -3; dy <= 3 && !wet; dy++) for (let dx = -3; dx <= 3 && !wet; dx++) if (inside(x + dx, y + dy) && g.ground[idx(x + dx, y + dy)] === Ground.Water) wet = true;
        if (!wet || g.btype[i] === B.None) continue;
        const p = g.places.find((q) => q.y * N + q.x === i && q.state !== 'lost');
        if (p && !p.protected) losePlace(g, p, '강물이 넘쳐', '홍수', out);
        else if (!p && rand(g) < 0.5) { g.btype[i] = B.Vacant; hit++; }
      }
      out.push(`${d.name}에 큰물이 들어 강가 집 ${hit}채가 비었어요.`);
    }
    // The 기억 장소 of the district: each decade some pass to the next generation, some close.
    for (const p of g.places) {
      if (p.district !== d.id || p.state === 'lost') continue;
      const age = g.year + 10 - p.since;
      if (p.state === 'open' && CAN_CLOSE.has(p.kind)) {
        let q = 0.06 + Math.max(0, d.land - 60) / 200 + (d.vitality < 35 ? 0.12 : 0) - p.support * 0.1 - (p.protected ? 0.16 : 0);
        const handover = Math.floor(age / 30) > Math.floor((age - 10) / 30);
        if (handover) q += 0.14;
        if (p.kind === 'school' && demand < 0) q += 0.2;
        q = clamp(q, 0.02, 0.85);
        if (rand(g) < q) {
          p.state = 'closed';
          const why = p.kind === 'school' ? '아이가 줄어 문을 닫았어요' : handover ? `${p.founder} 사장님이 은퇴하며 문을 닫았어요` : d.land > 60 ? '오른 임대료를 견디지 못하고 문을 닫았어요' : '손님이 줄어 문을 닫았어요';
          p.story.push(`${g.year + 10}년, ${why.replace('문을 닫았어요', '문을 닫았어요.')}`);
          out.push(`${iga(p.name)} ${why}.`);
        } else if (handover) {
          const heir = pick2(g, ['둘째 아들', '맏딸', '손자', '오래 일한 직원', '조카']);
          p.story.push(`${g.year + 10}년, ${iga(heir)} 가게를 이었어요.`);
          out.push(`${eun(p.name)} ${iga(heir)} 이어받았어요.`);
        }
      }
      // A closed place stands empty until private money buys it.
      if (p.state === 'closed' && !p.protected && !d.protected && rand(g) < clamp((d.land - 35) / 120, 0.03, 0.4)) {
        rebuild(g, p.y * N + p.x, newBuilding(g, g.year, onAvenue(g, p.y * N + p.x)), '빈 가게 자리에 새 건물이 들어서며', '시장', out);
      }
    }
    // People.
    let cap = 0, vacant = 0, shops = 0, fresh = 0, green = 0;
    for (const i of cells) {
      const t = g.btype[i];
      cap += HOUSES[t] ?? 0;
      if (t === B.Vacant) vacant++;
      if (t === B.Park) green++;
      if (t === B.Shop || t === B.Market || t === B.Office) shops++;
      if (t !== B.None && t !== B.Vacant && g.year + 10 - g.built[i] <= 30) fresh++;
    }
    const occ = clamp(0.7 + demand * 0.6 + (d.vitality - 50) / 250, 0.35, 1);
    d.pop = Math.round(cap * occ);
    // 주민: how many households have stayed put. Upheaval (rebuilding, emptying, tourists) pushes them out; quiet years let it settle back.
    const n = Math.max(1, cells.length);
    const moved = (rebuilt + emptied + (d.churn ?? 0)) / n;
    d.churn = 0;
    const target = clamp(0.8 - moved * 5 - d.tourism * 0.05 - Math.max(0, d.land - 65) / 100 + (d.protected ? 0.05 : 0) + Math.min(0.25, d.anchor ?? 0), 0.05, 0.95);
    d.original = clamp(d.original + (target - d.original) * (target < d.original ? 0.6 : 0.3), 0, 1);
    const openPlaces = g.places.filter((p) => p.district === d.id && (p.state === 'open' || p.state === 'reused')).length;
    const density = d.pop / n;
    d.vitality = clamp(14 + openPlaces * 1.6 + (shops / n) * 80 + Math.min(30, density * 2.2) + (fresh / n) * 45 + Math.min(10, (green / n) * 80) + d.land * 0.14 - (vacant / n) * 90 + d.tourism * 4);
    if (d.protected && g.year >= 2000 && openPlaces >= 4 && d.vitality > 55 && rand(g) < 0.5) d.tourism = Math.min(3, d.tourism + 1);
  }
  // Money: taxes in, upkeep out.
  const pop = g.districts.reduce((a, d) => a + d.pop, 0);
  const land = g.districts.reduce((a, d) => a + d.land, 0) / g.districts.length;
  const income = g.districts.reduce((a, d) => a + (d.pop / 1000) * (0.3 + d.land / 100) * 0.72, 0);
  const services = (pop / 1000) * 0.5 * (1 + Math.max(0, g.year - 2000) / 60);
  const upkeep = g.places.filter((p) => p.protected && p.state !== 'lost').length * 1.5 + g.places.filter((p) => p.state === 'reused').length * 1
    + g.places.reduce((a, p) => a + (p.state === 'open' ? Math.max(0, p.support) * 1.5 : 0), 0) + g.districts.filter((d) => d.protected).length * 5;
  g.money = Math.round(g.money + income - services - upkeep);
  void land;
  if (g.money < 0) out.push(`구청 살림이 ${-g.money}억 원 적자예요. 다음 결정이 무거워졌어요.`);
  return out;
}

const pick2 = <T>(g: Game, a: T[]) => a[Math.floor(rand(g) * a.length)];

/** The four numbers on the board, 0-100. */
export function indicators(g: Game): Indicators {
  let mem = 0;
  for (const p of g.places) mem += p.state === 'open' ? 1 : p.state === 'reused' ? 0.9 : p.state === 'closed' ? (p.protected ? 0.6 : 0.3) : p.recorded ? 0.2 : 0;
  let old = 0, built = 0, vacant = 0;
  for (let i = 0; i < N * N; i++) {
    if (g.district[i] < 0) continue;
    const t = g.btype[i];
    if (t === B.None || t === B.Field || t === B.Park) continue;
    built++;
    if (OLD.has(t)) old++;
    if (t === B.Vacant) vacant++;
  }
  const memory = clamp((g.places.length ? (mem / g.places.length) * 75 : 0) + (built ? (old / built) * 25 : 0));
  const pop = g.districts.reduce((a, d) => a + d.pop, 0) || 1;
  const vitality = clamp(g.districts.reduce((a, d) => a + d.vitality * Math.max(1, d.pop), 0) / pop);
  const original = g.districts.reduce((a, d) => a + d.original * Math.max(1, d.pop), 0) / pop;
  const residents = clamp(original * 70 + (1 - (built ? vacant / built : 0)) * 30 - g.districts.reduce((a, d) => a + d.tourism, 0) * 2);
  const budget = clamp(50 + g.money / 10);
  return { memory: Math.round(memory), vitality: Math.round(vitality), residents: Math.round(residents), budget: Math.round(budget) };
}

export const placeLabel = (p: Place) => `${p.name} (${KIND_NAME[p.kind]})`;
export const districtOf = (g: Game, p: Place): District => g.districts[p.district];
