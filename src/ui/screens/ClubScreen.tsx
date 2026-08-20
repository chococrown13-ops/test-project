import { useState } from 'react';
import { buildTable, positionOf, totalRounds } from '../../game/league';
import { teamStrength } from '../../game/ratings';
import type { GameState } from '../../game/types';
import { useGame } from '../../store/useGame';
import { Card } from '../components/common';
import { CustomiseScreen } from './CustomiseScreen';

const money = (thousands: number): string =>
  thousands >= 1000 ? `${(thousands / 1000).toFixed(1)}M` : `${thousands}K`;

export function ClubScreen({ state }: { state: GameState }) {
  const markInboxRead = useGame((s) => s.markInboxRead);
  const abandonGame = useGame((s) => s.abandonGame);
  const [open, setOpen] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [customising, setCustomising] = useState(false);

  if (customising) {
    return <CustomiseScreen state={state} onDone={() => setCustomising(false)} />;
  }

  const club = state.teams[state.clubId];
  const table = buildTable(state.fixtures, Object.keys(state.teams));
  const position = positionOf(table, state.clubId);
  const strength = teamStrength(club);
  const wageBill = club.players.reduce((sum, p) => sum + p.wage, 0);
  const squadValue = club.players.reduce((sum, p) => sum + p.value, 0);

  return (
    <>
      <Card title="구단 정보" padded>
        <div className="kv">
          <span className="kv__key">감독</span>
          <span className="kv__value">{state.managerName}</span>
        </div>
        <div className="kv">
          <span className="kv__key">리그</span>
          <span className="kv__value">{state.leagueName}</span>
        </div>
        <div className="kv">
          <span className="kv__key">시즌 / 라운드</span>
          <span className="kv__value">
            {state.season}시즌 · {Math.min(state.round + 1, totalRounds(state.fixtures))} /{' '}
            {totalRounds(state.fixtures)}
          </span>
        </div>
        <div className="kv">
          <span className="kv__key">현재 순위</span>
          <span className="kv__value">{position}위</span>
        </div>
        <div className="kv">
          <span className="kv__key">이사회 목표</span>
          <span className="kv__value">{club.expectation}위 이내</span>
        </div>
        <div className="kv">
          <span className="kv__key">팀 전력</span>
          <span className="kv__value">{Math.round(strength.overall)}</span>
        </div>
        <div className="kv">
          <span className="kv__key">선수단 가치</span>
          <span className="kv__value">{money(squadValue)}</span>
        </div>
        <div className="kv">
          <span className="kv__key">주급 총액</span>
          <span className="kv__value">{money(wageBill)}</span>
        </div>
        <div className="kv">
          <span className="kv__key">예산</span>
          <span className="kv__value">{money(club.budget)}</span>
        </div>
      </Card>

      <Card title={`받은 메시지 (${state.inbox.filter((i) => !i.read).length})`}>
        {state.inbox.length === 0 && <div className="empty">받은 메시지가 없습니다.</div>}
        {state.inbox.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`mail mail--${item.tone}${item.read ? '' : ' mail--unread'}`}
            onClick={() => {
              setOpen(open === item.id ? null : item.id);
              if (!item.read) markInboxRead(item.id);
            }}
          >
            <div className="mail__subject">{item.subject}</div>
            {open === item.id && <div className="mail__body">{item.body}</div>}
          </button>
        ))}
      </Card>

      {state.history.length > 0 && (
        <Card title="역대 성적">
          <table className="table">
            <thead>
              <tr>
                <th>시즌</th>
                <th>순위</th>
                <th>승</th>
                <th>무</th>
                <th>패</th>
                <th>승점</th>
              </tr>
            </thead>
            <tbody>
              {state.history
                .slice()
                .reverse()
                .map((record) => (
                  <tr key={record.season}>
                    <td>{record.season}</td>
                    <td className="table__pts">{record.position}위</td>
                    <td>{record.won}</td>
                    <td>{record.drawn}</td>
                    <td>{record.lost}</td>
                    <td>{record.points}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card title="게임" padded>
        <button
          type="button"
          className="btn btn--block"
          style={{ marginBottom: 10 }}
          onClick={() => setCustomising(true)}
        >
          리그 · 구단 이름 편집
        </button>
        {confirmReset ? (
          <>
            <p className="tiny" style={{ color: 'var(--bad)', marginTop: 0 }}>
              저장된 진행 상황이 모두 삭제됩니다. 계속할까요?
            </p>
            <div className="row" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn"
                style={{ flex: 1 }}
                onClick={() => setConfirmReset(false)}
              >
                취소
              </button>
              <button
                type="button"
                className="btn btn--danger"
                style={{ flex: 1 }}
                onClick={abandonGame}
              >
                삭제하고 처음으로
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            className="btn btn--danger btn--block"
            onClick={() => setConfirmReset(true)}
          >
            새 게임 시작
          </button>
        )}
        <p className="tiny faint" style={{ marginBottom: 0, marginTop: 10 }}>
          진행 상황은 이 기기의 브라우저에 자동 저장됩니다.
        </p>
      </Card>
    </>
  );
}
