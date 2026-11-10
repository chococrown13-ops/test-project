import type { Fixture, TableRow } from './types';

export function buildTable(fixtures: Fixture[], teamIds: string[]): TableRow[] {
  const rows = new Map<string, TableRow>(
    teamIds.map((id) => [
      id,
      { teamId: id, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
    ]),
  );

  fixtures
    .filter((f) => f.played)
    .forEach((f) => {
      const home = rows.get(f.homeId);
      const away = rows.get(f.awayId);
      if (!home || !away) return;

      home.played += 1;
      away.played += 1;
      home.goalsFor += f.homeGoals;
      home.goalsAgainst += f.awayGoals;
      away.goalsFor += f.awayGoals;
      away.goalsAgainst += f.homeGoals;

      if (f.homeGoals > f.awayGoals) {
        home.won += 1;
        home.points += 3;
        away.lost += 1;
      } else if (f.homeGoals < f.awayGoals) {
        away.won += 1;
        away.points += 3;
        home.lost += 1;
      } else {
        home.drawn += 1;
        away.drawn += 1;
        home.points += 1;
        away.points += 1;
      }
    });

  return [...rows.values()].sort(compareRows);
}

/** Points, then goal difference, then goals scored. */
function compareRows(a: TableRow, b: TableRow): number {
  if (b.points !== a.points) return b.points - a.points;
  const aDiff = a.goalsFor - a.goalsAgainst;
  const bDiff = b.goalsFor - b.goalsAgainst;
  if (bDiff !== aDiff) return bDiff - aDiff;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  return a.teamId.localeCompare(b.teamId);
}

export const goalDifference = (row: TableRow): number => row.goalsFor - row.goalsAgainst;

export function positionOf(table: TableRow[], teamId: string): number {
  return table.findIndex((row) => row.teamId === teamId) + 1;
}

/** Last five results for a team, newest first: 'W' | 'D' | 'L'. */
export function recentForm(fixtures: Fixture[], teamId: string, count = 5): ('W' | 'D' | 'L')[] {
  return fixtures
    .filter((f) => f.played && (f.homeId === teamId || f.awayId === teamId))
    .slice(-count)
    .reverse()
    .map((f) => {
      const isHome = f.homeId === teamId;
      const scored = isHome ? f.homeGoals : f.awayGoals;
      const conceded = isHome ? f.awayGoals : f.homeGoals;
      if (scored > conceded) return 'W';
      if (scored < conceded) return 'L';
      return 'D';
    });
}

export function totalRounds(fixtures: Fixture[]): number {
  return fixtures.reduce((max, f) => Math.max(max, f.round), 0) + 1;
}
