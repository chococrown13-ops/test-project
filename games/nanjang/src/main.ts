import '../../city/src/tokens.css';
import '../../city/src/base.css';
import './style.css';
import { ARENAS, SEASON_NAME } from './sim/arena';
import { type Combat, setup, skillNumbers } from './sim/combat';
import {
  autoFill, boardCap, boardTraits, buy, buyXp, clearSave, equip, findPiece, interest, isCreepRound, ITEM_SLOTS, load, type Match, move, newGame,
  nextRound, owned, type Game, type Player, playRound, reroll, roundName, save, sell, settleRound,
} from './sim/game';
import { BY_ID, itemDef, nameAt, ODDS, SKILL_MUL, STAR_MUL, UNITS, sellValue, theme, type Theme, TIER_COST, TRAITS, type Trait, XP_NEXT } from './sim/units';
import { Bgm } from './audio/bgm';
import { addRecord, records, type GameRecord } from './records';
import { THEMES, themeById, useTheme } from './themes';
import { BENCH_KEY, Table, type DropTarget } from './render/scene';
import { type PieceStyle, pieceStyle, setPieceStyle, STYLE_NAME, TIER_COLOR } from './render/pieces';
import { portrait } from './render/thumbs';
import type { Fighter } from './sim/combat';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
/** The game's name (the themes are tables it can be played on). */
const GAME_NAME = '셋모아 쑥쑥';
const table = new Table($('view') as HTMLCanvasElement, $('labels'));

let g: Game | null = null;
let mode: 'prep' | 'fight' | 'menu' = 'menu';
const me = () => g!.players[0];

/** The right particle after a Korean word: 이/가, 을/를, 은/는 by whether it ends in a consonant. */
function josa(word: string, withBatchim: string, without: string) {
  const c = word.charCodeAt(word.length - 1);
  const has = c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0;
  return word + (has ? withBatchim : without);
}

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

const faces = () => theme().faces !== false;
const pic = (id: string, cls = 'pic', star = 1) => `<img class="${cls}" src="${portrait(id, faces(), star)}" alt="" draggable="false">`;
const itemWord = () => theme().itemWord ?? '재료';
const mixWord = () => theme().mixWord ?? '양념';
const traitChip = (t: Trait) => `<span class="chip ${TRAITS[t].kind}">${TRAITS[t].name}</span>`;

/** How each of my past rounds went, for the track at the top (kept for this session). */
const history: Record<number, 'w' | 'l' | 'd'> = {};
function renderTrack() {
  const G = g!, from = Math.max(1, G.round - 3);
  let h = '';
  for (let r = from; r < from + 8; r++) {
    const creep = isCreepRound(r), res = history[r];
    const cls = r === G.round ? 'now' : res ? res : r < G.round ? 'past' : 'next';
    h += `<li class="pip ${cls}${creep ? ' creep' : ''}" title="${r}라운드 · ${creep ? theme().creepName : '대결'}${res ? ` · ${res === 'w' ? '승' : res === 'l' ? '패' : '무'}` : ''}"><span>${creep ? '◆' : r}</span></li>`;
  }
  $('track').innerHTML = h;
}

function renderTop() {
  renderTrack();
  const p = me();
  $('round').textContent = `${g!.season >= 0 ? `${SEASON_NAME[g!.season]} · ` : ''}${g!.round}라운드 · ${roundName(g!.round)}`;
  $('arenaChip').textContent = ARENAS[g!.arena].name;
  $('hp').textContent = `${Math.max(0, p.hp)}`;
  $('gold').textContent = `${p.gold}`;
  const st = $('streak');
  st.textContent = Math.abs(p.streak) >= 2 ? `${Math.abs(p.streak)}${p.streak > 0 ? '연승' : '연패'}` : '';
  st.className = `streak ${p.streak > 0 ? 'win' : 'lose'}`;
  $('interest').textContent = `이자 +${interest(p.gold)}`;
  $('interest').title = '10냥마다 1냥씩, 최대 5냥';
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
    const lit = hiTrait ? (d.traits.includes(hiTrait) ? ' hi' : ' lo') : '';
    // A card like the usual auto-battler shop: the piece large, traits down the side, name and price on a strip.
    return `<button class="card t${d.tier}${p.gold < cost ? ' poor' : ''}${have >= 2 ? ' pair' : have ? ' one' : ''}${lit}" data-shop="${i}" role="listitem" style="--tier:${TIER_COLOR[d.tier]}">
      ${pic(id, 'c-img')}
      <span class="c-traits">${d.traits.map(traitChip).join('')}</span>
      ${have ? `<span class="c-have" title="가진 수">${have >= 2 ? '★★ 완성' : `${have}/3`}</span>` : ''}
      <span class="c-foot"><span class="c-name">${d.name}</span><span class="c-cost num"><i class="ico coin" aria-hidden="true"></i>${cost}</span></span>
    </button>`;
  }).join('');
  const o = ODDS[p.level];
  $('odds').innerHTML = o.map((v, i) => `<span class="${v ? '' : 'zero'}" style="--tier:${TIER_COLOR[i + 1]}"><i></i>${v}%</span>`).join('');
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
    const ripe = d.season !== undefined && d.season === g!.season;
    // Badge colour by how far the trait has gone: bronze, silver, gold at the top step.
    const tierCls = !t.step ? 'b0' : t.step === d.steps.length ? 'gold' : t.step === 1 ? 'bronze' : 'silver';
    return `<button class="trait ${t.step ? 'active' : ''} ${d.kind} ${tierCls}${ripe ? ' ripe' : ''}" data-trait="${t.trait}"><span class="t-badge"><b>${d.name.slice(0, 1)}</b></span><span class="t-name">${d.name} <u class="num">${t.n}</u>${ripe ? ' <em>제철 ×2</em>' : ''}</span><span class="t-steps">${steps}</span></button>`;
  }).join('') : '<p class="t-empty">판에 말을 올리면 시너지가 보여요.</p>';
}

