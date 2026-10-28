import './style.css';
import { CELL, Ground, KINDS, Level, LEVEL_NAME, N, Road, SERVICE, Zone } from './sim/defs';
import { loadLocal, saveLocal } from './sim/save';
import { createSim, tick, type Sim } from './sim/sim';
import { altCells, altCost, altProblem, bulldoze, diagonalPath, paintZone, placeAltRoad, placeFacility, placeProblem, placeRoad, rectCells, roadBlocked, roadCost, roadPath, zoneable } from './sim/tools';
import { createLine, removeLine, STOP_RADIUS, stopProblem, type LineKind } from './sim/transit';
import { createWorld, idx, riverY } from './sim/world';
import { CityScene } from './render/scene';
import type { Overlay } from './render/ground';
import { CATEGORIES, TOOLS, type ToolDef, type ToolId } from './ui/tools';
import { budgetHtml, draftHtml, HELP, infoHtml, linesHtml, menuHtml, pumpToasts, resetToasts, statsHtml, toast, updateGoal, updateTop } from './ui/hud';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('view');

let sim: Sim = createSim(createWorld());
const scene = new CityScene(canvas, sim);
// Phones start on normal quality; the choice is remembered per browser.
const QKEY = 'city.quality';
let savedQ: string | null = null;
try { savedQ = localStorage.getItem(QKEY); } catch { /* storage blocked */ }
scene.setQuality(savedQ === 'high' || savedQ === 'normal' ? savedQ : matchMedia('(pointer: coarse)').matches ? 'normal' : 'high');
let speed = 0;
let running = false;
let tool: ToolId = 'select';
let cat: string | null = null;
/** The bus or subway line being drawn: stops picked so far. */
let draft: { kind: LineKind; stops: number[] } | null = null;
/** Road tools draw 45° runs while this is on. */
let diagonal = false;

/* --------------------------------------------------------------- layout */

function resize() { scene.resize(window.innerWidth, window.innerHeight); }
window.addEventListener('resize', resize);
resize();

function focusStart() {
  const row = Math.round(riverY(0, sim.w.seed) - 22);
  scene.view.focus(24 * CELL, row * CELL + 40);
}
focusStart();

/* ---------------------------------------------------------------- dock */

function renderCats() {
  $('cats').innerHTML = CATEGORIES.map((c) => `<button class="cat" data-cat="${c.id}" aria-pressed="${c.id === cat}" aria-keyshortcuts="${c.key}">${c.name}</button>`).join('')
    + `<span class="cats-rule" aria-hidden="true"></span><button class="cat" data-panel="stats" aria-pressed="${panel === 'stats'}">현황</button><button class="cat" data-panel="budget" aria-pressed="${panel === 'budget'}">예산</button>`;
  const tools = $('tools');
  const c = CATEGORIES.find((k) => k.id === cat);
  tools.hidden = !c || (c.tools.length < 2 && c.id !== 'transit');
  if (c) tools.innerHTML = c.tools.map((t) => `<button class="tool" data-tool="${t.id}" aria-pressed="${t.id === tool}">${t.swatch ? `<span class="sw" style="--sw:${t.swatch}"></span>` : ''}<span class="n">${t.name}</span>${t.price ? `<span class="p">${t.price}</span>` : ''}</button>`).join('')
    + (c.id === 'road' ? `<span class="cats-rule" aria-hidden="true"></span><button class="tool" data-toggle="diag" aria-pressed="${diagonal}" aria-keyshortcuts="T"><span class="n">대각선</span><span class="p">${diagonal ? '켜짐' : '꺼짐'}</span></button>` : '')
    + (c.id === 'transit' ? `<button class="tool" data-panel="lines" aria-pressed="${panel === 'lines'}"><span class="n">노선 관리</span><span class="p">${sim.w.lines.length}개 운행 중</span></button>` : '');
  renderDraft();
}

function renderDraft() {
  const el = $('draft');
  el.hidden = !draft;
  // Only touch the DOM when the text changes, so a press on 노선 완성 is never swallowed by a redraw.
  const html = draft ? draftHtml(sim.w, draft.kind, draft.stops) : '';
  if (html && html !== el.dataset.html) { el.innerHTML = html; el.dataset.html = html; }
  scene.draft = draft;
}

