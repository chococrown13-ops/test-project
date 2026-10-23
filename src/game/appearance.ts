/**
 * A player's look, derived from his id so the 3D match model and the 2D
 * portrait in menus always agree.
 */

export const SKIN = ['#f3cfb1', '#e0ac85', '#c18a60', '#9a6843', '#6e4630', '#4a2f20'];
export const HAIR = ['#17120f', '#2e2019', '#5a3d25', '#b8894a', '#d9c08a', '#0c0c0c'];
export const BOOTS = ['#111827', '#f8fafc', '#ef4444', '#f59e0b'];

export type HairStyle = 'short' | 'crop' | 'afro' | 'shaved' | 'bun';
const STYLES: HairStyle[] = ['short', 'crop', 'afro', 'shaved', 'bun'];

export interface Appearance {
  hash: number;
  skin: string;
  hair: string;
  boots: string;
  style: HairStyle;
  beard: boolean;
}

export function idHash(id: string): number {
  return [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
}

export function appearance(id: string): Appearance {
  const hash = idHash(id);
  return {
    hash,
    skin: SKIN[hash % SKIN.length],
    hair: HAIR[(hash >>> 3) % HAIR.length],
    boots: BOOTS[(hash >>> 6) % BOOTS.length],
    style: STYLES[hash % STYLES.length],
    beard: hash % 6 === 0,
  };
}
