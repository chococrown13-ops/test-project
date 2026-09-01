/**
 * 능력치 → 경기력 환산.
 *
 * 경기 시뮬레이션은 능력치 47개를 매번 읽지 않습니다. 대신 여기서 한 번
 * 압축한 값(수비/중원/공격/골키핑)을 쓰고, 그 값은 주 단위로만 다시
 * 계산됩니다. 리그 24개를 한 화면에서 돌리려면 이 정도 절약이 필요합니다.
 */

import { clamp } from './rng';
import { ROLE_GROUP, type Role } from './attributes';
import type { Club, Player } from './types';

/** 컨디션 계수 — 폼·사기·체력이 실제 경기력을 얼마나 흔드는지. */
export function conditionFactor(player: Player): number {
  const form = 0.90 + (player.form / 100) * 0.20;
  const morale = 0.95 + (player.morale / 100) * 0.10;
  const fitness = 0.80 + (player.fitness / 100) * 0.20;
  return form * morale * fitness;
}

/** 해당 포지션에서 이 선수가 내는 실질 능력. 미숙한 자리에 서면 깎입니다. */
export function abilityInRole(player: Player, role: Role): number {
  const familiarity = player.positions[role] ?? familiarityFallback(player, role);
  const fit = 0.55 + (familiarity / 20) * 0.45;
  return player.ca * fit * conditionFactor(player);
}

/** 한 번도 서 본 적 없는 자리. 같은 라인이면 그나마 낫습니다. */
function familiarityFallback(player: Player, role: Role): number {
  if (ROLE_GROUP[role] === player.group) return 7;
  if (role === 'GK' || player.group === 'GK') return 1;
  return 3;
}

export interface TeamSnapshot {
  clubId: string;
  /** 선발 11인. 0번이 골키퍼입니다. */
  xi: string[];
  /** 벤치. 교체 투입 후보. */
  bench: string[];
  gk: number;
  def: number;
  mid: number;
  att: number;
  /** 공격력 / 수비력 종합. */
  attack: number;
  defence: number;
  /** 선수별 득점·도움 가중치. 합이 1 이 되도록 정규화되어 있습니다. */
  goalWeights: Array<{ id: string; w: number }>;
  assistWeights: Array<{ id: string; w: number }>;
}

/** 포메이션 슬롯. 팀 성향에 따라 셋 중 하나를 씁니다. */
const SHAPES: Record<Club['style'], Role[]> = {
  attacking: ['GK', 'DR', 'DC', 'DC', 'DL', 'MC', 'MC', 'AMR', 'AMC', 'AML', 'ST'],
  balanced: ['GK', 'DR', 'DC', 'DC', 'DL', 'DM', 'MC', 'MR', 'ML', 'AMC', 'ST'],
  defensive: ['GK', 'DR', 'DC', 'DC', 'DC', 'DL', 'DM', 'DM', 'MC', 'AMR', 'ST'],
};

/** 포지션별 득점 가중치. 스트라이커가 압도적으로 많이 넣습니다. */
const GOAL_WEIGHT: Record<Role, number> = {
  GK: 0.01, DR: 0.25, DC: 0.45, DL: 0.25, WBR: 0.3, WBL: 0.3,
  DM: 0.45, MR: 0.9, MC: 1.0, ML: 0.9, AMR: 1.9, AMC: 2.0, AML: 1.9, ST: 4.2,
};

/** 도움 가중치. 측면과 플레이메이커가 높습니다. */
const ASSIST_WEIGHT: Record<Role, number> = {
  GK: 0.05, DR: 0.7, DC: 0.25, DL: 0.7, WBR: 1.0, WBL: 1.0,
  DM: 0.8, MR: 1.9, MC: 1.5, ML: 1.9, AMR: 2.2, AMC: 2.6, AML: 2.2, ST: 1.5,
};

/** 출전 가능 여부. 부상자와 체력이 바닥난 선수는 제외합니다. */
function isAvailable(player: Player): boolean {
  return !player.retired && player.injuredWeeks <= 0;
}

