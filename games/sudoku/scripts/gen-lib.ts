// Puzzle generation shared by the bank generator and the soundness check.
import { countSolutions, randomFullGrid } from '../src/brute.ts';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random full grid, then remove clues in symmetric pairs while the solution stays unique. */
export function makePuzzle(rand: () => number): { puzzle: number[]; solution: number[] } {
  const solution = randomFullGrid(rand);
  const puzzle = solution.slice();
  const order = [...Array(41).keys()];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (const c of order) {
    const m = 80 - c;
    const a = puzzle[c];
    const b = puzzle[m];
    puzzle[c] = 0;
    puzzle[m] = 0;
    if (countSolutions(puzzle, 2) !== 1) {
      puzzle[c] = a;
      puzzle[m] = b;
    }
  }
  return { puzzle, solution };
}
