import './style.css';
import { CHAPTERS } from './lessons.ts';
import { mountLearnList, mountLesson, practiceCount } from './learn.ts';
import { mountPlay } from './play.ts';
import { ICONS } from './icons.ts';
import { sealSvg, tiltFor } from './seal.ts';
import { LEVELS, LEVEL_BY_ID, PUZZLES, getClears, lastGame, lessonSolved, loadGame, type LevelId } from './store.ts';
import { TECH_BY_ID, type TechId } from './techniques.ts';
import { THEMES, applyTheme, getTheme, levelSub, rankName, setTheme, type ThemeId } from './theme.ts';
import { esc, fmtTime } from './ui.ts';

applyTheme(getTheme());

const app = document.getElementById('app')!;
let cleanup: () => void = () => {};

function themeSwitch(): string {
  const cur = getTheme();
  return `<div class="theme-switch" role="radiogroup" aria-label="테마">
    ${(Object.keys(THEMES) as ThemeId[])
      .map(
        (t) => `<button role="radio" aria-checked="${t === cur}" data-theme-pick="${t}" class="swatch-btn ${t === cur ? 'on' : ''}">
          <span class="swatch swatch-${t}"><i></i><i></i><i></i></span>
          <span><b>${THEMES[t].name}</b><small>${THEMES[t].desc}</small></span>
        </button>`,
      )
      .join('')}
  </div>`;
}

function home(): () => void {
  const last = lastGame();
  const theme = getTheme();
  const allTechs = CHAPTERS.flatMap((c) => c.techs);
  const lessonTotal = allTechs.reduce((n, t) => n + practiceCount(t), 0);
  const lessonDone = allTechs.reduce((n, t) => n + Math.min(lessonSolved(t).length, practiceCount(t)), 0);
  app.innerHTML = `
    <div class="screen home">
      <div class="scroll">
        <header class="masthead">
          <div class="kicker">SUDOKU DOJO</div>
          <h1>스도쿠 도장</h1>
          <p class="sub">한 판씩, 기법 하나씩.</p>
          ${themeSwitch()}
        </header>
        ${
          last
            ? `<a class="continue" href="#/play/${last.level}/${last.idx}">
                <span class="label">이어서 두기</span>
                <span class="what">${rankName(LEVEL_BY_ID[last.level].tier)} ${last.idx + 1}</span>
                <span class="time">${fmtTime(last.elapsed)}</span>
                ${ICONS.arrow}
              </a>`
            : ''
        }
        <h2 class="section"><span>단계</span></h2>
        <ol class="ranks">
          ${LEVELS.map((lv) => {
            const cleared = Object.keys(getClears(lv.id)).length;
            const total = PUZZLES[lv.id].length;
            return `<li><a class="rank-row" href="#/stages/${lv.id}">
              <span class="rank-no">${lv.tier}</span>
              <span class="rank-body">
                <span class="rank-name">${rankName(lv.tier)}<small>${levelSub(lv.tier, lv.name)}</small></span>
                <span class="rank-desc">${esc(lv.desc)}</span>
              </span>
              <span class="rank-count">${cleared ? sealSvg(theme, { className: 'mini' }) : ''}<b>${cleared}</b>/${total}</span>
            </a></li>`;
          }).join('')}
        </ol>
        <h2 class="section"><span>배우기</span></h2>
        <a class="book-row" href="#/learn">
          ${ICONS.book}
          <span class="rank-body">
            <span class="rank-name">교본</span>
            <span class="rank-desc">히든 싱글부터 XY-체인까지 ${allTechs.length}가지 기법 · 설명, 예시, 연습 문제</span>
          </span>
          <span class="rank-count"><b>${lessonDone}</b>/${lessonTotal}</span>
        </a>
      </div>
    </div>`;
  for (const b of app.querySelectorAll<HTMLButtonElement>('[data-theme-pick]')) {
    b.addEventListener('click', () => {
      setTheme(b.dataset.themePick as ThemeId);
      route();
    });
  }
  return () => {};
}

function stages(level: LevelId): () => void {
  const lv = LEVEL_BY_ID[level];
  const clears = getClears(level);
  const list = PUZZLES[level];
  const theme = getTheme();
  const firstOpen = list.findIndex((_, i) => !clears[i]);
  const count = Object.keys(clears).length;
  app.innerHTML = `
    <div class="screen stages">
      <header class="topbar"><a class="back" href="#/" aria-label="홈으로">${ICONS.back}</a><div class="title">${rankName(lv.tier)}<small>${levelSub(lv.tier, lv.name)}</small></div></header>
      <div class="scroll">
        <div class="stamp-card">
          <div class="stamp-head">
            <div><b>${rankName(lv.tier)} 도장판</b><span>${esc(lv.desc)}</span></div>
            <div class="stamp-count"><b>${count}</b> / ${list.length}</div>
          </div>
          <div class="stage-grid">
            ${list
              .map((_, i) => {
                const c = clears[i];
                const saved = !c && loadGame(level, i);
                const cls = c ? 'cleared' : saved ? 'progress' : i === firstOpen ? 'next' : '';
                return `<a class="slot ${cls}" href="#/play/${level}/${i}" title="${c ? `최고 ${fmtTime(c.time)}` : saved ? '두는 중' : ''}">
                  <span class="num">${i + 1}</span>
                  ${c ? sealSvg(theme, { rotate: tiltFor(i) }) : ''}
                  ${saved ? '<span class="dot"></span>' : ''}
                </a>`;
              })
              .join('')}
          </div>
          <p class="stamp-foot">번호가 클수록 어렵습니다. 한 판을 풀 때마다 도장을 하나 찍어 드려요.</p>
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
