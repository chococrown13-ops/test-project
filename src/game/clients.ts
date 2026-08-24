/**
 * 의뢰인 관리.
 *
 * 에이전트 게임의 심장입니다. 선수에게 접근해 대리인 계약을 따내고, 그
 * 선수가 불만을 터뜨릴 때마다 어떻게든 수습합니다. 신뢰가 바닥나면 선수는
 * 다른 에이전트에게 갑니다.
 */

import { Rng, clamp } from './rng';
import { COUNTRY_BY_ID } from '../data/countries';
import { PERSONALITY_BY_ID, expectedWage } from './player';
import { adjustReputation, clientLimit, ledger, relationWith } from './agent';
import { depthOf } from './scouting';
import { SEASON_WEEKS, isWindowOpen, type Client, type ClientDemand, type DemandOption, type GameState, type Player } from './types';

/** 신뢰도가 이 아래로 떨어지면 떠날 준비를 합니다. */
export const TRUST_DANGER = 22;

// ── 영입 ────────────────────────────────────────────────────────────────

export interface ApproachEstimate {
  chance: number;
  reasons: string[];
}

/**
 * 대리인 계약 제안의 성공 확률. 수수료를 낮게 부를수록 잘 받아들이지만,
 * 그만큼 나중에 들어오는 돈이 줄어듭니다.
 */
export function approachEstimate(state: GameState, player: Player, commissionPct: number): ApproachEstimate {
  const personality = PERSONALITY_BY_ID[player.personality];
  const reasons: string[] = [];
  let chance = 0.34;

  const repGap = state.agent.reputation - clamp((player.ca - 60) / 1.1, 0, 100);
  chance += clamp(repGap / 180, -0.35, 0.3);
  if (repGap < -20) reasons.push('당신의 평판으로는 급이 높은 선수입니다');
  else if (repGap > 20) reasons.push('당신의 이름값이 통합니다');

  if (player.agentId) {
    chance -= 0.22;
    reasons.push('이미 다른 에이전트가 있습니다');
  } else {
    chance += 0.08;
    reasons.push('대리인이 없는 선수입니다');
  }

  // 수수료 — 기준은 8%. 낮게 부를수록 잘 넘어옵니다.
  const commissionEdge = (8 - commissionPct) / 100;
  chance += commissionEdge * (personality.wageGreed > 1.1 ? 4.5 : 2.6);
  if (commissionPct <= 5) reasons.push('낮은 수수료가 매력적입니다');
  if (commissionPct >= 12) reasons.push('수수료가 부담스럽다는 반응입니다');

  const depth = depthOf(state, player.id);
  chance += (depth / 100) * 0.16;
  if (depth < 40) reasons.push('선수를 충분히 파악하지 못했습니다');

  if (player.morale < 40) {
    chance += 0.1;
    reasons.push('현재 상황에 불만이 있습니다');
  }
  if (!player.clubId) {
    chance += 0.12;
    reasons.push('소속팀을 찾고 있습니다');
  }

  return { chance: clamp(chance, 0.03, 0.94), reasons };
}

export interface ApproachResult {
  ok: boolean;
  signed: boolean;
  message: string;
}

export function approachPlayer(
  state: GameState, playerId: string, commissionPct: number, rng: Rng,
): ApproachResult {
  const player = state.players[playerId];
  if (!player) return { ok: false, signed: false, message: '선수를 찾을 수 없습니다.' };
  if (player.retired) return { ok: false, signed: false, message: '은퇴한 선수입니다.' };
  if (state.clients[playerId]) return { ok: false, signed: false, message: '이미 당신의 의뢰인입니다.' };
  if (Object.keys(state.clients).length >= clientLimit(state)) {
    return { ok: false, signed: false, message: `라이선스 등급 ${state.agent.licence} 정원(${clientLimit(state)}명)이 찼습니다.` };
  }

  // 접근 비용 — 만나러 가는 데도 돈이 듭니다.
  const cost = Math.round(8 + player.ca / 6);
  if (state.agent.cash < cost) {
    return { ok: false, signed: false, message: `접촉 비용 ${cost}k 이 모자랍니다.` };
  }
  ledger(state, `${player.name} 접촉 비용`, -cost);

  const { chance } = approachEstimate(state, player, commissionPct);
  if (!rng.bool(chance)) {
    return { ok: true, signed: false, message: `${player.name} 측이 제안을 거절했습니다.` };
  }

  signClient(state, player, commissionPct, rng);
  return { ok: true, signed: true, message: `${player.name} 와 대리인 계약을 맺었습니다.` };
}

