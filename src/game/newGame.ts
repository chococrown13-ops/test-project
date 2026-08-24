/** 새 게임 상태 조립. */

import { buildWorld } from './world';
import { DEFAULT_COUNTRY_IDS, COUNTRY_BY_ID } from '../data/countries';
import type { GameState } from './types';

export interface NewGameOptions {
  seed?: number;
  countryIds?: string[];
  agentName?: string;
  agencyName?: string;
  season?: number;
  /** 실제 구단명 대신 가상 구단명을 씁니다. */
  fictionalClubs?: boolean;
}

/** 라이선스 등급별 정원. 평판이 오르면 등급이 올라갑니다. */
export const LICENCE_LIMITS = [
  { licence: 1, clients: 4, negotiations: 2, reputation: 0, label: '지역 대리인' },
  { licence: 2, clients: 8, negotiations: 3, reputation: 30, label: '공인 에이전트' },
  { licence: 3, clients: 14, negotiations: 4, reputation: 50, label: '국제 에이전트' },
  { licence: 4, clients: 22, negotiations: 6, reputation: 70, label: '슈퍼 에이전트' },
  { licence: 5, clients: 32, negotiations: 8, reputation: 88, label: '거물' },
];

export const licenceFor = (reputation: number) =>
  LICENCE_LIMITS.slice().reverse().find((tier) => reputation >= tier.reputation) ?? LICENCE_LIMITS[0];

export function createGame(options: NewGameOptions = {}): GameState {
  const seed = options.seed ?? Math.floor(Math.random() * 2 ** 31);
  const requested = options.countryIds?.filter((id) => COUNTRY_BY_ID[id]) ?? [];
  const countryIds = requested.length > 0 ? requested : DEFAULT_COUNTRY_IDS;
  const season = options.season ?? 2026;

  const world = buildWorld({ seed, countryIds, season, fictionalClubs: options.fictionalClubs });

  return {
    seed,
    season,
    week: 1,
    phase: 'preseason',
    countryIds,
    agent: {
      name: options.agentName?.trim() || '이수현',
      agencyName: options.agencyName?.trim() || '수현 스포츠 매니지먼트',
      cash: 650,
      reputation: 12,
      licence: 1,
      clubRelations: {},
      scoutPoints: 100,
      ledger: [],
      totals: { deals: 0, feeVolume: 0, commission: 0 },
    },
    clubs: world.clubs,
    players: world.players,
    competitions: world.competitions,
    leagues: world.leagues,
    cups: world.cups,
    clients: {},
    negotiations: [],
    scouting: { points: 100, regen: 12, shortlist: [], reports: {} },
    news: [],
    awards: [],
    history: [],
    lastWeekResults: [],
    renames: {},
  };
}
