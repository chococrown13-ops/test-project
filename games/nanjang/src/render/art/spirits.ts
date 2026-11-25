import { Art, bodyPath, darker, E, flamePath, headPath, lighter, mix } from './kit';

/**
 * The 정령 drawn by hand, each its own animal with its own build (a hedgehog, a fox, an axolotl,
 * a chick, an eel, a snail...), in three forms that grow as it evolves. Eyes: big jelly eyes
 * for first forms, two-glint eyes for the middle ones, sharp or starry ones for the last.
 */

type Stage = 1 | 2 | 3;
type Draw = (a: Art, s: Stage) => void;

/* ------------------------------------------------------------ shared bits */

/** Stubby feet on the ground. */
function feet(a: Art, c: string, x = 26, w = 15, y = 214) {
  a.part(E(100 - x, y, w, w * 0.55), c);
  a.part(E(100 + x, y, w, w * 0.55), c);
}
/** Little arms at the sides of a standing body. */
function arms(a: Art, c: string, y: number, x: number, r = 11, raise = 0) {
  a.part(`M${100 - x} ${y - r} C${100 - x - r * 1.8} ${y - r - raise} ${100 - x - r * 2} ${y + r * 0.9 - raise} ${100 - x - r * 0.6} ${y + r * 1.1 - raise} C${100 - x + r * 0.3} ${y + r} ${100 - x + r * 0.4} ${y} ${100 - x} ${y - r}Z`, c);
  a.part(`M${100 + x} ${y - r} C${100 + x + r * 1.8} ${y - r - raise} ${100 + x + r * 2} ${y + r * 0.9 - raise} ${100 + x + r * 0.6} ${y + r * 1.1 - raise} C${100 + x - r * 0.3} ${y + r} ${100 + x - r * 0.4} ${y} ${100 + x} ${y - r}Z`, c);
}
/** Pointed ears with a darker inside. */
function pointyEars(a: Art, c: string, inner: string, hy: number, spread: number, h: number, w = 22) {
  for (const sd of [-1, 1]) {
    const bx = 100 + sd * spread, tip = [100 + sd * (spread + w * 0.5), hy - h] as const;
    a.part(`M${bx - sd * w} ${hy - h * 0.15} L${tip[0]} ${tip[1]} L${bx + sd * w * 0.6} ${hy + h * 0.05} Z`, c);
    a.add(`<path d="M${bx - sd * w * 0.55} ${hy - h * 0.2} L${tip[0] - sd * w * 0.1} ${tip[1] + h * 0.25} L${bx + sd * w * 0.2} ${hy - h * 0.05} Z" fill="${inner}"/>`);
  }
}
/** Round ears behind the head. */
function roundEars(a: Art, c: string, inner: string, hy: number, spread: number, r: number) {
  for (const sd of [-1, 1]) {
    a.part(E(100 + sd * spread, hy, r, r), c);
    a.add(`<ellipse cx="${100 + sd * spread}" cy="${hy + 2}" rx="${r * 0.58}" ry="${r * 0.58}" fill="${inner}"/>`);
  }
}
/** A cream muzzle with a small nose. */
function muzzle(a: Art, cy: number, w: number, c = '#ffe8bf', nose = '#2b1810') {
  a.part(E(100, cy, w, w * 0.62), c, null, { lw: 0 });
  a.add(`<ellipse cx="100" cy="${cy - w * 0.28}" rx="${w * 0.2}" ry="${w * 0.14}" fill="${nose}"/>`);
}
/** A five-point star. */
const star = (cx: number, cy: number, r: number) => {
  let d = '';
  for (let k = 0; k < 10; k++) { const rr = k % 2 ? r * 0.45 : r, an = -Math.PI / 2 + (k * Math.PI) / 5; d += `${k ? 'L' : 'M'}${cx + Math.cos(an) * rr} ${cy + Math.sin(an) * rr} `; }
  return d + 'Z';
};
/** Wings: a bird's (feathered) or a dragon's (webbed), both sides. */
function wings(a: Art, c: string, y: number, span: number, kind: 'feather' | 'web' | 'petal' | 'moth', lift = 0) {
  for (const sd of [-1, 1]) {
    const x0 = 100 + sd * 30;
    if (kind === 'web') a.part(`M${x0} ${y} C${x0 + sd * span * 0.4} ${y - 40 - lift} ${x0 + sd * span * 0.8} ${y - 52 - lift} ${x0 + sd * span} ${y - 40 - lift} L${x0 + sd * span * 0.82} ${y - 14 - lift / 2} L${x0 + sd * span * 0.66} ${y - 6} L${x0 + sd * span * 0.5} ${y + 4} L${x0 + sd * span * 0.3} ${y + 6} Z`, c);
    else if (kind === 'feather') a.part(`M${x0} ${y} C${x0 + sd * span * 0.5} ${y - 34 - lift} ${x0 + sd * span} ${y - 30 - lift} ${x0 + sd * span} ${y - 14 - lift} C${x0 + sd * span * 0.86} ${y - 6} ${x0 + sd * span * 0.9} ${y + 4} ${x0 + sd * span * 0.72} ${y + 8} C${x0 + sd * span * 0.66} ${y + 14} ${x0 + sd * span * 0.5} ${y + 16} ${x0 + sd * span * 0.36} ${y + 14} C${x0 + sd * span * 0.2} ${y + 18} ${x0 + sd * 6} ${y + 12} ${x0} ${y}Z`, c);
    else if (kind === 'petal') a.part(`M${x0} ${y} C${x0 + sd * span * 0.3} ${y - 44 - lift} ${x0 + sd * span * 1.05} ${y - 40 - lift} ${x0 + sd * span} ${y - 10} C${x0 + sd * span * 0.9} ${y + 10} ${x0 + sd * span * 0.4} ${y + 14} ${x0} ${y}Z`, c);
    else {
      a.part(`M${x0} ${y} C${x0 + sd * span * 0.2} ${y - 50 - lift} ${x0 + sd * span * 1.1} ${y - 54 - lift} ${x0 + sd * span} ${y - 16} C${x0 + sd * span * 0.8} ${y} ${x0 + sd * span * 0.3} ${y + 2} ${x0} ${y}Z`, c);
      a.part(`M${x0} ${y + 4} C${x0 + sd * span * 0.7} ${y + 2} ${x0 + sd * span * 0.8} ${y + 30} ${x0 + sd * span * 0.5} ${y + 34} C${x0 + sd * span * 0.3} ${y + 36} ${x0 + sd * 8} ${y + 20} ${x0} ${y + 4}Z`, lighter(c, 0.2));
    }
  }
}
/** A little crown. */
function crown(a: Art, cx: number, y: number, w: number, c = '#ffd34a', gem = '#ff4a6a') {
  a.part(`M${cx - w} ${y} L${cx - w * 1.05} ${y - w * 0.85} L${cx - w * 0.5} ${y - w * 0.4} L${cx} ${y - w * 1.1} L${cx + w * 0.5} ${y - w * 0.4} L${cx + w * 1.05} ${y - w * 0.85} L${cx + w} ${y}Z`, c);
  a.add(`<circle cx="${cx}" cy="${y - w * 0.3}" r="${w * 0.17}" fill="${gem}" stroke="#4a2416" stroke-width="1.6"/>`);
}
/** A halo ring. */
function halo(a: Art, cx: number, y: number, w: number, c = '#fff2a8') {
  a.add(`<ellipse cx="${cx}" cy="${y}" rx="${w}" ry="${w * 0.28}" fill="none" stroke="#4a2416" stroke-width="7"/><ellipse cx="${cx}" cy="${y}" rx="${w}" ry="${w * 0.28}" fill="none" stroke="${c}" stroke-width="4"/>`);
}
/** A leaf (for sprouts and tails). */
const leaf = (x: number, y: number, len: number, ang: number, w = 0.42) => {
  const c = Math.cos(ang), s = Math.sin(ang), P = (u: number, v: number) => `${x + u * s + v * c} ${y - u * c + v * s}`;
  return `M${P(0, 0)} C${P(len * 0.3, len * w)} ${P(len * 0.8, len * w * 0.7)} ${P(len, 0)} C${P(len * 0.8, -len * w * 0.7)} ${P(len * 0.3, -len * w)} ${P(0, 0)}Z`;
};
/** A blossom of five round petals. */
function blossom(a: Art, x: number, y: number, r: number, c = '#f6a8c8', mid = '#ffd34a') {
  let d = '';
  for (let k = 0; k < 5; k++) { const an = (k / 5) * Math.PI * 2 - Math.PI / 2; d += E(x + Math.cos(an) * r * 0.7, y + Math.sin(an) * r * 0.7, r * 0.55, r * 0.55); }
  a.part(d, c, null, { lw: 1.8 });
  a.add(`<circle cx="${x}" cy="${y}" r="${r * 0.35}" fill="${mid}" stroke="#4a2416" stroke-width="1.4"/>`);
}

