import { Ground, KINDS, N, SERVICE, Zone, type BuildingKind } from './defs';
import { findAccess, network, occRatio, reachesOutside } from './network';
import { addBuilding, demolish, footprint } from './tools';
import { transitLandBonus } from './transit';
import { idx, inside, notify, rand, type Building, type World } from './world';

const LEVEL_KIND: Record<number, BuildingKind[]> = {
  [Zone.R]: ['r1', 'r2', 'r3'],
  [Zone.C]: ['c1', 'c2', 'c3'],
  [Zone.I]: ['i1', 'i2', 'i3'],
};
const zkey = (z: number) => (z === Zone.R ? 'R' : z === Zone.C ? 'C' : 'I') as 'R' | 'C' | 'I';

/* ------------------------------------------------------------ land value */

/** Pollution sources: radius in cells and strength. */
const EMIT: Partial<Record<BuildingKind, [number, number]>> = {
  i1: [4, 18], i2: [5, 28], i3: [3, 8], coal: [9, 55], sewage: [5, 30],
};

export function updateLand(w: World) {
  const size = N * N;
  w.pollution.fill(0);
  w.edu.fill(0); w.safety.fill(0); w.fire.fill(0); w.health.fill(0);
  const bonus = new Float32Array(size);
  const stamp = (cx: number, cy: number, r: number, fn: (i: number, f: number) => void) => {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if (!inside(x, y)) continue;
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d <= r) fn(idx(x, y), 1 - d / (r + 1));
      }
  };
  w.buildings.forEach((b) => {
    const cx = b.x + b.size / 2, cy = b.y + b.size / 2;
    const e = EMIT[b.kind];
    if (e && !b.abandoned) stamp(cx, cy, e[0] + b.size / 2, (i, f) => { w.pollution[i] = Math.min(100, w.pollution[i] + e[1] * f); });
    const s = SERVICE[b.kind];
    if (s && b.powered) stamp(cx, cy, s.radius, (i, f) => { w[s.key][i] = 1; bonus[i] += s.value * Math.min(1, f * 2); });
    if (b.kind === 'park') stamp(cx, cy, 4, (i, f) => { bonus[i] += 14 * f; });
    if (b.kind.startsWith('c') && !b.abandoned) stamp(cx, cy, 4, (i, f) => { bonus[i] += 4 * f * (KINDS[b.kind].level ?? 1); });
  });
  transitLandBonus(w, bonus);
  // River view: the closer to the water, the pricier (한강뷰).
  const waterDist = distanceTo((i) => w.ground[i] === Ground.Water, 6);
  for (let i = 0; i < size; i++) {
    if (w.ground[i] === Ground.Water) { w.land[i] = 0; continue; }
    const view = waterDist[i] <= 5 ? (6 - waterDist[i]) * 3 : 0;
    const noise = w.traffic[i] * 6 + neighbourTraffic(w, i) * 4;
    w.land[i] = clamp(32 + view + bonus[i] - w.pollution[i] * 0.6 - noise, 0, 100);
  }
}

function neighbourTraffic(w: World, i: number): number {
  const x = i % N, y = (i / N) | 0;
  let m = 0;
  if (x > 0) m = Math.max(m, w.traffic[i - 1]);
  if (x < N - 1) m = Math.max(m, w.traffic[i + 1]);
  if (y > 0) m = Math.max(m, w.traffic[i - N]);
  if (y < N - 1) m = Math.max(m, w.traffic[i + N]);
  return Math.min(1.5, m);
}

