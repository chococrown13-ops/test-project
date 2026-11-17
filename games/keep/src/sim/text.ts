import { type Game, pick, type Place, type PlaceKind, rand } from './world';

/** Every name and story here is invented; any likeness to a real shop or person is chance. */

const SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '홍'];
const GIVEN = ['순자', '영수', '말순', '복남', '정희', '춘식', '옥분', '만수', '경자', '덕배', '금순', '병철', '분이', '창호', '명자', '석구'];
const SHOP = ['대성', '한일', '제일', '평화', '동명', '신흥', '영광', '삼화', '금성', '태양', '은하', '명랑', '행복', '부흥', '협동', '희망'];

export const founderName = (g: Game) => pick(g, SURNAMES) + pick(g, GIVEN);

export const KIND_NAME: Record<PlaceKind, string> = {
  gukbap: '국밥집', bath: '목욕탕', barber: '이발관', tearoom: '다방', cinema: '극장', hardware: '철물점', mill: '방앗간',
  snack: '분식집', corner: '구멍가게', briquette: '연탄가게', photo: '사진관', books: '서점', chinese: '중국집', tree: '느티나무',
  church: '예배당', school: '초등학교', mural: '벽화 골목', crossing: '건널목', market: '시장 입구',
};

export function placeName(g: Game, kind: PlaceKind, dong: string): string {
  const s = pick(g, SHOP), stem = dong.replace(/동$/, '');
  switch (kind) {
    case 'gukbap': return `${pick(g, SURNAMES)}할매국밥`;
    case 'bath': return `${s}탕`;
    case 'barber': return `${s}이발관`;
    case 'tearoom': return `${s}다방`;
    case 'cinema': return `${s}극장`;
    case 'hardware': return `${s}철물`;
    case 'mill': return `${s}방앗간`;
    case 'snack': return `${pick(g, ['엄마', '할머니', '골목', '학교앞'])}분식`;
    case 'corner': return `${s}상회`;
    case 'briquette': return `${s}연탄`;
    case 'photo': return `${s}사진관`;
    case 'books': return `${s}서점`;
    case 'chinese': return `${s}반점`;
    case 'tree': return `${stem} 느티나무`;
    case 'church': return `${stem} 예배당`;
    case 'school': return `${stem}초등학교`;
    case 'mural': return `${stem} 벽화골목`;
    case 'crossing': return `${stem} 건널목`;
    case 'market': return `${s}시장 입구`;
  }
}

const STORIES: Record<PlaceKind, string[]> = {
  gukbap: ['{y}년 {f} 할머니가 가마솥 하나로 시작했어요.', '새벽 장꾼들이 첫 끼를 먹던 곳이에요.', '이 집 국밥 먹고 시험 보면 붙는다는 말이 돌았어요.'],
  bath: ['{y}년에 문을 연 동네 유일의 대중목욕탕이에요.', '설 전날이면 줄이 골목 끝까지 섰어요.', '굴뚝 연기로 아침이 온 걸 알았다는 사람들이 있어요.'],
  barber: ['{f} 씨가 {y}년부터 같은 의자로 머리를 깎았어요.', '아버지와 아들이 같은 날 머리를 깎던 곳이에요.', '라디오 야구 중계가 늘 켜져 있었어요.'],
  tearoom: ['{y}년 문을 연, 동네 어른들의 사랑방이에요.', '맞선이 가장 많이 이뤄진 자리라는 소문이 있어요.', '쌍화차에 노른자를 띄워 주던 집이에요.'],
  cinema: ['{y}년에 문을 연 동네 단관 극장이에요.', '손으로 그린 간판이 한 달에 두 번 바뀌었어요.', '첫 데이트를 이 극장에서 했다는 부부가 많아요.'],
  hardware: ['못 하나도 낱개로 팔던 {f} 사장님네예요.', '동네 집 열에 아홉은 이 가게 연장으로 고쳤어요.', '모르는 게 없는 사장님 덕에 상담소라고 불렸어요.'],
  mill: ['명절마다 떡 찌는 김이 골목을 덮었어요.', '{y}년부터 고추와 참깨를 빻아 왔어요.', '방앗간 앞 평상이 동네 소식통이었어요.'],
  snack: ['하굣길 떡볶이 한 접시가 50원이던 시절부터 있었어요.', '{f} 사장님은 아이들 이름을 다 외웠어요.', '외상 장부에 졸업생 이름이 아직 남아 있대요.'],
  corner: ['{y}년부터 골목 어귀를 지킨 가게예요.', '아이스케키와 연탄불 라면을 함께 팔았어요.', '가게 앞 평상에서 동네 아이들이 숙제를 했어요.'],
  briquette: ['겨울이면 새벽부터 연탄 수레가 오갔어요.', '{f} 씨는 언덕 꼭대기 집까지 연탄을 지고 올랐어요.', '연탄재로 눈길을 덮어 주던 곳이에요.'],
  photo: ['동네 아이들 돌 사진은 다 여기서 찍었어요.', '{y}년부터 졸업 사진을 찍어 온 사진관이에요.', '진열장 사진 속 아기가 자라 다시 가족사진을 찍으러 왔어요.'],
  books: ['참고서 냄새가 나던 작은 서점이에요.', '{f} 사장님이 학생들에게 책을 빌려주기도 했어요.', '만화책 신간이 들어오는 날은 줄을 섰어요.'],
  chinese: ['졸업식 날 짜장면을 먹던 집이에요.', '{y}년부터 같은 자리에서 수타면을 뽑았어요.', '철가방 배달이 동네 끝까지 갔어요.'],
  tree: ['수백 년 된 느티나무예요. 마을 사람들이 정월마다 제를 지냈어요.', '여름이면 나무 그늘 평상에 어른들이 모였어요.', '나무 아래에서 고백했다는 이야기가 전해져요.'],
  church: ['{y}년에 세워진 작은 예배당이에요.', '종소리가 골목을 깨우던 곳이에요.', '어려운 시절 쌀을 나누던 곳이에요.'],
  school: ['{y}년에 개교한 동네 초등학교예요.', '운동회 날이면 동네 전체가 운동장에 모였어요.', '졸업생 이름이 새겨진 나무 의자가 남아 있어요.'],
  mural: ['아이들이 분필로 그린 그림이 벽화가 됐어요.', '골목 계단마다 이웃집 문패가 이어져 있어요.', '저녁이면 집집마다 밥 짓는 냄새가 났어요.'],
  crossing: ['기차가 하루 네 번 지나던 건널목이에요.', '차단기 옆 초소의 아저씨가 아이들을 건네줬어요.', '건널목 종소리가 동네의 시계였어요.'],
  market: ['오일장이 서던 자리에 상설 시장이 생겼어요.', '좌판 할머니들이 덤을 얹어 주던 시장 입구예요.', '{y}년부터 이어진 시장 골목의 시작점이에요.'],
};