/* ------------------------------------------------------------ the spirits */

/** 뾰롱 → 뾰로롱 → 가시뾰롱: a hedgehog; its spines grow and harden into steel. */
const dochi: Draw = (a, s) => {
  const spine = s === 3 ? '#7a8290' : s === 2 ? '#7a5634' : '#9a7650', face = s === 3 ? '#e6e8ec' : '#f2d8b0', fur = s === 3 ? '#9aa2ae' : '#c49a6a';
  const hy = s === 1 ? 118 : 96, n = s === 1 ? 9 : 11, R = s === 1 ? 78 : 92, cy = s === 1 ? 140 : 126;
  // Spines fanned round the back.
  let d = '';
  for (let k = 0; k <= n; k++) {
    const an = Math.PI * (1.05 + (k / n) * 0.9), len = R * (s === 3 ? 1.18 : 1.08);
    const b1 = an - 0.16, b2 = an + 0.16;
    d += `${k ? 'L' : 'M'}${100 + Math.cos(b1) * R * 0.72} ${cy + Math.sin(b1) * R * 0.72} L${100 + Math.cos(an) * len} ${cy + Math.sin(an) * len} L${100 + Math.cos(b2) * R * 0.72} ${cy + Math.sin(b2) * R * 0.72} `;
  }
  a.part(d + `L${100 + R * 0.7} ${cy + 40} L${100 - R * 0.7} ${cy + 40} Z`, spine);
  if (s === 1) {
    a.part(bodyPath(100, 120, 214, 62), fur);
    feet(a, '#8a6440', 28, 15);
    a.part(headPath(100, hy + 30, 52, 44), face, true, { hi: true });
    a.eyes(80, 120, hy + 26, 7, 9, '#7a4a22');
    a.add(`<ellipse cx="100" cy="${hy + 44}" rx="6" ry="4.5" fill="#2b1810"/>`);
    a.mouth(100, hy + 52, 6, 'cat').cheeks(66, 134, hy + 44);
  } else {
    a.part(bodyPath(100, 126, 218, 58), fur);
    a.part(E(100, 178, 30, 32), face, true);
    feet(a, s === 3 ? '#5f6672' : '#6b4a2a', 28, 16);
    arms(a, face, 150, 44, 11);
    roundEars(a, fur, face, hy - 30, 40, 14);
    a.part(headPath(100, hy, 54, 46), face, true, { hi: true });
    if (s === 3) a.part(`M92 ${hy + 6} L100 ${hy - 26} L108 ${hy + 6}Z`, '#e8edf2');
    a.eyes(78, 122, hy - 4, 7, s === 3 ? 6 : 3, s === 3 ? '#3a6a9a' : '#7a4a22', face);
    a.add(`<ellipse cx="100" cy="${hy + 14}" rx="6" ry="4.5" fill="#2b1810"/>`);
    a.mouth(100, hy + 23, 6, s === 3 ? 'fang' : 'cat').cheeks(64, 136, hy + 14);
  }
};

/** 화르미 → 화르륵 → 화르르왕: a fox kit with a flame on its tail; more tails, then a mane of fire. */
const bulttong: Draw = (a, s) => {
  const fur = s === 3 ? '#f2662e' : s === 2 ? '#f87634' : '#ff8a3a', cream = '#ffe8bf';
  const tails = s === 1 ? [0] : s === 2 ? [-0.5, 0.45] : [-0.9, 0, 0.9];
  for (const t of tails) {
    const sd = t < 0 ? -1 : 1, ex = 100 + (t === 0 ? 62 : sd * 76), ey = t === 0 ? 120 : 108 - Math.abs(t) * 6;
    a.part(`M${100 + sd * 16} 196 C${100 + sd * 64} 200 ${ex + sd * 8} 160 ${ex} ${ey + 14} C${ex - sd * 6} ${ey + 4} ${ex - sd * 16} ${ey + 8} ${ex - sd * 14} ${ey + 18} C${ex - sd * 8} ${ey + 40} ${100 + sd * 46} 172 ${100 + sd * 14} 178 Z`, fur);
    a.flame(flamePath(ex - sd * 3, ey + 14, 12, 38, sd * 0.25));
  }
  const hy = s === 1 ? 96 : s === 2 ? 86 : 78;
  a.part(bodyPath(100, s === 1 ? 128 : 120, 216, s === 1 ? 50 : 54), fur);
  a.part(`M82 ${s === 1 ? 138 : 130} L118 ${s === 1 ? 138 : 130} C122 154 116 170 106 178 L100 170 L94 178 C84 170 78 154 82 ${s === 1 ? 138 : 130}Z`, cream, null, { lw: 0 });
  feet(a, cream, 24, 13);
  if (s === 3) a.flame(`M44 ${hy + 46} L34 ${hy + 20} L56 ${hy + 32} L56 ${hy + 6} L76 ${hy + 26} L86 ${hy + 4} L100 ${hy + 22} L114 ${hy + 4} L124 ${hy + 26} L144 ${hy + 6} L144 ${hy + 32} L166 ${hy + 20} L156 ${hy + 46} C130 ${hy + 58} 70 ${hy + 58} 44 ${hy + 46}Z`);
  pointyEars(a, fur, '#7a2a14', hy - 20, 40, s === 3 ? 68 : 56, 24);
  a.part(headPath(100, hy, 56, 46), fur, true, { hi: true });
  a.part(`M46 ${hy + 6} L28 ${hy + 16} L50 ${hy + 22}Z M154 ${hy + 6} L172 ${hy + 16} L150 ${hy + 22}Z`, fur);
  muzzle(a, hy + 22, 22, cream);
  a.flame(flamePath(100, hy - 38, 13, s === 1 ? 26 : 34));
  a.eyes(76, 124, hy - 4, s === 1 ? 7 : 7.5, s === 1 ? 9 : s === 2 ? 3 : 6, '#c4501a', fur);
  a.mouth(100, hy + 26, 6, s === 3 ? 'fang' : 'cat').cheeks(62, 138, hy + 18);
};

