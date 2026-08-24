/**
 * UI 와 엔진을 잇는 스토어.
 *
 * GameState 는 선수만 만 명이라 불변 갱신이 현실적이지 않습니다. 엔진이
 * 상태를 제자리에서 고치고, 여기서는 `rev` 를 올려 화면을 다시 그립니다.
 * 화면 쪽은 반드시 `useGameState()` 로 읽어야 갱신을 놓치지 않습니다.
 */

import { create } from 'zustand';
import { Rng } from '../game/rng';
import { createGame, type NewGameOptions } from '../game/newGame';
import { advanceWeek } from '../game/engine';
import { clearSave, hasSave, loadGame, saveGame } from '../game/save';
import { approachPlayer, resolveDemand, dropClient as dropClientAction } from '../game/clients';
import {
  completeNegotiation, openNegotiation, proposeCommission, proposeFee, proposeTerms, withdraw,
} from '../game/negotiation';
import { focus, sweep, toggleShortlist, type ScoutFilters } from '../game/scouting';
import type { GameState, Negotiation } from '../game/types';

export type Tab = 'home' | 'clients' | 'scout' | 'deals' | 'world';

let rng = new Rng(1);
let saveTimer: ReturnType<typeof setTimeout> | null = null;

interface GameStore {
  game: GameState | null;
  rev: number;
  tab: Tab;
  playerSheet: string | null;
  negotiationSheet: string | null;
  clubSheet: string | null;
  toast: string | null;
  busy: boolean;
  saveWarning: string | null;

  start: (options: NewGameOptions) => void;
  resume: () => Promise<boolean>;
  abandon: () => void;
  next: () => void;

  setTab: (tab: Tab) => void;
  openPlayer: (id: string | null) => void;
  openNegotiation: (id: string | null) => void;
  openClub: (id: string | null) => void;
  notify: (message: string | null) => void;

  scoutSweep: (filters: ScoutFilters) => void;
  scoutFocus: (playerId: string) => void;
  shortlist: (playerId: string) => void;
  approach: (playerId: string, commissionPct: number) => void;
  dropClient: (playerId: string) => void;
  answerDemand: (playerId: string, demandId: string, optionId: string) => void;

  startDeal: (playerId: string, clubId: string, kind: Negotiation['kind']) => void;
  offerFee: (id: string, fee: number) => void;
  offerTerms: (id: string, wage: number, years: number, releaseClause: number) => void;
  offerCommission: (id: string, pct: number) => void;
  finishDeal: (id: string) => void;
  cancelDeal: (id: string) => void;
}

export const useGame = create<GameStore>((set, get) => {
  const scheduleSave = (): void => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const game = get().game;
      if (!game) return;
      void saveGame(game).then((result) => {
        if (!result.ok) set({ saveWarning: result.message ?? '저장에 실패했습니다.' });
        else if (get().saveWarning) set({ saveWarning: null });
      });
    }, 700);
  };

  /** 상태를 제자리에서 고친 뒤 화면을 갱신하고 저장을 예약합니다. */
  const commit = (message?: string): void => {
    set((store) => ({ rev: store.rev + 1, toast: message ?? store.toast }));
    scheduleSave();
  };

  return {
    game: null,
    rev: 0,
    tab: 'home',
    playerSheet: null,
    negotiationSheet: null,
    clubSheet: null,
    toast: null,
    busy: false,
    saveWarning: null,

    start: (options) => {
      const game = createGame(options);
      rng = new Rng(game.seed ^ 0x5bf03635);
      set({ game, rev: 0, tab: 'home', playerSheet: null, negotiationSheet: null, toast: null, saveWarning: null });
      scheduleSave();
    },

    resume: async () => {
      if (!hasSave()) return false;
      set({ busy: true });
      const game = await loadGame();
      set({ busy: false });
      if (!game) return false;
      rng = new Rng((game.seed ^ 0x5bf03635) + game.week);
      set({ game, rev: 0, tab: 'home' });
      return true;
    },

    abandon: () => {
      clearSave();
      set({ game: null, rev: 0, toast: null, saveWarning: null });
    },

    next: () => {
      const game = get().game;
      if (!game || get().busy) return;
      set({ busy: true });
      // 24개국이면 한 주에 수백 경기가 돌아갑니다. 버튼이 굳어 보이지 않도록
      // 한 프레임 양보한 뒤 실행합니다.
      requestAnimationFrame(() => {
        const previousSeason = game.season;
        const report = advanceWeek(game, rng);
        set({ busy: false });
        commit(report.seasonRolled && game.season !== previousSeason
          ? `${game.season} 시즌이 시작됐습니다.`
          : undefined);
      });
    },

    setTab: (tab) => set({ tab, playerSheet: null, negotiationSheet: null, clubSheet: null }),
    openPlayer: (id) => set({ playerSheet: id }),
    openNegotiation: (id) => set({ negotiationSheet: id }),
    openClub: (id) => set({ clubSheet: id }),
    notify: (message) => set({ toast: message }),

    scoutSweep: (filters) => {
      const game = get().game;
      if (!game) return;
      commit(sweep(game, filters, rng).message);
    },

    scoutFocus: (playerId) => {
      const game = get().game;
      if (!game) return;
      commit(focus(game, playerId).message);
    },

    shortlist: (playerId) => {
      const game = get().game;
      if (!game) return;
      toggleShortlist(game, playerId);
      commit();
    },

    approach: (playerId, commissionPct) => {
      const game = get().game;
      if (!game) return;
      commit(approachPlayer(game, playerId, commissionPct, rng).message);
    },

    dropClient: (playerId) => {
      const game = get().game;
      if (!game) return;
      const name = game.players[playerId]?.name ?? '선수';
      dropClientAction(game, playerId, true);
      set({ playerSheet: null });
      commit(`${name} 과의 대리인 계약을 해지했습니다.`);
    },

    answerDemand: (playerId, demandId, optionId) => {
      const game = get().game;
      if (!game) return;
      commit(resolveDemand(game, playerId, demandId, optionId, rng).message);
    },

    startDeal: (playerId, clubId, kind) => {
      const game = get().game;
      if (!game) return;
      const result = openNegotiation(game, playerId, clubId, kind, rng);
      if (result.ok && result.negotiationId) {
        set({ negotiationSheet: result.negotiationId, playerSheet: null, clubSheet: null, tab: 'deals' });
      }
      commit(result.message);
    },

    offerFee: (id, fee) => {
      const game = get().game;
      if (!game) return;
      commit(proposeFee(game, id, fee, rng).message);
    },

    offerTerms: (id, wage, years, releaseClause) => {
      const game = get().game;
      if (!game) return;
      commit(proposeTerms(game, id, wage, years, releaseClause).message);
    },

    offerCommission: (id, pct) => {
      const game = get().game;
      if (!game) return;
      commit(proposeCommission(game, id, pct).message);
    },

    finishDeal: (id) => {
      const game = get().game;
      if (!game) return;
      const result = completeNegotiation(game, id);
      if (result.ok) set({ negotiationSheet: null });
      commit(result.message);
    },

    cancelDeal: (id) => {
      const game = get().game;
      if (!game) return;
      withdraw(game, id);
      set({ negotiationSheet: null });
      commit('협상을 중단했습니다.');
    },
  };
});

/** 화면에서 상태를 읽는 표준 경로. rev 를 함께 구독해 갱신을 놓치지 않습니다. */
export function useGameState(): GameState {
  const game = useGame((store) => store.game);
  useGame((store) => store.rev);
  if (!game) throw new Error('게임이 시작되지 않았습니다.');
  return game;
}
