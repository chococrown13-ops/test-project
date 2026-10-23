import { familiarityMult } from '../ability';
import { A, H } from '../attributes';
import { FORMATIONS, type Position } from '../formations';
import { Rng, clamp } from '../rng';
import { ROLE_BY_ID, type Role } from '../roles';
import { mentalityValue } from '../tactics';
import type { ChanceType, Club, Fixture, MatchEvent, Player, Tactic } from '../types';
import { commentary } from './commentary';

/**
 * Minute-by-minute match engine driven by attributes, roles and instructions.
 *
 * Each minute the side on the ball tries to get through three phases — build
 * up against the press, progress through the midfield screen, and create a
 * chance against the last line — and each step reads the weighted attributes
 * of whoever the tactic gives that job to. Losing the ball can hand the other
 * side a counter. Chances carry an xG; the finisher and the keeper decide
 * whether it goes in.
 */

export type Side = 'home' | 'away';

export interface PlayerMatchStats {
  minutes: number;
  passes: number;
  passesDone: number;
  keyPasses: number;
  shots: number;
  onTarget: number;
  goals: number;
  assists: number;
  tackles: number;
  interceptions: number;
  dribbles: number;
  saves: number;
  xg: number;
  fouls: number;
}

export interface MatchPlayer {
  id: string;
  name: string;
  side: Side;
  /** IP slot index while on the pitch; -1 on the bench or after coming off. */
  slot: number;
  ipPos: Position;
  oopPos: Position;
  ipRole: string;
  oopRole: string;
  /** Live condition copy, 0-100. */
  condition: number;
  /** Performance multiplier from the day's form, morale and team talks. */
  boost: number;
  dayForm: number;
  rating: number;
  yellow: number;
  red: boolean;
  injured: boolean;
  onPitch: boolean;
  cameOn: number | null;
  wentOff: number | null;
  stats: PlayerMatchStats;
}

export interface TeamStats {
  shots: number;
  onTarget: number;
  xg: number;
  corners: number;
  fouls: number;
  yellows: number;
  reds: number;
  offsides: number;
  passes: number;
  passesDone: number;
  possessionMinutes: number;
}

export interface TeamState {
  clubId: string;
  side: Side;
  name: string;
  short: string;
  players: MatchPlayer[];
  bench: string[];
  subsLeft: number;
  stats: TeamStats;
  ratings: TeamRatings;
  tacticalFamiliarity: number;
  /** Minute of the last touchline shout, for the cooldown. */
  lastShout: number;
  /** AI side manages itself; the user's side only gets help if asked. */
  ai: boolean;
}

export interface TeamRatings {
  build: number;
  progress: number;
  create: number;
  threat: number;
  press: number;
  pressAmount: number;
  screen: number;
  cover: number;
  defPace: number;
  attPace: number;
  aerialAtt: number;
  aerialDef: number;
  keeper: number;
  outlet: number;
  outletQuality: number;
  crossing: number;
  dribbling: number;
  longShots: number;
}

export interface LiveMatch {
  fixtureId: string;
  homeId: string;
  awayId: string;
  minute: number;
  homeGoals: number;
  awayGoals: number;
  events: MatchEvent[];
  home: TeamState;
  away: TeamState;
  finished: boolean;
  knockout: boolean;
  neutral: boolean;
  pens: { home: number; away: number } | null;
  /** How much the match matters, 0-1 (drives dynamic highlights). */
  importance: number;
  /** Minutes of added time per half, decided at the end of each half. */
  added: [number, number];
  halfTimeDone: boolean;
}

const emptyStats = (): PlayerMatchStats => ({
  minutes: 0,
  passes: 0,
  passesDone: 0,
  keyPasses: 0,
  shots: 0,
  onTarget: 0,
  goals: 0,
  assists: 0,
  tackles: 0,
  interceptions: 0,
  dribbles: 0,
  saves: 0,
  xg: 0,
  fouls: 0,
});

const emptyTeamStats = (): TeamStats => ({
  shots: 0,
  onTarget: 0,
  xg: 0,
  corners: 0,
  fouls: 0,
  yellows: 0,
  reds: 0,
  offsides: 0,
  passes: 0,
  passesDone: 0,
  possessionMinutes: 0,
});

export interface MatchContext {
  players: Record<string, Player>;
  clubs: Record<string, Club>;
}

function buildTeam(club: Club, side: Side, ctx: MatchContext, rng: Rng, ai: boolean): TeamState {
  const tactic = club.tactic;
  const ipSlots = FORMATIONS[tactic.ipFormation];
  const oopSlots = FORMATIONS[tactic.oopFormation];
  const make = (id: string, slot: number): MatchPlayer => {
    const p = ctx.players[id];
    const consistency = p.hidden[H.consistency];
    const oopSlot = slot >= 0 ? tactic.oopOf[slot] : -1;
    return {
      id,
      name: p.name,
      side,
      slot,
      ipPos: slot >= 0 ? ipSlots[slot].pos : 'MC',
      oopPos: oopSlot >= 0 ? oopSlots[oopSlot].pos : 'MC',
      ipRole: slot >= 0 ? tactic.ipRoles[slot] : '',
      oopRole: oopSlot >= 0 ? tactic.oopRoles[oopSlot] : '',
      condition: p.condition,
      boost: 1,
      dayForm: clamp(rng.normal(1, (21 - consistency) / 230), 0.86, 1.12),
      rating: 6.4,
      yellow: 0,
      red: false,
      injured: false,
      onPitch: slot >= 0,
      cameOn: slot >= 0 ? 0 : null,
      wentOff: null,
      stats: emptyStats(),
    };
  };
  const players = tactic.lineup.map((id, slot) => make(id!, slot));
  const bench = tactic.bench.filter((id) => ctx.players[id] && !ctx.players[id].injury);
  bench.forEach((id) => players.push(make(id, -1)));
  const team: TeamState = {
    clubId: club.id,
    side,
    name: club.name,
    short: club.short,
    players,
    bench,
    subsLeft: 5,
    stats: emptyTeamStats(),
    ratings: null as unknown as TeamRatings,
    tacticalFamiliarity: tactic.familiarity,
    lastShout: -99,
    ai,
  };
  return team;
}

