import { ROLE_LABEL } from '../../game/formations';
import { overall } from '../../game/ratings';
import type { AttributeKey, Player } from '../../game/types';
import { Modal, gaugeColor } from './common';

const ATTRIBUTE_LABEL: Record<AttributeKey, string> = {
  shooting: '슈팅',
  passing: '패스',
  dribbling: '드리블',
  defending: '수비',
  physical: '피지컬',
  goalkeeping: '골키핑',
};

const money = (thousands: number): string =>
  thousands >= 1000 ? `${(thousands / 1000).toFixed(1)}M` : `${thousands}K`;

function Attr({ label, value }: { label: string; value: number }) {
  return (
    <div className="attr">
      <span className="attr__label">{label}</span>
      <span className="attr__track">
        <span className="attr__fill" style={{ width: `${value}%`, background: gaugeColor(value) }} />
      </span>
      <span className="attr__value">{value}</span>
    </div>
  );
}

export function PlayerDetail({ player, onClose }: { player: Player; onClose: () => void }) {
  const ovr = overall(player);
  const avgRating =
    player.season.appearances > 0 ? player.season.ratingSum / player.season.appearances : 0;

  // Goalkeeping is noise for outfielders, so hide it for them.
  const keys: AttributeKey[] =
    player.role === 'GK'
      ? ['goalkeeping', 'physical', 'passing', 'defending', 'dribbling', 'shooting']
      : ['shooting', 'passing', 'dribbling', 'defending', 'physical'];

  return (
    <Modal title={player.name} onClose={onClose}>
      <div className="row" style={{ marginBottom: 14, gap: 14 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1 }}>{ovr}</div>
          <div className="tiny faint">현재</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1, color: 'var(--accent)' }}>
            {player.potential}
          </div>
          <div className="tiny faint">잠재력</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {ROLE_LABEL[player.role]} · {player.age}세 · {player.nationality}
          </div>
          <div className="tiny faint" style={{ marginTop: 3 }}>
            가치 {money(player.value)} · 주급 {money(player.wage)}
          </div>
        </div>
      </div>

      <div className="attr-grid" style={{ marginBottom: 16 }}>
        {keys.map((key) => (
          <Attr key={key} label={ATTRIBUTE_LABEL[key]} value={player.attributes[key]} />
        ))}
      </div>

      <div className="field__label">컨디션</div>
      <div className="attr-grid" style={{ marginBottom: 16 }}>
        <Attr label="체력" value={Math.round(player.fitness)} />
        <Attr label="폼" value={Math.round(player.form)} />
        <Attr label="사기" value={Math.round(player.morale)} />
      </div>

      <div className="field__label">이번 시즌</div>
      <div>
        <div className="kv">
          <span className="kv__key">출전</span>
          <span className="kv__value">{player.season.appearances}경기</span>
        </div>
        <div className="kv">
          <span className="kv__key">골 / 도움</span>
          <span className="kv__value">
            {player.season.goals} / {player.season.assists}
          </span>
        </div>
        {(player.role === 'GK' || player.group === 'DF') && (
          <div className="kv">
            <span className="kv__key">클린시트</span>
            <span className="kv__value">{player.season.cleanSheets}</span>
          </div>
        )}
        <div className="kv">
          <span className="kv__key">평균 평점</span>
          <span className="kv__value" style={{ color: gaugeColor(avgRating * 10) }}>
            {avgRating > 0 ? avgRating.toFixed(2) : '-'}
          </span>
        </div>
        <div className="kv">
          <span className="kv__key">경고 / 퇴장</span>
          <span className="kv__value">
            {player.season.yellowCards} / {player.season.redCards}
          </span>
        </div>
      </div>

      {player.career.appearances > player.season.appearances && (
        <>
          <div className="field__label" style={{ marginTop: 14 }}>
            통산
          </div>
          <div className="kv">
            <span className="kv__key">출전 / 골 / 도움</span>
            <span className="kv__value">
              {player.career.appearances} / {player.career.goals} / {player.career.assists}
            </span>
          </div>
        </>
      )}
    </Modal>
  );
}
