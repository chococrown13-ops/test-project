using System;
using System.Collections.Generic;
using System.Linq;
using static NaeDosi.Defs;
using static NaeDosi.WorldOps;

namespace NaeDosi
{
    /// <summary>What the player can build and change: roads of every kind, zones, facilities, the bulldozer (port of sim/tools.ts).</summary>
    public static class Tools
    {
        static int Sign(int v) => Math.Sign(v);

        public static List<int> roadPath(int x0, int y0, int x1, int y1)
        {
            var cells = new List<int>();
            bool horizFirst = Math.Abs(x1 - x0) >= Math.Abs(y1 - y0);
            int sx = Sign(x1 - x0), sy = Sign(y1 - y0);
            int x = x0, y = y0;
            void push() { if (inside(x, y)) cells.Add(idx(x, y)); }
            push();
            if (horizFirst) { while (x != x1) { x += sx; push(); } while (y != y1) { y += sy; push(); } }
            else { while (y != y1) { y += sy; push(); } while (x != x1) { x += sx; push(); } }
            return cells;
        }

        public static List<int> diagonalPath(int x0, int y0, int x1, int y1)
        {
            var cells = new List<int>();
            int sx = Sign(x1 - x0), sy = Sign(y1 - y0);
            int n = Math.Min(Math.Abs(x1 - x0), Math.Abs(y1 - y0));
            int x = x0, y = y0;
            void push() { if (inside(x, y)) cells.Add(idx(x, y)); }
            push();
            for (int k = 0; k < n; k++) { x += sx; y += sy; push(); }
            while (x != x1) { x += sx; push(); }
            while (y != y1) { y += sy; push(); }
            return cells;
        }

        public static bool altBlocksGround(World w, int i) => w.roadAlt[i] != Road.None && (w.altLevel[i] == Level.Elevated || Graph.isRamp(w, i));

        public static double roadCost(World w, List<int> cells, int type)
        {
            double c = 0;
            foreach (int i in cells)
            {
                int cur = w.road[i];
                if (cur >= type) continue;
                double b = ROAD_COST(type) - (cur != 0 ? ROAD_COST(cur) : 0);
                c += b * (w.ground[i] == Ground.Water ? BRIDGE_MULT : 1);
            }
            return c;
        }

        public static bool roadBlocked(World w, List<int> cells) => cells.Any(i => { int id = w.bld[i]; return id >= 0 && KINDS[w.buildings[id].kind].zone == 0; });

        public static string placeRoad(World w, List<int> cells, int type, bool grid = true)
        {
            if (cells.Count == 0) return null;
            if (grid) { var why = Roundabouts.gridMeetProblem(w, cells); if (why != null) return why; }
            if (cells.Any(i => w.ground[i] == Ground.Mountain)) return "산에는 터널로만 길을 낼 수 있어요.";
            if (cells.Any(i => w.roadAlt[i] != 0 && Graph.isRamp(w, i))) return "고가도로나 지하도로의 진입로와 겹쳐요.";
            if (roadBlocked(w, cells)) return "시설물이 있는 곳에는 도로를 놓을 수 없어요.";
            if (type == Road.Highway && cells.Any(i => w.road[i] != 0 && w.road[i] != Road.Highway)) return "고속도로는 다른 도로와 평면으로 만날 수 없어요. 고가도로나 지하차도로 넘기고, 이을 곳에는 나들목을 두세요.";
            if (type != Road.Highway && cells.Any(i => w.road[i] == Road.Highway)) return "고속도로를 가로지르는 길은 고가도로나 지하차도로 놓아 주세요.";
            double cost = roadCost(w, cells, type);
            if (cost > w.money) return $"예산이 부족해요. ({Won(cost)}만 원 필요)";
            w.money -= cost;
            foreach (int i in cells)
            {
                if (w.bld[i] >= 0) demolish(w, w.bld[i]);
                w.zone[i] = Zone.None;
                if (w.road[i] < type) w.road[i] = (byte)type;
            }
            for (int k = 1; k < cells.Count; k++)
            {
                int a = cells[k - 1], b = cells[k];
                int dx = (b % N) - (a % N), dy = (b / N) - (a / N);
                if (dx == 0 || dy == 0) continue;
                int bit = Graph.DIAG.First(d => d.dx == dx && d.dy == dy).bit;
                w.diag[a] |= (byte)bit;
                w.diag[b] |= (byte)Graph.oppositeDiag(bit);
            }
            if (type == Road.Street) pairCarriageways(w, cells);
            w.ver.roads++;
            w.ver.zones++;
            Network.invalidateNetwork();
            return null;
        }

