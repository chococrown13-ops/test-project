import { useMemo, useState } from 'react';
import { formatMoney, roundMoney } from '../../game/ability';
import { formatShortDate, windowOpen } from '../../game/calendar';
import { STATUS_LABEL } from '../../game/dynamics';
import { POS_LABEL, type Position } from '../../game/formations';
import { knowledgeOf } from '../../game/generate';
import { ROLE_BY_ID, rolesFor } from '../../game/roles';
import { assign, createRequirement } from '../../game/scouting';
import { askingPrice, pitchToAiRequirement, respondToOffer, startNegotiation, STATUSES } from '../../game/transfers';
import type { Negotiation, Pitch, Player, SquadStatus } from '../../game/types';
import { useGame, useStore } from '../../store';
import { Card, Crest, Seg, Sheet, SubTabs } from '../kit';
import { KnownStars, PlayerRow } from '../PlayerRow';

type Sub = 'search' | 'shortlist' | 'requirements' | 'opportunities' | 'deals' | 'scouts' | 'news';

export function RecruitScreen() {
  const state = useGame();
  const sub = (useStore((s) => s.subs.recruit) as Sub) ?? 'search';
  const setSub = useStore((s) => s.setSub);
  const club = state.clubs[state.clubId];
  const open = windowOpen(state.dates, state.day);
  const offers = state.offers.filter((o) => o.status === 'open').length;
  const newPitches = state.pitches.filter((p) => !p.dismissed && state.day - p.day <= 3).length;

  return (
    <>
      <Card padded>
        <div className="row small">
          <span className={open ? 'badge badge--good' : 'badge'}>{open ? `${open === 'summer' ? '여름' : '겨울'} 이적시장 열림` : '이적시장 닫힘'}</span>
          <span className="spacer" />
          <span className="muted">이적 예산</span>
          <b>{formatMoney(club.transferBudget)}</b>
        </div>
      </Card>
      <SubTabs<Sub>
        value={sub}
        onChange={(v) => setSub('recruit', v)}
        options={[
          { value: 'search', label: '스카우팅 센터' },
          { value: 'shortlist', label: `관심 목록 ${state.shortlist.length}` },
          { value: 'requirements', label: '영입 요청', badge: newPitches },
          { value: 'opportunities', label: '피치 기회' },
          { value: 'deals', label: '협상·제안', badge: offers },
          { value: 'scouts', label: '스카우트' },
          { value: 'news', label: '이적 소식' },
        ]}
      />
      {sub === 'search' && <Search />}
      {sub === 'shortlist' && <Shortlist />}
      {sub === 'requirements' && <Requirements />}
      {sub === 'opportunities' && <Opportunities />}
      {sub === 'deals' && <Deals />}
      {sub === 'scouts' && <Scouts />}
      {sub === 'news' && <News />}
    </>
  );
}

const POS_FILTERS: (Position | 'ALL')[] = ['ALL', 'GK', 'DC', 'DL', 'DR', 'DM', 'MC', 'ML', 'MR', 'AMC', 'AML', 'AMR', 'ST'];

