import { useEffect, useMemo, useState } from 'react';
import {
  CONTINENTS, CONTINENT_ORDER, COUNTRIES, DEFAULT_COUNTRY_IDS, type CountryDef,
} from '../../data/countries';
import { SQUAD_SIZE } from '../../game/player';
import { hasSave } from '../../game/save';
import { useGame } from '../../store/useGame';
import { Btn, Card, Field, KV } from '../components/common';

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
    const clubs = chosen.reduce((sum, c) => sum + c.clubCount, 0);
    return { leagues: chosen.length, clubs, players: clubs * SQUAD_SIZE };
  }, [selected]);

  const readiness = useMemo(() => continentalReadiness(selected), [selected]);
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

      <Card
        title="활성화할 리그"
        action={<span className="faint small">{stats.leagues}개국</span>}
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
        })}
      >
        {selected.size === 0 ? '리그를 하나 이상 선택하세요' : '새 게임 시작'}
      </Btn>
      <p className="faint small center">구단과 선수는 모두 가상입니다.</p>
    </div>
  );
}
