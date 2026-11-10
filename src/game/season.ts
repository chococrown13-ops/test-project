import { autoPickLineup, buildFixtures, emptyStats, nextId, restockSquad } from './generate';
import { buildTable, positionOf } from './league';
import { Rng, clamp } from './rng';
import { overall } from './ratings';
import type { GameState, InboxItem, Player, SeasonRecord, Team } from './types';

/** Recovery, morale drift and injury countdown between rounds. */
export function advanceWeek(state: GameState, rng: Rng): void {
  Object.values(state.teams).forEach((team) => {
    team.players.forEach((player) => {
      // Rest between rounds. A full 90 minutes costs roughly 35 fitness, so
      // these rates let a starter almost recover while rotation fully does.
      const recovery = player.age <= 24 ? 36 : player.age <= 30 ? 32 : 27;
      player.fitness = clamp(player.fitness + recovery + rng.int(-3, 4), 0, 100);

      if (player.injuredFor > 0) {
        player.injuredFor -= 1;
        // Coming back from injury costs sharpness.
        if (player.injuredFor === 0) {
          player.fitness = clamp(player.fitness - 15, 30, 100);
          player.form = clamp(player.form - 8, 20, 100);
        }
      }

      // Form and morale drift back toward the middle so neither a hot streak
      // nor a bad run runs away with itself over a season.
      player.form = clamp(player.form + (58 - player.form) * 0.12 + rng.int(-4, 4), 10, 100);
      player.morale = clamp(player.morale + (60 - player.morale) * 0.2, 10, 100);
    });
  });
}

/** Apply a result's emotional fallout to a squad. */
export function applyResultMorale(team: Team, scored: number, conceded: number, rng: Rng): void {
  const swing = scored > conceded ? rng.int(3, 6) : scored === conceded ? rng.int(-1, 1) : -rng.int(3, 6);
  team.players.forEach((player) => {
    player.morale = clamp(player.morale + swing, 5, 100);
  });
}

/** Move a player's form toward his match rating. */
export function applyMatchForm(player: Player, rating: number): void {
  const target = clamp((rating - 4) * 22, 10, 100);
  player.form = clamp(player.form + (target - player.form) * 0.3, 10, 100);
  if (rating >= 8) player.morale = clamp(player.morale + 5, 5, 100);
  else if (rating < 5.5) player.morale = clamp(player.morale - 4, 5, 100);
}

export function pushInbox(
  state: GameState,
  subject: string,
  body: string,
  tone: InboxItem['tone'] = 'neutral',
): void {
  state.inbox.unshift({
    id: nextId('m'),
    week: state.round,
    subject,
    body,
    read: false,
    tone,
  });
  // Keep the mailbox from growing without bound across seasons.
  if (state.inbox.length > 60) state.inbox.length = 60;
}

/**
 * End-of-season rollover: age the squad, develop or decline each player,
 * record the finishing position, then rebuild the fixture list.
 */
