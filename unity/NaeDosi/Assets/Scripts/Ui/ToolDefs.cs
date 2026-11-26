using System.Collections.Generic;
using System.Linq;
using static NaeDosi.Defs;

namespace NaeDosi.Ui
{
    /// <summary>The dock's tools, in the order a new city needs them (ui/tools.ts).</summary>
    public sealed class ToolDef
    {
        public string id, name, price, swatch, kind, line, bus, hwyPart;
        public int road = -1, level, zone = -1;
        public bool roundabout, trees, widen, oneway;
    }

    public sealed class Category { public string id, name, key; public ToolDef[] tools; }

    public static class ToolDefs
    {
        static string won(double n) => $"{Hud.num(n)}만";
        static ToolDef fac(string kind) => new ToolDef { id = "build:" + kind, name = KINDS[kind].name, price = won(KINDS[kind].cost), kind = kind };
        static ToolDef bus(string id, string type) { var t = Transit.BUS_TYPES[type]; return new ToolDef { id = id, name = t.name, price = $"정류장당 {won(t.costStop)}", line = "bus", bus = type, swatch = t.color }; }

        public static readonly Category[] CATEGORIES =
        {
            new Category { id = "road", name = "도로", key = "Z", tools = new[] {
                new ToolDef { id = "street", name = "일반 도로", price = $"칸당 {won(ROAD_COST(Road.Street))}", road = Road.Street },
                new ToolDef { id = "avenue", name = "4차선 대로", price = $"칸당 {won(ROAD_COST(Road.Avenue))}", road = Road.Avenue },
                new ToolDef { id = "widen", name = "대로로 넓히기", price = $"칸당 {won(ROAD_COST(Road.Avenue) - ROAD_COST(Road.Street))}", widen = true },
                new ToolDef { id = "oneway", name = "일방통행", price = $"칸당 {won(Tools.ONEWAY_COST)}", oneway = true },
                new ToolDef { id = "roundabout", name = "회전교차로", price = won(Roundabouts.ROUNDABOUT_COST(Road.Street)), roundabout = true },
                new ToolDef { id = "highway", name = "고속도로", price = $"칸당 {won(ROAD_COST(Road.Highway))}", road = Road.Highway },
                new ToolDef { id = "ic", name = "나들목", price = won(IC_COST), hwyPart = "ic" },
                new ToolDef { id = "toll", name = "톨게이트", price = won(TOLL_COST), hwyPart = "toll" },
                new ToolDef { id = "trees", name = "가로수", price = $"칸당 {won(Tools.TREE_COST)}", trees = true, swatch = "#5e8f45" },
                new ToolDef { id = "elevated", name = "고가도로", price = $"칸당 {won(ROAD_COST(Road.Avenue) * LEVEL_COST(Level.Elevated))}", level = Level.Elevated },
                new ToolDef { id = "underpass", name = "지하차도", price = $"칸당 {won(ROAD_COST(Road.Avenue) * LEVEL_COST(Level.Underpass))}", level = Level.Underpass },
                new ToolDef { id = "tunnel", name = "터널", price = $"칸당 {won(ROAD_COST(Road.Avenue) * LEVEL_COST(Level.Tunnel))}", level = Level.Tunnel },
                fac("parking"), fac("parktower"),
            } },
            new Category { id = "zone", name = "구역", key = "X", tools = new[] {
                new ToolDef { id = "zoneR", name = "주거", price = "무료", zone = Zone.R, swatch = "var(--color-zone-r)" },
                new ToolDef { id = "zoneC", name = "상업", price = "무료", zone = Zone.C, swatch = "var(--color-zone-c)" },
                new ToolDef { id = "zoneI", name = "산업", price = "무료", zone = Zone.I, swatch = "var(--color-zone-i)" },
                new ToolDef { id = "dezone", name = "구역 해제", price = "무료", zone = Zone.None },
            } },
            new Category { id = "power", name = "전기", key = "C", tools = new[] { fac("coal"), fac("solar") } },
            new Category { id = "water", name = "상하수도", key = "V", tools = new[] { fac("water"), fac("well"), fac("sewage") } },
            new Category { id = "service", name = "공공", key = "B", tools = new[] { fac("school"), fac("police"), fac("fire"), fac("snowbase"), fac("clinic"), fac("office"), fac("post"), fac("library") } },
            new Category { id = "transit", name = "대중교통", key = "N", tools = new[] {
                bus("busVillage", "village"), bus("bus", "branch"), bus("busTrunk", "trunk"), bus("busExpress", "express"),
                new ToolDef { id = "metro", name = "지하철 노선", price = $"역당 {won(Transit.COST_STATION)}", line = "metro" },
                fac("bike"), fac("terminal"), fac("ktx"),
            } },
            new Category { id = "park", name = "공원", key = "M", tools = new[] { fac("park"), fac("riverpark") } },
            new Category { id = "special", name = "특화", key = "K", tools = new[] { fac("hospital"), fac("medlab"), fac("university"), fac("techpark") } },
            new Category { id = "landmark", name = "명소", key = "L", tools = new[] { fac("market"), fac("palace"), fac("tower"), fac("trailhead"), fac("jjim") } },
            new Category { id = "bulldoze", name = "철거", key = "Delete", tools = new[] { new ToolDef { id = "bulldoze", name = "철거", price = "" } } },
        };

        public static readonly Dictionary<string, ToolDef> TOOLS = CATEGORIES.SelectMany(c => c.tools).ToDictionary(t => t.id);
    }
}