function renderPlayers(hpOf?: (p: Player) => number, highlight = -1) {
  const list = g!.players.slice().sort((a, b) => (b.alive ? 1 : 0) - (a.alive ? 1 : 0) || (hpOf ? hpOf(b) - hpOf(a) : b.hp - a.hp) || a.place - b.place);
  $('players').innerHTML = list.map((p) => {
    const hp = Math.max(0, hpOf ? hpOf(p) : p.hp);
    const hue = (p.idx * 47 + 10) % 360;
    return `<div class="pl${p.idx === 0 ? ' me' : ''}${p.alive || (hpOf && hp > 0) ? '' : ' out'}${p.idx === highlight ? ' vs' : ''}">
      <span class="pl-av" style="--h:${hue}">${(p.idx === 0 ? '나' : p.name).slice(0, 1)}</span>
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

/** 한식 대전: the ingredients waiting to go on a piece. Tap one, then tap a piece. */
let armed = -1;
function renderTray() {
  const el = $('tray'), p = me();
  el.hidden = !theme().items || mode !== 'prep';
  if (el.hidden) return;
  el.innerHTML = `<span class="tray-h">${itemWord()}</span>${p.items.length ? p.items.map((id, k) => {
    const d = itemDef(id);
    return `<button class="ing${k === armed ? ' armed' : ''}" data-item="${k}" style="--c:${d.color}" title="${d.text}"><i></i>${d.name}</button>`;
  }).join('') : `<span class="tray-empty">${theme().creepName} 라운드에서 이기면 ${josa(itemWord(), '이', '가')} 생겨요</span>`}`;
}

function renderAll() {
  if (!g) return;
  table.setArena(g.arena);
  renderTop(); renderShop(); renderTraits(me()); renderPlayers(undefined, mode === 'fight' ? fightOpp : -1); renderCap(); renderTray();
  if (mode === 'fight') table.showBench(me(), drag?.key ?? -1);
  if (mode === 'prep') table.showPrep(me(), drag?.key ?? -1);
  if (hiTrait) lightTrait(hiTrait, document.querySelector<HTMLElement>(`#traits [data-trait="${hiTrait}"]`) ?? undefined);
}

/* -------------------------------------------------------------- info */

/** The numbers of a piece as it would fight now: traits on the board, items, stars (or, in a fight, as it is). */
function fighterFor(uid: number | undefined): Fighter | null {
  if (uid === undefined || !g) return null;
  const p = me(), ctx = { arena: g.arena, season: g.season };
  const bi = p.board.findIndex((u) => u.uid === uid);
  if (bi >= 0) return setup(p.board.map((u) => ({ id: u.id, star: u.star, c: u.c, r: u.r, items: u.items })), [], 0, ctx).f[bi] ?? null;
  const piece = findPiece(p, uid);
  return piece ? setup([{ id: piece.id, star: piece.star, c: 0, r: 0, items: piece.items }], [], 0, ctx).f[0] : null;
}

function showInfo(id: string, star: number, at: { x: number; y: number } | null, uid?: number, peek = false, live?: Fighter) {
  const d = BY_ID[id], el = $('info');
  const creep = !d.traits.length;
  el.classList.toggle('peek', peek);
  const m = STAR_MUL[star];
  const f = live ?? fighterFor(uid);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const stat = (k: string, v: string, tip = '', up = false) => `<div${tip ? ` title="${tip}"` : ''}><dt>${k}</dt><dd class="num${up ? ' up' : ''}">${v}</dd></div>`;
  // Base numbers, or the piece's real ones with what its traits and items add (marked up).
  const hp = f ? f.maxHp : d.hp * m, ad = f ? f.ad : d.ad * m, as = f ? f.as * (1 + f.asBuff) : d.as;
  const armor = f ? f.armor : d.armor, mr = f ? f.mr : d.mr, power = f ? f.skillMul : SKILL_MUL[star];
  const cut = (v: number) => pct(v / (100 + v));
  const extra: string[] = [];
  if (f?.regen) extra.push(stat('체력 회복', `초당 ${Math.round(f.maxHp * f.regen)}`, '싸우는 동안 매초 되찾는 체력', true));
  if (f?.dodge) extra.push(stat('회피', pct(f.dodge), '평타를 피할 확률', true));
  if (f?.crit) extra.push(stat('치명타', pct(f.crit), '평타가 두 배로 들어갈 확률', true));
  if (f?.double) extra.push(stat('연타', pct(f.double), '평타를 한 번 더 칠 확률', true));
  if (f?.lifesteal) extra.push(stat('흡혈', pct(f.lifesteal), '준 피해만큼 체력을 되찾는 비율', true));
  if (f?.manaRegen) extra.push(stat('마나 회복', `초당 ${f.manaRegen}`, '', true));
  const nums = creep ? '' : skillNumbers(d.skill, power, star);
  const name = nameAt(d, star);
  el.innerHTML = `
    <div class="i-head" style="--tier:${TIER_COLOR[d.tier]}">${pic(id, 'pic', star)}<div><b>${name}</b><span class="stars s${star}">${'★'.repeat(star)}</span>${live ? `<span class="i-side ${live.side === (flipView ? 1 : 0) ? 'mine' : 'theirs'}">${live.side === (flipView ? 1 : 0) ? '우리 편' : '상대 편'}</span>` : ''}</div><span class="i-cost">${creep ? theme().creepName : `${TIER_COST[d.tier]}냥`}</span></div>
    ${d.evo ? `<div class="i-evo">${[d.name, d.evo[0].name, d.evo[1].name].map((n, i) => `<span class="${i + 1 === star ? 'on' : ''}">${n}</span>`).join('<i>›</i>')}</div>` : ''}
    ${live ? `<div class="i-live"><span>체력 <b class="num">${Math.max(0, Math.round(live.hp))}</b>/${Math.round(live.maxHp)}</span>${live.shield > 1 ? `<span>보호막 <b class="num">${Math.round(live.shield)}</b></span>` : ''}<span>마나 <b class="num">${Math.round(live.mana)}</b>/${live.maxMana > 500 ? '-' : live.maxMana}</span><span>준 피해 <b class="num">${Math.round(live.dealt)}</b></span>${live.alive ? '' : '<span class="dead">쓰러짐</span>'}</div>` : ''}
    <div class="i-traits">${d.traits.map((t) => `<span class="chip ${TRAITS[t].kind}">${TRAITS[t].name}</span><small>${TRAITS[t].text}</small>`).join('')}</div>
    <dl class="i-stats">
      ${stat('체력', `${Math.round(hp)}`, '', !!f && Math.round(hp) > Math.round(d.hp * m))}
      ${stat('공격력', `${Math.round(ad)}`, '평타 한 번의 물리 피해', !!f && Math.round(ad) > Math.round(d.ad * m))}
      ${stat('공격 속도', as.toFixed(2), '1초에 치는 횟수', !!f && as > d.as + 0.005)}
      ${stat('주문력', pct(power), '기술의 피해·회복·보호막 배율 (별과 시너지, 재료로 올라요)', !!f && power > SKILL_MUL[star] + 0.001)}
      ${stat('방어력', `${Math.round(armor)}`, `물리 피해를 ${cut(armor)} 줄여요`, armor > d.armor)}
      ${stat('마법 저항', `${Math.round(mr)}`, `마법 피해를 ${cut(mr)} 줄여요`, mr > d.mr)}
      ${stat('물리 피해 감소', cut(armor))}
      ${stat('마법 피해 감소', cut(mr))}
      ${stat('사거리', d.range > 1 ? `${d.range}칸` : '근접')}
      ${stat('마나', `${f ? Math.round(f.mana) : d.manaStart}/${d.mana}`, '시작 마나 / 기술에 필요한 마나')}
      ${extra.join('')}
    </dl>
    ${creep ? '' : `<p class="i-skill"><b>기술</b> ${d.skillText}${nums ? `<span class="i-nums">${nums}</span>` : ''}${!f && !live ? `<small>별 둘이면 ×${SKILL_MUL[2]}, 별 셋이면 ×${SKILL_MUL[3]}</small>` : ''}</p>`}
    ${(() => { const its = live ? live.items : uid !== undefined && g ? findPiece(me(), uid)?.items ?? [] : []; return its.length ? `<div class="i-items">${its.map((i) => { const it = itemDef(i); return `<span><i style="--c:${it.color}"></i><b>${it.name}</b> ${it.text}</span>`; }).join('')}</div>` : ''; })()}
    ${uid !== undefined && (mode === 'prep' || (mode === 'fight' && !!me().bench.find((u) => u?.uid === uid))) ? `<button class="btn small sell" data-sell="${uid}">팔기 +${sellValue(id, star)}냥</button>` : ''}`;
  el.hidden = false;
  if (at) {
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, at.x - w / 2))}px`;
    el.style.top = `${Math.max(8, Math.min(window.innerHeight - h - 8, at.y - h - 16))}px`;
  } else { el.style.left = ''; el.style.top = ''; }
}
const hideInfo = () => { $('info').hidden = true; };

$('info').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-sell]') as HTMLElement | null;
  if (!b || !g) return;
  const uid = +b.dataset.sell!;
  const piece = owned(me()).find((o) => o.piece.uid === uid)?.piece;
  sell(g, me(), uid);
  if (piece) toast(`${josa(BY_ID[piece.id].name, '을', '를')} 팔았어요. +${sellValue(piece.id, piece.star)}냥`, 'good');
  hideInfo(); renderAll();
});

/* ------------------------------------------------------------- shop */

$('shop').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-shop]') as HTMLElement | null;
  if (!b || !g || mode === 'menu') return;
  const slot = +b.dataset.shop!, id = me().shop[slot]!;
  const before = owned(me()).map((o) => `${o.piece.uid}:${o.piece.star}`).join();
  const err = buy(g, me(), slot);
  if (err) { toast(err, 'warn'); return; }
  const up = owned(me()).find((o) => o.piece.id === id && o.piece.star > 1 && !before.includes(`${o.piece.uid}:${o.piece.star}`));
  if (up) toast(BY_ID[id].evo ? `${BY_ID[id].name} 셋이 모여 ${josa(nameAt(BY_ID[id], up.piece.star), '으로', '로')} 진화했어요! (별 ${up.piece.star}개)` : `${BY_ID[id].name} 셋이 모여 별 ${up.piece.star}개가 됐어요!`, 'good');
  renderAll();
});
$('shop').addEventListener('contextmenu', (e) => {
  const b = (e.target as HTMLElement).closest('[data-shop]') as HTMLElement | null;
  if (!b || !g) return;
  e.preventDefault();
  const r = b.getBoundingClientRect();
  showInfo(me().shop[+b.dataset.shop!]!, 1, { x: r.left + r.width / 2, y: r.top });
});
// Hover a card for its details (on a mouse); a tap buys.
$('shop').addEventListener('pointerover', (e) => {
  if (e.pointerType !== 'mouse') return;
  const b = (e.target as HTMLElement).closest('[data-shop]') as HTMLElement | null;
  if (!b || !g) return;
  const r = b.getBoundingClientRect();
  showInfo(me().shop[+b.dataset.shop!]!, 1, { x: r.left + r.width / 2, y: r.top }, undefined, true);
});
$('shop').addEventListener('pointerout', (e) => { if (!(e.relatedTarget as HTMLElement | null)?.closest?.('[data-shop]') && $('info').classList.contains('peek')) hideInfo(); });

$('xpBtn').addEventListener('click', () => { const lv = me().level; const err = buyXp(g!, me()); if (err) toast(err, 'warn'); else if (me().level > lv) toast(`레벨 ${me().level}! 판에 ${me().level}개까지 올릴 수 있어요.`, 'good'); renderAll(); });
$('rerollBtn').addEventListener('click', () => { const err = reroll(g!, me()); if (err) toast(err, 'warn'); renderAll(); });
$('lockBtn').addEventListener('click', () => { me().locked = !me().locked; renderShop(); toast(me().locked ? '다음 라운드에도 지금 장터가 그대로 나와요.' : '잠금을 풀었어요.'); });

$('players').addEventListener('click', () => $('players').classList.toggle('open'));
/* ------------------------------------------------- trait highlight */

/** The trait being looked at (hovered, or tapped to pin it), lighting up its pieces on the table and in the shop. */
let hiTrait: Trait | null = null;
let pinned = false;
function lightTrait(t: Trait | null, from?: HTMLElement) {
  hiTrait = t;
  table.setHighlight(t ? (id) => BY_ID[id]?.traits.includes(t) ?? false : null);
  document.querySelectorAll<HTMLElement>('#shop .card[data-shop]').forEach((c) => {
    const id = me().shop[+c.dataset.shop!];
    c.classList.toggle('hi', !!t && !!id && BY_ID[id].traits.includes(t));
    c.classList.toggle('lo', !!t && !(id && BY_ID[id].traits.includes(t)));
  });
  document.querySelectorAll<HTMLElement>('#traits .trait').forEach((b) => b.classList.toggle('looking', b.dataset.trait === t));
  const card = $('traitCard');
  if (!t) { card.hidden = true; return; }
  const d = TRAITS[t], p = me();
  const n = boardTraits(p).find((x) => x.trait === t)?.n ?? 0;
  const onBoard = new Set(p.board.map((u) => u.id)), have = new Set(owned(p).map((o) => o.piece.id));
  const units = UNITS.filter((u) => u.traits.includes(t)).sort((a, b) => a.tier - b.tier);
  card.innerHTML = `
    <div class="tc-head"><span class="chip ${d.kind}">${d.kind === 'origin' ? '출신' : '싸움법'}</span><b>${d.name}</b><span class="tc-n num">${n} / ${d.steps.at(-1)}</span></div>
    <p>${d.text}</p>
    <ol class="tc-steps">${d.steps.map((st, i) => `<li class="${n >= st ? 'on' : ''}"><b>${st}</b> ${d.levels[i]}</li>`).join('')}</ol>
    <div class="tc-units">${units.map((u) => `<span class="tc-u${onBoard.has(u.id) ? ' on' : have.has(u.id) ? ' have' : ''}" style="--tier:${TIER_COLOR[u.tier]}">${pic(u.id)}<i>${u.name}</i><small>${u.tier}냥</small></span>`).join('')}</div>
    <small class="tc-hint">빛나는 말이 ${d.name}이에요. 판 위 말 = 진한 테두리, 대기석 = 점선${pinned ? ' · 다시 누르면 닫혀요' : ''}</small>`;
  card.hidden = false;
  if (from && window.innerWidth > 600) {
    const r = from.getBoundingClientRect();
    card.style.left = `${r.right + 8}px`;
    card.style.top = `${Math.min(window.innerHeight - card.offsetHeight - 200, r.top)}px`;
    card.style.bottom = '';
  } else { card.style.left = ''; card.style.top = ''; }
}
$('traits').addEventListener('pointerover', (e) => {
  if (pinned || (e as PointerEvent).pointerType !== 'mouse') return;
  const b = (e.target as HTMLElement).closest('[data-trait]') as HTMLElement | null;
  if (b) lightTrait(b.dataset.trait!, b);
});
$('traits').addEventListener('pointerleave', (e) => { if (!pinned && e.pointerType === 'mouse') lightTrait(null); });
$('traits').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-trait]') as HTMLElement | null;
  if (!b) return;
  // A tap pins the highlight (a phone has no hover); tapping it again lets go.
  if (pinned && hiTrait === b.dataset.trait) { pinned = false; lightTrait(null); return; }
  pinned = true;
  lightTrait(b.dataset.trait!, b);
});
$('traitCard').addEventListener('click', () => { pinned = false; lightTrait(null); });

/* --------------------------------------------------------- dragging */

/** A piece being dragged: its game uid, and its key on the table (bench pieces in a fight are keyed apart). */
let drag: { uid: number; key: number; x0: number; y0: number; moved: boolean; id: string; star: number } | null = null;
const canvas = $('view');

/** Fingers on the table (for pinching), and a slide of the zoomed view in progress. */
const touches = new Map<number, { x: number; y: number }>();
let pinch: { d: number } | null = null;
let panning: { x: number; y: number } | null = null;
const pinchDist = () => { const [a, b] = [...touches.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };

canvas.addEventListener('pointerdown', (e) => {
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 2) {
    // Two fingers: zoom, and let go of whatever the first finger had started.
    if (drag) { drag = null; document.body.classList.remove('dragging'); table.showGrid(false); table.highlight(null); renderAll(); }
    panning = null; pinch = { d: pinchDist() };
    return;
  }
  if (pinned) { pinned = false; lightTrait(null); }
  if (mode === 'fight' && fightCombat) {
    // During a fight: tap a piece (either side) to see what it is and how it's doing.
    const key = table.pick(e.clientX, e.clientY, true);
    if (key !== null && key >= BENCH_KEY && g) {
      // A bench piece: it can still be moved along the bench or sold while the fight runs.
      const piece = me().bench.find((u) => u?.uid === key - BENCH_KEY);
      if (piece) { hideInfo(); drag = { uid: piece.uid, key, x0: e.clientX, y0: e.clientY, moved: false, id: piece.id, star: piece.star }; canvas.setPointerCapture(e.pointerId); }
      return;
    }
    const f = key !== null ? fightCombat.f[key] : null;
    if (f) showInfo(f.def.id, f.star, table.screenOf(key!), undefined, false, f); else { hideInfo(); panning = { x: e.clientX, y: e.clientY }; }
    return;
  }
  if (mode !== 'prep' || !g) return;
  hideInfo();
  const uid = table.pick(e.clientX, e.clientY);
  if (uid === null && armed < 0) { panning = { x: e.clientX, y: e.clientY }; return; }
  if (armed >= 0) {
    // Putting an ingredient on the piece tapped.
    const k = armed; armed = -1;
    if (uid !== null) {
      const name = itemDef(me().items[k]).name;
      const before = (findPiece(me(), uid)?.items ?? []).filter((x) => x.includes('+')).length;
      const err = equip(g, me(), uid, k);
      const piece = findPiece(me(), uid)!;
      const sauces = (piece.items ?? []).filter((x) => x.includes('+'));
      if (err) toast(err, 'warn');
      else if (sauces.length > before) toast(`${nameAt(BY_ID[piece.id], piece.star)}의 ${itemWord()}가 섞여 ${josa(itemDef(sauces.at(-1)!).name, '이', '가')} 됐어요! ${itemDef(sauces.at(-1)!).text}`, 'good');
      else toast(`${nameAt(BY_ID[piece.id], piece.star)}에 ${josa(name, '을', '를')} 올렸어요. 하나 더 올리면 ${josa(mixWord(), '이', '가')} 돼요.`, 'good');
    }
    renderAll();
    return;
  }
  if (uid === null) return;
  const piece = owned(me()).find((o) => o.piece.uid === uid)?.piece;
  if (!piece) return;
  drag = { uid, key: uid, x0: e.clientX, y0: e.clientY, moved: false, id: piece.id, star: piece.star };
  canvas.setPointerCapture(e.pointerId);
});

const overShop = (x: number, y: number) => { const r = $('shopbar').getBoundingClientRect(); return y >= r.top && x >= r.left && x <= r.right; };

canvas.addEventListener('pointermove', (e) => {
  if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && touches.size >= 2) {
    const d = pinchDist(), [a, b] = [...touches.values()];
    table.zoomBy(d / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
    pinch.d = d;
    return;
  }
  if (panning) { table.panBy(e.clientX - panning.x, e.clientY - panning.y); panning = { x: e.clientX, y: e.clientY }; return; }
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
  drag.moved = true;
  document.body.classList.add('dragging');
  if (mode === 'prep') table.showGrid(true);
  const sellNow = overShop(e.clientX, e.clientY);
  $('shopbar').classList.toggle('selling', sellNow);
  $('sellPrice').textContent = `+${sellValue(drag.id, drag.star)}냥`;
  const p = table.ground(e.clientX, e.clientY);
  if (p) table.dragTo(drag.key, p.x, p.z);
  const tgt = sellNow ? null : table.targetAt(p);
  table.highlight(mode === 'fight' && tgt && !('bench' in tgt) ? null : tgt);
});

function endDrag(e: PointerEvent) {
  touches.delete(e.pointerId);
  if (touches.size < 2) pinch = null;
  panning = null;
  if (!drag || !g) return;
  const d = drag;
  drag = null;
  document.body.classList.remove('dragging');
  table.showGrid(false);
  $('shopbar').classList.remove('selling');
  table.highlight(null);
  if (!d.moved) {
    showInfo(d.id, d.star, table.screenOf(d.key), d.uid);
    return;
  }
  if (overShop(e.clientX, e.clientY)) {
    sell(g, me(), d.uid);
    toast(`${josa(BY_ID[d.id].name, '을', '를')} 팔았어요. +${sellValue(d.id, d.star)}냥`, 'good');
  } else {
    const t: DropTarget = table.targetAt(table.ground(e.clientX, e.clientY));
    if (t && mode === 'fight' && !('bench' in t)) toast('싸우는 동안에는 판에 올릴 수 없어요. 대기석끼리 옮기거나 팔 수는 있어요.', 'warn');
    else if (t) { const err = move(g, me(), d.uid, t); if (err) toast(err, 'warn'); }
  }
  renderAll();
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); table.zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY); }, { passive: false });
$('zoomIn').addEventListener('click', () => table.zoomBy(1.25));
$('zoomOut').addEventListener('click', () => table.zoomBy(1 / 1.25));
$('zoomReset').addEventListener('click', () => table.resetZoom());

/* ------------------------------------------------------------- music */

const bgm = new Bgm();
let musicWanted = true;
try { musicWanted = localStorage.getItem('nanjang.music') !== 'off'; const v = localStorage.getItem('nanjang.volume'); if (v) bgm.setVolume(+v); } catch { /* storage blocked */ }
function showMusic() {
  $('musicBtn').setAttribute('aria-pressed', String(bgm.on));
  $('musicBtn').classList.toggle('off', !bgm.on);
  $('volShow').textContent = `${Math.round(bgm.volume * 100)}%`;
}
$('musicBtn').addEventListener('click', () => {
  if (bgm.on) bgm.stop(); else bgm.start();
  musicWanted = bgm.on;
  try { localStorage.setItem('nanjang.music', bgm.on ? 'on' : 'off'); } catch { /* storage blocked */ }
  showMusic();
});
document.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-vol]') as HTMLElement | null;
  if (!b) return;
  bgm.setVolume(bgm.volume + (b.dataset.vol === '+' ? 0.1 : -0.1));
  try { localStorage.setItem('nanjang.volume', String(bgm.volume)); } catch { /* storage blocked */ }
  showMusic();
});
// Browsers allow sound only after a tap: start with the first one, if the player wants music.
window.addEventListener('pointerdown', () => { if (musicWanted && !bgm.on) { bgm.start(); showMusic(); } }, { once: true });
showMusic();

/* ------------------------------------------------------------ fights */

let pending: { matches: Match[]; mine: Match | null; hpBefore: Map<number, number> } | null = null;
let fightCombat: Combat | null = null;
let flipView = false;
let fightOpp = -1;

$('fightBtn').addEventListener('click', () => {
  if (!g || mode !== 'prep') return;
  const p = me();
  const filled = autoFill(g, p);
  if (filled) toast(`빈자리에 대기석 말 ${filled}개를 올렸어요.`);
  if (!p.board.length) { toast('판에 말이 하나도 없어요. 대기석의 말을 끌어 올리세요.', 'warn'); return; }
  const hpBefore = new Map(g.players.map((q) => [q.idx, q.hp]));
  prevArena = g.arena; prevSeason = g.season;
  // Fights are worked out now but scored when the one on screen ends; the shop stays open meanwhile.
  const matches = playRound(g, false);
  const mine = matches.find((m) => m.a === 0 || m.b === 0) ?? null;
  pending = { matches, mine, hpBefore };
  if (!mine) { afterFight(); return; }
  mode = 'fight';
  hideInfo();
  pinned = false; lightTrait(null);
  document.body.classList.add('fighting');
  $('fightbar').hidden = false;
  ($('fightBtn') as HTMLButtonElement).disabled = true; $('fightBtn').textContent = '싸우는 중';
  const flip = mine.b === 0;
  flipView = flip;
  const oppIdx = mine.creeps ? -1 : flip ? mine.a : mine.b;
  $('versus').innerHTML = mine.creeps ? `<b>${theme().creepName}</b><span>${theme().creepText} · ${ARENAS[mine.ctx.arena!].name}</span>` : `<b>${g.players[oppIdx].name}</b><span>${mine.ghost ? '(그림자 상대: 이 판의 승패는 나만 받아요)' : `체력 ${hpBefore.get(oppIdx)}`} · ${ARENAS[mine.ctx.arena!].name}</span>`;
  fightOpp = oppIdx;
  renderPlayers(undefined, oppIdx);
  // The traits on show are the player's own for this fight.
  fightCombat = setup(mine.aTeam, mine.bTeam, mine.seed, mine.ctx);
  table.onFightEnd = () => afterFight();
  bgm.setFight(true);
  table.startFight(fightCombat, flip);
  table.showBench(me());
});

$('speedBtn').addEventListener('click', () => {
  table.speed = table.speed > 1.5 ? 1 : 2;
  $('speedBtn').textContent = table.speed > 1.5 ? '보통 빠르기' : '빠르게';
});
$('skipBtn').addEventListener('click', () => table.finishNow());

function afterFight() {
  if (!g || !pending) return;
  const { mine, hpBefore, matches } = pending;
  pending = null;
  drag = null; document.body.classList.remove('dragging'); $('shopbar').classList.remove('selling');
  settleRound(g, matches);
  bgm.setFight(false);
  table.onFightEnd = null;
  hideInfo();
  const p = me();
  if (mine) {
    const meSide = mine.a === 0 ? 0 : 1;
    const won = mine.outcome.winner === meSide, draw = mine.outcome.winner === -1;
    history[g.round] = won ? 'w' : draw ? 'd' : 'l';
    g.log = [...(g.log ?? []), { round: g.round, res: history[g.round], vs: mine.creeps ? theme().creepName : g.players[fightOpp]?.name ?? '', lost: Math.max(0, (hpBefore.get(0) ?? 0) - p.hp), arena: mine.ctx.arena ?? '' }];
    const lost = (hpBefore.get(0) ?? 0) - p.hp;
    // Who did the work on our side.
    const ours = (fightCombat?.f ?? []).filter((f) => f.side === meSide).sort((a, b) => b.dealt - a.dealt).slice(0, 3);
    const top = ours[0]?.dealt || 1;
    const chart = ours.length ? `<div class="dmg"><small>가장 많이 때린 말</small>${ours.map((f) => `<span>${pic(f.def.id, 'pic', f.star)}<i>${nameAt(f.def, f.star)}${'★'.repeat(f.star)}</i><em><b style="width:${(f.dealt / top) * 100}%"></b></em><u class="num">${Math.round(f.dealt).toLocaleString('ko-KR')}</u></span>`).join('')}</div>` : '';
    banner(won ? (mine.creeps ? `${theme().creepName} 승리!` : '이겼어요!') : draw ? '비겼어요' : '졌어요',
      won ? (mine.creeps ? `${itemWord()}와 엽전을 얻었어요` : '+1냥, 연승 중이면 더 받아요') : `체력 -${lost}`, won ? 'win' : 'lose', chart);
  }
  setTimeout(() => {
    $('banner').hidden = true;
    document.body.classList.remove('fighting');
    $('fightbar').hidden = true; $('shopbar').hidden = false;
    ($('fightBtn') as HTMLButtonElement).disabled = false; $('fightBtn').textContent = '싸우기';
    fightOpp = -1;
    if (!p.alive || g!.over) { finish(); return; }
    nextRound(g!);
    mode = 'prep';
    table.clearPieces();
    save(g!);
    renderAll();
    roundNews(prevArena, prevSeason);
  }, mine ? 2600 : 0);
}

let prevArena = '', prevSeason = -1;
/** What changed with the new round: the season, the ground, a creep round coming. */
function roundNews(arena: string, season: number) {
  const G = g!;
  if (G.season >= 0 && G.season !== season) toast(`${josa(SEASON_NAME[G.season], '이', '가')} 왔어요! ${Object.values(TRAITS).find((t) => t.season === G.season)?.name} 요괴가 두 배로 세지고, 경기장은 ${josa(ARENAS[G.arena].name, '이에요', '예요')}.`, 'good');
  else if (G.arena !== arena) toast(`이번 경기장: ${ARENAS[G.arena].name}. ${ARENAS[G.arena].text}`);
  else if (isCreepRound(G.round)) toast(`${G.round}라운드는 ${josa(theme().creepName, '이에요', '예요')}. ${theme().creepText}.`);
}

function banner(title: string, sub: string, tone: string, extra = '') {
  const el = $('banner');
  el.innerHTML = `<b>${title}</b><span>${sub}</span>${extra}`;
  el.className = `banner ${tone}`;
  el.hidden = false;
}

function finish() {
  const p = me();
  mode = 'menu';
  clearSave(g!.theme);
  const place = p.alive ? 1 : p.place;
  addRecord({
    at: Date.now(), theme: g!.theme, place, rounds: g!.round,
    board: p.board.slice().sort((a, b) => BY_ID[b.id].tier * b.star - BY_ID[a.id].tier * a.star).slice(0, 6).map((u) => ({ id: u.id, star: u.star })),
    traits: boardTraits(p).filter((t) => t.step).slice(0, 4).map((t) => `${TRAITS[t.trait].name} ${t.n}`),
    log: g!.log ?? [],
  });
  $('againBtn').textContent = '테마 고르고 한 판 더';
  $('endKicker').textContent = place === 1 ? '마지막까지 남았어요' : '한 판이 끝났어요';
  $('endTitle').textContent = `${place}등`;
  const winner = g!.players.find((q) => q.place === 1);
  $('endText').textContent = place === 1 ? `${g!.round}라운드 만에 일곱 상대를 모두 물리쳤어요.` : `${g!.round}라운드에서 떨어졌어요.${winner ? ` 1등은 ${winner.name}이에요.` : ''} 다음 판에는 같은 갈래를 더 모아 보세요.`;
  $('end').hidden = false;
}

/* ------------------------------------------------------------ start */

function begin(game: Game) {
  g = game;
  armed = -1;
  applyTheme(themeById(g.theme));
  mode = 'prep';
  table.clearPieces();
  $('start').hidden = true; $('end').hidden = true;
  renderAll();
  save(g);
}

/* ------------------------------------------------------------- style */

let chosenStyle: PieceStyle = 'pixel';
try { const v = localStorage.getItem('nanjang.style') as PieceStyle | null; if (v && v in STYLE_NAME) chosenStyle = v; } catch { /* storage blocked */ }
setPieceStyle(chosenStyle);
function renderStylePick() {
  document.querySelectorAll<HTMLElement>('[data-stylepick]').forEach((el) => {
    el.innerHTML = (Object.keys(STYLE_NAME) as PieceStyle[]).map((k) => `<button type="button" role="radio" aria-checked="${k === pieceStyle()}" data-style="${k}">${STYLE_NAME[k]}</button>`).join('');
  });
}
document.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-style]') as HTMLElement | null;
  if (!b) return;
  setPieceStyle(b.dataset.style as PieceStyle);
  try { localStorage.setItem('nanjang.style', b.dataset.style!); } catch { /* storage blocked */ }
  renderStylePick();
  if (mode === 'prep' && $('start').hidden) { table.clearPieces(); renderAll(); }
  if (!$('book').hidden) renderBook();
});

/* -------------------------------------------------------------- book */

/** 도감: every piece of the theme with its traits, cost and skill; tap a trait to see just its pieces. */
let bookTrait: Trait | null = null;
function renderBook() {
  const T = theme();
  $('bookTitle').textContent = `${T.title} 도감`;
  $('bookTraits').innerHTML = `<button class="${bookTrait ? '' : 'on'}" data-booktrait="">전체</button>` + Object.entries(TRAITS).map(([k, d]) => `<button class="chip-btn ${d.kind}${bookTrait === k ? ' on' : ''}" data-booktrait="${k}">${d.name} <small>${d.steps.join('/')}</small></button>`).join('');
  const list = UNITS.filter((u) => !bookTrait || u.traits.includes(bookTrait)).sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
  const bt = bookTrait ? TRAITS[bookTrait] : null;
  $('bookList').innerHTML = (bt ? `<p class="book-trait"><b>${bt.name}</b> ${bt.text} ${bt.steps.map((st, i) => `${st}개: ${bt.levels[i]}`).join(' · ')}</p>` : '') + list.map((u) => `
    <article class="book-u" style="--tier:${TIER_COLOR[u.tier]}">
      ${pic(u.id)}
      <div><b>${u.name}</b><span class="num">${u.tier}냥</span></div>
      ${u.evo ? `<div class="evo-line">${[1, 2, 3].map((st) => `<span>${pic(u.id, 'pic', st)}<i>${nameAt(u, st)}</i></span>`).join('<em>›</em>')}</div>` : ''}
      <span class="c-traits">${u.traits.map(traitChip).join('')}</span>
      <p>${u.skillText} <small class="num">★1 기준: ${skillNumbers(u.skill, 1, 1)}</small></p>
    </article>`).join('');
}
/* ----------------------------------------------------------- records */

function renderRecords() {
  const all = records();
  const when = (t: number) => new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const wins = all.filter((r) => r.place === 1).length, top4 = all.filter((r) => r.place <= 4).length;
  const avg = all.length ? (all.reduce((s2, r) => s2 + r.place, 0) / all.length).toFixed(1) : '-';
  $('recSum').innerHTML = all.length ? `<span>판 수 <b class="num">${all.length}</b></span><span>1등 <b class="num">${wins}</b></span><span>4등 안 <b class="num">${top4}</b></span><span>평균 등수 <b class="num">${avg}</b></span>` : '';
  $('recList').innerHTML = all.length ? all.map((r: GameRecord, i) => {
    const T = themeById(r.theme);
    useTheme(T.id);
    const pieces = r.board.filter((u) => BY_ID[u.id]).map((u) => `<span title="${nameAt(BY_ID[u.id], u.star)}">${pic(u.id, 'pic', u.star)}<i>${'★'.repeat(u.star)}</i></span>`).join('');
    const pips = r.log.map((l) => `<i class="pip ${l.res}" title="${l.round}라운드 · ${l.vs} · ${l.res === 'w' ? '승' : l.res === 'l' ? `패 (체력 -${l.lost})` : '무'}">${l.round}</i>`).join('');
    return `<details class="rec${r.place === 1 ? ' first' : ''}"${i === 0 ? ' open' : ''}>
      <summary><b class="place num">${r.place}등</b><span>${T.title} · ${r.rounds}라운드</span><small>${when(r.at)}</small></summary>
      <div class="rec-board">${pieces}</div>
      ${r.traits.length ? `<div class="rec-traits">${r.traits.map((t) => `<span class="chip">${t}</span>`).join('')}</div>` : ''}
      ${pips ? `<div class="rec-log">${pips}</div>` : ''}
    </details>`;
  }).join('') : '<p class="t-empty">아직 끝낸 판이 없어요. 한 판을 끝까지 하면 여기에 남아요.</p>';
  // Back to the theme on screen.
  useTheme(g?.theme ?? picked);
}
const openRecords = () => { renderRecords(); $('recs').hidden = false; };
$('recBtn').addEventListener('click', openRecords);
$('endRecBtn').addEventListener('click', openRecords);
$('recsClose').addEventListener('click', () => { $('recs').hidden = true; });
$('recs').addEventListener('click', (e) => { if (e.target === $('recs')) $('recs').hidden = true; });

$('bookBtn').addEventListener('click', () => { bookTrait = null; renderBook(); $('book').hidden = false; });
$('bookClose').addEventListener('click', () => { $('book').hidden = true; });
$('book').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-booktrait]') as HTMLElement | null;
  if (b) { bookTrait = b.dataset.booktrait || null; renderBook(); }
  else if (e.target === $('book')) $('book').hidden = true;
});

/* ------------------------------------------------------------ themes */

let picked = 'spirits';
try { picked = localStorage.getItem('nanjang.theme') ?? 'spirits'; } catch { /* storage blocked */ }
if (!THEMES.some((t) => t.id === picked)) picked = 'spirits';

/** Dress the page in a theme: names, colours, the table. */
function applyTheme(T: Theme) {
  useTheme(T.id);
  document.title = `${GAME_NAME} · ${T.title}`;
  document.body.dataset.theme = T.id;
  document.querySelector('.title')!.textContent = GAME_NAME;
  const r = document.documentElement.style;
  r.setProperty('--lacquer', T.palette.line); r.setProperty('--lacquer-deep', T.palette.deep); r.setProperty('--brass', T.palette.accent);
  document.body.style.background = T.palette.bg;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', T.palette.bg);
  table.setPalette(T.palette);
  const help = $('helpTheme');
  const iw = T.itemWord ?? '재료', mw = T.mixWord ?? '양념';
  const names = (T.items ?? []).slice(0, 3).map((i) => i.name).join(', ');
  help.hidden = false;
  help.innerHTML = `<b>${iw}.</b> ${T.creepName} 라운드에서 이기면 ${iw}(${names}…)를 얻어요. 아래 ${iw}를 누르고 말을 누르면 올라가요. 한 말에 둘을 올리면 ${josa(mw, '이', '가')} 되어 더 세져요. 말 하나에 ${ITEM_SLOTS}개까지, 팔면 ${josa(iw, '은', '는')} 돌아와요.`
    + (T.seasons ? '<br><b>계절.</b> 세 라운드마다 봄, 여름, 가을, 겨울이 바뀌어요. 그 계절 요괴의 시너지는 두 배가 되고(제철), 경기장도 봄 대숲, 여름 개울, 가을 갯벌, 겨울 빙판으로 바뀌어요.' : '')
    + (T.units.some((u) => u.evo) ? '<br><b>진화.</b> 같은 정령 셋을 모으면 진화해 이름과 모습이 바뀌고 훨씬 세져요. 도감에서 진화 단계를 볼 수 있어요.' : '');
}

function renderStart() {
  renderStylePick();
  const T = themeById(picked);
  applyTheme(T);
  $('themes').innerHTML = THEMES.map((t) => `<button class="theme-card${t.id === picked ? ' on' : ''}" role="radio" aria-checked="${t.id === picked}" data-theme="${t.id}" style="--a:${t.palette.line};--b:${t.palette.accent}"><b>${t.title}</b><span>${t.kicker}</span></button>`).join('');
  $('startKicker').textContent = T.kicker;
  $('startTitle').textContent = GAME_NAME;
  $('startTheme').textContent = T.title;
  $('startLede').textContent = `${T.lede} 여덟 명 가운데 마지막까지 남으면 이겨요.`;
  $('contBtn').hidden = !load(picked);
  applyTheme(T);
}
$('themes').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-theme]') as HTMLElement | null;
  if (!b) return;
  picked = b.dataset.theme!;
  try { localStorage.setItem('nanjang.theme', picked); } catch { /* storage blocked */ }
  renderStart();
});

$('newBtn').addEventListener('click', () => { begin(newGame((Math.random() * 2 ** 31) | 0, picked)); toast('대기석의 말을 끌어서 판에 올려 보세요.'); });
$('contBtn').addEventListener('click', () => { const s = load(picked); if (s) begin(s); });
$('againBtn').addEventListener('click', () => { $('end').hidden = true; $('start').hidden = false; mode = 'menu'; renderStart(); });
$('arenaChip').addEventListener('click', () => { if (g) toast(`${ARENAS[g.arena].name}: ${ARENAS[g.arena].text}`); });
$('tray').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-item]') as HTMLElement | null;
  if (!b || mode !== 'prep') return;
  const k = +b.dataset.item!;
  armed = armed === k ? -1 : k;
  if (armed >= 0) { const d = itemDef(me().items[k]); toast(`${d.name} (${d.text}): 올릴 말을 누르세요.`); }
  renderTray();
});
$('helpBtn').addEventListener('click', () => { renderStylePick(); $('help').hidden = false; });
$('howBtn').addEventListener('click', () => { $('help').hidden = false; });
$('helpClose').addEventListener('click', () => { $('help').hidden = true; });
renderStart();

// Keyboard: D buys XP, F rerolls, Space fights.
window.addEventListener('keydown', (e) => {
  if (mode === 'menu' || e.target instanceof HTMLInputElement) return;
  if (mode === 'fight' && e.key === ' ') return;
  if (e.key === 'd' || e.key === 'D') $('xpBtn').click();
  else if (e.key === 'f' || e.key === 'F') $('rerollBtn').click();
  else if (e.key === ' ') { e.preventDefault(); $('fightBtn').click(); }
  else if (e.key === 'Escape') hideInfo();
});

/** Keep the table clear of the bars at the top and bottom. */
function fitTable() {
  let top = document.querySelector('.top')!.getBoundingClientRect().bottom + 4;
  // On a phone the synergy row sits under the top bar (however tall it wrapped), the player list under that.
  const phone = window.innerWidth <= 600;
  if (phone) {
    $('traits').style.top = `${top}px`;
    top = Math.max(top, $('traits').getBoundingClientRect().bottom + 2);
  } else $('traits').style.top = `${top + 4}px`;
  // In a fight the opponent bar sits under the top bar (the shop stays at the bottom); on a phone the player list goes below it.
  const sideTop = top;
  if (!$('fightbar').hidden) { $('fightbar').style.top = `${top}px`; top += $('fightbar').offsetHeight + 6; }
  $('players').style.top = `${phone ? top + 2 : sideTop + 4}px`;
  const bar = !$('shopbar').hidden ? $('shopbar') : null;
  const bottom = bar ? window.innerHeight - bar.getBoundingClientRect().top + 30 : 10;
  table.setInsets(top, bottom);
  $('cap').style.bottom = `${bottom - 24}px`;
  (document.querySelector('.zoom') as HTMLElement).style.bottom = `${bottom + 4}px`;
  $('tray').style.bottom = `${bottom - 24}px`;
}
new ResizeObserver(fitTable).observe(document.body);

/** Turning the phone: drop anything pinned to the old layout (an open card, a half-made drag). */
function onTurn() {
  hideInfo();
  if (pinned || hiTrait) { pinned = false; lightTrait(null); }
  if (drag) {
    drag = null;
    document.body.classList.remove('dragging');
    $('shopbar').classList.remove('selling');
    table.showGrid(false); table.highlight(null);
    if (mode === 'prep') renderAll();
  }
  for (const id of ['traits', 'players', 'traitCard', 'info'] as const) { const el = $(id); el.style.left = ''; if (id !== 'traits' && id !== 'players') el.style.top = ''; }
  fitTable();
}
window.addEventListener('orientationchange', () => { onTurn(); setTimeout(onTurn, 350); });
window.addEventListener('resize', onTurn);
window.visualViewport?.addEventListener('resize', onTurn);

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
(window as unknown as { nanjang: unknown }).nanjang = {
  get game() { return g; }, table, render: () => renderAll(),
  portraits: (st: PieceStyle, th: string, star = 1) => { applyTheme(themeById(th)); setPieceStyle(st); return UNITS.map((d) => ({ name: nameAt(d, star), url: portrait(d.id, theme().faces !== false, star) })); },
  lineup: (st: PieceStyle, th: string) => { applyTheme(themeById(th)); setPieceStyle(st); $('start').hidden = true; table.setArena('yard'); table.showLineup(UNITS.map((d) => d.id)); },
};
