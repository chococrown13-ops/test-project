/*
 * Builds the real-Korea starting maps: for every 시/군, a few 1.28 km squares
 * (128 x 128 cells of 10 m) of real land, water and hills.
 *
 * Sources (all open data, fetched at build time, not at play time):
 *   - 시군구 boundaries: southkorea/southkorea-maps (KOSTAT 2018), GeoJSON
 *   - land cover, 10 m: ESA WorldCover 2021 v200 (CC BY 4.0), cloud-optimised GeoTIFF on AWS
 *   - elevation: AWS Terrain Tiles (Terrarium), zoom 14
 *
 * Output: games/city/src/data/korea/index.json (every tile's name and province)
 * and one JSON per province with the tiles' cells, deflated and base64'd.
 *
 * Run (needs network): node games/city/scripts/korea-build.mjs <work-dir>
 * The work dir holds the downloaded boundaries and caches; the script needs
 * geotiff, undici and pngjs installed there (npm i geotiff undici pngjs).
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const WORK = path.resolve(process.argv[2] ?? '.');
const req = createRequire(path.join(WORK, 'package.json'));
const { ProxyAgent, setGlobalDispatcher } = req('undici');
if (process.env.HTTPS_PROXY) setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY));
const { fromUrl } = await import(req.resolve('geotiff'));
const { PNG } = req('pngjs');

const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src/data/korea');
const N = 128, CELL = 10, SPAN = N * CELL;

const PROVINCES = {
  11: '서울특별시', 21: '부산광역시', 22: '대구광역시', 23: '인천광역시', 24: '광주광역시', 25: '대전광역시', 26: '울산광역시',
  29: '세종특별자치시', 31: '경기도', 32: '강원도', 33: '충청북도', 34: '충청남도', 35: '전라북도', 36: '전라남도',
  37: '경상북도', 38: '경상남도', 39: '제주특별자치도',
};
const METRO = new Set(['11', '21', '22', '23', '24', '25', '26']);

/* ------------------------------------------------------------ units */

const geo = JSON.parse(fs.readFileSync(path.join(WORK, 'skorea-municipalities-2018-geo.json'), 'utf8'));
const units = new Map();
for (const f of geo.features) {
  const { code, name } = f.properties;
  const prov = code.slice(0, 2);
  let key, label;
  if (METRO.has(prov) && code[2] !== '3') { key = prov; label = PROVINCES[prov]; }
  else if (!METRO.has(prov) && code[4] !== '0') { key = code.slice(0, 4); label = name.replace(/시.+구$/, '시'); }
  else { key = code; label = name; }
  if (!units.has(key)) units.set(key, { key, prov, name: label, polys: [] });
  const g = f.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  units.get(key).polys.push(...polys);
}

function inPoly(lon, lat, poly) {
  let inside = false;
  for (const ring of poly) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}
const inUnit = (u, lon, lat) => u.polys.some((p) => inPoly(lon, lat, p));
function bbox(u) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const p of u.polys) for (const [x, y] of p[0]) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }
  return [a, b, c, d];
}
function areaKm2(u) {
  let s = 0;
  for (const p of u.polys) {
    const r = p[0], lat0 = r[0][1] * Math.PI / 180;
    let a = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] * r[i][1] - r[i][0] * r[j][1]);
    s += Math.abs(a / 2) * 111.32 * 111.32 * Math.cos(lat0);
  }
  return s;
}

/* ------------------------------------------------------------ sources */

const tiffs = new Map();
async function worldCover(lat, lon) {
  const la = Math.floor(lat / 3) * 3, lo = Math.floor(lon / 3) * 3;
  const name = `ESA_WorldCover_10m_2021_v200_N${String(la).padStart(2, '0')}E${String(lo).padStart(3, '0')}_Map.tif`;
  if (!tiffs.has(name)) tiffs.set(name, fromUrl(`https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/${name}`, { cache: true }).then((t) => t.getImage()));
  return tiffs.get(name);
}

