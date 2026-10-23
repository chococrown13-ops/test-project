import { useState } from 'react';
import { bestPosition, caStars } from '../../game/ability';
import { FORMATIONS, FORMATION_HINT, FORMATION_IDS, POS_LABEL, type FormationId } from '../../game/formations';
import { ROLE_BY_ID, roleScore, roleStars, rolesFor, type Role } from '../../game/roles';
import {
  MENTALITIES,
  MENTALITY_LABEL,
  PRESETS,
  autoSelect,
  available,
  changeIpFormation,
  changeOopFormation,
  lineupIssues,
  makeTactic,
  slotFit,
} from '../../game/tactics';
import type { IpInstructions, OopInstructions, Player, Tactic } from '../../game/types';
import { useGame, useStore } from '../../store';
import { Card, Meter, Seg, Sheet, Stars } from '../kit';
import { readableOn } from '../match2d/director';

type View = 'ip' | 'oop' | 'visual';

export function TacticsScreen({ compact }: { compact?: boolean }) {
  const state = useGame();
  const mutate = useStore((s) => s.mutate);
  const [view, setView] = useState<View>('ip');
  const [slot, setSlot] = useState<number | null>(null);
  const [presets, setPresets] = useState(false);
  const club = state.clubs[state.clubId];
  const tactic = club.tactic;
  const issues = lineupIssues(club, state.players);

  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <Seg<View>
          value={view}
          onChange={setView}
          options={[
            { value: 'ip', label: '공격 시 (IP)' },
            { value: 'oop', label: '수비 시 (OOP)' },
            { value: 'visual', label: '비주얼라이저' },
          ]}
        />
      </div>

      {issues.length > 0 && (
        <div className="card card__body small warn" style={{ marginBottom: 10 }}>
          {issues.slice(0, 2).join(' · ')}
        </div>
      )}

      {view === 'visual' ? (
        <Visualiser tactic={tactic} />
      ) : (
        <>
          <ShapePitch tactic={tactic} phase={view} selected={slot} onSlot={setSlot} />
          <FormationPicker
            value={view === 'ip' ? tactic.ipFormation : tactic.oopFormation}
            onChange={(f) => mutate((s) => (view === 'ip' ? changeIpFormation(s.clubs[s.clubId].tactic, f) : changeOopFormation(s.clubs[s.clubId].tactic, f)))}
          />
        </>
      )}

      {!compact && (
        <div className="row" style={{ margin: '10px 0' }}>
          <button type="button" className="btn btn--sm" onClick={() => mutate((s) => autoSelect(s.clubs[s.clubId], s.players))}>
            자동 선발
          </button>
          <button type="button" className="btn btn--sm" onClick={() => setPresets(true)}>
            전술 프리셋
          </button>
          <span className="spacer" />
          <span className="tiny muted">이해도</span>
          <Meter value={tactic.familiarity} width={60} />
        </div>
      )}

      <Bench tactic={tactic} selected={slot} onDone={() => setSlot(null)} />

      {view !== 'oop' && <IpPanel tactic={tactic} />}
      {view !== 'ip' && <OopPanel tactic={tactic} />}
      {!compact && <SetPieces tactic={tactic} />}

      {slot !== null && <SlotSheet slot={slot} phase={view === 'oop' ? 'oop' : 'ip'} onClose={() => setSlot(null)} />}
      {presets && (
        <Sheet title="전술 프리셋" onClose={() => setPresets(false)}>
          <p className="small muted" style={{ marginTop: 0 }}>프리셋을 불러오면 포메이션·역할·지시가 바뀌고 전술 이해도가 떨어집니다. 선발 명단은 자동으로 다시 짭니다.</p>
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              className="list-row"
              onClick={() => {
                mutate((s) => {
                  const c = s.clubs[s.clubId];
                  const fam = c.tactic.familiarity;
                  c.tactic = makeTactic(p);
                  c.tactic.familiarity = Math.min(fam, 50);
                  autoSelect(c, s.players);
                });
                setPresets(false);
              }}
            >
              <span className="list-row__main">
                <span className="list-row__title" style={{ display: 'block' }}>{p.name}</span>
                <span className="list-row__meta">
                  공격 {p.ipFormation} · 수비 {p.oopFormation} · {MENTALITY_LABEL[p.mentality]}
                </span>
                <span className="tiny muted" style={{ display: 'block', whiteSpace: 'normal' }}>{p.description}</span>
              </span>
            </button>
          ))}
        </Sheet>
      )}
    </>
  );
}

