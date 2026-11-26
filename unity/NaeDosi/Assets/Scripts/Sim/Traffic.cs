using System;
using System.Collections.Generic;
using System.Linq;
using static NaeDosi.Defs;
using static NaeDosi.WorldOps;

namespace NaeDosi
{
    /// <summary>Traffic lights: which junctions have them and what they show (port of sim/signals.ts).</summary>
    public static class Signals
    {
        public const double CYCLE = 20;
        const double GREEN = 9, AMBER = 1;
        public const int Green = 0, Amber = 1, Red = 2;

        static string cacheVer; static byte[] cacheAt;

        public static byte[] signalCells(World w)
        {
            string ver = $"{w.ver.roads}:{w.roundabouts.Count}";
            if (cacheAt != null && cacheVer == ver) return cacheAt;
            int NN = Graph.NN;
            var at = new byte[NN];
            var rings = Roundabouts.ringMask(w);
            for (int c = 0; c < NN; c++)
            {
                if (w.road[c] == 0 || rings[c] != 0 || w.road[c] == 3) continue;
                int n = 0; bool avenue = w.road[c] == Road.Avenue;
                Graph.forEachNeighbour(w, c, (m, _) => { if (m < NN) { n++; if (w.road[m] == Road.Avenue) avenue = true; } });
                if (n >= 4 || (n >= 3 && avenue)) at[c] = 1;
            }
            cacheVer = ver; cacheAt = at;
            return at;
        }

        public static int axisOf(int from, int to)
        {
            int dx = (to % N) - (from % N), dy = (to / N) - (from / N);
            if (dy == 0) return 0;
            if (dx == 0) return 1;
            return dx * dy > 0 ? 0 : 1;
        }

        static double Wrap(double clock) => ((clock % CYCLE) + CYCLE) % CYCLE;

        public static int lightFor(int axis, double clock)
        {
            double t = Wrap(clock), half = GREEN + AMBER;
            double local = axis == 0 ? t : (t + half) % CYCLE;
            return local < GREEN ? Green : local < half ? Amber : Red;
        }

        public static double greenAge(int axis, double clock)
        {
            double t = Wrap(clock), half = GREEN + AMBER;
            double local = axis == 0 ? t : (t + half) % CYCLE;
            return local < GREEN ? local : -1;
        }

        public static bool mustStop(World w, int node, int next, double clock)
        {
            if (node >= Graph.NN || next >= Graph.NN || node == next || signalCells(w)[next] == 0) return false;
            return lightFor(axisOf(node, next), clock) != Green;
        }
    }

    /// <summary>What the drivers know about the road ahead (port of sim/junctions.ts).</summary>
    public static class Junctions
    {
        public sealed class Nodes { public string ver; public byte[] deg, sig, ring; }
        static Nodes cache;

        public static Nodes nodes(World w)
        {
            string ver = $"{w.ver.roads}:{w.roundabouts.Count}";
            if (cache != null && cache.ver == ver) return cache;
            int NN = Graph.NN;
            var deg = new byte[NN * 2]; var sig = new byte[NN * 2]; var ring = new byte[NN * 2];
            for (int n = 0; n < NN * 2; n++)
            {
                if (Graph.roadTypeOf(w, n) == 0) continue;
                int k = 0;
                Graph.forEachNeighbour(w, n, (_, __) => { k++; });
                deg[n] = (byte)Math.Min(255, k);
            }
            Array.Copy(Signals.signalCells(w), sig, NN);
            foreach (var r in w.roundabouts) ring[r.cell] = 1;
            cache = new Nodes { ver = ver, deg = deg, sig = sig, ring = ring };
            return cache;
        }

        public static bool isJunction(Nodes nd, int n) => nd.deg[n] >= 3 || nd.ring[n] == 1;

        static int cxn(int n) => Graph.cellOf(n) % N;
        static int cyn(int n) => Graph.cellOf(n) / N;

        public static double linkLen(int a, int b)
        {
            int dx = cxn(b) - cxn(a), dy = cyn(b) - cyn(a);
            return dx != 0 && dy != 0 ? CELL * Graph.SQRT2 : CELL;
        }

        public static int laneCount(World w, int a, int b)
        {
            int ra = Graph.roadTypeOf(w, a), rb = Graph.roadTypeOf(w, b);
            if (ra >= Road.Avenue && rb >= Road.Avenue) return 2;
            return isOneWay(w, a) && isOneWay(w, b) ? 2 : 1;
        }

        public static bool isOneWay(World w, int n) => n < Graph.NN && w.oneway[n] != 0;

        public static int turnOf(int a, int j, int b)
        {
            if (b < 0) return 0;
            int d1x = cxn(j) - cxn(a), d1z = cyn(j) - cyn(a), d2x = cxn(b) - cxn(j), d2z = cyn(b) - cyn(j);
            int cr = d1x * d2z - d1z * d2x;
            return cr > 0 ? 1 : cr < 0 ? -1 : 0;
        }

