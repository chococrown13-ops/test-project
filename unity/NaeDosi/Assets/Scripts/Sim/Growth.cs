using System;
using System.Collections.Generic;
using System.Linq;
using static NaeDosi.Defs;
using static NaeDosi.WorldOps;

namespace NaeDosi
{
    /// <summary>Land value, demand, buildings growing and rebuilding, daily life of each building (port of sim/growth.ts).</summary>
    public static class Growth
    {
        static readonly Dictionary<int, string[]> LEVEL_KIND = new Dictionary<int, string[]>
        {
            [Zone.R] = new[] { "r1", "r2", "r3" }, [Zone.C] = new[] { "c1", "c2", "c3" }, [Zone.I] = new[] { "i1", "i2", "i3" },
        };

        public static int TIER_POP(int lv) => lv == 2 ? 2500 : 10000;
        public static int MATURE(int lv) => lv == 1 ? 180 : 360;
        static double UPGRADE_CHANCE(int lv) => lv == 1 ? 0.05 : 0.03;
        static int TIER_FLAG(int lv) => -20 - lv;
        public static bool tierOpen(World w, int lv) => lv <= 1 || w.milestones.Contains(TIER_FLAG(lv));
        static readonly Dictionary<int, string> TIER_NEWS = new Dictionary<int, string>
        {
            [2] = "2단계가 열렸어요! 이제 빌라·저층 아파트, 근린 상가 빌딩, 2차 산업(제조 공장)이 들어설 수 있어요.",
            [3] = "3단계가 열렸어요! 이제 고층 아파트·주상복합, 오피스 타워, 3차 산업(지식산업센터·물류·데이터센터)이 들어설 수 있어요.",
        };

        static void openTiers(World w)
        {
            foreach (int lv in new[] { 2, 3 })
            {
                if (tierOpen(w, lv) || w.stats.pop < TIER_POP(lv)) continue;
                w.milestones.Add(TIER_FLAG(lv));
                notify(w, $"인구 {Won(TIER_POP(lv))}명! {TIER_NEWS[lv]}", "good");
            }
        }

        // ------------------------------------------------------------ land value

        static readonly Dictionary<string, (double r, double s)> EMIT = new Dictionary<string, (double, double)>
        { ["i1"] = (3, 5), ["i2"] = (5, 28), ["i3"] = (3, 8), ["coal"] = (9, 55), ["sewage"] = (5, 30) };

        static double clamp(double v, double a, double b) => Math.Max(a, Math.Min(b, v));

