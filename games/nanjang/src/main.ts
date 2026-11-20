import '../../city/src/tokens.css';
import '../../city/src/base.css';
import './style.css';
import { type Combat, setup } from './sim/combat';
import {
  autoFill, boardCap, boardTraits, buy, buyXp, clearSave, interest, isCreepRound, load, type Match, move, newGame,
  owned, type Game, type Player, playRound, reroll, roundName, save, sell,
} from './sim/game';
import { BY_ID, ODDS, sellValue, TIER_COST, TRAITS, type Trait, XP_NEXT } from './sim/units';
import { Table, type DropTarget } from './render/scene';
import { TIER_COLOR } from './render/pieces';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const table = new Table($('view') as HTMLCanvasElement, $('labels'));

let g: Game | null = null;
let mode: 'prep' | 'fight' | 'menu' = 'menu';
const me = () => g!.players[0];

/* ------------------------------------------------------------ toast */

let toastT = 0;
function toast(text: string, tone: 'warn' | 'good' | '' = '') {
  const el = $('toast');
  el.textContent = text;
  el.className = `toast show ${tone}`;
  clearTimeout(toastT);
  toastT = window.setTimeout(() => el.classList.remove('show'), 2600);
}

/* ------------------------------------------------------------ render */

const traitChip = (t: Trait) => `<span class="chip ${TRAITS[t].kind}">${TRAITS[t].name}</span>`;

function renderTop() {
  const p = me();
  $('round').textContent = `${g!.round}라운드 · ${roundName(g!.round)}`;
  $('hp').textContent = `${Math.max(0, p.hp)}`;
  $('gold').textContent = `${p.gold}`;
  $('interest').textContent = `이자 +${interest(p.gold)}`;
  $('level').textContent = `${p.level}`;
  const need = XP_NEXT[p.level];
  $('xp').textContent = p.level >= 9 ? '최고' : `${p.xp}/${need}`;
  $('xpbar').style.width = p.level >= 9 ? '100%' : `${(p.xp / need) * 100}%`;
}

function renderShop() {
  const p = me();
  $('shop').innerHTML = p.shop.map((id, i) => {
    if (!id) return '<div class="card empty" role="listitem"></div>';
    const d = BY_ID[id], cost = TIER_COST[d.tier];
    const have = owned(p).filter((o) => o.piece.id === id && o.piece.star === 1).length;
    return `<button class="card t${d.tier}${p.gold < cost ? ' poor' : ''}${have >= 2 ? ' pair' : have ? ' one' : ''}" data-slot="${i}" role="listitem" style="--tier:${TIER_COLOR[d.tier]}">
      <span class="c-name">${d.name}</span>
      <span class="c-traits">${d.traits.map(traitChip).join('')}</span>
      <span class="c-cost num">${cost}냥</span>
      ${have ? `<span class="c-have" title="가진 수">${have >= 2 ? '셋째면 ★★' : '하나 있음'}</span>` : ''}
    </button>`;
  }).join('');
  const o = ODDS[p.level];
  $('odds').innerHTML = o.map((v, i) => (v ? `<span style="--tier:${TIER_COLOR[i + 1]}"><i></i>${i + 1}냥 ${v}%</span>` : '')).join('');
  $('lockBtn').setAttribute('aria-pressed', String(p.locked));
  $('lockBtn').textContent = p.locked ? '잠김' : '잠금';
  ($('xpBtn') as HTMLButtonElement).disabled = p.level >= 9 || p.gold < 4;
  ($('rerollBtn') as HTMLButtonElement).disabled = p.gold < 2;
}

function renderTraits(p: Player) {
  const tr = boardTraits(p);
  $('traits').innerHTML = tr.length ? tr.map((t) => {
    const d = TRAITS[t.trait];
    const steps = d.steps.map((s, i) => `<b class="${t.step > i ? 'on' : ''}">${s}</b>`).join('<span>›</span>');
    return `<button class="trait ${t.step ? 'active' : ''} ${d.kind}" data-trait="${t.trait}"><span class="t-n num">${t.n}</span><span class="t-name">${d.name}</span><span class="t-steps">${steps}</span></button>`;
  }).join('') : '<p class="t-empty">판에 말을 올리면 시너지가 보여요.</p>';
}

