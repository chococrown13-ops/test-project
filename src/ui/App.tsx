import { useEffect } from 'react';
import { buildTable, positionOf, totalRounds } from '../game/league';
import { useGame, type Screen } from '../store/useGame';
import { Crest } from './components/common';
import { ClubScreen } from './screens/ClubScreen';
import { LeagueScreen } from './screens/LeagueScreen';
import { MatchScreen } from './screens/MatchScreen';
import { SquadScreen } from './screens/SquadScreen';
import { StartScreen } from './screens/StartScreen';
import { TacticsScreen } from './screens/TacticsScreen';
import { TransferScreen } from './screens/TransferScreen';

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

  // Pick up an existing save on first mount.
  useEffect(() => {
    continueGame();
  }, [continueGame]);

  if (!state) {
    return (
      <div className="app">
        <div className="content">
          <StartScreen />
        </div>
      </div>
    );
  }

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
