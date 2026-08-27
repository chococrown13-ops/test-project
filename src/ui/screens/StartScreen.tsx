import { useEffect, useMemo, useState } from 'react';
import {
  CONTINENTS, CONTINENT_ORDER, COUNTRIES, DEFAULT_COUNTRY_IDS, HOME_TIERS,
  COUNTRY_BY_ID, tierReputation, type CountryDef,
} from '../../data/countries';
import { REAL_CLUBS_T2 } from '../../data/clubs';
import { SQUAD_SIZE } from '../../game/player';
import { hasSave } from '../../game/save';
import { useGame } from '../../store/useGame';
import { Btn, Card, Chip, Field, KV, Segmented } from '../components/common';

/** 대륙 대항전이 성립하려면 한 대륙에 두 나라는 있어야 합니다. */
function continentalReadiness(selected: Set<string>): Array<{ name: string; countries: number; cup: boolean }> {
  return CONTINENT_ORDER.map((continentId) => {
    const countries = COUNTRIES.filter((c) => c.continent === continentId && selected.has(c.id));
    const slots = countries.reduce((sum, c) => sum + c.continentalSlots, 0);
    return {
      name: CONTINENTS[continentId].cupName,
      countries: countries.length,
      cup: countries.length >= 2 && slots >= 4,
    };
  }).filter((entry) => entry.countries > 0);
}

