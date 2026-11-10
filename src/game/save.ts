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
    return migrate(parsed);
  } catch {
    return null;
  }
}

/**
 * Fill in fields added after a save was written, so an in-progress career
 * survives an update instead of being thrown away.
 */
function migrate(state: GameState): GameState {
  if (!state.leagueName) state.leagueName = '프리미어 리그';
  if (!state.transfer) state.transfer = { listed: [], offers: [], log: [] };
  if (!state.transfer.listed) state.transfer.listed = [];
  if (!state.transfer.offers) state.transfer.offers = [];
  if (!state.transfer.log) state.transfer.log = [];

  Object.values(state.teams).forEach((team) => {
    if (typeof team.wageBudget !== 'number') {
      team.wageBudget = Math.round(team.players.reduce((sum, p) => sum + p.wage, 0) * 1.25);
    }
  });

  return state;
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
