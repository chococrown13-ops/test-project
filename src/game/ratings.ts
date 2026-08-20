import { FORMATIONS, ROLE_GROUP, roleFamiliarity } from './formations';
import { clamp } from './rng';
import type { Mentality, Player, Role, Team, Tactics } from './types';

/** Weighted headline number shown in the squad list (0-99). */
export function overall(player: Player): number {
  const a = player.attributes;
  switch (player.group) {
    case 'GK':
      return Math.round(a.goalkeeping * 0.72 + a.physical * 0.16 + a.passing * 0.12);
    case 'DF':
      return Math.round(a.defending * 0.5 + a.physical * 0.24 + a.passing * 0.16 + a.dribbling * 0.1);
    case 'MF':
      return Math.round(a.passing * 0.36 + a.dribbling * 0.22 + a.defending * 0.22 + a.physical * 0.2);
    case 'FW':
      return Math.round(a.shooting * 0.42 + a.dribbling * 0.26 + a.physical * 0.18 + a.passing * 0.14);
  }
}

/**
 * Ability actually available on the day: raw overall bent by form, morale and
 * fitness. This is what the match engine consumes, never `overall` directly.
 */
export function effectiveAbility(player: Player, slot?: Role): number {
  const base = overall(player);
  const formMod = 0.9 + (player.form / 100) * 0.2; // 0.90 - 1.10
  const moraleMod = 0.95 + (player.morale / 100) * 0.1; // 0.95 - 1.05
  // Fitness only starts to bite below 80, then falls away sharply.
  const fitnessMod = player.fitness >= 80 ? 1 : 0.6 + (player.fitness / 80) * 0.4;
  const familiarity = slot ? roleFamiliarity(player.role, slot) : 1;
  return base * formMod * moraleMod * fitnessMod * familiarity;
}

export interface TeamStrength {
  attack: number;
  midfield: number;
  defence: number;
  goalkeeper: number;
  /** Blended number for quick comparisons and the pre-match odds. */
  overall: number;
}

const MENTALITY_SHIFT: Record<Mentality, { attack: number; defence: number }> = {
  defensive: { attack: -0.16, defence: 0.14 },
  cautious: { attack: -0.07, defence: 0.07 },
  balanced: { attack: 0, defence: 0 },
  positive: { attack: 0.08, defence: -0.07 },
  attacking: { attack: 0.17, defence: -0.15 },
};

/**
 * Aggregate the eleven on the pitch into four unit ratings, then apply tactics.
 * `onPitch` lets the match engine re-evaluate after subs and red cards.
 */
export function teamStrength(team: Team, onPitch: string[] = team.lineup): TeamStrength {
  const formation = FORMATIONS[team.formation];
  const byId = new Map(team.players.map((p) => [p.id, p]));

  let attack = 0;
  let midfield = 0;
  let defence = 0;
  let goalkeeper = 0;
  let attackWeight = 0;
  let midWeight = 0;
  let defWeight = 0;

  onPitch.forEach((id) => {
    const player = byId.get(id);
    if (!player) return;
    // A player keeps the slot he was picked for even after others come off.
    const slotIndex = team.lineup.indexOf(id);
    const slot = slotIndex >= 0 ? formation.slots[slotIndex] : player.role;
    const ability = effectiveAbility(player, slot);
    const group = ROLE_GROUP[slot];

    if (group === 'GK') {
      goalkeeper = ability;
      return;
    }
    // Every outfielder contributes to each phase, weighted by where he plays.
    const weights =
      group === 'DF'
        ? { att: 0.12, mid: 0.3, def: 1 }
        : group === 'MF'
          ? { att: 0.45, mid: 1, def: 0.5 }
          : { att: 1, mid: 0.35, def: 0.1 };

    attack += ability * weights.att;
    attackWeight += weights.att;
    midfield += ability * weights.mid;
    midWeight += weights.mid;
    defence += ability * weights.def;
    defWeight += weights.def;
  });

  attack = attackWeight > 0 ? attack / attackWeight : 40;
  midfield = midWeight > 0 ? midfield / midWeight : 40;
  defence = defWeight > 0 ? defence / defWeight : 40;
  if (goalkeeper === 0) goalkeeper = 35; // outfielder in goal

  const applied = applyTactics({ attack, midfield, defence, goalkeeper }, team.tactics);
  return {
    ...applied,
    overall:
      applied.attack * 0.3 + applied.midfield * 0.3 + applied.defence * 0.27 + applied.goalkeeper * 0.13,
  };
}

function applyTactics(
  units: { attack: number; midfield: number; defence: number; goalkeeper: number },
  tactics: Tactics,
): { attack: number; midfield: number; defence: number; goalkeeper: number } {
  const shift = MENTALITY_SHIFT[tactics.mentality];
  let { attack, midfield, defence } = units;

  attack *= 1 + shift.attack;
  defence *= 1 + shift.defence;

  // High tempo creates more but leaves gaps; slow tempo is the reverse.
  if (tactics.tempo === 'high') {
    attack *= 1.06;
    defence *= 0.96;
  } else if (tactics.tempo === 'slow') {
    attack *= 0.95;
    midfield *= 1.05;
  }

  // Pressing wins the ball higher but stretches the back line.
  if (tactics.pressing === 'high') {
    midfield *= 1.08;
    defence *= 0.94;
  } else if (tactics.pressing === 'low') {
    midfield *= 0.95;
    defence *= 1.06;
  }

  // Short passing dominates the ball; direct bypasses it.
  if (tactics.passing === 'short') {
    midfield *= 1.07;
    attack *= 0.97;
  } else if (tactics.passing === 'direct') {
    midfield *= 0.93;
    attack *= 1.05;
  }

  return {
    attack: clamp(attack, 1, 120),
    midfield: clamp(midfield, 1, 120),
    defence: clamp(defence, 1, 120),
    goalkeeper: units.goalkeeper,
  };
}

/** Fraction of the ball each side sees, from the midfield battle. */
export function possessionSplit(home: TeamStrength, away: TeamStrength, homeAdvantage = 1.04): number {
  const h = home.midfield * homeAdvantage;
  const a = away.midfield;
  return clamp(h / (h + a), 0.25, 0.75);
}

export const MENTALITY_LABEL: Record<Mentality, string> = {
  defensive: '수비적',
  cautious: '신중하게',
  balanced: '균형',
  positive: '적극적',
  attacking: '공격적',
};

export const TEMPO_LABEL = { slow: '느리게', normal: '보통', high: '빠르게' } as const;
export const PRESSING_LABEL = { low: '낮게', medium: '중간', high: '강하게' } as const;
export const PASSING_LABEL = { short: '짧게', mixed: '섞어서', direct: '길게' } as const;
