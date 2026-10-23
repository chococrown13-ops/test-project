import { bestPosition, caStars, formatMoney, wageDemand } from './ability';
import { POS_LABEL } from './formations';
import { knowledgeOf } from './generate';
import { nextId, pushMessage } from './inbox';
import { Rng, clamp } from './rng';
import { ROLE_BY_ID, roleScore } from './roles';
import { askingPrice } from './transfers';
import type { GameState, Pitch, Player, Requirement, ScoutAssignment } from './types';

/**
 * Scouting knowledge hides attributes until it is high enough. Scouts sent
 * to a division, the free-agent pool or a single player raise it day by day.
 * FM26 Requirements work the other way round: you post what you need and
 * clubs and agents pitch players at you.
 */

export function scoutAbility(state: GameState, staffId: string): number {
  return state.staff.find((s) => s.id === staffId)?.ability ?? 8;
}

export function assign(state: GameState, staffId: string, target: ScoutAssignment['target'], days = 28): ScoutAssignment {
  state.assignments = state.assignments.filter((a) => a.staffId !== staffId);
  const assignment: ScoutAssignment = { id: nextId(state, 'sa'), staffId, target, daysLeft: days };
  state.assignments.push(assignment);
  return assignment;
}

function learn(state: GameState, player: Player, amount: number): void {
  state.knowledge[player.id] = clamp(knowledgeOf(state, player) + amount, 0, 100);
}

function ourLevel(state: GameState): number {
  const club = state.clubs[state.clubId];
  const xi = club.tactic.lineup.map((id) => (id ? state.players[id] : null)).filter((p): p is Player => !!p);
  return xi.length ? xi.reduce((s, p) => s + p.ca, 0) / xi.length : 90;
}

/** Scout's verdict: A (sign him), B (useful), C (not for us). Noisy for weak scouts. */
export function recommendation(state: GameState, player: Player, ability = 12, rng?: Rng): 'A' | 'B' | 'C' {
  const noise = rng ? rng.normal(0, (21 - ability) * 0.8) : 0;
  const level = ourLevel(state);
  const ca = player.ca + noise;
  const pa = player.pa + noise;
  if (ca >= level + 6 || (player.age <= 21 && pa >= level + 18)) return 'A';
  if (ca >= level - 4 || (player.age <= 21 && pa >= level + 5)) return 'B';
  return 'C';
}

