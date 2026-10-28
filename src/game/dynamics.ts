import { averageRating } from './ability';
import { A, H } from './attributes';
import type { LiveMatch, MatchPlayer, Side } from './engine/match';
import { pushMessage } from './inbox';
import { Rng, clamp } from './rng';
import type { Club, GameState, Player, SquadStatus } from './types';

/* ------------------------------------------------------------- squad status */

export const STATUS_LABEL: Record<SquadStatus, string> = {
  key: '핵심 선수',
  first: '주전',
  rotation: '로테이션',
  backup: '백업',
  prospect: '유망주',
};

/** Average minutes a player of each status expects per match. */
const EXPECTED_MINUTES: Record<SquadStatus, number> = { key: 80, first: 65, rotation: 40, backup: 18, prospect: 8 };

export function moraleAfterMatch(state: GameState, club: Club, won: boolean, drew: boolean, ratings: Record<string, number>): void {
  club.playerIds.forEach((id) => {
    const p = state.players[id];
    if (!p) return;
    let delta = won ? 3 : drew ? 0 : -3;
    const rating = ratings[id];
    if (rating !== undefined) {
      if (rating >= 7.5) delta += 3;
      else if (rating < 5.8) delta -= 3;
    }
    // Professionals shrug off a bad day.
    delta *= 1 - p.hidden[H.professionalism] / 60;
    p.morale = clamp(p.morale + delta, 0, 100);
  });
}

/** Weekly: players who aren't getting the minutes their status promises lose patience. */
export function weeklyDynamics(state: GameState, rng: Rng): void {
  Object.values(state.clubs).forEach((club) => {
    club.playerIds.forEach((id) => {
      const p = state.players[id];
      if (!p?.contract || p.injury) return;
      // Drift back towards a neutral mood.
      p.morale = clamp(p.morale + (60 - p.morale) * 0.05, 0, 100);
      if (p.recentMinutes.length < 5) return;
      const avg = p.recentMinutes.reduce((s, m) => s + m, 0) / p.recentMinutes.length;
      const deficit = EXPECTED_MINUTES[p.contract.status] - avg;
      if (deficit > 25) p.morale = clamp(p.morale - deficit / 12, 0, 100);
      if (deficit > 30 && p.morale < 32 && !p.unhappy && rng.bool(0.35)) {
        p.unhappy = '출전 시간 부족';
        if (club.id === state.clubId) {
          pushMessage(
            state,
            p.name,
            `${p.name}: 출전 시간에 불만`,
            `"감독님, 저는 ${statusText(p.contract.status)}로 이 팀에 왔습니다. 지금처럼 경기에 못 나간다면 다른 팀을 알아보고 싶습니다."\n\n선수 화면에서 면담(출전 약속)하거나 이적 리스트에 올릴 수 있습니다.`,
            'action',
            { type: 'player', id: p.id },
          );
        } else {
          p.listed = 'transfer';
        }
      }
      if (p.unhappy && p.morale > 60) p.unhappy = null;
    });
  });
}

function statusText(status: SquadStatus): string {
  return STATUS_LABEL[status];
}

/* ---------------------------------------------------------------- player chat */

export type Interaction = 'praise' | 'criticise' | 'promiseTime';

export function interact(state: GameState, player: Player, kind: Interaction, rng: Rng): string {
  const avg = averageRating(player, state.season) ?? 6.6;
  const prof = player.hidden[H.professionalism];
  const temper = player.hidden[H.temperament];
  let delta = 0;
  let reply: string;
  switch (kind) {
    case 'praise':
      if (avg >= 6.9) {
        delta = 8;
        reply = '"감사합니다. 앞으로도 계속 이렇게 하겠습니다."';
      } else {
        delta = -2;
        reply = '"…칭찬받을 만큼 잘하지는 못했는데요." 선수는 어색해합니다.';
      }
      break;
    case 'criticise':
      if (avg < 6.6 && (prof >= 13 || temper >= 13) && rng.bool(0.7)) {
        delta = 6;
        reply = '"알겠습니다. 더 집중하겠습니다." 선수가 자극을 받은 것 같습니다.';
      } else {
        delta = -10;
        reply = '"저만 탓하시는 건 불공평합니다." 선수가 기분이 상했습니다.';
      }
      break;
    case 'promiseTime':
      if (player.unhappy) {
        delta = 14;
        player.unhappy = null;
        player.listed = player.listed === 'transfer' ? null : player.listed;
        reply = '"그 말씀 믿겠습니다." 선수가 이적 요청을 철회했습니다. 약속을 지키지 않으면 더 크게 실망할 것입니다.';
      } else {
        delta = 3;
        reply = '"좋습니다. 기회를 기다리겠습니다."';
      }
      break;
  }
  player.morale = clamp(player.morale + delta, 0, 100);
  return reply;
}