        public static double turnCos(int a, int j, int b)
        {
            if (b < 0) return 1;
            int d1x = cxn(j) - cxn(a), d1z = cyn(j) - cyn(a), d2x = cxn(b) - cxn(j), d2z = cyn(b) - cyn(j);
            double l = Geom.Hypot(d1x, d1z) * Geom.Hypot(d2x, d2z);
            return l != 0 ? (d1x * d2x + d1z * d2z) / l : 1;
        }

        public static double stopBack(World w, int j, double len)
        {
            int t = Graph.roadTypeOf(w, j) == Road.Avenue ? Road.Avenue : Road.Street;
            return Math.Min(Curves.HALF_WIDTH(t) + Curves.KERB_W(t) + 1.2, len - 3);
        }

        public static double clearOf(World w, int j) => Graph.roadTypeOf(w, j) == Road.Avenue ? 6 : 4.5;

        const double TAU = Math.PI * 2;
        static double armAngle(int j, int n) => Math.Atan2(cyn(n) - cyn(j), cxn(n) - cxn(j));
        static double wrap(double a) => ((a % TAU) + TAU) % TAU;

        static bool onRingPath(int f, int j, int t, int g)
        {
            double ef = armAngle(j, f), eg = armAngle(j, g);
            double span = TAU;
            if (t >= 0) { span = wrap(ef - armAngle(j, t)); if (span == 0) span = TAU; }
            double at = wrap(ef - eg);
            return at > 1e-6 && at < span;
        }

        static double entryAngle(int a, int j)
        {
            double dx = cxn(j) - cxn(a), dz = cyn(j) - cyn(a), l = Geom.Hypot(dx, dz); if (l == 0) l = 1;
            return Math.Atan2(-dz / l + (dx / l) * 0.35, -dx / l - (dz / l) * 0.35);
        }

        static double exitAngle(int j, int b)
        {
            double dx = cxn(b) - cxn(j), dz = cyn(b) - cyn(j), l = Geom.Hypot(dx, dz); if (l == 0) l = 1;
            return Math.Atan2(dz / l + (dx / l) * 0.35, dx / l - (dz / l) * 0.35);
        }

        public static bool conflicts(Nodes nd, int j, int af, int at, int bf, int bt)
        {
            if (af == bf) return false;
            if (at >= 0 && at == bt) return true;
            if (nd.ring[j] != 0) return onRingPath(af, j, at, bf) || onRingPath(bf, j, bt, af);
            if (Graph.cellOf(af) == Graph.cellOf(j) || Graph.cellOf(bf) == Graph.cellOf(j)) return at == bt;
            double p1 = entryAngle(af, j), q1 = at >= 0 ? exitAngle(j, at) : entryAngle(af, j) + Math.PI;
            double p2 = entryAngle(bf, j), q2 = bt >= 0 ? exitAngle(j, bt) : entryAngle(bf, j) + Math.PI;
            double span = wrap(q1 - p1);
            bool inA(double x) => wrap(x - p1) < span;
            return inA(p2) != inA(q2);
        }
    }

    /// <summary>One car (or bus, truck, scooter) on a real trip between two buildings.</summary>
    public sealed class Car
    {
        public int[] path;
        public int i; public double t;
        public int kind; // 0 car, 1 bus, 2 truck, 3 scooter
        public double look, age;
        public bool cruised;
        public double v; public int lane;
        public int jn = -1, jf = -1, jt = -1;
        public double at = -1, wait, stuck, ghost, acc, gap = double.PositiveInfinity, line = double.PositiveInfinity;
        public bool ok = true, done;
        public int bus = -1;
        public HashSet<int> stops;
        public double dwell;
        public Car by, held;
        public string why;
    }

    public sealed class TrafficState
    {
        public List<Car> cars = new List<Car>();
        public ushort[] load = new ushort[Graph.NN * 2];
        public Dictionary<long, int[]> routes = new Dictionary<long, int[]>();
        public int routesVer = -1;
        public double tripTime, trips, clock, owed;
        /// <summary>Zebras people are on right now (zebra cell → the junction beside it), filled by the walkers on screen.</summary>
        public Dictionary<int, int> crossings = new Dictionary<int, int>();
    }

    /// <summary>Commuter traffic: real trips along A* routes; the smoothed load per cell is the congestion (port of sim/traffic.ts).</summary>
    public static class Traffic
    {
        public const int MAX_CARS = 1600;
        const double TRIP_SPREAD = 150;
        const int NN = Graph.NN;

        public static Car newCar(int[] path, int kind, double look) => new Car { path = path, kind = kind, look = look };

        public static TrafficState createTraffic() => new TrafficState();

