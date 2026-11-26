using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using static NaeDosi.Defs;
using static NaeDosi.WorldOps;

namespace NaeDosi.Ui
{
    /// <summary>The HUD's words and sheets, string for string with ui/hud.ts (rendered by Html).</summary>
    public static class Hud
    {
        static readonly CultureInfo KO = CultureInfo.GetCultureInfo("ko-KR");
        public static double JsRound(double v) => Math.Floor(v + 0.5);
        public static string num(double n) => JsRound(n).ToString("#,0", KO);
        public static string won(double n) => $"{num(n)}만";
        public static string esc(string s) => s.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;");

        /// <summary>자금 in the top bar: 만 below 1억, then 억, then 조.</summary>
        public static string shortWon(double n)
        {
            double a = Math.Abs(n); string sign = n < 0 ? "-" : "";
            string fix(double v, int d) => Math.Round(v, d, MidpointRounding.AwayFromZero).ToString(d == 0 ? "#,0" : d == 1 ? "#,0.#" : "#,0.##", KO);
            if (a >= 1e8) { double v = a / 1e8; return $"{sign}{fix(v, v < 10 ? 2 : v < 100 ? 1 : 0)}조"; }
            if (a >= 1e4) { double v = a / 1e4; return $"{sign}{fix(v, v < 100 ? 1 : 0)}억"; }
            return $"{sign}{num(a)}만";
        }

        public static string dateText(int day)
        {
            int m = day / 30;
            return $"{2026 + (m + 2) / 12}년 {(m + 2) % 12 + 1}월 {day % 30 + 1}일";
        }

        // ------------------------------------------------------------ pieces

        public static string state(string tone, string text) => $"<b class=\"{tone}\">{text}</b>";
        public static string mark(bool ok, string yes = "있음", string no = "없음") => state(ok ? "ok" : "no", ok ? yes : no);
        public static string kv(string k, string v) => $"<div class=\"kv\"><span class=\"k\">{k}</span>{(v.StartsWith("<") ? v : $"<b>{v}</b>")}</div>";
        public static string toneOf(double v) => v >= 65 ? "ok" : v >= 45 ? "meh" : "no";
        public static string meter(double v) => $"<div class=\"meter {toneOf(v)}\"><i style=\"transform:scaleX({(Math.Max(0, Math.Min(100, v)) / 100).ToString("0.000", CultureInfo.InvariantCulture)})\"></i></div>";
        public static string head(string title) => $"<header class=\"sheet-head\"><h3>{title}</h3><button class=\"x\" data-close>닫기</button></header>";
        public static string tags(params string[] t) => "<div class=\"tags\">" + string.Concat(t.Where(x => !string.IsNullOrEmpty(x)).Select(x => $"<span>{x}</span>")) + "</div>";
        static string sw(string color) => $"<span class=\"sw\" style=\"--sw:{color}\"></span>";

        // ------------------------------------------------------------ goals

        public static (string step, string text, double bar, bool done) goal(World w)
        {
            var st = Goals.advanceGoals(w);
            if (st.done) return ($"{Goals.GOALS.Length}/{Goals.GOALS.Length}", "모든 목표를 이뤘어요. 이제 마음껏 도시를 키우며 도전과제(현황 창)를 모아 보세요.", 1, true);
            var ch = Goals.CHAPTERS[st.chapter];
            return ($"{st.chapter + 1}장 {ch.name} · {st.inChapter + 1}/{ch.size}", st.goal.text(w), (double)st.inChapter / ch.size, false);
        }

        public static string noticesHtml(World w)
        {
            var h = head("알림");
            if (w.notices.Count == 0) return h + "<p class=\"hint\">아직 알림이 없어요.</p>";
            var sb = new StringBuilder(h + "<ul class=\"notices\">");
            for (int k = 0; k < w.notices.Count; k++)
            {
                var n = w.notices[k];
                sb.Append($"<li class=\"{n.tone}\"><span class=\"when\">{n.day / 360 + 1}년 {((n.day / 30) % 12 + 2) % 12 + 1}월</span><span class=\"text\">{n.text}</span>{(n.at >= 0 ? $"<button class=\"btn small\" data-notice=\"{k}\">어디인지 보기</button>" : "")}</li>");
            }
            return sb + "</ul>";
        }