        static bool runsAlong(World w, int i, int axis)
        {
            int x = i % N, y = i / N;
            if (w.road[i] == 0 || w.road[i] != Road.Street) return false;
            return axis == 0 ? x > 0 && x < N - 1 && w.road[i - 1] != 0 && w.road[i + 1] != 0 : y > 0 && y < N - 1 && w.road[i - N] != 0 && w.road[i + N] != 0;
        }

        public static void pairCarriageways(World w, List<int> cells)
        {
            foreach (int i in cells)
                for (int axis = 0; axis <= 1; axis++)
                {
                    if (!runsAlong(w, i, axis)) continue;
                    foreach (int side in new[] { -1, 1 })
                    {
                        int j = axis == 0 ? i + side * N : i + side;
                        if (j < 0 || j >= N * N || (axis == 1 && ((j % N) - (i % N)) != side) || !runsAlong(w, j, axis)) continue;
                        int lo = side > 0 ? i : j, hi = side > 0 ? j : i;
                        if (axis == 0) { w.oneway[lo] = 3; w.oneway[hi] = 1; } else { w.oneway[lo] = 2; w.oneway[hi] = 4; }
                    }
                }
        }

        public static string placeHighwayPart(World w, int i, string part)
        {
            if (w.road[i] != Road.Highway) return "고속도로 위를 눌러 주세요.";
            int x = i % N, y = i / N;
            var nb = new List<int>();
            foreach (var (dx, dy) in new[] { (1, 0), (-1, 0), (0, 1), (0, -1) }) if (inside(x + dx, y + dy)) nb.Add(idx(x + dx, y + dy));
            if (part == "ic")
            {
                if ((w.hwy[i] & 1) != 0) return "이미 나들목이에요.";
                if (!nb.Any(n => w.road[n] != 0 && w.road[n] != Road.Highway)) return "나들목은 일반 도로와 바로 붙은 고속도로 칸에 둘 수 있어요. 옆에 도로를 먼저 내 주세요.";
                if (IC_COST > w.money) return $"예산이 부족해요. ({Won(IC_COST)}만 원 필요)";
                w.money -= IC_COST;
                w.hwy[i] |= 1;
            }
            else
            {
                if ((w.hwy[i] & 2) != 0) return "이미 톨게이트가 있어요.";
                var hw = nb.Where(n => w.road[n] == Road.Highway).ToList();
                bool straight = hw.Count == 2 && ((hw[0] % N) == (hw[1] % N) || (hw[0] / N) == (hw[1] / N));
                if (!straight || (w.hwy[i] & 1) != 0) return "톨게이트는 고속도로가 곧게 뻗은 칸에 둘 수 있어요 (나들목이나 분기점 말고).";
                if (TOLL_COST > w.money) return $"예산이 부족해요. ({Won(TOLL_COST)}만 원 필요)";
                w.money -= TOLL_COST;
                w.hwy[i] |= 2;
            }
            w.ver.roads++;
            Network.invalidateNetwork();
            return null;
        }

        public const double ONEWAY_COST = 20;

