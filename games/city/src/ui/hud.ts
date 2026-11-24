import { growthBlock, lotBlock } from '../sim/diagnose';
import { isPocket, pocketKind, POCKET_NAME } from '../sim/pockets';
import { MATURE, TIER_POP, tierOpen } from '../sim/growth';
import { CELL, displayName, Ground, KINDS, LEVEL_NAME, Road, SERVICE, ZONE_NAME, Zone } from '../sim/defs';
import { grantFor, LOAN_SIZES, MAX_LOANS, monthExpense, monthIncome } from '../sim/economy';
import { curveInfo } from '../sim/curves';
import { curbCapacity, LOT_SPACES } from '../sim/parking';
import { network } from '../sim/network';
import { ACHIEVEMENTS, advanceGoals, CHAPTERS, GOALS } from '../sim/goals';
import { BUS_TYPES, type BusType, busCount, busProblem, busRoute, busTypeOf, lineCost, lineUpkeep, type LineKind, STATION_AREA, stationArea, stationAreaStats } from '../sim/transit';
import { bh, bw, idx, lotsOf, type Building, type World } from '../sim/world';
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
  // The city's notices don't pop up over the screen any more: they wait in the 알림 box, counted on its bell.
  unread = Math.min(99, unread + fresh.length);
  showBell(fresh.some((n) => n.tone === 'warn'));
}

let unread = 0;
function showBell(warn = false) {
  const el = document.getElementById('bellCount');
  if (!el) return;
  el.textContent = unread ? String(unread) : '';
  el.hidden = !unread;
  if (warn) { const b = document.getElementById('bellBtn'); b?.classList.remove('ring'); void b?.offsetWidth; b?.classList.add('ring'); }
}
export function clearUnread() { unread = 0; showBell(); }

/** 알림: the city's recent notices, newest first, with a way to see where each one is. */
export function noticesHtml(w: World): string {
  let h = head('알림');
  if (!w.notices.length) return h + '<p class="hint">아직 알림이 없어요.</p>';
  h += '<ul class="notices">' + w.notices.map((n, k) => `<li class="${n.tone}"><span class="when">${Math.floor(n.day / 360) + 1}년 ${((Math.floor(n.day / 30) % 12) + 2) % 12 + 1}월</span><span class="text">${n.text}</span>${n.at !== undefined ? `<button class="btn small" data-notice="${k}">어디인지 보기</button>` : ''}</li>`).join('') + '</ul>';
  return h;
}

/** A toast; with `place`, it carries a button that takes the camera there (main.ts listens for city:goto). */
export function toast(text: string, tone: 'info' | 'warn' | 'good' = 'info', place?: { at: number; overlay?: string }) {
  const box = $('toasts');
  const el = document.createElement('div');
  el.className = `toast ${tone}`;
  el.setAttribute('role', tone === 'warn' ? 'alert' : 'status');
  el.textContent = text;
  if (place) {
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'btn small toast-go';
    go.textContent = '어디인지 보기';
    go.addEventListener('click', () => { document.dispatchEvent(new CustomEvent('city:goto', { detail: place })); el.remove(); });
    el.append(' ', go);
  }
  box.prepend(el);
  // Short, and only for what the player just did: one or two at a time, gone in a few seconds.
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 450); }, tone === 'warn' ? 3500 : 2600);
  while (box.children.length > 2) box.lastElementChild!.remove();
}

/* -------------------------------------------------------------- goals */

export function updateGoal(w: World): number {
  const st = advanceGoals(w);
  const g = st.goal;
  if (st.done) {
    $('goalStep').textContent = `${GOALS.length}/${GOALS.length}`;
    $('goalText').textContent = '모든 목표를 이뤘어요. 이제 마음껏 도시를 키우며 도전과제(현황 창)를 모아 보세요.';
    $('goalBar').style.transform = 'scaleX(1)';
  } else {
    const ch = CHAPTERS[st.chapter];
    $('goalStep').textContent = `${st.chapter + 1}장 ${ch.name} · ${st.inChapter + 1}/${ch.size}`;
    $('goalText').textContent = typeof g!.text === 'function' ? g!.text(w) : g!.text;
    $('goalBar').style.transform = `scaleX(${(st.inChapter / ch.size).toFixed(3)})`;
  }
  $('goal').classList.toggle('done', st.done);
  return st.index;
}

