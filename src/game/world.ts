import { formatMoney } from './ability';
import { afterUserMatch, monthlyReview, setObjectives } from './board';
import { dateOf, formatDate } from './calendar';
import { competitionName, cupRoundName, drawNextCupRound, drawPlayoffFinals, drawPlayoffs, winnerOf } from './competition';
import { moraleAfterMatch, weeklyDynamics } from './dynamics';
import { createLiveMatch, playerOfMatch, restoreAiMentality, simulateFull, type LiveMatch } from './engine/match';
import { cupPrize, dailyFinance, matchdayIncome, seasonBudgets } from './finance';
import { createNewGame, emptySeason, type NewGameOptions } from './generate';
import { pushMessage } from './inbox';
import { randomInjury } from './names';
import { Rng, clamp } from './rng';
import { dailyScouting } from './scouting';
import { endSeason, youthIntake } from './season';
import { autoSelect, lineupIssues } from './tactics';
import { dailyTraining, weeklyDevelopment } from './training';
import { aiMarketDay, aiSignFreeAgents, expireOffers } from './transfers';
import type { Fixture, GameState, GoalRecord } from './types';

export type StopReason = 'match' | 'message' | 'review' | 'sacked' | 'idle';

export function newGame(options: NewGameOptions): GameState {
  const state = createNewGame(options);
  const club = state.clubs[state.clubId];
  seasonBudgets(state, club);
  setObjectives(state);
  // A first scouting job so the recruitment hub isn't empty.
  const scout = state.staff.find((s) => s.role === 'scout');
  if (scout) state.assignments.push({ id: 'sa0', staffId: scout.id, target: { type: 'division', division: club.division }, daysLeft: 28 });
  pushMessage(
    state,
    '이사회',
    `${club.name}에 오신 것을 환영합니다`,
    [
      `${state.managerName} 감독님, ${club.name}의 지휘봉을 잡게 되신 것을 환영합니다.`,
      '',
      '이번 시즌 이사회 목표:',
      ...state.objectives.map((o) => `• ${o.label}`),
      '',
      `이적 예산 ${formatMoney(club.transferBudget)}, 주급 예산 ${formatMoney(club.wageBudget)}/주.`,
      '',
      '먼저 전술 화면에서 공격 시(IP)·수비 시(OOP) 형태를 정하고, 선수단을 살펴보세요. 준비가 되면 오른쪽 아래 "계속"을 누르세요.',
    ].join('\n'),
    'neutral',
  );
  return state;
}

function userFixtureToday(state: GameState): Fixture | undefined {
  return state.fixtures.find((f) => f.day === state.day && !f.played && (f.homeId === state.clubId || f.awayId === state.clubId));
}

export function nextUserFixture(state: GameState): Fixture | undefined {
  return state.fixtures
    .filter((f) => !f.played && (f.homeId === state.clubId || f.awayId === state.clubId))
    .sort((a, b) => a.day - b.day)[0];
}

/**
 * The "Continue" button. Runs whole days until something needs the manager:
 * a match of ours, a message that wants an answer, the season review, or a
 * sacking. Stops after a week at most so the inbox can be read.
 */
export function advance(state: GameState, rng: Rng): StopReason {
  if (state.sacked) return 'sacked';
  for (let guard = 0; guard < 60; guard++) {
    const fixture = userFixtureToday(state);
    if (fixture) {
      state.matchPending = fixture.id;
      prepareOpponents(state);
      return 'match';
    }
    const before = state.inbox.filter((m) => m.tone === 'action' && !m.read).length;
    const reviewed = processDay(state, rng);
    state.day += 1;
    if (reviewed) return 'review';
    if (state.sacked) return 'sacked';
    const after = state.inbox.filter((m) => m.tone === 'action' && !m.read).length;
    if (after > before) return 'message';
    if (guard >= 6 && userFixtureToday(state) === undefined && dateOf(state.day).getUTCDay() === 1) return 'idle';
  }
  return 'idle';
}

function prepareOpponents(state: GameState): void {
  state.fixtures
    .filter((f) => f.day === state.day && !f.played)
    .forEach((f) => {
      [f.homeId, f.awayId].forEach((id) => {
        if (id !== state.clubId) autoSelect(state.clubs[id], state.players, { rotate: true });
      });
    });
}

/** One calendar day. Returns true if the season rolled over today. */
export function processDay(state: GameState, rng: Rng): boolean {
  const day = state.day;
  const fixtures = state.fixtures.filter((f) => f.day === day && !f.played && f.homeId !== state.clubId && f.awayId !== state.clubId);
  if (fixtures.length) {
    prepareOpponents(state);
    const ctx = { players: state.players, clubs: state.clubs };
    fixtures.forEach((f) => {
      const live = simulateFull(f, ctx, rng);
      settleMatch(state, f, live, rng);
    });
  }
  afterFixtures(state, rng);

  dailyTraining(state, rng);
  dailyFinance(state, rng);
  dailyScouting(state, rng);
  aiMarketDay(state, rng);
  expireOffers(state);
  birthdays(state);

  const date = dateOf(day);
  if (date.getUTCDay() === 1) {
    weeklyDevelopment(state, rng);
    weeklyDynamics(state, rng);
    const inWindow = day <= state.dates.windowSummerEnd || (day >= state.dates.windowWinterStart && day <= state.dates.windowWinterEnd);
    if (inWindow) aiSignFreeAgents(state, rng);
  }
  if (date.getUTCDate() === 1) monthlyReview(state, rng);
  calendarEvents(state, rng);

  if (day >= state.dates.end) {
    endSeason(state, rng);
    // endSeason moved the clock to next season's first day; undo the caller's +1.
    state.day -= 1;
    return true;
  }
  return false;
}