        public static string setOneWay(World w, List<int> cells)
        {
            if (cells.Count < 2) return "도로를 따라 두 칸 이상 끌어 주세요.";
            int a = cells[0], b = cells[cells.Count - 1];
            int dx = Sign((b % N) - (a % N)), dy = Sign((b / N) - (a / N));
            if (dx != 0 && dy != 0) return "일방통행은 곧은 길에만 정할 수 있어요.";
            int code = dx > 0 ? 1 : dx < 0 ? 3 : dy > 0 ? 2 : 4;
            var on = cells.Where(i => w.road[i] != 0 && w.road[i] != Road.Highway && w.roadAlt[i] == 0).ToList();
            if (on.Count == 0) return "도로 위로 끌어 주세요.";
            bool undo = on.All(i => w.oneway[i] == code);
            double cost = undo ? 0 : on.Count * ONEWAY_COST;
            if (cost > w.money) return $"예산이 부족해요. ({Won(cost)}만 원 필요)";
            w.money -= cost;
            foreach (int i in on) w.oneway[i] = (byte)(undo ? 0 : code);
            w.ver.roads++;
            Network.invalidateNetwork();
            return null;
        }

        public static string widenRoad(World w, List<int> cells)
        {
            var grid = cells.Where(i => w.road[i] == Road.Street).ToList();
            var touched = w.curves.Where(c => c.t == Road.Street && c.cells.Any(i => cells.Contains(i))).ToList();
            var all = new List<int>(grid); var set = new HashSet<int>(grid);
            foreach (var c in touched) foreach (int i in c.cells) if (w.road[i] == Road.Street && set.Add(i)) all.Add(i);
            if (all.Count == 0) return "넓힐 일반 도로가 없어요. 일반 도로 위로 끌어 주세요.";
            if (all.Any(i => w.ground[i] == Ground.Mountain)) return "산 속 길은 넓힐 수 없어요.";
            double cost = roadCost(w, all, Road.Avenue);
            if (cost > w.money) return $"예산이 부족해요. ({Won(cost)}만 원 필요)";
            w.money -= cost;
            foreach (int i in all) { w.road[i] = Road.Avenue; w.oneway[i] = 0; w.hwy[i] = 0; }
            foreach (var c in touched)
            {
                c.t = Road.Avenue;
                foreach (int i in Curves.coverCells(c))
                {
                    if (w.road[i] != 0) continue;
                    int id = w.bld[i];
                    if (id >= 0 && KINDS[w.buildings[id].kind].zone != 0) demolish(w, id);
                    w.zone[i] = Zone.None;
                }
            }
            w.ver.roads++;
            w.ver.zones++;
            Network.invalidateNetwork();
            return null;
        }

        public static List<int> altCells(World w, List<int> cells)
        {
            int a = 0, b = cells.Count - 1;
            while (a <= b && w.road[cells[a]] != 0) a++;
            while (b >= a && w.road[cells[b]] != 0) b--;
            if (b - a + 1 < 2 && cells.Count >= 4) return cells.GetRange(1, cells.Count - 2);
            return b >= a ? cells.GetRange(a, b - a + 1) : new List<int>();
        }

        public static double altCost(World w, List<int> cells, int level)
        {
            double c = 0;
            foreach (int i in cells)
            {
                if (w.roadAlt[i] != 0 && w.altLevel[i] == level) continue;
                double under = level == Level.Tunnel && w.ground[i] != Ground.Land ? 1.5 : 1;
                c += ROAD_COST(Road.Avenue) * LEVEL_COST(level) * under;
            }
            return Math.Round(c);
        }

