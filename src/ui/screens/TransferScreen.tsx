import { useMemo, useState } from 'react';
import { ROLE_LABEL } from '../../game/formations';
import { totalRounds } from '../../game/league';
import { overall } from '../../game/ratings';
import {
  MAX_SQUAD,
  MIN_SQUAD,
  askingPrice,
  transferTargets,
  transferWindow,
} from '../../game/transfer';
import type { GameState, PositionGroup, Player, Team } from '../../game/types';
import { useGame } from '../../store/useGame';
import { Card, Modal, Segmented, gaugeColor } from '../components/common';
import { PlayerRow } from '../components/PlayerRow';

type Tab = 'buy' | 'sell' | 'offers' | 'log';

const money = (thousands: number): string =>
  thousands >= 1000 ? `${(thousands / 1000).toFixed(1)}M` : `${Math.round(thousands)}K`;

export function TransferScreen({ state }: { state: GameState }) {
  const [tab, setTab] = useState<Tab>('buy');

  const club = state.teams[state.clubId];
  const window = transferWindow(state.round, totalRounds(state.fixtures));
  const wageBill = club.players.reduce((sum, p) => sum + p.wage, 0);
  const offerCount = state.transfer.offers.length;

  return (
    <>
      <Card padded>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>
            {window.open ? window.label : '이적시장 마감'}
          </span>
          <span
            className="tiny"
            style={{
              color: window.open ? 'var(--accent)' : 'var(--text-faint)',
              border: `1px solid ${window.open ? 'var(--accent)' : 'var(--line)'}`,
              borderRadius: 6,
              padding: '2px 8px',
              fontWeight: 700,
            }}
          >
            {window.open ? 'OPEN' : 'CLOSED'}
          </span>
        </div>

        {!window.open && (
          <p className="tiny faint" style={{ marginTop: 0 }}>
            {window.opensAtRound !== null
              ? `${window.opensAtRound + 1}라운드에 ${window.label}이 열립니다.`
              : '이번 시즌 이적시장은 모두 종료되었습니다. 다음 시즌 프리시즌에 다시 열립니다.'}
          </p>
        )}

        <div className="kv">
          <span className="kv__key">이적 예산</span>
          <span className="kv__value" style={{ color: 'var(--accent)' }}>
            {money(club.budget)}
          </span>
        </div>
        <div className="kv">
          <span className="kv__key">주급</span>
          <span
            className="kv__value"
            style={{ color: wageBill > club.wageBudget ? 'var(--bad)' : undefined }}
          >
            {money(wageBill)} / {money(club.wageBudget)}
          </span>
        </div>
        <div className="kv">
          <span className="kv__key">스쿼드</span>
          <span className="kv__value">
            {club.players.length}명 ({MIN_SQUAD}–{MAX_SQUAD})
          </span>
        </div>
      </Card>

      <div style={{ marginBottom: 12 }}>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'buy', label: '영입' },
            { value: 'sell', label: '방출' },
            { value: 'offers', label: `제안${offerCount ? ` ${offerCount}` : ''}` },
            { value: 'log', label: '기록' },
          ]}
        />
      </div>

      {tab === 'buy' && <BuyTab state={state} windowOpen={window.open} />}
      {tab === 'sell' && <SellTab state={state} />}
      {tab === 'offers' && <OffersTab state={state} windowOpen={window.open} />}
      {tab === 'log' && <LogTab state={state} />}
    </>
  );
}

/* ----------------------------------------------------------------- buying */

const GROUP_FILTERS: { value: PositionGroup | 'ALL'; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'GK', label: 'GK' },
  { value: 'DF', label: 'DF' },
  { value: 'MF', label: 'MF' },
  { value: 'FW', label: 'FW' },
];

