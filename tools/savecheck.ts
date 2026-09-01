/** 세이브 크기와 왕복 무결성 확인. */
import { createGame } from '../src/game/newGame';
import { serialize, deserialize } from '../src/game/save';
import { advanceWeek } from '../src/game/engine';
import { Rng } from '../src/game/rng';
import { COUNTRIES, DEFAULT_COUNTRY_IDS } from '../src/data/countries';
import { gzipSync } from 'node:zlib';

for (const [label, ids] of [
  ['기본 16개국', DEFAULT_COUNTRY_IDS],
  ['전체 24개국', COUNTRIES.map((c) => c.id)],
] as const) {
  const state = createGame({ seed: 7, countryIds: ids as string[], homeCountryId: 'eng' });
  const rng = new Rng(7);
  for (let i = 0; i < 12; i++) advanceWeek(state, rng);
  const text = serialize(state);
  const back = deserialize(text);
  const players = Object.keys(state.players).length;
  const ok = back && Object.keys(back.players).length === players
    && back.players[Object.keys(state.players)[0]].attributes.finishing === state.players[Object.keys(state.players)[0]].attributes.finishing
    && back.season === state.season;
  const gz = gzipSync(Buffer.from(text)).length;
  // 능력치 변동 기록(선수 정보의 화살표)도 세이브를 넘어가야 합니다.
  const grown = Object.values(state.players).filter((p) => p.growth && Object.keys(p.growth).length > 0);
  const growthOk = back != null && grown.length > 0 && grown.every((p) => {
    const other = back.players[p.id];
    return other && JSON.stringify(other.growth ?? {}) === JSON.stringify(p.growth)
      && (other.caGain ?? 0) === Math.round(p.caGain ?? 0);
  });
  console.log(`${label}: 선수 ${players}명 · 원본 ${(text.length / 1024 / 1024).toFixed(2)}MB · gzip+base64 ${((gz * 1.34) / 1024 / 1024).toFixed(2)}MB · 왕복 ${ok ? 'OK' : '실패'} · 성장기록 ${grown.length}명 ${growthOk ? 'OK' : '실패'}`);
}
