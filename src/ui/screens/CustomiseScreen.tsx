import { useState } from 'react';
import type { GameState, Team } from '../../game/types';
import { useGame } from '../../store/useGame';
import { Card, Modal } from '../components/common';

/** Shirt colours offered in the club editor. */
const PALETTE = [
  '#d92d3c', '#1e63d0', '#0f9d58', '#6b3fa0', '#e07a1f', '#0e7c86',
  '#b8912e', '#c0392b', '#2f4f8f', '#3c3c46', '#8e2f5e', '#146b3a',
  '#7a5230', '#1f5f99', '#4c6b22', '#555f6e', '#111827', '#e11d8f',
];

const ACCENTS = ['#ffffff', '#f5c518', '#1a1a1a', '#8fc0ff', '#9fd356', '#ffd9ec'];

export function CustomiseScreen({
  state,
  onDone,
}: {
  state: GameState;
  onDone: () => void;
}) {
  const setLeagueName = useGame((s) => s.setLeagueName);
  const [league, setLeague] = useState(state.leagueName);
  const [editing, setEditing] = useState<Team | null>(null);

  const teams = Object.values(state.teams);

  return (
    <>
      <Card title="리그 이름" padded>
        <input
          className="input"
          value={league}
          maxLength={24}
          onChange={(e) => setLeague(e.target.value)}
          onBlur={() => setLeagueName(league)}
        />
        <p className="tiny faint" style={{ marginBottom: 0, marginTop: 8 }}>
          순위표와 일정 화면에 표시됩니다.
        </p>
      </Card>

      <Card title={`구단 (${teams.length})`}>
        <div className="tiny faint" style={{ padding: '8px 12px 0' }}>
          구단을 탭해 이름, 약칭, 색상을 바꿉니다. 내 구단이 아니어도 편집할 수 있습니다.
        </div>
        {teams.map((team) => (
          <button
            key={team.id}
            type="button"
            className="player"
            onClick={() => setEditing(team)}
          >
            <span
              className="club-pick__crest"
              style={{ background: team.color, color: team.accent }}
            >
              {team.shortName}
            </span>
            <span className="player__main">
              <span className="player__name">
                {team.name}
                {team.id === state.clubId && (
                  <span style={{ color: 'var(--accent)' }}> · 내 구단</span>
                )}
              </span>
              <span className="player__meta">
                <span>{team.players.length}명</span>
              </span>
            </span>
            <span className="faint" style={{ fontSize: 18 }}>
              ›
            </span>
          </button>
        ))}
      </Card>

      <button type="button" className="btn btn--block" onClick={onDone}>
        돌아가기
      </button>

      {editing && (
        <TeamEditor
          team={state.teams[editing.id]}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function TeamEditor({ team, onClose }: { team: Team; onClose: () => void }) {
  const setTeamIdentity = useGame((s) => s.setTeamIdentity);
  const [name, setName] = useState(team.name);
  const [shortName, setShortName] = useState(team.shortName);
  const [color, setColor] = useState(team.color);
  const [accent, setAccent] = useState(team.accent);

  const trimmedName = name.trim();
  const trimmedShort = shortName.trim();
  const valid = trimmedName.length > 0 && trimmedShort.length >= 2;

  return (
    <Modal title="구단 편집" onClose={onClose}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
        <div
          className="scoreboard__badge"
          style={{ background: color, color: accent, width: 56, height: 56, fontSize: 15 }}
        >
          {trimmedShort.toUpperCase() || '?'}
        </div>
      </div>

      <div className="field">
        <div className="field__label">구단 이름</div>
        <input
          className="input"
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="field">
        <div className="field__label">약칭 — 2~4자</div>
        <input
          className="input"
          value={shortName}
          maxLength={4}
          onChange={(e) => setShortName(e.target.value.toUpperCase())}
        />
      </div>

      <div className="field">
        <div className="field__label">주 색상</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {PALETTE.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={swatch}
              onClick={() => setColor(swatch)}
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                background: swatch,
                border: color === swatch ? '3px solid var(--accent)' : '1px solid var(--line)',
              }}
            />
          ))}
        </div>
      </div>

      <div className="field">
        <div className="field__label">보조 색상</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {ACCENTS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={swatch}
              onClick={() => setAccent(swatch)}
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                background: swatch,
                border: accent === swatch ? '3px solid var(--accent)' : '1px solid var(--line)',
              }}
            />
          ))}
        </div>
      </div>

      {!valid && (
        <p className="tiny" style={{ color: 'var(--bad)' }}>
          이름을 입력하고 약칭은 2자 이상이어야 합니다.
        </p>
      )}

      <button
        type="button"
        className="btn btn--primary btn--block"
        disabled={!valid}
        onClick={() => {
          setTeamIdentity(team.id, {
            name: trimmedName,
            shortName: trimmedShort,
            color,
            accent,
          });
          onClose();
        }}
      >
        저장
      </button>
    </Modal>
  );
}