/** 도전과제: every challenge, got or not, for the 현황 sheet. */
function achievementsHtml(w: World): string {
  const got = new Set(w.achieved ?? []);
  return `<h4>도전과제 <small>${got.size}/${ACHIEVEMENTS.length}</small></h4><ul class="achieve">` + ACHIEVEMENTS.map((a) => `<li class="${got.has(a.id) ? 'got' : ''}"><b>${got.has(a.id) ? '🏅' : '·'} ${a.name}</b><span>${a.text}</span></li>`).join('') + '</ul>';
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
    let h = head(displayName(b.kind, b.look));
    if (d.zone) {
      const cap = Math.round((d.residents ?? d.jobs ?? 0) * lotsOf(b));
      h += tags(ZONE_NAME[d.zone], `${d.level}단계`, `${b.floors}층`, `${bw(b)}×${bh(b)}칸`, b.abandoned ? '폐가' : '');
      h += kv(d.residents ? '주민' : '일자리', `${num(b.occ)} / ${num(cap)}명`);
      h += `<div class="kv"><span class="k">${d.zone === Zone.R ? '만족도' : '경영 상태'}</span>${state(toneOf(b.happy), `${Math.round(b.happy)}%`)}</div>${meter(b.happy)}`;
      h += kv('전기', mark(b.powered, '들어옴', '끊김'));
      h += kv('수도', mark(b.watered, '들어옴', '끊김'));
      h += kv('하수', mark(b.sewered, '처리됨', '처리 안 됨'));
      h += kv('땅값', `${Math.round(w.land[i])}`);
      if (w.parkPress[i] > 0) h += kv('주차', state(w.parkPress[i] > 40 ? 'no' : 'meh', `차 ${w.parkPress[i]}%가 세울 곳이 없어요`));
      if (w.pollution[i] > 3) h += kv('오염', state('no', `${Math.round(w.pollution[i])}`));
      if (d.zone === Zone.R) {
        h += '<h4>공공 서비스</h4>';
        h += kv('교육', mark(!!w.edu[i])) + kv('치안', mark(!!w.safety[i])) + kv('의료', mark(!!w.health[i])) + kv('소방', mark(!!w.fire[i]));
        h += kv('대중교통', stationArea(w)[i] ? state('ok', '역세권') : w.transit[i] ? state('ok', '버스') : state('meh', '없음'));
      }
      if (!hasRoad) h += kv('도로', state('no', '연결 안 됨'));
      if (d.level && d.level < 3) h += `<p class="hint">${nextHint(w, b)}</p>`;
    } else if (b.kind === 'metro') {
      const lines = w.lines.filter((l) => l.stops.includes(i));
      h += `<p class="hint">${d.desc}. 역에서 250m 안이 역세권이에요.</p>`;
      // This station's own 역세권.
      let pop = 0, jobs = 0;
      w.buildings.forEach((o) => { const k = KINDS[o.kind]; if (!k.zone || Math.hypot(o.x - b.x, o.y - b.y) > STATION_AREA) return; if (k.residents) pop += o.occ; else jobs += o.occ; });
      h += kv('역세권 인구', `${num(pop)}명`) + kv('역세권 일자리', `${num(jobs)}개`);
      for (const l of lines) h += kv(`<span class="sw" style="--sw:${l.color}"></span>${esc(l.name)}`, `지난달 ${num(l.riders)}명`);
    } else {
      h += `<p class="hint">${d.desc ?? ''}</p>`;
      h += kv('도로 연결', mark(hasRoad, '연결됨', '도로를 붙여 주세요'));
      if (d.power > 0) h += kv('전기', mark(b.powered, '들어옴', '끊김'));
      if (LOT_SPACES[b.kind]) h += kv('주차', `${num(b.occ)} / ${num(LOT_SPACES[b.kind]!)}대`);
      h += kv('유지비', `월 ${won(d.upkeep ?? 0)}`);
      const s = SERVICE[b.kind];
      if (s) h += kv('범위', `${s.radius * 10}m`);
      h += `<button class="btn danger" data-demolish="${b.id}">철거하기</button>`;
    }
    return h;
  }
  if (w.road[i] || w.roadAlt[i]) {
    const t = !w.road[i] ? LEVEL_NAME[w.altLevel[i]] : curveInfo(w).owned[i] ? '곡선 도로' : w.diag[i] ? '대각선 도로' : w.road[i] === Road.Avenue ? '4차선 대로' : '일반 도로';
    const load = Math.round(Math.min(150, w.traffic[i] * 100));
    const stops = w.lines.filter((l) => l.kind === 'bus' && l.stops.includes(i));
    let h = `${head(t)}${kv('교통량', state(toneOf(100 - load), `${load}%`))}${meter(100 - load)}`;
    if (w.road[i]) h += kv('다리', w.ground[i] === Ground.Water ? '예' : '아니오');
    if (w.road[i]) { const cap = curbCapacity(w, i); h += kv('갓길 주차', cap ? `${w.parked[i]} / ${cap}대` : '안 됨'); }
    if (w.road[i] && w.roadAlt[i]) h += kv(w.altLevel[i] === 1 ? '위로 지나는 길' : '아래로 지나는 길', LEVEL_NAME[w.altLevel[i]]);
    for (const l of stops) h += kv(`<span class="sw" style="--sw:${l.color}"></span>${esc(l.name)} 정류장`, `지난달 ${num(l.riders)}명`);
    return h;
  }
  if (w.ground[i] === Ground.Water) return `${head('물')}<p class="hint">도로를 놓으면 다리가 돼요. 비용은 4배예요. 물 밑으로는 터널을 뚫을 수 있어요.</p>`;
  if (w.ground[i] === Ground.Mountain) return `${head('산')}<p class="hint">산에는 집을 짓거나 길을 낼 수 없어요. 터널로 뚫고 지나가거나, 꼭대기에 전망타워를 세울 수 있어요. 산이 보이는 동네는 땅값이 조금 올라요.</p>`;
  if (isPocket(w, i)) return `${head(`동네 쉼터 · ${POCKET_NAME[pocketKind(i)]}`)}${kv('구역', ZONE_NAME[w.zone[i]])}${kv('땅값', `${Math.round(w.land[i])}`)}<p class="hint">도로에 닿지 않는 안쪽 땅이라 건물 대신 블록 사람들이 함께 쓰는 쉼터로 남아요. 주변 땅값이 조금 올라요. 블록이 아파트 단지로 재건축되면 단지 안으로 들어가요.</p>`;
  const block = w.zone[i] && !w.road[i] ? lotBlock(w, i) ?? growthBlock(w, w.zone[i]) : null;
  if (block) return `${head(`빈 ${ZONE_NAME[w.zone[i]]} 구역`)}${kv('땅값', `${Math.round(w.land[i])}`)}<p class="hint">${block}</p>`;
  return `${head('빈 땅')}${w.zone[i] ? kv('구역', ZONE_NAME[w.zone[i]]) : ''}${kv('땅값', `${Math.round(w.land[i])}`)}${kv('오염', `${Math.round(w.pollution[i])}`)}`;
}

