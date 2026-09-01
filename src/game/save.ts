/**
 * 세이브 · 로드.
 *
 * 24개국을 전부 켜면 선수가 만 명을 넘습니다. 평범한 JSON 으로 떨구면
 * localStorage 한도(대략 5MB)를 그대로 넘기기 때문에, 선수 레코드는 키 없는
 * 배열로 눕히고 능력치 47개는 한 글자씩 문자열로 눌러 담습니다.
 *
 * ATTRIBUTE_KEYS 와 ROLES 의 순서가 포맷의 일부입니다. 순서를 바꾸려면
 * SAVE_VERSION 을 올리고 마이그레이션을 붙여야 합니다.
 */

import { ATTRIBUTE_KEYS, ROLES, type Attributes, type Role } from './attributes';
import { PERSONALITIES } from './player';
import type {
  CareerStats, CompStat, Contract, Fixture, GameState, LeagueState, Player,
  PersonalityId, SeasonStats, TableRow,
} from './types';

export const SAVE_VERSION = 3;
export const SAVE_KEY = 'football-agent-save-v3';
/** 리그 계층이 들어오기 전 포맷. 남아 있으면 지웁니다. */
const LEGACY_KEYS = ['football-agent-save-v1'];
/**
 * v2 는 계층까지는 같고 출전 수 의미만 다릅니다 — apps 가 선발만 세고 있어서
 * 평점이 부풀어 있었습니다. 진행 중인 게임을 버리지 않도록 읽어서 고칩니다.
 */
const MIGRATABLE_KEYS = ['football-agent-save-v2'];

/** 1-20 값을 한 글자로. 코드 포인트 48('0')부터 씁니다. */
const encodeAttributes = (attrs: Attributes): string =>
  ATTRIBUTE_KEYS.map((key) => String.fromCharCode(48 + (attrs[key] ?? 1))).join('');

function decodeAttributes(text: string): Attributes {
  const attrs = {} as Attributes;
  ATTRIBUTE_KEYS.forEach((key, i) => {
    attrs[key] = text.charCodeAt(i) - 48 || 1;
  });
  return attrs;
}

/** 포지션 숙련도 — [역할 인덱스, 값] 쌍을 두 글자씩. */
function encodePositions(positions: Partial<Record<Role, number>>): string {
  let out = '';
  for (const [role, value] of Object.entries(positions)) {
    const index = ROLES.indexOf(role as Role);
    if (index < 0 || value === undefined) continue;
    out += String.fromCharCode(48 + index) + String.fromCharCode(48 + value);
  }
  return out;
}

function decodePositions(text: string): Partial<Record<Role, number>> {
  const out: Partial<Record<Role, number>> = {};
  for (let i = 0; i + 1 < text.length; i += 2) {
    const role = ROLES[text.charCodeAt(i) - 48];
    if (role) out[role] = text.charCodeAt(i + 1) - 48;
  }
  return out;
}

const PERSONALITY_IDS = PERSONALITIES.map((p) => p.id);

/** 꼬리의 0 을 잘라 냅니다. 개막 직후에는 대부분의 기록이 전부 0 입니다. */
function trimZeros(values: number[]): number[] {
  let end = values.length;
  while (end > 0 && values[end - 1] === 0) end--;
  return values.slice(0, end);
}

const statTuple = (s: SeasonStats): number[] => trimZeros(
  [s.apps, s.subApps, s.minutes, s.goals, s.assists, s.cleanSheets, s.conceded, Math.round(s.ratingSum * 10), s.yellow, s.red, s.motm]);

const statFromTuple = (t: number[]): SeasonStats => ({
  apps: t[0] ?? 0, subApps: t[1] ?? 0, minutes: t[2] ?? 0, goals: t[3] ?? 0, assists: t[4] ?? 0,
  cleanSheets: t[5] ?? 0, conceded: t[6] ?? 0, ratingSum: (t[7] ?? 0) / 10, yellow: t[8] ?? 0,
  red: t[9] ?? 0, motm: t[10] ?? 0,
});

const careerTuple = (c: CareerStats): number[] => trimZeros([
  c.apps, c.subApps, c.minutes, c.goals, c.assists, c.cleanSheets, c.conceded,
  Math.round(c.ratingSum * 10), c.yellow, c.red, c.motm, c.seasons, c.trophies,
]);
const careerFromTuple = (t: number[]): CareerStats => ({
  ...statFromTuple(t), seasons: t[11] ?? 0, trophies: t[12] ?? 0,
});