        public static double rushFactor(double hour)
        {
            double peak(double h, double c, double wdt) => Math.Exp(-(((h - c) / wdt) * ((h - c) / wdt)));
            return 0.25 + 0.9 * peak(hour, 8, 1.4) + 0.75 * peak(hour, 18.5, 1.8) + 0.3 * peak(hour, 13, 3);
        }

        public static void stepTraffic(World w, TrafficState tr, double dt, double hour)
        {
            var net = Network.network(w);
            if (tr.routesVer != w.ver.roads) { tr.routes.Clear(); tr.routesVer = w.ver.roads; }
            double target = Math.Min(MAX_CARS, (w.stats.pop / 9 + w.stats.employed / 20) * rushFactor(hour));
            tr.owed = Math.Min(tr.owed + (target / TRIP_SPREAD) * dt, 40);
            if (tr.cars.Count >= Math.Min(MAX_CARS, target + 20)) tr.owed = Math.Min(tr.owed, 0);
            int spawn = Math.Min(60, (int)Math.Floor(tr.owed * 1.6) + 1);
            if (tr.owed >= 1)
            {
                var homes = new List<int>(); var works = new List<int>(); var shops = new List<int>();
                foreach (var b in w.buildings.Values)
                {
                    if (!net.access.ContainsKey(b.id) || b.abandoned || b.occ < 1) continue;
                    int z = KINDS[b.kind].zone;
                    if (z == Zone.R) homes.Add(b.id);
                    else if (z == Zone.C) { works.Add(b.id); shops.Add(b.id); }
                    else if (z == Zone.I) works.Add(b.id);
                }
                var outside = net.outside.ToList();
                var busy = new HashSet<long>();
                foreach (var c in tr.cars) if (c.t * Junctions.linkLen(c.path[c.i], c.path[c.i + 1]) < 9) busy.Add((long)c.path[c.i] * NN * 2 + c.path[c.i + 1]);
                while (spawn-- > 0 && tr.owed >= 1 && homes.Count > 0)
                {
                    bool morning = hour < 12;
                    int home = homes[(int)(rand(w) * homes.Count)];
                    bool goShop = rand(w) < (hour > 10 && hour < 17 ? 0.5 : 0.2);
                    var pool = goShop && shops.Count > 0 ? shops : works;
                    int a = -1, b = -1;
                    bool leaving = false;
                    int ha = net.access[home];
                    if (pool.Count > 0 && rand(w) < 0.9)
                    {
                        int dest = pool[(int)(rand(w) * pool.Count)];
                        int da = net.access[dest];
                        if (morning) { a = ha; b = da; } else { a = da; b = ha; }
                    }
                    else if (outside.Count > 0)
                    {
                        int edge = edgeCellOf(w, net.comp, outside[0]);
                        if (edge >= 0) { if (morning) { a = ha; b = edge; } else { a = edge; b = ha; } leaving = true; }
                    }
                    if (a < 0 || b < 0 || a == b || net.comp[a] != net.comp[b]) continue;
                    var nc = Attractions.noCarTrip(w, a, b, leaving, rand(w));
                    if (nc != null) { tr.tripTime += nc.Value; tr.trips++; continue; }
                    var ride = Transit.tryTransit(w, a, b, rand(w), leaving);
                    if (ride != null) { tr.tripTime += ride.Value; tr.trips++; continue; }
                    var path = route(w, tr, a, b);
                    if (path == null || path.Length < 2) continue;
                    double kindRoll = rand(w);
                    int kind = goShop && kindRoll < 0.3 ? 3 : kindRoll < 0.08 ? 2 : 0;
                    long key = (long)path[0] * NN * 2 + path[1];
                    if (busy.Contains(key)) continue;
                    busy.Add(key);
                    var car = newCar(path, kind, rand(w));
                    car.lane = Driving.laneFor(w, car, 0);
                    car.v = wantedStart(w, path);
                    tr.cars.Add(car);
                    tr.owed--;
                }
            }
            syncBuses(w, tr);
            foreach (var c in Driving.drive(w, tr, dt))
            {
                if (c.bus >= 0) { c.done = false; c.i = 0; c.t = 0; c.jn = c.jf = c.jt = -1; tr.cars.Add(c); continue; }
                if (!c.cruised && cruise(w, c)) { c.done = false; tr.cars.Add(c); continue; }
                tr.tripTime += c.age;
                tr.trips++;
            }
            Array.Clear(tr.load, 0, tr.load.Length);
            foreach (var c in tr.cars) tr.load[c.t < 0.5 ? c.path[c.i] : c.path[c.i + 1]]++;
            double k = Math.Min(1, dt * 0.6);
            for (int i = 0; i < N * N; i++)
            {
                int r = w.road[i], ra = w.roadAlt[i];
                double lv = Math.Max(r != 0 ? tr.load[i] / (ROAD_CAPACITY(r) * Parking.parkedSqueeze(w, i)) : 0, ra != 0 ? tr.load[i + NN] / ROAD_CAPACITY(ra) : 0);
                w.traffic[i] = (float)(w.traffic[i] + (Math.Min(2, lv) - w.traffic[i]) * k);
            }
        }