        public static string specsHtml(World w)
        {
            var sb = new StringBuilder("<h4>도시 특화</h4><div class=\"specs\">");
            foreach (var s in Special.SPECS)
            {
                bool open = Special.isOpen(w, s.id); int lv = Special.specLevel(w, s.id);
                string body = open
                    ? $"<p class=\"spec-lv\">{(lv > 0 ? $"{lv}단계 · {s.levels[lv - 1]}" : $"열림 · {string.Join(", ", s.buildings.Select(k => KINDS[k].name))}을 지으면 1단계가 돼요")}</p><p class=\"spec-next\">{(lv < 3 ? $"특화 건물 {new[] { 1, 3, 5 }[lv]}채면 {lv + 1}단계" : "가장 높은 단계예요")}</p>"
                    : "<ul class=\"spec-needs\">" + string.Concat(s.needs.Select(n => { double v = n.have(w); bool ok = v >= n.goal; return $"<li class=\"{(ok ? "ok" : "")}\"><span>{(ok ? "✓" : "·")} {n.text}</span><b>{num(Math.Min(v, n.goal))} / {num(n.goal)}{n.unit}</b></li>"; })) + "</ul>";
                sb.Append($"<section class=\"spec{(open ? " open" : "")}\"><b class=\"spec-name\">{s.name}</b><small>{s.blurb}</small>{body}</section>");
            }
            return sb + "</div>";
        }

        static string achievementsHtml(World w)
        {
            var got = new HashSet<string>(w.achieved ?? new List<string>());
            return $"<h4>도전과제 <small>{got.Count}/{Goals.ACHIEVEMENTS.Length}</small></h4><ul class=\"achieve\">" + string.Concat(Goals.ACHIEVEMENTS.Select(a => $"<li class=\"{(got.Contains(a.id) ? "got" : "")}\"><b>{(got.Contains(a.id) ? "🏅" : "·")} {a.name}</b><span>{a.text}</span></li>")) + "</ul>";
        }

        // ------------------------------------------------------------ info sheet

