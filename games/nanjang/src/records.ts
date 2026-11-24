import type { RoundLog } from './sim/game';

/** A finished game, kept on this device so past games can be looked back on. */
export interface GameRecord {
  at: number; theme: string; place: number; rounds: number;
  board: { id: string; star: number }[];
  traits: string[];
  log: RoundLog[];
}

const KEY = 'nanjang.records';
const MAX = 60;

export function records(): GameRecord[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function addRecord(r: GameRecord) {
  try { localStorage.setItem(KEY, JSON.stringify([r, ...records()].slice(0, MAX))); } catch { /* storage blocked */ }
}
