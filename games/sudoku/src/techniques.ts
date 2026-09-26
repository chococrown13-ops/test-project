// Human solving techniques. Each finder looks at the current placements and
// candidates and returns every instance of its pattern it can see (up to
// `limit`), with enough detail for the UI to highlight it and explain it.
// The logical solver (solver.ts) tries them easiest-first, which is also how
// puzzles are graded.

import {
  BOXES,
  COLS,
  PEERS,
  ROWS,
  UNITS,
  bit,
  boxOf,
  cellName,
  colOf,
  combinations,
  digitsOf,
  has,
  popcount,
  rowOf,
  sees,
  unitName,
} from './core.ts';

export type TechId =
  | 'fullHouse'
  | 'hiddenSingle'
  | 'nakedSingle'
  | 'pointing'
  | 'claiming'
  | 'nakedPair'
  | 'hiddenPair'
  | 'nakedTriple'
  | 'hiddenTriple'
  | 'xWing'
  | 'xyWing'
  | 'nakedQuad'
  | 'hiddenQuad'
  | 'swordfish'
  | 'xyzWing'
  | 'skyscraper'
  | 'twoStringKite'
  | 'turbotFish'
  | 'wWing'
  | 'uniqueRect'
  | 'jellyfish'
  | 'xChain'
  | 'xyChain';

export interface Cand {
  cell: number;
  digit: number;
}

export interface Link {
  from: Cand;
  to: Cand;
  strong: boolean;
}

export interface Step {
  tech: TechId;
  place?: Cand;
  elim: Cand[];
  /** Cells that make up the pattern. */
  cells: number[];
  /** Candidates the pattern is built from (primary highlight). */
  hl: Cand[];
  /** Second colour, e.g. the other end of a chain or a fish's cover set. */
  hl2?: Cand[];
  units?: number[];
  links?: Link[];
  text: string;
}

export interface State {
  grid: number[];
  cand: number[];
}

export interface TechInfo {
  id: TechId;
  name: string;
  en: string;
  tier: number;
  find: (s: State, limit: number) => Step[];
}

export const TIER_NAMES = ['기초', '중', '상', '최상', '극상'];

// ------------------------------------------------------------------ helpers

const cellsWith = (s: State, unit: number[], d: number) => unit.filter((c) => !s.grid[c] && has(s.cand[c], d));

const placedIn = (s: State, unit: number[], d: number) => unit.some((c) => s.grid[c] === d);

const candsOf = (cells: number[], digits: number[], s: State): Cand[] => {
  const out: Cand[] = [];
  for (const c of cells) for (const d of digits) if (!s.grid[c] && has(s.cand[c], d)) out.push({ cell: c, digit: d });
  return out;
};

const listCells = (cells: number[]) => cells.map(cellName).join(', ');
const listDigits = (ds: number[]) => ds.join(', ');

function elimText(elim: Cand[]): string {
  const byDigit = new Map<number, number[]>();
  for (const e of elim) byDigit.set(e.digit, [...(byDigit.get(e.digit) ?? []), e.cell]);
  return [...byDigit].map(([d, cs]) => `${listCells(cs)}의 ${d}`).join(', ');
}

// ------------------------------------------------------------------ singles

function fullHouse(s: State, limit: number): Step[] {
  const out: Step[] = [];
  for (let u = 0; u < 27 && out.length < limit; u++) {
    const empty = UNITS[u].filter((c) => !s.grid[c]);
    if (empty.length !== 1) continue;
    const c = empty[0];
    const d = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((x) => !placedIn(s, UNITS[u], x))!;
    if (!has(s.cand[c], d)) continue;
    out.push({
      tech: 'fullHouse',
      place: { cell: c, digit: d },
      elim: [],
      cells: [c],
      hl: [{ cell: c, digit: d }],
      units: [u],
      text: `${unitName(u)}에 빈칸이 ${cellName(c)} 하나뿐이고, 빠진 숫자는 ${d}입니다.`,
    });
  }
  return out;
}

