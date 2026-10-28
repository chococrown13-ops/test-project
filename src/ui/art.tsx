import { useId } from 'react';
import { appearance, idHash } from '../game/appearance';
import { readableOn } from './match2d/director';

/**
 * Hand-drawn SVG art for menus: player portraits that match the 3D models,
 * club crests, and the tab icons.
 */

export function Avatar({ id, shirt, trim, size = 40, ring }: { id: string; shirt: string; trim: string; size?: number; ring?: string }) {
  const uid = useId().replace(/:/g, '');
  const look = appearance(id);
  const hair = look.hair;
  const hairShape = {
    short: <path d="M18.5 27 C17 11 47 11 45.5 27 C43 19 37 16.5 32 16.5 C27 16.5 21 19 18.5 27 Z" fill={hair} />,
    crop: <path d="M19 25 C19 13 45 13 45 25 C42 19.5 37 18 32 18 C27 18 22 19.5 19 25 Z" fill={hair} />,
    afro: null,
    shaved: <path d="M19 25 C19 13 45 13 45 25 C42 19.5 37 18 32 18 C27 18 22 19.5 19 25 Z" fill={hair} opacity={0.35} />,
    bun: (
      <>
        <circle cx={32} cy={10} r={5.5} fill={hair} />
        <path d="M18.5 27 C17 11 47 11 45.5 27 C43 19 37 16.5 32 16.5 C27 16.5 21 19 18.5 27 Z" fill={hair} />
      </>
    ),
  }[look.style];
  return (
    <svg className="avatar" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <radialGradient id={`bg${uid}`} cx="50%" cy="35%" r="70%">
          <stop offset="0" stopColor="#2a3a5c" />
          <stop offset="1" stopColor="#0d1424" />
        </radialGradient>
        <radialGradient id={`lit${uid}`} cx="35%" cy="25%" r="75%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.22" />
        </radialGradient>
        <clipPath id={`clip${uid}`}>
          <circle cx={32} cy={32} r={32} />
        </clipPath>
      </defs>
      <g clipPath={`url(#clip${uid})`}>
        <rect width={64} height={64} fill={`url(#bg${uid})`} />
        {look.style === 'afro' && <circle cx={32} cy={22} r={17} fill={hair} />}
        <path d="M5 66 C7 51 18 46 32 46 C46 46 57 51 59 66 Z" fill={shirt} />
        <path d="M5 66 C7 51 18 46 32 46 C46 46 57 51 59 66 Z" fill={`url(#lit${uid})`} />
        <rect x={26.5} y={37} width={11} height={11} rx={3} fill={look.skin} />
        <path d="M25 46.5 L32 54 L39 46.5" fill="none" stroke={trim} strokeWidth={3} strokeLinejoin="round" />
        <ellipse cx={19.2} cy={29.5} rx={2.6} ry={3.6} fill={look.skin} />
        <ellipse cx={44.8} cy={29.5} rx={2.6} ry={3.6} fill={look.skin} />
        <ellipse cx={32} cy={28} rx={13} ry={15} fill={look.skin} />
        {look.beard && <path d="M19.3 30 C20 44 26 45.5 32 45.5 C38 45.5 44 44 44.7 30 C42 38 38 39.5 32 39.5 C26 39.5 22 38 19.3 30 Z" fill={hair} opacity={0.9} />}
        {hairShape}
        <path d="M24.5 25.2 L29.5 24.6 M34.5 24.6 L39.5 25.2" stroke={hair} strokeWidth={1.6} strokeLinecap="round" />
        <ellipse cx={27.2} cy={29} rx={1.6} ry={1.8} fill="#1b1411" />
        <ellipse cx={36.8} cy={29} rx={1.6} ry={1.8} fill="#1b1411" />
        <path d="M32 30 L30.6 35 L33 35.4" fill="none" stroke="#000" strokeOpacity={0.22} strokeWidth={1.1} strokeLinecap="round" />
        <path d="M28.5 38.4 Q32 40 35.5 38.4" fill="none" stroke="#5a2a20" strokeOpacity={0.7} strokeWidth={1.3} strokeLinecap="round" />
        <ellipse cx={32} cy={28} rx={13} ry={15} fill={`url(#lit${uid})`} />
      </g>
      {ring && <circle cx={32} cy={32} r={30.5} fill="none" stroke={ring} strokeWidth={3} />}
    </svg>
  );
}

export interface CrestLike {
  short: string;
  primary: string;
  secondary: string;
}

const SHIELD = 'M20 1.5 L38 6.5 V22 C38 34 30 41 20 45 C10 41 2 34 2 22 V6.5 Z';

