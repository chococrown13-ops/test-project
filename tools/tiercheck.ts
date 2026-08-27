/** 리그 계층 · 승강제 · 스카우팅 해금이 의도대로 도는지 확인합니다. */
import { createGame } from '../src/game/newGame';
import { advanceWeek } from '../src/game/engine';
import { Rng } from '../src/game/rng';
import { leagueAccess, scoutingCeiling, sweep, DEFAULT_FILTERS } from '../src/game/scouting';
import { SEASON_WEEKS } from '../src/game/types';
import { adjustReputation } from '../src/game/agent';

const home = process.argv[2] ?? 'eng';
const state = createGame({ seed: 555, countryIds: ['eng', 'esp', 'kor', 'bra'], homeCountryId: home });
const rng = new Rng(555);

console.log(`리그 ${Object.keys(state.leagues).length}개 · 본거지 ${state.homeCountryId}`);
for (const league of Object.values(state.leagues).sort((a, b) => a.countryId.localeCompare(b.countryId) || a.tier - b.tier)) {
  const comp = state.competitions[league.competitionId];
  const sample = league.clubIds.slice(0, 3).map((id) => state.clubs[id].name).join(', ');
  console.log(`  ${comp.name.padEnd(14)} 수준 ${String(comp.prestige).padStart(3)} · ${league.clubIds.length}팀 · ${sample}`);
}

console.log(`\n평판별 사정권 (현재 평판 ${state.agent.reputation}, 상한 ${scoutingCeiling(state).toFixed(0)})`);
for (const rep of [12, 25, 40, 55, 70]) {
  state.agent.reputation = rep;
  const open = leagueAccess(state).filter((l) => l.unlocked).map((l) => l.name);
  console.log(`  평판 ${String(rep).padStart(2)}: ${open.length ? open.join(', ') : '(없음)'}`);
}

// 시작 평판으로 훑었을 때 실제로 어느 리그 선수가 걸리는지
state.agent.reputation = 12;
adjustReputation(state, 0);
state.scouting.points = 999;
const found = new Map<string, number>();
for (let i = 0; i < 15; i++) {
  for (const id of sweep(state, DEFAULT_FILTERS, rng).found) {
    const club = state.players[id].clubId ? state.clubs[state.players[id].clubId!] : null;
    const key = club ? `${club.countryId} ${club.tier}부` : '무소속';
    found.set(key, (found.get(key) ?? 0) + 1);
  }
}
console.log('\n시작 평판(12)으로 훑어서 나온 선수의 소속:');
for (const [key, n] of [...found].sort((a, b) => b[1] - a[1])) console.log(`  ${key}: ${n}명`);

/** 부별 평균 능력치와 주급 — 하부 리그가 하부 리그로 남아 있는지. */
function tierProfile(label: string): void {
  const rows: string[] = [];
  for (const league of Object.values(state.leagues).sort((a, b) => a.countryId.localeCompare(b.countryId) || a.tier - b.tier)) {
    const players = league.clubIds.flatMap((id) => state.clubs[id].playerIds).map((id) => state.players[id]).filter(Boolean);
    if (players.length === 0) continue;
    const ca = players.reduce((s, p) => s + p.ca, 0) / players.length;
    const wages = players.filter((p) => p.contract);
    const wage = wages.length ? wages.reduce((s, p) => s + p.contract!.wage, 0) / wages.length : 0;
    rows.push(`${state.competitions[league.competitionId].name} CA ${ca.toFixed(0)} 주급 ${wage.toFixed(1)}k`);
  }
  console.log(`\n${label}\n  ${rows.join('\n  ')}`);
}

tierProfile('개막 시점 부별 체급');

// 여러 시즌 돌리고 승강제와 체급 유지 확인
const before = new Map(Object.values(state.clubs).map((c) => [c.id, c.tier]));
for (let w = 0; w < SEASON_WEEKS; w++) advanceWeek(state, rng);
const moved = Object.values(state.clubs).filter((c) => before.get(c.id) !== c.tier);
console.log(`\n시즌 롤오버 후 부가 바뀐 구단 ${moved.length}개`);
for (const club of moved.slice(0, 8)) {
  console.log(`  ${club.name}: ${before.get(club.id)}부 → ${club.tier}부`);
}
const sizes = Object.values(state.leagues).map((l) => `${l.id}:${l.clubIds.length}`);
console.log(`  리그 규모: ${sizes.join(' ')}`);

for (let s = 0; s < 5; s++) for (let w = 0; w < SEASON_WEEKS; w++) advanceWeek(state, rng);
tierProfile('여섯 시즌 뒤 부별 체급');
