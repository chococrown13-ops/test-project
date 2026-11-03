// 미니게임 「눈덩이 피하기」 규칙 — 화면과 서버가 똑같이 돌린다.
// 화면은 매 틱의 손가락 위치(inputs)만 서버로 보내고, 서버가 같은 씨앗으로 다시 돌려 점수를 직접 계산한다.
// (sin·cos 같은 수학 함수는 안 씀 — 어디서 돌려도 결과가 같게)
export const TPS = 25;                 // 1초에 25틱
export const MAX_TICKS = 120 * TPS;    // 최대 2분
export const W = 1000, H = 1600;       // 게임판 크기
export const PLAYER_Y = 1440, PLAYER_R = 46, MAX_STEP = 34;
export const GIFT_POINTS = 50;

function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

export function newGame(seed) {
  return { r: rng(seed), tick: 0, x: W / 2, lives: 3, inv: 0, gifts: 0, balls: [], presents: [], next: 20, nextGift: 140, over: false, hit: 0, got: 0 };
}

// 한 틱 진행. target = 이번 틱 손가락 x (0~1000)
export function step(g, target) {
  if (g.over) return g;
  g.tick++; g.hit = 0; g.got = 0;
  const tx = Math.max(PLAYER_R, Math.min(W - PLAYER_R, target | 0));
  const dx = Math.max(-MAX_STEP, Math.min(MAX_STEP, tx - g.x)); g.x += dx;
  const t = g.tick;
  // 눈덩이: 시간이 갈수록 자주, 빠르게
  if (t >= g.next) {
    const n = t > 1500 && g.r() < 0.35 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const r = 26 + g.r() * 20, vy = Math.min(34, 10 + t * 0.008 + g.r() * 4), vx = t > 600 && g.r() < 0.3 ? (g.r() - 0.5) * 10 : 0;
      g.balls.push({ x: r + g.r() * (W - 2 * r), y: -r, r, vx, vy, px: 0, py: 0 });
    }
    g.next = t + Math.max(4, Math.floor(20 - t / 110) + Math.floor(g.r() * 6));
  }
  if (t >= g.nextGift) { g.presents.push({ x: 60 + g.r() * (W - 120), y: -40, r: 38, vy: 9, px: 0, py: 0 }); g.nextGift = t + 120 + Math.floor(g.r() * 120); }
  if (g.inv > 0) g.inv--;
  for (let i = g.balls.length - 1; i >= 0; i--) {
    const b = g.balls[i]; b.px = b.x; b.py = b.y; b.x += b.vx; b.y += b.vy;
    if (b.x < b.r || b.x > W - b.r) b.vx = -b.vx;
    const ddx = b.x - g.x, ddy = b.y - PLAYER_Y, rr = b.r + PLAYER_R - 8;
    if (g.inv === 0 && ddx * ddx + ddy * ddy < rr * rr) { g.lives--; g.inv = 30; g.hit = 1; g.balls.splice(i, 1); continue; }
    if (b.y > H + b.r) g.balls.splice(i, 1);
  }
  for (let i = g.presents.length - 1; i >= 0; i--) {
    const p = g.presents[i]; p.px = p.x; p.py = p.y; p.y += p.vy;
    const ddx = p.x - g.x, ddy = p.y - PLAYER_Y, rr = p.r + PLAYER_R;
    if (ddx * ddx + ddy * ddy < rr * rr) { g.gifts++; g.got = 1; g.presents.splice(i, 1); continue; }
    if (p.y > H + p.r) g.presents.splice(i, 1);
  }
  if (g.lives <= 0 || g.tick >= MAX_TICKS) g.over = true;
  return g;
}

export const score = (g) => g.tick + g.gifts * GIFT_POINTS;

// 서버용: 손가락 기록으로 한 판을 처음부터 다시 돌림
export function replay(seed, inputs) {
  const g = newGame(seed);
  for (let i = 0; i < inputs.length && !g.over; i++) step(g, inputs[i]);
  return { over: g.over, ticks: g.tick, score: score(g), gifts: g.gifts };
}
