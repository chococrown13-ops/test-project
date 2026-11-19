import { CELL, Ground, N, Road } from './defs';
import { calendarMonthOf } from './calendar';
import { bh, bw, inside, idx, notify, type World } from './world';

/**
 * The everyday Korean city beyond homes and jobs: 행정복지센터, 우체국 and
 * 도서관 for the neighbourhood; 고속버스터미널, KTX역 and 공공자전거 for getting
 * about; 등산로 입구 and 찜질방 for a day out; and the festivals (벚꽃축제 in
 * April, 불꽃축제 in October) that bring visitors in.
 */

/** Bits of World.civic: which neighbourhood services reach a cell. */
export const CIVIC = { office: 1, post: 2, library: 4, bike: 8, leisure: 16 } as const;

const REACH: Partial<Record<string, [number, number]>> = {
  office: [12, CIVIC.office],
  post: [14, CIVIC.post],
  library: [8, CIVIC.library],
  bike: [5, CIVIC.bike],
  trailhead: [10, CIVIC.leisure],
  jjim: [10, CIVIC.leisure],
};

/** Recompute which cells each neighbourhood service reaches (with the land values, every few days). */
export function updateCivic(w: World) {
  w.civic.fill(0);
  w.buildings.forEach((b) => {
    const r = REACH[b.kind];
    if (!r) return;
    const [rad, bit] = r;
    const cx = b.x + bw(b) / 2, cy = b.y + bh(b) / 2;
    for (let y = Math.floor(cy - rad); y <= Math.ceil(cy + rad); y++) for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
      if (!inside(x, y) || Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > rad) continue;
      w.civic[idx(x, y)] |= bit;
      // A library counts as schooling for its street.
      if (bit === CIVIC.library) w.edu[idx(x, y)] = 1;
    }
  });
}

/** Happiness a home, shop or factory gets from the services that reach it, and from a festival in town. */
export function civicHappiness(w: World, i: number, residential: boolean): number {
  const c = w.civic[i];
  let h = 0;
  if (residential) {
    if (c & CIVIC.office) h += 3;
    if (c & CIVIC.library) h += 2;
    if (c & CIVIC.leisure) h += 3;
    if (w.festival) h += 4;
  } else if (c & CIVIC.post) h += 4;
  return h;
}

/* ----------------------------------------------------------- 가로수 kinds */

/** Whether the 가로수 on a road cell are 벚나무 (else 은행나무): one kind along a stretch of street. */
export function isCherry(i: number): boolean {
  const gx = Math.floor((i % N) / 8), gy = Math.floor(i / N / 8);
  const h = Math.sin(gx * 12.9898 + gy * 78.233) * 43758.5453;
  return h - Math.floor(h) < 0.3;
}

/* -------------------------------------------------------------- tourism */

/** Visitors' spending a place brings each month (만 원): a base, a share of the city's size, a cap. */
const TOURISM: Partial<Record<string, [number, number, number]>> = {
  trailhead: [60, 0.01, 300],
  jjim: [80, 0.015, 500],
  terminal: [100, 0.02, 800],
  ktx: [300, 0.05, 3000],
};

/** One day of tourism into this month's books. */
export function accrueTourism(w: World) {
  let v = 0;
  w.buildings.forEach((b) => {
    const t = TOURISM[b.kind];
    if (!t) return;
    v += Math.min(t[2], t[0] + w.stats.pop * t[1]);
  });
  w.month.income.V = (w.month.income.V ?? 0) + v / 30;
  if (w.festival) w.month.income.V += w.festival.spend / w.festival.days;
}

/* ---------------------------------------------------------- getting about */

/**
 * Trips that need no car: out of town by 고속버스 or KTX (some of those
 * leaving), or by 공공자전거 between two docks a short way apart. Returns the
 * trip's time, or null when it goes by car after all.
 */
export function noCarTrip(w: World, a: number, b: number, leaving: boolean, roll: number): number | null {
  if (leaving) {
    const share = (hasKind(w, 'ktx') ? 0.2 : 0) + (hasKind(w, 'terminal') ? 0.25 : 0);
    if (roll < share) { w.intercityMonth++; return 12; }
    return null;
  }
  if (!(w.civic[a] & CIVIC.bike) || !(w.civic[b] & CIVIC.bike)) return null;
  const d = Math.abs((a % N) - (b % N)) + Math.abs(((a / N) | 0) - ((b / N) | 0));
  if (d > 30 || roll >= 0.3) return null;
  w.bikeMonth++;
  return d / 2 + 2;
}

let kindsVer = -1, kindsW: World | null = null;
const kinds = new Set<string>();
export function hasKind(w: World, kind: string): boolean {
  if (kindsW !== w || kindsVer !== w.ver.buildings) {
    kinds.clear();
    w.buildings.forEach((b) => kinds.add(b.kind));
    kindsW = w; kindsVer = w.ver.buildings;
  }
  return kinds.has(kind);
}

