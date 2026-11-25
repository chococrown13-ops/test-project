/**
 * A small kit for drawing the 정령 as hand-made vector pictures (the 몬스터 도감 look): parts
 * with a warm dark line and two-tone cel shading, flame and glow gradients, five kinds of eyes,
 * mouths and cheeks. A picture is an SVG string on a 240 x 264 box whose ground line is y 218.
 */

let uid = 0;

export const INK = '#4a2416';
/** The box every picture is drawn in, and where the feet stand. */
export const VIEW = { x: -20, y: -24, w: 240, h: 264, ground: 218 };

/** Mix two #rrggbb colours. */
export function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
export const darker = (c: string, t = 0.32) => mix(c, '#2a1020', t);
export const lighter = (c: string, t = 0.4) => mix(c, '#ffffff', t);

/** An ellipse as a path (so it can take the cel shading). */
export const E = (cx: number, cy: number, rx: number, ry: number) => `M${cx - rx} ${cy} a${rx} ${ry} 0 1 0 ${2 * rx} 0 a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;

/** A rounded head shape, a little fuller at the cheeks than at the crown. */
export const headPath = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx} ${cy - ry} C${cx + rx * 0.82} ${cy - ry} ${cx + rx} ${cy - ry * 0.45} ${cx + rx} ${cy + ry * 0.08} C${cx + rx} ${cy + ry * 0.68} ${cx + rx * 0.55} ${cy + ry} ${cx} ${cy + ry} C${cx - rx * 0.55} ${cy + ry} ${cx - rx} ${cy + ry * 0.68} ${cx - rx} ${cy + ry * 0.08} C${cx - rx} ${cy - ry * 0.45} ${cx - rx * 0.82} ${cy - ry} ${cx} ${cy - ry}Z`;

/** A pear-shaped body from shoulders (top) to the ground. */
export const bodyPath = (cx: number, top: number, bottom: number, w: number) =>
  `M${cx} ${top} C${cx + w * 0.62} ${top} ${cx + w * 0.92} ${top + (bottom - top) * 0.45} ${cx + w * 0.88} ${bottom - (bottom - top) * 0.2} C${cx + w * 0.84} ${bottom - 4} ${cx + w * 0.5} ${bottom} ${cx} ${bottom} C${cx - w * 0.5} ${bottom} ${cx - w * 0.84} ${bottom - 4} ${cx - w * 0.88} ${bottom - (bottom - top) * 0.2} C${cx - w * 0.92} ${top + (bottom - top) * 0.45} ${cx - w * 0.62} ${top} ${cx} ${top}Z`;

/** A flame tongue from a base point, pointing up (or along `ang` radians from up), `h` tall. */
export function flamePath(x: number, y: number, w: number, h: number, ang = 0): string {
  const pts: [number, number][] = [
    [x - w, y], [x - w * 1.1, y - h * 0.45], [x - w * 0.35, y - h * 0.55], [x - w * 0.55, y - h * 0.85], [x, y - h],
    [x + w * 0.3, y - h * 0.62], [x + w * 0.75, y - h * 0.78], [x + w * 1.1, y - h * 0.4], [x + w, y],
  ];
  const r = pts.map(([px, py]) => {
    const dx = px - x, dy = py - y, c = Math.cos(ang), s = Math.sin(ang);
    return [x + dx * c - dy * s, y + dx * s + dy * c] as [number, number];
  });
  const [a, b1, b2, b3, tip, c1, c2, c3, z] = r;
  return `M${a[0]} ${a[1]} C${b1[0]} ${b1[1]} ${b2[0]} ${b2[1]} ${b3[0]} ${b3[1]} C${b3[0]} ${b3[1]} ${tip[0]} ${tip[1]} ${tip[0]} ${tip[1]} C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${c2[0]} ${c2[1]} C${c3[0]} ${c3[1]} ${z[0]} ${z[1]} ${z[0]} ${z[1]} Q${x} ${y + w * 0.5} ${a[0]} ${a[1]}Z`;
}