export function createLiveMatch(fixture: Fixture, ctx: MatchContext, userClubId: string | null, rng: Rng): LiveMatch {
  const home = ctx.clubs[fixture.homeId];
  const away = ctx.clubs[fixture.awayId];
  const live: LiveMatch = {
    fixtureId: fixture.id,
    homeId: home.id,
    awayId: away.id,
    minute: 0,
    homeGoals: 0,
    awayGoals: 0,
    events: [],
    home: buildTeam(home, 'home', ctx, rng, home.id !== userClubId),
    away: buildTeam(away, 'away', ctx, rng, away.id !== userClubId),
    finished: false,
    knockout: fixture.comp !== 'league',
    neutral: fixture.neutral,
    pens: null,
    importance: fixture.comp === 'league' ? 0.5 : 0.6 + fixture.round * 0.08,
    added: [rng.int(1, 4), rng.int(2, 6)],
    halfTimeDone: false,
  };
  refreshRatings(live, ctx);
  return live;
}

/* --------------------------------------------------------------- ratings */

function tacticOf(team: TeamState, ctx: MatchContext): Tactic {
  return ctx.clubs[team.clubId].tactic;
}

export function onPitch(team: TeamState): MatchPlayer[] {
  return team.players.filter((p) => p.onPitch);
}

/** Effective attribute: the 1-20 value bent by fitness, form, morale and familiarity. */
function eff(mp: MatchPlayer, p: Player, attr: number, phase: 'ip' | 'oop', team: TeamState): number {
  const fam = familiarityMult(p.positions[phase === 'ip' ? mp.ipPos : mp.oopPos] ?? 1);
  const cond = mp.condition >= 72 ? 1 : 0.72 + 0.28 * (mp.condition / 72);
  const morale = 0.94 + (p.morale / 100) * 0.1;
  const sharp = 0.9 + p.sharpness / 1000;
  const tfam = 0.93 + team.tacticalFamiliarity / 1000;
  return p.attrs[attr] * fam * cond * morale * sharp * tfam * mp.dayForm * mp.boost;
}

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / Math.max(1, values.length);
}

export function refreshRatings(live: LiveMatch, ctx: MatchContext): void {
  live.home.ratings = rateTeam(live.home, ctx);
  live.away.ratings = rateTeam(live.away, ctx);
}

function rateTeam(team: TeamState, ctx: MatchContext): TeamRatings {
  const acc = {
    build: [0, 0],
    progress: [0, 0],
    create: [0, 0],
    threat: [0, 0],
    press: [0, 0],
    screen: [0, 0],
    cover: [0, 0],
    outlet: [0, 0],
  } as Record<string, [number, number]>;
  const add = (key: string, weight: number, value: number) => {
    if (weight <= 0) return;
    acc[key][0] += weight * value;
    acc[key][1] += weight;
  };

  const field = onPitch(team);
  const attackers: number[][] = [];
  const defenders: number[][] = [];
  let crossing = 0;
  let crossW = 0;
  let dribbling = 0;
  let dribW = 0;
  let longShots = 0;
  let keeper = 8;

  field.forEach((mp) => {
    const p = ctx.players[mp.id];
    const ipRole: Role | undefined = ROLE_BY_ID[mp.ipRole];
    const oopRole: Role | undefined = ROLE_BY_ID[mp.oopRole];
    const e = (attr: number, phase: 'ip' | 'oop') => eff(mp, p, attr, phase, team);
    if (mp.ipPos === 'GK') {
      keeper = mean([
        e(A.reflexes, 'oop') * 1.4,
        e(A.handling, 'oop'),
        e(A.oneOnOnes, 'oop'),
        e(A.positioning, 'oop'),
        e(A.aerialReach, 'oop') * 0.8,
        e(A.commandOfArea, 'oop') * 0.8,
      ]);
    }
    if (ipRole?.ip) {
      const b = ipRole.ip;
      const gk = mp.ipPos === 'GK';
      add('build', b.build, gk ? mean([e(A.kicking, 'ip'), e(A.passing, 'ip'), e(A.composure, 'ip')]) : mean([e(A.passing, 'ip'), e(A.firstTouch, 'ip'), e(A.composure, 'ip'), e(A.decisions, 'ip'), e(A.technique, 'ip')]));
      add('progress', b.progress, mean([e(A.passing, 'ip'), e(A.vision, 'ip'), e(A.dribbling, 'ip'), e(A.technique, 'ip'), e(A.decisions, 'ip'), e(A.firstTouch, 'ip')]));
      add('create', b.create, mean([e(A.vision, 'ip'), e(A.passing, 'ip'), e(A.technique, 'ip'), e(A.flair, 'ip'), e(A.decisions, 'ip')]));
      add('threat', b.threat, mean([e(A.finishing, 'ip') * 1.4, e(A.offTheBall, 'ip'), e(A.composure, 'ip'), e(A.anticipation, 'ip'), e(A.firstTouch, 'ip')]));
      if (b.threat > 0.2) attackers.push([e(A.heading, 'ip'), e(A.jumping, 'ip'), e(A.strength, 'ip'), e(A.pace, 'ip'), e(A.acceleration, 'ip')]);
      crossing += b.cross * e(A.crossing, 'ip');
      crossW += b.cross;
      dribbling += b.dribble * mean([e(A.dribbling, 'ip'), e(A.agility, 'ip'), e(A.flair, 'ip')]);
      dribW += b.dribble;
      longShots = Math.max(longShots, (b.create + b.threat) * e(A.longShots, 'ip'));
    }
    if (oopRole?.oop) {
      const b = oopRole.oop;
      add('press', b.press, mean([e(A.workRate, 'oop'), e(A.stamina, 'oop'), e(A.aggression, 'oop'), e(A.anticipation, 'oop'), e(A.teamwork, 'oop'), e(A.acceleration, 'oop')]));
      add('screen', b.screen, mean([e(A.positioning, 'oop'), e(A.anticipation, 'oop'), e(A.tackling, 'oop'), e(A.marking, 'oop'), e(A.teamwork, 'oop'), e(A.concentration, 'oop')]));
      if (mp.oopPos !== 'GK') {
        add('cover', b.cover, mean([e(A.marking, 'oop'), e(A.tackling, 'oop'), e(A.positioning, 'oop'), e(A.heading, 'oop'), e(A.strength, 'oop'), e(A.concentration, 'oop'), e(A.anticipation, 'oop')]));
        if (b.cover > 0.5) defenders.push([e(A.heading, 'oop'), e(A.jumping, 'oop'), e(A.strength, 'oop'), e(A.pace, 'oop'), e(A.acceleration, 'oop')]);
      }
      add('outlet', b.outlet, mean([e(A.pace, 'oop'), e(A.acceleration, 'oop'), e(A.anticipation, 'oop'), e(A.offTheBall, 'oop'), e(A.finishing, 'oop')]));
    }
  });

  const avg = (key: string, fallback = 7) => (acc[key][1] > 0 ? acc[key][0] / acc[key][1] : fallback);
  const top3 = (rows: number[][], idx: number[]) =>
    mean(
      rows
        .map((r) => mean(idx.map((i) => r[i])))
        .sort((a, b) => b - a)
        .slice(0, 3),
    );
  // Fewer than ten outfielders (a red card) thins every unit.
  const shortHanded = Math.max(0, 11 - field.length) * 0.05;

  return {
    build: avg('build') * (1 - shortHanded),
    progress: avg('progress') * (1 - shortHanded),
    create: avg('create') * (1 - shortHanded),
    threat: avg('threat') * (1 - shortHanded),
    press: avg('press'),
    pressAmount: acc.press[1],
    screen: avg('screen') * (1 - shortHanded) * Math.min(1.1, 0.75 + acc.screen[1] * 0.12),
    cover: avg('cover') * (1 - shortHanded) * Math.min(1.08, 0.7 + acc.cover[1] * 0.08),
    defPace: defenders.length ? mean(defenders.map((r) => (r[3] + r[4]) / 2)) : 8,
    attPace: attackers.length ? mean(attackers.map((r) => (r[3] + r[4]) / 2)) : 8,
    aerialAtt: attackers.length ? top3(attackers, [0, 1, 2]) : 8,
    aerialDef: defenders.length ? top3(defenders, [0, 1, 2]) : 8,
    keeper,
    outlet: acc.outlet[1],
    outletQuality: avg('outlet', 8),
    crossing: crossW > 0 ? crossing / crossW : 8,
    dribbling: dribW > 0 ? dribbling / dribW : 8,
    longShots: longShots / 1.2,
  };
}