        public static void updateLand(World w)
        {
            int size = N * N;
            Array.Clear(w.pollution, 0, size);
            Array.Clear(w.edu, 0, size); Array.Clear(w.safety, 0, size); Array.Clear(w.fire, 0, size); Array.Clear(w.health, 0, size);
            var bonus = new float[size];
            void stamp(double ccx, double ccy, double r, Action<int, double> fn)
            {
                for (int y = (int)Math.Floor(ccy - r); y <= (int)Math.Ceiling(ccy + r); y++)
                    for (int x = (int)Math.Floor(ccx - r); x <= (int)Math.Ceiling(ccx + r); x++)
                    {
                        if (!inside(x, y)) continue;
                        double d = Geom.Hypot(x + 0.5 - ccx, y + 0.5 - ccy);
                        if (d <= r) fn(idx(x, y), 1 - d / (r + 1));
                    }
            }
            var treed = new List<int>();
            for (int i = 0; i < size; i++) if (w.trees[i] != 0 && w.road[i] != 0) treed.Add(i);
            foreach (int i in treed) stamp((i % N) + 0.5, (i / N) + 0.5, 2, (j, f) => { bonus[j] = (float)(bonus[j] + 3 * f); });
            foreach (var b in w.buildings.Values)
            {
                double ccx = b.x + bw(b) / 2.0, ccy = b.y + bh(b) / 2.0;
                if (EMIT.TryGetValue(b.kind, out var e) && !b.abandoned)
                    stamp(ccx, ccy, e.r + Math.Max(bw(b), bh(b)) / 2.0, (i, f) => { w.pollution[i] = (float)Math.Min(100, w.pollution[i] + e.s * f); });
                if (SERVICE.TryGetValue(b.kind, out var s) && b.powered)
                {
                    var arr = w.Service(s.key);
                    stamp(ccx, ccy, s.radius, (i, f) => { arr[i] = 1; bonus[i] = (float)(bonus[i] + s.value * Math.Min(1, f * 2)); });
                }
                if (b.kind == "park") stamp(ccx, ccy, 4, (i, f) => { bonus[i] = (float)(bonus[i] + 14 * f); });
                if (LANDMARK.TryGetValue(b.kind, out var lm)) stamp(ccx, ccy, lm.radius, (i, f) => { bonus[i] = (float)(bonus[i] + lm.value * Math.Min(1, f * 1.6)); });
                if (b.kind.StartsWith("c") && !b.abandoned)
                {
                    int lv = KINDS[b.kind].level == 0 ? 1 : KINDS[b.kind].level;
                    stamp(ccx, ccy, 4, (i, f) => { bonus[i] = (float)(bonus[i] + 4 * f * lv); });
                }
            }
            Transit.transitLandBonus(w, bonus);
            Attractions.updateCivic(w);
            foreach (int i in Pockets.pockets(w)) stamp((i % N) + 0.5, (i / N) + 0.5, 2, (j, f) => { bonus[j] = (float)(bonus[j] + 3 * f); });
            var waterDist = distanceTo(i => w.ground[i] == Ground.Water, 6);
            var hillDist = distanceTo(i => w.ground[i] == Ground.Mountain, 5);
            foreach (int i in treed) stamp((i % N) + 0.5, (i / N) + 0.5, 1.5, (j, f) => { w.pollution[j] = (float)(w.pollution[j] * (1 - 0.3 * f)); });
            for (int i = 0; i < size; i++)
            {
                if (w.ground[i] != Ground.Land) { w.land[i] = 0; continue; }
                double view = (waterDist[i] <= 5 ? (6 - waterDist[i]) * 3 : 0) + (hillDist[i] <= 4 ? (5 - hillDist[i]) * 2 : 0);
                double noise = w.traffic[i] * 6 + neighbourTraffic(w, i) * 4;
                double parking = w.parkPress[i] * 0.1;
                w.land[i] = (float)clamp(32 + view + bonus[i] - w.pollution[i] * 0.6 - noise - parking, 0, 100);
            }
        }

        static double neighbourTraffic(World w, int i)
        {
            int x = i % N, y = i / N;
            double m = 0;
            if (x > 0) m = Math.Max(m, w.traffic[i - 1]);
            if (x < N - 1) m = Math.Max(m, w.traffic[i + 1]);
            if (y > 0) m = Math.Max(m, w.traffic[i - N]);
            if (y < N - 1) m = Math.Max(m, w.traffic[i + N]);
            return Math.Min(1.5, m);
        }

        static byte[] distanceTo(Func<int, bool> hit, int cap)
        {
            var d = new byte[N * N];
            for (int i = 0; i < d.Length; i++) d[i] = (byte)cap;
            var q = new List<int>();
            for (int i = 0; i < N * N; i++) if (hit(i)) { d[i] = 0; q.Add(i); }
            for (int h = 0; h < q.Count; h++)
            {
                int c = q[h], x = c % N, y = c / N;
                if (d[c] >= cap) continue;
                for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++)
                    {
                        int nx = x + dx, ny = y + dy;
                        if (!inside(nx, ny)) continue;
                        int n = idx(nx, ny);
                        if (d[n] > d[c] + 1) { d[n] = (byte)(d[c] + 1); q.Add(n); }
                    }
            }
            return d;
        }

        // ---------------------------------------------------------------- demand

