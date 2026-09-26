// The 9×9 board as DOM: built once, then `render` only flips classes and
// text. Shared by play, hints and lessons.

import { UNITS, colOf, has, rowOf, sees } from './core.ts';
import type { Cand, Link } from './techniques.ts';

export interface BoardView {
  values: number[];
  givens: boolean[];
  /** Candidate marks to show in empty cells. */
  notes: number[];
  selected?: number | null;
  /** Digit to highlight everywhere (values and notes). */
  focusDigit?: number;
  wrong?: Set<number>;
  pattern?: number[];
  units?: number[];
  hl?: Cand[];
  hl2?: Cand[];
  elim?: Cand[];
  marked?: Cand[];
  links?: Link[];
  place?: Cand;
}

const key = (c: Cand) => c.cell * 10 + c.digit;

export class Board {
  readonly el: HTMLDivElement;
  private cells: HTMLDivElement[] = [];
  private vals: HTMLDivElement[] = [];
  private notes: HTMLSpanElement[][] = [];
  private svg: SVGSVGElement;

  constructor(onTap: (cell: number, digit: number | null) => void) {
    this.el = document.createElement('div');
    this.el.className = 'board';
    for (let c = 0; c < 81; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      if (colOf(c) === 2 || colOf(c) === 5) cell.classList.add('br');
      if (rowOf(c) === 2 || rowOf(c) === 5) cell.classList.add('bb');
      const val = document.createElement('div');
      val.className = 'val';
      const notes = document.createElement('div');
      notes.className = 'notes';
      const spans: HTMLSpanElement[] = [];
      for (let d = 1; d <= 9; d++) {
        const s = document.createElement('span');
        s.className = 'n';
        s.dataset.d = String(d);
        s.textContent = String(d);
        notes.appendChild(s);
        spans.push(s);
      }
      cell.append(val, notes);
      cell.addEventListener('click', (e) => {
        const n = (e.target as HTMLElement).closest('.n') as HTMLElement | null;
        onTap(c, n && n.classList.contains('on') ? Number(n.dataset.d) : null);
      });
      this.el.appendChild(cell);
      this.cells.push(cell);
      this.vals.push(val);
      this.notes.push(spans);
    }
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('viewBox', '0 0 900 900');
    this.svg.classList.add('links');
    this.el.appendChild(this.svg);
  }

  render(v: BoardView): void {
    const sel = v.selected ?? null;
    const selDigit = v.focusDigit ?? 0;
    const pattern = new Set(v.pattern ?? []);
    const unitCells = new Set((v.units ?? []).flatMap((u) => UNITS[u]));
    const hl = new Set((v.hl ?? []).map(key));
    const hl2 = new Set((v.hl2 ?? []).map(key));
    const elim = new Set((v.elim ?? []).map(key));
    const marked = new Set((v.marked ?? []).map(key));

    for (let c = 0; c < 81; c++) {
      const cell = this.cells[c];
      const value = v.values[c];
      const cls = cell.classList;
      cls.toggle('given', v.givens[c]);
      cls.toggle('user', !v.givens[c] && value > 0);
      cls.toggle('sel', sel === c);
      cls.toggle('peer', sel !== null && sees(sel, c));
      cls.toggle('same', selDigit > 0 && value === selDigit);
      cls.toggle('wrong', !!v.wrong?.has(c));
      cls.toggle('pat', pattern.has(c));
      cls.toggle('unit', unitCells.has(c));
      cls.toggle('placed', v.place?.cell === c);
      this.vals[c].textContent = value ? String(value) : v.place?.cell === c ? String(v.place.digit) : '';

      const showNotes = !value && !(v.place?.cell === c);
      for (let d = 1; d <= 9; d++) {
        const s = this.notes[c][d - 1];
        const k = c * 10 + d;
        const on = showNotes && (has(v.notes[c], d) || elim.has(k));
        const sc = s.classList;
        sc.toggle('on', on);
        sc.toggle('focus', on && d === selDigit);
        sc.toggle('hl', on && hl.has(k));
        sc.toggle('hl2', on && hl2.has(k) && !hl.has(k));
        sc.toggle('elim', on && elim.has(k));
        sc.toggle('mark', on && marked.has(k));
      }
    }
    this.drawLinks(v.links ?? []);
  }

  private drawLinks(links: Link[]): void {
    const pos = (c: Cand) => {
      const x = colOf(c.cell) * 100 + 50 + (((c.digit - 1) % 3) - 1) * 30;
      const y = rowOf(c.cell) * 100 + 50 + (Math.floor((c.digit - 1) / 3) - 1) * 30;
      return [x, y];
    };
    let html = '';
    for (const l of links) {
      if (l.from.cell === l.to.cell && l.from.digit === l.to.digit) continue;
      const [x1, y1] = pos(l.from);
      const [x2, y2] = pos(l.to);
      // Shorten a little so lines end at the candidate's edge, not its centre.
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const t = Math.min(12 / len, 0.3);
      html += `<line class="${l.strong ? 'strong' : 'weak'}" x1="${x1 + dx * t}" y1="${y1 + dy * t}" x2="${x2 - dx * t}" y2="${y2 - dy * t}" />`;
    }
    this.svg.innerHTML = html;
  }
}
