import { deflateSync, inflateSync, strFromU8, strToU8 } from 'three/examples/jsm/libs/fflate.module.js';
import { N } from './defs';
import { createWorld, type World } from './world';

const KEY = 'city.save.v1';
type Arrays = 'ground' | 'road' | 'roadAlt' | 'altLevel' | 'diag' | 'oneway' | 'parked' | 'parkPress' | 'trees' | 'zone' | 'bld' | 'land' | 'traffic' | 'pollution' | 'edu' | 'safety' | 'fire' | 'health' | 'transit';
const ARRAYS: Arrays[] = ['ground', 'road', 'roadAlt', 'altLevel', 'diag', 'oneway', 'parked', 'parkPress', 'trees', 'zone', 'bld', 'land', 'traffic', 'pollution', 'edu', 'safety', 'fire', 'health', 'transit'];

function b64(a: ArrayBufferView): string {
  const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64<T extends ArrayBufferView>(s: string, make: (buf: ArrayBuffer) => T): T {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return make(u.buffer);
}

export function serialize(w: World): string {
  const o: Record<string, unknown> = { ...w, buildings: [...w.buildings.values()] };
  for (const k of ARRAYS) o[k] = b64(w[k]);
  delete o.civic;
  if (w.real) o.real = { ...w.real, cells: b64(w.real.cells) };
  return JSON.stringify(o);
}

export function deserialize(json: string): World {
  const o = JSON.parse(json);
  const w = createWorld(o.seed, o.name, o.map ?? 'river');
  Object.assign(w, o);
  w.ground = unb64(o.ground, (b) => new Uint8Array(b));
  w.road = unb64(o.road, (b) => new Uint8Array(b));
  w.zone = unb64(o.zone, (b) => new Uint8Array(b));
  // Saves from before layered and diagonal roads have none of either.
  for (const k of ['roadAlt', 'altLevel', 'diag', 'oneway', 'parked', 'parkPress', 'trees'] as const) w[k] = o[k] ? unb64(o[k], (b) => new Uint8Array(b)) : new Uint8Array(w.ground.length);
  w.bld = unb64(o.bld, (b) => new Int32Array(b));
  for (const k of ['land', 'traffic', 'pollution'] as const) w[k] = unb64(o[k], (b) => new Float32Array(b));
  for (const k of ['edu', 'safety', 'fire', 'health', 'transit'] as const) w[k] = o[k] ? unb64(o[k], (b) => new Uint8Array(b)) : new Uint8Array(w.ground.length);
  w.lines ??= [];
  w.loans ??= [];
  w.curves ??= [];
  w.roundabouts ??= [];
  w.civic = new Uint8Array(w.ground.length);
  w.festival ??= null;
  w.bikeMonth ??= 0; w.bikeLast ??= 0; w.intercityMonth ??= 0; w.intercityLast ??= 0;
  w.map ??= 'river';
  if (o.real) w.real = { ...o.real, cells: unb64(o.real.cells, (b) => new Uint8Array(b)) };
  w.noAvenueParking ??= false;
  w.stats.parkDemand ??= 0;
  w.stats.parkUnmet ??= 0;
  w.stats.parkCurb ??= 0;
  w.month.income.T ??= 0;
  w.month.expense.transit ??= 0;
  w.nextLine ??= 1;
  w.transferDiscount ??= true;
  w.transfersMonth ??= 0;
  w.transfers ??= 0;
  w.buildings = new Map(o.buildings.map((b: { id: number }) => [b.id, b]));
  w.ver = { roads: w.ver.roads + 1, zones: w.ver.zones + 1, buildings: w.ver.buildings + 1, transit: (w.ver.transit ?? 0) + 1 };
  return w;
}

/** Saves are deflated (a 256 x 256 city is several MB of JSON, past what localStorage holds), marked with a leading 'Z'. */
export function pack(w: World): string {
  return 'Z' + b64(deflateSync(strToU8(serialize(w)), { level: 6 }));
}
export function unpack(s: string): World | null {
  const json = s.startsWith('Z') ? strFromU8(inflateSync(unb64(s.slice(1), (b) => new Uint8Array(b)))) : s;
  const w = deserialize(json);
  // A save from the smaller 128 x 128 map doesn't fit this one.
  return w.ground.length === N * N ? w : null;
}

/**
 * Several cities, each in its own slot: an index of what's saved (name, size,
 * when) and one packed save per slot. The single save from before slots is
 * kept as the slot 'main'.
 */
export interface Slot { id: string; name: string; pop: number; day: number; money: number; at: number }
const INDEX = 'city.slots';
const slotKey = (id: string) => (id === 'main' ? KEY : `${KEY}:${id}`);

export function listSlots(): Slot[] {
  let list: Slot[] = [];
  try { list = JSON.parse(localStorage.getItem(INDEX) ?? '[]'); } catch { list = []; }
  try {
    // The old single save, from before slots.
    if (!list.some((x) => x.id === 'main') && localStorage.getItem(KEY)) list.push({ id: 'main', name: '저장된 도시', pop: 0, day: 0, money: 0, at: 0 });
  } catch { /* storage blocked */ }
  return list.sort((a, b) => b.at - a.at);
}
function writeIndex(list: Slot[]) { try { localStorage.setItem(INDEX, JSON.stringify(list)); } catch { /* storage blocked */ } }

/** Save a city into its slot (a new slot the first time). False if the browser has no room. */
export function saveLocal(w: World): boolean {
  w.slot ??= `c${Date.now().toString(36)}`;
  try {
    localStorage.setItem(slotKey(w.slot), pack(w));
    const list = listSlots().filter((x) => x.id !== w.slot);
    list.push({ id: w.slot, name: w.name, pop: w.stats.pop, day: w.day, money: Math.round(w.money), at: Date.now() });
    writeIndex(list);
    return true;
  } catch { return false; }
}
/** A saved city: the one asked for, or the most recently saved. */
export function loadLocal(id?: string): World | null {
  const slot = id ?? listSlots()[0]?.id;
  if (!slot) return null;
  try {
    const s = localStorage.getItem(slotKey(slot));
    const w = s ? unpack(s) : null;
    if (w) w.slot = slot;
    return w;
  } catch { return null; }
}
export function deleteSlot(id: string) {
  try { localStorage.removeItem(slotKey(id)); } catch { /* ignore */ }
  writeIndex(listSlots().filter((x) => x.id !== id));
}
export function clearLocal() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
