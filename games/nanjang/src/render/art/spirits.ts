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
  const skin = s === 3 ? '#4a9ad8' : s === 2 ? '#5cb0e4' : '#7fd0f2', belly = '#e6f8ff', gill = s === 3 ? '#9adcff' : s === 2 ? '#ff86b0' : '#ff9fbf';
  if (s === 3) wings(a, '#bfe8fa', 140, 74, 'petal', 6);
  // Tail: a thin one at first, a big fan fin from the second form.
  if (s === 1) a.part(`M126 190 C166 194 190 172 192 150 C180 160 162 166 140 168Z`, lighter(skin, 0.25));
  else a.part(`M120 196 C150 206 170 196 176 180 C186 188 204 180 208 164 C196 166 190 158 196 140 C182 146 172 158 168 168 C156 176 140 178 124 176Z`, lighter(skin, 0.35));
  const top = s === 1 ? 134 : 120;
  a.part(bodyPath(100, top, 216, s === 1 ? 48 : 52), skin);
  a.part(E(100, 182, 22, 28), belly, true);
  if (s >= 2) for (const [x, y] of [[72, 156], [130, 150], [126, 178]]) a.add(`<circle cx="${x}" cy="${y}" r="4" fill="${lighter(skin, 0.45)}"/>`);
  feet(a, skin, 26, 13);
  if (s >= 2) arms(a, skin, top + 30, 44, 10, 6);
  const hy = s === 1 ? 98 : 82;
  for (const sd of [-1, 1]) {
    if (s === 1) for (const [dy, l] of [[-24, 30], [-2, 36], [20, 28]] as const) {
      const x0 = 100 + sd * 52, x1 = x0 + sd * l, y = hy + dy;
      a.part(`M${x0} ${y + 6} C${x0 + sd * l * 0.5} ${y - 6} ${x1} ${y - 10} ${x1 + sd * 4} ${y - 2} C${x1} ${y + 8} ${x0 + sd * l * 0.4} ${y + 14} ${x0} ${y + 12}Z`, gill);
    } else {
      // Two long wavy plumes each side.
      for (const [dy, l] of [[-22, 50], [6, 44]] as const) {
        const x0 = 100 + sd * 50, y = hy + dy;
        a.part(`M${x0} ${y} C${x0 + sd * l * 0.3} ${y - 22} ${x0 + sd * l * 0.7} ${y - 4} ${x0 + sd * l} ${y - 26} C${x0 + sd * l * 0.9} ${y - 2} ${x0 + sd * l * 0.5} ${y + 12} ${x0} ${y + 12}Z`, gill);
      }
    }
  }
  a.part(headPath(100, hy, 58, 44), skin, true, { hi: true });
  if (s >= 2) a.part(`M76 ${hy - 36} C80 ${hy - 70} 104 ${hy - 86} 128 ${hy - 84} C116 ${hy - 70} 120 ${hy - 52} 126 ${hy - 38}Z`, lighter(skin, 0.3));
  else a.part(`M88 ${hy - 42} C90 ${hy - 52} 98 ${hy - 58} 100 ${hy - 62} C104 ${hy - 56} 112 ${hy - 52} 112 ${hy - 42}Z`, lighter(skin, 0.3));
  a.eyes(70, 130, hy, 7, s === 1 ? 9 : s === 2 ? 3 : 1, '#2a6aa8', skin);
  a.mouth(100, hy + 18, s === 1 ? 20 : 14, s === 2 ? 'open' : 'smile').cheeks(58, 142, hy + 16);
};

