import { useState } from 'react';
import { formatShortDate } from '../../game/calendar';
import { PLAYOFF_PLACES, PROMOTED, RELEGATED, buildTable, competitionName, cupRoundName, winnerOf } from '../../game/competition';
import type { Fixture, Player } from '../../game/types';
import { useGame, useStore } from '../../store';
import { Card, Crest, FormDots, Seg, SubTabs } from '../kit';

type Sub = 'league' | 'fixtures' | 'cup' | 'stats';

export function CompsScreen() {
  const sub = (useStore((s) => s.subs.comps) as Sub) ?? 'league';
  const setSub = useStore((s) => s.setSub);
  return (
    <>
      <SubTabs<Sub>
        value={sub}
        onChange={(v) => setSub('comps', v)}
        options={[
          { value: 'league', label: '리그 순위' },
          { value: 'fixtures', label: '일정·결과' },
          { value: 'cup', label: 'FA컵' },
          { value: 'stats', label: '개인 기록' },
        ]}
      />
      {sub === 'league' && <League />}
      {sub === 'fixtures' && <Fixtures />}
      {sub === 'cup' && <Cup />}
      {sub === 'stats' && <Stats />}
    </>
  );
}

function DivisionPicker({ value, onChange }: { value: string; onChange: (v: '0' | '1' | '2') => void }) {
  const state = useGame();
  return (
    <div style={{ marginBottom: 10 }}>
      <Seg value={value as '0' | '1' | '2'} onChange={onChange} options={[0, 1, 2].map((d) => ({ value: String(d) as '0' | '1' | '2', label: state.leagueNames[d] }))} />
    </div>
  );
}

