/** 시즌 중 9틱 성장이 예전 롤오버 1회와 같은 양인지 직접 비교합니다. */
import { createGame } from '../src/game/newGame';
import { advanceWeek } from '../src/game/engine';
import { Rng } from '../src/game/rng';
import { SEASON_WEEKS } from '../src/game/types';

const state = createGame({ seed: 777, countryIds: ['eng'], homeCountryId: 'eng' });
const rng = new Rng(777);

const cohort = Object.values(state.players)
  .filter((p) => p.age >= 18 && p.age <= 21 && p.pa - p.ca > 30);
const before = new Map(cohort.map((p) => [p.id, p.ca]));

for (let w = 1; w <= SEASON_WEEKS; w++) advanceWeek(state, rng);

const rows = cohort.map((p) => ({
  p,
  gain: p.ca - (before.get(p.id) ?? p.ca),
  minutes: p.career.minutes,
}));
const played = rows.filter((r) => r.minutes > 900);
const benched = rows.filter((r) => r.minutes < 200);

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
console.log(`유망주 ${cohort.length}명 (18-21세, 잠재력 여유 30+)`);
console.log(`  주전급(900분+) ${played.length}명 · 시즌 CA 증가 평균 ${mean(played.map((r) => r.gain)).toFixed(1)}`);
console.log(`  벤치(200분 미만) ${benched.length}명 · 시즌 CA 증가 평균 ${mean(benched.map((r) => r.gain)).toFixed(1)}`);
console.log(`  전체 평균 ${mean(rows.map((r) => r.gain)).toFixed(1)} · 출전 평균 ${mean(rows.map((r) => r.minutes)).toFixed(0)}분`);
const top = rows.slice().sort((a, b) => b.gain - a.gain).slice(0, 5);
for (const r of top) {
  console.log(`    ${r.p.name} ${r.p.age}세 CA ${before.get(r.p.id)}→${r.p.ca} (PA ${r.p.pa}) ${r.minutes}분`);
}