export function rolloverSeason(state: GameState, rng: Rng): SeasonRecord {
  const teamIds = Object.keys(state.teams);
  const table = buildTable(state.fixtures, teamIds);
  const club = state.teams[state.clubId];
  const row = table.find((r) => r.teamId === state.clubId)!;
  const position = positionOf(table, state.clubId);

  const topScorer = club.players.reduce<Player | null>(
    (best, p) => (!best || p.season.goals > best.season.goals ? p : best),
    null,
  );

  const record: SeasonRecord = {
    season: state.season,
    position,
    points: row.points,
    won: row.won,
    drawn: row.drawn,
    lost: row.lost,
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
    topScorer: topScorer?.name ?? '-',
    topScorerGoals: topScorer?.season.goals ?? 0,
  };

  const retirements: string[] = [];

  Object.values(state.teams).forEach((team) => {
    team.players.forEach((player) => developPlayer(player, rng));

    // Retire the oldest players who have run out of road, then bring the
    // squad back up to a full complement through the academy.
    team.players = team.players.filter((p) => {
      const retiring = p.age > 35 && rng.bool(0.55);
      if (retiring && team.id === state.clubId) retirements.push(`${p.name} (${p.age}세)`);
      return !retiring;
    });
    team.players = restockSquad(team, rng);

    team.players.forEach((p) => {
      p.season = emptyStats();
      p.fitness = rng.int(85, 100);
      p.form = rng.int(45, 65);
      p.morale = rng.int(55, 78);
      p.injuredFor = 0;
    });
    const picked = autoPickLineup(team);
    team.lineup = picked.lineup;
    team.bench = picked.bench;

    // Prize money: finishing higher funds a bigger rebuild next season.
    const finish = positionOf(table, team.id);
    const prize = Math.round((teamIds.length - finish + 1) * team.reputation * 6);
    team.budget += prize;
    team.wageBudget = Math.round(
      Math.max(
        team.wageBudget,
        team.players.reduce((sum, p) => sum + p.wage, 0) * 1.2,
      ),
    );
  });

  // Windows reopen for pre-season with a clean slate.
  state.transfer.listed = [];
  state.transfer.offers = [];

  state.history.push(record);
  state.season += 1;
  state.round = 0;
  state.seasonOver = false;
  state.live = null;
  state.fixtures = buildFixtures(teamIds, rng);

  // The board resets its demands based on where you actually finished.
  club.expectation = clamp(position <= 3 ? position : position - 1, 1, teamIds.length);

  const met = position <= club.expectation;
  pushInbox(
    state,
    `${state.season - 1}시즌 결산 — ${position}위`,
    `${record.won}승 ${record.drawn}무 ${record.lost}패, 승점 ${record.points}점으로 시즌을 마쳤습니다.\n` +
      `득점왕: ${record.topScorer} (${record.topScorerGoals}골)\n\n` +
      (retirements.length > 0
        ? `은퇴: ${retirements.join(', ')}\n유스 선수들이 빈자리를 채웠습니다.\n\n`
        : '') +
      (met
        ? `이사회는 결과에 만족하고 있습니다. 다음 시즌 목표는 ${club.expectation}위입니다.`
        : `이사회는 아쉬움을 표했습니다. 다음 시즌에는 ${club.expectation}위 안에 들어야 합니다.`),
    met ? 'good' : 'bad',
  );

  return record;
}

/** Young players grow toward their potential; older ones fade. */
function developPlayer(player: Player, rng: Rng): void {
  player.age += 1;
  const current = overall(player);
  const keys = ['shooting', 'passing', 'dribbling', 'defending', 'physical', 'goalkeeping'] as const;

  if (player.age <= 23) {
    const room = player.potential - current;
    const growth = room > 0 ? rng.int(1, Math.max(2, Math.min(6, room))) : 0;
    for (let i = 0; i < growth; i++) {
      const key = rng.pick(keys.filter((k) => (k === 'goalkeeping') === (player.role === 'GK')));
      player.attributes[key] = clamp(player.attributes[key] + 1, 1, 99);
    }
  } else if (player.age >= 31) {
    const decline = player.age >= 34 ? rng.int(2, 5) : rng.int(0, 3);
    for (let i = 0; i < decline; i++) {
      // Legs go first; technique lasts.
      const key = rng.bool(0.6) ? 'physical' : rng.pick(keys);
      player.attributes[key] = clamp(player.attributes[key] - 1, 1, 99);
    }
  }

  const ovr = overall(player);
  const ageFactor =
    player.age <= 23 ? 1.35 : player.age <= 27 ? 1.15 : player.age <= 30 ? 0.85 : player.age <= 33 ? 0.5 : 0.25;
  player.value = Math.round(Math.pow(ovr / 10, 3.1) * 9 * ageFactor);
  player.wage = Math.max(2, Math.round(player.value / 130));
}
