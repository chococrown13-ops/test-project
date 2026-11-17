import { losePlace, newBuilding, onAvenue, rebuild } from './decade';
import { eul, eun, iga, KIND_NAME, ro } from './text';
import { B, cellsNear, clamp, type District, districtCells, type Game, Ground, N, OLD, type Offer, type Place, rand, RoadT } from './world';

export type Cat = '재개발' | '보존' | '고쳐쓰기' | '기반' | '청원' | '제안' | '쉼';
export interface Lean { m: number; v: number; r: number; b: number }

export interface Card {
  id: string;
  cat: Cat;
  /** Years the card can come up in (inclusive start, exclusive end). */
  from?: number;
  to?: number;
  target: 'district' | 'place' | 'area' | 'none';
  /** Radius of the area cards, in cells. */
  radius?: number;
  /** Rough direction of each indicator, shown as arrows on the card. */
  lean: Lean;
  /** Money in (+) or out (-), 억 원. */
  money: (g: Game, o: Offer) => number;
  okDistrict?: (g: Game, d: District) => boolean;
  okPlace?: (g: Game, p: Place) => boolean;
  title: (g: Game, o: Offer) => string;
  desc: (g: Game, o: Offer) => string;
  apply: (g: Game, o: Offer, out: string[]) => void;
  /** Cells the card will actually change, when that's narrower than the whole area. */
  cells?: (g: Game, o: Offer) => number[];
}

const dn = (g: Game, o: Offer) => g.districts[o.district]?.name ?? '';
const pl = (g: Game, o: Offer) => g.places[o.place];

/** Cells an area card would rebuild: old fabric, empty houses and unprotected places. */
export function areaCells(g: Game, o: Offer, keep = (t: number) => OLD.has(t) || t === B.Vacant || t === B.Place): number[] {
  const x = o.cell % N, y = (o.cell / N) | 0;
  return cellsNear(g, x, y, o.r, o.district).filter((i) => {
    if (g.road[i] || g.ground[i] === Ground.Water || !keep(g.btype[i])) return false;
    const p = g.places.find((q) => q.y * N + q.x === i && q.state !== 'lost');
    return !p || !p.protected;
  });
}

/** Places a card would take, so the table can name them before you choose. */
export function threatened(g: Game, o: Offer): Place[] {
  const c = CARDS[o.card];
  if (c.id === 'sell') return [pl(g, o)];
  if (c.target !== 'area') return [];
  const cells = new Set(affected(g, o));
  return g.places.filter((p) => p.state !== 'lost' && !p.protected && cells.has(p.y * N + p.x));
}

/** What an area card will change, for the map highlight and the threat list. */
export function affected(g: Game, o: Offer): number[] {
  const c = CARDS[o.card];
  return c.cells ? c.cells(g, o) : areaCells(g, o);
}

const roadCells = (g: Game, o: Offer) => areaCells(g, o, (t) => t !== B.None).filter((i) => onAvenue(g, i));

const REUSE: Partial<Record<string, string>> = {
  bath: '동네 미술관', cinema: '작은 영화관 겸 도서관', school: '마을 돌봄 학교', mill: '동네 공유 부엌', tearoom: '청년 카페',
  hardware: '공구 도서관', briquette: '연탄 박물관', photo: '동네 기록관', books: '골목 책방', market: '청년 장터',
  church: '마을 음악당', barber: '골목 사랑방', corner: '동네 상회 카페', gukbap: '마을 식당', snack: '어린이 식당', chinese: '요리 교실',
};

function redevelop(g: Game, o: Offer, out: string[], kind: (i: number) => number, why: string) {
  const cells = areaCells(g, o);
  for (const i of cells) rebuild(g, i, kind(i), why, '구청', out);
  const d = g.districts[o.district];
  d.churn = (d.churn ?? 0) + cells.length;
  return cells.length;
}

