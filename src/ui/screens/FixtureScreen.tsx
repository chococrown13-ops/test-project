import { formatDate } from '../../game/calendar';
import { competitionName } from '../../game/competition';
import { useGame, useStore } from '../../store';
import { Card, Crest, Kv } from '../kit';

export function FixtureScreen({ id }: { id: string }) {
  const state = useGame();
  const push = useStore((s) => s.push);
  const f = state.fixtures.find((x) => x.id === id);
  if (!f) return <div className="empty">경기를 찾을 수 없습니다.</div>;
  const h = state.clubs[f.homeId];
  const a = state.clubs[f.awayId];
  const goals = (side: 'home' | 'away') =>
    f.goals
      .filter((g) => g.side === side)
      .map((g) => `${state.players[g.playerId]?.name ?? '?'} ${g.minute}'${g.penalty ? ' (PK)' : ''}`);
  return (
    <>
      <div className="hero">
        <div className="hero__comp">{competitionName(state, f)} · {formatDate(f.day)}</div>
        <div className="hero__vs">
          <button type="button" className="hero__team" onClick={() => push({ kind: 'club', id: h.id })}>
            <Crest club={h} size={46} />
            {h.name}
          </button>
          <div style={{ fontSize: 34, fontWeight: 900 }} className="num">
            {f.homeGoals}-{f.awayGoals}
          </div>
          <button type="button" className="hero__team" onClick={() => push({ kind: 'club', id: a.id })}>
            <Crest club={a} size={46} />
            {a.name}
          </button>
        </div>
        {f.pens && <div className="small muted" style={{ textAlign: 'center' }}>승부차기 {f.pens.home}-{f.pens.away}</div>}
      </div>
      <Card title="득점" padded>
        <div className="grid2">
          <div className="small">{goals('home').map((g) => <div key={g}>⚽ {g}</div>)}</div>
          <div className="small" style={{ textAlign: 'right' }}>{goals('away').map((g) => <div key={g}>{g} ⚽</div>)}</div>
        </div>
      </Card>
      <Card padded>
        {f.homeXg !== undefined && <Kv k="기대 득점 (xG)" v={`${f.homeXg?.toFixed(2)} - ${f.awayXg?.toFixed(2)}`} />}
        {f.attendance !== undefined && <Kv k="관중" v={`${f.attendance.toLocaleString('ko-KR')}명`} />}
        <Kv k="경기장" v={f.neutral ? '중립 경기장' : h.stadium} />
      </Card>
    </>
  );
}