        public static string altProblem(World w, List<int> cells, int level)
        {
            string name = LEVEL_NAME[level];
            if (cells.Count < 2) return $"{name}는 두 칸 이상이어야 해요. 도로 끝에서 끝까지 끌어 주세요.";
            if (level == Level.Elevated && cells.Count < 4) return "고가도로는 네 칸 이상이어야 해요. 진입로가 양쪽에 두 칸씩 필요해요.";
            if (level == Level.Elevated)
                foreach (int k in new[] { 1, cells.Count - 2 })
                {
                    int i = cells[k];
                    int x = i % N, y = i / N;
                    if (w.road[i] != 0 && new[] { (1, 0), (-1, 0), (0, 1), (0, -1) }.Any(d => inside(x + d.Item1, y + d.Item2) && w.road[idx(x + d.Item1, y + d.Item2)] != 0 && !cells.Contains(idx(x + d.Item1, y + d.Item2))))
                        return "진입로 자리에 다른 길이 지나가요. 고가도로를 조금 옮겨 주세요.";
                }
            int e0 = cells[0], e1 = cells[cells.Count - 1];
            foreach (int i in cells)
            {
                if (w.roadAlt[i] != 0 && w.altLevel[i] != level) return "다른 층의 도로와 겹쳐요.";
                int g = w.ground[i];
                bool end = i == e0 || i == e1;
                if (end && (g == Ground.Water || (g == Ground.Mountain && level != Level.Tunnel))) return $"{name} 진입로는 평지에 놓아야 해요.";
                if (level == Level.Elevated && g == Ground.Mountain) return "산은 고가도로로 넘을 수 없어요. 터널을 뚫어 주세요.";
                if (level == Level.Underpass && g != Ground.Land) return "지하차도는 강이나 산 밑으로 못 가요. 터널을 쓰세요.";
                if ((end || level == Level.Elevated) && roadBlocked(w, new List<int> { i })) return "시설물이 있는 곳을 지나갈 수 없어요.";
                if (end && w.road[i] != 0 && edgeLink(i)) return "도시 밖으로 나가는 길은 바꿀 수 없어요.";
            }
            double cost = altCost(w, cells, level);
            if (cost > w.money) return $"예산이 부족해요. ({Won(cost)}만 원 필요)";
            return null;
        }

        public static string placeAltRoad(World w, List<int> drag, int level)
        {
            var cells = altCells(w, drag);
            var why = altProblem(w, cells, level);
            if (why != null) return why;
            w.money -= altCost(w, cells, level);
            for (int k = 0; k < cells.Count; k++)
            {
                int i = cells[k];
                bool end = k == 0 || k == cells.Count - 1;
                if (end || level == Level.Elevated)
                {
                    if (w.bld[i] >= 0) demolish(w, w.bld[i]);
                    w.zone[i] = Zone.None;
                }
                bool ramp = end || (level == Level.Elevated && (k == 1 || k == cells.Count - 2));
                if (ramp && w.road[i] != 0)
                {
                    w.road[i] = Road.None;
                    int x = i % N, y = i / N;
                    foreach (var (dx, dy, bit) in Graph.DIAG) if ((w.diag[i] & bit) != 0 && inside(x + dx, y + dy)) w.diag[idx(x + dx, y + dy)] &= (byte)~Graph.oppositeDiag(bit);
                    w.diag[i] = 0;
                    w.oneway[i] = 0;
                    w.hwy[i] = 0;
                }
                w.roadAlt[i] = Road.Avenue;
                w.altLevel[i] = (byte)level;
            }
            Curves.pruneCurves(w);
            w.ver.roads++;
            w.ver.zones++;
            Network.invalidateNetwork();
            notify(w, $"{LEVEL_NAME[level]} {cells.Count * 10}m를 놓았어요.", "good");
            return null;
        }

        public static int roadDistance(World w, int x, int y)
        {
            int best = 99;
            foreach (var (dx, dy) in Curves.Orth)
                for (int d = 1; d <= ZONE_DEPTH; d++)
                {
                    int nx = x + dx * d, ny = y + dy * d;
                    if (!inside(nx, ny)) break;
                    int i = idx(nx, ny);
                    if (w.road[i] == Road.Highway) break;
                    if (w.road[i] != 0) { best = Math.Min(best, d); break; }
                    if (w.ground[i] == Ground.Water) break;
                }
            return best;
        }

