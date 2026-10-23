import { useState } from 'react';
import { averageRating, familiarityLabel, formatMoney, moraleLabel, personality, roundMoney } from '../../game/ability';
import { A, GOALKEEPING, MENTAL, PHYSICAL, TECHNICAL, ATTR_LABEL, type AttrKey } from '../../game/attributes';
import { windowOpen } from '../../game/calendar';
import { STATUS_LABEL, interact, type Interaction } from '../../game/dynamics';
import { POSITIONS, POS_LABEL, POS_POINT, type Position } from '../../game/formations';
import { knowledgeOf } from '../../game/generate';
import { NATION_LABEL } from '../../game/names';
import { ROLES, roleScore, roleStars } from '../../game/roles';
import { assign, attributeView } from '../../game/scouting';
import { askingPrice, releasePlayer, startNegotiation } from '../../game/transfers';
import type { Negotiation, Player } from '../../game/types';
import { useGame, useStore } from '../../store';
import { AttrValue, Card, Kv, Meter, Seg, Sheet, Stars, ratingColor } from '../kit';
import { KnownStars } from '../PlayerRow';

type View = 'attrs' | 'roles' | 'stats' | 'actions';

export function PlayerScreen({ id }: { id: string }) {
  const state = useGame();
  const player = state.players[id];
  const [view, setView] = useState<View>('attrs');
  if (!player) return <div className="empty">은퇴했거나 더 이상 정보가 없는 선수입니다.</div>;
  const mine = player.clubId === state.clubId;
  const club = player.clubId ? state.clubs[player.clubId] : null;
  const knowledge = knowledgeOf(state, player);
  const push = useStore.getState().push;

  return (
    <>
      <Card padded>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 900 }}>{player.name}</div>
            <div className="small muted">
              {player.age}세 · {NATION_LABEL[player.nation] ?? player.nation} · {player.height}cm · {player.foot === 'L' ? '왼발' : player.foot === 'R' ? '오른발' : '양발'}
            </div>
            <div className="row" style={{ gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
              {(Object.entries(player.positions) as [Position, number][])
                .filter(([, f]) => f >= 15)
                .sort((a, b) => b[1] - a[1])
                .map(([pos]) => (
                  <span key={pos} className="badge">{POS_LABEL[pos]}</span>
                ))}
              {player.injury && <span className="badge badge--bad">✚ {player.injury.name} {player.injury.days}일</span>}
              {player.suspension > 0 && <span className="badge badge--bad">출전 정지 {player.suspension}경기</span>}
              {player.unhappy && <span className="badge badge--warn">{player.unhappy}</span>}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="tiny faint">능력</div>
            <KnownStars state={state} player={player} />
            <div className="tiny faint" style={{ marginTop: 4 }}>잠재력</div>
            <KnownStars state={state} player={player} potential />
          </div>
        </div>
        {club ? (
          <button type="button" className="small" style={{ marginTop: 10, color: 'var(--blue)', fontWeight: 700 }} onClick={() => push({ kind: 'club', id: club.id })}>
            {club.name}
            {player.loan ? ` (임대 · 원소속 ${state.clubs[player.loan.fromClubId]?.name})` : ''} ›
          </button>
        ) : (
          <div className="small warn" style={{ marginTop: 10 }}>자유계약 선수</div>
        )}
        {!mine && (
          <div className="row small" style={{ marginTop: 8 }}>
            <span className="muted">스카우팅 정보</span>
            <Meter value={knowledge} width={100} />
            <b>{Math.round(knowledge)}%</b>
          </div>
        )}
        {mine && (
          <div className="grid2" style={{ marginTop: 10 }}>
            <div className="small">체력 <Meter value={player.condition} /> {Math.round(player.condition)}%</div>
            <div className="small">경기 감각 <Meter value={player.sharpness} /> {Math.round(player.sharpness)}%</div>
            <div className="small">사기 <b>{moraleLabel(player.morale)}</b></div>
            <div className="small">성격 <b>{personality(player)}</b></div>
          </div>
        )}
      </Card>

      <div style={{ marginBottom: 12 }}>
        <Seg<View>
          value={view}
          onChange={setView}
          options={[
            { value: 'attrs', label: '능력치' },
            { value: 'roles', label: '포지션·역할' },
            { value: 'stats', label: '기록' },
            { value: 'actions', label: mine ? '관리' : '영입' },
          ]}
        />
      </div>

      {view === 'attrs' && <Attributes player={player} />}
      {view === 'roles' && <Roles player={player} />}
      {view === 'stats' && <Stats player={player} />}
      {view === 'actions' && (mine ? <ManageActions player={player} /> : <RecruitActions player={player} />)}
    </>
  );
}