        public static string infoHtml(World w, int x, int y)
        {
            int i = idx(x, y);
            int id = w.bld[i];
            if (id >= 0 && w.buildings.TryGetValue(id, out var b))
            {
                var d = KINDS[b.kind];
                var net = Network.network(w);
                bool hasRoad = net.access.ContainsKey(b.id);
                var h = head(displayName(b.kind, b.look));
                if (d.zone != 0)
                {
                    double cap = JsRound((d.hasResidents ? d.residents : d.jobs) * lotsOf(b));
                    h += tags(ZONE_NAME[d.zone], $"{d.level}단계", $"{b.floors}층", $"{bw(b)}×{bh(b)}칸", b.abandoned ? "폐가" : "");
                    h += kv(d.hasResidents ? "주민" : "일자리", $"{num(b.occ)} / {num(cap)}명");
                    h += $"<div class=\"kv\"><span class=\"k\">{(d.zone == Zone.R ? "만족도" : "경영 상태")}</span>{state(toneOf(b.happy), $"{JsRound(b.happy)}%")}</div>{meter(b.happy)}";
                    h += kv("전기", mark(b.powered, "들어옴", "끊김"));
                    h += kv("수도", mark(b.watered, "들어옴", "끊김"));
                    h += kv("하수", mark(b.sewered, "처리됨", "처리 안 됨"));
                    h += kv("땅값", $"{JsRound(w.land[i])}");
                    if (w.parkPress[i] > 0) h += kv("주차", state(w.parkPress[i] > 40 ? "no" : "meh", $"차 {w.parkPress[i]}%가 세울 곳이 없어요"));
                    if (w.pollution[i] > 3) h += kv("오염", state("no", $"{JsRound(w.pollution[i])}"));
                    if (d.zone == Zone.R)
                    {
                        h += "<h4>공공 서비스</h4>";
                        h += kv("교육", mark(w.edu[i] != 0)) + kv("치안", mark(w.safety[i] != 0)) + kv("의료", mark(w.health[i] != 0)) + kv("소방", mark(w.fire[i] != 0));
                        h += kv("대중교통", Transit.stationArea(w)[i] != 0 ? state("ok", "역세권") : w.transit[i] != 0 ? state("ok", "버스") : state("meh", "없음"));
                    }
                    if (!hasRoad) h += kv("도로", state("no", "연결 안 됨"));
                    if (d.level > 0 && d.level < 3) h += $"<p class=\"hint\">{nextHint(w, b)}</p>";
                }
                else if (b.kind == "metro")
                {
                    var lines = w.lines.Where(l => l.stops.Contains(i)).ToList();
                    h += $"<p class=\"hint\">{d.desc}. 역에서 250m 안이 역세권이에요.</p>";
                    double pop = 0, jobs = 0;
                    foreach (var o in w.buildings.Values) { var k = KINDS[o.kind]; if (k.zone == 0 || Math.Sqrt((o.x - b.x) * (o.x - b.x) + (o.y - b.y) * (o.y - b.y)) > Transit.STATION_AREA) continue; if (k.hasResidents) pop += o.occ; else jobs += o.occ; }
                    h += kv("역세권 인구", $"{num(pop)}명") + kv("역세권 일자리", $"{num(jobs)}개");
                    foreach (var l in lines) h += kv($"{sw(l.color)}{esc(l.name)}", $"지난달 {num(l.riders)}명");
                }
                else
                {
                    h += $"<p class=\"hint\">{d.desc ?? ""}</p>";
                    h += kv("도로 연결", mark(hasRoad, "연결됨", "도로를 붙여 주세요"));
                    if (d.power > 0) h += kv("전기", mark(b.powered, "들어옴", "끊김"));
                    if (Parking.LOT_SPACES(b.kind) > 0) h += kv("주차", $"{num(b.occ)} / {num(Parking.LOT_SPACES(b.kind))}대");
                    h += kv("유지비", $"월 {won(d.upkeep)}");
                    if (SERVICE.TryGetValue(b.kind, out var s)) h += kv("범위", $"{s.radius * 10}m");
                    if (b.kind == "snowbase") h += kv("범위", $"{Hazards.SNOW_RADIUS * 10}m");
                    h += $"<button class=\"btn danger\" data-demolish=\"{b.id}\">철거하기</button>";
                }
                return h;
            }
            if (w.road[i] != 0 || w.roadAlt[i] != 0)
            {
                string t = w.road[i] == 0 ? LEVEL_NAME[w.altLevel[i]] : Curves.curveInfo(w).owned[i] != 0 ? "곡선 도로" : w.diag[i] != 0 ? "대각선 도로" : w.road[i] == Road.Avenue ? "4차선 대로" : "일반 도로";
                double load = JsRound(Math.Min(150, w.traffic[i] * 100));
                var stops = w.lines.Where(l => l.kind == "bus" && l.stops.Contains(i));
                var h = $"{head(t)}{kv("교통량", state(toneOf(100 - load), $"{load}%"))}{meter(100 - load)}";
                if (w.road[i] != 0) h += kv("다리", w.ground[i] == Ground.Water ? "예" : "아니오");
                if (w.road[i] != 0) { int cap = Parking.curbCapacity(w, i); h += kv("갓길 주차", cap > 0 ? $"{w.parked[i]} / {cap}대" : "안 됨"); }
                if (w.road[i] != 0 && w.roadAlt[i] != 0) h += kv(w.altLevel[i] == 1 ? "위로 지나는 길" : "아래로 지나는 길", LEVEL_NAME[w.altLevel[i]]);
                foreach (var l in stops) h += kv($"{sw(l.color)}{esc(l.name)} 정류장", $"지난달 {num(l.riders)}명");
                return h;
            }
            if (w.ground[i] == Ground.Water) return $"{head("물")}<p class=\"hint\">도로를 놓으면 다리가 돼요. 비용은 4배예요. 물 밑으로는 터널을 뚫을 수 있어요.</p>";
            if (w.ground[i] == Ground.Mountain) return $"{head("산")}<p class=\"hint\">산에는 집을 짓거나 길을 낼 수 없어요. 터널로 뚫고 지나가거나, 꼭대기에 전망타워를 세울 수 있어요. 산이 보이는 동네는 땅값이 조금 올라요.</p>";
            if (Pockets.isPocket(w, i)) return $"{head($"동네 쉼터 · {Pockets.POCKET_NAME[Pockets.pocketKind(i)]}")}{kv("구역", ZONE_NAME[w.zone[i]])}{kv("땅값", $"{JsRound(w.land[i])}")}<p class=\"hint\">도로에 닿지 않는 안쪽 땅이라 건물 대신 블록 사람들이 함께 쓰는 쉼터로 남아요. 주변 땅값이 조금 올라요. 블록이 아파트 단지로 재건축되면 단지 안으로 들어가요.</p>";
            string block = w.zone[i] != 0 && w.road[i] == 0 ? (Diagnose.lotBlock(w, i) ?? Diagnose.growthBlock(w, w.zone[i])) : null;
            if (block != null) return $"{head($"빈 {ZONE_NAME[w.zone[i]]} 구역")}{kv("땅값", $"{JsRound(w.land[i])}")}<p class=\"hint\">{block}</p>";
            return $"{head("빈 땅")}{(w.zone[i] != 0 ? kv("구역", ZONE_NAME[w.zone[i]]) : "")}{kv("땅값", $"{JsRound(w.land[i])}")}{kv("오염", $"{JsRound(w.pollution[i])}")}";
        }