function birthdays(state: GameState): void {
  const d = dateOf(state.day);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const doy = Math.floor((d.getTime() - start) / 86400000);
  Object.values(state.players).forEach((p) => {
    if (p.birthday === doy) p.age += 1;
  });
}

function calendarEvents(state: GameState, rng: Rng): void {
  const d = state.dates;
  const day = state.day;
  if (day === d.windowSummerEnd) {
    pushMessage(state, '단장', '여름 이적시장 마감', '오늘 자정에 이적시장이 닫힙니다. 1월 1일에 겨울 이적시장이 열리기 전까지는 자유계약 선수만 영입할 수 있습니다.');
  }
  if (day === d.windowWinterStart) {
    pushMessage(state, '단장', '겨울 이적시장 개장', '1월 한 달 동안 이적시장이 열립니다.');
    const expiring = state.clubs[state.clubId].playerIds
      .map((id) => state.players[id])
      .filter((p) => p?.contract && p.contract.expires === state.season);
    if (expiring.length) {
      pushMessage(
        state,
        '단장',
        '계약 만료 예정 선수',
        `이번 시즌이 끝나면 계약이 만료되는 선수가 ${expiring.length}명 있습니다. 재계약하지 않으면 자유계약으로 떠납니다.\n\n${expiring.map((p) => `• ${p!.name}`).join('\n')}`,
        'action',
        expiring[0] ? { type: 'player', id: expiring[0].id } : undefined,
      );
    }
  }
  if (day === d.windowWinterEnd) pushMessage(state, '단장', '겨울 이적시장 마감', '이적시장이 닫혔습니다.');
  if (day === d.youthIntake) youthIntake(state, rng);
}

/** Cup draws and play-offs, once the round in front of them is complete. */
function afterFixtures(state: GameState, rng: Rng): void {
  const drawn = drawNextCupRound(state, rng);
  const mine = drawn.find((f) => f.homeId === state.clubId || f.awayId === state.clubId);
  if (mine) {
    const opponent = state.clubs[mine.homeId === state.clubId ? mine.awayId : mine.homeId];
    pushMessage(state, state.cupName, `${state.cupName} ${cupRoundName(mine.round)} 대진`, `${cupRoundName(mine.round)} 상대는 ${opponent.name}입니다. ${mine.homeId === state.clubId ? '홈' : '원정'} 경기, ${formatDate(mine.day)}.`);
  }
  const playoffs = drawPlayoffs(state);
  if (playoffs.some((f) => f.homeId === state.clubId || f.awayId === state.clubId)) {
    pushMessage(state, '리그 사무국', '승격 플레이오프 진출!', '정규리그를 플레이오프권으로 마쳤습니다. 단판 준결승과 결승을 이기면 승격입니다.', 'good');
  }
  drawPlayoffFinals(state);
}

/* ------------------------------------------------------------------ matches */

