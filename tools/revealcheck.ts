/** 파악도별 추정 구간이 실제로 참값을 감추는지 확인합니다. */
import { createGame } from '../src/game/newGame';
import { revealRange } from '../src/game/scouting';
import { ATTRIBUTE_KEYS } from '../src/game/attributes';

const state = createGame({ seed: 31, countryIds: ['eng'], homeCountryId: 'eng' });
const players = Object.values(state.players).slice(0, 400);

for (const depth of [0, 25, 50, 75, 100]) {
  let midpointExact = 0;
  let samples = 0;
  let widthSum = 0;
  let offsetSum = 0;
  for (const player of players) {
    for (const key of ATTRIBUTE_KEYS) {
      const value = player.attributes[key];
      const [low, high] = revealRange(`${player.id}:${key}`, value, depth);
      samples++;
      widthSum += high - low;
      const mid = (low + high) / 2;
      offsetSum += Math.abs(mid - value);
      if (Math.round(mid) === value) midpointExact++;
    }
  }
  console.log(
    `파악도 ${String(depth).padStart(3)}% · 구간 폭 ${(widthSum / samples).toFixed(1)}`
    + ` · 중앙값이 정답일 확률 ${((midpointExact / samples) * 100).toFixed(0)}%`
    + ` · 중앙값 평균 오차 ${(offsetSum / samples).toFixed(2)}`,
  );
}