        public static void updateDemand(World w)
        {
            var s = w.stats;
            double jobsC = 0, jobsI = 0, capC = 0, capI = 0;
            foreach (var b in w.buildings.Values)
            {
                var d = KINDS[b.kind];
                if (b.abandoned || !d.hasJobs) continue;
                if (d.zone == Zone.C) { jobsC += b.occ; capC += d.jobs * lotsOf(b); }
                if (d.zone == Zone.I) { jobsI += b.occ; capI += d.jobs * lotsOf(b); }
            }
            double pop = s.pop;
            double workers = pop * 0.52;
            double jobsCap = capC + capI;
            double taxAdj(double t) => (9 - t) * 5;
            double early = Math.Max(0, 40 - pop / 50);
            double R = early + ((jobsCap * 1.05 - workers) / Math.Max(40, workers)) * 70 + 12 + taxAdj(w.taxR) + (s.happy - 60) * 0.6;
            double C = ((pop * 0.22 - capC) / Math.Max(25, pop * 0.22)) * 85 + taxAdj(w.taxC) + Math.Min(20, early) + Attractions.hubDemand(w);
            double I = ((workers * 0.55 - capI) / Math.Max(25, workers * 0.55)) * 85 + taxAdj(w.taxI) + Math.Min(25, early);
            double ease(double o, double n) => o + (clamp(n, -100, 100) - o) * 0.25;
            var sp = Special.specDemand(w);
            w.demR = ease(w.demR, R + sp.R);
            w.demC = ease(w.demC, C + sp.C);
            w.demI = ease(w.demI, I + sp.I);
            s.workers = workers;
            s.jobs = jobsCap;
            s.employed = jobsC + jobsI;
        }

        // ---------------------------------------------------------------- growth

        static List<int> zoned = new List<int>();
        static int zonedVer = -1;
        static World zonedW;

        public static void grow(World w)
        {
            if (zonedVer != w.ver.zones || zonedW != w)
            {
                zoned = new List<int>();
                for (int i = 0; i < N * N; i++) if (w.zone[i] != 0) zoned.Add(i);
                zonedVer = w.ver.zones; zonedW = w;
            }
            openTiers(w);
            if (zoned.Count == 0) return;
            var net = Network.network(w);
            int tries = Math.Min(zoned.Count, 30 + (zoned.Count >> 4));
            for (int t = 0; t < tries; t++)
            {
                int i = zoned[(int)(rand(w) * zoned.Count)];
                int z = w.zone[i];
                if (z == 0) continue;
                double dem = w.Demand(z);
                int id = w.bld[i];
                int x = i % N, y = i / N;
                if (id < 0)
                {
                    if (dem <= 0 || rand(w) > dem / 100 * 0.6) continue;
                    string kind = LEVEL_KIND[z][0];
                    if (!Pockets.onRoad(w, i)) continue;
                    int a = Network.findAccess(w, x, y, 1, 1);
                    if (a < 0 || !net.outside.Contains(net.comp[a])) continue;
                    Tools.addBuilding(w, kind, x, y);
                    continue;
                }
                var b = w.buildings[id];
                var d = KINDS[b.kind];
                int lvl = d.level == 0 ? 3 : d.level;
                if (d.zone == 0 || b.abandoned || lvl >= 3) continue;
                int lv = d.level == 0 ? 1 : d.level;
                if (!tierOpen(w, lv + 1) || w.day - b.builtDay < MATURE(lv)) continue;
                if (!b.powered || !b.watered || b.happy < 52 || dem < 5 || rand(w) > UPGRADE_CHANCE(lv)) continue;
                double need = (z == Zone.R ? new double[] { 30, 46 } : z == Zone.C ? new double[] { 26, 40 } : new double[] { 0, 15 })[lv - 1];
                if (w.land[i] < need) continue;
                if (d.level == 1) { if (!tryPair(w, b, z)) upgradeInPlace(w, b, LEVEL_KIND[z][1]); continue; }
                tryMerge(w, b, z);
            }
        }

        static void upgradeInPlace(World w, Building b, string kind)
        {
            int x = b.x, y = b.y;
            double occ = b.occ;
            Tools.demolish(w, b.id);
            var nb = Tools.addBuilding(w, kind, x, y);
            nb.occ = occ;
            nb.powered = true; nb.watered = true;
        }

