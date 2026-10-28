import { create } from 'zustand';
import type { LiveMatch } from './game/engine/match';
import type { NewGameOptions } from './game/generate';
import { Rng } from './game/rng';
import { clearSave, loadGame, saveGame } from './game/save';
import type { GameState } from './game/types';
import { advance, concludeUserMatch, newGame, startUserMatch, type StopReason } from './game/world';

export type Tab = 'home' | 'squad' | 'tactics' | 'recruit' | 'comps' | 'club';

/** Screens pushed on top of a tab. The header's back arrow pops them. */
export type Route =
  | { kind: 'player'; id: string }
  | { kind: 'club'; id: string }
  | { kind: 'negotiation'; id: string }
  | { kind: 'inbox'; id: string }
  | { kind: 'fixture'; id: string };

export type MatchStage = 'pre' | 'live' | 'post';

interface Store {
  state: GameState | null;
  /** Bumped after every mutation so React re-renders; the state object is mutated in place. */
  version: number;
  booting: boolean;
  tab: Tab;
  stack: Route[];
  /** Remembered sub-tab per tab. */
  subs: Partial<Record<Tab, string>>;
  matchStage: MatchStage | null;
  live: LiveMatch | null;
  lastStop: StopReason | null;
  busy: boolean;

  boot: () => Promise<void>;
  start: (options: NewGameOptions) => void;
  quit: () => Promise<void>;
  /** Run any engine mutation, then re-render and save. */
  mutate: (fn: (state: GameState, rng: Rng) => void, save?: boolean) => void;
  setTab: (tab: Tab) => void;
  setSub: (tab: Tab, sub: string) => void;
  /** Switch tab and sub-tab in one go (from links in the inbox, tiles, etc.). */
  jump: (tab: Tab, sub?: string) => void;
  push: (route: Route) => void;
  pop: () => void;
  continueGame: () => void;
  openMatch: () => void;
  kickOff: () => void;
  liveChanged: () => void;
  finishMatch: () => void;
  closeMatch: () => void;
}

let saveTimer: number | undefined;
function scheduleSave(state: GameState) {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void saveGame(state), 400);
}

export function rngFor(state: GameState): Rng {
  return new Rng((state.seed ^ (state.day * 2654435761) ^ (Date.now() & 0xffffff)) >>> 0);
}

export const useStore = create<Store>((set, get) => ({
  state: null,
  version: 0,
  booting: true,
  tab: 'home',
  stack: [],
  subs: {},
  matchStage: null,
  live: null,
  lastStop: null,
  busy: false,

  boot: async () => {
    const state = await loadGame();
    set({ state, booting: false, version: get().version + 1 });
  },

  start: (options) => {
    const state = newGame(options);
    set({ state, tab: 'home', stack: [], matchStage: null, live: null, version: get().version + 1 });
    void saveGame(state);
  },

  quit: async () => {
    await clearSave();
    set({ state: null, tab: 'home', stack: [], matchStage: null, live: null, version: get().version + 1 });
  },

  mutate: (fn, save = true) => {
    const state = get().state;
    if (!state) return;
    fn(state, rngFor(state));
    set({ version: get().version + 1 });
    if (save) scheduleSave(state);
  },

  setTab: (tab) => set({ tab, stack: [] }),
  setSub: (tab, sub) => set({ subs: { ...get().subs, [tab]: sub } }),
  jump: (tab, sub) => set({ tab, stack: [], subs: sub ? { ...get().subs, [tab]: sub } : get().subs }),
  push: (route) => set({ stack: [...get().stack, route] }),
  pop: () => set({ stack: get().stack.slice(0, -1) }),

  continueGame: () => {
    const { state, busy } = get();
    if (!state || busy) return;
    if (state.matchPending) {
      set({ matchStage: 'pre' });
      return;
    }
    set({ busy: true });
    // Let the button show its busy state before the (synchronous) simulation runs.
    window.setTimeout(() => {
      const reason = advance(state, rngFor(state));
      set({
        busy: false,
        lastStop: reason,
        version: get().version + 1,
        matchStage: reason === 'match' ? 'pre' : get().matchStage,
        stack: reason === 'match' ? [] : get().stack,
        tab: reason === 'message' || reason === 'idle' ? 'home' : get().tab,
      });
      scheduleSave(state);
    }, 30);
  },

  openMatch: () => {
    const { state } = get();
    if (state?.matchPending) set({ matchStage: get().live ? 'live' : 'pre' });
  },

  kickOff: () => {
    const state = get().state;
    if (!state) return;
    const live = startUserMatch(state, rngFor(state));
    if (live) set({ live, matchStage: 'live', version: get().version + 1 });
  },

  liveChanged: () => set({ version: get().version + 1 }),

  finishMatch: () => {
    const { state, live } = get();
    if (!state || !live) return;
    concludeUserMatch(state, live, rngFor(state));
    set({ matchStage: 'post', version: get().version + 1 });
    scheduleSave(state);
  },

  closeMatch: () => set({ matchStage: null, live: null, tab: 'home', stack: [] }),
}));

/** Subscribe to the game state; re-renders on every mutation. */
export function useGame(): GameState {
  useStore((s) => s.version);
  return useStore((s) => s.state)!;
}
