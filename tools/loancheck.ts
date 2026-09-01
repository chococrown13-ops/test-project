/** 임대가 붙고, 뛰고, 시즌 뒤 제대로 복귀하는지 확인합니다. */
import { createGame } from '../src/game/newGame';
import { advanceWeek } from '../src/game/engine';
import { Rng } from '../src/game/rng';
import { DEFAULT_FILTERS, sweep } from '../src/game/scouting';
import { approachPlayer } from '../src/game/clients';
import { arrangeLoan, loanEligibility, loanOutlook } from '../src/game/loan';
import { serialize, deserialize } from '../src/game/save';
import { SEASON_WEEKS } from '../src/game/types';

const state = createGame({ seed: 8080, countryIds: ['eng'], homeCountryId: 'eng' });
const rng = new Rng(8080);

// 어린 의뢰인 몇 명 확보
state.scouting.points = 999;
state.agent.cash = 5000;
for (let i = 0; i < 20 && Object.keys(state.clients).length < 5; i++) {
  for (const id of sweep(state, { ...DEFAULT_FILTERS, maxAge: 21 }, rng).found) {
    if (Object.keys(state.clients).length >= 5) break;
    approachPlayer(state, id, 8, rng);
  }
  state.scouting.points = 999;
}
console.log(`의뢰인 ${Object.keys(state.clients).length}명`);

const client = Object.values(state.clients)
  .map((c) => state.players[c.playerId])
  .find((p) => loanEligibility(state, p).ok);
if (!client) { console.log('임대 대상 없음'); process.exit(1); }

const parentId = client.clubId!;
const target = Object.values(state.clubs)
  .filter((c) => c.id !== parentId)
  .map((c) => ({ club: c, o: loanOutlook(state, client, c) }))
  .sort((a, b) => b.o.chance - a.o.chance)[0];
console.log(`${client.name} (${client.age}세, CA ${client.ca}) · ${state.clubs[parentId].name}`);
console.log(`  최적 임대처 ${target.club.name} (${target.club.tier}부) 성사 ${(target.o.chance * 100).toFixed(0)}% 주전 ${(target.o.playingChance * 100).toFixed(0)}% 주선료 ${target.o.fee}k`);

let result = arrangeLoan(state, client.id, target.club.id, rng);
for (let i = 0; i < 8 && !result.agreed; i++) result = arrangeLoan(state, client.id, target.club.id, rng);
console.log(`  ${result.message}`);
if (!result.agreed) process.exit(1);

// 세이브 왕복에서 임대가 완전 이적으로 굳지 않는지
const roundTripped = deserialize(serialize(state))!;
const rt = roundTripped.players[client.id];
console.log(`  세이브 왕복: 소속 ${roundTripped.clubs[rt.clubId!].name} · 계약 ${roundTripped.clubs[rt.contract!.clubId].name} · 임대 ${rt.loan ? '유지' : '사라짐'}`);
if (!rt.loan || rt.contract!.clubId !== parentId) { console.log('  ✗ 임대 정보가 왕복에서 깨졌습니다'); process.exit(1); }

const before = client.season.minutes;
for (let w = state.week; w <= SEASON_WEEKS; w++) advanceWeek(state, rng);
console.log(`  임대 기간 출전 ${before}분 → ${client.career.minutes}분(통산 적립)`);
console.log(`  복귀 후 소속: ${client.clubId ? state.clubs[client.clubId].name : '무소속'} · 임대 ${client.loan ? '유지' : '해제'}`);

const inSquads = Object.values(state.clubs).filter((c) => c.playerIds.includes(client.id));
console.log(`  스쿼드 등록: ${inSquads.map((c) => c.name).join(', ') || '없음'} (1곳이어야 정상)`);
if (inSquads.length !== 1 || client.loan) { console.log('  ✗ 복귀 처리 오류'); process.exit(1); }
console.log('✓ 임대 왕복 정상');