        static double wantedStart(World w, int[] path)
        {
            int t = Graph.roadTypeOf(w, path[0]); if (t == 0) t = 1;
            return (ROAD_SPEED(t) * Driving.PACE) / 3;
        }

        public static void closeDay(World w, TrafficState tr)
        {
            if (tr.trips != 0)
            {
                double minutes = (tr.tripTime / tr.trips) * 2;
                w.stats.commute += (minutes - w.stats.commute) * 0.3;
            }
            tr.tripTime = 0;
            tr.trips = 0;
            double sum = 0; int n = 0;
            for (int i = 0; i < N * N; i++) if (w.road[i] != 0 || w.roadAlt[i] != 0) { sum += Math.Min(1.5, w.traffic[i]); n++; }
            w.stats.congestion = n != 0 ? sum / n : 0;
        }

        static int edgeCellOf(World w, int[] comp, int id)
        {
            var ends = new List<int>();
            for (int k = 0; k < N; k++)
                foreach (int i in new[] { k * N, k * N + N - 1, k, (N - 1) * N + k })
                {
                    if (w.road[i] == 0 || comp[i] != id) continue;
                    ends.Add(i);
                    if (w.road[i] == 3) ends.Add(i);
                }
            return ends.Count > 0 ? ends[(int)Math.Floor(rand(w) * ends.Count)] : -1;
        }

        // ---------------------------------------------------------------- routing

        public static int[] route(World w, TrafficState tr, int from, int to)
        {
            long key = ((long)from << 32) | (uint)to;
            if (tr.routes.TryGetValue(key, out var hit)) return hit;
            var p = astar(w, from, to);
            if (tr.routes.Count > 4000) tr.routes.Clear();
            tr.routes[key] = p;
            return p;
        }

        static int[] astar(World w, int from, int to)
        {
            int tc = Graph.cellOf(to), tx = tc % N, ty = tc / N;
            var g = new Dictionary<int, double>();
            var prev = new Dictionary<int, int>();
            var heap = new Heap();
            g[from] = 0;
            heap.push(from, 0);
            double vmax = ROAD_SPEED(2);
            while (heap.size > 0)
            {
                int c = heap.pop();
                if (c == to) break;
                double gc = g[c];
                Graph.forEachDriveStep(w, c, (n, len) =>
                {
                    double cost = gc + len / ROAD_SPEED(Graph.roadTypeOf(w, n));
                    if (cost < (g.TryGetValue(n, out var gn) ? gn : double.PositiveInfinity))
                    {
                        g[n] = cost;
                        prev[n] = c;
                        int nc = Graph.cellOf(n), dx = Math.Abs((nc % N) - tx), dy = Math.Abs((nc / N) - ty);
                        heap.push(n, cost + (Math.Max(dx, dy) + (Graph.SQRT2 - 1) * Math.Min(dx, dy)) / vmax);
                    }
                });
            }
            if (!prev.ContainsKey(to) && from != to) return null;
            var o = new List<int> { to };
            int cc = to;
            while (cc != from) { cc = prev[cc]; o.Add(cc); }
            o.Reverse();
            return o.ToArray();
        }

        sealed class Heap
        {
            readonly List<int> k = new List<int>(); readonly List<double> p = new List<double>();
            public int size => k.Count;
            public void push(int key, double pri)
            {
                k.Add(key); p.Add(pri);
                int i = k.Count - 1;
                while (i > 0)
                {
                    int j = (i - 1) >> 1;
                    if (p[j] <= p[i]) break;
                    (k[i], k[j]) = (k[j], k[i]); (p[i], p[j]) = (p[j], p[i]);
                    i = j;
                }
            }
            public int pop()
            {
                int top = k[0];
                int lk = k[k.Count - 1]; double lp = p[p.Count - 1];
                k.RemoveAt(k.Count - 1); p.RemoveAt(p.Count - 1);
                if (k.Count > 0)
                {
                    k[0] = lk; p[0] = lp;
                    int i = 0;
                    for (; ; )
                    {
                        int l = i * 2 + 1, r = l + 1, m = i;
                        if (l < k.Count && p[l] < p[m]) m = l;
                        if (r < k.Count && p[r] < p[m]) m = r;
                        if (m == i) break;
                        (k[i], k[m]) = (k[m], k[i]); (p[i], p[m]) = (p[m], p[i]);
                        i = m;
                    }
                }
                return top;
            }
        }