function surname(name: string): string {
  const parts = name.split(' ');
  return parts.length > 1 ? parts[parts.length - 1] : name.length > 2 ? name.slice(1) : name;
}

/** The pitch for one phase: IP slots, or every player's paired OOP slot. */
function ShapePitch({ tactic, phase, selected, onSlot }: { tactic: Tactic; phase: 'ip' | 'oop'; selected: number | null; onSlot: (i: number) => void }) {
  const state = useGame();
  const club = state.clubs[state.clubId];
  const ip = FORMATIONS[tactic.ipFormation];
  const oop = FORMATIONS[tactic.oopFormation];
  return (
    <div className="pitch">
      <div className="pitch__lines" />
      <div className="pitch__circle" />
      <div className="pitch__box pitch__box--top" />
      <div className="pitch__box pitch__box--bottom" />
      {ip.map((ipSlot, i) => {
        const point = phase === 'ip' ? ipSlot : oop[tactic.oopOf[i]];
        const id = tactic.lineup[i];
        const p = id ? state.players[id] : null;
        const role = ROLE_BY_ID[phase === 'ip' ? tactic.ipRoles[i] : tactic.oopRoles[tactic.oopOf[i]]];
        const keeper = point.pos === 'GK';
        const fill = keeper ? '#f4cf57' : club.primary;
        return (
          <button
            key={i}
            type="button"
            className={`slot${selected === i ? ' slot--selected' : ''}`}
            style={{ left: `${point.x}%`, top: `${100 - point.y * 0.92 - 4}%` }}
            onClick={() => onSlot(i)}
          >
            <span className={`slot__shirt${p ? '' : ' slot__shirt--empty'}`} style={{ background: fill, color: readableOn(fill) }}>
              {POS_LABEL[point.pos]}
            </span>
            <span className="slot__name">{p ? surname(p.name) : '비어 있음'}</span>
            <span className="slot__role">{role?.name ?? '-'}</span>
          </button>
        );
      })}
    </div>
  );
}

function FormationPicker({ value, onChange }: { value: FormationId; onChange: (f: FormationId) => void }) {
  return (
    <>
      <div className="subtabs" style={{ marginBottom: 4 }}>
        {FORMATION_IDS.map((f) => (
          <button key={f} type="button" className={`chip chip--small${value === f ? ' chip--on' : ''}`} onClick={() => onChange(f)}>
            {f}
          </button>
        ))}
      </div>
      {FORMATION_HINT[value] && <p className="tiny muted" style={{ margin: '0 2px 8px' }}>{FORMATION_HINT[value]}</p>}
    </>
  );
}

function Bench({ tactic, selected, onDone }: { tactic: Tactic; selected: number | null; onDone: () => void }) {
  const state = useGame();
  const mutate = useStore((s) => s.mutate);
  const push = useStore((s) => s.push);
  const club = state.clubs[state.clubId];
  const others = club.playerIds.filter((id) => !tactic.lineup.includes(id) && !tactic.bench.includes(id));
  return (
    <Card title={`교체 명단 ${tactic.bench.length}/9`}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 10 }}>
        {tactic.bench.length === 0 && <span className="tiny faint">교체 선수가 없습니다.</span>}
        {[...tactic.bench, ...others].map((id) => {
          const p = state.players[id];
          if (!p) return null;
          const onBench = tactic.bench.includes(id);
          return (
            <button
              key={id}
              type="button"
              className={`chip chip--small${onBench ? '' : ' faint'}`}
              style={{ opacity: available(p) ? 1 : 0.45 }}
              onClick={() => {
                if (selected === null) {
                  push({ kind: 'player', id });
                  return;
                }
                mutate((s) => {
                  const t = s.clubs[s.clubId].tactic;
                  const out = t.lineup[selected];
                  t.lineup[selected] = id;
                  t.bench = t.bench.filter((x) => x !== id);
                  if (out && t.bench.length < 9) t.bench.push(out);
                });
                onDone();
              }}
            >
              {POS_LABEL[bestPosition(p)]} {surname(p.name)}
              {!onBench && ' (명단 외)'}
              {p.injury && ' ✚'}
            </button>
          );
        })}
      </div>
      <p className="tiny faint" style={{ margin: '0 12px 10px' }}>
        경기장 위 선수를 누른 뒤 여기서 선수를 고르면 교체됩니다. 아무것도 선택하지 않고 누르면 선수 정보를 봅니다.
      </p>
    </Card>
  );
}

