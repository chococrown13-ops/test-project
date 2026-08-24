import { LICENCE_LIMITS } from '../../game/newGame';
import { formatMoney } from '../../game/engine';
import { seasonLabel } from '../../game/types';
import { useGame, useGameState } from '../../store/useGame';
import { Btn, Card, Empty, KV, Meter, Sheet, Stat } from './common';

export function AgentSheet({ onClose }: { onClose: () => void }) {
  const state = useGameState();
  const { abandon, openClub } = useGame();
  const licence = LICENCE_LIMITS.find((tier) => tier.licence === state.agent.licence);
  const nextTier = LICENCE_LIMITS.find((tier) => tier.licence === state.agent.licence + 1);

  const relations = Object.entries(state.agent.clubRelations)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  return (
    <Sheet title={state.agent.name} subtitle={state.agent.agencyName} onClose={onClose}>
      <Card title="현황">
        <div className="stat-row">
          <Stat label="자금" value={formatMoney(state.agent.cash)} tone={state.agent.cash < 0 ? 'bad' : undefined} />
          <Stat label="성사 건수" value={state.agent.totals.deals} />
          <Stat label="누적 수수료" value={formatMoney(state.agent.totals.commission)} />
        </div>
        <KV k="라이선스" v={`${licence?.label} (Lv.${state.agent.licence})`} />
        <Meter label="평판" value={state.agent.reputation} />
        {nextTier && (
          <p className="faint small">
            평판 {nextTier.reputation} 을 넘기면 <strong>{nextTier.label}</strong> 로 올라가 의뢰인 {nextTier.clients}명,
            동시 협상 {nextTier.negotiations}건까지 가능합니다.
          </p>
        )}
        <KV k="누적 이적료 규모" v={formatMoney(state.agent.totals.feeVolume)} />
      </Card>

      <Card title="구단 관계">
        {relations.length === 0
          ? <Empty>아직 거래한 구단이 없습니다.</Empty>
          : relations.map(([clubId, value]) => (
            <button key={clubId} type="button" className="relation" onClick={() => { onClose(); openClub(clubId); }}>
              <span>{state.clubs[clubId]?.name ?? clubId}</span>
              <span className={`relation__value${value >= 60 ? ' relation__value--good' : value <= 20 ? ' relation__value--bad' : ''}`}>
                {Math.round(value)}
              </span>
            </button>
          ))}
      </Card>

      <Card title="장부">
        {state.agent.ledger.length === 0
          ? <Empty>기록이 없습니다.</Empty>
          : (
            <ul className="ledger">
              {state.agent.ledger.slice(0, 40).map((entry, i) => (
                <li key={`${entry.season}-${entry.week}-${i}`} className="ledger__row">
                  <span className="ledger__when">{seasonLabel(entry.season)} {entry.week}주</span>
                  <span className="ledger__label">{entry.label}</span>
                  <span className={`ledger__amount${entry.amount >= 0 ? ' ledger__amount--in' : ' ledger__amount--out'}`}>
                    {entry.amount >= 0 ? '+' : ''}{formatMoney(entry.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
      </Card>

      <Card title="시즌 기록">
        {state.history.length === 0
          ? <Empty>첫 시즌을 진행 중입니다.</Empty>
          : state.history.slice().reverse().map((entry) => (
            <div key={entry.season} className="history">
              <h4 className="subhead">{seasonLabel(entry.season)}</h4>
              <KV k="의뢰인" v={`${entry.agent.clients}명`} />
              <KV k="자금" v={formatMoney(entry.agent.cash)} />
              <KV k="평판" v={Math.round(entry.agent.reputation)} />
              <KV k="누적 성사" v={`${entry.agent.deals}건`} />
              {entry.worldChampionId && (
                <KV k="클럽 월드컵" v={state.clubs[entry.worldChampionId]?.name ?? '-'} />
              )}
            </div>
          ))}
      </Card>

      <Card title="게임" tone="bad">
        <p className="faint small">진행 상황은 이 브라우저에 자동 저장됩니다.</p>
        <Btn
          block
          variant="danger"
          onClick={() => {
            if (confirm('저장된 게임을 지우고 처음부터 시작할까요?')) abandon();
          }}
        >
          세이브 지우고 새로 시작
        </Btn>
      </Card>
    </Sheet>
  );
}