        static bool cruise(World w, Car c)
        {
            int end = c.path[c.path.Length - 1];
            if (end >= NN || c.kind == 1 || c.kind == 3) return false;
            double p = w.parkPress[end] / 100.0;
            if (p == 0 || rand(w) > p * 0.8) return false;
            var walk = new List<int> { end };
            int prev = -1, cur = end;
            int steps = 3 + (int)Math.Floor(rand(w) * 4);
            for (int k = 0; k < steps; k++)
            {
                var nb = new List<int>();
                int pv = prev, cu = cur;
                Graph.forEachDriveStep(w, cu, (n, _) => { if (n < NN && n != pv) nb.Add(n); });
                if (nb.Count == 0) break;
                prev = cur;
                cur = nb[(int)Math.Floor(rand(w) * nb.Count)];
                walk.Add(cur);
            }
            if (walk.Count < 2) return false;
            c.path = walk.ToArray();
            c.i = 0;
            c.t = 0;
            c.cruised = true;
            c.lane = Driving.laneFor(w, c, 0);
            c.jn = -1;
            c.at = -1;
            return true;
        }

        sealed class Want { public int[] path; public int n; public HashSet<int> stops; }

        static void syncBuses(World w, TrafficState tr)
        {
            var want = new Dictionary<int, Want>(); var order = new List<int>();
            foreach (var l in w.lines)
            {
                if (l.kind != "bus") continue;
                var path = Transit.busRoute(w, l.stops, l.id);
                if (path != null && path.Length > 2)
                {
                    want[l.id] = new Want { path = path, n = Transit.busCount(w, l), stops = new HashSet<int>(l.stops.Select(i => Transit.stopKerb(w, i).cell)) };
                    order.Add(l.id);
                }
            }
            var have = new Dictionary<int, int>();
            bool gone = false;
            foreach (var c in tr.cars)
            {
                if (c.bus < 0) continue;
                if (!want.TryGetValue(c.bus, out var x) || c.path != x.path || (have.TryGetValue(c.bus, out int h0) ? h0 : 0) >= x.n) { c.done = true; gone = true; continue; }
                c.stops = x.stops;
                have[c.bus] = (have.TryGetValue(c.bus, out int h1) ? h1 : 0) + 1;
            }
            if (gone) tr.cars = tr.cars.Where(c => !c.done).ToList();
            foreach (int id in order)
            {
                var x = want[id];
                int k = have.TryGetValue(id, out int hk) ? hk : 0;
                if (k >= x.n) continue;
                int L = x.path.Length - 1;
                for (int tries = 0; tries < 6; tries++)
                {
                    int i = (int)Math.Floor(((k + tries / 6.0) * L) / x.n) % L;
                    int a = x.path[i], b = x.path[i + 1];
                    if (tr.cars.Any(c => (c.path[c.i] == a && c.path[c.i + 1] == b) || (c.path[c.i + 1] == a) || (c.jn == a))) continue;
                    var bus = newCar(x.path, 1, (id * 0.618) % 1);
                    bus.i = i; bus.bus = id; bus.stops = x.stops;
                    tr.cars.Add(bus);
                    break;
                }
            }
        }
    }

    /// <summary>How the cars drive: the intelligent driver model, stop lines, lights and giving way (port of sim/driving.ts).</summary>
    public static class Driving
    {
        public const double PACE = 4;
        const double A = 28, B = 36;
        const double T = 0.28, S0 = 1.8;
        static readonly double SQ = 2 * Math.Sqrt(A * B);
        public static readonly double[] LENGTH = { 4.3, 10.5, 5.0, 1.8 };
        const double PED = 2;
        const double YIELD_WAIT = 6;
        const double STUCK = 30;
        const double STEP = 0.1;
        const int NN = Graph.NN;
        const long NN2 = NN * 2;
        const double INF = double.PositiveInfinity;

        public static int ghostCount;

        static long keyOf(int a, int b, int lane) => ((long)a * NN2 + b) * 2 + lane;

        static int laneWant(World w, Car c, int i)
        {
            var p = c.path;
            if (i >= p.Length - 1 || Junctions.laneCount(w, p[i], p[i + 1]) == 1) return 0;
            var nd = Junctions.nodes(w);
            for (int j = i + 1, k = 0; j + 1 < p.Length && k < 5; j++, k++)
            {
                if (!Junctions.isJunction(nd, p[j])) continue;
                int tn = Junctions.turnOf(p[j - 1], p[j], p[j + 1]);
                return tn < 0 ? 0 : tn > 0 ? 1 : -1;
            }
            return -1;
        }

        public static int laneFor(World w, Car c, int i)
        {
            int l = laneWant(w, c, i);
            return l >= 0 ? l : c.look > 0.5 ? 1 : 0;
        }

        static double roomIn(Dictionary<long, List<Car>> groups, int a, int b, int lane)
        {
            if (!groups.TryGetValue(keyOf(a, b, lane), out var g)) return INF;
            var r = g[g.Count - 1];
            return r.t * Junctions.linkLen(a, b) - LENGTH[r.kind] / 2;
        }

