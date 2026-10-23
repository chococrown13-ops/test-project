import { familiarityMult } from './ability';
import { A } from './attributes';
import { FORMATIONS, hungarian, pairSlots, type FormationId, type Position, type Slot } from './formations';
import { ROLE_BY_ID, defaultRole, roleScore, rolesFor } from './roles';
import type { Club, IpInstructions, Mentality, OopInstructions, Player, Tactic } from './types';

export const MENTALITY_LABEL: Record<Mentality, string> = {
  veryDefensive: '매우 수비적',
  defensive: '수비적',
  cautious: '신중',
  balanced: '균형',
  positive: '적극적',
  attacking: '공격적',
  veryAttacking: '매우 공격적',
};
export const MENTALITIES = Object.keys(MENTALITY_LABEL) as Mentality[];

/** -3 (very defensive) .. +3 (very attacking). */
export function mentalityValue(m: Mentality): number {
  return MENTALITIES.indexOf(m) - 3;
}

export const DEFAULT_IP: IpInstructions = {
  tempo: 'normal',
  passing: 'mixed',
  width: 'normal',
  finalThird: 'mixed',
  transition: 'patient',
};
export const DEFAULT_OOP: OopInstructions = {
  engagement: 'mid',
  line: 'normal',
  press: 'normal',
  tackling: 'normal',
  transition: 'regroup',
};

export interface TacticPreset {
  name: string;
  description: string;
  ipFormation: FormationId;
  oopFormation: FormationId;
  mentality: Mentality;
  ip: IpInstructions;
  oop: OopInstructions;
  /** Role overrides by position, applied where the slot allows them. */
  ipRoles?: Partial<Record<Position, string>>;
  oopRoles?: Partial<Record<Position, string>>;
}

export const PRESETS: TacticPreset[] = [
  {
    name: '점유형 빌드업',
    description: '4-3-3으로 막고 3-2-5로 공격. 짧은 패스로 상대를 끌어낸 뒤 침투.',
    ipFormation: '3-2-5',
    oopFormation: '4-3-3',
    mentality: 'positive',
    ip: { tempo: 'normal', passing: 'short', width: 'wide', finalThird: 'workIntoBox', transition: 'patient' },
    oop: { engagement: 'high', line: 'high', press: 'more', tackling: 'normal', transition: 'counterpress' },
    ipRoles: { DC: 'bpcb-ip', DM: 'dlp-ip', AMC: 'chm-ip', AML: 'w-ip', AMR: 'w-ip', ST: 'f9-ip' },
    oopRoles: { DM: 'sdm-oop', MC: 'pcm-oop', ST: 'tcf-oop' },
  },
  {
    name: '게겐프레싱',
    description: '공을 잃는 즉시 되찾는다. 높은 라인, 강한 압박, 빠른 템포.',
    ipFormation: '4-3-3',
    oopFormation: '4-3-3',
    mentality: 'attacking',
    ip: { tempo: 'fast', passing: 'mixed', width: 'normal', finalThird: 'mixed', transition: 'counter' },
    oop: { engagement: 'high', line: 'high', press: 'more', tackling: 'aggressive', transition: 'counterpress' },
    ipRoles: { MC: 'b2b-ip', AML: 'if-ip', AMR: 'if-ip', ST: 'cf-ip' },
    oopRoles: { MC: 'pcm-oop', DM: 'pdm-oop', ST: 'tcf-oop', DL: 'pfb-oop', DR: 'pfb-oop' },
  },
  {
    name: '빠른 역습',
    description: '내려앉아 버티다가 공을 뺏으면 아웃렛을 향해 곧장 달린다.',
    ipFormation: '4-2-3-1',
    oopFormation: '4-4-1-1',
    mentality: 'cautious',
    ip: { tempo: 'fast', passing: 'direct', width: 'normal', finalThird: 'mixed', transition: 'counter' },
    oop: { engagement: 'low', line: 'deep', press: 'less', tackling: 'normal', transition: 'regroup' },
    ipRoles: { AML: 'if-ip', AMR: 'w-ip', ST: 'cf-ip' },
    oopRoles: { ST: 'cocf-oop', AMC: 'coam-oop', ML: 'twm-oop', MR: 'twm-oop' },
  },
  {
    name: '측면 크로스',
    description: '넓게 벌려 윙어와 풀백이 크로스, 타겟맨 두 명이 마무리.',
    ipFormation: '4-4-2',
    oopFormation: '4-4-2',
    mentality: 'balanced',
    ip: { tempo: 'normal', passing: 'mixed', width: 'wide', finalThird: 'mixed', transition: 'patient' },
    oop: { engagement: 'mid', line: 'normal', press: 'normal', tackling: 'normal', transition: 'regroup' },
    ipRoles: { ML: 'w-ip', MR: 'w-ip', ST: 'tf-ip', DL: 'wb-ip', DR: 'wb-ip' },
    oopRoles: { ML: 'hwm-oop', MR: 'hwm-oop' },
  },
  {
    name: '선 굵은 축구',
    description: '롱볼로 미드필드를 건너뛰고 세컨드볼 싸움에서 이긴다.',
    ipFormation: '4-4-2',
    oopFormation: '4-4-2',
    mentality: 'balanced',
    ip: { tempo: 'fast', passing: 'direct', width: 'wide', finalThird: 'shootOnSight', transition: 'counter' },
    oop: { engagement: 'mid', line: 'normal', press: 'normal', tackling: 'aggressive', transition: 'regroup' },
    ipRoles: { ST: 'tf-ip', MC: 'b2b-ip' },
  },
  {
    name: '스리백 윙백',
    description: '5-3-2로 단단히 막고 공을 잡으면 윙백이 높이 올라 3-4-2-1.',
    ipFormation: '3-4-2-1',
    oopFormation: '5-3-2',
    mentality: 'balanced',
    ip: { tempo: 'normal', passing: 'mixed', width: 'wide', finalThird: 'workIntoBox', transition: 'patient' },
    oop: { engagement: 'mid', line: 'normal', press: 'normal', tackling: 'normal', transition: 'regroup' },
    ipRoles: { WBL: 'wb-ip', WBR: 'wb-ip', AMC: 'ss-ip', DC: 'cb-ip' },
  },
  {
    name: '낮은 블록',
    description: '5-4-1로 박스 앞을 걸어 잠그고 한 방을 노린다.',
    ipFormation: '4-4-1-1',
    oopFormation: '5-4-1',
    mentality: 'defensive',
    ip: { tempo: 'normal', passing: 'direct', width: 'normal', finalThird: 'mixed', transition: 'counter' },
    oop: { engagement: 'low', line: 'deep', press: 'less', tackling: 'stayOnFeet', transition: 'regroup' },
    oopRoles: { ST: 'cocf-oop', ML: 'twm-oop', MR: 'twm-oop' },
  },
  {
    name: '균형 4-2-3-1',
    description: '무리하지 않는 무난한 운영. 처음 팀을 맡았을 때 좋은 출발점.',
    ipFormation: '4-2-3-1',
    oopFormation: '4-4-1-1',
    mentality: 'balanced',
    ip: { ...DEFAULT_IP },
    oop: { ...DEFAULT_OOP },
  },
];

const copyShape = (slots: Slot[]): Slot[] => slots.map((s) => ({ ...s }));

/** The IP shape actually in use: the base formation plus any players moved by hand. */
export function ipSlotsOf(tactic: Tactic): Slot[] {
  return tactic.ipShape ?? FORMATIONS[tactic.ipFormation];
}

export function oopSlotsOf(tactic: Tactic): Slot[] {
  return tactic.oopShape ?? FORMATIONS[tactic.oopFormation];
}

/** True once a player has been moved off the base formation. */
export function isCustomShape(tactic: Tactic, phase: 'ip' | 'oop'): boolean {
  const shape = phase === 'ip' ? tactic.ipShape : tactic.oopShape;
  if (!shape) return false;
  const base = FORMATIONS[phase === 'ip' ? tactic.ipFormation : tactic.oopFormation];
  const used = new Set<number>();
  return !shape.every((s) => {
    const k = base.findIndex((b, i) => !used.has(i) && b.pos === s.pos && Math.hypot(b.x - s.x, b.y - s.y) < 1);
    if (k < 0) return false;
    used.add(k);
    return true;
  });
}

const SAME_SPOT = 7;

/**
 * Drag a player to a spot on the grid. Dropping onto a team-mate swaps the
 * two; dropping on an empty spot moves just that player, which is how
 * asymmetric shapes are built. `slot` is always the IP slot (= the player).
 */
export function moveSlot(tactic: Tactic, phase: 'ip' | 'oop', slot: number, target: Slot): void {
  if (target.pos === 'GK') return;
  if (phase === 'ip') {
    const shape = copyShape(ipSlotsOf(tactic));
    if (shape[slot].pos === 'GK') return;
    const other = shape.findIndex((s, i) => i !== slot && Math.hypot(s.x - target.x, s.y - target.y) < SAME_SPOT);
    if (other >= 0) {
      if (shape[other].pos === 'GK') return;
      // Swap both jobs: the slot indices stay with the players.
      [shape[slot], shape[other]] = [shape[other], shape[slot]];
      [tactic.ipRoles[slot], tactic.ipRoles[other]] = [tactic.ipRoles[other], tactic.ipRoles[slot]];
      [tactic.oopOf[slot], tactic.oopOf[other]] = [tactic.oopOf[other], tactic.oopOf[slot]];
    } else {
      shape[slot] = { pos: target.pos, x: target.x, y: target.y };
      if (!ROLE_BY_ID[tactic.ipRoles[slot]]?.positions.includes(target.pos)) tactic.ipRoles[slot] = defaultRole(target.pos, 'ip');
      tactic.familiarity = Math.max(0, tactic.familiarity - 2);
    }
    tactic.ipShape = shape;
    return;
  }
  const shape = copyShape(oopSlotsOf(tactic));
  const k = tactic.oopOf[slot];
  if (shape[k].pos === 'GK') return;
  const other = shape.findIndex((s, i) => i !== k && Math.hypot(s.x - target.x, s.y - target.y) < SAME_SPOT);
  if (other >= 0) {
    if (shape[other].pos === 'GK') return;
    const j = tactic.oopOf.indexOf(other);
    tactic.oopOf[slot] = other;
    tactic.oopOf[j] = k;
  } else {
    shape[k] = { pos: target.pos, x: target.x, y: target.y };
    if (!ROLE_BY_ID[tactic.oopRoles[k]]?.positions.includes(target.pos)) tactic.oopRoles[k] = defaultRole(target.pos, 'oop');
    tactic.familiarity = Math.max(0, tactic.familiarity - 2);
  }
  tactic.oopShape = shape;
}

export function makeTactic(preset: TacticPreset): Tactic {
  const ipSlots = FORMATIONS[preset.ipFormation];
  const oopSlots = FORMATIONS[preset.oopFormation];
  const ipRoles = ipSlots.map((slot) => pickRole(slot.pos, 'ip', preset.ipRoles));
  const oopRoles = oopSlots.map((slot) => pickRole(slot.pos, 'oop', preset.oopRoles));
  return {
    ipFormation: preset.ipFormation,
    oopFormation: preset.oopFormation,
    ipShape: copyShape(ipSlots),
    oopShape: copyShape(oopSlots),
    oopOf: pairSlots(ipSlots, oopSlots),
    lineup: ipSlots.map(() => null),
    ipRoles,
    oopRoles,
    bench: [],
    mentality: preset.mentality,
    ip: { ...preset.ip },
    oop: { ...preset.oop },
    captain: null,
    penaltyTaker: null,
    setPieceTaker: null,
    familiarity: 80,
  };
}

function pickRole(pos: Position, phase: 'ip' | 'oop', overrides?: Partial<Record<Position, string>>): string {
  const wanted = overrides?.[pos];
  if (wanted && rolesFor(pos, phase).some((r) => r.id === wanted)) return wanted;
  return defaultRole(pos, phase);
}

/** Swap the IP shape, keeping each player in the nearest new slot. Re-picking the current formation undoes hand-moved players. */
export function changeIpFormation(tactic: Tactic, formation: FormationId): void {
  if (tactic.ipFormation === formation && !isCustomShape(tactic, 'ip')) return;
  const before = ipSlotsOf(tactic);
  const after = FORMATIONS[formation];
  const moved = pairSlots(before, after);
  const lineup: (string | null)[] = after.map(() => null);
  const roles = after.map((slot) => defaultRole(slot.pos, 'ip'));
  moved.forEach((newSlot, oldSlot) => {
    lineup[newSlot] = tactic.lineup[oldSlot] ?? null;
    const oldRole = ROLE_BY_ID[tactic.ipRoles[oldSlot]];
    if (oldRole && oldRole.positions.includes(after[newSlot].pos)) roles[newSlot] = oldRole.id;
  });
  tactic.ipFormation = formation;
  tactic.ipShape = copyShape(after);
  tactic.lineup = lineup;
  tactic.ipRoles = roles;
  tactic.oopOf = pairSlots(after, oopSlotsOf(tactic));
  tactic.familiarity = Math.min(tactic.familiarity, 55);
}

export function changeOopFormation(tactic: Tactic, formation: FormationId): void {
  if (tactic.oopFormation === formation && !isCustomShape(tactic, 'oop')) return;
  const before = oopSlotsOf(tactic);
  const after = FORMATIONS[formation];
  const roles = after.map((slot) => defaultRole(slot.pos, 'oop'));
  const moved = pairSlots(before, after);
  moved.forEach((newSlot, oldSlot) => {
    const oldRole = ROLE_BY_ID[tactic.oopRoles[oldSlot]];
    if (oldRole && oldRole.positions.includes(after[newSlot].pos)) roles[newSlot] = oldRole.id;
  });
  tactic.oopFormation = formation;
  tactic.oopShape = copyShape(after);
  tactic.oopRoles = roles;
  tactic.oopOf = pairSlots(ipSlotsOf(tactic), after);
  tactic.familiarity = Math.min(tactic.familiarity, 60);
}

export function available(player: Player): boolean {
  return !player.injury && player.suspension === 0;
}

