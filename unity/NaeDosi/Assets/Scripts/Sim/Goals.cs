using System;
using System.Collections.Generic;
using System.Linq;
using static NaeDosi.Defs;
using static NaeDosi.WorldOps;

namespace NaeDosi
{
    /// <summary>Goals in five chapters and 도전과제 (port of sim/goals.ts).</summary>
    public static class Goals
    {
        public sealed class Goal { public Func<World, string> text; public Func<World, bool> done; }
        public sealed class Chapter { public string name; public int size; public double reward; }

        static int count(World w, Func<Building, bool> f) { int n = 0; foreach (var b in w.buildings.Values) if (f(b)) n++; return n; }
        static int kinds(World w, params string[] k) => count(w, b => Array.IndexOf(k, b.kind) >= 0);
        static int roads(World w) { int n = 0; for (int i = 0; i < N * N; i++) if (w.road[i] != 0) n++; return n; }
        static bool zoned(World w, int z) { for (int i = 0; i < N * N; i++) if (w.zone[i] == z) return true; return false; }

        public static int surplusRun(World w)
        {
            int n = 0;
            for (int k = w.reports.Count - 1; k >= 0 && Economy.monthIncome(w.reports[k]) - Economy.monthExpense(w.reports[k]) > 0; k--) n++;
            return n;
        }
        static double lastTourism(World w) => w.reports.Count > 0 ? w.reports[w.reports.Count - 1].incV : 0;
        static int metroLines(World w) => w.lines.Count(l => l.kind == "metro");

        public static readonly Chapter[] CHAPTERS =
        {
            new Chapter { name = "마을", size = 8, reward = 5000 },
            new Chapter { name = "읍", size = 8, reward = 15000 },
            new Chapter { name = "시", size = 8, reward = 30000 },
            new Chapter { name = "대도시", size = 8, reward = 60000 },
            new Chapter { name = "광역시", size = 8, reward = 100000 },
        };

        static Goal G(string t, Func<World, bool> d) => new Goal { text = _ => t, done = d };
        static Goal G(Func<World, string> t, Func<World, bool> d) => new Goal { text = t, done = d };

