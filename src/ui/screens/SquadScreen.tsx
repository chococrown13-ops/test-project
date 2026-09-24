import { useState } from 'react';
import { FORMATIONS, ROLE_LABEL } from '../../game/formations';
import { overall } from '../../game/ratings';
import type { AttributeKey, GameState, Player, Role } from '../../game/types';
import { useGame } from '../../store/useGame';
import { Card, gaugeColor } from '../components/common';
import { PlayerDetail } from '../components/PlayerDetail';
import { PlayerRow } from '../components/PlayerRow';
import { useIsDesktop } from '../useMedia';

export function SquadScreen({ state }: { state: GameState }) {
  const swapPlayers = useGame((s) => s.swapPlayers);
  const autoPick = useGame((s) => s.autoPick);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Player | null>(null);
  const desktop = useIsDesktop();

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

  if (desktop) {
    return (
      <>
        <SquadTable
          lineup={club.lineup.map((id) => byId.get(id)).filter((p): p is Player => !!p)}
          slots={slots}
          bench={club.bench.map((id) => byId.get(id)).filter((p): p is Player => !!p)}
          reserves={reserves}
          selected={selected}
          onTap={handleTap}
          onAutoPick={() => {
            autoPick();
            setSelected(null);
          }}
          formation={club.formation}
        />
        {detail && <PlayerDetail player={detail} onClose={() => setDetail(null)} />}
      </>
    );
  }

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

/* ------------------------------------------------------------ PC squad view */

type SortKey = 'ovr' | 'age' | 'fit' | 'form' | 'value' | 'goals' | 'rating' | AttributeKey;

const ATTR_COLUMNS: { key: AttributeKey; label: string }[] = [
  { key: 'shooting', label: '슈팅' },
  { key: 'passing', label: '패스' },
  { key: 'dribbling', label: '드리블' },
  { key: 'defending', label: '수비' },
  { key: 'physical', label: '피지컬' },
  { key: 'goalkeeping', label: 'GK' },
];

const money = (thousands: number): string =>
  thousands >= 1000 ? `${(thousands / 1000).toFixed(1)}M` : `${thousands}K`;

const avgRating = (p: Player) => (p.season.appearances > 0 ? p.season.ratingSum / p.season.appearances : 0);

function sortValue(p: Player, key: SortKey): number {
  switch (key) {
    case 'ovr': return overall(p);
    case 'age': return -p.age;
    case 'fit': return p.fitness;
    case 'form': return p.form;
    case 'value': return p.value;
    case 'goals': return p.season.goals;
    case 'rating': return avgRating(p);
    default: return p.attributes[key];
  }
}

/** Colour attribute cells the way FM does: the better, the brighter. */
function attrStyle(value: number) {
  const color = value >= 65 ? '#3ddc91' : value >= 52 ? '#a3e635' : value >= 40 ? '#f5a524' : '#f4586a';
  return { color, fontWeight: value >= 65 ? 800 : 600 };
}

function SquadTable({
  lineup,
  slots,
  bench,
  reserves,
  selected,
  onTap,
  onAutoPick,
  formation,
}: {
  lineup: Player[];
  slots: Role[];
  bench: Player[];
  reserves: Player[];
  selected: string | null;
  onTap: (id: string) => void;
  onAutoPick: () => void;
  formation: string;
}) {
  const [sort, setSort] = useState<SortKey | null>(null);
  const sorted = (list: Player[]) =>
    sort ? [...list].sort((a, b) => sortValue(b, sort) - sortValue(a, sort)) : list;

  const header = (key: SortKey, label: string) => (
    <th
      className={`sortable${sort === key ? ' sortable--active' : ''}`}
      onClick={() => setSort(sort === key ? null : key)}
    >
      {label}
    </th>
  );

  const row = (player: Player, slot?: Role) => {
    const outOfPosition = slot !== undefined && slot !== player.role;
    return (
      <tr
        key={player.id}
        className={`squad-row${selected === player.id ? ' squad-row--selected' : ''}`}
        onClick={() => onTap(player.id)}
      >
        <td>
          <span className={`player__pos player__pos--${player.group}`}>{ROLE_LABEL[slot ?? player.role]}</span>
        </td>
        <td className="squad-row__name">
          {player.name}
          {outOfPosition && <span className="tiny" style={{ color: 'var(--warn)' }}> ({ROLE_LABEL[player.role]})</span>}
          {player.injuredFor > 0 && <span style={{ color: 'var(--bad)' }}> ✚{player.injuredFor}</span>}
        </td>
        <td>{player.age}</td>
        <td className="muted">{player.nationality}</td>
        {ATTR_COLUMNS.map(({ key }) => (
          <td key={key} style={attrStyle(player.attributes[key])}>
            {player.group === 'GK' || key !== 'goalkeeping' ? player.attributes[key] : '-'}
          </td>
        ))}
        <td className="squad-row__ovr">{overall(player)}</td>
        <td>
          <Meter value={player.fitness} />
        </td>
        <td>
          <Meter value={player.form} />
        </td>
        <td>
          <Meter value={player.morale} />
        </td>
        <td>{money(player.value)}</td>
        <td className="muted">{money(player.wage)}</td>
        <td>{player.season.appearances}</td>
        <td>{player.season.goals}</td>
        <td>{player.season.assists}</td>
        <td style={{ color: avgRating(player) ? gaugeColor(avgRating(player) * 10) : undefined }}>
          {avgRating(player) ? avgRating(player).toFixed(2) : '-'}
        </td>
      </tr>
    );
  };

  const section = (label: string, count: number) => (
    <tr className="squad-section">
      <td colSpan={21}>
        {label} <span className="faint">({count})</span>
      </td>
    </tr>
  );

  return (
    <Card
      title={`선수단 · ${formation}`}
      action={
        <button type="button" className="btn tiny" style={{ padding: '5px 10px', fontSize: 11 }} onClick={onAutoPick}>
          자동 선발
        </button>
      }
    >
      <div className="squad-table-wrap">
        <table className="table squad-table">
          <thead>
            <tr>
              <th>포지션</th>
              <th style={{ textAlign: 'left' }}>이름</th>
              {header('age', '나이')}
              <th>국적</th>
              {ATTR_COLUMNS.map(({ key, label }) => header(key, label))}
              {header('ovr', 'OVR')}
              {header('fit', '체력')}
              {header('form', '폼')}
              <th>사기</th>
              {header('value', '가치')}
              <th>주급</th>
              <th>출전</th>
              {header('goals', '골')}
              <th>도움</th>
              {header('rating', '평점')}
            </tr>
          </thead>
          <tbody>
            {section('선발', lineup.length)}
            {lineup.map((p, i) => row(p, slots[i]))}
            {section('교체 명단', bench.length)}
            {sorted(bench).map((p) => row(p))}
            {section('나머지 선수', reserves.length)}
            {sorted(reserves).map((p) => row(p))}
          </tbody>
        </table>
      </div>
      <p className="tiny faint" style={{ padding: '8px 12px', margin: 0 }}>
        행을 클릭해 선택하고 다른 선수를 클릭하면 자리를 바꿉니다. 같은 선수를 다시 클릭하면 상세 정보를 봅니다.
        열 제목을 클릭하면 교체·나머지 선수를 정렬합니다.
      </p>
    </Card>
  );
}

function Meter({ value }: { value: number }) {
  return (
    <span className="meter" title={String(Math.round(value))}>
      <span className="meter__fill" style={{ width: `${value}%`, background: gaugeColor(value) }} />
    </span>
  );
}
