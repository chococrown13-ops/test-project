import '../../city/src/tokens.css';
import '../../city/src/base.css';
import './style.css';
import { KeepScene, type Quality } from './render/scene';
import { affected, CARDS, type Lean, threatened } from './sim/cards';
import { indicators } from './sim/decade';
import { clearSave, decide, ending, lifetime, load, newGame, options, save, type TurnResult } from './sim/game';
import { mayorById, mayorChoice } from './sim/mayors';
import { iga, KIND_NAME, ro } from './sim/text';
import { CELL, type Game, type Indicators, N, type Offer, type Place, TURNS } from './sim/world';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('view');
const scene = new KeepScene(canvas);
const phone = matchMedia('(max-width: 760px)').matches || /Mobi|Android/i.test(navigator.userAgent);

/* ---------- graphics level ---------- */

type QSetting = 'auto' | Quality;
const QNAME: Record<Quality, string> = { high: '높게', medium: '보통', low: '가볍게' };
const QNOTE: Record<Quality, string> = {
  high: '선명한 해상도, 그림자, 외곽선, 작은 부품까지 모두 그려요.',
  medium: '해상도와 그림자를 줄이고, 작은 부품은 가까이서만 그려요.',
  low: '그림자와 외곽선을 끄고 작은 부품은 아주 가까이서만 그려요.',
};
let qSetting: QSetting = 'auto';
try { const v = localStorage.getItem('keep.quality'); if (v === 'auto' || v === 'high' || v === 'medium' || v === 'low') qSetting = v; } catch { /* default */ }
/** In 자동, start from what the device probably manages, then measure and step down if it struggles. */
let probe: { frames: number; sum: number; start: number; prev?: number } | null = null;
function applyQuality(q: Quality) { scene.setQuality(q); renderGfx(); }
function startQuality() {
  if (qSetting === 'auto') { applyQuality(phone ? 'medium' : 'high'); probe = { frames: 0, sum: 0, start: performance.now() }; }
  else { applyQuality(qSetting); probe = null; }
}
function renderGfx() {
  document.querySelectorAll<HTMLButtonElement>('.seg [data-q]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.q === qSetting)));
  const note = $('gfxNote');
  if (note) note.textContent = qSetting === 'auto' ? `지금은 '${QNAME[scene.quality]}'이에요. 기기 속도를 재서 맞춰요.` : QNOTE[qSetting];
}
document.querySelectorAll<HTMLButtonElement>('.seg [data-q]').forEach((b) => b.addEventListener('click', () => {
  qSetting = b.dataset.q as QSetting;
  try { localStorage.setItem('keep.quality', qSetting); } catch { /* not saved */ }
  startQuality();
}));
startQuality();

let g: Game = load() ?? newGame();
let selected = -1;
let busy = false;

const KEYS: (keyof Indicators)[] = ['memory', 'vitality', 'residents', 'budget'];
const KNAME: Record<keyof Indicators, string> = { memory: '기억', vitality: '활력', residents: '주민', budget: '살림' };
const LEAN_KEY: Record<keyof Indicators, keyof Lean> = { memory: 'm', vitality: 'v', residents: 'r', budget: 'b' };
const STAYS = new Set(['tree', 'mural', 'crossing']);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function resize() {
  scene.resize(innerWidth, innerHeight);
  document.documentElement.style.setProperty('--sheet-h', `${$('sheet').classList.contains('away') ? 0 : $('sheet').offsetHeight}px`);
}
addEventListener('resize', resize);

/* ---------- top bar ---------- */

function renderTop() {
  $('guName').textContent = g.gu;
  $('year').textContent = g.done ? '2070년 · 100년의 끝' : `${g.year}년 · ${g.turn + 1} / ${TURNS}`;
  const ind = indicators(g);
  for (const k of KEYS) {
    const el = document.querySelector<HTMLElement>(`.ind-i[data-k="${k}"]`)!;
    el.querySelector('.num')!.textContent = String(ind[k]);
    (el.querySelector('.meter b') as HTMLElement).style.width = `${ind[k]}%`;
    el.classList.toggle('low', ind[k] < 30);
    el.title = `${KNAME[k]} ${ind[k]}`;
  }
}

/* ---------- the decision sheet ---------- */

function leanHtml(l: Lean) {
  return KEYS.map((k) => {
    const v = l[LEAN_KEY[k]];
    if (!v) return '';
    const arrows = (v > 0 ? '▲' : '▼').repeat(Math.min(3, Math.abs(v)));
    return `<span class="lean">${KNAME[k]} <span class="${v > 0 ? 'u' : 'dn'}">${arrows}</span></span>`;
  }).join('');
}

function cardTarget(o: Offer): { x: number; y: number } | null {
  if (o.cell >= 0) return { x: o.cell % N, y: (o.cell / N) | 0 };
  if (o.card === 'newtown') return { x: N / 2, y: Math.round(N * 0.86) };
  return null;
}

function renderSheet() {
  const ops = options(g);
  $('sheetTitle').textContent = `${g.year}년대, 무엇을 할까요?`;
  const box = $('cards');
  box.innerHTML = '';
  ops.forEach((o, i) => {
    const c = CARDS[o.card];
    const money = c.money(g, o);
    const th = threatened(g, o);
    const b = document.createElement('button');
    b.className = 'card';
    b.dataset.cat = c.cat;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(i === selected));
    b.innerHTML = `<span class="cat">${c.cat}</span><span class="t">${esc(c.title(g, o))}</span><span class="d">${esc(c.desc(g, o))}</span>`
      + (th.length ? `<span class="threat">사라질 곳: ${th.map((p) => esc(p.name)).join(' · ')}</span>` : '')
      + `<span class="meta">${money ? `<span class="money ${money > 0 ? 'plus' : 'minus'}">${money > 0 ? '+' : '−'}${Math.abs(money)}억</span>` : ''}${leanHtml(c.lean)}</span>`;
    b.addEventListener('click', () => select(i));
    box.appendChild(b);
  });
  const m = mayorById(g.mayor.id);
  $('mayor').innerHTML = `이번 10년 대행 후보 <b>${m.name}</b> · ${esc(g.mayor.trait)}<br><span class="muted">“${esc(m.motto)}”</span>`;
  $<HTMLButtonElement>('confirm').disabled = selected < 0;
  requestAnimationFrame(resize);
}