function finishDraft() {
  if (!draft) return;
  const err = createLine(sim.w, draft.kind, draft.stops);
  if (err) { toast(err, 'warn'); return; }
  draft = { kind: draft.kind, stops: [] };
  renderCats();
}

function setTool(t: ToolId) {
  tool = t;
  drag = null;
  scene.preview.clear();
  hideTip();
  const def = TOOLS[t];
  draft = def?.line ? { kind: def.line, stops: draft?.kind === def.line ? draft.stops : [] } : null;
  scene.transit.showRoutes = !!def?.line || scene.overlay === 'transit';
  scene.setZoneable(!!def && def.zone !== undefined && def.zone !== Zone.None);
  if (t !== 'select') closeInfo();
  renderCats();
}

$('dock').addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest('button');
  if (!el) return;
  if (el.dataset.cat) selectCategory(el.dataset.cat); else if (el.dataset.tool) setTool(el.dataset.tool as ToolId);
  else if (el.dataset.panel) openPanel(el.dataset.panel as PanelKind);
  else if (el.dataset.toggle === 'diag') toggleDiagonal();
  else if (el.dataset.draft && draft) {
    if (el.dataset.draft === 'undo') draft.stops.pop();
    if (el.dataset.draft === 'cancel') { cat = null; setTool('select'); return; }
    if (el.dataset.draft === 'done') finishDraft();
    renderDraft();
  }
});

function toggleDiagonal() {
  diagonal = !diagonal;
  renderCats();
  preview();
}

function selectCategory(id: string) {
  const c = CATEGORIES.find((k) => k.id === id);
  if (!c) return;
  if (cat === c.id) { cat = null; setTool('select'); return; }
  cat = c.id;
  setTool(c.tools[0].id);
}

/* -------------------------------------------------------------- speeds */

function setSpeed(s: number) {
  speed = s;
  document.querySelectorAll<HTMLButtonElement>('.speed button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === s)));
}
let lastSpeed = 1;
document.querySelector('.speed')!.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b) return;
  const s = Number(b.dataset.speed);
  if (s) lastSpeed = s;
  setSpeed(s);
});

/* -------------------------------------------------------------- panels */

type PanelKind = 'budget' | 'stats' | 'menu' | 'help' | 'lines';
let confirmLine: number | null = null;
let panel: PanelKind | null = null;
let panelStamp = '';
let infoCell: { x: number; y: number } | null = null;

function openPanel(k: PanelKind) {
  if (panel === k) { closePanel(); return; }
  panel = k;
  confirmLine = null;
  closeInfo();
  $('panel').hidden = false;
  $('panel').setAttribute('aria-label', { budget: '예산', stats: '도시 현황', menu: '메뉴', help: '조작법', lines: '노선 관리' }[k]);
  renderPanel(true);
  renderCats();
}
function closePanel() { const was = panel; panel = null; $('panel').hidden = true; if (was) renderCats(); }
function renderPanel(force = false) {
  if (!panel) return;
  const w = sim.w;
  // The budget sheet only rebuilds on a new month so sliders don't jump under the finger.
  const stamp = panel === 'budget' ? `${w.reports.length}:${w.tax.R}${w.tax.C}${w.tax.I}` : panel === 'stats' ? `${w.day}:${scene.overlay}` : panel === 'lines' ? `${w.ver.transit}:${w.reports.length}:${confirmLine}` : panel;
  if (!force && stamp === panelStamp) return;
  panelStamp = stamp;
  $('panel').innerHTML = panel === 'budget' ? budgetHtml(w) : panel === 'stats' ? statsHtml(w, scene.overlay) : panel === 'menu' ? menuHtml(w, scene.quality) : panel === 'lines' ? linesHtml(w, confirmLine) : HELP;
}
function openInfo(x: number, y: number) {
  infoCell = { x, y };
  closePanel();
  $('info').hidden = false;
  $('info').innerHTML = infoHtml(sim.w, x, y);
}
function closeInfo() { infoCell = null; $('info').hidden = true; }

