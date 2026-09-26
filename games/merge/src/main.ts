import './style.css';
import { FRUITS, MAX_TIER, drawFruit, renderFruitSprite } from './fruits';
import { DANGER_Y, Game, HOLD_Y, WORLD_H, WORLD_W, type MergeEvent } from './game';
import { isMuted, setMuted, sfxBigMerge, sfxDrop, sfxGameOver, sfxMerge, unlockAudio } from './audio';

const BEST_KEY = 'fruit-merge:best';
const BEST_TIER_KEY = 'fruit-merge:bestTier';
const MARGIN = 10; // world units of breathing room around the box
const POP_MS = 180;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const board = $<HTMLCanvasElement>('board');
const ctx = board.getContext('2d')!;
const stage = $<HTMLElement>('stage');
const scoreEl = $<HTMLElement>('score');
const bestEl = $<HTMLElement>('best');
const nextCanvas = $<HTMLCanvasElement>('next');
const muteBtn = $<HTMLButtonElement>('mute');
const chainEl = $<HTMLElement>('chain');
const startOverlay = $<HTMLElement>('start');
const overOverlay = $<HTMLElement>('over');

function readNum(key: string): number {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}
function writeNum(key: string, v: number): void {
  try {
    localStorage.setItem(key, String(v));
  } catch {
    /* ignore */
  }
}

let best = readNum(BEST_KEY);
let bestTierEver = readNum(BEST_TIER_KEY);

// ---------------------------------------------------------------- effects

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // ms remaining
  max: number;
  r: number;
  color: string;
}
interface Floater {
  x: number;
  y: number;
  text: string;
  life: number;
  big: boolean;
}
let particles: Particle[] = [];
let floaters: Floater[] = [];
let shake = 0;

function burst(e: MergeEvent): void {
  const tier = Math.min(e.tier, MAX_TIER);
  const f = FRUITS[tier];
  const n = 10 + tier * 3;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 0.08 + Math.random() * 0.18 + tier * 0.01;
    particles.push({
      x: e.x,
      y: e.y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 0.05,
      life: 500 + Math.random() * 300,
      max: 800,
      r: 2 + Math.random() * 3 + tier * 0.3,
      color: i % 3 === 0 ? '#fff6c8' : i % 2 ? f.light : f.color,
    });
  }
  const label = e.combo > 1 ? `+${e.points}  ${e.combo}콤보!` : `+${e.points}`;
  floaters.push({ x: e.x, y: e.y - f.radius * 0.5, text: label, life: 900, big: e.combo > 1 || e.tier > MAX_TIER });
  if (e.tier >= 7) shake = Math.min(14, 4 + e.tier);
}

// ------------------------------------------------------------------- game

let game: Game;
let started = false;

function newGame(): void {
  particles = [];
  floaters = [];
  game = new Game({
    onDrop: sfxDrop,
    onMerge: (e) => {
      burst(e);
      if (e.tier > MAX_TIER) {
        sfxBigMerge();
        floaters.push({ x: e.x, y: e.y - 40, text: '수박 팡! 보너스', life: 1400, big: true });
      } else {
        sfxMerge(e.tier, e.combo);
        if (e.tier === MAX_TIER) sfxBigMerge();
      }
      navigator.vibrate?.(e.tier >= 7 ? 30 : 8);
      if (e.tier > bestTierEver && e.tier <= MAX_TIER) {
        bestTierEver = e.tier;
        writeNum(BEST_TIER_KEY, bestTierEver);
        buildChain();
      }
    },
    onGameOver: () => {
      sfxGameOver();
      navigator.vibrate?.([60, 40, 120]);
      setTimeout(showGameOver, 700);
    },
  });
  drawNext();
}

function showGameOver(): void {
  const isRecord = game.score > best;
  if (isRecord) {
    best = game.score;
    writeNum(BEST_KEY, best);
  }
  $('final-score').textContent = game.score.toLocaleString();
  $('final-note').innerHTML =
    (isRecord ? '<b>🎉 최고 기록!</b><br />' : '') + `이번 판 최대 과일: <b>${FRUITS[game.bestTier].name}</b>`;
  const fc = $<HTMLCanvasElement>('final-fruit');
  const fctx = fc.getContext('2d')!;
  fctx.clearRect(0, 0, fc.width, fc.height);
  fctx.save();
  fctx.translate(fc.width / 2, fc.height / 2 + 6);
  drawFruit(fctx, game.bestTier, fc.width * 0.3);
  fctx.restore();
  overOverlay.classList.remove('hidden');
  updateHud();
}

// ------------------------------------------------------------- rendering

let scale = 1;
let ox = 0;
let oy = 0;
let dpr = 1;
let sprites: HTMLCanvasElement[] = [];

