import type { MatchEvent } from '../../game/types';

/**
 * The 2D match view. The engine decides *what* happens each minute; this
 * turns those events into something to watch: players holding shape around
 * the ball, passing it about between key moments, and a scripted move for
 * every chance, card and goal the engine produced.
 *
 * Everything here is presentation. It never touches game state and uses
 * Math.random freely — the result was settled before the animation starts.
 *
 * World coordinates are metres on a 105 x 68 pitch. Home attacks towards
 * x = 105, away towards x = 0.
 */

export const PITCH_W = 105;
export const PITCH_H = 68;
/** Grass drawn around the touchlines, in metres. */
export const MARGIN = 4;
export const GOAL_HALF = 3.66;
const CENTER = { x: PITCH_W / 2, y: PITCH_H / 2 };

export type SideKey = 'home' | 'away';

export interface Vec {
  x: number;
  y: number;
}

export interface Kit {
  fill: string;
  trim: string;
  keeper: string;
}

export interface RosterEntry {
  id: string;
  name: string;
  number: number;
  isKeeper: boolean;
  /** Formation slot, when known (starters). Subs are placed into a free slot. */
  slotHint?: number;
}

export interface RosterInput {
  entries: RosterEntry[];
  /** Formation layout, x: 0-100 left-right, y: 0-100 own goal -> opposition goal. */
  layout: { x: number; y: number }[];
  sentOff: string[];
}

interface Actor {
  id: string;
  side: SideKey;
  slot: number;
  number: number;
  label: string;
  isKeeper: boolean;
  pos: Vec;
  /** Scripted destination; overrides the shape while set. */
  override: Vec | null;
  seed: number;
  /** Sent off or subbed off: walking to the touchline before disappearing. */
  leaving: boolean;
  leaveT: number;
}

interface Flight {
  from: Vec;
  to: Vec;
  t: number;
  dur: number;
  peak: number;
  receiver: Actor | null;
}

type Step =
  | { kind: 'pass'; to: Actor; point?: Vec; peak?: number; speed?: number; ambient?: boolean }
  | { kind: 'carry'; to: Vec; dur: number; ambient?: boolean }
  | { kind: 'shoot'; target: Vec; peak: number; speed: number }
  | { kind: 'wait'; dur: number; ambient?: boolean }
  | { kind: 'call'; fn: () => void };

interface Banner {
  text: string;
  sub?: string;
  color: string;
  t: number;
  dur: number;
  big: boolean;
}

interface Marker {
  actorId: string;
  kind: 'yellow' | 'red' | 'injury';
  t: number;
  dur: number;
}

/** Read-only snapshot of the scene, for renderers other than the built-in 2D one. */
export interface SceneView {
  actors: readonly {
    id: string;
    side: SideKey;
    number: number;
    label: string;
    isKeeper: boolean;
    leaving: boolean;
    pos: Readonly<Vec>;
  }[];
  ball: { x: number; y: number; h: number };
  ownerId: string | null;
  /** True while an event is being played out, so a camera can move in. */
  highlight: boolean;
  /** Side celebrating a goal right now, if any. */
  celebrating: SideKey | null;
  banner: { text: string; sub?: string; color: string; alpha: number; big: boolean } | null;
  markers: readonly { actorId: string; kind: 'yellow' | 'red' | 'injury' }[];
  kits: Record<SideKey, Kit>;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a: Vec, b: Vec, t: number): Vec => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
const other = (side: SideKey): SideKey => (side === 'home' ? 'away' : 'home');
const dirOf = (side: SideKey) => (side === 'home' ? 1 : -1);
/** x of the goal this side attacks. */
const targetGoalX = (side: SideKey) => (side === 'home' ? PITCH_W : 0);

function surname(name: string): string {
  const parts = name.split(' ');
  return parts[parts.length - 1];
}

export class MatchDirector {
  private actors: Actor[] = [];
  private kits: Record<SideKey, Kit>;
  private layouts: Record<SideKey, { x: number; y: number }[]> = { home: [], away: [] };
  private deadSlots: Record<SideKey, Set<number>> = { home: new Set(), away: new Set() };

  private ball = { pos: { ...CENTER }, h: 0 };
  private flight: Flight | null = null;
  private owner: Actor | null = null;
  private possession: SideKey = 'home';
  /** Home share of the ball, 0-1, from the engine's running stats. */
  private homeShare = 0.5;

  private steps: Step[] = [];
  private stepStarted = false;
  private stepT = 0;

  private events: MatchEvent[] = [];
  private queue: number[] = [];
  /** Event index being played out as a highlight, if any. */
  private current: number | null = null;
  private processed = 0;
  private revealedCount = 0;
  private ended = false;

  private banner: Banner | null = null;
  private markers: Marker[] = [];
  private time = 0;
  private timeScale = 1;
  private lastBusy = false;
  private celebrating: SideKey | null = null;

  constructor(
    kits: Record<SideKey, Kit>,
    private onChange: () => void,
  ) {
    this.kits = kits;
  }

  /* ------------------------------------------------------------ public API */

  get busy(): boolean {
    return this.current !== null || this.queue.length > 0;
  }

  /** How many of the match's events the viewer has been shown so far. */
  get revealed(): number {
    return this.revealedCount;
  }

  /** Score as the viewer knows it — a goal only counts once it has gone in. */
  get shownScore(): { home: number; away: number } {
    const last = this.events[this.revealedCount - 1];
    return last ? { home: last.homeGoals, away: last.awayGoals } : { home: 0, away: 0 };
  }

  setKits(kits: Record<SideKey, Kit>): void {
    this.kits = kits;
  }

