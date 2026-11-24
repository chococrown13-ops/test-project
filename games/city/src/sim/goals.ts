import { Zone } from './defs';
import { monthExpense, monthIncome } from './economy';
import { hasOpenWater } from './tools';
import { stationAreaStats } from './transit';
import { N } from './defs';
import { notify, type Building, type World } from './world';

/**
 * Goals in five chapters, from a village to a metropolitan city. A goal once
 * met stays met (the city's progress is saved), and finishing a chapter pays
 * a 국비 grant once. Alongside them, 도전과제: challenges in no order, each
 * marked with a medal when first met.
 */

export interface Goal { text: string | ((w: World) => string); done: (w: World) => boolean }
export interface Chapter { name: string; size: number; reward: number }

const count = (w: World, f: (b: Building) => boolean) => { let n = 0; w.buildings.forEach((b) => { if (f(b)) n++; }); return n; };
const kinds = (w: World, ...k: string[]) => count(w, (b) => k.includes(b.kind));
const roads = (w: World) => { let n = 0; for (let i = 0; i < N * N; i++) if (w.road[i]) n++; return n; };
const zoned = (w: World, z: number) => { for (let i = 0; i < N * N; i++) if (w.zone[i] === z) return true; return false; };
/** Months in a row, up to the last closed one, that ended in the black. */
export function surplusRun(w: World): number {
  let n = 0;
  for (let k = w.reports.length - 1; k >= 0 && monthIncome(w.reports[k]) - monthExpense(w.reports[k]) > 0; k--) n++;
  return n;
}
const lastTourism = (w: World) => w.reports[w.reports.length - 1]?.income.V ?? 0;
const metroLines = (w: World) => w.lines.filter((l) => l.kind === 'metro').length;

export const CHAPTERS: Chapter[] = [
  { name: '마을', size: 8, reward: 5000 },
  { name: '읍', size: 8, reward: 15000 },
  { name: '시', size: 8, reward: 30000 },
  { name: '대도시', size: 8, reward: 60000 },
  { name: '광역시', size: 8, reward: 100000 },
];

