import { createWorld, type World } from './world';

const KEY = 'city.save.v1';
type Arrays = 'ground' | 'road' | 'zone' | 'bld' | 'land' | 'traffic' | 'pollution' | 'edu' | 'safety' | 'fire' | 'health';
const ARRAYS: Arrays[] = ['ground', 'road', 'zone', 'bld', 'land', 'traffic', 'pollution', 'edu', 'safety', 'fire', 'health'];

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
  return JSON.stringify(o);
}

export function deserialize(json: string): World {
  const o = JSON.parse(json);
  const w = createWorld(o.seed, o.name);
  Object.assign(w, o);
  w.ground = unb64(o.ground, (b) => new Uint8Array(b));
  w.road = unb64(o.road, (b) => new Uint8Array(b));
  w.zone = unb64(o.zone, (b) => new Uint8Array(b));
  w.bld = unb64(o.bld, (b) => new Int32Array(b));
  for (const k of ['land', 'traffic', 'pollution'] as const) w[k] = unb64(o[k], (b) => new Float32Array(b));
  for (const k of ['edu', 'safety', 'fire', 'health'] as const) w[k] = unb64(o[k], (b) => new Uint8Array(b));
  w.buildings = new Map(o.buildings.map((b: { id: number }) => [b.id, b]));
  w.ver = { roads: w.ver.roads + 1, zones: w.ver.zones + 1, buildings: w.ver.buildings + 1 };
  return w;
}

export function saveLocal(w: World): boolean {
  try { localStorage.setItem(KEY, serialize(w)); return true; } catch { return false; }
}
export function loadLocal(): World | null {
  try { const s = localStorage.getItem(KEY); return s ? deserialize(s) : null; } catch { return null; }
}
export function clearLocal() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