        static string nextHint(World w, Building b)
        {
            var d = KINDS[b.kind];
            if (!b.powered || !b.watered) return "전기와 수도가 들어와야 성장해요.";
            if (b.happy < 52) return "만족도를 올리면 더 높은 건물로 바뀌어요.";
            int lvl = d.level > 0 ? d.level : 1, next = lvl + 1;
            if (!Growth.tierOpen(w, next)) return $"{next}단계는 인구 {num(Growth.TIER_POP(next))}명이 되면 열려요.";
            int age = w.day - b.builtDay, mature = Growth.MATURE(lvl);
            if (age < mature) return $"지은 지 {mature}일이 지나야 다음 단계로 바뀔 수 있어요. ({age}일째)";
            int need = (d.zone == Zone.R ? new[] { 30, 46 } : d.zone == Zone.C ? new[] { 26, 40 } : new[] { 0, 15 })[lvl - 1];
            double land = w.land[idx(b.x, b.y)];
            if (land < need) return $"땅값이 {need} 이상이면 성장해요. 지금은 {JsRound(land)}이에요. 공원, 학교, 지하철역, 강 조망이 땅값을 올려요.";
            if (d.level == 2) return "같은 구역의 2단계 건물 넷이 2×2로 모이면 재건축돼요.";
            return "수요가 있으면 곧 성장해요.";
        }

        // ------------------------------------------------------------ panels

