import { useEffect, useRef } from 'react';
import type { Team } from '../../game/types';
import { MatchDirector, PITCH_ASPECT, colorDistance, type Kit, type SideKey } from './director';

/** Canvas host for the 2D match view. The director is owned by the caller. */
export function MatchPitch({ director }: { director: MatchDirector }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = wrap.clientWidth;
      height = Math.round(width / PITCH_ASPECT);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);

    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      // Clamp so a backgrounded tab doesn't fast-forward on return.
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      director.update(dt);
      director.draw(ctx, width, height);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [director]);

  return (
    <div ref={wrapRef} className="pitch2d">
      <canvas ref={canvasRef} />
    </div>
  );
}

const KEEPER_KITS = ['#facc15', '#a3e635', '#f472b6', '#22d3ee', '#fb923c', '#e5e7eb'];

/**
 * Shirts for both sides. The away side changes into its accent colour (or
 * white) when the two first-choice kits would be hard to tell apart.
 */
export function matchKits(home: Team, away: Team): Record<SideKey, Kit> {
  let awayFill = away.color;
  let awayTrim = away.accent;
  if (colorDistance(home.color, away.color) < 110) {
    if (colorDistance(home.color, away.accent) >= 110) {
      awayFill = away.accent;
      awayTrim = away.color;
    } else {
      awayFill = colorDistance(home.color, '#f8fafc') >= 110 ? '#f8fafc' : '#111827';
      awayTrim = away.color;
    }
  }

  const pickKeeper = (avoid: string[]) =>
    KEEPER_KITS.find((c) => avoid.every((x) => colorDistance(c, x) >= 80)) ?? '#e5e7eb';
  const homeKeeper = pickKeeper([home.color, awayFill]);
  const awayKeeper = pickKeeper([home.color, awayFill, homeKeeper]);

  return {
    home: { fill: home.color, trim: home.accent, keeper: homeKeeper },
    away: { fill: awayFill, trim: awayTrim, keeper: awayKeeper },
  };
}