/* ------------------------------------------------------------ the minute */

const other = (side: Side): Side => (side === 'home' ? 'away' : 'home');

function team(live: LiveMatch, side: Side): TeamState {
  return side === 'home' ? live.home : live.away;
}

function push(live: LiveMatch, ev: Omit<MatchEvent, 'minute' | 'homeGoals' | 'awayGoals'>): MatchEvent {
  const event: MatchEvent = { minute: live.minute, homeGoals: live.homeGoals, awayGoals: live.awayGoals, ...ev };
  live.events.push(event);
  return event;
}

function bump(mp: MatchPlayer | undefined, delta: number): void {
  if (mp) mp.rating = clamp(mp.rating + delta, 3, 10);
}

/** Weighted pick of an on-pitch player by role behaviour and attributes. */
function pickBy(
  team: TeamState,
  ctx: MatchContext,
  weight: (mp: MatchPlayer, p: Player, ip: Role | undefined, oop: Role | undefined) => number,
  rng: Rng,
  exclude?: string,
): MatchPlayer | undefined {
  const field = onPitch(team).filter((mp) => mp.id !== exclude);
  if (field.length === 0) return undefined;
  const weights = field.map((mp) => Math.max(0.0001, weight(mp, ctx.players[mp.id], ROLE_BY_ID[mp.ipRole], ROLE_BY_ID[mp.oopRole])));
  return rng.weighted(field, weights);
}

function keeperOf(team: TeamState): MatchPlayer | undefined {
  return onPitch(team).find((mp) => mp.ipPos === 'GK') ?? onPitch(team)[0];
}

interface Modifiers {
  mentality: number;
  tempo: number;
  direct: boolean;
  short: boolean;
  width: number;
  shootOnSight: boolean;
  workIntoBox: boolean;
  counter: number;
  engagement: number;
  line: number;
  pressInt: number;
  tackling: number;
  counterpress: boolean;
}

function mods(t: Tactic): Modifiers {
  return {
    mentality: mentalityValue(t.mentality),
    tempo: t.ip.tempo === 'fast' ? 1 : t.ip.tempo === 'slow' ? -1 : 0,
    direct: t.ip.passing === 'direct',
    short: t.ip.passing === 'short',
    width: t.ip.width === 'wide' ? 1 : t.ip.width === 'narrow' ? -1 : 0,
    shootOnSight: t.ip.finalThird === 'shootOnSight',
    workIntoBox: t.ip.finalThird === 'workIntoBox',
    counter: t.ip.transition === 'counter' ? 1.4 : 0.75,
    engagement: t.oop.engagement === 'high' ? 1.3 : t.oop.engagement === 'low' ? 0.65 : 1,
    line: t.oop.line === 'high' ? 1 : t.oop.line === 'deep' ? -1 : 0,
    pressInt: t.oop.press === 'more' ? 1.3 : t.oop.press === 'less' ? 0.7 : 1,
    tackling: t.oop.tackling === 'aggressive' ? 1 : t.oop.tackling === 'stayOnFeet' ? -1 : 0,
    counterpress: t.oop.transition === 'counterpress',
  };
}

/**
 * Advance one minute. Returns the events it produced. The caller owns the
 * clock so the UI can play at any speed (and hold it during highlights).
 */