        public static readonly Goal[] GOALS =
        {
            G("서쪽 고속도로 끝에서 이어지는 도로를 깔아 보세요. 도구는 아래 도로에 있어요.", w => roads(w) > 40),
            G("도로 옆에 주거 구역을 칠하세요. 도로에서 3칸까지 칠할 수 있어요.", w => zoned(w, Zone.R)),
            G("발전소를 짓고 도로로 연결하세요. 전기는 도로를 따라 흘러요.", w => w.stats.powerSupply > 0),
            G(w => Tools.hasOpenWater(w) ? "물가에 정수장을 지어 수돗물을 공급하세요. 도로에 붙여야 작동해요." : "이 땅에는 물가가 없어요. 지하수 관정을 지어 수돗물을 공급하세요. 도로에 붙여야 작동해요.", w => w.stats.waterSupply > 0),
            G("상업과 산업 구역을 만들어 일자리를 주세요.", w => zoned(w, Zone.C) && zoned(w, Zone.I)),
            G("인구 300명을 모아 보세요. 위쪽 수요 막대를 참고하세요.", w => w.stats.pop >= 300),
            G("하수처리장을 지어 하수를 처리하세요. 주거지와 떨어뜨리면 좋아요.", w => w.stats.sewageCap > 0),
            G("초등학교를 지어 아이들을 가르치세요. 주변 땅값이 올라요.", w => kinds(w, "school") > 0),
            G("경찰서, 소방서, 보건소를 하나씩 지으세요.", w => new[] { "police", "fire", "clinic" }.All(k => kinds(w, k) > 0)),
            G("인구 1,500명을 달성하세요. 공원도 땅값을 올려 줘요.", w => w.stats.pop >= 1500),
            G("공원을 다섯 곳 만드세요. 공원 둘레는 땅값과 만족도가 올라요.", w => kinds(w, "park") >= 5),
            G("버스 노선을 만들어 차 없이 출근하게 해 주세요.", w => w.lines.Any(l => l.kind == "bus")),
            G("인구 2,500명이 되면 2단계가 열려요. 땅값을 올려 첫 빌라·저층 아파트를 올려 보세요.", w => kinds(w, "r2") > 0),
            G("석 달 연속 흑자를 내 보세요. 예산 창에서 수입과 지출을 볼 수 있어요.", w => surplusRun(w) >= 3),
            G(w => $"주민 행복도를 55% 이상으로 올려 보세요 (지금 {Math.Round(w.stats.happy)}%). 공원, 학교, 행정복지센터가 도움이 돼요.", w => w.stats.pop >= 1000 && w.stats.happy >= 55),
            G("인구 5,000명. 대로와 버스로 교통 체증을 줄이세요.", w => w.stats.pop >= 5000),
            G("지하철 1호선을 개통하세요. 역 주변은 역세권이 돼요.", w => metroLines(w) >= 1),
            G("역세권을 키우세요. 역에서 250m 안에 2,000명이 살고 일자리 800개가 있게 해 보세요.", w => { var s = Transit.stationAreaStats(w); return s.pop >= 2000 && s.jobs >= 800; }),
            G("고가도로, 지하차도, 터널 중 하나로 막힌 길을 뚫어 보세요.", w => w.roadAlt.Any(r => r > 0)),
            G("명소를 하나 지어 보세요. 전통시장, 수변공원, 고궁, 전망타워가 있어요.", w => kinds(w, "market", "riverpark", "palace", "tower") > 0),
            G("공공자전거 대여소를 세 곳 지어 가까운 길은 자전거로 다니게 해 주세요.", w => kinds(w, "bike") >= 3),
            G("고속버스터미널을 지어 다른 도시와 이어 주세요. 대로에 붙여 지어요.", w => kinds(w, "terminal") > 0),
            G(w => $"인구 8,000명이 넘은 도시에서 평균 출퇴근 시간을 45분 아래로 줄여 보세요 (지금 {Math.Round(w.stats.commute)}분). 버스, 지하철, 대로가 도움이 돼요.", w => w.stats.pop >= 8000 && w.stats.commute > 0 && w.stats.commute <= 45),
            G("인구 10,000명이 되면 3단계가 열려요. 땅값 높은 2단계 건물들이 모이면 첫 고층 아파트나 주상복합으로 재건축돼요.", w => kinds(w, "r3") > 0),
            G("첫 오피스 타워를 올리세요. 상업 구역의 땅값이 관건이에요.", w => kinds(w, "c3") > 0),
            G("인구 20,000명. 진짜 도시가 됐어요!", w => w.stats.pop >= 20000),
            G("지하철 2호선을 개통하세요. 두 노선이 만나는 역은 환승역이 돼요.", w => metroLines(w) >= 2),
            G("KTX역을 지으세요. 도시 밖으로 가는 사람이 기차를 타요.", w => kinds(w, "ktx") > 0),
            G("관광 수입을 한 달에 500만 원 넘게 벌어 보세요. 명소, 찜질방, 등산로가 관광객을 불러요.", w => lastTourism(w) >= 500),
            G("축제를 열어 보세요. 벚꽃길이나 명소가 있으면 철마다 축제가 열려요.", w => w.festival != null),
            G("오피스 타워를 다섯 동 올리세요.", w => kinds(w, "c3") >= 5),
            G("고층 아파트·주상복합을 열 동 올리세요.", w => kinds(w, "r3") >= 10),
            G("인구 30,000명을 달성하세요.", w => w.stats.pop >= 30000),
            G(w => $"인구 20,000명이 넘는 도시에서 행복도를 65% 이상으로 지켜 보세요 (지금 {Math.Round(w.stats.happy)}%).", w => w.stats.pop >= 20000 && w.stats.happy >= 65),
            G("버스와 지하철 노선을 합쳐 여덟 개 운행하세요.", w => w.lines.Count >= 8),
            G("여섯 달 연속 흑자를 내 보세요.", w => surplusRun(w) >= 6),
            G("빚 없이 시 금고에 10억 원을 모으세요 (대출이 남아 있으면 안 돼요).", w => w.money >= 100000 && w.loans.Count == 0),
            G(w => $"인구 30,000명이 넘는 도시에서 도로 혼잡도를 15% 아래로 지켜 보세요 (지금 {Math.Round(w.stats.congestion * 100)}%). 현황 창의 교통 지도에서 빨간 길을 줄여요.", w => w.stats.pop >= 30000 && w.stats.congestion <= 0.15),
            G("인구 50,000명. 광역시가 눈앞이에요.", w => w.stats.pop >= 50000),
            G("인구 100,000명. 광역시가 됐어요!", w => w.stats.pop >= 100000),
        };

        public sealed class Progress { public int index, chapter, inChapter; public Goal goal; public bool done; }