function Search() {
  const state = useGame();
  const push = useStore((s) => s.push);
  const [pos, setPos] = useState<Position | 'ALL'>('ALL');
  const [scope, setScope] = useState<'all' | '0' | '1' | '2' | 'free'>('all');
  const [age, setAge] = useState<'any' | 'u21' | 'u25' | 'prime'>('any');
  const [budget, setBudget] = useState(false);
  const club = state.clubs[state.clubId];

  const results = useMemo(() => {
    return Object.values(state.players)
      .filter((p) => p.clubId !== state.clubId && !p.youth)
      .filter((p) => pos === 'ALL' || (p.positions[pos] ?? 0) >= 15)
      .filter((p) => {
        if (scope === 'all') return true;
        if (scope === 'free') return !p.clubId;
        return !!p.clubId && state.clubs[p.clubId].division === Number(scope);
      })
      .filter((p) => (age === 'u21' ? p.age <= 21 : age === 'u25' ? p.age <= 25 : age === 'prime' ? p.age >= 24 && p.age <= 30 : true))
      .filter((p) => !budget || !p.clubId || askingPrice(state, p) <= club.transferBudget)
      .map((p) => ({ p, k: knowledgeOf(state, p) }))
      // Only what scouts know can be ranked; unknown players sink.
      .sort((a, b) => (b.k >= 30 ? b.p.ca : b.p.reputation / 2) - (a.k >= 30 ? a.p.ca : a.p.reputation / 2))
      .slice(0, 60);
  }, [state, pos, scope, age, budget, club.transferBudget]);

  return (
    <>
      <div className="subtabs">
        {POS_FILTERS.map((p) => (
          <button key={p} type="button" className={`chip chip--small${pos === p ? ' chip--on' : ''}`} onClick={() => setPos(p)}>
            {p === 'ALL' ? '전체' : POS_LABEL[p]}
          </button>
        ))}
      </div>
      <div style={{ marginBottom: 8 }}>
        <Seg
          value={scope}
          onChange={setScope}
          options={[
            { value: 'all', label: '전체' },
            { value: '0', label: '1부' },
            { value: '1', label: '2부' },
            { value: '2', label: '3부' },
            { value: 'free', label: 'FA' },
          ]}
        />
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <Seg
            value={age}
            onChange={setAge}
            options={[
              { value: 'any', label: '모든 나이' },
              { value: 'u21', label: '21↓' },
              { value: 'u25', label: '25↓' },
              { value: 'prime', label: '24-30' },
            ]}
          />
        </div>
        <button type="button" className={`chip chip--small${budget ? ' chip--on' : ''}`} onClick={() => setBudget(!budget)}>
          예산 내
        </button>
      </div>
      <Card title={`검색 결과 ${results.length}명`}>
        {results.length === 0 && <div className="empty">조건에 맞는 선수가 없습니다.</div>}
        {results.map(({ p, k }) => (
          <PlayerRow
            key={p.id}
            state={state}
            player={p}
            onClick={() => push({ kind: 'player', id: p.id })}
            end={
              <div style={{ textAlign: 'right' }}>
                <KnownStars state={state} player={p} />
                <div className="tiny faint">{p.clubId ? (k >= 30 ? formatMoney(askingPrice(state, p)) : '?') : 'FA'}</div>
              </div>
            }
          />
        ))}
      </Card>
      <p className="tiny faint" style={{ textAlign: 'center' }}>스카우팅 정보가 부족한 선수는 능력이 '?'로 표시됩니다. 스카우트 탭에서 지역을 배정하세요.</p>
    </>
  );
}

function Shortlist() {
  const state = useGame();
  const push = useStore((s) => s.push);
  const players = state.shortlist.map((id) => state.players[id]).filter((p): p is Player => !!p);
  return (
    <Card title="관심 목록">
      {players.length === 0 && <div className="empty">선수 화면에서 '관심 목록 추가'를 누르면 여기에 모입니다.</div>}
      {players.map((p) => (
        <PlayerRow
          key={p.id}
          state={state}
          player={p}
          onClick={() => push({ kind: 'player', id: p.id })}
          end={
            <div style={{ textAlign: 'right' }}>
              <KnownStars state={state} player={p} />
              <div className="tiny faint">{p.clubId ? formatMoney(askingPrice(state, p)) : 'FA'}</div>
            </div>
          }
        />
      ))}
    </Card>
  );
}

