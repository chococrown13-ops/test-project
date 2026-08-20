/**
 * Small deterministic PRNG (mulberry32). Seeded generation keeps a save file
 * reproducible: the same seed always builds the same league.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  bool(chance: number): boolean {
    return this.next() < chance;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  /** Fisher-Yates, returns a new array. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** Roughly normal via the mean of three uniforms, clamped to [min, max]. */
  around(centre: number, spread: number, min = 1, max = 99): number {
    const roll = (this.next() + this.next() + this.next()) / 3;
    const value = centre + (roll - 0.5) * 2 * spread;
    return Math.round(Math.max(min, Math.min(max, value)));
  }
}

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
