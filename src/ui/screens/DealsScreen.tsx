import { useState } from 'react';
import { COUNTRY_BY_ID } from '../../data/countries';
import { relationWith } from '../../game/agent';
import { transferOutlook } from '../../game/negotiation';
import { estimateValue } from '../../game/player';
import { formatMoney } from '../../game/engine';
import { isWindowOpen, type Club, type Negotiation } from '../../game/types';
import { useGame, useGameState } from '../../store/useGame';
import { Btn, Card, Chip, Crest, Empty, Field, KV, Meter, Sheet, Stat, Stepper } from '../components/common';
import { PlayerRow } from '../components/PlayerView';

const STAGE_LABELS: Record<Negotiation['stage'], string> = {
  fee: '1. 이적료', terms: '2. 선수 조건', commission: '3. 내 수수료', agreed: '합의 완료', failed: '결렬',
};

export default function DealsScreen() {
  const state = useGameState();
  const { negotiationSheet, openNegotiation } = useGame();
  const active = state.negotiations.filter((n) => n.stage !== 'failed');

  if (negotiationSheet) {
    const negotiation = state.negotiations.find((n) => n.id === negotiationSheet);
    if (negotiation) return <NegotiationSheet negotiation={negotiation} />;
  }

  return (
    <div className="screen">
      <Card title="진행 중인 협상" action={<span className="faint small">{active.length}건</span>}>
        {active.length === 0
          ? <Empty>진행 중인 협상이 없습니다.</Empty>
          : active.map((negotiation) => {
            const club = state.clubs[negotiation.clubId];
            return (
              <button
                key={negotiation.id}
                type="button"
                className={`deal deal--${negotiation.stage}`}
                onClick={() => openNegotiation(negotiation.id)}
              >
                <Crest color={club.color} accent={club.accent} label={club.shortName} />
                <span className="deal__main">
                  <span className="deal__name">{state.players[negotiation.playerId]?.name}</span>
                  <span className="deal__meta">
                    {negotiation.kind === 'renewal' ? '재계약' : `→ ${club.name}`}
                    {negotiation.inbound && ' · 구단이 먼저 연락'}
                  </span>
                </span>
                <span className="deal__stage">{STAGE_LABELS[negotiation.stage]}</span>
              </button>
            );
          })}
      </Card>

      <NewDealPicker />
    </div>
  );
}