/** Write a finished match back into the world: result, stats, cards, injuries, money, morale. */
export function settleMatch(state: GameState, fixture: Fixture, live: LiveMatch, rng: Rng): void {
  fixture.played = true;
  fixture.homeGoals = live.homeGoals;
  fixture.awayGoals = live.awayGoals;
  fixture.pens = live.pens;
  fixture.homeXg = Math.round(live.home.stats.xg * 100) / 100;
  fixture.awayXg = Math.round(live.away.stats.xg * 100) / 100;
  fixture.goals = live.events
    .filter((e) => e.kind === 'goal' && e.playerId)
    .map<GoalRecord>((e) => ({ playerId: e.playerId!, minute: e.minute, side: e.side as 'home' | 'away', penalty: e.chance === 'penalty' }));
  fixture.attendance = matchdayIncome(state, fixture);

  const pom = playerOfMatch(live);
  const ratings: Record<string, number> = {};

  [live.home, live.away].forEach((team) => {
    const club = state.clubs[team.clubId];
    const conceded = team.side === 'home' ? live.awayGoals : live.homeGoals;
    const played = new Set<string>();

    // Suspensions served: anyone banned going into this match has one fewer to sit out.
    club.playerIds.forEach((id) => {
      const p = state.players[id];
      if (p && p.suspension > 0 && !team.players.some((mp) => mp.id === id && mp.stats.minutes > 0)) p.suspension -= 1;
    });

    team.players.forEach((mp) => {
      const p = state.players[mp.id];
      if (!p) return;
      p.condition = clamp(mp.condition, 0, 100);
      if (mp.stats.minutes === 0) return;
      played.add(mp.id);
      ratings[mp.id] = mp.rating;
      let row = p.seasons.find((s) => s.season === state.season && s.clubId === club.id);
      if (!row) {
        row = emptySeason(state.season, club.id);
        p.seasons.push(row);
      }
      row.apps += 1;
      if (mp.cameOn === 0) row.starts += 1;
      row.minutes += mp.stats.minutes;
      row.goals += mp.stats.goals;
      row.assists += mp.stats.assists;
      row.ratingSum += mp.rating;
      row.ratingCount += 1;
      if (mp.yellow > 0) row.yellow += 1;
      if (mp.red) row.red += 1;
      if (pom?.id === mp.id) row.mom += 1;
      const cover = mp.ipPos === 'GK' || ['DC', 'DL', 'DR', 'WBL', 'WBR'].includes(mp.oopPos);
      if (conceded === 0 && cover && mp.stats.minutes >= 60) row.cleanSheets += 1;

      p.sharpness = clamp(p.sharpness + (mp.stats.minutes / 90) * 14, 0, 100);
      p.form = [...p.form, mp.rating].slice(-5);
      if (mp.injured) {
        const injury = randomInjury(rng);
        p.injury = injury;
        if (club.id === state.clubId) {
          pushMessage(state, '의무팀', `부상 — ${p.name}`, `${p.name}이(가) 경기 중 ${injury.name}을(를) 당했습니다. 예상 결장 기간: ${injury.days}일.`, 'bad', { type: 'player', id: p.id });
        }
      }
      if (mp.red) {
        p.suspension = mp.yellow >= 2 ? 1 : 3;
      } else if (mp.yellow > 0) {
        p.yellowAccum += 1;
        if (p.yellowAccum >= 5) {
          p.yellowAccum = 0;
          p.suspension = 1;
          if (club.id === state.clubId) pushMessage(state, '코칭스태프', `경고 누적 — ${p.name}`, `${p.name}이(가) 경고 5회 누적으로 다음 경기에 출전할 수 없습니다.`, 'bad');
        }
      }
    });

    club.playerIds.forEach((id) => {
      const p = state.players[id];
      if (!p) return;
      const mp = team.players.find((x) => x.id === id);
      p.recentMinutes = [...p.recentMinutes, mp?.stats.minutes ?? 0].slice(-6);
    });

    const drew = fixture.homeGoals === fixture.awayGoals && !fixture.pens;
    const won = !drew && winnerOf(fixture) === club.id;
    moraleAfterMatch(state, club, won, drew, ratings);
    club.tactic.familiarity = clamp(club.tactic.familiarity + 1.5, 0, 100);
  });

  if (fixture.comp === 'cup') {
    const winner = state.clubs[winnerOf(fixture)];
    winner.balance += cupPrize(fixture.round);
  }

  if (fixture.homeId === state.clubId || fixture.awayId === state.clubId) {
    const home = fixture.homeId === state.clubId;
    afterUserMatch(state, home ? fixture.awayId : fixture.homeId, home, home ? live.homeGoals : live.awayGoals, home ? live.awayGoals : live.homeGoals, fixture.comp === 'league');
  }
}

/** Kick-off for the user's pending match. Fills any gaps in the XI first. */
export function startUserMatch(state: GameState, rng: Rng): LiveMatch | null {
  const fixture = state.fixtures.find((f) => f.id === state.matchPending);
  if (!fixture) return null;
  const club = state.clubs[state.clubId];
  if (lineupIssues(club, state.players).length > 0) autoSelect(club, state.players);
  prepareOpponents(state);
  const live = createLiveMatch(fixture, { players: state.players, clubs: state.clubs }, state.clubId, rng);
  if (fixture.comp !== 'league') live.importance = Math.max(live.importance, 0.7);
  return live;
}

/** After the final whistle: record the result, play the rest of the day, move on. */
export function concludeUserMatch(state: GameState, live: LiveMatch, rng: Rng): void {
  const fixture = state.fixtures.find((f) => f.id === live.fixtureId);
  if (fixture && !fixture.played) settleMatch(state, fixture, live, rng);
  restoreAiMentality(state.clubs);
  state.matchPending = null;
  const reviewed = processDay(state, rng);
  state.day += 1;
  void reviewed;
}

export function fixtureLabel(state: GameState, f: Fixture): string {
  return competitionName(state, f);
}

export function takeJob(state: GameState, clubId: string): void {
  if (!state.jobOffers.includes(clubId)) return;
  state.clubId = clubId;
  state.sacked = false;
  state.jobOffers = [];
  state.confidence = 60;
  state.matchPending = null;
  state.offers = [];
  state.negotiations = [];
  state.requirements = [];
  state.pitches = [];
  const club = state.clubs[clubId];
  club.playerIds.forEach((id) => (state.knowledge[id] = 100));
  seasonBudgets(state, club);
  club.balance = Math.max(club.balance, 0);
  setObjectives(state);
  pushMessage(state, '이사회', `${club.name} 부임`, `${club.name}의 새 감독으로 부임했습니다. 이사회 목표: ${state.objectives[0]?.label ?? ''}`, 'good');
}
