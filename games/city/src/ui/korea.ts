import type { World } from '../sim/world';

/**
 * Real-Korea starting maps: a draw of three 1.28 km squares from different
 * 시/군, with one province or metropolitan city left out if the player wants,
 * and one redraw. The draw is remembered until a city is founded from it, so
 * reloading the page doesn't give a free redraw.
 */

export interface TileInfo { id: string; name: string; prov: string; water: boolean }
interface TileData { id: string; lat: number; lon: number; rot: number; row: number; data: string }
interface Index { provinces: Record<string, string>; tiles: TileInfo[] }

const indexFile = import.meta.glob('../data/korea/index.json', { import: 'default' });
const provFiles = import.meta.glob('../data/korea/p*.json', { import: 'default' });

let index: Promise<Index> | null = null;
export function loadIndex(): Promise<Index> {
  index ??= (Object.values(indexFile)[0]?.() as Promise<Index>) ?? Promise.resolve({ provinces: {}, tiles: [] });
  return index;
}

const provCache = new Map<string, Promise<TileData[]>>();
function loadProvince(prov: string): Promise<TileData[]> {
  if (!provCache.has(prov)) {
    const f = provFiles[`../data/korea/p${prov}.json`];
    provCache.set(prov, f ? (f() as Promise<TileData[]>) : Promise.resolve([]));
  }
  return provCache.get(prov)!;
}

async function inflate(b64: string): Promise<Uint8Array> {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const stream = new Blob([u]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Everything createRealWorld needs for one tile. */
export async function loadTile(info: TileInfo): Promise<NonNullable<World['real']>> {
  const tiles = await loadProvince(info.prov);
  const t = tiles.find((x) => x.id === info.id);
  if (!t) throw new Error(`지도 조각을 찾지 못했어요: ${info.id}`);
  const idx = await loadIndex();
  return { cells: await inflate(t.data), row: t.row, id: t.id, name: info.name, prov: idx.provinces[info.prov] ?? '', lat: t.lat, lon: t.lon };
}

/* ------------------------------------------------------------- the draw */

export interface Draw { exclude: string; picks: string[]; rerolled: boolean }
const KEY = 'city.koreaDraw';

export function savedDraw(): Draw | null {
  try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
export function storeDraw(d: Draw | null) {
  try { if (d) localStorage.setItem(KEY, JSON.stringify(d)); else localStorage.removeItem(KEY); } catch { /* storage blocked */ }
}

/** Three tiles from three different 시/군, none in the excluded province; `avoid` keeps a redraw from repeating places. */
export function drawTiles(idx: Index, exclude: string, avoid: string[] = []): string[] {
  const unitOf = (id: string) => id.split('-')[0];
  const skipUnits = new Set(avoid.map(unitOf));
  const units = new Map<string, TileInfo[]>();
  for (const t of idx.tiles) {
    if (t.prov === exclude || skipUnits.has(unitOf(t.id))) continue;
    const u = unitOf(t.id);
    if (!units.has(u)) units.set(u, []);
    units.get(u)!.push(t);
  }
  // Every 시/군 equally likely, then one of its squares.
  const keys = [...units.keys()];
  const out: string[] = [];
  while (out.length < 3 && keys.length) {
    const k = keys.splice(Math.floor(Math.random() * keys.length), 1)[0];
    const list = units.get(k)!;
    out.push(list[Math.floor(Math.random() * list.length)].id);
  }
  return out;
}

/** A small top-down picture of a tile: water, woods, open land and hills. */
export async function drawPreview(canvas: HTMLCanvasElement, info: TileInfo) {
  const { cells, row } = await loadTile(info);
  const N = 128;
  canvas.width = canvas.height = N;
  const g = canvas.getContext('2d')!;
  const img = g.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const v = cells[i];
    const c = v === 2 ? [86, 150, 204] : v === 1 ? [120, 168, 104] : v === 0 ? [196, 214, 150] : (() => { const k = Math.min(1, (v - 3) / 90); return [150 - k * 40, 140 - k * 30, 108 - k * 20]; })();
    img.data.set([c[0], c[1], c[2], 255], i * 4);
  }
  g.putImageData(img, 0, 0);
  // The expressway link the city starts from.
  g.fillStyle = '#2b2d31';
  g.fillRect(0, row - 0.5, 23, 1.6);
}