        public static Progress advanceGoals(World w)
        {
            bool first = !w.hasGoal;
            int k = w.hasGoal ? w.goal : 0;
            while (k < GOALS.Length && GOALS[k].done(w))
            {
                k++;
                int end = 0;
                for (int i = 0; i < CHAPTERS.Length; i++)
                {
                    var c = CHAPTERS[i];
                    end += c.size;
                    int paid = w.hasChapterPaid ? w.chapterPaid : 0;
                    if (k == end && paid <= i)
                    {
                        w.chapterPaid = i + 1; w.hasChapterPaid = true;
                        if (first) continue;
                        w.money += c.reward;
                        notify(w, $"{i + 1}장 「{c.name}」을 마쳤어요! 국비 지원 {Won(c.reward)}만 원{(i + 1 < CHAPTERS.Length ? $". 이제 {i + 2}장 「{CHAPTERS[i + 1].name}」이에요." : ".")}", "good");
                    }
                }
            }
            w.goal = k; w.hasGoal = true;
            int chapter = 0, start = 0;
            while (chapter < CHAPTERS.Length - 1 && k >= start + CHAPTERS[chapter].size) { start += CHAPTERS[chapter].size; chapter++; }
            return new Progress { index = k, chapter = chapter, inChapter = Math.Min(k - start, CHAPTERS[chapter].size - 1), goal = k < GOALS.Length ? GOALS[k] : null, done = k >= GOALS.Length };
        }

        public sealed class Achievement { public string id, name, text; public Func<World, bool> done; }
        static Achievement A(string id, string name, string text, Func<World, bool> done) => new Achievement { id = id, name = name, text = text, done = done };

        public static readonly Achievement[] ACHIEVEMENTS =
        {
            A("black1", "알뜰 살림", "열두 달 연속 흑자", w => surplusRun(w) >= 12),
            A("black3", "적자 없는 3년", "서른여섯 달 연속 흑자", w => surplusRun(w) >= 36),
            A("parks", "공원 도시", "공원 30곳", w => kinds(w, "park") >= 30),
            A("green", "맑은 하늘", "화력 발전소 없이 전력 1,000 넘게", w => kinds(w, "coal") == 0 && w.stats.powerSupply >= 1000),
            A("buses", "버스 천국", "버스 노선 다섯 개", w => w.lines.Count(l => l.kind == "bus") >= 5),
            A("bikes", "두 바퀴 도시", "공공자전거로 한 달 500번 이동", w => w.bikeLast >= 500),
            A("station", "역세권 명당", "역 둘레 250m에 5,000명", w => Transit.stationAreaStats(w).pop >= 5000),
            A("towers", "마천루", "오피스 타워 열 동", w => kinds(w, "c3") >= 10),
            A("apts", "아파트 숲", "고층 아파트·주상복합 서른 동", w => kinds(w, "r3") >= 30),
            A("sights", "명소 수집가", "전통시장, 수변공원, 고궁, 전망타워를 모두", w => new[] { "market", "riverpark", "palace", "tower" }.All(k => kinds(w, k) > 0)),
            A("happy", "살기 좋은 도시", "인구 5,000명 넘는 도시에서 행복도 80%", w => w.stats.pop >= 5000 && w.stats.happy >= 80),
            A("flow", "뻥 뚫린 길", "인구 20,000명 넘는 도시에서 도로 혼잡도 8% 아래", w => w.stats.pop >= 20000 && w.stats.congestion < 0.08),
            A("tourism", "관광 도시", "관광 수입 한 달 2,000만 원", w => lastTourism(w) >= 2000),
            A("debtfree", "빚 갚은 시장", "대출을 받았다가 모두 갚기", w => w.everLoan && w.loans.Count == 0),
        };

        public static void checkAchievements(World w)
        {
            var got = new List<string>(w.achieved ?? new List<string>());
            foreach (var a in ACHIEVEMENTS)
            {
                if (got.Contains(a.id) || !a.done(w)) continue;
                got.Add(a.id);
                notify(w, $"🏅 도전과제 달성: {a.name} ({a.text})", "good");
            }
            w.achieved = got;
        }
    }

    /// <summary>Why a zone is not growing, in words a player can act on (port of sim/diagnose.ts).</summary>
    public static class Diagnose
    {
        static string ZN(int z) => z == Zone.R ? "주거" : z == Zone.C ? "상업" : "산업";
        static string num(double n) => Won(n);

