import { install, type Theme } from '../sim/units';
import { DOKKAEBI } from './dokkaebi';
import { HANSIK } from './hansik';
import { SEASONS } from './seasons';

export const THEMES: Theme[] = [DOKKAEBI, HANSIK, SEASONS];
export const themeById = (id: string) => THEMES.find((t) => t.id === id) ?? DOKKAEBI;
export function useTheme(id: string): Theme { const t = themeById(id); install(t); return t; }