export type EyeKind = 1 | 3 | 6 | 8 | 9;
export type Mouth = 'cat' | 'smile' | 'open' | 'fang' | 'o' | 'beak' | 'grin' | 'flat';

export class Art {
  private defs: string[] = [];
  private out: string[] = [];
  private n = 0;
  readonly id = `sp${++uid}`;
  constructor(readonly line = INK, readonly lw = 2.6) {}

  add(s: string) { this.out.push(s); return this; }

  /** A filled part with a dark line; `shade` puts a cel-shade crescent on its lower right. */
  part(d: string, fill: string, shade: string | null | true = true, o: { lw?: number; line?: string; dx?: number; dy?: number; hi?: boolean } = {}) {
    const lw = o.lw ?? this.lw;
    let s = `<path d="${d}" fill="${fill}"/>`;
    const sh = shade === true ? (fill.startsWith('#') ? darker(fill, 0.22) : null) : shade;
    if (sh) {
      const cid = `${this.id}c${this.n++}`;
      this.defs.push(`<clipPath id="${cid}"><path d="${d}"/></clipPath>`);
      const dx = o.dx ?? 7, dy = o.dy ?? 6;
      s += `<g clip-path="url(#${cid})"><path d="${d}" fill="${sh}"/><path d="${d}" fill="${fill}" transform="translate(${-dx} ${-dy})"/>`;
      // A soft highlight on the upper left of big round parts.
      if (o.hi && fill.startsWith('#')) s += `<path d="${d}" fill="${lighter(fill, 0.5)}" opacity=".5" transform="translate(${-dx * 2.4} ${-dy * 2.4}) " style="mix-blend-mode:screen"/>`;
      s += `</g>`;
    }
    if (lw > 0) s += `<path d="${d}" fill="none" stroke="${o.line ?? this.line}" stroke-width="${lw}" stroke-linejoin="round" stroke-linecap="round"/>`;
    return this.add(s);
  }