function renderPlayers(hpOf?: (p: Player) => number, highlight = -1) {
  const list = g!.players.slice().sort((a, b) => (b.alive ? 1 : 0) - (a.alive ? 1 : 0) || (hpOf ? hpOf(b) - hpOf(a) : b.hp - a.hp) || a.place - b.place);
  $('players').innerHTML = list.map((p) => {
    const hp = Math.max(0, hpOf ? hpOf(p) : p.hp);
    return `<div class="pl${p.idx === 0 ? ' me' : ''}${p.alive || (hpOf && hp > 0) ? '' : ' out'}${p.idx === highlight ? ' vs' : ''}">
      <span class="pl-name">${p.idx === 0 ? '나' : p.name}</span>
      <i class="pl-bar"><b style="width:${hp}%"></b></i>
      <span class="pl-hp num">${p.alive || (hpOf && hp > 0) ? hp : `${p.place}등`}</span>
    </div>`;
  }).join('');
}

function renderCap() {
  const p = me();
  const n = p.board.length, cap = boardCap(p);
  const bench = p.bench.filter(Boolean).length;
  $('cap').innerHTML = `판 <b class="num ${n < cap && bench ? 'short' : ''}">${n}/${cap}</b>`;
}

function renderAll() {
  if (!g) return;
  renderTop(); renderShop(); renderTraits(me()); renderPlayers(); renderCap();
  if (mode === 'prep') table.showPrep(me(), drag?.uid ?? -1);
}

/* -------------------------------------------------------------- info */

