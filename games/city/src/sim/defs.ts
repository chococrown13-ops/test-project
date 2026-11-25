/**
 * Static game data: map size, zones, building types, facilities and prices.
 * Money is in 만원 (10,000 won). One cell is 10 m.
 */

export const N = 256;
export const CELL = 10;

// Plain objects rather than enums so every file compiles on its own (Vite/esbuild).
export const Zone = { None: 0, R: 1, C: 2, I: 3 } as const;
export type Zone = (typeof Zone)[keyof typeof Zone];
export const Road = { None: 0, Street: 1, Avenue: 2 } as const;
export type Road = (typeof Road)[keyof typeof Road];
export const Ground = { Land: 0, Water: 1, Mountain: 2 } as const;
export type Ground = (typeof Ground)[keyof typeof Ground];
/** Where the second road in a cell runs: over the ground, in a shallow cut, or bored deep. */
export const Level = { None: 0, Elevated: 1, Underpass: 2, Tunnel: 3 } as const;
export type Level = (typeof Level)[keyof typeof Level];
export const LEVEL_NAME = ['', '고가도로', '지하차도', '터널'] as const;
/** Cost per cell relative to a ground avenue. */
export const LEVEL_COST = { [Level.Elevated]: 3, [Level.Underpass]: 4, [Level.Tunnel]: 6 } as const;
/** Deck height of an elevated road and depth of the ones below, in metres. */
export const ELEVATED_Y = 8;
export const UNDER_Y = -7;

