/**
 * Positions and formations. FM26 lets a side use one formation with the ball
 * (In Possession) and another without it (Out of Possession); the same eleven
 * players fill both, so every IP slot is paired with an OOP slot.
 */

export type Position =
  | 'GK'
  | 'DL'
  | 'DC'
  | 'DR'
  | 'WBL'
  | 'WBR'
  | 'DM'
  | 'ML'
  | 'MC'
  | 'MR'
  | 'AML'
  | 'AMC'
  | 'AMR'
  | 'ST';

export const POSITIONS: Position[] = ['GK', 'DL', 'DC', 'DR', 'WBL', 'WBR', 'DM', 'ML', 'MC', 'MR', 'AML', 'AMC', 'AMR', 'ST'];

export const POS_LABEL: Record<Position, string> = {
  GK: 'GK',
  DL: 'LB',
  DC: 'CB',
  DR: 'RB',
  WBL: 'LWB',
  WBR: 'RWB',
  DM: 'DM',
  ML: 'LM',
  MC: 'CM',
  MR: 'RM',
  AML: 'LW',
  AMC: 'AM',
  AMR: 'RW',
  ST: 'ST',
};

export type Line = 'GK' | 'DEF' | 'MID' | 'ATT';

export const POS_LINE: Record<Position, Line> = {
  GK: 'GK',
  DL: 'DEF',
  DC: 'DEF',
  DR: 'DEF',
  WBL: 'DEF',
  WBR: 'DEF',
  DM: 'MID',
  ML: 'MID',
  MC: 'MID',
  MR: 'MID',
  AML: 'ATT',
  AMC: 'ATT',
  AMR: 'ATT',
  ST: 'ATT',
};

/** Where each position sits on the familiarity map: x 0-100 left to right, y 0-100 own goal upwards. */
export const POS_POINT: Record<Position, { x: number; y: number }> = {
  GK: { x: 50, y: 5 },
  DL: { x: 12, y: 24 },
  DC: { x: 50, y: 21 },
  DR: { x: 88, y: 24 },
  WBL: { x: 9, y: 40 },
  WBR: { x: 91, y: 40 },
  DM: { x: 50, y: 37 },
  ML: { x: 12, y: 55 },
  MC: { x: 50, y: 52 },
  MR: { x: 88, y: 55 },
  AML: { x: 14, y: 73 },
  AMC: { x: 50, y: 69 },
  AMR: { x: 86, y: 73 },
  ST: { x: 50, y: 86 },
};

/** Neighbouring positions: a player natural in one picks up the others more easily. */
export const POS_NEIGHBOURS: Record<Position, Position[]> = {
  GK: [],
  DL: ['WBL', 'DC', 'ML'],
  DC: ['DL', 'DR', 'DM'],
  DR: ['WBR', 'DC', 'MR'],
  WBL: ['DL', 'ML'],
  WBR: ['DR', 'MR'],
  DM: ['MC', 'DC'],
  ML: ['AML', 'WBL', 'MC'],
  MC: ['DM', 'AMC', 'ML', 'MR'],
  MR: ['AMR', 'WBR', 'MC'],
  AML: ['ML', 'AMC', 'ST'],
  AMC: ['MC', 'ST', 'AML', 'AMR'],
  AMR: ['MR', 'AMC', 'ST'],
  ST: ['AMC', 'AML', 'AMR'],
};

export interface Slot {
  pos: Position;
  x: number;
  y: number;
}

export type FormationId =
  | '4-4-2'
  | '4-3-3'
  | '4-2-3-1'
  | '4-1-4-1'
  | '4-4-1-1'
  | '4-3-1-2'
  | '3-4-3'
  | '3-5-2'
  | '3-4-2-1'
  | '3-2-5'
  | '5-3-2'
  | '5-4-1';

const s = (pos: Position, x: number, y: number): Slot => ({ pos, x, y });
const GK = s('GK', 50, 5);
const BACK4 = [s('DL', 14, 25), s('DC', 37, 20), s('DC', 63, 20), s('DR', 86, 25)];
const BACK3 = [s('DC', 26, 22), s('DC', 50, 19), s('DC', 74, 22)];
const BACK5 = [s('WBL', 9, 33), s('DC', 29, 20), s('DC', 50, 18), s('DC', 71, 20), s('WBR', 91, 33)];

