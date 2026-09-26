// The stamp pressed onto a cleared stage. 먹 uses a square vermilion seal
// with the character 解 ("solved"); 봄 uses the round "참 잘했어요" stamp from
// Korean school notebooks.

import type { ThemeId } from './theme.ts';

let uid = 0;

export function sealSvg(theme: ThemeId, opts: { rotate?: number; className?: string } = {}): string {
  const id = `seal${++uid}`;
  const rot = opts.rotate ?? 0;
  const cls = `seal ${opts.className ?? ''}`;
  // Ink texture: a little turbulence so the seal isn't a perfect vector shape.
  const rough = `<filter id="${id}" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="1" seed="${uid % 7}" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.4 1.55" result="m"/>
      <feComposite in="SourceGraphic" in2="m" operator="in"/>
    </filter>`;

  // Colours and fonts come from CSS classes (.s-ink, .s-line, …) because
  // var() isn't reliable inside SVG presentation attributes.
  if (theme === 'ink') {
    return `<svg class="${cls}" viewBox="0 0 100 100" style="transform:rotate(${rot}deg)" aria-label="解">
      <defs>${rough}</defs>
      <g filter="url(#${id})">
        <path class="s-line" d="M9 10 Q50 5 91 9 Q95 50 91 91 Q50 95 10 91 Q5 50 9 10Z" fill="none" stroke-width="8"/>
        <text class="s-ink s-seal-font" x="50" y="72" text-anchor="middle" font-size="60" font-weight="900">解</text>
      </g>
    </svg>`;
  }

  const petals = [0, 72, 144, 216, 288]
    .map((a) => `<ellipse class="s-ink" cx="50" cy="31" rx="7" ry="9" transform="rotate(${a} 50 42)"/>`)
    .join('');
  return `<svg class="${cls}" viewBox="0 0 100 100" style="transform:rotate(${rot}deg)" aria-label="참 잘했어요">
    <defs>${rough}<path id="${id}arc" d="M18 58 A33 33 0 0 0 82 58"/></defs>
    <g filter="url(#${id})" fill="none">
      <circle class="s-line" cx="50" cy="50" r="45" stroke-width="5"/>
      <circle class="s-line" cx="50" cy="50" r="38" stroke-width="2"/>
      ${petals}
      <circle class="s-paper" cx="50" cy="42" r="7"/>
      <circle class="s-ink" cx="47.5" cy="41" r="1.2"/>
      <circle class="s-ink" cx="52.5" cy="41" r="1.2"/>
      <path class="s-line" d="M47.5 44.2 Q50 46.4 52.5 44.2" stroke-width="1.2"/>
      <text class="s-ink s-head-font" font-size="13" text-anchor="middle">
        <textPath href="#${id}arc" startOffset="50%">참 잘했어요</textPath>
      </text>
    </g>
  </svg>`;
}

/** Deterministic tilt per stage so the stamp card looks hand-stamped but stable. */
export const tiltFor = (i: number) => (((i * 37) % 17) - 8) * 1.1;
