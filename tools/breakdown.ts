import { createGame } from '../src/game/newGame';
import { serialize } from '../src/game/save';
import { COUNTRIES } from '../src/data/countries';

const state = createGame({ seed: 7, countryIds: COUNTRIES.map((c) => c.id) });
const total = serialize(state).length;
const { players, ...rest } = state;
const parts: Array<[string, number]> = [
  ['players', total - JSON.stringify(rest).length],
  ['leagues(fixtures+table)', JSON.stringify(rest.leagues).length],
  ['clubs', JSON.stringify(rest.clubs).length],
  ['cups', JSON.stringify(rest.cups).length],
  ['scouting', JSON.stringify(rest.scouting).length],
];
console.log(`총 ${(total / 1024 / 1024).toFixed(2)}MB`);
for (const [name, size] of parts) console.log(`  ${name}: ${(size / 1024 / 1024).toFixed(2)}MB`);
const clubIdChars = Object.values(rest.clubs).reduce((s, c) => s + c.playerIds.join(',').length, 0);
console.log(`  └ club.playerIds 문자열: ${(clubIdChars / 1024 / 1024).toFixed(2)}MB`);