export function signClient(state: GameState, player: Player, commissionPct: number, rng: Rng): Client {
  const client: Client = {
    playerId: player.id,
    since: state.season,
    until: state.season + rng.int(2, 4),
    trust: rng.int(52, 68),
    commissionPct,
    demands: [],
  };
  state.clients[player.id] = client;
  player.agentId = 'you';
  adjustReputation(state, 0.4);
  return client;
}

/** 의뢰인을 놓아 줍니다. */
export function dropClient(state: GameState, playerId: string, voluntary: boolean): void {
  const player = state.players[playerId];
  delete state.clients[playerId];
  if (player && player.agentId === 'you') player.agentId = null;
  adjustReputation(state, voluntary ? -0.5 : -2.2);
}

// ── 요구 사항 ───────────────────────────────────────────────────────────

let demandCounter = 0;
const nextDemandId = (): string => `d${Date.now().toString(36)}${(demandCounter++).toString(36)}`;

interface DemandContext {
  state: GameState;
  player: Player;
  client: Client;
  rng: Rng;
}

/** 옵션 하나를 만드는 도우미. 확률은 평판·관계·신뢰에서 계산합니다. */
function option(
  id: string, label: string, hint: string,
  chance: number, trustOnSuccess: number, trustOnFail: number, cost: number,
): DemandOption {
  return { id, label, hint, chance: clamp(chance, 0.05, 0.96), trustOnSuccess, trustOnFail, cost };
}

function clubRelation(ctx: DemandContext): number {
  return ctx.player.clubId ? relationWith(ctx.state, ctx.player.clubId) : 40;
}