        static bool tryPair(World w, Building b, int z)
        {
            if (bw(b) != 1 || bh(b) != 1 || rand(w) > 0.4) return false;
            var net = Network.network(w);
            if (!net.access.TryGetValue(b.id, out int a)) return false;
            int ax = a % N, ay = a / N;
            bool alongX = Math.Abs(ay - b.y) >= Math.Abs(ax - b.x);
            foreach (int s in rand(w) < 0.5 ? new[] { 1, -1 } : new[] { -1, 1 })
            {
                int nx = b.x + (alongX ? s : 0), ny = b.y + (alongX ? 0 : s);
                if (!inside(nx, ny)) continue;
                int j = idx(nx, ny);
                if (w.zone[j] != z || w.road[j] != 0) continue;
                int id = w.bld[j];
                Building o = id >= 0 ? w.buildings[id] : null;
                if (o != null && (bw(o) != 1 || bh(o) != 1 || o.abandoned || (KINDS[o.kind].level == 0 ? 3 : KINDS[o.kind].level) > 2 || KINDS[o.kind].zone != z)) continue;
                int x0 = Math.Min(b.x, nx), y0 = Math.Min(b.y, ny);
                int sx = alongX ? 2 : 1, sy = alongX ? 1 : 2;
                if (Network.findAccess(w, x0, y0, sx, sy) < 0 || !Pockets.fronts(w, x0, y0, sx, sy)) continue;
                double occ = b.occ + (o?.occ ?? 0);
                Tools.demolish(w, b.id);
                if (o != null) Tools.demolish(w, o.id);
                var nb = Tools.addBuilding(w, LEVEL_KIND[z][1], x0, y0, sx, sy);
                nb.occ = occ;
                nb.powered = true; nb.watered = true;
                return true;
            }
            return false;
        }

        static void tryMerge(World w, Building b, int z)
        {
            string top = LEVEL_KIND[z][2];
            var shapes = rand(w) < 0.5 ? new[] { (3, 3), (3, 2), (2, 3), (2, 2) } : new[] { (3, 3), (2, 3), (3, 2), (2, 2) };
            foreach (var (sx, sy) in shapes)
            {
                for (int x0 = b.x + bw(b) - sx; x0 <= b.x; x0++) for (int y0 = b.y + bh(b) - sy; y0 <= b.y; y0++)
                    {
                        if (!inside(x0, y0) || !inside(x0 + sx - 1, y0 + sy - 1)) continue;
                        var cells = Tools.footprint(x0, y0, sx, sy);
                        int built = 0;
                        bool ok = true;
                        foreach (int i in cells)
                        {
                            if (w.zone[i] != z || w.road[i] != 0) { ok = false; break; }
                            int id = w.bld[i];
                            if (id < 0) continue;
                            var o = w.buildings[id];
                            int lv = KINDS[o.kind].level;
                            if (o.abandoned || lv < 2 || lv >= 3) { ok = false; break; }
                            if (o.x < x0 || o.y < y0 || o.x + bw(o) > x0 + sx || o.y + bh(o) > y0 + sy) { ok = false; break; }
                            built++;
                        }
                        if (!ok || built < (int)Math.Ceiling((sx * sy) / 2.0)) continue;
                        if (Network.findAccess(w, x0, y0, sx, sy) < 0 || !Pockets.fronts(w, x0, y0, sx, sy)) continue;
                        double occ = 0;
                        var ids = new List<int>(); var seen = new HashSet<int>();
                        foreach (int i in cells) if (w.bld[i] >= 0 && seen.Add(w.bld[i])) ids.Add(w.bld[i]);
                        foreach (int id in ids) { occ += w.buildings[id].occ; Tools.demolish(w, id); }
                        var nb = Tools.addBuilding(w, top, x0, y0, sx, sy);
                        nb.occ = occ;
                        nb.powered = true; nb.watered = true;
                        if (top == "r3" && !w.milestones.Contains(-3)) { w.milestones.Add(-3); notify(w, "첫 고층 아파트가 들어섰어요!", "good"); }
                        if (top == "c3" && !w.milestones.Contains(-4)) { w.milestones.Add(-4); notify(w, "첫 오피스 타워가 올라갔어요!", "good"); }
                        return;
                    }
            }
        }

