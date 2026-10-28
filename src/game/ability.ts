import { A, H, type AttrKey } from './attributes';
import { POS_LINE, type Position } from './formations';
import type { Money, Player } from './types';

/**
 * How much each attribute matters at each position. Current ability (CA,
 * 1-200, hidden like in FM) is the weighted average for the player's best
 * position, stretched onto the 1-200 scale.
 */
type Weights = Partial<Record<AttrKey, number>>;

const MENTAL_CORE: Weights = { decisions: 1, composure: 0.7, anticipation: 0.8, concentration: 0.6, teamwork: 0.5, workRate: 0.5 };
const PHYS_CORE: Weights = { pace: 0.7, acceleration: 0.7, stamina: 0.6, strength: 0.5, agility: 0.4, balance: 0.4, naturalFitness: 0.3 };

const POS_WEIGHTS: Record<'GK' | 'CB' | 'FB' | 'DM' | 'CM' | 'WM' | 'AM' | 'W' | 'ST', Weights> = {
  GK: {
    reflexes: 2,
    handling: 1.6,
    oneOnOnes: 1.4,
    aerialReach: 1.2,
    commandOfArea: 1,
    positioning: 1.2,
    kicking: 0.7,
    communication: 0.6,
    rushingOut: 0.6,
    throwing: 0.4,
    punching: 0.4,
    agility: 0.8,
    concentration: 0.8,
    decisions: 0.8,
    composure: 0.5,
  },
  CB: { ...MENTAL_CORE, ...PHYS_CORE, marking: 1.6, tackling: 1.6, positioning: 1.6, heading: 1.3, jumping: 1, strength: 1, bravery: 0.6, passing: 0.5 },
  FB: { ...MENTAL_CORE, ...PHYS_CORE, tackling: 1.2, marking: 1.1, positioning: 1.1, crossing: 0.9, passing: 0.7, pace: 1, stamina: 1, workRate: 0.9, dribbling: 0.4 },
  DM: { ...MENTAL_CORE, ...PHYS_CORE, tackling: 1.4, positioning: 1.4, passing: 1.1, marking: 0.9, firstTouch: 0.6, teamwork: 1, stamina: 0.8 },
  CM: { ...MENTAL_CORE, ...PHYS_CORE, passing: 1.6, vision: 1.1, firstTouch: 1.1, technique: 1, tackling: 0.6, stamina: 0.9, offTheBall: 0.6, longShots: 0.4 },
  WM: { ...MENTAL_CORE, ...PHYS_CORE, crossing: 1.3, dribbling: 1.1, passing: 1, technique: 0.8, pace: 1, stamina: 1, workRate: 0.9, firstTouch: 0.6 },
  AM: { ...MENTAL_CORE, ...PHYS_CORE, passing: 1.4, vision: 1.4, technique: 1.3, firstTouch: 1.2, dribbling: 1, flair: 0.8, offTheBall: 0.9, longShots: 0.6, finishing: 0.5 },
  W: { ...MENTAL_CORE, ...PHYS_CORE, dribbling: 1.5, crossing: 1, technique: 1.1, pace: 1.4, acceleration: 1.4, flair: 0.8, offTheBall: 0.9, finishing: 0.7, firstTouch: 0.8 },
  ST: { ...MENTAL_CORE, ...PHYS_CORE, finishing: 2, offTheBall: 1.4, composure: 1.2, firstTouch: 1, heading: 0.8, technique: 0.7, dribbling: 0.6, acceleration: 1.1, strength: 0.7 },
};

export function weightKey(pos: Position): keyof typeof POS_WEIGHTS {
  switch (pos) {
    case 'GK':
      return 'GK';
    case 'DC':
      return 'CB';
    case 'DL':
    case 'DR':
    case 'WBL':
    case 'WBR':
      return 'FB';
    case 'DM':
      return 'DM';
    case 'MC':
      return 'CM';
    case 'ML':
    case 'MR':
      return 'WM';
    case 'AMC':
      return 'AM';
    case 'AML':
    case 'AMR':
      return 'W';
    case 'ST':
      return 'ST';
  }
}

export function positionWeights(pos: Position): Weights {
  return POS_WEIGHTS[weightKey(pos)];
}

/** Positional quality on the 1-20 scale, ignoring familiarity. */
export function positionScore(attrs: number[], pos: Position): number {
  const weights = POS_WEIGHTS[weightKey(pos)];
  let sum = 0;
  let total = 0;
  for (const key in weights) {
    const w = weights[key as AttrKey]!;
    sum += attrs[A[key as AttrKey]] * w;
    total += w;
  }
  return sum / total;
}

