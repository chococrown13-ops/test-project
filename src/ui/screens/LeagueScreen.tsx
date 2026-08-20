import { useState } from 'react';
import { buildTable, goalDifference, recentForm, totalRounds } from '../../game/league';
import type { GameState } from '../../game/types';
import { Card, Segmented } from '../components/common';

type Tab = 'table' | 'fixtures' | 'scorers';

export function LeagueScreen({ state }: { state: GameState }) {
  const [tab, setTab] = useState<Tab>('table');

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'table', label: '순위표' },
            { value: 'fixtures', label: '일정' },
            { value: 'scorers', label: '득점 순위' },
          ]}
        />
      </div>
      {tab === 'table' && <LeagueTable state={state} />}
      {tab === 'fixtures' && <Fixtures state={state} />}
      {tab === 'scorers' && <Scorers state={state} />}
    </>
  );
}

function LeagueTable({ state }: { state: GameState }) {
  const table = buildTable(state.fixtures, Object.keys(state.teams));

  return (
    <Card title={`${state.leagueName} · ${state.season}시즌`}>
      <table className="table">
        <thead>
          <tr>
            <th className="table__pos">#</th>
            <th className="table__team" style={{ textAlign: 'left' }}>
              팀
            </th>
            <th>경기</th>
            <th>승</th>
            <th>무</th>
            <th>패</th>
            <th>득실</th>
            <th>승점</th>
          </tr>
        </thead>
        <tbody>
          {table.map((row, index) => {
            const team = state.teams[row.teamId];
            const diff = goalDifference(row);
            return (
              <tr key={row.teamId} className={row.teamId === state.clubId ? 'is-club' : undefined}>
                <td className="table__pos">{index + 1}</td>
                <td className="table__team">
                  <span className="table__team-inner">
                    <span className="table__dot" style={{ background: team.color }} />
                    <span className="table__name">{team.name}</span>
                  </span>
                </td>
                <td>{row.played}</td>
                <td>{row.won}</td>
                <td>{row.drawn}</td>
                <td>{row.lost}</td>
                <td>{diff > 0 ? `+${diff}` : diff}</td>
                <td className="table__pts">{row.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function Fixtures({ state }: { state: GameState }) {
  const rounds = totalRounds(state.fixtures);
  // Land on the round about to be played, not the start of the season.
  const [round, setRound] = useState(Math.min(state.round, rounds - 1));

  const fixtures = state.fixtures.filter((f) => f.round === round);

  return (
    <>
      <div className="row" style={{ marginBottom: 12, gap: 8 }}>
        <button
          type="button"
          className="btn"
          style={{ padding: '9px 14px' }}
          disabled={round === 0}
          onClick={() => setRound((r) => Math.max(0, r - 1))}
        >
          ◀
        </button>
        <div style={{ flex: 1, textAlign: 'center', fontWeight: 700 }}>
          {round + 1}라운드
          {round === state.round && <span className="tiny faint"> · 다음 경기</span>}
        </div>
        <button
          type="button"
          className="btn"
          style={{ padding: '9px 14px' }}
          disabled={round >= rounds - 1}
          onClick={() => setRound((r) => Math.min(rounds - 1, r + 1))}
        >
          ▶
        </button>
      </div>

      <Card>
        {fixtures.map((fixture) => {
          const home = state.teams[fixture.homeId];
          const away = state.teams[fixture.awayId];
          const involvesClub = fixture.homeId === state.clubId || fixture.awayId === state.clubId;
          return (
            <div
              key={fixture.id}
              className={`fixture${involvesClub ? ' fixture--club' : ''}`}
            >
              <span className="fixture__home">{home.name}</span>
              <span
                className={`fixture__score${fixture.played ? '' : ' fixture__score--upcoming'}`}
              >
                {fixture.played ? `${fixture.homeGoals} - ${fixture.awayGoals}` : 'vs'}
              </span>
              <span className="fixture__away">{away.name}</span>
            </div>
          );
        })}
      </Card>

      <Card title="우리 팀 최근 경기">
        <div style={{ padding: 12 }}>
          <div className="form-dots" style={{ justifyContent: 'flex-start' }}>
            {recentForm(state.fixtures, state.clubId).map((result, i) => (
              <span key={i} className={`form-dot form-dot--${result}`}>
                {result}
              </span>
            ))}
            {recentForm(state.fixtures, state.clubId).length === 0 && (
              <span className="tiny faint">아직 치른 경기가 없습니다.</span>
            )}
          </div>
        </div>
      </Card>
    </>
  );
}

function Scorers({ state }: { state: GameState }) {
  const scorers = Object.values(state.teams)
    .flatMap((team) => team.players.map((player) => ({ player, team })))
    .filter(({ player }) => player.season.goals > 0)
    .sort((a, b) => b.player.season.goals - a.player.season.goals || b.player.season.assists - a.player.season.assists)
    .slice(0, 25);

  if (scorers.length === 0) {
    return <div className="empty">아직 득점 기록이 없습니다.</div>;
  }

  return (
    <Card title="리그 득점 순위">
      <table className="table">
        <thead>
          <tr>
            <th className="table__pos">#</th>
            <th className="table__team" style={{ textAlign: 'left' }}>
              선수
            </th>
            <th>골</th>
            <th>도움</th>
          </tr>
        </thead>
        <tbody>
          {scorers.map(({ player, team }, index) => (
            <tr key={player.id} className={team.id === state.clubId ? 'is-club' : undefined}>
              <td className="table__pos">{index + 1}</td>
              <td className="table__team">
                <span className="table__team-inner">
                  <span className="table__dot" style={{ background: team.color }} />
                  <span>
                    <span className="table__name" style={{ display: 'block' }}>
                      {player.name}
                    </span>
                    <span className="tiny faint">{team.shortName}</span>
                  </span>
                </span>
              </td>
              <td className="table__pts">{player.season.goals}</td>
              <td>{player.season.assists}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