const contractTuple = (c: Contract): Array<number | string | null> =>
  [Math.round(c.wage * 10), c.expires, c.releaseClause, c.agentFeePct, c.brokeredBy ?? 0, c.signedSeason];

const contractFromTuple = (t: Array<number | string | null>, clubId: string): Contract => ({
  clubId,
  wage: Number(t[0]) / 10,
  expires: Number(t[1]),
  releaseClause: Number(t[2]),
  agentFeePct: Number(t[3]),
  brokeredBy: t[4] === 0 ? null : (t[4] as string),
  signedSeason: Number(t[5]),
});

const compTuple = (s: CompStat): number[] => trimZeros([s.apps, s.goals, s.assists, s.cleanSheets, Math.round(s.ratingSum * 10)]);
const compFromTuple = (t: number[]): CompStat => ({
  apps: t[0] ?? 0, goals: t[1] ?? 0, assists: t[2] ?? 0, cleanSheets: t[3] ?? 0, ratingSum: (t[4] ?? 0) / 10,
});

type PlayerTuple = unknown[];

function encodePlayer(p: Player): PlayerTuple {
  return [
    p.id, p.name, p.age, p.nationality, p.secondNationality ?? 0,
    p.height, p.weight, p.footLeft, p.footRight,
    encodeAttributes(p.attributes), encodePositions(p.positions), ROLES.indexOf(p.bestRole),
    p.ca, p.pa, PERSONALITY_IDS.indexOf(p.personality),
    p.clubId ?? 0, p.contract ? contractTuple(p.contract) : 0, p.agentId ?? 0,
    Math.round(p.morale), Math.round(p.form), Math.round(p.fitness), p.injuredWeeks,
    statTuple(p.season),
    Object.entries(p.compStats).map(([id, stat]) => [id, ...compTuple(stat)]),
    careerTuple(p.career),
    p.honours.map((h) => [h.season, h.label, h.competitionId ?? 0]),
    p.value, Math.round(p.scouted), p.retired ? 1 : 0,
    p.loan ? [p.loan.parentClubId, p.loan.untilSeason] : 0,
    Math.round((p.caProgress ?? 0) * 100),
  ];
}

function decodePlayer(t: PlayerTuple): Player {
  const bestRole = ROLES[t[11] as number] ?? 'MC';
  const group = bestRole === 'GK' ? 'GK'
    : ['DR', 'DC', 'DL', 'WBR', 'WBL'].includes(bestRole) ? 'DF'
    : ['DM', 'MR', 'MC', 'ML'].includes(bestRole) ? 'MF' : 'FW';

  const compStats: Record<string, CompStat> = {};
  for (const row of (t[23] as unknown[][]) ?? []) {
    compStats[row[0] as string] = compFromTuple(row.slice(1) as number[]);
  }

  const loanTuple = t[29];
  const loan = Array.isArray(loanTuple)
    ? { parentClubId: String(loanTuple[0]), untilSeason: Number(loanTuple[1]) }
    : undefined;

  return {
    id: t[0] as string,
    name: t[1] as string,
    age: t[2] as number,
    nationality: t[3] as string,
    secondNationality: t[4] === 0 ? undefined : (t[4] as string),
    height: t[5] as number,
    weight: t[6] as number,
    footLeft: t[7] as number,
    footRight: t[8] as number,
    attributes: decodeAttributes(t[9] as string),
    positions: decodePositions(t[10] as string),
    bestRole,
    group,
    ca: t[12] as number,
    pa: t[13] as number,
    personality: (PERSONALITY_IDS[t[14] as number] ?? 'balanced') as PersonalityId,
    clubId: t[15] === 0 ? null : (t[15] as string),
    loan,
    // 임대 중이면 계약은 원 소속 구단 것입니다. 여기서 clubId 를 쓰면
    // 저장했다 불러오는 것만으로 임대가 완전 이적이 되어 버립니다.
    contract: t[16] === 0 ? null
      : contractFromTuple(t[16] as Array<number | string | null>, loan?.parentClubId ?? String(t[15])),
    agentId: t[17] === 0 ? null : (t[17] as string),
    morale: t[18] as number,
    form: t[19] as number,
    fitness: t[20] as number,
    injuredWeeks: t[21] as number,
    season: statFromTuple(t[22] as number[]),
    compStats,
    career: careerFromTuple(t[24] as number[]),
    honours: ((t[25] as unknown[][]) ?? []).map((h) => ({
      season: h[0] as number,
      label: h[1] as string,
      competitionId: h[2] === 0 ? undefined : (h[2] as string),
    })),
    caProgress: ((t[30] as number) ?? 0) / 100,
    value: t[26] as number,
    scouted: t[27] as number,
    retired: t[28] === 1,
  };
}

