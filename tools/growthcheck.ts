import { createGame } from '../src/game/newGame';
import { advanceWeek } from '../src/game/engine';
import { trainingTick, isGrowthWeek, GROWTH_WEEKS } from '../src/game/season';
import { Rng } from '../src/game/rng';
import { SEASON_WEEKS } from '../src/game/types';

const state = createGame({ seed: 4242, countryIds: ['eng'], homeCountryId: 'eng' });
const rng = new Rng(4242);
const young = Object.values(state.players)
  .filter((p) => p.age <= 20 && p.pa - p.ca > 40)
  .sort((a, b) => (b.pa - b.ca) - (a.pa - a.ca))[0];
console.log(`추적: ${young.name} ${young.age}세 CA ${young.ca} PA ${young.pa} · ${state.clubs[young.clubId!].name}`);
console.log(`성장 주차: ${GROWTH_WEEKS.join(', ')}`);

let ticks = 0;
for (let w = 1; w <= SEASON_WEEKS; w++) {
  const caBefore = young.ca;
  const progBefore = young.caProgress ?? 0;
  advanceWeek(state, rng);
  if (isGrowthWeek(w)) {
    ticks++;
    console.log(`  ${String(w).padStart(2)}주 · 출전 ${String(young.season.minutes).padStart(4)}분`
      + ` · CA ${caBefore}→${young.ca} · 잔돈 ${progBefore.toFixed(2)}→${(young.caProgress ?? 0).toFixed(2)}`);
  }
}
console.log(`틱 ${ticks}회 · 시즌 종료 CA ${young.ca}`);

// 전체 인구의 한 시즌 CA 변화
const gained = Object.values(state.players).filter((p) => !p.retired && (p.caProgress ?? 0) !== 0).length;
console.log(`잔돈이 쌓인 선수 ${gained}명 / ${Object.values(state.players).filter((p) => !p.retired).length}명`);