/** 퐁당이 → 찰랑이 → 출렁이: an axolotl; fins grow on its head, then wing-like fins. */
const mulbang: Draw = (a, s) => {
  const skin = s === 3 ? '#4a9ad8' : s === 2 ? '#62b8e8' : '#7fd0f2', belly = '#e6f8ff', gill = s === 3 ? '#9adcff' : '#ff9fbf';
  if (s === 3) wings(a, '#bfe8fa', 140, 74, 'petal', 6);
  a.part(`M126 190 C166 194 190 172 192 150 C180 160 162 166 140 168Z`, lighter(skin, 0.25));
  const top = s === 1 ? 134 : 124;
  a.part(bodyPath(100, top, 216, 48), skin);
  a.part(E(100, 182, 22, 28), belly, true);
  feet(a, skin, 26, 13);
  if (s >= 2) arms(a, skin, top + 26, 40, 9);
  const hy = s === 1 ? 98 : 84;
  for (const sd of [-1, 1]) for (const [dy, l] of [[-24, 30], [-2, 36], [20, 28]] as const) {
    const x0 = 100 + sd * 52, x1 = x0 + sd * l, y = hy + dy;
    a.part(`M${x0} ${y + 6} C${x0 + sd * l * 0.5} ${y - 6} ${x1} ${y - 10} ${x1 + sd * 4} ${y - 2} C${x1} ${y + 8} ${x0 + sd * l * 0.4} ${y + 14} ${x0} ${y + 12}Z`, gill);
  }
  a.part(headPath(100, hy, 58, 44), skin, true, { hi: true });
  if (s >= 2) a.part(`M86 ${hy - 40} C88 ${hy - 64} 100 ${hy - 74} 114 ${hy - 76} C108 ${hy - 62} 112 ${hy - 50} 116 ${hy - 40}Z`, lighter(skin, 0.3));
  else a.part(`M88 ${hy - 42} C90 ${hy - 52} 98 ${hy - 58} 100 ${hy - 62} C104 ${hy - 56} 112 ${hy - 52} 112 ${hy - 42}Z`, lighter(skin, 0.3));
  a.eyes(70, 130, hy, 7, s === 1 ? 9 : s === 2 ? 3 : 1, '#2a6aa8', skin);
  a.mouth(100, hy + 18, 20, 'smile').cheeks(58, 142, hy + 16);
};

/** 싹싹이 → 쑥쑥이 → 무럭이: a squirrel with a sprout; it flowers, then grows branch antlers. */
const saessak: Draw = (a, s) => {
  const fur = s === 3 ? '#8a6a3a' : s === 2 ? '#a8c870' : '#b8d888', belly = '#fff4d6', leafC = s === 3 ? '#4f9442' : '#6cb052';
  // A big bushy tail of leaves.
  a.part(`M120 200 C176 206 196 150 176 112 C164 90 136 92 136 116 C150 118 160 140 150 158 C144 172 130 176 116 178Z`, s === 3 ? '#6a9a48' : '#8cc46a');
  a.part(leaf(170, 98, 30, 0.5), leafC, true, { lw: 2 });
  const hy = s === 1 ? 98 : 88;
  a.part(bodyPath(100, s === 1 ? 128 : 122, 216, 50), fur);
  a.part(E(100, 178, 24, 28), belly, true);
  feet(a, darker(fur, 0.15), 24, 13);
  arms(a, fur, s === 1 ? 150 : 146, 38, 10);
  if (s === 3) {
    for (const sd of [-1, 1]) {
      a.part(`M${100 + sd * 26} ${hy - 38} C${100 + sd * 34} ${hy - 70} ${100 + sd * 48} ${hy - 84} ${100 + sd * 64} ${hy - 88} M${100 + sd * 40} ${hy - 66} C${100 + sd * 54} ${hy - 66} ${100 + sd * 64} ${hy - 58} ${100 + sd * 72} ${hy - 50}`, 'none', null, { lw: 7, line: '#6a4a22' });
      a.part(leaf(100 + sd * 64, hy - 88, 22, sd * 0.9), leafC, true, { lw: 1.8 });
      a.part(leaf(100 + sd * 72, hy - 50, 18, sd * 1.6), leafC, true, { lw: 1.8 });
    }
  }
  pointyEars(a, fur, '#f2c8a0', hy - 22, 36, 44, 18);
  a.part(headPath(100, hy, 54, 44), fur, true, { hi: true });
  a.part(E(100, hy + 18, 26, 16), belly, null, { lw: 0 });
  // The sprout.
  a.stroke(`M100 ${hy - 44} C100 ${hy - 56} 98 ${hy - 62} 96 ${hy - 66}`, 3.2, '#3f7a2a');
  a.part(leaf(96, hy - 64, s === 1 ? 26 : 30, -0.9), leafC, true, { lw: 2 });
  a.part(leaf(98, hy - 64, s === 1 ? 22 : 26, 0.8), lighter(leafC, 0.15), true, { lw: 2 });
  if (s === 2) { blossom(a, 72, hy - 36, 11); blossom(a, 130, hy - 38, 9, '#fff', '#f2a7c3'); }
  a.add(`<ellipse cx="100" cy="${hy + 10}" rx="5" ry="3.8" fill="#2b1810"/>`);
  a.eyes(78, 122, hy - 6, 7, s === 1 ? 9 : s === 2 ? 3 : 6, '#3f7a2a', fur);
  a.mouth(100, hy + 18, 6, s === 3 ? 'fang' : 'cat').cheeks(64, 136, hy + 12);
};

/** 삐약이 → 파닥이 → 휘리릭: a round chick; then a young bird with a crest, then a sharp-eyed hawk. */
const somteol: Draw = (a, s) => {
  if (s === 1) {
    a.part(`M56 150 C40 140 34 156 44 166 C50 172 58 170 62 164Z M144 150 C160 140 166 156 156 166 C150 172 142 170 138 164Z`, '#f6d24a');
    a.part(E(100, 148, 64, 66), '#ffe066', '#f2b83a', { hi: true });
    a.part(`M84 214 L80 222 M84 214 L88 222 M116 214 L112 222 M116 214 L120 222`, 'none', null, { lw: 3.2, line: '#e08a1a' });
    a.part(`M94 84 C92 74 98 68 100 64 C102 70 110 72 106 84Z`, '#ffe066', null);
    a.eyes(78, 122, 134, 7, 9, '#6a4a10');
    a.mouth(100, 156, 10, 'beak').cheeks(64, 136, 158);
    return;
  }
  const body = s === 3 ? '#4a7a9a' : '#9fc4d8', belly = s === 3 ? '#e8f2f6' : '#fdfbf4', crest = s === 3 ? '#2f5470' : '#f2c14a';
  wings(a, body, 140, s === 3 ? 92 : 70, 'feather', s === 3 ? 18 : 6);
  a.part(`M84 196 L68 222 L86 212 L100 224 L114 212 L132 222 L116 196Z`, darker(body, 0.1));
  a.part(bodyPath(100, 116, 210, 50), body);
  a.part(E(100, 172, 28, 34), belly, true);
  a.part(`M84 208 L78 222 M84 208 L90 222 M116 208 L110 222 M116 208 L122 222`, 'none', null, { lw: 3.2, line: '#e08a1a' });
  const hy = 84;
  for (const k of [-1, 0, 1]) a.part(`M${100 + k * 10} ${hy - 38} C${100 + k * 22} ${hy - 66} ${100 + k * 30} ${hy - 76} ${100 + k * 40} ${hy - 80} C${100 + k * 26} ${hy - 58} ${100 + k * 18} ${hy - 48} ${100 + k * 16} ${hy - 36}Z`, crest);
  a.part(headPath(100, hy, 50, 44), body, true, { hi: true });
  a.part(E(100, hy + 14, 30, 22), belly, null, { lw: 0 });
  a.eyes(80, 120, hy - 4, 7, s === 2 ? 3 : 6, s === 3 ? '#e0a81a' : '#3a6a8a', body);
  a.mouth(100, hy + 14, 12, 'beak');
  if (s === 2) a.cheeks(66, 134, hy + 14);
};

