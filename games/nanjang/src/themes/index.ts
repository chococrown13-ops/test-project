import { install, type Theme } from '../sim/units';
import { HANSIK } from './hansik';
import { SEASONS } from './seasons';
import { SPIRITS } from './spirits';

export const THEMES: Theme[] = [SPIRITS, HANSIK, SEASONS];
export const themeById = (id: string) => THEMES.find((t) => t.id === id) ?? SPIRITS;
export function useTheme(id: string): Theme { const t = themeById(id); install(t); return t; }