function nextHint(w: World, b: Building): string {
  const d = KINDS[b.kind];
  if (!b.powered || !b.watered) return '전기와 수도가 들어와야 성장해요.';
  if (b.happy < 52) return '만족도를 올리면 더 높은 건물로 바뀌어요.';
  const next = (d.level ?? 1) + 1;
  if (!tierOpen(w, next)) return `${next}단계는 인구 ${TIER_POP[next as 2 | 3].toLocaleString('ko-KR')}명이 되면 열려요.`;
  const age = w.day - b.builtDay, mature = MATURE[(d.level ?? 1) as 1 | 2];
  if (age < mature) return `지은 지 ${mature}일이 지나야 다음 단계로 바뀔 수 있어요. (${age}일째)`;
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
  h += '<h4>수입</h4>' + kv('주거세', won(last.income.R)) + kv('상업세', won(last.income.C)) + kv('산업세', won(last.income.I)) + kv('대중교통 요금', won(last.income.T ?? 0)) + kv('관광', won(last.income.V ?? 0)) + kv('지방교부세 (국비)', won(last.income.G || grantFor(w.stats.pop)));
  h += '<h4>지출</h4>' + kv('도로 유지', won(last.expense.roads)) + kv('전기, 상하수도 시설', won(last.expense.facilities)) + kv('공공 서비스', won(last.expense.services)) + kv('대중교통 운영', won(last.expense.transit ?? 0)) + (w.loans.length || last.expense.debt ? kv('대출 상환', won(last.expense.debt ?? 0)) : '');
  const net = inc - exp;
  h += `<div class="kv total"><span class="k">월 수지</span>${state(net >= 0 ? 'ok' : 'no', `${net >= 0 ? '+' : '−'}${won(Math.abs(net))}`)}</div>`;
  h += '<h4>세율</h4><p class="hint">높일수록 수입은 늘고 이사 오려는 사람과 가게는 줄어요. 보통 9~12%가 알맞고, 15%를 넘으면 수요가 크게 줄어요.</p>';
  for (const [k, n] of [['R', '주거'], ['C', '상업'], ['I', '산업']] as const)
    h += `<div class="tax"><label for="tax${k}">${n}</label><button class="btn small step" data-taxstep="${k}:-1" aria-label="${n} 세율 내리기">−</button><input id="tax${k}" type="range" min="0" max="20" step="1" value="${w.tax[k]}" data-tax="${k}" /><button class="btn small step" data-taxstep="${k}:1" aria-label="${n} 세율 올리기">+</button><b>${w.tax[k]}%</b></div>`;
  h += '<div class="loan-row"><button class="btn small" data-taxpreset="8">세금 낮게 (8%) · 성장 우선</button><button class="btn small" data-taxpreset="10">보통 (10%)</button><button class="btn small" data-taxpreset="13">세금 높게 (13%) · 수입 우선</button></div>';
  h += '<h4>지방채 (대출)</h4><p class="hint">돈이 모자랄 때 빌려 쓰고 5년 동안 매달 나눠 갚아요 (연 3.5%). 도시가 크면 지방교부세도 늘어요.</p>';
  h += w.loans.map((l, k) => `<div class="kv"><span class="k">${won(l.amount)} · ${l.months}개월 남음</span><span>월 ${won(l.pay)} <button class="btn small" data-repay="${k}">갚기</button></span></div>`).join('');
  if (w.loans.length < MAX_LOANS) h += `<div class="loan-row">${LOAN_SIZES.map((a) => `<button class="btn small" data-loan="${a}">${a / 10000}억 빌리기</button>`).join('')}</div>`;
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
  ['edu', '교육'], ['safety', '치안'], ['health', '의료'], ['fire', '소방'], ['parking', '주차'],
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
  if (w.bikeLast) h += kv('공공자전거 이용', `지난달 ${num(w.bikeLast)}회`);
  if (w.intercityLast) h += kv('고속버스·KTX로 외출', `지난달 ${num(w.intercityLast)}회`);
  if (w.festival) h += kv(w.festival.name, `진행 중 · 관광객 ${num(w.festival.visitors)}명`);
  const sa = stationAreaStats(w);
  if (sa.stations) h += kv('역세권 인구', `${num(sa.pop)}명 (${Math.round(sa.share * 100)}%)`) + kv('역세권 일자리', `${num(sa.jobs)}개`);
  h += '<h4>주차</h4>';
  const lots = [...w.buildings.values()].reduce((a, b) => a + (LOT_SPACES[b.kind] ?? 0), 0);
  h += kv('주차 수요', `${num(s.parkDemand)}대`) + kv('갓길 / 주차장', `${num(s.parkCurb)}면 / ${num(lots)}면`);
  h += kv('세울 곳 없는 차', state(s.parkDemand && s.parkUnmet > s.parkDemand * 0.25 ? 'no' : s.parkUnmet > s.parkDemand * 0.1 ? 'meh' : 'ok', `${num(s.parkUnmet)}대`));
  if (w.noAvenueParking) h += kv('대로 주정차', state('meh', '금지 중'));
  h += achievementsHtml(w);
  return h;
}