function buildDemand(ctx: DemandContext): ClientDemand | null {
  const { state, player, rng } = ctx;
  const relation = clubRelation(ctx);
  const rep = state.agent.reputation;
  const personality = PERSONALITY_BY_ID[player.personality];
  const club = player.clubId ? state.clubs[player.clubId] : null;
  const country = club ? COUNTRY_BY_ID[club.countryId] : null;
  const seasonProgress = state.week / SEASON_WEEKS;

  const base = {
    id: nextDemandId(),
    createdWeek: state.week,
    deadlineWeek: state.week + rng.int(3, 6),
    options: [] as DemandOption[],
  };

  // 1) 계약 만료가 코앞 — 가장 급합니다.
  if (player.contract && player.contract.expires <= state.season && club) {
    return {
      ...base,
      kind: 'renewal',
      title: '계약이 이번 시즌으로 끝납니다',
      body: `${club.name} 와의 계약이 이번 시즌 종료와 함께 만료됩니다. ${player.name} 은(는) 다음 행선지를 당신이 정리해 주기를 기대하고 있습니다.`,
      options: [
        option('renew', '현 구단과 재계약 추진', `구단 관계 ${Math.round(relation)} 이 성패를 가릅니다`, 0.28 + relation / 220 + rep / 300, 12, -10, 0),
        option('market', '시장에 내놓겠다고 안심시키기', '실제 이적은 따로 진행해야 합니다', 0.62 + rep / 400, 5, -8, 0),
        option('wait', '아직 기다려 보자고 설득', '선수는 답답해합니다', 0.5, 2, -12, 0),
      ],
    };
  }

  // 2) 출전 시간 — 시즌이 어느 정도 지나야 판단할 수 있습니다.
  const expectedMinutes = seasonProgress * 2100;
  if (club && seasonProgress > 0.25 && player.season.minutes < expectedMinutes * 0.42) {
    return {
      ...base,
      kind: 'playing-time',
      title: '출전 시간이 너무 적습니다',
      body: `${player.name} 은(는) 올 시즌 ${player.season.minutes}분밖에 뛰지 못했습니다. ${club.name} 감독과 이야기해 달라고 합니다.`,
      options: [
        option('talk', '감독과 면담 잡기', `구단 관계 ${Math.round(relation)}`, 0.22 + relation / 190 + rep / 320, 14, -9, 8),
        option('press', '언론에 흘려 압박하기', '성공하면 확실하지만 관계가 상합니다', 0.34 + rep / 260, 16, -14, 0),
        option('patience', '조금만 참으라고 달래기', '근성 있는 선수라면 통합니다', 0.3 + player.attributes.determination / 45, 6, -10, 0),
      ],
    };
  }

  // 3) 주급 — 시장가보다 한참 낮으면 화가 납니다.
  if (club && country && player.contract) {
    const market = expectedWage(player, club.reputation, country);
    if (player.contract.wage < market * 0.62) {
      return {
        ...base,
        kind: 'wage',
        title: '주급이 시장가에 못 미칩니다',
        body: `현재 주급 ${player.contract.wage.toFixed(1)}k 은 비슷한 수준의 선수보다 낮습니다. 시장가는 ${market.toFixed(1)}k 선입니다.`,
        options: [
          option('renegotiate', '구단에 인상 요구', `구단 관계 ${Math.round(relation)}`, 0.2 + relation / 200 + rep / 300, 15, -10, 0),
          option('bonus', '내 몫을 얹어 달래기', `사비 ${Math.round(market * 3)}k 지출`, 0.85, 8, -6, Math.round(market * 3)),
          option('explain', '지금은 때가 아니라고 설명', '', 0.45 + personality.loyalty / 300, 4, -11, 0),
        ],
      };
    }
  }

  // 4) 이적 요구 — 야심가가 자기 급보다 낮은 팀에 있을 때.
  if (club && personality.ambition > 60 && player.ca > club.reputation * 1.35 + 20) {
    return {
      ...base,
      kind: 'transfer',
      title: '더 큰 무대로 가고 싶어 합니다',
      body: `${player.name} 은(는) ${club.name} 이 자신의 수준에 맞지 않는다고 느낍니다. 다음 이적시장에서 움직여 달라고 합니다.`,
      options: [
        option('promise', '이적을 추진하겠다고 약속', '실제로 성사시키지 못하면 신뢰가 크게 깎입니다', 0.9, 10, -4, 0),
        option('sound', '관심 있는 구단을 알아보겠다', '', 0.6 + rep / 250, 7, -7, 0),
        option('refuse', '지금은 남는 게 낫다고 설득', '', 0.28 + personality.loyalty / 200, 5, -16, 0),
      ],
    };
  }

  // 5) 징계 · 사기 문제
  if (player.morale < 34 || player.season.red > 0) {
    return {
      ...base,
      kind: 'discipline',
      title: '팀 안에서 문제가 생겼습니다',
      body: `${player.name} 이(가) 팀 분위기에 적응하지 못하고 있습니다. 구단에서 당신에게 연락이 왔습니다.`,
      options: [
        option('mediate', '구단과 선수 사이 중재', `구단 관계 ${Math.round(relation)}`, 0.3 + relation / 210 + rep / 320, 12, -8, 4),
        option('coach', '멘탈 코치를 붙이기', '비용이 듭니다', 0.78, 9, -4, 60),
        option('ignore', '알아서 풀리게 두기', '', 0.35, 2, -12, 0),
      ],
    };
  }

  // 6) 개인적인 일 — 무작위로 찾아옵니다.
  if (rng.bool(0.5)) {
    const troubles = [
      { title: '가족 문제로 흔들립니다', body: '고향에 일이 생겨 집중하지 못하고 있습니다.' },
      { title: '이사 문제로 골치입니다', body: '새 도시에 적응하지 못해 훈련에 늦는 일이 잦습니다.' },
      { title: '스폰서 계약 분쟁', body: '용품 후원사와의 조건을 두고 다투고 있습니다.' },
      { title: '언론과 마찰이 있습니다', body: '인터뷰 발언이 잘못 전해져 여론이 나빠졌습니다.' },
    ];
    const trouble = rng.pick(troubles);
    return {
      ...base,
      kind: 'personal',
      title: trouble.title,
      body: `${trouble.body} ${player.name} 은(는) 당신이 정리해 주기를 바랍니다.`,
      options: [
        option('handle', '직접 나서서 처리', '', 0.55 + rep / 240, 11, -7, 12),
        option('hire', '전문가에게 맡기기', '확실하지만 비쌉니다', 0.9, 8, -3, 90),
        option('later', '나중에 보자고 미루기', '', 0.3, 1, -10, 0),
      ],
    };
  }

  return null;
}

export interface ResolveResult {
  ok: boolean;
  success: boolean;
  message: string;
}

