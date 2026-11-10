import { ROLE_LABEL } from '../../game/formations';
import { buildTable, goalDifference, positionOf, recentForm, totalRounds } from '../../game/league';
import { MENTALITY_LABEL, overall, teamStrength } from '../../game/ratings';
import { transferWindow } from '../../game/transfer';
import type { GameState } from '../../game/types';
import { useGame } from '../../store/useGame';
import { Card, gaugeColor } from '../components/common';

/** PC dashboard: the manager's desk, one glance at everything that matters this week. */
export function HomeScreen({ state }: { state: GameState }) {
  const setScreen = useGame((s) => s.setScreen);
  const markInboxRead = useGame((s) => s.markInboxRead);

  const club = state.teams[state.clubId];
  const table = buildTable(state.fixtures, Object.keys(state.teams));
  const position = positionOf(table, state.clubId);
  const rounds = totalRounds(state.fixtures);
  const window = transferWindow(state.round, rounds);

  const next = state.fixtures.find(
    (f) => f.round === state.round && (f.homeId === state.clubId || f.awayId === state.clubId),
  );
  const isHome = next?.homeId === state.clubId;
  const opponent = next ? state.teams[isHome ? next.awayId : next.homeId] : null;

  const ours = teamStrength(club);
  const theirs = opponent ? teamStrength(opponent) : null;
  const edge = ours.overall * (isHome ? 1.045 : 1);
  const winShare = theirs ? Math.round((edge / (edge + theirs.overall)) * 100) : 0;

  const played = state.fixtures
    .filter((f) => f.played && (f.homeId === state.clubId || f.awayId === state.clubId))
    .sort((a, b) => b.round - a.round)
    .slice(0, 5);

  // Table slice around the club, plus the leader for reference.
  const index = position - 1;
  const from = Math.max(0, Math.min(index - 3, table.length - 7));
  const slice = table.slice(from, from + 7);

  const injured = club.players.filter((p) => p.injuredFor > 0);
  const tired = club.lineup
    .map((id) => club.players.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p && p.fitness < 70);
  const scorers = [...club.players]
    .filter((p) => p.season.goals > 0)
    .sort((a, b) => b.season.goals - a.season.goals)
    .slice(0, 5);
  const inbox = state.inbox.slice(0, 6);

  return (
    <div className="dash">
      <Card title="다음 경기" padded>
        {state.seasonOver ? (
          <div className="dash__empty">
            시즌이 끝났습니다.
            <button type="button" className="btn btn--primary" onClick={() => setScreen('match')}>
              시즌 결산 보기
            </button>
          </div>
        ) : opponent && next ? (
          <>
            <div className="next-match">
              <DashCrest
                name={isHome ? club.shortName : opponent.shortName}
                color={isHome ? club.color : opponent.color}
                accent={isHome ? club.accent : opponent.accent}
              />
              <div className="next-match__mid">
                <div className="next-match__round">
                  {next.round + 1}라운드 · {isHome ? '홈' : '원정'}
                </div>
                <div className="next-match__vs">
                  {isHome ? club.name : opponent.name}
                  <span className="faint"> vs </span>
                  {isHome ? opponent.name : club.name}
                </div>
                <div className="tiny muted">
                  상대 {positionOf(table, opponent.id)}위 · 전력 {Math.round(theirs!.overall)} ·
                  예상 승률 <b style={{ color: gaugeColor(winShare) }}>{winShare}%</b>
                </div>
              </div>
              <DashCrest
                name={isHome ? opponent.shortName : club.shortName}
                color={isHome ? opponent.color : club.color}
                accent={isHome ? opponent.accent : club.accent}
              />
            </div>
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <button
                type="button"
                className="btn"
                style={{ flex: 1 }}
                onClick={() => setScreen('tactics')}
              >
                전술 점검 · {club.formation} {MENTALITY_LABEL[club.tactics.mentality]}
              </button>
              <button
                type="button"
                className="btn btn--primary"
                style={{ flex: 1 }}
                onClick={() => setScreen('match')}
              >
                {state.live ? '경기로 돌아가기' : '경기 준비'}
              </button>
            </div>
          </>
        ) : (
          <div className="empty">예정된 경기가 없습니다.</div>
        )}
      </Card>

      <Card
        title={`${state.leagueName} 순위`}
        action={
          <button type="button" className="link" onClick={() => setScreen('league')}>
            전체 보기
          </button>
        }
      >
        <table className="table">
          <thead>
            <tr>
              <th className="table__pos">#</th>
              <th className="table__team" style={{ textAlign: 'left' }}>
                팀
              </th>
              <th>경기</th>
              <th>득실</th>
              <th>승점</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((row, i) => {
              const team = state.teams[row.teamId];
              const diff = goalDifference(row);
              return (
                <tr
                  key={row.teamId}
                  className={row.teamId === state.clubId ? 'is-club' : undefined}
                >
                  <td className="table__pos">{from + i + 1}</td>
                  <td className="table__team">
                    <span className="table__team-inner">
                      <span className="table__dot" style={{ background: team.color }} />
                      <span className="table__name">{team.name}</span>
                    </span>
                  </td>
                  <td>{row.played}</td>
                  <td>{diff > 0 ? `+${diff}` : diff}</td>
                  <td className="table__pts">{row.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card title="구단 현황" padded>
        <div className="stat-tiles">
          <Tile
            label="순위"
            value={`${position}위`}
            sub={`목표 ${club.expectation}위`}
            tone={position <= club.expectation ? 'good' : 'bad'}
          />
          <Tile
            label="팀 전력"
            value={String(Math.round(ours.overall))}
            sub={`공 ${Math.round(ours.attack)} · 수 ${Math.round(ours.defence)}`}
          />
          <Tile
            label="이적 예산"
            value={money(club.budget)}
            sub={window.open ? '이적시장 열림' : '이적시장 닫힘'}
            tone={window.open ? 'good' : undefined}
          />
          <Tile
            label="라운드"
            value={`${Math.min(state.round + 1, rounds)}/${rounds}`}
            sub={`${state.season}시즌`}
          />
        </div>
        <div className="kv" style={{ marginTop: 8 }}>
          <span className="kv__key">최근 5경기</span>
          <span className="kv__value">
            <span className="form-dots">
              {recentForm(state.fixtures, state.clubId).map((r, i) => (
                <span key={i} className={`form-dot form-dot--${r}`}>
                  {r}
                </span>
              ))}
              {played.length === 0 && <span className="tiny faint">기록 없음</span>}
            </span>
          </span>
        </div>
      </Card>

      <Card title="최근 결과">
        {played.length === 0 && <div className="empty">아직 치른 경기가 없습니다.</div>}
        {played.map((f) => {
          const h = state.teams[f.homeId];
          const a = state.teams[f.awayId];
          const us = f.homeId === state.clubId ? f.homeGoals : f.awayGoals;
          const them = f.homeId === state.clubId ? f.awayGoals : f.homeGoals;
          const r = us > them ? 'W' : us < them ? 'L' : 'D';
          return (
            <div key={f.id} className="fixture fixture--club">
              <span className="fixture__home">{h.name}</span>
              <span className={`fixture__score result--${r}`}>
                {f.homeGoals} - {f.awayGoals}
              </span>
              <span className="fixture__away">{a.name}</span>
            </div>
          );
        })}
      </Card>

      <Card title="선수단 리포트" padded>
        <div className="field__label">부상 ({injured.length})</div>
        {injured.length === 0 && (
          <div className="tiny faint" style={{ marginBottom: 10 }}>
            부상자 없음
          </div>
        )}
        {injured.map((p) => (
          <div key={p.id} className="tiny muted">
            {ROLE_LABEL[p.role]} {p.name} — {p.injuredFor}경기 결장
          </div>
        ))}
        <div className="field__label" style={{ marginTop: 10 }}>
          체력 저하 선발 ({tired.length})
        </div>
        {tired.length === 0 && <div className="tiny faint">모두 정상 컨디션</div>}
        {tired.map((p) => (
          <div key={p.id} className="tiny muted">
            {ROLE_LABEL[p.role]} {p.name} — 체력 {Math.round(p.fitness)}
          </div>
        ))}
        <div className="field__label" style={{ marginTop: 10 }}>
          팀 내 득점
        </div>
        {scorers.length === 0 && <div className="tiny faint">아직 득점 없음</div>}
        {scorers.map((p) => (
          <div key={p.id} className="kv">
            <span className="kv__key">
              {p.name} <span className="faint">OVR {overall(p)}</span>
            </span>
            <span className="kv__value">
              {p.season.goals}골 {p.season.assists}도움
            </span>
          </div>
        ))}
      </Card>

      <Card
        title="받은 메시지"
        action={
          <button type="button" className="link" onClick={() => setScreen('club')}>
            전체 보기
          </button>
        }
      >
        {inbox.length === 0 && <div className="empty">메시지가 없습니다.</div>}
        {inbox.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`mail mail--${item.tone}${item.read ? '' : ' mail--unread'}`}
            style={{ width: '100%', textAlign: 'left' }}
            onClick={() => markInboxRead(item.id)}
          >
            <div className="mail__subject">{item.subject}</div>
            <div className="mail__body" style={{ whiteSpace: 'pre-line' }}>
              {item.body}
            </div>
          </button>
        ))}
      </Card>
    </div>
  );
}

function DashCrest({ name, color, accent }: { name: string; color: string; accent: string }) {
  return (
    <div className="scoreboard__badge" style={{ background: color, color: accent }}>
      {name}
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className="tile">
      <div className="tile__label">{label}</div>
      <div
        className="tile__value"
        style={{
          color: tone === 'good' ? 'var(--accent)' : tone === 'bad' ? 'var(--bad)' : undefined,
        }}
      >
        {value}
      </div>
      {sub && <div className="tile__sub">{sub}</div>}
    </div>
  );
}

const money = (thousands: number): string =>
  thousands >= 1000 ? `${(thousands / 1000).toFixed(1)}M` : `${thousands}K`;
