import { BRIDGE_MULT, Ground, KINDS, N, Road, ROAD_COST, Zone, ZONE_DEPTH, type BuildingKind } from './defs';
import { findAccess, invalidateNetwork } from './network';
import { idx, inside, notify, rand, type Building, type World } from './world';

/** Cells along an L-shaped route: the longer leg first, as most road tools do. */
export function roadPath(x0: number, y0: number, x1: number, y1: number): number[] {
  const cells: number[] = [];
  const horizFirst = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
  const sx = Math.sign(x1 - x0), sy = Math.sign(y1 - y0);
  let x = x0, y = y0;
  const push = () => { if (inside(x, y)) cells.push(idx(x, y)); };
  push();
  if (horizFirst) { while (x !== x1) { x += sx; push(); } while (y !== y1) { y += sy; push(); } }
  else { while (y !== y1) { y += sy; push(); } while (x !== x1) { x += sx; push(); } }
  return cells;
}

export function roadCost(w: World, cells: number[], type: Road): number {
  let c = 0;
  for (const i of cells) {
    const cur = w.road[i];
    if (cur >= type) continue;
    const base = ROAD_COST[type as 1 | 2] - (cur ? ROAD_COST[cur as 1 | 2] : 0);
    c += base * (w.ground[i] === Ground.Water ? BRIDGE_MULT : 1);
  }
  return c;
}

/** Facilities block roads; zoned buildings are cleared to make way. */
export function roadBlocked(w: World, cells: number[]): boolean {
  return cells.some((i) => { const id = w.bld[i]; return id >= 0 && !KINDS[w.buildings.get(id)!.kind].zone; });
}

export function placeRoad(w: World, cells: number[], type: Road): string | null {
  if (cells.length === 0) return null;
  if (roadBlocked(w, cells)) return '시설물이 있는 곳에는 도로를 놓을 수 없어요.';
  const cost = roadCost(w, cells, type);
  if (cost > w.money) return `예산이 부족해요. (${cost.toLocaleString('ko-KR')}만 원 필요)`;
  w.money -= cost;
  for (const i of cells) {
    if (w.bld[i] >= 0) demolish(w, w.bld[i]);
    w.zone[i] = Zone.None;
    if (w.road[i] < type) w.road[i] = type;
  }
  w.ver.roads++;
  w.ver.zones++;
  invalidateNetwork();
  return null;
}

/** Distance (in cells, straight lines only) to the nearest road, capped. */
export function roadDistance(w: World, x: number, y: number): number {
  let best = 99;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (let d = 1; d <= ZONE_DEPTH; d++) {
      const nx = x + dx * d, ny = y + dy * d;
      if (!inside(nx, ny)) break;
      const i = idx(nx, ny);
      if (w.road[i]) { best = Math.min(best, d); break; }
      if (w.ground[i] === Ground.Water) break;
    }
  }
  return best;
}

export function rectCells(x0: number, y0: number, x1: number, y1: number): number[] {
  const out: number[] = [];
  for (let y = Math.max(0, Math.min(y0, y1)); y <= Math.min(N - 1, Math.max(y0, y1)); y++)
    for (let x = Math.max(0, Math.min(x0, x1)); x <= Math.min(N - 1, Math.max(x0, x1)); x++) out.push(idx(x, y));
  return out;
}

export function zoneable(w: World, i: number): boolean {
  if (w.road[i] || w.ground[i] === Ground.Water) return false;
  const id = w.bld[i];
  if (id >= 0 && !KINDS[w.buildings.get(id)!.kind].zone) return false;
  return roadDistance(w, i % N, (i / N) | 0) <= ZONE_DEPTH;
}

export function paintZone(w: World, cells: number[], z: Zone): number {
  let n = 0;
  for (const i of cells) {
    if (z === Zone.None) {
      if (w.zone[i]) { w.zone[i] = Zone.None; n++; }
      const id = w.bld[i];
      if (id >= 0 && KINDS[w.buildings.get(id)!.kind].zone) demolish(w, id);
      continue;
    }
    if (!zoneable(w, i) || w.zone[i] === z) continue;
    const id = w.bld[i];
    if (id >= 0) demolish(w, id);
    w.zone[i] = z;
    n++;
  }
  if (n) w.ver.zones++;
  return n;
}

