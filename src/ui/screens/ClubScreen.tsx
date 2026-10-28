import { useState } from 'react';
import { formatMoney } from '../../game/ability';
import { confidenceLabel } from '../../game/board';
import { wageBill } from '../../game/finance';
import { STAFF_LABEL } from '../../game/generate';
import type { StaffRole } from '../../game/types';
import { useGame, useStore } from '../../store';
import { Card, Kv, Meter, Seg, Sheet, SubTabs, tone } from '../kit';

type Sub = 'finance' | 'board' | 'staff' | 'history' | 'settings';

export function ClubScreen() {
  const sub = (useStore((s) => s.subs.club) as Sub) ?? 'finance';
  const setSub = useStore((s) => s.setSub);
  return (
    <>
      <SubTabs<Sub>
        value={sub}
        onChange={(v) => setSub('club', v)}
        options={[
          { value: 'finance', label: '재정' },
          { value: 'board', label: '이사회' },
          { value: 'staff', label: '스태프' },
          { value: 'history', label: '역사' },
          { value: 'settings', label: '설정' },
        ]}
      />
      {sub === 'finance' && <Finance />}
      {sub === 'board' && <Board />}
      {sub === 'staff' && <Staff />}
      {sub === 'history' && <History />}
      {sub === 'settings' && <Settings />}
    </>
  );
}

function Finance() {
  const state = useGame();
  const mutate = useStore((s) => s.mutate);
  const club = state.clubs[state.clubId];
  const bill = wageBill(state, club);
  const shift = Math.round(club.transferBudget * 0.1);
  return (
    <>
      <Card title="재정 현황" padded>
        <Kv k="구단 잔고" v={<span className={club.balance < 0 ? 'bad' : undefined}>{formatMoney(club.balance)}</span>} />
        <Kv k="이적 예산" v={formatMoney(club.transferBudget)} />
        <Kv k="주급 지출 / 예산" v={`${formatMoney(bill)} / ${formatMoney(club.wageBudget)}`} />
        <div style={{ margin: '8px 0' }}>
          <Meter value={(bill / Math.max(1, club.wageBudget)) * 100} width={220} />
        </div>
        <Kv k="이번 시즌 수입" v={formatMoney(club.income)} />
        <Kv k="이번 시즌 지출" v={formatMoney(club.expenses)} />
        <Kv k="경기장" v={`${club.stadium} (${club.capacity.toLocaleString('ko-KR')}석)`} />
      </Card>
      <Card title="예산 조정" padded>
        <p className="small muted" style={{ marginTop: 0 }}>이적 예산 일부를 주급 예산으로 돌리거나 그 반대로 할 수 있습니다. (이적 예산 1억 ≈ 주급 예산 연간 1억)</p>
        <div className="grid2">
          <button
            type="button"
            className="btn btn--sm"
            disabled={shift <= 0}
            onClick={() =>
              mutate((s) => {
                const c = s.clubs[s.clubId];
                c.transferBudget -= shift;
                c.wageBudget += Math.round(shift / 52);
              })
            }
          >
            이적 → 주급 ({formatMoney(shift)})
          </button>
          <button
            type="button"
            className="btn btn--sm"
            disabled={club.wageBudget - bill < 10}
            onClick={() =>
              mutate((s) => {
                const c = s.clubs[s.clubId];
                const weekly = Math.round((c.wageBudget - wageBill(s, c)) * 0.5);
                c.wageBudget -= weekly;
                c.transferBudget += weekly * 52;
              })
            }
          >
            주급 → 이적
          </button>
        </div>
      </Card>
    </>
  );
}

