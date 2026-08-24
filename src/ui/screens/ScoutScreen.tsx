import { useState } from 'react';
import { COUNTRIES } from '../../data/countries';
import { POSITION_GROUP_LABELS, type PositionGroup } from '../../game/attributes';
import { DEFAULT_FILTERS, SWEEP_COST, depthOf, type ScoutFilters } from '../../game/scouting';
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

  const available = COUNTRIES.filter((c) => state.countryIds.includes(c.id));
  const toggleCountry = (id: string): void => setFilters((f) => ({
    ...f,
    countryIds: f.countryIds.includes(id) ? f.countryIds.filter((c) => c !== id) : [...f.countryIds, id],
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

        <Field label="리그" hint={filters.countryIds.length === 0 ? '전체' : `${filters.countryIds.length}개국`}>
          <div className="chips chips--scroll">
            {available.map((country) => (
              <Chip key={country.id} active={filters.countryIds.includes(country.id)} onClick={() => toggleCountry(country.id)}>
                {country.name}
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
                    <span className="faint small">파악 {Math.round(depthOf(state, player.id))}%</span>
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

      <Card title="요령">
        <KV k="평판이 낮으면" v="눈에 띄는 선수가 잘 안 걸립니다" tone="dim" />
        <KV k="파악도 100%" v="능력치가 정확한 값으로 보입니다" tone="dim" />
        <KV k="자유계약 선수" v="이적료 없이 데려갈 수 있습니다" tone="dim" />
      </Card>
    </div>
  );
}