$('menuBtn').addEventListener('click', () => openPanel('menu'));
for (const id of ['info', 'panel']) {
  const el = $(id);
  el.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('button');
    if (!t) return;
    if (t.dataset.close !== undefined) { if (id === 'info') closeInfo(); else closePanel(); }
    if (t.dataset.demolish) {
      bulldoze(sim.w, (() => { const b = sim.w.buildings.get(Number(t.dataset.demolish)); return b ? [idx(b.x, b.y)] : []; })());
      closeInfo();
    }
    if (t.dataset.ov) { scene.setOverlay(t.dataset.ov as Overlay); scene.transit.showRoutes = t.dataset.ov === 'transit' || !!draft; renderPanel(true); }
    if (t.dataset.removeLine) {
      const id = Number(t.dataset.removeLine);
      // Closing a line takes two presses: 폐선, then 폐선 확인.
      if (t.dataset.confirmed !== undefined) { removeLine(sim.w, id); confirmLine = null; } else confirmLine = id;
      renderPanel(true);
      renderCats();
    }
    if (t.dataset.act === 'save') toast(saveLocal(sim.w) ? '저장했어요.' : '저장하지 못했어요. (브라우저 저장소를 쓸 수 없어요)', 'good');
    if (t.dataset.act === 'load') { const w = loadLocal(); if (w) { useWorld(w); toast('불러왔어요.', 'good'); } else toast('저장된 도시가 없어요.', 'warn'); }
    if (t.dataset.act === 'new') { closePanel(); setSpeed(0); running = false; $('start').hidden = false; }
    if (t.dataset.act === 'help') openPanel('help');
    if (t.dataset.act === 'quality') {
      scene.setQuality(scene.quality === 'high' ? 'normal' : 'high');
      try { localStorage.setItem(QKEY, scene.quality); } catch { /* storage blocked */ }
      renderPanel(true);
    }
  });
  el.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (!t.dataset.tax) return;
    sim.w.tax[t.dataset.tax as 'R' | 'C' | 'I'] = Number(t.value);
    (t.nextElementSibling as HTMLElement).textContent = `${t.value}%`;
  });
  el.addEventListener('change', () => renderPanel(true));
}

/* ------------------------------------------------------------ tooltip */

const tip = $('tip');
function showTip(px: number, py: number, text: string, err = false) {
  tip.style.display = 'block';
  tip.style.left = `${px}px`;
  tip.style.top = `${py}px`;
  tip.textContent = text;
  tip.classList.toggle('err', err);
}
function hideTip() { tip.style.display = 'none'; }

/* -------------------------------------------------------------- input */

interface Drag { sx: number; sy: number; cx: number; cy: number; px: number; py: number; moved: boolean }
let drag: Drag | null = null;
const pointers = new Map<number, { x: number; y: number }>();
let gesture: { cx: number; cy: number; d: number; a: number } | null = null;
let camDrag: { mode: 'pan' | 'rot'; x: number; y: number; moved: boolean } | null = null;
let hover: { x: number; y: number; px: number; py: number } | null = null;

const won = (n: number) => `${n.toLocaleString('ko-KR')}만 원`;
const ZONE_COLOR: Record<number, string> = { [Zone.R]: '#4cc47c', [Zone.C]: '#3f7fd6', [Zone.I]: '#e3b04b' };

function footprintAt(def: ToolDef, x: number, y: number) {
  const s = KINDS[def.kind!].size;
  const off = Math.floor((s - 1) / 2);
  return { x: Math.max(0, Math.min(N - s, x - off)), y: Math.max(0, Math.min(N - s, y - off)), s };
}