/** 싹싹이 → 쑥쑥이 → 무럭이: a squirrel with a sprout; it flowers, then grows branch antlers. */
const saessak: Draw = (a, s) => {
  const fur = s === 3 ? '#8a6a3a' : s === 2 ? '#9cc064' : '#b8d888', belly = '#fff4d6', leafC = s === 3 ? '#4f9442' : '#6cb052';
  // Tail: leafy and bushy at first, one big leaf in the second form.
  if (s === 2) a.part(leaf(118, 196, 110, 0.55, 0.38), '#5fa64a', true, { lw: 2.4 });
  else {
    a.part(`M120 200 C176 206 196 150 176 112 C164 90 136 92 136 116 C150 118 160 140 150 158 C144 172 130 176 116 178Z`, s === 3 ? '#6a9a48' : '#8cc46a');
    a.part(leaf(170, 98, 30, 0.5), leafC, true, { lw: 2 });
  }
  if (s === 2) a.stroke('M126 190 Q150 150 176 112', 2, '#3f7a2a');
  const hy = s === 1 ? 98 : 86;
  a.part(bodyPath(100, s === 1 ? 128 : 120, 216, s === 1 ? 50 : 54), fur);
  a.part(E(100, 178, 24, 28), belly, true);
  feet(a, darker(fur, 0.15), 24, 13);
  arms(a, fur, s === 1 ? 150 : 144, 38, 10, s === 2 ? 10 : 0);
  if (s === 3) {
    for (const sd of [-1, 1]) {
      a.part(`M${100 + sd * 26} ${hy - 38} C${100 + sd * 34} ${hy - 70} ${100 + sd * 48} ${hy - 84} ${100 + sd * 64} ${hy - 88} M${100 + sd * 40} ${hy - 66} C${100 + sd * 54} ${hy - 66} ${100 + sd * 64} ${hy - 58} ${100 + sd * 72} ${hy - 50}`, 'none', null, { lw: 7, line: '#6a4a22' });
      a.part(leaf(100 + sd * 64, hy - 88, 22, sd * 0.9), leafC, true, { lw: 1.8 });
      a.part(leaf(100 + sd * 72, hy - 50, 18, sd * 1.6), leafC, true, { lw: 1.8 });
    }
  }
  // Ears: pointed fur, or (second form) two big leaves.
  if (s === 2) for (const sd of [-1, 1]) a.part(leaf(100 + sd * 34, hy - 26, 50, sd * 0.55, 0.36), leafC, true, { lw: 2.2 });
  else pointyEars(a, fur, '#f2c8a0', hy - 22, 36, 44, 18);
  a.part(headPath(100, hy, 54, 44), fur, true, { hi: true });
  a.part(E(100, hy + 18, 26, 16), belly, null, { lw: 0 });
  // The sprout (a bud in the second form).
  a.stroke(`M100 ${hy - 44} C100 ${hy - 56} 98 ${hy - 62} 96 ${hy - 66}`, 3.2, '#3f7a2a');
  if (s === 2) {
    a.part(`M96 ${hy - 64} C80 ${hy - 70} 82 ${hy - 96} 96 ${hy - 104} C110 ${hy - 96} 112 ${hy - 72} 96 ${hy - 64}Z`, '#f27aa8', '#c84a7a', { lw: 2 });
    a.part(leaf(96, hy - 64, 20, -1.2), leafC, true, { lw: 1.8 }); a.part(leaf(96, hy - 64, 20, 1.2), leafC, true, { lw: 1.8 });
  } else {
    a.part(leaf(96, hy - 64, s === 1 ? 26 : 30, -0.9), leafC, true, { lw: 2 });
    a.part(leaf(98, hy - 64, s === 1 ? 22 : 26, 0.8), lighter(leafC, 0.15), true, { lw: 2 });
  }
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
  const skin = s === 3 ? '#3a3f7a' : s === 2 ? '#f2b030' : '#f6d85a', belly = s === 3 ? '#f2d04a' : '#fff6c8', bolt = s === 3 ? '#ffe14a' : '#ffffff';
  if (s === 3) wings(a, '#5a62a8', 128, 88, 'web', 8);
  a.part(`M60 214 C40 214 34 190 52 182 C74 172 140 186 150 166 C160 146 128 132 104 138 C86 142 74 130 84 116 L120 116 C138 126 176 132 178 166 C180 206 120 202 92 202 C80 202 78 210 92 214Z`, skin);
  a.part(`M70 206 C90 196 150 204 162 172`, 'none', null, { lw: 5, line: belly });
  if (s >= 2) for (const [x, y] of [[66, 186], [104, 188], [148, 182], [166, 150], [112, 128]]) a.add(`<path d="M${x - 5} ${y - 7} L${x + 5} ${y + 7}" stroke="${s === 3 ? '#f2d04a' : '#4a2416'}" stroke-width="5" stroke-linecap="round"/>`);
  a.part(`M126 150 L146 128 L140 146 L162 136 L148 166Z`, '#ffe14a', '#e0a81a', { lw: 2 });
  const hy = s === 1 ? 80 : 72;
  // From the second form: a frill of sparks round the neck and two whiskers.
  if (s >= 2) {
    let d = '';
    for (let k = 0; k <= 8; k++) { const an = Math.PI * (1.0 + k / 8), r1 = 46, r2 = k % 2 ? 58 : 74; d += `${k ? 'L' : 'M'}${100 + Math.cos(an) * r1} ${hy + 10 + Math.sin(an) * r1 * 0.9} L${100 + Math.cos(an + Math.PI / 16) * r2} ${hy + 10 + Math.sin(an + Math.PI / 16) * r2 * 0.9} `; }
    a.part(d + 'Z', s === 3 ? '#f2d04a' : '#ffe98a', '#e0a81a', { lw: 2 });
  }
  a.part(headPath(100, hy, 46, 40), skin, true, { hi: true });
  if (s >= 2) for (const sd of [-1, 1]) a.stroke(`M${100 + sd * 20} ${hy + 22} C${100 + sd * 40} ${hy + 30} ${100 + sd * 50} ${hy + 44} ${100 + sd * 46} ${hy + 58}`, 2.6);
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
  if (s === 3) {
    // Rock fists and boulder shoulders.
    for (const sd of [-1, 1]) {
      a.part(E(100 + sd * 52, 132, 22, 18), '#8a8478', '#5a564e');
      a.part(E(100 + sd * 60, 178, 22, 20), '#9a9488', '#6a665e', { hi: true });
      a.stroke(`M${100 + sd * 52} 172 l${sd * 10} 6 M${100 + sd * 56} 184 l${sd * 10} 2`, 2);
    }
  } else arms(a, skin, 160, 38, 11);
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
  a.part(`M120 206 C170 214 192 180 178 150 C170 136 152 140 156 152 C164 168 156 190 118 192Z`, fur);
  // The second form's tail ends in a blade.
  if (s === 2) a.part(`M176 150 L170 116 L192 140Z`, '#d8dce6', '#9aa0ae', { lw: 2 });
  if (s === 3) a.part(`M54 110 C30 160 30 200 50 216 L150 216 C170 200 170 160 146 110Z`, '#25222e', '#14121a');
  a.part(bodyPath(100, s === 2 ? 124 : 132, 216, s === 2 ? 42 : 46), fur);
  a.part(E(100, 182, 22, 24), face, true);
  feet(a, darker(fur, 0.2), 22, 13);
  arms(a, fur, s === 2 ? 150 : 156, 34, 9, s === 2 ? 14 : 0);
  const hy = s === 1 ? 104 : 94;
  if (s === 3) a.part(`M38 ${hy + 10} C30 ${hy - 50} 70 ${hy - 70} 100 ${hy - 70} C130 ${hy - 70} 170 ${hy - 50} 162 ${hy + 10} L150 ${hy + 34} L50 ${hy + 34}Z`, '#25222e', '#14121a');
  else if (s === 2) pointyEars(a, fur, inner, hy - 24, 38, 58, 20);
  else roundEars(a, fur, inner, hy - 36, 44, 26);
  a.part(headPath(100, hy, 52, 42), face, true, { hi: true });
  if (s === 2) {
    // A ninja mask band across the eyes, and a scarf.
    a.part(`M48 ${hy - 18} C70 ${hy - 26} 130 ${hy - 26} 152 ${hy - 18} L154 ${hy + 4} C130 ${hy - 2} 70 ${hy - 2} 46 ${hy + 4}Z`, '#2a2438', null, { lw: 2 });
    a.part(`M150 ${hy - 14} L176 ${hy - 24} L170 ${hy - 8} L184 ${hy - 2} L152 ${hy}Z`, '#2a2438', null, { lw: 2 });
    a.part(`M54 ${hy + 32} C74 ${hy + 46} 126 ${hy + 46} 146 ${hy + 32} L146 ${hy + 44} C126 ${hy + 58} 74 ${hy + 58} 54 ${hy + 44}Z`, '#d8403a');
  }
  a.add(`<ellipse cx="100" cy="${hy + 14}" rx="5" ry="4" fill="#f2a8b8" stroke="#2b1810" stroke-width="1.6"/>`);
  a.stroke(`M70 ${hy + 16} L44 ${hy + 12} M70 ${hy + 22} L46 ${hy + 26} M130 ${hy + 16} L156 ${hy + 12} M130 ${hy + 22} L154 ${hy + 26}`, 1.6);
  a.eyes(80, 120, hy - 6, 7, s === 1 ? 9 : s === 2 ? 3 : 6, s === 3 ? '#c890ff' : '#8a6ab8', s === 2 ? '#2a2438' : face);
  a.mouth(100, hy + 24, 5, 'cat');
};

/** 사뿐이 → 꽃사뿐 → 봄사뿐: a spotted fawn; flowers on its head, then a white deer with blossom antlers. */
const kkotsasum: Draw = (a, s) => {
  const fur = s === 3 ? '#f6e2d0' : s === 2 ? '#c88a62' : '#d8a07a', cream = '#fff4ea';
  const legTop = s === 1 ? 190 : 176;
  a.part(bodyPath(100, s === 1 ? 132 : 122, s === 1 ? 216 : 196, s === 1 ? 46 : 42), fur);
  for (const x of [80, 120]) a.part(`M${x - 7} ${legTop} L${x - 6} 214 L${x + 6} 214 L${x + 7} ${legTop}Z`, darker(fur, 0.1));
  if (s >= 2) a.part(`M132 150 C150 140 156 160 146 168 C140 172 134 166 132 160Z`, cream);
  a.part(E(100, s === 1 ? 176 : 164, 20, 22), cream, null, { lw: 0 });
  if (s < 3) for (const [x, y] of [[74, 150], [128, 146], [116, 166], [82, 172]]) a.add(`<circle cx="${x}" cy="${y - (s === 2 ? 8 : 0)}" r="4.5" fill="${cream}"/>`);
  const hy = s === 1 ? 96 : 86;
  if (s === 3) for (const sd of [-1, 1]) {
    a.part(`M${100 + sd * 22} ${hy - 34} C${100 + sd * 30} ${hy - 64} ${100 + sd * 44} ${hy - 76} ${100 + sd * 60} ${hy - 82} M${100 + sd * 36} ${hy - 60} C${100 + sd * 50} ${hy - 58} ${100 + sd * 62} ${hy - 48} ${100 + sd * 68} ${hy - 40}`, 'none', null, { lw: 6, line: '#a8865a' });
    blossom(a, 100 + sd * 60, hy - 82, 10, '#f27aa8');
    blossom(a, 100 + sd * 68, hy - 40, 8, '#ffffff', '#f27aa8');
  }
  if (s === 2) for (const sd of [-1, 1]) {
    a.part(`M${100 + sd * 22} ${hy - 34} C${100 + sd * 26} ${hy - 50} ${100 + sd * 34} ${hy - 58} ${100 + sd * 42} ${hy - 62}`, 'none', null, { lw: 6, line: '#a8865a' });
    a.part(leaf(100 + sd * 42, hy - 62, 18, sd * 0.8), '#6cb052', true, { lw: 1.8 });
  }
  for (const sd of [-1, 1]) {
    a.part(`M${100 + sd * 36} ${hy - 22} C${100 + sd * 70} ${hy - 40} ${100 + sd * 86} ${hy - 26} ${100 + sd * 84} ${hy - 12} C${100 + sd * 70} ${hy - 4} ${100 + sd * 50} ${hy - 6} ${100 + sd * 40} ${hy - 2}Z`, fur);
    a.add(`<path d="M${100 + sd * 46} ${hy - 16} C${100 + sd * 66} ${hy - 28} ${100 + sd * 76} ${hy - 22} ${100 + sd * 76} ${hy - 14} C${100 + sd * 66} ${hy - 10} ${100 + sd * 54} ${hy - 10} ${100 + sd * 46} ${hy - 8}Z" fill="#f2b8a8"/>`);
  }
  a.part(headPath(100, hy, 46, 44), fur, true, { hi: true });
  a.part(E(100, hy + 22, 20, 14), cream, null, { lw: 0 });
  a.add(`<ellipse cx="100" cy="${hy + 14}" rx="6" ry="4.2" fill="#2b1810"/>`);
  // The second form: a garland of flowers round the neck.
  if (s === 2) for (const [k, c] of [[-2, '#f6a8c8'], [-1, '#ffffff'], [0, '#f6a8c8'], [1, '#ffffff'], [2, '#f6a8c8']] as const) blossom(a, 100 + k * 17, hy + 50 + Math.abs(k) * -3, 9, c, c === '#ffffff' ? '#f2a7c3' : '#ffd34a');
  a.eyes(80, 120, hy - 4, 7, s === 1 ? 9 : s === 2 ? 3 : 8, '#8a4a2a', fur);
  a.mouth(100, hy + 24, 5, 'cat').cheeks(66, 134, hy + 14);
};