export function simulateMinute(live: LiveMatch, ctx: MatchContext, rng: Rng): MatchEvent[] {
  if (live.finished) return [];
  const before = live.events.length;
  live.minute += 1;
  const m = live.minute;

  if (m === 1) push(live, { kind: 'kickoff', side: 'neutral', text: '킥오프! 경기가 시작됩니다.' });

  const homeT = tacticOf(live.home, ctx);
  const awayT = tacticOf(live.away, ctx);
  const hm = mods(homeT);
  const am = mods(awayT);

  // Possession: retention against the other side's press, plus home advantage.
  const ret = (r: TeamRatings, mo: Modifiers) => r.build * 0.5 + r.progress * 0.5 + (mo.short ? 0.5 : 0) - (mo.direct ? 0.8 : 0) - mo.tempo * 0.3 + mo.mentality * 0.1;
  const pressure = (r: TeamRatings, mo: Modifiers) => (r.press - 9) * 0.3 * mo.engagement * mo.pressInt + (r.pressAmount - 3) * 0.2;
  const homeEdge = live.neutral ? 0 : 0.35;
  const diff = ret(live.home.ratings, hm) - pressure(live.away.ratings, am) - (ret(live.away.ratings, am) - pressure(live.home.ratings, hm)) + homeEdge;
  const homeShare = clamp(0.5 + diff * 0.03, 0.32, 0.68);

  const sequences = rng.bool(0.25 + Math.max(hm.tempo, am.tempo) * 0.08) ? 2 : 1;
  for (let s = 0; s < sequences; s++) {
    const attSide: Side = rng.bool(homeShare) ? 'home' : 'away';
    team(live, attSide).stats.possessionMinutes += 1 / sequences;
    runSequence(live, ctx, rng, attSide, attSide === 'home' ? hm : am, attSide === 'home' ? am : hm);
  }

  // Fouls, injuries, fatigue.
  (['home', 'away'] as Side[]).forEach((side) => {
    const t = team(live, side);
    const mo = side === 'home' ? hm : am;
    const foulProb = 0.115 * (1 + mo.tackling * 0.4) * (0.8 + mo.pressInt * 0.25);
    if (rng.bool(foulProb)) resolveFoul(live, ctx, rng, side, side === 'home' ? am : hm);
    if (rng.bool(0.00013 * onPitch(t).length)) resolveInjury(live, ctx, rng, side);
    drain(t, ctx, mo);
  });

  if (m % 5 === 0) refreshRatings(live, ctx);

  // Clock events.
  const firstHalfEnd = 45 + live.added[0];
  const fullTime = 90 + live.added[1];
  if (m === firstHalfEnd && !live.halfTimeDone) {
    live.halfTimeDone = true;
    push(live, { kind: 'halftime', side: 'neutral', text: `전반 종료. ${live.homeGoals} - ${live.awayGoals}` });
  }
  if (m === fullTime) {
    if (live.knockout && live.homeGoals === live.awayGoals) {
      push(live, { kind: 'extratime', side: 'neutral', text: '90분 무승부. 연장전에 돌입합니다.' });
    } else {
      finish(live);
    }
  }
  if (m === fullTime + 30 && !live.finished) {
    if (live.homeGoals === live.awayGoals) shootout(live, ctx, rng);
    finish(live);
  }

  return live.events.slice(before);
}

/** Minute at which the final whistle can come, for progress bars. */
export function expectedLength(live: LiveMatch): number {
  const full = 90 + live.added[1];
  if (live.knockout && live.minute >= full && live.homeGoals === live.awayGoals) return full + 30;
  return full;
}

function drain(t: TeamState, ctx: MatchContext, mo: Modifiers): void {
  onPitch(t).forEach((mp) => {
    const p = ctx.players[mp.id];
    mp.stats.minutes += 1;
    // Team-talk and shout effects wear off over a half.
    mp.boost += (1 - mp.boost) * 0.012;
    if (mp.ipPos === 'GK') {
      mp.condition = Math.max(40, mp.condition - 0.03);
      return;
    }
    const oop = ROLE_BY_ID[mp.oopRole]?.oop;
    const effort = 0.21 + mo.tempo * 0.03 + (mo.pressInt - 1) * 0.08 + (oop?.press ?? 0) * 0.06 + mo.engagement * 0.02;
    const resilience = 1.3 - p.attrs[A.stamina] / 33 - p.attrs[A.naturalFitness] / 120;
    mp.condition = Math.max(15, mp.condition - effort * Math.max(0.45, resilience));
  });
}