        public static string budgetHtml(World w)
        {
            var last = w.reports.Count > 0 ? w.reports[w.reports.Count - 1] : w.month;
            double inc = Economy.monthIncome(last), exp = Economy.monthExpense(last);
            var h = head("예산");
            h += $"<p class=\"hint\">{(w.reports.Count > 0 ? "지난달" : "이번 달(진행 중)")} 기준, 단위는 만 원이에요.</p>";
            h += "<h4>수입</h4>" + kv("주거세", won(last.incR)) + kv("상업세", won(last.incC)) + kv("산업세", won(last.incI)) + kv("대중교통 요금", won(last.incT)) + kv("관광", won(last.incV)) + kv("특화 (의료관광·기술 수출)", won(last.incS)) + kv("고속도로 통행료", won(last.incH)) + kv("지방교부세 (국비)", won(last.incG != 0 ? last.incG : Economy.grantFor(w.stats.pop)));
            h += "<h4>지출</h4>" + kv("도로 유지", won(last.expRoads)) + kv("전기, 상하수도 시설", won(last.expFacilities)) + kv("공공 서비스", won(last.expServices)) + kv("대중교통 운영", won(last.expTransit)) + (last.expSnow != 0 ? kv("제설 (염화칼슘)", won(last.expSnow)) : "") + (w.loans.Count > 0 || last.expDebt != 0 ? kv("대출 상환", won(last.expDebt)) : "");
            double net = inc - exp;
            h += $"<div class=\"kv total\"><span class=\"k\">월 수지</span>{state(net >= 0 ? "ok" : "no", $"{(net >= 0 ? "+" : "−")}{won(Math.Abs(net))}")}</div>";
            h += "<h4>세율</h4><p class=\"hint\">높일수록 수입은 늘고 이사 오려는 사람과 가게는 줄어요. 보통 9~12%가 알맞고, 15%를 넘으면 수요가 크게 줄어요.</p>";
            foreach (var (k, n) in new[] { ("R", "주거"), ("C", "상업"), ("I", "산업") })
            {
                double t = k == "R" ? w.taxR : k == "C" ? w.taxC : w.taxI;
                h += $"<div class=\"tax\"><label>{n}</label><button class=\"btn small step\" data-taxstep=\"{k}:-1\">−</button><input type=\"range\" min=\"0\" max=\"20\" step=\"1\" value=\"{t}\" data-tax=\"{k}\" /><button class=\"btn small step\" data-taxstep=\"{k}:1\">+</button><b>{t}%</b></div>";
            }
            h += "<div class=\"loan-row\"><button class=\"btn small\" data-taxpreset=\"8\">세금 낮게 (8%) · 성장 우선</button><button class=\"btn small\" data-taxpreset=\"10\">보통 (10%)</button><button class=\"btn small\" data-taxpreset=\"13\">세금 높게 (13%) · 수입 우선</button></div>";
            h += "<h4>지방채 (대출)</h4><p class=\"hint\">돈이 모자랄 때 빌려 쓰고 5년 동안 매달 나눠 갚아요 (연 3.5%). 도시가 크면 지방교부세도 늘어요.</p>";
            for (int k = 0; k < w.loans.Count; k++) { var l = w.loans[k]; h += $"<div class=\"kv\"><span class=\"k\">{won(l.amount)} · {l.months}개월 남음</span><span>월 {won(l.pay)} <button class=\"btn small\" data-repay=\"{k}\">갚기</button></span></div>"; }
            if (w.loans.Count < Economy.MAX_LOANS) h += "<div class=\"loan-row\">" + string.Concat(Economy.LOAN_SIZES.Select(a => $"<button class=\"btn small\" data-loan=\"{a}\">{a / 10000}억 빌리기</button>")) + "</div>";
            var hist = w.reports.Skip(Math.Max(0, w.reports.Count - 24)).ToList();
            if (hist.Count > 1)
            {
                double max = Math.Max(1, hist.Max(r => Math.Abs(Economy.monthIncome(r) - Economy.monthExpense(r))));
                h += $"<h4>월 수지, 최근 {hist.Count}개월</h4><div class=\"hist\">";
                foreach (var r in hist) { double v = Economy.monthIncome(r) - Economy.monthExpense(r); h += $"<i class=\"{(v >= 0 ? "up" : "down")}\" style=\"transform:scaleY({(v / max).ToString("0.000", CultureInfo.InvariantCulture)})\"></i>"; }
                h += "</div>";
            }
            return h;
        }

        public static readonly (string id, string name)[] OVERLAYS =
        {
            ("none", "기본"), ("traffic", "교통"), ("transit", "대중교통"), ("land", "땅값"), ("pollution", "오염"), ("power", "전기"), ("water", "수도"),
            ("edu", "교육"), ("safety", "치안"), ("health", "의료"), ("fire", "소방"), ("parking", "주차"),
        };

