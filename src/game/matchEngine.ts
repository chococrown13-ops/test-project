import { commentary } from './commentary';
import { FORMATIONS, ROLE_GROUP } from './formations';
import { Rng, clamp } from './rng';
import { effectiveAbility, possessionSplit, teamStrength } from './ratings';
import type { LiveMatch, MatchEvent, MatchStats, Player, Team } from './types';

export const MATCH_LENGTH = 90;
/** Applied to the home side's midfield in the possession split. */
const HOME_ADVANTAGE = 1.08;
/** Extra share of chances the home side creates, on top of the ball it wins. */
const HOME_CHANCE_BONUS = 1.07;

function emptyMatchStats(): MatchStats {
  return { shots: 0, onTarget: 0, possession: 50, corners: 0, fouls: 0, yellows: 0, reds: 0 };
}

export function createLiveMatch(fixtureId: string, home: Team, away: Team): LiveMatch {
  const ratings: Record<string, number> = {};
  [...home.lineup, ...away.lineup].forEach((id) => {
    ratings[id] = 6.0;
  });

  return {
    fixtureId,
    homeId: home.id,
    awayId: away.id,
    minute: 0,
    homeGoals: 0,
    awayGoals: 0,
    events: [],
    homeStats: emptyMatchStats(),
    awayStats: emptyMatchStats(),
    ratings,
    scorers: {},
    homeOnPitch: home.lineup.slice(),
    awayOnPitch: away.lineup.slice(),
    homeParticipants: home.lineup.slice(),
    awayParticipants: away.lineup.slice(),
    homeSubsLeft: 5,
    awaySubsLeft: 5,
    sentOff: [],
    injured: [],
    finished: false,
    acknowledged: false,
  };
}

interface SideContext {
  team: Team;
  onPitch: string[];
  stats: MatchStats;
  strength: ReturnType<typeof teamStrength>;
  isHome: boolean;
}

function buildSide(team: Team, onPitch: string[], stats: MatchStats, isHome: boolean): SideContext {
  return { team, onPitch, stats, strength: teamStrength(team, onPitch), isHome };
}

/**
 * Weighted pick of the player involved in an attacking move. Forwards get the
 * ball in dangerous areas far more often than defenders do.
 */