/** Preview for the current tool at the hovered cell (and drag start, if any). */
function preview() {
  const def = TOOLS[tool];
  const w = sim.w;
  const p = scene.preview;
  if (!hover || tool === 'select' || !def) { p.clear(); hideTip(); return; }
  const a = drag ? { x: drag.sx, y: drag.sy } : hover;
  const b = hover;
  if (def.road !== undefined) {
    const cells = (diagonal ? diagonalPath : roadPath)(a.x, a.y, b.x, b.y);
    const cost = roadCost(w, cells, def.road);
    const hill = cells.some((i) => w.ground[i] === Ground.Mountain);
    const bad = hill || roadBlocked(w, cells) || cost > w.money;
    p.show(cells, bad ? '#ff5a5a' : def.road === Road.Avenue ? '#8fd0ff' : '#c6f0ff');
    showTip(b.px, b.py, hill ? '산은 터널로만 지날 수 있어요' : roadBlocked(w, cells) ? '시설과 겹쳐서 놓을 수 없어요' : cost > w.money ? `예산이 부족해요, ${won(cost)} 필요` : `${diagonal ? '대각선 ' : ''}${Math.round(cells.length * 10)}m, ${won(cost)}`, bad);
    return;
  }
  if (def.level) {
    // Drag from a road end to a road end: the trimmed ends become the ramps.
    const cells = altCells(w, roadPath(a.x, a.y, b.x, b.y));
    if (!drag) { p.show([idx(b.x, b.y)], '#c6f0ff'); showTip(b.px, b.py, `${LEVEL_NAME[def.level]}: 도로 끝에서 시작해 이을 도로까지 끌어 주세요`); return; }
    const why = altProblem(w, cells, def.level);
    p.show(cells, why ? '#ff5a5a' : def.level === Level.Elevated ? '#c6f0ff' : '#a4b0c4', def.level === Level.Elevated ? 3 : 0.6);
    showTip(b.px, b.py, why ?? `${LEVEL_NAME[def.level]} ${cells.length * 10}m, ${won(altCost(w, cells, def.level))}`, !!why);
    return;
  }
  if (def.zone !== undefined) {
    const cells = rectCells(a.x, a.y, b.x, b.y);
    if (def.zone === Zone.None) { p.show(cells.filter((i) => w.zone[i]), '#ffffff'); showTip(b.px, b.py, '구역 해제'); return; }
    const ok = cells.filter((i) => zoneable(w, i));
    p.show(ok, ZONE_COLOR[def.zone]);
    showTip(b.px, b.py, ok.length ? `${def.name} ${ok.length}칸` : '도로에서 3칸 안쪽만 칠할 수 있어요', !ok.length);
    return;
  }
  if (def.line && draft) {
    const i = idx(b.x, b.y);
    const why = stopProblem(w, def.line, i, draft.stops);
    p.show([i], why ? '#f0644f' : def.line === 'bus' ? '#2e9e4f' : '#263c96', def.line === 'bus' ? 0.6 : 3);
    p.ringAt((b.x + 0.5) * CELL, (b.y + 0.5) * CELL, why ? 0 : STOP_RADIUS[def.line] * CELL);
    showTip(b.px, b.py, why ?? (def.line === 'bus' ? `정류장 ${draft.stops.length + 1}번째로 추가` : `${draft.stops.length + 1}번째 역으로 추가`), !!why);
    return;
  }
  if (tool === 'bulldoze') {
    const cells = rectCells(a.x, a.y, b.x, b.y);
    const hit = cells.filter((i) => w.bld[i] >= 0);
    p.show(hit.length ? hit : cells.filter((i) => w.road[i]), '#ff5a5a');
    showTip(b.px, b.py, hit.length ? '건물 철거' : '도로 철거');
    return;
  }
  if (def.kind) {
    const f = footprintAt(def, b.x, b.y);
    const why = placeProblem(w, def.kind, f.x, f.y);
    p.show(rectCells(f.x, f.y, f.x + f.s - 1, f.y + f.s - 1), why ? '#ff5a5a' : '#7cf0a6', 3);
    const svc = SERVICE[def.kind];
    p.ringAt((f.x + f.s / 2) * CELL, (f.y + f.s / 2) * CELL, svc ? svc.radius * CELL : 0);
    showTip(b.px, b.py, why ?? `${def.name}, ${won(KINDS[def.kind].cost ?? 0)}, 유지비 월 ${won(KINDS[def.kind].upkeep ?? 0)}`, !!why);
  }
}

