// Fruit tiers and how each one is drawn. Drawing happens once per tier into an
// offscreen canvas (see `renderFruitSprite`), so the per-frame cost is one
// drawImage per fruit no matter how detailed the art is.

export interface Fruit {
  name: string;
  radius: number; // world units
  color: string; // base colour
  light: string; // highlight colour for the gradient
  dark: string; // shade / outline colour
}

export const FRUITS: Fruit[] = [
  { name: '체리', radius: 15, color: '#e8364f', light: '#ff8a9a', dark: '#9e1428' },
  { name: '딸기', radius: 21, color: '#f24b5c', light: '#ff9aa4', dark: '#a8182a' },
  { name: '포도', radius: 28, color: '#8b5cf6', light: '#c4a8ff', dark: '#5427b8' },
  { name: '귤', radius: 34, color: '#ffa41b', light: '#ffd27a', dark: '#c46a00' },
  { name: '감', radius: 42, color: '#ff7a1a', light: '#ffb070', dark: '#b8470a' },
  { name: '사과', radius: 52, color: '#e5383b', light: '#ff8c7a', dark: '#96161a' },
  { name: '배', radius: 62, color: '#f2d259', light: '#fff1a8', dark: '#b89420' },
  { name: '복숭아', radius: 72, color: '#ffab9e', light: '#ffe0d6', dark: '#d9685a' },
  { name: '파인애플', radius: 84, color: '#ffcf2e', light: '#fff09a', dark: '#c48a00' },
  { name: '멜론', radius: 97, color: '#a7dd6a', light: '#e2ffb8', dark: '#5f9a2a' },
  { name: '수박', radius: 112, color: '#3fae4a', light: '#8fe08a', dark: '#1d6b26' },
];

export const MAX_TIER = FRUITS.length - 1;

/** Only the small fruits can be dropped; the rest must be earned by merging. */
export const DROPPABLE_TIERS = 5;

/** Points for creating a fruit of the given tier: 1, 3, 6, 10, … */
export function pointsFor(tier: number): number {
  return ((tier + 1) * (tier + 2)) / 2;
}

/**
 * Draws a fruit centred on (0, 0) with the given pixel radius. The body is a
 * circle (it has to match the physics shape); leaves and stems poke out a
 * little past it, which reads as "fruit" without affecting collisions.
 */
export function drawFruit(ctx: CanvasRenderingContext2D, tier: number, r: number): void {
  const f = FRUITS[tier];

  // Body with a soft top-left highlight.
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
  g.addColorStop(0, f.light);
  g.addColorStop(0.55, f.color);
  g.addColorStop(1, f.dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();
  drawSkin(ctx, tier, r);
  ctx.restore();

  // Outline.
  ctx.lineWidth = Math.max(1.5, r * 0.06);
  ctx.strokeStyle = f.dark;
  ctx.beginPath();
  ctx.arc(0, 0, r - ctx.lineWidth / 2, 0, Math.PI * 2);
  ctx.stroke();

  drawTop(ctx, tier, r);
  drawFace(ctx, r);

  // Glossy spot.
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.42, -r * 0.45, r * 0.16, r * 0.09, -0.7, 0, Math.PI * 2);
  ctx.fill();
}