function resize(): void {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  board.width = Math.round(w * dpr);
  board.height = Math.round(h * dpr);
  scale = Math.min(w / (WORLD_W + MARGIN * 2), h / (WORLD_H + MARGIN * 2));
  ox = (w - WORLD_W * scale) / 2;
  oy = (h - WORLD_H * scale) / 2;
  sprites = FRUITS.map((f, i) => renderFruitSprite(i, f.radius * scale * dpr));
  buildChain();
}

function drawSprite(tier: number, x: number, y: number, angle: number, s = 1, alpha = 1): void {
  const sp = sprites[tier];
  const size = (sp.width / dpr) * s;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.drawImage(sp, -size / 2, -size / 2, size, size);
  ctx.restore();
}

function roundRect(x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function render(now: number): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, board.width, board.height);

  if (shake > 0) {
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    shake *= 0.85;
    if (shake < 0.3) shake = 0;
  }
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);

  // Box.
  const wallW = 8;
  ctx.fillStyle = '#fff7e8';
  roundRect(-wallW, -4, WORLD_W + wallW * 2, WORLD_H + wallW + 4, 18);
  ctx.fill();
  ctx.lineWidth = wallW;
  ctx.strokeStyle = '#c98b4f';
  ctx.beginPath();
  ctx.moveTo(-wallW / 2, 0);
  ctx.lineTo(-wallW / 2, WORLD_H + wallW / 2);
  ctx.lineTo(WORLD_W + wallW / 2, WORLD_H + wallW / 2);
  ctx.lineTo(WORLD_W + wallW / 2, 0);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  // Danger line: faint normally, pulsing red when fruit pile up near it.
  const near = game.nearLine;
  const pulse = game.danger > 0 ? 0.5 + 0.5 * Math.sin(now / (120 - game.danger * 70)) : 0;
  ctx.save();
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = game.danger > 0 ? `rgba(230,40,40,${0.5 + pulse * 0.5})` : near ? 'rgba(230,60,40,0.5)' : 'rgba(200,120,80,0.25)';
  ctx.beginPath();
  ctx.moveTo(0, DANGER_Y);
  ctx.lineTo(WORLD_W, DANGER_Y);
  ctx.stroke();
  ctx.restore();
  if (game.danger > 0) {
    ctx.fillStyle = `rgba(255,60,60,${0.08 + pulse * 0.1 * game.danger})`;
    ctx.fillRect(0, 0, WORLD_W, DANGER_Y);
  }

  // Fruit in hand + aim guide.
  if (started && game.canDrop) {
    const r = FRUITS[game.current].radius;
    ctx.save();
    ctx.setLineDash([4, 10]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(160,100,60,0.35)';
    ctx.beginPath();
    ctx.moveTo(game.dropX, HOLD_Y + r);
    ctx.lineTo(game.dropX, WORLD_H);
    ctx.stroke();
    ctx.restore();
  }

  // Fruits (sprites are in device pixels, so step out of world scale).
  ctx.save();
  ctx.scale(1 / scale, 1 / scale);
  for (const f of game.fruits()) {
    const age = game.time - f.bornAt;
    const s = f.pop && age < POP_MS ? easeOutBack(0.5 + (0.5 * age) / POP_MS) : 1;
    drawSprite(f.tier, f.body.position.x * scale, f.body.position.y * scale, f.body.angle, s);
  }
  if (started && game.canDrop) {
    const bob = Math.sin(now / 250) * 1.5;
    drawSprite(game.current, game.dropX * scale, (HOLD_Y + bob) * scale, 0, 1, game.over ? 0.4 : 1);
  }
  ctx.restore();

  // Particles and score pop-ups.
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const fl of floaters) {
    const t = 1 - fl.life / (fl.big ? 1400 : 900);
    ctx.globalAlpha = Math.min(1, fl.life / 300);
    ctx.font = `900 ${fl.big ? 26 : 20}px system-ui, sans-serif`;
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = fl.big ? '#ff5a1f' : '#8a4a1a';
    const y = fl.y - t * 40;
    ctx.strokeText(fl.text, fl.x, y);
    ctx.fillText(fl.text, fl.x, y);
  }
  ctx.globalAlpha = 1;
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = Math.min(1, t) - 1;
  return 1 + c3 * x * x * x + c1 * x * x;
}

function stepEffects(dt: number): void {
  for (const p of particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 0.0006 * dt;
  }
  particles = particles.filter((p) => p.life > 0);
  for (const f of floaters) f.life -= dt;
  floaters = floaters.filter((f) => f.life > 0);
}

// -------------------------------------------------------------------- HUD

