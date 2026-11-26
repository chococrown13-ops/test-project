using System;
using System.Collections.Generic;
using static NaeDosi.Defs;
using static NaeDosi.WorldOps;

namespace NaeDosi
{
    /// <summary>Parking: kerbs first, then 공영주차장/주차타워, the rest circles the block (port of sim/parking.ts).</summary>
    public static class Parking
    {
        public const int CURB_SPACES = 3;
        public static int LOT_SPACES(string kind) => kind == "parking" ? 40 : kind == "parktower" ? 160 : 0;

        public static double parkingDemand(World w, Building b)
        {
            var d = KINDS[b.kind];
            if (d.zone == 0 || b.abandoned || b.occ <= 0) return 0;
            double per = d.zone == Zone.R ? 0.35 : d.zone == Zone.C ? 0.5 : 0.3;
            if (d.level == 3) per *= 0.2;
            int t = w.transit[b.y * N + b.x];
            if (t == 2) per *= 0.6; else if (t == 1) per *= 0.85;
            return Math.Floor(b.occ * per + 0.5);
        }

        public static int curbCapacity(World w, int i)
        {
            int t = w.road[i];
            if (t == 0 || w.ground[i] != Ground.Land || w.diag[i] != 0 || w.roadAlt[i] != 0) return 0;
            if (t == Road.Avenue && w.noAvenueParking) return 0;
            if (t == Road.Highway) return 0;
            if (Curves.curveInfo(w).chain[i] != 0) return 0;
            if (w.roundabouts.Count > 0 && Roundabouts.roundaboutAt(w, (i % N) * 10 + 5, (i / N) * 10 + 5, 5) != null) return 0;
            int x = i % N, y = i / N;
            bool r(int dx, int dy) { int nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < N && ny < N && w.road[ny * N + nx] != 0; }
            bool e = r(1, 0), wv = r(-1, 0), n = r(0, -1), s = r(0, 1);
            if ((e ? 1 : 0) + (wv ? 1 : 0) + (n ? 1 : 0) + (s ? 1 : 0) >= 3) return 0;
            if ((e || wv) && (n || s)) return 0;
            return CURB_SPACES;
        }

        sealed class Lot { public Building b; public double free; public double cx, cy; }
        sealed class Left { public Building b; public double want, d; public int a = -1; }

        public static void updateParking(World w)
        {
            var net = Network.network(w);
            int NN = Graph.NN;
            var free = new short[NN];
            for (int i = 0; i < NN; i++) free[i] = (short)curbCapacity(w, i);
            var cap = (short[])free.Clone();
            var lots = new List<Lot>();
            foreach (var b in w.buildings.Values)
            {
                int sp = LOT_SPACES(b.kind);
                if (sp > 0 && net.access.ContainsKey(b.id)) { b.occ = 0; lots.Add(new Lot { b = b, free = sp, cx = b.x + 0.5, cy = b.y + 0.5 }); }
            }
            int worst = -1; double worstD = 0;
            Array.Clear(w.parkPress, 0, w.parkPress.Length);
            double demand = 0, unmet = 0;
            var seen = new int[NN];
            for (int i = 0; i < NN; i++) seen[i] = -1;
            var left = new List<Left>();
            foreach (var b in w.buildings.Values)
            {
                double want = parkingDemand(w, b);
                if (want == 0) continue;
                demand += want;
                double d = want;
                int a = net.access.TryGetValue(b.id, out int aa) ? aa : -1;
                if (a >= 0)
                {
                    var q = new List<int> { a }; int depth = 0;
                    seen[a] = b.id;
                    while (d > 0 && q.Count > 0 && depth <= 3)
                    {
                        var next = new List<int>();
                        foreach (int c in q)
                        {
                            if (free[c] > 0) { double k = Math.Min(d, free[c]); free[c] -= (short)k; d -= k; if (d == 0) break; }
                            Graph.forEachNeighbour(w, c, (m, _) => { if (m < NN && seen[m] != b.id) { seen[m] = b.id; next.Add(m); } });
                        }
                        q = next; depth++;
                    }
                }
                left.Add(new Left { b = b, want = want, d = d, a = a });
            }
            foreach (var e in left)
            {
                var b = e.b;
                if (e.d > 0 && e.a >= 0)
                {
                    double ccx = b.x + bw(b) / 2.0, ccy = b.y + bh(b) / 2.0;
                    foreach (var l in lots)
                    {
                        if (e.d == 0) break;
                        if (l.free <= 0 || Math.Max(Math.Abs(l.cx - ccx), Math.Abs(l.cy - ccy)) > 5) continue;
                        double k = Math.Min(e.d, l.free);
                        l.free -= k; l.b.occ += k; e.d -= k;
                    }
                }
                unmet += e.d;
                if (e.d > worstD) { worstD = e.d; worst = b.y * N + b.x; }
                byte p = (byte)Math.Floor((e.d / e.want) * 100 + 0.5);
                for (int y = b.y; y < b.y + bh(b); y++) for (int x = b.x; x < b.x + bw(b); x++) w.parkPress[y * N + x] = p;
                if (e.a >= 0) w.parkPress[e.a] = Math.Max(w.parkPress[e.a], p);
            }
            double curb = 0;
            for (int i = 0; i < NN; i++) { w.parked[i] = (byte)(cap[i] - free[i]); curb += cap[i]; }
            w.stats.parkDemand = demand;
            w.stats.parkUnmet = unmet;
            w.stats.parkWorst = worst;
            w.stats.parkCurb = curb;
        }

