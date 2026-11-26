using System;
using System.Linq;
using static NaeDosi.WorldOps;

namespace NaeDosi
{
    /// <summary>The running city: the world, its traffic, and the clocks (port of sim/sim.ts).</summary>
    public sealed class Sim
    {
        public World w;
        public TrafficState tr;
        public double acc;
        public double clock; // 0-24
    }

    public static class SimLoop
    {
        /// <summary>Real seconds per game day at 1x.</summary>
        public const double DAY_SECONDS = 1.2;
        /// <summary>Real seconds per visual day/night cycle at 1x.</summary>
        public const double CLOCK_SECONDS = 72;
        /// <summary>How fast game time runs at 1x against real time.</summary>
        public const double GAME_PACE = 0.7;

        public static Sim createSim(World w)
        {
            var s = new Sim { w = w, tr = Traffic.createTraffic(), acc = 0, clock = 9 };
            Network.updateUtilities(w);
            Growth.updateLand(w);
            Parking.updateParking(w);
            return s;
        }

        public static readonly (int n, string text, double grant)[] MILESTONES =
        {
            (100, "첫 주민 100명! 작은 마을이 생겼어요.", 3000),
            (1000, "인구 1,000명 돌파! 이제 어엿한 동네예요.", 8000),
            (5000, "인구 5,000명! 소도시로 성장했어요.", 15000),
            (20000, "인구 2만 명! 도시라고 불러도 되겠어요.", 30000),
            (50000, "인구 5만 명! 대도시를 향해 가고 있어요.", 50000),
            (100000, "인구 10만 명! 대도시 달성!", 100000),
        };

        public static void stepDay(Sim s)
        {
            var w = s.w;
            w.day += 1;
            Attractions.updateFestivals(w);
            Transit.pruneLines(w);
            Network.updateUtilities(w);
            if (w.day % 4 == 0) Growth.updateLand(w);
            Growth.updateBuildings(w);
            if (w.day % 2 == 0) Parking.updateParking(w);
            Growth.updateDemand(w);
            Growth.grow(w);
            Hazards.stepHazards(w);
            Economy.accrueDay(w);
            Traffic.closeDay(w, s.tr);
            if (w.day % 30 == 0) { Economy.closeMonth(w); Transit.closeTransitMonth(w); Attractions.closeMobilityMonth(w); }
            foreach (var (n, text, grant) in MILESTONES)
            {
                if (w.stats.pop < n || w.milestones.Contains(n)) continue;
                w.milestones.Add(n);
                w.money += grant;
                notify(w, $"{text} 국비 지원 {Defs.Won(grant)}만 원", "good");
            }
            Goals.checkAchievements(w);
            Special.checkSpecs(w);
            if (w.day % 15 == 0) warnings(w);
            if (w.day % 30 == 0) seasonNotice(w);
        }

        public static int calendarMonth(int day) => Calendar.calendarMonthOf(day);

        static void seasonNotice(World w)
        {
            string text = calendarMonth(w.day) switch
            {
                4 => "벚꽃이 활짝 피었어요. 강변이 분홍빛이에요.",
                7 => "장마철이에요. 여름이 시작됐어요.",
                10 => "단풍이 들기 시작했어요.",
                12 => "첫눈이 내렸어요.",
                _ => null,
            };
            if (text != null) notify(w, text, "info");
        }

        static void warnings(World w)
        {
            var st = w.stats;
            if (st.pop > 50 && st.powerSupply == 0) notify(w, "전기가 없어요. 발전소를 짓고 도로로 연결하세요.", "warn");
            else if (st.powerSupply != 0 && st.powerUse > st.powerSupply * 0.95) notify(w, "전력이 부족해서 새 건물이 더 들어오지 못해요. 발전소를 더 지으세요.", "warn");
            if (st.pop > 50 && st.waterSupply == 0) notify(w, Tools.hasOpenWater(w) ? "수돗물이 없어요. 물가에 정수장을 짓고 도로로 이어 주세요." : "수돗물이 없어요. 물가가 없는 땅이니 지하수 관정을 짓고 도로로 이어 주세요.", "warn");
            else if (st.waterSupply != 0 && st.waterUse > st.waterSupply * 0.95) notify(w, Tools.hasOpenWater(w) ? "수돗물이 부족해서 새 건물이 더 들어오지 못해요. 정수장이나 지하수 관정을 늘리세요." : "수돗물이 부족해서 새 건물이 더 들어오지 못해요. 지하수 관정을 늘리세요.", "warn");
            if (st.pop > 800 && st.sewageCap < st.waterUse * 0.8) notify(w, "하수처리 용량이 모자라요. 하수처리장을 지으세요.", "warn");
            if (st.parkDemand > 200 && st.parkUnmet > st.parkDemand * 0.25) notify(w, "주차할 곳이 모자라요. P 표시가 뜬 건물 근처에 공영주차장이나 주차타워를 지어 보세요.", "warn", st.parkWorst >= 0 ? st.parkWorst : -1, "parking");
            if (st.congestion > 0.7) notify(w, "교통 체증이 심해요. 대로를 깔거나 우회로를 만들어 보세요.", "warn");
            if (w.day % 30 == 0) foreach (var z in Diagnose.stalledZones(w)) notify(w, z.text, "warn", z.at >= 0 ? z.at : -1);
        }

        /// <summary>Advance by real time dt at speed (0 = paused).</summary>
        public static void tick(Sim s, double dt, double speed)
        {
            if (speed == 0) return;
            double t = Math.Min(0.1, dt) * speed * GAME_PACE;
            s.clock = (s.clock + (t / CLOCK_SECONDS) * 24) % 24;
            Traffic.stepTraffic(s.w, s.tr, t, s.clock);
            s.acc += t;
            int days = 0;
            while (s.acc >= DAY_SECONDS && days < 4) { s.acc -= DAY_SECONDS; stepDay(s); days++; }
        }
    }
}
