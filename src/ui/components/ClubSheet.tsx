import { COUNTRY_BY_ID } from '../../data/countries';
import { relationWith } from '../../game/agent';
import { wageBill } from '../../game/market';
import { formatMoney } from '../../game/engine';
import { compareTableRows } from '../../game/world';
import { seasonLabel } from '../../game/types';
import { useGame, useGameState } from '../../store/useGame';
import { Card, Crest, Empty, KV, Meter, Sheet, Stat } from './common';
import { PlayerRow } from './PlayerView';

export function ClubSheet({ clubId }: { clubId: string }) {
  const state = useGameState();
  const { openClub } = useGame();
  const club = state.clubs[clubId];
  if (!club) return null;

  const country = COUNTRY_BY_ID[club.countryId];
  const league = state.leagues[club.countryId];
  const rows = league ? Object.values(league.table).slice().sort(compareTableRows) : [];
  const position = rows.findIndex((row) => row.clubId === clubId) + 1;
  const squad = club.playerIds
    .map((id) => state.players[id])
    .filter(Boolean)
    .sort((a, b) => b.ca - a.ca);

  return (
    <Sheet
      title={club.name}
      subtitle={`${country?.name ?? ''} · ${country?.leagueName ?? ''}`}
      onClose={() => openClub(null)}
    >
      <Card title="개요">
        <div className="club-head">
          <Crest color={club.color} accent={club.accent} label={club.shortName} size={48} />
          <div className="stat-row">
            <Stat label="명성" value={club.reputation} />
            <Stat label="순위" value={position > 0 ? `${position}위` : '-'} />
            <Stat label="목표" value={`${club.expectation}위`} />
          </div>
        </div>
        <KV k="이적 예산" v={formatMoney(club.budget)} />
        <KV k="주급 총액" v={`${formatMoney(wageBill(club, state.players))} / ${formatMoney(club.wageBudget)}`} />
        <KV k="성향" v={club.style === 'attacking' ? '공격적' : club.style === 'defensive' ? '수비적' : '균형'} />
        <Meter label="나와의 관계" value={relationWith(state, clubId)} />
      </Card>

      <Card title="우승 이력">
        {club.honours.length === 0
          ? <Empty>아직 없습니다.</Empty>
          : (
            <ul className="honours">
              {club.honours.slice().reverse().slice(0, 12).map((honour, i) => (
                <li key={`${honour.season}-${i}`}>
                  <span className="honours__season">{seasonLabel(honour.season)}</span>
                  <span>{honour.label}</span>
                </li>
              ))}
            </ul>
          )}
      </Card>

      <Card title="선수단" action={<span className="faint small">{squad.length}명</span>}>
        {squad.map((player) => (
          <PlayerRow
            key={player.id}
            playerId={player.id}
            right={player.contract ? `${player.contract.wage.toFixed(1)}k` : 'FA'}
          />
        ))}
      </Card>
    </Sheet>
  );
}