/**
 * 리그 일정은 fixture 하나하나가 id 와 대회 id 를 들고 있어 그대로 저장하면
 * 세이브의 4분의 1을 차지합니다. 구단은 리그 내 인덱스로, id 는 순번으로
 * 되살립니다. 순위표는 아예 저장하지 않고 치른 경기에서 다시 계산합니다.
 */
function encodeLeague(league: LeagueState): unknown[] {
  const index = new Map(league.clubIds.map((id, i) => [id, i]));
  const fixtures = league.fixtures.map((f) => {
    const row = [f.week, f.round, index.get(f.homeId) ?? 0, index.get(f.awayId) ?? 0, f.played ? 1 : 0, f.homeGoals, f.awayGoals];
    return trimZeros(row);
  });
  return [
    league.id, league.competitionId, league.clubIds, league.rounds,
    league.championId ?? 0, fixtures, league.countryId, league.tier,
  ];
}

function decodeLeague(t: unknown[]): LeagueState {
  const competitionId = t[1] as string;
  const clubIds = t[2] as string[];
  const fixtures: Fixture[] = ((t[5] as number[][]) ?? []).map((row, i) => ({
    id: `${competitionId}#${i}`,
    competitionId,
    week: row[0] ?? 1,
    round: row[1] ?? 1,
    homeId: clubIds[row[2] ?? 0],
    awayId: clubIds[row[3] ?? 0],
    played: (row[4] ?? 0) === 1,
    homeGoals: row[5] ?? 0,
    awayGoals: row[6] ?? 0,
  }));
  const league: LeagueState = {
    id: t[0] as string,
    countryId: (t[6] as string) ?? (t[0] as string),
    tier: (t[7] as number) ?? 1,
    competitionId,
    clubIds,
    fixtures,
    table: {},
    rounds: t[3] as number,
    championId: t[4] === 0 ? undefined : (t[4] as string),
  };
  rebuildTable(league);
  return league;
}

/** 치른 경기에서 순위표를 다시 만듭니다. */
export function rebuildTable(league: LeagueState): void {
  const table: Record<string, TableRow> = {};
  for (const clubId of league.clubIds) {
    table[clubId] = { clubId, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 };
  }
  for (const fixture of league.fixtures) {
    if (!fixture.played) continue;
    const home = table[fixture.homeId];
    const away = table[fixture.awayId];
    if (!home || !away) continue;
    home.played++; away.played++;
    home.goalsFor += fixture.homeGoals; home.goalsAgainst += fixture.awayGoals;
    away.goalsFor += fixture.awayGoals; away.goalsAgainst += fixture.homeGoals;
    if (fixture.homeGoals > fixture.awayGoals) { home.won++; home.points += 3; away.lost++; }
    else if (fixture.homeGoals < fixture.awayGoals) { away.won++; away.points += 3; home.lost++; }
    else { home.drawn++; away.drawn++; home.points++; away.points++; }
  }
  league.table = table;
}

interface SaveEnvelope {
  v: number;
  /** 선수와 리그를 뺀 나머지 상태. */
  rest: Record<string, unknown>;
  players: PlayerTuple[];
  leagues: unknown[][];
}

export function serialize(state: GameState): string {
  const { players, leagues, clubs, ...others } = state;
  // 스쿼드 명단은 선수의 clubId 로 되살릴 수 있으므로 저장하지 않습니다.
  const slimClubs = Object.fromEntries(
    Object.entries(clubs).map(([id, club]) => [id, { ...club, playerIds: [] }]));
  const envelope: SaveEnvelope = {
    v: SAVE_VERSION,
    rest: { ...others, clubs: slimClubs },
    players: Object.values(players).map(encodePlayer),
    leagues: Object.values(leagues).map(encodeLeague),
  };
  return JSON.stringify(envelope);
}

