import { clientLimit, negotiationLimit, weeklyCommission, weeklyExpenses } from '../../game/agent';
import { LICENCE_LIMITS } from '../../game/newGame';
import { formatMoney } from '../../game/engine';
import { AWARD_LABELS } from '../../game/awards';
import { isWindowOpen, seasonLabel, SEASON_WEEKS } from '../../game/types';
import { useGame, useGameState } from '../../store/useGame';
import { Btn, Card, Empty, KV, Meter, Stat } from '../components/common';
import { PlayerRow } from '../components/PlayerView';

export default function HomeScreen() {
  const state = useGameState();
  const { setTab, openPlayer, answerDemand, saveWarning } = useGame();
  const clients = Object.values(state.clients);
  const openDemands = clients.flatMap((client) =>
    client.demands.filter((d) => !d.resolution).map((demand) => ({ client, demand })));
  const activeDeals = state.negotiations.filter((n) => n.stage !== 'agreed' && n.stage !== 'failed');
  const agreedDeals = state.negotiations.filter((n) => n.stage === 'agreed');
  const licence = LICENCE_LIMITS.find((tier) => tier.licence === state.agent.licence);
  const windowOpen = isWindowOpen(state.week);
  const recentAwards = state.awards.filter((a) => a.season === state.season && a.wasClient);

  return (
    <div className="screen">
      {saveWarning && <Card tone="bad" title="저장 경고"><p className="bad small">{saveWarning}</p></Card>}

      <Card title={`${state.agent.name} — 에이전시 현황`}>
        <div className="stat-row">
          <Stat label="자금" value={formatMoney(state.agent.cash)} tone={state.agent.cash < 0 ? 'bad' : undefined} />
          <Stat label="평판" value={Math.round(state.agent.reputation)} />
          <Stat label="등급" value={licence?.label ?? '-'} sub={`Lv.${state.agent.licence}`} />
        </div>
        <Meter label="평판" value={state.agent.reputation} />
        <KV k="의뢰인" v={`${clients.length} / ${clientLimit(state)}명`} />
        <KV k="진행 중 협상" v={`${activeDeals.length} / ${negotiationLimit(state)}건`} />
        <KV k="주간 수입" v={formatMoney(weeklyCommission(state))} tone="good" />
        <KV k="주간 지출" v={formatMoney(weeklyExpenses(state))} tone="bad" />
      </Card>

      <Card
        title="일정"
        action={<span className={`pill${windowOpen ? ' pill--good' : ''}`}>{windowOpen ? '이적시장 열림' : '이적시장 닫힘'}</span>}
      >
        <KV k="시즌" v={seasonLabel(state.season)} />
        <KV k="주차" v={`${state.week} / ${SEASON_WEEKS}주`} />
        <Meter label="시즌 진행" value={(state.week / SEASON_WEEKS) * 100} tone="good" />
        {!windowOpen && (
          <p className="faint small">
            이적 협상은 여름(1~6주)과 겨울(23~25주) 이적시장에서만 시작할 수 있습니다. 재계약은 언제든 가능합니다.
          </p>
        )}
      </Card>

      {agreedDeals.length > 0 && (
        <Card title="서명 대기" tone="good">
          {agreedDeals.map((negotiation) => (
            <PlayerRow
              key={negotiation.id}
              playerId={negotiation.playerId}
              right={<span className="pill pill--good">합의 완료</span>}
              onClick={() => { useGame.getState().openNegotiation(negotiation.id); setTab('deals'); }}
            />
          ))}
        </Card>
      )}

      <Card
        title="처리할 요구"
        action={openDemands.length > 0 ? <span className="pill pill--warn">{openDemands.length}</span> : null}
      >
        {openDemands.length === 0
          ? <Empty>지금은 조용합니다.</Empty>
          : openDemands.slice(0, 3).map(({ client, demand }) => {
            const player = state.players[client.playerId];
            const daysLeft = demand.deadlineWeek - state.week;
            return (
              <div key={demand.id} className="demand">
                <button type="button" className="demand__head" onClick={() => openPlayer(client.playerId)}>
                  <span className="demand__title">{demand.title}</span>
                  <span className="demand__who">{player?.name} · {daysLeft <= 1 ? '이번 주 마감' : `${daysLeft}주 남음`}</span>
                </button>
                <p className="demand__body">{demand.body}</p>
                <div className="demand__options">
                  {demand.options.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className="demand__option"
                      onClick={() => answerDemand(client.playerId, demand.id, option.id)}
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
            );
          })}
        {openDemands.length > 3 && (
          <Btn small variant="ghost" block onClick={() => setTab('clients')}>
            나머지 {openDemands.length - 3}건 보기
          </Btn>
        )}
      </Card>

      {recentAwards.length > 0 && (
        <Card title="내 의뢰인 수상" tone="good">
          {recentAwards.map((award, i) => (
            <KV
              key={`${award.awardId}-${award.competitionId ?? ''}-${i}`}
              k={`${award.competitionId ? `${state.competitions[award.competitionId]?.shortName ?? ''} ` : ''}${AWARD_LABELS[award.awardId]}`}
              v={award.playerName}
              tone="good"
            />
          ))}
        </Card>
      )}

      <Card title="소식">
        {state.news.length === 0
          ? <Empty>아직 소식이 없습니다.</Empty>
          : (
            <ul className="news">
              {state.news.slice(0, 25).map((item) => (
                <li key={item.id} className={`news__item news__item--${item.tone}`}>
                  <button
                    type="button"
                    className="news__btn"
                    onClick={() => item.playerId && openPlayer(item.playerId)}
                  >
                    <span className="news__title">{item.title}</span>
                    <span className="news__body">{item.body}</span>
                    <span className="news__meta">{seasonLabel(item.season)} · {item.week}주</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
      </Card>
    </div>
  );
}
