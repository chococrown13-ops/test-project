// Game rules on top of a matter.js world. Knows nothing about the DOM or
// canvas: the renderer reads `fruits()` and the event callbacks drive effects.

import Matter from 'matter-js';
import { DROPPABLE_TIERS, FRUITS, MAX_TIER, pointsFor } from './fruits';

const { Engine, Bodies, Body, Composite, Events } = Matter;

/** Inner size of the box, in world units. */
export const WORLD_W = 420;
export const WORLD_H = 640;
/** Fruits resting above this line for too long end the game. */
export const DANGER_Y = 100;
/** Where the fruit in hand hangs before it is dropped. */
export const HOLD_Y = 48;

const STEP_MS = 1000 / 60;
const DROP_COOLDOWN_MS = 450;
/** A freshly dropped fruit is still falling through the line, so ignore it for a while. */
const GRACE_MS = 1300;
const DANGER_LIMIT_MS = 2500;
const COMBO_WINDOW_MS = 900;
/** Two watermelons clear each other for this bonus. */
const MELON_BONUS = 100;

export interface FruitBody {
  body: Matter.Body;
  tier: number;
  bornAt: number;
  /** Merged-into-existence fruits pop in; dropped ones don't. */
  pop: boolean;
}

export interface MergeEvent {
  x: number;
  y: number;
  tier: number; // tier of the fruit that was created (MAX_TIER + 1 = cleared)
  points: number;
  combo: number;
}

export interface GameEvents {
  onDrop?: () => void;
  onMerge?: (e: MergeEvent) => void;
  onGameOver?: () => void;
}

export class Game {
  readonly engine: Matter.Engine;
  private byId = new Map<number, FruitBody>();
  private pending: [Matter.Body, Matter.Body][] = [];
  private acc = 0;
  private dangerMs = 0;

  time = 0; // ms of simulated play
  score = 0;
  combo = 0;
  private lastMergeAt = -Infinity;
  /** Highest tier made this run, for the result screen. */
  bestTier = 0;

  current: number;
  next: number;
  dropX = WORLD_W / 2;
  private readyAt = 0;
  over = false;

  constructor(private events: GameEvents = {}) {
    this.engine = Engine.create({ positionIterations: 10, velocityIterations: 8 });
    this.engine.gravity.y = 1.6;

    const t = 200; // wall thickness, thick enough that nothing tunnels through
    const wall = { isStatic: true, friction: 0.3, restitution: 0.1, label: 'wall' };
    Composite.add(this.engine.world, [
      Bodies.rectangle(WORLD_W / 2, WORLD_H + t / 2, WORLD_W + t * 2, t, wall),
      Bodies.rectangle(-t / 2, WORLD_H / 2 - 400, t, WORLD_H + 800, wall),
      Bodies.rectangle(WORLD_W + t / 2, WORLD_H / 2 - 400, t, WORLD_H + 800, wall),
    ]);

    const collect = (e: Matter.IEventCollision<Matter.Engine>) => {
      for (const p of e.pairs) this.pending.push([p.bodyA, p.bodyB]);
    };
    Events.on(this.engine, 'collisionStart', collect);
    // Fruits that were already touching when one of them grew into a match
    // never get a fresh "start", so keep checking resting contacts too.
    Events.on(this.engine, 'collisionActive', collect);

    this.current = this.randomTier();
    this.next = this.randomTier();
  }

  fruits(): Iterable<FruitBody> {
    return this.byId.values();
  }

  /** 0 = safe, 1 = about to lose. */
  get danger(): number {
    return Math.min(1, this.dangerMs / DANGER_LIMIT_MS);
  }

  /** True when any settled fruit is close to the line (for the warning glow). */
  get nearLine(): boolean {
    for (const f of this.byId.values()) {
      if (this.time - f.bornAt < GRACE_MS) continue;
      if (f.body.position.y - FRUITS[f.tier].radius < DANGER_Y + 60) return true;
    }
    return false;
  }

  get canDrop(): boolean {
    return !this.over && this.time >= this.readyAt;
  }