export function placeStory(g: Game, p: Place): string[] {
  const lines = [...STORIES[p.kind]];
  const out: string[] = [];
  for (let k = 0; k < 2 && lines.length; k++) out.push(lines.splice(Math.floor(rand(g) * lines.length), 1)[0].replace('{y}', String(p.since)).replace('{f}', p.founder));
  return out;
}

/** The country's decade, as the papers would put it: background, not the player's doing. */
export const ERA: Record<number, string[]> = {
  1970: ['새마을운동 바람이 골목까지 불었어요.', '흑백 텔레비전 앞에 동네 사람들이 모여 앉았어요.'],
  1980: ['컬러 텔레비전이 집집마다 들어왔어요.', '올림픽을 앞두고 도시 곳곳이 공사 중이에요.'],
  1990: ['아파트 분양 소식에 동네가 술렁였어요.', '외환 위기로 문 닫는 가게가 늘었어요.'],
  2000: ['월드컵 거리 응원으로 골목이 붉게 물들었어요.', '휴대폰과 인터넷이 동네 풍경을 바꿨어요.'],
  2010: ['오래된 골목이 카페 거리로 소개되기 시작했어요.', '아이 울음소리가 줄었다는 이야기가 나와요.'],
  2020: ['한동안 거리가 텅 비었다가 천천히 돌아왔어요.', '혼자 사는 집이 가장 흔한 집이 됐어요.'],
  2030: ['동네 사람 셋 중 하나가 65세를 넘었어요.', '빈집 정비가 구청의 큰 숙제가 됐어요.'],
  2040: ['여름마다 강물이 높아졌다는 기사가 나와요.', '사람 대신 로봇이 배달하는 골목이 생겼어요.'],
  2050: ['도시가 작아지고 있다는 말이 실감 나요.', '옛 골목을 다시 찾는 사람들이 늘었어요.'],
  2060: ['동네의 100년을 기록하는 사업이 시작됐어요.', '남은 것과 사라진 것을 두고 이야기가 많아요.'],
};

export const eraLine = (g: Game, decade: number) => pick(g, ERA[decade] ?? ERA[2060]);

/** Josa helpers: pick the particle by whether the last syllable has a final consonant. */
export const jong = (s: string) => { const c = s.charCodeAt(s.length - 1); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0; };
export const eul = (s: string) => s + (jong(s) ? '을' : '를');
export const iga = (s: string) => s + (jong(s) ? '이' : '가');
export const eun = (s: string) => s + (jong(s) ? '은' : '는');
export const ro = (s: string) => { const c = s.charCodeAt(s.length - 1); const j = (c - 0xac00) % 28; return s + (jong(s) && j !== 8 ? '으로' : '로'); };