export const GOALS: Goal[] = [
  // 1장 마을
  { text: '서쪽 고속도로 끝에서 이어지는 도로를 깔아 보세요. 도구는 아래 도로에 있어요.', done: (w) => roads(w) > 40 },
  { text: '도로 옆에 주거 구역을 칠하세요. 도로에서 3칸까지 칠할 수 있어요.', done: (w) => zoned(w, Zone.R) },
  { text: '발전소를 짓고 도로로 연결하세요. 전기는 도로를 따라 흘러요.', done: (w) => w.stats.powerSupply > 0 },
  { text: (w) => (hasOpenWater(w) ? '물가에 정수장을 지어 수돗물을 공급하세요. 도로에 붙여야 작동해요.' : '이 땅에는 물가가 없어요. 지하수 관정을 지어 수돗물을 공급하세요. 도로에 붙여야 작동해요.'), done: (w) => w.stats.waterSupply > 0 },
  { text: '상업과 산업 구역을 만들어 일자리를 주세요.', done: (w) => zoned(w, Zone.C) && zoned(w, Zone.I) },
  { text: '인구 300명을 모아 보세요. 위쪽 수요 막대를 참고하세요.', done: (w) => w.stats.pop >= 300 },
  { text: '하수처리장을 지어 하수를 처리하세요. 주거지와 떨어뜨리면 좋아요.', done: (w) => w.stats.sewageCap > 0 },
  { text: '초등학교를 지어 아이들을 가르치세요. 주변 땅값이 올라요.', done: (w) => kinds(w, 'school') > 0 },
  // 2장 읍
  { text: '경찰서, 소방서, 보건소를 하나씩 지으세요.', done: (w) => ['police', 'fire', 'clinic'].every((k) => kinds(w, k) > 0) },
  { text: '인구 1,500명을 달성하세요. 공원도 땅값을 올려 줘요.', done: (w) => w.stats.pop >= 1500 },
  { text: '공원을 다섯 곳 만드세요. 공원 둘레는 땅값과 만족도가 올라요.', done: (w) => kinds(w, 'park') >= 5 },
  { text: '버스 노선을 만들어 차 없이 출근하게 해 주세요.', done: (w) => w.lines.some((l) => l.kind === 'bus') },
  { text: '인구 2,500명이 되면 2단계가 열려요. 땅값을 올려 첫 빌라·저층 아파트를 올려 보세요.', done: (w) => kinds(w, 'r2') > 0 },
  { text: '석 달 연속 흑자를 내 보세요. 예산 창에서 수입과 지출을 볼 수 있어요.', done: (w) => surplusRun(w) >= 3 },
  { text: (w) => `주민 행복도를 55% 이상으로 올려 보세요 (지금 ${Math.round(w.stats.happy)}%). 공원, 학교, 행정복지센터가 도움이 돼요.`, done: (w) => w.stats.pop >= 1000 && w.stats.happy >= 55 },
  { text: '인구 5,000명. 대로와 버스로 교통 체증을 줄이세요.', done: (w) => w.stats.pop >= 5000 },
  // 3장 시
  { text: '지하철 1호선을 개통하세요. 역 주변은 역세권이 돼요.', done: (w) => metroLines(w) >= 1 },
  { text: '역세권을 키우세요. 역에서 250m 안에 2,000명이 살고 일자리 800개가 있게 해 보세요.', done: (w) => { const s = stationAreaStats(w); return s.pop >= 2000 && s.jobs >= 800; } },
  { text: '고가도로, 지하차도, 터널 중 하나로 막힌 길을 뚫어 보세요.', done: (w) => w.roadAlt.some((r) => r > 0) },
  { text: '명소를 하나 지어 보세요. 전통시장, 수변공원, 고궁, 전망타워가 있어요.', done: (w) => kinds(w, 'market', 'riverpark', 'palace', 'tower') > 0 },
  { text: '공공자전거 대여소를 세 곳 지어 가까운 길은 자전거로 다니게 해 주세요.', done: (w) => kinds(w, 'bike') >= 3 },
  { text: '고속버스터미널을 지어 다른 도시와 이어 주세요. 대로에 붙여 지어요.', done: (w) => kinds(w, 'terminal') > 0 },
  { text: (w) => `인구 8,000명이 넘은 도시에서 평균 출퇴근 시간을 45분 아래로 줄여 보세요 (지금 ${Math.round(w.stats.commute)}분). 버스, 지하철, 대로가 도움이 돼요.`, done: (w) => w.stats.pop >= 8000 && w.stats.commute > 0 && w.stats.commute <= 45 },
  { text: '인구 10,000명이 되면 3단계가 열려요. 땅값 높은 2단계 건물들이 모이면 첫 고층 아파트나 주상복합으로 재건축돼요.', done: (w) => kinds(w, 'r3') > 0 },
  // 4장 대도시
  { text: '첫 오피스 타워를 올리세요. 상업 구역의 땅값이 관건이에요.', done: (w) => kinds(w, 'c3') > 0 },
  { text: '인구 20,000명. 진짜 도시가 됐어요!', done: (w) => w.stats.pop >= 20000 },
  { text: '지하철 2호선을 개통하세요. 두 노선이 만나는 역은 환승역이 돼요.', done: (w) => metroLines(w) >= 2 },
  { text: 'KTX역을 지으세요. 도시 밖으로 가는 사람이 기차를 타요.', done: (w) => kinds(w, 'ktx') > 0 },
  { text: '관광 수입을 한 달에 500만 원 넘게 벌어 보세요. 명소, 찜질방, 등산로가 관광객을 불러요.', done: (w) => lastTourism(w) >= 500 },
  { text: '축제를 열어 보세요. 벚꽃길이나 명소가 있으면 철마다 축제가 열려요.', done: (w) => !!w.festival },
  { text: '오피스 타워를 다섯 동 올리세요.', done: (w) => kinds(w, 'c3') >= 5 },
  { text: '고층 아파트·주상복합을 열 동 올리세요.', done: (w) => kinds(w, 'r3') >= 10 },
  // 5장 광역시
  { text: '인구 30,000명을 달성하세요.', done: (w) => w.stats.pop >= 30000 },
  { text: (w) => `인구 20,000명이 넘는 도시에서 행복도를 65% 이상으로 지켜 보세요 (지금 ${Math.round(w.stats.happy)}%).`, done: (w) => w.stats.pop >= 20000 && w.stats.happy >= 65 },
  { text: '버스와 지하철 노선을 합쳐 여덟 개 운행하세요.', done: (w) => w.lines.length >= 8 },
  { text: '여섯 달 연속 흑자를 내 보세요.', done: (w) => surplusRun(w) >= 6 },
  { text: '빚 없이 시 금고에 10억 원을 모으세요 (대출이 남아 있으면 안 돼요).', done: (w) => w.money >= 100000 && !w.loans.length },
  { text: (w) => `인구 30,000명이 넘는 도시에서 도로 혼잡도를 15% 아래로 지켜 보세요 (지금 ${Math.round(w.stats.congestion * 100)}%). 현황 창의 교통 지도에서 빨간 길을 줄여요.`, done: (w) => w.stats.pop >= 30000 && w.stats.congestion <= 0.15 },
  { text: '인구 50,000명. 광역시가 눈앞이에요.', done: (w) => w.stats.pop >= 50000 },
  { text: '인구 100,000명. 광역시가 됐어요!', done: (w) => w.stats.pop >= 100000 },
];

