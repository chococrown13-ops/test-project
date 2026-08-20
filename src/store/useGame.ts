import { create } from 'zustand';
import { FORMATIONS } from '../game/formations';
import { autoPickLineup, createNewGame } from '../game/generate';
import { buildTable, positionOf, totalRounds } from '../game/league';
import {
  autoSubstitute,
  createLiveMatch,
  makeSubstitution,
  simulateFullMatch,
  simulateMinute,
} from '../game/matchEngine';
import { Rng } from '../game/rng';
import { clearSave, loadGame, saveGame } from '../game/save';
import { advanceWeek, applyMatchForm, applyResultMorale, pushInbox, rolloverSeason } from '../game/season';
import type { FormationId, GameState, MatchEvent, Tactics } from '../game/types';

export type Screen = 'squad' | 'tactics' | 'match' | 'league' | 'club';

interface GameStore {
  state: GameState | null;
  screen: Screen;
  /** Latest events, so the match screen can flash the newest line. */
  lastEvents: MatchEvent[];

  newGame: (managerName: string, clubId: string | null) => void;
  continueGame: () => boolean;
  abandonGame: () => void;

  setScreen: (screen: Screen) => void;

  setFormation: (formation: FormationId) => void;
  setTactics: (tactics: Partial<Tactics>) => void;
  /** Swap two players between lineup slots, or a lineup slot and the bench. */
  swapPlayers: (aId: string, bId: string) => void;
  autoPick: () => void;

  startMatch: () => void;
  tickMatch: () => void;
  substitute: (outgoingId: string, incomingId: string) => boolean;
  concludeMatch: () => void;
  nextSeason: () => void;

  markInboxRead: (id: string) => void;
}

/**
 * Every mutating action replaces the root object so React sees a new identity.
 * The game modules mutate the draft in place — cheaper than cloning ~370
 * players on each of the 90 ticks in a match.
 */
const commit = (
  set: (partial: Partial<GameStore>) => void,
  state: GameState,
  extra: Partial<GameStore> = {},
) => {
  saveGame(state);
  set({ state: { ...state }, ...extra });
};

/** A fresh RNG per action, seeded off the save so results stay varied. */
const rngFor = (state: GameState): Rng =>
  new Rng((state.seed + state.round * 7919 + state.season * 104729 + Date.now()) >>> 0);