/** The position he plays best: natural positions first, then by quality. */
export function bestPosition(player: Player): Position {
  let best: Position = 'MC';
  let bestScore = -1;
  (Object.keys(player.positions) as Position[]).forEach((pos) => {
    const fam = player.positions[pos] ?? 0;
    const score = positionScore(player.attrs, pos) * familiarityMult(fam);
    if (score > bestScore) {
      bestScore = score;
      best = pos;
    }
  });
  return best;
}

export function computeCA(player: Player): number {
  const score = positionScore(player.attrs, bestPosition(player));
  return Math.max(1, Math.min(200, Math.round((score - 1) * 10.5)));
}

/** Effectiveness when playing out of position. 1.0 when natural (18+). */
export function familiarityMult(familiarity: number): number {
  return 0.5 + 0.5 * Math.pow(Math.min(1, familiarity / 18), 1.2);
}

export function familiarityLabel(familiarity: number): string {
  if (familiarity >= 18) return '주 포지션';
  if (familiarity >= 15) return '능숙';
  if (familiarity >= 11) return '준수';
  if (familiarity >= 7) return '어색함';
  return '불가';
}

/** Five-star scale used for ability and potential (half stars). */
export function caStars(ca: number): number {
  return Math.max(0.5, Math.min(5, Math.round((ca / 34) * 2) / 2));
}

export function lineOf(player: Player) {
  return POS_LINE[bestPosition(player)];
}

export function marketValue(player: Player, season: number): Money {
  let value = 80 * Math.pow(1.048, player.ca);
  if (player.age < 23) {
    const upside = Math.max(0, player.pa - player.ca);
    value *= 1 + (upside / 70) * ((23 - player.age) / 5);
  }
  if (player.age > 29) value *= Math.pow(0.84, player.age - 29);
  const years = player.contract ? player.contract.expires - season : 0;
  if (years <= 0) value *= 0.55;
  else if (years === 1) value *= 0.8;
  value *= 0.85 + player.reputation / 330;
  return roundMoney(value);
}

/** Weekly wage a player expects at a club of the given reputation. */
export function wageDemand(player: Player, clubReputation: number): Money {
  const base = 1.3 * Math.pow(1.04, player.ca);
  const repFactor = 0.8 + clubReputation / 250;
  const ageFactor = player.age < 20 ? 0.55 : player.age > 31 ? 0.85 : 1;
  const ambition = 0.9 + player.hidden[H.ambition] / 100;
  return Math.max(5, roundMoney(base * repFactor * ageFactor * ambition));
}

export function roundMoney(value: number): Money {
  if (value >= 10000) return Math.round(value / 500) * 500;
  if (value >= 1000) return Math.round(value / 50) * 50;
  if (value >= 100) return Math.round(value / 10) * 10;
  return Math.max(1, Math.round(value));
}

/** "12.5억", "3,500만" — money is stored in 만원. */
export function formatMoney(value: Money): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 10000) {
    const eok = abs / 10000;
    return `${sign}${eok >= 100 ? Math.round(eok) : eok.toFixed(1).replace(/\.0$/, '')}억`;
  }
  return `${sign}${Math.round(abs).toLocaleString('ko-KR')}만`;
}

/** FM-style personality, derived from the hidden attributes. */
export function personality(player: Player): string {
  const h = player.hidden;
  const prof = h[H.professionalism];
  const amb = h[H.ambition];
  const loy = h[H.loyalty];
  const tem = h[H.temperament];
  const pre = h[H.pressure];
  const det = player.attrs[A.determination];
  if (prof >= 18 && det >= 16) return '모범적인 프로';
  if (prof >= 16) return '프로페셔널';
  if (det >= 17 && pre >= 14) return '강인한 승부사';
  if (amb >= 17 && prof >= 12) return '야심가';
  if (loy >= 17) return '충성스러운';
  if (tem <= 5 && prof <= 8) return '다혈질';
  if (prof <= 6) return '느슨한';
  if (pre <= 6) return '중압감에 약함';
  if (amb <= 6) return '안주형';
  if (h[H.consistency] >= 16) return '꾸준한';
  return '무난한';
}

export function moraleLabel(morale: number): string {
  if (morale >= 85) return '최상';
  if (morale >= 70) return '좋음';
  if (morale >= 50) return '보통';
  if (morale >= 30) return '나쁨';
  return '최악';
}

export function conditionTone(value: number): 'good' | 'ok' | 'bad' {
  if (value >= 85) return 'good';
  if (value >= 70) return 'ok';
  return 'bad';
}

export function averageRating(player: Player, season: number): number | null {
  const s = player.seasons.find((x) => x.season === season && x.clubId === player.clubId);
  if (!s || s.ratingCount === 0) return null;
  return s.ratingSum / s.ratingCount;
}
