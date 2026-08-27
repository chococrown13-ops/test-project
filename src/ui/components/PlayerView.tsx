import { useState } from 'react';
import {
  ATTRIBUTE_BY_KEY, ATTRIBUTE_GROUP_LABELS, FOOT_LABELS, GROUP_KEYS, POSITION_GROUP_LABELS,
  ROLE_LABELS, attributeTone, familiarityLabel, preferredFoot, visibleGroups,
  type AttributeGroup, type Role,
} from '../../game/attributes';
import { PERSONALITY_BY_ID } from '../../game/player';
import { depthOf, potentialRange, potentialStars, revealRange } from '../../game/scouting';
import { approachEstimate } from '../../game/clients';
import { formatMoney } from '../../game/engine';
import { COUNTRY_BY_ID, leagueName } from '../../data/countries';
import { AI_AGENT_NAMES } from '../../game/world';
import { seasonLabel, type GameState, type Player } from '../../game/types';
import { useGame, useGameState } from '../../store/useGame';
import { Btn, Card, Chip, Crest, Empty, KV, Meter, Sheet, Stat, Stepper } from './common';

export function positionSummary(player: Player): string {
  const roles = (Object.entries(player.positions) as Array<[Role, number]>)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([role]) => role);
  return roles.join(' / ');
}

export function clubName(state: GameState, clubId: string | null): string {
  if (!clubId) return '무소속';
  return state.clubs[clubId]?.name ?? '무소속';
}

/** 목록에 쓰는 한 줄. 오른쪽에 임의의 요약을 붙일 수 있습니다. */
export function PlayerRow({ playerId, right, onClick }: {
  playerId: string; right?: React.ReactNode; onClick?: () => void;
}) {
  const state = useGameState();
  const openPlayer = useGame((s) => s.openPlayer);
  const player = state.players[playerId];
  if (!player) return null;
  const club = player.clubId ? state.clubs[player.clubId] : null;
  const isClient = Boolean(state.clients[playerId]);

  return (
    <button type="button" className="prow" onClick={onClick ?? (() => openPlayer(playerId))}>
      {club
        ? <Crest color={club.color} accent={club.accent} label={club.shortName} />
        : <span className="crest crest--free">FA</span>}
      <span className="prow__main">
        <span className="prow__name">
          {player.name}
          {isClient && <span className="prow__tag">의뢰인</span>}
        </span>
        <span className="prow__meta">
          {player.bestRole} · {player.age}세 · {player.nationality} · {club?.name ?? '무소속'}
        </span>
      </span>
      <span className="prow__right">{right ?? formatMoney(player.value)}</span>
    </button>
  );
}

function Stars({ value, range }: { value: number; range?: [number, number] }) {
  const label = range && range[0] !== range[1]
    ? `${range[0].toFixed(1)} – ${range[1].toFixed(1)}`
    : value.toFixed(1);
  return <span className="stars">{'★'.repeat(Math.round(value))}<span className="stars__num">{label}</span></span>;
}

