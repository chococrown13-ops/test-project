using System;
using System.Collections.Generic;
using static NaeDosi.Defs;

namespace NaeDosi
{
    public sealed class Building
    {
        public int id;
        public string kind;
        public int x, y, size;
        /// <summary>Footprint along x and y when it isn't the kind's square (0: same as size).</summary>
        public int sx, sy;
        public int floors;
        public double look;
        public double occ;
        public bool powered, watered, sewered;
        public double happy;
        public double outage;
        public bool abandoned;
        public int builtDay;
        /// <summary>Days on fire (0: not burning).</summary>
        public double burn;
    }

    public sealed class Loan { public double left, pay, months, amount; }

    public sealed class MonthReport
    {
        public int month;
        public double incR, incC, incI, incT, incV, incG, incS, incH;
        public double expRoads, expFacilities, expServices, expTransit, expDebt, expSnow;
        public double pop, jobs;
    }

    public sealed class Notice { public int day; public string text; public string tone; public int at = -1; public string overlay; }

    public sealed class Curve
    {
        public double ax, az, cx, cz, bx, bz;
        public int t;
        public List<int> cells = new List<int>();
        public List<int> own = new List<int>();
    }

    public sealed class Roundabout { public int cell; public int t; }

    public sealed class Festival { public string kind, name; public double x, z; public int until, days; public double visitors, spend; }

    public sealed class TransitLine
    {
        public int id;
        public string kind;      // "bus" | "metro"
        public string name, color;
        public List<int> stops = new List<int>();
        public string bus;       // village | branch | trunk | express (null: branch)
        public double ridersMonth, riders;
    }

    public sealed class RealLand { public byte[] cells; public int row; public string id, name, prov; public double lat, lon; }

    public sealed class Stats
    {
        public double pop, jobs, workers, employed, powerSupply, powerUse, waterSupply, waterUse, sewageCap, sewageUse;
        public double happy = 60, commute, congestion, parkDemand, parkUnmet, parkCurb;
        public int parkWorst = -1;
    }

    public sealed class Ver { public int roads = 1, zones = 1, buildings = 1, transit = 1; }

    /// <summary>The whole city: the grids, the buildings, the money and the calendar (port of sim/world.ts).</summary>
    public sealed class World
    {
        public string name;
        public double seed;
        public string map;
        public RealLand real;
        public uint rng;
        public int day;
        public double money;
        public string slot;
        public List<Loan> loans = new List<Loan>();
        public byte[] ground, road, roadAlt, altLevel, diag, oneway, hwy, snow;
        public double tollPass;
        public (int start, int end)? cold;
        public int coldLast = int.MinValue;
        public bool noHazards;
        public List<Curve> curves = new List<Curve>();
        public List<Roundabout> roundabouts = new List<Roundabout>();
        public byte[] zone, parked, parkPress, trees, civic;
        public Festival festival;
        public double bikeMonth, bikeLast, intercityMonth, intercityLast;
        public bool noAvenueParking;
        public int[] bld;
        public float[] land, traffic, pollution;
        public byte[] edu, safety, fire, health, transit;
        public List<TransitLine> lines = new List<TransitLine>();
        public int nextLine = 1;
        public bool transferDiscount = true;
        public double transfersMonth, transfers;
        /// <summary>By id, in id order (the web game's Map iterates in insertion order, and ids only grow).</summary>
        public SortedDictionary<int, Building> buildings = new SortedDictionary<int, Building>();
        public int nextId = 1;
        public double taxR = 9, taxC = 9, taxI = 9;
        public double demR = 60, demC = 25, demI = 35;
        public Stats stats = new Stats();
        public List<MonthReport> reports = new List<MonthReport>();
        public MonthReport month = new MonthReport();
        public List<Notice> notices = new List<Notice>();
        public Ver ver = new Ver();
        public List<int> milestones = new List<int>();
        public int goal, chapterPaid; public bool hasGoal, hasChapterPaid;
        public List<string> achieved;
        public bool everLoan;
        public List<string> specs;

        public byte[] Service(string key) => key switch { "edu" => edu, "safety" => safety, "fire" => fire, _ => health };
        public double Tax(int z) => z == Zone.R ? taxR : z == Zone.C ? taxC : taxI;
        public double Demand(int z) => z == Zone.R ? demR : z == Zone.C ? demC : demI;
    }