        public static List<int> rectCells(int x0, int y0, int x1, int y1)
        {
            var o = new List<int>();
            for (int y = Math.Max(0, Math.Min(y0, y1)); y <= Math.Min(N - 1, Math.Max(y0, y1)); y++)
                for (int x = Math.Max(0, Math.Min(x0, x1)); x <= Math.Min(N - 1, Math.Max(x0, x1)); x++) o.Add(idx(x, y));
            return o;
        }

        static bool besideSlantJunction(World w, int i)
        {
            int x = i % N, y = i / N;
            foreach (var (dx, dy) in Curves.Orth)
            {
                int nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
                int c = ny * N + nx;
                if (w.road[c] == 0 || w.diag[c] == 0) continue;
                int deg = 0;
                for (int b = 0; b < 4; b++) if ((w.diag[c] & (1 << b)) != 0) deg++;
                foreach (var (ex, ey) in Curves.Orth) { int mx = nx + ex, my = ny + ey; if (mx >= 0 && my >= 0 && mx < N && my < N && w.road[my * N + mx] != 0) deg++; }
                if (deg >= 3) return true;
            }
            return false;
        }

        public static bool zoneable(World w, int i)
        {
            if (w.road[i] != 0 || w.ground[i] != Ground.Land || altBlocksGround(w, i) || Curves.curveInfo(w).cover[i] != 0 || besideSlantJunction(w, i)) return false;
            int id = w.bld[i];
            if (id >= 0 && KINDS[w.buildings[id].kind].zone == 0) return false;
            return roadDistance(w, i % N, i / N) <= ZONE_DEPTH;
        }

        public static int paintZone(World w, List<int> cells, int z)
        {
            int n = 0;
            foreach (int i in cells)
            {
                if (z == Zone.None)
                {
                    if (w.zone[i] != 0) { w.zone[i] = Zone.None; n++; }
                    int bid = w.bld[i];
                    if (bid >= 0 && KINDS[w.buildings[bid].kind].zone != 0) demolish(w, bid);
                    continue;
                }
                if (!zoneable(w, i) || w.zone[i] == z) continue;
                int id = w.bld[i];
                if (id >= 0) demolish(w, id);
                w.zone[i] = (byte)z;
                n++;
            }
            if (n > 0) w.ver.zones++;
            return n;
        }

        public static List<int> footprint(int x, int y, int size, int depth = -1)
        {
            if (depth < 0) depth = size;
            var o = new List<int>();
            for (int dy = 0; dy < depth; dy++) for (int dx = 0; dx < size; dx++) if (inside(x + dx, y + dy)) o.Add(idx(x + dx, y + dy));
            return o;
        }

        public static string placeProblem(World w, string kind, int x, int y)
        {
            var d = KINDS[kind];
            if (!inside(x, y) || !inside(x + d.size - 1, y + d.size - 1)) return "지도 밖이에요.";
            var cells = footprint(x, y, d.size);
            if (Array.IndexOf(UNIQUE, kind) >= 0 && w.buildings.Values.Any(b => b.kind == kind)) return $"{d.name}은(는) 도시에 하나만 지을 수 있어요.";
            var ci = Curves.curveInfo(w);
            foreach (int i in cells)
            {
                if (w.ground[i] == Ground.Water) return "물 위에는 지을 수 없어요.";
                if (kind == "tower" ? w.ground[i] != Ground.Mountain : w.ground[i] == Ground.Mountain) return kind == "tower" ? "전망타워는 산 위에 지어야 해요." : "산에는 지을 수 없어요.";
                if (w.road[i] != 0 || altBlocksGround(w, i) || ci.cover[i] != 0) return "도로 위에는 지을 수 없어요.";
                int id = w.bld[i];
                if (id >= 0 && KINDS[w.buildings[id].kind].zone == 0) return "다른 시설이 있어요.";
            }
            var special = Attractions.attractionProblem(w, kind, x, y, d.size) ?? Special.specProblem(w, kind);
            if (special != null) return special;
            if (kind == "water" && !hasOpenWater(w)) return "이 땅에는 끌어 쓸 물가가 없어요. 지하수 관정을 지어 주세요.";
            if (kind == "water" && !nearWater(w, x, y, d.size, 2)) return "정수장은 물가(2칸 이내)에 지어야 해요.";
            if (kind == "riverpark" && !nearWater(w, x, y, d.size, 1)) return "수변공원은 물에 붙여 지어야 해요.";
            if (d.cost > w.money) return $"예산이 부족해요. ({Won(d.cost)}만 원 필요)";
            return null;
        }

