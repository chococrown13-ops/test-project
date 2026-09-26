import './style.css';
import { CHAPTERS } from './lessons.ts';
import { mountLearnList, mountLesson, practiceCount } from './learn.ts';
import { mountPlay } from './play.ts';
import { LEVELS, LEVEL_BY_ID, PUZZLES, getClears, lastGame, lessonSolved, loadGame, type LevelId } from './store.ts';
import { TECH_BY_ID, type TechId } from './techniques.ts';
import { esc, fmtTime } from './ui.ts';

const app = document.getElementById('app')!;
let cleanup: () => void = () => {};

function home(): () => void {
  const last = lastGame();
  const allTechs = CHAPTERS.flatMap((c) => c.techs);
  const lessonTotal = allTechs.reduce((n, t) => n + practiceCount(t), 0);
  const lessonDone = allTechs.reduce((n, t) => n + Math.min(lessonSolved(t).length, practiceCount(t)), 0);
  app.innerHTML = `
    <div class="screen home">
      <div class="scroll">
        <header class="hero">
          <div class="logo">数</div>
          <h1>스도쿠 도장</h1>
          <p class="muted">중급부터 극상까지, 기법을 배우며 푸는 스도쿠</p>
        </header>
        ${
          last
            ? `<a class="card continue" href="#/play/${last.level}/${last.idx}">
                <div><span class="muted small">이어하기</span><b>${LEVEL_BY_ID[last.level].name} · 스테이지 ${last.idx + 1}</b></div>
                <span class="muted">${fmtTime(last.elapsed)} ›</span>
              </a>`
            : ''
        }
        <h2 class="section">스테이지</h2>
        <div class="levels">
          ${LEVELS.map((lv) => {
            const cleared = Object.keys(getClears(lv.id)).length;
            const total = PUZZLES[lv.id].length;
            return `<a class="card level tier${lv.tier}" href="#/stages/${lv.id}">
              <div class="lv-name">${lv.name}</div>
              <div class="lv-desc">${esc(lv.desc)}</div>
              <div class="bar"><i style="width:${(cleared / total) * 100}%"></i></div>
              <div class="small muted">${cleared} / ${total} 클리어</div>
            </a>`;
          }).join('')}
        </div>
        <h2 class="section">학습</h2>
        <a class="card learn-card" href="#/learn">
          <div>
            <b>학습 채널</b>
            <p class="muted small">히든 싱글부터 X-체인까지 ${allTechs.length}가지 기법 · 설명, 예시, 연습 문제</p>
            <div class="bar"><i style="width:${lessonTotal ? (lessonDone / lessonTotal) * 100 : 0}%"></i></div>
            <div class="small muted">연습 문제 ${lessonDone} / ${lessonTotal}</div>
          </div>
          <span class="arrow">›</span>
        </a>
      </div>
    </div>`;
  return () => {};
}

function stages(level: LevelId): () => void {
  const lv = LEVEL_BY_ID[level];
  const clears = getClears(level);
  const list = PUZZLES[level];
  const firstOpen = list.findIndex((_, i) => !clears[i]);
  app.innerHTML = `
    <div class="screen stages">
      <header class="topbar"><a class="back" href="#/" aria-label="홈으로">‹</a><div class="title">${lv.name} 스테이지</div></header>
      <div class="scroll">
        <p class="lead">${esc(lv.desc)} — 번호가 클수록 어려워집니다.</p>
        <div class="stage-grid">
          ${list
            .map((_, i) => {
              const c = clears[i];
              const saved = !c && loadGame(level, i);
              const cls = c ? 'cleared' : saved ? 'progress' : i === firstOpen ? 'next' : '';
              return `<a class="stage ${cls}" href="#/play/${level}/${i}">
                <b>${i + 1}</b>
                <span>${c ? fmtTime(c.time) : saved ? '진행 중' : ''}</span>
              </a>`;
            })
            .join('')}
        </div>
      </div>
    </div>`;
  return () => {};
}

function route(): void {
  cleanup();
  window.scrollTo(0, 0);
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [page, a, b] = parts;
  if (page === 'stages' && a in LEVEL_BY_ID) cleanup = stages(a as LevelId);
  else if (page === 'play' && a in LEVEL_BY_ID && PUZZLES[a as LevelId][Number(b)]) cleanup = mountPlay(app, a as LevelId, Number(b));
  else if (page === 'learn') cleanup = mountLearnList(app);
  else if (page === 'lesson' && a in TECH_BY_ID) cleanup = mountLesson(app, a as TechId);
  else cleanup = home();
}

window.addEventListener('hashchange', route);
window.addEventListener('pagehide', () => cleanup());
route();
