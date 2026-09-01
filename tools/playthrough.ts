/**
 * 에이전트 루프 전체를 한 번 돌려 봅니다.
 * 스카우팅 → 대리인 계약 → 이적 협상 3단계 → 수수료 수령 → 시즌 진행.
 *   npm run play
 */

import { createGame } from '../src/game/newGame';
import { advanceWeek } from '../src/game/engine';
import { Rng } from '../src/game/rng';
import { DEFAULT_FILTERS, sweep, depthOf } from '../src/game/scouting';
import { approachEstimate, approachPlayer } from '../src/game/clients';
import {
  openNegotiation, proposeFee, proposeTerms, proposeCommission, completeNegotiation, transferOutlook,
} from '../src/game/negotiation';
import { estimateValue } from '../src/game/player';
import { isWindowOpen, AWARDS_WEEK } from '../src/game/types';
import { AWARD_LABELS } from '../src/game/awards';

const state = createGame({ seed: 424242, agentName: '박도현' });
const rng = new Rng(99);
const log = (...args: unknown[]) => console.log(...args);

log(`세계: ${state.countryIds.length}개국 · 구단 ${Object.keys(state.clubs).length} · 선수 ${Object.keys(state.players).length}`);
log(`시작 자금 ${state.agent.cash}k · 평판 ${state.agent.reputation}`);

// ── 1. 스카우팅 ─────────────────────────────────────────────────────────
let sweeps = 0;
while (Object.keys(state.scouting.reports).length < 20 && sweeps < 12) {
  const result = sweep(state, { ...DEFAULT_FILTERS, maxAge: 26 }, rng);
  if (result.found.length === 0) break;
  sweeps++;
  state.scouting.points += 14; // 테스트라 포인트는 무제한으로 둡니다
}
log(`\n스카우팅 ${sweeps}회 → ${Object.keys(state.scouting.reports).length}명 파악`);

// ── 2. 대리인 계약 ──────────────────────────────────────────────────────
const candidates = Object.keys(state.scouting.reports)
  .map((id) => state.players[id])
  .filter((p) => !p.agentId && p.clubId)
  .sort((a, b) => b.ca - a.ca);

let signed = 0;
for (const player of candidates) {
  if (signed >= 4) break;
  const estimate = approachEstimate(state, player, 9);
  const result = approachPlayer(state, player.id, 9, rng);
  if (result.signed) {
    signed++;
    log(`  ✓ ${player.name} (CA ${player.ca}, ${state.clubs[player.clubId!].name}) 확률 ${(estimate.chance * 100).toFixed(0)}%`);
  }
  if (!result.ok) { log(`  ! ${result.message}`); break; }
}
log(`의뢰인 ${Object.keys(state.clients).length}명 · 잔고 ${state.agent.cash.toFixed(0)}k`);
if (signed === 0) { log('의뢰인을 한 명도 못 구했습니다 — 초기 난도가 너무 높습니다.'); process.exit(1); }

// ── 3. 이적 협상 ────────────────────────────────────────────────────────
const clientId = Object.keys(state.clients)[0];
const client = state.players[clientId];
const currentClub = state.clubs[client.clubId!];
// 실제로 이 선수를 원하고 예산도 되는 구단을 고릅니다.
const target = Object.values(state.clubs)
  .filter((c) => c.id !== client.clubId)
  .map((c) => ({ club: c, outlook: transferOutlook(state, clientId, c.id) }))
  .filter((entry) => entry.outlook.affordable && entry.outlook.interest > 0.45)
  .sort((a, b) => b.club.reputation - a.club.reputation)[0]?.club;

if (!target) { log('적당한 행선지가 없습니다.'); process.exit(1); }
log(`\n${client.name} → ${target.name} (${currentClub.name} 에서, 가치 ${estimateValue(client)}k)`);
if (!isWindowOpen(state.week)) { log('이적시장이 닫혀 있습니다.'); process.exit(1); }

const opened = openNegotiation(state, clientId, target.id, 'transfer', rng);
log(`  협상 개시: ${opened.message}`);
const id = opened.negotiationId!;
const find = () => state.negotiations.find((n) => n.id === id)!;

/** 상한/하한을 모르는 채로 이분 탐색하듯 금액을 올려 봅니다. */
let fee = Math.round(estimateValue(client) * 0.8);
for (let attempt = 0; attempt < 10 && find()?.stage === 'fee'; attempt++) {
  const before = find().patience;
  const result = proposeFee(state, id, fee, rng);
  const now = find();
  log(`  이적료 ${fee}k → ${result.accepted ? '합의' : result.message} (인내심 ${before}→${now?.patience ?? 0})`);
  if (result.accepted) break;
  // 상대가 흘린 정보를 그대로 씁니다 — 플레이어가 화면에서 하는 것과 같습니다.
  if (now?.revealedSellerMinFee) fee = Math.max(fee, now.revealedSellerMinFee);
  else if (now?.revealedClubMaxFee) fee = Math.min(fee, now.revealedClubMaxFee);
  else fee = Math.round(fee * 1.2);
}
if (find()?.stage !== 'terms') { log('이적료 단계에서 막혔습니다.'); process.exit(1); }

