import { useState } from 'react';
import { FORMATIONS, FORMATION_IDS, ROLE_LABEL } from '../../game/formations';
import {
  MENTALITY_LABEL,
  PASSING_LABEL,
  PRESSING_LABEL,
  TEMPO_LABEL,
  overall,
  teamStrength,
} from '../../game/ratings';
import type { GameState, Mentality, PassingStyle, Pressing, Tempo } from '../../game/types';
import { useGame } from '../../store/useGame';
import { Card, Field, Segmented, gaugeColor } from '../components/common';

export function TacticsScreen({ state }: { state: GameState }) {
  const setFormation = useGame((s) => s.setFormation);
  const setTactics = useGame((s) => s.setTactics);
  const swapPlayers = useGame((s) => s.swapPlayers);
  const [selected, setSelected] = useState<string | null>(null);

  const club = state.teams[state.clubId];
  const formation = FORMATIONS[club.formation];
  const byId = new Map(club.players.map((p) => [p.id, p]));
  const strength = teamStrength(club);

  const handleSlotTap = (playerId: string) => {
    if (selected === null) {
      setSelected(playerId);
    } else if (selected === playerId) {
      setSelected(null);
    } else {
      swapPlayers(selected, playerId);
      setSelected(null);
    }
  };

  const units = [
    { label: '공격', value: strength.attack },
    { label: '중원', value: strength.midfield },
    { label: '수비', value: strength.defence },
    { label: 'GK', value: strength.goalkeeper },
  ];

  return (
    <>
      <div className="pitch" style={{ marginBottom: 12 }}>
        <div className="pitch__stripes" />
        <div className="pitch__markings">
          <div className="pitch__halfway" />
          <div className="pitch__circle" />
          <div className="pitch__box pitch__box--bottom" />
          <div className="pitch__box pitch__box--top" />
          <div className="pitch__six pitch__six--bottom" />
          <div className="pitch__six pitch__six--top" />
        </div>

        {formation.layout.map((point, index) => {
          const id = club.lineup[index];
          const player = id ? byId.get(id) : undefined;
          const slot = formation.slots[index];
          return (
            <button
              key={index}
              type="button"
              className={`slot${selected === id ? ' slot--selected' : ''}`}
              // The layout runs from own goal up, so invert for screen coords.
              style={{ left: `${point.x}%`, top: `${100 - point.y}%` }}
              onClick={() => id && handleSlotTap(id)}
            >
              <span
                className="slot__shirt"
                style={{ background: club.color, color: club.accent }}
              >
                {player ? overall(player) : '-'}
              </span>
              <span className="slot__name">{player ? shortName(player.name) : '비어 있음'}</span>
              <span className="slot__role">{ROLE_LABEL[slot]}</span>
            </button>
          );
        })}
      </div>

      <Card title="교체 명단">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 10 }}>
          {club.bench.length === 0 && <span className="tiny faint">벤치가 비어 있습니다.</span>}
          {club.bench.map((id) => {
            const player = byId.get(id);
            if (!player) return null;
            return (
              <button
                key={id}
                type="button"
                className={`btn tiny${selected === id ? ' btn--primary' : ''}`}
                style={{ padding: '6px 10px', fontSize: 11.5 }}
                onClick={() => handleSlotTap(id)}
              >
                {ROLE_LABEL[player.role]} {shortName(player.name)} {overall(player)}
              </button>
            );
          })}
        </div>
      </Card>

      <Card title="팀 전력" padded>
        {units.map((unit) => (
          <div key={unit.label} className="attr" style={{ marginBottom: 7 }}>
            <span className="attr__label">{unit.label}</span>
            <span className="attr__track" style={{ width: 120 }}>
              <span
                className="attr__fill"
                style={{
                  width: `${Math.min(100, unit.value)}%`,
                  background: gaugeColor(unit.value),
                }}
              />
            </span>
            <span className="attr__value">{Math.round(unit.value)}</span>
          </div>
        ))}
      </Card>

      <Card title="전술" padded>
        <Field label="포메이션">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {FORMATION_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className={`btn${club.formation === id ? ' btn--primary' : ''}`}
                style={{ padding: '8px 12px', fontSize: 13, flex: '1 0 30%' }}
                onClick={() => {
                  setFormation(id);
                  setSelected(null);
                }}
              >
                {id}
              </button>
            ))}
          </div>
        </Field>

        <Field label="팀 성향">
          <Segmented<Mentality>
            value={club.tactics.mentality}
            onChange={(mentality) => setTactics({ mentality })}
            options={(Object.keys(MENTALITY_LABEL) as Mentality[]).map((value) => ({
              value,
              label: MENTALITY_LABEL[value],
            }))}
          />
        </Field>

        <Field label="템포">
          <Segmented<Tempo>
            value={club.tactics.tempo}
            onChange={(tempo) => setTactics({ tempo })}
            options={(Object.keys(TEMPO_LABEL) as Tempo[]).map((value) => ({
              value,
              label: TEMPO_LABEL[value],
            }))}
          />
        </Field>

        <Field label="압박 강도">
          <Segmented<Pressing>
            value={club.tactics.pressing}
            onChange={(pressing) => setTactics({ pressing })}
            options={(Object.keys(PRESSING_LABEL) as Pressing[]).map((value) => ({
              value,
              label: PRESSING_LABEL[value],
            }))}
          />
        </Field>

        <Field label="패스 길이">
          <Segmented<PassingStyle>
            value={club.tactics.passing}
            onChange={(passing) => setTactics({ passing })}
            options={(Object.keys(PASSING_LABEL) as PassingStyle[]).map((value) => ({
              value,
              label: PASSING_LABEL[value],
            }))}
          />
        </Field>

        <p className="tiny faint" style={{ marginTop: 4, marginBottom: 0 }}>
          공격적일수록 기회는 늘지만 뒷공간을 내줍니다. 높은 템포와 강한 압박은 체력을 빠르게
          소모시킵니다.
        </p>
      </Card>
    </>
  );
}

/**
 * "Lucas Fernandes" -> "Fernandes". Surname only, as squad lists and shirts
 * do it — an initial plus surname does not fit inside a pitch marker.
 */
function shortName(name: string): string {
  const parts = name.split(' ');
  return parts[parts.length - 1];
}