export const useGame = create<GameStore>((set, get) => ({
  state: null,
  screen: 'squad',
  lastEvents: [],

  newGame: (managerName, clubId) => {
    const state = createNewGame(managerName, clubId);
    commit(set, state, { screen: 'squad', lastEvents: [] });
  },

  continueGame: () => {
    const loaded = loadGame();
    if (!loaded) return false;
    set({ state: loaded, screen: 'squad', lastEvents: [] });
    return true;
  },

  abandonGame: () => {
    clearSave();
    set({ state: null, screen: 'squad', lastEvents: [] });
  },

  setScreen: (screen) => set({ screen }),

  setFormation: (formation) => {
    const state = get().state;
    if (!state) return;
    const club = state.teams[state.clubId];
    club.formation = formation;
    // Slot counts change with the shape, so re-pick rather than leave gaps.
    const picked = autoPickLineup(club);
    club.lineup = picked.lineup;
    club.bench = picked.bench;
    commit(set, state);
  },

  setTactics: (tactics) => {
    const state = get().state;
    if (!state) return;
    const club = state.teams[state.clubId];
    club.tactics = { ...club.tactics, ...tactics };
    commit(set, state);
  },

  swapPlayers: (aId, bId) => {
    const state = get().state;
    if (!state || aId === bId) return;
    const club = state.teams[state.clubId];

    const aLineup = club.lineup.indexOf(aId);
    const bLineup = club.lineup.indexOf(bId);
    const aBench = club.bench.indexOf(aId);
    const bBench = club.bench.indexOf(bId);

    if (aLineup >= 0 && bLineup >= 0) {
      [club.lineup[aLineup], club.lineup[bLineup]] = [club.lineup[bLineup], club.lineup[aLineup]];
    } else if (aLineup >= 0 && bBench >= 0) {
      club.lineup[aLineup] = bId;
      club.bench[bBench] = aId;
    } else if (aBench >= 0 && bLineup >= 0) {
      club.lineup[bLineup] = aId;
      club.bench[aBench] = bId;
    } else if (aBench >= 0 && bBench >= 0) {
      [club.bench[aBench], club.bench[bBench]] = [club.bench[bBench], club.bench[aBench]];
    } else {
      return;
    }
    commit(set, state);
  },

  autoPick: () => {
    const state = get().state;
    if (!state) return;
    const club = state.teams[state.clubId];
    const picked = autoPickLineup(club);
    club.lineup = picked.lineup;
    club.bench = picked.bench;
    commit(set, state);
  },

  startMatch: () => {
    const state = get().state;
    if (!state || state.live || state.seasonOver) return;

    const fixture = state.fixtures.find(
      (f) => f.round === state.round && (f.homeId === state.clubId || f.awayId === state.clubId),
    );
    if (!fixture) return;

    const club = state.teams[state.clubId];
    const slots = FORMATIONS[club.formation].slots.length;
    // Never kick off short-handed because of an injury picked up in training.
    if (club.lineup.length < slots || club.lineup.some((id) => {
      const player = club.players.find((p) => p.id === id);
      return !player || player.injuredFor > 0;
    })) {
      const picked = autoPickLineup(club);
      club.lineup = picked.lineup;
      club.bench = picked.bench;
    }

    // The AI opponents pick their own sides.
    Object.values(state.teams).forEach((team) => {
      if (team.id === state.clubId) return;
      const picked = autoPickLineup(team);
      team.lineup = picked.lineup;
      team.bench = picked.bench;
    });

    state.live = createLiveMatch(
      fixture.id,
      state.teams[fixture.homeId],
      state.teams[fixture.awayId],
    );
    commit(set, state, { screen: 'match', lastEvents: [] });
  },

  tickMatch: () => {
    const state = get().state;
    if (!state?.live || state.live.finished) return;

    const live = state.live;
    const home = state.teams[live.homeId];
    const away = state.teams[live.awayId];
    const rng = new Rng((state.seed + live.minute * 31337 + Date.now()) >>> 0);

    const events = simulateMinute(live, home, away, rng);
    // Only the AI side gets substitutions made for it.
    if (home.id !== state.clubId) autoSubstitute(live, home, rng);
    if (away.id !== state.clubId) autoSubstitute(live, away, rng);

    commit(set, state, { lastEvents: events });
  },

  substitute: (outgoingId, incomingId) => {
    const state = get().state;
    if (!state?.live || state.live.finished) return false;
    const club = state.teams[state.clubId];
    const ok = makeSubstitution(state.live, club, outgoingId, incomingId);
    if (ok) commit(set, state);
    return ok;
  },

  concludeMatch: () => {
    const state = get().state;
    if (!state?.live?.finished) return;

    const live = state.live;
    const rng = rngFor(state);

    // 1. Record the user's result.
    const fixture = state.fixtures.find((f) => f.id === live.fixtureId);
    if (fixture) {
      fixture.played = true;
      fixture.homeGoals = live.homeGoals;
      fixture.awayGoals = live.awayGoals;
    }

    // 2. Form and morale from the match just played.
    [state.teams[live.homeId], state.teams[live.awayId]].forEach((team) => {
      team.players.forEach((player) => {
        const rating = live.ratings[player.id];
        if (rating !== undefined) applyMatchForm(player, rating);
      });
    });
    applyResultMorale(state.teams[live.homeId], live.homeGoals, live.awayGoals, rng);
    applyResultMorale(state.teams[live.awayId], live.awayGoals, live.homeGoals, rng);

    // 3. Play out the rest of the round.
    state.fixtures
      .filter((f) => f.round === state.round && !f.played)
      .forEach((f) => {
        const home = state.teams[f.homeId];
        const away = state.teams[f.awayId];
        const result = simulateFullMatch(f.id, home, away, rng);
        f.played = true;
        f.homeGoals = result.homeGoals;
        f.awayGoals = result.awayGoals;

        [home, away].forEach((team) => {
          team.players.forEach((player) => {
            const rating = result.ratings[player.id];
            if (rating !== undefined) applyMatchForm(player, rating);
          });
        });
        applyResultMorale(home, result.homeGoals, result.awayGoals, rng);
        applyResultMorale(away, result.awayGoals, result.homeGoals, rng);
      });

    // 4. Roll the calendar forward.
    state.live = null;
    state.round += 1;
    advanceWeek(state, rng);

    const rounds = totalRounds(state.fixtures);
    if (state.round >= rounds) {
      state.seasonOver = true;
    } else {
      reportProgress(state);
    }

    commit(set, state, { screen: state.seasonOver ? 'league' : 'league', lastEvents: [] });
  },

  nextSeason: () => {
    const state = get().state;
    if (!state?.seasonOver) return;
    rolloverSeason(state, rngFor(state));
    commit(set, state, { screen: 'squad', lastEvents: [] });
  },

  markInboxRead: (id) => {
    const state = get().state;
    if (!state) return;
    const item = state.inbox.find((i) => i.id === id);
    if (item) item.read = true;
    commit(set, state);
  },
}));

/** Board check-ins at the quarter marks of the season. */
function reportProgress(state: GameState): void {
  const rounds = totalRounds(state.fixtures);
  const checkpoints = [Math.floor(rounds / 4), Math.floor(rounds / 2), Math.floor((rounds * 3) / 4)];
  if (!checkpoints.includes(state.round)) return;

  const table = buildTable(state.fixtures, Object.keys(state.teams));
  const position = positionOf(table, state.clubId);
  const club = state.teams[state.clubId];
  const ahead = position <= club.expectation;

  pushInbox(
    state,
    `이사회 중간 평가 — 현재 ${position}위`,
    ahead
      ? `목표(${club.expectation}위)를 웃도는 순위입니다. 이사회는 현재 흐름에 만족하고 있습니다.`
      : `목표는 ${club.expectation}위입니다. 지금 순위로는 부족합니다. 반등이 필요합니다.`,
    ahead ? 'good' : 'bad',
  );
}
