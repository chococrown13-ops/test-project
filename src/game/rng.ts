/** Seeded PRNG (mulberry32). Everything random in the game runs through one of these. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }

  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  bool(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  /** Roughly normal, via the sum of three uniforms. */
  normal(mean: number, spread: number): number {
    return mean + (this.next() + this.next() + this.next() - 1.5) * spread * 1.15;
  }

  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
    if (total <= 0) return this.pick(items);
    let roll = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      roll -= Math.max(0, weights[i]);
      if (roll <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  /** A fresh child generator, so subsystems don't consume each other's sequence. */
  fork(): Rng {
    return new Rng(Math.floor(this.next() * 4294967296));
  }
}

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const round1 = (value: number): number => Math.round(value * 10) / 10;
