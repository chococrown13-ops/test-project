import { useState } from 'react';
import { CONTINENTS, CONTINENT_ORDER, COUNTRY_BY_ID } from '../../data/countries';
import { compareTableRows } from '../../game/world';
import { AWARD_LABELS } from '../../game/awards';
import { seasonLabel } from '../../game/types';
import { useGame, useGameState } from '../../store/useGame';
import { Card, Chip, Crest, Empty, KV, Segmented } from '../components/common';
import { PlayerRow } from '../components/PlayerView';

type View = 'league' | 'cup' | 'awards';

export default function WorldScreen() {
  const state = useGameState();
  const [view, setView] = useState<View>('league');

  return (
    <div className="screen">
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: 'league', label: '리그' },
          { value: 'cup', label: '대륙 대회' },
          { value: 'awards', label: '수상' },
        ]}
      />
      {view === 'league' && <LeagueView />}
      {view === 'cup' && <CupView />}
      {view === 'awards' && <AwardsView />}
      <p className="faint small center">{seasonLabel(state.season)} · {state.week}주차</p>
    </div>
  );
}

function LeagueView() {
  const state = useGameState();
  const { openPlayer, openClub } = useGame();
  const [countryId, setCountryId] = useState(state.countryIds[0]);
  const league = state.leagues[countryId];
  const country = COUNTRY_BY_ID[countryId];

  if (!league || !country) return <Empty>리그를 찾을 수 없습니다.</Empty>;

  const rows = Object.values(league.table).slice().sort(compareTableRows);
  const scorers = Object.values(state.players)
    .filter((p) => (p.compStats[league.competitionId]?.goals ?? 0) > 0)
    .sort((a, b) => b.compStats[league.competitionId].goals - a.compStats[league.competitionId].goals)
    .slice(0, 8);
  const assisters = Object.values(state.players)
    .filter((p) => (p.compStats[league.competitionId]?.assists ?? 0) > 0)
    .sort((a, b) => b.compStats[league.competitionId].assists - a.compStats[league.competitionId].assists)
    .slice(0, 5);

  return (
    <>
      <div className="chips chips--scroll">
        {state.countryIds.map((id) => (
          <Chip key={id} active={id === countryId} onClick={() => setCountryId(id)}>
            {COUNTRY_BY_ID[id]?.name}
          </Chip>
        ))}
      </div>

      <Card title={country.leagueName} action={league.championId
        ? <span className="pill pill--good">우승 {state.clubs[league.championId]?.shortName}</span>
        : null}>
        <table className="table">
          <thead>
            <tr><th>#</th><th>구단</th><th>경기</th><th>승무패</th><th>득실</th><th>승점</th></tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const club = state.clubs[row.clubId];
              const european = index < country.continentalSlots;
              return (
                <tr key={row.clubId} className={european ? 'table__row--qualified' : undefined}
                  onClick={() => openClub(row.clubId)}>
                  <td className="table__pos">{index + 1}</td>
                  <td className="table__club">
                    <Crest color={club.color} accent={club.accent} label={club.shortName} size={20} />
                    <span>{club.name}</span>
                  </td>
                  <td>{row.played}</td>
                  <td className="faint">{row.won}·{row.drawn}·{row.lost}</td>
                  <td>{row.goalsFor - row.goalsAgainst > 0 ? '+' : ''}{row.goalsFor - row.goalsAgainst}</td>
                  <td className="table__pts">{row.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="faint small">색이 들어간 순위가 대륙 대항전 출전권({country.continentalSlots}장)입니다.</p>
      </Card>

      <Card title="득점 순위">
        {scorers.length === 0
          ? <Empty>아직 득점이 없습니다.</Empty>
          : scorers.map((player) => (
            <PlayerRow
              key={player.id}
              playerId={player.id}
              right={`${player.compStats[league.competitionId].goals}골`}
              onClick={() => openPlayer(player.id)}
            />
          ))}
      </Card>

      <Card title="도움 순위">
        {assisters.length === 0
          ? <Empty>아직 도움이 없습니다.</Empty>
          : assisters.map((player) => (
            <PlayerRow
              key={player.id}
              playerId={player.id}
              right={`${player.compStats[league.competitionId].assists}도움`}
              onClick={() => openPlayer(player.id)}
            />
          ))}
      </Card>
    </>
  );
}

function CupView() {
  const state = useGameState();
  const { openClub } = useGame();
  const cups = [
    ...CONTINENT_ORDER.map((id) => state.cups[`ct:${id}`]).filter(Boolean),
    state.cups['wc'],
  ].filter(Boolean);

  if (cups.length === 0) return <Empty>아직 열린 대회가 없습니다.</Empty>;

  return (
    <>
      {cups.map((cup) => {
        const competition = state.competitions[cup.competitionId];
        return (
          <Card
            key={cup.id}
            title={competition?.name ?? cup.id}
            action={cup.championId
              ? <span className="pill pill--good">{state.clubs[cup.championId]?.name}</span>
              : <span className="faint small">{cup.alive.length}팀 생존</span>}
          >
            {cup.continentId && (
              <KV k="대륙" v={CONTINENTS[cup.continentId].name} />
            )}
            {cup.rounds.map((round, index) => (
              <div key={round.name} className="cup-round">
                <h4 className="cup-round__name">
                  {round.name}
                  <span className="faint small"> · {round.week}주</span>
                  {round.fixtureIds.length === 0 && <span className="pill pill--warn">대진 미정</span>}
                </h4>
                {round.fixtureIds.length === 0
                  ? null
                  : round.fixtureIds.map((fixtureId) => {
                    const fixture = cup.fixtures.find((f) => f.id === fixtureId);
                    if (!fixture) return null;
                    const home = state.clubs[fixture.homeId];
                    const away = state.clubs[fixture.awayId];
                    const homeWon = fixture.homeGoals > fixture.awayGoals
                      || (fixture.shootout ? fixture.shootout[0] > fixture.shootout[1] : false);
                    return (
                      <div key={fixtureId} className="tie">
                        <button type="button" className={`tie__side${fixture.played && homeWon ? ' tie__side--won' : ''}`}
                          onClick={() => openClub(home.id)}>{home?.name}</button>
                        <span className="tie__score">
                          {fixture.played ? `${fixture.homeGoals} - ${fixture.awayGoals}` : 'vs'}
                          {fixture.shootout && <span className="faint small"> ({fixture.shootout[0]}-{fixture.shootout[1]})</span>}
                        </span>
                        <button type="button" className={`tie__side${fixture.played && !homeWon ? ' tie__side--won' : ''}`}
                          onClick={() => openClub(away.id)}>{away?.name}</button>
                      </div>
                    );
                  })}
                {index < cup.rounds.length - 1 && round.fixtureIds.length > 0 && <hr className="rule" />}
              </div>
            ))}
          </Card>
        );
      })}
    </>
  );
}

function AwardsView() {
  const state = useGameState();
  const { openPlayer } = useGame();
  const [season, setSeason] = useState(state.season);
  const winners = state.awards.filter((a) => a.season === season);

  const worldAwards = winners.filter((a) => a.awardId.startsWith('world-'));
  const continentalAwards = winners.filter((a) => a.awardId.startsWith('continental-'));
  const leagueAwards = winners.filter((a) => a.competitionId?.startsWith('lg:'));
  const seasons = [...new Set(state.awards.map((a) => a.season))].sort((a, b) => b - a);

  if (state.awards.length === 0) {
    return <Empty>아직 시상식이 열리지 않았습니다. 43주차에 발표됩니다.</Empty>;
  }

  return (
    <>
      <div className="chips chips--scroll">
        {seasons.map((s) => (
          <Chip key={s} active={s === season} onClick={() => setSeason(s)}>{seasonLabel(s)}</Chip>
        ))}
      </div>

      <Card title="세계">
        {worldAwards.length === 0
          ? <Empty>기록 없음</Empty>
          : worldAwards.map((award) => (
            <button key={award.awardId} type="button" className="award" onClick={() => openPlayer(award.playerId)}>
              <span className="award__name">{AWARD_LABELS[award.awardId]}</span>
              <span className="award__winner">
                {award.playerName}
                {award.wasClient && <span className="prow__tag">의뢰인</span>}
              </span>
              <span className="award__club">{award.clubName}</span>
            </button>
          ))}
      </Card>

      <Card title="대륙">
        {continentalAwards.length === 0
          ? <Empty>기록 없음</Empty>
          : continentalAwards.map((award, i) => (
            <KV
              key={`${award.awardId}-${i}`}
              k={`${award.continentId ? CONTINENTS[award.continentId].name : ''} ${AWARD_LABELS[award.awardId]}`}
              v={`${award.playerName} (${award.value})`}
              tone={award.wasClient ? 'good' : undefined}
            />
          ))}
      </Card>

      <Card title="리그별">
        {leagueAwards.length === 0
          ? <Empty>기록 없음</Empty>
          : state.countryIds.map((countryId) => {
            const competitionId = `lg:${countryId}`;
            const forLeague = leagueAwards.filter((a) => a.competitionId === competitionId);
            if (forLeague.length === 0) return null;
            return (
              <div key={countryId} className="award-group">
                <h4 className="subhead">{COUNTRY_BY_ID[countryId]?.leagueName}</h4>
                {forLeague.map((award, i) => (
                  <KV
                    key={`${award.awardId}-${i}`}
                    k={AWARD_LABELS[award.awardId]}
                    v={`${award.playerName}${['top-scorer', 'top-assists', 'golden-glove'].includes(award.awardId) ? ` · ${award.value}` : ''}`}
                    tone={award.wasClient ? 'good' : undefined}
                  />
                ))}
              </div>
            );
          })}
      </Card>
    </>
  );
}
