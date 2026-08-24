/**
 * 밸런스 검증용 헤드리스 시뮬레이션.
 *   npm run sim -- [시즌수] [국가수]
 * 리그 득점 분포, 개인 수상, 시즌 롤오버 불변식을 확인합니다.
 */

import { createGame } from '../src/game/newGame';
import { playWeek, weeklyRecovery, ensureWorldCup, finishSeason, rolloverSeason } from '../src/game/season';
import { Rng } from '../src/game/rng';
import { SEASON_WEEKS, AWARDS_WEEK } from '../src/game/types';
import { COUNTRIES } from '../src/data/countries';
import { AWARD_LABELS } from '../src/game/awards';
import { SQUAD_SIZE } from '../src/game/player';

const seasons = Number(process.argv[2] ?? 3);
const countryLimit = Number(process.argv[3] ?? 24);
const countryIds = COUNTRIES.slice(0, countryLimit).map((c) => c.id);

const t0 = Date.now();
const state = createGame({ seed: 20260824, countryIds, season: 2026 });
const rng = new Rng(state.seed ^ 0x9e3779b9);

console.log(`세계 생성: ${Object.keys(state.clubs).length}개 구단, ${Object.keys(state.players).length}명 선수, ${Date.now() - t0}ms`);

let totalMatches = 0;
let totalGoals = 0;
let homeWins = 0, draws = 0, awayWins = 0;

for (let s = 0; s < seasons; s++) {
  const seasonStart = Date.now();
  for (let week = 1; week <= SEASON_WEEKS; week++) {
    state.week = week;
    ensureWorldCup(state, rng);
    const results = playWeek(state, rng);
    weeklyRecovery(state);
    for (const fixture of results) {
      totalMatches++;
      totalGoals += fixture.homeGoals + fixture.awayGoals;
      if (fixture.homeGoals > fixture.awayGoals) homeWins++;
      else if (fixture.homeGoals < fixture.awayGoals) awayWins++;
      else draws++;
    }
    if (week === AWARDS_WEEK) {
      const { history } = finishSeason(state);
      const world = history.awards.filter((a) => a.awardId.startsWith('world-'));
      console.log(`\n[${history.season}] 시상식`);
      for (const award of world) {
        console.log(`  ${AWARD_LABELS[award.awardId]}: ${award.playerName} (${award.clubName}) — ${award.value}`);
      }
      const eng = history.awards.find((a) => a.awardId === 'top-scorer' && a.competitionId === 'lg:eng');
      if (eng) console.log(`  잉글랜드 득점왕: ${eng.playerName} ${eng.value}골`);
      const glove = history.awards.find((a) => a.awardId === 'golden-glove' && a.competitionId === 'lg:eng');
      if (glove) console.log(`  잉글랜드 골든글러브: ${glove.playerName} ${glove.value}클린시트`);
      console.log(`  개인상 총 ${history.awards.length}개, 대륙 우승 ${Object.keys(history.continentalChampions).length}개, 클럽 월드컵: ${history.worldChampionId ? state.clubs[history.worldChampionId].name : '없음'}`);
    }
  }
  const { retired } = rolloverSeason(state, rng);
  console.log(`  롤오버: 은퇴 ${retired.length}명, ${Date.now() - seasonStart}ms`);
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
  const active = Object.values(state.players).filter((p) => !p.retired);
  const ages = active.map((p) => p.age);
  const avgAge = ages.reduce((a, b) => a + b, 0) / ages.length;
  const topCa = active.slice().sort((a, b) => b.ca - a.ca).slice(0, 5);
  const topValue = active.slice().sort((a, b) => b.value - a.value)[0];
  const topWage = active.filter((p) => p.contract).sort((a, b) => b.contract!.wage - a.contract!.wage)[0];
  const freeAgents = active.filter((p) => !p.clubId).length;
  console.log(`    최고 CA ${topCa.map((p) => p.ca).join('/')} · 최고가 ${topValue.name} ${(topValue.value / 1000).toFixed(1)}M · 최고 주급 ${topWage.contract!.wage.toFixed(0)}k · FA ${freeAgents}명`);
  if (avgAge < 20 || avgAge > 31) problems.push(`평균 나이 이상: ${avgAge.toFixed(1)}`);

  if (problems.length > 0) {
    console.log(`  ⚠ 시즌 ${index + 1} 불변식 위반 ${problems.length}건`);
    problems.slice(0, 6).forEach((p) => console.log(`    - ${p}`));
  } else {
    console.log(`  ✓ 불변식 통과 (평균 나이 ${avgAge.toFixed(1)})`);
  }
}
