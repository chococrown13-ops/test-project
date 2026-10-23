import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { formatDate } from '../../game/calendar';
import { buildTable, competitionName, positionOf, recentForm } from '../../game/competition';
import {
  REACTION_LABEL,
  SHOUT_COOLDOWN,
  SHOUT_LABEL,
  TALK_LABEL,
  applyPress,
  pressConference,
  shout,
  teamTalk,
  type PressQuestion,
  type Shout,
  type TalkResult,
  type TalkTone,
} from '../../game/dynamics';
import {
  aiManage,
  applyTacticChange,
  expectedLength,
  onPitch,
  playerOfMatch,
  possession,
  simulateMinute,
  substitute,
  type LiveMatch,
  type Side,
  type TeamState,
} from '../../game/engine/match';
import { FORMATIONS, FORMATION_IDS, pairSlots, type FormationId } from '../../game/formations';
import { ROLE_BY_ID } from '../../game/roles';
import { MENTALITIES, MENTALITY_LABEL, changeIpFormation, changeOopFormation, lineupIssues } from '../../game/tactics';
import type { Club, GameState, MatchEvent, Tactic } from '../../game/types';
import { rngFor, useGame, useStore } from '../../store';
import { Card, Crest, FormDots, Kv, Meter, Seg, Sheet, ratingColor } from '../kit';
import { MatchDirector, type RosterInput } from '../match2d/director';
import { matchKits } from '../match2d/MatchPitch';
import { MatchView } from '../match3d/MatchView';
import { TacticsScreen } from './TacticsScreen';

export function MatchFlow() {
  const stage = useStore((s) => s.matchStage);
  const live = useStore((s) => s.live);
  if (stage === 'live' && live) return <LiveScreen key={live.fixtureId} live={live} />;
  if (stage === 'post' && live) return <PostMatch live={live} />;
  return <PreMatch />;
}

/* ------------------------------------------------------------------ pre-match */

const TONES: TalkTone[] = ['encourage', 'faith', 'calm', 'demand', 'praise', 'angry'];