/** 찌릿이 → 찌르릉 → 우르릉: an electric eel coiled upright; its fins grow into storm wings. */
const beongae: Draw = (a, s) => {
  const skin = s === 3 ? '#3a3f7a' : s === 2 ? '#e8b830' : '#f6d85a', belly = s === 3 ? '#f2d04a' : '#fff6c8', bolt = s === 3 ? '#ffe14a' : '#ffffff';
  if (s === 3) wings(a, '#5a62a8', 128, 88, 'web', 8);
  // The coil: a fat S from the ground up to the head.
  a.part(`M60 214 C40 214 34 190 52 182 C74 172 140 186 150 166 C160 146 128 132 104 138 C86 142 74 130 84 116 L120 116 C138 126 176 132 178 166 C180 206 120 202 92 202 C80 202 78 210 92 214Z`, skin);
  a.part(`M70 206 C90 196 150 204 162 172`, 'none', null, { lw: 5, line: belly });
  // A lightning fin down the back.
  a.part(`M126 150 L146 128 L140 146 L162 136 L148 166Z`, '#ffe14a', '#e0a81a', { lw: 2 });
  const hy = 80;
  if (s >= 2) for (const sd of [-1, 1]) a.part(`M${100 + sd * 40} ${hy - 10} L${100 + sd * 70} ${hy - 36} L${100 + sd * 60} ${hy - 8} L${100 + sd * 78} ${hy - 12} L${100 + sd * 50} ${hy + 14}Z`, '#ffe14a', '#e0a81a', { lw: 2 });
  a.part(headPath(100, hy, 46, 40), skin, true, { hi: true });
  a.part(`M104 ${hy - 40} L88 ${hy - 70} L100 ${hy - 66} L94 ${hy - 92} L118 ${hy - 56} L106 ${hy - 58}Z`, bolt, '#e0a81a', { lw: 2 });
  a.eyes(82, 118, hy - 2, 6.5, s === 1 ? 9 : s === 2 ? 3 : 6, s === 3 ? '#e0a81a' : '#7a5a10', skin);
  a.mouth(100, hy + 18, 7, s === 3 ? 'grin' : 'open');
  a.add(`<circle cx="66" cy="${hy + 12}" r="7" fill="#ff7a5a" opacity=".7"/><circle cx="134" cy="${hy + 12}" r="7" fill="#ff7a5a" opacity=".7"/>`);
};

/** 데굴이 → 데구르 → 쿵쿵이: an armadillo, rolled up at first; then plated, then horned and huge. */
const jogak: Draw = (a, s) => {
  const plate = s === 3 ? '#6a6458' : s === 2 ? '#8a857a' : '#a8a498', skin = '#d8c4a4';
  if (s === 1) {
    a.part(E(100, 156, 66, 62), plate, true, { hi: true });
    for (const k of [-2, -1, 0, 1, 2]) a.stroke(`M${100 + k * 22} 98 Q${100 + k * 30} 156 ${100 + k * 22} 214`, 2.4);
    a.part(E(100, 172, 36, 30), skin, true);
    a.part(`M78 150 L70 132 L88 146Z M122 150 L130 132 L112 146Z`, skin);
    a.eyes(86, 114, 168, 5.5, 9, '#6a4a2a');
    a.mouth(100, 186, 5, 'cat').cheeks(76, 124, 180, 6);
    return;
  }
  // Plated back as a dome behind.
  a.part(`M30 200 C24 120 60 84 100 84 C140 84 176 120 170 200Z`, plate, true, { hi: true });
  for (const k of [-2, -1, 0, 1, 2]) a.stroke(`M${100 + k * 26} 90 Q${100 + k * 32} 150 ${100 + k * 28} 200`, 2.4);
  if (s >= 2) for (const k of [-2, -1, 0, 1, 2]) a.part(`M${100 + k * 26 - 7} ${92 + Math.abs(k) * 10} L${100 + k * 28} ${70 + Math.abs(k) * 12} L${100 + k * 26 + 7} ${92 + Math.abs(k) * 10}Z`, '#e8e2d4');
  a.part(bodyPath(100, 130, 216, 46), skin);
  feet(a, darker(skin, 0.2), 30, 16);
  arms(a, skin, 160, 38, 11);
  const hy = 118;
  if (s === 3) for (const sd of [-1, 1]) a.part(`M${100 + sd * 26} ${hy - 30} C${100 + sd * 44} ${hy - 50} ${100 + sd * 58} ${hy - 70} ${100 + sd * 54} ${hy - 90} C${100 + sd * 46} ${hy - 70} ${100 + sd * 36} ${hy - 56} ${100 + sd * 14} ${hy - 40}Z`, '#f2ead8');
  pointyEars(a, skin, '#b89a78', hy - 16, 34, 34, 14);
  a.part(headPath(100, hy, 42, 36), skin, true);
  a.part(`M84 ${hy + 10} C84 ${hy + 30} 116 ${hy + 30} 116 ${hy + 10}Z`, darker(skin, 0.08), null, { lw: 0 });
  a.add(`<ellipse cx="100" cy="${hy + 14}" rx="7" ry="4.5" fill="#2b1810"/>`);
  a.eyes(82, 118, hy - 6, 6, s === 2 ? 3 : 6, '#6a4a2a', skin);
  a.mouth(100, hy + 24, 6, s === 3 ? 'fang' : 'cat');
};

/** 꼬물이 → 소라꼬물 → 꼬물성: a snail; its shell becomes a conch, then a little castle. */
const dalpaeng: Draw = (a, s) => {
  const skin = s === 3 ? '#a8b8d0' : s === 2 ? '#f4d8cc' : '#c4e0c4';
  // The foot, low and long, head rising at the front left.
  a.part(`M24 214 C20 200 40 192 70 192 L170 196 C186 198 188 214 176 216Z`, skin);
  if (s === 1) {
    a.part(E(128, 150, 50, 50), '#d89a5a', '#a86a32', { hi: true });
    a.stroke('M128 150 m-8 0 a8 8 0 1 1 16 0 a16 16 0 1 1 -32 0 a26 26 0 1 1 52 0 a36 36 0 1 1 -72 2', 3, '#7a4a22');
  } else if (s === 2) {
    a.part(`M86 196 C70 150 96 92 140 84 C168 80 186 104 172 120 C190 140 184 186 160 196Z`, '#f4c0b0', '#d88a7a', { hi: true });
    for (const k of [0, 1, 2]) a.stroke(`M${106 + k * 18} 98 Q${118 + k * 18} 150 ${108 + k * 20} 194`, 2.4, '#b86a5a');
    a.part(`M140 84 L150 62 L156 86Z M168 104 L188 92 L178 114Z`, '#ffe8e0');
  } else {
    a.part(`M86 196 L86 118 L170 118 L170 196Z`, '#e8ecf2', '#b8c0cc', { hi: true });
    for (const x of [86, 156]) { a.part(`M${x - 6} 118 L${x - 6} 74 L${x + 20} 74 L${x + 20} 118Z`, '#e8ecf2', '#b8c0cc'); a.part(`M${x - 10} 76 L${x + 7} 46 L${x + 24} 76Z`, '#e05a4a'); }
    a.part(`M110 118 L110 64 L146 64 L146 118Z`, '#f2f4f8', '#c8d0dc');
    a.part(`M106 66 L128 26 L150 66Z`, '#e05a4a');
    a.stroke('M128 26 L128 6', 2.4); a.part('M128 6 L146 12 L128 18Z', '#ffd34a', null, { lw: 1.8 });
    a.part(`M118 196 L118 170 C118 160 138 160 138 170 L138 196Z`, '#6a4a3a', null);
    for (const x of [94, 152, 122]) a.part(`M${x} ${x === 122 ? 84 : 132} l10 0 l0 14 l-10 0Z`, '#3a4a6a', null, { lw: 1.8 });
  }
  const hx = 62, hy = s === 1 ? 150 : 140;
  a.part(`M40 196 C40 170 46 ${hy + 10} ${hx} ${hy + 6} L${hx + 24} ${hy + 14} C${hx + 22} ${hy + 30} 84 190 84 196Z`, skin);
  for (const sd of [-1, 1]) {
    a.stroke(`M${hx + sd * 12} ${hy - 26} Q${hx + sd * 14} ${hy - 48} ${hx + sd * 22} ${hy - 58}`, 3.4);
    a.part(E(hx + sd * 22, hy - 60, 6, 6), skin, null, { lw: 2 });
  }
  a.part(headPath(hx, hy, 36, 32), skin, true, { hi: true });
  a.eyes(hx - 14, hx + 14, hy - 2, 5.5, s === 1 ? 9 : s === 2 ? 3 : 1, '#3a6a4a');
  a.mouth(hx, hy + 14, 6, 'smile').cheeks(hx - 24, hx + 24, hy + 10, 6);
};

