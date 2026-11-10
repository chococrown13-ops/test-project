import { useEffect } from 'react';
import { buildTable, positionOf, totalRounds } from '../game/league';
import { useGame, type Screen } from '../store/useGame';
import { Crest } from './components/common';
import { ClubScreen } from './screens/ClubScreen';
import { HomeScreen } from './screens/HomeScreen';
import { LeagueScreen } from './screens/LeagueScreen';
import { MatchScreen } from './screens/MatchScreen';
import { SquadScreen } from './screens/SquadScreen';
import { StartScreen } from './screens/StartScreen';
import { TacticsScreen } from './screens/TacticsScreen';
import { TransferScreen } from './screens/TransferScreen';
import { useIsDesktop } from './useMedia';
import type { GameState } from '../game/types';

/** PC sidebar: the phone tabs plus a dashboard, FM-style. */
const NAV: { id: Screen; label: string; icon: string }[] = [
  { id: 'home', label: '홈', icon: '🏠' },
  { id: 'squad', label: '선수단', icon: '👥' },
  { id: 'tactics', label: '전술', icon: '📋' },
  { id: 'match', label: '경기', icon: '⚽' },
  { id: 'transfer', label: '이적시장', icon: '🔁' },
  { id: 'league', label: '리그', icon: '🏆' },
  { id: 'club', label: '구단', icon: '🏟' },
];

const TABS: { id: Screen; label: string; icon: string }[] = [
  { id: 'squad', label: '선수단', icon: '👥' },
  { id: 'tactics', label: '전술', icon: '📋' },
  { id: 'match', label: '경기', icon: '⚽' },
  { id: 'transfer', label: '이적', icon: '🔁' },
  { id: 'league', label: '리그', icon: '🏆' },
  { id: 'club', label: '구단', icon: '🏟' },
];

export function App() {
  const state = useGame((s) => s.state);
  const screen = useGame((s) => s.screen);
  const setScreen = useGame((s) => s.setScreen);
  const continueGame = useGame((s) => s.continueGame);
  const desktop = useIsDesktop();

  // Pick up an existing save on first mount.
  useEffect(() => {
    continueGame();
  }, [continueGame]);

  if (!state) {
    return (
      <div className={desktop ? 'app app--start-desk' : 'app'}>
        <div className="content">
          <StartScreen />
        </div>
      </div>
    );
  }

  if (desktop) return <DesktopShell state={state} screen={screen} />;

  const club = state.teams[state.clubId];
  const table = buildTable(state.fixtures, Object.keys(state.teams));
  const position = positionOf(table, state.clubId);
  const unread = state.inbox.filter((i) => !i.read).length;
  const offers = state.transfer.offers.length;

  return (
    <div className="app">
      <header className="header">
        <Crest team={club} />
        <div style={{ minWidth: 0 }}>
          <div className="header__title">{club.name}</div>
          <div className="header__sub">
            {state.season}시즌 · {Math.min(state.round + 1, totalRounds(state.fixtures))}R ·{' '}
            {position}위
          </div>
        </div>
        <div className="header__spacer" />
        {state.live && !state.live.finished && (
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: 'var(--accent)',
              border: '1px solid var(--accent)',
              borderRadius: 6,
              padding: '3px 7px',
            }}
          >
            LIVE {state.live.minute}'
          </div>
        )}
      </header>

      <main className="content">
        {screen === 'home' && <HomeScreen state={state} />}
        {screen === 'squad' && <SquadScreen state={state} />}
        {screen === 'tactics' && <TacticsScreen state={state} />}
        {screen === 'match' && <MatchScreen state={state} />}
        {screen === 'transfer' && <TransferScreen state={state} />}
        {screen === 'league' && <LeagueScreen state={state} />}
        {screen === 'club' && <ClubScreen state={state} />}
      </main>

      <nav className="tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab${screen === tab.id ? ' tab--active' : ''}`}
            onClick={() => setScreen(tab.id)}
          >
            <span className="tab__icon">{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.id === 'club' && unread > 0 && <span className="tab__badge">{unread}</span>}
            {tab.id === 'transfer' && offers > 0 && <span className="tab__badge">{offers}</span>}
          </button>
        ))}
      </nav>
    </div>
  );
}