function League() {
  const state = useGame();
  const push = useStore((s) => s.push);
  const [division, setDivision] = useState<'0' | '1' | '2'>(String(state.clubs[state.clubId].division) as '0' | '1' | '2');
  const d = Number(division);
  const table = buildTable(state, d);
  const zone = (i: number) => {
    const pos = i + 1;
    if (d > 0 && pos <= PROMOTED) return 'zone-up';
    if (d > 0 && pos >= PLAYOFF_PLACES[0] && pos <= PLAYOFF_PLACES[1]) return 'zone-po';
    if (d < 2 && pos > table.length - RELEGATED) return 'zone-down';
    return '';
  };
  return (
    <>
      <DivisionPicker value={division} onChange={setDivision} />
      <Card>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th className="left">팀</th>
                <th>경기</th>
                <th>승</th>
                <th>무</th>
                <th>패</th>
                <th>득실</th>
                <th>승점</th>
                <th>최근</th>
              </tr>
            </thead>
            <tbody>
              {table.map((row, i) => {
                const c = state.clubs[row.clubId];
                const gd = row.goalsFor - row.goalsAgainst;
                return (
                  <tr key={row.clubId} className={`${row.clubId === state.clubId ? 'me ' : ''}${zone(i)} clickable`} onClick={() => push({ kind: 'club', id: c.id })}>
                    <td>{i + 1}</td>
                    <td className="left" style={{ fontWeight: row.clubId === state.clubId ? 900 : 600 }}>
                      {c.name}
                    </td>
                    <td>{row.played}</td>
                    <td>{row.won}</td>
                    <td>{row.drawn}</td>
                    <td>{row.lost}</td>
                    <td>{gd > 0 ? `+${gd}` : gd}</td>
                    <td style={{ fontWeight: 900 }}>{row.points}</td>
                    <td>
                      <FormDots form={row.form.slice(-3)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="tiny faint" style={{ textAlign: 'center' }}>
        {d > 0 ? `초록: 자동 승격 · 파랑: 승격 플레이오프 (${PLAYOFF_PLACES[0]}-${PLAYOFF_PLACES[1]}위)` : ''}
        {d < 2 ? `${d > 0 ? ' · ' : ''}빨강: 강등` : ''}
      </p>
    </>
  );
}

function ResultRow({ f }: { f: Fixture }) {
  const state = useGame();
  const push = useStore((s) => s.push);
  const h = state.clubs[f.homeId];
  const a = state.clubs[f.awayId];
  const mine = f.homeId === state.clubId || f.awayId === state.clubId;
  return (
    <button type="button" className="list-row" onClick={() => (f.played ? push({ kind: 'fixture', id: f.id }) : push({ kind: 'club', id: f.homeId === state.clubId ? a.id : h.id }))} style={mine ? { background: 'rgba(59,227,162,0.05)' } : undefined}>
      <span className="tiny faint" style={{ width: 54 }}>{formatShortDate(f.day)}</span>
      <span className="list-row__main" style={{ textAlign: 'right' }}>
        <span className="list-row__title">{h.name}</span>
      </span>
      <b className="num" style={{ minWidth: 52, textAlign: 'center', color: f.played ? undefined : 'var(--faint)' }}>
        {f.played ? `${f.homeGoals}-${f.awayGoals}` : 'vs'}
        {f.pens && <span className="tiny"> ({f.pens.home}-{f.pens.away})</span>}
      </b>
      <span className="list-row__main">
        <span className="list-row__title">{a.name}</span>
      </span>
    </button>
  );
}

function Fixtures() {
  const state = useGame();
  const [scope, setScope] = useState<'mine' | 'round'>('mine');
  const club = state.clubs[state.clubId];
  const mine = state.fixtures.filter((f) => f.homeId === club.id || f.awayId === club.id).sort((a, b) => a.day - b.day);
  const lastDay = Math.max(-1, ...state.fixtures.filter((f) => f.played && f.comp === 'league' && f.division === club.division).map((f) => f.day));
  const round = state.fixtures.filter((f) => f.comp === 'league' && f.division === club.division && f.day === lastDay);
  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <Seg value={scope} onChange={setScope} options={[{ value: 'mine', label: '우리 일정' }, { value: 'round', label: '최근 라운드' }]} />
      </div>
      {scope === 'mine' ? (
        <Card>
          {mine.map((f) => (
            <div key={f.id}>
              <div className="tiny faint" style={{ padding: '6px 14px 0' }}>{competitionName(state, f)}</div>
              <ResultRow f={f} />
            </div>
          ))}
        </Card>
      ) : (
        <Card title={round[0] ? `${round[0].round + 1}라운드 결과` : '결과 없음'}>
          {round.length === 0 && <div className="empty">아직 치른 라운드가 없습니다.</div>}
          {round.map((f) => (
            <ResultRow key={f.id} f={f} />
          ))}
        </Card>
      )}
    </>
  );
}

function Cup() {
  const state = useGame();
  const cup = state.fixtures.filter((f) => f.comp === 'cup');
  const rounds = [...new Set(cup.map((f) => f.round))].sort((a, b) => b - a);
  const playoffs = state.fixtures.filter((f) => f.comp === 'playoff');
  return (
    <>
      {playoffs.length > 0 && (
        <Card title="승격 플레이오프">
          {playoffs.map((f) => (
            <div key={f.id}>
              <div className="tiny faint" style={{ padding: '6px 14px 0' }}>{competitionName(state, f)}</div>
              <ResultRow f={f} />
            </div>
          ))}
        </Card>
      )}
      {rounds.map((r) => {
        const fixtures = cup.filter((f) => f.round === r);
        return (
          <Card key={r} title={`${state.cupName} ${cupRoundName(r)} · ${formatShortDate(fixtures[0].day)}`}>
            {fixtures.map((f) => (
              <ResultRow key={f.id} f={f} />
            ))}
            {r === 5 && fixtures[0].played && (
              <div className="card__body" style={{ textAlign: 'center' }}>
                🏆 <b>{state.clubs[winnerOf(fixtures[0])].name}</b> 우승
              </div>
            )}
          </Card>
        );
      })}
    </>
  );
}

function Stats() {
  const state = useGame();
  const push = useStore((s) => s.push);
  const [division, setDivision] = useState<'0' | '1' | '2'>(String(state.clubs[state.clubId].division) as '0' | '1' | '2');
  const [kind, setKind] = useState<'goals' | 'assists' | 'rating'>('goals');
  const players = Object.values(state.players).filter((p) => p.clubId && state.clubs[p.clubId].division === Number(division));
  const season = (p: Player) => p.seasons.find((s) => s.season === state.season && s.clubId === p.clubId);
  const value = (p: Player) => {
    const s = season(p);
    if (!s) return 0;
    if (kind === 'goals') return s.goals;
    if (kind === 'assists') return s.assists;
    return s.ratingCount >= 5 ? s.ratingSum / s.ratingCount : 0;
  };
  const top = players
    .map((p) => ({ p, v: value(p) }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, 20);
  return (
    <>
      <DivisionPicker value={division} onChange={setDivision} />
      <div style={{ marginBottom: 10 }}>
        <Seg value={kind} onChange={setKind} options={[{ value: 'goals', label: '득점' }, { value: 'assists', label: '도움' }, { value: 'rating', label: '평균 평점' }]} />
      </div>
      <Card>
        {top.length === 0 && <div className="empty">아직 기록이 없습니다.</div>}
        {top.map(({ p, v }, i) => (
          <button key={p.id} type="button" className="list-row" onClick={() => push({ kind: 'player', id: p.id })}>
            <b style={{ width: 22 }}>{i + 1}</b>
            <Crest club={state.clubs[p.clubId!]} size={26} />
            <span className="list-row__main">
              <span className="list-row__title" style={{ display: 'block' }}>{p.name}</span>
              <span className="list-row__meta">{state.clubs[p.clubId!].name}</span>
            </span>
            <b className="num">{kind === 'rating' ? v.toFixed(2) : v}</b>
          </button>
        ))}
      </Card>
    </>
  );
}