        // -------------------------------------------------------- daily buildings

        public static void updateBuildings(World w)
        {
            var s = w.stats;
            double pop = 0, happySum = 0, happyN = 0;
            double jobCap = s.jobs != 0 ? s.jobs : 1;
            double fill = Math.Min(1, (s.workers * 1.1 + 40) / jobCap);
            var toRemove = new List<int>();
            var buried = Pockets.clearBackland(w, rand(w));
            if (buried != null) Tools.demolish(w, buried.id);
            foreach (var b in w.buildings.Values)
            {
                var d = KINDS[b.kind];
                if (d.zone == 0) continue;
                int i = idx(b.x, b.y);
                bool @out = !b.powered || !b.watered;
                b.outage = @out ? b.outage + 1 : Math.Max(0, b.outage - 3);
                double h = 60;
                h += b.powered ? 6 : -28;
                h += b.watered ? 6 : -28;
                h += b.sewered ? 3 : -8;
                h += (w.land[i] - 40) * 0.35;
                h -= w.pollution[i] * (d.zone == Zone.R ? 0.35 : 0.05);
                if (d.zone == Zone.R)
                {
                    h += w.edu[i] != 0 ? 6 : -3;
                    h += w.safety[i] != 0 ? 4 : -2;
                    h += w.health[i] != 0 ? 4 : -2;
                    h += w.fire[i] != 0 ? 2 : -1;
                    h += Special.specHappy(w);
                    h += w.transit[i] == 2 ? 4 : w.transit[i] != 0 ? 2 : 0;
                    h -= Math.Max(0, s.commute - 35) * 0.6;
                }
                h += Attractions.civicHappiness(w, i, d.zone == Zone.R);
                h -= w.parkPress[i] * 0.08;
                if (!Network.reachesOutside(w, b)) h -= 30;
                b.happy += (clamp(h, 0, 100) - b.happy) * 0.15;
                if (!b.abandoned && b.outage > 40) { b.abandoned = true; b.occ = 0; w.ver.buildings++; }
                else if (b.abandoned && !@out && b.happy > 40) { b.abandoned = false; w.ver.buildings++; }
                if (b.abandoned && w.day - b.builtDay > 240 && rand(w) < 0.01) toRemove.Add(b.id);
                double cap = Cap(d) * lotsOf(b);
                if (d.zone == Zone.R)
                {
                    double target = b.abandoned ? 0 : cap * (b.happy > 30 ? 1 : 0.5) * (w.demR > -40 ? 1 : 0.85);
                    b.occ += (target - b.occ) * 0.06;
                    pop += b.occ;
                    happySum += b.happy * b.occ;
                    happyN += b.occ;
                }
                else
                {
                    double target = b.abandoned ? 0 : cap * fill;
                    b.occ += (target - b.occ) * 0.1;
                }
            }
            foreach (int id in toRemove) Tools.demolish(w, id);
            s.pop = Math.Floor(pop + 0.5);
            s.happy = happyN != 0 ? happySum / happyN : 60;
        }
    }

    /// <summary>Money: daily income and spending, loans, closing the month (port of sim/economy.ts).</summary>
    public static class Economy
    {
        static double TAX_BASE(int z) => z == Zone.R ? 1.0 : z == Zone.C ? 1.5 : 1.3;

        public static void accrueDay(World w)
        {
            var m = w.month;
            foreach (var b in w.buildings.Values)
            {
                var d = KINDS[b.kind];
                if (d.zone != 0 && !b.abandoned)
                {
                    double pay = b.burn != 0 ? 0 : b.powered && b.watered ? 1 : 0.4;
                    double v = (b.occ * TAX_BASE(d.zone) * (w.Tax(d.zone) / 10) * pay) / 30;
                    if (d.zone == Zone.R) m.incR += v; else if (d.zone == Zone.C) m.incC += v; else m.incI += v;
                }
                if (d.upkeep != 0)
                {
                    bool fac = d.power < 0 || d.water < 0 || b.kind == "sewage";
                    if (fac) m.expFacilities += d.upkeep / 30; else m.expServices += d.upkeep / 30;
                }
            }
            foreach (var l in w.lines) m.expTransit += Transit.lineUpkeep(w, l) / 30;
            Attractions.accrueTourism(w);
            m.incS += Special.specIncomeDay(w);
            double roads = 0;
            for (int i = 0; i < N * N; i++)
            {
                if (w.road[i] != 0) roads += ROAD_UPKEEP(w.road[i] == 3 ? 3 : w.road[i]);
                if (w.roadAlt[i] != 0) roads += ROAD_UPKEEP(w.roadAlt[i]) * (w.altLevel[i] == 1 ? 2 : 3);
            }
            m.expRoads += roads / 30;
        }

        public static double grantFor(double pop) => Math.Floor(300 + pop * 0.06 + 0.5);

        public static readonly double[] LOAN_SIZES = { 10000, 30000, 50000 };
        public const int MAX_LOANS = 3;
        const int LOAN_MONTHS = 60; const double LOAN_RATE = 0.035 / 12;

        public static string takeLoan(World w, double amount)
        {
            if (Array.IndexOf(LOAN_SIZES, amount) < 0) return "빌릴 수 없는 금액이에요.";
            if (w.loans.Count >= MAX_LOANS) return $"대출은 {MAX_LOANS}건까지예요. 하나를 다 갚으면 또 빌릴 수 있어요.";
            double pay = Math.Ceiling((amount * LOAN_RATE) / (1 - Math.Pow(1 + LOAN_RATE, -LOAN_MONTHS)));
            w.loans.Add(new Loan { amount = amount, pay = pay, left = pay * LOAN_MONTHS, months = LOAN_MONTHS });
            w.everLoan = true;
            w.money += amount;
            return null;
        }

        public static string repayLoan(World w, int k)
        {
            if (k < 0 || k >= w.loans.Count) return null;
            var l = w.loans[k];
            double owed = Math.Floor(l.pay * ((1 - Math.Pow(1 + LOAN_RATE, -l.months)) / LOAN_RATE) + 0.5);
            if (w.money < owed) return $"갚으려면 {Won(owed)}만 원이 있어야 해요.";
            w.money -= owed;
            w.loans.RemoveAt(k);
            return null;
        }

        public static void closeMonth(World w)
        {
            var m = w.month;
            m.incT = Transit.fareIncome(w);
            m.incH = Math.Floor(w.tollPass * TOLL_FEE + 0.5);
            w.tollPass = 0;
            m.incG = grantFor(w.stats.pop);
            m.expDebt = 0;
            foreach (var l in w.loans) { double p = Math.Min(l.left, l.pay); m.expDebt += p; l.left -= p; l.months--; }
            w.loans = w.loans.Where(l => l.left > 0 && l.months > 0).ToList();
            double income = monthIncome(m), expense = monthExpense(m);
            w.money += Math.Floor(income - expense + 0.5);
            m.pop = w.stats.pop;
            m.jobs = w.stats.jobs;
            w.reports.Add(m);
            if (w.reports.Count > 120) w.reports.RemoveAt(0);
            if (income - expense < 0 && w.money < 5000) notify(w, $"이번 달 {Won(expense - income)}만 원 적자예요. 예산 창에서 세율을 올리거나 지방채(대출)를 받을 수 있어요.", "warn");
            if (w.money < 0) notify(w, "시 재정이 바닥났어요! 새 공사를 할 수 없어요.", "warn");
            w.month = emptyMonth(m.month + 1);
        }

        public static double monthIncome(MonthReport r) => r.incR + r.incC + r.incI + r.incT + r.incV + r.incG + r.incS + r.incH;
        public static double monthExpense(MonthReport r) => r.expRoads + r.expFacilities + r.expServices + r.expTransit + r.expDebt + r.expSnow;
    }
}