/** 뒤뚱이 → 미끄덩 → 꽁꽁대장: a penguin chick; a snow scarf, then an emperor with an ice crown. */
const eoreum: Draw = (a, s) => {
  const back = s === 3 ? '#1f2f4a' : s === 2 ? '#2f5a8a' : '#4a5a70', front = '#f4f7fa';
  const top = s === 1 ? 70 : 52, half = s === 2 ? 56 : 64;
  a.part(`M100 ${top} C${100 + half * 0.8} ${top} ${100 + half} 130 ${100 + half * 0.98} 176 C${100 + half * 0.92} 208 136 218 100 218 C64 218 ${100 - half * 0.92} 208 ${100 - half * 0.98} 176 C${100 - half} 130 ${100 - half * 0.8} ${top} 100 ${top}Z`, back, true, { hi: true });
  a.part(`M100 ${top + 38} C132 ${top + 38} ${100 + half * 0.72} 130 ${100 + half * 0.7} 170 C${100 + half * 0.68} 200 126 212 100 212 C74 212 ${100 - half * 0.68} 200 ${100 - half * 0.7} 170 C${100 - half * 0.72} 130 68 ${top + 38} 100 ${top + 38}Z`, front, '#c8d8e4');
  // Flippers: longer and swept back in the second form (it slides).
  for (const sd of [-1, 1]) {
    if (s === 2) a.part(`M${100 + sd * 50} 124 C${100 + sd * 86} 132 ${100 + sd * 100} 156 ${100 + sd * 96} 176 C${100 + sd * 82} 168 ${100 + sd * 64} 152 ${100 + sd * 52} 148Z`, back);
    else a.part(`M${100 + sd * 58} 130 C${100 + sd * 82} 146 ${100 + sd * 86} 176 ${100 + sd * 76} 188 C${100 + sd * 66} 182 ${100 + sd * 60} 160 ${100 + sd * 56} 150Z`, back);
  }
  feet(a, '#ffb43a', 22, 13, 216);
  const ey = top + 60;
  if (s === 3) a.part(`M100 ${top + 40} C112 ${top + 54} 124 ${top + 60} 140 ${top + 60} C130 ${top + 70} 120 ${top + 80} 118 ${top + 96} L82 ${top + 96} C80 ${top + 80} 70 ${top + 70} 60 ${top + 60} C76 ${top + 60} 88 ${top + 54} 100 ${top + 40}Z`, '#ffd34a', '#e0a81a', { lw: 0 });
  if (s === 2) {
    // An icy crest swept back, and a scarf.
    for (const k of [0, 1, 2]) a.part(`M${92 + k * 8} ${top + 6} C${96 + k * 12} ${top - 20} ${112 + k * 14} ${top - 30} ${128 + k * 12} ${top - 30 + k * 8} C${116 + k * 12} ${top - 14} ${110 + k * 8} ${top - 2} ${108 + k * 8} ${top + 10}Z`, '#bfe8fa', '#7ac4ea', { lw: 2 });
    a.part(`M52 ${top + 100} C70 ${top + 112} 130 ${top + 112} 148 ${top + 100} L148 ${top + 114} C130 ${top + 126} 70 ${top + 126} 52 ${top + 114}Z`, '#e8505a');
    a.part(`M126 ${top + 112} L146 ${top + 146} L128 ${top + 148} L114 ${top + 116}Z`, '#e8505a');
  }
  a.eyes(80, 120, ey, 7, s === 1 ? 9 : s === 2 ? 3 : 6, '#2a4a7a', front);
  a.mouth(100, ey + 18, 10, 'beak').cheeks(66, 134, ey + 16);
  if (s === 3) a.part(`M66 ${top + 8} L60 ${top - 26} L78 ${top - 4} L88 ${top - 36} L100 ${top - 6} L112 ${top - 36} L122 ${top - 4} L140 ${top - 26} L134 ${top + 8} C120 ${top} 80 ${top} 66 ${top + 8}Z`, '#bfe8fa', '#7ac4ea');
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
  if (s === 2) {
    // Work overalls and a pickaxe over the shoulder.
    a.part('M60 170 C62 200 80 214 100 214 C120 214 138 200 140 170Z', '#4a7ab8', '#2f5a8a', { lw: 2.2 });
    for (const sd of [-1, 1]) a.part(`M${100 + sd * 22} 172 L${100 + sd * 34} 118 L${100 + sd * 42} 120 L${100 + sd * 30} 172Z`, '#4a7ab8', null, { lw: 2 });
    a.part('M90 180 L110 180 L110 194 L90 194Z', '#2f5a8a', null, { lw: 1.8 });
    // A pickaxe over the shoulder.
    a.part('M150 150 L188 70 L196 74 L158 154Z', '#a8763a', true, { lw: 2.2 });
    a.part('M166 64 C180 52 204 56 214 70 C200 66 188 68 180 76 C176 72 170 68 166 64Z', '#c8ccd4', '#8a909c', { lw: 2.2 });
  }
  if (s === 3) for (const sd of [-1, 1]) a.part(`M${100 + sd * 30} 112 L${100 + sd * 58} 98 L${100 + sd * 66} 120 L${100 + sd * 42} 130Z`, '#8a8478', '#5a564e');
  const hy = 136;
  if (s === 2) {
    a.part(`M58 ${hy - 18} C56 ${hy - 70} 144 ${hy - 70} 142 ${hy - 18} L156 ${hy - 10} L44 ${hy - 10}Z`, '#f2c14a', '#d89a1a');
    a.part(E(100, hy - 44, 12, 10), '#fff6c8', null, { lw: 2 });
  }
  if (s === 3) a.part(`M80 ${hy - 26} L100 ${hy - 96} L120 ${hy - 26}Z`, '#c8ccd4', '#8a909c');
  if (s === 3) for (const k of [0, 1, 2]) a.stroke(`M${86 + k * 4} ${hy - 40 - k * 18} L${114 - k * 4} ${hy - 48 - k * 18}`, 2.2);
  // Snout and face on the body's front.
  a.part(E(100, hy + 10, 18, 13), lighter(fur, 0.3), null, { lw: 2 });
  a.part(E(100, hy + 4, 11, 8), nose, true, { lw: 2 });
  a.eyes(76, 124, hy - 18, s === 1 ? 5.5 : 6, s === 1 ? 9 : s === 2 ? 3 : 6, '#3a2a20', fur);
  a.mouth(100, hy + 26, 7, s === 3 ? 'grin' : 'smile').cheeks(62, 138, hy + 6);
};

