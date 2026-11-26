using System;
using System.Collections.Generic;

namespace NaeDosi
{
    /// <summary>One building type: its zone and level, footprint, people, power and water, cost and upkeep.</summary>
    public sealed class KindDef
    {
        public string name;
        public int zone;        // 0 none
        public int level;       // 0 when not a zoned tier
        public int size;
        public int residents, jobs; // 0 when none
        public bool hasResidents, hasJobs;
        public double power, water;
        public double cost; public bool hasCost;
        public double upkeep;
        public int floorsLo, floorsHi;
        public string desc;
    }

    /// <summary>
    /// Static game data: map size, zones, building types, facilities and prices (port of sim/defs.ts).
    /// Money is in 만원 (10,000 won). One cell is 10 m.
    /// </summary>
    public static class Defs
    {
        public const int N = 256;
        public const int CELL = 10;

        public static class Zone { public const int None = 0, R = 1, C = 2, I = 3; }
        public static class Road { public const int None = 0, Street = 1, Avenue = 2, Highway = 3; }
        public static class Ground { public const int Land = 0, Water = 1, Mountain = 2; }
        public static class Level { public const int None = 0, Elevated = 1, Underpass = 2, Tunnel = 3; }
        public static readonly string[] LEVEL_NAME = { "", "고가도로", "지하차도", "터널" };
        public static double LEVEL_COST(int level) => level == Level.Elevated ? 3 : level == Level.Underpass ? 4 : 6;
        public const double ELEVATED_Y = 8;
        public const double UNDER_Y = -7;

        static KindDef K(string name, int zone, int level, int size, int residents, int jobs, double power, double water, double? cost, double upkeep, int lo, int hi, string desc = null)
            => new KindDef
            {
                name = name, zone = zone, level = level, size = size, residents = residents, jobs = jobs,
                hasResidents = residents > 0, hasJobs = jobs > 0, power = power, water = water,
                cost = cost ?? 0, hasCost = cost.HasValue, upkeep = upkeep, floorsLo = lo, floorsHi = hi, desc = desc,
            };