/** Every line, with its riders, cost and a way to close it. */
export function linesHtml(w: World, confirm: number | null): string {
  let h = head('노선 관리');
  if (!w.lines.length) return `${h}<p class="hint">아직 노선이 없어요. 아래 대중교통에서 버스 노선이나 지하철 노선을 고르고, 지도에서 정류장을 차례로 찍은 뒤 완성을 누르세요.</p>`;
  h += '<table class="lines"><thead><tr><th scope="col">노선</th><th scope="col" class="num">정류장</th><th scope="col" class="num">지난달 승객</th><th scope="col" class="num">월 운영비</th><th scope="col"><span class="visually-hidden">폐선</span></th></tr></thead><tbody>';
  for (const l of w.lines) {
    const extra = l.kind === 'bus' ? `${BUS_TYPES[busTypeOf(l)].name} · ${busCount(w, l)}대` : '지하철';
    h += `<tr><th scope="row"><span class="sw" style="--sw:${l.color}"></span>${esc(l.name)}<small>${extra}</small></th><td class="num">${l.stops.length}</td><td class="num">${num(l.riders)}</td><td class="num">${won(lineUpkeep(w, l))}</td><td>`;
    h += confirm === l.id
      ? `<button class="btn danger small" data-remove-line="${l.id}" data-confirmed>폐선 확인</button>`
      : `<button class="btn small" data-remove-line="${l.id}">폐선</button>`;
    h += '</td></tr>';
  }
  const tr = w.transfers ? ` 지난달 갈아탄 승객은 ${num(w.transfers)}명이에요.` : '';
  return `${h}</tbody></table><p class="hint">요금은 1인 1,400원이에요. ${w.transferDiscount ? '환승 할인 중이라 갈아타도 한 번만 내요.' : '환승 할인이 없어서 갈아탈 때마다 따로 내요.'}${tr} 역과 정류장 주변은 땅값과 만족도가 올라요.</p>
<p class="hint">마을버스는 골목 구석에서 역까지, 지선버스는 동네와 동네를, 간선버스는 큰길을 따라 멀리, 광역버스는 도시 밖으로 나가는 사람을 태워요. 노선끼리 정류장이 가까우면 갈아탈 수 있어요.</p>`;
}