/* ----------------------------------------------------------------- team talks */

export type TalkTone = 'praise' | 'encourage' | 'faith' | 'calm' | 'demand' | 'angry';

export const TALK_LABEL: Record<TalkTone, string> = {
  praise: '칭찬한다',
  encourage: '격려한다',
  faith: '믿는다고 말한다',
  calm: '진정시킨다',
  demand: '더 요구한다',
  angry: '분노를 표출한다',
};

export type Reaction = 'fired' | 'focused' | 'indifferent' | 'nervous' | 'annoyed';

export const REACTION_LABEL: Record<Reaction, string> = {
  fired: '투지 넘침',
  focused: '집중',
  indifferent: '무덤덤',
  nervous: '위축',
  annoyed: '반발',
};

const REACTION_BOOST: Record<Reaction, number> = { fired: 0.07, focused: 0.04, indifferent: 0, nervous: -0.03, annoyed: -0.05 };

export interface TalkResult {
  playerId: string;
  name: string;
  reaction: Reaction;
}

/** How well a tone fits the moment, -1..1. */
function toneFit(tone: TalkTone, lead: number, favourite: boolean, stage: 'pre' | 'half' | 'full', importance: number): number {
  switch (tone) {
    case 'praise':
      return lead > 0 ? 0.6 : lead === 0 ? (favourite ? -0.1 : 0.35) : favourite ? -0.6 : -0.2;
    case 'encourage':
      return lead === 0 ? 0.45 : lead < 0 ? (favourite ? 0.15 : 0.45) : 0.25;
    case 'faith':
      return lead < 0 && !favourite ? 0.5 : stage === 'pre' && !favourite ? 0.45 : 0.05;
    case 'calm':
      return stage === 'pre' ? (importance > 0.65 ? 0.55 : 0.1) : lead >= 2 ? 0.4 : lead < 0 ? -0.35 : 0;
    case 'demand':
      return lead <= 0 && favourite ? 0.55 : lead === 1 ? 0.3 : stage === 'full' && lead > 0 ? -0.3 : 0.05;
    case 'angry':
      return lead < 0 && favourite ? 0.35 : lead < -1 ? 0.1 : -0.55;
  }
}

/**
 * Team talk before kick-off, at half-time or after the whistle. Each player
 * reacts according to how fitting the tone is and to his personality; the
 * reaction changes his performance for the rest of the match (and morale).
 */
export function teamTalk(
  state: GameState,
  live: LiveMatch | null,
  side: Side,
  tone: TalkTone,
  stage: 'pre' | 'half' | 'full',
  rng: Rng,
  ctxOverride?: { lead: number; favourite: boolean; importance: number },
): TalkResult[] {
  const club = state.clubs[state.clubId];
  const lead = ctxOverride?.lead ?? (live ? (side === 'home' ? live.homeGoals - live.awayGoals : live.awayGoals - live.homeGoals) : 0);
  const opponentId = live ? (side === 'home' ? live.awayId : live.homeId) : null;
  const favourite = ctxOverride?.favourite ?? (opponentId ? club.reputation >= state.clubs[opponentId].reputation + 3 : true);
  const importance = ctxOverride?.importance ?? live?.importance ?? 0.5;
  const fit = toneFit(tone, lead, favourite, stage, importance);

  const targets: { id: string; mp?: MatchPlayer }[] = live
    ? (side === 'home' ? live.home : live.away).players.filter((mp) => mp.onPitch || stage !== 'half').map((mp) => ({ id: mp.id, mp }))
    : club.tactic.lineup.filter((id): id is string => !!id).map((id) => ({ id }));

  return targets.map(({ id, mp }) => {
    const p = state.players[id];
    let score = fit + rng.normal(0, 0.3) + (p.hidden[H.professionalism] - 10) / 50;
    if (tone === 'angry' || tone === 'demand') score += (p.hidden[H.temperament] - 10) / 25 + (p.hidden[H.pressure] - 10) / 40;
    if (tone === 'calm') score += (10 - p.hidden[H.pressure]) / 40;
    if (tone === 'praise') score += (p.attrs[A.determination] - 10) / 60;
    const reaction: Reaction = score > 0.6 ? 'fired' : score > 0.25 ? 'focused' : score > -0.12 ? 'indifferent' : score > -0.5 ? 'nervous' : 'annoyed';
    if (mp && stage !== 'full') mp.boost = clamp(mp.boost + REACTION_BOOST[reaction], 0.88, 1.12);
    p.morale = clamp(p.morale + REACTION_BOOST[reaction] * 60, 0, 100);
    return { playerId: id, name: p.name, reaction };
  });
}

/* --------------------------------------------------------------------- shouts */