/** 쪼르르 → 살금이 → 어스름: a shadow mouse with round ears; a ninja scarf, then a dusk hood. */
const geurimja: Draw = (a, s) => {
  const fur = s === 3 ? '#3a3450' : s === 2 ? '#5a4f78' : '#7a7a90', inner = s === 1 ? '#f2b8c0' : '#c890d8', face = s === 3 ? '#5a5478' : lighter(fur, 0.3);
  // A long thin tail curling up.
  a.part(`M120 206 C170 214 192 180 178 150 C170 136 152 140 156 152 C164 168 156 190 118 192Z`, fur);
  if (s === 3) a.part(`M54 110 C30 160 30 200 50 216 L150 216 C170 200 170 160 146 110Z`, '#25222e', '#14121a');
  a.part(bodyPath(100, 132, 216, 46), fur);
  a.part(E(100, 182, 22, 24), face, true);
  feet(a, darker(fur, 0.2), 22, 13);
  arms(a, fur, 156, 34, 9);
  const hy = s === 1 ? 104 : 98;
  if (s === 3) a.part(`M38 ${hy + 10} C30 ${hy - 50} 70 ${hy - 70} 100 ${hy - 70} C130 ${hy - 70} 170 ${hy - 50} 162 ${hy + 10} L150 ${hy + 34} L50 ${hy + 34}Z`, '#25222e', '#14121a');
  else roundEars(a, fur, inner, hy - 36, 44, s === 1 ? 26 : 22);
  a.part(headPath(100, hy, 52, 42), face, true, { hi: true });
  if (s === 2) {
    a.part(`M50 ${hy + 32} C70 ${hy + 46} 130 ${hy + 46} 150 ${hy + 32} L150 ${hy + 44} C130 ${hy + 58} 70 ${hy + 58} 50 ${hy + 44}Z`, '#d8403a');
    a.part(`M144 ${hy + 40} L172 ${hy + 54} L160 ${hy + 64} L140 ${hy + 48}Z`, '#d8403a');
  }
  a.add(`<ellipse cx="100" cy="${hy + 14}" rx="5" ry="4" fill="#f2a8b8" stroke="#2b1810" stroke-width="1.6"/>`);
  a.stroke(`M70 ${hy + 16} L44 ${hy + 12} M70 ${hy + 22} L46 ${hy + 26} M130 ${hy + 16} L156 ${hy + 12} M130 ${hy + 22} L154 ${hy + 26}`, 1.6);
  a.eyes(80, 120, hy - 4, 7, s === 1 ? 9 : s === 2 ? 3 : 6, s === 3 ? '#c890ff' : '#8a6ab8', face);
  a.mouth(100, hy + 24, 5, 'cat');
};

/** 사뿐이 → 꽃사뿐 → 봄사뿐: a spotted fawn; flowers on its head, then a white deer with blossom antlers. */
const kkotsasum: Draw = (a, s) => {
  const fur = s === 3 ? '#f6e2d0' : '#d8a07a', cream = '#fff4ea';
  a.part(bodyPath(100, 132, 216, 46), fur);
  // Thin legs.
  for (const x of [80, 120]) a.part(`M${x - 7} 190 L${x - 6} 214 L${x + 6} 214 L${x + 7} 190Z`, darker(fur, 0.1));
  a.part(E(100, 176, 20, 24), cream, null, { lw: 0 });
  if (s < 3) for (const [x, y] of [[74, 150], [128, 146], [116, 166], [82, 172]]) a.add(`<circle cx="${x}" cy="${y}" r="4.5" fill="${cream}"/>`);
  const hy = 96;
  if (s === 3) for (const sd of [-1, 1]) {
    a.part(`M${100 + sd * 22} ${hy - 34} C${100 + sd * 30} ${hy - 64} ${100 + sd * 44} ${hy - 76} ${100 + sd * 60} ${hy - 82} M${100 + sd * 36} ${hy - 60} C${100 + sd * 50} ${hy - 58} ${100 + sd * 62} ${hy - 48} ${100 + sd * 68} ${hy - 40}`, 'none', null, { lw: 6, line: '#a8865a' });
    blossom(a, 100 + sd * 60, hy - 82, 10, '#f27aa8');
    blossom(a, 100 + sd * 68, hy - 40, 8, '#ffffff', '#f27aa8');
  }
  // Long ears out to the sides.
  for (const sd of [-1, 1]) {
    a.part(`M${100 + sd * 36} ${hy - 22} C${100 + sd * 70} ${hy - 40} ${100 + sd * 86} ${hy - 26} ${100 + sd * 84} ${hy - 12} C${100 + sd * 70} ${hy - 4} ${100 + sd * 50} ${hy - 6} ${100 + sd * 40} ${hy - 2}Z`, fur);
    a.add(`<path d="M${100 + sd * 46} ${hy - 16} C${100 + sd * 66} ${hy - 28} ${100 + sd * 76} ${hy - 22} ${100 + sd * 76} ${hy - 14} C${100 + sd * 66} ${hy - 10} ${100 + sd * 54} ${hy - 10} ${100 + sd * 46} ${hy - 8}Z" fill="#f2b8a8"/>`);
  }
  a.part(headPath(100, hy, 46, 44), fur, true, { hi: true });
  a.part(E(100, hy + 22, 20, 14), cream, null, { lw: 0 });
  a.add(`<ellipse cx="100" cy="${hy + 14}" rx="6" ry="4.2" fill="#2b1810"/>`);
  if (s === 2) { blossom(a, 78, hy - 40, 12); blossom(a, 118, hy - 44, 10, '#ffffff', '#f2a7c3'); blossom(a, 98, hy - 46, 8, '#f2a7c3'); }
  a.eyes(80, 120, hy - 4, 7, s === 1 ? 9 : s === 2 ? 3 : 8, '#8a4a2a', fur);
  a.mouth(100, hy + 24, 5, 'cat').cheeks(66, 134, hy + 14);
};

