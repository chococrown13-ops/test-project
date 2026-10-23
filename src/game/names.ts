import type { Rng } from './rng';

/** Everything here is invented; no real club or player is depicted. */

const KR_SURNAMES = [
  '김', '김', '김', '이', '이', '이', '박', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권',
  '황', '안', '송', '류', '전', '홍', '고', '문', '양', '손', '배', '백', '허', '유', '남', '심', '노', '하', '곽', '성',
  '차', '주', '우', '구', '민', '진', '나', '지', '엄', '채',
];

const KR_GIVEN_FIRST = [
  '민', '서', '도', '준', '지', '현', '우', '시', '하', '주', '성', '재', '태', '승', '동', '정', '영', '상', '진', '경',
  '건', '한', '세', '윤', '은', '규', '유', '형', '찬', '원', '대', '기', '창', '수', '용', '인', '석', '종', '혁', '희',
];
const KR_GIVEN_SECOND = [
  '준', '호', '우', '민', '현', '진', '훈', '수', '성', '빈', '혁', '규', '원', '재', '석', '영', '환', '찬', '율', '결',
  '혼', '균', '오', '윤', '범', '철', '섭', '근', '태', '욱', '열', '모', '한', '겸', '웅', '일', '용', '혁', '헌', '완',
];

/** Foreign pools, written the way Korean broadcasters would. */
const FOREIGN: Record<string, { first: string[]; last: string[] }> = {
  BRA: {
    first: ['루카스', '마테우스', '가브리엘', '하파엘', '티아구', '펠리페', '브루누', '이고르', '레안드루', '주니오르', '에베르통', '바그네르'],
    last: ['실바', '산투스', '소자', '올리베이라', '페레이라', '코스타', '로드리게스', '알메이다', '나시멘투', '카르발류', '바호스', '모레이라'],
  },
  ARG: {
    first: ['마티아스', '니콜라스', '파쿤도', '곤살로', '에세키엘', '라우타로', '프랑코', '이그나시오'],
    last: ['곤살레스', '페르난데스', '로페스', '디아스', '마르티네스', '소사', '아코스타', '메디나'],
  },
  ESP: {
    first: ['파블로', '알레한드로', '하비에르', '세르히오', '이케르', '아드리안', '다니', '마르크'],
    last: ['가르시아', '산체스', '로메로', '토레스', '나바로', '몰리나', '오르티스', '이글레시아스'],
  },
  SRB: {
    first: ['스테판', '네마냐', '밀로스', '알렉산다르', '두샨', '마르코'],
    last: ['페트로비치', '요바노비치', '니콜리치', '밀로셰비치', '스타니치', '일리치'],
  },
  JPN: {
    first: ['유토', '하루토', '소타', '렌', '다이키', '쇼', '가이토', '료'],
    last: ['다나카', '스즈키', '와타나베', '야마모토', '나카무라', '고바야시', '사이토', '하야시'],
  },
  AUS: {
    first: ['잭', '라일리', '미첼', '조슈아', '해리슨', '네이선'],
    last: ['톰슨', '윌리엄스', '캠벨', '스튜어트', '매켄지', '그레이엄'],
  },
  NGA: {
    first: ['치디', '에메카', '올루와', '사무엘', '빅터', '이브라힘'],
    last: ['오코예', '아데바요', '은와추쿠', '오나나', '에제', '이헤아나초'],
  },
  CRO: {
    first: ['이반', '루카', '안테', '마테오', '도마고이', '요시프'],
    last: ['코바치', '바비치', '유리치', '노바크', '크네제비치', '마리치'],
  },
  COL: {
    first: ['후안', '카밀로', '산티아고', '다비드', '안드레스', '훌리안'],
    last: ['몬테로', '바르가스', '카스티요', '레스트레포', '오소리오', '킨테로'],
  },
  UZB: {
    first: ['자수르', '오타벡', '엘도르', '아지즈', '쇼흐루흐'],
    last: ['라시도프', '토시모프', '유수포프', '카리모프', '나자로프'],
  },
};

export const NATION_LABEL: Record<string, string> = {
  KOR: '대한민국',
  BRA: '브라질',
  ARG: '아르헨티나',
  ESP: '스페인',
  SRB: '세르비아',
  JPN: '일본',
  AUS: '호주',
  NGA: '나이지리아',
  CRO: '크로아티아',
  COL: '콜롬비아',
  UZB: '우즈베키스탄',
};

