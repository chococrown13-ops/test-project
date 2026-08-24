/**
 * 스카우팅.
 *
 * 세계에는 만 명이 넘는 선수가 있지만 처음에는 아무것도 보이지 않습니다.
 * 포인트를 써서 조건에 맞는 선수를 찾아내고, 같은 선수를 계속 지켜볼수록
 * 능력치가 정확하게 드러납니다. 파악이 덜 된 선수는 능력치가 범위로만
 * 보이기 때문에, 계약을 서두르면 헛다리를 짚게 됩니다.
 */

import { Rng, clamp } from './rng';
import { COUNTRY_BY_ID } from '../data/countries';
import type { PositionGroup } from './attributes';
import type { GameState, Player } from './types';

/** 한 번 훑는 데 드는 포인트. */
export const SWEEP_COST = 14;
/** 한 명을 집중해서 볼 때 드는 포인트. */
export const FOCUS_COST = 8;
/** 집중 관찰 한 번에 오르는 파악도. */
export const FOCUS_DEPTH = 26;

export interface ScoutFilters {
  /** 비우면 활성화된 모든 국가. */
  countryIds: string[];
  groups: PositionGroup[];
  minAge: number;
  maxAge: number;
  /** 무소속 선수만 볼지. */
  freeAgentsOnly: boolean;
  /** 이미 다른 에이전트가 있는 선수를 제외할지. */
  unrepresentedOnly: boolean;
}

export const DEFAULT_FILTERS: ScoutFilters = {
  countryIds: [],
  groups: ['GK', 'DF', 'MF', 'FW'],
  minAge: 16,
  maxAge: 34,
  freeAgentsOnly: false,
  unrepresentedOnly: true,
};

/** 파악도에 따른 능력치 표시 오차. 100이면 정확한 값이 보입니다. */
export function revealRange(value: number, depth: number): [number, number] {
  const slack = Math.round((1 - clamp(depth, 0, 100) / 100) * 6);
  if (slack === 0) return [value, value];
  return [Math.max(1, value - slack), Math.min(20, value + slack)];
}

/** 잠재력 표시 — 별 다섯 개 척도. 파악도가 낮으면 범위로 나옵니다. */
export function potentialStars(pa: number): number {
  return clamp(Math.round(((pa - 60) / 140) * 5 * 2) / 2, 0.5, 5);
}

export function potentialRange(player: Player, depth: number): [number, number] {
  const exact = potentialStars(player.pa);
  const slack = (1 - clamp(depth, 0, 100) / 100) * 2;
  return [
    Math.max(0.5, Math.round((exact - slack) * 2) / 2),
    Math.min(5, Math.round((exact + slack) * 2) / 2),
  ];
}

export function depthOf(state: GameState, playerId: string): number {
  return state.scouting.reports[playerId]?.depth ?? 0;
}

function bumpDepth(state: GameState, player: Player, amount: number): void {
  const current = depthOf(state, player.id);
  const depth = clamp(current + amount, 0, 100);
  state.scouting.reports[player.id] = { playerId: player.id, week: state.week, depth };
  player.scouted = depth;
}

function matches(state: GameState, player: Player, filters: ScoutFilters): boolean {
  if (player.retired) return false;
  if (player.age < filters.minAge || player.age > filters.maxAge) return false;
  if (!filters.groups.includes(player.group)) return false;
  if (filters.freeAgentsOnly && player.clubId) return false;
  if (filters.unrepresentedOnly && player.agentId) return false;
  if (player.agentId === 'you') return false;
  if (filters.countryIds.length > 0) {
    const clubCountry = player.clubId ? state.clubs[player.clubId]?.countryId : null;
    if (!clubCountry || !filters.countryIds.includes(clubCountry)) return false;
  } else if (player.clubId) {
    const clubCountry = state.clubs[player.clubId]?.countryId;
    if (!clubCountry || !state.countryIds.includes(clubCountry)) return false;
  }
  return true;
}

export interface SweepResult {
  found: string[];
  spent: number;
  message: string;
}