/** 뒤뚱이 → 미끄덩 → 꽁꽁대장: a penguin chick; a snow scarf, then an emperor with an ice crown. */
const eoreum: Draw = (a, s) => {
  const back = s === 3 ? '#1f2f4a' : s === 2 ? '#3a5a88' : '#4a5a70', front = '#f4f7fa';
  const top = s === 1 ? 70 : 52;
  a.part(`M100 ${top} C150 ${top} 168 130 164 176 C160 208 136 218 100 218 C64 218 40 208 36 176 C32 130 50 ${top} 100 ${top}Z`, back, true, { hi: true });
  a.part(`M100 ${top + 38} C132 ${top + 38} 146 130 144 170 C142 200 126 212 100 212 C74 212 58 200 56 170 C54 130 68 ${top + 38} 100 ${top + 38}Z`, front, '#c8d8e4');
  // Flippers.
  for (const sd of [-1, 1]) a.part(`M${100 + sd * 58} 130 C${100 + sd * 82} 146 ${100 + sd * 86} 176 ${100 + sd * 76} 188 C${100 + sd * 66} 182 ${100 + sd * 60} 160 ${100 + sd * 56} 150Z`, back);
  feet(a, '#ffb43a', 22, 13, 216);
  const ey = top + 60;
  if (s === 3) a.part(`M100 ${top + 40} C112 ${top + 54} 124 ${top + 60} 140 ${top + 60} C130 ${top + 70} 120 ${top + 80} 118 ${top + 96} L82 ${top + 96} C80 ${top + 80} 70 ${top + 70} 60 ${top + 60} C76 ${top + 60} 88 ${top + 54} 100 ${top + 40}Z`, '#ffd34a', '#e0a81a', { lw: 0 });
  a.eyes(80, 120, ey, 7, s === 1 ? 9 : s === 2 ? 3 : 6, '#2a4a7a', front);
  a.mouth(100, ey + 18, 10, 'beak').cheeks(66, 134, ey + 16);
  if (s === 2) {
    a.part(`M52 ${top + 100} C70 ${top + 112} 130 ${top + 112} 148 ${top + 100} L148 ${top + 114} C130 ${top + 126} 70 ${top + 126} 52 ${top + 114}Z`, '#d8eef7');
    a.part(`M126 ${top + 112} L134 ${top + 148} L118 ${top + 146} L114 ${top + 116}Z`, '#d8eef7');
  }
  if (s === 3) {
    a.part(`M66 ${top + 8} L60 ${top - 26} L78 ${top - 4} L88 ${top - 36} L100 ${top - 6} L112 ${top - 36} L122 ${top - 4} L140 ${top - 26} L134 ${top + 8} C120 ${top} 80 ${top} 66 ${top + 8}Z`, '#bfe8fa', '#7ac4ea');
  }
  if (s === 1) a.part(`M92 ${top - 2} C94 ${top - 14} 102 ${top - 18} 106 ${top - 20} C104 ${top - 12} 108 ${top - 6} 108 ${top + 2}Z`, back, null);
};

/** 꼼지락 → 파고파 → 우지끈: a mole with big digging paws; a miner's helmet, then a drill horn. */
const dudeoji: Draw = (a, s) => {
  const fur = s === 3 ? '#4e3a2e' : s === 2 ? '#6a4c38' : '#7a5c48', nose = '#ff9aa8', paw = '#f2c8b0';
  a.part(bodyPath(100, 104, 216, 62), fur, true, { hi: true });
  a.part(E(100, 178, 30, 28), lighter(fur, 0.25), null, { lw: 0 });
  feet(a, paw, 28, 14);
  // Big shovel paws held up.
  for (const sd of [-1, 1]) {
    a.part(`M${100 + sd * 44} 150 C${100 + sd * 70} 132 ${100 + sd * 86} 140 ${100 + sd * 84} 160 C${100 + sd * 82} 176 ${100 + sd * 62} 180 ${100 + sd * 48} 172Z`, paw);
    for (const k of [0, 1, 2]) a.part(`M${100 + sd * (72 + k * 5)} ${140 + k * 9} l${sd * 14} ${-4 + k * 2} l${-sd * 6} 8Z`, '#fff8ec', null, { lw: 1.6 });
  }
  const hy = 136;
  if (s === 2) {
    a.part(`M50 ${hy - 50} C50 ${hy - 96} 150 ${hy - 96} 150 ${hy - 50} L160 ${hy - 44} L40 ${hy - 44}Z`, '#f2c14a', '#d89a1a');
    a.part(E(100, hy - 70, 12, 10), '#fff6c8', null, { lw: 2 });
  }
  if (s === 3) a.part(`M84 ${hy - 50} L100 ${hy - 112} L116 ${hy - 50}Z`, '#c8ccd4', '#8a909c');
  if (s === 3) for (const k of [0, 1, 2]) a.stroke(`M${88 + k * 3} ${hy - 62 - k * 18} L${112 - k * 3} ${hy - 70 - k * 18}`, 2.2);
  // Snout and face on the body's front.
  a.part(E(100, hy + 10, 18, 13), lighter(fur, 0.3), null, { lw: 2 });
  a.part(E(100, hy + 4, 11, 8), nose, true, { lw: 2 });
  a.eyes(76, 124, hy - 18, s === 1 ? 5.5 : 6, s === 1 ? 9 : s === 2 ? 3 : 6, '#3a2a20', fur);
  a.mouth(100, hy + 26, 7, s === 3 ? 'grin' : 'smile').cheeks(62, 138, hy + 6);
};

/** 반짝이 → 초롱이 → 달빛이: a firefly with a glowing tail; a lantern bug, then a moon moth with a halo. */
const bandi: Draw = (a, s) => {
  const body = s === 3 ? '#e8e4f8' : s === 2 ? '#6a5a3a' : '#4a4d34', glow = s === 3 ? '#bfe4ff' : '#eef27a';
  wings(a, s === 3 ? '#ffffff' : '#d8f0f8', 112, s === 3 ? 92 : 66, s === 3 ? 'moth' : 'petal', 10);
  a.glow(100, 176, 70, glow);
  // Glowing tail (abdomen).
  a.part(E(100, 178, 40, 40), glow, s === 3 ? '#8ac4e8' : '#c8d44a', { hi: true });
  for (const k of [0, 1]) a.stroke(`M66 ${164 + k * 18} Q100 ${172 + k * 18} 134 ${164 + k * 18}`, 2.2, darker(glow, 0.4));
  a.part(E(100, 132, 32, 22), body);
  for (const sd of [-1, 1]) a.stroke(`M${100 + sd * 22} 142 L${100 + sd * 40} 158 M${100 + sd * 26} 134 L${100 + sd * 46} 140`, 3);
  const hy = 92;
  for (const sd of [-1, 1]) {
    a.stroke(`M${100 + sd * 16} ${hy - 36} Q${100 + sd * 22} ${hy - 62} ${100 + sd * (s === 3 ? 44 : 36)} ${hy - 70}`, 3);
    if (s === 3) a.part(leaf(100 + sd * 44, hy - 70, 20, sd * 0.7, 0.5), '#ffffff', '#c8c4e8', { lw: 1.8 });
    else a.part(E(100 + sd * 36, hy - 72, 7, 7), s === 2 ? '#f2c14a' : glow, null, { lw: 2 });
  }
  if (s === 3) halo(a, 100, hy - 50, 38);
  a.part(headPath(100, hy, 44, 38), s === 3 ? '#ffffff' : body, true, { hi: true });
  const sk = s === 3 ? '#ffffff' : body;
  a.eyes(82, 118, hy - 2, 7, s === 1 ? 9 : s === 2 ? 3 : 8, s === 3 ? '#6a8ad8' : '#c8d44a', sk);
  a.mouth(100, hy + 18, 6, 'smile');
  if (s === 3) a.cheeks(68, 132, hy + 14);
};

