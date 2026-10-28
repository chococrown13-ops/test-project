import { useState } from 'react';
import { averageRating, bestPosition, formatMoney, moraleLabel } from '../../game/ability';
import { GROUP_LABEL, type AttrGroup } from '../../game/attributes';
import { STATUS_LABEL } from '../../game/dynamics';
import { POS_LINE } from '../../game/formations';
import { FOCUS_HELP, FOCUS_LABEL } from '../../game/training';
import { startNegotiation } from '../../game/transfers';
import { releasePlayer } from '../../game/transfers';
import type { Player, TrainingFocus } from '../../game/types';
import { useGame, useStore } from '../../store';
import { Card, Meter, Seg, Sheet, SubTabs, ratingColor, tone } from '../kit';
import { PlayerRow } from '../PlayerRow';

type Sub = 'squad' | 'training' | 'contracts' | 'medical' | 'dynamics' | 'youth';
type Sort = 'pos' | 'ability' | 'age' | 'condition' | 'rating';

const LINE_ORDER = { GK: 0, DEF: 1, MID: 2, ATT: 3 };

export function SquadScreen() {
  const state = useGame();
  const sub = (useStore((s) => s.subs.squad) as Sub) ?? 'squad';
  const setSub = useStore((s) => s.setSub);
  const club = state.clubs[state.clubId];
  const injured = club.playerIds.filter((id) => state.players[id]?.injury).length;

  return (
    <>
      <SubTabs<Sub>
        value={sub}
        onChange={(v) => setSub('squad', v)}
        options={[
          { value: 'squad', label: `선수단 ${club.playerIds.length}` },
          { value: 'training', label: '훈련' },
          { value: 'contracts', label: '계약' },
          { value: 'medical', label: '의료', badge: injured },
          { value: 'dynamics', label: '분위기' },
          { value: 'youth', label: `유스 ${club.youthIds.length}` },
        ]}
      />
      {sub === 'squad' && <SquadList />}
      {sub === 'training' && <Training />}
      {sub === 'contracts' && <Contracts />}
      {sub === 'medical' && <Medical />}
      {sub === 'dynamics' && <Dynamics />}
      {sub === 'youth' && <Youth />}
    </>
  );
}

function SquadList() {
  const state = useGame();
  const push = useStore((s) => s.push);
  const [sort, setSort] = useState<Sort>('pos');
  const club = state.clubs[state.clubId];
  const lineup = new Set(club.tactic.lineup);
  const players = club.playerIds.map((id) => state.players[id]).filter((p): p is Player => !!p);
  const sorted = [...players].sort((a, b) => {
    switch (sort) {
      case 'pos':
        return LINE_ORDER[POS_LINE[bestPosition(a)]] - LINE_ORDER[POS_LINE[bestPosition(b)]] || b.ca - a.ca;
      case 'ability':
        return b.ca - a.ca;
      case 'age':
        return a.age - b.age;
      case 'condition':
        return a.condition - b.condition;
      case 'rating':
        return (averageRating(b, state.season) ?? 0) - (averageRating(a, state.season) ?? 0);
    }
  });
  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <Seg<Sort>
          value={sort}
          onChange={setSort}
          options={[
            { value: 'pos', label: '포지션' },
            { value: 'ability', label: '능력' },
            { value: 'age', label: '나이' },
            { value: 'condition', label: '체력' },
            { value: 'rating', label: '평점' },
          ]}
        />
      </div>
      <Card>
        {sorted.map((p) => {
          const avg = averageRating(p, state.season);
          return (
            <PlayerRow
              key={p.id}
              state={state}
              player={p}
              onClick={() => push({ kind: 'player', id: p.id })}
              meta={
                <>
                  <span>{p.age}세</span>
                  {lineup.has(p.id) && <span className="good">선발</span>}
                  <span>
                    체력 <Meter value={p.condition} width={34} />
                  </span>
                  <span>
                    사기 <Meter value={p.morale} width={34} />
                  </span>
                </>
              }
              end={
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 900, color: avg ? ratingColor(avg) : 'var(--faint)' }}>{avg ? avg.toFixed(2) : '-'}</div>
                  <div className="tiny faint">{formatMoney(p.value)}</div>
                </div>
              }
            />
          );
        })}
      </Card>
      <p className="tiny faint" style={{ textAlign: 'center' }}>오른쪽 숫자는 이번 시즌 평균 평점입니다.</p>
    </>
  );
}

const FOCUSES: TrainingFocus[] = ['balanced', 'tactical', 'attacking', 'defending', 'physical', 'setpieces', 'recovery', 'matchPrep'];

