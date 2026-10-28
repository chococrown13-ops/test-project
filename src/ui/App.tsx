import { useEffect } from 'react';
import { formatDate } from '../game/calendar';
import { useGame, useStore, type Tab } from '../store';
import { Icon } from './art';
import { Crest } from './kit';
import { ClubProfile } from './screens/ClubProfile';
import { ClubScreen } from './screens/ClubScreen';
import { CompsScreen } from './screens/CompsScreen';
import { HomeScreen, InboxDetail } from './screens/HomeScreen';
import { MatchFlow } from './screens/MatchFlow';
import { NegotiationScreen } from './screens/NegotiationScreen';
import { PlayerScreen } from './screens/PlayerScreen';
import { RecruitScreen } from './screens/RecruitScreen';
import { SackedScreen, SeasonReviewSheet } from './screens/SeasonScreens';
import { SquadScreen } from './screens/SquadScreen';
import { StartScreen } from './screens/StartScreen';
import { TacticsScreen } from './screens/TacticsScreen';
import { FixtureScreen } from './screens/FixtureScreen';

const TABS: { id: Tab; label: string }[] = [
  { id: 'home', label: '홈' },
  { id: 'squad', label: '선수단' },
  { id: 'tactics', label: '전술' },
  { id: 'recruit', label: '영입' },
  { id: 'comps', label: '대회' },
  { id: 'club', label: '구단' },
];

const TAB_TITLE: Record<Tab, string> = {
  home: '홈',
  squad: '선수단',
  tactics: '전술',
  recruit: '영입',
  comps: '대회',
  club: '구단',
};

export function App() {
  const booting = useStore((s) => s.booting);
  const hasState = useStore((s) => !!s.state);
  const boot = useStore((s) => s.boot);

  useEffect(() => {
    void boot();
  }, [boot]);

  if (booting) return <div className="app"><div className="empty">불러오는 중…</div></div>;
  if (!hasState) return <StartScreen />;
  return <Shell />;
}

function Shell() {
  const state = useGame();
  const tab = useStore((s) => s.tab);
  const stack = useStore((s) => s.stack);
  const setTab = useStore((s) => s.setTab);
  const pop = useStore((s) => s.pop);
  const busy = useStore((s) => s.busy);
  const matchStage = useStore((s) => s.matchStage);
  const continueGame = useStore((s) => s.continueGame);

  const club = state.clubs[state.clubId];
  const route = stack[stack.length - 1];
  const unread = state.inbox.filter((m) => !m.read).length;
  const offers = state.offers.filter((o) => o.status === 'open').length;

  if (state.sacked) return <SackedScreen />;

  let title = TAB_TITLE[tab];
  let body = null;
  if (route) {
    switch (route.kind) {
      case 'player':
        title = state.players[route.id]?.name ?? '선수';
        body = <PlayerScreen id={route.id} />;
        break;
      case 'club':
        title = state.clubs[route.id]?.name ?? '구단';
        body = <ClubProfile id={route.id} />;
        break;
      case 'negotiation':
        title = '협상';
        body = <NegotiationScreen id={route.id} />;
        break;
      case 'inbox':
        title = '메시지';
        body = <InboxDetail id={route.id} />;
        break;
      case 'fixture':
        title = '경기 결과';
        body = <FixtureScreen id={route.id} />;
        break;
    }
  } else {
    body =
      tab === 'home' ? <HomeScreen /> :
      tab === 'squad' ? <SquadScreen /> :
      tab === 'tactics' ? <TacticsScreen /> :
      tab === 'recruit' ? <RecruitScreen /> :
      tab === 'comps' ? <CompsScreen /> :
      <ClubScreen />;
  }

  const pending = !!state.matchPending;
  return (
    <div className="app">
      <header className="top">
        {route ? (
          <button type="button" className="top__back" onClick={pop} aria-label="뒤로">
            ‹
          </button>
        ) : (
          <Crest club={club} size={34} />
        )}
        <div className="top__titles">
          <div className="top__title">{route ? title : club.name}</div>
          <div className="top__sub">
            {formatDate(state.day)} · {state.season}/{String((state.season + 1) % 100).padStart(2, '0')} 시즌
          </div>
        </div>
      </header>

      <main className="main" key={`${tab}-${stack.length}`}>
        {body}
      </main>

      <button
        type="button"
        className={`fab${busy ? ' fab--busy' : ''}${pending ? ' fab--match' : ''}`}
        onClick={continueGame}
        disabled={busy}
      >
        {busy ? '진행 중…' : pending ? '경기 준비 ▶' : '계속 ▶'}
      </button>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={`tab${tab === t.id && !route ? ' tab--on' : ''}`} onClick={() => setTab(t.id)}>
            <span className="tab__icon"><Icon name={t.id} /></span>
            {t.label}
            {t.id === 'home' && unread > 0 && <span className="tab__dot">{unread > 99 ? '99+' : unread}</span>}
            {t.id === 'recruit' && offers > 0 && <span className="tab__dot">{offers}</span>}
          </button>
        ))}
      </nav>

      {matchStage && <MatchFlow />}
      {state.review && !matchStage && <SeasonReviewSheet />}
    </div>
  );
}