export interface Progress { index: number; chapter: number; inChapter: number; goal: Goal | null; done: boolean }

/** Move the city's goals on (a goal met stays met), paying each chapter's grant once. */
export function advanceGoals(w: World): Progress {
  // A city saved before chapters existed catches up quietly (no back pay for chapters it had already passed).
  const first = w.goal === undefined;
  let k = w.goal ?? 0;
  while (k < GOALS.length && GOALS[k].done(w)) {
    k++;
    // A chapter finished: its 국비 grant, once.
    let end = 0;
    CHAPTERS.forEach((c, i) => {
      end += c.size;
      if (k === end && (w.chapterPaid ?? 0) <= i) {
        w.chapterPaid = i + 1;
        if (first) return;
        w.money += c.reward;
        notify(w, `${i + 1}장 「${c.name}」을 마쳤어요! 국비 지원 ${c.reward.toLocaleString('ko-KR')}만 원${i + 1 < CHAPTERS.length ? `. 이제 ${i + 2}장 「${CHAPTERS[i + 1].name}」이에요.` : '.'}`, 'good');
      }
    });
  }
  w.goal = k;
  let chapter = 0, start = 0;
  while (chapter < CHAPTERS.length - 1 && k >= start + CHAPTERS[chapter].size) { start += CHAPTERS[chapter].size; chapter++; }
  return { index: k, chapter, inChapter: Math.min(k - start, CHAPTERS[chapter].size - 1), goal: GOALS[k] ?? null, done: k >= GOALS.length };
}

/* -------------------------------------------------------- 도전과제 */

export interface Achievement { id: string; name: string; text: string; done: (w: World) => boolean }

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'black1', name: '알뜰 살림', text: '열두 달 연속 흑자', done: (w) => surplusRun(w) >= 12 },
  { id: 'black3', name: '적자 없는 3년', text: '서른여섯 달 연속 흑자', done: (w) => surplusRun(w) >= 36 },
  { id: 'parks', name: '공원 도시', text: '공원 30곳', done: (w) => kinds(w, 'park') >= 30 },
  { id: 'green', name: '맑은 하늘', text: '화력 발전소 없이 전력 1,000 넘게', done: (w) => kinds(w, 'coal') === 0 && w.stats.powerSupply >= 1000 },
  { id: 'buses', name: '버스 천국', text: '버스 노선 다섯 개', done: (w) => w.lines.filter((l) => l.kind === 'bus').length >= 5 },
  { id: 'bikes', name: '두 바퀴 도시', text: '공공자전거로 한 달 500번 이동', done: (w) => w.bikeLast >= 500 },
  { id: 'station', name: '역세권 명당', text: '역 둘레 250m에 5,000명', done: (w) => stationAreaStats(w).pop >= 5000 },
  { id: 'towers', name: '마천루', text: '오피스 타워 열 동', done: (w) => kinds(w, 'c3') >= 10 },
  { id: 'apts', name: '아파트 숲', text: '고층 아파트·주상복합 서른 동', done: (w) => kinds(w, 'r3') >= 30 },
  { id: 'sights', name: '명소 수집가', text: '전통시장, 수변공원, 고궁, 전망타워를 모두', done: (w) => ['market', 'riverpark', 'palace', 'tower'].every((k) => kinds(w, k) > 0) },
  { id: 'happy', name: '살기 좋은 도시', text: '인구 5,000명 넘는 도시에서 행복도 80%', done: (w) => w.stats.pop >= 5000 && w.stats.happy >= 80 },
  { id: 'flow', name: '뻥 뚫린 길', text: '인구 20,000명 넘는 도시에서 도로 혼잡도 8% 아래', done: (w) => w.stats.pop >= 20000 && w.stats.congestion < 0.08 },
  { id: 'tourism', name: '관광 도시', text: '관광 수입 한 달 2,000만 원', done: (w) => lastTourism(w) >= 2000 },
  { id: 'debtfree', name: '빚 갚은 시장', text: '대출을 받았다가 모두 갚기', done: (w) => !!w.everLoan && !w.loans.length },
];

/** Check the 도전과제 (once a day is plenty): a medal and a notice for each newly met. */
export function checkAchievements(w: World) {
  const got = new Set(w.achieved ?? []);
  for (const a of ACHIEVEMENTS) {
    if (got.has(a.id) || !a.done(w)) continue;
    got.add(a.id);
    notify(w, `🏅 도전과제 달성: ${a.name} (${a.text})`, 'good');
  }
  w.achieved = [...got];
}