/**
 * 감독 역할. 슬롯마다 가장 잘 맞는 선수를 그리디하게 배정합니다.
 * 체력이 낮으면 로테이션 대상이 되도록 가중치를 깎습니다.
 */
export function buildSnapshot(club: Club, players: Record<string, Player>): TeamSnapshot {
  const shape = SHAPES[club.style];
  const squad = club.playerIds
    .map((id) => players[id])
    .filter((p): p is Player => Boolean(p) && isAvailable(p));

  const taken = new Set<string>();
  const xi: string[] = [];
  const xiRoles: Role[] = [];

  for (const role of shape) {
    let best: Player | null = null;
    let bestScore = -Infinity;
    for (const player of squad) {
      if (taken.has(player.id)) continue;
      // 체력이 70 아래면 선발에서 밀립니다.
      const rotation = player.fitness < 70 ? 0.72 : 1;
      // 임대로 데려온 선수는 뛰게 하려고 데려온 것입니다. 같은 값이면 먼저 씁니다.
      const onLoan = player.loan ? 1.08 : 1;
      const score = abilityInRole(player, role) * rotation * onLoan;
      if (score > bestScore) { bestScore = score; best = player; }
    }
    if (!best) break;
    taken.add(best.id);
    xi.push(best.id);
    xiRoles.push(role);
  }

  const bench = squad.filter((p) => !taken.has(p.id))
    .sort((a, b) => b.ca - a.ca)
    .slice(0, 7)
    .map((p) => p.id);

  // 라인별 평균. 선수가 모자라면 리그 최저 수준으로 메웁니다.
  const lineAverage = (from: number, to: number): number => {
    let sum = 0;
    let count = 0;
    for (let i = from; i < Math.min(to, xi.length); i++) {
      sum += abilityInRole(players[xi[i]], xiRoles[i]);
      count++;
    }
    return count > 0 ? sum / count : 30;
  };

  const gk = xi.length > 0 ? abilityInRole(players[xi[0]], 'GK') : 30;
  const defenders = shape.filter((r) => ROLE_GROUP[r] === 'DF').length;
  const forwards = shape.filter((r) => ROLE_GROUP[r] === 'FW').length;
  const def = lineAverage(1, 1 + defenders);
  const mid = lineAverage(1 + defenders, shape.length - forwards);
  const att = lineAverage(shape.length - forwards, shape.length);

  const goalWeights = normalise(xi.map((id, i) => ({
    id,
    w: GOAL_WEIGHT[xiRoles[i]] * Math.pow(players[id].ca / 100, 1.6) * conditionFactor(players[id]),
  })));
  const assistWeights = normalise(xi.map((id, i) => ({
    id,
    w: ASSIST_WEIGHT[xiRoles[i]] * Math.pow(players[id].ca / 100, 1.3) * conditionFactor(players[id]),
  })));

  return {
    clubId: club.id,
    xi, bench, gk, def, mid, att,
    attack: att * 0.50 + mid * 0.34 + def * 0.16,
    defence: def * 0.48 + mid * 0.30 + gk * 0.22,
    goalWeights, assistWeights,
  };
}

function normalise(items: Array<{ id: string; w: number }>): Array<{ id: string; w: number }> {
  const total = items.reduce((sum, item) => sum + item.w, 0);
  if (total <= 0) return items.map((item) => ({ ...item, w: 1 / Math.max(1, items.length) }));
  return items.map((item) => ({ ...item, w: item.w / total }));
}

/** 구단 전력 — 순위 예상, 이적 판단, 리그 시드 배정에 쓰는 단일 수치. */
export function clubStrength(club: Club, players: Record<string, Player>): number {
  const squad = club.playerIds
    .map((id) => players[id])
    .filter((p): p is Player => Boolean(p))
    .sort((a, b) => b.ca - a.ca)
    .slice(0, 16);
  if (squad.length === 0) return 30;
  // 주전 11명에 무게를 더 둡니다.
  let sum = 0;
  let weight = 0;
  squad.forEach((p, i) => {
    const w = i < 11 ? 1 : 0.4;
    sum += p.ca * w;
    weight += w;
  });
  return clamp(sum / weight, 20, 200);
}
