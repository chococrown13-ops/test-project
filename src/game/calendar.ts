import type { SeasonDates } from './types';

/**
 * Game time is a day count from 1 July 2026. A season runs July to June like
 * the European calendar FM uses: pre-season and the summer window first,
 * league weekends from August, a winter break, the cup on midweeks, and the
 * play-offs and cup final at the end of May.
 */

const EPOCH = Date.UTC(2026, 6, 1);
const DAY_MS = 86400000;
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

export function dateOf(day: number): Date {
  return new Date(EPOCH + day * DAY_MS);
}

export function dayOf(year: number, month: number, date: number): number {
  return Math.round((Date.UTC(year, month - 1, date) - EPOCH) / DAY_MS);
}

export function weekday(day: number): number {
  return dateOf(day).getUTCDay();
}

export function formatDate(day: number, withWeekday = true): string {
  const d = dateOf(day);
  const text = `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
  return withWeekday ? `${text} (${WEEKDAY[d.getUTCDay()]})` : text;
}

export function formatShortDate(day: number): string {
  const d = dateOf(day);
  return `${d.getUTCMonth() + 1}.${d.getUTCDate()} (${WEEKDAY[d.getUTCDay()]})`;
}

export function seasonStart(season: number): number {
  return dayOf(season, 7, 1);
}

/** First given weekday (0 = Sunday) on or after `day`. */
function onOrAfter(day: number, wd: number): number {
  let d = day;
  while (weekday(d) !== wd) d++;
  return d;
}

export interface SeasonPlan {
  dates: SeasonDates;
  /** Saturday of each league round. */
  leagueDays: number[];
  /** Wednesday (or Saturday for the final) of each cup round. */
  cupDays: number[];
  /** Play-off semi-final and final days. */
  playoffDays: [number, number];
}

export const LEAGUE_ROUNDS = 30;
export const CUP_ROUND_NAMES = ['1라운드', '32강', '16강', '8강', '4강', '결승'];

export function planSeason(season: number): SeasonPlan {
  const start = seasonStart(season);
  const firstSaturday = onOrAfter(dayOf(season, 8, 8), 6);

  // Weekend slots, skipping international breaks and a winter break.
  const skipAfter = new Map<number, number>([
    [4, 1],
    [9, 1],
    [14, 1],
    [18, 5],
  ]);
  const leagueDays: number[] = [];
  let saturday = firstSaturday;
  for (let round = 0; round < LEAGUE_ROUNDS; round++) {
    leagueDays.push(saturday);
    saturday += 7 * (1 + (skipAfter.get(round) ?? 0));
  }

  const wednesdayAfter = (round: number) => leagueDays[round] + 4;
  const lastRound = leagueDays[LEAGUE_ROUNDS - 1];
  const cupDays = [
    wednesdayAfter(2),
    wednesdayAfter(7),
    wednesdayAfter(12),
    wednesdayAfter(21),
    wednesdayAfter(25),
    lastRound + 14,
  ];
  const playoffDays: [number, number] = [lastRound + 4, lastRound + 8];

  return {
    leagueDays,
    cupDays,
    playoffDays,
    dates: {
      start,
      windowSummerEnd: dayOf(season, 8, 31),
      windowWinterStart: dayOf(season + 1, 1, 1),
      windowWinterEnd: dayOf(season + 1, 1, 31),
      youthIntake: dayOf(season + 1, 3, 16),
      end: lastRound + 21,
    },
  };
}

export function windowOpen(dates: SeasonDates, day: number): 'summer' | 'winter' | null {
  if (day >= dates.start && day <= dates.windowSummerEnd) return 'summer';
  if (day >= dates.windowWinterStart && day <= dates.windowWinterEnd) return 'winter';
  return null;
}