export function dailyScouting(state: GameState, rng: Rng): void {
  const done: ScoutAssignment[] = [];
  state.assignments.forEach((a) => {
    const ability = scoutAbility(state, a.staffId);
    let targets: Player[] = [];
    const t = a.target;
    if (t.type === 'player') {
      const p = state.players[t.playerId];
      if (p) learn(state, p, 12 + ability);
      if (!p || knowledgeOf(state, p) >= 100) a.daysLeft = 0;
    } else {
      const pool = Object.values(state.players).filter((p) => {
        if (p.clubId === state.clubId || p.youth) return false;
        if (t.type === 'free') return !p.clubId;
        if (t.type === 'division') return !!p.clubId && state.clubs[p.clubId]?.division === t.division;
        if (t.type === 'requirement') {
          const req = state.requirements.find((r) => r.id === t.id);
          return !!req && (p.positions[req.position] ?? 0) >= 15 && p.age >= req.minAge && p.age <= req.maxAge;
        }
        return false;
      });
      for (let i = 0; i < 3 && pool.length; i++) targets.push(pool[rng.int(0, pool.length - 1)]);
      targets.forEach((p) => learn(state, p, 18 + ability * 1.5));
    }
    a.daysLeft -= 1;
    if (a.daysLeft <= 0) done.push(a);
  });

  done.forEach((a) => {
    state.assignments = state.assignments.filter((x) => x.id !== a.id);
    const scout = state.staff.find((s) => s.id === a.staffId);
    if (!scout) return;
    if (a.target.type === 'player') {
      const p = state.players[a.target.playerId];
      if (p) {
        const grade = recommendation(state, p, scout.ability, rng);
        pushMessage(state, scout.name, `스카우트 보고서 — ${p.name}`, reportText(state, p, grade), 'neutral', { type: 'player', id: p.id });
      }
      return;
    }
    // Area report: the best few the scout has now seen.
    const seen = Object.values(state.players)
      .filter((p) => p.clubId !== state.clubId && !p.youth && (state.knowledge[p.id] ?? 0) >= 60)
      .filter((p) => {
        const t = a.target;
        if (t.type === 'free') return !p.clubId;
        if (t.type === 'division') return !!p.clubId && state.clubs[p.clubId]?.division === t.division;
        return true;
      })
      .map((p) => ({ p, grade: recommendation(state, p, scout.ability, rng) }))
      .filter((x) => x.grade !== 'C')
      .sort((x, y) => (x.grade === y.grade ? y.p.ca - x.p.ca : x.grade === 'A' ? -1 : 1))
      .slice(0, 6);
    const lines = seen.map(({ p, grade }) => `[${grade}] ${p.name} (${p.age}세, ${POS_LABEL[bestPosition(p)]}) — ${p.clubId ? state.clubs[p.clubId].name : '자유계약'}`);
    pushMessage(
      state,
      scout.name,
      '스카우팅 임무 완료',
      seen.length ? `추천 선수 목록입니다.\n\n${lines.join('\n')}\n\n영입 > 스카우팅 센터에서 자세히 볼 수 있습니다.` : '이번 임무에서는 추천할 만한 선수를 찾지 못했습니다.',
      'neutral',
      seen[0] ? { type: 'player', id: seen[0].p.id } : undefined,
    );
  });

  requirementPitches(state, rng);
}

export function reportText(state: GameState, p: Player, grade: 'A' | 'B' | 'C'): string {
  const club = p.clubId ? state.clubs[p.clubId] : null;
  const verdict = grade === 'A' ? '즉시 영입을 추천합니다.' : grade === 'B' ? '스쿼드에 도움이 될 선수입니다.' : '우리 팀에는 맞지 않습니다.';
  return [
    `${p.name} — ${club ? club.name : '자유계약'}`,
    `현재 능력 ${caStars(p.ca).toFixed(1)}★ · 잠재력 ${caStars(p.pa).toFixed(1)}★`,
    club ? `예상 이적료 ${formatMoney(askingPrice(state, p))}` : '이적료 없음',
    `예상 주급 ${formatMoney(wageDemand(p, state.clubs[state.clubId].reputation))}`,
    '',
    `평가: ${grade} — ${verdict}`,
  ].join('\n');
}

/* ------------------------------------------------------------- requirements */

export function createRequirement(state: GameState, req: Omit<Requirement, 'id' | 'created' | 'open'>): Requirement {
  const full: Requirement = { ...req, id: nextId(state, 'rq'), created: state.day, open: true };
  state.requirements.unshift(full);
  pushMessage(
    state,
    '영입팀',
    `요청 등록 — ${POS_LABEL[req.position]}`,
    '요청이 모든 구단과 에이전트에게 전달되었습니다. 며칠 안에 조건에 맞는 선수 제안이 들어오기 시작합니다.\n\n주의: 공개 요청은 경쟁 구단에도 우리의 의도를 알려줍니다.',
  );
  return full;
}