        public static double parkedSqueeze(World w, int node) => node < Graph.NN && w.parked[node] != 0 ? 1 - 0.33 * (w.parked[node] / (double)CURB_SPACES) : 1;
    }

    /// <summary>재해: 화재 and 한파 (port of sim/hazards.ts).</summary>
    public static class Hazards
    {
        public const int SNOW_RADIUS = 18;
        const double SALT_COST = 0.35;
        const int BURN_DAYS = 5;

        static int cellOf(Building b) => idx(b.x, b.y);
        static bool covered(World w, Building b)
        {
            for (int y = b.y; y < b.y + bh(b); y++) for (int x = b.x; x < b.x + bw(b); x++) if (w.fire[idx(x, y)] != 0) return true;
            return false;
        }

        public static void stepHazards(World w)
        {
            w.snow ??= new byte[N * N];
            stepFires(w);
            stepCold(w);
        }

        static void stepFires(World w)
        {
            var burning = new List<Building>();
            foreach (var b in w.buildings.Values) if (b.burn != 0) burning.Add(b);
            foreach (var b in burning)
            {
                b.burn += 1;
                if (covered(w, b))
                {
                    if (b.burn >= 2) { b.burn = 0; w.ver.buildings++; }
                    continue;
                }
                if (b.burn >= BURN_DAYS)
                {
                    notify(w, $"불을 끄지 못해서 {KINDS[b.kind].name} 건물이 다 타 버렸어요. 소방서를 지어 주세요.", "warn", cellOf(b), "fire");
                    Tools.demolish(w, b.id);
                    continue;
                }
                if (rand(w) < 0.12)
                {
                    int x = b.x - 1 + (int)Math.Floor(rand(w) * (bw(b) + 2)), y = b.y - 1 + (int)Math.Floor(rand(w) * (bh(b) + 2));
                    if (inside(x, y) && w.buildings.TryGetValue(w.bld[idx(x, y)], out var nb) && nb.burn == 0 && KINDS[nb.kind].zone != 0) { nb.burn = 1; w.ver.buildings++; }
                }
            }
            if (w.noHazards || w.stats.pop < 400 || burning.Count >= 3) return;
            foreach (var b in w.buildings.Values)
            {
                var d = KINDS[b.kind];
                if (d.zone == 0 || b.burn != 0 || b.abandoned || b.occ == 0) continue;
                bool cov = covered(w, b);
                double p = (cov ? 0.000004 : 0.00004) * (d.zone == Zone.I ? 2 : 1);
                if (rand(w) >= p) continue;
                b.burn = 1;
                w.ver.buildings++;
                if (cov) notify(w, "화재가 났지만 소방차가 바로 출동했어요.", "info", cellOf(b), "fire");
                else notify(w, "화재 발생! 소방서가 닿지 않는 곳이라 불이 번질 수 있어요.", "warn", cellOf(b), "fire");
            }
        }

        static void stepCold(World w)
        {
            int month = Calendar.calendarMonthOf(w.day);
            var c = w.cold;
            if (c != null && w.day >= c.Value.end) w.cold = null;
            bool snowing = w.cold != null && w.day >= w.cold.Value.start;
            if (c != null && w.day == c.Value.start) notify(w, "한파가 시작됐어요. 도로에 눈이 쌓이면 차들이 느려져요.", "warn");
            int coldLast = w.coldLast == int.MinValue ? -99 : w.coldLast;
            if (w.cold == null && !w.noHazards && (month == 12 || month == 1 || month == 2) && w.stats.pop >= 300 && w.day - coldLast > 24 && rand(w) < 0.05)
            {
                int start = w.day + 3, len = 4 + (int)Math.Floor(rand(w) * 3);
                w.cold = (start, start + len);
                w.coldLast = start;
                notify(w, $"사흘 뒤 한파와 폭설이 예보됐어요({len}일). 제설기지가 있으면 반경 안 도로의 눈을 치워요.", "warn");
            }
            var s = w.snow;
            bool any = false;
            for (int i = 0; i < N * N; i++)
            {
                if (w.road[i] == 0 && w.roadAlt[i] == 0) { s[i] = 0; continue; }
                int v = snowing ? Math.Min(100, s[i] + 24) : Math.Max(0, s[i] - 14);
                s[i] = (byte)v;
                if (v != 0) any = true;
            }
            if (!any) return;
            double cleared = 0;
            foreach (var b in w.buildings.Values)
            {
                if (b.kind != "snowbase" || !b.powered) continue;
                double ccx = b.x + bw(b) / 2.0, ccy = b.y + bh(b) / 2.0; int r = SNOW_RADIUS;
                for (int y = (int)Math.Floor(ccy - r); y <= (int)Math.Ceiling(ccy + r); y++)
                    for (int x = (int)Math.Floor(ccx - r); x <= (int)Math.Ceiling(ccx + r); x++)
                    {
                        if (!inside(x, y) || Geom.Hypot(x + 0.5 - ccx, y + 0.5 - ccy) > r) continue;
                        int i = idx(x, y);
                        if (s[i] == 0) continue;
                        int take = Math.Min((int)s[i], 40);
                        s[i] -= (byte)take;
                        cleared += take;
                    }
            }
            w.month.expSnow += (cleared / 100) * SALT_COST;
        }

        public static double snowSlow(World w, int cell) => w.snow != null && cell >= 0 && cell < N * N ? 1 - w.snow[cell] * 0.0045 : 1;
        public static bool snowingNow(World w) => w.cold != null && w.day >= w.cold.Value.start && w.day < w.cold.Value.end;
    }
}