        public static readonly Dictionary<string, KindDef> KINDS = new Dictionary<string, KindDef>
        {
            ["r1"] = K("단독주택·작은 빌라", Zone.R, 1, 1, 12, 0, 2, 2, null, 0, 2, 3),
            ["r2"] = K("빌라·저층 아파트", Zone.R, 2, 1, 32, 0, 5, 5, null, 0, 4, 6),
            ["r3"] = K("고층 아파트·주상복합", Zone.R, 3, 2, 420, 0, 45, 50, null, 0, 15, 30),
            ["c1"] = K("골목 상가", Zone.C, 1, 1, 0, 8, 3, 2, null, 0, 1, 3),
            ["c2"] = K("근린 상가 빌딩", Zone.C, 2, 1, 0, 30, 10, 5, null, 0, 5, 8),
            ["c3"] = K("오피스 타워", Zone.C, 3, 2, 0, 320, 70, 35, null, 0, 18, 34),
            ["i1"] = K("1차 산업 (농장)", Zone.I, 1, 1, 0, 14, 3, 8, null, 0, 1, 1),
            ["i2"] = K("2차 산업 (공장)", Zone.I, 2, 1, 0, 40, 22, 12, null, 0, 2, 3),
            ["i3"] = K("3차 산업 (지식·물류)", Zone.I, 3, 2, 0, 180, 60, 30, null, 0, 4, 10),
            ["coal"] = K("화력 발전소", 0, 0, 3, 0, 0, -600, 20, 9000, 300, 3, 3, "전력 600 · 주변 땅값 하락"),
            ["solar"] = K("태양광 발전소", 0, 0, 2, 0, 0, -180, 0, 3500, 90, 1, 1, "전력 180 · 깨끗함"),
            ["water"] = K("정수장", 0, 0, 3, 0, 0, 25, -700, 6000, 260, 2, 2, "수도 700 · 강, 바다, 호수 같은 물가에 지어야 함"),
            ["well"] = K("지하수 관정", 0, 0, 2, 0, 0, 12, -330, 2600, 120, 1, 1, "수도 330 · 지하수를 퍼 올려요. 물가가 없는 땅의 수원"),
            ["sewage"] = K("하수처리장", 0, 0, 2, 0, 0, 15, 0, 4000, 180, 2, 2, "하수 처리 600 · 주변 땅값 하락"),
            ["park"] = K("공원", 0, 0, 1, 0, 0, 0, 1, 300, 12, 0, 0, "주변 땅값 상승"),
            ["school"] = K("초등학교", 0, 0, 2, 0, 0, 8, 6, 4500, 220, 3, 4, "반경 내 교육 · 땅값 상승"),
            ["police"] = K("경찰서", 0, 0, 1, 0, 0, 4, 2, 2500, 150, 3, 3, "반경 내 치안"),
            ["fire"] = K("소방서", 0, 0, 1, 0, 0, 4, 3, 2500, 150, 2, 2, "반경 내 화재 안전"),
            ["snowbase"] = K("제설기지", 0, 0, 1, 0, 0, 3, 1, 2000, 80, 1, 1, "한파 때 반경 18칸 도로의 눈을 치워요 · 염화칼슘 비용은 쓴 만큼"),
            ["clinic"] = K("보건소", 0, 0, 1, 0, 0, 5, 4, 3000, 170, 3, 3, "반경 내 건강"),
            ["metro"] = K("지하철역", 0, 0, 1, 0, 0, 6, 2, null, 0, 1, 1, "역 주변 땅값 상승 (역세권)"),
            ["market"] = K("전통시장", 0, 0, 2, 0, 0, 6, 4, 3500, 110, 1, 1, "주변 상업과 땅값을 살려요"),
            ["riverpark"] = K("수변공원", 0, 0, 2, 0, 0, 1, 2, 2500, 60, 0, 0, "물가에만 지어요. 주변 땅값과 만족도가 크게 올라요"),
            ["palace"] = K("고궁", 0, 0, 3, 0, 0, 4, 4, 20000, 200, 1, 1, "도시에 하나뿐인 명소. 넓은 범위의 땅값이 올라요"),
            ["parking"] = K("공영주차장", 0, 0, 1, 0, 0, 0, 0, 600, 20, 0, 0, "차 40대 · 반경 5칸 건물의 주차난을 덜어요"),
            ["parktower"] = K("주차타워", 0, 0, 1, 0, 0, 4, 0, 2800, 70, 5, 5, "차 160대 · 좁은 땅에 많이 세워요"),
            ["office"] = K("행정복지센터", 0, 0, 1, 0, 0, 3, 2, 1800, 90, 3, 3, "반경 12칸 주민 만족도 상승 · 동네 민원 창구"),
            ["post"] = K("우체국", 0, 0, 1, 0, 0, 3, 1, 1500, 70, 2, 2, "반경 14칸 상가와 공장의 만족도 상승 · 택배와 우편"),
            ["library"] = K("공공도서관", 0, 0, 2, 0, 0, 5, 3, 3500, 130, 3, 3, "반경 8칸 교육 · 주변 땅값과 만족도 상승"),
            ["terminal"] = K("고속버스터미널", 0, 0, 3, 0, 0, 10, 6, 12000, 200, 2, 2, "대로에 붙여 지어요. 도시 밖으로 가는 사람 일부가 고속버스를 타고, 주변이 상권이 돼요"),
            ["ktx"] = K("KTX역", 0, 0, 3, 0, 0, 20, 8, 30000, 350, 2, 2, "도시에 하나. 밖으로 가는 사람이 기차를 타고, 넓은 범위가 역세권 상권이 돼요"),
            ["bike"] = K("공공자전거 대여소", 0, 0, 1, 0, 0, 0, 0, 300, 15, 0, 0, "대여소 반경 5칸끼리 가까운 거리는 자전거로 다녀요"),
            ["trailhead"] = K("등산로 입구", 0, 0, 1, 0, 0, 1, 1, 800, 20, 1, 1, "산 바로 앞에만 지어요. 둘레길과 막걸리·파전집 · 관광 수입, 주변 만족도 상승"),
            ["jjim"] = K("찜질방·목욕탕", 0, 0, 2, 0, 0, 12, 15, 4000, 0, 3, 3, "관광 수입 · 주변 만족도 상승"),
            ["hospital"] = K("종합병원", 0, 0, 2, 0, 0, 20, 15, 18000, 380, 7, 9, "의료 특화 · 반경 22칸 건강, 땅값 상승"),
            ["medlab"] = K("바이오메디컬 연구소", 0, 0, 2, 0, 0, 25, 10, 22000, 300, 4, 5, "의료 특화 · 특화 단계를 올려요"),
            ["university"] = K("대학교", 0, 0, 3, 0, 0, 20, 15, 28000, 500, 4, 6, "기술 특화 · 반경 22칸 교육, 땅값 상승"),
            ["techpark"] = K("테크노밸리", 0, 0, 2, 0, 0, 40, 10, 24000, 320, 10, 16, "기술 특화 · 특화 단계를 올려요"),
            ["tower"] = K("전망타워", 0, 0, 1, 0, 0, 0, 0, 15000, 160, 1, 1, "산 위에만 지어요. 도시 어디서나 보이는 명소예요"),
        };

