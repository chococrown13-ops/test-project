/**
 * 세계 구성. 국가는 모두 실재하지만 리그 명칭·구단·선수는 전부 가상입니다.
 *
 * `reputation` 은 리그의 수준을 나타내는 1-100 값으로, 구단 명성 분포와 선수
 * 능력치 분포, 주급/이적료 규모를 한꺼번에 결정합니다. 이 값 하나만 바꿔도
 * 리그 전체의 체급이 움직입니다.
 */

import type { NamePoolId } from './names';

export type ContinentId = 'eur' | 'sam' | 'asi' | 'nam' | 'afr';

export interface Continent {
  id: ContinentId;
  name: string;
  /** 대륙 클럽 대항전 이름. */
  cupName: string;
  cupShort: string;
  /** 대회 본선 진출 구단 수. 2의 거듭제곱이어야 토너먼트가 깔끔하게 떨어집니다. */
  cupSize: number;
  color: string;
}

export const CONTINENTS: Record<ContinentId, Continent> = {
  eur: { id: 'eur', name: '유럽', cupName: '유러피언 클럽컵', cupShort: 'ECC', cupSize: 32, color: '#3b82f6' },
  sam: { id: 'sam', name: '남미', cupName: '코파 수다메리카나컵', cupShort: 'CSC', cupSize: 16, color: '#22c55e' },
  asi: { id: 'asi', name: '아시아', cupName: '아시안 클럽컵', cupShort: 'ACC', cupSize: 16, color: '#ef4444' },
  nam: { id: 'nam', name: '북중미', cupName: '북중미 클럽컵', cupShort: 'NCC', cupSize: 8, color: '#f59e0b' },
  afr: { id: 'afr', name: '아프리카', cupName: '아프리칸 클럽컵', cupShort: 'AFC', cupSize: 8, color: '#a855f7' },
};

export const CONTINENT_ORDER: ContinentId[] = ['eur', 'sam', 'asi', 'nam', 'afr'];

export interface CountryDef {
  id: string;
  /** 한국어 국가명. */
  name: string;
  /** 3글자 코드. 선수 국적 배지에 씁니다. */
  code: string;
  continent: ContinentId;
  /** 리그 이름 앞머리. `잉글랜드` → `잉글랜드 2부`. */
  leagueLabel: string;
  /** 각 부의 구단 수. 모든 부가 같은 규모로 돌아갑니다. */
  clubCount: number;
  /** 1-100. 리그 수준. */
  reputation: number;
  /** 주급·이적료 배율. 명성과 별개로 돈이 도는 정도. */
  wageFactor: number;
  namePool: NamePoolId;
  /** 대륙 클럽 대항전 출전권 수. */
  continentalSlots: number;
  /** 새 게임에서 기본으로 켜져 있는지. */
  defaultOn: boolean;
  color: string;
}