function PreMatch() {
  const state = useGame();
  const close = () => useStore.setState({ matchStage: null });
  const kickOff = useStore((s) => s.kickOff);
  const mutate = useStore((s) => s.mutate);
  const [tactics, setTactics] = useState(false);
  const [press, setPress] = useState<PressQuestion[] | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [tone, setTone] = useState<TalkTone | null>(null);

  const fixture = state.fixtures.find((f) => f.id === state.matchPending);
  if (!fixture) return null;
  const club = state.clubs[state.clubId];
  const isHome = fixture.homeId === club.id;
  const opp = state.clubs[isHome ? fixture.awayId : fixture.homeId];
  const issues = lineupIssues(club, state.players);
  const pressDue = state.day - state.lastPress >= 10;
  const oppTable = buildTable(state, opp.division);

  const start = () => {
    kickOff();
    const live = useStore.getState().live;
    if (live && tone) {
      mutate((s, rng) => {
        teamTalk(s, live, isHome ? 'home' : 'away', tone, 'pre', rng);
      });
    }
  };

  return (
    <div className="match-screen">
      <div className="match-top">
        <button type="button" className="top__back" onClick={close} aria-label="닫기">
          ‹
        </button>
        <div className="top__titles">
          <div className="top__title">{competitionName(state, fixture)}</div>
          <div className="top__sub">{formatDate(fixture.day)} · {isHome ? club.stadium : opp.stadium}</div>
        </div>
      </div>
      <div className="match-screen__scroll">
        <div className="hero">
          <div className="hero__vs">
            <div className="hero__team">
              <Crest club={isHome ? club : opp} size={52} />
              {(isHome ? club : opp).name}
            </div>
            <div className="hero__mid">VS</div>
            <div className="hero__team">
              <Crest club={isHome ? opp : club} size={52} />
              {(isHome ? opp : club).name}
            </div>
          </div>
        </div>

        <Card title="상대 분석" padded>
          <Kv k="리그 순위" v={`${state.leagueNames[opp.division]} ${positionOf(oppTable, opp.id)}위`} />
          <Kv k="최근 5경기" v={<FormDots form={recentForm(state, opp.id)} />} />
          <Kv k="예상 전술" v={`공격 ${opp.tactic.ipFormation} · 수비 ${opp.tactic.oopFormation}`} />
          <Kv k="성향" v={MENTALITY_LABEL[opp.tactic.mentality]} />
          <Kv k="압박" v={opp.tactic.oop.engagement === 'high' ? '높은 압박' : opp.tactic.oop.engagement === 'low' ? '내려앉음' : '중간 블록'} />
        </Card>

        <Card title="우리 팀" padded>
          <Kv k="전술" v={`공격 ${club.tactic.ipFormation} · 수비 ${club.tactic.oopFormation}`} />
          <Kv k="전술 이해도" v={`${Math.round(club.tactic.familiarity)}%`} />
          {issues.length > 0 ? (
            <p className="small warn">{issues.join(' · ')} — 킥오프 때 코치가 자동으로 채웁니다.</p>
          ) : (
            <p className="small good" style={{ marginBottom: 0 }}>선발 명단 준비 완료</p>
          )}
          <button type="button" className="btn btn--block" style={{ marginTop: 10 }} onClick={() => setTactics(true)}>
            전술·선발 수정
          </button>
        </Card>

        {pressDue && !press && (
          <button
            type="button"
            className="btn btn--block"
            style={{ marginBottom: 12 }}
            onClick={() => {
              setPress(pressConference(state, opp.id, rngFor(state)));
              setAnswers([]);
            }}
          >
            🎤 경기 전 기자회견 참석
          </button>
        )}

        <Card title="경기 전 팀 토크" padded>
          <div className="grid2">
            {TONES.map((t) => (
              <button key={t} type="button" className={`chip${tone === t ? ' chip--on' : ''}`} onClick={() => setTone(tone === t ? null : t)}>
                {TALK_LABEL[t]}
              </button>
            ))}
          </div>
          <p className="tiny muted" style={{ marginBottom: 0 }}>상황(상대 전력·경기 중요도)과 선수 성격에 따라 반응이 다릅니다. 선택하지 않으면 생략합니다.</p>
        </Card>

        <button type="button" className="btn btn--blue btn--block" onClick={start}>
          킥오프 ▶
        </button>
      </div>

      {tactics && (
        <Sheet title="전술·선발" onClose={() => setTactics(false)}>
          <TacticsScreen compact />
        </Sheet>
      )}
      {press && (
        <Sheet title="기자회견" onClose={() => setPress(null)}>
          {press.map((q, qi) => (
            <div key={qi} className="field">
              <div className="small" style={{ fontWeight: 800, marginBottom: 6 }}>Q. {q.question}</div>
              {q.answers.map((a, ai) => (
                <button key={ai} type="button" className={`chip${answers[qi] === ai ? ' chip--on' : ''}`} style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 6, borderRadius: 10, whiteSpace: 'normal' }} onClick={() => setAnswers((prev) => Object.assign([...prev], { [qi]: ai }))}>
                  {a.text}
                </button>
              ))}
            </div>
          ))}
          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={answers.filter((a) => a !== undefined).length < press.length}
            onClick={() => {
              mutate((s) => {
                applyPress(
                  s,
                  press.map((q, i) => q.answers[answers[i]]),
                );
                s.lastPress = s.day;
              });
              setPress(null);
            }}
          >
            답변 완료
          </button>
        </Sheet>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------- live */

const SPEEDS = [
  { label: '⏸', ms: 0, scale: 0 },
  { label: '1x', ms: 650, scale: 1 },
  { label: '2x', ms: 300, scale: 1.8 },
  { label: '4x', ms: 110, scale: 3.2 },
];

function rosterInput(state: GameState, team: TeamState): RosterInput {
  const club = state.clubs[team.clubId];
  const tactic = club.tactic;
  const ip = FORMATIONS[tactic.ipFormation];
  const oop = FORMATIONS[tactic.oopFormation];
  const benchOrder = team.players.filter((mp) => mp.cameOn !== 0).map((mp) => mp.id);
  return {
    layout: ip.map((s) => ({ x: s.x, y: s.y })),
    oopLayout: ip.map((_, i) => ({ x: oop[tactic.oopOf[i]].x, y: oop[tactic.oopOf[i]].y })),
    sentOff: team.players.filter((mp) => mp.red).map((mp) => mp.id),
    entries: onPitch(team).map((mp) => ({
      id: mp.id,
      name: mp.name,
      number: mp.cameOn === 0 ? mp.slot + 1 : 12 + Math.max(0, benchOrder.indexOf(mp.id)),
      isKeeper: mp.ipPos === 'GK',
      slotHint: mp.slot >= 0 ? mp.slot : undefined,
    })),
  };
}

/** FM26 dynamic highlights: show more of big, tight games and less of one-sided ones. */
function highlightFilter(mode: GameState['settings']['highlights'], live: LiveMatch): ((e: MatchEvent) => boolean) | null {
  if (mode === 'all') return null;
  return (e) => {
    if (e.kind === 'goal' || e.kind === 'red' || e.chance === 'penalty') return true;
    const margin = Math.abs(e.homeGoals - e.awayGoals);
    const xg = e.xg ?? 0;
    if (mode === 'key') return xg >= 0.3;
    switch (e.kind) {
      case 'chance':
      case 'save':
      case 'miss':
        return margin >= 3 ? false : xg >= (margin === 2 ? 0.22 : 0.06 + (1 - live.importance) * 0.06);
      case 'yellow':
        return margin <= 1 && live.importance >= 0.6;
      case 'injury':
        return true;
      case 'corner':
        return margin <= 1 && live.importance >= 0.6;
      default:
        return false;
    }
  };
}

function LiveScreen({ live }: { live: LiveMatch }) {
  const state = useGame();
  const liveChanged = useStore((s) => s.liveChanged);
  const finishMatch = useStore((s) => s.finishMatch);
  const [speed, setSpeed] = useState(1);
  const [tab, setTab] = useState<'feed' | 'stats' | 'ratings'>('feed');
  const [sheet, setSheet] = useState<'subs' | 'tactics' | 'shout' | 'halftime' | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [assistant, setAssistant] = useState(false);
  const halftimeShown = useRef(false);

  const side: Side = live.homeId === state.clubId ? 'home' : 'away';
  const ours = side === 'home' ? live.home : live.away;
  const home = state.clubs[live.homeId];
  const away = state.clubs[live.awayId];
  const ctx = { players: state.players, clubs: state.clubs };

  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [director] = useState(() => new MatchDirector(matchKits(home, away), () => bump()));
  const started = useRef(false);
  useLayoutEffect(() => {
    director.setKits(matchKits(home, away));
    director.syncRoster('home', rosterInput(state, live.home));
    director.syncRoster('away', rosterInput(state, live.away));
    if (!started.current) {
      started.current = true;
      director.start(live.events, live.minute);
    }
    const p = possession(live);
    director.setPossession(p.home / 100);
    director.setHighlightFilter(highlightFilter(state.settings.highlights, live));
    director.feed(live.events);
  });

  useEffect(() => director.setTimeScale(SPEEDS[speed].scale), [director, speed]);

  // The clock: one minute per tick, held while a highlight plays.
  const tick = useRef<() => void>(() => {});
  tick.current = () => {
    if (live.finished) return;
    const rng = rngFor(state);
    simulateMinute(live, ctx, rng);
    aiManage(live, ctx, side === 'home' ? 'away' : 'home', rng);
    if (assistant) aiManage(live, ctx, side, rng);
    liveChanged();
  };
  useEffect(() => {
    const ms = SPEEDS[speed].ms;
    if (ms === 0 || live.finished) return;
    const id = window.setInterval(() => {
      if (!director.busy) tick.current();
    }, ms);
    return () => window.clearInterval(id);
  }, [director, speed, live.finished]);

  useEffect(() => {
    ours.ai = assistant;
  }, [assistant, ours]);

  const revealed = director.revealed;
  const shown = director.shownScore;
  const feed = live.events.slice(0, revealed).reverse();
  const ended = live.finished && !director.busy && revealed >= live.events.length;

  // Half-time team talk, once, when the whistle has been shown.
  const htIndex = live.events.findIndex((e) => e.kind === 'halftime');
  useEffect(() => {
    if (htIndex >= 0 && revealed > htIndex && !halftimeShown.current) {
      halftimeShown.current = true;
      setSpeed(0);
      setSheet('halftime');
    }
  }, [htIndex, revealed]);

  const skip = () => {
    let guard = 0;
    while (!live.finished && guard++ < 200) {
      const rng = rngFor(state);
      simulateMinute(live, ctx, rng);
      aiManage(live, ctx, side === 'home' ? 'away' : 'home', rng);
      aiManage(live, ctx, side, rng);
    }
    director.skipAll(live.events);
    halftimeShown.current = true;
    liveChanged();
  };

  const length = expectedLength(live);
  const clock = ended ? '종료' : live.minute > 90 ? `90+${live.minute - 90}'` : `${live.minute}'`;
  const pos = possession(live);

  return (
    <div className="match-screen">
      <div className="match-top">
        <div className="top__titles">
          <div className="top__title">
            {home.short} {shown.home} - {shown.away} {away.short}
          </div>
          <div className="top__sub">{ended ? '경기 종료' : `${clock} · ${home.name} vs ${away.name}`}</div>
        </div>
        <button type="button" className={`chip chip--small${assistant ? ' chip--on' : ''}`} onClick={() => setAssistant(!assistant)}>
          코치 자동 교체
        </button>
      </div>
      <div className="match-screen__scroll">
        <MatchView director={director} home={home} away={away} score={shown} clock={clock} />
        <div style={{ height: 4, background: 'var(--raised)', borderRadius: 2, marginBottom: 10 }}>
          <div style={{ height: '100%', width: `${Math.min(100, (live.minute / length) * 100)}%`, background: 'var(--accent)', borderRadius: 2 }} />
        </div>

        {toast && <div className="card card__body small">{toast}</div>}

        {ended ? (
          <button type="button" className="btn btn--primary btn--block" style={{ marginBottom: 12 }} onClick={finishMatch}>
            경기 결과 보기
          </button>
        ) : (
          <>
            <div className="speed-row">
              <div className="seg" style={{ flex: 1 }}>
                {SPEEDS.map((s, i) => (
                  <button key={s.label} type="button" className={`seg__item${speed === i ? ' seg__item--on' : ''}`} onClick={() => setSpeed(i)}>
                    {s.label}
                  </button>
                ))}
              </div>
              <button type="button" className="btn btn--sm" onClick={skip} title="경기 끝까지 건너뛰기">
                ⏭
              </button>
            </div>
            <div className="grid2" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginBottom: 12 }}>
              <button type="button" className="btn btn--sm" onClick={() => { setSpeed(0); setSheet('subs'); }}>
                교체 ({ours.subsLeft})
              </button>
              <button type="button" className="btn btn--sm" onClick={() => { setSpeed(0); setSheet('tactics'); }}>
                전술
              </button>
              <button type="button" className="btn btn--sm" onClick={() => setSheet('shout')}>
                외침
              </button>
            </div>
          </>
        )}

        <div style={{ marginBottom: 10 }}>
          <Seg value={tab} onChange={setTab} options={[{ value: 'feed', label: '중계' }, { value: 'stats', label: '기록' }, { value: 'ratings', label: '평점' }]} />
        </div>

        {tab === 'feed' && (
          <Card>
            {feed.length === 0 && <div className="empty">킥오프를 기다리는 중…</div>}
            {feed.map((e, i) => (
              <div key={`${e.minute}-${i}`} className={`comm comm--${e.kind}`}>
                {!['halftime', 'fulltime', 'kickoff', 'extratime', 'pens'].includes(e.kind) && <span className="comm__min">{e.minute}'</span>}
                <span className="comm__text">{e.text}</span>
              </div>
            ))}
          </Card>
        )}
        {tab === 'stats' && <MatchStats live={live} home={home} away={away} poss={pos} />}
        {tab === 'ratings' && <Ratings team={ours} />}
      </div>

      {sheet === 'subs' && <SubsSheet live={live} side={side} onClose={() => setSheet(null)} onDone={(msg) => setToast(msg)} />}
      {sheet === 'tactics' && <LiveTactics live={live} side={side} onClose={() => setSheet(null)} />}
      {sheet === 'shout' && (
        <Sheet title="외침 (터치라인 지시)" onClose={() => setSheet(null)}>
          <div className="grid2">
            {(Object.keys(SHOUT_LABEL) as Shout[]).map((s) => (
              <button
                key={s}
                type="button"
                className="btn"
                disabled={live.minute - ours.lastShout < SHOUT_COOLDOWN}
                onClick={() => {
                  let msg = '';
                  useStore.getState().mutate((st, rng) => {
                    msg = shout(st, live, side, s, rng);
                  }, false);
                  setToast(`${SHOUT_LABEL[s]}: ${msg}`);
                  setSheet(null);
                }}
              >
                {SHOUT_LABEL[s]}
              </button>
            ))}
          </div>
          <p className="tiny muted">외침은 {SHOUT_COOLDOWN}분마다 한 번 할 수 있습니다. 점수 상황에 맞지 않는 외침은 역효과가 납니다.</p>
        </Sheet>
      )}
      {sheet === 'halftime' && <TalkSheet live={live} side={side} stage="half" onClose={() => { setSheet(null); setSpeed(1); }} />}
    </div>
  );
}

function StatLine({ label, home, away, homeColor, awayColor, fmt = (v: number) => String(v) }: { label: string; home: number; away: number; homeColor: string; awayColor: string; fmt?: (v: number) => string }) {
  const total = home + away;
  const pct = total === 0 ? 50 : (home / total) * 100;
  return (
    <div>
      <div className="stat-line__label">{label}</div>
      <div className="stat-line">
        <b style={{ textAlign: 'center' }}>{fmt(home)}</b>
        <div className="stat-line__bar">
          <span style={{ width: `${pct}%`, background: homeColor }} />
          <span style={{ width: `${100 - pct}%`, background: awayColor }} />
        </div>
        <b style={{ textAlign: 'center' }}>{fmt(away)}</b>
      </div>
    </div>
  );
}

function luminance(hex: string): number {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

function MatchStats({ live, home, away, poss }: { live: LiveMatch; home: Club; away: Club; poss: { home: number; away: number } }) {
  const h = live.home.stats;
  const a = live.away.stats;
  // Same shirts as on the pitch (the away side may be in its change kit), lifted if too dark to see.
  const kits = matchKits(home, away);
  const visible = (c: string, alt: string) => (luminance(c) < 0.18 ? (luminance(alt) >= 0.18 ? alt : '#94a3b8') : c);
  const hc = visible(kits.home.fill, kits.home.trim);
  const ac = visible(kits.away.fill, kits.away.trim);
  return (
    <Card padded>
      <StatLine label="점유율 %" home={poss.home} away={poss.away} homeColor={hc} awayColor={ac} />
      <StatLine label="슈팅" home={h.shots} away={a.shots} homeColor={hc} awayColor={ac} />
      <StatLine label="유효 슈팅" home={h.onTarget} away={a.onTarget} homeColor={hc} awayColor={ac} />
      <StatLine label="기대 득점 (xG)" home={h.xg} away={a.xg} homeColor={hc} awayColor={ac} fmt={(v) => v.toFixed(2)} />
      <StatLine label="패스 성공률 %" home={h.passes ? Math.round((h.passesDone / h.passes) * 100) : 0} away={a.passes ? Math.round((a.passesDone / a.passes) * 100) : 0} homeColor={hc} awayColor={ac} />
      <StatLine label="코너킥" home={h.corners} away={a.corners} homeColor={hc} awayColor={ac} />
      <StatLine label="파울" home={h.fouls} away={a.fouls} homeColor={hc} awayColor={ac} />
      <StatLine label="오프사이드" home={h.offsides} away={a.offsides} homeColor={hc} awayColor={ac} />
      <StatLine label="경고" home={h.yellows} away={a.yellows} homeColor={hc} awayColor={ac} />
    </Card>
  );
}

function Ratings({ team }: { team: TeamState }) {
  const players = team.players.filter((mp) => mp.stats.minutes > 0 || mp.onPitch);
  return (
    <Card>
      {players.map((mp) => (
        <div key={mp.id} className="list-row" style={{ cursor: 'default' }}>
          <span className="list-row__main">
            <span className="list-row__title" style={{ display: 'block' }}>
              {mp.name}
              {mp.stats.goals > 0 && ` ${'⚽'.repeat(mp.stats.goals)}`}
              {mp.stats.assists > 0 && ' 🅰'}
              {mp.yellow > 0 && ' 🟨'}
              {mp.red && ' 🟥'}
              {mp.injured && ' ✚'}
              {!mp.onPitch && mp.wentOff !== null && <span className="faint"> (OUT {mp.wentOff}')</span>}
            </span>
            <span className="list-row__meta">
              {ROLE_BY_ID[mp.ipRole]?.name ?? ''} · 체력 <Meter value={mp.condition} width={40} />
            </span>
          </span>
          <b className="num" style={{ color: ratingColor(mp.rating) }}>{mp.rating.toFixed(1)}</b>
        </div>
      ))}
    </Card>
  );
}

function SubsSheet({ live, side, onClose, onDone }: { live: LiveMatch; side: Side; onClose: () => void; onDone: (msg: string) => void }) {
  const state = useGame();
  const liveChanged = useStore((s) => s.liveChanged);
  const [out, setOut] = useState<string | null>(null);
  const team = side === 'home' ? live.home : live.away;
  const ctx = { players: state.players, clubs: state.clubs };
  const field = onPitch(team);
  const bench = team.players.filter((mp) => !mp.onPitch && mp.cameOn === null && mp.wentOff === null && !mp.red);
  return (
    <Sheet title={`교체 — 남은 횟수 ${team.subsLeft}`} onClose={onClose}>
      <div className="field__label">{out ? '들어갈 선수' : '나갈 선수'}</div>
      <div className="card">
        {(out ? bench : field).map((mp) => {
          const p = state.players[mp.id];
          return (
            <button
              key={mp.id}
              type="button"
              className="list-row"
              disabled={team.subsLeft <= 0}
              onClick={() => {
                if (!out) {
                  setOut(mp.id);
                  return;
                }
                if (substitute(live, ctx, side, out, mp.id)) {
                  onDone(`${mp.name} 투입`);
                  liveChanged();
                  onClose();
                }
              }}
            >
              <span className="list-row__main">
                <span className="list-row__title" style={{ display: 'block' }}>{mp.name}</span>
                <span className="list-row__meta">
                  {out ? `${Object.keys(p.positions).join('/')}` : ROLE_BY_ID[mp.ipRole]?.name} · 체력 {Math.round(mp.condition)}%
                </span>
              </span>
              {!out && <b style={{ color: ratingColor(mp.rating) }}>{mp.rating.toFixed(1)}</b>}
            </button>
          );
        })}
        {out && bench.length === 0 && <div className="empty">교체할 선수가 없습니다.</div>}
      </div>
    </Sheet>
  );
}

function LiveTactics({ live, side, onClose }: { live: LiveMatch; side: Side; onClose: () => void }) {
  const state = useGame();
  const mutate = useStore((s) => s.mutate);
  const club = state.clubs[state.clubId];
  const tactic = club.tactic;
  const team = side === 'home' ? live.home : live.away;
  const ctx = { players: state.players, clubs: state.clubs };
  const apply = (fn: (t: Tactic) => void) =>
    mutate((s) => {
      fn(s.clubs[s.clubId].tactic);
      applyTacticChange(live, ctx, side);
    }, false);
  const changeShape = (phase: 'ip' | 'oop', f: FormationId) =>
    mutate((s) => {
      const t = s.clubs[s.clubId].tactic;
      if (phase === 'ip') {
        // Players keep the nearest slot in the new shape.
        const moved = pairSlots(FORMATIONS[t.ipFormation], FORMATIONS[f]);
        changeIpFormation(t, f);
        team.players.forEach((mp) => {
          if (mp.onPitch && mp.slot >= 0) mp.slot = moved[mp.slot];
        });
      } else {
        changeOopFormation(t, f);
      }
      applyTacticChange(live, ctx, side);
    }, false);
  return (
    <Sheet title="경기 중 전술 변경" onClose={onClose}>
      <div className="field">
        <div className="field__label">팀 성향</div>
        <div className="subtabs" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>
          {MENTALITIES.map((m) => (
            <button key={m} type="button" className={`chip chip--small${tactic.mentality === m ? ' chip--on' : ''}`} onClick={() => apply((t) => (t.mentality = m))}>
              {MENTALITY_LABEL[m]}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <div className="field__label">공격 형태 (현재 {tactic.ipFormation})</div>
        <div className="subtabs" style={{ margin: 0, padding: 0 }}>
          {FORMATION_IDS.map((f) => (
            <button key={f} type="button" className={`chip chip--small${tactic.ipFormation === f ? ' chip--on' : ''}`} onClick={() => changeShape('ip', f)}>
              {f}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <div className="field__label">수비 형태 (현재 {tactic.oopFormation})</div>
        <div className="subtabs" style={{ margin: 0, padding: 0 }}>
          {FORMATION_IDS.map((f) => (
            <button key={f} type="button" className={`chip chip--small${tactic.oopFormation === f ? ' chip--on' : ''}`} onClick={() => changeShape('oop', f)}>
              {f}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <div className="field__label">템포</div>
        <Seg value={tactic.ip.tempo} onChange={(v) => apply((t) => (t.ip.tempo = v))} options={[{ value: 'slow', label: '느리게' }, { value: 'normal', label: '보통' }, { value: 'fast', label: '빠르게' }]} />
      </div>
      <div className="field">
        <div className="field__label">압박 시작 위치</div>
        <Seg value={tactic.oop.engagement} onChange={(v) => apply((t) => (t.oop.engagement = v))} options={[{ value: 'low', label: '낮게' }, { value: 'mid', label: '중간' }, { value: 'high', label: '높게' }]} />
      </div>
      <div className="field">
        <div className="field__label">수비 라인</div>
        <Seg value={tactic.oop.line} onChange={(v) => apply((t) => (t.oop.line = v))} options={[{ value: 'deep', label: '깊게' }, { value: 'normal', label: '보통' }, { value: 'high', label: '높게' }]} />
      </div>
      <p className="tiny muted">변경 사항은 다음 분부터 바로 적용됩니다. 형태를 바꾸면 전술 이해도가 조금 떨어집니다.</p>
    </Sheet>
  );
}

function TalkSheet({ live, side, stage, onClose }: { live: LiveMatch; side: Side; stage: 'half' | 'full'; onClose: () => void }) {
  const mutate = useStore((s) => s.mutate);
  const [results, setResults] = useState<TalkResult[] | null>(null);
  const lead = side === 'home' ? live.homeGoals - live.awayGoals : live.awayGoals - live.homeGoals;
  return (
    <Sheet title={stage === 'half' ? `하프타임 팀 토크 (${live.homeGoals}-${live.awayGoals})` : '경기 후 팀 토크'} onClose={onClose}>
      {!results ? (
        <>
          <p className="small muted" style={{ marginTop: 0 }}>
            {lead > 0 ? '앞서고 있습니다.' : lead < 0 ? '뒤지고 있습니다.' : '비기고 있습니다.'} 선수들에게 어떤 말을 하겠습니까?
          </p>
          <div className="grid2">
            {TONES.map((t) => (
              <button
                key={t}
                type="button"
                className="btn"
                onClick={() => {
                  let r: TalkResult[] = [];
                  mutate((s, rng) => {
                    r = teamTalk(s, live, side, t, stage, rng);
                  }, stage === 'full');
                  setResults(r);
                }}
              >
                {TALK_LABEL[t]}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn--block" style={{ marginTop: 10 }} onClick={onClose}>
            아무 말 하지 않기
          </button>
        </>
      ) : (
        <>
          {results.map((r) => (
            <div key={r.playerId} className="reaction">
              <span>{r.name}</span>
              <b className={r.reaction === 'fired' || r.reaction === 'focused' ? 'good' : r.reaction === 'indifferent' ? 'muted' : 'bad'}>{REACTION_LABEL[r.reaction]}</b>
            </div>
          ))}
          <button type="button" className="btn btn--primary btn--block" style={{ marginTop: 12 }} onClick={onClose}>
            {stage === 'half' ? '후반전 시작' : '확인'}
          </button>
        </>
      )}
    </Sheet>
  );
}

/* ----------------------------------------------------------------------- post */

function PostMatch({ live }: { live: LiveMatch }) {
  const state = useGame();
  const close = useStore((s) => s.closeMatch);
  const [talk, setTalk] = useState(false);
  const side: Side = live.homeId === state.clubId ? 'home' : 'away';
  const home = state.clubs[live.homeId];
  const away = state.clubs[live.awayId];
  const pom = playerOfMatch(live);
  const ours = side === 'home' ? live.home : live.away;
  const goals = live.events.filter((e) => e.kind === 'goal');
  return (
    <div className="match-screen">
      <div className="match-screen__scroll" style={{ paddingTop: 'calc(12px + env(safe-area-inset-top))' }}>
        <div className="hero">
          <div className="hero__vs">
            <div className="hero__team">
              <Crest club={home} size={50} />
              {home.name}
            </div>
            <div className="scoreline__score">
              {live.homeGoals}-{live.awayGoals}
            </div>
            <div className="hero__team">
              <Crest club={away} size={50} />
              {away.name}
            </div>
          </div>
          {live.pens && <div className="small muted" style={{ textAlign: 'center' }}>승부차기 {live.pens.home}-{live.pens.away}</div>}
          <div className="grid2 small" style={{ marginTop: 8 }}>
            <div>{goals.filter((g) => g.side === 'home').map((g, i) => <div key={i}>⚽ {live.home.players.find((p) => p.id === g.playerId)?.name} {g.minute}'</div>)}</div>
            <div style={{ textAlign: 'right' }}>{goals.filter((g) => g.side === 'away').map((g, i) => <div key={i}>{live.away.players.find((p) => p.id === g.playerId)?.name} {g.minute}' ⚽</div>)}</div>
          </div>
        </div>
        {pom && (
          <Card padded>
            <div className="row">
              <span>⭐ 경기 최우수 선수</span>
              <span className="spacer" />
              <b>{pom.name}</b>
              <b style={{ color: ratingColor(pom.rating) }}>{pom.rating.toFixed(1)}</b>
            </div>
          </Card>
        )}
        <MatchStats live={live} home={home} away={away} poss={possession(live)} />
        <Ratings team={ours} />
        <div className="grid2" style={{ marginBottom: 12 }}>
          <button type="button" className="btn" onClick={() => setTalk(true)}>
            경기 후 팀 토크
          </button>
          <button type="button" className="btn btn--primary" onClick={close}>
            계속
          </button>
        </div>
      </div>
      {talk && <TalkSheet live={live} side={side} stage="full" onClose={() => setTalk(false)} />}
    </div>
  );
}