let wage = find().wage;
for (let attempt = 0; attempt < 8 && find()?.stage === 'terms'; attempt++) {
  const result = proposeTerms(state, id, wage, 4, 0);
  log(`  주급 ${wage.toFixed(1)}k → ${result.accepted ? '합의' : result.message}`);
  if (result.accepted) break;
  const now = find();
  if (now?.revealedPlayerMinWage) wage = now.revealedPlayerMinWage;
  else if (now?.revealedClubMaxWage) wage = now.revealedClubMaxWage;
  else wage = Math.round(wage * 1.1 * 10) / 10;
}
if (find()?.stage !== 'commission') { log('조건 단계에서 막혔습니다.'); process.exit(1); }

// 구단이 밝힌 기준보다 조금 위를 찔러 본 뒤, 거절당하면 상한에 맞춥니다.
let pct = Math.round((find().revealedCommissionCap ?? 5) * 1.4 * 10) / 10;
for (let attempt = 0; attempt < 8 && find()?.stage === 'commission'; attempt++) {
  const result = proposeCommission(state, id, pct);
  log(`  수수료 ${pct}% → ${result.accepted ? '합의' : result.message}`);
  if (result.accepted) break;
  pct = find()?.revealedCommissionCap ?? Math.round((pct - 1) * 10) / 10;
}
if (find()?.stage !== 'agreed') { log('수수료 단계에서 막혔습니다.'); process.exit(1); }

const cashBefore = state.agent.cash;
const done = completeNegotiation(state, id);
log(`  ${done.message}`);
log(`  잔고 ${cashBefore.toFixed(0)}k → ${state.agent.cash.toFixed(0)}k · 평판 ${state.agent.reputation.toFixed(1)}`);
if (state.players[clientId].clubId !== target.id) { log('이적이 반영되지 않았습니다!'); process.exit(1); }

// ── 4. 두 시즌 진행 ─────────────────────────────────────────────────────
log('\n두 시즌 진행…');
let demandsSeen = 0;
let inbound = 0;
for (let week = 0; week < 88; week++) {
  const before = state.news.length;
  advanceWeek(state, rng);
  for (const item of state.news.slice(0, state.news.length - before)) {
    if (item.category === 'client') demandsSeen++;
    if (item.title === '영입 문의') inbound++;
  }
  // 요구는 무조건 첫 번째 선택지로 처리합니다.
  for (const c of Object.values(state.clients)) {
    for (const demand of c.demands) {
      if (demand.resolution) continue;
      const option = demand.options[0];
      if (option.cost <= state.agent.cash) {
        // 직접 호출하지 않고 엔진 함수를 씁니다.
        const { resolveDemand } = require('../src/game/clients');
        resolveDemand(state, c.playerId, demand.id, option.id, rng);
      }
    }
  }
  if (state.week === AWARDS_WEEK) {
    const mine = state.awards.filter((a) => a.season === state.season && a.wasClient);
    if (mine.length > 0) {
      log(`  [${state.season}] 의뢰인 수상: ${mine.map((a) => `${a.playerName} ${AWARD_LABELS[a.awardId]}`).join(', ')}`);
    }
  }
}

log(`\n결과`);
log(`  시즌 ${state.season} · ${state.week}주`);
log(`  자금 ${state.agent.cash.toFixed(0)}k · 평판 ${state.agent.reputation.toFixed(1)} · 라이선스 ${state.agent.licence}`);
log(`  의뢰인 ${Object.keys(state.clients).length}명 · 성사 ${state.agent.totals.deals}건 · 누적 수수료 ${state.agent.totals.commission.toFixed(0)}k`);
log(`  받은 요구 ${demandsSeen}건 · 구단 영입 문의 ${inbound}건 · 소식 ${state.news.length}건`);

const growthNews = state.news.filter((n) => n.title.includes('성장했습니다'));
log(`  성장 소식 ${growthNews.length}건`);
for (const item of growthNews.slice(0, 3)) log(`    ${item.title} — ${item.body}`);

// 시즌 기록은 롤오버에서 비워지므로 통산으로 확인합니다.
const ratings = Object.values(state.players)
  .filter((p) => p.career.apps > 0)
  .map((p) => p.career.ratingSum / p.career.apps);
log(`  통산 평점 범위 ${Math.min(...ratings).toFixed(2)} ~ ${Math.max(...ratings).toFixed(2)} (10점 만점)`);
