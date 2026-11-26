using System;
using System.Collections.Generic;
using System.Linq;
using static NaeDosi.Defs;
using static NaeDosi.WorldOps;

namespace NaeDosi
{
    /// <summary>
    /// Public transport (port of sim/transit.ts): bus loops on the roads and subway lines of stations joined
    /// by tunnels; a trip near a line may leave the car at home.
    /// </summary>
    public static class Transit
    {
        public sealed class BusType
        {
            public string name, color; public int radius; public double share, speed, costLine, costStop, upkeep; public int cellsPerBus, maxLoop; public string good, bad;
        }

        public static readonly Dictionary<string, BusType> BUS_TYPES = new Dictionary<string, BusType>
        {
            ["village"] = new BusType { name = "마을버스", color = "#f0a500", radius = 4, share = 0.45, speed = 2.6, costLine = 150, costStop = 20, upkeep = 15, cellsPerBus = 22, maxLoop = 300, good = "가장 싸고, 골목 사람을 지하철역까지 잘 실어 날라요. 역으로 갈아타면 승객이 가장 많이 늘어요.", bad = "가장 느리고, 한 바퀴 3km 안의 짧은 노선만 돼요." },
            ["branch"] = new BusType { name = "지선버스", color = "#5bb025", radius = 4, share = 0.35, speed = 3.2, costLine = 400, costStop = 60, upkeep = 45, cellsPerBus = 28, maxLoop = 0, good = "길이 제한이 없어 동네와 동네, 터널 너머까지 이어요. 값과 속도가 중간이에요.", bad = "타는 사람 비율이 가장 낮아요." },
            ["trunk"] = new BusType { name = "간선버스", color = "#3d5bab", radius = 4, share = 0.4, speed = 3.8, costLine = 700, costStop = 80, upkeep = 60, cellsPerBus = 34, maxLoop = 0, good = "빠르고 많이 태워요. 대로를 따라 도시를 가로지르는 줄기 노선이에요.", bad = "짓고 굴리는 데 지선의 1.5배쯤 들어요." },
            ["express"] = new BusType { name = "광역버스", color = "#d6262b", radius = 5, share = 0.55, speed = 5, costLine = 1500, costStop = 100, upkeep = 90, cellsPerBus = 40, maxLoop = 0, good = "가장 빠르고 정류장 범위가 넓어요. 도시 밖으로 출퇴근하는 사람을 실어 날라요.", bad = "가장 비싸고, 정류장 하나는 서쪽 고속도로 입구 가까이 있어야 해요." },
        };
        public static string busTypeOf(TransitLine l) => l.bus ?? "branch";

        public static int STOP_RADIUS(string kind) => kind == "bus" ? 4 : 9;
        public const double COST_STATION = 5000, COST_TUNNEL = 90;
        public const double UPKEEP_STATION = 110, UPKEEP_TUNNEL = 0.6;
        public const double FARE = 0.14;
        const double MODE_SHARE_METRO = 0.6;
        const double RIDERS_PER_TRIP = 40;
        const double SPEED_METRO = 9;

        public static readonly string[] METRO_COLORS = { "#263c96", "#3cb44a", "#ef7c1c", "#00a5de", "#996cac", "#cd7c2f", "#747f00", "#e6186c", "#bdb092" };

        public static string stopProblem(World w, string kind, int i, List<int> draft)
        {
            if (draft.Contains(i)) return "이미 고른 정류장이에요.";
            if (kind == "bus" && w.road[i] == 0 && w.roadAlt[i] != 0) return "터널, 지하차도, 고가도로 위에는 정류장을 둘 수 없어요. 앞뒤 도로에 놓으면 버스는 그 길로 지나가요.";
            if (kind == "bus") return w.road[i] == 0 ? "버스 정류장은 도로 위에 놓아요." : Roundabouts.roundaboutAt(w, (i % N) * CELL + CELL / 2.0, (i / N) * CELL + CELL / 2.0) != null ? "회전교차로 안에는 정류장을 둘 수 없어요. 앞뒤 도로에 놓아 주세요." : null;
            if (w.ground[i] == Ground.Water) return "역은 땅 위에 지어야 해요.";
            if (w.road[i] != 0) return "역은 도로가 아닌 빈 땅이나 구역에 지어요.";
            int id = w.bld[i];
            if (id >= 0 && KINDS[w.buildings[id].kind].zone == 0) return "다른 시설이 있어요.";
            return null;
        }