function SlotSheet({ slot, phase, onClose }: { slot: number; phase: 'ip' | 'oop'; onClose: () => void }) {
  const state = useGame();
  const mutate = useStore((s) => s.mutate);
  const push = useStore((s) => s.push);
  const club = state.clubs[state.clubId];
  const tactic = club.tactic;
  const ipSlot = FORMATIONS[tactic.ipFormation][slot];
  const oopIndex = tactic.oopOf[slot];
  const oopSlot = FORMATIONS[tactic.oopFormation][oopIndex];
  const current = tactic.lineup[slot] ? state.players[tactic.lineup[slot]!] : null;
  const [tab, setTab] = useState<'player' | 'ip' | 'oop'>(phase === 'oop' ? 'oop' : 'ip');

  const candidates = club.playerIds
    .map((id) => state.players[id])
    .filter((p): p is Player => !!p)
    .map((p) => ({ p, fit: slotFit(p, tactic, slot) }))
    .sort((a, b) => b.fit - a.fit);
  const maxFit = candidates[0]?.fit ?? 1;

  const roleList = (which: 'ip' | 'oop') => rolesFor(which === 'ip' ? ipSlot.pos : oopSlot.pos, which);
  const roleRow = (role: Role, which: 'ip' | 'oop') => {
    const selectedRole = which === 'ip' ? tactic.ipRoles[slot] : tactic.oopRoles[oopIndex];
    return (
      <button
        key={role.id}
        type="button"
        className="list-row"
        style={role.id === selectedRole ? { background: 'rgba(59,227,162,0.08)' } : undefined}
        onClick={() =>
          mutate((s) => {
            const t = s.clubs[s.clubId].tactic;
            if (which === 'ip') t.ipRoles[slot] = role.id;
            else t.oopRoles[oopIndex] = role.id;
          })
        }
      >
        <span className="list-row__main">
          <span className="list-row__title" style={{ display: 'block' }}>
            {role.id === selectedRole ? '✓ ' : ''}
            {role.name}
          </span>
          <span className="tiny muted" style={{ display: 'block', whiteSpace: 'normal' }}>{role.description}</span>
        </span>
        {current && <Stars value={roleStars(roleScore(current.attrs, role))} />}
      </button>
    );
  };

  return (
    <Sheet title={`${POS_LABEL[ipSlot.pos]} (공격) / ${POS_LABEL[oopSlot.pos]} (수비)`} onClose={onClose}>
      <div style={{ marginBottom: 10 }}>
        <Seg
          value={tab}
          onChange={setTab}
          options={[
            { value: 'player', label: '선수' },
            { value: 'ip', label: '공격 역할' },
            { value: 'oop', label: '수비 역할' },
          ]}
        />
      </div>
      {current && (
        <button type="button" className="small" style={{ color: 'var(--blue)', fontWeight: 700, marginBottom: 6 }} onClick={() => push({ kind: 'player', id: current.id })}>
          현재: {current.name} ›
        </button>
      )}
      {tab === 'player' && (
        <div className="card">
          {candidates.map(({ p, fit }) => {
            const inXI = tactic.lineup.indexOf(p.id);
            return (
              <button
                key={p.id}
                type="button"
                className="list-row"
                disabled={!available(p)}
                style={{ opacity: available(p) ? 1 : 0.45 }}
                onClick={() => {
                  mutate((s) => {
                    const t = s.clubs[s.clubId].tactic;
                    const prev = t.lineup[slot];
                    if (inXI >= 0) t.lineup[inXI] = prev;
                    else {
                      t.bench = t.bench.filter((x) => x !== p.id);
                      if (prev && t.bench.length < 9) t.bench.push(prev);
                    }
                    t.lineup[slot] = p.id;
                  });
                  onClose();
                }}
              >
                <span className="pos pos--MID" style={{ background: 'var(--raised)', color: 'var(--dim)' }}>{POS_LABEL[bestPosition(p)]}</span>
                <span className="list-row__main">
                  <span className="list-row__title" style={{ display: 'block' }}>
                    {p.name} {p.injury ? '✚' : ''}
                  </span>
                  <span className="list-row__meta">
                    <span>{inXI >= 0 ? `선발 (${POS_LABEL[FORMATIONS[tactic.ipFormation][inXI].pos]})` : tactic.bench.includes(p.id) ? '교체' : '명단 외'}</span>
                    <span>체력 {Math.round(p.condition)}%</span>
                    <span>능력 {caStars(p.ca)}★</span>
                  </span>
                </span>
                <Stars value={Math.max(0.5, Math.round((fit / maxFit) * 10) / 2)} />
              </button>
            );
          })}
        </div>
      )}
      {tab === 'ip' && <div className="card">{roleList('ip').map((r) => roleRow(r, 'ip'))}</div>}
      {tab === 'oop' && <div className="card">{roleList('oop').map((r) => roleRow(r, 'oop'))}</div>}
      <p className="tiny faint">별점은 현재 선수의 능력치가 그 역할에 얼마나 맞는지 보여줍니다. 선수 탭의 별점은 이 자리(공격·수비 역할 모두)에 대한 적합도입니다.</p>
    </Sheet>
  );
}

