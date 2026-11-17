import { CARDS, drawOffer, threatened, WATCH } from './cards';
import { DEMAND, indicators, playDecade } from './decade';
import { generate } from './gen';
import { appointMayor, mayorById } from './mayors';
import { eraLine } from './text';
import { B, type Game, type Indicators, N, TURNS } from './world';

export function newGame(seed = (Math.random() * 2 ** 31) | 0): Game {
  const g = generate(seed);
  census(g);
  g.mayor = appointMayor(g);
  g.offer = drawOffer(g);
  return g;
}

/** Starting head-count (the decade loop keeps it after this). */
function census(g: Game) {
  const H: Record<number, number> = { [B.Giwa]: 6, [B.Slate]: 8, [B.Shop]: 5, [B.Market]: 2, [B.Place]: 2 };
  for (const d of g.districts) d.pop = 0;
  for (let i = 0; i < N * N; i++) if (g.district[i] >= 0) g.districts[g.district[i]].pop += Math.round((H[g.btype[i]] ?? 0) * 0.85);
}

/** All options on the table this decade: the drawn cards, then 지켜보기. */
export const options = (g: Game) => [...g.offer, WATCH];

export interface TurnResult { decision: string; by: string; changed: boolean; lines: string[]; lost: string[]; before: Indicators; after: Indicators; year: number }

/**
 * Take one option (index into `options(g)`), then let ten years pass.
 * `by` is who decided: '나' or an AI mayor's name.
 */
export function decide(g: Game, index: number, by: string, changed = false): TurnResult {
  const before = indicators(g);
  const o = options(g)[index];
  const c = CARDS[o.card];
  const lines: string[] = [];
  const lostBefore = g.lost.length;
  const title = c.title(g, o);
  g.money += c.money(g, o);
  c.apply(g, o, lines);
  const year = g.year;
  lines.unshift(eraLine(g, year));
  lines.push(...playDecade(g));
  g.year += 10;
  g.turn++;
  const lost = g.lost.slice(lostBefore).map((l) => g.places[l.place].name);
  const after = indicators(g);
  g.history.push({ year, decision: title, by, headlines: lines, lost, indicators: after });
  if (g.turn >= TURNS) { g.done = true; g.offer = []; }
  else { g.mayor = appointMayor(g); g.offer = drawOffer(g); }
  return { decision: title, by, changed, lines, lost, before, after, year };
}

/** Hand the decade to this decade's AI mayor. */
export function delegate(g: Game, choose: (g: Game) => { index: number; changed: boolean }): TurnResult {
  const m = mayorById(g.mayor.id);
  const { index, changed } = choose(g);
  return decide(g, index, m.name, changed);
}

export interface Ending { title: string; line: string; score: number; kept: number; lost: number; reused: number }

/** The verdict in 2070. A good 구 is good on all four counts, not great on one. */
export function ending(g: Game): Ending {
  const i = lifetime(g);
  const vals = [i.memory, i.vitality, i.residents, i.budget];
  const pen = vals.reduce((a, x) => a + Math.max(0, 30 - x) * 1.5, 0);
  const score = Math.round(vals.reduce((a, x) => a + x, 0) - pen);
  const kept = g.places.filter((p) => p.state === 'open').length;
  const reused = g.places.filter((p) => p.state === 'reused').length;
  const lost = g.places.filter((p) => p.state === 'lost').length;
  const names = ['memory', 'vitality', 'residents', 'budget'] as const;
  const lo = names.reduce((a, k) => (i[k] < i[a] ? k : a)), hi = names.reduce((a, k) => (i[k] > i[a] ? k : a));
  const LOW: Record<string, [string, string]> = {
    memory: ['기억을 잃은 반짝이는 도시', '높고 깨끗한 도시예요. 다만 옛 이야기를 아는 사람이 드물어요.'],
    vitality: ['조용히 저무는 구', '골목은 남았지만 빈집이 늘고 불 꺼진 창이 많아졌어요.'],
    residents: ['주인이 바뀐 동네', '건물은 남았지만 그 집에 살던 사람들은 떠났어요.'],
    budget: ['빚더미 위의 골목', '많은 걸 지켰지만 구청 금고가 바닥났어요.'],
  };
  const HIGH: Record<string, [string, string]> = {
    memory: ['골목이 살아 있는 구', '100년 된 가게 간판 아래로 아이들이 지나가요.'],
    vitality: ['늘 북적이는 구', '밤늦게까지 불이 켜진 동네예요. 옛 모습은 많이 바뀌었지만요.'],
    residents: ['이웃이 그대로인 구', '할머니가 살던 집에 손녀가 살아요. 이웃 얼굴이 다 익숙해요.'],
    budget: ['알뜰한 구', '구청 금고는 든든해요. 그 돈으로 무엇을 남겼는지는 또 다른 이야기죠.'],
  };
  let [title, line] = ['그럭저럭 이어진 구', '크게 잃지도, 크게 얻지도 않았어요. 어쩌면 대부분의 동네가 그렇죠.'];
  if (vals.every((x) => x >= 55)) [title, line] = ['100년이 살아 숨 쉬는 구', '오래된 것과 새것이 한 골목에 있어요. 다음 100년도 기대돼요.'];
  else if (i[lo] < 35) [title, line] = LOW[lo];
  else if (i[hi] >= 65) [title, line] = HIGH[hi];
  return { title, line, score, kept, lost, reused };
}

export { threatened, DEMAND };

/** The 100 years as lived, not just how they ended: half the final state, half the average decade. */
export function lifetime(g: Game): Indicators {
  const fin = indicators(g);
  const hs = g.history.map((h) => h.indicators);
  if (!hs.length) return fin;
  const avg = (k: keyof Indicators) => hs.reduce((a, h) => a + h[k], 0) / hs.length;
  const mix = (k: keyof Indicators) => Math.round(fin[k] * 0.5 + avg(k) * 0.5);
  return { memory: mix('memory'), vitality: mix('vitality'), residents: mix('residents'), budget: mix('budget') };
}

/* ---------- saving ---------- */

const KEY = 'keep.save.v1';
const b64 = (a: ArrayBufferView) => { const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s: string) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
const ARRAYS = { ground: Uint8Array, height: Float32Array, road: Uint8Array, district: Int8Array, btype: Uint8Array, built: Int16Array, floors: Uint8Array } as const;

export function serialize(g: Game): string {
  const o: Record<string, unknown> = { ...g };
  for (const k of Object.keys(ARRAYS)) o[k] = b64(g[k as keyof typeof ARRAYS]);
  return JSON.stringify(o);
}
export function deserialize(s: string): Game {
  const o = JSON.parse(s);
  for (const [k, T] of Object.entries(ARRAYS)) o[k] = new T(unb64(o[k]));
  return o as Game;
}
export function save(g: Game) { try { localStorage.setItem(KEY, serialize(g)); } catch { /* storage full or blocked: play on unsaved */ } }
export function load(): Game | null {
  try { const s = localStorage.getItem(KEY); return s ? deserialize(s) : null; } catch { return null; }
}
export function clearSave() { try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ } }
