import { bestPosition, computeCA, marketValue, positionWeights } from './ability';
import { A, GROUP_ATTRS, H, PHYSICAL, type AttrGroup, type AttrKey } from './attributes';
import { pushMessage } from './inbox';
import { randomInjury } from './names';
import { Rng, clamp } from './rng';
import type { Club, GameState, Player, TrainingFocus } from './types';

export const FOCUS_LABEL: Record<TrainingFocus, string> = {
  balanced: '균형',
  tactical: '전술 이해도',
  attacking: '공격 패턴',
  defending: '수비 조직',
  physical: '피지컬',
  setpieces: '세트피스',
  recovery: '회복',
  matchPrep: '경기 준비',
};

export const FOCUS_HELP: Record<TrainingFocus, string> = {
  balanced: '모든 영역을 고르게 훈련합니다.',
  tactical: '전술 이해도가 빠르게 오릅니다. 성장은 조금 느립니다.',
  attacking: '공격 관련 능력치 성장에 집중합니다.',
  defending: '수비 관련 능력치 성장에 집중합니다.',
  physical: '피지컬 성장, 대신 체력 소모와 부상 위험이 큽니다.',
  setpieces: '코너킥·프리킥·페널티 능력치를 다집니다.',
  recovery: '체력 회복이 빨라집니다. 성장은 거의 없습니다.',
  matchPrep: '경기 감각이 오르고 다음 경기 준비에 집중합니다.',
};

const FOCUS_GROUP: Partial<Record<TrainingFocus, AttrGroup>> = {
  attacking: 'attacking',
  defending: 'defending',
  physical: 'physical',
  setpieces: 'setpieces',
};

interface ClubTraining {
  focus: TrainingFocus;
  intensity: 'low' | 'normal' | 'high';
  /** 1-20 combined coaching quality. */
  coaching: number;
  medical: number;
}

function trainingFor(state: GameState, club: Club): ClubTraining {
  if (club.id !== state.clubId) {
    return { focus: 'balanced', intensity: 'normal', coaching: (club.staffLevel + club.trainingFacilities) / 2, medical: club.staffLevel };
  }
  const coaches = state.staff.filter((s) => s.role === 'coach' || s.role === 'assistant' || s.role === 'fitness' || s.role === 'gkCoach');
  const physios = state.staff.filter((s) => s.role === 'physio');
  const coachLevel = coaches.length ? coaches.reduce((sum, s) => sum + s.ability, 0) / coaches.length : 6;
  // Too few coaches dilutes the work, however good they are.
  const coverage = Math.min(1, coaches.length / 5);
  return {
    focus: state.training.focus,
    intensity: state.training.intensity,
    coaching: (coachLevel * coverage + club.trainingFacilities) / 2,
    medical: physios.length ? Math.max(...physios.map((p) => p.ability)) + physios.length : 4,
  };
}

/** Daily: recovery, sharpness, injuries, tactical familiarity. */
export function dailyTraining(state: GameState, rng: Rng): void {
  Object.values(state.clubs).forEach((club) => {
    const t = trainingFor(state, club);
    const intensityRecovery = t.intensity === 'high' ? -2.5 : t.intensity === 'low' ? 2 : 0;
    const focusRecovery = t.focus === 'recovery' ? 4 : t.focus === 'physical' ? -2 : 0;
    const injuryRisk = 0.00045 * (t.intensity === 'high' ? 2 : t.intensity === 'low' ? 0.5 : 1) * (t.focus === 'physical' ? 1.6 : 1);

    [...club.playerIds, ...club.youthIds].forEach((id) => {
      const p = state.players[id];
      if (!p) return;
      if (p.injury) {
        // Good physios shave days off.
        p.injury.days -= rng.bool(t.medical / 40) ? 2 : 1;
        p.condition = Math.min(p.condition, 70);
        if (p.injury.days <= 0) {
          p.injury = null;
          p.condition = 75;
          p.sharpness = Math.max(30, p.sharpness - 20);
          if (club.id === state.clubId) {
            pushMessage(state, '의무팀', `${p.name} 부상 회복`, `${p.name}이(가) 부상에서 회복해 훈련에 복귀했습니다. 경기 감각을 끌어올릴 시간이 필요합니다.`, 'good', { type: 'player', id: p.id });
          }
        }
        return;
      }
      p.condition = clamp(p.condition + 6 + p.attrs[A.naturalFitness] * 0.35 + intensityRecovery + focusRecovery, 0, 100);
      p.sharpness = clamp(p.sharpness - 0.7 + (t.focus === 'matchPrep' ? 0.5 : 0) + (t.intensity === 'high' ? 0.2 : 0), 20, 100);
      if (rng.bool(injuryRisk * (0.5 + p.hidden[H.injuryProneness] / 12))) {
        const injury = randomInjury(rng, 0.8);
        p.injury = injury;
        if (club.id === state.clubId) {
          pushMessage(state, '의무팀', `훈련 중 부상 — ${p.name}`, `${p.name}이(가) 훈련 중 ${injury.name}을(를) 당했습니다. 예상 결장 기간: ${injury.days}일.`, 'bad', { type: 'player', id: p.id });
        }
      }
    });

    const tacticalGain = club.id === state.clubId ? (t.focus === 'tactical' ? 0.9 : 0.25) * (0.6 + t.coaching / 25) : 0.4;
    club.tactic.familiarity = clamp(club.tactic.familiarity + tacticalGain, 0, 100);
  });
}

function ageFactor(age: number): number {
  if (age <= 17) return 1.3;
  if (age <= 20) return 1.1;
  if (age <= 23) return 0.75;
  if (age <= 26) return 0.35;
  if (age <= 29) return 0.05;
  if (age <= 31) return -0.25;
  if (age <= 33) return -0.55;
  return -0.95;
}

/** Weekly: attribute growth and decline. */
export function weeklyDevelopment(state: GameState, rng: Rng): void {
  Object.values(state.clubs).forEach((club) => {
    const t = trainingFor(state, club);
    [...club.playerIds, ...club.youthIds].forEach((id) => {
      const p = state.players[id];
      if (p) develop(p, t, club, rng, state.season);
    });
  });
  // Free agents drift down without a club.
  Object.values(state.players).forEach((p) => {
    if (!p.clubId) develop(p, { focus: 'balanced', intensity: 'low', coaching: 3, medical: 3 }, null, rng, state.season);
  });
}

function develop(p: Player, t: ClubTraining, club: Club | null, rng: Rng, season: number): void {
  const af = ageFactor(p.age);
  const minutes = p.recentMinutes.length ? p.recentMinutes.reduce((s, m) => s + m, 0) / p.recentMinutes.length : 0;
  if (af > 0) {
    const gap = Math.max(0, p.pa - p.ca);
    const personality = 0.55 + p.hidden[H.professionalism] / 40 + p.attrs[A.determination] / 80;
    const quality = 0.75 + t.coaching / 40 + (club?.trainingFacilities ?? 5) / 40;
    const playing = p.youth ? 0.9 + (club?.youthFacilities ?? 5) / 60 : 0.8 + Math.min(1, minutes / 70) * 0.4;
    const focusMult = t.focus === 'recovery' ? 0.2 : t.focus === 'tactical' ? 0.75 : t.intensity === 'high' ? 1.2 : t.intensity === 'low' ? 0.8 : 1;
    p.growth += af * (Math.min(gap, 60) / 60) * personality * quality * playing * focusMult * 0.16 * rng.float(0.6, 1.4);
  } else {
    p.growth += af * 0.22 * (1.25 - p.attrs[A.naturalFitness] / 40) * rng.float(0.6, 1.4);
  }

  let changed = false;
  while (p.growth >= 1) {
    p.growth -= 1;
    if (improve(p, t, rng)) changed = true;
    else p.growth = 0;
  }
  while (p.growth <= -1) {
    p.growth += 1;
    decline(p, rng);
    changed = true;
  }
  if (changed) {
    p.ca = computeCA(p);
    p.value = marketValue(p, season);
  }
}

function improve(p: Player, t: ClubTraining, rng: Rng): boolean {
  if (p.ca >= p.pa) return false;
  const weights = positionWeights(bestPosition(p));
  const focusGroup = p.trainingFocus ?? FOCUS_GROUP[t.focus] ?? null;
  const focusAttrs = focusGroup ? GROUP_ATTRS[focusGroup] : [];
  const keys = Object.keys(weights) as AttrKey[];
  focusAttrs.forEach((k) => {
    if (!keys.includes(k)) keys.push(k);
  });
  const w = keys.map((k) => (weights[k] ?? 0.4) * (focusAttrs.includes(k) ? 2.5 : 1) * (p.attrs[A[k]] >= 20 ? 0 : 1));
  const key = rng.weighted(keys, w);
  p.attrs[A[key]] = Math.min(20, p.attrs[A[key]] + 1);
  if (computeCA(p) > p.pa + 2) {
    p.attrs[A[key]] -= 1;
    return false;
  }
  return true;
}

function decline(p: Player, rng: Rng): void {
  // Pace and stamina go first; experience keeps the mind sharp.
  const physical = PHYSICAL.filter((k) => p.attrs[A[k]] > 1);
  const key = rng.bool(0.75) && physical.length ? rng.pick(physical) : rng.pick(['technique', 'firstTouch', 'dribbling', 'finishing', 'reflexes'] as AttrKey[]);
  p.attrs[A[key]] = Math.max(1, p.attrs[A[key]] - 1);
  if (p.age >= 28 && rng.bool(0.25)) {
    const mental: AttrKey = rng.pick(['anticipation', 'decisions', 'positioning', 'composure', 'leadership']);
    p.attrs[A[mental]] = Math.min(20, p.attrs[A[mental]] + 1);
  }
}