function Board() {
  const state = useGame();
  return (
    <>
      <Card title="이사회 신뢰도" padded>
        <div className="row">
          <Meter value={state.confidence} width={200} />
          <b style={{ color: tone(state.confidence) }}>{confidenceLabel(state.confidence)}</b>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>경기 결과가 기대보다 좋으면 오르고, 리그 순위가 목표보다 낮으면 매달 떨어집니다. 바닥까지 떨어지면 경질됩니다.</p>
      </Card>
      <Card title="시즌 목표">
        {state.objectives.map((o) => (
          <div key={o.id} className="list-row" style={{ cursor: 'default' }}>
            <span className="list-row__main">
              <span className="list-row__title" style={{ display: 'block' }}>{o.label}</span>
            </span>
            <span className={o.importance === 'essential' ? 'badge badge--bad' : o.importance === 'important' ? 'badge badge--warn' : 'badge'}>
              {o.importance === 'essential' ? '필수' : o.importance === 'important' ? '중요' : '희망'}
            </span>
          </div>
        ))}
      </Card>
    </>
  );
}

const HIRE_ROLES: StaffRole[] = ['assistant', 'coach', 'gkCoach', 'fitness', 'scout', 'physio', 'youth', 'analyst'];

function Staff() {
  const state = useGame();
  const mutate = useStore((s) => s.mutate);
  const [hiring, setHiring] = useState<StaffRole | null>(null);
  const [fire, setFire] = useState<string | null>(null);
  const club = state.clubs[state.clubId];
  const staffBill = state.staff.reduce((s, x) => s + x.wage, 0);
  return (
    <>
      <Card title={`스태프 ${state.staff.length}명 · 주급 ${formatMoney(staffBill)}`}>
        {state.staff.map((s) => (
          <div key={s.id} className="list-row" style={{ cursor: 'default' }}>
            <span className="list-row__main">
              <span className="list-row__title" style={{ display: 'block' }}>{s.name}</span>
              <span className="list-row__meta">{STAFF_LABEL[s.role]} · {s.age}세 · 주급 {formatMoney(s.wage)}</span>
            </span>
            <b style={{ color: tone(s.ability * 5) }}>{s.ability}</b>
            <button type="button" className="btn btn--sm btn--danger" onClick={() => setFire(s.id)}>
              해고
            </button>
          </div>
        ))}
      </Card>
      <Card title="스태프 고용" padded>
        <div className="grid2">
          {HIRE_ROLES.map((r) => (
            <button key={r} type="button" className="btn btn--sm" onClick={() => setHiring(r)}>
              {STAFF_LABEL[r]}
            </button>
          ))}
        </div>
        <p className="tiny faint">코치는 훈련 성장, 스카우트는 정보 수집, 의무 트레이너는 부상 회복, 유스 감독은 유스 인테이크 품질에 영향을 줍니다. 주급 예산 여유: {formatMoney(Math.max(0, club.wageBudget - wageBill(state, club)))}</p>
      </Card>
      {hiring && (
        <Sheet title={`${STAFF_LABEL[hiring]} 후보`} onClose={() => setHiring(null)}>
          {state.staffPool
            .filter((s) => s.role === hiring)
            .sort((a, b) => b.ability - a.ability)
            .map((s) => (
              <div key={s.id} className="list-row" style={{ cursor: 'default' }}>
                <span className="list-row__main">
                  <span className="list-row__title" style={{ display: 'block' }}>{s.name}</span>
                  <span className="list-row__meta">{s.age}세 · 주급 {formatMoney(s.wage)}</span>
                </span>
                <b style={{ color: tone(s.ability * 5) }}>{s.ability}</b>
                <button
                  type="button"
                  className="btn btn--sm btn--primary"
                  onClick={() => {
                    mutate((st) => {
                      st.staffPool = st.staffPool.filter((x) => x.id !== s.id);
                      st.staff.push(s);
                    });
                    setHiring(null);
                  }}
                >
                  고용
                </button>
              </div>
            ))}
          {state.staffPool.filter((s) => s.role === hiring).length === 0 && <div className="empty">지금은 후보가 없습니다.</div>}
        </Sheet>
      )}
      {fire && (
        <Sheet title="해고 확인" onClose={() => setFire(null)}>
          <p className="small">해고하면 남은 계약에 대한 위약금으로 주급 12주치를 지급합니다.</p>
          <button
            type="button"
            className="btn btn--danger btn--block"
            onClick={() => {
              mutate((st) => {
                const s = st.staff.find((x) => x.id === fire);
                if (!s) return;
                st.staff = st.staff.filter((x) => x.id !== fire);
                st.assignments = st.assignments.filter((a) => a.staffId !== fire);
                st.clubs[st.clubId].balance -= s.wage * 12;
                st.staffPool.push(s);
              });
              setFire(null);
            }}
          >
            해고하기
          </button>
        </Sheet>
      )}
    </>
  );
}