        public static double tunnelLength(int a, int b) => Geom.Hypot((a % N) - (b % N), (a / N) - (b / N));

        public static double lineCost(string kind, List<int> stops, string bus = "branch")
        {
            if (kind == "bus") { var c = BUS_TYPES[bus]; return c.costLine + stops.Count * c.costStop; }
            double tunnel = 0;
            for (int k = 1; k < stops.Count; k++) tunnel += tunnelLength(stops[k - 1], stops[k]);
            return stops.Count * COST_STATION + Math.Round(tunnel * COST_TUNNEL);
        }

        public static string busProblem(World w, string bus, List<int> stops)
        {
            var route = busRoute(w, stops);
            if (route == null) return "정류장끼리 도로로 이어져 있지 않아요.";
            var T = BUS_TYPES[bus];
            if (T.maxLoop != 0 && route.Length > T.maxLoop) return $"{T.name}는 한 바퀴 {T.maxLoop * CELL / 1000.0}km 안의 짧은 동네 노선이에요. 이 노선은 {(route.Length * CELL / 1000.0):0.0}km예요. 멀리 이으려면 지선버스나 간선버스를 쓰세요.";
            if (bus == "express" && !stops.Any(i => i % N <= 6)) return "광역버스는 도시 밖으로 나가는 노선이에요. 서쪽 고속도로 입구 가까이에 정류장을 하나 두세요.";
            return null;
        }

        static string lineName(World w, string kind, string bus)
        {
            int n = w.lines.Count(l => l.kind == kind && (kind == "metro" || busTypeOf(l) == bus));
            if (kind == "metro") return $"{n + 1}호선";
            string town = System.Text.RegularExpressions.Regex.Replace(w.name, "(시|군)$", "");
            if (bus == "village") return $"{town}{(n + 1).ToString().PadLeft(2, '0')}";
            if (bus == "trunk") return $"{(n % 7) + 1}{(20 + w.nextLine * 7 % 70).ToString().PadLeft(2, '0')}번";
            if (bus == "express") return $"9{100 + w.nextLine * 13 % 900}번";
            return $"{(n % 7) + 1}{100 + w.nextLine * 37 % 900}번";
        }

        public static string createLine(World w, string kind, List<int> stops, string bus = "branch")
        {
            if (stops.Count < 2) return "정류장을 두 곳 이상 골라 주세요.";
            for (int k = 0; k < stops.Count; k++) { var why = stopProblem(w, kind, stops[k], stops.GetRange(0, k)); if (why != null) return why; }
            double cost = lineCost(kind, stops, bus);
            if (cost > w.money) return $"예산이 부족해요. ({Won(cost)}만 원 필요)";
            if (kind == "bus") { var why = busProblem(w, bus, stops); if (why != null) return why; }
            w.money -= cost;
            int same = w.lines.Count(l => l.kind == kind);
            string color = kind == "bus" ? BUS_TYPES[bus].color : METRO_COLORS[same % METRO_COLORS.Length];
            string name = lineName(w, kind, bus);
            if (kind == "metro")
                foreach (int i in stops)
                {
                    if (w.bld[i] >= 0 && (!w.buildings.TryGetValue(w.bld[i], out var bb) || bb.kind != "metro")) Tools.demolish(w, w.bld[i]);
                    if (w.bld[i] < 0) Tools.addBuilding(w, "metro", i % N, i / N);
                    w.zone[i] = 0;
                }
            w.lines.Add(new TransitLine { id = w.nextLine++, kind = kind, name = name, color = color, stops = new List<int>(stops), bus = kind == "bus" ? bus : null });
            w.ver.transit++;
            w.ver.zones++;
            Network.invalidateNetwork();
            notify(w, $"{name} 개통! 정류장 {stops.Count}곳", "good");
            return null;
        }

        public static void removeLine(World w, int id)
        {
            var line = w.lines.Find(l => l.id == id);
            if (line == null) return;
            w.lines.Remove(line);
            if (line.kind == "metro")
                foreach (int i in line.stops)
                {
                    if (w.lines.Any(l => l.kind == "metro" && l.stops.Contains(i))) continue;
                    if (w.bld[i] >= 0 && w.buildings.TryGetValue(w.bld[i], out var b) && b.kind == "metro") Tools.demolish(w, b.id);
                }
            w.ver.transit++;
            notify(w, $"{line.name}을(를) 폐선했어요.", "info");
        }