        public sealed class Service { public int radius; public string key; public double value; }
        public static readonly Dictionary<string, Service> SERVICE = new Dictionary<string, Service>
        {
            ["school"] = new Service { radius = 12, key = "edu", value = 12 },
            ["police"] = new Service { radius = 14, key = "safety", value = 6 },
            ["fire"] = new Service { radius = 14, key = "fire", value = 4 },
            ["clinic"] = new Service { radius = 12, key = "health", value = 6 },
            ["hospital"] = new Service { radius = 22, key = "health", value = 14 },
            ["university"] = new Service { radius = 22, key = "edu", value = 16 },
        };

        public static readonly Dictionary<string, (int radius, double value)> LANDMARK = new Dictionary<string, (int, double)>
        {
            ["market"] = (7, 9), ["riverpark"] = (7, 16), ["palace"] = (12, 20), ["tower"] = (16, 8),
            ["office"] = (4, 4), ["post"] = (4, 3), ["library"] = (6, 7), ["terminal"] = (10, 14),
            ["ktx"] = (16, 22), ["trailhead"] = (6, 5), ["jjim"] = (6, 6), ["medlab"] = (8, 10), ["techpark"] = (10, 12),
        };
        public static readonly string[] UNIQUE = { "palace", "tower", "ktx" };

        public const double SEWAGE_CAPACITY = 600;

        public static double ROAD_COST(int t) => t == Road.Street ? 40 : t == Road.Avenue ? 110 : t == Road.Highway ? 260 : 0;
        public static double ROAD_UPKEEP(int t) => t == Road.Street ? 0.4 : t == Road.Avenue ? 1 : t == Road.Highway ? 2 : 0;
        public const double BRIDGE_MULT = 4;
        public static double ROAD_CAPACITY(int t) => t == Road.Street ? 3 : t == Road.Avenue ? 7 : t == Road.Highway ? 14 : 0;
        public static double ROAD_SPEED(int t) => t == Road.Street ? 9 : t == Road.Avenue ? 15 : t == Road.Highway ? 27 : 0;
        public const double IC_COST = 900, TOLL_COST = 1500, TOLL_FEE = 1.5;

        public const int ZONE_DEPTH = 3;
        public const double START_MONEY = 50000;
        public static readonly string[] ZONE_NAME = { "", "주거", "상업", "산업" };

        public static readonly Dictionary<string, string[]> VARIANTS = new Dictionary<string, string[]>
        {
            ["r1"] = new[] { "단독주택", "양옥집", "한옥", "작은 빌라", "작은 빌라" },
            ["r2"] = new[] { "빌라", "다세대 주택", "저층 아파트", "저층 아파트", "필로티 빌라", "필로티 아파트" },
            ["r3"] = new[] { "아파트 단지", "아파트 단지", "주상복합", "필로티 아파트 단지" },
            ["c1"] = new[] { "편의점", "치킨집", "카페", "PC방", "노래방", "부동산", "분식집" },
            ["c2"] = new[] { "근린생활 빌딩", "학원 빌딩", "병원 빌딩", "교회가 있는 빌딩" },
            ["c3"] = new[] { "오피스 타워", "오피스 타워", "대형마트" },
            ["jjim"] = new[] { "찜질방", "목욕탕" },
            ["i1"] = new[] { "비닐하우스", "논밭", "축사", "과수원" },
            ["i2"] = new[] { "제조 공장", "부품 공장", "식품 공장" },
            ["i3"] = new[] { "지식산업센터", "물류센터", "데이터센터" },
        };
        public static int variantOf(string kind, double look) => VARIANTS.TryGetValue(kind, out var v) ? (int)Math.Floor(look * v.Length) % v.Length : 0;
        public static string displayName(string kind, double look) => VARIANTS.TryGetValue(kind, out var v) ? v[variantOf(kind, look)] : KINDS[kind].name;

        /// <summary>Korean thousands separators, as toLocaleString('ko-KR') writes them.</summary>
        public static string Won(double n) => Math.Round(n).ToString("#,0", System.Globalization.CultureInfo.InvariantCulture);
    }
}
