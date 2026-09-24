import { useEffect, useRef, useState } from 'react';
import type { Team } from '../../game/types';
import { MatchPitch } from '../match2d/MatchPitch';
import { readableOn, type MatchDirector, type SceneView } from '../match2d/director';
import type { CameraMode, Match3D } from './scene3d';

type ViewMode = '3d' | '2d';

const VIEW_KEY = 'gaffer.matchView';
const CAMERA_KEY = 'gaffer.matchCamera';
const QUALITY_KEY = 'gaffer.quality';

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
  const [replaying, setReplaying] = useState(false);

  useEffect(() => {
    sceneRef.current?.setCameraMode(camera);
  }, [camera]);

  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    let observer: ResizeObserver | null = null;
    let scene: Match3D | null = null;
    director.setReplaysEnabled(true);

    // Recent frames, so a goal can be shown again. Only the last few seconds
    // are kept; that is all a replay needs.
    const recorded: SceneView[] = [];
    let goalTime: number | null = null;
    let wasCelebrating = false;
    let replayShown = false;

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
        // Watch the frame rate; a phone that can't keep up drops to low
        // quality (no shadow maps, 1x pixels) rather than stuttering.
        let frames = 0;
        let slowTime = 0;
        // `gaffer.quality = high` in localStorage pins high quality (testing, fast devices).
        let downgraded = readPref(QUALITY_KEY, ['high', 'auto'], 'auto') === 'high';
        const loop = (now: number) => {
          const raw = (now - last) / 1000;
          const dt = Math.min(0.05, raw);
          last = now;
          frames += 1;
          if (!downgraded && frames > 60) {
            slowTime += raw;
            if (frames === 180) {
              if (slowTime / 120 > 1 / 32) {
                downgraded = true;
                scene!.setQuality('low');
              }
            }
          }
          director.update(dt);
          const live = director.view();
          let view = live;

          if (live.replay && goalTime !== null) {
            // Slow motion from a few seconds before the goal to just after it.
            const start = goalTime - 4.2;
            const end = goalTime + 0.7;
            const at = start + (live.replay.t / live.replay.dur) * (end - start);
            view = frameAt(recorded, at) ?? live;
          } else {
            recorded.push(snapshot(live));
            while (recorded.length > 0 && recorded[0].time < live.time - 8) recorded.shift();
            const celebrating = live.celebrating !== null;
            if (celebrating && !wasCelebrating) goalTime = live.time;
            wasCelebrating = celebrating;
          }
          const inReplay = !!live.replay && view !== live;
          if (inReplay !== replayShown) {
            replayShown = inReplay;
            setReplaying(inReplay);
          }
          scene!.render(view, dt, inReplay);

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
      director.setReplaysEnabled(false);
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
      {replaying && (
        <>
          <div className="replay-tag">REPLAY</div>
          <button type="button" className="replay-skip" onClick={() => director.skipReplay()}>
            건너뛰기 ▶▶
          </button>
        </>
      )}
    </div>
  );
}

/** A frozen copy of the scene, safe to keep after the director moves on. */
function snapshot(view: SceneView): SceneView {
  return {
    ...view,
    actors: view.actors.map((a) => ({ ...a, pos: { x: a.pos.x, y: a.pos.y } })),
    ball: { ...view.ball },
    dives: view.dives.map((d) => ({ ...d })),
    markers: [],
    banner: null,
    replay: null,
  };
}

/** The recorded frame at (or just before) director time `time`. */
function frameAt(frames: SceneView[], time: number): SceneView | null {
  if (frames.length === 0) return null;
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].time <= time) lo = mid;
    else hi = mid - 1;
  }
  return frames[lo];
}