/** 뜨끈게 → 부글게 → 활활게: a volcano crab; its shell sprouts spikes, then a crown of magma. */
const yongamge: Draw = (a, s) => {
  const shell = s === 3 ? '#8a2a1a' : s === 2 ? '#c8381f' : '#e0603a', claw = s === 3 ? '#a8321f' : s === 2 ? '#d8482a' : '#f07a4a';
  // Legs.
  for (const sd of [-1, 1]) for (const k of [0, 1, 2]) a.stroke(`M${100 + sd * 40} ${180 + k * 8} L${100 + sd * (70 + k * 6)} ${196 + k * 6} L${100 + sd * (74 + k * 8)} 218`, 6, '#4a2416');
  for (const sd of [-1, 1]) for (const k of [0, 1, 2]) a.stroke(`M${100 + sd * 40} ${180 + k * 8} L${100 + sd * (70 + k * 6)} ${196 + k * 6} L${100 + sd * (74 + k * 8)} 218`, 3, claw);
  // Claws up.
  for (const sd of [-1, 1]) {
    a.part(`M${100 + sd * 46} 160 C${100 + sd * 66} 150 ${100 + sd * 70} 130 ${100 + sd * 66} 118`, 'none', null, { lw: 9, line: '#4a2416' });
    a.stroke(`M${100 + sd * 46} 160 C${100 + sd * 66} 150 ${100 + sd * 70} 130 ${100 + sd * 66} 118`, 5, claw);
    a.part(`M${100 + sd * 66} 118 C${100 + sd * 44} 112 ${100 + sd * 44} 76 ${100 + sd * 68} 66 C${100 + sd * 70} 84 ${100 + sd * 76} 92 ${100 + sd * 86} 92 C${100 + sd * 92} 70 ${100 + sd * 82} 60 ${100 + sd * 74} 58 C${100 + sd * 100} 56 ${100 + sd * 104} 108 ${100 + sd * 66} 118Z`, claw, true, { hi: true });
  }
  a.part(`M34 168 C34 126 66 110 100 110 C134 110 166 126 166 168 C166 194 134 200 100 200 C66 200 34 194 34 168Z`, shell, true, { hi: true });
  for (const [x, y, r] of [[70, 140, 8], [126, 136, 10], [104, 128, 6], [140, 160, 6]] as const) a.add(`<circle cx="${x}" cy="${y}" r="${r}" fill="${darker(shell, 0.25)}"/>`);
  if (s >= 2) for (const k of [-2, -1, 0, 1, 2]) a.part(`M${100 + k * 24 - 8} ${116 + Math.abs(k) * 6} L${100 + k * 26} ${96 + Math.abs(k) * 8} L${100 + k * 24 + 8} ${116 + Math.abs(k) * 6}Z`, s === 3 ? '#ffb43a' : '#e8d8c8');
  if (s === 3) { a.flame(flamePath(100, 104, 12, 30)); a.flame(flamePath(70, 116, 9, 22, -0.3)); a.flame(flamePath(130, 116, 9, 22, 0.3)); }
  // Eyes on stalks.
  for (const sd of [-1, 1]) { a.stroke(`M${100 + sd * 16} 140 L${100 + sd * 20} 118`, 5); a.part(E(100 + sd * 20, 112, 13, 14), '#fff8ec', null, { lw: 2.2 }); }
  a.eyes(80, 120, 113, 5.5, s === 1 ? 9 : s === 2 ? 3 : 6, '#c4401a', '#fff8ec');
  a.mouth(100, 166, 12, s === 3 ? 'grin' : 'smile').cheeks(66, 134, 160);
};

/** 몽글이 → 뭉게이 → 먹구름: a lamb of cloud; a little bolt, then a storm ram with curled horns. */
const gureumyang: Draw = (a, s) => {
  const fleece = s === 3 ? '#8a96a8' : s === 2 ? '#d8dee6' : '#f6f3ea', face = s === 3 ? '#2a2a30' : '#5a5a66';
  // Legs.
  for (const x of [76, 124]) a.part(`M${x - 8} 188 L${x - 7} 214 L${x + 7} 214 L${x + 8} 188Z`, face);
  // Puffy cloud body: a ring of bumps.
  let d = '';
  const cx = 100, cy = 150, R = s === 1 ? 60 : 66;
  for (let k = 0; k < 9; k++) { const an = (k / 9) * Math.PI * 2; d += E(cx + Math.cos(an) * R * 0.72, cy + Math.sin(an) * R * 0.62, R * 0.42, R * 0.42); }
  a.part(d, fleece, true, { lw: 2.4 });
  a.part(E(cx, cy, R * 0.8, R * 0.66), fleece, null, { lw: 0 });
  if (s === 2) a.part(`M150 110 L170 82 L164 102 L186 96 L160 134 L164 114Z`, '#ffe14a', '#e0a81a', { lw: 2 });
  if (s === 3) {
    a.part(`M138 130 L156 102 L150 122 L170 116 L146 152 L150 134Z`, '#ffe14a', '#e0a81a', { lw: 2 });
    for (const k of [0, 1, 2]) a.stroke(`M${60 + k * 30} 206 l-6 14`, 3, '#7ac4ea');
  }
  const hy = 118;
  if (s === 3) for (const sd of [-1, 1]) a.part(`M${100 + sd * 26} ${hy - 26} C${100 + sd * 62} ${hy - 52} ${100 + sd * 82} ${hy - 6} ${100 + sd * 56} ${hy + 12} C${100 + sd * 46} ${hy + 16} ${100 + sd * 40} ${hy + 4} ${100 + sd * 52} ${hy - 4} C${100 + sd * 62} ${hy - 14} ${100 + sd * 48} ${hy - 28} ${100 + sd * 30} ${hy - 12}Z`, '#d8c8a0', '#a8946a');
  for (const sd of [-1, 1]) a.part(`M${100 + sd * 30} ${hy - 8} C${100 + sd * 52} ${hy - 12} ${100 + sd * 64} ${hy - 2} ${100 + sd * 62} ${hy + 8} C${100 + sd * 50} ${hy + 10} ${100 + sd * 40} ${hy + 6} ${100 + sd * 30} ${hy + 4}Z`, face);
  a.part(headPath(100, hy, 32, 34), face, true, { hi: true });
  // A tuft of fleece on top.
  a.part(E(88, hy - 34, 14, 12) + E(104, hy - 38, 15, 13) + E(116, hy - 30, 12, 10), fleece, true, { lw: 2.2 });
  a.eyes(86, 114, hy + 2, 5.5, s === 1 ? 9 : s === 2 ? 3 : 6, '#e8c84a', face);
  a.mouth(100, hy + 20, 5, 'cat');
  a.cheeks(76, 124, hy + 16, 6);
};

/** 별냥이 → 별똥냥 → 은하냥: a navy kitten with a star on its brow; a star-trail tail, then a galaxy. */
const byeolnyang: Draw = (a, s) => {
  const fur = s === 3 ? '#1a1a3a' : s === 2 ? '#2a2f5a' : '#4a4f7a', inner = '#f2b8c8';
  // Tail, ending in a star (from the second form).
  a.part(`M118 204 C170 212 186 160 166 124 C160 114 148 118 152 128 C164 154 154 184 116 190Z`, fur);
  if (s >= 2) { a.part(star(162, 114, 18), '#ffe14a', '#e0a81a', { lw: 2 }); a.stroke('M150 132 l-14 10 M156 140 l-12 14', 2.4, '#ffe14a'); }
  a.part(bodyPath(100, 130, 216, 46), fur);
  if (s === 3) for (const [x, y] of [[84, 160], [114, 176], [96, 196], [122, 150]]) a.part(star(x, y, 4.5), '#ffffff', null, { lw: 0 });
  feet(a, lighter(fur, 0.2), 22, 13);
  const hy = 98;
  if (s === 3) halo(a, 100, hy - 56, 40, '#bfe4ff');
  pointyEars(a, fur, inner, hy - 18, 36, 52, 22);
  a.part(headPath(100, hy, 54, 44), fur, true, { hi: true });
  a.part(star(100, hy - 26, 10), '#ffe14a', '#e0a81a', { lw: 1.8 });
  a.stroke(`M66 ${hy + 16} L42 ${hy + 10} M66 ${hy + 22} L44 ${hy + 26} M134 ${hy + 16} L158 ${hy + 10} M134 ${hy + 22} L156 ${hy + 26}`, 1.8, '#c8c8e8');
  a.eyes(78, 122, hy, 7.5, s === 3 ? 6 : 8, '#e0b81a', fur);
  a.add(`<path d="M96 ${hy + 14} L104 ${hy + 14} L100 ${hy + 19}Z" fill="#f2a8b8"/>`);
  a.mouth(100, hy + 21, 6, 'cat');
  a.cheeks(64, 136, hy + 16, 7, '#ff9ac0');
};