let shownScore = -1;
let shownNext = -1;

function updateHud(): void {
  if (game.score !== shownScore) {
    shownScore = game.score;
    scoreEl.textContent = game.score.toLocaleString();
  }
  bestEl.textContent = Math.max(best, game.score).toLocaleString();
  if (game.next !== shownNext) drawNext();
}

function drawNext(): void {
  shownNext = game.next;
  const d = Math.min(window.devicePixelRatio || 1, 3);
  nextCanvas.width = 28 * d;
  nextCanvas.height = 28 * d;
  const c = nextCanvas.getContext('2d')!;
  c.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  c.save();
  c.translate(nextCanvas.width / 2, nextCanvas.height / 2 + 2 * d);
  // Size by tier a little so "next" hints how big it is.
  drawFruit(c, game.next, (6 + game.next * 1.4) * d);
  c.restore();
}

function buildChain(): void {
  chainEl.innerHTML = '';
  const avail = Math.min(chainEl.clientWidth || 360, 560);
  const size = Math.max(16, Math.min(34, Math.floor((avail - 10 * 8) / FRUITS.length)));
  const d = Math.min(window.devicePixelRatio || 1, 3);
  FRUITS.forEach((f, i) => {
    if (i > 0) {
      const arrow = document.createElement('span');
      arrow.className = 'arrow';
      arrow.textContent = '›';
      chainEl.appendChild(arrow);
    }
    const c = document.createElement('canvas');
    c.width = size * d;
    c.height = size * d;
    c.style.width = `${size}px`;
    c.style.height = `${size}px`;
    c.title = f.name;
    // Fruits you have never made stay greyed out — something to chase.
    if (i > Math.max(bestTierEver, 4)) c.classList.add('locked');
    const cc = c.getContext('2d')!;
    cc.translate((size * d) / 2, (size * d) / 2 + size * d * 0.06);
    drawFruit(cc, i, size * d * 0.34);
    chainEl.appendChild(c);
  });
}

function refreshMute(): void {
  muteBtn.textContent = isMuted() ? '🔇' : '🔊';
}

// ------------------------------------------------------------------ input

function toWorldX(clientX: number): number {
  const rect = board.getBoundingClientRect();
  return (clientX - rect.left - ox) / scale;
}

let aiming = false;

board.addEventListener('pointerdown', (e) => {
  if (!started || game.over) return;
  unlockAudio();
  aiming = true;
  board.setPointerCapture(e.pointerId);
  game.setDropX(toWorldX(e.clientX));
});
board.addEventListener('pointermove', (e) => {
  if (!started || game.over) return;
  // Mouse users aim by hovering; touch users only while their finger is down.
  if (aiming || e.pointerType === 'mouse') game.setDropX(toWorldX(e.clientX));
});
const release = (e: PointerEvent) => {
  if (!aiming) return;
  aiming = false;
  game.setDropX(toWorldX(e.clientX));
  game.drop();
};
board.addEventListener('pointerup', release);
board.addEventListener('pointercancel', () => (aiming = false));

const held = new Set<string>();
window.addEventListener('keydown', (e) => {
  if (!started || game.over) {
    if ((e.key === 'Enter' || e.key === ' ') && !startOverlay.classList.contains('hidden')) begin();
    else if ((e.key === 'Enter' || e.key === ' ') && game?.over && !overOverlay.classList.contains('hidden')) restart();
    return;
  }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'a' || e.key === 'd') held.add(e.key);
  if (e.key === ' ' || e.key === 'ArrowDown' || e.key === 'Enter') {
    e.preventDefault();
    unlockAudio();
    game.drop();
  }
});
window.addEventListener('keyup', (e) => held.delete(e.key));

muteBtn.addEventListener('click', () => {
  unlockAudio();
  setMuted(!isMuted());
  refreshMute();
});

function begin(): void {
  unlockAudio();
  startOverlay.classList.add('hidden');
  started = true;
}
function restart(): void {
  overOverlay.classList.add('hidden');
  newGame();
}
$('start-btn').addEventListener('click', begin);
$('retry-btn').addEventListener('click', restart);

// ------------------------------------------------------------------- loop

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(now - last, 100);
  last = now;
  if (started) {
    const dir = (held.has('ArrowRight') || held.has('d') ? 1 : 0) - (held.has('ArrowLeft') || held.has('a') ? 1 : 0);
    if (dir) game.setDropX(game.dropX + dir * dt * 0.35);
    game.update(dt);
  }
  stepEffects(dt);
  render(now);
  updateHud();
  requestAnimationFrame(frame);
}

newGame();
refreshMute();
resize();
new ResizeObserver(resize).observe(stage);
requestAnimationFrame(frame);

