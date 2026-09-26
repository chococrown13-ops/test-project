// Logical solver: repeatedly applies the easiest technique that makes
// progress. Grading a puzzle = the hardest tier this solver needed.

import { PEERS, bit, computeCandidates } from './core.ts';
import { TECHS, type State, type Step, type TechId } from './techniques.ts';

export function cloneState(s: State): State {
  return { grid: s.grid.slice(), cand: s.cand.slice() };
}

export function stateFromGrid(grid: number[]): State {
  return { grid: grid.slice(), cand: computeCandidates(grid) };
}

export function applyStep(s: State, step: Step): void {
  if (step.place) {
    const { cell, digit } = step.place;
    s.grid[cell] = digit;
    s.cand[cell] = 0;
    for (const p of PEERS[cell]) s.cand[p] &= ~bit(digit);
  }
  for (const e of step.elim) s.cand[e.cell] &= ~bit(e.digit);
}

/** The easiest step available, trying techniques in order. */
export function nextStep(s: State, maxTier = 4): Step | null {
  for (const t of TECHS) {
    if (t.tier > maxTier) break;
    const found = t.find(s, 1);
    if (found.length) return found[0];
  }
  return null;
}

export interface SolveResult {
  solved: boolean;
  steps: Step[];
  /** Hardest tier used (0 if singles only). */
  tier: number;
  used: TechId[];
  /** States just before each step, for mining practice positions. */
  before?: State[];
}

export function solveLogical(grid: number[], opts: { keepStates?: boolean; maxTier?: number } = {}): SolveResult {
  const s = stateFromGrid(grid);
  const steps: Step[] = [];
  const before: State[] = [];
  const used = new Set<TechId>();
  let tier = 0;
  for (let guard = 0; guard < 2000; guard++) {
    if (s.grid.every((d) => d)) break;
    const step = nextStep(s, opts.maxTier ?? 4);
    if (!step) break;
    if (opts.keepStates) before.push(cloneState(s));
    applyStep(s, step);
    steps.push(step);
    used.add(step.tech);
    tier = Math.max(tier, TECHS.find((t) => t.id === step.tech)!.tier);
  }
  return {
    solved: s.grid.every((d) => d),
    steps,
    tier,
    used: TECHS.filter((t) => used.has(t.id)).map((t) => t.id),
    before: opts.keepStates ? before : undefined,
  };
}
