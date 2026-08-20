import { useState } from 'react';
import { TEAM_SEEDS } from '../../game/names';
import { hasSave } from '../../game/save';
import { useGame } from '../../store/useGame';

/** Reputation 40-90 mapped onto a five-star difficulty display. */
function stars(reputation: number): string {
  const filled = Math.max(1, Math.min(5, Math.round((reputation - 38) / 11)));
  return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}

export function StartScreen() {
  const newGame = useGame((s) => s.newGame);
  const continueGame = useGame((s) => s.continueGame);
  const [name, setName] = useState('');
  // Default to a mid-table side: enough room to over- or under-achieve.
  const [clubIndex, setClubIndex] = useState(TEAM_SEEDS.length - 4);
  const saveExists = hasSave();

  return (
    <div className="start">
      <div className="start__logo">
        <div className="start__title">GAFFER</div>
        <div className="start__tag">주머니 속의 축구 감독</div>
      </div>

      {saveExists && (
        <button type="button" className="btn btn--primary btn--block" onClick={continueGame}>
          이어하기
        </button>
      )}

      <div>
        <div className="field__label">감독 이름</div>
        <input
          className="input"
          value={name}
          maxLength={16}
          placeholder="이름을 입력하세요"
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div>
        <div className="field__label">구단 선택 — 별이 적을수록 어렵습니다</div>
        <div className="club-grid">
          {TEAM_SEEDS.map((team, index) => (
            <button
              key={team.name}
              type="button"
              className={`club-pick${clubIndex === index ? ' club-pick--active' : ''}`}
              onClick={() => setClubIndex(index)}
            >
              <span
                className="club-pick__crest"
                style={{ background: team.color, color: team.accent }}
              >
                {team.shortName}
              </span>
              <span style={{ minWidth: 0 }}>
                <span className="club-pick__name">{team.name}</span>
                <span className="club-pick__stars">{stars(team.reputation)}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        className={`btn btn--block${saveExists ? '' : ' btn--primary'}`}
        onClick={() => newGame(name, `t${clubIndex}`)}
      >
        새로 시작하기
      </button>

      {saveExists && (
        <p className="tiny faint" style={{ textAlign: 'center', margin: 0 }}>
          새로 시작하면 저장된 진행 상황을 덮어씁니다.
        </p>
      )}
    </div>
  );
}