/** 꼬마룡 → 날개룡 → 하늘룡: a baby dragon; it grows wings, then turns sky blue with a halo. */
const agiyong: Draw = (a, s) => {
  const skin = s === 3 ? '#4a6ac8' : s === 2 ? '#d8582a' : '#f07a4a', belly = s === 3 ? '#cfe8ff' : '#ffe0a0', horn = s === 3 ? '#e8f4ff' : '#fff0c8';
  if (s >= 2) wings(a, s === 3 ? '#7a9ae8' : '#f2a03a', 136, s === 3 ? 92 : 74, 'web', 12);
  a.part(`M120 200 C170 210 190 176 180 150 C188 150 196 140 194 128 C182 134 172 132 166 140 C170 166 156 182 118 186Z`, skin);
  a.part(bodyPath(100, 128, 216, 50), skin);
  a.part(`M100 140 C116 140 124 160 122 180 C120 204 110 210 100 210 C90 210 80 204 78 180 C76 160 84 140 100 140Z`, belly, true);
  for (const k of [0, 1, 2, 3]) a.stroke(`M86 ${158 + k * 13} Q100 ${163 + k * 13} 114 ${158 + k * 13}`, 1.8, darker(belly, 0.3));
  feet(a, skin, 26, 14);
  arms(a, skin, 154, 40, 10);
  const hy = 90;
  for (const sd of [-1, 1]) a.part(`M${100 + sd * 26} ${hy - 32} C${100 + sd * 34} ${hy - 50} ${100 + sd * 40} ${hy - 60} ${100 + sd * 38} ${hy - 72} C${100 + sd * 48} ${hy - 58} ${100 + sd * 46} ${hy - 42} ${100 + sd * 40} ${hy - 26}Z`, horn);
  for (const sd of [-1, 1]) a.part(`M${100 + sd * 50} ${hy - 6} L${100 + sd * 76} ${hy - 14} L${100 + sd * 52} ${hy + 10}Z`, s === 3 ? '#9ab4f2' : '#f2c14a');
  if (s === 3) halo(a, 100, hy - 60, 30, '#bfe4ff');
  a.part(headPath(100, hy, 54, 44), skin, true, { hi: true });
  a.part(E(100, hy + 22, 26, 15), lighter(skin, 0.25), null, { lw: 0 });
  a.add(`<circle cx="92" cy="${hy + 16}" r="2.6" fill="#2b1810"/><circle cx="108" cy="${hy + 16}" r="2.6" fill="#2b1810"/>`);
  a.eyes(76, 124, hy - 6, 7.5, s === 1 ? 9 : s === 2 ? 3 : 6, s === 3 ? '#3a8ad8' : '#e0a81a', skin);
  a.mouth(100, hy + 26, 8, s === 1 ? 'open' : 'fang').cheeks(62, 138, hy + 14);
};

/** 엉금이 → 엉금엉금 → 큰산거북: a turtle with a leafy shell; flowers on it, then a little mountain with trees. */
const geobuk: Draw = (a, s) => {
  const skin = s === 3 ? '#a8865a' : '#a8cc7a', shell = s === 3 ? '#6a8a4a' : s === 2 ? '#7aa45a' : '#8ab46a';
  for (const x of [56, 144]) a.part(`M${x - 14} 180 L${x - 14} 214 L${x + 14} 214 L${x + 14} 180Z`, skin);
  a.part(E(100, 194, 56, 16), '#f2e2b0', '#d8c48a');
  if (s === 3) {
    a.part(`M26 190 C26 140 50 104 100 104 C150 104 174 140 174 190Z`, shell, true, { hi: true });
    a.part(`M40 178 L76 96 L96 126 L118 72 L160 178Z`, '#8a8478', '#5a564e');
    a.part(`M106 96 L118 72 L130 98 C122 104 112 104 106 96Z`, '#ffffff', null, { lw: 1.8 });
    for (const [x, y] of [[56, 156], [146, 150], [92, 164]]) { a.part(`M${x - 3} ${y + 14} L${x - 3} ${y} L${x + 3} ${y} L${x + 3} ${y + 14}Z`, '#6a4a22', null, { lw: 1.6 }); a.part(`M${x} ${y - 22} L${x + 12} ${y + 2} L${x - 12} ${y + 2}Z`, '#3f7a3a', '#2a5a2a', { lw: 1.8 }); }
  } else {
    a.part(`M28 190 C28 130 56 96 100 96 C144 96 172 130 172 190Z`, shell, true, { hi: true });
    for (const [x, y] of [[100, 126], [66, 152], [134, 152], [100, 170]] as const) a.part(`M${x} ${y - 18} L${x + 18} ${y - 8} L${x + 18} ${y + 10} L${x} ${y + 18} L${x - 18} ${y + 10} L${x - 18} ${y - 8}Z`, darker(shell, 0.12), null, { lw: 1.8 });
    a.part(leaf(80, 98, 30, -0.6), '#5fa64a', true, { lw: 2 });
    a.part(leaf(84, 98, 26, 0.7), '#72b856', true, { lw: 2 });
    if (s === 2) { blossom(a, 132, 108, 11); blossom(a, 60, 128, 9, '#ffffff', '#f2a7c3'); }
  }
  // Head out at the front.
  const hy = 150;
  a.part(headPath(100, hy, 40, 32), skin, true, { hi: true });
  a.eyes(84, 116, hy - 4, 6, s === 1 ? 9 : 1, s === 3 ? '#6a4a22' : '#3f6a2a');
  a.mouth(100, hy + 14, 8, 'smile').cheeks(72, 128, hy + 10, 6);
};

/** 해롱이 → 하늘하늘 → 너울이: a jellyfish; frilly petals, then a deep violet bell with a crown. */
const haepari: Draw = (a, s) => {
  const bell = s === 3 ? '#3a2a6a' : s === 2 ? '#8ad0c8' : '#d8b8f0', frill = s === 3 ? '#f2a7e0' : s === 2 ? '#c8f0ea' : '#f0e0fa';
  a.glow(100, 110, 90, s === 3 ? '#9ad6f2' : '#ffffff');
  // Tentacles.
  for (const k of [-3, -2, -1, 0, 1, 2, 3]) {
    const x = 100 + k * 14;
    a.part(`M${x} 140 C${x + 12} 166 ${x - 12} 190 ${x + 4} 216`, 'none', null, { lw: 8, line: '#4a2416' });
    a.stroke(`M${x} 140 C${x + 12} 166 ${x - 12} 190 ${x + 4} 216`, 4.5, frill);
  }
  // Frilly skirt.
  let d = 'M34 140 ';
  for (let k = 0; k <= 8; k++) d += `Q${34 + k * 16.5 + 8} ${156} ${34 + (k + 1) * 16.5} 140 `;
  a.part(d + 'L166 128 L34 128Z', frill, true, { lw: 2.2 });
  a.part(`M30 136 C26 70 60 40 100 40 C140 40 174 70 170 136 C140 148 60 148 30 136Z`, bell, true, { hi: true });
  a.add(`<path d="M58 70 C66 56 80 50 92 48" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".55"/>`);
  if (s === 2) for (const x of [70, 130]) blossom(a, x, 58, 10, '#ffffff', '#8ad0c8');
  if (s === 3) crown(a, 100, 46, 26, '#ffd34a', '#9ad6f2');
  a.eyes(80, 120, 100, 7, s === 1 ? 9 : s === 2 ? 3 : 8, s === 3 ? '#9ad6f2' : '#8a4ab8', bell);
  a.mouth(100, 120, 6, 'smile').cheeks(64, 136, 116);
};

/** By unit id: how to draw each 정령. */
export const SPIRIT_ART: Record<string, Draw> = {
  dochi, bulttong, mulbang, saessak, somteol, beongae, jogak, dalpaeng, geurimja, kkotsasum,
  eoreum, dudeoji, bandi, yongamge, gureumyang, byeolnyang, agiyong, geobuk, haepari,
};

/** A 정령 as an SVG picture at a number of stars (its form), or null for one without a drawing. */
export function spiritSvg(id: string, star: number, shadow = true): string | null {
  const fn = SPIRIT_ART[id];
  if (!fn) return null;
  const a = new Art();
  fn(a, Math.max(1, Math.min(3, star)) as Stage);
  return a.svg(shadow);
}

export { mix };