        public static string statsHtml(World w, string overlay)
        {
            var s = w.stats;
            string pct(double a, double b) => b != 0 ? $"{JsRound(a / b * 100)}%" : "없음";
            string use(double u, double c) => state(c == 0 ? "no" : u > c * 0.9 ? "meh" : "ok", $"{num(u)} / {num(c)}");
            var h = head("도시 현황");
            h += "<h4>지도 보기</h4><div class=\"chips\">" + string.Concat(OVERLAYS.Select(o => $"<button data-ov=\"{o.id}\" aria-pressed=\"{(o.id == overlay ? "true" : "false")}\">{o.name}</button>")) + "</div>";
            h += "<h4>사람과 일자리</h4>";
            h += kv("인구", $"{num(s.pop)}명") + kv("일자리", $"{num(s.jobs)}개") + kv("취업률", pct(s.employed, s.workers)) + kv("행복도 (평균 만족도)", s.pop != 0 ? $"{JsRound(s.happy)}%" : "없음");
            h += "<h4>기반 시설, 사용 / 공급</h4>";
            h += kv("전력", use(s.powerUse, s.powerSupply)) + kv("수도", use(s.waterUse, s.waterSupply)) + kv("하수 처리", use(s.sewageUse, s.sewageCap));
            h += "<h4>교통</h4>";
            h += kv("평균 출퇴근 시간", $"{JsRound(s.commute)}분") + kv("도로 혼잡도", state(toneOf(100 - s.congestion * 100), $"{JsRound(s.congestion * 100)}%"));
            h += kv("대중교통 승객", $"지난달 {num(w.lines.Sum(l => l.riders))}명");
            if (w.bikeLast != 0) h += kv("공공자전거 이용", $"지난달 {num(w.bikeLast)}회");
            if (w.intercityLast != 0) h += kv("고속버스·KTX로 외출", $"지난달 {num(w.intercityLast)}회");
            if (w.festival != null) h += kv(w.festival.name, $"진행 중 · 관광객 {num(w.festival.visitors)}명");
            var sa = Transit.stationAreaStats(w);
            if (sa.stations > 0) h += kv("역세권 인구", $"{num(sa.pop)}명 ({JsRound(sa.share * 100)}%)") + kv("역세권 일자리", $"{num(sa.jobs)}개");
            h += "<h4>주차</h4>";
            int lots = w.buildings.Values.Sum(b => Parking.LOT_SPACES(b.kind));
            h += kv("주차 수요", $"{num(s.parkDemand)}대") + kv("갓길 / 주차장", $"{num(s.parkCurb)}면 / {num(lots)}면");
            h += kv("세울 곳 없는 차", state(s.parkDemand != 0 && s.parkUnmet > s.parkDemand * 0.25 ? "no" : s.parkUnmet > s.parkDemand * 0.1 ? "meh" : "ok", $"{num(s.parkUnmet)}대"));
            if (w.noAvenueParking) h += kv("대로 주정차", state("meh", "금지 중"));
            h += specsHtml(w);
            h += achievementsHtml(w);
            return h;
        }

        public static string linesHtml(World w, int? confirm)
        {
            var h = head("노선 관리");
            if (w.lines.Count == 0) return $"{h}<p class=\"hint\">아직 노선이 없어요. 아래 대중교통에서 버스 노선이나 지하철 노선을 고르고, 지도에서 정류장을 차례로 찍은 뒤 완성을 누르세요.</p>";
            h += "<div class=\"lines\"><div class=\"tr\"><span class=\"t-th\">노선</span><span class=\"num\">정류장</span><span class=\"num\">지난달 승객</span><span class=\"num\">월 운영비</span><span></span></div>";
            foreach (var l in w.lines)
            {
                string extra = l.kind == "bus" ? $"{Transit.BUS_TYPES[Transit.busTypeOf(l)].name} · {Transit.busCount(w, l)}대" : "지하철";
                h += $"<div class=\"tr\"><div class=\"t-th\"><div class=\"kv-k\">{sw(l.color)}<b>{esc(l.name)}</b></div><small>{extra}</small></div><span class=\"num\">{l.stops.Count}</span><span class=\"num\">{num(l.riders)}</span><span class=\"num\">{won(Transit.lineUpkeep(w, l))}</span><div>";
                h += confirm == l.id ? $"<button class=\"btn danger small\" data-remove-line=\"{l.id}\" data-confirmed>폐선 확인</button>" : $"<button class=\"btn small\" data-remove-line=\"{l.id}\">폐선</button>";
                h += "</div></div>";
            }
            string tr = w.transfers != 0 ? $" 지난달 갈아탄 승객은 {num(w.transfers)}명이에요." : "";
            return $"{h}</div><p class=\"hint\">요금은 1인 1,400원이에요. {(w.transferDiscount ? "환승 할인 중이라 갈아타도 한 번만 내요." : "환승 할인이 없어서 갈아탈 때마다 따로 내요.")}{tr} 역과 정류장 주변은 땅값과 만족도가 올라요.</p><p class=\"hint\">마을버스는 골목 구석에서 역까지, 지선버스는 동네와 동네를, 간선버스는 큰길을 따라 멀리, 광역버스는 도시 밖으로 나가는 사람을 태워요. 노선끼리 정류장이 가까우면 갈아탈 수 있어요.</p>";
        }