const demCache = new Map();
const DEM_DIR = path.join(WORK, 'dem');
fs.mkdirSync(DEM_DIR, { recursive: true });
async function demTile(z, x, y) {
  const k = `${z}/${x}/${y}`;
  if (demCache.has(k)) return demCache.get(k);
  const p = (async () => {
    const file = path.join(DEM_DIR, `${z}_${x}_${y}.png`);
    let buf;
    if (fs.existsSync(file)) buf = fs.readFileSync(file);
    else {
      for (let tries = 0; ; tries++) {
        try {
          const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${k}.png`);
          if (!r.ok) throw new Error(`dem ${r.status}`);
          buf = Buffer.from(await r.arrayBuffer());
          break;
        } catch (e) { if (tries > 3) throw e; await new Promise((s) => setTimeout(s, 1000 * (tries + 1))); }
      }
      fs.writeFileSync(file, buf);
    }
    const png = PNG.sync.read(buf);
    const h = new Float32Array(256 * 256);
    for (let i = 0; i < 256 * 256; i++) h[i] = png.data[i * 4] * 256 + png.data[i * 4 + 1] + png.data[i * 4 + 2] / 256 - 32768;
    return h;
  })();
  demCache.set(k, p);
  return p;
}
async function elevation(lat, lon) {
  const z = 14, n = 2 ** z;
  const fx = ((lon + 180) / 360) * n;
  const s = Math.sin((lat * Math.PI) / 180);
  const fy = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  const tx = Math.floor(fx), ty = Math.floor(fy);
  const t = await demTile(z, tx, ty);
  const px = Math.min(255, Math.max(0, (fx - tx) * 256 - 0.5)), py = Math.min(255, Math.max(0, (fy - ty) * 256 - 0.5));
  const x0 = Math.floor(px), y0 = Math.floor(py), x1 = Math.min(255, x0 + 1), y1 = Math.min(255, y0 + 1), u = px - x0, v = py - y0;
  const g = (x, y) => t[y * 256 + x];
  return g(x0, y0) * (1 - u) * (1 - v) + g(x1, y0) * u * (1 - v) + g(x0, y1) * (1 - u) * v + g(x1, y1) * u * v;
}

/* ------------------------------------------------------------ a tile */

// Cell values: 0 open land, 1 forest (land, trees), 2 water, 3..255 hill (height/2 + 3 m).
const LAND = 0, FOREST = 1, WATER = 2;

async function sampleTile(lat, lon) {
  const dLat = SPAN / 111320, dLon = SPAN / (111320 * Math.cos((lat * Math.PI) / 180));
  const north = lat + dLat / 2, west = lon - dLon / 2;
  const img = await worldCover(lat, lon);
  const [ox, oy] = img.getOrigin(), [rx, ry] = img.getResolution();
  const c0 = Math.floor((west - ox) / rx), r0 = Math.floor((north - oy) / ry);
  const c1 = Math.ceil((west + dLon - ox) / rx), r1 = Math.ceil((north - dLat - oy) / ry);
  if (c0 < 0 || r0 < 0 || c1 > img.getWidth() || r1 > img.getHeight()) return null; // straddles a source tile: skip
  const ras = (await img.readRasters({ window: [c0, r0, c1, r1] }))[0];
  const ww = c1 - c0, wh = r1 - r0;
  const cover = new Uint8Array(N * N), elev = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const la = north - ((y + 0.5) / N) * dLat, lo = west + ((x + 0.5) / N) * dLon;
    const cx = Math.min(ww - 1, Math.floor((lo - ox) / rx) - c0), cy = Math.min(wh - 1, Math.floor((la - oy) / ry) - r0);
    cover[y * N + x] = ras[cy * ww + cx];
    elev[y * N + x] = await elevation(la, lo);
  }
  return { cover, elev };
}

function classify({ cover, elev }) {
  const land = [];
  for (let i = 0; i < N * N; i++) if (cover[i] !== 80) land.push(elev[i]);
  if (land.length < N * N * 0.3) return null;
  land.sort((a, b) => a - b);
  const base = land[Math.floor(land.length * 0.12)];
  const cell = new Uint8Array(N * N);
  const slope = (i) => {
    const x = i % N, y = (i / N) | 0;
    const e = elev[Math.min(N - 1, x + 1) + y * N] - elev[Math.max(0, x - 1) + y * N];
    const n = elev[x + Math.min(N - 1, y + 1) * N] - elev[x + Math.max(0, y - 1) * N];
    return Math.hypot(e, n) / (2 * CELL);
  };
  for (let i = 0; i < N * N; i++) {
    const c = cover[i], rel = elev[i] - base;
    if (c === 80 || c === 90 && rel < 2) { cell[i] = WATER; continue; }
    // Hills: well above the valley floor, or steep, and not already built on.
    const hill = c !== 50 && (rel > 28 || (slope(i) > 0.32 && rel > 12));
    cell[i] = hill ? 3 + Math.min(252, Math.round(Math.max(rel, 8) / 2)) : c === 10 ? FOREST : LAND;
  }
  // Tidy specks: a cell flips to what most of its neighbours are when it's alone.
  const kind = (v) => (v >= 3 ? 3 : v === WATER ? 2 : 0);
  for (let pass = 0; pass < 2; pass++) {
    const prev = cell.slice();
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
      const i = y * N + x, k = kind(prev[i]);
      const cnt = [0, 0, 0, 0];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) cnt[kind(prev[i + dy * N + dx])]++;
      if (cnt[k] <= 1) {
        const best = cnt.indexOf(Math.max(...cnt));
        cell[i] = best === 3 ? 3 + Math.round(Math.max(8, elev[i] - base) / 2) : best === 2 ? WATER : LAND;
      }
    }
  }
  return cell;
}

const rotate = (a) => { const o = new Uint8Array(N * N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) o[x * N + (N - 1 - y)] = a[y * N + x]; return o; };

/** A row whose first 23 cells are flat land (the expressway link), nearest the middle; -1 if none. */
function startRow(cell) {
  let best = -1;
  for (let y = 8; y < N - 8; y++) {
    let ok = true;
    for (let x = 0; x <= 22 && ok; x++) for (const dy of [-1, 0, 1]) if (cell[(y + dy) * N + x] >= WATER) ok = false;
    if (ok && (best < 0 || Math.abs(y - N / 2) < Math.abs(best - N / 2))) best = y;
  }
  return best;
}

function score(cell, minLand) {
  let land = 0, water = 0, hill = 0;
  for (const v of cell) { if (v === WATER) water++; else if (v >= 3) hill++; else land++; }
  const n = N * N;
  if (land < n * minLand) return null;
  // Some water and some hills make the most interesting maps; a sea of water or of hills doesn't.
  const s = land / n + (water > 60 ? 0.25 : 0) + Math.min(water / n, 0.25) + Math.min(hill / n, 0.25) * 0.6;
  return { s, land, water, hill };
}

/* ------------------------------------------------------------ run */

let seed = 20261111;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

const all = [...units.values()].sort((a, b) => a.key.localeCompare(b.key));
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const byProv = {};
const index = [];
let done = 0;
async function doUnit(u) {
  const [a, b, c, d] = bbox(u);
  const want = Math.max(3, Math.min(8, Math.round(areaKm2(u) / 120)));
  const cands = [];
  for (let t = 0; t < 2000 && cands.length < want * 12; t++) {
    const lon = a + rnd() * (c - a), lat = b + rnd() * (d - b);
    if (inUnit(u, lon, lat)) cands.push([lat, lon]);
  }
  const ok = [];
  // Mountain counties have little flat land: after a first pass, settle for less of it.
  let minLand = 0.45, tried = 0;
  for (const [lat, lon] of cands) {
    if (ok.length >= want * 2) break;
    if (++tried === want * 5 && ok.length < want) minLand = 0.3;
    let raw;
    try { raw = await sampleTile(lat, lon); } catch (e) { console.error('  skip', u.name, e.message); continue; }
    if (!raw) continue;
    let cell = classify(raw);
    if (!cell) continue;
    const sc = score(cell, minLand);
    if (!sc) continue;
    let rot = 0, row = startRow(cell);
    while (row < 0 && rot < 3) { cell = rotate(cell); rot++; row = startRow(cell); }
    if (row < 0) continue;
    ok.push({ lat, lon, rot, row, cell, ...sc });
  }
  // The best few, spread apart (at least ~2.5 km).
  ok.sort((p, q) => q.s - p.s);
  const pick = [];
  for (const t of ok) {
    if (pick.length >= want) break;
    if (pick.some((p) => Math.hypot((p.lat - t.lat) * 111, (p.lon - t.lon) * 89) < 2.5)) continue;
    pick.push(t);
  }
  pick.forEach((t, k) => {
    const id = `${u.key}-${k}`;
    const data = zlib.deflateRawSync(Buffer.from(t.cell), { level: 9 }).toString('base64');
    (byProv[u.prov] ??= []).push({ id, lat: +t.lat.toFixed(5), lon: +t.lon.toFixed(5), rot: t.rot, row: t.row, data });
    index.push({ id, name: u.name, prov: u.prov, water: t.water > 60 });
  });
  done++;
  console.log(`${done}/${all.length} ${PROVINCES[u.prov]} ${u.name}: ${pick.length}/${want} (of ${ok.length} usable, ${cands.length} tried)`);
}

const queue = all.filter((u) => !only || only.has(u.key));
const workers = Array.from({ length: 6 }, async () => { while (queue.length) await doUnit(queue.shift()); });
await Promise.all(workers);

fs.mkdirSync(OUT, { recursive: true });
index.sort((p, q) => p.id.localeCompare(q.id));
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ provinces: PROVINCES, tiles: index }));
for (const [prov, tiles] of Object.entries(byProv)) {
  tiles.sort((p, q) => p.id.localeCompare(q.id));
  fs.writeFileSync(path.join(OUT, `p${prov}.json`), JSON.stringify(tiles));
}
console.log('tiles', index.length, 'units', new Set(index.map((t) => t.id.split('-')[0])).size, 'of', all.length);