        public static void pruneLines(World w)
        {
            bool changed = false;
            foreach (var l in w.lines)
            {
                var ok = l.stops.Where(i => l.kind == "bus" ? w.road[i] != Road.None : (w.bld[i] >= 0 && w.buildings.TryGetValue(w.bld[i], out var b) && b.kind == "metro")).ToList();
                if (ok.Count != l.stops.Count) { l.stops = ok; changed = true; }
            }
            var dead = w.lines.Where(l => l.stops.Count < 2).ToList();
            foreach (var l in dead) removeLine(w, l.id);
            if (changed && dead.Count == 0) w.ver.transit++;
        }

        // --------------------------------------------------------------- routes

        static readonly Dictionary<int, (string key, int[] path)> routeCache = new Dictionary<int, (string, int[])>();

        public static (int cell, (int x, int y) side) stopKerb(World w, int i)
        {
            bool road(int x, int y) => x >= 0 && y >= 0 && x < N && y < N && w.road[y * N + x] != 0;
            (int, int)? straight(int c)
            {
                int x = c % N, y = c / N;
                bool ew = road(x - 1, y) || road(x + 1, y), ns = road(x, y - 1) || road(x, y + 1);
                if (ew == ns) return null;
                var sides = ew ? new[] { (0, 1), (0, -1) } : new[] { (1, 0), (-1, 0) };
                foreach (var (dx, dy) in sides) if (!road(x + dx, y + dy)) return (dx, dy);
                return null;
            }
            var here = straight(i);
            if (here != null) return (i, here.Value);
            int x0 = i % N, y0 = i / N;
            foreach (var (dx, dy) in Curves.Orth)
            {
                if (!road(x0 + dx, y0 + dy)) continue;
                int c = (y0 + dy) * N + x0 + dx;
                var s = straight(c);
                if (s != null) return (c, s.Value);
            }
            return (i, (0, -1));
        }

        public static int[] busRoute(World w, List<int> stops, int lineId = -1)
        {
            string key = $"{w.ver.roads}:{string.Join(",", stops)}";
            if (lineId >= 0 && routeCache.TryGetValue(lineId, out var hit) && hit.key == key) return hit.path;
            var o = new List<int>();
            var loop = new List<int>(stops) { stops[0] };
            int[] path = null;
            for (int k = 1; k < loop.Count; k++)
            {
                var seg = bfs(w, loop[k - 1], loop[k]);
                if (seg == null) { o.Clear(); break; }
                if (o.Count > 0) o.AddRange(seg.Skip(1)); else o.AddRange(seg);
            }
            if (o.Count > 0) path = o.ToArray();
            if (lineId >= 0) routeCache[lineId] = (key, path);
            return path;
        }

        static List<int> bfs(World w, int a, int b)
        {
            if (a == b) return new List<int> { a };
            var prev = new int[N * N * 2];
            for (int i = 0; i < prev.Length; i++) prev[i] = -1;
            prev[a] = a;
            var q = new List<int> { a };
            for (int h = 0; h < q.Count; h++)
            {
                int c = q[h];
                if (c == b) break;
                Graph.forEachDriveStep(w, c, (n, _) => { if (prev[n] < 0) { prev[n] = c; q.Add(n); } });
            }
            if (prev[b] < 0) return null;
            var o = new List<int> { b };
            for (int c = b; c != a;) { c = prev[c]; o.Add(c); }
            o.Reverse();
            return o;
        }

        // -------------------------------------------------------------- coverage

        static string coverVer = "";
        static Dictionary<int, byte[]> coverLines = new Dictionary<int, byte[]>();
        static Dictionary<int, HashSet<int>> coverLinks = new Dictionary<int, HashSet<int>>();