/** 의뢰인 하나를 골라 이적을 추진합니다. */
function NewDealPicker() {
  const state = useGameState();
  const { startDeal } = useGame();
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const windowOpen = isWindowOpen(state.week);
  const clients = Object.values(state.clients)
    .map((client) => state.players[client.playerId])
    .filter((player) => player && !player.retired
      && !state.negotiations.some((n) => n.playerId === player.id));

  const player = playerId ? state.players[playerId] : null;
  const suitors: Club[] = player
    ? Object.values(state.clubs)
      .filter((club) => club.id !== player.clubId)
      .filter((club) => !query || club.name.toLowerCase().includes(query.toLowerCase())
        || (COUNTRY_BY_ID[club.countryId]?.name ?? '').includes(query))
      // 명성이 아니라 "이 선수를 원하고, 살 돈도 있는가" 순으로 보여 줍니다.
      // 관심만으로 줄 세우면 살 수 없는 약체 구단이 목록 맨 위를 차지합니다.
      .sort((a, b) => {
        const left = transferOutlook(state, player.id, a.id);
        const right = transferOutlook(state, player.id, b.id);
        if (left.affordable !== right.affordable) return left.affordable ? -1 : 1;
        return right.interest - left.interest || b.reputation - a.reputation;
      })
      .slice(0, 40)
    : [];

  return (
    <Card title="새 이적 추진">
      {!windowOpen && (
        <p className="warn small">
          이적시장이 닫혀 있습니다. 지금은 재계약만 진행할 수 있습니다 (선수 상세에서).
        </p>
      )}
      {clients.length === 0
        ? <Empty>추진할 수 있는 의뢰인이 없습니다.</Empty>
        : (
          <>
            <Field label="의뢰인">
              <div className="chips chips--scroll">
                {clients.map((client) => (
                  <Chip key={client.id} active={playerId === client.id} onClick={() => setPlayerId(client.id)}>
                    {client.name}
                  </Chip>
                ))}
              </div>
            </Field>

            {player && (
              <>
                <KV k="추정 가치" v={formatMoney(estimateValue(player))} />
                <KV k="현 소속" v={player.clubId ? state.clubs[player.clubId].name : '무소속'} />
                <Field label="행선지 구단" hint="구단이 이 선수를 원하는 순서로 정렬됩니다">
                  <input
                    className="input"
                    placeholder="구단 또는 나라 이름"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </Field>
                <div className="club-list">
                  {suitors.map((club) => {
                    const relation = relationWith(state, club.id);
                    const outlook = transferOutlook(state, player.id, club.id);
                    return (
                      <button
                        key={club.id}
                        type="button"
                        className="club-row"
                        disabled={!windowOpen}
                        onClick={() => startDeal(player.id, club.id, 'transfer')}
                      >
                        <Crest color={club.color} accent={club.accent} label={club.shortName} />
                        <span className="club-row__main">
                          <span className="club-row__name">{club.name}</span>
                          <span className="club-row__meta">
                            {COUNTRY_BY_ID[club.countryId]?.name} · 예산 {formatMoney(club.budget)} · 관계 {Math.round(relation)}
                          </span>
                        </span>
                        <span className={`club-row__rel club-row__rel--${outlook.tone}`}>
                          {outlook.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
    </Card>
  );
}

function NegotiationSheet({ negotiation }: { negotiation: Negotiation }) {
  const state = useGameState();
  const { openNegotiation, offerFee, offerTerms, offerCommission, finishDeal, cancelDeal } = useGame();
  const player = state.players[negotiation.playerId];
  const club = state.clubs[negotiation.clubId];
  const seller = negotiation.fromClubId ? state.clubs[negotiation.fromClubId] : null;

  const [fee, setFee] = useState(() => Math.max(0, negotiation.fee || estimateValue(player)));
  const [wage, setWage] = useState(() => negotiation.wage || negotiation.playerMinWage);
  const [years, setYears] = useState(negotiation.years || 3);
  const [clause, setClause] = useState(0);
  const [commission, setCommission] = useState(negotiation.commissionPct || 5);

  if (!player || !club) return null;

  return (
    <Sheet
      title={player.name}
      subtitle={negotiation.kind === 'renewal' ? `${club.name} 재계약` : `${seller?.name ?? '무소속'} → ${club.name}`}
      onClose={() => openNegotiation(null)}
      footer={
        <div className="sheet__actions">
          <Btn small variant="danger" onClick={() => cancelDeal(negotiation.id)}>협상 중단</Btn>
          {negotiation.stage === 'agreed' && (
            <Btn small variant="primary" onClick={() => finishDeal(negotiation.id)}>계약 확정</Btn>
          )}
        </div>
      }
    >
      <Card title="진행 상황">
        <div className="stages">
          {(['fee', 'terms', 'commission'] as const).map((stage) => {
            const order = ['fee', 'terms', 'commission', 'agreed'];
            const done = order.indexOf(negotiation.stage) > order.indexOf(stage);
            const current = negotiation.stage === stage;
            return (
              <span key={stage} className={`stage${done ? ' stage--done' : ''}${current ? ' stage--now' : ''}`}>
                {STAGE_LABELS[stage]}
              </span>
            );
          })}
        </div>
        <Meter label="상대 인내심" value={negotiation.patience} />
        <KV k="기한" v={`${Math.max(0, negotiation.expiresWeek - state.week)}주 남음`} />
      </Card>

      {negotiation.stage === 'fee' && (
        <Card title="이적료 협상">
          <p className="faint small">
            사는 구단의 예산과 파는 구단의 눈높이 사이를 맞춰야 합니다. 무리한 금액을 부를수록 인내심이 깎입니다.
          </p>
          <div className="stat-row">
            <Stat label="선수 가치" value={formatMoney(estimateValue(player))} />
            <Stat label="구단 예산" value={formatMoney(club.budget)} />
            {player.contract?.releaseClause
              ? <Stat label="바이아웃" value={formatMoney(player.contract.releaseClause)} />
              : null}
          </div>
          {negotiation.revealedSellerMinFee !== undefined && (
            <KV k={`${seller?.name ?? '파는 구단'} 요구액`} v={formatMoney(negotiation.revealedSellerMinFee)} tone="bad" />
          )}
          {negotiation.revealedClubMaxFee !== undefined && (
            <KV k={`${club.name} 상한`} v={formatMoney(negotiation.revealedClubMaxFee)} tone="good" />
          )}
          <Stepper value={fee} onChange={setFee} step={Math.max(100, Math.round(fee * 0.05))} min={0} format={formatMoney} />
          <Btn block variant="primary" onClick={() => offerFee(negotiation.id, fee)}>이 금액으로 제시</Btn>
        </Card>
      )}

      {negotiation.stage === 'terms' && (
        <Card title="선수 조건">
          <p className="faint small">
            구단의 주급 상한과 선수가 원하는 금액 사이를 찾아야 합니다. 바이아웃을 낮게 걸면 구단이 거부합니다.
          </p>
          {negotiation.revealedPlayerMinWage !== undefined && (
            <KV k="선수 요구 주급" v={`${negotiation.revealedPlayerMinWage.toFixed(1)}k`} tone="bad" />
          )}
          {negotiation.revealedClubMaxWage !== undefined && (
            <KV k="구단 주급 상한" v={`${negotiation.revealedClubMaxWage.toFixed(1)}k`} tone="good" />
          )}
          <Field label="주급">
            <Stepper value={wage} onChange={setWage} step={Math.max(0.5, Math.round(wage * 0.05))} min={0.5} format={(v) => `${v.toFixed(1)}k / 주`} />
          </Field>
          <Field label="계약 기간">
            <Stepper value={years} onChange={setYears} step={1} min={1} max={5} format={(v) => `${v}년`} />
          </Field>
          <Field label="바이아웃 조항" hint="0 이면 넣지 않습니다">
            <Stepper value={clause} onChange={setClause} step={Math.max(500, Math.round(estimateValue(player) * 0.2))} min={0} format={(v) => (v === 0 ? '없음' : formatMoney(v))} />
          </Field>
          <Btn block variant="primary" onClick={() => offerTerms(negotiation.id, wage, years, clause)}>조건 제시</Btn>
        </Card>
      )}

      {negotiation.stage === 'commission' && (
        <Card title="내 수수료">
          <p className="faint small">
            구단과의 관계와 내 평판이 높을수록 더 부를 수 있습니다. 지금 관계는 {Math.round(relationWith(state, club.id))} 입니다.
          </p>
          {negotiation.revealedCommissionCap !== undefined && (
            <KV k="구단이 밝힌 기준" v={`${negotiation.revealedCommissionCap}%`} tone="dim" />
          )}
          <Stepper value={commission} onChange={setCommission} step={0.5} min={0} max={20} format={(v) => `${v.toFixed(1)}%`} />
          <KV k="예상 수수료" v={formatMoney(negotiation.fee * (commission / 100) + negotiation.wage * 4)} tone="good" />
          <Btn block variant="primary" onClick={() => offerCommission(negotiation.id, commission)}>수수료 제시</Btn>
        </Card>
      )}

      {negotiation.stage === 'agreed' && (
        <Card title="합의 내용" tone="good">
          <KV k="이적료" v={negotiation.kind === 'renewal' ? '해당 없음' : formatMoney(negotiation.fee)} />
          <KV k="주급" v={`${negotiation.wage.toFixed(1)}k / 주`} />
          <KV k="계약 기간" v={`${negotiation.years}년`} />
          <KV k="바이아웃" v={negotiation.releaseClause ? formatMoney(negotiation.releaseClause) : '없음'} />
          <KV k="내 수수료" v={`${negotiation.commissionPct}%`} tone="good" />
          <Btn block variant="primary" onClick={() => finishDeal(negotiation.id)}>계약 확정</Btn>
        </Card>
      )}

      <Card title="선수">
        <PlayerRow playerId={player.id} />
      </Card>

      <Card title="대화 기록">
        {negotiation.messages.length === 0
          ? <Empty>아직 오간 말이 없습니다.</Empty>
          : (
            <ul className="log">
              {negotiation.messages.map((message, i) => (
                <li key={`${message.week}-${i}`} className={`log__item log__item--${message.tone}`}>
                  <span className="log__week">{message.week}주</span>
                  <span className="log__text">{message.text}</span>
                </li>
              ))}
            </ul>
          )}
      </Card>
    </Sheet>
  );
}
