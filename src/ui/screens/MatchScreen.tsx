import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { FORMATIONS, ROLE_LABEL } from '../../game/formations';
import { buildTable, positionOf, recentForm, totalRounds } from '../../game/league';
import { MATCH_LENGTH } from '../../game/matchEngine';
import { MENTALITY_LABEL, teamStrength } from '../../game/ratings';
import type { GameState, LiveMatch, MatchStats, Mentality, Team } from '../../game/types';
import { useGame } from '../../store/useGame';
import { Card, Field, Modal, Segmented, gaugeColor } from '../components/common';
import { PlayerRow } from '../components/PlayerRow';
import { MatchDirector, type RosterInput } from '../match2d/director';
import { matchKits } from '../match2d/MatchPitch';
import { MatchView } from '../match3d/MatchView';

/** Milliseconds per simulated minute. */
const SPEEDS = [
  { label: '⏸', value: 0 },
  { label: '1x', value: 700 },
  { label: '2x', value: 320 },
  { label: '4x', value: 120 },
] as const;

/** Animation speed of the 2D view for each clock speed. */
const TIME_SCALE: Record<number, number> = { 0: 0, 700: 1, 320: 1.8, 120: 3.2 };

export function MatchScreen({ state }: { state: GameState }) {
  if (state.seasonOver) return <SeasonOver state={state} />;
  if (state.live) return <LiveView key={state.live.fixtureId} state={state} live={state.live} />;
  return <PreMatch state={state} />;
}

/* ---------------------------------------------------------------- pre-match */