function select(i: number) {
  if (busy) return;
  selected = i;
  document.querySelectorAll('.card').forEach((el, k) => el.setAttribute('aria-checked', String(k === i)));
  $<HTMLButtonElement>('confirm').disabled = false;
  const o = options(g)[i];
  const c = CARDS[o.card];
  if (c.target === 'area') scene.setHighlight({ cells: affected(g, o) });
  else if (c.target === 'district') scene.setHighlight({ district: o.district });
  else if (c.target === 'place') scene.setHighlight({ place: o.place });
  else scene.setHighlight({});
  const t = cardTarget(o);
  // The sheet covers the bottom of the screen: lift the target into the part you can see.
  const lift = Math.min(0.32, ($('sheet').offsetHeight / innerHeight) * 0.55);
  if (t) scene.view.focusAbove(t.x * CELL + CELL / 2, t.y * CELL + CELL / 2, c.target === 'place' ? 520 : c.target === 'district' ? 1500 : 1000, lift);
  else scene.view.focusAbove(N * CELL / 2, N * CELL / 2, 2600, lift);
  if (c.target === 'place') showPlace(g.places[o.place]);
  else hidePlace();
}

$('sheetToggle').addEventListener('click', () => {
  const s = $('sheet');
  const mini = s.classList.toggle('mini');
  $('sheetToggle').textContent = mini ? '선택지 보기' : '지도 보기';
  $('sheetToggle').setAttribute('aria-expanded', String(!mini));
  resize();
});

$('confirm').addEventListener('click', () => { if (selected >= 0) play(selected, '구청장(나)', false); });
$('delegate').addEventListener('click', () => {
  if (busy) return;
  const { index, changed } = mayorChoice(g, options(g));
  const m = mayorById(g.mayor.id);
  select(index);
  const el = document.querySelectorAll('.card')[index];
  const tag = document.createElement('span');
  tag.className = 'pick';
  tag.textContent = `${m.name}의 선택`;
  el?.appendChild(tag);
  busy = true;
  toast(changed ? `${iga(m.name)} 막판에 마음을 바꿨어요!` : `${iga(m.name)} 고민 끝에 골랐어요.`);
  setTimeout(() => { busy = false; play(index, m.name, changed); }, 1400);
});

/* ---------- a decade passes ---------- */

