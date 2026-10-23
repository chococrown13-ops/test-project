import { bestPosition, caStars, marketValue, wageDemand } from './ability';
import { applySeasonReview, evaluateSeason, setObjectives } from './board';
import { planSeason } from './calendar';
import { PROMOTED, RELEGATED, buildTable, cupProgress, positionOf, winnerOf } from './competition';
import { payPrize, prizeMoney, seasonBudgets } from './finance';
import { POS_LABEL, type Position } from './formations';
import { createPlayer, cupFirstRound, emptySeason, leagueFixtures } from './generate';
import { pushMessage } from './inbox';
import { Rng, clamp } from './rng';
import { autoSelect } from './tactics';
import { endLoan, releasePlayer, expectedStatus } from './transfers';
import type { Club, GameState, Player, SeasonReview } from './types';

const YOUTH_POSITIONS: Position[] = ['GK', 'DC', 'DC', 'DL', 'DR', 'DM', 'MC', 'MC', 'ML', 'MR', 'AMC', 'AML', 'AMR', 'ST', 'ST'];

/** Mid-March: every club brings through a new crop of 15-16 year olds. */
export function youthIntake(state: GameState, rng: Rng): void {
  Object.values(state.clubs).forEach((club) => {
    const count = rng.int(3, 6);
    const created: Player[] = [];
    // Facilities and reputation decide how good the crop can be.
    const quality = club.youthFacilities * 4 + club.reputation * 0.8;
    const youthCoach = club.id === state.clubId ? Math.max(5, ...state.staff.filter((s) => s.role === 'youth').map((s) => s.ability)) : club.staffLevel;
    for (let i = 0; i < count; i++) {
      const golden = rng.bool(0.04 + club.youthFacilities / 400);
      const pa = clamp(Math.round(rng.normal(60 + quality * 0.55 + youthCoach * 1.2, 20) + (golden ? 40 : 0)), 50, 195);
      const youth = createPlayer(rng, { position: rng.pick(YOUTH_POSITIONS), ca: clamp(Math.round(rng.normal(pa * 0.32, 6)), 20, 80), age: rng.int(15, 16), nation: 'KOR', pa }, state.season);
      youth.youth = true;
      youth.clubId = club.id;
      youth.contract = { wage: 3, expires: state.season + 3, status: 'prospect' };
      youth.seasons.push(emptySeason(state.season, club.id));
      state.players[youth.id] = youth;
      club.youthIds.push(youth.id);
      created.push(youth);
    }
    if (club.id === state.clubId) {
      const best = created.sort((a, b) => b.pa - a.pa);
      const lines = best.map((p) => `${p.name} (${p.age}세, ${POS_LABEL[bestPosition(p)]}) 잠재력 ${caStars(p.pa).toFixed(1)}★`);
      const star = best[0] && caStars(best[0].pa) >= 4;
      pushMessage(
        state,
        '유스 감독',
        '유스 인테이크',
        `올해 유스팀에 ${created.length}명이 새로 들어왔습니다.${star ? ' 특히 한 명은 특별한 재능을 지녔습니다.' : ''}\n\n${lines.join('\n')}`,
        star ? 'good' : 'neutral',
        best[0] ? { type: 'player', id: best[0].id } : undefined,
      );
    }
  });
}

function retireChance(p: Player): number {
  if (p.age < 33) return 0;
  return clamp((p.age - 32) * 0.2 + (p.ca < 70 ? 0.2 : 0) - (p.ca > 140 ? 0.15 : 0), 0, 0.95);
}

/**
 * Season end: promotion and relegation, prize money, the board's verdict,
 * contracts running out, retirements, then a fresh calendar and fixtures.
 */