function runSequence(live: LiveMatch, ctx: MatchContext, rng: Rng, attSide: Side, am: Modifiers, dm: Modifiers): void {
  const att = team(live, attSide);
  const def = team(live, other(attSide));
  const a = att.ratings;
  const d = def.ratings;

  // A side's on-ball volume: everyone involved gets passes on the board.
  const credit = (phase: 'build' | 'progress' | 'create', ok: boolean) => {
    const mp = pickBy(att, ctx, (_mp, _p, ip) => (ip?.ip ? ip.ip[phase] + 0.05 : 0.05), rng);
    if (!mp) return;
    const n = rng.int(2, 5);
    mp.stats.passes += n;
    mp.stats.passesDone += ok ? n : n - 1;
    att.stats.passes += n;
    att.stats.passesDone += ok ? n : n - 1;
    bump(mp, ok ? 0.012 : -0.025);
  };
  const defensiveAction = (kind: 'tackle' | 'interception', phase: 'press' | 'screen' | 'cover') => {
    const mp = pickBy(def, ctx, (_mp, _p, _ip, oop) => (oop?.oop ? oop.oop[phase] + 0.05 : 0.05), rng);
    if (!mp) return;
    if (kind === 'tackle') mp.stats.tackles += 1;
    else mp.stats.interceptions += 1;
    bump(mp, 0.05);
  };

  // 1. Build-up against the press (a direct side sometimes goes long instead).
  if (am.direct && rng.bool(0.45)) {
    const ok = rng.bool(clamp(0.42 + (a.aerialAtt - d.aerialDef) * 0.03 + (a.attPace - d.defPace) * 0.015, 0.2, 0.7));
    credit('build', ok);
    if (!ok) {
      defensiveAction('interception', 'cover');
      return;
    }
    if (rng.bool(0.35)) return chance(live, ctx, rng, attSide, 'longball', am, dm);
  } else {
    const pressing = (d.press - 9) * 0.025 * dm.engagement * dm.pressInt + (dm.engagement - 1) * 0.12 + (dm.pressInt - 1) * 0.08;
    const pBuild = clamp(0.8 + (a.build - 10) * 0.025 - pressing + (am.short ? 0.02 : 0) - am.tempo * 0.02, 0.45, 0.95);
    const ok = rng.bool(pBuild);
    credit('build', ok);
    if (!ok) {
      defensiveAction('tackle', 'press');
      // Won high up: a short route to goal for the pressing side.
      const counter = 0.18 * dm.engagement * dm.pressInt * dm.counter * (0.6 + d.outlet * 0.25);
      if (rng.bool(counter)) chance(live, ctx, rng, other(attSide), 'counter', dm, am);
      return;
    }
  }

  // 2. Progression through the midfield screen.
  const pProg = clamp(0.6 + (a.progress - d.screen) * 0.035 + am.mentality * 0.012 - (dm.engagement < 1 ? 0.04 : 0) + (dm.engagement > 1 ? 0.04 : 0), 0.3, 0.88);
  const progressed = rng.bool(pProg);
  credit('progress', progressed);
  if (!progressed) {
    defensiveAction('interception', 'screen');
    const counterChance = 0.075 * dm.counter * (0.6 + d.outlet * 0.25) * (1 + am.mentality * 0.08) * (am.mentality > 0 && !am.counterpress ? 1.15 : 1) * (am.counterpress ? 0.7 : 1);
    if (rng.bool(counterChance)) chance(live, ctx, rng, other(attSide), 'counter', dm, am);
    return;
  }

  // 3. Chance creation against the last line.
  const homeBonus = !live.neutral && attSide === 'home' ? 0.025 : 0;
  const pCreate = clamp(
    0.21 + homeBonus + (a.create - d.cover) * 0.028 + (a.threat - d.cover) * 0.012 + am.mentality * 0.022 + dm.line * 0.01 + (am.workIntoBox ? -0.03 : 0) + (am.shootOnSight ? 0.04 : 0) - (dm.mentality < -1 ? 0.03 : 0),
    0.1,
    0.55,
  );
  const created = rng.bool(pCreate);
  credit('create', created);
  if (!created) {
    if (dm.line >= 0 && rng.bool(dm.line > 0 ? 0.2 : 0.1)) {
      const runner = pickBy(att, ctx, (_mp, _p, ip) => (ip?.ip?.threat ?? 0) + 0.02, rng);
      att.stats.offsides += 1;
      push(live, { kind: 'offside', side: attSide, text: commentary.offside(rng, { p: runner?.name ?? '공격수', team: att.short }), playerId: runner?.id });
      return;
    }
    defensiveAction(rng.bool(0.5) ? 'tackle' : 'interception', 'cover');
    if (rng.bool(0.1)) corner(live, ctx, rng, attSide, am, dm);
    return;
  }

  // Which kind of chance?
  const types: ChanceType[] = ['through', 'cross', 'cutback', 'dribble', 'longshot'];
  const weights = [
    1 * (1 + dm.line * 0.35) * (a.attPace / Math.max(6, d.defPace)) * (am.width < 0 ? 1.3 : 1),
    0.9 * (am.width > 0 ? 1.6 : am.width < 0 ? 0.5 : 1) * (a.crossing / 10),
    0.6 * (am.workIntoBox ? 1.5 : 1),
    0.6 * (a.dribbling / 10) * (am.width < 0 ? 1.3 : 1),
    0.55 * (am.shootOnSight ? 2.6 : am.workIntoBox ? 0.4 : 1) * (a.longShots / 10) * (dm.line < 0 ? 1.5 : 1),
  ];
  const type = rng.weighted(types, weights);

  // A through ball against a high line can be flagged offside.
  if (type === 'through' && rng.bool(dm.line > 0 ? 0.22 : 0.08)) {
    const runner = pickBy(att, ctx, (_mp, _p, ip) => (ip?.ip?.threat ?? 0) + 0.02, rng);
    att.stats.offsides += 1;
    push(live, { kind: 'offside', side: attSide, text: commentary.offside(rng, { p: runner?.name ?? '공격수', team: att.short }), playerId: runner?.id });
    return;
  }
  chance(live, ctx, rng, attSide, type, am, dm);
}

const BASE_XG: Record<ChanceType, number> = {
  through: 0.168,
  cross: 0.068,
  cutback: 0.144,
  dribble: 0.096,
  longshot: 0.028,
  counter: 0.16,
  longball: 0.064,
  corner: 0.048,
  freekick: 0.044,
  penalty: 0.61,
};