function play(index: number, by: string, changed: boolean) {
  if (busy) return;
  busy = true;
  const o = options(g)[index];
  const before = g.btype.slice();
  const from = cardTarget(o) ?? undefined;
  const r = decide(g, index, by, changed);
  const fresh = new Set<number>();
  for (let i = 0; i < N * N; i++) if (g.btype[i] !== before[i] && g.btype[i] !== 0) fresh.add(i);
  save(g);
  selected = -1;
  hidePlace();
  $('sheet').classList.add('away');
  resize();
  scene.setHighlight({});
  // Pull back to see the whole 구 change over the decade.
  scene.view.focus(from ? from.x * CELL : N * CELL / 2, from ? from.y * CELL : N * CELL / 2, 2200);
  scene.update(fresh, from);
  renderTop();
  setTimeout(() => showPaper(r), 2600);
}

function showPaper(r: TurnResult) {
  const d = $<HTMLDialogElement>('paper');
  const deltas = KEYS.map((k) => {
    const dv = r.after[k] - r.before[k];
    return `<div><dt>${KNAME[k]}</dt><dd>${r.after[k]} <span class="${dv > 0 ? 'u' : dv < 0 ? 'dn' : ''}">${dv > 0 ? '▲' : dv < 0 ? '▼' : '–'}${dv ? Math.abs(dv) : ''}</span></dd></div>`;
  }).join('');
  const [era, ...rest] = r.lines;
  const gone = r.lost.length ? `<div class="gone"><h3>이번 10년 사이 사라진 곳</h3><p>${r.lost.map(esc).join(' · ')}</p></div>` : '';
  d.innerHTML = `<div class="mast"><span class="name">${esc(g.gu)} 소식</span><span>${r.year + 9}년 12월 31일 · 10년 결산호</span></div>
    <h2>${esc(r.decision)}</h2>
    <div class="by">결정: ${esc(r.by)}${r.changed ? ' · 막판에 마음을 바꿨어요' : ''}</div>
    <div class="cols"><p><i>${esc(era)}</i></p>${rest.slice(0, 14).map((l) => `<p>${esc(l)}</p>`).join('')}${rest.length > 14 ? `<p class="muted">그 밖에 소식 ${rest.length - 14}건</p>` : ''}</div>
    ${gone}
    <dl class="deltas">${deltas}</dl>
    <div class="foot"><button class="btn primary" id="paperNext">${g.done ? '100년을 돌아보기' : `${g.year}년대로`}</button></div>`;
  d.showModal();
  $('paperNext').addEventListener('click', () => {
    d.close();
    busy = false;
    if (g.done) showEnd();
    else nextTurn();
  });
}

function nextTurn() {
  renderTop();
  renderSheet();
  $('sheet').classList.remove('away', 'mini');
  $('sheetToggle').textContent = '지도 보기';
  resize();
}

/* ---------- 2070 ---------- */