        static bool nearWater(World w, int x, int y, int size, int r)
        {
            for (int yy = y - r; yy < y + size + r; yy++) for (int xx = x - r; xx < x + size + r; xx++)
                    if (inside(xx, yy) && w.ground[idx(xx, yy)] == Ground.Water) return true;
            return false;
        }

        public static string placeFacility(World w, string kind, int x, int y)
        {
            var why = placeProblem(w, kind, x, y);
            if (why != null) return why;
            var d = KINDS[kind];
            w.money -= d.cost;
            foreach (int i in footprint(x, y, d.size)) { if (w.bld[i] >= 0) demolish(w, w.bld[i]); w.zone[i] = Zone.None; }
            var b = addBuilding(w, kind, x, y);
            w.ver.zones++;
            if (Network.findAccess(w, b) < 0) notify(w, $"{d.name}이(가) 도로와 떨어져 있어요. 도로를 연결해야 작동해요.", "warn");
            else notify(w, $"{d.name}을(를) 지었어요.", "good");
            return null;
        }

        public static Building addBuilding(World w, string kind, int x, int y, int sx = 0, int sy = 0)
        {
            var d = KINDS[kind];
            int lo = d.floorsLo, hi = d.floorsHi;
            var b = new Building
            {
                id = w.nextId++, kind = kind, x = x, y = y, size = d.size,
                floors = lo + (int)Math.Floor(rand(w) * (hi - lo + 1)),
                look = rand(w), occ = 0, happy = 60, builtDay = w.day,
            };
            if ((sx != 0 && sx != d.size) || (sy != 0 && sy != d.size)) { b.sx = sx != 0 ? sx : d.size; b.sy = sy != 0 ? sy : d.size; }
            w.buildings[b.id] = b;
            foreach (int i in footprint(x, y, bw(b), bh(b))) w.bld[i] = b.id;
            w.ver.buildings++;
            Network.invalidateNetwork();
            return b;
        }

        public static void demolish(World w, int id)
        {
            if (!w.buildings.TryGetValue(id, out var b)) return;
            foreach (int i in footprint(b.x, b.y, bw(b), bh(b))) if (w.bld[i] == id) w.bld[i] = -1;
            w.buildings.Remove(id);
            w.ver.buildings++;
            Network.invalidateNetwork();
        }

        public static int bulldoze(World w, List<int> cells)
        {
            int n = 0;
            var ids = new List<int>(); var seen = new HashSet<int>();
            foreach (int i in cells) if (w.bld[i] >= 0 && seen.Add(w.bld[i])) ids.Add(w.bld[i]);
            foreach (int id in ids) { demolish(w, id); n++; }
            if (n == 0)
            {
                int roads = 0;
                if (cells.Any(i => w.roadAlt[i] != 0))
                {
                    foreach (int i in cells) if (w.roadAlt[i] != 0) { w.roadAlt[i] = Road.None; w.altLevel[i] = Level.None; roads++; }
                }
                else
                {
                    foreach (int i in cells)
                    {
                        if (w.road[i] == 0 || edgeLink(i)) continue;
                        w.road[i] = Road.None;
                        w.trees[i] = 0;
                        int x = i % N, y = i / N;
                        foreach (var (dx, dy, bit) in Graph.DIAG)
                        {
                            if ((w.diag[i] & bit) == 0 || !inside(x + dx, y + dy)) continue;
                            w.diag[idx(x + dx, y + dy)] &= (byte)~Graph.oppositeDiag(bit);
                        }
                        w.diag[i] = 0;
                        w.oneway[i] = 0;
                        w.hwy[i] = 0;
                        roads++;
                    }
                }
                if (roads > 0) { Curves.pruneCurves(w); Roundabouts.pruneRoundabouts(w); w.ver.roads++; Network.invalidateNetwork(); }
                n += roads;
            }
            return n;
        }