/** Surface pattern, drawn clipped to the body. */
function drawSkin(ctx: CanvasRenderingContext2D, tier: number, r: number): void {
  const f = FRUITS[tier];
  switch (f.name) {
    case '딸기': {
      ctx.fillStyle = '#ffe7a0';
      for (let row = -3; row <= 3; row++) {
        for (let col = -3; col <= 3; col++) {
          const x = (col + (row % 2 ? 0.5 : 0)) * r * 0.32;
          const y = row * r * 0.3 + r * 0.1;
          if (x * x + y * y > r * r * 0.7) continue;
          ctx.beginPath();
          ctx.ellipse(x, y, r * 0.035, r * 0.06, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case '포도': {
      // A cluster read: a few lighter bubbles on the surface.
      ctx.fillStyle = 'rgba(255,255,255,0.13)';
      const spots = [
        [-0.45, 0.1], [0.05, 0.4], [0.45, 0.05], [-0.1, -0.2], [0.35, -0.45], [-0.45, -0.5], [-0.3, 0.6],
      ];
      for (const [x, y] of spots) {
        ctx.beginPath();
        ctx.arc(x * r, y * r, r * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case '귤': {
      ctx.fillStyle = 'rgba(160,70,0,0.18)';
      for (let i = 0; i < 40; i++) {
        const a = i * 2.39996;
        const d = Math.sqrt(i / 40) * r * 0.9;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r * 0.03, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case '복숭아': {
      ctx.strokeStyle = 'rgba(200,80,70,0.45)';
      ctx.lineWidth = r * 0.05;
      ctx.beginPath();
      ctx.moveTo(r * 0.05, -r);
      ctx.quadraticCurveTo(r * 0.45, -r * 0.1, r * 0.1, r * 0.95);
      ctx.stroke();
      const blush = ctx.createRadialGradient(r * 0.45, r * 0.3, 0, r * 0.45, r * 0.3, r * 0.7);
      blush.addColorStop(0, 'rgba(255,90,90,0.35)');
      blush.addColorStop(1, 'rgba(255,90,90,0)');
      ctx.fillStyle = blush;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      break;
    }
    case '파인애플': {
      ctx.strokeStyle = 'rgba(150,90,0,0.5)';
      ctx.lineWidth = r * 0.035;
      for (let k = -4; k <= 4; k++) {
        ctx.beginPath();
        ctx.moveTo(k * r * 0.4 - r, -r);
        ctx.lineTo(k * r * 0.4 + r, r);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(k * r * 0.4 + r, -r);
        ctx.lineTo(k * r * 0.4 - r, r);
        ctx.stroke();
      }
      break;
    }
    case '멜론': {
      ctx.strokeStyle = 'rgba(245,255,225,0.6)';
      ctx.lineWidth = r * 0.025;
      let seed = 7;
      const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 26; i++) {
        let x = (rand() * 2 - 1) * r;
        let y = (rand() * 2 - 1) * r;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let s = 0; s < 3; s++) {
          x += (rand() * 2 - 1) * r * 0.35;
          y += (rand() * 2 - 1) * r * 0.35;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      break;
    }
    case '수박': {
      ctx.strokeStyle = '#1a4d1f';
      ctx.lineWidth = r * 0.11;
      ctx.lineJoin = 'round';
      for (let k = -3; k <= 3; k++) {
        ctx.beginPath();
        for (let y = -r; y <= r; y += r * 0.1) {
          const x = k * r * 0.33 + Math.sin(y / r * 9 + k) * r * 0.05;
          if (y === -r) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      break;
    }
  }
}

/** Stems, leaves and crowns that sit on top of the body. */
function drawTop(ctx: CanvasRenderingContext2D, tier: number, r: number): void {
  const name = FRUITS[tier].name;
  const leaf = (x: number, y: number, len: number, angle: number, color = '#4caf50') => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.5, -len * 0.45, len, 0);
    ctx.quadraticCurveTo(len * 0.5, len * 0.45, 0, 0);
    ctx.fill();
    ctx.restore();
  };
  const stem = (len: number, bend: number) => {
    ctx.strokeStyle = '#6b4423';
    ctx.lineWidth = Math.max(2, r * 0.1);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.85);
    ctx.quadraticCurveTo(bend * 0.3, -r * 0.85 - len * 0.6, bend, -r * 0.85 - len);
    ctx.stroke();
  };

  switch (name) {
    case '체리':
      stem(r * 0.8, r * 0.35);
      leaf(r * 0.3, -r * 1.55, r * 0.7, -0.4);
      break;
    case '딸기':
      for (let i = 0; i < 5; i++) leaf(0, -r * 0.8, r * 0.55, -Math.PI / 2 + (i - 2) * 0.6, '#3e9b3e');
      break;
    case '포도':
      stem(r * 0.4, r * 0.1);
      leaf(r * 0.05, -r * 1.1, r * 0.55, -0.3, '#5aa84a');
      break;
    case '귤':
      leaf(0, -r * 0.92, r * 0.5, -0.5);
      ctx.fillStyle = '#3e7d2e';
      ctx.beginPath();
      ctx.arc(0, -r * 0.9, r * 0.09, 0, Math.PI * 2);
      ctx.fill();
      break;
    case '감':
      for (let i = 0; i < 4; i++) leaf(0, -r * 0.85, r * 0.42, -Math.PI / 2 + (i - 1.5) * 0.75, '#4d7c2a');
      ctx.fillStyle = '#5a3a1a';
      ctx.fillRect(-r * 0.05, -r * 1.05, r * 0.1, r * 0.2);
      break;
    case '사과':
      stem(r * 0.35, r * 0.1);
      leaf(r * 0.08, -r * 1.05, r * 0.45, -0.35);
      break;
    case '배':
      stem(r * 0.3, -r * 0.08);
      leaf(-r * 0.05, -r * 1.02, r * 0.4, -2.6, '#6bb04a');
      break;
    case '복숭아':
      leaf(r * 0.05, -r * 0.95, r * 0.42, -0.5);
      leaf(r * 0.05, -r * 0.95, r * 0.35, -2.3, '#5aa04a');
      break;
    case '파인애플':
      for (let i = 0; i < 7; i++) {
        leaf(0, -r * 0.82, r * (0.55 - Math.abs(i - 3) * 0.06), -Math.PI / 2 + (i - 3) * 0.3, i % 2 ? '#2f8f3a' : '#43a84a');
      }
      break;
    case '멜론':
      stem(r * 0.18, 0);
      ctx.strokeStyle = '#6b4423';
      ctx.beginPath();
      ctx.moveTo(-r * 0.15, -r * 1.03);
      ctx.lineTo(r * 0.15, -r * 1.03);
      ctx.stroke();
      break;
    case '수박':
      stem(r * 0.12, r * 0.05);
      break;
  }
}

function drawFace(ctx: CanvasRenderingContext2D, r: number): void {
  const ey = r * 0.08;
  const ex = r * 0.26;
  const er = Math.max(1.2, r * 0.085);
  ctx.fillStyle = '#2b1a14';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(sx * ex, ey, er, 0, Math.PI * 2);
    ctx.fill();
  }
  // Eye shine.
  ctx.fillStyle = '#fff';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(sx * ex - er * 0.3, ey - er * 0.35, er * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  // Cheeks.
  ctx.fillStyle = 'rgba(255,120,140,0.45)';
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(sx * r * 0.45, ey + r * 0.2, r * 0.11, r * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Smile.
  ctx.strokeStyle = '#2b1a14';
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, ey + r * 0.12, r * 0.13, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
}

/**
 * Renders one tier into a square canvas with padding for leaves/stems. The
 * sprite's centre is the fruit's centre; `pad` is how far past the radius the
 * canvas extends on each side (as a fraction of the radius).
 */
export const SPRITE_PAD = 0.75;

export function renderFruitSprite(tier: number, pxRadius: number): HTMLCanvasElement {
  const size = Math.ceil(pxRadius * (1 + SPRITE_PAD) * 2);
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.translate(size / 2, size / 2);
  drawFruit(ctx, tier, pxRadius);
  return c;
}