  /** Clamp an x so the fruit in hand fits inside the walls. */
  setDropX(x: number): void {
    const r = FRUITS[this.current].radius;
    this.dropX = Math.max(r, Math.min(WORLD_W - r, x));
  }

  drop(): boolean {
    if (!this.canDrop) return false;
    this.setDropX(this.dropX);
    // A tiny random nudge stops perfect towers from balancing forever.
    this.spawn(this.current, this.dropX + (Math.random() - 0.5) * 0.5, HOLD_Y, false);
    this.current = this.next;
    this.next = this.randomTier();
    this.readyAt = this.time + DROP_COOLDOWN_MS;
    this.setDropX(this.dropX);
    this.events.onDrop?.();
    return true;
  }

  update(dtMs: number): void {
    if (this.over) return;
    this.acc += Math.min(dtMs, 100); // don't spiral after a background tab
    while (this.acc >= STEP_MS) {
      this.acc -= STEP_MS;
      this.time += STEP_MS;
      Engine.update(this.engine, STEP_MS);
      this.resolveMerges();
      this.checkDanger(STEP_MS);
      if (this.over) return;
    }
  }

  private spawn(tier: number, x: number, y: number, pop: boolean): Matter.Body {
    const f = FRUITS[tier];
    const body = Bodies.circle(x, y, f.radius, {
      restitution: 0.15,
      friction: 0.15,
      frictionStatic: 0.4,
      frictionAir: 0.004,
      density: 0.001,
      label: 'fruit',
    });
    Composite.add(this.engine.world, body);
    this.byId.set(body.id, { body, tier, bornAt: this.time, pop });
    return body;
  }

  private resolveMerges(): void {
    if (this.pending.length === 0) return;
    const pairs = this.pending;
    this.pending = [];
    const used = new Set<number>();

    for (const [a, b] of pairs) {
      if (used.has(a.id) || used.has(b.id)) continue;
      const fa = this.byId.get(a.id);
      const fb = this.byId.get(b.id);
      if (!fa || !fb || fa.tier !== fb.tier) continue;
      used.add(a.id);
      used.add(b.id);

      const x = (a.position.x + b.position.x) / 2;
      const y = (a.position.y + b.position.y) / 2;
      Composite.remove(this.engine.world, a);
      Composite.remove(this.engine.world, b);
      this.byId.delete(a.id);
      this.byId.delete(b.id);

      this.combo = this.time - this.lastMergeAt < COMBO_WINDOW_MS ? this.combo + 1 : 1;
      this.lastMergeAt = this.time;

      const newTier = fa.tier + 1;
      let points: number;
      if (fa.tier === MAX_TIER) {
        points = MELON_BONUS;
      } else {
        points = pointsFor(newTier);
        const nb = this.spawn(newTier, x, y, true);
        used.add(nb.id); // let it land before it can merge again this step
        Body.setVelocity(nb, {
          x: (a.velocity.x + b.velocity.x) * 0.25,
          y: (a.velocity.y + b.velocity.y) * 0.25,
        });
        this.bestTier = Math.max(this.bestTier, newTier);
      }
      // Combos add a little on top so chain reactions feel rewarding.
      points += Math.floor(points * 0.1 * (this.combo - 1));
      this.score += points;
      this.events.onMerge?.({ x, y, tier: newTier, points, combo: this.combo });
    }
  }

  private checkDanger(dt: number): void {
    let over = false;
    for (const f of this.byId.values()) {
      if (this.time - f.bornAt < GRACE_MS) continue;
      if (f.body.position.y - FRUITS[f.tier].radius < DANGER_Y) {
        over = true;
        break;
      }
    }
    this.dangerMs = over ? this.dangerMs + dt : Math.max(0, this.dangerMs - dt * 2);
    if (this.dangerMs >= DANGER_LIMIT_MS) {
      this.over = true;
      this.events.onGameOver?.();
    }
  }

  private randomTier(): number {
    // Smaller fruits more often: weights 5,4,3,2,1.
    const weights = Array.from({ length: DROPPABLE_TIERS }, (_, i) => DROPPABLE_TIERS - i);
    let r = Math.random() * weights.reduce((s, w) => s + w, 0);
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) return i;
    }
    return 0;
  }
}