function Opt<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="field">
      <div className="field__label">{label}</div>
      <Seg value={value} onChange={onChange} options={options.map(([v, l]) => ({ value: v, label: l }))} />
    </div>
  );
}

function IpPanel({ tactic }: { tactic: Tactic }) {
  const mutate = useStore((s) => s.mutate);
  const set = (patch: Partial<IpInstructions>) => mutate((s) => Object.assign(s.clubs[s.clubId].tactic.ip, patch));
  return (
    <Card title="공격 시 지시 (In Possession)" padded>
      <div className="field">
        <div className="field__label">팀 성향 (멘탈리티)</div>
        <select className="select" id="mentality" value={tactic.mentality} onChange={(e) => mutate((s) => (s.clubs[s.clubId].tactic.mentality = e.target.value as Tactic['mentality']))}>
          {MENTALITIES.map((m) => (
            <option key={m} value={m}>
              {MENTALITY_LABEL[m]}
            </option>
          ))}
        </select>
      </div>
      <Opt label="템포" value={tactic.ip.tempo} onChange={(tempo) => set({ tempo })} options={[['slow', '느리게'], ['normal', '보통'], ['fast', '빠르게']]} />
      <Opt label="패스 길이" value={tactic.ip.passing} onChange={(passing) => set({ passing })} options={[['short', '짧게'], ['mixed', '혼합'], ['direct', '직선적']]} />
      <Opt label="공격 폭" value={tactic.ip.width} onChange={(width) => set({ width })} options={[['narrow', '좁게'], ['normal', '보통'], ['wide', '넓게']]} />
      <Opt label="파이널 서드" value={tactic.ip.finalThird} onChange={(finalThird) => set({ finalThird })} options={[['workIntoBox', '박스까지 연결'], ['mixed', '혼합'], ['shootOnSight', '보이면 슈팅']]} />
      <Opt label="공을 빼앗았을 때" value={tactic.ip.transition} onChange={(transition) => set({ transition })} options={[['counter', '즉시 역습'], ['patient', '천천히 정비']]} />
    </Card>
  );
}

function OopPanel({ tactic }: { tactic: Tactic }) {
  const mutate = useStore((s) => s.mutate);
  const set = (patch: Partial<OopInstructions>) => mutate((s) => Object.assign(s.clubs[s.clubId].tactic.oop, patch));
  return (
    <Card title="수비 시 지시 (Out of Possession)" padded>
      <Opt label="압박 시작 위치" value={tactic.oop.engagement} onChange={(engagement) => set({ engagement })} options={[['low', '낮게'], ['mid', '중간'], ['high', '높게']]} />
      <Opt label="수비 라인" value={tactic.oop.line} onChange={(line) => set({ line })} options={[['deep', '깊게'], ['normal', '보통'], ['high', '높게']]} />
      <Opt label="압박 강도" value={tactic.oop.press} onChange={(press) => set({ press })} options={[['less', '약하게'], ['normal', '보통'], ['more', '강하게']]} />
      <Opt label="태클" value={tactic.oop.tackling} onChange={(tackling) => set({ tackling })} options={[['stayOnFeet', '서서 막기'], ['normal', '보통'], ['aggressive', '거칠게']]} />
      <Opt label="공을 잃었을 때" value={tactic.oop.transition} onChange={(transition) => set({ transition })} options={[['counterpress', '즉시 재압박'], ['regroup', '대열 정비']]} />
    </Card>
  );
}