/** 반짝이 → 초롱이 → 달빛이: a firefly with a glowing tail; a lantern bug, then a moon moth with a halo. */
const bandi: Draw = (a, s) => {
  if (s === 2) {
    // 초롱이: an amber lantern bug standing up, its tail a ribbed paper lantern, four long wings.
    const body = '#b8843a';
    wings(a, '#e8f4fa', 116, 86, 'petal', 22);
    wings(a, '#d0ecf6', 140, 64, 'petal', -4);
    a.glow(100, 176, 64, '#ffd08a');
    a.part(`M70 140 L130 140 L126 148 L74 148Z`, '#e0a81a', true, { lw: 2.2 });
    a.part(`M74 148 C56 168 58 200 76 210 L124 210 C142 200 144 168 126 148Z`, '#ff7a3a', '#d8481a', { hi: true });
    for (const k of [-1, 0, 1]) a.stroke(`M${100 + k * 16} 150 Q${100 + k * 22} 180 ${100 + k * 16} 208`, 2, '#a8321a');
    a.part(`M76 210 L124 210 L120 218 L80 218Z`, '#e0a81a', true, { lw: 2.2 });
    a.part(E(100, 126, 28, 18), body);
    arms(a, body, 132, 26, 8, 8);
    const hy = 88;
    for (const sd of [-1, 1]) {
      a.stroke(`M${100 + sd * 14} ${hy - 32} Q${100 + sd * 18} ${hy - 62} ${100 + sd * 40} ${hy - 72}`, 3);
      a.flame(flamePath(100 + sd * 42, hy - 70, 7, 18), ['#ff8a1f', '#ffd23a', '#fff6c8']);
    }
    a.part(headPath(100, hy, 42, 36), body, true, { hi: true });
    a.eyes(82, 118, hy - 2, 7, 3, '#f2a81a', body);
    a.mouth(100, hy + 18, 6, 'open').cheeks(68, 132, hy + 14);
    return;
  }
  const body = s === 3 ? '#e8e4f8' : '#4a4d34', glow = s === 3 ? '#bfe4ff' : '#eef27a';
  wings(a, s === 3 ? '#ffffff' : '#d8f0f8', 112, s === 3 ? 92 : 52, s === 3 ? 'moth' : 'petal', s === 3 ? 10 : -6);
  a.glow(100, 176, 70, glow);
  a.part(E(100, 178, s === 3 ? 40 : 44, s === 3 ? 40 : 38), glow, s === 3 ? '#8ac4e8' : '#c8d44a', { hi: true });
  for (const k of [0, 1]) a.stroke(`M66 ${164 + k * 18} Q100 ${172 + k * 18} 134 ${164 + k * 18}`, 2.2, darker(glow, 0.4));
  a.part(E(100, 132, 32, 22), body);
  for (const sd of [-1, 1]) a.stroke(`M${100 + sd * 22} 142 L${100 + sd * 40} 158 M${100 + sd * 26} 134 L${100 + sd * 46} 140`, 3);
  const hy = 92;
  for (const sd of [-1, 1]) {
    a.stroke(`M${100 + sd * 16} ${hy - 36} Q${100 + sd * 22} ${hy - 62} ${100 + sd * (s === 3 ? 44 : 30)} ${hy - (s === 3 ? 70 : 60)}`, 3);
    if (s === 3) a.part(leaf(100 + sd * 44, hy - 70, 20, sd * 0.7, 0.5), '#ffffff', '#c8c4e8', { lw: 1.8 });
    else a.part(E(100 + sd * 30, hy - 62, 6, 6), glow, null, { lw: 2 });
  }
  if (s === 3) halo(a, 100, hy - 50, 38);
  a.part(headPath(100, hy, s === 3 ? 44 : 46, s === 3 ? 38 : 40), s === 3 ? '#ffffff' : body, true, { hi: true });
  a.eyes(82, 118, hy - 2, 7, s === 1 ? 9 : 8, s === 3 ? '#6a8ad8' : '#c8d44a', s === 3 ? '#ffffff' : body);
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
    const big = s === 2 && sd === 1;
    if (big) a.add('<g transform="translate(166 120) scale(1.45) translate(-166 -120)">');
    a.part(`M${100 + sd * 46} 160 C${100 + sd * 66} 150 ${100 + sd * 70} 130 ${100 + sd * 66} 118`, 'none', null, { lw: 9, line: '#4a2416' });
    a.stroke(`M${100 + sd * 46} 160 C${100 + sd * 66} 150 ${100 + sd * 70} 130 ${100 + sd * 66} 118`, 5, claw);
    a.part(`M${100 + sd * 66} 118 C${100 + sd * 44} 112 ${100 + sd * 44} 76 ${100 + sd * 68} 66 C${100 + sd * 70} 84 ${100 + sd * 76} 92 ${100 + sd * 86} 92 C${100 + sd * 92} 70 ${100 + sd * 82} 60 ${100 + sd * 74} 58 C${100 + sd * 100} 56 ${100 + sd * 104} 108 ${100 + sd * 66} 118Z`, claw, true, { hi: true });
    if (big) a.add('</g>');
  }
  a.part(`M34 168 C34 126 66 110 100 110 C134 110 166 126 166 168 C166 194 134 200 100 200 C66 200 34 194 34 168Z`, shell, true, { hi: true });
  for (const [x, y, r] of [[70, 140, 8], [126, 136, 10], [104, 128, 6], [140, 160, 6]] as const) a.add(`<circle cx="${x}" cy="${y}" r="${r}" fill="${darker(shell, 0.25)}"/>`);
  if (s >= 2) for (const k of [-2, -1, 0, 1, 2]) a.part(`M${100 + k * 24 - 8} ${116 + Math.abs(k) * 6} L${100 + k * 26} ${96 + Math.abs(k) * 8} L${100 + k * 24 + 8} ${116 + Math.abs(k) * 6}Z`, s === 3 ? '#ffb43a' : '#e8d8c8');
  if (s === 2) for (const [x, y, r] of [[60, 96, 7], [48, 78, 5], [58, 62, 4]]) a.add(`<circle cx="${x}" cy="${y}" r="${r}" fill="#ffffff" opacity=".8" stroke="#c8c8c8" stroke-width="1.4"/>`);
  if (s === 3) { a.flame(flamePath(100, 104, 12, 30)); a.flame(flamePath(70, 116, 9, 22, -0.3)); a.flame(flamePath(130, 116, 9, 22, 0.3)); }
  // Eyes on stalks.
  for (const sd of [-1, 1]) { a.stroke(`M${100 + sd * 16} 140 L${100 + sd * 20} 118`, 5); a.part(E(100 + sd * 20, 112, 13, 14), '#fff8ec', null, { lw: 2.2 }); }
  a.eyes(80, 120, 113, 5.5, s === 1 ? 9 : s === 2 ? 3 : 6, '#c4401a', '#fff8ec');
  a.mouth(100, 166, 12, s === 3 ? 'grin' : 'smile').cheeks(66, 134, 160);
};