export function resolveDemand(
  state: GameState, playerId: string, demandId: string, optionId: string, rng: Rng,
): ResolveResult {
  const client = state.clients[playerId];
  const player = state.players[playerId];
  if (!client || !player) return { ok: false, success: false, message: '의뢰인을 찾을 수 없습니다.' };
  const demand = client.demands.find((d) => d.id === demandId && !d.resolution);
  if (!demand) return { ok: false, success: false, message: '이미 처리된 요구입니다.' };
  const choice = demand.options.find((o) => o.id === optionId);
  if (!choice) return { ok: false, success: false, message: '선택지를 찾을 수 없습니다.' };
  if (choice.cost > state.agent.cash) {
    return { ok: false, success: false, message: `자금이 ${Math.round(choice.cost - state.agent.cash)}k 모자랍니다.` };
  }

  if (choice.cost > 0) ledger(state, `${player.name} — ${demand.title}`, -choice.cost);

  const success = rng.bool(choice.chance);
  demand.resolution = success ? 'success' : 'fail';
  client.trust = clamp(client.trust + (success ? choice.trustOnSuccess : choice.trustOnFail), 0, 100);

  if (success) {
    player.morale = clamp(player.morale + 10, 0, 100);
    adjustReputation(state, 0.25);
  } else {
    player.morale = clamp(player.morale - 6, 0, 100);
  }

  // 언론 압박은 성패와 무관하게 구단 관계를 깎습니다.
  if (optionId === 'press' && player.clubId) {
    state.agent.clubRelations[player.clubId] = clamp(relationWith(state, player.clubId) - 12, 0, 100);
  }

  return {
    ok: true,
    success,
    message: success ? '잘 풀렸습니다.' : '뜻대로 되지 않았습니다.',
  };
}

// ── 주간 처리 ───────────────────────────────────────────────────────────

export interface ClientTickEvent {
  kind: 'demand' | 'left' | 'expired' | 'contract-end';
  playerId: string;
  playerName: string;
  text: string;
}

/** 매주 의뢰인들의 상태를 갱신합니다. */
export function weeklyClientTick(state: GameState, rng: Rng): ClientTickEvent[] {
  const events: ClientTickEvent[] = [];

  for (const client of Object.values(state.clients)) {
    const player = state.players[client.playerId];
    if (!player) { delete state.clients[client.playerId]; continue; }

    if (player.retired) {
      events.push({ kind: 'left', playerId: player.id, playerName: player.name, text: `${player.name} 이(가) 은퇴하며 대리인 계약이 끝났습니다.` });
      dropClient(state, player.id, true);
      continue;
    }

    // 마감이 지난 요구는 자동 실패입니다.
    for (const demand of client.demands) {
      if (demand.resolution || state.week <= demand.deadlineWeek) continue;
      demand.resolution = 'expired';
      client.trust = clamp(client.trust - 14, 0, 100);
      player.morale = clamp(player.morale - 8, 0, 100);
      events.push({
        kind: 'expired', playerId: player.id, playerName: player.name,
        text: `${player.name} 의 요구("${demand.title}")를 방치했습니다. 신뢰가 크게 떨어졌습니다.`,
      });
    }

    // 신뢰는 경기력과 대우를 따라 천천히 움직입니다.
    const happy = player.morale > 62 && player.season.minutes > 0;
    client.trust = clamp(client.trust + (happy ? 0.6 : -0.35), 0, 100);

    // 새 요구 — 이미 미해결 건이 있으면 쌓아 두지 않습니다.
    const open = client.demands.filter((d) => !d.resolution).length;
    const personality = PERSONALITY_BY_ID[player.personality];
    if (open === 0 && rng.bool(0.055 * personality.volatility)) {
      const demand = buildDemand({ state, player, client, rng });
      if (demand) {
        client.demands.unshift(demand);
        if (client.demands.length > 25) client.demands.length = 25;
        events.push({
          kind: 'demand', playerId: player.id, playerName: player.name,
          text: `${player.name}: ${demand.title}`,
        });
      }
    }

    // 신뢰가 바닥나면 떠납니다.
    if (client.trust <= TRUST_DANGER && rng.bool(0.16)) {
      events.push({
        kind: 'left', playerId: player.id, playerName: player.name,
        text: `${player.name} 이(가) 당신을 떠나 다른 에이전트와 계약했습니다.`,
      });
      player.agentId = rng.pick(['ai1', 'ai2', 'ai3', 'ai4', 'ai5']);
      dropClient(state, player.id, false);
      continue;
    }

    // 대리인 계약 만료
    if (client.until < state.season) {
      const renew = rng.bool(clamp(client.trust / 110, 0.05, 0.92));
      if (renew) {
        client.until = state.season + rng.int(2, 4);
      } else {
        events.push({
          kind: 'contract-end', playerId: player.id, playerName: player.name,
          text: `${player.name} 과의 대리인 계약이 갱신되지 않았습니다.`,
        });
        dropClient(state, player.id, false);
      }
    }
  }

  return events;
}

/** 지금 이적을 추진할 수 있는지 — 이적시장이 열려 있어야 합니다. */
export const canTrade = (state: GameState): boolean => isWindowOpen(state.week);