function showInfo(id: string, star: number, at: { x: number; y: number } | null, uid?: number, peek = false) {
  const d = BY_ID[id], el = $('info');
  el.classList.toggle('peek', peek);
  const m = [0, 1, 1.8, 3.24][star];
  const stat = (k: string, v: string) => `<div><dt>${k}</dt><dd class="num">${v}</dd></div>`;
  el.innerHTML = `
    <div class="i-head" style="--tier:${TIER_COLOR[d.tier]}"><b>${d.name}</b><span class="stars s${star}">${'★'.repeat(star)}</span><span class="i-cost">${TIER_COST[d.tier]}냥</span></div>
    <div class="i-traits">${d.traits.map((t) => `<span class="chip ${TRAITS[t].kind}">${TRAITS[t].name}</span><small>${TRAITS[t].text}</small>`).join('')}</div>
    <dl class="i-stats">${stat('체력', `${Math.round(d.hp * m)}`)}${stat('공격력', `${Math.round(d.ad * m)}`)}${stat('공격 속도', d.as.toFixed(2))}${stat('사거리', d.range > 1 ? `${d.range}칸` : '근접')}${stat('방어', `${d.armor}`)}${stat('마나', `${d.manaStart}/${d.mana}`)}</dl>
    <p class="i-skill"><b>기술</b> ${d.skillText}</p>
    ${uid !== undefined && mode === 'prep' ? `<button class="btn small sell" data-sell="${uid}">팔기 +${sellValue(id, star)}냥</button>` : ''}`;
  el.hidden = false;
  if (at) {
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, at.x - w / 2))}px`;
    el.style.top = `${Math.max(70, Math.min(window.innerHeight - h - 8, at.y - h - 16))}px`;
  } else { el.style.left = ''; el.style.top = ''; }
}
const hideInfo = () => { $('info').hidden = true; };

$('info').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-sell]') as HTMLElement | null;
  if (!b || !g) return;
  const uid = +b.dataset.sell!;
  const piece = owned(me()).find((o) => o.piece.uid === uid)?.piece;
  sell(g, me(), uid);
  if (piece) toast(`${BY_ID[piece.id].name}을(를) 팔았어요. +${sellValue(piece.id, piece.star)}냥`, 'good');
  hideInfo(); renderAll();
});

/* ------------------------------------------------------------- shop */

$('shop').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-slot]') as HTMLElement | null;
  if (!b || !g || mode !== 'prep') return;
  const slot = +b.dataset.slot!, id = me().shop[slot]!;
  const before = owned(me()).map((o) => `${o.piece.uid}:${o.piece.star}`).join();
  const err = buy(g, me(), slot);
  if (err) { toast(err, 'warn'); return; }
  const up = owned(me()).find((o) => o.piece.id === id && o.piece.star > 1 && !before.includes(`${o.piece.uid}:${o.piece.star}`));
  if (up) toast(`${BY_ID[id].name} 셋이 모여 ${'★'.repeat(up.piece.star)}이 됐어요!`, 'good');
  renderAll();
});
$('shop').addEventListener('contextmenu', (e) => {
  const b = (e.target as HTMLElement).closest('[data-slot]') as HTMLElement | null;
  if (!b || !g) return;
  e.preventDefault();
  const r = b.getBoundingClientRect();
  showInfo(me().shop[+b.dataset.slot!]!, 1, { x: r.left + r.width / 2, y: r.top });
});
// Hover a card for its details (on a mouse); a tap buys.
$('shop').addEventListener('pointerover', (e) => {
  if (e.pointerType !== 'mouse') return;
  const b = (e.target as HTMLElement).closest('[data-slot]') as HTMLElement | null;
  if (!b || !g) return;
  const r = b.getBoundingClientRect();
  showInfo(me().shop[+b.dataset.slot!]!, 1, { x: r.left + r.width / 2, y: r.top }, undefined, true);
});
$('shop').addEventListener('pointerout', (e) => { if (!(e.relatedTarget as HTMLElement | null)?.closest?.('[data-slot]') && $('info').classList.contains('peek')) hideInfo(); });

$('xpBtn').addEventListener('click', () => { const lv = me().level; const err = buyXp(g!, me()); if (err) toast(err, 'warn'); else if (me().level > lv) toast(`레벨 ${me().level}! 판에 ${me().level}개까지 올릴 수 있어요.`, 'good'); renderAll(); });
$('rerollBtn').addEventListener('click', () => { const err = reroll(g!, me()); if (err) toast(err, 'warn'); renderAll(); });
$('lockBtn').addEventListener('click', () => { me().locked = !me().locked; renderShop(); toast(me().locked ? '다음 라운드에도 지금 장터가 그대로 나와요.' : '잠금을 풀었어요.'); });

$('players').addEventListener('click', () => $('players').classList.toggle('open'));
$('traits').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-trait]') as HTMLElement | null;
  if (!b) return;
  const t = TRAITS[b.dataset.trait as Trait];
  toast(`${t.name} (${t.steps.join(' / ')}): ${t.text} ${t.levels.map((l, i) => `${t.steps[i]}개: ${l}`).join(', ')}`);
});

/* --------------------------------------------------------- dragging */

let drag: { uid: number; x0: number; y0: number; moved: boolean; id: string; star: number } | null = null;
const canvas = $('view');

canvas.addEventListener('pointerdown', (e) => {
  if (mode !== 'prep' || !g) return;
  hideInfo();
  const uid = table.pick(e.clientX, e.clientY);
  if (uid === null) return;
  const piece = owned(me()).find((o) => o.piece.uid === uid)?.piece;
  if (!piece) return;
  drag = { uid, x0: e.clientX, y0: e.clientY, moved: false, id: piece.id, star: piece.star };
  canvas.setPointerCapture(e.pointerId);
});

const overShop = (x: number, y: number) => { const r = $('shopbar').getBoundingClientRect(); return y >= r.top && x >= r.left && x <= r.right; };

canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
  drag.moved = true;
  document.body.classList.add('dragging');
  const sellNow = overShop(e.clientX, e.clientY);
  $('shopbar').classList.toggle('selling', sellNow);
  $('sellPrice').textContent = `+${sellValue(drag.id, drag.star)}냥`;
  const p = table.ground(e.clientX, e.clientY);
  if (p) table.dragTo(drag.uid, p.x, p.z);
  table.highlight(sellNow ? null : table.targetAt(p));
});

function endDrag(e: PointerEvent) {
  if (!drag || !g) return;
  const d = drag;
  drag = null;
  document.body.classList.remove('dragging');
  $('shopbar').classList.remove('selling');
  table.highlight(null);
  if (!d.moved) {
    showInfo(d.id, d.star, table.screenOf(d.uid), d.uid);
    return;
  }
  if (overShop(e.clientX, e.clientY)) {
    sell(g, me(), d.uid);
    toast(`${BY_ID[d.id].name}을(를) 팔았어요. +${sellValue(d.id, d.star)}냥`, 'good');
  } else {
    const t: DropTarget = table.targetAt(table.ground(e.clientX, e.clientY));
    if (t) { const err = move(me(), d.uid, t); if (err) toast(err, 'warn'); }
  }
  renderAll();
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

/* ------------------------------------------------------------ fights */

let pending: { matches: Match[]; mine: Match | null; hpBefore: Map<number, number> } | null = null;
let fightCombat: Combat | null = null;

$('fightBtn').addEventListener('click', () => {
  if (!g || mode !== 'prep') return;
  const p = me();
  const filled = autoFill(p);
  if (filled) toast(`빈자리에 대기석 말 ${filled}개를 올렸어요.`);
  if (!p.board.length) { toast('판에 말이 하나도 없어요. 대기석의 말을 끌어 올리세요.', 'warn'); return; }
  const hpBefore = new Map(g.players.map((q) => [q.idx, q.hp]));
  const matches = playRound(g);
  const mine = matches.find((m) => m.a === 0 || m.b === 0) ?? null;
  pending = { matches, mine, hpBefore };
  if (!mine) { afterFight(); return; }
  mode = 'fight';
  hideInfo();
  document.body.classList.add('fighting');
  $('shopbar').hidden = true; $('fightbar').hidden = false;
  const flip = mine.b === 0;
  const oppIdx = mine.creeps ? -1 : flip ? mine.a : mine.b;
  $('versus').innerHTML = mine.creeps ? `<b>산짐승</b><span>이기면 말 하나와 엽전을 얻어요</span>` : `<b>${g.players[oppIdx].name}</b><span>${mine.ghost ? '(그림자 상대: 이 판의 승패는 나만 받아요)' : `체력 ${hpBefore.get(oppIdx)}`}</span>`;
  renderPlayers((q) => hpBefore.get(q.idx)!, oppIdx);
  // The traits on show are the player's own for this fight.
  fightCombat = setup(mine.aTeam, mine.bTeam, mine.seed);
  table.onFightEnd = () => afterFight();
  table.startFight(fightCombat, flip);
});

$('speedBtn').addEventListener('click', () => {
  table.speed = table.speed > 2 ? 1.5 : 3;
  $('speedBtn').textContent = table.speed > 2 ? '보통 빠르기' : '빠르게';
});
$('skipBtn').addEventListener('click', () => table.finishNow());

function afterFight() {
  if (!g || !pending) return;
  const { mine, hpBefore } = pending;
  pending = null;
  table.onFightEnd = null;
  const p = me();
  if (mine) {
    const meSide = mine.a === 0 ? 0 : 1;
    const won = mine.outcome.winner === meSide, draw = mine.outcome.winner === -1;
    const lost = (hpBefore.get(0) ?? 0) - p.hp;
    banner(won ? (mine.creeps ? '산짐승을 물리쳤어요' : '이겼어요!') : draw ? '비겼어요' : '졌어요',
      won ? (mine.creeps ? '엽전과 말을 얻었어요' : '+1냥, 연승 중이면 더 받아요') : `체력 -${lost}`, won ? 'win' : 'lose');
  }
  setTimeout(() => {
    $('banner').hidden = true;
    document.body.classList.remove('fighting');
    $('fightbar').hidden = true; $('shopbar').hidden = false;
    if (!p.alive || g!.over) { finish(); return; }
    mode = 'prep';
    table.clearPieces();
    save(g!);
    renderAll();
    if (isCreepRound(g!.round)) toast(`${g!.round}라운드는 산짐승과 싸워요.`);
  }, mine ? 1700 : 0);
}

function banner(title: string, sub: string, tone: string) {
  const el = $('banner');
  el.innerHTML = `<b>${title}</b><span>${sub}</span>`;
  el.className = `banner ${tone}`;
  el.hidden = false;
}

function finish() {
  const p = me();
  mode = 'menu';
  clearSave();
  const place = p.alive ? 1 : p.place;
  $('endKicker').textContent = place === 1 ? '난장의 주인' : '난장이 끝났어요';
  $('endTitle').textContent = `${place}등`;
  const winner = g!.players.find((q) => q.place === 1);
  $('endText').textContent = place === 1 ? `${g!.round}라운드 만에 일곱 상대를 모두 물리쳤어요.` : `${g!.round}라운드에서 떨어졌어요.${winner ? ` 1등은 ${winner.name}이에요.` : ''} 다음 판에는 같은 갈래를 더 모아 보세요.`;
  $('end').hidden = false;
}

/* ------------------------------------------------------------ start */

function begin(game: Game) {
  g = game;
  mode = 'prep';
  table.clearPieces();
  $('start').hidden = true; $('end').hidden = true;
  renderAll();
  save(g);
}

$('newBtn').addEventListener('click', () => { begin(newGame((Math.random() * 2 ** 31) | 0)); toast('대기석의 말을 끌어서 판에 올려 보세요.'); });
$('contBtn').addEventListener('click', () => { const s = load(); if (s) begin(s); });
$('againBtn').addEventListener('click', () => begin(newGame((Math.random() * 2 ** 31) | 0)));
$('helpBtn').addEventListener('click', () => { $('help').hidden = false; });
$('howBtn').addEventListener('click', () => { $('help').hidden = false; });
$('helpClose').addEventListener('click', () => { $('help').hidden = true; });
if (load()) $('contBtn').hidden = false;

// Keyboard: D buys XP, F rerolls, Space fights.
window.addEventListener('keydown', (e) => {
  if (mode !== 'prep' || e.target instanceof HTMLInputElement) return;
  if (e.key === 'd' || e.key === 'D') $('xpBtn').click();
  else if (e.key === 'f' || e.key === 'F') $('rerollBtn').click();
  else if (e.key === ' ') { e.preventDefault(); $('fightBtn').click(); }
  else if (e.key === 'Escape') hideInfo();
});

/** Keep the table clear of the bars at the top and bottom. */
function fitTable() {
  let top = document.querySelector('.top')!.getBoundingClientRect().bottom + 4;
  // On a phone the synergy row sits under the top bar.
  if (window.innerWidth <= 600) top = Math.max(top, $('traits').getBoundingClientRect().bottom + 2);
  const bar = !$('shopbar').hidden ? $('shopbar') : !$('fightbar').hidden ? $('fightbar') : null;
  const bottom = bar ? window.innerHeight - bar.getBoundingClientRect().top + 30 : 10;
  table.setInsets(top, bottom);
  $('cap').style.bottom = `${bottom - 24}px`;
}
new ResizeObserver(fitTable).observe(document.body);

let last = performance.now();
function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fitTable();
  table.frame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// For checks in a headless browser.
(window as unknown as { nanjang: unknown }).nanjang = { get game() { return g; }, table };
