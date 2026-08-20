import { ROLE_LABEL } from '../../game/formations';
import { overall } from '../../game/ratings';
import type { Player, Role } from '../../game/types';
import { gaugeColor } from './common';

/** Small vertical gauges for fitness / form / morale, in that order. */
function Gauges({ player }: { player: Player }) {
  const values = [
    { key: 'fit', value: player.fitness },
    { key: 'form', value: player.form },
    { key: 'mor', value: player.morale },
  ];
  return (
    <div className="bars" aria-hidden>
      {values.map(({ key, value }) => (
        <div className="bar" key={key}>
          <div
            className="bar__fill"
            style={{ height: `${Math.max(6, value)}%`, background: gaugeColor(value) }}
          />
        </div>
      ))}
    </div>
  );
}

export function PlayerRow({
  player,
  slot,
  selected,
  onClick,
  rating,
  goals,
}: {
  player: Player;
  /** Formation slot he is filling, when different from his natural role. */
  slot?: Role;
  selected?: boolean;
  onClick?: () => void;
  /** Live match rating, shown instead of the overall when a match is running. */
  rating?: number;
  goals?: number;
}) {
  const ovr = overall(player);
  const displayRole = slot ?? player.role;
  const outOfPosition = slot !== undefined && slot !== player.role;

  return (
    <button
      type="button"
      className={`player${selected ? ' player--selected' : ''}`}
      onClick={onClick}
      disabled={!onClick}
    >
      <span className={`player__pos player__pos--${player.group}`}>{ROLE_LABEL[displayRole]}</span>

      <span className="player__main">
        <span className="player__name">
          {player.name}
          {goals ? ' ' + '⚽'.repeat(Math.min(goals, 3)) : ''}
          {player.injuredFor > 0 && <span style={{ color: 'var(--bad)' }}> ✚</span>}
        </span>
        <span className="player__meta">
          <span>{player.age}세</span>
          <span>{player.nationality}</span>
          {outOfPosition && <span style={{ color: 'var(--warn)' }}>{ROLE_LABEL[player.role]} 자원</span>}
          {player.injuredFor > 0 && (
            <span style={{ color: 'var(--bad)' }}>{player.injuredFor}경기 결장</span>
          )}
        </span>
      </span>

      <Gauges player={player} />

      <span
        className="player__ovr"
        style={{ color: rating !== undefined ? gaugeColor(rating * 10) : undefined }}
      >
        {rating !== undefined ? rating.toFixed(1) : ovr}
      </span>
    </button>
  );
}