export const FOREIGN_NATIONS = Object.keys(FOREIGN);

export function koreanName(rng: Rng): string {
  return rng.pick(KR_SURNAMES) + rng.pick(KR_GIVEN_FIRST) + rng.pick(KR_GIVEN_SECOND);
}

export function foreignName(rng: Rng, nation: string): string {
  const pool = FOREIGN[nation] ?? FOREIGN.BRA;
  return `${rng.pick(pool.first)} ${rng.pick(pool.last)}`;
}

export function playerName(rng: Rng, nation: string): string {
  return nation === 'KOR' ? koreanName(rng) : foreignName(rng, nation);
}

/** 48 invented clubs: a real city plus a made-up nickname that no real club uses. */
export const CLUB_SEEDS: { city: string; nick: string; short: string; primary: string; secondary: string }[] = [
  // Strongest third (start in 1부)
  { city: '서울', nick: '로열스', short: 'SRY', primary: '#1d3a8a', secondary: '#f5c518' },
  { city: '부산', nick: '마리너스', short: 'BMR', primary: '#0e7490', secondary: '#ffffff' },
  { city: '인천', nick: '하버', short: 'ICH', primary: '#111827', secondary: '#38bdf8' },
  { city: '대구', nick: '플레임', short: 'DGF', primary: '#b91c1c', secondary: '#fde68a' },
  { city: '울산', nick: '타이탄스', short: 'UST', primary: '#1e40af', secondary: '#fbbf24' },
  { city: '광주', nick: '피닉스', short: 'GJP', primary: '#ea580c', secondary: '#1f2937' },
  { city: '대전', nick: '코메츠', short: 'DJC', primary: '#7c3aed', secondary: '#e9d5ff' },
  { city: '수원', nick: '그리핀스', short: 'SWG', primary: '#0f766e', secondary: '#f0fdfa' },
  { city: '전주', nick: '포레스트', short: 'JJF', primary: '#166534', secondary: '#bbf7d0' },
  { city: '포항', nick: '웨이브', short: 'PHW', primary: '#1e3a5f', secondary: '#ef4444' },
  { city: '제주', nick: '오션스', short: 'JJO', primary: '#f97316', secondary: '#ffffff' },
  { city: '창원', nick: '나이츠', short: 'CWK', primary: '#334155', secondary: '#f8fafc' },
  { city: '성남', nick: '팰컨스', short: 'SNF', primary: '#18181b', secondary: '#facc15' },
  { city: '고양', nick: '썬더', short: 'GYT', primary: '#be123c', secondary: '#fecdd3' },
  { city: '용인', nick: '스타즈', short: 'YIS', primary: '#0284c7', secondary: '#e0f2fe' },
  { city: '청주', nick: '볼츠', short: 'CJB', primary: '#ca8a04', secondary: '#1c1917' },
  // Middle third (2부)
  { city: '천안', nick: '레인저스', short: 'CAR', primary: '#4d7c0f', secondary: '#ecfccb' },
  { city: '안산', nick: '시티', short: 'ASC', primary: '#0891b2', secondary: '#164e63' },
  { city: '화성', nick: '바이킹스', short: 'HSV', primary: '#7f1d1d', secondary: '#fca5a5' },
  { city: '김해', nick: '애슬레틱', short: 'GHA', primary: '#a16207', secondary: '#fef3c7' },
  { city: '강릉', nick: '마운틴', short: 'GNM', primary: '#065f46', secondary: '#a7f3d0' },
  { city: '원주', nick: '울브스', short: 'WJW', primary: '#3f3f46', secondary: '#fb923c' },
  { city: '춘천', nick: '레이크', short: 'CCL', primary: '#1d4ed8', secondary: '#bfdbfe' },
  { city: '여수', nick: '선셋', short: 'YSS', primary: '#c2410c', secondary: '#fed7aa' },
  { city: '순천', nick: '가든', short: 'SCG', primary: '#15803d', secondary: '#fef9c3' },
  { city: '목포', nick: '하버스타', short: 'MPH', primary: '#0369a1', secondary: '#fde047' },
  { city: '경주', nick: '헤리티지', short: 'GJH', primary: '#9f1239', secondary: '#fef3c7' },
  { city: '구미', nick: '엔진', short: 'GME', primary: '#52525b', secondary: '#22d3ee' },
  { city: '진주', nick: '펄스', short: 'JJP', primary: '#db2777', secondary: '#fce7f3' },
  { city: '평택', nick: '스톰', short: 'PTS', primary: '#1e293b', secondary: '#60a5fa' },
  { city: '의정부', nick: '센티널', short: 'UJB', primary: '#365314', secondary: '#d9f99d' },
  { city: '파주', nick: '보더스', short: 'PJB', primary: '#78350f', secondary: '#fcd34d' },
  // Bottom third (3부)
  { city: '김포', nick: '에어로', short: 'GPA', primary: '#0ea5e9', secondary: '#0c4a6e' },
  { city: '시흥', nick: '솔트', short: 'SHS', primary: '#e5e7eb', secondary: '#1f2937' },
  { city: '광명', nick: '라이트', short: 'GML', primary: '#facc15', secondary: '#1e3a8a' },
  { city: '하남', nick: '리버사이드', short: 'HNR', primary: '#0d9488', secondary: '#ccfbf1' },
  { city: '아산', nick: '스프링스', short: 'ASS', primary: '#2563eb', secondary: '#fef08a' },
  { city: '서산', nick: '코스트', short: 'SSC', primary: '#0f172a', secondary: '#f97316' },
  { city: '충주', nick: '오처드', short: 'CJO', primary: '#b45309', secondary: '#fefce8' },
  { city: '제천', nick: '하이랜드', short: 'JCH', primary: '#4338ca', secondary: '#e0e7ff' },
  { city: '속초', nick: '씨걸스', short: 'SCS', primary: '#38bdf8', secondary: '#0f172a' },
  { city: '양산', nick: '밸리', short: 'YSV', primary: '#16a34a', secondary: '#052e16' },
  { city: '거제', nick: '쉽야드', short: 'GJS', primary: '#475569', secondary: '#fbbf24' },
  { city: '통영', nick: '아일랜더스', short: 'TYI', primary: '#06b6d4', secondary: '#ecfeff' },
  { city: '군산', nick: '포트', short: 'GSP', primary: '#991b1b', secondary: '#f1f5f9' },
  { city: '익산', nick: '젬스', short: 'ISJ', primary: '#9333ea', secondary: '#faf5ff' },
  { city: '안동', nick: '마스크', short: 'ADM', primary: '#57534e', secondary: '#fde68a' },
  { city: '서귀포', nick: '탠저린', short: 'SGT', primary: '#fb923c', secondary: '#14532d' },
];