/** Clubs and agents answer open Requirements with players who fit. */
function requirementPitches(state: GameState, rng: Rng): void {
  const open = state.requirements.filter((r) => r.open);
  if (open.length === 0) return;
  const all = Object.values(state.players);
  open.forEach((req) => {
    const pitched = state.pitches.filter((p) => p.requirementId === req.id).length;
    if (pitched >= 8 || !rng.bool(0.35)) return;
    const ipRole = req.ipRole ? ROLE_BY_ID[req.ipRole] : null;
    const oopRole = req.oopRole ? ROLE_BY_ID[req.oopRole] : null;
    const candidates: { p: Player; score: number; fee: number; deal: Pitch['deal'] }[] = [];
    for (let i = 0; i < 260; i++) {
      const p = all[rng.int(0, all.length - 1)];
      if (p.clubId === state.clubId || p.youth || p.loan) continue;
      if ((p.positions[req.position] ?? 0) < 15) continue;
      if (p.age < req.minAge || p.age > req.maxAge) continue;
      if (state.pitches.some((x) => x.playerId === p.id && x.requirementId === req.id)) continue;
      const wage = wageDemand(p, state.clubs[state.clubId].reputation);
      if (wage > req.maxWage) continue;
      let deal: Pitch['deal'] = 'transfer';
      let fee = 0;
      if (!p.clubId) deal = 'free';
      else {
        fee = askingPrice(state, p);
        const backup = p.contract?.status === 'backup' || p.contract?.status === 'prospect';
        if (req.deal === 'loan' || (req.deal === 'any' && backup && fee > req.maxFee)) {
          if (!backup && !p.listed) continue;
          deal = 'loan';
          fee = 0;
        } else if (fee > req.maxFee) continue;
      }
      // Clubs push the players they want rid of; agents push their ambitious clients.
      const available = (p.listed ? 1.6 : 1) * (p.unhappy ? 1.5 : 1) * (deal === 'free' ? 1.3 : 1);
      const fit = (ipRole ? roleScore(p.attrs, ipRole) : 10) + (oopRole ? roleScore(p.attrs, oopRole) : 10);
      candidates.push({ p, score: fit * available * (p.ca / 100), fee, deal });
    }
    if (candidates.length === 0) return;
    const best = candidates.sort((a, b) => b.score - a.score)[0];
    const from = best.p.clubId;
    const notes = [
      best.p.listed ? '구단이 정리하려는 선수입니다.' : null,
      best.p.unhappy ? '본인이 이적을 원하고 있습니다.' : null,
      best.deal === 'free' ? '에이전트: 바로 계약 가능한 자유계약 선수입니다.' : null,
      best.deal === 'loan' ? '소속 구단이 임대를 허락할 수 있습니다.' : null,
    ].filter(Boolean);
    const pitch: Pitch = {
      id: nextId(state, 'pt'),
      requirementId: req.id,
      playerId: best.p.id,
      fromClubId: from,
      askingFee: best.fee,
      deal: best.deal,
      day: state.day,
      note: notes.join(' ') || (from ? `${state.clubs[from].name}이(가) 제안을 보내왔습니다.` : '에이전트 제안입니다.'),
      dismissed: false,
    };
    state.pitches.unshift(pitch);
    state.knowledge[best.p.id] = Math.max(knowledgeOf(state, best.p), 55);
    if (pitched === 0) {
      pushMessage(state, '영입팀', `요청에 대한 첫 제안 — ${POS_LABEL[req.position]}`, `${best.p.name}을(를) 비롯한 제안이 들어오기 시작했습니다. 영입 > 요청 탭에서 확인하세요.`, 'action', { type: 'pitch', id: pitch.id });
    }
  });
  // Requirements quietly close after six weeks.
  state.requirements.forEach((r) => {
    if (r.open && state.day - r.created > 42) r.open = false;
  });
}

/** Visible attribute value for the UI: exact when well known, otherwise a range or unknown. */
export function attributeView(state: GameState, player: Player, value: number, index: number): { text: string; known: boolean; mid: number } {
  const k = knowledgeOf(state, player);
  if (k >= 75) return { text: String(value), known: true, mid: value };
  if (k < 25) return { text: '?', known: false, mid: 10 };
  // A range that contains the true value without being centred on it, fixed
  // per player and attribute so it doesn't flicker between renders.
  const spread = k >= 55 ? 2 : 3;
  const hash = [...player.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, index * 7919);
  const shift = (hash % (spread + 1)) - Math.floor(spread / 2);
  const lo = clamp(value - spread + shift, 1, 20);
  const hi = clamp(lo + spread * 2, 1, 20);
  return { text: `${lo}-${hi}`, known: false, mid: (lo + hi) / 2 };
}