export function deserialize(text: string): GameState | null {
  try {
    const envelope = JSON.parse(text) as SaveEnvelope;
    if (!envelope) return null;
    if (envelope.v !== SAVE_VERSION && envelope.v !== 2) return null;
    const needsAppsFix = envelope.v === 2;

    const players: Record<string, Player> = {};
    for (const tuple of envelope.players) {
      const player = decodePlayer(tuple);
      if (needsAppsFix) {
        // v2 의 apps 는 선발만 셌습니다. 교체 출전을 더해 총 출전으로 맞춥니다.
        player.season.apps += player.season.subApps;
        player.career.apps += player.career.subApps;
      }
      players[player.id] = player;
    }

    const leagues: Record<string, LeagueState> = {};
    for (const tuple of envelope.leagues ?? []) {
      const league = decodeLeague(tuple);
      leagues[league.id] = league;
    }

    const state = { ...envelope.rest, players, leagues } as unknown as GameState;

    // 스쿼드 명단 복원 — 능력 순으로 정렬해 두면 매 시즌 같은 순서가 됩니다.
    for (const club of Object.values(state.clubs)) club.playerIds = [];
    const sorted = Object.values(players).filter((p) => p.clubId && !p.retired).sort((a, b) => b.ca - a.ca);
    for (const player of sorted) {
      const club = state.clubs[player.clubId as string];
      if (club) club.playerIds.push(player.id);
      else player.clubId = null;
    }
    return state;
  } catch {
    return null;
  }
}

// ── localStorage ────────────────────────────────────────────────────────

/**
 * gzip 이 있으면 압축해서 넣습니다. 24개국을 전부 켠 세계는 압축하지 않으면
 * localStorage 한도(문자 수 기준 대략 500만)를 넘깁니다.
 */
const GZIP_PREFIX = 'gz:';

const hasCompression = (): boolean =>
  typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

async function streamToBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  // 스택 한도에 걸리지 않도록 나눠서 넘깁니다.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToBuffer(text: string): ArrayBuffer {
  const binary = atob(text);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return buffer;
}

async function compress(text: string): Promise<string> {
  if (!hasCompression()) return text;
  const input = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return GZIP_PREFIX + bytesToBase64(await streamToBytes(input));
}

async function decompress(text: string): Promise<string> {
  if (!text.startsWith(GZIP_PREFIX)) return text;
  if (!hasCompression()) throw new Error('이 브라우저에서는 압축 세이브를 읽을 수 없습니다.');
  const buffer = base64ToBuffer(text.slice(GZIP_PREFIX.length));
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new TextDecoder().decode(await streamToBytes(stream));
}

export interface SaveResult {
  ok: boolean;
  bytes: number;
  message?: string;
}

export async function saveGame(state: GameState): Promise<SaveResult> {
  let payload: string;
  try {
    payload = await compress(serialize(state));
  } catch {
    payload = serialize(state);
  }
  try {
    localStorage.setItem(SAVE_KEY, payload);
    return { ok: true, bytes: payload.length };
  } catch {
    // 대부분 용량 초과입니다. 리그를 줄이면 해결됩니다.
    return {
      ok: false,
      bytes: payload.length,
      message: `저장에 실패했습니다 (${(payload.length / 1024 / 1024).toFixed(1)}MB). 활성화한 리그 수를 줄이면 저장할 수 있습니다.`,
    };
  }
}

export async function loadGame(): Promise<GameState | null> {
  try {
    for (const key of LEGACY_KEYS) localStorage.removeItem(key);
    // 새 키가 없으면 이전 버전 세이브를 읽어 옮겨 옵니다.
    let text = localStorage.getItem(SAVE_KEY);
    let migratedFrom: string | null = null;
    if (!text) {
      for (const key of MIGRATABLE_KEYS) {
        const legacy = localStorage.getItem(key);
        if (legacy) { text = legacy; migratedFrom = key; break; }
      }
    }
    if (!text) return null;
    const state = deserialize(await decompress(text));
    if (state && migratedFrom) {
      void saveGame(state).then(() => localStorage.removeItem(migratedFrom!));
    }
    return state;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* 무시 */ }
}

export function hasSave(): boolean {
  try {
    return localStorage.getItem(SAVE_KEY) !== null
      || MIGRATABLE_KEYS.some((key) => localStorage.getItem(key) !== null);
  } catch { return false; }
}
