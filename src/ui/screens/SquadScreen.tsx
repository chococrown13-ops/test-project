import { useState } from 'react';
import { FORMATIONS } from '../../game/formations';
import { overall } from '../../game/ratings';
import type { GameState, Player } from '../../game/types';
import { useGame } from '../../store/useGame';
import { Card } from '../components/common';
import { PlayerDetail } from '../components/PlayerDetail';
import { PlayerRow } from '../components/PlayerRow';

export function SquadScreen({ state }: { state: GameState }) {
  const swapPlayers = useGame((s) => s.swapPlayers);
  const autoPick = useGame((s) => s.autoPick);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Player | null>(null);

  const club = state.teams[state.clubId];
  const byId = new Map(club.players.map((p) => [p.id, p]));
  const slots = FORMATIONS[club.formation].slots;

  const reserves = club.players
    .filter((p) => !club.lineup.includes(p.id) && !club.bench.includes(p.id))
    .sort((a, b) => overall(b) - overall(a));

  /** First tap selects, second tap swaps. Tapping the same player opens him. */
  const handleTap = (playerId: string) => {
    if (selected === null) {
      setSelected(playerId);
      return;
    }
    if (selected === playerId) {
      setSelected(null);
      const player = byId.get(playerId);
      if (player) setDetail(player);
      return;
    }
    swapPlayers(selected, playerId);
    setSelected(null);
  };

  return (
    <>
      <Card
        title={`선발 ${club.formation}`}
        action={
          <button
            type="button"
            className="btn tiny"
            style={{ padding: '5px 10px', fontSize: 11 }}
            onClick={() => {
              autoPick();
              setSelected(null);
            }}
          >
            자동 선발
          </button>
        }
      >
        {club.lineup.map((id, index) => {
          const player = byId.get(id);
          if (!player) return null;
          return (
            <PlayerRow
              key={id}
              player={player}
              slot={slots[index]}
              selected={selected === id}
              onClick={() => handleTap(id)}
            />
          );
        })}
      </Card>

      <Card title={`교체 명단 (${club.bench.length})`}>
        {club.bench.length === 0 && <div className="empty">벤치가 비어 있습니다.</div>}
        {club.bench.map((id) => {
          const player = byId.get(id);
          if (!player) return null;
          return (
            <PlayerRow
              key={id}
              player={player}
              selected={selected === id}
              onClick={() => handleTap(id)}
            />
          );
        })}
      </Card>

      <Card title={`나머지 선수 (${reserves.length})`}>
        {reserves.length === 0 && <div className="empty">모든 선수가 명단에 포함되어 있습니다.</div>}
        {reserves.map((player) => (
          <PlayerRow
            key={player.id}
            player={player}
            selected={selected === player.id}
            onClick={() => handleTap(player.id)}
          />
        ))}
      </Card>

      <p className="tiny faint" style={{ textAlign: 'center', padding: '0 12px 8px' }}>
        선수를 탭해 선택하고, 다른 선수를 탭하면 자리를 바꿉니다. 같은 선수를 다시 탭하면 상세
        정보를 봅니다. 막대는 왼쪽부터 체력 · 폼 · 사기입니다.
      </p>

      {detail && <PlayerDetail player={detail} onClose={() => setDetail(null)} />}
    </>
  );
}
