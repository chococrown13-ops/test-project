import { Ground, KINDS, N, SEWAGE_CAPACITY, ZONE_DEPTH } from './defs';
import { idx, inside, type Building, type World } from './world';

/**
 * Road connectivity and the utility grids. Water mains and power cables run
 * under the roads (as in Cities: Skylines II), so a building is on a grid
 * when its access road is in the same road network as a plant.
 */
export interface Net {
  ver: string;
  comp: Int32Array;
  /** Component ids that touch the map edge, i.e. reach the outside world. */
  outside: Set<number>;
  /** Access road cell per building id. */
  access: Map<number, number>;
}

let cache: Net | null = null;

export function network(w: World): Net {
  const ver = `${w.ver.roads}:${w.ver.buildings}`;
  if (cache && cache.ver === ver) return cache;
  const comp = new Int32Array(N * N).fill(-1);
  const outside = new Set<number>();
  let next = 0;
  const stack: number[] = [];
  for (let s = 0; s < N * N; s++) {
    if (!w.road[s] || comp[s] >= 0) continue;
    const id = next++;
    comp[s] = id;
    stack.push(s);
    while (stack.length) {
      const c = stack.pop()!;
      const x = c % N, y = (c / N) | 0;
      if (x === 0 || y === 0 || x === N - 1 || y === N - 1) outside.add(id);
      const nb = [x > 0 ? c - 1 : -1, x < N - 1 ? c + 1 : -1, y > 0 ? c - N : -1, y < N - 1 ? c + N : -1];
      for (const n of nb) if (n >= 0 && w.road[n] && comp[n] < 0) { comp[n] = id; stack.push(n); }
    }
  }
  const access = new Map<number, number>();
  w.buildings.forEach((b) => { const a = findAccess(w, b); if (a >= 0) access.set(b.id, a); });
  cache = { ver, comp, outside, access };
  return cache;
}

export function invalidateNetwork() { cache = null; }

/**
 * A building reaches the nearest road straight out from any side of its
 * footprint, through zoned land, up to the zoning depth.
 */
export function findAccess(w: World, b: { x: number; y: number; size: number }): number {
  let best = -1, bestD = 99;
  const tryLine = (x0: number, y0: number, dx: number, dy: number) => {
    for (let d = 1; d <= ZONE_DEPTH + 1; d++) {
      const x = x0 + dx * d, y = y0 + dy * d;
      if (!inside(x, y)) return;
      const i = idx(x, y);
      if (w.road[i]) { if (d < bestD) { bestD = d; best = i; } return; }
      if (w.ground[i] === Ground.Water) return;
    }
  };
  for (let k = 0; k < b.size; k++) {
    tryLine(b.x + k, b.y, 0, -1);
    tryLine(b.x + k, b.y + b.size - 1, 0, 1);
    tryLine(b.x, b.y + k, -1, 0);
    tryLine(b.x + b.size - 1, b.y + k, 1, 0);
  }
  return best;
}

export function reachesOutside(w: World, b: Building): boolean {
  const net = network(w);
  const a = net.access.get(b.id);
  return a !== undefined && net.outside.has(net.comp[a]);
}

/** Share each network's plant output among its buildings, oldest first. */
export function updateUtilities(w: World) {
  const net = network(w);
  const supply = new Map<number, { p: number; wa: number; s: number }>();
  const get = (c: number) => { let v = supply.get(c); if (!v) supply.set(c, (v = { p: 0, wa: 0, s: 0 })); return v; };
  let pS = 0, wS = 0, sS = 0;
  w.buildings.forEach((b) => {
    const a = net.access.get(b.id);
    if (a === undefined) return;
    const d = KINDS[b.kind];
    const g = get(net.comp[a]);
    if (d.power < 0) { g.p -= d.power; pS -= d.power; }
    if (d.water < 0) { g.wa -= d.water; wS -= d.water; }
    if (b.kind === 'sewage') { g.s += SEWAGE_CAPACITY; sS += SEWAGE_CAPACITY; }
  });
  let pU = 0, wU = 0, sU = 0;
  const sorted = [...w.buildings.values()].sort((a, b) => a.id - b.id);
  for (const b of sorted) {
    const d = KINDS[b.kind];
    const a = net.access.get(b.id);
    const g = a === undefined ? null : supply.get(net.comp[a]);
    const pNeed = Math.max(0, d.power), wNeed = Math.max(0, d.water);
    // An empty or abandoned building draws almost nothing.
    const load = b.abandoned ? 0.1 : d.zone ? 0.3 + 0.7 * occRatio(b) : 1;
    const pn = pNeed * load, wn = wNeed * load;
    b.powered = d.power < 0 || (!!g && g.p >= pn);
    b.watered = d.water < 0 || wNeed === 0 || (!!g && g.wa >= wn);
    b.sewered = wNeed === 0 || d.water < 0 || (!!g && g.s >= wn);
    if (g) {
      if (b.powered && pn) { g.p -= pn; pU += pn; }
      if (b.watered && wn) { g.wa -= wn; wU += wn; }
      if (b.sewered && wn && d.water > 0) { g.s -= wn; sU += wn; }
    }
  }
  w.stats.powerSupply = pS; w.stats.powerUse = pU;
  w.stats.waterSupply = wS; w.stats.waterUse = wU;
  w.stats.sewageCap = sS; w.stats.sewageUse = sU;
}

export function occRatio(b: Building): number {
  const d = KINDS[b.kind];
  const cap = d.residents ?? d.jobs ?? 0;
  return cap ? b.occ / cap : 1;
}