        public static string draftHtml(World w, string kind, List<int> stops, string bus = "branch")
        {
            bus ??= "branch";
            double cost = stops.Count >= 2 ? Transit.lineCost(kind, stops, bus) : 0;
            var BUS_HINT = new Dictionary<string, string>
            {
                ["village"] = "마을버스 정류장을 골목과 역 근처에 (한 바퀴 3km 이내)",
                ["branch"] = "지선버스 정류장을 도로 위에",
                ["trunk"] = "간선버스 정류장을 큰길 위에",
                ["express"] = "광역버스 정류장을 도로 위에 (하나는 서쪽 고속도로 입구 가까이)",
            };
            string what = kind == "bus" ? BUS_HINT[bus] : "지하철역을 빈 땅이나 구역에";
            string problem = null, length = "", upgrade = "";
            if (kind == "bus" && stops.Count >= 2)
            {
                problem = Transit.busProblem(w, bus, stops);
                var r = Transit.busRoute(w, stops);
                if (r != null) length = $", 한 바퀴 {(r.Length * CELL / 1000.0).ToString("0.0", CultureInfo.InvariantCulture)}km";
                var T0 = Transit.BUS_TYPES[bus];
                if (r != null && T0.maxLoop > 0 && r.Length > T0.maxLoop)
                {
                    string km = (r.Length * CELL / 1000.0).ToString("0.0", CultureInfo.InvariantCulture);
                    problem = null;
                    string opt(string b) { double c = Transit.lineCost("bus", stops, b); return $"<button class=\"btn small\" data-draft=\"up:{b}\"{(Transit.busProblem(w, b, stops) != null ? " disabled" : "")}>{Transit.BUS_TYPES[b].name}로 업그레이드 <small>{won(c)} 원</small></button>"; }
                    upgrade = $"<span class=\"draft-msg warn\">한 바퀴 {km}km라 {T0.name}({T0.maxLoop * CELL / 1000.0}km 이내)로는 달릴 수 없어요. 정류장은 그대로 두고 지선버스나 간선버스로 업그레이드할까요?</span>{opt("branch")}{opt("trunk")}";
                }
            }
            string msg = stops.Count > 0 ? $"정류장 {stops.Count}곳{length}{(cost != 0 ? $", {won(cost)} 원" : "")}" : $"{what} 차례로 찍으세요.";
            var T = kind == "bus" ? Transit.BUS_TYPES[bus] : null;
            string about = T != null ? $"<span class=\"draft-about\"><b>{T.name}</b> 좋은 점: {T.good} 아쉬운 점: {T.bad}</span>" : "";
            string warn = problem != null ? $"<span class=\"draft-msg warn\">{problem}</span>" : "";
            return $"{about}<span class=\"draft-msg\">{msg}</span>{warn}{upgrade}<button class=\"btn small\" data-draft=\"undo\"{(stops.Count > 0 ? "" : " disabled")}>되돌리기</button><button class=\"btn small\" data-draft=\"cancel\">취소</button><button class=\"btn primary small\" data-draft=\"done\"{(stops.Count >= 2 && cost <= w.money && problem == null && upgrade == "" ? "" : " disabled")}>노선 완성</button>";
        }