export type Shout = 'encourage' | 'demandMore' | 'focus' | 'praise' | 'calm';

export const SHOUT_LABEL: Record<Shout, string> = {
  encourage: '격려',
  demandMore: '더 요구',
  focus: '집중',
  praise: '칭찬',
  calm: '진정',
};

export const SHOUT_COOLDOWN = 10;

/** Touchline shout: a quick, smaller team talk. Returns a one-line summary. */
export function shout(state: GameState, live: LiveMatch, side: Side, type: Shout, rng: Rng): string {
  const team = side === 'home' ? live.home : live.away;
  if (live.minute - team.lastShout < SHOUT_COOLDOWN) return `${SHOUT_COOLDOWN - (live.minute - team.lastShout)}분 뒤에 다시 지시할 수 있습니다.`;
  team.lastShout = live.minute;
  const tone: TalkTone = type === 'demandMore' ? 'demand' : type === 'focus' ? 'calm' : type === 'praise' ? 'praise' : type === 'calm' ? 'calm' : 'encourage';
  const results = teamTalk(state, live, side, tone, 'half', rng);
  // Shouts are half as strong as a team talk.
  results.forEach((r) => {
    const mp = team.players.find((x) => x.id === r.playerId);
    if (mp) mp.boost = 1 + (mp.boost - 1) * 0.75;
  });
  const good = results.filter((r) => r.reaction === 'fired' || r.reaction === 'focused').length;
  const bad = results.filter((r) => r.reaction === 'nervous' || r.reaction === 'annoyed').length;
  return good > bad ? `선수들이 반응합니다 (${good}명 긍정적).` : bad > good ? `몇몇 선수가 불편해합니다 (${bad}명 부정적).` : '선수들의 반응이 미지근합니다.';
}

/* ------------------------------------------------------------ press conference */

export interface PressAnswer {
  text: string;
  morale: number;
  board: number;
}

export interface PressQuestion {
  question: string;
  answers: PressAnswer[];
}

export function pressConference(state: GameState, opponentId: string, rng: Rng): PressQuestion[] {
  const club = state.clubs[state.clubId];
  const opp = state.clubs[opponentId];
  const favourite = club.reputation > opp.reputation + 5;
  const pool: PressQuestion[] = [
    {
      question: `${opp.name}전을 앞두고 있습니다. 어떤 결과를 기대하십니까?`,
      answers: favourite
        ? [
            { text: '당연히 이겨야 하는 경기입니다.', morale: 3, board: 1 },
            { text: '상대를 존중하지만 우리 경기를 하면 됩니다.', morale: 1, board: 0 },
            { text: '쉬운 경기는 없습니다. 조심스럽습니다.', morale: -1, board: -1 },
          ]
        : [
            { text: '잃을 게 없습니다. 이변을 노리겠습니다.', morale: 3, board: 0 },
            { text: '승점 1점이라도 가져오면 만족합니다.', morale: -1, board: 1 },
            { text: '이길 자신 있습니다.', morale: 2, board: -1 },
          ],
    },
    {
      question: '최근 팀 분위기는 어떻습니까?',
      answers: [
        { text: '선수들이 훈련장에서 정말 잘해주고 있습니다.', morale: 3, board: 0 },
        { text: '아직 보완할 점이 많습니다.', morale: -2, board: 1 },
        { text: '분위기 얘기보다는 경기로 보여드리겠습니다.', morale: 0, board: 0 },
      ],
    },
    {
      question: `${opp.manager} 감독이 "${club.short}은(는) 약점이 뻔한 팀"이라고 말했습니다.`,
      answers: [
        { text: '말은 쉽습니다. 경기장에서 보죠.', morale: 3, board: 0 },
        { text: '남의 팀 얘기는 하지 않겠습니다.', morale: 0, board: 1 },
        { text: '그 말이 맞을 수도 있습니다.', morale: -4, board: -1 },
      ],
    },
    {
      question: '이적시장에서 보강 계획이 있습니까?',
      answers: [
        { text: '현재 선수단을 믿습니다.', morale: 3, board: 0 },
        { text: '필요한 포지션은 분명히 보강할 겁니다.', morale: -1, board: 1 },
        { text: '이사회와 논의 중입니다.', morale: 0, board: 0 },
      ],
    },
  ];
  return rng.shuffle(pool).slice(0, 2);
}

export function applyPress(state: GameState, answers: PressAnswer[]): void {
  const club = state.clubs[state.clubId];
  const morale = answers.reduce((s, a) => s + a.morale, 0);
  const board = answers.reduce((s, a) => s + a.board, 0);
  club.playerIds.forEach((id) => {
    const p = state.players[id];
    if (p) p.morale = clamp(p.morale + morale, 0, 100);
  });
  state.confidence = clamp(state.confidence + board, 0, 100);
}
