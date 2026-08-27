/** 구단 데이터와 국가 정의가 어긋나지 않는지 확인합니다. */
import { COUNTRIES } from '../src/data/countries';
import { HOME_TIERS } from '../src/data/countries';
import { realClubsFor, type ClubSeed } from '../src/data/clubs';

let problems = 0;
let leagues = 0;
let total = 0;

const bad = (message: string): void => { console.log(`✗ ${message}`); problems++; };

for (const country of COUNTRIES) {
  // 한 나라 안에서 부가 달라도 같은 구단이 두 번 나오면 안 됩니다.
  const namesInCountry = new Map<string, number>();

  for (let tier = 1; tier <= HOME_TIERS; tier++) {
    const list: ClubSeed[] | undefined = realClubsFor(country.id, tier);
    if (!list) {
      if (tier === 1) bad(`${country.name}: 1부 구단 목록 없음`);
      continue;
    }
    leagues++;
    total += list.length;

    if (list.length !== country.clubCount) {
      bad(`${country.name} ${tier}부: clubCount ${country.clubCount} ≠ 목록 ${list.length}`);
    }

    const shorts = new Map<string, number>();
    for (const club of list) {
      const seenAt = namesInCountry.get(club.name);
      if (seenAt !== undefined) bad(`${country.name}: ${club.name} 이 ${seenAt}부와 ${tier}부에 중복`);
      else namesInCountry.set(club.name, tier);

      shorts.set(club.short, (shorts.get(club.short) ?? 0) + 1);
      if (!/^#[0-9a-f]{6}$/.test(club.color) || !/^#[0-9a-f]{6}$/.test(club.accent)) {
        bad(`${club.name}: 색상 형식 오류`);
      }
      if (club.color === club.accent) bad(`${club.name}: 주색과 강조색이 같음`);
      if (club.short.length < 2 || club.short.length > 4) {
        bad(`${club.name}: 약칭 길이 ${club.short.length}`);
      }
    }
    // 같은 리그 안에서 약칭이 겹치면 순위표에서 구분이 안 됩니다.
    for (const [short, n] of shorts) {
      if (n > 1) bad(`${country.name} ${tier}부: 약칭 중복 ${short} (${n}개)`);
    }
  }
}

// 어느 나라의 어느 부까지 실제 데이터가 있는지 한눈에.
console.log('\n실제 구단 보유 현황 (● 실제 · ○ 가상)');
for (const country of COUNTRIES) {
  const marks = Array.from({ length: HOME_TIERS }, (_, i) =>
    realClubsFor(country.id, i + 1) ? '●' : '○').join('');
  console.log(`  ${marks}  ${country.name}`);
}

console.log(problems === 0
  ? `\n✓ ${leagues}개 리그 ${total}개 구단 모두 정상`
  : `\n${problems}건 문제`);
process.exit(problems === 0 ? 0 : 1);
