/** 구단 데이터와 국가 정의가 어긋나지 않는지 확인합니다. */
import { COUNTRIES } from '../src/data/countries';
import { REAL_CLUBS } from '../src/data/clubs';

let problems = 0;
const seenShort = new Map<string, string[]>();

for (const country of COUNTRIES) {
  const list = REAL_CLUBS[country.id];
  if (!list) { console.log(`✗ ${country.name}: 구단 목록 없음`); problems++; continue; }
  if (list.length !== country.clubCount) {
    console.log(`✗ ${country.name}: clubCount ${country.clubCount} ≠ 목록 ${list.length}`);
    problems++;
  }
  const names = new Set<string>();
  for (const club of list) {
    if (names.has(club.name)) { console.log(`✗ ${country.name}: 이름 중복 ${club.name}`); problems++; }
    names.add(club.name);
    if (!/^#[0-9a-f]{6}$/.test(club.color) || !/^#[0-9a-f]{6}$/.test(club.accent)) {
      console.log(`✗ ${club.name}: 색상 형식 오류`); problems++;
    }
    if (club.color === club.accent) { console.log(`✗ ${club.name}: 주색과 강조색이 같음`); problems++; }
    if (club.short.length < 2 || club.short.length > 4) {
      console.log(`✗ ${club.name}: 약칭 길이 ${club.short.length}`); problems++;
    }
  }
  // 같은 리그 안에서 약칭이 겹치면 순위표에서 구분이 안 됩니다.
  const shorts = new Map<string, number>();
  for (const club of list) shorts.set(club.short, (shorts.get(club.short) ?? 0) + 1);
  for (const [short, n] of shorts) {
    if (n > 1) { console.log(`✗ ${country.name}: 약칭 중복 ${short} (${n}개)`); problems++; }
  }
  seenShort.set(country.id, list.map((c) => c.short));
}

const total = COUNTRIES.reduce((sum, c) => sum + (REAL_CLUBS[c.id]?.length ?? 0), 0);
console.log(problems === 0
  ? `✓ ${COUNTRIES.length}개 리그 ${total}개 구단 모두 정상`
  : `${problems}건 문제`);
process.exit(problems === 0 ? 0 : 1);