const list: Card[] = [
  {
    id: 'apt', cat: '재개발', from: 1975, to: 2040, target: 'area', radius: 13,
    lean: { m: -2, v: 1, r: -2, b: 2 }, money: () => 40,
    okDistrict: (g, d) => !d.protected && d.kind !== 'river' || !d.protected && g.year >= 1990,
    title: (g, o) => `${dn(g, o)} 아파트 단지 재개발`,
    desc: () => '낡은 집을 허물고 아파트를 올려요. 집이 크게 늘고 세금도 들어오지만, 그 자리의 골목과 가게는 사라져요.',
    apply: (g, o, out) => {
      const n = redevelop(g, o, out, () => B.Apt, '아파트 단지 재개발로');
      g.districts[o.district].land = clamp(g.districts[o.district].land + 10);
      out.push(`${dn(g, o)}에 아파트 단지가 들어서며 ${n}필지가 새로 지어졌어요.`);
    },
  },
  {
    id: 'tower', cat: '재개발', from: 2000, target: 'area', radius: 15,
    lean: { m: -2, v: 2, r: -1, b: 2 }, money: () => 50,
    okDistrict: (_g, d) => !d.protected && (d.station || d.land > 55),
    title: (g, o) => `${dn(g, o)} 역세권 고층 개발`,
    desc: () => '큰길가에 주상복합과 업무 빌딩을 올려요. 땅값과 활력이 뛰지만 원래 살던 사람은 버티기 어려워져요.',
    apply: (g, o, out) => {
      const n = redevelop(g, o, out, (i) => (onAvenue(g, i) || rand(g) < 0.4 ? (rand(g) < 0.55 ? B.Tower : B.Office) : B.Apt), '고층 개발로');
      g.districts[o.district].land = clamp(g.districts[o.district].land + 15);
      out.push(`${dn(g, o)} 하늘이 바뀌었어요. 고층 건물 ${n}동이 올라갔어요.`);
    },
  },
  {
    id: 'future', cat: '재개발', from: 2040, target: 'area', radius: 12,
    lean: { m: -2, v: 1, r: -1, b: 1 }, money: () => 25,
    okDistrict: (_g, d) => !d.protected,
    title: (g, o) => `${dn(g, o)} 미래형 주거 단지`,
    desc: () => '빈집과 낡은 집을 헐고, 사람이 줄어든 시대에 맞는 낮고 넓은 단지를 지어요.',
    apply: (g, o, out) => {
      redevelop(g, o, out, () => (rand(g) < 0.75 ? B.Future : B.Park), '미래형 단지 개발로');
      out.push(`${dn(g, o)}에 정원이 딸린 미래형 단지가 생겼어요.`);
    },
  },
  {
    id: 'road', cat: '재개발', from: 1970, to: 2010, target: 'area', radius: 16,
    lean: { m: -1, v: 1, r: -1, b: 0 }, money: () => -20,
    okDistrict: (_g, d) => !d.protected,
    title: (g, o) => `${dn(g, o)} 큰길 넓히기`,
    desc: () => '차가 다니기 좋게 큰길 양옆을 헐어 길을 넓혀요. 길가 가게들은 자리를 잃어요.',
    cells: roadCells,
    apply: (g, o, out) => {
      // Cells right next to an avenue become avenue.
      const cells = roadCells(g, o);
      for (const i of cells) {
        const p = g.places.find((q) => q.y * N + q.x === i && q.state !== 'lost');
        if (p) losePlace(g, p, '길을 넓히며', '구청', out);
        g.btype[i] = B.None; g.road[i] = RoadT.Avenue; g.floors[i] = 0;
      }
      const d = g.districts[o.district];
      d.land = clamp(d.land + 8); d.vitality = clamp(d.vitality + 4);
      out.push(`${d.name} 큰길이 넓어졌어요. 길가 ${cells.length}칸이 길이 됐어요.`);
    },
  },
  {
    id: 'station', cat: '기반', from: 1980, to: 2040, target: 'district',
    lean: { m: 0, v: 2, r: -1, b: -1 }, money: () => -40,
    okDistrict: (_g, d) => !d.station,
    title: (g, o) => `${dn(g, o)}에 지하철역 유치`,
    desc: () => '역이 생기면 사람이 몰리고 땅값이 올라요. 그만큼 민간 재개발 압력도 커져요.',
    apply: (g, o, out) => {
      const d = g.districts[o.district];
      d.station = true; d.land = clamp(d.land + 15); d.vitality = clamp(d.vitality + 8);
      out.push(`${d.name}역이 문을 열었어요. 출퇴근길이 붐벼요.`);
    },
  },
  {
    id: 'levee', cat: '기반', from: 2010, target: 'district',
    lean: { m: 0, v: 0, r: 1, b: -2 }, money: () => -50,
    okDistrict: (_g, d) => d.kind === 'river' && !d.levee,
    title: (g, o) => `${dn(g, o)} 강변 제방 쌓기`,
    desc: (g) => (g.year < 2040 ? '지금은 쓸데없어 보여도, 강물이 높아지는 시대가 오면 강가 마을을 지켜 줘요.' : '해마다 강물이 넘쳐요. 제방이 있으면 강가 마을이 큰물을 피해요.'),
    apply: (g, o, out) => { g.districts[o.district].levee = true; out.push(`${dn(g, o)} 강변에 제방이 올라갔어요.`); },
  },
  {
    id: 'park', cat: '기반', from: 2000, target: 'district',
    lean: { m: 0, v: 1, r: 1, b: -1 }, money: () => -15,
    okDistrict: (g, d) => vacantIn(g, d.id) >= 15,
    title: (g, o) => `${dn(g, o)} 빈집 터를 공원으로`,
    desc: () => '비어 있는 집터를 정리해 작은 공원과 텃밭으로 만들어요.',
    apply: (g, o, out) => {
      let n = 0;
      for (const i of districtCells(g, o.district)) if (g.btype[i] === B.Vacant && n < 60) { g.btype[i] = rand(g) < 0.6 ? B.Park : B.Field; g.floors[i] = 0; n++; }
      g.districts[o.district].vitality = clamp(g.districts[o.district].vitality + 6);
      out.push(`${dn(g, o)} 빈집 ${n}곳이 공원과 텃밭이 됐어요.`);
    },
  },
  {
    id: 'public', cat: '기반', from: 1990, target: 'area', radius: 7,
    lean: { m: -1, v: 1, r: 2, b: -1 }, money: () => -40,
    okDistrict: (_g, d) => !d.protected,
    title: (g, o) => `${dn(g, o)} 공공임대주택 짓기`,
    desc: () => '구청이 낡은 집을 사들여 임대주택을 지어요. 원래 살던 사람들이 동네에 남을 수 있어요.',
    apply: (g, o, out) => {
      const n = areaCells(g, o).length;
      for (const i of areaCells(g, o)) rebuild(g, i, rand(g) < 0.6 ? B.Villa : B.Apt, '임대주택을 지으며', '구청', out);
      const d = g.districts[o.district];
      d.original = clamp(d.original + 0.12, 0, 1); d.anchor = (d.anchor ?? 0) + 0.12;
      out.push(`${d.name}에 임대주택 ${n}동이 생겨 세입자들이 동네에 남았어요.`);
    },
  },
  {
    id: 'zone', cat: '보존', from: 1975, target: 'district',
    lean: { m: 3, v: -1, r: 1, b: -2 }, money: () => -30,
    okDistrict: (_g, d) => !d.protected,
    title: (g, o) => `${dn(g, o)} 보존지구 지정`,
    desc: () => '동네 전체에서 민간 재개발을 막아요. 골목은 남지만 집은 늙어 가고, 해마다 관리비가 들어요.',
    apply: (g, o, out) => { g.districts[o.district].protected = true; out.push(`${dn(g, o)} 전체가 보존지구가 됐어요. 부동산 업자들이 발길을 돌렸어요.`); },
  },
  {
    id: 'unzone', cat: '재개발', target: 'district',
    lean: { m: -2, v: 1, r: -1, b: 1 }, money: () => 20,
    okDistrict: (_g, d) => d.protected,
    title: (g, o) => `${dn(g, o)} 보존지구 해제`,
    desc: () => '집주인들이 오래 요구해 온 일이에요. 묶였던 땅이 풀리면 값이 뛰고 개발이 시작돼요.',
    apply: (g, o, out) => {
      const d = g.districts[o.district];
      d.protected = false; d.land = clamp(d.land + 12);
      out.push(`${d.name} 보존지구가 풀렸어요. 집주인들은 반기고, 세입자들은 걱정해요.`);
    },
  },
  {
    id: 'keep', cat: '보존', target: 'place',
    lean: { m: 2, v: 0, r: 0, b: -1 }, money: () => -10,
    okPlace: (_g, p) => !p.protected && (p.state === 'open' || p.state === 'closed'),
    title: (g, o) => `${eul(pl(g, o).name)} 보존 건물로 지정`,
    desc: () => '이 자리는 절대 헐리지 않아요. 문을 닫더라도 건물은 남고, 관리비가 조금씩 들어요.',
    apply: (g, o, out) => { pl(g, o).protected = true; pl(g, o).story.push(`${g.year}년, 구청이 보존 건물로 지정했어요.`); out.push(`${iga(pl(g, o).name)} 보존 건물이 됐어요.`); },
  },
  {
    id: 'reuse', cat: '고쳐쓰기', from: 1990, target: 'place',
    lean: { m: 2, v: 2, r: 0, b: -1 }, money: () => -20,
    okPlace: (_g, p) => p.state === 'closed' && !!REUSE[p.kind],
    title: (g, o) => `문 닫은 ${eul(pl(g, o).name)} ${ro(REUSE[pl(g, o).kind]!)} 고쳐 쓰기`,
    desc: (g, o) => `${KIND_NAME[pl(g, o).kind]} 건물은 그대로 두고 쓰임만 바꿔요. 동네에 사람이 모이는 자리가 다시 생겨요.`,
    apply: (g, o, out) => {
      const p = pl(g, o);
      p.state = 'reused'; p.reuse = REUSE[p.kind]; p.protected = true;
      p.story.push(`${g.year}년, ${ro(p.reuse!)} 다시 문을 열었어요.`);
      g.districts[p.district].vitality = clamp(g.districts[p.district].vitality + 5);
      out.push(`${eun(p.name)} ${ro(p.reuse!)} 다시 태어났어요.`);
    },
  },
  {
    id: 'support', cat: '고쳐쓰기', target: 'place',
    lean: { m: 1, v: 1, r: 1, b: -1 }, money: () => -8,
    okPlace: (_g, p) => p.state === 'open' && !['tree', 'mural', 'crossing'].includes(p.kind) && p.support < 2,
    title: (g, o) => `${pl(g, o).name} 가업 잇기 지원`,
    desc: () => '임대료와 수리비를 보태 줘요. 문을 닫을 가능성이 크게 줄어요.',
    apply: (g, o, out) => { pl(g, o).support++; pl(g, o).story.push(`${g.year}년, 구청의 가업 지원을 받았어요.`); out.push(`${eun(pl(g, o).name)} 구청 지원으로 한숨 돌렸어요.`); },
  },
  {
    id: 'repair', cat: '고쳐쓰기', from: 1980, target: 'district',
    lean: { m: 1, v: 1, r: 2, b: -2 }, money: () => -35,
    okDistrict: (g, d) => oldIn(g, d.id) > 80,
    title: (g, o) => `${dn(g, o)} 집수리 지원`,
    desc: () => '헐지 않고 고쳐서 살게 도와요. 빈집 일부에 다시 사람이 들고, 원래 주민이 머물러요.',
    apply: (g, o, out) => {
      let n = 0;
      for (const i of districtCells(g, o.district)) {
        if (OLD.has(g.btype[i])) g.built[i] = Math.max(g.built[i], g.year - 10);
        else if (g.btype[i] === B.Vacant && rand(g) < 0.6) { g.btype[i] = rand(g) < 0.5 ? B.Giwa : B.Slate; g.floors[i] = 1; g.built[i] = g.year - 20; n++; }
      }
      const d = g.districts[o.district];
      d.original = clamp(d.original + 0.1, 0, 1); d.anchor = (d.anchor ?? 0) + 0.08; d.vitality = clamp(d.vitality + 5);
      out.push(`${d.name} 집들이 새 지붕을 얹었어요. 빈집 ${n}채에 다시 불이 켜졌어요.`);
    },
  },
  {
    id: 'record', cat: '보존', from: 1985, target: 'district',
    lean: { m: 1, v: 0, r: 0, b: 0 }, money: () => -5,
    okDistrict: (g, d) => g.places.some((p) => p.district === d.id && p.state !== 'lost' && !p.recorded),
    title: (g, o) => `${dn(g, o)} 골목 기억 기록하기`,
    desc: () => '사진과 구술로 동네 가게와 사람들의 이야기를 남겨요. 사라지더라도 기록은 남아요.',
    apply: (g, o, out) => {
      for (const p of g.places) if (p.district === o.district && p.state !== 'lost') p.recorded = true;
      out.push(`${dn(g, o)} 사람들의 이야기가 책 한 권으로 묶였어요.`);
    },
  },
  {
    id: 'festival', cat: '고쳐쓰기', from: 2000, target: 'district',
    lean: { m: 0, v: 2, r: -1, b: 0 }, money: () => -10,
    okDistrict: (g, d) => g.places.filter((p) => p.district === d.id && (p.state === 'open' || p.state === 'reused')).length >= 3,
    title: (g, o) => `${dn(g, o)} 골목 축제 열기`,
    desc: () => '골목에 사람을 불러 모아요. 가게들은 살아나지만, 구경꾼이 늘면 집세도 올라요.',
    apply: (g, o, out) => {
      const d = g.districts[o.district];
      d.vitality = clamp(d.vitality + 10); d.tourism = Math.min(3, d.tourism + 1); d.land = clamp(d.land + 5);
      out.push(`${d.name} 골목 축제에 사람들이 몰렸어요.`);
    },
  },
  {
    id: 'mall', cat: '제안', from: 1990, to: 2030, target: 'area', radius: 4,
    lean: { m: -1, v: 1, r: -1, b: 2 }, money: () => 25,
    okDistrict: (_g, d) => !d.protected && (d.kind === 'market' || d.kind === 'station'),
    title: (g, o) => `${dn(g, o)}에 대형마트 유치`,
    desc: () => '큰 마트가 들어오면 세금과 일자리가 생겨요. 대신 동네 가게와 시장 손님을 빼앗아요.',
    apply: (g, o, out) => {
      redevelop(g, o, out, () => B.Office, '대형마트가 들어서며');
      for (const p of g.places) if (p.district === o.district && ['corner', 'market', 'hardware', 'mill', 'gukbap'].includes(p.kind)) p.support -= 1;
      out.push(`${dn(g, o)}에 대형마트가 문을 열었어요. 시장 상인들의 얼굴이 어두워요.`);
    },
  },
  {
    id: 'sell', cat: '제안', target: 'place',
    lean: { m: -2, v: 0, r: -1, b: 3 }, money: (g, o) => 20 + Math.round(g.districts[pl(g, o).district].land / 4),
    okPlace: (g, p) => !p.protected && p.state !== 'lost' && g.districts[p.district].land > 35 && !['tree', 'mural', 'crossing'].includes(p.kind),
    title: (g, o) => `${pl(g, o).name} 부지를 사겠다는 제안`,
    desc: () => '건설사가 좋은 값을 불렀어요. 구청 살림엔 큰 도움이 되지만, 그 자리는 새 건물이 돼요.',
    apply: (g, o, out) => {
      const p = pl(g, o), i = p.y * N + p.x;
      rebuild(g, i, newBuilding(g, g.year, onAvenue(g, i)), '부지가 팔리며', '구청', out);
    },
  },
  {
    id: 'petition', cat: '청원', target: 'place',
    lean: { m: 2, v: 0, r: 1, b: 0 }, money: () => -5,
    okPlace: (g, p) => !p.protected && (p.state === 'open' || p.state === 'closed') && g.year - p.since >= 30,
    title: (g, o) => `주민 청원: “${eul(pl(g, o).name)} 지켜 주세요”`,
    desc: (g, o) => `주민 ${120 + ((pl(g, o).id * 37) % 400)}명이 서명했어요. 받아들이면 보존 건물이 되고, 주민들의 믿음이 쌓여요.`,
    apply: (g, o, out) => {
      const p = pl(g, o);
      p.protected = true;
      p.story.push(`${g.year}년, 주민들의 청원으로 지켜졌어요.`);
      const d = g.districts[p.district];
      d.original = clamp(d.original + 0.04, 0, 1); d.anchor = (d.anchor ?? 0) + 0.03;
      out.push(`주민들의 청원으로 ${iga(p.name)} 남게 됐어요.`);
    },
  },
  {
    id: 'school', cat: '제안', from: 2010, target: 'place',
    lean: { m: -1, v: -1, r: 0, b: 2 }, money: () => 25,
    okPlace: (_g, p) => p.kind === 'school' && p.state === 'open',
    title: (g, o) => `${pl(g, o).name} 통폐합`,
    desc: () => '아이가 줄어 옆 학교와 합쳐요. 운영비가 줄지만 학교는 문을 닫아요. 건물을 고쳐 쓸 기회는 남아요.',
    apply: (g, o, out) => { const p = pl(g, o); p.state = 'closed'; p.story.push(`${g.year}년, 옆 학교와 합쳐지며 문을 닫았어요.`); out.push(`${iga(p.name)} 마지막 졸업식을 치렀어요.`); },
  },
  {
    id: 'newtown', cat: '재개발', from: 1980, to: 2010, target: 'none',
    lean: { m: 1, v: -1, r: -1, b: 2 }, money: () => 30,
    title: () => '강 건너 논밭에 신도시 개발',
    desc: () => '옛 동네는 그대로 두고 강 건너에 새 아파트를 지어요. 대신 젊은 사람들이 그쪽으로 떠나요.',
    apply: (g, _o, out) => {
      let n = 0;
      for (let i = 0; i < N * N; i++) {
        if (g.btype[i] !== B.Field || g.district[i] >= 0) continue;
        const x = i % N, y = (i / N) | 0;
        if (y < N * 0.8 || Math.hypot(x - N / 2, y - N * 0.86) > 46) continue;
        g.btype[i] = rand(g) < 0.8 ? B.Apt : B.Park; g.floors[i] = 12 + Math.floor(rand(g) * 10); g.built[i] = g.year; n++;
      }
      for (const d of g.districts) { d.land = clamp(d.land - 6); d.vitality = clamp(d.vitality - 4); }
      g.newtown = true;
      out.push(`강 건너에 아파트 ${n}동의 신도시가 생겼어요. 젊은 세대가 이삿짐을 쌌어요.`);
    },
  },
  {
    id: 'watch', cat: '쉼', target: 'none',
    lean: { m: 0, v: 0, r: 0, b: 1 }, money: () => 0,
    title: () => '이번 10년은 지켜보기',
    desc: () => '구청은 아무것도 하지 않아요. 돈은 아끼지만, 시장과 세월이 알아서 동네를 바꿔요.',
    apply: (_g, _o, out) => { out.push('구청은 이번 10년 동안 큰 결정을 하지 않았어요.'); },
  },
];