export function endSeason(state: GameState, rng: Rng): SeasonReview {
  const season = state.season;
  const user = state.clubs[state.clubId];
  const tables = [0, 1, 2].map((d) => buildTable(state, d));
  const userTable = tables[user.division];
  const position = positionOf(userTable, user.id);
  const userRow = userTable.find((r) => r.clubId === user.id)!;
  const playedDivision = user.division;

  // Prize money.
  let userPrize = 0;
  tables.forEach((table, division) =>
    table.forEach((row, i) => {
      const amount = prizeMoney(division, i + 1);
      payPrize(state.clubs[row.clubId], amount);
      if (row.clubId === user.id) userPrize = amount;
    }),
  );

  // Movement between divisions.
  const playoffWinner = (division: number) => {
    const final = state.fixtures.find((f) => f.comp === 'playoff' && f.division === division && f.round === 1 && f.played);
    return final ? winnerOf(final) : null;
  };
  const promoted: string[] = [];
  const relegated: string[] = [];
  const moves: [string, number][] = [];
  for (let division = 1; division < 3; division++) {
    const table = tables[division];
    const up = table.slice(0, PROMOTED).map((r) => r.clubId);
    const po = playoffWinner(division) ?? table[PROMOTED]?.clubId;
    if (po) up.push(po);
    const down = tables[division - 1].slice(-RELEGATED).map((r) => r.clubId);
    up.forEach((id) => moves.push([id, division - 1]));
    down.forEach((id) => moves.push([id, division]));
    promoted.push(...up);
    relegated.push(...down);
  }
  moves.forEach(([id, division]) => {
    const club = state.clubs[id];
    const goingUp = division < club.division;
    club.division = division;
    club.reputation = clamp(club.reputation + (goingUp ? 7 : -7), 5, 99);
  });
  // Champions and the top half gain standing; the bottom loses a little.
  tables.forEach((table) =>
    table.forEach((row, i) => {
      const club = state.clubs[row.clubId];
      club.reputation = clamp(club.reputation + (i === 0 ? 4 : i < 4 ? 1 : i >= table.length - 4 ? -1 : 0), 5, 99);
    }),
  );

  const cupFinal = state.fixtures.find((f) => f.comp === 'cup' && f.round === 5 && f.played);
  const cupWinner = cupFinal ? state.clubs[winnerOf(cupFinal)].name : '-';

  // The board's verdict.
  const results = evaluateSeason(state, position);
  applySeasonReview(state, results, rng);

  const outcome = promoted.includes(user.id)
    ? '승격'
    : relegated.includes(user.id)
      ? '강등'
      : position === 1
        ? '우승'
        : `${position}위`;
  const scorer = user.playerIds
    .map((id) => state.players[id])
    .filter((p): p is Player => !!p)
    .map((p) => ({ p, goals: p.seasons.find((s) => s.season === season && s.clubId === user.id)?.goals ?? 0 }))
    .sort((a, b) => b.goals - a.goals)[0];

  state.history.unshift({
    season,
    clubId: user.id,
    division: playedDivision,
    position,
    points: userRow.points,
    won: userRow.won,
    drawn: userRow.drawn,
    lost: userRow.lost,
    goalsFor: userRow.goalsFor,
    goalsAgainst: userRow.goalsAgainst,
    cup: cupProgress(state, user.id),
    outcome,
    topScorer: scorer ? `${scorer.p.name} (${scorer.goals}골)` : '-',
  });

  // Loans end, contracts run out, veterans retire.
  Object.values(state.players).forEach((p) => {
    if (p.loan) endLoan(state, p);
  });
  const departures: string[] = [];
  const retirements: string[] = [];
  Object.values(state.players).forEach((p) => {
    if (rng.bool(retireChance(p))) {
      if (p.clubId === state.clubId) retirements.push(p.name);
      releasePlayer(state, p, false);
      delete state.players[p.id];
      return;
    }
    if (!p.clubId) {
      // Unsigned veterans drift out of the game.
      if (p.age >= 31 && rng.bool(0.5)) delete state.players[p.id];
      return;
    }
    if (!p.contract || p.contract.expires > season) return;
    const club = state.clubs[p.clubId];
    if (club.id === state.clubId) {
      departures.push(p.name);
      releasePlayer(state, p, false);
      return;
    }
    const rank = club.playerIds.map((id) => state.players[id]?.ca ?? 0).filter((ca) => ca > p.ca).length;
    if ((p.age <= 30 && rank < 18) || rank < 11) {
      p.contract = { wage: wageDemand(p, club.reputation), expires: season + 1 + rng.int(1, 3), status: expectedStatus(state, p, club) };
    } else {
      releasePlayer(state, p, false);
    }
  });

  // Youth graduates.
  Object.values(state.clubs).forEach((club) => {
    club.youthIds.slice().forEach((id) => {
      const p = state.players[id];
      if (!p || p.age < 18) return;
      club.youthIds = club.youthIds.filter((x) => x !== id);
      const worst = Math.min(...club.playerIds.map((pid) => state.players[pid]?.ca ?? 200));
      if (club.id === state.clubId || p.ca >= worst - 10 || p.pa >= worst + 20) {
        p.youth = false;
        club.playerIds.push(id);
        if (club.id === state.clubId) pushMessage(state, '유스 감독', `1군 승격 — ${p.name}`, `${p.name}이(가) 유스팀을 졸업해 1군에 합류합니다.`, 'neutral', { type: 'player', id });
      } else {
        releasePlayer(state, p, false);
      }
    });
  });

  // Keep the free-agent pool (and the save) a sensible size: the best 250 stay.
  Object.values(state.players)
    .filter((p) => !p.clubId)
    .sort((a, b) => b.ca - a.ca)
    .slice(250)
    .forEach((p) => delete state.players[p.id]);
  state.shortlist = state.shortlist.filter((id) => state.players[id]);
  Object.keys(state.knowledge).forEach((id) => {
    if (!state.players[id]) delete state.knowledge[id];
  });

  // Every surviving player's market value catches up with the new season.
  const next = season + 1;
  Object.values(state.players).forEach((p) => {
    p.value = marketValue(p, next);
    p.yellowAccum = 0;
    p.suspension = 0;
    p.form = [];
    if (p.clubId) p.seasons.push(emptySeason(next, p.clubId));
    if (p.seasons.length > 12) p.seasons = p.seasons.slice(-12);
  });

  const review: SeasonReview = {
    season,
    division: playedDivision,
    position,
    outcome,
    champion: state.clubs[tables[0][0].clubId].name,
    cup: cupProgress(state, user.id),
    cupWinner,
    objectives: results.map((r) => ({ label: r.objective.label, met: r.met, detail: r.detail })),
    prize: userPrize,
    promoted: promoted.map((id) => state.clubs[id].name),
    relegated: relegated.map((id) => state.clubs[id].name),
    departures,
    retirements,
  };

  startSeason(state, next, rng);
  state.review = review;
  return review;
}

