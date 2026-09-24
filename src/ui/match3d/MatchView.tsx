import { useEffect, useRef, useState } from 'react';
import type { Team } from '../../game/types';
import { MatchPitch } from '../match2d/MatchPitch';
import { readableOn, type MatchDirector } from '../match2d/director';
import type { CameraMode, Match3D } from './scene3d';

type ViewMode = '3d' | '2d';

const VIEW_KEY = 'gaffer.matchView';
const CAMERA_KEY = 'gaffer.matchCamera';

function readPref<T extends string>(key: string, allowed: T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key) as T | null;
    return value && allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode and the like: the choice just won't stick.
  }
}

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * The match picture: 3D broadcast view by default, the flat 2D pitch as a
 * fallback (no WebGL) or by choice on slower phones. A score bug and the
 * event banner sit over the top like a TV graphic.
 */
export function MatchView({
  director,
  home,
  away,
  score,
  clock,
}: {
  director: MatchDirector;
  home: Team;
  away: Team;
  score: { home: number; away: number };
  clock: string;
}) {
  const [supports3d] = useState(webglAvailable);
  const [view, setView] = useState<ViewMode>(() =>
    supports3d ? readPref<ViewMode>(VIEW_KEY, ['3d', '2d'], '3d') : '2d',
  );
  const [camera, setCamera] = useState<CameraMode>(() =>
    readPref<CameraMode>(CAMERA_KEY, ['broadcast', 'tactical'], 'broadcast'),
  );

  const chooseView = (next: ViewMode) => {
    setView(next);
    writePref(VIEW_KEY, next);
  };
  const toggleCamera = () => {
    const next: CameraMode = camera === 'broadcast' ? 'tactical' : 'broadcast';
    setCamera(next);
    writePref(CAMERA_KEY, next);
  };

  return (
    <div className="matchview">
      {view === '3d' ? (
        <Stadium3D director={director} camera={camera} onFail={() => chooseView('2d')} />
      ) : (
        <MatchPitch director={director} />
      )}

      <div className="scorebug" aria-live="polite">
        <span className="scorebug__team" style={{ background: home.color, color: readableOn(home.color) }}>
          {home.shortName}
        </span>
        <span className="scorebug__score">
          {score.home} - {score.away}
        </span>
        <span className="scorebug__team" style={{ background: away.color, color: readableOn(away.color) }}>
          {away.shortName}
        </span>
        <span className="scorebug__clock">{clock}</span>
      </div>

      <div className="matchview__tools">
        {view === '3d' && (
          <button type="button" className="matchview__tool" onClick={toggleCamera}>
            {camera === 'broadcast' ? '🎥 중계' : '🗺 전체'}
          </button>
        )}
        {supports3d && (
          <button type="button" className="matchview__tool" onClick={() => chooseView(view === '3d' ? '2d' : '3d')}>
            {view === '3d' ? '3D' : '2D'}
          </button>
        )}
      </div>
    </div>
  );
}

function Stadium3D({
  director,
  camera,
  onFail,
}: {
  director: MatchDirector;
  camera: CameraMode;
  onFail: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Match3D | null>(null);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const failRef = useRef(onFail);
  failRef.current = onFail;
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    sceneRef.current?.setCameraMode(camera);
  }, [camera]);

  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    let observer: ResizeObserver | null = null;
    let scene: Match3D | null = null;

    // three.js is only fetched once somebody actually watches a match.
    import('./scene3d')
      .then(({ Match3D }) => {
        if (cancelled || !canvasRef.current || !wrapRef.current) return;
        const wrap = wrapRef.current;
        scene = new Match3D(canvasRef.current);
        sceneRef.current = scene;
        scene.setCameraMode(cameraRef.current);
        const resize = () => scene?.setSize(wrap.clientWidth, wrap.clientHeight);
        resize();
        observer = new ResizeObserver(resize);
        observer.observe(wrap);
        setLoading(false);

        let last = performance.now();
        let lastBanner = '';
        const loop = (now: number) => {
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          director.update(dt);
          const view = director.view();
          scene!.render(view, dt);

          // The banner is plain DOM over the canvas; touch it only on change.
          const el = bannerRef.current;
          if (el) {
            const b = view.banner;
            const key = b ? `${b.text}|${b.sub ?? ''}|${b.color}|${b.big}` : '';
            if (key !== lastBanner) {
              lastBanner = key;
              if (b) {
                el.className = `matchview__banner${b.big ? ' matchview__banner--big' : ''}`;
                el.style.background = b.color;
                el.style.color = readableOn(b.color);
                el.innerHTML = '';
                const title = document.createElement('div');
                title.className = 'matchview__banner-title';
                title.textContent = b.text;
                el.appendChild(title);
                if (b.sub) {
                  const sub = document.createElement('div');
                  sub.className = 'matchview__banner-sub';
                  sub.textContent = b.sub;
                  el.appendChild(sub);
                }
              }
            }
            el.style.opacity = b ? String(b.alpha) : '0';
          }
          frame = requestAnimationFrame(loop);
        };
        frame = requestAnimationFrame(loop);
      })
      .catch(() => {
        if (!cancelled) failRef.current();
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      scene?.dispose();
      sceneRef.current = null;
    };
  }, [director]);

  return (
    <div ref={wrapRef} className="stadium3d">
      <canvas ref={canvasRef} />
      <div ref={bannerRef} className="matchview__banner" style={{ opacity: 0 }} />
      {loading && <div className="stadium3d__loading">경기장 불러오는 중…</div>}
    </div>
  );
}