        public static bool reachesEdge(World w, int i)
        {
            var net = Network.network(w);
            int a = Network.findAccess(w, i % N, i / N, 1, 1);
            return a >= 0 && net.outside.Contains(net.comp[a]);
        }

        public sealed class Lot { public int n, at = -1, cut, cutAt = -1; }

        public static Dictionary<int, Lot> freeLots(World w)
        {
            var o = new Dictionary<int, Lot> { [Zone.R] = new Lot(), [Zone.C] = new Lot(), [Zone.I] = new Lot() };
            for (int i = 0; i < N * N; i++)
            {
                int z = w.zone[i];
                if (z == 0 || w.road[i] != 0 || w.bld[i] >= 0 || Pockets.isPocket(w, i) || !Pockets.onRoad(w, i)) continue;
                var l = o[z];
                if (!reachesEdge(w, i)) { l.cut++; if (l.cutAt < 0) l.cutAt = i; continue; }
                l.n++;
                if (l.at < 0) l.at = i;
            }
            return o;
        }

        public static string lotBlock(World w, int i)
        {
            if (!Pockets.onRoad(w, i)) return null;
            if (!reachesEdge(w, i)) return "이 땅 앞 도로가 맵 가장자리 도로와 이어져 있지 않아요. 새로 오는 사람과 회사는 바깥에서 들어오니, 도로를 이어 주세요.";
            return null;
        }

        public static string growthBlock(World w, int zone, Dictionary<int, Lot> lots = null)
        {
            var s = w.stats; double d = w.Demand(zone);
            if (s.powerSupply == 0 || s.powerUse >= s.powerSupply * 0.98) return "전기가 모자라서 새 건물이 들어오지 못해요. 발전소를 더 지으세요.";
            if (s.waterSupply == 0 || s.waterUse >= s.waterSupply * 0.98) return "수돗물이 모자라서 새 건물이 들어오지 못해요. 정수장이나 지하수 관정을 더 지으세요.";
            if (d > 0) return (lots ?? freeLots(w))[zone].n != 0 ? null : $"{ZN(zone)} 수요는 있는데 도로 옆에 비어 있는 {ZN(zone)} 구역이 없어요. 도로 옆에 {ZN(zone)} 구역을 더 칠하세요.";
            double tax = w.Tax(zone);
            if (zone == Zone.R)
            {
                if (s.jobs < s.workers * 0.95) return $"일자리가 모자라서 사람들이 이사 오지 않아요. 일할 사람 {num(s.workers)}명에 일자리는 {num(s.jobs)}개예요. 상업이나 산업 구역을 더 칠하세요.";
                if (tax > 12) return $"주거 세율({tax}%)이 높아서 사람들이 오지 않아요. 예산 창에서 낮춰 보세요.";
                return $"살기 불편해서 사람들이 오지 않아요 (만족도 {Math.Round(s.happy)}%). 학교, 공원, 경찰서, 대중교통을 챙겨 보세요.";
            }
            if (tax > 12) return $"{ZN(zone)} 세율({tax}%)이 높아서 들어오려는 곳이 없어요. 예산 창에서 낮춰 보세요.";
            if (zone == Zone.C) return "가게를 찾을 주민이 모자라요. 주거 구역을 늘리면 상가도 따라와요.";
            return "공장에서 일할 사람이 모자라요. 주거 구역을 늘리면 공장도 따라와요.";
        }

        public static List<(string text, int at)> stalledZones(World w)
        {
            var lots = freeLots(w); var o = new List<(string, int)>();
            foreach (int z in new[] { Zone.R, Zone.C, Zone.I })
            {
                var why = growthBlock(w, z, lots);
                if (why == null) continue;
                bool waiting = lots[z].n >= 12 || (w.Demand(z) > 30 && lots[z].n == 0);
                if (!waiting || why.StartsWith("전기") || why.StartsWith("수돗물")) continue;
                o.Add(($"{ZN(z)} 구역이 자라지 않아요. {why}", lots[z].at));
            }
            int cut = lots[Zone.R].cut + lots[Zone.C].cut + lots[Zone.I].cut;
            if (cut >= 8)
            {
                int z = new[] { Zone.R, Zone.C, Zone.I }.First(k => lots[k].cut > 0);
                o.Add(($"구역 {cut}칸이 맵 가장자리와 이어지지 않은 도로에 붙어 있어서 건물이 들어오지 않아요. 도로를 바깥과 이어 주세요.", lots[z].cutAt));
            }
            return o;
        }
    }
}