function chance(live: LiveMatch, ctx: MatchContext, rng: Rng, attSide: Side, type: ChanceType, am: Modifiers, dm: Modifiers): void {
  const att = team(live, attSide);
  const def = team(live, other(attSide));
  const a = att.ratings;
  const d = def.ratings;

  // Shooter and creator.
  const aerial = type === 'cross' || type === 'corner' || type === 'longball';
  const shooter = pickBy(
    att,
    ctx,
    (mp, p, ip) => {
      if (mp.ipPos === 'GK') return 0;
      const threat = ip?.ip ? ip.ip.threat + 0.08 : 0.08;
      if (type === 'longshot') return (ip?.ip ? ip.ip.create + ip.ip.threat * 0.5 + 0.1 : 0.1) * p.attrs[A.longShots];
      if (aerial) return threat * (p.attrs[A.heading] + p.attrs[A.jumping]) * (p.height > 185 ? 1.4 : 1);
      if (type === 'dribble') return (ip?.ip ? ip.ip.dribble + threat : threat) * p.attrs[A.dribbling];
      return threat * (p.attrs[A.finishing] + p.attrs[A.offTheBall]);
    },
    rng,
  );
  if (!shooter) return;
  const solo = type === 'dribble' || type === 'longshot' || (type === 'counter' && rng.bool(0.35));
  const creator = solo
    ? undefined
    : pickBy(
        att,
        ctx,
        (mp, p, ip) => {
          if (mp.ipPos === 'GK') return type === 'counter' || type === 'longball' ? 0.05 : 0;
          const create = ip?.ip ? ip.ip.create + ip.ip.progress * 0.3 + 0.05 : 0.05;
          if (type === 'cross') return (ip?.ip ? ip.ip.cross + 0.05 : 0.05) * p.attrs[A.crossing];
          if (type === 'corner') return mp.id === tacticOf(att, ctx).setPieceTaker ? 10 : p.attrs[A.corners] * 0.05;
          return create * (p.attrs[A.passing] + p.attrs[A.vision]);
        },
        rng,
        shooter.id,
      );

  const sp = ctx.players[shooter.id];
  const gk = keeperOf(def);
  const gkName = gk?.name ?? '골키퍼';

  // Expected goals for this chance.
  let xg = BASE_XG[type];
  if (type === 'through' || type === 'counter') xg *= Math.exp((a.attPace - d.defPace) * 0.05);
  if (aerial) xg *= Math.exp((a.aerialAtt - d.aerialDef) * 0.07);
  if (type !== 'penalty' && type !== 'freekick') xg *= Math.exp((a.threat - d.cover) * 0.045);
  if (am.workIntoBox && type !== 'longshot') xg *= 1.12;
  if (type === 'counter') xg *= 1 + Math.max(0, am.mentality) * -0.03 + Math.max(0, dm.mentality) * 0.05;
  if (!live.neutral && attSide === 'home') xg *= 1.05;
  xg = clamp(xg, 0.015, 0.85);

  att.stats.shots += 1;
  att.stats.xg += xg;
  shooter.stats.shots += 1;
  shooter.stats.xg += xg;
  if (creator) {
    creator.stats.keyPasses += 1;
    bump(creator, 0.12);
  }

  const ctxText = { p: shooter.name, a: creator?.name, gk: gkName, team: att.short };
  const lead = commentary.build(rng, type, ctxText);

  // Blocked before it reaches the keeper.
  const blockProb = type === 'penalty' ? 0 : type === 'freekick' ? 0.3 : type === 'longshot' ? 0.38 : 0.2 * (d.cover / 10);
  if (rng.bool(blockProb)) {
    push(live, { kind: 'chance', side: attSide, text: `${lead} ${commentary.block(rng, ctxText)}`, playerId: shooter.id, assistId: creator?.id, chance: type, xg });
    const blocker = pickBy(def, ctx, (_mp, _p, _ip, oop) => (oop?.oop?.cover ?? 0) + 0.02, rng);
    bump(blocker, 0.06);
    bump(shooter, -0.02);
    if (rng.bool(0.4)) corner(live, ctx, rng, attSide, am, dm);
    return;
  }

  // Finisher against keeper.
  const finishAttr = aerial ? (sp.attrs[A.heading] * 0.7 + sp.attrs[A.jumping] * 0.3) : type === 'penalty' ? sp.attrs[A.penalty] : type === 'freekick' ? sp.attrs[A.freeKick] : type === 'longshot' ? sp.attrs[A.longShots] : sp.attrs[A.finishing];
  const finishing = (finishAttr * 0.65 + sp.attrs[A.composure] * 0.25 + sp.attrs[A.technique] * 0.1) * shooter.dayForm * shooter.boost * (shooter.condition < 60 ? 0.92 : 1);
  const finishQ = 0.7 + (finishing / 20) * 0.6;
  const keeperQ = 1.32 - (d.keeper / 20) * 0.62;
  // xG already counts blocked and wayward efforts, so the on-frame conversion is scaled up.
  const pGoal = clamp((xg / 0.8) * finishQ * keeperQ, 0.01, 0.92);

  if (rng.bool(pGoal)) {
    if (attSide === 'home') live.homeGoals += 1;
    else live.awayGoals += 1;
    att.stats.onTarget += 1;
    shooter.stats.onTarget += 1;
    shooter.stats.goals += 1;
    bump(shooter, 1.0);
    if (creator) {
      creator.stats.assists += 1;
      bump(creator, 0.55);
    }
    bump(gk, -0.35);
    onPitch(def).forEach((mp) => {
      const cover = ROLE_BY_ID[mp.oopRole]?.oop?.cover ?? 0;
      bump(mp, -0.1 * cover);
    });
    push(live, { kind: 'goal', side: attSide, text: `${lead} ${commentary.goal(rng, type, ctxText)}`, playerId: shooter.id, assistId: creator?.id, chance: type, xg });
    return;
  }

  const onTarget = rng.bool(type === 'penalty' ? 0.7 : 0.48);
  if (onTarget && gk) {
    att.stats.onTarget += 1;
    shooter.stats.onTarget += 1;
    gk.stats.saves += 1;
    bump(gk, 0.22 + xg * 0.8);
    bump(shooter, 0.02);
    push(live, { kind: 'save', side: attSide, text: `${lead} ${commentary.save(rng, type, ctxText)}`, playerId: shooter.id, assistId: creator?.id, chance: type, xg });
    if (rng.bool(0.3)) corner(live, ctx, rng, attSide, am, dm);
    return;
  }
  bump(shooter, xg > 0.3 ? -0.2 : -0.06);
  push(live, { kind: 'miss', side: attSide, text: `${lead} ${commentary.miss(rng, ctxText)}`, playerId: shooter.id, assistId: creator?.id, chance: type, xg });
}

function corner(live: LiveMatch, ctx: MatchContext, rng: Rng, attSide: Side, am: Modifiers, dm: Modifiers): void {
  const att = team(live, attSide);
  att.stats.corners += 1;
  push(live, { kind: 'corner', side: attSide, text: `${att.short}의 코너킥.` });
  // Most corners come to nothing.
  const delivery = (ctx.players[tacticOf(att, ctx).setPieceTaker ?? '']?.attrs[A.corners] ?? 10) / 10;
  if (rng.bool(0.24 * delivery * Math.exp((att.ratings.aerialAtt - team(live, other(attSide)).ratings.aerialDef) * 0.06))) {
    chance(live, ctx, rng, attSide, 'corner', am, dm);
  }
}

function resolveFoul(live: LiveMatch, ctx: MatchContext, rng: Rng, foulingSide: Side, victimMods: Modifiers): void {
  const t = team(live, foulingSide);
  const offender = pickBy(
    t,
    ctx,
    (mp, p, _ip, oop) => (mp.ipPos === 'GK' ? 0 : (0.3 + (oop?.oop?.press ?? 0) + (oop?.oop?.screen ?? 0) * 0.5) * (p.attrs[A.aggression] + 5)),
    rng,
  );
  if (!offender) return;
  const p = ctx.players[offender.id];
  t.stats.fouls += 1;
  offender.stats.fouls += 1;
  const c = { p: offender.name, team: t.short };
  const tacticMods = mods(tacticOf(t, ctx));

  const cardBase = 0.15 * (1 + tacticMods.tackling * 0.35) * (0.7 + p.attrs[A.aggression] / 30) * (1.25 - p.hidden[H.temperament] / 40);
  if (rng.bool(0.0015)) {
    sendOff(live, t, offender, commentary.red(rng, c), foulingSide);
    return;
  }
  // A booked player is more careful.
  if (rng.bool(offender.yellow > 0 ? cardBase * 0.4 : cardBase)) {
    if (offender.yellow >= 1) {
      offender.yellow += 1;
      t.stats.yellows += 1;
      sendOff(live, t, offender, commentary.secondYellow(rng, c), foulingSide);
      return;
    }
    offender.yellow += 1;
    t.stats.yellows += 1;
    bump(offender, -0.2);
    push(live, { kind: 'yellow', side: foulingSide, text: commentary.yellow(rng, c), playerId: offender.id });
  } else {
    push(live, { kind: 'foul', side: foulingSide, text: commentary.foul(rng, c), playerId: offender.id });
  }

  // Where was it? Close to goal it becomes a set piece.
  const victimSide = other(foulingSide);
  const roll = rng.next();
  if (roll < 0.035) {
    penalty(live, ctx, rng, victimSide, victimMods, tacticMods);
  } else if (roll < 0.16) {
    freeKick(live, ctx, rng, victimSide, victimMods, tacticMods);
  }
}

