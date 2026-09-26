// Small shared UI helpers.

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

export function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

const TIER_LABEL = ['기초', '중', '상', '최상', '극상'];

/** Difficulty as filled pips instead of a colour-coded badge. */
export function tierMark(tier: number): string {
  const pips = Array.from({ length: 4 }, (_, i) => `<i class="${i < tier ? 'on' : ''}"></i>`).join('');
  return `<span class="tier-mark" title="${TIER_LABEL[tier]}"><span class="pips">${pips}</span>${TIER_LABEL[tier]}</span>`;
}