        static bool edgeLink(int i) => i % N <= 1;

        public static Curve curveOf(int a, int b, double cx, double cz, int type)
        {
            const double C = 10;
            return new Curve { ax = (a % N) * C + C / 2, az = (a / N) * C + C / 2, cx = cx, cz = cz, bx = (b % N) * C + C / 2, bz = (b / N) * C + C / 2, t = type };
        }

        public static string placeCurve(World w, int a, int b, double cx, double cz, int type)
        {
            var c = curveOf(a, b, cx, cz, type);
            var cells = Curves.curveCells(c);
            var why = Curves.curveProblem(w, c, cells);
            if (why != null) return why;
            var had = cells.Select(i => w.road[i]).ToList();
            var err = placeRoad(w, cells, type, false);
            if (err != null) return err;
            var own = new List<int>();
            for (int k = 0; k < cells.Count; k++) if (had[k] == 0 && k > 0 && k < cells.Count - 1) own.Add(cells[k]);
            foreach (int i in Curves.coverCells(c))
            {
                if (w.road[i] != 0) continue;
                int id = w.bld[i];
                if (id >= 0 && KINDS[w.buildings[id].kind].zone != 0) demolish(w, id);
                w.zone[i] = Zone.None;
            }
            c.cells = cells; c.own = own;
            w.curves.Add(c);
            w.ver.roads++;
            w.ver.zones++;
            return null;
        }

        public static (List<int> cells, double cost, double length) curveCost(World w, int a, int b, double cx, double cz, int type)
        {
            var c = curveOf(a, b, cx, cz, type);
            var cells = Curves.curveCells(c);
            return (cells, roadCost(w, cells, type), Math.Round(Curves.bezLength(c)));
        }

        static World waterW; static bool waterHas;
        public static bool hasOpenWater(World w)
        {
            if (waterW == w) return waterHas;
            waterW = w; waterHas = false;
            int s = KINDS["water"].size;
            for (int y = 0; y + s <= N && !waterHas; y++) for (int x = 0; x + s <= N && !waterHas; x++)
                    if (footprint(x, y, s).All(i => w.ground[i] == Ground.Land) && nearWater(w, x, y, s, 2)) waterHas = true;
            return waterHas;
        }

        public static string placeRoundabout(World w, int cell) => Roundabouts.placeRoundabout(w, cell);

        public const double TREE_COST = 5;

        public static List<int> treeCells(World w, List<int> cells) => cells.Where(i => w.road[i] != 0 && w.ground[i] == Ground.Land && !(w.roadAlt[i] != 0 && Graph.isRamp(w, i))).ToList();

        /// <summary>Plant 가로수 along the roads in the box, or take them out if all are planted. Error text, or null with counts.</summary>
        public static string plantTrees(World w, List<int> cells, out int planted, out int removed)
        {
            planted = removed = 0;
            var ok = treeCells(w, cells);
            if (ok.Count == 0) return "가로수는 도로를 따라 심어요. 도로 위를 끌어 주세요.";
            var todo = ok.Where(i => w.trees[i] == 0).ToList();
            if (todo.Count == 0)
            {
                foreach (int i in ok) w.trees[i] = 0;
                w.ver.roads++;
                removed = ok.Count;
                return null;
            }
            double cost = todo.Count * TREE_COST;
            if (cost > w.money) return $"예산이 부족해요. ({Won(cost)}만 원 필요)";
            w.money -= cost;
            foreach (int i in todo) w.trees[i] = 1;
            w.ver.roads++;
            planted = todo.Count;
            return null;
        }
    }
}