function History() {
  const state = useGame();
  return (
    <Card title="감독 경력">
      {state.history.length === 0 && <div className="empty">첫 시즌을 마치면 기록이 쌓입니다.</div>}
      {state.history.map((h) => (
        <div key={h.season} className="list-row" style={{ cursor: 'default' }}>
          <span className="list-row__main">
            <span className="list-row__title" style={{ display: 'block' }}>
              {h.season} · {state.clubs[h.clubId]?.name} · {state.leagueNames[h.division]}
            </span>
            <span className="list-row__meta">
              {h.won}승 {h.drawn}무 {h.lost}패 · 승점 {h.points} · {state.cupName} {h.cup} · 득점왕 {h.topScorer}
            </span>
          </span>
          <b className={h.outcome === '승격' || h.outcome === '우승' ? 'good' : h.outcome === '강등' ? 'bad' : undefined}>{h.outcome}</b>
        </div>
      ))}
    </Card>
  );
}

function Settings() {
  const state = useGame();
  const mutate = useStore((s) => s.mutate);
  const quit = useStore((s) => s.quit);
  const [confirm, setConfirm] = useState(false);
  const club = state.clubs[state.clubId];
  return (
    <>
      <Card title="경기 하이라이트" padded>
        <Seg
          value={state.settings.highlights}
          onChange={(v) => mutate((s) => (s.settings.highlights = v))}
          options={[
            { value: 'all', label: '전체' },
            { value: 'dynamic', label: '다이내믹' },
            { value: 'key', label: '주요 장면' },
          ]}
        />
        <p className="small muted" style={{ marginBottom: 0 }}>다이내믹: 경기 중요도와 점수 차에 따라 보여줄 장면 수가 달라집니다. 큰 경기·접전일수록 많이 보여주고, 점수 차가 크면 골 위주로 보여줍니다.</p>
      </Card>
      <Card title="이름 바꾸기" padded>
        {[0, 1, 2].map((d) => (
          <div className="field" key={d}>
            <div className="field__label">{d + 1}부 리그 이름</div>
            <input className="input" id={`league-${d}`} defaultValue={state.leagueNames[d]} onBlur={(e) => mutate((s) => (s.leagueNames[d] = e.target.value.trim() || s.leagueNames[d]))} />
          </div>
        ))}
        <div className="field">
          <div className="field__label">컵 대회 이름</div>
          <input className="input" id="cup-name" defaultValue={state.cupName} onBlur={(e) => mutate((s) => (s.cupName = e.target.value.trim() || s.cupName))} />
        </div>
        <div className="field">
          <div className="field__label">우리 구단 이름</div>
          <input className="input" id="club-name" defaultValue={club.name} onBlur={(e) => mutate((s) => (s.clubs[s.clubId].name = e.target.value.trim() || club.name))} />
        </div>
      </Card>
      <Card title="게임" padded>
        <button type="button" className="btn btn--danger btn--block" onClick={() => setConfirm(true)}>
          새 게임 시작 (현재 저장 삭제)
        </button>
      </Card>
      {confirm && (
        <Sheet title="정말 새로 시작할까요?" onClose={() => setConfirm(false)}>
          <p className="small">현재 커리어 저장이 삭제됩니다. 되돌릴 수 없습니다.</p>
          <button type="button" className="btn btn--danger btn--block" onClick={() => void quit()}>
            삭제하고 새로 시작
          </button>
        </Sheet>
      )}
    </>
  );
}
