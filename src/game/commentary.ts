import type { Rng } from './rng';

interface Ctx {
  player: string;
  assist?: string;
  keeper?: string;
  team: string;
  opponent: string;
}

const fill = (template: string, ctx: Ctx): string =>
  template
    .replace(/{player}/g, ctx.player)
    .replace(/{assist}/g, ctx.assist ?? '동료')
    .replace(/{keeper}/g, ctx.keeper ?? '골키퍼')
    .replace(/{team}/g, ctx.team)
    .replace(/{opponent}/g, ctx.opponent);

const GOAL = [
  '{assist}의 침투 패스를 받은 {player}, 침착하게 마무리합니다! 골!',
  '{player}! 페널티 박스 정면에서 감아 찬 슛이 그대로 골망을 흔듭니다!',
  '{assist}의 크로스를 {player}가 머리로 받아넣습니다. {team} 골!',
  '{keeper}가 손을 뻗어보지만 늦었습니다. {player}의 골!',
  '{player}가 수비 두 명을 제치고 그대로 마무리! 환상적인 개인 능력입니다.',
  '역습 한 방! {assist}가 내준 공을 {player}가 밀어 넣습니다.',
  '{player}의 중거리 슛이 그대로 골문 구석에 꽂힙니다! 대단한 골입니다.',
];

const SAVE = [
  '{player}의 슛! {keeper}가 몸을 날려 쳐냅니다.',
  '{player}가 때렸지만 {keeper}의 선방에 막힙니다.',
  '결정적인 기회! {keeper}가 발을 뻗어 막아냅니다.',
  '{player}의 헤더, {keeper}가 안정적으로 잡아냅니다.',
];

const MISS = [
  '{player}의 슛이 골대를 살짝 빗나갑니다. 아쉬운 장면.',
  '{player}가 마무리했지만 크로스바를 넘어갑니다.',
  '좋은 기회였지만 {player}의 슛이 옆그물을 때립니다.',
  '{player}, 골대 정면에서 놓칩니다! 잡아야 했던 기회입니다.',
];

const BLOCK = [
  '{player}가 슛을 시도했지만 수비수 몸에 맞고 굴절됩니다.',
  '{team}의 공격, {opponent} 수비가 끝까지 따라붙어 차단합니다.',
  '{player}의 슛, 수비 벽에 막힙니다. 코너킥.',
];

const CHANCE = [
  '{team}가 측면을 파고들며 기회를 만듭니다.',
  '{player}가 중원에서 공을 잡고 전진합니다.',
  '{team}의 빠른 전개, 위험 지역까지 올라옵니다.',
];

const FOUL = [
  '{player}가 늦게 들어가며 파울을 범합니다.',
  '거친 태클! {player}에게 파울이 선언됩니다.',
  '{player}가 상대를 잡아 세웁니다. 프리킥.',
];

const YELLOW = [
  '{player}에게 경고가 주어집니다. 무리한 태클이었습니다.',
  '심판이 {player}를 불러 옐로카드를 꺼냅니다.',
];

const RED = [
  '{player} 퇴장! {team}가 수적 열세에 놓입니다.',
  '심판이 주저 없이 레드카드! {player}가 그라운드를 떠납니다.',
];

const INJURY = [
  '{player}가 그라운드에 쓰러집니다. 스스로 일어나지 못하는 모습입니다.',
  '{player}가 햄스트링을 붙잡습니다. 교체가 필요해 보입니다.',
];

const pickFrom = (rng: Rng, pool: string[], ctx: Ctx) => fill(rng.pick(pool), ctx);

export const commentary = {
  goal: (rng: Rng, ctx: Ctx) => pickFrom(rng, GOAL, ctx),
  save: (rng: Rng, ctx: Ctx) => pickFrom(rng, SAVE, ctx),
  miss: (rng: Rng, ctx: Ctx) => pickFrom(rng, MISS, ctx),
  block: (rng: Rng, ctx: Ctx) => pickFrom(rng, BLOCK, ctx),
  chance: (rng: Rng, ctx: Ctx) => pickFrom(rng, CHANCE, ctx),
  foul: (rng: Rng, ctx: Ctx) => pickFrom(rng, FOUL, ctx),
  yellow: (rng: Rng, ctx: Ctx) => pickFrom(rng, YELLOW, ctx),
  red: (rng: Rng, ctx: Ctx) => pickFrom(rng, RED, ctx),
  injury: (rng: Rng, ctx: Ctx) => pickFrom(rng, INJURY, ctx),
};