function hiddenSingle(s: State, limit: number): Step[] {
  const out: Step[] = [];
  // Boxes first: that's where people usually spot them.
  const order = [...BOXES.keys()].map((i) => i + 18).concat([...ROWS.keys()], [...COLS.keys()].map((i) => i + 9));
  for (const u of order) {
    for (let d = 1; d <= 9 && out.length < limit; d++) {
      if (placedIn(s, UNITS[u], d)) continue;
      const cs = cellsWith(s, UNITS[u], d);
      if (cs.length !== 1) continue;
      const c = cs[0];
      if (out.some((o) => o.place!.cell === c)) continue;
      out.push({
        tech: 'hiddenSingle',
        place: { cell: c, digit: d },
        elim: [],
        cells: [c],
        hl: [{ cell: c, digit: d }],
        units: [u],
        text: `${unitName(u)}에서 ${d}이(가) 들어갈 수 있는 칸은 ${cellName(c)}뿐입니다.`,
      });
    }
  }
  return out;
}

function nakedSingle(s: State, limit: number): Step[] {
  const out: Step[] = [];
  for (let c = 0; c < 81 && out.length < limit; c++) {
    if (s.grid[c] || popcount(s.cand[c]) !== 1) continue;
    const d = digitsOf(s.cand[c])[0];
    out.push({
      tech: 'nakedSingle',
      place: { cell: c, digit: d },
      elim: [],
      cells: [c],
      hl: [{ cell: c, digit: d }],
      text: `${cellName(c)}에는 행·열·박스에 이미 나온 숫자를 빼면 ${d}만 남습니다.`,
    });
  }
  return out;
}

// --------------------------------------------------------- locked candidates

function pointing(s: State, limit: number): Step[] {
  const out: Step[] = [];
  for (let b = 0; b < 9; b++) {
    for (let d = 1; d <= 9 && out.length < limit; d++) {
      const cs = cellsWith(s, BOXES[b], d);
      if (cs.length < 2) continue;
      for (const line of [rowOf, colOf]) {
        const l = line(cs[0]);
        if (!cs.every((c) => line(c) === l)) continue;
        const lu = line === rowOf ? l : 9 + l;
        const elim = cellsWith(s, UNITS[lu], d)
          .filter((c) => boxOf(c) !== b)
          .map((cell) => ({ cell, digit: d }));
        if (!elim.length) continue;
        out.push({
          tech: 'pointing',
          elim,
          cells: cs,
          hl: cs.map((cell) => ({ cell, digit: d })),
          units: [18 + b, lu],
          text: `${b + 1}번 박스의 ${d}은(는) 모두 ${unitName(lu)}에 있습니다. 그러니 ${unitName(lu)}의 나머지 칸에는 ${d}이(가) 올 수 없어요. → ${elimText(elim)} 제거`,
        });
      }
    }
  }
  return out;
}

function claiming(s: State, limit: number): Step[] {
  const out: Step[] = [];
  for (let u = 0; u < 18; u++) {
    for (let d = 1; d <= 9 && out.length < limit; d++) {
      const cs = cellsWith(s, UNITS[u], d);
      if (cs.length < 2) continue;
      const b = boxOf(cs[0]);
      if (!cs.every((c) => boxOf(c) === b)) continue;
      const elim = cellsWith(s, BOXES[b], d)
        .filter((c) => !cs.includes(c))
        .map((cell) => ({ cell, digit: d }));
      if (!elim.length) continue;
      out.push({
        tech: 'claiming',
        elim,
        cells: cs,
        hl: cs.map((cell) => ({ cell, digit: d })),
        units: [u, 18 + b],
        text: `${unitName(u)}의 ${d}은(는) 모두 ${b + 1}번 박스 안에 있습니다. 그러니 그 박스의 다른 칸에는 ${d}이(가) 올 수 없어요. → ${elimText(elim)} 제거`,
      });
    }
  }
  return out;
}

// ------------------------------------------------------------------ subsets

