// Everything the game remembers between visits, in localStorage. Every access
// is guarded: private mode or blocked storage just means nothing is saved.

import puzzlesJson from './data/puzzles.json';
import practiceJson from './data/practice.json';
import type { TechId } from './techniques.ts';

export type LevelId = 'mid' | 'hard' | 'expert' | 'extreme';

export interface LevelInfo {
  id: LevelId;
  name: string;
  tier: number;
  desc: string;
}

export const LEVELS: LevelInfo[] = [
  { id: 'mid', name: '중', tier: 1, desc: '포인팅 · 클레이밍 · 페어' },
  { id: 'hard', name: '상', tier: 2, desc: '트리플 · X-윙 · XY-윙' },
  { id: 'expert', name: '최상', tier: 3, desc: '스카이스크래퍼 · 소드피시 · W-윙' },
  { id: 'extreme', name: '극상', tier: 4, desc: 'X-체인 · XY-체인' },
];

export const LEVEL_BY_ID = Object.fromEntries(LEVELS.map((l) => [l.id, l])) as Record<LevelId, LevelInfo>;

export interface PuzzleEntry {
  p: string;
  used: TechId[];
}
export const PUZZLES = puzzlesJson as Record<LevelId, PuzzleEntry[]>;
export const PRACTICE = practiceJson as Record<TechId, { g: string; c: string }[]>;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, v: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- progress

export interface Clear {
  time: number; // seconds
  mistakes: number;
  hints: number;
}
type Progress = Partial<Record<LevelId, Record<number, Clear>>>;

const PROGRESS_KEY = 'sudoku:progress';

export function getClears(level: LevelId): Record<number, Clear> {
  return read<Progress>(PROGRESS_KEY, {})[level] ?? {};
}

/** Records a clear, keeping the best time. Returns true if it's a new best. */
export function recordClear(level: LevelId, idx: number, c: Clear): boolean {
  const all = read<Progress>(PROGRESS_KEY, {});
  const lv = (all[level] ??= {});
  const prev = lv[idx];
  const better = !prev || c.time < prev.time;
  if (better) lv[idx] = c;
  write(PROGRESS_KEY, all);
  return better;
}

// ------------------------------------------------------------ saved games

export interface SavedGame {
  level: LevelId;
  idx: number;
  values: number[];
  notes: number[];
  elapsed: number;
  mistakes: number;
  hints: number;
}
const SAVES_KEY = 'sudoku:saves';
const LAST_KEY = 'sudoku:last';

export function loadGame(level: LevelId, idx: number): SavedGame | null {
  return read<Record<string, SavedGame>>(SAVES_KEY, {})[`${level}:${idx}`] ?? null;
}
export function saveGame(g: SavedGame): void {
  const all = read<Record<string, SavedGame>>(SAVES_KEY, {});
  all[`${g.level}:${g.idx}`] = g;
  write(SAVES_KEY, all);
  write(LAST_KEY, { level: g.level, idx: g.idx });
}
export function dropGame(level: LevelId, idx: number): void {
  const all = read<Record<string, SavedGame>>(SAVES_KEY, {});
  delete all[`${level}:${idx}`];
  write(SAVES_KEY, all);
  const last = read<{ level: LevelId; idx: number } | null>(LAST_KEY, null);
  if (last && last.level === level && last.idx === idx) write(LAST_KEY, null);
}
export function lastGame(): SavedGame | null {
  const last = read<{ level: LevelId; idx: number } | null>(LAST_KEY, null);
  return last ? loadGame(last.level, last.idx) : null;
}

// ---------------------------------------------------------------- lessons

const LESSONS_KEY = 'sudoku:lessons';

export function lessonSolved(tech: TechId): number[] {
  return read<Partial<Record<TechId, number[]>>>(LESSONS_KEY, {})[tech] ?? [];
}
export function markLessonSolved(tech: TechId, i: number): void {
  const all = read<Partial<Record<TechId, number[]>>>(LESSONS_KEY, {});
  const set = new Set(all[tech] ?? []);
  set.add(i);
  all[tech] = [...set];
  write(LESSONS_KEY, all);
}

// --------------------------------------------------------------- settings

export interface Settings {
  showMistakes: boolean;
  sound: boolean;
}
const SETTINGS_KEY = 'sudoku:settings';
export function getSettings(): Settings {
  return { showMistakes: true, sound: true, ...read<Partial<Settings>>(SETTINGS_KEY, {}) };
}
export function setSettings(s: Settings): void {
  write(SETTINGS_KEY, s);
}