        public static Dictionary<int, byte[]> coverage(World w)
        {
            string ver = $"{w.ver.transit}:{w.lines.Count}:{w.ver.roads}";
            if (coverVer == ver) return coverLines;
            var lines = new Dictionary<int, byte[]>();
            Array.Clear(w.transit, 0, w.transit.Length);
            foreach (var l in w.lines)
            {
                var m = new byte[N * N];
                int r = l.kind == "bus" ? BUS_TYPES[busTypeOf(l)].radius : STOP_RADIUS(l.kind);
                var route = l.kind == "bus" ? busRoute(w, l.stops, l.id) : null;
                var centres = new List<int>(l.stops);
                if (route != null) for (int k = 0; k < route.Length; k += 4) centres.Add(Graph.cellOf(route[k]));
                foreach (int s in centres)
                {
                    int sx = s % N, sy = s / N;
                    for (int y = Math.Max(0, sy - r); y <= Math.Min(N - 1, sy + r); y++)
                        for (int x = Math.Max(0, sx - r); x <= Math.Min(N - 1, sx + r); x++)
                        {
                            if (Geom.Hypot(x - sx, y - sy) > r) continue;
                            int i = idx(x, y);
                            m[i] = 1;
                            w.transit[i] = (byte)Math.Max(w.transit[i], l.kind == "metro" ? 2 : 1);
                        }
                }
                lines[l.id] = m;
            }
            var links = new Dictionary<int, HashSet<int>>();
            foreach (var a in w.lines)
            {
                var set = new HashSet<int>();
                foreach (var b in w.lines) if (a != b && (a.stops.Any(s => lines[b.id][s] != 0) || b.stops.Any(s => lines[a.id][s] != 0))) set.Add(b.id);
                links[a.id] = set;
            }
            coverVer = ver; coverLines = lines; coverLinks = links;
            return lines;
        }

        public static Dictionary<int, HashSet<int>> transferLinks(World w) { coverage(w); return coverLinks; }

        static double share(TransitLine l, bool outbound)
        {
            if (l.kind == "metro") return MODE_SHARE_METRO;
            string t = busTypeOf(l);
            if (t == "express") return outbound ? BUS_TYPES["express"].share : 0.06;
            return outbound ? BUS_TYPES[t].share * 0.3 : BUS_TYPES[t].share;
        }
        static double speed(TransitLine l) => l.kind == "metro" ? SPEED_METRO : BUS_TYPES[busTypeOf(l)].speed;

        public static double? tryTransit(World w, int from, int to, double roll, bool outbound = false)
        {
            if (w.lines.Count == 0) return null;
            var cov = coverage(w);
            int d = Math.Abs((from % N) - (to % N)) + Math.Abs((from / N) - (to / N));
            bool at(TransitLine l, int c) => cov[l.id][c] == 1 || (outbound && l.kind == "bus" && busTypeOf(l) == "express" && c % N == 0);
            var cands = w.lines.Where(l => cov.ContainsKey(l.id) && at(l, from) && at(l, to)).OrderByDescending(l => share(l, outbound)).ToList();
            bool feeder(TransitLine l) => l.kind == "bus" && busTypeOf(l) == "village";
            foreach (var l in cands)
            {
                double p = share(l, outbound);
                if (roll < p) { l.ridersMonth += RIDERS_PER_TRIP; return d / speed(l) + 2.5; }
                roll = (roll - p) / (1 - p);
            }
            var links = coverLinks;
            var starts = w.lines.Where(l => cov.ContainsKey(l.id) && at(l, from)).OrderByDescending(l => feeder(l) ? 1 : 0).ToList();
            foreach (var a in starts)
            {
                if (!links.TryGetValue(a.id, out var set)) continue;
                foreach (int bId in set)
                {
                    var b = w.lines.Find(l => l.id == bId);
                    if (!at(b, to) || at(a, to)) continue;
                    double ease = w.transferDiscount ? (feeder(a) && b.kind == "metro" ? 1 : 0.75) : 0.25;
                    double p = Math.Min(share(a, false), share(b, outbound)) * ease;
                    if (roll < p)
                    {
                        a.ridersMonth += RIDERS_PER_TRIP;
                        b.ridersMonth += RIDERS_PER_TRIP;
                        w.transfersMonth += RIDERS_PER_TRIP;
                        return d / Math.Min(speed(a), speed(b)) + 6;
                    }
                    roll = (roll - p) / (1 - p);
                }
            }
            return null;
        }

        // -------------------------------------------------------------- 역세권

        public const int STATION_AREA = 25;
        static string areaVer = ""; static byte[] areaM = new byte[0];