export const FORMATIONS: Record<FormationId, Slot[]> = {
  '4-4-2': [GK, ...BACK4, s('ML', 13, 54), s('MC', 38, 49), s('MC', 62, 49), s('MR', 87, 54), s('ST', 38, 83), s('ST', 62, 83)],
  '4-3-3': [GK, ...BACK4, s('DM', 50, 37), s('MC', 32, 53), s('MC', 68, 53), s('AML', 15, 76), s('ST', 50, 86), s('AMR', 85, 76)],
  '4-2-3-1': [GK, ...BACK4, s('DM', 37, 39), s('DM', 63, 39), s('AML', 15, 70), s('AMC', 50, 67), s('AMR', 85, 70), s('ST', 50, 86)],
  '4-1-4-1': [GK, ...BACK4, s('DM', 50, 36), s('ML', 13, 57), s('MC', 37, 54), s('MC', 63, 54), s('MR', 87, 57), s('ST', 50, 85)],
  '4-4-1-1': [GK, ...BACK4, s('ML', 13, 53), s('MC', 38, 48), s('MC', 62, 48), s('MR', 87, 53), s('AMC', 50, 70), s('ST', 50, 86)],
  '4-3-1-2': [GK, ...BACK4, s('DM', 50, 37), s('MC', 30, 51), s('MC', 70, 51), s('AMC', 50, 68), s('ST', 38, 84), s('ST', 62, 84)],
  '3-4-3': [GK, ...BACK3, s('WBL', 10, 48), s('MC', 38, 47), s('MC', 62, 47), s('WBR', 90, 48), s('AML', 18, 76), s('ST', 50, 86), s('AMR', 82, 76)],
  '3-5-2': [GK, ...BACK3, s('WBL', 9, 50), s('DM', 50, 37), s('MC', 33, 53), s('MC', 67, 53), s('WBR', 91, 50), s('ST', 38, 84), s('ST', 62, 84)],
  '3-4-2-1': [GK, ...BACK3, s('WBL', 10, 47), s('MC', 38, 45), s('MC', 62, 45), s('WBR', 90, 47), s('AMC', 34, 71), s('AMC', 66, 71), s('ST', 50, 86)],
  '3-2-5': [GK, ...BACK3, s('DM', 38, 41), s('DM', 62, 41), s('AML', 10, 74), s('AMC', 33, 72), s('ST', 50, 87), s('AMC', 67, 72), s('AMR', 90, 74)],
  '5-3-2': [GK, ...BACK5, s('MC', 30, 51), s('MC', 50, 54), s('MC', 70, 51), s('ST', 38, 83), s('ST', 62, 83)],
  '5-4-1': [GK, ...BACK5, s('ML', 14, 54), s('MC', 38, 50), s('MC', 62, 50), s('MR', 86, 54), s('ST', 50, 84)],
};

export const FORMATION_IDS = Object.keys(FORMATIONS) as FormationId[];

/** Shapes FM players reach for with the ball vs without it. Shown as hints in the picker. */
export const FORMATION_HINT: Partial<Record<FormationId, string>> = {
  '3-2-5': '빌드업 전용 형태 — 풀백이 안으로 좁혀 들어오는 공격 형태',
  '3-4-2-1': '공격 시 윙백을 높이 올리는 형태',
  '4-4-2': '수비 시 가장 단단한 두 줄 블록',
  '5-4-1': '낮은 블록 수비',
};

/**
 * The grid a player can be dragged to, as on FM's tactics screen: five
 * lanes across each line, plus wing-back spots. Moving one player to a
 * different spot is how asymmetric shapes are made (say, only the left-back
 * pushed up to wing-back).
 */
export interface Spot extends Slot {
  id: string;
}

const spot = (id: string, pos: Position, x: number, y: number): Spot => ({ id, pos, x, y });

export const SPOTS: Spot[] = [
  spot('DL', 'DL', 12, 23),
  spot('DCL', 'DC', 31, 21),
  spot('DC', 'DC', 50, 20),
  spot('DCR', 'DC', 69, 21),
  spot('DR', 'DR', 88, 23),
  spot('WBL', 'WBL', 9, 41),
  spot('DML', 'DM', 31, 37),
  spot('DM', 'DM', 50, 36),
  spot('DMR', 'DM', 69, 37),
  spot('WBR', 'WBR', 91, 41),
  spot('ML', 'ML', 12, 55),
  spot('MCL', 'MC', 31, 52),
  spot('MC', 'MC', 50, 52),
  spot('MCR', 'MC', 69, 52),
  spot('MR', 'MR', 88, 55),
  spot('AML', 'AML', 13, 73),
  spot('AMCL', 'AMC', 31, 70),
  spot('AMC', 'AMC', 50, 69),
  spot('AMCR', 'AMC', 69, 70),
  spot('AMR', 'AMR', 87, 73),
  spot('STL', 'ST', 34, 85),
  spot('ST', 'ST', 50, 87),
  spot('STR', 'ST', 66, 85),
];

/** The grid spot closest to a point on the pitch. */
export function nearestSpot(x: number, y: number): Spot {
  let best = SPOTS[0];
  let bestD = Infinity;
  SPOTS.forEach((s) => {
    const d = Math.hypot(s.x - x, (s.y - y) * 1.2);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  });
  return best;
}

/**
 * Pair every IP slot with an OOP slot so each player's two jobs are as close
 * on the pitch as possible (Hungarian algorithm, 11 x 11). Slot 0 is always
 * the keeper in both shapes.
 * Returns oopOf[ipSlot] = oopSlot.
 */
export function pairSlots(ip: Slot[], oop: Slot[]): number[] {
  const n = ip.length;
  const cost: number[][] = ip.map((a) =>
    oop.map((b) => {
      if ((a.pos === 'GK') !== (b.pos === 'GK')) return 1e6;
      return Math.hypot(a.x - b.x, (a.y - b.y) * 1.3);
    }),
  );
  return hungarian(cost).slice(0, n);
}

/** Minimum-cost assignment for a square matrix. Returns assignment[row] = column. */
export function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0);
  const way = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(Infinity);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const result = new Array(n).fill(0);
  for (let j = 1; j <= n; j++) if (p[j] > 0) result[p[j] - 1] = j - 1;
  return result;
}
