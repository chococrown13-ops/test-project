import type { Rng } from '../rng';
import type { ChanceType } from '../types';

/** Korean match commentary. Kept short so it reads on a phone. */

export interface Ctx {
  p: string;
  a?: string;
  gk?: string;
  team: string;
}

const fill = (t: string, c: Ctx) =>
  t
    .replace(/{p}/g, c.p)
    .replace(/{a}/g, c.a ?? '동료')
    .replace(/{gk}/g, c.gk ?? '골키퍼')
    .replace(/{team}/g, c.team);

const BUILD: Record<ChanceType, string[]> = {
  through: ['{a}의 스루패스가 수비 뒷공간을 가릅니다.', '{a}, 라인 사이로 절묘한 침투 패스!'],
  cross: ['{a}의 크로스가 문전으로 날아듭니다.', '측면을 허문 {a}, 그대로 크로스!'],
  cutback: ['{a}가 엔드라인까지 파고들어 컷백!', '{a}, 바이라인에서 뒤로 내줍니다.'],
  dribble: ['{p}가 수비 두 명을 연달아 제칩니다.', '{p}, 과감한 드리블 돌파!'],
  longshot: ['{p}에게 공간이 생겼습니다. 먼 거리에서—', '{p}, 페널티 박스 밖에서 기회를 엿봅니다.'],
  counter: ['공을 끊어낸 {team}, 순식간에 역습!', '빠른 역습! {a}가 전방으로 길게 연결합니다.'],
  longball: ['후방에서 길게 넘어온 공, {a}가 머리로 떨궈 줍니다.', '롱볼 한 번에 수비 라인이 무너집니다.'],
  corner: ['{a}의 코너킥, 문전 혼전!', '코너킥이 정확히 떨어집니다.'],
  freekick: ['{p}가 프리킥 키커로 섰습니다.', '좋은 위치의 프리킥, {p}가 공을 내려놓습니다.'],
  penalty: ['페널티킥! 키커는 {p}.', '주심이 페널티 스폿을 가리킵니다. {p}가 나섭니다.'],
};

const GOAL: Record<ChanceType, string[]> = {
  through: ['{p}, 골키퍼와 1대1에서 침착하게 밀어 넣습니다! 골!', '{p}가 {gk}를 제치고 빈 골문에 넣습니다!'],
  cross: ['{p}의 헤더! 골망을 흔듭니다!', '{p}가 몸을 날려 마무리! 골!'],
  cutback: ['{p}가 논스톱으로 꽂아 넣습니다! 골!', '{p}, 가볍게 방향만 바꿔 골!'],
  dribble: ['그리고 마무리까지! {p}의 원맨쇼!', '{p}, 돌파에 이은 낮은 슈팅으로 골!'],
  longshot: ['{p}의 중거리 슛이 그대로 골문 구석에 꽂힙니다! 원더골!', '대포알 같은 {p}의 슈팅! {gk}는 손도 못 씁니다!'],
  counter: ['역습 마무리! {p}가 골을 터뜨립니다!', '{p}, 단독 질주 끝에 골!'],
  longball: ['{p}가 세컨드볼을 그대로 차 넣습니다! 골!', '{p}의 발리! 골!'],
  corner: ['{p}의 헤더! 세트피스로 골을 만들어냅니다!', '혼전 속에서 {p}가 밀어 넣습니다!'],
  freekick: ['{p}의 프리킥이 벽을 넘어 그대로 골문으로! 골!', '환상적인 프리킥! {p}!'],
  penalty: ['{p}, 침착하게 성공시킵니다! 골!', '{p}가 {gk}를 완전히 속입니다! 골!'],
};

const SAVE = [
  '{p}의 슈팅, {gk}가 몸을 날려 막아냅니다!',
  '{gk}의 선방! {p}가 머리를 감싸 쥡니다.',
  '{p}의 날카로운 슛을 {gk}가 쳐냅니다.',
  '{gk}, 동물적인 반사신경으로 {p}의 슈팅을 막습니다!',
];
const MISS = [
  '{p}의 슈팅이 골대를 살짝 벗어납니다.',
  '{p}, 크로스바 위로 넘겨 버립니다.',
  '아깝습니다! {p}의 슛이 골대를 맞고 나갑니다!',
  '{p}의 슈팅은 힘이 너무 들어갔습니다.',
];
const BLOCK = ['{p}의 슈팅, 수비 몸에 맞고 굴절됩니다.', '{p}가 때렸지만 수비벽에 막힙니다.', '{p}의 슛, 육탄 방어에 걸립니다.'];
const PEN_SAVE = ['{gk}가 {p}의 페널티킥을 막아냅니다!', '{p}의 페널티킥 실축! {gk}의 승리입니다!'];

export const commentary = {
  build: (rng: Rng, type: ChanceType, c: Ctx) => fill(rng.pick(BUILD[type]), c),
  goal: (rng: Rng, type: ChanceType, c: Ctx) => fill(rng.pick(GOAL[type]), c),
  save: (rng: Rng, type: ChanceType, c: Ctx) => fill(rng.pick(type === 'penalty' ? PEN_SAVE : SAVE), c),
  miss: (rng: Rng, c: Ctx) => fill(rng.pick(MISS), c),
  block: (rng: Rng, c: Ctx) => fill(rng.pick(BLOCK), c),
  foul: (rng: Rng, c: Ctx) =>
    fill(rng.pick(['{p}의 파울. 주심이 휘슬을 붑니다.', '{p}가 뒤에서 넘어뜨립니다. 파울.', '{p}의 늦은 태클.']), c),
  yellow: (rng: Rng, c: Ctx) =>
    fill(rng.pick(['{p}에게 옐로카드.', '거친 태클, {p}가 경고를 받습니다.', '{p}, 항의하다 경고를 받습니다.']), c),
  secondYellow: (_rng: Rng, c: Ctx) => fill('{p} 두 번째 경고! 퇴장입니다!', c),
  red: (rng: Rng, c: Ctx) => fill(rng.pick(['{p} 다이렉트 퇴장! 위험한 태클이었습니다.', '레드카드! {p}가 그라운드를 떠납니다.']), c),
  injury: (rng: Rng, c: Ctx) =>
    fill(rng.pick(['{p}가 쓰러져 일어나지 못합니다. 부상인 것 같습니다.', '{p}가 다리를 절뚝입니다.']), c),
  offside: (rng: Rng, c: Ctx) => fill(rng.pick(['{p}, 오프사이드 깃발이 올라갑니다.', '부심의 깃발. {p}가 한 발 빨랐습니다.']), c),
};