        static int pickLane(World w, Dictionary<long, List<Car>> groups, Car c)
        {
            int want = laneWant(w, c, c.i);
            int a = c.path[c.i], b = c.path[c.i + 1];
            if (want >= 0) return want;
            double here = roomIn(groups, a, b, c.lane), there = roomIn(groups, a, b, 1 - c.lane);
            return there > here + 6 ? 1 - c.lane : c.lane;
        }

        static int laneAhead(World w, Car c, int j) { int l = laneWant(w, c, j); return l >= 0 ? l : c.lane; }

        static double wanted(World w, Car c, int a, int b)
        {
            int ra = Graph.roadTypeOf(w, a), rb = Graph.roadTypeOf(w, b);
            if (ra == 0) ra = Road.Street; if (rb == 0) rb = Road.Street;
            int r = ra == Road.Highway && rb == Road.Highway ? Road.Highway : ra != Road.Street && rb != Road.Street ? Road.Avenue : Road.Street;
            double v = ROAD_SPEED(r) * PACE * (0.92 + c.look * 0.16);
            if ((a < NN && (w.hwy[a] & 2) != 0) || (b < NN && (w.hwy[b] & 2) != 0)) v = Math.Min(v, ROAD_SPEED(Road.Street) * PACE * 0.45);
            if (c.kind == 1 || c.kind == 2) v *= 0.85;
            v *= Hazards.snowSlow(w, Graph.cellOf(a));
            if (r == Road.Street && a < NN && w.parked[a] > 0) v *= 0.85;
            return v;
        }

        public static List<Car> drive(World w, TrafficState tr, double dt)
        {
            var nd = Junctions.nodes(w);
            int n = Math.Max(1, (int)Math.Ceiling(dt / STEP)); double h = dt / n;
            var done = new List<Car>();
            for (int k = 0; k < n; k++)
            {
                tr.clock += h;
                step(w, tr, nd, h, done);
                if (done.Count > 0) tr.cars = tr.cars.Where(c => !c.done).ToList();
            }
            return done;
        }

        sealed class Scene
        {
            public Dictionary<long, List<Car>> groups; public List<long> groupOrder;
            public Dictionary<int, List<Car>> near, occ;
        }

        static void push<K>(Dictionary<K, List<Car>> m, K k, Car c)
        {
            if (m.TryGetValue(k, out var l)) l.Add(c); else m[k] = new List<Car> { c };
        }

        static double Clamp0(double v) => Math.Max(0, v);

