import { Ground, KINDS, N, Road, SERVICE, ZONE_NAME, Zone } from '../sim/defs';
import { monthExpense, monthIncome } from '../sim/economy';
import { network } from '../sim/network';
import { idx, type Building, type World } from '../sim/world';
import type { Overlay } from '../render/ground';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}만`;
const num = (n: number) => Math.round(n).toLocaleString('ko-KR');

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
  $('happy').textContent = w.stats.pop ? `${Math.round(w.stats.happy)}%` : '-';
  for (const k of ['R', 'C', 'I'] as const) {
    const v = Math.max(-100, Math.min(100, w.demand[k]));
    const el = $(`d${k}`);
    el.style.height = `${Math.abs(v) / 2}%`;
    el.style.bottom = v >= 0 ? '50%' : `${50 - Math.abs(v) / 2}%`;
    el.style.opacity = v >= 0 ? '1' : '0.4';
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
  el.textContent = text;
  box.prepend(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 450); }, tone === 'warn' ? 7000 : 5000);
  while (box.children.length > 4) box.lastElementChild!.remove();
}

/* -------------------------------------------------------------- goals */

interface Goal { text: string; done: (w: World) => boolean }
const count = (w: World, f: (b: Building) => boolean) => { let n = 0; w.buildings.forEach((b) => { if (f(b)) n++; }); return n; };
const roads = (w: World) => { let n = 0; for (let i = 0; i < N * N; i++) if (w.road[i]) n++; return n; };
const zoned = (w: World, z: number) => { for (let i = 0; i < N * N; i++) if (w.zone[i] === z) return true; return false; };

export const GOALS: Goal[] = [
  { text: '서쪽 고속도로 끝에서 이어지는 도로를 깔아 보세요. (🛣️ 도로)', done: (w) => roads(w) > 40 },
  { text: '도로 옆에 주거 구역을 칠하세요. 도로에서 3칸까지 가능해요. (🏘️ 구역)', done: (w) => zoned(w, Zone.R) },
  { text: '발전소를 짓고 도로로 연결하세요. 전기는 도로를 따라 흘러요. (⚡ 전기)', done: (w) => w.stats.powerSupply > 0 },
  { text: '강가에 정수장을 지어 수돗물을 공급하세요. (💧 상하수도)', done: (w) => w.stats.waterSupply > 0 },
  { text: '상업·산업 구역을 만들어 일자리를 주세요.', done: (w) => zoned(w, Zone.C) && zoned(w, Zone.I) },
  { text: '인구 300명을 모아 보세요. 수요 막대(주·상·산)를 참고하세요.', done: (w) => w.stats.pop >= 300 },
  { text: '하수처리장을 지어 하수를 처리하세요. 주거지와 떨어뜨리면 좋아요.', done: (w) => w.stats.sewageCap > 0 },
  { text: '초등학교를 지어 아이들을 가르치세요. 땅값이 올라요. (🏫 공공)', done: (w) => count(w, (b) => b.kind === 'school') > 0 },
  { text: '경찰서·소방서·보건소를 하나씩 지으세요.', done: (w) => ['police', 'fire', 'clinic'].every((k) => count(w, (b) => b.kind === k) > 0) },
  { text: '인구 1,500명 달성! 공원도 땅값을 올려 줘요.', done: (w) => w.stats.pop >= 1500 },
  { text: '첫 아파트 단지를 세우세요. 땅값 높은 다세대 4채가 모이면 재건축돼요.', done: (w) => count(w, (b) => b.kind === 'r3') > 0 },
  { text: '인구 5,000명! 대로로 교통 체증을 줄이세요.', done: (w) => w.stats.pop >= 5000 },
  { text: '첫 오피스 타워를 올리세요. 상업 구역의 땅값이 관건이에요.', done: (w) => count(w, (b) => b.kind === 'c3') > 0 },
  { text: '인구 20,000명 — 진짜 도시가 됐어요!', done: (w) => w.stats.pop >= 20000 },
];

export function updateGoal(w: World): number {
  let k = 0;
  while (k < GOALS.length && GOALS[k].done(w)) k++;
  const g = $('goal');
  $('goalStep').textContent = `${Math.min(k + 1, GOALS.length)} / ${GOALS.length}`;
  $('goalText').textContent = k < GOALS.length ? GOALS[k].text : '모든 목표를 이뤘어요! 이제 자유롭게 도시를 키워 보세요.';
  $('goalBar').style.width = `${(k / GOALS.length) * 100}%`;
  g.classList.toggle('done', k >= GOALS.length);
  return k;
}

/* ---------------------------------------------------------- info sheet */

const mark = (ok: boolean, yes = '있음', no = '없음') => `<b class="${ok ? 'ok' : 'no'}">${ok ? yes : no}</b>`;
const kv = (k: string, v: string) => `<div class="kv"><span class="k">${k}</span>${v.startsWith('<') ? v : `<b>${v}</b>`}</div>`;
const meter = (v: number, color: string) => `<div class="meter"><i style="width:${Math.max(0, Math.min(100, v))}%;background:${color}"></i></div>`;
const tone = (v: number) => (v >= 65 ? 'var(--good)' : v >= 45 ? 'var(--warn)' : 'var(--bad)');

export function infoHtml(w: World, x: number, y: number): string {
  const i = idx(x, y);
  const id = w.bld[i];
  const close = '<button class="x" data-close aria-label="닫기">✕</button>';
  if (id >= 0) {
    const b = w.buildings.get(id)!;
    const d = KINDS[b.kind];
    const net = network(w);
    const hasRoad = net.access.has(b.id);
    let h = `<h3>${d.name}${close}</h3>`;
    if (d.zone) {
      const cap = d.residents ?? d.jobs ?? 0;
      h += `<div class="sub">${ZONE_NAME[d.zone]} · ${d.level}단계 · ${b.floors}층${b.abandoned ? ' · <span class="no">폐가</span>' : ''}</div>`;
      h += kv(d.residents ? '주민' : '일자리', `${num(b.occ)} / ${num(cap)}명`);
      h += `<div class="kv"><span class="k">${d.zone === Zone.R ? '만족도' : '경영 상태'}</span><b style="color:${tone(b.happy)}">${Math.round(b.happy)}%</b></div>${meter(b.happy, tone(b.happy))}`;
      h += kv('전기', mark(b.powered, '공급 중', '끊김'));
      h += kv('수도', mark(b.watered, '공급 중', '끊김'));
      h += kv('하수', mark(b.sewered, '처리 중', '처리 안 됨'));
      h += kv('땅값', `${Math.round(w.land[i])}`);
      if (w.pollution[i] > 3) h += kv('오염', `<b class="no">${Math.round(w.pollution[i])}</b>`);
      if (d.zone === Zone.R) {
        h += '<div class="sec">공공 서비스</div>';
        h += kv('교육', mark(!!w.edu[i])) + kv('치안', mark(!!w.safety[i])) + kv('의료', mark(!!w.health[i])) + kv('소방', mark(!!w.fire[i]));
      }
      if (!hasRoad) h += kv('도로', '<b class="no">연결 안 됨</b>');
      if (d.level && d.level < 3) h += `<div class="sub" style="margin-top:10px">${nextHint(w, b)}</div>`;
    } else {
      h += `<div class="sub">${d.desc ?? ''}</div>`;
      h += kv('도로 연결', mark(hasRoad, '연결됨', '연결 안 됨 — 도로를 붙여 주세요'));
      if (d.power > 0) h += kv('전기', mark(b.powered, '공급 중', '끊김'));
      h += kv('유지비', `${won(d.upkeep ?? 0)}/월`);
      const s = SERVICE[b.kind];
      if (s) h += kv('범위', `${s.radius * 10}m`);
      h += `<button class="danger" data-demolish="${b.id}">철거하기</button>`;
    }
    return h;
  }
  if (w.road[i]) {
    const t = w.road[i] === Road.Avenue ? '4차선 대로' : '일반 도로';
    const load = Math.round(Math.min(150, w.traffic[i] * 100));
    return `<h3>${t}${close}</h3>${kv('교통량', `<b style="color:${tone(100 - load)}">${load}%</b>`)}${meter(load, tone(100 - load))}${kv('물 위', w.ground[i] === Ground.Water ? '다리' : '아니오')}`;
  }
  if (w.ground[i] === Ground.Water) return `<h3>강${close}</h3><div class="sub">다리를 놓을 수 있어요 (도로 비용 4배).</div>`;
  return `<h3>빈 땅${close}</h3>${w.zone[i] ? kv('구역', ZONE_NAME[w.zone[i]]) : ''}${kv('땅값', `${Math.round(w.land[i])}`)}${kv('오염', `${Math.round(w.pollution[i])}`)}`;
}

function nextHint(w: World, b: Building): string {
  const d = KINDS[b.kind];
  if (!b.powered || !b.watered) return '전기와 수도가 들어와야 성장해요.';
  if (b.happy < 52) return '만족도를 올리면 더 높은 건물로 바뀌어요.';
  const need = (d.zone === Zone.R ? [30, 46] : d.zone === Zone.C ? [26, 40] : [0, 15])[(d.level ?? 1) - 1];
  const land = w.land[idx(b.x, b.y)];
  if (land < need) return `땅값이 ${need} 이상이면 성장해요. (지금 ${Math.round(land)}) 공원·학교·강 조망이 땅값을 올려요.`;
  if (d.level === 2) return '같은 구역의 2단계 건물 넷이 2×2로 모이면 재건축돼요.';
  return '수요가 있으면 곧 성장해요.';
}

/* -------------------------------------------------------------- panels */

export function budgetHtml(w: World): string {
  const last = w.reports[w.reports.length - 1] ?? w.month;
  const inc = monthIncome(last), exp = monthExpense(last);
  let h = `<h3>💰 예산${'<button class="x" data-close aria-label="닫기">✕</button>'}</h3><div class="sub">${w.reports.length ? '지난달' : '이번 달(진행 중)'} 기준 · 단위 만 원</div>`;
  h += kv('주거세', won(last.income.R)) + kv('상업세', won(last.income.C)) + kv('산업세', won(last.income.I));
  h += kv('도로 유지', `-${won(last.expense.roads)}`) + kv('전기·상하수도 시설', `-${won(last.expense.facilities)}`) + kv('공공 서비스', `-${won(last.expense.services)}`);
  const net = inc - exp;
  h += `<div class="kv"><span class="k">월 수지</span><b class="${net >= 0 ? 'ok' : 'no'}">${net >= 0 ? '+' : ''}${won(net)}</b></div>`;
  h += '<div class="sec">세율 (높을수록 수요가 줄어요)</div>';
  for (const [k, n] of [['R', '주거'], ['C', '상업'], ['I', '산업']] as const)
    h += `<div class="tax"><span>${n}</span><input type="range" min="0" max="20" step="1" value="${w.tax[k]}" data-tax="${k}" /><b>${w.tax[k]}%</b></div>`;
  const hist = w.reports.slice(-24);
  if (hist.length > 1) {
    const max = Math.max(1, ...hist.map((r) => Math.abs(monthIncome(r) - monthExpense(r))));
    h += '<div class="sec">월 수지 추이</div><div class="hist">';
    for (const r of hist) {
      const v = monthIncome(r) - monthExpense(r);
      const ht = (Math.abs(v) / max) * 30;
      h += `<i style="height:${Math.max(1, ht)}px;background:${v >= 0 ? 'var(--good)' : 'var(--bad)'};transform:translateY(${v >= 0 ? -ht / 2 : ht / 2}px)"></i>`;
    }
    h += '</div>';
  }
  return h;
}

const OVERLAYS: [Overlay, string][] = [
  ['none', '기본'], ['traffic', '교통'], ['land', '땅값'], ['pollution', '오염'], ['power', '전기'], ['water', '수도'],
  ['edu', '교육'], ['safety', '치안'], ['health', '의료'], ['fire', '소방'],
];

export function statsHtml(w: World, overlay: Overlay): string {
  const s = w.stats;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '-');
  const use = (u: number, c: number) => `<b class="${!c ? 'no' : u > c * 0.9 ? 'meh' : 'ok'}">${num(u)} / ${num(c)}</b>`;
  let h = `<h3>📊 도시 현황<button class="x" data-close aria-label="닫기">✕</button></h3><div class="sub">지도 보기를 바꿔 문제를 찾아보세요.</div>`;
  h += '<div class="chips">' + OVERLAYS.map(([k, n]) => `<button data-ov="${k}" class="${k === overlay ? 'on' : ''}">${n}</button>`).join('') + '</div>';
  h += '<div class="sec">사람과 일자리</div>';
  h += kv('인구', `${num(s.pop)}명`) + kv('일자리', `${num(s.jobs)}개`) + kv('취업률', pct(s.employed, s.workers)) + kv('평균 만족도', s.pop ? `${Math.round(s.happy)}%` : '-');
  h += '<div class="sec">기반 시설 (사용 / 공급)</div>';
  h += kv('전력', use(s.powerUse, s.powerSupply)) + kv('수도', use(s.waterUse, s.waterSupply)) + kv('하수 처리', use(s.sewageUse, s.sewageCap));
  h += '<div class="sec">교통</div>';
  h += kv('평균 통근', `${Math.round(s.commute)}분`) + kv('도로 혼잡도', `<b style="color:${tone(100 - s.congestion * 100)}">${Math.round(s.congestion * 100)}%</b>`);
  return h;
}

export function menuHtml(w: World): string {
  let h = `<h3>☰ 메뉴<button class="x" data-close aria-label="닫기">✕</button></h3><div class="sub">${w.name} · ${dateText(w.day)}</div><div class="menu">`;
  h += '<button class="item" data-act="save">💾 저장하기</button><button class="item" data-act="load">📂 마지막 저장 불러오기</button><button class="item" data-act="new">🆕 새 도시</button><button class="item" data-act="help">❓ 조작법</button></div>';
  h += '<div class="sec">최근 소식</div><div class="log">' + w.notices.slice(0, 20).map((n) => `<div>${dateText(n.day)} · ${n.text}</div>`).join('') + '</div>';
  return h;
}

export const HELP = `<h3>❓ 조작법<button class="x" data-close aria-label="닫기">✕</button></h3>
<div class="sec">카메라</div>
${kv('이동', 'WASD · 방향키 · 가운데 버튼 드래그')}${kv('회전', '우클릭 드래그 · Q/E')}${kv('확대', '마우스 휠 · R/F')}${kv('모바일', '두 손가락 이동·확대·회전')}
<div class="sec">건설</div>
${kv('도로', '드래그해서 직선/ㄱ자')}${kv('구역', '드래그해서 사각형 칠하기')}${kv('시설', '탭/클릭해서 배치')}${kv('취소', 'Esc · 우클릭')}
<div class="sec">팁</div>
<div class="sub">전기와 수도는 도로 밑으로 흘러요. 발전소와 정수장이 도로망에 붙어 있어야 해요. 화력 발전소·하수처리장·공장은 오염을 내니 주거지와 떨어뜨리세요.</div>
${kv('단축키', 'Space 일시정지 · 1/2/3 속도')}`;
