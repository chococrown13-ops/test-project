import { useEffect } from 'react';
import { formatMoney } from '../../game/ability';
import { confidenceLabel } from '../../game/board';
import { formatDate, formatShortDate, windowOpen } from '../../game/calendar';
import { buildTable, competitionName, positionOf, recentForm } from '../../game/competition';
import { lineupIssues } from '../../game/tactics';
import type { Message } from '../../game/types';
import { nextUserFixture } from '../../game/world';
import { useGame, useStore } from '../../store';
import { Card, Crest, FormDots, Tile, tone } from '../kit';

export function HomeScreen() {
  const state = useGame();
  const push = useStore((s) => s.push);
  const jump = useStore((s) => s.jump);
  const openMatch = useStore((s) => s.openMatch);
  const club = state.clubs[state.clubId];
  const table = buildTable(state, club.division);
  const position = positionOf(table, club.id);
  const next = nextUserFixture(state);
  const opponent = next ? state.clubs[next.homeId === club.id ? next.awayId : next.homeId] : null;
  const isHome = next?.homeId === club.id;
  const window = windowOpen(state.dates, state.day);
  const windowEnd = window === 'summer' ? state.dates.windowSummerEnd : window === 'winter' ? state.dates.windowWinterEnd : null;

  const squad = club.playerIds.map((id) => state.players[id]).filter(Boolean);
  const avgMorale = squad.reduce((s, p) => s + p.morale, 0) / Math.max(1, squad.length);

  // FM26's "things that need you" list.
  const todos: { icon: string; text: string; go: () => void }[] = [];
  const openOffers = state.offers.filter((o) => o.status === 'open');
  if (openOffers.length) todos.push({ icon: '💰', text: `선수 영입 제안 ${openOffers.length}건에 답해야 합니다`, go: () => jump('recruit', 'deals') });
  const talks = state.negotiations.filter((n) => n.stage === 'fee' || n.stage === 'contract');
  if (talks.length) todos.push({ icon: '🤝', text: `진행 중인 협상 ${talks.length}건`, go: () => jump('recruit', 'deals') });
  const unhappy = squad.filter((p) => p.unhappy);
  unhappy.slice(0, 2).forEach((p) => todos.push({ icon: '😠', text: `${p.name}: ${p.unhappy}`, go: () => push({ kind: 'player', id: p.id }) }));
  const expiring = squad.filter((p) => p.contract && p.contract.expires === state.season && state.day >= state.dates.windowWinterStart - 60);
  if (expiring.length) todos.push({ icon: '📝', text: `계약 만료 예정 ${expiring.length}명 — 재계약 검토`, go: () => jump('squad', 'contracts') });
  if (next && next.day - state.day <= 2) {
    const issues = lineupIssues(club, state.players);
    if (issues.length) todos.push({ icon: '⚠️', text: `선발 명단 문제: ${issues[0]}`, go: () => jump('tactics') });
  }
  const pitches = state.pitches.filter((p) => !p.dismissed && state.day - p.day <= 3);
  if (pitches.length) todos.push({ icon: '📨', text: `영입 요청에 새 제안 ${pitches.length}건`, go: () => jump('recruit', 'requirements') });

  const around = table.slice(Math.max(0, Math.min(position - 3, table.length - 5)), Math.max(0, Math.min(position - 3, table.length - 5)) + 5);

  return (
    <>
      {next && opponent ? (
        <div className="hero">
          <div className="row">
            <span className="hero__comp">{competitionName(state, next)}</span>
            <span className="spacer" />
            <span className="badge">{next.day === state.day ? '오늘' : `D-${next.day - state.day}`}</span>
          </div>
          <div className="hero__vs">
            <div className="hero__team">
              <Crest club={isHome ? club : opponent} size={46} />
              {(isHome ? club : opponent).name}
            </div>
            <div className="hero__mid">VS</div>
            <div className="hero__team">
              <Crest club={isHome ? opponent : club} size={46} />
              {(isHome ? opponent : club).name}
            </div>
          </div>
          <div className="row small muted" style={{ justifyContent: 'space-between' }}>
            <span>{formatDate(next.day)} · {isHome ? '홈' : '원정'}</span>
            <span>
              상대 최근 <FormDots form={recentForm(state, opponent.id)} />
            </span>
          </div>
          {state.matchPending === next.id && (
            <button type="button" className="btn btn--blue btn--block" style={{ marginTop: 12 }} onClick={openMatch}>
              경기 준비하기
            </button>
          )}
        </div>
      ) : (
        <div className="hero">
          <div className="hero__comp">다음 경기 없음</div>
          <div className="small muted" style={{ marginTop: 6 }}>시즌 일정이 끝났습니다. 계속을 눌러 시즌을 마무리하세요.</div>
        </div>
      )}

      {todos.length > 0 && (
        <Card title="할 일">
          {todos.map((t, i) => (
            <button key={i} type="button" className="todo" onClick={t.go}>
              <span className="todo__icon">{t.icon}</span>
              <span style={{ flex: 1 }}>{t.text}</span>
              <span className="faint">›</span>
            </button>
          ))}
        </Card>
      )}

      <div className="tiles">
        <Tile label="리그 순위" value={`${position}위`} sub={`목표 ${club.expectation}위 이내`} color={position <= club.expectation ? 'var(--good)' : 'var(--bad)'} onClick={() => jump('comps', 'league')} />
        <Tile label="이사회 신뢰" value={confidenceLabel(state.confidence)} sub={`${Math.round(state.confidence)}/100`} color={tone(state.confidence)} onClick={() => jump('club', 'board')} />
        <Tile label="이적 예산" value={formatMoney(club.transferBudget)} sub={`잔고 ${formatMoney(club.balance)}`} onClick={() => jump('club', 'finance')} />
        <Tile
          label="이적시장"
          value={window ? '열림' : '닫힘'}
          sub={windowEnd !== null ? `마감 ${formatShortDate(windowEnd)}` : '1월 1일 개장'}
          color={window ? 'var(--good)' : undefined}
          onClick={() => jump('recruit')}
        />
        <Tile label="팀 사기" value={avgMorale >= 70 ? '좋음' : avgMorale >= 50 ? '보통' : '나쁨'} sub={`평균 ${Math.round(avgMorale)}`} color={tone(avgMorale)} onClick={() => jump('squad', 'dynamics')} />
        <Tile label="최근 5경기" value={<FormDots form={recentForm(state, club.id)} />} sub={state.leagueNames[club.division]} onClick={() => jump('comps', 'fixtures')} />
      </div>

      <Card title={`받은 메시지 (${state.inbox.filter((m) => !m.read).length})`}>
        {state.inbox.length === 0 && <div className="empty">메시지가 없습니다.</div>}
        {state.inbox.slice(0, 25).map((m) => (
          <MailRow key={m.id} message={m} onOpen={() => push({ kind: 'inbox', id: m.id })} />
        ))}
      </Card>

      <Card title={state.leagueNames[club.division]} action="전체" onAction={() => jump('comps', 'league')}>
        <table className="table">
          <tbody>
            {around.map((row) => {
              const c = state.clubs[row.clubId];
              return (
                <tr key={row.clubId} className={row.clubId === club.id ? 'me' : undefined}>
                  <td style={{ width: 28 }}>{table.indexOf(row) + 1}</td>
                  <td className="left">{c.name}</td>
                  <td className="faint">{row.played}경기</td>
                  <td style={{ fontWeight: 900 }}>{row.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function MailRow({ message, onOpen }: { message: Message; onOpen: () => void }) {
  return (
    <button type="button" className={`mail${message.read ? '' : ' mail--unread'} mail--${message.tone}`} onClick={onOpen}>
      <div className="mail__top">
        <span className="mail__subject">{message.subject}</span>
        <span className="mail__from">{formatShortDate(message.day)}</span>
      </div>
      <div className="mail__preview">
        {message.from} — {message.body.split('\n')[0]}
      </div>
    </button>
  );
}

export function InboxDetail({ id }: { id: string }) {
  const state = useGame();
  const mutate = useStore((s) => s.mutate);
  const push = useStore((s) => s.push);
  const jump = useStore((s) => s.jump);
  const message = state.inbox.find((m) => m.id === id);
  useEffect(() => {
    mutate((s) => {
      const m = s.inbox.find((x) => x.id === id);
      if (m) m.read = true;
    });
  }, [id, mutate]);
  if (!message) return <div className="empty">메시지가 삭제되었습니다.</div>;

  const link = message.link;
  let action: { label: string; go: () => void } | null = null;
  if (link?.type === 'player' && state.players[link.id]) action = { label: '선수 보기', go: () => push({ kind: 'player', id: link.id }) };
  if (link?.type === 'offer') action = { label: '제안 확인하기', go: () => jump('recruit', 'deals') };
  if (link?.type === 'pitch') action = { label: '요청 제안 보기', go: () => jump('recruit', 'requirements') };
  if (link?.type === 'negotiation') action = { label: '협상 보기', go: () => push({ kind: 'negotiation', id: link.id }) };
  if (link?.type === 'club') action = { label: '구단 보기', go: () => push({ kind: 'club', id: link.id }) };

  return (
    <Card padded>
      <div className="small faint">
        {message.from} · {formatDate(message.day)}
      </div>
      <h2 style={{ fontSize: 18, margin: '6px 0 12px' }}>{message.subject}</h2>
      <div className="prose">{message.body}</div>
      {action && (
        <button type="button" className="btn btn--primary btn--block" style={{ marginTop: 16 }} onClick={action.go}>
          {action.label}
        </button>
      )}
    </Card>
  );
}
