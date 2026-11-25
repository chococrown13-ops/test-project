import { spiritSvg, SPIRIT_ART } from '../src/render/art/spirits';
import { SPIRITS } from '../src/themes/spirits';

/** Every 정령 has a drawing for each form, and each drawing is well formed (no group left open). */
let bad = 0;
const check = (name: string, ok: boolean, info = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${info}`); if (!ok) bad++; };
const missing = SPIRITS.units.filter((u) => !SPIRIT_ART[u.id]).map((u) => u.name);
check('every spirit has a drawing', !missing.length, missing.join(','));
for (const u of SPIRITS.units) for (const star of [1, 2, 3]) {
  const svg = spiritSvg(u.id, star) ?? '';
  const open = (svg.match(/<g[\s>]/g) ?? []).length, close = (svg.match(/<\/g>/g) ?? []).length;
  const nan = /NaN|undefined/.test(svg);
  if (open !== close || nan || svg.length < 500) check(`${u.name} ${star}★ well formed`, false, `g ${open}/${close}${nan ? ' NaN' : ''}`);
}
// Forms of one spirit must differ by more than their eyes: compare the drawings with the eyes taken out.
const noEyes = (svg: string) => svg.replace(/<ellipse[^>]*fill="#2b1810"[^>]*>|<ellipse[^>]*fill="#fff"[^>]*>|<circle[^>]*fill="#fff"[^>]*>/g, '').replace(/sp\d+/g, '');
for (const u of SPIRITS.units) {
  const [a, b, c] = [1, 2, 3].map((st) => noEyes(spiritSvg(u.id, st)!));
  const diff = (x: string, y: string) => { const sx = new Set(x.split('<')), sy = new Set(y.split('<')); let n = 0; for (const t of sx) if (!sy.has(t)) n++; for (const t of sy) if (!sx.has(t)) n++; return n; };
  check(`${u.name}: each form looks different`, diff(a, b) >= 12 && diff(b, c) >= 12, `${diff(a, b)} / ${diff(b, c)} parts changed`);
}
console.log(bad ? `${bad} failed` : 'all passed');
if (bad) process.exit(1);
