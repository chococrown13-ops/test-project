import { CARDS, type Lean } from './cards';
import { indicators } from './decade';
import { type Game, type MayorPick, type Offer, pick, rand } from './world';

export interface Mayor { id: string; name: string; motto: string; w: Lean | null }

/** The four AI mayors who stand in when nobody decides. `w` weighs the card arrows; 눈치 weighs whatever is lowest. */
export const MAYORS: Mayor[] = [
  { id: 'dev', name: '개발왕 시장', motto: '새 건물이 들어서야 동네가 살아요.', w: { m: 0.3, v: 1.2, r: 0.4, b: 1.3 } },
  { id: 'alley', name: '골목지기 시장', motto: '한번 헐면 다시는 못 만들어요.', w: { m: 1.5, v: 0.6, r: 1.1, b: 0.3 } },
  { id: 'thrift', name: '짠돌이 시장', motto: '구청 금고부터 지켜야죠.', w: { m: 0.5, v: 0.6, r: 0.6, b: 1.7 } },
  { id: 'mood', name: '눈치 시장', motto: '요즘 제일 아쉬운 게 뭔지 봐야죠.', w: null },
];
export const mayorById = (id: string) => MAYORS.find((m) => m.id === id) ?? MAYORS[3];

/** A quirk on top of the personality: one card it likes more than it should. */
export const TRAITS: { text: string; card: string }[] = [
  { text: '역을 좋아해요', card: 'station' },
  { text: '기록하는 걸 좋아해요', card: 'record' },
  { text: '축제를 좋아해요', card: 'festival' },
  { text: '높은 건물을 좋아해요', card: 'tower' },
  { text: '오래된 가게 단골이에요', card: 'support' },
  { text: '서명 운동에 약해요', card: 'petition' },
  { text: '공원을 좋아해요', card: 'park' },
  { text: '고쳐 쓰는 걸 좋아해요', card: 'reuse' },
];

export function appointMayor(g: Game): MayorPick {
  return { id: pick(g, MAYORS).id, trait: pick(g, TRAITS).text };
}

function weights(g: Game, m: Mayor): Lean {
  if (m.w) return m.w;
  const ind = indicators(g);
  const f = (x: number) => Math.max(0.2, (70 - x) / 25);
  return { m: f(ind.memory), v: f(ind.vitality), r: f(ind.residents), b: f(ind.budget) };
}

/**
 * What the AI mayor would choose among the offers (the last option is always
 * 지켜보기). Mostly in character, sometimes not: a mayor can change their mind.
 */
export function mayorChoice(g: Game, offers: Offer[], who: MayorPick = g.mayor): { index: number; changed: boolean } {
  const m = mayorById(who.id);
  const w = weights(g, m);
  const trait = TRAITS.find((t) => t.text === who.trait);
  const broke = g.money < -40;
  const scored = offers.map((o, index) => {
    const c = CARDS[o.card], l = c.lean;
    let s = l.m * w.m + l.v * w.v + l.r * w.r + l.b * w.b;
    if (trait && trait.card === c.id) s += 2;
    if (broke && c.money(g, o) < 0) s -= 2.5; // nobody spends from an empty purse
    s += (rand(g) - 0.5) * 1.2;
    return { index, s };
  }).sort((a, b) => b.s - a.s);
  // One time in seven they surprise everyone.
  if (scored.length > 1 && rand(g) < 0.14) return { index: scored[1].index, changed: true };
  return { index: scored[0].index, changed: false };
}