export type BuildingKind =
  | 'r1' | 'r2' | 'r3'
  | 'c1' | 'c2' | 'c3'
  | 'i1' | 'i2' | 'i3'
  | 'coal' | 'solar' | 'water' | 'well' | 'sewage' | 'park' | 'school' | 'police' | 'fire' | 'clinic' | 'metro'
  | 'market' | 'riverpark' | 'palace' | 'tower'
  | 'parking' | 'parktower'
  | 'office' | 'post' | 'library' | 'terminal' | 'ktx' | 'bike' | 'trailhead' | 'jjim'
  | 'hospital' | 'medlab' | 'university' | 'techpark';

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
  r1: { name: '단독주택·작은 빌라', zone: Zone.R, level: 1, size: 1, residents: 12, power: 2, water: 2, floors: [2, 3] },
  r2: { name: '빌라·저층 아파트', zone: Zone.R, level: 2, size: 1, residents: 32, power: 5, water: 5, floors: [4, 6] },
  r3: { name: '고층 아파트·주상복합', zone: Zone.R, level: 3, size: 2, residents: 420, power: 45, water: 50, floors: [15, 30] },
  c1: { name: '골목 상가', zone: Zone.C, level: 1, size: 1, jobs: 8, power: 3, water: 2, floors: [1, 3] },
  c2: { name: '근린 상가 빌딩', zone: Zone.C, level: 2, size: 1, jobs: 30, power: 10, water: 5, floors: [5, 8] },
  c3: { name: '오피스 타워', zone: Zone.C, level: 3, size: 2, jobs: 320, power: 70, water: 35, floors: [18, 34] },
  i1: { name: '1차 산업 (농장)', zone: Zone.I, level: 1, size: 1, jobs: 14, power: 3, water: 8, floors: [1, 1] },
  i2: { name: '2차 산업 (공장)', zone: Zone.I, level: 2, size: 1, jobs: 40, power: 22, water: 12, floors: [2, 3] },
  i3: { name: '3차 산업 (지식·물류)', zone: Zone.I, level: 3, size: 2, jobs: 180, power: 60, water: 30, floors: [4, 10] },
  coal: { name: '화력 발전소', size: 3, power: -600, water: 20, cost: 9000, upkeep: 300, floors: [3, 3], desc: '전력 600 · 주변 땅값 하락' },
  solar: { name: '태양광 발전소', size: 2, power: -180, water: 0, cost: 3500, upkeep: 90, floors: [1, 1], desc: '전력 180 · 깨끗함' },
  water: { name: '정수장', size: 3, power: 25, water: -700, cost: 6000, upkeep: 260, floors: [2, 2], desc: '수도 700 · 강, 바다, 호수 같은 물가에 지어야 함' },
  well: { name: '지하수 관정', size: 2, power: 12, water: -330, cost: 2600, upkeep: 120, floors: [1, 1], desc: '수도 330 · 지하수를 퍼 올려요. 물가가 없는 땅의 수원' },
  sewage: { name: '하수처리장', size: 2, power: 15, water: 0, cost: 4000, upkeep: 180, floors: [2, 2], desc: '하수 처리 600 · 주변 땅값 하락' },
  park: { name: '공원', size: 1, power: 0, water: 1, cost: 300, upkeep: 12, floors: [0, 0], desc: '주변 땅값 상승' },
  school: { name: '초등학교', size: 2, power: 8, water: 6, cost: 4500, upkeep: 220, floors: [3, 4], desc: '반경 내 교육 · 땅값 상승' },
  police: { name: '경찰서', size: 1, power: 4, water: 2, cost: 2500, upkeep: 150, floors: [3, 3], desc: '반경 내 치안' },
  fire: { name: '소방서', size: 1, power: 4, water: 3, cost: 2500, upkeep: 150, floors: [2, 2], desc: '반경 내 화재 안전' },
  clinic: { name: '보건소', size: 1, power: 5, water: 4, cost: 3000, upkeep: 170, floors: [3, 3], desc: '반경 내 건강' },
  // Built and paid for through its subway line (transit.ts).
  metro: { name: '지하철역', size: 1, power: 6, water: 2, floors: [1, 1], desc: '역 주변 땅값 상승 (역세권)' },
  market: { name: '전통시장', size: 2, power: 6, water: 4, cost: 3500, upkeep: 110, floors: [1, 1], desc: '주변 상업과 땅값을 살려요' },
  riverpark: { name: '수변공원', size: 2, power: 1, water: 2, cost: 2500, upkeep: 60, floors: [0, 0], desc: '물가에만 지어요. 주변 땅값과 만족도가 크게 올라요' },
  palace: { name: '고궁', size: 3, power: 4, water: 4, cost: 20000, upkeep: 200, floors: [1, 1], desc: '도시에 하나뿐인 명소. 넓은 범위의 땅값이 올라요' },
  parking: { name: '공영주차장', size: 1, power: 0, water: 0, cost: 600, upkeep: 20, floors: [0, 0], desc: '차 40대 · 반경 5칸 건물의 주차난을 덜어요' },
  parktower: { name: '주차타워', size: 1, power: 4, water: 0, cost: 2800, upkeep: 70, floors: [5, 5], desc: '차 160대 · 좁은 땅에 많이 세워요' },
  office: { name: '행정복지센터', size: 1, power: 3, water: 2, cost: 1800, upkeep: 90, floors: [3, 3], desc: '반경 12칸 주민 만족도 상승 · 동네 민원 창구' },
  post: { name: '우체국', size: 1, power: 3, water: 1, cost: 1500, upkeep: 70, floors: [2, 2], desc: '반경 14칸 상가와 공장의 만족도 상승 · 택배와 우편' },
  library: { name: '공공도서관', size: 2, power: 5, water: 3, cost: 3500, upkeep: 130, floors: [3, 3], desc: '반경 8칸 교육 · 주변 땅값과 만족도 상승' },
  terminal: { name: '고속버스터미널', size: 3, power: 10, water: 6, cost: 12000, upkeep: 200, floors: [2, 2], desc: '대로에 붙여 지어요. 도시 밖으로 가는 사람 일부가 고속버스를 타고, 주변이 상권이 돼요' },
  ktx: { name: 'KTX역', size: 3, power: 20, water: 8, cost: 30000, upkeep: 350, floors: [2, 2], desc: '도시에 하나. 밖으로 가는 사람이 기차를 타고, 넓은 범위가 역세권 상권이 돼요' },
  bike: { name: '공공자전거 대여소', size: 1, power: 0, water: 0, cost: 300, upkeep: 15, floors: [0, 0], desc: '대여소 반경 5칸끼리 가까운 거리는 자전거로 다녀요' },
  trailhead: { name: '등산로 입구', size: 1, power: 1, water: 1, cost: 800, upkeep: 20, floors: [1, 1], desc: '산 바로 앞에만 지어요. 둘레길과 막걸리·파전집 · 관광 수입, 주변 만족도 상승' },
  jjim: { name: '찜질방·목욕탕', size: 2, power: 12, water: 15, cost: 4000, upkeep: 0, floors: [3, 3], desc: '관광 수입 · 주변 만족도 상승' },
  hospital: { name: '종합병원', size: 2, power: 20, water: 15, cost: 18000, upkeep: 380, floors: [7, 9], desc: '의료 특화 · 반경 22칸 건강, 땅값 상승' },
  medlab: { name: '바이오메디컬 연구소', size: 2, power: 25, water: 10, cost: 22000, upkeep: 300, floors: [4, 5], desc: '의료 특화 · 특화 단계를 올려요' },
  university: { name: '대학교', size: 3, power: 20, water: 15, cost: 28000, upkeep: 500, floors: [4, 6], desc: '기술 특화 · 반경 22칸 교육, 땅값 상승' },
  techpark: { name: '테크노밸리', size: 2, power: 40, water: 10, cost: 24000, upkeep: 320, floors: [10, 16], desc: '기술 특화 · 특화 단계를 올려요' },
  tower: { name: '전망타워', size: 1, power: 0, water: 0, cost: 15000, upkeep: 160, floors: [1, 1], desc: '산 위에만 지어요. 도시 어디서나 보이는 명소예요' },
};

