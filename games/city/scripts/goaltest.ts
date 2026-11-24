/* Goals in chapters: a met goal stays met, each chapter's grant is paid once, and 도전과제 are marked once. */
import { ACHIEVEMENTS, advanceGoals, checkAchievements, CHAPTERS, GOALS } from '../src/sim/goals';
import { createWorld, type Building } from '../src/sim/world';

let failed = 0;
const check = (name: string, ok: boolean, info = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${info}`); };

check('forty goals in five chapters', GOALS.length === 40 && CHAPTERS.reduce((s, c) => s + c.size, 0) === GOALS.length, `${GOALS.length}`);
const w = createWorld(3);
advanceGoals(w); // a fresh city: nothing met yet
check('a new city starts at the first goal', w.goal === 0 && (w.chapterPaid ?? 0) === 0);
// Just short of the end of chapter 1, with its last goal (a school) met.
w.goal = 7;
w.buildings.set(999999, { id: 999999, kind: 'school' } as unknown as Building);
const m0 = w.money;
const p = advanceGoals(w);
check('finishing chapter 1 pays its grant', w.goal === 8 && w.money === m0 + CHAPTERS[0].reward && w.chapterPaid === 1 && p.chapter === 1 && p.inChapter === 0, `money +${w.money - m0}`);
advanceGoals(w);
check('the grant is paid once', w.money === m0 + CHAPTERS[0].reward);
// A met goal stays met even if the city falls back.
w.buildings.delete(999999);
advanceGoals(w);
check('goals already met stay met', w.goal === 8);
// 도전과제: each one once.
w.everLoan = true; w.loans = [];
checkAchievements(w);
const n = w.notices.length;
checkAchievements(w);
check('a challenge is marked once', (w.achieved ?? []).includes('debtfree') && w.notices.length === n && ACHIEVEMENTS.length >= 14);
console.log(failed ? `${failed} FAILED` : 'all passed');
