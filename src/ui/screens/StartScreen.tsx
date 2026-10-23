import { useState } from 'react';
import { CLUB_SEEDS } from '../../game/names';
import { useStore } from '../../store';
import { Seg, Stars } from '../kit';
import { readableOn } from '../match2d/director';

const DIVISION_NAMES = ['1부 · 프리미어 디비전', '2부 · 챔피언십', '3부 · 내셔널 리그'];
const DIVISION_HINT = [
  '빅클럽부터 강등권까지. 높은 기대와 큰 예산.',
  '승격을 노리는 중간 무대. 플레이오프까지 있습니다.',
  '가장 낮은 곳에서 시작하는 진짜 커리어. 예산은 빠듯합니다.',
];

export function StartScreen() {
  const start = useStore((s) => s.start);
  const [name, setName] = useState('');
  const [division, setDivision] = useState<'0' | '1' | '2'>('2');
  const [pick, setPick] = useState<number | null>(null);

  const d = Number(division);
  const clubs = CLUB_SEEDS.map((seed, index) => ({ seed, index })).slice(d * 16, d * 16 + 16);

  return (
    <div className="app">
      <div className="main" style={{ paddingBottom: 24 }}>
        <div className="start">
          <div className="start__logo">GAFFER 26</div>
          <h1 className="start__title">당신의 축구 클럽을 지휘하세요</h1>
          <p className="start__tag">
            공격 시·수비 시 이중 포메이션, 역할별 전술, 스카우팅과 영입 요청, 3단계 리그와 FA컵. 휴대폰 하나로 즐기는 풀 커리어 축구 감독 게임.
          </p>

          <div className="field">
            <div className="field__label">감독 이름</div>
            <input className="input" id="manager-name" value={name} maxLength={12} placeholder="예: 김감독" onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="field">
            <div className="field__label">시작할 리그</div>
            <Seg
              value={division}
              onChange={(v) => {
                setDivision(v);
                setPick(null);
              }}
              options={[
                { value: '0', label: '1부' },
                { value: '1', label: '2부' },
                { value: '2', label: '3부' },
              ]}
            />
            <p className="tiny muted" style={{ margin: '6px 2px 0' }}>
              {DIVISION_NAMES[d]} — {DIVISION_HINT[d]}
            </p>
          </div>

          <div className="card">
            {clubs.map(({ seed, index }, i) => {
              const strength = 5 - (i / 15) * 3.5;
              return (
                <button key={seed.short} type="button" className={`club-pick${pick === index ? ' club-pick--on' : ''}`} onClick={() => setPick(index)}>
                  <span className="crest" style={{ width: 34, height: 34, background: seed.primary, color: readableOn(seed.primary), fontSize: 10, boxShadow: `inset 0 0 0 3px ${seed.secondary}` }}>
                    {seed.short}
                  </span>
                  <span className="list-row__main">
                    <span className="list-row__title" style={{ display: 'block' }}>
                      {seed.city} {seed.nick}
                    </span>
                    <span className="tiny muted">{i < 3 ? '우승 후보' : i < 7 ? '상위권' : i < 12 ? '중위권' : '약체'}</span>
                  </span>
                  <Stars value={Math.round(strength * 2) / 2} />
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={pick === null}
            onClick={() => pick !== null && start({ managerName: name.trim() || '감독', clubIndex: pick })}
          >
            {pick === null ? '구단을 선택하세요' : `${CLUB_SEEDS[pick].city} ${CLUB_SEEDS[pick].nick} 감독으로 시작`}
          </button>
          <p className="tiny faint" style={{ textAlign: 'center', marginTop: 10 }}>
            모든 구단과 선수는 가상입니다. 진행 상황은 이 기기에 자동 저장됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