function AttributeGrid({ player, depth, group }: { player: Player; depth: number; group: AttributeGroup }) {
  return (
    <div className="attrs">
      <h4 className="attrs__title">{ATTRIBUTE_GROUP_LABELS[group]}</h4>
      <div className="attrs__grid">
        {GROUP_KEYS[group].map((key) => {
          const value = player.attributes[key];
          const [low, high] = revealRange(value, depth);
          const exact = low === high;
          return (
            <div key={key} className="attr">
              <span className="attr__label">{ATTRIBUTE_BY_KEY[key].label}</span>
              <span className={`attr__value attr__value--${attributeTone(value)}${exact ? '' : ' attr__value--fuzzy'}`}>
                {exact ? value : `${low}–${high}`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 선수 상세 — 능력치, 계약, 기록, 수상, 그리고 에이전트로서 취할 수 있는 행동. */
export function PlayerSheet({ playerId }: { playerId: string }) {
  const state = useGameState();
  const { openPlayer, openClub, scoutFocus, shortlist, approach, dropClient, startDeal } = useGame();
  const [commission, setCommission] = useState(8);

  const player = state.players[playerId];
  const depth = depthOf(state, playerId);
  const client = state.clients[playerId];
  if (!player) return null;
  const estimate = approachEstimate(state, player, commission);
  const club = player.clubId ? state.clubs[player.clubId] : null;
  const country = club ? COUNTRY_BY_ID[club.countryId] : null;
  const foot = preferredFoot(player.footLeft, player.footRight);
  const personality = PERSONALITY_BY_ID[player.personality];
  const isKeeper = player.group === 'GK';
  const inNegotiation = state.negotiations.some((n) => n.playerId === playerId);
  const onShortlist = state.scouting.shortlist.includes(playerId);
  const [paLow, paHigh] = potentialRange(player, depth);

  return (
    <Sheet
      title={player.name}
      subtitle={`${ROLE_LABELS[player.bestRole]} · ${player.age}세 · ${club?.name ?? '무소속'}`}
      onClose={() => openPlayer(null)}
      footer={
        <div className="sheet__actions">
          <Btn small variant="ghost" onClick={() => shortlist(playerId)}>
            {onShortlist ? '관심 해제' : '관심 등록'}
          </Btn>
          <Btn small onClick={() => scoutFocus(playerId)} disabled={depth >= 100}>
            집중 관찰 {depth >= 100 ? '완료' : '(8p)'}
          </Btn>
          {client
            ? <Btn small variant="danger" onClick={() => dropClient(playerId)}>계약 해지</Btn>
            : <Btn small variant="primary" onClick={() => approach(playerId, commission)}>영입 제안</Btn>}
        </div>
      }
    >
      <Card title="프로필">
        <div className="stat-row">
          <Stat label="현재 능력" value={<Stars value={potentialStars(player.ca)} />} />
          <Stat label="잠재 능력" value={<Stars value={potentialStars(player.pa)} range={[paLow, paHigh]} />} />
          <Stat label="파악도" value={`${Math.round(depth)}%`} />
        </div>
        <KV k="주발" v={<><strong>{FOOT_LABELS[foot]}</strong> <span className="faint">왼 {player.footLeft} · 오른 {player.footRight}</span></>} />
        <KV k="국적" v={player.secondNationality ? `${player.nationality} / ${player.secondNationality}` : player.nationality} />
        <KV k="신체" v={`${player.height}cm · ${player.weight}kg`} />
        <KV k="포지션군" v={POSITION_GROUP_LABELS[player.group]} />
        <KV k="성격" v={<span title={personality.note}>{personality.label}</span>} />
        <p className="faint small">{personality.note}</p>
      </Card>

      <Card title="포지션 숙련도">
        <div className="chips">
          {(Object.entries(player.positions) as Array<[Role, number]>)
            .sort((a, b) => b[1] - a[1])
            .map(([role, rating]) => (
              <Chip key={role}>{role} · {familiarityLabel(rating)}</Chip>
            ))}
        </div>
      </Card>

      <Card title="능력치" action={depth < 100 ? <span className="faint small">파악도가 낮아 범위로 표시됩니다</span> : null}>
        {visibleGroups(isKeeper).map((group) => (
          <AttributeGrid key={group} player={player} depth={depth} group={group} />
        ))}
      </Card>

      <Card title="컨디션">
        <Meter label="사기" value={player.morale} />
        <Meter label="폼" value={player.form} />
        <Meter label="체력" value={player.fitness} />
        {player.injuredWeeks > 0 && <p className="bad">부상 — 약 {player.injuredWeeks}주 결장</p>}
      </Card>

      <Card title="계약">
        {player.contract && club ? (
          <>
            <KV k="구단" v={<button type="button" className="linkish" onClick={() => openClub(club.id)}>{club.name}</button>} />
            <KV k="리그" v={country ? leagueName(country, club.tier) : '-'} />
            <KV k="주급" v={`${player.contract.wage.toFixed(1)}k / 주`} />
            <KV k="계약 만료" v={seasonLabel(player.contract.expires)} />
            <KV k="바이아웃" v={player.contract.releaseClause ? formatMoney(player.contract.releaseClause) : '없음'} />
            <KV k="추정 가치" v={formatMoney(player.value)} />
            <KV
              k="대리인"
              v={player.agentId === 'you' ? '나' : player.agentId ? AI_AGENT_NAMES[player.agentId] ?? '타 에이전트' : '없음'}
              tone={player.agentId === 'you' ? 'good' : undefined}
            />
          </>
        ) : (
          <>
            <KV k="상태" v="자유계약 선수" tone="good" />
            <KV k="추정 가치" v={formatMoney(player.value)} />
          </>
        )}
      </Card>

      {!client && (
        <Card title="영입 제안">
          <p className="faint small">
            수수료를 낮게 부를수록 받아들일 확률이 높지만, 앞으로 들어올 돈이 줄어듭니다.
          </p>
          <Stepper value={commission} onChange={setCommission} step={0.5} min={1} max={20} format={(v) => `${v}%`} />
          <KV k="성사 확률" v={`${Math.round(estimate.chance * 100)}%`} tone={estimate.chance > 0.5 ? 'good' : 'bad'} />
          <ul className="reasons">
            {estimate.reasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        </Card>
      )}

      {client && (
        <Card title="대리인 계약">
          <Meter label="신뢰" value={client.trust} />
          <KV k="수수료율" v={`${client.commissionPct}%`} />
          <KV k="계약 기간" v={`${seasonLabel(client.since)} ~ ${seasonLabel(client.until)}`} />
          {!inNegotiation && (
            <div className="sheet__actions">
              {club && (
                <Btn small onClick={() => startDeal(playerId, club.id, 'renewal')}>재계약 협상</Btn>
              )}
            </div>
          )}
          {inNegotiation && <p className="faint small">이미 협상이 진행 중입니다.</p>}
        </Card>
      )}

      <Card title="이번 시즌">
        <div className="stat-row">
          <Stat label="출전" value={player.season.apps + player.season.subApps} />
          <Stat label="골" value={player.season.goals} />
          <Stat label="도움" value={player.season.assists} />
          <Stat
            label="평점"
            value={player.season.apps > 0 ? (player.season.ratingSum / player.season.apps).toFixed(2) : '-'}
          />
        </div>
        {isKeeper && <KV k="클린시트" v={player.season.cleanSheets} />}
        <KV k="출전 시간" v={`${player.season.minutes.toLocaleString()}분`} />
        <KV k="경고 / 퇴장" v={`${player.season.yellow} / ${player.season.red}`} />
      </Card>

      <Card title="통산">
        <div className="stat-row">
          <Stat label="시즌" value={player.career.seasons} />
          <Stat label="출전" value={player.career.apps} />
          <Stat label="골" value={player.career.goals} />
          <Stat label="도움" value={player.career.assists} />
        </div>
        <KV k="우승" v={`${player.career.trophies}회`} />
      </Card>

      <Card title="수상 · 우승 이력">
        {player.honours.length === 0
          ? <Empty>아직 이력이 없습니다.</Empty>
          : (
            <ul className="honours">
              {player.honours.slice().reverse().map((honour, i) => (
                <li key={`${honour.season}-${honour.label}-${i}`}>
                  <span className="honours__season">{seasonLabel(honour.season)}</span>
                  <span>{honour.label}</span>
                </li>
              ))}
            </ul>
          )}
      </Card>
    </Sheet>
  );
}