/** 몽글이 → 뭉게이 → 먹구름: a lamb of cloud; a little bolt, then a storm ram with curled horns. */
const gureumyang: Draw = (a, s) => {
  const fleece = s === 3 ? '#8a96a8' : s === 2 ? '#b8c8dc' : '#f6f3ea', face = s === 3 ? '#2a2a30' : s === 2 ? '#3a4a66' : '#5a5a66';
  for (const x of [76, 124]) a.part(`M${x - 8} 188 L${x - 7} 214 L${x + 7} 214 L${x + 8} 188Z`, face);
  let d = '';
  const cx = 100, cy = s === 2 ? 144 : 150, R = s === 1 ? 60 : s === 2 ? 72 : 66;
  for (let k = 0; k < 9; k++) { const an = (k / 9) * Math.PI * 2; d += E(cx + Math.cos(an) * R * 0.72, cy + Math.sin(an) * R * 0.62, R * 0.42, R * 0.42); }
  a.part(d, fleece, true, { lw: 2.4 });
  a.part(E(cx, cy, R * 0.8, R * 0.66), fleece, null, { lw: 0 });
  // The second form rains: drops falling from its fleece, and a little bolt.
  if (s === 2) {
    for (const [x, y] of [[50, 200], [150, 196], [36, 176], [166, 172]]) a.part(`M${x} ${y - 10} C${x + 6} ${y - 2} ${x + 6} ${y + 6} ${x} ${y + 6} C${x - 6} ${y + 6} ${x - 6} ${y - 2} ${x} ${y - 10}Z`, '#7ac4ea', '#4a8ac0', { lw: 1.8 });
    a.part(`M150 104 L170 76 L164 96 L186 90 L160 128 L164 108Z`, '#ffe14a', '#e0a81a', { lw: 2 });
  }
  if (s === 3) {
    a.part(`M138 130 L156 102 L150 122 L170 116 L146 152 L150 134Z`, '#ffe14a', '#e0a81a', { lw: 2 });
    for (const k of [0, 1, 2]) a.stroke(`M${60 + k * 30} 206 l-6 14`, 3, '#7ac4ea');
  }
  const hy = s === 2 ? 110 : 118;
  if (s === 3) for (const sd of [-1, 1]) a.part(`M${100 + sd * 26} ${hy - 26} C${100 + sd * 62} ${hy - 52} ${100 + sd * 82} ${hy - 6} ${100 + sd * 56} ${hy + 12} C${100 + sd * 46} ${hy + 16} ${100 + sd * 40} ${hy + 4} ${100 + sd * 52} ${hy - 4} C${100 + sd * 62} ${hy - 14} ${100 + sd * 48} ${hy - 28} ${100 + sd * 30} ${hy - 12}Z`, '#d8c8a0', '#a8946a');
  if (s === 2) for (const sd of [-1, 1]) a.part(`M${100 + sd * 20} ${hy - 30} C${100 + sd * 30} ${hy - 48} ${100 + sd * 44} ${hy - 44} ${100 + sd * 40} ${hy - 32} C${100 + sd * 36} ${hy - 26} ${100 + sd * 30} ${hy - 30} ${100 + sd * 28} ${hy - 24}Z`, '#e8dcc0', '#b8a888');
  for (const sd of [-1, 1]) a.part(`M${100 + sd * 30} ${hy - 8} C${100 + sd * 52} ${hy - 12} ${100 + sd * 64} ${hy - 2} ${100 + sd * 62} ${hy + 8} C${100 + sd * 50} ${hy + 10} ${100 + sd * 40} ${hy + 6} ${100 + sd * 30} ${hy + 4}Z`, face);
  a.part(headPath(100, hy, 32, 34), face, true, { hi: true });
  // Fleece on top: a tuft, or (second form) a puffy cloud hood round the face.
  if (s === 2) a.part(E(70, hy - 20, 16, 16) + E(84, hy - 38, 18, 16) + E(104, hy - 44, 19, 17) + E(122, hy - 34, 17, 15) + E(132, hy - 14, 14, 14), fleece, true, { lw: 2.2 });
  else a.part(E(88, hy - 34, 14, 12) + E(104, hy - 38, 15, 13) + E(116, hy - 30, 12, 10), fleece, true, { lw: 2.2 });
  a.eyes(86, 114, hy + 2, 5.5, s === 1 ? 9 : s === 2 ? 3 : 6, '#e8c84a', face);
  a.mouth(100, hy + 20, 5, 'cat');
  a.cheeks(76, 124, hy + 16, 6);
};