function commit() {
  const def = TOOLS[tool];
  if (!drag || !def) return;
  const w = sim.w;
  const a = { x: drag.sx, y: drag.sy }, b = { x: drag.cx, y: drag.cy };
  let err: string | null = null;
  if (def.road !== undefined) err = placeRoad(w, (diagonal ? diagonalPath : roadPath)(a.x, a.y, b.x, b.y), def.road);
  else if (def.level) err = placeAltRoad(w, roadPath(a.x, a.y, b.x, b.y), def.level);
  else if (def.zone !== undefined) {
    const n = paintZone(w, rectCells(a.x, a.y, b.x, b.y), def.zone);
    if (!n && def.zone !== Zone.None) err = '도로에서 3칸 안쪽 빈 땅에만 구역을 칠할 수 있어요.';
  } else if (tool === 'bulldoze') bulldoze(w, rectCells(a.x, a.y, b.x, b.y));
  else if (def.kind) { const f = footprintAt(def, b.x, b.y); err = placeFacility(w, def.kind, f.x, f.y); }
  else if (def.line && draft) {
    const i = idx(b.x, b.y);
    // Tapping the first stop again closes the loop and finishes the line.
    if (draft.stops.length >= 2 && i === draft.stops[0]) { finishDraft(); return; }
    err = stopProblem(w, def.line, i, draft.stops);
    if (!err) { draft.stops.push(i); renderDraft(); }
  }
  if (err) toast(err, 'warn');
}

function cellAt(px: number, py: number) { return scene.pick(px, py, canvas.getBoundingClientRect()); }

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    // Second finger: switch to camera gesture and drop any tool drag.
    drag = null; camDrag = null;
    scene.preview.clear(); hideTip();
    gesture = gestureState();
    return;
  }
  if (pointers.size > 2) return;
  if (e.button === 2) { camDrag = { mode: 'rot', x: e.clientX, y: e.clientY, moved: false }; return; }
  if (e.button === 1 || (tool === 'select' && e.button === 0)) { camDrag = { mode: 'pan', x: e.clientX, y: e.clientY, moved: false }; return; }
  const c = cellAt(e.clientX, e.clientY);
  if (!c) return;
  hover = { x: c.x, y: c.y, px: e.clientX, py: e.clientY };
  drag = { sx: c.x, sy: c.y, cx: c.x, cy: c.y, px: e.clientX, py: e.clientY, moved: false };
  // Facilities follow the finger until release; everything else anchors here.
  preview();
});

function gestureState() {
  const [a, b] = [...pointers.values()];
  return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x) };
}

canvas.addEventListener('pointermove', (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (gesture && pointers.size === 2) {
    const g = gestureState();
    scene.view.panPixels(g.cx - gesture.cx, g.cy - gesture.cy, window.innerHeight);
    if (gesture.d > 10 && g.d > 10) scene.view.zoom(gesture.d / g.d);
    let da = g.a - gesture.a;
    if (da > Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    scene.view.rotate(-da, 0);
    gesture = g;
    return;
  }
  if (camDrag) {
    const dx = e.clientX - camDrag.x, dy = e.clientY - camDrag.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) camDrag.moved = true;
    if (camDrag.mode === 'pan') scene.view.panPixels(dx, dy, window.innerHeight);
    else scene.view.rotate(-dx * 0.006, dy * 0.004);
    camDrag.x = e.clientX; camDrag.y = e.clientY;
    return;
  }
  const c = cellAt(e.clientX, e.clientY);
  if (!c) { hover = null; preview(); return; }
  hover = { x: c.x, y: c.y, px: e.clientX, py: e.clientY };
  if (drag) {
    if (c.x !== drag.cx || c.y !== drag.cy) drag.moved = true;
    drag.cx = c.x; drag.cy = c.y;
    // Facilities: the whole drag only moves the ghost.
    if (TOOLS[tool]?.kind) { drag.sx = c.x; drag.sy = c.y; }
  }
  if (e.pointerType === 'mouse' || drag) preview();
});