function PreMatch({ state }: { state: GameState }) {
  const startMatch = useGame((s) => s.startMatch);
  const club = state.teams[state.clubId];

  const fixture = state.fixtures.find(
    (f) => f.round === state.round && (f.homeId === state.clubId || f.awayId === state.clubId),
  );

  if (!fixture) {
    return <div className="empty">예정된 경기가 없습니다.</div>;
  }

  const isHome = fixture.homeId === state.clubId;
  const opponent = state.teams[isHome ? fixture.awayId : fixture.homeId];
  const table = buildTable(state.fixtures, Object.keys(state.teams));

  const ourStrength = teamStrength(club);
  const theirStrength = teamStrength(opponent);
  // Home advantage folded in so the odds match what the engine will do.
  const ourEdge = ourStrength.overall * (isHome ? 1.045 : 1);
  const winShare = Math.round((ourEdge / (ourEdge + theirStrength.overall)) * 100);

  const unavailable = club.players.filter((p) => p.injuredFor > 0);
  const tired = club.lineup
    .map((id) => club.players.find((p) => p.id === id))
    .filter((p) => p && p.fitness < 70);

  return (
    <>
      <Card title={`${state.round + 1}라운드`} padded>
        <div className="scoreboard__row" style={{ marginBottom: 10 }}>
          <TeamBadge team={isHome ? club : opponent} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-dim)' }}>VS</div>
            <div className="tiny faint">{isHome ? '홈' : '원정'}</div>
          </div>
          <TeamBadge team={isHome ? opponent : club} />
        </div>

        <div className="kv">
          <span className="kv__key">상대 순위</span>
          <span className="kv__value">
            {positionOf(table, opponent.id)}위 · 전력 {Math.round(theirStrength.overall)}
          </span>
        </div>
        <div className="kv">
          <span className="kv__key">상대 최근 5경기</span>
          <span className="kv__value">
            <span className="form-dots">
              {recentForm(state.fixtures, opponent.id).map((result, i) => (
                <span key={i} className={`form-dot form-dot--${result}`}>
                  {result}
                </span>
              ))}
              {recentForm(state.fixtures, opponent.id).length === 0 && (
                <span className="tiny faint">기록 없음</span>
              )}
            </span>
          </span>
        </div>
        <div className="kv">
          <span className="kv__key">예상 승률</span>
          <span className="kv__value" style={{ color: gaugeColor(winShare) }}>
            {winShare}%
          </span>
        </div>
        <div className="kv">
          <span className="kv__key">우리 전술</span>
          <span className="kv__value">
            {club.formation} · {MENTALITY_LABEL[club.tactics.mentality]}
          </span>
        </div>
      </Card>

      {(unavailable.length > 0 || tired.length > 0) && (
        <Card title="팀 리포트" padded>
          {unavailable.length > 0 && (
            <div style={{ marginBottom: tired.length ? 10 : 0 }}>
              <div className="field__label" style={{ color: 'var(--bad)' }}>
                결장
              </div>
              {unavailable.map((p) => (
                <div key={p.id} className="tiny muted">
                  {ROLE_LABEL[p.role]} {p.name} — {p.injuredFor}경기
                </div>
              ))}
            </div>
          )}
          {tired.length > 0 && (
            <div>
              <div className="field__label" style={{ color: 'var(--warn)' }}>
                체력 저하
              </div>
              {tired.map((p) => (
                <div key={p!.id} className="tiny muted">
                  {ROLE_LABEL[p!.role]} {p!.name} — 체력 {Math.round(p!.fitness)}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <button type="button" className="btn btn--primary btn--block" onClick={startMatch}>
        경기 시작
      </button>
    </>
  );
}

function TeamBadge({ team }: { team: Team }) {
  return (
    <div className="scoreboard__team">
      <div
        className="scoreboard__badge"
        style={{ background: team.color, color: team.accent }}
      >
        {team.shortName}
      </div>
      <div className="scoreboard__name">{team.name}</div>
    </div>
  );
}

/* --------------------------------------------------------------------- live */

function LiveView({ state, live }: { state: GameState; live: LiveMatch }) {
  const tickMatch = useGame((s) => s.tickMatch);
  const concludeMatch = useGame((s) => s.concludeMatch);
  const [speed, setSpeed] = useState<number>(700);
  const [showSubs, setShowSubs] = useState(false);
  const [showTactics, setShowTactics] = useState(false);

  const home = state.teams[live.homeId];
  const away = state.teams[live.awayId];
  const club = state.teams[state.clubId];
  const isHome = state.clubId === live.homeId;

  // The 2D view re-renders us whenever it reveals an event or goes idle.
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [director] = useState(() => new MatchDirector(matchKits(home, away), () => bump()));
  const startedRef = useRef(false);
  useLayoutEffect(() => {
    director.setKits(matchKits(home, away));
    director.syncRoster('home', rosterInput(home, live.homeOnPitch, live.homeParticipants, live.sentOff));
    director.syncRoster('away', rosterInput(away, live.awayOnPitch, live.awayParticipants, live.sentOff));
    if (!startedRef.current) {
      startedRef.current = true;
      director.start(live.events, live.minute);
    }
    director.setPossession(live.homeStats.possession / 100);
    director.feed(live.events);
  });

  useEffect(() => {
    director.setTimeScale(TIME_SCALE[speed] ?? 1);
  }, [director, speed]);

  // Drive the clock, but hold it while a highlight is playing out so the
  // engine never runs ahead of what is on screen.
  const tickRef = useRef(tickMatch);
  tickRef.current = tickMatch;
  useEffect(() => {
    if (speed === 0 || live.finished) return;
    const id = window.setInterval(() => {
      if (!director.busy) tickRef.current();
    }, speed);
    return () => window.clearInterval(id);
  }, [director, speed, live.finished]);

  const skipToEnd = () => {
    // Run the remaining minutes synchronously rather than waiting on timers.
    const remaining = MATCH_LENGTH - live.minute;
    for (let i = 0; i < remaining; i++) tickRef.current();
    // The engine mutates this log in place, so it already holds every event.
    director.skipAll(live.events);
  };

  const shown = director.shownScore;
  const revealed = director.revealed;
  const ended = live.finished && !director.busy && revealed >= live.events.length;

  // Newest first, and only what has been shown on the pitch — the log itself
  // runs a highlight ahead. Deliberately not memoised: the engine pushes into
  // this same array in place, so its identity never changes.
  const feed = live.events.slice(0, revealed).reverse();

  return (
    <div className="match-layout">
      <div className="match-layout__main">
        <div className="scoreboard">
          <div className="scoreboard__row">
            <TeamBadge team={home} />
            <div style={{ textAlign: 'center' }}>
              <div className="scoreboard__score">
                {shown.home} - {shown.away}
              </div>
            </div>
            <TeamBadge team={away} />
          </div>
          <div className="scoreboard__clock">{ended ? '경기 종료' : `${live.minute}'`}</div>
          <div className="clock-bar">
            <div
              className="clock-bar__fill"
              style={{ width: `${Math.min(100, (live.minute / MATCH_LENGTH) * 100)}%` }}
            />
          </div>
        </div>

        <MatchView
          director={director}
          home={home}
          away={away}
          score={shown}
          clock={ended ? '종료' : `${live.minute}'`}
        />

        {ended ? (
          <button
            type="button"
            className="btn btn--primary btn--block"
            style={{ marginBottom: 12 }}
            onClick={concludeMatch}
          >
            계속하기
          </button>
        ) : (
          <>
            <div className="controls">
              <div className="seg" style={{ flex: 1 }}>
                {SPEEDS.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    className={`seg__item${speed === option.value ? ' seg__item--active' : ''}`}
                    onClick={() => setSpeed(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn"
                style={{ padding: '10px 12px' }}
                title="경기 끝까지 건너뛰기"
                onClick={skipToEnd}
              >
                ⏭
              </button>
            </div>

            {!live.finished && (
              <div className="row" style={{ gap: 8, marginBottom: 12 }}>
                <button
                  type="button"
                  className="btn"
                  style={{ flex: 1 }}
                  onClick={() => {
                    setSpeed(0);
                    setShowSubs(true);
                  }}
                >
                  교체 ({isHome ? live.homeSubsLeft : live.awaySubsLeft})
                </button>
                <button
                  type="button"
                  className="btn"
                  style={{ flex: 1 }}
                  onClick={() => {
                    setSpeed(0);
                    setShowTactics(true);
                  }}
                >
                  전술 변경
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="match-layout__side">
        <Card title="경기 기록" padded>
          <StatRow label="점유율" home={live.homeStats.possession} away={live.awayStats.possession} suffix="%" homeColor={home.color} awayColor={away.color} />
          <StatRow label="슈팅" home={live.homeStats.shots} away={live.awayStats.shots} homeColor={home.color} awayColor={away.color} />
          <StatRow label="유효 슈팅" home={live.homeStats.onTarget} away={live.awayStats.onTarget} homeColor={home.color} awayColor={away.color} />
          <StatRow label="코너킥" home={live.homeStats.corners} away={live.awayStats.corners} homeColor={home.color} awayColor={away.color} />
          <StatRow label="파울" home={live.homeStats.fouls} away={live.awayStats.fouls} homeColor={home.color} awayColor={away.color} />
        </Card>

        {ended && (
          <Card title="선수 평점">
            {(isHome ? live.homeParticipants : live.awayParticipants).map((id) => {
              const player = club.players.find((p) => p.id === id);
              if (!player) return null;
              return (
                <PlayerRow
                  key={id}
                  player={player}
                  rating={live.ratings[id]}
                  goals={live.scorers[id]}
                />
              );
            })}
          </Card>
        )}

        <Card title="중계">
          <div className="commentary">
            {feed.length === 0 && <div className="empty">킥오프를 기다리는 중…</div>}
            {feed.map((event, index) => (
              <div key={`${event.minute}-${index}`} className={`comm comm--${event.kind}`}>
                <span className="comm__min">{event.minute}'</span>
                <span className="comm__text">{event.text}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {showSubs && <SubModal state={state} live={live} onClose={() => setShowSubs(false)} />}
      {showTactics && <InMatchTactics state={state} onClose={() => setShowTactics(false)} />}
    </div>
  );
}

/** Shirt numbers: starters 1-11 in slot order (so the keeper wears 1), bench from 12. */
function rosterInput(team: Team, onPitch: string[], participants: string[], sentOff: string[]): RosterInput {
  const starters = participants.slice(0, 11);
  const layout = FORMATIONS[team.formation].layout;
  return {
    layout,
    sentOff,
    entries: onPitch.flatMap((id) => {
      const player = team.players.find((p) => p.id === id);
      if (!player) return [];
      const slot = starters.indexOf(id);
      const bench = team.bench.indexOf(id);
      return [
        {
          id,
          name: player.name,
          number: slot >= 0 ? slot + 1 : 12 + Math.max(0, bench),
          isKeeper: slot === 0 || (slot < 0 && player.role === 'GK'),
          slotHint: slot >= 0 ? slot : undefined,
        },
      ];
    }),
  };
}

function StatRow({
  label,
  home,
  away,
  suffix = '',
  homeColor,
  awayColor,
}: {
  label: string;
  home: number;
  away: number;
  suffix?: string;
  homeColor: string;
  awayColor: string;
}) {
  const total = home + away;
  const homePct = total === 0 ? 50 : (home / total) * 100;
  return (
    <div>
      <div className="stat-line__label">{label}</div>
      <div className="stat-line">
        <span style={{ textAlign: 'center', fontWeight: 700 }}>
          {home}
          {suffix}
        </span>
        <span className="stat-line__track">
          <span className="stat-line__home" style={{ width: `${homePct}%`, background: homeColor }} />
          <span
            className="stat-line__away"
            style={{ width: `${100 - homePct}%`, background: awayColor }}
          />
        </span>
        <span style={{ textAlign: 'center', fontWeight: 700 }}>
          {away}
          {suffix}
        </span>
      </div>
    </div>
  );
}

function SubModal({
  state,
  live,
  onClose,
}: {
  state: GameState;
  live: LiveMatch;
  onClose: () => void;
}) {
  const substitute = useGame((s) => s.substitute);
  const [outgoing, setOutgoing] = useState<string | null>(null);

  const club = state.teams[state.clubId];
  const isHome = state.clubId === live.homeId;
  const onPitch = isHome ? live.homeOnPitch : live.awayOnPitch;
  const subsLeft = isHome ? live.homeSubsLeft : live.awaySubsLeft;
  const slots = FORMATIONS[club.formation].slots;

  const available = club.bench.filter((id) => !onPitch.includes(id));

  return (
    <Modal title={`교체 — 남은 횟수 ${subsLeft}`} onClose={onClose}>
      <div className="field__label">나갈 선수</div>
      <div className="card" style={{ marginBottom: 14 }}>
        {onPitch.map((id) => {
          const player = club.players.find((p) => p.id === id);
          if (!player) return null;
          const slotIndex = club.lineup.indexOf(id);
          return (
            <PlayerRow
              key={id}
              player={player}
              slot={slotIndex >= 0 ? slots[slotIndex] : undefined}
              rating={live.ratings[id]}
              selected={outgoing === id}
              onClick={() => setOutgoing(outgoing === id ? null : id)}
            />
          );
        })}
      </div>

      <div className="field__label">들어갈 선수</div>
      <div className="card">
        {available.length === 0 && <div className="empty">교체 투입 가능한 선수가 없습니다.</div>}
        {available.map((id) => {
          const player = club.players.find((p) => p.id === id);
          if (!player) return null;
          return (
            <PlayerRow
              key={id}
              player={player}
              onClick={
                outgoing && subsLeft > 0
                  ? () => {
                      if (substitute(outgoing, id)) onClose();
                    }
                  : undefined
              }
            />
          );
        })}
      </div>

      {!outgoing && (
        <p className="tiny faint" style={{ textAlign: 'center' }}>
          먼저 나갈 선수를 선택하세요.
        </p>
      )}
    </Modal>
  );
}

function InMatchTactics({ state, onClose }: { state: GameState; onClose: () => void }) {
  const setTactics = useGame((s) => s.setTactics);
  const club = state.teams[state.clubId];

  return (
    <Modal title="전술 변경" onClose={onClose}>
      <Field label="팀 성향">
        <Segmented<Mentality>
          value={club.tactics.mentality}
          onChange={(mentality) => setTactics({ mentality })}
          options={(Object.keys(MENTALITY_LABEL) as Mentality[]).map((value) => ({
            value,
            label: MENTALITY_LABEL[value],
          }))}
        />
      </Field>
      <Field label="템포">
        <Segmented
          value={club.tactics.tempo}
          onChange={(tempo) => setTactics({ tempo })}
          options={[
            { value: 'slow' as const, label: '느리게' },
            { value: 'normal' as const, label: '보통' },
            { value: 'high' as const, label: '빠르게' },
          ]}
        />
      </Field>
      <Field label="압박 강도">
        <Segmented
          value={club.tactics.pressing}
          onChange={(pressing) => setTactics({ pressing })}
          options={[
            { value: 'low' as const, label: '낮게' },
            { value: 'medium' as const, label: '중간' },
            { value: 'high' as const, label: '강하게' },
          ]}
        />
      </Field>
      <p className="tiny faint">변경한 전술은 다음 분부터 즉시 반영됩니다.</p>
    </Modal>
  );
}

/* -------------------------------------------------------------- season over */

function SeasonOver({ state }: { state: GameState }) {
  const nextSeason = useGame((s) => s.nextSeason);
  const table = buildTable(state.fixtures, Object.keys(state.teams));
  const position = positionOf(table, state.clubId);
  const row = table.find((r) => r.teamId === state.clubId)!;
  const club = state.teams[state.clubId];
  const champion = state.teams[table[0].teamId];

  const topScorer = club.players.reduce(
    (best, p) => (p.season.goals > (best?.season.goals ?? -1) ? p : best),
    club.players[0],
  );

  return (
    <>
      <Card title={`${state.season}시즌 종료`} padded>
        <div style={{ textAlign: 'center', padding: '10px 0 16px' }}>
          <div style={{ fontSize: 48, fontWeight: 900, lineHeight: 1, color: gaugeColor(100 - position * 5) }}>
            {position}위
          </div>
          <div className="muted" style={{ marginTop: 4 }}>
            {row.won}승 {row.drawn}무 {row.lost}패 · 승점 {row.points}
          </div>
        </div>

        <div className="kv">
          <span className="kv__key">우승</span>
          <span className="kv__value">{champion.name}</span>
        </div>
        <div className="kv">
          <span className="kv__key">득실</span>
          <span className="kv__value">
            {row.goalsFor} : {row.goalsAgainst}
          </span>
        </div>
        <div className="kv">
          <span className="kv__key">팀 내 득점왕</span>
          <span className="kv__value">
            {topScorer?.name} ({topScorer?.season.goals}골)
          </span>
        </div>
        <div className="kv">
          <span className="kv__key">이사회 목표</span>
          <span className="kv__value" style={{ color: position <= club.expectation ? 'var(--accent)' : 'var(--bad)' }}>
            {club.expectation}위 — {position <= club.expectation ? '달성' : '미달'}
          </span>
        </div>
      </Card>

      <button type="button" className="btn btn--primary btn--block" onClick={nextSeason}>
        다음 시즌 시작
      </button>
      <p className="tiny faint" style={{ textAlign: 'center', marginTop: 10 }}>
        선수들은 한 살씩 나이를 먹고, 유망주는 성장하며 노장은 기량이 떨어집니다. 총 {totalRounds(state.fixtures)}라운드의
        새 일정이 만들어집니다.
      </p>
    </>
  );
}

export type { MatchStats };
