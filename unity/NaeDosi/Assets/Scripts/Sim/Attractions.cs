using System;
using System.Collections.Generic;
using System.Linq;
using static NaeDosi.Defs;
using static NaeDosi.WorldOps;

namespace NaeDosi
{
    /// <summary>
    /// The everyday city beyond homes and jobs: neighbourhood services, getting about, a day out, and
    /// festivals (port of sim/attractions.ts).
    /// </summary>
    public static class Attractions
    {
        public static class CIVIC { public const int office = 1, post = 2, library = 4, bike = 8, leisure = 16; }

        static readonly Dictionary<string, (int rad, int bit)> REACH = new Dictionary<string, (int, int)>
        {
            ["office"] = (12, CIVIC.office), ["post"] = (14, CIVIC.post), ["library"] = (8, CIVIC.library),
            ["bike"] = (5, CIVIC.bike), ["trailhead"] = (10, CIVIC.leisure), ["jjim"] = (10, CIVIC.leisure),
        };

        public static void updateCivic(World w)
        {
            Array.Clear(w.civic, 0, w.civic.Length);
            foreach (var b in w.buildings.Values)
            {
                if (!REACH.TryGetValue(b.kind, out var r)) continue;
                var (rad, bit) = r;
                double ccx = b.x + bw(b) / 2.0, ccy = b.y + bh(b) / 2.0;
                for (int y = (int)Math.Floor(ccy - rad); y <= (int)Math.Ceiling(ccy + rad); y++)
                    for (int x = (int)Math.Floor(ccx - rad); x <= (int)Math.Ceiling(ccx + rad); x++)
                    {
                        if (!inside(x, y) || Geom.Hypot(x + 0.5 - ccx, y + 0.5 - ccy) > rad) continue;
                        w.civic[idx(x, y)] |= (byte)bit;
                        if (bit == CIVIC.library) w.edu[idx(x, y)] = 1;
                    }
            }
        }

        public static double civicHappiness(World w, int i, bool residential)
        {
            int c = w.civic[i];
            double h = 0;
            if (residential)
            {
                if ((c & CIVIC.office) != 0) h += 3;
                if ((c & CIVIC.library) != 0) h += 2;
                if ((c & CIVIC.leisure) != 0) h += 3;
                if (w.festival != null) h += 4;
            }
            else if ((c & CIVIC.post) != 0) h += 4;
            return h;
        }

        public static bool isCherry(int i)
        {
            double gx = Math.Floor((i % N) / 8.0), gy = Math.Floor(i / (double)N / 8);
            double h = Math.Sin(gx * 12.9898 + gy * 78.233) * 43758.5453;
            return h - Math.Floor(h) < 0.3;
        }

        static readonly Dictionary<string, (double base0, double per, double cap)> TOURISM = new Dictionary<string, (double, double, double)>
        {
            ["trailhead"] = (60, 0.01, 300), ["jjim"] = (80, 0.015, 500), ["terminal"] = (100, 0.02, 800), ["ktx"] = (300, 0.05, 3000),
        };

        public static void accrueTourism(World w)
        {
            double v = 0;
            foreach (var b in w.buildings.Values)
                if (TOURISM.TryGetValue(b.kind, out var t)) v += Math.Min(t.cap, t.base0 + w.stats.pop * t.per);
            w.month.incV += v / 30;
            if (w.festival != null) w.month.incV += w.festival.spend / w.festival.days;
        }

        /// <summary>Trips that need no car: out of town by 고속버스 or KTX, or by 공공자전거. Returns the trip's time, or null.</summary>
        public static double? noCarTrip(World w, int a, int b, bool leaving, double roll)
        {
            if (leaving)
            {
                double share = (hasKind(w, "ktx") ? 0.2 : 0) + (hasKind(w, "terminal") ? 0.25 : 0);
                if (roll < share) { w.intercityMonth++; return 12; }
                return null;
            }
            if ((w.civic[a] & CIVIC.bike) == 0 || (w.civic[b] & CIVIC.bike) == 0) return null;
            int d = Math.Abs((a % N) - (b % N)) + Math.Abs((a / N) - (b / N));
            if (d > 30 || roll >= 0.3) return null;
            w.bikeMonth++;
            return d / 2.0 + 2;
        }

        static int kindsVer = -1; static World kindsW; static readonly HashSet<string> kinds = new HashSet<string>();
        public static bool hasKind(World w, string kind)
        {
            if (kindsW != w || kindsVer != w.ver.buildings)
            {
                kinds.Clear();
                foreach (var b in w.buildings.Values) kinds.Add(b.kind);
                kindsW = w; kindsVer = w.ver.buildings;
            }
            return kinds.Contains(kind);
        }

