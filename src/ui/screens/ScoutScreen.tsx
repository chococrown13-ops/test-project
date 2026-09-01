import { useState } from 'react';
import { POSITION_GROUP_LABELS, type PositionGroup } from '../../game/attributes';
import {
  DEFAULT_FILTERS, SWEEP_COST, leagueAccess, playerLeagueLabel, scoutingCeiling,
  type ScoutFilters,
} from '../../game/scouting';
import { formatMoney } from '../../game/engine';
import { useGame, useGameState } from '../../store/useGame';
import { Btn, Card, Chip, Empty, Field, KV, Meter } from '../components/common';
import { PlayerRow } from '../components/PlayerView';

const GROUPS: PositionGroup[] = ['GK', 'DF', 'MF', 'FW'];

export default function ScoutScreen() {
  const state = useGameState();
  const { scoutSweep, shortlist } = useGame();
  const [filters, setFilters] = useState<ScoutFilters>({ ...DEFAULT_FILTERS });
  const [tab, setTab] = useState<'found' | 'shortlist'>('found');

  const access = leagueAccess(state);
  const unlocked = access.filter((entry) => entry.unlocked);
  const locked = access.filter((entry) => !entry.unlocked);
  // 다음에 열릴 리그 하나만 보여 줍니다 — 목표가 하나여야 손에 잡힙니다.
  const nextUp = locked[0];

  const toggleLeague = (id: string): void => setFilters((f) => ({
    ...f,
    leagueIds: f.leagueIds.includes(id) ? f.leagueIds.filter((l) => l !== id) : [...f.leagueIds, id],
  }));
  const toggleGroup = (group: PositionGroup): void => setFilters((f) => ({
    ...f,
    groups: f.groups.includes(group) ? f.groups.filter((g) => g !== group) : [...f.groups, group],
  }));

  // 파악한 선수 목록. 최근에 본 순서가 아니라 눈에 띄는 순서로 보여 줍니다.
  const known = Object.values(state.scouting.reports)
    .map((report) => state.players[report.playerId])
    .filter((player) => player && !player.retired && !state.clients[player.id])
    .sort((a, b) => (b.pa - b.ca) * 0.6 + b.ca - ((a.pa - a.ca) * 0.6 + a.ca));

  const shortlisted = state.scouting.shortlist
    .map((id) => state.players[id])
    .filter((player) => player && !player.retired);

  return (
    <div className="screen">
      <Card title="스카우팅">
        <Meter label="포인트" value={state.scouting.points} max={140} />
        <p className="faint small">
          포인트는 매주 회복됩니다. 훑기 한 번에 {SWEEP_COST}p, 한 선수를 집중 관찰하면 8p 가 듭니다.
          파악도가 낮으면 능력치가 범위로만 보입니다.
        </p>

        <Field label="포지션">
          <div className="chips">
            {GROUPS.map((group) => (
              <Chip key={group} active={filters.groups.includes(group)} onClick={() => toggleGroup(group)}>
                {POSITION_GROUP_LABELS[group]}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label="나이" hint={`${filters.minAge}세 ~ ${filters.maxAge}세`}>
          <div className="range-row">
            <input type="range" min={16} max={40} value={filters.minAge}
              onChange={(e) => setFilters((f) => ({ ...f, minAge: Math.min(Number(e.target.value), f.maxAge) }))} />
            <input type="range" min={16} max={40} value={filters.maxAge}
              onChange={(e) => setFilters((f) => ({ ...f, maxAge: Math.max(Number(e.target.value), f.minAge) }))} />
          </div>
        </Field>

        <Field
          label="리그"
          hint={filters.leagueIds.length === 0 ? '볼 수 있는 전체' : `${filters.leagueIds.length}개 리그`}
        >
          <div className="chips chips--scroll">
            {unlocked.map((entry) => (
              <Chip
                key={entry.leagueId}
                active={filters.leagueIds.includes(entry.leagueId)}
                onClick={() => toggleLeague(entry.leagueId)}
              >
                {entry.name}
              </Chip>
            ))}
          </div>
        </Field>

        <div className="chips">
          <Chip active={filters.unrepresentedOnly} onClick={() => setFilters((f) => ({ ...f, unrepresentedOnly: !f.unrepresentedOnly }))}>
            대리인 없는 선수만
          </Chip>
          <Chip active={filters.freeAgentsOnly} onClick={() => setFilters((f) => ({ ...f, freeAgentsOnly: !f.freeAgentsOnly }))}>
            자유계약만
          </Chip>
        </div>

        <Btn
          block
          variant="primary"
          disabled={state.scouting.points < SWEEP_COST || filters.groups.length === 0}
          onClick={() => scoutSweep(filters)}
        >
          {filters.groups.length === 0 ? '포지션을 선택하세요' : `훑어보기 (${SWEEP_COST}p)`}
        </Btn>
      </Card>

      <Card
        title={tab === 'found' ? '발굴한 선수' : '관심 목록'}
        action={
          <div className="chips">
            <Chip active={tab === 'found'} onClick={() => setTab('found')}>발굴 {known.length}</Chip>
            <Chip active={tab === 'shortlist'} onClick={() => setTab('shortlist')}>관심 {shortlisted.length}</Chip>
          </div>
        }
      >
        {(tab === 'found' ? known : shortlisted).length === 0
          ? <Empty>{tab === 'found' ? '아직 찾은 선수가 없습니다. 위에서 훑어보세요.' : '관심 등록한 선수가 없습니다.'}</Empty>
          : (tab === 'found' ? known : shortlisted).slice(0, 40).map((player) => (
            <div key={player.id} className="scout-row">
              <PlayerRow
                playerId={player.id}
                right={
                  <span className="scout-row__right">
                    <span>{formatMoney(player.value)}</span>
                    <span className="faint small">{playerLeagueLabel(state, player)}</span>
                  </span>
                }
              />
              <button
                type="button"
                className={`star${state.scouting.shortlist.includes(player.id) ? ' star--on' : ''}`}
                onClick={() => shortlist(player.id)}
                aria-label="관심 등록"
              >
                ★
              </button>
            </div>
          ))}
      </Card>

      <Card
        title="사정권"
        action={<span className="faint small">{unlocked.length} / {access.length}개 리그</span>}
      >
        <p className="faint small">
          무명 에이전트의 전화를 위 리그 구단은 받아 주지 않습니다. 거래를 성사시켜
          평판을 쌓으면 상위 리그가 차례로 열립니다.
        </p>
        <Meter label="평판" value={state.agent.reputation} />
        {nextUp
          ? (
            <KV
              k={`다음: ${nextUp.name}`}
              v={`평판 ${nextUp.required} 필요 (현재 ${Math.round(state.agent.reputation)})`}
              tone="dim"
            />
          )
          : <KV k="모든 리그" v="사정권 안입니다" tone="good" />}
        {locked.slice(1, 5).map((entry) => (
          <KV key={entry.leagueId} k={entry.name} v={`평판 ${entry.required}`} tone="dim" />
        ))}
      </Card>

      <Card title="요령">
        <KV k="파악도 100%" v="능력치가 정확한 값으로 보입니다" tone="dim" />
        <KV k="자유계약 선수" v="이적료 없이 데려갈 수 있습니다" tone="dim" />
        <KV k="무소속 선수" v={`지금은 능력치 ${Math.round(scoutingCeiling(state) / 0.55)} 이하까지 보입니다`} tone="dim" />
      </Card>
    </div>
  );
}