export const COUNTRIES: CountryDef[] = [
  // ── 유럽 ─────────────────────────────────────────────────────────────
  { id: 'eng', name: '잉글랜드', code: 'ENG', continent: 'eur', leagueLabel: '잉글랜드', clubCount: 20, reputation: 95, wageFactor: 1.55, namePool: 'britain', continentalSlots: 4, defaultOn: true, color: '#c8102e' },
  { id: 'esp', name: '스페인', code: 'ESP', continent: 'eur', leagueLabel: '스페인', clubCount: 20, reputation: 92, wageFactor: 1.30, namePool: 'iberia', continentalSlots: 4, defaultOn: true, color: '#aa151b' },
  { id: 'ita', name: '이탈리아', code: 'ITA', continent: 'eur', leagueLabel: '이탈리아', clubCount: 20, reputation: 89, wageFactor: 1.20, namePool: 'italy', continentalSlots: 4, defaultOn: true, color: '#008c45' },
  { id: 'ger', name: '독일', code: 'GER', continent: 'eur', leagueLabel: '독일', clubCount: 18, reputation: 89, wageFactor: 1.25, namePool: 'germanic', continentalSlots: 4, defaultOn: true, color: '#111827' },
  { id: 'fra', name: '프랑스', code: 'FRA', continent: 'eur', leagueLabel: '프랑스', clubCount: 18, reputation: 84, wageFactor: 1.10, namePool: 'france', continentalSlots: 3, defaultOn: true, color: '#0055a4' },
  { id: 'por', name: '포르투갈', code: 'POR', continent: 'eur', leagueLabel: '포르투갈', clubCount: 18, reputation: 76, wageFactor: 0.72, namePool: 'iberia', continentalSlots: 3, defaultOn: true, color: '#046a38' },
  { id: 'ned', name: '네덜란드', code: 'NED', continent: 'eur', leagueLabel: '네덜란드', clubCount: 18, reputation: 74, wageFactor: 0.70, namePool: 'lowlands', continentalSlots: 2, defaultOn: true, color: '#ff6b00' },
  { id: 'tur', name: '튀르키예', code: 'TUR', continent: 'eur', leagueLabel: '튀르키예', clubCount: 20, reputation: 70, wageFactor: 0.78, namePool: 'turkey', continentalSlots: 2, defaultOn: true, color: '#e30a17' },
  { id: 'bel', name: '벨기에', code: 'BEL', continent: 'eur', leagueLabel: '벨기에', clubCount: 16, reputation: 68, wageFactor: 0.62, namePool: 'lowlands', continentalSlots: 2, defaultOn: false, color: '#fdda24' },
  { id: 'ukr', name: '우크라이나', code: 'UKR', continent: 'eur', leagueLabel: '우크라이나', clubCount: 16, reputation: 64, wageFactor: 0.52, namePool: 'slavic', continentalSlots: 2, defaultOn: false, color: '#0057b7' },
  { id: 'gre', name: '그리스', code: 'GRE', continent: 'eur', leagueLabel: '그리스', clubCount: 14, reputation: 63, wageFactor: 0.55, namePool: 'greece', continentalSlots: 2, defaultOn: false, color: '#0d5eaf' },
  { id: 'den', name: '덴마크', code: 'DEN', continent: 'eur', leagueLabel: '덴마크', clubCount: 12, reputation: 63, wageFactor: 0.56, namePool: 'nordic', continentalSlots: 1, defaultOn: false, color: '#c8102e' },
  { id: 'sco', name: '스코틀랜드', code: 'SCO', continent: 'eur', leagueLabel: '스코틀랜드', clubCount: 12, reputation: 62, wageFactor: 0.58, namePool: 'britain', continentalSlots: 1, defaultOn: false, color: '#005eb8' },
  { id: 'aut', name: '오스트리아', code: 'AUT', continent: 'eur', leagueLabel: '오스트리아', clubCount: 12, reputation: 62, wageFactor: 0.54, namePool: 'germanic', continentalSlots: 1, defaultOn: false, color: '#ed2939' },

  // ── 남미 ─────────────────────────────────────────────────────────────
  { id: 'bra', name: '브라질', code: 'BRA', continent: 'sam', leagueLabel: '브라질', clubCount: 20, reputation: 82, wageFactor: 0.68, namePool: 'brazil', continentalSlots: 5, defaultOn: true, color: '#009c3b' },
  { id: 'arg', name: '아르헨티나', code: 'ARG', continent: 'sam', leagueLabel: '아르헨티나', clubCount: 20, reputation: 78, wageFactor: 0.52, namePool: 'hispanic', continentalSlots: 5, defaultOn: true, color: '#75aadb' },
  { id: 'col', name: '콜롬비아', code: 'COL', continent: 'sam', leagueLabel: '콜롬비아', clubCount: 20, reputation: 68, wageFactor: 0.38, namePool: 'hispanic', continentalSlots: 3, defaultOn: true, color: '#fcd116' },

  // ── 아시아 ───────────────────────────────────────────────────────────
  { id: 'sau', name: '사우디아라비아', code: 'KSA', continent: 'asi', leagueLabel: '사우디', clubCount: 18, reputation: 70, wageFactor: 1.45, namePool: 'arab', continentalSlots: 4, defaultOn: true, color: '#006c35' },
  { id: 'jpn', name: '일본', code: 'JPN', continent: 'asi', leagueLabel: '일본', clubCount: 20, reputation: 66, wageFactor: 0.60, namePool: 'japan', continentalSlots: 4, defaultOn: true, color: '#bc002d' },
  { id: 'kor', name: '대한민국', code: 'KOR', continent: 'asi', leagueLabel: '한국', clubCount: 12, reputation: 64, wageFactor: 0.55, namePool: 'korea', continentalSlots: 4, defaultOn: true, color: '#0047a0' },

  // ── 북중미 ───────────────────────────────────────────────────────────
  { id: 'mex', name: '멕시코', code: 'MEX', continent: 'nam', leagueLabel: '멕시코', clubCount: 18, reputation: 68, wageFactor: 0.72, namePool: 'hispanic', continentalSlots: 4, defaultOn: false, color: '#006847' },
  { id: 'usa', name: '미국', code: 'USA', continent: 'nam', leagueLabel: '미국', clubCount: 20, reputation: 64, wageFactor: 0.85, namePool: 'usa', continentalSlots: 4, defaultOn: true, color: '#3c3b6e' },

  // ── 아프리카 ─────────────────────────────────────────────────────────
  { id: 'mar', name: '모로코', code: 'MAR', continent: 'afr', leagueLabel: '모로코', clubCount: 16, reputation: 62, wageFactor: 0.34, namePool: 'maghreb', continentalSlots: 4, defaultOn: false, color: '#c1272d' },
  { id: 'egy', name: '이집트', code: 'EGY', continent: 'afr', leagueLabel: '이집트', clubCount: 18, reputation: 60, wageFactor: 0.32, namePool: 'arab', continentalSlots: 4, defaultOn: true, color: '#c09300' },
];

