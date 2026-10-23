import { useState } from 'react';
import { formatMoney, roundMoney } from '../../game/ability';
import { STATUS_LABEL } from '../../game/dynamics';
import { wageBill } from '../../game/finance';
import { STATUSES, submitBid, submitContract } from '../../game/transfers';
import type { SquadStatus } from '../../game/types';
import { useGame, useStore } from '../../store';
import { Card, Kv, Seg } from '../kit';
import { KnownStars, PlayerRow } from '../PlayerRow';
import { MoneyStepper } from './RecruitScreen';

export function NegotiationScreen({ id }: { id: string }) {
  const state = useGame();
  const mutate = useStore((s) => s.mutate);
  const push = useStore((s) => s.push);
  const neg = state.negotiations.find((n) => n.id === id);
  const [fee, setFee] = useState(() => (neg ? roundMoney(neg.askingFee * 0.85) : 0));
  const [share, setShare] = useState<'0.3' | '0.5' | '0.7'>('0.5');
  const [wage, setWage] = useState(() => neg?.demandWage ?? 0);
  const [years, setYears] = useState(() => String(neg?.demandYears ?? 3));
  const [status, setStatus] = useState<SquadStatus>(() => neg?.demandStatus ?? 'rotation');
  const [reply, setReply] = useState<string | null>(null);

  if (!neg) return <div className="empty">협상이 끝났습니다.</div>;
  const player = state.players[neg.playerId];
  if (!player) return <div className="empty">선수를 찾을 수 없습니다.</div>;
  const club = state.clubs[state.clubId];
  const seller = neg.sellerId ? state.clubs[neg.sellerId] : null;
  const bill = wageBill(state, club);

  const kindLabel = neg.kind === 'renewal' ? '재계약' : neg.kind === 'loan' ? '임대 영입' : neg.kind === 'free' ? '자유계약 영입' : '이적 영입';

  return (
    <>
      <Card>
        <PlayerRow state={state} player={player} onClick={() => push({ kind: 'player', id: player.id })} end={<KnownStars state={state} player={player} />} />
      </Card>
      <Card title={kindLabel} padded>
        {seller && <Kv k="소속 구단" v={seller.name} />}
        {neg.kind === 'transfer' && <Kv k="구단 요구 이적료" v={formatMoney(neg.askingFee)} />}
        <Kv k="우리 이적 예산" v={formatMoney(club.transferBudget)} />
        <Kv k="주급 예산 여유" v={formatMoney(Math.max(0, club.wageBudget - bill))} />
      </Card>

      {reply && <div className="card card__body small">{reply}</div>}

      {neg.stage === 'fee' && (
        <Card title={neg.kind === 'loan' ? '임대 조건' : '이적료 제시'} padded>
          {neg.kind === 'loan' ? (
            <>
              <div className="field__label">원소속 구단이 부담할 주급 비율</div>
              <Seg value={share} onChange={setShare} options={[{ value: '0.3', label: '30%' }, { value: '0.5', label: '50%' }, { value: '0.7', label: '70%' }]} />
              <p className="tiny muted">원소속 구단이 많이 부담할수록 거절될 가능성이 큽니다.</p>
            </>
          ) : (
            <MoneyStepper value={fee} onChange={setFee} />
          )}
          <button
            type="button"
            className="btn btn--primary btn--block"
            style={{ marginTop: 12 }}
            onClick={() => {
              let msg = '';
              mutate((s) => {
                msg = submitBid(s, neg.id, neg.kind === 'loan' ? 0 : fee, neg.kind === 'loan' ? Number(share) : undefined).message;
              });
              setReply(msg);
              const updated = useStore.getState().state?.negotiations.find((n) => n.id === id);
              if (updated) {
                setWage(updated.demandWage);
                setYears(String(updated.demandYears));
                setStatus(updated.demandStatus);
              }
            }}
          >
            {neg.kind === 'loan' ? '임대 제안 보내기' : `${formatMoney(fee)} 제안하기`}
          </button>
        </Card>
      )}

      {neg.stage === 'contract' && neg.kind !== 'loan' && (
        <Card title="계약 조건" padded>
          <p className="small muted" style={{ marginTop: 0 }}>
            선수 요구: 주급 {formatMoney(neg.demandWage)} · {neg.demandYears}년 · {STATUS_LABEL[neg.demandStatus]}
          </p>
          <div className="field">
            <div className="field__label">주급</div>
            <MoneyStepper value={wage} onChange={setWage} min={1} />
          </div>
          <div className="field">
            <div className="field__label">계약 기간</div>
            <Seg value={years} onChange={setYears} options={['1', '2', '3', '4', '5'].map((y) => ({ value: y, label: `${y}년` }))} />
          </div>
          <div className="field">
            <div className="field__label">팀 내 위상 약속</div>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value as SquadStatus)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <p className="tiny muted">약속한 위상만큼 출전하지 못하면 선수가 불만을 갖게 됩니다.</p>
          </div>
          <button
            type="button"
            className="btn btn--primary btn--block"
            onClick={() => {
              let msg = '';
              mutate((s, rng) => {
                msg = submitContract(s, neg.id, wage, Number(years), status, rng).message;
              });
              setReply(msg);
              const updated = useStore.getState().state?.negotiations.find((n) => n.id === id);
              if (updated) setWage(updated.demandWage);
            }}
          >
            계약 제안하기
          </button>
        </Card>
      )}

      {neg.stage === 'contract' && neg.kind === 'loan' && (
        <Card title="임대 확정" padded>
          <p className="small" style={{ marginTop: 0 }}>
            {seller?.name}이(가) 임대를 허락했습니다. 시즌이 끝날 때까지 주급의 {Math.round((1 - (neg.loanParentPays ?? 0.5)) * 100)}%({formatMoney(Math.round((player.contract?.wage ?? 0) * (1 - (neg.loanParentPays ?? 0.5))))})를 우리가 부담합니다.
          </p>
          <button
            type="button"
            className="btn btn--primary btn--block"
            onClick={() => {
              let msg = '';
              mutate((s, rng) => {
                msg = submitContract(s, neg.id, 0, 1, 'rotation', rng).message;
              });
              setReply(msg);
            }}
          >
            임대 확정
          </button>
        </Card>
      )}

      {(neg.stage === 'done' || neg.stage === 'failed') && (
        <Card padded>
          <b className={neg.stage === 'done' ? 'good' : 'bad'}>{neg.stage === 'done' ? '협상 성사' : '협상 결렬'}</b>
        </Card>
      )}

      {neg.log.length > 0 && (
        <Card title="협상 기록" padded>
          {neg.log.map((line, i) => (
            <div key={i} className="small" style={{ padding: '4px 0', borderBottom: '1px solid var(--line)' }}>
              {line}
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