/** 별냥이 → 별똥냥 → 은하냥: a navy kitten with a star on its brow; a star-trail tail, then a galaxy. */
const byeolnyang: Draw = (a, s) => {
  const fur = s === 3 ? '#1a1a3a' : s === 2 ? '#2a2f5a' : '#4a4f7a', inner = '#f2b8c8';
  // Tail(s): one plain tail; two star-tipped tails from the second form.
  const tails = s === 1 ? [0] : [0, 1];
  for (const k of tails) {
    const dx = k * -14, dy = k * -30;
    a.part(`M${118 + dx} ${204 + dy} C${170 + dx} ${212 + dy} ${186 + dx} ${160 + dy} ${166 + dx} ${124 + dy} C${160 + dx} ${114 + dy} ${148 + dx} ${118 + dy} ${152 + dx} ${128 + dy} C${164 + dx} ${154 + dy} ${154 + dx} ${184 + dy} ${116 + dx} ${190 + dy}Z`, fur);
    if (s >= 2) a.part(star(162 + dx, 114 + dy, 16), '#ffe14a', '#e0a81a', { lw: 2 });
  }
  a.part(bodyPath(100, s === 1 ? 130 : 122, 216, s === 1 ? 46 : 40), fur);
  if (s === 3) for (const [x, y] of [[84, 160], [114, 176], [96, 196], [122, 150]]) a.part(star(x, y, 4.5), '#ffffff', null, { lw: 0 });
  if (s === 2) for (const [x, y] of [[86, 170], [112, 186], [118, 158]]) a.add(`<circle cx="${x}" cy="${y}" r="3" fill="#ffe14a"/>`);
  feet(a, lighter(fur, 0.2), 22, 13);
  const hy = s === 1 ? 98 : 90;
  if (s === 3) halo(a, 100, hy - 56, 40, '#bfe4ff');
  pointyEars(a, fur, inner, hy - 18, 36, s === 2 ? 60 : 52, 22);
  if (s === 2) for (const sd of [-1, 1]) a.part(`M${100 + sd * 58} ${hy - 72} L${100 + sd * 62} ${hy - 90} L${100 + sd * 66} ${hy - 70}Z`, fur, null, { lw: 2 });
  a.part(headPath(100, hy, 54, 44), fur, true, { hi: true });
  // The second form wears a crescent-moon collar.
  if (s === 2) a.part(`M60 ${hy + 46} C76 ${hy + 64} 124 ${hy + 64} 140 ${hy + 46} C128 ${hy + 54} 72 ${hy + 54} 60 ${hy + 46}Z M86 ${hy + 54} C84 ${hy + 76} 116 ${hy + 76} 114 ${hy + 54} C110 ${hy + 66} 92 ${hy + 66} 86 ${hy + 54}Z`, '#ffe14a', '#e0a81a', { lw: 2 });
  a.part(star(100, hy - 26, 10), '#ffe14a', '#e0a81a', { lw: 1.8 });
  a.stroke(`M66 ${hy + 16} L42 ${hy + 10} M66 ${hy + 22} L44 ${hy + 26} M134 ${hy + 16} L158 ${hy + 10} M134 ${hy + 22} L156 ${hy + 26}`, 1.8, '#c8c8e8');
  a.eyes(78, 122, hy, 7.5, s === 3 ? 6 : 8, '#e0b81a', fur);
  a.add(`<path d="M96 ${hy + 14} L104 ${hy + 14} L100 ${hy + 19}Z" fill="#f2a8b8"/>`);
  a.mouth(100, hy + 21, 6, s === 2 ? 'fang' : 'cat');
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
  const skin = s === 3 ? '#a8865a' : s === 2 ? '#8ab062' : '#a8cc7a', shell = s === 3 ? '#6a8a4a' : s === 2 ? '#6a8a3e' : '#8ab46a';
  for (const x of [56, 144]) a.part(`M${x - 14} 180 L${x - 14} 214 L${x + 14} 214 L${x + 14} 180Z`, skin);
  a.part(E(100, 194, 56, 16), '#f2e2b0', '#d8c48a');
  if (s === 3) {
    a.part(`M26 190 C26 140 50 104 100 104 C150 104 174 140 174 190Z`, shell, true, { hi: true });
    a.part(`M40 178 L76 96 L96 126 L118 72 L160 178Z`, '#8a8478', '#5a564e');
    a.part(`M106 96 L118 72 L130 98 C122 104 112 104 106 96Z`, '#ffffff', null, { lw: 1.8 });
    for (const [x, y] of [[56, 156], [146, 150], [92, 164]]) { a.part(`M${x - 3} ${y + 14} L${x - 3} ${y} L${x + 3} ${y} L${x + 3} ${y + 14}Z`, '#6a4a22', null, { lw: 1.6 }); a.part(`M${x} ${y - 22} L${x + 12} ${y + 2} L${x - 12} ${y + 2}Z`, '#3f7a3a', '#2a5a2a', { lw: 1.8 }); }
  } else if (s === 2) {
    // Bushes on the shell, rock knobs at its rim.
    a.part(`M26 190 C26 132 56 100 100 100 C144 100 174 132 174 190Z`, shell, true, { hi: true });
    for (const sd of [-1, 1]) a.part(`M${100 + sd * 74} 176 L${100 + sd * 88} 162 L${100 + sd * 84} 184Z`, '#b8b0a0', '#8a8478', { lw: 2 });
    a.part(E(70, 104, 26, 22) + E(92, 90, 26, 24), '#4f9442', '#3a7a32', { lw: 2.2 });
    a.part(E(126, 96, 28, 24) + E(144, 112, 18, 16), '#5fa64a', '#3f8a3a', { lw: 2.2 });
    blossom(a, 128, 86, 8, '#ffffff', '#f2a7c3');
  } else {
    a.part(`M28 190 C28 130 56 96 100 96 C144 96 172 130 172 190Z`, shell, true, { hi: true });
    for (const [x, y] of [[100, 126], [66, 152], [134, 152], [100, 170]] as const) a.part(`M${x} ${y - 18} L${x + 18} ${y - 8} L${x + 18} ${y + 10} L${x} ${y + 18} L${x - 18} ${y + 10} L${x - 18} ${y - 8}Z`, darker(shell, 0.12), null, { lw: 1.8 });
    a.part(leaf(80, 98, 30, -0.6), '#5fa64a', true, { lw: 2 });
    a.part(leaf(84, 98, 26, 0.7), '#72b856', true, { lw: 2 });
  }
  const hy = s === 2 ? 148 : 150, hr = s === 2 ? 44 : 40;
  a.part(headPath(100, hy, hr, s === 2 ? 34 : 32), skin, true, { hi: true });
  // The second form has a strong beaked jaw.
  if (s === 2) a.part(`M74 ${hy + 12} C86 ${hy + 30} 114 ${hy + 30} 126 ${hy + 12} C116 ${hy + 18} 84 ${hy + 18} 74 ${hy + 12}Z`, '#e8d4a0', '#c4ac78', { lw: 2 });
  a.eyes(84, 116, hy - 4, 6, s === 1 ? 9 : 1, s === 3 ? '#6a4a22' : '#3f6a2a');
  a.mouth(100, hy + 14, 8, 'smile').cheeks(72, 128, hy + 10, 6);
};

/** 해롱이 → 하늘하늘 → 너울이: a jellyfish; frilly petals, then a deep violet bell with a crown. */
const haepari: Draw = (a, s) => {
  const bell = s === 3 ? '#3a2a6a' : s === 2 ? '#8ad0c8' : '#d8b8f0', frill = s === 3 ? '#f2a7e0' : s === 2 ? '#c8f0ea' : '#f0e0fa';
  a.glow(100, 110, 90, s === 3 ? '#9ad6f2' : '#ffffff');
  if (s === 3) for (const sd of [-1, 1]) {
    const d = `M${100 + sd * 50} 140 C${100 + sd * 90} 150 ${100 + sd * 100} 190 ${100 + sd * 80} 206 C${100 + sd * 66} 216 ${100 + sd * 60} 196 ${100 + sd * 72} 192`;
    a.stroke(d, 11, '#4a2416'); a.stroke(d, 7, '#9ad6f2');
  }
  if (s === 2) {
    // Long ribbons in two colours instead of plain tentacles.
    for (const [k, c] of [[-2, '#f6a8c8'], [-1, '#ffffff'], [0, '#f6a8c8'], [1, '#ffffff'], [2, '#f6a8c8']] as const) {
      const x = 100 + k * 18;
      a.part(`M${x - 6} 140 C${x + 18} 164 ${x - 22} 190 ${x + 2} 218 L${x + 12} 216 C${x - 8} 190 ${x + 30} 164 ${x + 6} 140Z`, c, true, { lw: 2 });
    }
  } else for (const k of [-3, -2, -1, 0, 1, 2, 3]) {
    const x = 100 + k * 14;
    a.part(`M${x} 140 C${x + 12} 166 ${x - 12} 190 ${x + 4} 216`, 'none', null, { lw: 8, line: '#4a2416' });
    a.stroke(`M${x} 140 C${x + 12} 166 ${x - 12} 190 ${x + 4} 216`, 4.5, frill);
  }
  if (s === 2) {
    // A brim of petals like an upturned flower.
    for (let k = 0; k < 7; k++) { const x = 40 + k * 20; a.part(`M${x} 132 C${x - 12} 150 ${x + 2} 164 ${x + 10} 162 C${x + 18} 164 ${x + 32} 150 ${x + 20} 132Z`, k % 2 ? '#ffffff' : '#f6c8dc', true, { lw: 2 }); }
  } else {
    let d = 'M34 140 ';
    for (let k = 0; k <= 8; k++) d += `Q${34 + k * 16.5 + 8} ${156} ${34 + (k + 1) * 16.5} 140 `;
    a.part(d + 'L166 128 L34 128Z', frill, true, { lw: 2.2 });
  }
  a.part(`M30 136 C26 70 60 40 100 40 C140 40 174 70 170 136 C140 148 60 148 30 136Z`, bell, true, { hi: true });
  a.add(`<path d="M58 70 C66 56 80 50 92 48" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".55"/>`);
  if (s === 2) { a.part(`M100 44 C86 30 70 34 74 46 C78 56 92 52 100 46 C108 52 122 56 126 46 C130 34 114 30 100 44Z`, '#f27aa8', '#c84a7a', { lw: 2 }); a.add('<circle cx="100" cy="45" r="5" fill="#ffd34a" stroke="#4a2416" stroke-width="1.6"/>'); }
  if (s === 3) {
    crown(a, 100, 46, 26, '#ffd34a', '#9ad6f2');
    for (const [x, y, r] of [[60, 96, 6], [140, 92, 7], [128, 62, 5], [72, 66, 4]]) a.add(`<circle cx="${x}" cy="${y}" r="${r}" fill="#9ad6f2" opacity=".85"/>`);
  }
  a.eyes(80, 120, 100, 7, s === 1 ? 9 : s === 2 ? 3 : 8, s === 3 ? '#9ad6f2' : '#8a4ab8', bell);
  a.mouth(100, 120, 6, s === 2 ? 'open' : 'smile').cheeks(64, 136, 116);
};

