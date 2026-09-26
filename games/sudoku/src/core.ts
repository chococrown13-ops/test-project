// Board geometry and candidate bitmasks shared by the solver, generator and UI.
// Cells are numbered 0..80 row by row. Candidates are 9-bit masks where bit
// (d - 1) means digit d is still possible.

export const ALL = 0x1ff;

export const rowOf = (c: number) => Math.floor(c / 9);
export const colOf = (c: number) => c % 9;
export const boxOf = (c: number) => Math.floor(rowOf(c) / 3) * 3 + Math.floor(colOf(c) / 3);

export const bit = (d: number) => 1 << (d - 1);
export const has = (mask: number, d: number) => (mask & bit(d)) !== 0;

export function popcount(m: number): number {
  let n = 0;
  while (m) {
    m &= m - 1;
    n++;
  }
  return n;
}

export function digitsOf(mask: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= 9; d++) if (mask & bit(d)) out.push(d);
  return out;
}

/** 27 units: rows 0-8, columns 9-17, boxes 18-26. */
export const UNITS: number[][] = [];
for (let r = 0; r < 9; r++) UNITS.push(Array.from({ length: 9 }, (_, i) => r * 9 + i));
for (let c = 0; c < 9; c++) UNITS.push(Array.from({ length: 9 }, (_, i) => i * 9 + c));
for (let b = 0; b < 9; b++) {
  const r0 = Math.floor(b / 3) * 3;
  const c0 = (b % 3) * 3;
  UNITS.push(Array.from({ length: 9 }, (_, i) => (r0 + Math.floor(i / 3)) * 9 + c0 + (i % 3)));
}

export const ROWS = UNITS.slice(0, 9);
export const COLS = UNITS.slice(9, 18);
export const BOXES = UNITS.slice(18, 27);

/** The three units each cell belongs to: [row, col, box] unit indices. */
export const UNITS_OF: number[][] = Array.from({ length: 81 }, (_, c) => [rowOf(c), 9 + colOf(c), 18 + boxOf(c)]);

export const PEERS: number[][] = Array.from({ length: 81 }, (_, c) => {
  const s = new Set<number>();
  for (const u of UNITS_OF[c]) for (const p of UNITS[u]) if (p !== c) s.add(p);
  return [...s];
});

const PEER_SET: boolean[][] = Array.from({ length: 81 }, (_, c) => {
  const a = new Array<boolean>(81).fill(false);
  for (const p of PEERS[c]) a[p] = true;
  return a;
});

export const sees = (a: number, b: number) => PEER_SET[a][b];

export function unitName(u: number): string {
  if (u < 9) return `${u + 1}행`;
  if (u < 18) return `${u - 8}열`;
  return `${u - 17}번 박스`;
}

export function cellName(c: number): string {
  return `${rowOf(c) + 1}행${colOf(c) + 1}열`;
}

export function parseGrid(s: string): number[] {
  return [...s].map((ch) => (ch >= '1' && ch <= '9' ? Number(ch) : 0));
}

export function gridToString(g: number[]): string {
  return g.map((d) => (d ? String(d) : '.')).join('');
}

/** Candidates implied by the placed digits alone. */
export function computeCandidates(grid: number[]): number[] {
  const cand = new Array<number>(81).fill(0);
  for (let c = 0; c < 81; c++) {
    if (grid[c]) continue;
    let m = ALL;
    for (const p of PEERS[c]) if (grid[p]) m &= ~bit(grid[p]);
    cand[c] = m;
  }
  return cand;
}

export function combinations<T>(items: T[], k: number): T[][] {
  const out: T[][] = [];
  const pick: T[] = [];
  const rec = (start: number) => {
    if (pick.length === k) {
      out.push([...pick]);
      return;
    }
    for (let i = start; i <= items.length - (k - pick.length); i++) {
      pick.push(items[i]);
      rec(i + 1);
      pick.pop();
    }
  };
  rec(0);
  return out;
}