function Attributes({ player }: { player: Player }) {
  const state = useGame();
  const isKeeper = (player.positions.GK ?? 0) >= 15;
  const groups: [string, AttrKey[]][] = isKeeper
    ? [['골키핑', GOALKEEPING], ['멘탈', MENTAL], ['피지컬', PHYSICAL]]
    : [['기술', TECHNICAL], ['멘탈', MENTAL], ['피지컬', PHYSICAL]];
  const knowledge = knowledgeOf(state, player);
  return (
    <Card padded>
      {knowledge < 75 && (
        <p className="small warn" style={{ marginTop: 0 }}>
          스카우팅 정보가 부족해 일부 능력치는 범위로만 보입니다. 스카우트를 보내 정확한 값을 확인하세요.
        </p>
      )}
      <div className="attr-cols">
        {groups.map(([label, keys]) => (
          <div key={label}>
            <h4>{label}</h4>
            {keys.map((key) => {
              const value = player.attrs[A[key]];
              const view = attributeView(state, player, value, A[key]);
              return (
                <div key={key} className="attr-row">
                  <span>{ATTR_LABEL[key]}</span>
                  <AttrValue text={view.text} value={view.mid} known={view.known} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {knowledge >= 60 && (
        <p className="small muted" style={{ marginBottom: 0 }}>
          성격: <b>{personality(player)}</b>
        </p>
      )}
    </Card>
  );
}

function Roles({ player }: { player: Player }) {
  const state = useGame();
  const knowledge = knowledgeOf(state, player);
  const natural = (Object.entries(player.positions) as [Position, number][]).filter(([, f]) => f >= 15).map(([p]) => p);
  const best = (phase: 'ip' | 'oop') =>
    ROLES.filter((r) => r.phase === phase && r.positions.some((p) => natural.includes(p)))
      .map((r) => ({ r, score: roleScore(player.attrs, r) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
  return (
    <>
      <Card title="포지션 숙련도" padded>
        <div className="pitch" style={{ aspectRatio: '68 / 70', maxWidth: 300 }}>
          <div className="pitch__lines" />
          {POSITIONS.map((pos) => {
            const fam = player.positions[pos] ?? 0;
            const pt = POS_POINT[pos];
            const color = fam >= 18 ? '#3be3a2' : fam >= 15 ? '#c3e86a' : fam >= 11 ? '#f2c14e' : fam >= 7 ? '#f2765a' : 'rgba(0,0,0,0.35)';
            return (
              <div key={pos} className="slot" style={{ left: `${pt.x}%`, top: `${100 - pt.y}%`, width: 50 }}>
                <span className="slot__shirt" style={{ background: color, color: '#06140d', width: 28, height: 28, fontSize: 9.5 }}>{POS_LABEL[pos]}</span>
              </div>
            );
          })}
        </div>
        <div className="tiny faint" style={{ textAlign: 'center' }}>
          초록: 주 포지션 · 연두: 능숙 · 노랑: 준수 · 주황: 어색함
        </div>
        <div style={{ marginTop: 8 }}>
          {natural.map((p) => (
            <Kv key={p} k={POS_LABEL[p]} v={familiarityLabel(player.positions[p] ?? 0)} />
          ))}
        </div>
      </Card>
      {knowledge >= 40 ? (
        (['ip', 'oop'] as const).map((phase) => (
          <Card key={phase} title={phase === 'ip' ? '공격 시(IP) 어울리는 역할' : '수비 시(OOP) 어울리는 역할'}>
            {best(phase).map(({ r, score }) => (
              <div key={r.id} className="list-row" style={{ cursor: 'default' }}>
                <span className="list-row__main">
                  <span className="list-row__title" style={{ display: 'block' }}>{r.name}</span>
                  <span className="list-row__meta">{r.positions.map((p) => POS_LABEL[p]).join('/')}</span>
                </span>
                <Stars value={roleStars(score)} />
              </div>
            ))}
          </Card>
        ))
      ) : (
        <Card padded>
          <div className="small muted">역할 적합도를 보려면 스카우팅 정보가 더 필요합니다.</div>
        </Card>
      )}
    </>
  );
}

function Stats({ player }: { player: Player }) {
  const state = useGame();
  const rows = [...player.seasons].reverse();
  const avg = averageRating(player, state.season);
  return (
    <>
      <Card title="이번 시즌" padded>
        {(() => {
          const s = player.seasons.find((x) => x.season === state.season && x.clubId === player.clubId);
          if (!s) return <div className="small muted">기록이 없습니다.</div>;
          return (
            <div className="grid2">
              <Kv k="출전 (선발)" v={`${s.apps} (${s.starts})`} />
              <Kv k="평균 평점" v={<span style={{ color: avg ? ratingColor(avg) : undefined }}>{avg ? avg.toFixed(2) : '-'}</span>} />
              <Kv k="골" v={s.goals} />
              <Kv k="도움" v={s.assists} />
              <Kv k="경기 MVP" v={s.mom} />
              <Kv k="무실점" v={s.cleanSheets} />
              <Kv k="출전 시간" v={`${s.minutes}분`} />
              <Kv k="경고/퇴장" v={`${s.yellow}/${s.red}`} />
            </div>
          );
        })()}
      </Card>
      <Card title="커리어">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>시즌</th>
                <th className="left">구단</th>
                <th>출전</th>
                <th>골</th>
                <th>도움</th>
                <th>평점</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s, i) => (
                <tr key={i}>
                  <td>{s.season}</td>
                  <td className="left">{state.clubs[s.clubId]?.short ?? '-'}</td>
                  <td>{s.apps}</td>
                  <td>{s.goals}</td>
                  <td>{s.assists}</td>
                  <td>{s.ratingCount ? (s.ratingSum / s.ratingCount).toFixed(2) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function ManageActions({ player }: { player: Player }) {
  const state = useGame();
  const mutate = useStore((s) => s.mutate);
  const push = useStore((s) => s.push);
  const pop = useStore((s) => s.pop);
  const [note, setNote] = useState<string | null>(null);
  const [confirmRelease, setConfirmRelease] = useState(false);
  const c = player.contract;
  const renew = () => {
    let result: Negotiation | string = '';
    mutate((s) => {
      result = startNegotiation(s, player.id, 'renewal');
    });
    if (typeof result === 'string') setNote(result);
    else push({ kind: 'negotiation', id: (result as Negotiation).id });
  };
  const talk = (kind: Interaction) => {
    let reply = '';
    mutate((s, rng) => {
      reply = interact(s, s.players[player.id], kind, rng);
    });
    setNote(reply);
  };
  return (
    <>
      {note && <div className="card card__body small">{note}</div>}
      <Card title="계약" padded>
        {c ? (
          <>
            <Kv k="주급" v={formatMoney(c.wage)} />
            <Kv k="계약 만료" v={`${c.expires + 1}년 6월`} />
            <Kv k="팀 내 위상" v={STATUS_LABEL[c.status]} />
            <Kv k="바이아웃" v={c.releaseClause ? formatMoney(c.releaseClause) : '없음'} />
            <Kv k="시장 가치" v={formatMoney(player.value)} />
          </>
        ) : (
          <div className="small muted">계약 정보 없음</div>
        )}
        {!player.loan && (
          <button type="button" className="btn btn--primary btn--block" style={{ marginTop: 10 }} onClick={renew}>
            재계약 협상
          </button>
        )}
      </Card>
      <Card title="이적" padded>
        <div className="grid2">
          <button type="button" className={`btn${player.listed === 'transfer' ? ' btn--blue' : ''}`} onClick={() => mutate((s) => (s.players[player.id].listed = player.listed === 'transfer' ? null : 'transfer'))}>
            {player.listed === 'transfer' ? '이적 리스트 해제' : '이적 리스트 등록'}
          </button>
          <button type="button" className={`btn${player.listed === 'loan' ? ' btn--blue' : ''}`} onClick={() => mutate((s) => (s.players[player.id].listed = player.listed === 'loan' ? null : 'loan'))}>
            {player.listed === 'loan' ? '임대 리스트 해제' : '임대 리스트 등록'}
          </button>
        </div>
        <p className="tiny faint">리스트에 올리면 다른 구단의 제안이 들어옵니다. 영입 &gt; 피치 기회에서 직접 제안할 수도 있습니다.</p>
        {!player.loan && (
          <button type="button" className="btn btn--danger btn--block" onClick={() => setConfirmRelease(true)}>
            계약 해지 (방출)
          </button>
        )}
      </Card>
      <Card title="선수 면담" padded>
        <div className="grid2">
          <button type="button" className="btn" onClick={() => talk('praise')}>
            최근 활약 칭찬
          </button>
          <button type="button" className="btn" onClick={() => talk('criticise')}>
            경기력 지적
          </button>
          <button type="button" className="btn" onClick={() => talk('promiseTime')} style={{ gridColumn: 'span 2' }}>
            출전 기회 약속
          </button>
        </div>
      </Card>
      {confirmRelease && c && (
        <Sheet title="방출 확인" onClose={() => setConfirmRelease(false)}>
          <p className="small">
            {player.name}과(와)의 계약을 해지하면 남은 계약의 절반가량인 약 {formatMoney(roundMoney(c.wage * Math.max(0, (c.expires - state.season + 1) * 52 - 26) * 0.5))}을 위약금으로 지급합니다.
          </p>
          <button
            type="button"
            className="btn btn--danger btn--block"
            onClick={() => {
              mutate((s) => releasePlayer(s, s.players[player.id], true));
              setConfirmRelease(false);
              pop();
            }}
          >
            방출하기
          </button>
        </Sheet>
      )}
    </>
  );
}

function RecruitActions({ player }: { player: Player }) {
  const state = useGame();
  const mutate = useStore((s) => s.mutate);
  const push = useStore((s) => s.push);
  const [note, setNote] = useState<string | null>(null);
  const [pickScout, setPickScout] = useState(false);
  const listed = state.shortlist.includes(player.id);
  const scouts = state.staff.filter((s) => s.role === 'scout');
  const asking = player.clubId ? askingPrice(state, player) : 0;
  const open = windowOpen(state.dates, state.day);

  const negotiate = (kind: Negotiation['kind']) => {
    let result: Negotiation | string = '';
    mutate((s) => {
      result = startNegotiation(s, player.id, kind);
    });
    if (typeof result === 'string') setNote(result);
    else push({ kind: 'negotiation', id: (result as Negotiation).id });
  };

  return (
    <>
      {note && <div className="card card__body small">{note}</div>}
      <Card title="영입 정보" padded>
        <Kv k="예상 이적료" v={player.clubId ? (knowledgeOf(state, player) >= 30 ? formatMoney(asking) : '?') : '없음 (자유계약)'} />
        <Kv k="현재 주급" v={player.contract ? formatMoney(player.contract.wage) : '-'} />
        <Kv k="계약 만료" v={player.contract ? `${player.contract.expires + 1}년 6월` : '-'} />
        {player.contract?.releaseClause && <Kv k="바이아웃" v={formatMoney(player.contract.releaseClause)} />}
        <Kv k="이적시장" v={open ? '열림' : '닫힘'} />
        <div className="grid2" style={{ marginTop: 10 }}>
          {player.clubId ? (
            <>
              <button type="button" className="btn btn--primary" disabled={!open} onClick={() => negotiate('transfer')}>
                이적 제안
              </button>
              <button type="button" className="btn" disabled={!open} onClick={() => negotiate('loan')}>
                임대 제안
              </button>
            </>
          ) : (
            <button type="button" className="btn btn--primary" style={{ gridColumn: 'span 2' }} onClick={() => negotiate('free')}>
              계약 제안
            </button>
          )}
          <button type="button" className={`btn${listed ? ' btn--blue' : ''}`} onClick={() => mutate((s) => (s.shortlist = listed ? s.shortlist.filter((x) => x !== player.id) : [...s.shortlist, player.id]))}>
            {listed ? '관심 목록 해제' : '관심 목록 추가'}
          </button>
          <button type="button" className="btn" onClick={() => setPickScout(true)} disabled={scouts.length === 0}>
            스카우트 파견
          </button>
        </div>
      </Card>
      {pickScout && (
        <Sheet title="스카우트 선택" onClose={() => setPickScout(false)}>
          {scouts.map((s) => {
            const busy = state.assignments.find((a) => a.staffId === s.id);
            return (
              <button
                key={s.id}
                type="button"
                className="list-row"
                onClick={() => {
                  mutate((st) => assign(st, s.id, { type: 'player', playerId: player.id }, 10));
                  setPickScout(false);
                  setNote(`${s.name} 스카우트가 ${player.name}을(를) 관찰하러 떠났습니다. 며칠 뒤 보고서가 도착합니다.`);
                }}
              >
                <span className="list-row__main">
                  <span className="list-row__title" style={{ display: 'block' }}>{s.name}</span>
                  <span className="list-row__meta">능력 {s.ability}/20 {busy ? '· 현재 임무를 취소하고 이동' : '· 대기 중'}</span>
                </span>
              </button>
            );
          })}
        </Sheet>
      )}
    </>
  );
}