function chartSvg(): string {
  const hs = g.history;
  const W = innerWidth < 520 ? 360 : 560, H = innerWidth < 520 ? 220 : 200, L = 30, R = 64, T = 10, Bm = 24;
  const xs = (k: number) => L + (k / Math.max(1, hs.length - 1)) * (W - L - R);
  const ys = (v: number) => T + (1 - v / 100) * (H - T - Bm);
  const grid = [0, 25, 50, 75, 100].map((v) => `<line x1="${L}" x2="${W - R}" y1="${ys(v)}" y2="${ys(v)}"/>`).join('');
  const yl = [0, 50, 100].map((v) => `<text x="${L - 6}" y="${ys(v) + 4}" text-anchor="end">${v}</text>`).join('');
  const xl = hs.map((h, k) => (k % 2 === 0 || k === hs.length - 1 ? `<text x="${xs(k)}" y="${H - 6}" text-anchor="middle">${h.year + 10}</text>` : '')).join('');
  // Direct labels at the line ends, nudged apart so they never overlap.
  const ends = KEYS.map((k) => ({ k, y: ys(hs[hs.length - 1].indicators[k]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
  const lines = KEYS.map((k) => {
    const pts = hs.map((h, i) => `${xs(i).toFixed(1)},${ys(h.indicators[k]).toFixed(1)}`).join(' ');
    const last = hs.length - 1;
    const e = ends.find((x) => x.k === k)!;
    return `<polyline class="ser" points="${pts}" style="stroke:var(--s-${k})"/><circle class="dot" r="4" cx="${xs(last)}" cy="${ys(hs[last].indicators[k])}" style="fill:var(--s-${k})"/><text class="slab" x="${xs(last) + 10}" y="${e.y + 4}">${KNAME[k]} ${hs[last].indicators[k]}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="10년마다의 네 지표 변화"><g class="grid">${grid}</g><g class="axis">${yl}${xl}</g><line class="xh" id="xh" y1="${T}" y2="${H - Bm}" x1="-10" x2="-10"/>${lines}<rect id="hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - Bm}" fill="transparent"/></svg>`;
}

function showEnd() {
  const e = ending(g), life = lifetime(g);
  const d = $<HTMLDialogElement>('end');
  const table = `<table class="sr-table"><caption>10년마다의 지표</caption><tr><th>연도</th>${KEYS.map((k) => `<th>${KNAME[k]}</th>`).join('')}</tr>${g.history.map((h) => `<tr><td>${h.year + 10}</td>${KEYS.map((k) => `<td>${h.indicators[k]}</td>`).join('')}</tr>`).join('')}</table>`;
  d.innerHTML = `<h2 tabindex="-1" autofocus>${esc(e.title)}</h2><p>${esc(e.line)}</p>
    <div class="score">100년 점수 ${e.score} · 지킨 곳 ${e.kept + e.reused} · 사라진 곳 ${e.lost}</div>
    <dl class="deltas">${KEYS.map((k) => `<div><dt>${KNAME[k]} (100년)</dt><dd>${life[k]}</dd></div>`).join('')}</dl>
    <div class="legend">${KEYS.map((k) => `<span><i style="background:var(--s-${k})"></i>${KNAME[k]}</span>`).join('')}</div>
    <div class="chart" style="position:relative">${chartSvg()}<div class="tip" id="tip" hidden></div></div>${table}
    <h3>열 번의 결정</h3>
    <ul class="timeline">${g.history.map((h) => `<li><span class="y">${h.year}년대</span><span>${esc(h.decision)} <span class="muted">· ${esc(h.by)}</span></span></li>`).join('')}</ul>
    <div class="acts"><button class="btn" data-act="album">사라진 것들, 남은 것들</button><button class="btn" data-act="map">지도 둘러보기</button><button class="btn primary" data-act="new">새 구에서 다시</button></div>`;
  d.showModal();
  wireChart(d);
  d.querySelector('[data-act="album"]')!.addEventListener('click', () => showAlbum());
  d.querySelector('[data-act="map"]')!.addEventListener('click', () => d.close());
  d.querySelector('[data-act="new"]')!.addEventListener('click', () => { d.close(); restart(); });
}

function wireChart(root: HTMLElement) {
  const svg = root.querySelector('svg')!, hit = root.querySelector('#hit')!, tip = root.querySelector<HTMLElement>('#tip')!, xh = root.querySelector('#xh')!;
  const hs = g.history;
  const move = (ev: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const sx = (ev.clientX - r.left) / r.width * vb.width;
    const k = Math.round((sx - 30) / (vb.width - 94) * (hs.length - 1));
    if (k < 0 || k >= hs.length) return;
    const x = 30 + k / Math.max(1, hs.length - 1) * (vb.width - 94);
    xh.setAttribute('x1', String(x)); xh.setAttribute('x2', String(x));
    const h = hs[k];
    tip.hidden = false;
    tip.innerHTML = `<b>${h.year + 10}년</b><br>${KEYS.map((q) => `${KNAME[q]} ${h.indicators[q]}`).join(' · ')}`;
    tip.style.left = `${(x / vb.width) * r.width}px`;
    tip.style.top = `${(10 / vb.height) * r.height}px`;
  };
  hit.addEventListener('pointermove', move as EventListener);
  hit.addEventListener('pointerdown', move as EventListener);
  hit.addEventListener('pointerleave', () => { tip.hidden = true; xh.setAttribute('x1', '-10'); xh.setAttribute('x2', '-10'); });
}

function showAlbum() {
  const d = $<HTMLDialogElement>('album');
  const lost = g.lost.slice().reverse().map((l) => ({ l, p: g.places[l.place] }));
  const kept = g.places.filter((p) => p.state !== 'lost');
  const item = (p: Place, why: string) => `<div class="item"><b>${esc(p.name)}</b> <span class="muted">${KIND_NAME[p.kind]} · ${p.since}년부터</span><div class="why">${esc(why)}</div><div class="why">${esc(p.story[0] ?? '')}</div></div>`;
  d.innerHTML = `<h2 tabindex="-1" autofocus>사라진 것들, 남은 것들</h2>
    <h3>사라진 곳 ${lost.length}</h3>${lost.length ? lost.map(({ l, p }) => item(p, `${l.year}년대, ${l.why} · ${l.by === '구청' ? '구청의 결정' : l.by === '홍수' ? '홍수' : '시장의 흐름'}${p.recorded ? ' · 기록은 남아 있어요' : ''}`)).join('') : '<p class="muted">아직 사라진 곳이 없어요.</p>'}
    <h3>남은 곳 ${kept.length}</h3>${kept.map((p) => item(p, p.state === 'open' ? (STAYS.has(p.kind) ? '그대로 남아 있어요' : '여전히 문을 열어요') : p.state === 'reused' ? `${ro(p.reuse ?? '')} 다시 쓰여요` : '문은 닫혔지만 건물은 남았어요')).join('')}
    <div class="acts" style="display:flex;justify-content:flex-end"><button class="btn primary" data-close>닫기</button></div>`;
  d.showModal();
  d.querySelector('[data-close]')!.addEventListener('click', () => d.close());
}

/* ---------- places ---------- */

function showPlace(p: Place) {
  const el = $('placeCard');
  const st = p.state === 'open' ? ['open', '영업 중'] : p.state === 'reused' ? ['reused', `${ro(p.reuse ?? '')} 다시 씀`] : p.state === 'closed' ? ['closed', '문 닫음'] : ['closed', '사라짐'];
  el.innerHTML = `<button class="btn ghost icon x" aria-label="닫기">✕</button><h3>${esc(p.name)}</h3>
    <div class="sub">${KIND_NAME[p.kind]} · ${esc(g.districts[p.district].name)} · ${p.since}년부터 · ${esc(p.founder)}</div>
    <div class="badges"><span class="badge ${st[0]}">${esc(st[1])}</span>${p.protected ? '<span class="badge prot">보존 건물</span>' : ''}${p.support > 0 ? '<span class="badge">가업 지원</span>' : ''}${p.recorded ? '<span class="badge">기록됨</span>' : ''}</div>
    <ul>${p.story.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`;
  el.hidden = false;
  el.querySelector('.x')!.addEventListener('click', hidePlace);
}
function hidePlace() { $('placeCard').hidden = true; }

/* ---------- labels over the map ---------- */

function renderLabels() {
  const box = $('labels');
  const rect = canvas.getBoundingClientRect();
  const o = selected >= 0 ? options(g)[selected] : null;
  const danger = new Set(o ? threatened(g, o).map((p) => p.id) : []);
  if (o && CARDS[o.card].target === 'place') danger.add(o.place);
  const close = scene.view.dist < 900;
  let html = '';
  let n = 0;
  for (const p of g.places) {
    if (p.state === 'lost' || (!close && !danger.has(p.id))) continue;
    const q = scene.placeScreen(p, rect);
    if (!q || q.x < 0 || q.y < 60 || q.x > rect.width || q.y > rect.height) continue;
    html += `<span class="lbl${danger.has(p.id) ? ' danger' : ''}" style="left:${q.x.toFixed(0)}px;top:${(q.y - 34).toFixed(0)}px">${esc(p.name)}</span>`;
    if (++n > 40) break;
  }
  if (box.innerHTML !== html) box.innerHTML = html;
}

/* ---------- input ---------- */

const pointers = new Map<number, { x: number; y: number }>();
let downAt: { x: number; y: number; t: number } | null = null;
let moved = 0;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) { downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; moved = 0; }
});
canvas.addEventListener('pointermove', (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
  moved += Math.abs(dx) + Math.abs(dy);
  if (pointers.size === 1) {
    if (e.buttons & 2 || e.shiftKey) scene.view.rotate(-dx * 0.006, dy * 0.004);
    else scene.view.panPixels(dx, dy, innerHeight);
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.entries()];
    const other = a[0] === e.pointerId ? b[1] : a[1];
    const d0 = Math.hypot(prev.x - other.x, prev.y - other.y), d1 = Math.hypot(e.clientX - other.x, e.clientY - other.y);
    if (d0 > 0) scene.view.zoom(d0 / d1);
    const a0 = Math.atan2(prev.y - other.y, prev.x - other.x), a1 = Math.atan2(e.clientY - other.y, e.clientX - other.x);
    scene.view.rotate(a1 - a0, 0);
  }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
});
const up = (e: PointerEvent) => {
  pointers.delete(e.pointerId);
  if (downAt && moved < 8 && performance.now() - downAt.t < 500 && pointers.size === 0) {
    const hit = scene.pick(e.clientX, e.clientY, canvas.getBoundingClientRect());
    if (hit.place !== undefined) showPlace(g.places[hit.place]);
    else hidePlace();
  }
  if (pointers.size === 0) downAt = null;
};
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => { e.preventDefault(); scene.view.zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]')) return;
  if (e.key === 'q') scene.view.rotate(0.2, 0);
  if (e.key === 'e') scene.view.rotate(-0.2, 0);
  if (e.key === '+' || e.key === '=') scene.view.zoom(0.8);
  if (e.key === '-') scene.view.zoom(1.25);
});

