import { formatMoney } from '../../game/ability';
import { takeJob } from '../../game/world';
import { useGame, useStore } from '../../store';
import { Card, Crest, Kv, Sheet } from '../kit';

export function SeasonReviewSheet() {
  const state = useGame();
  const mutate = useStore((s) => s.mutate);
  const review = state.review!;
  const close = () => mutate((s) => (s.review = null));
  return (
    <Sheet title={`${review.season} 시즌 결산`} onClose={close} footer={<button type="button" className="btn btn--primary btn--block" onClick={close}>새 시즌으로</button>}>
      <div style={{ textAlign: 'center', padding: '6px 0 14px' }}>
        <div style={{ fontSize: 44, fontWeight: 900, color: review.outcome === '강등' ? 'var(--bad)' : review.outcome === '승격' || review.outcome === '우승' ? 'var(--good)' : undefined }}>{review.outcome}</div>
        <div className="small muted">{state.leagueNames[review.division]} {review.position}위 · 상금 {formatMoney(review.prize)}</div>
      </div>
      <Card title="이사회 평가">
        {review.objectives.map((o) => (
          <div key={o.label} className="list-row" style={{ cursor: 'default' }}>
            <span className="list-row__main">
              <span className="list-row__title" style={{ display: 'block' }}>{o.label}</span>
              <span className="list-row__meta">{o.detail}</span>
            </span>
            <span className={o.met ? 'badge badge--good' : 'badge badge--bad'}>{o.met ? '달성' : '미달'}</span>
          </div>
        ))}
      </Card>
      <Card padded>
        <Kv k="1부 우승" v={review.champion} />
        <Kv k={`${state.cupName} 우승`} v={review.cupWinner} />
        <Kv k={`우리 ${state.cupName}`} v={review.cup} />
        <Kv k="승격" v={review.promoted.join(', ') || '-'} />
        <Kv k="강등" v={review.relegated.join(', ') || '-'} />
      </Card>
      {(review.departures.length > 0 || review.retirements.length > 0) && (
        <Card title="떠난 선수" padded>
          {review.departures.length > 0 && <div className="small">계약 만료: {review.departures.join(', ')}</div>}
          {review.retirements.length > 0 && <div className="small" style={{ marginTop: 6 }}>은퇴: {review.retirements.join(', ')}</div>}
        </Card>
      )}
    </Sheet>
  );
}

export function SackedScreen() {
  const state = useGame();
  const mutate = useStore((s) => s.mutate);
  const quit = useStore((s) => s.quit);
  const setTab = useStore((s) => s.setTab);
  return (
    <div className="app">
      <div className="main">
        <div className="start">
          <div className="start__logo">GAFFER 26</div>
          <h1 className="start__title">경질되었습니다</h1>
          <p className="start__tag">{state.clubs[state.clubId].name} 이사회가 결별을 통보했습니다. 하지만 당신을 원하는 구단이 있습니다.</p>
          <Card title="감독 제의">
            {state.jobOffers.length === 0 && <div className="empty">제의가 없습니다.</div>}
            {state.jobOffers.map((id) => {
              const c = state.clubs[id];
              return (
                <button
                  key={id}
                  type="button"
                  className="list-row"
                  onClick={() => {
                    mutate((s) => takeJob(s, id));
                    setTab('home');
                  }}
                >
                  <Crest club={c} size={34} />
                  <span className="list-row__main">
                    <span className="list-row__title" style={{ display: 'block' }}>{c.name}</span>
                    <span className="list-row__meta">{state.leagueNames[c.division]} · 평판 {c.reputation}</span>
                  </span>
                  <span className="btn btn--sm btn--primary">수락</span>
                </button>
              );
            })}
          </Card>
          <button type="button" className="btn btn--danger btn--block" onClick={() => void quit()}>
            커리어 종료하고 새로 시작
          </button>
        </div>
      </div>
    </div>
  );
}
