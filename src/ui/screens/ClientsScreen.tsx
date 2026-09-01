import { clientLimit } from '../../game/agent';
import { clientsByUrgency } from '../../game/agent';
import { TRUST_DANGER } from '../../game/clients';
import { formatMoney } from '../../game/engine';
import { seasonLabel } from '../../game/types';
import { useGame, useGameState } from '../../store/useGame';
import { Btn, Card, Empty, KV, Meter } from '../components/common';
import { PlayerRow } from '../components/PlayerView';

export default function ClientsScreen() {
  const state = useGameState();
  const { setTab, openPlayer, answerDemand } = useGame();
  const entries = clientsByUrgency(state);

  const totalWeekly = entries.reduce((sum, { client, player }) =>
    sum + (player.contract ? player.contract.wage * (client.commissionPct / 100) : 0), 0);

  return (
    <div className="screen">
      <Card title="의뢰인" action={<span className="faint small">{entries.length} / {clientLimit(state)}</span>}>
        <KV k="주간 수수료 합계" v={formatMoney(totalWeekly)} tone="good" />
        {entries.length === 0 && (
          <>
            <Empty>아직 의뢰인이 없습니다.</Empty>
            <Btn block variant="primary" onClick={() => setTab('scout')}>선수를 찾으러 가기</Btn>
          </>
        )}
      </Card>

      {entries.map(({ client, player }) => {
        const open = client.demands.filter((d) => !d.resolution);
        const club = player.clubId ? state.clubs[player.clubId] : null;
        return (
          <Card
            key={client.playerId}
            tone={client.trust <= TRUST_DANGER ? 'bad' : open.length > 0 ? 'warn' : undefined}
            title={player.name}
            action={<span className="faint small">{client.commissionPct}%</span>}
          >
            <PlayerRow
              playerId={player.id}
              right={player.contract ? `${player.contract.wage.toFixed(1)}k/주` : 'FA'}
            />
            {player.loan && (
              <KV
                k="임대 중"
                v={`${state.clubs[player.loan.parentClubId]?.name ?? '원 소속'} → ${club?.name ?? ''}`}
                tone="good"
              />
            )}
            <Meter label="신뢰" value={client.trust} />
            <KV k="대리인 계약" v={`${seasonLabel(client.since)} ~ ${seasonLabel(client.until)}`} />
            <KV
              k="이번 시즌"
              v={`${player.season.apps}경기 ${player.season.goals}골 ${player.season.assists}도움`}
            />
            {club && player.contract && (
              <KV k="계약 만료" v={seasonLabel(player.contract.expires)}
                tone={player.contract.expires <= state.season ? 'bad' : undefined} />
            )}

            {open.length === 0
              ? <p className="faint small">특별한 요구는 없습니다.</p>
              : open.map((demand) => (
                <div key={demand.id} className="demand">
                  <div className="demand__head demand__head--static">
                    <span className="demand__title">{demand.title}</span>
                    <span className="demand__who">
                      {demand.deadlineWeek - state.week <= 1 ? '이번 주 마감' : `${demand.deadlineWeek - state.week}주 남음`}
                    </span>
                  </div>
                  <p className="demand__body">{demand.body}</p>
                  <div className="demand__options">
                    {demand.options.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className="demand__option"
                        onClick={() => answerDemand(player.id, demand.id, option.id)}
                      >
                        <span className="demand__option-label">{option.label}</span>
                        <span className="demand__option-meta">
                          성공 {Math.round(option.chance * 100)}%
                          {option.cost > 0 && ` · ${formatMoney(option.cost)}`}
                        </span>
                        {option.hint && <span className="demand__option-hint">{option.hint}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

            <div className="sheet__actions">
              <Btn small variant="ghost" onClick={() => openPlayer(player.id)}>상세</Btn>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