function pickAttacker(side: SideContext, rng: Rng, forShot: boolean): Player | null {
  const byId = new Map(side.team.players.map((p) => [p.id, p]));
  const candidates = side.onPitch
    .map((id) => byId.get(id))
    .filter((p): p is Player => !!p && p.role !== 'GK');
  if (candidates.length === 0) return null;

  const weights = candidates.map((player) => {
    const slotIndex = side.team.lineup.indexOf(player.id);
    const slot = slotIndex >= 0 ? FORMATIONS[side.team.formation].slots[slotIndex] : player.role;
    const group = ROLE_GROUP[slot];
    const positional = group === 'FW' ? 5 : group === 'MF' ? 2.4 : 0.6;
    // A shot weights finishing; build-up play weights passing and dribbling.
    const quality = forShot
      ? player.attributes.shooting * 0.7 + player.attributes.dribbling * 0.3
      : player.attributes.passing * 0.6 + player.attributes.dribbling * 0.4;
    return positional * (quality / 60) * (player.fitness / 100);
  });

  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return rng.pick(candidates);
  let roll = rng.next() * total;
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

function keeperOf(side: SideContext): Player | null {
  const byId = new Map(side.team.players.map((p) => [p.id, p]));
  const keeper = side.onPitch.map((id) => byId.get(id)).find((p) => p?.role === 'GK');
  if (keeper) return keeper;
  // Somebody has to go in goal.
  const first = side.onPitch.map((id) => byId.get(id)).find((p): p is Player => !!p);
  return first ?? null;
}

function bumpRating(live: LiveMatch, playerId: string, delta: number): void {
  const current = live.ratings[playerId] ?? 6.0;
  live.ratings[playerId] = clamp(Number((current + delta).toFixed(2)), 1, 10);
}

function pushEvent(
  live: LiveMatch,
  kind: MatchEvent['kind'],
  side: MatchEvent['side'],
  text: string,
): MatchEvent {
  const event: MatchEvent = {
    minute: live.minute,
    kind,
    side,
    text,
    homeGoals: live.homeGoals,
    awayGoals: live.awayGoals,
  };
  live.events.push(event);
  return event;
}

/**
 * Advance the match by one minute, mutating `live` and returning the events
 * generated. The caller owns the clock so the UI can play at any speed.
 */
export function simulateMinute(live: LiveMatch, home: Team, away: Team, rng: Rng): MatchEvent[] {
  if (live.finished) return [];

  const before = live.events.length;
  live.minute += 1;

  const homeSide = buildSide(home, live.homeOnPitch, live.homeStats, true);
  const awaySide = buildSide(away, live.awayOnPitch, live.awayStats, false);

  if (live.minute === 1) {
    pushEvent(live, 'kickoff', 'neutral', '경기 시작을 알리는 휘슬이 울립니다.');
  }

  const homeShare = possessionSplit(homeSide.strength, awaySide.strength, HOME_ADVANTAGE);
  live.homeStats.possession = Math.round(homeShare * 100);
  live.awayStats.possession = 100 - live.homeStats.possession;

  const attackingSide = rng.bool(homeShare) ? homeSide : awaySide;
  const defendingSide = attackingSide === homeSide ? awaySide : homeSide;

  drainFitness(attackingSide, defendingSide, live);

  // Chance frequency scales with attack vs defence. Tuned so a full season
  // lands near 2.7 goals a match, roughly what a real top division produces.
  const balance = attackingSide.strength.attack / (attackingSide.strength.attack + defendingSide.strength.defence);
  const tempoBoost = attackingSide.team.tactics.tempo === 'high' ? 1.12 : attackingSide.team.tactics.tempo === 'slow' ? 0.9 : 1;
  const homeBoost = attackingSide.isHome ? HOME_CHANCE_BONUS : 1;
  const chanceProb = clamp(balance * 0.255 * tempoBoost * homeBoost, 0.02, 0.28);

  if (rng.bool(chanceProb)) {
    resolveChance(live, attackingSide, defendingSide, rng);
  }

  // Fouls, and the cards that follow from them.
  const pressingFactor =
    defendingSide.team.tactics.pressing === 'high' ? 1.5 : defendingSide.team.tactics.pressing === 'low' ? 0.7 : 1;
  if (rng.bool(0.055 * pressingFactor)) {
    resolveFoul(live, defendingSide, rng);
  }

  if (rng.bool(0.003)) {
    resolveInjury(live, rng.bool(0.5) ? homeSide : awaySide, rng);
  }

  if (live.minute === 45) {
    pushEvent(live, 'halftime', 'neutral', `전반 종료. ${live.homeGoals} - ${live.awayGoals}`);
  }

  if (live.minute >= MATCH_LENGTH) {
    finishMatch(live, home, away);
  }

  return live.events.slice(before);
}

function drainFitness(attacking: SideContext, defending: SideContext, live: LiveMatch): void {
  const drain = (side: SideContext, rate: number) => {
    const byId = new Map(side.team.players.map((p) => [p.id, p]));
    side.onPitch.forEach((id) => {
      const player = byId.get(id);
      if (!player) return;
      // Fitter, stronger players last longer.
      const resilience = 0.6 + (player.attributes.physical / 100) * 0.6;
      player.fitness = clamp(player.fitness - rate / resilience, 0, 100);
    });
  };

  const tempoRate = (side: SideContext) =>
    side.team.tactics.tempo === 'high' ? 0.42 : side.team.tactics.tempo === 'slow' ? 0.26 : 0.34;
  const pressRate = (side: SideContext) =>
    side.team.tactics.pressing === 'high' ? 0.12 : side.team.tactics.pressing === 'low' ? 0 : 0.06;

  drain(attacking, tempoRate(attacking) + pressRate(attacking));
  drain(defending, tempoRate(defending) * 0.85 + pressRate(defending));
  void live;
}

function resolveChance(live: LiveMatch, attack: SideContext, defence: SideContext, rng: Rng): void {
  const shooter = pickAttacker(attack, rng, true);
  const keeper = keeperOf(defence);
  if (!shooter || !keeper) return;

  const creator = pickAttacker(attack, rng, false);
  const side = attack.isHome ? 'home' : 'away';
  const ctx = {
    player: shooter.name,
    assist: creator && creator.id !== shooter.id ? creator.name : undefined,
    keeper: keeper.name,
    team: attack.team.shortName,
    opponent: defence.team.shortName,
  };

  attack.stats.shots += 1;

  // Did the chance even become a shot on target?
  const finishing = effectiveAbility(shooter) * 0.6 + shooter.attributes.shooting * 0.4;
  const blockChance = clamp(defence.strength.defence / (defence.strength.defence + finishing * 1.5), 0.12, 0.45);

  if (rng.bool(blockChance)) {
    if (rng.bool(0.4)) {
      attack.stats.corners += 1;
    }
    pushEvent(live, 'chance', side, commentary.block(rng, ctx));
    bumpRating(live, shooter.id, 0.02);
    return;
  }

  attack.stats.onTarget += 1;

  // On target: keeper vs finisher.
  const keeperQuality = effectiveAbility(keeper) * 0.55 + keeper.attributes.goalkeeping * 0.45;
  const goalChance = clamp(finishing / (finishing + keeperQuality * 1.45), 0.1, 0.58);

  if (rng.bool(goalChance)) {
    if (attack.isHome) live.homeGoals += 1;
    else live.awayGoals += 1;

    live.scorers[shooter.id] = (live.scorers[shooter.id] ?? 0) + 1;
    shooter.season.goals += 1;
    shooter.career.goals += 1;
    bumpRating(live, shooter.id, 1.1);
    bumpRating(live, keeper.id, -0.35);

    if (ctx.assist && creator) {
      creator.season.assists += 1;
      creator.career.assists += 1;
      bumpRating(live, creator.id, 0.5);
    }
    // The whole back line carries a goal conceded.
    defence.onPitch.forEach((id) => bumpRating(live, id, -0.1));

    pushEvent(live, 'goal', side, commentary.goal(rng, ctx));
    return;
  }

  // Saved or missed.
  if (rng.bool(0.6)) {
    bumpRating(live, keeper.id, 0.28);
    bumpRating(live, shooter.id, 0.05);
    pushEvent(live, 'save', side, commentary.save(rng, ctx));
  } else {
    bumpRating(live, shooter.id, -0.18);
    pushEvent(live, 'miss', side, commentary.miss(rng, ctx));
  }
}

function resolveFoul(live: LiveMatch, side: SideContext, rng: Rng): void {
  const byId = new Map(side.team.players.map((p) => [p.id, p]));
  const candidates = side.onPitch
    .map((id) => byId.get(id))
    .filter((p): p is Player => !!p && p.role !== 'GK');
  if (candidates.length === 0) return;

  const offender = rng.pick(candidates);
  const eventSide = side.isHome ? 'home' : 'away';
  side.stats.fouls += 1;

  const ctx = {
    player: offender.name,
    team: side.team.shortName,
    opponent: '',
  };

  // Tired and clumsy players pick up more cards.
  const cardChance = 0.2 + (offender.fitness < 55 ? 0.12 : 0);

  if (rng.bool(cardChance)) {
    const alreadyBooked = live.events.some(
      (e) => e.kind === 'yellow' && e.text.includes(offender.name),
    );
    if (alreadyBooked || rng.bool(0.03)) {
      side.stats.reds += 1;
      offender.season.redCards += 1;
      offender.career.redCards += 1;
      live.sentOff.push(offender.id);
      removeFromPitch(live, side, offender.id);
      bumpRating(live, offender.id, -1.5);
      pushEvent(live, 'red', eventSide, commentary.red(rng, ctx));
      return;
    }
    side.stats.yellows += 1;
    offender.season.yellowCards += 1;
    offender.career.yellowCards += 1;
    bumpRating(live, offender.id, -0.25);
    pushEvent(live, 'yellow', eventSide, commentary.yellow(rng, ctx));
    return;
  }

  pushEvent(live, 'foul', eventSide, commentary.foul(rng, ctx));
}

function resolveInjury(live: LiveMatch, side: SideContext, rng: Rng): void {
  const byId = new Map(side.team.players.map((p) => [p.id, p]));
  const candidates = side.onPitch.map((id) => byId.get(id)).filter((p): p is Player => !!p);
  if (candidates.length === 0) return;

  const victim = rng.pick(candidates);
  if (live.injured.includes(victim.id)) return;

  live.injured.push(victim.id);
  victim.injuredFor = rng.int(1, 6);
  victim.fitness = clamp(victim.fitness - 25, 5, 100);

  pushEvent(
    live,
    'injury',
    side.isHome ? 'home' : 'away',
    commentary.injury(rng, {
      player: victim.name,
      team: side.team.shortName,
      opponent: '',
    }),
  );
}

function removeFromPitch(live: LiveMatch, side: SideContext, playerId: string): void {
  const list = side.isHome ? live.homeOnPitch : live.awayOnPitch;
  const index = list.indexOf(playerId);
  if (index >= 0) list.splice(index, 1);
}

/** Bring `incoming` on for `outgoing`. Returns false if the swap isn't legal. */
export function makeSubstitution(
  live: LiveMatch,
  team: Team,
  outgoingId: string,
  incomingId: string,
): boolean {
  const isHome = team.id === live.homeId;
  const onPitch = isHome ? live.homeOnPitch : live.awayOnPitch;
  const subsLeft = isHome ? live.homeSubsLeft : live.awaySubsLeft;

  if (subsLeft <= 0) return false;
  const index = onPitch.indexOf(outgoingId);
  if (index < 0) return false;
  if (onPitch.includes(incomingId)) return false;
  if (!team.bench.includes(incomingId)) return false;

  onPitch[index] = incomingId;
  if (isHome) {
    live.homeSubsLeft -= 1;
    live.homeParticipants.push(incomingId);
  } else {
    live.awaySubsLeft -= 1;
    live.awayParticipants.push(incomingId);
  }

  // A substitute inherits the slot's expectations but starts at a neutral mark.
  if (live.ratings[incomingId] === undefined) live.ratings[incomingId] = 6.0;

  const outgoing = team.players.find((p) => p.id === outgoingId);
  const incoming = team.players.find((p) => p.id === incomingId);
  pushEvent(
    live,
    'sub',
    isHome ? 'home' : 'away',
    `교체 — ${team.shortName}: ${incoming?.name ?? '?'} IN, ${outgoing?.name ?? '?'} OUT`,
  );
  return true;
}

/** The AI manager: rest tired legs and chase the game when behind. */
export function autoSubstitute(live: LiveMatch, team: Team, rng: Rng): void {
  const isHome = team.id === live.homeId;
  const onPitch = isHome ? live.homeOnPitch : live.awayOnPitch;
  const subsLeft = isHome ? live.homeSubsLeft : live.awaySubsLeft;
  if (subsLeft <= 0 || live.minute < 55) return;
  if (!rng.bool(0.18)) return;

  const byId = new Map(team.players.map((p) => [p.id, p]));
  const tired = onPitch
    .map((id) => byId.get(id))
    .filter((p): p is Player => !!p && p.role !== 'GK')
    .sort((a, b) => a.fitness - b.fitness)[0];
  if (!tired || tired.fitness > 62) return;

  const replacement = team.bench
    .map((id) => byId.get(id))
    .filter((p): p is Player => !!p && !onPitch.includes(p.id) && p.injuredFor === 0)
    .sort((a, b) => effectiveAbility(b) - effectiveAbility(a))[0];
  if (!replacement) return;

  makeSubstitution(live, team, tired.id, replacement.id);
}

function finishMatch(live: LiveMatch, home: Team, away: Team): void {
  live.finished = true;

  const homeClean = live.awayGoals === 0;
  const awayClean = live.homeGoals === 0;

  const settle = (team: Team, participants: string[], cleanSheet: boolean, won: boolean, drew: boolean) => {
    const byId = new Map(team.players.map((p) => [p.id, p]));
    participants.forEach((id) => {
      const player = byId.get(id);
      if (!player) return;
      player.season.appearances += 1;
      player.career.appearances += 1;
      if (cleanSheet && (player.role === 'GK' || player.group === 'DF')) {
        player.season.cleanSheets += 1;
        player.career.cleanSheets += 1;
        bumpRating(live, id, 0.3);
      }
      // The result colours everyone's mark a little.
      bumpRating(live, id, won ? 0.25 : drew ? 0 : -0.25);
      const rating = live.ratings[id] ?? 6;
      player.season.ratingSum += rating;
      player.career.ratingSum += rating;
    });
  };

  const homeWon = live.homeGoals > live.awayGoals;
  const drew = live.homeGoals === live.awayGoals;
  settle(home, live.homeParticipants, homeClean, homeWon, drew);
  settle(away, live.awayParticipants, awayClean, !homeWon && !drew, drew);

  pushEvent(
    live,
    'fulltime',
    'neutral',
    `경기 종료! ${home.shortName} ${live.homeGoals} - ${live.awayGoals} ${away.shortName}`,
  );
}

/** Fast-forward a whole match with no UI, used for the other fixtures. */
export function simulateFullMatch(fixtureId: string, home: Team, away: Team, rng: Rng): LiveMatch {
  const live = createLiveMatch(fixtureId, home, away);
  while (!live.finished) {
    simulateMinute(live, home, away, rng);
    autoSubstitute(live, home, rng);
    autoSubstitute(live, away, rng);
  }
  return live;
}
