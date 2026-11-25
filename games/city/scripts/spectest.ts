/* 도시 특화: shut until its conditions are met, then open once, buildable, and levelled by its buildings. */
import { placeProblem } from '../src/sim/tools';
import { checkSpecs, isOpen, specDemand, specIncomeDay, specLevel, specProblem } from '../src/sim/special';
import { createWorld, type Building } from '../src/sim/world';

let failed = 0;
const check = (name: string, ok: boolean, info = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${info}`); };
const w = createWorld(3);
let id = 900000;
const put = (kind: string, extra: Partial<Building> = {}) => { const b = { id: id++, kind, x: 10, y: 10, occ: 0, abandoned: false, ...extra } as unknown as Building; w.buildings.set(b.id, b); return b; };

checkSpecs(w);
check('a new city has no specialisation', !isOpen(w, 'med') && !isOpen(w, 'tech'));
check('a hospital cannot be built yet, and the reason names what is missing', !!specProblem(w, 'hospital') && /보건소/.test(specProblem(w, 'hospital')!), specProblem(w, 'hospital') ?? '');
check('placing one is refused before it opens', !!placeProblem(w, 'hospital', 20, 20)?.includes('의료 특화'));

// Meet 의료: 4,000 people, three clinics, most residents in reach.
w.stats.pop = 4200;
for (let k = 0; k < 3; k++) put('clinic');
const home = put('r1', { occ: 100, x: 30, y: 30 });
w.health[home.y * 256 + home.x] = 1;
const n0 = w.notices.length;
checkSpecs(w);
check('의료 opens when its conditions are met, with a notice', isOpen(w, 'med') && w.notices.length === n0 + 1);
checkSpecs(w);
check('it opens once', w.notices.length === n0 + 1 && (w.specs ?? []).length === 1);
check('기술 stays shut', !isOpen(w, 'tech'));
check('open but nothing built: level 0, no bonus', specLevel(w, 'med') === 0 && specIncomeDay(w) === 0);
check('now a hospital may be built', specProblem(w, 'hospital') === null);
put('hospital');
check('one building: level 1', specLevel(w, 'med') === 1 && specDemand(w).R === 3 && specIncomeDay(w) > 0);
put('medlab'); put('hospital');
check('three buildings: level 2', specLevel(w, 'med') === 2);
put('medlab'); put('hospital');
check('five buildings: level 3', specLevel(w, 'med') === 3 && specDemand(w).R === 10);
// 기술.
w.stats.pop = 9000;
put('school'); put('school'); put('library');
for (let k = 0; k < 4; k++) put('i3');
checkSpecs(w);
check('기술 opens with schools, a library and knowledge industry', isOpen(w, 'tech'));
put('techpark');
check('기술 level 1 raises office and industry demand', specLevel(w, 'tech') === 1 && specDemand(w).C === 4 && specDemand(w).I === 4);
console.log(failed ? `${failed} FAILED` : 'all passed');