/* ---------- menu ---------- */

function toast(s: string) {
  const t = $('toast');
  t.textContent = s;
  t.hidden = false;
  clearTimeout((toast as unknown as { h: number }).h);
  (toast as unknown as { h: number }).h = window.setTimeout(() => (t.hidden = true), 2600);
}

$('menuBtn').addEventListener('click', () => $<HTMLDialogElement>('menu').showModal());
$('menu').addEventListener('click', (e) => {
  const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
  if (!act) return;
  $<HTMLDialogElement>('menu').close();
  if (act === 'album') showAlbum();
  if (act === 'help') $<HTMLDialogElement>('help').showModal();
  if (act === 'new' && confirm('지금 구를 버리고 새 구에서 1970년부터 다시 시작할까요?')) restart();
});
$('help').querySelector('[data-close]')!.addEventListener('click', () => $<HTMLDialogElement>('help').close());

function restart() {
  clearSave();
  g = newGame();
  selected = -1;
  busy = false;
  start();
}

function start() {
  scene.setGame(g);
  const c = g.districts[0];
  scene.view.focusAbove(c.cx * CELL, c.cy * CELL, 1500, 0.15);
  scene.view.snap();
  renderTop();
  hidePlace();
  if (g.done) { $('sheet').classList.add('away'); resize(); showEnd(); }
  else nextTurn();
}

