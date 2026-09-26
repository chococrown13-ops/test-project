// Two looks for the same game. The theme id lives on <html data-theme>, and
// everything visual keys off CSS variables under it.

export type ThemeId = 'ink' | 'bloom';

export interface ThemeInfo {
  id: ThemeId;
  name: string;
  desc: string;
  themeColor: string;
}

export const THEMES: Record<ThemeId, ThemeInfo> = {
  ink: { id: 'ink', name: '먹', desc: '고요하고 어두운', themeColor: '#0f0e0c' },
  bloom: { id: 'bloom', name: '봄', desc: '말랑하고 밝은', themeColor: '#fff4e8' },
};

const KEY = 'sudoku:theme';

export function getTheme(): ThemeId {
  try {
    const t = localStorage.getItem(KEY);
    if (t === 'ink' || t === 'bloom') return t;
  } catch {
    /* fall through to the system preference */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'ink' : 'bloom';
}

export function applyTheme(t: ThemeId): void {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', THEMES[t].themeColor);
}

export function setTheme(t: ThemeId): void {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* ignore */
  }
  applyTheme(t);
}