export default function StartScreen() {
  const { start, resume, busy } = useGame();
  const [name, setName] = useState('');
  const [agency, setAgency] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set(DEFAULT_COUNTRY_IDS));
  const [realClubs, setRealClubs] = useState(true);
  const [homeCountryId, setHomeCountryId] = useState('eng');
  const [canResume, setCanResume] = useState(false);

  useEffect(() => { setCanResume(hasSave()); }, []);

  const toggle = (country: CountryDef): void => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(country.id)) next.delete(country.id);
      else next.add(country.id);
      return next;
    });
  };

  const stats = useMemo(() => {
    const chosen = COUNTRIES.filter((c) => selected.has(c.id));
    // 본거지는 4부까지 열리므로 그만큼 구단이 늘어납니다.
    const home = selected.has(homeCountryId) ? homeCountryId : [...selected][0];
    const extraTiers = home ? (COUNTRY_BY_ID[home]?.clubCount ?? 0) * (HOME_TIERS - 1) : 0;
    const clubs = chosen.reduce((sum, c) => sum + c.clubCount, 0) + extraTiers;
    return {
      countries: chosen.length,
      leagues: chosen.length + (chosen.length > 0 ? HOME_TIERS - 1 : 0),
      clubs,
      players: clubs * SQUAD_SIZE,
    };
  }, [selected, homeCountryId]);

  const readiness = useMemo(() => continentalReadiness(selected), [selected]);
  // 본거지를 껐다면 켜져 있는 나라 중 하나로 자동으로 옮깁니다.
  const activeHomeId = selected.has(homeCountryId) ? homeCountryId : [...selected][0];
  const homeCountry = activeHomeId ? COUNTRY_BY_ID[activeHomeId] : undefined;
  const heavy = stats.clubs > 330;

  return (
    <div className="start">
      <header className="start__hero">
        <h1 className="start__title">Football Agent</h1>
        <p className="start__tag">선수를 발굴하고, 계약을 만들고, 수수료로 먹고삽니다.</p>
      </header>

      {canResume && (
        <Card title="이어하기">
          <Btn block variant="primary" disabled={busy} onClick={() => { void resume(); }}>
            {busy ? '불러오는 중…' : '저장된 게임 이어하기'}
          </Btn>
        </Card>
      )}

      <Card title="에이전트">
        <Field label="이름">
          <input className="input" value={name} placeholder="이수현" maxLength={20}
            onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="에이전시 이름">
          <input className="input" value={agency} placeholder="수현 스포츠 매니지먼트" maxLength={30}
            onChange={(e) => setAgency(e.target.value)} />
        </Field>
      </Card>

      <Card title="구단명">
        <Segmented
          value={realClubs ? 'real' : 'fictional'}
          onChange={(value) => setRealClubs(value === 'real')}
          options={[
            { value: 'real', label: '실제 구단' },
            { value: 'fictional', label: '가상 구단' },
          ]}
        />
        <p className="faint small">
          {realClubs
            ? '실제 구단의 이름과 색상을 씁니다. 엠블럼은 쓰지 않고, 선수는 전부 가상입니다.'
            : '도시 이름을 조합해 가상 구단을 만듭니다. 실존하는 것과 무관한 세계가 됩니다.'}
        </p>
      </Card>

      <Card
        title="활성화할 리그"
        action={<span className="faint small">{stats.countries}개국</span>}
      >
        <p className="faint small">
          켠 나라의 1부 리그가 전부 동시에 돌아갑니다. 끄면 그 나라 선수와 구단은 세계에서 아예 빠집니다.
        </p>
        <div className="presets">
          <Btn small onClick={() => setSelected(new Set(DEFAULT_COUNTRY_IDS))}>기본 16개국</Btn>
          <Btn small onClick={() => setSelected(new Set(COUNTRIES.map((c) => c.id)))}>전체 24개국</Btn>
          <Btn small onClick={() => setSelected(new Set(COUNTRIES.filter((c) => c.continent === 'eur').map((c) => c.id)))}>유럽만</Btn>
          <Btn small variant="ghost" onClick={() => setSelected(new Set())}>모두 해제</Btn>
        </div>

        {CONTINENT_ORDER.map((continentId) => {
          const countries = COUNTRIES.filter((c) => c.continent === continentId);
          if (countries.length === 0) return null;
          return (
            <div key={continentId} className="continent">
              <h4 className="continent__name">
                <span className="continent__dot" style={{ background: CONTINENTS[continentId].color }} />
                {CONTINENTS[continentId].name}
              </h4>
              <div className="country-grid">
                {countries.map((country) => (
                  <button
                    key={country.id}
                    type="button"
                    className={`country${selected.has(country.id) ? ' country--on' : ''}`}
                    onClick={() => toggle(country)}
                  >
                    <span className="country__flag" style={{ background: country.color }} />
                    <span className="country__name">{country.name}</span>
                    <span className="country__meta">{country.clubCount}팀 · 수준 {country.reputation}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </Card>

      <Card title="본거지" action={<span className="faint small">{HOME_TIERS}부까지</span>}>
        <p className="faint small">
          본거지로 고른 나라만 {HOME_TIERS}부 리그까지 열리고 승격·강등이 돌아갑니다.
          당신은 여기 하부 리그에서 시작합니다 — 무명 에이전트의 전화를 1부 구단은
          받아 주지 않기 때문입니다.
        </p>
        <div className="chips chips--scroll">
          {[...selected].map((id) => COUNTRY_BY_ID[id]).filter(Boolean).map((country) => (
            <Chip key={country.id} active={country.id === activeHomeId} onClick={() => setHomeCountryId(country.id)}>
              {country.name}
            </Chip>
          ))}
        </div>
        {homeCountry && (
          <div className="tier-preview">
            {Array.from({ length: HOME_TIERS }, (_, i) => i + 1).map((tier) => (
              <div key={tier} className="tier-preview__row">
                <span className="tier-preview__name">{homeCountry.leagueLabel} {tier}부</span>
                <span className="tier-preview__meta">
                  수준 {tierReputation(homeCountry, tier)}
                  {realClubs && (tier === 1 || (tier === 2 && REAL_CLUBS_T2[homeCountry.id]))
                    ? ' · 실제 구단'
                    : ' · 가상 구단'}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="이 세계의 규모" tone={heavy ? 'warn' : undefined}>
        <KV k="리그" v={`${stats.leagues}개`} />
        <KV k="구단" v={`${stats.clubs}개`} />
        <KV k="선수" v={`약 ${stats.players.toLocaleString()}명`} />
        {heavy && (
          <p className="warn small">
            리그를 많이 켜면 한 주 진행이 느려지고 세이브 용량도 커집니다. 휴대폰에서는 16개국 안팎을 권합니다.
          </p>
        )}
        <h4 className="subhead">대륙 대항전</h4>
        {readiness.length === 0
          ? <p className="faint small">나라를 하나 이상 켜 주세요.</p>
          : readiness.map((entry) => (
            <KV
              key={entry.name}
              k={entry.name}
              v={entry.cup ? `${entry.countries}개국 참가` : '참가국 부족 — 열리지 않습니다'}
              tone={entry.cup ? 'good' : 'dim'}
            />
          ))}
        <p className="faint small">
          대륙 챔피언들이 시즌 막바지에 클럽 월드컵에서 만납니다.
        </p>
      </Card>

      <Btn
        block
        variant="primary"
        disabled={selected.size === 0}
        onClick={() => start({
          agentName: name,
          agencyName: agency,
          countryIds: [...selected],
          fictionalClubs: !realClubs,
          homeCountryId: activeHomeId,
        })}
      >
        {selected.size === 0 ? '리그를 하나 이상 선택하세요' : '새 게임 시작'}
      </Btn>
      <p className="faint small center">
        {realClubs ? '선수는 모두 가상입니다.' : '구단과 선수는 모두 가상입니다.'}
      </p>
    </div>
  );
}