function nakedSubset(n: number, tech: TechId) {
  return (s: State, limit: number): Step[] => {
    const out: Step[] = [];
    for (let u = 0; u < 27 && out.length < limit; u++) {
      const empties = UNITS[u].filter((c) => !s.grid[c]);
      if (empties.length <= n) continue;
      const pool = empties.filter((c) => popcount(s.cand[c]) <= n);
      for (const combo of combinations(pool, n)) {
        const mask = combo.reduce((m, c) => m | s.cand[c], 0);
        if (popcount(mask) !== n) continue;
        const ds = digitsOf(mask);
        const elim = candsOf(
          empties.filter((c) => !combo.includes(c)),
          ds,
          s,
        );
        if (!elim.length) continue;
        out.push({
          tech,
          elim,
          cells: combo,
          hl: candsOf(combo, ds, s),
          units: [u],
          text: `${unitName(u)}의 ${listCells(combo)} ${n}칸에는 후보가 {${listDigits(ds)}} ${n}개뿐입니다. 이 숫자들은 반드시 이 칸들을 차지하므로 ${unitName(u)}의 다른 칸에서 지울 수 있어요. → ${elimText(elim)} 제거`,
        });
        if (out.length >= limit) break;
      }
    }
    return out;
  };
}

function hiddenSubset(n: number, tech: TechId) {
  return (s: State, limit: number): Step[] => {
    const out: Step[] = [];
    for (let u = 0; u < 27 && out.length < limit; u++) {
      const empties = UNITS[u].filter((c) => !s.grid[c]);
      if (empties.length <= n) continue;
      const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => {
        if (placedIn(s, UNITS[u], d)) return false;
        const k = cellsWith(s, UNITS[u], d).length;
        return k >= 2 && k <= n;
      });
      for (const ds of combinations(digits, n)) {
        const cells = [...new Set(ds.flatMap((d) => cellsWith(s, UNITS[u], d)))];
        if (cells.length !== n) continue;
        const others = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => !ds.includes(d));
        const elim = candsOf(cells, others, s);
        if (!elim.length) continue;
        out.push({
          tech,
          elim,
          cells,
          hl: candsOf(cells, ds, s),
          units: [u],
          text: `${unitName(u)}에서 숫자 {${listDigits(ds)}}이(가) 들어갈 수 있는 칸은 ${listCells(cells)} ${n}칸뿐입니다. 이 칸들은 이 숫자들로 채워져야 하므로 다른 후보는 지울 수 있어요. → ${elimText(elim)} 제거`,
        });
        if (out.length >= limit) break;
      }
    }
    return out;
  };
}

// --------------------------------------------------------------------- fish

const FISH_NAME: Record<number, string> = { 2: 'X-Wing', 3: '소드피시', 4: '젤리피시' };

function fish(n: number, tech: TechId) {
  return (s: State, limit: number): Step[] => {
    const out: Step[] = [];
    for (let d = 1; d <= 9; d++) {
      for (const rowsBase of [true, false]) {
        const base = rowsBase ? ROWS : COLS;
        const coverOf = rowsBase ? colOf : rowOf;
        const lines = [...base.keys()].filter((i) => {
          const k = cellsWith(s, base[i], d).length;
          return k >= 2 && k <= n;
        });
        for (const combo of combinations(lines, n)) {
          const cells = combo.flatMap((i) => cellsWith(s, base[i], d));
          const covers = [...new Set(cells.map(coverOf))];
          if (covers.length !== n) continue;
          const coverUnits = covers.map((c) => (rowsBase ? 9 + c : c));
          const elim = coverUnits
            .flatMap((cu) => cellsWith(s, UNITS[cu], d))
            .filter((c) => !cells.includes(c))
            .map((cell) => ({ cell, digit: d }));
          if (!elim.length) continue;
          const baseUnits = combo.map((i) => (rowsBase ? i : 9 + i));
          const bn = baseUnits.map(unitName).join(', ');
          const cn = coverUnits.map(unitName).join(', ');
          out.push({
            tech,
            elim,
            cells,
            hl: cells.map((cell) => ({ cell, digit: d })),
            units: [...baseUnits, ...coverUnits],
            text: `${bn}에서 ${d}이(가) 들어갈 자리는 모두 ${cn} 위에만 있습니다(${FISH_NAME[n]}). ${n}개 ${rowsBase ? '행' : '열'}의 ${d}이(가) 이 ${n}개 ${rowsBase ? '열' : '행'}을 하나씩 차지하므로, 그 ${rowsBase ? '열' : '행'}들의 다른 칸에는 ${d}이(가) 올 수 없어요. → ${elimText(elim)} 제거`,
          });
          if (out.length >= limit) return out;
        }
      }
    }
    return out;
  };
}