/** The bar shown while a line is being drawn. */
export function draftHtml(w: World, kind: LineKind, stops: number[], bus: BusType = 'branch'): string {
  const cost = stops.length >= 2 ? lineCost(kind, stops, bus) : 0;
  const BUS_HINT: Record<BusType, string> = {
    village: '마을버스 정류장을 골목과 역 근처에 (한 바퀴 3km 이내)',
    branch: '지선버스 정류장을 도로 위에',
    trunk: '간선버스 정류장을 큰길 위에',
    express: '광역버스 정류장을 도로 위에 (하나는 서쪽 고속도로 입구 가까이)',
  };
  const what = kind === 'bus' ? BUS_HINT[bus] : '지하철역을 빈 땅이나 구역에';
  // While stops go in, say how long the loop is and what (if anything) stops it being built, before 노선 완성 is pressed.
  let problem: string | null = null, length = '', upgrade = '';
  if (kind === 'bus' && stops.length >= 2) {
    problem = busProblem(w, bus, stops);
    const r = busRoute(w, stops);
    if (r) length = `, 한 바퀴 ${(r.length * CELL / 1000).toFixed(1)}km`;
    // Past a 마을버스's reach: offer to make the same stops a bigger bus instead of starting over.
    if (r && BUS_TYPES[bus].maxLoop && r.length > BUS_TYPES[bus].maxLoop) {
      const km = (r.length * CELL / 1000).toFixed(1);
      problem = null;
      const opt = (b: BusType) => {
        const c = lineCost('bus', stops, b);
        return `<button class="btn small" data-draft="up:${b}"${busProblem(w, b, stops) ? ' disabled' : ''}>${BUS_TYPES[b].name}로 업그레이드 <small>${won(c)} 원</small></button>`;
      };
      upgrade = `<span class="draft-msg warn" role="status">한 바퀴 ${km}km라 ${BUS_TYPES[bus].name}(${BUS_TYPES[bus].maxLoop * CELL / 1000}km 이내)로는 달릴 수 없어요. 정류장은 그대로 두고 지선버스나 간선버스로 업그레이드할까요?</span>${opt('branch')}${opt('trunk')}`;
    }
  }
  const msg = stops.length ? `정류장 ${stops.length}곳${length}${cost ? `, ${won(cost)} 원` : ''}` : `${what} 차례로 찍으세요.`;
  const T = kind === 'bus' ? BUS_TYPES[bus] : null;
  const about = T ? `<span class="draft-about"><b>${T.name}</b> 좋은 점: ${T.good} 아쉬운 점: ${T.bad}</span>` : '';
  const warn = problem ? `<span class="draft-msg warn" role="status">${problem}</span>` : '';
  return `${about}<span class="draft-msg">${msg}</span>${warn}${upgrade}<button class="btn small" data-draft="undo"${stops.length ? '' : ' disabled'}>되돌리기</button><button class="btn small" data-draft="cancel">취소</button><button class="btn primary small" data-draft="done"${stops.length >= 2 && cost <= w.money && !problem && !upgrade ? '' : ' disabled'}>노선 완성</button>`;
}

