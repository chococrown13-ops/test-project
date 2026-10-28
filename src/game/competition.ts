import { CUP_ROUND_NAMES, planSeason } from './calendar';
import { pairUp } from './generate';
import type { Rng } from './rng';
import type { Fixture, GameState } from './types';

export interface TableRow {
  clubId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  form: ('W' | 'D' | 'L')[];
}

export const PROMOTED = 2;
export const PLAYOFF_PLACES = [3, 6];
export const RELEGATED = 3;

export function buildTable(state: Pick<GameState, 'fixtures' | 'clubs'>, division: number): TableRow[] {
  const rows = new Map<string, TableRow>();
  Object.values(state.clubs)
    .filter((c) => c.division === division)
    .forEach((c) =>
      rows.set(c.id, { clubId: c.id, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, form: [] }),
    );
  state.fixtures
    .filter((f) => f.comp === 'league' && f.division === division && f.played)
    .sort((a, b) => a.day - b.day)
    .forEach((f) => {
      const home = rows.get(f.homeId);
      const away = rows.get(f.awayId);
      if (!home || !away) return;
      home.played++;
      away.played++;
      home.goalsFor += f.homeGoals;
      home.goalsAgainst += f.awayGoals;
      away.goalsFor += f.awayGoals;
      away.goalsAgainst += f.homeGoals;
      if (f.homeGoals > f.awayGoals) {
        home.won++;
        home.points += 3;
        away.lost++;
        home.form.push('W');
        away.form.push('L');
      } else if (f.homeGoals < f.awayGoals) {
        away.won++;
        away.points += 3;
        home.lost++;
        home.form.push('L');
        away.form.push('W');
      } else {
        home.drawn++;
        away.drawn++;
        home.points++;
        away.points++;
        home.form.push('D');
        away.form.push('D');
      }
    });
  return [...rows.values()]
    .map((r) => ({ ...r, form: r.form.slice(-5) }))
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
        b.goalsFor - a.goalsFor ||
        a.clubId.localeCompare(b.clubId),
    );
}

export function positionOf(table: TableRow[], clubId: string): number {
  return table.findIndex((r) => r.clubId === clubId) + 1;
}

/** Winner of a played knockout fixture. */
export function winnerOf(f: Fixture): string {
  if (f.homeGoals !== f.awayGoals) return f.homeGoals > f.awayGoals ? f.homeId : f.awayId;
  if (f.pens) return f.pens.home > f.pens.away ? f.homeId : f.awayId;
  return f.homeId;
}

export function cupRoundName(round: number): string {
  return CUP_ROUND_NAMES[round] ?? `${round + 1}라운드`;
}

/**
 * After a cup round finishes, draw the next one. Round 1 winners meet the 16
 * top-flight clubs in the round of 32; from there it is a straight knockout.
 */
export function drawNextCupRound(state: GameState, rng: Rng): Fixture[] {
  const cup = state.fixtures.filter((f) => f.comp === 'cup');
  const latest = Math.max(...cup.map((f) => f.round));
  const current = cup.filter((f) => f.round === latest);
  if (current.some((f) => !f.played) || latest >= CUP_ROUND_NAMES.length - 1) return [];
  const plan = planSeason(state.season);
  let entrants = current.map(winnerOf);
  if (latest === 0) {
    entrants = [
      ...entrants,
      ...Object.values(state.clubs)
        .filter((c) => c.division === 0)
        .map((c) => c.id),
    ];
  }
  const next = latest + 1;
  const final = next === CUP_ROUND_NAMES.length - 1;
  const fixtures = pairUp(rng.shuffle(entrants), state.season, next, plan.cupDays[next], final);
  // The lower-ranked side gets home advantage in early rounds, as is tradition.
  if (!final) {
    fixtures.forEach((f) => {
      const h = state.clubs[f.homeId];
      const a = state.clubs[f.awayId];
      if (h.division < a.division) [f.homeId, f.awayId] = [f.awayId, f.homeId];
    });
  }
  state.fixtures.push(...fixtures);
  return fixtures;
}