  /** A plain stroke (whiskers, mouths, folds). */
  stroke(d: string, w = 2.2, color = this.line) {
    return this.add(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`);
  }

  /** A gradient from the bottom up (or left to right) for flames, glows and water. */
  grad(stops: string[], vertical = true): string {
    const gid = `${this.id}g${this.n++}`;
    this.defs.push(`<linearGradient id="${gid}" x1="0" y1="${vertical ? 1 : 0}" x2="${vertical ? 0 : 1}" y2="0">${stops.map((c, i) => `<stop offset="${i / (stops.length - 1)}" stop-color="${c}"/>`).join('')}</linearGradient>`);
    return `url(#${gid})`;
  }
  radial(inner: string, outer: string): string {
    const gid = `${this.id}r${this.n++}`;
    this.defs.push(`<radialGradient id="${gid}"><stop offset="0" stop-color="${inner}"/><stop offset="1" stop-color="${outer}" stop-opacity="0"/></radialGradient>`);
    return `url(#${gid})`;
  }

  /** A flame part (gradient fill, thinner line). */
  flame(d: string, hot = ['#e8401a', '#ff8a1f', '#ffe36a']) { return this.part(d, this.grad(hot), null, { lw: 2.2 }); }

  /** A soft glow (no line). */
  glow(cx: number, cy: number, r: number, color: string) { return this.add(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${this.radial(color, color)}"/>`); }

  /**
   * A pair of eyes. 1: dark oval, coloured lower half, one glint. 3: the same, bigger, two glints.
   * 6: sharp, the inner top cut by a lid line (in `skin`). 8: a star-shaped glint. 9: big jelly eyes.
   */
  eyes(x1: number, x2: number, y: number, size: number, kind: EyeKind, iris: string, skin = '#000') {
    const D = '#2b1810', w = size, h = size * 1.38;
    for (const x of [x1, x2]) {
      const inward = x < (x1 + x2) / 2 ? 1 : -1;
      let s = '';
      if (kind === 1) {
        s = `<ellipse cx="${x}" cy="${y}" rx="${w}" ry="${h}" fill="${D}"/><ellipse cx="${x}" cy="${y + h * 0.42}" rx="${w * 0.72}" ry="${h * 0.42}" fill="${iris}"/><ellipse cx="${x - w * 0.28}" cy="${y - h * 0.38}" rx="${w * 0.42}" ry="${h * 0.32}" fill="#fff"/>`;
      } else if (kind === 3) {
        s = `<ellipse cx="${x}" cy="${y}" rx="${w * 1.05}" ry="${h * 1.1}" fill="${D}"/><ellipse cx="${x}" cy="${y + h * 0.5}" rx="${w * 0.75}" ry="${h * 0.4}" fill="${iris}" opacity=".95"/><ellipse cx="${x - w * 0.3}" cy="${y - h * 0.42}" rx="${w * 0.5}" ry="${h * 0.36}" fill="#fff"/><circle cx="${x + w * 0.42}" cy="${y + h * 0.2}" r="${w * 0.2}" fill="#fff"/>`;
      } else if (kind === 6) {
        s = `<ellipse cx="${x}" cy="${y}" rx="${w}" ry="${h * 0.9}" fill="${D}"/><ellipse cx="${x}" cy="${y + h * 0.4}" rx="${w * 0.7}" ry="${h * 0.38}" fill="${iris}"/><circle cx="${x - w * 0.25}" cy="${y - h * 0.18}" r="${w * 0.32}" fill="#fff"/>`
          + `<path d="M${x - inward * w * 1.7} ${y - h * 1.5} L${x + inward * w * 1.6} ${y - h * 1.5} L${x + inward * w * 1.6} ${y - h * 0.12} Z" fill="${skin}"/>`
          + `<path d="M${x - inward * w * 1.2} ${y - h * 0.95} L${x + inward * w * 1.3} ${y - h * 0.18}" stroke="${D}" stroke-width="${Math.max(2.4, w * 0.36)}" stroke-linecap="round"/>`;
      } else if (kind === 8) {
        const r = w * 0.62, cx = x - w * 0.25, cy = y - h * 0.3;
        s = `<ellipse cx="${x}" cy="${y}" rx="${w * 1.05}" ry="${h * 1.1}" fill="${D}"/><ellipse cx="${x}" cy="${y + h * 0.35}" rx="${w * 0.8}" ry="${h * 0.55}" fill="${iris}"/>`
          + `<path d="M${cx} ${cy - r} L${cx + r * 0.3} ${cy - r * 0.3} L${cx + r} ${cy} L${cx + r * 0.3} ${cy + r * 0.3} L${cx} ${cy + r} L${cx - r * 0.3} ${cy + r * 0.3} L${cx - r} ${cy} L${cx - r * 0.3} ${cy - r * 0.3}Z" fill="#fff"/><circle cx="${x + w * 0.45}" cy="${y + h * 0.45}" r="${w * 0.16}" fill="#fff"/>`;
      } else {
        s = `<ellipse cx="${x}" cy="${y}" rx="${w * 1.3}" ry="${h * 1.3}" fill="${D}"/><ellipse cx="${x}" cy="${y + h * 0.3}" rx="${w}" ry="${h * 0.85}" fill="${iris}"/><ellipse cx="${x}" cy="${y + h * 0.3}" rx="${w * 0.55}" ry="${h * 0.6}" fill="${D}"/><ellipse cx="${x - w * 0.4}" cy="${y - h * 0.45}" rx="${w * 0.55}" ry="${h * 0.4}" fill="#fff"/><circle cx="${x + w * 0.5}" cy="${y + h * 0.55}" r="${w * 0.25}" fill="#fff"/><circle cx="${x + w * 0.1}" cy="${y + h * 0.9}" r="${w * 0.12}" fill="#fff" opacity=".8"/>`;
      }
      this.add(s);
    }
    return this;
  }

  cheeks(x1: number, x2: number, y: number, r = 8, color = '#ff8fa8') {
    return this.add(`<ellipse cx="${x1}" cy="${y}" rx="${r}" ry="${r * 0.55}" fill="${color}" opacity=".55"/><ellipse cx="${x2}" cy="${y}" rx="${r}" ry="${r * 0.55}" fill="${color}" opacity=".55"/>`);
  }

  mouth(x: number, y: number, w: number, kind: Mouth) {
    const L = this.line;
    if (kind === 'cat') return this.stroke(`M${x - w} ${y} Q${x - w / 2} ${y + w * 0.8} ${x} ${y} Q${x + w / 2} ${y + w * 0.8} ${x + w} ${y}`, 2.2);
    if (kind === 'smile') return this.stroke(`M${x - w} ${y} Q${x} ${y + w * 0.9} ${x + w} ${y}`, 2.4);
    if (kind === 'flat') return this.stroke(`M${x - w} ${y} Q${x} ${y + w * 0.25} ${x + w} ${y - w * 0.1}`, 2.4);
    if (kind === 'o') return this.add(`<ellipse cx="${x}" cy="${y}" rx="${w * 0.45}" ry="${w * 0.55}" fill="#7a2230" stroke="${L}" stroke-width="2"/>`);
    if (kind === 'beak') return this.part(`M${x - w} ${y - w * 0.3} Q${x} ${y - w * 0.9} ${x + w} ${y - w * 0.3} Q${x} ${y + w * 0.9} ${x - w} ${y - w * 0.3}Z`, '#ffb43a', '#e08a1a', { lw: 2 });
    if (kind === 'grin') {
      this.add(`<path d="M${x - w} ${y - w * 0.15} Q${x} ${y + w * 1.1} ${x + w} ${y - w * 0.15} Q${x} ${y + w * 0.25} ${x - w} ${y - w * 0.15}Z" fill="#7a2230" stroke="${L}" stroke-width="2.2" stroke-linejoin="round"/>`);
      return this.add(`<path d="M${x - w * 0.62} ${y + w * 0.12} L${x - w * 0.42} ${y + w * 0.4} L${x - w * 0.25} ${y + w * 0.16}Z M${x + w * 0.62} ${y + w * 0.12} L${x + w * 0.42} ${y + w * 0.4} L${x + w * 0.25} ${y + w * 0.16}Z" fill="#fff"/>`);
    }
    if (kind === 'fang') {
      this.stroke(`M${x - w} ${y} Q${x} ${y + w * 0.9} ${x + w} ${y}`, 2.4);
      return this.add(`<path d="M${x + w * 0.3} ${y + w * 0.32} L${x + w * 0.45} ${y + w * 0.85} L${x + w * 0.65} ${y + w * 0.22}Z" fill="#fff" stroke="${L}" stroke-width="1.6" stroke-linejoin="round"/>`);
    }
    // open
    this.add(`<path d="M${x - w} ${y} Q${x} ${y + w * 1.5} ${x + w} ${y} Q${x} ${y + w * 0.3} ${x - w} ${y}Z" fill="#7a2230" stroke="${L}" stroke-width="2.2" stroke-linejoin="round"/>`);
    return this.add(`<path d="M${x - w * 0.45} ${y + w * 0.62} Q${x} ${y + w * 1.08} ${x + w * 0.45} ${y + w * 0.62} Q${x} ${y + w * 0.45} ${x - w * 0.45} ${y + w * 0.62}Z" fill="#ff8a8a"/>`);
  }

  /** The finished picture; `shadow` adds a soft ground shadow (the board draws its own). */
  svg(shadow = true): string {
    // A slightly heavier line round the outside: the silhouette grown a little in the line colour, under it all.
    this.defs.push(`<filter id="${this.id}o" x="-10%" y="-10%" width="120%" height="120%"><feMorphology in="SourceAlpha" operator="dilate" radius="1.4" result="d"/><feFlood flood-color="${this.line}"/><feComposite in2="d" operator="in" result="o"/><feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`);
    const ground = shadow ? `<ellipse cx="100" cy="${VIEW.ground + 2}" rx="60" ry="9" fill="#1d2a18" opacity=".18"/>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}" width="${VIEW.w}" height="${VIEW.h}"><defs>${this.defs.join('')}</defs>${ground}<g filter="url(#${this.id}o)">${this.out.join('')}</g></svg>`;
  }
}