/** Chebyshev distance to the nearest matching cell, capped. */
function distanceTo(hit: (i: number) => boolean, cap: number): Uint8Array {
  const d = new Uint8Array(N * N).fill(cap);
  const q: number[] = [];
  for (let i = 0; i < N * N; i++) if (hit(i)) { d[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const c = q[h], x = c % N, y = (c / N) | 0;
    if (d[c] >= cap) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (!inside(nx, ny)) continue;
      const n = idx(nx, ny);
      if (d[n] > d[c] + 1) { d[n] = d[c] + 1; q.push(n); }
    }
  }
  return d;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/* ---------------------------------------------------------------- demand */

export function updateDemand(w: World) {
  const s = w.stats;
  let jobsC = 0, jobsI = 0, capC = 0, capI = 0;
  w.buildings.forEach((b) => {
    const d = KINDS[b.kind];
    if (b.abandoned || !d.jobs) return;
    if (d.zone === Zone.C) { jobsC += b.occ; capC += d.jobs; }
    if (d.zone === Zone.I) { jobsI += b.occ; capI += d.jobs; }
  });
  const pop = s.pop;
  const workers = pop * 0.52;
  const jobsCap = capC + capI;
  const taxAdj = (t: number) => (9 - t) * 5;
  // People come for jobs; shops follow people; industry follows workers.
  const early = Math.max(0, 40 - pop / 50);
  const R = early + ((jobsCap * 1.05 - workers) / Math.max(40, workers)) * 70 + 12 + taxAdj(w.tax.R) + (s.happy - 60) * 0.6;
  const C = ((pop * 0.22 - capC) / Math.max(25, pop * 0.22)) * 85 + taxAdj(w.tax.C) + Math.min(20, early);
  const I = ((workers * 0.55 - capI) / Math.max(25, workers * 0.55)) * 85 + taxAdj(w.tax.I) + Math.min(25, early);
  const ease = (o: number, n: number) => o + (clamp(n, -100, 100) - o) * 0.25;
  w.demand.R = ease(w.demand.R, R);
  w.demand.C = ease(w.demand.C, C);
  w.demand.I = ease(w.demand.I, I);
  s.workers = workers;
  s.jobs = jobsCap;
  s.employed = jobsC + jobsI;
}

/* ---------------------------------------------------------------- growth */

let zoned: number[] = [];
let zonedVer = -1;

export function grow(w: World) {
  if (zonedVer !== w.ver.zones) {
    zoned = [];
    for (let i = 0; i < N * N; i++) if (w.zone[i]) zoned.push(i);
    zonedVer = w.ver.zones;
  }
  if (!zoned.length) return;
  const net = network(w);
  const tries = Math.min(zoned.length, 30 + (zoned.length >> 4));
  for (let t = 0; t < tries; t++) {
    const i = zoned[(rand(w) * zoned.length) | 0];
    const z = w.zone[i];
    if (!z) continue;
    const dem = w.demand[zkey(z)];
    const id = w.bld[i];
    const x = i % N, y = (i / N) | 0;
    if (id < 0) {
      if (dem <= 0 || rand(w) > dem / 100 * 0.6) continue;
      const kind = LEVEL_KIND[z][0];
      const a = findAccess(w, { x, y, size: 1 });
      if (a < 0 || !net.outside.has(net.comp[a])) continue;
      addBuilding(w, kind, x, y);
      continue;
    }
    const b = w.buildings.get(id)!;
    const d = KINDS[b.kind];
    if (!d.zone || b.abandoned || (d.level ?? 3) >= 3) continue;
    if (!b.powered || !b.watered || b.happy < 52 || dem < 5 || rand(w) > 0.12) continue;
    // Homes care most about land value; factories hardly at all.
    const need = (z === Zone.R ? [30, 46] : z === Zone.C ? [26, 40] : [0, 15])[(d.level ?? 1) - 1];
    if (w.land[i] < need) continue;
    if (d.level === 1) { upgradeInPlace(w, b, LEVEL_KIND[z][1]); continue; }
    tryMerge(w, b, z);
  }
}

function upgradeInPlace(w: World, b: Building, kind: BuildingKind) {
  const { x, y } = b;
  const occ = b.occ;
  demolish(w, b.id);
  const nb = addBuilding(w, kind, x, y);
  nb.occ = occ;
  nb.powered = true; nb.watered = true;
}

/** Four mid-density lots of the same zone become one 아파트 단지 or tower. */
function tryMerge(w: World, b: Building, z: number) {
  const top = LEVEL_KIND[z][2];
  for (const [ox, oy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
    const x0 = b.x + ox, y0 = b.y + oy;
    if (!inside(x0, y0) || !inside(x0 + 1, y0 + 1)) continue;
    const cells = footprint(x0, y0, 2);
    const ok = cells.every((i) => {
      if (w.zone[i] !== z || w.road[i]) return false;
      const id = w.bld[i];
      if (id < 0) return true;
      const o = w.buildings.get(id)!;
      return o.size === 1 && (KINDS[o.kind].level ?? 0) >= 2 && !o.abandoned;
    });
    if (!ok) continue;
    let occ = 0;
    cells.forEach((i) => { const id = w.bld[i]; if (id >= 0) { occ += w.buildings.get(id)!.occ; demolish(w, id); } });
    const nb = addBuilding(w, top, x0, y0);
    nb.occ = occ;
    nb.powered = true; nb.watered = true;
    if (top === 'r3' && !w.milestones.includes(-3)) { w.milestones.push(-3); notify(w, '첫 아파트 단지가 들어섰어요!', 'good'); }
    if (top === 'c3' && !w.milestones.includes(-4)) { w.milestones.push(-4); notify(w, '첫 오피스 타워가 올라갔어요!', 'good'); }
    return;
  }
}

/* -------------------------------------------------------- daily buildings */

export function updateBuildings(w: World) {
  const s = w.stats;
  let pop = 0, happySum = 0, happyN = 0;
  // Jobs fill with the workers the city has; commuters from outside top up a little.
  const jobCap = s.jobs || 1;
  const fill = Math.min(1, (s.workers * 1.1 + 40) / jobCap);
  const toRemove: number[] = [];
  w.buildings.forEach((b) => {
    const d = KINDS[b.kind];
    if (!d.zone) return;
    const i = idx(b.x, b.y);
    const out = !b.powered || !b.watered;
    b.outage = out ? b.outage + 1 : Math.max(0, b.outage - 3);
    let h = 60;
    h += b.powered ? 6 : -28;
    h += b.watered ? 6 : -28;
    h += b.sewered ? 3 : -8;
    h += (w.land[i] - 40) * 0.35;
    h -= w.pollution[i] * (d.zone === Zone.R ? 0.35 : 0.05);
    if (d.zone === Zone.R) {
      h += w.edu[i] ? 6 : -3;
      h += w.safety[i] ? 4 : -2;
      h += w.health[i] ? 4 : -2;
      h += w.fire[i] ? 2 : -1;
      h += w.transit[i] === 2 ? 4 : w.transit[i] ? 2 : 0;
      h -= Math.max(0, s.commute - 35) * 0.6;
    }
    if (!reachesOutside(w, b)) h -= 30;
    b.happy += (clamp(h, 0, 100) - b.happy) * 0.15;
    if (!b.abandoned && b.outage > 40) { b.abandoned = true; b.occ = 0; w.ver.buildings++; }
    else if (b.abandoned && !out && b.happy > 40) { b.abandoned = false; w.ver.buildings++; }
    if (b.abandoned && w.day - b.builtDay > 240 && rand(w) < 0.01) toRemove.push(b.id);
    const cap = d.residents ?? d.jobs ?? 0;
    if (d.zone === Zone.R) {
      const target = b.abandoned ? 0 : cap * (b.happy > 30 ? 1 : 0.5) * (w.demand.R > -40 ? 1 : 0.85);
      b.occ += (target - b.occ) * 0.06;
      pop += b.occ;
      happySum += b.happy * b.occ;
      happyN += b.occ;
    } else {
      const target = b.abandoned ? 0 : cap * fill;
      b.occ += (target - b.occ) * 0.1;
    }
  });
  toRemove.forEach((id) => demolish(w, id));
  s.pop = Math.round(pop);
  s.happy = happyN ? happySum / happyN : 60;
}

export { occRatio };