export const STADIUM_SUFFIX = ['스타디움', '아레나', '파크', '월드컵경기장', '종합운동장', '필드'];

const STAFF_FIRST = ['민', '태', '정', '상', '영', '경', '재', '성', '동', '용'];
const STAFF_SECOND = ['수', '철', '호', '훈', '식', '규', '환', '근', '만', '석'];

export function staffName(rng: Rng): string {
  return rng.pick(KR_SURNAMES) + rng.pick(STAFF_FIRST) + rng.pick(STAFF_SECOND);
}

const INJURIES: { name: string; min: number; max: number }[] = [
  { name: '햄스트링 부상', min: 10, max: 28 },
  { name: '발목 염좌', min: 7, max: 21 },
  { name: '종아리 근육 부상', min: 7, max: 18 },
  { name: '타박상', min: 2, max: 7 },
  { name: '사타구니 부상', min: 10, max: 25 },
  { name: '무릎 인대 부상', min: 28, max: 70 },
  { name: '허벅지 근육 부상', min: 10, max: 30 },
  { name: '발등 골절', min: 40, max: 80 },
  { name: '어깨 탈구', min: 20, max: 40 },
  { name: '감기 몸살', min: 2, max: 5 },
];

export function randomInjury(rng: Rng, severity = 1): { name: string; days: number } {
  // Most knocks are short; severe ones are rarer.
  const pool = rng.bool(0.82) ? INJURIES.filter((i) => i.max <= 30) : INJURIES;
  const injury = rng.pick(pool);
  return { name: injury.name, days: Math.round(rng.int(injury.min, injury.max) * severity) };
}