function BuyTab({ state, windowOpen }: { state: GameState; windowOpen: boolean }) {
  const [group, setGroup] = useState<PositionGroup | 'ALL'>('ALL');
  const [affordableOnly, setAffordableOnly] = useState(true);
  const [target, setTarget] = useState<{ player: Player; team: Team } | null>(null);

  const club = state.teams[state.clubId];

  // Rebuilt whenever the squad or budget changes, which is what the deps track.
  const targets = useMemo(() => {
    const all = transferTargets(state);
    return all
      .filter(({ player }) => group === 'ALL' || player.group === group)
      .map((entry) => ({ ...entry, price: askingPrice(entry.player, entry.team) }))
      .filter(({ price }) => !affordableOnly || price <= club.budget)
      .sort((a, b) => overall(b.player) - overall(a.player))
      .slice(0, 60);
  }, [state, group, affordableOnly, club.budget]);

  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <Segmented
          value={group}
          onChange={setGroup}
          options={GROUP_FILTERS}
        />
      </div>

      <button
        type="button"
        className={`btn btn--block${affordableOnly ? ' btn--primary' : ''}`}
        style={{ marginBottom: 12, fontSize: 13, padding: '9px 12px' }}
        onClick={() => setAffordableOnly((v) => !v)}
      >
        {affordableOnly ? '✓ 예산 내 선수만 보기' : '전체 선수 보기'}
      </button>

      <Card title={`영입 후보 ${targets.length}명`}>
        {targets.length === 0 && (
          <div className="empty">조건에 맞는 선수가 없습니다.</div>
        )}
        {targets.map(({ player, team, price }) => (
          <button
            key={player.id}
            type="button"
            className="player"
            onClick={() => setTarget({ player, team })}
          >
            <span className={`player__pos player__pos--${player.group}`}>
              {ROLE_LABEL[player.role]}
            </span>
            <span className="player__main">
              <span className="player__name">{player.name}</span>
              <span className="player__meta">
                <span>{player.age}세</span>
                <span>{team.shortName}</span>
                <span style={{ color: price <= club.budget ? 'var(--accent)' : 'var(--bad)' }}>
                  {money(price)}
                </span>
              </span>
            </span>
            <span className="player__ovr">{overall(player)}</span>
          </button>
        ))}
      </Card>

      {target && (
        <BidModal
          state={state}
          player={target.player}
          seller={target.team}
          windowOpen={windowOpen}
          onClose={() => setTarget(null)}
        />
      )}
    </>
  );
}

