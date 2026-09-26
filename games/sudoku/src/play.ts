// The play screen: one stage puzzle with notes, undo, hints and a timer.

import { Board, type BoardView } from './board.ts';
import { PEERS, UNITS, UNITS_OF, bit, computeCandidates, has, parseGrid } from './core.ts';
import { solve } from './brute.ts';
import { applyStep, cloneState, nextStep } from './solver.ts';
import { TECH_BY_ID, type State, type Step } from './techniques.ts';
import { ICONS } from './icons.ts';
import { sealSvg } from './seal.ts';
import { sfxClear, sfxNote, sfxPlace, sfxStamp, sfxUnit, sfxWrong, unlockAudio } from './sfx.ts';
import { THEMES, getTheme, levelSub, rankName, setTheme, type ThemeId } from './theme.ts';
import {
  LEVEL_BY_ID,
  PUZZLES,
  dropGame,
  getSettings,
  loadGame,
  recordClear,
  saveGame,
  setSettings,
  type LevelId,
} from './store.ts';
import { esc, fmtTime, tierMark } from './ui.ts';

type Hint = { kind: 'wrong'; cells: number[] } | { kind: 'step'; step: Step; state: State };

export function mountPlay(root: HTMLElement, level: LevelId, idx: number): () => void {
  const entry = PUZZLES[level][idx];
  const puzzle = parseGrid(entry.p);
  const solution = solve(puzzle)!;
  const givens = puzzle.map((d) => d > 0);
  const saved = loadGame(level, idx);

  let values = saved?.values ?? puzzle.slice();
  let notes = saved?.notes ?? new Array<number>(81).fill(0);
  let elapsed = saved?.elapsed ?? 0;
  let mistakes = saved?.mistakes ?? 0;
  let hints = saved?.hints ?? 0;
  let selected: number | null = null;
  let noteMode = false;
  let done = false;
  let hint: Hint | null = null;
  let settings = getSettings();
  const history: { values: number[]; notes: number[] }[] = [];

  const lv = LEVEL_BY_ID[level];
  root.innerHTML = `
    <div class="screen play">
      <header class="topbar">
        <a class="back" href="#/stages/${level}" aria-label="목록으로">${ICONS.back}</a>
        <div class="title"><span class="rank">${rankName(lv.tier)}</span> <span class="no">${idx + 1}</span><small class="lv">${levelSub(lv.tier, lv.name)}</small></div>
        <div class="timer" id="timer">0:00</div>
        <button class="icon" id="menu" aria-label="메뉴">${ICONS.menu}</button>
      </header>
      <div class="menu hidden" id="menu-pop">
        <label class="toggle"><input type="checkbox" id="opt-mistakes" /><span>틀린 숫자 바로 표시</span></label>
        <label class="toggle"><input type="checkbox" id="opt-sound" /><span>소리와 진동</span></label>
        <div class="menu-themes">${(Object.keys(THEMES) as ThemeId[])
          .map((t) => `<button data-theme-pick="${t}" class="${t === getTheme() ? 'on' : ''}">${THEMES[t].name}</button>`)
          .join('')}</div>
        <button id="restart">처음부터 다시</button>
      </div>
      <div class="play-body">
        <div class="board-wrap" id="board-wrap"></div>
        <div class="side">
          <div class="stats" id="stats"></div>
          <div class="hint-panel hidden" id="hint"></div>
          <div class="tools">
            <button id="t-undo">${ICONS.undo}<span>되돌리기</span></button>
            <button id="t-erase">${ICONS.erase}<span>지우기</span></button>
            <button id="t-note">${ICONS.pencil}<span>메모 <b id="note-state">끔</b></span></button>
            <button id="t-auto">${ICONS.auto}<span>자동 메모</span></button>
            <button id="t-hint">${ICONS.hint}<span>힌트</span></button>
          </div>
          <div class="pad" id="pad"></div>
        </div>
      </div>
      <div class="overlay hidden" id="done"></div>
    </div>`;

  const $ = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
  const board = new Board((cell) => {
    if (done) return;
    selected = cell;
    render();
  });
  $('board-wrap').appendChild(board.el);

  const pad = $('pad');
  for (let d = 1; d <= 9; d++) {
    const b = document.createElement('button');
    b.dataset.d = String(d);
    b.innerHTML = `<span class="d">${d}</span><span class="left"></span>`;
    b.addEventListener('click', () => input(d));
    pad.appendChild(b);
  }

  // ---------------------------------------------------------------- actions

  const snapshot = () => {
    history.push({ values: values.slice(), notes: notes.slice() });
    if (history.length > 300) history.shift();
  };

  function input(d: number): void {
    if (done || selected === null || givens[selected]) return;
    closeHint();
    const c = selected;
    unlockAudio();
    if (noteMode) {
      if (values[c]) return;
      snapshot();
      notes[c] ^= bit(d);
      sfxNote();
    } else {
      snapshot();
      if (values[c] === d) {
        values[c] = 0;
      } else {
        values[c] = d;
        for (const p of PEERS[c]) notes[p] &= ~bit(d);
        if (d !== solution[c]) {
          mistakes++;
          if (settings.showMistakes) sfxWrong();
          else sfxPlace();
        } else {
          sfxPlace();
          celebrateUnits(c);
        }
      }
    }
    changed();
  }

  /** Ripple across any row, column or box this placement just finished. */
  function celebrateUnits(c: number): void {
    const full = UNITS_OF[c].filter((u) => UNITS[u].every((x) => values[x] === solution[x]));
    if (!full.length || values.every((v, i) => v === solution[i])) return;
    board.flash([...new Set(full.flatMap((u) => UNITS[u]))], c);
    sfxUnit(full.length);
  }

  function erase(): void {
    if (done || selected === null || givens[selected]) return;
    if (!values[selected] && !notes[selected]) return;
    snapshot();
    values[selected] = 0;
    notes[selected] = 0;
    closeHint();
    changed();
  }

  function undo(): void {
    const h = history.pop();
    if (!h || done) return;
    values = h.values;
    notes = h.notes;
    closeHint();
    changed();
  }

  function autoNotes(): void {
    if (done) return;
    snapshot();
    const cand = computeCandidates(values);
    for (let c = 0; c < 81; c++) if (!values[c]) notes[c] = cand[c];
    closeHint();
    changed();
  }

  function hintState(): State {
    const grid = values.slice();
    const cand = computeCandidates(grid);
    // Keep the player's own eliminations, as long as they didn't erase the answer.
    for (let c = 0; c < 81; c++) if (!grid[c] && notes[c] && has(notes[c], solution[c])) cand[c] &= notes[c];
    return { grid, cand };
  }

  function showHint(): void {
    if (done) return;
    if (hint) return closeHint();
    const wrong = wrongCells();
    if (wrong.length) {
      hint = { kind: 'wrong', cells: wrong };
    } else {
      const state = hintState();
      const step = nextStep(state);
      if (!step) {
        // Every stage is solvable with the taught techniques, so this is only
        // reachable if notes were edited into an odd state; reveal a cell.
        const c = selected !== null && !values[selected] ? selected : values.findIndex((v) => !v);
        const place = { cell: c, digit: solution[c] };
        hint = { kind: 'step', state, step: { tech: 'nakedSingle', place, elim: [], cells: [c], hl: [place], text: '정답을 하나 보여 드릴게요.' } };
      } else {
        hint = { kind: 'step', state, step };
      }
      hints++;
    }
    renderHint();
    render();
    persist();
  }

  function applyHint(): void {
    if (!hint) return;
    snapshot();
    if (hint.kind === 'wrong') {
      for (const c of hint.cells) values[c] = 0;
    } else {
      const after = cloneState(hint.state);
      applyStep(after, hint.step);
      if (hint.step.place) {
        const { cell, digit } = hint.step.place;
        values[cell] = digit;
        for (const p of PEERS[cell]) notes[p] &= ~bit(digit);
        selected = cell;
      } else {
        for (let c = 0; c < 81; c++) if (!values[c]) notes[c] = after.cand[c];
      }
    }
    closeHint();
    changed();
  }

  function closeHint(): void {
    if (!hint) return;
    hint = null;
    renderHint();
  }

  function wrongCells(): number[] {
    return values.map((v, c) => (v && !givens[c] && v !== solution[c] ? c : -1)).filter((c) => c >= 0);
  }

  function changed(): void {
    if (values.every((v, c) => v === solution[c])) finish();
    render();
    persist();
  }

  function persist(): void {
    if (done) return;
    saveGame({ level, idx, values, notes, elapsed, mistakes, hints });
  }

  function finish(): void {
    done = true;
    const last = selected ?? 40;
    selected = null;
    dropGame(level, idx);
    const best = recordClear(level, idx, { time: elapsed, mistakes, hints });
    const hasNext = idx + 1 < PUZZLES[level].length;
    const techs = entry.used.filter((t) => TECH_BY_ID[t].tier > 0);
    board.flash([...Array(81).keys()], last);
    $('done').innerHTML = `
      <div class="clear-seal">${sealSvg(getTheme(), { rotate: -9 })}</div>
      <div class="card clear-card">
        <div class="clear-title"><span>${rankName(lv.tier)} ${idx + 1}</span> 완료</div>
        <div class="result">
          <div><span>시간</span><b>${fmtTime(elapsed)}</b>${best ? '<em>최고 기록</em>' : ''}</div>
          <div><span>실수</span><b>${mistakes}</b></div>
          <div><span>힌트</span><b>${hints}</b></div>
        </div>
        ${
          techs.length
            ? `<p class="used">이 판에 쓰인 기법 — ${techs
                .map((t) => `<a href="#/lesson/${t}">${esc(TECH_BY_ID[t].name)}</a>`)
                .join(' · ')}</p>`
            : ''
        }
        ${hasNext ? `<a class="btn primary" href="#/play/${level}/${idx + 1}">다음 스테이지</a>` : ''}
        <a class="btn ${hasNext ? '' : 'primary'}" href="#/stages/${level}">스테이지 목록</a>
      </div>`;
    // Let the board wave finish, then bring the seal down.
    window.setTimeout(() => {
      $('done').classList.remove('hidden');
      window.setTimeout(sfxStamp, 330);
      sfxClear();
    }, 650);
  }

  // --------------------------------------------------------------- render

  function renderHint(): void {
    const el = $('hint');
    if (!hint) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    if (hint.kind === 'wrong') {
      el.innerHTML = `
        <div class="hint-head"><b>틀린 숫자가 ${hint.cells.length}개 있어요</b></div>
        <p>빨간 칸의 숫자가 정답과 다릅니다. 먼저 지우고 다시 힌트를 받아 보세요.</p>
        <div class="hint-actions"><button class="btn primary" data-a="apply">틀린 숫자 지우기</button><button class="btn" data-a="close">닫기</button></div>`;
    } else {
      const t = TECH_BY_ID[hint.step.tech];
      el.innerHTML = `
        <div class="hint-head">${tierMark(t.tier)}<b>${esc(t.name)}</b><span class="en">${t.en}</span></div>
        <p>${esc(hint.step.text)}</p>
        <div class="hint-actions">
          <button class="btn primary" data-a="apply">${hint.step.place ? '숫자 넣기' : '후보 지우기'}</button>
          <a class="btn" href="#/lesson/${t.id}">배우기</a>
          <button class="btn" data-a="close">닫기</button>
        </div>`;
    }
    el.querySelector('[data-a=apply]')!.addEventListener('click', applyHint);
    el.querySelector('[data-a=close]')!.addEventListener('click', () => {
      closeHint();
      render();
    });
  }

  function render(): void {
    const sv = selected !== null ? values[selected] : 0;
    let view: BoardView = {
      values,
      givens,
      notes,
      selected,
      focusDigit: sv || undefined,
      wrong: settings.showMistakes ? new Set(wrongCells()) : undefined,
    };
    if (hint?.kind === 'wrong') {
      view = { ...view, wrong: new Set(hint.cells), selected: null, focusDigit: undefined };
    } else if (hint?.kind === 'step') {
      const s = hint.step;
      view = {
        ...view,
        notes: hint.state.cand,
        selected: null,
        focusDigit: undefined,
        pattern: s.cells,
        units: s.units,
        hl: s.hl,
        hl2: s.hl2,
        elim: s.elim,
        links: s.links,
        place: s.place,
      };
    }
    board.render(view);

    const counts = new Array<number>(10).fill(0);
    for (const v of values) counts[v]++;
    for (const b of pad.querySelectorAll<HTMLButtonElement>('button')) {
      const d = Number(b.dataset.d);
      const left = 9 - counts[d];
      b.querySelector('.left')!.textContent = left > 0 ? String(left) : '';
      b.classList.toggle('complete', left <= 0);
      b.classList.toggle('focus', d === sv);
    }
    $('note-state').textContent = noteMode ? '켬' : '끔';
    $('t-note').classList.toggle('on', noteMode);
    $('stats').innerHTML = `<span>실수 <b>${mistakes}</b></span><span>힌트 <b>${hints}</b></span><span class="desc">${lv.desc}</span>`;
  }

  // ---------------------------------------------------------------- wiring

  $('t-undo').addEventListener('click', undo);
  $('t-erase').addEventListener('click', erase);
  $('t-note').addEventListener('click', () => {
    noteMode = !noteMode;
    render();
  });
  $('t-auto').addEventListener('click', autoNotes);
  $('t-hint').addEventListener('click', showHint);

  const menuPop = $('menu-pop');
  $('menu').addEventListener('click', () => menuPop.classList.toggle('hidden'));
  const optMistakes = $('opt-mistakes') as HTMLInputElement;
  optMistakes.checked = settings.showMistakes;
  optMistakes.addEventListener('change', () => {
    settings = { ...settings, showMistakes: optMistakes.checked };
    setSettings(settings);
    render();
  });
  const optSound = $('opt-sound') as HTMLInputElement;
  optSound.checked = settings.sound;
  optSound.addEventListener('change', () => {
    settings = { ...settings, sound: optSound.checked };
    setSettings(settings);
  });
  for (const b of root.querySelectorAll<HTMLButtonElement>('[data-theme-pick]')) {
    b.addEventListener('click', () => {
      setTheme(b.dataset.themePick as ThemeId);
      // Rank names and the seal change with the theme; re-render the title.
      root.querySelector('.topbar .rank')!.textContent = rankName(lv.tier);
      root.querySelector('.topbar .lv')!.textContent = levelSub(lv.tier, lv.name);
      for (const x of root.querySelectorAll('[data-theme-pick]')) x.classList.toggle('on', x === b);
    });
  }
  $('restart').addEventListener('click', () => {
    if (!confirm('처음부터 다시 풀까요? 입력한 내용이 모두 지워집니다.')) return;
    snapshot();
    values = puzzle.slice();
    notes = new Array<number>(81).fill(0);
    menuPop.classList.add('hidden');
    closeHint();
    changed();
  });

  const onKey = (e: KeyboardEvent) => {
    if (done) return;
    if (e.key >= '1' && e.key <= '9') input(Number(e.key));
    else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') erase();
    else if (e.key === 'n' || e.key === 'N') {
      noteMode = !noteMode;
      render();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') undo();
    else if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const c = selected ?? 40;
      let r = Math.floor(c / 9);
      let k = c % 9;
      if (e.key === 'ArrowUp') r = (r + 8) % 9;
      if (e.key === 'ArrowDown') r = (r + 1) % 9;
      if (e.key === 'ArrowLeft') k = (k + 8) % 9;
      if (e.key === 'ArrowRight') k = (k + 1) % 9;
      selected = r * 9 + k;
      render();
    } else if (e.key === 'Escape') {
      closeHint();
      render();
    }
  };
  window.addEventListener('keydown', onKey);

  const timerEl = $('timer');
  timerEl.textContent = fmtTime(elapsed);
  const tick = window.setInterval(() => {
    if (done || document.hidden) return;
    elapsed++;
    timerEl.textContent = fmtTime(elapsed);
    if (elapsed % 5 === 0) persist();
  }, 1000);

  render();

  return () => {
    window.clearInterval(tick);
    window.removeEventListener('keydown', onKey);
    persist();
  };
}
