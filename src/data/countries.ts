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
  /** 1부 리그 명칭. 게임 안에서 변경할 수 있습니다. */
  leagueName: string;
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
  { id: 'eng', name: '잉글랜드', code: 'ENG', continent: 'eur', leagueName: '잉글랜드 1부', clubCount: 20, reputation: 95, wageFactor: 1.55, namePool: 'britain', continentalSlots: 4, defaultOn: true, color: '#c8102e' },
  { id: 'esp', name: '스페인', code: 'ESP', continent: 'eur', leagueName: '스페인 1부', clubCount: 20, reputation: 92, wageFactor: 1.30, namePool: 'iberia', continentalSlots: 4, defaultOn: true, color: '#aa151b' },
  { id: 'ita', name: '이탈리아', code: 'ITA', continent: 'eur', leagueName: '이탈리아 1부', clubCount: 20, reputation: 89, wageFactor: 1.20, namePool: 'italy', continentalSlots: 4, defaultOn: true, color: '#008c45' },
  { id: 'ger', name: '독일', code: 'GER', continent: 'eur', leagueName: '독일 1부', clubCount: 18, reputation: 89, wageFactor: 1.25, namePool: 'germanic', continentalSlots: 4, defaultOn: true, color: '#111827' },
  { id: 'fra', name: '프랑스', code: 'FRA', continent: 'eur', leagueName: '프랑스 1부', clubCount: 18, reputation: 84, wageFactor: 1.10, namePool: 'france', continentalSlots: 3, defaultOn: true, color: '#0055a4' },
  { id: 'por', name: '포르투갈', code: 'POR', continent: 'eur', leagueName: '포르투갈 1부', clubCount: 18, reputation: 76, wageFactor: 0.72, namePool: 'iberia', continentalSlots: 3, defaultOn: true, color: '#046a38' },
  { id: 'ned', name: '네덜란드', code: 'NED', continent: 'eur', leagueName: '네덜란드 1부', clubCount: 18, reputation: 74, wageFactor: 0.70, namePool: 'lowlands', continentalSlots: 2, defaultOn: true, color: '#ff6b00' },
  { id: 'tur', name: '튀르키예', code: 'TUR', continent: 'eur', leagueName: '튀르키예 1부', clubCount: 20, reputation: 70, wageFactor: 0.78, namePool: 'turkey', continentalSlots: 2, defaultOn: true, color: '#e30a17' },
  { id: 'bel', name: '벨기에', code: 'BEL', continent: 'eur', leagueName: '벨기에 1부', clubCount: 16, reputation: 68, wageFactor: 0.62, namePool: 'lowlands', continentalSlots: 2, defaultOn: false, color: '#fdda24' },
  { id: 'ukr', name: '우크라이나', code: 'UKR', continent: 'eur', leagueName: '우크라이나 1부', clubCount: 16, reputation: 64, wageFactor: 0.52, namePool: 'slavic', continentalSlots: 2, defaultOn: false, color: '#0057b7' },
  { id: 'gre', name: '그리스', code: 'GRE', continent: 'eur', leagueName: '그리스 1부', clubCount: 14, reputation: 63, wageFactor: 0.55, namePool: 'greece', continentalSlots: 2, defaultOn: false, color: '#0d5eaf' },
  { id: 'den', name: '덴마크', code: 'DEN', continent: 'eur', leagueName: '덴마크 1부', clubCount: 12, reputation: 63, wageFactor: 0.56, namePool: 'nordic', continentalSlots: 1, defaultOn: false, color: '#c8102e' },
  { id: 'sco', name: '스코틀랜드', code: 'SCO', continent: 'eur', leagueName: '스코틀랜드 1부', clubCount: 12, reputation: 62, wageFactor: 0.58, namePool: 'britain', continentalSlots: 1, defaultOn: false, color: '#005eb8' },
  { id: 'aut', name: '오스트리아', code: 'AUT', continent: 'eur', leagueName: '오스트리아 1부', clubCount: 12, reputation: 62, wageFactor: 0.54, namePool: 'germanic', continentalSlots: 1, defaultOn: false, color: '#ed2939' },

  // ── 남미 ─────────────────────────────────────────────────────────────
  { id: 'bra', name: '브라질', code: 'BRA', continent: 'sam', leagueName: '브라질 1부', clubCount: 20, reputation: 82, wageFactor: 0.68, namePool: 'brazil', continentalSlots: 5, defaultOn: true, color: '#009c3b' },
  { id: 'arg', name: '아르헨티나', code: 'ARG', continent: 'sam', leagueName: '아르헨티나 1부', clubCount: 20, reputation: 78, wageFactor: 0.52, namePool: 'hispanic', continentalSlots: 5, defaultOn: true, color: '#75aadb' },
  { id: 'col', name: '콜롬비아', code: 'COL', continent: 'sam', leagueName: '콜롬비아 1부', clubCount: 20, reputation: 68, wageFactor: 0.38, namePool: 'hispanic', continentalSlots: 3, defaultOn: true, color: '#fcd116' },

  // ── 아시아 ───────────────────────────────────────────────────────────
  { id: 'sau', name: '사우디아라비아', code: 'KSA', continent: 'asi', leagueName: '사우디 1부', clubCount: 18, reputation: 70, wageFactor: 1.45, namePool: 'arab', continentalSlots: 4, defaultOn: true, color: '#006c35' },
  { id: 'jpn', name: '일본', code: 'JPN', continent: 'asi', leagueName: '일본 1부', clubCount: 20, reputation: 66, wageFactor: 0.60, namePool: 'japan', continentalSlots: 4, defaultOn: true, color: '#bc002d' },
  { id: 'kor', name: '대한민국', code: 'KOR', continent: 'asi', leagueName: '한국 1부', clubCount: 12, reputation: 64, wageFactor: 0.55, namePool: 'korea', continentalSlots: 4, defaultOn: true, color: '#0047a0' },

  // ── 북중미 ───────────────────────────────────────────────────────────
  { id: 'mex', name: '멕시코', code: 'MEX', continent: 'nam', leagueName: '멕시코 1부', clubCount: 18, reputation: 68, wageFactor: 0.72, namePool: 'hispanic', continentalSlots: 4, defaultOn: false, color: '#006847' },
  { id: 'usa', name: '미국', code: 'USA', continent: 'nam', leagueName: '미국 1부', clubCount: 20, reputation: 64, wageFactor: 0.85, namePool: 'usa', continentalSlots: 4, defaultOn: true, color: '#3c3b6e' },

  // ── 아프리카 ─────────────────────────────────────────────────────────
  { id: 'mar', name: '모로코', code: 'MAR', continent: 'afr', leagueName: '모로코 1부', clubCount: 16, reputation: 62, wageFactor: 0.34, namePool: 'maghreb', continentalSlots: 4, defaultOn: false, color: '#c1272d' },
  { id: 'egy', name: '이집트', code: 'EGY', continent: 'afr', leagueName: '이집트 1부', clubCount: 18, reputation: 60, wageFactor: 0.32, namePool: 'arab', continentalSlots: 4, defaultOn: true, color: '#c09300' },
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