/** A shield in the club colours with one of six classic patterns. */
export function CrestArt({ club, size = 30 }: { club: CrestLike; size?: number }) {
  const uid = useId().replace(/:/g, '');
  const p = club.primary;
  const s = club.secondary;
  const pattern = idHash(club.short) % 6;
  const light = readableOn(p) === '#ffffff';
  return (
    <svg className="crest-svg" width={size} height={size * 1.15} viewBox="0 0 40 46" aria-hidden="true">
      <defs>
        <clipPath id={`sh${uid}`}>
          <path d={SHIELD} />
        </clipPath>
        <linearGradient id={`gl${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0.06" />
          <stop offset="1" stopColor="#000" stopOpacity="0.25" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#sh${uid})`}>
        <rect width={40} height={46} fill={p} />
        {pattern === 1 && [8, 20, 32].map((x) => <rect key={x} x={x - 3} y={0} width={6} height={46} fill={s} />)}
        {pattern === 2 && <rect x={20} y={0} width={20} height={46} fill={s} />}
        {pattern === 3 && <path d="M-4 10 L10 -4 L44 30 L30 44 Z" fill={s} />}
        {pattern === 4 && [14, 30].map((y) => <rect key={y} x={0} y={y - 4} width={40} height={8} fill={s} />)}
        {pattern === 5 && <path d="M0 18 L20 30 L40 18 V26 L20 38 L0 26 Z" fill={s} />}
        <rect x={0} y={0} width={40} height={11} fill="rgba(0,0,0,0.28)" />
        <rect width={40} height={46} fill={`url(#gl${uid})`} />
      </g>
      <path d={SHIELD} fill="none" stroke={s} strokeWidth={2.4} />
      <path d={SHIELD} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={0.8} />
      <text x={20} y={8.6} textAnchor="middle" fontSize={6.2} fontWeight={900} fill="#fff" letterSpacing={0.4}>
        ★
      </text>
      <text
        x={20}
        y={27}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={club.short.length > 3 ? 9 : 10.5}
        fontWeight={900}
        fill={light ? '#fff' : '#111827'}
        stroke={light ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.6)'}
        strokeWidth={1.6}
        paintOrder="stroke"
      >
        {club.short}
      </text>
    </svg>
  );
}

const ICON_PATHS: Record<string, JSX.Element> = {
  home: <path d="M3.5 11 L12 3.8 L20.5 11 V20 H14.5 V14.5 H9.5 V20 H3.5 Z" />,
  squad: (
    <>
      <circle cx={9} cy={8} r={3.4} />
      <path d="M2.8 20 C3.3 15.5 6 13.6 9 13.6 C12 13.6 14.7 15.5 15.2 20 Z" />
      <circle cx={16.8} cy={8.8} r={2.7} opacity={0.75} />
      <path d="M15.8 13.6 C18.8 13.4 20.8 15.4 21.3 19 H16.8" opacity={0.75} />
    </>
  ),
  tactics: (
    <>
      <rect x={3.5} y={3.5} width={17} height={17} rx={3} fill="none" strokeWidth={2} />
      <circle cx={8} cy={15.5} r={1.8} />
      <circle cx={16} cy={8.5} r={1.8} />
      <path d="M9.5 14 L14.3 9.8" fill="none" strokeWidth={1.8} strokeDasharray="2 1.6" />
      <path d="M12 17.5 L16 17.5 M14 15.5 L14 19.5" fill="none" strokeWidth={1.6} />
    </>
  ),
  recruit: (
    <>
      <circle cx={10.5} cy={10.5} r={6} fill="none" strokeWidth={2.4} />
      <path d="M15 15 L20.5 20.5" fill="none" strokeWidth={2.8} strokeLinecap="round" />
    </>
  ),
  comps: (
    <>
      <path d="M7 3.5 H17 V9 C17 12.5 14.8 14.5 12 14.5 C9.2 14.5 7 12.5 7 9 Z" />
      <path d="M7 5.5 H3.8 C3.8 9 5.4 10.5 7.4 10.8 M17 5.5 H20.2 C20.2 9 18.6 10.5 16.6 10.8" fill="none" strokeWidth={1.7} />
      <rect x={10.6} y={14} width={2.8} height={3.5} />
      <rect x={7.5} y={17.5} width={9} height={3} rx={1} />
    </>
  ),
  club: (
    <>
      <path d="M2.5 10 C6 6.5 18 6.5 21.5 10 V19.5 H2.5 Z" />
      <path d="M6 19.5 V14.5 H18 V19.5" fill="var(--icon-cut, #0b1222)" />
      <path d="M12 2.8 V7 M12 2.8 L15.5 4 L12 5.2" fill="none" strokeWidth={1.4} />
    </>
  ),
};

export function Icon({ name, size = 22 }: { name: keyof typeof ICON_PATHS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={0} strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  );
}
