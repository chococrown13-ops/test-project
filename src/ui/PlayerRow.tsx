import type { ReactNode } from 'react';
import { bestPosition, caStars } from '../game/ability';
import { knowledgeOf } from '../game/generate';
import type { GameState, Player } from '../game/types';
import { NATION_LABEL } from '../game/names';
import { PosBadge, Stars } from './kit';

/** Current/potential stars as the user knows them: hidden until scouted enough. */
export function KnownStars({ state, player, potential }: { state: GameState; player: Player; potential?: boolean }) {
  const k = knowledgeOf(state, player);
  if (k < 30) return <span className="tiny faint">?</span>;
  const value = caStars(potential ? player.pa : player.ca);
  // Potential is the hardest thing to read; scouts round it until they know him well.
  const shown = potential && k < 70 ? Math.max(0.5, Math.round(value) - 0.5) : value;
  return <Stars value={shown} />;
}

export function PlayerRow({
  state,
  player,
  onClick,
  end,
  meta,
}: {
  state: GameState;
  player: Player;
  onClick?: () => void;
  end?: ReactNode;
  meta?: ReactNode;
}) {
  const club = player.clubId ? state.clubs[player.clubId] : null;
  return (
    <button type="button" className="list-row" onClick={onClick} disabled={!onClick}>
      <PosBadge pos={bestPosition(player)} />
      <span className="list-row__main">
        <span className="list-row__title" style={{ display: 'block' }}>
          {player.name}
          {player.injury && <span className="bad"> ✚</span>}
          {player.suspension > 0 && <span className="bad"> ⛔</span>}
          {player.unhappy && <span className="warn"> !</span>}
          {player.loan && <span className="badge badge--blue" style={{ marginLeft: 4 }}>임대</span>}
          {player.listed && <span className="badge badge--warn" style={{ marginLeft: 4 }}>{player.listed === 'transfer' ? '이적' : '임대'} 리스트</span>}
        </span>
        <span className="list-row__meta">
          {meta ?? (
            <>
              <span>{player.age}세</span>
              <span>{NATION_LABEL[player.nation] ?? player.nation}</span>
              {club && club.id !== state.clubId && <span>{club.name}</span>}
              {!club && <span className="warn">자유계약</span>}
            </>
          )}
        </span>
      </span>
      <span className="list-row__end">{end ?? <KnownStars state={state} player={player} />}</span>
    </button>
  );
}