/** 부엉이 → 부엉부엉 → 달부엉: a fluffy owlet; long ear tufts and spread wings, then a night owl with a moon. */
const buong: Draw = (a, s) => {
  const body = s === 3 ? '#3a4072' : s === 2 ? '#8a6a44' : '#a8865a', face = s === 3 ? '#d8d4f0' : '#f2e2c0', belly = s === 3 ? '#8a90c8' : '#f2e2c0';
  if (s >= 2) wings(a, darker(body, 0.08), 150, s === 3 ? 92 : 76, 'feather', s === 3 ? 30 : 14);
  else for (const sd of [-1, 1]) a.part(`M${100 + sd * 56} 150 C${100 + sd * 72} 158 ${100 + sd * 72} 184 ${100 + sd * 58} 192 C${100 + sd * 52} 180 ${100 + sd * 50} 164 ${100 + sd * 52} 154Z`, darker(body, 0.1));
  a.part(`M100 ${s === 1 ? 64 : 56} C150 ${s === 1 ? 64 : 56} 166 116 162 168 C158 206 134 216 100 216 C66 216 42 206 38 168 C34 116 50 ${s === 1 ? 64 : 56} 100 ${s === 1 ? 64 : 56}Z`, body, true, { hi: true });
  a.part(E(100, 172, 38, 38), belly, true);
  for (const [x, y] of [[88, 160], [112, 160], [100, 176], [86, 190], [114, 190]]) a.stroke(`M${x - 6} ${y} L${x} ${y + 5} L${x + 6} ${y}`, 2, darker(belly, 0.35));
  feet(a, '#e0a81a', 22, 12, 216);
  const hy = s === 1 ? 108 : 100, tuft = s === 1 ? 26 : 48;
  for (const sd of [-1, 1]) a.part(`M${100 + sd * 30} ${hy - 40} L${100 + sd * 52} ${hy - 40 - tuft} L${100 + sd * 58} ${hy - 30}Z`, body);
  // A face disc shaped like a heart.
  a.part(`M100 ${hy - 30} C116 ${hy - 50} 158 ${hy - 44} 152 ${hy - 6} C148 ${hy + 24} 118 ${hy + 34} 100 ${hy + 24} C82 ${hy + 34} 52 ${hy + 24} 48 ${hy - 6} C42 ${hy - 44} 84 ${hy - 50} 100 ${hy - 30}Z`, face, true, { lw: 2.2 });
  if (s === 3) { a.part(`M92 ${hy - 54} C80 ${hy - 70} 92 ${hy - 90} 110 ${hy - 88} C98 ${hy - 82} 96 ${hy - 66} 110 ${hy - 58} C104 ${hy - 54} 98 ${hy - 52} 92 ${hy - 54}Z`, '#ffe14a', '#e0a81a', { lw: 2 }); }
  if (s === 2) for (const sd of [-1, 1]) a.stroke(`M${100 + sd * 12} ${hy - 22} L${100 + sd * 42} ${hy - 30}`, 4);
  a.eyes(78, 122, hy - 6, 8, s === 1 ? 9 : s === 2 ? 3 : 8, s === 3 ? '#ffd34a' : '#e0a81a', face);
  a.part(`M94 ${hy + 6} L106 ${hy + 6} L100 ${hy + 18}Z`, '#ffb43a', '#e08a1a', { lw: 2 });
  a.cheeks(62, 138, hy + 12, 7);
};

/** 뜨거비 → 부글거비 → 용암거비: a fire toad; volcanic vents on its back, then lava-cracked rock. */
const dukkeobi: Draw = (a, s) => {
  const skin = s === 3 ? '#4a2a22' : s === 2 ? '#d8482a' : '#f07a3a', belly = s === 3 ? '#f2803a' : '#ffd08a';
  if (s >= 2) for (const [x, h] of (s === 3 ? [[100, 46], [62, 30], [138, 30]] : [[70, 22], [130, 22]]) as [number, number][]) {
    a.part(`M${x - 16} 108 L${x - 7} ${108 - h} L${x + 7} ${108 - h} L${x + 16} 108Z`, s === 3 ? '#3a2018' : '#a8321a', true, { lw: 2.2 });
    if (s === 3) a.flame(flamePath(x, 108 - h, 9, h * 0.8));
    else for (const k of [0, 1]) a.add(`<circle cx="${x + k * 8 - 4}" cy="${108 - h - 10 - k * 10}" r="${6 - k}" fill="#ffffff" opacity=".75" stroke="#c8c8c8" stroke-width="1.4"/>`);
  }
  // A wide squat body that is mostly head.
  a.part(`M100 92 C160 92 182 140 178 178 C174 208 140 218 100 218 C60 218 26 208 22 178 C18 140 40 92 100 92Z`, skin, true, { hi: true });
  a.part(`M100 160 C140 160 152 182 148 200 C144 214 122 216 100 216 C78 216 56 214 52 200 C48 182 60 160 100 160Z`, belly, true);
  if (s === 3) for (const d of ['M40 140 L56 152 L50 170', 'M150 128 L138 146 L152 160', 'M90 104 L98 122 L88 136']) a.stroke(d, 3.2, '#ff8a1a');
  else for (const [x, y, r] of [[52, 132, 6], [148, 126, 7], [128, 150, 4], [66, 154, 4]]) a.add(`<circle cx="${x}" cy="${y}" r="${r}" fill="${darker(skin, 0.18)}"/>`);
  // Front legs splayed.
  for (const sd of [-1, 1]) a.part(`M${100 + sd * 52} 190 C${100 + sd * 70} 196 ${100 + sd * 82} 210 ${100 + sd * 80} 218 L${100 + sd * 50} 218Z`, skin);
  // Eyes up on bumps.
  for (const sd of [-1, 1]) a.part(E(100 + sd * 34, 100, 24, 22), skin, true);
  a.eyes(66, 134, 98, 7.5, s === 1 ? 9 : s === 2 ? 3 : 6, '#f2a81a', skin);
  a.stroke('M48 142 Q100 176 152 142', 3);
  if (s === 1) a.part('M86 154 Q100 170 114 154 Q100 160 86 154Z', '#ff7a8a', null, { lw: 2 });
  if (s === 3) a.add('<path d="M64 148 L70 160 L76 151Z M124 151 L130 160 L136 148Z" fill="#fff" stroke="#4a2416" stroke-width="1.6" stroke-linejoin="round"/>');
  a.cheeks(40, 160, 132, 9, '#ff6a5a');
};

