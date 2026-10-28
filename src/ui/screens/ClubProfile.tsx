import { bestPosition, formatMoney } from '../../game/ability';
import { buildTable, positionOf, recentForm } from '../../game/competition';
import { POS_LINE } from '../../game/formations';
import { MENTALITY_LABEL } from '../../game/tactics';
import type { Player } from '../../game/types';
import { useGame, useStore } from '../../store';
import { Card, Crest, FormDots, Kv } from '../kit';
import { PlayerRow } from '../PlayerRow';

const ORDER = { GK: 0, DEF: 1, MID: 2, ATT: 3 };

export function ClubProfile({ id }: { id: string }) {
  const state = useGame();
  const push = useStore((s) => s.push);
  const club = state.clubs[id];
  if (!club) return <div className="empty">구단을 찾을 수 없습니다.</div>;
  const table = buildTable(state, club.division);
  const squad = club.playerIds
    .map((pid) => state.players[pid])
    .filter((p): p is Player => !!p)
    .sort((a, b) => ORDER[POS_LINE[bestPosition(a)]] - ORDER[POS_LINE[bestPosition(b)]] || b.reputation - a.reputation);
  return (
    <>
      <Card padded>
        <div className="row">
          <Crest club={club} size={52} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>{club.name}</div>
            <div className="small muted">
              {state.leagueNames[club.division]} · {positionOf(table, club.id)}위
            </div>
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <Kv k="감독" v={club.manager} />
          <Kv k="홈구장" v={`${club.stadium} (${club.capacity.toLocaleString('ko-KR')}석)`} />
          <Kv k="평판" v={`${club.reputation}/100`} />
          <Kv k="전술" v={`공격 ${club.tactic.ipFormation} · 수비 ${club.tactic.oopFormation} · ${MENTALITY_LABEL[club.tactic.mentality]}`} />
          <Kv k="최근 경기" v={<FormDots form={recentForm(state, club.id)} />} />
          <Kv k="이적 예산(추정)" v={formatMoney(Math.round(club.transferBudget / 1000) * 1000)} />
        </div>
      </Card>
      <Card title={`선수단 ${squad.length}명`}>
        {squad.map((p) => (
          <PlayerRow key={p.id} state={state} player={p} onClick={() => push({ kind: 'player', id: p.id })} />
        ))}
      </Card>
    </>
  );
}
