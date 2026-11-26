using System;
using System.Collections.Generic;
using static NaeDosi.Defs;
using static NaeDosi.WorldOps;

namespace NaeDosi
{
    /// <summary>
    /// Lots with no street frontage stay open as the block's shared space, 동네 쉼터 (port of sim/pockets.ts).
    /// </summary>
    public static class Pockets
    {
        public static bool onRoad(World w, int i)
        {
            int x = i % N, y = i / N;
            foreach (var (dx, dy) in Curves.Orth)
            {
                int nx = x + dx, ny = y + dy;
                if (inside(nx, ny) && w.road[idx(nx, ny)] != 0 && w.road[idx(nx, ny)] != 3) return true;
            }
            return false;
        }

        public static bool fronts(World w, int bx, int by, int W, int H)
        {
            for (int y = by; y < by + H; y++) for (int x = bx; x < bx + W; x++) if (onRoad(w, idx(x, y))) return true;
            return false;
        }
        public static bool fronts(World w, Building b) => fronts(w, b.x, b.y, bw(b), bh(b));

        public static readonly Dictionary<string, string> POCKET_NAME = new Dictionary<string, string>
        { ["green"] = "녹지", ["park"] = "소공원", ["play"] = "놀이터", ["garden"] = "주말 텃밭", ["empty"] = "공터" };

        public static string pocketKind(int i)
        {
            int x = i % N, y = i / N;
            double h = Math.Sin(Math.Floor(x / 2.0) * 12.9898 + Math.Floor(y / 2.0) * 78.233) * 43758.5453;
            double r = h - Math.Floor(h);
            return r < 0.3 ? "green" : r < 0.52 ? "park" : r < 0.7 ? "play" : r < 0.86 ? "garden" : "empty";
        }

        public static bool isPocket(World w, int i) => w.zone[i] != 0 && w.road[i] == 0 && w.bld[i] < 0 && w.ground[i] == Ground.Land && !onRoad(w, i);

        static string cacheKey = ""; static World cacheW; static List<int> cache = new List<int>();
        public static List<int> pockets(World w)
        {
            string key = $"{w.ver.roads}:{w.ver.zones}:{w.ver.buildings}";
            if (cacheW == w && key == cacheKey) return cache;
            cache = new List<int>();
            for (int i = 0; i < N * N; i++) if (isPocket(w, i)) cache.Add(i);
            cacheW = w; cacheKey = key;
            return cache;
        }

        public static Building clearBackland(World w, double roll)
        {
            if (roll > 0.15) return null;
            foreach (var b in w.buildings.Values)
            {
                var d = KINDS[b.kind];
                if (d.zone == 0 || (d.level == 0 ? 1 : d.level) >= 3 || bw(b) * bh(b) > 2 || fronts(w, b)) continue;
                return b;
            }
            return null;
        }

        public static (double x, double z) cellCentre(int i) => ((i % N) * CELL + CELL / 2.0, (i / N) * CELL + CELL / 2.0);
    }

    /// <summary>
    /// Road connectivity and the utility grids (port of sim/network.ts). Water mains and power cables run
    /// under the roads, so a building is on a grid when its access road shares a network with a plant.
    /// </summary>
    public static class Network
    {
        public sealed class Net
        {
            public string ver;
            public int[] comp;
            public HashSet<int> outside;
            public Dictionary<int, int> access;
        }

        static Net cache;

        public static Net network(World w)
        {
            string ver = $"{w.ver.roads}:{w.ver.buildings}";
            if (cache != null && cache.ver == ver) return cache;
            int NN = Graph.NN;
            var comp = new int[NN * 2];
            for (int i = 0; i < comp.Length; i++) comp[i] = -1;
            var outside = new HashSet<int>();
            int next = 0;
            var stack = new Stack<int>();
            for (int s = 0; s < NN * 2; s++)
            {
                if (comp[s] >= 0 || !Graph.nodeExists(w, s)) continue;
                int id = next++;
                comp[s] = id;
                stack.Push(s);
                while (stack.Count > 0)
                {
                    int node = stack.Pop();
                    int c = node % NN, x = c % N, y = c / N;
                    if (x == 0 || y == 0 || x == N - 1 || y == N - 1) outside.Add(id);
                    Graph.forEachNeighbour(w, node, (n, _) => { if (comp[n] < 0) { comp[n] = id; stack.Push(n); } });
                }
            }
            var access = new Dictionary<int, int>();
            foreach (var b in w.buildings.Values) { int a = findAccess(w, b.x, b.y, bw(b), bh(b)); if (a >= 0) access[b.id] = a; }
            cache = new Net { ver = ver, comp = comp, outside = outside, access = access };
            return cache;
        }

