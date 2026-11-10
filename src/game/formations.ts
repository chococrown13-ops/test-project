import type { FormationId, PositionGroup, Role } from './types';

export interface Formation {
  id: FormationId;
  /** Slots in display order: GK first, then back to front. */
  slots: Role[];
  /** Normalised pitch coordinates for the tactics view. x: 0-100 (left-right), y: 0-100 (own goal -> opposition goal). */
  layout: { x: number; y: number }[];
}

export const FORMATIONS: Record<FormationId, Formation> = {
  '4-4-2': {
    id: '4-4-2',
    slots: ['GK', 'DL', 'DC', 'DC', 'DR', 'ML', 'MC', 'MC', 'MR', 'ST', 'ST'],
    layout: [
      { x: 50, y: 6 },
      { x: 16, y: 26 }, { x: 38, y: 22 }, { x: 62, y: 22 }, { x: 84, y: 26 },
      { x: 16, y: 55 }, { x: 39, y: 52 }, { x: 61, y: 52 }, { x: 84, y: 55 },
      { x: 38, y: 82 }, { x: 62, y: 82 },
    ],
  },
  '4-3-3': {
    id: '4-3-3',
    slots: ['GK', 'DL', 'DC', 'DC', 'DR', 'DM', 'MC', 'MC', 'ML', 'ST', 'MR'],
    layout: [
      { x: 50, y: 6 },
      { x: 16, y: 26 }, { x: 38, y: 22 }, { x: 62, y: 22 }, { x: 84, y: 26 },
      { x: 50, y: 44 }, { x: 32, y: 58 }, { x: 68, y: 58 },
      { x: 15, y: 80 }, { x: 50, y: 85 }, { x: 85, y: 80 },
    ],
  },
  '4-2-3-1': {
    id: '4-2-3-1',
    slots: ['GK', 'DL', 'DC', 'DC', 'DR', 'DM', 'DM', 'ML', 'AM', 'MR', 'ST'],
    layout: [
      { x: 50, y: 6 },
      { x: 16, y: 26 }, { x: 38, y: 22 }, { x: 62, y: 22 }, { x: 84, y: 26 },
      { x: 37, y: 45 }, { x: 63, y: 45 },
      { x: 15, y: 68 }, { x: 50, y: 66 }, { x: 85, y: 68 },
      { x: 50, y: 87 },
    ],
  },
  '3-5-2': {
    id: '3-5-2',
    slots: ['GK', 'DC', 'DC', 'DC', 'ML', 'MC', 'MC', 'MC', 'MR', 'ST', 'ST'],
    layout: [
      { x: 50, y: 6 },
      { x: 28, y: 23 }, { x: 50, y: 20 }, { x: 72, y: 23 },
      { x: 10, y: 54 }, { x: 31, y: 48 }, { x: 50, y: 58 }, { x: 69, y: 48 }, { x: 90, y: 54 },
      { x: 38, y: 83 }, { x: 62, y: 83 },
    ],
  },
  '5-3-2': {
    id: '5-3-2',
    slots: ['GK', 'DL', 'DC', 'DC', 'DC', 'DR', 'MC', 'MC', 'MC', 'ST', 'ST'],
    layout: [
      { x: 50, y: 6 },
      { x: 9, y: 32 }, { x: 29.5, y: 20 }, { x: 50, y: 23 }, { x: 70.5, y: 20 }, { x: 91, y: 32 },
      { x: 30, y: 55 }, { x: 50, y: 58 }, { x: 70, y: 55 },
      { x: 38, y: 83 }, { x: 62, y: 83 },
    ],
  },
};

export const FORMATION_IDS = Object.keys(FORMATIONS) as FormationId[];

export const ROLE_GROUP: Record<Role, PositionGroup> = {
  GK: 'GK',
  DC: 'DF',
  DL: 'DF',
  DR: 'DF',
  DM: 'MF',
  MC: 'MF',
  ML: 'MF',
  MR: 'MF',
  AM: 'MF',
  ST: 'FW',
};

export const ROLE_LABEL: Record<Role, string> = {
  GK: 'GK',
  DC: 'CB',
  DL: 'LB',
  DR: 'RB',
  DM: 'DM',
  MC: 'CM',
  ML: 'LM',
  MR: 'RM',
  AM: 'AM',
  ST: 'ST',
};

/**
 * How well a player copes in a slot he isn't built for. Full effectiveness at
 * his own role, a modest tax for adjacent ones, a heavy tax across the pitch.
 */
export function roleFamiliarity(playerRole: Role, slot: Role): number {
  if (playerRole === slot) return 1;
  // Keepers are keepers.
  if (playerRole === 'GK' || slot === 'GK') return 0.35;

  const adjacency: Partial<Record<Role, Role[]>> = {
    DC: ['DL', 'DR', 'DM'],
    DL: ['DC', 'ML', 'DR'],
    DR: ['DC', 'MR', 'DL'],
    DM: ['MC', 'DC'],
    MC: ['DM', 'AM', 'ML', 'MR'],
    ML: ['MR', 'MC', 'DL', 'AM'],
    MR: ['ML', 'MC', 'DR', 'AM'],
    AM: ['MC', 'ST', 'ML', 'MR'],
    ST: ['AM', 'ML', 'MR'],
  };

  if (adjacency[playerRole]?.includes(slot)) return 0.88;
  if (ROLE_GROUP[playerRole] === ROLE_GROUP[slot]) return 0.8;
  return 0.62;
}