  setTimeScale(scale: number): void {
    this.timeScale = scale;
  }

  setPossession(homeShare: number): void {
    this.homeShare = clamp(homeShare, 0.2, 0.8);
  }

  /**
   * Called on first sight of a match. Everything already in the log counts as
   * seen, so re-opening the match screen mid-game doesn't replay old goals.
   */
  start(events: MatchEvent[], minute: number): void {
    this.events = events;
    this.processed = events.length;
    this.revealedCount = events.length;
    this.ended = events.some((e) => e.kind === 'fulltime');
    this.kickoff(minute >= 45 ? 'away' : 'home', true);
  }

  /** Bring the roster in line with who the engine has on the pitch. */
  syncRoster(side: SideKey, input: RosterInput): void {
    this.layouts[side] = input.layout;
    const onPitch = new Set(input.entries.map((e) => e.id));
    const sentOff = new Set(input.sentOff);

    // Departures walk off rather than vanish.
    this.actors.forEach((actor) => {
      if (actor.side !== side || actor.leaving || onPitch.has(actor.id)) return;
      actor.leaving = true;
      actor.leaveT = 0;
      actor.override = { x: actor.pos.x, y: actor.pos.y < PITCH_H / 2 ? -2.5 : PITCH_H + 2.5 };
      if (sentOff.has(actor.id)) this.deadSlots[side].add(actor.slot);
      if (this.owner === actor) this.owner = null;
    });

    const taken = new Set(
      this.actors.filter((a) => a.side === side && !a.leaving).map((a) => a.slot),
    );
    const firstFree = () => {
      for (let i = 0; i < 11; i++) {
        if (!taken.has(i) && !this.deadSlots[side].has(i)) return i;
      }
      for (let i = 0; i < 11; i++) if (!taken.has(i)) return i;
      return 10;
    };

    const fresh = this.actors.length === 0 || !this.actors.some((a) => a.side === side);
    input.entries.forEach((entry) => {
      const existing = this.actors.find((a) => a.id === entry.id && !a.leaving);
      if (existing) {
        existing.number = entry.number;
        existing.label = surname(entry.name);
        return;
      }
      const slot =
        entry.slotHint !== undefined && !taken.has(entry.slotHint) ? entry.slotHint : firstFree();
      taken.add(slot);
      const actor: Actor = {
        id: entry.id,
        side,
        slot,
        number: entry.number,
        label: surname(entry.name),
        isKeeper: entry.isKeeper || slot === 0,
        pos: { x: 0, y: 0 },
        override: null,
        seed: Math.random() * 1000,
        leaving: false,
        leaveT: 0,
      };
      this.actors.push(actor);
      if (fresh) {
        actor.pos = this.shapeTarget(actor, true);
      } else {
        // Substitutes come on from the halfway line.
        actor.pos = { x: PITCH_W / 2 + rand(-3, 3), y: PITCH_H + 2 };
      }
    });

    // Anyone sent off before we ever saw them keeps his slot closed.
    input.sentOff.forEach((id) => {
      const actor = this.actors.find((a) => a.id === id);
      if (actor) this.deadSlots[actor.side].add(actor.slot);
    });
  }

  /** Hand over the match log. New entries are queued for playback. */
  feed(events: MatchEvent[]): void {
    this.events = events;
    while (this.processed < events.length) {
      this.queue.push(this.processed);
      this.processed += 1;
    }
    this.notifyIfChanged();
  }

  /** Jump straight to the present: everything counts as shown. */
  skipAll(events: MatchEvent[]): void {
    this.events = events;
    this.processed = events.length;
    this.revealedCount = events.length;
    this.queue = [];
    this.current = null;
    this.steps = [];
    this.stepStarted = false;
    this.banner = null;
    this.markers = [];
    this.clearOverrides();
    this.ended = events.some((e) => e.kind === 'fulltime');
    this.kickoff('home', true);
    this.onChange();
  }