/** Commercial demand the hubs draw in: people passing through spend money. */
export const hubDemand = (w: World) => (hasKind(w, 'ktx') ? 12 : 0) + (hasKind(w, 'terminal') ? 6 : 0);

/* ------------------------------------------------------------ festivals */

export interface Festival { kind: 'cherry' | 'fireworks'; name: string; x: number; z: number; until: number; days: number; visitors: number; spend: number }

/** Called each morning: festivals open at the start of their month and close after a few days. */
export function updateFestivals(w: World) {
  if (w.festival && w.day > w.festival.until) {
    const f = w.festival;
    notify(w, `${f.name}가 끝났어요. 관광객 ${f.visitors.toLocaleString('ko-KR')}명이 다녀가 ${Math.round(f.spend).toLocaleString('ko-KR')}만 원을 쓰고 갔어요.`, 'good');
    w.festival = null;
  }
  if (w.festival || w.day % 30 !== 1) return;
  const month = calendarMonthOf(w.day);
  if (month === 4) {
    // 벚꽃축제: wherever 벚나무 line the streets.
    let n = 0, sx = 0, sz = 0;
    for (let i = 0; i < N * N; i++) if (w.trees[i] && w.road[i] && isCherry(i)) { n++; sx += (i % N) + 0.5; sz += ((i / N) | 0) + 0.5; }
    if (n < 20) {
      if (w.trees.some((t) => t)) notify(w, '벚나무 가로수가 스무 칸이 넘으면 4월에 벚꽃축제가 열려요.', 'info');
      return;
    }
    const visitors = Math.min(60000, n * 300 + w.stats.pop);
    open(w, { kind: 'cherry', name: '벚꽃축제', x: (sx / n) * CELL, z: (sz / n) * CELL, until: w.day + 10, days: 10, visitors, spend: visitors * 0.04 });
  } else if (month === 10) {
    // 불꽃축제: over the water, from a 수변공원.
    let park: { x: number; z: number } | null = null;
    w.buildings.forEach((b) => { if (!park && b.kind === 'riverpark') park = { x: (b.x + 1) * CELL, z: (b.y + 1) * CELL }; });
    if (!park) {
      if (w.ground.some((g) => g === Ground.Water)) notify(w, '수변공원이 있으면 10월에 불꽃축제가 열려요.', 'info');
      return;
    }
    // Over the water off the park: the nearest water, pushed a little further out.
    const p = park as { x: number; z: number };
    const px = Math.floor(p.x / CELL), pz = Math.floor(p.z / CELL);
    let best = Infinity, bx = px, bz = pz;
    for (let y = pz - 15; y <= pz + 15; y++) for (let x = px - 15; x <= px + 15; x++) {
      if (!inside(x, y) || w.ground[idx(x, y)] !== Ground.Water) continue;
      const d = Math.hypot(x - px, y - pz);
      if (d < best) { best = d; bx = x; bz = y; }
    }
    if (best < Infinity) { const dx = bx - px, dz = bz - pz, l = Math.hypot(dx, dz) || 1; p.x = (bx + 0.5 + (dx / l) * 4) * CELL; p.z = (bz + 0.5 + (dz / l) * 4) * CELL; }
    const visitors = Math.min(100000, 20000 + w.stats.pop * 2);
    open(w, { kind: 'fireworks', name: '불꽃축제', x: p.x, z: p.z, until: w.day + 3, days: 3, visitors, spend: visitors * 0.05 });
  }
}

function open(w: World, f: Festival) {
  w.festival = f;
  notify(w, `${f.name}가 열렸어요! ${f.days}일 동안 관광객이 몰려와요. 시민들도 즐거워해요.`, 'good');
}

/** Month end: last month's riders become the figures the panels show. */
export function closeMobilityMonth(w: World) {
  w.bikeLast = w.bikeMonth; w.bikeMonth = 0;
  w.intercityLast = w.intercityMonth; w.intercityMonth = 0;
}

/* ------------------------------------------------------------- placing */

/** Extra rules for where these go (beyond the usual ground checks). */
export function attractionProblem(w: World, kind: string, x: number, y: number, size: number): string | null {
  const ring = (fn: (i: number) => boolean) => {
    for (let yy = y - 1; yy <= y + size; yy++) for (let xx = x - 1; xx <= x + size; xx++) {
      const inner = xx >= x && xx < x + size && yy >= y && yy < y + size;
      if (!inner && inside(xx, yy) && fn(idx(xx, yy))) return true;
    }
    return false;
  };
  if (kind === 'terminal' && !ring((i) => w.road[i] === Road.Avenue)) return '고속버스터미널은 4차선 대로에 붙여 지어야 해요. 버스가 드나들어요.';
  if (kind === 'trailhead' && !ring((i) => w.ground[i] === Ground.Mountain)) return '등산로 입구는 산 바로 앞에 지어요.';
  return null;
}