const STYLE_NAME = { lowpoly: '로우폴리', toon: '툰', pixel: '픽셀' } as const;

export function menuHtml(w: World, quality: 'high' | 'normal', style: keyof typeof STYLE_NAME = 'lowpoly', music = { on: false, volume: 0.6 }): string {
  let h = head('메뉴');
  h += `<p class="hint">${esc(w.name)}, ${dateText(w.day)}</p><div class="menu">`;
  h += '<button class="btn" data-act="save">저장하기</button><button class="btn" data-act="slots">불러오기 (저장한 도시들)</button><button class="btn" data-act="new">새 도시</button><button class="btn" data-act="help">조작법</button>';
  h += `<button class="btn" data-act="quality" aria-pressed="${quality === 'high'}">그래픽 품질: ${quality === 'high' ? '높음' : '보통'}</button>`;
  h += `<button class="btn" data-act="style">그림체: ${STYLE_NAME[style]}</button>`;
  h += `<button class="btn" data-act="music" aria-pressed="${music.on}">배경음악: ${music.on ? '켜짐' : '꺼짐'}</button>`;
  h += `<div class="vol"><span>음량</span><button class="btn small" data-act="vol-" aria-label="음량 줄이기">−</button><b>${Math.round(music.volume * 10)}</b><button class="btn small" data-act="vol+" aria-label="음량 키우기">+</button></div></div>`;
  h += '<h4>최근 소식</h4><ol class="log">' + w.notices.slice(0, 20).map((n) => `<li><span>${dateText(n.day)}</span>${esc(n.text)}</li>`).join('') + '</ol>';
  return h;
}

export const HELP = `${head('조작법')}
<h4>카메라</h4>
${kv('이동', 'WASD, 방향키, 가운데 버튼 드래그')}${kv('회전', '우클릭 드래그, Q와 E')}${kv('확대', '마우스 휠, R과 F')}${kv('모바일', '두 손가락으로 이동, 확대, 회전')}
<h4>건설</h4>
${kv('도로', '드래그해서 직선이나 ㄱ자, 대각선은 45도')}${kv('고가와 터널', '도로 끝에서 끝까지 끌면 양 끝이 진입로가 돼요')}${kv('주차', '주차장이 모자라면 갓길에 세우고, 그래도 없으면 주변을 돌아요. 공영주차장, 주차타워, 지하철역이 주차난을 덜어요')}${kv('구역', '드래그해서 사각형으로 칠하기')}${kv('시설', '탭하거나 클릭해서 배치')}${kv('노선', '정류장을 차례로 찍고 완성')}${kv('취소', 'Esc 또는 우클릭')}
<h4>건물 위 표시</h4>
${kv('빨간 번개', '전기가 끊겼어요')}${kv('파란 물방울', '수돗물이 끊겼어요')}${kv('주황 도로', '도로에 연결되지 않았어요')}${kv('회색 집', '사람이 떠난 빈집이에요. 전기와 수도가 돌아오고 살기 좋아지면 다시 들어와요')}${kv('파란 P', '차를 세울 곳이 크게 모자라요. 근처에 공영주차장이나 주차타워를 지으세요. 현황의 주차 지도에서는 모자란 건물이 모두 보여요')}
<h4>단축키</h4>
${kv('도구', 'Z 도로, X 구역, C 전기, V 상하수도, B 공공, N 대중교통, M 공원, L 명소')}${kv('직각, 대각선', 'T')}${kv('속도', 'Space 멈춤, 1, 2, 3')}
<p class="hint">전기와 수도는 도로 밑으로 흘러요. 발전소와 정수장이 도로망에 붙어 있어야 해요. 화력 발전소, 하수처리장, 공장은 오염을 내니 주거지와 떨어뜨리세요.</p>`;
