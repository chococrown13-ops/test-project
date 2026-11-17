import { B, CELL, type DistrictKind, type Game, Ground, idx, inside, N, pick, type Place, type PlaceKind, rand, RoadT, START_YEAR } from './world';
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

  // Roads: avenues on a loose grid, streets between, both bending a little with the land.
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = idx(x, y);
    if (g.ground[i] !== Ground.Land) continue;
    const town = g.district[i] >= 0;
    const ox = x + Math.round((nz(y / 40, 1.7) - 0.5) * 6), oy = y + Math.round((nz(x / 40, 5.3) - 0.5) * 6);
    const avenue = (ox % 32 === 0 || oy % 32 === 0);
    const street = town && (ox % 8 === 0 || oy % 8 === 4);
    if (avenue && Math.hypot(x - C, y - C) < 118) g.road[i] = RoadT.Avenue;
    else if (street && g.district[i] !== 3 || street && (ox % 16 === 0 || oy % 16 === 4)) g.road[i] = RoadT.Street;
  }
  // Bridges: every other north-south avenue carries straight on across the river.
  let bridges = 0;
  for (let x = 2; x < N - 2; x++) {
    for (let y = 1; y < N - 1; y++) {
      const i = idx(x, y);
      if (g.road[i] !== RoadT.Avenue || g.road[idx(x - 1, y)] === RoadT.Avenue || g.ground[idx(x, y + 1)] !== Ground.Water) continue;
      if (bridges++ % 2) break;
      let yy = y + 1;
      while (yy < N && g.ground[idx(x, yy)] === Ground.Water) { g.road[idx(x, yy)] = RoadT.Avenue; yy++; }
      // And on a little way into the far bank.
      for (let k = 0; k < 10 && yy + k < N; k++) if (g.ground[idx(x, yy + k)] === Ground.Land) g.road[idx(x, yy + k)] = RoadT.Avenue;
      break;
    }
  }

  // 1970: low houses, shops on the bigger streets, the market, a few workshops; fields at the edge.
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = idx(x, y);
    if (g.road[i] || g.ground[i] !== Ground.Land) continue;
    const d = g.district[i];
    if (d < 0) { if (rand(g) < 0.55 && g.height[i] < 6) { g.btype[i] = B.Field; } continue; }
    const kind = g.districts[d].kind;
    const onAvenue = nearRoad(g, x, y, RoadT.Avenue);
    const r = rand(g);
    let t: number = B.Giwa;
    if (kind === 'market' && Math.hypot(x - g.districts[d].cx, y - g.districts[d].cy) < 9) t = B.Market;
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
      if (g.district[i] !== d.id || g.road[i] || g.ground[i] !== Ground.Land || !nearRoad(g, x, y, RoadT.Street)) continue;
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
