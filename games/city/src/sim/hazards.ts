import { KINDS, N, Zone } from './defs';
import { calendarMonthOf } from './calendar';
import { demolish } from './tools';
import { bw, bh, idx, inside, notify, rand, type Building, type World } from './world';

/**
 * 재해: 화재 and 한파. Both start gently and can be turned off in the menu (w.noHazards).
 *
 * 화재 — now and then a building catches fire, far more often where no 소방서 reaches. Inside a
 * station's radius the fire is out by the next day; outside it, it burns on, may spread next door,
 * and after a few days the building is lost (the lot is free to grow again).
 *
 * 한파 — in winter a cold snap is forecast three days ahead, then snow piles up on the roads for
 * several days and cars slow down. A 제설기지 clears the roads within its reach every day,
 * spreading 염화칼슘, which costs money (지출: 제설). After the cold, the snow melts on its own.
 */

/** Cells a 제설기지's trucks reach. */
export const SNOW_RADIUS = 18;
/** 만원 of 염화칼슘 per 100 units of snow cleared (a cell piled full is 100). */
const SALT_COST = 0.35;
/** Days a fire burns before the building is lost, where no fire station reaches. */
const BURN_DAYS = 5;

/** The cell a building stands on (its first footprint cell). */
const cellOf = (b: Building) => idx(b.x, b.y);
const covered = (w: World, b: Building) => {
  for (let y = b.y; y < b.y + bh(b); y++) for (let x = b.x; x < b.x + bw(b); x++) if (w.fire[idx(x, y)]) return true;
  return false;
};

/** One day of fires and weather. */
export function stepHazards(w: World) {
  w.snow ??= new Uint8Array(N * N);
  stepFires(w);
  stepCold(w);
}

function stepFires(w: World) {
  const burning: Building[] = [];
  w.buildings.forEach((b) => { if (b.burn) burning.push(b); });
  for (const b of burning) {
    b.burn = (b.burn ?? 0) + 1;
    if (covered(w, b)) {
      if (b.burn >= 2) { b.burn = 0; w.ver.buildings++; }
      continue;
    }
    if (b.burn >= BURN_DAYS) {
      notify(w, `불을 끄지 못해서 ${KINDS[b.kind].name} 건물이 다 타 버렸어요. 소방서를 지어 주세요.`, 'warn', cellOf(b), 'fire');
      demolish(w, b.id);
      continue;
    }
    // Next door may catch.
    if (rand(w) < 0.12) {
      const x = b.x - 1 + Math.floor(rand(w) * (bw(b) + 2)), y = b.y - 1 + Math.floor(rand(w) * (bh(b) + 2));
      const nb = inside(x, y) ? w.buildings.get(w.bld[idx(x, y)]) : undefined;
      if (nb && !nb.burn && KINDS[nb.kind].zone) { nb.burn = 1; w.ver.buildings++; }
    }
  }
  if (w.noHazards || w.stats.pop < 400 || burning.length >= 3) return;
  // New fires: about one a month in a town of a thousand houses with no fire station, a tenth of that inside one's reach.
  w.buildings.forEach((b) => {
    const d = KINDS[b.kind];
    if (!d.zone || b.burn || b.abandoned || !b.occ) return;
    const cov = covered(w, b);
    const p = (cov ? 0.000004 : 0.00004) * (d.zone === Zone.I ? 2 : 1);
    if (rand(w) >= p) return;
    b.burn = 1;
    w.ver.buildings++;
    if (cov) notify(w, '화재가 났지만 소방차가 바로 출동했어요.', 'info', cellOf(b), 'fire');
    else notify(w, '화재 발생! 소방서가 닿지 않는 곳이라 불이 번질 수 있어요.', 'warn', cellOf(b), 'fire');
  });
}

function stepCold(w: World) {
  const month = calendarMonthOf(w.day);
  const c = w.cold;
  if (c && w.day >= c.end) w.cold = null;
  const snowing = !!w.cold && w.day >= w.cold.start;
  if (c && w.day === c.start) notify(w, '한파가 시작됐어요. 도로에 눈이 쌓이면 차들이 느려져요.', 'warn');
  if (!w.cold && !w.noHazards && (month === 12 || month === 1 || month === 2) && w.stats.pop >= 300 && w.day - (w.coldLast ?? -99) > 24 && rand(w) < 0.05) {
    const start = w.day + 3, len = 4 + Math.floor(rand(w) * 3);
    w.cold = { start, end: start + len };
    w.coldLast = start;
    notify(w, `사흘 뒤 한파와 폭설이 예보됐어요(${len}일). 제설기지가 있으면 반경 안 도로의 눈을 치워요.`, 'warn');
  }
  // Snow falls on every road while it snows, melts slowly after.
  const s = w.snow!;
  let any = false;
  for (let i = 0; i < N * N; i++) {
    if (!w.road[i] && !w.roadAlt[i]) { s[i] = 0; continue; }
    const v = snowing ? Math.min(100, s[i] + 24) : Math.max(0, s[i] - 14);
    s[i] = v;
    if (v) any = true;
  }
  if (!any) return;
  // 제설기지: the trucks go out every day and salt the roads in reach.
  let cleared = 0;
  w.buildings.forEach((b) => {
    if (b.kind !== 'snowbase' || !b.powered) return;
    const cx = b.x + bw(b) / 2, cy = b.y + bh(b) / 2, r = SNOW_RADIUS;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if (!inside(x, y) || Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > r) continue;
        const i = idx(x, y);
        if (!s[i]) continue;
        const take = Math.min(s[i], 40);
        s[i] -= take;
        cleared += take;
      }
  });
  const cost = (cleared / 100) * SALT_COST;
  w.month.expense.snow = (w.month.expense.snow ?? 0) + cost;
}

/** How much a car slows on snow: 1 on a clear road, about half on deep snow. */
export const snowSlow = (w: World, cell: number) => (w.snow && cell >= 0 && cell < N * N ? 1 - w.snow[cell] * 0.0045 : 1);

/** Is it snowing now, or forecast (for the weather on screen)? */
export const snowingNow = (w: World) => !!w.cold && w.day >= w.cold.start && w.day < w.cold.end;