function Training() {
  const state = useGame();
  const mutate = useStore((s) => s.mutate);
  const push = useStore((s) => s.push);
  const [focusFor, setFocusFor] = useState<Player | null>(null);
  const club = state.clubs[state.clubId];
  const coaches = state.staff.filter((s) => ['coach', 'assistant', 'fitness', 'gkCoach'].includes(s.role));

  return (
    <>
      <Card title="팀 훈련 초점" padded>
        <div className="grid2">
          {FOCUSES.map((f) => (
            <button
              key={f}
              type="button"
              className={`chip${state.training.focus === f ? ' chip--on' : ''}`}
              style={{ borderRadius: 10, textAlign: 'left' }}
              onClick={() => mutate((s) => (s.training.focus = f))}
            >
              {FOCUS_LABEL[f]}
            </button>
          ))}
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>{FOCUS_HELP[state.training.focus]}</p>
      </Card>

      <Card title="훈련 강도" padded>
        <Seg
          value={state.training.intensity}
          onChange={(v) => mutate((s) => (s.training.intensity = v))}
          options={[
            { value: 'low', label: '낮음' },
            { value: 'normal', label: '보통' },
            { value: 'high', label: '높음' },
          ]}
        />
        <p className="small muted" style={{ marginBottom: 0 }}>
          강도가 높으면 성장이 빨라지지만 체력 회복이 늦고 부상 위험이 커집니다.
        </p>
      </Card>

      <Card title="전술 이해도" padded>
        <div className="row">
          <Meter value={club.tactic.familiarity} width={160} />
          <b className="num">{Math.round(club.tactic.familiarity)}%</b>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          포메이션을 바꾸면 떨어지고, 전술 훈련과 경기를 치를수록 오릅니다. 경기력에 직접 영향을 줍니다.
        </p>
      </Card>

      <Card title={`코칭스태프 ${coaches.length}명`} padded>
        <div className="small muted">
          평균 능력 {coaches.length ? (coaches.reduce((s, c) => s + c.ability, 0) / coaches.length).toFixed(1) : '-'} / 20 · 훈련 시설 {club.trainingFacilities} / 20
        </div>
      </Card>

      <Card title="개인 훈련">
        {club.playerIds.map((id) => {
          const p = state.players[id];
          if (!p) return null;
          return (
            <PlayerRow
              key={id}
              state={state}
              player={p}
              onClick={() => setFocusFor(p)}
              end={<span className="badge">{p.trainingFocus ? GROUP_LABEL[p.trainingFocus] : '없음'}</span>}
            />
          );
        })}
      </Card>

      {focusFor && (
        <Sheet title={`${focusFor.name} 개인 훈련`} onClose={() => setFocusFor(null)}>
          <div className="grid2">
            {([null, 'attacking', 'creative', 'defending', 'physical', 'mental', 'goalkeeping', 'setpieces'] as (AttrGroup | null)[]).map((g) => (
              <button
                key={g ?? 'none'}
                type="button"
                className={`chip${focusFor.trainingFocus === g ? ' chip--on' : ''}`}
                onClick={() => {
                  mutate((s) => (s.players[focusFor.id].trainingFocus = g));
                  setFocusFor(null);
                }}
              >
                {g ? GROUP_LABEL[g] : '없음'}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn--block" style={{ marginTop: 12 }} onClick={() => push({ kind: 'player', id: focusFor.id })}>
            선수 정보 보기
          </button>
        </Sheet>
      )}
    </>
  );
}

function Contracts() {
  const state = useGame();
  const push = useStore((s) => s.push);
  const mutate = useStore((s) => s.mutate);
  const [error, setError] = useState<string | null>(null);
  const club = state.clubs[state.clubId];
  const players = club.playerIds
    .map((id) => state.players[id])
    .filter((p): p is Player => !!p && !!p.contract)
    .sort((a, b) => a.contract!.expires - b.contract!.expires || b.contract!.wage - a.contract!.wage);
  return (
    <>
      {error && <div className="card card__body bad small">{error}</div>}
      <Card title="계약 현황">
        {players.map((p) => {
          const c = p.contract!;
          const expiring = c.expires <= state.season;
          return (
            <PlayerRow
              key={p.id}
              state={state}
              player={p}
              onClick={() => push({ kind: 'player', id: p.id })}
              meta={
                <>
                  <span>{STATUS_LABEL[c.status]}</span>
                  <span>주급 {formatMoney(c.wage)}</span>
                  <span className={expiring ? 'bad' : undefined}>~{c.expires + 1}.6</span>
                </>
              }
              end={
                expiring && !p.loan ? (
                  <span
                    role="button"
                    className="btn btn--sm btn--primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      let result: ReturnType<typeof startNegotiation> = '';
                      mutate((s) => {
                        result = startNegotiation(s, p.id, 'renewal');
                      });
                      if (typeof result === 'string') setError(result);
                      else push({ kind: 'negotiation', id: (result as { id: string }).id });
                    }}
                  >
                    재계약
                  </span>
                ) : (
                  <span className="tiny faint">{c.expires - state.season + 1}년</span>
                )
              }
            />
          );
        })}
      </Card>
    </>
  );
}

function Medical() {
  const state = useGame();
  const push = useStore((s) => s.push);
  const club = state.clubs[state.clubId];
  const players = club.playerIds.map((id) => state.players[id]).filter((p): p is Player => !!p);
  const injured = players.filter((p) => p.injury);
  const tired = players.filter((p) => !p.injury && p.condition < 80).sort((a, b) => a.condition - b.condition);
  const physios = state.staff.filter((s) => s.role === 'physio');
  return (
    <>
      <Card title={`부상자 ${injured.length}명`}>
        {injured.length === 0 && <div className="empty">부상자가 없습니다.</div>}
        {injured.map((p) => (
          <PlayerRow key={p.id} state={state} player={p} onClick={() => push({ kind: 'player', id: p.id })} meta={<span>{p.injury!.name}</span>} end={<b className="bad">{p.injury!.days}일</b>} />
        ))}
      </Card>
      <Card title="체력 관리 필요">
        {tired.length === 0 && <div className="empty">모두 정상 컨디션입니다.</div>}
        {tired.map((p) => (
          <PlayerRow key={p.id} state={state} player={p} onClick={() => push({ kind: 'player', id: p.id })} end={<b style={{ color: tone(p.condition) }}>{Math.round(p.condition)}%</b>} />
        ))}
      </Card>
      <Card padded>
        <div className="small muted">의무 트레이너 {physios.length}명 · 최고 능력 {physios.length ? Math.max(...physios.map((s) => s.ability)) : '-'} / 20 — 능력이 높을수록 부상 회복이 빠릅니다.</div>
      </Card>
    </>
  );
}

function Dynamics() {
  const state = useGame();
  const push = useStore((s) => s.push);
  const club = state.clubs[state.clubId];
  const players = club.playerIds
    .map((id) => state.players[id])
    .filter((p): p is Player => !!p)
    .sort((a, b) => a.morale - b.morale);
  const avg = players.reduce((s, p) => s + p.morale, 0) / Math.max(1, players.length);
  const captain = club.tactic.captain ? state.players[club.tactic.captain] : null;
  return (
    <>
      <Card padded>
        <div className="row">
          <span className="muted">팀 사기</span>
          <span className="spacer" />
          <b style={{ color: tone(avg) }}>{moraleLabel(avg)}</b>
        </div>
        <div className="row small" style={{ marginTop: 6 }}>
          <span className="muted">주장</span>
          <span className="spacer" />
          <b>{captain?.name ?? '-'}</b>
        </div>
      </Card>
      <Card title="선수별 사기 (낮은 순)">
        {players.map((p) => (
          <PlayerRow
            key={p.id}
            state={state}
            player={p}
            onClick={() => push({ kind: 'player', id: p.id })}
            meta={
              <>
                <span>{p.contract ? STATUS_LABEL[p.contract.status] : ''}</span>
                {p.unhappy && <span className="warn">{p.unhappy}</span>}
              </>
            }
            end={<b style={{ color: tone(p.morale) }}>{moraleLabel(p.morale)}</b>}
          />
        ))}
      </Card>
    </>
  );
}

function Youth() {
  const state = useGame();
  const push = useStore((s) => s.push);
  const mutate = useStore((s) => s.mutate);
  const club = state.clubs[state.clubId];
  const youth = club.youthIds.map((id) => state.players[id]).filter((p): p is Player => !!p).sort((a, b) => b.pa - a.pa);
  return (
    <>
      <Card title="유스팀">
        {youth.length === 0 && <div className="empty">유스 선수가 없습니다. 3월 유스 인테이크를 기다리세요.</div>}
        {youth.map((p) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <PlayerRow state={state} player={p} onClick={() => push({ kind: 'player', id: p.id })} />
            </div>
            <div className="row" style={{ paddingRight: 12, gap: 6 }}>
              <button
                type="button"
                className="btn btn--sm btn--primary"
                onClick={() =>
                  mutate((s) => {
                    const c = s.clubs[s.clubId];
                    c.youthIds = c.youthIds.filter((x) => x !== p.id);
                    c.playerIds.push(p.id);
                    s.players[p.id].youth = false;
                  })
                }
              >
                1군
              </button>
              <button type="button" className="btn btn--sm btn--danger" onClick={() => mutate((s) => releasePlayer(s, s.players[p.id], false))}>
                방출
              </button>
            </div>
          </div>
        ))}
      </Card>
      <p className="tiny faint" style={{ textAlign: 'center' }}>
        유스 시설 {club.youthFacilities}/20. 매년 3월 중순 새로운 유스 선수들이 들어옵니다. 18세가 되면 1군으로 올라옵니다.
      </p>
    </>
  );
}