        public static double hubDemand(World w) => (hasKind(w, "ktx") ? 12 : 0) + (hasKind(w, "terminal") ? 6 : 0);

        public static void updateFestivals(World w)
        {
            if (w.festival != null && w.day > w.festival.until)
            {
                var f = w.festival;
                notify(w, $"{f.name}가 끝났어요. 관광객 {Won(f.visitors)}명이 다녀가 {Won(f.spend)}만 원을 쓰고 갔어요.", "good");
                w.festival = null;
            }
            if (w.festival != null || w.day % 30 != 1) return;
            int month = Calendar.calendarMonthOf(w.day);
            if (month == 4)
            {
                int n = 0; double sx = 0, sz = 0;
                for (int i = 0; i < N * N; i++) if (w.trees[i] != 0 && w.road[i] != 0 && isCherry(i)) { n++; sx += (i % N) + 0.5; sz += (i / N) + 0.5; }
                if (n < 20)
                {
                    if (w.trees.Any(t => t != 0)) notify(w, "벚나무 가로수가 스무 칸이 넘으면 4월에 벚꽃축제가 열려요.", "info");
                    return;
                }
                double visitors = Math.Min(60000, n * 300 + w.stats.pop);
                open(w, new Festival { kind = "cherry", name = "벚꽃축제", x = (sx / n) * CELL, z = (sz / n) * CELL, until = w.day + 10, days = 10, visitors = visitors, spend = visitors * 0.04 });
            }
            else if (month == 10)
            {
                (double x, double z)? park = null;
                foreach (var b in w.buildings.Values) if (park == null && b.kind == "riverpark") park = ((b.x + 1) * CELL, (b.y + 1) * CELL);
                if (park == null)
                {
                    if (w.ground.Any(g => g == Ground.Water)) notify(w, "수변공원이 있으면 10월에 불꽃축제가 열려요.", "info");
                    return;
                }
                double ppx = park.Value.x, ppz = park.Value.z;
                int px = (int)Math.Floor(ppx / CELL), pz = (int)Math.Floor(ppz / CELL);
                double best = double.PositiveInfinity; int bx = px, bz = pz;
                for (int y = pz - 15; y <= pz + 15; y++) for (int x = px - 15; x <= px + 15; x++)
                    {
                        if (!inside(x, y) || w.ground[idx(x, y)] != Ground.Water) continue;
                        double d = Geom.Hypot(x - px, y - pz);
                        if (d < best) { best = d; bx = x; bz = y; }
                    }
                if (best < double.PositiveInfinity)
                {
                    double dx = bx - px, dz = bz - pz, l = Geom.Hypot(dx, dz); if (l == 0) l = 1;
                    ppx = (bx + 0.5 + (dx / l) * 4) * CELL; ppz = (bz + 0.5 + (dz / l) * 4) * CELL;
                }
                double visitors = Math.Min(100000, 20000 + w.stats.pop * 2);
                open(w, new Festival { kind = "fireworks", name = "불꽃축제", x = ppx, z = ppz, until = w.day + 3, days = 3, visitors = visitors, spend = visitors * 0.05 });
            }
        }

        static void open(World w, Festival f)
        {
            w.festival = f;
            notify(w, $"{f.name}가 열렸어요! {f.days}일 동안 관광객이 몰려와요. 시민들도 즐거워해요.", "good");
        }

        public static void closeMobilityMonth(World w)
        {
            w.bikeLast = w.bikeMonth; w.bikeMonth = 0;
            w.intercityLast = w.intercityMonth; w.intercityMonth = 0;
        }

        public static string attractionProblem(World w, string kind, int x, int y, int size)
        {
            bool ring(Func<int, bool> fn)
            {
                for (int yy = y - 1; yy <= y + size; yy++) for (int xx = x - 1; xx <= x + size; xx++)
                    {
                        bool inner = xx >= x && xx < x + size && yy >= y && yy < y + size;
                        if (!inner && inside(xx, yy) && fn(idx(xx, yy))) return true;
                    }
                return false;
            }
            if (kind == "terminal" && !ring(i => w.road[i] == Road.Avenue)) return "고속버스터미널은 4차선 대로에 붙여 지어야 해요. 버스가 드나들어요.";
            if (kind == "trailhead" && !ring(i => w.ground[i] == Ground.Mountain)) return "등산로 입구는 산 바로 앞에 지어요.";
            return null;
        }
    }

    public static class Calendar
    {
        /// <summary>The calendar month (1-12) of a game day; the game starts in March.</summary>
        public static int calendarMonthOf(int day) => ((day / 30 + 2) % 12) + 1;
    }