const TITLES: Record<Screen, string> = {
  home: '홈',
  squad: '선수단',
  tactics: '전술',
  match: '경기',
  transfer: '이적시장',
  league: '리그',
  club: '구단',
};

/** The PC layout: sidebar navigation, a top bar with the "continue" button, wide content. */
function DesktopShell({ state, screen }: { state: GameState; screen: Screen }) {
  const setScreen = useGame((s) => s.setScreen);
  const startMatch = useGame((s) => s.startMatch);

  const club = state.teams[state.clubId];
  const table = buildTable(state.fixtures, Object.keys(state.teams));
  const position = positionOf(table, state.clubId);
  const rounds = totalRounds(state.fixtures);
  const unread = state.inbox.filter((i) => !i.read).length;
  const offers = state.transfer.offers.length;

  const next = state.fixtures.find(
    (f) => f.round === state.round && (f.homeId === state.clubId || f.awayId === state.clubId),
  );
  const opponent = next
    ? state.teams[next.homeId === state.clubId ? next.awayId : next.homeId]
    : null;

  // FM's big button: always the one thing that moves the game on.
  let cta = '계속';
  let onCta = () => setScreen('match');
  if (state.seasonOver) {
    cta = '시즌 결산';
  } else if (state.live) {
    cta = state.live.finished ? '경기 결과' : `경기 중 ${state.live.minute}'`;
  } else if (screen === 'match') {
    cta = '킥오프';
    onCta = startMatch;
  } else {
    cta = '경기 준비';
  }

  return (
    <div className="desk">
      <aside className="desk__side">
        <div className="desk__club">
          <Crest team={club} size={44} />
          <div style={{ minWidth: 0 }}>
            <div className="desk__club-name">{club.name}</div>
            <div className="desk__club-sub">
              {state.managerName && state.managerName !== '감독'
                ? `${state.managerName} 감독`
                : state.leagueName}
            </div>
          </div>
        </div>
        <nav className="desk__nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`desk__nav-item${screen === item.id ? ' desk__nav-item--active' : ''}`}
              onClick={() => setScreen(item.id)}
            >
              <span className="desk__nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.id === 'club' && unread > 0 && <span className="desk__badge">{unread}</span>}
              {item.id === 'transfer' && offers > 0 && (
                <span className="desk__badge">{offers}</span>
              )}
              {item.id === 'match' && state.live && !state.live.finished && (
                <span className="desk__live">LIVE</span>
              )}
            </button>
          ))}
        </nav>
        <div className="desk__foot">
          {state.leagueName}
          <br />
          {state.season}시즌 · {Math.min(state.round + 1, rounds)}/{rounds}R
        </div>
      </aside>

      <div className="desk__main">
        <header className="desk__top">
          <div>
            <div className="desk__title">{TITLES[screen]}</div>
            <div className="desk__crumb">
              {state.leagueName} · {position}위
              {opponent && !state.seasonOver && (
                <>
                  {' '}
                  · 다음 경기: {next!.homeId === state.clubId ? 'vs' : '@'} {opponent.name}
                </>
              )}
            </div>
          </div>
          <div className="header__spacer" />
          <button type="button" className="btn btn--primary desk__cta" onClick={onCta}>
            {cta} ▶
          </button>
        </header>

        <main className={`desk__content desk__content--${screen}`}>
          {screen === 'home' && <HomeScreen state={state} />}
          {screen === 'squad' && <SquadScreen state={state} />}
          {screen === 'tactics' && <TacticsScreen state={state} />}
          {screen === 'match' && <MatchScreen state={state} />}
          {screen === 'transfer' && <TransferScreen state={state} />}
          {screen === 'league' && <LeagueScreen state={state} />}
          {screen === 'club' && <ClubScreen state={state} />}
        </main>
      </div>
    </div>
  );
}