export const CARDS: Record<string, Card> = Object.fromEntries(list.map((c) => [c.id, c]));

function vacantIn(g: Game, d: number) { let n = 0; for (const i of districtCells(g, d)) if (g.btype[i] === B.Vacant) n++; return n; }
function oldIn(g: Game, d: number) { let n = 0; for (const i of districtCells(g, d)) if (OLD.has(g.btype[i]) || g.btype[i] === B.Vacant) n++; return n; }

/** Pick the most built-up old corner of a district for an area card. */
function areaCentre(g: Game, d: District, r: number): number {
  const cells = districtCells(g, d.id).filter((i) => OLD.has(g.btype[i]) || g.btype[i] === B.Vacant);
  let best = d.cy * N + d.cx, bs = -1;
  for (let k = 0; k < 14 && cells.length; k++) {
    const c = cells[Math.floor(rand(g) * cells.length)];
    const o: Offer = { card: 'apt', district: d.id, place: -1, cell: c, r };
    const s = areaCells(g, o).length + threatened(g, o).length * 30;
    if (s > bs) { bs = s; best = c; }
  }
  return best;
}

/** Three cards for the decade (plus 지켜보기, always there). */
export function drawOffer(g: Game): Offer[] {
  const year = g.year;
  const cands: { o: Offer; c: Card; w: number }[] = [];
  for (const c of list) {
    if (c.id === 'watch') continue;
    if (c.from && year < c.from) continue;
    if (c.to && year >= c.to) continue;
    if (c.id === 'newtown' && g.newtown) continue;
    if (c.target === 'none') { cands.push({ o: { card: c.id, district: -1, place: -1, cell: -1, r: 0 }, c, w: 1 }); continue; }
    if (c.target === 'place') {
      const ok = g.places.filter((p) => p.state !== 'lost' && c.okPlace!(g, p));
      if (!ok.length) continue;
      const p = ok[Math.floor(rand(g) * ok.length)];
      cands.push({ o: { card: c.id, district: p.district, place: p.id, cell: p.y * N + p.x, r: 0 }, c, w: c.id === 'reuse' ? 2 : 1 });
      continue;
    }
    const ds = g.districts.filter((d) => c.okDistrict!(g, d));
    if (!ds.length) continue;
    const d = ds[Math.floor(rand(g) * ds.length)];
    const o: Offer = { card: c.id, district: d.id, place: -1, cell: d.cy * N + d.cx, r: c.radius ?? 0 };
    if (c.target === 'area') { o.cell = areaCentre(g, d, c.radius!); if (!affected(g, o).length) continue; }
    cands.push({ o, c, w: c.id === 'levee' && year >= 2030 ? 3 : 1 });
  }
  const growth = new Set<Cat>(['재개발', '제안', '기반']);
  const pickFrom = (pool: typeof cands) => {
    const tot = pool.reduce((a, x) => a + x.w, 0);
    let r = rand(g) * tot;
    for (const x of pool) if ((r -= x.w) <= 0) return x;
    return pool[pool.length - 1];
  };
  const out: typeof cands = [];
  const take = (pool: typeof cands) => { const left = pool.filter((x) => !out.some((y) => y.c.id === x.c.id || y.c.cat === x.c.cat && pool.length > 3)); if (left.length) out.push(pickFrom(left)); };
  take(cands.filter((x) => growth.has(x.c.cat)));
  take(cands.filter((x) => !growth.has(x.c.cat)));
  while (out.length < 3) {
    const left = cands.filter((x) => !out.some((y) => y.c.id === x.c.id));
    if (!left.length) break;
    out.push(pickFrom(left));
  }
  return out.map((x) => x.o);
}

export const WATCH: Offer = { card: 'watch', district: -1, place: -1, cell: -1, r: 0 };