  update(rawDt: number): void {
    const dt = rawDt * this.timeScale;
    if (dt <= 0) return;
    this.time += dt;

    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t >= this.banner.dur) this.banner = null;
    }
    this.markers = this.markers.filter((m) => (m.t += dt) < m.dur);

    this.runSteps(dt);
    this.moveActors(dt);
    this.moveBall(dt);
    this.notifyIfChanged();
  }

  view(): SceneView {
    const b = this.banner;
    let banner: SceneView['banner'] = null;
    if (b) {
      const fadeIn = Math.min(1, b.t / 0.18);
      const fadeOut = Math.min(1, (b.dur - b.t) / 0.25);
      banner = { text: b.text, sub: b.sub, color: b.color, big: b.big, alpha: Math.max(0, Math.min(fadeIn, fadeOut)) };
    }
    return {
      actors: this.actors,
      ball: { x: this.ball.pos.x, y: this.ball.pos.y, h: this.ball.h },
      ownerId: this.owner?.id ?? null,
      highlight: this.current !== null,
      celebrating: this.celebrating,
      banner,
      markers: this.markers,
      kits: this.kits,
    };
  }

  /* ------------------------------------------------------------ scheduling */

  private notifyIfChanged(): void {
    const busy = this.busy;
    if (busy !== this.lastBusy) {
      this.lastBusy = busy;
      this.onChange();
    }
  }

  private reveal(index: number): void {
    if (index + 1 > this.revealedCount) {
      this.revealedCount = index + 1;
      this.onChange();
    }
  }

  private runSteps(dt: number): void {
    // Between highlights, keep the ball moving; a queued event cuts in as
    // soon as whatever pass is in the air has landed.
    if (this.current === null && this.queue.length > 0) {
      const head = this.steps[0];
      const midPass = head && head.kind === 'pass' && this.stepStarted && this.flight;
      if (!midPass) {
        this.steps = [];
        this.stepStarted = false;
        this.beginEvent(this.queue.shift()!);
      }
    }

    let guard = 0;
    while (guard++ < 20) {
      if (this.steps.length === 0) {
        if (this.current !== null) {
          this.current = null;
          this.clearOverrides();
          this.onChange();
          if (this.queue.length > 0) {
            this.beginEvent(this.queue.shift()!);
            continue;
          }
        }
        if (!this.ended) this.planAmbient();
        if (this.steps.length === 0) return;
      }

      const step = this.steps[0];
      if (!this.stepStarted) {
        this.stepStarted = true;
        this.stepT = 0;
        this.startStep(step);
      }
      this.stepT += dt;
      if (!this.stepDone(step)) return;
      this.steps.shift();
      this.stepStarted = false;
      dt = 0;
    }
  }

  private startStep(step: Step): void {
    switch (step.kind) {
      case 'pass': {
        if (step.to.leaving) return;
        const lead = step.to.override ?? step.to.pos;
        const point = step.point ?? { ...lead };
        this.launch(point, step.to, step.peak, step.speed ?? 20);
        break;
      }
      case 'carry':
        if (this.owner) this.owner.override = { ...step.to };
        break;
      case 'shoot':
        this.launch(step.target, null, step.peak, step.speed);
        break;
      case 'call':
        step.fn();
        break;
      case 'wait':
        break;
    }
  }

  private stepDone(step: Step): boolean {
    switch (step.kind) {
      case 'pass':
      case 'shoot':
        return this.flight === null;
      case 'carry':
        return !this.owner || this.stepT >= step.dur || dist(this.owner.pos, step.to) < 0.8;
      case 'wait':
        return this.stepT >= step.dur;
      case 'call':
        return true;
    }
  }

  private launch(to: Vec, receiver: Actor | null, peak: number | undefined, speed: number): void {
    const from = { ...this.ball.pos };
    const d = dist(from, to);
    this.owner = null;
    this.flight = {
      from,
      to: { ...to },
      t: 0,
      dur: Math.max(0.2, d / speed),
      peak: peak ?? (d > 28 ? d * 0.1 : 0),
      receiver,
    };
  }

  /* --------------------------------------------------------------- ambient */

  private planAmbient(): void {
    if (!this.owner) {
      const taker = this.nearest(this.possession, this.ball.pos, true);
      if (!taker) return;
      this.steps.push({ kind: 'pass', to: taker, speed: 14, ambient: true });
      return;
    }

    const owner = this.owner;
    const side = owner.side;
    this.steps.push({ kind: 'wait', dur: rand(0.45, 1.1), ambient: true });

    const mates = this.team(side).filter((a) => a !== owner && !a.isKeeper);
    if (mates.length === 0) return;
    const weights = mates.map((mate) => {
      const d = dist(mate.pos, owner.pos);
      const progress = this.progress(side, mate.pos.x);
      const gain = progress - this.progress(side, owner.pos.x);
      let w = Math.exp(-d / 20) * (gain > 0 ? 1.5 : 1);
      // Keep ambient play out of the box: that is reserved for real chances.
      if (progress > 0.74) w *= 0.08;
      if (d < 4) w *= 0.2;
      return w;
    });
    const receiver = weightedPick(mates, weights);

    // Losing the ball is more likely for the side seeing less of it.
    const share = side === 'home' ? this.homeShare : 1 - this.homeShare;
    const turnover = Math.random() < clamp(0.2 * ((1 - share) / 0.5), 0.07, 0.34);
    if (turnover) {
      const mid = lerp(this.ball.pos, receiver.pos, rand(0.45, 0.75));
      const thief = this.nearest(other(side), mid, true);
      if (thief) {
        this.steps.push({ kind: 'pass', to: thief, point: mid, ambient: true });
        return;
      }
    }
    this.steps.push({ kind: 'pass', to: receiver, ambient: true });
  }

  /* ------------------------------------------------------------ highlights */

  private beginEvent(index: number): void {
    const event = this.events[index];
    if (!event) return;
    this.current = index;
    this.steps = [];
    this.stepStarted = false;
    const reveal = () => this.reveal(index);

    switch (event.kind) {
      case 'goal':
      case 'save':
      case 'miss':
      case 'chance':
        this.planChance(event, reveal);
        break;
      case 'foul':
      case 'yellow':
      case 'red':
        this.planFoul(event, reveal);
        break;
      case 'injury':
        this.steps.push(
          { kind: 'wait', dur: 0.3 },
          {
            kind: 'call',
            fn: () => {
              reveal();
              if (event.playerId) this.mark(event.playerId, 'injury', 1.6);
              this.showBanner('부상', this.actorName(event.playerId), '#f4586a', 1.5, false);
            },
          },
          { kind: 'wait', dur: 1.5 },
        );
        break;
      case 'sub':
        this.steps.push(
          {
            kind: 'call',
            fn: () => {
              reveal();
              this.showBanner('교체', undefined, '#3b82f6', 1.1, false);
            },
          },
          { kind: 'wait', dur: 1.0 },
        );
        break;
      case 'kickoff':
        this.steps.push(
          {
            kind: 'call',
            fn: () => {
              reveal();
              this.kickoff('home', true);
              this.showBanner('킥오프', undefined, '#0f172a', 1.0, false);
            },
          },
          { kind: 'wait', dur: 0.9 },
        );
        break;
      case 'halftime':
        this.steps.push(
          {
            kind: 'call',
            fn: () => {
              reveal();
              this.showBanner(
                '하프타임',
                `${event.homeGoals} - ${event.awayGoals}`,
                '#0f172a',
                1.8,
                true,
              );
            },
          },
          { kind: 'wait', dur: 1.8 },
          { kind: 'call', fn: () => this.kickoff('away', true) },
          { kind: 'wait', dur: 0.6 },
        );
        break;
      case 'fulltime':
        this.steps.push(
          {
            kind: 'call',
            fn: () => {
              reveal();
              this.ended = true;
              this.flight = null;
              this.showBanner(
                '경기 종료',
                `${event.homeGoals} - ${event.awayGoals}`,
                '#0f172a',
                2.2,
                true,
              );
            },
          },
          { kind: 'wait', dur: 2.0 },
        );
        break;
      default:
        this.steps.push({ kind: 'call', fn: reveal });
    }
  }

  private planChance(event: MatchEvent, reveal: () => void): void {
    const atk = event.side === 'away' ? 'away' : 'home';
    const def = other(atk);
    const dir = dirOf(atk);
    const goalX = targetGoalX(atk);
    const steps = this.steps;

    const shooter = this.byId(event.playerId) ?? this.mostAdvanced(atk);
    if (!shooter) {
      steps.push({ kind: 'call', fn: reveal }, { kind: 'wait', dur: 0.8 });
      return;
    }
    const assister = event.assistId ? this.byId(event.assistId) : null;
    const flank = Math.random() < 0.5 ? 1 : -1;
    const at = (depth: number, y: number): Vec => ({
      x: goalX - dir * depth,
      y: clamp(y, 2, PITCH_H - 2),
    });

    // 1. Win the ball back if the other side has it.
    if (!this.owner || this.owner.side !== atk) {
      const winner = this.nearest(atk, this.ball.pos, true);
      if (winner) steps.push({ kind: 'pass', to: winner, speed: 16 });
    }

    // 2. A little build-up through midfield.
    const builders = this.team(atk).filter((a) => !a.isKeeper && a !== shooter && a !== assister);
    const buildCount = Math.random() < 0.5 ? 1 : 2;
    for (let i = 0; i < buildCount && builders.length > 0; i++) {
      const b = builders.splice(Math.floor(Math.random() * builders.length), 1)[0];
      steps.push({
        kind: 'call',
        fn: () => {
          b.override = at(rand(38, 55), rand(14, 54));
        },
      });
      steps.push({ kind: 'pass', to: b });
      steps.push({ kind: 'carry', to: at(rand(32, 40), b.override?.y ?? CENTER.y), dur: 0.7 });
    }

    // 3. The final ball.
    const shotSpot = at(rand(9, 15), CENTER.y + rand(-7, 7));
    if (assister && assister !== shooter) {
      const cross = Math.random() < 0.5;
      if (cross) {
        const wideY = CENTER.y + flank * 26;
        steps.push({
          kind: 'call',
          fn: () => {
            assister.override = at(24, wideY);
            shooter.override = at(18, CENTER.y - flank * 4);
          },
        });
        steps.push({ kind: 'pass', to: assister });
        steps.push({ kind: 'carry', to: at(rand(8, 13), wideY), dur: 1.1 });
        steps.push({
          kind: 'call',
          fn: () => {
            shooter.override = { ...shotSpot };
          },
        });
        steps.push({ kind: 'pass', to: shooter, point: shotSpot, peak: 3.2, speed: 19 });
      } else {
        steps.push({
          kind: 'call',
          fn: () => {
            assister.override = at(28, CENTER.y + rand(-10, 10));
            shooter.override = at(22, CENTER.y + flank * 9);
          },
        });
        steps.push({ kind: 'pass', to: assister });
        steps.push({ kind: 'wait', dur: 0.35 });
        steps.push({
          kind: 'call',
          fn: () => {
            shooter.override = { ...shotSpot };
          },
        });
        steps.push({ kind: 'pass', to: shooter, point: shotSpot, speed: 21 });
      }
    } else {
      // Solo run.
      steps.push({
        kind: 'call',
        fn: () => {
          shooter.override = at(26, CENTER.y + flank * 10);
        },
      });
      steps.push({ kind: 'pass', to: shooter });
      steps.push({ kind: 'carry', to: shotSpot, dur: 1.4 });
    }

    // 4. The shot, and how it ends.
    const keeper = this.team(def).find((a) => a.isKeeper) ?? null;
    const goalLineX = goalX;

    if (event.kind === 'goal') {
      const target = {
        x: goalLineX + dir * 1.4,
        y: CENTER.y + rand(-GOAL_HALF + 0.5, GOAL_HALF - 0.5),
      };
      steps.push({ kind: 'shoot', target, peak: rand(0.2, 1.6), speed: 30 });
      steps.push({
        kind: 'call',
        fn: () => {
          reveal();
          const team = atk === 'home' ? this.kits.home : this.kits.away;
          this.celebrating = atk;
          this.showBanner('GOAL!', this.actorName(event.playerId), team.fill, 2.6, true);
          // The scorer wheels away to the corner, team-mates chase him.
          const corner = { x: goalX - dir * 5, y: shooter.pos.y < CENTER.y ? 5 : PITCH_H - 5 };
          shooter.override = corner;
          this.team(atk).forEach((a) => {
            if (a !== shooter && !a.isKeeper && dist(a.pos, corner) < 45) {
              a.override = { x: corner.x - dir * rand(2, 6), y: corner.y + rand(-4, 4) };
            }
          });
        },
      });
      steps.push({ kind: 'wait', dur: 2.6 });
      steps.push({
        kind: 'call',
        fn: () => {
          this.clearOverrides();
          this.kickoff(def, true);
        },
      });
      steps.push({ kind: 'wait', dur: 0.8 });
      return;
    }

    if (event.kind === 'save' && keeper) {
      const saveAt = { x: goalLineX - dir * 1.2, y: CENTER.y + rand(-2.8, 2.8) };
      steps.push({
        kind: 'call',
        fn: () => {
          keeper.override = { ...saveAt };
        },
      });
      steps.push({ kind: 'shoot', target: saveAt, peak: rand(0.2, 1.4), speed: 26 });
      steps.push({
        kind: 'call',
        fn: () => {
          reveal();
          this.owner = keeper;
          this.showBanner('선방!', this.actorName(keeper.id), '#0ea5e9', 1.4, false);
        },
      });
      steps.push({ kind: 'wait', dur: 1.3 });
      steps.push({
        kind: 'call',
        fn: () => {
          keeper.override = null;
        },
      });
      const outlet = this.team(def).filter((a) => !a.isKeeper);
      if (outlet.length > 0) {
        steps.push({
          kind: 'pass',
          to: outlet[Math.floor(Math.random() * outlet.length)],
          speed: 24,
        });
      }
      return;
    }

    if (event.kind === 'miss' || (event.kind === 'save' && !keeper)) {
      const wide = Math.random() < 0.6;
      const target = wide
        ? { x: goalLineX + dir * 2.5, y: CENTER.y + (Math.random() < 0.5 ? -1 : 1) * rand(5, 10) }
        : { x: goalLineX + dir * 2.5, y: CENTER.y + rand(-3, 3) };
      steps.push({ kind: 'shoot', target, peak: wide ? rand(0.3, 1.5) : rand(4.5, 6), speed: 27 });
      steps.push({
        kind: 'call',
        fn: () => {
          reveal();
          this.showBanner('빗나감', this.actorName(event.playerId), '#475569', 1.2, false);
        },
      });
      steps.push({ kind: 'wait', dur: 1.1 });
      steps.push({ kind: 'call', fn: () => this.goalKick(def) });
      steps.push({ kind: 'wait', dur: 0.5 });
      return;
    }

    // Blocked: a defender throws himself in the way.
    const blocker = this.nearest(def, shooter.override ?? shooter.pos, true);
    const blockAt = lerp(shotSpot, { x: goalLineX, y: CENTER.y }, 0.3);
    if (blocker)
      steps.push({
        kind: 'call',
        fn: () => {
          blocker.override = { ...blockAt };
        },
      });
    steps.push({ kind: 'shoot', target: blockAt, peak: 0.4, speed: 26 });
    const deflect = {
      x: goalLineX + dir * 1.5,
      y: blockAt.y < CENTER.y ? rand(8, 22) : rand(46, 60),
    };
    steps.push({
      kind: 'call',
      fn: () => {
        reveal();
        this.showBanner('슈팅 차단', this.actorName(blocker?.id), '#475569', 1.2, false);
      },
    });
    steps.push({ kind: 'shoot', target: deflect, peak: 2, speed: 16 });
    steps.push({ kind: 'wait', dur: 0.8 });
    steps.push({ kind: 'call', fn: () => this.goalKick(def) });
    steps.push({ kind: 'wait', dur: 0.4 });
  }

  private planFoul(event: MatchEvent, reveal: () => void): void {
    const offender = this.byId(event.playerId);
    const card = event.kind === 'yellow' ? 'yellow' : event.kind === 'red' ? 'red' : null;
    const fouledSide: SideKey = event.side === 'home' ? 'away' : 'home';

    this.steps.push({
      kind: 'call',
      fn: () => {
        const spot = { ...this.ball.pos };
        this.flight = null;
        if (offender && !offender.leaving)
          offender.override = { x: spot.x + rand(-1, 1), y: spot.y + rand(-1, 1) };
        const victim = this.nearest(fouledSide, spot, true);
        if (victim) {
          victim.override = { ...spot };
          this.owner = victim;
        }
      },
    });
    this.steps.push({ kind: 'wait', dur: 0.5 });
    this.steps.push({
      kind: 'call',
      fn: () => {
        reveal();
        const name = this.actorName(event.playerId);
        if (card === 'yellow') {
          this.showBanner('경고', name, '#ca8a04', 1.5, false);
          if (event.playerId) this.mark(event.playerId, 'yellow', 1.8);
        } else if (card === 'red') {
          this.showBanner('퇴장!', name, '#dc2626', 1.8, true);
          if (event.playerId) this.mark(event.playerId, 'red', 2.2);
        } else {
          this.showBanner('파울', name, '#334155', 0.9, false);
        }
      },
    });
    this.steps.push({ kind: 'wait', dur: card ? 1.6 : 0.8 });
  }

  /* --------------------------------------------------------- set positions */

  private kickoff(side: SideKey, snap: boolean): void {
    this.celebrating = null;
    this.flight = null;
    this.ball.pos = { ...CENTER };
    this.ball.h = 0;
    this.possession = side;
    this.actors.forEach((a) => {
      a.override = a.leaving ? a.override : null;
      if (snap && !a.leaving) a.pos = this.shapeTarget(a, true);
    });
    const taker = this.mostAdvanced(side);
    if (taker) {
      taker.pos = { x: CENTER.x - dirOf(side) * 0.6, y: CENTER.y };
      this.owner = taker;
    } else {
      this.owner = null;
    }
  }

  private goalKick(side: SideKey): void {
    const keeper = this.team(side).find((a) => a.isKeeper);
    this.flight = null;
    const x = side === 'home' ? 5.5 : PITCH_W - 5.5;
    this.ball.pos = { x, y: CENTER.y + rand(-6, 6) };
    this.ball.h = 0;
    this.possession = side;
    if (keeper) {
      keeper.pos = { ...this.ball.pos };
      this.owner = keeper;
    } else {
      this.owner = null;
    }
  }

  private clearOverrides(): void {
    this.actors.forEach((a) => {
      if (!a.leaving) a.override = null;
    });
  }

  private showBanner(
    text: string,
    sub: string | undefined,
    color: string,
    dur: number,
    big: boolean,
  ): void {
    this.banner = { text, sub, color, dur, big, t: 0 };
  }

  private mark(actorId: string, kind: Marker['kind'], dur: number): void {
    this.markers.push({ actorId, kind, dur, t: 0 });
  }

  /* -------------------------------------------------------------- movement */

  /** Progress of x along `side`'s attacking direction, 0 = own goal line. */
  private progress(side: SideKey, x: number): number {
    return side === 'home' ? x / PITCH_W : 1 - x / PITCH_W;
  }

  /** Where a player wants to stand given the ball, the phase and his slot. */
  private shapeTarget(actor: Actor, kickoff = false): Vec {
    const layout = this.layouts[actor.side][actor.slot] ?? { x: 50, y: 50 };
    const ballX = kickoff ? CENTER.x : this.ball.pos.x;
    const ballY = kickoff ? CENTER.y : this.ball.pos.y;
    const ballProg = this.progress(actor.side, ballX);
    const inPossession = this.possession === actor.side;
    const ballLat = actor.side === 'home' ? ballY / PITCH_H : 1 - ballY / PITCH_H;

    let depth: number;
    let lat = layout.x / 100;
    if (actor.isKeeper) {
      depth = 0.035 + Math.max(0, ballProg - 0.4) * 0.14;
      lat = 0.5 + (ballLat - 0.5) * 0.12;
    } else {
      const norm = clamp((layout.y - 20) / 67, 0, 1);
      const back = inPossession ? 0.08 + ballProg * 0.42 : 0.06 + ballProg * 0.36;
      const len = inPossession ? 0.52 : 0.4;
      depth = clamp(back + norm * len, 0.06, 0.92);
      lat = 0.5 + (lat - 0.5) * (inPossession ? 1.05 : 0.82);
      lat += (ballLat - lat) * (inPossession ? 0.1 : 0.24);
      if (kickoff) {
        depth = Math.min(depth, inPossession ? 0.47 : 0.4);
      } else {
        lat += Math.sin(this.time * 0.6 + actor.seed) * 0.015;
        depth += Math.cos(this.time * 0.5 + actor.seed * 1.7) * 0.01;
      }
    }
    lat = clamp(lat, 0.04, 0.96);

    return actor.side === 'home'
      ? { x: depth * PITCH_W, y: lat * PITCH_H }
      : { x: PITCH_W - depth * PITCH_W, y: PITCH_H - lat * PITCH_H };
  }

  private moveActors(dt: number): void {
    // The nearest man out of possession closes the ball down.
    const presser = this.owner ? this.nearest(other(this.owner.side), this.ball.pos, true) : null;

    this.actors.forEach((actor) => {
      let target: Vec;
      let speed = 6.5;
      if (actor.override) {
        target = actor.override;
        speed = 8.5;
      } else if (this.flight?.receiver === actor) {
        target = this.flight.to;
        speed = 8;
      } else if (actor === this.owner) {
        target = this.shapeTarget(actor);
        speed = 3;
      } else if (actor === presser && !this.busy) {
        const toGoal = actor.side === 'home' ? -1.4 : 1.4;
        target = { x: this.ball.pos.x + toGoal, y: this.ball.pos.y };
        speed = 6;
      } else {
        target = this.shapeTarget(actor);
      }

      const dx = target.x - actor.pos.x;
      const dy = target.y - actor.pos.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.05) {
        // Ease in over the last couple of metres so nobody jitters on arrival.
        const step = Math.min(d, speed * dt * Math.min(1, 0.35 + d / 3));
        actor.pos.x += (dx / d) * step;
        actor.pos.y += (dy / d) * step;
      }

      if (actor.leaving) actor.leaveT += dt;
    });

    this.actors = this.actors.filter(
      (a) => !(a.leaving && (a.leaveT > 6 || a.pos.y < -2 || a.pos.y > PITCH_H + 2)),
    );
  }

  private moveBall(dt: number): void {
    const flight = this.flight;
    if (flight) {
      flight.t += dt;
      const k = Math.min(1, flight.t / flight.dur);
      // Ground passes slow down as they roll; lofted balls travel evenly.
      const eased = flight.peak > 0.5 ? k : 1 - (1 - k) * (1 - k);
      this.ball.pos = lerp(flight.from, flight.to, eased);
      this.ball.h = flight.peak * 4 * k * (1 - k);
      if (k >= 1) {
        this.flight = null;
        this.ball.h = 0;
        if (flight.receiver && !flight.receiver.leaving) {
          this.owner = flight.receiver;
          this.possession = flight.receiver.side;
          if (flight.receiver.override && !this.current) flight.receiver.override = null;
        }
      }
      return;
    }

    const owner = this.owner;
    if (owner) {
      const dir = dirOf(owner.side);
      const want = { x: owner.pos.x + dir * 0.7, y: owner.pos.y + 0.3 };
      this.ball.pos = lerp(this.ball.pos, want, Math.min(1, dt * 12));
      this.ball.h = 0;
    }
  }

  /* --------------------------------------------------------------- lookups */

  private team(side: SideKey): Actor[] {
    return this.actors.filter((a) => a.side === side && !a.leaving);
  }

  private byId(id: string | undefined): Actor | null {
    if (!id) return null;
    return this.actors.find((a) => a.id === id && !a.leaving) ?? null;
  }

  private actorName(id: string | undefined): string | undefined {
    const actor = id ? this.actors.find((a) => a.id === id) : undefined;
    return actor ? `${actor.number}. ${actor.label}` : undefined;
  }

  private nearest(side: SideKey, point: Vec, outfieldOnly: boolean): Actor | null {
    let best: Actor | null = null;
    let bestD = Infinity;
    this.team(side).forEach((a) => {
      if (outfieldOnly && a.isKeeper) return;
      const d = dist(a.pos, point);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    });
    return best;
  }

  private mostAdvanced(side: SideKey): Actor | null {
    const layout = this.layouts[side];
    let best: Actor | null = null;
    this.team(side).forEach((a) => {
      if (a.isKeeper) return;
      if (!best || (layout[a.slot]?.y ?? 0) > (layout[best.slot]?.y ?? 0)) best = a;
    });
    return best;
  }

  /* --------------------------------------------------------------- drawing */

  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const s = Math.min(width / (PITCH_W + MARGIN * 2), height / (PITCH_H + MARGIN * 2));
    const ox = (width - (PITCH_W + MARGIN * 2) * s) / 2;
    const oy = (height - (PITCH_H + MARGIN * 2) * s) / 2;
    const X = (x: number) => ox + (x + MARGIN) * s;
    const Y = (y: number) => oy + (y + MARGIN) * s;

    drawPitch(ctx, width, height, s, X, Y);

    const radius = Math.max(8.5, 1.75 * s);
    const showNames = s >= 6;

    // Painter's order: further up the screen first.
    const sorted = [...this.actors].sort((a, b) => a.pos.y - b.pos.y);

    // Shadows
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    sorted.forEach((a) => {
      ctx.beginPath();
      ctx.ellipse(
        X(a.pos.x) + radius * 0.25,
        Y(a.pos.y) + radius * 0.55,
        radius * 0.95,
        radius * 0.45,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    });

    sorted.forEach((a) => {
      const kit = this.kits[a.side];
      const fill = a.isKeeper ? kit.keeper : kit.fill;
      const cx = X(a.pos.x);
      const cy = Y(a.pos.y);
      ctx.globalAlpha = a.leaving ? 0.45 : 1;

      if (a === this.owner) {
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(cx, cy + radius * 0.55, radius * 1.35, radius * 0.6, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = a.isKeeper ? '#111827' : kit.trim;
      ctx.stroke();

      ctx.fillStyle = readableOn(fill);
      ctx.font = `800 ${Math.round(radius * 1.05)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(a.number), cx, cy + 0.5);

      if (showNames) {
        ctx.font = `600 ${Math.round(Math.max(10, radius * 0.62))}px system-ui, sans-serif`;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.strokeText(a.label, cx, cy + radius * 1.7);
        ctx.fillStyle = '#fff';
        ctx.fillText(a.label, cx, cy + radius * 1.7);
      }
      ctx.globalAlpha = 1;
    });

    // Cards and knocks above the player's head.
    this.markers.forEach((m) => {
      const a = this.actors.find((x) => x.id === m.actorId);
      if (!a) return;
      const cx = X(a.pos.x);
      const cy = Y(a.pos.y) - radius * 2.3 - Math.sin(Math.min(1, m.t * 3) * Math.PI) * 4;
      if (m.kind === 'injury') {
        ctx.fillStyle = '#fff';
        roundRect(ctx, cx - radius * 0.7, cy - radius * 0.7, radius * 1.4, radius * 1.4, 3);
        ctx.fill();
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(cx - radius * 0.5, cy - radius * 0.15, radius, radius * 0.3);
        ctx.fillRect(cx - radius * 0.15, cy - radius * 0.5, radius * 0.3, radius);
      } else {
        ctx.fillStyle = m.kind === 'yellow' ? '#facc15' : '#ef4444';
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1;
        roundRect(ctx, cx - radius * 0.45, cy - radius * 0.65, radius * 0.9, radius * 1.3, 2);
        ctx.fill();
        ctx.stroke();
      }
    });

    // Ball: shadow on the grass, ball lifted by its height.
    const br = Math.max(4, 0.62 * s);
    const bx = X(this.ball.pos.x);
    const by = Y(this.ball.pos.y);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(
      bx + this.ball.h * s * 0.15,
      by + br * 0.4,
      br * (1 - Math.min(0.4, this.ball.h * 0.05)),
      br * 0.5,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    const lift = this.ball.h * s * 0.55;
    const ballR = br * (1 + Math.min(0.5, this.ball.h * 0.06));
    ctx.beginPath();
    ctx.arc(bx, by - lift, ballR, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#111827';
    ctx.stroke();
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(bx, by - lift, ballR * 0.38, 0, Math.PI * 2);
    ctx.fill();

    if (this.banner) this.drawBanner(ctx, width, height);
  }

  private drawBanner(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const b = this.banner!;
    const fadeIn = Math.min(1, b.t / 0.18);
    const fadeOut = Math.min(1, (b.dur - b.t) / 0.25);
    const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
    const scale = b.big ? 1 + (1 - fadeIn) * 0.25 : 1;

    const titleSize = Math.round((b.big ? 0.085 : 0.045) * width * scale);
    const subSize = Math.round(Math.max(11, 0.022 * width));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `900 ${titleSize}px system-ui, sans-serif`;
    const tw = ctx.measureText(b.text).width;
    ctx.font = `700 ${subSize}px system-ui, sans-serif`;
    const sw = b.sub ? ctx.measureText(b.sub).width : 0;
    const w = Math.max(tw, sw) + titleSize * 1.2;
    const h = titleSize * 1.25 + (b.sub ? subSize * 1.5 : 0) + titleSize * 0.3;
    const x = width / 2 - w / 2;
    const y = b.big ? height / 2 - h / 2 : height * 0.08;

    ctx.fillStyle = b.color;
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 14;
    roundRect(ctx, x, y, w, h, Math.min(14, h / 3));
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.stroke();

    const ink = readableOn(b.color);
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `900 ${titleSize}px system-ui, sans-serif`;
    ctx.fillText(b.text, width / 2, y + titleSize * 0.2);
    if (b.sub) {
      ctx.font = `700 ${subSize}px system-ui, sans-serif`;
      ctx.globalAlpha = alpha * 0.9;
      ctx.fillText(b.sub, width / 2, y + titleSize * 1.35);
    }
    ctx.restore();
  }
}

/* -------------------------------------------------------------------------- */

function weightedPick<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function parseHex(color: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3)
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Black or white, whichever reads better on `bg`. */
export function readableOn(bg: string): string {
  const rgb = parseHex(bg);
  if (!rgb) return '#fff';
  const [r, g, b] = rgb;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#111827' : '#ffffff';
}

/** Rough perceptual distance between two hex colours, 0-~440. */
export function colorDistance(a: string, b: string): number {
  const x = parseHex(a);
  const y = parseHex(b);
  if (!x || !y) return 999;
  const rMean = (x[0] + y[0]) / 2;
  const dr = x[0] - y[0];
  const dg = x[1] - y[1];
  const db = x[2] - y[2];
  return (
    Math.sqrt((2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db) / 3
  );
}

export function drawPitch(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  s: number,
  X: (x: number) => number,
  Y: (y: number) => number,
): void {
  ctx.fillStyle = '#1d6b2c';
  ctx.fillRect(0, 0, width, height);

  // Mown stripes across the full surround.
  const stripes = 18;
  const stripeW = (PITCH_W + MARGIN * 2) / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#2f8a3b' : '#2a7f35';
    ctx.fillRect(X(-MARGIN + i * stripeW), Y(-MARGIN), stripeW * s + 1, (PITCH_H + MARGIN * 2) * s);
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = Math.max(1.2, 0.14 * s);
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(X(x1), Y(y1));
    ctx.lineTo(X(x2), Y(y2));
    ctx.stroke();
  };
  const rect = (x: number, y: number, w: number, h: number) =>
    ctx.strokeRect(X(x), Y(y), w * s, h * s);
  const circle = (x: number, y: number, r: number, from = 0, to = Math.PI * 2) => {
    ctx.beginPath();
    ctx.arc(X(x), Y(y), r * s, from, to);
    ctx.stroke();
  };
  const spot = (x: number, y: number) => {
    ctx.beginPath();
    ctx.arc(X(x), Y(y), Math.max(1.5, 0.25 * s), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fill();
  };

  rect(0, 0, PITCH_W, PITCH_H);
  line(PITCH_W / 2, 0, PITCH_W / 2, PITCH_H);
  circle(PITCH_W / 2, PITCH_H / 2, 9.15);
  spot(PITCH_W / 2, PITCH_H / 2);

  const boxW = 40.32;
  const sixW = 18.32;
  // Penalty areas, six-yard boxes, spots and arcs at both ends.
  rect(0, (PITCH_H - boxW) / 2, 16.5, boxW);
  rect(PITCH_W - 16.5, (PITCH_H - boxW) / 2, 16.5, boxW);
  rect(0, (PITCH_H - sixW) / 2, 5.5, sixW);
  rect(PITCH_W - 5.5, (PITCH_H - sixW) / 2, 5.5, sixW);
  spot(11, PITCH_H / 2);
  spot(PITCH_W - 11, PITCH_H / 2);
  const arc = Math.acos(5.5 / 9.15);
  circle(11, PITCH_H / 2, 9.15, -arc, arc);
  circle(PITCH_W - 11, PITCH_H / 2, 9.15, Math.PI - arc, Math.PI + arc);
  circle(0, 0, 1, 0, Math.PI / 2);
  circle(PITCH_W, 0, 1, Math.PI / 2, Math.PI);
  circle(0, PITCH_H, 1, -Math.PI / 2, 0);
  circle(PITCH_W, PITCH_H, 1, Math.PI, Math.PI * 1.5);

  // Goals with a little netting.
  [0, PITCH_W].forEach((gx) => {
    const depth = 2;
    const x0 = gx === 0 ? -depth : PITCH_W;
    const top = PITCH_H / 2 - GOAL_HALF;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(X(x0), Y(top), depth * s, GOAL_HALF * 2 * s);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 0.6;
    for (let y = top; y <= top + GOAL_HALF * 2 + 0.01; y += 0.9) line(x0, y, x0 + depth, y);
    for (let x = x0; x <= x0 + depth + 0.01; x += 0.7) line(x, top, x, top + GOAL_HALF * 2);
    ctx.restore();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(2, 0.22 * s);
    rect(x0, top, depth, GOAL_HALF * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(1.2, 0.14 * s);
  });
}

export const PITCH_ASPECT = (PITCH_W + MARGIN * 2) / (PITCH_H + MARGIN * 2);