/**
 * How well a player fits IP slot `slot` of this tactic, combining both of the
 * slot's jobs, position familiarity in each, and his condition.
 */
export function slotFit(player: Player, tactic: Tactic, slot: number): number {
  const ipSlot = ipSlotsOf(tactic)[slot];
  const oopSlot = oopSlotsOf(tactic)[tactic.oopOf[slot]];
  const ipRole = ROLE_BY_ID[tactic.ipRoles[slot]];
  const oopRole = ROLE_BY_ID[tactic.oopRoles[tactic.oopOf[slot]]];
  const ipScore = ipRole ? roleScore(player.attrs, ipRole) : 10;
  const oopScore = oopRole ? roleScore(player.attrs, oopRole) : 10;
  const famIp = familiarityMult(player.positions[ipSlot.pos] ?? 1);
  const famOop = familiarityMult(player.positions[oopSlot.pos] ?? 1);
  return (ipScore * 0.55 * famIp + oopScore * 0.45 * famOop) * (player.ca / 100 + 0.6);
}

/**
 * Pick the strongest XI and bench for the tactic (optimal assignment), then
 * nudge for rotation: a tired player loses out to a fresh one of similar level.
 */
export function autoSelect(club: Club, players: Record<string, Player>, opts: { rotate?: boolean } = {}): void {
  const tactic = club.tactic;
  const squad = club.playerIds.map((id) => players[id]).filter((p): p is Player => !!p && available(p));
  const slots = ipSlotsOf(tactic);
  const n = Math.max(squad.length, slots.length);
  const cost: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      if (i >= slots.length || j >= squad.length) {
        row.push(0);
        continue;
      }
      const player = squad[j];
      const isKeeperSlot = slots[i].pos === 'GK';
      const isKeeper = (player.positions.GK ?? 0) >= 15;
      if (isKeeperSlot !== isKeeper) {
        row.push(1000);
        continue;
      }
      let fit = slotFit(player, tactic, i);
      const tired = player.condition < 80 ? (80 - player.condition) * 0.15 : 0;
      fit -= opts.rotate ? tired : tired * 0.4;
      fit -= (100 - player.sharpness) * 0.01;
      row.push(-fit);
    }
    cost.push(row);
  }
  const assignment = hungarian(cost);
  tactic.lineup = slots.map((_, i) => {
    const j = assignment[i];
    return j < squad.length && cost[i][j] < 500 ? squad[j].id : null;
  });

  const chosen = new Set(tactic.lineup.filter((id): id is string => !!id));
  const rest = squad.filter((p) => !chosen.has(p.id)).sort((a, b) => b.ca - a.ca);
  const bench: string[] = [];
  const keeper = rest.find((p) => (p.positions.GK ?? 0) >= 15);
  if (keeper) bench.push(keeper.id);
  for (const p of rest) {
    if (bench.length >= 9) break;
    if (p.id !== keeper?.id && (p.positions.GK ?? 0) < 15) bench.push(p.id);
  }
  tactic.bench = bench;

  // Captain and takers default to the obvious choices.
  const xi = tactic.lineup.map((id) => (id ? players[id] : null)).filter((p): p is Player => !!p);
  if (!tactic.captain || !chosen.has(tactic.captain)) {
    tactic.captain = [...xi].sort((a, b) => b.attrs[A.leadership] + b.age / 3 - (a.attrs[A.leadership] + a.age / 3))[0]?.id ?? null;
  }
  if (!tactic.penaltyTaker || !chosen.has(tactic.penaltyTaker)) {
    tactic.penaltyTaker = [...xi].sort((a, b) => b.attrs[A.penalty] + b.attrs[A.composure] - (a.attrs[A.penalty] + a.attrs[A.composure]))[0]?.id ?? null;
  }
  if (!tactic.setPieceTaker || !chosen.has(tactic.setPieceTaker)) {
    tactic.setPieceTaker = [...xi].sort((a, b) => b.attrs[A.corners] + b.attrs[A.freeKick] - (a.attrs[A.corners] + a.attrs[A.freeKick]))[0]?.id ?? null;
  }
}

/** Lineup problems worth flagging before kick-off. */
export function lineupIssues(club: Club, players: Record<string, Player>): string[] {
  const issues: string[] = [];
  const tactic = club.tactic;
  const slots = ipSlotsOf(tactic);
  tactic.lineup.forEach((id, i) => {
    if (!id) {
      issues.push(`${slots[i].pos} 자리가 비어 있습니다.`);
      return;
    }
    const p = players[id];
    if (!p || p.clubId !== club.id) issues.push('명단에 없는 선수가 있습니다.');
    else if (p.injury) issues.push(`${p.name} — 부상 (${p.injury.name})`);
    else if (p.suspension > 0) issues.push(`${p.name} — 출전 정지`);
  });
  return issues;
}