function SetPieces({ tactic }: { tactic: Tactic }) {
  const state = useGame();
  const mutate = useStore((s) => s.mutate);
  const xi = tactic.lineup.filter((id): id is string => !!id).map((id) => state.players[id]).filter(Boolean);
  const pick = (label: string, key: 'captain' | 'penaltyTaker' | 'setPieceTaker') => (
    <div className="field">
      <div className="field__label">{label}</div>
      <select className="select" value={tactic[key] ?? ''} onChange={(e) => mutate((s) => (s.clubs[s.clubId].tactic[key] = e.target.value || null))}>
        <option value="">자동</option>
        {xi.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
  return (
    <Card title="주장·키커" padded>
      {pick('주장', 'captain')}
      {pick('페널티 키커', 'penaltyTaker')}
      {pick('코너킥·프리킥 키커', 'setPieceTaker')}
    </Card>
  );
}

/* --------------------------------------------------------------- visualiser */

type Third = 'def' | 'mid' | 'att';

/**
 * FM26's Visualiser: where everyone stands with and without the ball as play
 * moves through the thirds. Shapes come from the two formations plus each
 * role's push (advance/drop) and width.
 */
function Visualiser({ tactic }: { tactic: Tactic }) {
  const state = useGame();
  const club = state.clubs[state.clubId];
  const [phase, setPhase] = useState<'ip' | 'oop'>('ip');
  const [third, setThird] = useState<Third>('mid');
  const ip = FORMATIONS[tactic.ipFormation];
  const oop = FORMATIONS[tactic.oopFormation];
  const lineShift = { def: -16, mid: 0, att: 16 }[third];
  const engagement = { low: -8, mid: 0, high: 8 }[tactic.oop.engagement];
  const lineHeight = { deep: -5, normal: 0, high: 6 }[tactic.oop.line];

  const points = ip.map((ipSlot, i) => {
    const base = phase === 'ip' ? ipSlot : oop[tactic.oopOf[i]];
    const role = ROLE_BY_ID[phase === 'ip' ? tactic.ipRoles[i] : tactic.oopRoles[tactic.oopOf[i]]];
    if (base.pos === 'GK') return { x: 50, y: 5 + (phase === 'ip' && third === 'att' ? 6 : 0) };
    let y = base.y;
    let x = base.x;
    if (phase === 'ip') {
      const b = role?.ip;
      y += (b?.advance ?? 0) * 100 * (third === 'def' ? 0.4 : 1) + lineShift * (0.6 + base.y / 160);
      const width = { narrow: -6, normal: 0, wide: 6 }[tactic.ip.width];
      x = 50 + (x - 50) * (1 + width / 50);
      if (b) x += b.width < 0 ? (50 - x) * -b.width * 0.45 : (x < 50 ? -1 : 1) * b.width * 2;
    } else {
      const b = role?.oop;
      // Out of possession the block shifts with the ball but stays compact.
      y = y * 0.85 + (b?.drop ?? 0) * 100 + lineShift * 0.55 + engagement * (base.y / 100) + lineHeight * (1 - base.y / 100);
      if (b && b.outlet > 0.6) y += 10;
      x = 50 + (x - 50) * 0.85;
    }
    return { x: Math.max(8, Math.min(92, x)), y: Math.max(8, Math.min(95, y)) };
  });
  const ball = { def: 22, mid: 50, att: 80 }[third];

  return (
    <>
      <div className="row" style={{ marginBottom: 8 }}>
        <Seg
          value={phase}
          onChange={setPhase}
          options={[
            { value: 'ip', label: '공 소유' },
            { value: 'oop', label: '공 없음' },
          ]}
        />
      </div>
      <div className="pitch">
        <div className="pitch__lines" />
        <div className="pitch__circle" />
        <div className="pitch__box pitch__box--top" />
        <div className="pitch__box pitch__box--bottom" />
        <div className="pitch__third" style={{ top: '33%' }} />
        <div className="pitch__third" style={{ top: '66%' }} />
        <div className="ball-marker" style={{ left: '55%', top: `${100 - ball}%` }} />
        {points.map((pt, i) => {
          const id = tactic.lineup[i];
          const p = id ? state.players[id] : null;
          const keeper = ip[i].pos === 'GK';
          const fill = keeper ? '#f4cf57' : club.primary;
          return (
            <div key={i} className="slot" style={{ left: `${pt.x}%`, top: `${100 - pt.y}%` }}>
              <span className="slot__shirt" style={{ background: fill, color: readableOn(fill), width: 26, height: 26, fontSize: 10 }}>
                {i + 1}
              </span>
              <span className="slot__name">{p ? surname(p.name) : ''}</span>
            </div>
          );
        })}
      </div>
      <div style={{ marginBottom: 12 }}>
        <Seg
          value={third}
          onChange={setThird}
          options={[
            { value: 'def', label: '수비 1/3' },
            { value: 'mid', label: '중원 1/3' },
            { value: 'att', label: '공격 1/3' },
          ]}
        />
      </div>
      <p className="tiny muted" style={{ marginTop: -4 }}>
        공의 위치와 소유 여부에 따라 팀 형태가 어떻게 바뀌는지 보여줍니다. 역할(전진·후퇴·폭)과 수비 라인·압박 위치 지시가 반영됩니다.
      </p>
    </>
  );
}
