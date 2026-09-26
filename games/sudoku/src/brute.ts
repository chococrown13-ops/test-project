// Backtracking solver: used to check uniqueness while generating and to get
// the solution a puzzle is checked against. Not how a human solves — that's
// techniques.ts.

import { PEERS, bit } from './core.ts';

/** Count solutions up to `limit`; fills `out` with the first one found. */
export function countSolutions(grid: number[], limit = 2, out?: number[]): number {
  const g = grid.slice();
  // Row/col/box used-digit masks for fast candidate lookup.
  const rowM = new Array<number>(9).fill(0);
  const colM = new Array<number>(9).fill(0);
  const boxM = new Array<number>(9).fill(0);
  for (let c = 0; c < 81; c++) {
    const d = g[c];
    if (!d) continue;
    const r = (c / 9) | 0;
    const k = c % 9;
    const b = ((r / 3) | 0) * 3 + ((k / 3) | 0);
    const m = bit(d);
    if ((rowM[r] | colM[k] | boxM[b]) & m) return 0; // contradictory givens
    rowM[r] |= m;
    colM[k] |= m;
    boxM[b] |= m;
  }
  let count = 0;

  const rec = (): boolean => {
    // Pick the empty cell with the fewest options.
    let best = -1;
    let bestMask = 0;
    let bestN = 10;
    for (let c = 0; c < 81; c++) {
      if (g[c]) continue;
      const r = (c / 9) | 0;
      const k = c % 9;
      const b = ((r / 3) | 0) * 3 + ((k / 3) | 0);
      const mask = ~(rowM[r] | colM[k] | boxM[b]) & 0x1ff;
      let n = 0;
      for (let m = mask; m; m &= m - 1) n++;
      if (n < bestN) {
        best = c;
        bestMask = mask;
        bestN = n;
        if (n <= 1) break;
      }
    }
    if (best < 0) {
      count++;
      if (out && count === 1) for (let i = 0; i < 81; i++) out[i] = g[i];
      return count >= limit;
    }
    if (bestN === 0) return false;
    const r = (best / 9) | 0;
    const k = best % 9;
    const b = ((r / 3) | 0) * 3 + ((k / 3) | 0);
    for (let d = 1; d <= 9; d++) {
      const m = bit(d);
      if (!(bestMask & m)) continue;
      g[best] = d;
      rowM[r] |= m;
      colM[k] |= m;
      boxM[b] |= m;
      if (rec()) return true;
      rowM[r] &= ~m;
      colM[k] &= ~m;
      boxM[b] &= ~m;
    }
    g[best] = 0;
    return false;
  };

  rec();
  return count;
}

export function solve(grid: number[]): number[] | null {
  const out = new Array<number>(81).fill(0);
  return countSolutions(grid, 1, out) === 1 ? out : null;
}

/** A random complete, valid grid. */
export function randomFullGrid(rand: () => number): number[] {
  const g = new Array<number>(81).fill(0);
  const rec = (c: number): boolean => {
    if (c === 81) return true;
    const ds = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    for (let i = ds.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [ds[i], ds[j]] = [ds[j], ds[i]];
    }
    for (const d of ds) {
      if (PEERS[c].some((p) => g[p] === d)) continue;
      g[c] = d;
      if (rec(c + 1)) return true;
    }
    g[c] = 0;
    return false;
  };
  rec(0);
  return g;
}