function endPointer(e: PointerEvent) {
  pointers.delete(e.pointerId);
  if (gesture) { if (pointers.size < 2) gesture = null; return; }
  if (camDrag) {
    const was = camDrag;
    camDrag = null;
    if (!was.moved) {
      if (was.mode === 'rot' && tool !== 'select') { cat = null; setTool('select'); }
      else if (was.mode === 'pan' && tool === 'select' && e.button === 0) {
        const c = cellAt(e.clientX, e.clientY);
        if (c) openInfo(c.x, c.y);
      }
    }
    return;
  }
  if (drag && e.type === 'pointerup') commit();
  drag = null;
  if (e.pointerType !== 'mouse') { hover = null; scene.preview.clear(); hideTip(); } else preview();
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !drag) { hover = null; preview(); } });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); scene.view.zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });

window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === 'escape') { cat = null; setTool('select'); closeInfo(); closePanel(); return; }
  if (!running) return;
  if (draft && k === 'enter') { finishDraft(); return; }
  if (draft && k === 'backspace') { draft.stops.pop(); renderDraft(); return; }
  if (k === 't') { toggleDiagonal(); return; }
  const hot = CATEGORIES.find((c) => c.key.toLowerCase() === k);
  if (hot && !e.ctrlKey && !e.metaKey) { selectCategory(hot.id); return; }
  if (k === ' ') { e.preventDefault(); setSpeed(speed ? 0 : lastSpeed); return; }
  if (k === '1' || k === '2' || k === '3') { lastSpeed = k === '3' ? 4 : Number(k); setSpeed(lastSpeed); return; }
  scene.view.keys.add(k);
});
window.addEventListener('keyup', (e) => scene.view.keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => scene.view.keys.clear());

/* --------------------------------------------------------------- start */

function useWorld(w: ReturnType<typeof createWorld>) {
  sim = createSim(w);
  scene.setSim(sim);
  resetToasts(w);
  closeInfo(); closePanel();
  focusStart();
}

const saved = loadLocal();
if (saved) $('loadBtn').hidden = false;
$('newBtn').addEventListener('click', () => {
  const name = ($<HTMLInputElement>('nameInput').value.trim() || '새솔시').slice(0, 10);
  useWorld(createWorld((Math.random() * 1e9) | 0, name));
  begin();
  toast(`${name}에 오신 걸 환영해요, 시장님! 왼쪽 위 목표를 따라가 보세요.`, 'good');
});
$('loadBtn').addEventListener('click', () => {
  const w = loadLocal();
  if (w) useWorld(w);
  begin();
});
function begin() {
  $('start').hidden = true;
  running = true;
  setSpeed(1);
  scene.view.zoom((window.innerWidth < 640 ? 380 : 260) / scene.view.dist);
}
$('goalFold').addEventListener('click', () => {
  const g = $('goal');
  const fold = g.classList.toggle('fold');
  $('goalFold').textContent = fold ? '펼치기' : '접기';
  $('goalFold').setAttribute('aria-expanded', String(!fold));
});

/* ---------------------------------------------------------------- loop */

renderCats();
let last = performance.now();
let hudTimer = 0;
let saveDay = 0;
function frame(t: number) {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  if (running) tick(sim, dt, speed);
  else scene.view.rotate(dt * 0.05, 0);
  scene.frame(dt, t / 1000);
  hudTimer -= dt;
  if (hudTimer <= 0) {
    hudTimer = 0.25;
    const w = sim.w;
    updateTop(w);
    updateGoal(w);
    if (running) pumpToasts(w);
    if (infoCell) $('info').innerHTML = infoHtml(w, infoCell.x, infoCell.y);
    if (draft && draft.stops.length >= 2) renderDraft();
    renderPanel();
    // Autosave at the start of every month.
    if (running && w.day >= saveDay + 30) { saveDay = w.day; saveLocal(w); }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Debug/test hook.
(window as unknown as { city: unknown }).city = { get sim() { return sim; }, scene, setTool, setSpeed };
