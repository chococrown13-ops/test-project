import { useEffect, useState } from 'react';
import { isWindowOpen, seasonLabel, SEASON_WEEKS } from '../game/types';
import { formatMoney } from '../game/engine';
import { useGame } from '../store/useGame';
import StartScreen from './screens/StartScreen';
import HomeScreen from './screens/HomeScreen';
import ClientsScreen from './screens/ClientsScreen';
import ScoutScreen from './screens/ScoutScreen';
import DealsScreen from './screens/DealsScreen';
import WorldScreen from './screens/WorldScreen';
import { PlayerSheet } from './components/PlayerView';
import { ClubSheet } from './components/ClubSheet';
import { AgentSheet } from './components/AgentSheet';

const TABS = [
  { id: 'home', label: '홈', icon: '◎' },
  { id: 'clients', label: '의뢰인', icon: '☰' },
  { id: 'scout', label: '스카우트', icon: '⌕' },
  { id: 'deals', label: '협상', icon: '⇄' },
  { id: 'world', label: '세계', icon: '⊕' },
] as const;

export default function App() {
  const { game, tab, setTab, next, busy, toast, notify, playerSheet, clubSheet } = useGame();
  const [agentSheet, setAgentSheet] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => notify(null), 2600);
    return () => clearTimeout(timer);
  }, [toast, notify]);

  if (!game) {
    return (
      <div className="app">
        <div className="content content--start"><StartScreen /></div>
      </div>
    );
  }

  const clients = Object.keys(game.clients).length;
  const pending = Object.values(game.clients)
    .reduce((sum, client) => sum + client.demands.filter((d) => !d.resolution).length, 0);
  const agreed = game.negotiations.filter((n) => n.stage === 'agreed').length;
  const windowOpen = isWindowOpen(game.week);

  return (
    <div className="app">
      <header className="header">
        <button type="button" className="header__main" onClick={() => setAgentSheet(true)}>
          <span className="header__title">{game.agent.agencyName}</span>
          <span className="header__sub">
            {seasonLabel(game.season)} · {game.week}/{SEASON_WEEKS}주 · 의뢰인 {clients}명
          </span>
        </button>
        <div className="header__right">
          <span className="header__cash">{formatMoney(game.agent.cash)}</span>
          {windowOpen && <span className="pill pill--good">시장</span>}
        </div>
      </header>

      <div className="content">
        {tab === 'home' && <HomeScreen />}
        {tab === 'clients' && <ClientsScreen />}
        {tab === 'scout' && <ScoutScreen />}
        {tab === 'deals' && <DealsScreen />}
        {tab === 'world' && <WorldScreen />}
      </div>

      <button type="button" className="advance" onClick={next} disabled={busy}>
        {busy ? '진행 중…' : '다음 주로'}
      </button>

      <nav className="tabs">
        {TABS.map((item) => {
          const badge = item.id === 'clients' ? pending : item.id === 'deals' ? agreed : 0;
          return (
            <button
              key={item.id}
              type="button"
              className={`tab${tab === item.id ? ' tab--active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              <span className="tab__icon">{item.icon}</span>
              <span className="tab__label">{item.label}</span>
              {badge > 0 && <span className="tab__badge">{badge}</span>}
            </button>
          );
        })}
      </nav>

      {playerSheet && <PlayerSheet playerId={playerSheet} />}
      {clubSheet && <ClubSheet clubId={clubSheet} />}
      {agentSheet && <AgentSheet onClose={() => setAgentSheet(false)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
