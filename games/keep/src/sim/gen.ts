import { B, carveAlleys, CELL, type DistrictKind, type Game, Ground, idx, inside, N, pick, type Place, type PlaceKind, rand, RoadT, START_YEAR } from './world';
import { founderName, placeName, placeStory } from './text';

/** Smooth value noise in 0..1. */
function noise(seed: number) {
  const h = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7 + seed * 0.013) * 43758.5453; return s - Math.floor(s); };
  return (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

const DISTRICT_NAMES: Record<DistrictKind, string[]> = {
  market: ['장터동', '저잣동', '시장동'],
  school: ['학당동', '배움동', '글방동'],
  river: ['나루동', '강변동', '물가동'],
  hill: ['달동', '산마루동', '언덕동'],
  station: ['역말동', '역전동', '정거장동'],
};
const GU_NAMES = ['새솔구', '한빛구', '느티구', '가람구', '솔뫼구', '은하구'];

/** Kinds of 기억 장소 each district favours. */
const PLACE_KINDS: Record<DistrictKind, PlaceKind[]> = {
  market: ['gukbap', 'market', 'mill', 'hardware', 'chinese', 'tearoom', 'corner'],
  school: ['school', 'snack', 'books', 'photo', 'corner', 'mural'],
  river: ['bath', 'tree', 'gukbap', 'barber', 'church', 'tearoom'],
  hill: ['briquette', 'corner', 'mural', 'tree', 'church', 'barber'],
  station: ['cinema', 'tearoom', 'chinese', 'photo', 'crossing', 'bath'],
};

export function generate(seed: number): Game {
  const g: Game = {
    version: 1, seed, rng: seed >>> 0, gu: '', year: START_YEAR, turn: 0,
    ground: new Uint8Array(N * N), height: new Float32Array(N * N), road: new Uint8Array(N * N),
    district: new Int8Array(N * N).fill(-1), btype: new Uint8Array(N * N), built: new Int16Array(N * N), floors: new Uint8Array(N * N),
    districts: [], places: [], money: 40, history: [], lost: [], offer: [], mayor: { id: 'mood', trait: '' }, done: false,
  };
  g.gu = pick(g, GU_NAMES);
  const nz = noise(seed);
  const C = N / 2;

  // River: a broad bend across the south third.
  const riverAt = (x: number) => N * 0.72 + Math.sin(x / N * Math.PI * 1.3 + (seed % 7)) * 14 + (nz(x / 30, 3.3) - 0.5) * 10;
  // Hills: a ridge to the north and knolls toward the edges; the middle stays flat for the town.
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = idx(x, y);
    const r = riverAt(x);
    const half = 4 + nz(x / 20, 9.1) * 2.5;
    if (Math.abs(y - r) < half) { g.ground[i] = Ground.Water; g.height[i] = -3; continue; }
    const edge = Math.min(x, y, N - 1 - x) / N; // north and side edges (the south is the river plain)
    const dc = Math.hypot(x - C, y - C * 0.95) / N;
    let h = 0;
    const ridge = Math.max(0, 0.22 - edge) / 0.22;
    h = ridge ** 1.4 * (90 + nz(x / 18, y / 18) * 110);
    // A hill inside the town: the 달동네 climbs it.
    const hx = C + 46, hy = C - 30;
    const k = Math.max(0, 1 - Math.hypot(x - hx, y - hy) / 24);
    h = Math.max(h, k ** 1.3 * (70 + nz(x / 9, y / 9) * 20));
    if (dc > 0.62) h = Math.max(h, (dc - 0.62) * 400 * nz(x / 14, y / 14));
    if (y > r) h *= 0.35; // across the river: lower land
    h *= 0.8 + nz(x / 5, y / 5) * 0.4;
    g.height[i] = h;
    if (h > 28) g.ground[i] = Ground.Hill;
  }

  // Five 동네 around the centre, each with a character.
  const kinds: DistrictKind[] = ['market', 'school', 'river', 'hill', 'station'];
  const seeds: [number, number][] = [[C - 6, C - 4], [C - 44, C - 26], [C - 20, C + 26], [C + 40, C - 26], [C + 34, C + 20]];
  kinds.forEach((kind, k) => {
    const [cx, cy] = seeds[k];
    g.districts.push({
      id: k, name: pick(g, DISTRICT_NAMES[kind]), kind, cx, cy, pop: 0,
      vitality: kind === 'market' ? 62 : kind === 'station' ? 58 : kind === 'hill' ? 38 : 50,
      land: kind === 'station' ? 45 : kind === 'market' ? 42 : kind === 'hill' ? 18 : 30,
      original: 1, protected: false, station: false, levee: false, tourism: 0,
    });
  });
  // Cells belong to the nearest district centre, within the built-up radius (a little ragged).
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = idx(x, y);
    if (g.ground[i] === Ground.Water) continue;
    const dc = Math.hypot(x - C, y - C * 0.98) + (nz(x / 12 + 40, y / 12) - 0.5) * 26;
    if (dc > 78) continue;
    let best = -1, bd = Infinity;
    for (const d of g.districts) { const dd = Math.hypot(x - d.cx, y - d.cy); if (dd < bd) { bd = dd; best = d.id; } }
    g.district[i] = best;
  }

  // Roads: avenues on a loose grid, streets between. Each road is traced as one
  // line that bends a little with the land; where it shifts sideways the gap is
  // filled so the road always runs cell to cell, never corner to corner.
  const trace = (vertical: boolean, base: number, k: number, kind: number, keep: (x: number, y: number) => boolean, amp = 4) => {
    let prev = -1;
    for (let t = 0; t < N; t++) {
      const off = base + Math.round((nz(t / 40, 1.7 + k * 0.37) - 0.5) * amp);
      const [x, y] = vertical ? [off, t] : [t, off];
      if (!inside(x, y) || !keep(x, y)) { prev = -1; continue; }
      const put = (cx: number, cy: number) => { const i = idx(cx, cy); if (g.road[i] < kind) g.road[i] = kind; };
      if (prev >= 0 && prev !== off) for (let o = Math.min(prev, off); o <= Math.max(prev, off); o++) vertical ? put(o, t) : put(t, o);
      put(x, y);
      prev = off;
    }
  };
  const dry = (x: number, y: number) => g.ground[idx(x, y)] !== Ground.Water;
  const near = (x: number, y: number) => Math.hypot(x - C, y - C) < 118;
  // Avenues: dead straight, every 32 cells (a planned 대로 grid). Every other
  // north-south one crosses the river on a bridge.
  for (let k = -3; k <= 3; k++) {
    const b = C + k * 32;
    trace(true, b, k, RoadT.Avenue, (x, y) => near(x, y) && (dry(x, y) || k % 2 === 0), 0);
    trace(false, b, k + 11, RoadT.Avenue, (x, y) => near(x, y) && dry(x, y), 0);
  }
  // Streets: every 8 cells inside the town; sparser up the 달동네 hill.
  const town = (x: number, y: number) => g.district[idx(x, y)] >= 0 && dry(x, y);
  for (let k = -16; k <= 16; k++) {
    const b = C + k * 8;
    const sparse = (x: number, y: number) => g.district[idx(x, y)] !== 3 || k % 2 === 0;
    // (Every fourth north-south street would sit on an avenue: leave it to the avenue.)
    if (k % 4 !== 0) trace(true, b, k + 30, RoadT.Street, (x, y) => town(x, y) && sparse(x, y));
    trace(false, b + 4, k + 60, RoadT.Street, (x, y) => town(x, y) && sparse(x, y));
  }
  // Stubs: a road cell with no road beside it goes back to land.
  for (let i = 0; i < N * N; i++) {
    if (!g.road[i]) continue;
    const x = i % N, y = (i / N) | 0;
    if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inside(x + dx, y + dy) && g.road[idx(x + dx, y + dy)])) g.road[i] = 0;
  }

  // 골목: every lot in the town gets a road at its door.
  carveAlleys(g, (i) => g.district[i] >= 0 && g.ground[i] !== Ground.Water);

  // 1970: low houses, shops on the bigger streets, the market, a few workshops; fields at the edge.
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = idx(x, y);
    if (g.road[i] || g.ground[i] === Ground.Water) continue;
    const d = g.district[i];
    if (d < 0) { if (rand(g) < 0.55 && g.height[i] < 6) { g.btype[i] = B.Field; } continue; }
    const kind = g.districts[d].kind;
    const onAvenue = nearRoad(g, x, y, RoadT.Avenue);
    const r = rand(g);
    let t: number = B.Giwa;
    if (kind === 'market' && Math.hypot(x - g.districts[d].cx, y - g.districts[d].cy) < 5) t = B.Market;
    else if (onAvenue) t = r < 0.6 ? B.Shop : B.Slate;
    else if (kind === 'hill') t = r < 0.85 ? B.Slate : B.Giwa;
    else if (kind === 'station' && r < 0.12) t = B.Factory;
    else t = r < 0.5 ? B.Giwa : r < 0.88 ? B.Slate : B.Shop;
    if (rand(g) < 0.08) { g.btype[i] = B.None; continue; } // yards and gaps
    g.btype[i] = t;
    g.built[i] = START_YEAR - Math.floor(rand(g) * 40);
    g.floors[i] = t === B.Shop ? 2 + Math.floor(rand(g) * 2) : 1;
  }

  // 기억 장소: 6-8 per 동네, on lots facing a road, spread apart.
  let pid = 0;
  for (const d of g.districts) {
    const want = d.kind === 'market' || d.kind === 'station' ? 8 : 6;
    const kinds = [...PLACE_KINDS[d.kind]];
    for (let k = 0, tries = 0; k < want && tries < 600; tries++) {
      const r = 4 + rand(g) * 20, a = rand(g) * Math.PI * 2;
      const x = Math.round(d.cx + Math.cos(a) * r), y = Math.round(d.cy + Math.sin(a) * r);
      if (!inside(x, y)) continue;
      const i = idx(x, y);
      if (g.district[i] !== d.id || g.road[i] || g.ground[i] === Ground.Water || !nearRoad(g, x, y, RoadT.Street)) continue;
      if (g.places.some((p) => Math.hypot(p.x - x, p.y - y) < 6)) continue;
      const kind = kinds.length ? kinds.splice(Math.floor(rand(g) * kinds.length), 1)[0] : pick(g, PLACE_KINDS[d.kind]);
      const since = START_YEAR - 5 - Math.floor(rand(g) * 35);
      const founder = founderName(g);
      const p: Place = { id: pid++, kind, name: placeName(g, kind, d.name), district: d.id, x, y, since, founder, story: [], state: 'open', protected: false, support: 0 };
      p.story = placeStory(g, p);
      g.places.push(p);
      g.btype[i] = B.Place;
      g.built[i] = since;
      g.floors[i] = kind === 'school' || kind === 'church' || kind === 'cinema' ? 2 : 1;
      k++;
    }
  }
  return g;
}

function nearRoad(g: Game, x: number, y: number, min: number): boolean {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (inside(nx, ny) && g.road[idx(nx, ny)] >= min) return true;
  }
  return false;
}

export const cellCentre = (x: number, y: number) => ({ x: x * CELL + CELL / 2, z: y * CELL + CELL / 2 });