export function footprint(x: number, y: number, size: number): number[] {
  const out: number[] = [];
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) if (inside(x + dx, y + dy)) out.push(idx(x + dx, y + dy));
  return out;
}

/** Why a facility can't go here, or null if it can. */
export function placeProblem(w: World, kind: BuildingKind, x: number, y: number): string | null {
  const d = KINDS[kind];
  if (!inside(x, y) || !inside(x + d.size - 1, y + d.size - 1)) return '지도 밖이에요.';
  const cells = footprint(x, y, d.size);
  for (const i of cells) {
    if (w.ground[i] === Ground.Water) return '물 위에는 지을 수 없어요.';
    if (w.road[i]) return '도로 위에는 지을 수 없어요.';
    const id = w.bld[i];
    if (id >= 0 && !KINDS[w.buildings.get(id)!.kind].zone) return '다른 시설이 있어요.';
  }
  if (kind === 'water' && !nearWater(w, x, y, d.size, 2)) return '정수장은 강가(2칸 이내)에 지어야 해요.';
  if ((d.cost ?? 0) > w.money) return `예산이 부족해요. (${(d.cost ?? 0).toLocaleString('ko-KR')}만 원 필요)`;
  return null;
}

function nearWater(w: World, x: number, y: number, size: number, r: number): boolean {
  for (let yy = y - r; yy < y + size + r; yy++) for (let xx = x - r; xx < x + size + r; xx++)
    if (inside(xx, yy) && w.ground[idx(xx, yy)] === Ground.Water) return true;
  return false;
}

export function placeFacility(w: World, kind: BuildingKind, x: number, y: number): string | null {
  const why = placeProblem(w, kind, x, y);
  if (why) return why;
  const d = KINDS[kind];
  w.money -= d.cost ?? 0;
  for (const i of footprint(x, y, d.size)) { if (w.bld[i] >= 0) demolish(w, w.bld[i]); w.zone[i] = Zone.None; }
  const b = addBuilding(w, kind, x, y);
  w.ver.zones++;
  if (findAccess(w, b) < 0) notify(w, `${d.name}이(가) 도로와 떨어져 있어요. 도로를 연결해야 작동해요.`, 'warn');
  else notify(w, `${d.name}을(를) 지었어요.`, 'good');
  return null;
}

export function addBuilding(w: World, kind: BuildingKind, x: number, y: number): Building {
  const d = KINDS[kind];
  const [lo, hi] = d.floors;
  const b: Building = {
    id: w.nextId++, kind, x, y, size: d.size,
    floors: lo + Math.floor(rand(w) * (hi - lo + 1)),
    look: rand(w), occ: 0, powered: false, watered: false, sewered: false, happy: 60, outage: 0, abandoned: false, builtDay: w.day,
  };
  w.buildings.set(b.id, b);
  for (const i of footprint(x, y, d.size)) w.bld[i] = b.id;
  w.ver.buildings++;
  invalidateNetwork();
  return b;
}

export function demolish(w: World, id: number) {
  const b = w.buildings.get(id);
  if (!b) return;
  for (const i of footprint(b.x, b.y, b.size)) if (w.bld[i] === id) w.bld[i] = -1;
  w.buildings.delete(id);
  w.ver.buildings++;
  invalidateNetwork();
}

/** Bulldozer: buildings first; roads only if no building was in the box. */
export function bulldoze(w: World, cells: number[]): number {
  let n = 0;
  const ids = new Set<number>();
  for (const i of cells) if (w.bld[i] >= 0) ids.add(w.bld[i]);
  ids.forEach((id) => { demolish(w, id); n++; });
  if (!n) {
    let roads = 0;
    for (const i of cells) if (w.road[i] && !edgeLink(i)) { w.road[i] = Road.None; roads++; }
    if (roads) { w.ver.roads++; invalidateNetwork(); }
    n += roads;
  }
  return n;
}

/** The expressway link at the map edge can't be removed. */
function edgeLink(i: number): boolean {
  const x = i % N;
  return x <= 1;
}
