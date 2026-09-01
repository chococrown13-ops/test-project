/**
 * 밸런스 검증용 헤드리스 시뮬레이션.
 *   npm run sim -- [시즌수] [국가수]
 * 리그 득점 분포, 개인 수상, 시즌 롤오버 불변식을 확인합니다.
 */

import { createGame } from '../src/game/newGame';
import { advanceWeek } from '../src/game/engine';
import { Rng } from '../src/game/rng';
import { SEASON_WEEKS } from '../src/game/types';
import { COUNTRIES } from '../src/data/countries';
import { AWARD_LABELS } from '../src/game/awards';
import { SQUAD_SIZE, caToBase } from '../src/game/player';
import { GROUP_KEYS, visibleGroups } from '../src/game/attributes';

const seasons = Number(process.argv[2] ?? 3);
const countryLimit = Number(process.argv[3] ?? 24);
const countryIds = COUNTRIES.slice(0, countryLimit).map((c) => c.id);

const t0 = Date.now();
const state = createGame({ seed: 20260824, countryIds, season: 2026, homeCountryId: countryIds[0] });
const rng = new Rng(state.seed ^ 0x9e3779b9);

console.log(`세계 생성: ${Object.keys(state.leagues).length}개 리그, ${Object.keys(state.clubs).length}개 구단, ${Object.keys(state.players).length}명 선수, ${Date.now() - t0}ms`);
console.log(`본거지 ${state.homeCountryId} — ${Object.values(state.leagues).filter((l) => l.countryId === state.homeCountryId).length}개 부`);

let totalMatches = 0;
let totalGoals = 0;
let homeWins = 0, draws = 0, awayWins = 0;

for (let s = 0; s < seasons; s++) {
  const seasonStart = Date.now();
  const before = Object.values(state.players).filter((p) => p.retired).length;

  // 게임과 같은 경로로 돌립니다. 주간 루프를 여기서 다시 구현하면 엔진에만
  // 있는 처리(시즌 중 훈련 등)가 통째로 빠진 채 검증하게 됩니다 — 실제로
  // 그렇게 새어 나가 성장이 하나도 반영되지 않은 세계를 재고 있었습니다.
  for (let w = 0; w < SEASON_WEEKS; w++) {
    const report = advanceWeek(state, rng);
    for (const fixture of state.lastWeekResults) {
      totalMatches++;
      totalGoals += fixture.homeGoals + fixture.awayGoals;
      if (fixture.homeGoals > fixture.awayGoals) homeWins++;
      else if (fixture.homeGoals < fixture.awayGoals) awayWins++;
      else draws++;
    }
    if (report.awarded) {
      const history = state.history[state.history.length - 1];
      const world = history.awards.filter((a) => a.awardId.startsWith('world-'));
      console.log(`\n[${history.season}] 시상식`);
      for (const award of world) {
        console.log(`  ${AWARD_LABELS[award.awardId]}: ${award.playerName} (${award.clubName}) — ${award.value}`);
      }
      console.log(`  개인상 총 ${history.awards.length}개, 대륙 우승 ${Object.keys(history.continentalChampions).length}개`);
    }
  }

  const retiredCount = Object.values(state.players).filter((p) => p.retired).length - before;
  console.log(`  롤오버: 은퇴 ${retiredCount}명, ${Date.now() - seasonStart}ms`);
  checkInvariants(state, s);
}