/**
 * 조건에 맞는 선수를 훑습니다. 에이전트 평판이 높을수록 좋은 선수가 걸립니다.
 * 이미 파악한 선수는 다시 나오지 않아 목록이 계속 새로워집니다.
 */
export function sweep(state: GameState, filters: ScoutFilters, rng: Rng): SweepResult {
  if (state.scouting.points < SWEEP_COST) {
    return { found: [], spent: 0, message: '스카우팅 포인트가 모자랍니다.' };
  }

  const pool: Array<{ player: Player; weight: number }> = [];
  for (const player of Object.values(state.players)) {
    if (!matches(state, player, filters)) continue;
    if (depthOf(state, player.id) >= 25) continue;

    // 평판이 낮으면 눈에 띄는 선수를 못 알아봅니다.
    const reach = 40 + state.agent.reputation * 1.5;
    if (player.ca > reach + 60) continue;

    const upside = clamp((player.pa - player.ca) / 60, 0, 1);
    const quality = clamp(player.ca / 160, 0.1, 1.2);
    const freeBonus = player.clubId ? 1 : 1.5;
    pool.push({ player, weight: (quality + upside * 1.4) * freeBonus });
  }

  if (pool.length === 0) {
    return { found: [], spent: 0, message: '조건에 맞는 새 선수를 찾지 못했습니다. 조건을 넓혀 보세요.' };
  }

  state.scouting.points -= SWEEP_COST;
  const picks = Math.min(pool.length, 5 + Math.floor(state.agent.reputation / 25));
  const found: string[] = [];
  const total = pool.reduce((sum, item) => sum + item.weight, 0);

  for (let i = 0; i < picks && pool.length > 0; i++) {
    let roll = rng.next() * total;
    let index = pool.length - 1;
    for (let j = 0; j < pool.length; j++) {
      roll -= pool[j].weight;
      if (roll <= 0) { index = j; break; }
    }
    const [entry] = pool.splice(index, 1);
    if (!entry) break;
    bumpDepth(state, entry.player, rng.int(18, 30));
    found.push(entry.player.id);
  }

  return {
    found,
    spent: SWEEP_COST,
    message: `${found.length}명을 새로 찾았습니다.`,
  };
}

/** 한 선수를 집중해서 봅니다. 파악도가 올라 능력치가 또렷해집니다. */
export function focus(state: GameState, playerId: string): { ok: boolean; message: string } {
  const player = state.players[playerId];
  if (!player) return { ok: false, message: '선수를 찾을 수 없습니다.' };
  if (state.scouting.points < FOCUS_COST) {
    return { ok: false, message: '스카우팅 포인트가 모자랍니다.' };
  }
  if (depthOf(state, playerId) >= 100) {
    return { ok: false, message: '이미 완전히 파악한 선수입니다.' };
  }
  state.scouting.points -= FOCUS_COST;
  bumpDepth(state, player, FOCUS_DEPTH);
  return { ok: true, message: `${player.name} 파악도 ${Math.round(depthOf(state, playerId))}%.` };
}

export function toggleShortlist(state: GameState, playerId: string): void {
  const list = state.scouting.shortlist;
  const index = list.indexOf(playerId);
  if (index >= 0) list.splice(index, 1);
  else list.unshift(playerId);
  if (list.length > 60) list.length = 60;
}

/** 매주 포인트가 회복됩니다. 평판이 높으면 조직이 커져 더 많이 회복합니다. */
export function replenishScoutPoints(state: GameState): void {
  const regen = state.scouting.regen + Math.floor(state.agent.reputation / 12);
  state.scouting.points = clamp(state.scouting.points + regen, 0, 140);
}

/** 선수가 뛰는 리그 이름 — 목록에 붙일 짧은 꼬리표. */
export function playerLeagueLabel(state: GameState, player: Player): string {
  if (!player.clubId) return '무소속';
  const club = state.clubs[player.clubId];
  if (!club) return '무소속';
  return COUNTRY_BY_ID[club.countryId]?.name ?? '';
}