/** 콩알이 → 콩깍이 → 완두대포: a pea in a half pod; then pod armour, then a pea cannon on its shoulder. */
const kongkong: Draw = (a, s) => {
  const pea = s === 3 ? '#6ab04a' : '#8ac45a', pod = s === 3 ? '#3f7a32' : '#5a9a3e';
  if (s === 1) {
    a.part('M20 170 C30 222 170 222 180 170 C150 186 50 186 20 170Z', pod, true, { hi: true });
    a.part(E(46, 168, 16, 15) + E(154, 168, 16, 15), lighter(pea, 0.1), true, { lw: 2.2 });
    a.part(E(100, 146, 52, 50), pea, true, { hi: true });
    a.stroke('M100 96 C100 82 108 74 118 72 C126 70 128 80 120 82', 3, '#3f7a2a');
    a.part(leaf(100, 98, 28, -0.8), '#6cb052', true, { lw: 2 });
    a.eyes(82, 118, 140, 7, 9, '#3f6a2a', pea);
    a.mouth(100, 162, 7, 'cat').cheeks(68, 132, 156);
    return;
  }
  if (s === 3) {
    // The cannon: a long pod barrel over the right shoulder.
    a.part('M86 92 L176 38 C188 32 198 48 188 56 L104 124Z', pod, true, { hi: true });
    a.part(E(184, 46, 12, 14), '#2a4a22', null, { lw: 2.2 });
    for (const k of [0, 1, 2]) a.add(`<circle cx="${118 + k * 20}" cy="${84 - k * 12}" r="6" fill="${lighter(pea, 0.2)}" stroke="#4a2416" stroke-width="1.6"/>`);
  }
  a.part(bodyPath(100, 116, 216, 52), pea);
  // Pod armour wrapped round the body.
  a.part('M52 150 C60 120 140 120 148 150 L152 196 C130 210 70 210 48 196Z', pod, true, { lw: 2.4 });
  for (const x of [76, 100, 124]) a.add(`<circle cx="${x}" cy="172" r="9" fill="${lighter(pea, 0.15)}" stroke="#4a2416" stroke-width="1.8"/>`);
  feet(a, darker(pea, 0.2), 26, 14);
  // Tendril arms.
  for (const sd of [-1, 1]) a.stroke(`M${100 + sd * 50} 150 C${100 + sd * 72} 146 ${100 + sd * 80} 170 ${100 + sd * 68} 178 C${100 + sd * 60} 182 ${100 + sd * 58} 172 ${100 + sd * 64} 170`, 5, '#4f8a32');
  const hy = 86;
  // A pod hood over the head.
  a.part(`M44 ${hy + 16} C40 ${hy - 50} 160 ${hy - 50} 156 ${hy + 16} C150 ${hy - 20} 50 ${hy - 20} 44 ${hy + 16}Z`, pod, true, { lw: 2.4 });
  a.part(headPath(100, hy + 2, 48, 40), pea, true, { hi: true });
  a.part(leaf(100, hy - 42, 26, -0.4), '#6cb052', true, { lw: 2 });
  a.eyes(80, 120, hy, 7, s === 2 ? 3 : 6, '#3f6a2a', pea);
  a.mouth(100, hy + 20, 7, s === 3 ? 'fang' : 'smile').cheeks(66, 134, hy + 14);
};

/** 따끔이 → 모래따끔 → 사막대왕: a little sand scorpion; a desert scarf and a long sting, then a crowned king. */
const jeongal: Draw = (a, s) => {
  const shell = s === 3 ? '#7a2a18' : s === 2 ? '#c89048' : '#e0b46a', pale = s === 3 ? '#d8783a' : '#f2d8a0';
  // The tail: one thick arc from behind the body up over the head, banded, the sting at its tip.
  const tipY = s === 1 ? 70 : 44;
  const arc = `M120 190 C${s === 1 ? 176 : 184} 184 ${s === 1 ? 182 : 190} ${tipY + 40} 150 ${tipY + 12}`;
  a.stroke(arc, s === 1 ? 26 : 30, '#4a2416');
  a.stroke(arc, s === 1 ? 21 : 25, shell);
  for (const t of [0.25, 0.45, 0.65, 0.85]) {
    const x = (1 - t) ** 3 * 120 + 3 * (1 - t) ** 2 * t * (s === 1 ? 176 : 184) + 3 * (1 - t) * t * t * (s === 1 ? 182 : 190) + t ** 3 * 150;
    const y = (1 - t) ** 3 * 190 + 3 * (1 - t) ** 2 * t * 184 + 3 * (1 - t) * t * t * (tipY + 40) + t ** 3 * (tipY + 12);
    a.add(`<circle cx="${x}" cy="${y}" r="${s === 1 ? 4 : 5}" fill="${darker(shell, 0.25)}"/>`);
  }
  a.part(`M156 ${tipY + 18} C132 ${tipY + 16} 118 ${tipY - 4} 124 ${tipY - 20} C132 ${tipY - 6} 146 ${tipY} 160 ${tipY + 4}Z`, s === 3 ? '#ffb43a' : '#4a2a18', s === 3 ? '#e0701a' : '#2a1810', { lw: 2.2 });
  if (s === 3) a.flame(flamePath(124, tipY - 18, 7, 20, -0.6));
  // Legs.
  for (const sd of [-1, 1]) for (const k of [0, 1, 2]) a.stroke(`M${100 + sd * 34} ${178 + k * 9} L${100 + sd * (60 + k * 6)} ${190 + k * 6} L${100 + sd * (66 + k * 8)} 218`, 5, '#4a2416');
  // Pincers.
  for (const sd of [-1, 1]) {
    a.stroke(`M${100 + sd * 40} 166 C${100 + sd * 60} 160 ${100 + sd * 64} 140 ${100 + sd * 60} 128`, 9);
    a.stroke(`M${100 + sd * 40} 166 C${100 + sd * 60} 160 ${100 + sd * 64} 140 ${100 + sd * 60} 128`, 5, shell);
    a.part(`M${100 + sd * 60} 128 C${100 + sd * 40} 122 ${100 + sd * 42} 94 ${100 + sd * 62} 88 C${100 + sd * 62} 102 ${100 + sd * 68} 108 ${100 + sd * 76} 106 C${100 + sd * 80} 92 ${100 + sd * 74} 84 ${100 + sd * 68} 82 C${100 + sd * 92} 82 ${100 + sd * 94} 122 ${100 + sd * 60} 128Z`, shell, true, { hi: true });
  }
  a.part(`M100 132 C140 132 148 160 146 186 C144 206 124 212 100 212 C76 212 56 206 54 186 C52 160 60 132 100 132Z`, shell, true, { hi: true });
  for (const k of [0, 1, 2]) a.stroke(`M62 ${160 + k * 16} Q100 ${168 + k * 16} 138 ${160 + k * 16}`, 2.2, darker(shell, 0.3));
  const hy = 140;
  a.part(headPath(100, hy, 40, 30), pale, true, { hi: true });
  if (s === 2) {
    a.part(`M60 ${hy + 22} C76 ${hy + 34} 124 ${hy + 34} 140 ${hy + 22} L142 ${hy + 34} C124 ${hy + 46} 76 ${hy + 46} 58 ${hy + 34}Z`, '#3a8ab8');
    a.part(`M60 ${hy - 14} C76 ${hy - 30} 124 ${hy - 30} 140 ${hy - 14} L140 ${hy - 6} C124 ${hy - 20} 76 ${hy - 20} 60 ${hy - 6}Z`, '#3a8ab8');
  }
  if (s === 3) crown(a, 100, hy - 26, 22);
  a.eyes(84, 116, hy - 2, 6, s === 1 ? 9 : s === 2 ? 3 : 6, s === 3 ? '#ffd34a' : '#8a4a1a', pale);
  a.mouth(100, hy + 16, 6, s === 3 ? 'grin' : 'smile').cheeks(72, 128, hy + 12, 6);
};

/** By unit id: how to draw each 정령. */
export const SPIRIT_ART: Record<string, Draw> = {
  dochi, bulttong, mulbang, saessak, somteol, beongae, jogak, dalpaeng, geurimja, kkotsasum,
  eoreum, dudeoji, bandi, yongamge, gureumyang, byeolnyang, agiyong, geobuk, haepari,
  buong, dukkeobi, kongkong, jeongal,
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