export const COUNTRY_BY_ID: Record<string, CountryDef> = Object.fromEntries(
  COUNTRIES.map((c) => [c.id, c]),
);

/** 기본 선택 국가 — 5개 대륙이 모두 채워지는 최소 구성. */
export const DEFAULT_COUNTRY_IDS = COUNTRIES.filter((c) => c.defaultOn).map((c) => c.id);

/**
 * 국가 선택이 유효한지 검사합니다. 대륙 대항전이 성립하려면 한 대륙에 최소
 * 두 나라가 있어야 하지만, 한 나라만 켜도 게임 자체는 돌아가야 하므로
 * 여기서는 "리그가 하나라도 있는가"만 강제합니다.
 */
export function activeContinents(countryIds: readonly string[]): ContinentId[] {
  const seen = new Set<ContinentId>();
  for (const id of countryIds) {
    const country = COUNTRY_BY_ID[id];
    if (country) seen.add(country.continent);
  }
  return CONTINENT_ORDER.filter((c) => seen.has(c));
}


// ── 리그 계층 ───────────────────────────────────────────────────────────

/**
 * 본거지로 고른 나라만 하부 리그까지 열립니다. 나머지 나라는 1부만 돌아갑니다.
 *
 * 에이전트는 밑바닥에서 시작합니다. 4부의 무명 선수를 발굴해 위로 올려 보내며
 * 이름을 알리는 것이 이 게임의 초반이고, 그러려면 올라갈 사다리가 있어야 합니다.
 */
export const HOME_TIERS = 4;

/** 부 단위 승격·강등 인원. */
export const PROMOTION_SLOTS = 3;

/** `eng` / `eng:2` / `eng:3`. 1부는 국가 id 그대로라 기존 세이브와 어긋나지 않습니다. */
export const leagueKey = (countryId: string, tier: number): string =>
  (tier <= 1 ? countryId : `${countryId}:${tier}`);

export const competitionKey = (countryId: string, tier: number): string =>
  `lg:${leagueKey(countryId, tier)}`;

export const leagueName = (country: CountryDef, tier: number): string =>
  `${country.leagueLabel} ${tier}부`;

/**
 * 부별 리그 수준. 1부에서 한 단계 내려갈 때마다 체급이 뚝 떨어집니다.
 * 이 값이 선수 능력치, 주급, 그리고 스카우팅 해금 조건을 함께 정합니다.
 */
export function tierReputation(country: CountryDef, tier: number): number {
  const step = 12 + country.reputation * 0.09;
  return Math.max(8, Math.round(country.reputation - (tier - 1) * step));
}

/** 부별 임금 규모. 하부로 갈수록 도는 돈이 확 줄어듭니다. */
const WAGE_BY_TIER = [1, 0.5, 0.25, 0.12];

export function tierWageFactor(country: CountryDef, tier: number): number {
  return country.wageFactor * (WAGE_BY_TIER[tier - 1] ?? 0.1);
}

/**
 * 부에 맞춰 조정한 국가 정보.
 *
 * 선수 생성·주급·재정은 모두 CountryDef 의 `reputation` 과 `wageFactor` 를 보고
 * 돌아갑니다. 그 두 값만 부 기준으로 바꾼 사본을 넘기면 하부 리그가 저절로
 * 하부 리그답게 굴러갑니다 — 함수마다 tier 를 들고 다닐 필요가 없습니다.
 *
 * **구단을 다룰 때 `COUNTRY_BY_ID[club.countryId]` 를 직접 쓰면 안 됩니다.**
 * 그러면 4부 구단이 1부 임금으로 1부급 유망주를 배출합니다.
 */
export function tierCountry(country: CountryDef, tier: number): CountryDef {
  if (tier <= 1) return country;
  return {
    ...country,
    reputation: tierReputation(country, tier),
    wageFactor: tierWageFactor(country, tier),
  };
}

/** 구단이 속한 부까지 반영한 국가 정보. */
export function countryOfClub(club: { countryId: string; tier: number }): CountryDef | undefined {
  const country = COUNTRY_BY_ID[club.countryId];
  return country && tierCountry(country, club.tier);
}

/**
 * 이 리그를 훑어보려면 필요한 에이전트 평판.
 *
 * 시작 평판(12)으로는 본거지의 3·4부만 보입니다. 1부 선수는 이름값이 어느 정도
 * 쌓여야 명단에 뜹니다 — 무명 에이전트의 전화를 받아 줄 구단이 없기 때문입니다.
 */
export function requiredReputation(prestige: number): number {
  return Math.max(0, Math.min(88, Math.round((prestige - 45) * 1.3)));
}
