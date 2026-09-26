// Learning channel: the chapter list and one screen per technique with an
// explanation, a worked example and practice positions from real puzzles.

import { Board, type BoardView } from './board.ts';
import { cellName, parseGrid } from './core.ts';
import { CHAPTERS, LESSONS } from './lessons.ts';
import { TECH_BY_ID, sameElim, type Cand, type State, type Step, type TechId } from './techniques.ts';
import { PRACTICE, lessonSolved, markLessonSolved } from './store.ts';
import { esc, tierMark } from './ui.ts';
import { ICONS } from './icons.ts';

const decodeCand = (s: string) => Array.from({ length: 81 }, (_, i) => parseInt(s.slice(i * 2, i * 2 + 2), 36));

function position(tech: TechId, i: number): State {
  const p = PRACTICE[tech][i];
  return { grid: parseGrid(p.g), cand: decodeCand(p.c) };
}

/** Position 0 is the worked example; the rest are practice. */
export const practiceCount = (tech: TechId) => Math.max(0, PRACTICE[tech].length - 1);

export function mountLearnList(root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="screen learn">
      <header class="topbar"><a class="back" href="#/" aria-label="홈으로">${ICONS.back}</a><div class="title">교본</div></header>
      <div class="scroll">
        <p class="lead">스도쿠의 풀이 기법을 쉬운 것부터 차례로 배웁니다. 각 기법마다 설명과 예시, 실제 퍼즐에서 뽑은 연습 문제가 있어요.</p>
        ${CHAPTERS.map(
          (ch, n) => `
          <section class="chapter">
            <div class="ch-no">제${n + 1}장 ${tierMark(ch.tier)}</div>
            <h2>${esc(ch.title)}</h2>
            <p class="muted">${esc(ch.intro)}</p>
            <div class="tech-list">
              ${ch.techs
                .map((id) => {
                  const t = TECH_BY_ID[id];
                  const total = practiceCount(id);
                  const solved = lessonSolved(id).length;
                  const dots = Array.from({ length: total }, (_, i) => `<i class="${i < solved ? 'on' : ''}"></i>`).join('');
                  return `<a class="tech-row ${solved >= total ? 'cleared' : ''}" href="#/lesson/${id}">
                    <div><b>${esc(t.name)}</b><span class="en">${t.en}</span><div class="muted small">${esc(LESSONS[id].summary)}</div></div>
                    <div class="dots">${dots}</div>${ICONS.arrow}
                  </a>`;
                })
                .join('')}
            </div>
          </section>`,
        ).join('')}
      </div>
    </div>`;
  return () => {};
}

export function mountLesson(root: HTMLElement, tech: TechId): () => void {
  const t = TECH_BY_ID[tech];
  const lesson = LESSONS[tech];
  const chapter = CHAPTERS.find((c) => c.techs.includes(tech))!;
  const order = CHAPTERS.flatMap((c) => c.techs);
  const next = order[order.indexOf(tech) + 1];
  const isPlacement = t.tier === 0;

  root.innerHTML = `
    <div class="screen lesson">
      <header class="topbar"><a class="back" href="#/learn" aria-label="교본으로">${ICONS.back}</a><div class="title">${esc(t.name)}</div></header>
      <div class="scroll">
        <div class="lesson-head">
          <div class="ch-no">제${CHAPTERS.indexOf(chapter) + 1}장 · ${esc(chapter.title)} ${tierMark(t.tier)}</div>
          <h1>${esc(t.name)}</h1>
          <div class="en-title">${t.en}</div>
        </div>
        <p class="summary">${esc(lesson.summary)}</p>
        ${lesson.body.map((p) => `<p>${esc(p)}</p>`).join('')}
        <h3>찾는 법</h3>
        <ol class="find">${lesson.find.map((f) => `<li>${esc(f)}</li>`).join('')}</ol>

        <h3>예시</h3>
        <div class="legend">
          <span><i class="lg hl"></i>패턴</span><span><i class="lg hl2"></i>연결/보조</span><span><i class="lg elim"></i>지울 후보</span>
        </div>
        <div class="board-wrap" id="demo"></div>
        <p class="explain" id="demo-text"></p>

        <h3>연습 문제</h3>
        <div class="tabs" id="tabs"></div>
        <p class="task" id="task"></p>
        <div class="board-wrap" id="practice"></div>
        <p class="feedback" id="feedback"></p>
        <div class="actions" id="actions"></div>

        ${next ? `<a class="btn next-lesson" href="#/lesson/${next}">다음 기법: ${esc(TECH_BY_ID[next].name)} ›</a>` : ''}
      </div>
    </div>`;

  const $ = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
  const allGiven = (s: State) => s.grid.map((d) => d > 0);

  const stepView = (s: State, step: Step, withElim = true): BoardView => ({
    values: s.grid,
    givens: allGiven(s),
    notes: s.cand,
    pattern: step.cells,
    units: step.units,
    hl: step.hl,
    hl2: step.hl2,
    elim: withElim ? step.elim : undefined,
    links: withElim ? step.links : undefined,
    place: withElim ? step.place : undefined,
  });

  // Worked example.
  const demoBoard = new Board(() => {});
  $('demo').appendChild(demoBoard.el);
  const demoState = position(tech, 0);
  const demoStep = t.find(demoState, 1)[0];
  demoBoard.render(stepView(demoState, demoStep));
  $('demo-text').textContent = demoStep.text;

  // Practice.
  const total = practiceCount(tech);
  let current = 0;
  let state: State;
  let instances: Step[] = [];
  let marked: Cand[] = [];
  let reveal: Step | null = null;
  let hintOn = false;
  let solved = false;

  const pBoard = new Board((cell, digit) => {
    if (solved || reveal) return;
    if (isPlacement) {
      if (state.grid[cell]) return;
      const hit = instances.find((i) => i.place!.cell === cell);
      if (hit) succeed(hit);
      else feedback(`${cellName(cell)}은(는) 아직 이 기법으로 확정할 수 없어요.`, 'bad');
      return;
    }
    if (digit === null) return;
    const i = marked.findIndex((m) => m.cell === cell && m.digit === digit);
    if (i >= 0) marked.splice(i, 1);
    else marked.push({ cell, digit });
    feedback('');
    renderPractice();
  });
  $('practice').appendChild(pBoard.el);

  function feedback(text: string, kind: 'good' | 'bad' | '' = ''): void {
    const el = $('feedback');
    el.textContent = text;
    el.className = `feedback ${kind}`;
  }

  function succeed(step: Step): void {
    solved = true;
    reveal = step;
    markLessonSolved(tech, current + 1);
    feedback(`정답! ${step.text}`, 'good');
    renderTabs();
    renderPractice();
  }

  function check(): void {
    if (!marked.length) return feedback('지울 수 있다고 생각하는 후보를 탭해서 표시하세요.', 'bad');
    const exact = instances.find((i) => sameElim(i.elim, marked));
    if (exact) return succeed(exact);
    const k = (c: Cand) => c.cell * 10 + c.digit;
    const partial = instances.find((i) => {
      const s = new Set(i.elim.map(k));
      return marked.every((m) => s.has(k(m)));
    });
    if (partial) return feedback('맞게 고르셨어요. 그런데 같은 패턴으로 더 지울 수 있는 후보가 있어요.', 'bad');
    feedback('표시한 후보 중에 이 기법으로는 지울 수 없는 것이 있어요. 다시 살펴보세요.', 'bad');
  }

  function load(i: number): void {
    current = i;
    state = position(tech, i + 1);
    instances = t.find(state, 200);
    marked = [];
    reveal = null;
    hintOn = false;
    solved = false;
    $('task').textContent = isPlacement
      ? `${t.name}(으)로 숫자를 확정할 수 있는 칸을 찾아 탭하세요.`
      : `${t.name} 패턴을 찾아, 지울 수 있는 후보를 모두 탭한 뒤 확인을 누르세요.`;
    feedback('');
    renderTabs();
    renderPractice();
  }

  function renderTabs(): void {
    const done = new Set(lessonSolved(tech));
    $('tabs').innerHTML = Array.from(
      { length: total },
      (_, i) => `<button class="${i === current ? 'active' : ''} ${done.has(i + 1) ? 'ok' : ''}" data-i="${i}">${done.has(i + 1) ? '✓' : i + 1}</button>`,
    ).join('');
    for (const b of $('tabs').querySelectorAll<HTMLButtonElement>('button')) b.addEventListener('click', () => load(Number(b.dataset.i)));
  }

  function renderPractice(): void {
    if (reveal) {
      pBoard.render(stepView(state, reveal));
    } else {
      const first = instances[0];
      pBoard.render({
        values: state.grid,
        givens: allGiven(state),
        notes: state.cand,
        marked,
        pattern: hintOn ? first.cells : undefined,
        hl: hintOn ? first.hl : undefined,
        units: hintOn ? first.units : undefined,
      });
    }
    const a = $('actions');
    if (reveal) {
      a.innerHTML = current + 1 < total ? `<button class="btn primary" data-a="next">다음 문제</button>` : `<span class="muted">이 기법의 연습 문제를 모두 봤어요.</span>`;
    } else {
      a.innerHTML = `
        ${isPlacement ? '' : '<button class="btn primary" data-a="check">확인</button>'}
        <button class="btn" data-a="hint">${hintOn ? '힌트 숨기기' : '힌트'}</button>
        <button class="btn" data-a="show">정답 보기</button>`;
    }
    a.querySelector('[data-a=next]')?.addEventListener('click', () => load(current + 1));
    a.querySelector('[data-a=check]')?.addEventListener('click', check);
    a.querySelector('[data-a=hint]')?.addEventListener('click', () => {
      hintOn = !hintOn;
      renderPractice();
    });
    a.querySelector('[data-a=show]')?.addEventListener('click', () => {
      reveal = instances[0];
      feedback(reveal.text);
      renderPractice();
    });
  }

  if (total > 0) load(0);
  root.querySelector('.scroll')!.scrollTop = 0;
  return () => {};
}