        public static void invalidateNetwork() { cache = null; }

        public static int findAccess(World w, int bx, int by, int W, int H)
        {
            int best = -1, bestD = 99;
            void tryLine(int x0, int y0, int dx, int dy)
            {
                for (int d = 1; d <= ZONE_DEPTH + 1; d++)
                {
                    int x = x0 + dx * d, y = y0 + dy * d;
                    if (!inside(x, y)) return;
                    int i = idx(x, y);
                    if (w.road[i] == Road.Highway) return;
                    if (w.road[i] != 0) { if (d < bestD) { bestD = d; best = i; } return; }
                    if (w.ground[i] != Ground.Land) return;
                }
            }
            for (int k = 0; k < W; k++) { tryLine(bx + k, by, 0, -1); tryLine(bx + k, by + H - 1, 0, 1); }
            for (int k = 0; k < H; k++) { tryLine(bx, by + k, -1, 0); tryLine(bx + W - 1, by + k, 1, 0); }
            return best;
        }
        public static int findAccess(World w, Building b) => findAccess(w, b.x, b.y, bw(b), bh(b));

        public static bool reachesOutside(World w, Building b)
        {
            var net = network(w);
            return net.access.TryGetValue(b.id, out int a) && net.outside.Contains(net.comp[a]);
        }

        sealed class Supply { public double p, wa, s; }

        public static void updateUtilities(World w)
        {
            var net = network(w);
            var supply = new Dictionary<int, Supply>();
            Supply get(int c) { if (!supply.TryGetValue(c, out var v)) supply[c] = v = new Supply(); return v; }
            double pS = 0, wS = 0, sS = 0;
            foreach (var b in w.buildings.Values)
            {
                if (!net.access.TryGetValue(b.id, out int a)) continue;
                var d = KINDS[b.kind];
                var g = get(net.comp[a]);
                if (d.power < 0) { g.p -= d.power; pS -= d.power; }
                if (d.water < 0) { g.wa -= d.water; wS -= d.water; }
                if (b.kind == "sewage") { g.s += SEWAGE_CAPACITY; sS += SEWAGE_CAPACITY; }
            }
            double pU = 0, wU = 0, sU = 0;
            foreach (var b in w.buildings.Values) // already in id order
            {
                var d = KINDS[b.kind];
                Supply g = null;
                if (net.access.TryGetValue(b.id, out int a)) supply.TryGetValue(net.comp[a], out g);
                double lots = lotsOf(b);
                double draw = d.zone != 0 ? ZONE_DRAW : 1;
                double pNeed = Math.Max(0, d.power) * lots * draw, wNeed = Math.Max(0, d.water) * lots * draw;
                double load = b.abandoned ? 0.1 : d.zone != 0 ? 0.3 + 0.7 * occRatio(b) : 1;
                double pn = pNeed * load, wn = wNeed * load;
                b.powered = d.power < 0 || (g != null && g.p >= pn);
                b.watered = d.water < 0 || wNeed == 0 || (g != null && g.wa >= wn);
                b.sewered = wNeed == 0 || d.water < 0 || (g != null && g.s >= wn);
                if (g != null)
                {
                    if (b.powered && pn != 0) { g.p -= pn; pU += pn; }
                    if (b.watered && wn != 0) { g.wa -= wn; wU += wn; }
                    if (b.sewered && wn != 0 && d.water > 0) { g.s -= wn; sU += wn; }
                }
            }
            w.stats.powerSupply = pS; w.stats.powerUse = pU;
            w.stats.waterSupply = wS; w.stats.waterUse = wU;
            w.stats.sewageCap = sS; w.stats.sewageUse = sU;
        }

        public const double ZONE_DRAW = 0.6;

        public static double occRatio(Building b)
        {
            var d = KINDS[b.kind];
            double cap = Cap(d) * lotsOf(b);
            return cap != 0 ? b.occ / cap : 1;
        }
    }
}
