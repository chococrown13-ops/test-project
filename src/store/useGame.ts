import { create } from 'zustand';
import { FORMATIONS } from '../game/formations';
import { autoPickLineup, createNewGame, type NewGameOptions } from '../game/generate';
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
import {
  evaluateBid,
  executeTransfer,
  expireOffers,
  generateOffers,
  runAiTransfers,
  transferWindow,
  type BidResult,
} from '../game/transfer';
import type { FormationId, GameState, MatchEvent, Tactics } from '../game/types';

export type Screen = 'squad' | 'tactics' | 'match' | 'transfer' | 'league' | 'club';

interface GameStore {
  state: GameState | null;
  screen: Screen;
  /** Latest events, so the match screen can flash the newest line. */
  lastEvents: MatchEvent[];

  newGame: (options: NewGameOptions) => void;
  continueGame: () => boolean;
  abandonGame: () => void;

  /** Rename the competition. */
  setLeagueName: (name: string) => void;
  /** Rename or recolour any club in the league. */
  setTeamIdentity: (
    teamId: string,
    identity: { name?: string; shortName?: string; color?: string; accent?: string },
  ) => void;

  /** Bid for another club's player. Returns the club's answer. */
  bidForPlayer: (playerId: string, fee: number) => BidResult;
  /** Put one of your own players on the transfer list, or take him off it. */
  toggleTransferList: (playerId: string) => void;
  acceptOffer: (offerId: string) => void;
  rejectOffer: (offerId: string) => void;

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

  newGame: (options) => {
    const state = createNewGame(options);
    commit(set, state, { screen: 'squad', lastEvents: [] });
  },

  setLeagueName: (name) => {
    const state = get().state;
    if (!state) return;
    state.leagueName = name.trim() || state.leagueName;
    commit(set, state);
  },

  setTeamIdentity: (teamId, identity) => {
    const state = get().state;
    if (!state) return;
    const team = state.teams[teamId];
    if (!team) return;

    const name = identity.name?.trim();
    const shortName = identity.shortName?.trim().toUpperCase();
    if (name) team.name = name;
    // Keep the badge legible: two to four characters.
    if (shortName) team.shortName = shortName.slice(0, 4);
    if (identity.color) team.color = identity.color;
    if (identity.accent) team.accent = identity.accent;
    commit(set, state);
  },

  bidForPlayer: (playerId, fee) => {
    const state = get().state;
    if (!state) return { accepted: false, reason: '게임이 시작되지 않았습니다.' };

    const window = transferWindow(state.round, totalRounds(state.fixtures));
    if (!window.open) return { accepted: false, reason: '이적시장이 닫혀 있습니다.' };
    if (state.live) return { accepted: false, reason: '경기 중에는 영입할 수 없습니다.' };

    const seller = Object.values(state.teams).find(
      (team) => team.id !== state.clubId && team.players.some((p) => p.id === playerId),
    );
    const player = seller?.players.find((p) => p.id === playerId);
    if (!seller || !player) return { accepted: false, reason: '해당 선수를 찾을 수 없습니다.' };

    const club = state.teams[state.clubId];
    const rng = rngFor(state);
    const result = evaluateBid(club, seller, player, fee, rng);

    if (result.accepted) {
      executeTransfer(state, player, seller, club, fee);
      pushInbox(
        state,
        `영입 완료 — ${player.name}`,
        `${seller.name}으로부터 ${player.name} 영입에 합의했습니다.\n이적료 ${fee}K.`,
        'good',
      );
      commit(set, state);
    }
    return result;
  },

  toggleTransferList: (playerId) => {
    const state = get().state;
    if (!state) return;
    const listed = state.transfer.listed;
    const index = listed.indexOf(playerId);
    if (index >= 0) listed.splice(index, 1);
    else listed.push(playerId);
    commit(set, state);
  },

  acceptOffer: (offerId) => {
    const state = get().state;
    if (!state) return;
    const offer = state.transfer.offers.find((o) => o.id === offerId);
    if (!offer) return;

    const club = state.teams[state.clubId];
    const buyer = state.teams[offer.fromTeamId];
    const player = club.players.find((p) => p.id === offer.playerId);
    if (!buyer || !player) return;

    executeTransfer(state, player, club, buyer, offer.fee);
    pushInbox(
      state,
      `이적 완료 — ${player.name}`,
      `${player.name}이(가) ${buyer.name}(으)로 이적했습니다.\n이적료 ${offer.fee}K가 예산에 반영되었습니다.`,
      'neutral',
    );
    commit(set, state);
  },

  rejectOffer: (offerId) => {
    const state = get().state;
    if (!state) return;
    state.transfer.offers = state.transfer.offers.filter((o) => o.id !== offerId);
    commit(set, state);
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
      runTransferActivity(state, rng);
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

/**
 * Everything the transfer market does between rounds: lapse stale bids, let
 * the AI clubs deal with each other, and put new offers on the user's desk.
 */
function runTransferActivity(state: GameState, rng: Rng): void {
  const window = transferWindow(state.round, totalRounds(state.fixtures));

  const expired = expireOffers(state);
  if (!window.open) {
    // Nothing carries across a closed window.
    state.transfer.offers = [];
    return;
  }

  runAiTransfers(state, rng);

  const offers = generateOffers(state, rng);
  state.transfer.offers.push(...offers);

  const club = state.teams[state.clubId];
  offers.forEach((offer) => {
    const player = club.players.find((p) => p.id === offer.playerId);
    const buyer = state.teams[offer.fromTeamId];
    if (!player || !buyer) return;
    pushInbox(
      state,
      `이적 제안 — ${player.name}`,
      `${buyer.name}이(가) ${player.name}에 대해 ${offer.fee}K를 제안했습니다.\n` +
        `이적 탭에서 수락하거나 거절할 수 있습니다. ${offer.expiresRound + 1}라운드까지 유효합니다.`,
      'neutral',
    );
  });

  if (expired.length > 0 && offers.length === 0) {
    pushInbox(
      state,
      '이적 제안 만료',
      `${expired.length}건의 제안이 답을 받지 못하고 철회되었습니다.`,
      'neutral',
    );
  }
}

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