    /// <summary>도시 특화: 의료 and 기술 (port of sim/special.ts).</summary>
    public static class Special
    {
        public sealed class Need { public string text; public Func<World, double> have; public double goal; public string unit; }
        public sealed class SpecDef { public string id, name, blurb; public Need[] needs; public string[] buildings; public string[] levels; }

        static int count(World w, params string[] ks) { int n = 0; foreach (var b in w.buildings.Values) if (Array.IndexOf(ks, b.kind) >= 0) n++; return n; }

        static double reach(World w, string key)
        {
            double all = 0, ins = 0; var arr = w.Service(key);
            foreach (var b in w.buildings.Values)
            {
                if (KINDS[b.kind].zone != Zone.R || b.abandoned) continue;
                all += b.occ;
                if (arr[b.y * 256 + b.x] != 0) ins += b.occ;
            }
            return all != 0 ? Math.Round((ins / all) * 100) : 0;
        }

        public static readonly SpecDef[] SPECS =
        {
            new SpecDef
            {
                id = "med", name = "의료 특화",
                blurb = "병원과 바이오 연구로 이름난 도시. 주민이 건강하고, 의료관광객이 찾아와요.",
                needs = new[]
                {
                    new Need { text = "인구", have = w => w.stats.pop, goal = 4000, unit = "명" },
                    new Need { text = "보건소", have = w => count(w, "clinic"), goal = 3, unit = "곳" },
                    new Need { text = "보건소가 닿는 주민", have = w => reach(w, "health"), goal = 60, unit = "%" },
                },
                buildings = new[] { "hospital", "medlab" },
                levels = new[] { "주민 만족도 +2, 주거 수요 +3, 의료관광 수입", "주민 만족도 +4, 주거 수요 +6, 의료관광 수입 두 배", "주민 만족도 +6, 주거 수요 +10, 의료관광 수입 세 배" },
            },
            new SpecDef
            {
                id = "tech", name = "기술 특화",
                blurb = "대학과 연구단지가 모인 도시. 회사와 공장이 몰려오고, 기술을 팔아 돈을 벌어요.",
                needs = new[]
                {
                    new Need { text = "인구", have = w => w.stats.pop, goal = 8000, unit = "명" },
                    new Need { text = "초등학교", have = w => count(w, "school"), goal = 2, unit = "곳" },
                    new Need { text = "공공도서관", have = w => count(w, "library"), goal = 1, unit = "곳" },
                    new Need { text = "3차 산업(지식·물류) 건물", have = w => count(w, "i3"), goal = 4, unit = "채" },
                },
                buildings = new[] { "university", "techpark" },
                levels = new[] { "상업·산업 수요 +4, 기술 수출 수입", "상업·산업 수요 +8, 기술 수출 수입 두 배", "상업·산업 수요 +12, 기술 수출 수입 세 배" },
            },
        };

        public static SpecDef specOf(string kind) => SPECS.FirstOrDefault(s => Array.IndexOf(s.buildings, kind) >= 0);
        public static bool isOpen(World w, string id) => w.specs != null && w.specs.Contains(id);

        public static int specLevel(World w, string id)
        {
            if (!isOpen(w, id)) return 0;
            int n = count(w, SPECS.First(s => s.id == id).buildings);
            return n >= 5 ? 3 : n >= 3 ? 2 : n >= 1 ? 1 : 0;
        }

        public static string specProblem(World w, string kind)
        {
            var s = specOf(kind);
            if (s == null || isOpen(w, s.id)) return null;
            var left = s.needs.Where(n => n.have(w) < n.goal).Select(n => $"{n.text} {Won(n.goal)}{n.unit ?? ""}");
            return $"{s.name}가 열려야 지을 수 있어요. 남은 조건: {string.Join(", ", left)}";
        }

        public static void checkSpecs(World w)
        {
            foreach (var s in SPECS)
            {
                if (isOpen(w, s.id)) continue;
                if (!s.needs.All(n => n.have(w) >= n.goal)) continue;
                w.specs ??= new List<string>();
                w.specs.Add(s.id);
                notify(w, $"{s.name}가 열렸어요! {string.Join("과 ", s.buildings.Select(k => KINDS[k].name))}을 지을 수 있어요. 지을수록 특화 단계가 올라가요.", "good");
            }
        }

        public static (double R, double C, double I) specDemand(World w)
        {
            int med = specLevel(w, "med"), tech = specLevel(w, "tech");
            return (new[] { 0, 3, 6, 10 }[med], tech * 4, tech * 4);
        }
        public static double specHappy(World w) => specLevel(w, "med") * 2;

        public static double specIncomeDay(World w)
        {
            int med = specLevel(w, "med"), tech = specLevel(w, "tech");
            return (med * (200 + w.stats.pop * 0.02) + tech * (300 + w.stats.jobs * 0.025)) / 30;
        }
    }
}