start();
let seen = true;
try { seen = !!localStorage.getItem('keep.seenHelp'); localStorage.setItem('keep.seenHelp', '1'); } catch { /* private mode: show the help once per visit */ seen = false; }
if (!seen && !g.done) $<HTMLDialogElement>('help').showModal();

let last = performance.now();
let labelT = 0;
let drewLast = false;
function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  // While measuring for 자동, keep drawing so the timing is real.
  if (probe) scene.invalidate();
  const drew = scene.frame(dt);
  if (probe && drew) {
    if (probe.frames > 0) probe.sum += now - (probe.prev ?? now);
    probe.prev = now;
    probe.frames++;
    if (probe.frames >= 40 || now - probe.start > 5000) {
      const avg = probe.sum / Math.max(1, probe.frames - 1);
      const down: Record<Quality, Quality | null> = { high: 'medium', medium: 'low', low: null };
      const next = avg > 40 ? down[scene.quality] : null;
      if (next) {
        applyQuality(next);
        toast(`기기에 맞춰 그래픽을 '${QNAME[next]}' 단계로 낮췄어요.`);
        probe = { frames: 0, sum: 0, start: performance.now() };
      } else probe = null;
    }
  }
  // Labels only move when the picture does.
  if (drew && ((labelT += dt) > 0.05 || !drewLast)) { labelT = 0; renderLabels(); }
  drewLast = drew;
  requestAnimationFrame(loop);
}
resize();
requestAnimationFrame(loop);

// For automated checks.
(window as unknown as { keep: unknown }).keep = {
  get g() { return g; }, scene, play: (i: number) => play(i, '테스트', false),
  /** Let the AI mayors play out the rest of the century, then show 2070. */
  finish() { while (!g.done) decide(g, mayorChoice(g, options(g)).index, mayorById(g.mayor.id).name); save(g); scene.setGame(g); renderTop(); $('sheet').classList.add('away'); showEnd(); },
};
