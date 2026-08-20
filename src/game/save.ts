import type { GameState } from './types';

const KEY = 'gaffer.save.v1';

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable (private mode). The game stays playable
    // in memory, so failing quietly is better than interrupting a match.
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    // Guard against a save written by an incompatible build.
    if (!parsed?.teams || !parsed?.fixtures || !parsed?.clubId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function hasSave(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do — the caller is starting a new game either way.
  }
}