        public static byte[] stationArea(World w)
        {
            string ver = $"{w.ver.transit}:{w.lines.Count}";
            if (areaVer == ver && areaM.Length == N * N) return areaM;
            var m = new byte[N * N]; int r = STATION_AREA;
            foreach (int s in stationCells(w))
            {
                int sx = s % N, sy = s / N;
                for (int y = Math.Max(0, sy - r); y <= Math.Min(N - 1, sy + r); y++)
                    for (int x = Math.Max(0, sx - r); x <= Math.Min(N - 1, sx + r); x++) if ((x - sx) * (x - sx) + (y - sy) * (y - sy) <= r * r) m[idx(x, y)] = 1;
            }
            areaVer = ver; areaM = m;
            return m;
        }

        public static List<int> stationCells(World w) => w.lines.Where(l => l.kind == "metro").SelectMany(l => l.stops).Distinct().ToList();

        public static (double pop, double jobs, double share, int stations) stationAreaStats(World w)
        {
            var m = stationArea(w);
            double pop = 0, jobs = 0;
            foreach (var b in w.buildings.Values)
            {
                var d = KINDS[b.kind];
                if (d.zone == 0 || m[idx(b.x, b.y)] == 0) continue;
                if (d.hasResidents) pop += b.occ; else jobs += b.occ;
            }
            return (Math.Round(pop), Math.Round(jobs), w.stats.pop != 0 ? pop / w.stats.pop : 0, stationCells(w).Count);
        }

        public static void transitLandBonus(World w, float[] bonus)
        {
            int r = STATION_AREA;
            foreach (int s in stationCells(w))
            {
                int sx = s % N, sy = s / N;
                for (int y = Math.Max(0, sy - r); y <= Math.Min(N - 1, sy + r); y++)
                    for (int x = Math.Max(0, sx - r); x <= Math.Min(N - 1, sx + r); x++)
                    {
                        double d = Geom.Hypot(x - sx, y - sy);
                        if (d <= r) bonus[idx(x, y)] = (float)Math.Max(bonus[idx(x, y)], 5 * (1 - d / (r + 1)));
                    }
            }
            foreach (var l in w.lines)
            {
                int rr = l.kind == "metro" ? 6 : 3; double v = l.kind == "metro" ? 12 : 3;
                foreach (int s in l.stops)
                {
                    int sx = s % N, sy = s / N;
                    for (int y = Math.Max(0, sy - rr); y <= Math.Min(N - 1, sy + rr); y++)
                        for (int x = Math.Max(0, sx - rr); x <= Math.Min(N - 1, sx + rr); x++)
                        {
                            double d = Geom.Hypot(x - sx, y - sy);
                            if (d <= rr) bonus[idx(x, y)] = (float)Math.Max(bonus[idx(x, y)], v * (1 - d / (rr + 1)));
                        }
                }
            }
        }

        // --------------------------------------------------------------- economy

        public static int busCount(World w, TransitLine l)
        {
            if (l.kind != "bus") return 0;
            var p = busRoute(w, l.stops, l.id);
            return p != null ? Math.Max(1, (int)Math.Floor(p.Length / (double)BUS_TYPES[busTypeOf(l)].cellsPerBus + 0.5)) : 0;
        }

        public static double lineUpkeep(World w, TransitLine l)
        {
            if (l.kind == "bus") return busCount(w, l) * BUS_TYPES[busTypeOf(l)].upkeep;
            double t = 0;
            for (int k = 1; k < l.stops.Count; k++) t += tunnelLength(l.stops[k - 1], l.stops[k]);
            return l.stops.Count * UPKEEP_STATION + t * UPKEEP_TUNNEL;
        }

        public static void closeTransitMonth(World w)
        {
            foreach (var l in w.lines) { l.riders = l.ridersMonth; l.ridersMonth = 0; }
            w.transfers = w.transfersMonth;
            w.transfersMonth = 0;
        }

        public static double fareIncome(World w) => (w.lines.Sum(l => l.ridersMonth) - (w.transferDiscount ? w.transfersMonth : 0)) * FARE;

        public static double metroPathLength(TransitLine l)
        {
            double t = 0;
            for (int k = 1; k < l.stops.Count; k++) t += tunnelLength(l.stops[k - 1], l.stops[k]);
            return t * CELL;
        }
    }
}