function setTaker(team: TeamState, ctx: MatchContext, which: 'penaltyTaker' | 'setPieceTaker'): MatchPlayer | undefined {
  const id = tacticOf(team, ctx)[which];
  return onPitch(team).find((mp) => mp.id === id) ?? onPitch(team).filter((mp) => mp.ipPos !== 'GK').sort((a, b) => b.rating - a.rating)[0];
}

function penalty(live: LiveMatch, ctx: MatchContext, rng: Rng, side: Side, am: Modifiers, dm: Modifiers): void {
  const t = team(live, side);
  const taker = setTaker(t, ctx, 'penaltyTaker');
  if (!taker) return;
  // Re-use the chance path with the taker forced as shooter.
  const saved = t.players.map((mp) => mp.onPitch);
  t.players.forEach((mp) => (mp.onPitch = mp === taker));
  chance(live, ctx, rng, side, 'penalty', am, dm);
  t.players.forEach((mp, i) => (mp.onPitch = saved[i]));
}

function freeKick(live: LiveMatch, ctx: MatchContext, rng: Rng, side: Side, am: Modifiers, dm: Modifiers): void {
  const t = team(live, side);
  const taker = setTaker(t, ctx, 'setPieceTaker');
  if (!taker) return;
  if (rng.bool(0.45)) {
    const saved = t.players.map((mp) => mp.onPitch);
    t.players.forEach((mp) => (mp.onPitch = mp === taker));
    chance(live, ctx, rng, side, 'freekick', am, dm);
    t.players.forEach((mp, i) => (mp.onPitch = saved[i]));
  } else if (rng.bool(0.35)) {
    chance(live, ctx, rng, side, 'cross', am, dm);
  }
}

function sendOff(live: LiveMatch, t: TeamState, mp: MatchPlayer, text: string, side: Side): void {
  mp.red = true;
  mp.onPitch = false;
  mp.wentOff = live.minute;
  t.stats.reds += 1;
  bump(mp, -1.5);
  push(live, { kind: 'red', side, text, playerId: mp.id });
}

function resolveInjury(live: LiveMatch, ctx: MatchContext, rng: Rng, side: Side): void {
  const t = team(live, side);
  const victim = pickBy(t, ctx, (mp, p) => (p.hidden[H.injuryProneness] + 4) * (mp.condition < 60 ? 2 : 1), rng);
  if (!victim || victim.injured) return;
  victim.injured = true;
  push(live, { kind: 'injury', side, text: commentary.injury(rng, { p: victim.name, team: t.short }), playerId: victim.id });
  if (t.ai) aiReplaceInjured(live, ctx, t, victim);
}

/* -------------------------------------------------------------- changes */

/** Bring a bench player on for someone on the pitch. */
export function substitute(live: LiveMatch, ctx: MatchContext, side: Side, outId: string, inId: string): boolean {
  const t = team(live, side);
  if (t.subsLeft <= 0) return false;
  const out = t.players.find((mp) => mp.id === outId && mp.onPitch);
  const inc = t.players.find((mp) => mp.id === inId && !mp.onPitch && mp.cameOn === null && mp.wentOff === null);
  if (!out || !inc) return false;
  inc.slot = out.slot;
  inc.ipPos = out.ipPos;
  inc.oopPos = out.oopPos;
  inc.ipRole = out.ipRole;
  inc.oopRole = out.oopRole;
  inc.onPitch = true;
  inc.cameOn = live.minute;
  out.onPitch = false;
  out.wentOff = live.minute;
  out.slot = -1;
  t.subsLeft -= 1;
  push(live, { kind: 'sub', side, text: `교체 — ${t.short}: ${inc.name} IN, ${out.name} OUT`, playerId: inc.id, assistId: out.id });
  refreshRatings(live, ctx);
  return true;
}

/** Re-read slots and roles from the club tactic after the user edits it mid-match. */
export function applyTacticChange(live: LiveMatch, ctx: MatchContext, side: Side): void {
  const t = team(live, side);
  const tactic = tacticOf(t, ctx);
  const ipSlots = FORMATIONS[tactic.ipFormation];
  const oopSlots = FORMATIONS[tactic.oopFormation];
  onPitch(t).forEach((mp) => {
    const slot = mp.slot;
    if (slot < 0 || slot >= ipSlots.length) return;
    mp.ipPos = ipSlots[slot].pos;
    mp.oopPos = oopSlots[tactic.oopOf[slot]].pos;
    mp.ipRole = tactic.ipRoles[slot];
    mp.oopRole = tactic.oopRoles[tactic.oopOf[slot]];
  });
  refreshRatings(live, ctx);
}

function benchOptions(t: TeamState): MatchPlayer[] {
  return t.players.filter((mp) => !mp.onPitch && mp.cameOn === null && mp.wentOff === null && !mp.red);
}

function aiReplaceInjured(live: LiveMatch, ctx: MatchContext, t: TeamState, victim: MatchPlayer): void {
  if (t.subsLeft <= 0) return;
  const best = bestReplacement(t, ctx, victim);
  if (best) substitute(live, ctx, t.side, victim.id, best.id);
}