/** Promotion play-offs in the lower divisions once their leagues are done: 3v6, 4v5, then a final. */
export function drawPlayoffs(state: GameState): Fixture[] {
  const plan = planSeason(state.season);
  const created: Fixture[] = [];
  for (let division = 1; division < 3; division++) {
    if (state.fixtures.some((f) => f.comp === 'playoff' && f.division === division)) continue;
    const league = state.fixtures.filter((f) => f.comp === 'league' && f.division === division);
    if (league.some((f) => !f.played)) continue;
    const table = buildTable(state, division);
    const seeds = table.slice(PLAYOFF_PLACES[0] - 1, PLAYOFF_PLACES[1]).map((r) => r.clubId);
    const semi = (home: string, away: string, i: number): Fixture => ({
      id: `po${state.season}-${division}-sf${i}`,
      comp: 'playoff',
      division,
      round: 0,
      day: plan.playoffDays[0],
      homeId: home,
      awayId: away,
      played: false,
      homeGoals: 0,
      awayGoals: 0,
      pens: null,
      neutral: false,
      goals: [],
    });
    created.push(semi(seeds[0], seeds[3], 0), semi(seeds[1], seeds[2], 1));
  }
  state.fixtures.push(...created);
  return created;
}

export function drawPlayoffFinals(state: GameState): Fixture[] {
  const plan = planSeason(state.season);
  const created: Fixture[] = [];
  for (let division = 1; division < 3; division++) {
    const semis = state.fixtures.filter((f) => f.comp === 'playoff' && f.division === division && f.round === 0);
    if (semis.length !== 2 || semis.some((f) => !f.played)) continue;
    if (state.fixtures.some((f) => f.comp === 'playoff' && f.division === division && f.round === 1)) continue;
    created.push({
      id: `po${state.season}-${division}-final`,
      comp: 'playoff',
      division,
      round: 1,
      day: plan.playoffDays[1],
      homeId: winnerOf(semis[0]),
      awayId: winnerOf(semis[1]),
      played: false,
      homeGoals: 0,
      awayGoals: 0,
      pens: null,
      neutral: true,
      goals: [],
    });
  }
  state.fixtures.push(...created);
  return created;
}

export function competitionName(state: GameState, f: Fixture): string {
  if (f.comp === 'league') return state.leagueNames[f.division];
  if (f.comp === 'cup') return `${state.cupName} ${cupRoundName(f.round)}`;
  return `${state.leagueNames[f.division]} 승격 PO ${f.round === 0 ? '준결승' : '결승'}`;
}

/** How far a club got in the cup this season. */
export function cupProgress(state: GameState, clubId: string): string {
  const mine = state.fixtures.filter((f) => f.comp === 'cup' && (f.homeId === clubId || f.awayId === clubId));
  if (mine.length === 0) return '미참가';
  const last = mine.sort((a, b) => b.round - a.round)[0];
  if (!last.played) return `${cupRoundName(last.round)} 진출`;
  if (winnerOf(last) === clubId) return last.round === CUP_ROUND_NAMES.length - 1 ? '우승' : `${cupRoundName(last.round)} 통과`;
  return `${cupRoundName(last.round)} 탈락`;
}

export function cupRoundReached(state: GameState, clubId: string): number {
  const mine = state.fixtures.filter((f) => f.comp === 'cup' && (f.homeId === clubId || f.awayId === clubId));
  if (mine.length === 0) return -1;
  const last = mine.sort((a, b) => b.round - a.round)[0];
  return last.played && winnerOf(last) === clubId ? last.round + 1 : last.round;
}

export function recentForm(state: Pick<GameState, 'fixtures'>, clubId: string, count = 5): ('W' | 'D' | 'L')[] {
  return state.fixtures
    .filter((f) => f.played && (f.homeId === clubId || f.awayId === clubId))
    .sort((a, b) => a.day - b.day)
    .slice(-count)
    .map((f) => {
      const winner = f.homeGoals === f.awayGoals && !f.pens ? null : winnerOf(f);
      if (!winner) return 'D';
      return winner === clubId ? 'W' : 'L';
    });
}