function Requirements() {
  const state = useGame();
  const mutate = useStore((s) => s.mutate);
  const push = useStore((s) => s.push);
  const [creating, setCreating] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const reqs = state.requirements;

  const negotiate = (pitch: Pitch) => {
    let result: Negotiation | string = '';
    mutate((s) => {
      result = startNegotiation(s, pitch.playerId, pitch.deal === 'free' ? 'free' : pitch.deal === 'loan' ? 'loan' : 'transfer');
    });
    if (typeof result === 'string') setNote(result);
    else push({ kind: 'negotiation', id: (result as Negotiation).id });
  };

  return (
    <>
      <Card padded>
        <p className="small" style={{ marginTop: 0 }}>
          <b>영입 요청</b>은 필요한 포지션·역할·나이·예산을 모든 구단과 에이전트에게 알리는 기능입니다. 조건에 맞는 선수들이 며칠 안에 제안으로 들어옵니다.
        </p>
        <button type="button" className="btn btn--primary btn--block" onClick={() => setCreating(true)}>
          새 영입 요청 만들기
        </button>
      </Card>
      {note && <div className="card card__body small">{note}</div>}
      {reqs.length === 0 && <div className="empty">아직 등록한 요청이 없습니다.</div>}
      {reqs.map((r) => {
        const pitches = state.pitches.filter((p) => p.requirementId === r.id && !p.dismissed);
        return (
          <Card
            key={r.id}
            title={`${POS_LABEL[r.position]} · ${r.ipRole ? ROLE_BY_ID[r.ipRole]?.name : '역할 무관'} ${r.open ? '' : '(마감)'}`}
            action={r.open ? '마감' : undefined}
            onAction={() => mutate((s) => (s.requirements.find((x) => x.id === r.id)!.open = false))}
          >
            <div className="card__body small muted" style={{ paddingBottom: 4 }}>
              {r.minAge}-{r.maxAge}세 · 이적료 {formatMoney(r.maxFee)} 이하 · 주급 {formatMoney(r.maxWage)} 이하 · {r.deal === 'loan' ? '임대' : r.deal === 'transfer' ? '이적' : '무관'} · {STATUS_LABEL[r.playingTime]}
            </div>
            {pitches.length === 0 && <div className="empty">제안을 기다리는 중…</div>}
            {pitches.map((pitch) => {
              const p = state.players[pitch.playerId];
              if (!p) return null;
              return (
                <div key={pitch.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <PlayerRow
                    state={state}
                    player={p}
                    onClick={() => push({ kind: 'player', id: p.id })}
                    end={
                      <div style={{ textAlign: 'right' }}>
                        <KnownStars state={state} player={p} />
                        <div className="tiny faint">{pitch.deal === 'free' ? 'FA' : pitch.deal === 'loan' ? '임대' : formatMoney(pitch.askingFee)}</div>
                      </div>
                    }
                  />
                  <div className="small muted" style={{ padding: '0 14px 6px' }}>
                    {formatShortDate(pitch.day)} · {pitch.note}
                  </div>
                  <div className="row" style={{ padding: '0 14px 10px' }}>
                    <button type="button" className="btn btn--sm btn--primary" onClick={() => negotiate(pitch)}>
                      협상 시작
                    </button>
                    <button type="button" className="btn btn--sm" onClick={() => mutate((s) => (s.shortlist = s.shortlist.includes(p.id) ? s.shortlist : [...s.shortlist, p.id]))}>
                      관심 목록
                    </button>
                    <button type="button" className="btn btn--sm" onClick={() => mutate((s) => (s.pitches.find((x) => x.id === pitch.id)!.dismissed = true))}>
                      거절
                    </button>
                  </div>
                </div>
              );
            })}
          </Card>
        );
      })}
      {creating && <RequirementSheet onClose={() => setCreating(false)} />}
    </>
  );
}

function RequirementSheet({ onClose }: { onClose: () => void }) {
  const state = useGame();
  const mutate = useStore((s) => s.mutate);
  const club = state.clubs[state.clubId];
  const [position, setPosition] = useState<Position>('ST');
  const [ipRole, setIpRole] = useState<string>('');
  const [oopRole, setOopRole] = useState<string>('');
  const [ages, setAges] = useState<'young' | 'prime' | 'any'>('any');
  const [fee, setFee] = useState<'25' | '50' | '100'>('50');
  const [deal, setDeal] = useState<'transfer' | 'loan' | 'any'>('any');
  const [status, setStatus] = useState<SquadStatus>('first');
  const typical = club.playerIds.map((id) => state.players[id]?.contract?.wage ?? 0).sort((a, b) => b - a)[5] ?? 100;

  return (
    <Sheet
      title="새 영입 요청"
      onClose={onClose}
      footer={
        <button
          type="button"
          className="btn btn--primary btn--block"
          onClick={() => {
            mutate((s) =>
              createRequirement(s, {
                position,
                ipRole: ipRole || null,
                oopRole: oopRole || null,
                minAge: ages === 'young' ? 16 : ages === 'prime' ? 23 : 16,
                maxAge: ages === 'young' ? 22 : ages === 'prime' ? 30 : 34,
                maxFee: roundMoney((club.transferBudget * Number(fee)) / 100),
                maxWage: roundMoney(typical * 1.4),
                deal,
                playingTime: status,
              }),
            );
            onClose();
          }}
        >
          요청 등록
        </button>
      }
    >
      <div className="field">
        <div className="field__label">포지션</div>
        <div className="subtabs" style={{ margin: 0, padding: 0, flexWrap: 'wrap' }}>
          {POS_FILTERS.filter((p): p is Position => p !== 'ALL').map((p) => (
            <button
              key={p}
              type="button"
              className={`chip chip--small${position === p ? ' chip--on' : ''}`}
              onClick={() => {
                setPosition(p);
                setIpRole('');
                setOopRole('');
              }}
            >
              {POS_LABEL[p]}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <div className="field__label">공격 시 역할</div>
        <select className="select" value={ipRole} onChange={(e) => setIpRole(e.target.value)}>
          <option value="">무관</option>
          {rolesFor(position, 'ip').map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <div className="field__label">수비 시 역할</div>
        <select className="select" value={oopRole} onChange={(e) => setOopRole(e.target.value)}>
          <option value="">무관</option>
          {rolesFor(position, 'oop').map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <div className="field__label">나이</div>
        <Seg value={ages} onChange={setAges} options={[{ value: 'young', label: '22세 이하' }, { value: 'prime', label: '23-30세' }, { value: 'any', label: '무관' }]} />
      </div>
      <div className="field">
        <div className="field__label">최대 이적료 (예산 {formatMoney(club.transferBudget)} 기준)</div>
        <Seg value={fee} onChange={setFee} options={[{ value: '25', label: '25%' }, { value: '50', label: '50%' }, { value: '100', label: '전액' }]} />
      </div>
      <div className="field">
        <div className="field__label">영입 방식</div>
        <Seg value={deal} onChange={setDeal} options={[{ value: 'transfer', label: '완전 이적' }, { value: 'loan', label: '임대' }, { value: 'any', label: '무관' }]} />
      </div>
      <div className="field">
        <div className="field__label">예상 출전 시간</div>
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value as SquadStatus)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
    </Sheet>
  );
}

function Opportunities() {
  const state = useGame();
  const mutate = useStore((s) => s.mutate);
  const [offerFor, setOfferFor] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const reqs = state.aiRequirements.filter((r) => r.until > state.day);
  const req = reqs.find((r) => r.id === offerFor);
  const mine = state.clubs[state.clubId].playerIds.map((id) => state.players[id]).filter((p): p is Player => !!p);

  return (
    <>
      <Card padded>
        <p className="small" style={{ margin: 0 }}>
          <b>피치 기회</b>: 다른 구단들이 찾고 있는 선수 유형입니다. 조건에 맞는 우리 선수를 직접 제안해 팔거나 임대 보낼 수 있습니다.
        </p>
      </Card>
      {note && <div className="card card__body small">{note}</div>}
      <Card title={`구단들의 요청 ${reqs.length}건`}>
        {reqs.length === 0 && <div className="empty">이적시장이 열리면 구단들의 요청이 올라옵니다.</div>}
        {reqs.map((r) => {
          const c = state.clubs[r.clubId];
          return (
            <div key={r.id} className="list-row" style={{ cursor: 'default' }}>
              <Crest club={c} size={32} />
              <span className="list-row__main">
                <span className="list-row__title" style={{ display: 'block' }}>
                  {c.name} — {POS_LABEL[r.position]}
                </span>
                <span className="list-row__meta">
                  {r.maxAge}세 이하 · {r.deal === 'loan' ? '임대' : `최대 ${formatMoney(r.maxFee)}`} · ~{formatShortDate(r.until)}
                </span>
              </span>
              <button type="button" className="btn btn--sm btn--primary" onClick={() => setOfferFor(r.id)}>
                선수 제안
              </button>
            </div>
          );
        })}
      </Card>
      {req && (
        <Sheet title={`${state.clubs[req.clubId].name}에 제안할 선수`} onClose={() => setOfferFor(null)}>
          {mine
            .filter((p) => (p.positions[req.position] ?? 0) >= 13 && p.age <= req.maxAge)
            .map((p) => (
              <PlayerRow
                key={p.id}
                state={state}
                player={p}
                onClick={() => {
                  let msg = '';
                  mutate((s, rng) => {
                    msg = pitchToAiRequirement(s, req.id, p.id, rng);
                  });
                  setNote(msg);
                  setOfferFor(null);
                }}
              />
            ))}
          <p className="tiny faint">조건(포지션·나이)에 맞는 선수만 보입니다.</p>
        </Sheet>
      )}
    </>
  );
}

function Deals() {
  const state = useGame();
  const mutate = useStore((s) => s.mutate);
  const push = useStore((s) => s.push);
  const [counter, setCounter] = useState<string | null>(null);
  const [counterFee, setCounterFee] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const offers = state.offers.filter((o) => o.status === 'open');
  const talks = state.negotiations.filter((n) => n.stage === 'fee' || n.stage === 'contract');
  const recent = state.negotiations.filter((n) => n.stage === 'done' || n.stage === 'failed').slice(0, 6);

  const act = (id: string, action: 'accept' | 'reject' | 'counter', fee?: number) => {
    let msg = '';
    mutate((s, rng) => {
      msg = respondToOffer(s, id, action, fee, rng);
    });
    setNote(msg);
  };

  return (
    <>
      {note && <div className="card card__body small">{note}</div>}
      <Card title={`받은 제안 ${offers.length}건`}>
        {offers.length === 0 && <div className="empty">우리 선수에 대한 제안이 없습니다.</div>}
        {offers.map((o) => {
          const p = state.players[o.playerId];
          const c = state.clubs[o.fromClubId];
          if (!p || !c) return null;
          return (
            <div key={o.id} style={{ borderBottom: '1px solid var(--line)' }}>
              <PlayerRow state={state} player={p} onClick={() => push({ kind: 'player', id: p.id })} meta={<span>{c.name} · {formatShortDate(o.expires)} 만료</span>} end={<b>{o.deal === 'loan' ? '임대' : formatMoney(o.fee)}</b>} />
              <div className="row" style={{ padding: '0 14px 10px' }}>
                <button type="button" className="btn btn--sm btn--primary" onClick={() => act(o.id, 'accept')}>
                  수락
                </button>
                {o.deal === 'transfer' && (
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => {
                      setCounter(o.id);
                      setCounterFee(roundMoney(o.fee * 1.25));
                    }}
                  >
                    역제안
                  </button>
                )}
                <button type="button" className="btn btn--sm btn--danger" onClick={() => act(o.id, 'reject')}>
                  거절
                </button>
                <span className="spacer" />
                <span className="tiny faint">가치 {formatMoney(p.value)}</span>
              </div>
            </div>
          );
        })}
      </Card>
      <Card title={`진행 중인 협상 ${talks.length}건`}>
        {talks.length === 0 && <div className="empty">진행 중인 협상이 없습니다.</div>}
        {talks.map((n) => {
          const p = state.players[n.playerId];
          if (!p) return null;
          return <PlayerRow key={n.id} state={state} player={p} onClick={() => push({ kind: 'negotiation', id: n.id })} meta={<span>{n.kind === 'renewal' ? '재계약' : n.kind === 'loan' ? '임대' : n.kind === 'free' ? '자유계약' : '이적'} · {n.stage === 'fee' ? '이적료 협상' : '계약 조건 협상'}</span>} end={<span className="faint">›</span>} />;
        })}
      </Card>
      {recent.length > 0 && (
        <Card title="최근 협상 결과">
          {recent.map((n) => {
            const p = state.players[n.playerId];
            return (
              <div key={n.id} className="list-row" style={{ cursor: 'default' }}>
                <span className="list-row__main">
                  <span className="list-row__title" style={{ display: 'block' }}>{p?.name ?? '선수'}</span>
                  <span className="list-row__meta">{n.log[n.log.length - 1]}</span>
                </span>
                <span className={n.stage === 'done' ? 'badge badge--good' : 'badge badge--bad'}>{n.stage === 'done' ? '성사' : '결렬'}</span>
              </div>
            );
          })}
        </Card>
      )}
      {counter && (
        <Sheet
          title="역제안 금액"
          onClose={() => setCounter(null)}
          footer={
            <button
              type="button"
              className="btn btn--primary btn--block"
              onClick={() => {
                act(counter, 'counter', counterFee);
                setCounter(null);
              }}
            >
              {formatMoney(counterFee)} 요구
            </button>
          }
        >
          <MoneyStepper value={counterFee} onChange={setCounterFee} />
        </Sheet>
      )}
    </>
  );
}

export function MoneyStepper({ value, onChange, min = 0 }: { value: number; onChange: (v: number) => void; min?: number }) {
  const step = value >= 100000 ? 5000 : value >= 10000 ? 1000 : value >= 1000 ? 100 : 10;
  return (
    <div className="row" style={{ justifyContent: 'center', gap: 6 }}>
      <button type="button" className="btn btn--sm" onClick={() => onChange(Math.max(min, roundMoney(value - step * 5)))}>
        −−
      </button>
      <button type="button" className="btn btn--sm" onClick={() => onChange(Math.max(min, roundMoney(value - step)))}>
        −
      </button>
      <b className="num" style={{ minWidth: 92, textAlign: 'center', fontSize: 18 }}>{formatMoney(value)}</b>
      <button type="button" className="btn btn--sm" onClick={() => onChange(roundMoney(value + step))}>
        +
      </button>
      <button type="button" className="btn btn--sm" onClick={() => onChange(roundMoney(value + step * 5))}>
        ++
      </button>
    </div>
  );
}

function Scouts() {
  const state = useGame();
  const mutate = useStore((s) => s.mutate);
  const scouts = state.staff.filter((s) => s.role === 'scout');
  const target = (staffId: string) => {
    const a = state.assignments.find((x) => x.staffId === staffId);
    if (!a) return '대기 중';
    const t = a.target;
    const label = t.type === 'division' ? state.leagueNames[t.division] : t.type === 'free' ? '자유계약 선수' : t.type === 'player' ? `${state.players[t.playerId]?.name ?? ''} 관찰` : '영입 요청 조건';
    return `${label} · ${a.daysLeft}일 남음`;
  };
  return (
    <>
      {scouts.length === 0 && <div className="empty">스카우트가 없습니다. 구단 &gt; 스태프에서 고용하세요.</div>}
      {scouts.map((s) => (
        <Card key={s.id} title={`${s.name} (능력 ${s.ability}/20)`} padded>
          <div className="small muted" style={{ marginBottom: 8 }}>현재 임무: {target(s.id)}</div>
          <div className="grid2">
            {[0, 1, 2].map((d) => (
              <button key={d} type="button" className="btn btn--sm" onClick={() => mutate((st) => assign(st, s.id, { type: 'division', division: d }, 28))}>
                {state.leagueNames[d]}
              </button>
            ))}
            <button type="button" className="btn btn--sm" onClick={() => mutate((st) => assign(st, s.id, { type: 'free' }, 21))}>
              자유계약 선수
            </button>
            {state.requirements
              .filter((r) => r.open)
              .slice(0, 2)
              .map((r) => (
                <button key={r.id} type="button" className="btn btn--sm" style={{ gridColumn: 'span 2' }} onClick={() => mutate((st) => assign(st, s.id, { type: 'requirement', id: r.id }, 21))}>
                  요청 조건으로 탐색: {POS_LABEL[r.position]}
                </button>
              ))}
          </div>
        </Card>
      ))}
      <p className="tiny faint" style={{ textAlign: 'center' }}>임무를 마치면 추천 선수 보고서가 메시지로 도착합니다. 능력이 높은 스카우트일수록 정보가 빨리 쌓이고 평가가 정확합니다.</p>
    </>
  );
}

function News() {
  const state = useGame();
  const push = useStore((s) => s.push);
  const recent = state.transfers.filter((t) => t.season === state.season).slice(0, 40);
  return (
    <Card title="이번 시즌 이적 소식">
      {recent.length === 0 && <div className="empty">아직 이적이 없습니다.</div>}
      {recent.map((t, i) => {
        const from = t.fromId ? state.clubs[t.fromId]?.short : 'FA';
        const to = t.toId ? state.clubs[t.toId]?.short : 'FA';
        const p = state.players[t.playerId];
        return (
          <button key={i} type="button" className="list-row" onClick={() => p && push({ kind: 'player', id: p.id })} disabled={!p}>
            <span className="list-row__main">
              <span className="list-row__title" style={{ display: 'block' }}>{t.playerName}</span>
              <span className="list-row__meta">
                {from} → {to} · {formatShortDate(t.day)}
              </span>
            </span>
            <b className="small">{t.loan ? '임대' : t.fee > 0 ? formatMoney(t.fee) : '자유'}</b>
          </button>
        );
      })}
    </Card>
  );
}