        static void step(World w, TrafficState tr, Junctions.Nodes nd, double h, List<Car> done)
        {
            var groups = new Dictionary<long, List<Car>>(); var order = new List<long>();
            foreach (var c in tr.cars)
            {
                long k = keyOf(c.path[c.i], c.path[c.i + 1], c.lane);
                if (groups.TryGetValue(k, out var l)) l.Add(c); else { groups[k] = new List<Car> { c }; order.Add(k); }
            }
            foreach (long k in order) { var g = groups[k]; if (g.Count > 1) StableSortDesc(g); }
            var occ = new Dictionary<int, List<Car>>(); var near = new Dictionary<int, List<Car>>();
            foreach (var c in tr.cars) if (c.jn >= 0) push(occ, c.jn, c);
            foreach (long k in order)
            {
                var g = groups[k];
                int j = g[0].path[g[0].i + 1];
                if (!Junctions.isJunction(nd, j)) continue;
                var c = g.Find(o => o.jn != j);
                if (c == null) continue;
                double L = Junctions.linkLen(c.path[c.i], j), d = L - Junctions.stopBack(w, j, L) - (c.t * L + LENGTH[c.kind] / 2);
                if (d > Math.Max(15, c.v * 1.2 + 8)) { c.at = -1; continue; }
                if (c.at < 0) c.at = tr.clock;
                push(near, j, c);
            }
            var sc = new Scene { groups = groups, groupOrder = order, near = near, occ = occ };

            foreach (long gk in order)
            {
                var g = groups[gk];
                for (int q = 0; q < g.Count; q++)
                {
                    var c = g[q]; var p = c.path; int i = c.i, a = p[i], b = p[i + 1];
                    double L = Junctions.linkLen(a, b), x = c.t * L, len = LENGTH[c.kind];
                    double v0 = wanted(w, c, a, b);
                    int nb = i + 2 < p.Length ? p[i + 2] : -1;
                    if (nb >= 0)
                    {
                        double cs = Junctions.turnCos(a, b, nb);
                        if (cs < 0.99)
                        {
                            double vt = v0 * (0.32 + 0.6 * Math.Max(0, cs));
                            v0 = Math.Min(v0, Math.Sqrt(vt * vt + B * Math.Max(0, L - x - 2)));
                        }
                    }
                    double s = INF, vl = 0;
                    if (c.ghost <= 0)
                    {
                        c.by = null;
                        if (q > 0) { var l = g[q - 1]; s = (l.t - c.t) * L - (LENGTH[l.kind] + len) / 2; vl = l.v; c.by = l; }
                        else
                        {
                            double dist = L - x;
                            for (int j = i + 1; j < p.Length - 1 && dist < 90; j++)
                            {
                                double Lj = Junctions.linkLen(p[j], p[j + 1]);
                                if (groups.TryGetValue(keyOf(p[j], p[j + 1], laneAhead(w, c, j)), out var g2))
                                { var l = g2[g2.Count - 1]; s = dist + l.t * Lj - (LENGTH[l.kind] + len) / 2; vl = l.v; c.by = l; break; }
                                dist += Lj;
                            }
                        }
                    }
                    c.ok = true;
                    if (c.ghost <= 0 && c.jn != b && Junctions.isJunction(nd, b))
                    {
                        double d = L - Junctions.stopBack(w, b, L) - (x + len / 2);
                        if (d < 45)
                        {
                            c.ok = mayEnter(w, tr, nd, sc, c, d);
                            if (!c.ok && d + S0 * 0.8 < s) { s = d + S0 * 0.8; vl = 0; c.by = c.held; }
                        }
                        c.line = d;
                    }
                    else c.line = INF;
                    if (c.ghost <= 0 && tr.crossings.Count > 0)
                    {
                        double zebra(int jj) { int t = Graph.roadTypeOf(w, jj); if (t == 0) t = 1; return Curves.HALF_WIDTH(t) + Curves.KERB_W(t) + 1.6; }
                        double d = INF;
                        double front = x + len / 2;
                        if (tr.crossings.TryGetValue(a, out int ca) && ca == b) d = L - front - (zebra(b) + 1.6);
                        else if (i + 2 < p.Length && tr.crossings.TryGetValue(b, out int cb) && cb == p[i + 2]) d = L - front + Junctions.linkLen(b, p[i + 2]) - (zebra(p[i + 2]) + 1.6);
                        else if (tr.crossings.TryGetValue(b, out int cb2) && cb2 == a) d = zebra(a) - 1.6 - front;
                        if (d > -0.5 && d < s) { s = Math.Max(0.1, d); vl = 0; }
                    }
                    c.gap = s;
                    double vr = c.v / v0;
                    double acc = A * (1 - vr * vr * vr * vr);
                    if (s < INF)
                    {
                        double want = S0 + Math.Max(0, c.v * T + (c.v * (c.v - vl)) / SQ);
                        double ratio = want / Math.Max(0.1, s);
                        acc -= A * ratio * ratio;
                    }
                    c.acc = Math.Max(-B * 4, acc);
                }
            }

            foreach (var c in tr.cars)
            {
                if (c.dwell != 0)
                {
                    c.dwell -= h; c.v = 0; c.age += h;
                    if (c.dwell > 0) continue;
                    c.dwell = 0;
                }
                var p = c.path; int last = p.Length - 1; double len = LENGTH[c.kind];
                int a = p[c.i], b = p[c.i + 1]; double L = Junctions.linkLen(a, b);
                double v1 = Math.Max(0, c.v + c.acc * h);
                double dx = ((c.v + v1) / 2) * h;
                c.v = v1;
                if (c.ghost <= 0 && c.gap < INF && dx > c.gap - 0.2) { dx = Math.Max(0, c.gap - 0.2); c.v = Math.Min(c.v, dx / h); }
                if (c.line < INF && dx > c.line)
                {
                    int to = c.i + 2 <= last ? p[c.i + 2] : -1;
                    if (c.ok && sc.occ.TryGetValue(b, out var os))
                        foreach (var o in os) if (o != c && Junctions.conflicts(nd, b, a, to, o.jf, o.jt)) { c.ok = false; break; }
                    if (c.ok) { c.jn = b; c.jf = a; c.jt = to; c.at = -1; c.wait = 0; push(sc.occ, b, c); }
                    else { dx = Math.Max(0, c.line); c.v = 0; }
                }
                if (c.line == INF) c.wait = 0;
                else if (c.line < 8 && c.v < 1) c.wait += h;
                double xx = c.t * L + dx;
                bool finished = false;
                while (xx >= L)
                {
                    if (c.i + 1 >= last) { finished = true; break; }
                    xx -= L;
                    c.i++;
                    a = p[c.i]; b = p[c.i + 1]; L = Junctions.linkLen(a, b);
                    if (a < NN && (w.hwy[a] & 2) != 0) w.tollPass++;
                    if (c.stops != null && c.stops.Contains(a) && !Junctions.isJunction(nd, a) && c.jn < 0) { c.dwell = 2.5; xx = 0; }
                    c.lane = pickLane(w, groups, c);
                }
                c.t = finished ? 1 : xx / L;
                c.age += h;
                if (c.jn >= 0)
                {
                    if (p[c.i] == c.jn) { if (xx - len / 2 > Junctions.clearOf(w, c.jn)) c.jn = -1; }
                    else if (p[c.i + 1] != c.jn) c.jn = -1;
                }
                if (c.v < 0.5) c.stuck += h; else c.stuck = 0;
                if (c.ghost > 0) c.ghost -= h;
                else if (c.stuck > STUCK)
                {
                    c.stuck = 0; ghostCount++;
                    if (c.bus < 0) { c.cruised = true; finished = true; }
                }
                if (finished) { c.done = true; done.Add(c); }
            }
        }