function BidModal({
  state,
  player,
  seller,
  windowOpen,
  onClose,
}: {
  state: GameState;
  player: Player;
  seller: Team;
  windowOpen: boolean;
  onClose: () => void;
}) {
  const bidForPlayer = useGame((s) => s.bidForPlayer);
  const club = state.teams[state.clubId];
  const asking = askingPrice(player, seller);
  const [fee, setFee] = useState(asking);
  const [result, setResult] = useState<{ accepted: boolean; reason: string } | null>(null);

  const wageAfter = club.players.reduce((sum, p) => sum + p.wage, 0) + player.wage;

  return (
    <Modal title={player.name} onClose={onClose}>
      <div className="row" style={{ gap: 14, marginBottom: 14 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, fontWeight: 900, lineHeight: 1 }}>{overall(player)}</div>
          <div className="tiny faint">현재</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, fontWeight: 900, lineHeight: 1, color: 'var(--accent)' }}>
            {player.potential}
          </div>
          <div className="tiny faint">잠재력</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {ROLE_LABEL[player.role]} · {player.age}세 · {player.nationality}
          </div>
          <div className="tiny faint" style={{ marginTop: 3 }}>
            {seller.name}
          </div>
        </div>
      </div>

      <div className="kv">
        <span className="kv__key">요구 이적료</span>
        <span className="kv__value">{money(asking)}</span>
      </div>
      <div className="kv">
        <span className="kv__key">주급</span>
        <span className="kv__value">{money(player.wage)}</span>
      </div>
      <div className="kv">
        <span className="kv__key">영입 후 주급 총액</span>
        <span
          className="kv__value"
          style={{ color: wageAfter > club.wageBudget ? 'var(--bad)' : undefined }}
        >
          {money(wageAfter)} / {money(club.wageBudget)}
        </span>
      </div>
      <div className="kv">
        <span className="kv__key">시즌 기록</span>
        <span className="kv__value">
          {player.season.appearances}경기 {player.season.goals}골 {player.season.assists}도움
        </span>
      </div>

      {result === null ? (
        <>
          <div className="field__label" style={{ marginTop: 16 }}>
            제안 금액 — {money(fee)}
          </div>
          <input
            type="range"
            min={Math.round(asking * 0.5)}
            max={Math.max(Math.round(asking * 1.6), Math.round(asking * 0.5) + 1)}
            step={Math.max(1, Math.round(asking / 100))}
            value={fee}
            onChange={(e) => setFee(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--accent)' }}
          />
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="tiny faint">{money(Math.round(asking * 0.5))}</span>
            <span className="tiny faint">{money(Math.round(asking * 1.6))}</span>
          </div>

          <button
            type="button"
            className="btn btn--primary btn--block"
            style={{ marginTop: 14 }}
            disabled={!windowOpen || fee > club.budget}
            onClick={() => setResult(bidForPlayer(player.id, fee))}
          >
            {!windowOpen
              ? '이적시장이 닫혀 있습니다'
              : fee > club.budget
                ? '예산 초과'
                : `${money(fee)} 제안하기`}
          </button>
        </>
      ) : (
        <>
          <p
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 10,
              background: result.accepted ? 'rgba(61, 220, 145, 0.14)' : 'rgba(244, 88, 106, 0.12)',
              color: result.accepted ? 'var(--accent)' : 'var(--bad)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {result.reason}
          </p>
          {result.accepted ? (
            <button type="button" className="btn btn--primary btn--block" onClick={onClose}>
              확인
            </button>
          ) : (
            <div className="row" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn"
                style={{ flex: 1 }}
                onClick={() => setResult(null)}
              >
                다시 제안
              </button>
              <button type="button" className="btn" style={{ flex: 1 }} onClick={onClose}>
                닫기
              </button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

/* ---------------------------------------------------------------- selling */

function SellTab({ state }: { state: GameState }) {
  const toggleTransferList = useGame((s) => s.toggleTransferList);
  const club = state.teams[state.clubId];
  const canSell = club.players.length > MIN_SQUAD;

  const sorted = club.players.slice().sort((a, b) => overall(b) - overall(a));

  return (
    <>
      {!canSell && (
        <p className="tiny" style={{ color: 'var(--warn)', padding: '0 4px 8px' }}>
          스쿼드가 최소 인원({MIN_SQUAD}명)이라 지금은 선수를 내보낼 수 없습니다.
        </p>
      )}

      <Card title={`이적 리스트 (${state.transfer.listed.length})`}>
        <div className="tiny faint" style={{ padding: '8px 12px 0' }}>
          선수를 탭하면 이적 리스트에 올리거나 내립니다. 리스트에 오른 선수에게는 다른 구단의
          제안이 훨씬 자주 들어옵니다.
        </div>
        {sorted.map((player) => {
          const listed = state.transfer.listed.includes(player.id);
          return (
            <div key={player.id} style={{ position: 'relative' }}>
              <PlayerRow
                player={player}
                selected={listed}
                onClick={canSell || listed ? () => toggleTransferList(player.id) : undefined}
              />
              {listed && (
                <span
                  className="tiny"
                  style={{
                    position: 'absolute',
                    right: 56,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--warn)',
                    fontWeight: 700,
                    pointerEvents: 'none',
                  }}
                >
                  판매
                </span>
              )}
            </div>
          );
        })}
      </Card>
    </>
  );
}

/* ----------------------------------------------------------------- offers */

function OffersTab({ state, windowOpen }: { state: GameState; windowOpen: boolean }) {
  const acceptOffer = useGame((s) => s.acceptOffer);
  const rejectOffer = useGame((s) => s.rejectOffer);
  const club = state.teams[state.clubId];

  if (state.transfer.offers.length === 0) {
    return (
      <div className="empty">
        {windowOpen
          ? '들어온 제안이 없습니다. 선수를 이적 리스트에 올리면 제안이 늘어납니다.'
          : '이적시장이 닫혀 있어 제안이 없습니다.'}
      </div>
    );
  }

  return (
    <>
      {state.transfer.offers.map((offer) => {
        const player = club.players.find((p) => p.id === offer.playerId);
        const buyer = state.teams[offer.fromTeamId];
        if (!player || !buyer) return null;

        const value = player.value;
        const good = offer.fee >= value;

        return (
          <Card key={offer.id} padded>
            <div className="row" style={{ gap: 10, marginBottom: 10 }}>
              <span className={`player__pos player__pos--${player.group}`}>
                {ROLE_LABEL[player.role]}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{player.name}</div>
                <div className="tiny faint">
                  {player.age}세 · 능력치 {overall(player)}
                </div>
              </span>
              <span style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: gaugeColor(good ? 85 : 45) }}>
                  {money(offer.fee)}
                </div>
                <div className="tiny faint">평가액 {money(value)}</div>
              </span>
            </div>

            <div className="tiny muted" style={{ marginBottom: 10 }}>
              {buyer.name}의 제안 · {offer.expiresRound + 1}라운드까지 유효
            </div>

            <div className="row" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn"
                style={{ flex: 1 }}
                onClick={() => rejectOffer(offer.id)}
              >
                거절
              </button>
              <button
                type="button"
                className="btn btn--primary"
                style={{ flex: 1 }}
                disabled={club.players.length <= MIN_SQUAD}
                onClick={() => acceptOffer(offer.id)}
              >
                {club.players.length <= MIN_SQUAD ? '인원 부족' : '수락'}
              </button>
            </div>
          </Card>
        );
      })}
    </>
  );
}

/* -------------------------------------------------------------------- log */

function LogTab({ state }: { state: GameState }) {
  if (state.transfer.log.length === 0) {
    return <div className="empty">아직 성사된 이적이 없습니다.</div>;
  }

  return (
    <Card title="리그 이적 기록">
      {state.transfer.log.map((record, index) => (
        <div key={index} className="fixture" style={{ gridTemplateColumns: '1fr auto' }}>
          <span style={{ textAlign: 'left', minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{record.playerName}</div>
            <div className="tiny faint">
              {record.fromName} → {record.toName}
            </div>
          </span>
          <span style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>{money(record.fee)}</div>
            <div className="tiny faint">
              {record.season}시즌 {record.round + 1}R
            </div>
          </span>
        </div>
      ))}
    </Card>
  );
}
