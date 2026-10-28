import { Ground, KINDS, N, Road, SERVICE, ZONE_NAME, Zone } from '../sim/defs';
import { monthExpense, monthIncome } from '../sim/economy';
import { network } from '../sim/network';
import { busCount, lineCost, lineUpkeep, type LineKind } from '../sim/transit';
import { idx, type Building, type World } from '../sim/world';
import type { Overlay } from '../render/ground';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}만`;
const num = (n: number) => Math.round(n).toLocaleString('ko-KR');
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function dateText(day: number): string {
  const m = Math.floor(day / 30);
  return `${2026 + Math.floor((m + 2) / 12)}년 ${((m + 2) % 12) + 1}월 ${(day % 30) + 1}일`;
}

/* ------------------------------------------------------------ top bar */

export function updateTop(w: World) {
  $('cityName').textContent = w.name;
  $('date').textContent = dateText(w.day);
  $('pop').textContent = num(w.stats.pop);
  const m = $('money');
  m.textContent = won(w.money);
  m.classList.toggle('neg', w.money < 0);
  $('happy').textContent = w.stats.pop ? `${Math.round(w.stats.happy)}%` : '없음';
  for (const k of ['R', 'C', 'I'] as const) {
    const v = Math.max(-100, Math.min(100, w.demand[k]));
    const el = $(`d${k}`);
    // The bar grows up from the midline for demand, down for surplus.
    el.style.transform = `scaleY(${(v / 100).toFixed(3)})`;
    el.parentElement!.classList.toggle('low', v < 0);
  }
}

/* ------------------------------------------------------------- toasts */

let lastTop: World['notices'][number] | undefined;
/** Skip notices that were already there (e.g. after loading a save). */
export function resetToasts(w: World) { lastTop = w.notices[0]; }
export function pumpToasts(w: World) {
  // Notices are unshifted; show the ones newer than the last we displayed.
  const fresh: World['notices'] = [];
  for (const n of w.notices) { if (n === lastTop) break; fresh.push(n); }
  if (!fresh.length) return;
  lastTop = w.notices[0];
  for (const n of fresh.slice(0, 3).reverse()) toast(n.text, n.tone);
}

export function toast(text: string, tone: 'info' | 'warn' | 'good' = 'info') {
  const box = $('toasts');
  const el = document.createElement('div');
  el.className = `toast ${tone}`;
  el.setAttribute('role', tone === 'warn' ? 'alert' : 'status');
  el.textContent = text;
  box.prepend(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 450); }, tone === 'warn' ? 7000 : 5000);
  while (box.children.length > 4) box.lastElementChild!.remove();
}

/* -------------------------------------------------------------- goals */

interface Goal { text: string; done: (w: World) => boolean }
const count = (w: World, f: (b: Building) => boolean) => { let n = 0; w.buildings.forEach((b) => { if (f(b)) n++; }); return n; };
const roads = (w: World) => { let n = 0; for (let i = 0; i < N * N; i++) if (w.road[i]) n++; return n; };
const zoned = (w: World, z: number) => { for (let i = 0; i < N * N; i++) if (w.zone[i] === z) return true; return false; };

export const GOALS: Goal[] = [
  { text: '서쪽 고속도로 끝에서 이어지는 도로를 깔아 보세요. 도구는 아래 도로에 있어요.', done: (w) => roads(w) > 40 },
  { text: '도로 옆에 주거 구역을 칠하세요. 도로에서 3칸까지 칠할 수 있어요.', done: (w) => zoned(w, Zone.R) },
  { text: '발전소를 짓고 도로로 연결하세요. 전기는 도로를 따라 흘러요.', done: (w) => w.stats.powerSupply > 0 },
  { text: '강가에 정수장을 지어 수돗물을 공급하세요.', done: (w) => w.stats.waterSupply > 0 },
  { text: '상업과 산업 구역을 만들어 일자리를 주세요.', done: (w) => zoned(w, Zone.C) && zoned(w, Zone.I) },
  { text: '인구 300명을 모아 보세요. 위쪽 수요 막대를 참고하세요.', done: (w) => w.stats.pop >= 300 },
  { text: '하수처리장을 지어 하수를 처리하세요. 주거지와 떨어뜨리면 좋아요.', done: (w) => w.stats.sewageCap > 0 },
  { text: '초등학교를 지어 아이들을 가르치세요. 주변 땅값이 올라요.', done: (w) => count(w, (b) => b.kind === 'school') > 0 },
  { text: '경찰서, 소방서, 보건소를 하나씩 지으세요.', done: (w) => ['police', 'fire', 'clinic'].every((k) => count(w, (b) => b.kind === k) > 0) },
  { text: '인구 1,500명을 달성하세요. 공원도 땅값을 올려 줘요.', done: (w) => w.stats.pop >= 1500 },
  { text: '버스 노선을 만들어 차 없이 출근하게 해 주세요.', done: (w) => w.lines.some((l) => l.kind === 'bus') },
  { text: '첫 아파트 단지를 세우세요. 땅값 높은 다세대 4채가 모이면 재건축돼요.', done: (w) => count(w, (b) => b.kind === 'r3') > 0 },
  { text: '인구 5,000명. 대로와 버스로 교통 체증을 줄이세요.', done: (w) => w.stats.pop >= 5000 },
  { text: '지하철 1호선을 개통하세요. 역 주변은 역세권이 돼요.', done: (w) => w.lines.some((l) => l.kind === 'metro') },
  { text: '첫 오피스 타워를 올리세요. 상업 구역의 땅값이 관건이에요.', done: (w) => count(w, (b) => b.kind === 'c3') > 0 },
  { text: '인구 20,000명. 진짜 도시가 됐어요!', done: (w) => w.stats.pop >= 20000 },
];

export function updateGoal(w: World): number {
  let k = 0;
  while (k < GOALS.length && GOALS[k].done(w)) k++;
  $('goalStep').textContent = `${Math.min(k + 1, GOALS.length)}/${GOALS.length}`;
  $('goalText').textContent = k < GOALS.length ? GOALS[k].text : '모든 목표를 이뤘어요. 이제 마음껏 도시를 키워 보세요.';
  $('goalBar').style.transform = `scaleX(${(k / GOALS.length).toFixed(3)})`;
  $('goal').classList.toggle('done', k >= GOALS.length);
  return k;
}

/* ---------------------------------------------------------- info sheet */

type Tone = 'ok' | 'no' | 'meh';
const state = (tone: Tone, text: string) => `<b class="${tone}">${text}</b>`;
const mark = (ok: boolean, yes = '있음', no = '없음') => state(ok ? 'ok' : 'no', ok ? yes : no);
const kv = (k: string, v: string) => `<div class="kv"><span class="k">${k}</span>${v.startsWith('<') ? v : `<b>${v}</b>`}</div>`;
const toneOf = (v: number): Tone => (v >= 65 ? 'ok' : v >= 45 ? 'meh' : 'no');
const meter = (v: number) => `<div class="meter ${toneOf(v)}"><i style="transform:scaleX(${(Math.max(0, Math.min(100, v)) / 100).toFixed(3)})"></i></div>`;
const head = (title: string) => `<header class="sheet-head"><h3>${title}</h3><button class="x" data-close aria-label="닫기">닫기</button></header>`;
const tags = (...t: string[]) => `<div class="tags">${t.filter(Boolean).map((x) => `<span>${x}</span>`).join('')}</div>`;

export function infoHtml(w: World, x: number, y: number): string {
  const i = idx(x, y);
  const id = w.bld[i];
  if (id >= 0) {
    const b = w.buildings.get(id)!;
    const d = KINDS[b.kind];
    const net = network(w);
    const hasRoad = net.access.has(b.id);
    let h = head(d.name);
    if (d.zone) {
      const cap = d.residents ?? d.jobs ?? 0;
      h += tags(ZONE_NAME[d.zone], `${d.level}단계`, `${b.floors}층`, b.abandoned ? '폐가' : '');
      h += kv(d.residents ? '주민' : '일자리', `${num(b.occ)} / ${num(cap)}명`);
      h += `<div class="kv"><span class="k">${d.zone === Zone.R ? '만족도' : '경영 상태'}</span>${state(toneOf(b.happy), `${Math.round(b.happy)}%`)}</div>${meter(b.happy)}`;
      h += kv('전기', mark(b.powered, '들어옴', '끊김'));
      h += kv('수도', mark(b.watered, '들어옴', '끊김'));
      h += kv('하수', mark(b.sewered, '처리됨', '처리 안 됨'));
      h += kv('땅값', `${Math.round(w.land[i])}`);
      if (w.pollution[i] > 3) h += kv('오염', state('no', `${Math.round(w.pollution[i])}`));
      if (d.zone === Zone.R) {
        h += '<h4>공공 서비스</h4>';
        h += kv('교육', mark(!!w.edu[i])) + kv('치안', mark(!!w.safety[i])) + kv('의료', mark(!!w.health[i])) + kv('소방', mark(!!w.fire[i]));
        h += kv('대중교통', w.transit[i] === 2 ? state('ok', '역세권') : w.transit[i] ? state('ok', '버스') : state('meh', '없음'));
      }
      if (!hasRoad) h += kv('도로', state('no', '연결 안 됨'));
      if (d.level && d.level < 3) h += `<p class="hint">${nextHint(w, b)}</p>`;
    } else if (b.kind === 'metro') {
      const lines = w.lines.filter((l) => l.stops.includes(i));
      h += `<p class="hint">${d.desc}</p>`;
      for (const l of lines) h += kv(`<span class="sw" style="--sw:${l.color}"></span>${esc(l.name)}`, `지난달 ${num(l.riders)}명`);
    } else {
      h += `<p class="hint">${d.desc ?? ''}</p>`;
      h += kv('도로 연결', mark(hasRoad, '연결됨', '도로를 붙여 주세요'));
      if (d.power > 0) h += kv('전기', mark(b.powered, '들어옴', '끊김'));
      h += kv('유지비', `월 ${won(d.upkeep ?? 0)}`);
      const s = SERVICE[b.kind];
      if (s) h += kv('범위', `${s.radius * 10}m`);
      h += `<button class="btn danger" data-demolish="${b.id}">철거하기</button>`;
    }
    return h;
  }
  if (w.road[i]) {
    const t = w.road[i] === Road.Avenue ? '4차선 대로' : '일반 도로';
    const load = Math.round(Math.min(150, w.traffic[i] * 100));
    const stops = w.lines.filter((l) => l.kind === 'bus' && l.stops.includes(i));
    let h = `${head(t)}${kv('교통량', state(toneOf(100 - load), `${load}%`))}${meter(100 - load)}${kv('다리', w.ground[i] === Ground.Water ? '예' : '아니오')}`;
    for (const l of stops) h += kv(`<span class="sw" style="--sw:${l.color}"></span>${esc(l.name)} 정류장`, `지난달 ${num(l.riders)}명`);
    return h;
  }
  if (w.ground[i] === Ground.Water) return `${head('강')}<p class="hint">도로를 놓으면 다리가 돼요. 비용은 4배예요.</p>`;
  return `${head('빈 땅')}${w.zone[i] ? kv('구역', ZONE_NAME[w.zone[i]]) : ''}${kv('땅값', `${Math.round(w.land[i])}`)}${kv('오염', `${Math.round(w.pollution[i])}`)}`;
}

function nextHint(w: World, b: Building): string {
  const d = KINDS[b.kind];
  if (!b.powered || !b.watered) return '전기와 수도가 들어와야 성장해요.';
  if (b.happy < 52) return '만족도를 올리면 더 높은 건물로 바뀌어요.';
  const need = (d.zone === Zone.R ? [30, 46] : d.zone === Zone.C ? [26, 40] : [0, 15])[(d.level ?? 1) - 1];
  const land = w.land[idx(b.x, b.y)];
  if (land < need) return `땅값이 ${need} 이상이면 성장해요. 지금은 ${Math.round(land)}이에요. 공원, 학교, 지하철역, 강 조망이 땅값을 올려요.`;
  if (d.level === 2) return '같은 구역의 2단계 건물 넷이 2×2로 모이면 재건축돼요.';
  return '수요가 있으면 곧 성장해요.';
}

/* -------------------------------------------------------------- panels */

export function budgetHtml(w: World): string {
  const last = w.reports[w.reports.length - 1] ?? w.month;
  const inc = monthIncome(last), exp = monthExpense(last);
  let h = head('예산');
  h += `<p class="hint">${w.reports.length ? '지난달' : '이번 달(진행 중)'} 기준, 단위는 만 원이에요.</p>`;
  h += '<h4>수입</h4>' + kv('주거세', won(last.income.R)) + kv('상업세', won(last.income.C)) + kv('산업세', won(last.income.I)) + kv('대중교통 요금', won(last.income.T ?? 0));
  h += '<h4>지출</h4>' + kv('도로 유지', won(last.expense.roads)) + kv('전기, 상하수도 시설', won(last.expense.facilities)) + kv('공공 서비스', won(last.expense.services)) + kv('대중교통 운영', won(last.expense.transit ?? 0));
  const net = inc - exp;
  h += `<div class="kv total"><span class="k">월 수지</span>${state(net >= 0 ? 'ok' : 'no', `${net >= 0 ? '+' : '−'}${won(Math.abs(net))}`)}</div>`;
  h += '<h4>세율</h4><p class="hint">높일수록 수입은 늘고 수요는 줄어요.</p>';
  for (const [k, n] of [['R', '주거'], ['C', '상업'], ['I', '산업']] as const)
    h += `<div class="tax"><label for="tax${k}">${n}</label><input id="tax${k}" type="range" min="0" max="20" step="1" value="${w.tax[k]}" data-tax="${k}" /><b>${w.tax[k]}%</b></div>`;
  const hist = w.reports.slice(-24);
  if (hist.length > 1) {
    const max = Math.max(1, ...hist.map((r) => Math.abs(monthIncome(r) - monthExpense(r))));
    h += `<h4>월 수지, 최근 ${hist.length}개월</h4><div class="hist" role="img" aria-label="월별 수지 막대">`;
    for (const r of hist) {
      const v = monthIncome(r) - monthExpense(r);
      h += `<i class="${v >= 0 ? 'up' : 'down'}" style="transform:scaleY(${(v / max).toFixed(3)})"></i>`;
    }
    h += '</div>';
  }
  return h;
}

const OVERLAYS: [Overlay, string][] = [
  ['none', '기본'], ['traffic', '교통'], ['transit', '대중교통'], ['land', '땅값'], ['pollution', '오염'], ['power', '전기'], ['water', '수도'],
  ['edu', '교육'], ['safety', '치안'], ['health', '의료'], ['fire', '소방'],
];

export function statsHtml(w: World, overlay: Overlay): string {
  const s = w.stats;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '없음');
  const use = (u: number, c: number) => state(!c ? 'no' : u > c * 0.9 ? 'meh' : 'ok', `${num(u)} / ${num(c)}`);
  let h = head('도시 현황');
  h += '<h4>지도 보기</h4><div class="chips" role="group" aria-label="지도 보기">' + OVERLAYS.map(([k, n]) => `<button data-ov="${k}" aria-pressed="${k === overlay}">${n}</button>`).join('') + '</div>';
  h += '<h4>사람과 일자리</h4>';
  h += kv('인구', `${num(s.pop)}명`) + kv('일자리', `${num(s.jobs)}개`) + kv('취업률', pct(s.employed, s.workers)) + kv('평균 만족도', s.pop ? `${Math.round(s.happy)}%` : '없음');
  h += '<h4>기반 시설, 사용 / 공급</h4>';
  h += kv('전력', use(s.powerUse, s.powerSupply)) + kv('수도', use(s.waterUse, s.waterSupply)) + kv('하수 처리', use(s.sewageUse, s.sewageCap));
  h += '<h4>교통</h4>';
  h += kv('평균 통근', `${Math.round(s.commute)}분`) + kv('도로 혼잡도', state(toneOf(100 - s.congestion * 100), `${Math.round(s.congestion * 100)}%`));
  h += kv('대중교통 승객', `지난달 ${num(w.lines.reduce((a, l) => a + l.riders, 0))}명`);
  return h;
}

/** Every line, with its riders, cost and a way to close it. */
export function linesHtml(w: World, confirm: number | null): string {
  let h = head('노선 관리');
  if (!w.lines.length) return `${h}<p class="hint">아직 노선이 없어요. 아래 대중교통에서 버스 노선이나 지하철 노선을 고르고, 지도에서 정류장을 차례로 찍은 뒤 완성을 누르세요.</p>`;
  h += '<table class="lines"><thead><tr><th scope="col">노선</th><th scope="col" class="num">정류장</th><th scope="col" class="num">지난달 승객</th><th scope="col" class="num">월 운영비</th><th scope="col"><span class="visually-hidden">폐선</span></th></tr></thead><tbody>';
  for (const l of w.lines) {
    const extra = l.kind === 'bus' ? `버스 ${busCount(w, l)}대` : '지하';
    h += `<tr><th scope="row"><span class="sw" style="--sw:${l.color}"></span>${esc(l.name)}<small>${extra}</small></th><td class="num">${l.stops.length}</td><td class="num">${num(l.riders)}</td><td class="num">${won(lineUpkeep(w, l))}</td><td>`;
    h += confirm === l.id
      ? `<button class="btn danger small" data-remove-line="${l.id}" data-confirmed>폐선 확인</button>`
      : `<button class="btn small" data-remove-line="${l.id}">폐선</button>`;
    h += '</td></tr>';
  }
  return `${h}</tbody></table><p class="hint">요금은 1인 1,400원이에요. 역과 정류장 주변은 땅값과 만족도가 올라요.</p>`;
}

/** The bar shown while a line is being drawn. */
export function draftHtml(w: World, kind: LineKind, stops: number[]): string {
  const cost = stops.length >= 2 ? lineCost(kind, stops) : 0;
  const what = kind === 'bus' ? '버스 정류장을 도로 위에' : '지하철역을 빈 땅이나 구역에';
  const msg = stops.length ? `정류장 ${stops.length}곳${cost ? `, ${won(cost)} 원` : ''}` : `${what} 차례로 찍으세요.`;
  return `<span class="draft-msg">${msg}</span><button class="btn small" data-draft="undo"${stops.length ? '' : ' disabled'}>되돌리기</button><button class="btn small" data-draft="cancel">취소</button><button class="btn primary small" data-draft="done"${stops.length >= 2 && cost <= w.money ? '' : ' disabled'}>노선 완성</button>`;
}

export function menuHtml(w: World, quality: 'high' | 'normal'): string {
  let h = head('메뉴');
  h += `<p class="hint">${esc(w.name)}, ${dateText(w.day)}</p><div class="menu">`;
  h += '<button class="btn" data-act="save">저장하기</button><button class="btn" data-act="load">마지막 저장 불러오기</button><button class="btn" data-act="new">새 도시</button><button class="btn" data-act="help">조작법</button>';
  h += `<button class="btn" data-act="quality" aria-pressed="${quality === 'high'}">그래픽 품질: ${quality === 'high' ? '높음' : '보통'}</button></div>`;
  h += '<h4>최근 소식</h4><ol class="log">' + w.notices.slice(0, 20).map((n) => `<li><span>${dateText(n.day)}</span>${esc(n.text)}</li>`).join('') + '</ol>';
  return h;
}

export const HELP = `${head('조작법')}
<h4>카메라</h4>
${kv('이동', 'WASD, 방향키, 가운데 버튼 드래그')}${kv('회전', '우클릭 드래그, Q와 E')}${kv('확대', '마우스 휠, R과 F')}${kv('모바일', '두 손가락으로 이동, 확대, 회전')}
<h4>건설</h4>
${kv('도로', '드래그해서 직선이나 ㄱ자')}${kv('구역', '드래그해서 사각형으로 칠하기')}${kv('시설', '탭하거나 클릭해서 배치')}${kv('노선', '정류장을 차례로 찍고 완성')}${kv('취소', 'Esc 또는 우클릭')}
<h4>단축키</h4>
${kv('도구', 'Z 도로, X 구역, C 전기, V 상하수도, B 공공, N 대중교통, M 공원')}${kv('속도', 'Space 멈춤, 1, 2, 3')}
<p class="hint">전기와 수도는 도로 밑으로 흘러요. 발전소와 정수장이 도로망에 붙어 있어야 해요. 화력 발전소, 하수처리장, 공장은 오염을 내니 주거지와 떨어뜨리세요.</p>`;