        public static string menuHtml(World w, bool high, bool musicOn, float volume, bool dayLock, bool effects, bool hazards, int artStyle = 0, bool tilt = false)
        {
            var h = head("메뉴");
            h += $"<p class=\"hint\">{esc(w.name)}, {dateText(w.day)}</p><div class=\"menu\">";
            h += "<button class=\"btn\" data-act=\"save\">저장하기</button><button class=\"btn\" data-act=\"slots\">불러오기 (저장한 도시들)</button><button class=\"btn\" data-act=\"visit\">도시 구경 (친구 도시 보기·내 도시 보여주기)</button><button class=\"btn\" data-act=\"new\">새 도시</button><button class=\"btn\" data-act=\"help\">조작법</button>";
            h += $"<button class=\"btn\" data-act=\"quality\">그래픽 품질: {(high ? "높음" : "보통")}</button>";
            h += $"<button class=\"btn\" data-act=\"style\">그림체: {(artStyle == 1 ? "툰" : "로우폴리")}</button>";
            h += $"<button class=\"btn\" data-act=\"tilt\">미니어처 효과: {(tilt ? "켜짐" : "꺼짐")}</button>";
            h += $"<button class=\"btn\" data-act=\"daylock\">시간: {(dayLock ? "낮 고정" : "밤낮 바뀜")}</button>";
            h += $"<button class=\"btn\" data-act=\"hazards\">재해 (화재·한파): {(hazards ? "켜짐" : "꺼짐")}</button>";
            h += $"<button class=\"btn\" data-act=\"music\">배경음악: {(musicOn ? "켜짐" : "꺼짐")}</button>";
            h += $"<button class=\"btn\" data-act=\"sfx\">효과음: {(effects ? "켜짐" : "꺼짐")}</button>";
            h += $"<div class=\"vol\"><span>음량</span><button class=\"btn small\" data-act=\"vol-\">−</button><b>{Math.Round(volume * 10)}</b><button class=\"btn small\" data-act=\"vol+\">+</button></div></div>";
            h += "<h4>최근 소식</h4><ol class=\"log\">" + string.Concat(w.notices.Take(20).Select(n => $"<li><span>{dateText(n.day)}</span> {esc(n.text)}</li>")) + "</ol>";
            return h;
        }

        public static string HELP => $@"{head("조작법")}
<h4>카메라</h4>
{kv("이동", "WASD, 방향키, 가운데 버튼 드래그")}{kv("회전", "우클릭 드래그, Q와 E")}{kv("확대", "마우스 휠, R과 F")}{kv("모바일", "두 손가락으로 이동, 확대, 회전")}
<h4>건설</h4>
{kv("도로", "드래그해서 직선이나 ㄱ자, 대각선은 45도")}{kv("고가와 터널", "도로 끝에서 끝까지 끌면 양 끝이 진입로가 돼요")}{kv("주차", "주차장이 모자라면 갓길에 세우고, 그래도 없으면 주변을 돌아요. 공영주차장, 주차타워, 지하철역이 주차난을 덜어요")}{kv("구역", "드래그해서 사각형으로 칠하기")}{kv("시설", "탭하거나 클릭해서 배치")}{kv("노선", "정류장을 차례로 찍고 완성")}{kv("취소", "Esc 또는 우클릭")}
<h4>건물 위 표시</h4>
{kv("빨간 번개", "전기가 끊겼어요")}{kv("파란 물방울", "수돗물이 끊겼어요")}{kv("주황 도로", "도로에 연결되지 않았어요")}{kv("회색 집", "사람이 떠난 빈집이에요. 전기와 수도가 돌아오고 살기 좋아지면 다시 들어와요")}{kv("파란 P", "차를 세울 곳이 크게 모자라요. 근처에 공영주차장이나 주차타워를 지으세요. 현황의 주차 지도에서는 모자란 건물이 모두 보여요")}{kv("노란 느낌표", "칠해 둔 구역이 비어 있어요. 일자리나 수요가 모자라거나 도로가 바깥과 이어지지 않았어요. 빈 땅을 누르면 이유가 나와요")}{kv("빨간 자동차", "길이 심하게 막혀요. 도로를 넓히거나 우회로, 대중교통을 만들어 보세요. 풀리면 사라져요")}{kv("불꽃과 연기", "화재가 났어요. 소방서 범위 안이면 하루 만에 꺼지고, 밖이면 번지다가 건물이 타 버려요")}{kv("하얀 도로", "한파로 눈이 쌓였어요. 차가 느려져요. 제설기지(공공)를 지으면 반경 안 도로를 치워요. 메뉴에서 재해를 끌 수 있어요")}
<h4>단축키</h4>
{kv("도구", "Z 도로, X 구역, C 전기, V 상하수도, B 공공, N 대중교통, M 공원, L 명소")}{kv("직각, 대각선", "T")}{kv("속도", "Space 멈춤, 1, 2, 3")}
<p class=""hint"">전기와 수도는 도로 밑으로 흘러요. 발전소와 정수장이 도로망에 붙어 있어야 해요. 화력 발전소, 하수처리장, 공장은 오염을 내니 주거지와 떨어뜨리세요.</p>";
    }
}