/** Coverage radius in cells for service buildings, and how much they add to land value nearby. */
export const SERVICE: Partial<Record<BuildingKind, { radius: number; key: 'edu' | 'safety' | 'fire' | 'health'; value: number }>> = {
  school: { radius: 12, key: 'edu', value: 12 },
  police: { radius: 14, key: 'safety', value: 6 },
  fire: { radius: 14, key: 'fire', value: 4 },
  clinic: { radius: 12, key: 'health', value: 6 },
  hospital: { radius: 22, key: 'health', value: 14 },
  university: { radius: 22, key: 'edu', value: 16 },
};

/** Land value a landmark adds around itself: radius in cells and the bonus at its foot. */
export const LANDMARK: Partial<Record<BuildingKind, { radius: number; value: number }>> = {
  market: { radius: 7, value: 9 },
  riverpark: { radius: 7, value: 16 },
  palace: { radius: 12, value: 20 },
  tower: { radius: 16, value: 8 },
  office: { radius: 4, value: 4 },
  post: { radius: 4, value: 3 },
  library: { radius: 6, value: 7 },
  terminal: { radius: 10, value: 14 },
  ktx: { radius: 16, value: 22 },
  trailhead: { radius: 6, value: 5 },
  jjim: { radius: 6, value: 6 },
  medlab: { radius: 8, value: 10 },
  techpark: { radius: 10, value: 12 },
};
/** Landmarks a city can only have one of. */
export const UNIQUE: BuildingKind[] = ['palace', 'tower', 'ktx'];

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

/** What a zoned building actually is, by its look: Korean streets mix many small trades. */
export const VARIANTS: Partial<Record<BuildingKind, string[]>> = {
  // The variant decides the model too (render/buildings.ts), so the name always matches the look.
  r1: ['단독주택', '양옥집', '한옥', '작은 빌라', '작은 빌라'],
  r2: ['빌라', '다세대 주택', '저층 아파트', '저층 아파트'],
  r3: ['아파트 단지', '아파트 단지', '주상복합'],
  c1: ['편의점', '치킨집', '카페', 'PC방', '노래방', '부동산', '분식집'],
  c2: ['근린생활 빌딩', '학원 빌딩', '병원 빌딩', '교회가 있는 빌딩'],
  c3: ['오피스 타워', '오피스 타워', '대형마트'],
  jjim: ['찜질방', '목욕탕'],
  i1: ['비닐하우스', '논밭', '축사', '과수원'],
  i2: ['제조 공장', '부품 공장', '식품 공장'],
  i3: ['지식산업센터', '물류센터', '데이터센터'],
};
export const variantOf = (kind: BuildingKind, look: number) => { const v = VARIANTS[kind]; return v ? Math.floor(look * v.length) % v.length : 0; };
export const displayName = (kind: BuildingKind, look: number) => VARIANTS[kind]?.[variantOf(kind, look)] ?? KINDS[kind].name;