    public static class WorldOps
    {
        public static int idx(int x, int y) => y * N + x;
        public static int bw(Building b) => b.sx > 0 ? b.sx : b.size;
        public static int bh(Building b) => b.sy > 0 ? b.sy : b.size;
        public static int bw(int size, int sx) => sx > 0 ? sx : size;
        public static double lotsOf(Building b) => (bw(b) * bh(b)) / (double)(b.size * b.size);
        public static bool inside(int x, int y) => x >= 0 && y >= 0 && x < N && y < N;
        public static int cx(int i) => i % N;
        public static int cy(int i) => i / N;

        /// <summary>Deterministic RNG stored in the world so saves replay the same way (mulberry32, as in the web game).</summary>
        public static double rand(World w)
        {
            unchecked
            {
                w.rng = w.rng + 0x6d2b79f5u;
                uint t = w.rng;
                t = (uint)((int)(t ^ (t >> 15)) * (int)(t | 1));
                t ^= t + (uint)((int)(t ^ (t >> 7)) * (int)(t | 61));
                return (t ^ (t >> 14)) / 4294967296.0;
            }
        }

        public static MonthReport emptyMonth(int month) => new MonthReport { month = month };

        public static World createWorld(double seed = 20261028, string name = "새솔시", string map = "river")
        {
            int size = N * N;
            var w = new World
            {
                name = name, seed = seed, map = map, rng = unchecked((uint)(long)seed), day = 0, money = START_MONEY,
                ground = new byte[size], road = new byte[size], roadAlt = new byte[size], altLevel = new byte[size],
                diag = new byte[size], oneway = new byte[size], hwy = new byte[size], snow = new byte[size],
                parked = new byte[size], parkPress = new byte[size], trees = new byte[size], civic = new byte[size],
                zone = new byte[size], bld = new int[size], land = new float[size], traffic = new float[size], pollution = new float[size],
                edu = new byte[size], safety = new byte[size], fire = new byte[size], health = new byte[size], transit = new byte[size],
                month = emptyMonth(0),
            };
            for (int i = 0; i < size; i++) w.bld[i] = -1;
            var wet = Maps.waterMask(seed, map);
            for (int i = 0; i < size; i++) if (wet[i] != 0) w.ground[i] = Ground.Water;
            var hills = Maps.hillField(seed, map);
            for (int i = 0; i < size; i++) if (hills[i] > 0 && w.ground[i] == Ground.Land) w.ground[i] = Ground.Mountain;
            int row = Maps.startRow(seed, map);
            for (int x = 0; x <= 22; x++) w.road[idx(x, row)] = Road.Avenue;
            return w;
        }

        public static float[] terrainField(World w)
        {
            if (w.real == null) return Maps.hillField(w.seed, w.map);
            var h = new float[N * N];
            for (int i = 0; i < N * N; i++) { int v = w.real.cells[i]; h[i] = v >= 3 ? (v - 3) * 2 : 0; }
            return h;
        }

        public static World createRealWorld(double seed, string name, RealLand real)
        {
            var w = createWorld(seed, name, "plain");
            w.map = "korea";
            w.real = real;
            Array.Clear(w.ground, 0, w.ground.Length);
            Array.Clear(w.road, 0, w.road.Length);
            for (int i = 0; i < N * N; i++) { int v = real.cells[i]; w.ground[i] = (byte)(v == 2 ? Ground.Water : v >= 3 ? Ground.Mountain : Ground.Land); }
            for (int x = 0; x <= 22; x++) w.road[idx(x, real.row)] = Road.Avenue;
            return w;
        }

        public static int startRowOf(World w) => w.real != null ? w.real.row : Maps.startRow(w.seed, w.map);

        public static void notify(World w, string text, string tone = "info", int at = -1, string overlay = null)
        {
            w.notices.Insert(0, new Notice { day = w.day, text = text, tone = tone, at = at, overlay = overlay });
            if (w.notices.Count > 40) w.notices.RemoveRange(40, w.notices.Count - 40);
        }

        public static int accessRoad(World w, int bx, int by, int W, int H)
        {
            for (int k = 0; k < Math.Max(W, H); k++)
            {
                var cand = new List<(int, int)>();
                if (k < W) { cand.Add((bx + k, by - 1)); cand.Add((bx + k, by + H)); }
                if (k < H) { cand.Add((bx - 1, by + k)); cand.Add((bx + W, by + k)); }
                foreach (var (x, y) in cand) if (inside(x, y) && w.road[idx(x, y)] != 0) return idx(x, y);
            }
            return -1;
        }
        public static int accessRoad(World w, Building b) => accessRoad(w, b.x, b.y, bw(b), bh(b));

        public static double Cap(KindDef d) => d.hasResidents ? d.residents : d.hasJobs ? d.jobs : 0;
    }
}