// -------------------------------------------------------------------- wings

const bivalues = (s: State) => [...Array(81).keys()].filter((c) => !s.grid[c] && popcount(s.cand[c]) === 2);

function xyWing(s: State, limit: number): Step[] {
  const out: Step[] = [];
  const bv = bivalues(s);
  for (const p of bv) {
    const [x, y] = digitsOf(s.cand[p]);
    const wings = bv.filter((c) => c !== p && sees(c, p));
    for (const a of wings) {
      if (!has(s.cand[a], x) || has(s.cand[a], y)) continue;
      const z = digitsOf(s.cand[a] & ~bit(x))[0];
      for (const b of wings) {
        if (b === a || s.cand[b] !== (bit(y) | bit(z))) continue;
        const elim = PEERS[a]
          .filter((c) => c !== p && c !== b && sees(c, b) && !s.grid[c] && has(s.cand[c], z))
          .map((cell) => ({ cell, digit: z }));
        if (!elim.length) continue;
        out.push({
          tech: 'xyWing',
          elim,
          cells: [p, a, b],
          hl: [
            { cell: p, digit: x },
            { cell: p, digit: y },
            { cell: a, digit: x },
            { cell: b, digit: y },
          ],
          hl2: [
            { cell: a, digit: z },
            { cell: b, digit: z },
          ],
          text: `중심 ${cellName(p)}{${x},${y}}이(가) ${cellName(a)}{${x},${z}}와 ${cellName(b)}{${y},${z}}를 봅니다. 중심이 ${x}이면 ${cellName(a)}가 ${z}, 중심이 ${y}이면 ${cellName(b)}가 ${z} — 어느 쪽이든 두 날개 중 하나는 ${z}입니다. 두 날개를 모두 보는 칸에서 ${z}를 지울 수 있어요. → ${elimText(elim)} 제거`,
        });
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

function xyzWing(s: State, limit: number): Step[] {
  const out: Step[] = [];
  const bv = bivalues(s);
  for (let p = 0; p < 81; p++) {
    if (s.grid[p] || popcount(s.cand[p]) !== 3) continue;
    const wings = bv.filter((c) => sees(c, p) && (s.cand[c] & ~s.cand[p]) === 0);
    for (const [a, b] of combinations(wings, 2)) {
      if ((s.cand[a] | s.cand[b]) !== s.cand[p]) continue;
      const common = s.cand[a] & s.cand[b];
      if (popcount(common) !== 1) continue;
      const z = digitsOf(common)[0];
      const elim = PEERS[p]
        .filter((c) => c !== a && c !== b && sees(c, a) && sees(c, b) && !s.grid[c] && has(s.cand[c], z))
        .map((cell) => ({ cell, digit: z }));
      if (!elim.length) continue;
      const [x, y] = digitsOf(s.cand[p] & ~bit(z));
      out.push({
        tech: 'xyzWing',
        elim,
        cells: [p, a, b],
        hl: candsOf([p, a, b], [x, y], s),
        hl2: candsOf([p, a, b], [z], s),
        text: `중심 ${cellName(p)}{${digitsOf(s.cand[p]).join(',')}}와 날개 ${cellName(a)}, ${cellName(b)} — 세 칸 중 적어도 하나는 반드시 ${z}입니다. 세 칸을 모두 보는 칸에서 ${z}를 지울 수 있어요. → ${elimText(elim)} 제거`,
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** Units where digit d has exactly two places. */
function strongLinks(s: State, d: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let u = 0; u < 27; u++) {
    const cs = cellsWith(s, UNITS[u], d);
    if (cs.length === 2) out.push([cs[0], cs[1], u]);
  }
  return out;
}

function wWing(s: State, limit: number): Step[] {
  const out: Step[] = [];
  const bv = bivalues(s);
  for (const [c1, c2] of combinations(bv, 2)) {
    if (s.cand[c1] !== s.cand[c2] || sees(c1, c2)) continue;
    const pair = digitsOf(s.cand[c1]);
    for (const x of pair) {
      const y = pair[0] === x ? pair[1] : pair[0];
      for (const [a, b, u] of strongLinks(s, x)) {
        for (const [e1, e2] of [
          [a, b],
          [b, a],
        ]) {
          if (e1 === c1 || e1 === c2 || e2 === c1 || e2 === c2) continue;
          if (!sees(e1, c1) || !sees(e2, c2)) continue;
          const elim = PEERS[c1]
            .filter((c) => c !== c2 && sees(c, c2) && !s.grid[c] && has(s.cand[c], y))
            .map((cell) => ({ cell, digit: y }));
          if (!elim.length) continue;
          out.push({
            tech: 'wWing',
            elim,
            cells: [c1, c2, e1, e2],
            hl: [
              { cell: c1, digit: x },
              { cell: c2, digit: x },
              { cell: e1, digit: x },
              { cell: e2, digit: x },
            ],
            hl2: [
              { cell: c1, digit: y },
              { cell: c2, digit: y },
            ],
            units: [u],
            links: [
              { from: { cell: c1, digit: x }, to: { cell: e1, digit: x }, strong: false },
              { from: { cell: e1, digit: x }, to: { cell: e2, digit: x }, strong: true },
              { from: { cell: e2, digit: x }, to: { cell: c2, digit: x }, strong: false },
            ],
            text: `${cellName(c1)}와 ${cellName(c2)}는 둘 다 {${x},${y}}입니다. ${unitName(u)}에서 ${x}는 ${cellName(e1)}, ${cellName(e2)} 두 곳뿐이라 둘 중 하나는 ${x} — 그러면 두 {${x},${y}} 칸이 동시에 ${x}일 수 없으니 적어도 하나는 ${y}입니다. 두 칸을 모두 보는 칸에서 ${y}를 지울 수 있어요. → ${elimText(elim)} 제거`,
          });
          if (out.length >= limit) return out;
        }
      }
    }
  }
  return out;
}

// ------------------------------------------------------- single-digit chains

interface XChain {
  d: number;
  nodes: number[]; // strong, weak, strong, ... alternating starting with strong
  units: number[]; // unit of each strong link
}

/** Alternating strong/weak chains on one digit with exactly `k` strong links (or 3..k when range). */
function xChains(s: State, d: number, minK: number, maxK: number, cap: number): XChain[] {
  const strong = strongLinks(s, d);
  const adj = new Map<number, [number, number][]>();
  for (const [a, b, u] of strong) {
    adj.set(a, [...(adj.get(a) ?? []), [b, u]]);
    adj.set(b, [...(adj.get(b) ?? []), [a, u]]);
  }
  const nodes = [...Array(81).keys()].filter((c) => !s.grid[c] && has(s.cand[c], d));
  const out: XChain[] = [];
  const path: number[] = [];
  const units: number[] = [];
  const seen = new Set<number>();

  const rec = (cur: number, k: number) => {
    if (out.length >= cap) return;
    // `cur` was just reached by a strong link.
    if (k >= minK) out.push({ d, nodes: [...path], units: [...units] });
    if (k >= maxK) return;
    for (const w of nodes) {
      if (seen.has(w) || !sees(cur, w)) continue;
      for (const [nx, u] of adj.get(w) ?? []) {
        if (seen.has(nx)) continue;
        seen.add(w);
        seen.add(nx);
        path.push(w, nx);
        units.push(u);
        rec(nx, k + 1);
        path.length -= 2;
        units.pop();
        seen.delete(w);
        seen.delete(nx);
      }
    }
  };

  for (const [a, b, u] of strong) {
    for (const [s0, s1] of [
      [a, b],
      [b, a],
    ]) {
      seen.clear();
      seen.add(s0);
      seen.add(s1);
      path.length = 0;
      path.push(s0, s1);
      units.length = 0;
      units.push(u);
      rec(s1, 1);
    }
  }
  return out;
}

function chainStep(s: State, ch: XChain, tech: TechId, text: (elim: Cand[]) => string): Step | null {
  const { d, nodes } = ch;
  const a = nodes[0];
  const e = nodes[nodes.length - 1];
  const elim = [...Array(81).keys()]
    .filter((c) => !nodes.includes(c) && !s.grid[c] && has(s.cand[c], d) && sees(c, a) && sees(c, e))
    .map((cell) => ({ cell, digit: d }));
  if (!elim.length) return null;
  const links: Link[] = [];
  for (let i = 0; i + 1 < nodes.length; i++) {
    links.push({ from: { cell: nodes[i], digit: d }, to: { cell: nodes[i + 1], digit: d }, strong: i % 2 === 0 });
  }
  return {
    tech,
    elim,
    cells: nodes,
    hl: nodes.filter((_, i) => i % 2 === 0).map((cell) => ({ cell, digit: d })),
    hl2: nodes.filter((_, i) => i % 2 === 1).map((cell) => ({ cell, digit: d })),
    units: ch.units,
    links,
    text: text(elim),
  };
}

const isLine = (u: number) => u < 18;
const isRow = (u: number) => u < 9;

function classifyTwoLink(ch: XChain): TechId {
  const [u1, u2] = ch.units;
  const [, m1, m2] = ch.nodes;
  if (isLine(u1) && isLine(u2) && isRow(u1) === isRow(u2)) return 'skyscraper';
  if (isLine(u1) && isLine(u2) && boxOf(m1) === boxOf(m2)) return 'twoStringKite';
  return 'turbotFish';
}

function twoLinkFinder(tech: TechId) {
  return (s: State, limit: number): Step[] => {
    const out: Step[] = [];
    for (let d = 1; d <= 9 && out.length < limit; d++) {
      for (const ch of xChains(s, d, 2, 2, 400)) {
        if (classifyTwoLink(ch) !== tech) continue;
        const [a, m1, m2, e] = ch.nodes;
        const st = chainStep(
          s,
          ch,
          tech,
          (elim) =>
            `${d}의 강한 연결 두 개: ${unitName(ch.units[0])}의 ${cellName(a)}–${cellName(m1)}, ${unitName(ch.units[1])}의 ${cellName(m2)}–${cellName(e)}. ${cellName(m1)}와 ${cellName(m2)}는 서로 보므로 둘 다 ${d}일 수 없고, 따라서 양 끝 ${cellName(a)}, ${cellName(e)} 중 하나는 반드시 ${d}입니다. 두 끝을 모두 보는 칸에서 ${d}를 지울 수 있어요. → ${elimText(elim)} 제거`,
        );
        if (st && !out.some((o) => sameElim(o.elim, st.elim))) out.push(st);
        if (out.length >= limit) break;
      }
    }
    return out;
  };
}

function xChain(s: State, limit: number): Step[] {
  const out: Step[] = [];
  for (let k = 3; k <= 5 && out.length < limit; k++) {
    for (let d = 1; d <= 9 && out.length < limit; d++) {
      for (const ch of xChains(s, d, k, k, 3000)) {
        const st = chainStep(
          s,
          ch,
          'xChain',
          (elim) =>
            `숫자 ${d}로 강한 연결(한쪽이 아니면 다른 쪽이 반드시 ${d})과 약한 연결(둘 다 ${d}일 수는 없음)을 번갈아 이은 체인입니다. 체인이 강한 연결로 시작하고 끝나므로 양 끝 ${cellName(ch.nodes[0])}, ${cellName(ch.nodes[ch.nodes.length - 1])} 중 하나는 반드시 ${d}입니다. 두 끝을 모두 보는 칸에서 ${d}를 지울 수 있어요. → ${elimText(elim)} 제거`,
        );
        if (st && !out.some((o) => sameElim(o.elim, st.elim))) out.push(st);
        if (out.length >= limit) break;
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ XY-chain

function xyChain(s: State, limit: number): Step[] {
  const out: Step[] = [];
  const bv = bivalues(s);
  const MAX = 7;
  const path: number[] = [];

  const rec = (z: number, out_d: number): void => {
    if (out.length >= limit) return;
    const cur = path[path.length - 1];
    if (path.length >= 4 && out_d === z) {
      const a = path[0];
      const elim = [...Array(81).keys()]
        .filter((c) => !path.includes(c) && !s.grid[c] && has(s.cand[c], z) && sees(c, a) && sees(c, cur))
        .map((cell) => ({ cell, digit: z }));
      if (elim.length && !out.some((o) => sameElim(o.elim, elim))) {
        const links: Link[] = [];
        const hl: Cand[] = [];
        const hl2: Cand[] = [];
        let d = z;
        for (let i = 0; i < path.length; i++) {
          const c = path[i];
          const other = digitsOf(s.cand[c] & ~bit(d))[0];
          hl2.push({ cell: c, digit: d }); // "off" candidate if the chain starts with z false
          hl.push({ cell: c, digit: other });
          links.push({ from: { cell: c, digit: d }, to: { cell: c, digit: other }, strong: true });
          if (i + 1 < path.length) links.push({ from: { cell: c, digit: other }, to: { cell: path[i + 1], digit: other }, strong: false });
          d = other;
        }
        out.push({
          tech: 'xyChain',
          elim,
          cells: [...path],
          hl,
          hl2,
          links,
          text: `후보가 두 개인 칸들을 이은 체인입니다: ${path.map((c) => `${cellName(c)}{${digitsOf(s.cand[c]).join(',')}}`).join(' → ')}. 첫 칸이 ${z}가 아니면 연쇄적으로 마지막 칸이 ${z}가 되므로, 양 끝 중 하나는 반드시 ${z}입니다. 두 끝을 모두 보는 칸에서 ${z}를 지울 수 있어요. → ${elimText(elim)} 제거`,
        });
      }
    }
    if (path.length >= MAX) return;
    for (const n of bv) {
      if (path.includes(n) || !sees(cur, n) || !has(s.cand[n], out_d)) continue;
      path.push(n);
      rec(z, digitsOf(s.cand[n] & ~bit(out_d))[0]);
      path.pop();
    }
  };

  for (const a of bv) {
    for (const z of digitsOf(s.cand[a])) {
      path.length = 0;
      path.push(a);
      rec(z, digitsOf(s.cand[a] & ~bit(z))[0]);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

// --------------------------------------------------------- unique rectangle

function uniqueRect(s: State, limit: number): Step[] {
  const out: Step[] = [];
  for (const [r1, r2] of combinations([...Array(9).keys()], 2)) {
    for (const [c1, c2] of combinations([...Array(9).keys()], 2)) {
      const cells = [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c1, r2 * 9 + c2];
      if (new Set(cells.map(boxOf)).size !== 2) continue;
      if (cells.some((c) => s.grid[c])) continue;
      const bv = cells.filter((c) => popcount(s.cand[c]) === 2);
      if (bv.length !== 3) continue;
      const m = s.cand[bv[0]];
      if (!bv.every((c) => s.cand[c] === m)) continue;
      const roof = cells.find((c) => !bv.includes(c))!;
      if ((s.cand[roof] & m) !== m) continue;
      const [x, y] = digitsOf(m);
      const elim = [x, y].map((digit) => ({ cell: roof, digit }));
      out.push({
        tech: 'uniqueRect',
        elim,
        cells,
        hl: candsOf(bv, [x, y], s),
        hl2: candsOf([roof], [x, y], s),
        text: `${listCells(bv)} 세 칸이 모두 {${x},${y}}입니다. ${cellName(roof)}까지 ${x}나 ${y}가 되면 두 숫자를 서로 바꿔도 성립하는 "죽음의 사각형"이 생겨 답이 두 개가 됩니다. 스도쿠의 답은 하나뿐이므로 ${cellName(roof)}에서 ${x}, ${y}를 지울 수 있어요.`,
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

// -------------------------------------------------------------------- table

export function sameElim(a: Cand[], b: Cand[]): boolean {
  if (a.length !== b.length) return false;
  const k = (e: Cand) => e.cell * 10 + e.digit;
  const sa = new Set(a.map(k));
  return b.every((e) => sa.has(k(e)));
}

export const TECHS: TechInfo[] = [
  { id: 'fullHouse', name: '마지막 빈칸', en: 'Full House', tier: 0, find: fullHouse },
  { id: 'hiddenSingle', name: '히든 싱글', en: 'Hidden Single', tier: 0, find: hiddenSingle },
  { id: 'nakedSingle', name: '네이키드 싱글', en: 'Naked Single', tier: 0, find: nakedSingle },
  { id: 'pointing', name: '포인팅', en: 'Pointing', tier: 1, find: pointing },
  { id: 'claiming', name: '클레이밍', en: 'Claiming', tier: 1, find: claiming },
  { id: 'nakedPair', name: '네이키드 페어', en: 'Naked Pair', tier: 1, find: nakedSubset(2, 'nakedPair') },
  { id: 'hiddenPair', name: '히든 페어', en: 'Hidden Pair', tier: 1, find: hiddenSubset(2, 'hiddenPair') },
  { id: 'nakedTriple', name: '네이키드 트리플', en: 'Naked Triple', tier: 2, find: nakedSubset(3, 'nakedTriple') },
  { id: 'hiddenTriple', name: '히든 트리플', en: 'Hidden Triple', tier: 2, find: hiddenSubset(3, 'hiddenTriple') },
  { id: 'xWing', name: 'X-윙', en: 'X-Wing', tier: 2, find: fish(2, 'xWing') },
  { id: 'xyWing', name: 'XY-윙', en: 'XY-Wing', tier: 2, find: xyWing },
  { id: 'nakedQuad', name: '네이키드 쿼드', en: 'Naked Quad', tier: 3, find: nakedSubset(4, 'nakedQuad') },
  { id: 'hiddenQuad', name: '히든 쿼드', en: 'Hidden Quad', tier: 3, find: hiddenSubset(4, 'hiddenQuad') },
  { id: 'skyscraper', name: '스카이스크래퍼', en: 'Skyscraper', tier: 3, find: twoLinkFinder('skyscraper') },
  { id: 'twoStringKite', name: '투스트링 카이트', en: '2-String Kite', tier: 3, find: twoLinkFinder('twoStringKite') },
  { id: 'turbotFish', name: '터봇 피시', en: 'Turbot Fish', tier: 3, find: twoLinkFinder('turbotFish') },
  { id: 'swordfish', name: '소드피시', en: 'Swordfish', tier: 3, find: fish(3, 'swordfish') },
  { id: 'xyzWing', name: 'XYZ-윙', en: 'XYZ-Wing', tier: 3, find: xyzWing },
  { id: 'wWing', name: 'W-윙', en: 'W-Wing', tier: 3, find: wWing },
  { id: 'uniqueRect', name: '유니크 렉탱글', en: 'Unique Rectangle', tier: 3, find: uniqueRect },
  { id: 'jellyfish', name: '젤리피시', en: 'Jellyfish', tier: 4, find: fish(4, 'jellyfish') },
  { id: 'xChain', name: 'X-체인', en: 'X-Chain', tier: 4, find: xChain },
  { id: 'xyChain', name: 'XY-체인', en: 'XY-Chain', tier: 4, find: xyChain },
];

export const TECH_BY_ID = Object.fromEntries(TECHS.map((t) => [t.id, t])) as Record<TechId, TechInfo>;

