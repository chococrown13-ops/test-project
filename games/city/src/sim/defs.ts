/**
 * Static game data: map size, zones, building types, facilities and prices.
 * Money is in 만원 (10,000 won). One cell is 10 m.
 */

export const N = 128;
export const CELL = 10;

// Plain objects rather than enums so every file compiles on its own (Vite/esbuild).
export const Zone = { None: 0, R: 1, C: 2, I: 3 } as const;
export type Zone = (typeof Zone)[keyof typeof Zone];
export const Road = { None: 0, Street: 1, Avenue: 2 } as const;
export type Road = (typeof Road)[keyof typeof Road];
export const Ground = { Land: 0, Water: 1 } as const;
export type Ground = (typeof Ground)[keyof typeof Ground];

export type BuildingKind =
  | 'r1' | 'r2' | 'r3'
  | 'c1' | 'c2' | 'c3'
  | 'i1' | 'i2' | 'i3'
  | 'coal' | 'solar' | 'water' | 'sewage' | 'park' | 'school' | 'police' | 'fire' | 'clinic' | 'metro';

export interface KindDef {
  name: string;
  zone?: Zone;
  level?: number;
  size: number; // footprint in cells (square)
  residents?: number;
  jobs?: number;
  power: number; // demand (+) or supply (-), in MW-ish units
  water: number; // demand (+) or supply (-)
  cost?: number;
  upkeep?: number; // per month
  floors: [number, number];
  desc?: string;
}

export const KINDS: Record<BuildingKind, KindDef> = {
  r1: { name: '빌라', zone: Zone.R, level: 1, size: 1, residents: 12, power: 2, water: 2, floors: [3, 4] },
  r2: { name: '다세대 주택', zone: Zone.R, level: 2, size: 1, residents: 32, power: 5, water: 5, floors: [5, 6] },
  r3: { name: '아파트 단지', zone: Zone.R, level: 3, size: 2, residents: 420, power: 45, water: 50, floors: [15, 25] },
  c1: { name: '골목 상가', zone: Zone.C, level: 1, size: 1, jobs: 8, power: 3, water: 2, floors: [2, 3] },
  c2: { name: '근린생활 빌딩', zone: Zone.C, level: 2, size: 1, jobs: 30, power: 10, water: 5, floors: [6, 8] },
  c3: { name: '오피스 타워', zone: Zone.C, level: 3, size: 2, jobs: 320, power: 70, water: 35, floors: [18, 34] },
  i1: { name: '소규모 공장', zone: Zone.I, level: 1, size: 1, jobs: 18, power: 10, water: 6, floors: [1, 2] },
  i2: { name: '제조 공장', zone: Zone.I, level: 2, size: 1, jobs: 40, power: 22, water: 12, floors: [2, 3] },
  i3: { name: '첨단 산업단지', zone: Zone.I, level: 3, size: 2, jobs: 180, power: 60, water: 30, floors: [3, 5] },
  coal: { name: '화력 발전소', size: 3, power: -600, water: 20, cost: 9000, upkeep: 300, floors: [3, 3], desc: '전력 600 · 주변 땅값 하락' },
  solar: { name: '태양광 발전소', size: 2, power: -140, water: 0, cost: 3500, upkeep: 90, floors: [1, 1], desc: '전력 140 · 깨끗함' },
  water: { name: '정수장', size: 3, power: 25, water: -700, cost: 6000, upkeep: 260, floors: [2, 2], desc: '수도 700 · 강가에 지어야 함' },
  sewage: { name: '하수처리장', size: 2, power: 15, water: 0, cost: 4000, upkeep: 180, floors: [2, 2], desc: '하수 처리 600 · 주변 땅값 하락' },
  park: { name: '공원', size: 1, power: 0, water: 1, cost: 300, upkeep: 12, floors: [0, 0], desc: '주변 땅값 상승' },
  school: { name: '초등학교', size: 2, power: 8, water: 6, cost: 4500, upkeep: 220, floors: [3, 4], desc: '반경 내 교육 · 땅값 상승' },
  police: { name: '경찰서', size: 1, power: 4, water: 2, cost: 2500, upkeep: 150, floors: [3, 3], desc: '반경 내 치안' },
  fire: { name: '소방서', size: 1, power: 4, water: 3, cost: 2500, upkeep: 150, floors: [2, 2], desc: '반경 내 화재 안전' },
  clinic: { name: '보건소', size: 1, power: 5, water: 4, cost: 3000, upkeep: 170, floors: [3, 3], desc: '반경 내 건강' },
  // Built and paid for through its subway line (transit.ts).
  metro: { name: '지하철역', size: 1, power: 6, water: 2, floors: [1, 1], desc: '역 주변 땅값 상승 (역세권)' },
};

/** Coverage radius in cells for service buildings, and how much they add to land value nearby. */
export const SERVICE: Partial<Record<BuildingKind, { radius: number; key: 'edu' | 'safety' | 'fire' | 'health'; value: number }>> = {
  school: { radius: 12, key: 'edu', value: 12 },
  police: { radius: 14, key: 'safety', value: 6 },
  fire: { radius: 14, key: 'fire', value: 4 },
  clinic: { radius: 12, key: 'health', value: 6 },
};

export const SEWAGE_CAPACITY = 600;

export const ROAD_COST = { [Road.Street]: 40, [Road.Avenue]: 110 } as const;
export const ROAD_UPKEEP = { [Road.Street]: 0.4, [Road.Avenue]: 1 } as const;
export const BRIDGE_MULT = 4;
/** Vehicles a road cell carries comfortably. */
export const ROAD_CAPACITY = { [Road.Street]: 3, [Road.Avenue]: 7 } as const;
export const ROAD_SPEED = { [Road.Street]: 9, [Road.Avenue]: 15 } as const; // m/s

/** Cells from a road within which zoning is allowed. */
export const ZONE_DEPTH = 3;

export const START_MONEY = 50000;

export const ZONE_NAME = ['', '주거', '상업', '산업'] as const;