console.log('\n── 통계 ──');
console.log(`경기 수: ${totalMatches}`);
console.log(`경기당 득점: ${(totalGoals / totalMatches).toFixed(2)}`);
console.log(`홈승/무/원정승: ${pct(homeWins)} / ${pct(draws)} / ${pct(awayWins)}`);
console.log(`총 소요: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

function pct(n: number): string {
  return `${((n / totalMatches) * 100).toFixed(0)}%`;
}

function checkInvariants(state: ReturnType<typeof createGame>, index: number): void {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const club of Object.values(state.clubs)) {
    if (club.playerIds.length < 18) problems.push(`${club.name} 스쿼드 ${club.playerIds.length}명`);
    if (club.playerIds.length > SQUAD_SIZE + 6) problems.push(`${club.name} 스쿼드 과다 ${club.playerIds.length}명`);
    const keepers = club.playerIds.filter((id) => state.players[id]?.group === 'GK').length;
    if (keepers < 1) problems.push(`${club.name} 골키퍼 없음`);
    for (const id of club.playerIds) {
      if (seen.has(id)) problems.push(`선수 중복 소속: ${id}`);
      seen.add(id);
      const player = state.players[id];
      if (!player) problems.push(`없는 선수 참조: ${id}`);
      else if (player.clubId !== club.id) problems.push(`소속 불일치: ${player.name}`);
      else if (player.retired) problems.push(`은퇴 선수가 스쿼드에: ${player.name}`);
    }
  }
  // 평점은 10점 만점입니다. 출전 수와 평점 합계가 어긋나면 여기서 터집니다.
  const rated = Object.values(state.players).filter((p) => p.career.apps > 0);
  let worstAvg = 0;
  let worstName = '';
  for (const player of rated) {
    const avg = player.career.ratingSum / player.career.apps;
    if (avg > worstAvg) { worstAvg = avg; worstName = player.name; }
  }
  if (worstAvg > 10) problems.push(`평점 범위 초과: ${worstName} ${worstAvg.toFixed(1)}`);

  const active = Object.values(state.players).filter((p) => !p.retired);
  const ages = active.map((p) => p.age);
  const avgAge = ages.reduce((a, b) => a + b, 0) / ages.length;
  const topCa = active.slice().sort((a, b) => b.ca - a.ca).slice(0, 5);
  const topValue = active.slice().sort((a, b) => b.value - a.value)[0];
  const topWage = active.filter((p) => p.contract).sort((a, b) => b.contract!.wage - a.contract!.wage)[0];
  const freeAgents = active.filter((p) => !p.clubId).length;
  // 능력치가 CA 와 따로 놀지 않는지. 시즌 중 조금씩 반영하다 보면 둘이
  // 어긋난 채 굳어 버리기 쉽습니다.
  let drift = 0;
  for (const p of active) {
    const keys = visibleGroups(p.group === 'GK').flatMap((g) => GROUP_KEYS[g]);
    const mean = keys.reduce((sum, k) => sum + p.attributes[k], 0) / keys.length;
    drift += Math.abs(mean - caToBase(p.ca));
  }
  drift /= active.length;
  if (drift > 1.5) problems.push(`능력치가 CA 와 괴리: 평균 ${drift.toFixed(2)}`);

  const meanCa = active.reduce((sum, p) => sum + p.ca, 0) / active.length;
  const nearPa = active.filter((p) => p.pa - p.ca <= 8).length;
  const prospects = active.filter((p) => p.age <= 23);
  const topProspectPa = prospects.slice().sort((a, b) => b.pa - a.pa).slice(0, 3).map((p) => `${p.ca}/${p.pa}`);
  const peak = active.filter((p) => p.age >= 24 && p.age <= 28);
  const meanPeakCa = peak.length ? peak.reduce((s, p) => s + p.ca, 0) / peak.length : 0;
  const buckets: Array<[string, number, number]> = [['16-19', 16, 19], ['20-23', 20, 23], ['24-27', 24, 27], ['28-31', 28, 31], ['32+', 32, 99]];
  const byAge = buckets.map(([label, lo, hi]) => {
    const group = active.filter((p) => p.age >= lo && p.age <= hi);
    const mean = group.length ? group.reduce((s, p) => s + p.ca, 0) / group.length : 0;
    return `${label} ${mean.toFixed(0)}(${group.length})`;
  }).join(' · ');
  console.log(`    능력치-CA 괴리 ${drift.toFixed(2)}`);
  console.log(`    나이대별 CA: ${byAge}`);
  console.log(`    평균 CA ${meanCa.toFixed(1)} · 전성기(24-28) 평균 ${meanPeakCa.toFixed(1)} · PA 도달 ${nearPa}명 · 상위 유망주 ${topProspectPa.join(' ')}`);
  console.log(`    최고 통산 평점 ${worstAvg.toFixed(2)} (${worstName})`);
  console.log(`    최고 CA ${topCa.map((p) => p.ca).join('/')} · 최고가 ${topValue.name} ${(topValue.value / 1000).toFixed(1)}M · 최고 주급 ${topWage.contract!.wage.toFixed(0)}k · FA ${freeAgents}명`);
  if (avgAge < 20 || avgAge > 31) problems.push(`평균 나이 이상: ${avgAge.toFixed(1)}`);

  if (problems.length > 0) {
    console.log(`  ⚠ 시즌 ${index + 1} 불변식 위반 ${problems.length}건`);
    problems.slice(0, 6).forEach((p) => console.log(`    - ${p}`));
  } else {
    console.log(`  ✓ 불변식 통과 (평균 나이 ${avgAge.toFixed(1)})`);
  }
}
