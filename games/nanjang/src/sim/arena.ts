/**
 * The ground the fight is on. Each round picks one: open, a brook crossed by
 * stepping stones, rocks in the way, a narrow alley, bamboo that hides you,
 * mud that slows you, ice that speeds you. Every layout is the same turned
 * round, so neither side is favoured.
 */

export const OPEN = 0, ROCK = 1, WATER = 2, BUSH = 3, MUD = 4, ICE = 5;
/** The board: 8 wide and 10 deep, five rows to a side (roomier than the classic 7 x 8, like the bigger auto-battler boards). */
export const COLS = 8, ROWS = 10, HALF = 5;

export interface ArenaDef { id: string; name: string; text: string; grid: number[] }

function make(id: string, name: string, text: string, fn: (x: number, y: number) => number): ArenaDef {
  const grid: number[] = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) grid.push(fn(x, y));
  // Keep it fair: the far half is the near half turned round.
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) grid[(ROWS - 1 - y) * COLS + (COLS - 1 - x)] = grid[y * COLS + x];
  return { id, name, text, grid };
}

const at = (cells: [number, number][]) => (x: number, y: number) => cells.some(([a, b]) => a === x && b === y);

export const ARENAS: Record<string, ArenaDef> = Object.fromEntries([
  make('yard', '너른 마당', '막힌 데 없는 기본 판이에요.', () => OPEN),
  make('brook', '징검다리 개울', '가운데 개울은 양쪽 징검다리로만 건너요. 맨 앞줄은 물이에요.', (x, y) => (y === HALF - 1 || y === HALF) && x !== 1 && x !== COLS - 2 ? WATER : OPEN),
  make('rocks', '바위 언덕', '바위가 길을 막아요. 돌아가는 사이 원거리 말이 먼저 쏴요.', (x, y) => at([[1, HALF - 1], [3, HALF - 2], [COLS - 2, HALF - 3], [5, HALF - 1]])(x, y) ? ROCK : OPEN),
  make('alley', '좁은 골목', '양옆이 담이라 가운데 여섯 줄만 써요. 몸싸움이 세져요.', (x) => x === 0 || x === COLS - 1 ? ROCK : OPEN),
  make('bamboo', '대숲', '대숲 칸에 선 말은 평타를 20% 피해요.', (x, y) => ((x === 2 || x === COLS - 3) && y >= HALF - 3 && y <= HALF - 1) || ((x === 0 || x === COLS - 1) && y >= 1 && y <= 2) ? BUSH : OPEN),
  make('mudflat', '갯벌', '가운데 네 줄은 진흙이라 걸음이 느려요. 원거리 말이 유리해요.', (_x, y) => y >= HALF - 2 && y <= HALF - 1 ? MUD : OPEN),
  make('ice', '꽁꽁 언 연못', '얼음 위에서는 빨리 미끄러져 금세 맞붙어요.', (_x, y) => y >= HALF - 2 && y <= HALF - 1 ? ICE : OPEN),
].map((a) => [a.id, a]));

export const ARENA_ROTATION = ['yard', 'brook', 'rocks', 'alley', 'bamboo', 'mudflat', 'ice'];
/** 사계절 요괴: the season sets the ground. */
export const SEASON_ARENA = ['bamboo', 'brook', 'mudflat', 'ice'];
export const SEASON_NAME = ['봄', '여름', '가을', '겨울'];

export const terrain = (arena: string, x: number, y: number) => ARENAS[arena]?.grid[y * COLS + x] ?? OPEN;
export const blocks = (t: number) => t === ROCK || t === WATER;
/** Whether a player may stand a piece on board square (c, r) of their own half. */
export const standable = (arena: string, c: number, r: number) => !blocks(terrain(arena, c, HALF + r));
