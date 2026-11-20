import { N, Zone } from './defs';
import { findAccess, network } from './network';
import { isPocket, onRoad } from './pockets';
import type { World } from './world';

/**
 * Why a zone is not growing, in words a player can act on. The simulation
 * grows a zone only while it has demand and a free lot on a road, and the
 * city has the power and water for one more building; when any of those
 * fails, the green (or blue, or yellow) lots just sit there. This says which.
 */

const ZN: Record<number, string> = { [Zone.R]: '주거', [Zone.C]: '상업', [Zone.I]: '산업' };
const key = (z: number) => (z === Zone.R ? 'R' : z === Zone.C ? 'C' : 'I') as 'R' | 'C' | 'I';
const num = (n: number) => Math.round(n).toLocaleString('ko-KR');

/** Whether this lot's street runs out to the roads at the map's edge (where new people and firms arrive from). */
export function reachesEdge(w: World, i: number): boolean {
  const net = network(w);
  const a = findAccess(w, { x: i % N, y: (i / N) | 0, size: 1 });
  return a >= 0 && net.outside.has(net.comp[a]);
}

type Lots = Record<number, { n: number; at: number; cut: number; cutAt: number }>;

/** Empty lots of each zone that a building could take (on a road, not open backland), and one of them; and how many of those have a street that doesn't reach the edge. */
export function freeLots(w: World): Lots {
  const out: Lots = {};
  for (const z of [Zone.R, Zone.C, Zone.I]) out[z] = { n: 0, at: -1, cut: 0, cutAt: -1 };
  for (let i = 0; i < N * N; i++) {
    const z = w.zone[i];
    if (!z || w.road[i] || w.bld[i] >= 0 || isPocket(w, i) || !onRoad(w, i)) continue;
    const o = out[z];
    if (!reachesEdge(w, i)) { o.cut++; if (o.cutAt < 0) o.cutAt = i; continue; }
    o.n++;
    if (o.at < 0) o.at = i;
  }
  return out;
}

/** Why this one empty lot stays empty, if it's something about the lot itself. */
export function lotBlock(w: World, i: number): string | null {
  if (!onRoad(w, i)) return null; // backland: the pocket panel explains it
  if (!reachesEdge(w, i)) return '이 땅 앞 도로가 맵 가장자리 도로와 이어져 있지 않아요. 새로 오는 사람과 회사는 바깥에서 들어오니, 도로를 이어 주세요.';
  return null;
}

/** Why `zone` is not growing right now, or null when nothing holds it back. */
export function growthBlock(w: World, zone: number, lots?: Lots): string | null {
  const s = w.stats, d = w.demand[key(zone)];
  if (s.powerSupply === 0 || s.powerUse >= s.powerSupply * 0.98) return '전기가 모자라서 새 건물이 들어오지 못해요. 발전소를 더 지으세요.';
  if (s.waterSupply === 0 || s.waterUse >= s.waterSupply * 0.98) return '수돗물이 모자라서 새 건물이 들어오지 못해요. 정수장이나 지하수 관정을 더 지으세요.';
  if (d > 0) return (lots ?? freeLots(w))[zone].n ? null : `${ZN[zone]} 수요는 있는데 도로 옆에 비어 있는 ${ZN[zone]} 구역이 없어요. 도로 옆에 ${ZN[zone]} 구역을 더 칠하세요.`;
  const tax = w.tax[key(zone)];
  if (zone === Zone.R) {
    if (s.jobs < s.workers * 0.95) return `일자리가 모자라서 사람들이 이사 오지 않아요. 일할 사람 ${num(s.workers)}명에 일자리는 ${num(s.jobs)}개예요. 상업이나 산업 구역을 더 칠하세요.`;
    if (tax > 12) return `주거 세율(${tax}%)이 높아서 사람들이 오지 않아요. 예산 창에서 낮춰 보세요.`;
    return `살기 불편해서 사람들이 오지 않아요 (만족도 ${Math.round(s.happy)}%). 학교, 공원, 경찰서, 대중교통을 챙겨 보세요.`;
  }
  if (tax > 12) return `${ZN[zone]} 세율(${tax}%)이 높아서 들어오려는 곳이 없어요. 예산 창에서 낮춰 보세요.`;
  if (zone === Zone.C) return '가게를 찾을 주민이 모자라요. 주거 구역을 늘리면 상가도 따라와요.';
  return '공장에서 일할 사람이 모자라요. 주거 구역을 늘리면 공장도 따라와요.';
}

/**
 * Every month: when lots stand empty because a zone can't grow, say why once.
 * Returns the notices to post (text and an empty lot to show).
 */
export function stalledZones(w: World): { text: string; at: number }[] {
  const lots = freeLots(w), out: { text: string; at: number }[] = [];
  for (const z of [Zone.R, Zone.C, Zone.I]) {
    const why = growthBlock(w, z, lots);
    if (!why) continue;
    // Only worth a notice when the player is waiting on it: empty lots of that zone, or demand with none.
    const waiting = lots[z].n >= 12 || (w.demand[key(z)] > 30 && lots[z].n === 0);
    if (!waiting || why.startsWith('전기') || why.startsWith('수돗물')) continue; // power and water have their own warnings
    out.push({ text: `${ZN[z]} 구역이 자라지 않아요. ${why}`, at: lots[z].at });
  }
  // Lots on a street cut off from the edge never fill, whatever the demand.
  const cut = [Zone.R, Zone.C, Zone.I].reduce((s, z) => s + lots[z].cut, 0);
  if (cut >= 8) {
    const z = [Zone.R, Zone.C, Zone.I].find((k) => lots[k].cut > 0)!;
    out.push({ text: `구역 ${cut}칸이 맵 가장자리와 이어지지 않은 도로에 붙어 있어서 건물이 들어오지 않아요. 도로를 바깥과 이어 주세요.`, at: lots[z].cutAt });
  }
  return out;
}