function bestReplacement(t: TeamState, ctx: MatchContext, out: MatchPlayer): MatchPlayer | undefined {
  return benchOptions(t)
    .map((mp) => {
      const p = ctx.players[mp.id];
      const fam = familiarityMult(p.positions[out.ipPos] ?? 1);
      return { mp, score: p.ca * fam * (out.ipPos === 'GK' ? ((p.positions.GK ?? 0) >= 15 ? 2 : 0.1) : (p.positions.GK ?? 0) >= 15 ? 0.1 : 1) };
    })
    .sort((a, b) => b.score - a.score)[0]?.mp;
}

/** AI touchline management: tired legs, injuries, and chasing or protecting a result. */
export function aiManage(live: LiveMatch, ctx: MatchContext, side: Side, rng: Rng): void {
  const t = team(live, side);
  if (!t.ai || live.finished) return;
  const m = live.minute;
  const tactic = tacticOf(t, ctx);
  const lead = side === 'home' ? live.homeGoals - live.awayGoals : live.awayGoals - live.homeGoals;

  if (m >= 56 && t.subsLeft > 0 && rng.bool(0.22)) {
    const tired = onPitch(t)
      .filter((mp) => mp.ipPos !== 'GK')
      .sort((a, b) => a.condition + a.rating * 4 - (b.condition + b.rating * 4))[0];
    if (tired && (tired.condition < 66 || tired.rating < 5.9 || (m > 70 && rng.bool(0.3)))) {
      const sub = bestReplacement(t, ctx, tired);
      if (sub) substitute(live, ctx, side, tired.id, sub.id);
    }
  }

  // Mentality swings late on.
  if (m === 65 || m === 78) {
    const base = PRESET_MENTALITY.get(t.clubId) ?? tactic.mentality;
    if (!PRESET_MENTALITY.has(t.clubId)) PRESET_MENTALITY.set(t.clubId, tactic.mentality);
    if (lead < 0) tactic.mentality = m === 78 ? 'veryAttacking' : 'attacking';
    else if (lead > 0 && m === 78) tactic.mentality = 'defensive';
    else tactic.mentality = base;
  }
}

/** Original mentality of AI sides, so late-game swings can be undone after the match. */
const PRESET_MENTALITY = new Map<string, Tactic['mentality']>();

export function restoreAiMentality(clubs: Record<string, Club>): void {
  PRESET_MENTALITY.forEach((m, id) => {
    if (clubs[id]) clubs[id].tactic.mentality = m;
  });
  PRESET_MENTALITY.clear();
}

/* ---------------------------------------------------------------- endings */

function shootout(live: LiveMatch, ctx: MatchContext, rng: Rng): void {
  const kick = (t: TeamState, keeperTeam: TeamState, order: number) => {
    const takers = onPitch(t)
      .filter((mp) => mp.ipPos !== 'GK')
      .sort((a, b) => ctx.players[b.id].attrs[A.penalty] - ctx.players[a.id].attrs[A.penalty]);
    const taker = takers[order % Math.max(1, takers.length)] ?? onPitch(t)[0];
    const p = ctx.players[taker.id];
    const gk = keeperOf(keeperTeam);
    const gkSkill = gk ? ctx.players[gk.id].attrs[A.reflexes] : 10;
    return rng.bool(clamp(0.74 + (p.attrs[A.penalty] - 10) * 0.012 + (p.attrs[A.composure] - 10) * 0.008 - (gkSkill - 10) * 0.008, 0.5, 0.92));
  };
  let h = 0;
  let a = 0;
  for (let i = 0; i < 5; i++) {
    if (kick(live.home, live.away, i)) h++;
    if (kick(live.away, live.home, i)) a++;
  }
  let i = 5;
  while (h === a && i < 20) {
    if (kick(live.home, live.away, i)) h++;
    if (kick(live.away, live.home, i)) a++;
    i++;
  }
  if (h === a) h++;
  live.pens = { home: h, away: a };
  push(live, {
    kind: 'pens',
    side: h > a ? 'home' : 'away',
    text: `승부차기 ${h} - ${a}! ${h > a ? live.home.name : live.away.name} 승리!`,
  });
}

function finish(live: LiveMatch): void {
  live.finished = true;
  const homeWon = live.homeGoals > live.awayGoals || (live.pens ? live.pens.home > live.pens.away : false);
  const awayWon = live.awayGoals > live.homeGoals || (live.pens ? live.pens.away > live.pens.home : false);
  const settle = (t: TeamState, won: boolean, lost: boolean, conceded: number) => {
    t.players.forEach((mp) => {
      if (mp.stats.minutes === 0) return;
      bump(mp, won ? 0.25 : lost ? -0.25 : 0);
      const cover = ROLE_BY_ID[mp.oopRole]?.oop?.cover ?? 0;
      if (conceded === 0 && cover > 0.5) bump(mp, 0.35);
      mp.rating = Math.round(mp.rating * 10) / 10;
    });
  };
  settle(live.home, homeWon, awayWon, live.awayGoals);
  settle(live.away, awayWon, homeWon, live.homeGoals);
  push(live, {
    kind: 'fulltime',
    side: 'neutral',
    text: `경기 종료! ${live.home.short} ${live.homeGoals} - ${live.awayGoals} ${live.away.short}${live.pens ? ` (승부차기 ${live.pens.home}-${live.pens.away})` : ''}`,
  });
}

export function playerOfMatch(live: LiveMatch): MatchPlayer | undefined {
  return [...live.home.players, ...live.away.players].filter((mp) => mp.stats.minutes > 0).sort((a, b) => b.rating - a.rating)[0];
}

export function possession(live: LiveMatch): { home: number; away: number } {
  const total = live.home.stats.possessionMinutes + live.away.stats.possessionMinutes;
  if (total === 0) return { home: 50, away: 50 };
  const home = Math.round((live.home.stats.possessionMinutes / total) * 100);
  return { home, away: 100 - home };
}

/** Whole match with no UI, for every fixture the user isn't watching. */
export function simulateFull(fixture: Fixture, ctx: MatchContext, rng: Rng): LiveMatch {
  const live = createLiveMatch(fixture, ctx, null, rng);
  while (!live.finished) {
    simulateMinute(live, ctx, rng);
    aiManage(live, ctx, 'home', rng);
    aiManage(live, ctx, 'away', rng);
  }
  restoreAiMentality(ctx.clubs);
  return live;
}