export function startSeason(state: GameState, season: number, rng: Rng): void {
  const plan = planSeason(season);
  state.season = season;
  state.dates = plan.dates;
  state.day = plan.dates.start;
  state.matchPending = null;
  state.fixtures = [...leagueFixtures(state, season, rng), ...cupFirstRound(state, season, rng)];
  state.offers = [];
  state.negotiations = [];
  state.aiRequirements = [];
  state.pitches = state.pitches.filter((p) => !p.dismissed && state.requirements.some((r) => r.open && r.id === p.requirementId));
  state.confidence = clamp(state.confidence * 0.6 + 26, 0, 100);
  Object.values(state.clubs).forEach((club: Club) => {
    seasonBudgets(state, club);
    if (club.id !== state.clubId) autoSelect(club, state.players);
  });
  setObjectives(state);
  pushMessage(
    state,
    '이사회',
    `${season}시즌 시작`,
    `새 시즌이 시작되었습니다. 이적시장이 열렸습니다.\n\n이사회 목표:\n${state.objectives.map((o) => `• ${o.label}`).join('\n')}\n\n이적 예산 ${Math.round(state.clubs[state.clubId].transferBudget / 10000)}억, 주급 예산은 구단 > 재정에서 확인하세요.`,
    'neutral',
  );
}