        /// <summary>Stable sort, front (largest t) first, as Array.prototype.sort does.</summary>
        static void StableSortDesc(List<Car> g)
        {
            var arr = g.Select((c, k) => (c, k)).OrderByDescending(e => e.c.t).ThenBy(e => e.k).Select(e => e.c).ToList();
            g.Clear(); g.AddRange(arr);
        }

        static bool mayEnter(World w, TrafficState tr, Junctions.Nodes nd, Scene sc, Car c, double d)
        {
            var p = c.path; int i = c.i, a = p[i], j = p[i + 1], to = i + 2 < p.Length ? p[i + 2] : -1;
            c.held = null;
            c.why = "";
            if (nd.sig[j] != 0)
            {
                int ax = Signals.axisOf(Graph.cellOf(a), j), light = Signals.lightFor(ax, tr.clock);
                if (light == Signals.Red) { c.why = "red"; return d < 0; }
                if (light == Signals.Amber)
                {
                    bool sneak = c.wait > 1 && d < 1.5 && Junctions.turnOf(a, j, to) < 0;
                    if (!sneak) { c.why = "amber"; return d < (c.v * c.v) / (2 * B); }
                }
                if (light == Signals.Green && to >= 0 && Signals.axisOf(j, Graph.cellOf(to)) != ax && Signals.greenAge(ax, tr.clock) < PED && c.wait < YIELD_WAIT) { c.why = "ped"; return false; }
            }
            sc.occ.TryGetValue(j, out var os);
            if (os != null) foreach (var o in os) if (o != c && Junctions.conflicts(nd, j, a, to, o.jf, o.jt)) { c.why = "occ"; c.held = o; return false; }
            if (c.wait < YIELD_WAIT && sc.near.TryGetValue(j, out var ns))
            {
                foreach (var o in ns)
                {
                    int ob = o.path[o.i];
                    if (o == c || ob == a || o.wait >= YIELD_WAIT || o.ghost > 0) continue;
                    if (nd.sig[j] != 0 && Signals.lightFor(Signals.axisOf(Graph.cellOf(ob), j), tr.clock) != Signals.Green) continue;
                    int ot = o.i + 2 < o.path.Length ? o.path[o.i + 2] : -1;
                    if (!Junctions.conflicts(nd, j, a, to, ob, ot)) continue;
                    if (goesFirst(w, nd, j, o, ob, ot, c, a, to)) { c.why = "yield"; c.held = o; return false; }
                }
            }
            if (to >= 0 && nd.ring[j] == 0)
            {
                double room = exitRoom(w, sc, c);
                if (room < INF && os != null) foreach (var o in os) if (o.jt == to && o.path[o.i] != j) room -= LENGTH[o.kind] + S0;
                if (room < LENGTH[c.kind] + 1) { c.why = "box"; return false; }
            }
            return true;
        }

        static double exitRoom(World w, Scene sc, Car c)
        {
            var p = c.path; int j = p[c.i + 1];
            double dist = 0, moving = 0;
            for (int k = c.i + 1; k + 1 < p.Length && dist < 70; k++)
            {
                int a = p[k], b = p[k + 1]; double L = Junctions.linkLen(a, b);
                if (sc.groups.TryGetValue(keyOf(a, b, laneAhead(w, c, k)), out var g))
                    for (int q = g.Count - 1; q >= 0; q--)
                    {
                        var o = g[q];
                        if (o.v < 2) { c.held = o; return dist + o.t * L - LENGTH[o.kind] / 2 - Junctions.clearOf(w, j) - moving; }
                        moving += LENGTH[o.kind] + S0;
                    }
                dist += L;
            }
            return INF;
        }

        static bool goesFirst(World w, Junctions.Nodes nd, int j, Car o, int ob, int ot, Car c, int a, int to)
        {
            if (nd.sig[j] != 0)
            {
                bool lo = Junctions.turnOf(ob, j, ot) < 0, lc = Junctions.turnOf(a, j, to) < 0;
                if (lo != lc) return lc;
            }
            else
            {
                bool ao = Graph.roadTypeOf(w, ob) == Road.Avenue, ac = Graph.roadTypeOf(w, a) == Road.Avenue;
                if (ao != ac) return ao;
            }
            double ta = c.at < 0 ? INF : c.at, oa = o.at < 0 ? INF : o.at;
            if (oa != ta) return oa < ta;
            return o.look < c.look;
        }
    }
}
